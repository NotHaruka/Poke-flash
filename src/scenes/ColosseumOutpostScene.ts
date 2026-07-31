import Phaser from 'phaser';
import { GameScene } from './GameScene.js';
import { Logger } from '../utils/Logger.js';
import { EventBus } from '../core/EventBus.js';
import { EventTopic, GLADIATOR_CHARACTERS } from '../core/Constants.js';
import { BaseEntity } from '../entities/BaseEntity.js';
import { HealthComponent } from '../entities/HealthComponent.js';
import { PhysicsComponent } from '../entities/PhysicsComponent.js';
import { ModifierComponent } from '../entities/components/ModifierComponent.js';
import { AudioManager } from '../managers/AudioManager.js';
import { VFXManager } from '../managers/VFXManager.js';
import { SceneManager } from '../core/SceneManager.js';
import { ALL_UPGRADES, UpgradeDefinition, UpgradeRarity, RARITY_CONFIGS } from '../core/Upgrades.js';

class DummyHealthComponent extends HealthComponent {
  public totalDamage = 0;
  public hitCount = 0;
  public critCount = 0;
  public lastHit = 0;
  public firstHitTime = 0;
  public lastHitTime = 0;
  private scene: ColosseumOutpostScene;

  constructor(owner: BaseEntity, scene: ColosseumOutpostScene) {
    super(owner, 1000000); // 1 million max HP
    this.scene = scene;
  }

  public recordHit(amount: number, isCrit: boolean): void {
    const now = this.scene.time.now;
    if (this.firstHitTime === 0) {
      this.firstHitTime = now;
    }
    this.lastHitTime = now;
    this.totalDamage += amount;
    this.hitCount++;
    this.lastHit = amount;
    if (isCrit) {
      this.critCount++;
    }
  }

  public override takeDamage(amount: number): boolean {
    // Prevent dummy from losing actual HP or dying
    this.setHp(1000000);
    return true;
  }

  public resetMetrics(): void {
    this.totalDamage = 0;
    this.hitCount = 0;
    this.critCount = 0;
    this.lastHit = 0;
    this.firstHitTime = 0;
    this.lastHitTime = 0;
  }
}

export class ColosseumOutpostScene extends GameScene {
  private keyE!: Phaser.Input.Keyboard.Key;
  public currentInteractionAction: (() => void) | null = null;
  private isShopOpen = false;
  private activeShopTab: 'weapon' | 'defense' | 'utility' = 'weapon';
  
  // Elements
  private forgeLight!: Phaser.GameObjects.Arc;
  private fountainLight!: Phaser.GameObjects.Arc;
  private interactionPromptText!: Phaser.GameObjects.Text;
  
  // Shop Stock
  private shopStock: {
    weapon: { upgrade: UpgradeDefinition; price: number; currentTier: number; maxTier: number }[];
    defense: { upgrade: UpgradeDefinition; price: number; currentTier: number; maxTier: number }[];
    utility: { upgrade: UpgradeDefinition; price: number; currentTier: number; maxTier: number }[];
    relics: { upgrade: UpgradeDefinition; price: number; currentTier: number; maxTier: number }[];
  } = { weapon: [], defense: [], utility: [], relics: [] };

  private refreshCost = 25;
  private refreshCount = 0;

  // State restored from run
  private gladiatorIndex = 0;
  private waveNumber = 1;

