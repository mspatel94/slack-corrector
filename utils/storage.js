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
