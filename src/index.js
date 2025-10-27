// Load environment variables
require('dotenv').config();

const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');
const { initialize, enable } = require('@electron/remote/main');
const { streamChat } = require('./openaiHelper');
const storageHelper = require('./storageHelper');

// Initialize @electron/remote
initialize();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

console.log('App initialization starting...');

let mainWindow;

const createWindow = (isIncognito = false) => {
  console.log(`Creating ${isIncognito ? 'incognito' : 'browser'} window...`);
  // Create a unique partition for incognito windows to ensure ephemeral session
  const partition = isIncognito ? `incognito-${Date.now()}`  : 'persist:browser';
  
  // Create the browser window.
  const newWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      webviewTag: true, // Enable webview tags
      partition: partition, // Use partition for session management
    },
    frame: false,
    titleBarStyle: 'hidden',
    show: false, // Don't show until ready
  });
  
  // Store partition on window object for webview access
  newWindow.incognitoPartition = partition;

  console.log('Window created, enabling remote module...');
  // Enable remote module for this window
  enable(newWindow.webContents);
  
  // Store incognito state on window for IPC access
  newWindow.isIncognito = isIncognito;

  console.log('Loading browser interface...');
  // Load the browser interface
  newWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show window when ready
  newWindow.once('ready-to-show', () => {
    console.log('Window ready to show, displaying...');
    newWindow.show();
  });

  // Handle renderer process errors
  newWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  newWindow.webContents.on('crashed', () => {
    console.error('Renderer process crashed');
  });

  newWindow.webContents.on('unresponsive', () => {
    console.error('Renderer process unresponsive');
  });

  // Handle JavaScript errors
  newWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Renderer console [${level}]: ${message} at ${sourceId}:${line}`);
  });

  // Handle uncaught exceptions
  newWindow.webContents.on('did-fail-provisional-load', (event, errorCode, errorDescription) => {
    console.error('Provisional load failed:', errorCode, errorDescription);
  });

  // Handle window closed
  newWindow.on('closed', () => {
    console.log('Window closed');
    if (newWindow === mainWindow) {
      mainWindow = null;
    }
  });

  // Set mainWindow if this is the first window
  if (!mainWindow && !isIncognito) {
    mainWindow = newWindow;
  }

  return newWindow;
};

ipcMain.handle('get-preload-path', () => {
  return path.join(__dirname, 'preload.js');
});

ipcMain.handle('is-incognito', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? window.isIncognito || false : false;
});

ipcMain.handle('get-partition', (event) => {
  const window = BrowserWindow.fromWebContents(event.sender);
  return window ? window.incognitoPartition || 'persist:browser' : 'persist:browser';
});

// IPC handlers for tab management
ipcMain.handle('create-tab', async (event, url = 'https://www.google.com') => {
  if (!url) {
    url = 'newtab.html';
  }
  return { url, id: Date.now().toString() };
});

ipcMain.handle('get-page-title', async (event, webContentsId) => {
  const webContents = require('electron').webContents.fromId(webContentsId);
  return webContents ? webContents.getTitle() : 'New Tab';
});

ipcMain.handle('navigate-to', async (event, url) => {
  try {
    if (url.includes('newtab.html')) {
      // Extract query parameters if present
      const urlParts = url.split('?');
      const queryParams = urlParts.length > 1 ? '?' + urlParts[1] : '';
      url = `file://${path.join(__dirname, 'newtab.html')}${queryParams}`;
      return { success: true, url };
    }
    if (url.includes('history.html')) {
      url = `file://${path.join(__dirname, 'history.html')}`;
      return { success: true, url };
    }
    // Basic URL validation and formatting
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        url = 'https://www.google.com/search?q=' + encodeURIComponent(url);
      }
    }
    return { success: true, url };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('chat-send', async (event, { id, messages, contexts }) => {
  try {
    let finalMessages = messages;
    if (contexts && contexts.length > 0) {
      let contextString = "You are a helpful AI assistant integrated into a web browser. Use the following page contexts to provide more relevant and contextual answers.\n";

      contexts.forEach((context, i) => {
        contextString += `\n[Page Context ${i + 1}]\nTitle: "${context.title}"\nURL: ${context.url}\nContent Snippet: "${context.content}"\n`;
      });

      const systemMessage = {
        role: 'system',
        content: contextString,
      };
      finalMessages = [systemMessage, ...messages];
    }

    let assistantMessage = '';
    for await (const token of streamChat(finalMessages)) {
      assistantMessage += token;
      event.sender.send('chat-stream', { id, token });
    }
    // send final done signal
    event.sender.send('chat-stream', { id, done: true });
    return { success: true };
  } catch (error) {
    console.error('Chat error', error);
    event.sender.send('chat-stream', { id, error: error.message });
    return { success: false, error: error.message };
  }
});

// History IPC handlers
ipcMain.handle('history-load', async () => {
  return storageHelper.loadHistory();
});

ipcMain.handle('history-add', async (event, { url, title, favicon }) => {
  return storageHelper.addHistoryEntry(url, title, favicon);
});

ipcMain.handle('history-delete', async (event, id) => {
  storageHelper.deleteHistoryEntry(id);
  return { success: true };
});

ipcMain.handle('history-clear', async () => {
  storageHelper.clearHistory();
  return { success: true };
});

// Chat IPC handlers
ipcMain.handle('chats-load', async () => {
  return storageHelper.loadChats();
});

ipcMain.handle('chat-save', async (event, { tabId, session }) => {
  storageHelper.saveChatSession(tabId, session);
  return { success: true };
});

ipcMain.handle('chat-delete', async (event, tabId) => {
  storageHelper.deleteChatSession(tabId);
  return { success: true };
});

ipcMain.handle('chats-clear', async () => {
  storageHelper.clearAllChats();
  return { success: true };
});


// Create application menu
const createMenu = () => {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('new-tab');
            }
          }
        },
        {
          label: 'New Incognito Window',
          accelerator: 'CmdOrCtrl+Shift+N',
          click: () => {
            createWindow(true);
          }
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('close-tab');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Navigation',
      submenu: [
        {
          label: 'Back',
          accelerator: 'Alt+Left',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('navigate-back');
            }
          }
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('navigate-forward');
            }
          }
        },
        {
          label: 'Refresh',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('refresh-page');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Focus Address Bar',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('focus-url');
            }
          }
        },
        {
          label: 'Toggle AI Chat',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('toggle-chat');
            }
          }
        },
        {
          label: 'Toggle Sidebar',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('toggle-sidebar');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'History',
          accelerator: 'CmdOrCtrl+Y',
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('show-history');
            }
          }
        },
        { type: 'separator' },
        // Tab selection like Chrome: Cmd/Ctrl + 1-9
        ...Array.from({ length: 9 }, (_, i) => ({
          label: i === 8 ? 'Switch to Last Tab' : `Switch to Tab ${i + 1}`,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: () => {
            const focusedWindow = BrowserWindow.getFocusedWindow();
            if (focusedWindow) {
              focusedWindow.webContents.send('select-tab', { index: i + 1 });
            }
          }
        }))
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  console.log('Electron app ready, creating window...');
  createWindow();
  console.log('Creating menu...');
  createMenu();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
