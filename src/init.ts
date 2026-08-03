import { App } from '@capacitor/app';
import { chatInit } from './chat.js';
import { addCard, bindImportModalInput, bulkPasteImport, confirmExport, confirmImport, exportDeck, importDeck, resetAllSpaced, selectExportFormat } from './deck-manager.js';
import { app } from './firebase.js';
import { initGamesArcade } from './games.js';
import { initLibrary } from './library.js';
import { S } from './main.js';
import { closePdfPanel, loadPdfFile, pdfGotoPage, pdfNextPage, pdfPrevPage, togglePdfPanel, zoomPdf } from './notes.js';
import { Scratch, debouncedSearch, runSearch } from './scratchpad.js';
import { Pomo, initDarkMode, initLightweightMode, initTheme, populateQRDeckSelect, populateQRFolderSelect } from './settings.js';
import { addDeck, addFolder, closeSidebar, renderSidebar, renderWelcomeDashboard, showPanel, toggleSRS, toggleSidebar, updateStats } from './sidebar.js';
import { checkStorageQuota, initStorage, persist, renderBackupList, syncToDisk } from './storage.js';
import { doReset, doShuffle, enterFocusMode, handleNoteKey, insertLine, insertMd, notes, notesInit, onFile, onNoteInput, renderNoteTabs, setMode, setNotes, shuffle, togglePreview } from './study.js';
import { fetchWithTimeout, toast } from './utils.js';












