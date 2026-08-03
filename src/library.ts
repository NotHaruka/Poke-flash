import { syncCreateDeck, syncDeleteDeck, syncMoveDeckToFolder, syncRenameDeck } from './firebase-sync.js';
import { S } from './main.js';
import { loadQueue, renderSidebar, selectDeck, showPanel } from './sidebar.js';
import { persist } from './storage.js';
import { escH, getLocalMidnightTonight, showCustomConfirm, showCustomPrompt, toast, uid } from './utils.js';




// Local temporary state for the library view
let activeLibFilter: 'all' | 'srs' | 'fav' | 'ai' = 'all';

// Initialize and bind library event listeners
function initLibrary(): void {
  // Bind search input listener
  const searchInp = document.getElementById('library-search-input');
  if (searchInp) {
    searchInp.addEventListener('input', () => {
      renderLibrary();
    });
  }

  // Define a .value getter/setter on our custom sorting dropdown element
  const sortSel = document.getElementById('library-sort-select');
  if (sortSel && !('value' in sortSel)) {
    Object.defineProperty(sortSel, 'value', {
      get() { return this.dataset.value || 'recent'; },
      set(val) {
        this.dataset.value = val;
        // update display text if set programmatically
        const option = document.querySelector(`#library-sort-select-options .option[onclick*="${val}"]`);
        if (option) {
          this.textContent = option.textContent;
        }
      },
      configurable: true
    });
  }

  // Setup global drag-and-drop events on document to show notice
  document.addEventListener('dragstart', (e: DragEvent) => {
    if (e.target instanceof HTMLElement && e.target.classList.contains('lib-deck-card')) {
      e.dataTransfer?.setData('text/plain', e.target.dataset.deckId || '');
      const notice = document.getElementById('drag-folder-notice');
      if (notice) notice.style.display = 'block';
    }
  });

  document.addEventListener('dragend', () => {
    const notice = document.getElementById('drag-folder-notice');
    if (notice) notice.style.display = 'none';
  });
}

// Toggle functions for creation boxes
function toggleLibraryCreateDeckForm(): void {
  const box = document.getElementById('library-create-deck-box');
  if (!box) return;
  const isHidden = box.style.display === 'none';
  box.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const inp = document.getElementById('library-new-deck-name') as HTMLInputElement;
    inp?.focus();
  }
}

function toggleLibraryCreateFolderForm(): void {
  const box = document.getElementById('library-create-folder-box');
  if (!box) return;
  const isHidden = box.style.display === 'none';
  box.style.display = isHidden ? 'block' : 'none';
  if (isHidden) {
    const inp = document.getElementById('library-new-folder-name') as HTMLInputElement;
    inp?.focus();
  }
}

