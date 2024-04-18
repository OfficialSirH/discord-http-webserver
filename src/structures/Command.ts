import {
  ApplicationCommandType,
  InteractionType,
  type APIApplicationCommandAutocompleteInteraction,
  type APIApplicationCommandInteraction,
  type APIChatInputApplicationCommandInteraction,
  type APIContextMenuInteraction,
  type APIInteraction,
  type APIInteractionResponseCallbackData,
  type APIMessageComponentInteraction,
  type APIModalSubmitInteraction,
  type RESTPostAPIApplicationCommandsJSONBody,
  type Snowflake,
} from '@discordjs/core';
import { Result } from '@sapphire/result';
import type { FastifyReply } from 'fastify';
import {
  componentInteractionDefaultParser,
  type ComponentInteractionDefaultParserOptions,
  type ParsedCustomIdData,
} from '../components.js';
import type { Awaitable } from '../utilities.js';
import type { Attachment } from './Attachment.js';
import type { Client } from './Client.js';
import { InteractionOptionResolver } from './InteractionOptionResolver.js';

export abstract class Command {
  public readonly name: string;
  public readonly description: string;
  public readonly category?: string;
  public readonly subCategory?: string;
  public readonly preconditions: string[];
  public readonly componentParseOptions?: ComponentInteractionDefaultParserOptions & { permissionLevel?: number };

  public constructor(
    public readonly client: Command.Requirement,
    options: {
      name: string;
      description: string;
      fullCategory?: [string, string?];
      preconditions?: string[];
      componentParseOptions?: ComponentInteractionDefaultParserOptions & { permissionLevel?: number };
    },
  ) {
    this.name = options.name;
    this.description = options.description;
    if (options.fullCategory) [this.category, this.subCategory] = options.fullCategory as [string, string];
    this.preconditions = options.preconditions ?? [];
    if (options.componentParseOptions) this.componentParseOptions = options.componentParseOptions;
  }

  // a method named preRun that is used for executing preconditions then if the precondition succeeds, run the corresponding run method
  /**
   * method for executing preconditions then if the precondition succeeds, run the corresponding run method
   * @param reply fastify's reply object for responding to Discord's interaction requests
   * @param interaction the interaction that triggered the command
   * @example
   * ```typescript
   * public override async preRun(reply: FastifyReply, interaction: APIChatInputApplicationCommandInteraction) {
   *  const result = await this.client.preconditions.run(this.preconditions, interaction);
   *  if (result.ok) {
   *   await this.chatInputRun(reply, interaction);
   *  } else {
   *   await this.client.api.interactions.reply(reply, {
   *    content: result.message,
   *    flags: MessageFlags.Ephemeral,
   *   });
   *  }
   * }
   * ```
   */
  public async preRun(
    reply: FastifyReply,
    interaction: APIApplicationCommandInteraction | APIApplicationCommandAutocompleteInteraction,
  ): Promise<Result<unknown, string>> {
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      const optionsResolver = new InteractionOptionResolver(interaction);

      return (
        this.autocompleteRun?.(reply, interaction as APIApplicationCommandAutocompleteInteraction, optionsResolver) ??
        Result.err('This command does not implement the autocomplete method')
      );
    }

    const preconditionsTest = this.client.cache.handles.preconditions
      .filter(pre => this.preconditions.includes(pre.name))
      .map(pre =>
        interaction.data.type === ApplicationCommandType.ChatInput
          ? pre.chatInputRun?.(interaction as APIChatInputApplicationCommandInteraction)
          : pre.contextMenuRun?.(interaction as APIContextMenuInteraction),
      );

    for (const result of preconditionsTest) {
      if (!result) continue;
      if (result.isErr()) return result;
    }

    const optionsResolver = new InteractionOptionResolver(interaction as APIChatInputApplicationCommandInteraction);

