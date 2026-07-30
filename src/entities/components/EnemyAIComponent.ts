import Phaser from 'phaser';
import { BaseComponent } from '../BaseComponent.js';
import { BaseEntity } from '../BaseEntity.js';
import { PhysicsComponent } from '../PhysicsComponent.js';
import { HealthComponent } from '../HealthComponent.js';
import { CombatDirector } from '../../directors/CombatDirector.js';
import { Logger } from '../../utils/Logger.js';

export enum EnemyState {
  IDLE = 'IDLE',
  PATROL = 'PATROL',
  INVESTIGATE = 'INVESTIGATE',
  DETECT = 'DETECT',
  APPROACH = 'APPROACH',
  STRAFE = 'STRAFE',
  WINDUP = 'WINDUP',
  ATTACK = 'ATTACK',
  RECOVERY = 'RECOVERY',
  RETREAT = 'RETREAT',
  STUNNED = 'STUNNED',
  DEAD = 'DEAD'
}

export interface IEnemyAIState {
  enter(comp: EnemyAIComponent): void;
  update(comp: EnemyAIComponent, time: number, delta: number): void;
  exit(comp: EnemyAIComponent): void;
}

export class EnemyAIComponent extends BaseComponent {
  private currentState: EnemyState = EnemyState.PATROL;
  private statesMap: Map<EnemyState, IEnemyAIState>;
  private logger: Logger;

  // AI Configuration Parameters
  public detectRange: number = 280;
  public attackRange: number = 75;
  public targetRangeMin: number = 60;
  public targetRangeMax: number = 90;
  public strafeDir: number = 1; // 1 for clockwise, -1 for counter-clockwise
  
  // Timers
  public stateTimer: number = 0;
  public actionCooldown: number = 0;

  // References
  public playerEntity!: BaseEntity;
  public physics!: PhysicsComponent;
  public health!: HealthComponent;

  // Patrol
  public patrolOriginX: number = 0;
  public patrolOriginY: number = 0;
  public patrolTargetX: number = 0;
  public patrolTargetY: number = 0;
  public patrolRadius: number = 200;
  public patrolWaitTimer: number = 0;
  public lastKnownPlayerX: number = 0;
  public lastKnownPlayerY: number = 0;
  public hasLostPlayer: boolean = false;

  // Custom visual state
  private originalTint: number = 0xffffff;

  constructor(owner: BaseEntity, player: BaseEntity) {
    super(owner);
    this.playerEntity = player;
    this.logger = new Logger(`AIComponent::${owner.id}`);
    this.statesMap = new Map();
    this.setupStates();
  }

  public init(): void {
    const phys = this.owner.getComponent<PhysicsComponent>('physics');
    const hp = this.owner.getComponent<HealthComponent>('health');

    if (phys) this.physics = phys;
    if (hp) this.health = hp;

    // Set default base parameters depending on enemy type
    if (this.owner.id.includes('heavy')) {
      this.detectRange = 320;
      this.attackRange = 95;
      this.targetRangeMin = 80;
      this.targetRangeMax = 110;
    } else if (this.owner.id.includes('ranged')) {
      this.detectRange = 400;
      this.attackRange = 220;
      this.targetRangeMin = 160;
      this.targetRangeMax = 240;
    }

    if (this.owner.gameObject && 'tint' in this.owner.gameObject) {
      this.originalTint = (this.owner.gameObject as any).tintTopLeft || 0xffffff;
    }

    if (this.owner.gameObject && 'x' in this.owner.gameObject) {
      this.patrolOriginX = (this.owner.gameObject as any).x;
      this.patrolOriginY = (this.owner.gameObject as any).y;
    } else {
      this.patrolOriginX = this.owner.x;
      this.patrolOriginY = this.owner.y;
    }

    this.transitionTo(EnemyState.PATROL);
  }

  public getCurrentState(): EnemyState {
    return this.currentState;
  }

