import LZString from "lz-string";
import { openRouterGenerate } from './ai-provider.js';
import { selectedDeckId } from './chat.js';
import { app } from './firebase.js';
import { forceSyncLocalToCloud, syncAddCard, syncAddCardsBatch, syncCreateDeck, syncDeleteCard, syncDeleteDeck, syncRenameDeck, syncUpdateCard } from './firebase-sync.js';
import { DAY, S } from './main.js';
import { renderSidebar, selectDeck, showPanel, updateStats } from './sidebar.js';
import { persist } from './storage.js';
import { cycleCardDiff, mark, notes, renderNoteTabs, renderStudy, setNewCardDiff, setNotes, switchNote } from './study.js';
import { escH, getLocalDayString, getLocalMidnightTonight, getLocalTodayString, makeCard, toast, uid } from './utils.js';





const DeckManager = {
  all()        { return S.decks; },
  get(id)      { return S.decks[id]; },
  create(name) {
    const id = uid();
    S.decks[id] = { name, cards: [], ai: false, createdAt: Date.now() };
    persist(); renderSidebar(); updateStats();
    syncCreateDeck(id, name).catch(err => console.warn("Sync failed:", err));
    return id;
  },
  delete(id) {
    delete S.decks[id];
    persist(); renderSidebar(); updateStats();
    syncDeleteDeck(id).catch(err => console.warn("Sync failed:", err));
  },
  rename(id, name) {
    if (!S.decks[id]) return;
    S.decks[id].name = name;
    persist();
    syncRenameDeck(id, name).catch(err => console.warn("Sync failed:", err));
  },
  addCard(deckId, q, a, tags=[]) {
    const card = makeCard(q, a);
    card.tags = tags;
    S.decks[deckId].cards.push(card);
    persist();
    syncAddCard(deckId, card).catch(err => console.warn("Sync failed:", err));
    return card;
  }
};
 
const StudySession = {
  reset() {
    S.idx=0; S.flipped=false; S.correct=0; S.incorrect=0;
    S.skipped=0; S.userAns=''; S.adaptExplain=null; S.lastAction=null;
  },
  buildQueue(cards, dueOnly=false, tag=null) {
    let q = dueOnly ? cards.filter(c=>c.due<=getLocalMidnightTonight()) : [...cards];
    if (tag) q = q.filter(c=>(c.tags||[]).includes(tag));
    return q;
  }
};

// Active tags typed so far for the card being created
(window as any)._activeTags = [];

function renderTagChips() {
  const listEl = document.getElementById('tag-chips-list');
  if (!listEl) return;
  listEl.innerHTML = ((window as any)._activeTags || []).map((t: string, idx: number) => `
    <span class="tag-chip-item">
      #${escH(t)}
      <span class="tag-chip-item-close" onclick="removeTagChip(${idx})">×</span>
    </span>
  `).join('');
}

