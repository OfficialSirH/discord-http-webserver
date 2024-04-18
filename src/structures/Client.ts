import { Collection } from '@discordjs/collection';
import {
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  Routes,
  type APIApplicationCommand,
  type APIChatInputApplicationCommandInteraction,
  type APIContextMenuInteraction,
  type APIInteraction,
  type APIMessageComponentInteraction,
  type Snowflake,
} from '@discordjs/core';
import { REST } from '@discordjs/rest';
import type { Result } from '@sapphire/result';
import fastify, { type FastifyInstance } from 'fastify';
import { readdir } from 'fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import nacl from 'tweetnacl';
import type { CustomIdData, ParsedCustomIdData } from '../components.js';
import type { Awaitable } from '../utilities.js';
import type { Command } from './Command.js';
import { FastifyBasedAPI } from './DiscordAPI.js';
import type { Precondition } from './Precondition.js';
import { Logger } from './logger/Logger.js';

export class Client {
  public readonly cache = {
    data: {
      applicationCommands: new Collection<Snowflake, APIApplicationCommand>(),
    },
    handles: {
      commands: new Collection<Snowflake, Command>(),
      preconditions: new Collection<string, Precondition>(),
    },
  };

  public readonly rest: REST;
  public readonly api: FastifyBasedAPI;
  public readonly logger: Logger;
  public readonly server: FastifyInstance;
  public readonly route: string;

  /**
   * the client for interacting with HTTP Interactions
   * @param token application token
   * @param applicationId application id
   * @param publicKey application public key
   * @param options customizable options (route defaults to '/interactions' and server defaults to a new fastify server)
   */
  public constructor(
    token: string,
    public readonly applicationId: Snowflake,
    public readonly publicKey: string,
    public readonly port = Number(process.env.PORT) || 3000,
    {
      server = fastify(),
      route = '/interactions',
      logger = new Logger(),
      rest = new REST({ version: '10' }),
    }: { server: FastifyInstance; route: string; logger: Logger; rest: REST } = {
      server: fastify(),
      route: '/interactions',
      logger: new Logger(),
      rest: new REST({ version: '10' }),
    },
  ) {
    this.server = server;
    this.route = route;
    this.logger = logger;
    this.rest = rest;
    this.rest.setToken(token);
    this.api = new FastifyBasedAPI(this.rest);
  }

  public customGlobalComponentPreparser?: (
    interaction: APIMessageComponentInteraction,
  ) => Awaitable<Result<ParsedCustomIdData, string>>;

  public setGlobalComponentPreparser(
    parser: (interaction: APIMessageComponentInteraction) => Awaitable<Result<ParsedCustomIdData, string>>,
  ) {
    this.customGlobalComponentPreparser = parser;
  }

  /**
   * logs the client in, loading all commands and preconditions.
   *
   * calls {@link Client.loadCommands}, {@link Client.loadPreconditions}, and {@link Client.loadRouter}
   *
   * `loadCommands` reads the commands folder and retrieves all of the command categories(folders) and command files
   *
   * `loadPreconditions` reads the preconditions folder and retrieves all of the precondition files
   *
   * `loadRouter` sets up the fastify server and listens on the port
   */
  async login() {
    await this.loadCommands();
    await this.loadPreconditions();
    await this.loadRouter();
  }

