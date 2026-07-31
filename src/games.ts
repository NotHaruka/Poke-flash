import { ScreenOrientation } from '@capacitor/screen-orientation';
import { showPanel } from './sidebar.js';
import { escH, toast } from './utils.js';
import { GameRegistry } from './games/core/GameRegistry';

// Import All Game Plugins
import { BladeBedlamPlugin } from './games/bladebedlam/BladeBedlamPlugin';
import { CyberflapPlugin } from './games/cyberflap/CyberflapPlugin';
import { VoidSurvivorPlugin } from './games/voidsurvivor/VoidSurvivorPlugin';
import { RhythmGamePlugin } from './games/rhythm/RhythmGamePlugin';
import { ColosseumDuelPlugin } from './games/colosseumduel/ColosseumDuelPlugin';
import { MinesweeperPlugin } from './games/minesweeper/MinesweeperPlugin';
import { Game2048Plugin } from './games/game2048/Game2048Plugin';
import { SnakePlugin } from './games/snake/SnakePlugin';
import { TicTacToePlugin } from './games/tictactoe/TicTacToePlugin';

// Import New Mini Game Plugins
import { ChessPlugin } from './games/chess/ChessPlugin';
import { CheckersPlugin } from './games/checkers/CheckersPlugin';
import { ConnectFourPlugin } from './games/connectfour/ConnectFourPlugin';
import { ReversiPlugin } from './games/reversi/ReversiPlugin';
import { SudokuPlugin } from './games/sudoku/SudokuPlugin';
import { SolitairePlugin } from './games/solitaire/SolitairePlugin';
import { MemoryMatchPlugin } from './games/memorymatch/MemoryMatchPlugin';
import { TetrisPlugin } from './games/tetris/TetrisPlugin';
import { BreakoutPlugin } from './games/breakout/BreakoutPlugin';
import { PongPlugin } from './games/pong/PongPlugin';

// Wave 2 & 3 Game Plugins
import { GomokuPlugin } from './games/gomoku/GomokuPlugin';
import { BattleshipPlugin } from './games/battleship/BattleshipPlugin';
import { MancalaPlugin } from './games/mancala/MancalaPlugin';
import { NonogramPlugin } from './games/nonogram/NonogramPlugin';
import { SokobanPlugin } from './games/sokoban/SokobanPlugin';
import { WaterSortPlugin } from './games/watersort/WaterSortPlugin';
import { LightsOutPlugin } from './games/lightsout/LightsOutPlugin';
import { Match3Plugin } from './games/match3/Match3Plugin';
import { FreeCellPlugin } from './games/freecell/FreeCellPlugin';
import { AsteroidsPlugin } from './games/asteroids/AsteroidsPlugin';
import { WhackAMolePlugin } from './games/whackamole/WhackAMolePlugin';
import { ZenGardenPlugin } from './games/zengarden/ZenGardenPlugin';
import { PixelArtStudioPlugin } from './games/pixelart/PixelArtStudioPlugin';

// Initialize Game Registry and Register Plugins
const registry = GameRegistry.getInstance();
(window as any).GameRegistry = GameRegistry;

// Core Arcade Games
registry.registerGame(new BladeBedlamPlugin());
registry.registerGame(new CyberflapPlugin());
registry.registerGame(new VoidSurvivorPlugin());
registry.registerGame(new RhythmGamePlugin());
registry.registerGame(new ColosseumDuelPlugin());
registry.registerGame(new MinesweeperPlugin());
registry.registerGame(new Game2048Plugin());
registry.registerGame(new SnakePlugin());
registry.registerGame(new TicTacToePlugin());

// Extended Mini Game Library
registry.registerGame(new ChessPlugin());
registry.registerGame(new CheckersPlugin());
registry.registerGame(new ConnectFourPlugin());
registry.registerGame(new ReversiPlugin());
registry.registerGame(new SudokuPlugin());
registry.registerGame(new SolitairePlugin());
registry.registerGame(new MemoryMatchPlugin());
registry.registerGame(new TetrisPlugin());
registry.registerGame(new BreakoutPlugin());
registry.registerGame(new PongPlugin());

// Newly Registered Games
registry.registerGame(new GomokuPlugin());
registry.registerGame(new BattleshipPlugin());
registry.registerGame(new MancalaPlugin());
registry.registerGame(new NonogramPlugin());
registry.registerGame(new SokobanPlugin());
registry.registerGame(new WaterSortPlugin());
registry.registerGame(new LightsOutPlugin());
registry.registerGame(new Match3Plugin());
registry.registerGame(new FreeCellPlugin());
registry.registerGame(new AsteroidsPlugin());
registry.registerGame(new WhackAMolePlugin());
registry.registerGame(new ZenGardenPlugin());
registry.registerGame(new PixelArtStudioPlugin());

