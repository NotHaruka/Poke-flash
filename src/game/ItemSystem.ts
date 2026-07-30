import { Item, Rarity } from '../types';

// ─────────────────────────────────────────────────────────────
// Item Definitions
// Note: `effect` is currently unused by GameEngine — on-hit
// passive logic is applied directly by id-string lookups in
// GameEngine.applyPlayerOnHitPassives(). It's kept here to
// satisfy the Item type and as a hook for future refactoring.
// ─────────────────────────────────────────────────────────────

const noEffect: Item['effect'] = () => {};

export const ITEMS: Item[] = [
  {
    id: 'seed',
    name: 'Leeching Seed',
    description: 'Heal 1.5 HP per stack whenever you hit an enemy.',
    rarity: 'common',
    icon: 'Sprout',
    color: '#22c55e',
    meshColor: 0x22c55e,
    meshShape: 'sphere',
    effect: noEffect
  },
  {
    id: 'missile',
    name: 'AtG Missile Mk. 1',
    description: '10% chance on hit to fire a seeking missile for 300% damage per stack.',
    rarity: 'common',
    icon: 'Rocket',
    color: '#3b82f6',
    meshColor: 0x3b82f6,
    meshShape: 'cone',
    effect: noEffect
  },
  {
    id: 'scythe',
    name: "Harvester's Scythe",
    description: 'Critical strikes heal 8 HP per stack.',
    rarity: 'uncommon',
    icon: 'Slice',
    color: '#f43f5e',
    meshColor: 0xf43f5e,
    meshShape: 'octahedron',
    effect: noEffect
  },
  {
    id: 'ukulele',
    name: 'Ukulele',
    description: '20% chance on hit to chain lightning to nearby enemies for 80% damage.',
    rarity: 'rare',
    icon: 'Zap',
    color: '#60a5fa',
    meshColor: 0x60a5fa,
    meshShape: 'torus',
    effect: noEffect
  },
  {
    id: 'behemoth',
    name: 'Brilliant Behemoth',
    description: 'Hits explode, dealing 60% damage in a 5m radius per stack.',
    rarity: 'rare',
    icon: 'Flame',
    color: '#d97706',
    meshColor: 0xd97706,
    meshShape: 'box',
    effect: noEffect
  },
  {
    id: 'knurl',
    name: 'Titanic Knurl',
    description: 'Dropped by stage bosses. Grants a permanent boost to max HP and armor.',
    rarity: 'boss',
    icon: 'Mountain',
    color: '#a855f7',
    meshColor: 0xa855f7,
    meshShape: 'octahedron',
    effect: noEffect
  }
];

export function getItemById(id: string): Item | undefined {
  return ITEMS.find(item => item.id === id);
}

// Roll a random item based on a rarity-weighted chance table,
// e.g. { common: 0.8, uncommon: 0.2, rare: 0, boss: 0 }
export function rollLoot(rarityChance: Record<Rarity, number>): Item {
  const roll = Math.random();
  let cumulative = 0;

  const order: Rarity[] = ['boss', 'rare', 'uncommon', 'common'];
  for (const rarity of order) {
    cumulative += rarityChance[rarity] ?? 0;
    if (roll <= cumulative) {
      const pool = ITEMS.filter(item => item.rarity === rarity);
      if (pool.length > 0) {
        return pool[Math.floor(Math.random() * pool.length)];
      }
    }
  }

  // Fallback: any common item, or the first item if none are common
  const commonPool = ITEMS.filter(item => item.rarity === 'common');
  return commonPool.length > 0
    ? commonPool[Math.floor(Math.random() * commonPool.length)]
    : ITEMS[0];
}