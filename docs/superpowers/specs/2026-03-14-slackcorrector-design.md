# SlackCorrector — Browser Extension Design Spec

## Overview

A Chrome browser extension that intercepts Slack messages before sending, routes them through an LLM for grammar correction and professional tone adjustment, and presents an editable preview for user approval before the message is actually sent.

## Goals

- Intercept Slack's send action transparently
- Provide multiple correction modes (fix errors, professional, concise, friendly)
- Support Claude and OpenAI as configurable LLM providers
- Give the user full control via an editable preview overlay
- No backend infrastructure — runs entirely in the browser

## Architecture

### Component Overview

```
┌─────────────────────────────────────────┐
│  Slack Web App (app.slack.com)           │
│                                         │
│  ┌─────────────┐    ┌────────────────┐  │
│  │ interceptor  │───▶│   overlay      │  │
│  │ (captures    │    │ (approval UI)  │  │
│  │  send event) │    │                │  │
│  └──────┬───────┘    └───────▲────────┘  │
│         │                    │           │
└─────────┼────────────────────┼───────────┘
          │ chrome.runtime     │
          │ .sendMessage       │ response
          ▼                    │
┌─────────────────────────────────────────┐
│  Background Service Worker              │
│                                         │
│  ┌──────────┐  ┌──────────────────────┐ │
│  │ storage   │  │ providers/           │ │
│  │ (api key, │  │  ├─ base.js          │ │
│  │  prefs)   │  │  ├─ anthropic.js     │ │
│  │           │  │  └─ openai.js        │ │
│  └──────────┘  └──────────────────────┘ │
└─────────────────────────────────────────┘
```

### Components

1. **Content Script — Interceptor** (`content/interceptor.js`)
   - Injected into `app.slack.com`
   - Listens for `keydown` (Enter without Shift) and click on send button in capturing phase
   - Calls `event.preventDefault()` + `event.stopImmediatePropagation()` to block Slack's handler
   - Extracts message text from Slack's `contenteditable` input via `element.innerText`
   - Sends text + correction mode to background service worker via `chrome.runtime.sendMessage`
   - Passes corrected text to the overlay component

2. **Content Script — Overlay** (`content/overlay.js`, `content/overlay.css`)
   - Renders a modal overlay on top of Slack's UI (dimmed background)
   - Shows original message (read-only) and corrected message (editable `contenteditable` div)
   - Mode dropdown in header to switch correction level on the fly (re-triggers LLM call)
   - Loading spinner while waiting for LLM response
   - Three actions:
     - **Send Corrected** (Enter) — writes corrected text back into Slack's input, triggers send
     - **Send Original** (Cmd+Shift+Enter) — lets original through unchanged
     - **Cancel** (Esc) — dismisses overlay, returns focus to input, no send
   - Keyboard shortcuts: Enter, Esc, Cmd+Shift+Enter, Tab (cycle modes)

3. **Content Script — Selectors** (`content/slack-selectors.js`)
   - Centralizes all Slack DOM selectors (message input, send button, thread containers)
   - Uses multiple fallback selectors (class-based, role-based, data-attribute-based)
   - Logs console warning if expected elements aren't found
   - Single file to update when Slack changes its DOM

4. **Background Service Worker** (`background/service-worker.js`)
   - Listens for messages from content script
   - Loads API key and provider from `chrome.storage.sync`
   - Routes to the appropriate provider module
   - Returns corrected text or error to content script

5. **Provider Modules** (`providers/`)
   - `base.js` — Shared interface and system prompts per mode
   - `anthropic.js` — Claude Messages API integration
   - `openai.js` — OpenAI Chat Completions API integration
   - All implement: `correct(text, mode, apiKey) → correctedText`

6. **Popup/Options** (`popup/`)
   - Settings UI accessible from extension icon
   - Provider selector (Claude / OpenAI)
   - API key input with validation (test call on save)
   - Default correction mode selector
   - Enable/disable toggle

## Correction Modes

