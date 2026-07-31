import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';

export class SnakePlugin implements MiniGamePlugin {
  id = 'snake';
  name = 'Recall Snake';
  subtitle = 'Arcade spatial navigation & reflex coordination';
  description = 'Steer a data packet snake through a memory bank grid. Collect memory nodes to expand your database while avoiding collision with boundaries and your own trail, testing quick spatial awareness.';
  version = '1.0.0';
  genre = 'Arcade / Reflex';
  estimatedSessionLength = '2–5 min';
  category = 'Arcade';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  // Snake Logic variables
  private gridWidth = 24;
  private gridHeight = 24;
  private snake: Array<{ x: number; y: number }> = [];
  private direction: 'up' | 'down' | 'left' | 'right' = 'right';
  private nextDirection: 'up' | 'down' | 'left' | 'right' = 'right';
  
  private food: { x: number; y: number; type: 'normal' | 'super' } = { x: 5, y: 5, type: 'normal' };
  private score = 0;
  private highScore = 0;
  private isGameOver = false;

  // Speed and ticks
  private lastTickTime = 0;
  private baseSpeedMs = 140; // milliseconds per grid step
  private speedMs = 140;

  // Visual offsets
  private cellSize = 16;
  private startX = 0;
  private startY = 0;
  private boardPixelWidth = 0;
  private boardPixelHeight = 0;

  // Swipe gesture coords
  private touchStartX = 0;
  private touchStartY = 0;

  // Listeners
  private boundKeyDown: any;
  private boundTouchStart: any;
  private boundTouchEnd: any;
  private boundResize: any;

