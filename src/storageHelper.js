const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const STORAGE_DIR = path.join(app.getPath('userData'), 'storage');
const HISTORY_FILE = path.join(STORAGE_DIR, 'history.json');
const CHATS_FILE = path.join(STORAGE_DIR, 'chats.json');
const WINDOW_STATE_FILE = path.join(STORAGE_DIR, 'windowState.json');
const TABS_FILE = path.join(STORAGE_DIR, 'tabs.json');
const ADBLOCKER_FILE = path.join(STORAGE_DIR, 'adblocker.json');
const EXTENSIONS_FILE = path.join(STORAGE_DIR, 'extensions.json');

// Ensure storage directory exists
function ensureStorageDir() {
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  }
}

// History management
function loadHistory() {
  ensureStorageDir();
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading history:', error);
  }
  return [];
}

function saveHistory(history) {
  ensureStorageDir();
  try {
    // Keep only last 5000 items
    const limitedHistory = history.slice(-5000);
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(limitedHistory, null, 2));
  } catch (error) {
    console.error('Error saving history:', error);
  }
}

function addHistoryEntry(url, title, favicon = '') {
  const history = loadHistory();
  const entry = {
    id: Date.now().toString(),
    url,
    title,
    favicon,
    timestamp: Date.now()
  };
  history.push(entry);
  saveHistory(history);
  return entry;
}

function deleteHistoryEntry(id) {
  const history = loadHistory();
  const filtered = history.filter(item => item.id !== id);
  saveHistory(filtered);
}

function clearHistory() {
  ensureStorageDir();
  try {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify([], null, 2));
  } catch (error) {
    console.error('Error clearing history:', error);
  }
}

// Chat management
function loadChats() {
  ensureStorageDir();
  try {
    if (fs.existsSync(CHATS_FILE)) {
      const data = fs.readFileSync(CHATS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading chats:', error);
  }
  return {};
}

function saveChats(chats) {
  ensureStorageDir();
  try {
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
  } catch (error) {
    console.error('Error saving chats:', error);
  }
}

function saveChatSession(tabId, session) {
  const chats = loadChats();
  if (session && session.length > 0) {
    // Find the first user message to use as the title
    const firstUserMessage = session.find(msg => msg.role === 'user');
    const title = firstUserMessage ? firstUserMessage.content.substring(0, 100) : 'AI Chat Session';
    
    chats[tabId] = {
      id: tabId,
      session,
      title,
      timestamp: Date.now()
    };
  } else {
    delete chats[tabId];
  }
  saveChats(chats);
}

function deleteChatSession(tabId) {
  const chats = loadChats();
  delete chats[tabId];
  saveChats(chats);
}

function clearAllChats() {
  ensureStorageDir();
  try {
    fs.writeFileSync(CHATS_FILE, JSON.stringify({}, null, 2));
  } catch (error) {
    console.error('Error clearing chats:', error);
  }
}

// Window state management
function loadWindowState() {
  ensureStorageDir();
  try {
    if (fs.existsSync(WINDOW_STATE_FILE)) {
      const data = fs.readFileSync(WINDOW_STATE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading window state:', error);
  }
  return null;
}

function saveWindowState(state) {
  ensureStorageDir();
  try {
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (error) {
    console.error('Error saving window state:', error);
  }
}

// Tab management
function loadTabs() {
  ensureStorageDir();
  try {
    if (fs.existsSync(TABS_FILE)) {
      const data = fs.readFileSync(TABS_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading tabs:', error);
  }
  return { tabs: [], activeTabId: null };
}

function saveTabs(tabs, activeTabId) {
  ensureStorageDir();
  try {
    // Store only essential tab data (no webview references)
    const tabsData = tabs.map(tab => ({
      id: tab.id,
      url: tab.url,
      title: tab.title || 'New Tab'
    }));
    const data = {
      tabs: tabsData,
      activeTabId: activeTabId,
      timestamp: Date.now()
    };
    fs.writeFileSync(TABS_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error saving tabs:', error);
  }
}

// Ad blocker settings management
function loadAdBlockerSettings() {
  ensureStorageDir();
  try {
    if (fs.existsSync(ADBLOCKER_FILE)) {
      const data = fs.readFileSync(ADBLOCKER_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading ad blocker settings:', error);
  }
  return {
    enabled: true,
    stats: {
      blocked: 0,
      allowed: 0,
      totalBlocked: 0,
      totalAllowed: 0
    }
  };
}

function saveAdBlockerSettings(settings) {
  ensureStorageDir();
  try {
    fs.writeFileSync(ADBLOCKER_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error saving ad blocker settings:', error);
  }
}

// Extension management
function loadExtensions() {
  ensureStorageDir();
  try {
    if (fs.existsSync(EXTENSIONS_FILE)) {
      const data = fs.readFileSync(EXTENSIONS_FILE, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (error) {
    console.error('Error loading extensions:', error);
  }
  return [];
}

function saveExtensions(extensions) {
  ensureStorageDir();
  try {
    const normalized = Array.isArray(extensions) ? extensions : [];
    fs.writeFileSync(EXTENSIONS_FILE, JSON.stringify(normalized, null, 2));
  } catch (error) {
    console.error('Error saving extensions:', error);
  }
}

module.exports = {
  loadHistory,
  saveHistory,
  addHistoryEntry,
  deleteHistoryEntry,
  clearHistory,
  loadChats,
  saveChats,
  saveChatSession,
  deleteChatSession,
  clearAllChats,
  loadWindowState,
  saveWindowState,
  loadTabs,
  saveTabs,
  loadAdBlockerSettings,
  saveAdBlockerSettings,
  loadExtensions,
  saveExtensions
};