interface GameDefinition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  status: 'playable' | 'upcoming';
  statusText: string;
  statusColor: string;
  playText: string;
  category: string;
  icon: string;
  action: () => void;
}

let activeGamesFilter: string = 'all';
let searchQuery: string = '';

// Map registered game plugins dynamically to UI-friendly definitions
function getGAMES(): GameDefinition[] {
  return registry.getGames().map(game => {
    return {
      id: game.id,
      title: game.name,
      subtitle: game.subtitle,
      description: game.description,
      status: game.status,
      statusText: game.statusText,
      statusColor: game.statusColor,
      playText: game.status === 'playable' ? 'Play Game' : 'Upcoming',
      category: game.category,
      icon: game.iconSvg,
      action: () => {
        if (game.status !== 'playable') {
          toast(`${game.name} is currently in concept development!`);
          return;
        }

        // Setup container mappings based on game ID
        let containerId = '';
        if (game.id === 'void_survivor') {
          containerId = 'void-survivor-root';
        } else if (game.id === 'rhythm_game') {
          containerId = 'rhythm-game-root';
        }

        // Exit handler to return to flash-games panel
        const onExit = () => {
          document.body.classList.remove('void-survivor-active');
          document.body.classList.remove('cyberflap-active');
          try { ScreenOrientation.unlock().catch(() => {}); } catch(e){}
          showPanel('flash-games', null);
        };

        // Launch Game via centralized registry
        registry.launchGame(game.id, containerId, onExit).then(() => {
          // Additional panel activations if handled out-of-band
          if (game.id === 'rhythm_game') {
            showPanel('rhythm-game', null);
          }
          const orientation = game.preferredOrientation || 'any';
          if (orientation === 'landscape') {
            try { ScreenOrientation.lock({ orientation: 'landscape' }).catch((err) => console.warn("Orientation lock failed:", err)); } catch(e){}
          } else if (orientation === 'portrait') {
            try { ScreenOrientation.lock({ orientation: 'portrait' }).catch((err) => console.warn("Orientation lock failed:", err)); } catch(e){}
          } else {
            try { ScreenOrientation.unlock().catch(() => {}); } catch(e){}
          }
        }).catch(err => {
          console.error(`Failed to launch game ${game.id}:`, err);
          toast(`Error launching ${game.name}: ${err.message}`);
        });
      }
    };
  });
}

let quickPlayDuration: 'short' | 'medium' | 'long' = 'medium';

