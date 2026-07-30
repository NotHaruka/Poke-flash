import { EventTopic, SETTINGS_STORAGE_KEY } from '../core/Constants.js';
import { EventBus } from '../core/EventBus.js';
import { Logger } from '../utils/Logger.js';

export interface GameSettings {
  soundEnabled: boolean;
  screenShakeEnabled: boolean;
  particlesEnabled: boolean;
  bgmVolume: number;
  sfxVolume: number;
  difficulty: 'easy' | 'normal' | 'hard';
}

export class SettingsManager {
  private static instance: SettingsManager | null = null;
  private logger: Logger;
  private settings: GameSettings;

  private constructor() {
    this.logger = new Logger('SettingsManager');
    this.settings = this.loadDefaultSettings();
    this.loadFromStorage();
  }

  public static getInstance(): SettingsManager {
    if (!SettingsManager.instance) {
      SettingsManager.instance = new SettingsManager();
    }
    return SettingsManager.instance;
  }

  private loadDefaultSettings(): GameSettings {
    return {
      soundEnabled: true,
      screenShakeEnabled: true,
      particlesEnabled: true,
      bgmVolume: 0.5,
      sfxVolume: 0.6,
      difficulty: 'normal'
    };
  }

  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data) as Partial<GameSettings>;
        this.settings = { ...this.settings, ...parsed };
        this.logger.info('Loaded settings from local storage');
      }
    } catch (e) {
      this.logger.error('Failed to parse settings from storage:', e);
    }
  }

  public saveToStorage(): void {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
      this.logger.debug('Saved settings to local storage');
    } catch (e) {
      this.logger.error('Failed to save settings to storage:', e);
    }
  }

  public getSettings(): Readonly<GameSettings> {
    return this.settings;
  }

  public updateSetting<K extends keyof GameSettings>(key: K, value: GameSettings[K]): void {
    this.settings[key] = value;
    this.saveToStorage();
    EventBus.getInstance().emit(EventTopic.SETTING_CHANGED, key, value);
    this.logger.info(`Setting updated: ${key} = ${value}`);
  }
}
