import { GameAudioEngine } from './GameAudioEngine';

export interface InstructionControl {
  key: string;
  action: string;
}

export interface InstructionsConfig {
  title: string;
  subtitle?: string;
  description: string;
  objective?: string;
  controls?: InstructionControl[];
  rules?: string[];
  options?: {
    difficulties?: string[];
    currentDifficulty?: string;
    onSelectDifficulty?: (diff: string) => void;
    modes?: string[];
    currentMode?: string;
    onSelectMode?: (mode: string) => void;
  };
  onStart: () => void;
}

export interface ResultsConfig {
  title: string;
  subtitle?: string;
  isWin?: boolean;
  score?: number;
  highScore?: number;
  stats?: Array<{ label: string; value: string | number }>;
  onRestart: () => void;
  onExit: () => void;
}

export interface OverlayCallbacks {
  onPause?: () => void;
  onResume?: () => void;
  onRestart?: () => void;
  onShowInstructions?: () => void;
  onExit?: () => void;
}

export class GameOverlayManager {
  private container: HTMLElement | null = null;
  private overlayRoot: HTMLDivElement | null = null;
  private hudElement: HTMLDivElement | null = null;
  private instructionsElement: HTMLDivElement | null = null;
  private pauseElement: HTMLDivElement | null = null;
  private resultsElement: HTMLDivElement | null = null;

  private isPaused = false;
  private callbacks: OverlayCallbacks = {};
  private audio = GameAudioEngine.getInstance();

  constructor(containerId: string = 'game-canvas-container', callbacks: OverlayCallbacks = {}) {
    const parent = document.getElementById(containerId);
    if (parent) {
      this.container = parent;
    } else {
      this.container = document.body;
    }
    this.callbacks = callbacks;
    this.initOverlayDOM();
  }

