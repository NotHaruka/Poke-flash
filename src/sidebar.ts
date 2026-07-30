import { populateDeckSelector } from './chat.js';
import { StudySession, renderCardsList } from './deck-manager.js';
import { app } from './firebase.js';
import { syncCreateDeck, syncDeleteDeck, syncMoveDeckToFolder, syncRenameDeck } from './firebase-sync.js';
import { initGame, pauseGame } from './game.js';
import { renderGamesArcade } from './games.js';
import { renderLibrary } from './library.js';
import { S } from './main.js';
import { populateQRDeckSelect } from './settings.js';
import { computeLevel, computeStreak, getActivityData, getLocalActivityData, renderStats } from './stats.js';
import { checkStorageQuota, persist, renderBackupList } from './storage.js';
import { buildQuizQueue, closeNoteEditor, notes, renderNoteTabs, renderStudy } from './study.js';
import { escH, getLocalMidnightTonight, showCustomConfirm, toast, uid } from './utils.js';











function closeSidebar() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('show');
  const fab = document.getElementById('fab');
  if (fab) fab.textContent = '☰';
}

function toggleDesktopSidebar() {
  const sidebar = document.getElementById('sidebar');
  const app = document.getElementById('app-container');
  if (!sidebar || !app) return;
  const isCollapsed = sidebar.classList.contains('collapsed');
  sidebar.classList.toggle('collapsed', !isCollapsed);
  app.classList.toggle('sidebar-collapsed', !isCollapsed);
  // Persist state
  localStorage.setItem('ftp-sidebar-collapsed', !isCollapsed ? 'true' : 'false');
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  const isOpen  = sidebar.classList.contains('open');
  sidebar.classList.toggle('open', !isOpen);
  document.getElementById('sidebar-overlay')?.classList.toggle('show', !isOpen);
  const fab = document.getElementById('fab');
  if (fab) fab.textContent = !isOpen ? '✕' : '☰';
}

function toggleSidebarBottom() {
  const toggle = document.getElementById('sbt-toggle');
  const body = document.getElementById('sbt-body');
  if (!toggle || !body) return;
  const collapsed = body.classList.toggle('collapsed');
  toggle.classList.toggle('collapsed', collapsed);
}

