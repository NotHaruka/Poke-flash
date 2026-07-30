import { app } from './firebase.js';
import { S } from './main.js';
import { renderSidebar, selectDeck, showPanel } from './sidebar.js';
import { persist } from './storage.js';
import { notes, touchStartY } from './study.js';
import { escH, getLocalDayString, getLocalTodayString, getUserTimeZone, subtractDays, toast } from './utils.js';



import localforage from 'localforage';

let currentStatsYear = new Date().getFullYear();
let currentStatsMonth = new Date().getMonth();
let selectedDayKey: string | null = null;

interface DailyStats {
  reviews: number;
  correct: number;
  incorrect: number;
  skipped: number;
  timeSpentSecs: number;
  mistakes: number;
}

interface DeckMetrics {
  id: string;
  name: string;
  totalCards: number;
  dueCards: number;
  mastered: number;
  learning: number;
  reviewsCount: number;
  avgEase: number;
}

function getLocalDetailedActivity(rawActivity: any, tz: string): Record<string, DailyStats> {
  const detailed: Record<string, DailyStats> = {};
  for (const [timestamp, val] of Object.entries(rawActivity)) {
    const dayKey = getLocalDayString(timestamp, tz);
    if (!detailed[dayKey]) {
      detailed[dayKey] = { reviews: 0, correct: 0, incorrect: 0, skipped: 0, timeSpentSecs: 0, mistakes: 0 };
    }
    
    if (typeof val === 'number') {
      detailed[dayKey].reviews += val;
      detailed[dayKey].correct += val;
      detailed[dayKey].timeSpentSecs += val * 4; // estimate 4 secs per review
    } else if (val && typeof val === 'object') {
      const c = Number((val as any).correct || 0);
      const inc = Number((val as any).incorrect || 0);
      const sk = Number((val as any).skipped || 0);
      const t = Number((val as any).timeSpentSecs || 0);
      
      detailed[dayKey].reviews += (c + inc + sk);
      detailed[dayKey].correct += c;
      detailed[dayKey].incorrect += inc;
      detailed[dayKey].skipped += sk;
      detailed[dayKey].timeSpentSecs += t;
      detailed[dayKey].mistakes += inc;
    }
  }
  return detailed;
}

function computeLongestStreak(detailedActivity: Record<string, DailyStats>): number {
  const days = Object.keys(detailedActivity).filter(k => detailedActivity[k].reviews > 0).sort(); // oldest first
  if (!days.length) return 0;
  
  let longest = 0;
  let current = 0;
  let prevDate: Date | null = null;
  
  for (const dayStr of days) {
    const [y, m, d] = dayStr.split('-').map(Number);
    const currentDate = new Date(y, m - 1, d, 12, 0, 0);
    
    if (!prevDate) {
      current = 1;
    } else {
      const diffTime = currentDate.getTime() - prevDate.getTime();
      const diffDays = Math.round(diffTime / 86400000);
      if (diffDays === 1) {
        current++;
      } else if (diffDays > 1) {
        if (current > longest) longest = current;
        current = 1;
      }
    }
    prevDate = currentDate;
  }
  if (current > longest) longest = current;
  return longest;
}

