import { AIProvider } from './ai-provider.js';
import { isClozeCard, renderClozeAnswer, renderClozeQuestion } from './cloze.js';
import { renderCardsList } from './deck-manager.js';
import { app } from './firebase.js';
import { syncAddCard, syncAddCardsBatch, syncCreateDeck, syncDeleteNote, syncSaveNote, syncUndoLastReview, syncUpdateCard } from './firebase-sync.js';
import { DAY, S } from './main.js';
import { _createPopoverOpen, closeCreatePopover, cpopAddDeck, cpopAddFolder, loadQueue, renderSidebar, selectDeck, switchCreateTab, toggleCreatePopover, updateDueBadge, updateStats } from './sidebar.js';
import { nextInterval, updateSpaced, updateSpacedGrade } from './srs.js';
import { updateStreakUI } from './stats.js';
import { initStorage, persist, syncToDisk } from './storage.js';
import { debounce, escH, fetchWithTimeout, getLocalDayString, getLocalMidnightTonight, getLocalTodayString, makeCard, toast, uid } from './utils.js';




import localforage from 'localforage';

function setMode(m, btn) {
  if (S.mode === 'exam' && m !== 'exam') examStopTimer();
  S.mode = m;
  document.querySelectorAll('.mtab').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  S.flipped = false; S.userAns = ''; S.adaptExplain = null;
  if (m === 'exam') S.examActive = false; // always start at setup screen
  if (m === 'quiz' && S.studyId) buildQuizQueue();
  renderStudy();
}
 
function doShuffle() {
  if(!S.studyId){toast('Pick a deck first!');return;}
  loadQueue(S.decks[S.studyId].cards);
  shuffle(S.queue); renderStudy(); toast('Shuffled!');
}
function doDue() { if(!S.studyId){toast('Pick a deck first!');return;} if(!S.srsEnabled){toast('Enable SRS first to use due-date filtering!');return;} loadQueue(S.decks[S.studyId].cards,true); }
function doReset() { if(!S.studyId) return; loadQueue(S.decks[S.studyId].cards); }
function shuffle(arr){ for(let i=arr.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];} }
 
// ─── QUIZ ─────────────────────────────────────────────────────────────────────
function buildQuizQueue() {
  const all=S.decks[S.studyId]?.cards||[];
  if(all.length<2){S.quizQueue=[];return;}
  S.quizQueue=S.queue.map(card=>{
    const others=all.filter(c=>c!==card); shuffle(others);
    const opts=[...others.slice(0,3).map(c=>c.a), card.a]; shuffle(opts);
    return {question:card.q, options:opts, answer:card.a, card};
  });
}
 
let cardStartTime = Date.now();
 
function renderStudy() {
  if (!S.flipped) {
    cardStartTime = Date.now();
  }
  const el=document.getElementById('study-inner');
  // Exam mode has its own full rendering path
  if (S.mode === 'exam') { renderExam(el); return; }
  const q=S.queue;
  if(!q.length){
    el.innerHTML=`<div class="empty-msg">${S.studyId?'No cards due right now<br>All caught up! Click "All Cards" to study anyway.':'No cards yet.<br>Add some in Manage Cards!'}</div>`;
    return;
  }
  if(S.idx>=q.length){renderDone(el);return;}
  const card=q[S.idx];
  const pct=Math.round((S.idx/q.length)*100);
  const prog=`<div class="prog-wrap">
    <div class="prog-info"><span>Card ${S.idx+1} of ${q.length}</span><span>${pct}%</span></div>
    <div class="prog-track"><div class="prog-fill" style="width:${pct}%"></div></div>
  </div>`;
  const score=`<div class="pill-row">
    <span class="pill" style="background:rgba(var(--accent-rgb),0.15);color:var(--accent)">✓ ${S.correct}</span>
    <span class="pill" style="background:rgba(255,107,107,0.15);color:var(--red)">✗ ${S.incorrect}</span>
    <span class="pill" style="background:var(--surface2);color:var(--text3)">→ ${S.skipped}</span>
  </div>`;
  const todayStr = getLocalTodayString();
  const dueDayStr = getLocalDayString(card.due);
  let dueStr = '';
  if (card.due <= Date.now()) {
    dueStr = 'due now';
  } else if (card.due <= getLocalMidnightTonight()) {
    dueStr = 'due today';
  } else {
    const todayDate = new Date(todayStr + 'T12:00:00Z');
    const dueDate = new Date(dueDayStr + 'T12:00:00Z');
    const diffDays = Math.round((dueDate.getTime() - todayDate.getTime()) / DAY);
    dueStr = diffDays <= 1 ? 'next tomorrow' : `next in ${diffDays}d`;
  }
  const meta=S.srsEnabled ? `<div class="cf-meta">
    <span>ease ${(card.ease||2.5).toFixed(1)}</span>
    <span>${card.mistakes||0} mistakes</span>
    <span>${dueStr}</span>
  </div>` : `<div class="cf-meta"><span>${card.mistakes||0} mistakes</span></div>`;
  const adapt=(card.mistakes>=3&&S.adaptExplain)
    ?`<div class="adapt-box"><div class="adapt-label">AI Simple Explanation</div><div class="adapt-text">${escH(S.adaptExplain)}</div></div>`
    :(card.mistakes>=3&&!S.adaptExplain)
    ?`<div class="adapt-box"><div class="adapt-label">You've missed this ${card.mistakes} times</div><div class="adapt-text"><button class="btn btn-p" onclick="getAdaptExplain()">Ask AI to explain simply</button></div></div>`
    :'';
 
  const isFoil = (card.interval || 0) > 30;
  const foilClass = isFoil ? ' foil-card' : '';

  if(S.mode==='flip'){
    el.innerHTML=`${prog}${adapt}
      <div class="card-scene">
        <div class="card-wrap${S.flipped?' flipped':''}" onclick="flipCard()" ontouchstart="handleTouchStart(event)" ontouchend="handleTouchEnd(event)">
          <div class="card-face cfront${foilClass}" style="position:relative">
            ${(card.difficulty && card.difficulty !== 'none') ? `<div class="cf-diff"><span class="diff-pill ${card.difficulty}" onclick="event.stopPropagation();cycleCardDiffInStudy()" title="Difficulty — click to change">${card.difficulty === 'easy' ? '▲ Easy' : card.difficulty === 'medium' ? '● Med' : '▼ Hard'}</span></div>` : ''}
            <div class="cf-label">${isClozeCard(card) ? 'Fill in the blank' : 'Question'}</div>
            <div class="cf-text${isClozeCard(card) ? ' cloze-text' : ''}">${isClozeCard(card) ? renderClozeQuestion(card.q) : escH(card.q)}</div>
            <div class="cf-hint">${isClozeCard(card) ? 'Tap each blank to reveal · flip for full answer' : 'Click card to reveal answer'}</div>
          </div>
          <div class="card-face cback${foilClass}">
            <div class="cf-label">Answer</div>
            <div class="cf-text${isClozeCard(card) ? ' cloze-text' : ''}">${isClozeCard(card) ? renderClozeAnswer(card.q) : escH(card.a)}${card.a && isClozeCard(card) ? '<div style="margin-top:10px;font-size:13px;color:var(--text3)">'+escH(card.a)+'</div>' : ''}</div>
            ${meta}
          </div>
        </div>
      </div>
      <div class="ctrl-row">
        <button class="btn btn-r" onclick="mark('incorrect')" ${!S.flipped?'disabled':''} title="Again — reset to day 1">✗ Again${S.srsEnabled ? ` (${nextInterval(card, 0)})` : ''}</button>
        <button class="btn" onclick="mark('skip')">→ Skip</button>
        <button class="btn btn-y" onclick="mark('hard')" ${!S.flipped?'disabled':''} title="Hard — shorter interval">Hard${S.srsEnabled ? ` (${nextInterval(card, 1)})` : ''}</button>
        <button class="btn btn-g" onclick="mark('good')" ${!S.flipped?'disabled':''} title="Good — normal interval">✓ Good${S.srsEnabled ? ` (${nextInterval(card, 2)})` : ''}</button>
        <button class="btn btn-b" onclick="mark('easy')" ${!S.flipped?'disabled':''} style="display:inline-flex;align-items:center;gap:4px" title="Easy — longer interval + boost"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;color:var(--yellow)"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg><span>Easy</span>${S.srsEnabled ? ` (${nextInterval(card, 3)})` : ''}</button>
      </div>
      <div class="undo-bar">
        <button class="undo-btn${S.lastAction?' show':''}" onclick="undoLast()">↩ Undo last</button>
      </div>
      ${score}`;
  } else if(S.mode==='type'){
    const grade = S.flipped ? S_lastGrade : null;
    let resultHtml = '';
    if (grade) {
      if (grade.verdict === 'checking') {
        resultHtml = `<div class="quiz-result" style="margin-top:12px;background:var(--surface2);color:var(--text2)">
          <span style="display:inline-block;animation:spin 0.7s linear infinite;margin-right:6px">⟳</span>Checking with AI...
        </div>`;
      } else if (grade.verdict === 'correct') {
        resultHtml = `<div class="quiz-result ok" style="margin-top:12px">
          ✓ Correct! ${grade.usedAI ? '<span style="font-size:11px;opacity:0.7">· AI graded</span>' : ''}
          ${grade.reason && grade.reason !== 'Exact match' ? `<div style="font-size:12px;margin-top:4px;opacity:0.8">${escH(grade.reason)}</div>` : ''}
        </div>`;
      } else if (grade.verdict === 'partial') {
        resultHtml = `<div class="quiz-result" style="margin-top:12px;background:var(--yellow-dim);color:var(--yellow);border:1px solid rgba(255,209,102,0.3);border-radius:var(--rs);padding:12px 16px">
          <span style="display:inline-flex; align-items:center; gap:6px;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;color:var(--yellow)"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>Partially correct</span> ${grade.usedAI ? '<span style="font-size:11px;opacity:0.7">· AI graded</span>' : ''}
          <div style="font-size:12px;margin-top:4px">${escH(grade.reason)}</div>
          <div style="font-size:12px;margin-top:6px;color:var(--text2)">Correct answer: <strong style="color:var(--text)">${escH(card.a)}</strong></div>
        </div>`;
      } else {
        resultHtml = `<div class="quiz-result bad" style="margin-top:12px">
          ✗ Not quite ${grade.usedAI ? '<span style="font-size:11px;opacity:0.7">· AI graded</span>' : ''}
          ${grade.reason ? `<div style="font-size:12px;margin-top:4px;opacity:0.85">${escH(grade.reason)}</div>` : ''}
          <div style="font-size:12px;margin-top:6px">Correct answer: <strong>${escH(card.a)}</strong></div>
        </div>`;
      }
    }
    el.innerHTML=`${prog}${adapt}
      <div class="card-scene">
        <div class="card-wrap${S.flipped?' flipped':''}" style="cursor:default">
          <div class="card-face cfront${foilClass}">
            <div class="cf-label">Question</div>
            <div class="cf-text">${escH(card.q)}</div>
          </div>
          <div class="card-face cback${foilClass}">
            <div class="cf-label">Answer</div>
            <div class="cf-text">${escH(card.a)}</div>
            ${S.userAns?`<div class="cf-user">Your answer: "${escH(S.userAns)}"</div>`:''}
            ${meta}
          </div>
        </div>
      </div>
      ${!S.flipped
        ? `<div class="type-box">
            <div class="type-label">Type your answer and press Enter or click Check</div>
            <div class="type-row">
              <input type="text" id="type-inp" value="${escH(S.userAns)}" placeholder="Your answer..." onkeydown="if(event.key==='Enter')reveal()">
              <button class="btn btn-b" onclick="reveal()">Check →</button>
            </div>
           </div>`
        : `${resultHtml}
           ${grade && grade.verdict !== 'checking' ? `<div class="ctrl-row" style="margin-top:12px">
             <button class="btn" onclick="mark('skip')">→ Skip</button>
             <button class="btn btn-g" onclick="mark('${grade.verdict==='incorrect'?'incorrect':'correct'}')">Next →</button>
           </div>` : ''}`
      }
      ${score}`;
    if(!S.flipped && window.innerWidth > 768) setTimeout(()=>{const i=document.getElementById('type-inp');if(i)i.focus();},30);
  } else if(S.mode==='quiz'){
    if(!S.quizQueue.length||S.idx>=S.quizQueue.length){renderDone(el);return;}
    const qz=S.quizQueue[S.idx];
    el.innerHTML=`${prog}${adapt}
      <div class="quiz-card">
        <div class="quiz-q">${escH(qz.question)}</div>
        <div class="quiz-options" id="quiz-opts">
          ${qz.options.map((o,i)=>`<button class="quiz-opt" id="qopt-${i}" onclick="answerQuiz(${i})">${escH(o)}</button>`).join('')}
        </div>
        <div id="quiz-result"></div>
      </div>${score}`;
  }
 
  // If focus mode is active, keep focus-inner in sync with whatever was just rendered.
  // This means every caller (mark, flipCard, reveal, etc.) automatically updates the overlay
  // without needing to know about focus mode themselves.
  if (typeof _focusActive !== 'undefined' && _focusActive) {
    const focusInner = document.getElementById('focus-inner');
    if (focusInner) focusInner.innerHTML = el.innerHTML;
  }
}
 
// ─── SMART ANSWER GRADING ────────────────────────────────────────────────────
// gradeResult: { verdict: 'correct'|'partial'|'incorrect', reason: string, usedAI: bool }
let S_lastGrade = null;
 
function norm(s) {
  if (s === null || s === undefined) return '';
  const str = typeof s === 'string' ? s : String(s);
  return str.toLowerCase().trim().replace(/\s+/g, ' ').replace(/[.,;:!?""'']+/g, '');
}
 
function extractKeywords(s) {
  const stopWords = new Set(['a','an','the','is','are','was','were','be','been','being',
    'have','has','had','do','does','did','will','would','could','should','may','might',
    'of','in','on','at','to','for','with','by','from','as','it','its','this','that',
    'and','or','but','not','what','which','who','how','when','where','why']);
  return norm(s).split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
}
 
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({length:m+1},(_,i)=>Array.from({length:n+1},(_,j)=>i===0?j:j===0?i:0));
  for(let i=1;i<=m;i++) for(let j=1;j<=n;j++)
    dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
  return dp[m][n];
}
 
// Check if two words are semantically close using common synonym pairs
const SYNONYMS = [
  ['increase','rise','grow','expand','raise','boost','improve'],
  ['decrease','fall','drop','decline','reduce','shrink','lower'],
  ['create','make','form','produce','generate','build'],
  ['remove','delete','eliminate','erase','destroy','clear'],
  ['important','significant','key','critical','essential','major','crucial','vital'],
  ['show','display','indicate','demonstrate','reveal','exhibit'],
  ['use','apply','utilize','employ'],
  ['change','alter','modify','transform','shift','convert'],
  ['group','set','collection','cluster','category','class'],
  ['part','component','element','piece','section','portion'],
  ['process','procedure','method','technique','approach','way'],
  ['result','outcome','effect','consequence','product','output'],
  ['start','begin','initiate','commence'],
  ['end','finish','stop','terminate','conclude','complete'],
  ['big','large','great','huge','massive','enormous'],
  ['small','little','tiny','minor','brief'],
  ['fast','quick','rapid','swift','speed'],
  ['slow','gradual','delayed'],
  ['help','assist','support','aid'],
  ['measure','calculate','compute','determine','find'],
  ['define','describe','explain','state','express'],
  ['store','save','keep','hold','retain','record'],
  ['send','transmit','transfer','pass','deliver'],
  ['get','receive','obtain','acquire','retrieve'],
  ['true','correct','accurate','right','valid'],
  ['false','incorrect','wrong','invalid','inaccurate'],
];
 
function synonymMatch(w1, w2) {
  for (const group of SYNONYMS) {
    if (group.includes(w1) && group.includes(w2)) return true;
  }
  return false;
}
 
