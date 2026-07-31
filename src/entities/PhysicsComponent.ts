import { BaseComponent } from './BaseComponent.js';
import { BaseEntity } from './BaseEntity.js';
import { ArenaEffectsManager } from '../managers/ArenaEffectsManager.js';

export class PhysicsComponent extends BaseComponent {
  public vx: number = 0;
  public vy: number = 0;
  public speed: number;
  public friction: number = 0.85;

  // Physical spatial collision properties
  public weight: number = 1.0;
  public collisionRadius: number = 24;

  // Smooth movement control parameter targets
  public targetVx: number = 0;
  public targetVy: number = 0;
  public accelerationRate: number = 14.0; // Interpolation rate for accelerating
  public decelerationRate: number = 18.0; // Interpolation rate for slowing down/stopping

  public minX: number = 20;
  public maxX: number = 1004;
  public minY: number = 20;
  public maxY: number = 556;

  constructor(owner: BaseEntity, speed: number) {
    super(owner);
    this.speed = speed;
  }

  public setBoundaries(minX: number, maxX: number, minY: number, maxY: number): void {
    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
  }

  public update(time: number, delta: number): void {
    const dt = delta / 1000;

    // Smoothly interpolate current velocity to target velocity using Delta Time
    const isTargetZero = this.targetVx === 0 && this.targetVy === 0;
    const rate = isTargetZero ? this.decelerationRate : this.accelerationRate;

    // Simple lerp calculation
    this.vx += (this.targetVx - this.vx) * rate * dt;
    this.vy += (this.targetVy - this.vy) * rate * dt;

    // Apply friction/drag as secondary damping
    this.vx *= this.friction;
    this.vy *= this.friction;

    // Apply movement changes
    this.owner.x += this.vx * dt;
    this.owner.y += this.vy * dt;

    // Clamp inside arena colosseum boundaries
    if (this.owner.x < this.minX) {
      const wasMoving = this.vx < -10;
      this.owner.x = this.minX;
      this.vx = 0;
      this.targetVx = 0;
      if (wasMoving) {
        ArenaEffectsManager.getInstance().triggerBarrierHit(this.minX, this.owner.y, 'left');
      }
    }
    if (this.owner.x > this.maxX) {
      const wasMoving = this.vx > 10;
      this.owner.x = this.maxX;
      this.vx = 0;
      this.targetVx = 0;
      if (wasMoving) {
        ArenaEffectsManager.getInstance().triggerBarrierHit(this.maxX, this.owner.y, 'right');
      }
    }
    if (this.owner.y < this.minY) {
      const wasMoving = this.vy < -10;
      this.owner.y = this.minY;
      this.vy = 0;
      this.targetVy = 0;
      if (wasMoving) {
        ArenaEffectsManager.getInstance().triggerBarrierHit(this.owner.x, this.minY, 'top');
      }
    }
    if (this.owner.y > this.maxY) {
      const wasMoving = this.vy > 10;
      this.owner.y = this.maxY;
      this.vy = 0;
      this.targetVy = 0;
      if (wasMoving) {
        ArenaEffectsManager.getInstance().triggerBarrierHit(this.owner.x, this.maxY, 'bottom');
      }
    }

    // Sync physical coordinates to the bound game object if it exists
    if (this.owner.gameObject && 'setPosition' in this.owner.gameObject) {
      (this.owner.gameObject as any).setPosition(this.owner.x, this.owner.y);
    }
  }

  /**
   * Instantly override current velocity and set targets. Great for knockbacks or dash rolls.
   */
  public setVelocity(vx: number, vy: number): void {
    this.vx = vx;
    this.vy = vy;
    this.targetVx = vx;
    this.targetVy = vy;
  }

  /**
   * Set target velocity. Movement loop will smoothly accelerate towards this.
   */
  public setTargetVelocity(vx: number, vy: number): void {
    this.targetVx = vx;
    this.targetVy = vy;
  }

  public addVelocity(ax: number, ay: number): void {
    this.vx += ax;
    this.vy += ay;
    this.targetVx = this.vx;
    this.targetVy = this.vy;
  }

  /**
   * Clamp the owner's position inside the arena colosseum boundaries and synchronize to Phaser game object.
   */
  public clampAndSync(): void {
    if (this.owner.x < this.minX) {
      const wasMoving = this.vx < -10;
      this.owner.x = this.minX;
      this.vx = 0;
      this.targetVx = 0;
      if (wasMoving) {
        ArenaEffectsManager.getInstance().triggerBarrierHit(this.minX, this.owner.y, 'left');
      }
    }
    if (this.owner.x > this.maxX) {
      const wasMoving = this.vx > 10;
      this.owner.x = this.maxX;
      this.vx = 0;
      this.targetVx = 0;
      if (wasMoving) {
        ArenaEffectsManager.getInstance().triggerBarrierHit(this.maxX, this.owner.y, 'right');
      }
    }
    if (this.owner.y < this.minY) {
      const wasMoving = this.vy < -10;
      this.owner.y = this.minY;
      this.vy = 0;
      this.targetVy = 0;
      if (wasMoving) {
        ArenaEffectsManager.getInstance().triggerBarrierHit(this.owner.x, this.minY, 'top');
      }
    }
    if (this.owner.y > this.maxY) {
      const wasMoving = this.vy > 10;
      this.owner.y = this.maxY;
      this.vy = 0;
      this.targetVy = 0;
      if (wasMoving) {
        ArenaEffectsManager.getInstance().triggerBarrierHit(this.owner.x, this.maxY, 'bottom');
      }
    }

    if (this.owner.gameObject && 'setPosition' in this.owner.gameObject) {
      (this.owner.gameObject as any).setPosition(this.owner.x, this.owner.y);
    }
  }
}
