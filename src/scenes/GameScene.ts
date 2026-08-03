import Phaser from 'phaser';
import { EventBus } from '../core/EventBus.js';
import { CollisionResolver } from '../core/CollisionResolver.js';
import { EventTopic, GLADIATOR_CHARACTERS, GladiatorPreset, WEAPON_PRESETS, WeaponPreset } from '../core/Constants.js';
import { InputManager } from '../managers/InputManager.js';
import { BaseEntity } from '../entities/BaseEntity.js';
import { PhysicsComponent } from '../entities/PhysicsComponent.js';
import { HealthComponent } from '../entities/HealthComponent.js';
import { SaveManager } from '../managers/SaveManager.js';
import { SettingsManager } from '../managers/SettingsManager.js';
import { AudioManager } from '../managers/AudioManager.js';
import { Logger } from '../utils/Logger.js';
import { SceneManager } from '../core/SceneManager.js';

// Phase 2 Integrations
import { WeaponComponent } from '../entities/components/WeaponComponent.js';
import { EnemyAIComponent, EnemyState } from '../entities/components/EnemyAIComponent.js';
import { CombatDirector } from '../directors/CombatDirector.js';
import { WaveDirector } from '../directors/WaveDirector.js';
import { LootManager } from '../managers/LootManager.js';
import { VFXManager } from '../managers/VFXManager.js';

// Phase 4.1 Boss Encounter Framework
import { BossAIComponent, BossState } from '../entities/components/BossAIComponent.js';
import { BossEncounterManager } from '../managers/BossEncounterManager.js';
import { MinimapManager } from '../managers/MinimapManager.js';
import { ColossusBossEntity } from '../entities/ColossusBossEntity.js';
import { CameraEffectsManager } from '../managers/CameraEffectsManager.js';
import { ArenaEffectsManager } from '../managers/ArenaEffectsManager.js';
import { EnvironmentalEffectsManager } from '../managers/EnvironmentalEffectsManager.js';


// Phase 3 Roguelite Progression
import { ModifierComponent } from '../entities/components/ModifierComponent.js';
import { WeaponArtComponent, WeaponArtState, WEAPON_ARTS } from '../entities/components/WeaponArtComponent.js';
import { EliteComponent, EliteAbilityState } from '../entities/components/EliteComponent.js';
import { generateUpgradeChoices, ALL_UPGRADES, UpgradeRarity, RARITY_CONFIGS, UpgradeDefinition } from '../core/Upgrades.js';

class AstralBladeEntity extends BaseEntity {
  public playerModifiers: any;
  constructor(id: string, x: number, y: number, playerModifiers: any) {
    super(id);
    this.x = x;
    this.y = y;
    this.playerModifiers = playerModifiers;
  }
  public override getComponent<T extends any>(name: string): T | undefined {
    if (name === 'modifiers') {
      return this.playerModifiers as T;
    }
    return super.getComponent(name) as T | undefined;
  }
}

export class GameScene extends Phaser.Scene {
  public isSandboxMode = false;
  protected logger: Logger;
  private inputManager!: InputManager;

  // Player & Equipment
  protected player!: BaseEntity;
  protected playerPhysics!: PhysicsComponent;
  protected playerHealth!: HealthComponent;
  private selectedGladiator!: GladiatorPreset;
  protected selectedWeaponId: string = 'longsword';

  private swordSprite!: Phaser.GameObjects.Sprite;
  private offhandSwordSprite?: Phaser.GameObjects.Sprite;
  private offhand2SwordSprite?: Phaser.GameObjects.Sprite;
  private offhand3SwordSprite?: Phaser.GameObjects.Sprite;
  private activeBurns: Map<string, { entity: BaseEntity, nextDamageTime: number, expiresAt: number, stacks: { expiresAt: number, damage?: number }[] }> = new Map();
  private activeAshFields: { circle: Phaser.GameObjects.Arc, border: Phaser.GameObjects.Graphics, x: number, y: number, radius: number, expiresAt: number, nextDamageTime: number }[] = [];
  private slashTrailGraphics!: Phaser.GameObjects.Graphics;

  // Dodge State variables
  private isDodging: boolean = false;
  private dodgeDuration: number = 250; // milliseconds
  private dodgeTimer: number = 0;
  private dodgeCooldown: number = 0;
  private maxDodgeCooldown: number = 800; // milliseconds
  private dodgeDirectionX: number = 0;
  private dodgeDirectionY: number = 0;

  // Rage & Bedlam Mode
  private bedlamRage: number = 0;
  private isBedlamMode: boolean = false;
  private bedlamDuration: number = 6000; // 6 seconds
  private bedlamTimer: number = 0;

  // Game Statistics & Roguelite Progression
  protected score: number = 0;
  private waveDirector!: WaveDirector;
  private lootManager!: LootManager;
  protected vfxManager!: VFXManager;
  protected collectedGold: number = 0;
  protected playerLevel: number = 1;
  protected playerXP: number = 0;
  protected playerXPNeeded: number = 50;

  // Lifetime Stats for End-Run Bento Dashboard
  private statsDamageDealt: number = 0;
  private statsBeastsSlain: number = 0;
  private statsCrits: number = 0;
  private statsMaxLevel: number = 1;
  protected chosenUpgradesList: UpgradeDefinition[] = [];
  protected excludedUpgrades: Set<string> = new Set();
  protected initialUpgradesToApply: any[] = [];
  protected initialHpToSet: number | null = null;
  
  // Upgrade choices & keys state
  private activeUpgradeChoices: UpgradeDefinition[] = [];
  private upgradeKeysActive: boolean = false;
  private activeMerchantItems: { upgrade: UpgradeDefinition; price: number; currentTier: number; maxTier: number }[] = [];

  // Projectile active arrays
  private activeBullets: Phaser.GameObjects.Sprite[] = [];
  private activeBoomerangs: Phaser.GameObjects.Sprite[] = [];

  // Starbound Sentinel companion
  private hasSentinel: boolean = false;
  private sentinelSprites: Phaser.GameObjects.Sprite[] = [];
  private sentinelShootCooldown: number = 0;

  // Dash roll hits
  private dashHitEnemies: Set<string> = new Set();

  // --- LEGENDARY UPGRADES STATE ---
  // 1. Blood Moon Frenzy
  private bloodMoonFrenzyStacks: number = 0;
  private bloodMoonFrenzyTimers: number[] = [];
  private bloodMoonAuraGraphics?: Phaser.GameObjects.Graphics;

  // 3. Blade Cyclone
  private bladeCycloneHits: number = 0;
  private bladeCycloneActiveTimer: number = 0;
  private bladeCycloneGraphics?: Phaser.GameObjects.Graphics;
  private bladeCycloneAngle: number = 0;
  private bladeCycloneHitCooldowns: Map<string, number> = new Map();

  // 6. Void Rift
  private voidRiftKills: number = 0;
  private activeVoidRifts: { circle: Phaser.GameObjects.Arc, gravityGraphics: Phaser.GameObjects.Graphics, x: number, y: number, expiresAt: number, nextDamageTime: number }[] = [];

  // 12. Elite Modifiers
  private activeElitePuddles: { circle: Phaser.GameObjects.Arc, border?: Phaser.GameObjects.Graphics, type: 'fire' | 'ice', x: number, y: number, radius: number, expiresAt: number, nextDamageTime: number, isExploding?: boolean }[] = [];
  private activeEliteProjectiles: { sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Arc, type: 'flame_arrow' | 'blood_orb' | 'frost_pulse' | 'shockwave' | 'fire' | 'ice', vx: number, vy: number, damage: number, owner?: any, expiresAt: number, radius?: number, scaleUp?: boolean, maxScale?: number }[] = [];

  // 8. Falcon Dive
  private falconDivedEnemies: Set<string> = new Set();

  // 10. Soul Collector
  private soulCollectorKills: number = 0;
  private soulCollectorVelocityBonus: number = 0;

  // Audit properties for legendaries
  private explosionCount: number = 0;
  private lastLightningTargets: string[] = [];

  // Legendary Upgrade variables
  private companionStar?: Phaser.GameObjects.Arc;
  private companionAngle: number = 0;
  private lastCompanionFireTime: number = 0;
  private timeSlowTimer: number = 0;
  private bulletGroup!: Phaser.GameObjects.Group;
  private boomerangGroup!: Phaser.GameObjects.Group;

  // Lists
  protected enemies: BaseEntity[] = [];
  protected isUpgradeOverlayActive: boolean = false;
  
  
  
  private particleGroup!: Phaser.GameObjects.Group;

  // Game Loop Helpers
  protected isPaused: boolean = false;
  private boundSelectUpgrade: any = null;
  private boundPostWaveContinue: any = null;
  private boundPostWaveVisitMerchant: any = null;
  private boundLeaveMerchantShop: any = null;
  private boundLeaveMerchantAndStartWave: any = null;
  private boundBuyMerchantUpgrade: any = null;
  private boundTogglePauseGameFromUI: any = null;
  private boundQuitGameRun: any = null;
  private hitstopDuration: number = 0; // Hitstop freeze frames
  private astralBlades: {
    entity: BaseEntity;
    targetId: string | null;
    state: 'idle' | 'dash' | 'orbit_attack' | 'slice' | 'boomerang';
    stateTimer: number;
    orbitAngle: number;
    lastAttackTime: number;
    attackCount: number;
    sliceDirX?: number;
    sliceDirY?: number;
    boomerangPhase?: 'out' | 'back';
    boomerangBaseX?: number;
    boomerangBaseY?: number;
    boomerangDirX?: number;
    boomerangDirY?: number;
    boomerangTimer: number;
  }[] | null = null;
  

  private isTransitioning: boolean = false;
  
  // Camera State variables (Phase 2)
  private cameraX: number = 0;
  private cameraY: number = 0;
  private cameraSmoothing: number = 0.08;   // Lerp coefficient
  private lookAheadFactor: number = 0.12;   // Mouse look-ahead bias
  private deadZoneRadius: number = 25;      // Pixel tolerance radius
  private cameraImpulseX: number = 0;       // Strike impulses
  private cameraImpulseY: number = 0;
  protected arenaWidth: number = 1600;        // Large physical colosseum bounds
  protected arenaHeight: number = 1000;
  private arenaGridGraphics!: Phaser.GameObjects.Graphics;

  // Debugger overlays (Phase 2)
  private isDebugMode: boolean = false;
  private debugGraphics!: Phaser.GameObjects.Graphics;
  private fpsText!: Phaser.GameObjects.Text;

  constructor(config: Phaser.Types.Scenes.SettingsConfig = { key: 'GameScene' }) {
    super(config);
    console.log(`DEBUG: GameScene constructor called with key: ${config.key}`);
    this.logger = new Logger(config.key || 'GameScene');
  }

  public init(data?: {
    gladiatorIndex?: number,
    weaponClass?: string,
    wave?: number,
    gold?: number,
    hp?: number,
    maxHp?: number,
    score?: number,
    playerLevel?: number,
    playerXP?: number,
    playerXPNeeded?: number,
    chosenUpgradesList?: any[],
    excludedUpgrades?: string[]
  }): void {
    if (!this.waveDirector) this.waveDirector = new WaveDirector();
    if (!this.lootManager) this.lootManager = new LootManager(this);
    if (!this.vfxManager) this.vfxManager = new VFXManager(this);
    const index = data && data.gladiatorIndex !== undefined ? data.gladiatorIndex : 0;
    this.selectedGladiator = GLADIATOR_CHARACTERS[index] || GLADIATOR_CHARACTERS[0];
    this.selectedWeaponId = data && data.weaponClass !== undefined ? data.weaponClass : 'longsword';
    this.logger.info(`Entering arena with champion: ${this.selectedGladiator.name}, Weapon: ${this.selectedWeaponId}`);
    this.score = data && data.score !== undefined ? data.score : 0;
    this.waveDirector.reset();
    if (data && data.wave !== undefined) {
      this.waveDirector.setWaveNumber(data.wave);
    }
    this.lootManager.cleanup();
    this.collectedGold = data && data.gold !== undefined ? data.gold : 0;
    this.bedlamRage = 0;
    this.isBedlamMode = false;
    this.enemies = [];
    this.activeElitePuddles = [];
    this.activeEliteProjectiles = [];
    
    
    
    this.isPaused = false;
    this.isTransitioning = false;
    
    this.cameraX = this.arenaWidth / 2;
    this.cameraY = this.arenaHeight / 2;
    this.cameraImpulseX = 0;
    this.cameraImpulseY = 0;
    this.isDebugMode = false;

    // Reset Leveling system
    this.playerLevel = data && data.playerLevel !== undefined ? data.playerLevel : 1;
    this.playerXP = data && data.playerXP !== undefined ? data.playerXP : 0;
    this.playerXPNeeded = data && data.playerXPNeeded !== undefined ? data.playerXPNeeded : 50;

    // Reset Lifetime Stats
    this.statsDamageDealt = 0;
    this.statsBeastsSlain = 0;
    this.statsCrits = 0;
    this.statsMaxLevel = 1;
    this.chosenUpgradesList = [];
    this.excludedUpgrades = new Set(data && data.excludedUpgrades ? data.excludedUpgrades : []);

    // Store restore state
    this.initialUpgradesToApply = data && data.chosenUpgradesList ? data.chosenUpgradesList : [];
    this.initialHpToSet = data && data.hp !== undefined ? data.hp : null;

    // Reset timed effects
    this.timeSlowTimer = 0;
    this.explosionCount = 0;
    this.lastLightningTargets = [];

    // Reset projectiles and companions
    this.activeBullets = [];
    this.activeBoomerangs = [];
    this.hasSentinel = false;
    this.sentinelSprites.forEach(s => s.destroy());
    this.sentinelSprites = [];

    // Reset status tracking and offhand weapon sprites
    this.activeBurns = new Map();
    this.activeAshFields = [];
    this.offhandSwordSprite = undefined;
    this.offhand2SwordSprite = undefined;
    this.offhand3SwordSprite = undefined;

    // Reset Legendary Upgrades
    this.bloodMoonFrenzyStacks = 0;
    this.bloodMoonFrenzyTimers = [];
    this.bloodMoonAuraGraphics = undefined;

    this.bladeCycloneHits = 0;
    this.bladeCycloneActiveTimer = 0;
    this.bladeCycloneGraphics = undefined;
    this.bladeCycloneAngle = 0;
    this.bladeCycloneHitCooldowns.clear();

    this.voidRiftKills = 0;
    this.activeVoidRifts = [];

    this.falconDivedEnemies.clear();

    this.soulCollectorKills = 0;
    this.soulCollectorVelocityBonus = 0;
    this.activeMerchantItems = [];

    // Sync HTML Overlays
    const hud = document.getElementById('bb-gameplay-hud');
    if (hud) hud.style.display = 'flex';
    this.setMobileControlsVisible(true);

    const upgradeOverlay = document.getElementById('bb-upgrade-overlay');
    if (upgradeOverlay) upgradeOverlay.style.display = 'none';

    const postWaveOverlay = document.getElementById('bb-post-wave-overlay');
    if (postWaveOverlay) postWaveOverlay.style.display = 'none';

    const merchantOverlay = document.getElementById('bb-merchant-overlay');
    if (merchantOverlay) merchantOverlay.style.display = 'none';

    const gameoverOverlay = document.getElementById('bb-gameover-overlay');
    if (gameoverOverlay) gameoverOverlay.style.display = 'none';

    // Reset Combat Director tokens
    CombatDirector.getInstance().reset();
  }

