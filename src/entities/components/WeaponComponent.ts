import Phaser from 'phaser';
import { BaseComponent } from '../BaseComponent.js';
import { BaseEntity } from '../BaseEntity.js';
import { AudioManager } from '../../managers/AudioManager.js';

export class WeaponComponent extends BaseComponent {
  // Weapon configuration
  public weight: number = 1.0;        // Influences swing speed and damage
  private _length: number = 75;         // Pixel reach of the sword
  private _baseDamage: number = 25;     // Base attack value
  public baseKnockback: number = 220; // Base knockback value
  public handleOffset: number = 25; // Distance from player center to sword handle

  // Getters that apply modifiers dynamically
  public get length(): number {
    const modifiers = this.owner.getComponent<any>('modifiers');
    if (!modifiers) return this._length;
    let baseLen = modifiers.getModifiedValue('length', this._length);
    if (modifiers.hasLegendaryUpgrade('tempest_momentum')) {
      const vel = this.getAngularVelocity();
      const velocityRatio = Phaser.Math.Clamp(vel / 12.0, 0, 1.0);
      baseLen *= (1.0 + 0.40 * velocityRatio);
    }
    return Math.round(baseLen);
  }
  public set length(val: number) {
    this._length = val;
  }

  public get baseDamage(): number {
    const modifiers = this.owner.getComponent<any>('modifiers');
    return modifiers ? Math.round(modifiers.getModifiedValue('damage', this._baseDamage)) : this._baseDamage;
  }
  public set baseDamage(val: number) {
    this._baseDamage = val;
  }

  // Spring & Inertia states (for idle follow)
  public currentAngle: number = 0;    // Current angle in radians
  private angularVelocity: number = 0; // Current angular velocity (rad/s)
  private springStiffness: number = 80; // Stiffness of the follow spring to make weight distinct
  private springDamping: number = 14;    // Damping of the spring for natural momentum

  // Trail rendering history
  private trailPoints: { x: number; y: number; alpha: number }[] = [];
  private maxTrailPoints: number = 10;
  private trailGraphics!: Phaser.GameObjects.Graphics;

  // Collision hit cooldowns (enemyId -> remaining ms)
  public hitCooldowns: Map<string, number> = new Map();
  private readonly DEFAULT_HIT_COOLDOWN = 350; // 350ms between hits on same enemy

  constructor(owner: BaseEntity) {
    super(owner);
  }

  public init(): void {
    if (this.owner.gameObject) {
      const scene = this.owner.gameObject.scene;
      this.trailGraphics = scene.add.graphics();
      // Ensure trail graphics is drawn behind player or appropriately
      this.trailGraphics.setDepth((this.owner.gameObject as any).depth - 1);
    }
  }

  /**
   * Returns current weapon velocity magnitude in radians/sec.
   */
  public getAngularVelocity(): number {
    return Math.abs(this.angularVelocity);
  }

  /**
   * Calculate velocity multiplier for damage scaling (based on current angular velocity)
   */
  public getSpeedDamageMultiplier(): { multiplier: number; isCrit: boolean } {
    const vel = this.getAngularVelocity();
    // Fast swing speed threshold for crit/multiplier
    const expectedMax = 12.0;
    const ratio = Phaser.Math.Clamp(vel / expectedMax, 0.4, 2.0);
    const isCrit = ratio >= 1.25;
    return { multiplier: ratio, isCrit };
  }

  public update(time: number, delta: number): void {
    if (!this.isActive() || !this.owner.gameObject) return;

    const dtSeconds = delta / 1000;

    // Update individual enemy hit cooldowns
    for (const [id, remaining] of this.hitCooldowns.entries()) {
      if (remaining <= delta) {
        this.hitCooldowns.delete(id);
      } else {
        this.hitCooldowns.set(id, remaining - delta);
      }
    }

    this.updateSpringFollow(dtSeconds);

    // Update swing trails
    this.updateTrail(dtSeconds);
  }

  public angleOffset: number = 0; // Offset from target angle (e.g. Math.PI for opposite)

  public overrideTargetX?: number;
  public overrideTargetY?: number;
  public overrideAngle?: number; // Directly set the angle (bypassing spring)

