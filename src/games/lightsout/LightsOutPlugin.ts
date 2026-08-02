import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { resetGameCanvas } from '../../game.js';
import { GameJuice } from '../core/GameJuice';
import { GameAudioEngine } from '../core/GameAudioEngine';

export class LightsOutPlugin implements MiniGamePlugin {
  id = 'lightsout';
  name = 'Lights Out Logic';
  subtitle = 'Grid toggle puzzle';
  description = 'Toggle matrix lights to turn off all nodes on the board. Each tap flips the target and all adjacent cross neighbors.';
  version = '1.0.0';
  genre = 'Puzzle';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '1–4 min';
  category = 'Puzzle';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v18M3 12h18" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private overlayManager: GameOverlayManager | null = null;
  private juice = new GameJuice();

  private gridSize = 5;
  private grid: boolean[][] = [];
  private moves = 0;
  private isWon = false;
  private statusMessage = 'Turn off all lit nodes!';

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
    if (scoreLabel) scoreLabel.textContent = 'Moves';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onRestart: () => this.generatePuzzle()
    });

    this.overlayManager.showInstructions({
      title: 'LIGHTS OUT LOGIC',
      subtitle: 'Matrix Grid Puzzle',
      description: 'Toggle matrix lights to turn off all nodes on the board. Each tap flips the target and all adjacent cross neighbors.',
      objective: 'Turn off all glowing yellow nodes on the 5x5 grid.',
      controls: [
        { key: 'Tap Cell', action: 'Flip cell and 4 adjacent cross neighbors' }
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { id: 'moves', label: 'Moves', value: '0' }
        ]);
        this.startGame();
        this.juice.reset();
        this.juice.startCountdown(() => {});
      }
    });
  }

  private startGame() {
    this.isRunning = true;
    this.generatePuzzle();
    this.resizeCanvas();

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundResize = this.resizeCanvas.bind(this);

    if (this.canvas) {
      this.canvas.style.touchAction = 'none';
      this.canvas.addEventListener('mousedown', this.boundMouseDown);
      this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    }
    window.addEventListener('resize', this.boundResize);

    this.tick();
  }

  private generatePuzzle() {
    this.grid = Array(5).fill(null).map(() => Array(5).fill(false));
    this.moves = 0;
    this.isWon = false;
    this.statusMessage = 'Turn off all lit nodes!';
    this.overlayManager?.updateStat('moves', 0);

    // Guarantee solvable by starting from all off and simulating 8 random taps
    for (let i = 0; i < 8; i++) {
      const r = Math.floor(Math.random() * 5);
      const c = Math.floor(Math.random() * 5);
      this.toggleCell(r, c, false);
    }

    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = '0';
  }

  private toggleCell(r: number, c: number, countMove = true) {
    const dirs = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 5 && nc >= 0 && nc < 5) {
        this.grid[nr][nc] = !this.grid[nr][nc];
      }
    }
    if (countMove) {
      this.moves++;
      this.overlayManager?.updateStat('moves', this.moves);
      const scoreVal = document.getElementById('bb-score-val');
      if (scoreVal) scoreVal.textContent = String(this.moves);

      const cx = this.startX + c * this.cellSize + this.cellSize / 2;
      const cy = this.startY + r * this.cellSize + this.cellSize / 2;
      GameAudioEngine.getInstance().playSFX('pop');
      this.juice.spawnExplosion(cx, cy, { count: 8, color: '#f59e0b', sizeRange: [2, 5], speedRange: [2, 5] });
      this.juice.shake(2);

      this.checkWin();
    }
  }

  private checkWin() {
    const allOff = this.grid.every(row => row.every(cell => !cell));
    if (allOff && !this.isWon) {
      this.isWon = true;
      this.statusMessage = 'ALL LIGHTS OFF!';
      GameAudioEngine.getInstance().playSFX('win');
      this.juice.spawnConfetti(this.canvas?.width || 400, this.canvas?.height || 600);
      this.juice.bounceZoom(1.12);
      this.juice.shake(10);
      setTimeout(() => {
        this.overlayManager?.showResults({
          title: 'PUZZLE CLEARED! 💡',
          subtitle: `You turned off all lights in ${this.moves} moves!`,
          isWin: true,
          stats: [
            { label: 'Total Moves', value: String(this.moves) }
          ],
          onRestart: () => {
            this.overlayManager?.hideResults();
            this.generatePuzzle();
          }
        });
      }, 300);
    }
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

    this.cellSize = Math.min((width - 60) / 5, (height - 140) / 5, 52);
    this.startX = (width - 5 * this.cellSize) / 2;
    this.startY = (height - 5 * this.cellSize) / 2 - 10;
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

    if (this.isWon) {
      this.generatePuzzle();
      return;
    }

    const col = Math.floor((mx - this.startX) / this.cellSize);
    const row = Math.floor((my - this.startY) / this.cellSize);

    if (col >= 0 && col < 5 && row >= 0 && row < 5) {
      this.toggleCell(row, col, true);
    }
  }

  private tick() {
    if (!this.isRunning) return;
    this.juice.update(1.0);
    this.render();
    this.animationFrameId = requestAnimationFrame(this.tick.bind(this));
  }

  private render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.juice.applyCameraTransforms(ctx, canvas.width, canvas.height);

    const midX = canvas.width / 2;

    ctx.font = 'bold 13px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isWon ? '#10b981' : '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(this.statusMessage, midX, this.startY - 25);

    // Matrix
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        const x = this.startX + c * this.cellSize;
        const y = this.startY + r * this.cellSize;
        const isOn = this.grid[r][c];

        ctx.fillStyle = isOn ? '#f59e0b' : '#1e293b';
        ctx.beginPath();
        ctx.roundRect(x + 4, y + 4, this.cellSize - 8, this.cellSize - 8, 8);
        ctx.fill();
        ctx.strokeStyle = isOn ? '#fbbf24' : '#334155';
        ctx.stroke();

        if (isOn) {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
          ctx.beginPath(); ctx.arc(x + this.cellSize/2, y + this.cellSize/2, this.cellSize * 0.2, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    this.juice.restoreCameraTransforms(ctx);
    this.juice.draw(ctx);
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('resize', this.boundResize);
    if (this.overlayManager) {
      this.overlayManager.destroy();
      this.overlayManager = null;
    }
  }
}
