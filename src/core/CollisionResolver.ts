import { BaseEntity } from '../entities/BaseEntity.js';
import { PhysicsComponent } from '../entities/PhysicsComponent.js';

export interface DebugContact {
  x: number;
  y: number;
  nx: number;
  ny: number;
  overlap: number;
}

export class CollisionResolver {
  private static instance: CollisionResolver | null = null;
  public debugContacts: DebugContact[] = [];

  private constructor() {}

  public static getInstance(): CollisionResolver {
    if (!CollisionResolver.instance) {
      CollisionResolver.instance = new CollisionResolver();
    }
    return CollisionResolver.instance;
  }

  /**
   * Resolves soft collisions and separation between player, enemies, and enemy-enemy.
   */
  public resolve(player: BaseEntity, enemies: BaseEntity[], dt: number, isDebugMode: boolean, isPlayerIntangible: boolean = false): void {
    if (isDebugMode) {
      this.debugContacts = [];
    }

    const playerPhysics = player.getComponent<PhysicsComponent>('physics');
    if (!playerPhysics || !player.active) return;

    // 1. Resolve Player vs. Enemy soft collisions
    if (!isPlayerIntangible) {
      for (let i = 0; i < enemies.length; i++) {
        const enemy = enemies[i];
        if (!enemy.active) continue;

        const enemyPhysics = enemy.getComponent<PhysicsComponent>('physics');
        if (!enemyPhysics) continue;

        // Skip dead enemies
        const currentState = enemy.getComponent<any>('ai')?.getCurrentState();
        const isDead = currentState === 'DEFEATED' || currentState === 'DEAD';
        if (isDead) continue;

        this.resolvePair(player, playerPhysics, enemy, enemyPhysics, dt, isDebugMode);
      }
    }

    // 2. Resolve Enemy vs. Enemy separation (optimized pairwise checks with squared distance)
    const activeEnemies: BaseEntity[] = [];
    const activePhysics: PhysicsComponent[] = [];
    for (let i = 0; i < enemies.length; i++) {
      const enemy = enemies[i];
      if (!enemy.active) continue;
      
      const currentState = enemy.getComponent<any>('ai')?.getCurrentState();
      const isDead = currentState === 'DEFEATED' || currentState === 'DEAD';
      if (isDead) continue;

      const physics = enemy.getComponent<PhysicsComponent>('physics');
      if (physics) {
        activeEnemies.push(enemy);
        activePhysics.push(physics);
      }
    }

    const numActive = activeEnemies.length;
    for (let i = 0; i < numActive; i++) {
      const enemyA = activeEnemies[i];
      const physicsA = activePhysics[i];
      const rA = physicsA.collisionRadius;

      for (let j = i + 1; j < numActive; j++) {
        const enemyB = activeEnemies[j];
        const physicsB = activePhysics[j];
        const rB = physicsB.collisionRadius;

        const dx = enemyB.x - enemyA.x;
        const dy = enemyB.y - enemyA.y;
        const distSq = dx * dx + dy * dy;
        const rSum = rA + rB;
        const rSumSq = rSum * rSum;

        if (distSq < rSumSq) {
          // Resolve soft separation
          let dist = Math.sqrt(distSq);
          let nx = 0;
          let ny = 0;
          
          if (dist < 0.1) {
            const angle = Math.random() * Math.PI * 2;
            nx = Math.cos(angle);
            ny = Math.sin(angle);
            dist = 0.1;
          } else {
            nx = dx / dist;
            ny = dy / dist;
          }

          const overlap = rSum - dist;

          // Soft push scaling by delta time to keep frame rate independent
          const pushFactor = 8.0; // Moderate force for enemy-enemy separation to prevent excessive blobs while keeping chasing aggressive
          const correction = overlap * Math.min(1.0, pushFactor * dt);

          const totalWeight = physicsA.weight + physicsB.weight;
          const ratioA = physicsB.weight / totalWeight;
          const ratioB = physicsA.weight / totalWeight;

          enemyA.x -= nx * correction * ratioA;
          enemyA.y -= ny * correction * ratioA;
          enemyB.x += nx * correction * ratioB;
          enemyB.y += ny * correction * ratioB;

          if (isDebugMode) {
            this.debugContacts.push({
              x: enemyA.x + nx * (rA - overlap / 2),
              y: enemyA.y + ny * (rA - overlap / 2),
              nx,
              ny,
              overlap
            });
          }
        }
      }
    }

    // 3. Final Boundary Clamping & Sprite Synced for all resolved entities
    playerPhysics.clampAndSync();
    for (let i = 0; i < numActive; i++) {
      activePhysics[i].clampAndSync();
    }
  }

  private resolvePair(
    entityA: BaseEntity,
    physicsA: PhysicsComponent,
    entityB: BaseEntity,
    physicsB: PhysicsComponent,
    dt: number,
    isDebugMode: boolean
  ): void {
    const rA = physicsA.collisionRadius;
    const rB = physicsB.collisionRadius;

    const dx = entityB.x - entityA.x;
    const dy = entityB.y - entityA.y;
    const distSq = dx * dx + dy * dy;
    const rSum = rA + rB;

    if (distSq < rSum * rSum) {
      let dist = Math.sqrt(distSq);
      let nx = 0;
      let ny = 0;

      if (dist < 0.1) {
        // Perfectly overlapping, choose a random direction to push apart
        const angle = Math.random() * Math.PI * 2;
        nx = Math.cos(angle);
        ny = Math.sin(angle);
        dist = 0.1;
      } else {
        nx = dx / dist;
        ny = dy / dist;
      }

      const overlap = rSum - dist;

      // Higher push factor for player-enemy collisions to feel solid and completely prevent overlap cheese
      const pushFactor = 16.0; 
      const correction = overlap * Math.min(1.0, pushFactor * dt);

      const weightA = physicsA.weight;
      const weightB = entityB.id.includes('boss') ? 35.0 : physicsB.weight; // Cap boss weight so they don't permanently pin the player against boundaries
      
      const totalWeight = weightA + weightB;
      const ratioA = weightB / totalWeight;
      const ratioB = weightA / totalWeight;

      entityA.x -= nx * correction * ratioA;
      entityA.y -= ny * correction * ratioA;
      entityB.x += nx * correction * ratioB;
      entityB.y += ny * correction * ratioB;

      if (isDebugMode) {
        this.debugContacts.push({
          x: entityA.x + nx * (rA - overlap / 2),
          y: entityA.y + ny * (rA - overlap / 2),
          nx,
          ny,
          overlap
        });
      }
    }
  }
}
