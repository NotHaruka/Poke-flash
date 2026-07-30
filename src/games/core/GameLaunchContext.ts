export interface GameSettings {
  musicVolume: number; // 0.0 to 1.0
  sfxVolume: number;   // 0.0 to 1.0
  difficulty: 'easy' | 'normal' | 'hard';
  noteSpeed?: number;  // For rhythm game (e.g., 1 to 10)
  offset?: number;     // For audio synchronization in ms (e.g., -100 to 100)
}

export interface AudioService {
  playBGM(key: string, loop?: boolean): void;
  stopBGM(): void;
  playSFX(key: string): void;
}

export interface GameSaveService {
  getSaveData<T>(gameId: string, defaultData: T): Promise<T>;
  saveData<T>(gameId: string, data: T): Promise<void>;
}

export interface GameLaunchContext {
  userId?: string;
  settings: GameSettings;
  audio: AudioService;
  save: GameSaveService;
  containerId: string;
  onExit: () => void;
}