  launch(context: GameLaunchContext): void {
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

    const savedHighScore = localStorage.getItem('ftp-snake-highscore');
    this.highScore = savedHighScore ? Number(savedHighScore) : 0;

    // Canvas init
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.isRunning = true;
    this.isGameOver = false;
    this.score = 0;
    this.direction = 'right';
    this.nextDirection = 'right';
    this.snake = [
      { x: 5, y: 12 },
      { x: 4, y: 12 },
      { x: 3, y: 12 }
    ];

    this.resizeCanvas();
    this.spawnFood();

    this.lastTickTime = performance.now();

    // Event bindings
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundTouchStart = (e: TouchEvent) => {
      this.touchStartX = e.touches[0].clientX;
      this.touchStartY = e.touches[0].clientY;
    };
    this.boundTouchEnd = (e: TouchEvent) => {
      if (this.isGameOver) {
        this.restartGame();
        return;
      }
      if (e.changedTouches.length === 0) return;
      const dx = e.changedTouches[0].clientX - this.touchStartX;
      const dy = e.changedTouches[0].clientY - this.touchStartY;
      const minDistance = 30;

      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx > minDistance && this.direction !== 'left') this.nextDirection = 'right';
        else if (dx < -minDistance && this.direction !== 'right') this.nextDirection = 'left';
      } else {
        if (dy > minDistance && this.direction !== 'up') this.nextDirection = 'down';
        else if (dy < -minDistance && this.direction !== 'down') this.nextDirection = 'up';
      }
    };
    this.boundResize = this.resizeCanvas.bind(this);

    window.addEventListener('keydown', this.boundKeyDown);
    if (this.canvas) {
      this.canvas.style.touchAction = 'none';
    }
    this.canvas?.addEventListener('touchstart', this.boundTouchStart, { passive: true });
    this.canvas?.addEventListener('touchend', this.boundTouchEnd, { passive: true });
    window.addEventListener('resize', this.boundResize);

    // Gameloop
    this.tick();
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

    // Grid sizing
    const maxBoardW = width * 0.9;
    const maxBoardH = height * 0.75;
    const cellW = maxBoardW / this.gridWidth;
    const cellH = maxBoardH / this.gridHeight;
    this.cellSize = Math.floor(Math.min(cellW, cellH, 18));

    this.boardPixelWidth = this.gridWidth * this.cellSize;
    this.boardPixelHeight = this.gridHeight * this.cellSize;
    this.startX = (width - this.boardPixelWidth) / 2;
    this.startY = (height - this.boardPixelHeight) / 2 + 10;
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.isGameOver) {
      if (e.key === ' ' || e.key === 'Enter') {
        this.restartGame();
      }
      return;
    }

    if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && this.direction !== 'down') {
      e.preventDefault();
      this.nextDirection = 'up';
    } else if ((e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') && this.direction !== 'up') {
      e.preventDefault();
      this.nextDirection = 'down';
    } else if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && this.direction !== 'right') {
      e.preventDefault();
      this.nextDirection = 'left';
    } else if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && this.direction !== 'left') {
      e.preventDefault();
      this.nextDirection = 'right';
    }
  }

  private restartGame() {
    this.isGameOver = false;
    this.score = 0;
    this.direction = 'right';
    this.nextDirection = 'right';
    this.snake = [
      { x: 5, y: 12 },
      { x: 4, y: 12 },
      { x: 3, y: 12 }
    ];
    this.speedMs = this.baseSpeedMs;
    this.spawnFood();
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = '0';
    this.playSynthSFX('restart');
  }

  private spawnFood() {
    let placed = false;
    while (!placed) {
      const rx = Math.floor(Math.random() * this.gridWidth);
      const ry = Math.floor(Math.random() * this.gridHeight);
      
      // Ensure food does not spawn inside the snake body
      const collides = this.snake.some(segment => segment.x === rx && segment.y === ry);
      if (!collides) {
        // 15% chance of spawning a super food node
        const isSuper = Math.random() < 0.15;
        this.food = { x: rx, y: ry, type: isSuper ? 'super' : 'normal' };
        placed = true;
      }
    }
  }

  private moveSnake() {
    this.direction = this.nextDirection;
    
    // Head coordinates
    const head = { ...this.snake[0] };
    if (this.direction === 'up') head.y--;
    else if (this.direction === 'down') head.y++;
    else if (this.direction === 'left') head.x--;
    else if (this.direction === 'right') head.x++;

    // 1. Wall Collisions (cyber warp walls option or standard crash. Standard crash is fun!)
    if (head.x < 0 || head.x >= this.gridWidth || head.y < 0 || head.y >= this.gridHeight) {
      this.triggerGameOver();
      return;
    }

    // 2. Self Collisions
    const selfCrash = this.snake.some(segment => segment.x === head.x && segment.y === head.y);
    if (selfCrash) {
      this.triggerGameOver();
      return;
    }

    // Unshift head segment
    this.snake.unshift(head);

    // 3. Food Collection
    if (head.x === this.food.x && head.y === this.food.y) {
      const isSuper = this.food.type === 'super';
      this.score += isSuper ? 300 : 100;
      this.updateHighscores();

      const scoreVal = document.getElementById('bb-score-val');
      if (scoreVal) scoreVal.textContent = String(this.score);

      // Speed up game gradually
      this.speedMs = Math.max(65, this.baseSpeedMs - Math.floor(this.score / 150) * 4);

      this.playSynthSFX(isSuper ? 'superFood' : 'eat');
      this.spawnFood();
    } else {
      // Pop tail segment to maintain length
      this.snake.pop();
    }
  }

  private triggerGameOver() {
    this.isGameOver = true;
    this.playSynthSFX('gameover');
  }

  private updateHighscores() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem('ftp-snake-highscore', String(this.highScore));
    }
  }

  private playSynthSFX(type: 'eat' | 'superFood' | 'restart' | 'gameover') {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();

      if (type === 'eat') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'superFood') {
        const freqs = [523.25, 783.99, 1046.50];
        freqs.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.04);
          gain.gain.setValueAtTime(0.06, ctx.currentTime + i * 0.04);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.04 + 0.15);
          osc.start(ctx.currentTime + i * 0.04);
          osc.stop(ctx.currentTime + i * 0.04 + 0.15);
        });
      } else if (type === 'restart') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'gameover') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.3);
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      }
    } catch(e) {}
  }

  private tick() {
    if (!this.isRunning) return;

    const now = performance.now();
    if (!this.isGameOver && now - this.lastTickTime >= this.speedMs) {
      this.moveSnake();
      this.lastTickTime = now;
    }

    this.render();

    this.animationFrameId = requestAnimationFrame(this.tick.bind(this));
  }

  private render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    // Dark canvas background
    ctx.fillStyle = '#0a0915';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Dashboard Top (Highscore / Speed)
    const headerY = this.startY - 35;
    
    // High Score Box
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(this.startX + this.boardPixelWidth - 120, headerY - 18, 120, 32, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = '8px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'var(--text3)';
    ctx.textAlign = 'center';
    ctx.fillText('HIGH SCORE', this.startX + this.boardPixelWidth - 60, headerY - 6);

    ctx.font = 'bold 13px "DM Mono", monospace';
    ctx.fillStyle = '#10b981';
    ctx.fillText(String(this.highScore), this.startX + this.boardPixelWidth - 60, headerY + 8);

    // Guidance text
    ctx.font = '11px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'var(--text3)';
    ctx.textAlign = 'left';
    ctx.fillText('Arrow keys / WASD to Steer', this.startX, headerY + 4);

    // 2. Play Board Matrix Outline
    ctx.fillStyle = '#100f24';
    ctx.beginPath();
    ctx.roundRect(this.startX, this.startY, this.boardPixelWidth, this.boardPixelHeight, 8);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(this.startX, this.startY, this.boardPixelWidth, this.boardPixelHeight);

    // 3. Draw Snake Segment Trails
    this.snake.forEach((segment, index) => {
      const cx = this.startX + segment.x * this.cellSize;
      const cy = this.startY + segment.y * this.cellSize;
      const isHead = index === 0;

      // Color gradient down body segments
      if (isHead) {
        ctx.fillStyle = '#10b981'; // vibrant emerald head
      } else {
        const colorRatio = (this.snake.length - index) / this.snake.length;
        ctx.fillStyle = `rgba(16, 185, 129, ${0.3 + 0.6 * colorRatio})`;
      }

      ctx.beginPath();
      // Rounded circles for body snake cells
      ctx.roundRect(cx + 1, cy + 1, this.cellSize - 2, this.cellSize - 2, isHead ? 6 : 4);
      ctx.fill();

      // Mini visor eye indicator on head
      if (isHead) {
        ctx.fillStyle = '#ffffff';
        let eyeX = cx + this.cellSize/2;
        let eyeY = cy + this.cellSize/2;
        if (this.direction === 'right') { eyeX += 3; eyeY -= 1; }
        else if (this.direction === 'left') { eyeX -= 3; eyeY -= 1; }
        else if (this.direction === 'up') { eyeY -= 3; eyeX -= 1; }
        else if (this.direction === 'down') { eyeY += 3; eyeX -= 1; }
        ctx.beginPath();
        ctx.arc(eyeX, eyeY, 1.5, 0, Math.PI*2);
        ctx.fill();
      }
    });

    // 4. Draw Food Nodes
    const fx = this.startX + this.food.x * this.cellSize;
    const fy = this.startY + this.food.y * this.cellSize;
    const isSuper = this.food.type === 'super';

    ctx.shadowBlur = isSuper ? 12 : 4;
    ctx.shadowColor = isSuper ? '#f43f5e' : '#ec4899';
    ctx.fillStyle = isSuper ? '#f43f5e' : '#ec4899'; // Super pink capsule vs normal warning

    ctx.beginPath();
    ctx.arc(fx + this.cellSize/2, fy + this.cellSize/2, isSuper ? this.cellSize/3 : this.cellSize/4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0; // reset shadow

    // 5. Game Over overlay
    if (this.isGameOver) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = 'bold 24px "Fraunces", serif';
      ctx.fillStyle = '#ef4444';
      ctx.textAlign = 'center';
      ctx.fillText('MEMORY CRASH DETECTED', canvas.width / 2, this.startY + this.boardPixelHeight / 2 - 10);

      ctx.font = '13px "Space Grotesk", sans-serif';
      ctx.fillStyle = 'var(--text3)';
      ctx.fillText('Press SPACE / ENTER or tap screen to reboot snake.', canvas.width / 2, this.startY + this.boardPixelHeight / 2 + 15);
    }
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // Unbind listeners
    window.removeEventListener('keydown', this.boundKeyDown);
    if (this.canvas) {
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
      this.canvas.removeEventListener('touchend', this.boundTouchEnd);
    }
    window.removeEventListener('resize', this.boundResize);

    // Restore original panel header attributes
    const titleEl = document.getElementById('game-panel-title');
    const subtitleEl = document.getElementById('game-panel-subtitle');
    const scoreLabel = document.getElementById('game-panel-score-label');
    const scoreVal = document.getElementById('bb-score-val');
    const iconEl = document.getElementById('game-panel-icon');

    if (titleEl) titleEl.textContent = 'Blade Bedlam';
    if (subtitleEl) subtitleEl.textContent = 'Action Slasher Clone · Custom Coded';
    if (scoreLabel) scoreLabel.textContent = 'Score:';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) {
      iconEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 18px; height: 18px;">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 12h4M10 10v4M15 11h.01M18 13h.01" />
        </svg>
      `;
    }
  }
}
