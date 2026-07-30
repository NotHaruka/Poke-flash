import Phaser from 'phaser';
import { BossEntity } from './BossEntity.js';
import { PhysicsComponent } from './PhysicsComponent.js';
import { BossHealthComponent } from './BossHealthComponent.js';
import { BossAIComponent, BossState, IBossAIState } from './components/BossAIComponent.js';
import { EventBus } from '../core/EventBus.js';
import { EventTopic } from '../core/Constants.js';
import { BaseEntity } from './BaseEntity.js';
import { HealthComponent } from './HealthComponent.js';
import { EnemyAIComponent } from './components/EnemyAIComponent.js';
import { AudioManager } from '../managers/AudioManager.js';
import { BossAnimationController } from './components/BossAnimationController.js';
import { CameraEffectsManager } from '../managers/CameraEffectsManager.js';
import { ArenaEffectsManager } from '../managers/ArenaEffectsManager.js';
import { EnvironmentalEffectsManager } from '../managers/EnvironmentalEffectsManager.js';

export class ColossusBossEntity extends BossEntity {
  private aiComponent!: BossAIComponent;
  private physicsComponent!: PhysicsComponent;
  private healthComponent!: BossHealthComponent;
  private scene: Phaser.Scene & any;

  // Procedural visual components
  private moltenCore!: Phaser.GameObjects.Arc;
  private leftShoulder!: Phaser.GameObjects.Arc;
  private rightShoulder!: Phaser.GameObjects.Arc;
  private giantSword!: Phaser.GameObjects.Sprite;
  
  // Active warnings, hazards, and projectiles
  private activeTelegraphs: Phaser.GameObjects.Graphics[] = [];
  private activeHazards: (Phaser.GameObjects.GameObject & any)[] = [];
  private activeProjectiles: (Phaser.GameObjects.GameObject & any)[] = [];

  // Boss internal attack states & timers
  public attackTimer: number = 0;
  public nextAttackTime: number = 2000; // ms before next attack choice
  public activeAttackName: string = 'None';
  public isPerformingAttack: boolean = false;
  
  // Footstep timing
  private footstepTimer: number = 0;
  private emberTimer: number = 0;

  // Phase 3 Last Stand shield
  public shieldHp: number = 0;
  public maxShieldHp: number = 100;
  public shieldActive: boolean = false;
  private lastStandTimer: number = 0;

  // Dev shortcuts states
  public devInfiniteHp: boolean = false;
  public skipIntroFlag: boolean = false;

  public animationController!: BossAnimationController;

  // Jump offsets for scalable air leaping visual effects
  public jumpY: number = 0;
  public jumpScale: number = 1.0;

  public get sprite(): Phaser.GameObjects.Sprite {
    return this.gameObject as Phaser.GameObjects.Sprite;
  }

  constructor(scene: Phaser.Scene & any, x: number, y: number) {
    // Create base boss sprite using existing boss-texture
    const sprite = scene.add.sprite(x, y, 'boss-texture');
    sprite.setDepth(15);
    sprite.setScale(2.5); // Scaled down to prevent overlapping the whole screen (2.5x)
    sprite.setTint(0x0a0a0f); // Pure dark obsidian base

    super(`boss_colossus_${Date.now()}`, sprite, 'THE FALLEN COLOSSUS');
    this.syncPosition = false;
    this.scene = scene;

    // 1. Create procedural overlay body parts
    this.createProceduralVisuals(x, y);

    // Initialize animation controller
    this.animationController = new BossAnimationController(this, scene);

    // 2. Add ECS Components
    this.physicsComponent = this.addComponent('physics', new PhysicsComponent(this, 35)); // Slow, heavy movement
    this.physicsComponent.setBoundaries(32, 1600 - 32, 32, 1000 - 32);
    this.physicsComponent.collisionRadius = 115; // Adjusted to match the actual body scale (2.5x base * 52px = ~130px visual, set to 115px for comfortable player overlap)
    this.physicsComponent.weight = 250.0; // Unstoppable obsidian colossus!
    
    this.healthComponent = this.addComponent('health', new BossHealthComponent(this, 1200, this)); // Rich boss HP
    this.aiComponent = this.addComponent('ai', new BossAIComponent(this, scene.player));

    // 3. Initialize Components
    this.physicsComponent.init();
    this.healthComponent.init();
    this.aiComponent.init();

    // 4. Override Default Boss AI States with Fallen Colossus Handcrafted Behaviors
    this.setupCustomAI();

    // 5. Place in INTRO state initially
    this.aiComponent.transitionTo(BossState.INTRO);
  }

  private createProceduralVisuals(x: number, y: number): void {
    // A glowing molten red core in the center of the body
    this.moltenCore = this.scene.add.circle(x, y, 10, 0xff2200, 1.0);
    this.moltenCore.setDepth(16);

    // Left and right iron shoulder plates
    this.leftShoulder = this.scene.add.circle(x - 32, y - 15, 12, 0x334155, 0.9);
    this.leftShoulder.setStrokeStyle(2.5, 0x1e293b);
    this.leftShoulder.setDepth(17);

    this.rightShoulder = this.scene.add.circle(x + 32, y - 15, 12, 0x334155, 0.9);
    this.rightShoulder.setStrokeStyle(2.5, 0x1e293b);
    this.rightShoulder.setDepth(17);

    // Giant legendary broadsword asset
    this.giantSword = this.scene.add.sprite(x, y, 'sword-texture');
    this.giantSword.setOrigin(0.1, 0.5); // Pivot on the handle
    this.giantSword.setScale(2.0); // Gigantic weapon scaled down to fit the smaller body
    this.giantSword.setDepth(18);
    this.giantSword.setTint(0x334155); // Heavy obsidian blade
  }

  private setupCustomAI(): void {
    // Custom states mapped over standard BossAIComponent states
    this.aiComponent.registerState(BossState.INTRO, new ColossusIntroState());
    this.aiComponent.registerState(BossState.CHASE, new ColossusChaseState());
    this.aiComponent.registerState(BossState.ATTACK, new ColossusAttackState());
    this.aiComponent.registerState(BossState.PHASE_TRANSITION, new ColossusPhaseTransitionState());
  }

  public update(time: number, delta: number): void {
    super.update(time, delta);

    if (!this.active) {
      this.destroyVisualsAndHazards();
      return;
    }

    // Force Infinite HP in developer mode if set
    if (this.devInfiniteHp && this.healthComponent) {
      if (this.healthComponent.getHp() < this.healthComponent.getMaxHp()) {
        this.healthComponent.setHp(this.healthComponent.getMaxHp());
        EventBus.getInstance().emit(EventTopic.BOSS_DAMAGED, {
          bossId: this.id,
          damage: 0,
          currentHp: this.healthComponent.getHp(),
          maxHp: this.healthComponent.getMaxHp()
        });
      }
    }

    const state = this.aiComponent.getCurrentState();

    // 1. Procedural animations & placement of visual parts
    this.animateVisualParts(time, delta, state);

    // 2. Flowing ember particles (Visual Design requirement)
    this.updateEmberParticles(delta);

    // 3. Heavy footsteps camera rumble & dust (Visual Design/Scale requirement)
    this.updateFootsteps(delta, state);

    // 4. Update and resolve hazards/projectiles
    this.updateHazardsAndProjectiles(time, delta);

    // 5. Phase 3 Last Stand countdown
    if (this.currentPhase === 3 && state === BossState.CHASE && !this.isPerformingAttack) {
      this.lastStandTimer += delta;
      if (this.lastStandTimer >= 20000) {
        this.lastStandTimer = 0;
        this.activateLastStand();
      }
    }
  }

