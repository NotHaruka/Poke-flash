import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { GameAudioEngine } from '../core/GameAudioEngine';

interface SudokuCell {
  val: number; // 0 = empty, 1-9 = set
  given: boolean; // pre-populated clue
  notes: Set<number>;
  error: boolean;
}

export class SudokuPlugin implements MiniGamePlugin {
  id = 'sudoku';
  name = 'Mind Sudoku';
  subtitle = 'Logical deduction & grid reasoning';
  description = 'Sharpen focus and numeric logic with classical 9x9 Sudoku. Features intelligent clue generation, real-time conflict validation, pencil note mode, and difficulty scaling.';
  version = '1.0.0';
  genre = 'Puzzle';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '5–10 min';
  category = 'Puzzle';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private isPaused = false;
  private overlayManager: GameOverlayManager | null = null;
  private context: GameLaunchContext | null = null;

  private grid: SudokuCell[][] = [];
  private selectedCell: { r: number; c: number } | null = null;
  private difficulty: 'easy' | 'medium' | 'hard' = 'medium';
  private pencilMode = false;

  private timerSeconds = 0;
  private timerInterval: any = null;
  private errorsCount = 0;
  private statusMessage = "Fill grid with numbers 1-9";
  private isSolved = false;

  // Layout metrics
  private boardSize = 0;
  private cellSize = 0;
  private startX = 0;
  private startY = 0;

  // Listeners
  private boundMouseDown: any;
  private boundTouchStart: any;
  private boundKeyDown: any;
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
    if (scoreLabel) scoreLabel.textContent = 'Time:';
    if (scoreVal) scoreVal.textContent = '00:00';
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

    this.startNewGame();
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

    this.showHelpOverlay();