function renderDayDetails(key: string, val: number, date: Date, details?: DailyStats) {
  const detailsCard = document.getElementById('calendar-day-details');
  const detailsDate = document.getElementById('calendar-detail-date');
  const detailsText = document.getElementById('calendar-detail-text');
  
  if (detailsCard && detailsDate && detailsText) {
    detailsCard.style.display = 'block';
    
    const formattedDate = date.toLocaleDateString(undefined, { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });
    
    detailsDate.textContent = formattedDate;
    
    if (val > 0) {
      const correct = details ? details.correct : val;
      const incorrect = details ? details.incorrect : 0;
      const skipped = details ? details.skipped : 0;
      const timeSpentSecs = details ? details.timeSpentSecs : val * 4;
      
      const xpGained = correct * XP_PER_CARD;
      const totalReviews = correct + incorrect + skipped;
      const accuracy = totalReviews > 0 ? Math.round((correct / (correct + incorrect)) * 100) : 100;
      
      const mins = Math.floor(timeSpentSecs / 60);
      const secs = timeSpentSecs % 60;
      const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      
      let accuracyColor = 'var(--text3)';
      if (accuracy >= 85) {
        accuracyColor = '#2ed573';
      } else if (accuracy >= 60) {
        accuracyColor = 'var(--yellow)';
      } else if (totalReviews > 0) {
        accuracyColor = '#ff4757';
      }
      
      let motivationMsg = '';
      if (accuracy >= 90 && totalReviews >= 10) {
        motivationMsg = 'Exceptional work! Flawless knowledge retention today!';
      } else if (totalReviews >= 15) {
        motivationMsg = 'Incredible persistence! You did a major study session today.';
      } else if (accuracy >= 75) {
        motivationMsg = 'Excellent study session! Keep up this high standard.';
      } else {
        motivationMsg = 'Solid effort! Try reviewing these mistakes soon to master them.';
      }
      
      detailsText.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:12px; margin-top:10px;">
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(110px, 1fr)); gap:10px;">
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:10px; text-transform:uppercase; color:var(--text3); font-weight:600;">Reviews</div>
              <div style="font-size:16px; font-weight:700; color:var(--text); margin-top:2px;">${totalReviews}</div>
            </div>
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:10px; text-transform:uppercase; color:var(--text3); font-weight:600;">Study Time</div>
              <div style="font-size:16px; font-weight:700; color:var(--text); margin-top:2px;">${timeStr}</div>
            </div>
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:10px; text-transform:uppercase; color:var(--text3); font-weight:600;">Accuracy</div>
              <div style="font-size:16px; font-weight:700; color:${accuracyColor}; margin-top:2px;">${accuracy}%</div>
            </div>
            <div style="background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:6px; padding:8px; text-align:center;">
              <div style="font-size:10px; text-transform:uppercase; color:var(--text3); font-weight:600;">XP Earned</div>
              <div style="font-size:16px; font-weight:700; color:var(--accent); margin-top:2px;">+${xpGained} XP</div>
            </div>
          </div>
          
          <div style="margin-top:2px;">
            <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text3); margin-bottom:4px;">
              <span>Session Accuracy Meter</span>
              <span>${correct} correct / ${incorrect} mistakes</span>
            </div>
            <div style="height:6px; background:rgba(255,255,255,0.06); border-radius:3px; overflow:hidden;">
              <div style="height:100%; width:${accuracy}%; background:${accuracyColor}; border-radius:3px; transition: width 0.3s ease;"></div>
            </div>
          </div>
          
          <div style="font-size:12px; font-style:italic; color:var(--text2); background:rgba(var(--accent-rgb), 0.03); border-left:2px solid var(--accent); padding:8px 10px; border-radius:0 4px 4px 0; margin-top:2px;">
            ${motivationMsg}
          </div>
        </div>
      `;
    } else {
      detailsText.innerHTML = `
        <div style="color:var(--text3); text-align:center; padding:16px 0; display:flex; flex-direction:column; align-items:center; gap:8px;">
          <div style="display:inline-flex; align-items:center; justify-content:center; color:var(--text3); opacity:0.6;"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:24px;height:24px"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></div>
          <div style="font-size:13px; font-weight:500; color:var(--text2);">No study activity recorded</div>
          <div style="font-size:11px; max-width:240px; line-height:1.4;">Time to review some cards! Consistently studying every day makes your long-term memory incredibly robust.</div>
        </div>
      `;
    }
  }
}

let deckSortBy = 'reviews';

const injectStyles = () => {
  let styleEl = document.getElementById('stats-custom-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'stats-custom-styles';
    styleEl.textContent = `
      .calendar-day-cell.heat-0 { background: var(--surface); }
      .calendar-day-cell.heat-1 { background: rgba(var(--accent-rgb), 0.1) !important; }
      .calendar-day-cell.heat-2 { background: rgba(var(--accent-rgb), 0.22) !important; }
      .calendar-day-cell.heat-3 { background: rgba(var(--accent-rgb), 0.4) !important; }
      .calendar-day-cell.heat-4 { background: rgba(var(--accent-rgb), 0.6) !important; color: var(--ink) !important; }
      .calendar-day-cell.heat-4 .calendar-day-num { color: var(--ink) !important; }
      .calendar-day-cell.heat-5 { background: var(--accent) !important; color: var(--ink) !important; }
      .calendar-day-cell.heat-5 .calendar-day-num { color: var(--ink) !important; font-weight: 700; }
      
      .calendar-day-cell.today {
        border: 2px solid var(--accent) !important;
        box-shadow: 0 0 12px rgba(var(--accent-rgb), 0.35) !important;
        position: relative;
        animation: pulse-today 3s infinite alternate;
      }
      @keyframes pulse-today {
        0% { box-shadow: 0 0 6px rgba(var(--accent-rgb), 0.15); }
        100% { box-shadow: 0 0 14px rgba(var(--accent-rgb), 0.45); }
      }
      .calendar-day-cell.today::before {
        content: 'TODAY';
        position: absolute;
        top: 2px;
        left: 50%;
        transform: translateX(-50%);
        font-size: 7px;
        font-weight: 800;
        letter-spacing: 0.05em;
        color: var(--accent);
        z-index: 5;
      }
      
      .calendar-day-cell {
        transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s, border-color 0.2s !important;
        cursor: pointer;
        min-height: 52px;
        position: relative;
      }
      .calendar-day-cell:hover {
        transform: translateY(-2px) scale(1.05);
        z-index: 10;
        box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4) !important;
        border-color: rgba(var(--accent-rgb), 0.5) !important;
      }
      .calendar-day-cell.selected-day {
        transform: scale(1.06);
        border: 2px solid var(--accent) !important;
        box-shadow: 0 0 16px rgba(var(--accent-rgb), 0.4) !important;
        z-index: 11;
      }

      .calendar-day-metrics {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1.5px;
        position: absolute;
        bottom: 3px;
        left: 2px;
        right: 2px;
        font-size: 7.5px;
        font-weight: 700;
        line-height: 1;
        opacity: 0.9;
      }
      .day-metric-revs {
        background: rgba(255, 255, 255, 0.12);
        color: var(--text);
        padding: 1px 3px;
        border-radius: 2px;
      }
      .day-metric-errs {
        background: rgba(255, 71, 87, 0.2);
        color: #ff4757;
        padding: 1px 3px;
        border-radius: 2px;
      }
      @media (max-width: 640px) {
        .calendar-day-metrics {
          flex-direction: row;
          justify-content: center;
          gap: 1px;
          bottom: 1.5px;
        }
        .day-metric-revs, .day-metric-errs {
          font-size: 6.5px;
          padding: 0px 1.5px;
        }
        .calendar-day-cell {
          min-height: 46px;
        }
      }

      .cell-tooltip {
        display: none;
      }

      .trend-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 6px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
      }
      .trend-pill.up {
        background: rgba(46, 213, 115, 0.15);
        color: #2ed573;
      }
      .trend-pill.down {
        background: rgba(255, 71, 87, 0.15);
        color: #ff4757;
      }
      .trend-pill.neutral {
        background: rgba(255, 255, 255, 0.08);
        color: var(--text3);
      }
      
      /* Focus Panel styling */
      .focus-panel {
        background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.08), rgba(20, 20, 35, 0.4));
        border: 1px solid rgba(var(--accent-rgb), 0.2);
        border-radius: 12px;
        padding: 20px;
        margin-bottom: 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
        position: relative;
        overflow: hidden;
      }
      .focus-panel::before {
        content: '';
        position: absolute;
        top: -50%;
        left: -50%;
        width: 200%;
        height: 200%;
        background: radial-gradient(circle, rgba(var(--accent-rgb), 0.03) 0%, transparent 60%);
        pointer-events: none;
      }
      .focus-panel-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
        gap: 16px;
      }
      .focus-metric {
        background: rgba(255, 255, 255, 0.015);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px;
        text-align: center;
        transition: transform 0.2s, border-color 0.2s;
      }
      .focus-metric:hover {
        transform: translateY(-2px);
        border-color: rgba(var(--accent-rgb), 0.2);
      }
      .focus-metric-title {
        font-size: 10px;
        text-transform: uppercase;
        color: var(--text3);
        font-weight: 600;
        letter-spacing: 0.05em;
        margin-bottom: 4px;
      }
      .focus-metric-val {
        font-size: 22px;
        font-weight: 700;
        color: var(--text);
      }

      /* Achievements & Milestones with High Contrast & Readability */
      .achievements-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
        gap: 12px;
        margin-top: 10px;
      }
      .achievement-badge {
        border-radius: 10px;
        padding: 14px 12px;
        text-align: center;
        transition: all 0.2s;
        border: 1px solid var(--border);
        background: rgba(255, 255, 255, 0.01);
        display: flex;
        flex-direction: column;
        align-items: center;
        position: relative;
        overflow: hidden;
      }
      .achievement-badge:hover {
        transform: translateY(-3px);
      }
      .achievement-badge.locked {
        opacity: 0.65;
        border-color: rgba(255, 255, 255, 0.05);
        background: rgba(0, 0, 0, 0.1);
      }
      .achievement-badge.unlocked.common {
        border-color: #4b5563;
        background: rgba(75, 85, 99, 0.08);
      }
      .achievement-badge.unlocked.rare {
        border-color: #2563eb;
        background: rgba(37, 99, 235, 0.08);
        box-shadow: 0 0 10px rgba(37, 99, 235, 0.15);
      }
      .achievement-badge.unlocked.epic {
        border-color: #7c3aed;
        background: rgba(124, 58, 237, 0.08);
        box-shadow: 0 0 12px rgba(124, 58, 237, 0.2);
      }
      .achievement-badge.unlocked.legendary {
        border-color: #d97706;
        background: rgba(217, 119, 6, 0.08);
        box-shadow: 0 0 16px rgba(217, 119, 6, 0.3);
        animation: legendary-glow 4s infinite alternate;
      }
      @keyframes legendary-glow {
        0% { box-shadow: 0 0 12px rgba(217, 119, 6, 0.15); }
        100% { box-shadow: 0 0 22px rgba(217, 119, 6, 0.35); }
      }
      .achievement-icon {
        font-size: 28px;
        margin-bottom: 8px;
        line-height: 1;
        filter: drop-shadow(0 2px 5px rgba(0,0,0,0.3));
      }
      .achievement-badge.locked .achievement-icon {
        filter: grayscale(1) opacity(0.5);
      }
      .achievement-name {
        font-size: 11px;
        font-weight: 700;
        color: var(--text) !important;
      }
      .achievement-desc {
        font-size: 9px;
        color: var(--text2) !important;
        line-height: 1.3;
        margin-top: 4px;
        text-align: center;
      }
      .achievement-status {
        position: absolute;
        top: 4px;
        right: 4px;
        font-size: 9px;
      }
      .achievement-progress-track {
        width: 100%;
        height: 4px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 2px;
        overflow: hidden;
        margin-top: 8px;
      }
      .achievement-progress-fill {
        height: 100%;
        border-radius: 2px;
        transition: width 0.4s ease-out;
      }
      .achievement-progress-fill.common { background: #9ca3af; }
      .achievement-progress-fill.rare { background: #3b82f6; }
      .achievement-progress-fill.epic { background: #8b5cf6; }
      .achievement-progress-fill.legendary { background: #eab308; }

      /* Recent Activity Timeline styling */
      .timeline {
        position: relative;
        padding-left: 20px;
        margin-top: 12px;
      }
      .timeline::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        left: 7px;
        width: 2px;
        background: var(--border);
      }
      .timeline-item {
        position: relative;
        padding-bottom: 14px;
      }
      .timeline-item:last-child {
        padding-bottom: 0;
      }
      .timeline-node {
        position: absolute;
        left: -19px;
        top: 3px;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: var(--surface);
        border: 2px solid var(--accent);
        z-index: 2;
      }
      .timeline-node.milestone {
        border-color: #7c3aed;
        background: #7c3aed;
      }
      .timeline-node.streak {
        border-color: #f97316;
        background: #f97316;
      }
      .timeline-content {
        background: rgba(255, 255, 255, 0.01);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 10px 14px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        transition: border-color 0.2s;
      }
      .timeline-content:hover {
        border-color: rgba(var(--accent-rgb), 0.2);
      }
      .timeline-title {
        font-size: 12.5px;
        font-weight: 500;
        color: var(--text);
      }
      .timeline-time {
        font-size: 11px;
        color: var(--text3);
      }

      /* Sorting Pill Styles */
      .sort-pills {
        display: flex;
        gap: 6px;
        margin-bottom: 14px;
        overflow-x: auto;
        padding-bottom: 4px;
      }
      .sort-pill {
        background: var(--surface);
        border: 1px solid var(--border);
        border-radius: 20px;
        padding: 4px 12px;
        font-size: 11px;
        font-weight: 500;
        color: var(--text2);
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .sort-pill:hover {
        border-color: var(--border2);
        color: var(--text);
      }
      .sort-pill.active {
        background: var(--accent);
        border-color: var(--accent);
        color: var(--ink);
        font-weight: 600;
      }

      /* Charts grid */
      .charts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
        gap: 16px;
        margin-top: 14px;
      }
      .chart-card {
        background: rgba(255,255,255,0.015);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        transition: border-color 0.2s;
      }
      .chart-card:hover {
        border-color: rgba(var(--accent-rgb), 0.15);
      }
      .chart-card-title {
        font-size: 12px;
        font-weight: 600;
        color: var(--text2);
        margin-bottom: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .chart-container-svg {
        height: 140px;
        position: relative;
        width: 100%;
      }
      
      .chart-dot {
        transition: r 0.1s ease;
        cursor: pointer;
      }
      .chart-dot:hover {
        r: 6;
      }
      .chart-bar {
        transition: opacity 0.2s;
        cursor: pointer;
      }
      .chart-bar:hover {
        opacity: 0.85;
      }

      /* Onboarding view */
      .stats-onboarding {
        background: linear-gradient(135deg, rgba(var(--accent-rgb), 0.05), rgba(20,20,35,0.3));
        border: 1px dashed rgba(var(--accent-rgb), 0.3);
        border-radius: 12px;
        padding: 30px;
        text-align: center;
        max-width: 600px;
        margin: 40px auto;
      }
      .stats-onboarding-icon {
        font-size: 48px;
        margin-bottom: 16px;
        animation: float 3s ease-in-out infinite;
      }
      @keyframes float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-8px); }
      }
      
      .insights-row {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-top: 14px;
      }
      .insight-card {
        background: var(--surface2);
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .insight-icon {
        font-size: 20px;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(var(--accent-rgb), 0.1);
        color: var(--accent);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .insight-info {
        flex: 1;
      }
      .insight-title {
        font-size: 10px;
        text-transform: uppercase;
        color: var(--text3);
        font-weight: 600;
        letter-spacing: 0.5px;
      }
      .insight-val {
        font-size: 14px;
        font-weight: 700;
        color: var(--text);
      }
      
      .multi-prog {
        height: 8px;
        border-radius: 4px;
        background: var(--border);
        overflow: hidden;
        display: flex;
        width: 100%;
        margin: 8px 0;
      }
      .multi-prog-segment {
        height: 100%;
        transition: width 0.3s ease;
      }
      
      .prog-fill.pulse {
        animation: fill-pulse 1.2s ease-out;
      }
      @keyframes fill-pulse {
        0% { filter: brightness(1); }
        50% { filter: brightness(1.6) drop-shadow(0 0 4px var(--accent)); }
        100% { filter: brightness(1); }
      }
      .xp-bar-track.leveled {
        animation: level-flash 0.8s ease-out;
      }
      @keyframes level-flash {
        0% { background: rgba(255,255,255,0.1); box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0); }
        40% { background: rgba(var(--accent-rgb), 0.25); box-shadow: 0 0 20px 4px var(--accent); }
        100% { background: rgba(255,255,255,0.06); box-shadow: 0 0 0 0 rgba(var(--accent-rgb), 0); }
      }
    `;
    document.head.appendChild(styleEl);
  }
};

async function getLocalActivityData(): Promise<Record<string, number>> {
  const rawActivity = await getActivityData();
  const localActivity: Record<string, number> = {};
  const tz = getUserTimeZone();
  
  for (const [key, val] of Object.entries(rawActivity)) {
    const localKey = getLocalDayString(key, tz);
    let count = 0;
    if (typeof val === 'number') {
      count = val;
    } else if (val && typeof val === 'object') {
      count = Number((val as any).correct || 0) + Number((val as any).incorrect || 0) + Number((val as any).skipped || 0);
    }
    localActivity[localKey] = (localActivity[localKey] || 0) + count;
  }
  return localActivity;
}

// Helper functions for drawing SVG Charts
function drawWeeklyReviewsChart(detailedActivity: Record<string, DailyStats>, last7Days: string[]): string {
  const values = last7Days.map(d => detailedActivity[d]?.reviews || 0);
  const maxVal = Math.max(...values, 5);
  
  const width = 400;
  const height = 120;
  const paddingLeft = 30;
  const paddingRight = 10;
  const paddingTop = 15;
  const paddingBottom = 20;
  
  const usableWidth = width - paddingLeft - paddingRight;
  const usableHeight = height - paddingTop - paddingBottom;
  
  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%;">
    <defs>
      <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" />
        <stop offset="100%" stop-color="rgba(var(--accent-rgb), 0.15)" />
      </linearGradient>
    </defs>`;
    
  // Grid lines
  const gridLines = [0, maxVal / 2, maxVal];
  gridLines.forEach(v => {
    const y = paddingTop + usableHeight - (v / maxVal) * usableHeight;
    svg += `<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255, 255, 255, 0.08)" stroke-dasharray="3 3" />`;
    svg += `<text x="${paddingLeft - 8}" y="${y + 3}" fill="var(--text3)" font-size="8" font-family="sans-serif" text-anchor="end">${Math.round(v)}</text>`;
  });
  
  // Render Bars
  const spacing = usableWidth / 7;
  const barWidth = spacing * 0.55;
  
  values.forEach((v, i) => {
    const x = paddingLeft + i * spacing + spacing / 2;
    const y = paddingTop + usableHeight - (v / maxVal) * usableHeight;
    const barHeight = paddingTop + usableHeight - y;
    
    const dayName = new Date(last7Days[i]).toLocaleDateString(undefined, { weekday: 'short' });
    
    svg += `<rect x="${x - barWidth / 2}" y="${y}" width="${barWidth}" height="${Math.max(barHeight, 2)}" rx="3" ry="3" fill="url(#barGrad)" class="chart-bar">
      <title>${v} reviews on ${dayName}</title>
    </rect>`;
    svg += `<text x="${x}" y="${height - 4}" fill="var(--text2)" font-size="8.5" font-family="sans-serif" text-anchor="middle">${dayName}</text>`;
  });
  
  svg += `</svg>`;
  return svg;
}

function drawWeeklyTimeChart(detailedActivity: Record<string, DailyStats>, last7Days: string[]): string {
  const values = last7Days.map(d => (detailedActivity[d]?.timeSpentSecs || 0) / 60); // minutes
  const maxVal = Math.max(...values, 5);
  
  const width = 400;
  const height = 120;
  const paddingLeft = 35;
  const paddingRight = 10;
  const paddingTop = 15;
  const paddingBottom = 20;
  
  const usableWidth = width - paddingLeft - paddingRight;
  const usableHeight = height - paddingTop - paddingBottom;
  
  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%;">
    <defs>
      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.25" />
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.0" />
      </linearGradient>
    </defs>`;
    
  // Grid lines
  const gridLines = [0, maxVal / 2, maxVal];
  gridLines.forEach(v => {
    const y = paddingTop + usableHeight - (v / maxVal) * usableHeight;
    svg += `<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255, 255, 255, 0.08)" stroke-dasharray="3 3" />`;
    svg += `<text x="${paddingLeft - 8}" y="${y + 3}" fill="var(--text3)" font-size="8" font-family="sans-serif" text-anchor="end">${v.toFixed(1)}m</text>`;
  });
  
  // Plot line points
  const spacing = usableWidth / 6;
  const points: {x: number, y: number}[] = [];
  
  values.forEach((v, i) => {
    const x = paddingLeft + i * spacing;
    const y = paddingTop + usableHeight - (v / maxVal) * usableHeight;
    points.push({x, y});
  });
  
  // Area Path
  let areaD = `M ${points[0].x} ${paddingTop + usableHeight}`;
  points.forEach(p => {
    areaD += ` L ${p.x} ${p.y}`;
  });
  areaD += ` L ${points[points.length - 1].x} ${paddingTop + usableHeight} Z`;
  svg += `<path d="${areaD}" fill="url(#areaGrad)" />`;
  
  // Line Path
  let lineD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    lineD += ` L ${points[i].x} ${points[i].y}`;
  }
  svg += `<path d="${lineD}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
  
  // Circle Dots
  points.forEach((p, i) => {
    const dayName = new Date(last7Days[i]).toLocaleDateString(undefined, { weekday: 'short' });
    svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--background)" stroke="var(--accent)" stroke-width="1.5" class="chart-dot">
      <title>${values[i].toFixed(1)} mins studied on ${dayName}</title>
    </circle>`;
    svg += `<text x="${p.x}" y="${height - 4}" fill="var(--text2)" font-size="8.5" font-family="sans-serif" text-anchor="middle">${dayName}</text>`;
  });
  
  svg += `</svg>`;
  return svg;
}

