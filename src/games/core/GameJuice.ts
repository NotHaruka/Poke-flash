import { GameAudioEngine } from './GameAudioEngine';

export interface JuiceParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  decay: number;
  size: number;
  color: string;
  shape: 'circle' | 'square' | 'spark' | 'star' | 'dust';
  gravity?: number;
  friction?: number;
  rotation?: number;
  rotSpeed?: number;
  bounce?: boolean;
}

export interface JuiceFloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  vx: number;
  vy: number;
  alpha: number;
  scale: number;
  targetScale: number;
  color: string;
  glowColor?: string;
  font?: string;
  lifespan: number;
  age: number;
  springVelocity?: number;
}

export class GameJuice {
  private particles: JuiceParticle[] = [];
  private floatingTexts: JuiceFloatingText[] = [];
  
  // Camera shake state
  private shakeIntensity = 0;
  private shakeDecay = 0.9;
  private shakeX = 0;
  private shakeY = 0;

  // Camera zoom state
  private zoomScale = 1.0;
  private zoomTarget = 1.0;
  private zoomSpring = 0.15;
  private zoomVelocity = 0;

  // Countdown state
  private countdownValue: string | null = null;
  private countdownScale = 0;
  private countdownAlpha = 0;
  private countdownCallback: (() => void) | null = null;
  private countdownTimer: any = null;

  constructor() {}

  /**
   * Reset all effects, particles, and shake.
   */
  public reset(): void {
    this.particles = [];
    this.floatingTexts = [];
    this.shakeIntensity = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.zoomScale = 1.0;
    this.zoomTarget = 1.0;
    this.zoomVelocity = 0;
    this.countdownValue = null;
    if (this.countdownTimer) {
      clearTimeout(this.countdownTimer);
      this.countdownTimer = null;
    }
  }

  /**
   * Trigger screen shake.
   */
  public shake(intensity: number = 8, decay: number = 0.88): void {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDecay = decay;
  }

  /**
   * Trigger a bouncy zoom effect.
   */
  public bounceZoom(scale: number = 1.08): void {
    this.zoomScale = scale;
  }

  /**
   * Add a customized floating score or text feedback.
   */
  public spawnText(
    x: number,
    y: number,
    text: string,
    options: {
      color?: string;
      glowColor?: string;
      fontSize?: number;
      fontFamily?: string;
      driftY?: number;
      driftX?: number;
      scale?: number;
    } = {}
  ): void {
    const driftY = options.driftY ?? -1.8;
    const driftX = options.driftX ?? (Math.random() - 0.5) * 1.5;
    const color = options.color ?? '#ffffff';
    const font = `bold ${options.fontSize ?? 18}px "${options.fontFamily ?? 'Space Grotesk'}", sans-serif`;

    this.floatingTexts.push({
      id: Math.random().toString(),
      x,
      y,
      text,
      vx: driftX,
      vy: driftY,
      alpha: 1.0,
      scale: 0.1,
      targetScale: options.scale ?? 1.2,
      color,
      glowColor: options.glowColor ?? 'rgba(0, 0, 0, 0.65)',
      font,
      lifespan: 45, // frames (~0.75s)
      age: 0,
      springVelocity: 0,
    });
  }

  /**
   * Helper to spawn floating score text (e.g. "+100").
   */
  public spawnFloatingScore(x: number, y: number, score: number | string, color = '#f59e0b'): void {
    const text = typeof score === 'number' && score >= 0 ? `+${score}` : `${score}`;
    this.spawnText(x, y, text, { color, fontSize: 18, driftY: -2.0 });
  }

  /**
   * Spawn explosion or burst particles.
   */
  public spawnExplosion(
    cx: number,
    cy: number,
    options: {
      count?: number;
      color?: string | string[];
      sizeRange?: [number, number];
      speedRange?: [number, number];
      shape?: JuiceParticle['shape'];
      gravity?: number;
      friction?: number;
    } = {}
  ): void {
    const count = options.count ?? 16;
    const colors = Array.isArray(options.color)
      ? options.color
      : [options.color ?? '#ffd700', '#ff8c00', '#ff4500', '#ffffff'];
    const sizeRange = options.sizeRange ?? [2, 6];
    const speedRange = options.speedRange ?? [2, 7];
    const shape = options.shape ?? 'circle';
    const gravity = options.gravity ?? 0.05;
    const friction = options.friction ?? 0.96;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);
      const size = sizeRange[0] + Math.random() * (sizeRange[1] - sizeRange[0]);
      const color = colors[Math.floor(Math.random() * colors.length)];