    this.tick();
  }

  private showHelpOverlay() {
    this.isPaused = true;
    this.overlayManager?.showInstructions({
      title: 'MIND SUDOKU',
      subtitle: 'Classical Numeric Deduction',
      description: 'Train your working memory and deductive logic. Fill the empty cells such that every row, column, and 3x3 block contains digits 1 to 9 exactly once.',
      objective: 'Solve the grid by resolving numeric conflicts with high speed and zero errors.',
      controls: [
        { key: 'Mouse Click', action: 'Select a logical cell / Click keypad' },
        { key: 'Keys 1-9', action: 'Input values on selected cell' },
        { key: 'Backspace / Delete', action: 'Erase current cell value' },
        { key: 'Pencil Mode', action: 'Toggle draft notes for candidate numbers' },
        { key: 'P / Esc', action: 'Pause or resume session' }
      ],
      rules: [
        'Numbers cannot repeat in any Row, Column, or 3x3 Block.',
        'Pre-populated white cells are static clues and cannot be modified.',
        'Use Pencil Mode to place drafts inside grid spaces.'
      ],
      options: {
        difficulties: ['easy', 'medium', 'hard'],
        currentDifficulty: this.difficulty,
        onSelectDifficulty: (diff) => {
          this.difficulty = diff as any;
          if (this.context) this.context.settings.difficulty = diff as any;
          this.restartGame();
          GameAudioEngine.getInstance().playSFX('select');
        }
      },
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { label: 'Conflicts', value: this.errorsCount, id: 'errorsCount' },
          { label: 'Time', value: '00:00', id: 'timer' }
        ]);
        this.isPaused = false;
        this.restartGame();
        GameAudioEngine.getInstance().playSFX('click');
      }
    });
  }

  private restartGame() {
    this.overlayManager?.hideResults();
    this.overlayManager?.resume();
    this.isPaused = false;
    this.startNewGame();
    this.overlayManager?.updateStat('errorsCount', this.errorsCount);
    this.overlayManager?.updateStat('timer', '00:00');
  }

  private startNewGame() {
    this.timerSeconds = 0;
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.isSolved && this.isRunning && !this.isPaused) {
        this.timerSeconds++;
        const m = String(Math.floor(this.timerSeconds / 60)).padStart(2, '0');
        const s = String(this.timerSeconds % 60).padStart(2, '0');
        const scoreVal = document.getElementById('bb-score-val');
        if (scoreVal) scoreVal.textContent = `${m}:${s}`;
        this.overlayManager?.updateStat('timer', `${m}:${s}`);
      }
    }, 1000);

    this.errorsCount = 0;
    this.isSolved = false;
    this.selectedCell = null;
    this.pencilMode = false;
    this.statusMessage = "Select a cell and tap a number";

    this.generateSudokuPuzzle();
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

    const maxW = width * 0.9;
    const maxH = height * 0.58;
    this.boardSize = Math.min(maxW, maxH, 380);
    this.boardSize = Math.max(this.boardSize, 240);

    this.startX = (width - this.boardSize) / 2;
    this.startY = (height - this.boardSize) / 2 - 45;
    this.cellSize = this.boardSize / 9;
  }



  private generateSudokuPuzzle() {
    // Standard valid initial board
    const solution = [
      [5,3,4,6,7,8,9,1,2],
      [6,7,2,1,9,5,3,4,8],
      [1,9,8,3,4,2,5,6,7],
      [8,5,9,7,6,1,4,2,3],
      [4,2,6,8,5,3,7,9,1],
      [7,1,3,9,2,4,8,5,6],
      [9,6,1,5,3,7,2,8,4],
      [2,8,7,4,1,9,6,3,5],
      [3,4,5,2,8,6,1,7,9]
    ];

    // Randomize digits mapping
    const map = [1,2,3,4,5,6,7,8,9];
    for (let i = map.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [map[i], map[j]] = [map[j], map[i]];
    }

    const solvedGrid = solution.map(row => row.map(v => map[v - 1]));

    // Clues based on difficulty
    const cluesCount = this.difficulty === 'easy' ? 42 : (this.difficulty === 'medium' ? 32 : 24);

    this.grid = Array(9).fill(null).map(() => Array(9).fill(null));

    let placed = 0;
    while (placed < cluesCount) {
      const r = Math.floor(Math.random() * 9);
      const c = Math.floor(Math.random() * 9);
      if (!this.grid[r][c]) {
        this.grid[r][c] = {
          val: solvedGrid[r][c],
          given: true,
          notes: new Set(),
          error: false
        };
        placed++;
      }
    }

    // Fill remaining cells empty
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (!this.grid[r][c]) {
          this.grid[r][c] = {
            val: 0,
            given: false,
            notes: new Set(),
            error: false
          };
        }
      }
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (!this.isSolved && this.overlayManager) {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
          this.overlayManager.pause();
        } else {
          this.overlayManager.resume();
        }
      }
      return;
    }

    if (this.isSolved || !this.selectedCell || this.isPaused) return;
    const num = parseInt(e.key);
    if (!isNaN(num) && num >= 1 && num <= 9) {
      this.inputNumber(num);
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      this.inputNumber(0);
    }
  }

  private handleTouchStart(e: TouchEvent) {
    if (!this.canvas || e.touches.length === 0 || this.isPaused) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = this.canvas.getBoundingClientRect();
    const mx = touch.clientX - rect.left;
    const my = touch.clientY - rect.top;
    this.processInputAt(mx, my);
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.canvas || this.isPaused) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    this.processInputAt(mx, my);
  }

  private processInputAt(mx: number, my: number) {
    if (!this.canvas || this.isPaused) return;

    const midX = this.canvas.width / 2;
    const numPadY = this.startY + this.boardSize + 32;

    // Check Number Pad buttons click (1-9, Erase, Pencil, New Game)
    const btnW = Math.min(this.canvas.width * 0.088, 36);
    const gap = 6;
    const startNumX = midX - ((9 * btnW + 8 * gap) / 2);

    for (let i = 1; i <= 9; i++) {
      const bx = startNumX + (i - 1) * (btnW + gap) + btnW / 2;
      if (Math.abs(mx - bx) <= btnW / 2 && Math.abs(my - numPadY) <= 18) {
        this.inputNumber(i);
        this.playSFX('click');
        return;
      }
    }

    // Action Row below NumPad (Pencil Mode, Erase, New Game)
    const actionY = numPadY + 42;
    if (Math.abs(mx - (midX - 90)) <= 35 && Math.abs(my - actionY) <= 14) {
      this.pencilMode = !this.pencilMode;
      this.playSFX('click');
      return;
    }
    if (Math.abs(mx - (midX - 10)) <= 30 && Math.abs(my - actionY) <= 14) {
      this.inputNumber(0); // Erase
      this.playSFX('click');
      return;
    }
    if (Math.abs(mx - (midX + 70)) <= 38 && Math.abs(my - actionY) <= 14) {
      this.restartGame();
      this.playSFX('click');
      return;
    }

    if (this.isSolved) return;

    // Grid Cell Selection
    const col = Math.floor((mx - this.startX) / this.cellSize);
    const row = Math.floor((my - this.startY) / this.cellSize);

    if (col >= 0 && col < 9 && row >= 0 && row < 9) {
      this.selectedCell = { r: row, c: col };
      this.playSFX('select');
    }
  }

  private inputNumber(num: number) {
    if (!this.selectedCell || this.isSolved || this.isPaused) return;

    const { r, c } = this.selectedCell;
    const cell = this.grid[r][c];

    if (cell.given) return; // Cannot edit pre-given clue

    if (this.pencilMode && num > 0) {
      if (cell.notes.has(num)) cell.notes.delete(num);
      else cell.notes.add(num);
      cell.val = 0;
    } else {
      cell.val = num;
      cell.notes.clear();
      this.validateGrid();
      this.checkCompletion();
    }

    this.playSFX('input');
  }

  private validateGrid() {
    // Reset errors
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        this.grid[r][c].error = false;
      }
    }

    let errorFound = false;

    // Check rows & cols & 3x3 blocks for duplicates
    for (let i = 0; i < 9; i++) {
      const rowSeen = new Map<number, { r: number; c: number }[]>();
      const colSeen = new Map<number, { r: number; c: number }[]>();
      const boxSeen = new Map<number, { r: number; c: number }[]>();

      for (let j = 0; j < 9; j++) {
        // Row
        const rVal = this.grid[i][j].val;
        if (rVal > 0) {
          if (!rowSeen.has(rVal)) rowSeen.set(rVal, []);
          rowSeen.get(rVal)!.push({ r: i, c: j });
        }

        // Col
        const cVal = this.grid[j][i].val;
        if (cVal > 0) {
          if (!colSeen.has(cVal)) colSeen.set(cVal, []);
          colSeen.get(cVal)!.push({ r: j, c: i });
        }

        // 3x3 Box
        const br = Math.floor(i / 3) * 3 + Math.floor(j / 3);
        const bc = (i % 3) * 3 + (j % 3);
        const bVal = this.grid[br][bc].val;
        if (bVal > 0) {
          if (!boxSeen.has(bVal)) boxSeen.set(bVal, []);
          boxSeen.get(bVal)!.push({ r: br, c: bc });
        }
      }

      for (const [, coords] of rowSeen) {
        if (coords.length > 1) {
          coords.forEach(p => this.grid[p.r][p.c].error = true);
          errorFound = true;
        }
      }
      for (const [, coords] of colSeen) {
        if (coords.length > 1) {
          coords.forEach(p => this.grid[p.r][p.c].error = true);
          errorFound = true;
        }
      }
      for (const [, coords] of boxSeen) {
        if (coords.length > 1) {
          coords.forEach(p => this.grid[p.r][p.c].error = true);
          errorFound = true;
        }
      }
    }

    if (errorFound) {
      this.errorsCount++;
      this.overlayManager?.updateStat('errorsCount', this.errorsCount);
      this.statusMessage = "Conflicts detected!";
    } else {
      this.statusMessage = "Looking good!";
    }
  }

  private checkCompletion() {
    // Check if grid is fully filled without errors
    let isFull = true;
    let hasError = false;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (this.grid[r][c].val === 0) isFull = false;
        if (this.grid[r][c].error) hasError = true;
      }
    }

    if (isFull && !hasError) {
      this.isSolved = true;
      this.statusMessage = "PUZZLE SOLVED! EXCELLENT WORK!";
      this.playSFX('win');

      const minutes = String(Math.floor(this.timerSeconds / 60)).padStart(2, '0');
      const seconds = String(this.timerSeconds % 60).padStart(2, '0');

      this.overlayManager?.showResults({
        title: 'VICTORY',
        subtitle: 'Sudoku logic grid completed!',
        isWin: true,
        score: this.timerSeconds,
        stats: [
          { label: 'Time Elapsed', value: `${minutes}:${seconds}` },
          { label: 'Total Conflicts', value: this.errorsCount },
          { label: 'Difficulty', value: this.difficulty.toUpperCase() }
        ],
        onRestart: () => {
          this.restartGame();
        },
        onExit: () => {
          if (this.context?.onExit) this.context.onExit();
        }
      });
    }
  }

  private playSFX(type: 'select' | 'input' | 'win' | 'click') {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'select') {
        osc.frequency.setValueAtTime(480, now);
        gain.gain.setValueAtTime(0.02, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'input') {
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.exponentialRampToValueAtTime(550, now + 0.06);
        gain.gain.setValueAtTime(0.04, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        osc.start(now);
        osc.stop(now + 0.06);
      } else if (type === 'click') {
        osc.frequency.setValueAtTime(440, now);
        gain.gain.setValueAtTime(0.03, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.start(now);
        osc.stop(now + 0.04);
      } else if (type === 'win') {
        const freqs = [392, 523.25, 659.25, 783.99];
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
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isSolved ? '#10b981' : '#cda250';
    ctx.fillText(this.statusMessage, midX, this.startY - 14);

    // Render Grid Background
    ctx.fillStyle = '#1e1b2e';
    ctx.fillRect(this.startX, this.startY, this.boardSize, this.boardSize);

    // Row / Col / Box Selection Highlights
    if (this.selectedCell) {
      const { r, c } = this.selectedCell;
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';

      // Row & Col highlight
      ctx.fillRect(this.startX, this.startY + r * this.cellSize, this.boardSize, this.cellSize);
      ctx.fillRect(this.startX + c * this.cellSize, this.startY, this.cellSize, this.boardSize);

      // Selected Cell highlight
      ctx.fillStyle = 'rgba(56, 189, 248, 0.4)';
      ctx.fillRect(this.startX + c * this.cellSize, this.startY + r * this.cellSize, this.cellSize, this.cellSize);
    }

    // Render Cell Digits and Notes
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const x = this.startX + c * this.cellSize;
        const y = this.startY + r * this.cellSize;
        const cell = this.grid[r][c];

        if (cell.error) {
          ctx.fillStyle = 'rgba(239, 68, 68, 0.35)';
          ctx.fillRect(x, y, this.cellSize, this.cellSize);
        }

        if (cell.val > 0) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = cell.given ? `bold ${this.cellSize * 0.55}px "Space Grotesk", sans-serif` : `${this.cellSize * 0.55}px "Space Grotesk", sans-serif`;
          ctx.fillStyle = cell.given ? '#ffffff' : (cell.error ? '#ef4444' : '#38bdf8');
          ctx.fillText(String(cell.val), x + this.cellSize / 2, y + this.cellSize / 2 + 1);
        } else if (cell.notes.size > 0) {
          // Render 3x3 mini notes
          ctx.font = `${this.cellSize * 0.25}px sans-serif`;
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          cell.notes.forEach(n => {
            const nr = Math.floor((n - 1) / 3);
            const nc = (n - 1) % 3;
            const nx = x + (nc + 0.5) * (this.cellSize / 3);
            const ny = y + (nr + 0.5) * (this.cellSize / 3);
            ctx.fillText(String(n), nx, ny);
          });
        }
      }
    }

    // Grid Line Strokes (Thick 3x3 block borders)
    for (let i = 0; i <= 9; i++) {
      ctx.strokeStyle = i % 3 === 0 ? '#64748b' : '#334155';
      ctx.lineWidth = i % 3 === 0 ? 2.5 : 1;

      // Vertical line
      const lx = this.startX + i * this.cellSize;
      ctx.beginPath();
      ctx.moveTo(lx, this.startY);
      ctx.lineTo(lx, this.startY + this.boardSize);
      ctx.stroke();

      // Horizontal line
      const ly = this.startY + i * this.cellSize;
      ctx.beginPath();
      ctx.moveTo(this.startX, ly);
      ctx.lineTo(this.startX + this.boardSize, ly);
      ctx.stroke();
    }

    // On-screen Number Pad (1-9)
    const numPadY = this.startY + this.boardSize + 32;
    const btnW = Math.min(canvas.width * 0.088, 36);
    const gap = 6;
    const startNumX = midX - ((9 * btnW + 8 * gap) / 2);

    for (let i = 1; i <= 9; i++) {
      const bx = startNumX + (i - 1) * (btnW + gap) + btnW / 2;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(bx - btnW / 2, numPadY - 18, btnW, 36, 6);
      ctx.fill();
      ctx.stroke();

      ctx.font = 'bold 15px "Space Grotesk", sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i), bx, numPadY);
    }

    // Action buttons row (Pencil Mode, Erase, New Game)
    const actionY = numPadY + 42;

    this.drawButton(midX - 90, actionY, 70, 26, this.pencilMode ? '✏ NOTES [ON]' : '✏ NOTES', this.pencilMode);
    this.drawButton(midX - 10, actionY, 60, 26, '⌫ ERASE', false);
    this.drawButton(midX + 70, actionY, 76, 26, 'NEW PUZZLE', false);
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

    ctx.font = 'bold 9.5px "Space Grotesk", sans-serif';
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
    window.removeEventListener('keydown', this.boundKeyDown);
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