  private initOverlayDOM(): void {
    if (!this.container) return;

    // Ensure relative positioning on parent
    if (getComputedStyle(this.container).position === 'static') {
      this.container.style.position = 'relative';
    }

    // Remove old instance if existing
    const existing = this.container.querySelector('#ftp-game-overlay-root');
    if (existing) {
      existing.remove();
    }

    this.overlayRoot = document.createElement('div');
    this.overlayRoot.id = 'ftp-game-overlay-root';
    this.overlayRoot.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 40;
      font-family: 'Space Grotesk', system-ui, -apple-system, sans-serif;
      user-select: none;
      overflow: hidden;
    `;

    // 1. HUD Layer
    this.hudElement = document.createElement('div');
    this.hudElement.id = 'ftp-hud-layer';
    this.hudElement.style.cssText = `
      position: absolute;
      top: 10px;
      left: 12px;
      right: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      pointer-events: auto;
      z-index: 10;
      gap: 12px;
    `;
    this.overlayRoot.appendChild(this.hudElement);

    // 2. Instructions Layer
    this.instructionsElement = document.createElement('div');
    this.instructionsElement.id = 'ftp-instructions-layer';
    this.instructionsElement.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(8, 9, 18, 0.92);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      pointer-events: auto;
      z-index: 50;
      overflow-y: auto;
    `;
    this.overlayRoot.appendChild(this.instructionsElement);

    // 3. Pause Layer
    this.pauseElement = document.createElement('div');
    this.pauseElement.id = 'ftp-pause-layer';
    this.pauseElement.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(8, 9, 18, 0.90);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      pointer-events: auto;
      z-index: 60;
    `;
    this.overlayRoot.appendChild(this.pauseElement);

    // 4. Results Layer
    this.resultsElement = document.createElement('div');
    this.resultsElement.id = 'ftp-results-layer';
    this.resultsElement.style.cssText = `
      position: absolute;
      inset: 0;
      background: rgba(8, 9, 18, 0.94);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 20px;
      pointer-events: auto;
      z-index: 70;
      overflow-y: auto;
    `;
    this.overlayRoot.appendChild(this.resultsElement);

    this.container.appendChild(this.overlayRoot);
  }

  // --- HUD MANAGER ---
  public setupHUD(
    stats: Array<{ label: string; value: string | number; id?: string }> = [],
    options: {
      showPause?: boolean;
      showInstructions?: boolean;
      showAudio?: boolean;
      showRestart?: boolean;
    } = { showPause: true, showInstructions: true, showAudio: true, showRestart: true }
  ): void {
    if (!this.hudElement) return;

    const statsHTML = stats
      .map(
        s => `
        <div style="background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); border-radius: 8px; padding: 4px 10px; display: flex; align-items: center; gap: 6px;">
          <span style="font-size: 10px; color: #94a3b8; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">${s.label}:</span>
          <span id="ftp-hud-stat-${s.id || s.label.toLowerCase().replace(/\s+/g, '-')}" style="font-family: 'DM Mono', monospace; font-size: 13px; font-weight: 800; color: #38bdf8;">${s.value}</span>
        </div>
      `
      )
      .join('');

    const soundIcon = this.audio.getIsMuted() ? '🔇' : '🔊';

    this.hudElement.innerHTML = `
      <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: center;">
        ${statsHTML}
      </div>
      <div style="display: flex; gap: 6px; align-items: center;">
        ${
          options.showAudio !== false
            ? `<button id="ftp-btn-hud-audio" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); color: #fff; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: all 0.15s;" title="Toggle Audio">${soundIcon}</button>`
            : ''
        }
        ${
          options.showInstructions !== false
            ? `<button id="ftp-btn-hud-help" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); color: #38bdf8; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 800; transition: all 0.15s;" title="How to Play">?</button>`
            : ''
        }
        ${
          options.showRestart !== false
            ? `<button id="ftp-btn-hud-restart" style="background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.18); color: #fff; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: all 0.15s;" title="Restart Game">🔄</button>`
            : ''
        }
        ${
          options.showPause !== false
            ? `<button id="ftp-btn-hud-pause" style="background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #38bdf8; width: 34px; height: 34px; border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; transition: all 0.15s;" title="Pause Game">⏸</button>`
            : ''
        }
      </div>
    `;

    // Attach listeners
    const btnAudio = this.hudElement.querySelector('#ftp-btn-hud-audio');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        this.audio.playSFX('click');
        const muted = this.audio.toggleMute();
        btnAudio.textContent = muted ? '🔇' : '🔊';
      });
    }

    const btnHelp = this.hudElement.querySelector('#ftp-btn-hud-help');
    if (btnHelp) {
      btnHelp.addEventListener('click', () => {
        this.audio.playSFX('click');
        if (this.callbacks.onShowInstructions) this.callbacks.onShowInstructions();
      });
    }

    const btnRestart = this.hudElement.querySelector('#ftp-btn-hud-restart');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        this.audio.playSFX('click');
        if (this.callbacks.onRestart) this.callbacks.onRestart();
      });
    }

    const btnPause = this.hudElement.querySelector('#ftp-btn-hud-pause');
    if (btnPause) {
      btnPause.addEventListener('click', () => {
        this.audio.playSFX('click');
        this.togglePause();
      });
    }
  }

  public updateStat(id: string, value: string | number): void {
    if (!this.hudElement) return;
    const el = this.hudElement.querySelector(`#ftp-hud-stat-${id}`);
    if (el) {
      el.textContent = String(value);
    }
  }