function draw30DayMomentumChart(detailedActivity: Record<string, DailyStats>, last30Days: string[]): string {
  const values = last30Days.map(d => detailedActivity[d]?.reviews || 0);
  const maxVal = Math.max(...values, 5);
  
  const width = 800;
  const height = 80;
  const paddingLeft = 15;
  const paddingRight = 15;
  const paddingTop = 10;
  const paddingBottom = 10;
  
  const usableWidth = width - paddingLeft - paddingRight;
  const usableHeight = height - paddingTop - paddingBottom;
  
  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%;">
    <defs>
      <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.2" />
        <stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
      </linearGradient>
    </defs>`;
  
  const spacing = usableWidth / 29;
  const points: {x: number, y: number}[] = [];
  
  values.forEach((v, i) => {
    const x = paddingLeft + i * spacing;
    const y = paddingTop + usableHeight - (v / maxVal) * usableHeight;
    points.push({x, y});
  });
  
  let areaD = `M ${points[0].x} ${paddingTop + usableHeight}`;
  points.forEach(p => areaD += ` L ${p.x} ${p.y}`);
  areaD += ` L ${points[points.length - 1].x} ${paddingTop + usableHeight} Z`;
  svg += `<path d="${areaD}" fill="url(#sparkGrad)" />`;
  
  let lineD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    lineD += ` L ${points[i].x} ${points[i].y}`;
  }
  svg += `<path d="${lineD}" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />`;
  
  const lastP = points[points.length - 1];
  svg += `<circle cx="${lastP.x}" cy="${lastP.y}" r="3.5" fill="var(--accent)" />`;
  
  svg += `</svg>`;
  return svg;
}

function drawAccuracyTrendChart(detailedActivity: Record<string, DailyStats>, last7Days: string[]): string {
  const points: {x: number, y: number, label: string, val: number}[] = [];
  const width = 400;
  const height = 120;
  const paddingLeft = 35;
  const paddingRight = 10;
  const paddingTop = 15;
  const paddingBottom = 20;
  
  const usableWidth = width - paddingLeft - paddingRight;
  const usableHeight = height - paddingTop - paddingBottom;
  
  last7Days.forEach((d, i) => {
    const stats = detailedActivity[d];
    const total = stats ? (stats.correct + stats.incorrect) : 0;
    const accuracy = total > 0 ? (stats.correct / total) * 100 : 100;
    
    const x = paddingLeft + i * (usableWidth / 6);
    const y = paddingTop + usableHeight - (accuracy / 100) * usableHeight;
    
    const dayName = new Date(d).toLocaleDateString(undefined, { weekday: 'short' });
    points.push({ x, y, label: dayName, val: accuracy });
  });
  
  let svg = `<svg viewBox="0 0 ${width} ${height}" style="width: 100%; height: 100%;">
    <defs>
      <linearGradient id="accAreaGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#2ed573" stop-opacity="0.2" />
        <stop offset="100%" stop-color="#2ed573" stop-opacity="0" />
      </linearGradient>
    </defs>`;
    
  const yLines = [50, 75, 100];
  yLines.forEach(p => {
    const y = paddingTop + usableHeight - (p / 100) * usableHeight;
    svg += `<line x1="${paddingLeft}" y1="${y}" x2="${width - paddingRight}" y2="${y}" stroke="rgba(255, 255, 255, 0.08)" stroke-dasharray="3 3" />`;
    svg += `<text x="${paddingLeft - 8}" y="${y + 3}" fill="var(--text3)" font-size="8" font-family="sans-serif" text-anchor="end">${p}%</text>`;
  });
  
  let areaD = `M ${points[0].x} ${paddingTop + usableHeight}`;
  points.forEach(p => areaD += ` L ${p.x} ${p.y}`);
  areaD += ` L ${points[points.length - 1].x} ${paddingTop + usableHeight} Z`;
  svg += `<path d="${areaD}" fill="url(#accAreaGrad)" />`;
  
  let lineD = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    lineD += ` L ${points[i].x} ${points[i].y}`;
  }
  svg += `<path d="${lineD}" fill="none" stroke="#2ed573" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />`;
  
  points.forEach(p => {
    svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--background)" stroke="#2ed573" stroke-width="1.5" class="chart-dot">
      <title>${Math.round(p.val)}% accuracy on ${p.label}</title>
    </circle>`;
    svg += `<text x="${p.x}" y="${height - 4}" fill="var(--text2)" font-size="8" font-family="sans-serif" text-anchor="middle">${p.label}</text>`;
  });
  
  svg += `</svg>`;
  return svg;
}