function init() {
  notesInit();
  initLibrary();
  initGamesArcade();
  
  // Restore sidebar state
  if (localStorage.getItem('ftp-sidebar-collapsed') === 'true') {
    document.getElementById('sidebar')?.classList.add('collapsed');
    document.getElementById('app-container')?.classList.add('sidebar-collapsed');
  }

  // Storage handled async in initStorage() below — init() is called after
  const aiProviderSel = document.getElementById('ai-provider-sel') as HTMLElement | null;
  const openrouterKeyInp = document.getElementById('openrouter-key-inp') as HTMLInputElement | null;
  const openrouterModelSel = document.getElementById('openrouter-model-sel') as HTMLElement | null;
  const geminiKeyInp = document.getElementById('gemini-key-inp') as HTMLInputElement | null;
  const geminiModelSel = document.getElementById('gemini-model-sel') as HTMLElement | null;
  
  const storedProvider = localStorage.getItem('ftp-provider');
  S.aiProvider = storedProvider === 'ollama' || storedProvider === 'groq' ? 'openrouter' : storedProvider || 'openrouter';
  S.openrouterKey = localStorage.getItem('ftp-openrouterkey') || '';
  S.openrouterModel = localStorage.getItem('ftp-openrouter-model') || 'gpt-4o-mini';
  S.geminiKey = localStorage.getItem('ftp-geminikey') || '';
  S.geminiModel = localStorage.getItem('ftp-gemini-model') || 'gemini-3.5-flash';
  
  const providerNames: any = {
    'openrouter': '[AI] OpenRouter (cloud)',
    'gemini': '[AI] Gemini (direct)',
    'noai': '📄 No AI (rule-based, offline)'
  };
  const modelNames: any = {
    'openrouter/free': '🆓 OpenRouter Free (auto-selected)',
    'gpt-4o-mini': 'GPT-4O Mini (fast, cheap)',
    'gpt-4-turbo': 'GPT-4 Turbo (powerful)',
    'gpt-3.5-turbo': 'GPT-3.5 Turbo (fastest)',
    'claude-3-5-sonnet': 'Claude 3.5 Sonnet (accurate)',
    'llama-3.1-70b': 'Llama 3.1 70B (open source)',
    'mistral-large': 'Mistral Large (balanced)',
    'gemini-3.5-flash': 'Gemini 3.5 Flash (fastest, standard)',
    'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite',
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro (advanced)'
  };
  
  if (aiProviderSel) {
    aiProviderSel.textContent = providerNames[S.aiProvider] || providerNames['openrouter'];
    aiProviderSel.dataset.value = S.aiProvider;
  }
  if (openrouterKeyInp && S.openrouterKey) openrouterKeyInp.value = S.openrouterKey;
  if (openrouterModelSel) {
    openrouterModelSel.textContent = modelNames[S.openrouterModel] || modelNames['gpt-4o-mini'];
    openrouterModelSel.dataset.value = S.openrouterModel;
  }
  if (geminiKeyInp && S.geminiKey) geminiKeyInp.value = S.geminiKey;
  if (geminiModelSel) {
    geminiModelSel.textContent = modelNames[S.geminiModel] || modelNames['gemini-3.5-flash'];
    geminiModelSel.dataset.value = S.geminiModel;
  }
  updateProviderUI();
  renderSidebar(); updateStats();
  renderWelcomeDashboard();
 
  // ── Event listeners (replacing inline handlers) ──────────────────────────
  const byId = id => document.getElementById(id);
 
  byId('fab')              ?.addEventListener('click',   () => toggleSidebar());
  byId('sidebar-overlay')  ?.addEventListener('click',   () => closeSidebar());
  byId('add-deck-btn')     ?.addEventListener('click',   () => addDeck());
  byId('add-folder-btn')   ?.addEventListener('click',   () => addFolder());
  byId('btn-srs-toggle')   ?.addEventListener('click',   toggleSRS);
  byId('new-deck-inp')     ?.addEventListener('keydown', e => { if(e.key==='Enter') addDeck(); });
  byId('new-folder-inp')   ?.addEventListener('keydown', e => { if(e.key==='Enter') addFolder(); });
  byId('import-global-inp')?.addEventListener('change',  e => importDeck(e));
  byId('import-inp')       ?.addEventListener('change',  e => importDeck(e));
  byId('file-inp')         ?.addEventListener('change',  e => onFile(e));
  byId('pdf-file-inp')     ?.addEventListener('change',  e => loadPdfFile(e));
  // Custom dropdowns don't fire "change" event natively, we'll update them in saveProviderCfg or selectDropdownOption
  // The event binding for these isn't needed here if we call saveProviderCfg from selectDropdownOption.
  byId('openrouter-key-inp')   ?.addEventListener('input',   () => saveProviderCfg());
  byId('gemini-key-inp')       ?.addEventListener('input',   () => saveProviderCfg());
 
  // Slider live-update
  const slider = byId('card-count-slider');
  const sliderVal = byId('card-count-val');
  if (slider && sliderVal) {
    slider.addEventListener('input', () => { sliderVal.textContent = slider.value; });
  }
 
  // Sidebar nav items — use data-panel attribute
  document.querySelectorAll('.nav-item[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const b = btn as any;
      if (b.dataset.panel === 'study') {
        if (typeof (window as any).goHome === 'function') {
          (window as any).goHome();
          return;
        }
      }
      showPanel(b.dataset.panel, btn);
    });
  });
 
  // bottom nav removed — FAB opens sidebar
 
  // Study header buttons
  byId('btn-shuffle')?.addEventListener('click', doShuffle);
  byId('btn-reset')  ?.addEventListener('click', doReset);
 
  // Mode tabs
  document.querySelectorAll('.mtab[data-mode]').forEach(btn => {
    btn.addEventListener('click', () => setMode(btn.dataset.mode, btn));
  });
 
  // Manage panel buttons
  byId('btn-add-card')      ?.addEventListener('click', addCard);
  byId('btn-reset-srs')     ?.addEventListener('click', resetAllSpaced);
  byId('btn-export-deck')   ?.addEventListener('click', exportDeck);
  byId('btn-import-open')   ?.addEventListener('click', () => byId('import-inp')?.click());
  byId('btn-import-global') ?.addEventListener('click', () => byId('import-global-inp')?.click());
 
 
  // Pomodoro
  byId('pomo-start')?.addEventListener('click', () => Pomo.start());
  byId('pomo-reset')?.addEventListener('click', () => Pomo.reset());
  byId('pomo-mode') ?.addEventListener('change', e => Pomo.setMode(e.target.value));
 
  // Bulk paste
  byId('btn-bulk-import')?.addEventListener('click', bulkPasteImport);
 
  // Sync to disk
  byId('btn-sync-disk')?.addEventListener('click', syncToDisk);
 
  // OpenRouter settings
  byId('btn-test-openrouter')?.addEventListener('click', testOpenRouter);
  byId('btn-test-gemini')    ?.addEventListener('click', testGemini);
  byId('export-opt-json')?.addEventListener('click', () => selectExportFormat('json'));
  byId('export-opt-txt') ?.addEventListener('click', () => selectExportFormat('txt'));
  byId('export-confirm-btn')?.addEventListener('click', confirmExport);
  byId('modal-confirm-btn') ?.addEventListener('click', confirmImport);
 
  // Scratchpad — init after DOM settled
  setTimeout(() => Scratch.init(), 200);
 
  // Global search — single clean handler using runSearch
  byId('global-search')?.addEventListener('input', debouncedSearch);
  byId('global-search')?.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.target.value = ''; runSearch(); }
  });
  document.addEventListener('click', e => {
    const target = e.target as HTMLElement;
    if (!target.closest('.search-bar-wrap')) {
      document.getElementById('search-results')?.classList.remove('show');
    }
    
    // Close custom dropdowns if clicked outside
    if (!target.closest('.custom-dropdown')) {
      document.querySelectorAll('.custom-dropdown-options').forEach(opt => {
        (opt as HTMLElement).style.display = 'none';
        opt.closest('.custom-dropdown')?.classList.remove('active');
        opt.closest('.lib-deck-card')?.classList.remove('has-active-dropdown');
      });
    }
  });
 
  // Scratchpad show button wired via DOMContentLoaded in IIFE
 
  // Theme
  initTheme();
 
  // New features
  initLightweightMode();
  initDarkMode();
  Pomo.init();
  checkStorageQuota();
  renderBackupList();
  populateQRDeckSelect(); // also calls populateQRFolderSelect internally
  chatInit(); // Initialize AI chat
  
  // API usage display
  setTimeout(() => (window as any).updateUsageDisplay?.(), 100);
 
  // Restore from backup file
  const backupInp = byId('backup-import-inp');
  if (backupInp) {
    backupInp.addEventListener('change', async e => {
      const file = e.target.files?.[0]; if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        // Accept both syncToDisk format and backup snapshot format
        if (!data.decks) throw new Error('No decks found in file');
        if (!confirm(`Restore from "${file.name}"? This will replace current decks, cards, and notes.`)) return;
        if (data.decks) S.decks = data.decks;
        if (data.deckOrder) S.deckOrder = data.deckOrder;
        if (data.notes) setNotes(data.notes);
        if (data.folders) S.folders = data.folders;
        if (data.folderOrder) S.folderOrder = data.folderOrder;
        await persist();
        renderSidebar(); updateStats(); renderNoteTabs();
        toast('✓ Data restored from file!');
      } catch(err) { toast('Import failed: ' + err.message); }
      e.target.value = '';
    });
  }

  // Check for import hash on load
  setTimeout(() => {
    if (window.location.hash.includes('#import=')) {
      if ((window as any).promptUrlImport) {
        // Mock prompt behavior for auto-import by temporarily overriding prompt()
        const _prompt = window.prompt;
        window.prompt = () => window.location.hash.split('#import=')[1];
        try {
          (window as any).promptUrlImport();
        } finally {
          window.prompt = _prompt;
        }
        // Clear hash after import so it doesn't trigger again on refresh
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
  }, 500);

  setTimeout(checkScheduledDecks, 1500);

  byId('btn-pdf-toggle')  ?.addEventListener('click', togglePdfPanel);
  byId('btn-preview-note')?.addEventListener('click', togglePreview);
  byId('note-editor')     ?.addEventListener('input',   onNoteInput);
  byId('note-editor-title-inp')?.addEventListener('input', onNoteInput);
  byId('note-editor')     ?.addEventListener('keydown', handleNoteKey);
 
  // Notes toolbar — delegate via data attributes
  document.querySelector('.notes-toolbar')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-md-wrap]');
    const lineBtn = e.target.closest('[data-md-line]');
    if (btn)     insertMd(btn.dataset.mdWrap, btn.dataset.mdWrap);
    if (lineBtn) insertLine(lineBtn.dataset.mdLine);
  });
 
  // PDF controls
  byId('btn-pdf-prev')   ?.addEventListener('click', pdfPrevPage);
  byId('btn-pdf-next')   ?.addEventListener('click', pdfNextPage);
  byId('btn-pdf-zout')   ?.addEventListener('click', () => zoomPdf(-0.2));
  byId('btn-pdf-zin')    ?.addEventListener('click', () => zoomPdf(0.2));
  byId('btn-pdf-close')  ?.addEventListener('click', closePdfPanel);
  byId('btn-pdf-change') ?.addEventListener('click', () => byId('pdf-file-inp')?.click());
  byId('pdf-title')      ?.addEventListener('click', () => byId('pdf-file-inp')?.click());
  byId('pdf-page-inp')   ?.addEventListener('change', e => pdfGotoPage(e.target.value));
  byId('pdf-drop')       ?.addEventListener('click', () => byId('pdf-file-inp')?.click());
  bindImportModalInput();

  // Register Capacitor backButton listener to open sidebar instead of exiting on mobile
  try {
    App.addListener('backButton', () => {
      toggleSidebar();
    });
  } catch (e) {
    console.warn('Capacitor App backButton listener not registered:', e);
  }
}
function saveProviderCfg() {
  const aiProviderSel = document.getElementById('ai-provider-sel') as HTMLElement | null;
  const openrouterKeyInp = document.getElementById('openrouter-key-inp') as HTMLInputElement | null;
  const openrouterModelSel = document.getElementById('openrouter-model-sel') as HTMLElement | null;
  const geminiKeyInp = document.getElementById('gemini-key-inp') as HTMLInputElement | null;
  const geminiModelSel = document.getElementById('gemini-model-sel') as HTMLElement | null;

  S.aiProvider = (aiProviderSel?.dataset?.value || S.aiProvider).trim();
  S.openrouterKey = (openrouterKeyInp?.value || S.openrouterKey).trim();
  S.openrouterModel = (openrouterModelSel?.dataset?.value || S.openrouterModel).trim();
  S.geminiKey = (geminiKeyInp?.value || S.geminiKey).trim();
  S.geminiModel = (geminiModelSel?.dataset?.value || S.geminiModel).trim();

  localStorage.setItem('ftp-provider', S.aiProvider);
  localStorage.setItem('ftp-openrouterkey',  S.openrouterKey);
  localStorage.setItem('ftp-openrouter-model', S.openrouterModel);
  localStorage.setItem('ftp-geminikey',  S.geminiKey);
  localStorage.setItem('ftp-gemini-model', S.geminiModel);
  updateProviderUI();
}
 
