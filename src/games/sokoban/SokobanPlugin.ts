import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { resetGameCanvas } from '../../game.js';

export class SokobanPlugin implements MiniGamePlugin {
  id = 'sokoban';
  name = 'Sokoban Crate Pusher';
  subtitle = 'Warehouse spatial logic';
  description = 'Push crates onto designated target storage spots without trapping yourself against walls.';
  version = '1.0.0';
  genre = 'Puzzle';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '2–6 min';
  category = 'Puzzle';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M9 9h6v6H9z" fill="currentColor" opacity="0.3" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private overlayManager: GameOverlayManager | null = null;

  private currentLevel = 0;
  private grid: string[][] = [];
  private playerPos: [number, number] = [0, 0];
  private moves = 0;
  private isWon = false;
  private history: { grid: string[][]; playerPos: [number, number] }[] = [];

  // Levels maps: W=Wall, .=Floor, P=Player, B=Box, T=Target, *=Box on Target, +=Player on Target
  private levels = [
    [
      "WWWWW",
      "W.P.W",
      "W.B.W",
      "W.T.W",
      "WWWWW"
    ],
    [
      "WWWWWW",
      "W..P.W",
      "W.B..W",
      "W..T.W",
      "W.BT.W",
      "WWWWWW"
    ],
    [
      "WWWWWWW",
      "W.T.P.W",
      "W.B.B.W",
      "W..T..W",
      "WWWWWWW"
    ]
  ];

  private cellSize = 0;
  private startX = 0;
  private startY = 0;

