export type Rarity = 'common' | 'uncommon' | 'rare' | 'boss';

export interface Item {
  id: string;
  name: string;
  description: string;
  rarity: Rarity;
  icon: string; // Lucide icon name
  color: string; // Tailwind hex or color name
  meshColor: number; // Hex code for Three.js representation
  meshShape: 'box' | 'sphere' | 'cone' | 'torus' | 'octahedron';
  effect: (player: any, stackCount: number, eventType: string, eventData?: any) => void;
}

export interface PlayerStats {
  maxHp: number;
  hp: number;
  shield: number;
  maxShield: number;
  damage: number;
  attackSpeed: number; // multiplier, default 1.0
  moveSpeed: number; // base move speed
  critChance: number; // 0.0 to 1.0, base 0.05
  jumpCount: number; // default 1, can be increased by Hopoo Feather
  armor: number; // flat damage reduction
  hpRegen: number; // HP per second
}

export interface Ability {
  id: string;
  name: string;
  description: string;
  cooldown: number; // in seconds
  currentCooldown: number; // remaining cooldown in seconds
  charges?: number;
  maxCharges?: number;
}

export interface PlayerCharacter {
  id: string;
  name: string;
  description: string;
  unlocked: boolean;
  unlockCondition: string;
  stats: PlayerStats;
  abilities: {
    primary: Ability;
    secondary: Ability;
    utility: Ability;
    special: Ability;
  };
  meshColor: number;
}

export type EnemyType = 'melee' | 'ranged' | 'tank' | 'boss';

export interface EnemyStats {
  maxHp: number;
  hp: number;
  damage: number;
  speed: number;
  xpValue: number;
  goldValue: number;
}

export interface Stage {
  id: number;
  name: string;
  biome: 'forest' | 'ruins' | 'wasteland';
  groundColor: number;
  fogColor: number;
  skyColor: number;
  ambientLightColor: number;
  chargeTimeRequired: number; // in seconds
}

export interface RunStats {
  timeSurvived: number; // in seconds
  difficultyMultiplier: number;
  stageIndex: number;
  gold: number;
  xp: number;
  level: number;
  items: Record<string, number>; // item_id -> count
  kills: number;
  damageDealt: number;
  chestsOpened: number;
}

export interface GameUnlock {
  id: string;
  title: string;
  description: string;
  unlocked: boolean;
  type: 'character' | 'item';
  targetId: string;
}