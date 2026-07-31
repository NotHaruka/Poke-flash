import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { GameAudioEngine } from '../core/GameAudioEngine';

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
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
  private isPaused = false;
  private isGameOver = false;

  private ship = { x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2, isThrusting: false };
  private asteroids: Asteroid[] = [];
  private bullets: Bullet[] = [];
  private score = 0;
  private lives = 3;

  private overlayManager: GameOverlayManager | null = null;
  private context: GameLaunchContext | null = null;

  // Key tracking state
  private keys: Record<string, boolean> = {};

  private boundMouseDown: any;
  private boundTouchStart: any;
  private boundResize: any;
  private boundKeyDown: any;
  private boundKeyUp: any;

  launch(context: GameLaunchContext): void {
    this.context = context;
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
    this.isPaused = false;
    this.isGameOver = false;

    // Initialize GameOverlayManager
    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onPause: () => {
        this.isPaused = true;
        this.ship.isThrusting = false;
      },
      onResume: () => {
        this.isPaused = false;
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
    this.boundResize = this.resizeCanvas.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);

    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    window.addEventListener('resize', this.boundResize);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);

    this.showHelpOverlay();
    this.tick();
  }

  private showHelpOverlay() {
    this.isPaused = true;
    this.ship.isThrusting = false;
    this.overlayManager?.showInstructions({
      title: 'ASTEROIDS VECTOR SECTOR',
      subtitle: 'Classic Space Shooter',
      description: 'Pilot your spaceship through hazardous space sectors, blast splitting asteroids, and navigate screen-wrapping drift physics.',
      objective: 'Destroy asteroids to survive and rack up a high score.',
      controls: [
        { key: 'A / D or Left / Right', action: 'Rotate spaceship' },
        { key: 'W or Arrow Up', action: 'Thrust forward' },
        { key: 'Space', action: 'Fire lasers' },
        { key: 'P / Esc', action: 'Pause / Resume game' }
      ],
      rules: [
        'Large asteroids split into medium ones, and medium ones split into small ones.',
        'Beware of screen wrapping—asteroids and bullets wrap around the screen edges!',
        'You have 3 pilot lives. Crashing into an asteroid costs 1 life.'
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { label: 'Score', value: 0, id: 'score' },
          { label: 'Lives', value: 3, id: 'lives' },
          { label: 'Asteroids', value: 0, id: 'asteroids' }
        ]);
        this.isPaused = false;
        this.resetGame();
        GameAudioEngine.getInstance().playSFX('click');
      }
    });
  }

  private restartGame() {
    this.overlayManager?.hideResults();
    this.overlayManager?.resume();
    this.isGameOver = false;
    this.isPaused = false;
    this.resetGame();
  }

  private resetGame() {
    if (!this.canvas) return;
    this.score = 0;
    this.lives = 3;
    this.isGameOver = false;
    this.bullets = [];
    this.keys = {};

    this.ship = {
      x: this.canvas.width / 2,
      y: this.canvas.height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      isThrusting: false
    };

    this.asteroids = [];
    for (let i = 0; i < 5; i++) {
      this.spawnAsteroid(30);
    }

    this.updateHUDAndHeader();
  }

  private updateHUDAndHeader() {
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.score);

    this.overlayManager?.updateHUD([
      { id: 'score', value: this.score },
      { id: 'lives', value: this.lives },
      { id: 'asteroids', value: this.asteroids.length }
    ]);
  }

  private spawnAsteroid(radius: number, x?: number, y?: number) {
    if (!this.canvas) return;
    
    // Ensure asteroid doesn't spawn right on top of the ship initially
    let ax = x ?? Math.random() * this.canvas.width;
    let ay = y ?? Math.random() * this.canvas.height;
    
    if (x === undefined && y === undefined) {
      while (Math.hypot(ax - this.ship.x, ay - this.ship.y) < 100) {
        ax = Math.random() * this.canvas.width;
        ay = Math.random() * this.canvas.height;
      }
    }

    const angle = Math.random() * Math.PI * 2;
    const speed = 1 + Math.random() * 2;

    this.asteroids.push({
      x: ax,
      y: ay,
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

    this.keys[e.key.toLowerCase()] = true;
    this.keys[e.key] = true;

    if (e.key === ' ') {
      e.preventDefault();
      this.fireBullet();
    }
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.keys[e.key.toLowerCase()] = false;
    this.keys[e.key] = false;
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
      return; // Handled by overlay manager restart button
    }

    if (this.isPaused) return;

    const midX = this.canvas.width / 2;
    const ctrlY = this.canvas.height - 50;

    // Left Turn button on canvas
    if (Math.hypot(mx - (midX - 80), my - ctrlY) <= 25) {
      this.ship.angle -= 0.4;
      GameAudioEngine.getInstance().playSFX('click');
      return;
    }
    // Right Turn button on canvas
    if (Math.hypot(mx - (midX - 20), my - ctrlY) <= 25) {
      this.ship.angle += 0.4;
      GameAudioEngine.getInstance().playSFX('click');
      return;
    }
    // Thrust button on canvas
    if (Math.hypot(mx - (midX + 40), my - ctrlY) <= 25) {
      this.ship.vx += Math.cos(this.ship.angle) * 3;
      this.ship.vy += Math.sin(this.ship.angle) * 3;
      this.ship.isThrusting = true;
      setTimeout(() => { this.ship.isThrusting = false; }, 150);
      GameAudioEngine.getInstance().playSFX('step');
      return;
    }
    // Fire button on canvas
    if (Math.hypot(mx - (midX + 100), my - ctrlY) <= 25) {
      this.fireBullet();
      return;
    }

    // Default tap aimed fire towards tap
    this.ship.angle = Math.atan2(my - this.ship.y, mx - this.ship.x);
    this.fireBullet();
  }

  private fireBullet() {
    if (this.isPaused || this.isGameOver) return;
    const speed = 7;
    this.bullets.push({
      x: this.ship.x + Math.cos(this.ship.angle) * 15,
      y: this.ship.y + Math.sin(this.ship.angle) * 15,
      vx: Math.cos(this.ship.angle) * speed,
      vy: Math.sin(this.ship.angle) * speed,
      life: 60
    });
    GameAudioEngine.getInstance().playSFX('laser');
  }

  private update() {
    if (!this.canvas || this.isGameOver || this.isPaused) return;
    const w = this.canvas.width;
    const h = this.canvas.height;

    // Keyboard rotation & thrust
    if (this.keys['arrowleft'] || this.keys['a']) {
      this.ship.angle -= 0.08;
    }
    if (this.keys['arrowright'] || this.keys['d']) {
      this.ship.angle += 0.08;
    }
    
    this.ship.isThrusting = !!(this.keys['arrowup'] || this.keys['w']);
    if (this.ship.isThrusting) {
      this.ship.vx += Math.cos(this.ship.angle) * 0.12;
      this.ship.vy += Math.sin(this.ship.angle) * 0.12;
      
      // Keep within max speed
      const speed = Math.hypot(this.ship.vx, this.ship.vy);
      if (speed > 6) {
        this.ship.vx = (this.ship.vx / speed) * 6;
        this.ship.vy = (this.ship.vy / speed) * 6;
      }
    }

    // Ship physics
    this.ship.x = (this.ship.x + this.ship.vx + w) % w;
    this.ship.y = (this.ship.y + this.ship.vy + h) % h;
    
    // Friction
    this.ship.vx *= 0.99;
    this.ship.vy *= 0.99;

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
          const points = a.radius > 20 ? 50 : a.radius > 10 ? 100 : 150;
          this.score += points;

          GameAudioEngine.getInstance().playSFX('explosion');

          if (a.radius > 10) {
            this.spawnAsteroid(a.radius / 2, a.x, a.y);
            this.spawnAsteroid(a.radius / 2, a.x, a.y);
          }
          this.asteroids.splice(i, 1);
          this.updateHUDAndHeader();
          break;
        }
      }

      // Check ship collision
      if (Math.hypot(a.x - this.ship.x, a.y - this.ship.y) < a.radius + 10) {
        this.lives--;
        GameAudioEngine.getInstance().playSFX('hit');
        
        // Remove asteroid that hit us to avoid spawn death loop
        this.asteroids.splice(i, 1);

        if (this.lives <= 0) {
          this.isGameOver = true;
          this.ship.isThrusting = false;
          GameAudioEngine.getInstance().playSFX('lose');
          this.overlayManager?.showResults({
            title: 'GAME OVER',
            score: this.score,
            metrics: [
              { label: 'Pilot Rank', value: this.score > 2000 ? 'S-Class Ace' : this.score > 1000 ? 'Commander' : 'Rookie' },
              { label: 'Survival Time', value: 'Active' }
            ],
            onRestart: () => {
              this.overlayManager?.hideResults();
              this.resetGame();
            }
          });
        } else {
          // Reset ship to center
          this.ship.x = w / 2;
          this.ship.y = h / 2;
          this.ship.vx = 0;
          this.ship.vy = 0;
        }
        this.updateHUDAndHeader();
      }
    }

    if (this.asteroids.length === 0) {
      for (let i = 0; i < 6; i++) {
        this.spawnAsteroid(30);
      }
      this.updateHUDAndHeader();
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

    ctx.fillStyle = '#0a0915';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Ship
    if (!this.isGameOver && !this.isPaused) {
      ctx.save();
      ctx.translate(this.ship.x, this.ship.y);
      ctx.rotate(this.ship.angle);
      
      // Thrust flame
      if (this.ship.isThrusting) {
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(-15, -4);
        ctx.lineTo(-12, 0);
        ctx.lineTo(-15, 4);
        ctx.closePath();
        ctx.stroke();
      }

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(15, 0);
      ctx.lineTo(-10, -10);
      ctx.lineTo(-5, 0);
      ctx.lineTo(-10, 10);
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }

    // Bullets
    ctx.fillStyle = '#f59e0b';
    for (const b of this.bullets) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Asteroids
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    for (const a of this.asteroids) {
      ctx.beginPath();
      ctx.arc(a.x, a.y, a.radius, 0, Math.PI * 2);
      ctx.stroke();
    }

    // On-screen Canvas controls for mobile / pointer players
    const midX = canvas.width / 2;
    const ctrlY = canvas.height - 40;
    
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.5;

    // Rotate left
    ctx.beginPath(); ctx.arc(midX - 80, ctrlY, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Rotate right
    ctx.beginPath(); ctx.arc(midX - 20, ctrlY, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Thrust
    ctx.beginPath(); ctx.arc(midX + 40, ctrlY, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Fire
    ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.beginPath(); ctx.arc(midX + 100, ctrlY, 20, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.font = 'bold 11px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◄', midX - 80, ctrlY);
    ctx.fillText('►', midX - 20, ctrlY);
    ctx.fillText('▲', midX + 40, ctrlY);
    
    ctx.fillStyle = '#ef4444';
    ctx.fillText('FIRE', midX + 100, ctrlY);
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);
    
    this.overlayManager?.destroy();
  }
}