function ruleBasedGrade(typed, correct) {
  const t = norm(typed), a = norm(correct);
  if (!t) return { verdict:'incorrect', reason:'No answer given', usedAI:false };
  if (t === a) return { verdict:'correct', reason:'Exact match', usedAI:false };
 
  // Typo tolerance for short answers
  if (a.length <= 40 && levenshtein(t, a) <= 2)
    return { verdict:'correct', reason:'Close enough (minor typo)', usedAI:false };
 
  // If typed answer contains the full correct answer (extra words are ok)
  if (t.includes(a))
    return { verdict:'correct', reason:'Answer contains all required content', usedAI:false };
 
  const tKeys = new Set(extractKeywords(t));
  const aKeys = extractKeywords(a);
 
  // No keywords to check (very short answer like a single number/word)
  if (!aKeys.length) {
    // Fall back to fuzzy match
    const d = levenshtein(t, a);
    const threshold = Math.floor(a.length * 0.3);
    if (d <= threshold) return { verdict:'correct', reason:'Close enough', usedAI:false };
    return { verdict:'incorrect', reason:`Expected "${a}"`, usedAI:false };
  }
 
  // Match each required keyword against typed keywords
  // — exact match, fuzzy (edit distance ≤1), or synonym
  const matched = [], missed = [];
  for (const k of aKeys) {
    let hit = false;
    for (const tw of tKeys) {
      if (tw === k || levenshtein(tw, k) <= 1 || synonymMatch(tw, k)) { hit = true; break; }
    }
    if (hit) matched.push(k); else missed.push(k);
  }
 
  const ratio = matched.length / aKeys.length;
 
  if (ratio === 1)
    return { verdict:'correct', reason:`All key ideas covered`, usedAI:false };
  if (ratio >= 0.75)
    return { verdict:'correct', reason:`Covers main ideas — matched: ${matched.join(', ')}`, usedAI:false };
  if (ratio >= 0.4)
    return { verdict:'partial', reason:`Got some of it. Missed: ${missed.join(', ')}`, usedAI:false };
  if (ratio > 0)
    return { verdict:'partial', reason:`Only matched: ${matched.join(', ')}. Missing: ${missed.join(', ')}`, usedAI:false };
 
  // Zero keyword overlap — check if answer is very short (single word/number)
  // where the whole answer IS the keyword
  if (aKeys.length === 1) {
    return { verdict:'incorrect', reason:`Expected "${aKeys[0]}"`, usedAI:false };
  }
 
  return { verdict:'incorrect', reason:`Missing key concepts: ${missed.slice(0,4).join(', ')}`, usedAI:false };
}
 
const GRADE_PROMPT = (q, correct, typed) =>
`You are a fair answer grader. Decide if the student captured the main idea.
 
Question: ${q}
Correct answer: ${correct}
Student's answer: ${typed}
 
- "correct" = student got the main idea or key concepts, even if worded differently
- "partial" = got some of it but missed important parts
- "incorrect" = clearly wrong or unrelated
 
Reply ONLY with valid JSON, nothing else:
{"verdict":"correct","reason":"short explanation"}`;
 
async function gradeWithAI(typed, correct, question) {
  const provider = S.aiProvider;
 
  // 'noai' selected — skip AI grading entirely
  if (provider === 'noai') return null;
 
  try {
    const raw = await AIProvider.generate(GRADE_PROMPT(question, correct, typed), 120);
    const match = raw?.match(/\{[\s\S]*?\}/);
    if (match) {
      const p = JSON.parse(match[0]);
      if (['correct','partial','incorrect'].includes(p.verdict))
        return { verdict:p.verdict, reason:p.reason||'', usedAI:true, source: provider === 'openrouter' ? 'OpenRouter' : 'AI' };
    }
  } catch(_) {}
 
  return null;
}
 
let touchStartX = 0;
let touchStartY = 0;

function handleTouchStart(e: TouchEvent) {
  if (e.touches.length !== 1) return;
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}

function handleTouchEnd(e: TouchEvent) {
  if (e.changedTouches.length !== 1) return;
  const touchEndX = e.changedTouches[0].clientX;
  const touchEndY = e.changedTouches[0].clientY;
  
  const diffX = touchEndX - touchStartX;
  const diffY = touchEndY - touchStartY;
  
  // Check if horizontal swipe was strong enough and primary
  if (Math.abs(diffX) > 60 && Math.abs(diffY) < 50) {
    if (diffX > 0) {
      // Swiped right -> Good or Flip if unrevealed
      if (!S.flipped) {
        flipCard();
      } else {
        mark('good');
      }
    } else {
      // Swiped left -> Incorrect or Flip if unrevealed
      if (!S.flipped) {
        flipCard();
      } else {
        mark('incorrect');
      }
    }
  }
}

function flipCard() {
  S.flipped = !S.flipped;
  renderStudy();
  // Pop animation on reveal
  if (S.flipped) {
    requestAnimationFrame(() => {
      const wrap = document.querySelector('.card-wrap');
      if (wrap) {
        wrap.classList.remove('reveal-pop');
        wrap.offsetHeight; // reflow
        wrap.classList.add('reveal-pop');
        wrap.addEventListener('animationend', () => wrap.classList.remove('reveal-pop'), { once: true });
      }
    });
  }
}
 
async function reveal() {
  const inp = document.getElementById('type-inp');
  S.userAns = inp ? inp.value.trim() : '';
  S.flipped = true;
  S_lastGrade = null;
 
  const card = S.queue[S.idx];
  if (!card) { renderStudy(); return; }
 
  // Always try rule-based first — handles most cases instantly with no internet
  const ruleResult = ruleBasedGrade(S.userAns, card.a);
 
  // Rule-based is conclusive for all cases — only call AI for ambiguous partials
  // when an AI provider is actually configured
  const hasAI = S.aiProvider !== 'noai';
  const needsAI = hasAI && (
    !ruleResult ||
    (ruleResult as any).verdict === 'partial' ||
    ((ruleResult as any).verdict === 'incorrect' && S.userAns.trim().length > 0) ||
    ((ruleResult as any).confidence !== undefined && (ruleResult as any).confidence < 0.7)
  );
 
  if (!needsAI) {
    S_lastGrade = ruleResult;
    if (S.srsEnabled) { updateSpaced(card, ruleResult.verdict === 'correct'); persist(); }
    renderStudy();
    return;
  }
 
  // Set to explicit checking state so the UI hides the Next button and shows loader
  S_lastGrade = { verdict: 'checking', reason: 'Upgrading with AI...', usedAI: false };
  renderStudy();
 
  const aiResult = await gradeWithAI(S.userAns, card.a, card.q);
 
  // Re-check card is still valid and unchanged after await (queue, deck, or card might have switched)
  const currentCard = S.queue[S.idx];
  if (!currentCard || currentCard !== card) return;
 
  if (aiResult && aiResult.verdict) {
    S_lastGrade = aiResult;
  } else {
    // AI unavailable or returned bad structure — keep rule-based result
    S_lastGrade = ruleResult || { verdict:'partial', reason:'Could not connect to AI — rule-based grading used', usedAI:false };
  }
  if (S.srsEnabled) { updateSpaced(currentCard, S_lastGrade.verdict === 'correct'); persist(); }
  renderStudy();
}
 
function answerQuiz(optIdx) {
  const qz = S.quizQueue[S.idx];
  const chosen = qz.options[optIdx];
  const correct = chosen === qz.answer;
  // Lock all options and highlight correct/wrong
  document.querySelectorAll('.quiz-opt').forEach((b, i) => {
    b.disabled = true;
    if (qz.options[i] === qz.answer) b.classList.add('correct');
    if (i === optIdx && !correct) b.classList.add('wrong');
  });
  const res = document.getElementById('quiz-result');
  const elapsedSecs = Math.min(60, Math.round((Date.now() - cardStartTime) / 1000)) || 3;
  if (correct) {
    res.className = 'quiz-result ok';
    res.innerHTML = '✓ Correct!';
    S.correct++;
    if (S.srsEnabled) updateSpaced(qz.card, true);
    trackStudyActivity(1, 0, 0, elapsedSecs);
  } else {
    res.className = 'quiz-result bad';
    res.innerHTML = `✗ Wrong — correct answer: <strong>${escH(qz.answer)}</strong>`;
    S.incorrect++;
    if (S.srsEnabled) updateSpaced(qz.card, false);
    trackStudyActivity(0, 1, 0, elapsedSecs);
  }
  persist();
  // Show Next button — no auto-advance
  res.innerHTML += `<div style="margin-top:12px">
    <button class="btn btn-g" onclick="quizNext()" style="padding:10px 28px;font-size:14px;display:inline-flex;align-items:center;gap:6px">
      ${S.idx + 1 >= S.quizQueue.length ? '<span style="display:inline-flex;align-items:center;gap:6px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg><span>See Results</span></span>' : '<span>Next →</span>'}
    </button>
  </div>`;
}
 
function quizNext() {
  S.idx++;
  S.adaptExplain = null;
  renderStudy();
}
 
function markGrade(grade) {
  const card = S.queue[S.idx];
  if (!card) return;
  // Snapshot BEFORE any mutations — required for undo to work correctly
  S.lastAction = {
    grade, card,
    ease: card.ease, interval: card.interval, due: card.due, mistakes: card.mistakes,
    idx: S.idx, correct: S.correct, incorrect: S.incorrect, skipped: S.skipped
  };
  // Apply SM-2 scheduling first (before mutating mistakes count)
  if (S.srsEnabled) updateSpacedGrade(card, grade);
  const elapsedSecs = Math.min(60, Math.round((Date.now() - cardStartTime) / 1000)) || 3;
  // Score: grade 0 (Again) and grade 1 (Hard) → incorrect; grade 2+ → correct
  if (grade === 0) {
    S.incorrect++;
    if (!S.srsEnabled) {
      card.mistakes = (card.mistakes || 0) + 1;
    }
    trackStudyActivity(0, 1, 0, elapsedSecs);
  } else if (grade === 1) {
    S.incorrect++;  // Hard still means "didn't fully know it"
    if (!S.srsEnabled) {
      card.mistakes = (card.mistakes || 0) + 1; // Treat hard as a mistake as well
    }
    trackStudyActivity(0, 1, 0, elapsedSecs);
  } else {
    S.correct++;
    trackStudyActivity(1, 0, 0, elapsedSecs);
  }
  persist();
  S.idx++; S.flipped = false; S.userAns = ''; S.adaptExplain = null;
  renderStudy();
}
 
function mark(type) {
  const card = S.queue[S.idx];
  // Snapshot before mutating for undo
  S.lastAction = {
    type, card,
    ease: card.ease, interval: card.interval, due: card.due, mistakes: card.mistakes,
    idx: S.idx, correct: S.correct, incorrect: S.incorrect, skipped: S.skipped
  };
  const elapsedSecs = Math.min(60, Math.round((Date.now() - cardStartTime) / 1000)) || 3;
  if (type==='incorrect')      {
    S.incorrect++;
    if (S.srsEnabled) {
      updateSpacedGrade(card, 0);
    } else {
      card.mistakes = (card.mistakes || 0) + 1;
    }
    persist();
    trackStudyActivity(0, 1, 0, elapsedSecs);
  }
  else if (type==='skip')      { S.skipped++; trackStudyActivity(0, 0, 1, elapsedSecs); }
  else { // easy / good / hard / correct all count as correct for scoring
    S.correct++;
    if (S.srsEnabled) {
      if (type === 'hard') updateSpacedGrade(card, 1);
      else if (type === 'easy') updateSpacedGrade(card, 3);
      else updateSpacedGrade(card, 2);
    }
    persist();
    trackStudyActivity(1, 0, 0, elapsedSecs);
  }
  S.idx++; S.flipped=false; S.userAns=''; S.adaptExplain=null;
  renderStudy();
}
 
function undoLast() {
  if (!S.lastAction) return;
  const la = S.lastAction;
  // Restore card SRS state
  la.card.ease     = la.ease;
  la.card.interval = la.interval;
  la.card.due      = la.due;
  la.card.mistakes = la.mistakes;
  // Restore session counters
  S.correct   = la.correct;
  S.incorrect = la.incorrect;
  S.skipped   = la.skipped;
  S.idx       = la.idx;
  S.flipped   = false;
  S.userAns   = '';
  S.adaptExplain = null;

  const deckId = S.studyId || S.selDeck;
  if (deckId && la.card.id) {
    import('./firebase-sync.js').then(({ syncUndoLastReview }) => {
      syncUndoLastReview(deckId, la.card.id).catch(err => console.warn("Sync undo failed:", err));
    }).catch(e => console.warn("Could not load firebase-sync module for undo:", e));
  }

  S.lastAction = null;
  persist();
  renderStudy();
  toast('↩ Undone!');
}
 
async function trackStudyActivity(correct = 1, incorrect = 0, skipped = 0, timeSpentSecs = 0, deckId?: string) {
  const timestamp = new Date().toISOString();
  const entry = {
    correct,
    incorrect,
    skipped,
    timeSpentSecs: timeSpentSecs || 4,
    deckId: deckId || S.studyId || ''
  };
  try {
    const raw: any = (await localforage.getItem('ftp-activity')) || {};
    raw[timestamp] = entry;
    await localforage.setItem('ftp-activity', raw);
  } catch(_) {
    try {
      const raw = JSON.parse(localStorage.getItem('ftp-activity') || '{}');
      raw[timestamp] = entry;
      localStorage.setItem('ftp-activity', JSON.stringify(raw));
    } catch(_) {}
  }
  updateStreakUI();
}
 
// ─── EXAM MODE ────────────────────────────────────────────────────────────────
 
function renderExamSetup(el) {
  const deck   = S.decks[S.studyId];
  const count  = deck.cards.length;
  el.innerHTML = `
    <div class="exam-setup">
      <h3 style="display:flex;align-items:center;gap:6px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:var(--accent)"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
        <span>Exam Mode</span>
      </h3>
      <div class="exam-setup-sub">${escH(deck.name)} · ${count} card${count!==1?'s':''} · Type your answers, no hints, graded at the end</div>
 
      <div style="font-size:12px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px">Time Limit</div>
      <div class="exam-opt-grid" id="exam-opt-grid">
        <div class="exam-opt selected" data-mins="0" onclick="examSelectTime(this,0)">
          <div class="exam-opt-title">No limit</div>
          <div class="exam-opt-sub">Take as long as you need</div>
        </div>
        <div class="exam-opt" data-mins="10" onclick="examSelectTime(this,10)">
          <div class="exam-opt-title">10 minutes</div>
          <div class="exam-opt-sub">~${Math.round(60/count*10)}s per card</div>
        </div>
        <div class="exam-opt" data-mins="20" onclick="examSelectTime(this,20)">
          <div class="exam-opt-title">20 minutes</div>
          <div class="exam-opt-sub">~${Math.round(60/count*20)}s per card</div>
        </div>
        <div class="exam-opt" data-mins="custom" onclick="examSelectTime(this,'custom')">
          <div class="exam-opt-title">Custom</div>
          <div class="exam-opt-sub">Enter your own time</div>
        </div>
      </div>
 
      <div class="exam-custom-row" id="exam-custom-row" style="display:none">
        <input type="number" id="exam-custom-mins" min="1" max="180" value="15" placeholder="mins">
        <span style="font-size:13px;color:var(--text2)">minutes</span>
      </div>
 
      <div style="font-size:12px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.07em;margin-bottom:10px">Cards</div>
      <div class="exam-opt-grid" id="exam-card-grid">
        <div class="exam-opt selected" data-cards="all" onclick="examSelectCards(this,'all')">
          <div class="exam-opt-title">All cards</div>
          <div class="exam-opt-sub">${count} card${count!==1?'s':''}</div>
        </div>
        <div class="exam-opt" data-cards="shuffle" onclick="examSelectCards(this,'shuffle')">
          <div class="exam-opt-title">Shuffled</div>
          <div class="exam-opt-sub">Random order</div>
        </div>
        ${S.srsEnabled ? `<div class="exam-opt" data-cards="due" onclick="examSelectCards(this,'due')">
          <div class="exam-opt-title">Due cards only</div>
          <div class="exam-opt-sub">${deck.cards.filter(c=>c.due<=Date.now()).length} due</div>
        </div>` : ''}
        <div class="exam-opt" data-cards="weak" onclick="examSelectCards(this,'weak')">
          <div class="exam-opt-title">Weak cards</div>
          <div class="exam-opt-sub">${deck.cards.filter(c=>(c.mistakes||0)>=2).length} with 2+ mistakes</div>
        </div>
      </div>
 
      <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">
        <button class="btn btn-g" style="font-size:14px;padding:11px 28px" onclick="examStart()">Start Exam →</button>
        <div style="font-size:12px;color:var(--text3);align-self:center">No SRS updates during exam · No hints · No AI</div>
      </div>
    </div>`;
 
  window._examTimeMins   = 0;
  window._examCardMode   = 'all';
}
 
