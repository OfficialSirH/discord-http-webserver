import { type APIMessageComponentInteraction, type Snowflake } from '@discordjs/core';
import { Result } from '@sapphire/result';

/**
 * The base interface for interacting with the default parsed data.
 */
export interface CustomIdData {
  command: string;
  action: string;
  id: Snowflake;
}
/**
 * interface for parsed custom id data to customize the action type and add more properties
 * @template Action the action type
 * @template NewData the new data type
 * ```ts
 * interface MyCustomIdData extends CustomIdData {
 *  myProperty: string;
 * }
 * type ParsedMyCustomIdData = ParsedCustomIdData<'myAction', MyCustomIdData>;
 *
 * const data: ParsedMyCustomIdData = {
 *  action: 'myAction',
 *  id: '1234567890',
 *  myProperty: 'myValue'
 * }
 * ```
 */
export type ParsedCustomIdData<Action extends string = string, NewData extends CustomIdData = CustomIdData> = Omit<
  NewData,
  'command' | 'action'
> & {
  action: Action;
};

/**
 * The options for the component interaction default parser.
 */
export type ComponentInteractionDefaultParserOptions<T extends CustomIdData = CustomIdData> = {
  /**
   * Whether or not the interaction handler should allow other users to interact with its components.
   */
  allowOthers?: boolean;
  /**
   * An object containing extra properties that are parsed from the custom_id.
   */
  extraProps?: Record<keyof Omit<T, keyof CustomIdData>, 'number' | 'string'>;
};

/**
 * The default custom_id parser for the component interaction handler.
 * @param {APIMessageComponentGuildInteraction} interaction The interaction that is being parsed.
 * @param {...ComponentInteractionDefaultParserOptions} options The options for the parser.
 * @description The parser can be set to only allow the command caller to interact with its components and extra fields can be added for special cases.
 */
export const componentInteractionDefaultParser = <T extends CustomIdData = CustomIdData>(
  interaction: APIMessageComponentInteraction,
  {
    allowOthers = false,
    extraProps = {} as ComponentInteractionDefaultParserOptions<T>['extraProps'],
  }: ComponentInteractionDefaultParserOptions<T> = {
    allowOthers: false,
    extraProps: {} as Exclude<ComponentInteractionDefaultParserOptions<T>['extraProps'], undefined>,
  },
): Result<ParsedCustomIdData, string> => {
  const data: T = JSON.parse(interaction.data.custom_id);
  if (typeof data.action != 'string' || typeof data.command != 'string' || typeof data.id != 'string')
    return Result.err('invalid custom_id');
  if (extraProps)
    for (const prop of Object.keys(extraProps)) {
      if (typeof data[prop as keyof CustomIdData] != extraProps[prop as keyof typeof extraProps])
        return Result.err('invalid custom_id');
    }

  if (!allowOthers && data.id != interaction.member?.user.id)
    return Result.err("this button originates from a message that wasn't triggered by you.");

  const finalizedData = {
    action: data.action,
    id: data.id,
  };
  if (extraProps)
    for (const prop of Object.keys(extraProps)) {
      finalizedData[prop as keyof typeof finalizedData] = data[prop as keyof CustomIdData];
    }
  return Result.ok(finalizedData);
};

export const buildCustomId = <T extends CustomIdData | (CustomIdData & Record<string, unknown>) = CustomIdData>(
  customIdOptions: T,
) => JSON.stringify(customIdOptions);
