import * as THREE from 'three';
import { Stage } from '../types';

export interface ChestObject {
  mesh: THREE.Group;
  id: string;
  type: 'common' | 'large' | 'rare';
  cost: number;
  opened: boolean;
  position: THREE.Vector3;
}

export interface TeleporterObject {
  mesh: THREE.Group;
  activated: boolean;
  charged: boolean;
  chargeProgress: number; // 0 to 1
  position: THREE.Vector3;
  zoneRadius: number;
  zoneMesh: THREE.Mesh | null;
  portalMesh: THREE.Group | null;
  portalSpawned: boolean;
}

export class StageGenerator {
  private scene: THREE.Scene;
  private obstacles: THREE.Object3D[] = [];
  private chests: ChestObject[] = [];
  private teleporter: TeleporterObject | null = null;
  private arenaSize = 100; // Radius of boundary

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  getObstacles() {
    return this.obstacles;
  }

  getChests() {
    return this.chests;
  }

  getTeleporter() {
    return this.teleporter;
  }

  getArenaSize() {
    return this.arenaSize;
  }

  // Generate a complete procedural stage
  generateStage(stage: Stage, runDifficultyMultiplier: number): {
    teleporterPosition: THREE.Vector3;
  } {
    // 1. Clear previous stage objects from scene
    this.clearPreviousStage();

    // 2. Set Up Ground
    const groundGeo = new THREE.CylinderGeometry(this.arenaSize, this.arenaSize, 4, 32);
    const groundMat = new THREE.MeshStandardMaterial({
      color: stage.groundColor,
      roughness: 0.9,
      metalness: 0.1,
      flatShading: true,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.position.y = -2; // top of cylinder is at y=0
    ground.receiveShadow = true;
    ground.name = 'ground';
    this.scene.add(ground);
    this.obstacles.push(ground);

    // 3. Add boundary cliffs or walls
    this.generateBoundaries(stage);

    // 4. Generate scenery/obstacles based on biome
    this.generateProps(stage);

    // 5. Generate Chests
    this.generateChests(runDifficultyMultiplier);

    // 6. Generate Teleporter at a far-away position
    const teleporterPos = this.generateTeleporter(stage);

    return {
      teleporterPosition: teleporterPos
    };
  }

  private clearPreviousStage() {
    // Remove obstacles
    this.obstacles.forEach(obj => {
      this.scene.remove(obj);
      // Recursively dispose geometry and materials
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (Array.isArray(child.material)) {
            child.material.forEach(m => m.dispose());
          } else {
            child.material.dispose();
          }
        }
      });
    });
    this.obstacles = [];

    // Remove chest meshes
    this.chests.forEach(chest => {
      this.scene.remove(chest.mesh);
      chest.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    });
    this.chests = [];

