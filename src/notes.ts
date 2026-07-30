import { notes } from './study.js';
import { toast } from './utils.js';












let pdfDoc = null, pdfCurrentPage = 1, pdfZoom = 1.2, pdfRendering = false;

function togglePdfPanel() {
  const panel = document.getElementById('pdf-panel');
  const isHidden = panel.classList.contains('hidden');
  if (isHidden) {
    panel.classList.remove('hidden');
    document.getElementById('notes-resizer').classList.remove('hidden');
    document.getElementById('btn-pdf-toggle').textContent = 'Hide PDF';
    document.getElementById('btn-pdf-toggle').classList.add('active');
    if (!pdfDoc) document.getElementById('pdf-file-inp').click();
  } else {
    closePdfPanel();
  }
}

function closePdfPanel() {
  document.getElementById('pdf-panel').classList.add('hidden');
  document.getElementById('notes-resizer').classList.add('hidden');
  document.getElementById('btn-pdf-toggle').textContent = 'Open PDF';
  document.getElementById('btn-pdf-toggle').classList.remove('active');
}

// ─── RESIZER DRAG ─────────────────────────────────────────────────────────────
(function() {
  let dragging = false;
  let startPos, startSizeA, startSizeB;

  function isMobile() { return window.innerWidth <= 768; }
  function getResizer() { return document.getElementById('notes-resizer'); }
  function getLeft()    { return document.querySelector('.notes-left'); }
  function getRight()   { return document.getElementById('pdf-panel'); }
  function getLayout()  { return document.querySelector('.notes-layout'); }

  function onDown(e) {
    const resizer = getResizer();
    if (!resizer || resizer.classList.contains('hidden')) return;
    dragging = true;
    resizer.classList.add('dragging');
    document.body.style.userSelect = 'none';
    document.body.style.webkitUserSelect = 'none';

    const touch = e.touches ? e.touches[0] : e;
    const left  = getLeft();
    const right = getRight();

    if (isMobile()) {
      startPos   = touch.clientY;
      // snapshot both heights
      startSizeA = left.getBoundingClientRect().height;
      startSizeB = right.getBoundingClientRect().height;
    } else {
      startPos   = touch.clientX;
      startSizeA = left.getBoundingClientRect().width;
      startSizeB = right.getBoundingClientRect().width;
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function onMove(e) {
    if (!dragging) return;
    const touch  = e.touches ? e.touches[0] : e;
    const left   = getLeft();
    const right  = getRight();

    if (isMobile()) {
      // Drag handle DOWN → left (notes) gets smaller, right (PDF) gets bigger
      // Drag handle UP   → left (notes) gets bigger, right (PDF) gets smaller
      const delta   = touch.clientY - startPos;
      const minH    = 80;
      const maxH    = window.innerHeight * 0.8;
      const newLeftH  = Math.max(minH, Math.min(maxH, startSizeA + delta));
      const newRightH = Math.max(minH, Math.min(maxH, startSizeB - delta));
      left.style.height  = newLeftH  + 'px';
      right.style.height = newRightH + 'px';
    } else {
      // Horizontal: drag right → notes smaller, PDF bigger; drag left → notes bigger, PDF smaller
      const delta     = touch.clientX - startPos;
      const layout    = getLayout();
      const resizerW  = getResizer().offsetWidth;
      const totalW    = layout.getBoundingClientRect().width - resizerW;
      const newLeftW  = Math.max(180, Math.min(totalW - 180, startSizeA + delta));
      const newRightW = totalW - newLeftW;
      left.style.flex  = 'none';
      left.style.width = newLeftW  + 'px';
      right.style.width = newRightW + 'px';
    }
    e.preventDefault();
    e.stopPropagation();
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    const resizer = getResizer();
    if (resizer) resizer.classList.remove('dragging');
    document.body.style.userSelect = '';
    document.body.style.webkitUserSelect = '';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const resizer = getResizer();
    if (!resizer) return;
    resizer.addEventListener('mousedown',  onDown, { passive: false });
    resizer.addEventListener('touchstart', onDown, { passive: false });
    document.addEventListener('mousemove', onMove, { passive: false });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('touchend',  onUp);
  });
})();

function pdfDropHandler(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.pdf')) loadPdfFromFile(file);
}

function loadPdfFile(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (file) loadPdfFromFile(file);
}

async function loadPdfFromFile(file) {
  try {
    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded — requires internet on first use. Please reconnect and reload.');
    const buf = await file.arrayBuffer();
    pdfDoc = await pdfjsLib.getDocument({ data: buf }).promise;
    pdfCurrentPage = 1;
    pdfZoom = 1.2;
    document.getElementById('pdf-title').textContent = file.name;
    document.getElementById('pdf-total-pages').textContent = `/ ${pdfDoc.numPages}`;
    document.getElementById('pdf-page-inp').max = pdfDoc.numPages;
    document.getElementById('pdf-page-inp').value = 1;
    // Hide drop prompt once a PDF is loaded
    document.getElementById('pdf-drop').style.display = 'none';
    // Render all pages
    await renderAllPdfPages();
    // Make sure PDF panel is visible
    document.getElementById('pdf-panel').classList.remove('hidden');
    document.getElementById('btn-pdf-toggle').textContent = '📄 Hide PDF';
    document.getElementById('btn-pdf-toggle').classList.add('active');
    toast(`PDF loaded: ${pdfDoc.numPages} pages`);
  } catch(e) {
    toast('Could not load PDF: ' + e.message);
  }
}

async function renderAllPdfPages() {
  const wrap = document.getElementById('pdf-canvas-wrap');
  wrap.querySelectorAll('canvas').forEach(c => c.remove());
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const canvas = entry.target as HTMLCanvasElement;
        const pageNum = parseInt(canvas.dataset.page || '1');
        if (!canvas.dataset.rendered) {
          canvas.dataset.rendered = 'true';
          pdfDoc.getPage(pageNum).then(page => {
            const viewport = page.getViewport({ scale: pdfZoom });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            page.render({ canvasContext: canvas.getContext('2d'), viewport });
          });
        }
      }
    });
  }, { root: wrap, rootMargin: '500px' });

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const viewport = page.getViewport({ scale: pdfZoom });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.id = `pdf-page-${i}`;
    canvas.dataset.page = String(i);
    wrap.appendChild(canvas);
    observer.observe(canvas);
  }
}

