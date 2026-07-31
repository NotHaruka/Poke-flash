import * as THREE from 'three';
import { PlayerController } from './PlayerController';
import { GameAudioEngine } from '../games/core/GameAudioEngine';
import { EnemyAI, EnemyObject, BulletObject } from './EnemyAI';
import { StageGenerator, ChestObject, TeleporterObject } from './StageGenerator';
import { ParticleSystem } from './ParticleSystem';
import { STAGES } from './Stages';
import { CHARACTERS } from './Characters';
import { rollLoot, getItemById, ITEMS } from './ItemSystem';
import { RunStats, PlayerCharacter, Item } from '../types';

class GameClock {
  private startTime: number;
  private oldTime: number;
  private running: boolean;

  constructor() {
    this.startTime = 0;
    this.oldTime = 0;
    this.running = false;
    this.start();
  }

  start() {
    this.startTime = (typeof performance !== 'undefined' ? performance : Date).now();
    this.oldTime = this.startTime;
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  getDelta(): number {
    if (!this.running) return 0;
    const newTime = (typeof performance !== 'undefined' ? performance : Date).now();
    const diff = (newTime - this.oldTime) / 1000;
    this.oldTime = newTime;
    return diff;
  }
}

export class GameEngine {
  // Canvas & ThreeJS
  private container: HTMLDivElement;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private clock: GameClock;
  private animationFrameId: number | null = null;

  // Game Systems
  public player: PlayerController;
  public enemyAI: EnemyAI;
  public stageGenerator: StageGenerator;
  public particleSystem: ParticleSystem;

  // Lighting
  private dirLight: THREE.DirectionalLight | null = null;
  private hemiLight: THREE.HemisphereLight | null = null;
  private resizeObserver: ResizeObserver | null = null;

  // Game State
  public runStats: RunStats;
  public isGameOver = false;
  public isVictory = false;
  private isPaused = false;
  private selectedCharacter: PlayerCharacter;

  // Wave Spawning Trackers
  private spawnTimer = 0;
  private spawnInterval = 10.0; // spawn wave every 10s
  private maxActiveEnemies = 30;

  // Teleporter Boss Trackers
  public activeBoss: EnemyObject | null = null;
  public teleporterTimerText = '';

  // Interactivity
  public nearestInteractive: { type: 'chest' | 'teleporter' | 'portal'; id: string; cost?: number; label: string } | null = null;

  // React State Callback (to sync with the HUD)
  private onStateUpdate: (engine: GameEngine) => void;

  // Mouse camera & firing
  private isPointerLocked = false;
  private isFiring = false;

  constructor(
    container: HTMLDivElement,
    selectedCharId: string,
    onStateUpdate: (engine: GameEngine) => void
  ) {
    this.container = container;
    this.onStateUpdate = onStateUpdate;
    this.clock = new GameClock();

    // Find character
    const char = CHARACTERS.find((c: PlayerCharacter) => c.id === selectedCharId) || CHARACTERS[0];
    this.selectedCharacter = char;

    // Initialize run stats
    this.runStats = {
      timeSurvived: 0,
      difficultyMultiplier: 1.0,
      stageIndex: 0, // STAGES[0]
      gold: 15, // start with some gold to help them out
      xp: 0,
      level: 1,
      items: {},
      kills: 0,
      damageDealt: 0,
      chestsOpened: 0
    };

    // 1. Setup Three.js environment
    this.initThree();

    // 2. Initialize Game Systems
    this.particleSystem = new ParticleSystem(this.scene);
    this.stageGenerator = new StageGenerator(this.scene);
    this.enemyAI = new EnemyAI(this.scene, this.particleSystem);
    this.player = new PlayerController(this.scene, this.particleSystem, this.selectedCharacter);

    // Bind inputs for mouse dragging camera
    this.setupMouseCameraControls();

    // 3. Load First Stage
    this.loadStage(0);

    // 4. Start Game Loop
    this.startLoop();

    // Add general keydown listener for interactions
    window.addEventListener('keydown', this.handleInteractionKeyPress);
  }