  private animateVisualParts(time: number, delta: number, state: BossState): void {
    if (this.animationController) {
      this.animationController.update(time, delta, state);
    }
  }

  private updateEmberParticles(delta: number): void {
    this.emberTimer += delta;
    const rate = this.currentPhase === 1 ? 180 : this.currentPhase === 2 ? 100 : 50; // More intense in high phases
    if (this.emberTimer >= rate) {
      this.emberTimer = 0;
      
      const rx = this.x + Phaser.Math.Between(-35, 35);
      const ry = this.y + Phaser.Math.Between(-35, 35);
      
      const ember = this.scene.add.circle(rx, ry, Phaser.Math.Between(2, 4), 0xff5500, 0.8);
      ember.setDepth(14);

      this.scene.tweens.add({
        targets: ember,
        y: ry - Phaser.Math.Between(30, 80),
        x: rx + Phaser.Math.Between(-20, 20),
        alpha: 0,
        scale: 0.1,
        duration: Phaser.Math.Between(800, 1500),
        onComplete: () => ember.destroy()
      });
    }
  }

  private updateFootsteps(delta: number, state: BossState): void {
    if (state !== BossState.CHASE) return;
    
    const speedSq = this.physicsComponent.vx * this.physicsComponent.vx + this.physicsComponent.vy * this.physicsComponent.vy;
    if (speedSq > 200) {
      this.footstepTimer += delta;
      // Step rate based on speed
      const rate = 850;
      if (this.footstepTimer >= rate) {
        this.footstepTimer = 0;

        // Visual heavy step feedback: mini shake & dust clouds
        CameraEffectsManager.getInstance().shake(120, 0.0035);
        
        // Sometimes spawn a small floor crack where we step
        if (Math.random() < 0.25) {
          ArenaEffectsManager.getInstance().spawnCrack(this.x + Phaser.Math.Between(-15, 15), this.y + 40, Phaser.Math.Between(15, 25));
        }
        
        // Spawn procedural dust ring
        const dust = this.scene.add.circle(this.x, this.y + 40, 15, 0x334155, 0.35);
        dust.setDepth(1);
        this.scene.tweens.add({
          targets: dust,
          scale: 2.2,
          alpha: 0,
          duration: 450,
          onComplete: () => dust.destroy()
        });
      }
    }
  }

  private updateHazardsAndProjectiles(time: number, delta: number): void {
    const player = this.scene.player;
    if (!player || !player.active) return;

    // 1. Resolve Active Hazards (Molten pools, expanding shockwaves, meteors)
    this.activeHazards = this.activeHazards.filter(hazard => {
      if (!hazard || !hazard.active) return false;

      // Check damage ticks on player
      if (!this.scene.isDodging && this.id !== 'DEFEATED') {
        const dist = Phaser.Math.Distance.Between(player.x, player.y, hazard.x, hazard.y);

        if (hazard.type === 'shockwave') {
          // Shockwave hits player if within expanding ring shell
          const ringRadius = hazard.currentRadius;
          const thickness = 18;
          if (Math.abs(dist - ringRadius) < thickness) {
            const hasHit = hazard.hasHitPlayer;
            if (!hasHit) {
              hazard.hasHitPlayer = true;
              this.scene.damagePlayer(this);
              // Push player back away from center of slam
              const pushAngle = Phaser.Math.Angle.Between(hazard.x, hazard.y, player.x, player.y);
              this.scene.playerPhysics.setVelocity(Math.cos(pushAngle) * 280, Math.sin(pushAngle) * 280);
            }
          }
        } 
        else if (hazard.type === 'molten_pool') {
          // Continuous tick damage inside fire ground zones
          if (dist < hazard.radius) {
            const now = time;
            if (!hazard.lastDamageTick || now - hazard.lastDamageTick >= 1000) {
              hazard.lastDamageTick = now;
              this.scene.damagePlayer(this);
              this.scene.vfxManager.spawnSparks(player.x, player.y, 0xff5500, 4);
            }
          }
        }
        else if (hazard.type === 'lava_explosion' || hazard.type === 'meteor_explosion') {
          // Instant explosion damage check
          if (dist < hazard.radius && !hazard.hasDealtDamage) {
            hazard.hasDealtDamage = true;
            this.scene.damagePlayer(this);
          }
        }
      }

      // Procedural shockwave expansion
      if (hazard.type === 'shockwave') {
        hazard.currentRadius += (hazard.targetRadius / (hazard.duration / delta));
        hazard.graphics.clear();
        const shockwaveAlpha = Math.max(0, Math.min(1.0, 0.9 - (hazard.currentRadius / hazard.targetRadius)));
        hazard.graphics.lineStyle(5, 0xff3366, shockwaveAlpha);
        hazard.graphics.strokeCircle(hazard.x, hazard.y, hazard.currentRadius);
        
        if (hazard.currentRadius >= hazard.targetRadius) {
          hazard.graphics.destroy();
          return false;
        }
      }

      return true;
    });

    // 2. Resolve Projectiles (Thrown sword, etc.)
    this.activeProjectiles = this.activeProjectiles.filter(proj => {
      if (!proj || !proj.active) return false;

      // Handle spinning boomerang sword logic
      if (proj.type === 'thrown_sword') {
        proj.sprite.angle += 25; // Spin rapidly

        const elapsed = time - proj.spawnTime;
        if (elapsed < proj.flightDuration) {
          // Travel outwards towards target spot
          const ratio = elapsed / proj.flightDuration;
          proj.x = Phaser.Math.Linear(proj.startX, proj.targetX, ratio);
          proj.y = Phaser.Math.Linear(proj.startY, proj.targetY, ratio);
          proj.sprite.setPosition(proj.x, proj.y);
        } else {
          // Boomerang back to boss position
          const returnRatio = (elapsed - proj.flightDuration) / proj.flightDuration;
          if (returnRatio >= 1.0) {
            // Re-attached to boss
            proj.sprite.destroy();
            this.giantSword.setVisible(true);
            return false;
          }
          proj.x = Phaser.Math.Linear(proj.targetX, this.x, returnRatio);
          proj.y = Phaser.Math.Linear(proj.targetY, this.y, returnRatio);
          proj.sprite.setPosition(proj.x, proj.y);
        }

        // Damage check
        if (!this.scene.isDodging) {
          const d = Phaser.Math.Distance.Between(player.x, player.y, proj.x, proj.y);
          if (d < 45) {
            const now = time;
            if (!proj.lastHitTime || now - proj.lastHitTime >= 400) {
              proj.lastHitTime = now;
              this.scene.damagePlayer(this);
              // Small recoil push
              const angle = Phaser.Math.Angle.Between(proj.x, proj.y, player.x, player.y);
              this.scene.playerPhysics.setVelocity(Math.cos(angle) * 150, Math.sin(angle) * 150);
            }
          }
        }
      }

      return true;
    });
  }

  // ==========================================
  // CUSTOM ATTACK TRIGGERS
  // ==========================================

