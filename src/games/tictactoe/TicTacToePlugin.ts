import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { GameAudioEngine } from '../core/GameAudioEngine';
import { GameJuice } from '../core/GameJuice';

export class TicTacToePlugin implements MiniGamePlugin {
  id = 'tictactoe';
  name = 'Recall Tic-Tac-Toe';
  subtitle = 'Grid alignment & memory patterns';
  description = 'Engage in a quick tactical grid-alignment match. Battle an unbeatable minimax AI or play pass-and-play local multiplayer to test recognition and defensive blocking strategies.';
  version = '1.0.0';
  genre = 'Board / Strategy';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '1–3 min';
  category = 'Board';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <line x1="9" y1="30" x2="9" y2="2" />
      <line x1="15" y1="30" x2="15" y2="2" />
      <line x1="30" y1="9" x2="2" y2="9" />
      <line x1="30" y1="15" x2="2" y2="15" />
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

  // Board variables
  private board: Array<'X' | 'O' | null> = Array(9).fill(null);
  private currentPlayer: 'X' | 'O' = 'X';
  private gameMode: 'vsAI' | 'local' = 'vsAI';
  private difficulty: 'easy' | 'impossible' = 'impossible';
  private winsX = 0;
  private winsO = 0;
  private ties = 0;
  private statusMessage = "Your Turn (X)";
  
  // Visual effects state
  private placedAnimation: number[] = Array(9).fill(0); // 0 to 1 for drop animation scale bouncy overshoot

  // Layout metrics
  private boardSize = 0;
  private cellSize = 0;
  private startX = 0;
  private startY = 0;

  // Winning lines coords
  private winningCombo: number[] | null = null;
  private isMatchOver = false;

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
    if (scoreLabel) scoreLabel.textContent = 'Wins (X):';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    this.difficulty = context.settings.difficulty === 'hard' ? 'impossible' : 'easy';

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.isRunning = true;
    this.isPaused = false;
    this.isMatchOver = false;

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

    this.resetBoard();
    this.resizeCanvas();

    // Event bindings
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

