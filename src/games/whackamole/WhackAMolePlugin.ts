import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';

interface Hole {
  x: number; y: number; moleTime: number; type: 'normal' | 'gold' | 'bomb';
}

export class WhackAMolePlugin implements MiniGamePlugin {
  id = 'whackamole';
  name = 'Whack-a-Mole Blitz';
  subtitle = 'Reflex tap action game';
  description = 'Test your reaction speed by whacking moles as they pop out of their holes. Hit golden moles for bonus multipliers and avoid bombs!';
  version = '1.0.0';
  genre = 'Arcade';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '1–2 min';
  category = 'Arcade';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  private holes: Hole[] = [];
  private score = 0;
  private timeLeft = 30;
  private timerInterval: any = null;
  private isGameOver = false;

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
    this.resizeCanvas();
    this.resetGame();

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundResize = this.resizeCanvas.bind(this);

    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    window.addEventListener('resize', this.boundResize);

    this.tick();
  }

  private resetGame() {
    this.score = 0;
    this.timeLeft = 30;
    this.isGameOver = false;

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.isRunning && !this.isGameOver) {
        this.timeLeft--;
        if (this.timeLeft <= 0) {
          this.isGameOver = true;
          clearInterval(this.timerInterval);
        }
      }
    }, 1000);

    this.setupHoles();
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = '0';
  }

  private setupHoles() {
    if (!this.canvas) return;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const startX = w / 2 - 100;
    const startY = h / 2 - 100;

    this.holes = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        this.holes.push({
          x: startX + c * 100 + 50,
          y: startY + r * 100 + 50,
          moleTime: 0,
          type: 'normal'
        });
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
    this.setupHoles();
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
    if (this.isGameOver) {
      this.resetGame(); return;
    }

    for (const hole of this.holes) {
      if (hole.moleTime > 0 && Math.hypot(mx - hole.x, my - hole.y) <= 35) {
        if (hole.type === 'gold') {
          this.score += 300;
        } else if (hole.type === 'bomb') {
          this.score = Math.max(0, this.score - 200);
        } else {
          this.score += 100;
        }
        hole.moleTime = 0;
        const scoreVal = document.getElementById('bb-score-val');
        if (scoreVal) scoreVal.textContent = String(this.score);
        return;
      }
    }
  }

  private update() {
    if (this.isGameOver) return;

    // Random mole pop
    if (Math.random() < 0.05) {
      const emptyHoles = this.holes.filter(h => h.moleTime <= 0);
      if (emptyHoles.length > 0) {
        const target = emptyHoles[Math.floor(Math.random() * emptyHoles.length)];
        target.moleTime = 40 + Math.floor(Math.random() * 30);
        const rand = Math.random();
        target.type = rand < 0.2 ? 'gold' : rand < 0.35 ? 'bomb' : 'normal';
      }
    }

    for (const hole of this.holes) {
      if (hole.moleTime > 0) hole.moleTime--;
    }
  }

  private tick() {
    if (!this.isRunning) return;
    this.update();
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

    ctx.font = 'bold 14px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isGameOver ? '#ef4444' : '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(this.isGameOver ? 'TIME UP! Tap to play again' : `Time: ${this.timeLeft}s`, midX, canvas.height / 2 - 160);

    for (const hole of this.holes) {
      // Hole rim
      ctx.fillStyle = '#1e293b';
      ctx.beginPath(); ctx.ellipse(hole.x, hole.y + 10, 35, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#334155'; ctx.stroke();

      // Mole
      if (hole.moleTime > 0) {
        ctx.fillStyle = hole.type === 'gold' ? '#f59e0b' : hole.type === 'bomb' ? '#ef4444' : '#a855f7';
        ctx.beginPath(); ctx.arc(hole.x, hole.y - 10, 24, 0, Math.PI * 2); ctx.fill();

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(hole.x - 8, hole.y - 14, 4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(hole.x + 8, hole.y - 14, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  destroy(): void {
    this.isRunning = false;
    if (this.timerInterval) clearInterval(this.timerInterval);
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('resize', this.boundResize);
  }
}
