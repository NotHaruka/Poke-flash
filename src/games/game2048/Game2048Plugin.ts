import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { GameAudioEngine } from '../core/GameAudioEngine';

export class Game2048Plugin implements MiniGamePlugin {
  id = 'game_2048';
  name = 'Recall 2048';
  subtitle = 'Sliding tile consolidation & strategic thinking';
  description = 'Slide grid tiles in any cardinal direction. Combine tiles of identical value to construct the ultimate 2048 core, training your strategic planning and rapid visual recognition.';
  version = '1.0.0';
  genre = 'Puzzle / Sliding Board';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '3–8 min';
  category = 'Puzzle';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 17v-4h6v4M9 13h6" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private isPaused = false;
  private overlayManager: GameOverlayManager | null = null;
  private context: GameLaunchContext | null = null;

  // Board logic
  private size = 4;
  private board: number[][] = [];
  private score = 0;
  private highScore = 0;
  private isGameOver = false;
  private isVictory = false;
  private hasWonTriggered = false;

  // Undo history
  private history: Array<{ board: number[][]; score: number }> = [];

  // Tile slide animations state
  private tiles: Array<{
    r: number;
    c: number;
    targetR: number;
    targetC: number;
    val: number;
    animProgress: number; // 0 to 1
    isNew: boolean;
    isMerged: boolean;
  }> = [];

  // Metrics
  private boardSize = 0;
  private cellSize = 0;
  private cellGap = 12;
  private startX = 0;
  private startY = 0;

  // Touch handlers
  private touchStartX = 0;
  private touchStartY = 0;

  // Listeners
  private boundKeyDown: any;
  private boundTouchStart: any;
  private boundTouchEnd: any;
  private boundResize: any;