function examSelectTime(el, mins) {
  document.querySelectorAll('#exam-opt-grid .exam-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  window._examTimeMins = mins;
  const customRow = document.getElementById('exam-custom-row');
  if (customRow) customRow.style.display = mins === 'custom' ? 'flex' : 'none';
}

function examSelectCards(el, mode) {
  document.querySelectorAll('#exam-card-grid .exam-opt').forEach(o => o.classList.remove('selected'));
  el.classList.add('selected');
  window._examCardMode = mode;
}

function examStart() {
  const deck   = S.decks[S.studyId];
  if (!deck) return;

  // Build card set
  let cards = [...deck.cards];
  const mode = window._examCardMode || 'all';
  if (mode === 'shuffle')  { shuffle(cards); }
  else if (mode === 'due') { cards = cards.filter(c => c.due <= Date.now()); if (!cards.length) { toast('No cards due right now!'); return; } }
  else if (mode === 'weak'){ cards = cards.filter(c => (c.mistakes||0) >= 2); if (!cards.length) { toast('No weak cards (2+ mistakes) found!'); return; } }

  // Resolve time
  let mins = window._examTimeMins;
  if (mins === 'custom') {
    mins = parseInt((document.getElementById('exam-custom-mins') as HTMLInputElement)?.value) || 15;
  }

  // Set state
  S.queue            = cards;
  S.idx              = 0;
  S.examActive       = true;
  S.examAnswers      = new Array(cards.length).fill(null).map(() => ({ answer: '', verdict: 'skipped' }));
  S.examTimerTotal   = mins > 0 ? mins * 60 : 0;
  S.examTimerSecs    = S.examTimerTotal;
  S.examTimeElapsed  = 0;

  examStartTimer();
  renderStudy();
}

function examStartTimer() {
  examStopTimer();
  if (!S.examActive || S.idx >= S.queue.length) return;
  S.examTimerInterval = setInterval(() => {
    S.examTimeElapsed++;
    if (S.examTimerTotal > 0) {
      S.examTimerSecs--;
      if (S.examTimerSecs <= 0) {
        S.examTimerSecs = 0;
        examStopTimer();
        toast('⏰ Time\'s up! Grading your exam…');
        examFinish();
        return;
      }
    }
    // Update timer bar live without full re-render
    const clock = document.getElementById('exam-clock');
    const fill  = document.getElementById('exam-timer-fill');
    if (clock) {
      const left = S.examTimerTotal > 0 ? S.examTimerSecs : S.examTimeElapsed;
      clock.textContent = examFmtTime(left);
      const pct = S.examTimerTotal > 0 ? (S.examTimerSecs / S.examTimerTotal) * 100 : null;
      if (pct !== null) {
        if (fill)  fill.style.width = pct + '%';
        const cls = pct < 15 ? 'danger' : pct < 30 ? 'warn' : '';
        clock.className = 'exam-timer-clock' + (cls ? ' ' + cls : '');
        if (fill)  fill.className = 'exam-timer-fill' + (cls ? ' ' + cls : '');
      }
    }
  }, 1000);
}

function examStopTimer() {
  if (S.examTimerInterval) { clearInterval(S.examTimerInterval); S.examTimerInterval = null; }
}
 
function examFmtTime(secs) {
  const m = Math.floor(secs / 60), s = secs % 60;
  return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
}
 
function renderExamQuestion(el) {
  const card   = S.queue[S.idx];
  const total  = S.queue.length;
  const pct    = Math.round((S.idx / total) * 100);
  const saved  = S.examAnswers[S.idx]?.answer || '';
 
  // Timer bar (always shown — shows elapsed if untimed)
  const timed     = S.examTimerTotal > 0;
  const clockVal  = timed ? examFmtTime(S.examTimerSecs) : examFmtTime(S.examTimeElapsed);
  const fillPct   = timed ? (S.examTimerSecs / S.examTimerTotal * 100) : null;
  const timerCls  = timed ? (fillPct < 15 ? ' danger' : fillPct < 30 ? ' warn' : '') : '';
 
  el.innerHTML = `
    <div class="exam-timer-bar">
      <span class="exam-timer-clock${timerCls}" id="exam-clock">${clockVal}</span>
      ${timed
        ? `<div class="exam-timer-track"><div class="exam-timer-fill${timerCls}" id="exam-timer-fill" style="width:${fillPct}%"></div></div>`
        : `<span class="exam-timer-label" style="flex:1">${timed?'remaining':'elapsed'}</span>`
      }
      <span class="exam-timer-label">Q ${S.idx+1} / ${total}</span>
      <button class="btn btn-r" style="font-size:11px;padding:5px 10px" onclick="examAbort()">✕ Quit</button>
    </div>
 
    <div class="prog-wrap" style="margin-bottom:20px">
      <div class="prog-info"><span>${S.idx+1} of ${total}</span><span>${pct}%</span></div>
      <div class="prog-track"><div class="prog-fill" style="width:${pct}%"></div></div>
    </div>
 
    <div class="exam-q-wrap">
      <div class="exam-q-label">Question ${S.idx+1}</div>
      <div class="exam-q-text">${escH(card.q)}</div>
      <textarea
        class="exam-ans-input"
        id="exam-ans"
        rows="3"
        placeholder="Type your answer…"
        oninput="S.examAnswers[S.idx].answer = this.value"
      >${escH(saved)}</textarea>
      <div class="exam-skip-hint">Leave blank to skip · Ctrl+Enter or ↵ twice = next question</div>
    </div>
 
    <div class="exam-nav">
      ${S.idx > 0 ? `<button class="btn" onclick="examNav(-1)">← Back</button>` : ''}
      ${S.idx < total - 1
        ? `<button class="btn btn-g" onclick="examNav(1)">Next →</button>`
        : `<button class="btn btn-g" style="font-size:14px;padding:11px 24px" onclick="examFinish()">Finish &amp; Grade →</button>`
      }
      <span style="font-size:12px;color:var(--text3);margin-left:auto">${S.examAnswers.filter(a=>a&&a.answer.trim()).length} / ${total} answered</span>
    </div>`;
 
  // Focus answer field, cursor at end
  const inp = document.getElementById('exam-ans');
  if (inp && window.innerWidth > 768) {
    inp.focus();
    inp.setSelectionRange(inp.value.length, inp.value.length);
  }
 
  // Ctrl+Enter or two newlines = go next
  if (inp) {
    inp.addEventListener('keydown', e => {
      if ((e.key === 'Enter' && e.ctrlKey) || (e.key === 'Enter' && !e.shiftKey && inp.value.endsWith('\n'))) {
        e.preventDefault();
        S.examAnswers[S.idx].answer = inp.value.replace(/\n$/, '').trim();
        if (S.idx < S.queue.length - 1) examNav(1); else examFinish();
      }
    });
  }
}
 
function examNav(dir) {
  // Save current answer before moving
  const inp = document.getElementById('exam-ans');
  if (inp) S.examAnswers[S.idx].answer = inp.value.trim();
  S.idx = Math.max(0, Math.min(S.idx + dir, S.queue.length - 1));
  renderStudy();
}
 
function examAbort() {
  if (!confirm('Quit this exam? Your answers won\'t be saved.')) return;
  examStopTimer();
  S.examActive = false;
  S.idx = 0;
  renderStudy();
}
 
function examFinish() {
  examStopTimer();
  // Save any last answer still in the textarea
  const inp = document.getElementById('exam-ans');
  if (inp && S.idx < S.examAnswers.length) {
    S.examAnswers[S.idx].answer = inp.value.trim();
  }
 
  // Grade all answers with ruleBasedGrade (offline, deterministic, no SRS side-effects)
  S.queue.forEach((card, i) => {
    const ans = (S.examAnswers[i]?.answer || '').trim();
    if (!ans) {
      S.examAnswers[i] = { answer: '', verdict: 'skipped', card };
    } else {
      const result = ruleBasedGrade(ans, card.a);
      S.examAnswers[i] = {
        answer: ans,
        verdict: result ? result.verdict : 'incorrect',
        reason:  result ? result.reason  : '',
        card
      };
    }
  });
 
  // Move to report card view
  S.examActive = false;
  S.idx = S.queue.length; // trigger renderDone-like path
  renderStudy();
}
 
function renderExam(el) {
  if (!S.studyId || !S.queue.length) {
    el.innerHTML = `<div class="empty-msg">Select a deck with cards to start an exam.</div>`;
    return;
  }
  if (!S.examActive && S.idx < S.queue.length) { renderExamSetup(el); return; }
  if (!S.examActive && S.idx >= S.queue.length && S.examAnswers.length) {
    renderExamReport(el);
    return;
  }
  if (!S.examActive) { renderExamSetup(el); return; }
  renderExamQuestion(el);
}
 
function renderExamReport(el) {
  const answers = S.examAnswers;
  const total   = answers.length;
  const correct = answers.filter(a => a.verdict === 'correct').length;
  const partial = answers.filter(a => a.verdict === 'partial').length;
  const wrong   = answers.filter(a => a.verdict === 'incorrect').length;
  const skipped = answers.filter(a => a.verdict === 'skipped').length;
  const pct     = total ? Math.round(((correct + partial * 0.5) / total) * 100) : 0;
  const grade   = pct >= 80 ? 'A' : pct >= 65 ? 'B' : pct >= 50 ? 'C' : pct >= 35 ? 'D' : 'F';
  const gradeClass = pct >= 65 ? 'pass' : pct >= 40 ? 'ok' : 'fail';
  const timeTxt = examFmtTime(S.examTimeElapsed);
 
  el.innerHTML = `
    <div class="exam-report">
      <div class="exam-grade-banner">
        <div class="exam-grade-score ${gradeClass}">${grade}</div>
        <div class="exam-grade-label">${pct}% · ${timeTxt} · ${escH(S.decks[S.studyId]?.name || '')}</div>
        <div class="exam-stat-row">
          <span class="exam-stat-pill" style="background:rgba(var(--accent-rgb),0.15);color:var(--accent)">✓ ${correct} correct</span>
          ${partial ? `<span class="exam-stat-pill" style="background:rgba(255,209,102,0.15);color:var(--yellow)">~ ${partial} partial</span>` : ''}
          <span class="exam-stat-pill" style="background:rgba(255,107,107,0.15);color:var(--red)">✗ ${wrong} wrong</span>
          ${skipped ? `<span class="exam-stat-pill" style="background:var(--surface2);color:var(--text3)">→ ${skipped} skipped</span>` : ''}
        </div>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:18px">
          <button class="btn btn-g" onclick="examRetry()">↺ Retake Exam</button>
          <button class="btn" onclick="examRetryWrong()">↺ Retry Wrong Only</button>
          <button class="btn" onclick="S.examActive=false;S.idx=0;renderStudy()">Back to Setup</button>
        </div>
      </div>
 
      <div class="exam-breakdown">
        <div class="exam-breakdown-hdr">
          Results breakdown
          <div class="exam-breakdown-filter">
            <button class="exam-filter-btn active" id="ebf-all"   onclick="examFilter('all')">All</button>
            <button class="exam-filter-btn"         id="ebf-wrong" onclick="examFilter('wrong')">Wrong</button>
            <button class="exam-filter-btn"         id="ebf-right" onclick="examFilter('right')">Correct</button>
          </div>
        </div>
        <div id="exam-rows">
          ${answers.map((a, i) => examRowHTML(a, i)).join('')}
        </div>
      </div>
    </div>`;
}
 
function examRowHTML(a, i) {
  const icon = a.verdict === 'correct' ? '✓' : a.verdict === 'partial' ? '~' : a.verdict === 'skipped' ? '→' : '✗';
  const cls  = a.verdict === 'correct' ? 'correct' : a.verdict === 'partial' ? 'correct' : a.verdict === 'skipped' ? 'skipped' : 'wrong';
  const q    = escH((a.card?.q || '').slice(0, 120));
  const correct_ans = escH(a.card?.a || '');
  const your_ans    = escH(a.answer || '');
 
  return `<div class="exam-row ${cls}" data-verdict="${a.verdict}">
    <div class="exam-row-icon">${icon}</div>
    <div>
      <div class="exam-row-q">${i+1}. ${q}</div>
      ${a.verdict === 'skipped'
        ? `<div class="exam-row-skipped-label">skipped</div><div class="exam-row-correct">Answer: ${correct_ans}</div>`
        : `<div class="exam-row-your">Your answer: ${your_ans}</div>
           ${a.verdict !== 'correct' ? `<div class="exam-row-correct">Correct: ${correct_ans}</div>` : ''}`
      }
    </div>
  </div>`;
}
 
function examFilter(type) {
  document.querySelectorAll('.exam-filter-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('ebf-' + (type === 'all' ? 'all' : type === 'wrong' ? 'wrong' : 'right'))?.classList.add('active');
  document.querySelectorAll('.exam-row').forEach(row => {
    const v = row.dataset.verdict;
    let show = true;
    if (type === 'wrong') show = v === 'incorrect' || v === 'partial' || v === 'skipped';
    if (type === 'right') show = v === 'correct';
    row.style.display = show ? '' : 'none';
  });
}
 
function examRetry() {
  S.examActive = false;
  S.idx = 0;
  S.examAnswers = [];
  renderStudy();
}
 
function examRetryWrong() {
  const wrongCards = S.examAnswers
    .filter(a => a.verdict !== 'correct')
    .map(a => a.card)
    .filter(Boolean);
  if (!wrongCards.length) { toast('No wrong answers to retry!'); return; }
  S.queue        = wrongCards;
  S.idx          = 0;
  S.examAnswers  = new Array(wrongCards.length).fill(null).map(() => ({ answer: '', verdict: 'skipped' }));
  S.examActive   = true;
  S.examTimerTotal  = 0;
  S.examTimerSecs   = 0;
  S.examTimeElapsed = 0;
  examStartTimer();
  renderStudy();
  toast(`Retrying ${wrongCards.length} wrong card${wrongCards.length!==1?'s':''}…`);
}
 
 
function renderDone(el) {
  const total=S.queue.length||1;
  const score=Math.round((S.correct/total)*100);
  const feedbackIcon = score >= 80 
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px;color:#f59e0b;display:inline-block"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h16v-2h-5c-.55 0-1-.45-1-1v-2.34"/><path d="M12 2a6 6 0 0 1 6 6v3.5c0 3.3-2.7 6-6 6s-6-2.7-6-6V8a6 6 0 0 1 6-6z"/></svg>`
    : score >= 50
    ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px;color:var(--accent);display:inline-block"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/></svg>`
    : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px;color:var(--blue);display:inline-block"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`;

  el.innerHTML=`<div class="done-wrap" id="done-wrap-el">
    <div class="done-emoji" style="margin-bottom:12px">${feedbackIcon}</div>
    <div class="done-title">Session Complete!</div>
    <div class="done-sub">Score: ${score}% — ${S.correct} of ${total} correct</div>
    <div class="done-pills">
      <span class="pill" style="background:rgba(var(--accent-rgb),0.15);color:var(--accent);padding:6px 18px">Got it: ${S.correct}</span>
      <span class="pill" style="background:rgba(255,107,107,0.15);color:var(--red);padding:6px 18px">Missed: ${S.incorrect}</span>
      <span class="pill" style="background:var(--surface2);color:var(--text3);padding:6px 18px">Skipped: ${S.skipped}</span>
    </div>
    <div class="done-acts">
      <button class="btn btn-g" onclick="doReset()">↺ All Cards</button>
      <button class="btn" onclick="doDue()" style="display:inline-flex;align-items:center;gap:6px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <span>Study Due</span>
      </button>
      <button class="btn" onclick="doShuffle()">⇄ Shuffle Again</button>
    </div>
  </div>`;
  if(S.studyId) updateDueBadge(S.decks[S.studyId]);
  renderSidebar();
  // Confetti for good scores
  if (score >= 70) {
    requestAnimationFrame(() => spawnConfetti(document.getElementById('done-wrap-el'), score));
  }
}
 
function spawnConfetti(wrap, score) {
  if (!wrap) return;
  const colors = ['#a8ff78','#6bb5ff','#ffd166','#c084fc','#ff6b6b','#fb7185','#2dd4bf'];
  const count  = score >= 90 ? 28 : 16;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.cssText = `
      left:${10 + Math.random()*80}%;
      top:${Math.random()*30}%;
      background:${colors[Math.floor(Math.random()*colors.length)]};
      width:${5+Math.random()*6}px;height:${5+Math.random()*6}px;
      border-radius:${Math.random()>.5?'50%':'2px'};
      animation-delay:${Math.random()*0.5}s;
      animation-duration:${0.9+Math.random()*0.6}s;
    `;
    wrap.appendChild(p);
    setTimeout(() => p.remove(), 1800);
  }
}
 
// ─── ADAPTIVE DIFFICULTY ──────────────────────────────────────────────────────
async function getAdaptExplain() {
  const card = S.queue[S.idx]; if (!card) return;
  S.adaptExplain = '⟳ Loading explanation...'; renderStudy();
  try {
    const resp = await AIProvider.generate(
      `A student keeps getting this wrong (${card.mistakes} times). Explain this concept simply in 2-3 sentences for a beginner:\n\nConcept: ${card.q}\nAnswer: ${card.a}`,
      300
    );
    S.adaptExplain = resp || 'Could not get explanation — AI unavailable.';
  } catch(e) { S.adaptExplain = `Error: ${e.message}`; }
  renderStudy();
}

// fetchWithTimeout now lives in utils.ts; Ollama support has been removed.
 
// ─── PDF TEXT EXTRACTION (PDF.js) ────────────────────────────────────────────
async function extractPdfText(arrayBuffer) {
  if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js not loaded — requires internet on first use. Try again when online.');
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const pageText = content.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
  }
  return fullText.trim();
}
 
