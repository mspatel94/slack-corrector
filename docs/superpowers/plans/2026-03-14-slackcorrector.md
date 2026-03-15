# SlackCorrector Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that intercepts Slack messages before send, corrects grammar/tone via LLM, and shows an editable approval overlay.

**Architecture:** Manifest V3 extension with content scripts injected into `app.slack.com` (interceptor + overlay + selectors + shared namespace), a background service worker that proxies LLM API calls (Claude/OpenAI), and a popup for settings. No build step — plain JS with ES modules in the service worker and classic scripts for content scripts.

**Tech Stack:** Chrome Extension Manifest V3, vanilla JavaScript (ES2022), Chrome Storage API, Anthropic Messages API, OpenAI Chat Completions API.

**Spec:** `docs/superpowers/specs/2026-03-14-slackcorrector-design.md`

---

## Chunk 1: Foundation & Storage

### Task 1: Manifest & Namespace

**Files:**
- Create: `manifest.json`
- Create: `content/namespace.js`

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "SlackCorrector",
  "version": "1.0.0",
  "description": "Grammar check and professional tone correction for Slack messages",
  "permissions": ["storage"],
  "host_permissions": [
    "https://api.anthropic.com/*",
    "https://api.openai.com/*"
  ],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "content_scripts": [
    {
      "matches": ["https://app.slack.com/*"],
      "js": [
        "content/namespace.js",
        "content/slack-selectors.js",
        "content/interceptor.js",
        "content/overlay.js"
      ],
      "css": ["content/overlay.css"],
      "run_at": "document_idle"
    }
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon-16.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },
  "icons": {
    "16": "icons/icon-16.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

- [ ] **Step 2: Create `content/namespace.js`**

Shared namespace for cross-script communication. Loaded first in the manifest's `js` array.

```javascript
// Shared namespace for all SlackCorrector content scripts.
// Content scripts run in classic (non-module) scope, so they communicate
// via this shared object on the window.
window.__slackCorrector = {
  // True while the overlay is open or a correction is in-flight.
  // Prevents duplicate interceptions.
  interceptorActive: false,

  // True while programmatically triggering Slack's send.
  // The interceptor checks this and lets the event through.
  bypassing: false,

  // True if the extension is enabled (loaded from storage on init).
  enabled: true,

  // Current correction mode (loaded from storage on init).
  defaultMode: 'professional',

  // References set by other scripts
  selectors: null,  // Set by slack-selectors.js
  overlay: null,    // Set by overlay.js
};
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
.DS_Store
*.log
.superpowers/
```

- [ ] **Step 4: Commit**

```bash
git add manifest.json content/namespace.js .gitignore
git commit -m "feat: add manifest.json, shared namespace, and .gitignore"
```

### Task 2: Storage Utilities

**Files:**
- Create: `utils/storage.js`

- [ ] **Step 1: Create `utils/storage.js`**

Helper functions for reading/writing `chrome.storage.sync`. Used by both the popup (settings) and background service worker.

```javascript
// Default settings — single source of truth.
export const DEFAULTS = {
  provider: 'anthropic',
  apiKey: '',
  model: '',
  defaultMode: 'professional',
  enabled: true,
};

// Mode key → display name mapping.
export const MODE_LABELS = {
  fix: 'Fix errors only',
  professional: 'Professional',
  concise: 'Concise',
  friendly: 'Friendly but polished',
};

/**
 * Load all settings, filling in defaults for any missing keys.
 * @returns {Promise<typeof DEFAULTS>}
 */
export async function loadSettings() {
  const stored = await chrome.storage.sync.get(DEFAULTS);
  return stored;
}

/**
 * Save one or more settings.
 * @param {Partial<typeof DEFAULTS>} updates
 * @returns {Promise<void>}
 */
export async function saveSettings(updates) {
  await chrome.storage.sync.set(updates);
}
```

- [ ] **Step 2: Commit**

```bash
git add utils/storage.js
git commit -m "feat: add storage utility helpers"
```

### Task 3: Placeholder Icons

**Files:**
- Create: `icons/icon-16.png`
- Create: `icons/icon-48.png`
- Create: `icons/icon-128.png`

- [ ] **Step 1: Generate simple placeholder icons**

Create solid-color PNG icons at 16x16, 48x48, and 128x128 using Python (no external dependencies — uses the built-in `struct` and `zlib` modules to create minimal valid PNGs):

```bash
python3 -c "
import struct, zlib, os
def make_png(w, h, r, g, b, path):
    raw = b''
    for _ in range(h):
        raw += b'\x00' + bytes([r, g, b]) * w
    c = zlib.compress(raw)
    def chunk(t, d):
        return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)))
        f.write(chunk(b'IDAT', c))
        f.write(chunk(b'IEND', b''))
os.makedirs('icons', exist_ok=True)
make_png(16, 16, 0, 122, 90, 'icons/icon-16.png')
make_png(48, 48, 0, 122, 90, 'icons/icon-48.png')
make_png(128, 128, 0, 122, 90, 'icons/icon-128.png')
print('Icons created.')
"
```

- [ ] **Step 2: Commit**

```bash
git add icons/
git commit -m "feat: add placeholder extension icons"
```

### Task 4: Load extension in Chrome & verify

- [ ] **Step 1: Load the extension**

1. Open `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `slackcorrector/` directory

Expected: Extension appears in the list with the green icon and name "SlackCorrector". There may be errors about missing content script files — that's expected since we haven't created them yet.

- [ ] **Step 2: Verify storage defaults**

Open the extension's service worker devtools (click "Service worker" link on the extensions page), then run in the console:

```javascript
chrome.storage.sync.get(null, (data) => console.log(data));
```

Expected: Empty object `{}` (defaults are applied at read time, not written on install).

---

## Chunk 2: LLM Providers

### Task 5: Provider Base — System Prompts & Interface

**Files:**
- Create: `providers/base.js`

- [ ] **Step 1: Create `providers/base.js`**

Defines the system prompts per correction mode and the shared provider interface.

```javascript
/**
 * System prompts for each correction mode.
 * Each prompt instructs the LLM to return ONLY the corrected text, nothing else.
 */
export const SYSTEM_PROMPTS = {
  fix: `You are a grammar and spelling assistant. Fix grammar, spelling, and punctuation errors in the user's message. Do NOT change tone, word choice, or sentence structure. Return ONLY the corrected text with no explanation, preamble, or quotes.`,

  professional: `You are a professional writing assistant. Fix all grammar, spelling, and punctuation errors AND rephrase the message to sound professional. Remove slang and informal language, tighten wording, but preserve the original meaning. Return ONLY the corrected text with no explanation, preamble, or quotes.`,

  concise: `You are a concise writing assistant. Fix all errors, make the message professional, and shorten it aggressively. Remove filler words, unnecessary phrases, and redundancy. Return ONLY the corrected text with no explanation, preamble, or quotes.`,

  friendly: `You are a friendly writing assistant. Fix all grammar, spelling, and punctuation errors. Keep a warm, friendly tone but ensure the message reads clearly and polished. Return ONLY the corrected text with no explanation, preamble, or quotes.`,
};

/**
 * @typedef {Object} CorrectionResult
 * @property {boolean} ok
 * @property {string} [text] - Corrected text (if ok)
 * @property {string} [error] - Error message (if !ok)
 */

/**
 * Provider interface — each provider module must export a `correct` function
 * matching this signature:
 *
 * correct(text: string, mode: string, apiKey: string, model?: string): Promise<CorrectionResult>
 */
```

- [ ] **Step 2: Commit**

```bash
git add providers/base.js
git commit -m "feat: add provider base with system prompts"
```

### Task 6: Anthropic Provider

**Files:**
- Create: `providers/anthropic.js`

- [ ] **Step 1: Create `providers/anthropic.js`**

```javascript
import { SYSTEM_PROMPTS } from './base.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const API_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 10000;

/**
 * Call the Anthropic Messages API to correct text.
 * @param {string} text - Original message text
 * @param {string} mode - Correction mode key (fix, professional, concise, friendly)
 * @param {string} apiKey - Anthropic API key
 * @param {string} [model] - Optional model override
 * @returns {Promise<import('./base.js').CorrectionResult>}
 */
export async function correct(text, mode, apiKey, model) {
  const systemPrompt = SYSTEM_PROMPTS[mode];
  if (!systemPrompt) {
    return { ok: false, error: `Unknown mode: ${mode}` };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: text }],
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401) {
        return { ok: false, error: 'Invalid API key. Check your settings.' };
      }
      if (response.status === 429) {
        return { ok: false, error: 'Rate limited. Try again in a moment.' };
      }
      return { ok: false, error: `API error (${response.status}): ${body}` };
    }

    const data = await response.json();
    const correctedText = data.content?.[0]?.text?.trim();
    if (!correctedText) {
      return { ok: false, error: 'Empty response from API.' };
    }

    return { ok: true, text: correctedText };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Request timed out.' };
    }
    return { ok: false, error: `Network error: ${err.message}` };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add providers/anthropic.js
