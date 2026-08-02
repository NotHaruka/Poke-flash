import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { resetGameCanvas } from '../../game.js';
import { GameJuice } from '../core/GameJuice';

export class PixelArtStudioPlugin implements MiniGamePlugin {
  id = 'pixelart';
  name = 'Pixel Art Canvas';
  subtitle = 'Creative retro pixel studio';
  description = 'Express your creativity with a retro 16x16 pixel canvas, vibrant color palette, bucket fill, and eraser tools.';
  version = '1.0.0';
  genre = 'Relaxing';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '2–10 min';
  category = 'Action';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 7h2v2H7zM11 7h2v2h-2zM15 7h2v2h-2z" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private overlayManager: GameOverlayManager | null = null;
  private juice = new GameJuice();

  private gridSize = 16;
  private grid: string[][] = [];
  private palette = ['#000000', '#ffffff', '#ef4444', '#38bdf8', '#10b981', '#f59e0b', '#a855f7', '#ec4899'];
  private currentColor = '#ef4444';
  private tool: 'pencil' | 'eraser' | 'bucket' = 'pencil';
  private isDrawing = false;

  private cellSize = 0;
  private startX = 0;
  private startY = 0;

  private boundMouseDown: any;
  private boundMouseMove: any;
  private boundMouseUp: any;
  private boundTouchStart: any;
  private boundTouchMove: any;
  private boundTouchEnd: any;
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
    if (scoreLabel) scoreLabel.textContent = 'Pixels';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onRestart: () => this.resetGrid()
    });

    this.overlayManager.showInstructions({
      title: 'PIXEL ART CANVAS',
      subtitle: 'Retro Pixel Painting Studio',
      description: 'Express your creativity with a retro 16x16 pixel canvas, vibrant color palette, bucket fill, and eraser tools.',
      objective: 'Paint and design pixel art masterpieces.',
      controls: [
        { key: 'Pencil / Tap', action: 'Draw pixels with selected color' },
        { key: 'Bucket Fill', action: 'Fill connected matching region' },
        { key: 'Eraser', action: 'Clear pixel back to background' }
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { id: 'pixels', label: 'Painted Pixels', value: '0' }
        ]);
        this.startGame();
        this.juice.reset();
        this.juice.startCountdown(() => {});
      }
    });
  }

  private startGame() {
    this.isRunning = true;
    this.resetGrid();
    this.resizeCanvas();

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);

    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);

    this.boundResize = this.resizeCanvas.bind(this);

    if (this.canvas) {
      this.canvas.style.touchAction = 'none';
      this.canvas.addEventListener('mousedown', this.boundMouseDown);
      this.canvas.addEventListener('mousemove', this.boundMouseMove);
      this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
      this.canvas.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    }
    window.addEventListener('mouseup', this.boundMouseUp);
    window.addEventListener('touchend', this.boundTouchEnd);
    window.addEventListener('resize', this.boundResize);

    this.tick();
  }

  private resetGrid() {
    this.grid = Array(16).fill(null).map(() => Array(16).fill('#ffffff'));
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

    this.cellSize = Math.min((width - 40) / 16, (height - 160) / 16, 22);
    this.startX = (width - 16 * this.cellSize) / 2;
    this.startY = 40;
  }

  private handleTouchStart(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    this.processInputAt(touch.clientX - rect.left, touch.clientY - rect.top, true);
  }

  private handleTouchMove(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    if (this.isDrawing) {
      this.processInputAt(touch.clientX - rect.left, touch.clientY - rect.top, false);
    }
  }

  private handleTouchEnd() { this.isDrawing = false; }

  private handleMouseDown(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.processInputAt(e.clientX - rect.left, e.clientY - rect.top, true);
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    if (this.isDrawing) {
      this.processInputAt(e.clientX - rect.left, e.clientY - rect.top, false);
    }
  }

  private handleMouseUp() { this.isDrawing = false; }

  private processInputAt(mx: number, my: number, isInitialTap: boolean) {
    if (!this.canvas) return;
    const midX = this.canvas.width / 2;

    // Palette selection
    const palY = this.startY + 16 * this.cellSize + 20;
    for (let i = 0; i < this.palette.length; i++) {
      const px = midX - 120 + i * 30;
      if (Math.hypot(mx - px, my - palY) <= 12) {
        this.currentColor = this.palette[i]; return;
      }
    }

    // Tools
    const toolY = palY + 35;
    if (Math.abs(mx - (midX - 70)) <= 25 && Math.abs(my - toolY) <= 12) {
      this.tool = 'pencil'; return;
    }
    if (Math.abs(mx - (midX - 10)) <= 25 && Math.abs(my - toolY) <= 12) {
      this.tool = 'eraser'; return;
    }
    if (Math.abs(mx - (midX + 50)) <= 25 && Math.abs(my - toolY) <= 12) {
      this.tool = 'bucket'; return;
    }
    if (Math.abs(mx - (midX + 110)) <= 25 && Math.abs(my - toolY) <= 12) {
      this.resetGrid();
      this.juice.spawnExplosion(midX + 110, toolY, { count: 12, color: '#ef4444', sizeRange: [2, 5], speedRange: [2, 5] });
      this.juice.shake(5);
      return;
    }

    // Grid painting
    const col = Math.floor((mx - this.startX) / this.cellSize);
    const row = Math.floor((my - this.startY) / this.cellSize);

    if (col >= 0 && col < 16 && row >= 0 && row < 16) {
      if (isInitialTap) this.isDrawing = true;

      const color = this.tool === 'eraser' ? '#ffffff' : this.currentColor;
      if (this.grid[row][col] !== color) {
        if (this.tool === 'bucket') {
          this.floodFill(row, col, this.grid[row][col], this.currentColor);
          this.juice.shake(3);
          this.juice.bounceZoom(1.03);
        } else {
          this.grid[row][col] = color;
          const px = this.startX + col * this.cellSize + this.cellSize / 2;
          const py = this.startY + row * this.cellSize + this.cellSize / 2;
          this.juice.spawnExplosion(px, py, { count: 4, color: color === '#ffffff' ? '#cbd5e1' : color, sizeRange: [1, 3], speedRange: [1, 3] });
        }
      }

      // Count painted non-white pixels
      let count = 0;
      for (let r = 0; r < 16; r++) {
        for (let c = 0; c < 16; c++) {
          if (this.grid[r][c] !== '#ffffff') count++;
        }
      }
      const scoreVal = document.getElementById('bb-score-val');
      if (scoreVal) scoreVal.textContent = String(count);
    }
  }

  private floodFill(r: number, c: number, targetColor: string, replacementColor: string) {
    if (targetColor === replacementColor) return;
    if (this.grid[r][c] !== targetColor) return;

    this.grid[r][c] = replacementColor;
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const nr = r + dr; const nc = c + dc;
      if (nr >= 0 && nr < 16 && nc >= 0 && nc < 16) {
        this.floodFill(nr, nc, targetColor, replacementColor);
      }
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

    // Grid
    for (let r = 0; r < 16; r++) {
      for (let c = 0; c < 16; c++) {
        const x = this.startX + c * this.cellSize;
        const y = this.startY + r * this.cellSize;

        ctx.fillStyle = this.grid[r][c];
        ctx.fillRect(x, y, this.cellSize, this.cellSize);
        ctx.strokeStyle = '#334155'; ctx.lineWidth = 0.5;
        ctx.strokeRect(x, y, this.cellSize, this.cellSize);
      }
    }

    // Palette
    const palY = this.startY + 16 * this.cellSize + 20;
    for (let i = 0; i < this.palette.length; i++) {
      const px = midX - 120 + i * 30;
      ctx.fillStyle = this.palette[i];
      ctx.beginPath(); ctx.arc(px, palY, 10, 0, Math.PI * 2); ctx.fill();
      if (this.currentColor === this.palette[i]) {
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2; ctx.stroke();
      }
    }

    // Tools
    const toolY = palY + 35;
    ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';

    ctx.fillStyle = this.tool === 'pencil' ? '#38bdf8' : '#334155';
    ctx.beginPath(); ctx.roundRect(midX - 95, toolY - 10, 50, 20, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('PENCIL', midX - 70, toolY + 4);

    ctx.fillStyle = this.tool === 'eraser' ? '#38bdf8' : '#334155';
    ctx.beginPath(); ctx.roundRect(midX - 35, toolY - 10, 50, 20, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('ERASER', midX - 10, toolY + 4);

    ctx.fillStyle = this.tool === 'bucket' ? '#38bdf8' : '#334155';
    ctx.beginPath(); ctx.roundRect(midX + 25, toolY - 10, 50, 20, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('FILL', midX + 50, toolY + 4);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.roundRect(midX + 85, toolY - 10, 50, 20, 4); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText('CLEAR', midX + 110, toolY + 4);

    this.juice.restoreCameraTransforms(ctx);
    this.juice.draw(ctx);
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
    }
    window.removeEventListener('mouseup', this.boundMouseUp);
    window.removeEventListener('touchend', this.boundTouchEnd);
    window.removeEventListener('resize', this.boundResize);
    if (this.overlayManager) {
      this.overlayManager.destroy();
      this.overlayManager = null;
    }
  }
}