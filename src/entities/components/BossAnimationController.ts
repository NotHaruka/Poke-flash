import Phaser from 'phaser';

export enum WeaponAnimState {
  NORMAL,
  WINDUP,
  PAUSE,
  ACCEL,
  OVERSWING,
  RECOVERY
}

export class BossAnimationController {
  private scene!: Phaser.Scene & any;
  private bossEntity!: any;

  // Boss visual components (proc arcs and sprites)
  private sprite!: Phaser.GameObjects.Sprite;
  private moltenCore!: Phaser.GameObjects.Arc;
  private leftShoulder!: Phaser.GameObjects.Arc;
  private rightShoulder!: Phaser.GameObjects.Arc;
  private giantSword!: Phaser.GameObjects.Sprite;

  // Eyes overlays for flicker effect
  private leftEye!: Phaser.GameObjects.Arc;
  private rightEye!: Phaser.GameObjects.Arc;
  private swordHand!: Phaser.GameObjects.Arc;

  // Heavy weapon swing variables
  private animState: WeaponAnimState = WeaponAnimState.NORMAL;
  private animTimer: number = 0;
  private targetSwingAngle: number = 0;
  private initialSwingAngle: number = 0;
  private currentWeaponAngle: number = 0;
  private weaponAngularVelocity: number = 0;

  // Custom swing state timing properties (for speed scaling)
  private windupDuration: number = 800;
  private pauseDuration: number = 150;
  private accelDuration: number = 160;
  private overswingDuration: number = 200;
  private recoveryDuration: number = 500;

  // Visual parameters
  private bodyBaseY: number = 0;
  private bodyBaseX: number = 0;

  constructor(bossEntity: any, scene: Phaser.Scene & any) {
    this.bossEntity = bossEntity;
    this.scene = scene;

    // Pull from bossEntity
    this.sprite = bossEntity.sprite;
    this.moltenCore = bossEntity.moltenCore;
    this.leftShoulder = bossEntity.leftShoulder;
    this.rightShoulder = bossEntity.rightShoulder;
    this.giantSword = bossEntity.giantSword;

    this.bodyBaseX = bossEntity.x;
    this.bodyBaseY = bossEntity.y;

    this.createEyes();
    this.createHand();
  }

  private createEyes(): void {
    // Add two small glowing red/orange eyes to the Colossus head
    // Body scale is 2.5, offset head slightly up
    this.leftEye = this.scene.add.circle(this.bossEntity.x - 8, this.bossEntity.y - 45, 2.5, 0xff0000, 1.0);
    this.leftEye.setDepth(18);

    this.rightEye = this.scene.add.circle(this.bossEntity.x + 8, this.bossEntity.y - 45, 2.5, 0xff0000, 1.0);
    this.rightEye.setDepth(18);
  }

  private createHand(): void {
    // Large heavy iron hand on outer body edge
    this.swordHand = this.scene.add.circle(this.bossEntity.x, this.bossEntity.y, 14, 0x334155, 1.0);
    this.swordHand.setStrokeStyle(3, 0x1e293b);
    this.swordHand.setDepth(19); // Placed above the sword depth (18) to look like it is gripping the handle!
  }

