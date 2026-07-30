import { HealthComponent } from './HealthComponent.js';
import { BaseEntity } from './BaseEntity.js';
import { BossEntity } from './BossEntity.js';
import { EventBus } from '../core/EventBus.js';
import { EventTopic } from '../core/Constants.js';

export class BossHealthComponent extends HealthComponent {
  private bossEntity: BossEntity;

  constructor(owner: BaseEntity, maxHp: number, bossEntity: BossEntity) {
    super(owner, maxHp);
    this.bossEntity = bossEntity;
  }

  public takeDamage(amount: number): boolean {
    if ('shieldActive' in this.bossEntity && (this.bossEntity as any).shieldActive) {
      (this.bossEntity as any).damageShield(amount);
      return false;
    }

    if (this.bossEntity.isInvulnerableState() || this.getHp() <= 0) {
      return false;
    }

    const previousHp = this.getHp();
    const success = super.takeDamage(amount);
    
    if (success) {
      const currentHp = this.getHp();
      EventBus.getInstance().emit(EventTopic.BOSS_DAMAGED, {
        bossId: this.owner.id,
        damage: amount,
        currentHp: currentHp,
        maxHp: this.getMaxHp()
      });

      this.bossEntity.onDamaged(amount, currentHp, this.getMaxHp());
    }

    return success;
  }

  protected die(): void {
    // Override standard immediate death behavior
    // Let the BossEntity transition to its DEFEATED state first
    this.bossEntity.onDefeated();
  }
}
