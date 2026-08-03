import { MiniGamePlugin } from '../core/GamePlugin';
import { GameLaunchContext } from '../core/GameLaunchContext';
import { resetGameCanvas } from '../../game.js';
import { GameOverlayManager } from '../core/GameOverlayManager';
import { GameAudioEngine } from '../core/GameAudioEngine';
import { GameJuice } from '../core/GameJuice';

interface Asteroid {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  type: 'standard' | 'fast' | 'heavy' | 'explosive' | 'comet';
  health: number;
  maxHealth: number;
  color: string;
  points: number;
  angle: number;
  rotSpeed: number;
  vertices: { x: number; y: number }[];
  nearMissTriggered?: boolean;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface UFO {
  id: string;
  type: 'large' | 'small';
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  fireCooldown: number;
  lastZigZag: number;
  points: number;
  color: string;
}

interface UFOBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

interface PowerUpItem {
  type: 'rapid_fire' | 'triple_shot' | 'shield' | 'piercing' | 'time_slow' | 'multiplier' | 'extra_life';
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  pulseTime: number;
  color: string;
  label: string;
}

interface ActivePowerUp {
  type: 'rapid_fire' | 'triple_shot' | 'shield' | 'piercing' | 'time_slow' | 'multiplier';
  timeLeft: number;
  duration: number;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  speed: number;
}

interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  color: string;
}