  /**
   * Main update routine that drives breathing, sways, eye flicker, core pulse, and heavy attacks
   */
  public update(time: number, delta: number, bossState: any): void {
    if (!this.bossEntity.active) {
      this.destroy();
      return;
    }

    const phase = this.bossEntity.currentPhase || 1;

    // 1. Synchronize eyes positions with boss movement
    this.leftEye.x = this.bossEntity.x - 8;
    this.leftEye.y = this.bossEntity.y - 45;

    this.rightEye.x = this.bossEntity.x + 8;
    this.rightEye.y = this.bossEntity.y - 45;

    // 2. Procedural Idle Breathing and Sways
    const breathingSpeed = 150 + (phase * 30); // Faster breathing in higher phases
    const breathFactor = 1 + Math.sin(time / breathingSpeed) * 0.05;
    
    // Dynamic breathing scale application (fluctuating height organically)
    const baseScale = phase === 1 ? 2.5 : (phase === 2 ? 3.0 : 3.5);
    this.sprite.setScale(baseScale * (1 + Math.sin(time / 800) * 0.015), baseScale * breathFactor);

    // Dynamic sword scale to visually dominate (120-150% of boss diameter)
    const swScaleX = phase === 1 ? 3.6 : (phase === 2 ? 4.2 : 4.8);
    const swScaleY = phase === 1 ? 2.6 : (phase === 2 ? 3.2 : 3.8);
    this.giantSword.setScale(swScaleX, swScaleY);

    // Dynamic hand scale to match growing body
    this.swordHand.setScale(phase === 1 ? 1.0 : (phase === 2 ? 1.25 : 1.5));

    // Phase-based visual evolution (obsidian cracks, white-hot core, eye flares, hand styling)
    if (this.bossEntity.isFlashingDamage) {
      this.sprite.setTint(0xff0000);
    } else {
      if (phase === 1) {
        this.sprite.setTint(0x0a0a0f); // Pure dark obsidian base
        this.moltenCore.setFillStyle(0xaa1100); // Deep red core
        this.leftEye.setFillStyle(0xff0000);
        this.rightEye.setFillStyle(0xff0000);
        this.swordHand.setFillStyle(0x334155);
      } else if (phase === 2) {
        this.sprite.setTint(0xff8822); // Glowing amber/cracked orange lines
        this.moltenCore.setFillStyle(0xff5500); // Bright orange core
        this.leftEye.setFillStyle(0xff5500);
        this.rightEye.setFillStyle(0xff5500);
        this.swordHand.setFillStyle(0x475569);
      } else if (phase === 3) {
        this.sprite.setTint(0xff3300); // Broken glowing lava crimson
        this.moltenCore.setFillStyle(0xffffff); // White-hot core center
        this.leftEye.setFillStyle(0xffffff); // Blinding white-hot eyes
        this.rightEye.setFillStyle(0xffffff);
        this.swordHand.setFillStyle(0x1e293b);
      }
    }

    // Core slow organic pulsing (glowing core scaling and alpha breathing)
    const corePulse = (1.0 + Math.sin(time / 200) * 0.12) * (phase * 0.15 + 0.85);
    this.moltenCore.setScale(corePulse);
    this.moltenCore.setAlpha(0.7 + Math.sin(time / 150) * 0.25);

    // Eye Flickering (Eyes sparkle or dim organically)
    if (Math.random() < 0.08) {
      const alpha = Phaser.Math.FloatBetween(0.4, 1.0);
      this.leftEye.setAlpha(alpha);
      this.rightEye.setAlpha(alpha);
    }

    // Body Sway (Slight translation side to side and dynamic breathing rotation/tilt)
    const swaySpeed = 400;
    const swayOffset = Math.sin(time / swaySpeed) * 3.5;
    this.sprite.x = this.bossEntity.x + swayOffset;
    this.sprite.rotation = Math.sin(time / 600) * 0.025; // Subtle tilting body sway

    // Shoulder movement lagging behind body with minor spring-offset
    const moving = Math.abs(this.bossEntity.physicsComponent.vx) > 5 || Math.abs(this.bossEntity.physicsComponent.vy) > 5;
    const breatheOffset = Math.sin(time / 300) * 2;
    const scale = this.sprite.scaleX;
    const xOffset = 12.8 * scale;
    const yOffset = -4.8 * scale;

    const lagX = moving ? -this.bossEntity.physicsComponent.vx * 0.08 : 0;
    const lagY = moving ? -this.bossEntity.physicsComponent.vy * 0.08 : 0;

    // Off-phase breathing on shoulders to give dynamic muscle-skeletal look!
    const lShBreath = Math.sin(time / 320) * 1.5;
    const rShBreath = Math.sin(time / 280) * 1.5;

    this.leftShoulder.x = this.bossEntity.x - xOffset + lagX + swayOffset * 0.5;
    this.leftShoulder.y = this.bossEntity.y + yOffset + breatheOffset + lagY + lShBreath;

    this.rightShoulder.x = this.bossEntity.x + xOffset + lagX + swayOffset * 0.5;
    this.rightShoulder.y = this.bossEntity.y + yOffset + breatheOffset + lagY + rShBreath;

    // Dynamic shoulder scales to follow breathing chest expansion
    const shBreathe = 1.0 + Math.sin(time / breathingSpeed) * 0.04;
    this.leftShoulder.setScale(shBreathe);
    this.rightShoulder.setScale(shBreathe);

    // Heat shimmer/magma haze expansion вокруг Colossus
    if (Math.random() < 0.03 * phase) {
      const shimmerColor = phase === 3 ? 0xff0033 : (phase === 2 ? 0xff5500 : 0xaa1100);
      const shimmer = this.scene.add.circle(this.bossEntity.x + Phaser.Math.Between(-35, 35), this.bossEntity.y + Phaser.Math.Between(-35, 35), 10, shimmerColor, 0.08);
      shimmer.setDepth(14);
      this.scene.tweens.add({
        targets: shimmer,
        scale: 3.5,
        alpha: 0,
        duration: 900,
        onComplete: () => shimmer.destroy()
      });
    }

    // 3. Heavy weapon physics, dragging, and attack timelines
    this.updateWeaponInertiaAndAttacks(time, delta, bossState);
  }

