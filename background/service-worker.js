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
