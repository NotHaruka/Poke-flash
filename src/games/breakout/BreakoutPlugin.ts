import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { GameAudioEngine } from '../core/GameAudioEngine';
import { GameJuice } from '../core/GameJuice';

interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  color: string;
  points: number;
}

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  attached: boolean;
}

interface PowerUp {
  x: number;
  y: number;
  type: 'wide' | 'multiball' | 'laser' | 'life';
  active: boolean;
}

export class BreakoutPlugin implements MiniGamePlugin {
  id = 'breakout';
  name = 'Recall Breakout';
  subtitle = 'Reflexes, trajectories & brick demolition';
  description = 'Demolish multi-layered brick barriers with dynamic paddle deflection mechanics, dropping tactical power-ups, and escalating multi-ball challenges.';
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
      <rect x="3" y="4" width="5" height="3" rx="1"/>
      <rect x="9" y="4" width="5" height="3" rx="1"/>
      <rect x="15" y="4" width="5" height="3" rx="1"/>
      <rect x="6" y="8" width="5" height="3" rx="1"/>
      <rect x="12" y="8" width="5" height="3" rx="1"/>
      <circle cx="12" cy="16" r="2" fill="currentColor"/>
      <path d="M7 20h10" stroke-width="3"/>
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private isPaused = false;
  private overlayManager: GameOverlayManager | null = null;
  private context: GameLaunchContext | null = null;
  private juice = new GameJuice();
  private difficulty: 'easy' | 'medium' | 'hard' = 'medium';

  private paddle = { x: 0, y: 0, w: 90, h: 12, speed: 8 };
  private balls: Ball[] = [];
  private bricks: Brick[] = [];
  private powerUps: PowerUp[] = [];

  private score = 0;
  private lives = 3;
  private level = 1;
  private isGameOver = false;
  private isWon = false;
  private statusMessage = '';

