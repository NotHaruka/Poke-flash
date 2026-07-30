import Phaser from 'phaser';
import { AssetManager } from '../managers/AssetManager.js';
import { AudioManager } from '../managers/AudioManager.js';
import { Logger } from '../utils/Logger.js';

export class PreloadScene extends Phaser.Scene {
  private logger: Logger;

  constructor() {
    super({ key: 'PreloadScene' });
    this.logger = new Logger('PreloadScene');
  }

  public init(): void {
    this.logger.info('Initializing Preload Scene...');
  }

  public preload(): void {
    // 1. Set up audio manager with current sound manager
    AudioManager.getInstance().setSoundManager(this.sound);

    // 2. Display custom loading UI inside canvas
    this.createLoadingUI();

    // 3. Generate all procedural textures
    AssetManager.getInstance().generateTextures(this);

    // 4. In a larger production app, standard file preloads go here:
    // this.load.audio('slash_sfx', 'assets/audio/slash.wav');
  }

  public create(): void {
    this.logger.info('Preloads finished. Moving to MainMenuScene...');
    this.scene.start('MainMenuScene');
  }

  private createLoadingUI(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Loading text
    const loadingText = this.add.text(width / 2, height / 2 - 50, 'FORGING COVENANT...', {
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    // ProgressBar container
    const progressBarBg = this.add.graphics();
    progressBarBg.fillStyle(0x1e293b, 1);
    progressBarBg.fillRoundedRect(width / 2 - 150, height / 2, 300, 16, 8);

    const progressBarFill = this.add.graphics();

    // Simulate safe loader feedback progress (even though procedural texture generation is instant)
    this.load.on('progress', (value: number) => {
      progressBarFill.clear();
      progressBarFill.fillStyle(0xcda250, 1);
      progressBarFill.fillRoundedRect(width / 2 - 148, height / 2 + 2, 296 * value, 12, 6);
    });

    this.load.on('complete', () => {
      progressBarBg.destroy();
      progressBarFill.destroy();
      loadingText.destroy();
    });
  }
}
