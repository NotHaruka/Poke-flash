import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { GameAudioEngine } from '../core/GameAudioEngine';

interface MemoryCard {
  id: number;
  icon: string;
  flipped: boolean;
  matched: boolean;
  flipProgress: number; // 0 (back) to 1 (front)
}

export class MemoryMatchPlugin implements MiniGamePlugin {
  id = 'memory_match';
  name = 'Memory Match';
  subtitle = 'Visual recognition & concentration';
  description = 'Test active recall and spatial memory by matching hidden pairs across multiple grid sizes. Features fluid 3D card flips, precision move counters, and timed performance scoring.';
  version = '1.0.0';
  genre = 'Puzzle';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '2–4 min';
  category = 'Puzzle';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <rect x="2" y="4" width="9" height="12" rx="2"/>
      <rect x="13" y="8" width="9" height="12" rx="2"/>
      <path d="M6 8v4M17 12v4"/>
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private isPaused = false;
  private overlayManager: GameOverlayManager | null = null;
  private context: GameLaunchContext | null = null;

  private cards: MemoryCard[] = [];
  private selectedIndices: number[] = [];
  private gridRows = 4;
  private gridCols = 4; // Default Medium: 16 cards (8 pairs)
  private difficulty: 'easy' | 'medium' | 'hard' = 'medium';

  private movesCount = 0;
  private matchesFound = 0;
  private totalPairs = 8;

  private timerSeconds = 0;
  private timerInterval: any = null;
  private statusMessage = "Tap cards to uncover matching pairs";
  private isWon = false;
  private isLockInput = false;

  // Layout metrics
  private cardWidth = 0;
  private cardHeight = 0;
  private startX = 0;
  private startY = 0;

