import Phaser from 'phaser';
import { EventBus } from '../core/EventBus.js';
import { CameraEffectsManager } from './CameraEffectsManager.js';

export class EnvironmentalEffectsManager {
  private static instance: EnvironmentalEffectsManager | null = null;
  private scene!: Phaser.Scene & any;

  // Particle emission timer
  private particleTimer: number = 0;
  private activeBossPhase: number = 0;

  // Track near misses so they don't fire repeatedly for the same hazard instance
  private trackedNearMisses: Set<string> = new Set();

  private constructor() {}

  public static getInstance(): EnvironmentalEffectsManager {
    if (!EnvironmentalEffectsManager.instance) {
      EnvironmentalEffectsManager.instance = new EnvironmentalEffectsManager();
    }
    return EnvironmentalEffectsManager.instance;
  }

  public init(scene: Phaser.Scene & any): void {
    this.scene = scene;
    this.particleTimer = 0;
    this.activeBossPhase = 0;
    this.trackedNearMisses.clear();
  }

  public setBossPhase(phase: number): void {
    this.activeBossPhase = phase;
  }

  /**
   * Triggers a massive burst of ash and ember particles during boss phase transitions
   */
  public triggerPhaseTransitionBurst(): void {
    if (!this.scene) return;
    const count = 45;
    for (let i = 0; i < count; i++) {
      this.spawnAmbientParticle();
    }
  }

  /**
   * Main update loop for environmental particles and near-miss auditing
   */
  public update(time: number, delta: number): void {
    if (!this.scene) return;

    this.updateAmbientParticles(delta);
    this.checkNearMisses(time);
  }

  private updateAmbientParticles(delta: number): void {
    // If there's no boss phase active, we can have a low baseline ambient rate.
    // If boss is active, scale rate based on phase (Phase 1, 2, 3)
    const baseRate = this.activeBossPhase === 0 ? 350 : (this.activeBossPhase === 1 ? 180 : (this.activeBossPhase === 2 ? 80 : 35));
    
    this.particleTimer += delta;
    if (this.particleTimer >= baseRate) {
      this.particleTimer = 0;
      this.spawnAmbientParticle();
    }
  }

  private spawnAmbientParticle(): void {
    const cam = this.scene.cameras.main;
    // Spawn particles slightly off-camera in direction of movement, or randomly on screen
    const px = Phaser.Math.Between(cam.worldView.x - 50, cam.worldView.x + cam.worldView.width + 50);
    const py = Phaser.Math.Between(cam.worldView.y - 50, cam.worldView.y + cam.worldView.height + 50);

    const type = Phaser.Math.Between(0, 3);
    if (type === 0) {
      // 1. Floating Ash (grey small specs floating slowly upwards)
      const ash = this.scene.add.circle(px, py, Phaser.Math.FloatBetween(1, 2.5), 0x71717a, 0.45);
      ash.setDepth(13);

      this.scene.tweens.add({
        targets: ash,
        x: px + Phaser.Math.Between(-40, 40),
        y: py - Phaser.Math.Between(60, 150),
        alpha: 0,
        duration: Phaser.Math.Between(2000, 4000),
        onComplete: () => ash.destroy()
      });
    } 
    else if (type === 1) {
      // 2. Tiny Embers (bright glowing orange specs rising slightly faster)
      const color = Phaser.Math.RND.pick([0xff5500, 0xff7700, 0xff3300]);
      const ember = this.scene.add.circle(px, py, Phaser.Math.FloatBetween(1.5, 3), color, 0.85);
      ember.setDepth(14);

      this.scene.tweens.add({
        targets: ember,
        x: px + Phaser.Math.Between(-30, 30),
        y: py - Phaser.Math.Between(80, 200),
        scale: 0.1,
        alpha: 0,
        duration: Phaser.Math.Between(1500, 3000),
        onComplete: () => ember.destroy()
      });
    }
    else if (type === 2) {
      // 3. Heat Haze / Distortion (Expanding invisible bubble)
      if (this.activeBossPhase >= 2 && Math.random() < 0.4) {
        const haze = this.scene.add.circle(px, py, 15, 0xffaa00, 0.05);
        haze.setDepth(14);

        this.scene.tweens.add({
          targets: haze,
          scale: Phaser.Math.FloatBetween(2.0, 4.0),
          alpha: 0,
          duration: Phaser.Math.Between(1000, 1800),
          ease: 'Sine.easeOut',
          onComplete: () => haze.destroy()
        });
      }
    }
    else {
      // 4. Fine Dust specs
      const dust = this.scene.add.circle(px, py, Phaser.Math.FloatBetween(1.2, 2.8), 0x475569, 0.3);
      dust.setDepth(12);

      this.scene.tweens.add({
        targets: dust,
        x: px + Phaser.Math.Between(-50, 50),
        y: py + Phaser.Math.Between(-50, 50),
        alpha: 0,
        duration: Phaser.Math.Between(3000, 5000),
        onComplete: () => dust.destroy()
      });
    }
  }

