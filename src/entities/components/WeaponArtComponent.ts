import Phaser from 'phaser';
import { BaseComponent } from '../BaseComponent.js';
import { BaseEntity } from '../BaseEntity.js';
import { WeaponComponent } from './WeaponComponent.js';
import { PhysicsComponent } from '../PhysicsComponent.js';
import { HealthComponent } from '../HealthComponent.js';
import { ModifierComponent } from './ModifierComponent.js';
import { AudioManager } from '../../managers/AudioManager.js';
import { EnemyAIComponent, EnemyState } from './EnemyAIComponent.js';
import { BossAIComponent, BossState } from './BossAIComponent.js';

export enum WeaponArtState {
  READY = 'READY',
  WIND_UP = 'WIND_UP',
  ACTIVE = 'ACTIVE',
  RECOVERY = 'RECOVERY',
  COOLDOWN = 'COOLDOWN'
}

export interface WeaponArtDefinition {
  id: string;
  name: string;
  cooldown: number; // in ms
  staminaCost: number;
  windUp: number; // in ms
  activeDuration: number; // in ms
  recovery: number; // in ms
  damageMultiplier: number;
  description: string;
}

export const WEAPON_ARTS: Record<string, WeaponArtDefinition> = {
  longsword: {
    id: 'longsword',
    name: 'Parry & Riposte',
    cooldown: 4000,
    staminaCost: 25,
    windUp: 150,
    activeDuration: 350,
    recovery: 200,
    damageMultiplier: 2.5,
    description: 'Raise the blade. If struck: negate damage, stagger attacker, slow time, and riposte for 250% damage. Otherwise, perform a quick slash on a short cooldown.'
  },
  greatsword: {
    id: 'greatsword',
    name: 'Titan Cleaver',
    cooldown: 6000,
    staminaCost: 40,
    windUp: 450,
    activeDuration: 250,
    recovery: 300,
    damageMultiplier: 3.5,
    description: 'A heavy overhead strike that creates a large shockwave and huge knockback. Cannot rotate. Speed adds damage.'
  },
  spear: {
    id: 'spear',
    name: 'Piercing Lunge',
    cooldown: 5000,
    staminaCost: 30,
    windUp: 100,
    activeDuration: 200,
    recovery: 150,
    damageMultiplier: 1.8,
    description: 'Dash forward, extending weapon reach and piercing all enemies. Refunds half cooldown if 3+ enemies are hit.'
  },
  twin_daggers: {
    id: 'twin_daggers',
    name: 'Shadow Flurry',
    cooldown: 4500,
    staminaCost: 25,
    windUp: 50,
    activeDuration: 600,
    recovery: 150,
    damageMultiplier: 0.6,
    description: 'Perform a rapid multi-hit combo of six slashes. Small forward lunges. Final hit launches enemies.'
  },
  warhammer: {
    id: 'warhammer',
    name: 'Earthbreaker',
    cooldown: 7000,
    staminaCost: 45,
    windUp: 300,
    activeDuration: 200,
    recovery: 250,
    damageMultiplier: 2.2,
    description: 'Leap slightly into the air and slam down, creating a shockwave and stunning nearby enemies.'
  },
  battle_axe: {
    id: 'battle_axe',
    name: 'Whirlwind',
    cooldown: 8000,
    staminaCost: 50,
    windUp: 100,
    activeDuration: 1000,
    recovery: 200,
    damageMultiplier: 1.4,
    description: 'Spin weapon 360° around player. Can move freely. Spin damage scales with movement speed.'
  }
};

export class WeaponArtComponent extends BaseComponent {
  public currentWeaponClass: string = 'longsword';
  public currentState: WeaponArtState = WeaponArtState.READY;

  // Active timers (ms)
  public stateTimer: number = 0;
  public cooldownTimer: number = 0;

  // Stamina values
  public maxStamina: number = 100;
  public stamina: number = 100;
  public staminaRegenRate: number = 25; // 25 stamina per sec

  // Dev Options
  public infiniteStamina: boolean = false;

  // Live telemetry metrics
  public telemetryDamageDealt: number = 0;
  public telemetrySuccessfulHits: number = 0;
  public telemetryCriticalHits: number = 0;

