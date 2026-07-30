const canvas = document.getElementById('c');
const overlay = document.getElementById('overlay');

// High-DPI internal resolution to make text legible while preserving 180x270 coordinates
const SCALE_FACTOR = 2;
canvas.width = 180 * SCALE_FACTOR;
canvas.height = 270 * SCALE_FACTOR;

const ctx = canvas.getContext('2d');
ctx.scale(SCALE_FACTOR, SCALE_FACTOR);
ctx.imageSmoothingEnabled = false;
const W = 180, H = 270;

// Isolate clicks/taps from executing jumps during layout interaction
overlay.addEventListener('mousedown', e => e.stopPropagation());
overlay.addEventListener('touchstart', e => e.stopPropagation(), {passive: false});
overlay.addEventListener('click', e => e.stopPropagation());

// ─── Color Palette ─────────────────────────────────────
let SKY_TOP  = '#111026';
let SKY_BOT  = '#1a244d';
let isDaytime = false;
let GROUND_C = '#22191b';
let GRASS_C  = '#1e4620';
let bgScrollOffset = 0;
let skyTransitionActive = false;
let skyTransitionTimer = 0;
let skyTransitionDuration = 6.0;

function lerpColor(c1, c2, f) {
  const r1 = parseInt(c1.substring(1, 3), 16);
  const g1 = parseInt(c1.substring(3, 5), 16);
  const b1 = parseInt(c1.substring(5, 7), 16);

  const r2 = parseInt(c2.substring(1, 3), 16);
  const g2 = parseInt(c2.substring(3, 5), 16);
  const b2 = parseInt(c2.substring(5, 7), 16);

  const r = Math.round(r1 + (r2 - r1) * f);
  const g = Math.round(g1 + (g2 - g1) * f);
  const b = Math.round(b1 + (b2 - b1) * f);

  const hex = (x) => {
    const s = Math.max(0, Math.min(255, x)).toString(16);
    return s.length === 1 ? '0' + s : s;
  };

  return '#' + hex(r) + hex(g) + hex(b);
}
const PIPE_C   = '#2d6a4f';
const PIPE_HI  = '#52b788';
const PIPE_SHD = '#1b4332';
const BIRD_BEL = '#ff9800';
const EYE_C    = '#fff';
const PUPIL_C  = '#111';
const STAR_C   = '#ffffff';

// ─── Physics Constants ─────────────────────────────────
const GRAVITY    = 1350;   
const JUMP_VEL   = -370;   
const PIPE_SPD   = 125;    
const PIPE_INT   = 1.70;   
const FLAP_DUR   = 0.13;   

const PIPE_W   = 36;
const PIPE_GAP = 94;
const GROUND_H = 45;
const BIRD_R   = 8;

// ─── NEW FEATURES: Power-ups & Extras ──────────────────
let powerUps = [];

let particles = [];

let shakeAmount = 0;
let slowMoMode = false;
let slowMoTimer = 0;
let slowMoGraceActive = false;
let slowMoGraceTimer = 0;
let cameraY = 0;
let dashMode = false;
let dashPipesRemaining = 0;
let elapsed = 0;
let comboCounter = 0;
let comboTimer = 0;
const COMBO_TIMEOUT = 2;
let maxCombo = 0;
let scoreElevateInterval = null;

// Screen Flash, Score/Damage Popups, and general state tracking
let screenFlashAlpha = 0;
let screenFlashColor = '#ffffff';
let scorePopups = [];
let lastMilestone = 0;
let displayedScoreValue = 0;
let notifications = []; // Active stacked canvas and UI notifications

// ─── BOSS FIGHT STATE VARIABLES ──────────────────────
let bossMode = false;
let boss = null;
let bossAlerts = [];
let fireballs = [];
let darkFireballs = [];
let fireballPowerUps = [];
let bossFought = false;
let playingBossMusicPhase1 = false;
let playingBossMusicPhase2 = false;

// ─── Web Audio Synthesis Engine ────────────────────────
const AudioEngine = {
  ctx: null,
  musicVolume: Number(localStorage.getItem('musicVolume') === null ? 50 : localStorage.getItem('musicVolume')),
  sfxVolume: Number(localStorage.getItem('sfxVolume') === null ? 50 : localStorage.getItem('sfxVolume')),
  isMuted: localStorage.getItem('isMuted') === 'true',

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  },

  getMusicVolume() {
    return this.isMuted ? 0 : (this.musicVolume / 100);
  },

  getSFXVolume() {
    return this.isMuted ? 0 : (this.sfxVolume / 100);
  },

  updateMusicVolumes() {
    const vol = this.getMusicVolume();
    if (this.crossfadeInProgress) {
      if (this.bossAudioPhase1) this.bossAudioPhase1.volume = (this.currentP1Vol || 0.5) * vol;
      if (this.bossAudioPhase2) this.bossAudioPhase2.volume = (this.currentP2Vol || 0.0) * vol;
    } else {
      if (this.bossAudioPhase1) this.bossAudioPhase1.volume = 0.5 * vol;
      if (this.bossAudioPhase2) this.bossAudioPhase2.volume = 0.5 * vol;
    }
  },

  playJump() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(190, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.1);
    
    gain.gain.setValueAtTime(0.12 * this.getSFXVolume(), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.1);
  },

  playBossMusicPhase1() {
    this.crossfadeInProgress = false; // Cancel any active crossfades
    const targetVol = 0.5 * this.getMusicVolume();
    if (this.bossAudioPhase1) {
      this.bossAudioPhase1.volume = targetVol;
      this.bossAudioPhase1.play().catch(e => console.warn(e));
      return;
    }
    this.bossAudioPhase1 = new Audio('chassis_ost1.wav');
    this.bossAudioPhase1.loop = true;
    this.bossAudioPhase1.volume = targetVol;
    this.bossAudioPhase1.play().catch(e => {
      console.warn("Trying fallback for Phase 1 music:", e);
      this.bossAudioPhase1.src = 'assets/chassis_ost1.wav';
      this.bossAudioPhase1.play().catch(err => console.warn("Fallback Phase 1 audio blocked:", err));
    });
  },

  playBossMusicPhase2() {
    this.crossfadeInProgress = false; // Cancel any active crossfades
    const targetVol = 0.5 * this.getMusicVolume();
    if (this.bossAudioPhase2) {
      this.bossAudioPhase2.volume = targetVol;
      this.bossAudioPhase2.play().catch(e => console.warn(e));
      return;
    }
    this.bossAudioPhase2 = new Audio('chassis_ost2.wav');
    this.bossAudioPhase2.loop = true;
    this.bossAudioPhase2.volume = targetVol;
    this.bossAudioPhase2.play().catch(e => {
      console.warn("Trying fallback for Phase 2 music:", e);
      this.bossAudioPhase2.src = 'assets/chassis_ost2.wav';
      this.bossAudioPhase2.play().catch(err => console.warn("Fallback Phase 2 audio blocked:", err));
    });
  },

  crossfadeInProgress: false,
  currentFadeId: null,
  currentP1Vol: 0.5,
  currentP2Vol: 0.0,

  startCrossfade(durationMs = 5000) {
    this.crossfadeInProgress = true;
    const fadeId = Math.random();
    this.currentFadeId = fadeId;

    if (!this.bossAudioPhase2) {
      this.bossAudioPhase2 = new Audio('chassis_ost2.wav');
      this.bossAudioPhase2.loop = true;
      this.bossAudioPhase2.volume = 0.0;
    } else {
      this.bossAudioPhase2.volume = 0.0;
    }

    const delayMs = 1500;
    let phase2Started = false;

    if (this.bossAudioPhase1) {
      this.bossAudioPhase1.play().catch(e => console.warn(e));
    }

    const start = performance.now();
    const initialVol1 = 0.5;
    const targetVol1 = 0.0;
    const initialVol2 = 0.0;
    const targetVol2 = 0.5;

    const fadeStep = (now) => {
      if (!this.crossfadeInProgress || this.currentFadeId !== fadeId) return;

      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);

      let currentP1 = initialVol1 + (targetVol1 - initialVol1) * progress;
      this.currentP1Vol = currentP1;
      if (this.bossAudioPhase1) {
        this.bossAudioPhase1.volume = currentP1 * this.getMusicVolume();
      }
      
      if (elapsed >= delayMs) {
        if (!phase2Started) {
          phase2Started = true;
          const playPromise2 = this.bossAudioPhase2.play();
          if (playPromise2 !== undefined) {
            playPromise2.catch(e => {
              console.warn("Trying fallback for Phase 2 crossfade:", e);
              this.bossAudioPhase2.src = 'assets/chassis_ost2.wav';
              this.bossAudioPhase2.play().catch(err => console.warn("Fallback Phase 2 crossfade audio blocked:", err));
            });
          }
        }
        
        const p2Elapsed = elapsed - delayMs;
        const p2Duration = durationMs - delayMs;
        const progress2 = Math.min(Math.max(p2Elapsed / p2Duration, 0), 1);
        let currentP2 = initialVol2 + (targetVol2 - initialVol2) * progress2;
        this.currentP2Vol = currentP2;
        if (this.bossAudioPhase2) {
          this.bossAudioPhase2.volume = currentP2 * this.getMusicVolume();
        }
      } else {
        this.currentP2Vol = 0.0;
        if (this.bossAudioPhase2) {
          this.bossAudioPhase2.volume = 0;
        }
      }

      if (progress < 1) {
        requestAnimationFrame(fadeStep);
      } else {
        this.crossfadeInProgress = false;
        if (this.bossAudioPhase1) {
          this.bossAudioPhase1.pause();
          this.bossAudioPhase1.currentTime = 0;
          this.bossAudioPhase1.volume = 0.5 * this.getMusicVolume();
        }
      }
    };

    requestAnimationFrame(fadeStep);
  },

  stopBossMusic() {
    this.crossfadeInProgress = false;
    if (this.bossAudioPhase1) {
      this.bossAudioPhase1.pause();
      this.bossAudioPhase1.currentTime = 0;
      this.bossAudioPhase1.volume = 0.5 * this.getMusicVolume();
    }
    if (this.bossAudioPhase2) {
      this.bossAudioPhase2.pause();
      this.bossAudioPhase2.currentTime = 0;
      this.bossAudioPhase2.volume = 0.5 * this.getMusicVolume();
    }
  },

  playScore() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const playNote = (pitch, delay, duration) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, now + delay);
      gain.gain.setValueAtTime(0.1 * this.getSFXVolume(), now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + duration);
    };
    
    playNote(587.33, 0, 0.12); // D5
    playNote(880.00, 0.06, 0.22); // A5
  },

  playSlowMo() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.linearRampToValueAtTime(180, now + 0.4);
    
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1200, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.4);
    
    gain.gain.setValueAtTime(0.18 * this.getSFXVolume(), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.4);
  },

  playDash() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const duration = 0.45;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.exponentialRampToValueAtTime(1800, now + duration);
    
    gain.gain.setValueAtTime(0.16 * this.getSFXVolume(), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
    
    try {
      const bufferSize = this.ctx.sampleRate * 0.35;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      
      const filterNode = this.ctx.createBiquadFilter();
      filterNode.type = 'bandpass';
      filterNode.frequency.setValueAtTime(500, now);
      filterNode.frequency.exponentialRampToValueAtTime(3200, now + 0.35);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.08 * this.getSFXVolume(), now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      
      noise.connect(filterNode);
      filterNode.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.35);
    } catch (e) {}
  },

  playCrash() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    
    const osc = this.ctx.createOscillator();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.linearRampToValueAtTime(35, now + 0.5);
    
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, now);
    filter.frequency.exponentialRampToValueAtTime(20, now + 0.5);
    
    gain.gain.setValueAtTime(0.3 * this.getSFXVolume(), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
    
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + 0.5);
    
    try {
      const bufferSize = this.ctx.sampleRate * 0.5;
      const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
      const noise = this.ctx.createBufferSource();
      noise.buffer = buffer;
      
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(220, now);
      
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25 * this.getSFXVolume(), now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      
      noise.connect(lp);
      lp.connect(noiseGain);
      noiseGain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.5);
    } catch (e) {}
  },

  playUnlockSuccess() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const playNote = (pitch, delay, duration) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pitch, now + delay);
      gain.gain.setValueAtTime(0.09 * this.getSFXVolume(), now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + duration);
    };
    
    playNote(523.25, 0, 0.08); // C5
    playNote(659.25, 0.06, 0.08); // E5
    playNote(783.99, 0.12, 0.08); // G5
    playNote(1046.50, 0.18, 0.22); // C6
  },

  playUnlockFail() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.22);
    
    gain.gain.setValueAtTime(0.14 * this.getSFXVolume(), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  },

  playBossWarning() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const delay = i * 0.18;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(320, now + delay);
      osc.frequency.linearRampToValueAtTime(130, now + delay + 0.35);
      gain.gain.setValueAtTime(0.13 * this.getSFXVolume(), now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.35);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.35);
    }
  },

  playBossHit() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(130, now);
    osc.frequency.linearRampToValueAtTime(50, now + 0.15);
    gain.gain.setValueAtTime(0.18 * this.getSFXVolume(), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.15);
  },

  playFireball() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.45);
    gain.gain.setValueAtTime(0.14 * this.getSFXVolume(), now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.45);
  },

  playBossDefeat() {
    this.init();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const delay = i * 0.16;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190 - i * 18, now + delay);
      osc.frequency.linearRampToValueAtTime(30, now + delay + 0.4);
      gain.gain.setValueAtTime(0.22 * this.getSFXVolume(), now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.4);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.4);
    }
  }
};

// Local Vault Tracking
let coins = Number(localStorage.getItem('coins') || 0);
let unlockedSkins = JSON.parse(localStorage.getItem('unlockedSkins') || '["classic","angry","cute"]');
let unlockedWings = JSON.parse(localStorage.getItem('unlockedWings') || '["normal"]');

let birdSettings = {
  color: localStorage.getItem('birdColor') || '#ffe94e',
  style: localStorage.getItem('birdStyle') || 'classic',
  accessory: localStorage.getItem('birdAccessory') || 'none',
  wing: localStorage.getItem('birdWing') || 'normal',
  gameTime: Number(localStorage.getItem('gameTime') || 0),
  cycleUnlocked: localStorage.getItem('cycleUnlocked') === 'true'
};

function saveCustomization(){
 localStorage.setItem('birdColor', birdSettings.color);
 localStorage.setItem('birdStyle', birdSettings.style);
 localStorage.setItem('birdAccessory', birdSettings.accessory);
 localStorage.setItem('birdWing', birdSettings.wing);
 localStorage.setItem('gameTime', birdSettings.gameTime.toString());
 localStorage.setItem('cycleUnlocked', birdSettings.cycleUnlocked.toString());
 document.getElementById('coin-count').textContent = coins;
 localStorage.setItem('coins', coins);
 localStorage.setItem('unlockedSkins', JSON.stringify(unlockedSkins));
 localStorage.setItem('unlockedWings', JSON.stringify(unlockedWings));
 if (typeof updateCustomSelectionUI === 'function') {
   updateCustomSelectionUI();
 }
}

function selectModel(val) {
  const select = document.getElementById('bird-style');
  select.value = val;
  select.dispatchEvent(new Event('change'));
  updateCustomSelectionUI();
}

function selectAccessory(val) {
  const select = document.getElementById('bird-accessory');
  select.value = val;
  select.dispatchEvent(new Event('change'));
  updateCustomSelectionUI();
}

function selectWing(val) {
  const select = document.getElementById('bird-wing');
  select.value = val;
  select.dispatchEvent(new Event('change'));
  updateCustomSelectionUI();
}

function selectShopItem(val) {
  const select = document.getElementById('shop-skin');
  if (select.value === val) {
    select.value = '';
  } else {
    select.value = val;
  }
  updateCustomSelectionUI();
}

function updateCustomSelectionUI() {
  // 1. Model Items
  const styleItems = document.querySelectorAll('#bird-style-selector .selector-item');
  styleItems.forEach(item => {
    const val = item.getAttribute('data-value');
    if (val === birdSettings.style) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
    
    // Check if locked
    if ((val === 'robot' || val === 'golden') && !unlockedSkins.includes(val)) {
      item.classList.add('locked');
    } else {
      item.classList.remove('locked');
    }
  });

  // 2. Accessory Items
  const accessoryItems = document.querySelectorAll('#bird-accessory-selector .selector-item');
  accessoryItems.forEach(item => {
    const val = item.getAttribute('data-value');
    if (val === birdSettings.accessory) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });

  // 3. Wing Items
  const wingItems = document.querySelectorAll('#bird-wing-selector .selector-item');
  wingItems.forEach(item => {
    const val = item.getAttribute('data-value');
    if (val === birdSettings.wing) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
    
    // Check if locked
    if ((val === 'angel' || val === 'bat') && !unlockedWings.includes(val)) {
      item.classList.add('locked');
    } else {
      item.classList.remove('locked');
    }
  });

  // 4. Shop Items
  const shopSelectVal = document.getElementById('shop-skin').value;
  const shopItems = document.querySelectorAll('#shop-skin-selector .shop-item-tile');
  shopItems.forEach(item => {
    const val = item.getAttribute('data-shop-value');
    if (val === shopSelectVal) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }

    let isUnlocked = false;
    if (val.startsWith('skin_')) {
      const skinId = val.replace('skin_', '');
      if (unlockedSkins.includes(skinId)) {
        isUnlocked = true;
      }
    } else if (val.startsWith('wing_')) {
      const wingId = val.replace('wing_', '');
      if (unlockedWings.includes(wingId)) {
        isUnlocked = true;
      }
    }
    
    if (isUnlocked) {
      item.classList.add('unlocked');
    } else {
      item.classList.remove('unlocked');
    }
  });
}

// ─── In-Game Custom Notification System ────────────────
let toastTimer = null;
let canvasToastMsg = "";
let canvasToastType = "success";
let canvasToastTimer = 0;