| Mode | System Prompt Behavior |
|------|----------------------|
| **Fix errors only** | Fix grammar, spelling, and punctuation. Do not change tone, word choice, or sentence structure. Return only the corrected text. |
| **Professional** | Fix all errors and rephrase for a professional tone. Remove slang, tighten wording, preserve meaning. Return only the corrected text. |
| **Concise** | Fix errors, make it professional, and shorten aggressively. Remove filler words and unnecessary phrases. Return only the corrected text. |
| **Friendly but polished** | Fix errors and ensure the message reads clearly, but keep a warm and friendly tone. Return only the corrected text. |

## Interception Flow

```
User types message in Slack
         │
         ▼
User presses Enter (or clicks send)
         │
         ▼
Interceptor captures event (capturing phase)
         │
         ├─ Message starts with "/" (slash command)? → Let through, skip
         ├─ Message is only emoji? → Let through, skip
         ├─ Message < 5 characters? → Let through, skip
         │
         ▼
preventDefault + stopImmediatePropagation
         │
         ▼
Extract text from contenteditable input
         │
         ▼
Send to background service worker
         │
         ▼
Service worker calls LLM provider
         │
         ▼
Show overlay with loading spinner → then corrected text
         │
         ├─ User clicks "Send Corrected" (Enter)
         │    → Write corrected text to input → trigger Slack send
         │
         ├─ User clicks "Send Original" (Cmd+Shift+Enter)
         │    → Restore original text → trigger Slack send
         │
         └─ User clicks "Cancel" (Esc)
              → Dismiss overlay, restore focus to input, no send
```

## Reinserting Text & Triggering Send

After the user approves:
1. Set `innerText` on Slack's `contenteditable` input to the chosen text
2. Dispatch synthetic `input` event to sync Slack's React state
3. Dispatch synthetic `Enter` keydown event to trigger Slack's send handler
4. The interceptor must temporarily disable itself to avoid re-intercepting this synthetic send

## Settings Storage

Uses `chrome.storage.sync` — encrypted at rest by Chrome, syncs across devices via Google account.

| Key | Type | Default |
|-----|------|---------|
| `provider` | `"anthropic" \| "openai"` | `"anthropic"` |
| `apiKey` | `string` | `""` |
| `defaultMode` | `"fix" \| "professional" \| "concise" \| "friendly"` | `"professional"` |
| `enabled` | `boolean` | `true` |

## File Structure

```
slackcorrector/
├── manifest.json
├── background/
│   └── service-worker.js
├── content/
│   ├── interceptor.js
│   ├── overlay.js
│   ├── overlay.css
│   └── slack-selectors.js
├── providers/
│   ├── base.js
│   ├── anthropic.js
│   └── openai.js
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
└── utils/
    └── storage.js
```

## Manifest V3

```json
{
  "manifest_version": 3,
  "name": "SlackCorrector",
  "version": "1.0.0",
  "description": "Grammar check and professional tone correction for Slack messages",
  "permissions": ["activeTab", "storage"],
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

## Edge Cases

- **Rich text**: If user types bold/links/code blocks, corrected text is plain text only. Overlay notes "formatting will be simplified" when rich text is detected.
- **Threads vs. main channel**: Same input component, interception works in both contexts.
- **Slash commands & emoji-only**: Skip interception, let through unchanged.
- **Short messages** (< 5 chars): Skip correction — not worth an API call.
- **Slack DOM updates**: Fail gracefully (send original if selectors fail), log console warning.
- **LLM latency**: 1-3 second round-trip. Show loading spinner in overlay.
- **API errors**: Invalid key → inline error with link to settings. Rate limit / timeout → option to send original.
- **Re-interception guard**: When programmatically triggering send after approval, temporarily disable the interceptor to avoid an infinite loop.

## Security

- API keys stored in `chrome.storage.sync` — encrypted at rest, not accessible to web pages
- Messages sent directly to LLM provider — no intermediary server
- Content script sandboxed to `app.slack.com` only
- No data retention beyond what the LLM provider does per their policies

## Non-Goals (v1)

- Multi-platform support (Teams, Discord, Gmail)
- Backend proxy service
- Message history / analytics
- Slack desktop app support (web only)
- Rich text preservation through correction
