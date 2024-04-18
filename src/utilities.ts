import { Result } from '@sapphire/result';
import { readFile } from 'node:fs/promises';

export type Awaitable<T> = PromiseLike<T> | T;

export enum LogLevel {
  Log = 'Log',
  Error = 'Error',
  Warning = 'Warn',
  Info = 'Info',
  Debug = 'Debug',
  Trace = 'Trace',
  Fatal = 'Fatal',
}

export const resolveFile = (path: string) => Result.fromAsync(readFile(path));