  // State-specific helper flags & caches
  private angleAtCast: number = 0;
  private lockedTargetX: number = 0;
  private lockedTargetY: number = 0;
  private parriedThisCast: boolean = false;
  private hitEnemiesThisCast: Set<string> = new Set();
  private lastDaggerSlashTime: number = 0;
  private daggerSlashesCount: number = 0;
  private visualIndicatorCircle?: Phaser.GameObjects.Arc;
  private visualIndicatorLine?: Phaser.GameObjects.Line;

  constructor(owner: BaseEntity) {
    super(owner);
  }

  public init(): void {
    this.currentWeaponClass = this.getDefaultWeaponClass();
    this.currentState = WeaponArtState.READY;
    this.cooldownTimer = 0;
    this.stamina = this.maxStamina;
  }

  private getDefaultWeaponClass(): string {
    const scene = this.getScene();
    if (!scene) return 'longsword';
    const gladiatorId = (scene as any).selectedGladiator?.id;
    if (gladiatorId === 'knight') return 'greatsword';
    if (gladiatorId === 'duelist') return 'twin_daggers';
    return 'longsword'; // Mage defaults to Longsword/broadsword
  }

  public setWeaponClass(weaponClass: string): void {
    if (WEAPON_ARTS[weaponClass]) {
      this.currentWeaponClass = weaponClass;
      this.currentState = WeaponArtState.READY;
      this.stateTimer = 0;
      this.cooldownTimer = 0;
      this.resetTelemetry();
    }
  }

  public resetTelemetry(): void {
    this.telemetryDamageDealt = 0;
    this.telemetrySuccessfulHits = 0;
    this.telemetryCriticalHits = 0;
  }

  private getScene(): Phaser.Scene | null {
    return this.owner.gameObject?.scene || null;
  }

  public update(time: number, delta: number): void {
    const scene = this.getScene() as any;
    if (!scene || !this.owner.gameObject) return;

    // Stamina Regeneration
    if (this.stamina < this.maxStamina) {
      const recoveryMultiplier = scene.selectedGladiator?.id === 'duelist' ? 1.4 : 1.0; // Windrunner passive
      this.stamina = Math.min(this.maxStamina, this.stamina + this.staminaRegenRate * (delta / 1000) * recoveryMultiplier);
    }

    // Cooldown ticks
    if (this.currentState === WeaponArtState.COOLDOWN) {
      this.cooldownTimer = Math.max(0, this.cooldownTimer - delta);
      if (this.cooldownTimer <= 0) {
        this.currentState = WeaponArtState.READY;
        this.playFlashEffect();
      }
    }

    // Handle Active States and Timers
    if (this.currentState !== WeaponArtState.READY && this.currentState !== WeaponArtState.COOLDOWN) {
      this.stateTimer -= delta;

      // Maintain specific state behaviors per frame
      this.executeStateTick(time, delta);

      if (this.stateTimer <= 0) {
        this.transitionToNextState(time);
      }
    }

    // Update cooldown UI alignment
    this.updateCooldownIndicator();
  }

  /**
   * Attempts to cast the current Weapon Art
   */
  public trigger(): boolean {
    if (this.currentState !== WeaponArtState.READY) return false;

    // Do not trigger during dodge rolls
    const scene = this.getScene() as any;
    if (scene && scene.isDodging) return false;

    const def = WEAPON_ARTS[this.currentWeaponClass];
    if (!def) return false;

    // Stamina check
    if (this.stamina < def.staminaCost && !this.infiniteStamina) {
      AudioManager.getInstance().playSFX('hurt'); // small buzzer sound
      this.showFloatingText('OUT OF STAMINA!', 0xff3333);
      return false;
    }

    // Consume stamina
    if (!this.infiniteStamina) {
      this.stamina -= def.staminaCost;
    }

    // Trigger state transition
    this.currentState = WeaponArtState.WIND_UP;
    this.stateTimer = def.windUp;
    this.parriedThisCast = false;
    this.hitEnemiesThisCast.clear();

    const pointer = scene.input.activePointer;
    this.angleAtCast = Math.atan2(pointer.worldY - this.owner.y, pointer.worldX - this.owner.x);
    this.lockedTargetX = pointer.worldX;
    this.lockedTargetY = pointer.worldY;

    // Visual indicators and sound hooks based on weapon type
    this.playWindUpVFX();

    return true;
  }

