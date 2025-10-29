const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Incognito detection - use IPC to get from main process
  isIncognito: () => ipcRenderer.invoke('is-incognito'),
  getPartition: () => ipcRenderer.invoke('get-partition'),
  
  // Tab management
  createTab: (url) => ipcRenderer.invoke('create-tab', url),
  getPageTitle: (webContentsId) => ipcRenderer.invoke('get-page-title', webContentsId),
  navigateTo: (url) => ipcRenderer.invoke('navigate-to', url),
  getPreloadPath: () => ipcRenderer.invoke('get-preload-path'),

  // AI Chat
  sendChat: (id, messages, contexts) => ipcRenderer.invoke('chat-send', { id, messages, contexts }),
  onChatStream: (callback) => ipcRenderer.on('chat-stream', (_e, data) => callback(data)),

  // History
  loadHistory: () => ipcRenderer.invoke('history-load'),
  addHistory: (url, title, favicon) => ipcRenderer.invoke('history-add', { url, title, favicon }),
  deleteHistory: (id) => ipcRenderer.invoke('history-delete', id),
  clearHistory: () => ipcRenderer.invoke('history-clear'),

  // Chats
  loadChats: () => ipcRenderer.invoke('chats-load'),
  saveChat: (tabId, session) => ipcRenderer.invoke('chat-save', { tabId, session }),
  deleteChat: (tabId) => ipcRenderer.invoke('chat-delete', tabId),
  clearChats: () => ipcRenderer.invoke('chats-clear'),

  // Tab persistence
  loadTabs: () => ipcRenderer.invoke('tabs-load'),
  saveTabs: (tabs, activeTabId) => ipcRenderer.invoke('tabs-save', { tabs, activeTabId }),

  // Navigation events
  onNewTab: (callback) => ipcRenderer.on('new-tab', callback),
  onCloseTab: (callback) => ipcRenderer.on('close-tab', callback),
  onNavigateBack: (callback) => ipcRenderer.on('navigate-back', callback),
  onNavigateForward: (callback) => ipcRenderer.on('navigate-forward', callback),
  onRefreshPage: (callback) => ipcRenderer.on('refresh-page', callback),
  onFocusUrl: (callback) => ipcRenderer.on('focus-url', callback),
  onToggleChat: (callback) => ipcRenderer.on('toggle-chat', callback),
  onToggleSidebar: (callback) => ipcRenderer.on('toggle-sidebar', callback),
  onSelectTab: (callback) => ipcRenderer.on('select-tab', (_e, data) => callback(data)),
  onShowHistory: (callback) => ipcRenderer.on('show-history', callback),

  setWindowButtonsVisible: (visible) => ipcRenderer.invoke('set-window-buttons-visible', visible),

  // Remove listeners
  removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Host messaging for webview guests
  sendToHost: (type, payload) => ipcRenderer.sendToHost(type, payload),
  onFromHost: (callback) => ipcRenderer.on('guest-message', (_e, data) => callback(data)),
  
  // Link handling for webviews
  openLinkInNewTab: (url) => ipcRenderer.sendToHost('open-link', { url }),
  
  // Listen for IPC messages from main process
  onOpenInTab: (callback) => ipcRenderer.on('open-in-tab', (_e, url) => callback(url)),

  // URL copying functionality
  getCurrentUrl: () => ipcRenderer.invoke('get-current-url'),
  copyToClipboard: (text) => ipcRenderer.invoke('copy-to-clipboard', text),
  onCopyCurrentUrl: (callback) => ipcRenderer.on('copy-current-url', callback),
  onUrlCopied: (callback) => ipcRenderer.on('url-copied', (_e, url) => callback(url)),

  // Ad blocker
  isAdBlockerEnabled: () => ipcRenderer.invoke('ad-blocker-enabled'),
  toggleAdBlocker: (enabled) => ipcRenderer.invoke('ad-blocker-toggle', enabled),
  getAdBlockerStats: () => ipcRenderer.invoke('ad-blocker-stats')
});
