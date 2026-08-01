import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { resetGameCanvas } from '../../game.js';

export class GomokuPlugin implements MiniGamePlugin {
  id = 'gomoku';
  name = 'Gomoku';
  subtitle = '5-in-a-row strategy';
  description = 'Align five stones horizontally, vertically, or diagonally on a 15x15 board. Play against an AI opponent or with a friend locally.';
  version = '1.0.0';
  genre = 'Board / Strategy';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '3–8 min';
  category = 'Board & Strategy';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" fill="currentColor" />
      <path d="M12 3v18M3 12h18" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private overlayManager: GameOverlayManager | null = null;

  private boardSize = 15;
  private board: Array<Array<'black' | 'white' | null>> = [];
  private currentPlayer: 'black' | 'white' = 'black';
  private gameMode: 'vsAI' | 'local' = 'vsAI';
  private isMatchOver = false;
  private winningLine: Array<[number, number]> | null = null;
  private statusMessage = 'Your Turn (Black)';

  private cellSize = 0;
  private startX = 0;
  private startY = 0;

  private boundMouseDown: any;
  private boundTouchStart: any;
  private boundResize: any;

  launch(context: GameLaunchContext): void {
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
    if (scoreLabel) scoreLabel.textContent = 'Gomoku';
    if (scoreVal) scoreVal.textContent = '15x15';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onRestart: () => this.resetBoard()
    });

    this.overlayManager.showInstructions({
      title: 'GOMOKU FIVE-IN-A-ROW',
      subtitle: 'Classic Tactical Alignment',
      description: 'Place your stones strategically on the 15x15 board to construct an unbroken line of 5 matching stones.',
      objective: 'Be the first player to form an uninterrupted line of 5 stones horizontally, vertically, or diagonally.',
      controls: [
        { key: 'Tap / Click', action: 'Place Stone on Intersection' },
        { key: 'Mode Toggle', action: 'Switch between VS AI & Local 2P' }
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { id: 'turn', label: 'Turn', value: 'Black' },
          { id: 'mode', label: 'Mode', value: 'VS AI' }
        ]);
        this.startGame();
      }
    });
  }

  private startGame() {
    this.isRunning = true;
    this.resetBoard();
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

  private resetBoard() {
    this.board = Array(this.boardSize).fill(null).map(() => Array(this.boardSize).fill(null));
    this.currentPlayer = 'black';
    this.isMatchOver = false;
    this.winningLine = null;
    this.statusMessage = 'Your Turn (Black)';
    this.overlayManager?.updateStat('turn', 'Black');
    this.overlayManager?.updateStat('mode', this.gameMode === 'vsAI' ? 'VS AI' : 'Local 2P');
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

    const maxBoardDim = Math.min(width * 0.92, height * 0.72);
    this.cellSize = maxBoardDim / (this.boardSize - 1);
    this.startX = (width - (this.boardSize - 1) * this.cellSize) / 2;
    this.startY = (height - (this.boardSize - 1) * this.cellSize) / 2 + 10;
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

    const midX = this.canvas.width / 2;
    const btnY = this.startY + (this.boardSize - 1) * this.cellSize + 35;

    // Toggle mode
    if (Math.abs(mx - (midX - 55)) <= 45 && Math.abs(my - btnY) <= 15) {
      this.gameMode = 'vsAI';
      this.resetBoard();
      return;
    }
    if (Math.abs(mx - (midX + 55)) <= 45 && Math.abs(my - btnY) <= 15) {
      this.gameMode = 'local';
      this.resetBoard();
      return;
    }

    if (this.isMatchOver) {
      if (Math.abs(mx - midX) <= 60 && Math.abs(my - (this.startY + ((this.boardSize - 1) * this.cellSize) / 2 + 25)) <= 20) {
        this.resetBoard();
      }
      return;
    }

    // Board click nearest intersection
    const col = Math.round((mx - this.startX) / this.cellSize);
    const row = Math.round((my - this.startY) / this.cellSize);

    if (col >= 0 && col < this.boardSize && row >= 0 && row < this.boardSize) {
      if (this.board[row][col] === null) {
        this.makeMove(row, col);
      }
    }
  }

  private makeMove(r: number, c: number) {
    this.board[r][c] = this.currentPlayer;

    const winLine = this.checkWin(r, c, this.currentPlayer);
    if (winLine) {
      this.winningLine = winLine;
      this.isMatchOver = true;
      const winnerName = this.currentPlayer === 'black' ? 'Black' : 'White';
      this.statusMessage = `${winnerName} Wins!`;
      const isPlayerWin = this.gameMode === 'local' || this.currentPlayer === 'black';

      setTimeout(() => {
        this.overlayManager?.showResults({
          title: isPlayerWin ? 'VICTORY! 🏆' : 'DEFEAT',
          subtitle: `${winnerName} connected 5 stones in a row!`,
          isWin: isPlayerWin,
          stats: [
            { label: 'Winner', value: winnerName },
            { label: 'Mode', value: this.gameMode === 'vsAI' ? 'VS AI' : 'Local 2P' }
          ],
          onRestart: () => {
            this.overlayManager?.hideResults();
            this.resetBoard();
          }
        });
      }, 400);
      return;
    }

    // Check full
    let isFull = true;
    for (let i = 0; i < this.boardSize; i++) {
      for (let j = 0; j < this.boardSize; j++) {
        if (!this.board[i][j]) isFull = false;
      }
    }
    if (isFull) {
      this.isMatchOver = true;
      this.statusMessage = 'Board Full - Draw!';
      setTimeout(() => {
        this.overlayManager?.showResults({
          title: 'MATCH DRAW 🤝',
          subtitle: 'The board is completely full with no 5-in-a-row!',
          isWin: true,
          stats: [
            { label: 'Result', value: 'Draw' }
          ],
          onRestart: () => {
            this.overlayManager?.hideResults();
            this.resetBoard();
          }
        });
      }, 400);
      return;
    }

    this.currentPlayer = this.currentPlayer === 'black' ? 'white' : 'black';
    this.statusMessage = this.currentPlayer === 'black' ? 'Black Turn' : 'White Turn';
    this.overlayManager?.updateStat('turn', this.currentPlayer === 'black' ? 'Black' : 'White');

    if (this.gameMode === 'vsAI' && this.currentPlayer === 'white' && !this.isMatchOver) {
      setTimeout(() => this.makeAIMove(), 200);
    }
  }

  private makeAIMove() {
    if (this.isMatchOver || !this.isRunning || this.gameMode !== 'vsAI' || this.currentPlayer !== 'white') return;

    // Smart heuristic AI for Gomoku
    let bestScore = -Infinity;
    let bestMove: [number, number] = [7, 7];

    for (let r = 0; r < this.boardSize; r++) {
      for (let c = 0; c < this.boardSize; c++) {
        if (this.board[r][c] === null) {
          const score = this.evaluateCell(r, c);
          if (score > bestScore) {
            bestScore = score;
            bestMove = [r, c];
          }
        }
      }
    }

    this.makeMove(bestMove[0], bestMove[1]);
  }

  private evaluateCell(r: number, c: number): number {
    // Distance from center preference
    let score = 100 - (Math.abs(r - 7) + Math.abs(c - 7)) * 5;

    // Check attack (white) and defense (black)
    this.board[r][c] = 'white';
    if (this.checkWin(r, c, 'white')) score += 100000;
    this.board[r][c] = 'black';
    if (this.checkWin(r, c, 'black')) score += 50000;
    this.board[r][c] = null;

    return score + Math.random() * 10;
  }

  private checkWin(r: number, c: number, p: 'black' | 'white'): Array<[number, number]> | null {
    const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
    for (const [dr, dc] of dirs) {
      const line: Array<[number, number]> = [[r, c]];
      // Forward
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize && this.board[nr][nc] === p) {
        line.push([nr, nc]);
        nr += dr; nc += dc;
      }
      // Backward
      nr = r - dr; nc = c - dc;
      while (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize && this.board[nr][nc] === p) {
        line.unshift([nr, nc]);
        nr -= dr; nc -= dc;
      }

      if (line.length >= 5) return line;
    }
    return null;
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

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const midX = canvas.width / 2;

    // Status
    ctx.font = 'bold 13px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isMatchOver ? '#10b981' : '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(this.statusMessage, midX, this.startY - 20);

    // Wood board background
    const boardWidth = (this.boardSize - 1) * this.cellSize;
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(this.startX - 15, this.startY - 15, boardWidth + 30, boardWidth + 30, 8);
    ctx.fill();
    ctx.stroke();

    // Grid lines
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < this.boardSize; i++) {
      ctx.moveTo(this.startX, this.startY + i * this.cellSize);
      ctx.lineTo(this.startX + boardWidth, this.startY + i * this.cellSize);
      ctx.moveTo(this.startX + i * this.cellSize, this.startY);
      ctx.lineTo(this.startX + i * this.cellSize, this.startY + boardWidth);
    }
    ctx.stroke();

    // Star points
    const starPts = [3, 7, 11];
    ctx.fillStyle = '#64748b';
    for (const r of starPts) {
      for (const c of starPts) {
        ctx.beginPath();
        ctx.arc(this.startX + c * this.cellSize, this.startY + r * this.cellSize, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Pieces
    for (let r = 0; r < this.boardSize; r++) {
      for (let c = 0; c < this.boardSize; c++) {
        const val = this.board[r][c];
        if (!val) continue;

        const cx = this.startX + c * this.cellSize;
        const cy = this.startY + r * this.cellSize;

        ctx.beginPath();
        ctx.arc(cx, cy, this.cellSize * 0.42, 0, Math.PI * 2);
        ctx.fillStyle = val === 'black' ? '#0f172a' : '#f8fafc';
        ctx.fill();
        ctx.strokeStyle = val === 'black' ? '#334155' : '#cbd5e1';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Winning line highlight
    if (this.winningLine && this.winningLine.length >= 5) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 4;
      ctx.beginPath();
      const first = this.winningLine[0];
      const last = this.winningLine[this.winningLine.length - 1];
      ctx.moveTo(this.startX + first[1] * this.cellSize, this.startY + first[0] * this.cellSize);
      ctx.lineTo(this.startX + last[1] * this.cellSize, this.startY + last[0] * this.cellSize);
      ctx.stroke();
    }

    // Mode buttons
    const btnY = this.startY + boardWidth + 35;
    ctx.fillStyle = this.gameMode === 'vsAI' ? '#10b981' : '#334155';
    ctx.beginPath(); ctx.roundRect(midX - 100, btnY - 14, 90, 28, 6); ctx.fill();
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('VS AI', midX - 55, btnY + 3);

    ctx.fillStyle = this.gameMode === 'local' ? '#10b981' : '#334155';
    ctx.beginPath(); ctx.roundRect(midX + 10, btnY - 14, 90, 28, 6); ctx.fill();
    ctx.fillText('LOCAL 2P', midX + 55, btnY + 3);

    // Match over popup
    if (this.isMatchOver) {
      const midY = this.startY + boardWidth / 2;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath(); ctx.roundRect(midX - 110, midY - 40, 220, 80, 10); ctx.fill();
      ctx.strokeStyle = '#334155'; ctx.stroke();
      ctx.font = 'bold 16px "Fraunces", serif'; ctx.fillStyle = '#38bdf8';
      ctx.fillText(this.statusMessage, midX, midY - 10);
      ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.roundRect(midX - 50, midY + 10, 100, 24, 12); ctx.fill();
      ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#0f172a'; ctx.fillText('RESTART', midX, midY + 26);
    }
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('resize', this.boundResize);
    if (this.overlayManager) {
      this.overlayManager.destroy();
      this.overlayManager = null;
    }
  }
}
