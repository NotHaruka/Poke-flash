import Phaser from 'phaser';
import { Logger } from '../utils/Logger.js';

export class SceneManager {
  private static instance: SceneManager | null = null;
  private game: Phaser.Game | null = null;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('SceneManager');
  }

  public static getInstance(): SceneManager {
    if (!SceneManager.instance) {
      SceneManager.instance = new SceneManager();
    }
    return SceneManager.instance;
  }

  public setGameInstance(game: Phaser.Game): void {
    this.game = game;
    this.logger.info('Phaser game instance attached to SceneManager');
  }

  public transitionToScene(sceneKey: string, data?: any): void {
    if (!this.game) {
      this.logger.error(`Cannot transition to ${sceneKey}: Game instance not attached!`);
      return;
    }

    this.logger.info(`Transitioning from current scenes to: ${sceneKey}`);
    
    // Stop all scenes (active and inactive)
    const activeScenes = this.game.scene.getScenes(true);
    const inactiveScenes = this.game.scene.getScenes(false);
    [...activeScenes, ...inactiveScenes].forEach(s => {
      this.game!.scene.stop(s.sys.settings.key);
    });

    // Start target scene
    this.game.scene.start(sceneKey, data);
  }

  public pauseActiveScenes(): void {
    if (!this.game) return;
    const active = this.game.scene.getScenes(true);
    active.forEach(s => {
      this.game!.scene.pause(s.sys.settings.key);
      this.logger.debug(`Scene paused: ${s.sys.settings.key}`);
    });
  }

  public resumeActiveScenes(): void {
    if (!this.game) return;
    const paused = this.game.scene.getScenes(false);
    paused.forEach(s => {
      // Phaser doesn't expose s.scene.isPaused directly so check state
      this.game!.scene.resume(s.sys.settings.key);
      this.logger.debug(`Scene resumed: ${s.sys.settings.key}`);
    });
  }

  public getActiveScenes(): Phaser.Scene[] {
    if (!this.game) return [];
    return this.game.scene.getScenes(true);
  }

  public destroy(): void {
    this.game = null;
    SceneManager.instance = null;
    this.logger.debug('SceneManager destroyed');
  }
}
