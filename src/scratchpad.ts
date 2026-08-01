import { closeSearch, globalSearch, searchGoToCard, searchGoToNote } from './deck-manager.js';
import { init } from './init.js';
import { S } from './main.js';
import { mark, notes } from './study.js';
import { debounce, escH } from './utils.js';




const Scratch = (() => {
  let canvas, ctx, drawing = false, brushSize = 4, erasing = false;
  let color = '#3D7A5F';
  let lastX = 0, lastY = 0;

  function init() {
    canvas = document.getElementById('scratchpad');
    if (!canvas) return;
    canvas.width  = canvas.offsetWidth  || 600;
    canvas.height = canvas.offsetHeight || 160;
    ctx = canvas.getContext('2d');
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    // Initialize with computed CSS accent color if valid
    const colInp = document.getElementById('scratch-color') as HTMLInputElement | null;
    const computedColor = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    if (computedColor && /^#[0-9a-fA-F]{6}$/.test(computedColor)) {
      color = computedColor;
      if (colInp) colInp.value = computedColor;
    }

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', draw);
    canvas.addEventListener('pointerup',   stop);
    canvas.addEventListener('pointerout',  stop);

    document.getElementById('scratch-clear')?.addEventListener('click', clear);
    document.getElementById('scratch-color')?.addEventListener('input', e => {
      color = e.target.value; erasing = false;
      document.getElementById('scratch-eraser')?.classList.remove('active');
    });
    document.getElementById('scratch-size')?.addEventListener('change', e => {
      brushSize = parseInt(e.target.value);
    });
    document.getElementById('scratch-eraser')?.addEventListener('click', () => {
      erasing = !erasing;
      document.getElementById('scratch-eraser')?.classList.toggle('active', erasing);
    });
    document.getElementById('scratch-toggle')?.addEventListener('click', () => {
      const wrap = document.getElementById('scratchpad-wrap');
      const visible = wrap.classList.toggle('show');
      document.getElementById('scratch-toggle').textContent = visible ? 'Hide' : 'Show';
      if (visible) resize();
    });

    // Re-sync canvas dimensions on resize/orientation change
    // (mobile URL bar hide/show or device rotation desync touch coords otherwise)
    window.addEventListener('resize', () => {
      if (document.getElementById('scratchpad-wrap')?.classList.contains('show')) resize();
    });
  }

  function resize() {
    if (!canvas) return;
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight || 160;
    const img = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
    canvas.width  = w;
    canvas.height = h;
    if (img) ctx.putImageData(img, 0, 0);
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';
  }

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return { x: (src.clientX - rect.left) * scaleX, y: (src.clientY - rect.top) * scaleY };
  }

  function getCanvasBg() {
    if (!canvas) return '#ffffff';
    return window.getComputedStyle(canvas).backgroundColor || '#ffffff';
  }

  function start(e) {
    drawing = true;
    const p = getPos(e); lastX = p.x; lastY = p.y;
    
    // Stylus pressure detection
    const pressure = e.pressure !== undefined && e.pressure > 0 ? e.pressure : 0.5;
    const currentSize = (erasing ? brushSize * 3.5 : brushSize) * (0.4 + pressure * 1.2);
    
    ctx.beginPath();
    if (erasing) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.arc(p.x, p.y, currentSize / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.arc(p.x, p.y, currentSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }
    e.preventDefault();
  }

  function draw(e) {
    if (!drawing) return;
    const p = getPos(e);
    
    const pressure = e.pressure !== undefined && e.pressure > 0 ? e.pressure : 0.5;
    const currentSize = (erasing ? brushSize * 3.5 : brushSize) * (0.4 + pressure * 1.2);
    
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(p.x, p.y);
    
    if (erasing) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
    }
    
    ctx.lineWidth = currentSize;
    ctx.stroke();
    lastX = p.x; lastY = p.y;
    e.preventDefault();
  }

  function stop() { 
    drawing = false; 
    if (ctx) ctx.globalCompositeOperation = 'source-over'; // restore default
  }
  function clear() {
    if (!canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { init, clear, resize };
})();

// ─── GLOBAL SEARCH ───────────────────────────────────────────────────────────
// D8 → src/sidebar.ts  (continued)  OR its own src/search.ts
// Cut: globalSearch, runSearch, debouncedSearch, searchGoToCard, searchGoToNote, closeSearch.
const debouncedSearch = debounce(runSearch, 200);

function runSearch() {
  const q = (document.getElementById('global-search')?.value || '').trim().toLowerCase();
  const resultsEl = document.getElementById('search-results');
  if (!resultsEl) return;
  if (!q) { resultsEl.classList.remove('show'); resultsEl.innerHTML=''; return; }

  const hits = [];
  // Search cards across all decks
  for (const [deckId, deckAny] of Object.entries(S.decks)) {
    const deck = deckAny as any;
    for (let i=0; i<deck.cards.length; i++) {
      const card = deck.cards[i];
      const inQ = card.q.toLowerCase().includes(q);
      const inA = card.a.toLowerCase().includes(q);
      const inT = (card.tags||[]).some((t: any) => t.toLowerCase().includes(q));
      if (inQ || inA || inT) {
        hits.push({ type:'card', deckId, deckName:deck.name, card, idx:i, inQ, inA });
        if (hits.length >= 30) break;
      }
    }
    if (hits.length >= 30) break;
  }
  // Search notes
  for (const [noteId, noteAny] of Object.entries(notes)) {
    const note = noteAny as any;
    if (note.title.toLowerCase().includes(q) || note.content.toLowerCase().includes(q)) {
      hits.push({ type:'note', noteId, title:note.title });
      if (hits.length >= 35) break;
    }
  }

  if (!hits.length) {
    resultsEl.innerHTML = `<div class="search-empty">No results for "${escH(q)}"</div>`;
    resultsEl.classList.add('show');
    return;
  }

  function hl(text, q) {
    return escH(text).replace(new RegExp(escH(q).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),
      m => `<mark>${m}</mark>`);
  }

  resultsEl.innerHTML = hits.map(h => {
    if (h.type === 'card') return `
      <div class="search-hit" onclick="searchGoToCard('${h.deckId}',${h.idx})">
        <div class="search-hit-q">${hl(h.card.q.slice(0,80), q)}</div>
        <div class="search-hit-a">${hl(h.card.a.slice(0,60), q)}</div>
        <div class="search-hit-meta"><span>${escH(h.deckName)}</span>${(h.card.tags||[]).map(t=>`<span>${escH(t)}</span>`).join('')}</div>
      </div>`;
    return `
      <div class="search-hit" onclick="searchGoToNote('${h.noteId}')">
        <div class="search-hit-q">${hl(h.title, q)}</div>
        <div class="search-hit-meta"><span>Note</span></div>
      </div>`;
  }).join('');
  resultsEl.classList.add('show');
}


// ─── ES module exports (auto-generated) ───
export { Scratch, debouncedSearch, runSearch };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { Scratch, runSearch });
