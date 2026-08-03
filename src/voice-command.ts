import { GAMES, triggerGameAction } from './games.js';
import { showPanel } from './sidebar.js';
import { toast } from './utils.js';

// Expanded panel aliases for high accuracy matching
const PANEL_ALIASES: { keywords: string[]; id: string; label: string }[] = [
  { keywords: ['home', 'dashboard', 'study dashboard', 'main', 'welcome'], id: 'home', label: 'Study Dashboard' },
  { keywords: ['study', 'flashcards', 'flashcard', 'review', 'due', 'due cards', 'practice', 'quiz', 'cards'], id: 'study', label: 'Study' },
  { keywords: ['library', 'deck library', 'decks', 'deck', 'my decks', 'deck list'], id: 'library', label: 'Deck Library' },
  { keywords: ['manage', 'edit deck', 'card editor', 'editor', 'edit cards'], id: 'manage', label: 'Deck Editor' },
  { keywords: ['notes', 'notebook', 'notepad', 'note'], id: 'notes', label: 'Notes' },
  { keywords: ['stats', 'statistics', 'analytics', 'history', 'progress', 'charts', 'performance'], id: 'stats', label: 'Statistics' },
  { keywords: ['chat', 'assistant', 'ai assistant', 'ai', 'flash ai', 'ask ai', 'talk to ai'], id: 'chat', label: 'AI Assistant' },
  { keywords: ['games', 'arcade', 'flash games', 'games lounge', 'lounge', 'minigames', 'mini games', 'game lounge'], id: 'flash-games', label: 'Flash Games Lounge' },
  { keywords: ['settings', 'options', 'preferences', 'config', 'configuration'], id: 'settings', label: 'Settings' },
];

let voiceCmdRecognition: any = null;
let isVoiceCmdListening = false;
let lastTranscript = '';
let hasRoutedCurrentSession = false;

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, '').trim();
}

// Strips wake phrases (e.g. "hey trainer", "hey google", "ok google", "trainer")
function stripWakePhrase(text: string): string {
  const wakePatterns = [
    /^(hey|ok|okay)\s+(trainer|google|flash)\b/i,
    /^(trainer|google|flash)\b/i,
    /^(hey|ok|okay)\b/i
  ];
  let cleaned = text.trim();
  for (const pattern of wakePatterns) {
    cleaned = cleaned.replace(pattern, '').replace(/^[,.\s]+/, '').trim();
  }
  return cleaned || text;
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

function routeVoiceCommand(rawText: string) {
  if (hasRoutedCurrentSession) return;

  const stripped = stripWakePhrase(rawText);
  const command = normalize(stripped);

  if (!command) {
    updateVoiceCmdPopup("Didn't catch that", 'Try saying "Go to Statistics" or "Start Tetris"');
    return;
  }

  // 1. Clean action verbs ("go to", "open", "show me", "navigate to", "switch to", "play", "launch", "start")
  const cleanedQuery = command
    .replace(/^(go to|open|show me|show|navigate to|switch to|take me to|view|launch|play|start|run)\s+/i, '')
    .trim();

  // 2. Try panel match
  for (const panel of PANEL_ALIASES) {
    const isMatch = panel.keywords.some(k => 
      cleanedQuery === k || 
      command === k || 
      cleanedQuery.includes(k) || 
      command.includes(k)
    );
    if (isMatch) {
      hasRoutedCurrentSession = true;
      updateVoiceCmdPopup('Opening…', panel.label);
      toast(`Opening ${panel.label}...`);
      showPanel(panel.id, null);
      setTimeout(hideVoiceCmdPopup, 1200);
      return;
    }
  }

  // 3. Try game match
  const games = (GAMES || []) as { id: string; title: string }[];
  if (games.length > 0) {
    let match = games.find(g => normalize(g.title) === cleanedQuery || normalize(g.id) === cleanedQuery);
    if (!match) {
      match = games.find(g => 
        normalize(g.title).includes(cleanedQuery) || 
        cleanedQuery.includes(normalize(g.title)) ||
        normalize(g.id).includes(cleanedQuery)
      );
    }
    if (match) {
      hasRoutedCurrentSession = true;
      updateVoiceCmdPopup('Launching…', match.title);
      toast(`Launching ${match.title}...`);
      triggerGameAction(match.id);
      setTimeout(hideVoiceCmdPopup, 1200);
      return;
    }
  }

  // 4. No match
  updateVoiceCmdPopup('Command not recognized', `Heard: "${rawText}"`);
  toast(`Voice command not recognized: "${rawText}"`);
  setTimeout(hideVoiceCmdPopup, 3000);
}

function toggleVoiceCommand() {
  const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SpeechRecognitionCtor) {
    toast("Voice commands aren't supported in this browser.");
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
    hasRoutedCurrentSession = false;
    lastTranscript = '';
    fab?.classList.add('voice-cmd-fab-listening');
    showVoiceCmdPopup();
    updateVoiceCmdPopup('Listening…', 'Say "Go to Statistics", "Open Notes", or "Play Snake"');
  };

  voiceCmdRecognition.onresult = (event: any) => {
    let transcript = '';
    let isFinal = false;
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
      if (event.results[i].isFinal) isFinal = true;
    }
    lastTranscript = transcript;
    updateVoiceCmdPopup('Listening…', transcript);

    if (isFinal && transcript.trim() && !hasRoutedCurrentSession) {
      routeVoiceCommand(transcript);
    }
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
    // If not routed during onresult, route last recorded transcript now
    if (!hasRoutedCurrentSession && lastTranscript.trim()) {
      routeVoiceCommand(lastTranscript);
    }
  };

  try {
    voiceCmdRecognition.start();
  } catch (err) {
    toast('Could not start voice command listening.');
  }
}

Object.assign(window, { toggleVoiceCommand, routeVoiceCommand });

export { toggleVoiceCommand, routeVoiceCommand };