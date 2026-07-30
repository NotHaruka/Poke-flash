import * as THREE from 'three';
import { EnemyType, EnemyStats } from '../types';
import { ParticleSystem } from './ParticleSystem';

export interface EnemyObject {
  id: string;
  type: EnemyType;
  mesh: THREE.Group;
  stats: EnemyStats;
  state: 'idle' | 'chase' | 'attack' | 'cooldown' | 'dead';
  stateTimer: number;
  attackCooldown: number;
  speed: number;
  radius: number;
  height: number;
  isBoss: boolean;
  bossPhase?: number;
  bossSkillTimer?: number;
}

export interface BulletObject {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  damage: number;
  owner: 'player' | 'enemy';
  radius: number;
  life: number;
  maxLife: number;
  isCrit?: boolean;
  seek?: boolean;
  color?: number;
}

export class EnemyAI {
  private scene: THREE.Scene;
  private enemies: EnemyObject[] = [];
  private enemyBullets: BulletObject[] = [];
  private particleSystem: ParticleSystem;

  constructor(scene: THREE.Scene, particleSystem: ParticleSystem) {
    this.scene = scene;
    this.particleSystem = particleSystem;
  }

  getEnemies() {
    return this.enemies;
  }

  getBullets() {
    return this.enemyBullets;
  }

  // Clear all enemies and bullets (useful for restarting or stage transitions)
  clearAll() {
    this.enemies.forEach(enemy => {
      this.scene.remove(enemy.mesh);
      enemy.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    });
    this.enemies = [];

    this.enemyBullets.forEach(bullet => {
      this.scene.remove(bullet.mesh);
      bullet.mesh.geometry.dispose();
      (bullet.mesh.material as THREE.Material).dispose();
    });
    this.enemyBullets = [];
  }

