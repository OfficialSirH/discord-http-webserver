import type { REST, RawFile } from '@discordjs/rest';
import { Blob } from 'buffer';
import {
  InteractionResponseType,
  Routes,
  type APICommandAutocompleteInteractionResponseCallbackData,
  type APIInteraction,
  type APIInteractionResponse,
  type APIInteractionResponseCallbackData,
  type APIModalInteractionResponseCallbackData,
  type Snowflake,
} from 'discord-api-types/v10';
import type { FastifyReply } from 'fastify';
import { FormDataEncoder } from 'form-data-encoder';
import { Readable } from 'stream';
import { FormData } from 'undici';
import type { Attachment } from './Attachment.js';

export class FastifyBasedAPI {
  readonly interactions: FastifyBasedInteractionsAPI;

  constructor(rest: REST) {
    this.interactions = new FastifyBasedInteractionsAPI(rest);
  }
}

export class FastifyBasedInteractionsAPI {
  constructor(readonly rest: REST) {}

  async resolveData(
    callbackData: Omit<
      Extract<
        APIInteractionResponse,
        { type: InteractionResponseType.ChannelMessageWithSource | InteractionResponseType.UpdateMessage }
      >,
      'data'
    > & { files?: Attachment[]; data?: APIInteractionResponseCallbackData },
  ) {
    const responseData = { ...callbackData } as Extract<
      APIInteractionResponse,
      { type: InteractionResponseType.ChannelMessageWithSource | InteractionResponseType.UpdateMessage }
    > & { data?: { files?: Attachment[] } };

    if (responseData.data) {
      if (!responseData.data?.allowed_mentions) responseData.data.allowed_mentions = { parse: [] };
    }

    if (responseData.data?.files?.length) {
      const form = new FormData();
      for (const [index, file] of responseData.data.files.entries()) {
        form.append(`files[${index}]`, new Blob([(await file.data()).unwrap()]), file.name);
      }

      if (responseData.data) {
        responseData.data.attachments = responseData.data.files.map((file, index) => ({
          id: index.toString(),
          filename: file.name,
        }));

        delete responseData.data.files;

        form.append('payload_json', JSON.stringify(responseData));
      }

      return form;
    }
    return responseData;
  }

  async reply(
    res: FastifyReply,
    data: APIInteractionResponseCallbackData & {
      files?: Attachment[];
    },
  ) {
    const resolvedData = await this.resolveData({ data, type: InteractionResponseType.ChannelMessageWithSource });
    if (resolvedData instanceof FormData) {
      const encoder = new FormDataEncoder(resolvedData);
      await res.headers(encoder.headers).header('Connection', 'keep-alive').send(Readable.from(encoder.encode()));
    } else await res.send(resolvedData);
  }

  async deferReply(res: FastifyReply, data?: Pick<APIInteractionResponseCallbackData, 'flags'>) {
    await res.header('Connection', 'keep-alive').send({
      type: InteractionResponseType.DeferredChannelMessageWithSource,
      data,
    });
  }

  async deferMessageUpdate(res: FastifyReply) {
    await res.header('Connection', 'keep-alive').send({
      type: InteractionResponseType.DeferredMessageUpdate,
    });
  }

  async followUp(interaction: APIInteraction, data: APIInteractionResponseCallbackData & { files?: RawFile[] }) {
    await this.rest.post(Routes.webhook(interaction.application_id, interaction.token), data);
  }

  async editReply(
    interaction: APIInteraction,
    data: APIInteractionResponseCallbackData & { files?: RawFile[] },
    messageId: Snowflake = '@original',
  ) {
    await this.rest.patch(Routes.webhookMessage(interaction.application_id, interaction.token, messageId), data);
  }

  async getOriginalReply(interaction: APIInteraction) {
    return this.rest.get(Routes.webhookMessage(interaction.application_id, interaction.token, '@original'));
  }

  async deleteReply(interaction: APIInteraction, messageId: Snowflake = '@original') {
    await this.rest.delete(Routes.webhookMessage(interaction.application_id, interaction.token, messageId));
  }

  async updateMessage(
    res: FastifyReply,
    data: APIInteractionResponseCallbackData & {
      files?: Attachment[];
    },
  ) {
    const resolvedData = await this.resolveData({ data, type: InteractionResponseType.UpdateMessage });
    if (resolvedData instanceof FormData) {
      const encoder = new FormDataEncoder(resolvedData);
      await res.headers(encoder.headers).header('Connection', 'keep-alive').send(Readable.from(encoder.encode()));
    } else await res.send(resolvedData);
  }

  async autocomplete(res: FastifyReply, choices: APICommandAutocompleteInteractionResponseCallbackData['choices']) {
    await res.header('Connection', 'keep-alive').send({
      type: InteractionResponseType.ApplicationCommandAutocompleteResult,
      data: {
        choices,
      },
    });
  }

  async createModal(res: FastifyReply, data: APIModalInteractionResponseCallbackData) {
    await res.header('Connection', 'keep-alive').send({
      type: InteractionResponseType.Modal,
      data,
    });
  }
}
