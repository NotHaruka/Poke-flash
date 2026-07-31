import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';

interface Asteroid {
  x: number; y: number; vx: number; vy: number; radius: number;
}

interface Bullet {
  x: number; y: number; vx: number; vy: number; life: number;
}

export class AsteroidsPlugin implements MiniGamePlugin {
  id = 'asteroids';
  name = 'Asteroids Vector Sector';
  subtitle = 'Classic space shooter';
  description = 'Pilot your spaceship through hazardous space sectors, blast splitting asteroids, and navigate screen-wrapping drift physics.';
  version = '1.0.0';
  genre = 'Arcade';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '2–5 min';
  category = 'Arcade';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <polygon points="12 2 2 22 12 17 22 22 12 2" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  private ship = { x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2, isThrusting: false };
  private asteroids: Asteroid[] = [];
  private bullets: Bullet[] = [];
  private score = 0;
  private lives = 3;
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
    if (!this.canvas) return;
    this.score = 0;
    this.lives = 3;
    this.isGameOver = false;
    this.bullets = [];

    this.ship = {
      x: this.canvas.width / 2,
      y: this.canvas.height / 2,
      vx: 0, vy: 0,
      angle: -Math.PI / 2,
      isThrusting: false
    };

    this.asteroids = [];
    for (let i = 0; i < 5; i++) {
      this.spawnAsteroid(30);
    }

    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = '0';
  }

  private spawnAsteroid(radius: number, x?: number, y?: number) {
    if (!this.canvas) return;
    const ax = x ?? Math.random() * this.canvas.width;
    const ay = y ?? Math.random() * this.canvas.height;
    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;

    this.asteroids.push({
      x: ax, y: ay,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius
    });
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
      this.resetGame(); return;
    }

    const midX = this.canvas.width / 2;
    const ctrlY = this.canvas.height - 50;

    // Left Turn
    if (Math.hypot(mx - (midX - 80), my - ctrlY) <= 25) {
      this.ship.angle -= 0.4; return;
    }
    // Right Turn
    if (Math.hypot(mx - (midX - 20), my - ctrlY) <= 25) {
      this.ship.angle += 0.4; return;
    }
    // Thrust
    if (Math.hypot(mx - (midX + 40), my - ctrlY) <= 25) {
      this.ship.vx += Math.cos(this.ship.angle) * 3;
      this.ship.vy += Math.sin(this.ship.angle) * 3;
      return;
    }
    // Fire
    if (Math.hypot(mx - (midX + 100), my - ctrlY) <= 25) {
      this.fireBullet(); return;
    }

    // Default tap aimed fire towards tap
    this.ship.angle = Math.atan2(my - this.ship.y, mx - this.ship.x);
    this.fireBullet();
  }

  private fireBullet() {
    const speed = 7;
    this.bullets.push({
      x: this.ship.x + Math.cos(this.ship.angle) * 15,
      y: this.ship.y + Math.sin(this.ship.angle) * 15,
      vx: Math.cos(this.ship.angle) * speed,
      vy: Math.sin(this.ship.angle) * speed,
      life: 60
    });
  }

  private update() {
    if (!this.canvas || this.isGameOver) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Ship physics
    this.ship.x = (this.ship.x + this.ship.vx + w) % w;
    this.ship.y = (this.ship.y + this.ship.vy + h) % h;
    this.ship.vx *= 0.98;
    this.ship.vy *= 0.98;

    // Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x = (b.x + b.vx + w) % w;
      b.y = (b.y + b.vy + h) % h;
      b.life--;
      if (b.life <= 0) this.bullets.splice(i, 1);
    }

    // Asteroids
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      a.x = (a.x + a.vx + w) % w;
      a.y = (a.y + a.vy + h) % h;

      // Check collision with bullets
      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius) {
          this.bullets.splice(j, 1);
          this.score += a.radius > 20 ? 50 : 100;
          const scoreVal = document.getElementById('bb-score-val');
          if (scoreVal) scoreVal.textContent = String(this.score);

          if (a.radius > 15) {
            this.spawnAsteroid(a.radius / 2, a.x, a.y);
            this.spawnAsteroid(a.radius / 2, a.x, a.y);
          }
          this.asteroids.splice(i, 1);
          break;
        }
      }

      // Check ship collision
      if (Math.hypot(a.x - this.ship.x, a.y - this.ship.y) < a.radius + 10) {
        this.lives--;
        if (this.lives <= 0) {
          this.isGameOver = true;
        } else {
          this.ship.x = w / 2; this.ship.y = h / 2;
          this.ship.vx = 0; this.ship.vy = 0;
        }
      }
    }

    if (this.asteroids.length === 0) {
      for (let i = 0; i < 6; i++) this.spawnAsteroid(30);
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

    // Ship
    if (!this.isGameOver) {
      ctx.save();
      ctx.translate(this.ship.x, this.ship.y);
      ctx.rotate(this.ship.angle);
      ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(15, 0); ctx.lineTo(-10, -10); ctx.lineTo(-5, 0); ctx.lineTo(-10, 10); ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Bullets
    ctx.fillStyle = '#f59e0b';
    for (const b of this.bullets) {
      ctx.beginPath(); ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }

    // Asteroids
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1.5;
    for (const a of this.asteroids) {
      ctx.beginPath(); ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2); ctx.stroke();
    }

    // Controls
    const midX = canvas.width / 2;
    const ctrlY = canvas.height - 40;
    ctx.fillStyle = '#334155';
    ctx.beginPath(); ctx.arc(midX - 80, ctrlY, 20, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(midX - 20, ctrlY, 20, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(midX + 40, ctrlY, 20, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(midX + 100, ctrlY, 20, 0, Math.PI * 2); ctx.fill();

    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText('◄', midX - 80, ctrlY + 4);
    ctx.fillText('►', midX - 20, ctrlY + 4);
    ctx.fillText('▲', midX + 40, ctrlY + 4);
    ctx.fillText('FIRE', midX + 100, ctrlY + 4);

    if (this.isGameOver) {
      ctx.font = 'bold 18px "Fraunces", serif'; ctx.fillStyle = '#ef4444'; ctx.textAlign = 'center';
      ctx.fillText('GAME OVER! Tap to play again', midX, canvas.height / 2);
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
