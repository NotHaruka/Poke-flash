import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { RhythmGameEngine, Song, Note } from './RhythmGameEngine';

// Helper to generate rhythmic notes matching BPM
function generateProceduralChart(bpm: number, lengthSecs: number, density: 'easy' | 'normal' | 'hard'): Note[] {
  const notes: Note[] = [];
  const beatDuration = 60 / bpm; // duration of one beat in seconds
  const totalBeats = Math.floor(lengthSecs / beatDuration);

  let idCounter = 1;
  let activeLanes = [false, false, false, false];

  const step = density === 'easy' ? 2 : density === 'normal' ? 1 : 0.5;

  for (let beat = 4; beat < totalBeats - 4; beat += step) {
    const time = beat * beatDuration;
    
    // Choose lane
    const lane = Math.floor(Math.random() * 4);
    
    // Check density probability
    const prob = density === 'easy' ? 0.45 : density === 'normal' ? 0.65 : 0.8;
    if (Math.random() > prob) continue;

    // Pick a note type
    const typeRand = Math.random();
    let type: 'tap' | 'hold' | 'flick' = 'tap';

    if (density !== 'easy') {
      if (typeRand > 0.8) {
        type = 'flick';
      } else if (typeRand > 0.6) {
        type = 'hold';
      }
    }

    if (type === 'hold') {
      const holdDuration = beatDuration * (Math.floor(Math.random() * 2) + 1);
      notes.push({
        id: `note_${idCounter++}`,
        time,
        lane,
        type,
        duration: holdDuration
      });
      // Skip ahead to avoid overlapping notes on this lane
      beat += (holdDuration / beatDuration);
    } else {
      notes.push({
        id: `note_${idCounter++}`,
        time,
        lane,
        type
      });
    }
  }

  return notes;
}

export class RhythmGamePlugin implements MiniGamePlugin {
  id = 'rhythm_game';
  name = 'Recall Rhythm';
  subtitle = 'Project SEKAI-style recreational rhythm game';
  description = 'Hit precision beats and flick notes synchronized to retro synthwave. Calibrate your timing, adjust your speed, and achieve an S-Rank in this highly responsive arcade mode.';
  version = '1.0.0';
  genre = 'Rhythm / Music';
  estimatedSessionLength = '3–5 min';
  category = 'Rhythm & Sync';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = '#0ea5e9';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  `;

  private context: GameLaunchContext | null = null;
  private engine: RhythmGameEngine | null = null;
  private activeContainer: HTMLElement | null = null;

  // Track calibration metronome helpers
  private calibratorTimer: any = null;

  // Available Songs
  private songs: Song[] = [
    {
      id: 'chassis_ost1',
      title: 'Chassis Glide Flight',
      artist: 'Shadow Chassis Ost',
      audioUrl: '/assets/audio/chassis_ost1.wav',
      bpm: 124,
      difficulty: {
        easy: generateProceduralChart(124, 110, 'easy'),
        normal: generateProceduralChart(124, 110, 'normal'),
        hard: generateProceduralChart(124, 110, 'hard'),
      }
    },
    {
      id: 'chassis_ost2',
      title: 'Monolith Titan Fight',
      artist: 'Shadow Chassis Ost',
      audioUrl: '/assets/audio/chassis_ost2.wav',
      bpm: 140,
      difficulty: {
        easy: generateProceduralChart(140, 140, 'easy'),
        normal: generateProceduralChart(140, 140, 'normal'),
        hard: generateProceduralChart(140, 140, 'hard'),
      }
    }
  ];

  // Selected State
  private selectedSongIndex = 0;
  private selectedDifficulty: 'easy' | 'normal' | 'hard' = 'normal';
  private currentNoteSpeed = 5.0;
  private currentOffset = 0;

  async launch(context: GameLaunchContext): Promise<void> {
    this.context = context;
    const container = document.getElementById(context.containerId);
    if (!container) return;
    this.activeContainer = container;

    // Load saved configurations
    this.currentNoteSpeed = context.settings.noteSpeed ?? 5.0;
    this.currentOffset = context.settings.offset ?? 0;
    this.selectedDifficulty = context.settings.difficulty;

    this.renderMainUI();
  }

  private renderMainUI() {
    if (!this.activeContainer) return;

    this.activeContainer.innerHTML = `
      <div class="rhythm-game-wrapper" style="width: 100%; height: 100%; display: flex; flex-direction: column; background: #080718; color: #fff; font-family: 'Space Grotesk', sans-serif; overflow-y: auto;">
        