git commit -m "feat: add Anthropic provider"
```

### Task 7: OpenAI Provider

**Files:**
- Create: `providers/openai.js`

- [ ] **Step 1: Create `providers/openai.js`**

```javascript
import { SYSTEM_PROMPTS } from './base.js';

const DEFAULT_MODEL = 'gpt-4o-mini';
const API_URL = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 10000;

/**
 * Call the OpenAI Chat Completions API to correct text.
 * @param {string} text - Original message text
 * @param {string} mode - Correction mode key (fix, professional, concise, friendly)
 * @param {string} apiKey - OpenAI API key
 * @param {string} [model] - Optional model override
 * @returns {Promise<import('./base.js').CorrectionResult>}
 */
export async function correct(text, mode, apiKey, model) {
  const systemPrompt = SYSTEM_PROMPTS[mode];
  if (!systemPrompt) {
    return { ok: false, error: `Unknown mode: ${mode}` };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text },
        ],
        max_tokens: 1024,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      if (response.status === 401) {
        return { ok: false, error: 'Invalid API key. Check your settings.' };
      }
      if (response.status === 429) {
        return { ok: false, error: 'Rate limited. Try again in a moment.' };
      }
      return { ok: false, error: `API error (${response.status}): ${body}` };
    }

    const data = await response.json();
    const correctedText = data.choices?.[0]?.message?.content?.trim();
    if (!correctedText) {
      return { ok: false, error: 'Empty response from API.' };
    }

    return { ok: true, text: correctedText };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { ok: false, error: 'Request timed out.' };
    }
    return { ok: false, error: `Network error: ${err.message}` };
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add providers/openai.js
git commit -m "feat: add OpenAI provider"
```

### Task 8: Test providers manually

- [ ] **Step 1: Test Anthropic provider from service worker console**

After loading the extension in Chrome, open the service worker devtools and run:

```javascript
const { correct } = await import('./providers/anthropic.js');
const result = await correct('i wanna go their tmrw', 'professional', 'YOUR_KEY_HERE');
console.log(result);
```

Expected: `{ ok: true, text: "I would like to go there tomorrow." }` (or similar professional rephrasing).

- [ ] **Step 2: Test OpenAI provider from service worker console**

```javascript
const { correct } = await import('./providers/openai.js');
const result = await correct('i wanna go their tmrw', 'professional', 'YOUR_KEY_HERE');
console.log(result);
```

Expected: Similar corrected output.

- [ ] **Step 3: Test error cases**

```javascript
const { correct } = await import('./providers/anthropic.js');
// Bad API key
const r1 = await correct('test', 'professional', 'bad-key');
console.log(r1); // { ok: false, error: 'Invalid API key...' }

