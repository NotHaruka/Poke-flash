import Phaser from 'phaser';
import { EventBus } from '../core/EventBus.js';
import { EventTopic } from '../core/Constants.js';
import { BossEntity } from '../entities/BossEntity.js';
import { BossState } from '../entities/components/BossAIComponent.js';
import { PhysicsComponent } from '../entities/PhysicsComponent.js';
import { Logger } from '../utils/Logger.js';
import { ArenaEffectsManager } from './ArenaEffectsManager.js';
import { CameraEffectsManager } from './CameraEffectsManager.js';
import { EnvironmentalEffectsManager } from './EnvironmentalEffectsManager.js';

export class BossEncounterManager {
  private static instance: BossEncounterManager | null = null;
  private logger: Logger;
  private scene!: Phaser.Scene & any; // Cast for GameScene operations
  private activeBoss: BossEntity | null = null;
  private isIntroActive: boolean = false;
  private arenaGraphics!: Phaser.GameObjects.Graphics;
  
  // Save original player boundaries for restoration
  private originalMinX: number = 32;
  private originalMaxX: number = 1568;
  private originalMinY: number = 32;
  private originalMaxY: number = 968;

  // Arena lock bounds
  private lockMinX: number = 32;
  private lockMaxX: number = 2568;
  private lockMinY: number = 32;
  private lockMaxY: number = 1768;

  public getLockMinX(): number { return this.lockMinX; }
  public getLockMaxX(): number { return this.lockMaxX; }
  public getLockMinY(): number { return this.lockMinY; }
  public getLockMaxY(): number { return this.lockMaxY; }

  private constructor() {
    this.logger = new Logger('BossEncounterManager');
  }

  public static getInstance(): BossEncounterManager {
    if (!BossEncounterManager.instance) {
      BossEncounterManager.instance = new BossEncounterManager();
    }
    return BossEncounterManager.instance;
  }

  public init(scene: Phaser.Scene): void {
    this.scene = scene;
    this.arenaGraphics = this.scene.add.graphics();
    this.arenaGraphics.setDepth(1); // Drawn above floor, below characters
    this.reset();
    this.setupListeners();
  }

  public reset(): void {
    this.activeBoss = null;
    this.isIntroActive = false;

    // Hide UI overlays
    const introEl = document.getElementById('bb-boss-intro');
    if (introEl) {
      introEl.style.opacity = '0';
      introEl.style.display = 'none';
    }

    const hudEl = document.getElementById('bb-boss-hud');
    if (hudEl) {
      hudEl.style.opacity = '0';
      hudEl.style.display = 'none';
    }

    if (this.arenaGraphics) {
      this.arenaGraphics.clear();
    }

    ArenaEffectsManager.getInstance().unlockArena();
    EnvironmentalEffectsManager.getInstance().setBossPhase(0);
  }

  private setupListeners(): void {
    const bus = EventBus.getInstance();

    // Clear previous listener bounds first to prevent duplicates
    bus.off(EventTopic.BOSS_STARTED, this.onBossStarted as any, this);
    bus.off(EventTopic.BOSS_DAMAGED, this.onBossDamaged as any, this);
    bus.off(EventTopic.BOSS_PHASE_CHANGED, this.onBossPhaseChanged as any, this);
    bus.off(EventTopic.BOSS_DEFEATED, this.onBossDefeated as any, this);
    bus.off(EventTopic.PLAYER_DIED, this.handlePlayerDied as any, this);

    bus.on(EventTopic.BOSS_STARTED, this.onBossStarted, this);
    bus.on(EventTopic.BOSS_DAMAGED, this.onBossDamaged, this);
    bus.on(EventTopic.BOSS_PHASE_CHANGED, this.onBossPhaseChanged, this);
    bus.on(EventTopic.BOSS_DEFEATED, this.onBossDefeated, this);
    bus.on(EventTopic.PLAYER_DIED, this.handlePlayerDied, this);
  }

  private onBossStarted(data: { boss: BossEntity }): void {
    this.startEncounter(data.boss);
  }

  private onBossDamaged(data: { currentHp: number, maxHp: number }): void {
    this.updateBossHp(data.currentHp, data.maxHp);
  }

  private onBossPhaseChanged(data: { phase: number }): void {
    this.handlePhaseChange(data.phase);
  }

  private onBossDefeated(): void {
    this.handleBossDefeated();
  }

  private handlePlayerDied(): void {
    this.logger.info('Player died during boss encounter, resetting states...');
    this.reset();
  }