function triggerNotification(message, type = 'success') {
  canvasToastMsg = message;
  canvasToastType = type;
  canvasToastTimer = 1.4;
}

// ─── Graphics Customizer Engines ───────────────────────
function drawAccessory(){
 if(birdSettings.accessory==='crown'){
   ctx.fillStyle='gold';
   ctx.beginPath();
   ctx.moveTo(-5, -6); ctx.lineTo(-5, -11); ctx.lineTo(-2.5, -8);
   ctx.lineTo(0, -13); ctx.lineTo(2.5, -8); ctx.lineTo(5, -11); ctx.lineTo(5, -6);
   ctx.closePath(); ctx.fill();
   ctx.strokeStyle = '#b38600'; ctx.lineWidth = 0.5; ctx.stroke();
 }
 if(birdSettings.accessory==='glasses'){
   ctx.fillStyle='#111';
   ctx.fillRect(1, -3, 3, 2); ctx.fillRect(4.5, -3, 3, 2);
   ctx.fillStyle='#6366f1'; ctx.fillRect(0.5, -2.5, 1, 1);
 }
}

function drawWingStyle(){
  let flapPhase = Math.sin(elapsed * 18); 
  
  if (bird.flapTimer > 0) {
    flapPhase = -1.2; 
  }

  ctx.save();
  ctx.translate(-3, 1);

  if(birdSettings.wing==='normal'){
    if (birdSettings.style === 'robot') {
      let yShift = flapPhase * 1.5;
      ctx.fillStyle = '#475569';
      ctx.strokeStyle = '#6366f1';
      ctx.lineWidth = 0.8;
      ctx.fillRect(-5, -2 + yShift, 7, 4);
      ctx.strokeRect(-5, -2 + yShift, 7, 4);
      
      ctx.fillStyle = '#00ffff';
      ctx.fillRect(-3, -1 + yShift, 3, 2);
    } else if (birdSettings.style === 'golden') {
      let g = ctx.createLinearGradient(-5, -2, 5, 2);
      g.addColorStop(0, '#fff3a8'); g.addColorStop(1, '#cca300');
      ctx.fillStyle = g;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.ellipse(-2, 0, 5, 3 + (flapPhase * 1.5), -0.2 + (flapPhase * 0.2), 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffb703';
      ctx.strokeStyle = '#b38600';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(-2, 0, 5, 3 + (flapPhase * 1.5), -0.2 + (flapPhase * 0.2), 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  }
  
  if(birdSettings.wing==='angel'){
    ctx.fillStyle = 'rgba(241, 245, 249, 0.95)';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.bezierCurveTo(-6, -7 + (flapPhase * 6), -12, -3 + (flapPhase * 5), -10, 2);
    ctx.bezierCurveTo(-7, 4, -3, 2, 0, 0);
    ctx.fill(); ctx.stroke();
  }
  
  if(birdSettings.wing==='bat'){
    ctx.fillStyle = '#2d1b4e';
    ctx.strokeStyle = '#701a75';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-9, -6 + (flapPhase * 4));
    ctx.lineTo(-6, 1);
    ctx.lineTo(-12, 4 + (flapPhase * 3));
    ctx.lineTo(-2, 2);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  ctx.restore();
}

// ─── Game Automation State Machine ─────────────────────
let state = 'idle';
let best = Number(localStorage.getItem('best') || 0);
let score = 0;
let bird, pipes, stars, groundX, lastTime, pipeTimer;

function genStars() {
  stars = Array.from({length: 40}, () => ({
    x: Math.random() * W, y: Math.random() * (H * 0.72),
    r: Math.random() * 0.8 + 0.3, a: Math.random()
  }));
}

function init() {
  bird      = { x: W / 2 - 20, y: H / 2 - 10, vy: 0, angle: 0, flapTimer: 0 };
  pipes     = []; 
  powerUps  = [];
  particles = [];
  elapsed = 0; 
  groundX = 0; 
  pipeTimer = 0; 
  score = 0; 
  lastTime = null;
  shakeAmount = 0;
  slowMoMode = false;
  slowMoTimer = 0;
  slowMoGraceActive = false;
  slowMoGraceTimer = 0;
  cameraY = 0;
  dashMode = false;
  dashPipesRemaining = 0;
  comboCounter = 0;
  comboTimer = 0;
  maxCombo = 0;
  bgScrollOffset = 0;
  skyTransitionActive = false;
  skyTransitionTimer = 0;
  if (birdSettings.cycleUnlocked) {
    const cyclePoint = (Math.sin(birdSettings.gameTime) + 1) / 2;
    isDaytime = cyclePoint > 0.5;
    SKY_TOP  = lerpColor('#111026', '#324e75', cyclePoint);
    SKY_BOT  = lerpColor('#1a244d', '#6da2cc', cyclePoint);
    GROUND_C = lerpColor('#22191b', '#3b2f2f', cyclePoint);
    GRASS_C  = lerpColor('#1e4620', '#345e2a', cyclePoint);
  } else {
    SKY_TOP = '#111026';
    SKY_BOT = '#1a244d';
    isDaytime = false;
    GROUND_C = '#22191b';
    GRASS_C  = '#1e4620';
  }
  bossMode = false;
  boss = null;
  bossAlerts = [];
  fireballs = [];
  darkFireballs = [];
  fireballPowerUps = [];
  bossFought = false;
  clearInterval(scoreElevateInterval);
  genStars(); 
  updateScoreUI();
}

function spawnPipe() {
  const minY = 50, maxY = H - GROUND_H - PIPE_GAP - 50;
  const pTop = Math.random() * (maxY - minY) + minY;
  pipes.push({ x: W + 10, top: pTop, scored: false });
  
  // 15% chance to spawn a powerup centered with the pipe
  if (Math.random() < 0.15) {
    const powerUpType = Math.random() < 0.5 ? 'slowmo' : 'dash';
    const centerY = pTop + PIPE_GAP / 2;
    powerUps.push({
      x: W + 10 + PIPE_W / 2 + 10,
      y: centerY + (Math.random() - 0.5) * 20,
      type: powerUpType,
      radius: 5.5,
      pulsePhase: Math.random() * Math.PI * 2,
      collected: false
    });
  }
}

function flap() {
  AudioEngine.init();
  if (state === 'idle' || state === 'dead' || state === 'paused') return; 
  if (state === 'cutscene') {
    // Player cannot interrupt or skip the cutscene if the boss is still exploding, or if sunrise is active
    if (bossMode && boss && boss.state === 'dying') {
      return;
    }
    if (skyTransitionActive) {
      return;
    }
    if (!isDaytime) {
      return;
    }
    endCutscene();
    return;
  }
  if (state === 'playing') {
    if (dashMode) return; // Cannot flap during invincible dash traversal
    if (bossMode && boss) {
      if (boss.state === 'evolving' || boss.state === 'dying' || boss.state === 'entering') return; // Cannot flap during cinematic transitions or death scene
      if (boss.state === 'introPaused' || boss.state === 'evolvedPaused') {
        boss.state = 'active';
        // Playing alert sound on resume
        AudioEngine.playJump();
      }
    }
    
    bird.vy = JUMP_VEL;
    bird.flapTimer = FLAP_DUR;
    AudioEngine.playJump();
    
    // Add wing flap particles
    for (let i = 0; i < 4; i++) {
      particles.push({
        x: bird.x - 4, y: bird.y + 2,
        vx: (Math.random() - 0.5) * 50 - 25,
        vy: (Math.random() - 0.5) * 25 + 15,
        color: 'rgba(255, 183, 3, 0.5)',
        size: Math.random() * 1.5 + 0.5,
        life: 0.6
      });
    }
  }
}

function endCutscene() {
  state = 'playing';
  // Transition bird seamlessly back into control
  bird.vy = JUMP_VEL;
  bird.flapTimer = FLAP_DUR;
  AudioEngine.playJump();
  
  // Clear scenery of physical obstacles so the player does not immediately die
  pipes = [];
  pipeTimer = PIPE_INT * 0.8; // beautiful breathing room before first pipe spawns
  triggerNotification("FLIGHT CONTROL ENGAGED!", "success");
}

function startGame() {
  // Ensure we don't trap focus on click buttons
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  AudioEngine.init();
  init();
  state = 'playing';
  overlay.classList.add('hidden');
  document.getElementById('pause-btn').classList.remove('hidden');
  document.getElementById('overlay-title').innerHTML = 'Ready to Jump?';
  document.getElementById('overlay-msg').textContent = 'Press SPACE or Tap to control flight';
  document.getElementById('overlay-score').style.display = 'none';
  const startBtn = document.getElementById('start-btn');
  if (startBtn) startBtn.textContent = 'START SESSION';
  
  // Create energetic start particles
  for (let i = 0; i < 10; i++) {
    particles.push({
      x: W / 2, y: H / 2,
      vx: (Math.random() - 0.5) * 100,
      vy: (Math.random() - 0.5) * 100,
      color: 'rgba(99, 102, 241, 0.5)',
      size: Math.random() * 2 + 0.5,
      life: 0.5
    });
  }
}

function startBossFightDebug() {
  startGame();

  // Use rAF so state='playing' is fully committed before we touch anything
  requestAnimationFrame(() => {
    score = 50;
    if (score > best) { best = score; localStorage.setItem('best', best); }
    updateScoreUI();

    // Directly trigger the boss — same logic as the score>=50 block in update()
    bossFought = true;
    bossMode   = true;
    slowMoMode = false; slowMoTimer = 0;
    dashMode   = false; dashPipesRemaining = 0;
    pipes = []; powerUps = []; fireballPowerUps = [];
    fireballs = []; darkFireballs = []; bossAlerts = [];

    boss = {
      x: W + 30, y: H / 2 - 30, targetY: H / 2,
      hp: 100, maxHp: 100, phase: 1,
      attackTimer: 2.0, fireballUpTimer: 3.5,
      floatPhase: 0, state: 'entering'
    };

    // Park the bird safely in the middle so it doesn't instantly hit the ground
    bird.y  = H / 2 - 10;
    bird.vy = 0;

    AudioEngine.playBossWarning();
    triggerNotification("WARNING: BOSS CHASSIS INBOUND!", "error");
  });
}

function spawnDarkFireball() {
  if (!boss || !bird) return;
  const speed = 70; // requested speed
  const fvx = -speed;
  const fvy = 0; // Purely horizontal movement, no auto-tracking to bird
  // Boss must be at least 40px away from left edge before fireball arms
  const bossLeftEdge = boss.x - 5;
  darkFireballs.push({
    x: bossLeftEdge,
    y: boss.y,
    vx: fvx,
    vy: fvy,
    radius: 4.5,
    armX: bossLeftEdge - 40  // fireball only becomes lethal after travelling 40px left
  });
  
  // Sparks visual effect at source
  for (let k = 0; k < 6; k++) {
    particles.push({
      x: boss.x - 5,
      y: boss.y,
      vx: (Math.random() - 0.5) * 60 - 40,
      vy: (Math.random() - 0.5) * 60,
      color: '#c084fc',
      size: Math.random() * 2 + 1,
      life: 0.4
    });
  }
  
  AudioEngine.playFireball();
}

function checkCollision() {
  if (state === 'cutscene') return false; // Invincible during the sunrise cinematic rise
  if (dashMode) return false; // Absolutely invincible during thruster dash
  if (bossMode && boss && (boss.state === 'evolving' || boss.state === 'dying' || boss.state === 'entering')) return false; // Invincible during cinematic boss transitions!
  const bx = bird.x, by = bird.y, r = BIRD_R - 1.5;
  let hit = false;

  // 1. Check ground / ceiling boundaries
  if (by + r >= H - GROUND_H || by - r <= 0) {
    if (slowMoGraceActive) {
      slowMoGraceActive = false; // Shield consumed!
      triggerNotification("SHIELD DISRUPTED! CAUTION!", "error");
      AudioEngine.playBossHit(); // defensive defusing vibration sound
      
      // Safe bounce to stay in bounds
      if (by + r >= H - GROUND_H) {
        bird.y = H - GROUND_H - r - 3;
        bird.vy = -180; // bounce up
        
        // Spawn subtle landing dust particles at ground boundary
        for (let j = 0; j < 8; j++) {
          particles.push({
            x: bird.x + (Math.random() - 0.5) * 16,
            y: H - GROUND_H,
            vx: (Math.random() - 0.5) * 44,
            vy: -15 - Math.random() * 25,
            color: 'rgba(212, 212, 216, 0.65)',
            size: Math.random() * 2.2 + 1.2,
            life: 0.55
          });
        }
      } else {
        bird.y = r + 3;
        bird.vy = 120; // bounce down
      }
      
      // Spawn golden/orange energy explosion particles around the bird
      for (let k = 0; k < 15; k++) {
        particles.push({
          x: bird.x, y: bird.y,
          vx: (Math.random() - 0.5) * 120,
          vy: (Math.random() - 0.5) * 120,
          color: '#fb923c',
          size: Math.random() * 2 + 0.8,
          life: 0.6
        });
      }
      return false; // Absorb and do not terminate
    }
    return true; // Terminate
  }

  // 2. Check active pipes
  for (let i = pipes.length - 1; i >= 0; i--) {
    const p = pipes[i];
    if (bx + r > p.x && bx - r < p.x + PIPE_W) {
      if (by - r < p.top || by + r > p.top + PIPE_GAP) {
        if (slowMoGraceActive) {
          // Smash and destroy the specific pipe obstacle we collided with!
          slowMoGraceActive = false; // Shield consumed!
          pipes.splice(i, 1); // Delete the pipe from existence
          
          triggerNotification("CHRONO SHIELD CRUSHED! OBSTACLE SMASHED!", "success");
          AudioEngine.playBossHit(); // Defensive defusing impact vibration
          
          // Shatter debris particles at contact point
          const centerX = p.x + PIPE_W / 2;
          const contactY = by - r < p.top ? p.top : p.top + PIPE_GAP;
          for (let k = 0; k < 22; k++) {
            particles.push({
              x: centerX + (Math.random() - 0.5) * PIPE_W,
              y: contactY + (Math.random() - 0.5) * 40,
              vx: (Math.random() - 0.2) * 150,
              vy: (Math.random() - 0.5) * 120,
              color: '#fb923c', // Chrono orange energy
              size: Math.random() * 3 + 1,
              life: 0.8
            });
          }
          return false; // Survives!
        }
        return true; // Direct collision death
      }
    }
  }

  return false;
}

function update(dt) {
  if (state !== 'playing' && state !== 'cutscene') return;
  dt = Math.min(dt, 0.05); 
  elapsed += dt;

  if (state === 'cutscene') {
    // ─── Cutscene Specific Autonomous Physics ───
    // 1. Slow down back offset scroll for peaceful drifting vibe
    bgScrollOffset += PIPE_SPD * 0.40 * dt;
    
    // 2. Sunrise / sky transition progress
    if (skyTransitionActive) {
      skyTransitionTimer += dt;
      if (skyTransitionTimer >= skyTransitionDuration) {
        skyTransitionTimer = skyTransitionDuration;
        skyTransitionActive = false;
        isDaytime = true;
        birdSettings.gameTime = Math.PI / 2; // Set gameTime to peak day so the cycle begins smoothly from morning/noon!
        saveCustomization(); // persist this state!
        // Do NOT automatically call endCutscene()! Let the player choose when to leave the peaceful sunrise!
        triggerNotification("TAP OR PRESS SPACE TO RESUME FLIGHT", "success");
      }
      
      const f = skyTransitionTimer / skyTransitionDuration;
      // Elegant, soft-toned, eye-friendly pastel sky morning transition
      SKY_TOP  = lerpColor('#111026', '#324e75', f);
      SKY_BOT  = lerpColor('#1a244d', '#6da2cc', f);
      GROUND_C = lerpColor('#22191b', '#3b2f2f', f);
      GRASS_C  = lerpColor('#1e4620', '#345e2a', f);
    }
    
    // 3. Smooth Camera pan focusing on the sun: horizon drifts down cleanly
    const progress = skyTransitionActive ? (skyTransitionTimer / skyTransitionDuration) : (birdSettings.cycleUnlocked ? 1.0 : 0.0); // 0 to 1
    cameraY = progress * 24; // glide down (pans view up)
    
    // 4. Autonomous bird flying
    bird.x += (W / 2 - 25 - bird.x) * 3.5 * dt; // center the bird beautifully
    bird.vy += GRAVITY * 0.70 * dt; // low gravity float
    bird.y += bird.vy * dt;
    bird.angle = Math.min(Math.max(bird.vy * 0.16, -20), 45);
    bird.flapTimer = Math.max(0, bird.flapTimer - dt);
    
    // Auto-flap threshold centered with natural hover oscillations
    const targetHoverY = H / 2 - 10 + Math.sin(elapsed * 3.5) * 6;
    if (bird.y > targetHoverY && bird.vy > 0) {
      bird.vy = JUMP_VEL * 0.58; // gentle hover flap
      bird.flapTimer = FLAP_DUR;
      AudioEngine.playJump();
      
      // Sparkle feathers
      for (let i = 0; i < 3; i++) {
        particles.push({
          x: bird.x - 4, y: bird.y + 2,
          vx: (Math.random() - 0.5) * 40 - 15,
          vy: (Math.random() - 0.5) * 20 + 5,
          color: 'rgba(255, 233, 78, 0.55)',
          size: Math.random() * 1.5 + 0.5,
          life: 0.5
        });
      }
    }
    
    // 5. Boss dying sequence updates inside the cutscene!
    if (bossMode && boss && boss.state === 'dying') {
      if (boss.deathX === undefined) {
        boss.deathX = boss.x;
        boss.deathY = boss.y;
      }
      // Boss explodes!
      shakeAmount = 5.0;
      // Shake around the exact fixed coordinates so it stays centered
      boss.x = boss.deathX + (Math.random() - 0.5) * 8;
      boss.y = boss.deathY + (Math.random() - 0.5) * 8;
      
      // Intensive explosion sparks popping out
      for (let k = 0; k < 5; k++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 110 + 40;
        particles.push({
          x: boss.deathX + (Math.random() - 0.5) * 18,
          y: boss.deathY + (Math.random() - 0.5) * 18,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          color: ['#ff3366', '#ffd23f', '#ea580c', '#ffffff', '#c084fc'][Math.floor(Math.random() * 5)],
          size: Math.random() * 3.2 + 1.2,
          life: Math.random() * 0.5 + 0.45
        });
      }
      
      // After a short delay, complete boss death and start the sunrise transition!
      if (!boss.dyingTimer) boss.dyingTimer = 1.3;
      boss.dyingTimer -= dt;
      if (boss.dyingTimer <= 0) {
        bossMode = false;
        
        // Only trigger the slow cinematic night-to-day sunrise transition on the first defeat
        if (!birdSettings.cycleUnlocked) {
          skyTransitionActive = true;
          skyTransitionTimer = 0;
          skyTransitionDuration = 9.5; // slow cinematic beauty
          state = 'cutscene';
          triggerNotification("BOSS PURIFIED! ENJOY THE SUNRISE...", "success");
        } else {
          skyTransitionActive = false;
          state = 'playing'; // resume regular gameplay
          pipeTimer = PIPE_INT * 0.8; // breather room
          triggerNotification("BOSS PURIFIED! CONTINUING CHALLENGE...", "success");
        }

        boss = null;
        bossAlerts = [];
        fireballPowerUps = [];
        fireballs = [];
        darkFireballs = [];
        pipes = [];     // Clear active pipes
        powerUps = [];  // Clear powerups
        cameraY = 0;    // Ready camera
        
        score += 15; // Defeat bonus points!
        coins += 25; // Massive coins reward
        if (score > best) {
          best = score;
          localStorage.setItem('best', best);
        }
        birdSettings.cycleUnlocked = true;
        updateScoreUI();
        AudioEngine.playScore(); // sweet victory noise
        saveCustomization();
      }
    }
    
    // 6. Update active particles so explosions and feathers drift beautifully
    for (let i = particles.length - 1; i >= 0; i--) {
      const par = particles[i];
      par.x += par.vx * dt;
      par.y += par.vy * dt;
      par.life -= dt;
      if (par.life <= 0) particles.splice(i, 1);
    }
    
    // 7. Shake decay
    if (shakeAmount > 0) shakeAmount = Math.max(0, shakeAmount - dt * 8);
    
    // Prevent standard loops
    return;
  }

  if (state === 'playing') {
    if (cameraY > 0) {
      cameraY = Math.max(0, cameraY - dt * 16); // Smooth decay back to original layout
    }
  }

  if (canvasToastTimer > 0) {
    canvasToastTimer -= dt;
  }

  // Decay powerup collection screen flash
  if (screenFlashAlpha > 0) {
    screenFlashAlpha -= dt * 3.0; // fade out screen flash
    if (screenFlashAlpha < 0) screenFlashAlpha = 0;
  }

  // Update floating score and damage popups
  for (let i = scorePopups.length - 1; i >= 0; i--) {
    const pop = scorePopups[i];
    pop.y += pop.vy * dt;
    pop.life -= dt;
    if (pop.life <= 0) {
      scorePopups.splice(i, 1);
    }
  }

  const isBossPaused = bossMode && boss && (boss.state === 'introPaused' || boss.state === 'evolvedPaused');
  const gameplayDt = isBossPaused ? 0 : dt;

  // Decay the combo timer
  comboTimer -= gameplayDt;
  if (comboTimer <= 0) {
    comboCounter = 0;
  }

  // Determine game speed scale based on active states
  let speedScale = 1.0;
  if (slowMoMode) {
    slowMoTimer -= gameplayDt;
    if (slowMoTimer <= 0) {
      slowMoMode = false;
      // Engage recovery cushion grace period!
      slowMoGraceActive = true;
      slowMoGraceTimer = 1.8; // 1.8 sec padding!
      triggerNotification("TIME RUNOUT! RECOVERY CUSHION ACTIVE!", "success");
    }
  }

  // Decay recovery grace timer
  if (slowMoGraceActive) {
    slowMoGraceTimer -= gameplayDt;
    if (slowMoGraceTimer <= 0) {
      slowMoGraceActive = false;
      triggerNotification("RECOVERY CUSHION DISCHARGED", "error");
    }
  }

  if (dashMode) {
    speedScale = slowMoMode ? 2.2 : 3.6; // Stacking both scales speed beautifully
  } else if (slowMoMode) {
    speedScale = 0.45; // Smooth slow motion down to 45% speed
  }

  // Update background scroll offset based on scroll speed
  bgScrollOffset += PIPE_SPD * speedScale * gameplayDt;

  // Progress the nighttime-to-daytime morning dawn transition
  if (skyTransitionActive) {
    skyTransitionTimer += gameplayDt;
    if (skyTransitionTimer >= skyTransitionDuration) {
      skyTransitionTimer = skyTransitionDuration;
      skyTransitionActive = false;
      isDaytime = true; // completed transition to daytime!
    }
    const f = skyTransitionTimer / skyTransitionDuration;
    // Elegant, soft-toned, eye-friendly pastel sky morning transition
    SKY_TOP  = lerpColor('#111026', '#324e75', f);
    SKY_BOT  = lerpColor('#1a244d', '#6da2cc', f);
    GROUND_C = lerpColor('#22191b', '#3b2f2f', f);
    GRASS_C  = lerpColor('#1e4620', '#345e2a', f);
  }

  // ─── Trigger Boss Fight at score 50 ───
  if (score >= 50 && !bossMode && !bossFought) {
    bossFought = true;
    bossMode = true;
    slowMoMode = false;
    slowMoTimer = 0;
    dashMode = false;
    dashPipesRemaining = 0;
    pipes = [];
    powerUps = [];
    fireballPowerUps = [];
    fireballs = [];
    bossAlerts = [];
    boss = {
      x: W + 30,
      y: H / 2 - 30,
      targetY: H / 2,
      hp: 100,
      maxHp: 100,
      phase: 1,
      attackTimer: 2.0,
      fireballUpTimer: 3.5,
      floatPhase: 0,
      state: 'entering'
    };
    AudioEngine.playBossWarning();
    triggerNotification("WARNING: BOSS CHASSIS INBOUND!", "error");
  }

  // Update dynamic particle vectors
  for (let i = particles.length - 1; i >= 0; i--) {
    const par = particles[i];
    par.x += par.vx * gameplayDt * speedScale;
    par.y += par.vy * gameplayDt * speedScale;
    par.life -= gameplayDt;
    if (par.life <= 0) particles.splice(i, 1);
  }

  // Calculate bird physics
  if (bossMode && boss && (boss.state === 'evolving' || boss.state === 'entering' || boss.state === 'introPaused' || boss.state === 'evolvedPaused' || boss.state === 'dying')) {
    // Cinematic auto-flight smooth glide and hover using real dt so it's live/fluid even during paused states!
    bird.vy = 0;
    bird.angle = 0;
    bird.x += (32 - bird.x) * 4 * dt;
    bird.y += ((H - GROUND_H) / 2 - bird.y) * 4 * dt;
    bird.y += Math.sin(elapsed * 5) * 0.35; // gentle hover bobbing
    bird.flapTimer = Math.max(0, bird.flapTimer - dt);
  } else if (dashMode) {
    // Elegant glide directly to center channel
    bird.vy = 0;
    bird.y += (H / 2 - 12 - bird.y) * 0.12; 
    bird.angle = 0;
    
    // Constant jet spark tails while in hyper-drive
    for (let i = 0; i < 2; i++) {
      particles.push({
        x: bird.x - 6,
        y: bird.y + (Math.random() - 0.5) * 6,
        vx: -240 - Math.random() * 120,
        vy: (Math.random() - 0.5) * 60,
        color: ['#ff5e7e', '#ffd23f', '#ec4899'][Math.floor(Math.random() * 3)],
        size: Math.random() * 2.2 + 0.8,
        life: 0.55
      });
    }
  } else {
    bird.vy         += GRAVITY * gameplayDt * speedScale;
    bird.y          += bird.vy * gameplayDt * speedScale;
    bird.angle       = Math.min(Math.max(bird.vy * 0.16, -24), 75);
    bird.flapTimer   = Math.max(0, bird.flapTimer - (gameplayDt * speedScale));
  }

  // Handle pipe creation timing loops
  if (!bossMode) {
    pipeTimer -= gameplayDt * speedScale;
    if (pipeTimer <= 0) { 
      spawnPipe(); 
      pipeTimer = PIPE_INT; 
    }
  }

  // Move active pipes
  for (const p of pipes) {
    p.x -= PIPE_SPD * speedScale * gameplayDt;
  }
  pipes = pipes.filter(p => p.x + PIPE_W > -20); // slightly more off-screen buffer

  // Score validation & pass loops
  for (const p of pipes) {
    if (!p.scored && p.x + PIPE_W < bird.x) {
      p.scored = true; 
      
      if (dashMode) {
        score++; // Adds 1 per pipe passed (totaling 5 points during the dash!)
        scorePopups.push({
          x: bird.x,
          y: bird.y - 12,
          text: "+1",
          color: '#ec4899',
          life: 0.8,
          maxLife: 0.8,
          vy: -32
        });
        coins += 2; // Extra coins added as bonus
        dashPipesRemaining--;
        AudioEngine.playScore();
        comboCounter++;
        comboTimer = COMBO_TIMEOUT;
        
        // Spawn dash shred sparkle splash
        for (let i = 0; i < 10; i++) {
          particles.push({
            x: bird.x + 4, y: bird.y,
            vx: (Math.random() - 0.5) * 160,
            vy: (Math.random() - 0.5) * 160,
            color: '#ec4899',
            size: Math.random() * 2 + 1,
            life: 0.7
          });
        }

        if (dashPipesRemaining <= 0) {
          dashMode = false;
          bird.vy = JUMP_VEL * 0.65; // Soft hover bounce upon re-entry
          triggerNotification("HYPER-DASH DEPLOYED - RIGS RETURNED", "success");
        }
      } else {
        score++; 
        scorePopups.push({
          x: bird.x,
          y: bird.y - 12,
          text: "+1",
          color: '#ffd23f',
          life: 0.8,
          maxLife: 0.8,
          vy: -32
        });
        coins++;
        AudioEngine.playScore();
        comboCounter++;
        comboTimer = COMBO_TIMEOUT;
        
        // Basic score sparks
        for (let i = 0; i < 5; i++) {
          particles.push({
            x: bird.x, y: bird.y,
            vx: (Math.random() - 0.5) * 100,
            vy: (Math.random() - 0.5) * 100,
            color: '#ffd23f',
            size: Math.random() * 1.5 + 0.5,
            life: 0.6
          });
        }
      }
      
      if (comboCounter > maxCombo) {
        maxCombo = comboCounter;
      }
      
      if (score > best) { 
        best = score; 
        localStorage.setItem('best', best); 
      }
      saveCustomization();
      updateScoreUI();
    }
  }

  // Update powerups and check for collection
  for (let i = powerUps.length - 1; i >= 0; i--) {
    const p = powerUps[i];
    p.x -= PIPE_SPD * speedScale * gameplayDt;
    if (p.baseY === undefined) p.baseY = p.y;
    p.y = p.baseY + Math.sin(elapsed * 3 + p.pulsePhase) * 6;
    
    // Circular bounds intersection
    const pdx = p.x - bird.x;
    const pdy = p.y - bird.y;
    const dist = Math.sqrt(pdx*pdx + pdy*pdy);
    
    if (!p.collected && dist < (BIRD_R + p.radius + 3)) {
      p.collected = true;
      
      if (p.type === 'slowmo') {
        slowMoMode = true;
        slowMoTimer += 4.0; // Stacks slow mo time nicely!
        AudioEngine.playSlowMo();
        triggerNotification("CHRONOS CELL: SLOW-MO STACKED (+4s)", "success");
        screenFlashAlpha = 0.35;
        screenFlashColor = 'rgba(34, 211, 238, 0.45)'; // cyan glow
        
        for (let j = 0; j < 15; j++) {
          particles.push({
            x: p.x, y: p.y,
            vx: (Math.random() - 0.5) * 120,
            vy: (Math.random() - 0.5) * 120,
            color: '#22d3ee',
            size: Math.random() * 2 + 1,
            life: 0.85
          });
        }
      } else if (p.type === 'dash') {
        dashMode = true;
        dashPipesRemaining += 5; // Stacks 5 more immune dash pipes!
        AudioEngine.playDash();
        triggerNotification("DASH CORE ARMED: " + dashPipesRemaining + " PIPES IMMUNITY!", "success");
        screenFlashAlpha = 0.4;
        screenFlashColor = 'rgba(236, 72, 153, 0.45)'; // pink glow
        
        for (let j = 0; j < 25; j++) {
          particles.push({
            x: p.x, y: p.y,
            vx: (Math.random() - 0.3) * 180,
            vy: (Math.random() - 0.5) * 120,
            color: '#ec4899',
            size: Math.random() * 2.5 + 0.8,
            life: 0.95
          });
        }
      }
      
      powerUps.splice(i, 1);
      continue;
    }
    
    // Scrape out-of-bounds powerups
    if (p.x + p.radius < -20) {
      powerUps.splice(i, 1);
    }
  }

  // ─── Boss Update Subroutine ───
  if (bossMode && boss && boss.state !== 'dying') {
    if (boss.hitFlashTimer > 0) {
      boss.hitFlashTimer -= dt;
    }
    // Float boss up and down
    boss.floatPhase += dt * 3.5 * speedScale;
    boss.y = (H - GROUND_H) / 2 - 10 + Math.sin(boss.floatPhase) * 45;
    
    if (boss.state === 'entering') {
      boss.x -= dt * 50 * speedScale;
      if (boss.x <= W - 32) {
        boss.x = W - 32;
        boss.state = 'introPaused';
        AudioEngine.playBossWarning();
        triggerNotification("WARNING: BOSS CHASSIS INBOUND!", "error");
      }
    } else if (boss.state === 'active') {
      if (boss.phase === 1) {
        // Decrement alerts and spawns
        boss.attackTimer -= dt * speedScale;
        if (boss.attackTimer <= 0) {
          const pTop = Math.random() * ((H - GROUND_H - PIPE_GAP - 60) - 30) + 30;
          bossAlerts.push({
            y: pTop,
            timer: 1.1, // Warning flashes for 1.1s
            maxTimer: 1.1
          });
          boss.attackTimer = 2.4 + Math.random() * 1.2; // Spawn another pipe attack soon
        }
      } else {
        // Phase 2 Attack Logic: instead of spawning pipes, shoot dark magic fireballs!
        boss.attackTimer -= dt * speedScale;
        
        // Process projectile burst queue
        if (boss.burstRemaining > 0) {
          if (!boss.burstDelay) boss.burstDelay = 0;
          boss.burstDelay -= dt * speedScale;
          if (boss.burstDelay <= 0) {
            spawnDarkFireball();
            boss.burstRemaining--;
            boss.burstDelay = 0.22;
          }
        }
        
        if (boss.attackTimer <= 0) {
          // If HP <= 100, 50% chance to spawn 3 consecutive fireballs
          if (boss.hp <= 100 && Math.random() < 0.3) {
            boss.burstRemaining = 3;
            boss.burstDelay = 0.0; // Fire immediately, then 2 more follows
            triggerNotification("BURST MODE ACTIVE! DODGE!", "error");
          } else {
            spawnDarkFireball();
          }
          boss.attackTimer = 1.3 + Math.random() * 0.7; // fire rate slightly faster in phase 2!
        }
      }
      
      // Spawn fireball power-ups
      boss.fireballUpTimer -= dt * speedScale;
      if (boss.fireballUpTimer <= 0) {
        let y, collision;
        do {
          y = Math.random() * (H - GROUND_H - 100) + 50;
          collision = false;
          // Check for pipe collision
          for (const p of pipes) {
            if (Math.abs((W + 10) - p.x) < 40) {
              if (y < p.top || y > p.top + PIPE_GAP) {
                collision = true;
                break;
              }
            }
          }
        } while (collision);

        fireballPowerUps.push({
          x: W + 10,
          y: y,
          radius: boss.phase === 2 ? 6.5 : 5.5,
          pulsePhase: Math.random() * Math.PI * 2,
          collected: false,
          phase: boss.phase
        });
        boss.fireballUpTimer = boss.phase === 2 ? (3.0 + Math.random() * 1.5) : (4.5 + Math.random() * 2.0);
      }
    } else if (boss.state === 'evolving') {
      // Evolving sequence transitions boss into Phase 2!
      shakeAmount = 4.0;
      boss.x += (Math.random() - 0.5) * 4;
      boss.y += (Math.random() - 0.5) * 4;
      
      // Electric energy imploding vortex particles
      if (Math.random() < 0.5) {
        const angle = Math.random() * Math.PI * 2;
        const radius = 30 + Math.random() * 20;
        particles.push({
          x: boss.x + Math.cos(angle) * radius,
          y: boss.y + Math.sin(angle) * radius,
          vx: -Math.cos(angle) * 80,
          vy: -Math.sin(angle) * 80,
          color: '#f43f5e',
          size: Math.random() * 1.8 + 0.6,
          life: 0.45
        });
      }
      
      boss.evolvingTimer -= dt;
      if (boss.evolvingTimer <= 0) {
        boss.phase = 2;
        boss.hp = 300;
        boss.maxHp = 300;
        boss.state = 'evolvedPaused'; // Paused state instead of 'active'!
        boss.attackTimer = 1.3;
        boss.fireballUpTimer = 2.0;
        boss.burstRemaining = 0;
        boss.burstDelay = 0.0;
        AudioEngine.playBossWarning();
        triggerNotification("WARNING: ENEMY HAS EVOLVED!", "error");
      }
      
      if (!boss) {
        return;
      }
    }

    // Handle Boss Alerts
    for (let i = bossAlerts.length - 1; i >= 0; i--) {
      const alert = bossAlerts[i];
      alert.timer -= gameplayDt * speedScale;
      if (alert.timer <= 0) {
        // Spawn summoned pipe obstacle at Right of screen
        pipes.push({ x: W + 10, top: alert.y, scored: true }); // scored: true so player doesn't get normal pass points (boss HP counts)
        bossAlerts.splice(i, 1);
      }
    }

    // Handle Fireball Power-ups movement & collection
    for (let i = fireballPowerUps.length - 1; i >= 0; i--) {
      const p = fireballPowerUps[i];
      p.x -= PIPE_SPD * speedScale * gameplayDt * 0.9;
      if (p.baseY === undefined) p.baseY = p.y;
      p.y = p.baseY + Math.sin(elapsed * 5.5 + p.pulsePhase) * 3.5;
      
      // Check bounds
      if (p.x < -20) {
        fireballPowerUps.splice(i, 1);
        continue;
      }
      
      // Check bird collection
      const dx = p.x - bird.x;
      const dy = p.y - bird.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < (BIRD_R + p.radius + 3)) {
        p.collected = true;
        AudioEngine.playFireball();
        screenFlashAlpha = 0.3;
        screenFlashColor = p.phase === 2 ? 'rgba(236, 72, 153, 0.45)' : 'rgba(249, 115, 22, 0.45)';
        
        fireballs.push({
          x: bird.x,
          y: bird.y,
          vx: 120,
          vy: 0,
          phase: p.phase || 1
        });
        if (p.phase === 2) {
          triggerNotification("SUPER FIREBALL ARMED! (30 DMG)", "success");
        } else {
          triggerNotification("FIREBALL ARMED! (20 DMG)", "success");
        }
        
        // Sparks
        const sparkCol = p.phase === 2 ? '#ec4899' : '#f97316';
        const numSparks = p.phase === 2 ? 18 : 12;
        for (let k = 0; k < numSparks; k++) {
          particles.push({
            x: p.x, y: p.y,
            vx: (Math.random() - 0.5) * 120,
            vy: (Math.random() - 0.5) * 120,
            color: sparkCol,
            size: Math.random() * 2.5 + 1,
            life: 0.6
          });
        }
        fireballPowerUps.splice(i, 1);
      }
    }

    // Handle active targeted fireballs
    for (let i = fireballs.length - 1; i >= 0; i--) {
      const f = fireballs[i];
      // Track boss coordinate
      const dx = boss.x - f.x;
      const dy = boss.y - f.y; // Track center of boss
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist < 12) {
        // Impact!
        if (boss.state === 'active') {
          const dmg = f.phase === 2 ? 30 : 20;
          boss.hp -= dmg;
          boss.hitFlashTimer = 0.15;
          
          scorePopups.push({
            x: boss.x + (Math.random() - 0.5) * 16,
            y: boss.y - 12 + (Math.random() - 0.5) * 10,
            text: `-${dmg}`,
            color: f.phase === 2 ? '#ec4899' : '#ffd23f',
            life: 0.85,
            maxLife: 0.85,
            vy: -35
          });
          
          AudioEngine.playBossHit();
          shakeAmount = f.phase === 2 ? 8.0 : 5.0;
          
          if (boss.hp <= 0) {
            boss.hp = 0;
            if (boss.phase === 1) {
              boss.state = 'evolving';
              boss.evolvingTimer = 5.0; // 5 seconds of cinematic tension
              AudioEngine.playBossWarning();
              triggerNotification("WARNING: ENGINE OVERLOAD! EVOLVING...", "error");
              bossAlerts = [];
            } else {
              boss.state = 'dying';
              boss.dyingTimer = 1.3;
              AudioEngine.playBossDefeat();
              triggerNotification("BOSS DEFEATED! SYSTEM CLEANSED", "success");
              
              // Transition game state to cutscene immediately
              state = 'cutscene';
              skyTransitionActive = false;
              cameraY = 0;
              
              // Clear active obstacles immediately so bird auto-floats safely
              pipes = [];
              powerUps = [];
              darkFireballs = [];
              fireballs = [];
              fireballPowerUps = [];
            }
          } else {
            const hpPrefix = boss.phase === 1 ? "PH1" : "PH2";
            const hpMax = boss.phase === 1 ? 100 : 300;
            triggerNotification(`BOSS HIT! ${hpPrefix} HP: ${boss.hp}/${hpMax} (-${dmg})`, "error");
          }
        }
        
        // Impact spark explosion
        const explColor = f.phase === 2 ? '#ec4899' : '#facc15';
        const explSparks = f.phase === 2 ? 26 : 18;
        for (let k = 0; k < explSparks; k++) {
          particles.push({
            x: f.x, y: f.y,
            vx: (Math.random() - 0.5) * 180,
            vy: (Math.random() - 0.5) * 180,
            color: explColor,
            size: Math.random() * 3.5 + 1,
            life: 0.7
          });
        }
        
        fireballs.splice(i, 1);
      } else {
        if (!f.trail) f.trail = [];
        f.trail.push({ x: f.x, y: f.y });
        if (f.trail.length > 6) f.trail.shift();

        // Move fireball towards target
        const speed = 230;
        f.vx = (dx / dist) * speed;
        f.vy = (dy / dist) * speed;
        f.x += f.vx * gameplayDt * speedScale;
        f.y += f.vy * gameplayDt * speedScale;
        
        // Flame trails
        const listColors = f.phase === 2 ? ['#f43f5e', '#ec4899', '#fef08a', '#ff0055'] : ['#ff4500', '#ff8c00', '#ffd700'];
        const pSize = f.phase === 2 ? (Math.random() * 3.5 + 1.2) : (Math.random() * 2 + 0.5);
        particles.push({
          x: f.x, y: f.y,
          vx: -f.vx * 0.12 + (Math.random() - 0.5) * 30,
          vy: -f.vy * 0.12 + (Math.random() - 0.5) * 30,
          color: listColors[Math.floor(Math.random() * listColors.length)],
          size: pSize,
          life: f.phase === 2 ? 0.6 : 0.4
        });
        if (f.phase === 2) {
          // Additional burning spark
          particles.push({
            x: f.x, y: f.y,
            vx: -f.vx * 0.2 + (Math.random() - 0.5) * 40,
            vy: -f.vy * 0.2 + (Math.random() - 0.5) * 40,
            color: '#ffffff',
            size: Math.random() * 1.5 + 0.5,
            life: 0.3
          });
        }
      }
    }

    // Handle incoming bad dark magic fireballs
    for (let i = darkFireballs.length - 1; i >= 0; i--) {
      const f = darkFireballs[i];
      if (!f.trail) f.trail = [];
      f.trail.push({ x: f.x, y: f.y });
      if (f.trail.length > 6) f.trail.shift();

      f.x += f.vx * gameplayDt * speedScale;
      f.y += f.vy * gameplayDt * speedScale;
      
      // Check bounds
      if (f.x < -20) {
        darkFireballs.splice(i, 1);
        continue;
      }
      
      // Spark trail
      particles.push({
        x: f.x, y: f.y,
        vx: -f.vx * 0.1 + (Math.random() - 0.5) * 15,
        vy: -f.vy * 0.1 + (Math.random() - 0.5) * 15,
        color: ['#c084fc', '#8b5cf6', '#4c1d95'][Math.floor(Math.random() * 3)],
        size: Math.random() * 1.5 + 0.4,
        life: 0.3
      });
      
      // Collision with flight chassis (the bird)
      // Skip hit detection during cinematic transitions or until fireball has travelled a safe arming distance
      if (bossMode && boss && (boss.state === 'evolving' || boss.state === 'dying' || boss.state === 'entering')) continue;
      if (f.armX !== undefined && f.x > f.armX) continue;
      const dx = f.x - bird.x;
      const dy = f.y - bird.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < (BIRD_R + f.radius - 1.5)) {
        if (dashMode) {
          // Dash mode swallows/annihilates the dark magic blast!
          darkFireballs.splice(i, 1);
          AudioEngine.playBossHit();
          for (let k = 0; k < 10; k++) {
            particles.push({
              x: f.x, y: f.y,
              vx: (Math.random() - 0.5) * 120,
              vy: (Math.random() - 0.5) * 120,
              color: '#3b0764',
              size: Math.random() * 2 + 0.5,
              life: 0.4
            });
          }
          continue;
        } else if (slowMoGraceActive) {
          // Protected by the warm chrono recovery shield cushion: absorbs the hit, then disappears!
          slowMoGraceActive = false;
          darkFireballs.splice(i, 1);
          triggerNotification("SHIELD DISRUPTED! CAUTION!", "error");
          AudioEngine.playBossHit();
          for (let k = 0; k < 12; k++) {
            particles.push({
              x: bird.x, y: bird.y,
              vx: (Math.random() - 0.5) * 120,
              vy: (Math.random() - 0.5) * 120,
              color: '#fb923c',
              size: Math.random() * 2 + 0.8,
              life: 0.6
            });
          }
          continue;
        } else {
          // Player core terminated!
          state = 'dead';
          AudioEngine.playCrash();
          for (let k = 0; k < 20; k++) {
            particles.push({
              x: bird.x, y: bird.y,
              vx: (Math.random() - 0.5) * 200,
              vy: (Math.random() - 0.5) * 200 - 50,
              color: ['#a855f7', '#ff5e7e', '#ffd23f'],
              size: Math.random() * 2.5 + 0.8,
              life: 1.2
            });
          }
          shakeAmount = 2.4;
          showGameOver();
        }
      }
    }
  } else {
    // Clear stray fireballs if no boss is present
    fireballs = [];
    darkFireballs = [];
    fireballPowerUps = [];
    bossAlerts = [];
  }

  groundX = ((groundX - PIPE_SPD * speedScale * gameplayDt) % 20 + 20) % 20;

  // Collision checks
  if (checkCollision()) {
    state = 'dead';
    AudioEngine.playCrash();
    
    // Extreme death burst sparkles
    for (let i = 0; i < 18; i++) {
      particles.push({
        x: bird.x, y: bird.y,
        vx: (Math.random() - 0.5) * 200,
        vy: (Math.random() - 0.5) * 200 - 50,
        color: ['#ff5e7e', '#ffd23f', '#6366f1'][Math.floor(Math.random() * 3)],
        size: Math.random() * 2.5 + 0.8,
        life: 1.2
      });
    }
    
    shakeAmount = 2.4;
    showGameOver();
  }
  
  // Keep live metrics like combo badge perfectly synced in the DOM
  updateScoreUI();
}

