import Phaser from 'phaser';
import { CameraEffectsManager } from './CameraEffectsManager.js';

export interface IDecal {
  gameObject: Phaser.GameObjects.Graphics | Phaser.GameObjects.Arc;
  type: 'crack' | 'scrape' | 'crater' | 'lava_pool';
  x: number;
  y: number;
  creationTime: number;
  duration: number;
  active: boolean;
}

export class ArenaEffectsManager {
  private static instance: ArenaEffectsManager | null = null;
  private scene!: Phaser.Scene & any;

  // Pools to avoid runtime allocations and garbage collection
  private decalPool: IDecal[] = [];
  private readonly MAX_DECALS = 40;

  // Barrier properties
  private barrierGraphics!: Phaser.GameObjects.Graphics;
  private minX: number = 400;
  private maxX: number = 1200;
  private minY: number = 200;
  private maxY: number = 800;
  private isLocked: boolean = false;
  private bossPhase: number = 1;
  private timer: number = 0;

  private constructor() {}

  public static getInstance(): ArenaEffectsManager {
    if (!ArenaEffectsManager.instance) {
      ArenaEffectsManager.instance = new ArenaEffectsManager();
    }
    return ArenaEffectsManager.instance;
  }

  public init(scene: Phaser.Scene & any): void {
    this.scene = scene;
    this.barrierGraphics = this.scene.add.graphics();
    this.barrierGraphics.setDepth(1); // Below characters, above ground
    this.decalPool = [];
    this.isLocked = false;
    this.bossPhase = 1;
    this.timer = 0;
  }

  public setLockBounds(minX: number, maxX: number, minY: number, maxY: number): void {
    this.minX = minX;
    this.maxX = maxX;
    this.minY = minY;
    this.maxY = maxY;
  }

  public lockArena(): void {
    this.isLocked = true;
  }

  public unlockArena(): void {
    this.isLocked = false;
    this.barrierGraphics.clear();
    
    // Fade out all decals in pool gracefully
    this.decalPool.forEach(decal => {
      if (decal.active && decal.gameObject) {
        this.scene.tweens.add({
          targets: decal.gameObject,
          alpha: 0,
          duration: 500,
          onComplete: () => {
            decal.gameObject.destroy();
            decal.active = false;
          }
        });
      }
    });
  }

  public setBossPhase(phase: number): void {
    this.bossPhase = phase;
  }

  /**
   * Spawns a cracked floor decal at the specified position.
   */
  public spawnCrack(x: number, y: number, radius: number = 35): void {
    const graphics = this.getOrCreateGraphicsDecal('crack', x, y);
    if (!graphics) return;

    graphics.clear();
    graphics.lineStyle(1.5, 0x111111, 0.8);
    
    // Draw jagged crack lines branching outwards from center
    graphics.beginPath();
    const branches = 6;
    for (let i = 0; i < branches; i++) {
      graphics.moveTo(0, 0);
      let curX = 0;
      let curY = 0;
      const angle = (i / branches) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
      const segments = 3;
      const segLength = radius / segments;

      for (let j = 1; j <= segments; j++) {
        const dist = j * segLength;
        const nextX = Math.cos(angle) * dist + Phaser.Math.Between(-6, 6);
        const nextY = Math.sin(angle) * dist + Phaser.Math.Between(-6, 6);
        graphics.lineTo(nextX, nextY);
        curX = nextX;
        curY = nextY;
      }
    }
    graphics.strokePath();
    
    // Add a dark inner core
    graphics.fillStyle(0x0a0a0a, 0.6);
    graphics.fillCircle(0, 0, radius * 0.25);

    this.animateDecalLife(graphics, 12000);

    // Dynamic environmental feedback: dust and sparks on impact
    if (this.scene && this.scene.vfxManager) {
      this.scene.vfxManager.spawnSparks(x, y, 0x555555, 6); // grey dust sparks
    }
    this.spawnDustPuffs(x, y, radius * 0.8, 4);
  }

