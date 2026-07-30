export const GAME_WIDTH = 1024;
export const GAME_HEIGHT = 576;

export enum EntityType {
  PLAYER = 'PLAYER',
  ENEMY_MELEE = 'ENEMY_MELEE',
  ENEMY_RANGED = 'ENEMY_RANGED',
  ENEMY_HEAVY = 'ENEMY_HEAVY',
  BOSS = 'BOSS',
  PROJECTILE = 'PROJECTILE',
  ITEM_COIN = 'ITEM_COIN',
  ITEM_HEAL = 'ITEM_HEAL'
}

export enum GameState {
  BOOT = 'BOOT',
  PRELOAD = 'PRELOAD',
  MENU = 'MENU',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  GAMEOVER = 'GAMEOVER',
  VICTORY = 'VICTORY'
}

export enum EventTopic {
  PLAYER_HEALTH_CHANGED = 'PLAYER_HEALTH_CHANGED',
  PLAYER_STAMINA_CHANGED = 'PLAYER_STAMINA_CHANGED',
  PLAYER_DIED = 'PLAYER_DIED',
  ENEMY_SPAWNED = 'ENEMY_SPAWNED',
  ENEMY_KILLED = 'ENEMY_KILLED',
  COIN_COLLECTED = 'COIN_COLLECTED',
  WAVE_STARTED = 'WAVE_STARTED',
  WAVE_COMPLETED = 'WAVE_COMPLETED',
  SETTING_CHANGED = 'SETTING_CHANGED',
  SAVE_LOADED = 'SAVE_LOADED',
  PLAYER_XP_CHANGED = 'PLAYER_XP_CHANGED',
  PLAYER_LEVEL_UP = 'PLAYER_LEVEL_UP',
  PLAYER_GOLD_CHANGED = 'PLAYER_GOLD_CHANGED',
  BOSS_STARTED = 'BOSS_STARTED',
  BOSS_PHASE_CHANGED = 'BOSS_PHASE_CHANGED',
  BOSS_DAMAGED = 'BOSS_DAMAGED',
  BOSS_ENRAGED = 'BOSS_ENRAGED',
  BOSS_DEFEATED = 'BOSS_DEFEATED',
  BOSS_REWARD_GRANTED = 'BOSS_REWARD_GRANTED'
}

export interface GladiatorPreset {
  id: string;
  name: string;
  desc: string;
  color: string;
  bladeColor: string;
  ability: string;
  baseHp: number;
  baseSpeed: number;
}

export const GLADIATOR_CHARACTERS: GladiatorPreset[] = [
  {
    id: 'knight',
    name: 'Sir Galahad the Iron',
    desc: 'Heavy plate armor, sturdy shield, and powerful swings. Exceptional survivability.',
    color: '#94a3b8',
    bladeColor: '#cda250',
    ability: 'Iron Bastion (Take 30% less damage)',
    baseHp: 5,
    baseSpeed: 125
  },
  {
    id: 'duelist',
    name: 'Seraphina the Swift',
    desc: 'Lightweight chainmail and dual-wielding daggers. Incredibly fast dash slash speed.',
    color: '#fb7185',
    bladeColor: '#fb7185',
    ability: 'Windrunner (Faster stamina recovery)',
    baseHp: 3,
    baseSpeed: 180
  },
  {
    id: 'mage',
    name: 'Ignis the Flameborn',
    desc: 'Sorcerer wielding a flaming broadsword that creates burning ash fields on swings.',
    color: '#f97316',
    bladeColor: '#f97316',
    ability: 'Firebrand (Enemies bleed fire)',
    baseHp: 3,
    baseSpeed: 145
  }
];

export const SAVE_STORAGE_KEY = 'blade_bedlam_save_data';
export const SETTINGS_STORAGE_KEY = 'blade_bedlam_settings';
export const AUDIO_BGM_VOLUME_KEY = 'blade_bedlam_bgm_volume';
export const AUDIO_SFX_VOLUME_KEY = 'blade_bedlam_sfx_volume';

export interface WeaponPreset {
  id: string;
  name: string;
  desc: string;
  icon: string;
  weight: number;
  reach: number;
  baseDamage: number;
  handleOffset: number;
  weaponArt: string;
}

export const WEAPON_PRESETS: WeaponPreset[] = [
  {
    id: 'longsword',
    name: 'Longsword',
    desc: 'A versatile, balanced blade with swift recoveries.',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;"><path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l2 2M19 13l2 2"/></svg>`,
    weight: 1.00,
    reach: 65,
    baseDamage: 22,
    handleOffset: 24,
    weaponArt: 'Parry & Riposte'
  },
  {
    id: 'greatsword',
    name: 'Greatsword',
    desc: 'A heavy, slow-swinging colossus blade with huge knockback.',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;"><path d="M18 15 3 20v-5l15-15M14 6l4 4M5 14l5 5"/></svg>`,
    weight: 1.85,
    reach: 75,
    baseDamage: 38,
    handleOffset: 25,
    weaponArt: 'Titan Cleaver'
  },
  {
    id: 'spear',
    name: 'Spear',
    desc: 'An agile polearm providing massive combat reach.',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;"><path d="m21 3-9 9M19 5l-2-2M15 9l-2-2M3 21l3-3M10 14l-4 4"/></svg>`,
    weight: 0.85,
    reach: 85,
    baseDamage: 20,
    handleOffset: 26,
    weaponArt: 'Piercing Lunge'
  },
  {
    id: 'battle_axe',
    name: 'Battle Axe',
    desc: 'A brutal greataxe with sweeping whirlwind slashes.',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;"><path d="M14 4h6v6l-6-6ZM10 20H4v-6l6 6M14 14 10 10"/></svg>`,
    weight: 1.40,
    reach: 70,
    baseDamage: 28,
    handleOffset: 24,
    weaponArt: 'Whirlwind'
  },
  {
    id: 'warhammer',
    name: 'Warhammer',
    desc: 'An earth-shattering hammer that stuns surrounding beasts.',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;"><path d="M15 3h6v6h-6V3ZM3 21l12-12M15 6H9v6h6V6Z"/></svg>`,
    weight: 1.70,
    reach: 68,
    baseDamage: 32,
    handleOffset: 25,
    weaponArt: 'Earthbreaker'
  },
  {
    id: 'twin_daggers',
    name: 'Dual Daggers',
    desc: 'Ultra-light daggers with extremely rapid dual slashes.',
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;"><path d="M4.5 19.5 15 9M19.5 4.5 9 15M3 21l3-3M21 3l-3 3M14 4l6 6M4 14l6 6"/></svg>`,
    weight: 0.45,
    reach: 50,
    baseDamage: 15,
    handleOffset: 22,
    weaponArt: 'Shadow Flurry'
  }
];
