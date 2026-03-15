import { SYSTEM_PROMPTS, formatUserMessage } from './base.js';

const DEFAULT_MODEL = 'claude-sonnet-4-20250514';
const API_URL = 'https://api.anthropic.com/v1/messages';
const TIMEOUT_MS = 10000;

/**
 * Call the Anthropic Messages API to correct text.
 * @param {string} text - Original message text
 * @param {string} mode - Correction mode key (fix, professional, concise, friendly)
 * @param {string} apiKey - Anthropic API key
 * @param {string} [model] - Optional model override
 * @param {{ sender: string, text: string }[]} [context] - Recent conversation messages
 * @returns {Promise<import('./base.js').CorrectionResult>}
 */
export async function correct(text, mode, apiKey, model, context) {
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
        messages: [{ role: 'user', content: formatUserMessage(text, context) }],
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
