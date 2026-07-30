export interface Note {
  id: string;
  time: number;       // Trigger time in seconds
  lane: number;       // Lane index: 0, 1, 2, 3
  type: 'tap' | 'hold' | 'flick';
  duration?: number;  // For hold notes
  hit?: boolean;
  released?: boolean; // For hold note release
}

export interface Song {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  bpm: number;
  difficulty: {
    easy: Note[];
    normal: Note[];
    hard: Note[];
  };
}

export class RhythmGameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private audio: HTMLAudioElement | null = null;
  private animationFrameId: number | null = null;
  private isPlaying = false;
  private isPaused = false;

  // Game Settings
  private noteSpeed = 5.0; // falling speed multiplier
  private offset = 0;      // calibration offset in ms
  private difficulty: 'easy' | 'normal' | 'hard' = 'normal';

  // Game State
  private notes: Note[] = [];
  private score = 0;
  private combo = 0;
  private maxCombo = 0;
  private accuracy = 100;
  private totalNotesPlayed = 0;
  private totalPerfect = 0;
  private totalGreat = 0;
  private totalGood = 0;
  private totalMiss = 0;
  private health = 100;

  // Active Hold Tracking
  private activeHolds: Record<number, Note | null> = { 0: null, 1: null, 2: null, 3: null };

  // Hit Feedback State
  private lastFeedbackText = '';
  private lastFeedbackColor = '';
  private feedbackTimer = 0;
  private hitRipples: Array<{ lane: number; time: number; color: string; size: number }> = [];

  // Audio Context for perfect sync if needed
  private startTime = 0;
  private songDuration = 0;

  // Audio track paths
  private currentSong: Song;

  // Controls & Callbacks
  private onGameOverCallback: (score: number, accuracy: number, maxCombo: number, perfects: number, misses: number) => void;
  private onVictoryCallback: (score: number, accuracy: number, maxCombo: number, perfects: number, misses: number) => void;
  private onTimeUpdateCallback: (current: number, total: number) => void;

  constructor(
    canvas: HTMLCanvasElement,
    song: Song,
    options: {
      difficulty: 'easy' | 'normal' | 'hard';
      noteSpeed: number;
      offset: number;
      onGameOver: (score: number, accuracy: number, maxCombo: number, perfects: number, misses: number) => void;
      onVictory: (score: number, accuracy: number, maxCombo: number, perfects: number, misses: number) => void;
      onTimeUpdate?: (current: number, total: number) => void;
    }
  ) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get Canvas 2D context.');
    this.ctx = context;
    
    this.currentSong = song;
    this.difficulty = options.difficulty;
    this.noteSpeed = options.noteSpeed;
    this.offset = options.offset;
    this.onGameOverCallback = options.onGameOver;
    this.onVictoryCallback = options.onVictory;
    this.onTimeUpdateCallback = options.onTimeUpdate || (() => {});

    this.notes = JSON.parse(JSON.stringify(song.difficulty[this.difficulty]));
    this.initAudio();
  }

  private initAudio() {
    const url = this.currentSong.audioUrl;
    this.audio = new Audio(url);
    this.audio.volume = 0.5;

    this.audio.addEventListener('loadedmetadata', () => {
      if (this.audio) {
        this.songDuration = this.audio.duration;
      }
    });

    let hasRetried = false;
    this.audio.addEventListener('error', (e) => {
      if (!hasRetried && this.audio && url.startsWith('/')) {
        hasRetried = true;
        const fallbackUrl = url.substring(1); // strip leading slash
        console.warn(`Audio element failed to load at absolute URL "${url}". Trying relative path fallback: "${fallbackUrl}"`, e);
        this.audio.src = fallbackUrl;
        this.audio.load();
      } else {
        console.error("Audio element failed to load or play entirely. Using procedural fallback.", e);
        if (!this.songDuration) {
          this.songDuration = 110; // 1m 50s default fallback duration
        }
      }
    });

    this.audio.addEventListener('ended', () => {
      this.handleSongComplete();
    });
  }

  public setVolume(volume: number) {
    if (this.audio) {
      this.audio.volume = Math.max(0, Math.min(1, volume));
    }
  }

  public setNoteSpeed(speed: number) {
    this.noteSpeed = Math.max(1, Math.min(15, speed));
  }

  public setOffset(offsetMs: number) {
    this.offset = offsetMs;
  }

  public start() {
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.isPaused = false;
    this.health = 100;
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.accuracy = 100;
    this.totalNotesPlayed = 0;
    this.totalPerfect = 0;
    this.totalGreat = 0;
    this.totalGood = 0;
    this.totalMiss = 0;
    
    this.notes = JSON.parse(JSON.stringify(this.currentSong.difficulty[this.difficulty]));

    if (this.audio) {
      this.audio.currentTime = 0;
      this.audio.play().then(() => {
        this.startTime = performance.now();
        this.tick();
      }).catch(err => {
        console.error("Audio playback failed, attempting manual play on next touch:", err);
        // Fallback tick
        this.startTime = performance.now();
        this.tick();
      });
    }
  }

  public pause() {
    if (!this.isPlaying || this.isPaused) return;
    this.isPaused = true;
    if (this.audio) {
      this.audio.pause();
    }
  }

  public resume() {
    if (!this.isPlaying || !this.isPaused) return;
    this.isPaused = false;
    if (this.audio) {
      this.audio.play().catch(console.error);
    }
    this.tick();
  }

  public destroy() {
    this.isPlaying = false;
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
    if (this.audio) {
      this.audio.pause();
      this.audio.removeAttribute('src');
      this.audio.load();
      this.audio = null;
    }
  }

  private getCurrentTime(): number {
    if (this.audio && !this.audio.paused) {
      // Precise audio-synced time accounting for latency offset
      return this.audio.currentTime + (this.offset / 1000);
    }
    return (performance.now() - this.startTime) / 1000 + (this.offset / 1000);
  }

  private tick = () => {
    if (!this.isPlaying) return;
    
    if (!this.isPaused) {
      const time = this.getCurrentTime();
      const duration = this.songDuration || 110;
      this.onTimeUpdateCallback(time, duration);

      if (time >= duration) {
        this.handleSongComplete();
        return;
      }

      this.update(time);
      this.render(time);
    }

    this.animationFrameId = requestAnimationFrame(this.tick);
  };

  private update(time: number) {
    // Process missed notes that are past the judgment window
    const missThreshold = time - 0.15; // 150ms threshold
    for (const note of this.notes) {
      if (!note.hit) {
        if (note.type === 'hold') {
          const endTime = note.time + (note.duration || 0);
          if (endTime < missThreshold && !note.released) {
            note.hit = true;
            note.released = true;
            this.triggerMiss();
          }
        } else {
          if (note.time < missThreshold) {
            note.hit = true;
            this.triggerMiss();
          }
        }
      }
    }

    // Update Hit Ripples
    this.hitRipples = this.hitRipples.filter(ripple => {
      ripple.size += 4;
      return performance.now() - ripple.time < 300; // ripple lasts 300ms
    });

    if (this.feedbackTimer > 0) {
      this.feedbackTimer -= 16; // rough ms tick
    }

    // Health limit check
    if (this.health <= 0) {
      this.isPlaying = false;
      this.audio?.pause();
      this.onGameOverCallback(this.score, this.accuracy, this.maxCombo, this.totalPerfect, this.totalMiss);
    }
  }

  private render(time: number) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    this.ctx.clearRect(0, 0, width, height);

    // Draw background grid lines (cyber style)
    this.ctx.fillStyle = '#060515';
    this.ctx.fillRect(0, 0, width, height);

    // Perspective / grid lines
    const laneWidth = width / 4;
    this.ctx.strokeStyle = '#1e1b4b';
    this.ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) {
      const lx = i * laneWidth;
      this.ctx.beginPath();
      this.ctx.moveTo(lx, 0);
      this.ctx.lineTo(lx, height);
      this.ctx.stroke();
    }

    // Draw Judgement Bar (Critical line at 85% of height)
    const judgeY = height * 0.85;
    this.ctx.strokeStyle = '#10b981';
    this.ctx.lineWidth = 4;
    this.ctx.beginPath();
    this.ctx.moveTo(0, judgeY);
    this.ctx.lineTo(width, judgeY);
    this.ctx.stroke();

    // Subtle guide letters above judgment zones
    const keys = ['D', 'F', 'J', 'K'];
    this.ctx.font = 'bold 14px "DM Mono", monospace';
    this.ctx.textAlign = 'center';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    for (let i = 0; i < 4; i++) {
      this.ctx.fillText(keys[i], i * laneWidth + laneWidth / 2, judgeY + 30);
    }

    // Draw Lane Touch Indicators if clicked/held
    for (let i = 0; i < 4; i++) {
      if (this.activeHolds[i]) {
        this.ctx.fillStyle = 'rgba(16, 185, 129, 0.08)';
        this.ctx.fillRect(i * laneWidth, 0, laneWidth, judgeY);
      }
    }

    // Draw Hit Ripples
    for (const ripple of this.hitRipples) {
      const rx = ripple.lane * laneWidth + laneWidth / 2;
      this.ctx.strokeStyle = ripple.color;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(rx, judgeY, ripple.size, 0, Math.PI * 2);
      this.ctx.stroke();
    }

    // Render Notes
    // A note travels from Y = 0 to Y = judgeY
    // Speed is determined by noteSpeed. A speed of 5 means notes take 1.2s to reach hit bar
    const travelTime = 10 / this.noteSpeed; // falling duration in seconds
    const fallingLimitY = height;

    for (const note of this.notes) {
      if (note.hit && note.released) continue;

      // Note fall timing relative to current time
      const timeToHit = note.time - time;
      
      // If note is far in future, don't render
      if (timeToHit > travelTime) continue;

      const laneX = note.lane * laneWidth;
      
      // Calculate Y position
      // Y = judgeY - (ratio * judgeY) where ratio goes from 1 (at spawn) to 0 (at hit)
      const ratio = timeToHit / travelTime;
      const noteY = judgeY * (1 - ratio);

      if (noteY < 0 || noteY > fallingLimitY) continue;

      // Draw hold note connecting tail
      if (note.type === 'hold' && note.duration) {
        const endTime = note.time + note.duration;
        const timeToHoldEnd = endTime - time;
        const holdEndRatio = timeToHoldEnd / travelTime;
        const holdEndY = judgeY * (1 - holdEndRatio);

        // Render hold bar connector
        this.ctx.fillStyle = 'rgba(56, 189, 248, 0.35)'; // Sky blue neon connector
        this.ctx.fillRect(laneX + 8, holdEndY, laneWidth - 16, noteY - holdEndY);

        // Draw green ticks along the hold connector for progress visual
        this.ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(laneX + 16, holdEndY);
        this.ctx.lineTo(laneX + laneWidth - 16, holdEndY);
        this.ctx.moveTo(laneX + 16, noteY);
        this.ctx.lineTo(laneX + laneWidth - 16, noteY);
        this.ctx.stroke();
      }

      // Draw actual note caps
      if (!note.hit) {
        this.drawNoteCap(laneX, noteY, laneWidth, note.type);
      }
    }

    // Draw Combo & Accuracy Texts on Canvas
    if (this.combo > 4) {
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'italic bold 32px "Space Grotesk", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(`${this.combo}`, width / 2, height * 0.4);
      
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      this.ctx.font = 'bold 11px "Space Grotesk", sans-serif';
      this.ctx.fillText('COMBO', width / 2, height * 0.4 + 18);
    }

    // Draw Hit Judgment Text (PERFECT, GREAT, GOOD, MISS)
    if (this.feedbackTimer > 0) {
      this.ctx.fillStyle = this.lastFeedbackColor;
      this.ctx.font = 'black 22px "Space Grotesk", sans-serif';
      this.ctx.textAlign = 'center';
      this.ctx.fillText(this.lastFeedbackText, width / 2, height * 0.55);
    }

    // Draw HUD
    this.drawHUD(width, height);
  }

  private drawNoteCap(x: number, y: number, laneWidth: number, type: 'tap' | 'hold' | 'flick') {
    const pad = 12;
    const nw = laneWidth - pad * 2;
    const nh = 16;
    const rx = x + pad;

    // Glowing outline
    this.ctx.shadowBlur = 10;
    
    if (type === 'tap') {
      this.ctx.shadowColor = 'rgba(16, 185, 129, 0.8)'; // Emerald
      this.ctx.fillStyle = '#10b981';
      this.ctx.fillRect(rx, y - nh / 2, nw, nh);
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(rx + 6, y - 3, nw - 12, 6);
    } else if (type === 'hold') {
      this.ctx.shadowColor = 'rgba(56, 189, 248, 0.8)'; // Sky Blue
      this.ctx.fillStyle = '#0ea5e9';
      this.ctx.beginPath();
      this.ctx.roundRect(rx, y - nh / 2, nw, nh, 4);
      this.ctx.fill();
      this.ctx.fillStyle = '#ffffff';
      this.ctx.fillRect(rx + 10, y - 3, nw - 20, 6);
    } else if (type === 'flick') {
      this.ctx.shadowColor = 'rgba(244, 63, 94, 0.8)'; // Rose/Fuchsia
      this.ctx.fillStyle = '#f43f5e';
      
      // Hexagon cap
      this.ctx.beginPath();
      this.ctx.moveTo(rx, y);
      this.ctx.lineTo(rx + 8, y - nh / 2);
      this.ctx.lineTo(rx + nw - 8, y - nh / 2);
      this.ctx.lineTo(rx + nw, y);
      this.ctx.lineTo(rx + nw - 8, y + nh / 2);
      this.ctx.lineTo(rx + 8, y + nh / 2);
      this.ctx.closePath();
      this.ctx.fill();

      // Small upwards arrows inside note
      this.ctx.shadowBlur = 0;
      this.ctx.strokeStyle = '#ffffff';
      this.ctx.lineWidth = 3;
      this.ctx.beginPath();
      this.ctx.moveTo(rx + nw / 2 - 8, y + 2);
      this.ctx.lineTo(rx + nw / 2, y - 4);
      this.ctx.lineTo(rx + nw / 2 + 8, y + 2);
      this.ctx.stroke();
    }

    // Reset shadow
    this.ctx.shadowBlur = 0;
  }

  private drawHUD(width: number, height: number) {
    // Health Bar top center
    const barW = 200;
    const barH = 6;
    const barX = width / 2 - barW / 2;
    const barY = 20;

    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    this.ctx.fillRect(barX, barY, barW, barH);

    const hw = barW * (Math.max(0, this.health) / 100);
    this.ctx.fillStyle = this.health > 30 ? '#10b981' : '#ef4444';
    this.ctx.fillRect(barX, barY, hw, barH);

    // Score left
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.font = 'bold 10px "DM Mono", monospace';
    this.ctx.textAlign = 'left';
    this.ctx.fillText('SCORE', 20, 30);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 18px "Space Grotesk", sans-serif';
    this.ctx.fillText(`${this.score.toString().padStart(6, '0')}`, 20, 50);

    // Accuracy right
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.font = 'bold 10px "DM Mono", monospace';
    this.ctx.textAlign = 'right';
    this.ctx.fillText('ACCURACY', width - 20, 30);
    this.ctx.fillStyle = '#ffffff';
    this.ctx.font = 'bold 18px "Space Grotesk", sans-serif';
    this.ctx.fillText(`${this.accuracy.toFixed(2)}%`, width - 20, 50);
  }

  // Trigger hits manually by key or touch
  public handleKeyPress(lane: number, isRelease = false) {
    if (!this.isPlaying || this.isPaused) return;

    const time = this.getCurrentTime();

    if (isRelease) {
      // Hold note release processing
      const activeHold = this.activeHolds[lane];
      if (activeHold) {
        const endTime = activeHold.time + (activeHold.duration || 0);
        const difference = Math.abs(time - endTime);
        
        activeHold.released = true;
        this.activeHolds[lane] = null;

        if (difference <= 0.150) {
          this.triggerHit('PERFECT', 'Hold End');
        } else {
          this.triggerMiss();
        }
      }
      return;
    }

    // Check closest unhit note in this lane
    const unhitNotes = this.notes.filter(note => note.lane === lane && !note.hit);
    if (unhitNotes.length === 0) return;

    const note = unhitNotes[0];
    const diff = Math.abs(time - note.time);

    // Timing windows:
    // Perfect: <= 45ms (0.045s)
    // Great: <= 90ms (0.090s)
    // Good: <= 150ms (0.150s)
    // Miss: > 150ms
    if (diff <= 0.150) {
      note.hit = true;

      // Type validations
      if (note.type === 'flick') {
        // Flick notes processed as fast taps
        this.triggerHit(diff <= 0.050 ? 'PERFECT' : diff <= 0.100 ? 'GREAT' : 'GOOD', 'FLICK!');
      } else if (note.type === 'hold') {
        this.activeHolds[lane] = note;
        this.triggerHit(diff <= 0.045 ? 'PERFECT' : diff <= 0.090 ? 'GREAT' : 'GOOD', 'HOLD START');
      } else {
        this.triggerHit(diff <= 0.045 ? 'PERFECT' : diff <= 0.090 ? 'GREAT' : 'GOOD', 'HIT!');
      }

      // Hit Ripple effect
      this.hitRipples.push({
        lane,
        time: performance.now(),
        color: note.type === 'flick' ? '#f43f5e' : note.type === 'hold' ? '#56b9f8' : '#10b981',
        size: 10
      });
    }
  }

  private playHitSound() {
    try {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) return;
      const ctx = new AudioCtxClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note chime
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.warn("Could not play synthesized hit sound:", e);
    }
  }

  private triggerHit(rating: 'PERFECT' | 'GREAT' | 'GOOD', text: string) {
    this.playHitSound();
    this.feedbackTimer = 600; // feedback text lasts 600ms
    this.totalNotesPlayed++;

    if (rating === 'PERFECT') {
      this.score += 1000;
      this.totalPerfect++;
      this.lastFeedbackText = rating;
      this.lastFeedbackColor = '#10b981';
      this.combo++;
      this.health = Math.min(100, this.health + 2);
    } else if (rating === 'GREAT') {
      this.score += 750;
      this.totalGreat++;
      this.lastFeedbackText = rating;
      this.lastFeedbackColor = '#34d399';
      this.combo++;
      this.health = Math.min(100, this.health + 1);
    } else if (rating === 'GOOD') {
      this.score += 500;
      this.totalGood++;
      this.lastFeedbackText = rating;
      this.lastFeedbackColor = '#06b6d4';
      this.combo++;
    }

    if (this.combo > this.maxCombo) {
      this.maxCombo = this.combo;
    }

    this.recalculateAccuracy();
  }

  private triggerMiss() {
    this.feedbackTimer = 600;
    this.totalNotesPlayed++;
    this.totalMiss++;
    this.lastFeedbackText = 'MISS';
    this.lastFeedbackColor = '#ef4444';
    this.combo = 0;
    this.health -= 10;

    this.recalculateAccuracy();
  }

  private recalculateAccuracy() {
    if (this.totalNotesPlayed === 0) {
      this.accuracy = 100;
      return;
    }
    // Accuracy score weighting: Perfect=1.0, Great=0.75, Good=0.5, Miss=0
    const weighted = (this.totalPerfect * 1.0) + (this.totalGreat * 0.75) + (this.totalGood * 0.5);
    this.accuracy = (weighted / this.totalNotesPlayed) * 100;
  }

  private handleSongComplete() {
    this.isPlaying = false;
    this.onVictoryCallback(this.score, this.accuracy, this.maxCombo, this.totalPerfect, this.totalMiss);
  }
}