  // Training Dummy Components
  private dummyEntity!: BaseEntity;
  private dummyHealth!: DummyHealthComponent;
  private dummyStatsText!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'ColosseumOutpostScene' });
    this.logger = new Logger('ColosseumOutpostScene');
  }

  public override init(data?: {
    gladiatorIndex?: number;
    wave?: number;
    weaponClass?: string;
    gold?: number;
    hp?: number;
    maxHp?: number;
    score?: number;
    playerLevel?: number;
    playerXP?: number;
    playerXPNeeded?: number;
    chosenUpgradesList?: any[];
    excludedUpgrades?: string[];
  }): void {
    // Run core GameScene init
    super.init(data);
    
    this.gladiatorIndex = data && data.gladiatorIndex !== undefined ? data.gladiatorIndex : 0;
    this.waveNumber = data && data.wave !== undefined ? data.wave : 1;
    this.selectedWeaponId = data && data.weaponClass !== undefined ? data.weaponClass : 'longsword';
    this.arenaWidth = 1000;
    this.arenaHeight = 800;
    this.refreshCost = 25;
    this.refreshCount = 0;
    this.isShopOpen = false;
  }

  public override create(): void {
    // 1. Create player, equipment, input and trail systems
    super.create();

    // 2. Hide core wave indicators or HUD elements that aren't relevant in the hub
    const hudWave = document.getElementById('bb-hud-wave');
    if (hudWave) hudWave.textContent = `OUTPOST (WAVE ${this.waveNumber})`;
    const hudEnemies = document.getElementById('bb-hud-enemies');
    if (hudEnemies) hudEnemies.textContent = `PEACEFUL HUB`;

    // 3. Register Key E for interactions
    if (this.input.keyboard) {
      this.keyE = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    }

    // 4. Set Player properties for Outpost scene
    this.player.x = 500;
    this.player.y = 520;
    this.playerPhysics.setBoundaries(50, 950, 50, 750);

    // 5. Build Handcrafted Layout elements
    this.createDecorativeHub();

    // 6. Generate Blacksmith Shop Inventory
    this.generateShopStock();

    // 7. Bind Window Actions specifically for this Outpost Scene instance
    this.bindWindowActions();

    // 8. Add general camera fade-in effect on entering the Outpost
    this.cameras.main.fadeIn(800, 0, 0, 0);
  }

  public override initializeGameplaySystems(): void {
    // Overridden to do nothing - prevents standard enemy wave spawns and combat HUD visible toggles!
    const leftPanel = document.getElementById('bb-hud-left-panel');
    if (leftPanel) leftPanel.style.display = 'flex';
    const middlePanel = document.getElementById('bb-hud-middle-panel');
    if (middlePanel) middlePanel.style.display = 'flex';
    this.updateHUDValues();
  }

  public override createArenaGrid(width: number, height: number): void {
    // Handled in overridden method to draw cozy stone outpost floor
    const g = this.add.graphics();
    // Warm, ambient stonework floor
    g.fillGradientStyle(0x0a0b12, 0x07080e, 0x121422, 0x090a14, 1);
    g.fillRect(0, 0, width, height);

    // Draw stone tiles grid
    g.lineStyle(1.5, 0x000000, 0.45);
    const tileSize = 60;
    for (let x = 0; x < width; x += tileSize) {
      g.moveTo(x, 0);
      g.lineTo(x, height);
    }
    for (let y = 0; y < height; y += tileSize) {
      g.moveTo(0, y);
      g.lineTo(width, y);
    }
    g.strokePath();

    // Draw gold/crimson circular trim at the center of the Outpost
    g.lineStyle(3, 0xcda250, 0.25);
    g.strokeCircle(width / 2, height / 2, 220);
    g.lineStyle(1.5, 0x991b1b, 0.3);
    g.strokeCircle(width / 2, height / 2, 224);
  }

  private createDecorativeHub(): void {
    const width = this.arenaWidth;
    const height = this.arenaHeight;

    // --- FORGE AREA (Top-Left: x = 200, y = 220) ---
    // Warm glowing background
    this.forgeLight = this.add.circle(200, 220, 160, 0xf97316, 0.08);
    this.forgeLight.setBlendMode('ADD');

    // Drawing the brick fireplace/hearth
    const forgeGFX = this.add.graphics();
    forgeGFX.fillStyle(0x1e293b, 1); // Dark brick grey
    forgeGFX.fillRect(140, 140, 120, 80);
    // Glowing hot fireplace core
    forgeGFX.fillStyle(0xea580c, 0.95);
    forgeGFX.fillCircle(200, 195, 30);
    forgeGFX.fillStyle(0xfacc15, 0.98);
    forgeGFX.fillCircle(200, 195, 18);

    // Anvil
    forgeGFX.fillStyle(0x0f172a, 1); // Charcoal iron
    forgeGFX.fillRect(175, 230, 50, 24);
    forgeGFX.fillRect(185, 254, 30, 16);
    forgeGFX.fillRect(165, 270, 70, 10);

    // Particles: Forge Smoke rising
    this.add.particles(200, 180, 'spark-texture', {
      lifespan: 1800,
      speedY: { min: -30, max: -65 },
      speedX: { min: -10, max: 10 },
      scale: { start: 1.5, end: 4 },
      alpha: { start: 0.35, end: 0 },
      tint: 0x52525b, // Dark grey smoke
      frequency: 200,
      blendMode: 'NORMAL'
    });

    // Particles: Forge Embers/Sparks rising
    this.add.particles(200, 190, 'spark-texture', {
      lifespan: { min: 800, max: 1500 },
      speedY: { min: -50, max: -120 },
      speedX: { min: -25, max: 25 },
      scale: { start: 1.2, end: 0.1 },
      alpha: { start: 0.9, end: 0 },
      tint: 0xf97316, // Orange embers
      frequency: 120,
      blendMode: 'ADD'
    });

    // Blacksmith Magnus NPC Representation
    // Draw Magnus as a bulky blacksmith circle standing near the anvil (at x = 230, y = 250)
    const npcGFX = this.add.graphics();
    npcGFX.lineStyle(2.5, 0xf97316, 0.85); // glowing orange rim
    npcGFX.fillStyle(0x7c2d12, 1); // deep leather brown apron
    npcGFX.fillCircle(230, 245, 18);
    npcGFX.strokeCircle(230, 245, 18);
    npcGFX.fillStyle(0xe2e8f0, 1); // broad dwarf shoulders representation
    npcGFX.fillRect(215, 253, 30, 10);
    // Draw hammer icon inside
    npcGFX.fillStyle(0x94a3b8, 1);
    npcGFX.fillRect(228, 238, 4, 14);
    npcGFX.fillRect(223, 238, 14, 5);

    // Floating name above Magnus
    this.add.text(230, 215, "Magnus (Blacksmith)", {
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: '11px',
      color: '#eab308',
      fontStyle: 'bold'
    }).setOrigin(0.5);


    // --- HEALING FOUNTAIN (Top-Right: x = 800, y = 220) ---
    this.fountainLight = this.add.circle(800, 220, 140, 0x06b6d4, 0.08);
    this.fountainLight.setBlendMode('ADD');

    // Stone basin
    const fountainGFX = this.add.graphics();
    fountainGFX.fillStyle(0x475569, 1); // Slate stone
    fountainGFX.fillCircle(800, 220, 42);
    fountainGFX.fillStyle(0x64748b, 1);
    fountainGFX.fillCircle(800, 220, 39);
    // Glowing healing water
    fountainGFX.fillStyle(0x0891b2, 0.85);
    fountainGFX.fillCircle(800, 220, 32);
    fountainGFX.fillStyle(0x22d3ee, 0.95);
    fountainGFX.fillCircle(800, 220, 18);

    // Particles: Water bubbles
    this.add.particles(800, 220, 'spark-texture', {
      lifespan: { min: 1000, max: 2000 },
      speedY: { min: -15, max: -45 },
      speedX: { min: -15, max: 15 },
      scale: { start: 0.8, end: 1.8 },
      alpha: { start: 0.7, end: 0 },
      tint: 0x22d3ee, // cyan bubby mist
      frequency: 250,
      blendMode: 'ADD'
    });

    // Floating name above Fountain
    this.add.text(800, 165, "Healing Fountain", {
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: '11px',
      color: '#06b6d4',
      fontStyle: 'bold'
    }).setOrigin(0.5);


    // --- ARENA GATE (Top-Center: x = 500, y = 140) ---
    // Gate arch
    const gateGFX = this.add.graphics();
    gateGFX.fillStyle(0x1e293b, 1);
    gateGFX.fillRect(430, 80, 140, 60);
    // Iron vertical bars
    gateGFX.lineStyle(3, 0x0f172a, 1);
    for (let x = 445; x <= 555; x += 15) {
      gateGFX.moveTo(x, 80);
      gateGFX.lineTo(x, 140);
    }
    gateGFX.strokePath();
    // Golden frame trim
    gateGFX.lineStyle(3, 0xeab308, 0.45);
    gateGFX.strokeRect(430, 80, 140, 60);

    // Floating name above gate
    this.add.text(500, 60, "Colosseum Arena Gate", {
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: '11px',
      color: '#ef4444',
      fontStyle: 'bold'
    }).setOrigin(0.5);


    // --- TRAINING DUMMY (Bottom-Left: x = 250, y = 600) ---
    // Instantiating training dummy sprite/graphic representation
    const dummySprite = this.add.sprite(250, 600, 'sword-texture'); // Reuse sword texture to register sprite layer but hide it or overlay custom graphic
    dummySprite.setVisible(false);

    this.dummyEntity = new BaseEntity('training_dummy', dummySprite);
    this.dummyEntity.x = 250;
    this.dummyEntity.y = 600;

    // Attach custom DummyHealthComponent
    this.dummyHealth = this.dummyEntity.addComponent('health', new DummyHealthComponent(this.dummyEntity, this));
    
    // Add dummy to standard enemies array so GameScene weapon slashes collide and trigger attacks on it!
    this.enemies.push(this.dummyEntity);

    // Draw the Practice Target visual representation
    const targetGFX = this.add.graphics();
    // Wooden post
    targetGFX.fillStyle(0x78350f, 1);
    targetGFX.fillRect(246, 600, 8, 30);
    // Concentric Target Rings
    targetGFX.fillStyle(0xd97706, 1); // outer brown circle
    targetGFX.fillCircle(250, 590, 22);
    targetGFX.fillStyle(0xffffff, 1); // white ring
    targetGFX.fillCircle(250, 590, 15);
    targetGFX.fillStyle(0xd97706, 1); // inner ring
    targetGFX.fillCircle(250, 590, 10);
    targetGFX.fillStyle(0xef4444, 1); // bullseye
    targetGFX.fillCircle(250, 590, 5);

    // Metrics Dashboard text floating above the dummy
    this.dummyStatsText = this.add.text(250, 545, "Practice Target Dummy\nLast Hit: -- | Avg: --\nDPS: -- | Hits: --", {
      fontFamily: '"JetBrains Mono", monospace',
      fontSize: '11px',
      color: '#a1a1aa',
      align: 'center',
      lineSpacing: 4,
      backgroundColor: '#0c0a0fbc',
      padding: { x: 8, y: 6 }
    }).setOrigin(0.5);


    // --- DECORATIVE PROPS ---
    // Weapon Racks at (400, 650) and (600, 650)
    const rack1 = this.add.graphics();
    rack1.fillStyle(0x78350f, 1);
    rack1.fillRect(380, 640, 40, 8); // crossbar
    rack1.fillRect(384, 648, 6, 16);  // left leg
    rack1.fillRect(410, 648, 6, 16);  // right leg
    // Weapon details in rack
    rack1.lineStyle(1.5, 0x94a3b8, 0.85);
    rack1.moveTo(392, 630); rack1.lineTo(392, 645);
    rack1.moveTo(402, 626); rack1.lineTo(402, 645);
    rack1.strokePath();

    const rack2 = this.add.graphics();
    rack2.fillStyle(0x78350f, 1);
    rack2.fillRect(580, 640, 40, 8); // crossbar
    rack2.fillRect(584, 648, 6, 16);  // left leg
    rack2.fillRect(610, 648, 6, 16);  // right leg
    // Weapon details in rack
    rack2.lineStyle(1.5, 0x94a3b8, 0.85);
    rack2.moveTo(592, 628); rack2.lineTo(592, 645);
    rack2.moveTo(602, 631); rack2.lineTo(602, 645);
    rack2.strokePath();

    // Stone Pillars at boundaries
    const pillarPositions = [
      { x: 100, y: 380 }, { x: 100, y: 680 },
      { x: 900, y: 380 }, { x: 900, y: 680 }
    ];
    pillarPositions.forEach(p => {
      const pil = this.add.graphics();
      // Pillar shadow
      pil.fillStyle(0x000000, 0.25);
      pil.fillEllipse(p.x, p.y + 35, 30, 15);
      // Pillar cylinder
      pil.fillStyle(0x334155, 1); // slate blue gray
      pil.fillRect(p.x - 14, p.y - 35, 28, 70);
      pil.fillStyle(0x475569, 1); // top cap
      pil.fillRect(p.x - 18, p.y - 42, 36, 8);
      pil.fillStyle(0x1e293b, 1); // bottom trim
      pil.fillRect(p.x - 16, p.y + 31, 32, 6);
    });

    // Crimson banners draped on left/right walls
    const wallBanners = [
      { x: 30, y: 300 }, { x: 970, y: 300 }
    ];
    wallBanners.forEach(b => {
      const ban = this.add.graphics();
      ban.fillStyle(0x7f1d1d, 0.95); // Deep crimson
      ban.fillRect(b.x - 10, b.y - 50, 20, 100);
      // Gold trim details
      ban.fillStyle(0xeab308, 0.85);
      ban.fillRect(b.x - 10, b.y + 46, 20, 4);
      ban.fillRect(b.x - 2, b.y - 50, 4, 100);
    });

    // Floating Dust Particles in light shafts
    this.add.particles(0, 0, 'spark-texture', {
      x: { min: 50, max: 950 },
      y: { min: 50, max: 750 },
      lifespan: { min: 4000, max: 8000 },
      speedX: { min: -5, max: 5 },
      speedY: { min: -5, max: 5 },
      scale: { start: 0.1, end: 0.6 },
      alpha: { start: 0, end: 0.25, steps: 10 },
      tint: 0xd1d5db, // pale dust
      frequency: 300,
      blendMode: 'ADD'
    });

    // Floating Interaction Prompt Text layer (hidden by default)
    this.interactionPromptText = this.add.text(500, 400, "", {
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: '13px',
      color: '#ffffff',
      fontStyle: 'bold',
      backgroundColor: 'rgba(0,0,0,0.65)',
      padding: { x: 12, y: 8 },
      align: 'center'
    }).setOrigin(0.5);
    this.interactionPromptText.setVisible(false);
    this.interactionPromptText.setDepth(10000);

    // Overwrite the VFXManager createDamageText prototype to intercept dummy attacks!
    this.vfxManager.createDamageText = (x: number, y: number, amount: number, isCrit: boolean) => {
      if (this.dummyHealth) {
        this.dummyHealth.recordHit(amount, isCrit);
      }
      const originalCreateDamageText = VFXManager.prototype.createDamageText;
      originalCreateDamageText.call(this.vfxManager, x, y, amount, isCrit);
    };
  }

  private generateShopStock(): void {
    // 1. Filter permanent upgrades for standard category selections
    const isStatUpgrade = (up: UpgradeDefinition) => {
      // Exclude legendaries, mythicals, characters, companions, etc.
      if (up.category !== 'offensive' && up.category !== 'defensive' && up.category !== 'utility') {
        return false;
      }
      
      // Ensure it is a standard stat-modifying upgrade (has stat, modType, value)
      return up.stat !== undefined && up.modType !== undefined && up.value !== undefined;
    };

    const weaponUpgradeIds = [
      'damage_1', 'damage_2', 'damage_3',
      'atk_speed_1', 'atk_speed_2', 'atk_speed_3',
      'reach_1', 'reach_2',
      'crit_chance_1', 'crit_chance_2', 'crit_chance_3',
      'crit_damage_1', 'crit_damage_2'
    ];

    const defenseUpgradeIds = [
      'max_hp_1', 'max_hp_2',
      'armor_1', 'armor_2',
      'dodge_cooldown_1', 'dodge_cooldown_2',
      'wave_heal_1'
    ];

    const utilityUpgradeIds = [
      'speed_1', 'speed_2',
      'magnet_1', 'magnet_2',
      'gold_gain_1',
      'xp_gain_1',
      'luck_1', 'luck_2'
    ];

    const getOwnedCount = (id: string) => this.chosenUpgradesList.filter(u => u.id === id).length;
    const getMaxTier = (up: UpgradeDefinition) => up.maxTier !== undefined ? up.maxTier : 5;

    // Build pools of valid candidate upgrades
    const weaponPool = ALL_UPGRADES.filter(isStatUpgrade).filter(up => weaponUpgradeIds.includes(up.id) && getOwnedCount(up.id) < getMaxTier(up));
    const defensePool = ALL_UPGRADES.filter(isStatUpgrade).filter(up => defenseUpgradeIds.includes(up.id) && getOwnedCount(up.id) < getMaxTier(up));
    const utilityPool = ALL_UPGRADES.filter(isStatUpgrade).filter(up => utilityUpgradeIds.includes(up.id) && getOwnedCount(up.id) < getMaxTier(up));

    // Generate Standard Categories Stock
    const pickRandomUnique = (pool: UpgradeDefinition[], count: number) => {
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      return shuffled.slice(0, count).map(up => {
        const currentTier = getOwnedCount(up.id);
        const maxTier = getMaxTier(up);
        const price = this.calculateUpgradePrice(up.rarity, currentTier);
        return { upgrade: up, price, currentTier, maxTier };
      });
    };

    this.shopStock.weapon = pickRandomUnique(weaponPool, 4);
    this.shopStock.defense = pickRandomUnique(defensePool, 3);
    this.shopStock.utility = pickRandomUnique(utilityPool, 3);
    this.shopStock.relics = [];

    // --- LEGENDARY RELICS (Wave 10+) ---
    if (this.waveNumber >= 10) {
      const legendaryPool = ALL_UPGRADES.filter(up => up.category === 'legendary' && getOwnedCount(up.id) === 0 && !this.excludedUpgrades.has(up.id));
      if (legendaryPool.length > 0) {
        const picked = legendaryPool[Phaser.Math.Between(0, legendaryPool.length - 1)];
        this.shopStock.relics.push({
          upgrade: picked,
          price: 700,
          currentTier: 0,
          maxTier: 1
        });
      }
    }

    // --- MYTHICAL RELICS (Wave 20+, 50% chance) ---
    if (this.waveNumber >= 20 && Math.random() < 0.50) {
      const mythicalPool = ALL_UPGRADES.filter(up => up.category === 'mythical' && getOwnedCount(up.id) === 0 && !this.excludedUpgrades.has(up.id));
      if (mythicalPool.length > 0) {
        const picked = mythicalPool[Phaser.Math.Between(0, mythicalPool.length - 1)];
        this.shopStock.relics.push({
          upgrade: picked,
          price: 1500,
          currentTier: 0,
          maxTier: 1
        });
      }
    }
  }

  private getMagnusDialogue(): string {
    const hasMythical = this.chosenUpgradesList.some(up => up.category === 'mythical');
    const wave = this.waveNumber;
    
    if (hasMythical) {
      return "Hmph... You wield an astral mythical relic. Let's see if your frail body can channel its raw energy without combusting.";
    }
    if (wave >= 20) {
      return "You've survived the colossus and the worst horrors of the arena. Don't falter now, gladiator. Spend your spoils on proper steel.";
    }
    if (wave >= 10) {
      return "Back alive after the Champion Beast? Hmph. Don't let your helmet get too tight. Only real steel and robust bone survive from here on.";
    }
    
    const dialogues = [
      "Hah... Back alive again, gladiator?",
      "Spend wisely. The arena never gets easier, and your skin is too soft.",
      "Quickly now. My forge is hot, and your blade looks extremely dull.",
      "Surviving takes gold. Enhancing your anatomy is my specialty. What's your pleasure?"
    ];
    return dialogues[Phaser.Math.Between(0, dialogues.length - 1)];
  }

  private bindWindowActions(): void {
    // Clear inherited gameplay-only window bindings
    (window as any).postWaveContinue = null;
    (window as any).postWaveVisitMerchant = null;
    (window as any).leaveMerchantAndStartWave = null;

    // Leave merchant and close overlay back to Outpost walkaround!
    (window as any).leaveMerchantShop = () => {
      const merchantOverlay = document.getElementById('bb-merchant-overlay');
      if (merchantOverlay) merchantOverlay.style.display = 'none';
      this.isShopOpen = false;
      this.isPaused = false;
      this.physics.resume();
    };

    // Leave merchant and start the next wave directly!
    (window as any).leaveMerchantAndStartWave = () => {
      const merchantOverlay = document.getElementById('bb-merchant-overlay');
      if (merchantOverlay) merchantOverlay.style.display = 'none';
      this.isShopOpen = false;
      this.enterArenaGate();
    };

    // Tab switching onclick
    (window as any).setShopTab = (tab: 'weapon' | 'defense' | 'utility') => {
      this.activeShopTab = tab;
      this.renderBlacksmithUI();
    };

    // Buy standard upgrade
    (window as any).buyMerchantUpgrade = (tab: 'weapon' | 'defense' | 'utility' | 'relics', index: number) => {
      const list = this.shopStock[tab];
      if (!list || !list[index]) return;

      const item = list[index];
      if (this.collectedGold >= item.price && item.currentTier < item.maxTier) {
        // Spend gold
        this.collectedGold -= item.price;
        
        // Apply direct upgrade
        this.applyDirectUpgrade(item.upgrade);
        
        // Play buying sound
        AudioManager.getInstance().playSFX('coin');
        this.vfxManager.spawnSparks(this.player.x, this.player.y, 0xffcc00, 10);
        
        // Re-generate or update this item tier count in our stock tracker
        item.currentTier = this.chosenUpgradesList.filter(u => u.id === item.upgrade.id).length;
        item.price = this.calculateUpgradePrice(item.upgrade.rarity, item.currentTier);
        if (tab === 'relics') {
          // Relics are bought only once, so remove it!
          list.splice(index, 1);
        }

        // Re-render
        this.renderBlacksmithUI();
        this.updateHUDValues();
      } else {
        AudioManager.getInstance().playSFX('hurt');
      }
    };

    // Refresh stock action
    (window as any).refreshShopStock = () => {
      if (this.collectedGold >= this.refreshCost) {
        this.collectedGold -= this.refreshCost;
        this.refreshCount++;
        
        // Progression cost step: 25 -> 40 -> 60 -> 90 -> 120 -> 160...
        const costSteps = [25, 40, 60, 90, 120, 160, 210, 270, 340, 420];
        this.refreshCost = costSteps[this.refreshCount] || (120 + this.refreshCount * 30);
        
        // Re-generate
        this.generateShopStock();
        
        // Play SFX
        AudioManager.getInstance().playSFX('coin');
        
        // Re-render
        this.renderBlacksmithUI();
        this.updateHUDValues();
      } else {
        AudioManager.getInstance().playSFX('hurt');
      }
    };
  }

  private openBlacksmithShop(): void {
    this.isShopOpen = true;
    this.isPaused = true;
    this.physics.pause();
    
    const merchantOverlay = document.getElementById('bb-merchant-overlay');
    if (merchantOverlay) {
      merchantOverlay.style.display = 'flex';
      merchantOverlay.style.pointerEvents = 'auto';
    }

    // Hide mobile interact button while shop is open
    const interactBtnContainer = document.getElementById('bb-mobile-interact-container');
    if (interactBtnContainer) {
      interactBtnContainer.style.opacity = '0';
      interactBtnContainer.style.pointerEvents = 'none';
      interactBtnContainer.style.transform = 'scale(0.85)';
    }

    this.renderBlacksmithUI();
  }

  private renderBlacksmithUI(): void {
    // Update gold indicator in shop overlay
    const goldDisplayValue = document.getElementById('bb-merchant-gold-value');
    if (goldDisplayValue) {
      goldDisplayValue.textContent = `${this.collectedGold} Gold`;
    }

    const container = document.getElementById('bb-merchant-items-container');
    if (!container) return;

    // Custom build of Blacksmith Shop UI with tabs and refresh button
    let htmlContent = `
      <div style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
        <!-- Dialogue & Refresh Row -->
        <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(18,20,38,0.5); padding: 12px 16px; border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;">
          <div style="color: #cbd5e1; font-family: 'Space Grotesk', sans-serif; font-size: 13px; font-style: italic; text-align: left; max-width: 60%;">
            "${this.getMagnusDialogue()}"
          </div>
          
          <button onclick="window.refreshShopStock()" ${this.collectedGold < this.refreshCost ? 'disabled' : ''} style="
            background: ${this.collectedGold >= this.refreshCost ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255,255,255,0.02)'};
            border: 1px solid ${this.collectedGold >= this.refreshCost ? '#eab308' : 'rgba(255,255,255,0.1)'};
            color: ${this.collectedGold >= this.refreshCost ? '#eab308' : '#71717a'};
            font-family: 'Space Grotesk', sans-serif;
            font-size: 11px;
            font-weight: 700;
            padding: 8px 16px;
            border-radius: 6px;
            cursor: ${this.collectedGold >= this.refreshCost ? 'pointer' : 'not-allowed'};
            transition: all 0.2s;
          ">
            🔄 Refresh Stock (${this.refreshCost} Gold)
          </button>
        </div>

        <!-- Custom Category Tabs -->
        <div style="display: flex; gap: 8px; border-bottom: 2px solid rgba(255,255,255,0.08); padding-bottom: 8px;">
          <button onclick="window.setShopTab('weapon')" style="
            flex: 1; padding: 10px; background: ${this.activeShopTab === 'weapon' ? 'rgba(234, 179, 8, 0.1)' : 'transparent'};
            border: none; border-bottom: 3px solid ${this.activeShopTab === 'weapon' ? '#eab308' : 'transparent'};
            color: ${this.activeShopTab === 'weapon' ? '#ffffff' : '#a1a1aa'};
            font-family: 'Space Grotesk', sans-serif; font-weight: 800; font-size: 12px; cursor: pointer; text-transform: uppercase; letter-spacing: 1px;
          ">⚔️ Weapon Stats</button>
          
          <button onclick="window.setShopTab('defense')" style="
            flex: 1; padding: 10px; background: ${this.activeShopTab === 'defense' ? 'rgba(234, 179, 8, 0.1)' : 'transparent'};
            border: none; border-bottom: 3px solid ${this.activeShopTab === 'defense' ? '#eab308' : 'transparent'};
            color: ${this.activeShopTab === 'defense' ? '#ffffff' : '#a1a1aa'};
            font-family: 'Space Grotesk', sans-serif; font-weight: 800; font-size: 12px; cursor: pointer; text-transform: uppercase; letter-spacing: 1px;
          ">🛡️ Defense Shell</button>
          
          <button onclick="window.setShopTab('utility')" style="
            flex: 1; padding: 10px; background: ${this.activeShopTab === 'utility' ? 'rgba(234, 179, 8, 0.1)' : 'transparent'};
            border: none; border-bottom: 3px solid ${this.activeShopTab === 'utility' ? '#eab308' : 'transparent'};
            color: ${this.activeShopTab === 'utility' ? '#ffffff' : '#a1a1aa'};
            font-family: 'Space Grotesk', sans-serif; font-weight: 800; font-size: 12px; cursor: pointer; text-transform: uppercase; letter-spacing: 1px;
          ">⚡ Utility Metrics</button>
        </div>

        <!-- Selected Tab Items Grid -->
        <div style="display: flex; gap: 12px; flex-wrap: wrap; justify-content: center; width: 100%;">
    `;

    const activeItemsList = this.shopStock[this.activeShopTab];
    if (activeItemsList.length === 0) {
      htmlContent += `
        <div style="color: #64748b; font-family: 'Space Grotesk', sans-serif; font-size: 13px; text-align: center; width: 100%; padding: 24px 0;">
          Category fully maxed out! Magnus has no further improvements here.
        </div>
      `;
    } else {
      activeItemsList.forEach((item, index) => {
        const up = item.upgrade;
        const rarityConfig = RARITY_CONFIGS[up.rarity];
        const canAfford = this.collectedGold >= item.price;
        
        // Build tier boxes
        let tierHtml = '';
        for (let i = 1; i <= item.maxTier; i++) {
          const color = i <= item.currentTier ? rarityConfig.color : 'rgba(255,255,255,0.1)';
          tierHtml += `<div style="width: 14px; height: 6px; background: ${color}; border-radius: 1px; margin: 0 1px;"></div>`;
        }

        htmlContent += `
          <div style="
            flex: 1; min-width: 180px; max-width: 200px; background: rgba(15, 17, 30, 0.85);
            border: 1px solid ${item.currentTier > 0 ? rarityConfig.color : 'rgba(255,255,255,0.06)'};
            border-radius: 8px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; min-height: 210px;
            box-shadow: 0 4px 10px rgba(0,0,0,0.25);
          ">
            <div>
              <span style="font-family: 'Space Grotesk', sans-serif; font-size: 8px; font-weight: 800; color: ${rarityConfig.color}; text-transform: uppercase; display: block; margin-bottom: 2px;">
                ${rarityConfig.name}
              </span>
              <h4 style="font-family: 'Fraunces', serif; font-size: 13px; font-weight: 700; color: #ffffff; margin: 0 0 4px 0;">
                ${up.name}
              </h4>
              <p style="font-size: 10.5px; color: #94a3b8; line-height: 1.35; margin: 0 0 8px 0; min-height: 48px;">
                ${up.description}
              </p>
            </div>

            <div>
              <!-- Tier count block -->
              <div style="margin-bottom: 8px;">
                <div style="font-size: 8px; color: #64748b; font-family: 'Space Grotesk', sans-serif; margin-bottom: 3px; text-transform: uppercase;">
                  Tier ${item.currentTier} / ${item.maxTier}
                </div>
                <div style="display: flex; justify-content: center;">
                  ${tierHtml}
                </div>
              </div>

              <button onclick="window.buyMerchantUpgrade('${this.activeShopTab}', ${index})" ${!canAfford ? 'disabled' : ''} style="
                width: 100%; padding: 6px 0; font-family: 'Space Grotesk', sans-serif; font-weight: 800; font-size: 11px;
                background: ${canAfford ? '#eab308' : 'rgba(255,255,255,0.04)'};
                color: ${canAfford ? '#000000' : 'rgba(255,255,255,0.2)'};
                border: none; border-radius: 4px; cursor: ${canAfford ? 'pointer' : 'not-allowed'};
                text-transform: uppercase; transition: all 0.2s;
              ">
                ${item.currentTier >= item.maxTier ? 'MAXED' : `BUY: ${item.price} G`}
              </button>
            </div>
          </div>
        `;
      });
    }

    htmlContent += `</div>`; // Close standard items grid

    // --- RELICS ROW (Featured Relics: Legendary/Mythical) ---
    if (this.shopStock.relics.length > 0) {
      htmlContent += `
        <!-- Special Relics Section -->
        <div style="margin-top: 12px; background: rgba(234, 179, 8, 0.04); border: 1px solid rgba(234, 179, 8, 0.15); border-radius: 8px; padding: 12px;">
          <div style="font-family: 'Space Grotesk', sans-serif; font-size: 9px; font-weight: 800; color: #eab308; letter-spacing: 1.5px; text-transform: uppercase; margin-bottom: 8px; text-align: left;">
            ✨ Featured Ancient Relics (Limited Stock)
          </div>
          <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; width: 100%;">
      `;

      this.shopStock.relics.forEach((item, index) => {
        const up = item.upgrade;
        const rarityColor = up.category === 'mythical' ? '#c084fc' : '#f43f5e';
        const rarityName = up.category === 'mythical' ? 'MYTHICAL RELIC' : 'LEGENDARY RELIC';
        const canAfford = this.collectedGold >= item.price;

        htmlContent += `
          <div style="
            flex: 1; min-width: 250px; max-width: 320px; background: rgba(12, 10, 18, 0.95);
            border: 1.5px solid ${rarityColor}; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; justify-content: space-between; min-height: 120px;
            box-shadow: 0 0 15px rgba(234, 179, 8, 0.1);
          ">
            <div>
              <span style="font-family: 'Space Grotesk', sans-serif; font-size: 8px; font-weight: 800; color: ${rarityColor}; letter-spacing: 1px; text-transform: uppercase; display: block; margin-bottom: 2px;">
                ${rarityName}
              </span>
              <h4 style="font-family: 'Fraunces', serif; font-size: 13px; font-weight: 700; color: #ffffff; margin: 0 0 4px 0;">
                ${up.name}
              </h4>
              <p style="font-size: 10px; color: #cbd5e1; line-height: 1.35; margin: 0 0 8px 0;">
                ${up.description}
              </p>
            </div>

            <button onclick="window.buyMerchantUpgrade('relics', ${index})" ${!canAfford ? 'disabled' : ''} style="
              width: 100%; padding: 6px 0; font-family: 'Space Grotesk', sans-serif; font-weight: 800; font-size: 11px;
              background: ${canAfford ? rarityColor : 'rgba(255,255,255,0.03)'};
              color: ${canAfford ? '#ffffff' : 'rgba(255,255,255,0.15)'};
              border: none; border-radius: 4px; cursor: ${canAfford ? 'pointer' : 'not-allowed'};
              text-transform: uppercase; transition: all 0.2s;
              box-shadow: ${canAfford ? `0 4px 12px ${rarityColor}33` : 'none'};
            ">
              Acquire Relic: ${item.price} Gold
            </button>
          </div>
        `;
      });

      htmlContent += `</div></div>`; // Close Relics grid and section container
    }

    htmlContent += `</div>`; // Close overall container

    container.innerHTML = htmlContent;
  }

  protected override updateHUDValues(): void {
    super.updateHUDValues();
    
    // 2. Hide core wave indicators or HUD elements that aren't relevant in the hub
    const hudWave = document.getElementById('bb-hud-wave');
    if (hudWave) hudWave.textContent = `OUTPOST (WAVE ${this.waveNumber})`;
    const hudEnemies = document.getElementById('bb-hud-enemies');
    if (hudEnemies) hudEnemies.textContent = `PEACEFUL HUB`;
  }

  public override update(time: number, delta: number): void {
    if (this.isPaused || !this.player || !this.player.active) return;

    // 1. Run core GameScene physics updates (handles slashes, offhand sword, orbital bullets, etc.!)
    super.update(time, delta);

    // 2. Approach-and-interaction logic checks
    this.handleOutpostInteractions(time);

    // 3. Training Dummy display stats auto-reset & updates
    this.updateTrainingDummy(time);

    // 4. Smooth forge/fountain pulsing light animations
    this.animateAtmosphericLights(time);
  }

  private handleOutpostInteractions(time: number): void {
    const distToMagnus = Phaser.Math.Distance.Between(this.player.x, this.player.y, 230, 245);
    const distToFountain = Phaser.Math.Distance.Between(this.player.x, this.player.y, 800, 220);
    const distToGate = Phaser.Math.Distance.Between(this.player.x, this.player.y, 500, 140);

    let isNearSomething = false;
    let interactionPrompt = "";
    let interactionAction: (() => void) | null = null;
    let label = "";
    let subLabel = "";

    if (distToMagnus < 65) {
      isNearSomething = true;
      interactionPrompt = "Press [E] to Talk to Magnus";
      label = "TALK";
      subLabel = "Magnus";
      interactionAction = () => {
        this.openBlacksmithShop();
      };
    } else if (distToFountain < 65) {
      isNearSomething = true;
      const needsHeal = this.playerHealth.getHp() < this.playerHealth.getMaxHp();
      interactionPrompt = needsHeal 
        ? "Press [E] to Restore Health (20 Gold)" 
        : "Fountain (Already at Full HP)";
      label = "HEAL";
      subLabel = needsHeal ? "Fountain (-20g)" : "Fountain (Full HP)";
      interactionAction = () => {
        if (!needsHeal) {
          this.vfxManager.createFloatingXPText(this.player.x, this.player.y - 40, "Already at Full HP!", "#64748b");
          return;
        }
        if (this.collectedGold >= 20) {
          this.collectedGold -= 20;
          this.playerHealth.heal(this.playerHealth.getMaxHp());
          AudioManager.getInstance().playSFX('powerup');
          this.vfxManager.spawnSparks(this.player.x, this.player.y, 0x06b6d4, 12);
          this.vfxManager.createFloatingXPText(this.player.x, this.player.y - 40, "HEALTH RESTORED", "#06b6d4");
          this.updateHUDValues();
        } else {
          AudioManager.getInstance().playSFX('hurt');
          this.vfxManager.createFloatingXPText(this.player.x, this.player.y - 40, "Requires 20 Gold!", "#ef4444");
        }
      };
    } else if (distToGate < 65) {
      isNearSomething = true;
      interactionPrompt = `Press [E] to Enter Arena (Start Wave ${this.waveNumber + 1})`;
      label = "ENTER";
      subLabel = `Arena (Wave ${this.waveNumber + 1})`;
      interactionAction = () => {
        this.enterArenaGate();
      };
    }

    const interactBtnContainer = document.getElementById('bb-mobile-interact-container');
    const interactBtn = document.getElementById('bb-mobile-btn-interact');
    const interactLabel = document.getElementById('bb-mobile-interact-label');

    if (isNearSomething && interactionAction) {
      this.interactionPromptText.setVisible(true);
      this.interactionPromptText.setText(interactionPrompt);
      this.interactionPromptText.setPosition(this.player.x, this.player.y - 50);

      // Trigger E interaction key exactly on down press (once)
      if (Phaser.Input.Keyboard.JustDown(this.keyE)) {
        interactionAction();
      }

      this.currentInteractionAction = interactionAction;

      // Update mobile UI
      if (interactBtnContainer) {
        interactBtnContainer.style.opacity = '1';
        interactBtnContainer.style.pointerEvents = 'auto';
        interactBtnContainer.style.transform = 'scale(1)';
      }
      if (interactBtn) {
        const span = interactBtn.querySelector('span');
        if (span) span.textContent = label;
      }
      if (interactLabel) {
        interactLabel.textContent = subLabel;
      }
    } else {
      this.interactionPromptText.setVisible(false);
      this.currentInteractionAction = null;

      // Hide mobile UI
      if (interactBtnContainer) {
        interactBtnContainer.style.opacity = '0';
        interactBtnContainer.style.pointerEvents = 'none';
        interactBtnContainer.style.transform = 'scale(0.85)';
      }
    }
  }

  private enterArenaGate(): void {
    // Prevent double execution
    this.isPaused = true;
    this.physics.pause();
    this.interactionPromptText.setVisible(false);

    // Hide mobile interact button
    const interactBtnContainer = document.getElementById('bb-mobile-interact-container');
    if (interactBtnContainer) {
      interactBtnContainer.style.opacity = '0';
      interactBtnContainer.style.pointerEvents = 'none';
      interactBtnContainer.style.transform = 'scale(0.85)';
    }

    // Play gate transition audio
    AudioManager.getInstance().playSFX('wave');

    // Fade camera and transition back to GameScene to resume wave X + 1
    this.cameras.main.fadeOut(1000, 0, 0, 0);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      const data = {
        gladiatorIndex: this.gladiatorIndex,
        weaponClass: this.selectedWeaponId,
        wave: this.waveNumber + 1, // increment wave!
        gold: this.collectedGold,
        hp: this.playerHealth.getHp(),
        maxHp: this.playerHealth.getMaxHp(),
        score: this.score,
        playerLevel: this.playerLevel,
        playerXP: this.playerXP,
        playerXPNeeded: this.playerXPNeeded,
        chosenUpgradesList: [...this.chosenUpgradesList],
        excludedUpgrades: Array.from(this.excludedUpgrades)
      };

      SceneManager.getInstance().transitionToScene('GameScene', data);
    });
  }

  private updateTrainingDummy(time: number): void {
    if (!this.dummyHealth) return;

    const lastHitTime = this.dummyHealth.lastHitTime;
    const hitCount = this.dummyHealth.hitCount;

    if (hitCount === 0) {
      this.dummyStatsText.setText("Practice Target Dummy\nLast Hit: -- | Avg: --\nDPS: -- | Hits: 0");
      return;
    }

    const elapsed = (lastHitTime - this.dummyHealth.firstHitTime) / 1000;
    const dps = Math.round(this.dummyHealth.totalDamage / Math.max(0.1, elapsed));
    const avgDamage = Math.round(this.dummyHealth.totalDamage / hitCount);

    // If no attacks hit the dummy in the last 5 seconds, reset stats
    if (time - lastHitTime > 5000) {
      this.dummyHealth.resetMetrics();
      this.vfxManager.createFloatingXPText(this.dummyEntity.x, this.dummyEntity.y - 40, "METRICS RESET", "#94a3b8");
    } else {
      this.dummyStatsText.setText(
        `Practice Target Dummy\n` +
        `Last Hit: ${this.dummyHealth.lastHit} ${this.dummyHealth.critCount > 0 ? '🔥' : ''}\n` +
        `Avg DMG: ${avgDamage} | Hits: ${hitCount}\n` +
        `DPS: ${dps} (Auto-resets in 5s)`
      );
    }
  }

  private animateAtmosphericLights(time: number): void {
    if (this.forgeLight) {
      // Flickering fire effect
      const flicker = 0.08 + Math.sin(time * 0.015) * 0.02 + Math.cos(time * 0.007) * 0.01;
      this.forgeLight.setAlpha(Phaser.Math.Clamp(flicker, 0.05, 0.15));
      this.forgeLight.setRadius(160 + Math.sin(time * 0.01) * 3);
    }

    if (this.fountainLight) {
      // Flowing water glow animation
      const flow = 0.08 + Math.sin(time * 0.004) * 0.01;
      this.fountainLight.setAlpha(flow);
      this.fountainLight.setRadius(140 + Math.cos(time * 0.003) * 2);
    }
  }

  protected override checkWaveProgress(): void {
    // No-op in the peaceful merchant hub outpost scene
  }

  public override shutdown(): void {
    super.shutdown();
    this.logger.info("Cleaning up Outpost Scene elements...");
    if (this.forgeLight) this.forgeLight.destroy();
    if (this.fountainLight) this.fountainLight.destroy();
    if (this.interactionPromptText) this.interactionPromptText.destroy();
    if (this.dummyStatsText) this.dummyStatsText.destroy();
  }
}