  public transitionTo(newState: EnemyState): void {
    if (this.currentState === EnemyState.DEAD) return; // Dead is terminal

    const oldStateImpl = this.statesMap.get(this.currentState);
    if (oldStateImpl) {
      oldStateImpl.exit(this);
    }

    this.currentState = newState;
    this.stateTimer = 0;

    const newStateImpl = this.statesMap.get(this.currentState);
    if (newStateImpl) {
      newStateImpl.enter(this);
    }
  }

  public update(time: number, delta: number): void {
    if (!this.isActive() || !this.owner.active) return;
    if ((this.owner as any).disableAI) return;

    // Check dead status
    if (this.health && this.health.getHp() <= 0 && this.currentState !== EnemyState.DEAD) {
      this.transitionTo(EnemyState.DEAD);
      return;
    }

    // AI action cooldown decreases over time
    if (this.actionCooldown > 0) {
      this.actionCooldown -= delta;
    }

    // Run active FSM state update
    const stateImpl = this.statesMap.get(this.currentState);
    if (stateImpl) {
      stateImpl.update(this, time, delta);
    }
  }

  /**
   * Apply a stun effect and push AI into STUNNED state.
   */
  public stun(duration: number): void {
    if (this.currentState === EnemyState.STUNNED) {
      this.stateTimer = Math.max(this.stateTimer, duration);
    } else {
      this.stateTimer = duration;
      this.transitionTo(EnemyState.STUNNED);
    }
  }

  private setupStates(): void {
    // 1. IDLE STATE
    this.statesMap.set(EnemyState.IDLE, {
      enter: (ai) => {
        ai.physics.setVelocity(0, 0);
        ai.setTint(ai.originalTint);
      },
      update: (ai, time, delta) => {
        if (!ai.playerEntity.active) return;
        const dist = Phaser.Math.Distance.Between(ai.owner.x, ai.owner.y, ai.playerEntity.x, ai.playerEntity.y);
        if (dist < ai.detectRange) {
          ai.transitionTo(EnemyState.DETECT);
        }
      },
      exit: () => {}
    });

    // 1.1 PATROL STATE
    this.statesMap.set(EnemyState.PATROL, {
      enter: (ai) => {
        ai.setTint(ai.originalTint);
        ai.patrolWaitTimer = Phaser.Math.Between(1000, 2500); // Wait 1-2.5s before moving
        
        // Update patrol origin to current position so they roam freely
        ai.patrolOriginX = ai.owner.x;
        ai.patrolOriginY = ai.owner.y;

        // Pick random point in radius that is actually reachable and not stuck on a wall
        let validPoint = false;
        let attempts = 0;
        while (!validPoint && attempts < 10) {
          const angle = Math.random() * Math.PI * 2;
          const radius = 50 + Math.random() * (ai.patrolRadius - 50); // At least 50px away
          const tx = Phaser.Math.Clamp(ai.patrolOriginX + Math.cos(angle) * radius, 60, 964);
          const ty = Phaser.Math.Clamp(ai.patrolOriginY + Math.sin(angle) * radius, 60, 516);
          
          if (Phaser.Math.Distance.Between(ai.owner.x, ai.owner.y, tx, ty) > 30) {
            ai.patrolTargetX = tx;
            ai.patrolTargetY = ty;
            validPoint = true;
          }
          attempts++;
        }
        if (!validPoint) {
          // Failsafe: move towards center of arena
          ai.patrolTargetX = 512;
          ai.patrolTargetY = 288;
        }
        
        ai.stateTimer = 5000; // max 5 seconds of walking
      },
      update: (ai, time, delta) => {
        if (ai.playerEntity.active) {
          const distToPlayer = Phaser.Math.Distance.Between(ai.owner.x, ai.owner.y, ai.playerEntity.x, ai.playerEntity.y);
          if (distToPlayer < ai.detectRange) {
            ai.transitionTo(EnemyState.DETECT);
            return;
          }
        }

        if (ai.patrolWaitTimer > 0) {
          ai.patrolWaitTimer -= delta;
          ai.physics.setVelocity(0, 0);
          return;
        }
        
        ai.stateTimer -= delta;

        const dx = ai.patrolTargetX - ai.owner.x;
        const dy = ai.patrolTargetY - ai.owner.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 10 || ai.stateTimer <= 0) {
          ai.transitionTo(EnemyState.PATROL); // Re-enter to pick new point
          return;
        }

        // Move to target at 70% speed
        const speed = ai.physics.speed * 0.7;
        ai.physics.setVelocity((dx / dist) * speed, (dy / dist) * speed);
        ai.facePlayer(dx, dy); // Face movement direction
      },
      exit: () => {}
    });

