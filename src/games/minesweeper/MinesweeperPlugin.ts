import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';

export class MinesweeperPlugin implements MiniGamePlugin {
  id = 'minesweeper';
  name = 'Recall Minesweeper';
  subtitle = 'Intellectual mine detection & recognition';
  description = 'Deduce the locations of hidden mines across a retro-cyber grid. Test your recognition speeds and logical reasoning under time pressure with audio-synthesized sweeps and explosions.';
  version = '1.0.0';
  genre = 'Puzzle / Logic';
  estimatedSessionLength = '2–5 min';
  category = 'Puzzle';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  // Game configuration
  private cols = 9;
  private rows = 9;
  private minesCount = 10;
  private grid: Array<Array<{
    x: number;
    y: number;
    hasMine: boolean;
    revealed: boolean;
    flagged: boolean;
    neighborMines: number;
    exploding: boolean;
    explodeTime: number;
  }>> = [];

  private gameOver = false;
  private victory = false;
  private minesRemaining = 10;
  private startTime = 0;
  private timeElapsed = 0;
  private faceState: 'smile' | 'shock' | 'dead' | 'glasses' = 'smile';
  private firstClick = true;

  // Render metrics
  private cellSize = 36;
  private gridWidth = 0;
  private gridHeight = 0;
  private startX = 0;
  private startY = 0;

