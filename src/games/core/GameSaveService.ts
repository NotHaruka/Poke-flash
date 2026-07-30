import { GameSaveService } from './GameLaunchContext';

export class LocalGameSaveService implements GameSaveService {
  async getSaveData<T>(gameId: string, defaultData: T): Promise<T> {
    try {
      const key = `ft_game_save_${gameId}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        return JSON.parse(saved) as T;
      }
    } catch (e) {
      console.error(`Failed to load save data for game ${gameId}:`, e);
    }
    return defaultData;
  }

  async saveData<T>(gameId: string, data: T): Promise<void> {
    try {
      const key = `ft_game_save_${gameId}`;
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error(`Failed to save data for game ${gameId}:`, e);
    }
  }
}
