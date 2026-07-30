import { escH } from './utils.js';




function isClozeCard(card: any): boolean {
  if (!card || !card.q) return false;
  return card.q.includes('{{') && card.q.includes('}}');
}

function renderClozeQuestion(text: string): string {
  const escaped = escH(text);
  return escaped.replace(/\{\{(?:c\d+::)?([^:}]+)(?:::([^}]+))?\}\}/g, (match, answer, hint) => {
    // Note: answer is already HTML-escaped because we did escH(text) first.
    const displayHint = hint ? hint : '...';
    return `<span class="cloze-blank" onclick="revealCloze(this, event)" data-answer="${answer}">${displayHint}</span>`;
  });
}

function renderClozeAnswer(text: string): string {
  const escaped = escH(text);
  return escaped.replace(/\{\{(?:c\d+::)?([^:}]+)(?:::([^}]+))?\}\}/g, (match, answer) => {
    return `<span class="cloze-blank revealed">${answer}</span>`;
  });
}

function revealCloze(el: HTMLElement, event: Event): void {
  if (event) {
    event.stopPropagation(); // Prevent card from flipping
  }
  el.classList.add('revealed');
  const ans = el.getAttribute('data-answer');
  if (ans) {
    el.textContent = ans;
  }
}

function allClozesRevealed(): boolean {
  const blanks = document.querySelectorAll('.cfront .cloze-blank');
  if (!blanks.length) return true;
  return Array.from(blanks).every(el => el.classList.contains('revealed'));
}


// ─── ES module exports (auto-generated) ───
export { allClozesRevealed, isClozeCard, renderClozeAnswer, renderClozeQuestion, revealCloze };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { allClozesRevealed, isClozeCard, renderClozeAnswer, renderClozeQuestion, revealCloze });