  /**
   * Scans all active hazards and checks if the player narrowly avoided them
   */
  private checkNearMisses(time: number): void {
    const player = this.scene.player;
    if (!player || !player.active || this.scene.isPaused) return;

    const boss = this.scene.enemies.find((e: any) => e.id.includes('boss')) as any;
    if (!boss || !boss.active || !boss.activeHazards) return;

    boss.activeHazards.forEach((hazard: any) => {
      if (!hazard || !hazard.active) return;

      const key = `${hazard.type}_${hazard.x}_${hazard.y}`;
      if (this.trackedNearMisses.has(key)) return;

      // Define hazard range
      let hazardRadius = 60;
      if (hazard.type === 'shockwave') hazardRadius = hazard.currentRadius;
      else if (hazard.type === 'molten_pool') hazardRadius = hazard.radius;
      else if (hazard.type === 'lava_explosion' || hazard.type === 'meteor_explosion') hazardRadius = hazard.radius;

      const dist = Phaser.Math.Distance.Between(player.x, player.y, hazard.x, hazard.y);
      const nearMissThreshold = hazardRadius + 30; // Within 30px of hit edge

      // If player is inside the "Near-Miss" ring but outside the actual damage area
      if (dist >= hazardRadius && dist <= nearMissThreshold) {
        // Trigger a Near-Miss feedback!
        this.trackedNearMisses.add(key);
        this.triggerNearMissFeedback(player.x, player.y, hazard.x, hazard.y);
      }
    });

    // Also check near misses on flying projectles (thrown sword)
    if (boss.activeProjectiles) {
      boss.activeProjectiles.forEach((proj: any) => {
        if (!proj || !proj.active) return;

        const key = `${proj.type}_${proj.spawnTime}`;
        if (this.trackedNearMisses.has(key)) return;

        const dist = Phaser.Math.Distance.Between(player.x, player.y, proj.x, proj.y);
        const nearMissThreshold = 45 + 28; // Thrown sword radius (45px) + near-miss buffer (28px)

        if (dist >= 45 && dist <= nearMissThreshold) {
          this.trackedNearMisses.add(key);
          this.triggerNearMissFeedback(player.x, player.y, proj.x, proj.y);
        }
      });
    }
  }

  private triggerNearMissFeedback(px: number, py: number, hx: number, hy: number): void {
    // 1. Spawns glowing near-miss sparks (energy blue-yellow sparks)
    if (this.scene.vfxManager) {
      this.scene.vfxManager.spawnSparks(px, py, 0x00f3ff, 8); // Cyan energy sparks
      this.scene.vfxManager.spawnSparks(px, py, 0xffd700, 4); // Gold reward sparks
      this.scene.vfxManager.addFloatingWorldText(px, py - 35, "NEAR MISS!", "#00ffff");
    }

    // 2. Wind streaks (fast curved wind lines drawn on screen)
    const angle = Phaser.Math.Angle.Between(hx, hy, px, py);
    const windLine = this.scene.add.graphics();
    windLine.setDepth(15);
    windLine.lineStyle(2, 0xffffff, 0.7);
    windLine.beginPath();
    windLine.moveTo(px, py);
    windLine.lineTo(px + Math.cos(angle) * 35, py + Math.sin(angle) * 35);
    windLine.strokePath();

    this.scene.tweens.add({
      targets: windLine,
      alpha: 0,
      scaleX: 1.5,
      scaleY: 1.5,
      duration: 300,
      onComplete: () => windLine.destroy()
    });

    // 3. Brief camera-only controller-style screen shake (camera only)
    CameraEffectsManager.getInstance().shake(100, 0.003);

    // 4. Dodge trail enhancement (spawn some fast ghost images of the player)
    if (playerHasGhostTrail(this.scene.player)) {
      this.enhanceDodgeTrail();
    }
  }

  private enhanceDodgeTrail(): void {
    const player = this.scene.player;
    if (!player || !player.gameObject) return;

    const sprite = player.gameObject as Phaser.GameObjects.Sprite;
    const originalTint = sprite.tintHex;

    for (let i = 0; i < 3; i++) {
      this.scene.time.delayedCall(i * 60, () => {
        if (!player || !player.active || !player.gameObject) return;
        const ghost = this.scene.add.sprite(player.x, player.y, sprite.texture.key);
        ghost.setScale(sprite.scaleX, sprite.scaleY);
        ghost.setAngle(sprite.angle);
        ghost.setTint(0x00ffff);
        ghost.setAlpha(0.5);
        ghost.setDepth(10);

        this.scene.tweens.add({
          targets: ghost,
          alpha: 0,
          scale: sprite.scaleX * 0.8,
          duration: 350,
          onComplete: () => ghost.destroy()
        });
      });
    }
  }

  public getParticleCount(): number {
    // Return approximate particle count representing atmosphere
    return this.activeBossPhase === 3 ? 120 : (this.activeBossPhase === 2 ? 60 : 30);
  }
}

function playerHasGhostTrail(player: any): boolean {
  return player && player.gameObject && player.gameObject.active;
}
