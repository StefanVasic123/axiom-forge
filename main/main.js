/**
 * Axiom Forge - Main Process
 * Handles protocol registration, window management, and secure IPC
 */

import { app, BrowserWindow, ipcMain, dialog, shell, protocol } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import { SecurityManager } from '../src/lib/security.js';
import { TaskOrchestrator } from '../src/lib/taskOrchestrator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize secure store with encryption
const store = new Store({
  name: 'axiom-forge-config',
  encryptionKey: process.env.AXIOM_ENCRYPTION_KEY || 'axiom-forge-secure-store-v1'
});

// Security manager for token handling
const securityManager = new SecurityManager(store);

// Task orchestrator for state machine
const taskOrchestrator = new TaskOrchestrator(securityManager);

// Window references
let mainWindow = null;
let floatingWindow = null;

// Deep link queue (for handling links before app is ready)
let deepLinkQueue = [];

/**
 * Create the main application window
 */
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  // Load the app
  const isDev = process.env.NODE_ENV === 'development';
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    // Process any queued deep links
    if (deepLinkQueue.length > 0) {
      deepLinkQueue.forEach(url => handleDeepLink(url));
      deepLinkQueue = [];
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

/**
 * Create the floating progress window (always-on-top)
 */
function createFloatingWindow(projectData = null) {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.focus();
    return floatingWindow;
  }

  floatingWindow = new BrowserWindow({
    width: 400,
    height: 200,
    x: 100,
    y: 100,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    titleBarStyle: 'hidden',
    frame: false,
    transparent: true,
    opacity: 0.95,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  const isDev = process.env.NODE_ENV === 'development';
  const route = projectData ? `/floating?projectId=${projectData.id}` : '/floating';
  
  if (isDev) {
    floatingWindow.loadURL(`http://localhost:5173${route}`);
  } else {
    floatingWindow.loadFile(path.join(__dirname, '../dist/index.html'), {
      hash: `/floating${projectData ? `?projectId=${projectData.id}` : ''}`
    });
  }

  // Make draggable
  floatingWindow.setMovable(true);

  floatingWindow.on('closed', () => {
    floatingWindow = null;
  });

  return floatingWindow;
}

/**
 * Handle deep link URLs
 */
function handleDeepLink(url) {
  console.log('[Deep Link] Received:', url);
  
  if (!mainWindow) {
    deepLinkQueue.push(url);
    return;
  }

  try {
    const urlObj = new URL(url);
    
    if (urlObj.protocol !== 'axiom:') {
      console.warn('[Deep Link] Invalid protocol:', urlObj.protocol);
      return;
    }

    const action = urlObj.hostname;
    const searchParams = Object.fromEntries(urlObj.searchParams);

    switch (action) {
      case 'build':
        if (searchParams.id) {
          mainWindow.webContents.send('deep-link:build', {
            manifestId: searchParams.id,
            ...searchParams
          });
          // Show floating progress window
          createFloatingWindow({ id: searchParams.id });
        }
        break;

      case 'config':
        if (searchParams.projectId) {
          mainWindow.webContents.send('deep-link:config', {
            projectId: searchParams.projectId,
            ...searchParams
          });
        }
        break;

      case 'deploy':
        if (searchParams.projectId) {
          mainWindow.webContents.send('deep-link:deploy', {
            projectId: searchParams.projectId,
            ...searchParams
          });
        }
        break;

      default:
        console.warn('[Deep Link] Unknown action:', action);
    }
  } catch (error) {
    console.error('[Deep Link] Error parsing URL:', error);
  }
}

/**
 * Register custom protocol
 */
function registerProtocol() {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient('axiom', process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient('axiom');
  }
}

// ==================== APP EVENTS ====================

// Lock single instance
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('[App] Another instance is running. Quitting.');
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, focus our window instead
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    // Handle deep link from second instance
    const url = commandLine.find(arg => arg.startsWith('axiom://'));
    if (url) {
      handleDeepLink(url);
    }
  });

  app.whenReady().then(() => {
    registerProtocol();
    createMainWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

// Handle deep links on macOS
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Handle deep links on Windows (during startup)
if (process.platform === 'win32') {
  const deepLink = process.argv.find(arg => arg.startsWith('axiom://'));
  if (deepLink) {
    deepLinkQueue.push(deepLink);
  }
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ==================== SECURE IPC HANDLERS ====================

/**
 * Security Layer IPC
 */
ipcMain.handle('security:store-token', async (event, { key, value }) => {
  try {
    await securityManager.storeToken(key, value);
    return { success: true };
  } catch (error) {
    console.error('[Security] Store token error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('security:get-token', async (event, { key }) => {
  try {
    const value = await securityManager.getToken(key);
    return { success: true, value };
  } catch (error) {
    console.error('[Security] Get token error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('security:delete-token', async (event, { key }) => {
  try {
    await securityManager.deleteToken(key);
    return { success: true };
  } catch (error) {
    console.error('[Security] Delete token error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('security:has-token', async (event, { key }) => {
  try {
    const exists = await securityManager.hasToken(key);
    return { success: true, exists };
  } catch (error) {
    console.error('[Security] Has token error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('security:clear-all-tokens', async () => {
  try {
    await securityManager.clearAllTokens();
    return { success: true };
  } catch (error) {
    console.error('[Security] Clear tokens error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Project Management IPC
 */
ipcMain.handle('project:get-all', async () => {
  try {
    const projects = store.get('projects', []);
    return { success: true, projects };
  } catch (error) {
    console.error('[Project] Get all error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('project:get', async (event, { id }) => {
  try {
    const projects = store.get('projects', []);
    const project = projects.find(p => p.id === id);
    return { success: true, project };
  } catch (error) {
    console.error('[Project] Get error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('project:save', async (event, projectData) => {
  try {
    const projects = store.get('projects', []);
    const existingIndex = projects.findIndex(p => p.id === projectData.id);
    
    if (existingIndex >= 0) {
      projects[existingIndex] = { ...projects[existingIndex], ...projectData, updatedAt: new Date().toISOString() };
    } else {
      projects.push({
        ...projectData,
        id: projectData.id || crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
    }
    
    store.set('projects', projects);
    return { success: true, project: projects.find(p => p.id === projectData.id) };
  } catch (error) {
    console.error('[Project] Save error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('project:delete', async (event, { id }) => {
  try {
    const projects = store.get('projects', []);
    const filtered = projects.filter(p => p.id !== id);
    store.set('projects', filtered);
    return { success: true };
  } catch (error) {
    console.error('[Project] Delete error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('project:update-status', async (event, { id, status, metadata = {} }) => {
  try {
    const projects = store.get('projects', []);
    const projectIndex = projects.findIndex(p => p.id === id);
    
    if (projectIndex >= 0) {
      projects[projectIndex].status = status;
      projects[projectIndex].metadata = { ...projects[projectIndex].metadata, ...metadata };
      projects[projectIndex].updatedAt = new Date().toISOString();
      store.set('projects', projects);
    }
    
    return { success: true };
  } catch (error) {
    console.error('[Project] Update status error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Task Orchestrator IPC
 */
ipcMain.handle('task:start-generation', async (event, { manifestId, projectId, token }) => {
  try {
    const result = await taskOrchestrator.startGeneration(manifestId, projectId, token, (update) => {
      // Send progress updates to renderer
      mainWindow?.webContents.send('task:progress', update);
      floatingWindow?.webContents.send('task:progress', update);
    });
    return { success: true, result };
  } catch (error) {
    console.error('[Task] Generation error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('task:configure-project', async (event, { projectId, envVars }) => {
  try {
    const result = await taskOrchestrator.configureProject(projectId, envVars);
    return { success: true, result };
  } catch (error) {
    console.error('[Task] Configuration error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('task:start-deployment', async (event, { projectId }) => {
  try {
    const result = await taskOrchestrator.startDeployment(projectId, (update) => {
      mainWindow?.webContents.send('task:progress', update);
      floatingWindow?.webContents.send('task:progress', update);
    });
    return { success: true, result };
  } catch (error) {
    console.error('[Task] Deployment error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('task:stop', async (event, { taskId }) => {
  try {
    await taskOrchestrator.stopTask(taskId);
    return { success: true };
  } catch (error) {
    console.error('[Task] Stop error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('task:get-status', async (event, { taskId }) => {
  try {
    const status = await taskOrchestrator.getTaskStatus(taskId);
    return { success: true, status };
  } catch (error) {
    console.error('[Task] Get status error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * Window Management IPC
 */
ipcMain.handle('window:show-floating', async (event, projectData) => {
  createFloatingWindow(projectData);
  return { success: true };
});

ipcMain.handle('window:hide-floating', async () => {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.close();
  }
  return { success: true };
});

ipcMain.handle('window:update-floating-progress', async (event, data) => {
  if (floatingWindow && !floatingWindow.isDestroyed()) {
    floatingWindow.webContents.send('floating:update', data);
  }
  return { success: true };
});

/**
 * External Links & Shell
 */
ipcMain.handle('shell:open-external', async (event, url) => {
  try {
    // Validate URL for security
    const allowedProtocols = ['https:', 'http:'];
    const urlObj = new URL(url);
    
    if (!allowedProtocols.includes(urlObj.protocol)) {
      throw new Error('Invalid protocol');
    }
    
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('[Shell] Open external error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dialog:show-open', async (event, options) => {
  try {
    const result = await dialog.showOpenDialog(mainWindow, options);
    return { success: true, result };
  } catch (error) {
    console.error('[Dialog] Show open error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('dialog:show-save', async (event, options) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow, options);
    return { success: true, result };
  } catch (error) {
    console.error('[Dialog] Show save error:', error);
    return { success: false, error: error.message };
  }
});

/**
 * App Info IPC
 */
ipcMain.handle('app:get-version', () => {
  return { success: true, version: app.getVersion() };
});

ipcMain.handle('app:get-path', (event, name) => {
  try {
    const appPath = app.getPath(name);
    return { success: true, path: appPath };
  } catch (error) {
    console.error('[App] Get path error:', error);
    return { success: false, error: error.message };
  }
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // Reject all certificate errors for security
  event.preventDefault();
  callback(false);
});

console.log('[Main] Axiom Forge main process initialized');
