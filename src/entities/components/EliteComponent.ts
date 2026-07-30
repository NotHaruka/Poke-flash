import Phaser from 'phaser';
import { BaseComponent } from '../BaseComponent.js';
import { BaseEntity } from '../BaseEntity.js';
import { PhysicsComponent } from '../PhysicsComponent.js';
import { HealthComponent } from '../HealthComponent.js';
import { AudioManager } from '../../managers/AudioManager.js';

export enum EliteAbilityState {
  IDLE = 'IDLE',
  PREPARE = 'PREPARE_ABILITY',
  WINDUP = 'WINDUP',
  EXECUTION = 'EXECUTION',
  RECOVERY = 'RECOVERY'
}

export class EliteComponent extends BaseComponent {
  public mods: string[] = [];
  public currentState: EliteAbilityState = EliteAbilityState.IDLE;
  public currentAbilityName: string = 'None';
  
  // Timers and Cooldowns
  public abilityTimer: number = 0;
  public abilityStateTimer: number = 0;
  public cooldownRemaining: number = 0;
  
  // Shield Charge properties
  public shieldChargeDirX: number = 0;
  public shieldChargeDirY: number = 0;
  public shieldChargeStartX: number = 0;
  public shieldChargeStartY: number = 0;
  public chargeDistanceTracked: number = 0;
  
  // General active metrics
  public targetEntityName: string = 'Player';
  public lastCollisionObject: string = 'None';
  public currentCollisionTarget: string = 'None';
  public isAbilityActive: boolean = false;
  
  // Trail timers
  private lastTrailTime: number = 0;
  
  // Shockwave or effect active state
  public shockwaveRadius: number = 0;
  public maxShockwaveRadius: number = 85;

  constructor(owner: BaseEntity, mods: string[]) {
    super(owner);
    this.mods = mods;
  }

  public init(): void {
    // Stagger initial abilities so they don't all trigger at once
    this.abilityTimer = 0; // Trigger ability soon
    this.lastTrailTime = 0;
  }

  public hasMod(mod: string): boolean {
    return this.mods.includes(mod);
  }

  public getEliteType(): string {
    return this.mods.join(' + ') + ' Elite';
  }

  public update(time: number, delta: number): void {
    if (!this.owner.active) return;
    
    const scene = this.owner.gameObject?.scene as any;
    if (!scene || !scene.player || !scene.player.active) {
      this.resetToIdle();
      return;
    }

    const enemyPhysics = this.owner.getComponent<PhysicsComponent>('physics');
    const playerPhysics = scene.player.getComponent<PhysicsComponent>('physics');
    if (!enemyPhysics || !playerPhysics) return;

    // 1. Process movement trails (passive mechanics)
    this.updateTrails(time, scene, enemyPhysics);

    // 2. Decrement Cooldown Remaining for HUD
    if (this.abilityTimer > time) {
      this.cooldownRemaining = Math.max(0, this.abilityTimer - time);
    } else {
      this.cooldownRemaining = 0;
    }

    // 3. Update active ability state machine
    switch (this.currentState) {
      case EliteAbilityState.IDLE:
        this.currentAbilityName = 'None';
        this.isAbilityActive = false;
        
        // Check if ready to cast ability
        if (time >= this.abilityTimer) {
          this.triggerNextAbility(time, scene, enemyPhysics);
        }
        break;

      case EliteAbilityState.PREPARE:
        // Transition immediately to Windup or do pre-effects
        this.currentState = EliteAbilityState.WINDUP;
        break;

      case EliteAbilityState.WINDUP:
        this.isAbilityActive = true;
        this.currentCollisionTarget = 'None';
        this.abilityStateTimer -= delta;

        // Visual warning flashes
        const flash = Math.floor(time / 60) % 2 === 0;
        this.setSpriteTint(flash ? 0xff3333 : 0xff9999);

        // Keep velocity stopped
        enemyPhysics.vx = 0;
        enemyPhysics.vy = 0;
        enemyPhysics.targetVx = 0;
        enemyPhysics.targetVy = 0;

        // Force rotation to face the player during windup
        const dx = scene.player.x - this.owner.x;
        const dy = scene.player.y - this.owner.y;
        if (this.owner.gameObject && 'rotation' in this.owner.gameObject) {
          (this.owner.gameObject as any).rotation = Math.atan2(dy, dx);
        }

        if (this.abilityStateTimer <= 0) {
          this.startExecution(time, scene, enemyPhysics);
        }
        break;

      case EliteAbilityState.EXECUTION:
        this.isAbilityActive = true;
        this.updateExecution(time, delta, scene, enemyPhysics, playerPhysics);
        break;

      case EliteAbilityState.RECOVERY:
        this.isAbilityActive = false;
        this.abilityStateTimer -= delta;

        // Pause velocity during recovery
        if (this.currentAbilityName === 'Shield Charge') {
          // Stunned recovery state from wall impact
          enemyPhysics.vx = 0;
          enemyPhysics.vy = 0;
          enemyPhysics.targetVx = 0;
          enemyPhysics.targetVy = 0;
          if (Math.random() < 0.08) {
            scene.vfxManager?.spawnSparks(this.owner.x + Phaser.Math.Between(-10, 10), this.owner.y - 25, 0xfff300, 1);
          }
        }

        if (this.abilityStateTimer <= 0) {
          this.resetToIdle();
        }
        break;
    }
  }