  /**
   * Spawns linear scrape marks (e.g. Shield Charge)
   */
  public spawnScrape(startX: number, startY: number, endX: number, endY: number, width: number = 24): void {
    const graphics = this.getOrCreateGraphicsDecal('scrape', startX, startY);
    if (!graphics) return;

    graphics.clear();
    graphics.lineStyle(2, 0x18181b, 0.7);
    
    // Draw parallel scrape grooves
    const dx = endX - startX;
    const dy = endY - startY;
    const angle = Math.atan2(dy, dx);
    const length = Math.sqrt(dx * dx + dy * dy);

    graphics.save();
    graphics.rotateCanvas(angle);
    
    const spacing = 6;
    const count = Math.ceil(width / spacing);
    for (let i = -count / 2; i <= count / 2; i++) {
      const offset = i * spacing + Phaser.Math.Between(-2, 2);
      graphics.beginPath();
      graphics.moveTo(0, offset);
      graphics.lineTo(length, offset);
      graphics.strokePath();
    }
    graphics.restore();

    this.animateDecalLife(graphics, 15000);

    // Dust trail along the scrape line
    const midX = (startX + endX) / 2;
    const midY = (startY + endY) / 2;
    this.spawnDustPuffs(startX, startY, width * 0.5, 2);
    this.spawnDustPuffs(midX, midY, width * 0.5, 2);
    this.spawnDustPuffs(endX, endY, width * 0.5, 2);
    if (this.scene && this.scene.vfxManager) {
      this.scene.vfxManager.spawnSparks(midX, midY, 0xffaa00, 4); // scrape sparks!
    }
  }