  private executeStateTick(time: number, delta: number): void {
    const scene = this.getScene() as any;
    if (!scene) return;

    const weapon = this.owner.getComponent<WeaponComponent>('weapon');
    const physics = this.owner.getComponent<PhysicsComponent>('physics');

    if (this.currentState === WeaponArtState.WIND_UP) {
      // Lock rotation for Titan Cleaver, Spear, Warhammer, Twin Daggers, and Longsword
      if (this.currentWeaponClass !== 'battle_axe') {
        if (weapon) {
          weapon.overrideTargetX = this.lockedTargetX;
          weapon.overrideTargetY = this.lockedTargetY;
        }
        const offhand = this.owner.getComponent<WeaponComponent>('offhand_weapon');
        if (offhand) {
          offhand.overrideTargetX = this.lockedTargetX;
          offhand.overrideTargetY = this.lockedTargetY;
        }
      }
    }

    if (this.currentState === WeaponArtState.ACTIVE) {
      if (this.currentWeaponClass !== 'battle_axe') {
        // Locked rotation continues
        if (weapon) {
          weapon.overrideTargetX = this.lockedTargetX;
          weapon.overrideTargetY = this.lockedTargetY;
        }
        const offhand = this.owner.getComponent<WeaponComponent>('offhand_weapon');
        if (offhand) {
          offhand.overrideTargetX = this.lockedTargetX;
          offhand.overrideTargetY = this.lockedTargetY;
        }
      }

      if (this.currentWeaponClass === 'spear') {
        // Perform dash thrust movement
        if (physics) {
          const dashSpeed = 900;
          physics.setVelocity(Math.cos(this.angleAtCast) * dashSpeed, Math.sin(this.angleAtCast) * dashSpeed);
        }
        // Collide and pierce enemies
        this.checkSpearCollisions();
      }

      if (this.currentWeaponClass === 'twin_daggers') {
        // Deal 6 flurry attacks spaced by 100ms
        if (time - this.lastDaggerSlashTime >= 100 && this.daggerSlashesCount < 6) {
          this.lastDaggerSlashTime = time;
          this.daggerSlashesCount++;
          this.executeDaggerStrike();
        }
      }

      if (this.currentWeaponClass === 'battle_axe') {
        // Spin the primary sword around the player rapidly (increment offset)
        if (weapon) {
          if (weapon.overrideAngle === undefined) {
             weapon.overrideAngle = weapon.currentAngle;
          }
          weapon.overrideAngle += 0.35 * (delta / 16); // fast spin math
        }
        // If dual wield is active, spin offhand too
        const offhand = this.owner.getComponent<WeaponComponent>('offhand_weapon');
        if (offhand) {
          if (offhand.overrideAngle === undefined) {
             offhand.overrideAngle = offhand.currentAngle;
          }
          offhand.overrideAngle -= 0.35 * (delta / 16);
        }
        this.checkWhirlwindCollisions();
      }
    }
  }

