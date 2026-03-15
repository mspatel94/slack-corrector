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
    const hasRichText = inputEl && inputEl.querySelector('b, i, a, code, pre, span[style]');

    backdropEl = document.createElement('div');
    backdropEl.className = 'sc-overlay-backdrop';
    backdropEl.innerHTML = `
      <div class="sc-overlay-modal">
        <div class="sc-header">
          <div class="sc-header-title">
            <div class="sc-header-icon">&#10003;</div>
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
            Send Original <span class="sc-shortcut">&#8984;&#8679;&#9166;</span>
          </button>
          <button class="sc-btn sc-btn-secondary" data-action="cancel">
            Cancel <span class="sc-shortcut">Esc</span>
          </button>
          ${state === 'success' ? `
            <button class="sc-btn sc-btn-primary" data-action="corrected">
              Send Corrected <span class="sc-shortcut">&#8984;&#9166;</span>
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
   * Order matters: Cmd+Shift+Enter check must come before Cmd+Enter
   * since the Cmd+Enter check uses !event.shiftKey to exclude the shift case.
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

    // Cmd/Ctrl+Shift+Enter → send original (checked BEFORE Cmd+Enter)
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      sendToSlack(originalText);
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

    // Tab → cycle modes (only when NOT focused on the editable area)
    const correctedEl = backdropEl.querySelector('.sc-corrected-text');
    if (event.key === 'Tab' && document.activeElement !== correctedEl) {
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

    // Show loading and re-correct.
    const contentArea = backdropEl.querySelector('.sc-content');
    contentArea.innerHTML = renderContent('loading');

    // Remove send button during loading.
    const existingPrimary = backdropEl.querySelector('[data-action="corrected"]');
    if (existingPrimary) existingPrimary.remove();

    try {
      const result = await chrome.runtime.sendMessage({
        type: 'correct',
        text: originalText,
        mode: currentMode,
      });

      contentArea.innerHTML = renderContent(result.ok ? 'success' : 'error', result.ok ? result.text : result.error);

      // Re-add send button if correction succeeded.
      const actionsEl = backdropEl.querySelector('.sc-actions');
      if (result.ok) {
        const btn = document.createElement('button');
        btn.className = 'sc-btn sc-btn-primary';
        btn.dataset.action = 'corrected';
        btn.innerHTML = 'Send Corrected <span class="sc-shortcut">&#8984;&#9166;</span>';
        actionsEl.appendChild(btn);

        const newCorrectedEl = backdropEl.querySelector('.sc-corrected-text');
        if (newCorrectedEl) newCorrectedEl.focus();
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

    // 7. Clear bypass flag after event propagation completes (macrotask,
    //    not microtask — ensures Slack's handlers finish before flag clears).
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
