import { ScreenOrientation } from '@capacitor/screen-orientation';
import { showPanel } from './sidebar.js';
import { escH, toast } from './utils.js';




interface GameDefinition {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  status: 'playable' | 'upcoming';
  statusText: string;
  statusColor: string;
  icon: string;
  playText: string;
  category: string;
  action: () => void;
}

let activeGamesFilter: 'all' | 'playable' | 'upcoming' = 'all';
let searchQuery: string = '';

const GAMES: GameDefinition[] = [
  {
    id: 'blade_bedlam',
    title: 'Blade Bedlam',
    subtitle: 'Gladiatorial runner & recall action-slasher',
    description: 'An intense colosseum combat runner. Time your aerial dashes and execute sweeping blade slashes to defeat mythical beasts and test your split-second reactions.',
    status: 'playable',
    statusText: 'PLAYABLE NOW',
    statusColor: 'var(--accent)',
    playText: 'Enter Arena',
    category: 'Action Slasher',
    icon: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
        <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
        <path d="M13 19l-2-2" />
        <path d="M16 16l2 2" />
        <path d="M19 13l2 2" />
        <path d="M8.5 11.5L20 20v1h-1l-8.5-8.5" />
      </svg>
    `,
    action: () => {
      showPanel('game', null);
      try { ScreenOrientation.lock({ orientation: 'landscape' }).catch((err) => console.warn("Orientation lock failed:", err)); } catch(e){}
    }
  },
  {
    id: 'cyberflap',
    title: 'Cyberflap 2084',
    subtitle: 'Retro-futuristic arcade glider',
    description: 'Pilot your cyber-glider through endless obstacles in this retro-futuristic arcade game. Dodge pipes, collect power-ups, defeat the Shadow Chassis boss, and unlock new customizations in the garage.',
    status: 'playable',
    statusText: 'PLAYABLE NOW',
    statusColor: 'var(--accent)',
    playText: 'Launch Glider',
    category: 'Arcade Glider',
    icon: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </svg>
    `,
    action: () => {
      showPanel('cyberflap', null);
      try { ScreenOrientation.lock({ orientation: 'landscape' }).catch((err) => console.warn("Orientation lock failed:", err)); } catch(e){}
    }
  },
  {
    id: 'void_survivor',
    title: 'Void Survivor',
    subtitle: '3D Roguelite Survival Shooter',
    description: 'Survive endless waves of enemies in this fast-paced 3D roguelite. Collect items, upgrade your stats, and defeat the bosses.',
    status: 'playable',
    statusText: 'PLAYABLE NOW',
    statusColor: 'var(--accent)',
    playText: 'Enter The Void',
    category: 'Action Roguelite',
    icon: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
        <path d="M2 12h20" />
      </svg>
    `,
    action: () => {
      // Import the launcher dynamically so React isn't loaded unless needed
      import('./launchVoidSurvivor.tsx').then(module => {
        document.body.classList.add('void-survivor-active');
        showPanel('void-survivor', null);
        try { ScreenOrientation.lock({ orientation: 'landscape' }).catch((err) => console.warn("Orientation lock failed:", err)); } catch(e){}
        module.mountVoidSurvivor('void-survivor-root');
      });
    }
  },
  {
    id: 'colosseum_duel',
    title: 'Colosseum Duel',
    subtitle: 'Turn-based semantic card battle',
    description: 'Duel your AI assistant or customized study guides in a cerebral card arena. Precision answers break down opponent guards, unlocking ultimate recall spells.',
    status: 'upcoming',
    statusText: 'AI LABS CONCEPT',
    statusColor: 'var(--text3)',
    playText: 'Concept Phase',
    category: 'Turn-Based RPG',
    icon: `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
      </svg>
    `,
    action: () => {
      toast('Colosseum Duel is currently an active concept in AI Labs!');
    }
  }
];

function initGamesArcade(): void {
  const searchInp = document.getElementById('games-search-input');
  if (searchInp) {
    searchInp.addEventListener('input', (e) => {
      searchQuery = (e.target as HTMLInputElement).value.trim().toLowerCase();
      renderGamesArcade();
    });
  }
}

function setGamesFilter(filter: 'all' | 'playable' | 'upcoming'): void {
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

  // Filter games
  const filtered = GAMES.filter(g => {
    const matchesSearch = g.title.toLowerCase().includes(searchQuery) || 
                          g.subtitle.toLowerCase().includes(searchQuery) ||
                          g.description.toLowerCase().includes(searchQuery) ||
                          g.category.toLowerCase().includes(searchQuery);
    
    if (!matchesSearch) return false;
    if (activeGamesFilter === 'playable') return g.status === 'playable';
    if (activeGamesFilter === 'upcoming') return g.status === 'upcoming';
    return true;
  });

  // Render stats
  const totalCountEl = document.getElementById('games-stat-total');
  const playableCountEl = document.getElementById('games-stat-playable');
  if (totalCountEl) totalCountEl.textContent = GAMES.length.toString();
  if (playableCountEl) playableCountEl.textContent = GAMES.filter(g => g.status === 'playable').length.toString();

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
  const g = GAMES.find(x => x.id === id);
  if (g) g.action();
}

// Expose API for inline actions
Object.assign(window, {
  initGamesArcade,
  setGamesFilter,
  renderGamesArcade,
  triggerGameAction,
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
    try { ScreenOrientation.unlock().catch((err) => console.warn("Orientation unlock failed:", err)); } catch(e){}
    showPanel(name, null);
  }
});


// ─── ES module exports (auto-generated) ───
export { GAMES, activeGamesFilter, initGamesArcade, renderGamesArcade, searchQuery, setGamesFilter, triggerGameAction };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { initGamesArcade, renderGamesArcade, setGamesFilter, triggerGameAction });