  private transitionToNextState(time: number): void {
    const def = WEAPON_ARTS[this.currentWeaponClass];
    const weapon = this.owner.getComponent<WeaponComponent>('weapon');
    const physics = this.owner.getComponent<PhysicsComponent>('physics');

    if (this.currentState === WeaponArtState.WIND_UP) {
      this.currentState = WeaponArtState.ACTIVE;
      this.stateTimer = def.activeDuration;

      // Start of active trigger functions
      if (this.currentWeaponClass === 'greatsword') {
        // Titan Cleaver Slam forward lunge
        if (physics) {
          const lungeSpeed = 450;
          physics.setVelocity(Math.cos(this.angleAtCast) * lungeSpeed, Math.sin(this.angleAtCast) * lungeSpeed);
        }
        this.executeTitanCleaverSlam();
      } else if (this.currentWeaponClass === 'spear') {
        // Extend spear reach visually & physically during lunge
        if (weapon) {
          weapon.length += 60; // huge extension
        }
        AudioManager.getInstance().playSFX('dash');
      } else if (this.currentWeaponClass === 'twin_daggers') {
        this.lastDaggerSlashTime = time;
        this.daggerSlashesCount = 1;
        this.executeDaggerStrike();
      } else if (this.currentWeaponClass === 'warhammer') {
        this.executeEarthbreakerSlam();
      } else if (this.currentWeaponClass === 'longsword') {
        // Raise parry shield/block visual
        this.spawnParryShieldVisual();
        AudioManager.getInstance().playSFX('powerup');
      } else if (this.currentWeaponClass === 'battle_axe') {
        AudioManager.getInstance().playSFX('powerup');
      }
    } else if (this.currentState === WeaponArtState.ACTIVE) {
      this.currentState = WeaponArtState.RECOVERY;
      this.stateTimer = def.recovery;

      // Restore modifications
      if (this.currentWeaponClass !== 'battle_axe') {
        if (weapon) {
          weapon.overrideTargetX = undefined;
          weapon.overrideTargetY = undefined;
        }
        const offhand = this.owner.getComponent<WeaponComponent>('offhand_weapon');
        if (offhand) {
          offhand.overrideTargetX = undefined;
          offhand.overrideTargetY = undefined;
        }
      }
      if (this.currentWeaponClass === 'spear' && weapon) {
        weapon.length = Math.max(50, weapon.length - 60); // restore reach
      }
      if (this.currentWeaponClass === 'warhammer') {
        // Restore player sprite jump scaling
        if (this.owner.gameObject) {
          this.owner.gameObject.setScale(1);
        }
      }
      if (this.currentWeaponClass === 'battle_axe' && weapon) {
        weapon.overrideAngle = undefined;
        const offhand = this.owner.getComponent<WeaponComponent>('offhand_weapon');
        if (offhand) {
          offhand.overrideAngle = undefined;
        }
      }

      // If Longsword parry active window completes without being struck:
      if (this.currentWeaponClass === 'longsword' && !this.parriedThisCast) {
        // Perform a quick slash
        this.executeQuickParrySlash();
      }
    } else if (this.currentState === WeaponArtState.RECOVERY) {
      this.currentState = WeaponArtState.COOLDOWN;
      
      // Determine final cooldown (longsword has short cooldown if parry failed)
      let finalCooldown = def.cooldown;
      if (this.currentWeaponClass === 'longsword' && !this.parriedThisCast) {
        finalCooldown = 1500; // short 1.5s cooldown
      }
      this.cooldownTimer = finalCooldown;
    }
  }

  // --- INDIVIDUAL SKILL EXECUTION DETAILS ---

  /**
   * Parry & Riposte Interceptor
   */
  public handleParry(attacker?: BaseEntity): void {
    if (this.currentWeaponClass !== 'longsword' || this.currentState !== WeaponArtState.ACTIVE || this.parriedThisCast) return;

    this.parriedThisCast = true;
    const scene = this.getScene() as any;
    if (!scene) return;

    // Negate damage by calling block effects
    this.showFloatingText('PARRY!', 0x00ffff);
    AudioManager.getInstance().playSFX('powerup');

    // Stagger attacker
    if (attacker) {
      const ai = attacker.getComponent<EnemyAIComponent>('ai');
      if (ai && typeof (ai as any).stun === 'function') {
        (ai as any).stun(1000); // 1.0s stun
      }
    }

    // Slow time for 0.25 seconds
    scene.timeSlowTimer = 250;

    // Screen Shake
    scene.cameras.main.shake(120, 0.015);

    // Perform powerful Riposte: automatic radial blast
    const riposteRadius = 130;
    const damageModifier = WEAPON_ARTS.longsword.damageMultiplier;

    // Visual shockwave slice
    const shock = scene.add.circle(this.owner.x, this.owner.y, 10, 0x00f3ff, 0.35);
    scene.add.tween({
      targets: shock,
      radius: riposteRadius,
      alpha: 0,
      duration: 300,
      onComplete: () => shock.destroy()
    });

    // Ring glow
    const ring = scene.add.graphics();
    ring.lineStyle(3, 0xffffff, 0.8);
    ring.strokeCircle(this.owner.x, this.owner.y, riposteRadius);
    scene.add.tween({
      targets: ring,
      alpha: 0,
      duration: 250,
      onComplete: () => ring.destroy()
    });

    // Check hit list
    scene.enemies.forEach((enemy: BaseEntity) => {
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(this.owner.x, this.owner.y, enemy.x, enemy.y);
      if (dist <= riposteRadius) {
        // Deal Riposte damage (guaranteed Crit!)
        this.telemetrySuccessfulHits++;
        this.telemetryCriticalHits++;
        
        // Temporarily log damage to report
        const healthBefore = enemy.getComponent<HealthComponent>('health')?.getHp() || 0;
        
        // Riposte inherits explosive crits, etc. by forcing critical damage
        scene.hitEnemy(enemy, Math.atan2(enemy.y - this.owner.y, enemy.x - this.owner.x), null, false, damageModifier, true);
        
        const healthAfter = enemy.getComponent<HealthComponent>('health')?.getHp() || 0;
        const damageDealt = Math.max(0, healthBefore - healthAfter);
        this.telemetryDamageDealt += damageDealt;
      }
    });

    // Proceed straight to recovery state
    this.currentState = WeaponArtState.RECOVERY;
    this.stateTimer = WEAPON_ARTS.longsword.recovery;
  }

