import Phaser from 'phaser';
import { BaseComponent } from '../BaseComponent.js';
import { BaseEntity } from '../BaseEntity.js';
import { PhysicsComponent } from '../PhysicsComponent.js';
import { BossHealthComponent } from '../BossHealthComponent.js';
import { BossEntity } from '../BossEntity.js';
import { Logger } from '../../utils/Logger.js';

export enum BossState {
  IDLE = 'IDLE',
  INTRO = 'INTRO',
  CHASE = 'CHASE',
  POSITION = 'POSITION',
  ATTACK = 'ATTACK',
  SPECIAL_ATTACK = 'SPECIAL_ATTACK',
  SUMMON = 'SUMMON',
  STUNNED = 'STUNNED',
  PHASE_TRANSITION = 'PHASE_TRANSITION',
  ENRAGED = 'ENRAGED',
  DEFEATED = 'DEFEATED'
}

export interface IBossAIState {
  enter(comp: BossAIComponent): void;
  update(comp: BossAIComponent, time: number, delta: number): void;
  exit(comp: BossAIComponent): void;
}

export class BossAIComponent extends BaseComponent {
  private currentState: BossState = BossState.IDLE;
  private statesMap: Map<BossState, IBossAIState>;
  private logger: Logger;

  // Configuration parameters
  public detectRange: number = 9999; // Bosses always know where the player is
  public attackRange: number = 100;
  public specialAttackRange: number = 250;
  
  // Timers and State variables
  public stateTimer: number = 0;
  public attackCooldown: number = 0;
  public specialCooldown: number = 3000; // ms between special attacks
  public summonCooldown: number = 8000;  // ms between summons

  // Boss Posture / Stun Resistance and Stun Immunity Cooldowns
  public posture: number = 0;
  public maxPosture: number = 100;
  public stunImmunityCooldown: number = 0; // ms remaining before boss can be stunned again

  // References
  public playerEntity!: BaseEntity;
  public physics!: PhysicsComponent;
  public health!: BossHealthComponent;
  public bossEntity!: BossEntity;

  constructor(owner: BossEntity, player: BaseEntity) {
    super(owner);
    this.bossEntity = owner;
    this.playerEntity = player;
    this.logger = new Logger(`BossAIComponent::${owner.id}`);
    this.statesMap = new Map();
    this.setupStates();
  }

  public init(): void {
    const phys = this.owner.getComponent<PhysicsComponent>('physics');
    const hp = this.owner.getComponent<BossHealthComponent>('health');

    if (phys) this.physics = phys;
    if (hp) this.health = hp;

    this.transitionTo(BossState.IDLE);
  }

  public getCurrentState(): BossState {
    return this.currentState;
  }

  public transitionTo(newState: BossState): void {
    if (this.currentState === BossState.DEFEATED && newState !== BossState.DEFEATED) {
      return; // DEFEATED is terminal
    }

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

    this.logger.debug(`Transitioned to state: ${newState}`);
  }

  public update(time: number, delta: number): void {
    this.stateTimer += delta;
    
    if (this.attackCooldown > 0) {
      this.attackCooldown -= delta;
    }
    if (this.specialCooldown > 0) {
      this.specialCooldown -= delta;
    }
    if (this.summonCooldown > 0) {
      this.summonCooldown -= delta;
    }
    if (this.stunImmunityCooldown > 0) {
      this.stunImmunityCooldown -= delta;
    }

    const stateImpl = this.statesMap.get(this.currentState);
    if (stateImpl) {
      stateImpl.update(this, time, delta);
    }
  }

