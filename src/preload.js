const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Tab management
  createTab: (url) => ipcRenderer.invoke('create-tab', url),
  getPageTitle: (webContentsId) => ipcRenderer.invoke('get-page-title', webContentsId),
  navigateTo: (url) => ipcRenderer.invoke('navigate-to', url),
  getPreloadPath: () => ipcRenderer.invoke('get-preload-path'),

  // AI Chat
  sendChat: (id, messages, contexts) => ipcRenderer.invoke('chat-send', { id, messages, contexts }),
  onChatStream: (callback) => ipcRenderer.on('chat-stream', (_e, data) => callback(data)),

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

  // Remove listeners
  removeListener: (channel, callback) => ipcRenderer.removeListener(channel, callback),
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),

  // Host messaging for webview guests
  sendToHost: (type, payload) => ipcRenderer.sendToHost(type, payload),
  onFromHost: (callback) => ipcRenderer.on('guest-message', (_e, data) => callback(data))
});