// ─── FILE DROP ────────────────────────────────────────────────────────────────
function dzOver(e){e.preventDefault();document.getElementById('dz').classList.add('over');}
function dzLeave(){document.getElementById('dz').classList.remove('over');}
function dzDrop(e){e.preventDefault();document.getElementById('dz').classList.remove('over');if(e.dataTransfer.files[0])processFile(e.dataTransfer.files[0]);}
function onFile(e){if(e.target.files[0])processFile(e.target.files[0]);e.target.value='';}
 
function showGenStep(step) {
  const steps=['Reading file','Summarizing','Generating cards'];
  document.getElementById('gen-area').innerHTML=`
    <div class="gen-box">
      <div class="spinner"></div>
      <div class="gen-title" id="gen-t">${steps[step]}...</div>
      <div class="gen-sub" id="gen-s">AI is working</div>
      <div class="gen-steps">
        ${steps.map((s,i)=>`<span class="gen-step${i<step?' done':i===step?' active':''}">${i<step?'✓ ':i===step?'⟳ ':''}${s}</span>`).join('')}
      </div>
    </div>`;
}
 
async function processFile(file) {
  const ext=file.name.split('.').pop().toLowerCase();
  if(!['pdf','txt','png','jpg','jpeg','md','docx'].includes(ext)){toast('Unsupported file type.');return;}
  document.getElementById('summary-box').style.display='none';
  showGenStep(0);
 
  try {
    let text='';
    if(ext==='txt'||ext==='md'){
      text = await file.text();
    } else if(ext==='docx'){
      if(typeof mammoth==='undefined') throw new Error('Word (.docx) support needs an internet connection to load the mammoth library.');
      const buf = await file.arrayBuffer();
      const result = await mammoth.extractRawText({ arrayBuffer: buf });
      text = result.value;
      if(!text||text.length<20) throw new Error('Could not extract text from the Word document.');
    } else if(ext==='pdf'){
      const buf = await file.arrayBuffer();
      text = await extractPdfText(buf);
      if(!text||text.length<50) throw new Error('Could not extract text from PDF. The PDF may be scanned/image-based — try a text-based PDF.');
    } else {
      // image — vision model
      const dataUrl = await readFileAsDataURL(file);
      await runVisionPipeline(dataUrl, file.type, file.name);
      return;
    }
    await runPipeline(text, file.name);
  } catch(e) {
    showGenErr(e.message);
  }
}
 
function readFileAsDataURL(file) {
  return new Promise((res,rej)=>{
    const r=new FileReader();
    r.onload=e=>res(e.target.result);
    r.onerror=()=>rej(new Error('File read error'));
    r.readAsDataURL(file);
  });
}
 
async function runVisionPipeline(dataUrl, _mimeType, fname) {
  showGenStep(0);
  showGenErr('Image analysis is not supported in this build. Upload text, PDF, or document files instead.');
}
 
// ─── MAIN AI PIPELINE: summarize → generate cards ─────────────────────────────
async function runPipeline(text, fname) {
  // Route to rule-based engine if no AI selected
  if (S.aiProvider === 'noai') {
    runRuleBasedPipeline(text, fname);
    return;
  }
 
  const cardCount = parseInt(document.getElementById('card-count-slider')?.value || '12');
 
  // Step 1: Summarize
  showGenStep(1);
  let summary = '';
  try {
    summary = await AIProvider.generate(
      `Summarize the key study concepts from this material. Focus on definitions, formulas, and important ideas. Be concise and well-structured.\n\n${text.slice(0,7000)}`,
      800
    );
    if (summary) {
      document.getElementById('summary-box').style.display = 'block';
      document.getElementById('summary-text').textContent = summary;
    }
  } catch(e) { summary = text; }
 
  // Step 2: Generate flashcards
  showGenStep(2);
  const source = summary || text;
  const prompt = `You are a flashcard generator. Read the study material below and generate exactly ${cardCount} high-quality question-and-answer flashcard pairs covering key concepts, formulas, and definitions.
 
IMPORTANT: Respond ONLY with a valid JSON array. No markdown fences, no explanation, no text before or after the array. Start your response with [ and end with ].
 
[
  {"q": "Question?", "a": "Answer."},
  {"q": "Another question?", "a": "Another answer."}
]
 
Study material:
${source.slice(0,6000)}`;
 
  try {
    const raw = await AIProvider.generate(prompt, 3500);
    await saveGeneratedCards(raw, fname, prompt);
  } catch(e) { showGenErr(e.message); }
}
 
// ─── RULE-BASED CARD EXTRACTOR (no AI, fully offline) ─────────────────────────
const CONF_AUTO = 0.65; // >= this → auto-saved; below → review bin
 
function runRuleBasedPipeline(text, fname) {
  const cardCount = parseInt(document.getElementById('card-count-slider')?.value || '12');
  document.getElementById('gen-area').innerHTML = `
    <div class="gen-box">
      <div class="spinner"></div>
      <div class="gen-title">Scanning "${escH(fname)}"...</div>
      <div class="gen-sub">Extracting definitions, terms and patterns</div>
    </div>`;
 
  setTimeout(() => {
    const all = extractCardsFromText(text, cardCount * 3); // get more, then filter
    if (!all.length) {
      showGenErr('No extractable patterns found. Try a file with definitions, Q&A pairs, or numbered lists.');
      return;
    }
 
    // Split by confidence
    let autoCards   = all.filter(c => (c._conf || 0) >= CONF_AUTO);
    let reviewCards = all.filter(c => (c._conf || 0) <  CONF_AUTO);
 
    // If high-confidence cards don't fill the slider target, top-up from
    // the review bin (sorted best-first) so the count is always respected.
    if (autoCards.length < cardCount && reviewCards.length) {
      const reviewSorted = [...reviewCards].sort((a, b) => (b._conf||0) - (a._conf||0));
      const needed       = cardCount - autoCards.length;
      const promoted     = reviewSorted.splice(0, needed);
      autoCards          = autoCards.concat(promoted);
      // Rebuild reviewCards without the promoted ones
      const promotedKeys = new Set(promoted.map(c => c.q.toLowerCase()));
      reviewCards        = reviewCards.filter(c => !promotedKeys.has(c.q.toLowerCase()));
    }
    autoCards = autoCards.slice(0, cardCount);
 
    // Auto-save the confident ones
    let deckId = null;
    if (autoCards.length) {
      deckId = uid();
      const name = fname.replace(/\.[^.]+$/, '').slice(0, 40);
      S.decks[deckId] = { name, cards: autoCards.map(c => makeCard(c.q, c.a)), ai: false };
      persist(); renderSidebar(); updateStats();
      selectDeck(deckId);
    }
 
    // Render result + optional review bin
    const confPct = c => Math.round((c._conf || 0) * 100);
    const confColor = c => (c._conf||0) >= 0.8 ? 'var(--accent)' : (c._conf||0) >= 0.65 ? 'var(--yellow)' : 'var(--text3)';
 
    const reviewHtml = reviewCards.length ? `
      <div style="margin-top:14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--r);padding:14px">
        <div style="font-size:13px;font-weight:600;margin-bottom:4px;color:var(--text);display:flex;align-items:center;gap:6px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;color:var(--accent)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Review Bin — ${reviewCards.length} uncertain card${reviewCards.length!==1?'s':''}</span>
        </div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:12px">
          These matched patterns but scored below ${Math.round(CONF_AUTO*100)}% confidence. Accept or discard each one.
        </div>
        <div id="review-bin-cards" style="display:flex;flex-direction:column;gap:8px">
          ${reviewCards.map((c,i) => `
            <div id="rbc-${i}" style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:10px 12px;display:flex;gap:10px;align-items:flex-start">
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;color:var(--text);margin-bottom:3px">${escH(c.q)}</div>
                <div style="font-size:11px;color:var(--text2)">${escH(c.a)}</div>
                <div style="margin-top:5px;display:flex;align-items:center;gap:6px">
                  <div style="flex:1;height:3px;background:var(--surface3);border-radius:2px;overflow:hidden">
                    <div style="height:100%;width:${confPct(c)}%;background:${confColor(c)};border-radius:2px"></div>
                  </div>
                  <span style="font-size:10px;color:${confColor(c)};flex-shrink:0">${confPct(c)}% · ${c._source||'?'}</span>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">
                <button onclick="acceptReviewCard(${i},'${deckId||''}')" title="Accept"
                  style="background:rgba(var(--accent-rgb),.15);border:1px solid rgba(var(--accent-rgb),.4);color:var(--accent);
                  border-radius:var(--rs);padding:4px 9px;font-size:12px;cursor:pointer;font-family:inherit;white-space:nowrap">✓ Add</button>
                <button onclick="document.getElementById('rbc-${i}').remove()" title="Discard"
                  style="background:none;border:1px solid var(--border);color:var(--text3);
                  border-radius:var(--rs);padding:4px 9px;font-size:12px;cursor:pointer;font-family:inherit">✕</button>
              </div>
            </div>`).join('')}
        </div>
      </div>` : '';
 
    document.getElementById('gen-area').innerHTML = `
      <div class="gen-box" style="color:var(--accent)">
        ✓ ${autoCards.length} card${autoCards.length!==1?'s':''} auto-saved${reviewCards.length ? ` · ${reviewCards.length} in review` : ''} — "${escH(fname)}"
      </div>
      ${reviewHtml}`;
 
    if (!reviewCards.length) setTimeout(() => { document.getElementById('gen-area').innerHTML = ''; }, 4000);
    toast(`${autoCards.length} cards saved${reviewCards.length ? `, ${reviewCards.length} need review` : ''}!`);
 
    // Store review cards for accept handler
    window._reviewCards = reviewCards;
    window._reviewFname = fname;
  }, 80);
}
 
function acceptReviewCard(idx, deckId) {
  const c = window._reviewCards?.[idx];
  if (!c) return;
  const fname = window._reviewFname || 'Imported';
  let isNewDeck = false;
  if (!deckId || !S.decks[deckId]) {
    // No deck yet — create one
    deckId = uid();
    S.decks[deckId] = { name: fname.replace(/\.[^.]+$/,'').slice(0,40), cards: [], ai: false, createdAt: Date.now() };
    isNewDeck = true;
  }
  const newCard = makeCard(c.q, c.a);
  S.decks[deckId].cards.push(newCard);
  persist(); renderSidebar(); updateStats();
  selectDeck(deckId);

  // Sync added card (and new deck if needed) to Firestore
  import('./firebase-sync.js').then(({ syncCreateDeck, syncAddCard }) => {
    if (isNewDeck) {
      syncCreateDeck(deckId, S.decks[deckId].name)
        .then(() => {
          syncAddCard(deckId, newCard).catch(err => console.warn("Accept review card sync failed:", err));
        })
        .catch(err => console.warn("Accept review deck sync failed:", err));
    } else {
      syncAddCard(deckId, newCard).catch(err => console.warn("Accept review card sync failed:", err));
    }
  }).catch(e => console.warn("Could not load firebase-sync module for acceptReviewCard sync:", e));

  const el = document.getElementById(`rbc-${idx}`);
  if (el) { el.style.opacity='0.4'; el.style.pointerEvents='none'; el.querySelector('button').textContent='✓ Added'; }
  toast('Card added!');
}
 
function isQualityCard(q, a) {
  const junk = ['note', 'warning', 'remember', 'hint', 'important', 'disclaimer', 'tip', 'example', 'see', 'figure', 'table', 'source'];
  const lq = q.toLowerCase().trim();
  if (junk.some(w => lq.startsWith(w + ':') || lq === w)) return false;
 
  const isFillIn = q.startsWith('Fill in:');
 
  // Normal questions should be concise; FITB sentences need room for context
  if (!isFillIn && q.split(' ').length > 8) return false;
  if (isFillIn && q.split(' ').length < 6)  return false; // kills "The ___ is the" fragments
  if (isFillIn && q.split(' ').length > 25)  return false; // prevents wall-of-text cards
 
  if (a.length < 8) return false;
  if (/^\d+$/.test(q.trim())) return false;
 
  const subject = q.replace(/^What (is|are|does|do)\s+/i, '').replace(/\?$/, '');
  if (!isFillIn && subject.split(/\s+/).length > 4) return false;
 
  return true;
}
 
// Returns 0.0–1.0 confidence. Cards >= 0.65 auto-save; below go to review bin.
function cardConfidence(q, a, source) {
  let score = 0.5; // base
 
  // Source bonus: NLP strategies rank higher than regex fallback
  // compromise (surface-pattern NLP)
  if (source === 'nlp-def')       score += 0.30;  // "X is a Y" structure
  if (source === 'nlp-namedDef')  score += 0.35;  // "X is defined as Y"
  if (source === 'nlp-svo')       score += 0.15;  // subject-verb-object
  if (source === 'nlp-adj')       score += 0.10;  // adjective description
  if (source === 'nlp-fitb')      score += 0.10;  // fill-in-the-blank
  // wink-nlp (POS-tag-aware — ranks ABOVE compromise because it's more precise)
  if (source === 'wink-def')      score += 0.35;  // POS-verified definition
  if (source === 'wink-namedDef') score += 0.38;  // POS-verified "defined as"
  if (source === 'wink-svo')      score += 0.20;  // POS-verified SVO triple
  if (source === 'wink-ner')      score += 0.25;  // named-entity context card
  if (source === 'wink-fitb')     score += 0.18;  // stopword-filtered FITB
  // regex fallback
  if (source === 'regex')         score -= 0.15;  // regex is less trustworthy
 
  // Answer quality
  const wordCount = a.split(' ').length;
  if (wordCount >= 3 && wordCount <= 25)  score += 0.10;
  if (a.length > 20)                      score += 0.05;
  if (/[.!]$/.test(a))                    score += 0.05; // ends like a sentence
 
  // Question quality
  if (/^(What|How|Why|Who|When|Where|Which|Define|Describe)/.test(q)) score += 0.05;
  if (q.includes('_____'))                score -= 0.05; // fill-in slightly lower
 
  // Penalty: super short or super long answer
  if (a.length < 12)  score -= 0.15;
  if (a.length > 300) score -= 0.10;
 
  return Math.max(0, Math.min(1, score));
}
 
