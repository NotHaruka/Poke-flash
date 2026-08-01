import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { resetGameCanvas } from '../../game.js';

export class WaterSortPlugin implements MiniGamePlugin {
  id = 'watersort';
  name = 'Water Sort Puzzle';
  subtitle = 'Color pouring & liquid sorting';
  description = 'Pour colored liquids between test tubes until every tube contains only a single uniform color.';
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
      <path d="M9 2v4l-4 8a4 4 0 0 0 4 6h6a4 4 0 0 0 4-6l-4-8V2H9z" />
      <path d="M6 14h12" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private overlayManager: GameOverlayManager | null = null;

  private selectedTube: number | null = null;
  private tubes: string[][] = [];
  private history: string[][][] = [];
  private moves = 0;
  private isWon = false;
  private currentLevel = 1;
  private statusMessage = 'Tap a tube to select, then tap destination to pour';

  private colors = ['#ef4444', '#38bdf8', '#10b981', '#f59e0b', '#a855f7', '#ec4899'];

  private tubeWidth = 0;
  private tubeHeight = 0;
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
    if (scoreLabel) scoreLabel.textContent = 'Level';
    if (scoreVal) scoreVal.textContent = '1';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onRestart: () => this.loadLevel(this.currentLevel)
    });

    this.overlayManager.showInstructions({
      title: 'WATER SORT PUZZLE',
      subtitle: 'Color Sorting Challenge',
      description: 'Pour colored liquids between test tubes until every tube contains only a single uniform color.',
      objective: 'Sort all test tubes so that each tube holds a single color or is completely empty.',
      controls: [
        { key: 'Tap Tube', action: 'Select tube to pour from / to' }
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { id: 'level', label: 'Level', value: '1' },
          { id: 'moves', label: 'Moves', value: '0' }
        ]);
        this.startGame();
      }
    });
  }

  private startGame() {
    this.isRunning = true;
    this.loadLevel(1);
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

  private loadLevel(lvl: number) {
    this.currentLevel = lvl;
    this.moves = 0;
    this.selectedTube = null;
    this.isWon = false;
    this.history = [];
    this.statusMessage = 'Pour matching liquids into tubes';
    this.overlayManager?.updateStat('level', lvl);
    this.overlayManager?.updateStat('moves', 0);

    const colorCount = Math.min(3 + Math.floor((lvl - 1) / 2), 6);
    const usedColors = this.colors.slice(0, colorCount);

    // Build color pool: 4 units per color
    let pool: string[] = [];
    for (const c of usedColors) {
      pool.push(c, c, c, c);
    }
    pool.sort(() => Math.random() - 0.5);

    // Create tubes: colorCount filled + 2 empty
    this.tubes = [];
    for (let i = 0; i < colorCount; i++) {
      this.tubes.push(pool.slice(i * 4, (i + 1) * 4));
    }
    this.tubes.push([]);
    this.tubes.push([]);

    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.currentLevel);
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

    this.tubeWidth = Math.min(width / (this.tubes.length + 2), 40);
    this.tubeHeight = this.tubeWidth * 3.5;
    this.startX = (width - (this.tubes.length * (this.tubeWidth * 1.5))) / 2;
    this.startY = (height - this.tubeHeight) / 2;
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

    if (this.isWon) {
      this.loadLevel(this.currentLevel + 1);
      return;
    }

    // Reset button
    if (Math.abs(mx - midX) <= 40 && Math.abs(my - (this.startY + this.tubeHeight + 45)) <= 15) {
      this.loadLevel(this.currentLevel); return;
    }

    // Check tube click
    for (let i = 0; i < this.tubes.length; i++) {
      const tx = this.startX + i * (this.tubeWidth * 1.5);
      if (mx >= tx && mx <= tx + this.tubeWidth && my >= this.startY - 20 && my <= this.startY + this.tubeHeight + 10) {
        if (this.selectedTube === null) {
          if (this.tubes[i].length > 0) {
            this.selectedTube = i;
          }
        } else if (this.selectedTube === i) {
          this.selectedTube = null;
        } else {
          this.pourWater(this.selectedTube, i);
          this.selectedTube = null;
        }
        return;
      }
    }
  }

  private pourWater(from: number, to: number) {
    const src = this.tubes[from];
    const dst = this.tubes[to];

    if (src.length === 0) return;
    if (dst.length >= 4) return;

    const topColor = src[src.length - 1];
    if (dst.length > 0 && dst[dst.length - 1] !== topColor) return;

    // Save history
    this.history.push(this.tubes.map(t => [...t]));

    // Pour matching units
    while (src.length > 0 && src[src.length - 1] === topColor && dst.length < 4) {
      dst.push(src.pop()!);
    }
    this.moves++;
    this.overlayManager?.updateStat('moves', this.moves);

    this.checkWin();
  }

  private checkWin() {
    let won = true;
    for (const tube of this.tubes) {
      if (tube.length > 0 && (tube.length !== 4 || !tube.every(c => c === tube[0]))) {
        won = false;
      }
    }
    if (won && !this.isWon) {
      this.isWon = true;
      this.statusMessage = 'ALL TUBES SORTED!';
      const nextLvl = this.currentLevel + 1;
      setTimeout(() => {
        this.overlayManager?.showResults({
          title: 'LEVEL CLEARED! 🧪',
          subtitle: `Sorted all liquids in ${this.moves} moves!`,
          isWin: true,
          stats: [
            { label: 'Completed Level', value: this.currentLevel },
            { label: 'Total Moves', value: String(this.moves) }
          ],
          onRestart: () => {
            this.overlayManager?.hideResults();
            this.loadLevel(nextLvl);
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
    ctx.fillText(this.statusMessage, midX, this.startY - 30);

    // Tubes
    for (let i = 0; i < this.tubes.length; i++) {
      const tx = this.startX + i * (this.tubeWidth * 1.5);
      const isSelected = this.selectedTube === i;
      const ty = isSelected ? this.startY - 15 : this.startY;

      const tube = this.tubes[i];
      const unitH = (this.tubeHeight - 4) / 4;

      // Draw liquid blocks
      for (let j = 0; j < tube.length; j++) {
        ctx.fillStyle = tube[j];
        ctx.fillRect(tx + 2, ty + this.tubeHeight - (j + 1) * unitH, this.tubeWidth - 4, unitH);
      }

      // Tube glass outline
      ctx.strokeStyle = isSelected ? '#38bdf8' : '#64748b';
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(tx, ty + this.tubeHeight);
      ctx.arc(tx + this.tubeWidth / 2, ty + this.tubeHeight, this.tubeWidth / 2, Math.PI, 0, true);
      ctx.lineTo(tx + this.tubeWidth, ty);
      ctx.stroke();
    }

    // Reset button
    const btnY = this.startY + this.tubeHeight + 45;
    ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.roundRect(midX - 40, btnY - 14, 80, 28, 6); ctx.fill();
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('RESET', midX, btnY + 3);
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
