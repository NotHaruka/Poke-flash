import { toast } from './utils.js';

// ─── BGM (BACKGROUND MUSIC) AUDIO ENGINE ─────────────────────────────────────
// Plays the custom focus track (quiet_focus.mp3) uploaded by the user.
// No synthesized AI chords are used anymore.

export interface BGMTrack {
  id: string;
  name: string;
  description: string;
  type: string;
}

const TRACKS: Record<string, BGMTrack> = {
  focus: {
    id: 'focus',
    name: 'Quiet Focus',
    description: 'Subtle, relaxing study atmosphere',
    type: 'focus'
  }
};

let audioNode: HTMLAudioElement | null = null;
let isPlaying = false;
let currentTrackId = 'focus';
let volumePercent = 50; // 0 to 100

function getAudioNode(): HTMLAudioElement {
  if (!audioNode) {
    audioNode = new Audio('/assets/audio/quiet_focus.mp3');
    audioNode.loop = true;
    audioNode.volume = (volumePercent / 100) * 0.7; // scale slightly
  }
  return audioNode;
}

export function startBGM(): boolean {
  try {
    const audio = getAudioNode();
    isPlaying = true;

    audio.play().catch(err => {
      console.warn('Audio autoplay deferred or blocked until user interaction:', err);
      isPlaying = false;
      updateBGMUI();
    });

    saveBGMState();
    updateBGMUI();
    return true;
  } catch (err) {
    console.warn('Could not start BGM:', err);
    isPlaying = false;
    updateBGMUI();
    return false;
  }
}

export function stopBGM() {
  isPlaying = false;
  if (audioNode) {
    try {
      audioNode.pause();
    } catch (_) {}
  }
  saveBGMState();
  updateBGMUI();
}

export function toggleBGM(): boolean {
  if (isPlaying) {
    stopBGM();
    toast('Background music paused');
    return false;
  } else {
    const ok = startBGM();
    if (ok) {
      toast('Background music playing');
    } else {
      toast('Could not start audio. Click anywhere to interact first.');
    }
    return isPlaying;
  }
}

export function setBGMEnabled(enable: boolean) {
  if (enable && !isPlaying) {
    startBGM();
  } else if (!enable && isPlaying) {
    stopBGM();
  }
}

export function setBGMVolume(valPercent: number) {
  volumePercent = Math.max(0, Math.min(100, valPercent));
  if (audioNode) {
    audioNode.volume = (volumePercent / 100) * 0.7;
  }
  saveBGMState();
  updateBGMUI();
}

export function setBGMTrack(trackId: string) {
  currentTrackId = 'focus';
  saveBGMState();
  updateBGMUI();
}

export function nextBGMTrack() {
  toast('Quiet Focus is the active background music');
}

export function isBGMPlaying(): boolean {
  return isPlaying;
}

export function getBGMTrack(): BGMTrack {
  return TRACKS.focus;
}

function saveBGMState() {
  try {
    localStorage.setItem('ft_bgm_enabled', String(isPlaying));
    localStorage.setItem('ft_bgm_volume', String(volumePercent));
    localStorage.setItem('ft_bgm_track', 'focus');
  } catch (_) {}
}

export function loadBGMState() {
  try {
    const savedVolume = localStorage.getItem('ft_bgm_volume');
    if (savedVolume !== null) volumePercent = parseInt(savedVolume, 10) || 50;

    currentTrackId = 'focus';
    updateBGMUI();
  } catch (_) {}
}

export function updateBGMUI() {
  const toggleInp = document.getElementById('bgm-toggle') as HTMLInputElement | null;
  const volInp = document.getElementById('bgm-volume') as HTMLInputElement | null;
  const volVal = document.getElementById('bgm-volume-val');
  const trackSel = document.getElementById('bgm-track-select') as HTMLSelectElement | null;
  const statusBadge = document.getElementById('bgm-status-badge');

  // Since we default to true, check saved state or default to true
  const savedEnabled = localStorage.getItem('ft_bgm_enabled');
  const isEnabled = savedEnabled === null ? true : savedEnabled === 'true';

  if (toggleInp) toggleInp.checked = isEnabled;
  if (volInp) volInp.value = String(volumePercent);
  if (volVal) volVal.textContent = `${volumePercent}%`;
  if (trackSel) trackSel.value = 'focus';

  if (statusBadge) {
    if (isPlaying) {
      statusBadge.className = 'badge badge-green';
      statusBadge.textContent = 'Playing';
    } else {
      statusBadge.className = 'badge badge-gray';
      statusBadge.textContent = 'Paused';
    }
  }
}

export function initBGM() {
  loadBGMState();

  // Attach window click/keydown gesture unlocker to allow AudioContext autoplay when enabled
  const unlockAudio = () => {
    const savedEnabled = localStorage.getItem('ft_bgm_enabled');
    const shouldBeEnabled = savedEnabled === null ? true : savedEnabled === 'true';

    // Pre-initialize the audio node
    getAudioNode();

    if (shouldBeEnabled && !isPlaying) {
      startBGM();
    }
  };
  window.addEventListener('click', unlockAudio, { once: true });
  window.addEventListener('keydown', unlockAudio, { once: true });
  window.addEventListener('touchstart', unlockAudio, { once: true });
}

// Expose global methods
Object.assign(window, {
  toggleBGM,
  startBGM,
  stopBGM,
  setBGMEnabled,
  setBGMVolume,
  setBGMTrack,
  nextBGMTrack,
  isBGMPlaying
});