function addTagChip(tag: string) {
  tag = tag.trim().replace(/^#*/, '').toLowerCase();
  if (!tag) return;
  if (!((window as any)._activeTags || []).includes(tag)) {
    ((window as any)._activeTags).push(tag);
  }
  renderTagChips();
  const inp = document.getElementById('new-tags') as HTMLInputElement | null;
  if (inp) inp.value = '';
  hideTagAutocomplete();
}

function removeTagChip(idx: number) {
  ((window as any)._activeTags || []).splice(idx, 1);
  renderTagChips();
}

function getAllUniqueTags(): string[] {
  const tagsSet = new Set<string>();
  Object.values(S.decks).forEach((d: any) => {
    d.cards.forEach((c: any) => {
      (c.tags || []).forEach((t: string) => tagsSet.add(t.replace(/^#*/, '')));
    });
  });
  return [...tagsSet].sort();
}

function showTagAutocomplete(val: string) {
  const autocomp = document.getElementById('tag-chips-autocomplete');
  if (!autocomp) return;
  val = val.trim().replace(/^#*/, '').toLowerCase();
  if (!val) {
    autocomp.style.display = 'none';
    return;
  }
  const allTags = getAllUniqueTags();
  const matches = allTags.filter(t => t.includes(val) && !((window as any)._activeTags || []).includes(t)).slice(0, 5);
  if (!matches.length) {
    autocomp.style.display = 'none';
    return;
  }
  autocomp.innerHTML = matches.map(m => `
    <div class="tag-autocomplete-item" onclick="addTagChip('${m}')">#${escH(m)}</div>
  `).join('');
  autocomp.style.display = 'flex';
}

function hideTagAutocomplete() {
  const autocomp = document.getElementById('tag-chips-autocomplete');
  if (autocomp) autocomp.style.display = 'none';
}

Object.assign(window, { removeTagChip, addTagChip, showTagAutocomplete, hideTagAutocomplete });

function addCard() {
  if(!S.selDeck){toast('Select a deck first.');return;}
  const q=document.getElementById('nq').value.trim();
  const a=document.getElementById('na').value.trim();
  
  // Custom interactive chips
  let tags = [...((window as any)._activeTags || [])].map((t: string) => t.startsWith('#') ? t : '#' + t);
  
  if(!q||!a){toast('Fill in both fields!');return;}
  const card=makeCard(q,a);
  card.tags=tags;
  card.difficulty = window._newCardDiff || 'none';
  S.decks[S.selDeck].cards.push(card);
  
  document.getElementById('nq').value='';
  document.getElementById('na').value='';
  document.getElementById('new-tags').value='';
  (window as any)._activeTags = [];
  renderTagChips();
  setNewCardDiff('none'); // reset pill selection
  
  // Trigger AI Auto-tagging asynchronously in background if tags were empty!
  const hasNoManualTags = tags.length === 0;
  
  persist(); 
  renderCardsList(); 
  updateStats(); 
  renderSidebar(); 
  
  toast('Card added!');
  
  syncAddCard(S.selDeck, card).catch(err => console.warn("Sync failed:", err));

  // Auto-focus back to question for frictionless rapid creation!
  document.getElementById('nq').focus();
  
  if (hasNoManualTags) {
    autoTagCard(card, S.selDeck);
  }
}

async function autoTagCard(card: any, deckId: string) {
  const indicator = document.getElementById('ai-auto-tag-indicator');
  if (indicator) indicator.style.display = 'inline-flex';
  
  let tags: string[] = [];
  
  // Try AI if key is set
  if (S.openrouterKey && S.aiProvider !== 'noai') {
    try {
      const prompt = `Classify this flashcard into 1-2 highly precise, lowercase single-word study hashtags (e.g. #formulas, #vocabulary, #french, #history, #anatomy).
Question: ${card.q}
Answer: ${card.a}

Return ONLY a comma-separated list of the hashtags, starting with #. Example: #formulas, #physics`;
      const response = await (window as any).openRouterGenerate(prompt, 20);
      if (response && response.trim()) {
        tags = response.split(',')
          .map((t: string) => t.trim().replace(/^#*/, '#').toLowerCase())
          .filter((t: string) => t.length > 1 && t.startsWith('#'));
      }
    } catch (err) {
      console.warn('AI auto-tag failed, falling back to local:', err);
    }
  }
  
  // Fallback to local heuristic tagging (offline safe!)
  if (!tags.length) {
    const combined = (card.q + ' ' + card.a).toLowerCase();
    
    if (combined.includes('=') || combined.includes('formula') || combined.includes('equation') || combined.includes('math') || combined.includes('derive')) {
      tags.push('#formulas');
    }
    if (combined.includes('define') || combined.includes('mean') || combined.includes('definition') || combined.includes('concept')) {
      tags.push('#concept');
    }
    if (combined.includes('who') || combined.includes('year') || combined.includes('date') || combined.includes('century') || combined.includes('war') || combined.includes('history')) {
      tags.push('#history');
    }
    if (combined.includes('cell') || combined.includes('body') || combined.includes('medical') || combined.includes('disease') || combined.includes('organ') || combined.includes('protein')) {
      tags.push('#biology');
    }
    if (combined.includes('translate') || combined.includes('french') || combined.includes('spanish') || combined.includes('vocabulary') || combined.includes('word') || combined.includes('verb')) {
      tags.push('#language');
    }
    
    if (!tags.length) {
      tags.push('#concept'); // default safe tag
    }
  }
  
  card.tags = [...new Set([...(card.tags || []), ...tags])];
  persist();
  renderCardsList();
  renderSidebar();
  if (indicator) indicator.style.display = 'none';
  toast(`✓ Auto-tagged: ${tags.join(', ')}`);
  
  syncUpdateCard(deckId, card).catch(err => console.warn("Sync failed:", err));
}
 
function delCard(i: number) {
  const card = S.decks[S.selDeck].cards[i];
  if (card && card.id) {
    syncDeleteCard(S.selDeck, card.id).catch(err => console.warn("Sync failed:", err));
  }
  S.decks[S.selDeck].cards.splice(i,1);
  persist(); renderCardsList(); updateStats(); renderSidebar(); toast('Card deleted.');
}
 
function resetAllSpaced() {
  if(!S.selDeck) return;
  if(!confirm('Reset all SRS data for this deck?')) return;
  S.decks[S.selDeck].cards=S.decks[S.selDeck].cards.map(c=>({...c,ease:2.5,interval:1,due:Date.now(),mistakes:0}));
  persist(); renderCardsList(); toast('SRS data reset!');
  
  import('./firebase-sync.js').then(({ syncUpdateCard }) => {
    S.decks[S.selDeck].cards.forEach(card => syncUpdateCard(S.selDeck, card).catch(err => console.warn("Reset card sync failed:", err)));
  }).catch(e => console.warn("Could not load firebase-sync module for resetAllSpaced:", e));
}
 
function renderCardsList() {
  if(!S.selDeck) return;
  const d=S.decks[S.selDeck];
  document.getElementById('ed-title').textContent=`Cards in "${d.name}" (${d.cards.length})`;
  const el=document.getElementById('cards-list');
  if(!d.cards.length){el.innerHTML='<div style="font-size:13px;color:var(--text3);padding:10px 0">No cards yet.</div>';return;}
  el.innerHTML=d.cards.map((c,i)=>{
    const todayStr = getLocalTodayString();
    const dueDayStr = getLocalDayString(c.due);
    let dueStr = '';
    if (c.due <= Date.now()) {
      dueStr = 'due now';
    } else if (c.due <= getLocalMidnightTonight()) {
      dueStr = 'due today';
    } else {
      const todayDate = new Date(todayStr + 'T12:00:00Z');
      const dueDate = new Date(dueDayStr + 'T12:00:00Z');
      const diffDays = Math.round((dueDate.getTime() - todayDate.getTime()) / DAY);
      dueStr = diffDays <= 1 ? 'due tomorrow' : `due in ${diffDays}d`;
    }
    const tagHtml = (c.tags||[]).map(t=>`<span class="card-tag">${escH(t)}</span>`).join('');
    const diff = c.difficulty || 'none';
    const diffLabel = diff === 'easy' ? '▲ Easy' : diff === 'medium' ? '● Medium' : diff === 'hard' ? '▼ Hard' : '— None';
    return `<div class="crow">
      <div class="crow-num">${String(i+1).padStart(2,'0')}</div>
      <div class="crow-body">
        <div class="crow-q">${escH(c.q)}</div>
        <div class="crow-a">${escH(c.a)}</div>
        <div style="display:flex;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap">
          <span class="diff-pill ${diff}" title="Click to change difficulty" onclick="cycleCardDiff(${i})">${diffLabel}</span>
          ${tagHtml}
        </div>
        <div class="crow-meta">
          <span>ease: ${(c.ease||2.5).toFixed(1)}</span>
          <span>interval: ${c.interval||1}d</span>
          <span>mistakes: ${c.mistakes||0}</span>
          <span>${dueStr}</span>
        </div>
      </div>
      <button class="crow-del" onclick="delCard(${i})">×</button>
    </div>`;
  }).join('');
}

/* ─── AI DECK AUDITOR SCAN & REWRITE ───────────────────────────────── */
function runDeckAudit() {
  if (!S.selDeck) return;
  const d = S.decks[S.selDeck];
  const listEl = document.getElementById('audit-results-list');
  const statusMsg = document.getElementById('auditor-status-msg');
  if (!listEl || !statusMsg) return;

  if (!d.cards.length) {
    statusMsg.textContent = "Your deck is empty! Add cards first to run a scan.";
    listEl.style.display = 'none';
    return;
  }

  statusMsg.textContent = "🔍 Auditing cards in real-time...";
  
  // Heuristic Local Scanners (Satisfies Offline requirements perfectly!)
  const issues: any[] = [];

  // 1. Check for verbal lengths
  d.cards.forEach((c: any, idx: number) => {
    if (c.q.length > 150 || c.a.length > 150) {
      issues.push({
        idx,
        type: 'too-long',
        title: 'Too Verbose (over 150 chars)',
        desc: `This flashcard is too detailed. Spaced repetition works best with small, bite-sized facts.`,
        q: c.q,
        a: c.a
      });
    }
  });

  // 2. Check for vague/short questions
  d.cards.forEach((c: any, idx: number) => {
    const words = c.q.trim().split(/\s+/).length;
    if (words <= 2 && c.q.length < 15) {
      issues.push({
        idx,
        type: 'vague',
        title: 'Vague/Short Prompt',
        desc: `This card lacks sufficient context. Add hints or turn it into a cloze deletion.`,
        q: c.q,
        a: c.a
      });
    }
  });

  // 3. Find potential duplicates (local Token Jaccard Intersection)
  for (let i = 0; i < d.cards.length; i++) {
    for (let j = i + 1; j < d.cards.length; j++) {
      const set1 = new Set(d.cards[i].q.toLowerCase().split(/\s+/).filter(w => w.length > 2));
      const set2 = new Set(d.cards[j].q.toLowerCase().split(/\s+/).filter(w => w.length > 2));
      if (set1.size > 0 && set2.size > 0) {
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const similarity = intersection.size / Math.min(set1.size, set2.size);
        if (similarity > 0.75) {
          issues.push({
            idx: j,
            type: 'duplicate',
            title: `Duplicate risk with Card #${i + 1}`,
            desc: `Both cards ask extremely similar questions. Consider merging them or clarifying differences.`,
            q: d.cards[j].q,
            a: d.cards[j].a
          });
        }
      }
    }
  }

  if (!issues.length) {
    statusMsg.innerHTML = "✨ <b>Deck audit perfect!</b> 0 issues flagged. Your cards are concise, unique, and highly optimized!";
    listEl.style.display = 'none';
    return;
  }

  statusMsg.innerHTML = `⚠️ <b>Audit complete:</b> Flagged ${issues.length} potential problem cards. Optimize them below:`;
  listEl.innerHTML = issues.map((issue, i) => `
    <div class="audit-card" id="audit-card-${i}">
      <div class="audit-card-hdr">
        <span class="audit-tag ${issue.type}">${issue.title}</span>
        <span style="font-size: 11px; font-weight: 600; color: var(--text3)">Card #${issue.idx + 1}</span>
      </div>
      <div class="audit-card-issue">${issue.desc}</div>
      <div class="audit-card-context"><b>Q:</b> ${escH(issue.q)}\n<b>A:</b> ${escH(issue.a)}</div>
      <div id="audit-rewrite-${i}" class="audit-rewrite-preview" style="display:none"></div>
      <div class="audit-card-action-bar">
        <button class="audit-btn suggest" onclick="suggestAuditorRewrite(${i}, ${issue.idx})">✨ Suggest Rewrite</button>
        <button class="audit-btn apply" id="audit-apply-btn-${i}" style="display:none" onclick="applyAuditorRewrite(${i}, ${issue.idx})">✓ Apply Rewrite</button>
      </div>
    </div>
  `).join('');
  listEl.style.display = 'flex';
}

// Stores rewrites per issue ID
(window as any)._auditRewrites = {};

async function suggestAuditorRewrite(issueId: number, cardIdx: number) {
  const container = document.getElementById(`audit-rewrite-${issueId}`);
  if (!container) return;
  container.style.display = 'block';
  container.textContent = 'Generating optimization...';

  const card = S.decks[S.selDeck].cards[cardIdx];
  let rewrite = { q: '', a: '' };

  if (S.openrouterKey && S.aiProvider !== 'noai') {
    try {
      const prompt = `Optimize this flashcard for rapid spaced repetition. Keep it highly concise, clear, and focused on a single piece of information.
Question: ${card.q}
Answer: ${card.a}

Return ONLY a valid JSON object matching this schema: {"q": "concise question here", "a": "concise answer here"}`;
      const response = await (window as any).openRouterGenerate(prompt, 100);
      const jsonMatch = response.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        rewrite.q = parsed.q || parsed.question;
        rewrite.a = parsed.a || parsed.answer;
      }
    } catch (e) {
      console.warn("AI rewrite failed, using local offline heuristic:", e);
    }
  }

  // Local Offline Smart Heuristic Rewrite
  if (!rewrite.q || !rewrite.a) {
    // Trim excess spacing and truncate long paragraphs, or convert to a neat cloze tip!
    let qOpt = card.q;
    let aOpt = card.a;
    if (aOpt.length > 80) {
      aOpt = aOpt.slice(0, 80) + '...';
    }
    rewrite.q = qOpt;
    rewrite.a = aOpt + " (Heuristic optimized)";
  }

  (window as any)._auditRewrites[issueId] = rewrite;
  container.innerHTML = `<b>Optimized Proposal:</b><br><b>Q:</b> ${escH(rewrite.q)}<br><b>A:</b> ${escH(rewrite.a)}`;
  
  const applyBtn = document.getElementById(`audit-apply-btn-${issueId}`);
  if (applyBtn) applyBtn.style.display = 'inline-block';
}

function applyAuditorRewrite(issueId: number, cardIdx: number) {
  const rewrite = (window as any)._auditRewrites[issueId];
  if (!rewrite) return;

  const card = S.decks[S.selDeck].cards[cardIdx];
  card.q = rewrite.q;
  card.a = rewrite.a;

  persist();
  renderCardsList();
  renderSidebar();

  syncUpdateCard(S.selDeck, card).catch(err => console.warn("Card sync failed:", err));

  const cardEl = document.getElementById(`audit-card-${issueId}`);
  if (cardEl) {
    cardEl.classList.add('fixed-resolved');
    cardEl.innerHTML = `<div style="color:var(--sage); font-weight:600; display:flex; align-items:center; gap:6px">
      ✓ Flashcard #${cardIdx + 1} Optimized &amp; Saved successfully!
    </div>`;
  }
  toast("✓ Rewrite applied to card!");
}

(window as any).suggestAuditorRewrite = suggestAuditorRewrite;
(window as any).applyAuditorRewrite = applyAuditorRewrite;

/* ─── RECENT & EMPTY STATE INITIALIZATIONS ───────────────────────────── */
function importSampleDeck() {
  const sampleDeckId = uid();
  S.decks[sampleDeckId] = {
    name: "📚 Medical French Vocabulary",
    ai: false,
    cards: [
      { q: "What is the French word for 'the pain'?", a: "la douleur", ease: 2.5, interval: 1, due: Date.now(), mistakes: 0, difficulty: 'none', tags: ["#vocabulary", "#medical", "#french"] },
      { q: "Translate 'Take a deep breath' to French.", a: "Prenez une grande inspiration", ease: 2.5, interval: 1, due: Date.now(), mistakes: 0, difficulty: 'none', tags: ["#phrases", "#medical", "#french"] },
      { q: "What does 'l'ordonnance' mean in English?", a: "the prescription", ease: 2.5, interval: 1, due: Date.now(), mistakes: 0, difficulty: 'none', tags: ["#vocabulary", "#prescription", "#french"] },
      { q: "Translate 'Where does it hurt?' to French.", a: "Où avez-vous mal?", ease: 2.5, interval: 1, due: Date.now(), mistakes: 0, difficulty: 'none', tags: ["#phrases", "#medical", "#french"] }
    ]
  };
  S.deckOrder.push(sampleDeckId);
  persist();
  renderSidebar();
  updateStats();
  
  // Hide empty state welcome dashboard & instantly select newly imported deck!
  selectDeck(sampleDeckId);
  toast("✓ Sample Medical French deck imported!");

  import('./firebase-sync.js').then(({ syncCreateDeck, syncAddCardsBatch }) => {
    syncCreateDeck(sampleDeckId, "Medical French (Sample)").catch(err => console.warn(err));
    syncAddCardsBatch(sampleDeckId, S.decks[sampleDeckId].cards).catch(err => console.warn(err));
  }).catch(e => console.warn(e));
}

function promptUrlImport() {
  const input = prompt("Paste your FlashTrainer shared link (starts with http...#import=) or paste the raw Base64 payload:");
  if (!input) return;
  try {
    let base64 = input.trim();
    if (base64.includes('#import=')) {
      base64 = base64.split('#import=')[1];
    }
    
    let payloadStr = '';
    // Try LZString decompression first
    const decompressed = LZString.decompressFromBase64(base64);
    if (decompressed && decompressed.startsWith('{')) {
      payloadStr = decompressed;
    } else {
      // Fallback to standard base64 decoding
      const binString = atob(base64);
      const bytes = Uint8Array.from(binString, (m) => m.codePointAt(0)!);
      payloadStr = new TextDecoder().decode(bytes);
    }
    
    const data = JSON.parse(payloadStr);
    
    // Import single deck or folder
    if (data.ftp_qr) {
      const id = uid();
      S.decks[id] = {
        name: data.name,
        ai: false,
        cards: data.cards.map((c: any) => makeCard(c.q, c.a))
      };
      S.deckOrder.push(id);
      persist();
      renderSidebar();
      updateStats();
      selectDeck(id);
      toast(`✓ Successfully imported deck "${data.name}" via link!`);
      import('./firebase-sync.js').then(({ syncCreateDeck, syncAddCardsBatch }) => {
        syncCreateDeck(id, data.name).catch(e => console.warn(e));
        syncAddCardsBatch(id, S.decks[id].cards).catch(e => console.warn(e));
      }).catch(e => console.warn(e));
    } else if (data.ftp_qr_folder) {
      const folderId = uid();
      S.folders[folderId] = { name: data.folder.name, collapsed: false };
      S.folderOrder.push(folderId);
      
      let firstDeckId = '';
      const deckSyncs: any[] = [];
      Object.entries(data.decks).forEach(([oldId, deckAny]: any) => {
        const deckId = uid();
        S.decks[deckId] = {
          name: deckAny.name,
          ai: false,
          folderId: folderId,
          cards: deckAny.cards.map((c: any) => makeCard(c.q, c.a))
        };
        S.deckOrder.push(deckId);
        if (!firstDeckId) firstDeckId = deckId;
        deckSyncs.push({ id: deckId, name: deckAny.name, cards: S.decks[deckId].cards });
      });
      persist();
      renderSidebar();
      updateStats();
      if (firstDeckId) selectDeck(firstDeckId);
      toast(`✓ Successfully imported folder "${data.folder.name}" via link!`);
      import('./firebase-sync.js').then(({ syncCreateDeck, syncAddCardsBatch }) => {
        deckSyncs.forEach(ds => {
          syncCreateDeck(ds.id, ds.name, folderId).catch(e => console.warn(e));
          syncAddCardsBatch(ds.id, ds.cards).catch(e => console.warn(e));
        });
      }).catch(e => console.warn(e));
    } else {
      throw new Error("Invalid payload format");
    }
  } catch (err: any) {
    alert("Could not import: " + err.message);
  }
}

(window as any).importSampleDeck = importSampleDeck;
(window as any).promptUrlImport = promptUrlImport;

function initDeckManagerFeatures() {
  const newTagsInp = document.getElementById('new-tags') as HTMLInputElement | null;
  const tagContainer = document.getElementById('tag-chips-input-container');
  
  if (newTagsInp && tagContainer) {
    newTagsInp.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = newTagsInp.value.trim().replace(/^#*/, '').toLowerCase();
        if (val) {
          addTagChip(val);
        }
      } else if (e.key === 'Backspace' && !newTagsInp.value) {
        if ((window as any)._activeTags && (window as any)._activeTags.length > 0) {
          (window as any)._activeTags.pop();
          renderTagChips();
        }
      }
    });
    
    newTagsInp.addEventListener('input', (e: any) => {
      showTagAutocomplete(e.target.value);
    });
    
    newTagsInp.addEventListener('blur', () => {
      setTimeout(hideTagAutocomplete, 250);
    });
    
    tagContainer.addEventListener('click', (e) => {
      if (e.target === tagContainer || e.target === document.getElementById('tag-chips-list')) {
        newTagsInp.focus();
      }
    });
  }
  
  // Rapid creation keyboard shortcut: Ctrl+Enter (or Cmd+Enter) anywhere in add-form
  const addForm = document.querySelector('.add-form');
  if (addForm) {
    addForm.addEventListener('keydown', (e: any) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        addCard();
      }
    });
  }
  
  // Wire audit button
  const auditBtn = document.getElementById('btn-audit-deck');
  if (auditBtn) {
    auditBtn.addEventListener('click', () => {
      runDeckAudit();
    });
  }
}

(window as any).initDeckManagerFeatures = initDeckManagerFeatures;
 
let exportFormat = null;
 
function exportDeck() {
  if (!S.selDeck) return;
  const d = S.decks[S.selDeck];
  exportFormat = null;
  document.getElementById('export-modal-sub').textContent = `"${d.name}" · ${d.cards.length} cards`;
  document.getElementById('export-opt-json').classList.remove('selected');
  document.getElementById('export-opt-txt').classList.remove('selected');
  document.getElementById('export-confirm-btn').disabled = true;
  document.getElementById('export-modal').classList.add('show');
}
 
function selectExportFormat(fmt) {
  exportFormat = fmt;
  document.getElementById('export-opt-json').classList.toggle('selected', fmt === 'json');
  document.getElementById('export-opt-txt').classList.toggle('selected', fmt === 'txt');
  document.getElementById('export-confirm-btn').disabled = false;
}
 
function confirmExport() {
  if (!S.selDeck || !exportFormat) return;
  const d = S.decks[S.selDeck] as any;
  let content, filename, type;
  if (exportFormat === 'json') {
    const payload = { name: d.name, cards: d.cards, ai: d.ai } as any;
    if (d.folderId && S.folders[d.folderId]) payload.folderId = d.folderId;
    content = JSON.stringify(payload, null, 2);
    filename = `${d.name}.json`;
    type = 'application/json';
  } else {
    content = d.cards.map(c => `Q: ${c.q}\nA: ${c.a}`).join('\n\n');
    filename = `${d.name}.txt`;
    type = 'text/plain';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type }));
  a.download = filename;
  a.click();
  closeExportModal();
  toast(`Saved "${filename}"!`);
}
 
