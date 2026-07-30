export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

export class Logger {
  private static minLevel: LogLevel = LogLevel.DEBUG;
  private prefix: string;

  constructor(context: string) {
    this.prefix = `[BladeBedlam::${context}]`;
  }

  public static setMinLevel(level: LogLevel): void {
    Logger.minLevel = level;
  }

  private formatMessage(message: string): string {
    const timestamp = new Date().toISOString();
    return `${timestamp} ${this.prefix} ${message}`;
  }

  public debug(message: string, ...extra: unknown[]): void {
    if (Logger.minLevel <= LogLevel.DEBUG) {
      console.debug(this.formatMessage(message), ...extra);
    }
  }

  public info(message: string, ...extra: unknown[]): void {
    if (Logger.minLevel <= LogLevel.INFO) {
      console.log(this.formatMessage(message), ...extra);
    }
  }

  public warn(message: string, ...extra: unknown[]): void {
    if (Logger.minLevel <= LogLevel.WARN) {
      console.warn(this.formatMessage(message), ...extra);
    }
  }

  public error(message: string, ...extra: unknown[]): void {
    if (Logger.minLevel <= LogLevel.ERROR) {
      console.error(this.formatMessage(message), ...extra);
    }
  }
}
