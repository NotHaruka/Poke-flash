import Phaser from 'phaser';
import { EventBus } from '../core/EventBus.js';
import { EventTopic, EntityType } from '../core/Constants.js';
import { BaseEntity } from '../entities/BaseEntity.js';
import { GameScene } from '../scenes/GameScene.js';
import { Logger } from '../utils/Logger.js';

export class MinimapManager {
  private static instance: MinimapManager | null = null;
  private logger: Logger;
  private scene: GameScene | null = null;

  private container: Phaser.GameObjects.Container | null = null;
  private background: Phaser.GameObjects.Graphics | null = null;
  
  private markers: Map<string, Phaser.GameObjects.Shape | Phaser.GameObjects.Graphics> = new Map();
  private markerTargets: Map<string, { x: number, y: number }> = new Map();

  private updateTimer: number = 0;
  private readonly UPDATE_INTERVAL: number = 125; // 125ms refresh frequency

  private isEncounterActive: boolean = false;
  private debugVisible: boolean = true;

  private width: number = 170;
  private height: number = 170;

  private arenaWidth: number = 1600;
  private arenaHeight: number = 1000;

  private constructor() {
    this.logger = new Logger('MinimapManager');
  }

  public static getInstance(): MinimapManager {
    if (!MinimapManager.instance) {
      MinimapManager.instance = new MinimapManager();
    }
    return MinimapManager.instance;
  }

  public init(scene: GameScene, arenaWidth: number, arenaHeight: number): void {
    this.scene = scene;
    this.arenaWidth = arenaWidth;
    this.arenaHeight = arenaHeight;

    // Reset maps and variables to prevent stale state / destroyed object reference leaks from previous session
    this.markers.clear();
    this.markerTargets.clear();
    this.isEncounterActive = false;
    this.updateTimer = 0;

    this.createUI();
    this.setupEvents();
  }

  private createUI(): void {
    if (!this.scene) return;

    // Detect small screens
    const isMobile = window.innerWidth < 768;
    if (isMobile) {
      this.width = 100;
      this.height = 100;
    } else {
      this.width = 170;
      this.height = 170;
    }

    this.container = this.scene.add.container(0, 0);
    this.container.setScrollFactor(0); // Fix to HUD
    this.container.setDepth(999);

    const padding = isMobile ? 12 : 20;
    const cw = this.scene.cameras.main.width;
    const ch = this.scene.cameras.main.height;
    
    if (isMobile) {
      // Top-right corner, below the HUD right panel (which is top: 6px, right: 6px)
      this.container.setPosition(cw - this.width - padding, 65);
    } else {
      // Bottom-right placement
      this.container.setPosition(cw - this.width - padding, ch - this.height - padding);
    }

    // Draw background (Rounded black background, subtle transparency, thin silver border)
    this.background = this.scene.add.graphics();
    this.background.lineStyle(isMobile ? 1.5 : 2, 0xc0c0c0, 0.8);
    this.background.fillStyle(0x000000, 0.65);
    this.background.fillRoundedRect(0, 0, this.width, this.height, isMobile ? 8 : 12);
    this.background.strokeRoundedRect(0, 0, this.width, this.height, isMobile ? 8 : 12);

    // Soft glow
    this.background.lineStyle(isMobile ? 3 : 4, 0xc0c0c0, 0.2);
    this.background.strokeRoundedRect(-2, -2, this.width + 4, this.height + 4, isMobile ? 10 : 14);

    this.container.add(this.background);

    // Register a resize listener to keep the minimap position correct during orientation changes
    this.scene.scale.on('resize', (gameSize: any) => {
      if (this.container) {
        const isMobileNow = window.innerWidth < 768;
        if (isMobileNow) {
          this.width = 100;
          this.height = 100;
        } else {
          this.width = 170;
          this.height = 170;
        }
        const paddingNow = isMobileNow ? 12 : 20;
        const cwNow = gameSize.width;
        const chNow = gameSize.height;
        if (isMobileNow) {
          this.container.setPosition(cwNow - this.width - paddingNow, 65);
        } else {
          this.container.setPosition(cwNow - this.width - paddingNow, chNow - this.height - paddingNow);
        }
      }
    });
  }

  private setupEvents(): void {
    if (!this.scene) return;

    const bus = EventBus.getInstance();
    // Clear any previous subscriptions to prevent duplication/leaks on restarts
    bus.off(EventTopic.BOSS_STARTED, this.onBossEncounterStarted, this);
    bus.off(EventTopic.BOSS_DEFEATED, this.onBossEncounterEnded, this);

    bus.on(EventTopic.BOSS_STARTED, this.onBossEncounterStarted, this);
    bus.on(EventTopic.BOSS_DEFEATED, this.onBossEncounterEnded, this);

    // Debug Mode M toggle
    this.scene.input.keyboard?.on('keydown-M', () => {
      this.debugVisible = !this.debugVisible;
      this.updateVisibility();
    });
  }

  private onBossEncounterStarted(): void {
    this.isEncounterActive = true;
    if (!this.container) return;

    // The minimap should completely disappear... Fade should feel cinematic.
    this.scene!.tweens.add({
      targets: this.container,
      alpha: 0,
      duration: 500,
      ease: 'Sine.easeInOut'
    });
  }

