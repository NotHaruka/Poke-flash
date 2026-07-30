import Phaser from 'phaser';
import { Logger } from '../utils/Logger.js';

export class BootScene extends Phaser.Scene {
  private logger: Logger;

  constructor() {
    super({ key: 'BootScene' });
    this.logger = new Logger('BootScene');
  }

  public init(): void {
    this.logger.info('Initializing Boot Scene...');
  }

  public preload(): void {
    // We can load tiny loading assets here if we had them.
    // For our procedural shapes foundation, we can proceed straight to PreloadScene.
  }

  public create(): void {
    this.logger.info('Boot scene created. Transitioning to PreloadScene...');
    this.scene.start('PreloadScene');
  }
}