// Confirm creations
async function confirmLibraryCreateDeck(): Promise<void> {
  const inp = document.getElementById('library-new-deck-name') as HTMLInputElement;
  if (!inp) return;
  const name = inp.value.trim();
  if (!name) {
    toast('Please enter a deck name.');
    return;
  }

  const id = 'd_' + uid();
  S.decks[id] = {
    name: name,
    cards: [],
    created: Date.now(),
    modified: Date.now(),
    folderId: null,
    favorite: false,
    color: '#3D7A5F' // default sage green
  };
  S.deckOrder.unshift(id);

  inp.value = '';
  toggleLibraryCreateDeckForm();
  await persist();
  renderLibrary();
  (window as any).renderSidebar?.();
  toast(`✓ Deck "${name}" created!`);

  import('./firebase-sync.js').then(({ syncCreateDeck }) => {
    syncCreateDeck(id, name).catch(err => console.warn("Sync failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module:", e));
}

async function confirmLibraryCreateFolder(): Promise<void> {
  const inp = document.getElementById('library-new-folder-name') as HTMLInputElement;
  if (!inp) return;
  const name = inp.value.trim();
  if (!name) {
    toast('Please enter a folder name.');
    return;
  }

  const fid = 'f_' + uid();
  S.folders[fid] = {
    name: name,
    collapsed: false
  };
  S.folderOrder.unshift(fid);

  inp.value = '';
  toggleLibraryCreateFolderForm();
  await persist();
  renderLibrary();
  (window as any).renderSidebar?.();
  toast(`✓ Folder "${name}" created!`);
}

// Filter toggles
function setLibraryFilter(filter: 'all' | 'srs' | 'fav' | 'ai'): void {
  activeLibFilter = filter;
  // Update UI active chip classes
  const filters: ('all' | 'srs' | 'fav' | 'ai')[] = ['all', 'srs', 'fav', 'ai'];
  filters.forEach(f => {
    const el = document.getElementById(`lib-filter-${f}`);
    if (el) {
      if (f === filter) {
        el.classList.add('active');
      } else {
        el.classList.remove('active');
      }
    }
  });
  renderLibrary();
}

// Favorites toggle
async function toggleDeckFavorite(deckId: string, event: Event): Promise<void> {
  event.stopPropagation();
  const d = S.decks[deckId];
  if (!d) return;
  d.favorite = !d.favorite;
  await persist();
  renderLibrary();
  (window as any).renderSidebar?.();
  toast(d.favorite ? '★ Added to Favorites' : '☆ Removed from Favorites');
}

// Set custom color for deck
async function setDeckColor(deckId: string, color: string, event: Event): Promise<void> {
  event.stopPropagation();
  const d = S.decks[deckId];
  if (!d) return;
  d.color = color;
  await persist();
  renderLibrary();
}

// Move deck to folder programmatically
async function moveDeckToFolderLibrary(deckId: string, folderId: string | null, event: Event): Promise<void> {
  event.stopPropagation();
  const d = S.decks[deckId];
  if (!d) return;
  d.folderId = folderId;
  await persist();
  renderLibrary();
  (window as any).renderSidebar?.();
  toast(folderId ? `Moved to folder` : `Moved out of folder`);

  import('./firebase-sync.js').then(({ syncMoveDeckToFolder }) => {
    syncMoveDeckToFolder(deckId, folderId).catch(err => console.warn("Sync failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module:", e));
}

function selectDeckFolderOption(deckId: string, folderId: string, folderName: string, event: Event): void {
  if (event) event.stopPropagation();
  
  // Close the options menu
  const opts = document.getElementById(`deck-folder-opts-${deckId}`);
  if (opts) {
    opts.style.display = 'none';
    const wrapper = opts.closest('.custom-dropdown');
    if (wrapper) wrapper.classList.remove('active');
    const card = opts.closest('.lib-deck-card');
    if (card) card.classList.remove('has-active-dropdown');
  }

  // Update selected display
  const sel = document.getElementById(`deck-folder-sel-${deckId}`);
  if (sel) {
    sel.textContent = folderName;
    sel.dataset.value = folderId;
  }

  moveDeckToFolderLibrary(deckId, folderId || null, event);
}

// Rename deck
async function renameDeckLibrary(deckId: string, event: Event): Promise<void> {
  event.stopPropagation();
  const d = S.decks[deckId];
  if (!d) return;
  const newName = await showCustomPrompt('Rename Deck', `Enter a new name for "${d.name}":`, d.name, 'Deck name...');
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) {
    toast('Name cannot be empty');
    return;
  }
  d.name = trimmed;
  await persist();
  renderLibrary();
  (window as any).renderSidebar?.();
  toast('✓ Deck renamed');

  import('./firebase-sync.js').then(({ syncRenameDeck }) => {
    syncRenameDeck(deckId, trimmed).catch(err => console.warn("Sync failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module:", e));
}

// Rename folder
async function renameFolderLibrary(folderId: string, event: Event): Promise<void> {
  event.stopPropagation();
  const f = S.folders[folderId];
  if (!f) return;
  const newName = await showCustomPrompt('Rename Folder', `Enter a new name for folder "${f.name}":`, f.name, 'Folder name...');
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed) {
    toast('Name cannot be empty');
    return;
  }
  f.name = trimmed;
  await persist();
  renderLibrary();
  (window as any).renderSidebar?.();
  toast('✓ Folder renamed');
}

// Delete deck with library callback
async function deleteDeckLibrary(deckId: string, event: Event): Promise<void> {
  event.stopPropagation();
  const d = S.decks[deckId];
  if (!d) return;
  const confirmed = await showCustomConfirm(
    'Delete Deck',
    `Are you sure you want to delete "${d.name}" and all its ${d.cards.length} cards?\nThis action cannot be undone.`,
    true
  );
  if (!confirmed) return;
  delete S.decks[deckId];
  S.deckOrder = S.deckOrder.filter((id: string) => id !== deckId);
  await persist();
  renderLibrary();
  (window as any).renderSidebar?.();
  toast('✓ Deck deleted');

  import('./firebase-sync.js').then(({ syncDeleteDeck }) => {
    syncDeleteDeck(deckId).catch(err => console.warn("Sync failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module:", e));
}

// Delete folder with library callback
async function deleteFolderLibrary(folderId: string, event: Event): Promise<void> {
  event.stopPropagation();
  const f = S.folders[folderId];
  if (!f) return;
  const confirmed = await showCustomConfirm(
    'Delete Folder',
    `Are you sure you want to delete folder "${f.name}"?\nDecks inside this folder will NOT be deleted; they will be moved to ungrouped.`,
    true
  );
  if (!confirmed) return;
  
  // Ungroup decks inside folder
  const affectedDecks: string[] = [];
  Object.keys(S.decks).forEach((id: string) => {
    if (S.decks[id].folderId === folderId) {
      S.decks[id].folderId = null;
      affectedDecks.push(id);
    }
  });

  delete S.folders[folderId];
  S.folderOrder = S.folderOrder.filter((fid: string) => fid !== folderId);
  await persist();
  renderLibrary();
  (window as any).renderSidebar?.();
  toast('✓ Folder deleted');

  if (affectedDecks.length > 0) {
    import('./firebase-sync.js').then(({ syncMoveDeckToFolder }) => {
      affectedDecks.forEach(id => syncMoveDeckToFolder(id, null).catch(err => console.warn("Sync failed:", err)));
    }).catch(e => console.warn("Could not load firebase-sync module:", e));
  }
}

// Create deck inside a specific folder directly
async function createDeckInsideFolder(folderId: string, event: Event): Promise<void> {
  event.stopPropagation();
  const f = S.folders[folderId];
  if (!f) return;
  
  const name = await showCustomPrompt(
    'Create Deck in Folder',
    `Enter a name for the new deck inside folder "${f.name}":`,
    '',
    'Deck name...'
  );
  if (!name) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toast('Name cannot be empty');
    return;
  }

  const id = 'd_' + uid();
  S.decks[id] = {
    name: trimmed,
    cards: [],
    created: Date.now(),
    modified: Date.now(),
    folderId: folderId,
    favorite: false,
    color: '#3D7A5F'
  };
  S.deckOrder.unshift(id);

  await persist();
  renderLibrary();
  (window as any).renderSidebar?.();
  toast(`✓ Deck "${trimmed}" created inside folder "${f.name}"!`);

  import('./firebase-sync.js').then(({ syncCreateDeck }) => {
    syncCreateDeck(id, trimmed, folderId).catch(err => console.warn("Sync failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module:", e));
}

// Drag & drop handlers
function onFolderDragOver(event: DragEvent): void {
  event.preventDefault();
  const card = event.currentTarget as HTMLElement;
  card.style.borderColor = 'var(--accent)';
  card.style.background = 'var(--accent-dim)';
}

function onFolderDragLeave(event: DragEvent): void {
  const card = event.currentTarget as HTMLElement;
  card.style.borderColor = 'var(--border)';
  card.style.background = 'var(--surface2)';
}

async function onFolderDrop(event: DragEvent, folderId: string | null): Promise<void> {
  event.preventDefault();
  const card = event.currentTarget as HTMLElement;
  card.style.borderColor = 'var(--border)';
  card.style.background = 'var(--surface2)';

  const deckId = event.dataTransfer?.getData('text/plain');
  if (!deckId || !S.decks[deckId]) return;

  S.decks[deckId].folderId = folderId;
  await persist();
  renderLibrary();
  (window as any).renderSidebar?.();
  toast(folderId ? `✓ Moved into folder` : `✓ Moved out of folder`);

  import('./firebase-sync.js').then(({ syncMoveDeckToFolder }) => {
    syncMoveDeckToFolder(deckId, folderId).catch(err => console.warn("Sync failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module:", e));
}

// Study a deck from the library
function startStudySessionLibrary(deckId: string): void {
  selectDeck(deckId);
  showPanel('study', null);
}

// Open card editor directly for deck
function manageDeckCardsLibrary(deckId: string): void {
  selectDeck(deckId);
  showPanel('manage', null);
}

// Study all due cards cross-deck
function studyAllDueCards(): void {
  const allMatchingCards: any[] = [];
  const midnight = getLocalMidnightTonight();

  Object.values(S.decks).forEach((d: any) => {
    d.cards.forEach((c: any) => {
      const isDue = S.srsEnabled ? (c.due <= midnight) : true;
      if (isDue) {
        allMatchingCards.push({ ...c, _originDeckId: d.id || '' });
      }
    });
  });

  if (!allMatchingCards.length) {
    toast('✓ Outstanding! You have no due cards to study right now.');
    return;
  }

  S.studyId = '__cross_deck__';
  S.selDeck = null;

  const studyTitle = document.getElementById('study-title');
  if (studyTitle) studyTitle.textContent = `All Scheduled Due Cards (${allMatchingCards.length})`;

  const noDeckEl = document.getElementById('no-deck');
  if (noDeckEl) noDeckEl.style.display = 'none';

  const studyBody = document.getElementById('study-body');
  if (studyBody) studyBody.style.display = 'block';

  (window as any).loadQueue(allMatchingCards);
  showPanel('study', null);
  toast(`✓ Loaded ${allMatchingCards.length} due cards!`);
}

// Core Rendering Engine for the Deck Library Page
function renderLibrary(): void {
  const grid = document.getElementById('library-explorer-grid');
  if (!grid) return;

  // Respect saved onboarding guide visibility preference
  const onboardingCard = document.getElementById('library-onboarding-card');
  if (onboardingCard) {
    if (localStorage.getItem('hide-library-guide') === 'true') {
      onboardingCard.style.display = 'none';
    } else {
      onboardingCard.style.display = 'flex';
    }
  }

  const searchInp = document.getElementById('library-search-input') as HTMLInputElement;
  const searchVal = (searchInp?.value || '').toLowerCase().trim();

  const sortSel = document.getElementById('library-sort-select') as HTMLSelectElement;
  const sortBy = sortSel?.value || 'recent';

  const midnight = getLocalMidnightTonight();

  // Filter and gather decks
  const decksToRender = Object.entries(S.decks).map(([id, d]: [string, any]) => {
    const dueCount = S.srsEnabled ? d.cards.filter((c: any) => c.due <= midnight).length : 0;
    return {
      id,
      ...d,
      dueCount
    };
  }).filter(d => {
    // Search text filter
    if (searchVal && !d.name.toLowerCase().includes(searchVal)) {
      return false;
    }

    // Tab category filter
    if (activeLibFilter === 'srs' && d.dueCount === 0) return false;
    if (activeLibFilter === 'fav' && !d.favorite) return false;
    if (activeLibFilter === 'ai' && !d.ai) return false;

    return true;
  });

  // Sort decks
  decksToRender.sort((a, b) => {
    if (sortBy === 'name-asc') {
      return a.name.localeCompare(b.name);
    } else if (sortBy === 'name-desc') {
      return b.name.localeCompare(a.name);
    } else if (sortBy === 'cards-desc') {
      return b.cards.length - a.cards.length;
    } else if (sortBy === 'due-desc') {
      return b.dueCount - a.dueCount;
    } else {
      // Default: "recent" (by modified timestamp, fallback created)
      const tA = a.modified || a.created || 0;
      const tB = b.modified || b.created || 0;
      return tB - tA;
    }
  });

  // Folder groups mapping
  const folderDecks: { [fid: string]: any[] } = {};
  const ungroupedDecks: any[] = [];

  decksToRender.forEach(d => {
    if (d.folderId && S.folders[d.folderId]) {
      if (!folderDecks[d.folderId]) folderDecks[d.folderId] = [];
      folderDecks[d.folderId].push(d);
    } else {
      ungroupedDecks.push(d);
    }
  });

  let html = '';

  // 1. Render Folder Containers
  S.folderOrder.forEach((fid: string) => {
    const f = S.folders[fid];
    if (!f) return;

    // Filter folder by search if search has text (hide folder if empty and does not match folder name itself)
    const decks = folderDecks[fid] || [];
    const matchesSearch = !searchVal || f.name.toLowerCase().includes(searchVal);
    if (!matchesSearch && decks.length === 0) return;

    const isCollapsed = f.collapsed;
    const arrowClass = isCollapsed ? 'lib-folder-arrow collapsed' : 'lib-folder-arrow';
    const arrow = `<svg class="${arrowClass}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px; display:inline-block; vertical-align:middle; color:var(--text3);"><polyline points="6 9 12 15 18 9"></polyline></svg>`;
    const displayStyle = isCollapsed ? 'none' : 'grid';

    // Move to folder options dropdown generator
    const folderSelectorOptions = Object.entries(S.folders).map(([id, folder]: [string, any]) => {
      if (id === fid) return '';
      return `<option value="${id}">${escH(folder.name)}</option>`;
    }).join('');

    html += `
      <div class="lib-folder-wrapper" style="border:1px solid var(--border); border-radius:var(--rs); overflow:hidden; background:var(--surface);">
        <!-- Folder Header (Drag & Drop target) -->
        <div class="lib-folder-header" 
             ondragover="window.onFolderDragOver(event)" 
             ondragleave="window.onFolderDragLeave(event)" 
             ondrop="window.onFolderDrop(event, '${fid}')"
             onclick="window.toggleLibraryFolderCollapse('${fid}')"
             style="display:flex; align-items:center; justify-content:space-between; padding:14px 18px; background:var(--surface2); border-bottom:1px solid var(--border); cursor:pointer; transition:all 0.15s;">
          <div style="display:flex; align-items:center; gap:10px;">
            <span style="display:inline-flex; align-items:center; user-select:none;">${arrow}</span>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px; height:16px; color:var(--blue); display:inline-block; vertical-align:middle;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            <div style="display:flex; flex-direction:column; align-items:flex-start;">
              <span style="font-size:9px; font-weight:800; color:var(--accent); text-transform:uppercase; letter-spacing:0.08em; line-height:1; margin-bottom:2px;">Folder Organizer</span>
              <span style="font-weight:700; font-size:15px; color:var(--text); font-family:'Space Grotesk', sans-serif; line-height:1.2;">${escH(f.name)}</span>
            </div>
            <span style="background:var(--surface3); color:var(--text3); font-size:10px; font-weight:700; padding:2px 8px; border-radius:12px; margin-left:6px;">${decks.length} Decks</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;" onclick="event.stopPropagation()">
            <!-- Folder Actions -->
            <button class="btn btn-g" onclick="window.createDeckInsideFolder('${fid}', event)" style="font-size:11px; padding:4px 8px; font-weight:700; display:inline-flex; align-items:center; gap:4px;" title="Create new deck directly inside this folder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px; height:11px;"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
              <span>Add Deck</span>
            </button>
            <button class="btn btn-b" onclick="window.renameFolderLibrary('${fid}', event)" style="font-size:11px; padding:4px 8px; display:inline-flex; align-items:center; gap:4px;" title="Rename Folder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px; height:11px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
              <span>Rename</span>
            </button>
            <button class="btn" onclick="window.deleteFolderLibrary('${fid}', event)" style="font-size:11px; padding:4px 8px; color:#f87171; border-color:rgba(239,68,68,0.2); background:rgba(239,68,68,0.02); display:inline-flex; align-items:center; gap:4px;" title="Delete Folder">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px; height:11px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              <span>Delete</span>
            </button>
          </div>
        </div>

        <!-- Folder Decks Grid -->
        <div class="lib-folder-decks-grid" style="display:${displayStyle}; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:16px; padding:18px;">
          ${decks.length > 0 ? decks.map(d => renderLibraryDeckCard(d, folderSelectorOptions)).join('') : `
            <div style="grid-column: 1 / -1; text-align:center; padding:24px; color:var(--text3); font-size:12px; font-style:italic;">
              Folder is empty. A folder is an empty container used to group decks. Drag and drop any deck here, or use the "Move" dropdown on any deck card.
            </div>
          `}
        </div>
      </div>
    `;
  });

  // 2. Render Ungrouped Decks (Plain Grid)
  if (ungroupedDecks.length > 0 || S.folderOrder.length === 0) {
    const ungroupedHeader = S.folderOrder.length > 0 ? `
      <div style="margin-top:10px; margin-bottom:12px; padding-bottom:8px; border-bottom:1px solid var(--border); display:flex; align-items:center; gap:8px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px; height:14px; color:var(--text3); display:inline-block; vertical-align:middle;"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
        <h3 style="margin:0; font-family:'Space Grotesk', sans-serif; font-size:14px; font-weight:700; color:var(--text3); text-transform:uppercase; letter-spacing:0.04em;">Ungrouped Decks</h3>
      </div>
    ` : '';

    const folderOptionsList = Object.entries(S.folders).map(([id, folder]: [string, any]) => {
      return `<option value="${id}">${escH(folder.name)}</option>`;
    }).join('');

    html += `
      ${ungroupedHeader}
      <!-- Ungrouped target area (allows dragging back out of folders) -->
      <div class="lib-ungrouped-decks-grid" 
           ondragover="window.onFolderDragOver(event)" 
           ondragleave="window.onFolderDragLeave(event)" 
           ondrop="window.onFolderDrop(event, null)"
           style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:16px; min-height:100px; padding:8px; border-radius:var(--rs); transition:all 0.15s;">
        ${ungroupedDecks.length > 0 ? ungroupedDecks.map(d => renderLibraryDeckCard(d, folderOptionsList)).join('') : `
          <div style="grid-column: 1 / -1; text-align:center; padding:32px; color:var(--text3); font-size:13px; background:var(--surface2); border:1px dashed var(--border); border-radius:var(--rs);">
            No ungrouped decks available. Create a new deck using the "+ New Deck" button above!
          </div>
        `}
      </div>
    `;
  }

  grid.innerHTML = html;
}

// Single Deck card generator
function renderLibraryDeckCard(d: any, folderOptionsHtml: string): string {
  const color = d.color || '#3D7A5F'; // fallback
  const dueBadge = d.dueCount > 0 ? `<span style="background:rgba(234, 179, 8, 0.12); color:#ffd700; border:1px solid rgba(234,179,8,0.25); font-size:11px; font-weight:700; padding:2px 8px; border-radius:10px;">${d.dueCount} Due</span>` : '';
  const aiTag = d.ai ? `<span style="background:rgba(168,85,247,0.1); color:#c084fc; border:1px solid rgba(168,85,247,0.2); font-size:9px; font-weight:800; padding:1px 5px; border-radius:4px; text-transform:uppercase;">AI</span>` : '';
  const favIcon = d.favorite
    ? `<svg viewBox="0 0 24 24" fill="currentColor" style="width:18px; height:18px; display:inline-block; vertical-align:middle;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:18px; height:18px; display:inline-block; vertical-align:middle;"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`;
  const favClass = d.favorite ? 'lib-fav-active' : 'lib-fav-inactive';

  const currentFolderName = d.folderId && S.folders[d.folderId] ? S.folders[d.folderId].name : 'Ungrouped';
  const customOptionsHtml = Object.entries(S.folders || {}).map(([id, folder]: [string, any]) => {
    if (id === d.folderId) return '';
    return `<div class="option" onclick="window.selectDeckFolderOption('${d.id}', '${id}', '${escH(folder.name)}', event)" style="padding:6px 10px; font-size:11px; color:var(--text);">${escH(folder.name)}</div>`;
  }).join('');
  const ungroupedOptionHtml = d.folderId ? `<div class="option" onclick="window.selectDeckFolderOption('${d.id}', '', 'Ungrouped', event)" style="padding:6px 10px; font-size:11px; color:var(--text3); border-bottom:1px solid var(--border);">Ungrouped</div>` : '';

  return `
    <div class="lib-deck-card" 
         draggable="true" 
         data-deck-id="${d.id}"
         onclick="window.startStudySessionLibrary('${d.id}')"
         style="position:relative; display:flex; flex-direction:column; justify-content:space-between; padding:16px; background:var(--surface2); border:1.5px solid var(--border); border-radius:var(--rs); cursor:pointer; transition:all 0.15s;"
         onmouseover="this.style.borderColor='var(--accent)'; this.style.transform='translateY(-2px)';" 
         onmouseout="this.style.borderColor='var(--border)'; this.style.transform='none';">
      
      <!-- Colored tag pip on top edge -->
      <div style="position:absolute; top:0; left:16px; right:16px; height:3.5px; background:${color}; border-radius:0 0 4px 4px;"></div>

      <div>
        <!-- Favorite and Title Row -->
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:4px; margin-bottom:8px;">
          <h4 style="margin:0; font-family:'Space Grotesk', sans-serif; font-size:15px; font-weight:700; line-height:1.4; color:var(--text); max-width:85%; word-break:break-word;">${escH(d.name)}</h4>
          <button class="lib-fav-btn ${favClass}" onclick="window.toggleDeckFavorite('${d.id}', event)" style="background:none; border:none; font-size:18px; line-height:1; cursor:pointer; padding:0;" title="Toggle Favorite">${favIcon}</button>
        </div>

        <!-- Meta labels -->
        <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:14px;">
          <span style="font-size:11px; color:var(--text3); font-weight:500;">${d.cards.length} cards</span>
          <span style="color:var(--border); font-size:11px;">•</span>
          ${dueBadge || `<span style="font-size:11px; color:var(--text3);">No scheduled items</span>`}
          ${aiTag}
        </div>
      </div>

      <!-- Action Row -->
      <div style="border-top:1px solid var(--border); padding-top:12px; margin-top:8px;" onclick="event.stopPropagation()">
        <!-- Color and Folder managers -->
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <!-- Quick color selector -->
          <div style="display:flex; align-items:center; gap:4px;">
            <span style="font-size:10px; color:var(--text3); text-transform:uppercase; font-weight:700;">Color:</span>
            <input type="color" value="${color}" onchange="window.setDeckColor('${d.id}', this.value, event)" style="width:18px; height:18px; border:none; background:none; cursor:pointer; padding:0; border-radius:50%;" title="Customise color tag">
          </div>
          
          <!-- Move folder selector -->
          <div style="display:flex; align-items:center; gap:4px; position:relative;">
            <span style="font-size:10px; color:var(--text3); text-transform:uppercase; font-weight:700;">Move:</span>
            <div class="custom-dropdown" style="min-width:115px; max-width:140px;">
              <div class="custom-dropdown-selected" id="deck-folder-sel-${d.id}" onclick="window.toggleDropdown('deck-folder-opts-${d.id}')" data-value="${d.folderId || ''}" style="background:var(--surface3); border:1.5px solid var(--border); border-radius:4px; font-size:10px; padding:3px 18px 3px 6px; color:var(--text2); font-weight:600; cursor:pointer; height:auto; min-height:22px; width:100%; box-sizing:border-box; line-height:1.2;">
                ${escH(currentFolderName)}
              </div>
              <div class="custom-dropdown-options" id="deck-folder-opts-${d.id}" style="display:none; text-align:left; max-height:150px; overflow-y:auto; font-size:11px; margin-top:2px;">
                ${ungroupedOptionHtml}
                ${customOptionsHtml}
              </div>
            </div>
          </div>
        </div>

        <div style="display:flex; gap:6px; width:100%;">
          <!-- Manage cards -->
          <button class="btn btn-b" onclick="window.manageDeckCardsLibrary('${d.id}')" style="flex:1; justify-content:center; align-items:center; gap:4px; font-size:11px; padding:6px 0; font-weight:700; height:32px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px; height:11px;"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
            <span>Manage Cards</span>
          </button>
          <!-- Study button -->
          <button class="btn btn-g" onclick="window.startStudySessionLibrary('${d.id}')" style="flex:1; justify-content:center; align-items:center; gap:4px; font-size:11px; padding:6px 0; font-weight:700; height:32px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px; height:11px; fill:currentColor;"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Study</span>
          </button>
          <!-- Schedule button -->
          <button class="btn" onclick="event.stopPropagation(); window.scheduleDeckLibrary('${d.id}')" style="width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center; color:var(--text); border-color:var(--border);" title="Schedule Notification">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          </button>
          <!-- Delete button -->
          <button class="btn" onclick="window.deleteDeckLibrary('${d.id}', event)" style="width:32px; height:32px; padding:0; display:flex; align-items:center; justify-content:center; color:#f87171; border-color:rgba(239,68,68,0.2);" title="Delete Deck">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px; height:12px;"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
      </div>

    </div>
  `;
}

// Collapsing state folder manager
async function toggleLibraryFolderCollapse(folderId: string): Promise<void> {
  const f = S.folders[folderId];
  if (!f) return;
  f.collapsed = !f.collapsed;
  await persist();
  renderLibrary();
  (window as any).renderSidebar?.();
}

// Expose API for global inline triggers
Object.assign(window, {
  initLibrary,
  renderLibrary,
  toggleLibraryCreateDeckForm,
  toggleLibraryCreateFolderForm,
  confirmLibraryCreateDeck,
  confirmLibraryCreateFolder,
  setLibraryFilter,
  toggleDeckFavorite,
  setDeckColor,
  moveDeckToFolderLibrary,
  renameDeckLibrary,
  renameFolderLibrary,
  deleteDeckLibrary,
  deleteFolderLibrary,
  onFolderDragOver,
  onFolderDragLeave,
  onFolderDrop,
  startStudySessionLibrary,
  manageDeckCardsLibrary,
  studyAllDueCards,
  toggleLibraryFolderCollapse,
  createDeckInsideFolder
});


// ─── ES module exports (auto-generated) ───
export { activeLibFilter, confirmLibraryCreateDeck, confirmLibraryCreateFolder, createDeckInsideFolder, deleteDeckLibrary, deleteFolderLibrary, initLibrary, manageDeckCardsLibrary, moveDeckToFolderLibrary, selectDeckFolderOption, onFolderDragLeave, onFolderDragOver, onFolderDrop, renameDeckLibrary, renameFolderLibrary, renderLibrary, renderLibraryDeckCard, setDeckColor, setLibraryFilter, startStudySessionLibrary, studyAllDueCards, toggleDeckFavorite, toggleLibraryCreateDeckForm, toggleLibraryCreateFolderForm, toggleLibraryFolderCollapse };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { confirmLibraryCreateDeck, confirmLibraryCreateFolder, createDeckInsideFolder, deleteDeckLibrary, deleteFolderLibrary, initLibrary, manageDeckCardsLibrary, moveDeckToFolderLibrary, selectDeckFolderOption, onFolderDragLeave, onFolderDragOver, onFolderDrop, renameDeckLibrary, renameFolderLibrary, renderLibrary, renderLibraryDeckCard, setDeckColor, setLibraryFilter, startStudySessionLibrary, studyAllDueCards, toggleDeckFavorite, toggleLibraryCreateDeckForm, toggleLibraryCreateFolderForm, toggleLibraryFolderCollapse });

function scheduleDeckLibrary(deckId: string) {
  const d = (window as any).S.decks[deckId];
  if (!d) return;
  const dateStr = prompt("Enter a scheduled date to be reminded to study this deck (YYYY-MM-DD):", d.scheduledDate || "");
  if (dateStr === null) return;
  d.scheduledDate = dateStr.trim();
  if (d.scheduledDate) {
    (window as any).toast(`Deck scheduled for ${d.scheduledDate}!`);
  } else {
    (window as any).toast(`Schedule cleared.`);
  }
  (window as any).persist();
  renderLibrary();
}

Object.assign(window, { scheduleDeckLibrary });
