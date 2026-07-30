import Phaser from 'phaser';
import { EventBus } from '../core/EventBus.js';
import { EventTopic } from '../core/Constants.js';
import { BaseEntity } from '../entities/BaseEntity.js';

export class LootManager {
  private scene: Phaser.Scene;
  private coins: Phaser.GameObjects.Sprite[] = [];
  private xpOrbs: { sprite: Phaser.GameObjects.Sprite; value: number }[] = [];
  private droplets: Phaser.GameObjects.Sprite[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public spawnLootFromEnemy(enemy: BaseEntity, coinsToDrop: number, xpToDrop: number, healthDropChance: number): void {
    // 1. Spawn Coins
    for (let i = 0; i < coinsToDrop; i++) {
      const rx = enemy.x + Phaser.Math.Between(-15, 15);
      const ry = enemy.y + Phaser.Math.Between(-15, 15);
      this.spawnCoin(rx, ry);
    }

    // 2. Spawn XP Orbs (Batched to save performance)
    const maxOrbs = Math.min(xpToDrop, 5);
    const baseXp = Math.floor(xpToDrop / maxOrbs);
    let xpRemainder = xpToDrop % maxOrbs;
    for (let i = 0; i < maxOrbs; i++) {
      const rx = enemy.x + Phaser.Math.Between(-20, 20);
      const ry = enemy.y + Phaser.Math.Between(-20, 20);
      const val = baseXp + (xpRemainder > 0 ? 1 : 0);
      this.spawnXPOrb(rx, ry, val);
      xpRemainder--;
    }

    // 3. Spawn Health Droplet
    if (Math.random() < healthDropChance) {
      const rx = enemy.x + Phaser.Math.Between(-10, 10);
      const ry = enemy.y + Phaser.Math.Between(-10, 10);
      this.spawnDroplet(rx, ry);
    }
  }

  public spawnCoin(x: number, y: number): void {
    const coin = this.scene.add.sprite(x, y, 'coin-texture');
    this.scene.tweens.add({
      targets: coin,
      y: y - 16,
      duration: Phaser.Math.Between(120, 200),
      yoyo: true,
      ease: 'Quad.easeOut'
    });
    this.coins.push(coin);
  }

  public spawnXPOrb(x: number, y: number, value: number = 1): void {
    const orb = this.scene.add.sprite(x, y, 'xp-texture');
    if (value > 1) {
      orb.setScale(1.2);
    }
    this.scene.tweens.add({
      targets: orb,
      y: y - 12,
      duration: Phaser.Math.Between(120, 200),
      yoyo: true,
      ease: 'Quad.easeOut'
    });
    this.xpOrbs.push({ sprite: orb, value });
  }

  public spawnDroplet(x: number, y: number): void {
    const droplet = this.scene.add.sprite(x, y, 'droplet-texture');
    this.scene.tweens.add({
      targets: droplet,
      y: y - 14,
      duration: Phaser.Math.Between(120, 200),
      yoyo: true,
      ease: 'Quad.easeOut'
    });
    this.droplets.push(droplet);
  }

  public update(playerX: number, playerY: number, magnetRange: number, goldGainMult: number, xpGainMult: number): void {
    const pullSpeed = 0.16;

    // Pull and collect Coins
    this.coins = this.coins.filter(coin => {
      const dist = Phaser.Math.Distance.Between(playerX, playerY, coin.x, coin.y);
      if (dist < magnetRange) {
        coin.x += (playerX - coin.x) * pullSpeed;
        coin.y += (playerY - coin.y) * pullSpeed;
      }

      if (dist < 22) {
        const rawGold = 5;
        const actualGold = Math.round(rawGold * goldGainMult);
        EventBus.getInstance().emit(EventTopic.COIN_COLLECTED, { amount: actualGold, x: coin.x, y: coin.y });
        coin.destroy();
        return false;
      }
      return true;
    });

    // Pull and collect XP Orbs
    this.xpOrbs = this.xpOrbs.filter(orb => {
      const dist = Phaser.Math.Distance.Between(playerX, playerY, orb.sprite.x, orb.sprite.y);
      if (dist < magnetRange) {
        orb.sprite.x += (playerX - orb.sprite.x) * pullSpeed;
        orb.sprite.y += (playerY - orb.sprite.y) * pullSpeed;
      }

      if (dist < 22) {
        const actualXP = Math.round(orb.value * xpGainMult);
        EventBus.getInstance().emit(EventTopic.PLAYER_XP_CHANGED, { amount: actualXP, x: orb.sprite.x, y: orb.sprite.y });
        orb.sprite.destroy();
        return false;
      }
      return true;
    });

    // Pull and collect Health Droplets
    this.droplets = this.droplets.filter(droplet => {
      const dist = Phaser.Math.Distance.Between(playerX, playerY, droplet.x, droplet.y);
      if (dist < magnetRange) {
        droplet.x += (playerX - droplet.x) * pullSpeed;
        droplet.y += (playerY - droplet.y) * pullSpeed;
      }

      if (dist < 22) {
        // We'll emit PLAYER_HEALTH_CHANGED or a custom event to notify game scene to heal.
        // Actually, let's use a specific event topic or just PLAYER_HEALTH_CHANGED with a heal action
        EventBus.getInstance().emit('HEALTH_DROPLET_COLLECTED', { amount: 1, x: droplet.x, y: droplet.y });
        droplet.destroy();
        return false;
      }
      return true;
    });
  }

  public collectAllInstantly(goldGainMult: number, xpGainMult: number): void {
    // Collect all coins instantly
    this.coins.forEach(coin => {
      const rawGold = 5;
      const actualGold = Math.round(rawGold * goldGainMult);
      EventBus.getInstance().emit(EventTopic.COIN_COLLECTED, { amount: actualGold, x: coin.x, y: coin.y });
      coin.destroy();
    });
    this.coins = [];

    // Collect all XP Orbs instantly
    this.xpOrbs.forEach(orb => {
      const actualXP = Math.round(orb.value * xpGainMult);
      EventBus.getInstance().emit(EventTopic.PLAYER_XP_CHANGED, { amount: actualXP, x: orb.sprite.x, y: orb.sprite.y });
      orb.sprite.destroy();
    });
    this.xpOrbs = [];

    // Collect all Health Droplets instantly
    this.droplets.forEach(droplet => {
      EventBus.getInstance().emit('HEALTH_DROPLET_COLLECTED', { amount: 1, x: droplet.x, y: droplet.y });
      droplet.destroy();
    });
    this.droplets = [];
  }

  public cleanup(): void {
    this.coins.forEach(c => c.destroy());
    this.coins = [];
    this.xpOrbs.forEach(o => o.sprite.destroy());
    this.xpOrbs = [];
    this.droplets.forEach(d => d.destroy());
    this.droplets = [];
  }
}
