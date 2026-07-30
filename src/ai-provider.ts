import { init } from './init.js';
import { S } from './main.js';
import { fetchWithTimeout, toast } from './utils.js';




// Track API usage in localStorage
function trackAPIUsage(inputTokens: number, outputTokens: number) {
  S.apiUsage.calls += 1;
  S.apiUsage.tokensIn += inputTokens;
  S.apiUsage.tokensOut += outputTokens;
  localStorage.setItem('ftp-api-usage', JSON.stringify(S.apiUsage));
  if (window.updateUsageDisplay) (window as any).updateUsageDisplay();
}

// Load usage from localStorage
function loadAPIUsage() {
  try {
    const saved = localStorage.getItem('ftp-api-usage');
    if (saved) S.apiUsage = JSON.parse(saved);
    
    // Auto-reset if a month has passed
    const now = Date.now();
    const daysSinceReset = (now - S.apiUsage.lastReset) / (1000 * 60 * 60 * 24);
    if (daysSinceReset >= 30) {
      console.log('[API Usage] Auto-reset: 30+ days since last reset');
      resetAPIUsage();
    }
  } catch (e) {
    console.warn('[API Usage] Failed to load:', e);
  }
}

// Reset usage (monthly)
function resetAPIUsage() {
  S.apiUsage = {
    calls: 0,
    tokensIn: 0,
    tokensOut: 0,
    lastReset: Date.now()
  };
  localStorage.setItem('ftp-api-usage', JSON.stringify(S.apiUsage));
  if (window.updateUsageDisplay) (window as any).updateUsageDisplay();
  (window as any).toast?.('✓ API usage reset');
}

// Load on init
loadAPIUsage();

function isNativePlatform() {
  // Check if Capacitor is available (APK/native builds)
  try {
    return typeof window !== 'undefined' && (window as any).Capacitor !== undefined;
  } catch {
    return false;
  }
}

// Platform-agnostic HTTP request
async function platformFetch(url: string, options: any, timeout: number) {
  if (isNativePlatform()) {
    try {
      // Use native HTTP if Capacitor HTTP is available
      const Capacitor = (window as any).Capacitor;
      const Http = Capacitor.Plugins?.Http;
      
      if (Http) {
        const response = await Http.post({
          url,
          headers: options.headers,
          data: options.body ? JSON.parse(options.body) : undefined
        });
        // Wrap native response to match fetch API
        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          json: async () => response.data
        };
      }
    } catch (e) {
      console.warn('[platformFetch] Native HTTP failed, falling back to fetch:', e);
    }
  }
  
  // Fallback: use regular fetch (web, or native if Http plugin unavailable)
  return fetchWithTimeout(url, options, timeout);
}





// ─── AI PROVIDER ──────────────────────────────────────────────────────────────
// Unified entry point for AI text generation. Routes to OpenRouter
// based on S.aiProvider, and falls back to rule-based mode on failure.
 
async function openRouterGenerate(prompt, maxTokens = 3000) {
  if (!S.openrouterKey) throw new Error('No OpenRouter API key set. Add it in Settings.');
  
  // Determine endpoint based on platform
  const isNative = isNativePlatform();
  const url = isNative
    ? 'https://openrouter.ai/api/v1/chat/completions'  // APK: direct HTTPS
    : 'http://localhost:3000/openrouter/api/v1/chat/completions';  // Web: use proxy
  
  const resp = await platformFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + S.openrouterKey },
    body: JSON.stringify({
      model: S.openrouterModel,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
      temperature: 0.3
    })
  }, 20000);
  
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err.error?.message) || 'OpenRouter HTTP ' + resp.status);
  }
  const data = await resp.json();
  
  // Track usage (estimate tokens: roughly 4 chars = 1 token)
  const inputTokens = Math.ceil(prompt.length / 4);
  const output = data.choices?.[0]?.message?.content || '';
  const outputTokens = Math.ceil(output.length / 4);
  trackAPIUsage(inputTokens, outputTokens);
  
  return output;
}

async function geminiGenerate(prompt, maxTokens = 3000) {
  const isNative = isNativePlatform();
  const url = isNative
    ? 'http://localhost:3000/api/gemini/generate'
    : '/api/gemini/generate';
    
  const headers: any = { 'Content-Type': 'application/json' };
  if (S.geminiKey) {
    headers['Authorization'] = 'Bearer ' + S.geminiKey;
  }

  const resp = await platformFetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt,
      model: S.geminiModel || 'gemini-3.5-flash',
      maxTokens
    })
  }, 25000);

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err.error?.message) || 'Gemini HTTP ' + resp.status);
  }
  const data = await resp.json();

  let inputTokens = Math.ceil(prompt.length / 4);
  let output = data.text || '';
  let outputTokens = Math.ceil(output.length / 4);
  
  if (data.usageMetadata) {
    inputTokens = data.usageMetadata.promptTokenCount || inputTokens;
    outputTokens = data.usageMetadata.candidatesTokenCount || outputTokens;
  }
  
  trackAPIUsage(inputTokens, outputTokens);
  return output;
}
 
const AIProvider = {
  async generate(prompt, maxTokens = 3000) {
    try {
      if (S.aiProvider === 'openrouter') {
        return await openRouterGenerate(prompt, maxTokens);
      }
      if (S.aiProvider === 'gemini') {
        return await geminiGenerate(prompt, maxTokens);
      }
      if (S.aiProvider === 'noai') return null;
      throw new Error('Unsupported AI provider: ' + S.aiProvider);
    } catch (e) {
      console.warn('[AI] Provider failed, falling back to rule-based:', e.message);
      S._aiFallback = true;
      toast(`AI unavailable (${e.message.slice(0, 60)}) — using rule-based mode`);
      return null;
    }
  }
};


// ─── ES module exports (auto-generated) ───
export { AIProvider, geminiGenerate, isNativePlatform, loadAPIUsage, openRouterGenerate, platformFetch, resetAPIUsage, trackAPIUsage };

// Expose API for inline onclick="" handlers (auto-generated)
Object.assign(window, { AIProvider, geminiGenerate, isNativePlatform, loadAPIUsage, openRouterGenerate, platformFetch, resetAPIUsage, trackAPIUsage });