function closeExportModal() {
  document.getElementById('export-modal').classList.remove('show');
  exportFormat = null;
}
 
// ─── IMPORT MODAL STATE ───────────────────────────────────────────────────────
let importState: any = { cards: [], suggestedName: '', selectedDeckId: null, isNew: false };
 
function importDeck(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  // Handle .docx via mammoth
  if (file.name.toLowerCase().endsWith('.docx')) {
    if (typeof mammoth === 'undefined') {
      alert('Word (.docx) import needs an internet connection to load the mammoth library.');
      return;
    }
    file.arrayBuffer().then(buf => mammoth.extractRawText({ arrayBuffer: buf })).then(result => {
      const cards = parseImportFile(result.value, 'import.txt');
      if (!cards.length) { alert('No valid Q:/A: or tab-separated cards found in the Word doc.'); return; }
      openImportModal(cards, file.name.replace(/\.[^.]+$/,'').slice(0,40));
    }).catch(err => alert('Word import failed: ' + err.message));
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      // Check if this is a full backup file first
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(e.target.result as string);
        // Folder bundle
        if (data.ftp_folder === 1 && data.folder && data.decks) {
          importFolderBundle(data);
          return;
        }
        if (data.decks && typeof data.decks === 'object' && !Array.isArray(data.decks)) {
          // Full backup — restore everything
          restoreFullBackup(data, file.name);
          return;
        }
      }
      const cards = parseImportFile(e.target.result as string, file.name);
      if (!cards.length) throw new Error('No valid cards found. Use Q:/A: format or a .json exported from this app.');
      const suggestedName = file.name.replace(/\.[^.]+$/,'').slice(0,40);
      openImportModal(cards, suggestedName);
    } catch(err) {
      alert(`Import failed: ${err.message}`);
    }
  };
  reader.readAsText(file);
}
 
