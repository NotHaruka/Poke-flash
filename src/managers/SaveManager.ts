import { EventTopic, SAVE_STORAGE_KEY } from '../core/Constants.js';
import { EventBus } from '../core/EventBus.js';
import { Logger } from '../utils/Logger.js';

export interface SaveData {
  highScore: number;
  totalGold: number;
  runsCompleted: number;
  unlockedGladiators: string[];
  lastSavedAt: number;
}

export class SaveManager {
  private static instance: SaveManager | null = null;
  private logger: Logger;
  private data: SaveData;

  private constructor() {
    this.logger = new Logger('SaveManager');
    this.data = this.createDefaultSave();
    this.load();
  }

  public static getInstance(): SaveManager {
    if (!SaveManager.instance) {
      SaveManager.instance = new SaveManager();
    }
    return SaveManager.instance;
  }

  private createDefaultSave(): SaveData {
    return {
      highScore: 0,
      totalGold: 0,
      runsCompleted: 0,
      unlockedGladiators: ['knight', 'duelist'], // Default unlocked gladiators
      lastSavedAt: Date.now()
    };
  }

  public load(): void {
    try {
      const stored = localStorage.getItem(SAVE_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<SaveData>;
        this.data = { ...this.createDefaultSave(), ...parsed };
        this.logger.info(`Loaded player save data. High score: ${this.data.highScore}`);
        EventBus.getInstance().emit(EventTopic.SAVE_LOADED, this.data);
      } else {
        this.logger.info('No existing save found. Initialized fresh profile.');
      }
    } catch (e) {
      this.logger.error('Failed to load save data:', e);
      this.data = this.createDefaultSave();
    }
  }

  public save(): void {
    try {
      this.data.lastSavedAt = Date.now();
      localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(this.data));
      this.logger.debug('Successfully saved game state');
    } catch (e) {
      this.logger.error('Failed to write save data to local storage:', e);
    }
  }

  public getSaveData(): Readonly<SaveData> {
    return this.data;
  }

  public updateHighScore(score: number): boolean {
    if (score > this.data.highScore) {
      this.data.highScore = score;
      this.save();
      this.logger.info(`New high score set: ${score}`);
      return true;
    }
    return false;
  }

  public addGold(amount: number): void {
    this.data.totalGold += amount;
    this.save();
    this.logger.debug(`Earned ${amount} gold. Lifetime total: ${this.data.totalGold}`);
  }

  public completeRun(): void {
    this.data.runsCompleted += 1;
    this.save();
    this.logger.info(`Completed run #${this.data.runsCompleted}`);
  }

  public unlockGladiator(gladiatorId: string): boolean {
    if (!this.data.unlockedGladiators.includes(gladiatorId)) {
      this.data.unlockedGladiators.push(gladiatorId);
      this.save();
      this.logger.info(`Unlocked gladiator: ${gladiatorId}`);
      return true;
    }
    return false;
  }

  public resetAllProgress(): void {
    this.data = this.createDefaultSave();
    this.save();
    this.logger.info('All save progress has been reset.');
    EventBus.getInstance().emit(EventTopic.SAVE_LOADED, this.data);
  }
}
