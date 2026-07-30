import { MiniGamePlugin } from './GamePlugin';
import { GameLaunchContext, GameSettings, AudioService } from './GameLaunchContext';
import { LocalGameSaveService } from './GameSaveService';

export class GameRegistry {
  private static instance: GameRegistry;
  private games = new Map<string, MiniGamePlugin>();
  private activeGameId: string | null = null;
  private activeGame: MiniGamePlugin | null = null;

  private constructor() {}

  public static getInstance(): GameRegistry {
    if (!GameRegistry.instance) {
      GameRegistry.instance = new GameRegistry();
    }
    return GameRegistry.instance;
  }

  public registerGame(game: MiniGamePlugin): void {
    this.games.set(game.id, game);
  }

  public getGames(): MiniGamePlugin[] {
    return Array.from(this.games.values());
  }

  public getGame(id: string): MiniGamePlugin | undefined {
    return this.games.get(id);
  }

  public async launchGame(id: string, containerId: string, onExit: () => void): Promise<void> {
    const game = this.games.get(id);
    if (!game) {
      throw new Error(`Game with ID "${id}" is not registered.`);
    }

    if (this.activeGame) {
      await this.exitActiveGame();
    }

    // Prepare robust isolated launch context
    const saveService = new LocalGameSaveService();
    const settings = await this.getGameSettings(id);
    const audioService = this.createAudioService();

    const context: GameLaunchContext = {
      userId: localStorage.getItem('ftp-user-id') || undefined,
      settings,
      audio: audioService,
      save: saveService,
      containerId,
      onExit: async () => {
        await this.exitActiveGame();
        onExit();
      }
    };

    this.activeGameId = id;
    this.activeGame = game;

    await game.launch(context);
  }

  public async exitActiveGame(): Promise<void> {
    if (this.activeGame) {
      if (this.activeGame.destroy) {
        this.activeGame.destroy();
      }
      this.activeGame = null;
      this.activeGameId = null;
    }
  }

  public getActiveGameId(): string | null {
    return this.activeGameId;
  }

  private async getGameSettings(gameId: string): Promise<GameSettings> {
    const musicVol = Number(localStorage.getItem('ftp-volume-bgm') ?? '0.5');
    const sfxVol = Number(localStorage.getItem('ftp-volume-sfx') ?? '0.7');
    const diff = (localStorage.getItem(`ftp-game-diff-${gameId}`) || 'normal') as 'easy' | 'normal' | 'hard';
    const speed = Number(localStorage.getItem(`ftp-game-speed-${gameId}`) ?? '5.0');
    const offset = Number(localStorage.getItem(`ftp-game-offset-${gameId}`) ?? '0');

    return {
      musicVolume: musicVol,
      sfxVolume: sfxVol,
      difficulty: diff,
      noteSpeed: speed,
      offset: offset
    };
  }

  private createAudioService(): AudioService {
    return {
      playBGM: (key: string, loop = true) => {
        // Integrate with existing AudioManager or play natively
        if (window.AudioManager && typeof window.AudioManager.playBGM === 'function') {
          window.AudioManager.playBGM(key, loop);
        } else {
          console.log(`[AudioService] playBGM: ${key}`);
        }
      },
      stopBGM: () => {
        if (window.AudioManager && typeof window.AudioManager.stopBGM === 'function') {
          window.AudioManager.stopBGM();
        } else {
          console.log(`[AudioService] stopBGM`);
        }
      },
      playSFX: (key: string) => {
        if (window.AudioManager && typeof window.AudioManager.playSFX === 'function') {
          window.AudioManager.playSFX(key);
        } else {
          console.log(`[AudioService] playSFX: ${key}`);
        }
      }
    };
  }
}
