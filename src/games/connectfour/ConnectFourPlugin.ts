import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';

type Player = 'yellow' | 'red';

interface DroppingDisc {
  col: number;
  targetRow: number;
  currentY: number;
  targetY: number;
  player: Player;
}

export class ConnectFourPlugin implements MiniGamePlugin {
  id = 'connect_four';
  name = 'Connect Four';
  subtitle = 'Gravity grid alignment & vertical tactics';
  description = 'Drop tokens into a vertical 7x6 grid and align four of your color horizontally, vertically, or diagonally. Test your spatial foresight against an intelligent AI or in local head-to-head matches.';
  version = '1.0.0';
  genre = 'Board / Strategy';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '2–4 min';
  category = 'Board';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <circle cx="8" cy="8" r="1.5" fill="currentColor"/>
      <circle cx="12" cy="8" r="1.5"/>
      <circle cx="16" cy="8" r="1.5"/>
      <circle cx="8" cy="12" r="1.5"/>
      <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
      <circle cx="16" cy="12" r="1.5"/>
      <circle cx="8" cy="16" r="1.5"/>
      <circle cx="12" cy="16" r="1.5"/>
      <circle cx="16" cy="16" r="1.5" fill="currentColor"/>
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  private board: (Player | null)[][] = Array(6).fill(null).map(() => Array(7).fill(null)); // 6 rows, 7 cols
  private currentPlayer: Player = 'yellow';
  private gameMode: 'vsAI' | 'local' = 'vsAI';
  private difficulty: 'easy' | 'medium' | 'hard' = 'medium';

  private hoverCol: number | null = null;
  private droppingDisc: DroppingDisc | null = null;
  private winningCells: { r: number; c: number }[] | null = null;

  private winsYellow = 0;
  private winsRed = 0;
  private statusMessage = "Your Turn (Yellow)";
  private isGameOver = false;

  // Board layout metrics
  private boardWidth = 0;
  private boardHeight = 0;
  private cellSize = 0;
  private startX = 0;
  private startY = 0;

  // Listeners
  private boundMouseDown: any;
  private boundTouchStart: any;
  private boundMouseMove: any;
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
    if (scoreLabel) scoreLabel.textContent = 'Wins (Yellow):';
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
    this.resetBoard();
    this.resizeCanvas();

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundResize = this.resizeCanvas.bind(this);

    if (this.canvas) {
      this.canvas.style.touchAction = 'none';
      this.canvas.addEventListener('mousedown', this.boundMouseDown);
      this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
      this.canvas.addEventListener('mousemove', this.boundMouseMove);
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

    // 7 cols x 6 rows
    const maxW = width * 0.9;
    const maxH = height * 0.65;
    this.cellSize = Math.min(maxW / 7, maxH / 6, 56);
    this.cellSize = Math.max(this.cellSize, 32);

    this.boardWidth = this.cellSize * 7;
    this.boardHeight = this.cellSize * 6;

    this.startX = (width - this.boardWidth) / 2;
    this.startY = (height - this.boardHeight) / 2 + 10;
  }

  private resetBoard() {
    this.board = Array(6).fill(null).map(() => Array(7).fill(null));
    this.currentPlayer = 'yellow';
    this.droppingDisc = null;
    this.winningCells = null;
    this.isGameOver = false;
    this.statusMessage = "Your Turn (Yellow)";
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (mx >= this.startX && mx <= this.startX + this.boardWidth && my >= this.startY - 40 && my <= this.startY + this.boardHeight) {
      this.hoverCol = Math.floor((mx - this.startX) / this.cellSize);
    } else {
      this.hoverCol = null;
    }
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
    const controlsY = this.startY + this.boardHeight + 30;

    // Control buttons check
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

    if (this.isGameOver || this.droppingDisc) return;
    if (this.gameMode === 'vsAI' && this.currentPlayer === 'red') return;

    if (mx >= this.startX && mx <= this.startX + this.boardWidth) {
      const col = Math.floor((mx - this.startX) / this.cellSize);
      if (col >= 0 && col < 7) {
        this.dropTokenInColumn(col);
      }
    }
  }

  private dropTokenInColumn(col: number) {
    // Find lowest open row
    let targetRow = -1;
    for (let r = 5; r >= 0; r--) {
      if (this.board[r][col] === null) {
        targetRow = r;
        break;
      }
    }

    if (targetRow === -1) return; // Column full

    const targetY = this.startY + targetRow * this.cellSize + this.cellSize / 2;
    const startY = this.startY - this.cellSize / 2;

    this.droppingDisc = {
      col,
      targetRow,
      currentY: startY,
      targetY,
      player: this.currentPlayer
    };

    this.playSFX('drop');
  }