  private executeQuickParrySlash(): void {
    const scene = this.getScene() as any;
    if (!scene) return;

    this.showFloatingText('Slash', 0xa1a1aa);
    AudioManager.getInstance().playSFX('swing');

    const slashAngle = this.owner.gameObject ? (this.owner.gameObject as any).rotation : 0;
    const weapon = this.owner.getComponent<WeaponComponent>('weapon');
    const length = weapon ? weapon.length : 60;

    // Small forward slash arc collision
    scene.enemies.forEach((enemy: BaseEntity) => {
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(this.owner.x, this.owner.y, enemy.x, enemy.y);
      if (dist <= length + 25) {
        const angleToEnemy = Math.atan2(enemy.y - this.owner.y, enemy.x - this.owner.x);
        const diff = Phaser.Math.Angle.Wrap(angleToEnemy - slashAngle);
        if (Math.abs(diff) < Math.PI / 3) { // 60 degrees arc
          this.telemetrySuccessfulHits++;
          scene.hitEnemy(enemy, angleToEnemy, weapon, false, 1.0); // normal damage
        }
      }
    });
  }

  /**
   * Titan Cleaver Overhead Slam (`greatsword`)
   */
  private executeTitanCleaverSlam(): void {
    const scene = this.getScene() as any;
    if (!scene) return;

    const physics = this.owner.getComponent<PhysicsComponent>('physics');

    AudioManager.getInstance().playSFX('powerup');
    scene.cameras.main.shake(200, 0.025);

    // Calculate slam landing location
    const slamReach = 110;
    const slamX = this.owner.x + Math.cos(this.angleAtCast) * slamReach;
    const slamY = this.owner.y + Math.sin(this.angleAtCast) * slamReach;

    // Create shockwave circle
    const shock = scene.add.circle(slamX, slamY, 15, 0xff7700, 0.4);
    scene.add.tween({
      targets: shock,
      radius: 120,
      alpha: 0,
      duration: 350,
      onComplete: () => shock.destroy()
    });

    // Create orange/yellow radial burst lines
    const shockLine = scene.add.graphics();
    shockLine.lineStyle(4, 0xffcc00, 0.9);
    shockLine.strokeCircle(slamX, slamY, 110);
    scene.add.tween({
      targets: shockLine,
      alpha: 0,
      duration: 300,
      onComplete: () => shockLine.destroy()
    });

    this.showFloatingText('TITAN CLEAVER!', 0xffaa00);

    // If they have boomerang_blade, launch giant returning sword!
    const modifiers = this.owner.getComponent<ModifierComponent>('modifiers');
    if (modifiers && modifiers.hasLegendaryUpgrade('boomerang_blade') && typeof scene.launchBoomerang === 'function') {
      scene.launchBoomerang(this.angleAtCast, 2.5, true); // giant size and forced crit!
    }

    // Slam damage checking
    scene.enemies.forEach((enemy: BaseEntity) => {
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(slamX, slamY, enemy.x, enemy.y);
      if (dist <= 120) {
        this.telemetrySuccessfulHits++;
        
        // Stagger enemies
        const ai = enemy.getComponent<EnemyAIComponent>('ai');
        if (ai && typeof (ai as any).stun === 'function') {
          (ai as any).stun(800); // 0.8s stagger
        }

        // Velocity contributes to damage:
        let velContribution = 1.0;
        const speed = physics ? Math.sqrt(physics.vx * physics.vx + physics.vy * physics.vy) : 0;
        velContribution += (speed / 150) * 0.40; // up to 40% speed bonus damage

        const baseDam = WEAPON_ARTS.greatsword.damageMultiplier * velContribution;
        scene.hitEnemy(enemy, Math.atan2(enemy.y - slamY, enemy.x - slamX), null, false, baseDam);
      }
    });
  }