// Unknown mode
const r2 = await correct('test', 'nonexistent', 'any-key');
console.log(r2); // { ok: false, error: 'Unknown mode: nonexistent' }
```

---

## Chunk 3: Background Service Worker

### Task 9: Service Worker Message Handler

**Files:**
- Create: `background/service-worker.js`

- [ ] **Step 1: Create `background/service-worker.js`**

Listens for messages from content scripts, loads settings, routes to the correct provider.

```javascript
import { loadSettings } from '../utils/storage.js';
import { correct as correctAnthropic } from '../providers/anthropic.js';
import { correct as correctOpenai } from '../providers/openai.js';

const PROVIDERS = {
  anthropic: correctAnthropic,
  openai: correctOpenai,
};

/**
 * Handle correction requests from content scripts.
 * Message format: { type: 'correct', text: string, mode: string }
 * Response format: { ok: boolean, text?: string, error?: string }
 */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'correct') {
    handleCorrection(message).then(sendResponse);
    // Return true to indicate we'll call sendResponse asynchronously.
    return true;
  }

  if (message.type === 'healthCheck') {
    handleHealthCheck(message.ok);
    return false;
  }

  return false;
});

/**
 * Set or clear a warning badge on the extension icon.
 * @param {boolean} ok - True if selectors resolved, false if broken.
 */
function handleHealthCheck(ok) {
  if (ok) {
    chrome.action.setBadgeText({ text: '' });
  } else {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#e01e5a' });
  }
}

/**
 * @param {{ text: string, mode: string }} message
 * @returns {Promise<import('../providers/base.js').CorrectionResult>}
 */
async function handleCorrection(message) {
  const { text, mode } = message;

  if (!text || !mode) {
    return { ok: false, error: 'Missing text or mode.' };
  }

  const settings = await loadSettings();

  if (!settings.apiKey) {
    return { ok: false, error: 'No API key configured. Click the SlackCorrector icon to set one up.' };
  }

  const correctFn = PROVIDERS[settings.provider];
  if (!correctFn) {
    return { ok: false, error: `Unknown provider: ${settings.provider}` };
  }

  return correctFn(text, mode, settings.apiKey, settings.model || undefined);
}
```

- [ ] **Step 2: Reload extension and verify service worker loads**

Go to `chrome://extensions/`, click the reload button on SlackCorrector. Verify the service worker link appears and there are no errors in the console.

- [ ] **Step 3: Commit**

```bash
git add background/service-worker.js
git commit -m "feat: add background service worker message handler"
```

---

## Chunk 4: Slack Selectors & Interceptor

### Task 10: Slack DOM Selectors

**Files:**
- Create: `content/slack-selectors.js`

- [ ] **Step 1: Create `content/slack-selectors.js`**

Centralizes all Slack DOM queries. Uses fallback selectors for resilience. To find the current selectors, open Slack in Chrome, inspect the message input area, and note the relevant attributes. The selectors below are based on Slack's current (March 2026) DOM structure — update as needed.

```javascript
// Slack DOM selectors — update this file when Slack changes its markup.
// Uses multiple fallback strategies: data attributes, ARIA roles, class patterns.

(function () {
  'use strict';

  const SELECTORS = {
    // The contenteditable message input.
    // Slack uses a div[data-qa="message_input"] or div[role="textbox"] inside the composer.
    messageInput: [
      'div[data-qa="message_input"] div[contenteditable="true"]',
      'div.ql-editor[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
    ],

    // The send button.
    sendButton: [
      'button[data-qa="texty_send_button"]',
      'button[aria-label="Send"]',
      'button[aria-label="Send message"]',
    ],

    // The main composer container (NOT the edit-message composer).
    // Used to distinguish new messages from message edits.
    composerContainer: [
      'div[data-qa="message_pane_composer"]',
      'div.p-message_pane_input',
    ],

    // The edit-message composer (appears when pressing Up to edit).
    editComposer: [
      'div[data-qa="edit_message_composer"]',
      'div.p-message_editing__composer',
    ],
  };

  /**
   * Try each selector in order, return the first match or null.
   * @param {string[]} selectorList
   * @returns {Element|null}
   */
  function query(selectorList) {
    for (const sel of selectorList) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /**
   * Try each selector in order, return all matches from the first selector that finds any.
   * @param {string[]} selectorList
   * @returns {Element[]}
   */
  function queryAll(selectorList) {
    for (const sel of selectorList) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return Array.from(els);
    }
    return [];
  }

  /**
   * Check if the given input element is inside an edit composer (not a new message).
   * @param {Element} inputEl
   * @returns {boolean}
   */
  function isEditComposer(inputEl) {
    for (const sel of SELECTORS.editComposer) {
      if (inputEl.closest(sel)) return true;
    }
    return false;
  }

  /**
   * Run a health check — verify critical selectors resolve.
   * Logs warnings and sets a badge on the extension icon if selectors are broken.
   */
  function healthCheck() {
    const input = query(SELECTORS.messageInput);
    const sendBtn = query(SELECTORS.sendButton);
    const ok = Boolean(input && sendBtn);

    if (!input) {
      console.warn('[SlackCorrector] Could not find message input. Selectors may need updating.');
    }
    if (!sendBtn) {
      console.warn('[SlackCorrector] Could not find send button. Selectors may need updating.');
    }

    // Notify the service worker to set/clear the badge.
    chrome.runtime.sendMessage({ type: 'healthCheck', ok });

    return { input, sendBtn };
  }

  // Expose on the shared namespace.
  window.__slackCorrector.selectors = {
    SELECTORS,
    query,
    queryAll,
    isEditComposer,
    healthCheck,
  };

  // Run health check after a short delay (Slack may still be rendering).
  setTimeout(healthCheck, 3000);
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/slack-selectors.js
git commit -m "feat: add Slack DOM selectors with fallbacks"
```

### Task 11: Interceptor

**Files:**
- Create: `content/interceptor.js`

- [ ] **Step 1: Create `content/interceptor.js`**

