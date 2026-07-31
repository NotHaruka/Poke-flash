import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { Chess, Square, Move } from 'chess.js';

export class ChessPlugin implements MiniGamePlugin {
  id = 'chess';
  name = 'Grandmaster Chess';
  subtitle = 'Strategic foresight & calculation';
  description = 'Master spatial reasoning and tactical foresight in classical Chess. Play against an adaptive AI engine across multiple difficulties or challenge a friend in local pass-and-play.';
  version = '1.0.0';
  genre = 'Board / Strategy';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '5–10 min';
  category = 'Board';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <path d="M8 20h8v2H8z"/>
      <path d="M9 17h6l1 3H8l1-3z"/>
      <path d="M10 10l-1 7h6l-1-7h-4z"/>
      <path d="M9 7h6v3H9z"/>
      <circle cx="12" cy="4" r="2"/>
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  private chess: Chess = new Chess();
  private gameMode: 'vsAI' | 'local' = 'vsAI';
  private difficulty: 'easy' | 'medium' | 'hard' = 'medium';
  private playerColor: 'w' | 'b' = 'w';

  private selectedSquare: Square | null = null;
  private legalMoves: Move[] = [];
  private lastMove: { from: Square; to: Square } | null = null;

  private history: string[] = []; // PGN / SAN move strings
  private statusMessage = "White's turn";
  private isGameOver = false;

  // Board layout metrics
  private boardSize = 0;
  private cellSize = 0;
  private startX = 0;
  private startY = 0;

  // Listeners
  private boundMouseDown: any;
  private boundTouchStart: any;
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
    if (scoreLabel) scoreLabel.textContent = 'Captured:';
    if (scoreVal) scoreVal.textContent = '0';
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
    this.resetGame();
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

    // Center board with padding for UI controls
    const maxBoardWidth = width * 0.88;
    const maxBoardHeight = height * 0.65;
    this.boardSize = Math.min(maxBoardWidth, maxBoardHeight, 420);
    this.boardSize = Math.max(this.boardSize, 240); // minimum size on tiny screens