  /**
   * Piercing Lunge thrust collision
   */
  private checkSpearCollisions(): void {
    const scene = this.getScene() as any;
    if (!scene) return;

    const weapon = this.owner.getComponent<WeaponComponent>('weapon');
    const length = weapon ? weapon.length : 120;
    const reach = length + 20;

    scene.enemies.forEach((enemy: BaseEntity) => {
      if (!enemy.active || this.hitEnemiesThisCast.has(enemy.id)) return;

      const dist = Phaser.Math.Distance.Between(this.owner.x, this.owner.y, enemy.x, enemy.y);
      if (dist <= reach) {
        const angleToEnemy = Math.atan2(enemy.y - this.owner.y, enemy.x - this.owner.x);
        const angleDiff = Phaser.Math.Angle.Wrap(angleToEnemy - this.angleAtCast);

        // narrow pierce line (approx 30 degrees)
        if (Math.abs(angleDiff) < Math.PI / 12) {
          this.hitEnemiesThisCast.add(enemy.id);
          this.telemetrySuccessfulHits++;

          // Pierced enemies continue taking passive damage, deal 1.8x spear lunge damage
          scene.hitEnemy(enemy, this.angleAtCast, weapon, false, WEAPON_ARTS.spear.damageMultiplier);

          // Spawn custom blood sparks
          scene.vfxManager.spawnSparks(enemy.x, enemy.y, 0x00f3ff, 5);

          // If 3+ pierced, refund half cooldown
          if (this.hitEnemiesThisCast.size >= 3) {
            this.showFloatingText('PIERCE SYNERGY! Cooldown halved', 0x00f3ff);
            // Refund handled during state transition when cooldown starts!
          }
        }
      }
    });
  }

  /**
   * Shadow Flurry individual slash combo
   */
  private executeDaggerStrike(): void {
    const scene = this.getScene() as any;
    if (!scene) return;

    // Small lunge movement forward
    const physics = this.owner.getComponent<PhysicsComponent>('physics');
    if (physics) {
      const stepSpeed = 350;
      physics.setVelocity(Math.cos(this.angleAtCast) * stepSpeed, Math.sin(this.angleAtCast) * stepSpeed);
    }

    AudioManager.getInstance().playSFX('swing');

    // Alternating slash angles for visual combos
    const offsetArc = (this.daggerSlashesCount % 2 === 0 ? 1 : -1) * (Math.PI / 5);
    const strikeAngle = this.angleAtCast + offsetArc;

    // Draw visual swipe arc line
    const length = 75;
    const swipeX = this.owner.x + Math.cos(strikeAngle) * length;
    const swipeY = this.owner.y + Math.sin(strikeAngle) * length;
    const line = scene.add.line(0, 0, this.owner.x, this.owner.y, swipeX, swipeY, 0xf43f5e, 0.85);
    line.setLineWidth(2.5);
    scene.add.tween({
      targets: line,
      alpha: 0,
      duration: 120,
      onComplete: () => line.destroy()
    });

    const isFinalLaunchHit = this.daggerSlashesCount === 6;
    if (isFinalLaunchHit) {
      this.showFloatingText('LAUNCH!', 0xf43f5e);
    }

    // Collision detection
    scene.enemies.forEach((enemy: BaseEntity) => {
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(this.owner.x, this.owner.y, enemy.x, enemy.y);
      if (dist <= length + 15) {
        const angleToEnemy = Math.atan2(enemy.y - this.owner.y, enemy.x - this.owner.x);
        const diff = Phaser.Math.Angle.Wrap(angleToEnemy - strikeAngle);

        if (Math.abs(diff) < Math.PI / 4) { // generous arc
          this.telemetrySuccessfulHits++;

          // Stormcaller Slashes lightning hook
          const modifiers = this.owner.getComponent<ModifierComponent>('modifiers');
          if (modifiers && modifiers.hasLegendaryUpgrade('chain_lightning') && Math.random() < 0.40 && typeof scene.triggerChainLightning === 'function') {
            scene.triggerChainLightning(enemy, 15);
          }

          let multiplier = WEAPON_ARTS.twin_daggers.damageMultiplier;
          if (isFinalLaunchHit) {
            multiplier *= 2.2; // heavy launch hit
          }

          // Launch or standard hit
          scene.hitEnemy(enemy, isFinalLaunchHit ? this.angleAtCast : angleToEnemy, null, false, multiplier);

          if (isFinalLaunchHit && enemy.getComponent<PhysicsComponent>('physics')) {
            // Apply high launch knockback
            const enemyPhys = enemy.getComponent<PhysicsComponent>('physics');
            enemyPhys?.setVelocity(Math.cos(this.angleAtCast) * 550, Math.sin(this.angleAtCast) * 550);
          }
        }
      }
    });
  }

