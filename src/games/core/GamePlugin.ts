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

  /**
   * Which orientation this game's UI is actually built for.
   * - 'landscape': game is designed around a wide viewport (e.g. side-scrollers,
   *   split left/right tap controls) and should lock to landscape on launch.
   * - 'portrait': game is designed around a tall viewport (e.g. vertical rhythm
   *   lanes, vertical dodge/flap games) and should lock to portrait on launch.
   * - 'any' (default when omitted): grid/board style game that works fine in
   *   whatever orientation the device is already in - do not force a rotation.
   */
  preferredOrientation?: 'portrait' | 'landscape' | 'any';

  launch(context: GameLaunchContext): Promise<void> | void;
  destroy?(): void;
}