  private boundMouseDown: any;
  private boundTouchStart: any;
  private boundKeyDown: any;
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
    if (scoreLabel) scoreLabel.textContent = 'Moves';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onRestart: () => this.loadLevel(this.currentLevel)
    });

    this.overlayManager.showInstructions({
      title: 'SOKOBAN CRATE PUSHER',
      subtitle: 'Warehouse Logic Puzzle',
      description: 'Push crates onto designated target storage spots without trapping yourself against walls.',
      objective: 'Push all wooden crates onto yellow target dots. Plan ahead so you do not push crates into un-extractable corners!',
      controls: [
        { key: 'WASD / Arrows', action: 'Move / Push Crates' },
        { key: 'Touch D-Pad', action: 'On-Screen Arrow Controls' },
        { key: 'Undo / Reset', action: 'Step Back or Restart Level' }
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { id: 'level', label: 'Level', value: '1 / 3' },
          { id: 'moves', label: 'Moves', value: '0' }
        ]);
        this.startLevel();
      }
    });
  }

  private startLevel() {
    this.isRunning = true;
    this.loadLevel(0);
    this.resizeCanvas();

    this.boundMouseDown = this.handleMouseDown.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundResize = this.resizeCanvas.bind(this);

    if (this.canvas) {
      this.canvas.style.touchAction = 'none';
      this.canvas.addEventListener('mousedown', this.boundMouseDown);
      this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    }
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('resize', this.boundResize);

    this.tick();
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (!this.isRunning || this.isWon) return;
    const key = e.key.toLowerCase();
    if (key === 'arrowup' || key === 'w') { e.preventDefault(); this.movePlayer(-1, 0); }
    else if (key === 'arrowdown' || key === 's') { e.preventDefault(); this.movePlayer(1, 0); }
    else if (key === 'arrowleft' || key === 'a') { e.preventDefault(); this.movePlayer(0, -1); }
    else if (key === 'arrowright' || key === 'd') { e.preventDefault(); this.movePlayer(0, 1); }
    else if (key === 'z') { e.preventDefault(); this.undo(); }
    else if (key === 'r') { e.preventDefault(); this.loadLevel(this.currentLevel); }
  }

  private loadLevel(levelIdx: number) {
    this.currentLevel = levelIdx % this.levels.length;
    const raw = this.levels[this.currentLevel];
    this.grid = raw.map(row => row.split(''));
    this.moves = 0;
    this.isWon = false;
    this.history = [];

    // Find player pos
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        if (this.grid[r][c] === 'P' || this.grid[r][c] === '+') {
          this.playerPos = [r, c];
        }
      }
    }
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = '0';
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

    const rows = this.grid.length;
    const cols = this.grid[0].length;

    this.cellSize = Math.min((width - 40) / cols, (height - 180) / rows, 44);
    this.startX = (width - cols * this.cellSize) / 2;
    this.startY = (height - rows * this.cellSize) / 2 - 30;
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
    const dpadY = this.startY + this.grid.length * this.cellSize + 60;

    // Undo button
    if (Math.abs(mx - (midX - 60)) <= 35 && Math.abs(my - (dpadY + 60)) <= 15) {
      this.undo(); return;
    }
    // Reset button
    if (Math.abs(mx - (midX + 60)) <= 35 && Math.abs(my - (dpadY + 60)) <= 15) {
      this.loadLevel(this.currentLevel); return;
    }

    if (this.isWon) {
      this.loadLevel(this.currentLevel + 1);
      return;
    }

    // Touch D-Pad
    if (Math.hypot(mx - midX, my - (dpadY - 30)) <= 22) this.movePlayer(-1, 0); // Up
    if (Math.hypot(mx - midX, my - (dpadY + 30)) <= 22) this.movePlayer(1, 0);  // Down
    if (Math.hypot(mx - (midX - 30), my - dpadY) <= 22) this.movePlayer(0, -1); // Left
    if (Math.hypot(mx - (midX + 30), my - dpadY) <= 22) this.movePlayer(0, 1);  // Right
  }

  private movePlayer(dr: number, dc: number) {
    const [r, c] = this.playerPos;
    const nr = r + dr;
    const nc = c + dc;

    if (nr < 0 || nr >= this.grid.length || nc < 0 || nc >= this.grid[0].length) return;
    const targetCell = this.grid[nr][nc];
    if (targetCell === 'W') return; // Wall

    // Save history state
    this.history.push({
      grid: this.grid.map(row => [...row]),
      playerPos: [...this.playerPos]
    });

    if (targetCell === '.' || targetCell === 'T') {
      // Step into empty floor or target
      this.grid[r][c] = this.grid[r][c] === '+' ? 'T' : '.';
      this.grid[nr][nc] = targetCell === 'T' ? '+' : 'P';
      this.playerPos = [nr, nc];
      this.moves++;
    } else if (targetCell === 'B' || targetCell === '*') {
      // Push box
      const nnr = nr + dr;
      const nnc = nc + dc;
      if (nnr < 0 || nnr >= this.grid.length || nnc < 0 || nnc >= this.grid[0].length) return;
      const boxTarget = this.grid[nnr][nnc];

      if (boxTarget === '.' || boxTarget === 'T') {
        this.grid[nnr][nnc] = boxTarget === 'T' ? '*' : 'B';
        this.grid[nr][nc] = targetCell === '*' ? '+' : 'P';
        this.grid[r][c] = this.grid[r][c] === '+' ? 'T' : '.';
        this.playerPos = [nr, nc];
        this.moves++;
      } else {
        this.history.pop(); // Invalid move cancel history
      }
    }

    this.overlayManager?.updateStat('moves', this.moves);
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.moves);

    this.checkWin();
  }

  private undo() {
    if (this.history.length === 0) return;
    const last = this.history.pop()!;
    this.grid = last.grid;
    this.playerPos = last.playerPos;
    this.moves = Math.max(0, this.moves - 1);
    this.overlayManager?.updateStat('moves', this.moves);
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.moves);
  }

  private checkWin() {
    // Win if no unplaced boxes 'B' remain
    let hasUnplacedBox = false;
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        if (this.grid[r][c] === 'B') hasUnplacedBox = true;
      }
    }
    if (!hasUnplacedBox && !this.isWon) {
      this.isWon = true;
      const nextLevel = (this.currentLevel + 1) % this.levels.length;
      setTimeout(() => {
        this.overlayManager?.showResults({
          title: 'LEVEL CLEARED! 📦',
          subtitle: `Completed Level ${this.currentLevel + 1} in ${this.moves} moves!`,
          isWin: true,
          stats: [
            { label: 'Level', value: `${this.currentLevel + 1} / ${this.levels.length}` },
            { label: 'Total Moves', value: String(this.moves) }
          ],
          onRestart: () => {
            this.overlayManager?.hideResults();
            this.loadLevel(nextLevel);
            this.overlayManager?.updateStat('level', `${this.currentLevel + 1} / ${this.levels.length}`);
            this.overlayManager?.updateStat('moves', '0');
          }
        });
      }, 300);
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

    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isWon ? '#10b981' : '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(this.isWon ? 'LEVEL CLEARED!' : `Level ${this.currentLevel + 1} of ${this.levels.length}`, midX, this.startY - 15);

    // Render Grid
    for (let r = 0; r < this.grid.length; r++) {
      for (let c = 0; c < this.grid[r].length; c++) {
        const x = this.startX + c * this.cellSize;
        const y = this.startY + r * this.cellSize;
        const tile = this.grid[r][c];

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(x, y, this.cellSize, this.cellSize);

        if (tile === 'W') {
          ctx.fillStyle = '#475569';
          ctx.fillRect(x + 1, y + 1, this.cellSize - 2, this.cellSize - 2);
        } else if (tile === 'T' || tile === '+' || tile === '*') {
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath(); ctx.arc(x + this.cellSize / 2, y + this.cellSize / 2, 4, 0, Math.PI * 2); ctx.fill();
        }

        if (tile === 'B' || tile === '*') {
          ctx.fillStyle = tile === '*' ? '#10b981' : '#38bdf8';
          ctx.beginPath(); ctx.roundRect(x + 4, y + 4, this.cellSize - 8, this.cellSize - 8, 4); ctx.fill();
        } else if (tile === 'P' || tile === '+') {
          ctx.fillStyle = '#f43f5e';
          ctx.beginPath(); ctx.arc(x + this.cellSize / 2, y + this.cellSize / 2, this.cellSize * 0.35, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    // Touch D-Pad Render
    const dpadY = this.startY + this.grid.length * this.cellSize + 60;
    ctx.fillStyle = '#334155';
    // Up
    ctx.beginPath(); ctx.arc(midX, dpadY - 30, 20, 0, Math.PI * 2); ctx.fill();
    // Down
    ctx.beginPath(); ctx.arc(midX, dpadY + 30, 20, 0, Math.PI * 2); ctx.fill();
    // Left
    ctx.beginPath(); ctx.arc(midX - 30, dpadY, 20, 0, Math.PI * 2); ctx.fill();
    // Right
    ctx.beginPath(); ctx.arc(midX + 30, dpadY, 20, 0, Math.PI * 2); ctx.fill();

    ctx.font = 'bold 12px sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText('▲', midX, dpadY - 26);
    ctx.fillText('▼', midX, dpadY + 34);
    ctx.fillText('◄', midX - 30, dpadY + 4);
    ctx.fillText('►', midX + 30, dpadY + 4);

    // Undo & Reset Buttons
    ctx.fillStyle = '#475569';
    ctx.beginPath(); ctx.roundRect(midX - 95, dpadY + 50, 70, 24, 6); ctx.fill();
    ctx.fillText('UNDO', midX - 60, dpadY + 66);

    ctx.beginPath(); ctx.roundRect(midX + 25, dpadY + 50, 70, 24, 6); ctx.fill();
    ctx.fillText('RESET', midX + 60, dpadY + 66);
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('resize', this.boundResize);
    if (this.overlayManager) {
      this.overlayManager.destroy();
      this.overlayManager = null;
    }
  }
}
