import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { resetGameCanvas } from '../../game.js';

interface Card {
  suit: '♠' | '♥' | '♦' | '♣';
  value: number; // 1-13
  color: 'red' | 'black';
}

export class FreeCellPlugin implements MiniGamePlugin {
  id = 'freecell';
  name = 'FreeCell Solitaire';
  subtitle = 'Strategic open card solitaire';
  description = 'Clear all 52 cards into four foundations using four free buffer cells and smart sequence building.';
  version = '1.0.0';
  genre = 'Cards';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '5–10 min';
  category = 'Cards';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 8h2v2H7zM15 8h2v2h-2z" />
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private overlayManager: GameOverlayManager | null = null;

  private freeCells: (Card | null)[] = [null, null, null, null];
  private foundations: Card[][] = [[], [], [], []]; // ♠, ♥, ♦, ♣
  private tableau: Card[][] = []; // 8 cascades

  private selectedCard: { type: 'free' | 'tab'; idx: number; cardIdx?: number } | null = null;
  private moves = 0;
  private isWon = false;
  private statusMessage = 'Tap card to select, then tap destination';

  private cardW = 0;
  private cardH = 0;
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
    if (scoreLabel) scoreLabel.textContent = 'Moves';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onRestart: () => this.resetGame()
    });

    this.overlayManager.showInstructions({
      title: 'FREECELL SOLITAIRE',
      subtitle: 'Open Card Solitaire Puzzle',
      description: 'Clear all 52 cards into four foundations using four free buffer cells and smart sequence building.',
      objective: 'Move all cards into the 4 foundation piles from Ace to King.',
      controls: [
        { key: 'Tap Card', action: 'Select card/cascade' },
        { key: 'Tap Destination', action: 'Move card to free cell, foundation, or cascade' }
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { id: 'moves', label: 'Moves', value: '0' }
        ]);
        this.startGame();
      }
    });
  }

  private startGame() {
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

  private resetGame() {
    this.freeCells = [null, null, null, null];
    this.foundations = [[], [], [], []];
    this.moves = 0;
    this.isWon = false;
    this.selectedCard = null;
    this.statusMessage = 'Select card to move';
    this.overlayManager?.updateStat('moves', 0);

    // Deck
    const suits: ('♠' | '♥' | '♦' | '♣')[] = ['♠', '♥', '♦', '♣'];
    let deck: Card[] = [];
    for (const suit of suits) {
      const color = (suit === '♥' || suit === '♦') ? 'red' : 'black';
      for (let v = 1; v <= 13; v++) {
        deck.push({ suit, value: v, color });
      }
    }
    deck.sort(() => Math.random() - 0.5);

    // Deal into 8 cascades
    this.tableau = Array(8).fill(null).map(() => []);
    for (let i = 0; i < deck.length; i++) {
      this.tableau[i % 8].push(deck[i]);
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

    this.cardW = Math.min((width - 40) / 8.5, 38);
    this.cardH = this.cardW * 1.4;
    this.startX = (width - 8 * (this.cardW + 4)) / 2;
    this.startY = 40;
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

    if (this.isWon) {
      this.resetGame(); return;
    }

    // Check FreeCells (top left 4)
    for (let i = 0; i < 4; i++) {
      const fx = this.startX + i * (this.cardW + 4);
      if (mx >= fx && mx <= fx + this.cardW && my >= this.startY && my <= this.startY + this.cardH) {
        if (this.selectedCard === null) {
          if (this.freeCells[i]) this.selectedCard = { type: 'free', idx: i };
        } else {
          this.tryMoveToFreeCell(i);
        }
        return;
      }
    }

    // Check Foundations (top right 4)
    for (let i = 0; i < 4; i++) {
      const fx = this.startX + (i + 4) * (this.cardW + 4);
      if (mx >= fx && mx <= fx + this.cardW && my >= this.startY && my <= this.startY + this.cardH) {
        if (this.selectedCard) {
          this.tryMoveToFoundation(i);
        }
        return;
      }
    }

    // Check Tableau
    const tabY = this.startY + this.cardH + 20;
    for (let col = 0; col < 8; col++) {
      const tx = this.startX + col * (this.cardW + 4);
      const stack = this.tableau[col];
      const stackH = Math.max(this.cardH, stack.length * 16 + this.cardH);

      if (mx >= tx && mx <= tx + this.cardW && my >= tabY && my <= tabY + stackH) {
        if (this.selectedCard === null) {
          if (stack.length > 0) {
            this.selectedCard = { type: 'tab', idx: col, cardIdx: stack.length - 1 };
          }
        } else {
          this.tryMoveToTableau(col);
        }
        return;
      }
    }
  }

  private tryMoveToFreeCell(cellIdx: number) {
    if (!this.selectedCard) return;
    if (this.freeCells[cellIdx] !== null) { this.selectedCard = null; return; }

    let cardToMove: Card | null = null;
    if (this.selectedCard.type === 'tab') {
      const stack = this.tableau[this.selectedCard.idx];
      cardToMove = stack.pop() || null;
    } else if (this.selectedCard.type === 'free') {
      cardToMove = this.freeCells[this.selectedCard.idx];
      this.freeCells[this.selectedCard.idx] = null;
    }

    if (cardToMove) {
      this.freeCells[cellIdx] = cardToMove;
      this.moves++;
      const scoreVal = document.getElementById('bb-score-val');
      if (scoreVal) scoreVal.textContent = String(this.moves);
    }
    this.selectedCard = null;
  }

  private tryMoveToFoundation(fIdx: number) {
    if (!this.selectedCard) return;
    let cardToMove: Card | null = null;

    if (this.selectedCard.type === 'tab') {
      const stack = this.tableau[this.selectedCard.idx];
      cardToMove = stack[stack.length - 1];
    } else if (this.selectedCard.type === 'free') {
      cardToMove = this.freeCells[this.selectedCard.idx];
    }

    if (!cardToMove) return;

    const foundation = this.foundations[fIdx];
    const topCard = foundation.length > 0 ? foundation[foundation.length - 1] : null;

    if ((topCard === null && cardToMove.value === 1) || (topCard && topCard.suit === cardToMove.suit && cardToMove.value === topCard.value + 1)) {
      foundation.push(cardToMove);
      if (this.selectedCard.type === 'tab') this.tableau[this.selectedCard.idx].pop();
      if (this.selectedCard.type === 'free') this.freeCells[this.selectedCard.idx] = null;
      this.moves++;
      this.overlayManager?.updateStat('moves', this.moves);
      this.checkWin();
    }
    this.selectedCard = null;
  }

  private tryMoveToTableau(targetCol: number) {
    if (!this.selectedCard) return;
    let cardToMove: Card | null = null;

    if (this.selectedCard.type === 'tab') {
      if (this.selectedCard.idx === targetCol) { this.selectedCard = null; return; }
      const stack = this.tableau[this.selectedCard.idx];
      cardToMove = stack[stack.length - 1];
    } else if (this.selectedCard.type === 'free') {
      cardToMove = this.freeCells[this.selectedCard.idx];
    }

    if (!cardToMove) return;

    const targetStack = this.tableau[targetCol];
    const targetTop = targetStack.length > 0 ? targetStack[targetStack.length - 1] : null;

    if (targetTop === null || (targetTop.color !== cardToMove.color && targetTop.value === cardToMove.value + 1)) {
      targetStack.push(cardToMove);
      if (this.selectedCard.type === 'tab') this.tableau[this.selectedCard.idx].pop();
      if (this.selectedCard.type === 'free') this.freeCells[this.selectedCard.idx] = null;
      this.moves++;
      this.overlayManager?.updateStat('moves', this.moves);
    }
    this.selectedCard = null;
  }

  private checkWin() {
    const totalFoundations = this.foundations.reduce((sum, f) => sum + f.length, 0);
    if (totalFoundations === 52 && !this.isWon) {
      this.isWon = true;
      this.statusMessage = 'ALL CARDS CLEARED!';
      setTimeout(() => {
        this.overlayManager?.showResults({
          title: 'FREECELL VICTORY! 🃏',
          subtitle: `Cleared all 52 cards in ${this.moves} moves!`,
          isWin: true,
          stats: [
            { label: 'Total Moves', value: String(this.moves) }
          ],
          onRestart: () => {
            this.overlayManager?.hideResults();
            this.resetGame();
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
    ctx.fillText(this.statusMessage, midX, this.startY - 15);

    // FreeCells (0-3)
    for (let i = 0; i < 4; i++) {
      const fx = this.startX + i * (this.cardW + 4);
      this.drawCardSlot(fx, this.startY, this.freeCells[i], this.selectedCard?.type === 'free' && this.selectedCard.idx === i);
    }

    // Foundations (4-7)
    for (let i = 0; i < 4; i++) {
      const fx = this.startX + (i + 4) * (this.cardW + 4);
      const topCard = this.foundations[i].length > 0 ? this.foundations[i][this.foundations[i].length - 1] : null;
      this.drawCardSlot(fx, this.startY, topCard, false);
    }

    // Tableau Cascades
    const tabY = this.startY + this.cardH + 20;
    for (let col = 0; col < 8; col++) {
      const tx = this.startX + col * (this.cardW + 4);
      const stack = this.tableau[col];

      ctx.strokeStyle = '#334155'; ctx.strokeRect(tx, tabY, this.cardW, this.cardH);

      for (let j = 0; j < stack.length; j++) {
        const cy = tabY + j * 16;
        const isSel = this.selectedCard?.type === 'tab' && this.selectedCard.idx === col && j === stack.length - 1;
        this.drawCard(tx, cy, stack[j], isSel);
      }
    }
  }

  private drawCardSlot(x: number, y: number, card: Card | null, isSelected: boolean) {
    const ctx = this.ctx!;
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#334155'; ctx.lineWidth = isSelected ? 2 : 1;
    ctx.strokeRect(x, y, this.cardW, this.cardH);
    if (card) this.drawCard(x, y, card, isSelected);
  }

  private drawCard(x: number, y: number, card: Card, isSelected: boolean) {
    const ctx = this.ctx!;
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath(); ctx.roundRect(x, y, this.cardW, this.cardH, 4); ctx.fill();
    ctx.strokeStyle = isSelected ? '#38bdf8' : '#cbd5e1'; ctx.lineWidth = isSelected ? 2 : 1; ctx.stroke();

    ctx.font = 'bold 10px sans-serif';
    ctx.fillStyle = card.color === 'red' ? '#ef4444' : '#0f172a';
    const valStr = card.value === 1 ? 'A' : card.value === 11 ? 'J' : card.value === 12 ? 'Q' : card.value === 13 ? 'K' : String(card.value);
    ctx.fillText(`${valStr}${card.suit}`, x + 4, y + 12);
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
