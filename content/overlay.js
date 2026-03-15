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

  let bannerEl = null;
  let originalText = '';
  let correctedText = '';
  let currentMode = 'professional';

  /**
   * Show the banner in loading state.
   * @param {string} text - Original message text
   * @param {string} mode - Correction mode key
   */
  function show(text, mode) {
    originalText = text;
    currentMode = mode;
    correctedText = '';
    renderBanner('loading');
  }

  /**
   * Update the banner with the correction result.
   * @param {import('../providers/base.js').CorrectionResult} result
   */
  function update(result) {
    if (result.ok) {
      correctedText = result.text;
      renderBanner('success');
    } else {
      renderBanner('error', result.error);
    }
  }

  // ── Word-level diff ──────────────────────────────────────────────────

  /**
   * Compute a simple word-level diff between two strings.
   * Returns an array of { type: 'equal'|'del'|'ins', text: string }.
   *
   * Uses a longest-common-subsequence approach on word arrays.
   * @param {string} oldStr
   * @param {string} newStr
   * @returns {{ type: string, text: string }[]}
   */
  function wordDiff(oldStr, newStr) {
    const oldWords = oldStr.split(/(\s+)/);
    const newWords = newStr.split(/(\s+)/);

    // Build LCS table.
    const m = oldWords.length;
    const n = newWords.length;
    const dp = Array.from({ length: m + 1 }, () => new Uint16Array(n + 1));

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldWords[i - 1] === newWords[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    // Backtrack to build diff.
    const result = [];
    let i = m;
    let j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
        result.unshift({ type: 'equal', text: oldWords[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        result.unshift({ type: 'ins', text: newWords[j - 1] });
        j--;
      } else {
        result.unshift({ type: 'del', text: oldWords[i - 1] });
        i--;
      }
    }

    // Merge consecutive same-type segments.
    const merged = [];
    for (const seg of result) {
      if (merged.length > 0 && merged[merged.length - 1].type === seg.type) {
        merged[merged.length - 1].text += seg.text;
      } else {
        merged.push({ ...seg });
      }
    }

    return merged;
  }

  /**
   * Render a word diff as HTML with redline styling.
   * @param {string} oldStr
   * @param {string} newStr
   * @returns {string}
   */
  function renderDiffHtml(oldStr, newStr) {
    const diffs = wordDiff(oldStr, newStr);
    return diffs.map((d) => {
      if (d.type === 'equal') return escapeHtml(d.text);
      if (d.type === 'del') return `<span class="sc-diff-del">${escapeHtml(d.text)}</span>`;
      if (d.type === 'ins') return `<span class="sc-diff-ins">${escapeHtml(d.text)}</span>`;
      return '';
    }).join('');
  }

  // ── Banner rendering ─────────────────────────────────────────────────

  /**
   * Find the composer container to inject the banner above it.
   * @returns {Element|null}
   */
  function findComposerContainer() {
    const { query, SELECTORS } = ns.selectors;
    // Try to find the main composer wrapper.
    const composer = query(SELECTORS.composerContainer);
    if (composer) return composer;
    // Fallback: find the message input and use its parent.
    const input = query(SELECTORS.messageInput);
    if (input) return input.closest('[class*="composer"], [class*="message_pane_input"]') || input.parentElement;
    return null;
  }

  /**
   * Render the inline banner above Slack's composer.
   * @param {'loading'|'success'|'error'} state
   * @param {string} [errorMsg]
   */
  function renderBanner(state, errorMsg) {
    // Remove existing banner.
    dismiss(false);

    const composer = findComposerContainer();
    if (!composer) {
      console.error('[SlackCorrector] Cannot find composer container for banner.');
      ns.interceptorActive = false;
      return;
    }

    bannerEl = document.createElement('div');
    bannerEl.className = 'sc-banner';

    if (state === 'loading') {
      bannerEl.innerHTML = `
        <div class="sc-banner-loading">
          <div class="sc-spinner"></div>
          Correcting...
        </div>
      `;
    } else if (state === 'error') {
      bannerEl.innerHTML = `
        <div class="sc-banner-header">
          <div class="sc-banner-header-left">
            <svg class="sc-banner-icon" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="6" fill="#d32f2f"/><path d="M4 4L8 8M8 4L4 8" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>
            <span class="sc-banner-label">Error</span>
          </div>
          <div class="sc-banner-actions">
            <button class="sc-btn-dismiss" data-action="cancel">Esc</button>
          </div>
        </div>
        <div class="sc-banner-error">${escapeHtml(errorMsg)}</div>
      `;
    } else {
      // Success state.
      bannerEl.innerHTML = `
        <div class="sc-banner-header">
          <div class="sc-banner-header-left">
            <svg class="sc-banner-icon" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="6" fill="#007a5a"/><path d="M3.5 6L5.5 8L8.5 4.5" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span class="sc-banner-label">Suggestion</span>
            <span class="sc-banner-sep">&middot;</span>
            <select class="sc-mode-select">
              ${MODE_KEYS.map((k) => `<option value="${k}" ${k === currentMode ? 'selected' : ''}>${MODE_LABELS[k]}</option>`).join('')}
            </select>
          </div>
          <div class="sc-banner-actions">
            <button class="sc-btn-accept" data-action="accept">Tab ↹</button>
            <button class="sc-btn-dismiss" data-action="cancel">Esc</button>
          </div>
        </div>
        <div class="sc-banner-corrected">${escapeHtml(correctedText)}</div>
        <div class="sc-banner-diff">${renderDiffHtml(originalText, correctedText)}</div>
      `;
    }

    // Insert banner above the composer.
    composer.parentElement.insertBefore(bannerEl, composer);

    // Event listeners.
    bannerEl.addEventListener('click', handleClick);
    const modeSelect = bannerEl.querySelector('.sc-mode-select');
    if (modeSelect) modeSelect.addEventListener('change', handleModeChange);
    document.addEventListener('keydown', handleKeydown);
  }

  /**
   * Handle button clicks in the banner.
   */
  function handleClick(event) {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;

    if (action === 'accept') {
      sendToSlack(correctedText);
    } else if (action === 'cancel') {
      dismiss(true);
    }
  }

  /**
   * Handle keyboard shortcuts while banner is visible.
   */
  function handleKeydown(event) {
    if (!bannerEl) return;

    // Esc → dismiss, keep original in input.
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      dismiss(true);
      return;
    }

    // Tab → accept correction.
    if (event.key === 'Tab' && !event.shiftKey && correctedText) {
      event.preventDefault();
      event.stopImmediatePropagation();
      sendToSlack(correctedText);
      return;
    }
  }

  /**
   * Handle mode dropdown change — re-trigger correction.
   */
  async function handleModeChange(event) {
    currentMode = event.target.value;

    // Show loading.
    renderBanner('loading');

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'correct',
        text: originalText,
        mode: currentMode,
      });

      if (result.ok) {
        correctedText = result.text;
        renderBanner('success');
      } else {
        renderBanner('error', result.error);
      }
    } catch (err) {
      renderBanner('error', `Extension error: ${err.message}`);
    }
  }

  /**
   * Insert text into Slack's input and trigger send.
   *
   * Uses execCommand('delete') + execCommand('insertText') to replace text
   * while keeping focus, so React's internal state stays in sync.
   *
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

    // 1. Focus the input (banner is still visible but input gets focus).
    inputEl.focus();

    // 2. Select all content within the input using Range API.
    const range = document.createRange();
    range.selectNodeContents(inputEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);

    // 3. Delete selected content, then insert corrected text.
    document.execCommand('delete');
    document.execCommand('insertText', false, text);

    // 4. Set bypass flag so interceptor lets the send through.
    ns.bypassing = true;

    // 5. Give React a moment to process, then dismiss and send.
    setTimeout(() => {
      dismiss(false);

      if (sendBtn) {
        sendBtn.click();
      } else {
        inputEl.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          bubbles: true,
          cancelable: true,
        }));
      }

      setTimeout(() => {
        ns.bypassing = false;
        ns.interceptorActive = false;
      }, 0);
    }, 100);
  }

  /**
   * Remove the banner from the DOM.
   * @param {boolean} restoreFocus - If true, focus back to Slack's input.
   */
  function dismiss(restoreFocus) {
    if (bannerEl) {
      document.removeEventListener('keydown', handleKeydown);
      bannerEl.remove();
      bannerEl = null;
    }

    if (restoreFocus) {
      ns.interceptorActive = false;
      const inputEl = ns.selectors.query(ns.selectors.SELECTORS.messageInput);
      if (inputEl) inputEl.focus();
    }
  }

  /**
   * Escape HTML to prevent XSS.
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