function updateProviderUI() {
  const isOpenRouter = S.aiProvider === 'openrouter';
  const isGemini = S.aiProvider === 'gemini';
  const isNoAI = S.aiProvider === 'noai';
  const openrouterBox = document.getElementById('openrouter-key-box');
  const geminiBox = document.getElementById('gemini-key-box');
  const noaiBox = document.getElementById('noai-info-box');
  if (openrouterBox) openrouterBox.style.display = isOpenRouter ? 'block' : 'none';
  if (geminiBox) geminiBox.style.display = isGemini ? 'block' : 'none';
  if (noaiBox) noaiBox.style.display = isNoAI ? 'block' : 'none';
}
 
async function testOpenRouter() {
  if (!S.openrouterKey) { toast('Enter your OpenRouter API key first.'); return; }
  toast('Testing OpenRouter...');
  try {
    // Detect platform
    const isNative = typeof window !== 'undefined' && (window as any).Capacitor !== undefined;
    const url = isNative
      ? 'https://openrouter.ai/api/v1/chat/completions'
      : 'http://localhost:3000/openrouter/api/v1/chat/completions';
    
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.openrouterKey },
      body: JSON.stringify({ model: S.openrouterModel, messages: [{ role: 'user', content: 'Say OK' }], max_tokens: 5 })
    }, 10000);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    toast('✓ OpenRouter connected!');
  } catch(e) { toast('✗ OpenRouter error: ' + e.message); }
}

