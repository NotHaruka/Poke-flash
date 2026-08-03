import { populateDeckSelector } from './chat.js';
import { StudySession, renderCardsList } from './deck-manager.js';
import { app } from './firebase.js';
import { syncCreateDeck, syncDeleteDeck, syncMoveDeckToFolder, syncRenameDeck } from './firebase-sync.js';
import { destroyPhaserGame, initGame, pauseGame } from './game.js';
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
  document.body.classList.remove('sidebar-open');
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
  
  if (!isOpen) {
    document.body.classList.add('sidebar-open');
  } else {
    document.body.classList.remove('sidebar-open');
  }
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
  // Exit any running mini-game and pause Phaser game loop if navigating away from game views
  if (name !== 'game' && name !== 'rhythm-game' && name !== 'void-survivor') {
    try {
      const reg = (window as any).GameRegistry?.getInstance?.();
      if (reg && reg.getActiveGameId()) {
        reg.exitActiveGame().catch(() => {});
      }
      if (typeof (window as any).pauseGame === 'function') {
        (window as any).pauseGame();
      }
    } catch (e) {}
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
  if (name === 'home') {
    renderWelcomeDashboard();
  }
  if (name === 'study') {
    updateStudyDeckPickerOptions();
    if (S.examActive) {
      if (typeof (window as any).examStartTimer === 'function') {
        (window as any).examStartTimer();
      }
    } else if (S.studyId === null) {
      const noDeck = document.getElementById('no-deck');
      if (noDeck) {
        noDeck.style.display = 'block';
        renderNoDeckView();
      }
      const studyBody = document.getElementById('study-body');
      if (studyBody) studyBody.style.display = 'none';
    } else {
      const noDeck = document.getElementById('no-deck');
      if (noDeck) noDeck.style.display = 'none';
      const studyBody = document.getElementById('study-body');
      if (studyBody) studyBody.style.display = 'block';
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



  // Initialize or pause/destroy the custom Blade Bedlam game on panel transitions
  if (name === 'game') {
    document.body.classList.add('game-panel-active');
    const registry = (window as any).GameRegistry?.getInstance?.();
    const activeId = registry?.getActiveGameId?.();
    if (!activeId || activeId === 'blade_bedlam') {
      initGame();
    }
  } else {
    document.body.classList.remove('game-panel-active');
    const registry = (window as any).GameRegistry?.getInstance?.();
    const activeId = registry?.getActiveGameId?.();
    if (activeId === 'blade_bedlam') {
      destroyPhaserGame();
    } else {
      pauseGame();
    }
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
      if (noDeck)    { noDeck.style.display    = 'block'; renderNoDeckView(); }
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
  const inp  = document.getElementById('cpop-deck-inp') as HTMLInputElement;
  const name = inp?.value.trim();
  const dateInp = document.getElementById('cpop-deck-date') as HTMLInputElement;
  const scheduledDate = dateInp?.value ? dateInp.value.trim() : '';
  if (!name) {
    inp?.classList.remove('shake');
    inp?.offsetWidth; // reflow
    inp?.classList.add('shake');
    inp?.addEventListener('animationend', () => inp?.classList.remove('shake'), { once: true });
    inp?.focus(); return;
  }
  const id = uid();
  S.decks[id] = { name, cards: [], ai: false, scheduledDate };
  if (inp) inp.value = '';
  if (dateInp) dateInp.value = '';
  persist(); renderSidebar(); updateStats();
  selectDeck(id);
  closeCreatePopover();
  toast(scheduledDate ? `"${name}" scheduled for ${scheduledDate}!` : `"${name}" created!`);
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
    renderNoDeckView();
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

function updateStudyDeckPickerOptions() {
  const picker = document.getElementById('study-deck-picker') as HTMLSelectElement | null;
  const label = document.getElementById('study-deck-picker-label');
  const popover = document.getElementById('study-deck-popover-menu');

  const deckEntries = Object.entries(S.decks || {});
  const midnight = getLocalMidnightTonight();

  let totalDueAll = 0;
  deckEntries.forEach(([_id, d]: [string, any]) => {
    const dueCount = S.srsEnabled ? (d.cards?.filter((c: any) => c.due <= midnight).length || 0) : 0;
    totalDueAll += dueCount;
  });

  // 1. Update <select> element options
  if (picker) {
    let selectHtml = `<option value="" disabled ${!S.studyId ? 'selected' : ''}>▾ Switch Deck...</option>`;
    if (totalDueAll > 0) {
      const isDueSelected = S.studyId === '__cross_deck__';
      selectHtml += `<option value="__all_due__" ${isDueSelected ? 'selected' : ''}>⚡ All Due Cards (${totalDueAll})</option>`;
    }
    deckEntries.forEach(([id, d]: [string, any]) => {
      const cardCount = d.cards?.length || 0;
      const dueCount = S.srsEnabled ? (d.cards?.filter((c: any) => c.due <= midnight).length || 0) : 0;
      const isSelected = S.studyId === id;
      const dueTxt = dueCount > 0 ? ` · ${dueCount} due` : '';
      selectHtml += `<option value="${id}" ${isSelected ? 'selected' : ''}>📖 ${escH(d.name)} (${cardCount} card${cardCount !== 1 ? 's' : ''}${dueTxt})</option>`;
    });
    picker.innerHTML = selectHtml;
  }

  // 2. Update trigger button label
  if (label) {
    if (S.studyId === '__cross_deck__') {
      label.innerHTML = `⚡ All Due Cards (${totalDueAll})`;
    } else if (S.studyId && S.decks[S.studyId]) {
      const curDeck = S.decks[S.studyId];
      const dueCount = S.srsEnabled ? (curDeck.cards?.filter((c: any) => c.due <= midnight).length || 0) : 0;
      const dueBadge = dueCount > 0 ? `<span style="background:rgba(239,68,68,0.18); color:#f87171; font-size:10px; font-weight:800; padding:1px 6px; border-radius:10px; margin-left:4px;">${dueCount} due</span>` : '';
      label.innerHTML = `<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${curDeck.color || 'var(--accent)'}; margin-right:6px; vertical-align:middle;"></span><span style="max-width:140px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; display:inline-block; vertical-align:middle;">${escH(curDeck.name)}</span>${dueBadge}`;
    } else {
      label.innerHTML = `📖 Select a Deck...`;
    }
  }

  // 3. Update Popover Dropdown Items
  if (popover) {
    let popoverHtml = '';

    if (totalDueAll > 0) {
      const isDueSelected = S.studyId === '__cross_deck__';
      popoverHtml += `
        <div class="study-deck-popover-item ${isDueSelected ? 'active' : ''}"
             onclick="window.onStudyDeckPickerChange('__all_due__'); window.closeStudyDeckPopover();"
             style="border-bottom:1px solid var(--border); padding-bottom:8px; margin-bottom:4px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:13px;">⚡</span>
            <span style="font-weight:700;">All Due Cards</span>
          </div>
          <span style="background:rgba(239,68,68,0.15); color:#f87171; font-size:10px; font-weight:800; padding:2px 8px; border-radius:12px;">${totalDueAll} due</span>
        </div>
      `;
    }

    if (deckEntries.length === 0) {
      popoverHtml += `<div style="padding:12px; text-align:center; font-size:12px; color:var(--text3);">No decks available</div>`;
    } else {
      deckEntries.forEach(([id, d]: [string, any]) => {
        const cardCount = d.cards?.length || 0;
        const dueCount = S.srsEnabled ? (d.cards?.filter((c: any) => c.due <= midnight).length || 0) : 0;
        const isSelected = S.studyId === id;
        const color = d.color || 'var(--accent)';

        popoverHtml += `
          <div class="study-deck-popover-item ${isSelected ? 'active' : ''}"
               onclick="window.onStudyDeckPickerChange('${id}'); window.closeStudyDeckPopover();">
            <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
              <span style="width:7px; height:7px; border-radius:50%; background:${color}; flex-shrink:0;"></span>
              <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:180px;">${escH(d.name)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
              ${dueCount > 0 ? `<span style="background:rgba(239,68,68,0.15); color:#f87171; font-size:10px; font-weight:800; padding:2px 6px; border-radius:6px;">${dueCount} due</span>` : `<span style="font-size:11px; color:var(--text3); font-weight:500;">${cardCount}</span>`}
              ${isSelected ? `<span style="color:var(--accent); font-weight:800; font-size:12px;">✓</span>` : ''}
            </div>
          </div>
        `;
      });
    }

    popover.innerHTML = popoverHtml;
  }
}

function toggleStudyDeckPopover(e?: Event) {
  if (e) e.stopPropagation();
  const popover = document.getElementById('study-deck-popover-menu');
  const btn = document.getElementById('study-deck-picker-btn');
  if (!popover || !btn) return;

  const isOpen = popover.classList.contains('open');
  if (isOpen) {
    closeStudyDeckPopover();
  } else {
    updateStudyDeckPickerOptions();
    popover.classList.add('open');
    btn.classList.add('open');
  }
}

function closeStudyDeckPopover() {
  const popover = document.getElementById('study-deck-popover-menu');
  const btn = document.getElementById('study-deck-picker-btn');
  if (popover) popover.classList.remove('open');
  if (btn) btn.classList.remove('open');
}

// Click outside popover listener
if (typeof document !== 'undefined') {
  document.addEventListener('click', (event) => {
    const wrap = document.getElementById('study-deck-picker-wrap');
    if (wrap && !wrap.contains(event.target as Node)) {
      closeStudyDeckPopover();
    }
  });
}

function onStudyDeckPickerChange(val: string) {
  if (val === '__all_due__') {
    if (typeof (window as any).studyAllDueCards === 'function') {
      (window as any).studyAllDueCards();
    }
  } else if (val && S.decks[val]) {
    selectDeck(val);
  }
  updateStudyDeckPickerOptions();

  // Add subtle pulse animation on selection
  const title = document.getElementById('study-title');
  const btn = document.getElementById('study-deck-picker-btn');
  if (title) {
    title.classList.remove('deck-switch-pulse');
    void title.offsetWidth;
    title.classList.add('deck-switch-pulse');
  }
  if (btn) {
    btn.classList.remove('deck-switch-pulse');
    void btn.offsetWidth;
    btn.classList.add('deck-switch-pulse');
  }
}

function openDeckQuickPickerModal() {
  const modal = document.getElementById('quick-deck-picker-modal');
  if (!modal) return;
  renderQuickDeckPickerModalList();
  modal.style.display = 'flex';
}

function closeQuickDeckPickerModal() {
  const modal = document.getElementById('quick-deck-picker-modal');
  if (modal) modal.style.display = 'none';
}

function renderQuickDeckPickerModalList() {
  const container = document.getElementById('quick-deck-modal-list');
  if (!container) return;

  const deckEntries = Object.entries(S.decks || {});
  if (deckEntries.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1; padding:24px; text-align:center; color:var(--text3); font-size:13px;">
        No decks available yet. Create one in the Deck Library!
      </div>
    `;
    return;
  }

  const midnight = getLocalMidnightTonight();

  container.innerHTML = deckEntries.map(([id, d]: [string, any]) => {
    const cardCount = d.cards?.length || 0;
    const dueCount = S.srsEnabled ? (d.cards?.filter((c: any) => c.due <= midnight).length || 0) : 0;
    const isCurrent = S.studyId === id;
    const color = d.color || '#3D7A5F';

    return `
      <div style="background:var(--surface2); border:1.5px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}; border-radius:var(--rs); padding:14px; display:flex; flex-direction:column; justify-content:space-between; position:relative; cursor:pointer; transition:all 0.15s ease;"
           onclick="selectDeck('${id}'); closeQuickDeckPickerModal();"
           onmouseover="this.style.borderColor='var(--accent)'"
           onmouseout="this.style.borderColor='${isCurrent ? 'var(--accent)' : 'var(--border)'}'">
        <div style="position:absolute; top:0; left:10px; right:10px; height:3px; background:${color}; border-radius:0 0 2px 2px;"></div>
        <div style="margin-top:4px;">
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:6px;">
            <div style="font-weight:700; font-size:14px; color:var(--text); word-break:break-word;">${escH(d.name)}</div>
            ${dueCount > 0 ? `<span style="background:rgba(239,68,68,0.12); color:#f87171; font-size:10px; font-weight:800; padding:2px 6px; border-radius:6px; flex-shrink:0;">${dueCount} due</span>` : ''}
          </div>
          <div style="font-size:12px; color:var(--text3); margin-top:4px; margin-bottom:12px;">${cardCount} card${cardCount !== 1 ? 's' : ''}</div>
        </div>
        <button class="btn ${isCurrent ? 'btn-b' : 'btn-g'}" onclick="event.stopPropagation(); selectDeck('${id}'); closeQuickDeckPickerModal();" style="font-size:11px; height:30px; width:100%; justify-content:center; font-weight:700;">
          ${isCurrent ? '✓ Currently Studying' : '▶ Study Deck'}
        </button>
      </div>
    `;
  }).join('');
}

function selectDeck(id) {
  S.selDeck   = id;
  S.activeTag = null;
  renderSidebar();
  S.studyId = id;
  const d = S.decks[id];
  if (d) {
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
  }
  updateStudyDeckPickerOptions();
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

function renderNoDeckView() {
  const container = document.getElementById('no-deck');
  if (!container) return;

  const deckEntries = Object.entries(S.decks || {});
  if (deckEntries.length === 0) {
    container.innerHTML = `
      <div style="padding:48px 24px; text-align:center; max-width:480px; margin:0 auto; display:flex; flex-direction:column; align-items:center; gap:16px;">
        <div style="width:64px; height:64px; border-radius:16px; background:var(--surface2); border:1.5px solid var(--border); display:flex; align-items:center; justify-content:center; color:var(--text3);">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:32px;height:32px"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5v-15z"/></svg>
        </div>
        <div>
          <h2 style="font-family:var(--font-serif); font-size:22px; font-weight:700; margin:0 0 8px 0; color:var(--text);">No Decks Available</h2>
          <p style="font-size:13px; color:var(--text3); margin:0; line-height:1.5;">You haven't created any flashcard decks yet. Create or import your first deck to start studying!</p>
        </div>
        <div style="display:flex; gap:12px; margin-top:8px;">
          <button class="btn btn-g" onclick="showPanel('library', null)" style="font-weight:700; padding:10px 20px;">📂 Open Deck Library</button>
          <button class="btn btn-b" onclick="showPanel('home', null)" style="font-weight:600; padding:10px 16px;">🏠 Go to Home</button>
        </div>
      </div>
    `;
    return;
  }

  const midnight = getLocalMidnightTonight();

  container.innerHTML = `
    <div style="padding:16px 0; max-width:900px; margin:0 auto; display:flex; flex-direction:column; gap:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--rs); padding:20px;">
        <div>
          <h2 style="font-family:var(--font-serif); font-size:20px; font-weight:700; margin:0; color:var(--text);">Select a Deck to Study</h2>
          <p style="font-size:12px; color:var(--text3); margin:4px 0 0 0;">Choose one of your active decks below to launch your active recall study session.</p>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-b" onclick="showPanel('home', null)" style="font-size:12px; padding:6px 12px;">🏠 Home</button>
          <button class="btn btn-b" onclick="showPanel('library', null)" style="font-size:12px; padding:6px 12px;">📚 Library →</button>
        </div>
      </div>

      <div>
        <h3 style="font-family:'Space Grotesk', sans-serif; font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; color:var(--text3); margin:0 0 12px 0;">Available Decks (${deckEntries.length})</h3>
        <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(min(100%, 250px), 1fr)); gap:14px;">
          ${deckEntries.map(([id, d]: [string, any]) => {
            const cardCount = d.cards?.length || 0;
            const dueCount = S.srsEnabled ? (d.cards?.filter((c: any) => c.due <= midnight).length || 0) : 0;
            const color = d.color || '#3D7A5F';
            return `
              <div style="background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--rs); padding:16px; display:flex; flex-direction:column; justify-content:space-between; position:relative; cursor:pointer;"
                   onclick="selectDeck('${id}')"
                   onmouseover="this.style.borderColor='var(--accent)'"
                   onmouseout="this.style.borderColor='var(--border)'">
                <div style="position:absolute; top:0; left:12px; right:12px; height:3px; background:${color}; border-radius:0 0 2px 2px;"></div>
                <div style="margin-top:6px; margin-bottom:12px;">
                  <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
                    <h4 style="margin:0; font-family:'Space Grotesk', sans-serif; font-size:15px; font-weight:700; color:var(--text);">${escH(d.name)}</h4>
                    ${dueCount > 0 ? `<span style="background:rgba(239,68,68,0.12); color:#f87171; font-size:10px; font-weight:800; padding:2px 6px; border-radius:6px;">${dueCount} due</span>` : ''}
                  </div>
                  <div style="font-size:12px; color:var(--text3); margin-top:6px;">${cardCount} card${cardCount !== 1 ? 's' : ''}</div>
                </div>
                <button class="btn btn-g" onclick="selectDeck('${id}')" style="width:100%; justify-content:center; font-size:12px; height:32px; font-weight:700;">▶ Study Deck</button>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
}

async function renderWelcomeDashboard() {
  const container = document.getElementById('scholar-dashboard-container') || document.getElementById('panel-home');
  if (!container) return;

  // Fetch stats telemetry
  let localActivity: any = {};
  let rawActivity: any = {};
  let streak = 0;
  let totalXP = 0;
  let todayReviews = 0;
  let todayCorrect = 0;
  let todayIncorrect = 0;
  let todaySkipped = 0;
  let todayTimeSpent = 0;
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
      rawActivity = await (window as any).getActivityData() || {};
      const todayString = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local format
      
      if (localActivity) {
        todayReviews = Number(localActivity[todayString] || 0);
      }
      
      const tz = (window as any).getUserTimeZone ? (window as any).getUserTimeZone() : 'UTC';
      for (const [timestamp, stats] of Object.entries(rawActivity)) {
        let dayKey = timestamp.slice(0, 10);
        if (typeof (window as any).getLocalDayString === 'function') {
          dayKey = (window as any).getLocalDayString(timestamp, tz);
        }

        if (dayKey === todayString) {
          if (typeof stats === 'number') {
            todayCorrect += stats;
            todayTimeSpent += stats * 4;
          } else if (stats && typeof stats === 'object') {
            todayCorrect += Number((stats as any).correct || 0);
            todayIncorrect += Number((stats as any).incorrect || 0);
            todaySkipped += Number((stats as any).skipped || 0);
            todayTimeSpent += Number((stats as any).timeSpentSecs || 0);
          }
        }

        if (typeof stats === 'number') {
          totalXP += stats * 10;
        } else if (stats && typeof stats === 'object') {
          totalXP += (Number((stats as any).correct || 0) * 10) + (Number((stats as any).incorrect || 0) * 2);
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

  // Render Redesigned Today's Progress Bento Card
  const progressCard = document.getElementById('dashboard-todays-progress-card');
  if (progressCard) {
    const targetPct = Math.min(100, Math.round((todayReviews / 20) * 100));
    const todayTotalAnswered = todayCorrect + todayIncorrect;
    const todayAccuracy = todayTotalAnswered > 0 ? Math.round((todayCorrect / todayTotalAnswered) * 100) : 0;
    
    let todayTimeStr = '0s';
    if (todayTimeSpent > 0) {
      const mins = Math.floor(todayTimeSpent / 60);
      const secs = todayTimeSpent % 60;
      todayTimeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }

    const levelHtml = `
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:32px; height:32px; border-radius:50%; background:var(--accent-dim); border:1.5px solid var(--accent); display:flex; align-items:center; justify-content:center; font-family:var(--font-mono); font-weight:800; color:var(--accent); font-size:12px;">L${level}</div>
        <div>
          <div style="font-size:12px; font-weight:700; color:var(--text);">${totalXP} XP</div>
          <div style="font-size:10px; color:var(--text3);">${xpNeeded - xpInLevel} XP to L${level+1}</div>
        </div>
      </div>
    `;

    progressCard.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:20px; width:100%;">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; font-weight:700; color:var(--text3); text-transform:uppercase; letter-spacing:0.05em;">Today's Study Progress</span>
          <span style="font-size:11px; font-family:var(--font-serif); font-style:italic; color:var(--text3);">${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
        </div>

        <div style="display:flex; gap:16px; align-items:center;">
          <div style="position:relative; width:52px; height:52px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <svg width="52" height="52" viewBox="0 0 36 36" style="transform: rotate(-90deg);">
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--border)" stroke-width="2.5" />
              <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="var(--accent)" stroke-width="3.5" stroke-dasharray="${targetPct}, 100" stroke-linecap="round" />
            </svg>
            <div style="position:absolute; font-family:var(--font-serif); font-weight:700; font-size:13px; color:var(--text);">${todayReviews}</div>
          </div>
          <div style="flex:1;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:14px; font-weight:700; color:var(--text);">${todayReviews} / 20 reviewed</span>
              <span style="font-size:12px; font-weight:700; color:var(--accent);">${targetPct}%</span>
            </div>
            <div style="font-size:11px; color:var(--text3); margin-top:2px;">Target review volume to retain cards.</div>
          </div>
        </div>

        <!-- Metric breakdown row with vertical divider (no nested cards!) -->
        <div style="display:grid; grid-template-columns:1fr 1px 1fr; align-items:center; gap:12px; border-top:1px solid var(--border); border-bottom:1px solid var(--border); padding:14px 0;">
          <div style="text-align:center;">
            <div style="font-size:10px; color:var(--text3); text-transform:uppercase; font-weight:700; letter-spacing:0.04em;">XP Gained</div>
            <div style="font-size:18px; font-weight:800; color:var(--accent); margin-top:4px; display:flex; align-items:center; justify-content:center; gap:4px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;color:var(--accent);"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3.5z"/></svg>
              <span>+${todayCorrect * 10 + todayIncorrect * 2}</span>
            </div>
          </div>
          <div style="background:var(--border); width:1px; height:24px; margin: 0 auto;"></div>
          <div style="text-align:center;">
            <div style="font-size:10px; color:var(--text3); text-transform:uppercase; font-weight:700; letter-spacing:0.04em;">Study Time</div>
            <div style="font-size:18px; font-weight:800; color:var(--text); margin-top:4px; display:flex; align-items:center; justify-content:center; gap:4px;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;color:var(--text3);"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              <span>${todayTimeStr}</span>
            </div>
          </div>
        </div>

        <!-- Accuracy meter -->
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <span style="font-size:10px; color:var(--text3); text-transform:uppercase; font-weight:700; letter-spacing:0.04em;">Recall Accuracy</span>
            <span style="font-size:12px; font-weight:800; color:${todayAccuracy >= 85 ? 'var(--sage)' : (todayAccuracy >= 65 ? 'var(--yellow)' : 'var(--red)')};">${todayTotalAnswered > 0 ? todayAccuracy + '%' : 'N/A'}</span>
          </div>
          ${todayTotalAnswered > 0 ? `
            <div style="background:var(--border); height:6px; border-radius:3px; overflow:hidden;">
              <div style="background:${todayAccuracy >= 85 ? 'var(--sage)' : (todayAccuracy >= 65 ? 'var(--yellow)' : 'var(--red)')}; width:${todayAccuracy}%; height:100%; border-radius:3px;"></div>
            </div>
          ` : `
            <div style="font-size:11px; color:var(--text3); font-style:italic;">No responses logged yet today.</div>
          `}
        </div>
      </div>
      
      <div style="border-top:1px solid var(--border); padding-top:14px; margin-top:6px; display:flex; justify-content:space-between; align-items:center; width:100%;">
        ${levelHtml}
      </div>
    `;
  }

  // Render Redesigned Recent Activity Feed
  const recentActivityContainer = document.getElementById('dashboard-recent-activity');
  if (recentActivityContainer) {
    const activities = Object.entries(rawActivity).map(([timestamp, val]: [string, any]) => {
      return { timestamp, ...val };
    }).sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 4);

    if (activities.length === 0) {
      recentActivityContainer.innerHTML = `
        <div style="text-align:center; padding:16px; color:var(--text3); font-size:12px; font-style:italic;">
          No recent study activity logged yet. Select a deck to begin your learning journey!
        </div>
      `;
    } else {
      const getRelativeTimeString = (isoString: string): string => {
        const ms = Date.now() - new Date(isoString).getTime();
        const secs = Math.floor(ms / 1000);
        if (secs < 60) return 'Just now';
        const mins = Math.floor(secs / 60);
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days === 1) return 'Yesterday';
        return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      };

      recentActivityContainer.innerHTML = activities.map(act => {
        const deckName = S.decks[act.deckId]?.name || 'Practice Session';
        const correct = Number(act.correct || 0);
        const incorrect = Number(act.incorrect || 0);
        const skipped = Number(act.skipped || 0);
        const total = correct + incorrect + skipped;
        const xp = (correct * 10) + (incorrect * 2);
        const acc = total > 0 ? Math.round((correct / (correct + incorrect)) * 100) : 100;
        const relativeTime = getRelativeTimeString(act.timestamp);

        let dotColor = 'var(--sage)';
        if (acc < 60) dotColor = 'var(--red)';
        else if (acc < 85) dotColor = 'var(--yellow)';

        return `
          <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; font-size:12px;">
            <div style="display:flex; gap:10px; align-items:start;">
              <div style="margin-top:4px; width:8px; height:8px; border-radius:50%; background:${dotColor}; flex-shrink:0; box-shadow:0 0 0 3px var(--surface3);"></div>
              <div>
                <div style="font-weight:700; color:var(--text);">${escH(deckName)}</div>
                <div style="color:var(--text3); font-size:11px; margin-top:2px;">Reviewed ${total} card${total !== 1 ? 's' : ''} · ${correct} correct, ${incorrect} wrong · <span style="color:var(--accent); font-weight:600;">+${xp} XP</span></div>
              </div>
            </div>
            <div style="color:var(--text3); font-size:11px; font-family:var(--font-mono); white-space:nowrap;">${relativeTime}</div>
          </div>
        `;
      }).join('');
    }
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
        const color = d.color || '#3D7A5F';
        const dBadge = d.dueCount > 0 ? `<span style="background:rgba(234,179,8,0.12); color:#ffd700; font-size:11px; font-weight:700; padding:1px 6px; border-radius:6px;">${d.dueCount} due</span>` : '';
        const isFoil = d.cards && d.cards.some((c: any) => (c.interval || 0) > 30);
        const foilClass = isFoil ? ' foil-card' : '';
        return `
          <div class="dashboard-bento-card${foilClass}" style="background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--rs); padding:16px; position:relative; display:flex; flex-direction:column; justify-content:space-between; cursor:pointer;"
               onclick="selectDeck('${d.id}')"
               onmouseover="if(!this.classList.contains('foil-card')) this.style.borderColor='var(--accent)'"
               onmouseout="if(!this.classList.contains('foil-card')) this.style.borderColor='var(--border)'">
            
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

  // Render Scheduled & Future Decks
  const schedContainer = document.getElementById('dashboard-scheduled-decks');
  if (schedContainer) {
    const scheduledDecks = Object.entries(S.decks)
      .map(([id, d]: [string, any]) => ({ id, ...d }))
      .filter((d: any) => d.scheduledDate);

    if (scheduledDecks.length > 0) {
      schedContainer.innerHTML = `
        <div style="background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--rs); padding:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
            <div style="font-size:14px; font-weight:700; color:var(--text); display:flex; align-items:center; gap:6px;">
              <span>📅 Scheduled Future Decks</span>
              <span style="font-size:11px; font-weight:700; background:var(--accent-dim); color:var(--accent); padding:2px 8px; border-radius:12px;">${scheduledDecks.length}</span>
            </div>
            <button class="btn btn-b" onclick="showPanel('library', null)" style="font-size:11px; padding:4px 10px;">Manage All →</button>
          </div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(min(100%, 200px), 1fr)); gap:10px;">
            ${scheduledDecks.map((d: any) => {
              const isToday = d.scheduledDate <= new Date().toISOString().split('T')[0];
              const dateTagColor = isToday ? 'var(--red)' : 'var(--accent)';
              const dateTagBg = isToday ? 'rgba(239,68,68,0.12)' : 'var(--accent-dim)';
              return `
                <div style="background:var(--bg); border:1px solid var(--border); border-radius:8px; padding:12px; display:flex; flex-direction:column; justify-content:space-between; gap:8px;">
                  <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                      <span style="font-size:10px; font-weight:700; color:${dateTagColor}; background:${dateTagBg}; padding:2px 6px; border-radius:4px;">
                        ${isToday ? '🔔 DUE TODAY' : 'Scheduled: ' + d.scheduledDate}
                      </span>
                      <span style="font-size:11px; color:var(--text3);">${d.cards?.length || 0} cards</span>
                    </div>
                    <div style="font-size:13px; font-weight:700; color:var(--text);">${escH(d.name)}</div>
                  </div>
                  <button class="btn btn-g" onclick="selectDeck('${d.id}')" style="width:100%; font-size:11px; height:28px; justify-content:center;">▶ Study Deck</button>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else {
      schedContainer.innerHTML = '';
    }
  }
}


// ─── ES module exports (auto-generated) ───
export { _activeFolderPicker, _createPopoverOpen, _createTab, _updateSelectBar, addDeck, addFolder, cancelRename, closeCreatePopover, closeFolderPicker, closeFolderPickerOutside, closeQuickDeckPickerModal, closeSidebar, closeStudyDeckPopover, commitFolderRename, commitRename, cpopAddDeck, cpopAddFolder, deckSelectAll, deckSelectDelete, deckSelectNone, delDeck, delFolder, handleFolderRenameKey, handleRenameKey, loadQueue, moveDeckToFolder, moveSelectedToFolder, onStudyDeckPickerChange, openCreatePopover, openDeckQuickPickerModal, openFolderPicker, renderNoDeckView, renderQuickDeckPickerModalList, renderSidebar, renderTagFilterChips, renderWelcomeDashboard, selectDeck, setTagFilter, showPanel, startFolderRename, startRename, studyAllTag, switchCreateTab, toggleCreatePopover, toggleDeckCheck, toggleDeckSelectMode, toggleDesktopSidebar, toggleFolder, toggleSRS, toggleSelFolderPicker, toggleSidebar, toggleSidebarBottom, toggleStudyDeckPopover, updateDueBadge, updateSRSButton, updateStats, updateStudyDeckPickerOptions };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { _updateSelectBar, addDeck, addFolder, cancelRename, closeCreatePopover, closeFolderPicker, closeFolderPickerOutside, closeQuickDeckPickerModal, closeSidebar, closeStudyDeckPopover, commitFolderRename, commitRename, cpopAddDeck, cpopAddFolder, deckSelectAll, deckSelectDelete, deckSelectNone, delDeck, delFolder, handleFolderRenameKey, handleRenameKey, loadQueue, moveDeckToFolder, moveSelectedToFolder, onStudyDeckPickerChange, openCreatePopover, openDeckQuickPickerModal, openFolderPicker, renderNoDeckView, renderQuickDeckPickerModalList, renderSidebar, renderTagFilterChips, renderWelcomeDashboard, selectDeck, setTagFilter, showPanel, startFolderRename, startRename, studyAllTag, switchCreateTab, toggleCreatePopover, toggleDeckCheck, toggleDeckSelectMode, toggleDesktopSidebar, toggleFolder, toggleSRS, toggleSelFolderPicker, toggleSidebar, toggleSidebarBottom, toggleStudyDeckPopover, updateDueBadge, updateSRSButton, updateStats, updateStudyDeckPickerOptions });

function goHome() {
  const navHome = document.getElementById('nav-home');
  showPanel('home', navHome);
}

Object.assign(window, { goHome });
