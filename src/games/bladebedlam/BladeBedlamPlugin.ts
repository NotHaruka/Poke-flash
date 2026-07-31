import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { destroyPhaserGame, initGame } from '../../game.js';

export class BladeBedlamPlugin implements MiniGamePlugin {
  id = 'blade_bedlam';
  name = 'Blade Bedlam';
  subtitle = 'Gladiatorial runner & action-slasher';
  description = 'An intense colosseum combat runner. Time your aerial dashes and execute sweeping blade slashes to defeat mythical beasts and test your split-second reactions.';
  version = '1.0.0';
  genre = 'Action Slasher';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'landscape';
  estimatedSessionLength = '3–5 min';
  category = 'Action Slasher';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
      <path d="M13 19l-2-2" />
      <path d="M16 16l2 2" />
      <path d="M19 13l2 2" />
      <path d="M8.5 11.5L20 20v1h-1l-8.5-8.5" />
    </svg>
  `;

  launch(context: GameLaunchContext): void {
    if (window.setPanel) {
      window.setPanel('game');
    }
    initGame();
  }

  destroy(): void {
    destroyPhaserGame();
  }
}