    this.startX = (width - this.boardSize) / 2;
    this.startY = (height - this.boardSize) / 2 - 20;
    this.cellSize = this.boardSize / 8;
  }

  private resetGame() {
    this.chess = new Chess();
    this.selectedSquare = null;
    this.legalMoves = [];
    this.lastMove = null;
    this.history = [];
    this.isGameOver = false;
    this.statusMessage = "White's Turn";
    this.updateCapturedScore();
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

    // Check UI control buttons click
    // 1. VS AI button
    if (Math.abs(mx - (midX - 120)) <= 40 && Math.abs(my - controlsY) <= 14) {
      this.gameMode = 'vsAI';
      this.playSFX('click');
      this.resetGame();
      return;
    }
    // 2. Local PvP button
    if (Math.abs(mx - (midX - 35)) <= 40 && Math.abs(my - controlsY) <= 14) {
      this.gameMode = 'local';
      this.playSFX('click');
      this.resetGame();
      return;
    }
    // 3. Undo button
    if (Math.abs(mx - (midX + 45)) <= 30 && Math.abs(my - controlsY) <= 14) {
      this.undoMove();
      this.playSFX('click');
      return;
    }
    // 4. New Game button
    if (Math.abs(mx - (midX + 115)) <= 35 && Math.abs(my - controlsY) <= 14) {
      this.resetGame();
      this.playSFX('click');
      return;
    }

    if (this.isGameOver) return;

    // Turn check for vsAI
    if (this.gameMode === 'vsAI' && this.chess.turn() !== this.playerColor) {
      return;
    }

    // Convert mouse/touch coordinates to board square
    const col = Math.floor((mx - this.startX) / this.cellSize);
    const row = Math.floor((my - this.startY) / this.cellSize);

    if (col >= 0 && col < 8 && row >= 0 && row < 8) {
      // Board file (a-h) and rank (1-8)
      const file = String.fromCharCode('a'.charCodeAt(0) + col);
      const rank = String(8 - row);
      const sq = `${file}${rank}` as Square;

      if (this.selectedSquare) {
        // Check if sq is a legal target
        const matchingMove = this.legalMoves.find(m => m.to === sq);
        if (matchingMove) {
          this.executeMove(matchingMove);
          return;
        }
      }

      // Select piece on square
      const piece = this.chess.get(sq);
      if (piece && piece.color === this.chess.turn()) {
        this.selectedSquare = sq;
        this.legalMoves = this.chess.moves({ square: sq, verbose: true });
        this.playSFX('select');
      } else {
        this.selectedSquare = null;
        this.legalMoves = [];
      }
    }
  }

  private executeMove(move: Move) {
    const isCapture = !!move.captured;
    this.chess.move(move);
    this.lastMove = { from: move.from, to: move.to };
    this.history.push(move.san);
    this.selectedSquare = null;
    this.legalMoves = [];

    if (isCapture) this.playSFX('capture');
    else this.playSFX('move');

    this.updateGameState();

    // Trigger AI move if vs AI and game is still active
    if (!this.isGameOver && this.gameMode === 'vsAI' && this.chess.turn() !== this.playerColor) {
      setTimeout(() => this.makeAIMove(), 350);
    }
  }

  private undoMove() {
    if (this.gameMode === 'vsAI') {
      // Undo 2 moves (AI move + player move)
      this.chess.undo();
      this.chess.undo();
    } else {
      this.chess.undo();
    }
    this.selectedSquare = null;
    this.legalMoves = [];
    this.lastMove = null;
    this.isGameOver = false;
    this.updateGameState();
  }

  private updateGameState() {
    this.updateCapturedScore();

    if (this.chess.isCheckmate()) {
      const winner = this.chess.turn() === 'w' ? 'Black' : 'White';
      this.statusMessage = `CHECKMATE! ${winner} wins!`;
      this.isGameOver = true;
      this.playSFX(winner === 'White' && this.playerColor === 'w' ? 'win' : 'lose');
    } else if (this.chess.isDraw()) {
      this.statusMessage = "DRAW! (Stalemate or insufficient material)";
      this.isGameOver = true;
      this.playSFX('draw');
    } else if (this.chess.inCheck()) {
      const turnStr = this.chess.turn() === 'w' ? 'White' : 'Black';
      this.statusMessage = `CHECK! ${turnStr}'s turn`;
      this.playSFX('check');
    } else {
      const turnStr = this.chess.turn() === 'w' ? 'White' : 'Black';
      this.statusMessage = `${turnStr}'s Turn`;
    }
  }

  private updateCapturedScore() {
    // Calculate material difference
    let whiteMaterial = 0;
    let blackMaterial = 0;
    const vals: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

    for (const row of this.chess.board()) {
      for (const piece of row) {
        if (piece) {
          if (piece.color === 'w') whiteMaterial += vals[piece.type];
          else blackMaterial += vals[piece.type];
        }
      }
    }
    const diff = whiteMaterial - blackMaterial;
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) {
      scoreVal.textContent = diff >= 0 ? `+${diff}` : `${diff}`;
    }
  }

  private makeAIMove() {
    if (this.isGameOver || !this.isRunning) return;

    const moves = this.chess.moves({ verbose: true });
    if (moves.length === 0) return;

    let chosenMove: Move;

    if (this.difficulty === 'easy') {
      // Random move
      chosenMove = moves[Math.floor(Math.random() * moves.length)];
    } else if (this.difficulty === 'medium') {
      // Prioritize captures and checks, otherwise random
      const captures = moves.filter(m => m.captured || m.san.includes('+'));
      if (captures.length > 0 && Math.random() < 0.75) {
        chosenMove = captures[Math.floor(Math.random() * captures.length)];
      } else {
        chosenMove = moves[Math.floor(Math.random() * moves.length)];
      }
    } else {
      // Hard: 1-ply / 2-ply minimax evaluation
      chosenMove = this.getBestMoveHard(moves);
    }

    if (chosenMove) {
      this.executeMove(chosenMove);
    }
  }

  private getBestMoveHard(moves: Move[]): Move {
    let bestMove = moves[0];
    let bestScore = -Infinity;

    for (const m of moves) {
      this.chess.move(m);
      const score = -this.evaluateBoard();
      this.chess.undo();

      if (score > bestScore) {
        bestScore = score;
        bestMove = m;
      }
    }
    return bestMove;
  }

  private evaluateBoard(): number {
    let score = 0;
    const vals: Record<string, number> = { p: 10, n: 30, b: 32, r: 50, q: 90, k: 900 };

    for (const row of this.chess.board()) {
      for (const piece of row) {
        if (piece) {
          const val = vals[piece.type] || 0;
          score += piece.color === this.chess.turn() ? val : -val;
        }
      }
    }
    return score;
  }

  private playSFX(type: 'select' | 'move' | 'capture' | 'check' | 'win' | 'lose' | 'draw' | 'click') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;

      if (type === 'select') {
        osc.frequency.setValueAtTime(520, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'move') {
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(160, now + 0.08);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'capture') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(600, now + 0.1);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === 'check') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.setValueAtTime(800, now + 0.08);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'click') {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'win') {
        const freqs = [440, 554.37, 659.25, 880];
        freqs.forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.frequency.setValueAtTime(f, now + i * 0.08);
          g.gain.setValueAtTime(0.05, now + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.25);
          o.start(now + i * 0.08);
          o.stop(now + i * 0.08 + 0.25);
        });
      }
    } catch (e) {}
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

    // Clear background
    ctx.fillStyle = '#0a0915';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const midX = canvas.width / 2;

    // 1. Header status string
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isGameOver ? '#ef4444' : (this.chess.inCheck() ? '#f59e0b' : '#cda250');
    ctx.fillText(this.statusMessage, midX, this.startY - 14);

    // 2. Draw Chessboard
    const lightColor = '#e2d6b5';
    const darkColor = '#7a6651';

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const x = this.startX + c * this.cellSize;
        const y = this.startY + r * this.cellSize;
        const isLight = (r + c) % 2 === 0;

        ctx.fillStyle = isLight ? lightColor : darkColor;
        ctx.fillRect(x, y, this.cellSize, this.cellSize);

        // File and rank labels
        if (c === 0) {
          ctx.font = 'bold 9px sans-serif';
          ctx.fillStyle = isLight ? darkColor : lightColor;
          ctx.textAlign = 'left';
          ctx.fillText(String(8 - r), x + 2, y + 10);
        }
        if (r === 7) {
          ctx.font = 'bold 9px sans-serif';
          ctx.fillStyle = isLight ? darkColor : lightColor;
          ctx.textAlign = 'right';
          ctx.fillText(String.fromCharCode('a'.charCodeAt(0) + c), x + this.cellSize - 2, y + this.cellSize - 2);
        }
      }
    }

    // 3. Highlight Last Move
    if (this.lastMove) {
      this.highlightSquare(this.lastMove.from, 'rgba(250, 204, 21, 0.35)');
      this.highlightSquare(this.lastMove.to, 'rgba(250, 204, 21, 0.5)');
    }

    // 4. Highlight Selected Square
    if (this.selectedSquare) {
      this.highlightSquare(this.selectedSquare, 'rgba(56, 189, 248, 0.6)');
    }

    // 5. Highlight Legal Moves
    for (const m of this.legalMoves) {
      const col = m.to.charCodeAt(0) - 'a'.charCodeAt(0);
      const row = 8 - parseInt(m.to[1]);
      const cx = this.startX + col * this.cellSize + this.cellSize / 2;
      const cy = this.startY + row * this.cellSize + this.cellSize / 2;

      ctx.fillStyle = m.captured ? 'rgba(239, 68, 68, 0.6)' : 'rgba(34, 197, 94, 0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy, m.captured ? this.cellSize * 0.38 : this.cellSize * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }

    // 6. Draw Pieces
    const boardState = this.chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = boardState[r][c];
        if (piece) {
          const x = this.startX + c * this.cellSize;
          const y = this.startY + r * this.cellSize;
          this.drawPiece(piece.type, piece.color, x, y, this.cellSize);
        }
      }
    }

    // 7. Draw Board Border
    ctx.strokeStyle = '#3a385e';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.startX, this.startY, this.boardSize, this.boardSize);

    // 8. Bottom Control Toolbar Buttons
    const controlsY = this.startY + this.boardSize + 28;

    // VS AI Button
    this.drawButton(midX - 120, controlsY, 76, 26, 'VS AI', this.gameMode === 'vsAI');
    // Local PvP Button
    this.drawButton(midX - 35, controlsY, 76, 26, 'LOCAL PvP', this.gameMode === 'local');
    // Undo Button
    this.drawButton(midX + 45, controlsY, 56, 26, 'UNDO', false);
    // New Game Button
    this.drawButton(midX + 115, controlsY, 68, 26, 'NEW GAME', false);
  }

  private highlightSquare(sq: Square, color: string) {
    const col = sq.charCodeAt(0) - 'a'.charCodeAt(0);
    const row = 8 - parseInt(sq[1]);
    const x = this.startX + col * this.cellSize;
    const y = this.startY + row * this.cellSize;

    this.ctx!.fillStyle = color;
    this.ctx!.fillRect(x, y, this.cellSize, this.cellSize);
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

  private drawPiece(type: string, color: 'w' | 'b', x: number, y: number, size: number) {
    const ctx = this.ctx!;
    const cx = x + size / 2;
    const cy = y + size / 2;
    const isWhite = color === 'w';

    // Piece Unicode Symbols for crisp vector representation
    const symbols: Record<string, { w: string; b: string }> = {
      p: { w: '♟', b: '♟' },
      r: { w: '♜', b: '♜' },
      n: { w: '♞', b: '♞' },
      b: { w: '♝', b: '♝' },
      q: { w: '♛', b: '♛' },
      k: { w: '♚', b: '♚' }
    };

    const char = symbols[type]?.[color] || '♟';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${size * 0.72}px "Segoe UI Symbol", "DejaVu Sans", sans-serif`;

    // Drop shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillText(char, cx + 1.5, cy + 2.5);

    // Fill color
    ctx.fillStyle = isWhite ? '#ffffff' : '#1e1b18';
    ctx.fillText(char, cx, cy);

    // Outline stroke for piece clarity
    ctx.lineWidth = size * 0.035;
    ctx.strokeStyle = isWhite ? '#222' : '#d4af37';
    ctx.strokeText(char, cx, cy);
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

    // Restore header
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
