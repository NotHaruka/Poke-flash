import * as THREE from 'three';

export interface GameParticle {
  mesh: THREE.Mesh | THREE.Line;
  velocity: THREE.Vector3;
  gravity: number;
  life: number; // current life
  maxLife: number; // max life in seconds
  color: number;
  size: number;
  growth: number; // multiplier per frame
  type: 'spark' | 'smoke' | 'text' | 'heal' | 'slash' | 'bullet_trail' | 'ring';
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private particles: GameParticle[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  // Create a burst of explosion particles
  createExplosion(position: THREE.Vector3, color: number, count = 15, size = 0.4) {
    const geometry = new THREE.BoxGeometry(size, size, size);
    
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 0.9,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);
      
      // Random velocity
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 12,
        Math.random() * 8 + 3,
        (Math.random() - 0.5) * 12
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        gravity: 12,
        life: 0,
        maxLife: Math.random() * 0.6 + 0.4,
        color,
        size,
        growth: 0.95,
        type: 'spark'
      });
    }
  }

  // Create floating indicators (like heal cross or crit spark)
  createHealEffect(position: THREE.Vector3, count = 6) {
    const geometry = new THREE.BoxGeometry(0.15, 0.5, 0.15);
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: 0x10b981,
        transparent: true,
        opacity: 0.8
      });
      const mesh = new THREE.Mesh(geometry, material);
      
      // Offset position slightly around player
      mesh.position.copy(position).add(new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 2,
        (Math.random() - 0.5) * 2
      ));

      // Quick velocity straight up
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 1,
        Math.random() * 3 + 1,
        (Math.random() - 0.5) * 1
      );

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        gravity: -2, // drift upwards
        life: 0,
        maxLife: Math.random() * 0.4 + 0.3,
        color: 0x10b981,
        size: 0.3,
        growth: 0.92,
        type: 'heal'
      });
    }
  }

  // Bullet impact sparks
  createSparks(position: THREE.Vector3, normal: THREE.Vector3, color: number = 0xffffff, count = 8) {
    const geometry = new THREE.BoxGeometry(0.15, 0.15, 0.15);
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({
        color: color,
        transparent: true,
        opacity: 1.0
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.copy(position);

      // Bounce off in normal direction with slight spread
      const velocity = normal.clone().multiplyScalar(5).add(new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4,
        (Math.random() - 0.5) * 4
      ));

      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity,
        gravity: 8,
        life: 0,
        maxLife: Math.random() * 0.3 + 0.2,
        color,
        size: 0.15,
        growth: 0.9,
        type: 'spark'
      });
    }
  }

  // Create a trail for projectile
  createBulletTrail(start: THREE.Vector3, end: THREE.Vector3, color: number = 0xef4444, duration = 0.15) {
    const points = [start, end];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: color,
      transparent: true,
      opacity: 0.8,
      linewidth: 2 // may be capped by WebGL, but gives clear trail
    });
    const line = new THREE.Line(geometry, material);
    this.scene.add(line);

    this.particles.push({
      mesh: line,
      velocity: new THREE.Vector3(0, 0, 0),
      gravity: 0,
      life: 0,
      maxLife: duration,
      color,
      size: 1.0,
      growth: 1.0,
      type: 'bullet_trail'
    });
  }

  // Create expanding visual rings for slams or area attacks
  createVisualRing(position: THREE.Vector3, color: number, maxRadius = 10, duration = 0.5) {
    const geometry = new THREE.RingGeometry(0.1, 0.2, 32);
    const material = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.rotation.x = Math.PI / 2; // Flat on the ground
    
    this.scene.add(mesh);
    this.particles.push({
      mesh,
      velocity: new THREE.Vector3(0, 0, 0),
      gravity: 0,
      life: 0,
      maxLife: duration,
      color,
      size: 0.1, // Tracks scale
      growth: maxRadius / duration, // scaling speed
      type: 'ring'
    });
  }

  // Update loop
  update(deltaTime: number) {
    const aliveParticles: GameParticle[] = [];

    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      p.life += deltaTime;

      if (p.life >= p.maxLife) {
        // Destroy Three.js mesh
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        if (Array.isArray(p.mesh.material)) {
          p.mesh.material.forEach(m => m.dispose());
        } else {
          p.mesh.material.dispose();
        }
      } else {
        // Update physics
        p.velocity.y -= p.gravity * deltaTime;
        p.mesh.position.addScaledVector(p.velocity, deltaTime);

        // Update visuals based on type
        const ratio = 1 - (p.life / p.maxLife);
        
        if (p.type === 'spark' || p.type === 'heal') {
          p.mesh.scale.multiplyScalar(p.growth);
          if (p.mesh.material && !Array.isArray(p.mesh.material)) {
            p.mesh.material.opacity = ratio;
          }
        } else if (p.type === 'bullet_trail') {
          if (p.mesh.material && !Array.isArray(p.mesh.material)) {
            p.mesh.material.opacity = ratio;
          }
        } else if (p.type === 'ring') {
          // Grow ring size
          const newScale = p.mesh.scale.x + p.growth * deltaTime;
          p.mesh.scale.set(newScale, newScale, 1);
          if (p.mesh.material && !Array.isArray(p.mesh.material)) {
            p.mesh.material.opacity = ratio;
          }
        }

        aliveParticles.push(p);
      }
    }

    this.particles = aliveParticles;
  }

  // Wipe all remaining particles on stage change/game over
  clearAll() {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      if (Array.isArray(p.mesh.material)) {
        p.mesh.material.forEach(m => m.dispose());
      } else {
        p.mesh.material.dispose();
      }
    }
    this.particles = [];
  }
}
