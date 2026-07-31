import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';

interface Ship {
  name: string;
  size: number;
  placed: boolean;
  coords: Array<[number, number]>;
  hits: number;
}

export class BattleshipPlugin implements MiniGamePlugin {
  id = 'battleship';
  name = 'Battleship Naval Warfare';
  subtitle = 'Grid strategy & naval combat';
  description = 'Position your fleet strategically and command naval strikes to locate and destroy the enemy fleet before yours is sunk.';
  version = '1.0.0';
  genre = 'Board / Strategy';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '4–10 min';
  category = 'Board & Strategy';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <path d="M2 16h20l-3 4H5l-3-4z" />
      <path d="M6 16v-4l4-2v6" />
      <path d="M14 16v-6l4-2v8" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;

  private phase: 'placement' | 'battle' | 'gameover' = 'placement';
  private playerGrid: Array<Array<'empty' | 'ship' | 'hit' | 'miss'>> = [];
  private aiGrid: Array<Array<'empty' | 'ship' | 'hit' | 'miss'>> = [];
  private playerShips: Ship[] = [];
  private aiShips: Ship[] = [];
  private currentPlacementIndex = 0;
  private isHorizontal = true;

  private statusMessage = 'Place your fleet: Carrier (5)';
  private wins = 0;

  private cellSize = 0;
  private playerStartX = 0;
  private playerStartY = 0;
  private aiStartX = 0;
  private aiStartY = 0;

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
    if (scoreLabel) scoreLabel.textContent = 'Fleet Victories';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

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

    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    window.addEventListener('resize', this.boundResize);

