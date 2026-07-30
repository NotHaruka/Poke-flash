import { PlayerCharacter } from '../types';

export const CHARACTERS: PlayerCharacter[] = [
  {
    id: 'commando',
    name: 'Commando',
    description: 'A versatile soldier equipped with dual pistols, a tactical roll, and high firing rate.',
    unlocked: true,
    unlockCondition: 'Default Character',
    meshColor: 0x3b82f6, // Blue
    stats: {
      maxHp: 110,
      hp: 110,
      shield: 0,
      maxShield: 0,
      damage: 12,
      attackSpeed: 1.0,
      moveSpeed: 8.5,
      critChance: 0.05,
      jumpCount: 1,
      armor: 0,
      hpRegen: 1.0
    },
    abilities: {
      primary: {
        id: 'commando_primary',
        name: 'Double Tap',
        description: 'Shoot two bullets for 2x 100% damage.',
        cooldown: 0.2,
        currentCooldown: 0
      },
      secondary: {
        id: 'commando_secondary',
        name: 'Phase Round',
        description: 'Fire a piercing round that penetrates enemies for 220% damage.',
        cooldown: 3.5,
        currentCooldown: 0
      },
      utility: {
        id: 'commando_utility',
        name: 'Tactical Dive',
        description: 'Roll forward rapidly, gaining invulnerability during the dash.',
        cooldown: 5.0,
        currentCooldown: 0,
        charges: 1,
        maxCharges: 1
      },
      special: {
        id: 'commando_special',
        name: 'Suppressive Fire',
        description: 'Fire a rapid barrage of 6 stunning bullets for total 600% damage.',
        cooldown: 9.0,
        currentCooldown: 0
      }
    }
  },
  {
    id: 'huntress',
    name: 'Huntress',
    description: 'An agile archer with auto-seeking arrows, a forward blink, and arrow storm. Can attack while sprinting.',
    unlocked: false,
    unlockCondition: 'Survive at least 5 minutes in a single run or complete Stage 1.',
    meshColor: 0xef4444, // Red
    stats: {
      maxHp: 90,
      hp: 90,
      shield: 0,
      maxShield: 0,
      damage: 14,
      attackSpeed: 1.1,
      moveSpeed: 10.0,
      critChance: 0.10,
      jumpCount: 1,
      armor: 0,
      hpRegen: 0.75
    },
    abilities: {
      primary: {
        id: 'huntress_primary',
        name: 'Strafe',
        description: 'Fire auto-seeking arrows while moving for 120% damage.',
        cooldown: 0.35,
        currentCooldown: 0
      },
      secondary: {
        id: 'huntress_secondary',
        name: 'Laser Glaive',
        description: 'Throw a bouncing glaive that hits up to 4 enemies, dealing +10% damage per bounce.',
        cooldown: 6.0,
        currentCooldown: 0
      },
      utility: {
        id: 'huntress_utility',
        name: 'Blink',
        description: 'Teleport forward instantly.',
        cooldown: 7.0,
        currentCooldown: 0,
        charges: 1,
        maxCharges: 1
      },
      special: {
        id: 'huntress_special',
        name: 'Arrow Rain',
        description: 'Teleport high into the air and rain down slow/damage in an area for 400% total damage.',
        cooldown: 12.0,
        currentCooldown: 0
      }
    }
  },
  {
    id: 'artificer',
    name: 'Artificer',
    description: 'A powerful mage that manipulates elemental forces. Uses fire, ice, and lightning for high burst damage.',
    unlocked: false,
    unlockCondition: 'Open a total of 15 chests across all runs.',
    meshColor: 0x8b5cf6, // Purple
    stats: {
      maxHp: 120,
      hp: 120,
      shield: 20,
      maxShield: 20,
      damage: 18,
      attackSpeed: 0.85,
      moveSpeed: 7.5,
      critChance: 0.05,
      jumpCount: 1,
      armor: 2,
      hpRegen: 0.5
    },
    abilities: {
      primary: {
        id: 'artificer_primary',
        name: 'Flame Bolt',
        description: 'Fire an explosive flame bolt that burns enemies for 200% damage.',
        cooldown: 0.6,
        currentCooldown: 0
      },
      secondary: {
        id: 'artificer_secondary',
        name: 'Charged Nano-Bomb',
        description: 'Charge up and release a giant ball of lightning that deals up to 400% area damage.',
        cooldown: 5.0,
        currentCooldown: 0
      },
      utility: {
        id: 'artificer_utility',
        name: 'Snapfreeze',
        description: 'Create an ice wall that freezes and instantly kills low-health (under 30% HP) enemies.',
        cooldown: 8.0,
        currentCooldown: 0,
        charges: 1,
        maxCharges: 1
      },
      special: {
        id: 'artificer_special',
        name: 'Flamethrower',
        description: 'Channel a close-range fire beam dealing 800% damage over 3 seconds.',
        cooldown: 11.0,
        currentCooldown: 0
      }
    }
  }
];

export function getUnlockedCharacters(): string[] {
  try {
    const list = localStorage.getItem('unlocked_characters');
    if (list) {
      return JSON.parse(list);
    }
  } catch (e) {
    console.error(e);
  }
  return ['commando'];
}

export function saveUnlockCharacter(id: string) {
  try {
    const unlocked = getUnlockedCharacters();
    if (!unlocked.includes(id)) {
      unlocked.push(id);
      localStorage.setItem('unlocked_characters', JSON.stringify(unlocked));
    }
  } catch (e) {
    console.error(e);
  }
}