  private updateSpringFollow(dt: number): void {
    if (this.overrideAngle !== undefined) {
      // Direct angle override, synthesize velocity for trails
      const angleDiff = Phaser.Math.Angle.Wrap(this.overrideAngle - this.currentAngle);
      this.angularVelocity = angleDiff / dt;
      this.currentAngle = this.overrideAngle;
      return;
    }

    // Spring physics target angle
    const mouseX = this.overrideTargetX !== undefined ? this.overrideTargetX : this.owner.gameObject!.scene.input.activePointer.worldX;
    const mouseY = this.overrideTargetY !== undefined ? this.overrideTargetY : this.owner.gameObject!.scene.input.activePointer.worldY;
    const targetAngle = Math.atan2(mouseY - this.owner.y, mouseX - this.owner.x) + this.angleOffset;

    // Calculate shortest angular distance
    const angleDiff = Phaser.Math.Angle.Wrap(targetAngle - this.currentAngle);

    const modifiers = this.owner.getComponent<any>('modifiers');
    const attackSpeed = modifiers ? modifiers.getModifiedValue('attackSpeed', 1.0) : 1.0;
    
    // Scale spring constants to physically increase weapon swing velocity
    const effectiveStiffness = this.springStiffness * (attackSpeed * attackSpeed);
    const effectiveDamping = this.springDamping * attackSpeed;

    // Spring equations: a = stiffness * diff - damping * velocity
    const springForce = effectiveStiffness * angleDiff;
    const dampingForce = effectiveDamping * this.angularVelocity;
    const angularAcceleration = (springForce - dampingForce) / this.weight;

    this.angularVelocity += angularAcceleration * dt;
    // Limit speed to prevent infinite spinning
    const maxVelocity = 15 * attackSpeed;
    this.angularVelocity = Phaser.Math.Clamp(this.angularVelocity, -maxVelocity, maxVelocity);

    this.currentAngle = Phaser.Math.Angle.Wrap(this.currentAngle + this.angularVelocity * dt);
  }

  private updateTrail(dt: number): void {
    this.trailGraphics.clear();

    // Only draw trail if moving fast enough
    if (this.getAngularVelocity() > 6) {
      // Calculate tip of the blade coordinates
      const reach = this.handleOffset + this.length;
      const tipX = this.owner.x + Math.cos(this.currentAngle) * reach;
      const tipY = this.owner.y + Math.sin(this.currentAngle) * reach;

      // Add to trail history
      this.trailPoints.push({ x: tipX, y: tipY, alpha: 1.0 });
    }

    // Decay existing trail points
    for (let i = this.trailPoints.length - 1; i >= 0; i--) {
      this.trailPoints[i].alpha -= dt * 4.0; // Decay speed
      if (this.trailPoints[i].alpha <= 0) {
        this.trailPoints.splice(i, 1);
      }
    }

    // Limit maximum size
    if (this.trailPoints.length > this.maxTrailPoints) {
      this.trailPoints.shift();
    }

    // Render trail geometry
    if (this.trailPoints.length > 1) {
      const modifiers = this.owner.getComponent<any>('modifiers');
      let trailColor = 0x00f3ff;
      if (modifiers && modifiers.hasLegendaryUpgrade('blood_moon_frenzy')) {
        trailColor = 0xef4444; // Crimson
      }

      for (let i = 1; i < this.trailPoints.length; i++) {
        const p1 = this.trailPoints[i - 1];
        const p2 = this.trailPoints[i];
        
        // Custom neon cyan / electric blue blade trail or crimson under blood moon frenzy
        this.trailGraphics.lineStyle(
          4 * p2.alpha, 
          trailColor, 
          p2.alpha * 0.7
        );
        this.trailGraphics.lineBetween(p1.x, p1.y, p2.x, p2.y);
      }
    }
  }

  /**
   * Checks if an enemy can be hit, and applies the cooldown if so.
   */
  public registerHit(entityId: string): boolean {
    if (this.hitCooldowns.has(entityId)) {
      return false; // On cooldown
    }
    
    const modifiers = this.owner.getComponent<any>('modifiers');
    const attackSpeed = modifiers ? modifiers.getModifiedValue('attackSpeed', 1.0) : 1.0;
    
    // Scale cooldown down by attack speed (faster attacks = less cooldown = more ticks)
    this.hitCooldowns.set(entityId, this.DEFAULT_HIT_COOLDOWN / attackSpeed);
    return true;
  }

  public getAngle(): number {
    return this.currentAngle;
  }

  public override setActive(active: boolean): void {
    super.setActive(active);
    if (!active && this.trailGraphics) {
      this.trailGraphics.clear();
      this.trailPoints = [];
    }
  }

  public destroy(): void {
    super.destroy();
    if (this.trailGraphics) {
      this.trailGraphics.destroy();
    }
    this.trailPoints = [];
    this.hitCooldowns.clear();
  }
}