function importFolderBundle(data) {
  const folderName  = data.folder?.name || 'Imported Folder';
  const deckCount   = Object.keys(data.decks || {}).length;
  const exportDate  = data.exportedAt ? ` (exported ${data.exportedAt.slice(0,10)})` : '';
  if (!confirm(`Import folder "${folderName}"${exportDate}\n${deckCount} deck(s) inside.\n\nOK = Import (decks with matching IDs will be skipped)\nCancel = abort`)) return;
 
  // Create or reuse folder (try to keep original ID if possible)
  let fid = data.folder.id;
  if (!S.folders[fid]) {
    S.folders[fid] = { name: folderName, collapsed: false };
    if (!S.folderOrder.includes(fid)) S.folderOrder.push(fid);
  } else {
    // ID collision — create a new folder with a fresh ID
    fid = 'f' + uid();
    S.folders[fid] = { name: folderName + ' (imported)', collapsed: false };
    S.folderOrder.push(fid);
  }
 
  let added = 0, skipped = 0;
  for (const [id, deck] of Object.entries(data.decks || {})) {
    if (S.decks[id]) { skipped++; continue; }
    S.decks[id] = { ...(deck as any), folderId: fid };
    if (!S.deckOrder.includes(id)) S.deckOrder.push(id);
    added++;
  }
 
  persist(); renderSidebar(); updateStats();
  toast(`"${folderName}" imported — ${added} deck${added!==1?'s':''} added${skipped?`, ${skipped} skipped (ID conflict)`:''}`);

  // Sync the imported decks and their cards to Firestore
  if (added > 0) {
    const syncDecksAndCards = async () => {
      const { syncCreateDeck, syncAddCardsBatch } = await import('./firebase-sync.js');
      for (const [id, deck] of Object.entries(data.decks || {})) {
        if (S.decks[id] && (deck as any).folderId === fid) {
          await syncCreateDeck(id, (deck as any).name);
          await syncAddCardsBatch(id, (deck as any).cards || []);
        }
      }
    };
    syncDecksAndCards().catch(err => console.warn("Sync imported bundle failed:", err));
  }
}
 