  public executeRandomAttack(): void {
    if (this.isPerformingAttack || !this.active) return;
    this.isPerformingAttack = true;

    // Build attack weight lists based on current phase (Battle Structure requirements)
    const options: string[] = [];
    if (this.currentPhase === 1) {
      options.push('TitanCleave', 'ShieldCharge', 'GroundSlam');
    } else if (this.currentPhase === 2) {
      options.push('TitanCleave', 'ShieldCharge', 'GroundSlam', 'MoltenEruption', 'SwordThrow', 'SummonGuardians');
    } else if (this.currentPhase === 3) {
      options.push('TitanCleave', 'GroundSlam', 'MoltenEruption', 'SwordThrow', 'MeteorRain', 'BerserkerCombo', 'ArenaSweep');
    }

    const chosen = Phaser.Math.RND.pick(options);
    this.activeAttackName = chosen;

    // Trigger hooks
    EventBus.getInstance().emit('BOSS_ATTACK_WARNING', { attackName: chosen });

    switch (chosen) {
      case 'TitanCleave':
        this.performTitanCleave();
        break;
      case 'ShieldCharge':
        this.performShieldCharge();
        break;
      case 'GroundSlam':
        this.performGroundSlam();
        break;
      case 'MoltenEruption':
        this.performMoltenEruption();
        break;
      case 'SwordThrow':
        this.performSwordThrow();
        break;
      case 'SummonGuardians':
        this.performSummonGuardians();
        break;
      case 'MeteorRain':
        this.performMeteorRain();
        break;
      case 'BerserkerCombo':
        this.performBerserkerCombo();
        break;
      case 'ArenaSweep':
        this.performArenaSweep();
        break;
      default:
        this.isPerformingAttack = false;
        this.activeAttackName = 'None';
        break;
    }
  }

