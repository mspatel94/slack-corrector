// Slack DOM selectors — update this file when Slack changes its markup.
// Uses multiple fallback strategies: data attributes, ARIA roles, class patterns.

(function () {
  'use strict';

  const SELECTORS = {
    // The contenteditable message input.
    // Slack uses a div[data-qa="message_input"] or div[role="textbox"] inside the composer.
    messageInput: [
      'div[data-qa="message_input"] div[contenteditable="true"]',
      'div.ql-editor[contenteditable="true"]',
      'div[role="textbox"][contenteditable="true"]',
    ],

    // The send button.
    sendButton: [
      'button[data-qa="texty_send_button"]',
      'button[aria-label="Send"]',
      'button[aria-label="Send message"]',
    ],

    // The main composer container (NOT the edit-message composer).
    // Used to distinguish new messages from message edits.
    composerContainer: [
      'div[data-qa="message_pane_composer"]',
      'div.p-message_pane_input',
    ],

    // The edit-message composer (appears when pressing Up to edit).
    editComposer: [
      'div[data-qa="edit_message_composer"]',
      'div.p-message_editing__composer',
    ],

    // Individual message elements in the message list.
    messageItem: [
      'div.c-message_kit__background',
      'div[data-qa="message_container"]',
      'div.c-message',
    ],

    // Sender name within a message.
    messageSender: [
      'button[data-qa="message_sender_name"]',
      'span.c-message__sender',
      'a.c-message__sender_link',
    ],

    // Message body text within a message.
    messageBody: [
      'div.p-rich_text_section',
      'div[data-qa="message-text"]',
      'div.c-message__body span',
    ],
  };

  /**
   * Try each selector in order, return the first match or null.
   * @param {string[]} selectorList
   * @returns {Element|null}
   */
  function query(selectorList) {
    for (const sel of selectorList) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /**
   * Try each selector in order, return all matches from the first selector that finds any.
   * @param {string[]} selectorList
   * @returns {Element[]}
   */
  function queryAll(selectorList) {
    for (const sel of selectorList) {
      const els = document.querySelectorAll(sel);
      if (els.length > 0) return Array.from(els);
    }
    return [];
  }

  /**
   * Check if the given input element is inside an edit composer (not a new message).
   * @param {Element} inputEl
   * @returns {boolean}
   */
  function isEditComposer(inputEl) {
    for (const sel of SELECTORS.editComposer) {
      if (inputEl.closest(sel)) return true;
    }
    return false;
  }

  /**
   * Run a health check — verify critical selectors resolve.
   * Logs warnings and sets a badge on the extension icon if selectors are broken.
   */
  function healthCheck() {
    const input = query(SELECTORS.messageInput);
    const sendBtn = query(SELECTORS.sendButton);
    const ok = Boolean(input && sendBtn);

    if (!input) {
      console.warn('[SlackCorrector] Could not find message input. Selectors may need updating.');
    }
    if (!sendBtn) {
      console.warn('[SlackCorrector] Could not find send button. Selectors may need updating.');
    }

    // Notify the service worker to set/clear the badge.
    chrome.runtime.sendMessage({ type: 'healthCheck', ok });

    return { input, sendBtn };
  }

  /**
   * Scrape the last N visible messages from the current channel/thread.
   * Returns an array of { sender: string, text: string } objects,
   * oldest first.
   * @param {number} [count=5]
   * @returns {{ sender: string, text: string }[]}
   */
  function getRecentMessages(count) {
    const maxCount = count || 5;
    const messageEls = queryAll(SELECTORS.messageItem);
    // Take the last N messages.
    const recent = messageEls.slice(-maxCount);

    const messages = [];
    for (const msgEl of recent) {
      // Find sender name.
      let sender = '';
      for (const sel of SELECTORS.messageSender) {
        const senderEl = msgEl.querySelector(sel);
        if (senderEl) {
          sender = senderEl.textContent.trim();
          break;
        }
      }

      // Find message body text.
      let text = '';
      for (const sel of SELECTORS.messageBody) {
        const bodyEl = msgEl.querySelector(sel);
        if (bodyEl) {
          text = bodyEl.innerText.trim();
          break;
        }
      }

      if (text) {
        messages.push({ sender: sender || 'Unknown', text });
      }
    }

    return messages;
  }

  // Expose on the shared namespace.
  window.__slackCorrector.selectors = {
    SELECTORS,
    query,
    queryAll,
    isEditComposer,
    healthCheck,
    getRecentMessages,
  };

  // Run health check after a short delay (Slack may still be rendering).
  setTimeout(healthCheck, 3000);
})();