  /**
   * Safe posture/stun resistance handling method.
   * Prevents the player from easily stunlock-cheesing the boss.
   */
  public receiveHit(isCrit: boolean): void {
    if (
      this.currentState === BossState.STUNNED || 
      this.currentState === BossState.DEFEATED || 
      this.currentState === BossState.PHASE_TRANSITION
    ) {
      return;
    }

    if (this.stunImmunityCooldown > 0) {
      return; // Fully immune to stuns right now
    }

    // Skip receiving posture damage / stun if the boss is currently performing an attack
    const boss = this.bossEntity as any;
    const isAttacking = boss.isPerformingAttack || this.currentState === BossState.ATTACK || this.currentState === BossState.SPECIAL_ATTACK;
    if (isAttacking) {
      return;
    }

    // Accumulate posture damage based on hit quality.
    // Base posture damage is 15 for crits, 6 for normal hits.
    const damage = isCrit ? 15 : 6;
    this.posture += damage;

    if (this.posture >= this.maxPosture) {
      this.posture = 0;
      this.transitionTo(BossState.STUNNED);
      this.stunImmunityCooldown = 8000; // 8 seconds of absolute stun resistance
    }
  }

  // Register a custom state implementation (useful for specific bosses)
  public registerState(state: BossState, implementation: IBossAIState): void {
    this.statesMap.set(state, implementation);
  }

  protected setupStates(): void {
    this.registerState(BossState.IDLE, new IdleState());
    this.registerState(BossState.INTRO, new IntroState());
    this.registerState(BossState.CHASE, new ChaseState());
    this.registerState(BossState.POSITION, new PositionState());
    this.registerState(BossState.ATTACK, new AttackState());
    this.registerState(BossState.SPECIAL_ATTACK, new SpecialAttackState());
    this.registerState(BossState.SUMMON, new SummonState());
    this.registerState(BossState.STUNNED, new StunnedState());
    this.registerState(BossState.PHASE_TRANSITION, new PhaseTransitionState());
    this.registerState(BossState.ENRAGED, new EnragedState());
    this.registerState(BossState.DEFEATED, new DefeatedState());
  }
}

// ==========================================
// DEFAULT BOSS STATE IMPLEMENTATIONS
// ==========================================

class IdleState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    if (comp.physics) {
      comp.physics.targetVx = 0;
      comp.physics.targetVy = 0;
    }
  }
  update(comp: BossAIComponent): void {}
  exit(comp: BossAIComponent): void {}
}

class IntroState implements IBossAIState {
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

class ChaseState implements IBossAIState {
  enter(comp: BossAIComponent): void {}
  update(comp: BossAIComponent, time: number, delta: number): void {
    const player = comp.playerEntity;
    const boss = comp.bossEntity;
    
    if (!player || !player.active) return;

    const dist = Phaser.Math.Distance.Between(boss.x, boss.y, player.x, player.y);

    // If enrage/threshold trigger
    if (comp.health && comp.health.getHp() / comp.health.getMaxHp() <= 0.25 && !boss.isEnraged()) {
      comp.transitionTo(BossState.ENRAGED);
      return;
    }

    // Decide state transitions based on distance
    if (dist <= comp.attackRange && comp.attackCooldown <= 0) {
      comp.transitionTo(BossState.ATTACK);
      return;
    }

    if (dist <= comp.specialAttackRange && comp.specialCooldown <= 0) {
      comp.transitionTo(BossState.SPECIAL_ATTACK);
      return;
    }

    // Move towards player
    const angle = Phaser.Math.Angle.Between(boss.x, boss.y, player.x, player.y);
    const speed = comp.physics.speed;
    comp.physics.targetVx = Math.cos(angle) * speed;
    comp.physics.targetVy = Math.sin(angle) * speed;
  }
  exit(comp: BossAIComponent): void {}
}

class PositionState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    // Back away or move side-to-side briefly
    const player = comp.playerEntity;
    const boss = comp.bossEntity;
    const angle = Phaser.Math.Angle.Between(player.x, player.y, boss.x, boss.y) + (Math.random() > 0.5 ? Math.PI/2 : -Math.PI/2);
    comp.physics.targetVx = Math.cos(angle) * comp.physics.speed * 0.8;
    comp.physics.targetVy = Math.sin(angle) * comp.physics.speed * 0.8;
  }
  update(comp: BossAIComponent): void {
    if (comp.stateTimer > 800) {
      comp.transitionTo(BossState.CHASE);
    }
  }
  exit(comp: BossAIComponent): void {}
}