    this.tick();
  }

  private createShipList(): Ship[] {
    return [
      { name: 'Carrier', size: 5, placed: false, coords: [], hits: 0 },
      { name: 'Battleship', size: 4, placed: false, coords: [], hits: 0 },
      { name: 'Cruiser', size: 3, placed: false, coords: [], hits: 0 },
      { name: 'Submarine', size: 3, placed: false, coords: [], hits: 0 },
      { name: 'Destroyer', size: 2, placed: false, coords: [], hits: 0 }
    ];
  }

  private resetGame() {
    this.phase = 'placement';
    this.playerGrid = Array(10).fill(null).map(() => Array(10).fill('empty'));
    this.aiGrid = Array(10).fill(null).map(() => Array(10).fill('empty'));
    this.playerShips = this.createShipList();
    this.aiShips = this.createShipList();
    this.currentPlacementIndex = 0;
    this.isHorizontal = true;
    this.statusMessage = `Place ${this.playerShips[0].name} (${this.playerShips[0].size})`;
    this.placeAIShips();
  }

  private placeAIShips() {
    for (const ship of this.aiShips) {
      let placed = false;
      while (!placed) {
        const horiz = Math.random() < 0.5;
        const r = Math.floor(Math.random() * 10);
        const c = Math.floor(Math.random() * 10);
        if (this.canPlaceShip(this.aiGrid, r, c, ship.size, horiz)) {
          const coords: Array<[number, number]> = [];
          for (let i = 0; i < ship.size; i++) {
            const nr = horiz ? r : r + i;
            const nc = horiz ? c + i : c;
            this.aiGrid[nr][nc] = 'ship';
            coords.push([nr, nc]);
          }
          ship.coords = coords;
          ship.placed = true;
          placed = true;
        }
      }
    }
  }

  private canPlaceShip(grid: string[][], r: number, c: number, size: number, horiz: boolean): boolean {
    for (let i = 0; i < size; i++) {
      const nr = horiz ? r : r + i;
      const nc = horiz ? c + i : c;
      if (nr < 0 || nr >= 10 || nc < 0 || nc >= 10) return false;
      if (grid[nr][nc] !== 'empty') return false;
    }
    return true;
  }

  private autoPlacePlayerShips() {
    this.playerGrid = Array(10).fill(null).map(() => Array(10).fill('empty'));
    for (const ship of this.playerShips) {
      let placed = false;
      while (!placed) {
        const horiz = Math.random() < 0.5;
        const r = Math.floor(Math.random() * 10);
        const c = Math.floor(Math.random() * 10);
        if (this.canPlaceShip(this.playerGrid, r, c, ship.size, horiz)) {
          const coords: Array<[number, number]> = [];
          for (let i = 0; i < ship.size; i++) {
            const nr = horiz ? r : r + i;
            const nc = horiz ? c + i : c;
            this.playerGrid[nr][nc] = 'ship';
            coords.push([nr, nc]);
          }
          ship.coords = coords;
          ship.placed = true;
          placed = true;
        }
      }
    }
    this.phase = 'battle';
    this.statusMessage = 'Fleet Ready! Fire at the enemy grid.';
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

    const isStacked = width < 500;
    if (isStacked) {
      this.cellSize = Math.min((width - 40) / 10, (height - 180) / 20, 22);
      this.playerStartX = (width - 10 * this.cellSize) / 2;
      this.playerStartY = 50;
      this.aiStartX = this.playerStartX;
      this.aiStartY = this.playerStartY + 10 * this.cellSize + 35;
    } else {
      this.cellSize = Math.min((width - 60) / 20, (height - 140) / 10, 28);
      this.playerStartX = (width - 20 * this.cellSize - 20) / 2;
      this.playerStartY = 60;
      this.aiStartX = this.playerStartX + 10 * this.cellSize + 20;
      this.aiStartY = this.playerStartY;
    }
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

    if (this.phase === 'placement') {
      // Auto place button
      const midX = this.canvas.width / 2;
      if (Math.abs(mx - (midX - 60)) <= 45 && Math.abs(my - (this.playerStartY + 10 * this.cellSize + 25)) <= 15) {
        this.autoPlacePlayerShips();
        return;
      }
      // Rotate button
      if (Math.abs(mx - (midX + 60)) <= 45 && Math.abs(my - (this.playerStartY + 10 * this.cellSize + 25)) <= 15) {
        this.isHorizontal = !this.isHorizontal;
        return;
      }

      // Grid placement
      const col = Math.floor((mx - this.playerStartX) / this.cellSize);
      const row = Math.floor((my - this.playerStartY) / this.cellSize);
      if (col >= 0 && col < 10 && row >= 0 && row < 10) {
        const currentShip = this.playerShips[this.currentPlacementIndex];
        if (this.canPlaceShip(this.playerGrid, row, col, currentShip.size, this.isHorizontal)) {
          const coords: Array<[number, number]> = [];
          for (let i = 0; i < currentShip.size; i++) {
            const nr = this.isHorizontal ? row : row + i;
            const nc = this.isHorizontal ? col + i : col;
            this.playerGrid[nr][nc] = 'ship';
            coords.push([nr, nc]);
          }
          currentShip.coords = coords;
          currentShip.placed = true;
          this.currentPlacementIndex++;
          if (this.currentPlacementIndex >= this.playerShips.length) {
            this.phase = 'battle';
            this.statusMessage = 'All ships deployed! Select target on enemy grid.';
          } else {
            const nextShip = this.playerShips[this.currentPlacementIndex];
            this.statusMessage = `Place ${nextShip.name} (${nextShip.size})`;
          }
        }
      }
    } else if (this.phase === 'battle') {
      const col = Math.floor((mx - this.aiStartX) / this.cellSize);
      const row = Math.floor((my - this.aiStartY) / this.cellSize);
      if (col >= 0 && col < 10 && row >= 0 && row < 10) {
        if (this.aiGrid[row][col] === 'empty' || this.aiGrid[row][col] === 'ship') {
          const hit = this.aiGrid[row][col] === 'ship';
          this.aiGrid[row][col] = hit ? 'hit' : 'miss';
          if (hit) {
            this.statusMessage = 'DIRECT HIT on enemy vessel!';
            this.checkShipSunk(this.aiShips, row, col);
          } else {
            this.statusMessage = 'SPLASH! Missed target.';
          }

          if (this.checkAllSunk(this.aiShips)) {
            this.phase = 'gameover';
            this.wins++;
            this.statusMessage = 'VICTORY! All enemy ships destroyed.';
            const scoreVal = document.getElementById('bb-score-val');
            if (scoreVal) scoreVal.textContent = String(this.wins);
            return;
          }

          // AI Turn
          setTimeout(() => this.makeAITurn(), 300);
        }
      }
    } else if (this.phase === 'gameover') {
      this.resetGame();
    }
  }

  private checkShipSunk(ships: Ship[], r: number, c: number) {
    for (const ship of ships) {
      if (ship.coords.some(([sr, sc]) => sr === r && sc === c)) {
        ship.hits++;
        if (ship.hits >= ship.size) {
          this.statusMessage = `SUNK! Enemy ${ship.name} destroyed!`;
        }
      }
    }
  }

  private checkAllSunk(ships: Ship[]): boolean {
    return ships.every(s => s.hits >= s.size);
  }

  private makeAITurn() {
    if (this.phase !== 'battle') return;
    let r = 0, c = 0, valid = false;
    while (!valid) {
      r = Math.floor(Math.random() * 10);
      c = Math.floor(Math.random() * 10);
      if (this.playerGrid[r][c] === 'empty' || this.playerGrid[r][c] === 'ship') valid = true;
    }

    const hit = this.playerGrid[r][c] === 'ship';
    this.playerGrid[r][c] = hit ? 'hit' : 'miss';
    if (hit) {
      this.checkShipSunk(this.playerShips, r, c);
      if (this.checkAllSunk(this.playerShips)) {
        this.phase = 'gameover';
        this.statusMessage = 'DEFEAT! Your fleet has been destroyed.';
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

    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillStyle = '#f59e0b';
    ctx.textAlign = 'center';
    ctx.fillText(this.statusMessage, canvas.width / 2, 30);

    // Render Player Grid
    this.renderGrid(this.playerStartX, this.playerStartY, 'YOUR FLEET', this.playerGrid, true);

    // Render AI Grid
    this.renderGrid(this.aiStartX, this.aiStartY, 'TARGET RADAR', this.aiGrid, false);

    // Placement Controls
    if (this.phase === 'placement') {
      const midX = canvas.width / 2;
      const btnY = this.playerStartY + 10 * this.cellSize + 25;
      ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.roundRect(midX - 105, btnY - 12, 90, 24, 6); ctx.fill();
      ctx.font = 'bold 10px sans-serif'; ctx.fillStyle = '#fff'; ctx.fillText('AUTO PLACE', midX - 60, btnY + 3);

      ctx.fillStyle = '#10b981'; ctx.beginPath(); ctx.roundRect(midX + 15, btnY - 12, 90, 24, 6); ctx.fill();
      ctx.fillText(this.isHorizontal ? 'DIR: HORIZ' : 'DIR: VERT', midX + 60, btnY + 3);
    }
  }

  private renderGrid(startX: number, startY: number, title: string, grid: string[][], showShips: boolean) {
    const ctx = this.ctx!;
    ctx.font = 'bold 11px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'left';
    ctx.fillText(title, startX, startY - 8);

    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const x = startX + c * this.cellSize;
        const y = startY + r * this.cellSize;
        const cell = grid[r][c];

        ctx.fillStyle = '#1e293b';
        if (showShips && cell === 'ship') ctx.fillStyle = '#475569';
        if (cell === 'hit') ctx.fillStyle = '#ef4444';
        if (cell === 'miss') ctx.fillStyle = '#38bdf8';

        ctx.fillRect(x, y, this.cellSize - 1, this.cellSize - 1);
        ctx.strokeRect(x, y, this.cellSize - 1, this.cellSize - 1);

        if (cell === 'hit') {
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(x + this.cellSize/2, y + this.cellSize/2, this.cellSize*0.25, 0, Math.PI*2); ctx.fill();
        } else if (cell === 'miss') {
          ctx.fillStyle = '#0f172a';
          ctx.beginPath(); ctx.arc(x + this.cellSize/2, y + this.cellSize/2, this.cellSize*0.15, 0, Math.PI*2); ctx.fill();
        }
      }
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
  }
}
