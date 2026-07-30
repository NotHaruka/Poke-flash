import Phaser from 'phaser';
import { Logger } from '../utils/Logger.js';

export class MainMenuScene extends Phaser.Scene {
  private logger: Logger;
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter;
  private titleWeapon!: Phaser.GameObjects.Sprite;

  constructor() {
    super({ key: 'MainMenuScene' });
    this.logger = new Logger('MainMenuScene');
  }

  public init(): void {
    this.logger.info('Initializing Main Menu Scene...');
  }

  public create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // 1. Draw a dark colosseum/stone floor vignette background
    const bg = this.add.graphics();
    bg.fillGradientStyle(0x0a0b10, 0x0c0f1e, 0x07080d, 0x090a12, 1);
    bg.fillRect(0, 0, width, height);

    // Draw stylized colosseum pillars in background
    bg.fillStyle(0x1e293b, 0.15);
    for (let i = 0; i < 8; i++) {
      const pX = i * (width / 7);
      bg.fillRect(pX - 20, 0, 40, height);
    }
    
    // Draw some flagstones lines
    bg.lineStyle(1.5, 0xffffff, 0.05);
    for (let i = 0; i < height; i += 40) {
      bg.moveTo(0, i);
      bg.lineTo(width, i);
    }
    for (let j = 0; j < width; j += 60) {
      bg.moveTo(j, 0);
      bg.lineTo(j, height);
    }
    bg.strokePath();

    // 2. Add glowing particle effects (Embers rising from below)
    const particleGraphics = this.make.graphics({ x: 0, y: 0 });
    particleGraphics.fillStyle(0xcda250, 0.8);
    particleGraphics.fillCircle(4, 4, 4);
    particleGraphics.generateTexture('ember-particle', 8, 8);
    particleGraphics.destroy();

    this.embers = this.add.particles(0, height, 'ember-particle', {
      x: { min: 0, max: width },
      y: 0,
      lifespan: { min: 3000, max: 6000 },
      speedY: { min: -20, max: -60 },
      speedX: { min: -10, max: 10 },
      scale: { start: 1, end: 0 },
      alpha: { start: 0.8, end: 0 },
      blendMode: 'ADD',
      frequency: 80
    });

    // 3. Render a rotating legendary broadsword in the center
    this.titleWeapon = this.add.sprite(width / 2, height / 2 - 40, 'sword-texture');
    this.titleWeapon.setScale(2.5);
    this.titleWeapon.setAlpha(0.65);

    // Add glowing spotlight vignette over the sword
    const spotlight = this.add.graphics();
    spotlight.fillStyle(0xcda250, 0.05);
    spotlight.fillCircle(width / 2, height / 2 - 40, 120);

    this.logger.info('Main Menu Scene created.');
  }

  public update(time: number, delta: number): void {
    // Elegant weapon rotation floating effect
    if (this.titleWeapon) {
      this.titleWeapon.rotation += 0.005;
      this.titleWeapon.y = (this.cameras.main.height / 2 - 40) + Math.sin(time * 0.002) * 8;
    }
  }

  public destroy(): void {
    if (this.embers) this.embers.destroy();
    if (this.titleWeapon) this.titleWeapon.destroy();
  }
}
