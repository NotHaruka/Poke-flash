import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';

export class MancalaPlugin implements MiniGamePlugin {
  id = 'mancala';
  name = 'Mancala Kalah';
  subtitle = 'Ancient pit & seed sowing strategy';
  description = 'Sow seeds into pits strategically to capture your opponent\'s seeds and maximize your store count.';
  version = '1.0.0';
  genre = 'Board / Strategy';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '3–6 min';
  category = 'Board & Strategy';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <rect x="2" y="6" width="20" height="12" rx="6" />
      <circle cx="7" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="17" cy="12" r="2" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  // Board layout: pits 0-5 (P1 bottom), pit 6 (P1 store), pits 7-12 (P2 top), pit 13 (P2 store)
  private board: number[] = [];
  private currentPlayer: 1 | 2 = 1;
  private gameMode: 'vsAI' | 'local' = 'vsAI';
  private isGameOver = false;
  private statusMessage = 'Your Turn (Player 1)';

  private pitRadius = 0;
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
    if (scoreLabel) scoreLabel.textContent = 'Store Score';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

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
    this.boundResize = this.resizeCanvas.bind(this);

    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    window.addEventListener('resize', this.boundResize);

    this.tick();
  }

  private resetBoard() {
    // 4 seeds in each pit 0-5 and 7-12, stores 6 & 13 start at 0
    this.board = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
    this.currentPlayer = 1;
    this.isGameOver = false;
    this.statusMessage = 'Your Turn (Player 1)';
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

    const boardW = Math.min(width * 0.9, 420);
    this.pitRadius = boardW / 18;
    this.startX = (width - boardW) / 2;
    this.startY = (height - (this.pitRadius * 8)) / 2;
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
    const btnY = this.startY + this.pitRadius * 9;

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

    if (this.isGameOver) {
      this.resetBoard();
      return;
    }

    // Identify pit clicked
    if (this.currentPlayer === 1 || this.gameMode === 'local') {
      const p1Y = this.startY + this.pitRadius * 5;
      const p2Y = this.startY + this.pitRadius * 2;

      for (let i = 0; i < 6; i++) {
        const pitIdx = this.currentPlayer === 1 ? i : 12 - i;
        const pitY = this.currentPlayer === 1 ? p1Y : p2Y;
        const pitX = this.startX + this.pitRadius * 3 + i * (this.pitRadius * 2.2);

        if (Math.hypot(mx - pitX, my - pitY) <= this.pitRadius) {
          if (this.board[pitIdx] > 0) {
            this.makeMove(pitIdx);
            return;
          }
        }
      }
    }
  }

  private makeMove(pitIdx: number) {
    let seeds = this.board[pitIdx];
    this.board[pitIdx] = 0;

    let curr = pitIdx;
    while (seeds > 0) {
      curr = (curr + 1) % 14;
      // Skip opponent's store
      if (this.currentPlayer === 1 && curr === 13) continue;
      if (this.currentPlayer === 2 && curr === 6) continue;

      this.board[curr]++;
      seeds--;
    }

    // Capture rule: if last seed lands in an empty pit on player's side
    if (this.currentPlayer === 1 && curr >= 0 && curr <= 5 && this.board[curr] === 1) {
      const oppIdx = 12 - curr;
      if (this.board[oppIdx] > 0) {
        this.board[6] += this.board[oppIdx] + 1;
        this.board[oppIdx] = 0;
        this.board[curr] = 0;
      }
    } else if (this.currentPlayer === 2 && curr >= 7 && curr <= 12 && this.board[curr] === 1) {
      const oppIdx = 12 - curr;
      if (this.board[oppIdx] > 0) {
        this.board[13] += this.board[oppIdx] + 1;
        this.board[oppIdx] = 0;
        this.board[curr] = 0;
      }
    }

    // Extra turn rule: if last seed landed in player's store
    const extraTurn = (this.currentPlayer === 1 && curr === 6) || (this.currentPlayer === 2 && curr === 13);

    this.checkEndGame();

    if (!this.isGameOver) {
      if (extraTurn) {
        this.statusMessage = `P${this.currentPlayer} landed in store! Free Turn!`;
      } else {
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        this.statusMessage = `Turn: Player ${this.currentPlayer}`;
      }

      if (this.gameMode === 'vsAI' && this.currentPlayer === 2) {
        setTimeout(() => this.makeAIMove(), 400);
      }
    }

    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.board[6]);
  }

  private makeAIMove() {
    if (this.isGameOver || !this.isRunning) return;

    // AI selects valid pit (7-12)
    const validPits = [7, 8, 9, 10, 11, 12].filter(p => this.board[p] > 0);
    if (validPits.length === 0) return;

    // Prefer move that lands in store (13)
    let bestPit = validPits[0];
    for (const p of validPits) {
      if ((p + this.board[p]) % 14 === 13) {
        bestPit = p;
        break;
      }
    }

    this.makeMove(bestPit);
  }

  private checkEndGame() {
    const p1Empty = this.board.slice(0, 6).every(s => s === 0);
    const p2Empty = this.board.slice(7, 13).every(s => s === 0);

    if (p1Empty || p2Empty) {
      this.isGameOver = true;
      // Collect remaining seeds
      for (let i = 0; i < 6; i++) {
        this.board[6] += this.board[i];
        this.board[i] = 0;
      }
      for (let i = 7; i < 13; i++) {
        this.board[13] += this.board[i];
        this.board[i] = 0;
      }

      if (this.board[6] > this.board[13]) {
        this.statusMessage = `P1 Wins! (${this.board[6]} - ${this.board[13]})`;
      } else if (this.board[13] > this.board[6]) {
        this.statusMessage = `P2 Wins! (${this.board[13]} - ${this.board[6]})`;
      } else {
        this.statusMessage = `Tie Game! (${this.board[6]} - ${this.board[13]})`;
      }
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

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const midX = canvas.width / 2;

    ctx.font = 'bold 13px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isGameOver ? '#10b981' : '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(this.statusMessage, midX, this.startY - 20);

    // Board wood card
    const boardW = this.pitRadius * 18;
    const boardH = this.pitRadius * 7.5;
    ctx.fillStyle = '#1e293b'; ctx.strokeStyle = '#334155'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(this.startX, this.startY, boardW, boardH, 16); ctx.fill(); ctx.stroke();

    // P2 Store (left, index 13)
    this.drawStore(this.startX + this.pitRadius * 1.5, this.startY + boardH / 2, 'P2 Store', this.board[13]);
    // P1 Store (right, index 6)
    this.drawStore(this.startX + boardW - this.pitRadius * 1.5, this.startY + boardH / 2, 'P1 Store', this.board[6]);

    // P2 Pits (top row 12..7)
    const p2Y = this.startY + this.pitRadius * 2.2;
    for (let i = 0; i < 6; i++) {
      const px = this.startX + this.pitRadius * 3.8 + i * (this.pitRadius * 2.1);
      this.drawPit(px, p2Y, this.board[12 - i], this.currentPlayer === 2);
    }

    // P1 Pits (bottom row 0..5)
    const p1Y = this.startY + this.pitRadius * 5.3;
    for (let i = 0; i < 6; i++) {
      const px = this.startX + this.pitRadius * 3.8 + i * (this.pitRadius * 2.1);
      this.drawPit(px, p1Y, this.board[i], this.currentPlayer === 1);
    }

    // Mode buttons
    const btnY = this.startY + boardH + 30;
    ctx.fillStyle = this.gameMode === 'vsAI' ? '#10b981' : '#334155';
    ctx.beginPath(); ctx.roundRect(midX - 100, btnY - 14, 90, 28, 6); ctx.fill();
    ctx.font = 'bold 11px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('VS AI', midX - 55, btnY + 3);

    ctx.fillStyle = this.gameMode === 'local' ? '#10b981' : '#334155';
    ctx.beginPath(); ctx.roundRect(midX + 10, btnY - 14, 90, 28, 6); ctx.fill();
    ctx.fillText('LOCAL 2P', midX + 55, btnY + 3);
  }

  private drawPit(x: number, y: number, count: number, activeTurn: boolean) {
    const ctx = this.ctx!;
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = activeTurn ? '#38bdf8' : '#475569';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, this.pitRadius, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#f8fafc'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(count), x, y);
  }

  private drawStore(x: number, y: number, label: string, count: number) {
    const ctx = this.ctx!;
    ctx.fillStyle = '#0f172a'; ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(x - this.pitRadius, y - this.pitRadius * 2.2, this.pitRadius * 2, this.pitRadius * 4.4, 12); ctx.fill(); ctx.stroke();

    ctx.font = 'bold 14px sans-serif'; ctx.fillStyle = '#f59e0b'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(count), x, y);
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('resize', this.boundResize);
  }
}