  private startEncounter(boss: BossEntity): void {
    this.activeBoss = boss;
    this.logger.info(`Starting boss encounter with ${boss.bossName}`);

    // 1. Pause standard wave director spawning
    this.scene.waveDirector.setTransitioning(true);

    // 1.5 Clear all existing normal enemies so it's a 1v1 fight
    if (this.scene.clearNormalEnemies) {
      this.scene.clearNormalEnemies();
    }

    // 2. Lock the arena
    this.lockArena();

    // 3. Trigger cinematic intro sequence
    this.playIntroSequence();
  }

  private lockArena(): void {
    // Temporarily expand the physical limits of the scene for the boss fight
    this.scene.arenaWidth = 2600;
    this.scene.arenaHeight = 1800;

    // Set camera bounds to the new expanded size
    this.scene.cameras.main.setBounds(0, 0, 2600, 1800);
    if (this.scene.physics && this.scene.physics.world) {
      this.scene.physics.world.setBounds(0, 0, 2600, 1800);
    }

    // Regenerate/draw the giant arena grid and background to cover the full 2600x1800
    if (typeof this.scene.createArenaGrid === 'function') {
      this.scene.createArenaGrid(2600, 1800);
    }

    const playerPhysics = this.scene.playerPhysics;
    if (playerPhysics) {
      // Store original boundaries
      this.originalMinX = (playerPhysics as any).minX;
      this.originalMaxX = (playerPhysics as any).maxX;
      this.originalMinY = (playerPhysics as any).minY;
      this.originalMaxY = (playerPhysics as any).maxY;

      // Lock player inside expanded arena boundaries
      playerPhysics.setBoundaries(this.lockMinX, this.lockMaxX, this.lockMinY, this.lockMaxY);
    }

    // Lock boss boundaries
    const bossPhysics = this.activeBoss?.getComponent<PhysicsComponent>('physics');
    if (bossPhysics) {
      bossPhysics.setBoundaries(this.lockMinX + 16, this.lockMaxX - 16, this.lockMinY + 16, this.lockMaxY - 16);
    }

    // Position player and boss symmetrically in the center of the expanded arena with a fair 600px spacing
    const player = this.scene.player;
    if (player) {
      player.x = 1300;
      player.y = 1200;
      if (player.gameObject && typeof (player.gameObject as any).setPosition === 'function') {
        (player.gameObject as any).setPosition(1300, 1200);
      }
      
      // Instantly position sword sprite
      const weapon = (player as any).getComponent('weapon');
      if (weapon && this.scene.swordSprite) {
        const currentAngle = weapon.getAngle();
        const handleOffset = weapon.handleOffset;
        this.scene.swordSprite.setPosition(
          1300 + Math.cos(currentAngle) * handleOffset,
          1200 + Math.sin(currentAngle) * handleOffset
        );
      }
    }
    if (this.activeBoss) {
      this.activeBoss.x = 1300;
      this.activeBoss.y = 600;
      if (this.activeBoss.gameObject && typeof (this.activeBoss.gameObject as any).setPosition === 'function') {
        (this.activeBoss.gameObject as any).setPosition(1300, 600);
      }
      
      // Instantly synchronize boss shoulders, molten core, eyes, hand, and buster sword positions
      if ((this.activeBoss as any).animationController) {
        (this.activeBoss as any).animationController.update(this.scene.time.now, 16.67, BossState.INTRO);
      }
    }

    // Lock the visual barriers
    ArenaEffectsManager.getInstance().setLockBounds(this.lockMinX, this.lockMaxX, this.lockMinY, this.lockMaxY);
    ArenaEffectsManager.getInstance().lockArena();
    ArenaEffectsManager.getInstance().setBossPhase(this.activeBoss?.currentPhase || 1);
    EnvironmentalEffectsManager.getInstance().setBossPhase(this.activeBoss?.currentPhase || 1);

    // Smooth camera zoom out to 0.85
    this.scene.tweens.add({
      targets: this.scene.cameras.main,
      zoom: 0.85,
      duration: 1200,
      ease: 'Cubic.easeInOut'
    });
  }

  private drawLockedArenaBorders(): void {
    this.arenaGraphics.clear();
    
    // Draw glowing procedural barriers around the lock dimensions
    this.arenaGraphics.lineStyle(4, 0xff3366, 0.85);
    this.arenaGraphics.strokeRect(
      this.lockMinX,
      this.lockMinY,
      this.lockMaxX - this.lockMinX,
      this.lockMaxY - this.lockMinY
    );

    // Add multiple outer glowing rings
    this.arenaGraphics.lineStyle(1.5, 0xff0055, 0.3);
    this.arenaGraphics.strokeRect(
      this.lockMinX - 8,
      this.lockMinY - 8,
      (this.lockMaxX - this.lockMinX) + 16,
      (this.lockMaxY - this.lockMinY) + 16
    );
  }