function extractCardsFromText(text, limit) {
  const cards = [];
  const seen  = new Set();
 
  function add(q, a, source='regex') {
    q = q.trim().replace(/\s+/g, ' ');
    a = a.trim().replace(/\s+/g, ' ');
    if (!q || !a || q.length < 6 || a.length < 3) return;
    if (q.length > 220 || a.length > 400) return;
    if (!isQualityCard(q, a)) return;
    const key = q.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const conf = cardConfidence(q, a, source);
    cards.push({ q, a, _conf: conf, _source: source });
  }
 
  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
 
  // ── 1. Explicit Q:/A: pairs (always trust these) ─────────────────────────────
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^Q[:\.\)]/i.test(lines[i]) && /^A[:\.\)]/i.test(lines[i+1])) {
      add(lines[i].replace(/^Q[:\.\)]\s*/i,''), lines[i+1].replace(/^A[:\.\)]\s*/i,''));
    }
  }
 
  // ── 2. Lines that are already questions ──────────────────────────────────────
  for (let i = 0; i < lines.length - 1; i++) {
    const line = lines[i];
    if (/\?$/.test(line) && line.length > 15 && line.length < 200) {
      const ans = lines[i+1];
      if (ans && !/\?$/.test(ans) && ans.length > 5) add(line, ans);
    }
  }
 
  // ── 3. Formula / equation lines ──────────────────────────────────────────────
  for (const line of lines) {
    const m = line.match(/^(.{5,50}?)\s*[=:]\s*(.{3,80})$/);
    if (m && /[a-zA-Z\u03B1-\u03C9\u0391-\u03A9\d]/.test(m[2])) {
      const lhs = m[1].trim(), rhs = m[2].trim();
      if (!lhs.includes('?') && lhs.split(/\s+/).length <= 6)
        add(`What is the formula/value for: ${lhs}?`, rhs);
    }
  }
 
  // ── 4–8. Smart-first: try NLP brain; fallback to stricter regex only if needed ─
  const nlpCards = [];
  const nlpSeen  = new Set();
  function addNlp(q, a, src='nlp-def') {
    q = q.trim().replace(/\s+/g, ' ');
    a = a.trim().replace(/\s+/g, ' ');
    if (!q || !a || q.length < 6 || a.length < 8) return;
    if (q.length > 220 || a.length > 400) return;
    if (!isQualityCard(q, a)) return;
    const key = q.toLowerCase();
    if (nlpSeen.has(key) || seen.has(key)) return;
    nlpSeen.add(key);
    const conf = cardConfidence(q, a, src);
    nlpCards.push({ q, a, _conf: conf, _source: src });
  }
 
  if (typeof nlp !== 'undefined') {
    // 4. Definitions: "#Noun+ is/are/means/refers to … #Noun+"
    nlp(text).clauses()
      .match('#Noun+ (is|are|was|were|means|refers to|denotes|represents) #Determiner? #Adjective* #Noun+')
      .forEach(m => {
        const pivot = m.match('(is|are|was|were|means|refers to|denotes|represents)');
        if (!pivot.found) return;
        const parts = m.splitOn(pivot);
        const term  = parts.eq(0).nouns().text('normal').trim();
        const def   = parts.eq(1).text('normal').trim().replace(/^(a|an|the)\s+/i, '');
        if (term && def && term.toLowerCase() !== def.toLowerCase())
          addNlp(`What is ${term}?`, def, 'nlp-def');
      });
 
    // 5. "X is defined as / known as / described as Y"
    nlp(text).clauses()
      .match('#Noun+ (is|are|was) (defined as|known as|described as|called) .+')
      .forEach(m => {
        const pivot = m.match('(defined as|known as|described as|called)');
        if (!pivot.found) return;
        const parts = m.splitOn(pivot);
        const term  = parts.eq(0).nouns().text('normal').trim();
        const def   = parts.eq(1).text('normal').trim();
        if (term && def) addNlp(`What is ${term}?`, def, 'nlp-namedDef');
      });
 
    // 6. Subject → verb → object ("What does/do X do/cause/produce?")
    nlp(text).sentences().forEach(s => {
      const subjDoc = s.match('^#Noun+');
      const subj = subjDoc.text('normal').trim();
      const verb = s.verbs().eq(0).toInfinitive().text('normal').trim();
      const obj  = s.nouns().last().text('normal').trim();
      if (subj && verb && obj && subj !== obj && verb !== 'be') {
        const isPlural = subjDoc.has('#Plural') || subjDoc.has('(they|we|you)');
        const doVerb   = isPlural ? 'do' : 'does';
        addNlp(`What ${doVerb} ${subj} ${verb}?`, obj, 'nlp-svo');
      }
    });
 
    // 7. Multi-word noun fill-in-the-blank
    nlp(text).sentences().forEach(s => {
      const sent = s.text().trim();
 
      // Skip sentences that are too short to provide good context
      if (sent.split(' ').length < 6) return;
 
      s.nouns().out('array').forEach(noun => {
        if (noun.split(' ').length < 2 || noun.length < 8) return;
        const escaped = noun.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const blank = sent.replace(new RegExp(escaped, 'gi'), '_____');
        if (blank !== sent) addNlp(`Fill in: "${blank}"`, noun, 'nlp-fitb');
      });
    });
 
    // 8. Adjective descriptions: "X is [very] Adj+" → "How would you describe X?"
    nlp(text).clauses()
      .match('#Noun+ #Copula #Adverb? #Adjective+')
      .forEach(m => {
        const noun = m.match('^#Noun+').text('normal').trim();
        const adj  = m.match('#Adjective+$').text('normal').trim();
        if (noun && adj) addNlp(`How would you describe ${noun}?`, adj, 'nlp-adj');
      });
  }
 
  // ── wink-nlp strategies (POS-tag-aware, complements compromise above) ────────
  if (winkNlpInst) {
    try {
      const doc = winkNlpInst.readDoc(text);
      const its = winkIts;
 
      // ── W1. POS-based definition extraction ──────────────────────────────────
      // Finds "[Subject NP] is/are/means/... [Definition NP]" using actual POS tags
      // rather than surface patterns — catches edge cases compromise misses.
      doc.sentences().each(s => {
        const vals = s.tokens().out(its.value);
        const pos  = s.tokens().out(its.pos);
        const n    = vals.length;
        if (n < 4) return;
 
        const singlePivots = new Set(['is','are','was','were','means']);
        const bigramPivots = ['refers to','known as','defined as','described as','called the'];
 
        let pivotIdx = -1, pivotLen = 1;
        for (let i = 1; i < n - 2; i++) {
          const v = vals[i].toLowerCase();
          // Two-word pivots take priority
          if (i < n - 2) {
            const bg = v + ' ' + vals[i + 1].toLowerCase();
            if (bigramPivots.includes(bg)) { pivotIdx = i; pivotLen = 2; break; }
          }
          if (singlePivots.has(v) && pos[i] && (pos[i].startsWith('VB') || pos[i] === 'JJ')) {
            const leftHasNoun = pos.slice(0, i).some(p => p && p.startsWith('NN'));
            if (leftHasNoun) { pivotIdx = i; pivotLen = 1; break; }
          }
        }
        if (pivotIdx < 1) return;
 
        // Subject: skip leading DT, collect nouns + modifiers
        let si = 0;
        while (si < pivotIdx && pos[si] === 'DT') si++;
        const subjParts = [];
        for (let i = si; i < pivotIdx; i++) {
          const p = pos[i];
          if (p && !['IN','CC',',','.'].includes(p)) subjParts.push(vals[i]);
        }
 
        // Definition: skip initial DT, stop at sentence-ending punctuation
        const defParts = [];
        let skipDet = true;
        for (let i = pivotIdx + pivotLen; i < n; i++) {
          const p = pos[i];
          if (!p || p === '.' || p === '!') break;
          if (skipDet && p === 'DT') continue;
          skipDet = false;
          defParts.push(vals[i]);
        }
 
        const subj = subjParts.join(' ').trim();
        const def  = defParts.join(' ').trim().replace(/,$/, '');
        if (subj && def && subj.length >= 2 && def.length >= 5 &&
            subj.toLowerCase() !== def.toLowerCase())
          addNlp(`What is ${subj}?`, def, 'wink-def');
      });
 
      // ── W2. Named-Entity Recognition → context cards ─────────────────────────
      // Uses wink-nlp's built-in NER to detect persons, places, orgs, events, etc.
      // Turns each entity + its surrounding sentence into a targeted flashcard.
      const entSeen = new Set();
      doc.sentences().each(s => {
        const ents = s.entities();
        if (ents.length() === 0) return;
        const sText = s.out();
 
        ents.each(e => {
          const entVal  = e.out(its.value);
          const entType = e.out(its.type);
          if (entVal.length < 3) return;
          const entKey = entVal.toLowerCase();
          if (entSeen.has(entKey)) return;
          entSeen.add(entKey);
 
          // Blacklist purely numeric / unit entities
          if (['CARDINAL','ORDINAL','MONEY','PERCENT','QUANTITY','TIME'].includes(entType)) return;
 
          let q = '';
          if (entType === 'PERSON')                       q = `Who is ${entVal}?`;
          else if (['GPE','LOC','FAC'].includes(entType)) q = `Where is ${entVal}?`;
          else if (['ORG','PRODUCT'].includes(entType))   q = `What is ${entVal}?`;
          else if (entType === 'EVENT')                   q = `What was ${entVal}?`;
          else if (entType === 'WORK_OF_ART')             q = `What is "${entVal}"?`;
          else if (entType === 'DATE')                    q = `When was ${entVal}?`;
          else                                            q = `What is ${entVal}?`;
 
          const ans = sText.replace(entVal, '').replace(/\s{2,}/g, ' ').trim();
          if (ans.length > 12 && ans.toLowerCase() !== entVal.toLowerCase())
            addNlp(q, ans, 'wink-ner');
        });
      });
 
      // ── W3. POS-tag SVO extraction ────────────────────────────────────────────
      // Detects Subject → Verb → Object triples using Penn Treebank POS tags.
      // Generates "What does/did X [verb]?" → answer = object phrase.
      const skipCopula = new Set(['is','are','was','were','be','been','being',
                                   'have','has','had','do','does','did']);
      doc.sentences().each(s => {
        const vals = s.tokens().out(its.value);
        const pos  = s.tokens().out(its.pos);
        const n    = vals.length;
        if (n < 5) return;
 
        // Find subject NP boundary (first run of NN/NNS/NNP/NNPS)
        let subjEnd = -1;
        for (let i = 0; i < n; i++) {
          if (pos[i] && pos[i].startsWith('NN')) subjEnd = i;
          else if (subjEnd >= 0) break;
        }
        if (subjEnd < 0) return;
 
        // Find first non-copula main verb after subject
        let verbIdx = -1;
        for (let i = subjEnd + 1; i < n; i++) {
          if (pos[i] && pos[i].startsWith('VB')) {
          const v = vals[i].toLowerCase();
          if (!skipCopula.has(v)) { verbIdx = i; break; }
        }
        }
        if (verbIdx < 0) return;
 
        // Find object NP after verb
        let objStart = -1, objEnd = -1;
        for (let i = verbIdx + 1; i < n; i++) {
          if (pos[i] && pos[i].startsWith('NN')) {
            if (objStart < 0) objStart = i;
            objEnd = i;
          } else if (objStart >= 0 &&
                     pos[i] && !['JJ','JJR','JJS','DT','CD','IN','RB'].includes(pos[i])) break;
        }
        if (objStart < 0 || objEnd < 0) return;
 
        const subj = vals.slice(0, subjEnd + 1)
                         .filter((_, i) => pos[i] !== 'DT').join(' ');
        const verb = vals[verbIdx];
        const obj  = vals.slice(objStart, objEnd + 1).join(' ');
 
        if (subj && verb && obj && subj !== obj && obj.length > 2) {
          const tense = pos[verbIdx] === 'VBD' ? 'did' : 'does';
          addNlp(`What ${tense} ${subj} ${verb}?`, obj, 'wink-svo');
        }
      });
 
      // ── W4. NER fill-in-the-blank ─────────────────────────────────────────────
      // Uses wink-nlp's detected multi-word named entities as the blanked portion.
      // More accurate than the regex noun-based FITB from compromise.
      doc.sentences().each(s => {
        const ents = s.entities();
        if (ents.length() === 0) return;
        const sText = s.out();
 
        ents.each(e => {
          const entVal  = e.out(its.value);
          const entType = e.out(its.type);
          if (['CARDINAL','ORDINAL','MONEY','PERCENT','QUANTITY'].includes(entType)) return;
          if (entVal.split(' ').length < 2 || entVal.length < 8) return;
 
          const escaped = entVal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const blank   = sText.replace(new RegExp(escaped, 'gi'), '_____');
          if (blank !== sText)
            addNlp(`Fill in: "${blank}"`, entVal, 'wink-fitb');
        });
      });
 
      // ── W5. Smart single-token FITB (stopword-filtered, POS-gated) ───────────
      // Picks the single most meaningful NOUN in each sentence using wink-nlp's
      // stopWordFlag so we NEVER blank "the", "is", "a", or other boring words.
      // Only nouns longer than 3 chars that are NOT stop-words are candidates.
      const fitbSentSeen = new Set();
      doc.sentences().each(s => {
        const sText = s.out().trim();
        if (sText.split(' ').length < 6 || sText.split(' ').length > 30) return;
 
        // Collect candidate tokens: non-stopword NOUNs with length > 3
        const candidates = [];
        s.tokens().each(t => {
          if (t.out(its.stopWordFlag)) return;          // skip "the", "is", etc.
          if (t.out(its.pos) !== 'NN' &&
              t.out(its.pos) !== 'NNS' &&
              t.out(its.pos) !== 'NNP' &&
              t.out(its.pos) !== 'NNPS') return;        // only nouns
          const word = t.out(its.value);
          if (word.length <= 3) return;                 // skip tiny words
          if (/^\d+$/.test(word)) return;               // skip pure numbers
          candidates.push(word);
        });
 
        if (!candidates.length) return;
 
        // Prefer longer, rarer words (simple heuristic: pick longest candidate)
        const bestWord = candidates.reduce((a, b) => b.length > a.length ? b : a);
 
        // De-duplicate on sentence text so we don't create two cards per sentence
        if (fitbSentSeen.has(sText.toLowerCase())) return;
        fitbSentSeen.add(sText.toLowerCase());
 
        const escaped = bestWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const blank   = sText.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), '_____');
        if (blank !== sText)
          addNlp(`Fill in: "${blank}"`, bestWord, 'wink-fitb');
      });
 
    } catch (winkErr) {
      console.warn('[FlashTrainer] wink-nlp extraction error:', winkErr.message);
    }
  }
 
  // Commit NLP cards (always -- even zero is fine, regex will supplement below)
  nlpCards.forEach(c => {
    if (!seen.has(c.q.toLowerCase())) { seen.add(c.q.toLowerCase()); cards.push(c); }
  });
 
  // Always run regex patterns too -- catches "X: Y" lists and explicit definitions
  // that the Brain may have missed. `seen` deduplicates automatically.
  {
    const defPatterns = [
      /^([a-zA-Z\s]{3,30})\s+means\s+(.{10,})$/i,
      /^([a-zA-Z\s]{3,30})\s+is defined as\s+(.{10,})$/i,
      /^([a-zA-Z\s]{3,30})\s+(?:is|are|was|were)\s+(?:defined as|described as|known as|called)\s+(.{10,})$/i,
      /^([a-zA-Z\s]{3,30})\s+(?:refers to|denotes|represents)\s+(.{10,})$/i,
      /^([a-zA-Z\s]{3,25}):\s+(.{10,})$/i,
    ];
    for (const line of lines) {
      for (const pat of defPatterns) {
        const m = line.match(pat);
        if (m) {
          const term = m[1].replace(/^[\d\.\-\*\u2022]+\s*/, '').trim();
          const def  = m[2].trim();
          if (term.split(/\s+/).length <= 6 && def.length >= 10 && isQualityCard(`What is ${term}?`, def)) {
            add(`What is ${term}?`, def); break;
          }
        }
      }
    }
  }
 
  // Shuffle and trim
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards.slice(0, limit);
}
 
function parseAIJson(raw) {
  // 1. Direct parse
  try { const p = JSON.parse(raw.trim()); if (Array.isArray(p)) return p; } catch(_) {}
  // 2. Extract first [...] block (greedy to get full array)
  const match = raw.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (match) {
    try { const p = JSON.parse(match[0]); if (Array.isArray(p)) return p; } catch(e) {
      // 3. Attempt to fix common issues: trailing commas, missing quotes
      const fixed = match[0]
        .replace(/,\s*([\]\}])/g, '$1')        // trailing commas
        .replace(/([{,]\s*)(\w+)(\s*:)/g, '$1"$2"$3') // unquoted keys
        .replace(/:\s*'([^']*)'/g, ': "$1"');    // single-quoted values
      try { const p = JSON.parse(fixed); if (Array.isArray(p)) return p; } catch(_) {}
    }
  }
  // 4. Line-by-line fallback: extract q/a from loose text
  const cards = [];
  const qMatches = [...raw.matchAll(/"q"\s*:\s*"([^"]+)"/g)];
  const aMatches = [...raw.matchAll(/"a"\s*:\s*"([^"]+)"/g)];
  for (let i = 0; i < Math.min(qMatches.length, aMatches.length); i++) {
    cards.push({ q: qMatches[i][1], a: aMatches[i][1] });
  }
  if (cards.length) return cards;
  return null;
}
 
