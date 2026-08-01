import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { GameAudioEngine } from '../core/GameAudioEngine';

type DiscColor = 'black' | 'white';

interface AnimatedFlip {
  r: number;
  c: number;
  progress: number; // 0 to 1
  fromColor: DiscColor;
  toColor: DiscColor;
}

export class ReversiPlugin implements MiniGamePlugin {
  id = 'reversi';
  name = 'Reversi Othello';
  subtitle = 'Flanking strategy & board control';
  description = 'Flank and outmaneuver your opponent to flip their discs to your color. Master corner control and directional traps against a tactical AI or in local head-to-head matches.';
  version = '1.0.0';
  genre = 'Board / Strategy';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '3–6 min';
  category = 'Board';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <circle cx="12" cy="12" r="9"/>
      <path d="M12 3a9 9 0 0 0 0 18z" fill="currentColor"/>
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  private board: (DiscColor | null)[][] = Array(8).fill(null).map(() => Array(8).fill(null));
  private currentPlayer: DiscColor = 'black'; // Black moves first
  private gameMode: 'vsAI' | 'local' = 'vsAI';
  private difficulty: 'easy' | 'medium' | 'hard' = 'medium';

  private validMoves: { r: number; c: number; flips: { r: number; c: number }[] }[] = [];
  private flippingDiscs: AnimatedFlip[] = [];
  private isPaused = false;
  private overlayManager: GameOverlayManager | null = null;
  private context: GameLaunchContext | null = null;

  private blackCount = 2;
  private whiteCount = 2;
  private statusMessage = "Your Turn (Black)";
  private isGameOver = false;

  // Layout metrics
  private boardSize = 0;
  private cellSize = 0;
  private startX = 0;
  private startY = 0;

  // Listeners
  private boundMouseDown: any;
  private boundTouchStart: any;
  private boundResize: any;

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
    if (scoreLabel) scoreLabel.textContent = 'Black Score:';
    if (scoreVal) scoreVal.textContent = '2';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    if (context.settings.difficulty === 'easy') this.difficulty = 'easy';
    else if (context.settings.difficulty === 'hard') this.difficulty = 'hard';
    else this.difficulty = 'medium';

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.isRunning = true;
    this.isPaused = false;
    this.isGameOver = false;

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

    if (this.canvas) {
      this.canvas.style.touchAction = 'none';
      this.canvas.addEventListener('mousedown', this.boundMouseDown);
      this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    }
    window.addEventListener('resize', this.boundResize);