    switch (interaction.data.type) {
      case ApplicationCommandType.ChatInput: {
        const result = await this.chatInputRun?.(
          reply,
          interaction as APIChatInputApplicationCommandInteraction,
          optionsResolver,
        );
        return result ?? Result.err('This command does not implement the chatInputRun method');
      }
      case ApplicationCommandType.User:
      case ApplicationCommandType.Message: {
        const result = await this.contextMenuRun?.(reply, interaction as APIContextMenuInteraction, optionsResolver);
        return result ?? Result.err('This command does not implement the contextMenuRun method');
      }
    }
  }

  /**
   * run method for slash commands
   * @param reply fastify's reply object for responding to Discord's interaction requests
   * @param interaction the interaction that triggered the command
   * @example
   * ```typescript
   * public override async chatInputRun(reply: FastifyReply, interaction: APIChatInputApplicationCommandInteraction) {
   *  await this.client.api.interactions.reply(reply, {
   *   content: 'Hello, world!',
   *   flags: 64,
   *  });
   * }
   * ```
   */
  public chatInputRun?(
    reply: FastifyReply,
    interaction: APIChatInputApplicationCommandInteraction,
    options: InteractionOptionResolver,
  ): Awaitable<Result<unknown, string>>;

  /**
   * run method for context menus
   * @param reply fastify's reply object for responding to Discord's interaction requests
   * @param interaction the interaction that triggered the command
   * @example
   * ```typescript
   * public override async contextMenuRun(reply: FastifyReply, interaction: APIContextMenuInteraction) {
   *  await this.client.api.interactions.reply(reply, {
   *   content: 'Hello, world! the target id is ' + interaction.data.target_id,
   *   flags: 64,
   *  });
   * }
   * ```
   */
  public contextMenuRun?(
    reply: FastifyReply,
    interaction: APIContextMenuInteraction,
    options: InteractionOptionResolver,
  ): Awaitable<Result<unknown, string>>;

  /**
   * run method for message components
   * @param reply fastify's reply object for responding to Discord's interaction requests
   * @param interaction the interaction that triggered the command
   * @example
   * ```typescript
   * public override async componentRun(reply: FastifyReply, interaction: APIMessageComponentInteraction) {
   *  await this.client.api.interactions.updateMessage(reply, {
   *    content: 'Hello, world! the custom id is ' + interaction.data.custom_id,
   *    flags: 64,
   *  });
   * }
   * ```
   */
  public componentRun?(
    reply: FastifyReply,
    interaction: APIMessageComponentInteraction,
    customData: ParsedCustomIdData,
  ): Awaitable<Result<unknown, string>>;

  /**
   * run method for autocomplete commands
   * @param reply fastify's reply object for responding to Discord's interaction requests
   * @param interaction the interaction that triggered the command
   * @example
   * ```typescript
   * public override async autocompleteRun(reply: FastifyReply, interaction: APIChatInputApplicationCommandInteraction) {
   * await this.client.api.interactions.autocomplete(reply, {
   *  choices: [
   *   {
   *    name: 'Hello',
   *    value: 'Hello',
   *   },
   *   {
   *    name: 'World',
   *    value: 'World',
   *   },
   *  ],
   * });
   * ```
   */
  public autocompleteRun?(
    reply: FastifyReply,
    interaction: APIApplicationCommandAutocompleteInteraction,
    options: InteractionOptionResolver,
  ): Awaitable<Result<unknown, string>>;

  /**
   * run method for modal commands
   * @param reply fastify's reply object for responding to Discord's interaction requests
   * @param interaction the interaction that triggered the command
   * @example
   * ```typescript
   * public override async modalRun(reply: FastifyReply, interaction: APIChatInputApplicationCommandInteraction) {
   * await this.client.api.interactions.createModal(reply, {
   *  title: 'Hello, world!',
   *  custom_id: 'hello-world',
   *  components: [
   *   {
   *    type: ComponentType.ActionRow,
   *    components: [
   *     {
   *      type: ComponentType.TextInput,
   *      custom_id: 'text-input',
   *      style: TextInputStyle.Short,
   *      label: 'Hello, world!',
   *      placeholder: 'Hello, world!',
   *      min_length: 1,
   *      max_length: 2000,
   *      required: false,
   *      value: 'Hello, world!',
   *     },
   *    ],
   *   },
   *  ],
   * });
   * ```
   */
  public modalRun?(reply: FastifyReply, interaction: APIModalSubmitInteraction): Awaitable<Result<unknown, string>>;

  /**
   * run method for returning sendable data for slash commands
   * useful for building minicommands (particularly commands that aren't called by usual command means) within a command
   * @param interaction the interaction that triggered the command
   * @example
   * ```typescript
   * public override async templateRun(interaction: APIChatInputApplicationCommandInteraction) {
   *  return {
   *   content: 'Hello, world!',
   *   flags: MessageFlags.Ephemeral,
   *  };
   * }
   * ```
   */
  public templateRun?(interaction: APIInteraction): Awaitable<
    APIInteractionResponseCallbackData & {
      files?: Attachment[];
    }
  >;

  /**
   * application command structure
   * @example
   * ```typescript
   * public override get data() {
   *  return {
   *   command: {
   *    name: 'hello-world',
   *    description: 'Hello, world!',
   *    options: [
   *     {
   *      name: 'hello',
   *      description: 'Hello, world!',
   *      type: ApplicationCommandOptionType.String,
   *      required: true,
   *     },
   *    ],
   *   },
   *  };
   * }
   * ```
   */
  public data?(): Awaitable<{ command: RESTPostAPIApplicationCommandsJSONBody; guildIds?: Snowflake[] }>;

  /**
   * component preparser that runs before the component run method, checks if the component is valid, and returns the custom data
   * @param interaction the interaction that triggered the command
   * @example
   * ```typescript
   * public override async componentPreparser(interaction: APIMessageComponentInteraction) {
   *  if (interaction.data.custom_id === 'hello-world')
   *   return {
   *    action: 'hello-world',
   *    id: interaction.user.id,
   *    command: 'hello-world',
   *   };
   * }
   * ```
   */
  public componentPreparser(
    interaction: APIMessageComponentInteraction,
  ): Awaitable<Result<ParsedCustomIdData, string>> {
    if (this.client.customGlobalComponentPreparser) return this.client.customGlobalComponentPreparser(interaction);

    return componentInteractionDefaultParser(interaction, { ...this.componentParseOptions });
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Command {
  export type Requirement = Client;
}