function showPanel(name, btn) {
  if (name !== 'game') {
    (window as any).previousPanel = name;
  }
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.remove('active'));
  const panel = document.getElementById('panel-'+name);
  if (!panel) return;
  panel.classList.add('active');
  // Re-trigger animation even if same panel re-shown
  panel.style.animation = 'none';
  panel.offsetHeight; // reflow
  panel.style.animation = '';
  if (btn) btn.classList.add('active');
  const sideBtn = document.querySelector(`.nav-item[data-panel="${name}"]`);
  if (sideBtn) sideBtn.classList.add('active');
  document.querySelectorAll('.bnav-item').forEach(b=>b.classList.remove('active'));
  const bnav = document.getElementById('bnav-'+name);
  if (bnav) bnav.classList.add('active');
  if (name !== 'study' && S.examActive) {
    if (typeof (window as any).examStopTimer === 'function') {
      (window as any).examStopTimer();
      toast('⏸️ Exam paused');
    }
  }

  closeSidebar();

  const appContainer = document.getElementById('app-container');
  if (appContainer) {
    appContainer.classList.remove('cyberflap-mode');
    appContainer.classList.remove('cyberflap-theater');
  }

  if (name === 'notes') {
    if (typeof (window as any).closeNoteEditor === 'function') (window as any).closeNoteEditor();
    if (typeof (window as any).renderNoteTabs === 'function') (window as any).renderNoteTabs();
  }
  if (name === 'stats') renderStats();
  if (name === 'study') {
    if (S.examActive) {
      if (typeof (window as any).examStartTimer === 'function') {
        (window as any).examStartTimer();
      }
    } else if (S.studyId === null) {
      renderWelcomeDashboard();
    }
  }
  if (name === 'library') {
    if (typeof (window as any).renderLibrary === 'function') (window as any).renderLibrary();
  }
  if (name === 'flash-games') {
    if (typeof (window as any).renderGamesArcade === 'function') (window as any).renderGamesArcade();
  }
  if (name === 'settings') { 
    checkStorageQuota(); 
    renderBackupList(); 
    if (typeof (window as any).populateQRDeckSelect === 'function') (window as any).populateQRDeckSelect();
    if (typeof (window as any).populateQRFolderSelect === 'function') (window as any).populateQRFolderSelect();
  }
  if (name === 'chat') { 
    (window as any).populateDeckSelector?.();
    const chatInput = document.getElementById('chat-input') as HTMLInputElement;
    if (chatInput) setTimeout(() => chatInput.focus(), 100);
  }



  // Initialize or pause the custom Blade Bedlam game on panel transitions
  if (name === 'game') {
    document.body.classList.add('game-panel-active');
    initGame();
  } else {
    document.body.classList.remove('game-panel-active');
    pauseGame();
  }

  // Handle Cyberflap panel active state cleanup
  if (name !== 'cyberflap') {
    document.body.classList.remove('cyberflap-active');
    const btn = document.getElementById('btn-cyberflap-theater');
    if (btn) {
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width: 14px; height: 14px;"><rect x="2" y="3" width="20" height="14" rx="2" ry="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" /></svg><span>Theater Mode</span>`;
    }
  }
}
function renderSidebar() {
  const el = document.getElementById('sidebar-decks');
  if (!el) return;

  // Render Cross-Deck Global Tag scrolling bar
  const allGlobalTagsSet = new Set<string>();
  Object.values(S.decks).forEach((d: any) => {
    d.cards.forEach((c: any) => {
      (c.tags || []).forEach((t: string) => {
        if (t.trim()) {
          allGlobalTagsSet.add(t.trim());
        }
      });
    });
  });
  const allGlobalTags = [...allGlobalTagsSet].sort();
  const tagsScroll = document.getElementById('sidebar-tags-scroll');
  const tagsSection = document.getElementById('sidebar-tags-section');
  if (tagsScroll && tagsSection) {
    if (!allGlobalTags.length) {
      tagsSection.style.display = 'none';
    } else {
      tagsSection.style.display = 'block';
      tagsScroll.innerHTML = allGlobalTags.map(tag => {
        const activeClass = (S.studyId === '__cross_deck__' && S.activeTag === tag) ? ' active' : '';
        return `<span class="sidebar-tag-chip${activeClass}" onclick="studyAllTag('${tag}')">${escH(tag)}</span>`;
      }).join('');
    }
  }

  // Sync deck order — prune deleted, add new
  const allIds = Object.keys(S.decks);
  S.deckOrder = S.deckOrder.filter(id => S.decks[id]);
  const missing = allIds.filter(id => !S.deckOrder.includes(id));
  S.deckOrder = [...S.deckOrder, ...missing];

  // Sync folder order
  S.folderOrder = S.folderOrder.filter(fid => S.folders[fid]);
  const missingF = Object.keys(S.folders).filter(fid => !S.folderOrder.includes(fid));
  S.folderOrder = [...S.folderOrder, ...missingF];

  if (!S.deckOrder.length && !S.folderOrder.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3);padding:4px 12px 8px">No decks yet</div>';
    return;
  }

  // Group decks by folder
  const decksByFolder = {}; // folderId -> [deckId]
  const ungrouped = [];
  for (const id of S.deckOrder) {
    if (!S.decks[id]) continue;
    const fid = S.decks[id].folderId;
    if (fid && S.folders[fid]) {
      if (!decksByFolder[fid]) decksByFolder[fid] = [];
      decksByFolder[fid].push(id);
    } else {
      ungrouped.push(id);
    }
  }

  function renderDeckItem(id) {
    const d = S.decks[id];
    const dueCount = S.srsEnabled ? d.cards.filter(c => c.due <= getLocalMidnightTonight()).length : 0;
    const active = S.selDeck === id ? ' active' : '';
    const tag = d.ai ? '<span class="ai-tag">AI</span>' : '';
    const pip = dueCount > 0 ? `<span style="font-size:10px;padding:1px 5px;border-radius:6px;background:var(--yellow-dim);color:var(--yellow);border:1px solid rgba(255,209,102,0.25)">${dueCount}</span>` : '';
    const isSelectMode = window._deckSelectMode;
    const isChecked = isSelectMode && (window._deckSelected || new Set()).has(id);
    if (isSelectMode) {
      return `<div class="deck-item${active}${isChecked?' active':''}" id="deck-row-${id}" data-deck-id="${id}"
        onclick="toggleDeckCheck('${id}')" style="cursor:pointer">
        <input type="checkbox" ${isChecked?'checked':''} onclick="event.stopPropagation();toggleDeckCheck('${id}')">
        <div class="di-name">${escH(d.name)}</div>
        ${tag}${pip}
        <div class="di-n">${d.cards.length}</div>
      </div>`;
    }
    return `<div class="deck-item${active}" id="deck-row-${id}" draggable="true" data-deck-id="${id}" onclick="selectDeck('${id}')">
      <span class="di-drag" title="Drag to reorder">⠿</span>
      <div class="di-dot"></div>
      <div class="di-name" id="di-name-${id}">${escH(d.name)}</div>
      ${tag}${pip}
      <div class="di-n">${d.cards.length}</div>
      <button class="di-rename" onclick="event.stopPropagation();startRename('${id}')" title="Rename" style="display:inline-flex;align-items:center;justify-content:center">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button class="di-del" onclick="event.stopPropagation();delDeck('${id}')" title="Delete">×</button>
    </div>`;
  }

  let html = '';

  // Render folders first
  for (const fid of S.folderOrder) {
    const f = S.folders[fid];
    const decksInFolder = decksByFolder[fid] || [];
    const collapsed = f.collapsed ? '' : 'open';
    const colClass = f.collapsed ? 'collapsed' : '';
    const folderDueCount = S.srsEnabled ? decksInFolder.reduce((sum, id) => {
      return sum + S.decks[id].cards.filter(c => c.due <= getLocalMidnightTonight()).length;
    }, 0) : 0;
    const duePip = folderDueCount > 0 ? `<span style="font-size:10px;padding:1px 5px;border-radius:6px;background:var(--yellow-dim);color:var(--yellow);border:1px solid rgba(255,209,102,0.25)">${folderDueCount}</span>` : '';
    const innerDecks = decksInFolder.map(renderDeckItem).join('');
    const emptyHint = !decksInFolder.length
      ? `<div style="font-size:11px;color:var(--text3);padding:6px 12px;font-style:italic">No decks — move a deck here</div>`
      : '';
    html += `<div class="folder-group" id="folder-group-${fid}" draggable="true" data-folder-id="${fid}">
      <div class="folder-header" onclick="toggleFolder('${fid}')">
        <span class="di-drag" title="Drag to reorder"></span>
        <span class="folder-chevron ${collapsed}"></span>
        <span class="folder-icon" style="display:inline-flex;align-items:center;color:var(--accent)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        </span>
        <span class="folder-name" id="folder-name-${fid}">${escH(f.name)}</span>
        ${duePip}
        <span class="folder-count">${decksInFolder.length}</span>
        <div class="folder-actions" onclick="event.stopPropagation()">
          <button class="folder-act-btn" onclick="startFolderRename('${fid}')" title="Rename folder" style="display:inline-flex;align-items:center;justify-content:center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button class="folder-act-btn del" onclick="delFolder('${fid}')" title="Delete folder">×</button>
        </div>
      </div>
      <div class="folder-decks ${colClass}" id="folder-decks-${fid}" style="max-height:${f.collapsed?'0':decksInFolder.length*44+40+'px'}">
        ${emptyHint}${innerDecks}
      </div>
    </div>`;
  }

  // Render ungrouped decks
  if (ungrouped.length) {
    html += ungrouped.map(renderDeckItem).join('');
  }

  el.innerHTML = html;
  // Keep QR deck picker in sync
  populateQRDeckSelect && populateQRDeckSelect();
  // Keep select bar count in sync
  if (window._deckSelectMode) _updateSelectBar();
  // Keep library in sync
  if (typeof (window as any).renderLibrary === 'function') {
    (window as any).renderLibrary();
  }
}

