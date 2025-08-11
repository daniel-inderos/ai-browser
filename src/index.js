// Load environment variables
require('dotenv').config();

const { app, BrowserWindow, ipcMain, Menu, globalShortcut } = require('electron');
const path = require('node:path');
const { initialize, enable } = require('@electron/remote/main');
const { streamChat } = require('./openaiHelper');

// Initialize @electron/remote
initialize();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

console.log('App initialization starting...');

let mainWindow;

const createWindow = () => {
  console.log('Creating browser window...');
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      webviewTag: true, // Enable webview tags
    },
    titleBarStyle: 'default',
    show: false, // Don't show until ready
  });

  console.log('Window created, enabling remote module...');
  // Enable remote module for this window
  enable(mainWindow.webContents);

  console.log('Loading browser interface...');
  // Load the browser interface
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show, displaying...');
    mainWindow.show();
  });

  // Handle renderer process errors
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('crashed', () => {
    console.error('Renderer process crashed');
  });

  mainWindow.webContents.on('unresponsive', () => {
    console.error('Renderer process unresponsive');
  });

  // Handle JavaScript errors
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`Renderer console [${level}]: ${message} at ${sourceId}:${line}`);
  });

  // Handle uncaught exceptions
  mainWindow.webContents.on('did-fail-provisional-load', (event, errorCode, errorDescription) => {
    console.error('Provisional load failed:', errorCode, errorDescription);
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    console.log('Main window closed');
    mainWindow = null;
  });
};

ipcMain.handle('get-preload-path', () => {
  return path.join(__dirname, 'preload.js');
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
    if (url === 'newtab.html') {
      url = `file://${path.join(__dirname, 'newtab.html')}`;
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
            if (mainWindow) {
              mainWindow.webContents.send('new-tab');
            }
          }
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('close-tab');
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
            if (mainWindow) {
              mainWindow.webContents.send('navigate-back');
            }
          }
        },
        {
          label: 'Forward',
          accelerator: 'Alt+Right',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('navigate-forward');
            }
          }
        },
        {
          label: 'Refresh',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('refresh-page');
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Focus Address Bar',
          accelerator: 'CmdOrCtrl+L',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('focus-url');
            }
          }
        },
        {
          label: 'Toggle AI Chat',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('toggle-chat');
            }
          }
        },
        { type: 'separator' },
        // Tab selection like Chrome: Cmd/Ctrl + 1-9
        ...Array.from({ length: 9 }, (_, i) => ({
          label: i === 8 ? 'Switch to Last Tab' : `Switch to Tab ${i + 1}`,
          accelerator: `CmdOrCtrl+${i + 1}`,
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.send('select-tab', { index: i + 1 });
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

  // Register global shortcuts for tab selection (Cmd/Ctrl + 1..9)
  try {
    for (let i = 1; i <= 9; i++) {
      const accelerator = `CommandOrControl+${i}`;
      const ok = globalShortcut.register(accelerator, () => {
        if (mainWindow) {
          mainWindow.webContents.send('select-tab', { index: i });
        }
      });
      if (!ok) {
        console.warn('Failed to register shortcut:', accelerator);
      }
    }
  } catch (err) {
    console.error('Error registering global shortcuts:', err);
  }

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

// Ensure shortcuts are cleaned up
app.on('will-quit', () => {
  try {
    globalShortcut.unregisterAll();
  } catch (err) {
    console.error('Error unregistering global shortcuts:', err);
  }
});