  private completeDrop() {
    if (!this.droppingDisc) return;

    const { col, targetRow, player } = this.droppingDisc;
    this.board[targetRow][col] = player;
    this.droppingDisc = null;

    // Check Win
    const win = this.checkWin(this.board, player);
    if (win) {
      this.winningCells = win;
      this.isGameOver = true;
      if (player === 'yellow') {
        this.winsYellow++;
        this.statusMessage = "YELLOW WINS!";
        this.playSFX('win');
      } else {
        this.winsRed++;
        this.statusMessage = "RED WINS!";
        this.playSFX('lose');
      }
      const scoreVal = document.getElementById('bb-score-val');
      if (scoreVal) scoreVal.textContent = String(this.winsYellow);
      return;
    }

    // Check Draw
    if (this.board.every(row => row.every(cell => cell !== null))) {
      this.isGameOver = true;
      this.statusMessage = "MATCH IS A DRAW!";
      this.playSFX('click');
      return;
    }

    // Pass turn
    this.currentPlayer = player === 'yellow' ? 'red' : 'yellow';
    this.statusMessage = this.currentPlayer === 'yellow' ? "Your Turn (Yellow)" : "Opponent Turn (Red)";

    if (this.gameMode === 'vsAI' && this.currentPlayer === 'red' && !this.isGameOver) {
      setTimeout(() => this.makeAIMove(), 350);
    }
  }

  private makeAIMove() {
    if (this.isGameOver || this.droppingDisc || !this.isRunning) return;

    // Find available columns
    const validCols: number[] = [];
    for (let c = 0; c < 7; c++) {
      if (this.board[0][c] === null) validCols.push(c);
    }
    if (validCols.length === 0) return;

    let chosenCol = -1;

    // 1. Check if AI can win immediately
    for (const c of validCols) {
      const tempBoard = this.board.map(r => [...r]);
      const r = this.getLowestEmptyRow(tempBoard, c);
      tempBoard[r][c] = 'red';
      if (this.checkWin(tempBoard, 'red')) {
        chosenCol = c;
        break;
      }
    }

    // 2. Block opponent from winning on next turn
    if (chosenCol === -1) {
      for (const c of validCols) {
        const tempBoard = this.board.map(r => [...r]);
        const r = this.getLowestEmptyRow(tempBoard, c);
        tempBoard[r][c] = 'yellow';
        if (this.checkWin(tempBoard, 'yellow')) {
          chosenCol = c;
          break;
        }
      }
    }

    // 3. Prefer center columns or random
    if (chosenCol === -1) {
      const centerCols = [3, 2, 4, 1, 5, 0, 6].filter(c => validCols.includes(c));
      chosenCol = centerCols[Math.floor(Math.random() * Math.min(3, centerCols.length))];
    }

    this.dropTokenInColumn(chosenCol);
  }

  private getLowestEmptyRow(b: (Player | null)[][], c: number): number {
    for (let r = 5; r >= 0; r--) {
      if (b[r][c] === null) return r;
    }
    return -1;
  }

