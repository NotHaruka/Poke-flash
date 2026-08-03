import { GAMES, triggerGameAction } from './games.js';
import { showPanel } from './sidebar.js';
import { toast } from './utils.js';

// Panel keywords -> real panel id + name shown in a match confirmation.
// Multiple keywords per panel so people can phrase it a few natural ways.
const PANEL_ALIASES: { keywords: string[]; id: string; label: string }[] = [
  { keywords: ['home', 'dashboard', 'study dashboard'], id: 'home', label: 'Study Dashboard' },
  { keywords: ['study', 'flashcards', 'review', 'due cards'], id: 'study', label: 'Study' },
  { keywords: ['library', 'deck library', 'decks'], id: 'library', label: 'Deck Library' },
  { keywords: ['notes'], id: 'notes', label: 'Notes' },
  { keywords: ['stats', 'statistics'], id: 'stats', label: 'Statistics' },
  { keywords: ['chat', 'assistant', 'ai assistant', 'ai'], id: 'chat', label: 'AI Assistant' },
  { keywords: ['games', 'arcade', 'flash games', 'games lounge'], id: 'flash-games', label: 'Flash Games Lounge' },
  { keywords: ['settings'], id: 'settings', label: 'Settings' },
];

let voiceCmdRecognition: any = null;
let isVoiceCmdListening = false;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, '').trim();
}

// Strips a leading wake phrase like "hey trainer" if present. Since the mic is
// already tap-to-start, the wake phrase is optional - "start tetris" alone
// works fine too, this just also accepts "hey trainer start tetris".
function stripWakePhrase(text: string): string {
  const wakePatterns = [/^hey\s+trainer[,]?\s*/i, /^ok\s+trainer[,]?\s*/i, /^okay\s+trainer[,]?\s*/i, /^trainer[,]?\s*/i];
  for (const pattern of wakePatterns) {
    if (pattern.test(text)) return text.replace(pattern, '').trim();
  }
  return text;
}

function updateVoiceCmdPopup(status: string, transcript: string) {
  const statusEl = document.getElementById('voice-cmd-status');
  const transcriptEl = document.getElementById('voice-cmd-transcript');
  if (statusEl) statusEl.textContent = status;
  if (transcriptEl) transcriptEl.textContent = transcript;
}

function showVoiceCmdPopup() {
  document.getElementById('voice-cmd-popup')?.classList.remove('hidden');
}

function hideVoiceCmdPopup() {
  document.getElementById('voice-cmd-popup')?.classList.add('hidden');
}

// Attempts to match a command against panels first, then games. Pure string
// matching against real app data - no AI call involved.
function routeVoiceCommand(rawText: string) {
  const command = normalize(stripWakePhrase(rawText));
  if (!command) {
    updateVoiceCmdPopup('Didn\'t catch that', 'Try again, e.g. "go to notes" or "start tetris"');
    return;
  }

  // 1. Try to match a panel: "go to X" / "open X" / "show X" / or just "X"
  const panelQuery = command.replace(/^(go to|open|show( me)?|navigate to)\s+/i, '').trim();
  for (const panel of PANEL_ALIASES) {
    if (panel.keywords.some(k => panelQuery === k || panelQuery.includes(k))) {
      updateVoiceCmdPopup('Opening…', panel.label);
      showPanel(panel.id, null);
      setTimeout(hideVoiceCmdPopup, 900);
      return;
    }
  }

  // 2. Try to match a game: "start X" / "play X" / "launch X" / "open X"
  const gameQuery = command.replace(/^(start|play|launch|open|begin)\s+/i, '').trim();
  if (gameQuery) {
    const games = GAMES as { id: string; title: string }[];
    // Prefer an exact title match, fall back to substring match either direction
    let match = games.find(g => normalize(g.title) === gameQuery);
    if (!match) match = games.find(g => normalize(g.title).includes(gameQuery) || gameQuery.includes(normalize(g.title)));
    if (match) {
      updateVoiceCmdPopup('Launching…', match.title);
      triggerGameAction(match.id);
      setTimeout(hideVoiceCmdPopup, 900);
      return;
    }
  }

  // 3. Nothing matched - tell the person what was actually heard rather than
  //    silently doing nothing.
  updateVoiceCmdPopup('No matching panel or game', `Heard: "${rawText}"`);
  toast(`Voice command not recognized: "${rawText}"`);
}

function toggleVoiceCommand() {
  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    toast('Voice commands aren\'t supported in this browser.');
    return;
  }

  const fab = document.getElementById('voice-cmd-fab');

  if (isVoiceCmdListening) {
    voiceCmdRecognition?.stop();
    return;
  }

  voiceCmdRecognition = new SpeechRecognitionCtor();
  voiceCmdRecognition.lang = navigator.language || 'en-US';
  voiceCmdRecognition.interimResults = true;
  voiceCmdRecognition.continuous = false;

  voiceCmdRecognition.onstart = () => {
    isVoiceCmdListening = true;
    fab?.classList.add('voice-cmd-fab-listening');
    showVoiceCmdPopup();
    updateVoiceCmdPopup('Listening…', 'Say a command, like "Hey Trainer, go to Notes"');
  };

  voiceCmdRecognition.onresult = (event: any) => {
    let transcript = '';
    let isFinal = false;
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
      if (event.results[i].isFinal) isFinal = true;
    }
    updateVoiceCmdPopup('Listening…', transcript);
    if (isFinal) routeVoiceCommand(transcript);
  };

  voiceCmdRecognition.onerror = (event: any) => {
    if (event.error !== 'no-speech' && event.error !== 'aborted') {
      toast('Voice command error: ' + event.error);
      hideVoiceCmdPopup();
    }
  };

  voiceCmdRecognition.onend = () => {
    isVoiceCmdListening = false;
    fab?.classList.remove('voice-cmd-fab-listening');
  };

  try {
    voiceCmdRecognition.start();
  } catch (err) {
    toast('Could not start voice command listening.');
  }
}

Object.assign(window, { toggleVoiceCommand });

export { toggleVoiceCommand, routeVoiceCommand };