async function testGemini() {
  toast('Testing Gemini API...');
  try {
    const isNative = typeof window !== 'undefined' && (window as any).Capacitor !== undefined;
    const url = isNative
      ? 'http://localhost:3000/api/gemini/generate'
      : '/api/gemini/generate';
    
    const headers: any = { 'Content-Type': 'application/json' };
    if (S.geminiKey) {
      headers['Authorization'] = 'Bearer ' + S.geminiKey;
    }

    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: S.geminiModel || 'gemini-3.5-flash', prompt: 'Say OK', maxTokens: 5 })
    }, 12000);
    
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error((err.error?.message) || 'HTTP ' + resp.status);
    }
    const data = await resp.json();
    if (!data.text) throw new Error('Empty response from model');
    toast('✓ Gemini connected! Response: ' + data.text.trim());
  } catch(e) { 
    toast('✗ Gemini error: ' + e.message); 
  }
}


function toggleDropdown(optionsId: string) {
  const options = document.getElementById(optionsId);
  if (options) {
    const isShowing = options.style.display === 'block';
    
    // Close all custom dropdowns first
    document.querySelectorAll('.custom-dropdown-options').forEach(opt => {
      (opt as HTMLElement).style.display = 'none';
      const wrapper = opt.closest('.custom-dropdown');
      if (wrapper) wrapper.classList.remove('active');
      const card = opt.closest('.lib-deck-card');
      if (card) card.classList.remove('has-active-dropdown');
    });

    if (!isShowing) {
      options.style.display = 'block';
      const wrapper = options.closest('.custom-dropdown');
      if (wrapper) wrapper.classList.add('active');
      const card = options.closest('.lib-deck-card');
      if (card) card.classList.add('has-active-dropdown');
    }
  }
}

