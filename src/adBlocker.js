const { ElectronBlocker } = require('@ghostery/adblocker-electron');
const { fetch } = require('cross-fetch');
const path = require('node:path');
const fs = require('node:fs');
const storageHelper = require('./storageHelper');

let blocker = null;
let isEnabled = true;
let stats = {
  blocked: 0,
  allowed: 0,
  totalBlocked: 0,
  totalAllowed: 0
};

// Load saved settings on module initialization
function loadSavedSettings() {
  const saved = storageHelper.loadAdBlockerSettings();
  isEnabled = saved.enabled !== false; // Default to true if not set
  stats = {
    ...stats,
    ...saved.stats,
    blocked: 0, // Reset session stats
    allowed: 0 // Reset session stats
  };
}

// Save settings to disk
function saveSettings() {
  storageHelper.saveAdBlockerSettings({
    enabled: isEnabled,
    stats: stats
  });
}

// Load saved settings on module load
loadSavedSettings();

/**
 * Initialize the ad blocker engine
 * @param {object} defaultSession - The default Electron session
 */
async function initializeAdBlocker(defaultSession) {
  console.log('Initializing ad blocker...');
  
  // Load saved settings (this also sets isEnabled and stats)
  loadSavedSettings();
  
  // Initialize last known blocker stats
  if (stats.totalBlocked > 0 || stats.totalAllowed > 0) {
    lastBlockerStats = {
      blocked: stats.blocked || 0,
      allowed: stats.allowed || 0
    };
  }
  
  try {
    // Create the blocker instance
    // Using full lists: EasyList + EasyPrivacy + uBlock Origin filters
    // fromPrebuiltAdsAndTracking returns a Promise
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: path.join(__dirname, '..', 'adblocker-data'),
      read: fs.promises.readFile,
      write: fs.promises.writeFile,
    });

    // Enable blocking for the default session if enabled
    if (isEnabled) {
      blocker.enableBlockingInSession(defaultSession);
    }
    
    console.log('Ad blocker initialized successfully', { enabled: isEnabled });
  } catch (error) {
    console.error('Error initializing ad blocker:', error);
    // Fall back to empty blocker if initialization fails
    blocker = ElectronBlocker.empty();
    if (isEnabled) {
      blocker.enableBlockingInSession(defaultSession);
    }
  }
  
  // Set up periodic stats sync from blocker
  // The blocker library tracks stats internally, we'll sync periodically
  if (blocker) {
    setInterval(() => {
      try {
        // Try to get stats from the blocker
        if (blocker.getStats) {
          const blockerStats = blocker.getStats();
          if (blockerStats && typeof blockerStats === 'object') {
            syncStatsFromBlocker(blockerStats);
          }
        }
      } catch (error) {
        // Stats might not be available in this format
      }
    }, 5000); // Sync every 5 seconds
    
    // Save stats periodically
    setInterval(() => {
      saveStats();
    }, 30000); // Save every 30 seconds (stats are synced more frequently)
  }
  
  return blocker;
}

// Track the last known blocker stats to compute delta
let lastBlockerStats = { blocked: 0, allowed: 0 };

// Sync stats from blocker's internal tracking
function syncStatsFromBlocker(blockerStats) {
  if (!blockerStats || typeof blockerStats !== 'object') return;
  
  // Get current blocker stats (these are session stats)
  const currentBlocked = blockerStats.blocked || blockerStats.blockedRequests || 0;
  const currentAllowed = blockerStats.allowed || blockerStats.allowedRequests || 0;
  
  // Calculate delta from last sync
  const deltaBlocked = Math.max(0, currentBlocked - lastBlockerStats.blocked);
  const deltaAllowed = Math.max(0, currentAllowed - lastBlockerStats.allowed);
  
  // Update cumulative totals (only add the delta to avoid double counting)
  if (deltaBlocked > 0) {
    stats.totalBlocked += deltaBlocked;
  }
  if (deltaAllowed > 0) {
    stats.totalAllowed += deltaAllowed;
  }
  
  // Update session stats (current session)
  stats.blocked = currentBlocked;
  stats.allowed = currentAllowed;
  
  // Update last known stats
  lastBlockerStats = { blocked: currentBlocked, allowed: currentAllowed };
}

/**
 * Enable or disable ad blocking for a session
 * @param {object} session - The Electron session
 * @param {boolean} enabled - Whether to enable blocking
 */
function setAdBlockerEnabled(session, enabled) {
  isEnabled = enabled;
  
  // Save the setting
  saveSettings();
  
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
 * Update stats (call when a request is blocked/allowed)
 * @param {boolean} wasBlocked - Whether the request was blocked
 */
function updateStats(wasBlocked) {
  if (wasBlocked) {
    stats.blocked++;
    stats.totalBlocked++;
  } else {
    stats.allowed++;
    stats.totalAllowed++;
  }
  
  // Save stats periodically (debounce to avoid too many writes)
  if (!updateStats.timeout) {
    updateStats.timeout = setTimeout(() => {
      saveSettings();
      updateStats.timeout = null;
    }, 5000); // Save every 5 seconds or when explicitly called
  }
}

/**
 * Save stats immediately
 */
function saveStats() {
  saveSettings();
  if (updateStats.timeout) {
    clearTimeout(updateStats.timeout);
    updateStats.timeout = null;
  }
}

/**
 * Get blocking stats from the ad blocker
 * @returns {object} Stats about blocked requests
 */
function getAdBlockerStats() {
  // Try to get current session stats from blocker if available
  let sessionBlocked = stats.blocked;
  let sessionAllowed = stats.allowed;
  
  if (blocker && blocker.getStats) {
    try {
      const blockerStats = blocker.getStats();
      // The blocker might return stats in different formats
      // Common formats: { blocked: X, allowed: Y } or just numbers
      if (typeof blockerStats === 'object' && blockerStats !== null) {
        sessionBlocked = (blockerStats.blocked || blockerStats.blockedRequests || 0) + stats.blocked;
        sessionAllowed = (blockerStats.allowed || blockerStats.allowedRequests || 0) + stats.allowed;
      } else if (typeof blockerStats === 'number') {
        // If it's just a number, assume it's blocked count
        sessionBlocked = blockerStats + stats.blocked;
      }
    } catch (error) {
      // Fallback to our tracked stats
      console.log('Could not get stats from blocker, using tracked stats');
    }
  }
  
  return {
    blocked: sessionBlocked,
    allowed: sessionAllowed,
    totalBlocked: stats.totalBlocked,
    totalAllowed: stats.totalAllowed
  };
}

module.exports = {
  initializeAdBlocker,
  setAdBlockerEnabled,
  applyAdBlockerToSession,
  isAdBlockerEnabled,
  getAdBlockerStats,
  updateStats,
  saveStats,
};