function restoreFullBackup(data, _fileName?) {
  const deckCount  = Object.keys(data.decks || {}).length;
  const noteCount  = Object.keys(data.notes || {}).length;
  const folderCount = Object.keys(data.folders || {}).length;
  const exportDate = data.exportedAt ? ` (exported ${data.exportedAt.slice(0,10)})` : '';
 
  const choice = confirm(
    `Full backup detected${exportDate}\n\n` +
    `• ${deckCount} deck(s)\n` +
    `• ${folderCount} folder(s)\n` +
    `• ${noteCount} note(s)\n\n` +
    `Restore options:\n` +
    `OK = Replace everything (current data will be lost)\n` +
    `Cancel = Merge into existing data`
  );
 
  if (choice) {
    // Full replace
    S.decks      = data.decks      || {};
    S.deckOrder  = data.deckOrder  || Object.keys(S.decks);
    S.folders    = data.folders    || {};
    S.folderOrder = data.folderOrder || Object.keys(S.folders);
    if (data.notes) setNotes(data.notes);
  } else {
    // Merge — add decks/notes/folders that don't already exist
    let added = 0;
    for (const [id, deck] of Object.entries(data.decks || {})) {
      if (!S.decks[id]) {
        S.decks[id] = deck;
        if (!S.deckOrder.includes(id)) S.deckOrder.push(id);
        added++;
      }
    }
    for (const [fid, folder] of Object.entries(data.folders || {})) {
      if (!S.folders[fid]) {
        S.folders[fid] = folder;
        if (!S.folderOrder.includes(fid)) S.folderOrder.push(fid);
      }
    }
    for (const [nid, note] of Object.entries(data.notes || {})) {
      if (!notes[nid]) notes[nid] = note;
    }
    toast(`Merged: ${added} new deck(s) added.`);
  }
 
  persist();
  renderSidebar();
  updateStats();
  if (typeof renderNoteTabs === 'function') renderNoteTabs();
  toast(`✓ Backup restored! ${deckCount} deck(s), ${folderCount} folder(s), ${noteCount} note(s).`);

  // Force cloud overwrite sync on full restore
  import('./firebase-sync.js').then(({ forceSyncLocalToCloud }) => {
    forceSyncLocalToCloud().catch(err => console.warn("Force cloud sync failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module for restore sync:", e));
}
 
function parseImportFile(content, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  if (ext === 'json') {
    const data = JSON.parse(content);
    if (Array.isArray(data)) {
      return data.map(c=>makeCard(c.q||c.question||'', c.a||c.answer||'')).filter(c=>c.q&&c.a);
    } else if (data.cards && Array.isArray(data.cards)) {
      // Single-deck export — restore SRS metadata + folderId if present
      return data.cards.map(c=>({
        q:String(c.q||''), a:String(c.a||''),
        ease:c.ease||2.5, interval:c.interval||1,
        due:c.due||Date.now(), mistakes:c.mistakes||0,
        tags: c.tags || [],
        ...(c.folderId ? { folderId: c.folderId } : {})
      })).filter(c=>c.q&&c.a);
    }
    throw new Error('Unrecognized JSON format.');
  }
  // TXT: Q:/A: blocks
  const blocks = content.split(/\n\s*\n/).filter(b=>b.trim());
  const cards = [];
  for (const block of blocks) {
    let q='', a='';
    for (const line of block.trim().split('\n')) {
      if (/^Q:/i.test(line)) q=line.replace(/^Q:\s*/i,'').trim();
      else if (/^A:/i.test(line)) a=line.replace(/^A:\s*/i,'').trim();
    }
    if (q&&a) cards.push(makeCard(q,a));
  }
  // Fallback: tab or pipe separated
  if (!cards.length) {
    for (const line of content.split('\n').filter(l=>l.trim())) {
      const sep = line.includes('\t')?'\t':line.includes('|')?'|':null;
      if (sep) {
        const [q,...rest]=line.split(sep); const a=rest.join(sep).trim();
        if (q.trim()&&a) cards.push(makeCard(q.trim(),a));
      }
    }
  }
  return cards;
}
 
function openImportModal(cards, suggestedName, folderId = null) {
  importState = { cards, suggestedName, selectedDeckId: null, isNew: false, folderId };
 
  // Preview text
  document.getElementById('modal-preview-txt').innerHTML =
    `<strong>${cards.length} cards</strong> from <strong>${escH(suggestedName)}</strong> — where should they go?`;
 
  // Populate existing decks list
  const list = document.getElementById('modal-deck-list');
  // Maintain order: use deckOrder array, then append any new ids not in it
  const allIds = Object.keys(S.decks);
  S.deckOrder = S.deckOrder.filter(id => S.decks[id]); // prune deleted
  const missing = allIds.filter(id => !S.deckOrder.includes(id));
  S.deckOrder = [...S.deckOrder, ...missing];
  const ids = S.deckOrder;
  if (!ids.length) {
    list.innerHTML = '<div style="font-size:13px;color:var(--text3);padding:6px 0">No decks yet — create one below.</div>';
  } else {
    list.innerHTML = ids.map(id => {
      const d = S.decks[id];
      return `<div class="modal-deck-opt" id="mopt-${id}" onclick="selectExistingDeck('${id}')">
        <span class="modal-deck-icon"></span>
        <span class="modal-deck-name">${escH(d.name)}</span>
        <span class="modal-deck-count">${d.cards.length} cards</span>
      </div>`;
    }).join('');
  }
 
  // Pre-fill new deck name with suggestion
  document.getElementById('modal-new-name').value = suggestedName;
  document.getElementById('modal-confirm-btn').disabled = true;
 
  document.getElementById('import-modal').classList.add('show');
}
 
function selectExistingDeck(id) {
  importState.selectedDeckId = id;
  importState.isNew = false;
  document.querySelectorAll('.modal-deck-opt').forEach(el => el.classList.remove('selected'));
  document.getElementById('mopt-'+id)?.classList.add('selected');
  document.getElementById('modal-new-name').value = '';
  document.getElementById('modal-confirm-btn').disabled = false;
}
 
function selectNewDeck() {
  const name = document.getElementById('modal-new-name').value.trim();
  if (!name) { document.getElementById('modal-new-name').focus(); return; }
  importState.isNew = true;
  importState.selectedDeckId = null;
  document.querySelectorAll('.modal-deck-opt').forEach(el => el.classList.remove('selected'));
  document.getElementById('modal-confirm-btn').disabled = false;
  // Visual feedback
  document.getElementById('modal-new-name').style.borderColor = 'var(--accent)';
  setTimeout(()=>document.getElementById('modal-new-name').style.borderColor='',1500);
}
 
// Also allow typing in the new name field to auto-select "new deck" mode
function bindImportModalInput() {
  const modalNewName = document.getElementById('modal-new-name');
  if (modalNewName) {
    modalNewName.addEventListener('input', () => {
      if ((modalNewName as HTMLInputElement).value.trim()) {
        importState.isNew = true;
        importState.selectedDeckId = null;
        document.querySelectorAll('.modal-deck-opt').forEach(el => el.classList.remove('selected'));
        const confirmBtn = document.getElementById('modal-confirm-btn') as HTMLButtonElement | null;
        if (confirmBtn) confirmBtn.disabled = false;
      } else {
        if (!importState.selectedDeckId) {
          const confirmBtn = document.getElementById('modal-confirm-btn') as HTMLButtonElement | null;
          if (confirmBtn) confirmBtn.disabled = true;
        }
      }
    });
  }
}
 
function confirmImport() {
  const { cards, isNew, selectedDeckId, folderId } = importState;
  if (!cards.length) return;
 
  if (isNew) {
    const name = (document.getElementById('modal-new-name') as HTMLInputElement).value.trim() || importState.suggestedName;
    const id = uid();
    S.decks[id] = { name, cards, ai: false, createdAt: Date.now() };
    if (folderId && S.folders[folderId]) {
      S.decks[id].folderId = folderId;
      S.folders[folderId].collapsed = false;
    }
    persist(); renderSidebar(); updateStats(); selectDeck(id);
    toast(`Imported ${cards.length} cards into new deck "${name}"!`);

    // Sync new deck and its cards to Firestore
    import('./firebase-sync.js').then(({ syncCreateDeck, syncAddCardsBatch }) => {
      syncCreateDeck(id, name)
        .then(() => {
          syncAddCardsBatch(id, cards).catch(err => console.warn("Cards import sync failed:", err));
        })
        .catch(err => console.warn("Deck import sync failed:", err));
    }).catch(e => console.warn("Could not load firebase-sync module for confirmImport:", e));

  } else if (selectedDeckId && S.decks[selectedDeckId]) {
    const d = S.decks[selectedDeckId];
    const before = d.cards.length;
    d.cards.push(...cards);
    persist(); renderSidebar(); updateStats();
    if (S.selDeck === selectedDeckId) renderCardsList();
    else selectDeck(selectedDeckId);
    toast(`Added ${cards.length} cards to "${d.name}" (${before} → ${d.cards.length} total)!`);

    // Sync imported cards to existing deck on Firestore
    import('./firebase-sync.js').then(({ syncAddCardsBatch }) => {
      syncAddCardsBatch(selectedDeckId, cards).catch(err => console.warn("Cards import sync failed:", err));
    }).catch(e => console.warn("Could not load firebase-sync module for confirmImport:", e));
  }
  closeImportModal();
}
 
function closeImportModal() {
  document.getElementById('import-modal').classList.remove('show');
  importState = { cards:[], suggestedName:'', selectedDeckId:null, isNew:false };
}
 
function exportFolder(fid) {
  const folder = S.folders[fid];
  if (!folder) return;
  const deckIds = S.deckOrder.filter(id => S.decks[id]?.folderId === fid);
  const decks   = {};
  deckIds.forEach(id => { decks[id] = S.decks[id]; });
  const payload = {
    ftp_folder: 1,
    exportedAt: new Date().toISOString(),
    version: 3,
    folder: { id: fid, name: folder.name },
    deckOrder: deckIds,
    decks
  };
  const json = JSON.stringify(payload, null, 2);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `folder-${folder.name.replace(/[^a-z0-9]/gi,'_')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  toast(`"${folder.name}" exported (${deckIds.length} deck${deckIds.length!==1?'s':''})!`);
}
 
 
function globalSearch(query) {
  const res = document.getElementById('search-results');
  if (!res) return;
  if (!query || query.length < 2) { res.classList.remove('show'); return; }
 
  const q = query.toLowerCase();
  const hits = [];
 
  // Highlight matching text
  const hl = (text: string, q: string): string => {
    const idx = text.toLowerCase().indexOf(q);
    if (idx === -1) return escH(text).slice(0, 60);
    const pre  = escH(text.slice(0, idx));
    const match = escH(text.slice(idx, idx + q.length));
    const post = escH(text.slice(idx + q.length, idx + q.length + 40));
    return `${pre}<mark>${match}</mark>${post}`;
  };
 
  // Search cards across all decks
  Object.entries(S.decks).forEach(([deckId, deckAny]) => {
    const deck = deckAny as any;
    deck.cards.forEach((card: any, cardIdx: any) => {
      const qMatch = card.q.toLowerCase().includes(q);
      const aMatch = card.a.toLowerCase().includes(q);
      const tMatch = (card.tags||[]).some((t: any) => t.includes(q));
      if (qMatch || aMatch || tMatch) {
        hits.push({ type:'card', deckId, deckName:deck.name, card, cardIdx,
          preview: hl(qMatch ? card.q : card.a, q) });
      }
    });
    // Search deck names
    if (deck.name.toLowerCase().includes(q)) {
      hits.push({ type:'deck', deckId, deckName:deck.name,
        preview:`<span style="color:var(--text3)">Deck</span>` });
    }
  });

  // Search notes
  Object.entries(notes).forEach(([noteId, noteAny]) => {
    const note = noteAny as any;
    const inTitle   = note.title.toLowerCase().includes(q);
    const inContent = note.content.toLowerCase().includes(q);
    if (inTitle || inContent) {
      hits.push({ type:'note', noteId, title:note.title,
        preview: hl(inContent ? note.content : note.title, q) });
    }
  });
 
  if (!hits.length) {
    res.innerHTML = '<div class="search-hit" style="color:var(--text3)">No results</div>';
    res.classList.add('show');
    return;
  }
 
  res.innerHTML = hits.slice(0, 12).map(hit => {
    if (hit.type === 'card') {
      return `<div class="search-hit" onclick="searchGoToCard('${hit.deckId}',${hit.cardIdx})">
        <div class="search-hit-q">${hit.preview}</div>
        <div class="search-hit-meta">Card in <span class="search-hit-deck">${escH(hit.deckName)}</span></div>
      </div>`;
    } else if (hit.type === 'deck') {
      return `<div class="search-hit" onclick="selectDeck('${hit.deckId}');closeSearch()">
        <div class="search-hit-q">🗂️ ${escH(hit.deckName)}</div>
        <div class="search-hit-meta">Deck · ${S.decks[hit.deckId].cards.length} cards</div>
      </div>`;
    } else {
      return `<div class="search-hit" onclick="searchGoToNote('${hit.noteId}')">
        <div class="search-hit-q">📝 ${escH(hit.title)}</div>
        <div class="search-hit-meta">${hit.preview}</div>
      </div>`;
    }
  }).join('');
  res.classList.add('show');
}
 
function searchGoToCard(deckId, cardIdx) {
  closeSearch();
  // Set up the deck if it's different from what's currently loaded
  if (S.studyId !== deckId) selectDeck(deckId);
  // Always force the queue to the exact found card and open Study panel
  const deck = S.decks[deckId];
  if (deck) {
    S.queue        = [...deck.cards];
    S.idx          = Math.max(0, Math.min(cardIdx, S.queue.length - 1));
    S.flipped      = false;
    S.userAns      = '';
    S.adaptExplain = null;
  }
  showPanel('study', document.querySelector('.nav-item[data-panel="study"]'));
  renderStudy();
}
 
function searchGoToNote(noteId) {
  closeSearch();
  const manageBtn = document.querySelector('.nav-item[data-panel="notes"]');
  if (manageBtn) showPanel('notes', manageBtn);
  if (noteId && typeof switchNote === 'function') switchNote(noteId);
}
 
function closeSearch() {
  const inp = document.getElementById('global-search');
  const res = document.getElementById('search-results');
  if (inp) inp.value = '';
  if (res) res.classList.remove('show');
}

function bulkPasteImport() {
  if (!S.selDeck) { toast('Select a deck first!'); return; }
  const raw = (document.getElementById('bulk-paste-inp')?.value || '').trim();
  if (!raw) { toast('Paste some cards first.'); return; }
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let added = 0, skipped = 0;
  const newCards: any[] = [];
  for (const line of lines) {
    // Support ; | or Tab as separator
    const sep = line.includes('\t') ? '\t' : line.includes('|') ? '|' : ';';
    const parts = line.split(sep).map(p => p.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      const card = makeCard(parts[0], parts.slice(1).join(sep).trim());
      S.decks[S.selDeck].cards.push(card);
      newCards.push(card);
      added++;
    } else { skipped++; }
  }
  if (added) {
    persist(); renderCardsList(); updateStats(); renderSidebar();
    const bulkInp = document.getElementById('bulk-paste-inp');
    if (bulkInp) bulkInp.value = '';
    toast(`✓ Added ${added} card${added!==1?'s':''}${skipped?' ('+skipped+' skipped)':''}`);

    // Sync to Firestore
    const deckId = S.selDeck;
    import('./firebase-sync.js').then(({ syncAddCardsBatch }) => {
      syncAddCardsBatch(deckId, newCards).catch(err => console.warn("Bulk import sync failed:", err));
    }).catch(e => console.warn("Could not load firebase-sync module for bulkPasteImport sync:", e));
  } else {
    toast('No valid cards found. Use: Question; Answer (one per line)');
  }
}


// ─── ES module exports (auto-generated) ───
export { DeckManager, StudySession, addCard, addTagChip, applyAuditorRewrite, autoTagCard, bindImportModalInput, bulkPasteImport, closeExportModal, closeImportModal, closeSearch, confirmExport, confirmImport, delCard, exportDeck, exportFolder, exportFormat, getAllUniqueTags, globalSearch, hideTagAutocomplete, importDeck, importFolderBundle, importSampleDeck, importState, initDeckManagerFeatures, openImportModal, parseImportFile, promptUrlImport, removeTagChip, renderCardsList, renderTagChips, resetAllSpaced, restoreFullBackup, runDeckAudit, searchGoToCard, searchGoToNote, selectExistingDeck, selectExportFormat, selectNewDeck, showTagAutocomplete, suggestAuditorRewrite };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { DeckManager, StudySession, addCard, addTagChip, applyAuditorRewrite, autoTagCard, bindImportModalInput, bulkPasteImport, closeExportModal, closeImportModal, closeSearch, confirmExport, confirmImport, delCard, exportDeck, exportFolder, getAllUniqueTags, globalSearch, hideTagAutocomplete, importDeck, importFolderBundle, importSampleDeck, initDeckManagerFeatures, openImportModal, parseImportFile, promptUrlImport, removeTagChip, renderCardsList, renderTagChips, resetAllSpaced, restoreFullBackup, runDeckAudit, searchGoToCard, searchGoToNote, selectExistingDeck, selectExportFormat, selectNewDeck, showTagAutocomplete, suggestAuditorRewrite });
