import { openRouterGenerate } from './ai-provider.js';
import { renderCardsList } from './deck-manager.js';
import { app } from './firebase.js';
import { syncAddCardsBatch } from './firebase-sync.js';
import { S } from './main.js';
import { renderSidebar, updateStats } from './sidebar.js';
import { persist } from './storage.js';
import { notes } from './study.js';
import { escH, toast } from './utils.js';




interface ChatMessage {
  role: 'user' | 'ai';
  content: string;
  sources?: string[];
  timestamp: number;
}

interface ChatSession {
  id: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

// State
let currentSession: ChatSession | null = null;
let lastAIMessage: string = '';
let selectedDeckId: string = ''; // Empty string = all decks

// Initialize chat
function chatInit() {
  loadChatSession();
  populateDeckSelector();
  updateDeckStats();
  renderChatMessages();
  showWelcomeIfEmpty();
  
  // Handle Enter key
  const chatInput = document.getElementById('chat-input') as HTMLInputElement;
  if (chatInput) {
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendChatMessage();
      }
    });
  }

  // Handle clicking outside chat history and dropdowns
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const sidebar = document.getElementById('chat-history-sidebar');
    const btn = document.getElementById('btn-chat-history');
    if (sidebar && sidebar.style.display !== 'none') {
      if (!sidebar.contains(target) && btn && !btn.contains(target)) {
        // Also ensure we aren't clicking the delete button inside history, which might be detached
        if (!target.closest('.chat-history-del')) {
          toggleChatHistory();
        }
      }
    }

    // Close Deck Dropdown if clicking outside
    const deckSelectWrap = document.getElementById('chat-deck-select-wrap');
    if (deckSelectWrap && !deckSelectWrap.contains(target)) {
      const deckOptions = document.getElementById('chat-deck-options');
      if (deckOptions) deckOptions.style.display = 'none';
    }
    
    // Close Persona Dropdown if clicking outside
    const personaSelWrap = document.getElementById('chat-persona-sel-wrap');
    if (personaSelWrap && !personaSelWrap.contains(target)) {
      const personaOptions = document.getElementById('chat-persona-options');
      if (personaOptions) personaOptions.style.display = 'none';
    }
  });
}

// Populate deck selector dropdown
function populateDeckSelector() {
  const select = document.getElementById('chat-deck-select');
  const optionsWrap = document.getElementById('chat-deck-options');
  if (!select || !optionsWrap) return;

  const decks = S.decks ? Object.entries(S.decks) : [];
  
  let html = `<div class="option" onclick="selectMainChatDeck('', 'All decks')">All decks</div>`;
  
  decks.forEach(([id, deck]: any) => {
    html += `<div class="option" onclick="selectMainChatDeck('${id}', '${deck.name} (${(deck.cards || []).length} cards)')">${deck.name} (${(deck.cards || []).length} cards)</div>`;
  });
  optionsWrap.innerHTML = html;
}