  private initThree() {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.scene = new THREE.Scene();

    // WebGL Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Camera (Third person perspective)
    this.camera = new THREE.PerspectiveCamera(60, width / height, 0.3, 300);

    // Setup basic universal lights
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
    this.dirLight.position.set(20, 40, 20);
    this.dirLight.castShadow = true;
    this.dirLight.shadow.mapSize.width = 1024;
    this.dirLight.shadow.mapSize.height = 1024;
    this.dirLight.shadow.camera.near = 0.5;
    this.dirLight.shadow.camera.far = 150;
    const d = 40;
    this.dirLight.shadow.camera.left = -d;
    this.dirLight.shadow.camera.right = d;
    this.dirLight.shadow.camera.top = d;
    this.dirLight.shadow.camera.bottom = -d;
    this.scene.add(this.dirLight);

    // Add a dedicated AmbientLight for rich soft color fill and high visibility
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // Handle Window Resize
    window.addEventListener('resize', this.handleResize);

    // Track dynamic element resizes to perfectly fit layout shifts without clipping
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.container);
  }

  private loadStage(stageIndex: number) {
    this.runStats.stageIndex = stageIndex;
    const stage = STAGES[stageIndex % STAGES.length];

    // Style scene fog and skies (decreased density to 0.007 for much further vision range)
    this.scene.fog = new THREE.FogExp2(stage.fogColor, 0.007);
    this.renderer.setClearColor(stage.fogColor);

    // Update light colors to match biome mood with beautiful vivid adjustments
    if (this.hemiLight) {
      this.hemiLight.color.setHex(stage.skyColor);
      this.hemiLight.groundColor.setHex(stage.ambientLightColor);
      this.hemiLight.intensity = 1.5;
    }
    if (this.dirLight) {
      this.dirLight.color.setHex(stage.skyColor);
      this.dirLight.intensity = 2.0;
    }

    // Generate Stage elements
    const result = this.stageGenerator.generateStage(stage, this.runStats.difficultyMultiplier);

    // Clear enemies and projectiles
    this.enemyAI.clearAll();
    this.activeBoss = null;

    // Teleport player back to start (0, 1.5, 0)
    this.player.group.position.set(0, 1.5, 0);

    // Sparkles on arrival
    this.particleSystem.createExplosion(this.player.group.position, 0x60a5fa, 20, 0.4);

    // Notify React layer
    this.onStateUpdate(this);
  }

  private startLoop() {
    this.clock.getDelta(); // reset clock
    const tick = () => {
      this.animationFrameId = requestAnimationFrame(tick);
      this.update();
    };
    this.animationFrameId = requestAnimationFrame(tick);
  }

  public pause() {
    this.isPaused = !this.isPaused;
  }

  private preventContextMenu = (e: Event) => {
    e.preventDefault();
  };

  private handleMouseUp = (e: MouseEvent) => {
    if (e.button === 0) {
      this.isFiring = false;
    }
  };

