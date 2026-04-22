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

import { exec, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import util from 'util';
const execAsync = util.promisify(exec);

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
      preload: path.join(__dirname, 'preload.cjs'),
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
    width: 500,
    height: 450,
    x: 100,
    y: 100,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    titleBarStyle: 'hidden',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  console.log('--- AXIOM FORGE DIAGNOSTICS [v1.1.10] ---');
  console.log('[Main] Floating window created with size: 500x450');
  console.log('[Main] Current directory:', __dirname);

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

  // Show window when ready
  floatingWindow.once('ready-to-show', () => {
    floatingWindow.show();
    floatingWindow.focus();
  });

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
      case 'generate':
      case 'build':
        if (searchParams.id) {
          console.log('[Deep Link] Triggering generation for manifest:', searchParams.id);
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
  console.log('[Protocol] Attempting to register "axiom://" protocol...');
  
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      const devPath = path.resolve(process.argv[1]);
      console.log('[Protocol] Registering in DEV mode with path:', devPath);
      app.setAsDefaultProtocolClient('axiom', process.execPath, [devPath]);
    }
  } else {
    console.log('[Protocol] Registering in PROD mode.');
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

app.on('before-quit', () => {
  console.log('[App] Shutting down Axiom Forge...');
  // Force process exit after a short delay to allow cleanup
  setTimeout(() => process.exit(0), 500);
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
ipcMain.handle('project:get-all', () => {
  try {
    // 1. Load existing registered projects from store
    let projects = store.get('projects', []);
    const registeredIds = new Set(projects.map(p => p.id));

    // 2. Scan disk for any projects not yet registered
    const projectsDir = path.join(os.homedir(), '.axiom-forge', 'projects');
    let diskFolders = [];
    try {
      diskFolders = fs.readdirSync(projectsDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name);
    } catch (e) {
      // Directory doesn't exist yet — skip
    }

    for (const folderName of diskFolders) {
      if (registeredIds.has(folderName)) continue;

      // Try to read axiom-manifest.json for metadata
      let meta = {};
      try {
        const manifestPath = path.join(projectsDir, folderName, 'axiom-manifest.json');
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        meta = JSON.parse(raw);
      } catch (e) {
        // No manifest — use folder name as fallback
      }

      const newProject = {
        id: folderName,
        name: meta.name || folderName,
        description: meta.description || 'Generated project',
        status: 'ready',
        path: path.join(projectsDir, folderName),
        metadata: {
          techStack: meta.techStack || {},
          filesGenerated: meta.files?.length || 0,
        },
        createdAt: meta.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      projects.push(newProject);
      registeredIds.add(folderName);
      console.log(`[Project] Auto-discovered: ${folderName}`);
    }

    // 3. Migrate: fill in missing 'path' for already-registered projects
    let needsSave = false;
    projects = projects.map(p => {
      if (!p.path) {
        const expectedPath = path.join(projectsDir, p.id);
        // Only set path if the folder actually exists
        try {
          fs.accessSync(expectedPath);
          needsSave = true;
          return { ...p, path: expectedPath };
        } catch (e) {
          // Folder not found — leave as is
        }
      }
      return p;
    });

    // 4. Persist any newly discovered or migrated projects
    store.set('projects', projects);

    return { success: true, projects };
  } catch (error) {
    console.error('[Project] Get all error:', error);
    return { success: false, error: error.message, projects: [] };
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
  const logPath = 'C:\\Users\\StefanV\\Desktop\\Projects\\axiom-forge\\axiom-live-debug.log';
  const timestamp = new Date().toISOString();
  
  try {
    fs.appendFileSync(logPath, `\n[${timestamp}] --- NEW TASK RECEIVED ---\n`);
    fs.appendFileSync(logPath, `[${timestamp}] ManifestId: ${manifestId} | ProjectId: ${projectId}\n`);
    
    // Start generation asynchronously
    taskOrchestrator.startGeneration(manifestId, projectId, token, (update) => {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] PROGRESS ${update.progress}%: ${update.phase} - ${update.message}\n`);
      
      // Send progress updates to renderer
      mainWindow?.webContents.send('task:progress', update);
      floatingWindow?.webContents.send('task:progress', update);

      // AUTO-SAVE: If task is 100% complete, register it in the persistent store
      if (update.progress === 100 && update.project) {
        try {
          const projects = store.get('projects', []);
          const existingIndex = projects.findIndex(p => p.id === update.project.id);
          
          if (existingIndex >= 0) {
            projects[existingIndex] = { ...projects[existingIndex], ...update.project, updatedAt: new Date().toISOString() };
          } else {
            projects.push({
              ...update.project,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            });
          }
          
          store.set('projects', projects);
          console.log(`[Main] Auto-saved project: ${update.project.name} (${update.project.id})`);
        } catch (saveError) {
          console.error('[Main] Failed to auto-save project:', saveError);
        }
      }
    }).catch(error => {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] ERROR: ${error.message}\nSTACK: ${error.stack}\n`);
    }).catch(error => {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ERROR: ${error.message}\nSTACK: ${error.stack}\n`);
    });
    
    return { success: true, message: 'Generation task dispatched' };
  } catch (error) {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] CRITICAL SETUP ERROR: ${error.message}\n`);
    return { success: false, error: error.message };
  }
});

// Scan project folder on disk and return actual file list
ipcMain.handle('project:get-files', (event, { projectId }) => {
  try {
    const projectDir = path.join(os.homedir(), '.axiom-forge', 'projects', projectId);
    const result = [];

    const scanDir = (dir, baseDir) => {
      let entries;
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch (e) {
        return;
      }
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        if (entry.isDirectory()) {
          // Skip hidden and node_modules
          if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
            scanDir(fullPath, baseDir);
          }
        } else {
          result.push({ path: relativePath, language: entry.name.split('.').pop() || 'txt' });
        }
      }
    };

    scanDir(projectDir, projectDir);
    return { success: true, files: result };
  } catch (error) {
    console.error('[Project] Get files error:', error);
    return { success: false, files: [], error: error.message };
  }
});

// Read actual content of a specific file in a project
ipcMain.handle('project:read-file', (event, { projectId, filePath }) => {
  try {
    const projectDir = path.join(os.homedir(), '.axiom-forge', 'projects', projectId);
    const fullPath = path.join(projectDir, filePath);
    
    // Security: ensure path stays within project directory
    if (!fullPath.startsWith(projectDir)) {
      return { success: false, error: 'Access denied: path outside project directory' };
    }
    
    const content = fs.readFileSync(fullPath, 'utf-8');
    return { success: true, content };
  } catch (error) {
    console.error('[Project] Read file error:', error);
    return { success: false, error: error.message, content: '' };
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
    // Clear old metadata before starting a fresh deploy
    const projects = store.get('projects', []);
    const idx = projects.findIndex(p => p.id === projectId);
    if (idx >= 0) {
      projects[idx].status = 'deploying';
      projects[idx].metadata = {
        ...projects[idx].metadata,
        githubUrl: null,
        deployUrl: null
      };
      store.set('projects', projects);
    }

    const result = await taskOrchestrator.startDeployment(projectId, (update) => {
      mainWindow?.webContents.send('task:progress', update);
      floatingWindow?.webContents.send('task:progress', update);
    });

    // Persist deploy results to store so UI shows GitHub/Vercel links
    if (result?.github || result?.vercel) {
      const projects = store.get('projects', []);
      const idx = projects.findIndex(p => p.id === projectId);
      if (idx >= 0) {
        projects[idx].status = 'live';
        projects[idx].metadata = {
          ...projects[idx].metadata,
          githubUrl: result.github?.repoUrl || null,
          deployUrl: result.vercel?.url ? `https://${result.vercel.url}` : null,
          repoName: result.github?.repoName || null
        };
        projects[idx].updatedAt = new Date().toISOString();
        store.set('projects', projects);
        console.log(`[Deploy] Project ${projectId} is now LIVE`);
      }
    }

    return { success: true, result };
  } catch (error) {
    console.error('[Task] Deployment error:', error);

    // Mark as error in store
    const projects = store.get('projects', []);
    const idx = projects.findIndex(p => p.id === projectId);
    if (idx >= 0) {
      projects[idx].status = 'error';
      projects[idx].updatedAt = new Date().toISOString();
      store.set('projects', projects);
    }

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

ipcMain.handle('task:get-active-by-project', async (event, { projectId }) => {
  try {
    const task = taskOrchestrator.getActiveTaskByProject(projectId);
    return { success: true, task };
  } catch (error) {
    console.error('[Task] Get active by project error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ollama:check-installed', async () => {
  try {
    const cmd = process.platform === 'win32' ? 'where ollama' : 'which ollama';
    await execAsync(cmd);
    return { installed: true };
  } catch (e) {
    return { installed: false };
  }
});

ipcMain.handle('ollama:start-server', async () => {
  try {
    console.log('[Ollama] Attempting to start server via "ollama serve"...');
    const ollamaProcess = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore'
    });
    ollamaProcess.unref();
    
    // Polling until available or timeout (10 seconds)
    for (let i = 0; i < 10; i++) {
       await new Promise(r => setTimeout(r, 1000));
       const check = await taskOrchestrator.ollama.healthCheck();
       if (check.available) {
         console.log('[Ollama] Server started successfully and is reachable.');
         return { success: true };
       }
       console.log(`[Ollama] Waiting for server... (${i + 1}/10)`);
    }
    
    return { success: false, error: 'Ollama took too long to start' };
  } catch (e) {
    console.error('[Ollama] Startup error:', e);
    return { success: false, error: e.message };
  }
});

/**
 * Ollama Engine IPC
 */
ipcMain.handle('ollama:check-health', async () => {
  try {
    return await taskOrchestrator.ollama.healthCheck();
  } catch (error) {
    console.error('[Ollama] Health check error:', error);
    return { available: false, error: error.message };
  }
});

ipcMain.handle('ollama:pull-model', async (event, { model }) => {
  try {
    return await taskOrchestrator.ollama.pullModel(model, (progress) => {
      // Forward pull progress to renderer
      mainWindow?.webContents.send('ollama:pull-progress', progress);
    });
  } catch (error) {
    console.error('[Ollama] Pull model error:', error);
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