async function renderStats() {
  injectStyles();
  
  // Register sorting callback
  (window as any)._setDeckSortBy = (sortBy: string) => {
    deckSortBy = sortBy;
    renderStats();
  };

  // ── Summary metrics calculation ──
  let totalCards = 0, totalDue = 0, totalMistakes = 0;
  let totalMastered = 0, totalLearning = 0;
  
  Object.values(S.decks).forEach((d: any) => {
    const cards = d.cards || [];
    totalCards    += cards.length;
    totalDue      += cards.filter((c: any) => c.due <= Date.now()).length;
    totalMistakes += cards.reduce((s: any, c: any) => s + (c.mistakes || 0), 0);
    
    cards.forEach((c: any) => {
      if ((c.interval || 1) >= 7) totalMastered++;
      else totalLearning++;
    });
  });
  
  const rawActivity = await getActivityData();
  const tz = getUserTimeZone();
  const detailedActivity = getLocalDetailedActivity(rawActivity, tz);
  const localActivity = await getLocalActivityData();
  const streak = await computeStreak(localActivity);
  const longestStreak = computeLongestStreak(detailedActivity);
  const todayString = getLocalTodayString();
  const todayReviews = detailedActivity[todayString]?.reviews || 0;

  const panelStats = document.getElementById('panel-stats');
  if (!panelStats) return;

  // Set up focus panel container
  let focusPanelEl = document.getElementById('stats-focus-panel');
  if (!focusPanelEl) {
    focusPanelEl = document.createElement('div');
    focusPanelEl.id = 'stats-focus-panel';
    const statsSummary = document.getElementById('stats-summary');
    if (statsSummary) {
      panelStats.insertBefore(focusPanelEl, statsSummary);
    } else {
      panelStats.appendChild(focusPanelEl);
    }
  }

  // Set up charts container
  let chartsEl = document.getElementById('stats-charts');
  if (!chartsEl) {
    chartsEl = document.createElement('div');
    chartsEl.id = 'stats-charts';
    chartsEl.className = 'stats-section';
    const calendarDayDetails = document.getElementById('calendar-day-details');
    if (calendarDayDetails && calendarDayDetails.parentElement) {
      calendarDayDetails.parentElement.appendChild(chartsEl);
    } else {
      panelStats.appendChild(chartsEl);
    }
  }

  // Set up timeline container
  let timelineEl = document.getElementById('stats-timeline');
  if (!timelineEl) {
    timelineEl = document.createElement('div');
    timelineEl.id = 'stats-timeline';
    timelineEl.className = 'stats-section';
    const deckBreakdownSection = document.getElementById('stats-decks-list')?.closest('.stats-section');
    if (deckBreakdownSection) {
      panelStats.insertBefore(timelineEl, deckBreakdownSection);
    } else {
      panelStats.appendChild(timelineEl);
    }
  }

  let gamificationEl = document.getElementById('stats-gamification');
  if (!gamificationEl) {
    gamificationEl = document.createElement('div');
    gamificationEl.id = 'stats-gamification';
    gamificationEl.className = 'stats-section';
    const deckBreakdownSection = document.getElementById('stats-decks-list')?.closest('.stats-section');
    if (deckBreakdownSection) {
      panelStats.insertBefore(gamificationEl, deckBreakdownSection);
    } else {
      panelStats.appendChild(gamificationEl);
    }
  }

  let weaknessesEl = document.getElementById('stats-weaknesses');
  if (!weaknessesEl) {
    weaknessesEl = document.createElement('div');
    weaknessesEl.id = 'stats-weaknesses';
    weaknessesEl.className = 'stats-section';
    const deckBreakdownSection = document.getElementById('stats-decks-list')?.closest('.stats-section');
    if (deckBreakdownSection) {
      panelStats.insertBefore(weaknessesEl, deckBreakdownSection);
    } else {
      panelStats.appendChild(weaknessesEl);
    }
  }

  // Handle Onboarding/Empty State if 0 cards
  if (totalCards === 0) {
    focusPanelEl.style.display = 'none';
    if (document.getElementById('stats-summary')) document.getElementById('stats-summary')!.style.display = 'none';
    const calWrapper = document.getElementById('calendar-wrapper')?.parentElement;
    if (calWrapper) calWrapper.style.display = 'none';
    chartsEl.style.display = 'none';
    if (gamificationEl) gamificationEl.style.display = 'none';
    if (weaknessesEl) weaknessesEl.style.display = 'none';
    timelineEl.style.display = 'none';
    
    const deckListEl = document.getElementById('stats-decks-list');
    if (deckListEl) {
      deckListEl.innerHTML = `
        <div class="stats-onboarding" style="padding:40px 20px;">
          <div style="color:var(--accent); display:inline-flex; align-items:center; justify-content:center; margin-bottom:16px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:48px;height:48px"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c0 2 2 3 6 3s6-1 6-3v-5"/></svg>
          </div>
          <h3 style="font-size:18px; font-weight:700; color:var(--text); margin-bottom:10px;">Welcome to Analytics</h3>
          <p style="font-size:13px; color:var(--text2); line-height:1.5; max-width:440px; margin:0 auto 24px auto;">
            Track your learning progress, memory retention, card reviews, and daily streaks visualised in interactive heatmaps, charts, and milestones.
          </p>
          <div style="display:flex; justify-content:center; gap:16px; margin-bottom:24px; text-align:left; flex-wrap:wrap;">
            <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:12px 14px; border-radius:8px; width:190px;">
              <span style="font-size:13px; display:flex; align-items:center; gap:6px; margin-bottom:6px; font-weight:700; color:var(--text)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;color:var(--accent);flex-shrink:0"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>Heatmap Calendar</span>
              </span>
              <span style="font-size:11px; color:var(--text3); line-height:1.4; display:block;">Track study frequency & reviews directly in each calendar cell.</span>
            </div>
            <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); padding:12px 14px; border-radius:8px; width:190px;">
              <span style="font-size:13px; display:flex; align-items:center; gap:6px; margin-bottom:6px; font-weight:700; color:var(--text)">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;color:var(--accent);flex-shrink:0"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span>Insight Charts</span>
              </span>
              <span style="font-size:11px; color:var(--text3); line-height:1.4; display:block;">Visualise learning curves, daily time, and deck accuracy.</span>
            </div>
          </div>
          <button class="btn btn-primary" onclick="showPanel('sidebar', null)" style="padding:8px 20px; font-size:13px; font-weight:600;">
            Create Your First Deck
          </button>
        </div>
      `;
    }
    return;
  } else {
    focusPanelEl.style.display = 'block';
    if (document.getElementById('stats-summary')) document.getElementById('stats-summary')!.style.display = 'grid';
    const calWrapper = document.getElementById('calendar-wrapper')?.parentElement;
    if (calWrapper) calWrapper.style.display = 'block';
    chartsEl.style.display = 'block';
    if (gamificationEl) gamificationEl.style.display = 'block';
    if (weaknessesEl) weaknessesEl.style.display = 'block';
    timelineEl.style.display = 'block';
  }

  // ── Render Today's Focus Panel ──
  const dailyGoal = 15;
  const goalProgress = Math.min(100, Math.round((todayReviews / dailyGoal) * 100));
  const estimatedTimeMins = Math.ceil((totalDue * 12) / 60);
  
  let encouragementText = "Ready to start today's session? Consistency is key to building durable memory tracks!";
  if (totalDue === 0) {
    encouragementText = "Excellent work! All cards due today are completed. Perfect streak preservation!";
  } else if (todayReviews > 0) {
    encouragementText = `You are in the flow! Reviewed ${todayReviews} cards already. Let's finish the remaining due cards!`;
  }

  focusPanelEl.innerHTML = `
    <div class="focus-panel">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
        <div>
          <div style="font-size:11px; text-transform:uppercase; color:var(--accent); font-weight:700; letter-spacing:0.05em; margin-bottom:2px;">TODAY'S STUDY MISSION</div>
          <h2 style="font-size:20px; font-weight:700; color:var(--text); margin:0;">Focus Board</h2>
          <div style="font-size:12.5px; color:var(--text2); margin-top:6px; max-width:480px; line-height:1.4;">${encouragementText}</div>
        </div>
        ${totalDue > 0 ? `
          <button class="btn btn-primary" id="start-focus-btn" style="padding:8px 16px; font-size:12px; font-weight:600; display:flex; align-items:center; gap:6px; box-shadow: 0 4px 12px rgba(var(--accent-rgb), 0.25);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px"><polygon points="5 3 19 12 5 21 5 3"/></svg>
            <span>Start Reviewing</span>
          </button>
        ` : `
          <button class="btn btn-g" onclick="showPanel('sidebar', null)" style="padding:8px 16px; font-size:12px; font-weight:600;">
            Browse Decks
          </button>
        `}
      </div>
      
      <div class="focus-panel-grid">
        <div class="focus-metric">
          <div class="focus-metric-title">Cards Due</div>
          <div class="focus-metric-val" style="color: ${totalDue > 0 ? 'var(--accent)' : 'var(--text3)'}">${totalDue}</div>
        </div>
        <div class="focus-metric">
          <div class="focus-metric-title">Est. Study Time</div>
          <div class="focus-metric-val" style="font-size:18px; margin-top:4px;">${totalDue > 0 ? `${estimatedTimeMins} min` : '0 min'}</div>
        </div>
        <div class="focus-metric">
          <div class="focus-metric-title">Current Streak</div>
          <div class="focus-metric-val" style="color:#ff9f43;">${streak} day${streak !== 1 ? 's' : ''}</div>
        </div>
        <div class="focus-metric">
          <div class="focus-metric-title">Daily Goal</div>
          <div class="focus-metric-val" style="font-size:18px; margin-top:4px; color:#2ed573;">${todayReviews}/${dailyGoal} <span style="font-size:11px; font-weight:500; color:var(--text3);">(${goalProgress}%)</span></div>
        </div>
      </div>
    </div>
  `;

  // Attach dynamic listener for Start Focus button
  const startFocusBtn = document.getElementById('start-focus-btn');
  if (startFocusBtn) {
    startFocusBtn.onclick = () => {
      showPanel('study', null);
    };
  }

  // ── Summary Metrics Grid with trends ──
  let totalReviewsCount = 0;
  let totalTimeSecs = 0;
  let totalCorrect = 0;
  let totalIncorrect = 0;
  
  for (const entry of Object.values(detailedActivity)) {
    totalReviewsCount += entry.reviews;
    totalTimeSecs += entry.timeSpentSecs;
    totalCorrect += entry.correct;
    totalIncorrect += entry.incorrect;
  }
  
  const totalHours = (totalTimeSecs / 3600).toFixed(1);
  const avgAccuracy = totalCorrect + totalIncorrect > 0 ? Math.round((totalCorrect / (totalCorrect + totalIncorrect)) * 100) : 0;

  // Calculate 7-day trend values
  const last7DaysKeys: string[] = [];
  const prev7DaysKeys: string[] = [];
  for (let i = 0; i < 7; i++) {
    last7DaysKeys.unshift(subtractDays(todayString, i));
    prev7DaysKeys.unshift(subtractDays(todayString, i + 7));
  }

  const thisWeekReviews = last7DaysKeys.reduce((acc, k) => acc + (detailedActivity[k]?.reviews || 0), 0);
  const prevWeekReviews = prev7DaysKeys.reduce((acc, k) => acc + (detailedActivity[k]?.reviews || 0), 0);
  
  let revTrendHtml = `<span class="trend-pill neutral">~ 0%</span>`;
  if (prevWeekReviews > 0) {
    const diff = ((thisWeekReviews - prevWeekReviews) / prevWeekReviews) * 100;
    if (diff > 0) {
      revTrendHtml = `<span class="trend-pill up">▲ +${diff.toFixed(0)}%</span>`;
    } else if (diff < 0) {
      revTrendHtml = `<span class="trend-pill down">▼ ${diff.toFixed(0)}%</span>`;
    }
  } else if (thisWeekReviews > 0) {
    revTrendHtml = `<span class="trend-pill up">▲ New</span>`;
  }

  const statsSummaryEl = document.getElementById('stats-summary');
  if (statsSummaryEl) {
    statsSummaryEl.innerHTML = `
      <div class="stats-card">
        <div class="stats-card-title">Total Reviews</div>
        <div class="stats-card-val">${totalReviewsCount} <span style="font-size:12px; font-weight:500; color:var(--text3);">cards</span></div>
        <div class="stats-card-desc" style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
          <span>Weekly: <b>${thisWeekReviews} revs</b></span>
          ${revTrendHtml}
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-card-title">Total Time</div>
        <div class="stats-card-val">${totalHours} <span style="font-size:12px; font-weight:500; color:var(--text3);">hours</span></div>
        <div class="stats-card-desc" style="margin-top:6px;">
          Avg session: <b>${Math.round(totalReviewsCount > 0 ? (totalTimeSecs / totalReviewsCount) : 0)} sec</b> per card
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-card-title">Accuracy Rate</div>
        <div class="stats-card-val">${avgAccuracy}%</div>
        <div class="stats-card-desc" style="margin-top:6px;">
          Correct: <b>${totalCorrect}</b> · Mistakes: <b>${totalIncorrect}</b>
        </div>
      </div>
      <div class="stats-card">
        <div class="stats-card-title">Daily Streak</div>
        <div class="stats-card-val">${streak} <span style="font-size:12px; font-weight:500; color:var(--text3);">days</span></div>
        <div class="stats-card-desc" style="margin-top:6px;">
          Longest record: <b>${longestStreak} days</b>
        </div>
      </div>
    `;
  }

  // ── Calendar Month View ──
  const monthYearLabel = document.getElementById('calendar-month-year');
  const daysGrid = document.getElementById('calendar-days-grid');
  
  if (monthYearLabel && daysGrid) {
    const monthNames = [
      "January", "February", "March", "April", "May", "June", 
      "July", "August", "September", "October", "November", "December"
    ];
    
    monthYearLabel.textContent = `${monthNames[currentStatsMonth]} ${currentStatsYear}`;
    
    // Wire up prev/next/today buttons
    const prevBtn = document.getElementById('calendar-prev-btn');
    if (prevBtn) {
      prevBtn.onclick = () => {
        currentStatsMonth--;
        if (currentStatsMonth < 0) {
          currentStatsMonth = 11;
          currentStatsYear--;
        }
        renderStats();
      };
    }
    
    const nextBtn = document.getElementById('calendar-next-btn');
    if (nextBtn) {
      nextBtn.onclick = () => {
        currentStatsMonth++;
        if (currentStatsMonth > 11) {
          currentStatsMonth = 0;
          currentStatsYear++;
        }
        renderStats();
      };
    }
    
    const todayBtn = document.getElementById('calendar-today-btn');
    if (todayBtn) {
      todayBtn.onclick = () => {
        const today = new Date();
        currentStatsMonth = today.getMonth();
        currentStatsYear = today.getFullYear();
        selectedDayKey = getLocalTodayString();
        renderStats();
      };
    }
    
    const firstOfMonth = new Date(currentStatsYear, currentStatsMonth, 1, 12, 0, 0);
    const startDay = firstOfMonth.getDay();
    const startOfGrid = new Date(firstOfMonth);
    startOfGrid.setDate(firstOfMonth.getDate() - startDay);
    
    daysGrid.innerHTML = '';
    
    const cellDates: Date[] = [];
    for (let i = 0; i < 42; i++) {
      const cellDate = new Date(startOfGrid);
      cellDate.setDate(startOfGrid.getDate() + i);
      cellDates.push(cellDate);
    }
    
    let maxReviewsInView = 1;
    cellDates.forEach(date => {
      const key = getLocalDayString(date);
      const val = detailedActivity[key]?.reviews || 0;
      if (val > maxReviewsInView) maxReviewsInView = val;
    });
    
    for (const cellDate of cellDates) {
      const key = getLocalDayString(cellDate);
      const stats = detailedActivity[key];
      const val = stats ? stats.reviews : 0;
      const isToday = key === todayString;
      const isCurrentMonth = cellDate.getMonth() === currentStatsMonth;
      const isSelected = key === selectedDayKey;
      
      let heatLevel = 0;
      if (val > 0) {
        const ratio = val / maxReviewsInView;
        if (ratio <= 0.15) heatLevel = 1;
        else if (ratio <= 0.4) heatLevel = 2;
        else if (ratio <= 0.65) heatLevel = 3;
        else if (ratio <= 0.9) heatLevel = 4;
        else heatLevel = 5;
      }
      
      const cell = document.createElement('div');
      cell.className = `calendar-day-cell heat-${heatLevel}${!isCurrentMonth ? ' other-month' : ''}${isToday ? ' today' : ''}${isSelected ? ' selected-day' : ''}`;
      cell.dataset.key = key;
      
      const numWrapper = document.createElement('div');
      numWrapper.className = 'calendar-day-num-wrapper';
      
      const numSpan = document.createElement('span');
      numSpan.className = 'calendar-day-num';
      numSpan.textContent = String(cellDate.getDate());
      numWrapper.appendChild(numSpan);
      cell.appendChild(numWrapper);
      
      // Inline mini visual metrics if reviews exist
      if (val > 0) {
        const miniMetrics = document.createElement('div');
        miniMetrics.className = 'calendar-day-metrics';
        
        let miniHtml = `<span class="day-metric-revs">${val}</span>`;
        if (stats && stats.incorrect > 0) {
          miniHtml += `<span class="day-metric-errs">${stats.incorrect}</span>`;
        }
        miniMetrics.innerHTML = miniHtml;
        cell.appendChild(miniMetrics);
      }
      
      // Setup rich hover tooltip with correct vs incorrect, mistakes, XP earned, duration
      const tooltip = document.createElement('div');
      tooltip.className = 'cell-tooltip';
      if (val > 0 && stats) {
        const mins = Math.floor(stats.timeSpentSecs / 60);
        const secs = stats.timeSpentSecs % 60;
        const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
        const xpEarned = stats.correct * 10 + stats.incorrect * 2;
        tooltip.innerHTML = `
          <div style="font-weight:700; color:var(--accent); margin-bottom:4px;">${cellDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
          <div>Reviews: <b>${val}</b> cards</div>
          <div>Duration: <b>${timeStr}</b></div>
          <div>Correct / Errors: <b>${stats.correct} / ${stats.incorrect}</b></div>
          <div>XP Gained: <b>+${xpEarned} XP</b></div>
          <div>Accuracy: <b>${Math.round((stats.correct / (stats.correct + stats.incorrect)) * 100)}%</b></div>
        `;
      } else {
        tooltip.innerHTML = `
          <div style="font-weight:600; color:var(--text3);">${cellDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
          <div style="font-size:9.5px; margin-top:2px; color:var(--text3);">No activity logged</div>
        `;
      }
      cell.appendChild(tooltip);
      
      cell.onclick = () => {
        document.querySelectorAll('.calendar-day-cell').forEach(c => c.classList.remove('selected-day'));
        cell.classList.add('selected-day');
        selectedDayKey = key;
        
        renderDayDetails(key, val, cellDate, stats);
      };
      
      daysGrid.appendChild(cell);
    }
    
    // Auto show details for selected day or today on initial load
    if (selectedDayKey) {
      const [y, m, d] = selectedDayKey.split('-').map(Number);
      const initialDate = new Date(y, m - 1, d, 12, 0, 0);
      const stats = detailedActivity[selectedDayKey];
      const initialVal = stats ? stats.reviews : 0;
      renderDayDetails(selectedDayKey, initialVal, initialDate, stats);
    } else {
      const stats = detailedActivity[todayString];
      const initialVal = stats ? stats.reviews : 0;
      const [y, m, d] = todayString.split('-').map(Number);
      renderDayDetails(todayString, initialVal, new Date(y, m - 1, d, 12, 0, 0), stats);
    }
  }

  // ── Render SVG Analytics Charts Section ──
  const reviewsWeeklySvg = drawWeeklyReviewsChart(detailedActivity, last7DaysKeys);
  const timeWeeklySvg = drawWeeklyTimeChart(detailedActivity, last7DaysKeys);
  const accuracyWeeklySvg = drawAccuracyTrendChart(detailedActivity, last7DaysKeys);
  
  const last30DaysKeys: string[] = [];
  for (let i = 0; i < 30; i++) {
    last30DaysKeys.unshift(subtractDays(todayString, i));
  }
  const sparkline30DaySvg = draw30DayMomentumChart(detailedActivity, last30DaysKeys);

  chartsEl.innerHTML = `
    <div class="stats-section-title">Analytics & Trend Curves</div>
    
    <!-- 30-day Momentum Graph -->
    <div class="chart-card" style="margin-bottom:16px;">
      <div class="chart-card-title">
        <span>30-Day Learning Momentum</span>
        <span style="font-size:10px; color:var(--text3);">Daily activity peaks</span>
      </div>
      <div class="chart-container-svg" style="height:80px;">
        ${sparkline30DaySvg}
      </div>
    </div>
    
    <div class="charts-grid">
      <div class="chart-card">
        <div class="chart-card-title">
          <span>Weekly Reviews Volume</span>
          <span style="font-size:10px; color:var(--accent);">Completed reviews</span>
        </div>
        <div class="chart-container-svg">
          ${reviewsWeeklySvg}
        </div>
      </div>
      
      <div class="chart-card">
        <div class="chart-card-title">
          <span>Daily Study Time (mins)</span>
          <span style="font-size:10px; color:var(--accent);">Active session length</span>
        </div>
        <div class="chart-container-svg">
          ${timeWeeklySvg}
        </div>
      </div>
      
      <div class="chart-card">
        <div class="chart-card-title">
          <span>Accuracy Trend</span>
          <span style="font-size:10px; color:#2ed573;">% correct cards</span>
        </div>
        <div class="chart-container-svg">
          ${accuracyWeeklySvg}
        </div>
      </div>
    </div>
  `;

  // ── Study Gamification, Badges & Achievements Section ──
  if (gamificationEl) {
    const badges = [
      {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
        name: 'First Milestone',
        desc: 'Completed your first flashcard review',
        unlocked: totalReviewsCount > 0,
        rarity: 'common',
        progress: totalReviewsCount > 0 ? 100 : 0
      },
      {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        name: 'Consistency Kick',
        desc: 'Earned a 3-day study streak',
        unlocked: streak >= 3,
        rarity: 'rare',
        progress: Math.min(100, Math.round((streak / 3) * 100))
      },
      {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
        name: 'Precision Scholar',
        desc: '100% accuracy on 10+ reviews in a single day',
        unlocked: Object.values(detailedActivity).some(e => e.reviews >= 10 && e.incorrect === 0),
        rarity: 'rare',
        progress: Object.values(detailedActivity).some(e => e.reviews >= 10 && e.incorrect === 0) ? 100 : Math.min(100, Math.round((Math.max(...Object.values(detailedActivity).map(e => e.incorrect === 0 ? e.reviews : 0), 0) / 10) * 100))
      },
      {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
        name: 'Unstoppable',
        desc: 'Earned a 7-day study streak',
        unlocked: streak >= 7,
        rarity: 'epic',
        progress: Math.min(100, Math.round((streak / 7) * 100))
      },
      {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>`,
        name: 'Spaced Wizard',
        desc: 'Have 10+ fully mastered cards (interval ≥ 7)',
        unlocked: totalMastered >= 10,
        rarity: 'epic',
        progress: Math.min(100, Math.round((totalMastered / 10) * 100))
      },
      {
        icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:18px;height:18px"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M3 20h18v2H3v-2z"/></svg>`,
        name: 'Fame & Glory',
        desc: 'Reviewed over 100 flashcards total',
        unlocked: totalReviewsCount >= 100,
        rarity: 'legendary',
        progress: Math.min(100, Math.round((totalReviewsCount / 100) * 100))
      }
    ];
    
    const badgesHtml = badges.map(b => `
      <div class="achievement-badge ${b.unlocked ? `unlocked ${b.rarity}` : 'locked'}" title="${b.desc}">
        <div class="achievement-icon" style="display:flex;align-items:center;justify-content:center">${b.icon}</div>
        <div class="achievement-name">${b.name}</div>
        <div class="achievement-desc">${b.desc}</div>
        <div class="achievement-status" style="color:var(--accent); font-weight:700; font-size:10px; display:inline-flex; align-items:center; justify-content:center">
          ${b.unlocked ? '<span style="color:#2ed573">✓</span>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;color:var(--text3);opacity:0.6"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'}
        </div>
        <div class="achievement-progress-track">
          <div class="achievement-progress-fill ${b.rarity}" style="width: ${b.progress}%;"></div>
        </div>
        <div style="font-size:8px; color:var(--text3); margin-top:4px; font-weight:600;">
          ${b.unlocked ? b.rarity.toUpperCase() : `${b.progress}% COMPLETED`}
        </div>
      </div>
    `).join('');
    
    let goalEncouragement = '';
    if (todayReviews >= dailyGoal) {
      goalEncouragement = `<span style="color:#2ed573; font-weight:600;">Daily Goal Completed!</span> Outstanding study speed and precision today!`;
    } else {
      goalEncouragement = `Just <span style="color:var(--accent); font-weight:600;">${dailyGoal - todayReviews} more card${dailyGoal - todayReviews !== 1 ? 's' : ''}</span> to hit your daily target. Keep it going!`;
    }
    
    gamificationEl.innerHTML = `
      <div class="stats-section-title" style="margin-bottom:14px;">Goals & Milestones</div>
      
      <!-- Daily target tracker -->
      <div style="background:rgba(255,255,255,0.015); border:1px solid var(--border); border-radius:10px; padding:14px; margin-bottom:18px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:12px; font-weight:600; color:var(--text2);">Daily Study Target</span>
          <span style="font-size:12px; font-weight:700; color:var(--accent);">${todayReviews} / ${dailyGoal} cards (${goalProgress}%)</span>
        </div>
        <div style="height:8px; background:rgba(255,255,255,0.06); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${goalProgress}%; background:var(--accent); border-radius:4px; transition: width 0.3s ease;"></div>
        </div>
        <div style="font-size:11px; color:var(--text3); margin-top:8px;">
          ${goalEncouragement}
        </div>
      </div>
      
      <!-- Bento Grid Insights -->
      <div class="insights-row">
        <div class="insight-card" style="display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:8px; padding:10px 14px;">
          <div class="insight-icon" style="background:rgba(var(--accent-rgb), 0.08); border-radius:6px; width:30px; height:30px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;color:var(--accent)"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          </div>
          <div class="insight-info">
            <div class="insight-title" style="font-size:10px; color:var(--text3); text-transform:uppercase; font-weight:600; letter-spacing:0.5px;">Total Reviews</div>
            <div class="insight-val" style="font-size:13px; font-weight:700; color:var(--text);">${totalReviewsCount} cards</div>
          </div>
        </div>
        <div class="insight-card" style="display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:8px; padding:10px 14px;">
          <div class="insight-icon" style="background:rgba(var(--accent-rgb), 0.08); border-radius:6px; width:30px; height:30px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;color:var(--accent)"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          </div>
          <div class="insight-info">
            <div class="insight-title" style="font-size:10px; color:var(--text3); text-transform:uppercase; font-weight:600; letter-spacing:0.5px;">Total Time</div>
            <div class="insight-val" style="font-size:13px; font-weight:700; color:var(--text);">${totalHours} hours</div>
          </div>
        </div>
        <div class="insight-card" style="display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:8px; padding:10px 14px;">
          <div class="insight-icon" style="background:rgba(var(--accent-rgb), 0.08); border-radius:6px; width:30px; height:30px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;color:var(--accent)"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>
          </div>
          <div class="insight-info">
            <div class="insight-title" style="font-size:10px; color:var(--text3); text-transform:uppercase; font-weight:600; letter-spacing:0.5px;">Avg Accuracy</div>
            <div class="insight-val" style="font-size:13px; font-weight:700; color:var(--text);">${avgAccuracy}%</div>
          </div>
        </div>
        <div class="insight-card" style="display:flex; align-items:center; gap:12px; background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:8px; padding:10px 14px;">
          <div class="insight-icon" style="background:rgba(var(--accent-rgb), 0.08); border-radius:6px; width:30px; height:30px; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:15px;height:15px;color:var(--accent)"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>
          </div>
          <div class="insight-info">
            <div class="insight-title" style="font-size:10px; color:var(--text3); text-transform:uppercase; font-weight:600; letter-spacing:0.5px;">Best Streak</div>
            <div class="insight-val" style="font-size:13px; font-weight:700; color:var(--text);">${longestStreak} days</div>
          </div>
        </div>
      </div>
      
      <!-- Achievement Milestones -->
      <div style="margin-top:18px;">
        <div style="font-size:11px; font-weight:600; color:var(--text3); margin-bottom:10px; text-transform:uppercase; letter-spacing:0.5px;">Study Milestones</div>
        <div class="achievements-grid">
          ${badgesHtml}
        </div>
      </div>
    `;
  }

  // ── Activity Timeline Section ──
  const timelineEntries = Object.entries(rawActivity)
    .map(([time, value]: [string, any]) => {
      const ms = isNaN(Number(time)) ? Date.parse(time) : Number(time);
      return { ms, value };
    })
    .filter(e => !isNaN(e.ms))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5); // display top 5 most recent

  let timelineHtml = `
    <div class="stats-section-title" style="margin-bottom:14px;">⏱️ Recent Activity Feed</div>
    <div class="timeline">
  `;
  
  if (timelineEntries.length === 0) {
    timelineHtml += `
      <div style="color:var(--text3); font-size:12px; padding:12px 0;">No study activity recorded yet. Finish a review session to populate your timeline!</div>
    `;
  } else {
    timelineEntries.forEach(entry => {
      const date = new Date(entry.ms);
      const relativeTime = date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const deckName = S.decks[entry.value.deckId]?.name || 'Unknown Deck';
      const tot = entry.value.correct + entry.value.incorrect;
      const acc = tot > 0 ? Math.round((entry.value.correct / tot) * 100) : 100;
      
      timelineHtml += `
        <div class="timeline-item">
          <div class="timeline-node"></div>
          <div class="timeline-content">
            <div>
              <div class="timeline-title">Reviewed <strong>${tot}</strong> cards in <strong>${escH(deckName)}</strong></div>
              <div style="font-size:11px; color:var(--text3); margin-top:2px;">
                Accuracy: <b>${acc}%</b> (${entry.value.correct} correct, ${entry.value.incorrect} errors) · Time: <b>${entry.value.timeSpentSecs}s</b>
              </div>
            </div>
            <div class="timeline-time">${relativeTime}</div>
          </div>
        </div>
      `;
    });
  }
  
  timelineHtml += `</div>`;
  if (timelineEl) {
    timelineEl.innerHTML = timelineHtml;
  }

  // Compute top 5 weakest cards
  const allCardsWithMistakes: { card: any, deckName: string, deckId: string }[] = [];
  Object.entries(S.decks).forEach(([deckId, d]: any) => {
    const cards = d.cards || [];
    cards.forEach((c: any) => {
      if (c.mistakes && c.mistakes > 0) {
        allCardsWithMistakes.push({
          card: c,
          deckName: d.name,
          deckId
        });
      }
    });
  });
  allCardsWithMistakes.sort((a, b) => b.card.mistakes - a.card.mistakes);
  const weakestCards = allCardsWithMistakes.slice(0, 5);

  if (weaknessesEl) {
    if (weakestCards.length === 0) {
      weaknessesEl.innerHTML = `
        <div class="stats-section-title">Weakness Analyzer</div>
        <div style="background:rgba(255,255,255,0.01); border:1px dashed var(--border); border-radius:10px; padding:24px; text-align:center;">
          <div style="color:var(--accent); margin-bottom:12px; display:flex; justify-content:center">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:32px;height:32px"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <div style="font-size:13.5px; font-weight:600; color:var(--text);">No "Leaky" Cards Detected</div>
          <div style="font-size:12px; color:var(--text3); margin-top:4px; max-width:320px; margin-left:auto; margin-right:auto;">
            Cards with multiple failed attempts will show up here as priority study recommendations. Keep up the high accuracy!
          </div>
        </div>
      `;
    } else {
      let cardsHtml = weakestCards.map(({ card, deckName, deckId }) => {
        const qEsced = escH(card.q);
        const aEsced = escH(card.a);
        const qTrimmed = qEsced.length > 80 ? qEsced.slice(0, 77) + '...' : qEsced;
        const aTrimmed = aEsced.length > 80 ? aEsced.slice(0, 77) + '...' : aEsced;
        
        // Escape quotes to prevent breaks in inline js
        const qJsSafe = qEsced.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
        const aJsSafe = aEsced.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n');
        
        return `
          <div class="weak-card-row" style="background:rgba(255,255,255,0.01); border:1px solid var(--border); border-radius:8px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; position:relative; overflow:hidden;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
              <div style="display:flex; flex-direction:column;">
                <span style="font-size:10px; text-transform:uppercase; color:var(--text3); font-weight:700; letter-spacing:0.5px;">${escH(deckName)}</span>
                <span style="font-size:13px; font-weight:600; color:var(--text); margin-top:4px;" title="${qEsced}">${qTrimmed}</span>
              </div>
              <div style="background:rgba(235, 94, 85, 0.12); color:#eb5e55; font-size:11px; font-weight:700; padding:3px 8px; border-radius:12px; white-space:nowrap; display:flex; align-items:center; gap:4px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;color:#eb5e55;flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <span>${card.mistakes} mistakes</span>
              </div>
            </div>
            <div style="font-size:12px; color:var(--text2); background:rgba(0,0,0,0.15); padding:6px 10px; border-radius:4px; border-left:2px solid var(--accent);" title="${aEsced}">
              <b>Answer:</b> ${aTrimmed}
            </div>
            <div style="display:flex; gap:8px; margin-top:4px; flex-wrap:wrap;">
              <button class="btn btn-sm btn-g" onclick="window.selectDeck('${deckId}')" style="padding:4px 8px; font-size:11px; display:inline-flex; align-items:center; gap:4px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                <span>Review Deck</span>
              </button>
              <button class="btn btn-sm" onclick="window.askAIChatAboutCard('${qJsSafe}', '${aJsSafe}')" style="padding:4px 8px; font-size:11px; background:rgba(var(--accent-rgb), 0.1); border-color:rgba(var(--accent-rgb), 0.2); color:var(--accent); display:inline-flex; align-items:center; gap:4px;">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;color:var(--accent)"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span>AI Mnemonic</span>
              </button>
            </div>
          </div>
        `;
      }).join('');

      weaknessesEl.innerHTML = `
        <div class="stats-section-title">Weakness Analyzer &amp; Action Plan</div>
        <div style="font-size:12px; color:var(--text3); margin-bottom:12px;">
          These are your top 5 most frequently missed cards. Tap <b>Review Deck</b> to practice, or let the <b>AI Mnemonic</b> tutor generate unforgettable memory hooks for you in the Chat.
        </div>
        <div style="display:grid; grid-template-columns:1fr; gap:12px;">
          ${cardsHtml}
        </div>
      `;
    }
  }

  // ── Per-deck breakdown ──
  const deckListEl = document.getElementById('stats-decks-list');
  if (deckListEl) {
    const allIds = Object.keys(S.decks);
    S.deckOrder = S.deckOrder.filter(id => S.decks[id]); // prune deleted
    const missing = allIds.filter(id => !S.deckOrder.includes(id));
    S.deckOrder = [...S.deckOrder, ...missing];
    const ids = S.deckOrder;
    
    if (!ids.length) { 
      deckListEl.innerHTML = '<div style="font-size:13px;color:var(--text3);text-align:center;padding:20px;">No decks yet. Add a deck to see performance.</div>'; 
      return; 
    }
    
    // Compute deck metrics
    const decksMetrics: Record<string, DeckMetrics> = {};
    ids.forEach(id => {
      const d = S.decks[id];
      const cards = d.cards || [];
      const mastered = cards.filter((c: any) => (c.interval || 1) >= 7).length;
      const learning = cards.filter((c: any) => (c.interval || 1) < 7).length;
      const due = cards.filter((c: any) => c.due <= Date.now()).length;
      const avgEase = cards.length ? Number((cards.reduce((sum: number, c: any) => sum + (c.ease || 2.5), 0) / cards.length).toFixed(2)) : 2.5;
      
      decksMetrics[id] = {
        id,
        name: d.name,
        totalCards: cards.length,
        dueCards: due,
        mastered,
        learning,
        reviewsCount: 0,
        avgEase
      };
    });
    
    // Count reviews per deck
    for (const val of Object.values(rawActivity)) {
      if (val && typeof val === 'object' && (val as any).deckId) {
        const dId = (val as any).deckId;
        if (decksMetrics[dId]) {
          const c = Number((val as any).correct || 0);
          const inc = Number((val as any).incorrect || 0);
          const sk = Number((val as any).skipped || 0);
          decksMetrics[dId].reviewsCount += (c + inc + sk);
        }
      }
    }
    
    // Apply dynamic deck sorting based on selection
    const sortedDecks = Object.values(decksMetrics).sort((a, b) => {
      if (deckSortBy === 'reviews') {
        return b.reviewsCount - a.reviewsCount;
      } else if (deckSortBy === 'due') {
        return b.dueCards - a.dueCards;
      } else if (deckSortBy === 'mastery') {
        const aPct = a.totalCards > 0 ? (a.mastered / a.totalCards) : 0;
        const bPct = b.totalCards > 0 ? (b.mastered / b.totalCards) : 0;
        return bPct - aPct;
      } else if (deckSortBy === 'total') {
        return b.totalCards - a.totalCards;
      } else if (deckSortBy === 'alpha') {
        return a.name.localeCompare(b.name);
      }
      return b.reviewsCount - a.reviewsCount;
    });

    const mostStudied = sortedDecks.length > 0 && sortedDecks[0].reviewsCount > 0 ? sortedDecks[0] : null;
    const leastStudied = sortedDecks.length > 0 ? (sortedDecks[sortedDecks.length - 1].reviewsCount === 0 || sortedDecks.length > 1 ? sortedDecks[sortedDecks.length - 1] : null) : null;
    
    let insightsHtml = `
      <!-- Sorting controls -->
      <div class="sort-pills">
        <div class="sort-pill ${deckSortBy === 'reviews' ? 'active' : ''}" onclick="window._setDeckSortBy('reviews')">Reviews</div>
        <div class="sort-pill ${deckSortBy === 'due' ? 'active' : ''}" onclick="window._setDeckSortBy('due')">Due Cards</div>
        <div class="sort-pill ${deckSortBy === 'mastery' ? 'active' : ''}" onclick="window._setDeckSortBy('mastery')">Mastery %</div>
        <div class="sort-pill ${deckSortBy === 'total' ? 'active' : ''}" onclick="window._setDeckSortBy('total')">Total Cards</div>
        <div class="sort-pill ${deckSortBy === 'alpha' ? 'active' : ''}" onclick="window._setDeckSortBy('alpha')">Alphabetical</div>
      </div>

      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(240px, 1fr)); gap:16px; margin-bottom:20px;">
        <div style="background:rgba(var(--accent-rgb), 0.03); border:1px solid rgba(var(--accent-rgb), 0.15); border-radius:10px; padding:14px; position:relative; overflow:hidden;">
          <div style="font-size:10px; text-transform:uppercase; color:var(--accent); font-weight:700; letter-spacing:0.5px; display:flex; align-items:center; gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;color:var(--accent);flex-shrink:0"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
            <span>Most Studied Deck</span>
          </div>
          <div style="font-size:16px; font-weight:700; color:var(--text); margin-top:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${mostStudied ? escH(mostStudied.name) : 'No reviews recorded'}
          </div>
          <div style="font-size:11px; color:var(--text3); margin-top:4px;">
            ${mostStudied ? `Reviewed <strong>${mostStudied.reviewsCount}</strong> times total · avg ease ${mostStudied.avgEase}` : 'Start studying a deck to track reviews!'}
          </div>
          <div style="position:absolute; bottom:-10px; right:-10px; opacity:0.07; transform:rotate(-15deg); color:var(--accent);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:54px;height:54px"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></div>
        </div>
        
        <div style="background:rgba(255,255,255,0.02); border:1px solid var(--border); border-radius:10px; padding:14px; position:relative; overflow:hidden;">
          <div style="font-size:10px; text-transform:uppercase; color:var(--text3); font-weight:700; letter-spacing:0.5px; display:flex; align-items:center; gap:4px">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:11px;height:11px;color:var(--yellow);flex-shrink:0"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            <span>Needs Focus / Attention</span>
          </div>
          <div style="font-size:16px; font-weight:700; color:var(--text); margin-top:6px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
            ${leastStudied ? escH(leastStudied.name) : 'All decks studied!'}
          </div>
          <div style="font-size:11px; color:var(--text3); margin-top:4px;">
            ${leastStudied ? `Only <strong>${leastStudied.reviewsCount}</strong> reviews · ${leastStudied.dueCards} cards due today` : 'Superb work keeping all decks updated!'}
          </div>
          <div style="position:absolute; bottom:-10px; right:-10px; opacity:0.07; transform:rotate(-15deg); color:var(--text);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:54px;height:54px"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg></div>
        </div>
      </div>
    `;
    
    const listHtml = sortedDecks.map(d => {
      const masteredPct = d.totalCards > 0 ? Math.round((d.mastered / d.totalCards) * 100) : 0;
      const learningPct = d.totalCards > 0 ? Math.round((d.learning / d.totalCards) * 100) : 0;
      const needsAttention = d.dueCards > 5;
      
      return `
        <div style="background:rgba(255,255,255,0.01); border: ${needsAttention ? '1px solid rgba(255, 159, 67, 0.3)' : '1px solid var(--border)'}; border-radius:8px; padding:12px; margin-bottom:12px; transition:all 0.2s; position:relative; overflow:hidden;" onmouseover="this.style.borderColor='var(--border2)'" onmouseout="this.style.borderColor='${needsAttention ? 'rgba(255, 159, 67, 0.3)' : 'var(--border)'}'">
          ${needsAttention ? `<div style="position:absolute; top:4px; right:4px; background:rgba(255, 159, 67, 0.15); color:#ff9f43; font-size:8px; font-weight:800; padding:1px 4px; border-radius:3px;">FOCUS REQUIRED</div>` : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:8px;">
            <div style="font-size:13px; font-weight:600; color:var(--text); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${escH(d.name)}
            </div>
            <div style="font-size:11px; color:var(--text3); display:flex; gap:10px; align-items:center;">
              <span>Total: <b>${d.totalCards}</b></span>
              <span style="color:#2ed573;">✔ ${d.mastered} Mastered</span>
              <span style="color:var(--yellow);">${d.dueCards} Due</span>
            </div>
          </div>
          
          <div class="multi-prog" title="Mastered (${masteredPct}%) vs Learning (${learningPct}%)">
            <div class="multi-prog-segment" style="width:${masteredPct}%; background:#2ed573;"></div>
            <div class="multi-prog-segment" style="width:${learningPct}%; background:rgba(var(--accent-rgb), 0.35);"></div>
          </div>
          
          <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text3); margin-top:4px;">
            <span>Mastery: <b>${masteredPct}%</b></span>
            <span>Total reviews: <b>${d.reviewsCount}</b> · avg ease <b>${d.avgEase}</b></span>
          </div>
        </div>
      `;
    }).join('');
    
    deckListEl.innerHTML = insightsHtml + listHtml;
  }
}
 
 
// ─── NOTE EXPORT / IMPORT ────────────────────────────────────────────────────
// Removed