  private playIntroSequence(): void {
    this.isIntroActive = true;
    this.scene.isPaused = true; // Suspend standard frame updates

    // Show HTML intro overlay
    const introEl = document.getElementById('bb-boss-intro');
    const titleEl = document.getElementById('bb-boss-intro-title');
    const subTitleEl = document.getElementById('bb-boss-intro-subtitle');

    if (introEl && titleEl && subTitleEl) {
      introEl.style.display = 'flex';
      introEl.style.opacity = '1';
      
      titleEl.textContent = this.activeBoss?.bossName || 'THE OVERLORD';
      if (this.activeBoss?.bossName === 'THE FALLEN COLOSSUS') {
        subTitleEl.textContent = 'The Exiled Champion';
      } else {
        subTitleEl.textContent = 'Phase I - Encounter Initiated';
      }

      // Attach click handler for skip
      introEl.onclick = () => this.skipIntro();
    }

    // Listen for Spacebar skip
    this.scene.input.keyboard.once('keydown-SPACE', () => {
      this.skipIntro();
    });

    // Pan camera smoothly to center of locked arena
    this.scene.cameras.main.pan(
      (this.lockMinX + this.lockMaxX) / 2,
      (this.lockMinY + this.lockMaxY) / 2,
      1200,
      'Cubic.easeInOut'
    );

    // Auto timeout intro after 4.5 seconds
    this.scene.time.delayedCall(4500, () => {
      this.skipIntro();
    });
  }

  private skipIntro(): void {
    if (!this.isIntroActive) return;
    this.isIntroActive = false;

    // Remove keyboard listener
    this.scene.input.keyboard.off('keydown-SPACE');

    const introEl = document.getElementById('bb-boss-intro');
    if (introEl) {
      introEl.style.opacity = '0';
      this.scene.time.delayedCall(500, () => {
        introEl.style.display = 'none';
      });
    }

    // Resume standard updates
    this.scene.isPaused = false;

    // Show Boss HUD
    const hudEl = document.getElementById('bb-boss-hud');
    const nameEl = document.getElementById('bb-boss-name');
    const phaseEl = document.getElementById('bb-boss-phase');
    const fillEl = document.getElementById('bb-boss-hp-fill');
    const textEl = document.getElementById('bb-boss-hp-text');

    if (hudEl && nameEl && phaseEl && fillEl && textEl) {
      hudEl.style.display = 'flex';
      hudEl.style.opacity = '1';
      nameEl.textContent = this.activeBoss?.bossName || 'THE OVERLORD';
      phaseEl.textContent = 'PHASE I';
      fillEl.style.width = '100%';
      textEl.textContent = '100%';
    }

    // Start Boss AI State Machine chasing
    const ai = this.activeBoss?.getComponent<any>('ai');
    if (ai) {
      ai.transitionTo(BossState.CHASE);
    }

    this.scene.cameras.main.flash(400, 255, 51, 102, 0.4);
    this.scene.vfxManager.addFloatingWorldText(
      this.activeBoss?.x || 800,
      (this.activeBoss?.y || 500) - 60,
      'FIGHT!',
      '#ff3366'
    );
  }

  private updateBossHp(currentHp: number, maxHp: number): void {
    const fillEl = document.getElementById('bb-boss-hp-fill');
    const textEl = document.getElementById('bb-boss-hp-text');

    if (fillEl && textEl) {
      const pct = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
      fillEl.style.width = `${pct}%`;
      textEl.textContent = `${Math.round(pct)}%`;
    }
  }

  private handlePhaseChange(phase: number): void {
    const phaseEl = document.getElementById('bb-boss-phase');
    if (phaseEl) {
      phaseEl.textContent = `PHASE ${'I'.repeat(phase)}`;
    }

    // Set phase in our effects managers
    ArenaEffectsManager.getInstance().setBossPhase(phase);
    EnvironmentalEffectsManager.getInstance().setBossPhase(phase);

    // Visual flare for phase transition
    this.scene.cameras.main.shake(500, 0.025);
    this.scene.cameras.main.flash(300, 255, 215, 0, 0.5);

    this.scene.vfxManager.addFloatingWorldText(
      this.activeBoss?.x || 800,
      (this.activeBoss?.y || 500) - 70,
      `PHASE ${'I'.repeat(phase)} UNLEASHED`,
      '#ffd700'
    );
  }

