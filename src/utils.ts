function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): (...args: Parameters<T>) => void {
  let timer: any;
  return (...args: Parameters<T>) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
}

function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function escH(s: any): string {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function toast(m: string): void {
  const t = document.getElementById('toast');
  if (t) {
    t.textContent = m;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 2300);
  }
}

function makeCard(q: string, a: string): any {
  return { id: 'c_' + uid(), q: String(q || ''), a: String(a || ''), ease: 2.5, interval: 1, due: Date.now(), mistakes: 0, difficulty: 'none', createdAt: Date.now() };
}

function fetchWithTimeout(url: string, options: any, timeout = 10000): Promise<any> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id))
    .catch((e: any) => {
      if (e.name === 'AbortError') throw new Error('Request timed out after ' + (timeout / 1000) + 's');
      throw e;
    });
}


function getUserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

function getLocalDayString(dateInput: string | Date | number, timeZone?: string): string {
  const tz = timeZone || getUserTimeZone();
  const date = typeof dateInput === 'string' ? (dateInput.includes('T') ? new Date(dateInput) : new Date(dateInput + 'T12:00:00Z')) : new Date(dateInput);
  
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    const parts = formatter.formatToParts(date);
    const year = parts.find(p => p.type === 'year')?.value;
    const month = parts.find(p => p.type === 'month')?.value;
    const day = parts.find(p => p.type === 'day')?.value;
    return `${year}-${month}-${day}`;
  } catch (e) {
    const d = new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dateVal = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dateVal}`;
  }
}

function getLocalTodayString(timeZone?: string): string {
  return getLocalDayString(new Date(), timeZone);
}

function subtractDays(localDateStr: string, days: number): string {
  const [year, month, day] = localDateStr.split('-').map(Number);
  const d = new Date(year, month - 1, day, 12, 0, 0);
  d.setDate(d.getDate() - days);
  
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dateVal = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dateVal}`;
}

function getLocalMidnightTonight(baseDate?: Date | number): number {
  const now = baseDate ? new Date(baseDate) : new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return tomorrow.getTime();
}

// Inject custom dialog animations
if (typeof document !== 'undefined') {
  const modalStyles = document.createElement('style');
  modalStyles.id = 'custom-dialog-styles';
  modalStyles.textContent = `
    @keyframes customFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes customScaleIn {
      from { transform: scale(0.95); opacity: 0; }
      to { transform: scale(1); opacity: 1; }
    }
  `;
  document.head.appendChild(modalStyles);
}

/**
 * Beautiful, theme-compliant, non-blocking custom confirm dialog.
 */
