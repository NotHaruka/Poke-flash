import Phaser from 'phaser';
import { BaseEntity } from './BaseEntity.js';

export abstract class BossEntity extends BaseEntity {
  public bossName: string;
  public totalPhases: number = 3;
  public isFlashingDamage: boolean = false;
  protected currentPhase: number = 1;
  protected isInvulnerable: boolean = false;
  protected enrageThreshold: number = 0.25; // Enrage at 25% HP
  protected isEnragedState: boolean = false;
  protected isDefeatedState: boolean = false;
  
  constructor(id: string, sprite: Phaser.GameObjects.Sprite, bossName: string) {
    super(id, sprite);
    this.bossName = bossName;
  }

  public getPhase(): number {
    return this.currentPhase;
  }

  public isEnraged(): boolean {
    return this.isEnragedState;
  }

  public isDefeated(): boolean {
    return this.isDefeatedState;
  }

  public setInvulnerable(value: boolean): void {
    this.isInvulnerable = value;
  }

  public isInvulnerableState(): boolean {
    return this.isInvulnerable || this.isDefeatedState;
  }

  public abstract onDamaged(amount: number, currentHp: number, maxHp: number): void;
  public abstract onDefeated(): void;
  public abstract onPhaseTransition(newPhase: number): void;
}