Captures the send action, extracts text, sends to service worker, passes result to overlay.

```javascript
(function () {
  'use strict';

  const ns = window.__slackCorrector;

  /**
   * Extract plain text from a contenteditable element.
   * Normalizes <br> and <div> line breaks to \n.
   * @param {Element} el
   * @returns {string}
   */
  function extractText(el) {
    // innerText handles most line-break normalization, but we also
    // trim trailing whitespace per line.
    return el.innerText.replace(/\r\n/g, '\n').trim();
  }

  /**
   * Determine if a message should skip correction.
   * @param {string} text
   * @returns {boolean}
   */
  function shouldSkip(text) {
    if (text.length < 5) return true;
    if (text.startsWith('/')) return true;
    // Emoji-only: all chars are emoji or whitespace
    const emojiOnly = /^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\ufe0f]+$/u;
    if (emojiOnly.test(text)) return true;
    return false;
  }

  /**
   * Handle the send interception.
   * @param {Event} event - The keydown or click event
   * @param {Element} inputEl - The message input element
   */
  async function handleIntercept(event, inputEl) {
    // Guard: don't intercept if already active or bypassing.
    if (ns.interceptorActive || ns.bypassing || !ns.enabled) {
      return;
    }

    // Don't intercept message edits.
    const { isEditComposer } = ns.selectors;
    if (isEditComposer(inputEl)) {
      return;
    }

    const text = extractText(inputEl);
    if (shouldSkip(text)) {
      return;
    }

    // Block the send.
    event.preventDefault();
    event.stopImmediatePropagation();

    ns.interceptorActive = true;

    try {
      // Show overlay in loading state.
      ns.overlay.show(text, ns.defaultMode);

      // Send to background for correction.
      const result = await chrome.runtime.sendMessage({
        type: 'correct',
        text: text,
        mode: ns.defaultMode,
      });

      // Update overlay with result.
      ns.overlay.update(result);
    } catch (err) {
      ns.overlay.update({ ok: false, error: `Extension error: ${err.message}` });
    }
  }

  /**
   * Keydown listener — captures Enter (without Shift) on the message input.
   * Attached to document in capturing phase to fire before Slack's handlers.
   */
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey) {
      return;
    }

    const { query, SELECTORS } = ns.selectors;
    const inputEl = query(SELECTORS.messageInput);
    if (!inputEl || !inputEl.contains(document.activeElement)) {
      return;
    }

    handleIntercept(event, inputEl);
  }, true); // Capturing phase

  /**
   * Click listener — captures clicks on the send button.
   */
  document.addEventListener('click', (event) => {
    const { query, SELECTORS } = ns.selectors;
    const sendBtn = query(SELECTORS.sendButton);
    if (!sendBtn) return;

    // Check if the click target is the send button or inside it.
    if (sendBtn.contains(event.target)) {
      const inputEl = query(SELECTORS.messageInput);
      if (inputEl) {
        handleIntercept(event, inputEl);
      }
    }
  }, true); // Capturing phase

  // Load initial settings.
  chrome.storage.sync.get({ enabled: true, defaultMode: 'professional' }, (settings) => {
    ns.enabled = settings.enabled;
    ns.defaultMode = settings.defaultMode;
  });

  // Listen for settings changes.
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) ns.enabled = changes.enabled.newValue;
    if (changes.defaultMode) ns.defaultMode = changes.defaultMode.newValue;
  });
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/interceptor.js
git commit -m "feat: add send interceptor with skip rules and guard flags"
```

---

## Chunk 5: Overlay UI

### Task 12: Overlay CSS

**Files:**
- Create: `content/overlay.css`

- [ ] **Step 1: Create `content/overlay.css`**

Dark theme matching Slack's UI. The overlay is a fixed-position modal over the entire page.

```css
/* SlackCorrector overlay — injected into Slack's page */

.sc-overlay-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 999999;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.sc-overlay-modal {
  background: #222529;
  border: 1px solid #565856;
  border-radius: 12px;
  padding: 20px;
  width: 560px;
  max-width: 90vw;
  max-height: 80vh;
  overflow-y: auto;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

/* Header */
.sc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.sc-header-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sc-header-icon {
  width: 20px;
  height: 20px;
  background: #007a5a;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #1a1d21;
  font-weight: 700;
}

.sc-header-name {
  color: #d1d2d3;
  font-size: 14px;
  font-weight: 700;
}

/* Mode selector */
.sc-mode-select {
  background: #1a1d21;
  border: 1px solid #565856;
  border-radius: 6px;
  padding: 4px 10px;
  color: #ababad;
  font-size: 12px;
  cursor: pointer;
  outline: none;
}

.sc-mode-select:focus {
  border-color: #007a5a;
}

/* Section labels */
.sc-label {
  color: #ababad;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.sc-label-hint {
  color: #616061;
  font-size: 10px;
  text-transform: none;
  letter-spacing: normal;
}

/* Original message (read-only) */
.sc-original {
  margin-bottom: 12px;
}

.sc-original-text {
  color: #868686;
  font-size: 14px;
  padding: 10px 12px;
  background: #1a1d21;
  border-radius: 6px;
  border-left: 3px solid #565856;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Corrected message (editable) */
.sc-corrected {
  margin-bottom: 16px;
}

.sc-corrected-text {
  color: #d1d2d3;
  font-size: 14px;
  padding: 10px 12px;
  background: #1a1d21;
  border-radius: 6px;
  border: 1px solid #007a5a;
  outline: none;
  min-height: 40px;
  white-space: pre-wrap;
  word-break: break-word;
}

.sc-corrected-text:focus {
  border-color: #00a67e;
  box-shadow: 0 0 0 1px #00a67e;
}

/* Loading state */
.sc-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  color: #ababad;
  font-size: 14px;
  gap: 10px;
}

.sc-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid #565856;
  border-top-color: #007a5a;
  border-radius: 50%;
  animation: sc-spin 0.8s linear infinite;
}

@keyframes sc-spin {
  to { transform: rotate(360deg); }
}

/* Error state */
.sc-error {
  color: #e01e5a;
  font-size: 13px;
  padding: 10px 12px;
  background: #1a1d21;
  border-radius: 6px;
  border-left: 3px solid #e01e5a;
  margin-bottom: 16px;
}

/* Rich text warning */
.sc-rich-text-warning {
  color: #ecb22e;
  font-size: 11px;
  margin-bottom: 8px;
}

/* Action buttons */
.sc-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.sc-btn {
  padding: 7px 16px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: none;
  outline: none;
}

.sc-btn:focus-visible {
  box-shadow: 0 0 0 2px #007a5a;
}

.sc-btn-secondary {
  background: transparent;
  border: 1px solid #565856;
  color: #ababad;
}

.sc-btn-secondary:hover {
  background: #2e3136;
}

.sc-btn-primary {
  background: #007a5a;
  color: white;
  font-weight: 700;
}

.sc-btn-primary:hover {
  background: #008c68;
}

/* Shortcut hints */
.sc-shortcut {
  font-size: 10px;
  color: #616061;
  margin-left: 4px;
}
```