(function() {
  let dragId   = null;
  let dragEl   = null;
  let dragType = null; // 'deck' | 'folder'
 
  function getContainer() { return document.getElementById('sidebar-decks'); }
 
  function onDragStart(e) {
    // Check folder first
    const folderEl = e.target.closest('[data-folder-id]');
    const deckEl   = e.target.closest('[data-deck-id]');
    if (folderEl) {
      dragId   = folderEl.dataset.folderId;
      dragEl   = folderEl;
      dragType = 'folder';
      folderEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'folder:' + dragId);
    } else if (deckEl) {
      dragId   = deckEl.dataset.deckId;
      dragEl   = deckEl;
      dragType = 'deck';
      deckEl.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', 'deck:' + dragId);
    }
  }
 
  function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const folderEl = e.target.closest('[data-folder-id]');
    const deckEl   = e.target.closest('[data-deck-id]');
    const targetEl = dragType === 'folder' ? folderEl : deckEl;
    if (!targetEl || targetEl === dragEl) return;
    getContainer().querySelectorAll('[data-deck-id],[data-folder-id]').forEach(el => el.classList.remove('drag-over'));
    targetEl.classList.add('drag-over');
  }
 
  function onDragLeave(e) {
    const el = e.target.closest('[data-deck-id],[data-folder-id]');
    if (el) el.classList.remove('drag-over');
  }
 
  function onDrop(e) {
    e.preventDefault();
    if (dragType === 'folder') {
      const target = e.target.closest('[data-folder-id]');
      if (!target || !dragId || target.dataset.folderId === dragId) return;
      const targetId = target.dataset.folderId;
      const from = S.folderOrder.indexOf(dragId);
      const to   = S.folderOrder.indexOf(targetId);
      if (from === -1 || to === -1) return;
      S.folderOrder.splice(from, 1);
      S.folderOrder.splice(to, 0, dragId);
    } else {
      const target = e.target.closest('[data-deck-id]');
      if (!target || !dragId || target.dataset.deckId === dragId) return;
      const targetId = target.dataset.deckId;
      const from = S.deckOrder.indexOf(dragId);
      const to   = S.deckOrder.indexOf(targetId);
      if (from === -1 || to === -1) return;
      S.deckOrder.splice(from, 1);
      S.deckOrder.splice(to, 0, dragId);
    }
    persist();
    renderSidebar();
  }
 
  function onDragEnd() {
    if (dragEl) dragEl.classList.remove('dragging');
    getContainer()?.querySelectorAll('[data-deck-id],[data-folder-id]').forEach(el => el.classList.remove('drag-over'));
    dragId = null; dragEl = null; dragType = null;
  }
 
  // Touch drag support (mobile)
  let touchDragId = null, touchDragEl = null, touchDragType = null, touchClone = null, touchStartY = 0;
 
  function onTouchStart(e) {
    const item = e.target.closest('.di-drag');
    if (!item) return;
    const deckItem   = item.closest('[data-deck-id]');
    const folderItem = item.closest('[data-folder-id]');
    const target = deckItem || folderItem;
    if (!target) return;
    touchDragId   = deckItem ? deckItem.dataset.deckId : folderItem.dataset.folderId;
    touchDragType = deckItem ? 'deck' : 'folder';
    touchDragEl   = target;
    touchStartY   = e.touches[0].clientY;
    touchClone    = target.cloneNode(true);
    touchClone.style.cssText = 'position:fixed;z-index:9999;width:' + target.offsetWidth + 'px;opacity:0.85;pointer-events:none;background:var(--surface2);border-radius:var(--rs);border:1px solid var(--accent)';
    touchClone.style.left = target.getBoundingClientRect().left + 'px';
    touchClone.style.top  = target.getBoundingClientRect().top  + 'px';
    document.body.appendChild(touchClone);
    target.classList.add('dragging');
    e.preventDefault();
  }
 
  function onTouchMove(e) {
    if (!touchClone) return;
    const y = e.touches[0].clientY;
    touchClone.style.top = (parseFloat(touchClone.style.top) + (y - touchStartY)) + 'px';
    touchStartY = y;
    touchClone.style.display = 'none';
    const el = document.elementFromPoint(e.touches[0].clientX, y);
    touchClone.style.display = '';
    const selector = touchDragType === 'folder' ? '[data-folder-id]' : '[data-deck-id]';
    const target = el?.closest(selector);
    const container = getContainer();
    container?.querySelectorAll('[data-deck-id],[data-folder-id]').forEach(el => el.classList.remove('drag-over'));
    if (target && target !== touchDragEl) target.classList.add('drag-over');
    e.preventDefault();
  }
 
  function onTouchEnd() {
    if (!touchDragId) return;
    if (touchClone) { touchClone.remove(); touchClone = null; }
    if (touchDragEl) touchDragEl.classList.remove('dragging');
    const container = getContainer();
    const target = container?.querySelector('.drag-over');
    if (target) {
      if (touchDragType === 'folder' && target.dataset.folderId && target.dataset.folderId !== touchDragId) {
        const from = S.folderOrder.indexOf(touchDragId);
        const to   = S.folderOrder.indexOf(target.dataset.folderId);
        if (from !== -1 && to !== -1) { S.folderOrder.splice(from, 1); S.folderOrder.splice(to, 0, touchDragId); persist(); }
      } else if (touchDragType === 'deck' && target.dataset.deckId && target.dataset.deckId !== touchDragId) {
        const from = S.deckOrder.indexOf(touchDragId);
        const to   = S.deckOrder.indexOf(target.dataset.deckId);
        if (from !== -1 && to !== -1) { S.deckOrder.splice(from, 1); S.deckOrder.splice(to, 0, touchDragId); persist(); }
      }
    }
    container?.querySelectorAll('[data-deck-id],[data-folder-id]').forEach(el => el.classList.remove('drag-over'));
    touchDragId = null; touchDragEl = null; touchDragType = null; touchStartY = 0;
    renderSidebar();
  }
 
  document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('sidebar-decks');
    if (!container) return;
    container.addEventListener('dragstart',  onDragStart);
    container.addEventListener('dragover',   onDragOver);
    container.addEventListener('dragleave',  onDragLeave);
    container.addEventListener('drop',       onDrop);
    container.addEventListener('dragend',    onDragEnd);
    container.addEventListener('touchstart', onTouchStart, { passive: false });
    container.addEventListener('touchmove',  onTouchMove,  { passive: false });
    container.addEventListener('touchend',   onTouchEnd);
  });
})();