  private handleBossDefeated(): void {
    this.logger.info('Boss has fallen! Dispensing rewards...');

    // 1. Play grand death visual effects
    this.playDefeatedCinematic();
  }

  private playDefeatedCinematic(): void {
    const boss = this.activeBoss;
    if (!boss) return;

    // Transition boss to DEFEATED visual state (kneeling, flickering core)
    if (typeof (boss as any).onDefeated === 'function') {
      (boss as any).onDefeated();
    }

    // Play grand cinematic using CameraEffectsManager
    CameraEffectsManager.getInstance().playDeathCinematic(boss.x, boss.y, () => {
      // 2. Hide Boss HUD
      const hudEl = document.getElementById('bb-boss-hud');
      if (hudEl) {
        hudEl.style.opacity = '0';
        this.scene.time.delayedCall(300, () => {
          hudEl.style.display = 'none';
        });
      }

      // 3. Clear arena lock graphics & restore player boundaries
      ArenaEffectsManager.getInstance().unlockArena();
      
      const playerPhysics = this.scene.playerPhysics;
      if (playerPhysics) {
        playerPhysics.setBoundaries(this.originalMinX, this.originalMaxX, this.originalMinY, this.originalMaxY);
      }

      // Restore physical limits of scene back to 1600x1000 standard play
      this.scene.arenaWidth = 1600;
      this.scene.arenaHeight = 1000;
      this.scene.cameras.main.setBounds(0, 0, 1600, 1000);
      if (this.scene.physics && this.scene.physics.world) {
        this.scene.physics.world.setBounds(0, 0, 1600, 1000);
      }

      // Re-render standard 1600x1000 arena background
      if (typeof this.scene.createArenaGrid === 'function') {
        this.scene.createArenaGrid(1600, 1000);
      }

      // 4. Reset camera zoom smoothly back to standard gameplay scale
      CameraEffectsManager.getInstance().zoomTo(1.0, 1000, 'Quad.easeOut');

      // 5. Spawn massive loot drops!
      this.dispenseRewards();

      // Destroy boss entity completely
      boss.destroy();
      this.activeBoss = null;

      // 6. Resume wave director standard spawning
      this.scene.waveDirector.setTransitioning(false);
      this.scene.waveDirector.incrementWave();
      this.scene.spawnWave();
      this.scene.updateHUDValues();
    });

    // Sequential explosion particle sparks during collapsing state
    for (let i = 0; i < 8; i++) {
      this.scene.time.delayedCall(i * 150, () => {
        if (!boss || !boss.active) return;
        const offset = Phaser.Math.Between(-50, 50);
        this.scene.vfxManager.spawnSparks(boss.x + offset, boss.y + offset, 0xff3300, 15);
        this.scene.vfxManager.spawnSparks(boss.x + offset, boss.y + offset, 0xffd700, 12);
      });
    }
  }

  private dispenseRewards(): void {
    if (!this.activeBoss) return;

    const x = this.activeBoss.x;
    const y = this.activeBoss.y;

    // Spawn rich rewards using existing LootManager
    const lootManager = this.scene.lootManager;
    if (lootManager) {
      // Drop a high volume of coins and XP gems
      for (let i = 0; i < 24; i++) {
        const rx = x + Phaser.Math.Between(-60, 60);
        const ry = y + Phaser.Math.Between(-60, 60);
        
        if (Math.random() < 0.6) {
          lootManager.spawnCoin(rx, ry, Phaser.Math.Between(3, 8));
        } else {
          lootManager.spawnXPOrb(rx, ry, Phaser.Math.Between(15, 30));
        }
      }

      // Always drop multiple health droplets for survival recovery
      for (let j = 0; j < 3; j++) {
        const hx = x + Phaser.Math.Between(-30, 30);
        const hy = y + Phaser.Math.Between(-30, 30);
        lootManager.spawnDroplet(hx, hy);
      }
    }

    // Floating success text
    this.scene.vfxManager.createFloatingXPText(x, y - 40, 'BOSS SLAYED!', '#ffd700');
    this.scene.vfxManager.createFloatingXPText(x, y - 10, '+2500 SCORE', '#00ffff');
    
    // Add score
    this.scene.score += 2500;
    this.scene.updateHUDValues();

    EventBus.getInstance().emit(EventTopic.BOSS_REWARD_GRANTED, { bossId: this.activeBoss.id });
  }

  public getActiveBoss(): BossEntity | null {
    return this.activeBoss;
  }
}