  // Spawn an enemy based on archetype and difficulty multiplier
  spawnEnemy(type: EnemyType, position: THREE.Vector3, difficulty: number): EnemyObject {
    const isBoss = type === 'boss';
    const id = `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const group = new THREE.Group();
    group.position.copy(position);

    let maxHp = 30;
    let damage = 8;
    let speed = 5;
    let xpValue = 15;
    let goldValue = 10;
    let radius = 1.0;
    let height = 2.0;

    // Apply difficulty modifiers to stats
    if (type === 'melee') {
      maxHp = Math.round(35 * Math.pow(difficulty, 0.95));
      damage = Math.round(6 * Math.pow(difficulty, 0.7));
      speed = 6.2 + Math.random() * 1.5;
      xpValue = Math.round(10 * difficulty);
      goldValue = Math.round(8 * difficulty);
      radius = 0.8;
      height = 1.2;
      this.buildMeleeMesh(group);
    } else if (type === 'ranged') {
      maxHp = Math.round(45 * Math.pow(difficulty, 0.95));
      damage = Math.round(8 * Math.pow(difficulty, 0.7));
      speed = 4.5 + Math.random() * 1.0;
      xpValue = Math.round(15 * difficulty);
      goldValue = Math.round(12 * difficulty);
      radius = 0.9;
      height = 1.8;
      this.buildRangedMesh(group);
    } else if (type === 'tank') {
      maxHp = Math.round(110 * Math.pow(difficulty, 1.1));
      damage = Math.round(18 * Math.pow(difficulty, 0.8));
      speed = 3.0 + Math.random() * 0.5;
      xpValue = Math.round(35 * difficulty);
      goldValue = Math.round(25 * difficulty);
      radius = 1.5;
      height = 2.8;
      this.buildTankMesh(group);
    } else if (type === 'boss') {
      maxHp = Math.round(800 * Math.pow(difficulty, 1.2));
      damage = Math.round(30 * Math.pow(difficulty, 0.8));
      speed = 4.0;
      xpValue = Math.round(200 * difficulty);
      goldValue = Math.round(150 * difficulty);
      radius = 3.0;
      height = 6.0;
      this.buildBossMesh(group);
    }

    group.castShadow = true;
    group.receiveShadow = true;
    this.scene.add(group);

    const enemy: EnemyObject = {
      id,
      type,
      mesh: group,
      stats: {
        maxHp,
        hp: maxHp,
        damage,
        speed,
        xpValue,
        goldValue
      },
      state: 'idle',
      stateTimer: 0,
      attackCooldown: 0,
      speed,
      radius,
      height,
      isBoss,
      bossPhase: isBoss ? 1 : undefined,
      bossSkillTimer: isBoss ? 3.0 : undefined
    };

    this.enemies.push(enemy);
    return enemy;
  }

  // --- MESH BUILDERS (Low Poly Stylized Shapes) ---

  private buildMeleeMesh(group: THREE.Group) {
    // Octahedron with bright purple carapace and glowing orange spots
    const bodyGeo = new THREE.OctahedronGeometry(0.8, 0);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x6b21a8, // Purple
      roughness: 0.5,
      metalness: 0.1,
      flatShading: true
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    body.castShadow = true;
    group.add(body);

    // Glowing core eye
    const eyeGeo = new THREE.SphereGeometry(0.2, 4, 4);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xf97316 }); // Orange
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0, 0.7, 0.7);
    group.add(eye);
  }

  private buildRangedMesh(group: THREE.Group) {
    // Hovering construct (cylinder hover torso, with floating cubes around it)
    const baseGeo = new THREE.CylinderGeometry(0.4, 0.6, 1.2, 5);
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xb91c1c, // Red stone
      roughness: 0.8,
      flatShading: true
    });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.9;
    base.castShadow = true;
    group.add(base);

    // Floating head
    const headGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, flatShading: true });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.7, 0);
    head.castShadow = true;
    group.add(head);

    // Mini gun barrels
    const gunGeo = new THREE.BoxGeometry(0.2, 0.2, 0.8);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });
    const gun = new THREE.Mesh(gunGeo, gunMat);
    gun.position.set(0, 0.9, 0.5);
    group.add(gun);
  }

  private buildTankMesh(group: THREE.Group) {
    // Heavy golem made of concrete-like blocks
    // Torso
    const torsoGeo = new THREE.BoxGeometry(1.8, 1.2, 1.2);
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x4b5563, // Zinc slate grey
      roughness: 0.9,
      flatShading: true
    });
    const torso = new THREE.Mesh(torsoGeo, stoneMat);
    torso.position.y = 1.8;
    torso.castShadow = true;
    group.add(torso);

    // Head
    const headGeo = new THREE.BoxGeometry(0.7, 0.6, 0.7);
    const head = new THREE.Mesh(headGeo, stoneMat);
    head.position.set(0, 2.7, 0);
    head.castShadow = true;
    group.add(head);

    // Heavy glowing red eye slit
    const eyeGeo = new THREE.BoxGeometry(0.5, 0.1, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(0, 2.7, 0.36);
    group.add(eye);

    // Big heavy arms
    const armGeo = new THREE.BoxGeometry(0.5, 1.4, 0.5);
    const leftArm = new THREE.Mesh(armGeo, stoneMat);
    leftArm.position.set(-1.1, 1.4, 0);
    leftArm.castShadow = true;
    group.add(leftArm);

    const rightArm = new THREE.Mesh(armGeo, stoneMat);
    rightArm.position.set(1.1, 1.4, 0);
    rightArm.castShadow = true;
    group.add(rightArm);
  }

  private buildBossMesh(group: THREE.Group) {
    // Giant Vagrant Jellyfish / Sentinel Construct
    // Large dome head
    const headGeo = new THREE.SphereGeometry(2.4, 12, 12, 0, Math.PI * 2, 0, Math.PI / 1.6);
    const headMat = new THREE.MeshStandardMaterial({
      color: 0x7c3aed, // Bright purple boss
      emissive: 0x3b0764,
      roughness: 0.1,
      metalness: 0.8,
      flatShading: true,
      transparent: true,
      opacity: 0.95
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 4.0;
    head.castShadow = true;
    group.add(head);

    // Glowing core sphere inside
    const coreGeo = new THREE.SphereGeometry(1.2, 8, 8);
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x10b981 }); // Glowing emerald core
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0, 3.8, 0);
    core.name = 'boss_core';
    group.add(core);

    // 4-6 hanging tentacles
    const tentacleGeo = new THREE.CylinderGeometry(0.3, 0.1, 3.5, 5);
    const tentacleMat = new THREE.MeshStandardMaterial({ color: 0x6d28d9, flatShading: true });
    
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const x = Math.cos(angle) * 1.5;
      const z = Math.sin(angle) * 1.5;

      const tentacle = new THREE.Mesh(tentacleGeo, tentacleMat);
      tentacle.position.set(x, 1.8, z);
      tentacle.rotation.z = (Math.random() - 0.5) * 0.3;
      tentacle.rotation.x = (Math.random() - 0.5) * 0.3;
      tentacle.name = `tentacle_${i}`;
      tentacle.castShadow = true;
      group.add(tentacle);
    }
  }

  // --- UPDATE ENEMY AI SYSTEM ---

  update(
    deltaTime: number,
    playerPos: THREE.Vector3,
    obstacles: THREE.Object3D[],
    onPlayerHit: (damage: number) => void
  ) {
    this.updateEnemies(deltaTime, playerPos, obstacles, onPlayerHit);
    this.updateBullets(deltaTime, playerPos, obstacles, onPlayerHit);
  }

  private updateEnemies(
    deltaTime: number,
    playerPos: THREE.Vector3,
    obstacles: THREE.Object3D[],
    onPlayerHit: (damage: number) => void
  ) {
    const aliveEnemies: EnemyObject[] = [];

    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      if (enemy.stats.hp <= 0) {
        // Explode on death
        this.particleSystem.createExplosion(enemy.mesh.position, enemy.type === 'boss' ? 0x10b981 : 0xef4444, enemy.type === 'boss' ? 50 : 15, enemy.type === 'boss' ? 0.8 : 0.4);
        
        this.scene.remove(enemy.mesh);
        enemy.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            child.material.dispose();
          }
        });
        continue;
      }

      // Decrement timers
      if (enemy.attackCooldown > 0) enemy.attackCooldown -= deltaTime;
      if (enemy.bossSkillTimer !== undefined && enemy.bossSkillTimer > 0) enemy.bossSkillTimer -= deltaTime;

      const dist = enemy.mesh.position.distanceTo(playerPos);

      // Simple State Machine
      // Face the player
      const dirToPlayer = playerPos.clone().sub(enemy.mesh.position);
      dirToPlayer.y = 0; // maintain height
      dirToPlayer.normalize();

      if (dirToPlayer.lengthSq() > 0.001) {
        // Rotate smoothly towards player
        const targetRotation = Math.atan2(dirToPlayer.x, dirToPlayer.z);
        enemy.mesh.rotation.y = targetRotation;
      }

      // Floating animations for bosses or ranged
      if (enemy.type === 'boss') {
        enemy.mesh.position.y = 4.0 + Math.sin(Date.now() * 0.003) * 0.4;
        // Wiggle tentacles
        for (let t = 0; t < 5; t++) {
          const tentacle = enemy.mesh.getObjectByName(`tentacle_${t}`);
          if (tentacle) {
            tentacle.rotation.z = Math.sin(Date.now() * 0.002 + t) * 0.2;
            tentacle.rotation.x = Math.cos(Date.now() * 0.002 + t) * 0.2;
          }
        }
      } else if (enemy.type === 'ranged') {
        enemy.mesh.position.y = 1.0 + Math.sin(Date.now() * 0.005) * 0.25;
      }

      // AI Logic by Archetype
      if (enemy.type === 'melee') {
        // Chase directly, attack on contact
        if (dist > 1.2) {
          enemy.mesh.position.addScaledVector(dirToPlayer, enemy.speed * deltaTime);
        } else {
          // Melee attack
          if (enemy.attackCooldown <= 0) {
            onPlayerHit(enemy.stats.damage);
            enemy.attackCooldown = 1.5; // 1.5s attack delay
            
            // Push player back slightly or visual hit ring
            this.particleSystem.createVisualRing(enemy.mesh.position, 0xef4444, 2, 0.2);
          }
        }
      } else if (enemy.type === 'ranged') {
        // Maintain distance of around 15m. Run closer if too far, backup if too close.
        if (dist > 20) {
          enemy.mesh.position.addScaledVector(dirToPlayer, enemy.speed * deltaTime);
        } else if (dist < 10) {
          enemy.mesh.position.addScaledVector(dirToPlayer.negate(), enemy.speed * deltaTime);
        } else {
          // Circle or drift sideways
          const right = new THREE.Vector3(-dirToPlayer.z, 0, dirToPlayer.x).normalize();
          enemy.mesh.position.addScaledVector(right, enemy.speed * 0.3 * deltaTime);
        }

        // Fire projectils
        if (enemy.attackCooldown <= 0 && dist < 32) {
          this.shootEnemyProjectile(enemy.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0)), dirToPlayer, enemy.stats.damage);
          enemy.attackCooldown = 2.5 + Math.random() * 1.0;
        }
      } else if (enemy.type === 'tank') {
        // Slow heavy rusher, ground slams
        if (dist > 3.0) {
          enemy.mesh.position.addScaledVector(dirToPlayer, enemy.speed * deltaTime);
        } else {
          if (enemy.attackCooldown <= 0) {
            enemy.attackCooldown = 3.5; // 3.5s cooldown
            
            // Heavy slam sequence: flash first, then slam after 0.6s
            this.particleSystem.createVisualRing(enemy.mesh.position, 0xf97316, 5, 0.4);
            
            // Apply delay hit check
            setTimeout(() => {
              if (enemy.stats.hp > 0 && enemy.mesh.position.distanceTo(playerPos) <= 6.0) {
                onPlayerHit(enemy.stats.damage);
                this.particleSystem.createExplosion(enemy.mesh.position, 0xf97316, 20, 0.6);
              }
            }, 500);
          }
        }
      } else if (enemy.type === 'boss') {
        // Boss behaviors (Colossus / Jellyfish style)
        // Keep circling player slowly at about 20m distance
        if (dist > 25) {
          enemy.mesh.position.addScaledVector(dirToPlayer, enemy.speed * deltaTime);
        } else if (dist < 15) {
          enemy.mesh.position.addScaledVector(dirToPlayer.negate(), enemy.speed * deltaTime);
        } else {
          const right = new THREE.Vector3(-dirToPlayer.z, 0, dirToPlayer.x).normalize();
          enemy.mesh.position.addScaledVector(right, enemy.speed * 0.5 * deltaTime);
        }

        // Periodic Skill cast
        if (enemy.bossSkillTimer !== undefined && enemy.bossSkillTimer <= 0) {
          enemy.bossSkillTimer = 6.0 + Math.random() * 4.0;
          
          // Randomly trigger one of two boss attacks
          const attackRoll = Math.random();
          if (attackRoll < 0.5) {
            // Skill 1: Radial projectile burst (Jellyfish shockwave)
            this.particleSystem.createVisualRing(enemy.mesh.position, 0x10b981, 15, 0.8);
            
            // Fire 12 bullets in a full circle
            for (let b = 0; b < 12; b++) {
              const theta = (b / 12) * Math.PI * 2;
              const pDir = new THREE.Vector3(Math.cos(theta), 0.1, Math.sin(theta)).normalize();
              this.shootEnemyProjectile(
                enemy.mesh.position.clone().add(new THREE.Vector3(0, 3.5, 0)),
                pDir,
                enemy.stats.damage * 0.75,
                14 // slightly faster speed
              );
            }
          } else {
            // Skill 2: Heavy charging orbital strike at player's location
            const strikeTarget = playerPos.clone();
            
            // Draw a warning indicator at player's spot
            this.particleSystem.createVisualRing(strikeTarget, 0xef4444, 8, 1.5);
            
            setTimeout(() => {
              // Deal major area damage at targeted spot
              this.particleSystem.createExplosion(strikeTarget, 0xef4444, 30, 0.8);
              this.particleSystem.createVisualRing(strikeTarget, 0xef4444, 10, 0.4);
              
              const currentDist = playerPos.distanceTo(strikeTarget);
              if (currentDist <= 8.5) {
                // Scales with distance
                const falloff = 1 - (currentDist / 8.5);
                onPlayerHit(Math.round(enemy.stats.damage * 1.5 * falloff));
              }
            }, 1500);
          }
        }
      }

      // Constrain enemy to arena boundaries (keeps them on the stage)
      const arenaRadius = 100 - enemy.radius;
      const currentRadius = enemy.mesh.position.length();
      if (currentRadius > arenaRadius) {
        enemy.mesh.position.setLength(arenaRadius);
      }

      // Prevent enemy overlap (simple soft separation physics)
      for (let j = 0; j < this.enemies.length; j++) {
        const other = this.enemies[j];
        if (other.id === enemy.id || other.stats.hp <= 0) continue;

        const sepDist = enemy.mesh.position.distanceTo(other.mesh.position);
        const minDist = enemy.radius + other.radius;
        if (sepDist < minDist && sepDist > 0.01) {
          const overlap = minDist - sepDist;
          const pushDir = enemy.mesh.position.clone().sub(other.mesh.position).normalize();
          enemy.mesh.position.addScaledVector(pushDir, overlap * 0.5);
          other.mesh.position.addScaledVector(pushDir, -overlap * 0.5);
        }
      }

      aliveEnemies.push(enemy);
    }

    this.enemies = aliveEnemies;
  }

  private shootEnemyProjectile(startPos: THREE.Vector3, dir: THREE.Vector3, damage: number, speed = 10.0) {
    const geometry = new THREE.SphereGeometry(0.35, 4, 4);
    const material = new THREE.MeshBasicMaterial({ color: 0xef4444 }); // Ranged enemy bullet
    const bulletMesh = new THREE.Mesh(geometry, material);
    bulletMesh.position.copy(startPos);
    this.scene.add(bulletMesh);

    this.enemyBullets.push({
      mesh: bulletMesh,
      position: bulletMesh.position,
      velocity: dir.clone().multiplyScalar(speed),
      damage,
      owner: 'enemy',
      radius: 0.35,
      life: 0,
      maxLife: 4.5 // range limit
    });
  }

  private updateBullets(
    deltaTime: number,
    playerPos: THREE.Vector3,
    obstacles: THREE.Object3D[],
    onPlayerHit: (damage: number) => void
  ) {
    const activeBullets: BulletObject[] = [];

    for (let i = 0; i < this.enemyBullets.length; i++) {
      const b = this.enemyBullets[i];
      b.life += deltaTime;

      if (b.life >= b.maxLife) {
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        continue;
      }

      // Advance bullet position
      b.mesh.position.addScaledVector(b.velocity, deltaTime);

      // Check collision with player
      // Player height center is around y=1
      const playerCenter = playerPos.clone().add(new THREE.Vector3(0, 1.0, 0));
      const distToPlayer = b.mesh.position.distanceTo(playerCenter);
      if (distToPlayer <= b.radius + 1.0) {
        onPlayerHit(b.damage);
        
        // Visual spark splash
        this.particleSystem.createSparks(b.mesh.position, b.velocity.clone().normalize().negate(), 0xef4444, 4);
        
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        continue;
      }

      // Check collision with ground/walls
      if (b.mesh.position.y <= 0) {
        this.particleSystem.createSparks(b.mesh.position, new THREE.Vector3(0, 1, 0), 0xef4444, 3);
        
        this.scene.remove(b.mesh);
        b.mesh.geometry.dispose();
        (b.mesh.material as THREE.Material).dispose();
        continue;
      }

      activeBullets.push(b);
    }

    this.enemyBullets = activeBullets;
  }
}
