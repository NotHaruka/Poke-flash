import Phaser from 'phaser';

export class VFXManager {
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public spawnSparks(x: number, y: number, color: number, count: number = 6): void {
    for (let i = 0; i < count; i++) {
      const p = this.scene.add.graphics();
      p.fillStyle(color, 0.9);
      p.fillCircle(0, 0, Phaser.Math.Between(3, 6));
      p.setPosition(x, y);

      const vx = Phaser.Math.Between(-150, 150);
      const vy = Phaser.Math.Between(-150, 150);

      this.scene.tweens.add({
        targets: p,
        x: x + vx * 0.5,
        y: y + vy * 0.5,
        alpha: 0,
        scale: 0.1,
        duration: Phaser.Math.Between(250, 500),
        onComplete: () => p.destroy()
      });
    }
  }

  public createDamageText(x: number, y: number, amount: number, isCrit: boolean): void {
    const text = this.scene.add.text(x, y, isCrit ? `${amount} CRIT!` : `${amount}`, {
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: isCrit ? '22px' : '18px',
      color: isCrit ? '#ffcc00' : '#ffffff', // Match golden crit
      fontStyle: 'bold',
      stroke: '#000000',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Randomize slight horizontal drift
    const driftX = Phaser.Math.Between(-20, 20);

    this.scene.tweens.add({
      targets: text,
      y: y - (isCrit ? 60 : 45),
      x: x + driftX,
      alpha: 0,
      scale: isCrit ? 1.5 : 1.0,
      duration: isCrit ? 800 : 600,
      ease: 'Back.easeOut',
      onComplete: () => text.destroy()
    });
  }

  public createFloatingXPText(x: number, y: number, msg: string, color: string, fontSize: number = 10): void {
    const textObj = this.scene.add.text(x, y, msg, {
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: `${fontSize}px`,
      color: color,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: textObj,
      y: y - 24,
      alpha: 0,
      duration: 1000,
      ease: 'Sine.easeOut',
      onComplete: () => textObj.destroy()
    });
  }

  public addFloatingWorldText(x: number, y: number, msg: string, colorHex: string): void {
    const text = this.scene.add.text(x, y, msg, {
      fontFamily: '"Space Grotesk", sans-serif',
      fontSize: '14px',
      color: colorHex,
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.scene.tweens.add({
      targets: text,
      y: y - 16,
      duration: 1800,
      ease: 'Sine.easeOut',
      alpha: 0.8,
      onComplete: () => text.destroy()
    });
  }
}
