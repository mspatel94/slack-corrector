# SlackCorrector

A Chrome extension that intercepts your Slack messages before sending, checks grammar and tone using an LLM (Claude or GPT), and shows an inline suggestion banner with a word-level diff — so you always sound professional.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-green?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## How It Works

1. Type a message in Slack and press **Enter**
2. SlackCorrector intercepts the send, calls your chosen LLM for correction
3. An inline suggestion banner appears above the composer showing:
   - The corrected text (editable — click to revise)
   - A word-level redline diff (deletions in red, additions in green)
4. Press **Tab** to accept, **Esc** to dismiss and send original

The extension also scrapes the last 5 messages in the conversation for context, so corrections are accurate and contextually appropriate.

## Correction Modes

| Mode | What it does |
|------|-------------|
| **Fix errors only** | Fixes grammar, spelling, punctuation. Doesn't change tone. |
| **Professional** | Fixes errors + rephrases for professional tone. |
| **Concise** | Fixes errors, makes it professional, shortens aggressively. |
| **Friendly but polished** | Fixes errors, keeps warm tone, ensures clarity. |

## Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/mspatel94/slack-corrector.git
   ```
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked** and select the cloned `slack-corrector` directory
5. Click the SlackCorrector icon in the toolbar and configure:
   - Select your LLM provider (Claude or OpenAI)
   - Enter your API key
   - Choose a default correction mode

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| **Tab** | Accept the corrected suggestion |
| **Esc** | Dismiss suggestion, keep original |

## Project Structure

```
slack-corrector/
├── manifest.json              # Chrome Extension Manifest V3
├── background/
│   └── service-worker.js      # Routes correction requests to LLM providers
├── content/
│   ├── namespace.js           # Shared state for content scripts
│   ├── slack-selectors.js     # Slack DOM selectors with fallbacks
│   ├── interceptor.js         # Captures send events, extracts text
│   ├── overlay.js             # Inline suggestion banner with diff
│   └── overlay.css            # Banner styling (light theme)
├── providers/
│   ├── base.js                # System prompts and shared interface
│   ├── anthropic.js           # Claude API integration
│   └── openai.js              # OpenAI API integration
├── popup/
│   ├── popup.html             # Settings UI
│   ├── popup.js               # Settings logic with API key validation
│   └── popup.css              # Settings styling
├── icons/                     # Extension icons
└── utils/
    └── storage.js             # Chrome storage helpers
```

## Configuration

All settings are stored in `chrome.storage.sync` and sync across devices:

| Setting | Description | Default |
|---------|-------------|---------|
| Provider | Claude (Anthropic) or OpenAI | Anthropic |
| API Key | Your LLM provider API key | — |
| Model | Optional model override | Provider default |
| Default Mode | Correction mode | Professional |
| Enabled | Toggle extension on/off | On |

## Privacy

- Your API key is stored in Chrome's encrypted sync storage — not accessible to web pages
- Messages are sent directly to your chosen LLM provider — no intermediary server
- The extension only runs on `app.slack.com`
- No data is collected, stored, or transmitted beyond the LLM API call

## Requirements

- Google Chrome (or Chromium-based browser)
- An API key from [Anthropic](https://console.anthropic.com/) or [OpenAI](https://platform.openai.com/)

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[MIT](LICENSE)
