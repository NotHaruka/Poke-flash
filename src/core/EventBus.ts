import Phaser from 'phaser';
import { Logger } from '../utils/Logger.js';

export class EventBus {
  private static instance: EventBus | null = null;
  private emitter: Phaser.Events.EventEmitter;
  private logger: Logger;

  private constructor() {
    this.emitter = new Phaser.Events.EventEmitter();
    this.logger = new Logger('EventBus');
  }

  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  public emit(event: string, ...args: unknown[]): void {
    this.logger.debug(`Emit: ${event} (arguments count: ${args.length})`);
    this.emitter.emit(event, ...args);
  }

  public on(event: string, fn: (...args: any[]) => void, context?: unknown): void {
    this.emitter.on(event, fn, context);
  }

  public off(event: string, fn: (...args: any[]) => void, context?: unknown): void {
    this.emitter.off(event, fn, context);
  }

  public once(event: string, fn: (...args: any[]) => void, context?: unknown): void {
    this.emitter.once(event, fn, context);
  }

  public removeAllListeners(event?: string): void {
    this.emitter.removeAllListeners(event);
  }

  public destroy(): void {
    this.emitter.destroy();
    EventBus.instance = null;
  }
}
