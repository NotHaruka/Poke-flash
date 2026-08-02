import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { resetGameCanvas } from '../../game.js';
import { GameJuice } from '../core/GameJuice';
import { GameAudioEngine } from '../core/GameAudioEngine';

type Suit = 'H' | 'D' | 'C' | 'S'; // Hearts, Diamonds, Clubs, Spades

interface Card {
  id: string;
  suit: Suit;
  rank: number; // 1 (Ace) to 13 (King)
  faceUp: boolean;
}

export class SolitairePlugin implements MiniGamePlugin {
  id = 'solitaire';
  name = 'Klondike Solitaire';
  subtitle = 'Patience, sequencing & card mastery';
  description = 'Experience classical Klondike Solitaire with smooth tap-to-move controls, double-tap auto-foundation transfer, card animations, and auto-complete once tableau cards are cleared.';
  version = '1.0.0';
  genre = 'Cards';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'any';
  estimatedSessionLength = '4–8 min';
  category = 'Cards';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <rect x="5" y="3" width="14" height="18" rx="2"/>
      <path d="M12 7l1.5 2.5L16 10l-2 2 .5 3L12 13.5 9.5 15l.5-3-2-2 2.5-.5z" fill="currentColor"/>
    </svg>
  `;

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private overlayManager: GameOverlayManager | null = null;
  private context: GameLaunchContext | null = null;

  private juice = new GameJuice();
  private countdownActive = false;

  private stock: Card[] = [];
  private waste: Card[] = [];
  private foundations: Card[][] = [[], [], [], []]; // 0: H, 1: D, 2: C, 3: S
  private tableau: Card[][] = [[], [], [], [], [], [], []]; // 7 columns

  private selectedCard: { type: 'waste' | 'tableau'; col?: number; index?: number } | null = null;

  private movesCount = 0;
  private timerSeconds = 0;
  private timerInterval: any = null;
  private statusMessage = "Tap stock to deal cards";
  private isWon = false;

  // Layout metrics
  private cardWidth = 0;
  private cardHeight = 0;
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
    if (scoreLabel) scoreLabel.textContent = 'Moves:';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

    resetGameCanvas();
    this.canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext('2d');
    if (!this.ctx) return;

    this.overlayManager = new GameOverlayManager('game-canvas-container', {
      onRestart: () => this.startNewGame(),
      onExit: () => {
        if (this.context?.onExit) this.context.onExit();
      }
    });

    this.overlayManager.showInstructions({
      title: 'KLONDIKE SOLITAIRE',
      subtitle: 'Classic Card Puzzle',
      description: 'Build foundations from Ace to King by suit while sorting alternating-color card cascades in the tableau.',
      objective: 'Clear all cards to the four top-right foundation piles.',
      controls: [
        { key: 'Tap Stock', action: 'Draw card to waste pile' },
        { key: 'Tap Card', action: 'Select or auto-move card' }
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { id: 'moves', label: 'Moves', value: '0' },
          { id: 'time', label: 'Time', value: '0s' }
        ]);
        this.startGame();
      }
    });
  }

  private startGame() {
    this.isRunning = true;
    this.startNewGame();
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

    // 7 columns width fitting
    this.cardWidth = Math.min((width - 32) / 7.5, 52);
    this.cardHeight = this.cardWidth * 1.42;

    this.startX = (width - (7 * this.cardWidth + 6 * 6)) / 2;
    this.startY = 20;
  }

  private startNewGame() {
    this.movesCount = 0;
    this.timerSeconds = 0;
    this.overlayManager?.updateStat('moves', 0);
    this.overlayManager?.updateStat('time', '0s');

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (!this.isWon && this.isRunning && !this.countdownActive) {
        this.timerSeconds++;
        this.overlayManager?.updateStat('time', `${this.timerSeconds}s`);
      }
    }, 1000);

    this.isWon = false;
    this.selectedCard = null;
    this.statusMessage = "Tap cards to move or deal";

    if (!this.countdownActive) {
      this.juice.reset();
      this.countdownActive = true;
      this.juice.startCountdown(() => {
        this.countdownActive = false;
      });
    }

    // Create 52 deck
    const suits: Suit[] = ['H', 'D', 'C', 'S'];
    const deck: Card[] = [];
    suits.forEach(s => {
      for (let r = 1; r <= 13; r++) {
        deck.push({ id: `${s}${r}`, suit: s, rank: r, faceUp: false });
      }
    });

    // Shuffle deck
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Deal to 7 tableau columns
    this.tableau = [[], [], [], [], [], [], []];
    for (let c = 0; c < 7; c++) {
      for (let r = 0; r <= c; r++) {
        const card = deck.pop()!;
        card.faceUp = r === c; // Top card is face up
        this.tableau[c].push(card);
      }
    }

    this.stock = deck;
    this.waste = [];
    this.foundations = [[], [], [], []];

    this.updateHeaderScore();
  }

  private updateHeaderScore() {
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.movesCount);
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
    const gap = 6;

    // Check Bottom Control buttons
    const controlsY = this.canvas.height - 25;
    if (Math.abs(mx - (midX - 50)) <= 35 && Math.abs(my - controlsY) <= 14) {
      this.startNewGame();
      this.playSFX('click');
      return;
    }

    if (this.isWon || this.countdownActive) return;

    // 1. Stock Pile Click
    const stockX = this.startX;
    const stockY = this.startY;
    if (mx >= stockX && mx <= stockX + this.cardWidth && my >= stockY && my <= stockY + this.cardHeight) {
      this.handleStockClick();
      return;
    }

    // 2. Waste Pile Click
    const wasteX = this.startX + this.cardWidth + gap;
    if (mx >= wasteX && mx <= wasteX + this.cardWidth && my >= stockY && my <= stockY + this.cardHeight) {
      if (this.waste.length > 0) {
        this.selectedCard = { type: 'waste' };
        this.autoMoveSelectedCard();
      }
      return;
    }

    // 3. Tableau Columns Click
    const tableauY = this.startY + this.cardHeight + 20;
    for (let c = 0; c < 7; c++) {
      const colX = this.startX + c * (this.cardWidth + gap);
      const col = this.tableau[c];

      if (col.length === 0) {
        // Empty column click
        if (mx >= colX && mx <= colX + this.cardWidth && my >= tableauY && my <= tableauY + this.cardHeight) {
          this.handleTableauColumnClick(c, 0);
          return;
        }
      } else {
        // Non-empty column
        for (let i = col.length - 1; i >= 0; i--) {
          const cardY = tableauY + i * 18;
          if (mx >= colX && mx <= colX + this.cardWidth && my >= cardY && my <= cardY + (i === col.length - 1 ? this.cardHeight : 18)) {
            if (col[i].faceUp) {
              this.selectedCard = { type: 'tableau', col: c, index: i };
              this.autoMoveSelectedCard();
            } else if (i === col.length - 1) {
              // Flip top face-down card
              col[i].faceUp = true;
              this.playSFX('flip');
            }
            return;
          }
        }
      }
    }
  }

  private handleStockClick() {
    const stockX = this.startX + this.cardWidth / 2;
    const stockY = this.startY + 10 + this.cardHeight / 2;

    if (this.stock.length > 0) {
      const card = this.stock.pop()!;
      card.faceUp = true;
      this.waste.push(card);
      this.playSFX('deal');
      this.juice.spawnExplosion(stockX, stockY, { color: ['#3b82f6', '#1d4ed8', '#ffffff'], count: 8, sizeRange: [1.5, 3.5], speedRange: [1, 2.5] });
      this.juice.bounceZoom(1.008);
    } else if (this.waste.length > 0) {
      // Recycle waste back to stock
      while (this.waste.length > 0) {
        const card = this.waste.pop()!;
        card.faceUp = false;
        this.stock.push(card);
      }
      this.playSFX('deal');
      this.juice.spawnExplosion(stockX, stockY, { color: ['#10b981', '#047857', '#ffffff'], count: 12, sizeRange: [2, 4], speedRange: [1, 3] });
      this.juice.shake(4);
    }
  }

  private autoMoveSelectedCard() {
    if (!this.selectedCard) return;

    let cardsToMove: Card[] = [];
    if (this.selectedCard.type === 'waste') {
      cardsToMove = [this.waste[this.waste.length - 1]];
    } else if (this.selectedCard.type === 'tableau') {
      const col = this.tableau[this.selectedCard.col!];
      cardsToMove = col.slice(this.selectedCard.index!);
    }

    if (cardsToMove.length === 0) return;
    const leadCard = cardsToMove[0];

    // 1. Try move single card to Foundation first
    if (cardsToMove.length === 1) {
      for (let f = 0; f < 4; f++) {
        const found = this.foundations[f];
        if (found.length === 0) {
          if (leadCard.rank === 1) { // Ace
            this.executeCardMove(cardsToMove, 'foundation', f);
            return;
          }
        } else {
          const topFound = found[found.length - 1];
          if (topFound.suit === leadCard.suit && leadCard.rank === topFound.rank + 1) {
            this.executeCardMove(cardsToMove, 'foundation', f);
            return;
          }
        }
      }
    }

    // 2. Try move to Tableau columns
    for (let c = 0; c < 7; c++) {
      if (this.selectedCard.type === 'tableau' && this.selectedCard.col === c) continue;

      const col = this.tableau[c];
      if (col.length === 0) {
        if (leadCard.rank === 13) { // King
          this.executeCardMove(cardsToMove, 'tableau', c);
          return;
        }
      } else {
        const topCard = col[col.length - 1];
        if (topCard.faceUp) {
          const isOppColor = (this.isRed(leadCard) && !this.isRed(topCard)) || (!this.isRed(leadCard) && this.isRed(topCard));
          if (isOppColor && leadCard.rank === topCard.rank - 1) {
            this.executeCardMove(cardsToMove, 'tableau', c);
            return;
          }
        }
      }
    }

    this.selectedCard = null;
  }

  private executeCardMove(cards: Card[], targetType: 'foundation' | 'tableau', targetIndex: number) {
    // Remove from source
    if (this.selectedCard!.type === 'waste') {
      this.waste.pop();
    } else if (this.selectedCard!.type === 'tableau') {
      const srcCol = this.tableau[this.selectedCard!.col!];
      srcCol.splice(this.selectedCard!.index!);
      if (srcCol.length > 0 && !srcCol[srcCol.length - 1].faceUp) {
        srcCol[srcCol.length - 1].faceUp = true; // Auto flip top
      }
    }

    // Add to target
    if (targetType === 'foundation') {
      this.foundations[targetIndex].push(...cards);
    } else {
      this.tableau[targetIndex].push(...cards);
    }

    // Spawn card placement animation particles and text!
    const targetX = targetType === 'foundation' 
      ? this.startX + (3 + targetIndex) * (this.cardWidth + 6) + this.cardWidth / 2
      : this.startX + targetIndex * (this.cardWidth + 6) + this.cardWidth / 2;
    const targetY = targetType === 'foundation'
      ? this.startY + 10 + this.cardHeight / 2
      : this.startY + 10 + this.cardHeight + 16 + (this.tableau[targetIndex].length * 18);

    this.juice.bounceZoom(1.01);
    this.juice.spawnText(targetX, targetY - 10, targetType === 'foundation' ? 'FOUNDATION!' : 'SEQUENCED!', {
      color: targetType === 'foundation' ? '#10b981' : '#f59e0b',
      fontSize: 10,
      scale: 1.15
    });
    this.juice.spawnExplosion(targetX, targetY, {
      color: targetType === 'foundation' ? ['#10b981', '#34d399', '#ffffff'] : ['#f59e0b', '#fbbf24', '#ffffff'],
      count: 10,
      sizeRange: [1.5, 3.5],
      speedRange: [1, 2.5]
    });

    this.movesCount++;
    this.updateHeaderScore();
    this.overlayManager?.updateStat('moves', this.movesCount);
    this.playSFX('move');
    this.selectedCard = null;

    this.checkVictory();
  }

  private handleTableauColumnClick(colIndex: number, cardIndex: number) {
    // Handled in autoMove
  }

  private isRed(card: Card): boolean {
    return card.suit === 'H' || card.suit === 'D';
  }

  private checkVictory() {
    const totalFoundations = this.foundations.reduce((sum, f) => sum + f.length, 0);
    if (totalFoundations === 52 && !this.isWon) {
      this.isWon = true;
      this.statusMessage = "SOLITAIRE VICTORIOUS!";
      this.playSFX('win');
      this.juice.spawnConfetti(this.canvas?.width || 400, this.canvas?.height || 400);
      setTimeout(() => {
        this.overlayManager?.showResults({
          title: 'KLONDIKE VICTORY! 🎴',
          subtitle: `Cleared all 52 cards in ${this.movesCount} moves!`,
          isWin: true,
          stats: [
            { label: 'Total Moves', value: String(this.movesCount) },
            { label: 'Time Elapsed', value: `${this.timerSeconds}s` }
          ],
          onRestart: () => {
            this.overlayManager?.hideResults();
            this.startNewGame();
          },
          onExit: () => {
            if (this.context?.onExit) this.context.onExit();
          }
        });
      }, 300);
    }
  }

  private playSFX(type: 'deal' | 'move' | 'flip' | 'win' | 'click') {
    const engine = GameAudioEngine.getInstance();
    if (type === 'deal') engine.playSFX('swish');
    else if (type === 'move') engine.playSFX('step');
    else if (type === 'flip') engine.playSFX('flip');
    else if (type === 'click') engine.playSFX('click');
    else if (type === 'win') engine.playSFX('win');
  }

  private tick() {
    if (!this.isRunning) return;
    this.juice.update(1.0);
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
    const gap = 6;

    // Header Status String
    ctx.textAlign = 'center';
    ctx.font = 'bold 12px "Space Grotesk", sans-serif';
    ctx.fillStyle = this.isWon ? '#10b981' : '#cda250';
    ctx.fillText(this.statusMessage, midX, this.startY - 6);

    // Apply Camera Transforms
    this.juice.applyCameraTransforms(ctx, canvas.width, canvas.height);

    // 1. Stock Pile
    const stockX = this.startX;
    const stockY = this.startY + 10;

    if (this.stock.length > 0) {
      this.drawCardBack(stockX, stockY);
    } else {
      this.drawEmptySlot(stockX, stockY, '↺');
    }

    // 2. Waste Pile
    const wasteX = this.startX + this.cardWidth + gap;
    if (this.waste.length > 0) {
      this.drawCard(wasteX, stockY, this.waste[this.waste.length - 1]);
    } else {
      this.drawEmptySlot(wasteX, stockY, '');
    }

    // 3. 4 Foundations (Right-aligned top row)
    for (let f = 0; f < 4; f++) {
      const foundX = this.startX + (3 + f) * (this.cardWidth + gap);
      const suitSymbols = ['♥', '♦', '♣', '♠'];
      const pile = this.foundations[f];

      if (pile.length > 0) {
        this.drawCard(foundX, stockY, pile[pile.length - 1]);
      } else {
        this.drawEmptySlot(foundX, stockY, suitSymbols[f]);
      }
    }

    // 4. 7 Tableau Columns
    const tableauY = stockY + this.cardHeight + 16;

    for (let c = 0; c < 7; c++) {
      const colX = this.startX + c * (this.cardWidth + gap);
      const col = this.tableau[c];

      if (col.length === 0) {
        this.drawEmptySlot(colX, tableauY, 'K');
      } else {
        for (let i = 0; i < col.length; i++) {
          const card = col[i];
          const cardY = tableauY + i * 18;

          if (card.faceUp) {
            this.drawCard(colX, cardY, card);
          } else {
            this.drawCardBack(colX, cardY);
          }
        }
      }
    }

    // Restore Camera Transforms
    this.juice.restoreCameraTransforms(ctx);

    // Draw visual juice particles on top of the card grids
    this.juice.draw(ctx);

    // Bottom Controls
    const controlsY = canvas.height - 25;
    this.drawButton(midX - 50, controlsY, 76, 26, 'NEW GAME', false);
  }

  private drawCard(x: number, y: number, card: Card) {
    const ctx = this.ctx!;
    const isRed = this.isRed(card);

    // Card Body White Background
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(x, y, this.cardWidth, this.cardHeight, 4);
    ctx.fill();

    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Suit String
    const suits: Record<Suit, string> = { H: '♥', D: '♦', C: '♣', S: '♠' };
    const ranks = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

    ctx.fillStyle = isRed ? '#ef4444' : '#0f172a';
    ctx.font = `bold ${this.cardWidth * 0.32}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${ranks[card.rank]}${suits[card.suit]}`, x + 3, y + 3);
  }

  private drawCardBack(x: number, y: number) {
    const ctx = this.ctx!;
    ctx.fillStyle = '#1e3a8a'; // Deep Navy Back
    ctx.beginPath();
    ctx.roundRect(x, y, this.cardWidth, this.cardHeight, 4);
    ctx.fill();

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Pattern inside
    ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.roundRect(x + 3, y + 3, this.cardWidth - 6, this.cardHeight - 6, 2);
    ctx.fill();
  }

  private drawEmptySlot(x: number, y: number, label: string) {
    const ctx = this.ctx!;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, this.cardWidth, this.cardHeight, 4);
    ctx.stroke();

    if (label) {
      ctx.font = `bold ${this.cardWidth * 0.38}px sans-serif`;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x + this.cardWidth / 2, y + this.cardHeight / 2);
    }
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
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
    }
    window.removeEventListener('resize', this.boundResize);
    if (this.overlayManager) {
      this.overlayManager.destroy();
      this.overlayManager = null;
    }

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
