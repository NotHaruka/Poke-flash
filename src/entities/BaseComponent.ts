import { BaseEntity } from './BaseEntity.js';

export abstract class BaseComponent {
  protected owner: BaseEntity;
  private active: boolean = true;

  constructor(owner: BaseEntity) {
    this.owner = owner;
  }

  public getOwner(): BaseEntity {
    return this.owner;
  }

  public isActive(): boolean {
    return this.active;
  }

  public setActive(active: boolean): void {
    this.active = active;
  }

  /**
   * Called during the initialization of the component after being added to an entity.
   */
  public init(): void {}

  /**
   * Hook executed on every update tick from the parent entity.
   */
  public update(time: number, delta: number): void {}

  /**
   * Cleanup resource bindings on destroy.
   */
  public destroy(): void {
    this.active = false;
  }
}
