import LZString from "lz-string";
import { app } from './firebase.js';
import { S } from './main.js';
import { QRCode } from './qr-engine.js';
import { showPanel, updateSRSButton } from './sidebar.js';
import { persist } from './storage.js';
import { notes, setMode } from './study.js';
import { toast } from './utils.js';












async function updateOfflineStatus(): Promise<void> {
  const dot = document.getElementById('offline-dot');
  const txt = document.getElementById('offline-status-txt');
  if (!dot || !txt) return;

  const online = navigator.onLine;
  const hasSW = !!(navigator.serviceWorker && (await navigator.serviceWorker.getRegistration().catch(() => null)));
  const winkReady = !!(window as any).winkNlpInst;

  if (!online) {
    dot.className = 'offline-dot bad';
    txt.textContent = winkReady
      ? '🔴 Offline — AI & PDF need internet'
      : '🔴 Offline — AI & PDF need internet (NLP needs 1 online visit)';
  } else if (hasSW) {
    dot.className = 'offline-dot ready';
    txt.textContent = winkReady
      ? '🟢 Offline ready — app cached'
      : '🟢 Offline ready — NLP model loading…';
  } else {
    dot.className = 'offline-dot partial';
    txt.textContent = winkReady
      ? '🟡 Online — not yet cached for offline'
      : '🟡 Online — NLP model loading…';
  }
}

function initLightweightMode(): void {
  const toggle = document.getElementById('lw-toggle') as HTMLInputElement | null;
  if (!toggle) return;
  const saved = localStorage.getItem('ftp-lw') === 'true';
  toggle.checked = saved;
  document.body.classList.toggle('lightweight', saved);
  toggle.addEventListener('change', () => {
    document.body.classList.toggle('lightweight', toggle.checked);
    localStorage.setItem('ftp-lw', String(toggle.checked));
    (window as any).toast(toggle.checked ? '⚡ Lightweight mode on' : '✨ Lightweight mode off');
  });

  // Also wire SRS toggle in settings
  const srsTog = document.getElementById('srs-toggle-settings') as HTMLInputElement | null;
  if (srsTog) {
    srsTog.checked = S.srsEnabled;
    srsTog.addEventListener('change', () => {
      S.srsEnabled = srsTog.checked;
      (window as any).updateSRSButton();
      persist();
      (window as any).toast(srsTog.checked ? '🧠 SRS enabled' : '🔁 SRS disabled — free study mode');
    });
  }
}

function updateAccentLockState(isDark: boolean): void {
  const warning = document.getElementById('accent-dark-warning');
  const container = document.getElementById('accent-picker-container');
  if (warning) warning.style.display = 'none';
  if (container) {
    container.style.opacity = '1';
    container.style.pointerEvents = 'auto';
  }
}

function initTheme(): void {
  const isDark = document.body.classList.contains('dark');
  const saved = localStorage.getItem('ftp-theme-accent');
  const savedDim = localStorage.getItem('ftp-theme-dim');

  if (saved && savedDim) {
    applyTheme(saved, savedDim);
  }

  const picker = document.getElementById('custom-accent-picker') as HTMLInputElement | null;
  const hexInp = document.getElementById('custom-accent-hex') as HTMLInputElement | null;
  const cur = saved || '#C4613A';
  if (picker) picker.value = cur;
  if (hexInp) hexInp.value = cur;
  renderCustomRecents();

  // Initialize locked state on load
  updateAccentLockState(isDark);

  document.querySelectorAll('.theme-swatch').forEach(s => {
    s.addEventListener('click', () => {
      
      const accent = (s as any).dataset.accent;
      const dim = (s as any).dataset.dim;
      applyTheme(accent, dim);
      localStorage.setItem('ftp-theme-accent', accent);
      localStorage.setItem('ftp-theme-dim', dim);
      if (picker) picker.value = accent;
      if (hexInp) hexInp.value = accent;
      (window as any).toast('Theme applied!');
    });
  });
}

function hexToRgb(hex: string): { r: number, g: number, b: number } | null {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return isNaN(r) ? null : { r, g, b };
}