export class AsteroidsPlugin implements MiniGamePlugin {
  id = 'asteroids';
  name = 'Asteroids Vector Sector';
  subtitle = 'Classic space shooter';
  description = 'Pilot your spaceship through hazardous space sectors, blast splitting asteroids, and navigate screen-wrapping drift physics.';
  version = '1.1.0';
  genre = 'Arcade';
  preferredOrientation: 'portrait' | 'landscape' | 'any' = 'landscape';
  estimatedSessionLength = '2–5 min';
  category = 'Arcade';
  status: 'playable' = 'playable';
  statusText = 'PLAYABLE NOW';
  statusColor = 'rgba(16, 185, 129, 1)';
  iconSvg = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 24px; height: 24px;">
      <polygon points="12 2 2 22 12 17 22 22 12 2" />
    </svg>
  `;

  private readonly VIRTUAL_WIDTH = 1000;
  private readonly VIRTUAL_HEIGHT = 600;

  private getScaleAndOffsets() {
    if (!this.canvas) return { scale: 1, offsetX: 0, offsetY: 0 };
    const scale = Math.min(this.canvas.width / this.VIRTUAL_WIDTH, this.canvas.height / this.VIRTUAL_HEIGHT);
    const offsetX = (this.canvas.width - this.VIRTUAL_WIDTH * scale) / 2;
    const offsetY = (this.canvas.height - this.VIRTUAL_HEIGHT * scale) / 2;
    return { scale, offsetX, offsetY };
  }

  private toVirtualCoords(canvasX: number, canvasY: number) {
    const { scale, offsetX, offsetY } = this.getScaleAndOffsets();
    return {
      x: (canvasX - offsetX) / scale,
      y: (canvasY - offsetY) / scale
    };
  }

  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animationFrameId: number | null = null;
  private isRunning = false;
  private isPaused = false;
  private isGameOver = false;

  private ship = { x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2, isThrusting: false };
  private asteroids: Asteroid[] = [];
  private bullets: Bullet[] = [];
  private score = 0;
  private lives = 3;
  private highScore = 0;

  // Modern Mechanics Elements
  private ufos: UFO[] = [];
  private ufoBullets: UFOBullet[] = [];
  private powerUps: PowerUpItem[] = [];
  private activePowerUps: ActivePowerUp[] = [];
  private shockwaves: Shockwave[] = [];
  private stars: Star[] = [];

  private currentWave = 0;
  private waveTransitionTimer = 0;
  private ufoSpawnTimer = -1;
  private cometSpawnTimer = 400;
  private fireCooldown = 0;

  // Combos & Performance tracking
  private comboCount = 0;
  private comboTimer = 0;
  private tookDamageInWave = false;
  private shotsFiredInWave = 0;
  private shotsHitInWave = 0;

  // Visual highlights
  private invincibilityFrames = 0;
  private warpProgress = 1.0;

  private overlayManager: GameOverlayManager | null = null;
  private context: GameLaunchContext | null = null;
  private juice = new GameJuice();

  private keys: Record<string, boolean> = {};

  // Touch and Mouse controllers
  private virtualControls = { left: false, right: false, thrust: false, fire: false };
  private activeTouches = new Map<number, { x: number; y: number }>();
  private mousePressed = false;
  private mouseX = 0;
  private mouseY = 0;

  private boundMouseDown: any;
  private boundMouseMove: any;
  private boundMouseUp: any;
  private boundTouchStart: any;
  private boundTouchMove: any;
  private boundTouchEnd: any;
  private boundResize: any;
  private boundKeyDown: any;
  private boundKeyUp: any;

  launch(context: GameLaunchContext): void {
    if (this.isRunning) {
      this.destroy();
    }
    this.context = context;
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
    if (scoreLabel) scoreLabel.textContent = 'Score';
    if (scoreVal) scoreVal.textContent = '0';
    if (iconEl) iconEl.innerHTML = this.iconSvg;

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
        this.ship.isThrusting = false;
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
    this.boundMouseMove = this.handleMouseMove.bind(this);
    this.boundMouseUp = this.handleMouseUp.bind(this);
    this.boundTouchStart = this.handleTouchStart.bind(this);
    this.boundTouchMove = this.handleTouchMove.bind(this);
    this.boundTouchEnd = this.handleTouchEnd.bind(this);
    this.boundResize = this.resizeCanvas.bind(this);
    this.boundKeyDown = this.handleKeyDown.bind(this);
    this.boundKeyUp = this.handleKeyUp.bind(this);

    this.canvas.style.touchAction = 'none';
    this.canvas.addEventListener('mousedown', this.boundMouseDown);
    this.canvas.addEventListener('mousemove', this.boundMouseMove);
    this.canvas.addEventListener('mouseup', this.boundMouseUp);
    this.canvas.addEventListener('touchstart', this.boundTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this.boundTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', this.boundTouchEnd, { passive: false });
    window.addEventListener('resize', this.boundResize);
    window.addEventListener('keydown', this.boundKeyDown);
    window.addEventListener('keyup', this.boundKeyUp);

    // Fetch High Score from asynchronous save data
    this.context.save.getSaveData<{ highScore: number }>('asteroids', { highScore: 0 }).then(data => {
      this.highScore = data?.highScore ?? 0;
      this.updateHUDAndHeader();
    });

    this.showHelpOverlay();
    this.tick();
  }

  private showHelpOverlay() {
    this.isPaused = true;
    this.ship.isThrusting = false;
    GameAudioEngine.getInstance().stopBGM();

    this.overlayManager?.showInstructions({
      title: 'ASTEROIDS VECTOR SECTOR',
      subtitle: 'Premium Galactic Edition',
      description: 'Blast jagged obstacles, capture glowing tactical power-ups, defeat elusive UFO invaders, and rack up multiplier points in a thrilling space simulation.',
      objective: 'Annihilate cosmic debris and hostile UFOs while maintaining scoring combos.',
      controls: [
        { key: 'A / D or Left / Right', action: 'Rotate spaceship' },
        { key: 'W or Arrow Up', action: 'Ignite thrusters' },
        { key: 'Space / Click Canvas', action: 'Fire laser cannon' },
        { key: 'P / Esc', action: 'Pause / Resume sector' }
      ],
      rules: [
        'FAST Asteroids (Rose) move quickly. HEAVY Asteroids (Lavender) require 3 blaster hits.',
        'EXPLOSIVE Asteroids (Orange) trigger massive destructive shockwaves when cracked.',
        'Shattering rapid Comet streams yields a guaranteed glowing tactical upgrade bubble.',
        'Collect Shield (Cyan), Triple Fire (Yellow), Rapid Blaster (Amber), or Multiplier (Pink).'
      ],
      onStart: () => {
        this.overlayManager?.hideInstructions();
        this.overlayManager?.setupHUD([
          { label: 'Score', value: 0, id: 'score' },
          { label: 'Wave', value: 1, id: 'wave' },
          { label: 'Lives', value: 3, id: 'lives' },
          { label: 'Combo', value: 'x1', id: 'combo' }
        ], { showPause: true, showInstructions: true, showAudio: true, showRestart: true });
        this.isPaused = false;
        this.resetGame();
        this.juice.reset();
        this.juice.startCountdown(() => {
          GameAudioEngine.getInstance().playBGM('space');
        });
        GameAudioEngine.getInstance().playSFX('click');
      }
    });
  }

  private restartGame() {
    this.overlayManager?.hideResults();
    this.overlayManager?.resume();
    this.isGameOver = false;
    this.isPaused = false;
    this.resetGame();
  }

  private boundTick = () => this.tick();

  private resetGame() {
    if (!this.canvas) return;

    this.score = 0;
    this.lives = 3;
    this.currentWave = 0;
    this.isGameOver = false;
    this.asteroids = [];
    this.bullets = [];
    this.ufos = [];
    this.ufoBullets = [];
    this.powerUps = [];
    this.activePowerUps = [];
    this.shockwaves = [];
    this.comboCount = 0;
    this.comboTimer = 0;
    this.invincibilityFrames = 120;
    this.warpProgress = 0;
    this.keys = {};

    this.ship = {
      x: this.VIRTUAL_WIDTH / 2,
      y: this.VIRTUAL_HEIGHT / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      isThrusting: false
    };

    // Generate twinkling starfield background
    this.stars = [];
    for (let i = 0; i < 60; i++) {
      this.stars.push({
        x: Math.random() * this.VIRTUAL_WIDTH,
        y: Math.random() * this.VIRTUAL_HEIGHT,
        size: 0.5 + Math.random() * 1.5,
        speed: 0.1 + Math.random() * 0.4,
        color: Math.random() > 0.5 ? '#94a3b8' : '#38bdf8'
      });
    }

    this.startWaveTransition();
  }

  private startWaveTransition() {
    this.bullets = [];
    this.ufos = [];
    this.ufoBullets = [];
    this.powerUps = [];
    this.activePowerUps = [];

    let bonusPoints = 0;
    if (this.currentWave > 0) {
      const accuracy = this.shotsFiredInWave > 0 ? this.shotsHitInWave / this.shotsFiredInWave : 0;
      const accBonus = Math.floor(accuracy * 300);
      bonusPoints += accBonus;

      if (!this.tookDamageInWave) {
        bonusPoints += 500;
        this.juice.spawnText(this.VIRTUAL_WIDTH / 2, this.VIRTUAL_HEIGHT / 2 - 40, 'PERFECT SECTOR! +500', { color: '#eab308', fontSize: 20 });
      }

      if (accBonus > 0) {
        this.juice.spawnText(this.VIRTUAL_WIDTH / 2, this.VIRTUAL_HEIGHT / 2, `ACCURACY BONUS: ${Math.round(accuracy * 100)}% (+${accBonus})`, { color: '#10b981', fontSize: 16 });
      }

      if (bonusPoints > 0) {
        this.score += bonusPoints;
        GameAudioEngine.getInstance().playSFX('score');
        this.updateHUDAndHeader();
      }
    }

    this.currentWave++;
    this.waveTransitionTimer = 180; // 3 seconds at 60fps
    this.tookDamageInWave = false;
    this.shotsFiredInWave = 0;
    this.shotsHitInWave = 0;

    GameAudioEngine.getInstance().playSFX('win');
    this.updateHUDAndHeader();
  }

  private spawnAsteroidsForWave() {
    if (!this.canvas) return;

    let stdCount = 3 + this.currentWave;
    let heavyCount = Math.floor(this.currentWave / 2);
    let fastCount = Math.floor((this.currentWave - 1) / 2);
    let expCount = Math.floor((this.currentWave - 3) / 3);

    stdCount = Math.min(stdCount, 7);
    heavyCount = Math.min(heavyCount, 4);
    fastCount = Math.min(fastCount, 4);
    expCount = Math.min(expCount, 3);

    for (let i = 0; i < stdCount; i++) this.spawnAsteroidType(30, 'standard');
    for (let i = 0; i < heavyCount; i++) this.spawnAsteroidType(35, 'heavy');
    for (let i = 0; i < fastCount; i++) this.spawnAsteroidType(18, 'fast');
    for (let i = 0; i < expCount; i++) this.spawnAsteroidType(25, 'explosive');

    if (this.currentWave >= 4) {
      this.ufoSpawnTimer = 300 + Math.random() * 400;
    } else {
      this.ufoSpawnTimer = -1;
    }
  }

  private spawnAsteroidType(radius: number, type: Asteroid['type'], x?: number, y?: number) {
    if (!this.canvas) return;

    let ax = x ?? Math.random() * this.VIRTUAL_WIDTH;
    let ay = y ?? Math.random() * this.VIRTUAL_HEIGHT;

    if (x === undefined && y === undefined) {
      while (Math.hypot(ax - this.ship.x, ay - this.ship.y) < 130) {
        ax = Math.random() * this.VIRTUAL_WIDTH;
        ay = Math.random() * this.VIRTUAL_HEIGHT;
      }
    }

    const angle = Math.random() * Math.PI * 2;
    let speed = 0.8 + Math.random() * 1.4;

    if (type === 'fast') speed *= 1.7;
    if (type === 'heavy') speed *= 0.6;
    if (type === 'comet') speed *= 2.8;

    speed *= (1.0 + (this.currentWave - 1) * 0.04);

    const maxHealth = type === 'heavy' ? 3 : 1;
    let color = '#94a3b8';
    let points = 50;

    if (type === 'fast') { color = '#f43f5e'; points = 100; }
    else if (type === 'heavy') { color = '#c084fc'; points = 150; }
    else if (type === 'explosive') { color = '#f97316'; points = 120; }
    else if (type === 'comet') { color = '#22d3ee'; points = 250; }

    const vertices: { x: number; y: number }[] = [];
    const numPoints = 8 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numPoints; i++) {
      const a = (i / numPoints) * Math.PI * 2;
      const r = radius * (0.85 + Math.random() * 0.3);
      vertices.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }

    this.asteroids.push({
      x: ax,
      y: ay,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius,
      type,
      health: maxHealth,
      maxHealth,
      color,
      points,
      angle: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.03,
      vertices
    });
  }

  private spawnComet() {
    if (!this.canvas) return;
    const w = this.VIRTUAL_WIDTH;
    const h = this.VIRTUAL_HEIGHT;

    const side = Math.floor(Math.random() * 4);
    let x = 0, y = 0;
    if (side === 0) { x = 0; y = Math.random() * h; }
    else if (side === 1) { x = w; y = Math.random() * h; }
    else if (side === 2) { x = Math.random() * w; y = 0; }
    else { x = Math.random() * w; y = h; }

    this.spawnAsteroidType(15, 'comet', x, y);
    this.juice.spawnText(x, y, 'COMET DRIFTING! 🌠', { color: '#22d3ee', fontSize: 15 });
    GameAudioEngine.getInstance().playSFX('select');
  }

  private spawnUFO() {
    if (!this.canvas) return;
    const w = this.VIRTUAL_WIDTH;
    const h = this.VIRTUAL_HEIGHT;

    const type = (this.currentWave >= 6 && Math.random() > 0.5) ? 'small' : 'large';
    const x = Math.random() > 0.5 ? 0 : w;
    const y = 80 + Math.random() * (h - 220);

    const speed = type === 'large' ? 1.4 : 2.5;
    const vx = x === 0 ? speed : -speed;

    this.ufos.push({
      id: Math.random().toString(),
      type,
      x,
      y,
      vx,
      vy: 0,
      width: type === 'large' ? 38 : 24,
      height: type === 'large' ? 18 : 12,
      fireCooldown: 100 + Math.random() * 100,
      lastZigZag: 0,
      points: type === 'large' ? 400 : 800,
      color: type === 'large' ? '#c084fc' : '#eab308'
    });

    this.juice.spawnText(x, y, `${type.toUpperCase()} INTRUDER DETECTED! 🛸`, { color: '#eab308', fontSize: 16 });
    GameAudioEngine.getInstance().playSFX('warning');

    this.ufoSpawnTimer = 600 + Math.random() * 600;
  }

  private spawnPowerUpChance(x: number, y: number, chanceMultiplier = 1.0) {
    if (Math.random() < 0.16 * chanceMultiplier) {
      const types: PowerUpItem['type'][] = ['rapid_fire', 'triple_shot', 'shield', 'piercing', 'time_slow', 'multiplier'];
      if (this.lives < 5 && Math.random() < 0.12) {
        types.push('extra_life');
      }
      const type = types[Math.floor(Math.random() * types.length)];

      let color = '#38bdf8';
      let label = 'P';
      if (type === 'rapid_fire') { color = '#f59e0b'; label = 'F'; }
      else if (type === 'triple_shot') { color = '#eab308'; label = 'T'; }
      else if (type === 'shield') { color = '#22d3ee'; label = 'S'; }
      else if (type === 'piercing') { color = '#10b981'; label = 'P'; }
      else if (type === 'time_slow') { color = '#a855f7'; label = 'W'; }
      else if (type === 'multiplier') { color = '#ec4899'; label = 'M'; }
      else if (type === 'extra_life') { color = '#ef4444'; label = 'L'; }

      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 0.8;

      this.powerUps.push({
        type,
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 13,
        pulseTime: 0,
        color,
        label
      });

      this.juice.spawnExplosion(x, y, { count: 6, color, sizeRange: [1, 3], speedRange: [0.5, 2] });
    }
  }

  private triggerPowerUp(type: PowerUpItem['type']) {
    this.juice.shake(4);

    if (type === 'extra_life') {
      this.lives = Math.min(5, this.lives + 1);
      GameAudioEngine.getInstance().playSFX('score');
      this.juice.spawnText(this.ship.x, this.ship.y - 30, 'EXTRA PILOT LIFE! 💖', { color: '#ef4444', fontSize: 18 });
      this.updateHUDAndHeader();
      return;
    }

    const duration = 600; // 10 seconds
    const existing = this.activePowerUps.find(p => p.type === type);

    if (existing) {
      existing.timeLeft = duration;
    } else {
      this.activePowerUps.push({
        type: type as any,
        timeLeft: duration,
        duration: duration
      });
    }

    let label = '';
    let color = '#fff';

    if (type === 'rapid_fire') { label = 'RAPID FIRE! 🔥'; color = '#f59e0b'; GameAudioEngine.getInstance().playSFX('select'); }
    else if (type === 'triple_shot') { label = 'TRIPLE SHOT! ⚡'; color = '#eab308'; GameAudioEngine.getInstance().playSFX('clear'); }
    else if (type === 'shield') { label = 'SHIELD ENERGIZED! 🛡️'; color = '#22d3ee'; GameAudioEngine.getInstance().playSFX('score'); }
    else if (type === 'piercing') { label = 'PIERCE CANNON! ☄️'; color = '#10b981'; GameAudioEngine.getInstance().playSFX('select'); }
    else if (type === 'time_slow') { label = 'TIME WARP! 🌀'; color = '#a855f7'; GameAudioEngine.getInstance().playSFX('flip'); }
    else if (type === 'multiplier') { label = '2X MULTIPLIER! 💎'; color = '#ec4899'; GameAudioEngine.getInstance().playSFX('score'); }

    this.juice.spawnText(this.ship.x, this.ship.y - 30, label, { color, fontSize: 18 });
    this.juice.spawnExplosion(this.ship.x, this.ship.y, { count: 12, color, sizeRange: [2, 5], speedRange: [1, 4] });
  }

  private updateHUDAndHeader() {
    const scoreVal = document.getElementById('bb-score-val');
    if (scoreVal) scoreVal.textContent = String(this.score);

    const comboMult = 1 + Math.floor(this.comboCount / 3);

    this.overlayManager?.updateHUD([
      { id: 'score', value: this.score },
      { id: 'wave', value: this.currentWave },
      { id: 'lives', value: this.lives },
      { id: 'combo', value: `x${comboMult}` }
    ]);
  }

  private resizeCanvas() {
    if (!this.canvas) return;
    const container = document.getElementById('game-canvas-container');
    if (container) {
      this.canvas.width = container.clientWidth;
      this.canvas.height = container.clientHeight;
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (!this.isGameOver && this.overlayManager) {
        this.isPaused = !this.isPaused;
        if (this.isPaused) {
          this.overlayManager.pause();
          this.ship.isThrusting = false;
        } else {
          this.overlayManager.resume();
        }
      }
      return;
    }

    if (this.isGameOver || this.isPaused) return;

    this.keys[e.key.toLowerCase()] = true;
    this.keys[e.key] = true;

    if (e.key === ' ') {
      e.preventDefault();
      this.fireBullet();
    }
  }

  private handleKeyUp(e: KeyboardEvent) {
    this.keys[e.key.toLowerCase()] = false;
    this.keys[e.key] = false;
  }

  private handleTouchStart(e: TouchEvent) {
    if (!this.canvas) return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.activeTouches.set(touch.identifier, {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      });
    }
  }

  private handleTouchMove(e: TouchEvent) {
    if (!this.canvas) return;
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.activeTouches.set(touch.identifier, {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      });
    }
  }

  private handleTouchEnd(e: TouchEvent) {
    if (!this.canvas) return;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      this.activeTouches.delete(touch.identifier);
    }
  }

  private handleMouseDown(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mousePressed = true;
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;

    // Check if clicked outside of virtual controls for auto-aim fire
    const points: { x: number; y: number }[] = [{ x: this.mouseX, y: this.mouseY }];
    if (!this.checkButtonsTriggered(points)) {
      const vMouse = this.toVirtualCoords(this.mouseX, this.mouseY);
      this.ship.angle = Math.atan2(vMouse.y - this.ship.y, vMouse.x - this.ship.x);
      this.fireBullet();
    }
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.canvas) return;
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
  }

  private handleMouseUp(e: MouseEvent) {
    this.mousePressed = false;
  }

  private checkButtonsTriggered(points: { x: number; y: number }[]): boolean {
    if (!this.canvas) return false;
    const w = this.canvas.width;
    const h = this.canvas.height;
    const isMobile = w < 768;
    if (!isMobile) return false;
    const btnSize = 28;

    const leftX1 = isMobile ? 55 : w / 2 - 100;
    const leftY1 = isMobile ? h - 55 : h - 45;
    const leftX2 = isMobile ? 125 : w / 2 - 40;
    const leftY2 = isMobile ? h - 55 : h - 45;

    const rightX1 = isMobile ? w - 125 : w / 2 + 20;
    const rightY1 = isMobile ? h - 55 : h - 45;
    const rightX2 = isMobile ? w - 55 : w / 2 + 80;
    const rightY2 = isMobile ? h - 55 : h - 45;

    for (const pt of points) {
      if (Math.hypot(pt.x - leftX1, pt.y - leftY1) < btnSize + 10) return true;
      if (Math.hypot(pt.x - leftX2, pt.y - leftY2) < btnSize + 10) return true;
      if (Math.hypot(pt.x - rightX1, pt.y - rightY1) < btnSize + 10) return true;
      if (Math.hypot(pt.x - rightX2, pt.y - rightY2) < btnSize + 10) return true;
    }
    return false;
  }

  private fireBullet() {
    if (this.isPaused || this.isGameOver || this.warpProgress < 1) return;
    if (this.fireCooldown > 0) return;

    const isRapid = this.activePowerUps.some(p => p.type === 'rapid_fire');
    this.fireCooldown = isRapid ? 5 : 15;

    const isTriple = this.activePowerUps.some(p => p.type === 'triple_shot');
    const speed = 8.5;

    if (isTriple) {
      const angles = [this.ship.angle - 0.22, this.ship.angle, this.ship.angle + 0.22];
      for (const ang of angles) {
        this.bullets.push({
          x: this.ship.x + Math.cos(ang) * 16,
          y: this.ship.y + Math.sin(ang) * 16,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          life: 55
        });
      }
      this.shotsFiredInWave += 3;
    } else {
      this.bullets.push({
        x: this.ship.x + Math.cos(this.ship.angle) * 16,
        y: this.ship.y + Math.sin(this.ship.angle) * 16,
        vx: Math.cos(this.ship.angle) * speed,
        vy: Math.sin(this.ship.angle) * speed,
        life: 55
      });
      this.shotsFiredInWave += 1;
    }

    this.juice.shake(1.5, 0.85);

    const bx = this.ship.x + Math.cos(this.ship.angle) * 16;
    const by = this.ship.y + Math.sin(this.ship.angle) * 16;
    this.juice.spawnExplosion(bx, by, { count: 3, color: '#38bdf8', sizeRange: [1, 2], speedRange: [0.5, 1.5] });

    GameAudioEngine.getInstance().playSFX('laser');
  }

  private handlePlayerDamage() {
    const shieldIdx = this.activePowerUps.findIndex(p => p.type === 'shield');
    if (shieldIdx !== -1) {
      this.activePowerUps.splice(shieldIdx, 1);
      this.invincibilityFrames = 90;
      this.juice.shake(6);
      this.juice.spawnExplosion(this.ship.x, this.ship.y, { count: 15, color: '#22d3ee', sizeRange: [2, 5], speedRange: [2, 5] });
      GameAudioEngine.getInstance().playSFX('warning');
      this.juice.spawnText(this.ship.x, this.ship.y - 30, 'SHIELD BROKEN!', { color: '#06b6d4', fontSize: 16 });
      return;
    }

    this.lives--;
    this.tookDamageInWave = true;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.invincibilityFrames = 120; // 2 seconds invincibility

    GameAudioEngine.getInstance().playSFX('hit');
    this.juice.spawnExplosion(this.ship.x, this.ship.y, { count: 25, color: '#f43f5e', sizeRange: [3, 8], speedRange: [3, 8] });
    this.juice.shake(15);

    if (this.lives <= 0) {
      this.isGameOver = true;
      this.ship.isThrusting = false;
      this.juice.spawnConfetti(this.canvas?.width || 400, this.canvas?.height || 600);
      this.juice.bounceZoom(1.12);
      GameAudioEngine.getInstance().playSFX('lose');
      GameAudioEngine.getInstance().stopBGM();

      if (this.score > this.highScore) {
        this.highScore = this.score;
        this.context?.save.saveData('asteroids', { highScore: this.highScore }).catch(e => console.error(e));
      }

      const rank = this.score > 5000 ? 'S-Class Ace 🌌' : this.score > 2500 ? 'Vanguard Pilot 🚀' : this.score > 1000 ? 'Star Defender 🛡️' : 'Academy Cadet 🎓';

      this.overlayManager?.showResults({
        title: 'GAME OVER',
        score: this.score,
        highScore: this.highScore,
        metrics: [
          { label: 'Pilot Rank', value: rank },
          { label: 'Wave Reached', value: `Wave ${this.currentWave}` }
        ],
        onRestart: () => {
          this.overlayManager?.hideResults();
          this.resetGame();
        }
      });
    } else {
      this.juice.spawnText(this.ship.x, this.ship.y - 30, '-1 PILOT LIFE', { color: '#ef4444', fontSize: 18 });
      this.ship.x = this.VIRTUAL_WIDTH / 2;
      this.ship.y = this.VIRTUAL_HEIGHT / 2;
      this.ship.vx = 0;
      this.ship.vy = 0;
      this.warpProgress = 0;
    }

    this.updateHUDAndHeader();
  }

  private destroyAsteroid(idx: number, isShockwave = false) {
    const a = this.asteroids[idx];
    if (!a) return;

    const isMultiplier = this.activePowerUps.some(p => p.type === 'multiplier');
    const comboMult = 1 + Math.floor(this.comboCount / 3);
    const scoreVal = a.points * comboMult * (isMultiplier ? 2 : 1);

    this.score += scoreVal;
    this.shotsHitInWave++;

    this.comboCount++;
    this.comboTimer = 120; // 2 seconds
    this.updateHUDAndHeader();

    GameAudioEngine.getInstance().playSFX('explosion');
    this.juice.shake(isShockwave ? 3 : 5);

    this.juice.spawnExplosion(a.x, a.y, {
      count: a.radius > 20 ? 15 : 8,
      color: [a.color, '#ffffff', '#e2e8f0'],
      sizeRange: [2, a.radius / 5],
      speedRange: [1, 4]
    });

    this.juice.spawnFloatingScore(a.x, a.y, scoreVal, isMultiplier ? '#ec4899' : a.color);

    if (this.comboCount >= 3 && this.comboCount % 3 === 0) {
      this.juice.spawnText(a.x, a.y - 15, `COMBO x${comboMult}!`, { color: '#eab308', fontSize: 16 });
    }

    if (a.type === 'explosive') {
      this.shockwaves.push({
        x: a.x,
        y: a.y,
        radius: 10,
        maxRadius: 130,
        speed: 4
      });
      this.juice.shake(8);
      GameAudioEngine.getInstance().playSFX('boom');
    }

    if (a.radius > 10) {
      if (a.type === 'heavy') {
        this.spawnAsteroidType(15, 'standard', a.x, a.y);
        this.spawnAsteroidType(15, 'standard', a.x, a.y);
      } else {
        this.spawnAsteroidType(a.radius / 2, a.type, a.x, a.y);
        this.spawnAsteroidType(a.radius / 2, a.type, a.x, a.y);
      }
    }

    this.spawnPowerUpChance(a.x, a.y, a.type === 'comet' ? 5.0 : a.type === 'heavy' ? 2.0 : 1.0);
    this.asteroids.splice(idx, 1);
  }

  private update() {
    if (!this.canvas || this.isGameOver || this.isPaused) return;
    const w = this.VIRTUAL_WIDTH;
    const h = this.VIRTUAL_HEIGHT;

    // Handle Wave Transitions
    if (this.waveTransitionTimer > 0) {
      this.waveTransitionTimer--;
      if (this.waveTransitionTimer === 0) {
        this.spawnAsteroidsForWave();
      }
    }

    // Handle warp-in ring animation scale
    if (this.warpProgress < 1.0) {
      this.warpProgress += 0.02;
      if (this.warpProgress >= 1.0) this.warpProgress = 1.0;
    }

    if (this.fireCooldown > 0) this.fireCooldown--;

    // Invincibility frame countdown
    if (this.invincibilityFrames > 0) this.invincibilityFrames--;

    // Combo system update
    if (this.comboCount > 0) {
      this.comboTimer--;
      if (this.comboTimer <= 0) {
        this.comboCount = 0;
        this.updateHUDAndHeader();
      }
    }

    // Evaluate Pointer / Touch active areas
    this.virtualControls.left = false;
    this.virtualControls.right = false;
    this.virtualControls.thrust = false;
    this.virtualControls.fire = false;

    const points: { x: number; y: number }[] = [];
    if (this.mousePressed) points.push({ x: this.mouseX, y: this.mouseY });
    for (const touch of this.activeTouches.values()) points.push(touch);

    const isMobile = this.canvas.width < 768;
    const btnSize = 28;

    const realW = this.canvas.width;
    const realH = this.canvas.height;

    const leftX1 = isMobile ? 55 : realW / 2 - 100;
    const leftY1 = isMobile ? realH - 55 : realH - 45;
    const leftX2 = isMobile ? 125 : realW / 2 - 40;
    const leftY2 = isMobile ? realH - 55 : realH - 45;

    const rightX1 = isMobile ? realW - 125 : realW / 2 + 20;
    const rightY1 = isMobile ? realH - 55 : realH - 45;
    const rightX2 = isMobile ? realW - 55 : realW / 2 + 80;
    const rightY2 = isMobile ? realH - 55 : realH - 45;

    for (const pt of points) {
      if (Math.hypot(pt.x - leftX1, pt.y - leftY1) < btnSize + 10) this.virtualControls.left = true;
      if (Math.hypot(pt.x - leftX2, pt.y - leftY2) < btnSize + 10) this.virtualControls.right = true;
      if (Math.hypot(pt.x - rightX1, pt.y - rightY1) < btnSize + 10) this.virtualControls.thrust = true;
      if (Math.hypot(pt.x - rightX2, pt.y - rightY2) < btnSize + 10) this.virtualControls.fire = true;
    }

    // Mouse aiming on desktop
    if (!isMobile && this.mousePressed) {
      const vMouse = this.toVirtualCoords(this.mouseX, this.mouseY);
      this.ship.angle = Math.atan2(vMouse.y - this.ship.y, vMouse.x - this.ship.x);
    }

    // Keyboard and Virtual Steering
    if (this.keys['arrowleft'] || this.keys['a'] || this.virtualControls.left) {
      this.ship.angle -= 0.085;
    }
    if (this.keys['arrowright'] || this.keys['d'] || this.virtualControls.right) {
      this.ship.angle += 0.085;
    }

    this.ship.isThrusting = !!(this.keys['arrowup'] || this.keys['w'] || this.virtualControls.thrust);
    if (this.ship.isThrusting && this.warpProgress >= 1.0) {
      this.ship.vx += Math.cos(this.ship.angle) * 0.14;
      this.ship.vy += Math.sin(this.ship.angle) * 0.14;

      const speed = Math.hypot(this.ship.vx, this.ship.vy);
      if (speed > 6.5) {
        this.ship.vx = (this.ship.vx / speed) * 6.5;
        this.ship.vy = (this.ship.vy / speed) * 6.5;
      }
    }

    if (this.virtualControls.fire || (!isMobile && this.mousePressed)) {
      this.fireBullet();
    }

    // Ship location drift physics
    this.ship.x = (this.ship.x + this.ship.vx + w) % w;
    this.ship.y = (this.ship.y + this.ship.vy + h) % h;
    this.ship.vx *= 0.985;
    this.ship.vy *= 0.985;

    // Background Parallax Stars drift
    for (const s of this.stars) {
      s.x = (s.x - this.ship.vx * s.speed * 0.5 + w) % w;
      s.y = (s.y - this.ship.vy * s.speed * 0.5 + h) % h;
    }

    // Active power-ups duration countdowns
    for (let i = this.activePowerUps.length - 1; i >= 0; i--) {
      const ap = this.activePowerUps[i];
      ap.timeLeft--;
      if (ap.timeLeft <= 0) {
        this.activePowerUps.splice(i, 1);
      }
    }

    // Shockwaves expanding calculations
    for (let i = this.shockwaves.length - 1; i >= 0; i--) {
      const sw = this.shockwaves[i];
      sw.radius += sw.speed;

      for (let j = this.asteroids.length - 1; j >= 0; j--) {
        const a = this.asteroids[j];
        if (Math.hypot(a.x - sw.x, a.y - sw.y) < sw.radius) {
          this.destroyAsteroid(j, true);
        }
      }

      for (let j = this.ufos.length - 1; j >= 0; j--) {
        const u = this.ufos[j];
        if (Math.hypot(u.x - sw.x, u.y - sw.y) < sw.radius) {
          this.juice.spawnExplosion(u.x, u.y, { count: 15, color: '#f43f5e', sizeRange: [2, 6], speedRange: [2, 6] });
          this.score += u.points;
          this.ufos.splice(j, 1);
          GameAudioEngine.getInstance().playSFX('clear');
          this.juice.spawnFloatingScore(u.x, u.y, u.points, '#eab308');
        }
      }

      // Add visual shockwave pushback to the ship
      if (Math.hypot(this.ship.x - sw.x, this.ship.y - sw.y) < sw.radius && Math.hypot(this.ship.x - sw.x, this.ship.y - sw.y) > sw.radius - 20) {
        const pushAng = Math.atan2(this.ship.y - sw.y, this.ship.x - sw.x);
        this.ship.vx += Math.cos(pushAng) * 0.6;
        this.ship.vy += Math.sin(pushAng) * 0.6;
      }

      if (sw.radius >= sw.maxRadius) {
        this.shockwaves.splice(i, 1);
      }
    }

    // Player Lasers update
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x = (b.x + b.vx + w) % w;
      b.y = (b.y + b.vy + h) % h;
      b.life--;
      if (b.life <= 0) this.bullets.splice(i, 1);
    }

    const isSlow = this.activePowerUps.some(p => p.type === 'time_slow');
    const dt = isSlow ? 0.42 : 1.0;

    // Drifting Comet trigger timer
    if (this.currentWave >= 3) {
      this.cometSpawnTimer -= dt;
      if (this.cometSpawnTimer <= 0) {
        this.spawnComet();
        this.cometSpawnTimer = 600 + Math.random() * 500;
      }
    }

    // Asteroids logic and collisions
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      a.x = (a.x + a.vx * dt + w) % w;
      a.y = (a.y + a.vy * dt + h) % h;
      a.angle += a.rotSpeed * dt;

      if (a.type === 'comet' && Math.random() < 0.45) {
        this.juice.spawnTrail(a.x, a.y, '#22d3ee', 2.5);
      }

      // Near-miss triggers
      if (!this.isGameOver && this.invincibilityFrames <= 0 && this.warpProgress >= 1.0) {
        const distance = Math.hypot(a.x - this.ship.x, a.y - this.ship.y);
        const touchDist = a.radius + 15;

        if (distance > touchDist && distance < touchDist + 22) {
          if (!a.nearMissTriggered) {
            a.nearMissTriggered = true;
            this.score += 50;
            this.updateHUDAndHeader();
            GameAudioEngine.getInstance().playSFX('swish');
            this.juice.spawnText(this.ship.x, this.ship.y - 25, 'NEAR MISS! +50', { color: '#10b981', fontSize: 13 });
          }
        } else if (distance > touchDist + 45) {
          a.nearMissTriggered = false;
        }
      }

      // Player lasers vs Asteroids
      for (let j = this.bullets.length - 1; j >= 0; j--) {
        const b = this.bullets[j];
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.radius + 4) {
          const isPierce = this.activePowerUps.some(p => p.type === 'piercing');
          if (!isPierce) {
            this.bullets.splice(j, 1);
          }

          if (a.type === 'heavy' && a.health > 1) {
            a.health--;
            GameAudioEngine.getInstance().playSFX('hit');
            this.juice.spawnExplosion(b.x, b.y, { count: 5, color: '#c084fc', sizeRange: [1, 3.5], speedRange: [1, 2.5] });
            this.juice.shake(2);
            continue;
          }

          this.destroyAsteroid(i);
          break;
        }
      }
    }

    // Ship vs Asteroids collisions
    if (this.invincibilityFrames <= 0 && !this.isGameOver && this.warpProgress >= 1) {
      for (let i = this.asteroids.length - 1; i >= 0; i--) {
        const a = this.asteroids[i];
        if (Math.hypot(a.x - this.ship.x, a.y - this.ship.y) < a.radius + 12) {
          this.handlePlayerDamage();
          this.asteroids.splice(i, 1);
          break;
        }
      }
    }

    // Tactical Floating Powerups movement
    for (let i = this.powerUps.length - 1; i >= 0; i--) {
      const p = this.powerUps[i];
      p.x = (p.x + p.vx + w) % w;
      p.y = (p.y + p.vy + h) % h;
      p.pulseTime += 0.05;

      const playerDist = Math.hypot(p.x - this.ship.x, p.y - this.ship.y);
      if (playerDist < 120) {
        const pullAngle = Math.atan2(this.ship.y - p.y, this.ship.x - p.x);
        const pullSpeed = (120 - playerDist) / 25;
        p.vx += Math.cos(pullAngle) * pullSpeed * 0.16;
        p.vy += Math.sin(pullAngle) * pullSpeed * 0.16;

        const spd = Math.hypot(p.vx, p.vy);
        if (spd > 5.5) {
          p.vx = (p.vx / spd) * 5.5;
          p.vy = (p.vy / spd) * 5.5;
        }
      }

      if (playerDist < p.radius + 15 && !this.isGameOver) {
        this.powerUps.splice(i, 1);
        this.triggerPowerUp(p.type);
        continue;
      }
    }

    // UFO Spawning Trigger
    if (this.ufoSpawnTimer > 0) {
      this.ufoSpawnTimer -= dt;
      if (this.ufoSpawnTimer <= 0) {
        this.spawnUFO();
      }
    }

    // UFO movement and fire logic
    for (let i = this.ufos.length - 1; i >= 0; i--) {
      const u = this.ufos[i];
      u.x += u.vx * dt;
      u.y += u.vy * dt;

      if (u.x < -100 || u.x > w + 100) {
        this.ufos.splice(i, 1);
        continue;
      }

      if (u.type === 'small') {
        u.lastZigZag += dt;
        if (u.lastZigZag > 60) {
          u.vy = (Math.random() - 0.5) * 3;
          u.lastZigZag = 0;
        }
      }

      if (u.y < 50) u.y = 50;
      if (u.y > h - 160) u.y = h - 160;

      u.fireCooldown -= dt;
      if (u.fireCooldown <= 0) {
        let angle = 0;
        if (u.type === 'large') {
          angle = Math.random() * Math.PI * 2;
          if (Math.random() > 0.4) {
            angle = Math.atan2(this.ship.y - u.y, this.ship.x - u.x) + (Math.random() - 0.5) * 1.0;
          }
        } else {
          angle = Math.atan2(this.ship.y - u.y, this.ship.x - u.x);
        }

        const bSpeed = u.type === 'large' ? 4 : 5.6;
        this.ufoBullets.push({
          x: u.x,
          y: u.y,
          vx: Math.cos(angle) * bSpeed,
          vy: Math.sin(angle) * bSpeed,
          life: 120,
          color: u.color
        });

        GameAudioEngine.getInstance().playSFX('move');
        u.fireCooldown = u.type === 'large' ? 120 + Math.random() * 80 : 70 + Math.random() * 50;
      }
    }

    // UFO Bullets drift and collision
    for (let i = this.ufoBullets.length - 1; i >= 0; i--) {
      const ub = this.ufoBullets[i];
      ub.x = (ub.x + ub.vx * dt + w) % w;
      ub.y = (ub.y + ub.vy * dt + h) % h;
      ub.life--;

      if (ub.life <= 0) {
        this.ufoBullets.splice(i, 1);
        continue;
      }

      if (this.invincibilityFrames <= 0 && !this.isGameOver && this.warpProgress >= 1.0) {
        const dist = Math.hypot(ub.x - this.ship.x, ub.y - this.ship.y);
        if (dist < 15) {
          this.ufoBullets.splice(i, 1);
          this.handlePlayerDamage();
          continue;
        }
      }
    }

    // Player lasers vs UFOs
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      for (let j = this.ufos.length - 1; j >= 0; j--) {
        const u = this.ufos[j];
        if (Math.hypot(b.x - u.x, b.y - u.y) < u.width / 1.5) {
          const isPierce = this.activePowerUps.some(p => p.type === 'piercing');
          if (!isPierce) {
            this.bullets.splice(i, 1);
          }

          this.juice.spawnExplosion(u.x, u.y, { count: 18, color: [u.color, '#ffffff'], sizeRange: [2, 6], speedRange: [2, 5] });
          this.score += u.points;
          this.shotsHitInWave++;
          this.updateHUDAndHeader();

          GameAudioEngine.getInstance().playSFX('clear');
          this.juice.spawnFloatingScore(u.x, u.y, u.points, '#eab308');

          this.spawnPowerUpChance(u.x, u.y, 2.5);
          this.ufos.splice(j, 1);
          break;
        }
      }
    }

    // Ship vs UFO direct collisions
    if (this.invincibilityFrames <= 0 && !this.isGameOver && this.warpProgress >= 1.0) {
      for (let i = this.ufos.length - 1; i >= 0; i--) {
        const u = this.ufos[i];
        if (Math.hypot(u.x - this.ship.x, u.y - this.ship.y) < u.width / 1.5 + 10) {
          this.handlePlayerDamage();
          this.juice.spawnExplosion(u.x, u.y, { count: 18, color: [u.color, '#ffffff'], sizeRange: [2, 6], speedRange: [2, 5] });
          this.ufos.splice(i, 1);
          break;
        }
      }
    }

    // Trigger next wave spawn if sector cleared
    if (this.asteroids.length === 0 && this.waveTransitionTimer === 0) {
      this.startWaveTransition();
    }
  }

  private tick() {
    if (!this.isRunning) return;
    this.juice.update(1.0);
    this.update();
    this.render();
    this.animationFrameId = requestAnimationFrame(this.boundTick);
  }

  private render() {
    const ctx = this.ctx;
    const canvas = this.canvas;
    if (!ctx || !canvas) return;

    // Fill entire raw physical canvas background with starfield vacuum black
    ctx.fillStyle = '#0a0915';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Apply standard camera shakes/transforms from Juice
    this.juice.applyCameraTransforms(ctx, canvas.width, canvas.height);

    const { scale, offsetX, offsetY } = this.getScaleAndOffsets();

    // Now save and apply virtual scaling/translation for game world
    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // Parallax Twinkling Stars Rendering
    for (const s of this.stars) {
      ctx.fillStyle = s.color;
      ctx.globalAlpha = 0.25 + Math.abs(Math.sin(Date.now() * 0.001 * s.speed)) * 0.75;
      ctx.fillRect(s.x, s.y, s.size, s.size);
    }
    ctx.globalAlpha = 1.0;

    // Ship rendering
    if (!this.isGameOver && !this.isPaused) {
      ctx.save();
      ctx.translate(this.ship.x, this.ship.y);
      ctx.rotate(this.ship.angle);

      let drawShip = true;
      if (this.invincibilityFrames > 0) {
        drawShip = Math.floor(this.invincibilityFrames / 6) % 2 === 0;
      }

      if (drawShip) {
        const warpScale = this.warpProgress < 1 ? this.warpProgress : 1.0;
        ctx.scale(warpScale, warpScale);

        // Engine Thrust Flame
        if (this.ship.isThrusting) {
          ctx.strokeStyle = '#f97316';
          ctx.shadowBlur = 8;
          ctx.shadowColor = '#f97316';
          ctx.lineWidth = 2;

          ctx.beginPath();
          ctx.moveTo(-8, 0);
          const flameSize = 15 + Math.sin(Date.now() * 0.1) * 6;
          ctx.lineTo(-8 - flameSize, -4);
          ctx.lineTo(-11, 0);
          ctx.lineTo(-8 - flameSize, 4);
          ctx.closePath();
          ctx.stroke();

          ctx.strokeStyle = '#f59e0b';
          ctx.beginPath();
          ctx.moveTo(-8, 0);
          ctx.lineTo(-8 - flameSize * 0.6, -2);
          ctx.lineTo(-10, 0);
          ctx.lineTo(-8 - flameSize * 0.6, 2);
          ctx.closePath();
          ctx.stroke();

          if (Math.random() < 0.35) {
            this.juice.spawnTrail(
              this.ship.x - Math.cos(this.ship.angle) * 12,
              this.ship.y - Math.sin(this.ship.angle) * 12,
              '#fb923c',
              1.5
            );
          }
        }

        // Ship Hull
        ctx.strokeStyle = '#38bdf8';
        ctx.shadowBlur = 6;
        ctx.shadowColor = '#38bdf8';
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.moveTo(15, 0);
        ctx.lineTo(-12, -10);
        ctx.lineTo(-6, -3);
        ctx.lineTo(-6, 3);
        ctx.lineTo(-12, 10);
        ctx.closePath();
        ctx.stroke();

        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 1.0;
        ctx.beginPath();
        ctx.moveTo(4, 0);
        ctx.lineTo(-4, -4);
        ctx.lineTo(-4, 4);
        ctx.closePath();
        ctx.stroke();
      }

      ctx.restore();

      // Shield Bubble Ring
      const hasShield = this.activePowerUps.some(p => p.type === 'shield');
      if (hasShield && drawShip) {
        ctx.save();
        ctx.translate(this.ship.x, this.ship.y);
        ctx.strokeStyle = '#22d3ee';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#22d3ee';
        ctx.lineWidth = 1.5;

        ctx.beginPath();
        const rBubble = 24 + Math.sin(Date.now() * 0.012) * 1.5;
        ctx.arc(0, 0, rBubble, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(34, 211, 238, 0.22)';
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + Date.now() * 0.001;
          const x = Math.cos(ang) * rBubble;
          const y = Math.sin(ang) * rBubble;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.restore();
      }

      // Warp-In contracting laser animation
      if (this.warpProgress < 1.0) {
        ctx.save();
        ctx.translate(this.ship.x, this.ship.y);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.shadowBlur = 12;
        ctx.shadowColor = '#38bdf8';

        ctx.beginPath();
        const rRing = 100 * (1.0 - this.warpProgress);
        ctx.arc(0, 0, Math.max(5, rRing), 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#06b6d4';
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + this.warpProgress * 3;
          ctx.beginPath();
          ctx.arc(Math.cos(ang) * rRing, Math.sin(ang) * rRing, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.restore();
      }
    }

    // Player lasers rendering
    for (const b of this.bullets) {
      ctx.save();
      ctx.strokeStyle = '#06b6d4';
      ctx.shadowBlur = 6;
      ctx.shadowColor = '#06b6d4';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';

      const spd = Math.hypot(b.vx, b.vy);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - (b.vx / spd) * 12, b.y - (b.vy / spd) * 12);
      ctx.stroke();
      ctx.restore();
    }

    // UFO Lasers rendering
    for (const ub of this.ufoBullets) {
      ctx.save();
      ctx.strokeStyle = '#ef4444';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';

      const spd = Math.hypot(ub.vx, ub.vy);
      ctx.beginPath();
      ctx.moveTo(ub.x, ub.y);
      ctx.lineTo(ub.x - (ub.vx / spd) * 10, ub.y - (ub.vy / spd) * 10);
      ctx.stroke();
      ctx.restore();
    }

    // Jagged Asteroids rendering
    for (const a of this.asteroids) {
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.rotate(a.angle);

      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.type === 'heavy' ? 2.5 : 1.5;

      ctx.shadowBlur = a.type === 'comet' ? 10 : 4;
      ctx.shadowColor = a.color;

      ctx.beginPath();
      if (a.vertices && a.vertices.length > 0) {
        ctx.moveTo(a.vertices[0].x, a.vertices[0].y);
        for (let i = 1; i < a.vertices.length; i++) {
          ctx.lineTo(a.vertices[i].x, a.vertices[i].y);
        }
        ctx.closePath();
      } else {
        ctx.arc(0, 0, a.radius, 0, Math.PI * 2);
      }
      ctx.stroke();

      if (a.type === 'heavy' && a.health < a.maxHealth) {
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-a.radius / 2, 0);
        ctx.lineTo(0, a.radius / 4);
        ctx.lineTo(a.radius / 3, -a.radius / 3);
        ctx.stroke();

        if (a.health === 1) {
          ctx.beginPath();
          ctx.moveTo(0, -a.radius / 2);
          ctx.lineTo(-a.radius / 4, 0);
          ctx.lineTo(a.radius / 2, a.radius / 2);
          ctx.stroke();
        }
      }

      ctx.restore();
    }

    // UFO Enemies rendering
    for (const u of this.ufos) {
      ctx.save();
      ctx.translate(u.x, u.y);

      ctx.shadowBlur = 8;
      ctx.shadowColor = u.color;
      ctx.strokeStyle = u.color;
      ctx.lineWidth = 2;

      const wU = u.width;
      const hU = u.height;

      // Saucer top dome
      ctx.beginPath();
      ctx.arc(0, -hU / 4, wU / 4, Math.PI, 0);
      ctx.stroke();

      // Oval middle hull
      ctx.beginPath();
      ctx.ellipse(0, 0, wU / 2, hU / 2, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Dividing center strip
      ctx.beginPath();
      ctx.moveTo(-wU / 2, 0);
      ctx.lineTo(wU / 2, 0);
      ctx.stroke();

      // Procedural blinking under lights
      ctx.fillStyle = Math.floor(Date.now() / 150) % 2 === 0 ? '#ffffff' : 'rgba(255, 255, 255, 0.2)';
      const numLights = u.type === 'large' ? 5 : 3;
      for (let i = 0; i < numLights; i++) {
        const lx = -wU / 3 + (i / (numLights - 1)) * (2 * wU / 3);
        ctx.beginPath();
        ctx.arc(lx, hU / 6, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    }

    // Floating tactile upgrade bubbles rendering
    for (const p of this.powerUps) {
      ctx.save();
      ctx.translate(p.x, p.y);

      const pulse = 1.0 + Math.sin(p.pulseTime * 2.0) * 0.12;
      ctx.scale(pulse, pulse);

      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;

      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * Math.PI * 2 + p.pulseTime * 0.5;
        const x = Math.cos(ang) * p.radius;
        const y = Math.sin(ang) * p.radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      ctx.beginPath();
      ctx.arc(0, 0, p.radius - 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = 'bold 10px "Space Grotesk", monospace';
      ctx.fillStyle = p.color;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.label, 0, 0);

      ctx.restore();
    }

    // Shockwave Rings rendering
    for (const sw of this.shockwaves) {
      ctx.save();
      ctx.strokeStyle = 'rgba(249, 115, 22, 0.65)';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#f97316';
      ctx.lineWidth = 3 * (1.0 - sw.radius / sw.maxRadius);

      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(253, 186, 116, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, Math.max(2, sw.radius - 15), 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    // Active power-up timers display
    if (this.activePowerUps.length > 0) {
      ctx.save();
      const barW = 100;
      const barH = 5;
      const startX = canvas.width / 2 - barW / 2;
      let startY = 60;

      ctx.font = 'bold 9px "Space Grotesk", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (const ap of this.activePowerUps) {
        const pct = ap.timeLeft / ap.duration;
        let color = '#fff';
        let name = '';

        if (ap.type === 'rapid_fire') { color = '#f59e0b'; name = 'RAPID FIRE'; }
        else if (ap.type === 'triple_shot') { color = '#eab308'; name = 'TRIPLE SHOT'; }
        else if (ap.type === 'shield') { color = '#22d3ee'; name = 'SHIELD'; }
        else if (ap.type === 'piercing') { color = '#10b981'; name = 'PIERCING'; }
        else if (ap.type === 'time_slow') { color = '#a855f7'; name = 'TIME WARP'; }
        else if (ap.type === 'multiplier') { color = '#ec4899'; name = '2X MULTI'; }

        ctx.fillStyle = color;
        ctx.fillText(name, startX - 8, startY + barH / 2);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(startX, startY, barW, barH);

        ctx.fillStyle = color;
        ctx.shadowBlur = 4;
        ctx.shadowColor = color;
        ctx.fillRect(startX, startY, barW * pct, barH);

        startY += 12;
      }
      ctx.restore();
    }

    // Render particles and text inside scaled space
    this.juice.draw(ctx);

    ctx.restore(); // Restore from scaled coordinate system

    // Draw high-contrast clean vector border for the playfield to make boundary visible
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(offsetX, offsetY, this.VIRTUAL_WIDTH * scale, this.VIRTUAL_HEIGHT * scale);

    // Restore camera shake/zoom context
    this.juice.restoreCameraTransforms(ctx);

    // Active power-up timers display (on raw coordinates so it's centered perfectly)
    if (this.activePowerUps.length > 0) {
      ctx.save();
      const barW = 100;
      const barH = 5;
      const startX = canvas.width / 2 - barW / 2;
      let startY = 60;

      ctx.font = 'bold 9px "Space Grotesk", sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      for (const ap of this.activePowerUps) {
        const pct = ap.timeLeft / ap.duration;
        let color = '#fff';
        let name = '';

        if (ap.type === 'rapid_fire') { color = '#f59e0b'; name = 'RAPID FIRE'; }
        else if (ap.type === 'triple_shot') { color = '#eab308'; name = 'TRIPLE SHOT'; }
        else if (ap.type === 'shield') { color = '#22d3ee'; name = 'SHIELD'; }
        else if (ap.type === 'piercing') { color = '#10b981'; name = 'PIERCING'; }
        else if (ap.type === 'time_slow') { color = '#a855f7'; name = 'TIME WARP'; }
        else if (ap.type === 'multiplier') { color = '#ec4899'; name = '2X MULTI'; }

        ctx.fillStyle = color;
        ctx.fillText(name, startX - 8, startY + barH / 2);

        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.fillRect(startX, startY, barW, barH);

        ctx.fillStyle = color;
        ctx.shadowBlur = 4;
        ctx.shadowColor = color;
        ctx.fillRect(startX, startY, barW * pct, barH);

        startY += 12;
      }
      ctx.restore();
    }

    // On-screen modern virtual d-pads rendering (on raw coordinates for precise touch positions)
    const btnSize = 28;
    const isMobile = canvas.width < 768;

    const leftX1 = isMobile ? 55 : canvas.width / 2 - 100;
    const leftY1 = isMobile ? canvas.height - 55 : canvas.height - 45;
    const leftX2 = isMobile ? 125 : canvas.width / 2 - 40;
    const leftY2 = isMobile ? canvas.height - 55 : canvas.height - 45;

    const rightX1 = isMobile ? canvas.width - 125 : canvas.width / 2 + 20;
    const rightY1 = isMobile ? canvas.height - 55 : canvas.height - 45;
    const rightX2 = isMobile ? canvas.width - 55 : canvas.width / 2 + 80;
    const rightY2 = isMobile ? canvas.height - 55 : canvas.height - 45;

    const drawVirtualButton = (x: number, y: number, label: string, active: boolean, accentColor: string) => {
      ctx.save();
      ctx.translate(x, y);

      ctx.fillStyle = active ? 'rgba(255, 255, 255, 0.14)' : 'rgba(255, 255, 255, 0.03)';
      ctx.strokeStyle = active ? accentColor : 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = active ? 2 : 1;

      if (active) {
        ctx.shadowBlur = 8;
        ctx.shadowColor = accentColor;
      }

      ctx.beginPath();
      ctx.arc(0, 0, btnSize, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.strokeStyle = active ? accentColor : 'rgba(255, 255, 255, 0.1)';
      ctx.beginPath();
      ctx.arc(0, 0, btnSize - 6, 0, Math.PI * 2);
      ctx.stroke();

      ctx.font = 'bold 12px "Space Grotesk", sans-serif';
      ctx.fillStyle = active ? '#ffffff' : 'rgba(255, 255, 255, 0.5)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, 0);

      ctx.restore();
    };

    if (isMobile) {
      drawVirtualButton(leftX1, leftY1, '◄', this.virtualControls.left, '#38bdf8');
      drawVirtualButton(leftX2, leftY2, '►', this.virtualControls.right, '#38bdf8');
      drawVirtualButton(rightX1, rightY1, '▲', this.virtualControls.thrust, '#38bdf8');
      drawVirtualButton(rightX2, rightY2, 'FIRE', this.virtualControls.fire, '#ef4444');
    }

    this.juice.restoreCameraTransforms(ctx);
    this.juice.draw(ctx);
  }

  destroy(): void {
    this.isRunning = false;
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
    if (this.canvas) {
      this.canvas.removeEventListener('mousedown', this.boundMouseDown);
      this.canvas.removeEventListener('mousemove', this.boundMouseMove);
      this.canvas.removeEventListener('mouseup', this.boundMouseUp);
      this.canvas.removeEventListener('touchstart', this.boundTouchStart);
      this.canvas.removeEventListener('touchmove', this.boundTouchMove);
      this.canvas.removeEventListener('touchend', this.boundTouchEnd);
      this.canvas.removeEventListener('touchcancel', this.boundTouchEnd);
    }
    window.removeEventListener('resize', this.boundResize);
    window.removeEventListener('keydown', this.boundKeyDown);
    window.removeEventListener('keyup', this.boundKeyUp);

    GameAudioEngine.getInstance().stopBGM();
    this.overlayManager?.destroy();
  }
}