function renderQuickPlayRecommendation(): void {
  const target = document.getElementById('quickplay-recommendation-target');
  if (!target) return;

  const games = getGAMES().filter(g => g.status === 'playable');

  // Match games based on break duration
  let recommendedGames: GameDefinition[] = [];
  if (quickPlayDuration === 'short') {
    recommendedGames = games.filter(g => ['tictactoe', 'memory_match', 'pong', 'connect_four', 'cyberflap'].includes(g.id));
  } else if (quickPlayDuration === 'medium') {
    recommendedGames = games.filter(g => ['snake', 'minesweeper', 'reversi', 'checkers', 'sudoku', 'breakout', 'tetris'].includes(g.id));
  } else {
    recommendedGames = games.filter(g => ['chess', 'solitaire', 'game_2048', 'blade_bedlam', 'void_survivor', 'rhythm_game'].includes(g.id));
  }

  // Fallback if no matching game
  const recommendedGame = recommendedGames.length > 0 
    ? recommendedGames[Math.floor(Math.random() * recommendedGames.length)] 
    : games[0];

  if (!recommendedGame) {
    target.innerHTML = `<span style="font-size: 11px; color: var(--text3);">No active games</span>`;
    return;
  }

  target.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; background: var(--surface2); padding: 4px 12px; border-radius: 20px; border: 1.5px solid var(--border);">
      <div style="width: 16px; height: 16px; color: var(--accent); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        ${recommendedGame.icon}
      </div>
      <div style="display: flex; flex-direction: column;">
        <span style="font-size: 11px; font-weight: 700; color: var(--text); line-height: 1.1;">${escH(recommendedGame.title)}</span>
        <span style="font-size: 9px; color: var(--text3); line-height: 1.1;">Rec. Break Play</span>
      </div>
      <button class="btn btn-p" onclick="window.triggerGameAction('${recommendedGame.id}')" style="height: 22px; padding: 0 8px; font-size: 10px; border-radius: 11px; background: var(--accent); color: var(--surface); border: none; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 2px;">
        <span>Launch</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width: 8px; height: 8px;"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor"/></svg>
      </button>
    </div>
  `;
}

function selectQuickPlayDuration(duration: 'short' | 'medium' | 'long'): void {
  quickPlayDuration = duration;
  (window as any).quickPlayDuration = duration;

  // Toggle button styling
  const buttons = ['short', 'medium', 'long'];
  buttons.forEach(b => {
    const el = document.getElementById(`qp-btn-${b}`);
    if (el) {
      if (b === duration) {
        el.classList.add('active');
        el.style.background = 'var(--accent-dim)';
        el.style.borderColor = 'var(--accent)';
        el.style.color = 'var(--accent)';
      } else {
        el.classList.remove('active');
        el.style.background = 'transparent';
        el.style.borderColor = 'var(--border)';
        el.style.color = 'var(--text3)';
      }
    }
  });

  renderQuickPlayRecommendation();
}

function initGamesArcade(): void {
  const searchInp = document.getElementById('games-search-input');
  if (searchInp) {
    searchInp.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      renderGamesArcade();
    });
  }
  selectQuickPlayDuration('medium');
}

function setGamesFilter(filter: string): void {
  activeGamesFilter = filter;
  
  // Update UI tabs
  document.querySelectorAll('.game-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-filter') === filter);
  });

  renderGamesArcade();
}

function renderGamesArcade(): void {
  const container = document.getElementById('games-list-container');
  if (!container) return;

  const GAMES = getGAMES();

  // Filter games
  const filtered = GAMES.filter(g => {
    const matchesSearch = g.title.toLowerCase().includes(searchQuery) || 
                          g.subtitle.toLowerCase().includes(searchQuery) ||
                          g.description.toLowerCase().includes(searchQuery) ||
                          g.category.toLowerCase().includes(searchQuery);
    
    if (!matchesSearch) return false;
    if (activeGamesFilter === 'playable') return g.status === 'playable';
    if (activeGamesFilter === 'upcoming') return g.status === 'upcoming';
    if (activeGamesFilter !== 'all') {
      return g.category.toLowerCase() === activeGamesFilter.toLowerCase();
    }
    return true;
  });

  // Render stats
  const totalCountEl = document.getElementById('games-stat-total');
  const playableCountEl = document.getElementById('games-stat-playable');
  if (totalCountEl) totalCountEl.textContent = GAMES.length.toString();
  if (playableCountEl) playableCountEl.textContent = GAMES.filter(g => g.status === 'playable').length.toString();

  renderQuickPlayRecommendation();

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 24px; text-align: center; border: 1.5px dashed var(--border); border-radius: var(--rs); background: var(--surface2);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width: 48px; height: 48px; color: var(--text3); margin-bottom: 12px;">
          <circle cx="12" cy="12" r="10" />
          <line x1="8" y1="12" x2="16" y2="12" />
        </svg>
        <h3 style="margin: 0 0 4px; font-size: 15px; font-weight: 600; color: var(--text);">No games found</h3>
        <p style="margin: 0; font-size: 13px; color: var(--text3);">Try adjusting your search terms or filter selection.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(g => {
    const isPlayable = g.status === 'playable';
    const statusBg = isPlayable ? 'rgba(16, 185, 129, 0.12)' : 'rgba(255, 255, 255, 0.05)';
    const statusBorder = isPlayable ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255, 255, 255, 0.1)';
    const btnClass = isPlayable ? 'btn btn-p' : 'btn';
    const btnStyle = isPlayable 
      ? 'background: var(--accent); border-color: var(--accent); color: var(--surface);' 
      : 'opacity: 0.5; cursor: not-allowed; border-color: var(--border); background: var(--surface3); color: var(--text3);';

    return `
      <div class="lib-deck-card" id="game-card-${g.id}" onclick="window.triggerGameAction('${g.id}')" style="display: flex; flex-direction: column; justify-content: space-between; padding: 20px; background: var(--surface2); border: 1.5px solid var(--border); border-radius: var(--rs); cursor: pointer; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); position: relative; overflow: hidden; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">
        <!-- Top Wave Overlay (Subtle Gradient for Playable Card) -->
        ${isPlayable ? `
          <div style="position: absolute; top: 0; right: 0; width: 120px; height: 120px; background: radial-gradient(circle, rgba(205, 162, 80, 0.12) 0%, transparent 70%); pointer-events: none; z-index: 1;"></div>
        ` : ''}

        <div style="position: relative; z-index: 2;">
          <!-- Category & Status Badge Row -->
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; color: var(--text3); background: var(--surface3); padding: 3px 8px; border-radius: 4px;">
              ${escH(g.category)}
            </span>
            <span style="font-family: 'Space Grotesk', sans-serif; font-size: 9.5px; font-weight: 800; letter-spacing: 0.5px; background: ${statusBg}; border: 1px solid ${statusBorder}; color: ${g.statusColor}; padding: 3.5px 8px; border-radius: 6px; text-transform: uppercase;">
              ${g.statusText}
            </span>
          </div>

          <!-- Title Group -->
          <div style="display: flex; gap: 14px; align-items: flex-start; margin-bottom: 14px;">
            <div style="width: 44px; height: 44px; background: ${isPlayable ? 'var(--accent-dim)' : 'var(--surface3)'}; border-radius: 10px; display: flex; align-items: center; justify-content: center; color: ${isPlayable ? 'var(--accent)' : 'var(--text3)'}; flex-shrink: 0; border: 1.5px solid ${isPlayable ? 'rgba(205, 162, 80, 0.25)' : 'var(--border)'};">
              ${g.icon}
            </div>
            <div>
              <h3 style="margin: 0; font-family: 'Fraunces', serif; font-size: 19px; font-weight: 700; color: var(--text); line-height: 1.25;">
                ${escH(g.title)}
              </h3>
              <p style="margin: 2px 0 0; font-size: 12px; font-weight: 500; color: var(--text2);">
                ${escH(g.subtitle)}
              </p>
            </div>
          </div>

          <!-- Description -->
          <p style="margin: 0 0 20px; font-size: 13px; line-height: 1.6; color: var(--text3); height: 64px; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
            ${escH(g.description)}
          </p>
        </div>

        <!-- Play Trigger Row -->
        <div style="border-top: 1px solid var(--border); padding-top: 16px; display: flex; align-items: center; justify-content: space-between; position: relative; z-index: 2;">
          <span style="font-size: 12px; color: var(--text3); font-weight: 500; display: inline-flex; align-items: center; gap: 4px;">
            ${isPlayable ? `
              <span style="width: 6px; height: 6px; background: #10b981; border-radius: 50%; animation: pulse 1.5s infinite;"></span>
              Active Recall Mode Ready
            ` : 'Coming Soon'}
          </span>
          <button class="${btnClass}" style="height: 34px; padding: 0 16px; font-size: 12px; font-weight: 700; border-radius: 17px; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; ${btnStyle}" ${!isPlayable ? 'disabled' : ''}>
            <span>${escH(g.playText)}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 12px; height: 12px;">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function triggerGameAction(id: string): void {
  const GAMES = getGAMES();
  const g = GAMES.find(x => x.id === id);
  if (g) g.action();
}

