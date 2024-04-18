import type { APIChatInputApplicationCommandInteraction, APIContextMenuInteraction } from '@discordjs/core';
import { Result } from '@sapphire/result';
import type { Client } from './Client.js';

export class Precondition {
  public readonly name: string;

  public constructor(
    public readonly client: Precondition.Requirement,
    options: { name: string },
  ) {
    this.name = options.name;
  }

  /**
   * method for checking if a slash command meets the precondition
   * @param interaction the interaction that triggered the command
   * @example
   * ```typescript
   * public override async chatInputRun(interaction: APIChatInputApplicationCommandInteraction) {
   *  return interaction.data.options[0].value === 'hello world';
   * }
   * ```
   * @returns true if the precondition is met, false if not
   */
  public chatInputRun?(interaction: APIChatInputApplicationCommandInteraction): Result<boolean, string>;

  /**
   * method for checking if a context menu meets the precondition
   * @param interaction the interaction that triggered the command
   * @example
   * ```typescript
   * public override async contextMenuRun(interaction: APIContextMenuInteraction) {
   *  return interaction.data.target_id === '1234567890';
   * }
   * ```
   * @returns true if the precondition is met, false if not
   */
  public contextMenuRun?(interaction: APIContextMenuInteraction): Result<boolean, string>;

  /**
   * method for declaring a precondition as ok
   * @example
   * ```typescript
   * public override async chatInputRun(interaction: APIChatInputApplicationCommandInteraction) {
   *  return this.ok();
   * }
   * ```
   * @returns ok result
   */
  public ok(): Result<unknown, never> {
    return Result.ok();
  }

  /**
   * method for declaring a precondition as not ok
   * @param message the message to be returned to the user
   * @example
   * ```typescript
   * public override async chatInputRun(interaction: APIChatInputApplicationCommandInteraction) {
   *  return this.error('You do not have permission to use this command!');
   * }
   * ```
   * @returns error result with a message
   */
  public error(message: string): Result<never, string> {
    return Result.err(message);
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace Precondition {
  export type Requirement = Client;
}