  // --- MOUSE CAMERA CONTROLS (FREE-LOOK + HOLD-TO-FIRE) ---
  private setupMouseCameraControls() {
    const el = this.renderer.domElement;

    // Prevent default browser context menu on right click globally
    window.addEventListener('contextmenu', this.preventContextMenu);

    // First click locks the pointer (standard FPS/TPS pattern).
    // Browsers require a real user gesture to grant pointer lock.
    el.addEventListener('click', () => {
      if (!this.isPointerLocked) {
        el.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === el;
      if (!this.isPointerLocked) {
        this.isFiring = false; // safety: stop firing if lock is lost (e.g. Esc)
      }
    });

    // Free mouse-look: rotates continuously once locked, no button needed
    document.addEventListener('mousemove', (e) => {
      if (!this.isPointerLocked || this.isPaused || this.isGameOver) return;
      this.player.handleMouseLook(e.movementX, e.movementY);
    });

    // Handle mouse button clicks for firing
    el.addEventListener('mousedown', (e) => {
      if (!this.isPointerLocked || this.isPaused || this.isGameOver) return;
      if (e.button === 0) {
        // Left click: start continuous primary fire
        this.isFiring = true;
      } else if (e.button === 2) {
        // Right click: fire heavy secondary skill instantly!
        e.preventDefault();
        const camDir = new THREE.Vector3();
        this.camera.getWorldDirection(camDir);
        this.player.triggerSecondary(camDir);
      }
    });

    window.addEventListener('mouseup', this.handleMouseUp);
  }

  // --- GAME UPDATE TICK ---
  private update() {
    if (this.isPaused || this.isGameOver || this.isVictory) return;

    const deltaTime = Math.min(this.clock.getDelta(), 0.1); // clamp to prevent clipping

    // 1. Difficulty Scaling Timer
    this.runStats.timeSurvived += deltaTime;
    // Multiplier increases by +0.5 every minute survived
    this.runStats.difficultyMultiplier = 1.0 + (this.runStats.timeSurvived / 120.0);

    // 2. Systems Update
    this.particleSystem.update(deltaTime);
    this.player.update(deltaTime, this.stageGenerator.getObstacles(), this.camera, this.enemyAI.getEnemies());

    // Continuous firing while left mouse button is held (gated by weapon cooldown in PlayerController)
    if (this.isFiring && !this.isPaused && !this.isGameOver) {
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      this.player.triggerPrimary(camDir);
    }

    this.enemyAI.update(
      deltaTime,
      this.player.group.position,
      this.stageGenerator.getObstacles(),
      (dmg) => {
        // Player taking hit callback
        this.player.takeDamage(dmg);
        this.onStateUpdate(this);
        
        // Trigger red full screen flash state on extreme damage or low health
        if (this.player.stats.hp <= 0) {
          this.triggerGameOver();
        }
      }
    );

    // Update Teleporter behaviors (dome charging logic)
    const tele = this.stageGenerator.getTeleporter();
    if (tele) {
      this.stageGenerator.updateTeleporterVisuals(deltaTime, this.player.group.position);
      this.updateTeleporterLogic(deltaTime, tele);
    }

    // 3. Spawning Loop: Spawn enemies incrementally
    this.updateEnemySpawning(deltaTime);

    // 4. Update Third Person Camera Coordinates
    this.updateCameraPosition();

    // 5. Collisions: Player bullets hitting enemies
    this.checkPlayerProjectilesCollisions();

    // 6. Find Nearby Interactive Chest / Obelisk
    this.checkInteractiveProximity();

    // 7. Sync with React HUD once per frame
    this.onStateUpdate(this);

    // 8. Render the 3D scene
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  private updateCameraPosition() {
    // Positioning behind player relative to cameraAngleX (yaw) and cameraAngleY (tilt/pitch)
    const distance = 9.5; // distance behind player
    const heightOffset = 2.4; // look slightly over player head

    const angleX = this.player.cameraAngleX;
    const angleY = this.player.cameraAngleY;

    // Calculate camera offset relative to player
    const xOffset = Math.sin(angleX) * Math.cos(angleY) * distance;
    const zOffset = Math.cos(angleX) * Math.cos(angleY) * distance;
    const yOffset = Math.sin(angleY) * distance + heightOffset;

    const targetCamPos = this.player.group.position.clone().add(new THREE.Vector3(xOffset, yOffset, zOffset));

    // Smoothly interpolate camera movement
    this.camera.position.lerp(targetCamPos, 0.22);

    // Point camera towards the player head center
    const lookTarget = this.player.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    this.camera.lookAt(lookTarget);
  }

  private updateEnemySpawning(deltaTime: number) {
    const tele = this.stageGenerator.getTeleporter();
    const isTeleActive = tele && tele.activated && !tele.charged;

    // Spawning frequency increases with difficulty and is doubled during teleporter event
    const modifiedSpawnInterval = this.spawnInterval / (this.runStats.difficultyMultiplier * (isTeleActive ? 2.5 : 1.0));
    
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= modifiedSpawnInterval) {
      this.spawnTimer = 0;

      const currentEnemyCount = this.enemyAI.getEnemies().length;
      if (currentEnemyCount < this.maxActiveEnemies) {
        // Spawn credits depends on difficulty multiplier
        const spawnCredits = Math.round(3 + this.runStats.difficultyMultiplier * 2.5);
        this.spawnWave(spawnCredits);
      }
    }
  }

  private spawnWave(credits: number) {
    let remainingCredits = credits;
    const playerPos = this.player.group.position;

    while (remainingCredits > 0) {
      // Pick random enemy archetype
      let type: 'melee' | 'ranged' | 'tank' = 'melee';
      let cost = 1;

      const roll = Math.random();
      if (roll < 0.15 && remainingCredits >= 4) {
        type = 'tank';
        cost = 4;
      } else if (roll < 0.5 && remainingCredits >= 2) {
        type = 'ranged';
        cost = 2;
      }

      remainingCredits -= cost;

      // Spawn at circular ring offset around player (between 25m and 45m out)
      const distance = 25 + Math.random() * 20;
      const angle = Math.random() * Math.PI * 2;
      const spawnX = playerPos.x + Math.cos(angle) * distance;
      const spawnZ = playerPos.z + Math.sin(angle) * distance;
      const spawnY = 0.5; // ground height

      const spawnPos = new THREE.Vector3(spawnX, spawnY, spawnZ);

      // Verify spawn position stays on the island stage
      if (spawnPos.length() < 95) {
        this.enemyAI.spawnEnemy(type, spawnPos, this.runStats.difficultyMultiplier);
        
        // Spawn portal visual indicator
        this.particleSystem.createExplosion(spawnPos, type === 'tank' ? 0x4b5563 : type === 'ranged' ? 0xb91c1c : 0x6b21a8, 8, 0.3);
      }
    }
  }

  private checkPlayerProjectilesCollisions() {
    const bullets = this.player.playerBullets;
    const enemies = this.enemyAI.getEnemies();

    // Iterate backwards so splicing a hit bullet never skips the next one
    // (forEach + splice was silently dropping ~every other simultaneous hit)
    for (let bIdx = bullets.length - 1; bIdx >= 0; bIdx--) {
      const b = bullets[bIdx];

      // 1. Double check bullet is active
      if (b.life >= b.maxLife) continue;

      // Check bullet intersection with every active enemy
      for (let eIdx = 0; eIdx < enemies.length; eIdx++) {
        const enemy = enemies[eIdx];
        if (enemy.stats.hp <= 0) continue;

        const enemyCenter = enemy.mesh.position.clone().add(new THREE.Vector3(0, enemy.height / 2, 0));
        const dist = b.mesh.position.distanceTo(enemyCenter);

        // Cylinder intersection check
        const horizontalDist = new THREE.Vector2(b.mesh.position.x - enemy.mesh.position.x, b.mesh.position.z - enemy.mesh.position.z).length();
        const verticalDist = Math.abs(b.mesh.position.y - (enemy.mesh.position.y + enemy.height / 2));

        if (horizontalDist <= b.radius + enemy.radius && verticalDist <= enemy.height / 2) {
          // HIT! Damage enemy
          enemy.stats.hp -= b.damage;
          this.runStats.damageDealt += b.damage;

          // Spark impact feedback
          this.particleSystem.createSparks(b.mesh.position, b.velocity.clone().normalize().negate(), enemy.isBoss ? 0x10b981 : 0xef4444, b.isCrit ? 8 : 4);

          // Apply PASSIVE ON-HIT EFFECTS
          this.applyPlayerOnHitPassives(b, enemy);

          // Remove projectile
          this.scene.remove(b.mesh);
          b.mesh.geometry.dispose();
          (b.mesh.material as THREE.Material).dispose();
          bullets.splice(bIdx, 1);

          // Enemy death check
          if (enemy.stats.hp <= 0) {
            this.handleEnemyKilled(enemy);
          }
          break;
        }
      }
    }
  }

  private applyPlayerOnHitPassives(bullet: BulletObject, enemy: EnemyObject) {
    const stats = this.player.stats;

    // 1. Leeching Seed (+1.5 HP heal per stack on hit)
    const seedCount = this.player.itemsInventory['seed'] || 0;
    if (seedCount > 0) {
      const healAmt = 1.5 * seedCount;
      this.player.heal(healAmt);
      this.particleSystem.createHealEffect(this.player.group.position, 2);
    }

    // 2. Harvester's Scythe (crit strikes heal 8 HP per stack)
    const scytheCount = this.player.itemsInventory['scythe'] || 0;
    if (scytheCount > 0 && bullet.isCrit) {
      const healAmt = 8 * scytheCount;
      this.player.heal(healAmt);
      this.particleSystem.createHealEffect(this.player.group.position, 4);
    }

    // 3. Ukulele (20% chance on hit to link chain lightning for 80% damage)
    const ukeCount = this.player.itemsInventory['ukulele'] || 0;
    if (ukeCount > 0 && Math.random() < 0.20) {
      // Find up to 3 (+2 per stack) nearby enemies
      const range = 20.0;
      const hitLimit = 3 + (ukeCount - 1) * 2;
      const nearby = this.enemyAI.getEnemies()
        .filter(other => other.id !== enemy.id && other.stats.hp > 0 && other.mesh.position.distanceTo(enemy.mesh.position) <= range)
        .slice(0, hitLimit);

      nearby.forEach(target => {
        const chainDamage = Math.round(this.player.stats.damage * 0.8);
        target.stats.hp -= chainDamage;
        this.runStats.damageDealt += chainDamage;

        // Draw lightning line particle
        this.particleSystem.createBulletTrail(
          enemy.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)),
          target.mesh.position.clone().add(new THREE.Vector3(0, 1, 0)),
          0x60a5fa,
          0.2
        );

        if (target.stats.hp <= 0) {
          this.handleEnemyKilled(target);
        }
      });
    }

