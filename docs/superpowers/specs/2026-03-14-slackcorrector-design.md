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
   - Maintains a boolean `interceptorActive` guard flag — if the overlay is already open or a correction is in-flight, ignores subsequent send attempts (debounce)
   - Extracts message text from Slack's `contenteditable` input via `element.innerText` (normalizes `<br>`/`<div>` line breaks to `\n` for consistent multi-line handling)
   - Skips interception for message edits (Up arrow editing) — only intercepts new message sends
   - Sends text + correction mode to background service worker via `chrome.runtime.sendMessage`
   - Passes corrected text to the overlay component

2. **Content Script — Overlay** (`content/overlay.js`, `content/overlay.css`)
   - Renders a modal overlay on top of Slack's UI (dimmed background)
   - Shows original message (read-only) and corrected message (editable `contenteditable` div)
   - Mode dropdown in header to switch correction level on the fly (re-triggers LLM call)
   - Loading spinner while waiting for LLM response
   - Three actions:
     - **Send Corrected** (Cmd/Ctrl+Enter) — writes corrected text back into Slack's input, triggers send
     - **Send Original** (Cmd/Ctrl+Shift+Enter) — lets original through unchanged
     - **Cancel** (Esc) — dismisses overlay, returns focus to input, no send
   - Keyboard shortcuts: Cmd/Ctrl+Enter (send corrected), Esc (cancel), Cmd/Ctrl+Shift+Enter (send original), Tab (cycle modes)
   - Note: plain Enter inserts a newline in the editable preview area; Cmd/Ctrl+Enter is required to send, avoiding conflict

3. **Content Script — Selectors** (`content/slack-selectors.js`)
   - Centralizes all Slack DOM selectors (message input, send button, thread containers)
   - Uses multiple fallback selectors (class-based, role-based, data-attribute-based)
   - Runs a health check on page load: verifies key selectors resolve, logs console warning and shows a badge on the extension icon if they don't
   - Single file to update when Slack changes its DOM

4. **Content Script — Communication** (`content/namespace.js`)
   - Content scripts run in classic (non-module) scope since `"type": "module"` only applies to the service worker
   - Defines a shared `window.__slackCorrector` namespace object used by all content scripts to communicate
   - Loaded first in the manifest's `js` array so other scripts can attach to it

4. **Background Service Worker** (`background/service-worker.js`)
   - Listens for messages from content script
   - Loads API key and provider from `chrome.storage.sync`
   - Routes to the appropriate provider module
   - Returns corrected text or error to content script

5. **Provider Modules** (`providers/`)
   - `base.js` — Shared interface and system prompts per mode
   - `anthropic.js` — Claude Messages API integration (default model: `claude-sonnet-4-20250514`)
   - `openai.js` — OpenAI Chat Completions API integration (default model: `gpt-4o-mini`)
   - All implement: `correct(text, mode, apiKey, model?) → correctedText`
   - Model is configurable in settings; defaults are chosen for speed + cost balance on short messages

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
         ├─ User clicks "Send Corrected" (Cmd/Ctrl+Enter)
         │    → Write corrected text to input → trigger Slack send
         │
         ├─ User clicks "Send Original" (Cmd/Ctrl+Shift+Enter)
         │    → Restore original text → trigger Slack send
         │
         └─ User clicks "Cancel" (Esc)
              → Dismiss overlay, restore focus to input, no send