async function pdfGotoPage(num) {
  const n = Math.max(1, Math.min(parseInt(num) || 1, pdfDoc?.numPages || 1));
  pdfCurrentPage = n;
  document.getElementById('pdf-page-inp').value = n;
  const target = document.getElementById(`pdf-page-${n}`);
  if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function pdfNextPage() { pdfGotoPage(pdfCurrentPage + 1); }
function pdfPrevPage() { pdfGotoPage(pdfCurrentPage - 1); }

async function zoomPdf(delta) {
  if (!pdfDoc) return;
  pdfZoom = Math.max(0.5, Math.min(3.0, pdfZoom + delta));
  await renderAllPdfPages();
  // Scroll back to current page
  const target = document.getElementById(`pdf-page-${pdfCurrentPage}`);
  if (target) target.scrollIntoView({ block: 'start' });
}

// Track which page is visible via scroll
document.addEventListener('DOMContentLoaded', () => {
  const wrap = document.getElementById('pdf-canvas-wrap');
  if (wrap) {
    wrap.addEventListener('scroll', () => {
      if (!pdfDoc) return;
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const canvas = document.getElementById(`pdf-page-${i}`);
        if (!canvas) continue;
        const rect = canvas.getBoundingClientRect();
        const wrapRect = wrap.getBoundingClientRect();
        if (rect.top >= wrapRect.top - 50) {
          pdfCurrentPage = i;
          document.getElementById('pdf-page-inp').value = i;
          break;
        }
      }
    });
  }
});


// ─── ES module exports (auto-generated) ───
export { closePdfPanel, loadPdfFile, loadPdfFromFile, pdfCurrentPage, pdfDoc, pdfDropHandler, pdfGotoPage, pdfNextPage, pdfPrevPage, pdfRendering, pdfZoom, renderAllPdfPages, togglePdfPanel, zoomPdf };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { closePdfPanel, loadPdfFile, loadPdfFromFile, pdfDropHandler, pdfGotoPage, pdfNextPage, pdfPrevPage, renderAllPdfPages, togglePdfPanel, zoomPdf });
