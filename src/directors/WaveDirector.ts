import { EventBus } from '../core/EventBus.js';
import { EventTopic } from '../core/Constants.js';

export class WaveDirector {
  private currentWave: number = 1;
  private isTransitioning: boolean = false;
  
  public reset(): void {
    this.currentWave = 1;
    this.isTransitioning = false;
  }

  public getWaveNumber(): number {
    return this.currentWave;
  }

  public setWaveNumber(wave: number): void {
    this.currentWave = wave;
  }

  public getIsTransitioning(): boolean {
    return this.isTransitioning;
  }

  public setTransitioning(value: boolean): void {
    this.isTransitioning = value;
  }

  public incrementWave(): void {
    this.currentWave++;
  }

  public getSpawnCount(): number {
    if (this.isBossWave()) return 1;
    if (this.isMiniBossWave()) return 2;
    return 3 + this.currentWave * 2;
  }

  public isBossWave(): boolean {
    return this.currentWave > 0 && this.currentWave % 10 === 0;
  }

  public isMiniBossWave(): boolean {
    return this.currentWave > 0 && this.currentWave % 5 === 0 && !this.isBossWave();
  }

  public getEliteChance(): number {
    return 0.10 + this.currentWave * 0.015;
  }

  public getEnemyHpScale(): number {
    const intervals = Math.floor(this.currentWave / 2);
    // 8% to 10% average is 9%
    return 1.0 + intervals * 0.09;
  }

  public getEnemyDamageScale(): number {
    const intervals = Math.floor(this.currentWave / 2);
    return 1.0 + intervals * 0.09;
  }

  public getEnemySpeedScale(): number {
    return 1.0 + this.currentWave * 0.03;
  }
}
