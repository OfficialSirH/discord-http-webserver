import type { APIApplicationCommandInteractionDataOption, ApplicationCommandOptionType } from 'discord-api-types/v10';

export class InteractionOption {
  public readonly name: string;
  public readonly value: string | number | boolean | null;
  public readonly type: ApplicationCommandOptionType;
  public readonly focused: boolean;

  public constructor(data: APIApplicationCommandInteractionDataOption) {
    this.name = data.name;
    this.value =
      (data as APIApplicationCommandInteractionDataOption & { value: string | number | boolean }).value ?? null;
    this.type = data.type;
    this.focused = (data as APIApplicationCommandInteractionDataOption & { focused: boolean }).focused ?? null;
  }
}