  // ------------------------------------------
  // MELEE: TITAN CLEAVE (PHASE 1)
  // ------------------------------------------
  private performTitanCleave(): void {
    this.physicsComponent.setVelocity(0, 0);

    const player = this.scene.player;
    if (!player || !player.active) {
      this.finishAttack(100);
      return;
    }

    // Huge custom warning indicators (No GameScene bloat)
    const attackAngle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
    
    // Trigger heavy swing timeline on the visual animator
    if (this.animationController) {
      this.animationController.triggerHeavySwing(attackAngle);
    } else {
      this.giantSword.rotation = attackAngle - Math.PI / 2; // Wind up position fallback
    }

    const telegraph = this.scene.add.graphics();
    telegraph.setDepth(2);
    this.activeTelegraphs.push(telegraph);

    // Minor screen pre-rumble during heavy windup
    CameraEffectsManager.getInstance().shake(1200, 0.002);

    // Slow wind up over 1200ms
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 1200,
      onUpdate: (tween: any) => {
        const val = tween.getValue();
        telegraph.clear();
        
        // Handcrafted transition immediately before lightning-fast slash down
        let color = 0xff3300;
        let alpha = 0.15 + val * 0.25;
        let lineThickness = 2 + val * 3;
        
        if (val > 0.85) {
          // Heat/kinetic build flash (white-orange)
          color = 0xffaa00;
          alpha = 0.4 + (val - 0.85) * 4.0; // Rapidly flares up
          lineThickness = 5 + (val - 0.85) * 15; // Extremely thick edge representing imminent impact
        }
        
        telegraph.fillStyle(color, alpha);
        telegraph.lineStyle(lineThickness, color, 0.4 + val * 0.6);
        
        // Dynamic swing radius based on current phase and giant scale
        const cleaveReach = this.currentPhase === 1 ? 240 : (this.currentPhase === 2 ? 300 : 360);

        // Draw pizza slice arc sector in player direction
        telegraph.beginPath();
        telegraph.moveTo(this.x, this.y);
        telegraph.arc(
          this.x,
          this.y,
          cleaveReach,
          attackAngle - Math.PI / 4,
          attackAngle + Math.PI / 4
        );
        telegraph.lineTo(this.x, this.y);
        telegraph.closePath();
        telegraph.fillPath();
        telegraph.strokePath();
      },
      onComplete: () => {
        telegraph.destroy();
        if (!this.active) return;

        // Slash execution (0.2s duration)
        CameraEffectsManager.getInstance().shake(250, 0.015);
        CameraEffectsManager.getInstance().triggerHitstop(80); // Freeze frame for dramatic weight
        AudioManager.getInstance().playSFX('slash');

        const cleaveReach = this.currentPhase === 1 ? 240 : (this.currentPhase === 2 ? 300 : 360);

        // Check collision with player inside arc sector
        const pDist = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
        if (pDist <= cleaveReach && !this.scene.isDodging) {
          const angleToPlayer = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
          const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(angleToPlayer - attackAngle));
          
          if (angleDiff <= Math.PI / 4) {
            this.scene.damagePlayer(this);
            this.scene.playerPhysics.setVelocity(Math.cos(angleToPlayer) * 350, Math.sin(angleToPlayer) * 350);
          }
        }

        const sx = this.x + Math.cos(attackAngle) * 80;
        const sy = this.y + Math.sin(attackAngle) * 80;
        this.scene.vfxManager.spawnSparks(sx, sy, 0xff0055, 12);
        
        // Leave cracked impact decal
        ArenaEffectsManager.getInstance().spawnCrack(sx, sy, 45);

        this.finishAttack(700); // Back recovery lag
      }
    });
  }

  // ------------------------------------------
  // CHARGE: SHIELD CHARGE (PHASE 1)
  // ------------------------------------------
  private performShieldCharge(): void {
    this.physicsComponent.setVelocity(0, 0);

    const player = this.scene.player;
    if (!player || !player.active) {
      this.finishAttack(100);
      return;
    }

    const startX = this.x;
    const startY = this.y;
    const targetX = player.x;
    const targetY = player.y;
    const chargeAngle = Phaser.Math.Angle.Between(this.x, this.y, targetX, targetY);

    this.giantSword.rotation = chargeAngle;

    // Draw straight rectangle telegraph
    const telegraph = this.scene.add.graphics();
    telegraph.setDepth(2);
    this.activeTelegraphs.push(telegraph);

    const width = 850;
    const thickness = 90;

    // Windup screen rumble
    CameraEffectsManager.getInstance().shake(1000, 0.0025);

    // 1.0s Charging warning
    this.scene.tweens.addCounter({
      from: 0,
      to: 1,
      duration: 1000,
      onUpdate: (tween: any) => {
        const val = tween.getValue();
        telegraph.clear();
        
        // Dynamic flash/pulse representing extreme kinetic build-up
        const energyFlash = Math.sin(tween.elapsed * 0.05) * 0.12 + 0.12;
        const alpha = 0.12 + val * 0.25 + energyFlash;
        const color = 0xff3300;
        telegraph.fillStyle(color, alpha);
        telegraph.lineStyle(2 + val * 4, color, 0.4 + val * 0.6);

        // Draw rotated rectangle path
        telegraph.save();
        telegraph.translateCanvas(this.x, this.y);
        telegraph.rotateCanvas(chargeAngle);
        telegraph.fillRect(0, -thickness/2, width, thickness);
        telegraph.strokeRect(0, -thickness/2, width, thickness);
        telegraph.restore();

        // Pulsating shoulders during charge prep (rapid breathing vibration)
        const shoulderPulse = 1.0 + Math.sin(tween.elapsed / 25) * 0.22;
        this.leftShoulder.setScale(shoulderPulse);
        this.rightShoulder.setScale(shoulderPulse);

        // Spawn dramatic crackling orange sparks around the shoulders
        if (Math.random() < 0.2) {
          this.scene.vfxManager.spawnSparks(this.leftShoulder.x, this.leftShoulder.y, 0xffaa00, 1);
          this.scene.vfxManager.spawnSparks(this.rightShoulder.x, this.rightShoulder.y, 0xffaa00, 1);
        }
      },
      onComplete: () => {
        telegraph.destroy();
        this.leftShoulder.setScale(1);
        this.rightShoulder.setScale(1);

        if (!this.active) return;

        // Perform charge speed boost scaled exactly to the warning box length!
        // width = 850px, duration = 750ms (0.75 seconds).
        // Speed = 850 / 0.75 = 1133.33 px/sec.
        const chargeSpeed = 1133.33;
        this.physicsComponent.setVelocity(Math.cos(chargeAngle) * chargeSpeed, Math.sin(chargeAngle) * chargeSpeed);

        // Collision ticks during charge
        const chargeTimer = this.scene.time.addEvent({
          delay: 16,
          repeat: 45, // approx 750ms duration
          callback: () => {
            if (!this.active) {
              chargeTimer.destroy();
              return;
            }

            // Check contact with player
            const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
            if (d < 70 && !this.scene.isDodging) {
              this.scene.damagePlayer(this);
              this.scene.playerPhysics.setVelocity(Math.cos(chargeAngle) * 320, Math.sin(chargeAngle) * 320);
              
              // Spark spray on hitting player
              this.scene.vfxManager.spawnSparks(player.x, player.y, 0xff0033, 15);
              CameraEffectsManager.getInstance().shake(150, 0.015);
              CameraEffectsManager.getInstance().triggerHitstop(80);
            }
          }
        });

        // Slow down at end or wall collision
        this.scene.time.delayedCall(750, () => {
          chargeTimer.destroy();
          if (!this.active) return;

          this.physicsComponent.setVelocity(0, 0);
          
          // Cinematic impact reactions: directional camera shake & frozen hitstop
          CameraEffectsManager.getInstance().shakeDirectional(chargeAngle, 200, 25);
          CameraEffectsManager.getInstance().shake(250, 0.018);
          CameraEffectsManager.getInstance().triggerHitstop(100);

          // Spawn persistent slide-scrape lines on ground
          ArenaEffectsManager.getInstance().spawnScrape(startX, startY, this.x, this.y, 75);
          
          // Spawn crater and cracks at final destination crash
          ArenaEffectsManager.getInstance().spawnCrater(this.x, this.y, 45);
          ArenaEffectsManager.getInstance().spawnCrack(this.x, this.y, 55);

          this.finishAttack(800);
        });
      }
    });
  }

  // ------------------------------------------
  // AOE: GROUND SLAM (PHASE 1)
  // ------------------------------------------
  private performGroundSlam(): void {
    this.physicsComponent.setVelocity(0, 0);

    const player = this.scene.player;
    if (!player || !player.active) {
      this.finishAttack(100);
      return;
    }

    const startX = this.x;
    const startY = this.y;
    // Leap targets player's position when the jump starts!
    const targetX = player.x;
    const targetY = player.y;

    // Reset jump parameters
    this.jumpY = 0;
    this.jumpScale = 1.0;

    const baseScale = this.currentPhase === 1 ? 2.5 : (this.currentPhase === 2 ? 3.0 : 3.5);
    // Scale jump size and height based on the boss's actual phase size
    const maxJumpHeight = -120 * (baseScale / 2.5) * 1.5; // proportional to boss size!
    const maxJumpScale = 1.5; // up to 150% size at peak

    // Warning circle on ground where he will LAND!
    const telegraph = this.scene.add.graphics();
    telegraph.setDepth(2);
    this.activeTelegraphs.push(telegraph);

    const targetRadius = 180 * (baseScale / 2.5); // scales with boss size!

    this.scene.tweens.addCounter({
      from: 0,
      to: targetRadius,
      duration: 1200,
      onUpdate: (tween: any) => {
        const rad = tween.getValue();
        telegraph.clear();
        
        const progress = tween.getValue() / targetRadius; // 0 to 1
        const pulseFreq = 0.02 + progress * 0.08;
        const pulse = Math.abs(Math.sin(tween.elapsed * pulseFreq));
        
        const fillColor = progress > 0.85 ? 0xff3300 : 0xff1100;
        const fillAlpha = 0.15 + (progress * 0.25) + (pulse * 0.12);
        const strokeColor = progress > 0.85 ? 0xffaa00 : 0xff1100;
        const strokeWidth = 3 + pulse * 5 + (progress * 4);
        
        telegraph.fillStyle(fillColor, fillAlpha);
        telegraph.lineStyle(strokeWidth, strokeColor, 0.6 + progress * 0.4);
        telegraph.fillCircle(targetX, targetY, rad);
        telegraph.strokeCircle(targetX, targetY, rad);
      },
      onComplete: () => {
        telegraph.destroy();
      }
    });

    // Tween the vertical height and scale of the jump (yoyo over 1200ms total)
    this.scene.tweens.add({
      targets: this,
      jumpY: maxJumpHeight,
      jumpScale: maxJumpScale,
      duration: 600,
      yoyo: true,
      ease: 'Quad.easeOut',
      onComplete: () => {
        // Double check parameters are fully reset
        this.jumpY = 0;
        this.jumpScale = 1.0;
      }
    });

    // Tween physical position (Leap movement in air) towards the target landing point
    this.scene.tweens.add({
      targets: this,
      x: targetX,
      y: targetY,
      duration: 1200,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        if (!this.active) return;

        // Reset jump values to ensure safety
        this.jumpY = 0;
        this.jumpScale = 1.0;

        // Landing impact!
        CameraEffectsManager.getInstance().shake(350, 0.022);
        CameraEffectsManager.getInstance().triggerHitstop(80);
        AudioManager.getInstance().playSFX('hit');
        this.scene.vfxManager.spawnSparks(this.x, this.y, 0xff3300, 20);

        // Leave cracked floor and crater decal on impact
        const craterRad = 45 * (baseScale / 2.5);
        const crackRad = 65 * (baseScale / 2.5);
        ArenaEffectsManager.getInstance().spawnCrater(this.x, this.y, craterRad);
        ArenaEffectsManager.getInstance().spawnCrack(this.x, this.y, crackRad);

        // Expand procedural shockwave (Arena hazard) after a 1.5 second delay
        const cx = this.x;
        const cy = this.y;
        this.scene.time.delayedCall(1500, () => {
          if (!this.active) return;
          
          const shockGraphics = this.scene.add.graphics();
          shockGraphics.setDepth(3);

          // Scales shockwave reach based on phase size
          const shockwaveReach = 450 * (baseScale / 2.5); // Phase 1: 450, Phase 2: 540, Phase 3: 630

          const shockwaveObj = {
            active: true,
            type: 'shockwave',
            x: cx,
            y: cy,
            currentRadius: 0,
            targetRadius: shockwaveReach,
            duration: 1500, // slightly slower, massive traveling ring
            hasHitPlayer: false,
            graphics: shockGraphics
          };

          this.activeHazards.push(shockwaveObj);
        });

        this.finishAttack(900);
      }
    });
  }

  // ------------------------------------------
  // FIRE: MOLTEN ERUPTION (PHASE 2 & 3)
  // ------------------------------------------
  private performMoltenEruption(): void {
    this.physicsComponent.setVelocity(0, 0);

    const count = 4;
    const arenaMinX = 420, arenaMaxX = 1180;
    const arenaMinY = 220, arenaMaxY = 780;

    // Spawn warning circles
    for (let i = 0; i < count; i++) {
      const rx = Phaser.Math.Between(arenaMinX, arenaMaxX);
      const ry = Phaser.Math.Between(arenaMinY, arenaMaxY);

      const telegraph = this.scene.add.graphics();
      telegraph.setDepth(2);
      this.activeTelegraphs.push(telegraph);

      // Warning pulse
      this.scene.tweens.addCounter({
        from: 0,
        to: 1,
        duration: 1500,
        onUpdate: (tween: any) => {
          const val = tween.getValue();
          telegraph.clear();
          telegraph.fillStyle(0xff5500, 0.15 + val * 0.25);
          telegraph.lineStyle(2, 0xff5500, 0.5 + val * 0.5);
          telegraph.fillCircle(rx, ry, 60);
          telegraph.strokeCircle(rx, ry, 60);
        },
        onComplete: () => {
          telegraph.destroy();
          if (!this.active) return;

          // Explosion eruption columns
          CameraEffectsManager.getInstance().shake(150, 0.012);
          ArenaEffectsManager.getInstance().spawnCrater(rx, ry, 35);
          
          const colG = this.scene.add.graphics();
          colG.setDepth(14);
          colG.fillStyle(0xff3300, 0.95);
          colG.fillRect(rx - 45, ry - 300, 90, 310);

          const explosionObj = {
            active: true,
            type: 'lava_explosion',
            x: rx,
            y: ry,
            radius: 60,
            hasDealtDamage: false
          };
          this.activeHazards.push(explosionObj);

          // Eruption visual column shrink
          this.scene.tweens.add({
            targets: colG,
            scaleY: 0,
            y: ry,
            duration: 500,
            onComplete: () => {
              colG.destroy();
              explosionObj.active = false;

              // Leave persistent molten ground zone (Arena Evolution)
              if (!this.active) return;

              const pool = this.scene.add.circle(rx, ry, 60, 0xff2200, 0.45);
              pool.setStrokeStyle(2, 0xff5500);
              pool.setDepth(1);

              const poolObj = {
                active: true,
                type: 'molten_pool',
                x: rx,
                y: ry,
                radius: 60,
                lastDamageTick: 0
              };
              this.activeHazards.push(poolObj);

              // Evaporate after 4.0s
              this.scene.tweens.add({
                targets: pool,
                alpha: 0,
                delay: 4000,
                duration: 800,
                onComplete: () => {
                  pool.destroy();
                  poolObj.active = false;
                }
              });
            }
          });
        }
      });
    }

    this.finishAttack(1600);
  }

  // ------------------------------------------
  // PROJECTILE: SWORD THROW (PHASE 2 & 3)
  // ------------------------------------------
  private performSwordThrow(): void {
    this.physicsComponent.setVelocity(0, 0);

    const player = this.scene.player;
    if (!player || !player.active) {
      this.finishAttack(100);
      return;
    }

    const startX = this.x;
    const startY = this.y;
    const targetX = player.x;
    const targetY = player.y;

    // Temporarily hide main sword visual
    this.giantSword.setVisible(false);

    // Create projectile sword sprite (Fair telegraph + Dodge opportunity)
    const thrownSwordSprite = this.scene.add.sprite(startX, startY, 'sword-texture');
    thrownSwordSprite.setScale(3.0);
    thrownSwordSprite.setDepth(18);
    thrownSwordSprite.setTint(0xff5500); // Glowing fiery orange

    const projectileObj = {
      active: true,
      type: 'thrown_sword',
      x: startX,
      y: startY,
      startX,
      startY,
      targetX,
      targetY,
      spawnTime: this.scene.time.now,
      flightDuration: 650, // ms flight out, 650ms back
      sprite: thrownSwordSprite,
      lastHitTime: 0
    };

    this.activeProjectiles.push(projectileObj);
    this.finishAttack(1400);
  }

  // ------------------------------------------
  // SUMMON: SUMMON GUARDIANS (PHASE 2 & 3)
  // ------------------------------------------
  private performSummonGuardians(): void {
    this.physicsComponent.setVelocity(0, 0);
    this.scene.vfxManager.addFloatingWorldText(this.x, this.y - 70, "ARISE, MY CHAMPIONS!", "#ffd700");
    this.scene.cameras.main.flash(200, 255, 215, 0, 0.25);

    // Spawn 2 Elite Guardians (ECS compliant)
    for (let i = 0; i < 2; i++) {
      const sx = this.x + (i === 0 ? -120 : 120);
      const sy = this.y + 40;

      const guardSprite = this.scene.add.sprite(sx, sy, 'enemy-melee');
      guardSprite.setScale(1.7);
      guardSprite.setTint(0xcda250); // Gold elite tint

      const guard = new BaseEntity(`boss_guardian_${Date.now()}_${i}`, guardSprite);
      
      const speed = 75;
      const hp = 100;

      const phys = guard.addComponent('physics', new PhysicsComponent(guard, speed));
      phys.setBoundaries(32, 1600 - 32, 32, 1000 - 32); // Confined to arena
      phys.collisionRadius = 24;
      phys.weight = 1.5;

      const health = guard.addComponent('health', new HealthComponent(guard, hp));
      const ai = guard.addComponent('ai', new EnemyAIComponent(guard, this.scene.player));

      phys.init();
      health.init();
      ai.init();

      // Hook up custom labels
      this.scene.vfxManager.addFloatingWorldText(sx, sy - 35, 'Colossus Guardian', '#ffd700');

      this.scene.enemies.push(guard);
    }

    this.finishAttack(1200);
  }

  // ------------------------------------------
  // METEOR: METEOR RAIN (PHASE 3)
  // ------------------------------------------
  private performMeteorRain(): void {
    this.physicsComponent.setVelocity(0, 0);

    const count = 6;
    const arenaMinX = 410, arenaMaxX = 1190;
    const arenaMinY = 210, arenaMaxY = 790;

    for (let i = 0; i < count; i++) {
      this.scene.time.delayedCall(i * 180, () => {
        if (!this.active) return;

        const rx = Phaser.Math.Between(arenaMinX, arenaMaxX);
        const ry = Phaser.Math.Between(arenaMinY, arenaMaxY);

        const telegraph = this.scene.add.graphics();
        telegraph.setDepth(2);
        this.activeTelegraphs.push(telegraph);

        // Rapid warn-circle (0.8s)
        this.scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration: 800,
          onUpdate: (tween: any) => {
            const val = tween.getValue();
            telegraph.clear();
            telegraph.fillStyle(0xff3300, 0.15 + val * 0.3);
            telegraph.lineStyle(2, 0xff3300, 0.4 + val * 0.6);
            telegraph.fillCircle(rx, ry, 50);
            telegraph.strokeCircle(rx, ry, 50);
          },
          onComplete: () => {
            telegraph.destroy();
            if (!this.active) return;

            // Draw falling flaming circle projectile
            const meteorS = this.scene.add.circle(rx - 80, ry - 250, 8, 0xffaa00, 0.95);
            meteorS.setDepth(14);

            this.scene.tweens.add({
              targets: meteorS,
              x: rx,
              y: ry,
              scale: 2.2,
              duration: 250,
              ease: 'Quad.easeIn',
              onComplete: () => {
                meteorS.destroy();
                if (!this.active) return;

                // Fire explosion!
                CameraEffectsManager.getInstance().shake(180, 0.014);
                this.scene.vfxManager.spawnSparks(rx, ry, 0xffaa00, 10);
                
                // Spawn crack and crater at meteor hit
                ArenaEffectsManager.getInstance().spawnCrater(rx, ry, 25);
                ArenaEffectsManager.getInstance().spawnCrack(rx, ry, 35);
                
                const expObj = {
                  active: true,
                  type: 'meteor_explosion',
                  x: rx,
                  y: ry,
                  radius: 50,
                  hasDealtDamage: false
                };
                this.activeHazards.push(expObj);

                this.scene.time.delayedCall(150, () => {
                  expObj.active = false;
                });
              }
            });
          }
        });
      });
    }

    this.finishAttack(1800);
  }

  // ------------------------------------------
  // MELEE COMBO: BERSERKER COMBO (PHASE 3)
  // ------------------------------------------
  private performBerserkerCombo(): void {
    this.physicsComponent.setVelocity(0, 0);

    const player = this.scene.player;
    if (!player || !player.active) {
      this.finishAttack(100);
      return;
    }

    const swing = (num: number, speed: number, delay: number, next: () => void) => {
      this.scene.time.delayedCall(delay, () => {
        if (!this.active || !player.active) {
          this.finishAttack(100);
          return;
        }

        const angle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
        
        // Expanded visual swing radius for BerserkerCombo (Phase 3) to match giant sword length
        const comboReach = 360;

        // Single quick telegraph arc
        const tg = this.scene.add.graphics();
        tg.setDepth(2);
        tg.fillStyle(0xff0055, 0.3);
        tg.slice(this.x, this.y, comboReach, angle - Math.PI/3, angle + Math.PI/3);
        tg.fillPath();

        // Trigger super fast attack swing animation! speedMult = 2.8 (2.8x speed)
        if (this.animationController) {
          this.animationController.triggerHeavySwing(angle, 2.8);
        }

        this.scene.time.delayedCall(220, () => {
          tg.destroy();
          if (!this.active) return;

          AudioManager.getInstance().playSFX('slash');
          this.scene.cameras.main.shake(100, 0.008);

          // Check hit
          const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
          if (d <= comboReach && !this.scene.isDodging) {
            const currentAngle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
            const diff = Math.abs(Phaser.Math.Angle.Wrap(currentAngle - angle));
            if (diff <= Math.PI/3) {
              this.scene.damagePlayer(this);
              this.scene.playerPhysics.setVelocity(Math.cos(currentAngle) * 200, Math.sin(currentAngle) * 200);
            }
          }

          next();
        });
      });
    };

    // Chain 3 swings
    swing(1, 250, 0, () => {
      swing(2, 200, 150, () => {
        // Final heavy swing slam!
        this.scene.time.delayedCall(200, () => {
          if (!this.active || !player.active) {
            this.finishAttack(100);
            return;
          }

          const finalAngle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
          const tgFinal = this.scene.add.graphics();
          tgFinal.setDepth(2);
          tgFinal.fillStyle(0xff1100, 0.45);
          tgFinal.fillCircle(this.x + Math.cos(finalAngle)*70, this.y + Math.sin(finalAngle)*70, 100);

          // Trigger standard heavy swing slam animation! speedMult = 1.2 (slightly faster than normal heavy)
          if (this.animationController) {
            this.animationController.triggerHeavySwing(finalAngle, 1.2);
          }

          this.scene.time.delayedCall(300, () => {
            tgFinal.destroy();
            if (!this.active) return;

            // Grand Slam landing impact!
            CameraEffectsManager.getInstance().shake(300, 0.024);
            CameraEffectsManager.getInstance().triggerHitstop(100);
            AudioManager.getInstance().playSFX('hit');
            this.scene.vfxManager.spawnSparks(this.x, this.y, 0xff0000, 15);

            // Spawn crater and cracks at final combo slam
            const sx = this.x + Math.cos(finalAngle) * 70;
            const sy = this.y + Math.sin(finalAngle) * 70;
            ArenaEffectsManager.getInstance().spawnCrater(sx, sy, 50);
            ArenaEffectsManager.getInstance().spawnCrack(sx, sy, 60);

            // Spawns expanding shockwave after a 1.5 second delay
            const cx = sx;
            const cy = sy;
            this.scene.time.delayedCall(1500, () => {
              if (!this.active) return;
              const shockGraphics = this.scene.add.graphics();
              shockGraphics.setDepth(3);

              const shockwaveObj = {
                active: true,
                type: 'shockwave',
                x: cx,
                y: cy,
                currentRadius: 0,
                targetRadius: 180,
                duration: 900,
                hasHitPlayer: false,
                graphics: shockGraphics
              };
              this.activeHazards.push(shockwaveObj);
            });

            this.finishAttack(900);
          });
        });
      });
    });
  }

  // ------------------------------------------
  // SWEEP: ARENA SWEEP (PHASE 3)
  // ------------------------------------------
  private performArenaSweep(): void {
    this.physicsComponent.setVelocity(0, 0);

    const player = this.scene.player;
    if (!player || !player.active) {
      this.finishAttack(100);
      return;
    }

    this.scene.vfxManager.addFloatingWorldText(this.x, this.y - 70, "CLEAVE EVERYTHING!", "#ff3300");

    // Rotate weapon 360 degrees
    const sweepDuration = 3000;
    const startRot = this.giantSword.rotation;

    this.scene.tweens.addCounter({
      from: 0,
      to: Math.PI * 2,
      duration: sweepDuration,
      onUpdate: (tween: any) => {
        if (!this.active) return;
        const currentSweepAngle = startRot + tween.getValue();
        this.giantSword.rotation = currentSweepAngle;

        // Expanded sweep reach (360px) to match buster blade length
        const sweepReach = 360;

        // Draw sweeping danger beam visual line
        this.scene.debugGraphics.clear();
        this.scene.debugGraphics.lineStyle(4, 0xff0055, 0.8);
        this.scene.debugGraphics.strokeLineShape(new Phaser.Geom.Line(
          this.x,
          this.y,
          this.x + Math.cos(currentSweepAngle) * sweepReach,
          this.y + Math.sin(currentSweepAngle) * sweepReach
        ));

        // Sweep collision tick
        if (!this.scene.isDodging) {
          const d = Phaser.Math.Distance.Between(this.x, this.y, player.x, player.y);
          if (d <= sweepReach) {
            const playerAngle = Phaser.Math.Angle.Between(this.x, this.y, player.x, player.y);
            // Check if sweep line matches player angular coordinate
            const diff = Math.abs(Phaser.Math.Angle.Wrap(playerAngle - currentSweepAngle));
            if (diff < 0.15) {
              this.scene.damagePlayer(this);
              this.scene.playerPhysics.setVelocity(Math.cos(playerAngle) * 180, Math.sin(playerAngle) * 180);
            }
          }
        }
      },
      onComplete: () => {
        this.scene.debugGraphics.clear();
        this.finishAttack(800);
      }
    });
  }

  // ------------------------------------------
  // PASSIVE: LAST STAND BARRIER (PHASE 3)
  // ------------------------------------------
  private activateLastStand(): void {
    if (this.shieldActive || !this.active) return;

    this.shieldActive = true;
    this.shieldHp = this.maxShieldHp;

    this.scene.vfxManager.addFloatingWorldText(this.x, this.y - 75, "LAST STAND!", "#00ffff");
    AudioManager.getInstance().playSFX('powerup');

    // Color shoulders / core bright cyan barrier
    this.leftShoulder.setFillStyle(0x00ffff);
    this.rightShoulder.setFillStyle(0x00ffff);
    this.moltenCore.setFillStyle(0x00ffff);

    this.setInvulnerable(true); // Invulnerable to base HP damage while shield is up

    // Display temporary shield on UI
    const textEl = document.getElementById('bb-boss-hp-text');
    if (textEl) {
      textEl.textContent = `SHIELD ACTIVE (${this.shieldHp})`;
      textEl.style.color = '#00ffff';
    }
  }

  public damageShield(amount: number): void {
    if (!this.shieldActive) return;

    this.shieldHp = Math.max(0, this.shieldHp - amount);
    this.scene.vfxManager.createDamageText(this.x, this.y - 60, amount, false);
    this.scene.vfxManager.spawnSparks(this.x, this.y, 0x00ffff, 4);

    const textEl = document.getElementById('bb-boss-hp-text');
    if (textEl) {
      textEl.textContent = `SHIELD ACTIVE (${this.shieldHp})`;
    }

    if (this.shieldHp <= 0) {
      // Shield shattered! Stun/Stagger colossus for 2.0s
      this.shieldActive = false;
      this.setInvulnerable(false);

      this.scene.vfxManager.addFloatingWorldText(this.x, this.y - 75, "SHIELD BROKEN!", "#ff9900");
      this.scene.cameras.main.flash(200, 0, 255, 255, 0.45);

      // Reset base color scheme
      this.leftShoulder.setFillStyle(0x334155);
      this.rightShoulder.setFillStyle(0x334155);
      this.moltenCore.setFillStyle(0xff2200);

      if (textEl) {
        textEl.style.color = '#E2E2E2';
      }

      // Enter Stun state / stun boss
      this.aiComponent.transitionTo(BossState.STUNNED);
      this.isPerformingAttack = false;
      this.activeAttackName = 'STUNNED';
      this.physicsComponent.setVelocity(0, 0);

      this.scene.time.delayedCall(2000, () => {
        if (!this.active) return;
        this.activeAttackName = 'None';
        this.aiComponent.transitionTo(BossState.CHASE);
      });
    }
  }

  // Helper to recover after attack
  private finishAttack(cooldown: number): void {
    this.isPerformingAttack = false;
    this.activeAttackName = 'None';
    this.nextAttackTime = cooldown;
    this.aiComponent.transitionTo(BossState.CHASE);
  }

  // Clean-up visuals
  private destroyVisualsAndHazards(): void {
    this.moltenCore?.destroy();
    this.leftShoulder?.destroy();
    this.rightShoulder?.destroy();
    this.giantSword?.destroy();

    this.activeTelegraphs.forEach(t => t?.destroy());
    this.activeTelegraphs = [];

    this.activeHazards.forEach(h => {
      if (h.graphics) h.graphics.destroy();
    });
    this.activeHazards = [];

    this.activeProjectiles.forEach(p => {
      if (p.sprite) p.sprite.destroy();
    });
    this.activeProjectiles = [];
  }

  // ==========================================
  // ECS / DAMAGE LIFECYCLE
  // ==========================================

  public onDamaged(amount: number, currentHp: number, maxHp: number): void {
    // Screen hit shakes and spark emissions
    this.scene.cameras.main.shake(100, 0.008);
    this.scene.vfxManager.createDamageText(this.x, this.y - 45, amount, true);
    this.scene.vfxManager.spawnSparks(this.x, this.y, 0xff1100, 6);

    // Trigger damage flash
    this.isFlashingDamage = true;
    this.scene.time.delayedCall(120, () => {
      this.isFlashingDamage = false;
    });

    // Dynamic Phase thresholds (Phase 2 at 70%, Phase 3 at 35%)
    const pct = currentHp / maxHp;
    if (this.currentPhase === 1 && pct <= 0.70) {
      this.onPhaseTransition(2);
    } else if (this.currentPhase === 2 && pct <= 0.35) {
      this.onPhaseTransition(3);
    }
  }

  public onPhaseTransition(newPhase: number): void {
    this.currentPhase = newPhase;
    this.logger.info(`Fallen Colossus transitioning to Phase ${newPhase}!`);

    // Force transition block
    this.aiComponent.transitionTo(BossState.PHASE_TRANSITION);

    // Sync environmental particle managers
    EnvironmentalEffectsManager.getInstance().setBossPhase(newPhase);
    EnvironmentalEffectsManager.getInstance().triggerPhaseTransitionBurst();

    if (newPhase === 2) {
      // Crack open armor! Visually transition base colors and speed
      this.sprite.setScale(3.0); // Growth (scaled down from 4.2 to 3.0)
      this.sprite.setTint(0xffd700); // Glowing armor crack lines
      this.physicsComponent.speed = 45; // Higher speed
      this.physicsComponent.collisionRadius = 135; // Dynamically scale up the physical and hit-detection radius

      // Highlight core and shoulder elements (Burning molten eruption)
      this.moltenCore.setFillStyle(0xff5500);
      this.moltenCore.setRadius(13); // Scaled down from 18 to 13

      this.scene.cameras.main.flash(400, 255, 100, 0, 0.55);
    } 
    else if (newPhase === 3) {
      // Full molten desperation
      this.sprite.setScale(3.5); // Obsidian core is massive (scaled down from 4.8 to 3.5)
      this.sprite.setTint(0xff0033); // Searing anger crimson
      this.physicsComponent.speed = 55;
      this.physicsComponent.collisionRadius = 160; // Dynamically scale up the physical and hit-detection radius

      this.moltenCore.setFillStyle(0xff0033);
      this.moltenCore.setRadius(16); // Scaled down from 24 to 16

      this.leftShoulder.setFillStyle(0xff1100);
      this.rightShoulder.setFillStyle(0xff1100);

      this.scene.cameras.main.flash(500, 255, 0, 50, 0.65);
    }

    // Trigger hooks
    EventBus.getInstance().emit(EventTopic.BOSS_PHASE_CHANGED, { phase: newPhase });
  }

  public onDefeated(): void {
    if (this.isDefeatedState) return;
    this.isDefeatedState = true;
    this.logger.info('Fallen Colossus slayed!');

    this.aiComponent.transitionTo(BossState.DEFEATED);
    this.physicsComponent.setVelocity(0, 0);

    // ==========================================
    // STAGE 1: COLLAPSE & SWORD DRAG (0ms - 1000ms)
    // ==========================================
    
    // Slow-motion knee collapse (kneels down 25px, scaleY squeezes to 0.6x, scaleX spreads)
    this.scene.tweens.add({
      targets: [this.sprite, this.leftShoulder, this.rightShoulder, this.moltenCore],
      y: '+=25',
      scaleY: '*=0.6',
      scaleX: '*=1.1',
      duration: 1000,
      ease: 'Cubic.easeOut'
    });

    // Sword drags slowly to ground, grinding dust particles
    this.scene.tweens.add({
      targets: this.giantSword,
      y: '+=35',
      rotation: '+=0.6',
      duration: 1000,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        if (Math.random() < 0.35) {
          const dragX = this.giantSword.x + Math.cos(this.giantSword.rotation) * 110;
          const dragY = this.giantSword.y + Math.sin(this.giantSword.rotation) * 110;
          this.scene.vfxManager.spawnSparks(dragX, dragY, 0x777777, 1); // grey ground dust
        }
      }
    });

    // ==========================================
    // STAGE 2: SEARING CORE PULSE & PRE-RUMBLE (1000ms - 2200ms)
    // ==========================================
    this.scene.time.delayedCall(1000, () => {
      if (!this.active) return;
      
      // Screen pre-shakes gently, building physical pressure
      CameraEffectsManager.getInstance().shake(1200, 0.003);

      // Core scale grows and flickers aggressively
      this.scene.tweens.add({
        targets: this.moltenCore,
        scale: 2.2,
        duration: 1200,
        ease: 'Quad.easeIn'
      });

      // 15Hz flicker timer loop
      const flickerInterval = 1000 / 15; // ~66ms
      this.scene.time.addEvent({
        delay: flickerInterval,
        repeat: 18, // 18 * ~66ms = ~1200ms
        callback: () => {
          if (!this.active || !this.moltenCore) return;
          const tints = [0xffffff, 0xffaa00, 0xff3300];
          const randomTint = Phaser.Utils.Array.GetRandom(tints);
          this.moltenCore.setFillStyle(randomTint);
        }
      });
    });

    // ==========================================
    // STAGE 3: WHITE BLAST & SHATTER SPLIT (2200ms+)
    // ==========================================
    this.scene.time.delayedCall(2200, () => {
      if (!this.active) return;

      // Flash-white blast camera effect
      this.scene.cameras.main.flash(250, 255, 255, 255, 0.75);
      CameraEffectsManager.getInstance().shake(500, 0.015);

      // Core explode impact sparks!
      this.scene.vfxManager.spawnSparks(this.x, this.y, 0xff3300, 40);
      this.scene.vfxManager.spawnSparks(this.x, this.y, 0xffaa00, 30);
      this.scene.vfxManager.spawnSparks(this.x, this.y, 0xffffff, 20);

      // Spawn 3 distinct tiers of shockwave rings
      // Ring 1: Expanding Fire ring
      const fireRing = this.scene.add.circle(this.x, this.y, 10, 0xff5500, 0.3);
      fireRing.setStrokeStyle(3, 0xffaa00);
      fireRing.setDepth(15);
      this.scene.tweens.add({
        targets: fireRing,
        scale: 25,
        alpha: 0,
        duration: 550,
        onComplete: () => fireRing.destroy()
      });

      // Ring 2: Secondary Electric Purple Dust ring
      const purpleRing = this.scene.add.circle(this.x, this.y, 10, 0xbf55ff, 0.25);
      purpleRing.setStrokeStyle(4, 0xd880ff);
      purpleRing.setDepth(15);
      this.scene.tweens.add({
        targets: purpleRing,
        scale: 18,
        alpha: 0,
        delay: 100,
        duration: 500,
        onComplete: () => purpleRing.destroy()
      });

      // Ring 3: Slower ground-hugging Grey Ash ring
      const ashRing = this.scene.add.circle(this.x, this.y, 10, 0x64748b, 0.4);
      ashRing.setStrokeStyle(2, 0x94a3b8);
      ashRing.setDepth(15);
      this.scene.tweens.add({
        targets: ashRing,
        scale: 32,
        alpha: 0,
        delay: 50,
        duration: 850,
        onComplete: () => ashRing.destroy()
      });

      // Armor turns dark charcoal black
      this.sprite.setTint(0x1c1917);
      if (this.leftShoulder) this.leftShoulder.setFillStyle(0x1c1917);
      if (this.rightShoulder) this.rightShoulder.setFillStyle(0x1c1917);
      if (this.moltenCore) this.moltenCore.setFillStyle(0x0a0a0a);

      // Disintegrate pieces outward with a spin
      this.scene.tweens.add({
        targets: [this.sprite, this.leftShoulder, this.rightShoulder, this.giantSword, this.moltenCore],
        angle: 360,
        alpha: 0,
        scale: 0.01,
        duration: 1400,
        ease: 'Power2.easeOut',
        onComplete: () => {
          this.destroyVisualsAndHazards();
        }
      });
    });

    // Trigger boss manager defeat lifecycle (Gold bonuses, codex unlock, wave resumes)
    EventBus.getInstance().emit(EventTopic.BOSS_DEFEATED);
  }

  public destroy(): void {
    this.destroyVisualsAndHazards();
    super.destroy();
  }
}

