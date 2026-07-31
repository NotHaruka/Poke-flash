import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { GameAudioEngine } from '../core/GameAudioEngine';

interface CheckerPiece {
  player: 'red' | 'black'; // 'red' moves UP, 'black' moves DOWN
  isKing: boolean;
}

interface JumpMove {
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
  capR: number;
  capC: number;
}

interface SimpleMove {
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
}

export class CheckersPlugin implements MiniGamePlugin {
  id = 'checkers';
  name = 'Crown Checkers';
  subtitle = 'Diagonal tactics & multi-captures';
  description = 'Engage in classical Checkers with forced multi-jump combos and king promotion mechanics. Battle an aggressive AI or play local pass-and-play matches.';
  version = '1.0.0';
  genre = 'Board / Strategy';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '3–5 min';
  category = 'Board';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <circle cx="12" cy="12" r="9"/>
      <circle cx="12" cy="12" r="5"/>
      <polygon points="12 8 13.5 11 17 11.5 14.5 14 15 17.5 12 16 9 17.5 9.5 14 7 11.5 10.5 11"/>
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  private board: (CheckerPiece | null)[][] = [];
  private currentPlayer: 'red' | 'black' = 'red'; // Red starts (player)
  private gameMode: 'vsAI' | 'local' = 'vsAI';
  private isPaused = false;
  private overlayManager: GameOverlayManager | null = null;
  private context: GameLaunchContext | null = null;
  private difficulty: 'easy' | 'medium' | 'hard' = 'medium';

  private selectedSquare: { r: number; c: number } | null = null;
  private validSimpleMoves: SimpleMove[] = [];
  private validJumps: JumpMove[] = [];
  private mustJumpSequence: { r: number; c: number } | null = null; // for multi-jump locking

  private redCount = 12;
  private blackCount = 12;
  private statusMessage = "Your Turn (Red)";
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