    // 4. AtG Missile (10% chance on hit to fire seeker missile dealing 300% damage per stack)
    const missileCount = this.player.itemsInventory['missile'] || 0;
    if (missileCount > 0 && Math.random() < 0.10) {
      // Draw seeking missile line
      const launchSpot = this.player.group.position.clone().add(new THREE.Vector3(0, 2, 0));
      const targetSpot = enemy.mesh.position.clone().add(new THREE.Vector3(0, enemy.height / 2, 0));
      this.particleSystem.createBulletTrail(launchSpot, targetSpot, 0x3b82f6, 0.25);

      const missileDamage = Math.round(this.player.stats.damage * 3.0 * missileCount);
      enemy.stats.hp -= missileDamage;
      this.runStats.damageDealt += missileDamage;

      this.particleSystem.createExplosion(targetSpot, 0x3b82f6, 10, 0.4);

      if (enemy.stats.hp <= 0) {
        this.handleEnemyKilled(enemy);
      }
    }

    // 5. Brilliant Behemoth (explosive AoE, +60% dmg in 5m radius)
    const behCount = this.player.itemsInventory['behemoth'] || 0;
    if (behCount > 0) {
      const radius = 5.0 + (behCount - 1) * 1.5;
      const explodeDmg = Math.round(bullet.damage * 0.6);

      this.particleSystem.createExplosion(bullet.mesh.position, 0xd97706, 12, 0.5);
      this.particleSystem.createVisualRing(bullet.mesh.position, 0xd97706, radius, 0.3);

      this.enemyAI.getEnemies().forEach(other => {
        if (other.id === enemy.id || other.stats.hp <= 0) return;
        
        const d = other.mesh.position.distanceTo(bullet.mesh.position);
        if (d <= radius) {
          other.stats.hp -= explodeDmg;
          this.runStats.damageDealt += explodeDmg;

          if (other.stats.hp <= 0) {
            this.handleEnemyKilled(other);
          }
        }
      });
    }
  }

  private handleEnemyKilled(enemy: EnemyObject) {
    this.runStats.kills++;
    
    // Reward player gold & xp
    this.player.earnRewards(enemy.stats.xpValue, enemy.stats.goldValue);
    this.runStats.gold = this.player.gold;
    this.runStats.xp = this.player.xp;
    this.runStats.level = this.player.level;

    // Boss specifically drops a Titanic Knurl or high rare item
    if (enemy.isBoss) {
      this.activeBoss = null;
      // Spawn Boss Item drop as physical floating item at boss spot!
      const bossItem = getItemById('knurl') || ITEMS[ITEMS.length - 1];
      this.player.addItem(bossItem);
      this.runStats.items = this.player.itemsInventory;

      // Meta Unlock Milestone checked
      this.checkUnlocks('boss_kill', enemy.type);
    }

    this.checkUnlocks('kill_count', this.runStats.kills);
  }

  // --- TELEPORTER EVENT LOGIC ---

  private updateTeleporterLogic(deltaTime: number, tele: TeleporterObject) {
    if (!tele.activated) return;

    if (!tele.charged) {
      // 1. Charge progress bar: increases when player is within zone dome radius (26m)
      const dist = this.player.group.position.distanceTo(tele.position);
      const isInside = dist <= tele.zoneRadius;

      if (isInside) {
        const stage = STAGES[this.runStats.stageIndex];
        const chargeSpeed = 1.0 / stage.chargeTimeRequired; // e.g. 1 / 60 = 1.6% per sec
        tele.chargeProgress = Math.min(1.0, tele.chargeProgress + chargeSpeed * deltaTime);

        if (tele.chargeProgress >= 1.0) {
          tele.charged = true;
          this.particleSystem.createExplosion(tele.position, 0x10b981, 40, 0.8);
          this.particleSystem.createVisualRing(tele.position, 0x10b981, 26, 0.6);
        }
      }

      // Display timer HUD text
      const pct = Math.floor(tele.chargeProgress * 100);
      this.teleporterTimerText = `Teleporter Charge: ${pct}%${isInside ? ' (CHARGING)' : ' (STALLED)'}`;
    } else {
      // Charged! If boss is dead, portal is open
      if (!this.activeBoss) {
        this.teleporterTimerText = 'Teleporter Charged! Enter the exit portal to proceed.';
      } else {
        this.teleporterTimerText = 'Teleporter Charged! Defeat the Stage Boss to open portal.';
      }
    }
  }

  // Activate the teleporter, spawn Boss and lock zone
  private activateTeleporter(tele: TeleporterObject) {
    tele.activated = true;
    
    // Spawn Stage Boss!
    const bossX = tele.position.x + 12;
    const bossZ = tele.position.z + 12;
    const bossPos = new THREE.Vector3(bossX, 4, bossZ);

    const boss = this.enemyAI.spawnEnemy('boss', bossPos, this.runStats.difficultyMultiplier);
    this.activeBoss = boss;

    // Mega stomp visual rings
    this.particleSystem.createVisualRing(bossPos, 0x7c3aed, 15, 1.0);
    this.particleSystem.createExplosion(bossPos, 0x7c3aed, 40, 0.8);
  }

  // --- INTERACTION CHECKS ---

  private checkInteractiveProximity() {
    const playerPos = this.player.group.position;
    const range = 5.0; // interaction radius

    // Reset interactive
    this.nearestInteractive = null;

    // 1. Check exit portal first if charged & boss defeated
    const tele = this.stageGenerator.getTeleporter();
    if (tele && tele.charged && !this.activeBoss) {
      const portalPos = tele.position.clone().add(new THREE.Vector3(0, 4.5, 0));
      const dist = playerPos.distanceTo(portalPos);
      if (dist <= range + 1) {
        this.nearestInteractive = {
          type: 'portal',
          id: 'exit_portal',
          label: 'Enter Portal (Proceed to Next Stage)'
        };
        return;
      }
    }

    // 2. Check teleporter obelisk
    if (tele && !tele.activated) {
      const dist = playerPos.distanceTo(tele.position);
      if (dist <= range) {
        this.nearestInteractive = {
          type: 'teleporter',
          id: 'obelisk',
          label: 'Activate Teleporter (Spawn Boss)'
        };
        return;
      }
    }

    // 3. Check chests
    const chests = this.stageGenerator.getChests();
    let closestChest: ChestObject | null = null;
    let minDist = Infinity;

    chests.forEach(chest => {
      if (chest.opened) return;
      const d = playerPos.distanceTo(chest.position);
      if (d < minDist) {
        minDist = d;
        closestChest = chest;
      }
    });

    if (closestChest && minDist <= range) {
      const cc = closestChest as ChestObject;
      const colorText = cc.type === 'rare' ? 'Orange' : cc.type === 'large' ? 'Blue' : 'Green';
      this.nearestInteractive = {
        type: 'chest',
        id: cc.id,
        cost: cc.cost,
        label: `Open ${colorText} Chest (Cost: $${cc.cost})`
      };
    }
  }

  // Press E or interactive click to buy chests or start boss
  public triggerInteraction() {
    if (!this.nearestInteractive) return;

    if (this.nearestInteractive.type === 'chest') {
      const chestId = this.nearestInteractive.id;
      const chests = this.stageGenerator.getChests();
      const chest = chests.find(c => c.id === chestId);

      if (chest && !chest.opened && this.runStats.gold >= chest.cost) {
        // Purchase approved!
        this.runStats.gold -= chest.cost;
        this.player.gold = this.runStats.gold; // sync

        this.stageGenerator.openChestVisual(chestId);
        this.runStats.chestsOpened++;

        // Roll Loot based on chest tier chances
        let rarityChance = { common: 0.8, uncommon: 0.2, rare: 0, boss: 0 };
        if (chest.type === 'large') {
          rarityChance = { common: 0.2, uncommon: 0.7, rare: 0.1, boss: 0 };
        } else if (chest.type === 'rare') {
          rarityChance = { common: 0, uncommon: 0.4, rare: 0.6, boss: 0 };
        }

        const rolledItem = rollLoot(rarityChance);
        this.player.addItem(rolledItem);
        this.runStats.items = this.player.itemsInventory; // sync

        // Sparkling chest opening sparkles
        this.particleSystem.createExplosion(chest.position.clone().add(new THREE.Vector3(0, 0.5, 0)), rolledItem.meshColor, 15, 0.35);

        try {
          GameAudioEngine.getInstance().playSFX('clear');
        } catch (e) {}

        // Check Milestone Unlocks
        this.checkUnlocks('chests_opened', this.runStats.chestsOpened);
      }
    } else if (this.nearestInteractive.type === 'teleporter') {
      const tele = this.stageGenerator.getTeleporter();
      if (tele && !tele.activated) {
        this.activateTeleporter(tele);
        try {
          GameAudioEngine.getInstance().playSFX('warning');
        } catch (e) {}
      }
    } else if (this.nearestInteractive.type === 'portal') {
      // Proceed to Next Stage!
      const nextIndex = this.runStats.stageIndex + 1;
      if (nextIndex < STAGES.length) {
        this.loadStage(nextIndex);
        try {
          GameAudioEngine.getInstance().playSFX('select');
        } catch (e) {}
      } else {
        // Complete the game! Victory
        this.triggerVictory();
      }
    }

    // Force recount
    this.checkInteractiveProximity();
    this.onStateUpdate(this);
  }

  private handleInteractionKeyPress = (e: KeyboardEvent) => {
    if (this.isPaused || this.isGameOver) return;
    if (e.key.toLowerCase() === 'e') {
      e.preventDefault();
      this.triggerInteraction();
    }
  };

  // --- GAME OVER & PROGRESSIONS UNLOCKS ---

  private triggerGameOver() {
    this.isGameOver = true;
    this.clock.stop();
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

    try {
      GameAudioEngine.getInstance().playSFX('lose');
    } catch (e) {}

    // Fade to black screen overlay handled in React UI
    this.onStateUpdate(this);
  }

  private triggerVictory() {
    this.isVictory = true;
    this.clock.stop();
    if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);

    try {
      GameAudioEngine.getInstance().playSFX('win');
    } catch (e) {}

    // Save final stats or unlocks
    this.checkUnlocks('victory', true);
    this.onStateUpdate(this);
  }

  private checkUnlocks(type: 'kill_count' | 'chests_opened' | 'boss_kill' | 'victory', data: any) {
    // 1. Save Huntress: reach Stage 3 or survive 5 minutes
    if (type === 'victory' || (type === 'boss_kill' && this.runStats.stageIndex >= 0)) {
      // Stage 1 completed (indicated by boss_kill on stage 0)
      this.unlockCharacter('huntress');
    }

    // 2. Save Artificer: open 15 chests total
    if (type === 'chests_opened' && data >= 15) {
      this.unlockCharacter('artificer');
    }
  }

  private unlockCharacter(charId: string) {
    try {
      const unlocked = localStorage.getItem('unlocked_characters');
      const list = unlocked ? JSON.parse(unlocked) : ['commando'];
      if (!list.includes(charId)) {
        list.push(charId);
        localStorage.setItem('unlocked_characters', JSON.stringify(list));
        
        // Push floating unlock notification to HUD
        console.log(`UNLOCKED CHARACTER: ${charId}`);
      }
    } catch (e) {
      console.error(e);
    }
  }

  // --- HELPERS ---

  private handleResize = () => {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();

    this.renderer.setSize(width, height);
  };

  public destroy() {
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleInteractionKeyPress);
    window.removeEventListener('contextmenu', this.preventContextMenu);
    window.removeEventListener('mouseup', this.handleMouseUp);
    
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    this.player.destroy();
    this.enemyAI.clearAll();
    this.particleSystem.clearAll();

    if (this.renderer) {
      this.container.removeChild(this.renderer.domElement);
      this.renderer.dispose();
    }
  }
}