  /**
   * Spawns a smoking, burning meteor impact crater.
   */
  public spawnCrater(x: number, y: number, radius: number = 40): void {
    const graphics = this.getOrCreateGraphicsDecal('crater', x, y);
    if (!graphics) return;

    graphics.clear();
    // Inner dark burnt region
    graphics.fillStyle(0x18181b, 0.95);
    graphics.fillCircle(0, 0, radius);
    
    // Jagged fiery edge ring
    graphics.lineStyle(3, 0xff5500, 0.95);
    graphics.strokeCircle(0, 0, radius);
    
    graphics.lineStyle(1.5, 0xff9900, 0.6);
    graphics.strokeCircle(0, 0, radius + 4);

    // Some radial cracks
    graphics.lineStyle(1.5, 0x09090b, 0.8);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.3, 0.3);
      graphics.beginPath();
      graphics.moveTo(0, 0);
      graphics.lineTo(Math.cos(angle) * (radius * 1.5), Math.sin(angle) * (radius * 1.5));
      graphics.strokePath();
    }

    this.animateDecalLife(graphics, 20000);

    // Explosive visual feedback
    if (this.scene && this.scene.vfxManager) {
      this.scene.vfxManager.spawnSparks(x, y, 0xff5500, 15); // lava sparks!
    }
    this.spawnDustPuffs(x, y, radius, 6);
  }

  /**
   * Spawns a glowing molten lava pool decal.
   */
  public spawnLavaPool(x: number, y: number, radius: number = 60): void {
    const pool = this.scene.add.circle(x, y, radius, 0xff2200, 0.45);
    pool.setStrokeStyle(2, 0xff5500);
    pool.setDepth(1);

    // Keep reference in our pool for recycling
    this.addDecalToPool({
      gameObject: pool,
      type: 'lava_pool',
      x,
      y,
      creationTime: this.scene.time.now,
      duration: 4800,
      active: true
    });

    // Handle standard glowing tween and evaporation
    this.scene.tweens.add({
      targets: pool,
      alpha: 0.15,
      yoyo: true,
      repeat: 3,
      duration: 1000,
      onComplete: () => {
        this.scene.tweens.add({
          targets: pool,
          alpha: 0,
          scale: 0.1,
          duration: 800,
          onComplete: () => {
            pool.destroy();
          }
        });
      }
    });

    if (this.scene && this.scene.vfxManager) {
      this.scene.vfxManager.spawnSparks(x, y, 0xff3300, 8);
    }
    this.spawnDustPuffs(x, y, radius, 3);
  }

  /**
   * Spawns procedural grey dust puffs that drift and fade away
   */
  private spawnDustPuffs(x: number, y: number, maxDist: number, count: number): void {
    if (!this.scene) return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * maxDist;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;
      const size = Phaser.Math.Between(5, 12);
      
      const puff = this.scene.add.circle(px, py, size, 0x475569, 0.25);
      puff.setDepth(13);
      this.scene.tweens.add({
        targets: puff,
        scale: 2.2,
        alpha: 0,
        x: px + Math.cos(angle) * 15,
        y: py + Math.sin(angle) * 15,
        duration: Phaser.Math.Between(500, 900),
        onComplete: () => puff.destroy()
      });
    }
  }

  /**
   * Main update routine: draws boundaries, renders lightning arcs, sparkles and decals
   */
  public update(time: number, delta: number): void {
    this.timer += delta;
    this.updateDecals(time);

    if (!this.isLocked) return;

    this.barrierGraphics.clear();

    // 1. Draw glowing procedural barrier walls with animated intensity
    const intensity = 0.6 + Math.sin(this.timer / 180) * 0.25 + (this.bossPhase * 0.15);
    const primaryColor = this.bossPhase === 3 ? 0xff0055 : (this.bossPhase === 2 ? 0xff3300 : 0xff1155);
    const outerColor = this.bossPhase === 3 ? 0xff0033 : 0xff3366;

    // Outer glow ring
    this.barrierGraphics.lineStyle(6, outerColor, intensity * 0.35);
    this.barrierGraphics.strokeRect(
      this.minX - 4,
      this.minY - 4,
      (this.maxX - this.minX) + 8,
      (this.maxY - this.minY) + 8
    );

    // Core energy line
    this.barrierGraphics.lineStyle(3, primaryColor, intensity);
    this.barrierGraphics.strokeRect(
      this.minX,
      this.minY,
      this.maxX - this.minX,
      this.maxY - this.minY
    );

    // 2. Animated brightness sparkles rising from the border
    if (Math.random() < (0.12 * this.bossPhase)) {
      this.spawnBarrierParticle();
    }

    // 3. Render electrical lightning arcs creeping along borders
    const arcCount = this.bossPhase === 3 ? 4 : (this.bossPhase === 2 ? 2 : 1);
    this.barrierGraphics.lineStyle(1.5, 0xffffff, 0.8);
    for (let i = 0; i < arcCount; i++) {
      if (Math.random() < 0.25) {
        this.drawRandomElectricalArc();
      }
    }
  }

  private spawnBarrierParticle(): void {
    // Pick a random side of the locked arena rectangle
    const side = Phaser.Math.Between(0, 3);
    let px = 0;
    let py = 0;

    switch (side) {
      case 0: // Top
        px = Phaser.Math.Between(this.minX, this.maxX);
        py = this.minY;
        break;
      case 1: // Right
        px = this.maxX;
        py = Phaser.Math.Between(this.minY, this.maxY);
        break;
      case 2: // Bottom
        px = Phaser.Math.Between(this.minX, this.maxX);
        py = this.maxY;
        break;
      case 3: // Left
        px = this.minX;
        py = Phaser.Math.Between(this.minY, this.maxY);
        break;
    }

    const spark = this.scene.add.circle(px, py, Phaser.Math.Between(2, 4), 0xffffff, 0.9);
    spark.setDepth(16);

    this.scene.tweens.add({
      targets: spark,
      x: px + Phaser.Math.Between(-15, 15),
      y: py - Phaser.Math.Between(15, 45),
      alpha: 0,
      scale: 0.1,
      duration: Phaser.Math.Between(600, 1000),
      onComplete: () => spark.destroy()
    });
  }

  private drawRandomElectricalArc(): void {
    // Choose a random edge segment
    const side = Phaser.Math.Between(0, 3);
    let startX = 0, startY = 0, endX = 0, endY = 0;
    const arcLen = Phaser.Math.Between(40, 120);

    switch (side) {
      case 0: // Top edge
        startX = Phaser.Math.Between(this.minX, this.maxX - arcLen);
        startY = this.minY;
        endX = startX + arcLen;
        endY = startY;
        break;
      case 1: // Right edge
        startX = this.maxX;
        startY = Phaser.Math.Between(this.minY, this.maxY - arcLen);
        endX = startX;
        endY = startY + arcLen;
        break;
      case 2: // Bottom edge
        startX = Phaser.Math.Between(this.minX, this.maxX - arcLen);
        startY = this.maxY;
        endX = startX + arcLen;
        endY = startY;
        break;
      case 3: // Left edge
        startX = this.minX;
        startY = Phaser.Math.Between(this.minY, this.maxY - arcLen);
        endX = startX;
        endY = startY + arcLen;
        break;
    }

    // Draw a lightning jagged line
    const segments = 5;
    let prevX = startX;
    let prevY = startY;

    this.barrierGraphics.beginPath();
    this.barrierGraphics.moveTo(startX, startY);

    for (let j = 1; j < segments; j++) {
      const t = j / segments;
      const baseX = Phaser.Math.Linear(startX, endX, t);
      const baseY = Phaser.Math.Linear(startY, endY, t);
      
      // Jagged displacement perpendicular to line direction
      const displace = Phaser.Math.Between(-8, 8);
      const nextX = side % 2 === 0 ? baseX : baseX + displace;
      const nextY = side % 2 === 0 ? baseY + displace : baseY;

      this.barrierGraphics.lineTo(nextX, nextY);
      prevX = nextX;
      prevY = nextY;
    }
    this.barrierGraphics.lineTo(endX, endY);
    this.barrierGraphics.strokePath();
  }

  private getOrCreateGraphicsDecal(type: 'crack' | 'scrape' | 'crater', x: number, y: number): Phaser.GameObjects.Graphics | null {
    // Recycling old deactivated or oldest active decals to maintain rigid bounds
    let decal: IDecal | null = null;

    const inactiveIndex = this.decalPool.findIndex(d => !d.active);
    if (inactiveIndex !== -1) {
      decal = this.decalPool[inactiveIndex];
      decal.type = type;
      decal.x = x;
      decal.y = y;
      decal.creationTime = this.scene.time.now;
      decal.active = true;
      decal.gameObject.setPosition(x, y);
      decal.gameObject.setAlpha(1);
    } else if (this.decalPool.length >= this.MAX_DECALS) {
      // Dequeue oldest active decal
      const sorted = [...this.decalPool].sort((a, b) => a.creationTime - b.creationTime);
      decal = sorted[0];
      
      // Reset position and properties
      decal.type = type;
      decal.x = x;
      decal.y = y;
      decal.creationTime = this.scene.time.now;
      decal.active = true;
      decal.gameObject.setPosition(x, y);
      decal.gameObject.setAlpha(1);
    } else {
      // Allocate fresh graphics wrapper
      const gObj = this.scene.add.graphics();
      gObj.setDepth(1);
      gObj.setPosition(x, y);

      decal = {
        gameObject: gObj,
        type,
        x,
        y,
        creationTime: this.scene.time.now,
        duration: 10000,
        active: true
      };
      this.decalPool.push(decal);
    }

    return decal.gameObject as Phaser.GameObjects.Graphics;
  }

  private addDecalToPool(decal: IDecal): void {
    if (this.decalPool.length >= this.MAX_DECALS) {
      // Evict oldest decal
      const oldest = this.decalPool.shift();
      if (oldest && oldest.gameObject) {
        oldest.gameObject.destroy();
      }
    }
    this.decalPool.push(decal);
  }

  private animateDecalLife(gameObject: Phaser.GameObjects.GameObject, lifespan: number): void {
    this.scene.tweens.add({
      targets: gameObject,
      alpha: 0,
      delay: lifespan - 1500,
      duration: 1500,
      onComplete: () => {
        const d = this.decalPool.find(item => item.gameObject === gameObject);
        if (d) d.active = false;
        gameObject.destroy();
      }
    });
  }

  private updateDecals(time: number): void {
    // Tick active states of decals in pool
    this.decalPool = this.decalPool.filter(decal => {
      if (!decal.gameObject || !decal.gameObject.active) {
        return false;
      }
      return true;
    });
  }

  public getHazardCount(): number {
    return this.decalPool.filter(d => d.active).length;
  }

  /**
   * Triggers a visual ripple and high-frequency grid-shimmer reaction on the barrier when hit.
   */
  public triggerBarrierHit(hitX: number, hitY: number, side: 'left' | 'right' | 'top' | 'bottom'): void {
    if (!this.isLocked) return;

    // Shake camera slightly on high impact wall crash
    CameraEffectsManager.getInstance().shake(120, 0.005);

    // Increase general barrier glow timer instantly to pulse the entire arena boundary
    this.timer += 200;

    // Spawn a beautiful energy shockwave ripple traveling along that border
    const rippleColor = this.bossPhase === 3 ? 0xff0055 : 0xff3300;
    const ripple = this.scene.add.circle(hitX, hitY, 15, rippleColor, 0.85);
    ripple.setDepth(15);
    
    // Spawn energy spark sprays at hit point
    if (this.scene && this.scene.vfxManager) {
      this.scene.vfxManager.spawnSparks(hitX, hitY, 0xff00ff, 8);
    }

    this.scene.tweens.add({
      targets: ripple,
      scale: 4.5,
      alpha: 0,
      duration: 350,
      onComplete: () => ripple.destroy()
    });

    // Draw high-frequency horizontal/vertical lightning grid shimmer around hit area
    const flashG = this.scene.add.graphics();
    flashG.setDepth(15);
    flashG.lineStyle(2, 0xffffff, 0.95);
    
    flashG.beginPath();
    if (side === 'left' || side === 'right') {
      // Draw vertical grid lines near the hit point
      for (let i = -2; i <= 2; i++) {
        const oy = hitY + i * 20;
        flashG.moveTo(hitX - 10, oy);
        flashG.lineTo(hitX + 10, oy);
      }
    } else {
      // Draw horizontal grid lines near the hit point
      for (let i = -2; i <= 2; i++) {
        const ox = hitX + i * 20;
        flashG.moveTo(ox, hitY - 10);
        flashG.lineTo(ox, hitY + 10);
      }
    }
    flashG.strokePath();

    this.scene.tweens.add({
      targets: flashG,
      alpha: 0,
      duration: 250,
      onComplete: () => flashG.destroy()
    });
  }
}