  // --- INSTRUCTIONS / HOW TO PLAY MODAL ---
  public showInstructions(config: InstructionsConfig): void {
    if (!this.instructionsElement) return;

    const controlsHTML = config.controls
      ? config.controls
          .map(
            c => `
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 6px 12px; border-radius: 6px;">
          <span style="font-weight: 700; color: #38bdf8; font-size: 11px;">${c.key}</span>
          <span style="color: #cbd5e1; font-size: 11px;">${c.action}</span>
        </div>
      `
          )
          .join('')
      : '';

    const rulesHTML = config.rules
      ? config.rules
          .map(
            r => `
        <li style="margin-bottom: 4px; color: #cbd5e1; font-size: 12px;">${r}</li>
      `
          )
          .join('')
      : '';

    let diffHTML = '';
    if (config.options?.difficulties) {
      diffHTML = `
        <div style="margin-top: 12px; width: 100%;">
          <div style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px;">Select Difficulty</div>
          <div style="display: flex; gap: 8px; justify-content: center;">
            ${config.options.difficulties
              .map(
                d => `
              <button class="ftp-diff-btn ${d === config.options?.currentDifficulty ? 'active' : ''}" data-diff="${d}" style="
                flex: 1; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; text-transform: uppercase;
                background: ${d === config.options?.currentDifficulty ? '#38bdf8' : 'rgba(255,255,255,0.05)'};
                color: ${d === config.options?.currentDifficulty ? '#000' : '#fff'};
                border: 1px solid ${d === config.options?.currentDifficulty ? '#38bdf8' : 'rgba(255,255,255,0.15)'};
              ">${d}</button>
            `
              )
              .join('')}
          </div>
        </div>
      `;
    }

    this.instructionsElement.innerHTML = `
      <div style="background: rgba(18, 20, 38, 0.95); border: 1.5px solid rgba(56, 189, 248, 0.3); border-radius: 16px; padding: 24px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 16px;">
        <div>
          <div style="font-size: 10px; font-weight: 800; color: #38bdf8; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 2px;">HOW TO PLAY</div>
          <h2 style="font-size: 24px; font-weight: 800; color: #ffffff; margin: 0;">${config.title}</h2>
          ${config.subtitle ? `<p style="font-size: 12px; color: #94a3b8; margin: 4px 0 0 0;">${config.subtitle}</p>` : ''}
        </div>

        <p style="font-size: 13px; color: #cbd5e1; line-height: 1.5; margin: 0; text-align: left; background: rgba(0,0,0,0.2); padding: 10px 12px; border-radius: 8px;">
          ${config.description}
        </p>

        ${
          config.objective
            ? `
          <div style="text-align: left; background: rgba(56, 189, 248, 0.08); border-left: 3px solid #38bdf8; padding: 8px 12px; border-radius: 4px;">
            <div style="font-size: 10px; font-weight: 800; color: #38bdf8; text-transform: uppercase;">OBJECTIVE</div>
            <div style="font-size: 12px; color: #ffffff; margin-top: 2px;">${config.objective}</div>
          </div>
        `
            : ''
        }

        ${
          controlsHTML
            ? `
          <div style="text-align: left;">
            <div style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px;">CONTROLS</div>
            <div style="display: flex; flex-direction: column; gap: 4px;">${controlsHTML}</div>
          </div>
        `
            : ''
        }

        ${
          rulesHTML
            ? `
          <div style="text-align: left;">
            <div style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase; margin-bottom: 4px;">RULES & TIPS</div>
            <ul style="margin: 0; padding-left: 18px;">${rulesHTML}</ul>
          </div>
        `
            : ''
        }

        ${diffHTML}

        <button id="ftp-btn-start-game" style="
          margin-top: 8px; width: 100%; height: 42px; background: linear-gradient(135deg, #38bdf8 0%, #0284c7 100%); border: none; border-radius: 8px; color: #ffffff; font-weight: 800; font-size: 14px; letter-spacing: 1px; text-transform: uppercase; cursor: pointer; box-shadow: 0 4px 14px rgba(56, 189, 248, 0.35); transition: transform 0.1s;
        ">START PLAYING ▶</button>
      </div>
    `;

    this.instructionsElement.style.display = 'flex';

    // Difficulty listener
    if (config.options?.onSelectDifficulty) {
      const diffBtns = this.instructionsElement.querySelectorAll('.ftp-diff-btn');
      diffBtns.forEach(btn => {
        btn.addEventListener('click', (e: any) => {
          this.audio.playSFX('select');
          const d = e.target.getAttribute('data-diff');
          diffBtns.forEach(b => {
            (b as HTMLElement).style.background = 'rgba(255,255,255,0.05)';
            (b as HTMLElement).style.color = '#fff';
            (b as HTMLElement).style.borderColor = 'rgba(255,255,255,0.15)';
          });
          e.target.style.background = '#38bdf8';
          e.target.style.color = '#000';
          e.target.style.borderColor = '#38bdf8';
          if (config.options?.onSelectDifficulty) config.options.onSelectDifficulty(d);
        });
      });
    }

    const startBtn = this.instructionsElement.querySelector('#ftp-btn-start-game');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        this.audio.playSFX('click');
        this.hideInstructions();
        config.onStart();
      });
    }
  }

  public hideInstructions(): void {
    if (this.instructionsElement) {
      this.instructionsElement.style.display = 'none';
    }
  }

  // --- PAUSE MENU OVERLAY ---
  public togglePause(): void {
    if (this.isPaused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  public pause(): void {
    if (this.isPaused || !this.pauseElement) return;
    this.isPaused = true;

    if (this.callbacks.onPause) this.callbacks.onPause();

    const soundText = this.audio.getIsMuted() ? 'Sound: Muted 🔇' : 'Sound: Enabled 🔊';

    this.pauseElement.innerHTML = `
      <div style="background: rgba(18, 20, 38, 0.95); border: 1.5px solid rgba(56, 189, 248, 0.3); border-radius: 16px; padding: 24px; max-width: 380px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 14px;">
        <div>
          <div style="font-size: 10px; font-weight: 800; color: #38bdf8; letter-spacing: 2px; text-transform: uppercase;">GAME SUSPENDED</div>
          <h2 style="font-size: 26px; font-weight: 800; color: #ffffff; margin: 4px 0 0 0;">PAUSED</h2>
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          <button id="ftp-pause-resume" style="height: 42px; background: #38bdf8; border: none; border-radius: 8px; color: #000000; font-weight: 800; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; cursor: pointer;">Resume Game ▶</button>
          <button id="ftp-pause-restart" style="height: 40px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #ffffff; font-weight: 700; font-size: 12px; cursor: pointer;">Restart Round 🔄</button>
          <button id="ftp-pause-audio" style="height: 40px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: #ffffff; font-weight: 700; font-size: 12px; cursor: pointer;">${soundText}</button>
          <button id="ftp-pause-exit" style="height: 40px; background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.4); border-radius: 8px; color: #ef4444; font-weight: 700; font-size: 12px; cursor: pointer;">Exit to Arcade 🚪</button>
        </div>
      </div>
    `;

    this.pauseElement.style.display = 'flex';

    const btnResume = this.pauseElement.querySelector('#ftp-pause-resume');
    if (btnResume) {
      btnResume.addEventListener('click', () => {
        this.audio.playSFX('click');
        this.resume();
      });
    }

    const btnRestart = this.pauseElement.querySelector('#ftp-pause-restart');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        this.audio.playSFX('click');
        this.resume();
        if (this.callbacks.onRestart) this.callbacks.onRestart();
      });
    }

    const btnAudio = this.pauseElement.querySelector('#ftp-pause-audio');
    if (btnAudio) {
      btnAudio.addEventListener('click', () => {
        this.audio.playSFX('click');
        const muted = this.audio.toggleMute();
        btnAudio.textContent = muted ? 'Sound: Muted 🔇' : 'Sound: Enabled 🔊';
      });
    }

    const btnExit = this.pauseElement.querySelector('#ftp-pause-exit');
    if (btnExit) {
      btnExit.addEventListener('click', () => {
        this.audio.playSFX('click');
        if (this.callbacks.onExit) this.callbacks.onExit();
      });
    }
  }

  public resume(): void {
    if (!this.isPaused) return;
    this.isPaused = false;
    if (this.pauseElement) this.pauseElement.style.display = 'none';
    if (this.callbacks.onResume) this.callbacks.onResume();
  }

  // --- RESULTS / GAME OVER / VICTORY OVERLAY ---
  public showResults(config: ResultsConfig): void {
    if (!this.resultsElement) return;

    if (config.isWin) {
      this.audio.playSFX('win');
    } else {
      this.audio.playSFX('lose');
    }

    const titleColor = config.isWin !== false ? '#10b981' : '#ef4444';
    const tagText = config.isWin !== false ? 'VICTORY ACHIEVED' : 'GAME OVER';

    const statsHTML = config.stats
      ? config.stats
          .map(
            s => `
        <div style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); padding: 8px 12px; border-radius: 8px; text-align: center; flex: 1; min-width: 90px;">
          <div style="font-size: 9px; color: #94a3b8; text-transform: uppercase; font-weight: 700;">${s.label}</div>
          <div style="font-family: 'DM Mono', monospace; font-size: 16px; font-weight: 800; color: #ffffff; margin-top: 2px;">${s.value}</div>
        </div>
      `
          )
          .join('')
      : '';

    this.resultsElement.innerHTML = `
      <div style="background: rgba(18, 20, 38, 0.95); border: 1.5px solid ${titleColor}; border-radius: 16px; padding: 24px; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 10px 30px rgba(0,0,0,0.6); display: flex; flex-direction: column; gap: 16px;">
        <div>
          <div style="font-size: 10px; font-weight: 800; color: ${titleColor}; letter-spacing: 2px; text-transform: uppercase; margin-bottom: 2px;">${tagText}</div>
          <h2 style="font-size: 28px; font-weight: 800; color: #ffffff; margin: 0;">${config.title}</h2>
          ${config.subtitle ? `<p style="font-size: 12px; color: #94a3b8; margin: 4px 0 0 0;">${config.subtitle}</p>` : ''}
        </div>

        ${
          config.score !== undefined
            ? `
          <div style="background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 12px;">
            <div style="font-size: 10px; font-weight: 800; color: #94a3b8; text-transform: uppercase;">FINAL SCORE</div>
            <div style="font-family: 'DM Mono', monospace; font-size: 32px; font-weight: 900; color: ${titleColor}; margin-top: 2px;">${config.score}</div>
            ${config.highScore !== undefined ? `<div style="font-size: 11px; color: #eab308; margin-top: 2px;">🏆 Best Score: ${config.highScore}</div>` : ''}
          </div>
        `
            : ''
        }

        ${
          statsHTML
            ? `
          <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
            ${statsHTML}
          </div>
        `
            : ''
        }

        <div style="display: flex; gap: 10px; margin-top: 6px;">
          <button id="ftp-results-restart" style="flex: 1; height: 42px; background: ${titleColor}; border: none; border-radius: 8px; color: #000000; font-weight: 800; font-size: 13px; text-transform: uppercase; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3);">PLAY AGAIN 🔄</button>
          <button id="ftp-results-exit" style="height: 42px; padding: 0 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: #ffffff; font-weight: 700; font-size: 12px; cursor: pointer;">EXIT 🚪</button>
        </div>
      </div>
    `;

    this.resultsElement.style.display = 'flex';

    const btnRestart = this.resultsElement.querySelector('#ftp-results-restart');
    if (btnRestart) {
      btnRestart.addEventListener('click', () => {
        this.audio.playSFX('click');
        this.hideResults();
        config.onRestart();
      });
    }

    const btnExit = this.resultsElement.querySelector('#ftp-results-exit');
    if (btnExit) {
      btnExit.addEventListener('click', () => {
        this.audio.playSFX('click');
        this.hideResults();
        config.onExit();
      });
    }
  }

  public hideResults(): void {
    if (this.resultsElement) {
      this.resultsElement.style.display = 'none';
    }
  }

  public destroy(): void {
    if (this.overlayRoot) {
      this.overlayRoot.remove();
      this.overlayRoot = null;
    }
  }
}
