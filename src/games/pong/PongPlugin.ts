import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { GameAudioEngine } from '../core/GameAudioEngine';

export class PongPlugin implements MiniGamePlugin {
  id = 'pong';
  name = 'Retro Pong Tennis';
  subtitle = 'High-velocity rallies & precision angles';
  description = 'Classic high-energy arcade tennis. Deflect accelerating rallies, execute cut-shots, and out-rally intelligent AI tracking or compete in local head-to-head matches.';
  version = '1.0.0';
  genre = 'Action';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '1–3 min';
  category = 'Action';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <path d="M4 6v12M20 6v12" stroke-width="3"/>
      <circle cx="12" cy="12" r="2" fill="currentColor"/>
      <path d="M12 3v18" stroke-dasharray="2 2"/>
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private isPaused = false;
  private overlayManager: GameOverlayManager | null = null;
  private context: GameLaunchContext | null = null;

  private playerPaddle = { y: 0, w: 12, h: 70, speed: 8 };
  private aiPaddle = { y: 0, w: 12, h: 70, speed: 5 };
  private ball = { x: 0, y: 0, vx: 5, vy: 3, radius: 7, speed: 6 };

  private playerScore = 0;
  private aiScore = 0;
  private rallyCount = 0;
  private maxScore = 7;
  private gameMode: 'vsAI' | 'local' = 'vsAI';
  private difficulty: 'easy' | 'medium' | 'hard' = 'medium';

