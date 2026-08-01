import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { resetGameCanvas } from '../../game.js';

interface Rock {
  x: number; y: number; size: number;
}

export class ZenGardenPlugin implements MiniGamePlugin {
  id = 'zengarden';
  name = 'Zen Garden Raker';
  subtitle = 'Relaxing meditative sand art';
  description = 'Rake tranquil patterns into fine white sand, arrange polished river stones, and enjoy a peaceful meditative break.';
  version = '1.0.0';
  genre = 'Relaxing';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '2–10 min';
  category = 'Action'; // Or Relaxing/Quick Play
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

  private rocks: Rock[] = [];
  private tool: 'rake' | 'rock' = 'rake';
  private trails: Array<Array<[number, number]>> = [];
  private currentTrail: Array<[number, number]> = [];
  private isDrawing = false;

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
    if (scoreLabel) scoreLabel.textContent = 'Stones';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onRestart: () => {
        this.rocks = [];
        this.trails = [];
        this.currentTrail = [];
        this.overlayManager?.updateStat('stones', 0);
      }
    });

    this.overlayManager.showInstructions({
      title: 'ZEN GARDEN RAKER',
      subtitle: 'Meditative Sand Art',
      description: 'Rake tranquil patterns into fine white sand, arrange polished river stones, and enjoy a peaceful meditative break.',
      objective: 'Relax and create sand patterns and stone arrangements.',
      controls: [
        { key: 'Rake Mode', action: 'Drag to rake grooves into the sand' },
        { key: 'Stone Mode', action: 'Tap to place polished river stones' }
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { id: 'stones', label: 'River Stones', value: '0' }
        ]);
        this.startGame();
      }
    });
  }

  private startGame() {
    this.isRunning = true;
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

  private resizeCanvas() {
    if (!this.canvas) return;
    const container = document.getElementById('game-canvas-container');
    if (container) {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
    }
  }

  private handleTouchStart(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    this.startDraw(touch.clientX - rect.left, touch.clientY - rect.top);
  }

  private handleTouchMove(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    this.moveDraw(touch.clientX - rect.left, touch.clientY - rect.top);
  }

  private handleTouchEnd() {
    this.endDraw();
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.startDraw(e.clientX - rect.left, e.clientY - rect.top);
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.moveDraw(e.clientX - rect.left, e.clientY - rect.top);
  }

  private handleMouseUp() {
    this.endDraw();
  }

  private startDraw(x: number, y: number) {
    if (!this.canvas) return;

    const midX = this.canvas.width / 2;
    const btnY = this.canvas.height - 40;

    // Tool switchers
    if (Math.abs(x - (midX - 70)) <= 40 && Math.abs(y - btnY) <= 15) {
      this.tool = 'rake'; return;
    }
    if (Math.abs(x - (midX)) <= 40 && Math.abs(y - btnY) <= 15) {
      this.tool = 'rock'; return;
    }
    if (Math.abs(x - (midX + 70)) <= 40 && Math.abs(y - btnY) <= 15) {
      this.trails = []; this.rocks = [];
      const scoreVal = document.getElementById('bb-score-val');
      if (scoreVal) scoreVal.textContent = '0';
      return;
    }

    if (this.tool === 'rock') {
      this.rocks.push({ x, y, size: 16 + Math.random() * 12 });
      this.overlayManager?.updateStat('stones', this.rocks.length);
      const scoreVal = document.getElementById('bb-score-val');
      if (scoreVal) scoreVal.textContent = String(this.rocks.length);
    } else {
      this.isDrawing = true;
      this.currentTrail = [[x, y]];
    }
  }

  private moveDraw(x: number, y: number) {
    if (this.isDrawing && this.tool === 'rake') {
      this.currentTrail.push([x, y]);
    }
  }

  private endDraw() {
    if (this.isDrawing) {
      this.isDrawing = false;
      if (this.currentTrail.length > 1) {
        this.trails.push([...this.currentTrail]);
      }
      this.currentTrail = [];
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

    // Fine white sand background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Rake Trails
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const allTrails = [...this.trails];
    if (this.currentTrail.length > 1) allTrails.push(this.currentTrail);

    for (const trail of allTrails) {
      ctx.beginPath();
      for (let i = 0; i < trail.length; i++) {
        if (i === 0) ctx.moveTo(trail[i][0], trail[i][1]);
        else ctx.lineTo(trail[i][0], trail[i][1]);
      }
      ctx.stroke();
    }

    // River Rocks
    for (const rock of this.rocks) {
      ctx.fillStyle = '#334155';
      ctx.beginPath(); ctx.arc(rock.x, rock.y, rock.size, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.stroke();

      // Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.beginPath(); ctx.arc(rock.x - rock.size * 0.3, rock.y - rock.size * 0.3, rock.size * 0.3, 0, Math.PI * 2); ctx.fill();
    }

    // UI Buttons
    const midX = canvas.width / 2;
    const btnY = canvas.height - 40;

    ctx.fillStyle = this.tool === 'rake' ? '#38bdf8' : '#64748b';
    ctx.beginPath(); ctx.roundRect(midX - 105, btnY - 14, 70, 28, 6); ctx.fill();
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('RAKE', midX - 70, btnY + 3);

    ctx.fillStyle = this.tool === 'rock' ? '#38bdf8' : '#64748b';
    ctx.beginPath(); ctx.roundRect(midX - 35, btnY - 14, 70, 28, 6); ctx.fill();
    ctx.fillText('STONE', midX, btnY + 3);

    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.roundRect(midX + 35, btnY - 14, 70, 28, 6); ctx.fill();
    ctx.fillText('CLEAR', midX + 70, btnY + 3);
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