  private updateTrails(time: number, scene: any, enemyPhysics: PhysicsComponent): void {
    const speedSq = enemyPhysics.vx * enemyPhysics.vx + enemyPhysics.vy * enemyPhysics.vy;
    if (speedSq > 225 && time - this.lastTrailTime > 180) {
      this.lastTrailTime = time;
      
      const isChampion = (this.owner as any).isMiniBoss || (this.owner as any).isLegendaryBeast;
      
      if (this.hasMod('Burning')) {
        scene.spawnElitePuddle(this.owner.x, this.owner.y, 'fire', isChampion);
      }
      if (this.hasMod('Frozen')) {
        scene.spawnElitePuddle(this.owner.x, this.owner.y, 'ice', false);
      }
    }
  }

  private triggerNextAbility(time: number, scene: any, enemyPhysics: PhysicsComponent): void {
    // Choose which ability to execute based on active mods
    const availableAbilities: string[] = [];
    if (this.hasMod('Burning')) availableAbilities.push('Flame Eruption');
    if (this.hasMod('Vampiric')) availableAbilities.push('Vampiric Lunge');
    if (this.hasMod('Frozen')) availableAbilities.push('Frost Pulse');
    if (this.hasMod('Giant')) availableAbilities.push('Earthquake Slam');
    if (this.hasMod('Armored')) availableAbilities.push('Shield Charge');

    if (availableAbilities.length === 0) return;

    // Pick one
    const chosen = Phaser.Math.RND.pick(availableAbilities);
    this.currentAbilityName = chosen;
    
    // Set general ability cooldown
    this.abilityTimer = time + Phaser.Math.Between(8500, 11500);

    // Enter Windup State
    this.currentState = EliteAbilityState.WINDUP;
    (this.owner as any).disableAI = true;
    
    enemyPhysics.vx = 0;
    enemyPhysics.vy = 0;
    enemyPhysics.targetVx = 0;
    enemyPhysics.targetVy = 0;

    // Set windup duration
    if (chosen === 'Shield Charge') {
      this.abilityStateTimer = 1000; // 1 second windup for warning target line
      AudioManager.getInstance().playSFX('swoosh');
      
      // Spawn line graphics warning
      const targetLine = scene.add.graphics();
      targetLine.setDepth(1);
      
      const drawEvent = scene.time.addEvent({
        delay: 16,
        loop: true,
        callback: () => {
          if (this.owner.active && this.currentState === EliteAbilityState.WINDUP) {
            targetLine.clear();
            targetLine.lineStyle(2, 0xeab308, 0.65);
            targetLine.lineBetween(this.owner.x, this.owner.y, scene.player.x, scene.player.y);
          } else {
            targetLine.destroy();
            drawEvent.destroy();
          }
        }
      });
      
      // Windup wobble/scale effect
      scene.tweens.add({
        targets: this.owner.gameObject,
        scale: (this.owner.gameObject as any).scaleX * 1.15,
        duration: 1000,
        yoyo: true,
        repeat: 0,
        onComplete: () => {
          targetLine.destroy();
          drawEvent.destroy();
        }
      });
    } else if (chosen === 'Earthquake Slam') {
      this.abilityStateTimer = 900;
      this.shockwaveRadius = 0;
      // Giant telegraph warning
      scene.tweens.add({
        targets: this.owner.gameObject,
        scaleY: (this.owner.gameObject as any).scaleY * 1.25,
        duration: 450,
        yoyo: true,
        repeat: 1
      });
    } else if (chosen === 'Vampiric Lunge') {
      this.abilityStateTimer = 600;
      scene.tweens.add({
        targets: this.owner.gameObject,
        scaleX: (this.owner.gameObject as any).scaleX * 1.2,
        duration: 300,
        yoyo: true,
        repeat: 0
      });
    } else if (chosen === 'Flame Eruption') {
      this.abilityStateTimer = 700;
    } else {
      this.abilityStateTimer = 600;
    }
  }