  private isGameOver = false;
  private statusMessage = "First to 7 points wins";

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
    if (scoreVal) scoreVal.textContent = '0 - 0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    if (context.settings.difficulty === 'easy') {
      this.difficulty = 'easy';
      this.aiPaddle.speed = 3.5;
    } else if (context.settings.difficulty === 'hard') {
      this.difficulty = 'hard';
      this.aiPaddle.speed = 7.5;
    } else {
      this.difficulty = 'medium';
      this.aiPaddle.speed = 5.2;
    }

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
        this.lastTickTime = performance.now();
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
      title: 'RETRO PONG TENNIS',
      subtitle: 'Deflect, Rally, & Master Angles',
      description: 'The ultimate digital tennis match. Keep the ball in play, speed up your rallies, and be the first to score 7 points!',
      objective: 'Score 7 points before your opponent does.',
      controls: [
        { key: 'Mouse / Touch', action: 'Move paddle up & down' },
        { key: 'W / S or Arrow Keys', action: 'Keyboard paddle movement' },
        { key: 'P / Esc', action: 'Pause / Resume game' }
      ],
      rules: [
        'The ball speeds up with every successful paddle deflection.',
        'Deflecting with the edges of your paddle executes sharp angular cut-shots.',
        'Play local head-to-head PvP or compete against the training AI bot.'
      ],
      options: {
        difficulties: ['easy', 'medium', 'hard'],
        currentDifficulty: this.difficulty,
        onSelectDifficulty: (diff) => {
          this.difficulty = diff as 'easy' | 'medium' | 'hard';
          if (diff === 'easy') this.aiPaddle.speed = 3.5;
          else if (diff === 'hard') this.aiPaddle.speed = 7.5;
          else this.aiPaddle.speed = 5.2;
          GameAudioEngine.getInstance().playSFX('select');
        },
        modes: ['vsAI', 'local'],
        currentMode: this.gameMode,
        onSelectMode: (mode) => {
          this.gameMode = mode as 'vsAI' | 'local';
          GameAudioEngine.getInstance().playSFX('select');
        }
      },
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { label: 'Player', value: 0, id: 'player' },
          { label: 'Opponent', value: 0, id: 'opponent' },
          { label: 'Rally', value: 0, id: 'rally' }
        ]);
        this.isPaused = false;
        this.startNewGame();
        GameAudioEngine.getInstance().playSFX('click');
        this.lastTickTime = performance.now();
      }
    });
  }

  private lastTickTime = 0;

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

    const moveAmount = 25;
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
      e.preventDefault();
      this.playerPaddle.y = Math.max(0, this.playerPaddle.y - moveAmount);
      GameAudioEngine.getInstance().playSFX('step');
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
      e.preventDefault();
      this.playerPaddle.y = Math.min((this.canvas?.height || 500) - this.playerPaddle.h, this.playerPaddle.y + moveAmount);
      GameAudioEngine.getInstance().playSFX('step');
    }
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

    if (this.playerPaddle.y === 0) {
      this.playerPaddle.y = (this.canvas.height - this.playerPaddle.h) / 2;
      this.aiPaddle.y = (this.canvas.height - this.aiPaddle.h) / 2;
    }
  }

  private startNewGame() {
    this.playerScore = 0;
    this.aiScore = 0;
    this.rallyCount = 0;
    this.isGameOver = false;
    this.statusMessage = "First to 7 points wins";

    this.resetBall(1);
    this.updateHeaderScore();
  }

  private resetBall(direction: number) {
    if (!this.canvas) return;
    this.ball.x = this.canvas.width / 2;
    this.ball.y = this.canvas.height / 2;
    this.ball.speed = 6;

    const angle = (Math.random() * 0.6 - 0.3) * Math.PI; // -30 to +30 deg
    this.ball.vx = direction * this.ball.speed * Math.cos(angle);
    this.ball.vy = this.ball.speed * Math.sin(angle);
    this.rallyCount = 0;
  }

  private updateHeaderScore() {
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = `${this.playerScore} - ${this.aiScore}`;
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const my = e.clientY - rect.top;
    this.playerPaddle.y = Math.max(0, Math.min(this.canvas.height - this.playerPaddle.h, my - this.playerPaddle.h / 2));
  }

  private handleTouchMove(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const my = touch.clientY - rect.top;
    this.playerPaddle.y = Math.max(0, Math.min(this.canvas.height - this.playerPaddle.h, my - this.playerPaddle.h / 2));
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

    const midX = this.canvas.width / 2;
    const controlsY = this.canvas.height - 25;

    // Controls buttons click
    if (Math.abs(mx - (midX - 100)) <= 40 && Math.abs(my - controlsY) <= 14) {
      this.gameMode = 'vsAI';
      this.playSFX('click');
      this.startNewGame();
      return;
    }
    if (Math.abs(mx - (midX - 10)) <= 40 && Math.abs(my - controlsY) <= 14) {
      this.gameMode = 'local';
      this.playSFX('click');
      this.startNewGame();
      return;
    }
    if (Math.abs(mx - (midX + 80)) <= 35 && Math.abs(my - controlsY) <= 14) {
      this.startNewGame();
      this.playSFX('click');
      return;
    }
  }

  private playSFX(type: 'hit' | 'score' | 'win' | 'lose' | 'click') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'hit') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.05);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'score') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.setValueAtTime(200, now + 0.08);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'click') {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'win') {
        const freqs = [392, 523.25, 659.25, 783.99, 1046.5];
        freqs.forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.frequency.setValueAtTime(f, now + i * 0.08);
          g.gain.setValueAtTime(0.05, now + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.22);
          o.start(now + i * 0.08);
          o.stop(now + i * 0.08 + 0.22);
        });
      }
    } catch (e) {}
  }

  private tick() {
    if (!this.isRunning) return;

    if (!this.isGameOver) {
      this.updatePhysics();
    }

    this.render();
    this.animationFrameId = requestAnimationFrame(this.tick.bind(this));
  }

  private updatePhysics() {
    if (!this.canvas) return;
    const width = this.canvas.width;
    const height = this.canvas.height;

    // Ball movement
    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;

    // Top / Bottom Wall Collision
    if (this.ball.y - this.ball.radius <= 0) {
      this.ball.y = this.ball.radius;
      this.ball.vy = Math.abs(this.ball.vy);
      this.playSFX('hit');
    } else if (this.ball.y + this.ball.radius >= height) {
      this.ball.y = height - this.ball.radius;
      this.ball.vy = -Math.abs(this.ball.vy);
      this.playSFX('hit');
    }

    // AI Paddle Movement (Smooth tracking with delay)
    if (this.gameMode === 'vsAI') {
      const targetY = this.ball.y - this.aiPaddle.h / 2;
      const diff = targetY - this.aiPaddle.y;
      this.aiPaddle.y += Math.min(Math.abs(diff), this.aiPaddle.speed) * Math.sign(diff);
      this.aiPaddle.y = Math.max(0, Math.min(height - this.aiPaddle.h, this.aiPaddle.y));
    }

    // Player Paddle Collision (Left side)
    const px = 20;
    if (this.ball.x - this.ball.radius <= px + this.playerPaddle.w && this.ball.x + this.ball.radius >= px) {
      if (this.ball.y >= this.playerPaddle.y && this.ball.y <= this.playerPaddle.y + this.playerPaddle.h) {
        this.ball.x = px + this.playerPaddle.w + this.ball.radius;

        // Angle deflection based on hit position
        const hitPos = (this.ball.y - (this.playerPaddle.y + this.playerPaddle.h / 2)) / (this.playerPaddle.h / 2);
        const maxAngle = Math.PI / 3;
        this.ball.speed = Math.min(14, this.ball.speed + 0.3);

        this.ball.vx = this.ball.speed * Math.cos(hitPos * maxAngle);
        this.ball.vy = this.ball.speed * Math.sin(hitPos * maxAngle);

        this.rallyCount++;
        this.overlayManager?.updateStat('rally', this.rallyCount);
        GameAudioEngine.getInstance().playSFX('hit');
      }
    }

    // AI / Right Paddle Collision
    const ax = width - 20 - this.aiPaddle.w;
    if (this.ball.x + this.ball.radius >= ax && this.ball.x - this.ball.radius <= ax + this.aiPaddle.w) {
      if (this.ball.y >= this.aiPaddle.y && this.ball.y <= this.aiPaddle.y + this.aiPaddle.h) {
        this.ball.x = ax - this.ball.radius;

        const hitPos = (this.ball.y - (this.aiPaddle.y + this.aiPaddle.h / 2)) / (this.aiPaddle.h / 2);
        const maxAngle = Math.PI / 3;
        this.ball.speed = Math.min(14, this.ball.speed + 0.3);

        this.ball.vx = -this.ball.speed * Math.cos(hitPos * maxAngle);
        this.ball.vy = this.ball.speed * Math.sin(hitPos * maxAngle);

        this.rallyCount++;
        this.overlayManager?.updateStat('rally', this.rallyCount);
        GameAudioEngine.getInstance().playSFX('hit');
      }
    }

    // Point Scored (Left / Right boundaries)
    if (this.ball.x + this.ball.radius < 0) {
      // AI scores
      this.aiScore++;
      this.overlayManager?.updateStat('opponent', this.aiScore);
      this.updateHeaderScore();
      GameAudioEngine.getInstance().playSFX('mismatch');

      if (this.aiScore >= this.maxScore) {
        this.triggerGameOver(false);
      } else {
        this.resetBall(1);
      }
    } else if (this.ball.x - this.ball.radius > width) {
      // Player scores
      this.playerScore++;
      this.overlayManager?.updateStat('player', this.playerScore);
      this.updateHeaderScore();
      GameAudioEngine.getInstance().playSFX('score');

      if (this.playerScore >= this.maxScore) {
        this.triggerGameOver(true);
      } else {
        this.resetBall(-1);
      }
    }
  }

  private triggerGameOver(playerWon: boolean) {
    this.isGameOver = true;
    if (playerWon) {
      GameAudioEngine.getInstance().playSFX('win');
    } else {
      GameAudioEngine.getInstance().playSFX('lose');
    }

    this.overlayManager?.showResults({
      title: playerWon ? 'VICTORY' : 'DEFEAT',
      subtitle: playerWon ? 'You out-played the competition!' : 'The training AI was too fast this time.',
      isWin: playerWon,
      score: this.playerScore,
      stats: [
        { label: 'Final Score', value: `${this.playerScore} - ${this.aiScore}` },
        { label: 'Highest Rally', value: this.rallyCount },
        { label: 'Game Mode', value: this.gameMode === 'vsAI' ? `vs AI (${this.difficulty.toUpperCase()})` : 'Local PvP' }
      ],
      onRestart: () => {
        this.restartGame();
      },
      onExit: () => {
        if (this.context?.onExit) this.context.onExit();
      }
    });
  }

  private render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    ctx.fillStyle = '#0a0915';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const midX = canvas.width / 2;

    // Header Status
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isGameOver ? '#ef4444' : '#cbd5e1';
    ctx.fillText(`${this.statusMessage}  (Rally: ${this.rallyCount})`, midX, 22);

    // Center Dashed Net Line
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(midX, 35);
    ctx.lineTo(midX, canvas.height - 45);
    ctx.stroke();
    ctx.setLineDash([]);

    // Player Paddle (Left)
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(20, this.playerPaddle.y, this.playerPaddle.w, this.playerPaddle.h, 4);
    ctx.fill();

    // AI / Right Paddle
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.roundRect(canvas.width - 20 - this.aiPaddle.w, this.aiPaddle.y, this.aiPaddle.w, this.aiPaddle.h, 4);
    ctx.fill();

    // Ball
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
    ctx.fill();

    // Draw standard Pause Button info or tips
    if (this.isPaused && !this.isGameOver) {
      ctx.fillStyle = 'rgba(8, 9, 18, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
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