async function saveGeneratedCards(raw, fname, retryPrompt=null) {
  const parsed = parseAIJson(raw);
  if (!parsed) {
    // Retry once with error feedback if we have a prompt
    if (retryPrompt) {
      document.getElementById('gen-area').innerHTML = `
        <div class="gen-box"><div class="spinner"></div>
          <div class="gen-title">Fixing malformed response...</div>
          <div class="gen-sub">Asking AI to correct its output</div>
        </div>`;
      try {
        const fixPrompt = `Your previous response had invalid JSON. Fix ONLY the JSON and return a valid array.
Error context: Could not parse response.
Original output (first 500 chars): ${raw.slice(0,500)}
Return ONLY a valid JSON array like: [{"q":"...","a":"..."}]`;
        const fixed = await AIProvider.generate(fixPrompt, 2000);
        const retry = parseAIJson(fixed);
        if (retry) { saveGeneratedCards(fixed, fname, null); return; }
      } catch(_) {}
    }
    showGenErr('Could not parse AI response. Try a simpler model or switch to No AI mode.');
    return;
  }
  const id   = uid();
  const name = fname.replace(/\.[^.]+$/, '').slice(0, 40);
  const cards = parsed.map(c => makeCard(c.q, c.a)).filter(c => c.q && c.a);
  if (!cards.length) { showGenErr('AI returned cards with empty questions/answers.'); return; }
  S.decks[id] = { name, cards, ai: true, createdAt: Date.now() };
  persist(); renderSidebar(); updateStats();
  selectDeck(id);

  // Sync new AI generated deck and its cards to Firestore
  import('./firebase-sync.js').then(({ syncCreateDeck, syncAddCardsBatch }) => {
    syncCreateDeck(id, name)
      .then(() => {
        syncAddCardsBatch(id, cards).catch(err => console.warn("AI cards batch sync failed:", err));
      })
      .catch(err => console.warn("AI deck sync failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module for saveGeneratedCards:", e));

  document.getElementById('gen-area').innerHTML = `
    <div class="gen-box" style="color:var(--accent)">
      ✓ Generated ${cards.length} cards from "${escH(fname)}"!
    </div>`;
  setTimeout(() => { document.getElementById('gen-area').innerHTML=''; }, 4000);
  toast(`${cards.length} cards generated!`);
}
function showGenErr(msg) {
  document.getElementById('gen-area').innerHTML=`
    <div class="gen-box">
      <div style="color:var(--red);font-weight:500;margin-bottom:8px">✗ ${escH(msg)}</div>
      <div style="font-size:12px;color:var(--text3)" id="gen-err-hint">Check your OpenRouter API key and provider selection in Advanced, or switch to No AI mode for offline extraction.</div>
    </div>`;
  setTimeout(()=>{document.getElementById('gen-area').innerHTML='';},10000);
}
 
// ─── NOTES ────────────────────────────────────────────────────────────────────
let notes: any = {};
let activeNoteId = null;
let previewMode = false;

// Setters so other modules can reassign these shared bindings (ES module imports
// are read-only in the importing module, so direct reassignment isn't allowed).
function setNotes(v) { notes = v; }
function setActiveNoteId(v) { activeNoteId = v; }

// Debounced note saver — uses the utility from state section
const debouncedNoteSave = debounce(() => {
  saveCurrentNote();
  const el = document.getElementById('note-save-status');
  if (el) { el.textContent = '✓ Saved'; el.style.color = 'var(--accent)'; }
  if (previewMode) renderPreview();
}, 800);
 
let creatorPinned = false;
let creatorColor = 'default';

function notesInit() {
  // notes loaded async in initStorage()
  // Create a default note if none exist
  if (!Object.keys(notes).length) {
    const id = uid();
    notes[id] = { title: 'Welcome to Notes', content: 'This is your Google Keep-style notes dashboard!\n\nFeel free to write thoughts, markdown notes, code snippets, or draft questions.\n\n- **Pin** important notes to keep them on top.\n- Use **Color coding** to categorize ideas.\n- Search notes easily using the search bar.\n- Double-click a card or click to edit.', updatedAt: Date.now(), color: 'ocean', pinned: true };
    persistNotes();
  }
  
  activeNoteId = Object.keys(notes)[0];
  
  // Render note grid
  renderNoteTabs();
  loadNoteIntoEditor(activeNoteId);
  
  // Wire up Search Input
  const searchInp = document.getElementById('note-search') as HTMLInputElement | null;
  if (searchInp) {
    searchInp.addEventListener('input', () => {
      renderNoteTabs();
    });
  }
  
  // Wire up Select Notes Button
  const btnSelect = document.getElementById('btn-select-notes');
  if (btnSelect) {
    btnSelect.addEventListener('click', () => {
      if (notesSelectMode) {
        exitNotesSelectMode();
      } else {
        enterNotesSelectMode();
      }
    });
  }
  
  // Wire up Global buttons
  const btnSelectAll = document.getElementById('btn-select-all-notes');
  if (btnSelectAll) btnSelectAll.addEventListener('click', selectAllNotes);
  
  const btnDelSelected = document.getElementById('btn-delete-selected-notes');
  if (btnDelSelected) btnDelSelected.addEventListener('click', deleteSelectedNotes);
  
  const btnNewNote = document.getElementById('btn-new-note');
  if (btnNewNote) {
    btnNewNote.addEventListener('click', (e) => {
      // If we are in the editor view, go back to dashboard first
      const editorView = document.getElementById('notes-editor-view');
      const dashboardView = document.getElementById('notes-dashboard-view');
      if (editorView && !editorView.classList.contains('hidden')) {
        editorView.classList.add('hidden');
        if (dashboardView) dashboardView.classList.remove('hidden');
      }
      
      const creatorCollapsed = document.getElementById('note-creator-collapsed');
      const creatorExpanded = document.getElementById('note-creator-expanded');
      const textInp = document.getElementById('note-creator-content') as HTMLTextAreaElement | null;
      
      if (creatorCollapsed && creatorExpanded) {
        creatorCollapsed.classList.add('hidden');
        creatorExpanded.classList.remove('hidden');
        if (textInp) {
          textInp.focus();
          textInp.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    });
  }
  
  // Wire up Creator Card events
  const creatorCollapsed = document.getElementById('note-creator-collapsed');
  const creatorExpanded = document.getElementById('note-creator-expanded');
  const creatorCard = document.getElementById('note-creator-card');
  
  if (creatorCollapsed && creatorExpanded && creatorCard) {
    creatorCollapsed.addEventListener('click', (e) => {
      e.stopPropagation();
      creatorCollapsed.classList.add('hidden');
      creatorExpanded.classList.remove('hidden');
      const textInp = document.getElementById('note-creator-content') as HTMLTextAreaElement | null;
      if (textInp) textInp.focus();
    });
    
    // Pin click inside creator
    const creatorPinBtn = document.getElementById('note-creator-pin');
    if (creatorPinBtn) {
      creatorPinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        creatorPinned = !creatorPinned;
        creatorPinBtn.classList.toggle('active', creatorPinned);
      });
    }
    
    // Close click inside creator (saves note)
    const creatorCloseBtn = document.getElementById('btn-creator-close');
    if (creatorCloseBtn) {
      creatorCloseBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveCreatedNote();
      });
    }
    
    // Click outside creator card collapses and saves it
    document.addEventListener('click', (e) => {
      if (creatorExpanded && !creatorExpanded.classList.contains('hidden') && creatorCard && !creatorCard.contains(e.target as Node)) {
        saveCreatedNote();
      }
    });
  }
  
  // Color dots inside creator card
  const creatorColorsContainer = document.getElementById('note-creator-colors');
  if (creatorColorsContainer) {
    creatorColorsContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('color-dot')) {
        const selectedColor = Array.from(target.classList).find(c => c !== 'color-dot') || 'default';
        creatorColor = selectedColor;
        
        // Update card container background style
        if (creatorCard) {
          creatorCard.className = `note-creator-card note-card-color-${selectedColor}`;
        }
      }
    });
  }
  
  // Wire up Back to Board Button in editor view
  const btnEditorBack = document.getElementById('btn-editor-back');
  if (btnEditorBack) {
    btnEditorBack.addEventListener('click', closeNoteEditor);
  }
  
  // Wire up Pin Button in editor view
  const btnEditorPin = document.getElementById('btn-editor-pin');
  if (btnEditorPin) {
    btnEditorPin.addEventListener('click', () => {
      if (activeNoteId) {
        toggleNotePin(activeNoteId);
        // Toggle visual state in the editor too
        btnEditorPin.classList.toggle('active', notes[activeNoteId]?.pinned);
      }
    });
  }
  
  // Wire up Delete Button in editor view
  const btnEditorDel = document.getElementById('btn-del-note');
  if (btnEditorDel) {
    btnEditorDel.addEventListener('click', () => {
      if (activeNoteId) {
        deleteNote(activeNoteId);
        closeNoteEditor();
      }
    });
  }
  
  // Color dots in note-editor-color-dropdown
  const editorColorsDropdown = document.getElementById('note-editor-color-dropdown');
  if (editorColorsDropdown) {
    editorColorsDropdown.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('color-dot')) {
        const selectedColor = target.dataset.color || Array.from(target.classList).find(c => c !== 'color-dot') || 'default';
        if (activeNoteId) {
          changeNoteColor(activeNoteId, selectedColor);
        }
        editorColorsDropdown.classList.add('hidden');
      }
    });
  }
  
  // Toggle color dropdown inside editor
  const btnEditorColor = document.getElementById('btn-editor-color-trigger') || document.getElementById('btn-editor-color');
  if (btnEditorColor && editorColorsDropdown) {
    btnEditorColor.addEventListener('click', (e) => {
      e.stopPropagation();
      editorColorsDropdown.classList.toggle('hidden');
    });
    // Add document listener only once
    document.addEventListener('click', () => {
      if (!editorColorsDropdown.classList.contains('hidden')) {
        editorColorsDropdown.classList.add('hidden');
      }
    });
  }

  // Wire up markdown wrapping and line buttons
  document.querySelectorAll('.ntool[data-md-wrap]').forEach(btn => {
    btn.addEventListener('click', () => {
      const wrap = btn.getAttribute('data-md-wrap') || '';
      insertMd(wrap, wrap);
    });
  });

  document.querySelectorAll('.ntool[data-md-line]').forEach(btn => {
    btn.addEventListener('click', () => {
      const line = btn.getAttribute('data-md-line') || '';
      insertLine(line);
    });
  });

  // Wire up additional Save button on the creator card if present
  const btnCreatorSave = document.getElementById('btn-creator-save');
  if (btnCreatorSave) {
    btnCreatorSave.addEventListener('click', (e) => {
      e.stopPropagation();
      saveCreatedNote();
    });
  }

  // Mobile Notes Sidebar Toggle
  const toggleBar = document.getElementById('note-editor-sidebar-toggle-bar');
  const sidebarContent = document.getElementById('note-editor-sidebar-content');
  const toggleIcon = document.getElementById('note-sidebar-toggle-icon');
  if (toggleBar && sidebarContent) {
    toggleBar.addEventListener('click', () => {
      sidebarContent.classList.toggle('collapsed');
      const isCollapsed = sidebarContent.classList.contains('collapsed');
      if (toggleIcon) {
        toggleIcon.textContent = isCollapsed ? '▼' : '▲';
      }
    });
  }
}

function saveCreatedNote() {
  const titleInp = document.getElementById('note-creator-title') as HTMLInputElement | null;
  const contentInp = document.getElementById('note-creator-content') as HTMLTextAreaElement | null;
  
  const title = titleInp ? titleInp.value.trim() : '';
  const content = contentInp ? contentInp.value.trim() : '';
  
  if (title || content) {
    const id = uid();
    notes[id] = {
      title: title || 'Untitled Note',
      content: content,
      updatedAt: Date.now(),
      pinned: creatorPinned,
      color: creatorColor
    };
    persistNotes();
    renderNoteTabs();
  }
  
  // Reset creator state
  if (titleInp) titleInp.value = '';
  if (contentInp) contentInp.value = '';
  creatorPinned = false;
  creatorColor = 'default';
  
  const creatorPinBtn = document.getElementById('note-creator-pin');
  if (creatorPinBtn) creatorPinBtn.classList.remove('active');
  
  const creatorCard = document.getElementById('note-creator-card');
  if (creatorCard) creatorCard.className = 'note-creator-card note-card-color-default';
  
  const creatorCollapsed = document.getElementById('note-creator-collapsed');
  if (creatorCollapsed) creatorCollapsed.classList.remove('hidden');
  
  const creatorExpanded = document.getElementById('note-creator-expanded');
  if (creatorExpanded) creatorExpanded.classList.add('hidden');
}
 
async function persistNotes() {
  try {
    await localforage.setItem('ftp-notes', notes);
  } catch(e) {
    try { localStorage.setItem('ftp-notes', JSON.stringify(notes)); } catch(_) {}
  }
}
 
let notesSelectMode = false;
let selectedNoteIds = new Set();
 