function selectDropdownOption(selectId: string, value: string, text: string) {
  const selected = document.getElementById(selectId + '-sel') || document.getElementById(selectId);
  if (selected) {
    selected.textContent = text;
    selected.dataset.value = value;
  }
  const options = document.getElementById(selectId + '-options');
  if (options) {
    options.style.display = 'none';
    const wrapper = options.closest('.custom-dropdown');
    if (wrapper) wrapper.classList.remove('active');
    const card = options.closest('.lib-deck-card');
    if (card) card.classList.remove('has-active-dropdown');
  }
  if (selectId === 'ai-provider' || selectId === 'openrouter-model' || selectId === 'gemini-model') {
    saveProviderCfg();
  }
}


// ─── ES module exports (auto-generated) ───
export { init, saveProviderCfg, selectDropdownOption, testGemini, testOpenRouter, toggleDropdown, updateProviderUI };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { init, saveProviderCfg, selectDropdownOption, testGemini, testOpenRouter, toggleDropdown, updateProviderUI });

function checkScheduledDecks() {
  const S = (window as any).S;
  if (!S || !S.decks) return;
  const today = new Date().toISOString().split('T')[0];
  const due = [];
  for (const id in S.decks) {
    const d = S.decks[id];
    if (d.scheduledDate && d.scheduledDate <= today) {
      due.push(d.name);
    }
  }
  if (due.length > 0) {
    alert(`Reminder: It's time to study the following scheduled decks:\n\n` + due.join('\n'));
  }
}
Object.assign(window, { checkScheduledDecks });
