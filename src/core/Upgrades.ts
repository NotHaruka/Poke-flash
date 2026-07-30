import { Modifier } from '../entities/components/ModifierComponent.js';

export enum UpgradeRarity {
  COMMON = 'COMMON',
  RARE = 'RARE',
  EPIC = 'EPIC',
  LEGENDARY = 'LEGENDARY',
  MYTHICAL = 'MYTHICAL'
}

export interface UpgradeRarityConfig {
  name: string;
  color: string;
  glowColor: string;
  weight: number; // Base generation weight
}

export const RARITY_CONFIGS: Record<UpgradeRarity, UpgradeRarityConfig> = {
  [UpgradeRarity.COMMON]: {
    name: 'Common',
    color: '#94a3b8', // Slate grey
    glowColor: 'rgba(148, 163, 184, 0.2)',
    weight: 60
  },
  [UpgradeRarity.RARE]: {
    name: 'Rare',
    color: '#3b82f6', // Blue
    glowColor: 'rgba(59, 130, 246, 0.2)',
    weight: 30
  },
  [UpgradeRarity.EPIC]: {
    name: 'Epic',
    color: '#a855f7', // Purple
    glowColor: 'rgba(168, 85, 247, 0.2)',
    weight: 8
  },
  [UpgradeRarity.LEGENDARY]: {
    name: 'Legendary',
    color: '#eab308', // Gold
    glowColor: 'rgba(234, 179, 8, 0.2)',
    weight: 2
  },
  [UpgradeRarity.MYTHICAL]: {
    name: 'Mythical',
    color: '#ec4899', // Pink/Magenta
    glowColor: 'rgba(236, 72, 153, 0.2)',
    weight: 0.5 // Extremely rare
  }
};

export interface UpgradeDefinition {
  id: string;
  name: string;
  description: string;
  rarity: UpgradeRarity;
  category: 'offensive' | 'defensive' | 'utility' | 'legendary' | 'mythical';
  stat?: string;
  modType?: 'add' | 'multiply';
  value?: number;
  maxTier?: number;
}