  // Particles for explosions
  private particles: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    size: number;
    alpha: number;
    life: number;
  }> = [];

  // Listeners
  private boundMouseDown: any;
  private boundTouchStart: any;
  private boundContextMenu: any;
  private boundResize: any;

  private mobileFlagMode = false;

  launch(context: GameLaunchContext): void {
    // 1. Swap panel to 'game'
    if (window.setPanel) {
      window.setPanel('game');
    }

    // Hide Blade Bedlam Specific menu overlay
    const overlay = document.getElementById('bb-menu-overlay');
    if (overlay) overlay.style.display = 'none';

    // 2. Customize Header
    const titleEl = document.getElementById('game-panel-title');
    const subtitleEl = document.getElementById('game-panel-subtitle');
    const iconEl = document.getElementById('game-panel-icon');
    const scoreLabel = document.getElementById('game-panel-score-label');
    const scoreVal = document.getElementById('bb-score-val');

    if (titleEl) titleEl.textContent = this.name;
    if (subtitleEl) subtitleEl.textContent = this.subtitle;
    if (scoreLabel) scoreLabel.textContent = 'Mines Left:';
    if (scoreVal) scoreVal.textContent = String(this.minesCount);
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    // Hide other Blade Bedlam panels
    const soundBtn = document.getElementById('bb-btn-sound');
    if (soundBtn) soundBtn.style.display = 'none';

    // 3. Initialize Canvas
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.isRunning = true;
    this.firstClick = true;
    this.gameOver = false;
    this.victory = false;
    this.particles = [];
    this.timeElapsed = 0;
    this.faceState = 'smile';

    // Select grid dimensions based on difficulty setting
    const diff = context.settings.difficulty || 'normal';
    if (diff === 'easy') {
      this.cols = 8; this.rows = 8; this.minesCount = 10;
    } else if (diff === 'hard') {
      this.cols = 16; this.rows = 16; this.minesCount = 40;
    } else {
      this.cols = 11; this.rows = 11; this.minesCount = 18;
    }
    this.minesRemaining = this.minesCount;

    this.resizeCanvas();
    this.initGrid();

    // Disable standard mobile gestures on canvas
    if (this.canvas) {
      this.canvas.style.touchAction = 'none';
    }

    // Add mobile toggle controls dynamically
    const container = document.getElementById('game-canvas-container');
    if (container) {
      const existing = document.getElementById('minesweeper-mobile-controls');
      if (existing) existing.remove();

      const controls = document.createElement('div');
      controls.id = 'minesweeper-mobile-controls';
      controls.style.cssText = 'position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%); display: flex; gap: 8px; z-index: 15; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); padding: 6px; border-radius: 30px; border: 1.5px solid var(--border); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.5);';
      controls.innerHTML = `
        <button id="ms-btn-reveal" style="border-radius: 20px; padding: 6px 16px; font-size: 12px; font-weight: 700; height: 32px; display: flex; align-items: center; gap: 6px; border: none; background: var(--accent); color: var(--surface); cursor: pointer; transition: all 0.2s;">
          <span>⛏️</span> Dig Mode
        </button>
        <button id="ms-btn-flag" style="border-radius: 20px; padding: 6px 16px; font-size: 12px; font-weight: 700; height: 32px; display: flex; align-items: center; gap: 6px; border: none; background: transparent; color: var(--text3); cursor: pointer; transition: all 0.2s;">
          <span>🚩</span> Flag Mode
        </button>
      `;
      container.appendChild(controls);

      const btnReveal = document.getElementById('ms-btn-reveal');
      const btnFlag = document.getElementById('ms-btn-flag');

      const setMode = (flagMode: boolean) => {
        this.mobileFlagMode = flagMode;
        if (btnReveal && btnFlag) {
          if (flagMode) {
            btnReveal.style.background = 'transparent';
            btnReveal.style.color = 'var(--text3)';
            btnFlag.style.background = 'var(--accent)';
            btnFlag.style.color = 'var(--surface)';
          } else {
            btnReveal.style.background = 'var(--accent)';
            btnReveal.style.color = 'var(--surface)';
            btnFlag.style.background = 'transparent';
            btnFlag.style.color = 'var(--text3)';
          }
        }
      };

      if (btnReveal) btnReveal.addEventListener('click', () => setMode(false));
      if (btnFlag) btnFlag.addEventListener('click', () => setMode(true));
    }

    // Bind event listeners
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundContextMenu = (e: MouseEvent) => e.preventDefault();
    this.boundResize = this.resizeCanvas.bind(this);

    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    this.canvas.addEventListener('contextmenu', this.boundContextMenu);
    window.addEventListener('resize', this.boundResize);

    // Start gameloop
    this.tick();
  }

  private initGrid() {
    this.grid = [];
    for (let r = 0; r < this.rows; r++) {
      const row = [];
      for (let c = 0; c < this.cols; c++) {
        row.push({
          x: c,
          y: r,
          hasMine: false,
          revealed: false,
          flagged: false,
          neighborMines: 0,
          exploding: false,
          explodeTime: 0
        });
      }
      this.grid.push(row);
    }
  }

  private generateMines(excludeCol: number, excludeRow: number) {
    let minesPlaced = 0;
    while (minesPlaced < this.minesCount) {
      const c = Math.floor(Math.random() * this.cols);
      const r = Math.floor(Math.random() * this.rows);
      
      // Exclude first click and surrounding 3x3 to guarantee opening
      const isExcluded = Math.abs(c - excludeCol) <= 1 && Math.abs(r - excludeRow) <= 1;

      if (!this.grid[r][c].hasMine && !isExcluded) {
        this.grid[r][c].hasMine = true;
        minesPlaced++;
      }
    }

    // Calculate neighbors
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.grid[r][c].hasMine) continue;
        let neighbors = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < this.rows && nc >= 0 && nc < this.cols) {
              if (this.grid[nr][nc].hasMine) neighbors++;
            }
          }
        }
        this.grid[r][c].neighborMines = neighbors;
      }
    }
  }

  private resizeCanvas() {
    if (!this.canvas) return;
    const container = document.getElementById('game-canvas-container');
    if (container) {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
    }

    // Calculate layout metrics
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Fit grid nicely inside container
    const maxGridW = width * 0.9;
    const maxGridH = height * 0.75;
    const cellW = maxGridW / this.cols;
    const cellH = maxGridH / this.rows;
    this.cellSize = Math.floor(Math.min(cellW, cellH, 44)); // cap at 44px for beauty

    this.gridWidth = this.cols * this.cellSize;
    this.gridHeight = this.rows * this.cellSize;
    this.startX = (width - this.gridWidth) / 2;
    this.startY = (height - this.gridHeight) / 2 + 10; // offset slightly for top stats panel
  }

  private handleTouchStart(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault(); // prevent browser pinch/zoom/scrolling behaviors
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const mx = touch.clientX - rect.left;
    const my = touch.clientY - rect.top;

    this.processInputAt(mx, my, this.mobileFlagMode ? 2 : 0);
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.canvas) return;

    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    this.processInputAt(mx, my, e.button);
  }

  private processInputAt(mx: number, my: number, button: number) {
    if (!this.canvas) return;

    // Check click on face/reset button at top (Always active, even during gameover/victory!)
    const faceX = this.canvas.width / 2;
    const faceY = this.startY - 35;
    const faceSize = 24; // larger click target for mobile
    if (Math.abs(mx - faceX) <= faceSize && Math.abs(my - faceY) <= faceSize) {
      this.playSynthSFX('click');
      this.firstClick = true;
      this.gameOver = false;
      this.victory = false;
      this.particles = [];
      this.timeElapsed = 0;
      this.faceState = 'smile';
      this.minesRemaining = this.minesCount;
      const scoreVal = document.getElementById('bb-score-val');
      if (scoreVal) scoreVal.textContent = String(this.minesRemaining);
      this.initGrid();
      return;
    }

    if (this.gameOver || this.victory) return;

    // Grid coordinates
    const gx = Math.floor((mx - this.startX) / this.cellSize);
    const gy = Math.floor((my - this.startY) / this.cellSize);

    if (gx >= 0 && gx < this.cols && gy >= 0 && gy < this.rows) {
      const cell = this.grid[gy][gx];
      
      if (button === 0) { // Left click / Dig mode
        if (cell.flagged || cell.revealed) return;
        this.faceState = 'shock';

        if (this.firstClick) {
          this.firstClick = false;
          this.startTime = Date.now();
          this.generateMines(gx, gy);
        }

        this.revealCell(gx, gy);
        this.checkGameStatus();
      } else if (button === 2) { // Right click / Flag mode
        if (cell.revealed) return;
        cell.flagged = !cell.flagged;
        this.minesRemaining += cell.flagged ? -1 : 1;
        const scoreVal = document.getElementById('bb-score-val');
        if (scoreVal) scoreVal.textContent = String(this.minesRemaining);
        this.playSynthSFX('flag');
      }
    }
  }

  private revealCell(c: number, r: number) {
    const cell = this.grid[r][c];
    cell.revealed = true;

    if (cell.hasMine) {
      this.triggerGameOver(c, r);
      return;
    }

    this.playSynthSFX('reveal');

    // If zero neighbors, sweep auto-reveal
    if (cell.neighborMines === 0) {
      const queue = [{ c, r }];
      while (queue.length > 0) {
        const curr = queue.shift()!;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nc = curr.c + dc;
            const nr = curr.r + dr;
            if (nc >= 0 && nc < this.cols && nr >= 0 && nr < this.rows) {
              const neighbor = this.grid[nr][nc];
              if (!neighbor.revealed && !neighbor.flagged && !neighbor.hasMine) {
                neighbor.revealed = true;
                if (neighbor.neighborMines === 0) {
                  queue.push({ c: nc, r: nr });
                }
              }
            }
          }
        }
      }
    }
  }

  private checkGameStatus() {
    let unrevealedSafeCells = 0;
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (!cell.hasMine && !cell.revealed) {
          unrevealedSafeCells++;
        }
      }
    }

    if (unrevealedSafeCells === 0) {
      this.victory = true;
      this.faceState = 'glasses';
      this.minesRemaining = 0;
      const scoreVal = document.getElementById('bb-score-val');
      if (scoreVal) scoreVal.textContent = '0';
      this.playSynthSFX('victory');
    } else if (this.faceState === 'shock') {
      setTimeout(() => { if (!this.gameOver && !this.victory) this.faceState = 'smile'; }, 150);
    }
  }

  private triggerGameOver(mineC: number, mineR: number) {
    this.gameOver = true;
    this.faceState = 'dead';
    this.playSynthSFX('explode');

    // Create explosion shockwave particles
    const cellX = this.startX + mineC * this.cellSize + this.cellSize / 2;
    const cellY = this.startY + mineR * this.cellSize + this.cellSize / 2;
    this.createExplosionParticles(cellX, cellY);

    // Reveal all mines
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.hasMine) {
          cell.revealed = true;
          // Cascade slight delays to other explosions
          if (r !== mineR || c !== mineC) {
            cell.exploding = true;
            cell.explodeTime = performance.now() + Math.random() * 800;
          }
        }
      }
    }
  }

  private createExplosionParticles(x: number, y: number) {
    const colors = ['#f43f5e', '#f97316', '#eab308', '#ffffff'];
    for (let i = 0; i < 40; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 4;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: colors[Math.floor(Math.random() * colors.length)],
        size: 2 + Math.random() * 4,
        alpha: 1.0,
        life: 0.8 + Math.random() * 0.4
      });
    }
  }

  private playSynthSFX(type: 'reveal' | 'flag' | 'click' | 'explode' | 'victory') {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      
      if (type === 'reveal') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(330, ctx.currentTime);
        osc.frequency.setValueAtTime(440, ctx.currentTime + 0.04);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
        osc.start();
        osc.stop(ctx.currentTime + 0.08);
      } else if (type === 'flag') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(180, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'click') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
        osc.start();
        osc.stop(ctx.currentTime + 0.03);
      } else if (type === 'explode') {
        // Red noise explosion rumble
        const bufferSize = ctx.sampleRate * 0.4;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
          const white = Math.random() * 2 - 1;
          data[i] = (lastOut + (0.02 * white)) / 1.02;
          lastOut = data[i];
          data[i] *= 3.5; // Amplify noise
        }
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, ctx.currentTime);
        filter.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.35);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        noise.start();
      } else if (type === 'victory') {
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 arpeggio
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.setValueAtTime(0.06, ctx.currentTime + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.25);
          osc.start(ctx.currentTime + idx * 0.08);
          osc.stop(ctx.currentTime + idx * 0.08 + 0.25);
        });
      }
    } catch(e) {}
  }

  private tick() {
    if (!this.isRunning) return;

    if (!this.gameOver && !this.victory && !this.firstClick) {
      this.timeElapsed = Math.floor((Date.now() - this.startTime) / 1000);
    }

    this.update();
    this.render();

    this.animationFrameId = requestAnimationFrame(this.tick.bind(this));
  }

  private update() {
    // Update exploding cell particles
    const now = performance.now();
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        if (cell.exploding && now >= cell.explodeTime) {
          cell.exploding = false;
          const cx = this.startX + c * this.cellSize + this.cellSize / 2;
          const cy = this.startY + r * this.cellSize + this.cellSize / 2;
          this.createExplosionParticles(cx, cy);
          this.playSynthSFX('reveal');
        }
      }
    }

    // Particle physics
    this.particles = this.particles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // gravity
      p.life -= 0.016;
      p.alpha = Math.max(0, p.life);
      return p.life > 0;
    });
  }

  private render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    // Clear background (neon cyber Grid vibe)
    ctx.fillStyle = '#0a0915';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Draw Dashboard Header (Score / Face / Time)
    const headerY = this.startY - 35;
    
    // Timer Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(this.startX, headerY - 18, 70, 32, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 14px "DM Mono", monospace';
    ctx.fillStyle = '#cda250';
    ctx.textAlign = 'center';
    ctx.fillText(String(this.minesRemaining).padStart(3, '0'), this.startX + 35, headerY + 4);

    // Elapsed Time Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.roundRect(this.startX + this.gridWidth - 70, headerY - 18, 70, 32, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0ea5e9'; // Cool blue time
    ctx.fillText(String(Math.min(999, this.timeElapsed)).padStart(3, '0'), this.startX + this.gridWidth - 35, headerY + 4);

    // Interactive Status Face Button
    const faceX = canvas.width / 2;
    ctx.fillStyle = 'rgba(205, 162, 80, 0.15)';
    ctx.strokeStyle = '#cda250';
    ctx.beginPath();
    ctx.arc(faceX, headerY, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Draw Face Emoji state
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let faceEmoji = '🙂';
    if (this.faceState === 'shock') faceEmoji = '😮';
    if (this.faceState === 'dead') faceEmoji = '💀';
    if (this.faceState === 'glasses') faceEmoji = '😎';
    ctx.fillText(faceEmoji, faceX, headerY);

    // 2. Draw Minesweeper Grid
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r][c];
        const cx = this.startX + c * this.cellSize;
        const cy = this.startY + r * this.cellSize;

        // Draw Cell Box
        if (cell.revealed) {
          ctx.fillStyle = '#111022'; // Revealed background
          ctx.fillRect(cx + 1, cy + 1, this.cellSize - 2, this.cellSize - 2);

          // Draw Inner Shadow/Accent lines for cells
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.strokeRect(cx, cy, this.cellSize, this.cellSize);

          if (cell.hasMine) {
            // Draw detonated Mine
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(cx + this.cellSize/2, cy + this.cellSize/2, this.cellSize/4, 0, Math.PI * 2);
            ctx.fill();

            // Mine spikes
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.strokeRect(cx + 6, cy + 6, this.cellSize - 12, this.cellSize - 12);
          } else if (cell.neighborMines > 0) {
            // Draw Neighbor count with custom vivid color scale
            const countColors = [
              '', '#38bdf8', '#22c55e', '#f43f5e', '#818cf8', 
              '#ec4899', '#06b6d4', '#eab308', '#ffffff'
            ];
            ctx.font = 'bold 15px "Space Grotesk", sans-serif';
            ctx.fillStyle = countColors[cell.neighborMines] || '#ffffff';
            ctx.fillText(String(cell.neighborMines), cx + this.cellSize/2, cy + this.cellSize/2);
          }
        } else {
          // Unrevealed cells - Raised retro cell styling
          ctx.fillStyle = '#1e1c3a'; // 3D Block face
          ctx.fillRect(cx + 1, cy + 1, this.cellSize - 2, this.cellSize - 2);

          // 3D Bevel Lines
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy + this.cellSize);
          ctx.lineTo(cx, cy);
          ctx.lineTo(cx + this.cellSize, cy);
          ctx.stroke();

          ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
          ctx.beginPath();
          ctx.moveTo(cx + this.cellSize, cy);
          ctx.lineTo(cx + this.cellSize, cy + this.cellSize);
          ctx.lineTo(cx, cy + this.cellSize);
          ctx.stroke();

          if (cell.flagged) {
            // Draw Flag icon
            ctx.fillStyle = '#f43f5e'; // Bright warning red flag
            ctx.beginPath();
            ctx.moveTo(cx + this.cellSize/3, cy + this.cellSize/4);
            ctx.lineTo(cx + this.cellSize * 2/3, cy + this.cellSize * 3/8);
            ctx.lineTo(cx + this.cellSize/3, cy + this.cellSize/2);
            ctx.fill();

            // flagpole
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(cx + this.cellSize/3, cy + this.cellSize/4);
            ctx.lineTo(cx + this.cellSize/3, cy + this.cellSize * 3/4);
            ctx.stroke();
          }
        }
      }
    }

    // 3. Draw explosion particles
    this.particles.forEach(p => {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1.0; // reset

    // 4. Game-over text overlay
    if (this.gameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      ctx.font = 'bold 24px "Fraunces", serif';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'center';
      ctx.fillText('COLOSSEUM MINE DETONATED', canvas.width / 2, this.startY + this.gridHeight + 35);
      
      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.fillStyle = 'var(--text3)';
      ctx.fillText('Click the yellow status face to retry the logic grid.', canvas.width / 2, this.startY + this.gridHeight + 55);
    } else if (this.victory) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = 'bold 24px "Fraunces", serif';
      ctx.fillStyle = '#10b981';
      ctx.textAlign = 'center';
      ctx.fillText('RECALL GRID COMPLETED!', canvas.width / 2, this.startY + this.gridHeight + 35);

      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.fillStyle = 'var(--text2)';
      ctx.fillText('Perfect logical deduction. Press the cool face to play again.', canvas.width / 2, this.startY + this.gridHeight + 55);
    }
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // Remove dynamic mobile controls
    const controls = document.getElementById('minesweeper-mobile-controls');
    if (controls) {
      controls.remove();
    }

    // Unbind listeners
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
      this.canvas.removeEventListener('contextmenu', this.boundContextMenu);
    }
    window.removeEventListener('resize', this.boundResize);

    // Restore original panel header attributes back to default Blade Bedlam
    const titleEl = document.getElementById('game-panel-title');
    const subtitleEl = document.getElementById('game-panel-subtitle');
    const scoreLabel = document.getElementById('game-panel-score-label');
    const scoreVal = document.getElementById('bb-score-val');
    const iconEl = document.getElementById('game-panel-icon');

    if (titleEl) titleEl.textContent = 'Blade Bedlam';
    if (subtitleEl) subtitleEl.textContent = 'Action Slasher Clone · Custom Coded';
    if (scoreLabel) scoreLabel.textContent = 'Score:';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) {
      iconEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 18px; height: 18px;">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 12h4M10 10v4M15 11h.01M18 13h.01" />
        </svg>
      `;
    }

    const soundBtn = document.getElementById('bb-btn-sound');
    if (soundBtn) soundBtn.style.display = 'inline-flex';
  }
}