    this.resetBoard();
    this.showHelpOverlay();
    this.tick();
  }

  private showHelpOverlay() {
    this.isPaused = true;
    this.overlayManager?.showInstructions({
      title: 'CROWN CHECKERS',
      subtitle: 'Diagonal Tactics & Multi-Captures',
      description: 'Engage in classical Checkers with forced multi-jump combos and king promotion mechanics. Battle an aggressive AI or challenge a friend in local matches.',
      objective: 'Capture all of the opponent\'s checkers or trap them so they have no legal moves remaining.',
      controls: [
        { key: 'Tap / Click checker', action: 'Select player checker' },
        { key: 'Tap green diagonal square', action: 'Move checker or capture opponent' },
        { key: 'Red Highlighted jumps', action: 'Indicates mandatory jump move' }
      ],
      rules: [
        'Diagonal moves only. Basic pieces move forward; Kings move both forward and backward.',
        'If a jump/capture is available, it MUST be taken.',
        'Red is Red (Player 1), Black is Black (Player 2 or AI).'
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { label: 'Mode', value: this.gameMode === 'vsAI' ? 'VS AI' : 'Local PvP', id: 'mode' },
          { label: 'Status', value: 'Red Turn', id: 'status' },
          { label: 'Captured', value: '0', id: 'captured' }
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

    const maxBoardWidth = width * 0.88;
    const maxBoardHeight = height * 0.65;
    this.boardSize = Math.min(maxBoardWidth, maxBoardHeight, 420);
    this.boardSize = Math.max(this.boardSize, 240);

    this.startX = (width - this.boardSize) / 2;
    this.startY = (height - this.boardSize) / 2 - 20;
    this.cellSize = this.boardSize / 8;
  }

  private resetBoard() {
    this.board = Array(8).fill(null).map(() => Array(8).fill(null));
    this.currentPlayer = 'red';
    this.selectedSquare = null;
    this.validSimpleMoves = [];
    this.validJumps = [];
    this.mustJumpSequence = null;
    this.isGameOver = false;
    this.updateHUD();

    // Place Black pieces (top 3 rows on dark squares)
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) {
          this.board[r][c] = { player: 'black', isKing: false };
        }
      }
    }

    // Place Red pieces (bottom 3 rows on dark squares)
    for (let r = 5; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if ((r + c) % 2 === 1) {
          this.board[r][c] = { player: 'red', isKing: false };
        }
      }
    }

    this.updatePieceCounts();
    this.statusMessage = "Your Turn (Red)";
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

    // Controls check
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
    if (this.gameMode === 'vsAI' && this.currentPlayer === 'black') return;

    const col = Math.floor((mx - this.startX) / this.cellSize);
    const row = Math.floor((my - this.startY) / this.cellSize);

    if (col >= 0 && col < 8 && row >= 0 && row < 8) {
      // Check if clicking a destination target move
      if (this.selectedSquare) {
        const jumpTarget = this.validJumps.find(j => j.fromR === this.selectedSquare!.r && j.fromC === this.selectedSquare!.c && j.toR === row && j.toC === col);
        if (jumpTarget) {
          this.executeJump(jumpTarget);
          return;
        }

        const simpleTarget = this.validSimpleMoves.find(m => m.fromR === this.selectedSquare!.r && m.fromC === this.selectedSquare!.c && m.toR === row && m.toC === col);
        if (simpleTarget) {
          this.executeSimpleMove(simpleTarget);
          return;
        }
      }

      // Select piece
      const piece = this.board[row][col];
      if (piece && piece.player === this.currentPlayer) {
        if (this.mustJumpSequence && (this.mustJumpSequence.r !== row || this.mustJumpSequence.c !== col)) {
          return; // Multi-jump lock
        }
        this.selectedSquare = { r: row, c: col };
        this.computeValidMovesForSelected();
        this.playSFX('select');
      } else {
        if (!this.mustJumpSequence) {
          this.selectedSquare = null;
          this.validSimpleMoves = [];
          this.validJumps = [];
        }
      }
    }
  }

  private computeValidMovesForSelected() {
    this.validSimpleMoves = [];
    this.validJumps = [];
    if (!this.selectedSquare) return;

    const { r, c } = this.selectedSquare;
    const piece = this.board[r][c];
    if (!piece) return;

    // Check if ANY jump exists for player (forced jump rule)
    const allJumpsForPlayer = this.getAllJumpsForPlayer(this.currentPlayer);

    if (allJumpsForPlayer.length > 0) {
      // Only jumps from current selected square
      this.validJumps = allJumpsForPlayer.filter(j => j.fromR === r && j.fromC === c);
    } else if (!this.mustJumpSequence) {
      // Allow simple moves if no jumps exist
      this.validSimpleMoves = this.getSimpleMovesForPiece(r, c);
    }
  }

  private getSimpleMovesForPiece(r: number, c: number): SimpleMove[] {
    const piece = this.board[r][c];
    if (!piece) return [];
    const moves: SimpleMove[] = [];

    const dirs: number[][] = [];
    if (piece.player === 'red' || piece.isKing) dirs.push([-1, -1], [-1, 1]); // Up
    if (piece.player === 'black' || piece.isKing) dirs.push([1, -1], [1, 1]);  // Down

    for (const [dr, dc] of dirs) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < 8 && nc >= 0 && nc < 8 && this.board[nr][nc] === null) {
        moves.push({ fromR: r, fromC: c, toR: nr, toC: nc });
      }
    }
    return moves;
  }

  private getAllJumpsForPlayer(player: 'red' | 'black'): JumpMove[] {
    const jumps: JumpMove[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = this.board[r][c];
        if (piece && piece.player === player) {
          jumps.push(...this.getJumpsForPiece(r, c));
        }
      }
    }
    return jumps;
  }

  private getJumpsForPiece(r: number, c: number): JumpMove[] {
    const piece = this.board[r][c];
    if (!piece) return [];
    const jumps: JumpMove[] = [];

    const dirs: number[][] = [];
    if (piece.player === 'red' || piece.isKing) dirs.push([-1, -1], [-1, 1]);
    if (piece.player === 'black' || piece.isKing) dirs.push([1, -1], [1, 1]);

    for (const [dr, dc] of dirs) {
      const capR = r + dr;
      const capC = c + dc;
      const landR = r + dr * 2;
      const landC = c + dc * 2;

      if (landR >= 0 && landR < 8 && landC >= 0 && landC < 8) {
        const targetPiece = this.board[capR][capC];
        if (targetPiece && targetPiece.player !== piece.player && this.board[landR][landC] === null) {
          jumps.push({ fromR: r, fromC: c, toR: landR, toC: landC, capR, capC });
        }
      }
    }
    return jumps;
  }

  private executeSimpleMove(move: SimpleMove) {
    const piece = this.board[move.fromR][move.fromC]!;
    this.board[move.fromR][move.fromC] = null;
    this.board[move.toR][move.toC] = piece;

    // King promotion check
    if ((piece.player === 'red' && move.toR === 0) || (piece.player === 'black' && move.toR === 7)) {
      if (!piece.isKing) {
        piece.isKing = true;
        this.playSFX('king');
      }
    }

    this.playSFX('move');
    this.selectedSquare = null;
    this.validSimpleMoves = [];
    this.validJumps = [];
    this.mustJumpSequence = null;

    this.endTurn();
  }

  private executeJump(jump: JumpMove) {
    const piece = this.board[jump.fromR][jump.fromC]!;
    this.board[jump.fromR][jump.fromC] = null;
    this.board[jump.capR][jump.capC] = null; // Remove captured piece
    this.board[jump.toR][jump.toC] = piece;

    let promoted = false;
    if ((piece.player === 'red' && jump.toR === 0) || (piece.player === 'black' && jump.toR === 7)) {
      if (!piece.isKing) {
        piece.isKing = true;
        promoted = true;
        this.playSFX('king');
      }
    }

    this.playSFX('capture');
    this.updatePieceCounts();

    // Check for further multi-jumps for this piece (if not promoted on this turn)
    const furtherJumps = !promoted ? this.getJumpsForPiece(jump.toR, jump.toC) : [];
    if (furtherJumps.length > 0) {
      this.selectedSquare = { r: jump.toR, c: jump.toC };
      this.mustJumpSequence = { r: jump.toR, c: jump.toC };
      this.validJumps = furtherJumps;
      this.validSimpleMoves = [];
    } else {
      this.selectedSquare = null;
      this.mustJumpSequence = null;
      this.validJumps = [];
      this.validSimpleMoves = [];
      this.endTurn();
    }
  }

  private endTurn() {
    this.currentPlayer = this.currentPlayer === 'red' ? 'black' : 'red';
    this.updatePieceCounts();

    // Check win condition or no available moves
    const allJumps = this.getAllJumpsForPlayer(this.currentPlayer);
    let hasSimpleMoves = false;

    if (allJumps.length === 0) {
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          if (this.board[r][c]?.player === this.currentPlayer) {
            if (this.getSimpleMovesForPiece(r, c).length > 0) {
              hasSimpleMoves = true;
              break;
            }
          }
        }
      }
    }

    if (this.redCount === 0 || (this.currentPlayer === 'red' && allJumps.length === 0 && !hasSimpleMoves)) {
      this.statusMessage = "BLACK WINS!";
      this.isGameOver = true;
      this.updateHUD();
      this.playSFX('lose');
      this.overlayManager?.showResults({
        title: 'GAME OVER',
        score: 0,
        metrics: [
          { label: 'Winner', value: 'Black' },
          { label: 'Checkers Captured', value: String(12 - this.blackCount) }
        ],
        onRestart: () => this.restartGame()
      });
    } else if (this.blackCount === 0 || (this.currentPlayer === 'black' && allJumps.length === 0 && !hasSimpleMoves)) {
      this.statusMessage = "RED WINS!";
      this.isGameOver = true;
      this.updateHUD();
      this.playSFX('win');
      this.overlayManager?.showResults({
        title: 'VICTORY!',
        score: 1000 + (this.redCount * 100),
        metrics: [
          { label: 'Winner', value: 'Red (Player)' },
          { label: 'Checkers Remaining', value: String(this.redCount) }
        ],
        onRestart: () => this.restartGame()
      });
    } else {
      this.statusMessage = this.currentPlayer === 'red' ? "Your Turn (Red)" : "Opponent Turn (Black)";
      this.updateHUD();
      if (this.gameMode === 'vsAI' && this.currentPlayer === 'black' && !this.isGameOver) {
        setTimeout(() => this.makeAIMove(), 350);
      }
    }
  }

  private updateHUD() {
    const turnStr = this.currentPlayer === 'red' ? 'Red Turn' : 'Black Turn';
    const capStr = String(12 - this.blackCount);
    this.overlayManager?.updateHUD([
      { id: 'mode', value: this.gameMode === 'vsAI' ? `VS AI (${this.difficulty.toUpperCase()})` : 'Local PvP' },
      { id: 'status', value: this.isGameOver ? 'Game Over' : turnStr },
      { id: 'captured', value: capStr }
    ]);
  }

  private updatePieceCounts() {
    let r = 0;
    let b = 0;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        const piece = this.board[row][col];
        if (piece?.player === 'red') r++;
        if (piece?.player === 'black') b++;
      }
    }
    this.redCount = r;
    this.blackCount = b;

    const capturedByRed = 12 - b;
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(capturedByRed);
    this.updateHUD();
  }

  private makeAIMove() {
    if (this.isGameOver || !this.isRunning) return;

    const jumps = this.getAllJumpsForPlayer('black');
    if (jumps.length > 0) {
      // Must jump
      const chosenJump = jumps[Math.floor(Math.random() * jumps.length)];
      this.selectedSquare = { r: chosenJump.fromR, c: chosenJump.fromC };
      this.executeJump(chosenJump);
      return;
    }

    // Otherwise simple moves
    const allSimpleMoves: SimpleMove[] = [];
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        if (this.board[r][c]?.player === 'black') {
          allSimpleMoves.push(...this.getSimpleMovesForPiece(r, c));
        }
      }
    }

    if (allSimpleMoves.length > 0) {
      const chosenMove = allSimpleMoves[Math.floor(Math.random() * allSimpleMoves.length)];
      this.selectedSquare = { r: chosenMove.fromR, c: chosenMove.fromC };
      this.executeSimpleMove(chosenMove);
    }
  }

  private playSFX(type: 'select' | 'move' | 'capture' | 'king' | 'win' | 'lose' | 'click') {
    const engine = GameAudioEngine.getInstance();
    switch (type) {
      case 'select':
        engine.playSFX('click');
        break;
      case 'move':
        engine.playSFX('step');
        break;
      case 'capture':
        engine.playSFX('hit');
        break;
      case 'king':
        engine.playSFX('win');
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
    ctx.fillText(`Red Pieces: ${this.redCount}   |   Black Pieces: ${this.blackCount}`, midX, this.startY - 26);

    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isGameOver ? '#ef4444' : '#cda250';
    ctx.fillText(this.statusMessage, midX, this.startY - 10);

    // Render Checkerboard
    const lightColor = '#f0d9b5';
    const darkColor = '#b58863';

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const x = this.startX + c * this.cellSize;
        const y = this.startY + r * this.cellSize;
        const isLight = (r + c) % 2 === 0;

        ctx.fillStyle = isLight ? lightColor : darkColor;
        ctx.fillRect(x, y, this.cellSize, this.cellSize);
      }
    }

    // Highlight Selected Square
    if (this.selectedSquare) {
      const x = this.startX + this.selectedSquare.c * this.cellSize;
      const y = this.startY + this.selectedSquare.r * this.cellSize;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.fillRect(x, y, this.cellSize, this.cellSize);
    }

    // Highlight Valid Target Moves
    for (const m of this.validSimpleMoves) {
      const cx = this.startX + m.toC * this.cellSize + this.cellSize / 2;
      const cy = this.startY + m.toR * this.cellSize + this.cellSize / 2;
      ctx.fillStyle = 'rgba(34, 197, 94, 0.55)';
      ctx.beginPath();
      ctx.arc(cx, cy, this.cellSize * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const j of this.validJumps) {
      const cx = this.startX + j.toC * this.cellSize + this.cellSize / 2;
      const cy = this.startY + j.toR * this.cellSize + this.cellSize / 2;
      ctx.fillStyle = 'rgba(239, 68, 68, 0.65)';
      ctx.beginPath();
      ctx.arc(cx, cy, this.cellSize * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Checker Pieces
    for (let r = 0; r < 8; r++) {
       for (let c = 0; c < 8; c++) {
         const piece = this.board[r]?.[c];
        if (piece) {
          const cx = this.startX + c * this.cellSize + this.cellSize / 2;
          const cy = this.startY + r * this.cellSize + this.cellSize / 2;
          const radius = this.cellSize * 0.38;

          // Piece 3D drop shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
          ctx.beginPath();
          ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
          ctx.fill();

          // Outer Body
          ctx.fillStyle = piece.player === 'red' ? '#ef4444' : '#1e293b';
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();

          // Inner Groove ring
          ctx.strokeStyle = piece.player === 'red' ? '#fca5a5' : '#475569';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(cx, cy, radius * 0.68, 0, Math.PI * 2);
          ctx.stroke();

          // Crown icon if King
          if (piece.isKing) {
            ctx.fillStyle = '#f59e0b';
            ctx.font = `bold ${radius * 0.9}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('★', cx, cy + 1);
          }
        }
      }
    }

    // Board Frame
    ctx.strokeStyle = '#3a385e';
    ctx.lineWidth = 2;
    ctx.strokeRect(this.startX, this.startY, this.boardSize, this.boardSize);

    // Bottom Control Buttons
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
