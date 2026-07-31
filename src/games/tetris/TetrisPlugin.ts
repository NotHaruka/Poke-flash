import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { GameAudioEngine } from '../core/GameAudioEngine';

type TetrominoType = 'I' | 'J' | 'L' | 'O' | 'S' | 'T' | 'Z';

interface Tetromino {
  type: TetrominoType;
  matrix: number[][];
  color: string;
  x: number;
  y: number;
}

export class TetrisPlugin implements MiniGamePlugin {
  id = 'tetris';
  name = 'Recall Block Stacker';
  subtitle = 'Spatial arrangement & line clears';
  description = 'Align and rotate falling block matrix pieces to complete full horizontal line clears. Build spatial dexterity, manage line pressure, and chase high-score multipliers.';
  version = '1.0.0';
  genre = 'Arcade';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '3–6 min';
  category = 'Arcade';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <rect x="4" y="14" width="5" height="5" rx="1"/>
      <rect x="9" y="14" width="5" height="5" rx="1"/>
      <rect x="14" y="14" width="5" height="5" rx="1"/>
      <rect x="9" y="9" width="5" height="5" rx="1"/>
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private isPaused = false;
  private isGameOver = false;

  private grid: string[][] = Array(20).fill(null).map(() => Array(10).fill('')); // 20 rows, 10 cols
  private currentPiece: Tetromino | null = null;
  private nextPiece: Tetromino | null = null;

  private score = 0;
  private linesCleared = 0;
  private level = 1;
  private dropInterval = 800; // ms per drop
  private lastDropTime = 0;

  private overlayManager: GameOverlayManager | null = null;
  private context: GameLaunchContext | null = null;

  // Layout metrics
  private boardWidth = 0;
  private boardHeight = 0;
  private cellSize = 0;
  private startX = 0;
  private startY = 0;

  // Listeners
  private boundMouseDown: any;
  private boundTouchStart: any;
  private boundKeyDown: any;
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

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.isRunning = true;
    this.isPaused = false;
    this.isGameOver = false;