// Expose API for inline actions
Object.assign(window, {
  initGamesArcade,
  setGamesFilter,
  renderGamesArcade,
  triggerGameAction,
  selectQuickPlayDuration,
  renderQuickPlayRecommendation,
  toggleCyberflapTheater: () => {
    const isActive = document.body.classList.toggle('cyberflap-active');
    const btn = document.getElementById('btn-cyberflap-theater');
    if (btn) {
      btn.innerHTML = isActive 
        ? `<span>Exit Theater</span>` 
        : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg><span>Theater Mode</span>`;
    }
  },
  setPanel: (name: string) => {
    document.body.classList.remove('cyberflap-active');
    document.body.classList.remove('void-survivor-active');
    const btn = document.getElementById('btn-cyberflap-theater');
    if (btn) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg><span>Theater Mode</span>`;
    }
    try { ScreenOrientation.unlock().catch(() => {}); } catch(e){}
    showPanel(name, null);
  }
});

// ─── ES module exports (auto-generated) ───
const GAMES_LIST = getGAMES();
export { GAMES_LIST as GAMES, activeGamesFilter, initGamesArcade, renderGamesArcade, searchQuery, setGamesFilter, triggerGameAction, selectQuickPlayDuration, renderQuickPlayRecommendation };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { initGamesArcade, renderGamesArcade, setGamesFilter, triggerGameAction, selectQuickPlayDuration, renderQuickPlayRecommendation });