// ─── HIGHLIGHT TO CARD ───────────────────────────────────────────────────────
(function() {
  const popup = document.getElementById('highlight-popup');
  let lastSelection = '';
 
  function showPopup(x, y, text) {
    lastSelection = text.trim();
    if (!lastSelection || lastSelection.length < 3) return;
    popup.style.left = Math.min(x, window.innerWidth - 240) + 'px';
    popup.style.top  = (y - 44) + 'px';
    popup.classList.add('show');
  }
 
  function hidePopup() {
    popup.classList.remove('show');
    lastSelection = '';
  }
 
  // Desktop: mouseup is reliable
  document.addEventListener('mouseup', e => {
    if (popup.contains(e.target as Node)) return;
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    const inNotes = document.getElementById('panel-notes')?.contains(e.target as Node);
    if (inNotes && text.length >= 3) {
      const range = sel.getRangeAt(0);
      const rect  = range.getBoundingClientRect();
      showPopup(rect.left + rect.width / 2 - 80, rect.top + window.scrollY, text);
    } else {
      hidePopup();
    }
  });

  // Also hide on mousedown/touchstart if clicking outside and no selection
  document.addEventListener('pointerdown', e => {
    if (popup.contains(e.target as Node)) return;
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (text.length < 3) {
      hidePopup();
    }
  });
 
  // Mobile: use selectionchange instead of touchend.
  // touchend fires BEFORE the browser finalises the selection on iOS/Android,
  // so getSelection().toString() returns '' or the wrong text.
  // selectionchange fires AFTER the selection is committed.
  let _selChangeTimer = null;
  document.addEventListener('selectionchange', () => {
    clearTimeout(_selChangeTimer);
    _selChangeTimer = setTimeout(() => {
      // Only run while the notes panel is active
      const notesPanel = document.getElementById('panel-notes');
      if (!notesPanel || !notesPanel.classList.contains('active')) {
        hidePopup();
        return;
      }
 
      const sel  = window.getSelection();
      const text = sel ? sel.toString().trim() : '';
 
      if (text.length >= 3) {
        try {
          const range = sel.getRangeAt(0);
          const rect  = range.getBoundingClientRect();
          // rect may be zero on some mobile browsers — fall back to viewport centre
          const x = rect.width > 0 ? rect.left + rect.width / 2 - 80 : window.innerWidth / 2 - 80;
          const y = rect.height > 0 ? rect.top + window.scrollY : 120;
          showPopup(x, y, text);
        } catch(_) { /* getRangeAt can throw if selection collapsed */ }
      } else {
        hidePopup();
      }
    }, 120); // 120ms lets iOS finish adjusting handles before we read
  });
 
  popup.addEventListener('click', () => {
    if (!lastSelection) return;
    // Pre-fill the card editor with selected text
    // Navigate to Manage panel and fill the question field
    const manageBtn = document.querySelector('.nav-item[data-panel="manage"]');
    if (manageBtn) showPanel('manage', manageBtn);
    // If a deck is selected, fill the form; otherwise prompt to select one
    const nqEl = document.getElementById('nq');
    const naEl = document.getElementById('na');
    if (!S.selDeck) {
      toast('Select a deck first, then highlight text to make a card.');
      hidePopup();
      return;
    }
    if (nqEl) {
      // If question is empty, put text there; otherwise put in answer
      if (!nqEl.value.trim()) {
        nqEl.value = lastSelection;
        nqEl.focus();
        toast('✓ Text pasted as question — add an answer and click Add Card');
      } else {
        if (naEl) { naEl.value = lastSelection; naEl.focus(); }
        toast('✓ Text pasted as answer — click Add Card to save');
      }
    }
    window.getSelection()?.removeAllRanges();
    hidePopup();
  });
 
  // Hide on scroll or escape
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hidePopup(); });
  document.addEventListener('scroll',  hidePopup, true);
})();
 
