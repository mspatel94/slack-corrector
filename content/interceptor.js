(function () {
  'use strict';

  const ns = window.__slackCorrector;

  /**
   * Extract plain text from a contenteditable element.
   * Normalizes <br> and <div> line breaks to \n.
   * @param {Element} el
   * @returns {string}
   */
  function extractText(el) {
    // innerText handles most line-break normalization, but we also
    // trim trailing whitespace per line.
    return el.innerText.replace(/\r\n/g, '\n').trim();
  }

  /**
   * Determine if a message should skip correction.
   * @param {string} text
   * @returns {boolean}
   */
  function shouldSkip(text) {
    if (text.length < 5) return true;
    if (text.startsWith('/')) return true;
    // Emoji-only: all chars are emoji or whitespace
    const emojiOnly = /^[\s\p{Emoji_Presentation}\p{Extended_Pictographic}\u200d\ufe0f]+$/u;
    if (emojiOnly.test(text)) return true;
    return false;
  }

  /**
   * Handle the send interception.
   * @param {Event} event - The keydown or click event
   * @param {Element} inputEl - The message input element
   */
  async function handleIntercept(event, inputEl) {
    // Guard: don't intercept if already active or bypassing.
    if (ns.interceptorActive || ns.bypassing || !ns.enabled) {
      return;
    }

    // Don't intercept message edits.
    const { isEditComposer } = ns.selectors;
    if (isEditComposer(inputEl)) {
      return;
    }

    const text = extractText(inputEl);
    if (shouldSkip(text)) {
      return;
    }

    // Block the send.
    event.preventDefault();
    event.stopImmediatePropagation();

    ns.interceptorActive = true;

    try {
      // Show overlay in loading state.
      ns.overlay.show(text, ns.defaultMode);

      // Scrape recent conversation for context.
      const context = ns.selectors.getRecentMessages(5);

      // Send to background for correction.
      const result = await chrome.runtime.sendMessage({
        type: 'correct',
        text: text,
        mode: ns.defaultMode,
        context: context,
      });

      // Update overlay with result.
      ns.overlay.update(result);
    } catch (err) {
      ns.overlay.update({ ok: false, error: `Extension error: ${err.message}` });
    }
  }

  /**
   * Keydown listener — captures Enter (without Shift) on the message input.
   * Attached to document in capturing phase to fire before Slack's handlers.
   */
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey) {
      return;
    }

    const { queryAll, SELECTORS } = ns.selectors;
    // Find the input that actually contains focus (handles thread panels
    // where multiple message inputs may exist on the page simultaneously).
    const inputEls = queryAll(SELECTORS.messageInput);
    const inputEl = inputEls.find((el) => el.contains(document.activeElement));
    if (!inputEl) {
      return;
    }

    handleIntercept(event, inputEl);
  }, true); // Capturing phase

  /**
   * Click listener — captures clicks on the send button.
   */
  document.addEventListener('click', (event) => {
    const { query, SELECTORS } = ns.selectors;
    const sendBtn = query(SELECTORS.sendButton);
    if (!sendBtn) return;

    // Check if the click target is the send button or inside it.
    if (sendBtn.contains(event.target)) {
      const inputEl = query(SELECTORS.messageInput);
      if (inputEl) {
        handleIntercept(event, inputEl);
      }
    }
  }, true); // Capturing phase

  // Load initial settings.
  chrome.storage.sync.get({ enabled: true, defaultMode: 'professional' }, (settings) => {
    ns.enabled = settings.enabled;
    ns.defaultMode = settings.defaultMode;
  });

  // Listen for settings changes.
  chrome.storage.onChanged.addListener((changes) => {
    if (changes.enabled) ns.enabled = changes.enabled.newValue;
    if (changes.defaultMode) ns.defaultMode = changes.defaultMode.newValue;
  });
})();
