import Phaser from 'phaser';
import { Logger } from '../utils/Logger.js';

export class AssetManager {
  private static instance: AssetManager | null = null;
  private logger: Logger;

  private constructor() {
    this.logger = new Logger('AssetManager');
  }

  public static getInstance(): AssetManager {
    if (!AssetManager.instance) {
      AssetManager.instance = new AssetManager();
    }
    return AssetManager.instance;
  }

  /**
   * Generates procedural vector textures inside Phaser's Texture Manager.
   * This is called in Preload/Boot to supply game shapes without loading external file assets.
   */
  public generateTextures(scene: Phaser.Scene): void {
    this.logger.info('Starting procedural texture generation...');

    // 1. Player (Gladiator Circle)
    this.createCircleTexture(scene, 'player-texture', 32, 0x94a3b8, 0x475569, 3);

    // 2. Sir Galahad the Iron
    this.createCircleTexture(scene, 'char-knight', 32, 0x94a3b8, 0x1e293b, 3);

    // 3. Seraphina the Swift
    this.createCircleTexture(scene, 'char-duelist', 28, 0xf43f5e, 0x881337, 3);

    // 4. Ignis the Flameborn
    this.createCircleTexture(scene, 'char-mage', 30, 0xf97316, 0x7c2d12, 3);

    // 5. Sword Broadsword
    this.createSwordTexture(scene, 'sword-texture', 64, 10, 0xcbd5e1, 0xcda250);

    // 6. Enemies
    this.createCircleTexture(scene, 'enemy-melee', 24, 0x991b1b, 0x450a0a, 2.5);
    this.createCircleTexture(scene, 'enemy-heavy', 40, 0x1e293b, 0x0f172a, 4);
    this.createCircleTexture(scene, 'enemy-ranged', 20, 0x065f46, 0x022c22, 2);

    // 7. Coin (Gold diamond)
    this.createCoinTexture(scene, 'coin-texture', 16);

    // 8. Healing cross (Red/White)
    this.createHealTexture(scene, 'heal-texture', 20);

    // 9. XP Orb (Electric Cyan Diamond)
    this.createXPTexture(scene, 'xp-texture', 12);

    // 10. Crimson Droplet (Vampiric Blade Drop)
    this.createDropletTexture(scene, 'droplet-texture', 14);

    // 11. Boss Overlord (Deep Obsidian with Hot Crimson Edge)
    this.createCircleTexture(scene, 'boss-texture', 52, 0x09060c, 0xff3366, 5);

    this.logger.info('Procedural texture generation completed successfully!');
  }

  private createXPTexture(scene: Phaser.Scene, key: string, size: number): void {
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0x00f3ff); // Electric cyan core
    graphics.lineStyle(1.5, 0x1e3a8a); // Blue outline

    const half = size / 2;
    graphics.beginPath();
    graphics.moveTo(half, 0);
    graphics.lineTo(size, half);
    graphics.lineTo(half, size);
    graphics.lineTo(0, half);
    graphics.closePath();
    graphics.fill();
    graphics.strokePath();

    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private createDropletTexture(scene: Phaser.Scene, key: string, size: number): void {
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xef4444); // Crimson red
    graphics.lineStyle(1.0, 0x7f1d1d); // Dark red border

    const half = size / 2;
    // Draw tear drop shape
    graphics.beginPath();
    graphics.moveTo(half, 0);
    graphics.lineTo(size, size);
    graphics.lineTo(0, size);
    graphics.closePath();
    graphics.fill();
    graphics.strokePath();

    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private createCircleTexture(
    scene: Phaser.Scene,
    key: string,
    radius: number,
    fillColor: number,
    strokeColor: number,
    strokeWidth: number
  ): void {
    const size = radius * 2 + 8;
    const graphics = scene.make.graphics({ x: 0, y: 0 });

    graphics.fillStyle(fillColor);
    graphics.lineStyle(strokeWidth, strokeColor);

    // Draw main body circle
    graphics.fillCircle(size / 2, size / 2, radius);
    graphics.strokeCircle(size / 2, size / 2, radius);

    // Add a simple visior/shield line representing a face direction
    graphics.lineStyle(2, 0xffffff, 0.7);
    graphics.moveTo(size / 2, size / 2 - radius / 2);
    graphics.lineTo(size / 2 + radius, size / 2);
    graphics.lineTo(size / 2, size / 2 + radius / 2);
    graphics.strokePath();

    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private createSwordTexture(
    scene: Phaser.Scene,
    key: string,
    length: number,
    width: number,
    bladeColor: number,
    hiltColor: number
  ): void {
    const graphics = scene.make.graphics({ x: 0, y: 0 });

    // Hilt/Crossguard (On the left side, around origin)
    graphics.fillStyle(hiltColor);
    graphics.fillCircle(4, width / 2, 3); // Pommel
    graphics.fillRect(4, width / 2 - 1, 12, 2); // Handle/Grip
    graphics.fillRect(16, 0, 4, width); // Crossguard

    // Draw Blade extending to the right
    graphics.fillStyle(bladeColor);
    graphics.fillRect(20, width / 2 - 2, length - 32, 4);

    // Blade Tip (On the far right end)
    graphics.beginPath();
    graphics.moveTo(length - 12, width / 2 - 2);
    graphics.lineTo(length, width / 2);
    graphics.lineTo(length - 12, width / 2 + 2);
    graphics.closePath();
    graphics.fill();

    graphics.generateTexture(key, length, width);
    graphics.destroy();
  }

  private createCoinTexture(scene: Phaser.Scene, key: string, size: number): void {
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    graphics.fillStyle(0xffd700);
    graphics.lineStyle(1.5, 0xd97706);

    const half = size / 2;
    graphics.beginPath();
    graphics.moveTo(half, 0);
    graphics.lineTo(size, half);
    graphics.lineTo(half, size);
    graphics.lineTo(0, half);
    graphics.closePath();
    graphics.fill();
    graphics.strokePath();

    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private createHealTexture(scene: Phaser.Scene, key: string, size: number): void {
    const graphics = scene.make.graphics({ x: 0, y: 0 });
    const half = size / 2;

    // Draw circle
    graphics.fillStyle(0x059669);
    graphics.fillCircle(half, half, size / 2);

    // Draw cross
    graphics.fillStyle(0xffffff);
    const thick = size / 5;
    graphics.fillRect(half - thick / 2, half - size / 3, thick, (size / 3) * 2);
    graphics.fillRect(half - size / 3, half - thick / 2, (size / 3) * 2, thick);

    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }
}