      this.particles.push({
        x: cx,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1.0,
        decay: 0.015 + Math.random() * 0.02,
        size,
        color,
        shape,
        gravity,
        friction,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.15,
      });
    }
  }

  /**
   * Spawn confetti fountain.
   */
  public spawnConfetti(width: number, height: number): void {
    const colors = ['#f43f5e', '#3b82f6', '#10b981', '#eab308', '#a855f7', '#f97316'];
    for (let i = 0; i < 40; i++) {
      const isLeft = Math.random() > 0.5;
      const x = isLeft ? 10 : width - 10;
      const y = height * 0.85;
      const angle = isLeft ? -Math.PI * 0.25 - Math.random() * 0.25 : -Math.PI * 0.75 + Math.random() * 0.25;
      const speed = 7 + Math.random() * 8;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        alpha: 1.0,
        decay: 0.01 + Math.random() * 0.01,
        size: 5 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        shape: 'square',
        gravity: 0.12,
        friction: 0.98,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
      });
    }
  }

  /**
   * Spawn a trail particle.
   */
  public spawnTrail(x: number, y: number, color: string, size = 4): void {
    this.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.5,
      vy: (Math.random() - 0.5) * 0.5,
      alpha: 0.6,
      decay: 0.03,
      size,
      color,
      shape: 'circle',
      gravity: 0,
      friction: 1.0,
    });
  }

  /**
   * Start a countdown sequence: "3", "2", "1", "GO!"
   */
  public startCountdown(onComplete: () => void): void {
    if (this.countdownTimer) clearTimeout(this.countdownTimer);
    this.countdownCallback = onComplete;
    
    const triggerStep = (text: string, nextStep: () => void) => {
      this.countdownValue = text;
      this.countdownScale = 0.2;
      this.countdownAlpha = 1.0;
      this.playSynthAlert(text === 'GO!' ? 'high' : 'low');

      this.countdownTimer = setTimeout(nextStep, 750);
    };

    triggerStep('3', () => {
      triggerStep('2', () => {
        triggerStep('1', () => {
          triggerStep('GO!', () => {
            this.countdownValue = null;
            if (this.countdownCallback) this.countdownCallback();
          });
        });
      });
    });
  }

  private maxParticles = 100;
  private maxFloatingTexts = 15;

  private playSynthAlert(type: 'low' | 'high'): void {
    try {
      GameAudioEngine.getInstance().playSFX(type === 'high' ? 'win' : 'select');
    } catch (e) {}
  }

  /**
   * Update the juice calculations (particles, text physics, screen shake, zoom spring).
   */
  public update(dt = 1): void {
    // Cap maximum active particles & texts to prevent memory accumulation and rendering lag
    if (this.particles.length > this.maxParticles) {
      this.particles.splice(0, this.particles.length - this.maxParticles);
    }
    if (this.floatingTexts.length > this.maxFloatingTexts) {
      this.floatingTexts.splice(0, this.floatingTexts.length - this.maxFloatingTexts);
    }

    // 1. Process screen shake decay
    if (this.shakeIntensity > 0.1) {
      this.shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeY = (Math.random() - 0.5) * this.shakeIntensity;
      this.shakeIntensity *= this.shakeDecay;
    } else {
      this.shakeX = 0;
      this.shakeY = 0;
      this.shakeIntensity = 0;
    }

    // 2. Zoom spring physics
    const springForce = (this.zoomTarget - this.zoomScale) * this.zoomSpring;
    this.zoomVelocity += springForce;
    this.zoomVelocity *= 0.82; // damping
    this.zoomScale += this.zoomVelocity;

    // 3. Update particles
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      if (p.gravity) p.vy += p.gravity * dt;
      if (p.friction) {
        p.vx *= Math.pow(p.friction, dt);
        p.vy *= Math.pow(p.friction, dt);
      }
      
      if (p.rotation !== undefined && p.rotSpeed !== undefined) {
        p.rotation += p.rotSpeed * dt;
      }

      p.alpha -= p.decay * dt;

      if (p.alpha <= 0 || p.size <= 0.1) {
        this.particles.splice(i, 1);
      }
    }

    // 4. Update floating texts (spring scaling + fade)
    for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
      const t = this.floatingTexts[i];
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      
      // Scale-spring dynamics
      if (t.springVelocity !== undefined) {
        const force = (t.targetScale - t.scale) * 0.25;
        t.springVelocity += force;
        t.springVelocity *= 0.75;
        t.scale += t.springVelocity;
      }

      t.age += dt;
      if (t.age > t.lifespan * 0.6) {
        t.alpha -= 0.05 * dt;
      }

      if (t.age >= t.lifespan || t.alpha <= 0) {
        this.floatingTexts.splice(i, 1);
      }
    }

    // 5. Update Countdown visual growth
    if (this.countdownValue) {
      const scaleForce = (1.5 - this.countdownScale) * 0.2;
      this.countdownScale += scaleForce;
      this.countdownAlpha = Math.max(0, this.countdownAlpha - 0.02 * dt);
    }
  }

  /**
   * Apply screen shakes and zoom scaling transforms on the context.
   */
  public applyCameraTransforms(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.save();
    
    // Screen shake
    if (this.shakeX !== 0 || this.shakeY !== 0) {
      ctx.translate(this.shakeX, this.shakeY);
    }

    // Zoom around center
    if (Math.abs(this.zoomScale - 1.0) > 0.001) {
      ctx.translate(width / 2, height / 2);
      ctx.scale(this.zoomScale, this.zoomScale);
      ctx.translate(-width / 2, -height / 2);
    }
  }

  /**
   * Restore the canvas state from applyCameraTransforms.
   */
  public restoreCameraTransforms(ctx: CanvasRenderingContext2D): void {
    ctx.restore();
  }

  /**
   * Draw particles, texts, and countdown on top.
   */
  public draw(ctx: CanvasRenderingContext2D): void {
    ctx.save();

    // Render particles
    ctx.save();
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;

      if (p.shape === 'circle' || p.shape === 'dust') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === 'square') {
        if (p.rotation) {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rotation);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        } else {
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      } else if (p.shape === 'spark') {
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5);
        ctx.stroke();
      } else if (p.shape === 'star') {
        ctx.save();
        ctx.translate(p.x, p.y);
        if (p.rotation !== undefined) ctx.rotate(p.rotation);
        this.drawStar(ctx, 0, 0, 5, p.size, p.size / 2);
        ctx.restore();
      }
    }
    ctx.restore();

    // Render floating texts
    for (const t of this.floatingTexts) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, t.alpha));
      ctx.translate(t.x, t.y);
      ctx.scale(t.scale, t.scale);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = t.font ?? 'bold 16px "Space Grotesk", sans-serif';

      // Text glow/shadow outline
      if (t.glowColor) {
        ctx.shadowBlur = 4;
        ctx.shadowColor = t.glowColor;
        ctx.fillStyle = t.glowColor;
        ctx.fillText(t.text, 1.5, 1.5);
        ctx.fillText(t.text, -1.5, -1.5);
      }

      ctx.shadowBlur = 0;
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, 0, 0);

      ctx.restore();
    }

    // Render Countdown Overlay
    if (this.countdownValue && this.countdownAlpha > 0) {
      ctx.save();
      ctx.resetTransform();
      ctx.globalAlpha = Math.max(0, Math.min(1, this.countdownAlpha));
      
      const cx = ctx.canvas.width / 2;
      const cy = ctx.canvas.height / 2;

      ctx.translate(cx, cy);
      ctx.scale(this.countdownScale, this.countdownScale);

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'black 64px "Space Grotesk", sans-serif';

      // Neon shadow glow
      ctx.shadowBlur = 15;
      ctx.shadowColor = 'var(--accent, #ffd700)';

      ctx.fillStyle = 'var(--accent, #ffd700)';
      ctx.fillText(this.countdownValue, 0, 0);

      ctx.restore();
    }

    ctx.restore();
  }

  private drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, spikes: number, outerRadius: number, innerRadius: number): void {
    let rot = (Math.PI / 2) * 3;
    let x = cx;
    let y = cy;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(cx, cy - outerRadius);
    for (let i = 0; i < spikes; i++) {
      x = cx + Math.cos(rot) * outerRadius;
      y = cy + Math.sin(rot) * outerRadius;
      ctx.lineTo(x, y);
      rot += step;

      x = cx + Math.cos(rot) * innerRadius;
      y = cy + Math.sin(rot) * innerRadius;
      ctx.lineTo(x, y);
      rot += step;
    }
    ctx.lineTo(cx, cy - outerRadius);
    ctx.closePath();
    ctx.fill();
  }
}
