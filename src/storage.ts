import { syncUserMetadata } from './firebase-sync.js';
import { S } from './main.js';
import { renderSidebar, updateStats } from './sidebar.js';
import { notes, renderNoteTabs } from './study.js';
import { toast } from './utils.js';



import localforage from 'localforage';

async function persist(): Promise<void> {
  try {
    await localforage.setItem('ftp-decks', S.decks);
    await localforage.setItem('ftp-deck-order', S.deckOrder);
    await localforage.setItem('ftp-folders', S.folders);
    await localforage.setItem('ftp-folder-order', S.folderOrder);
    localforage.setItem('ftp-srs', String(S.srsEnabled));
  } catch (e) {
    try {
      localStorage.setItem('ftp-decks', JSON.stringify(S.decks));
      localStorage.setItem('ftp-deck-order', JSON.stringify(S.deckOrder));
      localStorage.setItem('ftp-folders', JSON.stringify(S.folders));
      localStorage.setItem('ftp-folder-order', JSON.stringify(S.folderOrder));
      localStorage.setItem('ftp-srs', String(S.srsEnabled));
    } catch (q) { console.warn('Storage quota exceeded:', q); }
  }
  updateLastSynced();
  
  // Central real-time Firestore synchronization for metadata
  syncUserMetadata().catch(err => console.warn("User metadata sync failed:", err));

  // Versioned auto-backup (debounced — don't spam on rapid changes)
  clearTimeout((persist as any)._backupTimer);
  (persist as any)._backupTimer = setTimeout(() => saveVersionedBackup(), 4000);
  // Periodic storage check (every 10 saves)
  (persist as any)._saveCount = ((persist as any)._saveCount || 0) + 1;
  if ((persist as any)._saveCount % 10 === 0) checkStorageQuota();
}

function updateLastSynced(): void {
  const el = document.getElementById('last-synced');
  if (!el) return;
  const now = new Date();
  const t = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  el.textContent = `✓ Saved ${t}`;
  el.classList.add('fresh');
  clearTimeout((el as any)._fadeTimer);
  (el as any)._fadeTimer = setTimeout(() => el.classList.remove('fresh'), 3000);
}

async function saveVersionedBackup(): Promise<void> {
  const snapshot = {
    savedAt: new Date().toISOString(),
    version: 3,
    decks: S.decks,
    deckOrder: S.deckOrder,
    notes: notes,
    folders: S.folders,
    folderOrder: S.folderOrder,
  };
  try {
    let backups = ((await localforage.getItem('ftp-backups')) as any[]) || [];
    backups.unshift(snapshot);
    if (backups.length > 3) backups = backups.slice(0, 3);
    await localforage.setItem('ftp-backups', backups);
    renderBackupList(backups);
  } catch (e) { console.warn('Backup save failed:', e); }
}

async function renderBackupList(backups?: any): Promise<void> {
  const el = document.getElementById('backup-list');
  if (!el) return;
  if (!backups) backups = ((await localforage.getItem('ftp-backups')) as any[]) || [];
  if (!backups.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:6px 0">No backups yet — they\'re saved automatically when you make changes.</div>';
    return;
  }
  el.innerHTML = backups.map((b: any, i: number) => {
    const d = new Date(b.savedAt);
    const timeStr = d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const deckCount = Object.keys(b.decks || {}).length;
    const cardCount = Object.values(b.decks || {}).reduce((s: any, d: any) => s + d.cards.length, 0);
    const sizeStr = Math.round(JSON.stringify(b).length / 1024) + 'KB';
    return `<div class="backup-row">
      <div class="backup-time">
        <div style="font-weight:500;color:var(--text)">${timeStr}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:1px">${deckCount} deck${deckCount !== 1 ? 's' : ''} · ${cardCount} cards</div>
      </div>
      <span class="backup-size">${sizeStr}</span>
      <button class="btn btn-b" style="font-size:11px;padding:5px 10px" onclick="restoreFromBackup(${i})">Restore</button>
    </div>`;
  }).join('');
}

async function restoreFromBackup(index: number): Promise<void> {
  const backups = ((await localforage.getItem('ftp-backups')) as any[]) || [];
  const b = backups[index];
  if (!b) { (window as any).toast('Backup not found.'); return; }
  const d = new Date(b.savedAt);
  if (!confirm(`Restore backup from ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}?\n\nThis will replace your current decks, cards, and notes.`)) return;
  if (b.decks) S.decks = b.decks;
  if (b.deckOrder) S.deckOrder = b.deckOrder;
  if (b.notes) {
    for (const key in notes) delete notes[key];
    Object.assign(notes, b.notes);
  }
  if (b.folders) S.folders = b.folders;
  if (b.folderOrder) S.folderOrder = b.folderOrder;
  await persist();
  (window as any).renderSidebar(); (window as any).updateStats(); (window as any).renderNoteTabs();
  (window as any).toast('✓ Backup restored!');
}