// ─── DECK MULTI-SELECT ────────────────────────────────────────────────────────
window._deckSelectMode = false;
window._deckSelected   = new Set();

function toggleDeckSelectMode() {
  window._deckSelectMode = !window._deckSelectMode;
  window._deckSelected   = new Set();
  const bar = document.getElementById('sidebar-select-bar');
  const btn = document.getElementById('btn-deck-select-toggle');
  if (bar) bar.classList.toggle('show', window._deckSelectMode);
  if (btn) btn.textContent = window._deckSelectMode ? 'Cancel' : 'Select';
  // Hide folder picker if open
  const folderRow = document.getElementById('sel-folder-row');
  if (folderRow) folderRow.classList.remove('show');
  renderSidebar();
}

function toggleDeckCheck(id) {
  if (!window._deckSelectMode) return;
  if (window._deckSelected.has(id)) window._deckSelected.delete(id);
  else window._deckSelected.add(id);
  _updateSelectBar();
  // Update just this row's checkbox state without full re-render
  const row = document.getElementById('deck-row-' + id);
  if (row) {
    const cb = row.querySelector('input[type=checkbox]');
    if (cb) cb.checked = window._deckSelected.has(id);
    row.classList.toggle('active', window._deckSelected.has(id));
  }
}

function _updateSelectBar() {
  const n = window._deckSelected.size;
  const el = document.getElementById('sidebar-select-count');
  if (el) el.textContent = `${n} selected`;
  const folderBtn = document.getElementById('btn-sel-folder');
  if (folderBtn) folderBtn.style.opacity = n > 0 ? '1' : '0.4';
}

function deckSelectAll() {
  S.deckOrder.forEach(id => window._deckSelected.add(id));
  renderSidebar();
}

function deckSelectNone() {
  window._deckSelected.clear();
  renderSidebar();
}

async function deckSelectDelete() {
  const ids = [...window._deckSelected];
  if (!ids.length) { toast('No decks selected.'); return; }
  const confirmed = await showCustomConfirm(
    'Delete Decks',
    `Delete ${ids.length} deck${ids.length !== 1 ? 's' : ''} and all their cards? This cannot be undone.`,
    true
  );
  if (!confirmed) return;
  
  // Call syncDeleteDeck to delete them from Firebase if active
  import('./firebase-sync.js').then(({ syncDeleteDeck }) => {
    ids.forEach(id => syncDeleteDeck(id).catch(err => console.warn("Sync delete failed:", err)));
  }).catch(e => console.warn("Could not load firebase-sync module for deletion:", e));

  ids.forEach(id => {
    delete S.decks[id];
    // Clear the manage/editor panel if the deleted deck is selected there
    if (S.selDeck === id) {
      S.selDeck = null;
      const edForm = document.getElementById('ed-form');
      const edPlaceholder = document.getElementById('ed-placeholder');
      if (edForm) edForm.style.display = 'none';
      if (edPlaceholder) edPlaceholder.style.display = 'block';
    }
    // Clear the study panel if the deleted deck is being studied
    if (S.studyId === id) {
      S.studyId = null;
      const studyBody = document.getElementById('study-body');
      const noDeck    = document.getElementById('no-deck');
      if (studyBody) studyBody.style.display = 'none';
      if (noDeck)    { noDeck.style.display    = 'block'; renderWelcomeDashboard(); }
      // Also reset the queue so no ghost cards remain
      S.queue = []; S.idx = 0; S.flipped = false;
    }
  });
  S.deckOrder = S.deckOrder.filter(id => S.decks[id]);
  window._deckSelected.clear();
  window._deckSelectMode = false;
  const bar = document.getElementById('sidebar-select-bar');
  if (bar) bar.classList.remove('show');
  const btn = document.getElementById('btn-deck-select-toggle');
  if (btn) btn.textContent = 'Select';
  persist(); renderSidebar(); updateStats();
  toast(`Deleted ${ids.length} deck${ids.length !== 1 ? 's' : ''}.`);
}

function toggleSelFolderPicker() {
  const ids = [...window._deckSelected];
  if (!ids.length) { toast('Select at least one deck first.'); return; }
  const row = document.getElementById('sel-folder-row');
  if (!row) return;
  const isOpen = row.classList.contains('show');
  if (isOpen) { row.classList.remove('show'); return; }
  // Build folder chips
  const folderIds = S.folderOrder.filter(fid => S.folders[fid]);
  if (!folderIds.length) { toast('No folders yet — create one below first.'); return; }
  row.innerHTML = `
    <span style="font-size:11px;color:var(--text3);align-self:center;flex-shrink:0">Move to:</span>
    ${folderIds.map(fid => `<span class="sel-folder-chip" onclick="moveSelectedToFolder('${fid}')">${escH(S.folders[fid].name)}</span>`).join('')}
    <span class="sel-folder-chip" onclick="moveSelectedToFolder(null)" style="color:var(--text3)">Remove from folder</span>`;
  row.classList.add('show');
}

function moveSelectedToFolder(folderId) {
  const ids = [...window._deckSelected];
  if (!ids.length) return;
  ids.forEach(id => {
    if (!S.decks[id]) return;
    if (folderId) {
      S.decks[id].folderId = folderId;
      if (S.folders[folderId]) S.folders[folderId].collapsed = false;
    } else {
      delete S.decks[id].folderId;
    }
  });
  const folderName = folderId ? S.folders[folderId]?.name : null;
  document.getElementById('sel-folder-row')?.classList.remove('show');
  persist(); renderSidebar();
  toast(folderName ? `Moved ${ids.length} deck${ids.length!==1?'s':''} to "${folderName}"` : `Removed ${ids.length} deck${ids.length!==1?'s':''} from folder`);

  import('./firebase-sync.js').then(({ syncMoveDeckToFolder }) => {
    ids.forEach(id => syncMoveDeckToFolder(id, folderId || null).catch(err => console.warn("Sync failed:", err)));
  }).catch(e => console.warn("Could not load firebase-sync module:", e));
}

