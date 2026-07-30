import { BaseEntity } from '../entities/BaseEntity.js';
import { Logger } from '../utils/Logger.js';

export class CombatDirector {
  private static instance: CombatDirector | null = null;
  private logger: Logger;
  
  private activeTokens: Set<string> = new Set();
  private maxAttackTokens: number = 2; // Max concurrent attackers

  private constructor() {
    this.logger = new Logger('CombatDirector');
  }

  public static getInstance(): CombatDirector {
    if (!CombatDirector.instance) {
      CombatDirector.instance = new CombatDirector();
    }
    return CombatDirector.instance;
  }

  /**
   * Set the maximum number of concurrent attack tokens.
   */
  public setMaxAttackTokens(count: number): void {
    this.maxAttackTokens = count;
  }

  /**
   * Request an attack token. Returns true if granted.
   */
  public requestAttackToken(enemyId: string): boolean {
    if (this.activeTokens.has(enemyId)) {
      return true; // Already holding a token
    }

    if (this.activeTokens.size < this.maxAttackTokens) {
      this.activeTokens.add(enemyId);
      this.logger.debug(`Token GRANTED to ${enemyId}. Active tokens: ${this.activeTokens.size}`);
      return true;
    }

    return false; // Queue full
  }

  /**
   * Return/release an attack token.
   */
  public releaseAttackToken(enemyId: string): void {
    if (this.activeTokens.delete(enemyId)) {
      this.logger.debug(`Token RELEASED by ${enemyId}. Active tokens: ${this.activeTokens.size}`);
    }
  }

  /**
   * Returns current active token count.
   */
  public getActiveTokenCount(): number {
    return this.activeTokens.size;
  }

  /**
   * Returns max token capacity.
   */
  public getMaxTokenCount(): number {
    return this.maxAttackTokens;
  }

  /**
   * Reset director state on scene change.
   */
  public reset(): void {
    this.activeTokens.clear();
    this.logger.info('CombatDirector reset.');
  }
}