function showCustomConfirm(title: string, message: string, isDestructive = false): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'custom-confirm-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.backgroundColor = 'rgba(10, 11, 20, 0.7)';
    overlay.style.backdropFilter = 'blur(6px)';
    overlay.style.webkitBackdropFilter = 'blur(6px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';
    overlay.style.padding = '20px';
    overlay.style.animation = 'customFadeIn 0.18s ease-out';

    const confirmBtnBg = isDestructive ? 'var(--red)' : 'var(--accent)';
    const confirmBtnBorder = isDestructive ? 'var(--red)' : 'var(--accent)';
    const confirmBtnColor = isDestructive ? '#ffffff' : 'var(--bg)';

    overlay.innerHTML = `
      <div style="background:var(--surface2); border:1.5px solid var(--border2); border-radius:12px; max-width:400px; width:100%; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3); animation:customScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
        <h3 style="font-family:'Space Grotesk', sans-serif; font-size:15px; font-weight:700; color:var(--text); margin-bottom:12px; text-transform:uppercase; letter-spacing:0.04em; display:flex; align-items:center; gap:8px;">
          ⚠️ ${escH(title)}
        </h3>
        <p style="font-size:13px; color:var(--text2); line-height:1.6; margin-bottom:24px; white-space:pre-wrap;">${escH(message)}</p>
        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button id="custom-confirm-cancel-btn" class="btn" style="padding:8px 16px; font-size:12px; font-weight:600; height:34px;">Cancel</button>
          <button id="custom-confirm-ok-btn" class="btn" style="padding:8px 16px; font-size:12px; font-weight:600; height:34px; background:${confirmBtnBg}; border-color:${confirmBtnBorder}; color:${confirmBtnColor};">Confirm</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanUp = (value: boolean) => {
      overlay.remove();
      resolve(value);
    };

    const okBtn = overlay.querySelector('#custom-confirm-ok-btn') as HTMLButtonElement;
    const cancelBtn = overlay.querySelector('#custom-confirm-cancel-btn') as HTMLButtonElement;

    okBtn.onclick = () => cleanUp(true);
    cancelBtn.onclick = () => cleanUp(false);

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanUp(false);
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.removeEventListener('keydown', handleKeydown);
        cleanUp(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        window.removeEventListener('keydown', handleKeydown);
        cleanUp(false);
      }
    };
    window.addEventListener('keydown', handleKeydown);
  });
}

/**
 * Beautiful, theme-compliant, non-blocking custom text prompt dialog.
 */
function showCustomPrompt(title: string, message: string, defaultValue = '', placeholder = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'custom-prompt-overlay';
    overlay.style.position = 'fixed';
    overlay.style.inset = '0';
    overlay.style.backgroundColor = 'rgba(10, 11, 20, 0.7)';
    overlay.style.backdropFilter = 'blur(6px)';
    overlay.style.webkitBackdropFilter = 'blur(6px)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = '99999';
    overlay.style.padding = '20px';
    overlay.style.animation = 'customFadeIn 0.18s ease-out';

    overlay.innerHTML = `
      <div style="background:var(--surface2); border:1.5px solid var(--border2); border-radius:12px; max-width:420px; width:100%; padding:24px; box-shadow:0 20px 25px -5px rgba(0,0,0,0.3); animation:customScaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);">
        <h3 style="font-family:'Space Grotesk', sans-serif; font-size:15px; font-weight:700; color:var(--text); margin-bottom:6px; text-transform:uppercase; letter-spacing:0.04em; display:flex; align-items:center; gap:8px;">
          ✍️ ${escH(title)}
        </h3>
        <p style="font-size:12px; color:var(--text3); margin-bottom:14px;">${escH(message)}</p>
        
        <input id="custom-prompt-input" type="text" value="${escH(defaultValue)}" placeholder="${escH(placeholder)}" class="ffield" style="width:100%; background:var(--surface3); border:1.5px solid var(--border2); color:var(--text); padding:10px 12px; border-radius:6px; font-size:13px; margin-bottom:20px; outline:none; font-weight:600; transition:border-color 0.15s;" onfocus="this.style.borderColor='var(--accent)';" onblur="this.style.borderColor='var(--border2)';">
        
        <div style="display:flex; justify-content:flex-end; gap:10px;">
          <button id="custom-prompt-cancel-btn" class="btn" style="padding:8px 16px; font-size:12px; font-weight:600; height:34px;">Cancel</button>
          <button id="custom-prompt-ok-btn" class="btn btn-g" style="padding:8px 16px; font-size:12px; font-weight:600; height:34px;">Save</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const cleanUp = (value: string | null) => {
      overlay.remove();
      resolve(value);
    };

    const inp = overlay.querySelector('#custom-prompt-input') as HTMLInputElement;
    const okBtn = overlay.querySelector('#custom-prompt-ok-btn') as HTMLButtonElement;
    const cancelBtn = overlay.querySelector('#custom-prompt-cancel-btn') as HTMLButtonElement;

    // Auto focus and select input
    setTimeout(() => {
      inp.focus();
      inp.select();
    }, 50);

    okBtn.onclick = () => {
      cleanUp(inp.value.trim());
    };

    cancelBtn.onclick = () => {
      cleanUp(null);
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) {
        cleanUp(null);
      }
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        window.removeEventListener('keydown', handleKeydown);
        cleanUp(inp.value.trim());
      } else if (e.key === 'Escape') {
        e.preventDefault();
        window.removeEventListener('keydown', handleKeydown);
        cleanUp(null);
      }
    };
    window.addEventListener('keydown', handleKeydown);
  });
}


// ─── ES module exports (auto-generated) ───
export { debounce, escH, fetchWithTimeout, getLocalDayString, getLocalMidnightTonight, getLocalTodayString, getUserTimeZone, makeCard, showCustomConfirm, showCustomPrompt, subtractDays, toast, uid };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { debounce, escH, fetchWithTimeout, getLocalDayString, getLocalMidnightTonight, getLocalTodayString, getUserTimeZone, makeCard, showCustomConfirm, showCustomPrompt, subtractDays, toast, uid });