const XP_PER_CARD = 10;
const XP_LEVEL_BASE = 100; // XP needed for level 1; doubles each level
 
async function getActivityData() {
  try { return (await localforage.getItem('ftp-activity')) || {}; }
  catch(_) {
    try { return JSON.parse(localStorage.getItem('ftp-activity') || '{}'); }
    catch(_) { return {}; }
  }
}
 
async function computeStreak(localActivity) {
  const days = Object.keys(localActivity).filter(k => localActivity[k] > 0).sort().reverse(); // newest first
  if (!days.length) return 0;
  
  const today = getLocalTodayString();
  const yesterday = subtractDays(today, 1);
  
  // Streak must include today or yesterday (still valid today)
  if (days[0] !== today && days[0] !== yesterday) return 0;
  
  let streak = 0;
  let check = days[0] === today ? today : yesterday;
  for (let i = 0; i < 365; i++) {
    if (localActivity[check] > 0) {
      streak++;
      check = subtractDays(check, 1);
    } else {
      break;
    }
  }
  return streak;
}
 
function xpForLevel(level) {
  // 100, 200, 400, 800 … (doubles each level)
  return XP_LEVEL_BASE * Math.pow(2, level - 1);
}
 
function computeLevel(totalXP) {
  let level = 1, remaining = totalXP;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, xpInLevel: remaining, xpNeeded: xpForLevel(level) };
}
 
