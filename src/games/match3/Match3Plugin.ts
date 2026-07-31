import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';

export class Match3Plugin implements MiniGamePlugin {
  id = 'match3';
  name = 'Gem Match Cascade';
  subtitle = 'Match-3 gem swapping puzzle';
  description = 'Swap adjacent gems to align 3 or more matching colors in rows or columns to trigger explosive cascades.';
  version = '1.0.0';
  genre = 'Puzzle';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '2–5 min';
  category = 'Puzzle';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <path d="M6 3l6 6 6-6" />
      <path d="M12 9v12" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  private gridSize = 7;
  private grid: number[][] = [];
  private gemColors = ['#ef4444', '#38bdf8', '#10b981', '#f59e0b', '#a855f7'];
  private selected: [number, number] | null = null;
  private score = 0;
  private movesLeft = 20;
  private isGameOver = false;

  private cellSize = 0;
  private startX = 0;
  private startY = 0;

  private boundMouseDown: any;
  private boundTouchStart: any;
  private boundResize: any;

  launch(context: GameLaunchContext): void {
    if (window.setPanel) window.setPanel('game');
    const overlay = document.getElementById('bb-menu-overlay');
    if (overlay) overlay.style.display = 'none';

    const titleEl = document.getElementById('game-panel-title');
    const subtitleEl = document.getElementById('game-panel-subtitle');
    const iconEl = document.getElementById('game-panel-icon');
    const scoreLabel = document.getElementById('game-panel-score-label');
    const scoreVal = document.getElementById('bb-score-val');

    if (titleEl) titleEl.textContent = this.name;
    if (subtitleEl) subtitleEl.textContent = this.subtitle;
    if (scoreLabel) scoreLabel.textContent = 'Score';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.isRunning = true;
    this.resetBoard();
    this.resizeCanvas();

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundResize = this.resizeCanvas.bind(this);

    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    window.addEventListener('resize', this.boundResize);

    this.tick();
  }

  private resetBoard() {
    this.score = 0;
    this.movesLeft = 20;
    this.isGameOver = false;
    this.selected = null;

    this.grid = Array(7).fill(null).map(() => Array(7).fill(0).map(() => Math.floor(Math.random() * 5)));
    this.resolveMatches();

    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = '0';
  }

  private resizeCanvas() {
    if (!this.canvas) return;
    const container = document.getElementById('game-canvas-container');
    if (container) {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
    }
    const width = this.canvas.width;
    const height = this.canvas.height;

    this.cellSize = Math.min((width - 40) / 7, (height - 140) / 7, 42);
    this.startX = (width - 7 * this.cellSize) / 2;
    this.startY = (height - 7 * this.cellSize) / 2;
  }

  private handleTouchStart(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    this.processInputAt(touch.clientX - rect.left, touch.clientY - rect.top);
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.processInputAt(e.clientX - rect.left, e.clientY - rect.top);
  }

  private processInputAt(mx: number, my: number) {
    if (!this.canvas) return;

    if (this.isGameOver) {
      this.resetBoard(); return;
    }

    const col = Math.floor((mx - this.startX) / this.cellSize);
    const row = Math.floor((my - this.startY) / this.cellSize);

    if (col >= 0 && col < 7 && row >= 0 && row < 7) {
      if (this.selected === null) {
        this.selected = [row, col];
      } else {
        const [sr, sc] = this.selected;
        if (Math.abs(sr - row) + Math.abs(sc - col) === 1) {
          // Swap
          const temp = this.grid[sr][sc];
          this.grid[sr][sc] = this.grid[row][col];
          this.grid[row][col] = temp;

          const matched = this.resolveMatches();
          if (matched) {
            this.movesLeft--;
            if (this.movesLeft <= 0) this.isGameOver = true;
          } else {
            // Undo invalid swap
            this.grid[row][col] = this.grid[sr][sc];
            this.grid[sr][sc] = temp;
          }
        }
        this.selected = null;
      }
    }
  }

  private resolveMatches(): boolean {
    let matchedAny = false;
    let matches: [number, number][] = [];

    // Rows
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        const val = this.grid[r][c];
        if (val !== -1 && val === this.grid[r][c+1] && val === this.grid[r][c+2]) {
          matches.push([r, c], [r, c+1], [r, c+2]);
        }
      }
    }
    // Cols
    for (let c = 0; c < 7; c++) {
      for (let r = 0; r < 5; r++) {
        const val = this.grid[r][c];
        if (val !== -1 && val === this.grid[r+1][c] && val === this.grid[r+2][c]) {
          matches.push([r, c], [r+1, c], [r+2, c]);
        }
      }
    }

    if (matches.length > 0) {
      matchedAny = true;
      this.score += matches.length * 10;
      const scoreVal = document.getElementById('bb-score-val');
      if (scoreVal) scoreVal.textContent = String(this.score);

      // Remove matched
      for (const [r, c] of matches) {
        this.grid[r][c] = -1;
      }

      // Drop down
      for (let c = 0; c < 7; c++) {
        for (let r = 6; r >= 0; r--) {
          if (this.grid[r][c] === -1) {
            for (let nr = r - 1; nr >= 0; nr--) {
              if (this.grid[nr][c] !== -1) {
                this.grid[r][c] = this.grid[nr][c];
                this.grid[nr][c] = -1;
                break;
              }
            }
          }
        }
      }

      // Refill empty top
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
          if (this.grid[r][c] === -1) {
            this.grid[r][c] = Math.floor(Math.random() * 5);
          }
        }
      }
    }
    return matchedAny;
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

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const midX = canvas.width / 2;

    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isGameOver ? '#ef4444' : '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(this.isGameOver ? 'OUT OF MOVES! Tap to replay' : `Moves Left: ${this.movesLeft}`, midX, this.startY - 20);

    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const x = this.startX + c * this.cellSize;
        const y = this.startY + r * this.cellSize;
        const isSel = this.selected && this.selected[0] === r && this.selected[1] === c;

        ctx.fillStyle = isSel ? '#38bdf8' : '#1e293b';
        ctx.fillRect(x, y, this.cellSize - 1, this.cellSize - 1);

        const gemVal = this.grid[r][c];
        if (gemVal >= 0) {
          ctx.fillStyle = this.gemColors[gemVal];
          ctx.beginPath();
          ctx.arc(x + this.cellSize / 2, y + this.cellSize / 2, this.cellSize * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('resize', this.boundResize);
  }
}
