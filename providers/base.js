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
 * Format the user message for the LLM, optionally including conversation context.
 * @param {string} text - The message to correct
 * @param {{ sender: string, text: string }[]} [context] - Recent conversation messages
 * @returns {string}
 */
export function formatUserMessage(text, context) {
  if (!context || context.length === 0) {
    return text;
  }

  const contextLines = context
    .map((msg) => `${msg.sender}: ${msg.text}`)
    .join('\n');

  return `Recent conversation for context:\n${contextLines}\n\nMessage to correct:\n${text}`;
}

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
 * correct(text: string, mode: string, apiKey: string, model?: string, context?: { sender: string, text: string }[]): Promise<CorrectionResult>
 */
