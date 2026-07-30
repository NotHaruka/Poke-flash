import { Stage } from '../types';

export const STAGES: Stage[] = [
  {
    id: 1,
    name: 'Verdant Plains',
    biome: 'forest',
    groundColor: 0x16a34a, // Vibrant rich lush grass green
    fogColor: 0xdbeafe, // Luminous daylight soft-blue mist
    skyColor: 0x38bdf8, // Vibrant sky blue illumination
    ambientLightColor: 0x94a3b8, // Bright daylight fill
    chargeTimeRequired: 60
  },
  {
    id: 2,
    name: 'Ancient Sanctuary',
    biome: 'ruins',
    groundColor: 0x71717a, // Lighter stone ruins stone grey
    fogColor: 0xe0e7ff, // Luminous silver lavender/indigo mist
    skyColor: 0x818cf8, // Glowing indigo/lavender light
    ambientLightColor: 0xa1a1aa, // Bright slate steel light
    chargeTimeRequired: 75
  },
  {
    id: 3,
    name: 'Desolate Dunes',
    biome: 'wasteland',
    groundColor: 0xea580c, // Rich bright terracotta sand orange
    fogColor: 0xffedd5, // Bright warm desert morning amber mist
    skyColor: 0xfb923c, // Golden sunset amber lighting
    ambientLightColor: 0xb45309, // Warm golden stone ambient fill
    chargeTimeRequired: 90
  }
];