function applyCustomAccent(): void {
  
  const picker = document.getElementById('custom-accent-picker') as HTMLInputElement | null;
  const hexInp = document.getElementById('custom-accent-hex') as HTMLInputElement | null;
  const hex = hexInp?.value.trim() || picker?.value || '#C4613A';
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) { (window as any).toast('Enter a valid hex like #ff6b6b'); return; }
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const dim = `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`;
  applyTheme(hex, dim);
  localStorage.setItem('ftp-theme-accent', hex);
  localStorage.setItem('ftp-theme-dim', dim);
  if (picker) picker.value = hex;
  let recents = JSON.parse(localStorage.getItem('ftp-custom-recents') || '[]');
  recents = [hex, ...recents.filter((c: any) => c !== hex)].slice(0, 6);
  localStorage.setItem('ftp-custom-recents', JSON.stringify(recents));
  renderCustomRecents();
  (window as any).toast('Custom color applied!');
}

function renderCustomRecents(): void {
  const wrap = document.getElementById('custom-recents');
  if (!wrap) return;
  const recents = JSON.parse(localStorage.getItem('ftp-custom-recents') || '[]');
  if (!recents.length) { wrap.style.display = 'none'; return; }
  wrap.style.display = 'flex';
  wrap.innerHTML = '<span style="font-size:10px;color:var(--text3);align-self:center;margin-right:2px">Recent:</span>' +
    recents.map((hex: string) => `<div onclick="pickRecent('${hex}')" title="${hex}"
      style="width:22px;height:22px;border-radius:50%;background:${hex};cursor:pointer;
      border:2px solid var(--border2);transition:transform .12s;flex-shrink:0"
      onmouseover="this.style.transform='scale(1.2)'" onmouseout="this.style.transform=''"></div>`).join('');
}

function pickRecent(hex: string): void {
  
  const rgb = hexToRgb(hex);
  if (!rgb) return;
  const dim = `rgba(${rgb.r},${rgb.g},${rgb.b},0.12)`;
  applyTheme(hex, dim);
  localStorage.setItem('ftp-theme-accent', hex);
  localStorage.setItem('ftp-theme-dim', dim);
  const picker = document.getElementById('custom-accent-picker') as HTMLInputElement | null;
  const hexInp = document.getElementById('custom-accent-hex') as HTMLInputElement | null;
  if (picker) picker.value = hex;
  if (hexInp) hexInp.value = hex;
  (window as any).toast('Color applied!');
}

