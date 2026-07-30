import { BaseComponent } from '../BaseComponent.js';
import { BaseEntity } from '../BaseEntity.js';

export interface Modifier {
  id: string;
  stat: string; // e.g., 'speed', 'damage', 'maxHp', 'length', 'attackSpeed', 'critChance', 'critDamage', 'dodgeCooldown', 'goldGain', 'xpGain', 'pickupRadius', 'luck', 'armor', 'vamp'
  type: 'add' | 'multiply';
  value: number;
}

export class ModifierComponent extends BaseComponent {
  private modifiers: Map<string, Modifier[]> = new Map();
  private legendaryUpgrades: Set<string> = new Set();

  constructor(owner: BaseEntity) {
    super(owner);
  }

  public init(): void {
    this.modifiers.clear();
    this.legendaryUpgrades.clear();
  }

  public update(time: number, delta: number): void {}

  /**
   * Adds a stat modifier.
   */
  public addModifier(modifier: Modifier): void {
    if (!this.modifiers.has(modifier.stat)) {
      this.modifiers.set(modifier.stat, []);
    }
    this.modifiers.get(modifier.stat)!.push(modifier);
  }

  /**
   * Removes modifiers with a specific ID.
   */
  public removeModifier(id: string): void {
    for (const [stat, list] of this.modifiers.entries()) {
      this.modifiers.set(stat, list.filter(m => m.id !== id));
    }
  }

  /**
   * Checks if a modifier with a specific ID is active.
   */
  public hasModifier(id: string): boolean {
    for (const list of this.modifiers.values()) {
      if (list.some(m => m.id === id)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Calculates the final value of a stat given a base value.
   * Stacking formula: (Base + sum(Add_modifiers)) * product(Multiply_modifiers)
   */
  public getModifiedValue(stat: string, baseValue: number): number {
    const list = this.modifiers.get(stat);
    if (!list || list.length === 0) {
      return baseValue;
    }

    let addSum = 0;
    let multProduct = 1.0;

    for (const mod of list) {
      if (mod.type === 'add') {
        addSum += mod.value;
      } else if (mod.type === 'multiply') {
        multProduct *= mod.value;
      }
    }

    return (baseValue + addSum) * multProduct;
  }

  /**
   * Activate a legendary upgrade keyword.
   */
  public addLegendaryUpgrade(upgradeId: string): void {
    this.legendaryUpgrades.add(upgradeId);
  }

  /**
   * Checks if a legendary upgrade is active.
   */
  public hasLegendaryUpgrade(upgradeId: string): boolean {
    return this.legendaryUpgrades.has(upgradeId);
  }

  /**
   * Gets all active legendary upgrades.
   */
  public getLegendaryUpgrades(): string[] {
    return Array.from(this.legendaryUpgrades);
  }

  /**
   * Reset all modifiers and upgrades.
   */
  public clear(): void {
    this.modifiers.clear();
    this.legendaryUpgrades.clear();
  }
}