async function updateStreakUI() {
  const rawActivity = await getActivityData();
  const detailed = getLocalDetailedActivity(rawActivity, getUserTimeZone());
  const localActivity = (await getLocalActivityData()) as any;
  const streak   = (await computeStreak(localActivity)) as number;
  
  let totalXP = 0;
  for (const stats of Object.values(detailed)) {
    totalXP += (stats.correct * XP_PER_CARD) + (stats.incorrect * 2);
  }
  const { level, xpInLevel, xpNeeded } = computeLevel(totalXP);
  const pct = Math.round((xpInLevel / xpNeeded) * 100);
 
  const bar = document.getElementById('streak-bar');
  if (!bar) return;
 
  bar.style.display = 'flex';
  const streakEl = document.getElementById('streak-count');
  const flameEl  = document.getElementById('streak-flame');
  const fillEl   = document.getElementById('xp-bar-fill');
  const trackEl  = document.querySelector('.xp-bar-track');
  const labelEl  = document.getElementById('xp-label');
  const nextEl   = document.getElementById('xp-next-label');
 
  // Detect level-up by comparing old label
  const prevLabel = labelEl?.textContent || '';
  const prevLevel = parseInt(prevLabel.match(/Lv (\d+)/)?.[1] || '0');
 
  if (streakEl) streakEl.textContent = String(streak);
  if (flameEl) {
    if (streak >= 7) {
      flameEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:var(--red);animation:bounce 1.s infinite"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/></svg>`;
    } else if (streak >= 3) {
      flameEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:var(--accent)"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
    } else if (streak >= 1) {
      flameEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:var(--yellow)"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
    } else {
      flameEl.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;color:var(--text3)"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }
  }
  if (fillEl)   fillEl.style.width   = pct + '%';
  if (labelEl)  labelEl.textContent  = totalXP > 0 ? `Lv ${level}  ·  ${totalXP} XP` : '0 XP — start studying!';
  if (nextEl)   nextEl.textContent   = `${xpInLevel}/${xpNeeded}`;
 
  // Streak flame bounce when streak changes
  if (flameEl && streak > 0) {
    flameEl.classList.remove('bounce');
    flameEl.offsetHeight;
    flameEl.classList.add('bounce');
    flameEl.addEventListener('animationend', () => flameEl.classList.remove('bounce'), { once: true });
  }
 
  // XP bar pulse + level-up flash
  if (fillEl) {
    const progFill = document.querySelector('.prog-fill');
    if (progFill) {
      progFill.classList.remove('pulse');
      progFill.offsetHeight;
      progFill.classList.add('pulse');
      progFill.addEventListener('animationend', () => progFill.classList.remove('pulse'), { once: true });
    }
    if (prevLevel > 0 && level > prevLevel && trackEl) {
      trackEl.classList.remove('leveled');
      trackEl.offsetHeight;
      trackEl.classList.add('leveled');
      trackEl.addEventListener('animationend', () => trackEl.classList.remove('leveled'), { once: true });
      toast(`Level up! You're now Level ${level}`);
    }
  }
}
 
function toggleXPInfo() {
  const card = document.getElementById('xp-info-card');
  if (card) card.style.display = card.style.display === 'none' ? 'block' : 'none';
}


// ─── DYNAMIC VIEWPORT-AWARE TOOLTIP SYSTEM ────────────────────────────────────
let globalTooltip: HTMLDivElement | null = null;

function getOrCreateGlobalTooltip(): HTMLDivElement {
  if (!globalTooltip) {
    globalTooltip = document.createElement('div');
    globalTooltip.id = 'app-global-tooltip';
    globalTooltip.style.position = 'fixed';
    globalTooltip.style.pointerEvents = 'none';
    globalTooltip.style.opacity = '0';
    globalTooltip.style.visibility = 'hidden';
    globalTooltip.style.zIndex = '99999';
    globalTooltip.style.background = 'var(--surface2)';
    globalTooltip.style.border = '1px solid var(--border)';
    globalTooltip.style.color = 'var(--text)';
    globalTooltip.style.padding = '8px 12px';
    globalTooltip.style.borderRadius = '8px';
    globalTooltip.style.fontSize = '12px';
    globalTooltip.style.boxShadow = '0 6px 20px rgba(0,0,0,0.45)';
    globalTooltip.style.transition = 'opacity 0.15s ease, transform 0.15s ease, visibility 0.15s';
    globalTooltip.style.fontFamily = 'inherit';
    globalTooltip.style.lineHeight = '1.4';
    globalTooltip.style.transform = 'translateY(8px) scale(0.96)';
    document.body.appendChild(globalTooltip);
  }
  return globalTooltip;
}

function showTooltip(html: string, e: MouseEvent) {
  const tooltip = getOrCreateGlobalTooltip();
  tooltip.innerHTML = html;
  tooltip.style.visibility = 'visible';
  tooltip.style.opacity = '1';
  tooltip.style.transform = 'translateY(0) scale(1)';
  positionTooltip(e);
}

function positionTooltip(e: MouseEvent) {
  const tooltip = getOrCreateGlobalTooltip();
  const tooltipRect = tooltip.getBoundingClientRect();
  const gap = 14;
  
  // Center horizontally relative to mouse cursor
  let left = e.clientX - tooltipRect.width / 2;
  let top = e.clientY - tooltipRect.height - gap;
  
  // Boundary constraints (viewport-aware)
  const margin = 12;
  if (left < margin) {
    left = margin;
  } else if (left + tooltipRect.width > window.innerWidth - margin) {
    left = window.innerWidth - tooltipRect.width - margin;
  }
  
  if (top < margin) {
    // Re-position below cursor if clipping at top of viewport
    top = e.clientY + gap;
  }
  
  tooltip.style.left = left + 'px';
  tooltip.style.top = top + 'px';
}

function hideTooltip() {
  if (globalTooltip) {
    globalTooltip.style.opacity = '0';
    globalTooltip.style.visibility = 'hidden';
    globalTooltip.style.transform = 'translateY(6px) scale(0.96)';
  }
}

// Bind event listeners globally for elements with hover-triggered dynamic content
document.addEventListener('mouseover', (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target) return;

  // 1. Calendar Day Cells
  const dayCell = target.closest('.calendar-day-cell');
  if (dayCell) {
    const tooltipEl = dayCell.querySelector('.cell-tooltip');
    if (tooltipEl) {
      showTooltip(tooltipEl.innerHTML, e);
      return;
    }
  }

  // 2. Achievement Badges
  const badge = target.closest('.achievement-badge');
  if (badge) {
    const titleEl = badge.querySelector('.achievement-name');
    const descEl = badge.querySelector('.achievement-desc');
    const title = titleEl ? titleEl.textContent || '' : '';
    const desc = descEl ? descEl.textContent || '' : '';
    const isUnlocked = badge.classList.contains('unlocked');
    
    let rarity = 'Common';
    if (badge.classList.contains('rare')) rarity = 'Rare';
    if (badge.classList.contains('epic')) rarity = 'Epic';
    if (badge.classList.contains('legendary')) rarity = 'Legendary';
    
    const statusColor = isUnlocked ? '#2ed573' : 'var(--text3)';
    const rarityColor = rarity === 'Legendary' ? '#eab308' : rarity === 'Epic' ? '#a855f7' : rarity === 'Rare' ? '#3b82f6' : '#9ca3af';

    const html = `
      <div style="font-weight:700; color:${rarityColor}; margin-bottom:4px; font-size:12.5px; display:flex; align-items:center; gap:6px;">
        <span>${isUnlocked ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;color:#eab308;display:inline-block;vertical-align:middle"><path d="M2 4l3 12h14l3-12-6 7-4-7-4 7-6-7z"/><rect x="3" y="20" width="18" height="2" rx="1"/></svg>` : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px;color:var(--text3);display:inline-block;vertical-align:middle"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`}</span>
        <span>${escH(title)}</span>
        <span style="font-size:8.5px; background:rgba(255,255,255,0.08); padding:1.5px 5px; border-radius:10px; color:${rarityColor}; text-transform:uppercase; font-weight:800;">${rarity}</span>
      </div>
      <div style="color:var(--text2); margin-bottom:6px; max-width:230px; font-size:11px; line-height:1.35;">${escH(desc)}</div>
      <div style="font-size:10px; color:var(--text3); display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border); padding-top:5px; margin-top:2px;">
        <span>Status: <strong style="color:${statusColor}">${isUnlocked ? 'Unlocked' : 'Locked'}</strong></span>
        <span>${isUnlocked ? '✓ Active' : 'Progressing'}</span>
      </div>
    `;

    if (badge.hasAttribute('title')) {
      badge.setAttribute('data-original-title', badge.getAttribute('title') || '');
      badge.removeAttribute('title');
    }

    showTooltip(html, e);
    return;
  }

  // 3. SVG Charts Dot/Bar Hover Tooltips
  const chartEl = target.closest('.chart-dot, .chart-bar');
  if (chartEl) {
    const titleEl = chartEl.querySelector('title');
    if (titleEl) {
      const text = titleEl.textContent || '';
      if (text) {
        chartEl.setAttribute('data-original-title', text);
        titleEl.textContent = '';
      }
    }
    const origTitle = chartEl.getAttribute('data-original-title');
    if (origTitle) {
      const html = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:600; color:var(--text); font-size:11.5px;">
          <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:var(--accent);"></span>
          <span>${escH(origTitle)}</span>
        </div>
      `;
      showTooltip(html, e);
      return;
    }
  }

  // 4. Multi-prog (Mastered vs Learning progress bar)
  const multiProg = target.closest('.multi-prog');
  if (multiProg) {
    if (multiProg.hasAttribute('title')) {
      multiProg.setAttribute('data-original-title', multiProg.getAttribute('title') || '');
      multiProg.removeAttribute('title');
    }
    const origTitle = multiProg.getAttribute('data-original-title');
    if (origTitle) {
      const html = `
        <div style="display:flex; align-items:center; gap:6px; font-weight:600; color:var(--text); font-size:11.5px;">
          <span style="display:inline-block; width:7px; height:7px; border-radius:50%; background:#2ed573;"></span>
          <span>${escH(origTitle)}</span>
        </div>
      `;
      showTooltip(html, e);
      return;
    }
  }
});

document.addEventListener('mousemove', (e: MouseEvent) => {
  if (globalTooltip && globalTooltip.style.opacity === '1') {
    positionTooltip(e);
  }
});

document.addEventListener('mouseout', (e: MouseEvent) => {
  const target = e.target as HTMLElement;
  if (!target) return;

  const leavingBadge = target.closest('.achievement-badge');
  if (leavingBadge) {
    const orig = leavingBadge.getAttribute('data-original-title');
    if (orig) leavingBadge.setAttribute('title', orig);
  }

  const leavingChart = target.closest('.chart-dot, .chart-bar');
  if (leavingChart) {
    const orig = leavingChart.getAttribute('data-original-title');
    const titleEl = leavingChart.querySelector('title');
    if (orig && titleEl) titleEl.textContent = orig;
  }

  const leavingMultiProg = target.closest('.multi-prog');
  if (leavingMultiProg) {
    const orig = leavingMultiProg.getAttribute('data-original-title');
    if (orig) leavingMultiProg.setAttribute('title', orig);
  }

  const related = e.relatedTarget as HTMLElement;
  if (!related || (
    !related.closest('.calendar-day-cell') && 
    !related.closest('.achievement-badge') && 
    !related.closest('.chart-dot, .chart-bar') &&
    !related.closest('.multi-prog')
  )) {
    hideTooltip();
  }
});

function askAIChatAboutCard(q: string, a: string) {
  const promptText = `Can you suggest a creative, easy-to-remember mnemonic or a simple explanation for this flashcard?\n\nQuestion: ${q}\nAnswer: ${a}`;
  const input = document.getElementById('chat-input') as HTMLInputElement;
  if (input) {
    input.value = promptText;
  }
  if (typeof (window as any).showPanel === 'function') {
    (window as any).showPanel('chat');
  }
  setTimeout(() => {
    if (input) {
      input.focus();
    }
  }, 120);
}


// ─── ES module exports (auto-generated) ───
export { XP_LEVEL_BASE, XP_PER_CARD, askAIChatAboutCard, computeLevel, computeLongestStreak, computeStreak, currentStatsMonth, currentStatsYear, deckSortBy, draw30DayMomentumChart, drawAccuracyTrendChart, drawWeeklyReviewsChart, drawWeeklyTimeChart, getActivityData, getLocalActivityData, getLocalDetailedActivity, getOrCreateGlobalTooltip, globalTooltip, hideTooltip, injectStyles, positionTooltip, renderDayDetails, renderStats, selectedDayKey, showTooltip, toggleXPInfo, updateStreakUI, xpForLevel };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { askAIChatAboutCard, computeLevel, computeLongestStreak, computeStreak, draw30DayMomentumChart, drawAccuracyTrendChart, drawWeeklyReviewsChart, drawWeeklyTimeChart, getActivityData, getLocalActivityData, getLocalDetailedActivity, getOrCreateGlobalTooltip, hideTooltip, positionTooltip, renderDayDetails, renderStats, showTooltip, toggleXPInfo, updateStreakUI, xpForLevel });
