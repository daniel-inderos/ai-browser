const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { fetch } = require('cross-fetch');
const path = require('node:path');
const fs = require('node:fs');

let blocker = null;
let isEnabled = true;

/**
 * Initialize the ad blocker engine
 * @param {object} defaultSession - The default Electron session
 */
async function initializeAdBlocker(defaultSession) {
  console.log('Initializing ad blocker...');
  
  try {
    // Create the blocker instance
    // Using full lists: EasyList + EasyPrivacy + uBlock Origin filters
    // fromPrebuiltAdsAndTracking returns a Promise
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: path.join(__dirname, '..', 'adblocker-data'),
      read: fs.promises.readFile,
      write: fs.promises.writeFile,
    });

    // Enable blocking for the default session
    blocker.enableBlockingInSession(defaultSession);
    
    console.log('Ad blocker initialized successfully');
  } catch (error) {
    console.error('Error initializing ad blocker:', error);
    // Fall back to empty blocker if initialization fails
    blocker = ElectronBlocker.empty();
    blocker.enableBlockingInSession(defaultSession);
  }
  
  return blocker;
}

/**
 * Enable or disable ad blocking for a session
 * @param {object} session - The Electron session
 * @param {boolean} enabled - Whether to enable blocking
 */
function setAdBlockerEnabled(session, enabled) {
  isEnabled = enabled;
  
  if (!blocker) {
    console.warn('Ad blocker not initialized yet');
    return;
  }
  
  try {
    if (enabled) {
      blocker.enableBlockingInSession(session);
      console.log('Ad blocker enabled for session');
    } else {
      if (blocker.disableBlockingInSession) {
        blocker.disableBlockingInSession(session);
      } else {
        // If disable method doesn't exist, just log
        console.log('Ad blocker disable requested (method not available)');
      }
      console.log('Ad blocker disabled for session');
    }
  } catch (error) {
    console.error('Error toggling ad blocker:', error);
  }
}

/**
 * Apply ad blocker to a new session (e.g., incognito window)
 * @param {object} session - The Electron session to apply blocking to
 */
function applyAdBlockerToSession(session) {
  if (!blocker || !isEnabled) {
    return;
  }
  
  try {
    blocker.enableBlockingInSession(session);
    console.log('Ad blocker applied to session:', session.partition);
  } catch (error) {
    console.error('Error applying ad blocker to session:', error);
  }
}

/**
 * Check if ad blocker is currently enabled
 * @returns {boolean}
 */
function isAdBlockerEnabled() {
  return isEnabled;
}

/**
 * Get blocking stats from the ad blocker
 * @returns {object} Stats about blocked requests
 */
function getAdBlockerStats() {
  if (!blocker) {
    return { blocked: 0, allowed: 0 };
  }
  
  return blocker.getStats ? blocker.getStats() : { blocked: 0, allowed: 0 };
}

module.exports = {
  initializeAdBlocker,
  setAdBlockerEnabled,
  applyAdBlockerToSession,
  isAdBlockerEnabled,
  getAdBlockerStats,
};

