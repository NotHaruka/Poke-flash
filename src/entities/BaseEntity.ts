import Phaser from 'phaser';
import { BaseComponent } from './BaseComponent.js';
import { Logger } from '../utils/Logger.js';

export class BaseEntity {
  public id: string;
  public x: number = 0;
  public y: number = 0;
  public rotation: number = 0;
  public active: boolean = true;
  public gameObject: Phaser.GameObjects.GameObject | null = null;
  public syncPosition: boolean = true;

  protected logger: Logger;
  private components: Map<string, BaseComponent>;

  constructor(id: string, gameObject?: Phaser.GameObjects.GameObject) {
    this.id = id;
    this.components = new Map();
    this.logger = new Logger(`Entity::${id}`);
    if (gameObject) {
      this.gameObject = gameObject;
      if ('x' in gameObject && 'y' in gameObject) {
        this.x = (gameObject as any).x;
        this.y = (gameObject as any).y;
      }
      if ('rotation' in gameObject) {
        this.rotation = (gameObject as any).rotation;
      }
    }
  }

  public addComponent<T extends BaseComponent>(name: string, component: T): T {
    if (this.components.has(name)) {
      this.logger.warn(`Overwriting existing component: ${name}`);
      this.components.get(name)?.destroy();
    }
    this.components.set(name, component);
    component.init();
    return component;
  }

  public getComponent<T extends BaseComponent>(name: string): T | undefined {
    return this.components.get(name) as T | undefined;
  }

  public removeComponent(name: string): boolean {
    const comp = this.components.get(name);
    if (comp) {
      comp.destroy();
      return this.components.delete(name);
    }
    return false;
  }

  public update(time: number, delta: number): void {
    if (!this.active) return;

    // Direct object synchronization if tied to a Phaser Game Object with physical coordinates
    if (this.syncPosition && this.gameObject && 'x' in this.gameObject && 'y' in this.gameObject) {
      this.x = (this.gameObject as any).x;
      this.y = (this.gameObject as any).y;
      if ('rotation' in this.gameObject) {
        this.rotation = (this.gameObject as any).rotation;
      }
    }

    // Update all active components
    for (const comp of this.components.values()) {
      if (comp.isActive()) {
        comp.update(time, delta);
      }
    }
  }

  public destroy(): void {
    this.active = false;
    for (const comp of this.components.values()) {
      comp.destroy();
    }
    this.components.clear();

    if (this.gameObject) {
      this.gameObject.destroy();
      this.gameObject = null;
    }

    this.logger.debug(`Entity ${this.id} destroyed`);
  }
}