// ─── Rendering Core Pipes ──────────────────────────────
function drawSun(opacity, customX, customY) {
  if (opacity <= 0) return;
  const sunX = customX !== undefined ? Math.round(customX) : Math.round(W / 2);
  const sunY = customY !== undefined ? Math.round(customY) : 55;
  
  ctx.fillStyle = `rgba(255, 94, 126, ${0.15 * opacity})`;
  ctx.fillRect(sunX - 35, sunY - 1, 70, 2);
  ctx.fillRect(sunX - 1, sunY - 35, 2, 70);
  ctx.fillRect(sunX - 18, sunY - 18, 2, 2);
  ctx.fillRect(sunX + 16, sunY - 18, 2, 2);
  ctx.fillRect(sunX - 18, sunY + 16, 2, 2);
  ctx.fillRect(sunX + 16, sunY + 16, 2, 2);
  
  const layers = [
    { r: 24, color: `rgba(255, 80, 110, ${0.18 * opacity})` },
    { r: 18, color: `rgba(255, 130, 40, ${0.45 * opacity})` },
    { r: 13, color: `rgba(255, 210, 50, ${0.8 * opacity})` },
    { r: 8,  color: `rgba(255, 245, 160, ${opacity})` }
  ];

  for (const layer of layers) {
    ctx.fillStyle = layer.color;
    const step = 2;
    for (let dy = -layer.r; dy <= layer.r; dy += step) {
      const hw = Math.sqrt(layer.r * layer.r - dy * dy);
      const roundedHW = Math.round(hw / 2) * 2;
      const currentY = Math.round((sunY + dy) / 2) * 2;
      
      const localY = currentY - sunY;
      if (localY > 2) {
        const gridY = Math.round(currentY);
        if (gridY % 6 === 0 || gridY % 6 === 2) {
          continue; 
        }
      }
      ctx.fillRect(sunX - roundedHW, currentY, roundedHW * 2, step);
    }
  }
}