  /**
   * Earthbreaker slam (`warhammer`)
   */
  private executeEarthbreakerSlam(): void {
    const scene = this.getScene() as any;
    if (!scene) return;

    AudioManager.getInstance().playSFX('powerup');
    scene.cameras.main.shake(250, 0.03);

    const slamRadius = 150;

    // Visual crack rings
    const shock = scene.add.circle(this.owner.x, this.owner.y, 20, 0xbf55ec, 0.45);
    scene.add.tween({
      targets: shock,
      radius: slamRadius,
      alpha: 0,
      duration: 400,
      onComplete: () => shock.destroy()
    });

    const linesGfx = scene.add.graphics();
    linesGfx.lineStyle(3.5, 0xd800ff, 0.95);
    linesGfx.strokeCircle(this.owner.x, this.owner.y, slamRadius);
    scene.add.tween({
      targets: linesGfx,
      alpha: 0,
      duration: 350,
      onComplete: () => linesGfx.destroy()
    });

    this.showFloatingText('EARTHBREAKER!', 0xc0392b);

    scene.enemies.forEach((enemy: BaseEntity) => {
      if (!enemy.active) return;
      const dist = Phaser.Math.Distance.Between(this.owner.x, this.owner.y, enemy.x, enemy.y);
      if (dist <= slamRadius) {
        this.telemetrySuccessfulHits++;

        // Stun nearby enemies: Bosses receive reduced stun
        const isBoss = enemy.id.includes('boss') || enemy.id.includes('colossus') || enemy.id.includes('placeholder');
        const stunDuration = isBoss ? 500 : 1500; // standard stun 1.5s, bosses 0.5s

        const ai = enemy.getComponent<EnemyAIComponent>('ai');
        if (ai && typeof (ai as any).stun === 'function') {
          (ai as any).stun(stunDuration);
        }

        // Deal slam damage (2.2x earthbreaker damage multiplier)
        const pushAngle = Math.atan2(enemy.y - this.owner.y, enemy.x - this.owner.x);
        scene.hitEnemy(enemy, pushAngle, null, false, WEAPON_ARTS.warhammer.damageMultiplier);
      }
    });
  }

  /**
   * Whirlwind Axe Spin
   */
  private checkWhirlwindCollisions(): void {
    const scene = this.getScene() as any;
    if (!scene) return;

    const weapon = this.owner.getComponent<WeaponComponent>('weapon');
    const radius = weapon ? weapon.length + 35 : 100;

    // Movement speed increases spin damage:
    const physics = this.owner.getComponent<PhysicsComponent>('physics');
    const speed = physics ? Math.sqrt(physics.vx * physics.vx + physics.vy * physics.vy) : 0;
    const speedBonusMultiplier = 1.0 + (speed / 150) * 0.40; // up to +40% damage from movement!

    const dmgMult = WEAPON_ARTS.battle_axe.damageMultiplier * speedBonusMultiplier;

    scene.enemies.forEach((enemy: BaseEntity) => {
      if (!enemy.active) return;

      const dist = Phaser.Math.Distance.Between(this.owner.x, this.owner.y, enemy.x, enemy.y);
      if (dist <= radius) {
        // Prevent continuous multi-hit farming on every single frame:
        // Use the weapon's hit cooldowns map
        if (weapon && weapon.registerHit(enemy.id)) {
          this.telemetrySuccessfulHits++;

          // Deal Whirlwind damage
          const pushAngle = Math.atan2(enemy.y - this.owner.y, enemy.x - this.owner.x);
          scene.hitEnemy(enemy, pushAngle, weapon, false, dmgMult);

          // If dual wield is active, hit a second time with offhand damage!
          const offhand = this.owner.getComponent<WeaponComponent>('offhand_weapon');
          if (offhand && offhand.registerHit(enemy.id)) {
            scene.hitEnemy(enemy, pushAngle - Math.PI, offhand, true, dmgMult * 0.70); // 70% damage for offhand
          }
        }
      }
    });

    // Draw visual sweeping ring
    const spinRing = scene.add.arc(this.owner.x, this.owner.y, radius, 0, 360, false, 0x00ffcc, 0.04);
    scene.add.tween({
      targets: spinRing,
      alpha: 0,
      duration: 100,
      onComplete: () => spinRing.destroy()
    });
  }