export const ALL_UPGRADES: UpgradeDefinition[] = [
  {
    id: 'astral_arsenal',
    name: 'Astral Arsenal',
    description: 'The blade no longer obeys your hand. It obeys your will. (Replaces manual attack)',
    rarity: UpgradeRarity.MYTHICAL,
    category: 'mythical'
  },
  // --- OFFENSIVE ---
  {
    id: 'atk_speed_1',
    name: 'Quick Reflexes',
    description: 'Increases swing velocity and reduces recovery lag by 15%',
    rarity: UpgradeRarity.COMMON,
    category: 'offensive',
    stat: 'attackSpeed',
    modType: 'multiply',
    value: 1.15
  },
  {
    id: 'atk_speed_2',
    name: 'Furious Zephyr',
    description: 'Increases swing velocity and reduces recovery lag by 30%',
    rarity: UpgradeRarity.RARE,
    category: 'offensive',
    stat: 'attackSpeed',
    modType: 'multiply',
    value: 1.30
  },
  {
    id: 'atk_speed_3',
    name: 'Blade Master Tempests',
    description: 'Reduces recovery lag and boosts swing velocity by a massive 50%',
    rarity: UpgradeRarity.EPIC,
    category: 'offensive',
    stat: 'attackSpeed',
    modType: 'multiply',
    value: 1.50
  },
  {
    id: 'damage_1',
    name: 'Serrated Edges',
    description: 'Increases blade slash damage by +5',
    rarity: UpgradeRarity.COMMON,
    category: 'offensive',
    stat: 'damage',
    modType: 'add',
    value: 5
  },
  {
    id: 'damage_2',
    name: 'Warpig Edge',
    description: 'Increases blade slash damage by +12',
    rarity: UpgradeRarity.RARE,
    category: 'offensive',
    stat: 'damage',
    modType: 'add',
    value: 12
  },
  {
    id: 'damage_3',
    name: 'Gladiator Executioner',
    description: 'Increases blade slash damage by +25',
    rarity: UpgradeRarity.EPIC,
    category: 'offensive',
    stat: 'damage',
    modType: 'add',
    value: 25
  },
  {
    id: 'crit_chance_1',
    name: 'Focus Point',
    description: 'Increases Critical Hit rate by +8%',
    rarity: UpgradeRarity.COMMON,
    category: 'offensive',
    stat: 'critChance',
    modType: 'add',
    value: 0.08
  },
  {
    id: 'crit_chance_2',
    name: 'Flawless Eye',
    description: 'Increases Critical Hit rate by +15%',
    rarity: UpgradeRarity.RARE,
    category: 'offensive',
    stat: 'critChance',
    modType: 'add',
    value: 0.15
  },
  {
    id: 'crit_chance_3',
    name: 'Assassin Creed',
    description: 'Increases Critical Hit rate by +25%',
    rarity: UpgradeRarity.EPIC,
    category: 'offensive',
    stat: 'critChance',
    modType: 'add',
    value: 0.25
  },
  {
    id: 'crit_damage_1',
    name: 'Heavy Strikes',
    description: 'Increases critical strike damage scaling by +20%',
    rarity: UpgradeRarity.COMMON,
    category: 'offensive',
    stat: 'critDamage',
    modType: 'add',
    value: 0.20
  },
  {
    id: 'crit_damage_2',
    name: 'Vicious Precision',
    description: 'Increases critical strike damage scaling by +45%',
    rarity: UpgradeRarity.RARE,
    category: 'offensive',
    stat: 'critDamage',
    modType: 'add',
    value: 0.45
  },
  {
    id: 'reach_1',
    name: 'Long Blade extend',
    description: 'Increases the reach of your blade by 10 pixels',
    rarity: UpgradeRarity.COMMON,
    category: 'offensive',
    stat: 'length',
    modType: 'add',
    value: 10
  },
  {
    id: 'reach_2',
    name: 'Colosseum Spearhead',
    description: 'Increases the reach of your blade by 22 pixels',
    rarity: UpgradeRarity.RARE,
    category: 'offensive',
    stat: 'length',
    modType: 'add',
    value: 22
  },

  // --- DEFENSIVE ---
  {
    id: 'max_hp_1',
    name: 'Hardy Blood',
    description: 'Increases Max Health by +1 Heart and heals 1 Heart',
    rarity: UpgradeRarity.COMMON,
    category: 'defensive',
    stat: 'maxHp',
    modType: 'add',
    value: 1
  },
  {
    id: 'max_hp_2',
    name: 'Colossus Girdle',
    description: 'Increases Max Health by +2 Hearts and heals 2 Hearts',
    rarity: UpgradeRarity.RARE,
    category: 'defensive',
    stat: 'maxHp',
    modType: 'add',
    value: 2
  },
  {
    id: 'armor_1',
    name: 'Iron Plating',
    description: 'Reduces all incoming damage by 15% (min of 1 damage taken)',
    rarity: UpgradeRarity.COMMON,
    category: 'defensive',
    stat: 'armor',
    modType: 'multiply',
    value: 0.85,
    maxTier: 1
  },
  {
    id: 'armor_2',
    name: 'Dragon Scales',
    description: 'Reduces all incoming damage by 30% (min of 1 damage taken)',
    rarity: UpgradeRarity.RARE,
    category: 'defensive',
    stat: 'armor',
    modType: 'multiply',
    value: 0.70
  },
  {
    id: 'dodge_cooldown_1',
    name: 'Light Feet',
    description: 'Reduces dodge roll cooldown by 20%',
    rarity: UpgradeRarity.COMMON,
    category: 'defensive',
    stat: 'dodgeCooldown',
    modType: 'multiply',
    value: 0.80
  },
  {
    id: 'dodge_cooldown_2',
    name: 'Ninja Dash',
    description: 'Reduces dodge roll cooldown by 40%',
    rarity: UpgradeRarity.RARE,
    category: 'defensive',
    stat: 'dodgeCooldown',
    modType: 'multiply',
    value: 0.60
  },

  // --- UTILITY ---
  {
    id: 'speed_1',
    name: 'Runner Impulse',
    description: 'Increases gladiator base movement speed by 10%',
    rarity: UpgradeRarity.COMMON,
    category: 'utility',
    stat: 'speed',
    modType: 'multiply',
    value: 1.10
  },
  {
    id: 'speed_2',
    name: 'Mercury Anklets',
    description: 'Increases gladiator base movement speed by 20%',
    rarity: UpgradeRarity.RARE,
    category: 'utility',
    stat: 'speed',
    modType: 'multiply',
    value: 1.20
  },
  {
    id: 'gold_gain_1',
    name: 'Greed Signet',
    description: 'Increases all Gold Coins earned by +25%',
    rarity: UpgradeRarity.COMMON,
    category: 'utility',
    stat: 'goldGain',
    modType: 'multiply',
    value: 1.25
  },
  {
    id: 'xp_gain_1',
    name: 'Wisdom Scroll',
    description: 'Increases experience gain by +25%',
    rarity: UpgradeRarity.COMMON,
    category: 'utility',
    stat: 'xpGain',
    modType: 'multiply',
    value: 1.25
  },
  {
    id: 'magnet_1',
    name: 'Magnetic Attraction',
    description: 'Increases coin and orb attraction radius by +60 pixels',
    rarity: UpgradeRarity.COMMON,
    category: 'utility',
    stat: 'pickupRadius',
    modType: 'add',
    value: 60
  },
  {
    id: 'magnet_2',
    name: 'Singularity Core',
    description: 'Increases coin and orb attraction radius by +140 pixels',
    rarity: UpgradeRarity.RARE,
    category: 'utility',
    stat: 'pickupRadius',
    modType: 'add',
    value: 140
  },
  {
    id: 'luck_1',
    name: 'Lucky Clover',
    description: 'Increases your Luck by +25% (Better rolls, higher crits)',
    rarity: UpgradeRarity.COMMON,
    category: 'utility',
    stat: 'luck',
    modType: 'add',
    value: 0.25
  },
  {
    id: 'luck_2',
    name: 'Fortuna Blessing',
    description: 'Increases your Luck by +50% (Sizable upgrade/crit rates boost)',
    rarity: UpgradeRarity.RARE,
    category: 'utility',
    stat: 'luck',
    modType: 'add',
    value: 0.50
  },
  {
    id: 'wave_heal_1',
    name: 'Slayer Suture',
    description: 'Heals +1 Heart after clearing every wave',
    rarity: UpgradeRarity.COMMON,
    category: 'utility',
    stat: 'vamp', // Reused for wave healing / life-steal tracking
    modType: 'add',
    value: 1
  },

  // --- LEGENDARY (Run-Defining) ---
  {
    id: 'dual_wield',
    name: 'Dual Wield Mirage',
    description: 'Slashes summon a ghost phantom blade sweeping in the opposite direction for 70% damage',
    rarity: UpgradeRarity.LEGENDARY,
    category: 'legendary'
  },
  {
    id: 'boomerang_blade',
    name: 'Boomerang Gale',
    description: 'Blade sweeps launch a spinning spectral sword projectile that returns to you, slicing enemies',
    rarity: UpgradeRarity.LEGENDARY,
    category: 'legendary'
  },
  {
    id: 'explosive_crits',
    name: 'Supernova Crits',
    description: 'Critical hits trigger a massive fire blast dealing 35 area damage to all surrounding enemies',
    rarity: UpgradeRarity.EPIC,
    category: 'legendary'
  },
  {
    id: 'chain_lightning',
    name: 'Stormcaller Slashes',
    description: 'Slashes have a 30% chance to summon a chain lightning bolt striking up to 3 nearby foes',
    rarity: UpgradeRarity.LEGENDARY,
    category: 'legendary'
  },
  {
    id: 'vampiric_blade',
    name: 'Sanguine Thirst',
    description: 'Enemies have a 12% chance to drop a healing droplet on death that restores 1 Heart',
    rarity: UpgradeRarity.RARE,
    category: 'legendary'
  },
  {
    id: 'time_slow_dodge',
    name: 'Chronos Dash',
    description: 'Executing a dodge roll slows down time and enemies by 60% for 1.5 seconds',
    rarity: UpgradeRarity.LEGENDARY,
    category: 'legendary'
  },
  {
    id: 'summon_companion',
    name: 'Starbound Sentinel',
    description: 'Summon a floating companion star that fires energy bullets at the nearest enemy',
    rarity: UpgradeRarity.RARE,
    category: 'legendary'
  },
  {
    id: 'ghost_dash',
    name: 'Ethereal Ghost Dash',
    description: 'Dodge rolls make you completely intangible, passing through and dealing 30 damage to enemies',
    rarity: UpgradeRarity.LEGENDARY,
    category: 'legendary'
  },
  {
    id: 'blood_moon_frenzy',
    name: 'Blood Moon Frenzy',
    description: 'Taking damage grants +10% swing velocity and +5% movement speed for 6 seconds. Stacks up to 5 times.',
    rarity: UpgradeRarity.COMMON,
    category: 'legendary'
  },
  {
    id: 'tempest_momentum',
    name: 'Tempest Momentum',
    description: 'The faster your weapon moves, the larger its hitbox becomes (Maximum: +40% blade length, +30% width).',
    rarity: UpgradeRarity.COMMON,
    category: 'legendary'
  },
  {
    id: 'blade_cyclone',
    name: 'Blade Cyclone',
    description: 'Every 8 successful hits unleash a spinning blade around the player for 3 seconds.',
    rarity: UpgradeRarity.RARE,
    category: 'legendary'
  },
  {
    id: 'frozen_edge',
    name: 'Frozen Edge',
    description: 'Critical hits have a 25% chance to freeze enemies for 1.5 seconds (Bosses: 20% slow instead).',
    rarity: UpgradeRarity.EPIC,
    category: 'legendary'
  },
  {
    id: 'infernal_momentum',
    name: 'Infernal Momentum',
    description: 'Weapon velocity ignites enemies. Higher swing velocity increases burn duration and DPS.',
    rarity: UpgradeRarity.EPIC,
    category: 'legendary'
  },
  {
    id: 'void_rift',
    name: 'Void Rift',
    description: 'Every 20 kills opens a miniature Void Rift for 5 seconds that pulls enemies inward and deals continuous damage.',
    rarity: UpgradeRarity.LEGENDARY,
    category: 'legendary'
  },
  {
    id: 'executioners_instinct',
    name: "Executioner's Instinct",
    description: 'Enemies below 20% HP take double damage. Bosses below 10% HP take +40% damage.',
    rarity: UpgradeRarity.COMMON,
    category: 'legendary'
  },
  {
    id: 'falcon_dive',
    name: 'Falcon Dive',
    description: 'Dodging through enemies causes your sword to dive through them from above. Works with Ghost Dash and Chronos Dash.',
    rarity: UpgradeRarity.RARE,
    category: 'legendary'
  },
  {
    id: 'meteor_slam',
    name: 'Meteor Slam',
    description: 'Heavy swings occasionally create a small meteor impact dealing AoE damage and knockback.',
    rarity: UpgradeRarity.EPIC,
    category: 'legendary'
  },
  {
    id: 'soul_collector',
    name: 'Soul Collector',
    description: 'Every enemy killed permanently grants +0.15% weapon velocity (Maximum: +30%).',
    rarity: UpgradeRarity.COMMON,
    category: 'legendary'
  }
];