// ==========================================
// CUSTOM BOSS AI STATES
// ==========================================

class ColossusIntroState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    comp.bossEntity.setInvulnerable(true);
    if (comp.physics) {
      comp.physics.targetVx = 0;
      comp.physics.targetVy = 0;
    }
  }
  update(comp: BossAIComponent): void {}
  exit(comp: BossAIComponent): void {
    comp.bossEntity.setInvulnerable(false);
  }
}

class ColossusChaseState implements IBossAIState {
  enter(comp: BossAIComponent): void {}

  update(comp: BossAIComponent, time: number, delta: number): void {
    const boss = comp.bossEntity as ColossusBossEntity;
    const player = comp.playerEntity;

    if (!player || !player.active || boss.isPerformingAttack) return;

    // Tick down attack timers
    boss.attackTimer += delta;
    if (boss.attackTimer >= boss.nextAttackTime) {
      boss.attackTimer = 0;
      comp.transitionTo(BossState.ATTACK);
      return;
    }

    // Standard slow deliberate movement towards player
    const angle = Phaser.Math.Angle.Between(boss.x, boss.y, player.x, player.y);
    const speed = boss.physicsComponent.speed;
    
    boss.physicsComponent.targetVx = Math.cos(angle) * speed;
    boss.physicsComponent.targetVy = Math.sin(angle) * speed;
  }

  exit(comp: BossAIComponent): void {}
}

class ColossusAttackState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    // Halts to execute custom heavy attacks
    comp.physics.targetVx = 0;
    comp.physics.targetVy = 0;

    const boss = comp.bossEntity as ColossusBossEntity;
    boss.executeRandomAttack();
  }

  update(comp: BossAIComponent): void {
    // Stays here until attack completes
  }

  exit(comp: BossAIComponent): void {}
}

class ColossusPhaseTransitionState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    comp.bossEntity.setInvulnerable(true);
    comp.physics.targetVx = 0;
    comp.physics.targetVy = 0;
  }

  update(comp: BossAIComponent, time: number, delta: number): void {
    // Shake screen during flare transition
    if (comp.stateTimer > 2500) {
      comp.transitionTo(BossState.CHASE);
    }
  }

  exit(comp: BossAIComponent): void {
    comp.bossEntity.setInvulnerable(false);
  }
}