```

## Reinserting Text & Triggering Send

Slack uses a React-controlled `contenteditable` (likely Quill or a custom rich-text editor). Directly setting `innerText` will NOT sync React's internal state — Slack would still send the original text. The correct approach:

After the user approves:
1. Focus Slack's `contenteditable` input
2. Select all content (`document.execCommand('selectAll')` or `Selection` API)
3. Insert the corrected text via `document.execCommand('insertText', false, correctedText)` — this fires the internal `input` events that React/Quill listens to, updating the framework's state to match the visible DOM
4. Trigger send by programmatically clicking Slack's send button element (found via selectors) — this is more reliable than synthetic `Enter` keypress events, which have `isTrusted=false` and may be ignored by Slack's handlers
5. **Re-interception guard**: before step 4, set `window.__slackCorrector.bypassing = true`. The interceptor checks this flag and lets the event through. Clear the flag in a `setTimeout(0)` macrotask after the click (not a microtask — the macrotask ensures Slack's event handlers finish propagating before the flag is cleared).

**Fallback**: if `document.execCommand('insertText')` stops working (it's deprecated but still widely supported), fall back to setting `innerHTML` and dispatching synthetic `InputEvent` with `inputType: 'insertText'`. This is less reliable but serves as a safety net.

## Settings Storage

Uses `chrome.storage.sync` — encrypted at rest by Chrome, syncs across devices via Google account.

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `provider` | `"anthropic" \| "openai"` | `"anthropic"` | |
| `apiKey` | `string` | `""` | |
| `model` | `string` | `""` (uses provider default) | Optional override, e.g. `claude-haiku-4-5-20251001` |
| `defaultMode` | `"fix" \| "professional" \| "concise" \| "friendly"` | `"professional"` | Maps to display names: "Fix errors only", "Professional", "Concise", "Friendly but polished" |
| `enabled` | `boolean` | `true` | |

## File Structure

```
slackcorrector/
├── manifest.json
├── background/
│   └── service-worker.js
├── content/
│   ├── namespace.js
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

## Edge Cases

- **Rich text**: If user types bold/links/code blocks, corrected text is plain text only. Overlay notes "formatting will be simplified" when rich text is detected.
- **Threads vs. main channel**: Same input component, interception works in both contexts.
- **Slash commands & emoji-only**: Skip interception, let through unchanged.
- **Short messages** (< 5 chars): Skip correction — not worth an API call.
- **Message edits**: When user presses Up arrow to edit a previous message, skip interception. Detect by checking if the active input is Slack's edit composer vs. the main/thread composer.
- **Rapid send attempts**: Guard flag (`interceptorActive`) prevents multiple overlays or concurrent LLM calls. Subsequent Enter presses while overlay is open are ignored.
- **Slack DOM updates**: Fail gracefully (send original if selectors fail), log console warning. Health check on page load verifies selectors resolve.
- **LLM latency**: 1-3 second round-trip. Show loading spinner in overlay.
- **API errors**: Invalid key → inline error with link to settings. Rate limit / network failure / timeout → option to send original.
- **No network**: `fetch` failure caught the same as timeout — show error in overlay with "Send Original" option.
- **Re-interception guard**: Uses `window.__slackCorrector.bypassing` flag, cleared via `setTimeout(0)` after programmatic send.

## CORS & API Access

API calls are made from the background service worker, not from content scripts or web pages. Manifest V3 service workers make `fetch` requests from the extension's own origin, and `host_permissions` in the manifest grant cross-origin access to the API endpoints. This bypasses CORS entirely — no `Access-Control-Allow-Origin` headers are needed from the API servers.

For the Anthropic API specifically, the `anthropic-dangerous-direct-browser-access: true` header is NOT required when calling from a service worker (it's only needed for browser-context `fetch` from web pages). The service worker context is treated as a server-side caller.

**Service worker lifecycle**: Manifest V3 service workers are ephemeral (terminated after ~30s of inactivity). However, an active `fetch` call keeps the service worker alive for its duration. Since LLM calls for short messages complete in 1-3 seconds, this is not a concern. If future changes introduce longer calls, use `chrome.runtime.Port` keepalive as a mitigation.

## Security

- API keys stored in `chrome.storage.sync` — encrypted at rest, not accessible to web pages
- Messages sent directly to LLM provider from service worker — no intermediary server
- Content scripts run in Chrome's isolated world — not affected by Slack's Content Security Policy
- Content script sandboxed to `app.slack.com` only
- No data retention beyond what the LLM provider does per their policies

## Non-Goals (v1)

- Multi-platform support (Teams, Discord, Gmail)
- Backend proxy service
- Message history / analytics
- Slack desktop app support (web only)
- Rich text preservation through correction