/**
 * Weighted generation function to fetch 3 unique upgrades for level-ups.
 * Focuses exclusively on gameplay-changing abilities (categories: 'legendary' or 'mythical').
 * Takes the current player luck stat and the current wave for progression gating.
 */
export function generateUpgradeChoices(
  luckMultiplier: number,
  excludeIds: Set<string>,
  currentWave: number = 1
): UpgradeDefinition[] {
  const choices: UpgradeDefinition[] = [];
  
  // Level-ups focus exclusively on unique mechanics / gameplay-changing abilities (categories 'legendary' and 'mythical')
  const available = ALL_UPGRADES.filter(up => {
    if (excludeIds.has(up.id)) return false;
    if (up.category !== 'legendary' && up.category !== 'mythical') return false;

    // Apply progression gates:
    // Common: Always Available
    // Rare: Wave 3+
    // Epic: Wave 5+
    // Legendary: Wave 8+
    // Mythical: Wave 12+
    if (up.rarity === UpgradeRarity.RARE && currentWave < 3) return false;
    if (up.rarity === UpgradeRarity.EPIC && currentWave < 5) return false;
    if (up.rarity === UpgradeRarity.LEGENDARY && currentWave < 8) return false;
    if (up.rarity === UpgradeRarity.MYTHICAL && currentWave < 12) return false;

    return true;
  });

  if (available.length < 3) {
    // Fallback: if gates are too restrictive, relax them to ensure at least some choices are presented
    const fallbackAvailable = ALL_UPGRADES.filter(up => {
      if (excludeIds.has(up.id)) return false;
      return up.category === 'legendary' || up.category === 'mythical';
    });
    return fallbackAvailable.slice(0, 3);
  }

  // Adjust rarity weights using player luck
  const luckFactor = luckMultiplier - 1.0; // e.g., 0.25
  
  // Calculate relative weights
  const weights = {
    [UpgradeRarity.COMMON]: Math.max(10, RARITY_CONFIGS[UpgradeRarity.COMMON].weight - luckFactor * 50),
    [UpgradeRarity.RARE]: RARITY_CONFIGS[UpgradeRarity.RARE].weight + luckFactor * 25,
    [UpgradeRarity.EPIC]: RARITY_CONFIGS[UpgradeRarity.EPIC].weight + luckFactor * 15,
    [UpgradeRarity.LEGENDARY]: RARITY_CONFIGS[UpgradeRarity.LEGENDARY].weight + luckFactor * 10,
    [UpgradeRarity.MYTHICAL]: RARITY_CONFIGS[UpgradeRarity.MYTHICAL].weight + luckFactor * 5
  };

  // Pull three unique random upgrades
  const candidates = [...available];

  while (choices.length < 3 && candidates.length > 0) {
    // 1. Roll a target rarity
    const totalWeight = weights[UpgradeRarity.COMMON] + weights[UpgradeRarity.RARE] + weights[UpgradeRarity.EPIC] + weights[UpgradeRarity.LEGENDARY] + weights[UpgradeRarity.MYTHICAL];
    let roll = Math.random() * totalWeight;

    let targetRarity = UpgradeRarity.COMMON;
    if (roll < weights[UpgradeRarity.MYTHICAL]) {
      targetRarity = UpgradeRarity.MYTHICAL;
    } else if (roll < weights[UpgradeRarity.MYTHICAL] + weights[UpgradeRarity.LEGENDARY]) {
      targetRarity = UpgradeRarity.LEGENDARY;
    } else if (roll < weights[UpgradeRarity.MYTHICAL] + weights[UpgradeRarity.LEGENDARY] + weights[UpgradeRarity.EPIC]) {
      targetRarity = UpgradeRarity.EPIC;
    } else if (roll < weights[UpgradeRarity.MYTHICAL] + weights[UpgradeRarity.LEGENDARY] + weights[UpgradeRarity.EPIC] + weights[UpgradeRarity.RARE]) {
      targetRarity = UpgradeRarity.RARE;
    }

    // 2. Filter candidates matching rarity
    let matches = candidates.filter(c => c.rarity === targetRarity);
    if (matches.length === 0) {
      // Fallback: search closest matching rarity or any candidate
      matches = candidates;
    }

    // 3. Select a random upgrade from matching list
    const randomIndex = Math.floor(Math.random() * matches.length);
    const selected = matches[randomIndex];

    choices.push(selected);

    // Remove selected from candidate pool
    const indexInCandidates = candidates.findIndex(c => c.id === selected.id);
    if (indexInCandidates !== -1) {
      candidates.splice(indexInCandidates, 1);
    }
  }

  return choices;
}