async function checkStorageQuota(forceShow?: boolean): Promise<void> {
  const fillEl = document.getElementById('storage-fill');
  const usedLabel = document.getElementById('storage-used-label');
  const pctLabel = document.getElementById('storage-pct-label');
  if (!fillEl) return;

  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      const usedMB = ((usage || 0) / 1048576).toFixed(1);
      const quotaMB = ((quota || 0) / 1048576).toFixed(0);
      const pct = Math.min(100, Math.round((usage || 0) / (quota || 1) * 100));

      if (usedLabel) usedLabel.textContent = `Using ${usedMB} MB of ~${quotaMB} MB`;
      if (pctLabel)  pctLabel.textContent = `${pct}%`;
      if (fillEl) {
        fillEl.style.width = pct + '%';
        fillEl.className = 'storage-fill' + (pct > 85 ? ' danger' : pct > 60 ? ' warn' : '');
      }

      // Warn when near limit
      if (pct > 85) {
        (window as any).toast(`⚠️ Storage ${pct}% full! Export a backup now to avoid data loss.`);
      }
    } else {
      if (usedLabel) usedLabel.textContent = 'Storage info unavailable in this browser';
    }
  } catch (e) {
    if (usedLabel) usedLabel.textContent = 'Could not read storage info';
  }
}

function syncToDisk(): void {
  const payload = {
    decks: S.decks,
    deckOrder: S.deckOrder,
    notes: notes,
    folders: S.folders,
    folderOrder: S.folderOrder,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ftp-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  (window as any).toast('✓ Backup JSON generated for export!');
}

async function initStorage(): Promise<void> {
  try {
    const decks = await localforage.getItem('ftp-decks');
    if (decks) S.decks = decks;
    else {
      const ls = localStorage.getItem('ftp-decks');
      if (ls) { S.decks = JSON.parse(ls); await localforage.setItem('ftp-decks', S.decks); }
    }
    const order = await localforage.getItem('ftp-deck-order');
    S.deckOrder = order || (() => { try { return JSON.parse(localStorage.getItem('ftp-deck-order') || '[]'); } catch (_) { return []; } })();

    const srs = await localforage.getItem('ftp-srs');
    S.srsEnabled = srs !== null ? srs !== 'false' : localStorage.getItem('ftp-srs') !== 'false';

    const n = await localforage.getItem('ftp-notes');
    if (n) {
      for (const key in notes) delete notes[key];
      Object.assign(notes, n);
    }
    else {
      const lsn = localStorage.getItem('ftp-notes');
      if (lsn) {
        const parsed = JSON.parse(lsn);
        for (const key in notes) delete notes[key];
        Object.assign(notes, parsed);
        await localforage.setItem('ftp-notes', notes);
      }
    }

    const folders = await localforage.getItem('ftp-folders');
    if (folders) S.folders = folders;
    else { try { S.folders = JSON.parse(localStorage.getItem('ftp-folders') || '{}'); } catch (_) { } }
    const folderOrder = await localforage.getItem('ftp-folder-order');
    S.folderOrder = folderOrder || (() => { try { return JSON.parse(localStorage.getItem('ftp-folder-order') || '[]'); } catch (_) { return []; } })();

  } catch (e) {
    try { S.decks = JSON.parse(localStorage.getItem('ftp-decks') || '{}'); } catch (_) { }
    try { S.deckOrder = JSON.parse(localStorage.getItem('ftp-deck-order') || '[]'); } catch (_) { }
    S.srsEnabled = localStorage.getItem('ftp-srs') !== 'false';
    try {
      const lsn = localStorage.getItem('ftp-notes');
      if (lsn) {
        const parsed = JSON.parse(lsn);
        for (const key in notes) delete notes[key];
        Object.assign(notes, parsed);
      }
    } catch (_) { }
    try { S.folders = JSON.parse(localStorage.getItem('ftp-folders') || '{}'); } catch (_) { }
    try { S.folderOrder = JSON.parse(localStorage.getItem('ftp-folder-order') || '[]'); } catch (_) { }
  }
  if (!Object.keys(notes).length) {
    const id = Date.now().toString(36);
    notes[id] = { title: 'My First Note', content: '', updatedAt: Date.now() };
  }
}


// ─── ES module exports (auto-generated) ───
export { checkStorageQuota, initStorage, persist, renderBackupList, restoreFromBackup, saveVersionedBackup, syncToDisk, updateLastSynced };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { checkStorageQuota, initStorage, persist, renderBackupList, restoreFromBackup, saveVersionedBackup, syncToDisk, updateLastSynced });