    // Gameloop
    this.tick();
  }

  private showHelpOverlay() {
    this.isPaused = true;
    this.overlayManager?.showInstructions({
      title: 'RECALL TIC-TAC-TOE',
      subtitle: 'Grid Alignment & Minimax Tactical Defense',
      description: 'Engage in a quick tactical grid-alignment match. Battle our smart Minimax AI or play Local Multiplayer to test your grid defense and strategic pattern locks.',
      objective: 'Align three marks (X) in a row, column, or diagonal line.',
      controls: [
        { key: 'Mouse / Touch', action: 'Tap/Click square to make a move' },
        { key: 'P / Esc', action: 'Pause / Resume session' }
      ],
      rules: [
        'Players take turns placing their marks (X or O).',
        'X always plays first.',
        'Try to align 3 symbols in a row or block the opponent from doing so.'
      ],
      options: {
        modes: ['vsAI', 'local'],
        currentMode: this.gameMode,
        onSelectMode: (mode) => {
          this.gameMode = mode as 'vsAI' | 'local';
          this.resetStats();
          this.resetBoard();
          GameAudioEngine.getInstance().playSFX('select');
        },
        difficulties: ['easy', 'impossible'],
        currentDifficulty: this.difficulty,
        onSelectDifficulty: (diff) => {
          this.difficulty = diff as 'easy' | 'impossible';
          this.resetStats();
          this.resetBoard();
          GameAudioEngine.getInstance().playSFX('select');
        }
      },
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { label: 'Wins (X)', value: this.winsX, id: 'winsX' },
          { label: 'Losses (O)', value: this.winsO, id: 'winsO' },
          { label: 'Ties', value: this.ties, id: 'ties' }
        ]);
        this.isPaused = false;
        this.resetBoard();
        GameAudioEngine.getInstance().playSFX('click');
      }
    });
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (!this.isMatchOver && this.overlayManager) {
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
    this.isMatchOver = false;
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

    // Grid sizing
    this.boardSize = Math.min(width * 0.7, height * 0.6, 260);
    this.startX = (width - this.boardSize) / 2;
    this.startY = (height - this.boardSize) / 2 + 10;
    this.cellSize = this.boardSize / 3;
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
    if (!this.canvas || this.isPaused || this.isMatchOver) return;

    // Grid click
    const col = Math.floor((mx - this.startX) / this.cellSize);
    const row = Math.floor((my - this.startY) / this.cellSize);

    if (col >= 0 && col < 3 && row >= 0 && row < 3) {
      const index = row * 3 + col;
      if (this.board[index] === null) {
        this.makeMove(index);
      }
    }
  }

  private makeMove(index: number) {
    if (this.isPaused || this.isMatchOver) return;
    this.board[index] = this.currentPlayer;
    this.playSynthSFX(this.currentPlayer === 'X' ? 'drawX' : 'drawO');

    // Spawn visual thuds, floating texts, and glowing particles
    const r = Math.floor(index / 3);
    const c = index % 3;
    const cx = this.startX + c * this.cellSize + this.cellSize / 2;
    const cy = this.startY + r * this.cellSize + this.cellSize / 2;
    this.placedAnimation[index] = 1.0;
    this.juice.spawnText(cx, cy, this.currentPlayer, { color: this.currentPlayer === 'X' ? '#38bdf8' : '#f59e0b', fontSize: 36, scale: 1.5 });
    this.juice.spawnExplosion(cx, cy, { color: this.currentPlayer === 'X' ? '#38bdf8' : '#f59e0b', count: 14, sizeRange: [2.5, 6] });
    this.juice.shake(4);
    this.juice.bounceZoom(1.03);

    if (this.checkWin(this.board, this.currentPlayer)) {
      this.endMatch(this.currentPlayer);
      return;
    }

    if (this.board.every(cell => cell !== null)) {
      this.endMatch('draw');
      return;
    }

    // Pass turn
    this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
    this.statusMessage = this.currentPlayer === 'X' ? 'Your Turn (X)' : 'Opponent Turn (O)';

    if (this.gameMode === 'vsAI' && this.currentPlayer === 'O') {
      setTimeout(() => this.makeAIMove(), 300);
    }
  }

  private makeAIMove() {
    if (this.isMatchOver || !this.isRunning || this.isPaused || this.gameMode !== 'vsAI' || this.currentPlayer !== 'O') return;

    let moveIndex = -1;
    if (this.difficulty === 'impossible') {
      moveIndex = this.getBestMove();
    } else {
      // Easy: Random cell
      const emptyCells = this.board.map((val, idx) => val === null ? idx : null).filter(val => val !== null) as number[];
      if (emptyCells.length > 0) {
        moveIndex = emptyCells[Math.floor(Math.random() * emptyCells.length)];
      }
    }

    if (moveIndex !== -1) {
      this.board[moveIndex] = 'O';
      this.playSynthSFX('drawO');

      // Spawn visual thuds, floating texts, and glowing particles for AI move
      const r = Math.floor(moveIndex / 3);
      const c = moveIndex % 3;
      const cx = this.startX + c * this.cellSize + this.cellSize / 2;
      const cy = this.startY + r * this.cellSize + this.cellSize / 2;
      this.placedAnimation[moveIndex] = 1.0;
      this.juice.spawnText(cx, cy, 'O', { color: '#f59e0b', fontSize: 36, scale: 1.5 });
      this.juice.spawnExplosion(cx, cy, { color: '#f59e0b', count: 14, sizeRange: [2.5, 6] });
      this.juice.shake(4);
      this.juice.bounceZoom(1.03);

      if (this.checkWin(this.board, 'O')) {
        this.endMatch('O');
        return;
      }

      if (this.board.every(cell => cell !== null)) {
        this.endMatch('draw');
        return;
      }

      this.currentPlayer = 'X';
      this.statusMessage = "Your Turn (X)";
    }
  }

  private getBestMove(): number {
    let bestVal = -Infinity;
    let bestMove = -1;

    for (let i = 0; i < 9; i++) {
      if (this.board[i] === null) {
        this.board[i] = 'O';
        const moveVal = this.minimax(this.board, 0, false);
        this.board[i] = null;
        if (moveVal > bestVal) {
          bestVal = moveVal;
          bestMove = i;
        }
      }
    }
    return bestMove;
  }

  private minimax(board: Array<'X' | 'O' | null>, depth: number, isMax: boolean): number {
    if (this.checkWin(board, 'O')) return 10 - depth;
    if (this.checkWin(board, 'X')) return depth - 10;
    if (board.every(cell => cell !== null)) return 0;

    if (isMax) {
      let best = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
          board[i] = 'O';
          best = Math.max(best, this.minimax(board, depth + 1, false));
          board[i] = null;
        }
      }
      return best;
    } else {
      let best = Infinity;
      for (let i = 0; i < 9; i++) {
        if (board[i] === null) {
          board[i] = 'X';
          best = Math.min(best, this.minimax(board, depth + 1, true));
          board[i] = null;
        }
      }
      return best;
    }
  }

  private checkWin(b: Array<'X' | 'O' | null>, p: 'X' | 'O'): boolean {
    const wins = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
      [0, 3, 6], [1, 4, 7], [2, 5, 8], // Cols
      [0, 4, 8], [2, 4, 6]             // Diagonals
    ];

    for (const combo of wins) {
      if (b[combo[0]] === p && b[combo[1]] === p && b[combo[2]] === p) {
        if (b === this.board) {
          this.winningCombo = combo;
        }
        return true;
      }
    }
    return false;
  }

  private endMatch(winner: 'X' | 'O' | 'draw') {
    this.isMatchOver = true;
    if (winner === 'X') {
      this.winsX++;
      this.statusMessage = "Victory for X!";
      this.playSynthSFX('win');
      if (this.canvas) {
        this.juice.spawnConfetti(this.canvas.width, this.canvas.height);
        // Triple cascade of confetti
        setTimeout(() => { if (this.isRunning && this.canvas) this.juice.spawnConfetti(this.canvas.width, this.canvas.height); }, 200);
        setTimeout(() => { if (this.isRunning && this.canvas) this.juice.spawnConfetti(this.canvas.width, this.canvas.height); }, 400);
      }
    } else if (winner === 'O') {
      this.winsO++;
      this.statusMessage = "Victory for O!";
      this.playSynthSFX('lose');
      this.juice.shake(15, 0.9); // Deep thud of defeat
    } else {
      this.ties++;
      this.statusMessage = "Match is a Tie!";
      this.playSynthSFX('drawMatch');
      if (this.canvas) {
        this.juice.spawnExplosion(this.canvas.width / 2, this.canvas.height / 2, { color: '#eab308', count: 25, sizeRange: [3, 7] });
      }
    }

    this.overlayManager?.updateStat('winsX', this.winsX);
    this.overlayManager?.updateStat('winsO', this.winsO);
    this.overlayManager?.updateStat('ties', this.ties);

    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.winsX);

    this.overlayManager?.showResults({
      title: winner === 'draw' ? 'TIE MATCH' : (winner === 'X' ? 'VICTORY' : 'DEFEAT'),
      subtitle: winner === 'draw' ? 'A well-matched defensive alignment.' : (winner === 'X' ? 'You outmaneuvered the opponent!' : 'The AI has completed a three-in-a-row.'),
      isWin: winner === 'X',
      score: this.winsX,
      stats: [
        { label: 'Player X Wins', value: this.winsX },
        { label: 'Player O Wins', value: this.winsO },
        { label: 'Tie Matches', value: this.ties },
        { label: 'Game Mode', value: this.gameMode === 'vsAI' ? 'VS Assistant' : 'Local PvP' }
      ],
      onRestart: () => {
        this.restartGame();
      },
      onExit: () => {
        if (this.context?.onExit) this.context.onExit();
      }
    });
  }

  private resetBoard() {
    this.board = Array(9).fill(null);
    this.currentPlayer = 'X';
    this.isMatchOver = false;
    this.winningCombo = null;
    this.statusMessage = "Your Turn (X)";
  }

  private resetStats() {
    this.winsX = 0;
    this.winsO = 0;
    this.ties = 0;
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = '0';
  }

  private playSynthSFX(type: 'drawX' | 'drawO' | 'click' | 'win' | 'lose' | 'drawMatch') {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();

      if (type === 'drawX') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(392, ctx.currentTime); // G4
        osc.frequency.setValueAtTime(523.25, ctx.currentTime + 0.05); // C5
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'drawO') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(311.13, ctx.currentTime); // D#4
        osc.frequency.setValueAtTime(415.30, ctx.currentTime + 0.05); // G#4
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start();
        osc.stop(ctx.currentTime + 0.1);
      } else if (type === 'click') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime);
        gain.gain.setValueAtTime(0.04, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
        osc.start();
        osc.stop(ctx.currentTime + 0.04);
      } else if (type === 'win') {
        const notes = [261.63, 329.63, 392, 523.25]; // C4, E4, G4, C5 major
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.06);
          gain.gain.setValueAtTime(0.04, ctx.currentTime + i * 0.06);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.06 + 0.2);
          osc.start(ctx.currentTime + i * 0.06);
          osc.stop(ctx.currentTime + i * 0.06 + 0.2);
        });
      } else if (type === 'lose') {
        const notes = [293.66, 277.18, 261.63]; // sadness chromatic
        notes.forEach((freq, i) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
          gain.gain.setValueAtTime(0.05, ctx.currentTime + i * 0.1);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.25);
          osc.start(ctx.currentTime + i * 0.1);
          osc.stop(ctx.currentTime + i * 0.1 + 0.25);
        });
      } else if (type === 'drawMatch') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(349.23, ctx.currentTime); // F4
        osc.frequency.setValueAtTime(349.23, ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
        osc.start();
        osc.stop(ctx.currentTime + 0.2);
      }
    } catch(e) {}
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

    // Update juice physics
    this.juice.update(1.0);

    // Background
    ctx.fillStyle = '#0a0915';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply Camera Screen Shakes & Zoom Transitions
    this.juice.applyCameraTransforms(ctx, canvas.width, canvas.height);

    // 1. Render Top Header Score Tallies
    const headerY = this.startY - 35;
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Space Grotesk", sans-serif';
    ctx.fillStyle = 'var(--text3)';
    ctx.fillText(`AI Score (O): ${this.winsO}   |   Ties: ${this.ties}`, canvas.width / 2, headerY - 10);

    // Status message
    ctx.font = '12px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isMatchOver ? '#10b981' : '#cda250';
    ctx.fillText(this.statusMessage, canvas.width / 2, headerY + 12);

    // 2. Render Board Grid
    ctx.strokeStyle = '#2d2c4e';
    ctx.lineWidth = 4;
    ctx.beginPath();
    // Vertical lines
    for (let i = 1; i < 3; i++) {
      const lx = this.startX + i * this.cellSize;
      ctx.moveTo(lx, this.startY);
      ctx.lineTo(lx, this.startY + this.boardSize);
    }
    // Horizontal lines
    for (let i = 1; i < 3; i++) {
      const ly = this.startY + i * this.cellSize;
      ctx.moveTo(this.startX, ly);
      ctx.lineTo(this.startX + this.boardSize, ly);
    }
    ctx.stroke();

    // 3. Render Tokens (X and O)
    for (let i = 0; i < 9; i++) {
      const val = this.board[i];
      
      // Update pop animation interpolation
      if (this.placedAnimation[i] > 0) {
        this.placedAnimation[i] = Math.max(0, this.placedAnimation[i] - 0.07);
      }

      if (val === null) continue;

      const r = Math.floor(i / 3);
      const c = i % 3;
      const cx = this.startX + c * this.cellSize + this.cellSize / 2;
      const cy = this.startY + r * this.cellSize + this.cellSize / 2;
      const pad = this.cellSize * 0.22;

      ctx.save();
      
      // Apply spring-like bounce overshoot
      const scale = 1.0 + Math.sin(this.placedAnimation[i] * Math.PI) * 0.35;
      ctx.translate(cx, cy);
      ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);

      ctx.lineWidth = 6;
      ctx.lineCap = 'round';

      if (val === 'X') {
        // Glowing Neon Blue X
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#38bdf8';
        ctx.strokeStyle = '#38bdf8';
        
        ctx.beginPath();
        ctx.moveTo(cx - this.cellSize/2 + pad, cy - this.cellSize/2 + pad);
        ctx.lineTo(cx + this.cellSize/2 - pad, cy + this.cellSize/2 - pad);
        ctx.moveTo(cx + this.cellSize/2 - pad, cy - this.cellSize/2 + pad);
        ctx.lineTo(cx - this.cellSize/2 + pad, cy + this.cellSize/2 - pad);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      } else {
        // Glowing Neon Gold O
        ctx.shadowBlur = 8;
        ctx.shadowColor = '#f59e0b';
        ctx.strokeStyle = '#f59e0b';

        ctx.beginPath();
        ctx.arc(cx, cy, this.cellSize/2 - pad, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0; // reset
      }
      ctx.restore();
    }

    // 4. Render Victory combo line if exists
    if (this.winningCombo && this.winningCombo.length === 3) {
      ctx.strokeStyle = '#22c55e'; // glowing green line
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.shadowBlur = 10;
      ctx.shadowColor = '#22c55e';

      const cellCenter = (index: number) => {
        const r = Math.floor(index / 3);
        const c = index % 3;
        return {
          x: this.startX + c * this.cellSize + this.cellSize / 2,
          y: this.startY + r * this.cellSize + this.cellSize / 2
        };
      };

      const start = cellCenter(this.winningCombo[0]);
      const end = cellCenter(this.winningCombo[2]);

      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Restore Camera Transformations before overlays
    this.juice.restoreCameraTransforms(ctx);

    // Draw active particles & floating scores on top
    this.juice.draw(ctx);

    if (this.isPaused && !this.isMatchOver) {
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

    // Unbind listeners
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('keydown', this.boundKeyDown);

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