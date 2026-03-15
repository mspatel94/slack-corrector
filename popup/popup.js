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
