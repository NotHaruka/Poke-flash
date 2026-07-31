import * as THREE from 'three';
import { PlayerCharacter, Item, Rarity } from '../types';
import { ITEMS } from './ItemSystem';
import { GameAudioEngine } from '../games/core/GameAudioEngine';
import { ParticleSystem } from './ParticleSystem';
import { EnemyObject, BulletObject } from './EnemyAI';

export class PlayerController {
  private scene: THREE.Scene;
  private particleSystem: ParticleSystem;
  
  // Player Character profile
  public character: PlayerCharacter;
  public stats: PlayerCharacter['stats'];
  
  // 3D Objects
  public group: THREE.Group;
  private mesh: THREE.Mesh | null = null;
  private orbitGroup: THREE.Group;
  private orbitalMeshes: { item: Item; mesh: THREE.Mesh; angleOffset: number; radius: number; speed: number; yOffset: number }[] = [];

  // Movement Physics
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  private gravity = 25;
  private isGrounded = true;
  private jumpsRemaining = 1;
  private isSprinting = false;

  // Invulnerability & Utility Dash
  public isInvulnerable = false;
  private dashTimeRemaining = 0;
  private dashDirection = new THREE.Vector3();
  private dashSpeedMultiplier = 2.8;

  // Key states
  private keys: Record<string, boolean> = {};

  // Camera settings
  public cameraAngleX = 0; // horizontal rotation
  public cameraAngleY = 0.3; // vertical tilt pitch
  private minTilt = 0.05;
  private maxTilt = 1.2;

  // Game tracking state
  public score = 0;
  public gold = 0;
  public xp = 0;
  public level = 1;
  public xpNeeded = 100;
  public itemsInventory: Record<string, number> = {}; // item_id -> stack count
  public playerBullets: BulletObject[] = [];

  // Cooldown Trackers (in seconds)
  public primaryCD = 0;
  public secondaryCD = 0;
  public utilityCD = 0;
  public specialCD = 0;

  // Buff / State timers
  private standingStillTimer = 0;
  private fungusHealTimer = 0;

  constructor(scene: THREE.Scene, particleSystem: ParticleSystem, defaultCharacter: PlayerCharacter) {
    this.scene = scene;
    this.particleSystem = particleSystem;
    this.character = JSON.parse(JSON.stringify(defaultCharacter)); // Deep clone
    this.stats = this.character.stats;
    this.jumpsRemaining = this.stats.jumpCount;

    // Create 3D representation
    this.group = new THREE.Group();
    this.group.position.set(0, 0, 0);
    this.scene.add(this.group);

    this.buildPlayerMesh();

    // Create a sub-group for orbital items
    this.orbitGroup = new THREE.Group();
    this.group.add(this.orbitGroup);

    this.setupInputListeners();
  }

  // --- BUILD PLAYER MESH ---
  private buildPlayerMesh() {
    // Stylized low-poly explorer: capsule/box body with glowing visor
    const bodyGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.8, 8);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: this.character.meshColor,
      roughness: 0.4,
      metalness: 0.2,
      flatShading: true
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    body.receiveShadow = true;
    this.group.add(body);

