export abstract class BaseLogger {
  public abstract log(message: string): void;

  public abstract error(message: string): void;

  public abstract warn(message: string): void;

  public abstract info(message: string): void;

  public abstract debug(message: string): void;

  public abstract trace(message: string): void;

  public abstract fatal(message: string): void;
}
