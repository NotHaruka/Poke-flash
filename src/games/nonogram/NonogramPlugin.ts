import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { resetGameCanvas } from '../../game.js';

export class NonogramPlugin implements MiniGamePlugin {
  id = 'nonogram';
  name = 'Picross Nonogram';
  subtitle = 'Logic picture grid puzzle';
  description = 'Deduce hidden pixel art grid patterns by analyzing row and column numbers. Mark filled tiles and X obstacles with precision.';
  version = '1.0.0';
  genre = 'Puzzle';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '3–8 min';
  category = 'Puzzle';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private overlayManager: GameOverlayManager | null = null;

  private gridSize = 5;
  private solution: boolean[][] = [];
  private playerGrid: Array<Array<'empty' | 'fill' | 'cross'>> = [];
  private rowClues: number[][] = [];
  private colClues: number[][] = [];
  private mode: 'fill' | 'cross' = 'fill';
  private mistakes = 0;
  private isWon = false;
  private statusMessage = 'Fill or mark X according to row/col hints';

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
    if (scoreLabel) scoreLabel.textContent = 'Mistakes';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onRestart: () => this.generatePuzzle(5)
    });

    this.overlayManager.showInstructions({
      title: 'PICROSS NONOGRAM',
      subtitle: 'Picture Logic Grid Puzzle',
      description: 'Deduce hidden pixel art grid patterns by analyzing row and column numbers. Mark filled tiles and X obstacles with precision.',
      objective: 'Reveal the correct pixel art pattern without making mistakes.',
      controls: [
        { key: 'Tap Cell', action: 'Fill or place X based on current mode' },
        { key: 'Toggle Mode', action: 'Switch between Fill and X tools' }
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { id: 'mistakes', label: 'Mistakes', value: '0' }
        ]);
        this.startGame();
      }
    });
  }

  private startGame() {
    this.isRunning = true;
    this.generatePuzzle(5);
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

  private generatePuzzle(size: number) {
    this.gridSize = size;
    this.mistakes = 0;
    this.isWon = false;
    this.statusMessage = 'Deduce the picture!';
    this.overlayManager?.updateStat('mistakes', 0);

    // Generate random solution
    this.solution = Array(size).fill(null).map(() => Array(size).fill(false).map(() => Math.random() > 0.4));
    this.playerGrid = Array(size).fill(null).map(() => Array(size).fill('empty'));

    // Compute row clues
    this.rowClues = [];
    for (let r = 0; r < size; r++) {
      const clues: number[] = [];
      let count = 0;
      for (let c = 0; c < size; c++) {
        if (this.solution[r][c]) count++;
        else if (count > 0) { clues.push(count); count = 0; }
      }
      if (count > 0) clues.push(count);
      if (clues.length === 0) clues.push(0);
      this.rowClues.push(clues);
    }

    // Compute col clues
    this.colClues = [];
    for (let c = 0; c < size; c++) {
      const clues: number[] = [];
      let count = 0;
      for (let r = 0; r < size; r++) {
        if (this.solution[r][c]) count++;
        else if (count > 0) { clues.push(count); count = 0; }
      }
      if (count > 0) clues.push(count);
      if (clues.length === 0) clues.push(0);
      this.colClues.push(clues);
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

    const clueSpace = 60;
    const availableDim = Math.min(width - clueSpace - 40, height - clueSpace - 120);
    this.cellSize = Math.max(24, Math.floor(availableDim / this.gridSize));
    this.startX = (width - this.gridSize * this.cellSize + clueSpace) / 2;
    this.startY = (height - this.gridSize * this.cellSize + clueSpace) / 2 + 10;
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
    const midX = this.canvas.width / 2;

    // Toggle fill/cross mode
    const btnY = this.startY + this.gridSize * this.cellSize + 35;
    if (Math.abs(mx - (midX - 55)) <= 45 && Math.abs(my - btnY) <= 15) {
      this.mode = 'fill'; return;
    }
    if (Math.abs(mx - (midX + 55)) <= 45 && Math.abs(my - btnY) <= 15) {
      this.mode = 'cross'; return;
    }

    if (this.isWon) {
      this.generatePuzzle(this.gridSize === 5 ? 10 : 5);
      return;
    }

    const col = Math.floor((mx - this.startX) / this.cellSize);
    const row = Math.floor((my - this.startY) / this.cellSize);

    if (col >= 0 && col < this.gridSize && row >= 0 && row < this.gridSize) {
      if (this.mode === 'fill') {
        if (this.playerGrid[row][col] === 'fill') {
          this.playerGrid[row][col] = 'empty';
        } else {
          this.playerGrid[row][col] = 'fill';
          if (!this.solution[row][col]) {
            this.mistakes++;
            this.overlayManager?.updateStat('mistakes', this.mistakes);
            const scoreVal = document.getElementById('bb-score-val');
            if (scoreVal) scoreVal.textContent = String(this.mistakes);
          }
        }
      } else {
        this.playerGrid[row][col] = this.playerGrid[row][col] === 'cross' ? 'empty' : 'cross';
      }

      this.checkWin();
    }
  }

  private checkWin() {
    let won = true;
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        if (this.solution[r][c] && this.playerGrid[r][c] !== 'fill') won = false;
        if (!this.solution[r][c] && this.playerGrid[r][c] === 'fill') won = false;
      }
    }
    if (won && !this.isWon) {
      this.isWon = true;
      this.statusMessage = 'PUZZLE SOLVED!';
      const nextSize = this.gridSize === 5 ? 10 : 5;
      setTimeout(() => {
        this.overlayManager?.showResults({
          title: 'PICTURE REVEALED! 🎨',
          subtitle: `Solved with ${this.mistakes} mistakes!`,
          isWin: true,
          stats: [
            { label: 'Grid Size', value: `${this.gridSize}x${this.gridSize}` },
            { label: 'Mistakes', value: String(this.mistakes) }
          ],
          onRestart: () => {
            this.overlayManager?.hideResults();
            this.generatePuzzle(nextSize);
          }
        });
      }, 300);
    }
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
    ctx.fillStyle = this.isWon ? '#10b981' : '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(this.statusMessage, midX, this.startY - 40);

    // Render Clues
    ctx.font = '11px sans-serif'; ctx.fillStyle = '#94a3b8';
    for (let r = 0; r < this.gridSize; r++) {
      const clueStr = this.rowClues[r].join(' ');
      ctx.textAlign = 'right';
      ctx.fillText(clueStr, this.startX - 8, this.startY + r * this.cellSize + this.cellSize / 2 + 4);
    }
    for (let c = 0; c < this.gridSize; c++) {
      const clues = this.colClues[c];
      ctx.textAlign = 'center';
      for (let i = 0; i < clues.length; i++) {
        ctx.fillText(String(clues[i]), this.startX + c * this.cellSize + this.cellSize / 2, this.startY - (clues.length - i) * 14 + 4);
      }
    }

    // Grid
    for (let r = 0; r < this.gridSize; r++) {
      for (let c = 0; c < this.gridSize; c++) {
        const x = this.startX + c * this.cellSize;
        const y = this.startY + r * this.cellSize;
        const cell = this.playerGrid[r][c];

        ctx.fillStyle = cell === 'fill' ? '#38bdf8' : '#1e293b';
        ctx.fillRect(x, y, this.cellSize - 1, this.cellSize - 1);
        ctx.strokeStyle = '#334155'; ctx.strokeRect(x, y, this.cellSize - 1, this.cellSize - 1);

        if (cell === 'cross') {
          ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + this.cellSize - 4, y + this.cellSize - 4);
          ctx.moveTo(x + this.cellSize - 4, y + 4); ctx.lineTo(x + 4, y + this.cellSize - 4);
          ctx.stroke();
        }
      }
    }

    // Mode Buttons
    const btnY = this.startY + this.gridSize * this.cellSize + 35;
    ctx.fillStyle = this.mode === 'fill' ? '#38bdf8' : '#334155';
    ctx.beginPath(); ctx.roundRect(midX - 100, btnY - 14, 90, 28, 6); ctx.fill();
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('MODE: FILL', midX - 55, btnY + 3);

    ctx.fillStyle = this.mode === 'cross' ? '#ef4444' : '#334155';
    ctx.beginPath(); ctx.roundRect(midX + 10, btnY - 14, 90, 28, 6); ctx.fill();
    ctx.fillText('MODE: X', midX + 55, btnY + 3);
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