  async loadRouter() {
    this.server.route<{ Body: APIInteraction }>({
      url: this.route,
      method: 'POST',
      preHandler: async (req, res) => {
        const signature = String(req.headers['x-signature-ed25519']);
        const timestamp = String(req.headers['x-signature-timestamp']);
        const body = JSON.stringify(req.body);

        const isValid = nacl.sign.detached.verify(
          Buffer.from(timestamp + body),
          Buffer.from(signature, 'hex'),
          Buffer.from(this.publicKey, 'hex'),
        );

        if (!isValid) return res.status(401).send('Invalid request signature');
      },
      handler: async (req, rep) => {
        const interaction = req.body;

        if (interaction.type === InteractionType.Ping) return rep.send({ type: InteractionResponseType.Pong });

        switch (interaction.type) {
          case InteractionType.ApplicationCommand:
            switch (interaction.data.type) {
              case ApplicationCommandType.ChatInput:
                await this.cache.handles.commands
                  .get(interaction?.data.name)
                  ?.preRun?.(rep, interaction as APIChatInputApplicationCommandInteraction)
                  .catch(e => {
                    this.logger.error(`command '${interaction.data.name}' errored: ${e}`);
                    this.api.interactions.reply(rep, { content: e, flags: MessageFlags.Ephemeral });
                  });
                break;

              case ApplicationCommandType.User:
              case ApplicationCommandType.Message:
                await this.cache.handles.commands
                  .get(interaction?.data.name)
                  ?.preRun?.(rep, interaction as APIContextMenuInteraction)
                  .catch(e => {
                    this.logger.error(`command '${interaction.data.name}' errored: ${e}`);
                    this.api.interactions.reply(rep, { content: e, flags: MessageFlags.Ephemeral });
                  });
            }
            break;

          case InteractionType.MessageComponent: {
            const parsedCustomId: CustomIdData = JSON.parse(interaction?.data.custom_id);
            const preParseStep = (
              await this.cache.handles.commands.get(parsedCustomId.command)?.componentPreparser?.(interaction)
            )?.inspectErr(err => {
              this.logger.error(
                `component with custom id of '${interaction.data.custom_id}' errored at pre-parsing: ${err}`,
              );
              this.api.interactions.reply(rep, { content: err, flags: MessageFlags.Ephemeral });
            });

            if (!preParseStep) return rep.status(400).send('Invalid interaction');
            if (!preParseStep.ok()) break;
            (
              await this.cache.handles.commands
                .get(parsedCustomId.command)
                ?.componentRun?.(rep, interaction, preParseStep.unwrap())
            )?.inspectErr(err => {
              this.logger.error(`component with custom id of '${interaction.data.custom_id}' errored: ${err}`);
              this.api.interactions.reply(rep, { content: err, flags: MessageFlags.Ephemeral });
            });
            break;
          }

          case InteractionType.ApplicationCommandAutocomplete: {
            (await this.cache.handles.commands.get(interaction?.data.name)?.preRun?.(rep, interaction))?.inspectErr(
              err => {
                this.logger.error(`autocomplete for command '${interaction.data.name}' errored: ${err}`);
                this.api.interactions.reply(rep, { content: err, flags: MessageFlags.Ephemeral });
              },
            );
            break;
          }

          case InteractionType.ModalSubmit: {
            const parsedCustomId: CustomIdData = JSON.parse(interaction?.data.custom_id);
            (await this.cache.handles.commands.get(parsedCustomId.command)?.modalRun?.(rep, interaction))?.inspectErr(
              e => {
                this.logger.error(`modal submission with custom id of '${interaction.data.custom_id}' errored: ${e}`);
                this.api.interactions.reply(rep, { content: e, flags: MessageFlags.Ephemeral });
              },
            );
            break;
          }

          default:
            return rep.status(400).send('Unknown interaction type');
        }
      },
    });

    await this.server.listen({ port: this.port, host: '0.0.0.0' });
  }

  async loadCommands() {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const commandFiles = (
      await Promise.all(
        // read the commands folder, retrieving all of the command categories(folders)
        (await readdir(pathToFileURL(join(__dirname, '..', 'commands')))).map(async folder => {
          // read the command category folder, retrieving all of the command files
          const recursivelyCheckedfolders = await Promise.all(
            (await readdir(pathToFileURL(join(__dirname, '..', 'commands', folder)))).map(async fileOrFolder => {
              // if the fileOrFolder is a folder, read the folder, retrieving all of the command files within the subcategory
              if (!fileOrFolder.includes('.'))
                return (await readdir(pathToFileURL(join(__dirname, '..', 'commands', folder, fileOrFolder))))
                  .filter(file => file.endsWith('.js'))
                  .map(file => join(folder, fileOrFolder, file));
              return fileOrFolder;
            }),
          );

          // join the command files with the command category folder and don't touch the subcategory folders
          // flatten the array of subcategory folders and command files
          return recursivelyCheckedfolders
            .filter(file => Array.isArray(file) || file.endsWith('.js'))
            .map(file => (Array.isArray(file) ? file : join(folder, file)))
            .flat();
        }),
      )
    ).flat();

    for (const file of commandFiles) {
      const command = new (await import(pathToFileURL(join(__dirname, '..', 'commands', file)).toString())).default(
        this,
      ) as Command;
      this.cache.handles.commands.set(command.name, command);
    }
  }

  async loadPreconditions() {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const preconditionFiles = (await readdir(pathToFileURL(join(__dirname, '..', 'preconditions')))).filter(file =>
      file.endsWith('.js'),
    );

    for (const file of preconditionFiles) {
      const precondition = new (
        await import(pathToFileURL(join(__dirname, '..', 'preconditions', file)).toString())
      ).default(this) as Precondition;
      this.cache.handles.preconditions.set(precondition.name, precondition);
    }
  }

  async deployCommands() {
    // dm_permission is set to false by default
    const globalCommands = (
      await Promise.all(
        this.cache.handles.commands.filter(command => 'data' in command).map(async command => command.data?.()),
      )
    )
      .filter(data => !data?.guildIds)
      .map(command => ({ dm_permission: false, ...command?.command })) as APIApplicationCommand[];

    await this.rest.put(Routes.applicationCommands(this.applicationId), {
      body: globalCommands,
    });

    const guildCommands = (
      await Promise.all(
        this.cache.handles.commands.filter(command => 'data' in command).map(async command => command.data?.()),
      )
    ).filter(data => data?.guildIds);

    const guildIds = [...new Set(guildCommands.map(command => command!.guildIds!).flat())];
    for (const guildId of guildIds) {
      await this.rest.put(Routes.applicationGuildCommands(this.applicationId, guildId), {
        body: guildCommands
          .filter(command => command?.guildIds?.includes(guildId))
          .map(command => ({ ...command?.command, dm_permission: false })) as APIApplicationCommand[],
      });
    }
  }
}