class AttackState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    comp.physics.targetVx = 0;
    comp.physics.targetVy = 0;
    comp.attackCooldown = 1500; // 1.5s basic attack cooldown
  }
  update(comp: BossAIComponent): void {
    if (comp.stateTimer > 500) {
      comp.transitionTo(BossState.POSITION);
    }
  }
  exit(comp: BossAIComponent): void {}
}

class SpecialAttackState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    comp.physics.targetVx = 0;
    comp.physics.targetVy = 0;
    comp.specialCooldown = 4000; // 4s special attack cooldown
  }
  update(comp: BossAIComponent): void {
    if (comp.stateTimer > 1000) {
      comp.transitionTo(BossState.CHASE);
    }
  }
  exit(comp: BossAIComponent): void {}
}

class SummonState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    comp.physics.targetVx = 0;
    comp.physics.targetVy = 0;
    comp.summonCooldown = 10000;
  }
  update(comp: BossAIComponent): void {
    if (comp.stateTimer > 800) {
      comp.transitionTo(BossState.CHASE);
    }
  }
  exit(comp: BossAIComponent): void {}
}

class StunnedState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    comp.physics.targetVx = 0;
    comp.physics.targetVy = 0;
    
    // flash gray-ish or yellow-ish
    if (comp.bossEntity.gameObject && 'setTint' in comp.bossEntity.gameObject) {
      (comp.bossEntity.gameObject as any).setTint(0xaaaaaa);
    }
  }
  update(comp: BossAIComponent): void {
    if (comp.stateTimer > 600) {
      comp.transitionTo(BossState.CHASE);
    }
  }
  exit(comp: BossAIComponent): void {
    if (comp.bossEntity.gameObject && 'setTint' in comp.bossEntity.gameObject) {
      (comp.bossEntity.gameObject as any).clearTint();
    }
  }
}

class PhaseTransitionState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    comp.bossEntity.setInvulnerable(true);
    comp.physics.targetVx = 0;
    comp.physics.targetVy = 0;
  }
  update(comp: BossAIComponent): void {
    // Phase transitions take, say, 2 seconds of cinematic flaring
    if (comp.stateTimer > 2000) {
      comp.transitionTo(BossState.CHASE);
    }
  }
  exit(comp: BossAIComponent): void {
    comp.bossEntity.setInvulnerable(false);
  }
}

class EnragedState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    // Increase speed and aggro parameters permanently
    comp.physics.speed *= 1.35;
    comp.attackCooldown = 0;
    comp.specialCooldown = 0;
  }
  update(comp: BossAIComponent): void {
    // Remain enraged, basically chase with high speed
    const player = comp.playerEntity;
    const boss = comp.bossEntity;
    if (!player || !player.active) return;

    const dist = Phaser.Math.Distance.Between(boss.x, boss.y, player.x, player.y);
    if (dist <= comp.attackRange && comp.attackCooldown <= 0) {
      comp.transitionTo(BossState.ATTACK);
      return;
    }

    const angle = Phaser.Math.Angle.Between(boss.x, boss.y, player.x, player.y);
    comp.physics.targetVx = Math.cos(angle) * comp.physics.speed;
    comp.physics.targetVy = Math.sin(angle) * comp.physics.speed;
  }
  exit(comp: BossAIComponent): void {}
}

class DefeatedState implements IBossAIState {
  enter(comp: BossAIComponent): void {
    comp.physics.targetVx = 0;
    comp.physics.targetVy = 0;
  }
  update(comp: BossAIComponent): void {}
  exit(comp: BossAIComponent): void {}
}