- [ ] **Step 2: Commit**

```bash
git add content/overlay.css
git commit -m "feat: add overlay CSS with dark theme"
```

### Task 13: Overlay JavaScript

**Files:**
- Create: `content/overlay.js`

- [ ] **Step 1: Create `content/overlay.js`**

Renders and manages the approval modal. Handles keyboard shortcuts, mode switching, text reinsertion, and send triggering.

```javascript
(function () {
  'use strict';

  const ns = window.__slackCorrector;

  const MODE_LABELS = {
    fix: 'Fix errors only',
    professional: 'Professional',
    concise: 'Concise',
    friendly: 'Friendly but polished',
  };
  const MODE_KEYS = Object.keys(MODE_LABELS);

  let backdropEl = null;
  let originalText = '';
  let currentMode = 'professional';

  /**
   * Show the overlay in loading state.
   * @param {string} text - Original message text
   * @param {string} mode - Correction mode key
   */
  function show(text, mode) {
    originalText = text;
    currentMode = mode;
    render('loading');
  }

  /**
   * Update the overlay with the correction result.
   * @param {import('../providers/base.js').CorrectionResult} result
   */
  function update(result) {
    if (result.ok) {
      render('success', result.text);
    } else {
      render('error', result.error);
    }
  }

  /**
   * Render the overlay in the given state.
   * @param {'loading'|'success'|'error'} state
   * @param {string} [content]
   */
  function render(state, content) {
    // Remove existing overlay if any.
    dismiss(false);

    // Check for rich text in original.
    const inputEl = ns.selectors.query(ns.selectors.SELECTORS.messageInput);
    const hasRichText = inputEl && inputEl.innerHTML !== inputEl.innerText.replace(/\n/g, '<br>');

    backdropEl = document.createElement('div');
    backdropEl.className = 'sc-overlay-backdrop';
    backdropEl.innerHTML = `
      <div class="sc-overlay-modal">
        <div class="sc-header">
          <div class="sc-header-title">
            <div class="sc-header-icon">✓</div>
            <span class="sc-header-name">SlackCorrector</span>
          </div>
          <select class="sc-mode-select">
            ${MODE_KEYS.map((k) => `<option value="${k}" ${k === currentMode ? 'selected' : ''}>${MODE_LABELS[k]}</option>`).join('')}
          </select>
        </div>

        <div class="sc-original">
          <div class="sc-label">Original</div>
          <div class="sc-original-text">${escapeHtml(originalText)}</div>
        </div>

        ${hasRichText ? '<div class="sc-rich-text-warning">Note: formatting will be simplified to plain text.</div>' : ''}

        <div class="sc-content">
          ${renderContent(state, content)}
        </div>

        <div class="sc-actions">
          <button class="sc-btn sc-btn-secondary" data-action="original">
            Send Original <span class="sc-shortcut">⌘⇧↵</span>
          </button>
          <button class="sc-btn sc-btn-secondary" data-action="cancel">
            Cancel <span class="sc-shortcut">Esc</span>
          </button>
          ${state === 'success' ? `
            <button class="sc-btn sc-btn-primary" data-action="corrected">
              Send Corrected <span class="sc-shortcut">⌘↵</span>
            </button>
          ` : ''}
        </div>
      </div>
    `;

    document.body.appendChild(backdropEl);

    // Focus the editable area if in success state.
    if (state === 'success') {
      const correctedEl = backdropEl.querySelector('.sc-corrected-text');
      if (correctedEl) correctedEl.focus();
    }

    // Event listeners.
    backdropEl.addEventListener('click', handleClick);
    backdropEl.querySelector('.sc-mode-select').addEventListener('change', handleModeChange);
    document.addEventListener('keydown', handleKeydown);
  }

  /**
   * Render the content area based on state.
   */
  function renderContent(state, content) {
    if (state === 'loading') {
      return `<div class="sc-loading"><div class="sc-spinner"></div> Correcting...</div>`;
    }
    if (state === 'error') {
      return `<div class="sc-error">${escapeHtml(content)}</div>`;
    }
    // success
    return `
      <div class="sc-corrected">
        <div class="sc-label">Corrected <span class="sc-label-hint">(editable)</span></div>
        <div class="sc-corrected-text" contenteditable="true">${escapeHtml(content)}</div>
      </div>
    `;
  }

  /**
   * Handle button clicks in the overlay.
   */
  function handleClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'corrected') {
      const correctedEl = backdropEl.querySelector('.sc-corrected-text');
      sendToSlack(correctedEl.innerText.trim());
    } else if (action === 'original') {
      sendToSlack(originalText);
    } else if (action === 'cancel') {
      dismiss(true);
    }
  }

  /**
   * Handle keyboard shortcuts while overlay is open.
   */
  function handleKeydown(event) {
    if (!backdropEl) return;

    // Esc → cancel
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      dismiss(true);
      return;
    }

    // Cmd/Ctrl+Enter → send corrected
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const correctedEl = backdropEl.querySelector('.sc-corrected-text');
      if (correctedEl) {
        sendToSlack(correctedEl.innerText.trim());
      }
      return;
    }

    // Cmd/Ctrl+Shift+Enter → send original
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      sendToSlack(originalText);
      return;
    }

    // Tab → cycle modes (only if not focused on editable area)
    if (event.key === 'Tab' && document.activeElement?.className !== 'sc-corrected-text') {
      event.preventDefault();
      const select = backdropEl.querySelector('.sc-mode-select');
      const idx = MODE_KEYS.indexOf(select.value);
      select.value = MODE_KEYS[(idx + 1) % MODE_KEYS.length];
      select.dispatchEvent(new Event('change'));
    }
  }

  /**
   * Handle mode dropdown change — re-trigger correction.
   */
  async function handleModeChange(event) {
    currentMode = event.target.value;
    ns.defaultMode = currentMode;

    // Show loading and re-correct.
    const contentArea = backdropEl.querySelector('.sc-content');
    contentArea.innerHTML = renderContent('loading');

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'correct',
        text: originalText,
        mode: currentMode,
      });

      contentArea.innerHTML = renderContent(result.ok ? 'success' : 'error', result.ok ? result.text : result.error);

      // Re-add send button if it was removed during loading.
      const actionsEl = backdropEl.querySelector('.sc-actions');
      const existingPrimary = actionsEl.querySelector('[data-action="corrected"]');
      if (result.ok && !existingPrimary) {
        const btn = document.createElement('button');
        btn.className = 'sc-btn sc-btn-primary';
        btn.dataset.action = 'corrected';
        btn.innerHTML = 'Send Corrected <span class="sc-shortcut">⌘↵</span>';
        actionsEl.appendChild(btn);
      } else if (!result.ok && existingPrimary) {
        existingPrimary.remove();
      }

      if (result.ok) {
        const correctedEl = backdropEl.querySelector('.sc-corrected-text');
        if (correctedEl) correctedEl.focus();
      }
    } catch (err) {
      contentArea.innerHTML = renderContent('error', `Extension error: ${err.message}`);
    }
  }

  /**
   * Insert text into Slack's input and trigger send.
   * @param {string} text
   */
  function sendToSlack(text) {
    const { query, SELECTORS } = ns.selectors;
    const inputEl = query(SELECTORS.messageInput);
    const sendBtn = query(SELECTORS.sendButton);

    if (!inputEl) {
      console.error('[SlackCorrector] Cannot find message input to send.');
      dismiss(true);
      return;
    }

    // 1. Focus the input.
    inputEl.focus();

    // 2. Select all content within the input (using Range API for precision —
    //    execCommand('selectAll') could select content outside the input).
    const range = document.createRange();
    range.selectNodeContents(inputEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    // 3. Insert corrected text via execCommand (syncs React/Quill state).
    //    Fallback to innerHTML + synthetic InputEvent if execCommand fails
    //    (execCommand is deprecated but still widely supported as of 2026).
    const inserted = document.execCommand('insertText', false, text);
    if (!inserted) {
      // Fallback: set innerHTML directly and dispatch a synthetic InputEvent
      // with bubbles:true so React's delegated event system sees it.
      inputEl.innerHTML = '';
      inputEl.textContent = text;
      inputEl.dispatchEvent(new InputEvent('input', {
        inputType: 'insertText',
        data: text,
        bubbles: true,
        cancelable: true,
      }));
    }

    // 4. Set bypass flag so interceptor lets the send through.
    ns.bypassing = true;

    // 5. Dismiss the overlay.
    dismiss(false);

    // 6. Trigger send via button click (preferred) or synthetic Enter.
    if (sendBtn) {
      sendBtn.click();
    } else {
      // Fallback: synthetic Enter keydown.
      inputEl.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        bubbles: true,
        cancelable: true,
      }));
    }

    // 7. Clear bypass flag after event propagation completes.
    setTimeout(() => {
      ns.bypassing = false;
      ns.interceptorActive = false;
    }, 0);
  }

  /**
   * Remove the overlay from the DOM.
   * @param {boolean} restoreFocus - If true, focus back to Slack's input.
   */
  function dismiss(restoreFocus) {
    if (backdropEl) {
      document.removeEventListener('keydown', handleKeydown);
      backdropEl.remove();
      backdropEl = null;
    }

    if (restoreFocus) {
      ns.interceptorActive = false;
      const inputEl = ns.selectors.query(ns.selectors.SELECTORS.messageInput);
      if (inputEl) inputEl.focus();
    }
  }

  /**
   * Escape HTML to prevent XSS in overlay content.
   * @param {string} str
   * @returns {string}
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Expose on namespace.
  ns.overlay = { show, update };
})();
```