  // Listeners
  private boundMouseMove: any;
  private boundTouchMove: any;
  private boundMouseDown: any;
  private boundTouchStart: any;
  private boundResize: any;
  private boundKeyDown: any;

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

    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundResize = this.resizeCanvas.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);

    if (this.canvas) {
      this.canvas.style.touchAction = 'none';
      this.canvas.addEventListener('mousemove', this.boundMouseMove);
      this.canvas.addEventListener('touchmove', this.boundTouchMove, { passive: false });
      this.canvas.addEventListener('mousedown', this.boundMouseDown);
      this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    }
    window.addEventListener('resize', this.boundResize);
    window.addEventListener('keydown', this.boundKeyDown);

    this.showHelpOverlay();
    this.tick();
  }

  private showHelpOverlay() {
    this.isPaused = true;
    this.overlayManager?.showInstructions({
      title: 'RECALL BREAKOUT',
      subtitle: 'Precision, Trajectories & Barriers',
      description: 'Deflect high-speed balls to smash layered walls of blocks. Gather falling power-ups like expand, multi-ball, lasers, and extra lives to master the game.',
      objective: 'Clear all layers of brick barriers to progress.',
      controls: [
        { key: 'Mouse / Drag', action: 'Move paddle left & right' },
        { key: 'A / D or Arrow Keys', action: 'Keyboard paddle movement' },
        { key: 'Space / Tap', action: 'Launch attached ball / Fire lasers' },
        { key: 'P / Esc', action: 'Pause / Resume game' }
      ],
      rules: [
        'Smashing colored bricks scores points and releases power-ups.',
        'Bricks near the top are reinforced and require multiple deflections.',
        'If all balls drop below the screen, you lose a life.'
      ],
      options: {
        difficulties: ['easy', 'medium', 'hard'],
        currentDifficulty: this.difficulty,
        onSelectDifficulty: (diff) => {
          this.difficulty = diff as 'easy' | 'medium' | 'hard';
          if (diff === 'easy') {
            this.paddle.w = 110;
          } else if (diff === 'hard') {
            this.paddle.w = 70;
          } else {
            this.paddle.w = 90;
          }
          GameAudioEngine.getInstance().playSFX('select');
        }
      },
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { label: 'Score', value: 0, id: 'score' },
          { label: 'Lives', value: 3, id: 'lives' },
          { label: 'Level', value: 1, id: 'level' }
        ]);
        this.isPaused = false;
        this.startNewGame();
        GameAudioEngine.getInstance().playSFX('click');
        this.juice.reset();
        this.juice.startCountdown(() => {});
      }
    });
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (!this.isGameOver && !this.isWon && this.overlayManager) {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
          this.overlayManager.pause();
        } else {
          this.overlayManager.resume();
        }
      }
      return;
    }

    if (this.isGameOver || this.isWon || this.isPaused) return;

    const moveAmount = 30;
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
      e.preventDefault();
      this.paddle.x = Math.max(0, this.paddle.x - moveAmount);
      this.syncAttachedBalls();
      GameAudioEngine.getInstance().playSFX('step');
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
      e.preventDefault();
      this.paddle.x = Math.min((this.canvas?.width || 800) - this.paddle.w, this.paddle.x + moveAmount);
      this.syncAttachedBalls();
      GameAudioEngine.getInstance().playSFX('step');
    } else if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      this.launchBall();
    }
  }

  private syncAttachedBalls() {
    for (const b of this.balls) {
      if (b.attached) {
        b.x = this.paddle.x + this.paddle.w / 2;
      }
    }
  }

  private launchBall() {
    let launched = false;
    for (const b of this.balls) {
      if (b.attached) {
        b.attached = false;
        b.vx = (Math.random() > 0.5 ? 1 : -1) * (4 + this.level * 0.5);
        b.vy = -(5 + this.level * 0.5);
        launched = true;
      }
    }
    if (launched) {
      GameAudioEngine.getInstance().playSFX('shoot');
    }
  }

  private restartGame() {
    this.overlayManager?.hideResults();
    this.overlayManager?.resume();
    this.isGameOver = false;
    this.isWon = false;
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

    this.paddle.y = this.canvas.height - 45;
    if (this.paddle.x === 0) {
      this.paddle.x = (this.canvas.width - this.paddle.w) / 2;
    }
  }

  private startNewGame() {
    this.score = 0;
    this.lives = 3;
    this.level = 1;
    this.isGameOver = false;
    this.isWon = false;

    if (this.difficulty === 'easy') {
      this.paddle.w = 110;
    } else if (this.difficulty === 'hard') {
      this.paddle.w = 70;
    } else {
      this.paddle.w = 90;
    }
    this.paddle.x = (this.canvas ? this.canvas.width : 400 - this.paddle.w) / 2;

    this.resetBallAndPaddle();
    this.createBricksForLevel();
    this.updateHeaderScore();
  }

  private resetBallAndPaddle() {
    this.balls = [{
      x: this.paddle.x + this.paddle.w / 2,
      y: this.paddle.y - 10,
      vx: (Math.random() > 0.5 ? 1 : -1) * (4 + this.level * 0.5),
      vy: -(5 + this.level * 0.5),
      radius: 6,
      attached: true
    }];
  }

  private createBricksForLevel() {
    if (!this.canvas) return;
    this.bricks = [];
    this.powerUps = [];

    const rows = 5;
    const cols = 8;
    const padding = 6;
    const offsetTop = 40;
    const offsetLeft = 20;

    const availableW = this.canvas.width - offsetLeft * 2;
    const brickW = (availableW - (cols - 1) * padding) / cols;
    const brickH = 16;

    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#38bdf8'];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const hp = r === 0 ? 2 : 1; // Top row takes 2 hits
        this.bricks.push({
          x: offsetLeft + c * (brickW + padding),
          y: offsetTop + r * (brickH + padding),
          w: brickW,
          h: brickH,
          hp,
          maxHp: hp,
          color: colors[r % colors.length],
          points: (rows - r) * 10
        });
      }
    }
  }

  private updateHeaderScore() {
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.score);
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    this.setPaddlePosition(mx);
  }

  private handleTouchMove(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const mx = touch.clientX - rect.left;
    this.setPaddlePosition(mx);
  }

  private setPaddlePosition(mx: number) {
    if (!this.canvas) return;
    this.paddle.x = Math.max(0, Math.min(this.canvas.width - this.paddle.w, mx - this.paddle.w / 2));

    // Move attached ball with paddle
    for (const b of this.balls) {
      if (b.attached) {
        b.x = this.paddle.x + this.paddle.w / 2;
      }
    }
  }

  private handleTouchStart(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    this.processClickAt(touch.clientX - rect.left, touch.clientY - rect.top);
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.processClickAt(e.clientX - rect.left, e.clientY - rect.top);
  }

  private processClickAt(mx: number, my: number) {
    if (!this.canvas) return;

    // Launch attached ball
    for (const b of this.balls) {
      if (b.attached) {
        b.attached = false;
        this.playSFX('bounce');
      }
    }

    // Restart button click
    const midX = this.canvas.width / 2;
    const restartY = this.canvas.height - 20;
    if (Math.abs(mx - midX) <= 40 && Math.abs(my - restartY) <= 14) {
      this.startNewGame();
      this.playSFX('click');
    }
  }

  private playSFX(type: 'bounce' | 'brick' | 'powerup' | 'win' | 'lose' | 'click') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'bounce') {
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(450, now + 0.05);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'brick') {
        osc.frequency.setValueAtTime(550, now);
        osc.frequency.exponentialRampToValueAtTime(200, now + 0.07);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        osc.start(now);
        osc.stop(now + 0.07);
      } else if (type === 'powerup') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'click') {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      }
    } catch (e) {}
  }

  private tick() {
    if (!this.isRunning) return;

    this.juice.update(1.0);

    if (!this.isGameOver && !this.isWon && !this.isPaused) {
      this.updatePhysics();
    }

    this.render();
    this.animationFrameId = requestAnimationFrame(this.tick.bind(this));
  }

  private updatePhysics() {
    if (!this.canvas) return;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Update Balls
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const b = this.balls[i];
      if (b.attached) continue;

      b.x += b.vx;
      b.y += b.vy;

      // Wall Bounce (Left / Right)
      if (b.x - b.radius <= 0) {
        b.x = b.radius;
        b.vx = Math.abs(b.vx);
        GameAudioEngine.getInstance().playSFX('hit');
      } else if (b.x + b.radius >= width) {
        b.x = width - b.radius;
        b.vx = -Math.abs(b.vx);
        GameAudioEngine.getInstance().playSFX('hit');
      }

      // Ceiling Bounce
      if (b.y - b.radius <= 0) {
        b.y = b.radius;
        b.vy = Math.abs(b.vy);
        GameAudioEngine.getInstance().playSFX('hit');
      }

      // Paddle Collision
      if (b.y + b.radius >= this.paddle.y && b.y - b.radius <= this.paddle.y + this.paddle.h) {
        if (b.x >= this.paddle.x && b.x <= this.paddle.x + this.paddle.w) {
          b.y = this.paddle.y - b.radius;

          // Deflection angle based on hit position
          const hitPos = (b.x - (this.paddle.x + this.paddle.w / 2)) / (this.paddle.w / 2);
          const maxAngle = Math.PI / 3; // 60 deg max
          const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);

          b.vx = speed * Math.sin(hitPos * maxAngle);
          b.vy = -speed * Math.cos(hitPos * maxAngle);

          GameAudioEngine.getInstance().playSFX('hit');
        }
      }

      // Brick Collisions
      for (let j = this.bricks.length - 1; j >= 0; j--) {
        const brick = this.bricks[j];

        if (b.x + b.radius >= brick.x && b.x - b.radius <= brick.x + brick.w &&
            b.y + b.radius >= brick.y && b.y - b.radius <= brick.y + brick.h) {

          b.vy = -b.vy; // Bounce vertical
          brick.hp--;

          if (brick.hp <= 0) {
            this.score += brick.points;
            this.overlayManager?.updateStat('score', this.score);
            this.updateHeaderScore();
            GameAudioEngine.getInstance().playSFX('score');

            // Brick destruction Juice VFX
            const brickCx = brick.x + brick.w / 2;
            const brickCy = brick.y + brick.h / 2;
            this.juice.spawnExplosion(brickCx, brickCy, { count: 10, color: brick.color, sizeRange: [2, 5], speedRange: [2, 6] });
            this.juice.spawnText(brickCx, brickCy, `+${brick.points}`, { color: brick.color, fontSize: 14 });
            this.juice.shake(3);

            // Spawn powerup chance
            if (Math.random() < 0.25) {
              const types: ('wide' | 'multiball' | 'life')[] = ['wide', 'multiball', 'life'];
              this.powerUps.push({
                x: brickCx,
                y: brickCy,
                type: types[Math.floor(Math.random() * types.length)],
                active: true
              });
            }

            this.bricks.splice(j, 1);
          } else {
            GameAudioEngine.getInstance().playSFX('tap');
            const brickCx = brick.x + brick.w / 2;
            const brickCy = brick.y + brick.h / 2;
            this.juice.spawnExplosion(brickCx, brickCy, { count: 4, color: '#ffffff', sizeRange: [1, 3], speedRange: [1, 3] });
          }
          break;
        }
      }

      // Bottom boundary (Ball Loss)
      if (b.y - b.radius > height) {
        this.balls.splice(i, 1);
      }
    }

    // Check if all balls lost
    if (this.balls.length === 0) {
      this.lives--;
      this.overlayManager?.updateStat('lives', this.lives);
      this.juice.shake(10);
      this.juice.spawnText(width / 2, height / 2, '-1 LIFE', { color: '#ef4444', fontSize: 20 });
      if (this.lives <= 0) {
        this.triggerGameOver(false);
      } else {
        GameAudioEngine.getInstance().playSFX('mismatch');
        this.resetBallAndPaddle();
      }
    }

    // Check Win
    if (this.bricks.length === 0) {
      this.triggerGameOver(true);
    }

    // Update PowerUps
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.y += 2.5;

      // Catch powerup
      if (p.y >= this.paddle.y && p.y <= this.paddle.y + this.paddle.h && p.x >= this.paddle.x && p.x <= this.paddle.x + this.paddle.w) {
        this.applyPowerUp(p.type);
        this.juice.spawnExplosion(p.x, p.y, { count: 8, color: '#eab308', sizeRange: [2, 4], speedRange: [2, 5] });
        this.juice.spawnText(p.x, p.y - 10, p.type.toUpperCase(), { color: '#eab308', fontSize: 13 });
        this.powerUps.splice(i, 1);
        GameAudioEngine.getInstance().playSFX('powerup');
      } else if (p.y > height) {
        this.powerUps.splice(i, 1);
      }
    }
  }

  private triggerGameOver(isWin: boolean) {
    if (isWin) {
      this.isWon = true;
      GameAudioEngine.getInstance().playSFX('win');
      this.juice.spawnConfetti(this.canvas?.width || 400, this.canvas?.height || 600);
      this.juice.bounceZoom(1.12);
    } else {
      this.isGameOver = true;
      GameAudioEngine.getInstance().playSFX('lose');
      this.juice.shake(14);
    }

    this.overlayManager?.showResults({
      title: isWin ? 'VICTORY' : 'GAME OVER',
      subtitle: isWin ? 'Superb block-breaking mastery!' : `You ran out of lives.`,
      isWin,
      score: this.score,
      stats: [
        { label: 'Final Score', value: this.score },
        { label: 'Level Achieved', value: this.level },
        { label: 'Remaining Lives', value: this.lives }
      ],
      onRestart: () => {
        this.restartGame();
      },
      onExit: () => {
        if (this.context?.onExit) this.context.onExit();
      }
    });
  }

  private applyPowerUp(type: 'wide' | 'multiball' | 'laser' | 'life') {
    if (type === 'wide') {
      this.paddle.w = Math.min(140, this.paddle.w + 30);
    } else if (type === 'multiball') {
      if (this.balls.length > 0) {
        const b = this.balls[0];
        this.balls.push({
          x: b.x,
          y: b.y,
          vx: -b.vx,
          vy: b.vy,
          radius: b.radius,
          attached: false
        });
      }
    } else if (type === 'life') {
      this.lives = Math.min(5, this.lives + 1);
      this.overlayManager?.updateStat('lives', this.lives);
    }
  }

  private render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    ctx.fillStyle = '#0a0915';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    this.juice.applyCameraTransforms(ctx, canvas.width, canvas.height);

    const midX = canvas.width / 2;

    // Header Info
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Lives: ${'♥ '.repeat(this.lives)}   |   Level: ${this.level}`, midX, 22);

    // Render Bricks
    for (const b of this.bricks) {
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, 3);
      ctx.fill();

      // Top Highlight
      ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
      ctx.fillRect(b.x, b.y, b.w, 2);
    }

    // Render Paddle
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(this.paddle.x, this.paddle.y, this.paddle.w, this.paddle.h, 6);
    ctx.fill();

    // Render Balls
    for (const b of this.balls) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Render Powerups
    for (const p of this.powerUps) {
      ctx.fillStyle = p.type === 'wide' ? '#22c55e' : (p.type === 'multiball' ? '#eab308' : '#ef4444');
      ctx.beginPath();
      ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 8px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.type[0].toUpperCase(), p.x, p.y);
    }

    // Overlay darkness on pause
    if (this.isPaused && !this.isGameOver && !this.isWon) {
      ctx.fillStyle = 'rgba(8, 9, 18, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    this.juice.restoreCameraTransforms(ctx);
    this.juice.draw(ctx);
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    if (this.overlayManager) {
      this.overlayManager.destroy();
      this.overlayManager = null;
    }

    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
      this.canvas.removeEventListener('touchmove', this.boundTouchMove);
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('keydown', this.boundKeyDown);

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