function updateStats() {
  let c=0; Object.values(S.decks).forEach((d: any)=>c+=d.cards.length);
  const dEl = document.getElementById('stat-d');
  const cEl = document.getElementById('stat-c');
  if (dEl) dEl.textContent=String(Object.keys(S.decks).length);
  if (cEl) cEl.textContent=String(c);
}

function addFolder() {
  const inp = document.getElementById('new-folder-inp');
  const name = inp ? inp.value.trim() : '';
  if (!name) { if (inp) { inp.focus(); inp.style.borderColor = 'var(--red)'; setTimeout(() => inp.style.borderColor = '', 1000); } return; }
  const fid = 'f' + uid();
  S.folders[fid] = { name, collapsed: false };
  S.folderOrder.push(fid);
  if (inp) inp.value = '';
  persist(); renderSidebar();
  toast(`"${name}" folder created!`);
}

// ── CREATE POPOVER ─────────────────────────────────────────────────────────────
let _createPopoverOpen = false;
let _createTab = 'deck';

function toggleCreatePopover() {
  _createPopoverOpen ? closeCreatePopover() : openCreatePopover();
}

function openCreatePopover() {
  _createPopoverOpen = true;
  const pop  = document.getElementById('create-popover');
  const back = document.getElementById('create-backdrop');
  const btn  = document.getElementById('btn-create-new');
  if (!pop) return;
  
  // Detect mobile
  const isMobile = window.innerWidth <= 768;
  
  // Position the popover from the button's bounding rect
  const bRect = btn ? btn.getBoundingClientRect() : null;
  if (bRect) {
    if (isMobile) {
      // On mobile: position relative to anchor element (absolute positioning)
      const anchor = document.querySelector('.create-popover-anchor');
      const anchorRect = anchor ? anchor.getBoundingClientRect() : null;
      if (anchorRect) {
        // Position below the button
        pop.style.position = 'absolute';
        pop.style.top = (bRect.height + 8) + 'px';
        pop.style.left = '0px';
        pop.style.right = 'auto';
        pop.style.bottom = 'auto';
        pop.classList.remove('open','open-up');
        pop.classList.add('open');
      }
    } else {
      // Desktop: fixed positioning
      pop.style.position = 'fixed';
      const spaceBelow = window.innerHeight - bRect.bottom;
      const popW = 240;
      let left = bRect.left;
      if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
      if (left < 8) left = 8;
      pop.style.left = left + 'px';
      if (spaceBelow < 200) {
        pop.style.top  = '';
        pop.style.bottom = (window.innerHeight - bRect.top + 4) + 'px';
        pop.classList.remove('open','open-up');
        pop.classList.add('open-up');
      } else {
        pop.style.bottom = '';
        pop.style.top  = (bRect.bottom + 4) + 'px';
        pop.classList.remove('open','open-up');
        pop.classList.add('open');
      }
    }
  } else {
    pop.classList.remove('open','open-up');
    pop.classList.add('open');
  }
  if (back) back.classList.add('show');
  if (btn)  btn.style.opacity = '0.8';
  setTimeout(() => {
    const inp = document.getElementById(_createTab === 'deck' ? 'cpop-deck-inp' : 'cpop-folder-inp');
    if (inp) inp.focus();
  }, 50);
}

function closeCreatePopover() {
  _createPopoverOpen = false;
  const pop  = document.getElementById('create-popover');
  const back = document.getElementById('create-backdrop');
  const btn  = document.getElementById('btn-create-new');
  if (pop)  { pop.classList.remove('open'); pop.classList.remove('open-up'); }
  if (back) back.classList.remove('show');
  if (btn)  { btn.style.opacity = ''; btn.style.background = ''; }
  // Clear inputs
  const di = document.getElementById('cpop-deck-inp');
  const fi = document.getElementById('cpop-folder-inp');
  if (di) di.value = '';
  if (fi) fi.value = '';
}

function switchCreateTab(tab) {
  _createTab = tab;
  document.getElementById('cpop-tab-deck').classList.toggle('active',   tab === 'deck');
  document.getElementById('cpop-tab-folder').classList.toggle('active', tab === 'folder');
  const deckPanel   = document.getElementById('cpop-panel-deck');
  const folderPanel = document.getElementById('cpop-panel-folder');
  if (deckPanel)   deckPanel.style.display   = tab === 'deck'   ? 'block' : 'none';
  if (folderPanel) folderPanel.style.display = tab === 'folder' ? 'block' : 'none';
  setTimeout(() => {
    const inp = document.getElementById(tab === 'deck' ? 'cpop-deck-inp' : 'cpop-folder-inp');
    if (inp) inp.focus();
  }, 40);
}

function cpopAddDeck() {
  const inp  = document.getElementById('cpop-deck-inp');
  const name = inp?.value.trim();
  if (!name) {
    inp?.classList.remove('shake');
    inp?.offsetWidth; // reflow
    inp?.classList.add('shake');
    inp?.addEventListener('animationend', () => inp?.classList.remove('shake'), { once: true });
    inp?.focus(); return;
  }
  const id = uid();
  S.decks[id] = { name, cards: [], ai: false };
  if (inp) inp.value = '';
  persist(); renderSidebar(); updateStats();
  selectDeck(id);
  closeCreatePopover();
  toast(`"${name}" created!`);
}