        <!-- Header -->
        <div style="flex-shrink: 0; display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); background: #0b0924;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 36px; height: 36px; background: rgba(14, 165, 233, 0.15); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #0ea5e9;">
              ${this.iconSvg}
            </div>
            <div>
              <h2 style="margin: 0; font-size: 18px; font-weight: 700; tracking-tight: -0.02em;">RECALL RHYTHM</h2>
              <span style="font-size: 11px; color: rgba(255, 255, 255, 0.45);">Recreational Beats Engine</span>
            </div>
          </div>
          <button class="btn" id="rhythm-exit-btn" style="background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1); color: #94a3b8; font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 20px; cursor: pointer;">
            Exit Arcade
          </button>
        </div>

        <!-- Main Body -->
        <div id="rhythm-main-content" style="flex: 1; display: flex; flex-direction: column; padding: 24px;">
          <!-- Song Selector View -->
          ${this.getSongSelectionHTML()}
        </div>

      </div>
    `;

    this.bindSongSelectionEvents();
  }

  private getSongSelectionHTML(): string {
    return `
      <div style="max-width: 900px; width: 100%; margin: 0 auto; display: grid; grid-template-columns: 1.2fr 1fr; gap: 24px;">
        
        <!-- Left: Song Playlist -->
        <div style="display: flex; flex-direction: column; gap: 14px;">
          <h3 style="margin: 0; font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600;">Choose Track</h3>
          
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${this.songs.map((song, idx) => `
              <div class="song-card ${idx === this.selectedSongIndex ? 'active' : ''}" data-index="${idx}" style="background: ${idx === this.selectedSongIndex ? 'rgba(14, 165, 233, 0.08)' : '#0f0d2d'}; border: 1.5px solid ${idx === this.selectedSongIndex ? '#0ea5e9' : 'rgba(255, 255, 255, 0.05)'}; padding: 16px; border-radius: 12px; cursor: pointer; transition: all 0.2s; display: flex; justify-content: space-between; align-items: center;">
                <div>
                  <h4 style="margin: 0; font-size: 15px; font-weight: 700; color: ${idx === this.selectedSongIndex ? '#38bdf8' : '#fff'};">${song.title}</h4>
                  <p style="margin: 4px 0 0; font-size: 11px; color: rgba(255,255,255,0.45);">${song.artist} • ${song.bpm} BPM</p>
                </div>
                <div style="display: flex; gap: 6px;">
                  <span style="font-size: 9px; font-weight: 800; background: rgba(16, 185, 129, 0.15); color: #10b981; padding: 3px 6px; border-radius: 4px;">EASY</span>
                  <span style="font-size: 9px; font-weight: 800; background: rgba(14, 165, 233, 0.15); color: #0ea5e9; padding: 3px 6px; border-radius: 4px;">NORMAL</span>
                  <span style="font-size: 9px; font-weight: 800; background: rgba(244, 63, 94, 0.15); color: #f43f5e; padding: 3px 6px; border-radius: 4px;">HARD</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Right: Configurations & Launch -->
        <div style="background: #0f0d2d; border: 1.5px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 20px;">
          <h3 style="margin: 0; font-family: 'Fraunces', serif; font-size: 20px; font-weight: 600;">Calibration & Speed</h3>
          
          <!-- Difficulty select -->
          <div>
            <label style="font-size: 11px; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">DIFFICULTY</label>
            <div style="display: flex; gap: 8px; margin-top: 8px;">
              <button class="diff-btn ${this.selectedDifficulty === 'easy' ? 'active' : ''}" data-diff="easy" style="flex: 1; height: 36px; border-radius: 8px; border: 1.5px solid ${this.selectedDifficulty === 'easy' ? '#10b981' : 'rgba(255,255,255,0.05)'}; background: ${this.selectedDifficulty === 'easy' ? 'rgba(16, 185, 129, 0.15)' : 'transparent'}; color: ${this.selectedDifficulty === 'easy' ? '#10b981' : '#cbd5e1'}; font-weight: 700; font-size: 12px; cursor: pointer;">EASY</button>
              <button class="diff-btn ${this.selectedDifficulty === 'normal' ? 'active' : ''}" data-diff="normal" style="flex: 1; height: 36px; border-radius: 8px; border: 1.5px solid ${this.selectedDifficulty === 'normal' ? '#0ea5e9' : 'rgba(255,255,255,0.05)'}; background: ${this.selectedDifficulty === 'normal' ? 'rgba(14, 165, 233, 0.15)' : 'transparent'}; color: ${this.selectedDifficulty === 'normal' ? '#38bdf8' : '#cbd5e1'}; font-weight: 700; font-size: 12px; cursor: pointer;">NORMAL</button>
              <button class="diff-btn ${this.selectedDifficulty === 'hard' ? 'active' : ''}" data-diff="hard" style="flex: 1; height: 36px; border-radius: 8px; border: 1.5px solid ${this.selectedDifficulty === 'hard' ? '#f43f5e' : 'rgba(255,255,255,0.05)'}; background: ${this.selectedDifficulty === 'hard' ? 'rgba(244, 63, 94, 0.15)' : 'transparent'}; color: ${this.selectedDifficulty === 'hard' ? '#f43f5e' : '#cbd5e1'}; font-weight: 700; font-size: 12px; cursor: pointer;">HARD</button>
            </div>
          </div>

          <!-- Note speed slider -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 11px; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">NOTE SPEED</label>
              <span id="speed-label" style="font-size: 13px; font-weight: 700; color: #38bdf8;">${this.currentNoteSpeed.toFixed(1)}x</span>
            </div>
            <input type="range" id="note-speed-slider" min="1" max="10" step="0.5" value="${this.currentNoteSpeed}" style="width: 100%; accent-color: #0ea5e9;">
          </div>

          <!-- Calibration Offset slider -->
          <div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <label style="font-size: 11px; color: rgba(255, 255, 255, 0.4); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">CALIBRATION OFFSET</label>
              <span id="offset-label" style="font-size: 13px; font-weight: 700; color: #f43f5e;">${this.currentOffset > 0 ? '+' : ''}${this.currentOffset} ms</span>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input type="range" id="offset-slider" min="-250" max="250" step="10" value="${this.currentOffset}" style="flex: 1; accent-color: #f43f5e;">
              <button id="btn-calibrate-wizard" class="btn" style="background: rgba(255, 255, 255, 0.05); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; border: 1px solid rgba(255, 255, 255, 0.1);">Tap Sync</button>
            </div>
          </div>

          <!-- Keyboard Layout Info -->
          <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; padding: 12px; font-size: 11px; color: rgba(255, 255, 255, 0.45); line-height: 1.5;">
            <span style="font-weight: 700; color: #fff;">Desktop keys:</span> <b>D</b> (Lane 1), <b>F</b> (Lane 2), <b>J</b> (Lane 3), <b>K</b> (Lane 4).<br>
            <span style="font-weight: 700; color: #fff;">Mobile devices:</span> Tap directly inside the glowing vertical lanes.
          </div>

          <!-- Play button -->
          <button id="btn-play-song" class="btn" style="width: 100%; height: 48px; background: #0ea5e9; border: none; color: #080718; font-size: 14px; font-weight: 800; text-transform: uppercase; tracking-wider: 1px; border-radius: 12px; cursor: pointer; transition: transform 0.1s, background 0.2s;">
            PLAY SONG
          </button>
        </div>

      </div>
    `;
  }

  private bindSongSelectionEvents() {
    if (!this.activeContainer) return;

    // Exit Button
    const exitBtn = this.activeContainer.querySelector('#rhythm-exit-btn');
    if (exitBtn) {
      exitBtn.addEventListener('click', () => {
        if (this.context) this.context.onExit();
      });
    }

    // Song Selection click
    const cards = this.activeContainer.querySelectorAll('.song-card');
    cards.forEach(card => {
      card.addEventListener('click', () => {
        const index = Number(card.getAttribute('data-index'));
        this.selectedSongIndex = index;
        
        cards.forEach(c => {
          c.classList.remove('active');
          (c as HTMLElement).style.background = '#0f0d2d';
          (c as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.05)';
        });
        card.classList.add('active');
        (card as HTMLElement).style.background = 'rgba(14, 165, 233, 0.08)';
        (card as HTMLElement).style.borderColor = '#0ea5e9';
      });
    });

    // Difficulty selection click
    const diffBtns = this.activeContainer.querySelectorAll('.diff-btn');
    diffBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const diff = btn.getAttribute('data-diff') as 'easy' | 'normal' | 'hard';
        this.selectedDifficulty = diff;
        
        diffBtns.forEach(b => {
          b.classList.remove('active');
          (b as HTMLElement).style.background = 'transparent';
          (b as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.05)';
          (b as HTMLElement).style.color = '#cbd5e1';
        });

        btn.classList.add('active');
        const activeColor = diff === 'easy' ? '#10b981' : diff === 'normal' ? '#38bdf8' : '#f43f5e';
        const activeBg = diff === 'easy' ? 'rgba(16, 185, 129, 0.15)' : diff === 'normal' ? 'rgba(14, 165, 233, 0.15)' : 'rgba(244, 63, 94, 0.15)';
        (btn as HTMLElement).style.background = activeBg;
        (btn as HTMLElement).style.borderColor = activeColor;
        (btn as HTMLElement).style.color = activeColor;
      });
    });

    // Speed slider
    const speedSlider = this.activeContainer.querySelector('#note-speed-slider') as HTMLInputElement | null;
    const speedLabel = this.activeContainer.querySelector('#speed-label');
    if (speedSlider && speedLabel) {
      speedSlider.addEventListener('input', () => {
        const value = Number(speedSlider.value);
        this.currentNoteSpeed = value;
        speedLabel.textContent = `${value.toFixed(1)}x`;
        localStorage.setItem('ftp-game-speed-rhythm_game', String(value));
      });
    }

    // Offset slider
    const offsetSlider = this.activeContainer.querySelector('#offset-slider') as HTMLInputElement | null;
    const offsetLabel = this.activeContainer.querySelector('#offset-label');
    if (offsetSlider && offsetLabel) {
      offsetSlider.addEventListener('input', () => {
        const value = Number(offsetSlider.value);
        this.currentOffset = value;
        offsetLabel.textContent = `${value > 0 ? '+' : ''}${value} ms`;
        localStorage.setItem('ftp-game-offset-rhythm_game', String(value));
      });
    }

    // Play Button
    const playBtn = this.activeContainer.querySelector('#btn-play-song');
    if (playBtn) {
      playBtn.addEventListener('click', () => {
        this.launchGameplay();
      });
    }

    // Calibrate wizard helper
    const wizardBtn = this.activeContainer.querySelector('#btn-calibrate-wizard');
    if (wizardBtn) {
      wizardBtn.addEventListener('click', () => {
        this.launchCalibrateWizard();
      });
    }
  }

  private launchGameplay() {
    const mainContent = document.getElementById('rhythm-main-content');
    if (!mainContent) return;

    mainContent.innerHTML = `
      <div style="flex: 1; display: grid; grid-template-columns: 1fr 280px; gap: 20px; height: 100%; min-height: 500px;">
        
        <!-- Game Canvas Box -->
        <div style="position: relative; background: #000; border-radius: 16px; border: 1.5px solid rgba(255,255,255,0.06); overflow: hidden; display: flex; align-items: center; justify-content: center;">
          <canvas id="rhythm-canvas" style="width: 100%; height: 100%; display: block; cursor: pointer;"></canvas>

          <!-- Tap Controls for Mobile Overlay (invisible buttons, captures touches) -->
          <div style="position: absolute; inset: 0; display: grid; grid-template-columns: repeat(4, 1fr);">
            <div id="touch-lane-0" style="height: 100%;"></div>
            <div id="touch-lane-1" style="height: 100%;"></div>
            <div id="touch-lane-2" style="height: 100%;"></div>
            <div id="touch-lane-3" style="height: 100%;"></div>
          </div>
        </div>

        <!-- Sidebar Panel Controls -->
        <div style="background: #0f0d2d; border: 1.5px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between;">
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div>
              <span style="font-size: 10px; font-weight: 800; color: #0ea5e9; text-transform: uppercase; tracking-wider: 1px;">Now Playing</span>
              <h4 style="margin: 4px 0 0; font-size: 16px; font-weight: 700;">${this.songs[this.selectedSongIndex].title}</h4>
              <p style="margin: 2px 0 0; font-size: 11px; color: rgba(255,255,255,0.45);">${this.songs[this.selectedSongIndex].artist}</p>
            </div>

            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px;">
              <span style="font-size: 10px; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase;">Difficulty</span>
              <div style="font-size: 14px; font-weight: 700; color: ${this.selectedDifficulty === 'easy' ? '#10b981' : this.selectedDifficulty === 'normal' ? '#38bdf8' : '#f43f5e'}; text-transform: uppercase; margin-top: 4px;">
                ${this.selectedDifficulty}
              </div>
            </div>

            <!-- Song progress bar -->
            <div style="border-top: 1px solid rgba(255,255,255,0.05); padding-top: 16px;">
              <div style="display: flex; justify-content: space-between; font-size: 10px; color: rgba(255,255,255,0.4); margin-bottom: 6px;">
                <span>PROGRESS</span>
                <span id="song-progress-text">0:00 / 0:00</span>
              </div>
              <div style="background: rgba(255,255,255,0.05); height: 6px; border-radius: 3px; overflow: hidden;">
                <div id="song-progress-fill" style="width: 0%; height: 100%; background: #0ea5e9;"></div>
              </div>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 10px;">
            <button id="btn-gameplay-pause" class="btn" style="width: 100%; height: 38px; background: rgba(255, 255, 255, 0.05); border: 1.5px solid rgba(255,255,255,0.08); font-size: 12px; font-weight: 700; border-radius: 8px;">
              PAUSE
            </button>
            <button id="btn-gameplay-quit" class="btn" style="width: 100%; height: 38px; background: rgba(239, 68, 68, 0.1); border: 1.5px solid rgba(239,68,68,0.2); color: #ef4444; font-size: 12px; font-weight: 700; border-radius: 8px;">
              ABANDON RUN
            </button>
          </div>
        </div>

      </div>
    `;

    // Initialize Canvas Size
    const canvas = document.getElementById('rhythm-canvas') as HTMLCanvasElement;
    const parent = canvas.parentElement;
    if (parent) {
      canvas.width = parent.clientWidth;
      canvas.height = parent.clientHeight;
    }

    // Engine Init
    const song = this.songs[this.selectedSongIndex];
    this.engine = new RhythmGameEngine(canvas, song, {
      difficulty: this.selectedDifficulty,
      noteSpeed: this.currentNoteSpeed,
      offset: this.currentOffset,
      onGameOver: (score, accuracy, maxCombo, perfects, misses) => {
        this.showResultsScreen('gameover', score, accuracy, maxCombo, perfects, misses);
      },
      onVictory: (score, accuracy, maxCombo, perfects, misses) => {
        this.showResultsScreen('victory', score, accuracy, maxCombo, perfects, misses);
      },
      onTimeUpdate: (current, total) => {
        const fill = document.getElementById('song-progress-fill');
        const text = document.getElementById('song-progress-text');
        if (fill) {
          const percentage = Math.min(100, Math.max(0, (current / total) * 100));
          fill.style.width = `${percentage}%`;
        }
        if (text) {
          const format = (s: number) => {
            const m = Math.floor(s / 60);
            const rem = Math.floor(s % 60);
            return `${m}:${rem.toString().padStart(2, '0')}`;
          };
          text.textContent = `${format(current)} / ${format(total)}`;
        }
      }
    });

    // Resize Handling
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => {
        if (parent && canvas) {
          const newW = parent.clientWidth;
          const newH = parent.clientHeight;
          if (canvas.width !== newW || canvas.height !== newH) {
            canvas.width = newW;
            canvas.height = newH;
          }
        }
      });
    });
    if (parent) resizeObserver.observe(parent);

    // Bind Keyboard Handlers
    const keyMap: Record<string, number> = {
      d: 0, D: 0,
      f: 1, F: 1,
      j: 2, J: 2,
      k: 3, K: 3
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (keyMap[e.key] !== undefined) {
        e.preventDefault();
        this.engine?.handleKeyPress(keyMap[e.key], false);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (keyMap[e.key] !== undefined) {
        e.preventDefault();
        this.engine?.handleKeyPress(keyMap[e.key], true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Bind Mobile touch overlays
    const touchLanes = [0, 1, 2, 3];
    touchLanes.forEach(lane => {
      const overlay = document.getElementById(`touch-lane-${lane}`);
      if (overlay) {
        overlay.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.engine?.handleKeyPress(lane, false);
        });
        overlay.addEventListener('touchend', (e) => {
          e.preventDefault();
          this.engine?.handleKeyPress(lane, true);
        });
      }
    });

    // Bind Controls
    const pauseBtn = document.getElementById('btn-gameplay-pause');
    if (pauseBtn) {
      let isPausedLocal = false;
      pauseBtn.addEventListener('click', () => {
        if (!isPausedLocal) {
          this.engine?.pause();
          pauseBtn.textContent = 'RESUME';
          pauseBtn.style.background = '#0ea5e9';
          pauseBtn.style.color = '#000';
          isPausedLocal = true;
        } else {
          this.engine?.resume();
          pauseBtn.textContent = 'PAUSE';
          pauseBtn.style.background = 'rgba(255,255,255,0.05)';
          pauseBtn.style.color = '#fff';
          isPausedLocal = false;
        }
      });
    }

    const quitBtn = document.getElementById('btn-gameplay-quit');
    if (quitBtn) {
      quitBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to quit back to select? Progress will be lost.')) {
          cleanup();
          this.renderMainUI();
        }
      });
    }

    const cleanup = () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      resizeObserver.disconnect();
      this.engine?.destroy();
      this.engine = null;
    };

    // Override exit callbacks to ensure engine is destroyed
    const originalOnExit = this.context?.onExit;
    if (this.context) {
      this.context.onExit = () => {
        cleanup();
        if (originalOnExit) originalOnExit();
      };
    }

    // Start Engine
    this.engine.start();
  }

  private showResultsScreen(
    status: 'victory' | 'gameover',
    score: number,
    accuracy: number,
    maxCombo: number,
    perfects: number,
    misses: number
  ) {
    const mainContent = document.getElementById('rhythm-main-content');
    if (!mainContent) return;

    // Determine Rank Grade
    let grade = 'D';
    if (accuracy >= 97) grade = 'S';
    else if (accuracy >= 92) grade = 'A';
    else if (accuracy >= 85) grade = 'B';
    else if (accuracy >= 75) grade = 'C';

    const gradeColors: Record<string, string> = {
      S: '#eab308', // Gold
      A: '#ec4899', // Pink
      B: '#3b82f6', // Blue
      C: '#10b981', // Green
      D: '#94a3b8'  // Slate
    };

    mainContent.innerHTML = `
      <div style="max-width: 600px; width: 100%; margin: auto; background: #0f0d2d; border: 1.5px solid rgba(255,255,255,0.05); border-radius: 20px; padding: 32px; text-align: center;">
        
        <!-- Icon Banner -->
        <div style="margin-bottom: 16px;">
          ${status === 'victory' ? `
            <div style="width: 60px; height: 60px; background: rgba(16, 185, 129, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #10b981; margin: 0 auto 12px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 32px; height: 32px;">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            </div>
            <h3 style="margin: 0; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; color: #10b981;">TRACK CLEARED</h3>
          ` : `
            <div style="width: 60px; height: 60px; background: rgba(239, 68, 68, 0.15); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #ef4444; margin: 0 auto 12px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 32px; height: 32px;">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h3 style="margin: 0; font-family: 'Fraunces', serif; font-size: 24px; font-weight: 700; color: #ef4444;">TRACK FAILED</h3>
          `}
          <p style="margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.45);">${this.songs[this.selectedSongIndex].title}</p>
        </div>

        <!-- Grade Display -->
        <div style="margin: 24px 0;">
          <div style="font-size: 80px; font-weight: 900; color: ${gradeColors[grade]}; line-height: 1; text-shadow: 0 0 20px ${gradeColors[grade]}60; font-family: 'Space Grotesk', sans-serif;">
            ${grade}
          </div>
          <div style="font-size: 11px; font-weight: 800; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-top: 6px; letter-spacing: 1px;">Grade Achieved</div>
        </div>

        <!-- Scores and Accuracies Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 28px;">
          <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 12px;">
            <div style="font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase;">Final Score</div>
            <div style="font-size: 20px; font-weight: 800; color: #fff; margin-top: 4px;">${score}</div>
          </div>
          <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 12px;">
            <div style="font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase;">Accuracy</div>
            <div style="font-size: 20px; font-weight: 800; color: #38bdf8; margin-top: 4px;">${accuracy.toFixed(2)}%</div>
          </div>
          <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 12px;">
            <div style="font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase;">Max Combo</div>
            <div style="font-size: 20px; font-weight: 800; color: #eab308; margin-top: 4px;">${maxCombo}</div>
          </div>
          <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 12px;">
            <div style="font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase;">Perfect / Miss</div>
            <div style="font-size: 20px; font-weight: 800; color: #fff; margin-top: 4px;">
              <span style="color: #10b981;">${perfects}</span> <span style="color: rgba(255,255,255,0.15);">/</span> <span style="color: #ef4444;">${misses}</span>
            </div>
          </div>
        </div>

        <!-- Call to action buttons -->
        <div style="display: flex; gap: 12px;">
          <button id="btn-results-retry" class="btn" style="flex: 1; height: 44px; background: #0ea5e9; border: none; color: #080718; font-size: 13px; font-weight: 800; text-transform: uppercase; border-radius: 10px; cursor: pointer;">
            PLAY AGAIN
          </button>
          <button id="btn-results-back" class="btn" style="flex: 1; height: 44px; background: rgba(255,255,255,0.05); border: 1.5px solid rgba(255,255,255,0.1); color: #cbd5e1; font-size: 13px; font-weight: 800; text-transform: uppercase; border-radius: 10px; cursor: pointer;">
            BACK TO PLAYLIST
          </button>
        </div>

      </div>
    `;

    // Bind Results buttons
    const retryBtn = document.getElementById('btn-results-retry');
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        this.launchGameplay();
      });
    }

    const backBtn = document.getElementById('btn-results-back');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.renderMainUI();
      });
    }
  }

  private launchCalibrateWizard() {
    const mainContent = document.getElementById('rhythm-main-content');
    if (!mainContent) return;

    let tapTimes: number[] = [];
    let wizardOffset = this.currentOffset;

    mainContent.innerHTML = `
      <div style="max-width: 600px; width: 100%; margin: auto; background: #0f0d2d; border: 1.5px solid rgba(255,255,255,0.05); border-radius: 20px; padding: 32px; text-align: center;">
        
        <h3 style="margin: 0; font-family: 'Fraunces', serif; font-size: 22px; font-weight: 700; color: #f43f5e;">AUDIO SYNCHRONIZATION</h3>
        <p style="margin: 6px 0 24px; font-size: 12px; color: rgba(255,255,255,0.45);">
          Tap on the pulsing target matching the beat to calibrate your audio-visual lag.
        </p>

        <!-- Pulsing Metronome Circle -->
        <div id="metronome-circle" style="width: 120px; height: 120px; border-radius: 50%; border: 3px solid #f43f5e; display: flex; align-items: center; justify-content: center; margin: 0 auto 30px; cursor: pointer; transition: transform 0.05s; position: relative;">
          <div style="position: absolute; inset: -10px; border: 1px solid rgba(244, 63, 94, 0.3); border-radius: 50%; animation: ping 1s infinite;"></div>
          <span style="font-size: 12px; font-weight: 800; color: #f43f5e; text-transform: uppercase;">TAP BEAT</span>
        </div>

        <div style="margin-bottom: 24px;">
          <div style="font-size: 24px; font-weight: 800; color: #fff;" id="wizard-offset-val">${wizardOffset > 0 ? '+' : ''}${wizardOffset} ms</div>
          <div style="font-size: 10px; color: rgba(255,255,255,0.4); text-transform: uppercase; margin-top: 4px;">CALCULATED OFFSET</div>
        </div>

        <p style="font-size: 11px; color: rgba(255,255,255,0.4); line-height: 1.5; margin-bottom: 24px; text-align: left; padding: 12px; background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px;">
          <b>How to do it:</b> Simply tap the big red circle steadily on each pulse. We will monitor your precision and calculate the ideal adjustment value to keep the notes perfectly synchronized to your device's audio output.
        </p>

        <button id="btn-wizard-save" class="btn" style="width: 100%; height: 44px; background: #f43f5e; border: none; color: #080718; font-size: 13px; font-weight: 800; text-transform: uppercase; border-radius: 10px; cursor: pointer;">
          APPLY CALIBRATION
        </button>
      </div>
    `;

    const circle = document.getElementById('metronome-circle');
    const valDisplay = document.getElementById('wizard-offset-val');
    const saveBtn = document.getElementById('btn-wizard-save');

    // Metro pulse timer
    let bpm = 120;
    let pulseInterval = (60 / bpm) * 1000;
    let nextPulse = Date.now() + pulseInterval;

    const pulse = () => {
      if (circle) {
        circle.style.transform = 'scale(1.1)';
        circle.style.background = 'rgba(244, 63, 94, 0.1)';
        setTimeout(() => {
          circle.style.transform = 'scale(1.0)';
          circle.style.background = 'transparent';
        }, 80);
      }
      nextPulse = Date.now() + pulseInterval;
    };

    this.calibratorTimer = setInterval(pulse, pulseInterval);

    // Tap capture
    if (circle) {
      circle.addEventListener('mousedown', (e) => {
        const now = Date.now();
        // Distance to previous or next pulse
        const diffToPrev = now - (nextPulse - pulseInterval);
        const diffToNext = now - nextPulse;
        const diff = Math.abs(diffToPrev) < Math.abs(diffToNext) ? diffToPrev : diffToNext;

        // Keep last 10 taps
        tapTimes.push(diff);
        if (tapTimes.length > 10) tapTimes.shift();

        // Calculate average offset
        const avg = tapTimes.reduce((a, b) => a + b, 0) / tapTimes.length;
        wizardOffset = Math.round(avg);

        if (valDisplay) {
          valDisplay.textContent = `${wizardOffset > 0 ? '+' : ''}${wizardOffset} ms`;
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        clearInterval(this.calibratorTimer);
        this.currentOffset = Math.max(-250, Math.min(250, wizardOffset));
        localStorage.setItem('ftp-game-offset-rhythm_game', String(this.currentOffset));
        this.renderMainUI();
      });
    }
  }

  destroy() {
    if (this.calibratorTimer) {
      clearInterval(this.calibratorTimer);
    }
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
  }
}