  private startExecution(time: number, scene: any, enemyPhysics: PhysicsComponent): void {
    this.currentState = EliteAbilityState.EXECUTION;
    this.setSpriteTint(this.getModColorTint());

    const playerPhysics = scene.player.getComponent('physics') as PhysicsComponent;
    const angleToPlayer = Phaser.Math.Angle.Between(this.owner.x, this.owner.y, scene.player.x, scene.player.y);

    if (this.currentAbilityName === 'Shield Charge') {
      this.shieldChargeDirX = Math.cos(angleToPlayer);
      this.shieldChargeDirY = Math.sin(angleToPlayer);
      this.shieldChargeStartX = this.owner.x;
      this.shieldChargeStartY = this.owner.y;
      this.chargeDistanceTracked = 0;
      this.abilityStateTimer = 1500; // max charge duration
      AudioManager.getInstance().playSFX('swoosh');
    } else if (this.currentAbilityName === 'Vampiric Lunge') {
      const lungeSpeed = enemyPhysics.speed * 3.8;
      enemyPhysics.vx = Math.cos(angleToPlayer) * lungeSpeed;
      enemyPhysics.vy = Math.sin(angleToPlayer) * lungeSpeed;
      this.abilityStateTimer = 700; // Duration of speed lunge
      AudioManager.getInstance().playSFX('swoosh');
      scene.vfxManager?.spawnSparks(this.owner.x, this.owner.y, 0xd946ef, 8);
    } else if (this.currentAbilityName === 'Flame Eruption') {
      // Cast fire projectiles
      AudioManager.getInstance().playSFX('fireball' as any);
      scene.vfxManager?.spawnSparks(this.owner.x, this.owner.y, 0xff5500, 10);
      
      const isHeavy = this.owner.id.includes('heavy') || this.hasMod('Giant');
      const count = isHeavy ? 8 : 4;
      const angleStep = (Math.PI * 2) / count;
      
      for (let i = 0; i < count; i++) {
        const angle = angleToPlayer + i * angleStep;
        const vx = Math.cos(angle) * 220;
        const vy = Math.sin(angle) * 220;
        
        // Spawn fire projectile
        const sprite = scene.add.circle(this.owner.x, this.owner.y, 7, 0xff3700);
        sprite.setDepth(3);
        scene.physics.add.existing(sprite);
        
        scene.activeEliteProjectiles.push({
          sprite,
          vx,
          vy,
          type: 'fire',
          damage: 1,
          expiresAt: time + 2500,
          radius: 7
        });
      }
      
      this.abilityStateTimer = 300; // brief pause
    } else if (this.currentAbilityName === 'Frost Pulse') {
      // Cast ice projectiles / wave
      AudioManager.getInstance().playSFX('freeze' as any);
      scene.vfxManager?.spawnSparks(this.owner.x, this.owner.y, 0x06b6d4, 10);
      
      const count = 6;
      const angleStep = (Math.PI * 0.7) / (count - 1);
      const startAngle = angleToPlayer - (Math.PI * 0.35);
      
      for (let i = 0; i < count; i++) {
        const angle = startAngle + i * angleStep;
        const vx = Math.cos(angle) * 190;
        const vy = Math.sin(angle) * 190;
        
        const sprite = scene.add.circle(this.owner.x, this.owner.y, 6, 0x06b6d4);
        sprite.setDepth(3);
        scene.physics.add.existing(sprite);
        
        scene.activeEliteProjectiles.push({
          sprite,
          vx,
          vy,
          type: 'ice',
          damage: 1,
          expiresAt: time + 2200,
          radius: 6
        });
      }
      
      // Frost pulse wave warning circles
      this.abilityStateTimer = 400;
    } else if (this.currentAbilityName === 'Earthquake Slam') {
      AudioManager.getInstance().playSFX('explosion' as any);
      scene.cameras.main.shake(150, 0.012);
      
      // Giant slam shockwave expansion
      this.shockwaveRadius = 10;
      this.abilityStateTimer = 600; // Duration of slam recovery
      
      // Visual ground stomp wave
      const stompCircle = scene.add.circle(this.owner.x, this.owner.y, 10, 0x4f46e5, 0.0);
      stompCircle.setStrokeStyle(3, 0x4f46e5, 0.85);
      stompCircle.setDepth(2);
      
      scene.tweens.add({
        targets: stompCircle,
        radius: this.maxShockwaveRadius,
        alpha: 0,
        duration: 450,
        onComplete: () => stompCircle.destroy()
      });
      
      // Check player overlap inside shockwave
      const distToPlayer = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, this.owner.x, this.owner.y);
      if (distToPlayer <= this.maxShockwaveRadius) {
        if (!scene.isDodging && scene.player.active) {
          scene.damagePlayer(this.owner);
          // Strong knockback
          const kbAngle = Math.atan2(scene.player.y - this.owner.y, scene.player.x - this.owner.x);
          playerPhysics.setVelocity(Math.cos(kbAngle) * 550, Math.sin(kbAngle) * 550);
          scene.vfxManager?.addFloatingWorldText(scene.player.x, scene.player.y - 40, "💥 SHOCKWAVE!", "#4f46e5");
        }
      }
    }
  }

  private updateExecution(time: number, delta: number, scene: any, enemyPhysics: PhysicsComponent, playerPhysics: PhysicsComponent): void {
    this.abilityStateTimer -= delta;

    if (this.currentAbilityName === 'Shield Charge') {
      const chargeSpeed = enemyPhysics.speed * 4.4;
      enemyPhysics.vx = this.shieldChargeDirX * chargeSpeed;
      enemyPhysics.vy = this.shieldChargeDirY * chargeSpeed;

      // Track distance
      const dx = this.owner.x - this.shieldChargeStartX;
      const dy = this.owner.y - this.shieldChargeStartY;
      this.chargeDistanceTracked = Math.sqrt(dx * dx + dy * dy);

      // Sparks VFX
      if (Math.random() < 0.28) {
        scene.vfxManager?.spawnSparks(this.owner.x, this.owner.y, 0xeab308, 1);
      }

      // Check boundary walls hit dynamically matching physics boundaries
      const isAtLeft = this.owner.x <= enemyPhysics.minX + 3 && this.shieldChargeDirX < -0.1;
      const isAtRight = this.owner.x >= enemyPhysics.maxX - 3 && this.shieldChargeDirX > 0.1;
      const isAtTop = this.owner.y <= enemyPhysics.minY + 3 && this.shieldChargeDirY < -0.1;
      const isAtBottom = this.owner.y >= enemyPhysics.maxY - 3 && this.shieldChargeDirY > 0.1;
      const hitWall = isAtLeft || isAtRight || isAtTop || isAtBottom;

      // Contact hit checking with correct sizes + tolerance
      const contactRadius = enemyPhysics.collisionRadius + playerPhysics.collisionRadius + 10;
      const distToPlayer = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, this.owner.x, this.owner.y);

      if (distToPlayer <= contactRadius) {
        this.currentCollisionTarget = 'Player';
        this.lastCollisionObject = 'Player';
        
        if (!scene.isDodging && scene.player.active) {
          scene.damagePlayer(this.owner);
          // Apply heavy knockback
          const angle = Math.atan2(this.shieldChargeDirY, this.shieldChargeDirX);
          playerPhysics.setVelocity(Math.cos(angle) * 480, Math.sin(angle) * 480);
          scene.vfxManager?.addFloatingWorldText(scene.player.x, scene.player.y - 45, "🛡️ SHIELD IMPACT!", "#eab308");
        }
        
        // Successful hit: NO self-stun! Reset immediately
        this.resetToIdle();
      } else if (hitWall || this.abilityStateTimer <= 0) {
        // Hits wall: STUNNED!
        this.currentCollisionTarget = hitWall ? 'Arena Wall' : 'None (Timeout)';
        this.lastCollisionObject = hitWall ? 'Arena Wall' : 'None (Timeout)';
        
        this.currentState = EliteAbilityState.RECOVERY;
        this.abilityStateTimer = 2200; // Stunned for 2.2 seconds!
        
        enemyPhysics.vx = 0;
        enemyPhysics.vy = 0;
        enemyPhysics.targetVx = 0;
        enemyPhysics.targetVy = 0;
        
        AudioManager.getInstance().playSFX('hurt');
        scene.cameras.main.shake(200, 0.008);
        scene.vfxManager?.spawnSparks(this.owner.x, this.owner.y, 0xeab308, 14);
        scene.vfxManager?.addFloatingWorldText(this.owner.x, this.owner.y - 30, "💫 STUNNED!", "#eab308");
      }
    } else if (this.currentAbilityName === 'Vampiric Lunge') {
      const contactRadius = enemyPhysics.collisionRadius + playerPhysics.collisionRadius + 12;
      const distToPlayer = Phaser.Math.Distance.Between(scene.player.x, scene.player.y, this.owner.x, this.owner.y);
      
      if (distToPlayer <= contactRadius) {
        this.currentCollisionTarget = 'Player';
        this.lastCollisionObject = 'Player';
        
        if (!scene.isDodging && scene.player.active) {
          scene.damagePlayer(this.owner);
          
          // Heal lifesteal up to a healing cap of 20% of max health
          const hpComp = this.owner.getComponent<HealthComponent>('health');
          if (hpComp) {
            const healAmount = Math.round(hpComp.getMaxHp() * 0.20);
            hpComp.heal(healAmount);
            scene.vfxManager?.spawnSparks(this.owner.x, this.owner.y, 0x10b981, 12);
            scene.vfxManager?.addFloatingWorldText(this.owner.x, this.owner.y - 35, `+${healAmount} HP (Vampiric)`, "#10b981");
          }
        }
        this.resetToIdle();
      } else if (this.abilityStateTimer <= 0) {
        this.resetToIdle();
      }
    } else {
      // General transition
      if (this.abilityStateTimer <= 0) {
        this.currentState = EliteAbilityState.RECOVERY;
        this.abilityStateTimer = 200; // brief recovery pause
      }
    }
  }

  private resetToIdle(): void {
    this.currentState = EliteAbilityState.IDLE;
    (this.owner as any).disableAI = false;
    this.setSpriteTint(this.getOriginalTint());
  }

  private setSpriteTint(color: number): void {
    if (this.owner.gameObject && 'setTint' in this.owner.gameObject) {
      (this.owner.gameObject as any).setTint(color);
    }
  }

  private getOriginalTint(): number {
    const mainMod = this.mods[0];
    if (mainMod === 'Burning') return 0xff5500;
    if (mainMod === 'Vampiric') return 0xd946ef;
    if (mainMod === 'Frozen') return 0x06b6d4;
    if (mainMod === 'Giant') return 0x4f46e5;
    if (mainMod === 'Armored') return 0xeab308;
    return 0xffffff;
  }

  private getModColorTint(): number {
    const mainMod = this.mods[0];
    if (mainMod === 'Burning') return 0xff2200;
    if (mainMod === 'Vampiric') return 0xd946ef;
    if (mainMod === 'Frozen') return 0x06b6d4;
    if (mainMod === 'Giant') return 0x4338ca;
    if (mainMod === 'Armored') return 0xca8a04;
    return 0xffea00;
  }

  public destroy(): void {
    super.destroy();
    this.resetToIdle();
  }
}