function renderNoteTabs() {
  const searchInp = document.getElementById('note-search') as HTMLInputElement;
  const query = searchInp ? searchInp.value.toLowerCase().trim() : '';
  
  // Filter notes
  const seenIds = new Set();
  const filteredNotes = Object.entries(notes).filter(([id, n]: [string, any]) => {
    if (seenIds.has(id)) return false;
    seenIds.add(id);
    if (!query) return true;
    const titleMatch = (n.title || '').toLowerCase().includes(query);
    const contentMatch = (n.content || '').toLowerCase().includes(query);
    return titleMatch || contentMatch;
  });
  
  // Separate into Pinned and Others
  const pinned: [string, any][] = [];
  const others: [string, any][] = [];
  
  filteredNotes.forEach(([id, n]: [string, any]) => {
    if (n.pinned) pinned.push([id, n]);
    else others.push([id, n]);
  });
  
  const notesGrid = document.getElementById('notes-grid');
  
  if (notesGrid) {
    const totalNotes = Object.keys(notes).length;
    // renderedCount reflects post-filter visible cards — used for suggestion offset
    const renderedCount = pinned.length + others.length;
    notesGrid.classList.toggle('grid-3-cols', totalNotes >= 6);

    // Render pinned first, then others
    let html = pinned.map(([id, n]) => renderNoteCard(id, n)).join('');
    html += others.map(([id, n]) => renderNoteCard(id, n)).join('');

    const searchInpEl = document.getElementById('note-search') as HTMLInputElement;
    const isSearching = !!(searchInpEl?.value.trim());

    // Show empty search state when searching with no results
    if (isSearching && renderedCount === 0) {
      html = `
        <div style="text-align:center;padding:48px 0;color:var(--text3);">
          <div style="margin-bottom:12px;color:var(--text3);display:flex;justify-content:center"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>
          <div style="font-size:14px;">No notes match your search</div>
        </div>
      `;
    }

    // Add suggestion placeholders only when not searching and real notes < 5.
    // Filter out suggestions whose title already exists as a real note to prevent duplicates.
    if (!isSearching && totalNotes < 5) {
      const allSuggestions = [
        { title: 'Project Ideas', content: '- Build a new app\n- Learn Rust\n- Write a blog post', color: 'rose' },
        { title: 'Meeting Notes', content: 'Discussed the Q3 roadmap and feature requests from the user research group.', color: 'sage' },
        { title: 'Groceries', content: '\u2610 Milk\n\u2610 Eggs\n\u2610 Bread\n\u2610 Coffee beans', color: 'cream' },
        { title: 'Books to Read', content: '- The Design of Everyday Things\n- Atomic Habits\n- Thinking, Fast and Slow', color: 'lavender' },
        { title: 'Trip Planning', content: 'Pack:\n- Hiking boots\n- Rain jacket\n- Sunscreen', color: 'ocean' }
      ];

      // Collect existing note titles (lowercase) to filter suggestions that already exist
      const existingTitles = new Set(
        Object.values(notes).map((n: any) => (n.title || '').toLowerCase().trim())
      );
      const suggestions = allSuggestions.filter(s => !existingTitles.has(s.title.toLowerCase()));

      // Ensure every column has at least 1 card, capped at cols*2 total
      const cols = totalNotes >= 6 ? 3 : 2;
      const targetTotal = Math.min(cols * 2, Math.max(cols, renderedCount + cols));
      const suggestionsNeeded = Math.max(0, targetTotal - renderedCount);
      const limit = Math.min(suggestionsNeeded, suggestions.length);

      for (let i = 0; i < limit; i++) {
        const s = suggestions[i];
        if (!s) break;
        const titleRaw = s.title.replace(/'/g, "\\'");
        const contentRaw = s.content.replace(/'/g, "\\'").replace(/\n/g, '\\n');
        html += `
          <div class="note-card suggestion-card" onclick="openCreatorWithSuggestion('${titleRaw}', '${contentRaw}', '${s.color}')" style="opacity:0.55;border:2px dashed var(--border2);box-shadow:none;min-height:100px;">
            <div class="note-card-title" style="color:var(--text3);">${s.title}</div>
            <div class="note-card-body" style="color:var(--text3);">${s.content.replace(/\n/g, '<br>')}</div>
            <div style="font-size:11px;color:var(--text3);margin-top:8px;">Suggestion · Click to use</div>
          </div>
        `;
      }
    }

    notesGrid.innerHTML = html;
  }
  
  // Populate legacy note-tabs just in case anything else queries it
  const legacyTabs = document.getElementById('note-tabs');
  if (legacyTabs) {
    legacyTabs.innerHTML = Object.entries(notes).map(([id, n]: [string, any]) => {
      const active = id === activeNoteId ? ' active' : '';
      return `<div class="note-tab${active}" id="ntab-${id}" onclick="switchNote('${id}')">${escH(n.title || 'Untitled')}</div>`;
    }).join('');
  }
  
  updateMassDeleteBar();
}

function renderNoteCard(id: string, n: any) {
  const isPinned = n.pinned ? 'active' : '';
  const colorClass = `note-card-color-${n.color || 'default'}`;
  const isSelected = selectedNoteIds.has(id) ? 'selected' : '';
  const checked = selectedNoteIds.has(id) ? 'checked' : '';
  const snippetHtml = markdownToHtmlSnippet(n.content || '');
  
  if (notesSelectMode) {
    return `
      <div class="note-card ${colorClass} ${isSelected}" id="ncard-${id}" onclick="toggleNoteCheck('${id}')">
        <div class="note-card-select-wrap">
          <input type="checkbox" class="note-tab-check" ${checked} onclick="event.stopPropagation();toggleNoteCheck('${id}')">
        </div>
        <div class="note-card-title" style="padding-left: 24px">${escH(n.title || 'Untitled Note')}</div>
        <div class="note-card-body" style="padding-left: 24px">${snippetHtml}</div>
      </div>
    `;
  }
  
  return `
    <div class="note-card ${colorClass}" id="ncard-${id}" onclick="switchNote('${id}')">
      <button class="note-card-pin-btn ${isPinned}" onclick="event.stopPropagation();toggleNotePin('${id}')" title="Pin note" style="display:inline-flex;align-items:center;justify-content:center;padding:4px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><path d="M12 17v5M5 17h14M15 8l-3-3M9 8l3-3M12 5V2M7 8h10l-2 9H9l-2-9z"/></svg></button>
      <div class="note-card-title">${escH(n.title || 'Untitled Note')}</div>
      <div class="note-card-body">${snippetHtml}</div>
      <div class="note-card-footer">
        <div class="note-card-colors" onclick="event.stopPropagation()">
          <span class="color-dot default" onclick="changeNoteColor('${id}', 'default')" title="Default"></span>
          <span class="color-dot cream" onclick="changeNoteColor('${id}', 'cream')" title="Cream"></span>
          <span class="color-dot sage" onclick="changeNoteColor('${id}', 'sage')" title="Sage"></span>
          <span class="color-dot ocean" onclick="changeNoteColor('${id}', 'ocean')" title="Ocean"></span>
          <span class="color-dot lavender" onclick="changeNoteColor('${id}', 'lavender')" title="Lavender"></span>
          <span class="color-dot rose" onclick="changeNoteColor('${id}', 'rose')" title="Rose"></span>
        </div>
        <div class="note-card-actions">
          <button class="note-card-action-btn" onclick="event.stopPropagation();deleteNote('${id}')" title="Delete note" style="display:inline-flex;align-items:center;justify-content:center;padding:4px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
        </div>
      </div>
    </div>
  `;
}

function markdownToHtmlSnippet(md: string) {
  if (!md) return '<span style="color:var(--text3); font-style:italic">Empty note</span>';

  // Truncate raw markdown first, then convert to HTML
  const truncated = md.substring(0, 200);
  const suffix = md.length > 200 ? '...' : '';

  // Escape HTML entities on the raw text first, then apply markdown as safe HTML tags
  let html = truncated
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // headings → plain bold line
    .replace(/^#{1,6} (.+)$/gm, '<strong>$1</strong>')
    // bold (must come before italic)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/_(.+?)_/g, '<em>$1</em>')
    // inline code
    .replace(/`([^`]+)`/g, '<code style="font-size:11px;background:rgba(255,255,255,0.08);padding:1px 4px;border-radius:3px;">$1</code>')
    // unordered list items
    .replace(/^[\-\*] (.+)$/gm, '• $1')
    // ordered list items
    .replace(/^\d+\.\s(.+)$/gm, '• $1')
    // newlines
    .replace(/\n/g, '<br>');

  return html + suffix;
}

/* OLD CODE RENDER REMOVED */
 
/* RENDER END */
 

 

 

 

 

 

 

 

 

 

 

 
function saveCurrentNote() {
  if (!activeNoteId || !notes[activeNoteId]) return;
  const editor = document.getElementById('note-editor') as HTMLTextAreaElement | null;
  const titleInp = document.getElementById('note-editor-title-inp') as HTMLInputElement | null;
  
  if (editor) notes[activeNoteId].content = editor.value;
  if (titleInp) notes[activeNoteId].title = titleInp.value.trim() || 'Untitled Note';
  
  notes[activeNoteId].updatedAt = Date.now();
  persistNotes();
  syncSaveNote(activeNoteId, notes[activeNoteId]).catch(err => console.warn("Note sync failed:", err));
}
 
function onNoteInput() {
  const editor = document.getElementById('note-editor') as HTMLTextAreaElement | null;
  if (editor) {
    updateWordCount(editor.value);
  }
  const statusEl = document.getElementById('note-save-status');
  if (statusEl) { statusEl.textContent = '● Unsaved'; statusEl.style.color = 'var(--yellow)'; }
  debouncedNoteSave();
}
 
function updateWordCount(text: string) {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const chars = text.length;
  
  const wc1 = document.getElementById('note-wordcount');
  if (wc1) wc1.textContent = `${words} word${words!==1?'s':''} · ${chars} chars`;
  
  const charSpan = document.getElementById('note-charcount');
  if (charSpan) charSpan.textContent = chars.toString();
}

function deleteCurrentNote() {
  if (activeNoteId) deleteNote(activeNoteId);
}

function deleteNote(id: string) {
  const keys = Object.keys(notes);
  if (keys.length <= 1) { toast('Keep at least one note!'); return; }
  if (!confirm(`Delete "${notes[id].title || 'Untitled note'}"?`)) return;
  delete notes[id];
  if (activeNoteId === id) activeNoteId = Object.keys(notes)[0];
  persistNotes();
  renderNoteTabs();
  loadNoteIntoEditor(activeNoteId);
  toast('Note deleted.');
  syncDeleteNote(id).catch(err => console.warn("Note sync failed:", err));
}

function deleteSelectedNotes() {
  const ids = [...selectedNoteIds];
  if (!ids.length) { toast('No notes selected — click on notes to select them.'); return; }
  const remaining = Object.keys(notes).filter(id => !selectedNoteIds.has(id));
  if (remaining.length === 0) { toast('You must keep at least one note!'); return; }
  if (!confirm(`Delete ${ids.length} note${ids.length !== 1 ? 's' : ''}? This cannot be undone.`)) return;
  ids.forEach((id: any) => {
    delete notes[id];
    syncDeleteNote(id).catch(err => console.warn("Note sync failed:", err));
  });
  if (!notes[activeNoteId]) {
    activeNoteId = Object.keys(notes)[0];
    loadNoteIntoEditor(activeNoteId);
  }
  persistNotes();
  exitNotesSelectMode();
  toast(`Deleted ${ids.length} note${ids.length !== 1 ? 's' : ''}.`);
}

function enterNotesSelectMode() {
  notesSelectMode = true;
  selectedNoteIds = new Set();
  const btn = document.getElementById('btn-select-notes');
  if (btn) { btn.textContent = 'Cancel'; btn.classList.add('selecting'); }
  renderNoteTabs();
}

function exitNotesSelectMode() {
  notesSelectMode = false;
  selectedNoteIds = new Set();
  const btn = document.getElementById('btn-select-notes');
  if (btn) { btn.textContent = 'Select'; btn.classList.remove('selecting'); }
  renderNoteTabs();
}

function selectAllNotes() {
  Object.keys(notes).forEach(id => selectedNoteIds.add(id));
  renderNoteTabs();
}

function switchNote(id: string) {
  saveCurrentNote();
  activeNoteId = id;
  
  // Show editor view, hide dashboard view
  const dashboardView = document.getElementById('notes-dashboard-view');
  if (dashboardView) {
    dashboardView.classList.add('hidden');
  }
  const editorView = document.getElementById('notes-editor-view');
  if (editorView) {
    editorView.classList.remove('hidden');
  }
  
  loadNoteIntoEditor(id);
  renderNoteTabs();
}

function toggleNoteCheck(id: string) {
  if (selectedNoteIds.has(id)) selectedNoteIds.delete(id);
  else selectedNoteIds.add(id);
  renderNoteTabs();
}

function updateMassDeleteBar() {
  const bar = document.getElementById('mass-delete-bar');
  const count = document.getElementById('mass-delete-count');
  if (!bar) return;
  if (notesSelectMode) {
    bar.classList.add('show');
    const n = selectedNoteIds.size;
    if (count) count.textContent = n === 0
      ? 'Click notes to select them'
      : `${n} note${n !== 1 ? 's' : ''} selected`;
  } else {
    bar.classList.remove('show');
  }
}

function loadNoteIntoEditor(id: string) {
  const n = notes[id];
  if (!n) return;
  
  // Update normal editor content and title input
  const editor = document.getElementById('note-editor') as HTMLTextAreaElement | null;
  if (editor) {
    editor.value = n.content || '';
    updateWordCount(n.content || '');
  }
  
  const titleInp = document.getElementById('note-editor-title-inp') as HTMLInputElement | null;
  if (titleInp) {
    titleInp.value = n.title || '';
  }
  
  // Also color the editor based on the note color!
  const editorContainer = document.getElementById('notes-editor-view');
  if (editorContainer) {
    for (const cls of Array.from(editorContainer.classList)) {
      if (cls.startsWith('note-card-color-')) {
        editorContainer.classList.remove(cls);
      }
    }
    editorContainer.classList.add(`note-card-color-${n.color || 'default'}`);
  }
  
  const statusEl = document.getElementById('note-save-status');
  if (statusEl) {
    statusEl.textContent = '✓ Saved';
    statusEl.style.color = 'var(--text3)';
  }
  
  if (previewMode) renderPreview();
}

function openCreatorWithSuggestion(title: string, content: string, color: string = 'default') {
  const creatorCollapsed = document.getElementById('note-creator-collapsed');
  const creatorExpanded = document.getElementById('note-creator-expanded');
  const titleInp = document.getElementById('note-creator-title') as HTMLInputElement | null;
  const contentInp = document.getElementById('note-creator-content') as HTMLTextAreaElement | null;
  
  if (creatorCollapsed && creatorExpanded) {
    creatorCollapsed.classList.add('hidden');
    creatorExpanded.classList.remove('hidden');
    if (titleInp) titleInp.value = title;
    if (contentInp) {
      contentInp.value = content.replace(/\\n/g, '\n');
      contentInp.focus();
    }
    
    creatorColor = color;
    const creatorCard = document.getElementById('note-creator-card');
    if (creatorCard) {
      creatorCard.className = `note-creator-card note-card-color-${color}`;
    }
  }
}

function newNote() {
  saveCurrentNote();
  const id = uid();
  notes[id] = { title: '', content: '', updatedAt: Date.now(), color: 'default', pinned: false };
  activeNoteId = id;
  persistNotes();
  renderNoteTabs();
  
  // Show editor view, hide dashboard view
  const dashboardView = document.getElementById('notes-dashboard-view');
  if (dashboardView) {
    dashboardView.classList.add('hidden');
  }
  const editorView = document.getElementById('notes-editor-view');
  if (editorView) {
    editorView.classList.remove('hidden');
  }
  loadNoteIntoEditor(id);
  syncSaveNote(id, notes[id]).catch(err => console.warn("Note sync failed:", err));
  
  const titleInp = document.getElementById('note-editor-title-inp') as HTMLInputElement | null;
  if (titleInp) titleInp.focus();
}

function toggleNotePin(id: string) {
  if (notes[id]) {
    notes[id].pinned = !notes[id].pinned;
    persistNotes();
    renderNoteTabs();
    syncSaveNote(id, notes[id]).catch(err => console.warn("Note pin sync failed:", err));
  }
}

function changeNoteColor(id: string, color: string) {
  if (notes[id]) {
    notes[id].color = color;
    persistNotes();
    renderNoteTabs();
    syncSaveNote(id, notes[id]).catch(err => console.warn("Note color sync failed:", err));
    
    // If this is the active note, also color the editor!
    if (id === activeNoteId) {
      const editorContainer = document.getElementById('notes-editor-view');
      if (editorContainer) {
        for (const cls of Array.from(editorContainer.classList)) {
          if (cls.startsWith('note-card-color-')) {
            editorContainer.classList.remove(cls);
          }
        }
        editorContainer.classList.add(`note-card-color-${color}`);
      }
    }
  }
}

function closeNoteEditor() {
  saveCurrentNote();
  // Show dashboard view, hide editor view
  const dashboardView = document.getElementById('notes-dashboard-view');
  if (dashboardView) {
    dashboardView.classList.remove('hidden');
  }
  const editorView = document.getElementById('notes-editor-view');
  if (editorView) {
    editorView.classList.add('hidden');
  }
  renderNoteTabs();
}
 
function handleNoteKey(e: KeyboardEvent) {
  // Tab inserts 2 spaces instead of switching focus
  if (e.key === 'Tab') {
    e.preventDefault();
    insertAtCursor('  ');
  }
}
 
function insertAtCursor(text: string) {
  const el = document.getElementById('note-editor') as HTMLTextAreaElement;
  if (!el) return;
  const start = el.selectionStart, end = el.selectionEnd;
  el.value = el.value.slice(0,start) + text + el.value.slice(end);
  el.selectionStart = el.selectionEnd = start + text.length;
  el.focus();
  onNoteInput();
}
 
function insertMd(before: string, after: string) {
  const el = document.getElementById('note-editor') as HTMLTextAreaElement;
  if (!el) return;
  const start = el.selectionStart, end = el.selectionEnd;
  const selected = el.value.slice(start, end);
  const replacement = before + (selected || 'text') + after;
  el.value = el.value.slice(0, start) + replacement + el.value.slice(end);
  el.selectionStart = start + before.length;
  el.selectionEnd   = start + before.length + (selected || 'text').length;
  el.focus();
  onNoteInput();
}
 
function insertLine(prefix: string) {
  const el = document.getElementById('note-editor') as HTMLTextAreaElement;
  if (!el) return;
  const start = el.selectionStart;
  const lineStart = el.value.lastIndexOf('\n', start - 1) + 1;
  el.value = el.value.slice(0, lineStart) + prefix + el.value.slice(lineStart);
  el.selectionStart = el.selectionEnd = lineStart + prefix.length;
  el.focus();
  onNoteInput();
}
 
function togglePreview() {
  previewMode = !previewMode;
  const editor = document.getElementById('note-editor');
  const preview = document.getElementById('note-preview');
  const btn = document.getElementById('btn-preview-note');
  if (previewMode) {
    saveCurrentNote();
    renderPreview();
    editor.style.display = 'none';
    preview.style.display = 'block';
    btn.classList.add('active');
    btn.textContent = 'Edit';
  } else {
    editor.style.display = 'block';
    preview.style.display = 'none';
    btn.classList.remove('active');
    btn.textContent = 'Preview';
    editor.focus();
  }
}
 
function renderPreview() {
  const content = notes[activeNoteId]?.content || '';
  document.getElementById('note-preview').innerHTML = markdownToHtml(content);
}
 
function markdownToHtml(md: string): string {
  if (!md) return '';
  
  // Escape HTML tags to prevent XSS
  let escaped = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  
  const blocks = escaped.split(/\n\n+/);
  const htmlBlocks = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    
    // Check blocktypes
    // Headings
    if (trimmed.startsWith('### ')) {
      return `<h3 style="font-size:15px;font-weight:600;margin:14px 0 6px;color:var(--text)">${trimmed.slice(4)}</h3>`;
    }
    if (trimmed.startsWith('## ')) {
      return `<h2 style="font-size:17px;font-weight:600;margin:16px 0 8px;color:var(--text)">${trimmed.slice(3)}</h2>`;
    }
    if (trimmed.startsWith('# ')) {
      return `<h1 style="font-size:20px;font-weight:600;margin:18px 0 10px;color:var(--text)">${trimmed.slice(2)}</h1>`;
    }
    
    // Horizontal Rule
    if (trimmed === '---') {
      return '<hr style="border:none;border-top:1px solid var(--border);margin:16px 0">';
    }
    
    // Blockquote
    if (trimmed.startsWith('&gt; ')) {
      const inlineParsed = parseInlineMarkdown(trimmed.slice(5));
      return `<blockquote style="border-left:3px solid var(--accent);margin:8px 0;padding:6px 14px;color:var(--text2);background:var(--surface2);border-radius:0 var(--rs) var(--rs) 0">${inlineParsed}</blockquote>`;
    }
    
    // Lists (unordered/ordered)
    const lines = trimmed.split('\n');
    const isUnordered = lines.every(line => line.trim().startsWith('- '));
    const isOrdered = lines.every(line => /^\d+\. /.test(line.trim()));
    
    if (isUnordered) {
      const listItems = lines.map(line => {
        const text = parseInlineMarkdown(line.trim().slice(2));
        return `<li style="margin:3px 0;padding-left:4px">${text}</li>`;
      }).join('');
      return `<ul style="padding-left:20px;margin:8px 0">${listItems}</ul>`;
    }
    
    if (isOrdered) {
      const listItems = lines.map(line => {
        const text = parseInlineMarkdown(line.trim().replace(/^\d+\. /, ''));
        return `<li style="margin:3px 0;padding-left:4px">${text}</li>`;
      }).join('');
      return `<ol style="padding-left:20px;margin:8px 0">${listItems}</ol>`;
    }
    
    // Default Paragraph
    const inlineParsed = parseInlineMarkdown(trimmed.replace(/\n/g, '<br>'));
    return `<p style="margin:0 0 10px; line-height:1.5">${inlineParsed}</p>`;
  });
  
  return htmlBlocks.filter(Boolean).join('\n');
}

function parseInlineMarkdown(text: string): string {
  return text
    // bold italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // inline code
    .replace(/`(.+?)`/g, '<code style="background:var(--surface3);padding:1px 6px;border-radius:4px;font-family:\'DM Mono\',monospace;font-size:12px">$1</code>');
}
 
function startRenameNote(id) {
  // Replace the title span with an inline input
  const el = document.getElementById(`ntab-title-${id}`);
  if (!el) return;
  const cur = notes[id].title;
  const inp = document.createElement('input');
  inp.className = 'note-tab-rename-inp';
  inp.value = cur;
  inp.id = `ntab-inp-${id}`;
  inp.addEventListener('click', e => e.stopPropagation());
  inp.addEventListener('keydown', e => { e.stopPropagation(); if(e.key==='Enter') commitNoteRename(id); if(e.key==='Escape') renderNoteTabs(); });
  inp.addEventListener('blur', () => commitNoteRename(id));
  el.replaceWith(inp);
  inp.focus();
  inp.select();
}
 
function handleNoteRenameKey(e, id) {
  e.stopPropagation();
  if (e.key === 'Enter') commitNoteRename(id);
  if (e.key === 'Escape') renderNoteTabs();
}
 
function commitNoteRename(id) {
  const inp = document.getElementById(`ntab-inp-${id}`);
  if (!inp) return; // already committed
  const name = inp.value.trim() || 'Untitled Note';
  if (notes[id]) {
    notes[id].title = name;
    persistNotes();
    syncSaveNote(id, notes[id]).catch(err => console.warn("Note rename sync failed:", err));
  }
  inp.removeEventListener('blur', () => commitNoteRename(id));
  renderNoteTabs();
}
 
window._newCardDiff = 'none';
 
function setNewCardDiff(d) {
  window._newCardDiff = d;
  ['none','easy','medium','hard'].forEach(v => {
    const el = document.getElementById('diff-' + v);
    if (el) el.style.outline = v === d ? '2px solid var(--accent)' : 'none';
  });
}
 
const DIFF_CYCLE = ['none', 'easy', 'medium', 'hard'];
 
function cycleCardDiff(cardIdx) {
  if (!S.selDeck) return;
  const card = S.decks[S.selDeck].cards[cardIdx];
  if (!card) return;
  const cur = card.difficulty || 'none';
  card.difficulty = DIFF_CYCLE[(DIFF_CYCLE.indexOf(cur) + 1) % DIFF_CYCLE.length];
  persist();
  renderCardsList();
  syncUpdateCard(S.selDeck, card).catch(err => console.warn("Card sync failed:", err));
}
 
function cycleCardDiffInStudy() {
  // Cycle difficulty of the current study card without breaking study flow
  const card = S.queue[S.idx];
  if (!card) return;
  const cur = card.difficulty || 'none';
  card.difficulty = DIFF_CYCLE[(DIFF_CYCLE.indexOf(cur) + 1) % DIFF_CYCLE.length];
  persist();
  // Re-render just the diff badge without full renderStudy()
  const badge = document.querySelector('.cf-diff');
  if (badge) {
    const d = card.difficulty;
    if (d === 'none') {
      badge.innerHTML = '';
    } else {
      const label = d === 'easy' ? '▲ Easy' : d === 'medium' ? '● Med' : '▼ Hard';
      badge.innerHTML = `<span class="diff-pill ${d}" onclick="event.stopPropagation();cycleCardDiffInStudy()" title="Difficulty — click to change">${label}</span>`;
    }
  }
  toast(`Marked as ${card.difficulty === 'none' ? 'no difficulty' : card.difficulty}`);

  const deckId = S.studyId || S.selDeck;
  if (deckId) {
    syncUpdateCard(deckId, card).catch(err => console.warn("Card sync failed:", err));
  }
}
 
let _focusActive = false;
let _focusRenderTarget = null; // 'overlay-inner' element
 
function enterFocusMode() {
  if (!S.studyId) { toast('Select a deck first!'); return; }
  _focusActive = true;
  const overlay = document.getElementById('focus-overlay');
  // Ensure quiz queue exists
  if (S.mode === 'quiz' && S.studyId && !S.quizQueue.length) buildQuizQueue();
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  renderFocusContent();
  document.removeEventListener('keydown', focusKeyHandler);
  document.addEventListener('keydown', focusKeyHandler);
}
 
function exitFocusMode() {
  _focusActive = false;
  document.getElementById('focus-overlay').classList.remove('active');
  document.body.style.overflow = '';
  document.removeEventListener('keydown', focusKeyHandler);
  // Sync back — focus mode mutates the same S.queue, so study panel is already in sync
  renderStudy();
}
 
function focusKeyHandler(e) {
  if (!_focusActive) return;
  if (e.key === 'Escape') { exitFocusMode(); return; }
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
 
  if (S.mode === 'flip') {
    if (e.key === ' ' || e.key === 'ArrowUp')    { e.preventDefault(); focusFlip(); }
    if (e.key === 'ArrowRight')                   { e.preventDefault(); focusNext(); }
    if (e.key === 'ArrowLeft')                    { e.preventDefault(); focusPrev(); }
    if (e.key === '1') focusGrade(0);
    if (e.key === '2') focusGrade(1);
    if (e.key === '3') focusGrade(2);
    if (e.key === '4') focusGrade(3);
  } else if (S.mode === 'quiz') {
    // 1-4 pick MCQ options
    const optIdx = parseInt(e.key) - 1;
    if (optIdx >= 0 && optIdx <= 3) {
      const btn = document.querySelector(`#qopt-${optIdx}`);
      if (btn && !btn.disabled) btn.click();
    }
    if (e.key === 'Enter' || e.key === 'ArrowRight') {
      const nextBtn = document.querySelector('#quiz-result .btn-g');
      if (nextBtn) { e.preventDefault(); nextBtn.click(); }
    }
  } else if (S.mode === 'type') {
    // Enter submits / advances — handled by the input's own keydown
  } else if (S.mode === 'exam') {
    // Ctrl+Enter submits exam answer — also handled by textarea keydown
    if (e.key === 'ArrowRight' && e.ctrlKey) {
      e.preventDefault();
      const nextBtn = document.querySelector('.exam-nav .btn-g');
      if (nextBtn) nextBtn.click();
    }
  }
}
 
