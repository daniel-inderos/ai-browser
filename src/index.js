const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('node:path');
const { initialize, enable } = require('@electron/remote/main');
const { streamChat } = require('./openaiHelper');

// Initialize @electron/remote
initialize();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow;

const createWindow = () => {
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

  // Enable remote module for this window
  enable(mainWindow.webContents);

  // Load the browser interface
  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

ipcMain.handle('get-preload-path', () => {
  return path.join(__dirname, 'preload.js');
});

// IPC handlers for tab management
ipcMain.handle('create-tab', async (event, url = 'https://start.duckduckgo.com') => {
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
    if (url === 'newtab.html' || url.startsWith('newtab.html?')) {
      const query = url.includes('?') ? url.substring(url.indexOf('?')) : '';
      url = `file://${path.join(__dirname, 'newtab.html')}${query}`;
      return { success: true, url };
    }
    // Basic URL validation and formatting
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      if (url.includes('.') && !url.includes(' ')) {
        url = 'https://' + url;
      } else {
        url = 'https://start.duckduckgo.com/?q=' + encodeURIComponent(url);
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
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(() => {
  createWindow();
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
