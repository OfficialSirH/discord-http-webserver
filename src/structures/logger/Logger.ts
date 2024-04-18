import { LogLevel } from '../../utilities.js';
import { BaseLogger } from './BaseLogger.js';

export class Logger extends BaseLogger {
  private formatMessage(message: string, level: LogLevel) {
    return `[${new Date().toISOString()}] [${level}] ${message}`;
  }

  public log(message: string) {
    console.log(this.formatMessage(message, LogLevel.Log));
  }

  public error(message: string) {
    console.error(this.formatMessage(message, LogLevel.Error));
  }

  public warn(message: string) {
    console.warn(this.formatMessage(message, LogLevel.Warning));
  }

  public info(message: string) {
    console.info(this.formatMessage(message, LogLevel.Info));
  }

  public debug(message: string) {
    console.debug(this.formatMessage(message, LogLevel.Debug));
  }

  public trace(message: string) {
    console.trace(this.formatMessage(message, LogLevel.Trace));
  }

  public fatal(message: string) {
    console.error(this.formatMessage(message, LogLevel.Fatal));
  }
}
