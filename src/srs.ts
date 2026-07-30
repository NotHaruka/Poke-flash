import { submitReview } from './firebase-sync.js';
import { DAY, S } from './main.js';
import { markGrade } from './study.js';
import { getLocalMidnightTonight } from './utils.js';





function updateSpaced(card: any, correct: boolean): void {
  updateSpacedGrade(card, correct ? 2 : 0);
}

function updateSpacedGrade(card: any, grade: number): void {
  if (!S.srsEnabled) return;
  const ef = card.ease || 2.5;
  // SM-2 easiness factor update
  const newEf = Math.max(1.3, ef + (0.1 - (3 - grade) * (0.08 + (3 - grade) * 0.02)));
  card.ease = Math.round(newEf * 100) / 100;
  if (grade === 0) {
    // Again — reset interval
    card.interval = 1;
    card.mistakes = (card.mistakes || 0) + 1;
  } else if (grade === 1) {
    // Hard — small increase, ease goes down
    card.interval = Math.max(1, Math.round(card.interval * 1.2));
  } else if (grade === 2) {
    // Good — normal SM-2
    card.interval = card.interval <= 1 ? 3 : Math.round(card.interval * card.ease);
  } else {
    // Easy — big jump, ease goes up more
    card.interval = Math.round(card.interval * card.ease * 1.3);
    card.ease = Math.min(3.0, card.ease + 0.15);
  }
  card.interval = card.interval || 1;
  card.due = getLocalMidnightTonight() + (card.interval - 1) * DAY;

  // Real-time Firestore sync
  if (!card.id) {
    card.id = 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }
  const deckId = S.studyId || S.selDeck;
  if (deckId) {
    submitReview(deckId, card.id, grade).catch((err) => {
      console.warn("Could not sync review to Firestore:", err);
    });
  }
}

function nextInterval(card: any, grade: number): string {
  // Preview what interval each grade would give
  const ef = card.ease || 2.5;
  if (grade === 0) return '< 1d';
  if (grade === 1) return Math.max(1, Math.round((card.interval || 1) * 1.2)) + 'd';
  if (grade === 2) {
    const i = (card.interval || 1) <= 1 ? 3 : Math.round((card.interval || 1) * ef);
    return i + 'd';
  }
  return Math.round((card.interval || 1) * ef * 1.3) + 'd';
}

function ratingBtns(card: any): string {
  const ratings = [
    { grade: 0, label: 'Again', cls: 'again' },
    { grade: 1, label: 'Hard', cls: 'hard' },
    { grade: 2, label: 'Good', cls: 'good' },
    { grade: 3, label: 'Easy', cls: 'easy' },
  ];
  return ratings.map(r =>
    `<button class="rating-btn ${r.cls}" onclick="markGrade(${r.grade})">
       ${r.label}
       ${S.srsEnabled ? `<span class="rating-days">${nextInterval(card, r.grade)}</span>` : ''}
     </button>`
  ).join('');
}


// ─── ES module exports (auto-generated) ───
export { nextInterval, ratingBtns, updateSpaced, updateSpacedGrade };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { nextInterval, ratingBtns, updateSpaced, updateSpacedGrade });