  private onBossEncounterEnded(): void {
    this.isEncounterActive = false;
    if (!this.container) return;

    // After rewards explode... After arena barriers disappear... (approx 2000ms delay)
    this.scene!.time.delayedCall(2000, () => {
      if (!this.isEncounterActive && this.debugVisible) {
        this.scene!.tweens.add({
          targets: this.container,
          alpha: 1,
          duration: 700,
          ease: 'Sine.easeOut'
        });
      }
    });
  }

  private updateVisibility(): void {
    if (!this.container) return;
    if (this.isEncounterActive) {
      this.container.setAlpha(0);
    } else {
      this.container.setAlpha(this.debugVisible ? 1 : 0);
    }
  }

  public update(time: number, delta: number): void {
    if (!this.scene || !this.container) return;

    // Pause minimap updates when arena barriers activate (during encounter)
    if (this.isEncounterActive) return;
    if (!this.debugVisible) return;

    this.updateTimer += delta;
    if (this.updateTimer >= this.UPDATE_INTERVAL) {
      this.updateTimer = 0;
      this.refreshTargets();
    }

    this.interpolateMarkers(delta);
    this.animateSpecialMarkers(time);
  }

  private getMapPos(x: number, y: number): { mx: number, my: number } {
    return {
      mx: Phaser.Math.Clamp((x / this.arenaWidth) * this.width, 0, this.width),
      my: Phaser.Math.Clamp((y / this.arenaHeight) * this.height, 0, this.height)
    };
  }

  private refreshTargets(): void {
    if (!this.scene) return;

    const activeEntities = new Set<string>();

    const player = this.scene.getPlayer();
    if (player && player.active) {
      activeEntities.add(player.id);
      this.updateTarget(player, 'player');
    }

    const enemies = this.scene.getEnemies();
    if (enemies) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e && e.active) {
          activeEntities.add(e.id);
          this.updateTarget(e, 'enemy');
        }
      }
    }

    // Fog Reduction: Destroyed enemies immediately disappear
    for (const [id, marker] of this.markers.entries()) {
      if (!activeEntities.has(id)) {
        if (marker && marker.scene && marker.active) {
          marker.destroy();
        }
        this.markers.delete(id);
        this.markerTargets.delete(id);
      }
    }
  }

  private updateTarget(entity: BaseEntity, type: 'player' | 'enemy'): void {
    const { mx, my } = this.getMapPos(entity.x, entity.y);
    
    if (!this.markers.has(entity.id)) {
      this.createMarker(entity, mx, my, type);
    }

    const target = this.markerTargets.get(entity.id);
    if (target) {
      target.x = mx;
      target.y = my;
    }
  }

  private createMarker(entity: BaseEntity, x: number, y: number, type: 'player' | 'enemy'): void {
    if (!this.scene || !this.container) return;

    let marker: Phaser.GameObjects.Shape | Phaser.GameObjects.Graphics;

    if (type === 'player') {
      // Player: Cyan circle, slight pulse
      marker = this.scene.add.circle(x, y, 4, 0x00ffff);
      marker.setDepth(10); // Player on top
    } else {
      let isElite = false;
      let isBoss = false;
      
      if (entity.id.includes('boss') || entity.getComponent('ai')?.constructor.name === 'BossAIComponent') {
        isBoss = true;
      } else if (entity.id.includes('elite') || entity.id.includes('mini')) {
        isElite = true;
      }

      if (isBoss) {
        // Large animated crimson icon
        marker = this.scene.add.graphics();
        marker.fillStyle(0xdc143c, 1);
        marker.fillTriangle(0, -5, 5, 5, -5, 5);
        marker.setPosition(x, y);
        marker.setDepth(5);
      } else if (isElite) {
        // Orange diamond
        marker = this.scene.add.rectangle(x, y, 5, 5, 0xffa500);
        (marker as Phaser.GameObjects.Rectangle).setAngle(45);
        marker.setDepth(3);
      } else {
        // Small crimson dot
        marker = this.scene.add.circle(x, y, 2, 0xdc143c);
        marker.setDepth(1);
      }
    }

    this.container.add(marker);
    this.markers.set(entity.id, marker);
    this.markerTargets.set(entity.id, { x, y });
  }

  private interpolateMarkers(delta: number): void {
    // Interpolate movement between updates so the minimap remains smooth
    const lerpFactor = 1 - Math.pow(0.01, delta / 1000);

    for (const [id, marker] of this.markers.entries()) {
      const target = this.markerTargets.get(id);
      if (target && marker && marker.scene && marker.active) {
        marker.x += (target.x - marker.x) * lerpFactor;
        marker.y += (target.y - marker.y) * lerpFactor;
      }
    }
  }

  private animateSpecialMarkers(time: number): void {
    const playerMarker = this.scene?.getPlayer() ? this.markers.get(this.scene.getPlayer().id) : undefined;
    if (playerMarker && playerMarker.scene && playerMarker.active && playerMarker instanceof Phaser.GameObjects.Arc) {
      const pulse = 4 + Math.sin(time / 200) * 1.5;
      playerMarker.setRadius(pulse);
    }

    const enemies = this.scene?.getEnemies();
    if (enemies) {
      for (let i = 0; i < enemies.length; i++) {
        const e = enemies[i];
        if (e.id.includes('boss')) {
          const bossMarker = this.markers.get(e.id);
          if (bossMarker && bossMarker.scene && bossMarker.active) {
             const scale = 1 + Math.sin(time / 150) * 0.3;
             bossMarker.setScale(scale);
          }
        }
      }
    }
  }
}