function drawMoon(opacity, customX, customY) {
  if (opacity <= 0) return;
  const moonX = customX !== undefined ? Math.round(customX) : Math.round(W / 2);
  const moonY = customY !== undefined ? Math.round(customY) : 55;
  const radius = 15;

  ctx.fillStyle = `rgba(160, 180, 255, ${0.12 * opacity})`;
  ctx.beginPath();
  ctx.arc(moonX, moonY, radius + 11, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.fillStyle = `rgba(180, 200, 255, ${0.25 * opacity})`;
  ctx.beginPath();
  ctx.arc(moonX, moonY, radius + 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  // Enclosing rect
  ctx.rect(-100, -100, W+200, H+200);
  // Inner cutout circle (counter-clockwise)
  ctx.arc(moonX + 5, moonY - 4, radius - 1, 0, Math.PI * 2, true);
  ctx.clip();

  ctx.fillStyle = `rgba(240, 245, 255, ${0.95 * opacity})`;
  ctx.beginPath();
  ctx.arc(moonX, moonY, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSky() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, SKY_TOP); 
  g.addColorStop(1, SKY_BOT); 
  ctx.fillStyle = g; 
  ctx.fillRect(0, -60, W, H + 120);

  if (skyTransitionActive) {
    const f = skyTransitionTimer / skyTransitionDuration;
    // Draw fading moon setting to the right
    const moonX = W / 2 + f * (W / 2 + 35);
    const moonY = 55 + f * (145 - 55);
    const moonOpacity = Math.max(0, 1 - f * 1.5);
    drawMoon(moonOpacity, moonX, moonY);

    // Draw rising sun climbing from the left
    const sunX = -35 + f * (W / 2 + 35);
    const sunY = 145 - f * (145 - 55);
    const sunOpacity = Math.max(0, (f - 0.1) * 1.11);
    drawSun(sunOpacity, sunX, sunY);

  } else if (birdSettings.cycleUnlocked) {
    const theta = birdSettings.gameTime;

    // Continuous celestial coordinate orbit (180 degrees offset)
    const sunX = W / 2 - Math.cos(theta) * (W / 2 + 35);
    const sunY = 145 - Math.sin(theta) * 90;
    const sunOpacity = Math.max(0, Math.min(1, (Math.sin(theta) + 0.3) / 0.6));
    drawSun(sunOpacity, sunX, sunY);

    const moonAngle = theta + Math.PI;
    const moonX = W / 2 - Math.cos(moonAngle) * (W / 2 + 35);
    const moonY = 145 - Math.sin(moonAngle) * 90;
    const moonOpacity = Math.max(0, Math.min(1, (Math.sin(moonAngle) + 0.3) / 0.6));
    drawMoon(moonOpacity, moonX, moonY);

  } else if (isDaytime) {
      drawSun(1);
  } else {
      drawMoon(1);
  }
}

function drawStars() {
  let starAlpha = 1;
  if (birdSettings.cycleUnlocked && !skyTransitionActive) {
    const cyclePoint = (Math.sin(birdSettings.gameTime) + 1) / 2;
    starAlpha = 1 - Math.pow(cyclePoint, 0.5); // Fade stars quicker when day starts
  } else if (skyTransitionActive) {
    starAlpha = Math.max(0, 1 - (skyTransitionTimer / skyTransitionDuration));
  } else if (isDaytime) {
    starAlpha = 0;
  }
  
  if (starAlpha <= 0) return;

  for (const s of stars) {
    ctx.globalAlpha = (0.3 + 0.7 * Math.sin(elapsed * 2.5 + s.a * 10)) * 0.8 * starAlpha;
    ctx.fillStyle = STAR_C; 
    ctx.beginPath(); 
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); 
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawPineTree(x, y, height, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x - 1.5, y);
  ctx.lineTo(x, y - height);
  ctx.lineTo(x + 1.5, y);
  ctx.closePath();
  ctx.fill();
}

function drawMtFuji(centerX, groundY, f) {
  // Symmetrical Mt. Fuji volcanic silhouette with snowy peak
  const mountWidth = 62; // slimmer, more elegant Mount Fuji silhouette
  const mountHeight = 48; // tall profile
  const peakY = groundY - mountHeight;
  
  // High contrast palette: dark deep purple-grey silhouette
  const mountainCol = lerpColor('#0d0f19', '#151b2a', f);
  // Pure snow white turning pastel-colored during morning light
  const snowCol = lerpColor('#262d47', '#eceff4', f);
  const snowShadowCol = lerpColor('#1d2238', '#cbd5e1', f);
  
  // Draw main mountain body slope with sharp crater edges
  ctx.fillStyle = mountainCol;
  ctx.beginPath();
  ctx.moveTo(centerX - mountWidth, groundY);
  // Elegant curved volcanic slopes curving inwards towards summit peaks
  ctx.bezierCurveTo(centerX - mountWidth * 0.44, groundY - 3, centerX - 8, peakY + 8, centerX - 3, peakY);
  ctx.lineTo(centerX + 3, peakY);
  ctx.bezierCurveTo(centerX + 8, peakY + 8, centerX + mountWidth * 0.44, groundY - 3, centerX + mountWidth, groundY);
  ctx.lineTo(centerX - mountWidth, groundY);
  ctx.closePath();
  ctx.fill();
  
  // Draw majestic snowy peak - crafted so slopes perfectly align with the outer body bezier curve!
  ctx.fillStyle = snowCol;
  ctx.beginPath();
  ctx.moveTo(centerX - 6, peakY + 6);
  // Small bezier to replicate exactly the slope curve
  ctx.bezierCurveTo(centerX - 5, peakY + 4, centerX - 4, peakY + 1.5, centerX - 3, peakY);
  ctx.lineTo(centerX + 3, peakY);
  // Mirror down the opposite curve
  ctx.bezierCurveTo(centerX + 4, peakY + 1.5, centerX + 5, peakY + 4, centerX + 6, peakY + 6);
  // Jagged glacial melted edge inside the silhouette boundaries
  ctx.lineTo(centerX + 4.5, peakY + 4);
  ctx.lineTo(centerX + 2.5, peakY + 9);
  ctx.lineTo(centerX, peakY + 4.5);
  ctx.lineTo(centerX - 2.5, peakY + 8.5);
  ctx.lineTo(centerX - 4.5, peakY + 4);
  ctx.lineTo(centerX - 6, peakY + 6);
  ctx.closePath();
  ctx.fill();

  // Add the subtle shadowed side on the snowy peak
  ctx.fillStyle = snowShadowCol;
  ctx.beginPath();
  ctx.moveTo(centerX, peakY + 4.5);
  ctx.lineTo(centerX + 2.5, peakY + 9);
  ctx.lineTo(centerX + 4.5, peakY + 4);
  ctx.lineTo(centerX + 6, peakY + 6);
  ctx.bezierCurveTo(centerX + 5, peakY + 4, centerX + 4, peakY + 1.5, centerX + 3, peakY);
  ctx.lineTo(centerX, peakY);
  ctx.closePath();
  ctx.fill();

  // Draw clusters of custom pine trees on top of the volcano's base slopes as requested
  const treeCol = lerpColor('#06070e', '#0d111b', f);
  // Left Base Slopes
  for (let dx = -38; dx <= -15; dx += 5) {
    const treeX = centerX + dx;
    const tHeight = 5 + Math.abs(Math.sin(dx * 1.7)) * 2.0;
    const treeY = groundY;
    drawPineTree(treeX, treeY, tHeight, treeCol);
  }
  // Right Base Slopes
  for (let dx = 15; dx <= 38; dx += 5) {
    const treeX = centerX + dx;
    const tHeight = 5 + Math.abs(Math.sin(dx * 1.7)) * 2.0;
    const treeY = groundY;
    drawPineTree(treeX, treeY, tHeight, treeCol);
  }
}

function drawBackgroundElements() {
  let f = 0;
  if (birdSettings.cycleUnlocked && !skyTransitionActive) {
    f = (Math.sin(birdSettings.gameTime) + 1) / 2;
  } else if (skyTransitionActive) {
    f = skyTransitionTimer / skyTransitionDuration;
  } else {
    f = isDaytime ? 1 : 0;
  }
  
  // 1. Far Layer 0: Back Ridge (scroll factor 0.05)
  const hillsBgX = bgScrollOffset * 0.05;
  const hillColor = lerpColor('#101222', '#1b263b', f);
  const hillColorDark = lerpColor('#090a14', '#111b2d', f);
  
  // Back ridge
  ctx.fillStyle = hillColor;
  ctx.beginPath();
  ctx.moveTo(0, 196);
  for (let x = 0; x <= W; x += 8) {
    const worldX = x + hillsBgX;
    const yTop = 184 + 
                 Math.sin(worldX * 0.04) * 5 + 
                 Math.cos(worldX * 0.015) * 4;
    ctx.lineTo(x, yTop);
  }
  ctx.lineTo(W, 196);
  ctx.closePath();
  ctx.fill();

  // Draw trees directly on the Back Ridge where they seem fit (physically anchored to world coordinates to prevent vertical bobbing/floating!)
  const backForestColor = lerpColor('#0a0c16', '#121927', f);
  const backTreeSpacing = 11;
  const startWx = Math.floor(hillsBgX / backTreeSpacing) * backTreeSpacing - backTreeSpacing;
  const endWx = startWx + W + backTreeSpacing * 2;
  for (let wx = startWx; wx <= endWx; wx += backTreeSpacing) {
    const drawX = wx - hillsBgX;
    const yTop = 184 + 
                 Math.sin(wx * 0.04) * 5 + 
                 Math.cos(wx * 0.015) * 4;
    // Render only on the valleys and small peaks for a natural look
    const val = Math.sin(wx * 0.08);
    if (val > -0.4) {
      const h = 5 + Math.sin(wx * 0.22) * 2;
      drawPineTree(drawX, yTop, h, backForestColor);
    }
  }

  // 1b. Far Layer 1: Symmetrical Mt Fuji Range (scroll factor 0.02)
  // Drawn ON TOP of Back Ridge to cover far hills underneath Fuji's silhouette, eliminating any "behind Fuji" overlaps
  const fujiBgX = (bgScrollOffset * 0.02) % 220;
  for (let offset = -100; offset < W + 100; offset += 220) {
    const mX = offset - fujiBgX + 60; // offset centering
    drawMtFuji(mX, 196, f);
  }

  // 1d. Layer 3: Closer rolling hills (scroll speed 0.08)
  const closerHillsBgX = bgScrollOffset * 0.08;
  ctx.fillStyle = hillColorDark;
  ctx.beginPath();
  ctx.moveTo(0, 196);
  for (let x = 0; x <= W; x += 8) {
    const worldX = x + closerHillsBgX + 50; 
    const yTop = 188 + 
                 Math.cos(worldX * 0.035) * 6 + 
                 Math.sin(worldX * 0.018) * 3;
    ctx.lineTo(x, yTop);
  }
  ctx.lineTo(W, 196);
  ctx.closePath();
  ctx.fill();

  // Draw trees directly on top of the Closer rolling hills where they seem fit (physically anchored to world coordinates to prevent vertical bobbing/floating!)
  const closerForestColor = lerpColor('#04050a', '#080c14', f);
  const closerTreeSpacing = 13;
  const startCloserWx = Math.floor(closerHillsBgX / closerTreeSpacing) * closerTreeSpacing - closerTreeSpacing;
  const endCloserWx = startCloserWx + W + closerTreeSpacing * 2;
  for (let wx = startCloserWx; wx <= endCloserWx; wx += closerTreeSpacing) {
    const drawX = wx - closerHillsBgX;
    const worldX = wx + 50;
    const yTop = 188 + 
                 Math.cos(worldX * 0.035) * 6 + 
                 Math.sin(worldX * 0.018) * 3;
    // Don't clutter every single pixel; make them look clustered in grooves and ridges!
    const val = Math.cos(worldX * 0.05);
    if (val > -0.6) {
      const h = 7 + Math.sin(worldX * 0.18) * 3;
      drawPineTree(drawX, yTop + 0.5, h, closerForestColor);
    }
  }

  // 2. The Calm Sea Horizon Layer (Gradients corresponding to night/day light)
  const seaTopColor = lerpColor('#080c1e', '#1c344d', f);
  const seaBotColor = lerpColor('#0e152f', '#284666', f);
  
  const seaY = 196;
  const seaHeight = (H - GROUND_H) - seaY;
  const sg = ctx.createLinearGradient(0, seaY, 0, H - GROUND_H);
  sg.addColorStop(0, seaTopColor);
  sg.addColorStop(1, seaBotColor);
  ctx.fillStyle = sg;
  ctx.fillRect(0, seaY, W, seaHeight);

  // Sea reflection/glis waves
  ctx.strokeStyle = lerpColor('rgba(255, 255, 255, 0.06)', 'rgba(255, 255, 255, 0.16)', f);
  ctx.lineWidth = 0.5;
  const reflectionCycles = elapsed * 1.8;
  const glisLines = [
    { y: 202, speed: 6, len: 14 },
    { y: 211, speed: -4, len: 20 },
    { y: 219, speed: 8, len: 12 }
  ];
  for (const l of glisLines) {
    if (l.y < H - GROUND_H) {
      const lineX = ((reflectionCycles * l.speed) % (W + l.len) + (W + l.len)) % (W + l.len) - l.len;
      ctx.beginPath();
      ctx.moveTo(lineX, l.y);
      ctx.lineTo(lineX + l.len, l.y);
      ctx.stroke();
    }
  }

  // 2b. Dynamic Sailing Boats cruising sea independently and reflecting beautifully
  const boats = [
    { vx: 45, yOffset: 202, speedMultiplier: 9.0, parallaxFactor: 0.14, w: 13, h: 6, direction: -1 },
    { vx: 240, yOffset: 211, speedMultiplier: 6.5, parallaxFactor: 0.16, w: 11, h: 5, direction: 1 }
  ];

  for (const b of boats) {
    const wrapWidth = W + 60;
    let drawX = (b.vx + elapsed * b.direction * b.speedMultiplier);
    drawX = ((drawX % wrapWidth) + wrapWidth) % wrapWidth - 30;
    
    if (drawX > -25 && drawX < W + 25) {
      const bobY = Math.sin(elapsed * 2.5 + b.vx) * 0.7;
      const bY = b.yOffset + bobY;
      
      const boatWoodCol = lerpColor('#13090a', '#241a12', f);
      const boatSailCol = lerpColor('#323744', '#e2e5ec', f);
      const boatSailTrimCol = lerpColor('#4c101c', '#ff5e7e', f);

      // Wood hull of the boat
      ctx.fillStyle = boatWoodCol;
      ctx.beginPath();
      ctx.moveTo(drawX, bY - 2);
      ctx.lineTo(drawX + b.w, bY - 2);
      ctx.lineTo(drawX + b.w - 2, bY + 1);
      ctx.lineTo(drawX + 2, bY + 1);
      ctx.closePath();
      ctx.fill();
      
      // Thin mast
      ctx.fillRect(drawX + b.w * 0.4, bY - b.h - 1, 1, b.h);
      
      // Triangle sail
      ctx.fillStyle = boatSailCol;
      ctx.beginPath();
      ctx.moveTo(drawX + b.w * 0.4 + 1, bY - b.h);
      ctx.lineTo(drawX + b.w - 1, bY - 3);
      ctx.lineTo(drawX + b.w * 0.4 + 1, bY - 3);
      ctx.closePath();
      ctx.fill();

      // Small pixel flag on mast
      ctx.fillStyle = boatSailTrimCol;
      ctx.fillRect(drawX + b.w * 0.4 - 2, bY - b.h - 1, 2, 1.5);
    }
  }

  // 3. Spaced-out Shoreline village and nature (period of 600px, no repetitions in sight!)
  // We use High Contrast night/day schemes so shoreline NEVER blurs or disappears during the day!
  const W_space = 600;
  const housesBgX = (bgScrollOffset * 0.18) % W_space;
  const shorelineObjectsColor = lerpColor('#07080e', '#10141f', f);
  const rimLightColor = `rgba(255, 195, 80, ${f * 0.9})`;
  ctx.fillStyle = shorelineObjectsColor;

  const shorelineObjects = [
    { vx: 15, type: 'tree', h: 11 },
    { vx: 32, type: 'tree', h: 14 },
    { vx: 55, type: 'house', w: 10, h: 7 },
    { vx: 92, type: 'tree', h: 10 },
    { vx: 112, type: 'house_2story', w: 12, h: 14 },
    { vx: 135, type: 'tree', h: 13 },
    { vx: 155, type: 'house2', w: 12, h: 9 },
    { vx: 185, type: 'tree', h: 12 },
    { vx: 205, type: 'mansion', w: 22, h: 16 },
    { vx: 240, type: 'tree', h: 15 },
    { vx: 285, type: 'tree', h: 8 },
    { vx: 310, type: 'house_2story', w: 11, h: 15 },
    { vx: 340, type: 'house2', w: 14, h: 11 },
    { vx: 370, type: 'tree', h: 12 },
    { vx: 390, type: 'tree', h: 13 },
    { vx: 435, type: 'house', w: 9, h: 6 },
    { vx: 455, type: 'mansion', w: 24, h: 18 },
    { vx: 495, type: 'tree', h: 10 },
    { vx: 520, type: 'house_2story', w: 13, h: 13 },
    { vx: 555, type: 'tree', h: 14 }
  ];

  for (const obj of shorelineObjects) {
    let drawX = obj.vx - housesBgX;
    if (drawX < -30) drawX += W_space;
    const horizonY = H - GROUND_H; 

    // Only draw if we are close to or inside visual bounds
    if (drawX > -30 && drawX < W + 30) {
      if (obj.type === 'house') {
        ctx.fillRect(drawX, horizonY - obj.h, obj.w, obj.h);
        ctx.beginPath();
        ctx.moveTo(drawX - 1, horizonY - obj.h);
        ctx.lineTo(drawX + obj.w / 2, horizonY - obj.h - 4);
        ctx.lineTo(drawX + obj.w + 1, horizonY - obj.h);
        ctx.closePath();
        ctx.fill();

        // Tiny yellow ambient windows at night, fading out during dawn
        if (f < 0.6) {
          ctx.fillStyle = `rgba(255, 210, 63, ${1 - f / 0.6})`;
          ctx.fillRect(drawX + obj.w / 2 - 1, horizonY - obj.h / 2, 2, 2);
          ctx.fillStyle = shorelineObjectsColor; // restore
        }

        // Sunrise/Day peak/slope rim highlight outline
        if (f > 0.15) {
          ctx.strokeStyle = rimLightColor;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(drawX - 1, horizonY - obj.h);
          ctx.lineTo(drawX + obj.w / 2, horizonY - obj.h - 4);
          ctx.lineTo(drawX + obj.w + 1, horizonY - obj.h);
          ctx.stroke();
          ctx.fillStyle = shorelineObjectsColor; // restore
        }
      } else if (obj.type === 'house2') {
        ctx.fillRect(drawX, horizonY - obj.h, obj.w, obj.h);
        ctx.beginPath();
        ctx.moveTo(drawX - 1, horizonY - obj.h);
        ctx.lineTo(drawX + 5, horizonY - obj.h - 5);
        ctx.lineTo(drawX + obj.w + 1, horizonY - obj.h);
        ctx.closePath();
        ctx.fill();
        ctx.fillRect(drawX + obj.w - 3, horizonY - obj.h - 6, 2, 4); // Chimney

        if (f < 0.6) {
          ctx.fillStyle = `rgba(255, 210, 63, ${1 - f / 0.6})`;
          ctx.fillRect(drawX + 2, horizonY - 8, 2, 3);
          ctx.fillRect(drawX + obj.w - 4, horizonY - 8, 2, 3);
          ctx.fillStyle = shorelineObjectsColor; // restore
        }

        if (f > 0.15) {
          ctx.strokeStyle = rimLightColor;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(drawX - 1, horizonY - obj.h);
          ctx.lineTo(drawX + 5, horizonY - obj.h - 5);
          ctx.lineTo(drawX + obj.w + 1, horizonY - obj.h);
          ctx.stroke();
          ctx.fillStyle = shorelineObjectsColor;
        }
      } else if (obj.type === 'house_2story') {
        ctx.fillRect(drawX, horizonY - obj.h, obj.w, obj.h);
        ctx.beginPath();
        ctx.moveTo(drawX - 1, horizonY - obj.h);
        ctx.lineTo(drawX + obj.w / 2, horizonY - obj.h - 5);
        ctx.lineTo(drawX + obj.w + 1, horizonY - obj.h);
        ctx.closePath();
        ctx.fill();

        // Two stories of windows
        if (f < 0.6) {
          ctx.fillStyle = `rgba(255, 210, 63, ${1 - f / 0.6})`;
          // Top row windows
          ctx.fillRect(drawX + 2, horizonY - obj.h + 3, 2, 2);
          ctx.fillRect(drawX + obj.w - 4, horizonY - obj.h + 3, 2, 2);
          // Bottom row windows
          ctx.fillRect(drawX + 2, horizonY - obj.h / 2 + 1, 2, 2);
          ctx.fillRect(drawX + obj.w - 4, horizonY - obj.h / 2 + 1, 2, 2);
          ctx.fillStyle = shorelineObjectsColor; // restore
        }

        if (f > 0.15) {
          ctx.strokeStyle = rimLightColor;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(drawX - 1, horizonY - obj.h);
          ctx.lineTo(drawX + obj.w / 2, horizonY - obj.h - 5);
          ctx.lineTo(drawX + obj.w + 1, horizonY - obj.h);
          ctx.stroke();
          ctx.fillStyle = shorelineObjectsColor;
        }
      } else if (obj.type === 'mansion') {
        // Base main central body and side extensions
        ctx.fillRect(drawX, horizonY - obj.h * 0.7, obj.w, obj.h * 0.7); // main house body
        ctx.fillRect(drawX + obj.w * 0.25, horizonY - obj.h, obj.w * 0.5, obj.h); // central tall tower
        
        // Central tower roof peak
        ctx.beginPath();
        ctx.moveTo(drawX + obj.w * 0.2, horizonY - obj.h);
        ctx.lineTo(drawX + obj.w / 2, horizonY - obj.h - 6);
        ctx.lineTo(drawX + obj.w * 0.8, horizonY - obj.h);
        ctx.closePath();
        ctx.fill();

        // Left body roof peak
        ctx.beginPath();
        ctx.moveTo(drawX - 1, horizonY - obj.h * 0.7);
        ctx.lineTo(drawX + obj.w * 0.2, horizonY - obj.h * 0.7 - 4);
        ctx.lineTo(drawX + obj.w * 0.35, horizonY - obj.h * 0.7);
        ctx.closePath();
        ctx.fill();

        // Right body roof peak
        ctx.beginPath();
        ctx.moveTo(drawX + obj.w * 0.65, horizonY - obj.h * 0.7);
        ctx.lineTo(drawX + obj.w * 0.8, horizonY - obj.h * 0.7 - 4);
        ctx.lineTo(drawX + obj.w + 1, horizonY - obj.h * 0.7);
        ctx.closePath();
        ctx.fill();

        // Grand array of yellow lighted windows
        if (f < 0.6) {
          ctx.fillStyle = `rgba(255, 210, 63, ${1 - f / 0.6})`;
          // Tower window
          ctx.fillRect(drawX + obj.w / 2 - 1, horizonY - obj.h + 3, 2, 3);
          // Left wing windows
          ctx.fillRect(drawX + 3, horizonY - obj.h * 0.45, 2, 2);
          ctx.fillRect(drawX + 3, horizonY - obj.h * 0.2, 2, 2);
          // Right wing windows
          ctx.fillRect(drawX + obj.w - 5, horizonY - obj.h * 0.45, 2, 2);
          ctx.fillRect(drawX + obj.w - 5, horizonY - obj.h * 0.2, 2, 2);
          ctx.fillStyle = shorelineObjectsColor; // restore
        }

        if (f > 0.15) {
          ctx.strokeStyle = rimLightColor;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          // Left body roof
          ctx.moveTo(drawX - 1, horizonY - obj.h * 0.7);
          ctx.lineTo(drawX + obj.w * 0.2, horizonY - obj.h * 0.7 - 4);
          ctx.lineTo(drawX + obj.w * 0.35, horizonY - obj.h * 0.7);
          // Central tower roof
          ctx.moveTo(drawX + obj.w * 0.2, horizonY - obj.h);
          ctx.lineTo(drawX + obj.w / 2, horizonY - obj.h - 6);
          ctx.lineTo(drawX + obj.w * 0.8, horizonY - obj.h);
          // Right body roof
          ctx.moveTo(drawX + obj.w * 0.65, horizonY - obj.h * 0.7);
          ctx.lineTo(drawX + obj.w * 0.8, horizonY - obj.h * 0.7 - 4);
          ctx.lineTo(drawX + obj.w + 1, horizonY - obj.h * 0.7);
          ctx.stroke();
          ctx.fillStyle = shorelineObjectsColor;
        }
      } else if (obj.type === 'tree') {
        ctx.fillRect(drawX + 3, horizonY - obj.h, 1, obj.h); // trunk
        ctx.beginPath();
        ctx.moveTo(drawX, horizonY - 3);
        ctx.lineTo(drawX + 3.5, horizonY - obj.h);
        ctx.lineTo(drawX + 7, horizonY - 3);
        ctx.closePath();
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(drawX + 1, horizonY - 6);
        ctx.lineTo(drawX + 3.5, horizonY - obj.h - 2);
        ctx.lineTo(drawX + 6, horizonY - 6);
        ctx.closePath();
        ctx.fill();

        if (f > 0.15) {
          ctx.strokeStyle = rimLightColor;
          ctx.lineWidth = 0.8;
          ctx.beginPath();
          ctx.moveTo(drawX, horizonY - 3);
          ctx.lineTo(drawX + 3.5, horizonY - obj.h);
          ctx.moveTo(drawX + 1, horizonY - 6);
          ctx.lineTo(drawX + 3.5, horizonY - obj.h - 2);
          ctx.stroke();
          ctx.fillStyle = shorelineObjectsColor;
        }
      }
    }
  }

  // 4. Scrolling Clouds (period of 500px, beautiful variations)
  const W_clouds = 500;
  const cloudBgX = (bgScrollOffset * 0.04) % W_clouds;
  const cloudColorInterpolated = `rgba(${Math.round(70 + 170 * f)}, ${Math.round(80 + 165 * f)}, ${Math.round(120 + 135 * f)}, ${0.12 + 0.35 * f})`;
  
  const clouds = [
    { cx: 30, cy: 30, w: 22, h: 4 },
    { cx: 100, cy: 65, w: 32, h: 6 },
    { cx: 170, cy: 25, w: 18, h: 4 },
    { cx: 240, cy: 50, w: 26, h: 5 },
    { cx: 310, cy: 35, w: 20, h: 4 },
    { cx: 380, cy: 70, w: 36, h: 6 },
    { cx: 450, cy: 20, w: 24, h: 4 }
  ];

  ctx.fillStyle = cloudColorInterpolated;
  for (const cl of clouds) {
    let drawX = cl.cx - cloudBgX;
    if (drawX < -40) drawX += W_clouds;
    
    if (drawX > -40 && drawX < W + 40) {
      ctx.beginPath();
      ctx.arc(drawX, cl.cy, cl.h * 1.0, 0, Math.PI * 2);
      ctx.arc(drawX + cl.w * 0.4, cl.cy - cl.h * 0.6, cl.h * 1.4, 0, Math.PI * 2);
      ctx.arc(drawX + cl.w * 0.75, cl.cy - cl.h * 0.1, cl.h * 1.1, 0, Math.PI * 2);
      ctx.arc(drawX + cl.w, cl.cy, cl.h * 0.9, 0, Math.PI * 2);
      ctx.rect(drawX, cl.cy - cl.h, cl.w, cl.h * 2);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawGround() {
  ctx.fillStyle = GROUND_C; ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
  ctx.fillStyle = GRASS_C; ctx.fillRect(0, H - GROUND_H, W, 8);
  
  ctx.strokeStyle = 'rgba(0, 255, 0, 0.08)'; 
  ctx.lineWidth = 0.5;
  for (let x = -groundX; x < W + 10; x += 20) { 
    ctx.beginPath(); 
    ctx.moveTo(x, H - GROUND_H + 8); 
    ctx.lineTo(x, H); 
    ctx.stroke(); 
  }
}

function drawPipe(p) {
  const x = p.x, w = PIPE_W, topH = p.top, botY = p.top + PIPE_GAP, botH = H - GROUND_H - botY;
  
  ctx.fillStyle = PIPE_SHD; ctx.fillRect(x + 2, 0, w, topH); ctx.fillRect(x + 2, botY, w, botH);
  ctx.fillStyle = PIPE_C; ctx.fillRect(x, 0, w, topH); ctx.fillRect(x, botY, w, botH);
  ctx.fillStyle = PIPE_HI; ctx.fillRect(x + 3, 0, 5, topH); ctx.fillRect(x + 3, botY, 5, botH);
  
  const CAP_H = 12, CAP_W = w + 6, CAP_X = x - 3;
  ctx.fillStyle = PIPE_C; ctx.fillRect(CAP_X, topH - CAP_H, CAP_W, CAP_H); ctx.fillRect(CAP_X, botY, CAP_W, CAP_H);
  ctx.fillStyle = PIPE_HI; ctx.fillRect(CAP_X + 2, topH - CAP_H, 6, CAP_H); ctx.fillRect(CAP_X + 2, botY, 6, CAP_H);
}

function drawPowerUp(p) {
  if (p.collected) return;
  ctx.save();
  
  // Draw gorgeous glowing halo behind the powerup
  const glowRadius = p.radius + 4 + Math.sin(elapsed * 8) * 1.8;
  const glowGrad = ctx.createRadialGradient(p.x, p.y, p.radius - 1, p.x, p.y, glowRadius);
  if (p.type === 'slowmo') {
    glowGrad.addColorStop(0, 'rgba(6, 182, 212, 0.5)');
    glowGrad.addColorStop(1, 'rgba(6, 182, 212, 0)');
  } else {
    glowGrad.addColorStop(0, 'rgba(236, 72, 153, 0.5)');
    glowGrad.addColorStop(1, 'rgba(236, 72, 153, 0)');
  }
  ctx.save();
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(p.x, p.y, glowRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  
  ctx.shadowBlur = 6;
  if(p.type === 'slowmo') {
    ctx.shadowColor = '#06b6d4';
    ctx.fillStyle = '#0891b2';
    ctx.strokeStyle = '#22d3ee';
  } else {
    ctx.shadowColor = '#ec4899';
    ctx.fillStyle = '#db2777';
    ctx.strokeStyle = '#f472b6';
  }
  
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  
  // Draw letter
  ctx.fillStyle = '#ffffff';
  ctx.font = '6px "Orbitron"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 0;
  ctx.fillText(p.type === 'slowmo' ? 'S' : 'D', p.x, p.y + 0.5);
  
  ctx.restore();
}

function drawBird() {
  ctx.save(); 
  ctx.translate(bird.x, bird.y); 
  ctx.rotate(bird.angle * Math.PI / 180);

  if (dashMode) {
    ctx.shadowColor = '#ff5e7e';
    ctx.shadowBlur = 8;
  }

  if (birdSettings.style === 'robot') {
    ctx.fillStyle = '#27253d'; 
    ctx.fillRect(-8, -8, 16, 16);
    ctx.strokeStyle = '#6366f1'; 
    ctx.lineWidth = 1; 
    ctx.strokeRect(-8, -8, 16, 16);
    
    ctx.fillStyle = '#00ffff'; 
    ctx.fillRect(2, -4, 5, 2); 
    
    ctx.fillStyle = '#475569'; 
    ctx.beginPath(); ctx.moveTo(8, -1); ctx.lineTo(12, 0.5); ctx.lineTo(8, 2); ctx.closePath(); ctx.fill();

  } else if (birdSettings.style === 'golden') {
    // Beautiful gleaming 3D metallic circular gold body
    const goldGrad = ctx.createRadialGradient(-2.5, -2.5, 1, 0, 0, BIRD_R);
    goldGrad.addColorStop(0, '#ffffff'); // Gleaming light reflect
    goldGrad.addColorStop(0.35, '#fff176'); // Bright golden sheen
    goldGrad.addColorStop(0.7, '#ffd700'); // Pure classic gold
    goldGrad.addColorStop(0.92, '#d4af37'); // Antique dark gold edge shadow
    goldGrad.addColorStop(1, '#996515'); // Burnished gold border depth
    
    ctx.fillStyle = goldGrad;
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();

    // Specular golden outline
    ctx.strokeStyle = '#fffdeb';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Polished gold belly with physical-looking gradient
    const bellyGrad = ctx.createLinearGradient(-2, 3, 3, 5);
    bellyGrad.addColorStop(0, '#fffdd0');
    bellyGrad.addColorStop(0.5, '#ffd700');
    bellyGrad.addColorStop(1, '#aa7a1e');
    ctx.fillStyle = bellyGrad;
    ctx.beginPath();
    ctx.ellipse(2, 2.5, 4, 3, 0.3, 0, Math.PI * 2);
    ctx.fill();

    // Glittering shiny eye
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(4, -2.5, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Majestic deep sapphire pupil
    ctx.fillStyle = '#0f2042';
    ctx.beginPath();
    ctx.arc(4.8, -2.2, 1.2, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(5.2, -2.6, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Burnished real gold beak
    const beakGrad = ctx.createLinearGradient(7, -1, 11, 2);
    beakGrad.addColorStop(0, '#fff176');
    beakGrad.addColorStop(1, '#b57c1e');
    ctx.fillStyle = beakGrad;
    ctx.beginPath();
    ctx.moveTo(7, -1);
    ctx.lineTo(11, 0.5);
    ctx.lineTo(7, 2);
    ctx.closePath();
    ctx.fill();

  } else {
    ctx.fillStyle = birdSettings.color; 
    ctx.beginPath(); ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = BIRD_BEL; 
    ctx.beginPath(); ctx.ellipse(2, 2.5, 4, 3, 0.3, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = EYE_C; 
    ctx.beginPath(); ctx.arc(4, -2.5, 2.5, 0, Math.PI * 2); ctx.fill();

    if (birdSettings.style === 'cute') {
      ctx.fillStyle = '#ff70a6'; ctx.beginPath(); ctx.arc(2.5, 1, 1.8, 0, Math.PI * 2); ctx.fill(); 
      ctx.fillStyle = PUPIL_C; ctx.beginPath(); ctx.arc(4.8, -2.2, 1.5, 0, Math.PI * 2); ctx.fill(); 
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(5.3, -2.7, 0.5, 0, Math.PI * 2); ctx.fill(); 
    } else {
      ctx.fillStyle = PUPIL_C; ctx.beginPath(); ctx.arc(4.8, -2.2, 1.2, 0, Math.PI * 2); ctx.fill(); 
    }

    if (birdSettings.style === 'angry') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = 1.2; 
      ctx.beginPath(); ctx.moveTo(1, -5); ctx.lineTo(6.5, -3.5); ctx.stroke(); 
      ctx.fillStyle = 'rgba(211, 47, 47, 0.6)'; ctx.fillRect(1, 0.5, 2.5, 1.5); 
    }

    ctx.fillStyle = '#ff6f00'; 
    ctx.beginPath(); ctx.moveTo(7, -1); ctx.lineTo(11, 0.5); ctx.lineTo(7, 2); ctx.closePath(); ctx.fill();
  }

  drawWingStyle(); 
  drawAccessory(); 
  
  // Draw Chrono-Shield Recovery Bubble
  if (slowMoGraceActive) {
    ctx.save();
    ctx.rotate(-bird.angle * Math.PI / 180); // keep shield orbit independent of bird pitch!
    ctx.strokeStyle = `rgba(251, 146, 60, ${0.4 + Math.sin(elapsed * 15) * 0.25})`; // glowing orange pulses
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R + 5, 0, Math.PI * 2);
    ctx.stroke();
    
    // Tiny orbiting shield nodes
    ctx.fillStyle = '#fdba74';
    const numOrbits = 3;
    for (let k = 0; k < numOrbits; k++) {
      const theta = elapsed * 8 + (k * Math.PI * 2 / numOrbits);
      ctx.beginPath();
      ctx.arc(Math.cos(theta) * (BIRD_R + 5), Math.sin(theta) * (BIRD_R + 5), 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawBoss() {
  if (!boss) return;
  
  const isDying = boss.state === 'dying';
  const dyingPct = isDying ? Math.max(0, Math.min(1, boss.dyingTimer / 1.3)) : 1.0;
  
  ctx.save();
  ctx.translate(boss.x, boss.y);
  
  let baseScale = 1.0;
  if (boss.phase === 2) {
    baseScale = 1.45;
  }
  if (boss.state === 'evolving') {
    baseScale = 1.0 + Math.abs(Math.sin(elapsed * 24)) * 0.25;
  }
  
  let scale = baseScale + Math.sin(elapsed * 8) * 0.05;
  if (isDying) {
    scale = baseScale * dyingPct;
    ctx.globalAlpha = dyingPct;
  }
  ctx.scale(scale, scale);
  
  const grad = ctx.createRadialGradient(-3, -3, 2, 0, 0, 14);
  const flash = (isDying && (Math.floor(elapsed * 24) % 2 === 0)) || (boss.hitFlashTimer && boss.hitFlashTimer > 0);
  
  if (flash) {
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#fdbc3f');
    grad.addColorStop(1, '#ffffff');
  } else if (boss.phase === 2) {
    grad.addColorStop(0, '#f43f5e'); // crimson
    grad.addColorStop(0.5, '#991b1b'); // deep ruby red
    grad.addColorStop(1, '#111827'); // dark background void
  } else {
    grad.addColorStop(0, '#7c3aed'); // neon violet
    grad.addColorStop(0.6, '#4c1d95'); // deep purple
    grad.addColorStop(1, '#1e1b4b'); // dark navy
  }
  ctx.fillStyle = grad;
  
  ctx.beginPath();
  ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = flash ? '#ffffff' : (boss.phase === 2 ? '#fecdd3' : '#e9d5ff');
  ctx.stroke();
  
  // Inner core
  ctx.fillStyle = flash ? '#ffffff' : (boss.phase === 2 ? '#0f172a' : '#1e293b');
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = boss.phase === 2 ? '#b91c1c' : '#64748b';
  ctx.lineWidth = 0.8;
  ctx.stroke();
  
  // Laser eye
  const eyePulse = Math.abs(Math.sin(elapsed * 12));
  ctx.fillStyle = boss.phase === 2 ? '#ff003c' : '#ef4444';
  ctx.beginPath();
  ctx.arc(0, 0, 3.5 + eyePulse * 1.5, 0, Math.PI * 2);
  ctx.fill();
  
  // Reflection speck
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(0.8, -0.8, 1, 0, Math.PI * 2);
  ctx.fill();
  
  // Pulsing antenna with warning light
  ctx.strokeStyle = boss.phase === 2 ? '#ef4444' : '#a21caf';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -13);
  ctx.lineTo(Math.sin(elapsed*5.5)*3, -20);
  ctx.stroke();
  
  // blinking light
  ctx.fillStyle = boss.phase === 2 
    ? (Math.floor(elapsed * 10) % 2 === 0 ? '#ff0055' : '#000000') 
    : (Math.floor(elapsed * 7) % 2 === 0 ? '#fbbf24' : '#f87171');
  ctx.beginPath();
  ctx.arc(Math.sin(elapsed*5.5)*3, -20, 2.5, 0, Math.PI * 2);
  ctx.fill();
  
  // Evolving electric ring effect
  if (boss.state === 'evolving') {
    ctx.strokeStyle = '#c084fc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 18 + Math.sin(elapsed * 20) * 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  
  ctx.restore();
  
  // Shockwave blast rings that expand out from the exploding boss
  if (isDying) {
    ctx.save();
    // Several expanding rings
    const maxRadius = 40;
    const currentRadius = (1 - dyingPct) * maxRadius;
    
    ctx.strokeStyle = `rgba(255, 255, 255, ${dyingPct})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, currentRadius, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.strokeStyle = `rgba(251, 146, 60, ${dyingPct * 0.8})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, currentRadius * 0.65, 0, Math.PI * 2);
    ctx.stroke();
    
    // Core expansion flare
    ctx.fillStyle = `rgba(255, 253, 214, ${dyingPct * 0.6})`;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, Math.max(1, currentRadius * 0.3), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return; // SKIP drawing health bar and dialogue bubbles!
  }
  
  // Health bar above boss
  const hpW = boss.phase === 2 ? 46 : 34;
  const hpH = 4;
  const hpx = boss.x - hpW / 2;
  const hpy = boss.phase === 2 ? boss.y - 27 : boss.y - 23;
  
  ctx.fillStyle = '#1e1b4d';
  ctx.fillRect(hpx, hpy, hpW, hpH);
  
  if (boss.displayHp === undefined) boss.displayHp = boss.hp;
  boss.displayHp += (boss.hp - boss.displayHp) * 0.1;
  const fillW = hpW * (boss.displayHp / boss.maxHp);
  ctx.fillStyle = boss.phase === 2 ? '#f43f5e' : '#ef4444';
  ctx.fillRect(hpx, hpy, fillW, hpH);
  
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.5;
  ctx.strokeRect(hpx, hpy, hpW, hpH);
  
  // Label
  ctx.fillStyle = boss.phase === 2 ? '#f43f5e' : '#ffd23f';
  ctx.font = '6px "Orbitron"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  
  let labelText = 'BOSS HP';
  let phaseText = 'PHASE 1';
  if (boss.state === 'evolving') {
    labelText = 'EVOLVING...';
    phaseText = 'TRANSITION';
  } else if (boss.phase === 2) {
    labelText = 'SHADOW CHASSIS';
    phaseText = 'PHASE 2';
  }
  
  // Render stacked high-fidelity labels
  ctx.fillText(labelText, boss.x, hpy - 9);
  
  ctx.save();
  ctx.font = 'bold 5px "Orbitron"';
  ctx.fillStyle = boss.phase === 2 ? '#fb7185' : '#fef08a';
  ctx.fillText(phaseText, boss.x, hpy - 3);
  ctx.restore();

  // ─── Draw Boss Dialogue Bubble during Evolving Scene ───
  if (boss.state === 'evolving') {
    ctx.save();
    // Position bubble above the boss HP bar
    const bx = boss.x - 24;
    const by = hpy - 22;
    const bw = 95;
    const bh = 14;
    
    // Bubble drop shadow
    ctx.fillStyle = '#000000';
    ctx.fillRect(bx - bw/2 + 1, by - bh/2 + 1, bw, bh);
    
    // Bubble body background
    ctx.fillStyle = '#0f0e22';
    ctx.fillRect(bx - bw/2, by - bh/2, bw, bh);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - bw/2, by - bh/2, bw, bh);
    
    // Speech bubble pointer pointing downward towards the boss
    ctx.fillStyle = '#0f0e22';
    ctx.beginPath();
    ctx.moveTo(bx + 12, by + bh/2);
    ctx.lineTo(bx + 18, by + bh/2 + 5);
    ctx.lineTo(bx + 22, by + bh/2);
    ctx.closePath();
    ctx.fill();
    
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(bx + 12, by + bh/2);
    ctx.lineTo(bx + 18, by + bh/2 + 5);
    ctx.lineTo(bx + 22, by + bh/2);
    ctx.stroke();
    
    // Crimson dialogue text
    ctx.fillStyle = '#f43f5e';
    ctx.font = '5.5px \"Orbitron\"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText("IM NOT DONE YET!", bx, by + 0.5);
    ctx.restore();
  }
}

function drawFireballPowerUp(p) {
  if (p.collected) return;
  ctx.save();
  const hoverY = p.y;
  const isP2 = p.phase === 2;
  
  // Draw gorgeous glowing halo behind the fireball powerup
  const glowRadius = p.radius + 5 + Math.sin(elapsed * 9) * 2;
  const glowGrad = ctx.createRadialGradient(p.x, hoverY, p.radius - 1, p.x, hoverY, glowRadius);
  glowGrad.addColorStop(0, isP2 ? 'rgba(236, 72, 153, 0.55)' : 'rgba(249, 115, 22, 0.55)');
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.save();
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(p.x, hoverY, glowRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  
  if (isP2) {
    // Phase 2 Super Hyper-charged Powerup
    // 1. Draw glowing background magical circle grid (pixel style box flares)
    ctx.fillStyle = `rgba(236, 72, 153, ${0.15 + Math.sin(elapsed * 12) * 0.05})`;
    ctx.fillRect(p.x - 11, hoverY - 1, 22, 2);
    ctx.fillRect(p.x - 1, hoverY - 11, 2, 22);
    
    // Dynamic outer energy ring
    ctx.beginPath();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 1.0;
    ctx.arc(p.x, hoverY, p.radius + 3 + Math.sin(elapsed * 10) * 1.5, 0, Math.PI * 2);
    ctx.stroke();

    // Large glowing hyper plasma ball
    ctx.shadowBlur = 10;
    ctx.shadowColor = '#ec4899';
    ctx.fillStyle = '#db2777';
    ctx.strokeStyle = '#fbcfe8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, hoverY, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Flame spike double trail back
    ctx.fillStyle = '#f43f5e';
    ctx.beginPath();
    ctx.moveTo(p.x - 5, hoverY - 8);
    ctx.lineTo(p.x + 8, hoverY - 2);
    ctx.lineTo(p.x - 3, hoverY);
    ctx.lineTo(p.x + 8, hoverY + 2);
    ctx.lineTo(p.x - 5, hoverY + 8);
    ctx.closePath();
    ctx.fill();
    
    // Super Level symbol 'F⁺'
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 6.5px \"Orbitron\"';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.shadowBlur = 0;
    ctx.fillText('F⁺', p.x, hoverY - 0.5);
  } else {
    // Phase 1 Standard Fireball Powerup
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#f97316';
    ctx.fillStyle = '#ea580c';
    ctx.strokeStyle = '#fdba74';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(p.x, hoverY, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    
    // Flame spike trail back
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(p.x - 3, hoverY - 5);
    ctx.lineTo(p.x + 5, hoverY);
    ctx.lineTo(p.x - 3, hoverY + 5);
    ctx.closePath();
    ctx.fill();
    
    // Label Character 'F'
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 5.6px \"Orbitron\"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowBlur = 0;
    ctx.fillText('F', p.x, hoverY);
  }
  
  ctx.restore();
}

function drawFireball(f) {
  const isP2 = f.phase === 2;
  // Render historical trail circles
  if (f.trail) {
    for (let i = 0; i < f.trail.length; i++) {
      const pt = f.trail[i];
      const ratio = (i + 1) / f.trail.length;
      ctx.save();
      ctx.globalAlpha = ratio * 0.45;
      ctx.fillStyle = isP2 ? '#db2777' : '#ea580c';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, (isP2 ? 5.5 : 3.5) * ratio, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.save();
  if (isP2) {
    // Hyper-charged Giga Fireball
    ctx.shadowBlur = 14;
    ctx.shadowColor = '#ec4899';
    ctx.fillStyle = '#db2777';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 6.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Vibrant Orange-yellow ring
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4.2, 0, Math.PI * 2);
    ctx.fill();

    // Center white hot laser kernel
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 2.4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Standard Level 1 Fireball
    ctx.shadowBlur = 9;
    ctx.shadowColor = '#ef4444';
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    
    // Center yellow kernel
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(f.x, f.y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawDarkFireball(f) {
  // Render historical trail circles
  if (f.trail) {
    for (let i = 0; i < f.trail.length; i++) {
      const pt = f.trail[i];
      const ratio = (i + 1) / f.trail.length;
      ctx.save();
      ctx.globalAlpha = ratio * 0.45;
      ctx.fillStyle = '#581c87';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5 * ratio, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  ctx.save();
  ctx.shadowBlur = 9;
  ctx.shadowColor = '#c084fc';
  ctx.fillStyle = '#581c87';
  ctx.beginPath();
  ctx.arc(f.x, f.y, 4.5, 0, Math.PI * 2);
  ctx.fill();
  
  // Center light magenta kernel
  ctx.fillStyle = '#f3e8ff';
  ctx.beginPath();
  ctx.arc(f.x, f.y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHUD() {
  // Screen Tints based on state
  if (slowMoMode && dashMode) {
    ctx.fillStyle = 'rgba(147, 51, 234, 0.08)';
    ctx.fillRect(0, 0, W, H);
  } else if (slowMoMode) {
    ctx.fillStyle = 'rgba(34, 211, 238, 0.08)';
    ctx.fillRect(0, 0, W, H);
  } else if (dashMode) {
    ctx.fillStyle = 'rgba(236, 72, 153, 0.08)';
    ctx.fillRect(0, 0, W, H);
  }
  
  let yOffset = 26;
  if (slowMoMode) {
    ctx.save();
    // Gorgeous dark badge panel
    ctx.fillStyle = 'rgba(10, 10, 22, 0.85)';
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 0.5;
    ctx.fillRect(5, yOffset - 6, 62, 9);
    ctx.strokeRect(5, yOffset - 6, 62, 9);
    
    // Tiny Clock Icon beside slow-mo buff
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(10, yOffset - 1.5, 2.5, 0, Math.PI * 2);
    ctx.stroke();
    // Clock hands
    ctx.beginPath();
    ctx.moveTo(10, yOffset - 1.5);
    ctx.lineTo(10, yOffset - 3);
    ctx.moveTo(10, yOffset - 1.5);
    ctx.lineTo(11.5, yOffset - 1.5);
    ctx.stroke();

    // High fidelity countdown text
    ctx.fillStyle = '#22d3ee';
    ctx.font = 'bold 5.5px "Orbitron"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('SLOWM ' + slowMoTimer.toFixed(1) + 's', 15, yOffset - 1.5);
    ctx.restore();
    
    yOffset += 11;
  }
  
  if (dashMode) {
    ctx.save();
    // Gorgeous dark badge panel
    ctx.fillStyle = 'rgba(10, 10, 22, 0.85)';
    ctx.strokeStyle = '#ec4899';
    ctx.lineWidth = 0.5;
    ctx.fillRect(5, yOffset - 6, 62, 9);
    ctx.strokeRect(5, yOffset - 6, 62, 9);
    
    // Tiny Lightning Bolt Icon beside active dash
    ctx.fillStyle = '#ec4899';
    ctx.beginPath();
    ctx.moveTo(11, yOffset - 4.5);
    ctx.lineTo(8.5, yOffset - 2);
    ctx.lineTo(10.5, yOffset - 2);
    ctx.lineTo(9.2, yOffset + 1);
    ctx.lineTo(11.8, yOffset - 1);
    ctx.lineTo(10, yOffset - 1);
    ctx.closePath();
    ctx.fill();

    // Countdown text for Dash remaining pipes
    ctx.fillStyle = '#ec4899';
    ctx.font = 'bold 5.5px "Orbitron"';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('DASH ' + dashPipesRemaining.toString() + ' P', 15, yOffset - 1.5);
    ctx.restore();
    
    yOffset += 11;
  }
}

function drawCanvasNotification() {
  if (canvasToastTimer <= 0 || !canvasToastMsg) return;
  
  ctx.save();
  
  const bx = 4;
  const by = 196;
  const bw = W - 8;
  const bh = 15;
  
  // Outer shadow background
  ctx.fillStyle = '#0a0a16';
  ctx.fillRect(bx + 1, by + 1, bw, bh);
  
  // Inside container background
  ctx.fillStyle = '#111026';
  ctx.fillRect(bx, by, bw, bh);
  
  // Style according to warning, success, or default
  if (canvasToastType === 'error') {
    ctx.strokeStyle = '#ef4444';
    ctx.fillStyle = '#b91c1c';
  } else if (canvasToastType === 'success') {
    ctx.strokeStyle = '#10b981';
    ctx.fillStyle = '#047857';
  } else {
    ctx.strokeStyle = '#6366f1';
    ctx.fillStyle = '#4338ca';
  }
  
  ctx.lineWidth = 1;
  ctx.strokeRect(bx, by, bw, bh);
  
  // Left and Right pixel accents to give premium retro cart feel
  ctx.fillRect(bx, by, 3, bh);
  ctx.fillRect(bx + bw - 3, by, 3, bh);
  
  ctx.fillStyle = '#ffffff';
  ctx.font = '6px "Orbitron"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.fillText(canvasToastMsg, W / 2, by + bh / 2 + 0.5);
  
  ctx.restore();
}

function drawBossPauseOverlay() {
  if (!bossMode || !boss) return;
  if (boss.state !== 'introPaused' && boss.state !== 'evolvedPaused') return;
  
  ctx.save();
  
  const width = 144;
  const height = 90;
  const x = (W - width) / 2;
  const y = (H - height) / 2 - 10;
  
  // Outer shadow
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fillRect(x + 3, y + 3, width, height);
  
  // Background box
  ctx.fillStyle = '#111026';
  ctx.fillRect(x, y, width, height);
  
  // Yellow/crimson arcade strobe borders
  const flash = Math.floor(elapsed * 4) % 2 === 0;
  ctx.strokeStyle = flash ? '#f97316' : '#ef4444';
  ctx.lineWidth = 1.8;
  ctx.strokeRect(x, y, width, height);
  
  // High-fidelity arcade alert stripes on left/right margins inside the box
  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, width - 2, height - 2);
  ctx.clip();
  
  // Draw yellow-black diagonal hazard stripes across the top and bottom of the box
  const stripeWidth = 6;
  ctx.fillStyle = '#fb923c';
  for (let sx = -stripeWidth; sx < width + stripeWidth; sx += stripeWidth * 2) {
    // Top border stripes
    ctx.beginPath();
    ctx.moveTo(x + sx, y + 1);
    ctx.lineTo(x + sx + stripeWidth, y + 1);
    ctx.lineTo(x + sx + stripeWidth - 4, y + 5);
    ctx.lineTo(x + sx - 4, y + 5);
    ctx.closePath();
    ctx.fill();
    
    // Bottom border stripes
    ctx.beginPath();
    ctx.moveTo(x + sx, y + height - 5);
    ctx.lineTo(x + sx + stripeWidth, y + height - 5);
    ctx.lineTo(x + sx + stripeWidth - 4, y + height - 1);
    ctx.lineTo(x + sx - 4, y + height - 1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
  
  // Inner dark rectangle for main text to prevent stripe overlap issues
  ctx.fillStyle = '#060514';
  ctx.fillRect(x + 6, y + 6, width - 12, height - 12);
  ctx.strokeStyle = '#312e81';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 6, y + 6, width - 12, height - 12);

  // Warning text
  ctx.font = 'bold 7px "Orbitron"';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 3;
  
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Warning Icon
  ctx.fillStyle = '#f43f5e';
  ctx.fillText('\u26A1 WARNING \u26A1', W / 2, y + 16);
  
  ctx.font = '5.5px \"Orbitron\"';
  ctx.fillStyle = '#ffffff';
  
  if (boss.state === 'introPaused') {
    ctx.fillText('BOSS ENCOUNTERED!', W / 2, y + 32);
    ctx.fillStyle = '#a78bfa';
    ctx.fillText('EVADE BAD PROJECTILES', W / 2, y + 43);
    ctx.fillText('AND DEPLOY CORES!', W / 2, y + 51);
  } else {
    ctx.fillText('ENEMY EVOLVED!', W / 2, y + 32);
    ctx.fillStyle = '#fb7185';
    ctx.fillText('SPEED INCREASED!', W / 2, y + 43);
    ctx.fillText('FIREBALLS ACTIVE!', W / 2, y + 51);
  }
  
  // Blinking instruction footer
  const blink = Math.floor(elapsed * 3) % 2 === 0;
  ctx.fillStyle = blink ? '#fb923c' : '#ffffff';
  ctx.font = 'bold 6px \"Orbitron\"';
  ctx.fillText('TAP OR SPACE TO JUMP', W / 2, y + 71);
  
  ctx.restore();
}

function drawFrostyFilters() {
  if (!slowMoMode) return;
  
  // 1. Pale blue temperature freeze filter overlay
  ctx.save();
  ctx.fillStyle = 'rgba(173, 216, 230, 0.12)';
  ctx.fillRect(0, 0, W, H);
  
  // 2. Frozen/icy screen-edge vignette (Pixel-perfect stepped icicles or frosted frame)
  ctx.fillStyle = 'rgba(224, 242, 254, 0.45)';
  // Top edge icicles (stepped jagged teeth)
  for (let x = 0; x <= W; x += 6) {
    const iceH = 4 + Math.sin(x * 0.12 + elapsed * 2) * 3;
    ctx.beginPath();
    ctx.moveTo(x - 3, 0);
    ctx.lineTo(x, iceH);
    ctx.lineTo(x + 3, 0);
    ctx.closePath();
    ctx.fill();
  }
  // Bottom edge icy spikes
  for (let x = 0; x <= W; x += 8) {
    const iceH = 3 + Math.cos(x * 0.08 + elapsed * 1.5) * 2;
    ctx.beginPath();
    ctx.moveTo(x - 4, H);
    ctx.lineTo(x, H - iceH);
    ctx.lineTo(x + 4, H);
    ctx.closePath();
    ctx.fill();
  }
  
  // Outer frame glow
  ctx.strokeStyle = '#93c5fd';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(0, 0, W, H);
  
  // 3. Gentle snow dust drifting slowly across the frosty screen
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  for (let i = 0; i < 4; i++) {
    const snowX = ((elapsed * 25 + i * 45) % (W + 20)) - 10;
    const snowY = ((elapsed * 12 + i * 65) % (H + 20)) - 10;
    ctx.fillRect(Math.round(snowX), Math.round(snowY), 1.5, 1.5);
  }
  
  ctx.restore();
}

function draw() {
  ctx.save();
  if (cameraY > 0) {
    ctx.translate(0, cameraY);
  }
  drawSky(); 
  drawStars(); 
  drawBackgroundElements(); 
  
  if (shakeAmount > 0) {
    const rX = (Math.random() - 0.5) * shakeAmount;
    const rY = (Math.random() - 0.5) * shakeAmount;
    ctx.save();
    ctx.translate(rX, rY);
  }
  
  for (const p of pipes) drawPipe(p); 
  for (const p of powerUps) drawPowerUp(p);
  
  // ─── Draw Boss Elements ───
  if (bossMode) {
    for (const p of fireballPowerUps) drawFireballPowerUp(p);
    for (const f of fireballs) drawFireball(f);
    for (const f of darkFireballs) drawDarkFireball(f);
    drawBoss();
    
    // Draw Boss Warning Alerts
    for (const alert of bossAlerts) {
      const blink = Math.floor(elapsed * 12) % 2 === 0;
      ctx.save();
      
      // Draw Top Warning Box
      if (alert.y > 0) {
        ctx.fillStyle = blink ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(W - 22, 0, 22, alert.y);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(W - 22, 0, 22, alert.y);
        
        ctx.fillStyle = blink ? '#ffffff' : '#fecaca';
        ctx.font = 'bold 8px "Orbitron"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', W - 11, alert.y / 2);
      }
      
      // Draw Bottom Warning Box
      const botY = alert.y + PIPE_GAP;
      const botH = H - GROUND_H - botY;
      if (botH > 0) {
        ctx.fillStyle = blink ? 'rgba(239, 68, 68, 0.4)' : 'rgba(239, 68, 68, 0.15)';
        ctx.fillRect(W - 22, botY, 22, botH);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.strokeRect(W - 22, botY, 22, botH);
        
        ctx.fillStyle = blink ? '#ffffff' : '#fecaca';
        ctx.font = 'bold 8px "Orbitron"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', W - 11, botY + botH / 2);
      }
      
      ctx.restore();
    }
  }
  
  drawGround(); 
  
  // Draw particles
  for (const par of particles) {
    ctx.globalAlpha = Math.max(0, Math.min(1, par.life / 0.8));
    ctx.fillStyle = par.color;
    ctx.beginPath();
    ctx.arc(par.x, par.y, par.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  
  drawBird();

  // Draw floating score and damage popups
  for (const pop of scorePopups) {
    const pct = Math.max(0, Math.min(1, pop.life / pop.maxLife));
    ctx.save();
    ctx.globalAlpha = pct;
    ctx.font = 'bold 7px "Orbitron"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Add simple pixel retro drop shadow
    ctx.fillStyle = '#000000';
    ctx.fillText(pop.text, pop.x + 0.6, pop.y + 0.6);
    
    ctx.fillStyle = pop.color;
    ctx.fillText(pop.text, pop.x, pop.y);
    ctx.restore();
  }
  
  if (shakeAmount > 0) {
    ctx.restore();
  }
  ctx.restore(); // Restores cameraY

  // Draw frosty overlay slowMo effects
  drawFrostyFilters();

  // Draw subtle screen flash when collecting powerups
  if (screenFlashAlpha > 0) {
    ctx.save();
    ctx.fillStyle = screenFlashColor;
    ctx.globalAlpha = screenFlashAlpha;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }

  drawHUD();

  // Draw combo counter HUD overlay if active (comboCounter > 1)
  if (comboCounter > 1) {
    ctx.save();
    ctx.shadowBlur = 4;
    ctx.shadowColor = '#ffe94e';
    ctx.fillStyle = '#fffc33';
    ctx.font = '6px "Orbitron"';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    
    // Animate a subtle bounce of the text using state phase
    const textY = 28 + Math.sin(elapsed * 12) * 2;
    ctx.fillText('COMBO x' + comboCounter, W / 2, textY);
    ctx.restore();
  }
  
  // ─── Draw Canvas-Based Pixel Toast Notification ───
  drawCanvasNotification();

  // ─── Draw Cinematic Letterboxing Overlay ───
  if (bossMode && boss && (boss.state === 'evolving' || boss.state === 'entering' || boss.state === 'introPaused' || boss.state === 'evolvedPaused')) {
    const barHeight = 28; // cinematic widescreen height
    ctx.save();
    ctx.fillStyle = '#000000';
    // Top cinematic bar
    ctx.fillRect(0, 0, W, barHeight);
    // Bottom cinematic bar
    ctx.fillRect(0, H - barHeight, W, barHeight);
    
    // High-fidelity borders for cinematic bars
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(0, barHeight);
    ctx.lineTo(W, barHeight);
    ctx.moveTo(0, H - barHeight);
    ctx.lineTo(W, H - barHeight);
    ctx.stroke();
    ctx.restore();
  }

  // ─── Draw Boss Pause Alert Boxes ───
  drawBossPauseOverlay();
  
  if (shakeAmount > 0) {
    shakeAmount *= 0.88;
    if (shakeAmount < 0.1) shakeAmount = 0;
  }
}

function updateScoreUI() {
  document.getElementById('live-score').textContent = score;
  document.getElementById('live-best').textContent  = best;
}

function showOverlayPanel(panelId) {
  document.getElementById('home-screen').classList.add('hidden');
  document.getElementById('customization-screen').classList.add('hidden');
  document.getElementById('game-over-screen').classList.add('hidden');
  const pausedPanel = document.getElementById('paused-screen');
  if (pausedPanel) pausedPanel.classList.add('hidden');
  
  document.getElementById(panelId).classList.remove('hidden');
  overlay.classList.remove('hidden');
  const pauseBtn = document.getElementById('pause-btn');
  if (pauseBtn) pauseBtn.classList.add('hidden');
}

let pausedBossMusic = 0;
function togglePause() {
  if (state === 'playing') {
    state = 'paused';
    showOverlayPanel('paused-screen');
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.classList.add('hidden');
    
    // Resume/Pause Audio Integration
    if (AudioEngine.bossAudioPhase1 && !AudioEngine.bossAudioPhase1.paused) {
      AudioEngine.bossAudioPhase1.pause();
      pausedBossMusic = 1;
    } else if (AudioEngine.bossAudioPhase2 && !AudioEngine.bossAudioPhase2.paused) {
      AudioEngine.bossAudioPhase2.pause();
      pausedBossMusic = 2;
    }
    triggerNotification("SYSTEM INJECTED: SECURE PAUSE", "success");
  } else if (state === 'paused') {
    state = 'playing';
    overlay.classList.add('hidden');
    const pausedPanel = document.getElementById('paused-screen');
    if (pausedPanel) pausedPanel.classList.add('hidden');
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) pauseBtn.classList.remove('hidden');
    
    // Resume audio
    if (pausedBossMusic === 1 && AudioEngine.bossAudioPhase1) {
      AudioEngine.bossAudioPhase1.play().catch(e => console.warn(e));
    } else if (pausedBossMusic === 2 && AudioEngine.bossAudioPhase2) {
      AudioEngine.bossAudioPhase2.play().catch(e => console.warn(e));
    }
    pausedBossMusic = 0;
  }
}

function showGameOver() {
  // Stop boss music immediately when player dies / game over
  AudioEngine.stopBossMusic();
  playingBossMusicPhase1 = false;
  playingBossMusicPhase2 = false;
  bossMode = false;
  boss = null;

  const goTitle = document.getElementById('gameover-title');
  if (maxCombo > 1) {
    goTitle.innerHTML = 'Session Terminated<br>[X_X] <span style="color:#ffe94e; font-size:4px;">&#9889; COMBO x' + maxCombo + '</span>';
  } else {
    goTitle.innerHTML = 'Session Terminated<br>[X_X]';
  }
  document.getElementById('end-score').textContent = score; 
  document.getElementById('end-best').textContent = best;

  showOverlayPanel('game-over-screen');
}

function loop(timestamp) {
  if (bossMode && boss) {
    if (boss.state === 'evolving') {
      if (!playingBossMusicPhase2) {
        // Run seamless 5.0 seconds cross-fade when phase 1 dies and evolving state begins
        AudioEngine.startCrossfade(5000);
        playingBossMusicPhase1 = false;
        playingBossMusicPhase2 = true;
      }
    } else if (boss.phase === 1 && boss.state !== 'evolving') {
      if (!playingBossMusicPhase1) {
        AudioEngine.stopBossMusic();
        AudioEngine.playBossMusicPhase1();
        playingBossMusicPhase1 = true;
        playingBossMusicPhase2 = false;
      }
    } else if (boss.phase === 2) {
      if (!playingBossMusicPhase2) {
        AudioEngine.stopBossMusic();
        AudioEngine.playBossMusicPhase2();
        playingBossMusicPhase2 = true;
        playingBossMusicPhase1 = false;
      }
    }
  } else if (!bossMode && (playingBossMusicPhase1 || playingBossMusicPhase2)) {
    AudioEngine.stopBossMusic();
    playingBossMusicPhase1 = false;
    playingBossMusicPhase2 = false;
  }
  resizeGame();
  if (lastTime === null) lastTime = timestamp;
  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); lastTime = timestamp;
  if (state === 'idle') {
    elapsed += dt;
  }

  // Globally progress day/night cycle unconditionally if unlocked
  if (!skyTransitionActive && birdSettings.cycleUnlocked) {
    // Determine game speed scale based on active states, to ensure aesthetic syncs with time
    const isBossPaused = bossMode && boss && (boss.state === 'introPaused' || boss.state === 'evolvedPaused');
    const slowScale = slowMoMode ? 0.45 : 1.0;
    const dashScale = dashMode ? (slowMoMode ? 2.2 : 3.6) : 1.0;
    const speedScale = isBossPaused ? 0 : dashScale * slowScale;
    let actualDt = (state === 'playing' || state === 'cutscene') ? (dt * speedScale) : ((state === 'dead' || state === 'paused') ? 0 : dt);
    // Base cycle progression speed
    birdSettings.gameTime += actualDt * 0.05; 

    const cyclePoint = (Math.sin(birdSettings.gameTime) + 1) / 2; // 0 to 1
    isDaytime = cyclePoint > 0.5;
    SKY_TOP  = lerpColor('#111026', '#324e75', cyclePoint);
    SKY_BOT  = lerpColor('#1a244d', '#6da2cc', cyclePoint);
    GROUND_C = lerpColor('#22191b', '#3b2f2f', cyclePoint);
    GRASS_C  = lerpColor('#1e4620', '#345e2a', cyclePoint);
  }

  if (displayedScoreValue !== score) {
    displayedScoreValue += (score - displayedScoreValue) * 0.15;
    if (Math.abs(score - displayedScoreValue) < 0.5) displayedScoreValue = score;
    document.getElementById('live-score').textContent = Math.round(displayedScoreValue);
    // Add css effect
    const scoreEl = document.getElementById('live-score');
    if (scoreEl.style.transform !== 'scale(1.2)' && displayedScoreValue !== score) {
        scoreEl.style.transform = 'scale(1.2)';
        scoreEl.style.transition = 'transform 0.1s ease-out';
    } else if (displayedScoreValue === score) {
        scoreEl.style.transform = 'scale(1)';
        scoreEl.style.transition = 'transform 0.2s ease-in';
    }
  }

  update(dt); draw(); requestAnimationFrame(loop);
}

// ─── Control Interactions ──────────────────────────────
document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
    e.preventDefault();
    if (state === 'playing' || state === 'paused') {
      togglePause();
    }
    return;
  }
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    if (document.activeElement && document.activeElement.tagName === 'BUTTON') {
      return;
    }
    if (state === 'idle' || state === 'dead') {
      startGame();
      flap();
    } else if (state === 'paused') {
      togglePause();
    } else {
      flap();
    }
  }
});

canvas.addEventListener('mousedown', flap);
canvas.addEventListener('touchstart', e => { e.preventDefault(); flap(); }, { passive: false });

document.getElementById('play-btn-classic').addEventListener('click', e => { e.stopPropagation(); startGame(); });
document.getElementById('debug-boss-btn').addEventListener('click', e => { e.stopPropagation(); startBossFightDebug(); });
document.getElementById('open-customize-btn').addEventListener('click', e => { e.stopPropagation(); showOverlayPanel('customization-screen'); });
document.getElementById('open-customize-btn-2').addEventListener('click', e => { e.stopPropagation(); showOverlayPanel('customization-screen'); });
document.getElementById('back-to-home-btn').addEventListener('click', e => { e.stopPropagation(); showOverlayPanel('home-screen'); });
document.getElementById('retry-btn').addEventListener('click', e => { e.stopPropagation(); startGame(); });
document.getElementById('debug-boss-btn-2').addEventListener('click', e => { e.stopPropagation(); startBossFightDebug(); });

const pauseBtn = document.getElementById('pause-btn');
if (pauseBtn) {
  pauseBtn.addEventListener('click', e => { e.stopPropagation(); togglePause(); });
  pauseBtn.addEventListener('touchstart', e => { e.stopPropagation(); e.preventDefault(); togglePause(); }, { passive: false });
}
const resumeBtn = document.getElementById('resume-btn');
if (resumeBtn) {
  resumeBtn.addEventListener('click', e => { e.stopPropagation(); togglePause(); });
  resumeBtn.addEventListener('touchstart', e => { e.stopPropagation(); e.preventDefault(); togglePause(); }, { passive: false });
}

// ─── Custom Validation Inputs ──────────────────────────
document.getElementById('bird-accessory').addEventListener('change', e => { birdSettings.accessory = e.target.value; saveCustomization(); });

document.getElementById('bird-style').addEventListener('change', e => {
  const chosen = e.target.value;
  if((chosen === 'robot' || chosen === 'golden') && !unlockedSkins.includes(chosen)){
    AudioEngine.playUnlockFail();
    triggerNotification('Configuration Error: Decrypt chassis with shop module first!', 'error');
    e.target.value = birdSettings.style;
    return;
  }
  birdSettings.style = chosen; saveCustomization();
});

document.getElementById('bird-wing').addEventListener('change', e => {
  const chosen = e.target.value;
  if((chosen === 'angel' || chosen === 'bat') && !unlockedWings.includes(chosen)){
    AudioEngine.playUnlockFail();
    triggerNotification('Configuration Error: Deploy flights via vendor shop first!', 'error');
    e.target.value = birdSettings.wing;
    return;
  }
  birdSettings.wing = chosen; saveCustomization();
});

document.getElementById('buy-skin').addEventListener('click', () => {
  const systemKey = document.getElementById('shop-skin').value;
  if(!systemKey) return triggerNotification('Please select a system module package', 'error');

  const prices = { skin_robot: 25, skin_golden: 50, wing_angel: 30, wing_bat: 45 };
  const targetCost = prices[systemKey];
  
  if(systemKey.startsWith('skin_')) {
    const skinId = systemKey.replace('skin_', '');
    if(unlockedSkins.includes(skinId)) {
      AudioEngine.playUnlockFail();
      return triggerNotification('Error: Module matrix already authorized!', 'error');
    }
    if(coins >= targetCost) {
      coins -= targetCost; unlockedSkins.push(skinId);
      AudioEngine.playUnlockSuccess();
      triggerNotification('Authorization Success: Module ' + skinId.toUpperCase() + ' verified!', 'success');
      saveCustomization();
    } else { 
      AudioEngine.playUnlockFail();
      triggerNotification('Transaction Refused: Insufficient vault tokens!', 'error'); 
    }
  } else if(systemKey.startsWith('wing_')) {
    const wingId = systemKey.replace('wing_', '');
    if(unlockedWings.includes(wingId)) {
      AudioEngine.playUnlockFail();
      return triggerNotification('Error: Flight rigging already authorized!', 'error');
    }
    if(coins >= targetCost) {
      coins -= targetCost; unlockedWings.push(wingId);
      AudioEngine.playUnlockSuccess();
      triggerNotification('Authorization Success: Flight Rig ' + wingId.toUpperCase() + ' deployed!', 'success');
      saveCustomization();
    } else { 
      AudioEngine.playUnlockFail();
      triggerNotification('Transaction Refused: Insufficient vault tokens!', 'error'); 
    }
  }
});

window.addEventListener('load', () => {
  document.getElementById('coin-count').textContent = coins;
  document.getElementById('bird-style').value = birdSettings.style;
  document.getElementById('bird-accessory').value = birdSettings.accessory;
  document.getElementById('bird-wing').value = birdSettings.wing;

  // Set up audio settings UI slider connections
  const musSl = document.getElementById('music-volume-slider');
  const sfxSl = document.getElementById('sfx-volume-slider');
  const muteBtn = document.getElementById('mute-btn-toggle');
  const musLbl = document.getElementById('music-vol-lbl');
  const sfxLbl = document.getElementById('sfx-vol-lbl');

  if (musSl && sfxSl && muteBtn) {
    musSl.value = AudioEngine.musicVolume;
    sfxSl.value = AudioEngine.sfxVolume;
    musLbl.textContent = AudioEngine.musicVolume + '%';
    sfxLbl.textContent = AudioEngine.sfxVolume + '%';
    muteBtn.textContent = AudioEngine.isMuted ? 'UNMUTE AUDIO' : 'MUTE AUDIO';

    musSl.addEventListener('input', e => {
      const v = Number(e.target.value);
      AudioEngine.musicVolume = v;
      localStorage.setItem('musicVolume', v.toString());
      musLbl.textContent = v + '%';
      AudioEngine.updateMusicVolumes();
    });

    sfxSl.addEventListener('input', e => {
      const v = Number(e.target.value);
      AudioEngine.sfxVolume = v;
      localStorage.setItem('sfxVolume', v.toString());
      sfxLbl.textContent = v + '%';
    });

    muteBtn.addEventListener('click', () => {
      AudioEngine.isMuted = !AudioEngine.isMuted;
      localStorage.setItem('isMuted', AudioEngine.isMuted.toString());
      muteBtn.textContent = AudioEngine.isMuted ? 'UNMUTE AUDIO' : 'MUTE AUDIO';
      AudioEngine.updateMusicVolumes();
    });
  }

  updateScoreUI();
  updateCustomSelectionUI();
  showOverlayPanel('home-screen');
  resizeGame();
});

let lastWinW = 0, lastWinH = 0;
function resizeGame() {
  const root = document.getElementById('arcade-root');
  if (!root) return;
  const winW = window.innerWidth;
  const winH = window.innerHeight;
  if (winW === lastWinW && winH === lastWinH) return;
  lastWinW = winW;
  lastWinH = winH;
  const unscaledW = 194;
  const unscaledH = 325;
  const scaleX = winW / unscaledW;
  const scaleY = winH / unscaledH;
  let scale = Math.min(scaleX, scaleY) * 0.96;
  scale = Math.max(scale, 0.45);
  root.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

window.addEventListener('resize', resizeGame);
window.addEventListener('orientationchange', resizeGame);

init(); 
resizeGame();
requestAnimationFrame(loop);