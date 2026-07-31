import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';

export class VoidSurvivorPlugin implements MiniGamePlugin {
  id = 'void_survivor';
  name = 'Void Survivor';
  subtitle = '3D Roguelite Survival Shooter';
  description = 'Survive endless waves of alien entities in this intense 3D survival shooter. Gather gold, level up, unlock items, upgrade your character mechanics, and defeat powerful monolith titans.';
  version = '2.0.4';
  genre = 'Action / Roguelite';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'landscape';
  estimatedSessionLength = '10–20 min';
  category = 'Action Roguelite';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      <path d="M2 12h20" />
    </svg>
  `;

  async launch(context: GameLaunchContext): Promise<void> {
    document.body.classList.add('void-survivor-active');
    
    if (window.setPanel) {
      window.setPanel('void-survivor');
    }

    // Dynamic import to load React and run mounting
    const module = await import('../../launchVoidSurvivor');
    module.mountVoidSurvivor(context.containerId);
  }

  destroy(): void {
    document.body.classList.remove('void-survivor-active');
    // Call global unmount if exists
    if (window.unmountVoidSurvivor) {
      window.unmountVoidSurvivor();
    }
  }
}