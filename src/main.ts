let S: any = {
  decks: {},
  selDeck: null,
  queue: [],
  quizQueue: [],
  idx: 0,
  flipped: false,
  correct: 0,
  incorrect: 0,
  skipped: 0,
  studyId: null,
  mode: 'flip',
  userAns: '',
  adaptExplain: null,
  aiProvider: 'openrouter',
  openrouterKey: '',
  openrouterModel: 'openrouter/free',
  geminiKey: '',
  geminiModel: 'gemini-3.5-flash',
  // API usage tracking
  apiUsage: {
    calls: 0,           // number of API calls made
    tokensIn: 0,        // input tokens
    tokensOut: 0,       // output tokens
    lastReset: Date.now()  // timestamp of last reset
  },
  // Undo last SRS action
  lastAction: null,   // {card, ease, interval, due, mistakes, type, idx}
  // Active tag filter (null = all)
  activeTag: null,
  // Deck display order (array of ids)
  deckOrder: [],
  // Spaced repetition enabled (user preference)
  srsEnabled: true,
  // Folders: { folderId: { name, collapsed } }
  folders: {},
  folderOrder: [],
  // Exam mode state
  examActive: false,        // true while an exam is in progress
  examAnswers: [],          // [{card, answer, verdict}] — built as user progresses
  examTimerSecs: 0,         // seconds remaining (0 = untimed)
  examTimerTotal: 0,        // total seconds at start (for progress bar)
  examTimerInterval: null,  // setInterval handle
  examTimeElapsed: 0,       // seconds taken (even if untimed)
  _aiFallback: false,
  _newCardDiff: 'none',
  _deckSelectMode: false,
  _deckSelected: {} as any
};

const DAY = 86400000;


// ─── ES module exports (auto-generated) ───
export { DAY, S };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { S });