    // Glowing visor / headpiece pointing forward (+Z direction)
    const visorGeo = new THREE.BoxGeometry(0.8, 0.2, 0.4);
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x60a5fa }); // Glowing cyan visor
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.4, 0.45);
    this.group.add(visor);

    // Rocket thrusters at the bottom for jumping
    const thrusterGeo = new THREE.CylinderGeometry(0.25, 0.1, 0.3, 5);
    const thrusterMat = new THREE.MeshStandardMaterial({ color: 0x334155 });
    
    const leftThruster = new THREE.Mesh(thrusterGeo, thrusterMat);
    leftThruster.position.set(-0.3, 0, -0.1);
    this.group.add(leftThruster);

    const rightThruster = new THREE.Mesh(thrusterGeo, thrusterMat);
    rightThruster.position.set(0.3, 0, -0.1);
    this.group.add(rightThruster);
  }

  // --- ADD ITEM TO PLAYER ---
  public addItem(item: Item) {
    const prevCount = this.itemsInventory[item.id] || 0;
    this.itemsInventory[item.id] = prevCount + 1;

    // Trigger item immediate stat upgrades
    // Since some stats compound, we recalculate full stats on item addition
    this.recalculateStats();

    // Spawn orbital 3D mesh representation for this stack index
    this.addOrbitalMesh(item);
  }

  // Recalculates stats by applying base attributes and active stack modifiers
  private recalculateStats() {
    // Reset to base character attributes
    const baseStats = this.character.stats;
    this.stats.maxHp = baseStats.maxHp;
    this.stats.damage = baseStats.damage;
    this.stats.attackSpeed = baseStats.attackSpeed;
    this.stats.moveSpeed = baseStats.moveSpeed;
    this.stats.critChance = baseStats.critChance;
    this.stats.jumpCount = baseStats.jumpCount;
    this.stats.armor = baseStats.armor;
    this.stats.hpRegen = baseStats.hpRegen;

    // Apply active passives
    Object.keys(this.itemsInventory).forEach(itemId => {
      const item = ITEMS.find(i => i.id === itemId);
      const stack = this.itemsInventory[itemId];
      if (item && stack > 0) {
        item.effect(this, stack, 'passive');
      }
    });

    // Make sure health doesn't exceed new max
    if (this.stats.hp > this.stats.maxHp) {
      this.stats.hp = this.stats.maxHp;
    }
  }

  private addOrbitalMesh(item: Item) {
    // Pick shape based on config
    let geo: THREE.BufferGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    switch (item.meshShape) {
      case 'box': geo = new THREE.BoxGeometry(0.3, 0.3, 0.3); break;
      case 'sphere': geo = new THREE.SphereGeometry(0.18, 6, 6); break;
      case 'cone': geo = new THREE.ConeGeometry(0.18, 0.35, 5); break;
      case 'torus': geo = new THREE.TorusGeometry(0.18, 0.06, 6, 12); break;
      case 'octahedron': geo = new THREE.OctahedronGeometry(0.24, 0); break;
    }

    const mat = new THREE.MeshStandardMaterial({
      color: item.meshColor,
      roughness: 0.1,
      metalness: 0.8,
      flatShading: true,
      emissive: item.meshColor,
      emissiveIntensity: 0.5
    });

    const mesh = new THREE.Mesh(geo, mat);
    this.orbitGroup.add(mesh);

    // Determine orbit settings based on items count
    const totalOrbitals = this.orbitalMeshes.length;
    // Layer rings: Ring 1 (radius 1.8), Ring 2 (radius 2.5), etc.
    const ringIndex = Math.floor(totalOrbitals / 6);
    const radius = 1.8 + ringIndex * 0.7;
    const speed = 1.5 * (ringIndex % 2 === 0 ? 1 : -1) * (1 / (1 + ringIndex * 0.3));
    const yOffset = 0.5 + (ringIndex * 0.4) + (Math.random() - 0.5) * 0.2;

    this.orbitalMeshes.push({
      item,
      mesh,
      angleOffset: Math.random() * Math.PI * 2,
      radius,
      speed,
      yOffset
    });
  }

  // --- PHYSICS & CONTROLS TICK ---
  public update(deltaTime: number, obstacles: THREE.Object3D[], camera: THREE.Camera, enemies?: any[]) {
    // 1. Decrement cooldowns
    if (this.primaryCD > 0) this.primaryCD -= deltaTime;
    if (this.secondaryCD > 0) this.secondaryCD -= deltaTime;
    if (this.utilityCD > 0) this.utilityCD -= deltaTime;
    if (this.specialCD > 0) this.specialCD -= deltaTime;
    if (this.dashTimeRemaining > 0) {
      this.dashTimeRemaining -= deltaTime;
      if (this.dashTimeRemaining <= 0) {
        this.isInvulnerable = false;
      }
    }

    // 2. Health Regeneration
    if (this.stats.hp < this.stats.maxHp) {
      this.heal(this.stats.hpRegen * deltaTime);
    }

    // 3. Passive item triggers: Fungus (standing still)
    this.updateStandingStillFungus(deltaTime);

    // 4. Update Movement
    this.updateMovement(deltaTime, obstacles);

    // 5. Update Orbital passive item rotation in 3D
    this.updateOrbitalRotation(deltaTime);

    // 6. Update player bullets
    this.updateBullets(deltaTime, enemies);
  }

  private updateStandingStillFungus(deltaTime: number) {
    const fungusCount = this.itemsInventory['fungus'] || 0;
    if (fungusCount <= 0) return;

    const currentSpeedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
    const isStandingStill = currentSpeedSq < 0.05 && this.isGrounded;

    if (isStandingStill) {
      this.standingStillTimer += deltaTime;
      if (this.standingStillTimer >= 1.5) {
        // Heal 4% max health per second per stack
        this.fungusHealTimer += deltaTime;
        if (this.fungusHealTimer >= 1.0) {
          const healAmount = this.stats.maxHp * 0.04 * fungusCount;
          this.heal(healAmount);
          this.particleSystem.createHealEffect(this.group.position, 4);
          this.fungusHealTimer = 0;
        }
      }
    } else {
      this.standingStillTimer = 0;
      this.fungusHealTimer = 0;
    }
  }

  private updateMovement(deltaTime: number, obstacles: THREE.Object3D[]) {
    if (this.dashTimeRemaining > 0) {
      // Dash-lock velocity: Move player rapidly in the dash direction
      const dashSpeed = this.stats.moveSpeed * this.dashSpeedMultiplier;
      this.velocity.x = this.dashDirection.x * dashSpeed;
      this.velocity.z = this.dashDirection.z * dashSpeed;
      this.velocity.y = 0; // flat forward dash
    } else {
      // Calculate standard camera-relative movement vectors
      const forwardVec = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraAngleX).normalize();
      const rightVec = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraAngleX).normalize();

      const moveDirection = new THREE.Vector3(0, 0, 0);
      if (this.keys['w'] || this.keys['arrowup']) moveDirection.add(forwardVec);
      if (this.keys['s'] || this.keys['arrowdown']) moveDirection.add(forwardVec.clone().negate());
      if (this.keys['a'] || this.keys['arrowleft']) moveDirection.add(rightVec.clone().negate());
      if (this.keys['d'] || this.keys['arrowright']) moveDirection.add(rightVec);

      moveDirection.normalize();

      this.isSprinting = !!(this.keys['shift'] && moveDirection.lengthSq() > 0.01 && this.dashTimeRemaining <= 0);
      const speed = this.stats.moveSpeed * (this.isSprinting ? 1.5 : 1.0);

      this.velocity.x = moveDirection.x * speed;
      this.velocity.z = moveDirection.z * speed;

      // Apply Gravity
      if (!this.isGrounded) {
        this.velocity.y -= this.gravity * deltaTime;
      }
    }

    // Apply movement velocities
    this.group.position.addScaledVector(this.velocity, deltaTime);

    // Collision checking with ground & obstacles
    this.checkCollisions(obstacles);

    // Rotate body to face movement direction or shooting target direction
    if (this.velocity.x !== 0 || this.velocity.z !== 0) {
      const faceAngle = Math.atan2(this.velocity.x, this.velocity.z);
      this.group.rotation.y = faceAngle;
    }

    // Force player to remain inside the arena stage bounds
    const arenaBound = 100 - 1.0; // Stage size boundary limit
    const currentDist = this.group.position.length();
    if (currentDist > arenaBound) {
      this.group.position.setLength(arenaBound);
    }
  }

  private checkCollisions(obstacles: THREE.Object3D[]) {
    // 1. Simple Ground check
    // Top of flat cylindrical ground is at y=0. Player radius ~0.6, height ~1.8
    if (this.group.position.y <= 0) {
      this.group.position.y = 0;
      this.velocity.y = 0;
      this.isGrounded = true;
      this.jumpsRemaining = this.stats.jumpCount;
    } else {
      this.isGrounded = false;
    }

    // 2. Obstacle box/cylinder collision checking
    // Represent player as bounding capsule/sphere around x, z with radius 0.6
    const playerRadius = 0.6;
    
    obstacles.forEach(obj => {
      // Ignore ground obstacle which is handled by y=0
      if (obj.name === 'ground') return;

      // Calculate horizontal distance between player and obstacle position
      // Simple cylindrical column distance check
      const obstaclePos = new THREE.Vector3();
      obj.getWorldPosition(obstaclePos);
      
      const horizontalDist = new THREE.Vector3(
        this.group.position.x - obstaclePos.x,
        0,
        this.group.position.z - obstaclePos.z
      );

      const d = horizontalDist.length();
      
      // We assume props/rocks have a bounding cylindrical radius based on biome / scale
      let colRadius = 1.5; // default column radius
      if (obj instanceof THREE.Mesh) {
        colRadius = obj.scale.x * 0.9;
      } else if (obj instanceof THREE.Group) {
        colRadius = 1.2;
      }

      const minDist = playerRadius + colRadius;

      if (d < minDist && this.group.position.y < 3.5) {
        const pushAmount = minDist - d;
        const pushDir = horizontalDist.normalize();
        this.group.position.addScaledVector(pushDir, pushAmount);
      }
    });
  }

  private updateOrbitalRotation(deltaTime: number) {
    const time = Date.now() * 0.001;
    this.orbitalMeshes.forEach(itemInfo => {
      const currentAngle = itemInfo.angleOffset + time * itemInfo.speed;
      const x = Math.cos(currentAngle) * itemInfo.radius;
      const z = Math.sin(currentAngle) * itemInfo.radius;

      itemInfo.mesh.position.set(x, itemInfo.yOffset, z);
      // Face forwards in orbit or spin individually
      itemInfo.mesh.rotation.y += deltaTime * 1.5;
      itemInfo.mesh.rotation.x += deltaTime * 0.7;
    });
  }

  // --- ACTIONS ---

  public handleMouseLook(movementX: number, movementY: number) {
    const sensitivity = 0.0025;
    this.cameraAngleX -= movementX * sensitivity;
    this.cameraAngleY = Math.max(this.minTilt, Math.min(this.maxTilt, this.cameraAngleY + movementY * sensitivity));
  }

  public jump() {
    if (this.jumpsRemaining > 0) {
      this.velocity.y = 12.0; // Jump impulse velocity
      this.jumpsRemaining--;
      this.isGrounded = false;
      
      // Emit jet spark particles
      this.particleSystem.createExplosion(
        this.group.position.clone().add(new THREE.Vector3(0, 0.1, 0)),
        0xf97316,
        5,
        0.2
      );
      try {
        GameAudioEngine.getInstance().playSFX('move');
      } catch (e) {}
    }
  }

  public triggerDash() {
    if (this.utilityCD > 0) return;

    // Set dash cooldown based on character specs
    this.utilityCD = this.character.abilities.utility.cooldown;
    
    // Hardlight afterburner extra cooldown reduction handled in recalculateStats()
    this.dashTimeRemaining = 0.25; // 0.25 seconds dash duration
    this.isInvulnerable = true;

    // Dash vector: forward-facing camera direction, or keyboard movement vector
    const forwardVec = new THREE.Vector3(0, 0, -1).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraAngleX).normalize();
    const rightVec = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), this.cameraAngleX).normalize();

    const dashDir = new THREE.Vector3(0, 0, 0);
    if (this.keys['w']) dashDir.add(forwardVec);
    if (this.keys['s']) dashDir.add(forwardVec.clone().negate());
    if (this.keys['a']) dashDir.add(rightVec.clone().negate());
    if (this.keys['d']) dashDir.add(rightVec);

    if (dashDir.lengthSq() < 0.01) {
      // Default dash forward if no move key pressed
      dashDir.copy(forwardVec);
    } else {
      dashDir.normalize();
    }

    this.dashDirection.copy(dashDir);

    // Create dash dust trails
    this.particleSystem.createExplosion(this.group.position, 0xef4444, 8, 0.25);
    try {
      GameAudioEngine.getInstance().playSFX('swish');
    } catch (e) {}
  }

  // Shoot double pistols or custom primary skill
  public triggerPrimary(cameraDirection: THREE.Vector3) {
    if (this.primaryCD > 0) return;

    // Apply attack speed multiplier
    this.primaryCD = this.character.abilities.primary.cooldown / this.stats.attackSpeed;

    const bulletDir = cameraDirection.clone();
    bulletDir.y = 0; // keep it perfectly horizontal so it stays above ground!
    bulletDir.normalize();

    // Trigger double physical bullet or magic bolts
    if (this.character.id === 'commando') {
      this.spawnPlayerBullet(bulletDir, this.stats.damage, false, 0xfacc15, 0.3); // Golden bullets for Commando!
      setTimeout(() => {
        this.spawnPlayerBullet(bulletDir, this.stats.damage, false, 0xfacc15, 0.3);
      }, 80);
    } else if (this.character.id === 'huntress') {
      // Seeking arrow: targets closest enemy automatically (Neon crimson seeking arrow!)
      this.spawnPlayerBullet(bulletDir, this.stats.damage * 1.2, true, 0xef4444, 0.25);
    } else {
      // Artificer explosive Flame Bolt (Heavy orange flame bolts!)
      this.spawnPlayerBullet(bulletDir, this.stats.damage * 2.0, false, 0xf97316, 0.45);
    }
    try {
      GameAudioEngine.getInstance().playSFX('shoot');
    } catch (e) {}
  }

  // Heavy secondary skill (e.g. Phase Round, Nano Bomb)
  public triggerSecondary(cameraDirection: THREE.Vector3) {
    if (this.secondaryCD > 0) return;

    this.secondaryCD = this.character.abilities.secondary.cooldown;
    const bulletDir = cameraDirection.clone();
    bulletDir.y = 0; // fire horizontally
    bulletDir.normalize();

    if (this.character.id === 'commando') {
      // Heavy penetrating bullet - beautiful electric blue
      this.spawnPlayerBullet(bulletDir, this.stats.damage * 2.2, false, 0x3b82f6, 0.65, 30.0);
    } else if (this.character.id === 'huntress') {
      // Bouncing glaive - faster projectile
      this.spawnPlayerBullet(bulletDir, this.stats.damage * 1.5, true, 0xf59e0b, 0.55, 35.0);
    } else {
      // Artificer charged lightning orb
      this.spawnPlayerBullet(bulletDir, this.stats.damage * 4.0, false, 0x8b5cf6, 0.9, 15.0);
    }
    try {
      GameAudioEngine.getInstance().playSFX('laser');
    } catch (e) {}
  }

  // Ultimate / special ability (e.g. Missile Barrage, Flamethrower)
  public triggerSpecial(cameraDirection: THREE.Vector3) {
    if (this.specialCD > 0) return;

    this.specialCD = this.character.abilities.special.cooldown;

    if (this.character.id === 'commando') {
      // Rapid Suppressive Fire: shoots 6 times rapidly
      let shots = 0;
      const interval = setInterval(() => {
        if (shots < 6) {
          const spreadDir = cameraDirection.clone();
          spreadDir.y = 0; // force horizontal
          spreadDir.add(new THREE.Vector3(
            (Math.random() - 0.5) * 0.15,
            0,
            (Math.random() - 0.5) * 0.15
          )).normalize();
          this.spawnPlayerBullet(spreadDir, this.stats.damage * 1.1, false, 0xfacc15, 0.3);
          shots++;
          try {
            GameAudioEngine.getInstance().playSFX('shoot');
          } catch (e) {}
        } else {
          clearInterval(interval);
        }
      }, 120);
    } else if (this.character.id === 'huntress') {
      // Arrow Rain at local targeted spot
      const targetPos = this.group.position.clone().add(cameraDirection.clone().setY(0).normalize().multiplyScalar(15));
      targetPos.y = 0; // lock to ground

      this.particleSystem.createVisualRing(targetPos, 0xef4444, 8, 2.5);

      let ticks = 0;
      const arrowRainInterval = setInterval(() => {
        if (ticks < 12) {
          // Spawn area-of-effect damage sparks
          this.particleSystem.createExplosion(
            targetPos.clone().add(new THREE.Vector3(
              (Math.random() - 0.5) * 6,
              Math.random() * 5 + 1,
              (Math.random() - 0.5) * 6
            )),
            0xef4444,
            4,
            0.15
          );
          ticks++;
        } else {
          clearInterval(arrowRainInterval);
        }
      }, 150);
    } else {
      // Artificer flamethrower channels fire over 2 seconds
      let burns = 0;
      const flameInterval = setInterval(() => {
        if (burns < 8) {
          // Spew visual fire rings/particles forward
          const start = this.group.position.clone().add(new THREE.Vector3(0, 1.0, 0));
          const fDir = cameraDirection.clone().setY(0).normalize();
          const target = start.clone().addScaledVector(fDir, 8.0);
          this.particleSystem.createBulletTrail(start, target, 0xea580c, 0.15);
          burns++;
        } else {
          clearInterval(flameInterval);
        }
      }, 200);
    }
  }

  private spawnPlayerBullet(dir: THREE.Vector3, dmg: number, seek: boolean, color = 0xfff7ed, size = 0.25, velocity = 40.0) {
    const geometry = new THREE.SphereGeometry(size, 4, 4);
    const material = new THREE.MeshBasicMaterial({ color: color });
    const bMesh = new THREE.Mesh(geometry, material);
    bMesh.position.copy(this.group.position).add(new THREE.Vector3(0, 1.1, 0)); // fire from visor height
    this.scene.add(bMesh);

    // Critical roll
    const isCrit = Math.random() < this.stats.critChance;
    const finalDamage = isCrit ? dmg * 2 : dmg;

    this.playerBullets.push({
      mesh: bMesh,
      position: bMesh.position,
      velocity: dir.clone().multiplyScalar(velocity),
      damage: finalDamage,
      owner: 'player',
      radius: size,
      life: 0,
      maxLife: 2.5, // 2.5s life range limits
      isCrit,
      seek,
      color
    });
  }

  // --- UPDATE PLAYER BULLETS PHYSICS & ENEMY HITS ---
  private updateBullets(deltaTime: number, enemies?: any[]) {
    const activeBullets: BulletObject[] = [];

    for (let i = 0; i < this.playerBullets.length; i++) {
      const b = this.playerBullets[i];
      b.life += deltaTime;

      if (b.life >= b.maxLife) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        continue;
      }

      // Homing/steering logic: lock and steer towards closest target if seeking arrow!
      if (b.seek && enemies && enemies.length > 0) {
        let closestEnemy: any = null;
        let closestDist = Infinity;

        for (let j = 0; j < enemies.length; j++) {
          const e = enemies[j];
          if (e.stats.hp > 0) {
            const dist = b.mesh.position.distanceTo(e.mesh.position);
            if (dist < closestDist) {
              closestDist = dist;
              closestEnemy = e;
            }
          }
        }

        if (closestEnemy && closestDist < 30) {
          const targetPos = closestEnemy.mesh.position.clone().add(new THREE.Vector3(0, closestEnemy.height / 2, 0));
          const desiredDir = targetPos.sub(b.mesh.position).normalize();

          const currentSpeed = b.velocity.length();
          const currentDir = b.velocity.clone().normalize();
          
          currentDir.lerp(desiredDir, deltaTime * 8.0).normalize();
          b.velocity.copy(currentDir.multiplyScalar(currentSpeed));
        }
      }

      // Physics move
      const prevPos = b.mesh.position.clone();
      b.mesh.position.addScaledVector(b.velocity, deltaTime);

      // Create glowing laser trail matching projectile's color!
      const trailColor = b.color !== undefined ? b.color : 0xfff7ed;
      this.particleSystem.createBulletTrail(prevPos, b.mesh.position, trailColor, 0.12);

      // Check collision with boundary floor
      if (b.mesh.position.y <= 0) {
        this.particleSystem.createSparks(b.mesh.position, new THREE.Vector3(0, 1, 0), trailColor, 3);
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        continue;
      }

      activeBullets.push(b);
    }

    this.playerBullets = activeBullets;
  }

  // --- DAMAGE & REWARDS ---

  public heal(amount: number) {
    this.stats.hp = Math.min(this.stats.maxHp, this.stats.hp + amount);
  }

  public takeDamage(amount: number) {
    if (this.isInvulnerable) return;

    // Apply flat armor plate reductions
    const reducedAmount = Math.max(1, amount - this.stats.armor);
    this.stats.hp -= reducedAmount;
    
    // Visual flash/hit sparks
    this.particleSystem.createExplosion(this.group.position, 0xef4444, 6, 0.35);
    try {
      GameAudioEngine.getInstance().playSFX('hit');
    } catch (e) {}

    if (this.stats.hp <= 0) {
      this.stats.hp = 0;
    }
  }

  public earnRewards(xpReward: number, goldReward: number) {
    this.gold += goldReward;
    this.xp += xpReward;

    if (goldReward > 0) {
      try {
        GameAudioEngine.getInstance().playSFX('gold');
      } catch (e) {}
    }

    // Level up check
    if (this.xp >= this.xpNeeded) {
      this.levelUp();
    }
  }

  private levelUp() {
    this.level++;
    this.xp -= this.xpNeeded;
    // Scale next level XP required
    this.xpNeeded = Math.round(this.xpNeeded * 1.3);

    // Buff stats on level up
    this.character.stats.maxHp += 15;
    this.character.stats.damage += 2;
    this.character.stats.hpRegen += 0.2;
    this.recalculateStats();

    // Refill HP
    this.stats.hp = this.stats.maxHp;

    // Golden explosion visual
    this.particleSystem.createExplosion(this.group.position, 0xfacc15, 25, 0.5);
    this.particleSystem.createVisualRing(this.group.position, 0xfacc15, 8, 0.5);
    try {
      GameAudioEngine.getInstance().playSFX('victory');
    } catch (e) {}
  }

  // --- INPUT LISTENERS ---
  private setupInputListeners() {
    window.addEventListener('keydown', (e) => {
      this.keys[e.key.toLowerCase()] = true;
      
      // Handle Jump (supports multiple jumps)
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        this.jump();
      }

      // Handle Utility dash (Shift)
      if (e.key.toLowerCase() === 'shift') {
        e.preventDefault();
        this.triggerDash();
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.key.toLowerCase()] = false;
    });
  }

  // Clean listeners and meshes
  public destroy() {
    this.scene.remove(this.group);
    
    this.orbitalMeshes.forEach(itemInfo => {
      this.orbitGroup.remove(itemInfo.mesh);
      itemInfo.mesh.geometry.dispose();
      (itemInfo.mesh.material as THREE.Material).dispose();
    });
    this.orbitalMeshes = [];
    
    this.playerBullets.forEach(b => {
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
    });
    this.playerBullets = [];
  }
}