function renderFocusContent() {
  if (!_focusActive) return;
 
  const focusInner = document.getElementById('focus-inner');
  const studyInner = document.getElementById('study-inner');
  if (!focusInner || !studyInner) return;
 
  // renderStudy writes into study-inner and automatically mirrors into focus-inner
  // when _focusActive is true, so no explicit copy needed here.
  renderStudy();
 
  // Update overlay chrome
  const deck = S.decks[S.studyId];
  const nameEl = document.getElementById('focus-deck-name');
  if (nameEl && deck) {
    const modeLabel = S.mode === 'exam' ? 'Exam' : S.mode === 'quiz' ? 'Quiz' : S.mode === 'type' ? 'Type' : 'Flip';
    nameEl.textContent = `${deck.name}  ·  ${modeLabel}`;
  }
  const total = S.mode === 'quiz' ? S.quizQueue.length : S.queue.length;
  const progEl = document.getElementById('focus-progress');
  if (progEl) progEl.textContent = total ? `${Math.min(S.idx + 1, total)} / ${total}` : '';
 
  const hintEl = document.getElementById('focus-hint');
  if (hintEl) {
    if      (S.mode === 'flip') hintEl.textContent = 'Esc exit · Space flip · ← → navigate · 1–4 grade';
    else if (S.mode === 'quiz') hintEl.textContent = 'Esc exit · 1–4 pick answer · Enter next';
    else if (S.mode === 'type') hintEl.textContent = 'Esc exit · Enter submit';
    else if (S.mode === 'exam') hintEl.textContent = 'Esc exit · Ctrl+Enter next question';
    else hintEl.textContent = 'Esc to exit';
  }
}
 
function focusFlip() {
  S.flipped = !S.flipped;
  renderFocusContent();
}
 
function focusNext() {
  if (S.mode === 'flip') {
    if (!S.flipped) { focusFlip(); return; }
    focusGrade(2);
  } else if (S.mode === 'type') {
    if (!S.flipped) {
      const inp = document.getElementById('type-inp');
      if (inp) { S.userAns = inp.value.trim(); reveal(); }
    } else {
      const grade = S_lastGrade;
      if (grade && grade.verdict !== 'checking') {
        mark(grade.verdict === 'incorrect' ? 'incorrect' : 'correct');
      }
    }
  }
}
 
function focusPrev() {
  if (S.idx > 0) { S.idx--; S.flipped = false; S.userAns = ''; S_lastGrade = null; renderFocusContent(); }
}
 
function focusSkip() {
  S.skipped++; S.idx++; S.flipped = false; S.userAns = ''; S_lastGrade = null;
  renderFocusContent();
}
 
function focusGrade(grade) {
  const card = S.queue[S.idx];
  if (!card) return;
  markGrade(grade); // updates SRS, persist, score, increments S.idx
  renderFocusContent(); // re-mirror into overlay
}
 
 
(function initDataWarning() {
  const WARN_KEY    = 'ftp-warn-dismissed';
  const WARN_UNTIL  = 'ftp-warn-until';
 
  function shouldShow() {
    if (localStorage.getItem(WARN_KEY) === 'forever') return false;
    const until = parseInt(localStorage.getItem(WARN_UNTIL) || '0', 10);
    return Date.now() > until;
  }
 
  function showBanner() {
    const banner = document.getElementById('data-warn-banner');
    if (banner) banner.classList.remove('hidden');
  }
 
  // Show after a short delay so the app finishes rendering first
  if (shouldShow()) setTimeout(showBanner, 1800);
 
  window.warnDismiss = function(forever) {
    const banner = document.getElementById('data-warn-banner');
    if (banner) banner.classList.add('hidden');
    if (forever) {
      localStorage.setItem(WARN_KEY, 'forever');
    } else {
      // Remind again in 7 days
      localStorage.setItem(WARN_UNTIL, String(Date.now() + 7 * 86400000));
    }
  };
 
  window.warnSaveNow = function() {
    syncToDisk();
    // After saving, snooze for 30 days
    localStorage.setItem(WARN_UNTIL, String(Date.now() + 30 * 86400000));
    setTimeout(() => {
      const banner = document.getElementById('data-warn-banner');
      if (banner) banner.classList.add('hidden');
    }, 800);
  };
})();
 
 
if (typeof toggleCreatePopover !== "undefined") window.toggleCreatePopover = toggleCreatePopover;
if (typeof closeCreatePopover  !== "undefined") window.closeCreatePopover  = closeCreatePopover;
if (typeof switchCreateTab     !== "undefined") window.switchCreateTab     = switchCreateTab;
if (typeof cpopAddDeck         !== "undefined") window.cpopAddDeck         = cpopAddDeck;
if (typeof cpopAddFolder       !== "undefined") window.cpopAddFolder       = cpopAddFolder;
 
// Close create popover on Escape (global)
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && (window as any)._createPopoverOpen) (window as any).closeCreatePopover();
});


// ─── ES module exports (auto-generated) ───
export { CONF_AUTO, DIFF_CYCLE, GRADE_PROMPT, SYNONYMS, S_lastGrade, _focusActive, _focusRenderTarget, acceptReviewCard, activeNoteId, answerQuiz, buildQuizQueue, cardConfidence, cardStartTime, changeNoteColor, closeNoteEditor, commitNoteRename, creatorColor, creatorPinned, cycleCardDiff, cycleCardDiffInStudy, debouncedNoteSave, deleteCurrentNote, deleteNote, deleteSelectedNotes, doDue, doReset, doShuffle, dzDrop, dzLeave, dzOver, enterFocusMode, enterNotesSelectMode, examAbort, examFilter, examFinish, examFmtTime, examNav, examRetry, examRetryWrong, examRowHTML, examSelectCards, examSelectTime, examStart, examStartTimer, examStopTimer, exitFocusMode, exitNotesSelectMode, extractCardsFromText, extractKeywords, extractPdfText, flipCard, focusFlip, focusGrade, focusKeyHandler, focusNext, focusPrev, focusSkip, getAdaptExplain, gradeWithAI, handleNoteKey, handleNoteRenameKey, handleTouchEnd, handleTouchStart, insertAtCursor, insertLine, insertMd, isQualityCard, levenshtein, loadNoteIntoEditor, mark, markGrade, markdownToHtml, markdownToHtmlSnippet, newNote, norm, notes, notesInit, notesSelectMode, onFile, onNoteInput, openCreatorWithSuggestion, parseAIJson, parseInlineMarkdown, persistNotes, previewMode, processFile, quizNext, readFileAsDataURL, renderDone, renderExam, renderExamQuestion, renderExamReport, renderExamSetup, renderFocusContent, renderNoteCard, renderNoteTabs, renderPreview, renderStudy, reveal, ruleBasedGrade, runPipeline, runRuleBasedPipeline, runVisionPipeline, saveCreatedNote, saveCurrentNote, saveGeneratedCards, selectAllNotes, selectedNoteIds, setActiveNoteId, setMode, setNewCardDiff, setNotes, showGenErr, showGenStep, shuffle, spawnConfetti, startRenameNote, switchNote, synonymMatch, toggleNoteCheck, toggleNotePin, togglePreview, touchStartX, touchStartY, trackStudyActivity, undoLast, updateMassDeleteBar, updateWordCount };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { acceptReviewCard, answerQuiz, buildQuizQueue, cardConfidence, changeNoteColor, closeNoteEditor, commitNoteRename, cycleCardDiff, cycleCardDiffInStudy, deleteCurrentNote, deleteNote, deleteSelectedNotes, doDue, doReset, doShuffle, dzDrop, dzLeave, dzOver, enterFocusMode, enterNotesSelectMode, examAbort, examFilter, examFinish, examFmtTime, examNav, examRetry, examRetryWrong, examRowHTML, examSelectCards, examSelectTime, examStart, examStartTimer, examStopTimer, exitFocusMode, exitNotesSelectMode, extractCardsFromText, extractKeywords, extractPdfText, flipCard, focusFlip, focusGrade, focusKeyHandler, focusNext, focusPrev, focusSkip, getAdaptExplain, gradeWithAI, handleNoteKey, handleNoteRenameKey, handleTouchEnd, handleTouchStart, insertAtCursor, insertLine, insertMd, isQualityCard, levenshtein, loadNoteIntoEditor, mark, markGrade, markdownToHtml, markdownToHtmlSnippet, newNote, norm, notesInit, onFile, onNoteInput, openCreatorWithSuggestion, parseAIJson, parseInlineMarkdown, persistNotes, processFile, quizNext, readFileAsDataURL, renderDone, renderExam, renderExamQuestion, renderExamReport, renderExamSetup, renderFocusContent, renderNoteCard, renderNoteTabs, renderPreview, renderStudy, reveal, ruleBasedGrade, runPipeline, runRuleBasedPipeline, runVisionPipeline, saveCreatedNote, saveCurrentNote, saveGeneratedCards, selectAllNotes, setActiveNoteId, setMode, setNewCardDiff, setNotes, showGenErr, showGenStep, shuffle, spawnConfetti, startRenameNote, switchNote, synonymMatch, toggleNoteCheck, toggleNotePin, togglePreview, trackStudyActivity, undoLast, updateMassDeleteBar, updateWordCount });
