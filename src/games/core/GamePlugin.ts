import { GameLaunchContext } from './GameLaunchContext';

export interface MiniGamePlugin {
  id: string;
  name: string;
  description: string;
  subtitle: string;
  version: string;
  genre: string;
  estimatedSessionLength: string;
  thumbnailUrl?: string; // Optional custom visual representation
  category: string;
  status: 'playable' | 'upcoming';
  statusText: string;
  statusColor: string;
  iconSvg: string;

  launch(context: GameLaunchContext): Promise<void> | void;
  destroy?(): void;
}
