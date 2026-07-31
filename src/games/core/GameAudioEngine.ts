export class GameAudioEngine {
  private static instance: GameAudioEngine | null = null;
  private ctx: AudioContext | null = null;
  private isMuted = false;
  private sfxVolume = 0.7;
  private musicVolume = 0.5;

  private currentBgmOscillators: OscillatorNode[] = [];
  private currentBgmGain: GainNode | null = null;
  private bgmInterval: number | null = null;

  private constructor() {
    this.sfxVolume = Number(localStorage.getItem('ftp-volume-sfx') ?? '0.7');
    this.musicVolume = Number(localStorage.getItem('ftp-volume-bgm') ?? '0.5');
    this.isMuted = localStorage.getItem('ftp-audio-muted') === 'true';
  }

  public static getInstance(): GameAudioEngine {
    if (!GameAudioEngine.instance) {
      GameAudioEngine.instance = new GameAudioEngine();
    }
    return GameAudioEngine.instance;
  }

  private getAudioContext(): AudioContext | null {
    if (!this.ctx) {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      } catch (e) {
        console.warn('[GameAudioEngine] Failed to create AudioContext', e);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public toggleMute(): boolean {
    this.isMuted = !this.isMuted;
    localStorage.setItem('ftp-audio-muted', String(this.isMuted));
    if (this.isMuted) {
      this.stopBGM();
    }
    return this.isMuted;
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    localStorage.setItem('ftp-audio-muted', String(this.isMuted));
    if (this.isMuted) {
      this.stopBGM();
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public setSFXVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    localStorage.setItem('ftp-volume-sfx', String(this.sfxVolume));
  }

  public setMusicVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, vol));
    localStorage.setItem('ftp-volume-bgm', String(this.musicVolume));
    if (this.currentBgmGain && this.ctx) {
      this.currentBgmGain.gain.setValueAtTime(this.isMuted ? 0 : this.musicVolume * 0.15, this.ctx.currentTime);
    }
  }

  public playSFX(key: string): void {
    if (this.isMuted || this.sfxVolume <= 0) return;
    const ctx = this.getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(this.sfxVolume, now);
    masterGain.connect(ctx.destination);

    try {
      switch (key) {
        case 'click':
        case 'tap': {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(480, now);
          osc.frequency.exponentialRampToValueAtTime(120, now + 0.04);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.3, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.04);
          break;
        }

        case 'select': {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(520, now);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.3, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.06);
          break;
        }

        case 'move':
        case 'step': {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(320, now);
          osc.frequency.exponentialRampToValueAtTime(180, now + 0.08);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.08);
          break;
        }

        case 'capture':
        case 'hit':
        case 'strike': {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(240, now);
          osc.frequency.exponentialRampToValueAtTime(60, now + 0.12);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.5, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.12);
          break;
        }

        case 'invalid':
        case 'error':
        case 'illegal': {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(140, now);
          osc.frequency.setValueAtTime(110, now + 0.08);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.4, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.18);
          break;
        }

        case 'check':
        case 'warning': {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          osc1.type = 'square';
          osc2.type = 'sawtooth';
          osc1.frequency.setValueAtTime(580, now);
          osc2.frequency.setValueAtTime(870, now + 0.07);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
          osc1.connect(masterGain);
          osc2.connect(masterGain);
          osc1.start(now);
          osc2.start(now + 0.07);
          osc1.stop(now + 0.22);
          osc2.stop(now + 0.22);
          break;
        }

        case 'score':
        case 'coin':
        case 'gold': {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(988, now); // B5
          osc.frequency.setValueAtTime(1318.5, now + 0.08); // E6
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.25);
          break;
        }

        case 'clear':
        case 'match':
        case 'line': {
          const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + idx * 0.05);
            g.gain.setValueAtTime(this.sfxVolume * 0.3, now + idx * 0.05);
            g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.05 + 0.2);
            osc.connect(g);
            g.connect(masterGain);
            osc.start(now + idx * 0.05);
            osc.stop(now + idx * 0.05 + 0.2);
          });
          break;
        }

        case 'flip':
        case 'swish': {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(300, now);
          osc.frequency.exponentialRampToValueAtTime(800, now + 0.07);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.25, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.07);
          break;
        }

        case 'mismatch': {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(220, now);
          osc.frequency.setValueAtTime(160, now + 0.08);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.2);
          break;
        }

        case 'drop':
        case 'pop': {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, now);
          osc.frequency.exponentialRampToValueAtTime(150, now + 0.09);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.4, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.09);
          break;
        }

        case 'laser':
        case 'shoot': {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(880, now);
          osc.frequency.exponentialRampToValueAtTime(110, now + 0.12);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.35, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.12);
          break;
        }

        case 'explosion':
        case 'boom': {
          const osc = ctx.createOscillator();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(120, now);
          osc.frequency.exponentialRampToValueAtTime(20, now + 0.3);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.6, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.3);
          break;
        }

        case 'win':
        case 'victory': {
          const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5]; // C5, E5, G5, C6, E6
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + idx * 0.09);
            g.gain.setValueAtTime(this.sfxVolume * 0.4, now + idx * 0.09);
            g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.09 + 0.35);
            osc.connect(g);
            g.connect(masterGain);
            osc.start(now + idx * 0.09);
            osc.stop(now + idx * 0.09 + 0.35);
          });
          break;
        }

        case 'lose':
        case 'gameover': {
          const notes = [440, 415.3, 392, 349.23]; // A4, Ab4, G4, F4
          notes.forEach((freq, idx) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(freq, now + idx * 0.12);
            g.gain.setValueAtTime(this.sfxVolume * 0.35, now + idx * 0.12);
            g.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.3);
            osc.connect(g);
            g.connect(masterGain);
            osc.start(now + idx * 0.12);
            osc.stop(now + idx * 0.12 + 0.3);
          });
          break;
        }

        default: {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, now);
          masterGain.gain.setValueAtTime(this.sfxVolume * 0.25, now);
          masterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
          osc.connect(masterGain);
          osc.start(now);
          osc.stop(now + 0.05);
          break;
        }
      }
    } catch (e) {
      console.warn('[GameAudioEngine] Error synthesizing SFX:', e);
    }
  }

  public playBGM(genreKey: string = 'chill'): void {
    if (this.isMuted || this.musicVolume <= 0) return;
    this.stopBGM();

    const ctx = this.getAudioContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      this.currentBgmGain = ctx.createGain();
      this.currentBgmGain.gain.setValueAtTime(this.musicVolume * 0.12, now);
      this.currentBgmGain.connect(ctx.destination);

      // Procedural ambient chord loop generator
      const scale = [261.63, 329.63, 392.00, 493.88, 523.25, 659.25]; // C Major 7th pentatonic notes
      let noteIndex = 0;

      const playChordStep = () => {
        if (!this.currentBgmGain || this.isMuted) return;
        const stepTime = ctx.currentTime;
        const rootFreq = scale[noteIndex % scale.length];
        const fifthFreq = scale[(noteIndex + 2) % scale.length];

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const stepGain = ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'triangle';
        osc1.frequency.setValueAtTime(rootFreq, stepTime);
        osc2.frequency.setValueAtTime(fifthFreq, stepTime);

        stepGain.gain.setValueAtTime(0.001, stepTime);
        stepGain.gain.linearRampToValueAtTime(0.2, stepTime + 0.4);
        stepGain.gain.exponentialRampToValueAtTime(0.001, stepTime + 2.4);

        osc1.connect(stepGain);
        osc2.connect(stepGain);
        stepGain.connect(this.currentBgmGain!);

        osc1.start(stepTime);
        osc2.start(stepTime);
        osc1.stop(stepTime + 2.5);
        osc2.stop(stepTime + 2.5);

        this.currentBgmOscillators.push(osc1, osc2);
        noteIndex = (noteIndex + 1) % scale.length;
      };

      playChordStep();
      this.bgmInterval = window.setInterval(playChordStep, 2600);
    } catch (e) {
      console.warn('[GameAudioEngine] Error playing procedural BGM:', e);
    }
  }

  public stopBGM(): void {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
    this.currentBgmOscillators.forEach(osc => {
      try { osc.stop(); } catch(e){}
    });
    this.currentBgmOscillators = [];
    this.currentBgmGain = null;
  }
}