    // 1.2 INVESTIGATE STATE
    this.statesMap.set(EnemyState.INVESTIGATE, {
      enter: (ai) => {
        ai.patrolTargetX = ai.lastKnownPlayerX;
        ai.patrolTargetY = ai.lastKnownPlayerY;
        ai.stateTimer = 6000; // max 6 seconds
      },
      update: (ai, time, delta) => {
        if (ai.playerEntity.active) {
          const distToPlayer = Phaser.Math.Distance.Between(ai.owner.x, ai.owner.y, ai.playerEntity.x, ai.playerEntity.y);
          if (distToPlayer < ai.detectRange) {
            ai.transitionTo(EnemyState.DETECT);
            return;
          }
        }

        ai.stateTimer -= delta;

        const dx = ai.patrolTargetX - ai.owner.x;
        const dy = ai.patrolTargetY - ai.owner.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 10 || ai.stateTimer <= 0) {
          ai.transitionTo(EnemyState.PATROL);
          return;
        }

        // Move to target at 70% speed
        const speed = ai.physics.speed * 0.7;
        ai.physics.setVelocity((dx / dist) * speed, (dy / dist) * speed);
        ai.facePlayer(dx, dy);
      },
      exit: () => {}
    });

    // 2. DETECT STATE
    this.statesMap.set(EnemyState.DETECT, {
      enter: (ai) => {
        ai.physics.setVelocity(0, 0);
        ai.setTint(0xffea00); // Yellow flash indicator
        ai.stateTimer = 350; // brief notice delay
        
        // Spawn small exclamation effect above enemy
        if (ai.owner.gameObject) {
          const scene = ai.owner.gameObject.scene;
          const exText = scene.add.text(ai.owner.x, ai.owner.y - 30, '!', {
            fontFamily: '"Space Grotesk", sans-serif',
            fontSize: '24px',
            color: '#ffea00',
            fontStyle: 'bold'
          }).setOrigin(0.5);
          scene.tweens.add({
            targets: exText,
            y: ai.owner.y - 50,
            alpha: 0,
            duration: 350,
            onComplete: () => exText.destroy()
          });
        }
      },
      update: (ai, time, delta) => {
        ai.stateTimer -= delta;
        if (ai.stateTimer <= 0) {
          ai.transitionTo(EnemyState.APPROACH);
        }
      },
      exit: (ai) => {
        ai.setTint(ai.originalTint);
      }
    });

    // 3. APPROACH STATE
    this.statesMap.set(EnemyState.APPROACH, {
      enter: () => {},
      update: (ai, time, delta) => {
        if (!ai.playerEntity.active) {
          ai.transitionTo(EnemyState.PATROL);
          return;
        }

        const dx = ai.playerEntity.x - ai.owner.x;
        const dy = ai.playerEntity.y - ai.owner.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > ai.detectRange * 1.5) {
          ai.lastKnownPlayerX = ai.playerEntity.x;
          ai.lastKnownPlayerY = ai.playerEntity.y;
          ai.transitionTo(EnemyState.INVESTIGATE);
          return;
        }

        // Face the player
        ai.facePlayer(dx, dy);

        if (dist <= ai.attackRange) {
          // Attempt to grab an attack token
          const hasToken = CombatDirector.getInstance().requestAttackToken(ai.owner.id);
          if (hasToken) {
            ai.transitionTo(EnemyState.WINDUP);
          } else {
            // Cannot attack immediately, strafe and wait
            ai.transitionTo(EnemyState.STRAFE);
          }
        } else {
          // Move towards player
          const speed = ai.physics.speed;
          ai.physics.setVelocity((dx / dist) * speed, (dy / dist) * speed);
        }
      },
      exit: () => {}
    });

    // 4. STRAFE STATE
    this.statesMap.set(EnemyState.STRAFE, {
      enter: (ai) => {
        ai.stateTimer = Phaser.Math.Between(1500, 3000);
        // Flip strafe direction randomly
        ai.strafeDir = Math.random() < 0.5 ? 1 : -1;
      },
      update: (ai, time, delta) => {
        if (!ai.playerEntity.active) {
          ai.transitionTo(EnemyState.PATROL);
          return;
        }

        ai.stateTimer -= delta;

        const dx = ai.playerEntity.x - ai.owner.x;
        const dy = ai.playerEntity.y - ai.owner.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > ai.detectRange * 1.5) {
          ai.lastKnownPlayerX = ai.playerEntity.x;
          ai.lastKnownPlayerY = ai.playerEntity.y;
          ai.transitionTo(EnemyState.INVESTIGATE);
          return;
        }

        ai.facePlayer(dx, dy);

        // Request token during strafe occasionally
        if (dist <= ai.attackRange + 30) {
          const hasToken = CombatDirector.getInstance().requestAttackToken(ai.owner.id);
          if (hasToken) {
            ai.transitionTo(EnemyState.WINDUP);
            return;
          }
        }

        // Circular movement around target
        if (dist > 0) {
          const radialX = dx / dist;
          const radialY = dy / dist;
          
          // Tangent vector
          const tanX = -radialY * ai.strafeDir;
          const tanY = radialX * ai.strafeDir;

          // Stay inside preferred bounds
          let approachWeight = 0;
          if (dist > ai.targetRangeMax) approachWeight = 0.4;
          if (dist < ai.targetRangeMin) approachWeight = -0.4;

          const moveX = tanX + radialX * approachWeight;
          const moveY = tanY + radialY * approachWeight;
          const len = Math.sqrt(moveX * moveX + moveY * moveY);

          const finalSpeed = ai.physics.speed * 0.75; // Slower when circling
          if (len > 0) {
            ai.physics.setVelocity((moveX / len) * finalSpeed, (moveY / len) * finalSpeed);
          }
        }

        // Return to approach or retreat
        if (ai.stateTimer <= 0) {
          ai.transitionTo(EnemyState.APPROACH);
        }
      },
      exit: () => {}
    });

    // 5. WINDUP STATE
    this.statesMap.set(EnemyState.WINDUP, {
      enter: (ai) => {
        ai.physics.setVelocity(0, 0);
        ai.stateTimer = ai.owner.id.includes('heavy') ? 700 : 450;
      },
      update: (ai, time, delta) => {
        ai.stateTimer -= delta;

        // Flash brighter red visual warning
        const flash = Math.floor(time / 60) % 2 === 0;
        ai.setTint(flash ? 0xff3333 : 0xff9999);

        // Face player during windup
        const dx = ai.playerEntity.x - ai.owner.x;
        const dy = ai.playerEntity.y - ai.owner.y;
        ai.facePlayer(dx, dy);

        if (ai.stateTimer <= 0) {
          ai.transitionTo(EnemyState.ATTACK);
        }
      },
      exit: (ai) => {
        ai.setTint(ai.originalTint);
      }
    });

    // 6. ATTACK STATE
    this.statesMap.set(EnemyState.ATTACK, {
      enter: (ai) => {
        ai.stateTimer = ai.owner.id.includes('heavy') ? 300 : 200;

        // Leap/dash attack towards player target
        const dx = ai.playerEntity.x - ai.owner.x;
        const dy = ai.playerEntity.y - ai.owner.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > 0) {
          const dashSpeed = ai.physics.speed * (ai.owner.id.includes('heavy') ? 2.5 : 3.0);
          ai.physics.setVelocity((dx / dist) * dashSpeed, (dy / dist) * dashSpeed);
        }
      },
      update: (ai, time, delta) => {
        ai.stateTimer -= delta;

        // Trail / visual aura
        ai.setTint(0xff5500);

        if (ai.stateTimer <= 0) {
          ai.transitionTo(EnemyState.RECOVERY);
        }
      },
      exit: (ai) => {
        ai.setTint(ai.originalTint);
      }
    });

    // 7. RECOVERY STATE
    this.statesMap.set(EnemyState.RECOVERY, {
      enter: (ai) => {
        ai.physics.setVelocity(0, 0);
        ai.stateTimer = ai.owner.id.includes('heavy') ? 800 : 400;
        // Release token early to keep flow dynamic
        CombatDirector.getInstance().releaseAttackToken(ai.owner.id);
      },
      update: (ai, time, delta) => {
        ai.stateTimer -= delta;
        ai.setTint(0x777777); // Dull grey recovering

        if (ai.stateTimer <= 0) {
          ai.transitionTo(EnemyState.RETREAT);
        }
      },
      exit: (ai) => {
        ai.setTint(ai.originalTint);
      }
    });

    // 8. RETREAT STATE
    this.statesMap.set(EnemyState.RETREAT, {
      enter: (ai) => {
        ai.stateTimer = Phaser.Math.Between(800, 1500);
      },
      update: (ai, time, delta) => {
        if (!ai.playerEntity.active) {
          ai.transitionTo(EnemyState.PATROL);
          return;
        }

        ai.stateTimer -= delta;

        const dx = ai.playerEntity.x - ai.owner.x;
        const dy = ai.playerEntity.y - ai.owner.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist > ai.detectRange * 1.5) {
          ai.lastKnownPlayerX = ai.playerEntity.x;
          ai.lastKnownPlayerY = ai.playerEntity.y;
          ai.transitionTo(EnemyState.INVESTIGATE);
          return;
        }


        ai.facePlayer(dx, dy);

        // Move directly away from player
        if (dist > 0) {
          const backSpeed = ai.physics.speed * 0.95;
          ai.physics.setVelocity(-(dx / dist) * backSpeed, -(dy / dist) * backSpeed);
        }

        if (ai.stateTimer <= 0 || dist > ai.detectRange * 0.8) {
          ai.transitionTo(EnemyState.STRAFE);
        }
      },
      exit: () => {}
    });

    // 9. STUNNED STATE
    this.statesMap.set(EnemyState.STUNNED, {
      enter: (ai) => {
        // Stop current attack tokens if holding
        CombatDirector.getInstance().releaseAttackToken(ai.owner.id);
      },
      update: (ai, time, delta) => {
        ai.stateTimer -= delta;
        
        // Flashing white effect
        const flash = Math.floor(time / 40) % 2 === 0;
        ai.setTint(flash ? 0xffffff : 0xcc3333);

        if (ai.stateTimer <= 0) {
          ai.transitionTo(EnemyState.APPROACH);
        }
      },
      exit: (ai) => {
        ai.setTint(ai.originalTint);
      }
    });

    // 10. DEAD STATE
    this.statesMap.set(EnemyState.DEAD, {
      enter: (ai) => {
        ai.physics.setVelocity(0, 0);
        CombatDirector.getInstance().releaseAttackToken(ai.owner.id);
        
        // Play clean fadeout tween and disable collision
        if (ai.owner.gameObject) {
          const sprite = ai.owner.gameObject as Phaser.GameObjects.Sprite;
          sprite.scene.tweens.add({
            targets: sprite,
            alpha: 0,
            scale: 0.1,
            duration: 350,
            onComplete: () => {
              ai.owner.destroy();
            }
          });
        }
      },
      update: () => {},
      exit: () => {}
    });
  }

  public facePlayer(dx: number, dy: number): void {
    if (this.owner.gameObject && 'rotation' in this.owner.gameObject) {
      (this.owner.gameObject as any).rotation = Math.atan2(dy, dx);
    }
  }

  public setTint(color: number): void {
    if (this.owner.gameObject && 'setTint' in this.owner.gameObject) {
      (this.owner.gameObject as any).setTint(color);
    }
  }

  public destroy(): void {
    super.destroy();
    CombatDirector.getInstance().releaseAttackToken(this.owner.id);
    this.statesMap.clear();
  }
}