    // Initialize GameOverlayManager
    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onPause: () => {
        this.isPaused = true;
      },
      onResume: () => {
        this.isPaused = false;
        this.lastDropTime = performance.now();
      },
      onRestart: () => {
        this.restartGame();
      },
      onShowInstructions: () => {
        this.showHelpOverlay();
      },
      onExit: () => {
        if (this.context?.onExit) this.context.onExit();
      }
    });

    this.resizeCanvas();

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundResize = this.resizeCanvas.bind(this);

    if (this.canvas) {
      this.canvas.style.touchAction = 'none';
      this.canvas.addEventListener('mousedown', this.boundMouseDown);
      this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    }
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('resize', this.boundResize);

    this.showHelpOverlay();
    this.tick(performance.now());
  }

  private showHelpOverlay() {
    this.isPaused = true;
    this.overlayManager?.showInstructions({
      title: 'RECALL BLOCK STACKER',
      subtitle: 'Spatial Arrangement & Line Clears',
      description: 'Align and rotate falling block matrix pieces to complete full horizontal line clears. Build spatial dexterity and clear the grid!',
      objective: 'Clear as many lines as possible and reach high scores.',
      controls: [
        { key: 'Arrow Left / Right', action: 'Move falling piece' },
        { key: 'Arrow Up', action: 'Rotate piece' },
        { key: 'Arrow Down', action: 'Soft drop' },
        { key: 'Space', action: 'Hard drop' },
        { key: 'P / Esc', action: 'Pause / Resume game' }
      ],
      rules: [
        'Complete full horizontal rows to clear them and score points.',
        'Clearing multiple rows simultaneously grants high-score multipliers.',
        'The game speed increases with your levels.'
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { label: 'Score', value: 0, id: 'score' },
          { label: 'Lines', value: 0, id: 'lines' },
          { label: 'Level', value: 1, id: 'level' }
        ]);
        this.isPaused = false;
        this.startNewGame();
        GameAudioEngine.getInstance().playSFX('click');
        this.lastDropTime = performance.now();
      }
    });
  }

  private restartGame() {
    this.overlayManager?.hideResults();
    this.overlayManager?.resume();
    this.isGameOver = false;
    this.isPaused = false;
    this.startNewGame();
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

    // 10 cols x 20 rows grid
    const maxW = width * 0.55;
    const maxH = height * 0.7;
    this.cellSize = Math.min(maxW / 10, maxH / 20, 22);
    this.cellSize = Math.max(this.cellSize, 14);

    this.boardWidth = this.cellSize * 10;
    this.boardHeight = this.cellSize * 20;

    this.startX = (width - this.boardWidth) / 2 - 25;
    this.startY = (height - this.boardHeight) / 2 - 25;
  }

  private startNewGame() {
    this.grid = Array(20).fill(null).map(() => Array(10).fill(''));
    this.score = 0;
    this.linesCleared = 0;
    this.level = 1;
    this.dropInterval = 800;
    this.isPaused = false;
    this.isGameOver = false;

    this.nextPiece = this.createRandomPiece();
    this.spawnPiece();

    this.updateHeaderScore();
    this.overlayManager?.updateHUD([
      { id: 'score', value: this.score },
      { id: 'lines', value: this.linesCleared },
      { id: 'level', value: this.level }
    ]);
  }

  private updateHeaderScore() {
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.score);
  }

  private createRandomPiece(): Tetromino {
    const pieces: { type: TetrominoType; matrix: number[][]; color: string }[] = [
      { type: 'I', matrix: [[1,1,1,1]], color: '#38bdf8' },
      { type: 'J', matrix: [[1,0,0],[1,1,1]], color: '#3b82f6' },
      { type: 'L', matrix: [[0,0,1],[1,1,1]], color: '#f97316' },
      { type: 'O', matrix: [[1,1],[1,1]], color: '#eab308' },
      { type: 'S', matrix: [[0,1,1],[1,1,0]], color: '#22c55e' },
      { type: 'T', matrix: [[0,1,0],[1,1,1]], color: '#a855f7' },
      { type: 'Z', matrix: [[1,1,0],[0,1,1]], color: '#ef4444' }
    ];

    const template = pieces[Math.floor(Math.random() * pieces.length)];
    return {
      type: template.type,
      matrix: template.matrix,
      color: template.color,
      x: Math.floor((10 - template.matrix[0].length) / 2),
      y: 0
    };
  }

  private spawnPiece() {
    this.currentPiece = this.nextPiece;
    this.nextPiece = this.createRandomPiece();

    if (this.currentPiece && !this.isValidMove(this.currentPiece.matrix, this.currentPiece.x, this.currentPiece.y)) {
      this.isGameOver = true;
      GameAudioEngine.getInstance().playSFX('lose');
      this.overlayManager?.showResults({
        title: 'GAME OVER',
        score: this.score,
        metrics: [
          { label: 'Lines Cleared', value: this.linesCleared },
          { label: 'Level Reached', value: this.level }
        ],
        onRestart: () => {
          this.overlayManager?.hideResults();
          this.startNewGame();
        }
      });
    }
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

    if (this.isGameOver || this.isPaused || !this.currentPiece) return;

    if (e.key === 'ArrowLeft') {
      this.movePiece(-1, 0);
    } else if (e.key === 'ArrowRight') {
      this.movePiece(1, 0);
    } else if (e.key === 'ArrowDown') {
      this.movePiece(0, 1);
    } else if (e.key === 'ArrowUp') {
      this.rotatePiece();
    } else if (e.key === ' ') {
      this.hardDrop();
    }
  }

  private handleTouchStart(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const mx = touch.clientX - rect.left;
    const my = touch.clientY - rect.top;
    this.processInputAt(mx, my);
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    this.processInputAt(mx, my);
  }

  private processInputAt(mx: number, my: number) {
    if (!this.canvas) return;

    const midX = this.canvas.width / 2;
    const touchControlsY = this.startY + this.boardHeight + 35;

    // Check On-screen Touch Controls (◄, ►, ↻, ▼, ⏬)
    const btnSize = 38;
    const gap = 8;
    const startX = midX - (2.5 * btnSize + 2 * gap);

    // 1. Left
    if (Math.abs(mx - (startX + 0 * (btnSize + gap))) <= btnSize / 2 && Math.abs(my - touchControlsY) <= btnSize / 2) {
      this.movePiece(-1, 0);
      this.playSFX('click');
      return;
    }
    // 2. Right
    if (Math.abs(mx - (startX + 1 * (btnSize + gap))) <= btnSize / 2 && Math.abs(my - touchControlsY) <= btnSize / 2) {
      this.movePiece(1, 0);
      this.playSFX('click');
      return;
    }
    // 3. Rotate
    if (Math.abs(mx - (startX + 2 * (btnSize + gap))) <= btnSize / 2 && Math.abs(my - touchControlsY) <= btnSize / 2) {
      this.rotatePiece();
      this.playSFX('rotate');
      return;
    }
    // 4. Soft Drop
    if (Math.abs(mx - (startX + 3 * (btnSize + gap))) <= btnSize / 2 && Math.abs(my - touchControlsY) <= btnSize / 2) {
      this.movePiece(0, 1);
      this.playSFX('click');
      return;
    }
    // 5. Hard Drop
    if (Math.abs(mx - (startX + 4 * (btnSize + gap))) <= btnSize / 2 && Math.abs(my - touchControlsY) <= btnSize / 2) {
      this.hardDrop();
      this.playSFX('drop');
      return;
    }

    // Restart button
    const restartY = touchControlsY + 45;
    if (Math.abs(mx - midX) <= 40 && Math.abs(my - restartY) <= 14) {
      this.startNewGame();
      this.playSFX('click');
      return;
    }
  }

  private movePiece(dx: number, dy: number): boolean {
    if (!this.currentPiece) return false;
    const newX = this.currentPiece.x + dx;
    const newY = this.currentPiece.y + dy;

    if (this.isValidMove(this.currentPiece.matrix, newX, newY)) {
      this.currentPiece.x = newX;
      this.currentPiece.y = newY;
      return true;
    }
    return false;
  }

  private rotatePiece() {
    if (!this.currentPiece) return;
    const m = this.currentPiece.matrix;
    const rotated = m[0].map((_, i) => m.map(row => row[i]).reverse());

    if (this.isValidMove(rotated, this.currentPiece.x, this.currentPiece.y)) {
      this.currentPiece.matrix = rotated;
    } else if (this.isValidMove(rotated, this.currentPiece.x - 1, this.currentPiece.y)) {
      this.currentPiece.x--; // Wall kick left
      this.currentPiece.matrix = rotated;
    } else if (this.isValidMove(rotated, this.currentPiece.x + 1, this.currentPiece.y)) {
      this.currentPiece.x++; // Wall kick right
      this.currentPiece.matrix = rotated;
    }
  }

  private hardDrop() {
    while (this.movePiece(0, 1)) {}
    this.lockPiece();
  }

  private isValidMove(matrix: number[][], posX: number, posY: number): boolean {
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          const gx = posX + c;
          const gy = posY + r;

          if (gx < 0 || gx >= 10 || gy >= 20) return false;
          if (gy >= 0 && this.grid[gy][gx] !== '') return false;
        }
      }
    }
    return true;
  }

  private lockPiece() {
    if (!this.currentPiece) return;

    const { matrix, color, x, y } = this.currentPiece;
    for (let r = 0; r < matrix.length; r++) {
      for (let c = 0; c < matrix[r].length; c++) {
        if (matrix[r][c] !== 0) {
          const gy = y + r;
          const gx = x + c;
          if (gy >= 0 && gy < 20 && gx >= 0 && gx < 10) {
            this.grid[gy][gx] = color;
          }
        }
      }
    }

    this.clearLines();
    this.spawnPiece();
  }

  private clearLines() {
    let cleared = 0;

    for (let r = 19; r >= 0; r--) {
      if (this.grid[r].every(cell => cell !== '')) {
        this.grid.splice(r, 1);
        this.grid.unshift(Array(10).fill(''));
        cleared++;
        r++; // Check same index again after shift
      }
    }

    if (cleared > 0) {
      this.linesCleared += cleared;
      const scores = [0, 100, 300, 500, 800];
      this.score += (scores[cleared] || 1000) * this.level;
      this.level = Math.floor(this.linesCleared / 10) + 1;
      this.dropInterval = Math.max(100, 800 - (this.level - 1) * 70);

      this.updateHeaderScore();
      this.overlayManager?.updateHUD([
        { id: 'score', value: this.score },
        { id: 'lines', value: this.linesCleared },
        { id: 'level', value: this.level }
      ]);
      this.playSFX(cleared === 4 ? 'tetris' : 'clear');
    }
  }

  private playSFX(type: 'rotate' | 'drop' | 'clear' | 'tetris' | 'gameover' | 'click') {
    const engine = GameAudioEngine.getInstance();
    switch (type) {
      case 'rotate':
        engine.playSFX('swish');
        break;
      case 'drop':
        engine.playSFX('drop');
        break;
      case 'clear':
        engine.playSFX('clear');
        break;
      case 'tetris':
        engine.playSFX('score');
        break;
      case 'gameover':
        engine.playSFX('lose');
        break;
      case 'click':
      default:
        engine.playSFX('click');
        break;
    }
  }

  private tick(time: number) {
    if (!this.isRunning) return;

    if (!this.isGameOver && !this.isPaused) {
      if (time - this.lastDropTime > this.dropInterval) {
        if (!this.movePiece(0, 1)) {
          this.lockPiece();
        }
        this.lastDropTime = time;
      }
    }

    this.render();
    this.animationFrameId = requestAnimationFrame(this.tick.bind(this));
  }

  private render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    ctx.fillStyle = '#0a0915';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const midX = canvas.width / 2;

    // Header Info
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'var(--text3)';
    ctx.fillText(`Lines: ${this.linesCleared}   |   Level: ${this.level}`, midX - 25, this.startY - 14);

    // Board Frame Outer
    ctx.fillStyle = '#111827';
    ctx.fillRect(this.startX, this.startY, this.boardWidth, this.boardHeight);

    // Render Locked Blocks Grid
    for (let r = 0; r < 20; r++) {
      for (let c = 0; c < 10; c++) {
        const color = this.grid[r][c];
        const x = this.startX + c * this.cellSize;
        const y = this.startY + r * this.cellSize;

        if (color) {
          this.drawBlock(x, y, this.cellSize, color);
        } else {
          // Subtle grid cell outline
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
          ctx.strokeRect(x, y, this.cellSize, this.cellSize);
        }
      }
    }

    // Render Active Piece
    if (this.currentPiece && !this.isGameOver) {
      const { matrix, color, x: px, y: py } = this.currentPiece;
      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c] !== 0) {
            const bx = this.startX + (px + c) * this.cellSize;
            const by = this.startY + (py + r) * this.cellSize;
            this.drawBlock(bx, by, this.cellSize, color);
          }
        }
      }
    }

    // Border Frame
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.startX, this.startY, this.boardWidth, this.boardHeight);

    // Render Next Piece Preview (Side panel)
    const previewX = this.startX + this.boardWidth + 14;
    const previewY = this.startY + 10;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.beginPath();
    ctx.roundRect(previewX, previewY, 56, 56, 6);
    ctx.fill();

    ctx.font = 'bold 9px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'var(--text3)';
    ctx.textAlign = 'center';
    ctx.fillText('NEXT', previewX + 28, previewY + 12);

    if (this.nextPiece) {
      const { matrix, color } = this.nextPiece;
      const pCell = 10;
      const offX = previewX + (56 - matrix[0].length * pCell) / 2;
      const offY = previewY + 20 + (30 - matrix.length * pCell) / 2;

      for (let r = 0; r < matrix.length; r++) {
        for (let c = 0; c < matrix[r].length; c++) {
          if (matrix[r][c] !== 0) {
            this.drawBlock(offX + c * pCell, offY + r * pCell, pCell, color);
          }
        }
      }
    }

    // Touch Control Buttons Row
    const touchControlsY = this.startY + this.boardHeight + 35;
    const btnSize = 38;
    const gap = 8;
    const startX = midX - (2.5 * btnSize + 2 * gap);

    const btnIcons = ['◄', '►', '↻', '▼', '⏬'];
    for (let i = 0; i < 5; i++) {
      const bx = startX + i * (btnSize + gap);

      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx - btnSize / 2, touchControlsY - btnSize / 2, btnSize, btnSize, 8);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 15px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(btnIcons[i], bx, touchControlsY);
    }

    // New Game Button
    const restartY = touchControlsY + 45;
    this.drawButton(midX, restartY, 76, 26, 'NEW GAME', false);
  }

  private drawBlock(x: number, y: number, size: number, color: string) {
    const ctx = this.ctx!;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
  }

  private drawButton(cx: number, cy: number, w: number, h: number, label: string, active: boolean) {
    const ctx = this.ctx!;
    ctx.fillStyle = active ? '#10b981' : 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = active ? '#10b981' : '#2d2c4e';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 10px "Space Grotesk", sans-serif';
    ctx.fillStyle = active ? '#000000' : 'var(--text3)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy);
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('resize', this.boundResize);

    this.overlayManager?.destroy();

    const titleEl = document.getElementById('game-panel-title');
    const subtitleEl = document.getElementById('game-panel-subtitle');
    const scoreLabel = document.getElementById('game-panel-score-label');
    const scoreVal = document.getElementById('bb-score-val');
    if (titleEl) titleEl.textContent = 'Blade Bedlam';
    if (subtitleEl) subtitleEl.textContent = 'Action Slasher Clone · Custom Coded';
    if (scoreLabel) scoreLabel.textContent = 'Score:';
    if (scoreVal) scoreVal.textContent = '0';
  }
}