  // Listeners
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
    if (scoreLabel) scoreLabel.textContent = 'Moves:';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    if (context.settings.difficulty === 'easy') {
      this.difficulty = 'easy';
      this.gridRows = 3;
      this.gridCols = 4;
      this.totalPairs = 6;
    } else if (context.settings.difficulty === 'hard') {
      this.difficulty = 'hard';
      this.gridRows = 4;
      this.gridCols = 6;
      this.totalPairs = 12;
    } else {
      this.difficulty = 'medium';
      this.gridRows = 4;
      this.gridCols = 4;
      this.totalPairs = 8;
    }

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.isRunning = true;
    this.isPaused = false;
    this.isWon = false;

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

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundResize = this.resizeCanvas.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);

    if (this.canvas) {
      this.canvas.style.touchAction = 'none';
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
      title: 'MEMORY MATCH',
      subtitle: 'Visual Concentration & Recall',
      description: 'Test your spatial recall and concentration speeds. Uncover cards and find all identical pairs in the shortest time and with the fewest moves possible!',
      objective: 'Reveal and match all card pairs on the board.',
      controls: [
        { key: 'Mouse / Touch', action: 'Tap/Click card to reveal its icon' },
        { key: 'P / Esc', action: 'Pause / Resume game' }
      ],
      rules: [
        'Flip two cards. If they match, they remain face up.',
        'If they do not match, they flip back after a brief glance.',
        'Use the options below to change grid difficulty and card counts.'
      ],
      options: {
        difficulties: ['easy', 'medium', 'hard'],
        currentDifficulty: this.difficulty,
        onSelectDifficulty: (diff) => {
          this.difficulty = diff as 'easy' | 'medium' | 'hard';
          if (diff === 'easy') {
            this.gridRows = 3; this.gridCols = 4; this.totalPairs = 6;
          } else if (diff === 'hard') {
            this.gridRows = 4; this.gridCols = 6; this.totalPairs = 12;
          } else {
            this.gridRows = 4; this.gridCols = 4; this.totalPairs = 8;
          }
          this.resizeCanvas();
          GameAudioEngine.getInstance().playSFX('select');
        }
      },
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { label: 'Moves', value: 0, id: 'moves' },
          { label: 'Matches', value: '0 / 8', id: 'matches' },
          { label: 'Timer', value: '0s', id: 'timer' }
        ]);
        this.overlayManager?.updateStat('matches', `0 / ${this.totalPairs}`);
        this.isPaused = false;
        this.startNewGame();
        GameAudioEngine.getInstance().playSFX('click');
      }
    });
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (!this.isWon && this.overlayManager) {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
          this.overlayManager.pause();
        } else {
          this.overlayManager.resume();
        }
      }
    }
  }

  private restartGame() {
    this.overlayManager?.hideResults();
    this.overlayManager?.resume();
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

    const width = this.canvas.width;
    const height = this.canvas.height;

    const gap = 10;
    const maxW = (width - 40 - (this.gridCols - 1) * gap) / this.gridCols;
    const maxH = (height - 120 - (this.gridRows - 1) * gap) / this.gridRows;

    this.cardWidth = Math.min(maxW, maxH, 72);
    this.cardHeight = this.cardWidth;

    const totalW = this.gridCols * this.cardWidth + (this.gridCols - 1) * gap;
    const totalH = this.gridRows * this.cardHeight + (this.gridRows - 1) * gap;

    this.startX = (width - totalW) / 2;
    this.startY = (height - totalH) / 2 - 20;
  }

  private startNewGame() {
    this.movesCount = 0;
    this.matchesFound = 0;
    this.isWon = false;
    this.isLockInput = false;
    this.selectedIndices = [];
    this.statusMessage = "Tap cards to uncover matching pairs";

    this.overlayManager?.updateStat('moves', this.movesCount);
    this.overlayManager?.updateStat('matches', `0 / ${this.totalPairs}`);
    this.overlayManager?.updateStat('timer', '0s');

    this.timerSeconds = 0;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.isWon && this.isRunning && !this.isPaused) {
        this.timerSeconds++;
        this.overlayManager?.updateStat('timer', `${this.timerSeconds}s`);
      }
    }, 1000);

    const iconsPool = ['⚡', '🧠', '🔮', '💎', '🔥', '🌟', '🚀', '🎯', '🪐', '👑', '🌈', '🎨'];
    const chosenIcons = iconsPool.slice(0, this.totalPairs);

    // Duplicate for pairs
    const deckIcons = [...chosenIcons, ...chosenIcons];

    // Shuffle deck
    for (let i = deckIcons.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deckIcons[i], deckIcons[j]] = [deckIcons[j], deckIcons[i]];
    }

    this.cards = deckIcons.map((icon, idx) => ({
      id: idx,
      icon,
      flipped: false,
      matched: false,
      flipProgress: 0
    }));

    this.updateHeaderScore();
  }

  private updateHeaderScore() {
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.movesCount);
  }

  private handleTouchStart(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const mx = touch.clientX - rect.left;
    const my = touch.clientY - rect.top;
    this.processInputAt(mx, my);
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    this.processInputAt(mx, my);
  }

  private processInputAt(mx: number, my: number) {
    if (!this.canvas) return;

    if (this.isWon || this.isPaused || this.isLockInput) return;

    // Card grid touch
    const gap = 10;
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        const cx = this.startX + c * (this.cardWidth + gap);
        const cy = this.startY + r * (this.cardHeight + gap);

        if (mx >= cx && mx <= cx + this.cardWidth && my >= cy && my <= cy + this.cardHeight) {
          const cardIdx = r * this.gridCols + c;
          const card = this.cards[cardIdx];

          if (card && !card.flipped && !card.matched) {
            this.flipCard(cardIdx);
          }
          return;
        }
      }
    }
  }

  private flipCard(index: number) {
    const card = this.cards[index];
    card.flipped = true;
    this.selectedIndices.push(index);
    GameAudioEngine.getInstance().playSFX('tap');

    if (this.selectedIndices.length === 2) {
      this.movesCount++;
      this.overlayManager?.updateStat('moves', this.movesCount);
      this.updateHeaderScore();
      this.isLockInput = true;

      const idx1 = this.selectedIndices[0];
      const idx2 = this.selectedIndices[1];
      const card1 = this.cards[idx1];
      const card2 = this.cards[idx2];

      if (card1.icon === card2.icon) {
        // Match found!
        setTimeout(() => {
          card1.matched = true;
          card2.matched = true;
          this.matchesFound++;
          this.overlayManager?.updateStat('matches', `${this.matchesFound} / ${this.totalPairs}`);
          this.selectedIndices = [];
          this.isLockInput = false;
          GameAudioEngine.getInstance().playSFX('score');

          if (this.matchesFound === this.totalPairs) {
            this.isWon = true;
            this.statusMessage = "ALL PAIRS MATCHED! CONGRATULATIONS!";
            GameAudioEngine.getInstance().playSFX('win');

            this.overlayManager?.showResults({
              title: 'VICTORY',
              subtitle: 'Incredible memory recall speed!',
              isWin: true,
              score: this.movesCount,
              stats: [
                { label: 'Moves Taken', value: this.movesCount },
                { label: 'Time Elapsed', value: `${this.timerSeconds}s` },
                { label: 'Matches Found', value: `${this.matchesFound} / ${this.totalPairs}` }
              ],
              onRestart: () => {
                this.restartGame();
              },
              onExit: () => {
                if (this.context?.onExit) this.context.onExit();
              }
            });
          }
        }, 300);
      } else {
        // Mismatch - flip back
        setTimeout(() => {
          card1.flipped = false;
          card2.flipped = false;
          this.selectedIndices = [];
          this.isLockInput = false;
          GameAudioEngine.getInstance().playSFX('bounce');
        }, 900);
      }
    }
  }

  private tick() {
    if (!this.isRunning) return;

    if (!this.isPaused) {
      // Update 3D card flip progress animations
      for (const card of this.cards) {
        if (card.flipped && card.flipProgress < 1) {
          card.flipProgress = Math.min(1, card.flipProgress + 0.12);
        } else if (!card.flipped && card.flipProgress > 0) {
          card.flipProgress = Math.max(0, card.flipProgress - 0.12);
        }
      }
    }

    this.render();
    this.animationFrameId = requestAnimationFrame(this.tick.bind(this));
  }

  private render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    ctx.fillStyle = '#0a0915';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const midX = canvas.width / 2;
    const gap = 10;

    // Header Status
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isWon ? '#10b981' : '#cda250';
    ctx.fillText(`${this.statusMessage} (${this.matchesFound}/${this.totalPairs} Pairs)`, midX, this.startY - 16);

    // Render Cards Grid
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        const cardIdx = r * this.gridCols + c;
        const card = this.cards[cardIdx];
        if (!card) continue;

        const cx = this.startX + c * (this.cardWidth + gap);
        const cy = this.startY + r * (this.cardHeight + gap);

        const scaleX = Math.abs(Math.cos(card.flipProgress * Math.PI / 2));
        const showFront = card.flipProgress >= 0.5;

        ctx.save();
        ctx.translate(cx + this.cardWidth / 2, cy + this.cardHeight / 2);
        ctx.scale(scaleX, 1);

        if (showFront) {
          // Card Front
          ctx.fillStyle = card.matched ? 'rgba(16, 185, 129, 0.15)' : '#ffffff';
          ctx.beginPath();
          ctx.roundRect(-this.cardWidth / 2, -this.cardHeight / 2, this.cardWidth, this.cardHeight, 8);
          ctx.fill();

          ctx.strokeStyle = card.matched ? '#10b981' : '#38bdf8';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.font = `${this.cardWidth * 0.48}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(card.icon, 0, 2);
        } else {
          // Card Back
          ctx.fillStyle = '#1e293b';
          ctx.beginPath();
          ctx.roundRect(-this.cardWidth / 2, -this.cardHeight / 2, this.cardWidth, this.cardHeight, 8);
          ctx.fill();

          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Pattern logo
          ctx.fillStyle = '#38bdf8';
          ctx.font = `bold ${this.cardWidth * 0.35}px sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚡', 0, 1);
        }

        ctx.restore();
      }
    }

    if (this.isPaused && !this.isWon) {
      ctx.fillStyle = 'rgba(8, 9, 18, 0.5)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    if (this.overlayManager) {
      this.overlayManager.destroy();
      this.overlayManager = null;
    }

    if (this.canvas) {
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