function downloadSWFile(): void {
  const CACHE = 'ftp-v2';
  const swCode = `// FlashTrainer Pro — Service Worker
// Save this file as sw.js in the SAME folder as your HTML file.
  const CACHE = '${CACHE}';
  const PRECACHE = [
    './',
    './FlashcardTrainer_wAI_.html',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
    'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap',
  ];

  self.addEventListener('install', e => {
    e.waitUntil(
      caches.open(CACHE)
        .then(c => c.addAll(PRECACHE.map(u => new Request(u, { mode: 'cors' }))))
        .catch(() => {})
    );
    self.skipWaiting();
  });

  self.addEventListener('activate', e => {
    e.waitUntil(
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      )
    );
    self.clients.claim();
  });

  self.addEventListener('fetch', e => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(resp => {
          if (resp && resp.status === 200 && resp.type !== 'opaque') {
            caches.open(CACHE).then(c => c.put(e.request, resp.clone()));
          }
          return resp;
        }).catch(() => new Response('Offline', { status: 503 }));
      })
    );
  });
`;
  const blob = new Blob([swCode], { type: 'application/javascript' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sw.js';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast('💾 sw.js downloaded — place it in the same folder as your HTML file!');
}

async function preloadOfflineAssets(): Promise<void> {
  const btn = document.getElementById('btn-preload-assets') as HTMLButtonElement | null;
  const status = document.getElementById('preload-status');
  if (btn) btn.disabled = true;
  if (status) { status.style.display = 'block'; status.textContent = '⏳ Caching assets…'; }

  const ASSETS = [
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  ];

  let ok = 0, fail = 0;
  try {
    if ('caches' in window) {
      const cache = await caches.open('ftp-v1');
      for (const url of ASSETS) {
        try {
          await cache.add(new Request(url, { mode: 'cors' }));
          ok++;
          if (status) status.textContent = `⏳ Cached ${ok}/${ASSETS.length}…`;
        } catch(e) { fail++; }
      }
      if (status) status.textContent = `✓ Done — ${ok} assets cached${fail ? `, ${fail} failed (may need internet)` : ''}. Reload to verify.`;
    } else {
      if (status) status.textContent = '⚠️ Cache API not available — try in Chrome or Edge.';
    }
  } catch(e: any) {
    if (status) status.textContent = '✗ Error: ' + e.message;
  }
  if (btn) btn.disabled = false;
  await updateOfflineStatus();
}

// ─── OFFLINE BANNER ────────────────────────────────────────────────────────────
(function () {
  if (typeof window === 'undefined') return;
  window.addEventListener('DOMContentLoaded', () => {
    const banner = document.createElement('div');
    banner.style.cssText = [
      'position:fixed;bottom:0;left:0;right:0',
      'padding:8px 16px;font-size:12px;font-weight:500;text-align:center',
      'z-index:490;display:none',
      'background:#2a1a00;color:#ffd166;border-top:1px solid rgba(255,209,102,0.3)'
    ].join(';');
    document.body.appendChild(banner);

    function update() {
      const offline = !navigator.onLine;
      banner.style.display = offline ? 'block' : 'none';
      banner.textContent = '📵 Offline — cards and notes still work. PDF viewing and AI need internet.';
      const bannerH = offline ? (banner.offsetHeight || 37) + 'px' : '0px';
      const fab = document.querySelector('.fab') as HTMLElement | null;
      if (fab) fab.style.bottom = offline ? `calc(28px + ${bannerH})` : '28px';
      const main = document.querySelector('.main') as HTMLElement | null;
      if (main) main.style.paddingBottom = bannerH;
    }

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    update();
  });
})();


// ─── ES module exports (auto-generated) ───

function switchSettingsTab(tabId: string): void {
  // Toggle active tab buttons
  document.querySelectorAll('.stab').forEach(btn => btn.classList.remove('active'));
  const btn = document.querySelector(`[onclick*="switchSettingsTab('${tabId}')"]`) || 
              document.querySelector(`[onclick*="switchSettingsTab(\'${tabId}\')"]`);
  if (btn) btn.classList.add('active');

  // Toggle active panels
  document.querySelectorAll('[id^="stab-panel-"]').forEach(panel => {
    (panel as HTMLElement).style.display = 'none';
  });
  const activePanel = document.getElementById(`stab-panel-${tabId}`);
  if (activePanel) {
    activePanel.style.display = 'block';
  }

  // Populate QR select boxes if switching to general tab
  if (tabId === 'general') {
    populateQRDeckSelect();
    populateQRFolderSelect();
  }
}

function applyTheme(accent: string, dim: string): void {
  document.documentElement.style.setProperty('--accent', accent);
  document.documentElement.style.setProperty('--accent-dim', dim);
  if (document.body) {
    document.body.style.setProperty('--accent', accent);
    document.body.style.setProperty('--accent-dim', dim);
  }

  const rgb = hexToRgb(accent);
  if (rgb) {
    const rgbStr = `${rgb.r}, ${rgb.g}, ${rgb.b}`;
    document.documentElement.style.setProperty('--accent-rgb', rgbStr);
    if (document.body) {
      document.body.style.setProperty('--accent-rgb', rgbStr);
    }
  }
}

function initDarkMode(): void {
  const toggle = document.getElementById('dark-mode-toggle') as HTMLInputElement | null;
  const isDark = localStorage.getItem('ftp-dark') === 'true';
  if (isDark) {
    document.body.classList.add('dark');
  }
  if (toggle) {
    toggle.checked = isDark;
    toggle.addEventListener('change', () => {
      const active = toggle.checked;
      document.body.classList.toggle('dark', active);
      localStorage.setItem('ftp-dark', String(active));
      (window as any).toast(active ? '🌙 Dark Mode enabled' : '☀️ Light Mode enabled');
    });
  }
}

function onQRTypeChange(): void {
  const typeSel = document.getElementById('qr-type-sel') as HTMLSelectElement | null;
  const deckSel = document.getElementById('qr-deck-sel');
  const folderSel = document.getElementById('qr-folder-sel');
  if (!typeSel) return;
  
  if (typeSel.value === 'deck') {
    if (deckSel) deckSel.style.display = 'inline-block';
    if (folderSel) folderSel.style.display = 'none';
  } else {
    if (deckSel) deckSel.style.display = 'none';
    if (folderSel) folderSel.style.display = 'inline-block';
  }
}

function populateQRDeckSelect(): void {
  const deckSel = document.getElementById('qr-deck-sel') as HTMLSelectElement | null;
  if (!deckSel) return;
  deckSel.innerHTML = '<option value="">— Select a deck —</option>';
  if (S && S.decks) {
    const order = S.deckOrder || Object.keys(S.decks);
    order.forEach((id: string) => {
      const deck = S.decks[id];
      if (deck) {
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = deck.name + ` (${deck.cards ? deck.cards.length : 0} cards)`;
        deckSel.appendChild(opt);
      }
    });
  }
}

function populateQRFolderSelect(): void {
  const folderSel = document.getElementById('qr-folder-sel') as HTMLSelectElement | null;
  if (!folderSel) return;
  folderSel.innerHTML = '<option value="">— Select a folder —</option>';
  if (S && S.folders) {
    const order = S.folderOrder || Object.keys(S.folders);
    order.forEach((id: string) => {
      const folder = S.folders[id];
      if (folder) {
        const deckCount = Object.values(S.decks || {}).filter((d: any) => d.folderId === id).length;
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = folder.name + ` (${deckCount} decks)`;
        folderSel.appendChild(opt);
      }
    });
  }
}

function showQRShare(id?: string): void {
  if (!S) return;

  const typeSel = document.getElementById('qr-type-sel') as HTMLSelectElement | null;
  const isFolder = typeSel && typeSel.value === 'folder';

  let targetId = id;
  if (!targetId) {
    if (isFolder) {
      targetId = (document.getElementById('qr-folder-sel') as HTMLSelectElement | null)?.value || '';
    } else {
      targetId = (document.getElementById('qr-deck-sel') as HTMLSelectElement | null)?.value || '';
    }
  }

  if (!targetId) {
    alert(`Please select a ${isFolder ? 'folder' : 'deck'} first!`);
    return;
  }

  let payload: any = null;
  let title = '';
  let count = 0;

  if (isFolder) {
    const folder = S.folders[targetId];
    if (!folder) return;
    title = folder.name;
    const folderDecks: Record<string, any> = {};
    Object.entries(S.decks || {}).forEach(([deckId, d]: any) => {
      if (d.folderId === targetId) {
        folderDecks[deckId] = {
          name: d.name,
          cards: (d.cards || []).map((c: any) => ({ q: c.q, a: c.a }))
        };
        count += (d.cards || []).length;
      }
    });

    payload = {
      ftp_qr_folder: true,
      folder: { name: folder.name },
      decks: folderDecks
    };
  } else {
    const deck = S.decks[targetId];
    if (!deck) return;
    title = deck.name;
    count = (deck.cards || []).length;
    payload = {
      ftp_qr: true,
      name: deck.name,
      cards: (deck.cards || []).map((c: any) => ({ q: c.q, a: c.a }))
    };
  }

  // Compress payload to reduce QR code size
  let base64 = LZString.compressToBase64(JSON.stringify(payload));

  // Generate our import URL
  const importUrl = window.location.origin + window.location.pathname + '#import=' + base64;

  // Show the modal
  const modal = document.getElementById('qr-modal-overlay');
  if (modal) modal.classList.add('show');

  const sub = document.getElementById('qr-modal-sub');
  if (sub) {
    sub.innerHTML = `Scanning will import <strong>${title}</strong> (${isFolder ? 'Folder' : 'Deck'}, ${count} cards).`;
  }

  const warn = document.getElementById('qr-size-warn');
  if (warn) {
    warn.style.display = count > 30 ? 'flex' : 'none';
  }

  const wrap = document.getElementById('qr-canvas-wrap');
  if (wrap) {
    wrap.innerHTML = '';
    try {
      // Use the QRCode engine
      new (QRCode as any)(wrap, {
        text: importUrl,
        width: 240,
        height: 240,
        colorDark: '#0f172a',
        colorLight: '#ffffff'
      });
    } catch (err) {
      console.error(err);
      wrap.textContent = 'Failed to generate QR Code: data too large.';
    }
  }
}

function showQRShareFolder(id?: string): void {
  const typeSel = document.getElementById('qr-type-sel') as HTMLSelectElement | null;
  if (typeSel) {
    typeSel.value = 'folder';
    onQRTypeChange();
  }
  if (id) {
    const folderSel = document.getElementById('qr-folder-sel') as HTMLSelectElement | null;
    if (folderSel) folderSel.value = id;
  }
  showQRShare(id);
}

function closeQRModal(): void {
  const modal = document.getElementById('qr-modal-overlay');
  if (modal) modal.classList.remove('show');
}

function downloadQR(): void {
  const canvas = document.querySelector('#qr-canvas-wrap canvas') as HTMLCanvasElement | null;
  if (!canvas) {
    alert('QR code canvas not found.');
    return;
  }
  try {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'flashtrainer-qr.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    alert('Failed to download image.');
  }
}

class Pomo {
  static timerId: any = null;
  static secondsLeft = 1500; // 25 mins
  static mode: 'work' | 'short' | 'long' = 'work';
  static running = false;

  static init() {
    this.updateDisplay();
  }

  static start() {
    const btn = document.getElementById('pomo-start');
    if (this.running) {
      this.running = false;
      if (this.timerId) clearInterval(this.timerId);
      if (btn) btn.textContent = '▶ Start';
    } else {
      this.running = true;
      if (btn) btn.textContent = '⏸ Pause';
      this.timerId = setInterval(() => {
        if (this.secondsLeft > 0) {
          this.secondsLeft--;
          this.updateDisplay();
        } else {
          this.running = false;
          if (btn) btn.textContent = '▶ Start';
          clearInterval(this.timerId);
          (window as any).toast('⏰ Pomodoro session completed!');
        }
      }, 1000);
    }
  }

  static reset() {
    this.running = false;
    if (this.timerId) clearInterval(this.timerId);
    const btn = document.getElementById('pomo-start');
    if (btn) btn.textContent = '▶ Start';
    
    if (this.mode === 'work') this.secondsLeft = 1500;
    else if (this.mode === 'short') this.secondsLeft = 300;
    else if (this.mode === 'long') this.secondsLeft = 900;
    this.updateDisplay();
  }

  static setMode(val: string) {
    this.mode = val as any;
    const label = document.getElementById('pomo-label');
    if (label) {
      if (val === 'work') label.textContent = 'Focus session';
      else if (val === 'short') label.textContent = 'Short break';
      else if (val === 'long') label.textContent = 'Long break';
    }
    this.reset();
  }

  static updateDisplay() {
    const el = document.getElementById('pomo-time');
    if (!el) return;
    const m = Math.floor(this.secondsLeft / 60);
    const s = this.secondsLeft % 60;
    el.textContent = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
}

export { Pomo, applyCustomAccent, applyTheme, closeQRModal, downloadQR, downloadSWFile, hexToRgb, initDarkMode, initLightweightMode, initTheme, onQRTypeChange, pickRecent, populateQRDeckSelect, populateQRFolderSelect, preloadOfflineAssets, renderCustomRecents, showQRShare, showQRShareFolder, switchSettingsTab, updateAccentLockState, updateOfflineStatus };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { Pomo, applyCustomAccent, applyTheme, closeQRModal, downloadQR, downloadSWFile, hexToRgb, initDarkMode, initLightweightMode, initTheme, onQRTypeChange, pickRecent, populateQRDeckSelect, populateQRFolderSelect, preloadOfflineAssets, renderCustomRecents, showQRShare, showQRShareFolder, switchSettingsTab, updateAccentLockState, updateOfflineStatus });