    // Remove teleporter
    if (this.teleporter) {
      this.scene.remove(this.teleporter.mesh);
      if (this.teleporter.zoneMesh) this.scene.remove(this.teleporter.zoneMesh);
      if (this.teleporter.portalMesh) this.scene.remove(this.teleporter.portalMesh);
      
      this.teleporter.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
      if (this.teleporter.zoneMesh) {
        this.teleporter.zoneMesh.geometry.dispose();
        (this.teleporter.zoneMesh.material as THREE.Material).dispose();
      }
      if (this.teleporter.portalMesh) {
        this.teleporter.portalMesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            child.material.dispose();
          }
        });
      }
      this.teleporter = null;
    }
  }

  private generateBoundaries(stage: Stage) {
    const wallHeight = 15;
    const count = 24;
    const radius = this.arenaSize - 2;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Stylized rock columns as barrier
      const scaleY = wallHeight + (Math.random() - 0.5) * 8;
      const scaleX = 12 + Math.random() * 8;
      const scaleZ = 12 + Math.random() * 8;

      const rockGeo = new THREE.DodecahedronGeometry(1, 1);
      const rockMat = new THREE.MeshStandardMaterial({
        color: this.darkenColor(stage.groundColor, 0.4),
        roughness: 0.95,
        flatShading: true
      });
      const rock = new THREE.Mesh(rockGeo, rockMat);
      
      rock.position.set(x, scaleY / 2 - 2, z);
      rock.scale.set(scaleX, scaleY, scaleZ);
      rock.castShadow = true;
      rock.receiveShadow = true;
      
      this.scene.add(rock);
      this.obstacles.push(rock);
    }
  }

  private generateProps(stage: Stage) {
    // Generate scattered boulders and props
    const propCount = 35;
    
    for (let i = 0; i < propCount; i++) {
      const distance = 15 + Math.random() * (this.arenaSize - 25);
      const angle = Math.random() * Math.PI * 2;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;

      if (stage.biome === 'forest') {
        // Pine tree: brown cylinder trunk + green cone foliage
        const treeGroup = new THREE.Group();
        treeGroup.position.set(x, 0, z);

        const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 3, 5);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9, flatShading: true });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 1.5;
        trunk.castShadow = true;
        treeGroup.add(trunk);

        const leafColor = Math.random() > 0.5 ? 0x15803d : 0x166534;
        const leafGeo = new THREE.ConeGeometry(3, 7, 5);
        const leafMat = new THREE.MeshStandardMaterial({ color: leafColor, roughness: 0.85, flatShading: true });
        const foliage = new THREE.Mesh(leafGeo, leafMat);
        foliage.position.y = 5.5;
        foliage.castShadow = true;
        treeGroup.add(foliage);

        this.scene.add(treeGroup);
        this.obstacles.push(treeGroup);
      } else if (stage.biome === 'ruins') {
        // Ancient ruin pillars: stone columns, some broken or tilted
        const pillarGroup = new THREE.Group();
        pillarGroup.position.set(x, 0, z);

        const height = 4 + Math.random() * 8;
        const pGeo = new THREE.CylinderGeometry(1.2, 1.4, height, 6);
        const pMat = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, roughness: 0.9, flatShading: true });
        const pillar = new THREE.Mesh(pGeo, pMat);
        pillar.position.y = height / 2;
        pillar.castShadow = true;
        pillar.receiveShadow = true;
        
        // Tilt slightly
        if (Math.random() > 0.6) {
          pillarGroup.rotation.z = (Math.random() - 0.5) * 0.4;
          pillarGroup.rotation.x = (Math.random() - 0.5) * 0.4;
        }
        
        pillarGroup.add(pillar);
        this.scene.add(pillarGroup);
        this.obstacles.push(pillarGroup);
      } else {
        // Wasteland: geometric crystal clusters
        const crystalGroup = new THREE.Group();
        crystalGroup.position.set(x, 0, z);

        const crystalCount = 1 + Math.floor(Math.random() * 3);
        for (let c = 0; c < crystalCount; c++) {
          const crystalGeo = new THREE.ConeGeometry(1, 4 + Math.random() * 4, 4);
          const crystalMat = new THREE.MeshStandardMaterial({
            color: 0xea580c, // Orange crystal
            roughness: 0.2,
            metalness: 0.8,
            flatShading: true,
            emissive: 0x431407,
          });
          const crystal = new THREE.Mesh(crystalGeo, crystalMat);
          crystal.position.set(
            (Math.random() - 0.5) * 1.5,
            1.5,
            (Math.random() - 0.5) * 1.5
          );
          crystal.rotation.x = (Math.random() - 0.5) * 0.5;
          crystal.rotation.z = (Math.random() - 0.5) * 0.5;
          crystal.rotation.y = Math.random() * Math.PI;
          crystal.castShadow = true;
          crystalGroup.add(crystal);
        }

        this.scene.add(crystalGroup);
        this.obstacles.push(crystalGroup);
      }
    }
  }

  private generateChests(difficultyMultiplier: number) {
    const chestCount = 10 + Math.floor(Math.random() * 6);
    
    // Scale chest prices by difficulty
    const commonCost = Math.floor(25 * difficultyMultiplier);
    const largeCost = Math.floor(50 * difficultyMultiplier);
    const rareCost = Math.floor(150 * difficultyMultiplier);

    for (let i = 0; i < chestCount; i++) {
      const distance = 10 + Math.random() * (this.arenaSize - 25);
      const angle = Math.random() * Math.PI * 2;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;

      // Determine chest type
      const rand = Math.random();
      let type: 'common' | 'large' | 'rare' = 'common';
      let cost = commonCost;
      let meshColor = 0x10b981; // Green for common chest

      if (rand < 0.12) {
        type = 'rare';
        cost = rareCost;
        meshColor = 0xf59e0b; // Gold for rare
      } else if (rand < 0.35) {
        type = 'large';
        cost = largeCost;
        meshColor = 0x3b82f6; // Blue for large
      }

      // 3D Chest representation
      const chestGroup = new THREE.Group();
      chestGroup.position.set(x, 0.4, z);

      // Bottom box
      const bottomGeo = new THREE.BoxGeometry(2.0, 0.8, 1.2);
      const bottomMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.8, flatShading: true });
      const bottom = new THREE.Mesh(bottomGeo, bottomMat);
      bottom.position.y = 0;
      bottom.castShadow = true;
      chestGroup.add(bottom);

      // Top box lid (hinged at the back)
      const lidGeo = new THREE.BoxGeometry(2.04, 0.5, 1.24);
      const lidMat = new THREE.MeshStandardMaterial({ color: meshColor, roughness: 0.5, flatShading: true });
      const lid = new THREE.Mesh(lidGeo, lidMat);
      lid.position.set(0, 0.5, 0);
      lid.name = 'lid';
      lid.castShadow = true;
      chestGroup.add(lid);

      // Lock indicator
      const lockGeo = new THREE.BoxGeometry(0.3, 0.3, 0.2);
      const lockMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3 });
      const lock = new THREE.Mesh(lockGeo, lockMat);
      lock.position.set(0, 0.2, 0.62);
      chestGroup.add(lock);

      // Glowing light source above chest
      const glowGeo = new THREE.SphereGeometry(0.1, 4, 4);
      const glowMat = new THREE.MeshBasicMaterial({ color: meshColor });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.set(0, 1.2, 0);
      chestGroup.add(glow);

      this.scene.add(chestGroup);

      this.chests.push({
        mesh: chestGroup,
        id: `chest_${i}_${Date.now()}_${Math.floor(Math.random()*1000)}`,
        type,
        cost,
        opened: false,
        position: new THREE.Vector3(x, 0, z)
      });
    }
  }

  private generateTeleporter(stage: Stage): THREE.Vector3 {
    // Generate far away from start point (0,0,0)
    const angle = Math.random() * Math.PI * 2;
    const distance = this.arenaSize - 22; // close to outer border
    const x = Math.cos(angle) * distance;
    const z = Math.sin(angle) * distance;

    const teleporterPos = new THREE.Vector3(x, 0, z);

    // 3D Obelisk group
    const teleGroup = new THREE.Group();
    teleGroup.position.copy(teleporterPos);

    // Base pedestal
    const baseGeo = new THREE.CylinderGeometry(6, 6.5, 1.5, 8);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9, flatShading: true });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.75;
    base.castShadow = true;
    base.receiveShadow = true;
    teleGroup.add(base);

    // Left and Right rotating horn towers
    const hornGeo = new THREE.ConeGeometry(1.5, 9, 5);
    const hornMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9, flatShading: true });
    
    const leftHorn = new THREE.Mesh(hornGeo, hornMat);
    leftHorn.position.set(-4, 4.5, 0);
    leftHorn.rotation.z = -0.25;
    leftHorn.castShadow = true;
    teleGroup.add(leftHorn);

    const rightHorn = new THREE.Mesh(hornGeo, hornMat);
    rightHorn.position.set(4, 4.5, 0);
    rightHorn.rotation.z = 0.25;
    rightHorn.castShadow = true;
    teleGroup.add(rightHorn);

    // Center glowing core (sphere)
    const coreGeo = new THREE.SphereGeometry(1.4, 8, 8);
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x1d4ed8,
      roughness: 0.1,
      metalness: 0.9,
      flatShading: true
    });
    const core = new THREE.Mesh(coreGeo, coreMat);
    core.position.set(0, 4.5, 0);
    core.name = 'core';
    teleGroup.add(core);

    // Add rotating rings
    const ringGeo = new THREE.TorusGeometry(2.5, 0.2, 8, 24);
    const ringMat = new THREE.MeshStandardMaterial({ color: 0xa1a1aa, roughness: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0, 4.5, 0);
    ring.name = 'ring';
    teleGroup.add(ring);

    this.scene.add(teleGroup);

    // Create the teleporter dome zone mesh (invisible at start, appears when active)
    const zoneRadius = 26;
    const zoneGeo = new THREE.SphereGeometry(zoneRadius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const zoneMat = new THREE.MeshBasicMaterial({
      color: 0xef4444,
      transparent: true,
      opacity: 0.05,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    const zoneMesh = new THREE.Mesh(zoneGeo, zoneMat);
    zoneMesh.position.copy(teleporterPos);
    zoneMesh.visible = false;
    this.scene.add(zoneMesh);

    this.teleporter = {
      mesh: teleGroup,
      activated: false,
      charged: false,
      chargeProgress: 0,
      position: teleporterPos,
      zoneRadius,
      zoneMesh,
      portalMesh: null,
      portalSpawned: false
    };

    return teleporterPos;
  }

  // Handle teleporter core rotation and portal creation
  updateTeleporterVisuals(deltaTime: number, playerPos: THREE.Vector3) {
    if (!this.teleporter) return;

    // Rotate core and ring
    const core = this.teleporter.mesh.getObjectByName('core') as THREE.Mesh;
    if (core) {
      core.rotation.y += deltaTime * 2.0;
      core.rotation.x += deltaTime * 1.0;
      
      // Pulse emission based on activation
      if (this.teleporter.activated && !this.teleporter.charged) {
        const pulse = 0.5 + Math.sin(Date.now() * 0.01) * 0.4;
        const mat = core.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(0xef4444);
        mat.color.setHex(0xf87171);
        mat.emissiveIntensity = pulse * 2.5;
      } else if (this.teleporter.charged) {
        // Safe green portal
        const mat = core.material as THREE.MeshStandardMaterial;
        mat.emissive.setHex(0x10b981);
        mat.color.setHex(0x34d399);
        mat.emissiveIntensity = 2.0;
      }
    }

    const ring = this.teleporter.mesh.getObjectByName('ring');
    if (ring) {
      ring.rotation.x += deltaTime * 0.5;
      ring.rotation.y += deltaTime * 1.5;
    }

    // Toggle zone mesh color depending on if player is inside
    if (this.teleporter.activated && !this.teleporter.charged && this.teleporter.zoneMesh) {
      this.teleporter.zoneMesh.visible = true;
      const dist = playerPos.distanceTo(this.teleporter.position);
      const isInside = dist <= this.teleporter.zoneRadius;
      
      const mat = this.teleporter.zoneMesh.material as THREE.MeshBasicMaterial;
      if (isInside) {
        mat.color.setHex(0x3b82f6); // Charging: blue dome
        mat.opacity = 0.08 + Math.sin(Date.now() * 0.005) * 0.02;
      } else {
        mat.color.setHex(0xef4444); // Not charging: red dome
        mat.opacity = 0.05;
      }
    } else if (this.teleporter.charged && this.teleporter.zoneMesh) {
      this.teleporter.zoneMesh.visible = false;
    }

    // Spawn green vortex portal when charged and boss is dead
    if (this.teleporter.charged && !this.teleporter.portalSpawned) {
      this.spawnPortal();
    }

    if (this.teleporter.portalMesh) {
      this.teleporter.portalMesh.rotation.y += deltaTime * 3.0;
      const swirl = this.teleporter.portalMesh.getObjectByName('swirl');
      if (swirl) swirl.rotation.z -= deltaTime * 4.0;
    }
  }

  private spawnPortal() {
    if (!this.teleporter) return;

    const portalGroup = new THREE.Group();
    portalGroup.position.copy(this.teleporter.position).add(new THREE.Vector3(0, 4.5, 0));

    // Outer ring
    const ringGeo = new THREE.TorusGeometry(3.0, 0.4, 8, 32);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0x059669,
      roughness: 0.2,
      metalness: 0.8,
      flatShading: true
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    portalGroup.add(ring);

    // Inner green swirl disc
    const discGeo = new THREE.CylinderGeometry(2.7, 2.7, 0.1, 16);
    discGeo.rotateX(Math.PI / 2);
    const discMat = new THREE.MeshBasicMaterial({
      color: 0x10b981,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide
    });
    const disc = new THREE.Mesh(discGeo, discMat);
    disc.name = 'swirl';
    portalGroup.add(disc);

    this.scene.add(portalGroup);
    this.teleporter.portalMesh = portalGroup;
    this.teleporter.portalSpawned = true;
  }

  // Open chest visual
  openChestVisual(chestId: string) {
    const chest = this.chests.find(c => c.id === chestId);
    if (chest && !chest.opened) {
      chest.opened = true;
      const lid = chest.mesh.getObjectByName('lid');
      if (lid) {
        // Rotate lid open (simulate transition by rotating around hinges at the back edge)
        lid.rotation.x = -Math.PI / 2.5;
        lid.position.set(0, 0.8, -0.4);
      }
    }
  }

  private darkenColor(color: number, factor: number): number {
    const r = ((color >> 16) & 255) * factor;
    const g = ((color >> 8) & 255) * factor;
    const b = (color & 255) * factor;
    return (Math.floor(r) << 16) + (Math.floor(g) << 8) + Math.floor(b);
  }
}
