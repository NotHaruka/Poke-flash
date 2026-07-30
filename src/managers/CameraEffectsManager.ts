import Phaser from 'phaser';

export class CameraEffectsManager {
  private static instance: CameraEffectsManager | null = null;
  private scene!: Phaser.Scene & any;

  private constructor() {}

  public static getInstance(): CameraEffectsManager {
    if (!CameraEffectsManager.instance) {
      CameraEffectsManager.instance = new CameraEffectsManager();
    }
    return CameraEffectsManager.instance;
  }

  public init(scene: Phaser.Scene & any): void {
    this.scene = scene;
  }

  /**
   * Triggers a screen shake.
   */
  public shake(duration: number = 200, intensity: number = 0.01): void {
    if (!this.scene || !this.scene.cameras || !this.scene.cameras.main) return;
    this.scene.cameras.main.shake(duration, intensity);
  }

  /**
   * Triggers a directional shake along a specific angle by offseting the camera.
   */
  public shakeDirectional(angle: number, duration: number = 150, intensity: number = 15): void {
    if (!this.scene || !this.scene.cameras || !this.scene.cameras.main) return;
    
    const dx = Math.cos(angle) * intensity;
    const dy = Math.sin(angle) * intensity;

    // Apply immediate offset impulse using GameScene's cameraImpulse variables
    if (typeof this.scene.cameraImpulseX === 'number') {
      this.scene.cameraImpulseX = dx;
      this.scene.cameraImpulseY = dy;
    } else {
      this.scene.cameras.main.scrollX += dx;
      this.scene.cameras.main.scrollY += dy;
    }
  }

  /**
   * Smoothly zooms the camera to a target scale.
   */
  public zoomTo(scale: number, duration: number = 1000, ease: string = 'Cubic.easeInOut'): void {
    if (!this.scene || !this.scene.tweens) return;
    
    this.scene.tweens.add({
      targets: this.scene.cameras.main,
      zoom: scale,
      duration: duration,
      ease: ease,
      overwrite: true
    });
  }

  /**
   * Triggers a frame-freeze / hitstop to emphasize weighty impact.
   */
  public triggerHitstop(durationMs: number): void {
    if (!this.scene) return;
    this.scene.hitstopDuration = Math.max(this.scene.hitstopDuration || 0, durationMs);
  }

  /**
   * Executes the camera effects for a grand boss death sequence.
   */
  public playDeathCinematic(bossX: number, bossY: number, onComplete?: () => void): void {
    if (!this.scene || !this.scene.cameras || !this.scene.cameras.main) return;

    const cam = this.scene.cameras.main;

    // Phase 1: Slow camera zoom in on the collapsing giant
    this.zoomTo(1.22, 1000, 'Cubic.easeInOut');

    // Pan camera directly to boss center
    cam.pan(bossX, bossY, 1000, 'Cubic.easeInOut');

    // Phase 2: Start small rumbling shake
    cam.shake(1200, 0.008);

    // After 1.2s, the core explodes
    this.scene.time.delayedCall(1200, () => {
      // Massive explosion shock shake
      cam.shake(1500, 0.035);
      cam.flash(400, 255, 100, 0, 0.8);

      // Phase 3: Slow zoom out to a wider lens to see the final arena collapse
      this.scene.time.delayedCall(400, () => {
        this.zoomTo(0.9, 1800, 'Quad.easeInOut');
        
        if (onComplete) {
          this.scene.time.delayedCall(1400, onComplete);
        }
      });
    });
  }
}