  // --- AUDIO / VISUAL HELPERS ---

  private playWindUpVFX(): void {
    const scene = this.getScene() as any;
    if (!scene) return;

    if (this.currentWeaponClass === 'greatsword') {
      // Draw red windup targeting line forward
      const lineX = this.owner.x + Math.cos(this.angleAtCast) * 160;
      const lineY = this.owner.y + Math.sin(this.angleAtCast) * 160;
      this.visualIndicatorLine = scene.add.line(0, 0, this.owner.x, this.owner.y, lineX, lineY, 0xff3300, 0.4);
      this.visualIndicatorLine.setLineWidth(2);
      scene.add.tween({
        targets: this.visualIndicatorLine,
        alpha: 0,
        duration: WEAPON_ARTS.greatsword.windUp,
        onComplete: () => {
          if (this.visualIndicatorLine) {
            this.visualIndicatorLine.destroy();
            this.visualIndicatorLine = undefined;
          }
        }
      });
    }

    if (this.currentWeaponClass === 'warhammer') {
      // Leap scaling visual
      if (this.owner.gameObject) {
        scene.add.tween({
          targets: this.owner.gameObject,
          scaleX: 1.4,
          scaleY: 1.4,
          yoyo: true,
          duration: WEAPON_ARTS.warhammer.windUp / 2
        });
      }
    }

    // Spawn sparks indicator around player
    const tintColor = this.currentWeaponClass === 'longsword' ? 0x00f3ff :
                      this.currentWeaponClass === 'greatsword' ? 0xff7700 :
                      this.currentWeaponClass === 'spear' ? 0x1e90ff :
                      this.currentWeaponClass === 'twin_daggers' ? 0xf43f5e :
                      this.currentWeaponClass === 'warhammer' ? 0x9b59b6 : 0xf1c40f;

    scene.vfxManager.spawnSparks(this.owner.x, this.owner.y, tintColor, 10);
  }

  private spawnParryShieldVisual(): void {
    const scene = this.getScene() as any;
    if (!scene) return;

    this.visualIndicatorCircle = scene.add.arc(this.owner.x, this.owner.y, 45, 0, 360, false, 0x00f3ff, 0.15);
    this.visualIndicatorCircle.setStrokeStyle(2, 0x00ffff, 0.85);

    scene.add.tween({
      targets: this.visualIndicatorCircle,
      alpha: 0,
      duration: WEAPON_ARTS.longsword.activeDuration,
      onComplete: () => {
        if (this.visualIndicatorCircle) {
          this.visualIndicatorCircle.destroy();
          this.visualIndicatorCircle = undefined;
        }
      }
    });
  }

  private playFlashEffect(): void {
    // Briefly flashes the player sprite on cooldown ready
    if (this.owner.gameObject) {
      const scene = this.getScene() as any;
      if (scene) {
        scene.vfxManager.spawnSparks(this.owner.x, this.owner.y, 0x00f3ff, 12);
        AudioManager.getInstance().playSFX('powerup');
      }
    }
  }

  private showFloatingText(text: string, color: number): void {
    const scene = this.getScene() as any;
    if (!scene) return;
    const txt = scene.add.text(this.owner.x, this.owner.y - 45, text, {
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: '13px',
      color: '#' + color.toString(16),
      fontStyle: 'bold'
    }).setOrigin(0.5);

    scene.add.tween({
      targets: txt,
      y: this.owner.y - 75,
      alpha: 0,
      duration: 600,
      onComplete: () => txt.destroy()
    });
  }

  private updateCooldownIndicator(): void {
    // HUD visual overlay coordinates updated in GameScene
  }

  public getCooldownPercent(): number {
    if (this.currentState === WeaponArtState.COOLDOWN) {
      const def = WEAPON_ARTS[this.currentWeaponClass];
      let fullCD = def.cooldown;
      if (this.currentWeaponClass === 'longsword' && !this.parriedThisCast) {
        fullCD = 1500; // reduced cooldown
      }
      return this.cooldownTimer / fullCD;
    }
    return 0;
  }

  public destroy(): void {
    super.destroy();
    if (this.visualIndicatorCircle) this.visualIndicatorCircle.destroy();
    if (this.visualIndicatorLine) this.visualIndicatorLine.destroy();
  }
}