  public create(): void {
    // Register shutdown/destroy handlers so Phaser automatically cleans up our state and EventBus
    this.events.once('shutdown', () => this.shutdown());
    this.events.once('destroy', () => this.shutdown());

    // Bind global pause-related actions for HTML overlays onclick calls
    this.boundTogglePauseGameFromUI = () => {
      this.togglePauseGame();
    };
    (window as any).togglePauseGameFromUI = this.boundTogglePauseGameFromUI;

    this.boundQuitGameRun = () => {
      this.logger.info('Quitting game run / sandbox, returning to FlashTrainer...');
      
      const devPrompt = document.getElementById('dev-prompt');
      if (devPrompt) devPrompt.remove();

      const prevPanel = (window as any).previousPanel || 'study';
      try {
        (window as any).showPanel(prevPanel, null);
      } catch (e) {
        this.logger.error('Failed to return to FlashTrainer panel:', e);
      }
    };
    (window as any).quitGameRun = this.boundQuitGameRun;

    // ESC: Toggle Pause Menu (non-sandbox / sandbox)
    this.input.keyboard?.on('keydown-ESC', () => {
      this.logger.info('ESC pressed - toggling pause menu...');
      this.togglePauseGame();
    });
    
    // Bind global upgrade selection function for HTML overlay onclick calls
    this.boundSelectUpgrade = (index: number) => {
      if (this.upgradeKeysActive) {
        this.applyUpgradeSelection(index);
      }
    };
    (window as any).selectUpgrade = this.boundSelectUpgrade;

    (window as any).resetWeaponArtCooldown = () => {
      const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
      if (weaponArt) {
        weaponArt.currentState = WeaponArtState.READY;
        weaponArt.cooldownTimer = 0;
        weaponArt.stateTimer = 0;
        weaponArt.stamina = weaponArt.maxStamina;
        weaponArt.resetTelemetry();
        this.logger.info('Developer Reset Cooldown and Telemetry triggered.');
      }
    };

    (window as any).toggleInfiniteStamina = (cb: HTMLInputElement) => {
      const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
      if (weaponArt) {
        weaponArt.infiniteStamina = cb.checked;
        this.logger.info(`Developer Infinite Stamina set to ${cb.checked}`);
      }
    };

    (window as any).changeWeaponArtClass = (select: HTMLSelectElement) => {
      const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
      if (weaponArt) {
        weaponArt.setWeaponClass(select.value);
        this.logger.info(`Weapon Class changed to ${select.value}`);
      }
    };

    (window as any).forceWeaponArt = (weaponId: string) => {
      const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
      if (weaponArt) {
        weaponArt.setWeaponClass(weaponId);
        weaponArt.trigger();
        this.logger.info(`Developer Forced Weapon Art: ${weaponId}`);
        const sel = document.getElementById('bb-dev-select-weapon') as HTMLSelectElement | null;
        if (sel) sel.value = weaponId;
      }
    };

    this.boundPostWaveContinue = () => {
      const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
      const goldGainMult = modifiers ? modifiers.getModifiedValue('goldGain', 1.0) : 1.0;
      const xpGainMult = modifiers ? modifiers.getModifiedValue('xpGain', 1.0) : 1.0;
      this.lootManager.collectAllInstantly(goldGainMult, xpGainMult);
      this.startNextWaveTransition();
    };
    (window as any).postWaveContinue = this.boundPostWaveContinue;

    this.boundPostWaveVisitMerchant = () => {
      if (this.isTransitioning) return;
      this.isTransitioning = true;
      
      // Collect all active loot instantly
      const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
      const goldGainMult = modifiers ? modifiers.getModifiedValue('goldGain', 1.0) : 1.0;
      const xpGainMult = modifiers ? modifiers.getModifiedValue('xpGain', 1.0) : 1.0;
      this.lootManager.collectAllInstantly(goldGainMult, xpGainMult);
      
      const postWaveOverlay = document.getElementById('bb-post-wave-overlay');
      if (postWaveOverlay) postWaveOverlay.style.display = 'none';
      
      const gladiatorIndex = GLADIATOR_CHARACTERS.findIndex(g => g.id === this.selectedGladiator.id);
      const data = {
        gladiatorIndex: gladiatorIndex >= 0 ? gladiatorIndex : 0,
        wave: this.waveDirector.getWaveNumber(),
        gold: this.collectedGold,
        hp: this.playerHealth.getHp(),
        maxHp: this.playerHealth.getMaxHp(),
        score: this.score,
        playerLevel: this.playerLevel,
        playerXP: this.playerXP,
        playerXPNeeded: this.playerXPNeeded,
        weaponClass: this.selectedWeaponId,
        chosenUpgradesList: [...this.chosenUpgradesList],
        excludedUpgrades: Array.from(this.excludedUpgrades)
      };

      // Play camera fade out
      this.cameras.main.fadeOut(1000, 0, 0, 0);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        SceneManager.getInstance().transitionToScene('ColosseumOutpostScene', data);
      });
    };
    (window as any).postWaveVisitMerchant = this.boundPostWaveVisitMerchant;

    this.boundLeaveMerchantShop = () => {
      this.startNextWaveTransition();
    };
    (window as any).leaveMerchantShop = this.boundLeaveMerchantShop;

    this.boundLeaveMerchantAndStartWave = () => {
      this.startNextWaveTransition();
    };
    (window as any).leaveMerchantAndStartWave = this.boundLeaveMerchantAndStartWave;

    this.boundBuyMerchantUpgrade = (index: number) => {
      this.buyMerchantUpgrade(index);
    };
    (window as any).buyMerchantUpgrade = this.boundBuyMerchantUpgrade;

    // 1. Initialize Core Systems (ECS, EventBus, Physics, Camera, Rendering, Player, Weapons, Collision, AI, Upgrade Manager, Boss Framework)
    this.initializeCoreSystems();

    // 2. Route modes correctly without letting unneeded systems start
    if (this.isSandboxMode) {
      this.initializeSandboxSystems();
    } else {
      this.initializeGameplaySystems();
    }
    
    this.setupMobileTouchControls();
  }

  public togglePauseGame(): void {
    // If we are in game over, upgrades, or transition overlay, don't allow pausing
    const gameOverOverlay = document.getElementById('bb-gameover-overlay');
    const upgradeOverlay = document.getElementById('bb-upgrade-overlay');
    const merchantOverlay = document.getElementById('bb-merchant-overlay');
    if (
      (gameOverOverlay && gameOverOverlay.style.display === 'flex') ||
      (upgradeOverlay && upgradeOverlay.style.display === 'flex') ||
      (merchantOverlay && merchantOverlay.style.display === 'flex')
    ) {
      return;
    }

    this.isPaused = !this.isPaused;
    const pauseOverlay = document.getElementById('bb-pause-overlay');

    if (this.isPaused) {
      this.physics.pause();
      this.setMobileControlsVisible(false);
      
      // Update the pause sound button text & icon
      const soundBtn = document.getElementById('bb-pause-sound-btn');
      if (soundBtn) {
        const settings = SettingsManager.getInstance();
        const soundEnabled = settings.getSettings().soundEnabled;
        if (soundEnabled) {
          soundBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
            <span>Sound: On</span>
          `;
        } else {
          soundBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
            <span>Sound: Muted</span>
          `;
        }
      }

      // Update the pause quit button text & icon based on Sandbox Mode
      const quitText = document.getElementById('bb-pause-quit-text');
      if (quitText) {
        quitText.textContent = this.isSandboxMode ? 'Quit Sandbox' : 'Quit Current Run';
      }

      if (pauseOverlay) {
        pauseOverlay.style.display = 'flex';
      }
    } else {
      this.physics.resume();
      this.setMobileControlsVisible(true);
      if (pauseOverlay) {
        pauseOverlay.style.display = 'none';
      }
      // Hide controls helper panel if it was open
      const controlsPanel = document.getElementById('bb-pause-controls-panel');
      if (controlsPanel) controlsPanel.style.display = 'none';
    }
  }

  private setMobileControlsVisible(visible: boolean): void {
    const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const overlay = document.getElementById('bb-mobile-controls');
    if (overlay) {
      if (isTouchDevice && visible) {
        overlay.style.display = 'block';
        overlay.style.pointerEvents = 'auto';
      } else {
        overlay.style.display = 'none';
      }
    }
  }

  private setupMobileTouchControls(): void {
    const mobileInput = {
      moveX: 0,
      moveY: 0,
      aimX: 0,
      aimY: 0,
      isDodgePressed: false,
      isAttackJustPressed: false,
      isAttackPressed: false
    };
    (window as any).mobileTouchInput = mobileInput;

    const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const overlay = document.getElementById('bb-mobile-controls');
    if (!overlay) return;

    if (isTouchDevice) {
      overlay.style.display = 'block';
    } else {
      overlay.style.display = 'none';
      return;
    }

    const joystickZone = document.getElementById('bb-joystick-zone');
    const joystickKnob = document.getElementById('bb-joystick-knob');
    if (joystickZone && joystickKnob) {
      let activeTouchId: number | null = null;
      let startX = 0;
      let startY = 0;
      const maxDistance = 50;

      const handleStart = (e: TouchEvent) => {
        if (activeTouchId !== null) return;
        const rect = joystickZone.getBoundingClientRect();
        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };

        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          const dist = Phaser.Math.Distance.Between(center.x, center.y, t.clientX, t.clientY);
          if (dist < rect.width / 2 + 30) {
            activeTouchId = t.identifier;
            startX = center.x;
            startY = center.y;
            break;
          }
        }
      };

      const handleMove = (e: TouchEvent) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          if (t.identifier === activeTouchId) {
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const moveDistance = Math.min(dist, maxDistance);

            const knobX = Math.cos(angle) * moveDistance;
            const knobY = Math.sin(angle) * moveDistance;
            joystickKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

            const magnitude = moveDistance / maxDistance;
            mobileInput.moveX = Math.cos(angle) * magnitude;
            mobileInput.moveY = Math.sin(angle) * magnitude;
            break;
          }
        }
      };

      const handleEnd = (e: TouchEvent) => {
        if (activeTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === activeTouchId) {
            joystickKnob.style.transform = 'translate(0px, 0px)';
            mobileInput.moveX = 0;
            mobileInput.moveY = 0;
            activeTouchId = null;
            break;
          }
        }
      };

      joystickZone.addEventListener('touchstart', handleStart, { passive: true });
      joystickZone.addEventListener('touchmove', handleMove, { passive: true });
      joystickZone.addEventListener('touchend', handleEnd, { passive: true });
      joystickZone.addEventListener('touchcancel', handleEnd, { passive: true });
    }

    // Right joystick for rotation/aiming
    const joystickRightZone = document.getElementById('bb-joystick-right-zone');
    const joystickRightKnob = document.getElementById('bb-joystick-right-knob');
    if (joystickRightZone && joystickRightKnob) {
      let activeRightTouchId: number | null = null;
      let startX = 0;
      let startY = 0;
      const maxDistance = 50;

      const handleStart = (e: TouchEvent) => {
        if (activeRightTouchId !== null) return;
        const rect = joystickRightZone.getBoundingClientRect();
        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };

        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          const dist = Phaser.Math.Distance.Between(center.x, center.y, t.clientX, t.clientY);
          if (dist < rect.width / 2 + 30) {
            activeRightTouchId = t.identifier;
            startX = center.x;
            startY = center.y;
            break;
          }
        }
      };

      const handleMove = (e: TouchEvent) => {
        if (activeRightTouchId === null) return;
        for (let i = 0; i < e.touches.length; i++) {
          const t = e.touches[i];
          if (t.identifier === activeRightTouchId) {
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx);
            const moveDistance = Math.min(dist, maxDistance);

            const knobX = Math.cos(angle) * moveDistance;
            const knobY = Math.sin(angle) * moveDistance;
            joystickRightKnob.style.transform = `translate(${knobX}px, ${knobY}px)`;

            const magnitude = moveDistance / maxDistance;
            mobileInput.aimX = Math.cos(angle) * magnitude;
            mobileInput.aimY = Math.sin(angle) * magnitude;
            break;
          }
        }
      };

      const handleEnd = (e: TouchEvent) => {
        if (activeRightTouchId === null) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === activeRightTouchId) {
            joystickRightKnob.style.transform = 'translate(0px, 0px)';
            mobileInput.aimX = 0;
            mobileInput.aimY = 0;
            activeRightTouchId = null;
            break;
          }
        }
      };

      joystickRightZone.addEventListener('touchstart', handleStart, { passive: true });
      joystickRightZone.addEventListener('touchmove', handleMove, { passive: true });
      joystickRightZone.addEventListener('touchend', handleEnd, { passive: true });
      joystickRightZone.addEventListener('touchcancel', handleEnd, { passive: true });
    }

    const btnDodge = document.getElementById('bb-mobile-btn-dodge');
    if (btnDodge) {
      btnDodge.addEventListener('touchstart', (e) => {
        e.preventDefault();
        mobileInput.isDodgePressed = true;
        btnDodge.style.background = 'rgba(148, 163, 184, 0.4)';
      }, { passive: false });
      btnDodge.addEventListener('touchend', (e) => {
        e.preventDefault();
        btnDodge.style.background = 'rgba(15, 23, 42, 0.75)';
      }, { passive: false });
    }

    const btnSlash = document.getElementById('bb-mobile-btn-slash');
    if (btnSlash) {
      btnSlash.addEventListener('touchstart', (e) => {
        e.preventDefault();
        mobileInput.isAttackJustPressed = true;
        mobileInput.isAttackPressed = true;
        btnSlash.style.transform = 'scale(0.9)';
      }, { passive: false });
      btnSlash.addEventListener('touchend', (e) => {
        e.preventDefault();
        mobileInput.isAttackPressed = false;
        btnSlash.style.transform = 'scale(1.0)';
      }, { passive: false });
    }

    const btnInteract = document.getElementById('bb-mobile-btn-interact');
    if (btnInteract) {
      let lastInteractTime = 0;
      const handleInteractTrigger = (e: Event) => {
        e.preventDefault();
        const now = Date.now();
        if (now - lastInteractTime < 400) return;
        lastInteractTime = now;

        btnInteract.style.transform = 'scale(0.9)';
        setTimeout(() => {
          btnInteract.style.transform = '';
        }, 80);

        const activeScene = this as any;
        if (activeScene && typeof activeScene.currentInteractionAction === 'function') {
          activeScene.currentInteractionAction();
        } else if (activeScene && activeScene.scene) {
          const outpost = activeScene.scene.get('ColosseumOutpostScene') as any;
          if (outpost && outpost.currentInteractionAction) {
            outpost.currentInteractionAction();
          }
        }
      };

      btnInteract.addEventListener('touchstart', handleInteractTrigger, { passive: false });
      btnInteract.addEventListener('click', handleInteractTrigger);
    }
  }

  /**
   * Initializes core engine modules (ECS, EventBus, Input, Physics, Camera, Rendering,
   * Player, Weapons, Collisions, Boss Framework, and Character Systems).
   */
  public initializeCoreSystems(): void {
    const width = this.arenaWidth;
    const height = this.arenaHeight;

    // 1. Draw Arena Background (Grid Floor)
    this.createArenaGrid(width, height);

    // 2. Set up event bus bindings
    this.setupEvents();

    // 3. Initialize Input Manager
    this.inputManager = new InputManager(this);

    // Initialize custom Phase 4.2 effects managers
    CameraEffectsManager.getInstance().init(this);
    ArenaEffectsManager.getInstance().init(this);
    EnvironmentalEffectsManager.getInstance().init(this);

    // 4. Spawn Player Entity at the center of the massive colosseum
    const playerSprite = this.add.sprite(width / 2, height / 2, this.selectedGladiator.id === 'knight' ? 'char-knight' : this.selectedGladiator.id === 'duelist' ? 'char-duelist' : 'char-mage');
    this.player = new BaseEntity('player', playerSprite);
    
    this.playerPhysics = this.player.addComponent('physics', new PhysicsComponent(this.player, this.selectedGladiator.baseSpeed));
    this.playerPhysics.collisionRadius = 22;
    this.playerPhysics.weight = 2.0;
    this.playerHealth = this.player.addComponent('health', new HealthComponent(this.player, this.selectedGladiator.baseHp));
    this.playerPhysics.setBoundaries(32, width - 32, 32, height - 32);

    // Attach ModifierComponent to player
    const modifiers = this.player.addComponent('modifiers', new ModifierComponent(this.player));
    modifiers.init();

    // Attach WeaponArtComponent to player
    const weaponArt = this.player.addComponent('weapon_art', new WeaponArtComponent(this.player));
    const weaponPreset = WEAPON_PRESETS.find(w => w.id === this.selectedWeaponId) || WEAPON_PRESETS[0];
    weaponArt.setWeaponClass(weaponPreset.id);

    // Create projectile groups for legendary upgrades
    this.bulletGroup = this.add.group();
    this.boomerangGroup = this.add.group();

    // 5. Spawn Player Weapon Component
    const weapon = this.player.addComponent('weapon', new WeaponComponent(this.player));
    weapon.weight = weaponPreset.weight;
    weapon.baseDamage = weaponPreset.baseDamage;
    weapon.length = weaponPreset.reach;
    weapon.handleOffset = weaponPreset.handleOffset;
    // Call init on component to set up its trail graphics
    weapon.init();

    // 5b. Spawn Player sword sprite
    this.swordSprite = this.add.sprite(this.player.x, this.player.y, 'sword-texture');
    this.swordSprite.setOrigin(0.1, 0.5);
    
    const mainBladeColor = parseInt(this.selectedGladiator.bladeColor.replace('#', '0x'), 16);
    this.swordSprite.setTint(mainBladeColor);

    if (weaponPreset.id === 'twin_daggers') {
      const offhand = new WeaponComponent(this.player);
      offhand.weight = weaponPreset.weight;
      offhand.baseDamage = weaponPreset.baseDamage;
      offhand.length = weaponPreset.reach;
      offhand.handleOffset = weaponPreset.handleOffset;
      offhand.angleOffset = Math.PI; // Opposite direction
      this.player.addComponent('offhand_weapon', offhand);
      offhand.init();

      this.offhandSwordSprite = this.add.sprite(this.player.x, this.player.y, 'sword-texture');
      this.offhandSwordSprite.setOrigin(0.1, 0.5);
      this.offhandSwordSprite.setTint(mainBladeColor);
      this.offhandSwordSprite.setAlpha(0.9);
    }

    // 6. Spawn Visual Slash Trail Graphics
    this.slashTrailGraphics = this.add.graphics();

    // 7. Initialize particle pools
    this.particleGroup = this.add.group();

    // 8. Configure main camera and its scrolling limits
    this.cameras.main.setBounds(0, 0, this.arenaWidth, this.arenaHeight);
    this.cameraX = this.player.x;
    this.cameraY = this.player.y;
    this.cameras.main.centerOn(this.cameraX, this.cameraY);

    // 8b. Register debug inputs and graphic layers
    this.debugGraphics = this.add.graphics();
    this.debugGraphics.setDepth(9999);
    this.fpsText = this.add.text(16, 16, '', {
      fontFamily: '"JetBrains Mono", monospace, sans-serif',
      fontSize: '12px',
      color: '#00ff66',
      backgroundColor: '#0a0a0fbc',
      padding: { x: 8, y: 6 }
    });
    this.fpsText.setScrollFactor(0);
    this.fpsText.setDepth(10000);
    this.fpsText.setVisible(false);

    // Developer character hotkeys: F1 (Galahad), F2 (Seraphina), F3 (Ignis)
    this.input.keyboard?.on('keydown-F1', (e: KeyboardEvent) => {
      const activeElem = document.activeElement;
      if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
      this.switchCharacter(0);
    });
    this.input.keyboard?.on('keydown-F2', (e: KeyboardEvent) => {
      const activeElem = document.activeElement;
      if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
      this.switchCharacter(1);
    });
    this.input.keyboard?.on('keydown-F3', (e: KeyboardEvent) => {
      const activeElem = document.activeElement;
      if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) {
        return;
      }
      e.preventDefault();
      this.switchCharacter(2);
    });

    this.input.keyboard?.on('keydown-I', () => {
      this.isDebugMode = !this.isDebugMode;
      this.fpsText.setVisible(this.isDebugMode);
      if (!this.isDebugMode) {
        this.debugGraphics.clear();
      }
      this.logger.info(`Debug mode toggled: ${this.isDebugMode}`);
    });

    // Developer Hotkeys for Weapon Arts (Active in Debug or Sandbox modes)
    this.input.keyboard?.on('keydown-R', () => {
      if (!this.isDebugMode && !this.isSandboxMode) return;
      const activeElem = document.activeElement;
      if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) return;
      
      const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
      if (weaponArt) {
        weaponArt.currentState = WeaponArtState.READY;
        weaponArt.cooldownTimer = 0;
        weaponArt.stateTimer = 0;
        weaponArt.stamina = weaponArt.maxStamina;
        weaponArt.resetTelemetry();
        this.logger.info('Developer Hotkey [R]: Reset Cooldown and Telemetry.');
      }
    });

    this.input.keyboard?.on('keydown-T', () => {
      if (!this.isDebugMode && !this.isSandboxMode) return;
      const activeElem = document.activeElement;
      if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) return;

      const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
      if (weaponArt) {
        weaponArt.infiniteStamina = !weaponArt.infiniteStamina;
        const cb = document.getElementById('bb-dev-cb-inf-stamina') as HTMLInputElement | null;
        if (cb) cb.checked = weaponArt.infiniteStamina;
        this.logger.info(`Developer Hotkey [T]: Infinite Stamina set to ${weaponArt.infiniteStamina}`);
      }
    });

    const weaponKeys = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX'];
    const weaponIds = ['longsword', 'greatsword', 'spear', 'twin_daggers', 'warhammer', 'battle_axe'];
    weaponKeys.forEach((key, idx) => {
      this.input.keyboard?.on(`keydown-${key}`, () => {
        if (!this.isDebugMode && !this.isSandboxMode) return;
        const activeElem = document.activeElement;
        if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) return;

        const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
        if (weaponArt) {
          weaponArt.setWeaponClass(weaponIds[idx]);
          weaponArt.trigger();
          const sel = document.getElementById('bb-dev-select-weapon') as HTMLSelectElement | null;
          if (sel) sel.value = weaponIds[idx];
          this.logger.info(`Developer Hotkey [${idx + 1}]: Forced cast weapon art ${weaponIds[idx]}`);
        }
      });
    });

    this.input.keyboard?.on('keydown-V', (e: KeyboardEvent) => {
      if (!this.isDebugMode) return;
      
      const activeElem = document.activeElement;
      if (activeElem && (activeElem.tagName === 'INPUT' || activeElem.tagName === 'TEXTAREA')) {
        return;
      }

      const existing = document.getElementById('dev-prompt');
      if (existing) {
        existing.remove();
        const overlay = document.getElementById('bb-upgrade-overlay');
        if (!overlay || overlay.style.display === 'none') {
          this.isPaused = false;
          this.physics.resume();
        }
        return;
      }
      
      const devPrompt = document.createElement('div');
      devPrompt.id = 'dev-prompt';
      devPrompt.style.position = 'absolute';
      devPrompt.style.top = '50%';
      devPrompt.style.left = '50%';
      devPrompt.style.transform = 'translate(-50%, -50%)';
      devPrompt.style.backgroundColor = 'rgba(10, 10, 15, 0.95)';
      devPrompt.style.border = '1px solid #00ff66';
      devPrompt.style.padding = '20px';
      devPrompt.style.zIndex = '999999';
      devPrompt.style.color = '#00ff66';
      devPrompt.style.fontFamily = 'monospace';
      
      devPrompt.innerHTML = `
        <div style="margin-bottom: 10px;">Enter Upgrade ID to equip:</div>
        <input type="text" id="dev-upgrade-input" style="background: #000; color: #00ff66; border: 1px solid #00ff66; padding: 5px; width: 200px;" placeholder="e.g. explosive_crits">
        <div style="margin-top: 10px; display: flex; gap: 10px;">
          <button id="dev-upgrade-submit" style="background: #00ff66; color: #000; border: none; padding: 5px 10px; cursor: pointer;">Equip</button>
          <button id="dev-upgrade-cancel" style="background: transparent; color: #00ff66; border: 1px solid #00ff66; padding: 5px 10px; cursor: pointer;">Cancel</button>
        </div>
        <div id="dev-upgrade-error" style="color: #ff5500; margin-top: 10px; font-size: 12px;"></div>
      `;
      
      document.body.appendChild(devPrompt);
      
      const input = document.getElementById('dev-upgrade-input') as HTMLInputElement;
      input.focus();
      
      devPrompt.addEventListener('keydown', (e) => e.stopPropagation());
      devPrompt.addEventListener('keyup', (e) => e.stopPropagation());
      devPrompt.addEventListener('keypress', (e) => e.stopPropagation());
      
      this.isPaused = true;
      this.physics.pause();
      
      const closePrompt = () => {
        devPrompt.remove();
        const overlay = document.getElementById('bb-upgrade-overlay');
        if (!overlay || overlay.style.display === 'none') {
          this.isPaused = false;
          this.physics.resume();
        }
      };
      
      document.getElementById('dev-upgrade-cancel')?.addEventListener('click', closePrompt);
      
      const submit = () => {
        const upgradeId = input.value.trim();
        if (upgradeId) {
          const upgrade = ALL_UPGRADES.find(u => u.id === upgradeId);
          if (upgrade) {
            this.applyDirectUpgrade(upgrade);
            closePrompt();
          } else {
            const err = document.getElementById('dev-upgrade-error');
            if (err) err.textContent = 'Upgrade not found: ' + upgradeId;
          }
        }
      };
      
      document.getElementById('dev-upgrade-submit')?.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') submit();
        if (e.key === 'Escape') closePrompt();
      });
    });

    // Setup keyboard shortcuts 1, 2, 3 for active upgrade options
    this.input.keyboard?.on('keydown-ONE', () => {
      if (this.upgradeKeysActive) this.applyUpgradeSelection(0);
    });
    this.input.keyboard?.on('keydown-TWO', () => {
      if (this.upgradeKeysActive) this.applyUpgradeSelection(1);
    });
    this.input.keyboard?.on('keydown-THREE', () => {
      if (this.upgradeKeysActive) this.applyUpgradeSelection(2);
    });
    this.input.keyboard?.on('keydown-NUMPAD_ONE', () => {
      if (this.upgradeKeysActive) this.applyUpgradeSelection(0);
    });
    this.input.keyboard?.on('keydown-NUMPAD_TWO', () => {
      if (this.upgradeKeysActive) this.applyUpgradeSelection(1);
    });
    this.input.keyboard?.on('keydown-NUMPAD_THREE', () => {
      if (this.upgradeKeysActive) this.applyUpgradeSelection(2);
    });

    // 9b. Initialize Phase 4.1 Boss Encounter Framework
    BossEncounterManager.getInstance().init(this);
    MinimapManager.getInstance().init(this, this.arenaWidth, this.arenaHeight);

    // Setup Developer Shortcut 'B' to trigger the Fallen Colossus Boss fight
    this.input.keyboard?.on('keydown-B', () => {
      this.triggerColossusBossFight();
    });

    // Developer key shortcuts for Fallen Colossus Boss
    this.input.keyboard?.on('keydown-U', () => {
      if (!this.isDebugMode) return;
      const boss = BossEncounterManager.getInstance().getActiveBoss() as any;
      if (boss && 'onPhaseTransition' in boss) {
        boss.onPhaseTransition(1);
        this.vfxManager.addFloatingWorldText(boss.x, boss.y - 80, "DEV: PHASE 1 FORCED", "#00ff66");
      }
    });

    this.input.keyboard?.on('keydown-Y', () => {
      if (!this.isDebugMode) return;
      const boss = BossEncounterManager.getInstance().getActiveBoss() as any;
      if (boss && 'onPhaseTransition' in boss) {
        boss.onPhaseTransition(2);
        this.vfxManager.addFloatingWorldText(boss.x, boss.y - 80, "DEV: PHASE 2 FORCED", "#ffd700");
      }
    });

    this.input.keyboard?.on('keydown-T', () => {
      if (!this.isDebugMode) return;
      const boss = BossEncounterManager.getInstance().getActiveBoss() as any;
      if (boss && 'onPhaseTransition' in boss) {
        boss.onPhaseTransition(3);
        this.vfxManager.addFloatingWorldText(boss.x, boss.y - 80, "DEV: PHASE 3 FORCED", "#ff0055");
      }
    });

    this.input.keyboard?.on('keydown-J', () => {
      if (!this.isDebugMode) return;
      if (BossEncounterManager.getInstance().getActiveBoss()) {
        (BossEncounterManager.getInstance() as any).skipIntro();
        this.vfxManager.addFloatingWorldText(this.player.x, this.player.y - 50, "DEV: INTRO SKIPPED", "#00ffff");
      }
    });

    this.input.keyboard?.on('keydown-H', () => {
      if (!this.isDebugMode) return;
      const boss = BossEncounterManager.getInstance().getActiveBoss() as any;
      if (boss && 'devInfiniteHp' in boss) {
        boss.devInfiniteHp = !boss.devInfiniteHp;
        this.vfxManager.addFloatingWorldText(boss.x, boss.y - 80, `DEV: INF HP ${boss.devInfiniteHp ? 'ON' : 'OFF'}`, "#00ffff");
      }
    });

    this.input.keyboard?.on('keydown-K', () => {
      if (!this.isDebugMode) return;
      const boss = BossEncounterManager.getInstance().getActiveBoss() as any;
      if (boss && boss.healthComponent) {
        boss.healthComponent.takeDamage(boss.healthComponent.getHp());
        this.vfxManager.addFloatingWorldText(boss.x, boss.y - 80, "DEV: ONE-HIT KILL ACTIVE", "#ff3366");
      }
    });

    // Restore upgrades and HP
    if (this.initialUpgradesToApply && this.initialUpgradesToApply.length > 0) {
      this.initialUpgradesToApply.forEach(up => {
        this.applyDirectUpgrade(up);
      });
    }
    if (this.initialHpToSet !== null) {
      this.playerHealth.setHp(this.initialHpToSet);
    }
  }

  /**
   * Initializes systems that only apply to the standard gameplay experience
   * (Standard HUD visibility, Wave progression, Automatic enemy spawner, etc.)
   */
  public initializeGameplaySystems(): void {
    // 1. Ensure gameplay HUD panels are visible
    const leftPanel = document.getElementById('bb-hud-left-panel');
    if (leftPanel) leftPanel.style.display = 'flex';

    const middlePanel = document.getElementById('bb-hud-middle-panel');
    if (middlePanel) middlePanel.style.display = 'flex';

    // 2. Start Wave Spawning
    this.spawnWave();

    // 3. Update HUD
    this.updateHUDValues();

    this.logger.info('Arena Game Scene successfully loaded and running.');
  }

  /**
   * Initializes sandbox-specific laboratory systems
   * (Sandbox HUD overlay, Custom sandbox bindings, Initial static dummy setup, etc.)
   */
  public initializeSandboxSystems(): void {
    this.isDebugMode = true; // Enable debug HUD overlays for performance/metrics in Sandbox Mode
    this.fpsText.setVisible(true);

    // 1. Hide progression-related panels of gameplay HUD to avoid visual clutter
    const leftPanel = document.getElementById('bb-hud-left-panel');
    if (leftPanel) leftPanel.style.display = 'none';

    const middlePanel = document.getElementById('bb-hud-middle-panel');
    if (middlePanel) middlePanel.style.display = 'none';

    // 2. Spawn 3 basic gargoyle target dummies at the start of Sandbox Arena
    const width = this.arenaWidth;
    const height = this.arenaHeight;
    this.spawnSandboxEnemy('melee', width / 2 - 150, height / 2 - 100);
    this.spawnSandboxEnemy('melee', width / 2 + 150, height / 2 - 100);
    this.spawnSandboxEnemy('heavy', width / 2, height / 2 - 180);

    // 3. Setup a clean Sandbox developer HUD onscreen
    this.createSandboxHUD();

    // 4. Additional Sandbox keybinds (such as spawning/healing etc.)
    this.setupSandboxKeys();

    // 5. Update initial HUD values for remaining items (such as health & gold)
    this.updateHUDValues();

    this.logger.info('Developer Sandbox successfully loaded and running.');
  }

  public getEnemies(): BaseEntity[] {
    return this.enemies;
  }

  public getPlayer(): BaseEntity {
    return this.player;
  }

  public clearNormalEnemies(): void {
    this.enemies = this.enemies.filter(e => {
      if (e.getComponent('ai') instanceof EnemyAIComponent) {
        e.destroy();
        return false;
      }
      return true;
    });
  }

  private triggerPlaceholderBossFight(): void {
    this.triggerColossusBossFight();
  }

  public triggerColossusBossFight(): void {
    if (BossEncounterManager.getInstance().getActiveBoss()) {
      this.logger.warn('A boss encounter is already active!');
      return;
    }

    const ex = this.arenaWidth / 2;
    const ey = this.arenaHeight / 2 - 120; // Spawn near center, slightly north of player
    
    // Create the handcrafted Fallen Colossus boss
    const boss = new ColossusBossEntity(this, ex, ey);
    this.enemies.push(boss);

    // Emit EventTopic.BOSS_STARTED
    EventBus.getInstance().emit(EventTopic.BOSS_STARTED, { boss });
  }

  protected createArenaGrid(width: number, height: number): void {
    if (this.arenaGridGraphics) {
      this.arenaGridGraphics.destroy();
    }
    this.arenaGridGraphics = this.add.graphics();
    this.arenaGridGraphics.setDepth(-10); // below characters

    // Elegant deep colosseum arena floor
    this.arenaGridGraphics.fillGradientStyle(0x06070a, 0x090a12, 0x040508, 0x06080d, 1);
    this.arenaGridGraphics.fillRect(0, 0, width, height);

    // Draw stone boundary bricks
    this.arenaGridGraphics.fillStyle(0x1e293b, 0.4);
    this.arenaGridGraphics.fillRect(0, 0, width, 16); // Top
    this.arenaGridGraphics.fillRect(0, height - 16, width, 16); // Bottom
    this.arenaGridGraphics.fillRect(0, 0, 16, height); // Left
    this.arenaGridGraphics.fillRect(width - 16, 0, 16, height); // Right

    // Brick joints lines
    this.arenaGridGraphics.lineStyle(1.5, 0xcda250, 0.08);
    for (let i = 0; i < width; i += 64) {
      this.arenaGridGraphics.moveTo(i, 0);
      this.arenaGridGraphics.lineTo(i, height);
    }
    for (let j = 0; j < height; j += 64) {
      this.arenaGridGraphics.moveTo(0, j);
      this.arenaGridGraphics.lineTo(width, j);
    }
    this.arenaGridGraphics.strokePath();

    // Procedural Arena Composition & Decorative Backdrops
    // Linear congruential generator seed tool
    const seedRandom = (s: number) => {
      const x = Math.sin(s) * 10000;
      return x - Math.floor(x);
    };

    // 1. Draw scorch marks on the ground
    for (let s = 1; s <= 12; s++) {
      const rx = seedRandom(s * 14.5) * width;
      const ry = seedRandom(s * 39.2) * height;
      const rRad = 25 + seedRandom(s * 47.1) * 60;
      
      this.arenaGridGraphics.fillStyle(0x020203, 0.45);
      this.arenaGridGraphics.fillCircle(rx, ry, rRad);
    }

    // 2. Draw cracked tiles/slabs
    this.arenaGridGraphics.lineStyle(1.0, 0x000000, 0.55);
    for (let t = 1; t <= 16; t++) {
      const tx = seedRandom(t * 19.3) * width;
      const ty = seedRandom(t * 23.7) * height;
      const size = 35 + seedRandom(t * 29.1) * 55;
      
      this.arenaGridGraphics.strokeRect(tx, ty, size, size);
      
      // Draw a crack line inside the tile
      this.arenaGridGraphics.beginPath();
      this.arenaGridGraphics.moveTo(tx, ty);
      this.arenaGridGraphics.lineTo(tx + size * 0.4, ty + size * 0.6);
      this.arenaGridGraphics.lineTo(tx + size * 0.8, ty + size * 0.5);
      this.arenaGridGraphics.strokePath();
    }

    // 3. Draw ancient rubble piles and fallen weapons debris
    for (let r = 1; r <= 22; r++) {
      const rx = seedRandom(r * 31.7) * width;
      const ry = seedRandom(r * 43.1) * height;
      // Keep clear of direct player center spawn
      if (Phaser.Math.Distance.Between(rx, ry, width / 2, height / 2) < 280) continue;

      const scale = 6 + seedRandom(r * 17.3) * 12;
      
      // Draw stone debris block
      this.arenaGridGraphics.fillStyle(0x334155, 0.55);
      this.arenaGridGraphics.beginPath();
      this.arenaGridGraphics.moveTo(rx - scale, ry - scale * 0.5);
      this.arenaGridGraphics.lineTo(rx + scale, ry - scale);
      this.arenaGridGraphics.lineTo(rx + scale * 0.8, ry + scale);
      this.arenaGridGraphics.lineTo(rx - scale * 0.9, ry + scale * 0.7);
      this.arenaGridGraphics.closePath();
      this.arenaGridGraphics.fill();
      
      // Highlight edge
      this.arenaGridGraphics.lineStyle(1.2, 0x475569, 0.45);
      this.arenaGridGraphics.strokePath();
    }

    // 4. Ancient Broken Pillars (rendered as circle bases with shadow casting)
    for (let p = 1; p <= 8; p++) {
      const px = seedRandom(p * 53.4) * width;
      const py = seedRandom(p * 67.2) * height;
      if (Phaser.Math.Distance.Between(px, py, width / 2, height / 2) < 280) continue;

      const pRad = 28 + seedRandom(p * 11.9) * 22;

      // Draw pillar shadow
      this.arenaGridGraphics.fillStyle(0x020305, 0.55);
      this.arenaGridGraphics.fillCircle(px + 10, py + 14, pRad);

      // Draw pillar base
      this.arenaGridGraphics.fillStyle(0x1e293b, 0.85);
      this.arenaGridGraphics.fillCircle(px, py, pRad);
      
      // Inner structure circular rings
      this.arenaGridGraphics.lineStyle(2.5, 0x0f172a, 0.75);
      this.arenaGridGraphics.strokeCircle(px, py, pRad);
      this.arenaGridGraphics.strokeCircle(px, py, pRad * 0.75);
      this.arenaGridGraphics.strokeCircle(px, py, pRad * 0.5);
      
      // Cracked lines
      this.arenaGridGraphics.lineStyle(1.8, 0x090d16, 0.85);
      this.arenaGridGraphics.beginPath();
      this.arenaGridGraphics.moveTo(px, py);
      this.arenaGridGraphics.lineTo(px + pRad * 0.6, py - pRad * 0.4);
      this.arenaGridGraphics.strokePath();
    }
  }

  private setupEvents(): void {
    const bus = EventBus.getInstance();
    
    // Cleanup previous listeners to avoid duplicates
    bus.removeAllListeners(EventTopic.PLAYER_HEALTH_CHANGED);
    bus.removeAllListeners(EventTopic.PLAYER_DIED);
    bus.removeAllListeners(EventTopic.COIN_COLLECTED);
    bus.removeAllListeners(EventTopic.PLAYER_XP_CHANGED);
    bus.removeAllListeners('HEALTH_DROPLET_COLLECTED');

    bus.on(EventTopic.PLAYER_HEALTH_CHANGED, (hp: number, maxHp: number) => {
      // Sync with HTML HUD elements if available
      const element = document.getElementById('bb-score-val');
      if (element) {
        // Redraw custom hearts or stats here
      }
    }, this);

    
    bus.on(EventTopic.COIN_COLLECTED, (data: { amount: number, x: number, y: number }) => {
      this.collectedGold += data.amount;
      this.score += 50 * data.amount;
      SaveManager.getInstance().addGold(data.amount);
      AudioManager.getInstance().playSFX('coin');
      this.vfxManager.spawnSparks(data.x, data.y, 0xffd700, 5);
      this.updateHUDValues();
    }, this);

    bus.on(EventTopic.PLAYER_XP_CHANGED, (data: { amount: number, x: number, y: number }) => {
      this.gainXP(data.amount);
    }, this);

    bus.on('HEALTH_DROPLET_COLLECTED', (data: { amount: number, x: number, y: number }) => {
      this.playerHealth.heal(data.amount);
      this.vfxManager.createFloatingXPText(this.player.x, this.player.y - 30, `+${data.amount} HP`, '#10b981');
      this.vfxManager.spawnSparks(this.player.x, this.player.y, 0x10b981, 6);
      this.updateHUDValues();
    }, this);

    bus.on(EventTopic.PLAYER_DIED, () => {
      if (this.isSandboxMode) {
        this.playerHealth.heal(this.playerHealth.getMaxHp());
        this.vfxManager.addFloatingWorldText(this.player.x, this.player.y - 40, "SANDBOX AUTO-HEAL ON DEATH", "#ff3366");
        return;
      }
      this.logger.info('Gladiator fallen! Triggering Game Over screen...');
      this.handleGameOver();
    }, this);
  }

  private spawnWave(): void {
    const width = this.arenaWidth;
    const height = this.arenaHeight;

    // Check if it's a Boss or Mini-boss wave
    const isBossWave = this.waveDirector.isBossWave();
    if (isBossWave) {
      this.triggerColossusBossFight();
      return;
    }
    const isMiniBossWave = this.waveDirector.isMiniBossWave();

    const spawnCount = this.waveDirector.getSpawnCount();
    const waveNumber = this.waveDirector.getWaveNumber();

    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    const luck = modifiers ? modifiers.getModifiedValue('luck', 1.0) : 1.0;
    const eliteChance = this.waveDirector.getEliteChance();

    // Determine if we spawn a Legendary Beast this wave
    const isLegendaryWave = !isBossWave && !isMiniBossWave && (waveNumber >= 5) && (waveNumber % 6 === 0);
    const legendaryBeastIndex = isLegendaryWave ? Phaser.Math.Between(0, spawnCount - 1) : -1;
    let legendaryTheme = '';
    let legendaryName = '';

    if (isLegendaryWave) {
      legendaryTheme = Phaser.Math.RND.pick(['Burning', 'Vampiric', 'Giant', 'Frozen', 'Armored']);
      if (legendaryTheme === 'Burning') legendaryName = 'Infernal Executioner';
      else if (legendaryTheme === 'Vampiric') legendaryName = 'Blood Sovereign';
      else if (legendaryTheme === 'Frozen') legendaryName = 'Frost Lich';
      else if (legendaryTheme === 'Giant') legendaryName = 'Titan of Tartarus';
      else if (legendaryTheme === 'Armored') legendaryName = 'Shield of Colossus';
    }

    for (let i = 0; i < spawnCount; i++) {
      let ex = Phaser.Math.Between(100, width - 100);
      let ey = Phaser.Math.Between(100, height - 100);

      while (Phaser.Math.Distance.Between(ex, ey, this.player.x, this.player.y) < 220) {
        ex = Phaser.Math.Between(100, width - 100);
        ey = Phaser.Math.Between(100, height - 100);
      }

      // Display legendary banner exactly once at top of wave
      if (isLegendaryWave && i === 0) {
        const bannerText = `⚔️ A LEGENDARY BEAST HAS ENTERED THE COLOSSEUM:\n${legendaryName.toUpperCase()}!`;
        const banner = this.add.text(this.cameras.main.width / 2, this.cameras.main.height / 2 - 180, bannerText, {
          fontFamily: '"Space Grotesk", sans-serif',
          fontSize: '24px',
          color: '#ff2200',
          align: 'center',
          fontStyle: 'bold',
          stroke: '#000000',
          strokeThickness: 6
        }).setOrigin(0.5).setScrollFactor(0).setDepth(100);
        
        this.tweens.add({
          targets: banner,
          scale: 1.1,
          duration: 300,
          yoyo: true,
          repeat: 3,
          onComplete: () => {
            this.tweens.add({
              targets: banner,
              alpha: 0,
              duration: 500,
              onComplete: () => banner.destroy()
            });
          }
        });
        AudioManager.getInstance().playSFX('wave');
      }

      let enemyType = Phaser.Math.RND.pick(['enemy-melee', 'enemy-heavy', 'enemy-ranged']);
      if (isBossWave) {
        enemyType = 'enemy-heavy';
      } else if (isMiniBossWave) {
        enemyType = i % 2 === 0 ? 'enemy-heavy' : 'enemy-ranged';
      }

      const sprite = this.add.sprite(ex, ey, enemyType);
      
      // Determine base stats
      let speed = enemyType === 'enemy-heavy' ? 55 : enemyType === 'enemy-ranged' ? 115 : 95;
      let hp = enemyType === 'enemy-heavy' ? 120 : enemyType === 'enemy-ranged' ? 25 : 35;

      // Scaling formulas:
      const hpScale = this.waveDirector.getEnemyHpScale();
      const speedScale = this.waveDirector.getEnemySpeedScale();

      let finalHP = Math.round(hp * hpScale);
      let finalSpeed = Math.round(speed * speedScale);
      
      let isElite = false;
      let isLegendary = (i === legendaryBeastIndex);
      let eliteMods: string[] = [];

      const enemy = new BaseEntity(
        isBossWave ? `enemy_boss_${Date.now()}_${i}` : isMiniBossWave ? `enemy_mini_${Date.now()}_${i}` : `enemy_${Date.now()}_${i}`,
        sprite
      );

      let finalScale = 1.0;
      let finalRadius = 24;
      let finalWeight = 1.0;

      // Assign elite modifiers
      if (isBossWave) {
        // Handled below
      } else if (isLegendary) {
        isElite = true;
        eliteMods = [legendaryTheme];
      } else if (isMiniBossWave) {
        isElite = true;
        // Arena Champion rolls one random modifier
        eliteMods = [Phaser.Math.RND.pick(['Burning', 'Vampiric', 'Giant', 'Frozen', 'Armored'])];
      } else if (Math.random() < eliteChance * luck) {
        isElite = true;
        if (waveNumber >= 20 && Math.random() < 0.60) {
          // Dual affixes!
          const pool = ['Burning', 'Vampiric', 'Giant', 'Frozen', 'Armored'];
          const m1 = Phaser.Math.RND.pick(pool);
          const m2 = Phaser.Math.RND.pick(pool.filter(m => m !== m1));
          eliteMods = [m1, m2];
        } else {
          // Single affix
          eliteMods = [Phaser.Math.RND.pick(['Burning', 'Vampiric', 'Giant', 'Frozen', 'Armored'])];
        }
      }

      // Compute stats
      if (isBossWave) {
        finalHP = Math.round(hp * hpScale * 5.0);
        finalSpeed = Math.round(speed * speedScale * 0.85);
        sprite.setTint(0xff3366);
        sprite.setScale(2.5);
        finalRadius = 52;
        finalWeight = 10.0;
        this.vfxManager.addFloatingWorldText(ex, ey - 50, 'COLOSSEUM OVERLORD', '#ff3366');
      } else if (isLegendary) {
        (enemy as any).isElite = true;
        (enemy as any).isLegendaryBeast = true;
        (enemy as any).legendaryName = legendaryName;
        (enemy as any).eliteMods = eliteMods;

        // Custom stats for legendary beasts
        if (legendaryTheme === 'Burning') {
          finalHP = Math.round(finalHP * 3.5);
          finalSpeed = Math.round(finalSpeed * 1.30);
          finalScale = 1.8;
          finalWeight = 12.0;
          finalRadius = 44;
          sprite.setTint(0xff3700);
        } else if (legendaryTheme === 'Vampiric') {
          finalHP = Math.round(finalHP * 3.5);
          finalSpeed = Math.round(finalSpeed * 1.25);
          finalScale = 1.8;
          finalWeight = 12.0;
          finalRadius = 44;
          sprite.setTint(0x9d174d);
        } else if (legendaryTheme === 'Frozen') {
          finalHP = Math.round(finalHP * 3.5);
          finalSpeed = Math.round(finalSpeed * 1.25);
          finalScale = 1.8;
          finalWeight = 12.0;
          finalRadius = 44;
          sprite.setTint(0x0891b2);
        } else if (legendaryTheme === 'Giant') {
          finalHP = Math.round(finalHP * 5.0);
          finalSpeed = Math.round(finalSpeed * 1.10);
          finalScale = 2.4;
          finalWeight = 20.0;
          finalRadius = 54;
          sprite.setTint(0x312e81);
        } else if (legendaryTheme === 'Armored') {
          finalHP = Math.round(finalHP * 4.5);
          finalSpeed = Math.round(finalSpeed * 1.00);
          finalScale = 1.9;
          finalWeight = 999.0;
          finalRadius = 44;
          sprite.setTint(0xca8a04);
        }

        this.vfxManager.addFloatingWorldText(ex, ey - 40, legendaryName, '#ff2200');
      } else if (isMiniBossWave) {
        (enemy as any).isElite = true;
        (enemy as any).isMiniBoss = true;
        (enemy as any).eliteMods = eliteMods;

        const mainMod = eliteMods[0];
        let hpMult = 2.5;
        let speedMult = 1.10;
        finalScale = 1.85;
        finalRadius = 44;
        finalWeight = 8.0;

        // Apply mod on top of mini boss
        if (mainMod === 'Burning') {
          hpMult *= 1.25; speedMult *= 1.15; sprite.setTint(0xff5500);
        } else if (mainMod === 'Vampiric') {
          hpMult *= 1.35; sprite.setTint(0xd946ef);
        } else if (mainMod === 'Giant') {
          hpMult *= 2.0; speedMult *= 0.90; finalScale = 2.2; finalRadius = 50; finalWeight = 12.0; sprite.setTint(0x4f46e5);
        } else if (mainMod === 'Frozen') {
          hpMult *= 1.15; sprite.setTint(0x06b6d4);
        } else if (mainMod === 'Armored') {
          hpMult *= 1.8; speedMult *= 0.8; finalWeight = 999.0; sprite.setTint(0xeab308);
        }

        finalHP = Math.round(finalHP * hpMult);
        finalSpeed = Math.round(finalSpeed * speedMult);
        sprite.setScale(finalScale);

        this.vfxManager.addFloatingWorldText(ex, ey - 45, `${mainMod} Champion`, '#ffd700');
      } else if (isElite) {
        (enemy as any).isElite = true;
        (enemy as any).eliteMods = eliteMods;

        let hpMult = 1.0;
        let speedMult = 1.0;

        eliteMods.forEach(mod => {
          if (mod === 'Burning') {
            hpMult *= 1.25; speedMult *= 1.15; finalScale = Math.max(finalScale, 1.25);
          } else if (mod === 'Vampiric') {
            hpMult *= 1.35; finalScale = Math.max(finalScale, 1.25);
          } else if (mod === 'Giant') {
            hpMult *= 2.0; speedMult *= 0.90; finalScale = Math.max(finalScale, 1.65); finalRadius = 36; finalWeight = 3.0;
          } else if (mod === 'Frozen') {
            hpMult *= 1.15; finalScale = Math.max(finalScale, 1.25);
          } else if (mod === 'Armored') {
            hpMult *= 1.8; speedMult *= 0.80; finalScale = Math.max(finalScale, 1.25); finalWeight = 999.0;
          }
        });

        finalHP = Math.round(finalHP * hpMult);
        finalSpeed = Math.round(finalSpeed * speedMult);
        sprite.setScale(finalScale);

        // Tint according to first mod
        const mainMod = eliteMods[0];
        if (mainMod === 'Burning') sprite.setTint(0xff5500);
        else if (mainMod === 'Vampiric') sprite.setTint(0xd946ef);
        else if (mainMod === 'Frozen') sprite.setTint(0x06b6d4);
        else if (mainMod === 'Giant') sprite.setTint(0x4f46e5);
        else if (mainMod === 'Armored') sprite.setTint(0xeab308);

        const modText = eliteMods.join(' + ') + ' Elite';
        this.vfxManager.addFloatingWorldText(ex, ey - 30, modText, '#ffaa00');
      }

      const physics = enemy.addComponent('physics', new PhysicsComponent(enemy, finalSpeed));
      physics.setBoundaries(32, width - 32, 32, height - 32);
      physics.collisionRadius = finalRadius;
      physics.weight = finalWeight;
      
      const health = enemy.addComponent('health', new HealthComponent(enemy, finalHP));
      const ai = enemy.addComponent('ai', new EnemyAIComponent(enemy, this.player));

      physics.init();
      health.init();
      ai.init();

      if ((enemy as any).isElite && eliteMods.length > 0) {
        const eliteComp = enemy.addComponent('elite', new EliteComponent(enemy, eliteMods));
        eliteComp.init();
      }

      this.enemies.push(enemy);
    }

    EventBus.getInstance().emit(EventTopic.WAVE_STARTED, this.waveDirector.getWaveNumber());
    this.logger.info(`Wave ${this.waveDirector.getWaveNumber()} begun. Spawned ${spawnCount} gladiator beasts.`);
  }

  // Floating text that travels and floats in world space
  

  private boomerangCooldown: number = 0;

  public update(time: number, delta: number): void {
    if (this.isPaused) return;
    
    if (this.boomerangCooldown > 0) {
      this.boomerangCooldown -= delta;
    }

    // 1. Hitstop logic (freeze frames on heavy sword impact)
    if (this.hitstopDuration > 0) {
      this.hitstopDuration -= delta;
      return;
    }

    // Tick down Time Slow (Chronos Dash)
    if (this.timeSlowTimer > 0) {
      this.timeSlowTimer -= delta;
    }

    // 2. Poll Input state (passing delta for input buffer countdowns)
    const input = this.inputManager.update(delta);

    // 3. Update player base entity
    this.player.update(time, delta);
    this.updateWeaponArtHUD(time, delta);

    // 4. Handle Combat and Movement Loops
    this.handleDodge(input, delta);
    this.handleMovement(input);
    this.handleSwordAim(input, time, delta);
    this.handleSlashPhysics(time, delta);
    this.handleBedlamMode(delta);

    // 5. Update Enemies
    this.handleEnemiesAI(time, delta);

    // 5.2 Update Burning / Firebrand DoT and Ash Fields
    this.updateBurningStatusEffects(time, delta);

    // 5.5 Resolve Spatial Soft Collisions and Enemy-Enemy Separation
    const dtSeconds = delta / 1000;
    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    const isIntangible = this.isDodging && modifiers && modifiers.hasLegendaryUpgrade('ghost_dash');
    CollisionResolver.getInstance().resolve(this.player, this.enemies, dtSeconds, this.isDebugMode, isIntangible);

    // 6. Update Legendary weapons/projectiles (Orbit star, boomerang, bullets)
    this.updateLegendaryProjectiles(delta);
    this.updateCustomLegendaries(time, delta);

    // 7. Handle Item, XP Orb and Coin pickups (with dynamic magnet radius)
    const baseRadius = modifiers ? modifiers.getModifiedValue('pickupRadius', 85) : 85;
    const goldGainMult = modifiers ? modifiers.getModifiedValue('goldGain', 1.0) : 1.0;
    const xpGainMult = modifiers ? modifiers.getModifiedValue('xpGain', 1.0) : 1.0;
    this.lootManager.update(this.player.x, this.player.y, baseRadius, goldGainMult, xpGainMult);

    // 8. Check Wave Cleared conditions
    this.checkWaveProgress();

    // 9. Update Camera tracking and look-ahead logic
    this.updateCamera(input.pointerX, input.pointerY);

    // 10. Update Minimap
    MinimapManager.getInstance().update(time, delta);

    // Update custom effects managers
    ArenaEffectsManager.getInstance().update(time, delta);
    EnvironmentalEffectsManager.getInstance().update(time, delta);

    // 11. Render debug HUD overlays if active
    this.drawDebugHUD(input);
  }

  private updateCamera(pointerX: number, pointerY: number): void {
    if (!this.player || !this.player.active) return;

    // 1. Mouse look-ahead: shift target focus slightly towards the pointer
    const targetX = this.player.x + (pointerX - this.player.x) * this.lookAheadFactor;
    const targetY = this.player.y + (pointerY - this.player.y) * this.lookAheadFactor;

    // 2. Dead zone tolerance check
    const dist = Phaser.Math.Distance.Between(this.cameraX, this.cameraY, targetX, targetY);
    if (dist > this.deadZoneRadius) {
      // Smooth lerp camera tracking
      this.cameraX += (targetX - this.cameraX) * this.cameraSmoothing;
      this.cameraY += (targetY - this.cameraY) * this.cameraSmoothing;
    }

    // 3. Exponentially decay active screen shake impulses
    this.cameraImpulseX *= 0.85;
    this.cameraImpulseY *= 0.85;

    // 4. Center the main camera viewport with impulse and boundary constraints
    const halfWidth = this.cameras.main.width / 2;
    const halfHeight = this.cameras.main.height / 2;
    const finalCamX = Phaser.Math.Clamp(
      this.cameraX + this.cameraImpulseX,
      halfWidth,
      this.arenaWidth - halfWidth
    );
    const finalCamY = Phaser.Math.Clamp(
      this.cameraY + this.cameraImpulseY,
      halfHeight,
      this.arenaHeight - halfHeight
    );

    this.cameras.main.centerOn(finalCamX, finalCamY);
  }

  private drawDebugHUD(input: any): void {
    this.debugGraphics.clear();
    if (!this.isDebugMode) return;

    // 1. Draw enemies boundaries and active states
    this.enemies.forEach(enemy => {
      if (!enemy.active) return;

      const ai = enemy.getComponent<EnemyAIComponent>('ai');
      const bossAi = enemy.getComponent<BossAIComponent>('ai');
      const activeState = ai ? ai.getCurrentState() : (bossAi ? bossAi.getCurrentState() : 'UNKNOWN');

      // Red Hitbox circle (drawn dynamically using custom collision radius!)
      const enemyPhysics = enemy.getComponent<PhysicsComponent>('physics');
      const eRadius = enemyPhysics ? enemyPhysics.collisionRadius : 24;
      this.debugGraphics.lineStyle(1.5, 0xff0055, 0.7);
      this.debugGraphics.strokeCircle(enemy.x, enemy.y, eRadius);

      // Thread link to player
      this.debugGraphics.lineStyle(1.0, 0x00ff66, 0.25);
      this.debugGraphics.lineBetween(enemy.x, enemy.y, this.player.x, this.player.y);
    });

    // 2. Draw player hitbox (drawn dynamically using custom collision radius!)
    const playerPhysics = this.player.getComponent<PhysicsComponent>('physics');
    const pRadius = playerPhysics ? playerPhysics.collisionRadius : 22;
    this.debugGraphics.lineStyle(2.0, 0x00ffcc, 0.8);
    this.debugGraphics.strokeCircle(this.player.x, this.player.y, pRadius);

    // 2.5 Draw active spatial collision contacts and separation/push vectors
    CollisionResolver.getInstance().debugContacts.forEach(contact => {
      // Draw active collision contact point (small red circle)
      this.debugGraphics.fillStyle(0xff0000, 1.0);
      this.debugGraphics.fillCircle(contact.x, contact.y, 4);

      // Draw push direction/separation vector
      this.debugGraphics.lineStyle(2.0, 0xff3333, 0.95);
      this.debugGraphics.lineBetween(
        contact.x,
        contact.y,
        contact.x + contact.nx * 20,
        contact.y + contact.ny * 20
      );
    });

    // 3. Draw sword sweep radius and segment samples
    const weapon = this.player.getComponent<WeaponComponent>('weapon');
    if (weapon) {
      const angle = weapon.getAngle();
      const length = weapon.length;
      const handleOffset = weapon.handleOffset;
      
      const baseX = this.player.x + Math.cos(angle) * handleOffset;
      const baseY = this.player.y + Math.sin(angle) * handleOffset;
      const tx = baseX + Math.cos(angle) * length;
      const ty = baseY + Math.sin(angle) * length;

      this.debugGraphics.lineStyle(2.0, 0xffff00, 0.9);
      this.debugGraphics.lineBetween(baseX, baseY, tx, ty);

      // Draw multi-sample segment circles
      const steps = 3;
      for (let j = 0; j <= steps; j++) {
        const segX = baseX + Math.cos(angle) * length * (j / steps);
        const segY = baseY + Math.sin(angle) * length * (j / steps);

        // Draw the weapon collision capsule area around the segment
        this.debugGraphics.lineStyle(1.0, 0xffff00, 0.3);
        this.debugGraphics.strokeCircle(segX, segY, 15);

        this.debugGraphics.fillStyle(0xffaa00, 1.0);
        this.debugGraphics.fillCircle(segX, segY, 3);
      }
      
      // Draw collision cooldowns on enemies
      this.enemies.forEach(enemy => {
        if (!enemy.active) return;
        const cooldown = weapon.hitCooldowns.get(enemy.id);
        if (cooldown !== undefined && cooldown > 0) {
          const maxCooldown = 180;
          const ratio = Math.min(1, cooldown / maxCooldown);
          this.debugGraphics.lineStyle(3, 0xffa500, 1.0);
          this.debugGraphics.beginPath();
          this.debugGraphics.arc(enemy.x, enemy.y, 30, -Math.PI/2, -Math.PI/2 + (Math.PI * 2 * ratio), false);
          this.debugGraphics.strokePath();
        }
      });
    }

    // 4. Update HUD text details
    const activeTokens = CombatDirector.getInstance().getActiveTokenCount();
    const maxTokens = CombatDirector.getInstance().getMaxTokenCount();
    const fps = Math.round(this.game.loop.actualFps);
    const weaponVel = weapon ? weapon.getAngularVelocity() : 0;

    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    const attackSpeedMultiplier = modifiers ? modifiers.getModifiedValue('attackSpeed', 1.0) : 1.0;
    const criticalChance = modifiers ? modifiers.getModifiedValue('critChance', 0) : 0;
    const criticalDamage = modifiers ? modifiers.getModifiedValue('critDamage', 0) : 0;
    const reach = weapon ? weapon.length : 0;
    const speedCalc = weapon ? weapon.getSpeedDamageMultiplier() : { multiplier: 1.0, isCrit: false };
    const calculatedDamage = Math.round((weapon ? weapon.baseDamage : 15) * speedCalc.multiplier);
    const activeUpgradesList = this.chosenUpgradesList.map(u => u.id).join(', ');

    let devText = `--- BLADE & BEDLAM DEVELOPER SANDBOX ---\n` +
      `FPS: ${fps}\n` +
      `ACTIVE ATTACK TOKENS: ${activeTokens} / ${maxTokens}\n` +
      `WEAPON VELOCITY: ${weaponVel.toFixed(2)} rad/s\n` +
      `CALCULATED DAMAGE: ${calculatedDamage}\n` +
      `CURRENT REACH: ${reach.toFixed(1)} px\n` +
      `ATTACK SPEED MULTIPLIER: ${attackSpeedMultiplier.toFixed(2)}x\n` +
      `CRITICAL CHANCE: ${(criticalChance * 100).toFixed(1)}%\n` +
      `CRITICAL DAMAGE: +${(criticalDamage * 100).toFixed(1)}%\n` +
      `CURRENT DPS: ~${(calculatedDamage * attackSpeedMultiplier * 2).toFixed(1)}\n` + // rough estimate
      `CURRENT WEAPON STATE: ${weaponVel > 6 ? 'SWINGING' : 'IDLE'}\n` +
      `ACTIVE UPGRADE LIST: ${activeUpgradesList || 'None'}\n` +
      `\n--- LEGENDARY AUDIT METRICS ---\n` +
      `ACTIVE LEGENDARIES: ${modifiers?.getLegendaryUpgrades().join(', ') || 'None'}\n` +
      `LEGENDARY PROC CHANCES: Chain Lightning: 30%, Sanguic Drop: 12%, Boomerang: 100%, Frozen Edge: 25% on Crit, Meteor Slam: 30% on Crit\n` +
      `COOLDOWNS: Boomerang: ${this.boomerangCooldown.toFixed(0)}ms, Dodge: ${this.dodgeCooldown.toFixed(0)}ms\n` +
      `SWING SPEED MULTIPLIER: ${speedCalc.multiplier.toFixed(2)}x, IS CRIT: ${speedCalc.isCrit}\n` +
      `PASSIVES: Dual Wield: ${modifiers?.hasLegendaryUpgrade('dual_wield')}, Ghost Dash Intangible: ${this.isDodging && modifiers?.hasLegendaryUpgrade('ghost_dash')}\n` +
      `ACTIVE COMPANIONS (Sentinel): ${this.hasSentinel ? 1 : 0}\n` +
      `ACTIVE PROJECTILES: Bullets: ${this.activeBullets.length}, Boomerangs: ${this.activeBoomerangs.length}\n` +
      `LAST LIGHTNING TARGETS: ${this.lastLightningTargets.join(', ') || 'None'}\n` +
      `EXPLOSIVE CRIT COUNT: ${this.explosionCount}\n` +
      `GHOST STATE (Intangible): ${this.isDodging && modifiers?.hasLegendaryUpgrade('ghost_dash') ? 'ACTIVE' : 'INACTIVE'}\n` +
      `TIME SCALE: ${this.timeSlowTimer > 0 ? '0.40x (Time Slow: ' + this.timeSlowTimer.toFixed(0) + 'ms remaining)' : '1.00x (Normal)'}\n` +
      `BOOMERANG STATE: ${this.activeBoomerangs.map(bm => (bm as any).state).join(', ') || 'None'}\n` +
      `BLOOD MOON FRENZY: Stacks: ${this.bloodMoonFrenzyStacks}, SpeedBonus: ${this.bloodMoonFrenzyStacks * 5}%, AttackSpeedBonus: ${this.bloodMoonFrenzyStacks * 10}%\n` +
      `BLADE CYCLONE: Hits: ${this.bladeCycloneHits}/8, ActiveTimer: ${this.bladeCycloneActiveTimer.toFixed(0)}ms\n` +
      `VOID RIFT: Kills: ${this.voidRiftKills}/20, Active Rifts: ${this.activeVoidRifts.length}\n` +
      `SOUL COLLECTOR: Kills: ${this.soulCollectorKills}, VelocityBonus: ${(this.soulCollectorVelocityBonus * 100).toFixed(2)}%\n` +
      `TEMPEST MOMENTUM: Reach ratio: ${modifiers?.hasLegendaryUpgrade('tempest_momentum') ? Phaser.Math.Clamp(weaponVel / 12.0, 0, 1.0).toFixed(2) : '0.00'}\n` +
      `\n--- SYSTEM STATUS ---\n` +
      `WEAPON ANGLE: ${weapon?.getAngle().toFixed(2)} rad\n` +
      `ACTIVE ENEMIES: ${this.enemies.length}\n` +
      `BEDLAM MODE: ${this.isBedlamMode ? 'ACTIVE' : 'READY'}\n` +
      `ARENA: ${this.arenaWidth} x ${this.arenaHeight} (Colosseum)`;

    
    if (modifiers?.hasLegendaryUpgrade('astral_arsenal') && this.astralBlades) {
        const reachMultiplier = modifiers ? modifiers.getModifiedValue('length', 1.0) : 1.0;
        const searchRadius = 250 * reachMultiplier;

        let astralText = '\n\n--- ASTRAL ARSENAL (MYTHICAL) ---\n';
        astralText += `ASTRAL ARSENAL ACTIVE STATE: ACTIVE\n`;
        astralText += `ACTIVE BLADES COUNT: ${this.astralBlades.length}\n`;
        astralText += `TARGET SEARCH RADIUS: ${searchRadius.toFixed(0)} px\n`;
        this.astralBlades.forEach((b, i) => {
             const phys = b.entity.getComponent<PhysicsComponent>('physics');
             const weapon = b.entity.getComponent<WeaponComponent>('weapon');
             if (!phys || !weapon) return;
             
             const linearSpeed = Math.sqrt(phys.vx * phys.vx + phys.vy * phys.vy);
             const speedCalc = weapon.getSpeedDamageMultiplier();
             const baseDmg = weapon.baseDamage;
             let damage = Math.round(baseDmg * speedCalc.multiplier);
             if (this.selectedGladiator.id === 'knight') {
               damage = Math.round(damage * 1.30);
             }

             astralText += `BLADE ${i+1}:\n` +
                           `  - AI State: ${b.state.toUpperCase()}\n` +
                           `  - Target ID: ${b.targetId || 'None'}\n` +
                           `  - Velocity (Linear): [vx: ${Math.round(phys.vx)}, vy: ${Math.round(phys.vy)}] (${Math.round(linearSpeed)} px/s)\n` +
                           `  - Velocity (Angular Equivalent): ${weapon.getAngularVelocity().toFixed(2)} rad/s\n` +
                           `  - Current Damage: ${damage} (Base: ${baseDmg})\n` +
                           `  - Autonomous Attack Count: ${b.attackCount}\n`;
        });
        devText += astralText;
    }

    const activeBoss = BossEncounterManager.getInstance().getActiveBoss() as any;
    if (activeBoss) {
      const state = activeBoss.aiComponent?.getCurrentState() || 'UNKNOWN';
      const hp = activeBoss.healthComponent?.getHp() || 0;
      const maxHp = activeBoss.healthComponent?.getMaxHp() || 1;
      const nextAttackIn = Math.max(0, activeBoss.nextAttackTime - activeBoss.attackTimer);
      const shield = activeBoss.shieldActive ? `${activeBoss.shieldHp} HP` : 'INACTIVE';
      const hazards = activeBoss.activeHazards?.length || 0;
      const projectiles = activeBoss.activeProjectiles?.length || 0;

      devText += `\n\n--- ACTIVE BOSS METRICS ---` +
        `\nBOSS NAME: ${activeBoss.bossName}` +
        `\nBOSS STATE: ${state}` +
        `\nBOSS PHASE: ${activeBoss.getPhase()}` +
        `\nBOSS HP: ${hp} / ${maxHp} (${Math.round((hp/maxHp)*100)}%)` +
        `\nBOSS SHIELD: ${shield}` +
        `\nCURRENT ATTACK: ${activeBoss.activeAttackName || 'None'}` +
        `\nNEXT ATTACK IN: ${nextAttackIn.toFixed(0)}ms` +
        `\nACTIVE HAZARDS: ${hazards} (Lava pools, shockwaves)` +
        `\nACTIVE PROJECTILES: ${projectiles} (Spinning sword)` +
        `\nCOOLDOWNS: attack=${activeBoss.aiComponent?.attackCooldown?.toFixed(0)}ms, special=${activeBoss.aiComponent?.specialCooldown?.toFixed(0)}ms`;

      const animState = activeBoss.animationController ? activeBoss.animationController.getAnimState() : 'UNKNOWN';
      const animTimer = activeBoss.animationController ? `${activeBoss.animationController.getAnimTimer().toFixed(0)}ms` : '0ms';
      const decalCount = ArenaEffectsManager.getInstance().getHazardCount();
      const particleCount = EnvironmentalEffectsManager.getInstance().getParticleCount();

      devText += `\n\n--- CINEMATIC & EFFECT METRICS ---` +
        `\nANIM STATE: ${animState}` +
        `\nANIM TIMER: ${animTimer}` +
        `\nARENA DECALS: ${decalCount}` +
        `\nAMBIENT PARTICLES: ${particleCount}` +
        `\n\n--- DEVELOPER CHEATS ---` +
        `\n[U] FORCE PHASE 1 | [Y] FORCE PHASE 2 | [T] FORCE PHASE 3` +
        `\n[J] SKIP INTRO   | [H] TOGGLE INF HP (${activeBoss.devInfiniteHp ? 'ON' : 'OFF'})` +
        `\n[K] ONE-HIT KILL BOSS`;
    }

    // Find any active Elites for Elite telemetry metrics
    const activeElites: any[] = [];
    this.enemies.forEach(enemy => {
      if (!enemy.active) return;
      const eliteComp = enemy.getComponent<EliteComponent>('elite');
      if (eliteComp) {
        activeElites.push({
          id: enemy.id,
          type: eliteComp.getEliteType(),
          state: eliteComp.currentState,
          ability: eliteComp.currentAbilityName,
          cooldown: eliteComp.cooldownRemaining,
          lastColl: eliteComp.lastCollisionObject,
          isCasting: eliteComp.isAbilityActive
        });
      }
    });

    if (activeElites.length > 0) {
      devText += `\n\n--- ACTIVE ELITES INSTRUMENTATION ---`;
      activeElites.forEach((el, index) => {
        devText += `\nELITE #${index + 1} (${el.id})` +
          `\n  - TYPE: ${el.type}` +
          `\n  - AI STATE FSM: ${el.state}` +
          `\n  - CURRENT ABILITY: ${el.ability}` +
          `\n  - ACTIVE ABILITY CASTING: ${el.isCasting ? 'YES' : 'NO'}` +
          `\n  - CD REMAINING: ${(el.cooldown / 1000).toFixed(1)}s` +
          `\n  - COLLISION HISTORY: last=${el.lastColl}`;
      });
    }

    this.fpsText.setText(devText);
  }

  private handleMovement(input: any): void {
    if (this.isDodging || !this.player.active) return;

    // Determine current speed multiplier (sprint or bedlam bonus)
    let speedMult = 1.0;
    if (input.isSprinting) speedMult = 1.4;
    if (this.isBedlamMode) speedMult = 1.8;

    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    const baseSpeed = modifiers ? modifiers.getModifiedValue('speed', this.selectedGladiator.baseSpeed) : this.selectedGladiator.baseSpeed;
    const targetSpeed = baseSpeed * speedMult;
    
    // Set smooth target velocity. Movement loop will smoothly accelerate towards this.
    this.playerPhysics.setTargetVelocity(
      input.moveX * targetSpeed,
      input.moveY * targetSpeed
    );
  }

  private handleDodge(input: any, delta: number): void {
    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');

    if (this.isDodging) {
      this.dodgeTimer -= delta;

      // Ethereal Ghost Dash damage check
      if (modifiers && modifiers.hasLegendaryUpgrade('ghost_dash')) {
        if (this.player.gameObject) {
          (this.player.gameObject as Phaser.GameObjects.Sprite).setAlpha(0.5);
          (this.player.gameObject as Phaser.GameObjects.Sprite).setTint(0xa855f7);
        }
        this.enemies.forEach(e => {
          if (!e.active) return;
          const ai = e.getComponent<EnemyAIComponent>('ai');
          if (ai && ai.getCurrentState() === EnemyState.DEAD) return;
          const bossAi = e.getComponent<BossAIComponent>('ai');
          if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) return;

          const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
          if (dist < 40 && !this.dashHitEnemies.has(e.id)) {
            this.dashHitEnemies.add(e.id);
            
            // Deal 30 damage
            const health = e.getComponent<HealthComponent>('health');
            if (health && health.takeDamage(30)) {
              this.statsDamageDealt += 30;
              this.vfxManager.createDamageText(e.x, e.y - 15, 30, false);
              this.vfxManager.spawnSparks(e.x, e.y, 0xa855f7, 6); // Purple sparks
              AudioManager.getInstance().playSFX('hit');

              if (!e.active) {
                this.killEnemy(e);
              }
            }
          }
        });
      }

      // Falcon Dive legendary check:
      if (modifiers && modifiers.hasLegendaryUpgrade('falcon_dive')) {
        this.enemies.forEach(e => {
          if (!e.active) return;
          const ai = e.getComponent<EnemyAIComponent>('ai');
          if (ai && ai.getCurrentState() === EnemyState.DEAD) return;
          const bossAi = e.getComponent<BossAIComponent>('ai');
          if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) return;

          const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
          if (dist < 45 && !this.falconDivedEnemies.has(e.id)) {
            this.falconDivedEnemies.add(e.id);
            this.triggerFalconDive(e);
          }
        });
      }

      if (this.dodgeTimer <= 0) {
        this.isDodging = false;
        if (this.player.gameObject) {
          (this.player.gameObject as Phaser.GameObjects.Sprite).setAlpha(1.0);
          (this.player.gameObject as Phaser.GameObjects.Sprite).clearTint();
        }
        this.playerHealth.setInvulnDuration(1000); // Reset normal invuln dur
        this.logger.debug('Dodge roll complete.');
      } else {
        // Boost velocity during dash roll
        const baseSpeed = modifiers ? modifiers.getModifiedValue('speed', this.selectedGladiator.baseSpeed) : this.selectedGladiator.baseSpeed;
        const dashMult = this.selectedGladiator.id === 'duelist' ? 4.0 : 3.3;
        const dashSpeed = baseSpeed * dashMult;
        this.playerPhysics.setVelocity(
          this.dodgeDirectionX * dashSpeed,
          this.dodgeDirectionY * dashSpeed
        );
      }
    } else {
      if (this.dodgeCooldown > 0) {
        const cooldownTick = this.selectedGladiator.id === 'duelist' ? delta * 1.7 : delta;
        this.dodgeCooldown -= cooldownTick;
      }

      // Read buffered dodge roll input
      const baseMaxCooldown = this.selectedGladiator.id === 'duelist' ? 550 : this.maxDodgeCooldown;
      const currentCooldown = modifiers ? modifiers.getModifiedValue('dodgeCooldown', baseMaxCooldown) : baseMaxCooldown;
      if (input.isDodgeBuffered && this.dodgeCooldown <= 0 && (input.moveX !== 0 || input.moveY !== 0)) {
        this.inputManager.consumeDodge(); // Consume the buffer

        this.isDodging = true;
        this.dodgeTimer = this.dodgeDuration;
        this.dodgeCooldown = currentCooldown;
        this.dashHitEnemies.clear(); // Clear hit track list
        this.falconDivedEnemies.clear(); // Clear falcon dive hits

        // Remember slide direction
        this.dodgeDirectionX = input.moveX;
        this.dodgeDirectionY = input.moveY;

        // Trigger invulnerability frame during dodge roll
        this.playerHealth.takeDamage(0); // Puts into invuln mode
        this.playerHealth.setInvulnDuration(this.dodgeDuration + 100);

        // Chronos Dash upgrade: slow time for 1.5 seconds!
        if (modifiers && modifiers.hasLegendaryUpgrade('time_slow_dodge')) {
          this.timeSlowTimer = 1500;
          this.cameras.main.flash(300, 0, 243, 255, false); // Cyan flash
          AudioManager.getInstance().playSFX('powerup');
        } else {
          AudioManager.getInstance().playSFX('swoosh');
        }

        this.logger.debug('Gladiator executes dodge roll!');
      }
    }
  }

  private handleSwordAim(input: any, time: number, delta: number): void {
    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    const hasAstral = modifiers && modifiers.hasLegendaryUpgrade('astral_arsenal');
    if (!this.player.active) {
      this.swordSprite.setVisible(false);
      return;
    }

    // Smoothly rotate the player body toward the mouse cursor
    const targetAngle = Math.atan2(input.pointerY - this.player.y, input.pointerX - this.player.x);
    if (this.player.gameObject) {
      // Phaser's Angle.RotateTo handles shortest path wrapping
      const currentRot = (this.player.gameObject as Phaser.GameObjects.Sprite).rotation;
      const newRot = Phaser.Math.Angle.RotateTo(currentRot, targetAngle, 0.15); 
      (this.player.gameObject as Phaser.GameObjects.Sprite).setRotation(newRot);
    }

    if (hasAstral) {
      if (this.swordSprite) this.swordSprite.setVisible(false);
      if (this.offhandSwordSprite) this.offhandSwordSprite.setVisible(false);
      if (this.offhand2SwordSprite) this.offhand2SwordSprite.setVisible(false);
      if (this.offhand3SwordSprite) this.offhand3SwordSprite.setVisible(false);
      return;
    }

    const weapon = this.player.getComponent<WeaponComponent>('weapon');
    if (!weapon) return;

    weapon.overrideTargetX = input.pointerX;
    weapon.overrideTargetY = input.pointerY;

    // Anchor sword visual sprite to player with handle offset
    const currentAngle = weapon.getAngle();
    const handleOffset = weapon.handleOffset;
    this.swordSprite.setPosition(
      this.player.x + Math.cos(currentAngle) * handleOffset, 
      this.player.y + Math.sin(currentAngle) * handleOffset
    );

    // Sword rotation is driven by WeaponComponent angular math (spring!)
    this.swordSprite.rotation = currentAngle;

    // Scale sword sprite based on actual weapon length to match physical upgrade hitbox!
    // The texture length is 64, with origin at 0.1, making the visual blade 64 * 0.9 = 57.6 pixels long
    const baseLength = 57.6;
    const lengthScale = weapon.length / baseLength;
    this.swordSprite.setScale(lengthScale);

    const offhandWeapon = this.player.getComponent<WeaponComponent>('offhand_weapon');
    if (offhandWeapon && this.offhandSwordSprite) {
      offhandWeapon.overrideTargetX = input.pointerX;
      offhandWeapon.overrideTargetY = input.pointerY;
      const offhandAngle = offhandWeapon.getAngle();
      this.offhandSwordSprite.setPosition(
        this.player.x + Math.cos(offhandAngle) * handleOffset,
        this.player.y + Math.sin(offhandAngle) * handleOffset
      );
      this.offhandSwordSprite.rotation = offhandAngle;
      this.offhandSwordSprite.setScale(offhandWeapon.length / baseLength);
    }

    const offhandWeapon2 = this.player.getComponent<WeaponComponent>('offhand_weapon_2');
    if (offhandWeapon2 && this.offhand2SwordSprite) {
      offhandWeapon2.overrideTargetX = input.pointerX;
      offhandWeapon2.overrideTargetY = input.pointerY;
      const offhandAngle2 = offhandWeapon2.getAngle();
      this.offhand2SwordSprite.setPosition(
        this.player.x + Math.cos(offhandAngle2) * handleOffset,
        this.player.y + Math.sin(offhandAngle2) * handleOffset
      );
      this.offhand2SwordSprite.rotation = offhandAngle2;
      this.offhand2SwordSprite.setScale(offhandWeapon2.length / baseLength);
    }

    const offhandWeapon3 = this.player.getComponent<WeaponComponent>('offhand_weapon_3');
    if (offhandWeapon3 && this.offhand3SwordSprite) {
      offhandWeapon3.overrideTargetX = input.pointerX;
      offhandWeapon3.overrideTargetY = input.pointerY;
      const offhandAngle3 = offhandWeapon3.getAngle();
      this.offhand3SwordSprite.setPosition(
        this.player.x + Math.cos(offhandAngle3) * handleOffset,
        this.player.y + Math.sin(offhandAngle3) * handleOffset
      );
      this.offhand3SwordSprite.rotation = offhandAngle3;
      this.offhand3SwordSprite.setScale(offhandWeapon3.length / baseLength);
    }

    // Input hooks for future weapon abilities (e.g. Boomerang)
    if (input.isAttackBuffered) {
      this.inputManager.consumeAttack(); // Consume input buffer
      
      const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
      if (weaponArt) {
        weaponArt.trigger();
      }
      
      // Hook for future active abilities
      const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
      if (modifiers && modifiers.hasLegendaryUpgrade('boomerang_blade')) {
        if (this.boomerangCooldown <= 0) {
          const speedCalc = weapon ? weapon.getSpeedDamageMultiplier() : { multiplier: 1.0, isCrit: false };
          this.launchBoomerang(targetAngle, speedCalc.multiplier, speedCalc.isCrit);
          this.boomerangCooldown = 800; // 0.8 seconds cooldown
        }
      }
    }
  }

  private handleSlashPhysics(time: number, delta: number): void {
    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    if (modifiers && modifiers.hasLegendaryUpgrade('astral_arsenal')) return;
    const weapon = this.player.getComponent<WeaponComponent>('weapon');
    if (weapon) {
      this.checkWeaponHits(weapon, false);
    }
    
    const offhandWeapon = this.player.getComponent<WeaponComponent>('offhand_weapon');
    if (offhandWeapon) {
      this.checkWeaponHits(offhandWeapon, true);
    }

    const offhandWeapon2 = this.player.getComponent<WeaponComponent>('offhand_weapon_2');
    if (offhandWeapon2) {
      this.checkWeaponHits(offhandWeapon2, true);
    }

    const offhandWeapon3 = this.player.getComponent<WeaponComponent>('offhand_weapon_3');
    if (offhandWeapon3) {
      this.checkWeaponHits(offhandWeapon3, true);
    }
  }

  private checkWeaponHits(weapon: WeaponComponent, isOffhand: boolean): void {
    const currentAngle = weapon.getAngle();
    const weaponLength = weapon.length;
    const handleOffset = weapon.handleOffset;
    
    const baseX = weapon.owner.x + Math.cos(currentAngle) * handleOffset;
    const baseY = weapon.owner.y + Math.sin(currentAngle) * handleOffset;

    // Multi-sample collision points across blade segment for absolute hit accuracy
    const steps = 3;
    this.enemies.forEach(enemy => {
      if (!enemy.active) return;

      const ai = enemy.getComponent<EnemyAIComponent>('ai');
      if (ai && ai.getCurrentState() === EnemyState.DEAD) return;
      const bossAi = enemy.getComponent<BossAIComponent>('ai');
      if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) return;

      let hasHit = false;
      const isBoss = enemy.id.includes('boss');
      const enemyPhysics = enemy.getComponent<PhysicsComponent>('physics');
      const enemyRadius = enemyPhysics ? enemyPhysics.collisionRadius : (isBoss ? 52 : 24);

      for (let j = 0; j <= steps; j++) {
        const checkDistance = weaponLength * (j / steps);
        const segmentX = baseX + Math.cos(currentAngle) * checkDistance;
        const segmentY = baseY + Math.sin(currentAngle) * checkDistance;

        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, segmentX, segmentY);

        if (dist < enemyRadius + 15) { // 15 is weapon hitbox radius margin
          hasHit = true;
          break;
        }
      }

      if (hasHit) {
        // Prevent contact cheese: the passive sword should no longer gain unfair damage from body overlap.
        const playerPhysics = this.player.getComponent<PhysicsComponent>('physics');
        const enemyPhysics = enemy.getComponent<PhysicsComponent>('physics');
        const pRadius = playerPhysics ? playerPhysics.collisionRadius : 22;
        const eRadius = enemyPhysics ? enemyPhysics.collisionRadius : 24;
        const bodyDist = Phaser.Math.Distance.Between(weapon.owner.x, weapon.owner.y, enemy.x, enemy.y);

        // If centers are extremely close (less than 15px), we negate passive sword hit to prevent exact overlap cheesing.
        if (bodyDist < 15) {
          return; // Skip hit entirely to reward spacing and positioning!
        }

        // Prevent multi-hit framing within a single pass using internal cooldowns
        if (weapon.registerHit(enemy.id)) {
          this.hitEnemy(enemy, currentAngle, weapon, isOffhand);
        }
      }
    });
  }

  private hitEnemy(
    enemy: BaseEntity,
    angle: number,
    weaponOpt?: WeaponComponent,
    isOffhand: boolean = false,
    customDamageMult: number = 1.0,
    forceCrit: boolean = false
  ): void {
    const health = enemy.getComponent<HealthComponent>('health');
    const physics = enemy.getComponent<PhysicsComponent>('physics');
    const ai = enemy.getComponent<EnemyAIComponent>('ai');

    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    const critChanceBonus = modifiers ? modifiers.getModifiedValue('critChance', 0) : 0;
    const critDamageBonus = modifiers ? modifiers.getModifiedValue('critDamage', 0) : 0;

    const weapon = weaponOpt || this.player.getComponent<WeaponComponent>('weapon');
    const speedCalc = weapon 
      ? weapon.getSpeedDamageMultiplier() 
      : { multiplier: 1.0, isCrit: false };

    let isCrit = speedCalc.isCrit || forceCrit;
    if (Math.random() < critChanceBonus) {
      isCrit = true;
    }

    let multiplier = speedCalc.multiplier;
    if (isCrit) {
      // Base crit multiplier is 1.55. If they have critDamageBonus (e.g. +0.45), it is added!
      multiplier = multiplier * (1.55 + critDamageBonus);
    }

    const isAstral = weapon && weapon.owner.id.startsWith('astral_blade_');
    let baseDamage = weapon ? weapon.baseDamage : (this.player.getComponent<WeaponComponent>('weapon')?.baseDamage || 15);
    if (isOffhand) {
      baseDamage *= 0.70; // 70% damage multiplier for offhand sword
    }
    if (isAstral && this.selectedGladiator.id === 'knight') {
      baseDamage *= 1.30; // Sir Galahad hits harder
    }
    let damage = Math.round(baseDamage * multiplier * customDamageMult);

    if (isCrit && isAstral) {
      AudioManager.getInstance().playSFX('astral_crit');
    }

    // 6. Executioner's Instinct legendary:
    if (modifiers && modifiers.hasLegendaryUpgrade('executioners_instinct')) {
      const isBoss = enemy.id.includes('boss') || enemy.id.includes('colossus') || enemy.id.includes('placeholder');
      const maxHp = health.getMaxHp();
      const currentHp = health.getHp();
      const hpPercentage = currentHp / maxHp;

      if (isBoss) {
        if (hpPercentage < 0.10) {
          damage = Math.round(damage * 1.40);
        }
      } else {
        if (hpPercentage < 0.20) {
          damage = Math.round(damage * 2.0);
        }
      }
    }

    if (health && health.takeDamage(damage)) {
      // Track Weapon Art specific telemetry:
      const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
      if (weaponArt && (weaponArt.currentState === 'ACTIVE' || weaponArt.currentState === 'RECOVERY')) {
        weaponArt.telemetryDamageDealt += damage;
        if (isCrit) {
          weaponArt.telemetryCriticalHits += 1;
        }
      }

      // Keep track of lifetime stats
      this.statsDamageDealt += damage;
      if (isCrit) {
        this.statsCrits += 1;
      }

      // 3. Blade Cyclone upgrade hit count tracking
      if (modifiers && modifiers.hasLegendaryUpgrade('blade_cyclone')) {
        this.bladeCycloneHits += 1;
        if (this.bladeCycloneHits >= 8) {
          this.bladeCycloneHits = 0;
          this.bladeCycloneActiveTimer = 3000; // 3 seconds
          AudioManager.getInstance().playSFX('powerup');
        }
      }

      // 4. Frozen Edge upgrade: crit-based freeze or slow
      if (isCrit && modifiers && modifiers.hasLegendaryUpgrade('frozen_edge')) {
        if (Math.random() < 0.25) {
          const isBoss = enemy.id.includes('boss') || enemy.id.includes('colossus') || enemy.id.includes('placeholder');
          if (isBoss) {
            (enemy as any).slowedTimer = 1500;
          } else {
            (enemy as any).frozenTimer = 1500;
          }
          this.vfxManager.spawnSparks(enemy.x, enemy.y, 0x80d8ff, 6); // Ice sparks
        }
      }

      // 5. Infernal Momentum upgrade: ignite enemies
      if (modifiers && modifiers.hasLegendaryUpgrade('infernal_momentum')) {
        const vel = weapon ? weapon.getAngularVelocity() : 6.0;
        const velRatio = Phaser.Math.Clamp(vel / 12.0, 0, 1.0);
        const burnDuration = 2000 + velRatio * 4000;
        const burnDPS = 4 + velRatio * 12; // 4 to 16 damage per tick
        this.applyBurnStack(enemy, burnDuration, burnDPS);
      }

      // 7. Meteor Slam upgrade: heavy swings (crits) create a small meteor impact
      if (modifiers && modifiers.hasLegendaryUpgrade('meteor_slam')) {
        if (Math.random() < (isCrit ? 0.40 : 0.15)) {
          this.triggerMeteorSlam(enemy.x, enemy.y);
        }
      }

      // Ignis the Flameborn passives: Firebrand & Burning Ash Fields
      if (this.selectedGladiator.id === 'mage') {
        // 1. Add Firebrand burn stack
        this.applyBurnStack(enemy, 3000); // lasts 3 seconds

        // 2. Chance to spawn Burning Ash Field (100% on crit, 30% on normal)
        if (isCrit || Math.random() < 0.30) {
          this.spawnBurningAshField(enemy.x, enemy.y);
        }
      }

      // Check for dual_wield ghost strike phantom blade sweeps (replaced by real offhand sword)

      // 1. Explosive Crits legendary upgrade
      if (isCrit && modifiers && modifiers.hasLegendaryUpgrade('explosive_crits')) {
        this.triggerExplosiveCrit(enemy.x, enemy.y, damage);
      }

      // 2. Chain Lightning legendary upgrade
      if (modifiers && modifiers.hasLegendaryUpgrade('chain_lightning') && Math.random() < 0.30) {
        this.triggerChainLightning(enemy, damage);
      }

      // Apply heavy knockback push vector (scaled by criticals and enemy weight)
      if (physics) {
        const baseKnockback = weapon ? weapon.baseKnockback : 220;
        const force = baseKnockback * (isCrit ? 1.55 : 1.0) * (enemy.id.includes('heavy') ? 0.6 : 1.0);
        physics.setVelocity(Math.cos(angle) * force, Math.sin(angle) * force);
      }

      // Trigger active stun state on enemy AI State Machine
      if (ai && typeof (ai as any).stun === 'function') {
        (ai as any).stun(isCrit ? 450 : 250);
      }
      const bossAi = enemy.getComponent<any>('ai');
      if (bossAi && typeof bossAi.receiveHit === 'function') {
        bossAi.receiveHit(isCrit);
      }

      // Layer hit impulse onto camera follow tracker
      this.cameraImpulseX = -Math.cos(angle) * (isCrit ? 22 : 12);
      this.cameraImpulseY = -Math.sin(angle) * (isCrit ? 22 : 12);

      // Spawn spark particles (extra sparks and bright colors on Crit!)
      this.vfxManager.spawnSparks(
        enemy.x, 
        enemy.y, 
        isCrit ? 0xffcc00 : (this.isBedlamMode ? 0xffffff : 0xcc0000), // Golden crit or deep blood red
        isCrit ? 18 : 8
      );

      // Create floating damage pop-up numbers
      this.vfxManager.createDamageText(enemy.x, enemy.y - 20, damage, isCrit);

      // Score additions and feedback
      this.score += isCrit ? 25 : 10;
      this.updateHUDValues();

      // Hitstop Freeze frame trigger (longer weight on Crit!)
      this.hitstopDuration = isCrit ? 80 : 45; 
      
      // Enemy flash feedback (quick white flash on take damage, skipped for boss entities)
      if (enemy.gameObject && enemy.gameObject instanceof Phaser.GameObjects.Sprite && !enemy.id.includes('boss')) {
        const sprite = enemy.gameObject as Phaser.GameObjects.Sprite;
        sprite.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        this.time.delayedCall(60, () => {
          if (enemy && enemy.active && enemy.gameObject) {
            const s = enemy.gameObject as Phaser.GameObjects.Sprite;
            s.clearTint();
          }
        });
      }

      // Check if enemy died
      if (!enemy.active) {
        this.killEnemy(enemy);
      }
    }
  }

  private triggerGhostBladeStrike(enemy: BaseEntity, baseAngle: number, multiplier: number): void {
    // Summon visual ghost trail swept opposite direction
    const ghostAngle = baseAngle + Math.PI; // 180 degrees opposite
    
    // Create quick circular flash
    const flash = this.add.circle(this.player.x, this.player.y, 44, 0xa855f7, 0.2);
    this.tweens.add({
      targets: flash,
      scale: 1.4,
      alpha: 0,
      duration: 150,
      onComplete: () => flash.destroy()
    });

    // Deal 70% damage to nearby enemies behind the player
    this.enemies.forEach(e => {
      if (!e.active || e === enemy) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
      if (dist < 75) {
        const angleToEnemy = Phaser.Math.Angle.Between(this.player.x, this.player.y, e.x, e.y);
        const diff = Math.abs(Phaser.Math.Angle.Wrap(angleToEnemy - ghostAngle));
        if (diff < Math.PI / 3) {
          const weapon = this.player.getComponent<WeaponComponent>('weapon');
          const baseDamage = weapon ? weapon.baseDamage : 15;
          const ghostDamage = Math.round(baseDamage * multiplier * 0.70);

          const health = e.getComponent<HealthComponent>('health');
          if (health && health.takeDamage(ghostDamage)) {
            this.statsDamageDealt += ghostDamage;
            this.vfxManager.createDamageText(e.x, e.y - 15, ghostDamage, false);
            this.vfxManager.spawnSparks(e.x, e.y, 0xa855f7, 4); // Purple ghostly sparks

            if (!e.active) {
              this.killEnemy(e);
            }
          }
        }
      }
    });
  }

  private triggerExplosiveCrit(x: number, y: number, mainDamage: number = 70): void {
    AudioManager.getInstance().playSFX('slash');
    this.cameras.main.shake(150, 0.008);
    this.explosionCount++;

    // Expanding visual flame ring
    const ring = this.add.circle(x, y, 20, 0xff5500, 0.45);
    if (!ring) {
      console.error('Failed to create circle for explosive crit');
      return;
    }
    this.tweens.add({
      targets: ring,
      scale: 6,
      alpha: 0,
      duration: 400,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy()
    });

    // Fire explosion sparks
    this.vfxManager.spawnSparks(x, y, 0xffaa00, 15);

    // Apply damage to all enemies within 120px of explosion (scaling with main hit damage, 50% of it)
    const explosionDamage = Math.round(mainDamage * 0.50);

    this.enemies.forEach(e => {
      if (!e.active) return;
      const ai = e.getComponent<EnemyAIComponent>('ai');
      if (ai && ai.getCurrentState() === EnemyState.DEAD) return;
      const bossAi = e.getComponent<BossAIComponent>('ai');
      if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) return;

      const dist = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (dist < 120) {
        const health = e.getComponent<HealthComponent>('health');
        if (health && health.takeDamage(explosionDamage)) {
          this.statsDamageDealt += explosionDamage;
          this.vfxManager.createDamageText(e.x, e.y - 15, explosionDamage, false);
          this.vfxManager.spawnSparks(e.x, e.y, 0xff5500, 4);

          // Slight outward knockback vector
          const physics = e.getComponent<PhysicsComponent>('physics');
          if (physics) {
            const pushAngle = Phaser.Math.Angle.Between(x, y, e.x, e.y);
            physics.setVelocity(Math.cos(pushAngle) * 180, Math.sin(pushAngle) * 180);
          }

          if (!e.active) {
            this.killEnemy(e);
          }
        }
      }
    });
  }

  public triggerChainLightning(sourceEnemy: BaseEntity, mainDamage: number = 30): void {
    const targets: BaseEntity[] = [];
    const maxTargets = 3;
    const maxRange = 160;

    let currentSource = sourceEnemy;

    for (let i = 0; i < maxTargets; i++) {
      let bestTarget: BaseEntity | null = null;
      let bestDist = maxRange;

      this.enemies.forEach(e => {
        if (!e.active || e === sourceEnemy || targets.includes(e)) return;
        const ai = e.getComponent<EnemyAIComponent>('ai');
        if (ai && ai.getCurrentState() === EnemyState.DEAD) return;
        const bossAi = e.getComponent<BossAIComponent>('ai');
        if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) return;

        const d = Phaser.Math.Distance.Between(currentSource.x, currentSource.y, e.x, e.y);
        if (d < bestDist) {
          bestDist = d;
          bestTarget = e;
        }
      });

      if (bestTarget) {
        targets.push(bestTarget);
        currentSource = bestTarget;
      } else {
        break;
      }
    }

    if (targets.length === 0) return;

    // Draw lightning line paths on top of everything
    const linesGraphics = this.add.graphics();
    linesGraphics.setDepth(20); // Render above player/enemies
    linesGraphics.lineStyle(3, 0x00f3ff, 1.0);
    linesGraphics.beginPath();

    let startX = sourceEnemy.x;
    let startY = sourceEnemy.y;

    // Keep track for debugger
    this.lastLightningTargets = targets.map(t => t.id);

    targets.forEach((target, index) => {
      // Draw zigzag line
      const midX = (startX + target.x) / 2 + Phaser.Math.Between(-15, 15);
      const midY = (startY + target.y) / 2 + Phaser.Math.Between(-15, 15);

      linesGraphics.moveTo(startX, startY);
      linesGraphics.lineTo(midX, midY);
      linesGraphics.lineTo(target.x, target.y);

      startX = target.x;
      startY = target.y;

      // Damage falloff: 50% of main hit damage, reduced by 15% on each subsequent bounce
      const multiplier = Math.max(0.15, 0.50 - index * 0.15);
      const chainDamage = Math.round(mainDamage * multiplier);

      // Deal damage
      const health = target.getComponent<HealthComponent>('health');
      if (health && health.takeDamage(chainDamage)) {
        this.statsDamageDealt += chainDamage;
        this.vfxManager.createDamageText(target.x, target.y - 15, chainDamage, false);
        this.vfxManager.spawnSparks(target.x, target.y, 0x00ffff, 4);

        if (!target.active) {
          this.killEnemy(target);
        }
      }
    });

    linesGraphics.strokePath();

    // Fade lightning paths quick
    this.tweens.add({
      targets: linesGraphics,
      alpha: 0,
      duration: 180,
      onComplete: () => linesGraphics.destroy()
    });
  }

  

  private killEnemy(enemy: BaseEntity): void {
    // 1. Increment lifetime beasts slain
    this.statsBeastsSlain += 1;

    // 2. Spawn death particles (different colors depending on elite/boss state)
    let deathColor = 0x991b1b;
    let particleCount = 12;

    const isBoss = enemy.id.includes('boss');
    const isMiniBoss = enemy.id.includes('mini');
    const isElite = (enemy as any).isElite;

    if (isBoss) {
      deathColor = 0xff3366;
      particleCount = 45;
    } else if (isMiniBoss) {
      deathColor = 0xffd700;
      particleCount = 30;
    } else if (isElite) {
      deathColor = 0xf59e0b;
      particleCount = 20;
    }

    this.vfxManager.spawnSparks(enemy.x, enemy.y, deathColor, particleCount);

    // 3. Drop Scaling rewards (Gold coins, XP Orbs, Health droplets)
    let coinsToDrop = 2;
    let xpToDrop = 5;
    let dropChance = 0.05; // 5% base chance for health droplet

    if (isBoss) {
      coinsToDrop = Phaser.Math.Between(20, 40);
      xpToDrop = 60;
      dropChance = 1.0; // Guaranteed droplets!
    } else if (isMiniBoss) {
      coinsToDrop = Phaser.Math.Between(6, 8);
      xpToDrop = 20;
      dropChance = 0.50;
    } else if (isElite) {
      coinsToDrop = Phaser.Math.Between(6, 8);
      xpToDrop = 12;
      dropChance = 0.25;
    } else if (enemy.id.includes('heavy')) {
      coinsToDrop = Phaser.Math.Between(4, 5);
      xpToDrop = 8;
      dropChance = 0.10;
    }

        const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    const luck = modifiers ? modifiers.getModifiedValue('luck', 1.0) : 1.0;
    this.lootManager.spawnLootFromEnemy(enemy, coinsToDrop, xpToDrop, dropChance * luck);
    if (isBoss) {
      this.lootManager.spawnDroplet(enemy.x + 25, enemy.y + 25);
    }

    // Sanguine Thirst legendary: 12% chance to drop health droplet on kill
    if (modifiers && modifiers.hasLegendaryUpgrade('vampiric_blade')) {
      if (Math.random() < 0.12) {
        this.lootManager.spawnDroplet(enemy.x, enemy.y);
      }
    }

    // Increase rage
    this.increaseRage(enemy.id.includes('heavy') ? 25 : 12);

    // 4. Void Rift legendary: Every 20 kills opens a miniature Void Rift.
    if (modifiers && modifiers.hasLegendaryUpgrade('void_rift')) {
      this.voidRiftKills += 1;
      if (this.voidRiftKills >= 20) {
        this.voidRiftKills = 0;
        this.spawnVoidRift(enemy.x, enemy.y);
      }
    }

    // 5. Soul Collector legendary: Every enemy killed permanently grants +0.15% weapon velocity (Maximum: +30%)
    if (modifiers && modifiers.hasLegendaryUpgrade('soul_collector')) {
      this.soulCollectorKills += 1;
      this.soulCollectorVelocityBonus = Math.min(0.30, this.soulCollectorKills * 0.0015);
      
      modifiers.removeModifier('soul_collector_velocity');
      modifiers.addModifier({
        id: 'soul_collector_velocity',
        stat: 'attackSpeed',
        type: 'multiply',
        value: 1.0 + this.soulCollectorVelocityBonus
      });
      
      this.vfxManager.spawnSparks(enemy.x, enemy.y, 0xa855f7, 3);
    }

    // Play hit sfx
    AudioManager.getInstance().playSFX('hit');
  }

  

  

  

  

  

  private gainXP(amount: number): void {
    this.playerXP += amount;
    this.vfxManager.createFloatingXPText(this.player.x + Phaser.Math.Between(-15, 15), this.player.y - 25, `+${amount} XP`, '#00f3ff');

    while (this.playerXP >= this.playerXPNeeded) {
      this.playerXP -= this.playerXPNeeded;
      this.levelUp();
    }

    this.updateHUDValues();
  }

  private levelUp(): void {
    this.playerLevel += 1;
    this.playerXPNeeded = Math.round(this.playerXPNeeded * 1.35); // 35% exponential curve!

    if (this.playerLevel > this.statsMaxLevel) {
      this.statsMaxLevel = this.playerLevel;
    }

    // Heals player slightly on level up (1 heart!)
    this.playerHealth.heal(1);

    // Dynamic level up particles
    this.vfxManager.spawnSparks(this.player.x, this.player.y, 0x00f3ff, 25);
    
    // Level up sound!
    AudioManager.getInstance().playSFX('powerup');

    // Create huge level up floating text
    this.vfxManager.createFloatingXPText(this.player.x, this.player.y - 45, 'LEVEL UP!', '#ffff00', 16);

    // Open upgrade overlay
    this.triggerUpgradeSelection();
  }

  

  private triggerUpgradeSelection(): void {
    this.isPaused = true;
    this.physics.pause();
    this.setMobileControlsVisible(false); // Hide touch buttons during level-up reward menu

    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    const luck = modifiers ? modifiers.getModifiedValue('luck', 1.0) : 1.0;
    
    const currentWave = this.waveDirector.getWaveNumber();
    let choices = generateUpgradeChoices(luck, this.excludedUpgrades, currentWave);

    // Handle exhaustion of upgrades pool by providing high-quality Blessing fallback rewards
    if (choices.length === 0) {
      choices = [
        {
          id: 'fallback_gold',
          name: 'Blessing of Wealth',
          description: 'All upgrades have been mastered. Grants 100 Gold coins to purchase health or weapons.',
          rarity: UpgradeRarity.LEGENDARY,
          category: 'legendary'
        },
        {
          id: 'fallback_heal',
          name: 'Blessing of Vitality',
          description: 'All upgrades have been mastered. Restores 3 full hearts to keep you fighting.',
          rarity: UpgradeRarity.LEGENDARY,
          category: 'legendary'
        },
        {
          id: 'fallback_damage',
          name: 'Blessing of Power',
          description: 'All upgrades have been mastered. Permanently increases all damage dealt by +10%.',
          rarity: UpgradeRarity.LEGENDARY,
          category: 'legendary'
        }
      ];
    }

    this.activeUpgradeChoices = choices;

    const container = document.getElementById('bb-upgrade-cards-container');
    if (container) {
      container.innerHTML = choices.map((choice, index) => {
        const rarityConfig = RARITY_CONFIGS[choice.rarity];
        const numberLabel = index + 1;
        const categoryLabel = choice.category === 'legendary' ? 'Ability' : choice.category === 'mythical' ? 'Mythical' : choice.category;

        return `
          <div onclick="window.selectUpgrade(${index})" style="
            flex: 1;
            min-width: 200px;
            max-width: 240px;
            background: rgba(18, 20, 38, 0.7);
            border: 2px solid ${rarityConfig.color};
            border-radius: 12px;
            padding: 20px;
            text-align: center;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.1, 0.8, 0.3, 1);
            position: relative;
            box-shadow: 0 0 15px ${rarityConfig.glowColor};
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: 280px;
          " onmouseover="this.style.transform='translateY(-6px)'; this.style.background='rgba(26, 29, 54, 0.95)'; this.style.boxShadow='0 0 25px ${rarityConfig.glowColor}'" onmouseout="this.style.transform='translateY(0)'; this.style.background='rgba(18, 20, 38, 0.7)'; this.style.boxShadow='0 0 15px ${rarityConfig.glowColor}'">
            
            <!-- Keyboard Shortcut Pill -->
            <div style="position: absolute; top: 12px; right: 12px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); border-radius: 4px; padding: 2px 6px; font-family: 'DM Mono', monospace; font-size: 10px; color: #a1a1aa; font-weight: 700;">
              Key ${numberLabel}
            </div>

            <div>
              <!-- Rarity Header -->
              <span style="
                font-family: 'Space Grotesk', sans-serif;
                font-size: 10px;
                font-weight: 800;
                letter-spacing: 1.5px;
                color: ${rarityConfig.color};
                text-transform: uppercase;
                display: block;
                margin-bottom: 8px;
              ">${rarityConfig.name}</span>

              <!-- Upgrade Title -->
              <h3 style="
                font-family: 'Fraunces', serif;
                font-size: 16px;
                font-weight: 700;
                color: #ffffff;
                margin: 0 0 12px 0;
                line-height: 1.2;
              ">${choice.name}</h3>

              <!-- Category Badge -->
              <span style="
                font-family: 'Space Grotesk', sans-serif;
                font-size: 9px;
                font-weight: 700;
                background: rgba(255,255,255,0.04);
                border: 1px solid rgba(255,255,255,0.08);
                color: #a1a1aa;
                padding: 2px 8px;
                border-radius: 12px;
                display: inline-block;
                margin-bottom: 16px;
                text-transform: uppercase;
              ">${categoryLabel}</span>

              <!-- Upgrade Description -->
              <p style="
                font-size: 12px;
                color: #d1d5db;
                line-height: 1.5;
                margin: 0;
              ">${choice.description}</p>
            </div>

            <!-- Choose Button -->
            <button class="btn" style="
              width: 100%;
              height: 36px;
              margin-top: 20px;
              border-radius: 6px;
              font-family: 'Space Grotesk', sans-serif;
              font-size: 12px;
              font-weight: 700;
              background: ${rarityConfig.color};
              color: #000;
              border: none;
              cursor: pointer;
            ">Equip Upgrade</button>
          </div>
        `;
      }).join('');
    }

    const overlay = document.getElementById('bb-upgrade-overlay');
    if (overlay) {
      overlay.style.display = 'flex';
      overlay.style.pointerEvents = 'auto';
    }

    // Mount keyboard input handler in scene
    this.upgradeKeysActive = true;
  }

  protected applyDirectUpgrade(choice: UpgradeDefinition): void {
    // Handle blessing fallbacks directly without adding them to build lists or excludeds
    if (choice.id === 'fallback_gold') {
      this.collectedGold += 100;
      this.vfxManager.createFloatingXPText(this.player.x, this.player.y - 45, '+100 Gold', '#ffd700', 14);
      AudioManager.getInstance().playSFX('coins');
      this.updateHUDValues();
      return;
    } else if (choice.id === 'fallback_heal') {
      this.playerHealth.heal(3);
      this.vfxManager.createFloatingXPText(this.player.x, this.player.y - 45, '+3 Hearts', '#ff3366', 14);
      this.updateHUDValues();
      return;
    } else if (choice.id === 'fallback_damage') {
      const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
      if (modifiers) {
        modifiers.addModifier({
          id: 'fallback_damage_buff_' + Date.now(),
          stat: 'damage',
          type: 'multiply',
          value: 0.10
        });
      }
      this.vfxManager.createFloatingXPText(this.player.x, this.player.y - 45, '+10% Damage', '#ffaa00', 14);
      this.updateHUDValues();
      return;
    }

    // Store in build list
    this.chosenUpgradesList.push(choice);

    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');

    // Limit legendaries and mythicals to once per run and register passive activation
    if (choice.category === 'legendary' || choice.category === 'mythical') {
      this.excludedUpgrades.add(choice.id);
      if (modifiers) {
        modifiers.addLegendaryUpgrade(choice.id);
      }
    }

    // Apply modifier properties
    if (modifiers && choice.stat && choice.modType && choice.value !== undefined) {
      modifiers.addModifier({
        id: choice.id,
        stat: choice.stat,
        type: choice.modType,
        value: choice.value
      });

      // Special cases: if we upgraded maxHp, recalculate
      if (choice.stat === 'maxHp') {
        const baseHp = this.selectedGladiator.baseHp;
        this.playerHealth.setMaxHp(modifiers.getModifiedValue('maxHp', baseHp));
        this.playerHealth.heal(choice.value);
      }
    }

    // Process specialized Legendary triggers
    if (choice.id === 'summon_companion') {
      if (!this.hasSentinel) {
        this.hasSentinel = true;
        for (let i = 0; i < 2; i++) {
          const s = this.add.sprite(this.player.x, this.player.y - 40, 'xp-texture');
          s.setTint(0x00f3ff);
          s.setScale(1.5);
          this.sentinelSprites.push(s);
        }
      }
    } else if (choice.id === 'dual_wield') {
      if (this.selectedWeaponId === 'twin_daggers') {
        // Seraphina / Dual daggers gets 2 extra spectral daggers for a 4-dagger cross!
        if (!this.player.getComponent('offhand_weapon_2')) {
          const offhand2 = new WeaponComponent(this.player);
          offhand2.weight = 0.45;
          offhand2.baseDamage = 18;
          offhand2.length = 50;
          offhand2.handleOffset = 22;
          offhand2.angleOffset = Math.PI / 2; // +90 deg
          this.player.addComponent('offhand_weapon_2', offhand2);
          offhand2.init();

          this.offhand2SwordSprite = this.add.sprite(this.player.x, this.player.y, 'sword-texture');
          this.offhand2SwordSprite.setOrigin(0.1, 0.5);
          this.offhand2SwordSprite.setTint(0xa855f7); // Spectral purple look
          this.offhand2SwordSprite.setAlpha(0.8);
        }
        if (!this.player.getComponent('offhand_weapon_3')) {
          const offhand3 = new WeaponComponent(this.player);
          offhand3.weight = 0.45;
          offhand3.baseDamage = 18;
          offhand3.length = 50;
          offhand3.handleOffset = 22;
          offhand3.angleOffset = -Math.PI / 2; // -90 deg
          this.player.addComponent('offhand_weapon_3', offhand3);
          offhand3.init();

          this.offhand3SwordSprite = this.add.sprite(this.player.x, this.player.y, 'sword-texture');
          this.offhand3SwordSprite.setOrigin(0.1, 0.5);
          this.offhand3SwordSprite.setTint(0xa855f7); // Spectral purple look
          this.offhand3SwordSprite.setAlpha(0.8);
        }
      } else {
        if (!this.player.getComponent('offhand_weapon')) {
          const offhand = new WeaponComponent(this.player);
          offhand.angleOffset = Math.PI; // Opposite direction
          this.player.addComponent('offhand_weapon', offhand);
          offhand.init();

          this.offhandSwordSprite = this.add.sprite(this.player.x, this.player.y, 'sword-texture');
          this.offhandSwordSprite.setOrigin(0.1, 0.5);
          this.offhandSwordSprite.setTint(0xa855f7); // Spectral purple look
          this.offhandSwordSprite.setAlpha(0.8);
        }
      }
    }

    // Visual feedback
    this.vfxManager.spawnSparks(this.player.x, this.player.y, 0xffd700, 15);
    AudioManager.getInstance().playSFX('powerup');
    this.logger.info(`Gladiator equipped upgrade: ${choice.name}`);

    this.updateHUDValues();
  }

  private applyUpgradeSelection(index: number): void {
    if (index < 0 || index >= this.activeUpgradeChoices.length) return;
    const choice = this.activeUpgradeChoices[index];

    this.upgradeKeysActive = false;

    const overlay = document.getElementById('bb-upgrade-overlay');
    if (overlay) overlay.style.display = 'none';

    this.isPaused = false;
    this.physics.resume();
    this.setMobileControlsVisible(true); // Restore touch buttons when returning to gameplay

    this.applyDirectUpgrade(choice);
  }

  private updateLegendaryProjectiles(delta: number): void {
    // 1. Starbound Sentinel companion float and shoot
    if (this.hasSentinel && this.sentinelSprites.length > 0) {
      this.sentinelSprites.forEach((sprite, index) => {
        // Float smoothly near player
        const targetX = this.player.x + (index === 0 ? -35 : 35);
        const targetY = this.player.y - 35;
        sprite.x += (targetX - sprite.x) * 0.1;
        sprite.y += (targetY - sprite.y) * 0.1;
      });

      // Shoot cooldown
      if (this.sentinelShootCooldown > 0) {
        this.sentinelShootCooldown -= delta;
      } else {
        // Find nearest active enemy
        let nearest: BaseEntity | null = null;
        let minDist = 250; // 250px range
        this.enemies.forEach(e => {
          if (!e.active) return;
          const ai = e.getComponent<any>('ai');
          if (ai && ai.getCurrentState && ai.getCurrentState() === 10) return; // DEAD state
          const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
          if (d < minDist) {
            minDist = d;
            nearest = e;
          }
        });

        if (nearest) {
          this.sentinelSprites.forEach(sprite => {
            const bullet = this.add.sprite(sprite.x, sprite.y, 'xp-texture');
            bullet.setTint(0x00f3ff);
            bullet.setScale(0.8);
            
            const angle = Phaser.Math.Angle.Between(sprite.x, sprite.y, nearest!.x, nearest!.y);
            (bullet as any).vx = Math.cos(angle) * 350;
            (bullet as any).vy = Math.sin(angle) * 350;
            (bullet as any).life = 2000; // 2 seconds lifespan
            
            const weapon = this.player.getComponent<any>('weapon');
            const baseDmg = weapon ? weapon.baseDamage : 25;
            const bulletDmg = Math.max(15, Math.round(baseDmg * 0.6));
            (bullet as any).damage = bulletDmg;
            
            this.activeBullets.push(bullet);
          });
          this.sentinelShootCooldown = 400; // 5 bullets per 2 seconds
          AudioManager.getInstance().playSFX('swoosh');
        }
      }
    }
    
    // 2. Update active companion bullets
    this.activeBullets = this.activeBullets.filter(b => {
      b.x += (b as any).vx * (delta / 1000);
      b.y += (b as any).vy * (delta / 1000);
      (b as any).life -= delta;

      if ((b as any).life <= 0) {
        b.destroy();
        return false;
      }

      // Collide with enemies
      let hasHit = false;
      this.enemies.forEach(e => {
        if (!e.active || hasHit) return;
        const ai = e.getComponent<EnemyAIComponent>('ai');
        if (ai && ai.getCurrentState() === EnemyState.DEAD) return;
        const bossAi = e.getComponent<BossAIComponent>('ai');
        if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) return;

        const dist = Phaser.Math.Distance.Between(b.x, b.y, e.x, e.y);
        if (dist < 26) {
          hasHit = true;
          const health = e.getComponent<HealthComponent>('health');
          const dmg = (b as any).damage || 15;
          if (health && health.takeDamage(dmg)) {
            this.statsDamageDealt += dmg;
            this.vfxManager.createDamageText(e.x, e.y - 15, dmg, false);
            this.vfxManager.spawnSparks(e.x, e.y, 0x00f3ff, 4);
            AudioManager.getInstance().playSFX('hit');
            if (!e.active) {
              this.killEnemy(e);
            }
          }
        }
      });

      if (hasHit) {
        b.destroy();
        return false;
      }

      return true;
    });

    // 3. Update active boomerangs
    this.activeBoomerangs = this.activeBoomerangs.filter(bm => {
      bm.angle += 18; // Spin visual

      const state = (bm as any).state;
      const life = (bm as any).life - delta;
      (bm as any).life = life;

      if (state === 'out') {
        bm.x += (bm as any).vx * (delta / 1000);
        bm.y += (bm as any).vy * (delta / 1000);

        // Gradually slow down Out velocity
        (bm as any).vx *= 0.94;
        (bm as any).vy *= 0.94;

        if (life <= 1400) {
          (bm as any).state = 'return';
        }
      } else {
        // Pull back towards player
        const angle = Phaser.Math.Angle.Between(bm.x, bm.y, this.player.x, this.player.y);
        const speed = 400; // Return velocity speed
        bm.x += Math.cos(angle) * speed * (delta / 1000);
        bm.y += Math.sin(angle) * speed * (delta / 1000);

        // Collision with player to catch boomerang
        const distToPlayer = Phaser.Math.Distance.Between(bm.x, bm.y, this.player.x, this.player.y);
        if (distToPlayer < 24) {
          bm.destroy();
          AudioManager.getInstance().playSFX('coin'); // Catch sfx
          return false;
        }
      }

      // Check damage overlap on enemies
      this.enemies.forEach(e => {
        if (!e.active) return;
        const ai = e.getComponent<EnemyAIComponent>('ai');
        if (ai && ai.getCurrentState() === EnemyState.DEAD) return;
        const bossAi = e.getComponent<BossAIComponent>('ai');
        if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) return;

        const dist = Phaser.Math.Distance.Between(bm.x, bm.y, e.x, e.y);
        if (dist < 32) {
          const hitTracker = (bm as any).hitTracker as Set<string>;
          if (!hitTracker.has(e.id)) {
            hitTracker.add(e.id);

            // Deal damage scaling with weapon velocity
            const dmg = (bm as any).damage || 20;
            const isCrit = (bm as any).isCrit || false;
            const health = e.getComponent<HealthComponent>('health');
            if (health && health.takeDamage(dmg)) {
              this.statsDamageDealt += dmg;
              this.vfxManager.createDamageText(e.x, e.y - 15, dmg, isCrit);
              this.vfxManager.spawnSparks(e.x, e.y, isCrit ? 0xffcc00 : 0x3b82f6, isCrit ? 10 : 4);
              AudioManager.getInstance().playSFX('hit');
              
              if (!e.active) {
                this.killEnemy(e);
              }
            }
          }
        }
      });

      if (life <= 0) {
        bm.destroy();
        return false;
      }

      return true;
    });
  }

  private launchBoomerang(angle: number, speedMultiplier: number = 1.0, isCrit: boolean = false): void {
    const bm = this.add.sprite(this.player.x, this.player.y, 'sword-texture');
    bm.setScale(0.4);
    bm.setTint(isCrit ? 0xffcc00 : 0x3b82f6); // Golden spectral edge if crit!
    
    (bm as any).vx = Math.cos(angle) * 550;
    (bm as any).vy = Math.sin(angle) * 550;
    (bm as any).state = 'out';
    (bm as any).life = 2800; // max 2.8 second lifespan
    (bm as any).hitTracker = new Set<string>();
    (bm as any).damage = Math.round(20 * speedMultiplier);
    (bm as any).isCrit = isCrit;

    this.activeBoomerangs.push(bm);
    AudioManager.getInstance().playSFX('swoosh');
  }

  private increaseRage(amount: number): void {
    if (this.isBedlamMode) return;

    this.bedlamRage = Math.min(100, this.bedlamRage + amount);
    this.updateHUDValues();

    if (this.bedlamRage >= 100) {
      this.activateBedlamMode();
    }
  }

  private activateBedlamMode(): void {
    this.isBedlamMode = true;
    this.bedlamTimer = this.bedlamDuration;
    
    // Screen visual flash
    this.cameras.main.flash(400, 205, 162, 80, false);
    AudioManager.getInstance().playSFX('powerup');
    this.logger.info('!!! GLADIATOR IS IN BEDLAM MODE !!!');
  }

  private handleBedlamMode(delta: number): void {
    if (!this.isBedlamMode) return;

    this.bedlamTimer -= delta;
    this.bedlamRage = (this.bedlamTimer / this.bedlamDuration) * 100;

    // Rainbow spark trails
    if (Math.random() < 0.2) {
      this.vfxManager.spawnSparks(
        this.player.x + Phaser.Math.Between(-15, 15),
        this.player.y + Phaser.Math.Between(-15, 15),
        Phaser.Display.Color.HSLToColor(Math.random(), 1.0, 0.5).color,
        2
      );
    }

    if (this.bedlamTimer <= 0) {
      this.isBedlamMode = false;
      this.bedlamRage = 0;
      this.updateHUDValues();
      this.logger.info('Bedlam Mode subsided.');
    }
  }

  private handleEnemiesAI(time: number, delta: number): void {
    this.updateEliteMechanics(time, delta);
    const baseEnemyDelta = this.timeSlowTimer > 0 ? delta * 0.4 : delta; // Slow down enemies by 60% during Chronos Dash

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (!enemy.active) {
        this.enemies.splice(i, 1);
        i--;
        continue;
      }

      let enemyDelta = baseEnemyDelta;

      // Handle Frozen state
      if ((enemy as any).frozenTimer && (enemy as any).frozenTimer > 0) {
        (enemy as any).frozenTimer -= delta;
        enemyDelta = 0;
        
        // Stop movement
        const phys = enemy.getComponent<PhysicsComponent>('physics');
        if (phys) {
          phys.vx = 0;
          phys.vy = 0;
          phys.targetVx = 0;
          phys.targetVy = 0;
        }

        // Apply light blue ice tint
        if (enemy.gameObject && 'setTint' in enemy.gameObject) {
          (enemy.gameObject as any).setTint(0x80d8ff);
        }

        if ((enemy as any).frozenTimer <= 0) {
          if (enemy.gameObject && 'clearTint' in enemy.gameObject) {
            (enemy.gameObject as any).clearTint();
          }
        }
      } 
      // Handle Slowed state
      else if ((enemy as any).slowedTimer && (enemy as any).slowedTimer > 0) {
        (enemy as any).slowedTimer -= delta;
        enemyDelta *= 0.8; // 20% slow

        // Apply dark blue slowed tint
        if (enemy.gameObject && 'setTint' in enemy.gameObject) {
          (enemy.gameObject as any).setTint(0x0284c7);
        }

        if ((enemy as any).slowedTimer <= 0) {
          if (enemy.gameObject && 'clearTint' in enemy.gameObject) {
            (enemy.gameObject as any).clearTint();
          }
        }
      }

      // Enemy FSM AI and Components (Physics, Health) are updated here
      enemy.update(time, enemyDelta);

      const ai = enemy.getComponent<EnemyAIComponent>('ai');
      if (ai && ai instanceof EnemyAIComponent) {
        if (ai.getCurrentState() !== EnemyState.DEAD) {
          // Damage the player if enemy is in active ATTACK leap state and overlaps player
          if (ai.getCurrentState() === EnemyState.ATTACK && !this.isDodging && this.player.active) {
            const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
            if (dist < 34) {
              this.damagePlayer(enemy);
            }
          }
        }
      }

      const bossAi = enemy.getComponent<BossAIComponent>('ai');
      if (bossAi) {
        if (bossAi.getCurrentState() !== BossState.DEFEATED) {
          // Damage the player if boss is in active ATTACK or SPECIAL_ATTACK state and overlaps player
          const isAttacking = bossAi.getCurrentState() === BossState.ATTACK || bossAi.getCurrentState() === BossState.SPECIAL_ATTACK;
          if (isAttacking && !this.isDodging && this.player.active) {
            const isJumping = 'jumpY' in enemy && (enemy as any).jumpY !== 0;
            if (!isJumping) {
              const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
              if (dist < 56) { // Larger damage radius for the massive boss
                this.damagePlayer(enemy);
              }
            }
          }
        }
      }
    }
  }

  private damagePlayer(enemy?: BaseEntity): void {
    // Intercept with WeaponArt parry logic if active and wielding a longsword
    const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
    if (weaponArt && weaponArt.currentWeaponClass === 'longsword' && weaponArt.currentState === WeaponArtState.ACTIVE) {
      weaponArt.handleParry(enemy);
      return;
    }

    // Read armor modifiers
    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    
    let rawDamage = 1;
    if (enemy) {
      const eliteComp = enemy.getComponent<EliteComponent>('elite');
      const isElite = (enemy as any).isElite || eliteComp !== null;

      if (enemy.id.includes('boss')) rawDamage = 2; // Bosses deal 2 hearts!
      else if (enemy.id.includes('mini')) rawDamage = 1.5; // Mini bosses deal 1.5 hearts!
      else if (isElite) rawDamage = 1.5; // Elite enemies deal 1.5 hearts!
      
      if (eliteComp) {
        if (eliteComp.hasMod('Giant')) rawDamage *= 1.5;
        else if (eliteComp.hasMod('Burning')) rawDamage += 0.5;
      }
    }

    const armorMult = modifiers ? modifiers.getModifiedValue('armor', 1.0) : 1.0;
    const dmgScale = this.waveDirector.getEnemyDamageScale ? this.waveDirector.getEnemyDamageScale() : 1.0;
    rawDamage *= dmgScale;
    let finalDamage = rawDamage * armorMult;

    // Sir Galahad the Iron takes 30% less damage (Iron Bastion)
    if (this.selectedGladiator.id === 'knight') {
      finalDamage *= 0.70;
    }

    // Round to nearest 0.5 hearts
    finalDamage = Math.max(0.5, Math.round(finalDamage * 2) / 2);

    if (this.playerHealth.takeDamage(finalDamage)) {
      AudioManager.getInstance().playSFX('hurt');

      // Blood Moon Frenzy legendary:
      if (modifiers && modifiers.hasLegendaryUpgrade('blood_moon_frenzy')) {
        if (this.bloodMoonFrenzyStacks < 5) {
          this.bloodMoonFrenzyStacks += 1;
        }
        this.bloodMoonFrenzyTimers.push(this.time.now + 6000); // 6 seconds duration
        
        // Apply temporary modifiers
        modifiers.removeModifier('blood_moon_frenzy_speed');
        modifiers.removeModifier('blood_moon_frenzy_haste');
        modifiers.addModifier({
          id: 'blood_moon_frenzy_speed',
          stat: 'speed',
          type: 'multiply',
          value: 1.0 + (this.bloodMoonFrenzyStacks * 0.05)
        });
        modifiers.addModifier({
          id: 'blood_moon_frenzy_haste',
          stat: 'attackSpeed',
          type: 'multiply',
          value: 1.0 + (this.bloodMoonFrenzyStacks * 0.10)
        });

        this.vfxManager.spawnSparks(this.player.x, this.player.y, 0xef4444, 8); // Red sparks
      }

      // Freezing Elite: slows player upon dealing damage!
      if (enemy) {
        const eliteComp = enemy.getComponent<EliteComponent>('elite');
        if (eliteComp && eliteComp.hasMod('Frozen') && modifiers) {
          // Slow down player by 40% for 2 seconds!
          const slowMod = {
            id: 'elite_freeze_slow',
            stat: 'speed',
            type: 'multiply' as const,
            value: 0.60
          };
          modifiers.addModifier(slowMod);
          this.time.delayedCall(2000, () => {
            modifiers.removeModifier('elite_freeze_slow');
          });
          this.vfxManager.spawnSparks(this.player.x, this.player.y, 0x06b6d4, 8); // Cyan sparks
        }
      }

      // Vampiric Elite: heals itself when damaging player!
      if (enemy) {
        const eliteComp = enemy.getComponent<EliteComponent>('elite');
        if (eliteComp && eliteComp.hasMod('Vampiric')) {
          const enemyHealth = enemy.getComponent<HealthComponent>('health');
          if (enemyHealth) {
            enemyHealth.heal(Math.round(enemyHealth.getMaxHp() * 0.15));
            this.vfxManager.spawnSparks(enemy.x, enemy.y, 0x10b981, 8); // Green lifesteal sparks
          }
        }
      }
      
      // Knockback gladiator backward in opposite direction of nearest enemy
      if (this.enemies.length > 0) {
        let nearestEnemy = this.enemies[0];
        let minDist = 99999;
        this.enemies.forEach(e => {
          if (e.active) {
            const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, e.x, e.y);
            if (d < minDist) {
              minDist = d;
              nearestEnemy = e;
            }
          }
        });

        const angle = Phaser.Math.Angle.Between(nearestEnemy.x, nearestEnemy.y, this.player.x, this.player.y);
        const knockbackForce = this.selectedGladiator.id === 'knight' ? 100 : 200; // heavy plate armor resistance
        this.playerPhysics.setVelocity(Math.cos(angle) * knockbackForce, Math.sin(angle) * knockbackForce);

        // Layer strike impulse onto camera follow
        const impulseForce = this.selectedGladiator.id === 'knight' ? 16 : 32;
        this.cameraImpulseX = Math.cos(angle) * impulseForce;
        this.cameraImpulseY = Math.sin(angle) * impulseForce;
      }

      this.cameras.main.shake(150, 0.015);
      this.updateHUDValues();
    }
  }

  protected checkWaveProgress(): void {
    if (this.isSandboxMode) return;
    if (this.waveDirector.getIsTransitioning()) return;

    // Filter dead enemies
    const aliveCount = this.enemies.filter(e => {
      if (!e.active) return false;
      const ai = e.getComponent<EnemyAIComponent>('ai');
      if (ai) return ai.getCurrentState() !== EnemyState.DEAD;
      const bossAi = e.getComponent<BossAIComponent>('ai');
      if (bossAi) return bossAi.getCurrentState() !== BossState.DEFEATED;
      return false;
    }).length;

    if (aliveCount === 0) {
      this.waveDirector.setTransitioning(true);
      
      // Collect all active loot instantly so the player gets everything that dropped!
      const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
      const goldGainMult = modifiers ? modifiers.getModifiedValue('goldGain', 1.0) : 1.0;
      const xpGainMult = modifiers ? modifiers.getModifiedValue('xpGain', 1.0) : 1.0;
      this.lootManager.collectAllInstantly(goldGainMult, xpGainMult);
      
      // Wave heal utility perk: Slayer Suture
      const waveHealAmount = modifiers ? modifiers.getModifiedValue('vamp', 0) : 0;
      if (waveHealAmount > 0) {
        this.playerHealth.heal(waveHealAmount);
        this.vfxManager.createFloatingXPText(this.player.x, this.player.y - 30, `+${waveHealAmount} HP`, '#10b981');
        this.vfxManager.spawnSparks(this.player.x, this.player.y, 0x10b981, 6);
      }

      AudioManager.getInstance().playSFX('wave');

      // Pause combat for decision
      this.isPaused = true;
      this.physics.pause();

      // Show post-wave decision overlay
      const titleSmall = document.getElementById('bb-post-wave-title-small');
      if (titleSmall) {
        titleSmall.textContent = `WAVE ${this.waveDirector.getWaveNumber()} CLEARED`;
      }
      
      const overlay = document.getElementById('bb-post-wave-overlay');
      if (overlay) {
        overlay.style.display = 'flex';
        overlay.style.pointerEvents = 'auto'; // Re-enable pointer events!
      }

      this.updateHUDValues();
    }
  }

  private startNextWaveTransition(): void {
    this.isTransitioning = false;
    // Dismiss overlays
    const postWaveOverlay = document.getElementById('bb-post-wave-overlay');
    if (postWaveOverlay) postWaveOverlay.style.display = 'none';
    const merchantOverlay = document.getElementById('bb-merchant-overlay');
    if (merchantOverlay) merchantOverlay.style.display = 'none';

    this.isPaused = false;
    this.physics.resume();

    this.waveDirector.incrementWave();
    AudioManager.getInstance().playSFX('wave');
    
    // Quick screen center overlay text
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;
    const t = this.add.text(width / 2, height / 2 - 100, `WAVE ${this.waveDirector.getWaveNumber()} UNLEASHED`, {
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: '28px',
      color: '#ffd700',
      fontStyle: 'bold'
    }).setOrigin(0.5);
    t.setScrollFactor(0); // Pin to camera screen!

    this.tweens.add({
      targets: t,
      alpha: 0,
      y: height / 2 - 150,
      delay: 1500,
      duration: 800,
      onComplete: () => {
        t.destroy();
        this.waveDirector.setTransitioning(false);
        
        this.spawnWave();
        this.updateHUDValues();
      }
    });

    this.updateHUDValues();
  }

  protected calculateUpgradePrice(rarity: UpgradeRarity, currentTier: number): number {
    const multiplier = 1.6;
    if (rarity === UpgradeRarity.COMMON) {
      const basePrice = 30;
      return Math.round(basePrice * Math.pow(multiplier, currentTier));
    } else if (rarity === UpgradeRarity.RARE) {
      const basePrice = 80;
      return Math.round(basePrice * Math.pow(multiplier + 0.15, currentTier));
    } else { // EPIC
      const basePrice = 180;
      return Math.round(basePrice * Math.pow(multiplier + 0.3, currentTier));
    }
  }

  private populateMerchantInventory(): void {
    const currentWave = this.waveDirector.getWaveNumber();
    
    // Filter all upgrades that are stat upgrades and match current wave rarity gates
    const candidates = ALL_UPGRADES.filter(up => {
      if (up.category !== 'offensive' && up.category !== 'defensive' && up.category !== 'utility') {
        return false;
      }

      // Check current tier count
      const currentTier = this.chosenUpgradesList.filter(u => u.id === up.id).length;
      const maxTier = up.maxTier !== undefined ? up.maxTier : 5;
      if (currentTier >= maxTier) return false;

      // Check rarity gates:
      // Common: Always Available (Wave 1+)
      // Rare: Wave 3+
      // Epic: Wave 5+
      if (up.rarity === UpgradeRarity.RARE && currentWave < 3) return false;
      if (up.rarity === UpgradeRarity.EPIC && currentWave < 5) return false;

      return true;
    });

    // Shuffle and pick 4 random unique candidates
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const selected = shuffled.slice(0, 4);

    // Map to active merchant items with scaling prices
    this.activeMerchantItems = selected.map(up => {
      const currentTier = this.chosenUpgradesList.filter(u => u.id === up.id).length;
      const maxTier = up.maxTier !== undefined ? up.maxTier : 5;
      const price = this.calculateUpgradePrice(up.rarity, currentTier);

      return {
        upgrade: up,
        price,
        currentTier,
        maxTier
      };
    });

    this.renderMerchantInventory();
  }

  private renderMerchantInventory(): void {
    // Sync current gold display
    const goldDisplayValue = document.getElementById('bb-merchant-gold-value');
    if (goldDisplayValue) {
      goldDisplayValue.textContent = `${this.collectedGold} Gold`;
    }

    const container = document.getElementById('bb-merchant-items-container');
    if (!container) return;

    if (this.activeMerchantItems.length === 0) {
      container.innerHTML = `
        <div style="color: var(--text3); font-family: 'Space Grotesk', sans-serif; font-size: 14px; text-align: center; width: 100%; padding: 40px 0;">
          The merchant has run out of physical stat enhancers! Come back next wave.
        </div>
      `;
      return;
    }

    container.innerHTML = this.activeMerchantItems.map((item, index) => {
      const up = item.upgrade;
      const rarityConfig = RARITY_CONFIGS[up.rarity];
      const canAfford = this.collectedGold >= item.price;
      
      // Build tier progress indicator (e.g. ■ ■ ■ □ □)
      let tierHtml = '';
      for (let i = 1; i <= item.maxTier; i++) {
        if (i <= item.currentTier) {
          tierHtml += `<span style="color: ${rarityConfig.color}; margin-right: 4px; font-size: 14px;">■</span>`;
        } else {
          tierHtml += `<span style="color: rgba(255,255,255,0.15); margin-right: 4px; font-size: 14px;">■</span>`;
        }
      }

      return `
        <div style="
          flex: 1;
          min-width: 200px;
          max-width: 210px;
          background: rgba(18, 20, 38, 0.7);
          border: 2px solid ${item.currentTier > 0 ? rarityConfig.color : 'rgba(255,255,255,0.08)'};
          border-radius: 12px;
          padding: 16px;
          text-align: center;
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 250px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          transition: all 0.2s ease-in-out;
        " onmouseover="this.style.transform='scale(1.02)'; this.style.background='rgba(26, 29, 54, 0.9)'" onmouseout="this.style.transform='scale(1)'; this.style.background='rgba(18, 20, 38, 0.7)'">
          
          <div>
            <!-- Rarity Badge -->
            <span style="
              font-family: 'Space Grotesk', sans-serif;
              font-size: 8px;
              font-weight: 800;
              letter-spacing: 1.2px;
              color: ${rarityConfig.color};
              text-transform: uppercase;
              display: block;
              margin-bottom: 4px;
            ">${rarityConfig.name}</span>

            <!-- Title -->
            <h4 style="
              font-family: 'Fraunces', serif;
              font-size: 14px;
              font-weight: 700;
              color: #ffffff;
              margin: 0 0 6px 0;
              line-height: 1.2;
            ">${up.name}</h4>

            <!-- Category / Description -->
            <p style="
              font-size: 11px;
              color: #a1a1aa;
              line-height: 1.4;
              margin: 0 0 12px 0;
              min-height: 48px;
            ">${up.description}</p>
          </div>

          <div>
            <!-- Tier progress indicator -->
            <div style="margin-bottom: 12px;">
              <div style="font-size: 9px; color: var(--text3); font-family: 'Space Grotesk', sans-serif; text-transform: uppercase; margin-bottom: 2px; letter-spacing: 0.5px;">
                Tier: ${item.currentTier} / ${item.maxTier}
              </div>
              <div style="display: flex; justify-content: center; align-items: center;">
                ${tierHtml}
              </div>
            </div>

            <!-- Price & Purchase Action -->
            <button onclick="window.buyMerchantUpgrade(${index})" ${!canAfford ? 'disabled' : ''} style="
              width: 100%;
              padding: 8px 0;
              border-radius: 6px;
              font-family: 'Space Grotesk', sans-serif;
              font-size: 11px;
              font-weight: 700;
              background: ${canAfford ? '#ffd700' : 'rgba(255,255,255,0.05)'};
              color: ${canAfford ? '#000000' : 'rgba(255,255,255,0.3)'};
              border: ${canAfford ? '1px solid #ffd700' : '1px solid rgba(255,255,255,0.05)'};
              cursor: ${canAfford ? 'pointer' : 'not-allowed'};
              display: flex;
              align-items: center;
              justify-content: center;
              gap: 4px;
              transition: all 0.15s ease-in-out;
            " onmouseover="${canAfford ? 'this.style.background=\'#ffffff\'; this.style.borderColor=\'#ffffff\';' : ''}" onmouseout="${canAfford ? 'this.style.background=\'#ffd700\'; this.style.borderColor=\'#ffd700\';' : ''}">
              🪙 ${item.price} Gold
            </button>
          </div>

        </div>
      `;
    }).join('');
  }

  private buyMerchantUpgrade(index: number): void {
    if (index < 0 || index >= this.activeMerchantItems.length) return;
    const item = this.activeMerchantItems[index];

    if (this.collectedGold < item.price) {
      return;
    }

    // Deduct Gold!
    this.collectedGold -= item.price;

    // Apply the upgrade!
    this.applyDirectUpgrade(item.upgrade);

    // Update current tier in activeMerchantItems
    item.currentTier++;

    // Sparkles and purchase SFX
    this.vfxManager.spawnSparks(this.player.x, this.player.y, 0xffd700, 15);
    AudioManager.getInstance().playSFX('powerup');

    // If upgrade has reached its maximum tier, remove it from activeMerchantItems!
    if (item.currentTier >= item.maxTier) {
      this.activeMerchantItems.splice(index, 1);
    } else {
      // Scale price for the next tier purchase immediately
      item.price = this.calculateUpgradePrice(item.upgrade.rarity, item.currentTier);
    }

    // Re-render and sync
    this.renderMerchantInventory();
    this.updateHUDValues();
  }

  private updateWeaponArtHUD(time: number, delta: number): void {
    const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
    if (!weaponArt) return;

    const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

    // Show or hide weapon art hud based on scene state
    const hudElement = document.getElementById('bb-weapon-art-hud');
    if (hudElement) {
      if (this.player.active && !this.isUpgradeOverlayActive && !isTouchDevice) {
        hudElement.style.display = 'flex';
        hudElement.style.pointerEvents = 'auto';
      } else {
        hudElement.style.display = 'none';
      }
    }

    // Show or hide dev sandbox panel based on sandbox/debug mode
    const devPanel = document.getElementById('bb-dev-sandbox-panel');
    if (devPanel) {
      if (this.isSandboxMode || this.isDebugMode) {
        devPanel.style.display = 'flex';
        devPanel.style.pointerEvents = 'auto';
      } else {
        devPanel.style.display = 'none';
      }
    }

    // Update Weapon Art HUD elements
    const def = WEAPON_ARTS[weaponArt.currentWeaponClass];
    if (def) {
      const nameEl = document.getElementById('bb-wa-name');
      if (nameEl) nameEl.textContent = def.name;

      const stateEl = document.getElementById('bb-wa-state');
      if (stateEl) {
        stateEl.textContent = weaponArt.currentState;
        // set color based on state
        if (weaponArt.currentState === 'READY') {
          stateEl.style.background = 'rgba(16, 185, 129, 0.15)';
          stateEl.style.color = '#10b981';
          stateEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
        } else if (weaponArt.currentState === 'COOLDOWN') {
          stateEl.style.background = 'rgba(239, 68, 68, 0.15)';
          stateEl.style.color = '#ef4444';
          stateEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        } else {
          stateEl.style.background = 'rgba(245, 158, 11, 0.15)';
          stateEl.style.color = '#f59e0b';
          stateEl.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        }
      }

      // Stamina update
      const staminaFill = document.getElementById('bb-wa-stamina-fill');
      if (staminaFill) {
        const pct = (weaponArt.stamina / weaponArt.maxStamina) * 100;
        staminaFill.style.width = `${pct}%`;
      }
      const staminaText = document.getElementById('bb-wa-stamina-text');
      if (staminaText) {
        staminaText.textContent = `${Math.round(weaponArt.stamina)}/${weaponArt.maxStamina}`;
      }

      // Circular Cooldown SVG Update
      const circleEl = document.getElementById('bb-wa-cooldown-circle');
      const textEl = document.getElementById('bb-wa-cooldown-text');
      if (circleEl && textEl) {
        if (weaponArt.currentState === 'COOLDOWN') {
          const pct = weaponArt.getCooldownPercent(); // goes from 1.0 down to 0.0
          const circumference = 163.36; // 2 * Math.PI * 26
          const offset = pct * circumference;
          circleEl.setAttribute('stroke-dashoffset', String(offset));
          circleEl.setAttribute('stroke', '#ff3366'); // reddish for cooldown

          const secondsLeft = (weaponArt.cooldownTimer / 1000).toFixed(1);
          textEl.textContent = `${secondsLeft}s`;
          textEl.style.color = '#ff3366';
        } else if (weaponArt.currentState === 'READY') {
          circleEl.setAttribute('stroke-dashoffset', '0');
          circleEl.setAttribute('stroke', '#00f3ff'); // cyan for ready
          textEl.textContent = 'READY';
          textEl.style.color = '#00f3ff';
        } else {
          // Wind-up, Active, Recovery
          circleEl.setAttribute('stroke-dashoffset', '0');
          circleEl.setAttribute('stroke', '#f59e0b'); // amber for casting
          textEl.textContent = weaponArt.currentState;
          textEl.style.color = '#f59e0b';
        }
      }

      // Mobile Integrated Cooldown Update
      const mobileCircleEl = document.getElementById('bb-mobile-wa-cooldown-circle');
      const mobileTextEl = document.getElementById('bb-mobile-wa-text');
      const mobileSlashBtn = document.getElementById('bb-mobile-btn-slash');

      if (mobileCircleEl && mobileTextEl) {
        const circumference = 238.76; // 2 * Math.PI * 38
        if (weaponArt.currentState === 'COOLDOWN') {
          const pct = weaponArt.getCooldownPercent(); // goes from 1.0 down to 0.0
          const offset = pct * circumference;
          mobileCircleEl.setAttribute('stroke-dashoffset', String(offset));
          mobileCircleEl.setAttribute('stroke', '#ff3366'); // reddish for cooldown

          const secondsLeft = (weaponArt.cooldownTimer / 1000).toFixed(1);
          mobileTextEl.textContent = `${secondsLeft}s`;
          mobileTextEl.style.color = '#ff3366';

          if (mobileSlashBtn) {
            mobileSlashBtn.style.background = 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)'; // Dark slate for cooldown
            mobileSlashBtn.style.borderColor = '#475569';
            mobileSlashBtn.style.color = '#94a3b8';
          }
        } else if (weaponArt.currentState === 'READY') {
          mobileCircleEl.setAttribute('stroke-dashoffset', '0');
          mobileCircleEl.setAttribute('stroke', '#00f3ff'); // cyan for ready
          mobileTextEl.textContent = 'READY';
          mobileTextEl.style.color = 'rgba(0, 0, 0, 0.7)'; // high contrast label when ready

          if (mobileSlashBtn) {
            mobileSlashBtn.style.background = 'linear-gradient(135deg, #ffd700 0%, #eab308 100%)'; // Gold
            mobileSlashBtn.style.borderColor = '#ffffff';
            mobileSlashBtn.style.color = '#000000';
          }
        } else {
          // Wind-up, Active, Recovery
          mobileCircleEl.setAttribute('stroke-dashoffset', '0');
          mobileCircleEl.setAttribute('stroke', '#f59e0b'); // amber for casting
          mobileTextEl.textContent = weaponArt.currentState;
          mobileTextEl.style.color = '#ffffff';

          if (mobileSlashBtn) {
            mobileSlashBtn.style.background = 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'; // Amber
            mobileSlashBtn.style.borderColor = '#f59e0b';
            mobileSlashBtn.style.color = '#ffffff';
          }
        }
      }
    }

    // Update Dev Console
    if (this.isSandboxMode || this.isDebugMode) {
      const devArt = document.getElementById('bb-dev-art');
      const devState = document.getElementById('bb-dev-state');
      const devCd = document.getElementById('bb-dev-cd');
      const devHits = document.getElementById('bb-dev-hits');
      const devCrits = document.getElementById('bb-dev-crits');
      const devDmg = document.getElementById('bb-dev-dmg');
      const devStamina = document.getElementById('bb-dev-stamina');
      const devFrame = document.getElementById('bb-dev-frame');

      if (devArt) devArt.textContent = def ? def.name : 'None';
      if (devState) devState.textContent = weaponArt.currentState;
      if (devCd) devCd.textContent = weaponArt.currentState === 'COOLDOWN' ? `${(weaponArt.cooldownTimer / 1000).toFixed(2)}s` : '0.00s';
      if (devHits) devHits.textContent = String(weaponArt.telemetrySuccessfulHits);
      if (devCrits) devCrits.textContent = String(weaponArt.telemetryCriticalHits);
      if (devDmg) devDmg.textContent = String(weaponArt.telemetryDamageDealt);
      if (devStamina) devStamina.textContent = `${Math.round(weaponArt.stamina)}/${weaponArt.maxStamina}`;
      
      // Current animation frame representation: stateTimer / full state duration
      if (devFrame) {
        if (weaponArt.currentState !== 'READY' && weaponArt.currentState !== 'COOLDOWN') {
          const totalDuration = weaponArt.currentState === 'WIND_UP' ? def.windUp :
                                weaponArt.currentState === 'ACTIVE' ? def.activeDuration : def.recovery;
          const frameNum = Math.ceil(((totalDuration - weaponArt.stateTimer) / totalDuration) * 10);
          devFrame.textContent = `Frame ${frameNum}/10`;
        } else {
          devFrame.textContent = 'Idle';
        }
      }
    }
  }

  protected updateHUDValues(): void {
    // 1. Sync React / HTML scoreboard overlay
    const val = document.getElementById('bb-score-val');
    if (val) val.textContent = String(this.score);

    // Sync gameplay HUD elements
    const hudLevel = document.getElementById('bb-hud-level');
    if (hudLevel) hudLevel.textContent = `L${this.playerLevel}`;

    const hudXPText = document.getElementById('bb-hud-xp-text');
    if (hudXPText) hudXPText.textContent = `${this.playerXP} / ${this.playerXPNeeded}`;

    const hudXPFill = document.getElementById('bb-hud-xp-fill');
    if (hudXPFill) {
      const pct = Math.min(100, Math.max(0, (this.playerXP / this.playerXPNeeded) * 100));
      hudXPFill.style.width = `${pct}%`;
    }

    const hudWave = document.getElementById('bb-hud-wave');
    if (hudWave) hudWave.textContent = `WAVE ${this.waveDirector.getWaveNumber()}`;

    const hudEnemies = document.getElementById('bb-hud-enemies');
    if (hudEnemies) {
      const aliveCount = this.enemies.filter(e => {
        if (!e.active) return false;
        const ai = e.getComponent<EnemyAIComponent>('ai');
        if (ai) return ai.getCurrentState() !== EnemyState.DEAD;
        const bossAi = e.getComponent<BossAIComponent>('ai');
        if (bossAi) return bossAi.getCurrentState() !== BossState.DEFEATED;
        return false;
      }).length;
      hudEnemies.textContent = `${aliveCount} ALIVE`;
    }

    const hudGold = document.getElementById('bb-hud-gold');
    if (hudGold) hudGold.textContent = String(this.collectedGold);

    // Render hearts!
    const hudHearts = document.getElementById('bb-hud-hearts');
    if (hudHearts && this.playerHealth) {
      const hp = this.playerHealth.getHp();
      const maxHp = this.playerHealth.getMaxHp();
      
      let heartsHtml = '';
      for (let i = 1; i <= maxHp; i++) {
        if (i <= hp) {
          // Full heart
          heartsHtml += `
            <svg style="width: 16px; height: 16px; fill: currentColor;" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          `;
        } else if (i - 0.5 <= hp) {
          // Half heart
          heartsHtml += `
            <div style="position: relative; width: 16px; height: 16px; color: #ff3366; display: inline-block;">
              <svg style="position: absolute; width: 16px; height: 16px; fill: currentColor; clip-path: inset(0 50% 0 0);" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
              <svg style="position: absolute; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2;" viewBox="0 0 24 24">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
          `;
        } else {
          // Empty heart border
          heartsHtml += `
            <svg style="width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2;" viewBox="0 0 24 24">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          `;
        }
      }
      hudHearts.innerHTML = heartsHtml;
    }

    // 2. Dispatch data updates for inline listeners
    (window as any)._bbScore = this.score;
    (window as any)._bbGold = this.collectedGold;
    (window as any)._bbHp = this.playerHealth ? this.playerHealth.getHp() : 3;
    (window as any)._bbMaxHp = this.playerHealth ? this.playerHealth.getMaxHp() : 3;
    (window as any)._bbRage = this.bedlamRage;
    (window as any)._bbIsBedlam = this.isBedlamMode;

    // Trigger state repaint on main panel if visible
    const event = new CustomEvent('bb-state-update');
    window.dispatchEvent(event);
  }

  private handleGameOver(): void {
    this.isPaused = true;
    this.physics.pause();
    
    // Save high score
    SaveManager.getInstance().updateHighScore(this.score);

    // Update gameover DOM overlays
    const go = document.getElementById('bb-gameover-overlay');
    if (go) {
      go.style.display = 'flex';
      go.style.pointerEvents = 'auto';
    }

    const finalScore = document.getElementById('bb-final-score');
    if (finalScore) finalScore.textContent = String(this.score);

    const finalGold = document.getElementById('bb-final-gold');
    if (finalGold) finalGold.textContent = String(this.collectedGold);

    const finalSlashes = document.getElementById('bb-final-slashes');
    if (finalSlashes) finalSlashes.textContent = String(this.waveDirector.getWaveNumber() - 1); // Waves CLEARED is wave - 1!

    // Populate Bento Statistics Dashboard!
    const damDealt = document.getElementById('bb-stats-damage-dealt');
    if (damDealt) damDealt.textContent = String(this.statsDamageDealt);

    const beastsSlain = document.getElementById('bb-stats-beasts-slain');
    if (beastsSlain) beastsSlain.textContent = String(this.statsBeastsSlain);

    const crits = document.getElementById('bb-stats-crits');
    if (crits) crits.textContent = String(this.statsCrits);

    const maxLvl = document.getElementById('bb-stats-level');
    if (maxLvl) maxLvl.textContent = `Level ${this.statsMaxLevel}`;

    const bestScore = document.getElementById('bb-best-score');
    if (bestScore) bestScore.textContent = String(SaveManager.getInstance().getSaveData().highScore);

    // Populate Active Gladiator Build List
    const buildList = document.getElementById('bb-stats-build-list');
    if (buildList) {
      if (this.chosenUpgradesList.length === 0) {
        buildList.innerHTML = `<span style="font-size: 11px; color: var(--text3); font-style: italic;">No upgrades acquired</span>`;
      } else {
        buildList.innerHTML = this.chosenUpgradesList.map(up => {
          const config = RARITY_CONFIGS[up.rarity];
          return `
            <span style="font-size: 10px; font-weight: 700; color: ${config.color}; border: 1px solid ${config.color}; padding: 3px 8px; border-radius: 12px; background: rgba(0,0,0,0.3); display: inline-flex; align-items: center; gap: 4px;" title="${up.description}">
              ${up.name}
            </span>
          `;
        }).join('');
      }
    }
  }

  public switchCharacter(index: number): void {
    const preset = GLADIATOR_CHARACTERS[index];
    if (!preset) return;

    this.logger.info(`Switching active character to: ${preset.name}`);

    // 1. Destroy and cleanup old character attributes/passives/sprites
    if (this.offhandSwordSprite) {
      this.offhandSwordSprite.destroy();
      this.offhandSwordSprite = undefined;
    }
    if (this.offhand2SwordSprite) {
      this.offhand2SwordSprite.destroy();
      this.offhand2SwordSprite = undefined;
    }
    if (this.offhand3SwordSprite) {
      this.offhand3SwordSprite.destroy();
      this.offhand3SwordSprite = undefined;
    }

    this.player.removeComponent('offhand_weapon');
    this.player.removeComponent('offhand_weapon_2');
    this.player.removeComponent('offhand_weapon_3');

    // Remove any Ignis burning fields
    this.activeBurns.clear();
    this.activeAshFields.forEach(f => {
      f.circle.destroy();
      f.border.destroy();
    });
    this.activeAshFields = [];

    // Clear tints/alpha
    if (this.player.gameObject) {
      (this.player.gameObject as Phaser.GameObjects.Sprite).clearTint();
      (this.player.gameObject as Phaser.GameObjects.Sprite).setAlpha(1.0);
    }

    // 2. Set new preset
    this.selectedGladiator = preset;

    // 3. Update player texture based on selected gladiator ID
    if (this.player.gameObject) {
      const textureKey = preset.id === 'knight' ? 'char-knight' : preset.id === 'duelist' ? 'char-duelist' : 'char-mage';
      (this.player.gameObject as Phaser.GameObjects.Sprite).setTexture(textureKey);
    }

    // 4. Update basic stats
    if (this.playerPhysics) {
      this.playerPhysics.speed = preset.baseSpeed;
    }
    if (this.playerHealth) {
      this.playerHealth.setMaxHp(preset.baseHp);
      this.playerHealth.setHp(preset.baseHp); // Refresh HP to full for the switch
    }

    // 5. Update weapon component properties
    const weaponArt = this.player.getComponent<WeaponArtComponent>('weapon_art');
    const currentWeaponId = weaponArt ? weaponArt.currentWeaponClass : 'longsword';
    const weaponPreset = WEAPON_PRESETS.find(w => w.id === currentWeaponId) || WEAPON_PRESETS[0];

    const weapon = this.player.getComponent<WeaponComponent>('weapon');
    if (weapon) {
      weapon.weight = weaponPreset.weight;
      weapon.baseDamage = weaponPreset.baseDamage;
      weapon.length = weaponPreset.reach;
      weapon.handleOffset = weaponPreset.handleOffset;
    }

    // Tint weapon sprite
    const mainBladeColor = parseInt(preset.bladeColor.replace('#', '0x'), 16);
    this.swordSprite.setTint(mainBladeColor);

    // Update Weapon Art Class
    if (weaponArt) {
      weaponArt.setWeaponClass(weaponPreset.id);
      // reset telemetry and cooldown for fresh start
      weaponArt.resetTelemetry();
      weaponArt.currentState = WeaponArtState.READY;
      weaponArt.cooldownTimer = 0;
      weaponArt.stateTimer = 0;
      weaponArt.stamina = weaponArt.maxStamina;
      
      // Update HTML select
      const selectEl = document.getElementById('bb-dev-select-weapon') as HTMLSelectElement | null;
      if (selectEl) {
        selectEl.value = weaponArt.currentWeaponClass;
      }
    }

    // 6. Re-evaluate / Re-apply starting attributes & legendary upgrades
    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    
    // Starting dual-daggers for twin_daggers weapon
    if (weaponPreset.id === 'twin_daggers') {
      const offhand = new WeaponComponent(this.player);
      offhand.weight = weaponPreset.weight;
      offhand.baseDamage = weaponPreset.baseDamage;
      offhand.length = weaponPreset.reach;
      offhand.handleOffset = weaponPreset.handleOffset;
      offhand.angleOffset = Math.PI; // Opposite direction
      this.player.addComponent('offhand_weapon', offhand);
      offhand.init();

      this.offhandSwordSprite = this.add.sprite(this.player.x, this.player.y, 'sword-texture');
      this.offhandSwordSprite.setOrigin(0.1, 0.5);
      this.offhandSwordSprite.setTint(mainBladeColor);
      this.offhandSwordSprite.setAlpha(0.9);
    }

    // Check if player has the Dual Wield Mirage legendary upgrade
    if (modifiers && modifiers.hasLegendaryUpgrade('dual_wield')) {
      if (weaponPreset.id === 'twin_daggers') {
        // twin_daggers gets 2 extra spectral daggers for a 4-dagger cross!
        if (!this.player.getComponent('offhand_weapon_2')) {
          const offhand2 = new WeaponComponent(this.player);
          offhand2.weight = 0.45;
          offhand2.baseDamage = 18;
          offhand2.length = 50;
          offhand2.handleOffset = 22;
          offhand2.angleOffset = Math.PI / 2; // +90 deg
          this.player.addComponent('offhand_weapon_2', offhand2);
          offhand2.init();

          this.offhand2SwordSprite = this.add.sprite(this.player.x, this.player.y, 'sword-texture');
          this.offhand2SwordSprite.setOrigin(0.1, 0.5);
          this.offhand2SwordSprite.setTint(0xa855f7); // Spectral purple look
          this.offhand2SwordSprite.setAlpha(0.8);
        }
        if (!this.player.getComponent('offhand_weapon_3')) {
          const offhand3 = new WeaponComponent(this.player);
          offhand3.weight = 0.45;
          offhand3.baseDamage = 18;
          offhand3.length = 50;
          offhand3.handleOffset = 22;
          offhand3.angleOffset = -Math.PI / 2; // -90 deg
          this.player.addComponent('offhand_weapon_3', offhand3);
          offhand3.init();

          this.offhand3SwordSprite = this.add.sprite(this.player.x, this.player.y, 'sword-texture');
          this.offhand3SwordSprite.setOrigin(0.1, 0.5);
          this.offhand3SwordSprite.setTint(0xa855f7); // Spectral purple look
          this.offhand3SwordSprite.setAlpha(0.8);
        }
      } else {
        if (!this.player.getComponent('offhand_weapon')) {
          const offhand = new WeaponComponent(this.player);
          offhand.angleOffset = Math.PI; // Opposite direction
          this.player.addComponent('offhand_weapon', offhand);
          offhand.init();

          this.offhandSwordSprite = this.add.sprite(this.player.x, this.player.y, 'sword-texture');
          this.offhandSwordSprite.setOrigin(0.1, 0.5);
          this.offhandSwordSprite.setTint(0xa855f7); // Spectral purple look
          this.offhandSwordSprite.setAlpha(0.8);
        }
      }
    }

    // Trigger visual/sound feedback for character switch
    this.cameras.main.flash(200, 255, 255, 255, false);
    AudioManager.getInstance().playSFX('powerup');
    this.updateHUDValues();
  }

  private applyBurnStack(enemy: BaseEntity, durationMs: number, customDamage?: number): void {
    if (!enemy.active) return;
    const enemyId = enemy.id;
    
    if (!this.activeBurns.has(enemyId)) {
      this.activeBurns.set(enemyId, {
        entity: enemy,
        nextDamageTime: this.time.now + 500,
        expiresAt: this.time.now + durationMs,
        stacks: [{ expiresAt: this.time.now + durationMs, damage: customDamage }]
      });
    } else {
      const burn = this.activeBurns.get(enemyId)!;
      // Max 3 active burning stacks
      if (burn.stacks.length < 3) {
        burn.stacks.push({ expiresAt: this.time.now + durationMs, damage: customDamage });
      } else {
        // Refresh the stack that expires first
        burn.stacks.sort((a, b) => a.expiresAt - b.expiresAt);
        burn.stacks[0].expiresAt = this.time.now + durationMs;
        burn.stacks[0].damage = customDamage;
      }
      burn.expiresAt = Math.max(...burn.stacks.map(s => s.expiresAt));
    }

    // Spawn flame particles/sparks on application
    this.vfxManager.spawnSparks(enemy.x, enemy.y, 0xf97316, 4);

    // Visual tint
    if (enemy.gameObject && enemy.gameObject instanceof Phaser.GameObjects.Sprite) {
      (enemy.gameObject as Phaser.GameObjects.Sprite).setTint(0xf97316);
    }
  }

  private spawnBurningAshField(x: number, y: number): void {
    const radius = 60;
    const fieldCircle = this.add.circle(x, y, radius, 0xf97316, 0.15);
    fieldCircle.setDepth(2); // Render on ground layer

    const border = this.add.graphics();
    border.setDepth(2);
    border.lineStyle(1.5, 0xef4444, 0.45);
    border.strokeCircle(x, y, radius);

    // Animate field entrance scale up
    fieldCircle.setScale(0);
    this.tweens.add({
      targets: fieldCircle,
      scale: 1,
      duration: 200,
      ease: 'Back.out'
    });

    // Flame burst at field creation
    this.vfxManager.spawnSparks(x, y, 0xf97316, 8);

    this.activeAshFields.push({
      circle: fieldCircle,
      border: border,
      x: x,
      y: y,
      radius: radius,
      expiresAt: this.time.now + 3500, // lasts 3.5s
      nextDamageTime: this.time.now + 250 // first tick
    });
  }

  private updateBurningStatusEffects(time: number, delta: number): void {
    // 1. Update Burning Over Time (DoT)
    for (const [enemyId, burn] of this.activeBurns.entries()) {
      const enemy = burn.entity;
      
      if (!enemy || !enemy.active) {
        this.activeBurns.delete(enemyId);
        continue;
      }

      // Check if enemy died
      const health = enemy.getComponent<HealthComponent>('health');
      if (!health || health.getHp() <= 0) {
        this.activeBurns.delete(enemyId);
        continue;
      }

      // Prune expired stacks
      burn.stacks = burn.stacks.filter(s => time < s.expiresAt);

      if (burn.stacks.length === 0) {
        if (enemy.gameObject && enemy.gameObject instanceof Phaser.GameObjects.Sprite) {
          (enemy.gameObject as Phaser.GameObjects.Sprite).clearTint();
        }
        this.activeBurns.delete(enemyId);
        continue;
      }

      // Tick burn damage every 0.5s
      if (time >= burn.nextDamageTime) {
        let totalDamage = 0;
        burn.stacks.forEach(s => {
          totalDamage += (s.damage !== undefined) ? s.damage : 4;
        });

        if (health.takeDamage(totalDamage)) {
          this.statsDamageDealt += totalDamage;
          this.vfxManager.createDamageText(enemy.x, enemy.y - 15, totalDamage, false);
          this.vfxManager.spawnSparks(enemy.x, enemy.y, 0xf97316, 2);

          if (!enemy.active) {
            this.killEnemy(enemy);
            this.activeBurns.delete(enemyId);
            continue;
          }
        }

        burn.nextDamageTime = time + 500;
      }

      // Keep orange tint active during burning state (except when flashing white from hit)
      if (enemy.gameObject && enemy.gameObject instanceof Phaser.GameObjects.Sprite) {
        const sprite = enemy.gameObject as Phaser.GameObjects.Sprite;
        if (sprite.tintTopLeft !== 0xffffff) {
          sprite.setTint(0xf97316);
        }
      }

      // Sparkles
      if (Math.random() < 0.08) {
        this.vfxManager.spawnSparks(enemy.x, enemy.y, 0xf97316, 1);
      }
    }

    // 2. Update Ground Burning Ash Fields
    const activeFields: typeof this.activeAshFields = [];
    for (const field of this.activeAshFields) {
      if (time >= field.expiresAt) {
        this.tweens.add({
          targets: field.circle,
          alpha: 0,
          scale: 0.8,
          duration: 250,
          onComplete: () => {
            field.circle.destroy();
            field.border.destroy();
          }
        });
        continue;
      }

      // Sizzle enemies standing inside the pool
      if (time >= field.nextDamageTime) {
        this.enemies.forEach(enemy => {
          if (!enemy.active) return;
          const health = enemy.getComponent<HealthComponent>('health');
          if (!health || health.getHp() <= 0) return;

          const dist = Phaser.Math.Distance.Between(field.x, field.y, enemy.x, enemy.y);
          if (dist <= field.radius) {
            const ashDamage = 3;
            if (health.takeDamage(ashDamage)) {
              this.statsDamageDealt += ashDamage;
              this.vfxManager.createDamageText(enemy.x, enemy.y - 15, ashDamage, false);
              this.vfxManager.spawnSparks(enemy.x, enemy.y, 0xf97316, 1);

              // Inflict/refresh burn stack
              this.applyBurnStack(enemy, 3000);

              if (!enemy.active) {
                this.killEnemy(enemy);
              }
            }
          }
        });

        field.nextDamageTime = time + 250;
      }

      activeFields.push(field);
    }
    this.activeAshFields = activeFields;
  }

  public shutdown(): void {
    this.logger.info('Shutting down Game Scene...');
    this.inputManager?.destroy();
    this.player?.destroy();
    this.enemies?.forEach(e => e?.destroy());

    this.activeBullets?.forEach(b => b?.destroy());
    this.activeBoomerangs?.forEach(b => b?.destroy());
    this.activeElitePuddles?.forEach(p => {
      p.circle?.destroy();
      p.border?.destroy();
    });
    this.activeEliteProjectiles?.forEach(p => {
      p.sprite?.destroy();
    });
    this.activeElitePuddles = [];
    this.activeEliteProjectiles = [];
    if (this.sentinelSprites.length > 0) this.sentinelSprites.forEach(s => s.destroy());
    
    if (this.offhandSwordSprite) this.offhandSwordSprite.destroy();
    if (this.offhand2SwordSprite) this.offhand2SwordSprite.destroy();
    if (this.offhand3SwordSprite) this.offhand3SwordSprite.destroy();

    this.activeBurns.clear();
    this.activeAshFields.forEach(f => {
      if (f.circle) f.circle.destroy();
      if (f.border) f.border.destroy();
    });
    this.activeAshFields = [];

    this.slashTrailGraphics?.destroy();
    EventBus.getInstance().removeAllListeners();

    // Clean up window bindings only if they still refer to this scene's bound handlers
    if ((window as any).selectUpgrade === this.boundSelectUpgrade) {
      (window as any).selectUpgrade = null;
    }
    if ((window as any).postWaveContinue === this.boundPostWaveContinue) {
      (window as any).postWaveContinue = null;
    }
    if ((window as any).postWaveVisitMerchant === this.boundPostWaveVisitMerchant) {
      (window as any).postWaveVisitMerchant = null;
    }
    if ((window as any).leaveMerchantShop === this.boundLeaveMerchantShop) {
      (window as any).leaveMerchantShop = null;
    }
    if ((window as any).leaveMerchantAndStartWave === this.boundLeaveMerchantAndStartWave) {
      (window as any).leaveMerchantAndStartWave = null;
    }
    if ((window as any).buyMerchantUpgrade === this.boundBuyMerchantUpgrade) {
      (window as any).buyMerchantUpgrade = null;
    }
    if ((window as any).togglePauseGameFromUI === this.boundTogglePauseGameFromUI) {
      (window as any).togglePauseGameFromUI = null;
    }
    if ((window as any).quitGameRun === this.boundQuitGameRun) {
      (window as any).quitGameRun = null;
    }

    // Ensure all overlays are hidden
    const overlays = [
      document.getElementById('bb-post-wave-overlay'),
      document.getElementById('bb-merchant-overlay'),
      document.getElementById('bb-upgrade-overlay'),
      document.getElementById('bb-gameover-overlay'),
      document.getElementById('bb-pause-overlay'),
      document.getElementById('bb-weapon-art-hud'),
      document.getElementById('bb-dev-sandbox-panel'),
      document.getElementById('bb-mobile-controls')
    ];
    overlays.forEach(overlay => {
      if (overlay) {
        overlay.style.display = 'none';
        overlay.style.pointerEvents = 'none'; // Disable pointer events!
      }
    });
  }

  private spawnVoidRift(x: number, y: number): void {
    const circle = this.add.circle(x, y, 140, 0x581c87, 0.25); // Dark purple semi-transparent area
    circle.setDepth(2); // Ground layer

    const gravityGraphics = this.add.graphics();
    gravityGraphics.setDepth(3);

    this.activeVoidRifts.push({
      circle,
      gravityGraphics,
      x,
      y,
      expiresAt: this.time.now + 5000, // 5 seconds
      nextDamageTime: this.time.now + 200 // initial damage tick
    });

    AudioManager.getInstance().playSFX('powerup');
  }

  private triggerFalconDive(enemy: BaseEntity): void {
    if (!enemy.active) return;
    const targetX = enemy.x;
    const targetY = enemy.y;

    // Create a spectral sword sprite falling from above
    const diveSword = this.add.sprite(targetX, targetY - 140, 'sword-texture');
    diveSword.setOrigin(0.5, 0.5);
    diveSword.rotation = Math.PI / 2; // Pointing downwards (90 degrees in radians)
    diveSword.setTint(0xfacc15); // Glowing golden/yellow falcon colors!
    diveSword.setAlpha(0.9);
    diveSword.setDepth(15);

    // Play a diving whoosh sound
    AudioManager.getInstance().playSFX('swoosh');

    // Tween the sword down
    this.tweens.add({
      targets: diveSword,
      y: targetY,
      duration: 160,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        // Upon hitting ground:
        diveSword.destroy();
        if (!enemy.active) return;

        // Deal damage: Weapon base damage * 2.0 or 45 damage minimum
        const weapon = this.player.getComponent<WeaponComponent>('weapon');
        const baseDamage = weapon ? weapon.baseDamage : 25;
        const falconDamage = Math.round(baseDamage * 2.0);

        const health = enemy.getComponent<HealthComponent>('health');
        if (health && health.takeDamage(falconDamage)) {
          this.statsDamageDealt += falconDamage;
          this.vfxManager.createDamageText(targetX, targetY - 15, falconDamage, true);
          this.vfxManager.spawnSparks(targetX, targetY, 0xfacc15, 12); // Golden explosions
          AudioManager.getInstance().playSFX('hit');
          this.cameras.main.shake(100, 0.01);

          if (!enemy.active) {
            this.killEnemy(enemy);
          }
        }
      }
    });
  }

  private triggerMeteorSlam(x: number, y: number): void {
    // 1. Spawn a small falling fireball/meteor sprite or circle
    const meteor = this.add.circle(x - 60, y - 100, 10, 0xf97316, 0.9);
    meteor.setDepth(15);
    
    this.tweens.add({
      targets: meteor,
      x: x,
      y: y,
      duration: 180,
      ease: 'Quad.easeIn',
      onComplete: () => {
        meteor.destroy();

        // 2. Play explosion sound
        AudioManager.getInstance().playSFX('hit');

        // 3. Shake camera
        this.cameras.main.shake(180, 0.015);

        // 4. Draw crater on the ground that slowly fades
        const crater = this.add.circle(x, y, 45, 0x7c2d12, 0.35); // Dark reddish-brown crater
        crater.setDepth(1); // below player
        this.tweens.add({
          targets: crater,
          alpha: 0,
          delay: 2000,
          duration: 1000,
          onComplete: () => crater.destroy()
        });

        // 5. Spawn fiery explosion sparks
        this.vfxManager.spawnSparks(x, y, 0xf97316, 20);

        // 6. AoE damage to surrounding enemies
        const aoeRadius = 90;
        const weapon = this.player.getComponent<WeaponComponent>('weapon');
        const baseDamage = weapon ? weapon.baseDamage : 25;
        const meteorDamage = Math.round(baseDamage * 1.5); // deals 150% base damage!

        this.enemies.forEach(e => {
          if (!e.active) return;
          const ai = e.getComponent<EnemyAIComponent>('ai');
          if (ai && ai.getCurrentState() === EnemyState.DEAD) return;
          const bossAi = e.getComponent<BossAIComponent>('ai');
          if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) return;

          const dist = Phaser.Math.Distance.Between(e.x, e.y, x, y);
          if (dist <= aoeRadius) {
            const health = e.getComponent<HealthComponent>('health');
            if (health && health.takeDamage(meteorDamage)) {
              this.statsDamageDealt += meteorDamage;
              this.vfxManager.createDamageText(e.x, e.y - 15, meteorDamage, true);
              
              // Apply extra knockback away from meteor center!
              const phys = e.getComponent<PhysicsComponent>('physics');
              if (phys) {
                const angle = Phaser.Math.Angle.Between(x, y, e.x, e.y);
                const pushForce = 350 * (1.0 - dist / aoeRadius);
                phys.setVelocity(Math.cos(angle) * pushForce, Math.sin(angle) * pushForce);
              }

              if (!e.active) {
                this.killEnemy(e);
              }
            }
          }
        });
      }
    });
  }

  private updateCustomLegendaries(time: number, delta: number): void {
    const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
    if (!modifiers) return;

    
    // 0. Astral Arsenal Logic
    if (modifiers.hasLegendaryUpgrade('astral_arsenal')) {
      // Hide and deactivate physical weapons
      const pWeapon = this.player.getComponent<WeaponComponent>('weapon');
      if (pWeapon) {
          pWeapon.setActive(false);
          if (this.swordSprite) this.swordSprite.setVisible(false);
      }
      const offhandWeapon = this.player.getComponent<WeaponComponent>('offhand_weapon');
      if (offhandWeapon) {
          offhandWeapon.setActive(false);
          if (this.offhandSwordSprite) this.offhandSwordSprite.setVisible(false);
      }
      const offhandWeapon2 = this.player.getComponent<WeaponComponent>('offhand_weapon_2');
      if (offhandWeapon2) {
          offhandWeapon2.setActive(false);
          if (this.offhand2SwordSprite) this.offhand2SwordSprite.setVisible(false);
      }
      const offhandWeapon3 = this.player.getComponent<WeaponComponent>('offhand_weapon_3');
      if (offhandWeapon3) {
          offhandWeapon3.setActive(false);
          if (this.offhand3SwordSprite) this.offhand3SwordSprite.setVisible(false);
      }
      
      const hasDualWield = modifiers.hasLegendaryUpgrade('dual_wield');
      const isSeraphina = this.selectedWeaponId === 'twin_daggers';
      const numBlades = hasDualWield ? (isSeraphina ? 4 : 2) : (isSeraphina ? 2 : 1);
      
      if (!this.astralBlades) {
        this.astralBlades = [];
      }
      
      // Spawn missing blades
      while (this.astralBlades.length < numBlades) {
        const bladeIndex = this.astralBlades.length;
        const bladeEntity = new AstralBladeEntity('astral_blade_' + bladeIndex, this.player.x, this.player.y, modifiers);
        bladeEntity.gameObject = this.add.sprite(this.player.x, this.player.y, 'sword-texture').setDepth(15);
        
        const phys = new PhysicsComponent(bladeEntity, 400);
        phys.friction = 0.90;
        phys.accelerationRate = 18.0;
        phys.setBoundaries(20, this.arenaWidth - 20, 20, this.arenaHeight - 20);
        bladeEntity.addComponent('physics', phys);
        
        const weapon = new WeaponComponent(bladeEntity);
        const playerWeapon = this.player.getComponent<WeaponComponent>('weapon');
        if (playerWeapon) {
          weapon.weight = playerWeapon.weight;
          weapon.baseDamage = playerWeapon.baseDamage;
          weapon.length = playerWeapon.length;
          weapon.handleOffset = playerWeapon.handleOffset;
        }
        bladeEntity.addComponent('weapon', weapon);
        weapon.init();
        
        this.astralBlades.push({
           entity: bladeEntity,
           targetId: null,
           state: 'idle',
           stateTimer: 0,
           orbitAngle: (bladeIndex * Math.PI * 2) / numBlades,
           lastAttackTime: 0,
           attackCount: 0,
           boomerangTimer: 3500 + bladeIndex * 500
        });
      }

      // Cleanup extra blades if the count decreases
      while (this.astralBlades.length > numBlades) {
        const b = this.astralBlades.pop();
        if (b) {
          if (b.entity.gameObject) b.entity.gameObject.destroy();
          const w = b.entity.getComponent<any>('weapon');
          if (w) w.destroy();
        }
      }
      
      // Update Astral Blades
      this.astralBlades.forEach((blade, index) => {
         const phys = blade.entity.getComponent<PhysicsComponent>('physics');
         const weapon = blade.entity.getComponent<WeaponComponent>('weapon');
         const sprite = blade.entity.gameObject as Phaser.GameObjects.Sprite;
         
         if (!phys || !weapon || !sprite) return;

         // Tick boomerang cooldown timer
         if (blade.boomerangTimer > 0) {
           blade.boomerangTimer -= delta;
         }

         const reachMultiplier = modifiers ? modifiers.getModifiedValue('length', 1.0) : 1.0;
         const searchRadius = 250 * reachMultiplier;

         weapon.update(time, delta);
         
         // 1. Target Tracking & Validation
         let target: BaseEntity | null = null;
         if (blade.targetId) {
             target = this.enemies.find(e => e.id === blade.targetId && e.active) || null;
             if (target) {
               const ai = target.getComponent<EnemyAIComponent>('ai');
               if (ai && ai.getCurrentState() === EnemyState.DEAD) target = null;
               const bossAi = target.getComponent<BossAIComponent>('ai');
               if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) target = null;
             }
         }

         if (!target) {
           blade.targetId = null;
           if (blade.state !== 'idle' && blade.state !== 'boomerang') {
             blade.state = 'idle';
             blade.stateTimer = 0;
           }
         }
         
         // Target Scanning (Priority: Bosses > Elites > Closest Normal Enemy)
         if (!target && blade.state !== 'boomerang') {
             let bestTarget = null;
             let bestPriority = -1; // 3 for Boss, 2 for Elite, 1 for Normal
             let bestDist = Infinity;

             this.enemies.forEach(e => {
                 if (!e.active) return;
                 const ai = e.getComponent<EnemyAIComponent>('ai');
                 if (ai && ai.getCurrentState() === EnemyState.DEAD) return;
                 const bossAi = e.getComponent<BossAIComponent>('ai');
                 if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) return;

                 const dist = Phaser.Math.Distance.Between(blade.entity.x, blade.entity.y, e.x, e.y);
                 if (dist <= searchRadius) {
                     const isBoss = e.id.includes('boss') || e.id.includes('colossus');
                     const isElite = (e as any).isElite === true || (e as any).eliteMod !== undefined;
                     let priority = 1;
                     if (isBoss) priority = 3;
                     else if (isElite) priority = 2;

                     if (priority > bestPriority) {
                         bestPriority = priority;
                         bestTarget = e;
                         bestDist = dist;
                     } else if (priority === bestPriority && dist < bestDist) {
                         bestTarget = e;
                         bestDist = dist;
                     }
                 }
             });

             if (bestTarget) {
                 target = bestTarget;
                 blade.targetId = target.id;

                 // Check Boomerang Gale
                 if (modifiers.hasLegendaryUpgrade('boomerang_blade') && blade.boomerangTimer <= 0) {
                   blade.state = 'boomerang';
                   blade.stateTimer = 800;
                   blade.boomerangPhase = 'out';
                   blade.boomerangBaseX = blade.entity.x;
                   blade.boomerangBaseY = blade.entity.y;
                   const angle = Phaser.Math.Angle.Between(blade.entity.x, blade.entity.y, target.x, target.y);
                   blade.boomerangDirX = Math.cos(angle);
                   blade.boomerangDirY = Math.sin(angle);
                   blade.boomerangTimer = 3500;
                   AudioManager.getInstance().playSFX('swoosh');
                 } else {
                   blade.state = 'dash';
                   blade.stateTimer = 0;
                 }
             }
         }
         
         const isGalahad = this.selectedGladiator.id === 'knight';
         const isSeraphina = this.selectedGladiator.id === 'duelist';
         const charSpeedMult = isSeraphina ? 1.3 : (isGalahad ? 0.8 : 1.0);

         // 2. Compute Movement Targets & Aim Vectors
         let targetX = this.player.x;
         let targetY = this.player.y;
         let overrideWeaponTargetX = this.player.x;
         let overrideWeaponTargetY = this.player.y;

         if (blade.state === 'boomerang' && modifiers.hasLegendaryUpgrade('boomerang_blade')) {
           blade.stateTimer -= delta;
           const progress = (800 - blade.stateTimer) / 800;

           if (blade.stateTimer <= 0) {
             blade.state = 'idle';
             blade.stateTimer = 0;
             blade.targetId = null;
           } else {
             const spinAngle = (time / 30) + (index * Math.PI);
             overrideWeaponTargetX = blade.entity.x + Math.cos(spinAngle) * 100;
             overrideWeaponTargetY = blade.entity.y + Math.sin(spinAngle) * 100;

             if (progress < 0.5) {
               const outProgress = progress / 0.5;
               targetX = blade.boomerangBaseX! + blade.boomerangDirX! * 400 * outProgress;
               targetY = blade.boomerangBaseY! + blade.boomerangDirY! * 400 * outProgress;
             } else {
               const returnProgress = (progress - 0.5) / 0.5;
               const startX = blade.boomerangBaseX! + blade.boomerangDirX! * 400;
               const startY = blade.boomerangBaseY! + blade.boomerangDirY! * 400;
               targetX = startX + (this.player.x - startX) * returnProgress;
               targetY = startY + (this.player.y - startY) * returnProgress;
             }

             phys.vx = (targetX - blade.entity.x) * 15;
             phys.vy = (targetY - blade.entity.y) * 15;
           }
         } else if (target) {
           const distToTarget = Phaser.Math.Distance.Between(blade.entity.x, blade.entity.y, target.x, target.y);

           if (blade.state === 'dash') {
             overrideWeaponTargetX = target.x;
             overrideWeaponTargetY = target.y;
             targetX = target.x;
             targetY = target.y;

             if (distToTarget < 60) {
               blade.state = 'orbit_attack';
               blade.stateTimer = 400 / charSpeedMult;
               AudioManager.getInstance().playSFX('astral_slash');
             }
           } else if (blade.state === 'orbit_attack') {
             blade.stateTimer -= delta;

             const orbitSpeed = isSeraphina ? 0.05 : (isGalahad ? 0.035 : 0.04);
             const orbitAngle = (time * orbitSpeed) + (index * Math.PI);
             targetX = target.x + Math.cos(orbitAngle) * 45;
             targetY = target.y + Math.sin(orbitAngle) * 45;

             overrideWeaponTargetX = target.x;
             overrideWeaponTargetY = target.y;

             if (blade.stateTimer <= 0) {
               blade.state = 'slice';
               blade.stateTimer = 220 / charSpeedMult;

               const angle = Phaser.Math.Angle.Between(blade.entity.x, blade.entity.y, target.x, target.y);
               blade.sliceDirX = Math.cos(angle);
               blade.sliceDirY = Math.sin(angle);
               blade.attackCount += 1;
             }
           } else if (blade.state === 'slice') {
             blade.stateTimer -= delta;

             targetX = target.x + blade.sliceDirX! * 130;
             targetY = target.y + blade.sliceDirY! * 130;

             overrideWeaponTargetX = blade.entity.x + blade.sliceDirX! * 100;
             overrideWeaponTargetY = blade.entity.y + blade.sliceDirY! * 100;

             if (blade.stateTimer <= 0) {
               blade.state = 'idle';
               blade.stateTimer = 0;
               blade.targetId = null;
             }
           }
         } else {
           blade.state = 'idle';
           const orbitAngle = (time / 550) + (index * Math.PI * 2) / numBlades;
           const orbitDist = 65 + Math.sin(time / 220 + index) * 6;
           targetX = this.player.x + Math.cos(orbitAngle) * orbitDist;
           targetY = this.player.y + Math.sin(orbitAngle) * orbitDist;

           if (Math.random() < 0.003) {
             AudioManager.getInstance().playSFX('astral_hum');
           }

           overrideWeaponTargetX = targetX + Math.cos(orbitAngle) * 100;
           overrideWeaponTargetY = targetY + Math.sin(orbitAngle) * 100;
         }

         // 3. Float Movement Physics
         if (blade.state !== 'boomerang') {
           const dx = targetX - blade.entity.x;
           const dy = targetY - blade.entity.y;

           const stiffness = 22.0 * charSpeedMult;
           const damping = 4.2;

           const ax = dx * stiffness - phys.vx * damping;
           const ay = dy * stiffness - phys.vy * damping;

           const dtSec = delta / 1000;
           phys.vx += ax * dtSec;
           phys.vy += ay * dtSec;

           const maxSpeed = blade.state === 'slice' ? 850 : (blade.state === 'dash' ? 650 : 380);
           const currentSpeedSq = phys.vx * phys.vx + phys.vy * phys.vy;
           if (currentSpeedSq > maxSpeed * maxSpeed) {
             const speedVal = Math.sqrt(currentSpeedSq);
             phys.vx = (phys.vx / speedVal) * maxSpeed;
             phys.vy = (phys.vy / speedVal) * maxSpeed;
           }

           blade.entity.x += phys.vx * dtSec;
           blade.entity.y += phys.vy * dtSec;
         }

         // Arena boundary clamping (Bypassed if Ghost Dash is active)
         const isGhostDashActive = this.isDodging && modifiers.hasLegendaryUpgrade('ghost_dash');
         if (!isGhostDashActive) {
           const minBound = 20;
           const maxBoundX = this.arenaWidth - 20;
           const maxBoundY = this.arenaHeight - 20;
           if (blade.entity.x < minBound) { blade.entity.x = minBound; phys.vx = 0; }
           if (blade.entity.x > maxBoundX) { blade.entity.x = maxBoundX; phys.vx = 0; }
           if (blade.entity.y < minBound) { blade.entity.y = minBound; phys.vy = 0; }
           if (blade.entity.y > maxBoundY) { blade.entity.y = maxBoundY; phys.vy = 0; }
         }

         // Map linear velocity to simulated angular velocity
         const linearSpeed = Math.sqrt(phys.vx * phys.vx + phys.vy * phys.vy);
         const virtualAngularVel = 3.0 + Phaser.Math.Clamp(linearSpeed / 650, 0, 1.0) * 12.0;
         (weapon as any).customAngularVelocity = virtualAngularVel;

         weapon.overrideTargetX = overrideWeaponTargetX;
         weapon.overrideTargetY = overrideWeaponTargetY;

         const targetAngle = Phaser.Math.Angle.Between(blade.entity.x, blade.entity.y, overrideWeaponTargetX, overrideWeaponTargetY);
         (weapon as any).currentAngle = Phaser.Math.Angle.RotateTo((weapon as any).currentAngle, targetAngle, 0.25);

         const currentAngle = weapon.getAngle();
         sprite.setPosition(
             blade.entity.x + Math.cos(currentAngle) * weapon.handleOffset, 
             blade.entity.y + Math.sin(currentAngle) * weapon.handleOffset
         );
         sprite.rotation = currentAngle;

         const scaleFactor = (weapon.length * reachMultiplier) / 57.6;
         sprite.setScale(scaleFactor);

         // --- Visual Presentation ---
         if (linearSpeed > 100 && Math.random() < 0.35) {
           const trailX = blade.entity.x + Math.cos(currentAngle + Math.PI) * (weapon.length * 0.5);
           const trailY = blade.entity.y + Math.sin(currentAngle + Math.PI) * (weapon.length * 0.5);
           const sparkColor = isGhostDashActive ? 0x98fb98 : (modifiers.hasLegendaryUpgrade('blood_moon_frenzy') ? 0xef4444 : 0x00f3ff);
           this.vfxManager.spawnSparks(trailX, trailY, sparkColor, 2);
         }

         let tintColor = 0x00f3ff;
         let alphaValue = 0.82;

         if (isGhostDashActive) {
           tintColor = 0x8df0b2;
           alphaValue = 0.40;
         } else if (modifiers.hasLegendaryUpgrade('blood_moon_frenzy')) {
           tintColor = 0xef4444;
         }

         sprite.setTint(tintColor);
         sprite.setAlpha(alphaValue);

         this.checkWeaponHits(weapon, false);
      });
      
    } else {
      if (this.astralBlades) {
         this.astralBlades.forEach(b => {
             if (b.entity.gameObject) b.entity.gameObject.destroy();
             const w = b.entity.getComponent<any>('weapon');
             if (w) w.destroy();
         });
         this.astralBlades = null;

         // Restore physical sword visibility and reactivate weapon components
         const pWeapon = this.player.getComponent<WeaponComponent>('weapon');
         if (pWeapon) pWeapon.setActive(true);
         const offhandWeapon = this.player.getComponent<WeaponComponent>('offhand_weapon');
         if (offhandWeapon) offhandWeapon.setActive(true);
         const offhandWeapon2 = this.player.getComponent<WeaponComponent>('offhand_weapon_2');
         if (offhandWeapon2) offhandWeapon2.setActive(true);
         const offhandWeapon3 = this.player.getComponent<WeaponComponent>('offhand_weapon_3');
         if (offhandWeapon3) offhandWeapon3.setActive(true);

         if (this.swordSprite) {
             this.swordSprite.setVisible(true);
             if (this.offhandSwordSprite) this.offhandSwordSprite.setVisible(true);
             if (this.offhand2SwordSprite) this.offhand2SwordSprite.setVisible(true);
             if (this.offhand3SwordSprite) this.offhand3SwordSprite.setVisible(true);
         }
      }
    }

    // 1. Blood Moon Frenzy stack decay and Red Aura
    if (modifiers.hasLegendaryUpgrade('blood_moon_frenzy')) {
      this.bloodMoonFrenzyTimers = this.bloodMoonFrenzyTimers.filter(expiresAt => time < expiresAt);
      if (this.bloodMoonFrenzyTimers.length !== this.bloodMoonFrenzyStacks) {
        this.bloodMoonFrenzyStacks = this.bloodMoonFrenzyTimers.length;

        // Apply new multipliers
        modifiers.removeModifier('blood_moon_frenzy_speed');
        modifiers.removeModifier('blood_moon_frenzy_haste');
        if (this.bloodMoonFrenzyStacks > 0) {
          modifiers.addModifier({
            id: 'blood_moon_frenzy_speed',
            stat: 'speed',
            type: 'multiply',
            value: 1.0 + (this.bloodMoonFrenzyStacks * 0.05)
          });
          modifiers.addModifier({
            id: 'blood_moon_frenzy_haste',
            stat: 'attackSpeed',
            type: 'multiply',
            value: 1.0 + (this.bloodMoonFrenzyStacks * 0.10)
          });
        }
      }

      // Render aura
      if (!this.bloodMoonAuraGraphics) {
        this.bloodMoonAuraGraphics = this.add.graphics();
        this.bloodMoonAuraGraphics.setDepth(((this.player as any).depth || 0) - 1);
      }
      this.bloodMoonAuraGraphics.clear();
      const pulse = 1.0 + 0.15 * Math.sin(time / 150);
      const baseRadius = 25 + this.bloodMoonFrenzyStacks * 4;
      const opacity = 0.15 + (this.bloodMoonFrenzyStacks * 0.05);
      this.bloodMoonAuraGraphics.fillStyle(0xff0000, Math.min(0.8, opacity));
      this.bloodMoonAuraGraphics.fillCircle(this.player.x, this.player.y, baseRadius * pulse);
      
      this.bloodMoonAuraGraphics.lineStyle(2, 0xef4444, Math.min(1.0, opacity * 1.5));
      this.bloodMoonAuraGraphics.strokeCircle(this.player.x, this.player.y, baseRadius * pulse + 5);
    } else {
      if (this.bloodMoonAuraGraphics) {
        this.bloodMoonAuraGraphics.destroy();
        this.bloodMoonAuraGraphics = undefined;
      }
    }

    // 2. Blade Cyclone Logic
    if (this.bladeCycloneActiveTimer > 0) {
      this.bladeCycloneActiveTimer -= delta;

      // Decrement individual hit cooldowns
      for (const [id, remaining] of this.bladeCycloneHitCooldowns.entries()) {
        if (remaining <= delta) {
          this.bladeCycloneHitCooldowns.delete(id);
        } else {
          this.bladeCycloneHitCooldowns.set(id, remaining - delta);
        }
      }

      // Render spinning blades
      if (!this.bladeCycloneGraphics) {
        this.bladeCycloneGraphics = this.add.graphics();
        this.bladeCycloneGraphics.setDepth(((this.player as any).depth || 0) + 1);
      }
      this.bladeCycloneGraphics.clear();

      this.bladeCycloneAngle += (delta / 1000) * Math.PI * 3.5; // 1.75 full rotations per second

      const orbitRadius = 85;
      const numBlades = 3;

      for (let i = 0; i < numBlades; i++) {
        const angle = this.bladeCycloneAngle + (i * Math.PI * 2 / numBlades);
        const bx = this.player.x + Math.cos(angle) * orbitRadius;
        const by = this.player.y + Math.sin(angle) * orbitRadius;

        // Blade line
        this.bladeCycloneGraphics.lineStyle(4, 0x38bdf8, 0.85); // Light blue
        const tipX = bx + Math.cos(angle + Math.PI/2) * 35;
        const tipY = by + Math.sin(angle + Math.PI/2) * 35;
        this.bladeCycloneGraphics.lineBetween(bx, by, tipX, tipY);

        // Crossguard
        this.bladeCycloneGraphics.lineStyle(2, 0x0284c7, 0.9);
        const cgX1 = bx + Math.cos(angle) * 8;
        const cgY1 = by + Math.sin(angle) * 8;
        const cgX2 = bx - Math.cos(angle) * 8;
        const cgY2 = by - Math.sin(angle) * 8;
        this.bladeCycloneGraphics.lineBetween(cgX1, cgY1, cgX2, cgY2);
        
        if (Math.random() < 0.15) {
          this.vfxManager.spawnSparks(tipX, tipY, 0x38bdf8, 1);
        }

        // Collision Check for each blade tip
        this.enemies.forEach(enemy => {
          if (!enemy.active) return;
          const ai = enemy.getComponent<EnemyAIComponent>('ai');
          if (ai && ai.getCurrentState() === EnemyState.DEAD) return;
          const bossAi = enemy.getComponent<BossAIComponent>('ai');
          if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) return;

          const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, tipX, tipY);
          const isBoss = enemy.id.includes('boss');
          const enemyPhysics = enemy.getComponent<PhysicsComponent>('physics');
          const enemyRadius = enemyPhysics ? enemyPhysics.collisionRadius : (isBoss ? 52 : 24);

          if (dist < enemyRadius + 18) {
            // Apply hit cooldown of 400ms to prevent instant shredding
            if (!this.bladeCycloneHitCooldowns.has(enemy.id)) {
              this.bladeCycloneHitCooldowns.set(enemy.id, 400);

              const health = enemy.getComponent<HealthComponent>('health');
              const weapon = this.player.getComponent<WeaponComponent>('weapon');
              const baseDamage = weapon ? weapon.baseDamage : 25;
              const cycloneDamage = Math.round(baseDamage * 0.80); // deals 80% current weapon damage

              if (health && health.takeDamage(cycloneDamage)) {
                this.statsDamageDealt += cycloneDamage;
                this.vfxManager.createDamageText(enemy.x, enemy.y - 15, cycloneDamage, false);
                this.vfxManager.spawnSparks(enemy.x, enemy.y, 0x38bdf8, 3);
                AudioManager.getInstance().playSFX('hit');

                if (!enemy.active) {
                  this.killEnemy(enemy);
                }
              }
            }
          }
        });
      }
    } else {
      if (this.bladeCycloneGraphics) {
        this.bladeCycloneGraphics.destroy();
        this.bladeCycloneGraphics = undefined;
      }
    }

    // 3. Void Rifts Update
    this.activeVoidRifts = this.activeVoidRifts.filter(rift => {
      if (time >= rift.expiresAt) {
        rift.circle.destroy();
        rift.gravityGraphics.destroy();
        return false;
      }

      // Draw gravity swirls
      const graphics = rift.gravityGraphics;
      graphics.clear();
      
      const angleOffset = (time / 300) % (Math.PI * 2);
      
      // Draw 3 spiral arms
      graphics.lineStyle(2, 0xa855f7, 0.6); // Purple swirl
      for (let arm = 0; arm < 3; arm++) {
        const startAngle = angleOffset + (arm * Math.PI * 2 / 3);
        graphics.beginPath();
        for (let r = 0; r <= 140; r += 10) {
          const theta = startAngle + (r / 20);
          const px = rift.x + Math.cos(theta) * r;
          const py = rift.y + Math.sin(theta) * r;
          if (r === 0) graphics.moveTo(px, py);
          else graphics.lineTo(px, py);
        }
        graphics.strokePath();
      }

      // Pull enemies inward and deal damage!
      this.enemies.forEach(enemy => {
        if (!enemy.active) return;
        const ai = enemy.getComponent<EnemyAIComponent>('ai');
        if (ai && ai.getCurrentState() === EnemyState.DEAD) return;
        const bossAi = enemy.getComponent<BossAIComponent>('ai');
        if (bossAi && bossAi.getCurrentState() === BossState.DEFEATED) return;

        const dist = Phaser.Math.Distance.Between(enemy.x, enemy.y, rift.x, rift.y);
        if (dist <= 220) { // Rift pull range is 220px
          const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, rift.x, rift.y);
          const pullForce = 120 * (1.0 - dist / 220);
          
          enemy.x += Math.cos(angle) * pullForce * (delta / 1000);
          enemy.y += Math.sin(angle) * pullForce * (delta / 1000);
          
          const phys = enemy.getComponent<PhysicsComponent>('physics');
          if (phys) phys.clampAndSync();

          // Deal damage if inside rift center (140px) every 400ms
          if (dist <= 140 && time >= rift.nextDamageTime) {
            const health = enemy.getComponent<HealthComponent>('health');
            const weapon = this.player.getComponent<WeaponComponent>('weapon');
            const baseDamage = weapon ? weapon.baseDamage : 25;
            const riftDamage = Math.round(baseDamage * 0.35); // Rift deals 35% of weapon damage per tick

            if (health && health.takeDamage(riftDamage)) {
              this.statsDamageDealt += riftDamage;
              this.vfxManager.createDamageText(enemy.x, enemy.y - 15, riftDamage, false);
              this.vfxManager.spawnSparks(enemy.x, enemy.y, 0xa855f7, 1);
              
              if (!enemy.active) {
                this.killEnemy(enemy);
              }
            }
          }
        }
      });

      if (time >= rift.nextDamageTime) {
        rift.nextDamageTime = time + 400; // tick every 400ms
      }

      return true;
    });
  }

  /**
   * Helper utility to spawn an enemy of a specific type inside the sandbox arena.
   */
  public spawnSandboxEnemy(type: 'melee' | 'heavy' | 'ranged' | 'boss' | 'miniboss', x: number, y: number): void {
    const spriteType = type === 'melee' ? 'enemy-melee' : type === 'heavy' ? 'enemy-heavy' : type === 'ranged' ? 'enemy-ranged' : type === 'boss' ? 'enemy-heavy' : 'enemy-heavy';
    const sprite = this.add.sprite(x, y, spriteType);
    
    let hp = 100;
    let speed = 90;
    
    let isElite = false;
    let eliteMods: string[] = [];
    let finalScale = 1.0;
    let finalRadius = 24;
    let finalWeight = 1.0;
    
    if (type === 'heavy') {
      hp = 250;
      speed = 60;
      isElite = true;
      // 40% chance for dual modifiers in sandbox heavy
      if (Math.random() < 0.40) {
        const pool = ['Burning', 'Vampiric', 'Giant', 'Frozen', 'Armored'];
        const m1 = Phaser.Math.RND.pick(pool);
        const m2 = Phaser.Math.RND.pick(pool.filter(m => m !== m1));
        eliteMods = [m1, m2];
      } else {
        eliteMods = [Phaser.Math.RND.pick(['Burning', 'Vampiric', 'Giant', 'Frozen', 'Armored'])];
      }
    } else if (type === 'ranged') {
      hp = 80;
      speed = 110;
    } else if (type === 'boss') {
      hp = 2000;
      speed = 70;
      sprite.setScale(2.5);
      sprite.setTint(0xff3366);
      finalRadius = 52;
      finalWeight = 10.0;
    } else if (type === 'miniboss') {
      hp = 800;
      speed = 100;
      isElite = true;
      eliteMods = [Phaser.Math.RND.pick(['Burning', 'Vampiric', 'Giant', 'Frozen', 'Armored'])];
      finalScale = 1.85;
      finalRadius = 44;
      finalWeight = 8.0;
    }
    
    const enemy = new BaseEntity(`sandbox_${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`, sprite);
    
    if (type === 'heavy' && isElite) {
      (enemy as any).isElite = true;
      (enemy as any).eliteMods = eliteMods;
      
      let hpMult = 1.0;
      let speedMult = 1.0;
      
      eliteMods.forEach(mod => {
        if (mod === 'Burning') {
          hpMult *= 1.25; speedMult *= 1.15; finalScale = Math.max(finalScale, 1.25);
        } else if (mod === 'Vampiric') {
          hpMult *= 1.35; finalScale = Math.max(finalScale, 1.25);
        } else if (mod === 'Giant') {
          hpMult *= 2.0; speedMult *= 0.90; finalScale = Math.max(finalScale, 1.65); finalRadius = 36; finalWeight = 3.0;
        } else if (mod === 'Frozen') {
          hpMult *= 1.15; finalScale = Math.max(finalScale, 1.25);
        } else if (mod === 'Armored') {
          hpMult *= 1.8; speedMult *= 0.80; finalScale = Math.max(finalScale, 1.25); finalWeight = 999.0;
        }
      });
      
      hp = Math.round(hp * hpMult);
      speed = Math.round(speed * speedMult);
      sprite.setScale(finalScale);
      
      const mainMod = eliteMods[0];
      if (mainMod === 'Burning') sprite.setTint(0xff5500);
      else if (mainMod === 'Vampiric') sprite.setTint(0xd946ef);
      else if (mainMod === 'Frozen') sprite.setTint(0x06b6d4);
      else if (mainMod === 'Giant') sprite.setTint(0x4f46e5);
      else if (mainMod === 'Armored') sprite.setTint(0xeab308);
      
      const modText = eliteMods.join(' + ') + ' Elite';
      this.vfxManager.addFloatingWorldText(x, y - 30, modText, '#ffaa00');
    } else if (type === 'miniboss' && isElite) {
      (enemy as any).isElite = true;
      (enemy as any).isMiniBoss = true;
      (enemy as any).eliteMods = eliteMods;
      
      const mainMod = eliteMods[0];
      let hpMult = 2.5;
      let speedMult = 1.10;
      
      if (mainMod === 'Burning') {
        hpMult *= 1.25; speedMult *= 1.15; sprite.setTint(0xff5500);
      } else if (mainMod === 'Vampiric') {
        hpMult *= 1.35; sprite.setTint(0xd946ef);
      } else if (mainMod === 'Giant') {
        hpMult *= 2.0; speedMult *= 0.90; finalScale = 2.2; finalRadius = 50; finalWeight = 12.0; sprite.setTint(0x4f46e5);
      } else if (mainMod === 'Frozen') {
        hpMult *= 1.15; sprite.setTint(0x06b6d4);
      } else if (mainMod === 'Armored') {
        hpMult *= 1.8; speedMult *= 0.8; finalWeight = 999.0; sprite.setTint(0xeab308);
      }
      
      hp = Math.round(hp * hpMult);
      speed = Math.round(speed * speedMult);
      sprite.setScale(finalScale);
      
      this.vfxManager.addFloatingWorldText(x, y - 45, `${mainMod} Champion`, '#ffd700');
    } else if (type === 'boss') {
      this.vfxManager.addFloatingWorldText(x, y - 50, 'COLOSSEUM OVERLORD', '#ff3366');
    }
    
    const physics = enemy.addComponent('physics', new PhysicsComponent(enemy, speed));
    physics.setBoundaries(32, this.arenaWidth - 32, 32, this.arenaHeight - 32);
    physics.collisionRadius = finalRadius;
    physics.weight = finalWeight;
    
    const health = enemy.addComponent('health', new HealthComponent(enemy, hp));
    const ai = enemy.addComponent('ai', new EnemyAIComponent(enemy, this.player));
    
    physics.init();
    health.init();
    ai.init();

    if ((enemy as any).isElite && eliteMods.length > 0) {
      const eliteComp = enemy.addComponent('elite', new EliteComponent(enemy, eliteMods));
      eliteComp.init();
    }
    
    this.enemies.push(enemy);
    this.vfxManager.spawnSparks(x, y, 0xa855f7, 10);
  }

  /**
   * Renders the on-screen sandbox controller guide text.
   */
  private createSandboxHUD(): void {
    const x = 20;
    const y = 80;
    const style = {
      fontFamily: 'monospace',
      fontSize: '11px',
      color: '#00f3ff',
      backgroundColor: 'rgba(5, 7, 15, 0.85)',
      padding: { x: 12, y: 12 },
      lineSpacing: 5
    };

    const text = this.add.text(x, y, 
      "=== SANDBOX ARENA CONTROL ===\n" +
      "[ESC] Return to Main Menu\n" +
      "[K]   Spawn Melee Dummy (at Cursor)\n" +
      "[L]   Spawn Elite Heavy (at Cursor)\n" +
      "[O]   Spawn Colossus Boss (at Center)\n" +
      "[H]   Heal Player to Full HP\n" +
      "[I]   Grant Instant 500 Gold\n" +
      "[P]   Trigger Upgrade Selection\n" +
      "[Z]   Clear All Enemies\n" +
      "=============================", 
      style
    );
    text.setScrollFactor(0);
    text.setDepth(100);
  }

  /**
   * Sets up all keyboard keybindings for Sandbox Mode.
   */
  private setupSandboxKeys(): void {
    // K: Spawn Melee Dummy
    this.input.keyboard?.on('keydown-K', () => {
      const pointer = this.input.activePointer;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.spawnSandboxEnemy('melee', worldPoint.x, worldPoint.y);
      this.vfxManager.addFloatingWorldText(worldPoint.x, worldPoint.y, "Spawned Melee Dummy", "#00f3ff");
    });

    // L: Spawn Elite Heavy
    this.input.keyboard?.on('keydown-L', () => {
      const pointer = this.input.activePointer;
      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.spawnSandboxEnemy('heavy', worldPoint.x, worldPoint.y);
      this.vfxManager.addFloatingWorldText(worldPoint.x, worldPoint.y, "Spawned Elite Heavy", "#ffaa00");
    });

    // O: Spawn Boss
    this.input.keyboard?.on('keydown-O', () => {
      const x = this.arenaWidth / 2;
      const y = this.arenaHeight / 2 - 200;
      this.spawnSandboxEnemy('boss', x, y);
      this.vfxManager.addFloatingWorldText(x, y, "BOSS OVERLORD SPAWNED", "#ff3366");
    });

    // H: Heal Player
    this.input.keyboard?.on('keydown-H', () => {
      const health = this.playerHealth;
      if (health) {
        health.heal(health.getMaxHp());
        this.vfxManager.addFloatingWorldText(this.player.x, this.player.y - 40, "HEALED TO FULL HP", "#00ff66");
      }
    });

    // I: Grant 500 Gold
    this.input.keyboard?.on('keydown-I', () => {
      this.collectedGold += 500;
      this.vfxManager.addFloatingWorldText(this.player.x, this.player.y - 40, "+500 GOLD", "#ffd700");
    });

    // P: Trigger Upgrade Selection Menu
    this.input.keyboard?.on('keydown-P', () => {
      this.triggerUpgradeSelection();
    });

    // Z: Clear Enemies
    this.input.keyboard?.on('keydown-Z', () => {
      this.enemies.forEach(e => {
        const health = e.getComponent<HealthComponent>('health');
        if (health) {
          health.takeDamage(999999);
        }
      });
      this.vfxManager.addFloatingWorldText(this.player.x, this.player.y - 40, "CLEARED ARENA", "#ef4444");
    });
  }

  private spawnElitePuddle(x: number, y: number, type: 'fire' | 'ice', isExploding: boolean = false): void {
    const radius = 22;
    const color = type === 'fire' ? 0xff5500 : 0x00d2ff;
    const c = this.add.circle(x, y, radius, color, 0.35);
    c.setDepth(2); // render on floor
    
    c.setScale(0);
    this.tweens.add({
      targets: c,
      scale: 1,
      duration: 180,
      ease: 'Back.out'
    });

    const border = this.add.graphics();
    border.setDepth(2);
    border.lineStyle(1.5, color, 0.45);
    border.strokeCircle(x, y, radius);

    this.activeElitePuddles.push({
      circle: c,
      border: border,
      type: type,
      x: x,
      y: y,
      radius: radius,
      expiresAt: this.time.now + 3000, // lasts 3s
      nextDamageTime: this.time.now + 200,
      isExploding: isExploding
    });
  }

  private updateActiveEliteHazards(time: number, delta: number): void {
    const dtSeconds = delta / 1000;
    
    // 1. Update active puddles
    this.activeElitePuddles = this.activeElitePuddles.filter(p => {
      if (time >= p.expiresAt) {
        if (p.type === 'fire' && p.isExploding) {
          this.vfxManager.spawnSparks(p.x, p.y, 0xff5500, 8);
          AudioManager.getInstance().playSFX('hit');
          const distToPlayer = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
          if (distToPlayer < 45 && !this.isDodging && this.player.active) {
            this.damagePlayer();
          }
        }
        
        p.circle.destroy();
        p.border?.destroy();
        return false;
      }
      
      const remainingPct = (p.expiresAt - time) / 3000;
      if (remainingPct > 0) {
        p.circle.setScale(Phaser.Math.Clamp(remainingPct, 0.2, 1.0));
      }

      const distToPlayer = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.x, p.y);
      if (distToPlayer < p.radius) {
        if (p.type === 'fire') {
          if (time >= p.nextDamageTime) {
            p.nextDamageTime = time + 500;
            if (!this.isDodging && this.player.active) {
              this.damagePlayer();
            }
          }
        } else if (p.type === 'ice') {
          const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
          if (modifiers && !modifiers.hasModifier('elite_ice_puddle_slow')) {
            modifiers.addModifier({
              id: 'elite_ice_puddle_slow',
              stat: 'speed',
              type: 'multiply',
              value: 0.50
            });
            this.time.delayedCall(500, () => {
              if (modifiers) modifiers.removeModifier('elite_ice_puddle_slow');
            });
          }
        }
      }

      return true;
    });

    // 2. Update active projectiles
    this.activeEliteProjectiles = this.activeEliteProjectiles.filter(p => {
      if (time >= p.expiresAt) {
        p.sprite.destroy();
        return false;
      }

      p.sprite.x += p.vx * dtSeconds;
      p.sprite.y += p.vy * dtSeconds;

      if (p.scaleUp) {
        const elapsed = time - (p.expiresAt - 1200);
        const pct = Phaser.Math.Clamp(elapsed / 1200, 0, 1);
        const curScale = 0.1 + pct * (p.maxScale || 2.5);
        p.sprite.setScale(curScale);
        if ('setAlpha' in p.sprite) {
          (p.sprite as any).setAlpha(1.0 - pct);
        }
      }

      const distToPlayer = Phaser.Math.Distance.Between(this.player.x, this.player.y, p.sprite.x, p.sprite.y);
      const radius = p.radius || 15;

      if (p.type === 'flame_arrow') {
        p.sprite.rotation = Math.atan2(p.vy, p.vx);
        if (distToPlayer < radius + 15) {
          if (!this.isDodging && this.player.active) {
            this.damagePlayer();
            this.spawnElitePuddle(p.sprite.x, p.sprite.y, 'fire', false);
            p.sprite.destroy();
            return false;
          }
        }
      } else if (p.type === 'blood_orb') {
        if (p.owner && p.owner.active) {
          const ai = (p.owner as any).getComponent('ai') as EnemyAIComponent;
          if (ai && ai.getCurrentState() !== EnemyState.DEAD) {
            const angleToOwner = Phaser.Math.Angle.Between(p.sprite.x, p.sprite.y, p.owner.x, p.owner.y);
            p.vx = Math.cos(angleToOwner) * 120;
            p.vy = Math.sin(angleToOwner) * 120;
            
            const distToOwner = Phaser.Math.Distance.Between(p.owner.x, p.owner.y, p.sprite.x, p.sprite.y);
            if (distToOwner < 24) {
              const hpComp = (p.owner as any).getComponent('health') as HealthComponent;
              if (hpComp) {
                hpComp.heal(Math.round(hpComp.getMaxHp() * 0.12));
                this.vfxManager.spawnSparks(p.owner.x, p.owner.y, 0x10b981, 6);
              }
              p.sprite.destroy();
              return false;
            }
          }
        }
        if (distToPlayer < radius + 15) {
          this.vfxManager.spawnSparks(p.sprite.x, p.sprite.y, 0xec4899, 8);
          p.sprite.destroy();
          return false;
        }
      } else if (p.type === 'frost_pulse') {
        const curRadius = (p.sprite as any).scaleX * radius;
        if (distToPlayer < curRadius) {
          if (!this.isDodging && this.player.active) {
            const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
            if (modifiers && !modifiers.hasModifier('elite_frost_pulse_slow')) {
              modifiers.addModifier({
                id: 'elite_frost_pulse_slow',
                stat: 'speed',
                type: 'multiply',
                value: 0.50
              });
              this.vfxManager.spawnSparks(this.player.x, this.player.y, 0x06b6d4, 6);
              this.time.delayedCall(2500, () => {
                if (modifiers) modifiers.removeModifier('elite_frost_pulse_slow');
              });
            }
            if (p.damage > 0 && !p.sprite.getData('hasDamaged')) {
              p.sprite.setData('hasDamaged', true);
              this.damagePlayer();
            }
          }
        }
      } else if (p.type === 'shockwave') {
        const curRadius = (p.sprite as any).scaleX * radius;
        if (distToPlayer < curRadius && !p.sprite.getData('hasDamaged')) {
          p.sprite.setData('hasDamaged', true);
          if (!this.isDodging && this.player.active) {
            this.damagePlayer();
            const angle = Phaser.Math.Angle.Between(p.sprite.x, p.sprite.y, this.player.x, this.player.y);
            this.playerPhysics.setVelocity(Math.cos(angle) * 350, Math.sin(angle) * 350);
          }
        }
      } else if (p.type === 'fire') {
        if (distToPlayer < radius + 15) {
          if (!this.isDodging && this.player.active) {
            this.damagePlayer();
            this.spawnElitePuddle(p.sprite.x, p.sprite.y, 'fire', false);
            p.sprite.destroy();
            return false;
          }
        }
      } else if (p.type === 'ice') {
        if (distToPlayer < radius + 15) {
          if (!this.isDodging && this.player.active) {
            this.damagePlayer();
            const modifiers = this.player.getComponent<ModifierComponent>('modifiers');
            if (modifiers && !modifiers.hasModifier('elite_ice_slow')) {
              modifiers.addModifier({
                id: 'elite_ice_slow',
                stat: 'speed',
                type: 'multiply',
                value: 0.60
              });
              this.vfxManager.spawnSparks(this.player.x, this.player.y, 0x06b6d4, 6);
              this.time.delayedCall(1500, () => {
                if (modifiers) modifiers.removeModifier('elite_ice_slow');
              });
            }
            p.sprite.destroy();
            return false;
          }
        }
      }

      return true;
    });
  }

  private updateEliteMechanics(time: number, delta: number): void {
    this.updateActiveEliteHazards(time, delta);

    // Note: Modular elite abilities and passive trails are now fully handled by EliteComponent!
    // Update champion/legendary extra behaviors
    this.enemies.forEach(enemy => {
      if (!enemy.active) return;
      const ai = enemy.getComponent<EnemyAIComponent>('ai');
      if (ai && ai.getCurrentState() === EnemyState.DEAD) return;

      const eliteMods: string[] = (enemy as any).eliteMods || [];
      const isLegendary = (enemy as any).isLegendaryBeast || false;
      const isMiniBoss = (enemy as any).isMiniBoss || false;
      const isChampion = isMiniBoss;

      if (!isChampion && !isLegendary) return;

      if ((enemy as any).lastAbilityTime === undefined) {
        (enemy as any).lastAbilityTime = time;
      }

      // --- CHAMPION & LEGENDARY BEAST EXTRAS ---
      if (eliteMods.includes('Burning') && time - (enemy as any).lastAbilityTime > 12000) {
        (enemy as any).lastAbilityTime = time;
        const warningRing = this.add.graphics();
        warningRing.setDepth(1);
        warningRing.lineStyle(2, 0xff3700, 0.7);
        
        const px = this.player.x;
        const py = this.player.y;
        warningRing.strokeCircle(px, py, 130);

        this.tweens.add({
          targets: warningRing,
          alpha: 0.2,
          duration: 200,
          yoyo: true,
          repeat: 5,
          onComplete: () => {
            warningRing.destroy();
            const numPuddles = 9;
            for (let a = 0; a < Math.PI * 2; a += (Math.PI * 2) / numPuddles) {
              const fx = px + Math.cos(a) * 130;
              const fy = py + Math.sin(a) * 130;
              this.spawnElitePuddle(fx, fy, 'fire', true);
            }
            AudioManager.getInstance().playSFX('hit');
          }
        });
      }

      if (eliteMods.includes('Vampiric') && time - (enemy as any).lastAbilityTime > 12000) {
        (enemy as any).lastAbilityTime = time;
        AudioManager.getInstance().playSFX('powerup');
        this.vfxManager.spawnSparks(enemy.x, enemy.y, 0xec4899, 10);

        for (let a = 0; a < Math.PI * 2; a += Math.PI / 2) {
          const orb = this.add.circle(enemy.x + Math.cos(a) * 45, enemy.y + Math.sin(a) * 45, 10, 0xec4899, 0.8);
          orb.setDepth(3);
          this.activeEliteProjectiles.push({
            sprite: orb,
            type: 'blood_orb',
            vx: Math.cos(a) * 100,
            vy: Math.sin(a) * 100,
            damage: 0,
            owner: enemy,
            radius: 12,
            expiresAt: time + 6000
          });
        }
      }

      if (eliteMods.includes('Frozen') && time - (enemy as any).lastAbilityTime > 12000) {
        (enemy as any).lastAbilityTime = time;
        AudioManager.getInstance().playSFX('shatter');
        this.vfxManager.spawnSparks(enemy.x, enemy.y, 0x06b6d4, 12);

        const c = this.add.circle(enemy.x, enemy.y, 10, 0x06b6d4, 0.25);
        c.setDepth(2);
        this.activeEliteProjectiles.push({
          sprite: c,
          type: 'frost_pulse',
          vx: 0,
          vy: 0,
          damage: 0.5,
          radius: 250,
          scaleUp: true,
          maxScale: 25.0,
          expiresAt: time + 1400
        });
      }

      // --- LEGENDARY BEAST SPECIFIC EXTRA ATTACKS ---
      if (isLegendary) {
        if ((enemy as any).legendaryTheme === 'Burning' && (enemy as any).legendaryTimer === undefined) {
          (enemy as any).legendaryTheme = 'Burning';
          (enemy as any).legendaryTimer = time + 2000;
        }

        if ((enemy as any).legendaryTheme === 'Burning' && time >= (enemy as any).legendaryTimer) {
          (enemy as any).legendaryTimer = time + 8000;

          const mx = this.player.x + Phaser.Math.Between(-80, 80);
          const my = this.player.y + Phaser.Math.Between(-80, 80);

          const warningG = this.add.graphics();
          warningG.setDepth(1);
          warningG.lineStyle(2, 0xff0000, 0.7);
          warningG.strokeCircle(mx, my, 45);

          this.tweens.add({
            targets: warningG,
            alpha: 0.1,
            duration: 150,
            yoyo: true,
            repeat: 5,
            onComplete: () => {
              warningG.destroy();
              this.spawnElitePuddle(mx, my, 'fire', true);
              AudioManager.getInstance().playSFX('hit');
              this.vfxManager.spawnSparks(mx, my, 0xff3700, 15);
            }
          });

          for (let k = 0; k < 2; k++) {
            const tx = enemy.x + Phaser.Math.Between(-50, 50);
            const ty = enemy.y + Phaser.Math.Between(-50, 50);
            const tornado = this.add.circle(tx, ty, 15, 0xffaa00, 0.55);
            tornado.setDepth(3);

            const tang = Phaser.Math.Angle.Between(tx, ty, this.player.x, this.player.y) + Phaser.Math.Between(-0.5, 0.5);
            this.activeEliteProjectiles.push({
              sprite: tornado,
              type: 'flame_arrow',
              vx: Math.cos(tang) * 110,
              vy: Math.sin(tang) * 110,
              damage: 0.5,
              radius: 18,
              expiresAt: time + 4500
            });
          }
        }
      }
    });
  }

}