- [ ] **Step 2: Commit**

```bash
git add content/overlay.js
git commit -m "feat: add overlay UI with editable preview and keyboard shortcuts"
```

### Task 14: Test overlay + interceptor on Slack

- [ ] **Step 1: Reload extension and open Slack**

1. Go to `chrome://extensions/` and reload SlackCorrector
2. Open `app.slack.com` in a new tab
3. Open browser devtools on the Slack tab (F12)
4. Check console for any errors or health check warnings from SlackCorrector

- [ ] **Step 2: Configure an API key**

In the service worker console (from extensions page), temporarily set a key:

```javascript
chrome.storage.sync.set({ apiKey: 'YOUR_KEY_HERE', provider: 'anthropic' });
```

- [ ] **Step 3: Test the interception flow**

1. Type a message in Slack: `hey can u send me the report tmrw, been super busy lol`
2. Press Enter
3. Expected: The overlay appears with loading spinner, then shows the corrected text
4. Edit the corrected text if desired
5. Press Cmd+Enter to send the corrected version
6. Verify the message appears in Slack with the corrected text

- [ ] **Step 4: Test skip rules**

- Type `ok` and press Enter → should send immediately (< 5 chars)
- Type `/status` and press Enter → should send immediately (slash command)
- Type a single emoji and press Enter → should send immediately