  private checkWin(b: (Player | null)[][], p: Player): { r: number; c: number }[] | null {
    // Horizontal
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        if (b[r][c] === p && b[r][c+1] === p && b[r][c+2] === p && b[r][c+3] === p) {
          return [{r, c}, {r, c: c+1}, {r, c: c+2}, {r, c: c+3}];
        }
      }
    }
    // Vertical
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 7; c++) {
        if (b[r][c] === p && b[r+1][c] === p && b[r+2][c] === p && b[r+3][c] === p) {
          return [{r, c}, {r: r+1, c}, {r: r+2, c}, {r: r+3, c}];
        }
      }
    }
    // Diagonal Down-Right
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        if (b[r][c] === p && b[r+1][c+1] === p && b[r+2][c+2] === p && b[r+3][c+3] === p) {
          return [{r, c}, {r: r+1, c: c+1}, {r: r+2, c: c+2}, {r: r+3, c: c+3}];
        }
      }
    }
    // Diagonal Up-Right
    for (let r = 3; r < 6; r++) {
      for (let c = 0; c < 4; c++) {
        if (b[r][c] === p && b[r-1][c+1] === p && b[r-2][c+2] === p && b[r-3][c+3] === p) {
          return [{r, c}, {r: r-1, c: c+1}, {r: r-2, c: c+2}, {r: r-3, c: c+3}];
        }
      }
    }
    return null;
  }

  private playSFX(type: 'drop' | 'win' | 'lose' | 'click') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'drop') {
        osc.frequency.setValueAtTime(450, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.12);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'click') {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'win') {
        const freqs = [329.63, 440, 554.37, 659.25];
        freqs.forEach((f, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g);
          g.connect(ctx.destination);
          o.frequency.setValueAtTime(f, now + i * 0.08);
          g.gain.setValueAtTime(0.05, now + i * 0.08);
          g.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.2);
          o.start(now + i * 0.08);
          o.stop(now + i * 0.08 + 0.2);
        });
      }
    } catch (e) {}
  }

  private tick() {
    if (!this.isRunning) return;

    // Update drop physics animation
    if (this.droppingDisc) {
      this.droppingDisc.currentY += 22; // speed
      if (this.droppingDisc.currentY >= this.droppingDisc.targetY) {
        this.droppingDisc.currentY = this.droppingDisc.targetY;
        this.completeDrop();
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

    // Header Status String
    ctx.textAlign = 'center';
    ctx.font = 'bold 13px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isGameOver ? '#ef4444' : '#cda250';
    ctx.fillText(this.statusMessage, midX, this.startY - 22);

    // Hover Column Arrow / Preview Token
    if (this.hoverCol !== null && !this.isGameOver && !this.droppingDisc) {
      const hx = this.startX + this.hoverCol * this.cellSize + this.cellSize / 2;
      const hy = this.startY - 12;
      ctx.fillStyle = this.currentPlayer === 'yellow' ? 'rgba(234, 179, 8, 0.6)' : 'rgba(239, 68, 68, 0.6)';
      ctx.beginPath();
      ctx.arc(hx, hy, this.cellSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Render Grid Board Plate (Blue Stand)
    ctx.fillStyle = '#1e3a8a'; // Royal Blue Grid
    ctx.beginPath();
    ctx.roundRect(this.startX - 8, this.startY - 8, this.boardWidth + 16, this.boardHeight + 16, 12);
    ctx.fill();

    // Render Grid Holes / Slots
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 7; c++) {
        const cx = this.startX + c * this.cellSize + this.cellSize / 2;
        const cy = this.startY + r * this.cellSize + this.cellSize / 2;
        const radius = this.cellSize * 0.38;

        const cell = this.board[r][c];

        if (cell === null) {
          // Empty Slot (Dark background cutout)
          ctx.fillStyle = '#0a0915';
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        } else {
          this.drawDisc(cx, cy, radius, cell);
        }
      }
    }

    // Render Active Dropping Disc
    if (this.droppingDisc) {
      const cx = this.startX + this.droppingDisc.col * this.cellSize + this.cellSize / 2;
      const cy = this.droppingDisc.currentY;
      const radius = this.cellSize * 0.38;
      this.drawDisc(cx, cy, radius, this.droppingDisc.player);
    }

    // Highlight Winning 4 Discs
    if (this.winningCells) {
      for (const cell of this.winningCells) {
        const cx = this.startX + cell.c * this.cellSize + this.cellSize / 2;
        const cy = this.startY + cell.r * this.cellSize + this.cellSize / 2;

        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 4;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#22c55e';
        ctx.beginPath();
        ctx.arc(cx, cy, this.cellSize * 0.4, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
    }

    // Bottom Controls
    const controlsY = this.startY + this.boardHeight + 32;
    this.drawButton(midX - 100, controlsY, 76, 26, 'VS AI', this.gameMode === 'vsAI');
    this.drawButton(midX - 10, controlsY, 76, 26, 'LOCAL PvP', this.gameMode === 'local');
    this.drawButton(midX + 80, controlsY, 68, 26, 'NEW GAME', false);
  }

  private drawDisc(cx: number, cy: number, radius: number, player: Player) {
    const ctx = this.ctx!;
    const mainColor = player === 'yellow' ? '#eab308' : '#ef4444';
    const innerColor = player === 'yellow' ? '#fef08a' : '#fca5a5';

    // Drop Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 3, radius, 0, Math.PI * 2);
    ctx.fill();

    // Disc Body
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fill();

    // Inner Ring
    ctx.strokeStyle = innerColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.65, 0, Math.PI * 2);
    ctx.stroke();
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
      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
    }
    window.removeEventListener('resize', this.boundResize);

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
