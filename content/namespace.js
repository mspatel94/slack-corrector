// Shared namespace for all SlackCorrector content scripts.
// Content scripts run in classic (non-module) scope, so they communicate
// via this shared object on the window.
window.__slackCorrector = {
  // True while the overlay is open or a correction is in-flight.
  // Prevents duplicate interceptions.
  interceptorActive: false,

  // True while programmatically triggering Slack's send.
  // The interceptor checks this and lets the event through.
  bypassing: false,

  // True if the extension is enabled (loaded from storage on init).
  enabled: true,

  // Current correction mode (loaded from storage on init).
  defaultMode: 'professional',

  // References set by other scripts
  selectors: null,  // Set by slack-selectors.js
  overlay: null,    // Set by overlay.js
};