- [ ] **Step 5: Test cancel and send original**

- Type a message, press Enter, then press Esc → overlay dismissed, message NOT sent
- Type a message, press Enter, then press Cmd+Shift+Enter → original text sent unchanged

---

## Chunk 6: Settings Popup

### Task 15: Popup HTML & CSS

**Files:**
- Create: `popup/popup.html`
- Create: `popup/popup.css`

- [ ] **Step 1: Create `popup/popup.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div class="sc-popup">
    <div class="sc-popup-header">
      <div class="sc-popup-icon">✓</div>
      <h1>SlackCorrector</h1>
    </div>

    <div class="sc-field">
      <label for="enabled">
        <input type="checkbox" id="enabled" checked>
        Enabled
      </label>
    </div>

    <div class="sc-field">
      <label for="provider">Provider</label>
      <select id="provider">
        <option value="anthropic">Claude (Anthropic)</option>
        <option value="openai">OpenAI</option>
      </select>
    </div>

    <div class="sc-field">
      <label for="apiKey">API Key</label>
      <input type="password" id="apiKey" placeholder="Enter your API key">
    </div>

    <div class="sc-field">
      <label for="model">Model (optional)</label>
      <input type="text" id="model" placeholder="Leave blank for default">
      <div class="sc-hint" id="modelHint">Default: claude-sonnet-4-20250514</div>
    </div>

    <div class="sc-field">
      <label for="defaultMode">Default Correction Mode</label>
      <select id="defaultMode">
        <option value="fix">Fix errors only</option>
        <option value="professional">Professional</option>
        <option value="concise">Concise</option>
        <option value="friendly">Friendly but polished</option>
      </select>
    </div>

    <div class="sc-actions">
      <button id="save" class="sc-btn-primary">Save</button>
      <button id="test" class="sc-btn-secondary">Test API Key</button>
    </div>

    <div id="status" class="sc-status"></div>
  </div>

  <script src="popup.js" type="module"></script>
</body>
</html>
```

- [ ] **Step 2: Create `popup/popup.css`**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 320px;
  background: #1a1d21;
  color: #d1d2d3;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 13px;
}

.sc-popup {
  padding: 16px;
}

.sc-popup-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid #565856;
}

.sc-popup-icon {
  width: 24px;
  height: 24px;
  background: #007a5a;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #1a1d21;
  font-weight: 700;
}

h1 {
  font-size: 15px;
  font-weight: 700;
}

.sc-field {
  margin-bottom: 12px;
}

.sc-field label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
  color: #ababad;
}

.sc-field input[type="text"],
.sc-field input[type="password"],
.sc-field select {
  width: 100%;
  padding: 6px 10px;
  background: #222529;
  border: 1px solid #565856;
  border-radius: 6px;
  color: #d1d2d3;
  font-size: 13px;
  outline: none;
}

.sc-field input:focus,
.sc-field select:focus {
  border-color: #007a5a;
}

.sc-field input[type="checkbox"] {
  margin-right: 6px;
  accent-color: #007a5a;
}

.sc-hint {
  font-size: 11px;
  color: #616061;
  margin-top: 3px;
}

.sc-actions {
  display: flex;
  gap: 8px;
  margin-top: 16px;
}

.sc-btn-primary,
.sc-btn-secondary {
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: none;
  outline: none;
}

.sc-btn-primary {
  background: #007a5a;
  color: white;
  font-weight: 700;
  flex: 1;
}

.sc-btn-primary:hover {
  background: #008c68;
}

.sc-btn-secondary {
  background: transparent;
  border: 1px solid #565856;
  color: #ababad;
  flex: 1;
}

.sc-btn-secondary:hover {
  background: #2e3136;
}

.sc-status {
  margin-top: 12px;
  padding: 8px 10px;
  border-radius: 6px;
  font-size: 12px;
  display: none;
}

.sc-status.success {
  display: block;
  background: rgba(0, 122, 90, 0.2);
  color: #00a67e;
  border: 1px solid #007a5a;
}

.sc-status.error {
  display: block;
  background: rgba(224, 30, 90, 0.2);
  color: #e01e5a;
  border: 1px solid #e01e5a;
}
```

- [ ] **Step 3: Commit**

```bash
git add popup/popup.html popup/popup.css
git commit -m "feat: add settings popup HTML and CSS"
```

### Task 16: Popup JavaScript

**Files:**
- Create: `popup/popup.js`

- [ ] **Step 1: Create `popup/popup.js`**

```javascript
import { loadSettings, saveSettings, DEFAULTS } from '../utils/storage.js';

const DEFAULT_MODELS = {
  anthropic: 'claude-sonnet-4-20250514',
  openai: 'gpt-4o-mini',
};

const els = {
  enabled: document.getElementById('enabled'),
  provider: document.getElementById('provider'),
  apiKey: document.getElementById('apiKey'),
  model: document.getElementById('model'),
  modelHint: document.getElementById('modelHint'),
  defaultMode: document.getElementById('defaultMode'),
  save: document.getElementById('save'),
  test: document.getElementById('test'),
  status: document.getElementById('status'),
};

/**
 * Load settings and populate the form.
 */
async function init() {
  const settings = await loadSettings();

  els.enabled.checked = settings.enabled;
  els.provider.value = settings.provider;
  els.apiKey.value = settings.apiKey;
  els.model.value = settings.model;
  els.defaultMode.value = settings.defaultMode;

  updateModelHint();
}

/**
 * Update the model hint text based on selected provider.
 */
function updateModelHint() {
  const provider = els.provider.value;
  els.modelHint.textContent = `Default: ${DEFAULT_MODELS[provider] || 'unknown'}`;
}