// Create new session
function createNewSession(): ChatSession {
  return {
    id: `session-${Date.now()}`,
    messages: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

// Render an interactive card suggestion directly in the stream
function renderInteractiveSuggestedCard(q: string, a: string): string {
  const cleanQ = q.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/'/g, "&#39;").replace(/"/g, "&quot;");
  const cleanA = a.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/'/g, "&#39;").replace(/"/g, "&quot;");
  
  const widgetId = 'card-widget-' + Math.random().toString(36).substring(2, 9);
  
  return `<div class="chat-suggested-card" id="${widgetId}">
    <div class="csc-badge">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:11px;height:11px"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      <span>Suggested Flashcard</span>
    </div>
    <div class="csc-field">
      <span class="csc-label font-mono">FRONT</span>
      <span class="csc-text">${q}</span>
    </div>
    <div class="csc-divider"></div>
    <div class="csc-field">
      <span class="csc-label font-mono">BACK</span>
      <span class="csc-text">${a}</span>
    </div>
    <button class="csc-add-btn" onclick="window.addSingleSuggestedCard('${cleanQ}', '${cleanA}', '${widgetId}')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:12px;height:12px"><path d="M12 5v14M5 12h14"/></svg>
      <span>Add to Active Deck</span>
    </button>
  </div>`;
}

// Support card building via click
async function addSingleSuggestedCard(q: string, a: string, widgetId: string) {
  let deckId = selectedDeckId;
  if (!deckId) {
    const decks = S.decks ? Object.keys(S.decks) : [];
    if (decks.length > 0) {
      deckId = decks[0];
    } else {
      toast('[ERROR] Create a deck first in Manage Cards');
      return;
    }
  }
  
  const deck = S.decks[deckId];
  if (!deck) {
    toast('[ERROR] Active deck not found');
    return;
  }
  
  deck.cards = deck.cards || [];
  const newCard = {
    id: 'c_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 9),
    q: q,
    a: a,
    ease: 2.5,
    interval: 1,
    due: Date.now(),
    mistakes: 0,
    difficulty: 'none',
    createdAt: Date.now(),
  };
  
  deck.cards.push(newCard);
  
  // Save locally
  persist();
  if ((window as any).updateStats) (window as any).updateStats();
  if ((window as any).renderSidebar) (window as any).renderSidebar();
  if ((window as any).renderCardsList) (window as any).renderCardsList();
  updateDeckStats();
  
  // Cloud sync
  try {
    const { syncAddCardsBatch } = await import('./firebase-sync.js');
    syncAddCardsBatch(deckId, [newCard]).catch(err => console.warn('Card cloud sync failed:', err));
  } catch (e) {
    console.warn('Sync import failed:', e);
  }

  toast(`✓ Card added to "${deck.name}"!`);
  
  const widget = document.getElementById(widgetId);
  if (widget) {
    const btn = widget.querySelector('.csc-add-btn');
    if (btn) {
      btn.className = 'csc-add-btn added';
      btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:12px;height:12px;color:var(--sage)"><polyline points="20 6 9 17 4 12"/></svg> <span>Saved to ${deck.name}</span>`;
      (btn as HTMLButtonElement).disabled = true;
    }
    widget.classList.add('added-pulse');
  }
}
(window as any).addSingleSuggestedCard = addSingleSuggestedCard;

// Helper to copy code from block
function copyCode(btn: HTMLElement) {
  const codeEl = btn.closest('.chat-code-block')?.querySelector('code');
  if (codeEl) {
    navigator.clipboard.writeText(codeEl.textContent || '');
    const originalText = btn.textContent || 'Copy';
    btn.textContent = 'Copied!';
    btn.style.color = 'var(--sage)';
    setTimeout(() => {
      btn.textContent = originalText;
      btn.style.color = '';
    }, 1500);
  }
}
(window as any).copyCode = copyCode;

// Cognitive mode selector updater
function selectPersonaV2(value: string, displayName: string) {
  const selectedEl = document.getElementById('chat-persona-sel');
  if (selectedEl) {
    selectedEl.textContent = displayName;
    selectedEl.dataset.value = value;
  }
  
  // Close the dropdown
  const options = document.getElementById('chat-persona-options');
  if (options) {
    options.style.display = 'none';
  }
  
  updateDeckStats();
  toast(`✓ Persona: ${displayName}`);
}
(window as any).selectPersonaV2 = selectPersonaV2;

function toggleMainChatPersonaDropdown() {
  const options = document.getElementById('chat-persona-options');
  if (options) {
    options.style.display = options.style.display === 'none' ? 'block' : 'none';
  }
}
(window as any).toggleMainChatPersonaDropdown = toggleMainChatPersonaDropdown;

// Format markdown to HTML (premium parsing support)
function formatMarkdown(text: string): string {
  // Escape HTML first (except keeping certain code tag placeholders later)
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  
  // Code block: ```lang ... ```
  text = text.replace(/```([a-zA-Z0-9#\+]+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    const displayLang = lang ? lang.toUpperCase() : 'CODE';
    return `<div class="chat-code-block">
      <div class="chat-code-header">
        <span class="cc-lang font-mono">${displayLang}</span>
        <button class="chat-code-copy" onclick="window.copyCode(this)">Copy</button>
      </div>
      <pre><code class="font-mono">${code.trim()}</code></pre>
    </div>`;
  });

  // Inline Code: `text`
  text = text.replace(/`([^`]+)`/g, '<code class="chat-inline-code">$1</code>');

  // Bold: **text** or ***text***
  text = text.replace(/\*{2,3}([^\*]+)\*{2,3}/g, '<strong>$1</strong>');
  
  // Italic: *text*
  text = text.replace(/\*([^\*]+)\*/g, '<em>$1</em>');
  
  // Headings: ### text, ## text, # text
  text = text.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>');
  text = text.replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>');
  text = text.replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>');
  
  // Split lines to handle bullet lists, numbered lists, and interactive cards
  const lines = text.split('\n');
  let inUl = false;
  let inOl = false;
  let result: string[] = [];

  for (let line of lines) {
    const trimmed = line.trim();
    
    // 1. Bullet list items
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      if (inOl) { result.push('</ol>'); inOl = false; }
      if (!inUl) { result.push('<ul class="chat-ul">'); inUl = true; }
      result.push(`<li>${trimmed.slice(2)}</li>`);
    }
    // 2. Numbered list items
    else if (/^\d+\.\s+/.test(trimmed)) {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (!inOl) { result.push('<ol class="chat-ol">'); inOl = true; }
      const itemText = trimmed.replace(/^\d+\.\s+/, '');
      result.push(`<li>${itemText}</li>`);
    }
    // 3. Blockquotes
    else if (trimmed.startsWith('&gt; ') || trimmed.startsWith('> ')) {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      const quoteText = trimmed.startsWith('&gt; ') ? trimmed.slice(5) : trimmed.slice(2);
      result.push(`<blockquote class="chat-quote">${quoteText}</blockquote>`);
    }
    // 4. Default plain paragraph lines or interactive suggested flashcards
    else {
      if (inUl) { result.push('</ul>'); inUl = false; }
      if (inOl) { result.push('</ol>'); inOl = false; }
      
      // Card generator pattern: Q: Front → A: Back
      const cardRegex = /(?:Q:|Question:)\s*([\s\S]+?)\s*(?:→|-&gt;|A:|Answer:)\s*([\s\S]+)/i;
      const cardMatch = trimmed.match(cardRegex);
      if (cardMatch && !trimmed.includes('```') && !trimmed.includes('<code')) {
        const q = cardMatch[1].trim();
        const a = cardMatch[2].trim();
        result.push(renderInteractiveSuggestedCard(q, a));
      } else {
        result.push(line);
      }
    }
  }

  if (inUl) result.push('</ul>');
  if (inOl) result.push('</ol>');

  text = result.join('\n');
  
  // Replace line breaks securely
  text = text.replace(/\n/g, '<br>');
  text = text.replace(/<br>\s*<(ul|ol|li|div|h1|h2|h3|blockquote|pre)/g, '<$1');
  text = text.replace(/<\/(ul|ol|li|div|h1|h2|h3|blockquote|pre)>\s*<br>/g, '</$1>');

  return text;
}

// Render chat messages
function renderChatMessages() {
  const container = document.getElementById('chat-messages');
  if (!container || !currentSession) return;

  container.innerHTML = '';
  showWelcomeIfEmpty();

  if (currentSession.messages.length === 0) {
    return;
  }

  currentSession.messages.forEach((msg, idx) => {
    const msgRow = document.createElement('div');
    msgRow.className = `chat-message-row ${msg.role}`;

    // Avatar layout
    const avatarEl = document.createElement('div');
    avatarEl.className = `chat-message-avatar ${msg.role}`;
    if (msg.role === 'ai') {
      avatarEl.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ai-orbit-svg">
          <polygon points="12 2 22 8.5 22 19.5 12 24 2 19.5 2 8.5" />
          <circle cx="12" cy="13" r="3.5" fill="var(--accent)" class="core-dot" />
        </svg>
      `;
    } else {
      avatarEl.textContent = 'U';
    }
    msgRow.appendChild(avatarEl);

    // Bubble structure
    const bubbleWrapper = document.createElement('div');
    bubbleWrapper.className = 'chat-bubble-wrapper';

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'chat-msg-bubble';
    bubbleEl.innerHTML = formatMarkdown(msg.content);
    bubbleWrapper.appendChild(bubbleEl);

    // Metadata & controls
    if (msg.role === 'ai') {
      const metaEl = document.createElement('div');
      metaEl.className = 'chat-msg-meta';
      
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      metaEl.innerHTML = `<span class="cmm-time">${time}</span>`;
      
      if (msg.sources && msg.sources.length > 0) {
        msg.sources.forEach(src => {
          metaEl.innerHTML += `<span class="chat-msg-source">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:9px;height:9px;margin-right:4px;display:inline-block"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>${src}
          </span>`;
        });
      }
      
      // Control buttons (Copy & Note save)
      metaEl.innerHTML += `
        <div class="cmm-actions">
          <span class="chat-msg-action" onclick="copyMessage(${idx})" title="Copy Response">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:12px;height:12px"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </span>
          <span class="chat-msg-action" onclick="bookmarkMessage(${idx})" title="Save reference to notes">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="width:12px;height:12px"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </span>
        </div>
      `;
      bubbleWrapper.appendChild(metaEl);
    } else {
      const timeEl = document.createElement('div');
      timeEl.className = 'chat-msg-time';
      const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      timeEl.textContent = time;
      bubbleWrapper.appendChild(timeEl);
    }

    msgRow.appendChild(bubbleWrapper);
    container.appendChild(msgRow);
  });

  // Auto-scroll to bottom
  container.scrollTop = container.scrollHeight;
}

// Build deck context for AI
function buildDeckContext(): string {
  let decks: any[] = [];

  if (selectedDeckId) {
    // Single deck selected
    const deck = S.decks?.[selectedDeckId];
    if (deck) decks = [[selectedDeckId, deck]];
  } else {
    // All decks
    decks = S.decks ? Object.entries(S.decks) : [];
  }

  if (decks.length === 0) return 'No decks available.';

  const context = decks
    .map(([id, deck]: any) => {
      const cards = deck.cards || [];
      const cardSummary = cards
        .slice(0, 5)
        .map((c: any) => `Q: ${c.q} → A: ${c.a}`)
        .join('\n');

      return `Deck: "${deck.name}" (${cards.length} cards)\n${cardSummary}${cards.length > 5 ? '\n...' : ''}`;
    })
    .join('\n\n');

  return context;
}

// Send chat message
async function sendChatMessage() {
  const input = document.getElementById('chat-input') as HTMLInputElement;
  if (!input || !input.value.trim() || !currentSession) return;

  const userMessage = input.value.trim();
  input.value = '';

  // Add user message
  currentSession.messages.push({
    role: 'user',
    content: userMessage,
    timestamp: Date.now(),
  });

  renderChatMessages();

  // Check if OpenRouter key is set
  if (!S.openrouterKey) {
    toast('[ERROR] Add OpenRouter key in Manage Cards first');
    currentSession.messages.pop(); // Remove user message
    renderChatMessages();
    return;
  }

  // Build prompt with deck context
  const deckContext = buildDeckContext();
  let systemPrompt = `You are a study assistant inside FlashTrainer Pro. You help users understand, retain, and apply the material in their flashcard decks.

The user's current decks:
${deckContext}

Ground your responses in the user's actual deck content whenever possible. When giving explanations, draw on their cards as reference points rather than introducing outside material unnecessarily. If you suggest new cards, format each one as "Q: [question] → A: [answer]".

Be concise and direct. Skip meta-commentary about what you're about to do — just do it.`;

  const personaSel = document.getElementById('chat-persona-sel');
  const persona = personaSel ? (personaSel as HTMLElement).dataset.value : 'default';

  if (persona === 'socratic') {
    systemPrompt += `\n\nPersona: Socratic Tutor — forces active recall instead of passive reading.
Never give the answer directly. Ask the user a question that leads them toward it. Only confirm or correct after they attempt a response.`;
  } else if (persona === 'feynman') {
    systemPrompt += `\n\nPersona: Feynman Checker — tests real understanding.
Ask the user to explain a concept from their deck in their own words, as if teaching it to someone unfamiliar. Point out gaps or misconceptions in their explanation.`;
  } else if (persona === 'exam') {
    systemPrompt += `\n\nPersona: Exam Simulator — high-pressure practice.
Quiz the user on their deck material. Ask one question at a time, wait for their answer, then score it and explain any mistakes before moving to the next.`;
  }

  const devModeToggle = document.getElementById('chat-dev-mode-toggle') as HTMLInputElement | null;
  if (devModeToggle && devModeToggle.checked) {
    systemPrompt = `You are a live-coding assistant embedded in FlashTrainer Pro with Dev Mode enabled.

You can make live changes to the app by outputting fenced code blocks:
- \`\`\`javascript blocks are executed directly in the browser
- \`\`\`css blocks are injected as a <style> tag into the document

The app exposes a global state object \`S\` and uses standard DOM APIs (\`document.getElementById\`, \`querySelector\`, etc.). There is no module system — all code must be plain, browser-executable JavaScript.

When making changes, keep them minimal and scoped to what was asked. Avoid touching unrelated state or styles. If a request is ambiguous, ask a single clarifying question before writing any code. Otherwise, respond with code only — no explanatory prose unless something is blocking you.`;
  }

  const fullPrompt = `${systemPrompt}\n\nUser message:\n${userMessage}`;

  // Show loading state
  const sendBtn = document.getElementById('chat-send-btn') as HTMLButtonElement;
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.classList.add('loading');
    sendBtn.innerHTML = `<svg class="animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px;height:14px"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-dasharray="32" stroke-dashoffset="16" fill="none"/></svg>`;
  }
  if (input) input.disabled = true;

  // Show typing indicator
  const typingId = `typing-${Date.now()}`;
  const container = document.getElementById('chat-messages');
  if (container) {
    const typingEl = document.createElement('div');
    typingEl.id = typingId;
    typingEl.className = 'chat-msg ai typing-indicator-row';
    
    let loadingText = 'Analyzing decks...';
    if (persona === 'socratic') loadingText = 'Formulating Socratic questions...';
    else if (persona === 'feynman') loadingText = 'Preparing Feynman diagnostics...';
    else if (persona === 'exam') loadingText = 'Assembling practice questions...';

    typingEl.innerHTML = `
      <div class="chat-message-avatar ai">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="ai-orbit-svg pulsing">
          <polygon points="12 2 22 8.5 22 19.5 12 24 2 19.5 2 8.5" />
          <circle cx="12" cy="13" r="3.5" fill="var(--accent)" class="core-dot" />
        </svg>
      </div>
      <div class="chat-bubble-wrapper">
        <div class="chat-msg-bubble thinking-bubble">
          <div class="thinking-loading-wrapper">
            <div class="thinking-spinner">
              <div class="double-bounce1"></div>
              <div class="double-bounce2"></div>
            </div>
            <span class="thinking-text">${loadingText}</span>
          </div>
        </div>
      </div>
    `;
    container.appendChild(typingEl);
    container.scrollTop = container.scrollHeight;
  }

  try {
    const response = await openRouterGenerate(fullPrompt, 500);
    lastAIMessage = response;

    // Remove typing indicator
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();
    
    const devModeToggle = document.getElementById('chat-dev-mode-toggle') as HTMLInputElement | null;
    if (devModeToggle && devModeToggle.checked) {
      const hasJs = response.match(/```(?:javascript|js)\n([\s\S]*?)```/);
      const hasCss = response.match(/```css\n([\s\S]*?)```/);
      
      if (hasJs || hasCss) {
        // Save S state & HTML safely before executing code!
        let S_backup = '';
        try {
          const seen = new WeakSet();
          S_backup = JSON.stringify(S, (key, value) => {
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) return;
              seen.add(value);
            }
            return value;
          });
        } catch (e) {
          console.warn('[DEV] Circular structure in S detected during backup, fallback to shallow clone:', e);
          try {
            S_backup = JSON.stringify({ ...S });
          } catch (_) {}
        }
        const html_backup = document.getElementById('app-container')?.innerHTML || '';
        
        (window as any)._devBackups = (window as any)._devBackups || [];
        const backupIndex = (window as any)._devBackups.push({ S: S_backup, html: html_backup, style: null });
        
        let injectedStyle: HTMLStyleElement | null = null;
        
        if (hasJs) {
          try {
            // Mask sensitive API key during execution of untrusted AI-suggested code blocks
            const originalKey = S.openrouterKey;
            S.openrouterKey = '[MASKED_FOR_SANDBOX_SECURITY]';
            
            const originalStorageKey = localStorage.getItem('ftp-openrouterkey');
            localStorage.removeItem('ftp-openrouterkey');

            try {
              addDevConsoleLog(`[COMPILING] Executing JavaScript sandbox patch...`, 'info');
              const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
              await new AsyncFunction(hasJs[1])();
              toast('[DEV] Executed JavaScript');
              addDevConsoleLog(`[SUCCESS] JavaScript patch compiled & executed successfully.`, 'success');
              renderStateInspector();
            } finally {
              // Always restore original values
              S.openrouterKey = originalKey;
              if (originalStorageKey) localStorage.setItem('ftp-openrouterkey', originalStorageKey);
            }
          } catch (e: any) {
            toast('[DEV ERROR] ' + e.message);
            addDevConsoleLog(`[ERROR] JS Execution Failed: ${e.message}`, 'error');
          }
        }
        
        if (hasCss) {
          addDevConsoleLog(`[COMPILING] Injecting custom CSS stylesheet...`, 'info');
          injectedStyle = document.createElement('style');
          injectedStyle.innerHTML = hasCss[1];
          document.head.appendChild(injectedStyle);
          toast('[DEV] Injected CSS');
          addDevConsoleLog(`[SUCCESS] Stylesheet compilation and injection complete.`, 'success');
        }
        
        (window as any)._devBackups[backupIndex - 1].style = injectedStyle;
        
        // Display beautiful floating undo widget
        renderDevUndoBar();
      }
    }

    // Extract sources (decks mentioned in response)
    const sources = extractDeckSources(response);

    currentSession.messages.push({
      role: 'ai',
      content: response,
      sources: sources,
      timestamp: Date.now(),
    });

    renderChatMessages();
    saveChatSession();

    // Show completion feedback
    if (sendBtn) {
      sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" style="width:14px;height:14px;color:var(--sage)"><polyline points="20 6 9 17 4 12"/></svg>`;
      setTimeout(() => {
        sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px;height:14px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
        sendBtn.disabled = false;
        sendBtn.classList.remove('loading');
      }, 1200);
    }

    // Show generate cards option if AI suggested cards
    if (response.includes('→') || response.includes('Q:')) {
      const genSection = document.getElementById('chat-gen-section');
      if (genSection) genSection.style.display = 'block';
    }
  } catch (error: any) {
    console.error('Chat error:', error);
    
    // Remove typing indicator
    const typingEl = document.getElementById(typingId);
    if (typingEl) typingEl.remove();

    // Check if offline or if it's a network/API issue
    const isOffline = !navigator.onLine || error.message?.includes('fetch') || error.message?.includes('HTTP');
    if (isOffline) {
      toast('Device offline — Running offline heuristic assistant!');
      
      const userText = (input.value || '').toLowerCase();
      let reply = '';
      if (userText.includes('add') || userText.includes('card') || userText.includes('create')) {
        reply = `**[Offline Heuristic Assistant]** You can create flashcards rapidly without internet! Open the editor, enter questions/answers, type tags with autocompletion, and use **Ctrl + Enter** for immediate card saving. Built-in heuristics will auto-categorize your cards locally.`;
      } else if (userText.includes('study') || userText.includes('learn') || userText.includes('repetition') || userText.includes('srs')) {
        reply = `**[Offline Heuristic Assistant]** Spaced Repetition runs 100% offline! Click on any deck or tap a **Cross-Deck Tag** in the sidebar to study cards. Your difficulty eases and scheduling dates update in your browser storage instantly.`;
      } else {
        reply = `**[Offline Heuristic Assistant]** I detected that you are offline or your API request failed. 
        
Your local study queue, scratchpad drawings, search queries, and stats remain fully active and offline-safe! 

*When your connection is restored:*
- OpenRouter AI deck auditor & rewrites
- Smart semantic completions
- Advanced natural language chat cards generation
Will resume working immediately!`;
      }
      
      lastAIMessage = reply;
      currentSession.messages.push({
        role: 'ai',
        content: reply,
        sources: [],
        timestamp: Date.now(),
      });
      renderChatMessages();
      saveChatSession();
    } else {
      toast('[ERROR] Chat failed — check your OpenRouter key');
      currentSession.messages.pop(); // Remove user message
      renderChatMessages();
    }
    
    // Reset button
    if (sendBtn) {
      sendBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" style="width:14px;height:14px"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`;
      sendBtn.classList.remove('loading');
    }
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    if (input) input.disabled = false;
  }
}

// Extract deck names from AI response
function extractDeckSources(response: string): string[] {
  const sources: Set<string> = new Set();
  const decks = S.decks ? Object.values(S.decks) : [];

  decks.forEach((deck: any) => {
    if (response.toLowerCase().includes(deck.name.toLowerCase())) {
      sources.add(deck.name);
    }
  });

  return Array.from(sources);
}

// Generate cards from AI message
async function generateCardsFromLastAIMessage() {
  if (!lastAIMessage) {
    toast('[ERROR] No AI message to parse');
    return;
  }

  // Parse Q&A pairs from the message
  // Format: "Q: [q] → A: [a]" or "Q: [q]\nA: [a]"
  const qaPairs: Array<{ q: string; a: string }> = [];

  // Try format: "Q: ... → A: ..."
  const format1Regex = /Q:\s*([^→\n]+)\s*→\s*A:\s*([^\n]+)/gi;
  let match;
  while ((match = format1Regex.exec(lastAIMessage)) !== null) {
    qaPairs.push({
      q: match[1].trim(),
      a: match[2].trim(),
    });
  }

  // Try format: "Q: ...\nA: ..."
  if (qaPairs.length === 0) {
    const format2Regex = /Q:\s*([^\n]+)\n\s*A:\s*([^\n]+)/gi;
    while ((match = format2Regex.exec(lastAIMessage)) !== null) {
      qaPairs.push({
        q: match[1].trim(),
        a: match[2].trim(),
      });
    }
  }

  if (qaPairs.length === 0) {
    toast('[ERROR] No Q&A pairs found in response');
    return;
  }

  // Show modal to select deck
  showCardGenerationModal(qaPairs);
}

// Show modal to select target deck for generated cards
function showCardGenerationModal(cards: Array<{ q: string; a: string }>) {
  const decks = S.decks ? Object.entries(S.decks) : [];
  if (decks.length === 0) {
    toast('[ERROR] Create a deck first');
    return;
  }

  // Create simple modal
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'gen-cards-modal';
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };

  const content = document.createElement('div');
  content.className = 'modal';
  content.style.width = '420px';

  // Generate cards preview
  const previewHTML = cards
    .slice(0, 3)
    .map((c: any) => `
      <div style="background:var(--surface3);padding:8px;border-radius:var(--rs);margin-bottom:6px;font-size:11px;border-left:2px solid var(--accent)">
        <div><strong style="color:var(--accent)">Q:</strong> ${c.q}</div>
        <div style="margin-top:3px;color:var(--text2)"><strong>A:</strong> ${c.a}</div>
      </div>
    `).join('');

  content.innerHTML = `
    <div class="modal-title">+ Generate ${cards.length} Cards</div>
    <div class="modal-sub">Preview (showing first 3)</div>
    <div style="max-height:160px;overflow-y:auto;background:var(--surface);border:1px solid var(--border);border-radius:var(--rs);padding:10px;margin-bottom:12px">
      ${previewHTML}
      ${cards.length > 3 ? `<div style="text-align:center;color:var(--text3);font-size:11px;margin-top:6px">+ ${cards.length - 3} more cards...</div>` : ''}
    </div>
    <div style="margin-bottom:12px">
      <label style="font-size:12px;color:var(--text2);display:block;margin-bottom:6px;font-weight:600">Add to deck:</label>
      <div class="custom-dropdown" id="gen-deck-select-wrap">
        <div class="custom-dropdown-selected" id="gen-deck-select" onclick="toggleGenDeckDropdown()">Select deck...</div>
        <div class="custom-dropdown-options" id="gen-deck-options" style="display:none">
           <div class="option" onclick="selectGenDeck('', 'Select deck...')">Select deck...</div>
           ${decks.map(([id, d]: any) => `<div class="option" onclick="selectGenDeck('${id}', '${d.name} (${(d.cards || []).length} cards)')">${d.name} (${(d.cards || []).length} cards)</div>`).join('')}
        </div>
      </div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn" onclick="document.getElementById('gen-cards-modal').remove()" style="flex:1;background:var(--surface2);border:1px solid var(--border);color:var(--text3)">Cancel</button>
      <button class="btn" onclick="confirmGenerateCards(${cards.length})" style="flex:1">Create Cards</button>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);

  // Store cards for confirmation
  (window as any)._pendingCards = cards;
}

// Confirm and add generated cards
function confirmGenerateCards(count: number) {
  const select = document.getElementById('gen-deck-select') as HTMLElement;
  const deckId = (select as any).dataset.value;

  if (!deckId || !S.decks?.[deckId]) {
    toast('[ERROR] Select a deck');
    return;
  }

  const cards = (window as any)._pendingCards;
  const deck = S.decks[deckId];
  const addedCards: any[] = [];

  cards.forEach((card: any) => {
    deck.cards = deck.cards || [];
    const newCard = {
      id: 'c_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      q: card.q,
      a: card.a,
      ease: 2.5,
      interval: 1,
      due: Date.now(),
      mistakes: 0,
      difficulty: 'none',
      createdAt: Date.now(),
    };
    deck.cards.push(newCard);
    addedCards.push(newCard);
  });

  // Save to storage
  persist();
  (window as any).updateStats?.();
  (window as any).renderSidebar?.();
  (window as any).renderCardsList?.();

  // Sync to cloud
  import('./firebase-sync.js').then(({ syncAddCardsBatch }) => {
    syncAddCardsBatch(deckId, addedCards).catch(err => console.warn("Batch cards sync failed:", err));
  }).catch(e => console.warn("Could not load firebase-sync module for chat cards:", e));

  toast(`[DONE] Added ${count} cards to "${deck.name}"`);

  // Close modal
  const modal = document.getElementById('gen-cards-modal');
  if (modal) modal.remove();

  // Hide generate section
  const genSection = document.getElementById('chat-gen-section');
  if (genSection) genSection.style.display = 'none';
}

// Show modal to confirm clearing chat history
function clearChatHistoryConfirm() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'clear-chat-modal';
  modal.onclick = (e) => {
    if (e.target === modal) modal.remove();
  };

  const content = document.createElement('div');
  content.className = 'modal';
  content.style.width = '380px';
  content.innerHTML = `
    <div class="modal-title" style="color:var(--red);display:flex;align-items:center;gap:6px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
      <span>Clear Chat</span>
    </div>
    <div class="modal-sub">Are you sure you want to clear all messages in this conversation? This cannot be undone.</div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:22px">
      <button class="btn" onclick="document.getElementById('clear-chat-modal').remove()">Cancel</button>
      <button class="btn btn-r" onclick="confirmClearChatHistory()">Clear Chat</button>
    </div>
  `;

  modal.appendChild(content);
  document.body.appendChild(modal);
  
  // Trigger animation
  requestAnimationFrame(() => modal.classList.add('show'));
}

// Clear chat history
function confirmClearChatHistory() {
  const modal = document.getElementById('clear-chat-modal');
  if (modal) modal.remove();
  
  currentSession = createNewSession();
  saveChatSession();
  renderChatMessages();
  loadChatHistory();
  toast('[CHAT] Chat cleared');
}

// Start a new chat
function startNewChat() {
  currentSession = createNewSession();
  saveChatSession();
  renderChatMessages();
  loadChatHistory();
  if (window.innerWidth <= 768) {
    toggleChatHistory();
  }
}

// Change selected deck for chat
function changeChatDeck() {
  const select = document.getElementById('chat-deck-select');
  selectedDeckId = (select as any)?.dataset?.value || '';
  updateDeckStats();
  // User will see the effect when they next send a message
}

// Update deck stats display
function updateDeckStats() {
  const infoEl = document.getElementById('ctb-deck-info');
  if (!infoEl) return;

  let totalCards = 0;
  let newCards = 0;
  let dueCards = 0;

  if (selectedDeckId) {
    // Single deck
    const deck = S.decks?.[selectedDeckId];
    if (deck) {
      totalCards = (deck.cards || []).length;
      newCards = (deck.cards || []).filter((c: any) => !c.dueDate || c.dueDate <= Date.now()).length;
      dueCards = (deck.cards || []).filter((c: any) => c.dueDate && c.dueDate <= Date.now()).length;
    }
  } else {
    // All decks
    const allDecks = S.decks ? Object.values(S.decks) : [];
    allDecks.forEach((deck: any) => {
      totalCards += (deck.cards || []).length;
      newCards += (deck.cards || []).filter((c: any) => !c.dueDate || c.dueDate <= Date.now()).length;
      dueCards += (deck.cards || []).filter((c: any) => c.dueDate && c.dueDate <= Date.now()).length;
    });
  }

  if (totalCards > 0) {
    infoEl.innerHTML = `<span class="ctb-stat"><b>${totalCards}</b> total</span> &bull; <span class="ctb-stat"><b>${newCards}</b> new</span> &bull; <span class="ctb-stat"><b>${dueCards}</b> due</span>`;
  } else {
    infoEl.textContent = 'Empty Scope';
  }
}

// Show welcome screen with quick prompts
function showWelcomeIfEmpty() {
  const messages = document.getElementById('chat-messages');
  if (!messages) return;

  if (!currentSession || currentSession.messages.length > 0) {
    return;
  }

  const suggestions = [
    {
      title: '🎯 Practice Quiz',
      desc: 'Let AI generate custom quiz questions from your active deck.',
      prompt: 'Quiz me on my cards'
    },
    {
      title: '💡 Socratic Method',
      desc: 'Pick a tough concept and have Socratic Tutor guide your reasoning.',
      prompt: 'Explain a difficult concept from my decks'
    },
    {
      title: '🏫 Feynman Diagnostic',
      desc: 'Teach a concept in your own words to identify gaps in your mastery.',
      prompt: 'Help me explain a concept using the Feynman Technique'
    },
    {
      title: '⚡ Card Generator',
      desc: 'Draft 5 highly polished flashcards on any new topic.',
      prompt: 'Suggest 5 high-quality flashcards for a new topic'
    }
  ];

  messages.innerHTML = `
    <div class="chat-welcome">
      <div class="chat-welcome-header">
        <h1 class="chat-welcome-title">AI Study Command</h1>
        <p class="chat-welcome-subtitle">Your conversational study partner. Choose an active deck and cognitive mode above, or click a strategy below to begin.</p>
      </div>
      
      <div class="chat-welcome-grid">
        ${suggestions.map(s => `
          <div class="chat-welcome-card" onclick="window.insertPrompt('${s.prompt.replace(/'/g, "\\'")}')">
            <div class="cwc-content">
              <h3 class="cwc-title">${s.title}</h3>
              <p class="cwc-desc">${s.desc}</p>
            </div>
            <div class="cwc-action-arrow">→</div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Insert prompt into input
function insertPrompt(prompt: string) {
  const input = document.getElementById('chat-input') as HTMLInputElement;
  if (input) {
    input.value = prompt;
    input.focus();
  }
}

// Toggle chat history sidebar
function toggleChatHistory() {
  const sidebar = document.getElementById('chat-history-sidebar') as HTMLElement;
  const btn = document.getElementById('btn-chat-history');
  if (sidebar && btn) {
    const isHidden = sidebar.style.display === 'none';
    sidebar.style.display = isHidden ? 'flex' : 'none';
    btn.style.borderColor = isHidden ? 'var(--px-green)' : 'var(--border)';
    btn.style.color = isHidden ? 'var(--px-green)' : 'var(--text3)';
    loadChatHistory();
  }
}

// Load and display chat history
function loadChatHistory() {
  const historyList = document.getElementById('chat-history-list');
  if (!historyList) return;

  const sessions = localStorage.getItem('ftp-chat-sessions');
  const sessionList: ChatSession[] = sessions ? JSON.parse(sessions) : [];

  historyList.innerHTML = '';
  if (sessionList.length === 0) {
    historyList.innerHTML = '<div style="font-size:10px;color:var(--text3)">No history yet</div>';
    return;
  }

  sessionList.slice(-5).reverse().forEach((session: any) => {
    const item = document.createElement('button');
    item.className = 'chat-history-item' + (currentSession?.id === session.id ? ' active' : '');
    const date = new Date(session.updatedAt).toLocaleDateString();
    const preview = session.messages[0]?.content.slice(0, 30) || 'Empty';
    item.innerHTML = `<div>${escH(preview)}...</div><div style="font-size:9px;opacity:0.7">${date}</div>`;
    item.onclick = () => loadChatSession(session.id);
    historyList.appendChild(item);
  });
}

// Load specific chat session by ID
function loadChatSession(sessionId?: string) {
  if (sessionId) {
    const sessions = localStorage.getItem('ftp-chat-sessions');
    const sessionList: ChatSession[] = sessions ? JSON.parse(sessions) : [];
    const session = sessionList.find(s => s.id === sessionId);
    if (session) {
      currentSession = session;
      renderChatMessages();
      showWelcomeIfEmpty();
      loadChatHistory();
    }
  } else {
    const stored = localStorage.getItem('ftp-chat-session');
    if (stored) {
      try {
        currentSession = JSON.parse(stored);
      } catch {
        currentSession = createNewSession();
      }
    } else {
      currentSession = createNewSession();
    }
  }
}

// Save session to history
function saveChatSession() {
  if (currentSession) {
    currentSession.updatedAt = Date.now();
    localStorage.setItem('ftp-chat-session', JSON.stringify(currentSession));
    
    // Also save to history
    const sessions = localStorage.getItem('ftp-chat-sessions');
    const sessionList: ChatSession[] = sessions ? JSON.parse(sessions) : [];
    const idx = sessionList.findIndex(s => s.id === currentSession!.id);
    if (idx >= 0) {
      sessionList[idx] = currentSession;
    } else {
      sessionList.push(currentSession);
    }
    localStorage.setItem('ftp-chat-sessions', JSON.stringify(sessionList.slice(-10))); // Keep last 10
  }
}

function toggleGenDeckDropdown() {
  const options = document.getElementById('gen-deck-options');
  if (options) {
    options.style.display = options.style.display === 'none' ? 'block' : 'none';
  }
}

function selectGenDeck(id: string, name: string) {
  const selected = document.getElementById('gen-deck-select');
  if (selected) {
    selected.textContent = name;
    (selected as any).dataset.value = id;
  }
  toggleGenDeckDropdown();
}

function toggleMainChatDeckDropdown() {
  const options = document.getElementById('chat-deck-options');
  if (options) {
    options.style.display = options.style.display === 'none' ? 'block' : 'none';
  }
}

function selectMainChatDeck(id: string, name: string) {
  const selected = document.getElementById('chat-deck-select');
  if (selected) {
    selected.textContent = name;
    (selected as any).dataset.value = id;
  }
  toggleMainChatDeckDropdown();
  changeChatDeck();
}

// Export for global access
(window as any).sendChatMessage = sendChatMessage;
(window as any).generateCardsFromLastAIMessage = generateCardsFromLastAIMessage;
(window as any).confirmGenerateCards = confirmGenerateCards;
(window as any).toggleGenDeckDropdown = toggleGenDeckDropdown;
(window as any).selectGenDeck = selectGenDeck;
(window as any).toggleMainChatDeckDropdown = toggleMainChatDeckDropdown;
(window as any).selectMainChatDeck = selectMainChatDeck;
(window as any).toggleMainChatPersonaDropdown = toggleMainChatPersonaDropdown;
(window as any).clearChatHistoryConfirm = clearChatHistoryConfirm;
(window as any).confirmClearChatHistory = confirmClearChatHistory;
(window as any).startNewChat = startNewChat;
(window as any).changeChatDeck = changeChatDeck;
(window as any).populateDeckSelector = populateDeckSelector;
(window as any).toggleChatHistory = toggleChatHistory;
(window as any).insertPrompt = insertPrompt;
(window as any).copyMessage = copyMessage;
(window as any).bookmarkMessage = bookmarkMessage;
(window as any).updateDeckStats = updateDeckStats;

// Helper functions for actions
function copyMessage(idx: number) {
  if (!currentSession || !currentSession.messages[idx]) return;
  const text = currentSession.messages[idx].content;
  navigator.clipboard.writeText(text);
  toast('[COPIED] Message copied to clipboard');
}

function bookmarkMessage(idx: number) {
  if (!currentSession || !currentSession.messages[idx]) return;
  toast('[BOOKMARKED] Saved to notes');
  // Could store bookmarks in a separate list
}

function renderDevUndoBar() {
  let bar = document.getElementById('dev-undo-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'dev-undo-bar';
    bar.className = 'dev-undo-bar';
    document.body.appendChild(bar);
  }
  const historyLen = ((window as any)._devBackups || []).length;
  bar.innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:4px">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;color:var(--accent)"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
      <span>Live AI Change executed (${historyLen})</span>
    </span>
    <button class="dev-undo-btn" onclick="window._revertDevChange()">↩ Revert Last</button>
  `;
}

function revertDevChange() {
  const backups = (window as any)._devBackups || [];
  if (!backups.length) return;
  const last = backups.pop();
  if (last) {
    try {
      // 1. Revert State S
      Object.assign(S, JSON.parse(last.S));
      persist();
      
      // 2. Revert CSS style tags
      if (last.style && last.style.parentNode) {
        last.style.parentNode.removeChild(last.style);
      }
      
      // 3. Revert DOM structure
      const container = document.getElementById('app-container');
      if (container) {
        container.innerHTML = last.html;
      }
      
      toast('✓ Live changes rolled back safely!');
    } catch (err: any) {
      toast('Error during undo: ' + err.message);
    }
  }
  
  // Hide or refresh bar
  const bar = document.getElementById('dev-undo-bar');
  if (bar) {
    if (backups.length > 0) {
      bar.innerHTML = `
        <span style="display:inline-flex;align-items:center;gap:4px">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:12px;height:12px;color:var(--accent)"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
          <span>Live AI Change executed (${backups.length})</span>
        </span>
        <button class="dev-undo-btn" onclick="window._revertDevChange()">↩ Revert Last</button>
      `;
    } else {
      bar.remove();
    }
  }
}
(window as any)._revertDevChange = revertDevChange;
(window as any).renderDevUndoBar = renderDevUndoBar;

function addDevConsoleLog(msg: string, type: 'system' | 'info' | 'success' | 'error' = 'info') {
  const container = document.getElementById('dev-console-logs');
  if (!container) return;
  const time = new Date().toTimeString().split(' ')[0];
  const div = document.createElement('div');
  div.className = `log-entry ${type}`;
  div.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-text">${escH(msg)}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderStateInspector() {
  const inspector = document.getElementById('dev-state-inspector');
  if (!inspector) return;
  
  const formatValue = (val: any): string => {
    if (val === null) return '<span class="ins-null">null</span>';
    if (typeof val === 'undefined') return '<span class="ins-undef">undefined</span>';
    if (typeof val === 'string') return `<span class="ins-str">"${val.substring(0, 40)}${val.length > 40 ? '...' : ''}"</span>`;
    if (typeof val === 'number') return `<span class="ins-num">${val}</span>`;
    if (typeof val === 'boolean') return `<span class="ins-bool">${val}</span>`;
    return `<span class="ins-type">${typeof val}</span>`;
  };

  let html = '<div class="ins-root">';
  
  Object.keys(S).forEach(key => {
    if (key === 'openrouterKey') {
      html += `<div class="ins-row"><span class="ins-key">${key}:</span> <span class="ins-masked">[MASKED_SECURITY]</span></div>`;
      return;
    }
    const val = (S as any)[key];
    if (val && typeof val === 'object') {
      const keys = Object.keys(val);
      html += `
        <details class="ins-details" open>
          <summary class="ins-summary"><span class="ins-key">${key}</span> <span class="ins-meta">(${keys.length} items)</span></summary>
          <div class="ins-children">
      `;
      keys.slice(0, 8).forEach(subKey => {
        const subVal = val[subKey];
        if (subVal && typeof subVal === 'object') {
          html += `<div class="ins-row" style="padding-left:12px"><span class="ins-key">${subKey}:</span> <span class="ins-type">${Array.isArray(subVal) ? 'Array' : 'Object'} (${Object.keys(subVal).length} keys)</span></div>`;
        } else {
          html += `<div class="ins-row" style="padding-left:12px"><span class="ins-key">${subKey}:</span> ${formatValue(subVal)}</div>`;
        }
      });
      if (keys.length > 8) {
        html += `<div class="ins-row ins-more" style="padding-left:12px">... and ${keys.length - 8} more</div>`;
      }
      html += `
          </div>
        </details>
      `;
    } else {
      html += `<div class="ins-row"><span class="ins-key">${key}:</span> ${formatValue(val)}</div>`;
    }
  });
  
  html += '</div>';
  inspector.innerHTML = html;

  // Render stats
  const statDecks = document.getElementById('dev-stat-decks');
  const statCards = document.getElementById('dev-stat-cards');
  if (statDecks) statDecks.textContent = Object.keys(S.decks || {}).length.toString();
  if (statCards) {
    let totalCards = 0;
    Object.values(S.decks || {}).forEach((deck: any) => {
      totalCards += (deck.cards || []).length;
    });
    statCards.textContent = totalCards.toString();
  }
}

function toggleDevMode(checkbox: HTMLInputElement) {
  // Dev mode removed from AI Chat
}

function toggleDevModeForceOff() {
  // Dev mode removed from AI Chat
}

function toggleDevDockExpand() {
  const body = document.getElementById('dev-dock-body');
  const icon = document.getElementById('dev-dock-toggle-icon');
  if (!body || !icon) return;

  if (body.style.display === 'none') {
    body.style.display = 'block';
    icon.textContent = '▼ Collapse console';
  } else {
    body.style.display = 'none';
    icon.textContent = '▲ Expand console';
  }
}

(window as any).toggleDevMode = toggleDevMode;
(window as any).toggleDevModeForceOff = toggleDevModeForceOff;
(window as any).toggleDevDockExpand = toggleDevDockExpand;
(window as any).addDevConsoleLog = addDevConsoleLog;
(window as any).renderStateInspector = renderStateInspector;


// ─── ES module exports (auto-generated) ───
export { addDevConsoleLog, addSingleSuggestedCard, bookmarkMessage, buildDeckContext, changeChatDeck, chatInit, clearChatHistoryConfirm, confirmClearChatHistory, confirmGenerateCards, copyCode, copyMessage, createNewSession, currentSession, extractDeckSources, formatMarkdown, generateCardsFromLastAIMessage, insertPrompt, lastAIMessage, loadChatHistory, loadChatSession, populateDeckSelector, renderChatMessages, renderDevUndoBar, renderInteractiveSuggestedCard, renderStateInspector, revertDevChange, saveChatSession, selectGenDeck, selectMainChatDeck, selectPersonaV2, selectedDeckId, sendChatMessage, showCardGenerationModal, showWelcomeIfEmpty, startNewChat, toggleChatHistory, toggleDevDockExpand, toggleDevMode, toggleDevModeForceOff, toggleGenDeckDropdown, toggleMainChatDeckDropdown, toggleMainChatPersonaDropdown, updateDeckStats };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { addDevConsoleLog, addSingleSuggestedCard, bookmarkMessage, buildDeckContext, changeChatDeck, chatInit, clearChatHistoryConfirm, confirmClearChatHistory, confirmGenerateCards, copyCode, copyMessage, createNewSession, extractDeckSources, formatMarkdown, generateCardsFromLastAIMessage, insertPrompt, loadChatHistory, loadChatSession, populateDeckSelector, renderChatMessages, renderDevUndoBar, renderInteractiveSuggestedCard, renderStateInspector, revertDevChange, saveChatSession, selectGenDeck, selectMainChatDeck, selectPersonaV2, sendChatMessage, showCardGenerationModal, showWelcomeIfEmpty, startNewChat, toggleChatHistory, toggleDevDockExpand, toggleDevMode, toggleDevModeForceOff, toggleGenDeckDropdown, toggleMainChatDeckDropdown, toggleMainChatPersonaDropdown, updateDeckStats });