function cpopAddFolder() {
  const inp  = document.getElementById('cpop-folder-inp');
  const name = inp?.value.trim();
  if (!name) {
    inp?.classList.remove('shake');
    inp?.offsetWidth;
    inp?.classList.add('shake');
    inp?.addEventListener('animationend', () => inp?.classList.remove('shake'), { once: true });
    inp?.focus(); return;
  }
  const fid = 'f' + uid();
  S.folders[fid] = { name, collapsed: false };
  S.folderOrder.push(fid);
  if (inp) inp.value = '';
  persist(); renderSidebar();
  closeCreatePopover();
  toast(`"${name}" created!`);
}

async function delFolder(fid) {
  const f = S.folders[fid];
  if (!f) return;
  // Move all decks in this folder back to ungrouped
  const deckCount = Object.values(S.decks).filter((d: any) => d.folderId === fid).length;
  const msg = deckCount
    ? `Delete folder "${f.name}"? The ${deckCount} deck(s) inside will become ungrouped.`
    : `Delete empty folder "${f.name}"?`;
  const confirmed = await showCustomConfirm('Delete Folder', msg, true);
  if (!confirmed) return;
  
  // Unassign decks
  const affectedDecks: string[] = [];
  Object.entries(S.decks).forEach(([id, d]: [string, any]) => {
    if (d.folderId === fid) {
      delete d.folderId;
      affectedDecks.push(id);
    }
  });
  
  delete S.folders[fid];
  S.folderOrder = S.folderOrder.filter(id => id !== fid);
  persist(); renderSidebar(); toast('Folder deleted.');

  import('./firebase-sync.js').then(({ syncMoveDeckToFolder }) => {
    affectedDecks.forEach(id => syncMoveDeckToFolder(id, null).catch(err => console.warn("Sync failed:", err)));
  }).catch(e => console.warn("Could not load firebase-sync module:", e));
}

function toggleFolder(fid) {
  if (!S.folders[fid]) return;
  S.folders[fid].collapsed = !S.folders[fid].collapsed;
  persist(); renderSidebar();
}

function startFolderRename(fid) {
  const nameEl = document.getElementById(`folder-name-${fid}`);
  if (!nameEl) return;
  const current = S.folders[fid].name;
  nameEl.outerHTML = `<input class="folder-name-input" id="folder-rename-inp-${fid}"
    value="${escH(current)}"
    onclick="event.stopPropagation()"
    onkeydown="handleFolderRenameKey(event,'${fid}')"
    onblur="commitFolderRename('${fid}')">`;
  const inp = document.getElementById(`folder-rename-inp-${fid}`);
  if (inp) { inp.focus(); (inp as HTMLInputElement).select(); }
}

function handleFolderRenameKey(e, fid) {
  e.stopPropagation();
  if (e.key === 'Enter') commitFolderRename(fid);
  if (e.key === 'Escape') renderSidebar();
}

function commitFolderRename(fid) {
  const inp = document.getElementById(`folder-rename-inp-${fid}`);
  if (!inp) return;
  const newName = inp.value.trim();
  if (newName && S.folders[fid] && newName !== S.folders[fid].name) {
    S.folders[fid].name = newName;
    persist();
    toast(`Renamed to "${newName}"!`);
  }
  renderSidebar();
}

// ─── FOLDER PICKER DROPDOWN ───────────────────────────────────────────────────
let _activeFolderPicker = null;
function openFolderPicker(deckId, btn) {
  closeFolderPicker();
  const folderIds = S.folderOrder.filter(fid => S.folders[fid]);
  const currentFid = S.decks[deckId]?.folderId;

  let html = '';
  if (folderIds.length) {
    html += folderIds.map(fid => {
      const active = currentFid === fid ? ' active' : '';
      return `<div class="folder-picker-opt${active}" onmousedown="moveDeckToFolder('${deckId}','${fid}')" style="display:flex;align-items:center">
        <span style="display:inline-flex;align-items:center;color:var(--accent);margin-right:6px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span><span>${escH(S.folders[fid].name)}</span>
        ${currentFid === fid ? '<span style="margin-left:auto;color:var(--accent)">✓</span>' : ''}
      </div>`;
    }).join('');
    if (currentFid) {
      html += `<div class="folder-picker-sep"></div>
        <div class="folder-picker-opt" onmousedown="moveDeckToFolder('${deckId}',null)">
          <span>✕</span><span style="color:var(--text3)">Remove from folder</span>
        </div>`;
    }
  } else {
    html = `<div class="folder-picker-opt" style="cursor:default;color:var(--text3)">No folders yet —<br>use the input below to create one</div>`;
  }

  const dropdown = document.createElement('div');
  dropdown.className = 'folder-picker-dropdown';
  dropdown.id = 'folder-picker-dd';
  dropdown.innerHTML = html;

  // Append to body and position using fixed coords to avoid overflow:hidden clipping
  document.body.appendChild(dropdown);
  const rect = btn.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  
  // Viewport-aware boundary check
  const ddRect = dropdown.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  const ddHeight = ddRect.height || 200;
  
  if (spaceBelow < ddHeight + 10 && rect.top > ddHeight + 10) {
    // Show ABOVE the button
    dropdown.style.top = '';
    dropdown.style.bottom = (window.innerHeight - rect.top + 4) + 'px';
  } else {
    // Show BELOW the button
    dropdown.style.bottom = '';
    dropdown.style.top = (rect.bottom + 4) + 'px';
  }
  
  dropdown.style.left = Math.min(Math.max(8, rect.left), window.innerWidth - 180) + 'px';
  dropdown.style.zIndex = '9999';

  _activeFolderPicker = dropdown;

  // Use mousedown on outside so it fires before blur, but don't close on the btn itself
  setTimeout(() => {
    document.addEventListener('mousedown', closeFolderPickerOutside);
  }, 0);
}

function closeFolderPickerOutside(e) {
  const dd = document.getElementById('folder-picker-dd');
  if (dd && !dd.contains(e.target)) {
    closeFolderPicker();
  }
}

