import { BaseComponent } from './BaseComponent.js';
import { BaseEntity } from './BaseEntity.js';
import { EventBus } from '../core/EventBus.js';
import { EventTopic } from '../core/Constants.js';

export class HealthComponent extends BaseComponent {
  private currentHp: number;
  private maxHp: number;
  private invulnTimer: number = 0;
  private invulnDuration: number = 1000; // 1 second of invulnerability frames

  constructor(owner: BaseEntity, maxHp: number) {
    super(owner);
    this.maxHp = maxHp;
    this.currentHp = maxHp;
  }

  public getHp(): number {
    return this.currentHp;
  }

  public setHp(hp: number): void {
    this.currentHp = Math.max(0, Math.min(this.maxHp, hp));
    if (this.owner.id === 'player') {
      EventBus.getInstance().emit(EventTopic.PLAYER_HEALTH_CHANGED, this.currentHp, this.maxHp);
    }
    if (this.currentHp <= 0) {
      this.die();
    }
  }

  public getMaxHp(): number {
    return this.maxHp;
  }

  public setMaxHp(newMax: number): void {
    const diff = newMax - this.maxHp;
    this.maxHp = newMax;
    if (diff > 0) {
      this.currentHp += diff;
    }
    this.currentHp = Math.min(this.maxHp, this.currentHp);
    if (this.owner.id === 'player') {
      EventBus.getInstance().emit(EventTopic.PLAYER_HEALTH_CHANGED, this.currentHp, this.maxHp);
    }
  }

  public isInvulnerable(): boolean {
    return this.invulnTimer > 0;
  }

  public setInvulnDuration(duration: number): void {
    this.invulnDuration = duration;
  }

  public update(time: number, delta: number): void {
    if (this.invulnTimer > 0) {
      this.invulnTimer -= delta;
      
      // Flash owner game object to denote invulnerability frames
      if (this.owner.gameObject && 'setAlpha' in this.owner.gameObject) {
        const isVisible = Math.floor(time / 50) % 2 === 0;
        (this.owner.gameObject as any).setAlpha(isVisible ? 0.3 : 0.8);
      }
    } else {
      if (this.owner.gameObject && 'setAlpha' in this.owner.gameObject) {
        (this.owner.gameObject as any).setAlpha(1.0);
      }
    }
  }

  public takeDamage(amount: number): boolean {
    if (this.invulnTimer > 0 || this.currentHp <= 0) return false;

    this.currentHp = Math.max(0, this.currentHp - amount);
    
    // Only the player gets the full invulnerability frames.
    // Enemies get a very short 80ms grace window to support fast multi-hit combat combos.
    if (this.owner.id === 'player') {
      this.invulnTimer = this.invulnDuration;
    } else {
      this.invulnTimer = 80;
    }

    // Emit event
    if (this.owner.id === 'player') {
      EventBus.getInstance().emit(EventTopic.PLAYER_HEALTH_CHANGED, this.currentHp, this.maxHp);
    }

    if (this.currentHp <= 0) {
      this.die();
    }

    return true;
  }

  public heal(amount: number): void {
    if (this.currentHp <= 0) return;
    this.currentHp = Math.min(this.maxHp, this.currentHp + amount);

    if (this.owner.id === 'player') {
      EventBus.getInstance().emit(EventTopic.PLAYER_HEALTH_CHANGED, this.currentHp, this.maxHp);
    }
  }

  protected die(): void {
    if (this.owner.id === 'player') {
      EventBus.getInstance().emit(EventTopic.PLAYER_DIED);
    }
    this.owner.destroy();
  }
}
