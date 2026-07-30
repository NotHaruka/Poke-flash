import Phaser from 'phaser';
import { SettingsManager } from './SettingsManager.js';
import { Logger } from '../utils/Logger.js';

export class AudioManager {
  private static instance: AudioManager | null = null;
  private soundManager: Phaser.Sound.BaseSoundManager | null = null;
  private currentBgm: Phaser.Sound.BaseSound | null = null;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('AudioManager');
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  public setSoundManager(soundManager: Phaser.Sound.BaseSoundManager): void {
    this.soundManager = soundManager;
    this.logger.info('Sound manager attached');
    this.syncVolumes();
  }

  public syncVolumes(): void {
    if (!this.soundManager) return;

    const settings = SettingsManager.getInstance().getSettings();
    const bgmVolume = settings.soundEnabled ? settings.bgmVolume : 0;
    const sfxVolume = settings.soundEnabled ? settings.sfxVolume : 0;

    if (this.currentBgm) {
      (this.currentBgm as any).setVolume(bgmVolume);
    }
    this.logger.debug(`Synced audio volumes (BGM: ${bgmVolume}, SFX: ${sfxVolume})`);
  }

  public playSFX(key: string, extraOptions: Phaser.Types.Sound.SoundConfig = {}): void {
    if (!this.soundManager) return;
    const settings = SettingsManager.getInstance().getSettings();
    if (!settings.soundEnabled) return;

    // Check if the sound asset exists in Phaser's cache
    const hasKey = (this.soundManager as any)?.game?.cache?.audio?.has(key);
    if (!hasKey) {
      this.synthesizeSFX(key, settings.sfxVolume);
      return;
    }

    const config: Phaser.Types.Sound.SoundConfig = {
      volume: settings.sfxVolume,
      ...extraOptions
    };

    try {
      this.soundManager.play(key, config);
    } catch (e) {
      this.logger.error(`Error playing sound effect: ${key}`, e);
    }
  }

  private audioCtx: AudioContext | null = null;

  private getAudioContext(): AudioContext | null {
    if (!this.audioCtx) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      } catch (e) {
        this.logger.error('Failed to create browser AudioContext', e);
      }
    }
    return this.audioCtx;
  }

  private synthesizeSFX(key: string, volume: number): void {
    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const now = ctx.currentTime;
    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(volume, now);
    gainNode.connect(ctx.destination);

    switch (key) {
      case 'slash': {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(750, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.14);
        
        gainNode.gain.setValueAtTime(volume * 0.45, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.14);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.14);
        break;
      }
      case 'swoosh': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);

        gainNode.gain.setValueAtTime(volume * 0.35, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.18);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.18);
        break;
      }
      case 'hit': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(30, now + 0.1);

        gainNode.gain.setValueAtTime(volume * 0.55, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      }
      case 'hurt': {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(110, now);
        osc.frequency.linearRampToValueAtTime(20, now + 0.22);

        gainNode.gain.setValueAtTime(volume * 0.65, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.22);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.22);
        break;
      }
      case 'coin': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(950, now);
        osc.frequency.setValueAtTime(1250, now + 0.07);

        gainNode.gain.setValueAtTime(volume * 0.32, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.25);
        break;
      }
      case 'powerup': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.exponentialRampToValueAtTime(780, now + 0.35);

        gainNode.gain.setValueAtTime(volume * 0.38, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.35);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.35);
        break;
      }
      case 'wave': {
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.55);

        gainNode.gain.setValueAtTime(volume * 0.45, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.55);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.55);
        break;
      }
      case 'astral_hum': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(260, now + 0.3);

        gainNode.gain.setValueAtTime(volume * 0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.3);
        break;
      }
      case 'astral_slash': {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now);
        osc.frequency.exponentialRampToValueAtTime(330, now + 0.15);

        gainNode.gain.setValueAtTime(volume * 0.40, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);

        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }
      case 'astral_crit': {
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(1200, now);

        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(1500, now);

        gainNode.gain.setValueAtTime(volume * 0.50, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.40);

        osc1.connect(gainNode);
        osc2.connect(gainNode);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.40);
        osc2.stop(now + 0.40);
        break;
      }
      default: {
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(380, now);
        gainNode.gain.setValueAtTime(volume * 0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.connect(gainNode);
        osc.start(now);
        osc.stop(now + 0.08);
        break;
      }
    }
  }

  public playMusic(key: string, extraOptions: Phaser.Types.Sound.SoundConfig = {}): void {
    if (!this.soundManager) return;
    const settings = SettingsManager.getInstance().getSettings();
    const targetVolume = settings.soundEnabled ? settings.bgmVolume : 0;

    const config: Phaser.Types.Sound.SoundConfig = {
      volume: targetVolume,
      loop: true,
      ...extraOptions
    };

    if (this.currentBgm) {
      if (this.currentBgm.key === key) return; // Already playing
      this.currentBgm.stop();
    }

    try {
      this.currentBgm = this.soundManager.add(key, config);
      this.currentBgm.play();
      this.logger.info(`Playing music loop: ${key}`);
    } catch (e) {
      this.logger.error(`Error playing music: ${key}`, e);
    }
  }

  public stopMusic(): void {
    if (this.currentBgm) {
      this.currentBgm.stop();
      this.currentBgm = null;
      this.logger.info('Music stopped');
    }
  }

  public mute(isMuted: boolean): void {
    if (!this.soundManager) return;
    this.soundManager.mute = isMuted;
    this.logger.info(`Sound system mute toggled: ${isMuted}`);
  }
}