function closeFolderPicker() {
  document.removeEventListener('mousedown', closeFolderPickerOutside);
  const dd = document.getElementById('folder-picker-dd');
  if (dd) dd.remove();
  _activeFolderPicker = null;
}

function moveDeckToFolder(deckId, folderId) {
  if (!S.decks[deckId]) return;
  closeFolderPicker();
  if (folderId) {
    S.decks[deckId].folderId = folderId;
    // Make sure folder is expanded when a deck is added
    if (S.folders[folderId]) S.folders[folderId].collapsed = false;
    toast(`Moved to "${S.folders[folderId]?.name}"!`);
  } else {
    delete S.decks[deckId].folderId;
    toast('Removed from folder.');
  }
  persist(); renderSidebar();

  import('./firebase-sync.js').then(({ syncMoveDeckToFolder }) => {
    syncMoveDeckToFolder(deckId, folderId || null).catch(err => console.warn("Sync failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module:", e));
}

function addDeck() {
  const inp=document.getElementById('new-deck-inp');
  const name=inp.value.trim(); if(!name) return;
  const id=uid();
  S.decks[id]={name,cards:[],ai:false,createdAt:Date.now()};
  inp.value=''; persist(); renderSidebar(); updateStats();
  selectDeck(id); toast(`"${name}" created!`);

  // Sync to Firebase
  import('./firebase-sync.js').then(({ syncCreateDeck }) => {
    syncCreateDeck(id, name).catch(err => console.warn("Sync failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module for creation:", e));
}

async function delDeck(id) {
  if(!S.decks[id]) return;
  const confirmed = await showCustomConfirm(
    'Delete Deck',
    `Delete "${S.decks[id].name}" and all its cards?`,
    true
  );
  if (!confirmed) return;
  
  // Call syncDeleteDeck to delete it from Firebase if active
  import('./firebase-sync.js').then(({ syncDeleteDeck }) => {
    syncDeleteDeck(id).catch(err => console.warn("Sync delete failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module for deletion:", e));

  delete S.decks[id];
  S.deckOrder = S.deckOrder.filter(did => did !== id);
  if(S.selDeck===id){S.selDeck=null;const form=document.getElementById('ed-form'); if(form) form.style.display='none'; const placeholder=document.getElementById('ed-placeholder'); if(placeholder) placeholder.style.display='block';}
  if(S.studyId===id){S.studyId=null;const noDeck=document.getElementById('no-deck'); if(noDeck) noDeck.style.display='block'; const studyBody=document.getElementById('study-body'); if(studyBody) studyBody.style.display='none';}
  if(S.studyId===null){
    renderWelcomeDashboard();
  }
  persist(); renderSidebar(); updateStats(); toast('Deck deleted.');
}

function startRename(id) {
  const nameEl = document.getElementById(`di-name-${id}`);
  if (!nameEl) return;
  const current = S.decks[id].name;
  // Replace the name div with an inline input
  nameEl.outerHTML = `<input
    class="di-rename-input"
    id="di-rename-inp-${id}"
    value="${escH(current)}"
    onclick="event.stopPropagation()"
    onkeydown="handleRenameKey(event,'${id}')"
    onblur="commitRename('${id}')">`;
  const inp = document.getElementById(`di-rename-inp-${id}`);
  if (inp) { inp.focus(); (inp as HTMLInputElement).select(); }
}

function handleRenameKey(e, id) {
  e.stopPropagation();
  if (e.key === 'Enter') commitRename(id);
  if (e.key === 'Escape') cancelRename(id);
}

function commitRename(id) {
  const inp = document.getElementById(`di-rename-inp-${id}`);
  if (!inp) return;
  const newName = inp.value.trim();
  if (newName && newName !== S.decks[id]?.name) {
    S.decks[id].name = newName;
    persist();
    // Update study title if this deck is active
    if (S.studyId === id) document.getElementById('study-title').textContent = newName;
    // Update editor title if open
    if (S.selDeck === id) document.getElementById('ed-title').textContent = `Cards in "${newName}" (${S.decks[id].cards.length})`;
    toast(`Renamed to "${newName}"!`);

    // Sync rename to Firebase
    import('./firebase-sync.js').then(({ syncRenameDeck }) => {
      syncRenameDeck(id, newName).catch(err => console.warn("Sync failed:", err));
    }).catch(e => console.warn("Could not load firebase-sync module for rename:", e));
  }
  renderSidebar();
}

function cancelRename(_id?: any) {
  renderSidebar();
}

function selectDeck(id) {
  S.selDeck   = id;
  S.activeTag = null;
  renderSidebar();
  S.studyId = id;
  const d = S.decks[id];
  document.getElementById('study-title').textContent = d.name;
  document.getElementById('no-deck').style.display   = 'none';
  document.getElementById('study-body').style.display = 'block';
  loadQueue(d.cards);
  renderTagFilterChips(d);
  document.getElementById('ed-placeholder').style.display = 'none';
  document.getElementById('ed-form').style.display         = 'block';
  renderCardsList();
  updateDueBadge(d);
  updateSRSButton();
  showPanel('study', null);
}

function studyAllTag(tag: string) {
  S.selDeck = null;
  S.activeTag = tag;
  S.studyId = '__cross_deck__';
  
  const allMatchingCards: any[] = [];
  Object.values(S.decks).forEach((d: any) => {
    d.cards.forEach((c: any) => {
      if ((c.tags || []).includes(tag) || (c.tags || []).includes('#' + tag)) {
        allMatchingCards.push(c);
      }
    });
  });
  
  const studyTitle = document.getElementById('study-title');
  if (studyTitle) studyTitle.textContent = `All Cards tagged "${tag}"`;
  
  const noDeckEl = document.getElementById('no-deck');
  if (noDeckEl) noDeckEl.style.display = 'none';
  
  const studyBody = document.getElementById('study-body');
  if (studyBody) studyBody.style.display = 'block';
  
  loadQueue(allMatchingCards);
  
  const edPlaceholder = document.getElementById('ed-placeholder');
  if (edPlaceholder) edPlaceholder.style.display = 'block';
  const edForm = document.getElementById('ed-form');
  if (edForm) edForm.style.display = 'none';
  
  renderSidebar();
  showPanel('study', null);
}
(window as any).studyAllTag = studyAllTag;

function renderTagFilterChips(d) {
  const bar   = document.getElementById('tag-filter-bar');
  const chips = document.getElementById('tag-filter-chips');
  if (!bar || !chips) return;
  // Collect all unique tags from this deck
  const allTags = [...new Set(d.cards.flatMap(c => c.tags || []))].sort();
  if (!allTags.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'block';
  chips.innerHTML = [
    `<span class="tag-chip tag-chip-all${!S.activeTag?' active':''}" onclick="setTagFilter(null)">All cards</span>`,
    ...allTags.map(t =>
      `<span class="tag-chip${S.activeTag===t?' active':''}" onclick="setTagFilter('${escH(t)}')">${escH(t)}</span>`
    )
  ].join('');
}

function setTagFilter(tag) {
  S.activeTag = tag;
  if (S.studyId) {
    renderTagFilterChips(S.decks[S.studyId]);
    loadQueue(S.decks[S.studyId].cards);
  }
}

function updateDueBadge(_deck?: any) {
  // SRS info shown in the toggle button instead
  updateSRSButton();
}

function updateSRSButton() {
  const btn = document.getElementById('btn-srs-toggle');
  if (!btn) return;
  if (S.srsEnabled) {
    btn.textContent = 'On';
    btn.style.background = 'var(--accent-dim)';
    btn.style.borderColor = 'rgba(var(--accent-rgb),0.4)';
    btn.style.color = 'var(--accent)';
    btn.title = 'Spaced repetition ON — cards scheduled by difficulty. Click to turn off.';
  } else {
    btn.textContent = 'Off';
    btn.style.background = 'none';
    btn.style.borderColor = 'var(--border)';
    btn.style.color = 'var(--text3)';
    btn.title = 'Spaced repetition OFF — all cards treated equally. Click to turn on.';
  }
  // Keep settings panel toggle in sync
  const srsTog = document.getElementById('srs-toggle-settings');
  if (srsTog) srsTog.checked = S.srsEnabled;
}

function toggleSRS() {
  S.srsEnabled = !S.srsEnabled;
  persist();
  updateSRSButton();
  renderSidebar();   // instantly show/hide due-count pips on all decks
  renderWelcomeDashboard(); // refresh welcome dashboard
  if (S.studyId) loadQueue(S.decks[S.studyId].cards);
  toast(S.srsEnabled ? 'Spaced repetition ON' : 'Spaced repetition OFF');
}

function loadQueue(cards, dueOnly=false) {
  // If SRS is off, never filter by due date
  S.queue = StudySession.buildQueue(cards, S.srsEnabled && dueOnly, S.activeTag);
  StudySession.reset();
  if (S.mode==='quiz') buildQuizQueue();
  renderStudy();
}

async function renderWelcomeDashboard() {
  const container = document.getElementById('no-deck');
  if (!container) return;

  // Fetch stats telemetry
  let localActivity: any = {};
  let streak = 0;
  let totalXP = 0;
  let todayReviews = 0;
  let level = 1;
  let xpInLevel = 0;
  let xpNeeded = 100;

  try {
    if (typeof (window as any).getLocalActivityData === 'function') {
      localActivity = await (window as any).getLocalActivityData() || {};
    }
    if (typeof (window as any).computeStreak === 'function') {
      streak = await (window as any).computeStreak(localActivity) || 0;
    }
    if (typeof (window as any).getActivityData === 'function') {
      const rawActivity = await (window as any).getActivityData() || {};
      const todayString = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local format
      
      if (localActivity) {
        todayReviews = Number(localActivity[todayString] || 0);
      }
      
      for (const stats of Object.values(rawActivity) as any[]) {
        if (typeof stats === 'number') {
          totalXP += stats * 10;
        } else if (stats && typeof stats === 'object') {
          totalXP += (Number(stats.correct || 0) * 10) + (Number(stats.incorrect || 0) * 2);
        }
      }
    }
    if (typeof (window as any).computeLevel === 'function') {
      const levelObj = (window as any).computeLevel(totalXP);
      if (levelObj) {
        level = levelObj.level;
        xpInLevel = levelObj.xpInLevel;
        xpNeeded = levelObj.xpNeeded;
      }
    }
  } catch (err) {
    console.warn('Welcome dashboard could not read full telemetry:', err);
  }

  const midnight = getLocalMidnightTonight();
  const decksCount = Object.keys(S.decks).length;
  const totalCards = Object.values(S.decks).reduce((acc: any, d: any) => acc + (d.cards?.length || 0), 0);
  const totalDue = Object.values(S.decks).reduce((acc: any, d: any) => acc + (d.cards?.filter((c: any) => c.due <= midnight).length || 0), 0);

  // Update DOM elements on our redesigned scholar dashboard
  const elStreakText = document.getElementById('dashboard-streak-text');
  if (elStreakText) {
    elStreakText.textContent = streak > 0 ? `${streak} Day Streak` : '0 Day Streak';
  }

  const elDueTitle = document.getElementById('dashboard-due-title');
  if (elDueTitle) {
    elDueTitle.textContent = `${totalDue} Card${totalDue !== 1 ? 's' : ''} Due`;
  }

  const elDueStatus = document.getElementById('dashboard-due-status-pill');
  if (elDueStatus) {
    elDueStatus.textContent = S.srsEnabled ? 'Active' : 'Off';
    elDueStatus.style.background = S.srsEnabled ? 'rgba(239,68,68,0.1)' : 'rgba(156,163,175,0.1)';
    elDueStatus.style.color = S.srsEnabled ? '#f87171' : '#9ca3af';
  }

  const elLvl = document.getElementById('dashboard-lvl-display');
  if (elLvl) {
    elLvl.textContent = `L${level}`;
  }

  const elXpSub = document.getElementById('dashboard-xp-sub');
  if (elXpSub) {
    elXpSub.textContent = `${totalXP} XP total`;
  }

  const elXpNeeded = document.getElementById('dashboard-xp-needed');
  if (elXpNeeded) {
    elXpNeeded.textContent = `${xpNeeded - xpInLevel} XP to next level`;
  }

  const elXpBar = document.getElementById('dashboard-xp-progress-bar');
  if (elXpBar) {
    const pct = Math.min(100, Math.round((xpInLevel / xpNeeded) * 100));
    elXpBar.style.width = `${pct}%`;
  }

  const elReviewedGoal = document.getElementById('dashboard-reviewed-goal');
  if (elReviewedGoal) {
    elReviewedGoal.textContent = `${todayReviews} / 20`;
  }

  const elGoalBar = document.getElementById('dashboard-goal-progress-bar');
  if (elGoalBar) {
    const pct = Math.min(100, Math.round((todayReviews / 20) * 100));
    elGoalBar.style.width = `${pct}%`;
  }

  // Populate Continual Studying / Recent Decks grid
  const recentDecksContainer = document.getElementById('dashboard-recent-decks');
  if (recentDecksContainer) {
    if (decksCount === 0) {
      recentDecksContainer.innerHTML = `
        <div style="grid-column: 1 / -1; background:var(--surface2); border:1px dashed var(--border); padding:24px; text-align:center; border-radius:var(--rs); color:var(--text3); font-size:13px;">
          No decks created yet. Get started by opening the <a href="#" onclick="showPanel('library', null); return false;" style="color:var(--accent); font-weight:600; text-decoration:underline;">Deck Library</a> to create your first deck!
        </div>
      `;
    } else {
      // Sort decks by modification/creation date to get recent ones
      const sorted = Object.entries(S.decks).map(([id, d]: [string, any]) => {
        const dDue = S.srsEnabled ? d.cards.filter((c: any) => c.due <= midnight).length : 0;
        return { id, ...d, dueCount: dDue };
      }).sort((a, b) => {
        const tA = a.modified || a.created || 0;
        const tB = b.modified || b.created || 0;
        return tB - tA;
      }).slice(0, 3); // top 3 recently active decks

      recentDecksContainer.innerHTML = sorted.map(d => {
        const color = d.color || '#a8ff78';
        const dBadge = d.dueCount > 0 ? `<span style="background:rgba(234,179,8,0.12); color:#ffd700; font-size:11px; font-weight:700; padding:1px 6px; border-radius:6px;">${d.dueCount} due</span>` : '';
        return `
          <div style="background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--rs); padding:16px; position:relative; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer;"
               onclick="selectDeck('${d.id}')"
               onmouseover="this.style.borderColor='var(--accent)'"
               onmouseout="this.style.borderColor='var(--border)'">
            
            <div style="position:absolute; top:0; left:12px; right:12px; height:3px; background:${color}; border-radius:0 0 2px 2px;"></div>
            
            <div style="margin-bottom:12px; margin-top:4px;">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                <h4 style="margin:0; font-family:'Space Grotesk', sans-serif; font-size:14px; font-weight:700; color:var(--text);">${escH(d.name)}</h4>
                ${dBadge}
              </div>
              <div style="font-size:11px; color:var(--text3); margin-top:4px;">${d.cards.length} cards total</div>
            </div>

            <div style="display:flex; gap:6px;" onclick="event.stopPropagation()">
              <button class="btn btn-b" onclick="selectDeck('${d.id}'); showPanel('manage', null);" style="flex:1; font-size:11px; padding:4px 0; justify-content:center; height:28px;">Edit</button>
              <button class="btn btn-g" onclick="selectDeck('${d.id}')" style="flex:1; font-size:11px; padding:4px 0; justify-content:center; height:28px;">▶ Study</button>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}


// ─── ES module exports (auto-generated) ───
export { _activeFolderPicker, _createPopoverOpen, _createTab, _updateSelectBar, addDeck, addFolder, cancelRename, closeCreatePopover, closeFolderPicker, closeFolderPickerOutside, closeSidebar, commitFolderRename, commitRename, cpopAddDeck, cpopAddFolder, deckSelectAll, deckSelectDelete, deckSelectNone, delDeck, delFolder, handleFolderRenameKey, handleRenameKey, loadQueue, moveDeckToFolder, moveSelectedToFolder, openCreatePopover, openFolderPicker, renderSidebar, renderTagFilterChips, renderWelcomeDashboard, selectDeck, setTagFilter, showPanel, startFolderRename, startRename, studyAllTag, switchCreateTab, toggleCreatePopover, toggleDeckCheck, toggleDeckSelectMode, toggleDesktopSidebar, toggleFolder, toggleSRS, toggleSelFolderPicker, toggleSidebar, toggleSidebarBottom, updateDueBadge, updateSRSButton, updateStats };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { _updateSelectBar, addDeck, addFolder, cancelRename, closeCreatePopover, closeFolderPicker, closeFolderPickerOutside, closeSidebar, commitFolderRename, commitRename, cpopAddDeck, cpopAddFolder, deckSelectAll, deckSelectDelete, deckSelectNone, delDeck, delFolder, handleFolderRenameKey, handleRenameKey, loadQueue, moveDeckToFolder, moveSelectedToFolder, openCreatePopover, openFolderPicker, renderSidebar, renderTagFilterChips, renderWelcomeDashboard, selectDeck, setTagFilter, showPanel, startFolderRename, startRename, studyAllTag, switchCreateTab, toggleCreatePopover, toggleDeckCheck, toggleDeckSelectMode, toggleDesktopSidebar, toggleFolder, toggleSRS, toggleSelFolderPicker, toggleSidebar, toggleSidebarBottom, updateDueBadge, updateSRSButton, updateStats });
