import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';

export class CyberflapPlugin implements MiniGamePlugin {
  id = 'cyberflap';
  name = 'Cyberflap 2084';
  subtitle = 'Retro-futuristic arcade glider';
  description = 'Pilot your cyber-glider through endless obstacles in this retro-futuristic arcade game. Dodge pipes, collect power-ups, defeat the Shadow Chassis boss, and unlock new customizations in the garage.';
  version = '1.2.0';
  genre = 'Arcade Glider';
  estimatedSessionLength = '3–5 min';
  category = 'Arcade Glider';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  `;

  launch(context: GameLaunchContext): void {
    // Show panel-cyberflap in standard UI
    if (window.setPanel) {
      window.setPanel('cyberflap');
    }
    
    // Set active status on body
    document.body.classList.add('cyberflap-active');
  }

  destroy(): void {
    document.body.classList.remove('cyberflap-active');
  }
}