/**
 * Show a status message.
 * @param {string} text
 * @param {'success'|'error'} type
 */
function showStatus(text, type) {
  els.status.textContent = text;
  els.status.className = `sc-status ${type}`;

  // Auto-hide after 5 seconds.
  setTimeout(() => {
    els.status.className = 'sc-status';
  }, 5000);
}

/**
 * Save settings.
 */
async function handleSave() {
  const updates = {
    enabled: els.enabled.checked,
    provider: els.provider.value,
    apiKey: els.apiKey.value.trim(),
    model: els.model.value.trim(),
    defaultMode: els.defaultMode.value,
  };

  try {
    await saveSettings(updates);
    showStatus('Settings saved.', 'success');
  } catch (err) {
    showStatus(`Failed to save: ${err.message}`, 'error');
  }
}

/**
 * Test the API key by making a lightweight correction call.
 */
async function handleTest() {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    showStatus('Enter an API key first.', 'error');
    return;
  }

  els.test.disabled = true;
  els.test.textContent = 'Testing...';

  try {
    // Save current settings first so the service worker uses them.
    await saveSettings({
      provider: els.provider.value,
      apiKey: apiKey,
      model: els.model.value.trim(),
    });

    // Send a test correction via the service worker.
    const result = await chrome.runtime.sendMessage({
      type: 'correct',
      text: 'this is a test',
      mode: 'fix',
    });

    if (result.ok) {
      showStatus(`API key works! Response: "${result.text}"`, 'success');
    } else {
      showStatus(`API error: ${result.error}`, 'error');
    }
  } catch (err) {
    showStatus(`Test failed: ${err.message}`, 'error');
  } finally {
    els.test.disabled = false;
    els.test.textContent = 'Test API Key';
  }
}

// Event listeners.
els.save.addEventListener('click', handleSave);
els.test.addEventListener('click', handleTest);
els.provider.addEventListener('change', updateModelHint);

// Initialize.
init();
```

- [ ] **Step 2: Commit**

```bash
git add popup/popup.js
git commit -m "feat: add settings popup JavaScript with API key validation"
```

### Task 17: Test the settings popup

- [ ] **Step 1: Reload and open popup**

1. Reload the extension at `chrome://extensions/`
2. Click the SlackCorrector icon in the toolbar
3. Expected: Settings popup appears with the dark theme

- [ ] **Step 2: Test save flow**

1. Select a provider (e.g. Anthropic)
2. Enter a valid API key
3. Select "Professional" mode
4. Click Save
5. Expected: "Settings saved." success message appears
6. Close and reopen the popup — settings should persist

- [ ] **Step 3: Test API key validation**

1. Enter a valid API key and click "Test API Key"
2. Expected: "API key works!" with a corrected version of "this is a test"
3. Enter an invalid key and click "Test API Key"
4. Expected: Error message about invalid API key

---

## Chunk 7: Integration Testing & Final Polish

### Task 18: End-to-end manual test

- [ ] **Step 1: Full flow test**

1. Open `app.slack.com`
2. Configure a valid API key via the popup
3. Type: `hey can u send me that thing we were talking abt yesterday, its kinda urgent lol`
4. Press Enter
5. Expected: Overlay appears → loading → corrected text shown
6. Review the correction, optionally edit it
7. Press Cmd+Enter
8. Expected: Corrected text appears as a sent message in Slack

- [ ] **Step 2: Test all modes**

For each mode (Fix errors only, Professional, Concise, Friendly), use the mode dropdown in the overlay and verify the correction style changes appropriately:

- **Fix errors only**: Should only fix grammar/spelling, not change tone
- **Professional**: Should fix errors + make it formal
- **Concise**: Should shorten aggressively
- **Friendly but polished**: Should keep warm tone but fix errors

- [ ] **Step 3: Test edge cases**

| Test | Input | Expected |
|------|-------|----------|
| Short message | `ok` | Sends immediately, no overlay |
| Slash command | `/status away` | Sends immediately, no overlay |
| Emoji only | `👍🎉` | Sends immediately, no overlay |
| Cancel | Type message → Enter → Esc | Overlay dismissed, nothing sent |
| Send original | Type message → Enter → Cmd+Shift+Enter | Original text sent |
| Disable extension | Toggle off in popup, type message → Enter | Sends immediately, no overlay |
| No API key | Remove API key, type message → Enter | Overlay shows error with setup instructions |
| Thread message | Open a thread, type message → Enter | Overlay appears (same behavior as main channel) |

- [ ] **Step 4: Test mode switching in overlay**

1. Type a message and press Enter
2. After correction appears, change the mode dropdown from "Professional" to "Concise"
3. Expected: Loading spinner briefly, then a new shorter correction appears
4. Press Cmd+Enter to send

### Task 19: Final commit & verify

- [ ] **Step 1: Verify all files are committed**

```bash
git status
```

Expected: Clean working tree with no untracked files (except `.superpowers/` which is gitignored).

- [ ] **Step 2: Verify file structure matches spec**

```bash
find . -not -path './.git/*' -not -path './.superpowers/*' -not -name '.DS_Store' | sort
```

Expected output should match:
```
.
./.gitignore
./background
./background/service-worker.js
./content
./content/interceptor.js
./content/namespace.js
./content/overlay.css
./content/overlay.js
./content/slack-selectors.js
./docs
./docs/superpowers
./docs/superpowers/plans
./docs/superpowers/plans/2026-03-14-slackcorrector.md
./docs/superpowers/specs
./docs/superpowers/specs/2026-03-14-slackcorrector-design.md
./icons
./icons/icon-128.png
./icons/icon-16.png
./icons/icon-48.png
./manifest.json
./popup
./popup/popup.css
./popup/popup.html
./popup/popup.js
./providers
./providers/anthropic.js
./providers/base.js
./providers/openai.js
./utils
./utils/storage.js
```