  launch(context: GameLaunchContext): void {
    this.context = context;
    if (window.setPanel) {
      window.setPanel('game');
    }

    const overlay = document.getElementById('bb-menu-overlay');
    if (overlay) overlay.style.display = 'none';

    // Customize Header
    const titleEl = document.getElementById('game-panel-title');
    const subtitleEl = document.getElementById('game-panel-subtitle');
    const iconEl = document.getElementById('game-panel-icon');
    const scoreLabel = document.getElementById('game-panel-score-label');
    const scoreVal = document.getElementById('bb-score-val');

    if (titleEl) titleEl.textContent = this.name;
    if (subtitleEl) subtitleEl.textContent = this.subtitle;
    if (scoreLabel) scoreLabel.textContent = 'Score:';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    // Load High Score
    const savedHighScore = localStorage.getItem('ftp-2048-highscore');
    this.highScore = savedHighScore ? Number(savedHighScore) : 0;

    // Setup Mobile Undo Bar
    let ctrlBar = document.getElementById('g2048-mobile-bar');
    if (!ctrlBar) {
      ctrlBar = document.createElement('div');
      ctrlBar.id = 'g2048-mobile-bar';
      ctrlBar.style.cssText = 'position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); display: flex; gap: 10px; z-index: 20;';
      ctrlBar.innerHTML = `
        <button id="g2048-undo-btn" class="btn" style="padding: 8px 18px; font-size: 13px; font-weight: 700; border-radius: 20px; background: rgba(255, 255, 255, 0.08); color: var(--text); border: 1.5px solid var(--border2); box-shadow: var(--shadow-md);">
          ↩ Undo Move
        </button>
      `;
      const canvasContainer = document.getElementById('game-canvas-container');
      if (canvasContainer) canvasContainer.appendChild(ctrlBar);

      document.getElementById('g2048-undo-btn')?.addEventListener('click', () => {
        this.undo();
      });
    }

    // Canvas init
    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.isRunning = true;
    this.isPaused = false;
    this.isGameOver = false;
    this.isVictory = false;
    this.hasWonTriggered = false;
    this.score = 0;
    this.history = [];

    this.resizeCanvas();
    this.initBoard();

    // Initialize GameOverlayManager
    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onPause: () => { this.isPaused = true; },
      onResume: () => { this.isPaused = false; },
      onRestart: () => { this.restartGame(); },
      onShowInstructions: () => { this.showHelpOverlay(); },
      onExit: () => { if (this.context?.onExit) this.context.onExit(); }
    });

    // Event bindings
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundTouchStart = (e: TouchEvent) => {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
    };
    this.boundTouchEnd = (e: TouchEvent) => {
      if (this.isGameOver || this.isPaused) return;
      if (e.changedTouches.length === 0) return;
      const dx = e.changedTouches[0].clientX - this.touchStartX;
      const dy = e.changedTouches[0].clientY - this.touchStartY;
      const minDistance = 40;

      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > minDistance) this.move('right');
        else if (dx < -minDistance) this.move('left');
      } else {
        if (dy > minDistance) this.move('down');
        else if (dy < -minDistance) this.move('up');
      }
    };
    this.boundResize = this.resizeCanvas.bind(this);

    window.addEventListener('keydown', this.boundKeyDown);
    if (this.canvas) {
      this.canvas.style.touchAction = 'none';
    }
    this.canvas?.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    this.canvas?.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    window.addEventListener('resize', this.boundResize);

    // Show Instructions First
    this.showHelpOverlay();

    // Gameloop
    this.tick();
  }

  private showHelpOverlay() {
    this.isPaused = true;
    this.overlayManager?.showInstructions({
      title: this.name,
      subtitle: this.subtitle,
      description: this.description,
      objective: 'Merge tiles with identical values to synthesize the ultimate 2048 core.',
      controls: [
        { key: 'Arrow Keys / WASD', action: 'Slide Tiles' },
        { key: 'Swipe (Touch)', action: 'Slide on Touchscreens' },
        { key: 'U', action: 'Undo Last Move' },
        { key: 'P / ESC', action: 'Pause Game' }
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { label: 'Score', value: this.score, id: 'score' },
          { label: 'High Score', value: this.highScore, id: 'high' }
        ]);
        GameAudioEngine.getInstance().playSFX('click');
        this.isPaused = false;
      }
    });
  }

  private restartGame() {
    this.overlayManager?.hideResults();
    this.overlayManager?.resume();
    this.isGameOver = false;
    this.isVictory = false;
    this.hasWonTriggered = false;
    this.score = 0;
    this.history = [];
    this.initBoard();
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = '0';
    this.overlayManager?.updateStat('score', 0);
    this.overlayManager?.updateStat('high', this.highScore);
    GameAudioEngine.getInstance().playSFX('click');
  }

  private initBoard() {
    this.board = Array(this.size).fill(0).map(() => Array(this.size).fill(0));
    this.spawnTile();
    this.spawnTile();
  }

  private spawnTile() {
    const emptyCells: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.board[r][c] === 0) {
          emptyCells.push({ r, c });
        }
      }
    }

    if (emptyCells.length > 0) {
      const cell = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      // 90% chance of 2, 10% chance of 4
      const val = Math.random() < 0.9 ? 2 : 4;
      this.board[cell.r][cell.c] = val;
    }
  }

  private resizeCanvas() {
    if (!this.canvas) return;
    const container = document.getElementById('game-canvas-container');
    if (container) {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
    }

    // Centered layout calculations
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Board sized at 70% of min dimension
    this.boardSize = Math.min(width * 0.85, height * 0.7, 360);
    this.startX = (width - this.boardSize) / 2;
    this.startY = (height - this.boardSize) / 2 + 10;
    this.cellGap = this.boardSize * 0.035;
    this.cellSize = (this.boardSize - this.cellGap * (this.size + 1)) / this.size;
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (!this.isGameOver && this.overlayManager) {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
          this.overlayManager.pause();
        } else {
          this.overlayManager.resume();
        }
      }
      return;
    }

    if (this.isGameOver || this.isPaused) return;

    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      this.move('up');
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      this.move('down');
    } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      this.move('left');
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      this.move('right');
    } else if (e.key === 'u' || e.key === 'U' || (e.key === 'z' && e.ctrlKey)) {
      e.preventDefault();
      this.undo();
    }
  }

  private saveState() {
    // Keep max 5 history moves
    if (this.history.length >= 5) {
      this.history.shift();
    }
    const clonedBoard = this.board.map(row => [...row]);
    this.history.push({ board: clonedBoard, score: this.score });
  }

  private undo() {
    if (this.history.length === 0 || this.isPaused) return;
    const previous = this.history.pop()!;
    this.board = previous.board;
    this.score = previous.score;
    this.isGameOver = false;
    this.isVictory = false;
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.score);
    this.overlayManager?.updateStat('score', this.score);
    this.overlayManager?.updateStat('high', this.highScore);
    GameAudioEngine.getInstance().playSFX('click');
  }

  private move(dir: 'up' | 'down' | 'left' | 'right') {
    let moved = false;
    let scoreGained = 0;
    
    // Save state before move
    this.saveState();

    const cloneBefore = this.board.map(row => [...row]);

    // Slide implementation
    if (dir === 'left' || dir === 'right') {
      for (let r = 0; r < this.size; r++) {
        let row = cloneBefore[r].filter(val => val !== 0);
        
        if (dir === 'right') row.reverse();

        // Combine
        const newRow: number[] = [];
        for (let i = 0; i < row.length; i++) {
          if (i < row.length - 1 && row[i] === row[i + 1]) {
            const mergedVal = row[i] * 2;
            newRow.push(mergedVal);
            scoreGained += mergedVal;
            i++; // skip next tile
          } else {
            newRow.push(row[i]);
          }
        }

        // Pad with zeros
        while (newRow.length < this.size) {
          newRow.push(0);
        }

        if (dir === 'right') newRow.reverse();

        // Check if row changed
        for (let c = 0; c < this.size; c++) {
          if (this.board[r][c] !== newRow[c]) {
            moved = true;
          }
          this.board[r][c] = newRow[c];
        }
      }
    } else { // UP or DOWN
      for (let c = 0; c < this.size; c++) {
        let col: number[] = [];
        for (let r = 0; r < this.size; r++) {
          if (cloneBefore[r][c] !== 0) col.push(cloneBefore[r][c]);
        }

        if (dir === 'down') col.reverse();

        const newCol: number[] = [];
        for (let i = 0; i < col.length; i++) {
          if (i < col.length - 1 && col[i] === col[i + 1]) {
            const mergedVal = col[i] * 2;
            newCol.push(mergedVal);
            scoreGained += mergedVal;
            i++;
          } else {
            newCol.push(col[i]);
          }
        }

        while (newCol.length < this.size) {
          newCol.push(0);
        }

        if (dir === 'down') newCol.reverse();

        for (let r = 0; r < this.size; r++) {
          if (this.board[r][c] !== newCol[r]) {
            moved = true;
          }
          this.board[r][c] = newCol[r];
        }
      }
    }

    if (moved) {
      this.score += scoreGained;
      this.spawnTile();
      this.updateHighscores();
      this.checkGameOver();
      
      const scoreVal = document.getElementById('bb-score-val');
      if (scoreVal) scoreVal.textContent = String(this.score);
      this.overlayManager?.updateStat('score', this.score);
      this.overlayManager?.updateStat('high', this.highScore);

      // Audio feedback
      if (scoreGained > 0) {
        GameAudioEngine.getInstance().playSFX('powerup');
      } else {
        GameAudioEngine.getInstance().playSFX('step');
      }
    } else {
      // Discard saved state if no movement actually happened
      this.history.pop();
    }
  }

  private updateHighscores() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('ftp-2048-highscore', String(this.highScore));
    }
  }

  private checkGameOver() {
    // 1. Check for 2048 tiles
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.board[r][c] === 2048 && !this.hasWonTriggered) {
          this.isVictory = true;
          this.hasWonTriggered = true;
          this.triggerResults(true);
          return;
        }
      }
    }

    // 2. Check empty cells remaining
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        if (this.board[r][c] === 0) return;
      }
    }

    // 3. Check for adjacencies
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const val = this.board[r][c];
        if (r < this.size - 1 && val === this.board[r + 1][c]) return;
        if (c < this.size - 1 && val === this.board[r][c + 1]) return;
      }
    }

    this.isGameOver = true;
    this.triggerResults(false);
  }

  private triggerResults(won: boolean) {
    if (won) {
      GameAudioEngine.getInstance().playSFX('win');
    } else {
      GameAudioEngine.getInstance().playSFX('lose');
    }

    this.overlayManager?.showResults({
      title: won ? 'CORE SYNTHESIZED' : 'GRID EXHAUSTED',
      subtitle: won ? 'You created a 2048 core!' : 'No more valid sliding moves exist.',
      isWin: won,
      score: this.score,
      highScore: this.highScore,
      stats: [
        { label: 'Max Value', value: Math.max(...this.board.map(row => Math.max(...row))) }
      ],
      onRestart: () => {
        this.restartGame();
      },
      onExit: () => {
        if (this.context?.onExit) this.context.onExit();
      }
    });
  }

  private playSynthSFX(type: 'slide' | 'merge' | 'undo' | 'gameover' | 'victory') {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();

      if (type === 'slide') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(261.63, ctx.currentTime); // C4
        osc.frequency.exponentialRampToValueAtTime(329.63, ctx.currentTime + 0.05); // E4 slide up
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
        osc.start();
        osc.stop(ctx.currentTime + 0.06);
      } else if (type === 'merge') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime); // A4 Chime
        osc.frequency.setValueAtTime(554.37, ctx.currentTime + 0.04); // C#5 chord step
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
        osc.start();
        osc.stop(ctx.currentTime + 0.12);
      } else if (type === 'undo') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(329.63, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'gameover') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.setValueAtTime(146.83, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
        osc.start();
        osc.stop(ctx.currentTime + 0.4);
      } else if (type === 'victory') {
        const freqs = [523.25, 659.25, 783.99, 1046.50, 1318.51]; // C5, E5, G5, C6, E6
        freqs.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
          gain.gain.setValueAtTime(0, ctx.currentTime);
          gain.gain.setValueAtTime(0.05, ctx.currentTime + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.3);
          osc.start(ctx.currentTime + idx * 0.08);
          osc.stop(ctx.currentTime + idx * 0.08 + 0.3);
        });
      }
    } catch(e) {}
  }

  private tick() {
    if (!this.isRunning) return;

    this.render();

    this.animationFrameId = requestAnimationFrame(this.tick.bind(this));
  }

  private render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    // Dark cyberpunk backgrounds
    ctx.fillStyle = '#0a0915';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Render Dashboard Top (Scores)
    const headerY = this.startY - 35;
    
    // High Score Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(this.startX + this.boardSize - 120, headerY - 18, 120, 32, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = '8px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'var(--text3)';
    ctx.textAlign = 'center';
    ctx.fillText('HIGH SCORE', this.startX + this.boardSize - 60, headerY - 6);

    ctx.font = 'bold 13px "DM Mono", monospace';
    ctx.fillStyle = '#0ea5e9';
    ctx.fillText(String(this.highScore), this.startX + this.boardSize - 60, headerY + 8);

    // Undo Helper Button indicator
    ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'var(--text3)';
    ctx.textAlign = 'left';
    ctx.fillText('Press [U] to UNDO last move', this.startX, headerY + 4);

    // 2. Render Board Outer Grid Container
    ctx.fillStyle = '#14122d';
    ctx.beginPath();
    ctx.roundRect(this.startX, this.startY, this.boardSize, this.boardSize, 12);
    ctx.fill();

    // 3. Render Slots and Active Tiles
    for (let r = 0; r < this.size; r++) {
      for (let c = 0; c < this.size; c++) {
        const val = this.board[r][c];
        const cellX = this.startX + this.cellGap + c * (this.cellSize + this.cellGap);
        const cellY = this.startY + this.cellGap + r * (this.cellSize + this.cellGap);

        // Grid Background Placeholder Slots
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.beginPath();
        ctx.roundRect(cellX, cellY, this.cellSize, this.cellSize, 8);
        ctx.fill();

        if (val > 0) {
          // Rich aesthetic tile styling
          ctx.fillStyle = this.getTileColor(val);
          ctx.beginPath();
          ctx.roundRect(cellX, cellY, this.cellSize, this.cellSize, 8);
          ctx.fill();

          // Border outlines for bigger blocks (cyber tech theme)
          if (val >= 256) {
            ctx.strokeStyle = '#cda250';
            ctx.lineWidth = 2;
            ctx.stroke();
          }

          // Tile text
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = val <= 4 ? 'var(--text)' : '#ffffff';

          let fs = this.cellSize * 0.42;
          if (val >= 100 && val < 1000) fs = this.cellSize * 0.36;
          else if (val >= 1000) fs = this.cellSize * 0.28;

          ctx.font = `bold ${fs}px "Space Grotesk", sans-serif`;
          ctx.fillText(String(val), cellX + this.cellSize / 2, cellY + this.cellSize / 2);
        }
      }
    }

    // Overlays
    if (this.isPaused) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  private getTileColor(val: number): string {
    const palette: Record<number, string> = {
      2: '#1e1b4b',    // deep purple/indigo
      4: '#2e1065',    // dark fuchsia/grape
      8: '#311042',    // violet glow
      16: '#0f172a',   // dark steel
      32: '#0ea5e9',   // bright cyan
      64: '#0284c7',   // marine
      128: '#3b82f6',  // neon blue
      256: '#10b981',  // emerald
      512: '#f59e0b',  // warning yellow
      1024: '#ec4899', // rose pink
      2048: '#e11d48'  // radiant ruby
    };
    return palette[val] || '#3f3f46';
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.overlayManager?.destroy();

    // Unbind
    window.removeEventListener('keydown', this.boundKeyDown);
    if (this.canvas) {
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
      this.canvas.removeEventListener('touchend', this.boundTouchEnd);
    }
    window.removeEventListener('resize', this.boundResize);

    const ctrlBar = document.getElementById('g2048-mobile-bar');
    if (ctrlBar) ctrlBar.remove();

    // Restore original panel header attributes
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
  }
}