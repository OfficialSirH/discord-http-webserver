import {
  ApplicationCommandType,
  InteractionResponseType,
  InteractionType,
  MessageFlags,
  type APIChatInputApplicationCommandInteraction,
  type APIContextMenuInteraction,
  type APIInteraction,
} from '@discordjs/core';
import type { CustomIdData } from '../src/components';
import type { Client } from '../src/structures/Client';

export const loadTestRouter = async (client: Client) => {
  client.server.route<{ Body: APIInteraction }>({
    url: '/interactions',
    method: 'POST',
    handler: async (req, rep) => {
      const interaction = req.body;

      if (interaction.type === InteractionType.Ping) return rep.send({ type: InteractionResponseType.Pong });

      switch (interaction.type) {
        case InteractionType.ApplicationCommand:
          switch (interaction.data.type) {
            case ApplicationCommandType.ChatInput:
              await client.cache.handles.commands
                .get(interaction?.data.name)
                ?.preRun?.(rep, interaction as APIChatInputApplicationCommandInteraction)
                .catch(e => {
                  client.api.interactions.reply(rep, { content: e, flags: MessageFlags.Ephemeral });
                });
              break;

            case ApplicationCommandType.User:
            case ApplicationCommandType.Message:
              await client.cache.handles.commands
                .get(interaction?.data.name)
                ?.preRun?.(rep, interaction as APIContextMenuInteraction)
                .catch(e => {
                  client.api.interactions.reply(rep, { content: e, flags: MessageFlags.Ephemeral });
                });
          }
          break;

        case InteractionType.MessageComponent: {
          const parsedCustomId: CustomIdData = JSON.parse(interaction?.data.custom_id);
          const preParseStep = (
            await client.cache.handles.commands.get(parsedCustomId.command)?.componentPreparser?.(interaction)
          )?.inspectErr(err => {
            client.api.interactions.reply(rep, { content: err, flags: MessageFlags.Ephemeral });
          });

          if (!preParseStep) return rep.status(400).send('Invalid interaction');
          if (!preParseStep.ok()) break;
          (
            await client.cache.handles.commands
              .get(parsedCustomId.command)
              ?.componentRun?.(rep, interaction, preParseStep.unwrap())
          )?.inspectErr(err => {
            client.api.interactions.reply(rep, { content: err, flags: MessageFlags.Ephemeral });
          });
          break;
        }

        case InteractionType.ApplicationCommandAutocomplete: {
          (await client.cache.handles.commands.get(interaction?.data.name)?.preRun?.(rep, interaction))?.inspectErr(
            err => {
              client.api.interactions.reply(rep, { content: err, flags: MessageFlags.Ephemeral });
            },
          );
          break;
        }

        case InteractionType.ModalSubmit: {
          const parsedCustomId: CustomIdData = JSON.parse(interaction?.data.custom_id);
          (await client.cache.handles.commands.get(parsedCustomId.command)?.modalRun?.(rep, interaction))?.inspectErr(
            e => {
              client.api.interactions.reply(rep, { content: e, flags: MessageFlags.Ephemeral });
            },
          );
          break;
        }

        default:
          return rep.status(400).send('Unknown interaction type');
      }
    },
  });

  await client.server.listen({ port: 3000, host: '0.0.0.0' });
};