  /**
   * Manages the procedural rotation and dragging of the sword, enforcing realistic momentum
   */
  private updateWeaponInertiaAndAttacks(time: number, delta: number, bossState: any): void {
    const player = this.scene.player;
    if (!player || !player.active) return;

    // Base translation offset to reflect kinetic momentum and physical body weight
    let leanX = 0;
    let leanY = 0;

    if (this.animState === WeaponAnimState.NORMAL) {
      // Rotational Spring Lag Physics to give enormous visual weight
      const targetAngle = Phaser.Math.Angle.Between(this.bossEntity.x, this.bossEntity.y, player.x, player.y);
      const diff = Phaser.Math.Angle.Wrap(targetAngle - this.giantSword.rotation);
      
      // Heavy spring: angular acceleration = diff * springConstant - velocity * damping
      const springConstant = 0.045;
      const damping = 0.86;
      
      const acceleration = diff * springConstant;
      this.weaponAngularVelocity = (this.weaponAngularVelocity + acceleration) * damping;
      
      this.giantSword.rotation = Phaser.Math.Angle.Wrap(this.giantSword.rotation + this.weaponAngularVelocity * (delta / 16.67));

      // Resting/dragging on ground slightly when stationary
      const speedSq = this.bossEntity.physicsComponent.vx * this.bossEntity.physicsComponent.vx + this.bossEntity.physicsComponent.vy * this.bossEntity.physicsComponent.vy;
      if (speedSq < 10) {
        this.giantSword.rotation += Math.sin(time / 1200) * 0.0005 * delta;
      }
    } 
    else {
      // Execute the heavy attack swing timeline
      this.animTimer += delta;

      switch (this.animState) {
        case WeaponAnimState.WINDUP: {
          // Slow windup: Pull sword backward (opposite direction of attack) over windupDuration
          const progress = Math.min(1.0, this.animTimer / this.windupDuration);
          // Interpolate to pullback angle
          const pullbackAngle = this.targetSwingAngle - Math.PI * 0.65;
          const diff = Phaser.Math.Angle.Wrap(pullbackAngle - this.initialSwingAngle);
          this.giantSword.rotation = Phaser.Math.Angle.Wrap(this.initialSwingAngle + diff * progress);

          // Sword gains high-energy core glow (glowing red-hot)
          this.giantSword.setTint(0xff3300);

          // Lean body opposite of target angle to demonstrate physical leverage
          const pullBackDistance = -16 * progress;
          leanX = Math.cos(this.targetSwingAngle) * pullBackDistance;
          leanY = Math.sin(this.targetSwingAngle) * pullBackDistance;

          // Drag sparks from ground as weapon winds up
          if (Math.random() < 0.25) {
            const dragX = this.giantSword.x + Math.cos(this.giantSword.rotation) * 100;
            const dragY = this.giantSword.y + Math.sin(this.giantSword.rotation) * 100;
            this.scene.vfxManager.spawnSparks(dragX, dragY, 0x555555, 1);
          }

          if (progress >= 1.0) {
            this.transitionWeaponTo(WeaponAnimState.PAUSE);
          }
          break;
        }

        case WeaponAnimState.PAUSE: {
          // Pause briefly to create extreme anticipation/tension
          // Sword glows yellow-white
          this.giantSword.setTint(0xffdd00);

          // Keep body leaned back, and add aggressive micro-shaking to build immense anticipation
          const pullBackDistance = -16;
          const jitter = Math.sin(time * 0.12) * 1.8;
          leanX = Math.cos(this.targetSwingAngle) * pullBackDistance + jitter;
          leanY = Math.sin(this.targetSwingAngle) * pullBackDistance + jitter;
          this.giantSword.rotation += Math.sin(time * 0.15) * 0.015;
          
          if (this.animTimer >= this.pauseDuration) {
            this.transitionWeaponTo(WeaponAnimState.ACCEL);
          }
          break;
        }

        case WeaponAnimState.ACCEL: {
          // Massive acceleration swing over accelDuration (quick slice)
          const progress = Math.min(1.0, this.animTimer / this.accelDuration);
          const pullbackAngle = this.targetSwingAngle - Math.PI * 0.65;
          const swingDiff = Phaser.Math.Angle.Wrap(this.targetSwingAngle - pullbackAngle);
          
          // Cubic ease-in to represent weight acceleration!
          const easeProgress = Math.pow(progress, 3);
          this.giantSword.rotation = Phaser.Math.Angle.Wrap(pullbackAngle + swingDiff * easeProgress);

          // Forceful forward plunge of the body into the swing arc
          const plungeDistance = -16 + (36 * easeProgress); // Reaches +20px forward
          leanX = Math.cos(this.targetSwingAngle) * plungeDistance;
          leanY = Math.sin(this.targetSwingAngle) * plungeDistance;

          // Emit beautiful fiery sparks trailing the blade tip to emphasize speed and friction
          if (Math.random() < 0.7) {
            const tipX = this.giantSword.x + Math.cos(this.giantSword.rotation) * 120;
            const tipY = this.giantSword.y + Math.sin(this.giantSword.rotation) * 120;
            this.scene.vfxManager.spawnSparks(tipX, tipY, 0xff5500, 3);
          }

          if (progress >= 1.0) {
            this.transitionWeaponTo(WeaponAnimState.OVERSWING);
          }
          break;
        }

        case WeaponAnimState.OVERSWING: {
          // Overshoot naturally beyond target, shaking slightly to resolve heavy inertia
          const progress = Math.min(1.0, this.animTimer / this.overswingDuration);
          const overswingAmt = 0.45; // Swing overshoot radians
          
          // Sinusoidal overswing settlement curve
          const overAngle = this.targetSwingAngle + Math.sin(progress * Math.PI) * overswingAmt;
          this.giantSword.rotation = overAngle;

          // Settle the lean back towards center center
          const overshootDistance = 20 - (20 * progress);
          leanX = Math.cos(this.targetSwingAngle) * overshootDistance;
          leanY = Math.sin(this.targetSwingAngle) * overshootDistance;

          // Trailing friction embers during overswing
          if (Math.random() < 0.4) {
            const tipX = this.giantSword.x + Math.cos(this.giantSword.rotation) * 120;
            const tipY = this.giantSword.y + Math.sin(this.giantSword.rotation) * 120;
            this.scene.vfxManager.spawnSparks(tipX, tipY, 0xffaa00, 1);
          }

          if (progress >= 1.0) {
            this.transitionWeaponTo(WeaponAnimState.RECOVERY);
          }
          break;
        }

        case WeaponAnimState.RECOVERY: {
          // Slow settling recovery back to standard state
          const progress = Math.min(1.0, this.animTimer / this.recoveryDuration);
          const diff = Phaser.Math.Angle.Wrap(this.targetSwingAngle - this.giantSword.rotation);
          this.giantSword.rotation = Phaser.Math.Angle.Wrap(this.giantSword.rotation + diff * progress * 0.1);

          this.giantSword.clearTint(); // Revert back to slate gray weapon

          if (progress >= 1.0) {
            this.animState = WeaponAnimState.NORMAL;
          }
          break;
        }
      }

      // Apply the computed kinetic lean offset to body sprites
      this.sprite.x += leanX;
      this.sprite.y += leanY;
      this.leftShoulder.x += leanX;
      this.leftShoulder.y += leanY;
      this.rightShoulder.x += leanX;
      this.rightShoulder.y += leanY;
      this.moltenCore.x += leanX;
      this.moltenCore.y += leanY;
      this.leftEye.x += leanX;
      this.leftEye.y += leanY;
      this.rightEye.x += leanX;
      this.rightEye.y += leanY;
    }

    // Outer Edge Hand Attachment Alignment (No clipping through torso!)
    const phase = this.bossEntity.currentPhase || 1;
    const bodyScale = phase === 1 ? 2.5 : (phase === 2 ? 3.0 : 3.5);
    const handOffset = 25 * bodyScale; // Outer body perimeter relative to phase scale

    // Position hand rotating around body edge
    const handAngle = this.giantSword.rotation - 0.25; 
    const handX = this.bossEntity.x + leanX + Math.cos(handAngle) * handOffset;
    const handY = this.bossEntity.y + leanY + Math.sin(handAngle) * handOffset;

    this.swordHand.x = handX;
    this.swordHand.y = handY;

    // Position the handle pivot of the giant buster sword exactly at the outer hand grip
    this.giantSword.x = handX;
    this.giantSword.y = handY;

    // Apply jump y-offset and jump scale multiplier to all parts for beautiful scalable leaps!
    const jumpY = this.bossEntity.jumpY || 0;
    const jumpScale = this.bossEntity.jumpScale !== undefined ? this.bossEntity.jumpScale : 1.0;

    // Reset base eye scale so jumpScale multiplier doesn't compound exponentially
    this.leftEye.setScale(1.0);
    this.rightEye.setScale(1.0);

    if (jumpScale !== 1.0) {
      this.sprite.scaleX *= jumpScale;
      this.sprite.scaleY *= jumpScale;
      this.leftShoulder.scaleX *= jumpScale;
      this.leftShoulder.scaleY *= jumpScale;
      this.rightShoulder.scaleX *= jumpScale;
      this.rightShoulder.scaleY *= jumpScale;
      this.moltenCore.scaleX *= jumpScale;
      this.moltenCore.scaleY *= jumpScale;
      this.leftEye.scaleX *= jumpScale;
      this.leftEye.scaleY *= jumpScale;
      this.rightEye.scaleX *= jumpScale;
      this.rightEye.scaleY *= jumpScale;
      this.swordHand.scaleX *= jumpScale;
      this.swordHand.scaleY *= jumpScale;
      this.giantSword.scaleX *= jumpScale;
      this.giantSword.scaleY *= jumpScale;
    }

    if (jumpY !== 0) {
      this.sprite.y += jumpY;
      this.leftShoulder.y += jumpY;
      this.rightShoulder.y += jumpY;
      this.moltenCore.y += jumpY;
      this.leftEye.y += jumpY;
      this.rightEye.y += jumpY;
      this.swordHand.y += jumpY;
      this.giantSword.y += jumpY;
    }
  }

  /**
   * Triggers a heavy weapon swing sequence
   */
  public triggerHeavySwing(targetAngle: number, speedMult: number = 1.0): void {
    this.targetSwingAngle = targetAngle;
    this.initialSwingAngle = this.giantSword.rotation;

    // Scale swing state durations dynamically
    this.windupDuration = 800 / speedMult;
    this.pauseDuration = 150 / speedMult;
    this.accelDuration = 160 / speedMult;
    this.overswingDuration = 200 / speedMult;
    this.recoveryDuration = 500 / speedMult;

    this.transitionWeaponTo(WeaponAnimState.WINDUP);
  }

  private transitionWeaponTo(newState: WeaponAnimState): void {
    this.animState = newState;
    this.animTimer = 0;
  }

  public getAnimState(): string {
    return WeaponAnimState[this.animState];
  }

  public getAnimTimer(): number {
    return this.animTimer;
  }

  public destroy(): void {
    this.leftEye?.destroy();
    this.rightEye?.destroy();
    this.swordHand?.destroy();
  }
}