    this.showHelpOverlay();
    this.tick();
  }

  private showHelpOverlay() {
    this.isPaused = true;
    this.overlayManager?.showInstructions({
      title: 'REVERSI OTHELLO',
      subtitle: 'Flanking Strategy & Board Control',
      description: 'Outflank and outmaneuver your opponent to flip their discs to your color. Master corner control and directional traps against a tactical AI or local PvP.',
      objective: 'Have the majority of your colored discs on the board when no valid moves are left for either player.',
      controls: [
        { key: 'Tap / Click square', action: 'Place disc and flip outflanked opponent discs' },
        { key: 'Green Dot highlights', action: 'Indicates legal available move squares' }
      ],
      rules: [
        'Each move must outflank and trap one or more opponent discs in a straight line.',
        'If a player has no valid moves, they pass the turn; if both pass, match ends.',
        'Black is Black (Player 1); White is White (AI or Player 2).'
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { label: 'Mode', value: this.gameMode === 'vsAI' ? 'VS AI' : 'Local PvP', id: 'mode' },
          { label: 'Status', value: 'Black Turn', id: 'status' },
          { label: 'Black/White', value: '2 - 2', id: 'discs' }
        ]);
        this.isPaused = false;
        this.resetBoard();
        GameAudioEngine.getInstance().playSFX('click');
      }
    });
  }

  private restartGame() {
    this.overlayManager?.hideResults();
    this.overlayManager?.resume();
    this.isGameOver = false;
    this.isPaused = false;
    this.resetBoard();
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

    const maxW = width * 0.88;
    const maxH = height * 0.65;
    this.boardSize = Math.min(maxW, maxH, 420);
    this.boardSize = Math.max(this.boardSize, 240);

    this.startX = (width - this.boardSize) / 2;
    this.startY = (height - this.boardSize) / 2 - 20;
    this.cellSize = this.boardSize / 8;
  }

  private resetBoard() {
    this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    // Initial 4 discs in center
    this.board[3][3] = 'white';
    this.board[3][4] = 'black';
    this.board[4][3] = 'black';
    this.board[4][4] = 'white';

    this.currentPlayer = 'black';
    this.flippingDiscs = [];
    this.isGameOver = false;

    this.updateScores();
    this.computeValidMoves();
    this.updateHUD();
  }

  private updateHUD() {
    const turnStr = this.currentPlayer === 'black' ? 'Black Turn' : 'White Turn';
    this.overlayManager?.updateHUD([
      { id: 'mode', value: this.gameMode === 'vsAI' ? `VS AI (${this.difficulty.toUpperCase()})` : 'Local PvP' },
      { id: 'status', value: this.isGameOver ? 'Game Over' : turnStr },
      { id: 'discs', value: `${this.blackCount} - ${this.whiteCount}` }
    ]);
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

    const midX = this.canvas.width / 2;
    const controlsY = this.startY + this.boardSize + 28;

    // Controls
    if (Math.abs(mx - (midX - 100)) <= 40 && Math.abs(my - controlsY) <= 14) {
      this.gameMode = 'vsAI';
      this.playSFX('click');
      this.resetBoard();
      return;
    }
    if (Math.abs(mx - (midX - 10)) <= 40 && Math.abs(my - controlsY) <= 14) {
      this.gameMode = 'local';
      this.playSFX('click');
      this.resetBoard();
      return;
    }
    if (Math.abs(mx - (midX + 80)) <= 35 && Math.abs(my - controlsY) <= 14) {
      this.resetBoard();
      this.playSFX('click');
      return;
    }

    if (this.isGameOver) return;
    if (this.gameMode === 'vsAI' && this.currentPlayer === 'white') return;

    const col = Math.floor((mx - this.startX) / this.cellSize);
    const row = Math.floor((my - this.startY) / this.cellSize);

    if (col >= 0 && col < 8 && row >= 0 && row < 8) {
      const move = this.validMoves.find(m => m.r === row && m.c === col);
      if (move) {
        this.executeMove(move);
      }
    }
  }

  private computeValidMoves() {
    this.validMoves = [];
    const oppColor = this.currentPlayer === 'black' ? 'white' : 'black';
    const dirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c] !== null) continue;

        const flips: { r: number; c: number }[] = [];

        for (const [dr, dc] of dirs) {
          let cr = r + dr;
          let cc = c + dc;
          const lineFlips: { r: number; c: number }[] = [];

          while (cr >= 0 && cr < 8 && cc >= 0 && cc < 8 && this.board[cr][cc] === oppColor) {
            lineFlips.push({ r: cr, c: cc });
            cr += dr;
            cc += dc;
          }

          if (cr >= 0 && cr < 8 && cc >= 0 && cc < 8 && this.board[cr][cc] === this.currentPlayer && lineFlips.length > 0) {
            flips.push(...lineFlips);
          }
        }

        if (flips.length > 0) {
          this.validMoves.push({ r, c, flips });
        }
      }
    }
  }

  private executeMove(move: { r: number; c: number; flips: { r: number; c: number }[] }) {
    this.board[move.r][move.c] = this.currentPlayer;
    const oppColor = this.currentPlayer === 'black' ? 'white' : 'black';

    // Start flip animations and update board
    for (const f of move.flips) {
      this.board[f.r][f.c] = this.currentPlayer;
      this.flippingDiscs.push({
        r: f.r,
        c: f.c,
        progress: 0,
        fromColor: oppColor,
        toColor: this.currentPlayer
      });
    }

    this.playSFX('flip');
    this.updateScores();
    this.endTurn();
  }

  private endTurn() {
    this.currentPlayer = this.currentPlayer === 'black' ? 'white' : 'black';
    this.computeValidMoves();

    if (this.validMoves.length === 0) {
      // Pass turn to other player
      this.currentPlayer = this.currentPlayer === 'black' ? 'white' : 'black';
      this.computeValidMoves();

      if (this.validMoves.length === 0) {
        // Neither player has valid moves -> Game Over
        this.isGameOver = true;
        this.updateHUD();
        if (this.blackCount > this.whiteCount) {
          this.statusMessage = `GAME OVER! BLACK WINS (${this.blackCount}-${this.whiteCount})`;
          this.playSFX('win');
          this.overlayManager?.showResults({
            title: 'VICTORY!',
            score: 1000 + (this.blackCount * 50),
            metrics: [
              { label: 'Winner', value: 'Black (Player)' },
              { label: 'Final Score', value: `${this.blackCount} - ${this.whiteCount}` }
            ],
            onRestart: () => this.restartGame()
          });
        } else if (this.whiteCount > this.blackCount) {
          this.statusMessage = `GAME OVER! WHITE WINS (${this.whiteCount}-${this.blackCount})`;
          this.playSFX('lose');
          this.overlayManager?.showResults({
            title: 'GAME OVER',
            score: 0,
            metrics: [
              { label: 'Winner', value: 'White (AI / Player 2)' },
              { label: 'Final Score', value: `${this.blackCount} - ${this.whiteCount}` }
            ],
            onRestart: () => this.restartGame()
          });
        } else {
          this.statusMessage = `GAME OVER! DRAW (${this.blackCount}-${this.whiteCount})`;
          this.playSFX('click');
          this.overlayManager?.showResults({
            title: 'DRAW MATCH',
            score: 500,
            metrics: [
              { label: 'Result', value: 'Draw / Tied score' },
              { label: 'Final Score', value: `${this.blackCount} - ${this.whiteCount}` }
            ],
            onRestart: () => this.restartGame()
          });
        }
        return;
      }
    }

    this.statusMessage = this.currentPlayer === 'black' ? "Your Turn (Black)" : "Opponent Turn (White)";
    this.updateHUD();

    if (this.gameMode === 'vsAI' && this.currentPlayer === 'white' && !this.isGameOver) {
      setTimeout(() => this.makeAIMove(), 350);
    }
  }

  private updateScores() {
    let b = 0;
    let w = 0;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c] === 'black') b++;
        if (this.board[r][c] === 'white') w++;
      }
    }
    this.blackCount = b;
    this.whiteCount = w;

    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(b);
  }

  private makeAIMove() {
    if (this.isGameOver || this.validMoves.length === 0 || !this.isRunning || this.isPaused || this.gameMode !== 'vsAI' || this.currentPlayer !== 'white') return;

    // Positional evaluation weights (Corners are heavily valued!)
    const weights = [
      [100, -20, 10,  5,  5, 10, -20, 100],
      [-20, -50, -2, -2, -2, -2, -50, -20],
      [ 10,  -2, -1, -1, -1, -1,  -2,  10],
      [  5,  -2, -1, -1, -1, -1,  -2,   5],
      [  5,  -2, -1, -1, -1, -1,  -2,   5],
      [ 10,  -2, -1, -1, -1, -1,  -2,  10],
      [-20, -50, -2, -2, -2, -2, -50, -20],
      [100, -20, 10,  5,  5, 10, -20, 100]
    ];

    let bestMove = this.validMoves[0];
    let bestScore = -Infinity;

    for (const m of this.validMoves) {
      const score = weights[m.r][m.c] + m.flips.length * 2;
      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }

    this.executeMove(bestMove);
  }

  private playSFX(type: 'flip' | 'win' | 'lose' | 'click') {
    const engine = GameAudioEngine.getInstance();
    switch (type) {
      case 'flip':
        engine.playSFX('step');
        break;
      case 'win':
        engine.playSFX('win');
        break;
      case 'lose':
        engine.playSFX('lose');
        break;
      case 'click':
      default:
        engine.playSFX('click');
        break;
    }
  }

  private tick() {
    if (!this.isRunning) return;

    // Update flip animations
    for (let i = this.flippingDiscs.length - 1; i >= 0; i--) {
      this.flippingDiscs[i].progress += 0.08;
      if (this.flippingDiscs[i].progress >= 1) {
        this.flippingDiscs.splice(i, 1);
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

    // Header Status & Piece Tally
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'var(--text3)';
    ctx.fillText(`Black Discs: ${this.blackCount}   |   White Discs: ${this.whiteCount}`, midX, this.startY - 26);

    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isGameOver ? '#ef4444' : '#cda250';
    ctx.fillText(this.statusMessage, midX, this.startY - 10);

    // Green Felt Reversi Board
    ctx.fillStyle = '#15803d'; // Deep Green
    ctx.beginPath();
    ctx.roundRect(this.startX - 6, this.startY - 6, this.boardSize + 12, this.boardSize + 12, 10);
    ctx.fill();

    // Grid lines
    ctx.strokeStyle = '#14532d';
    ctx.lineWidth = 1.5;
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const x = this.startX + c * this.cellSize;
        const y = this.startY + r * this.cellSize;
        ctx.strokeRect(x, y, this.cellSize, this.cellSize);
      }
    }

    // Highlight Valid Move Candidate Dots
    for (const m of this.validMoves) {
      const cx = this.startX + m.c * this.cellSize + this.cellSize / 2;
      const cy = this.startY + m.r * this.cellSize + this.cellSize / 2;
      ctx.fillStyle = 'rgba(250, 204, 21, 0.6)';
      ctx.beginPath();
      ctx.arc(cx, cy, this.cellSize * 0.16, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Discs
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const color = this.board[r][c];
        if (color) {
          const cx = this.startX + c * this.cellSize + this.cellSize / 2;
          const cy = this.startY + r * this.cellSize + this.cellSize / 2;
          const radius = this.cellSize * 0.38;

          // Check if flipping
          const flip = this.flippingDiscs.find(f => f.r === r && f.c === c);
          let scaleX = 1;
          let renderColor = color;

          if (flip) {
            scaleX = Math.abs(Math.cos(flip.progress * Math.PI));
            renderColor = flip.progress < 0.5 ? flip.fromColor : flip.toColor;
          }

          ctx.save();
          ctx.translate(cx, cy);
          ctx.scale(scaleX, 1);

          // Disc Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.beginPath();
          ctx.arc(2, 3, radius, 0, Math.PI * 2);
          ctx.fill();

          // Disc Body
          ctx.fillStyle = renderColor === 'black' ? '#111827' : '#f9fafb';
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = renderColor === 'black' ? '#374151' : '#d1d5db';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, radius * 0.7, 0, Math.PI * 2);
          ctx.stroke();

          ctx.restore();
        }
      }
    }

    // Bottom Controls
    const controlsY = this.startY + this.boardSize + 28;
    this.drawButton(midX - 100, controlsY, 76, 26, 'VS AI', this.gameMode === 'vsAI');
    this.drawButton(midX - 10, controlsY, 76, 26, 'LOCAL PvP', this.gameMode === 'local');
    this.drawButton(midX + 80, controlsY, 68, 26, 'NEW GAME', false);
  }

  private drawButton(cx: number, cy: number, w: number, h: number, label: string, active: boolean) {
    const ctx = this.ctx!;
    ctx.fillStyle = active ? '#10b981' : 'rgba(255, 255, 255, 0.04)';
    ctx.strokeStyle = active ? '#10b981' : '#2d2c4e';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 6);
    ctx.fill();
    ctx.stroke();

    ctx.font = 'bold 10px "Space Grotesk", sans-serif';
    ctx.fillStyle = active ? '#000000' : 'var(--text3)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, cy);
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('resize', this.boundResize);

    this.overlayManager?.destroy();

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
