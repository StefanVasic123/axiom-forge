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
import { DevServerManager } from '../src/lib/devServerManager.js';
import { HardwareManager } from '../src/lib/hardware.js';
import { IKFirewallCore } from '@ik-firewall/core';

process.env.IK_DESKTOP_FREE_MODE = 'true'; // Protect local usage from web telemetry

import { exec, spawn } from 'child_process';
import fsSync from 'fs';
const fs = fsSync.promises;
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

// Local Dev Server Manager
const devServerManager = new DevServerManager();

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
      webSecurity: true,
      webviewTag: true
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

    // Connect DevServerManager logs to MainWindow
    devServerManager.onLog(({ text, type, status }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        if (text) mainWindow.webContents.send('server:log', { text, type });
        if (status) mainWindow.webContents.send('server:status', { status });
      }
    });
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

  console.log('--- AXIOM FORGE DIAGNOSTICS [v1.1.12] ---');
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
      diskFolders = fsSync.readdirSync(projectsDir, { withFileTypes: true })
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
        const raw = fsSync.readFileSync(manifestPath, 'utf-8');
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
          fsSync.accessSync(expectedPath);
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

// Commit current state of a project to local git
ipcMain.handle('project:commit', async (event, { projectId, message }) => {
  try {
    const projects = store.get('projects', []);
    const project = projects.find(p => p.id === projectId);
    const projectPath = project?.path || path.join(os.homedir(), '.axiom-forge', 'projects', projectId);

    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    const run = (cmd) => execAsync(cmd, { cwd: projectPath });

    // Ensure git is initialized
    const gitDir = path.join(projectPath, '.git');
    try {
      await fs.access(gitDir);
    } catch {
      await run('git init');
      await run('git checkout -b main').catch(() => run('git branch -M main'));
      await run('git config user.email "axiom-forge@localhost"');
      await run('git config user.name "Axiom Forge"');
    }

    await run('git add .');
    const commitMsg = message || `Axiom Forge checkpoint — ${new Date().toLocaleString()}`;
    
    try {
      await run(`git commit -m "${commitMsg.replace(/"/g, "'")}"`);
      console.log(`[Git] Committed: ${commitMsg}`);
      return { success: true, message: commitMsg };
    } catch (e) {
      // Nothing to commit
      return { success: true, message: 'Nothing new to commit.' };
    }
  } catch (error) {
    console.error('[Project] Commit error:', error);
    return { success: false, error: error.message };
  }
});

// Push local commits to GitHub (without triggering Vercel redeploy)
ipcMain.handle('project:push-to-github', async (event, { projectId }) => {
  try {
    const result = await taskOrchestrator.pushToGitHub(projectId, (update) => {
      mainWindow?.webContents.send('task:progress', update);
    });
    
    // Update store with github URL
    if (result?.repoUrl) {
      const projects = store.get('projects', []);
      const idx = projects.findIndex(p => p.id === projectId);
      if (idx >= 0) {
        projects[idx].metadata = { ...projects[idx].metadata, githubUrl: result.repoUrl };
        store.set('projects', projects);
      }
    }
    
    return { success: true, ...result };
  } catch (error) {
    console.error('[Project] Push to GitHub error:', error);
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
 * Editor IPC
 */

// Write a file to disk (used by Monaco Editor Ctrl+S)
ipcMain.handle('editor:write-file', async (event, { projectId, filePath, content }) => {
  try {
    const projects = store.get('projects', []);
    const project = projects.find(p => p.id === projectId);
    const projectPath = project?.path || path.join(os.homedir(), '.axiom-forge', 'projects', projectId);
    const fullPath = path.join(projectPath, filePath);

    // Safety: ensure path is within project directory
    if (!fullPath.startsWith(projectPath)) {
      return { success: false, error: 'Path traversal detected' };
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    console.log(`[Editor] Wrote file: ${filePath}`);
    return { success: true };
  } catch (error) {
    console.error('[Editor] Write file error:', error);
    return { success: false, error: error.message };
  }
});

// ----------------------------------------------------------------------------
// IK FIREWALL INIT (For AI Editor & Optimizer Dashboard)
// ----------------------------------------------------------------------------
const ik = IKFirewallCore.getInstance({
  providerMode: 'local',
  localAuditEndpoint: 'http://127.0.0.1:11434',
  safeMode: true
}, {
  onStatus: (msg) => {
    console.log(`[IK_STATUS] ${msg}`);
    if (mainWindow) mainWindow.webContents.send('ik:status', msg);
  },
  onAuditComplete: (metrics) => {
    if (mainWindow) mainWindow.webContents.send('ik:audit', metrics);
  },
  onDNAChange: (dna) => {
    if (mainWindow) mainWindow.webContents.send('ik:dna', dna);
  }
});

// Store for Custom Directives
const appStore = new Store();

// IPC handleri za AI Optimizer Dashboard postavke
ipcMain.handle('ik:get-config', () => ik.getConfig());
ipcMain.handle('ik:set-config', (event, newConfig) => {
  ik.setConfig(newConfig);
  return { success: true };
});

// Perzistentno čuvanje Custom Direktiva na disku
ipcMain.handle('ik:get-custom-directive', () => {
  return store.get('axiom_custom_directives', '');
});
ipcMain.handle('ik:set-custom-directive', (event, text) => {
  store.set('axiom_custom_directives', text);
  return { success: true };
});

// Hardware & Model Config IPCs
ipcMain.handle('hardware:get-profile', () => {
  return HardwareManager.getHardwareProfile();
});

ipcMain.handle('hardware:get-selected-model', () => {
  return store.get('selected_llm_model', null); // Returns null if not set
});

ipcMain.handle('hardware:set-selected-model', (event, { modelId }) => {
  store.set('selected_llm_model', modelId);
  return { success: true };
});

ipcMain.handle('hardware:get-builder-model', () => {
  return store.get('selected_builder_model', null);
});

ipcMain.handle('hardware:set-builder-model', (event, { modelId }) => {
  store.set('selected_builder_model', modelId);
  return { success: true };
});

ipcMain.handle('hardware:get-editor-model', () => {
  return store.get('selected_editor_model', null);
});

ipcMain.handle('hardware:set-editor-model', (event, { modelId }) => {
  store.set('selected_editor_model', modelId);
  return { success: true };
});

// AI code editing via local Ollama (With IK Firewall)
ipcMain.handle('editor:ai-edit', async (event, { filePath, fileContent, prompt, projectId, visualContext }) => {
  try {
    let featureContext = '';
    
    // Attempt to load axiom-features.json and extract associated files for the LLM
    if (projectId) {
      try {
        const projectDir = path.join(os.homedir(), '.axiom-forge', 'projects', projectId);
        const featuresPath = path.join(projectDir, 'axiom-features.json');
        if (fsSync.existsSync(featuresPath)) {
          const featuresData = JSON.parse(fsSync.readFileSync(featuresPath, 'utf-8'));
          
          // Try to find the feature matching visual context or the edited file
          const targetComponent = visualContext?.component || null;
          const targetFile = visualContext?.file || path.basename(filePath);
          
          let matchedFeature = null;
          
          for (const feat of featuresData.features || []) {
             const hasFile = feat.files?.some(f => f.path.includes(targetFile) || f.path.includes(targetComponent));
             if (hasFile || feat.id === targetComponent || feat.name === targetComponent) {
               matchedFeature = feat;
               break;
             }
          }
          
          if (matchedFeature) {
            featureContext += `\n--- ASSOCIATED FEATURE: ${matchedFeature.name} ---\n`;
            featureContext += `Description: ${matchedFeature.description}\n\n`;
            
            // Append the content of associated files (excluding the one currently being edited)
            for (const f of matchedFeature.files || []) {
               const absPath = path.join(projectDir, f.path);
               if (absPath !== filePath && fsSync.existsSync(absPath)) {
                  // limit size to avoid blowing up context window (e.g. max 200 lines or 10kb)
                  const content = fsSync.readFileSync(absPath, 'utf-8');
                  featureContext += `// File: ${f.path} (Role: ${f.role})\n`;
                  featureContext += content.substring(0, 3000) + (content.length > 3000 ? '\n...[truncated]...\n' : '\n');
                  featureContext += `\n`;
               }
            }
          }
        }
      } catch (err) {
        console.warn('[MAIN] Could not load feature context:', err.message);
      }
    }

    // 1. Učitavamo sačuvanu direktivu iz baze/fajla i spajamo sa axiom-features.json
    const customDirective = store.get('axiom_custom_directives', '');
    let contextStr = featureContext ? `FEATURE_CONTEXT (axiom-features.json):\n${featureContext}\n` : '';
    if (customDirective) {
      contextStr += `USER_CUSTOM_DIRECTIVES:\n${customDirective}\n`;
    }
    
    const configOverride = contextStr ? { customContext: contextStr } : {};

    // 2. AUDIT FAZA: Šaljemo Pitanje u Firewall (Brzi LLM poziv)
    ik.hooks?.onStatus?.("🔥 Započinjem Audit Fazu...");
    const metrics = await ik.analyzeAIAssisted(prompt, undefined, 'professional', undefined, configOverride);
    
    // 3. CRYSTALLIZE: Kompresujemo KORISNIČKI ZAHTEV (ne kod!)
    const optimizedPrompt = ik.crystallize(prompt, metrics);
    
    // --- MULTI-AGENT PIPELINE ---
    
    // STAGE 1: MULTI-FACET ANALYZER
    ik.hooks?.onStatus?.("🔍 Faza 1: Analiziram funkcionalni opseg i simbole...");
    const scopePrompt = `Identify the line ranges AND the functional symbols (functions/classes/interfaces) relevant to this request: "${optimizedPrompt}".
Output ONLY a JSON object: {"ranges": [{"start": 1, "end": 10}], "symbols": ["Login", "handleSubmit"]}. No other text.`;
    
    const analysisResponse = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: store.get('selected_llm_model', 'qwen2.5-coder:1.5b'),
        messages: [{ role: 'user', content: analysisPrompt + "\n\nCODE:\n" + fileContent }],
        stream: false
      })
    });
    const scopeData = await analysisResponse.json();
    const scopeJson = scopeData.message?.content || "{}";
    console.log("[MAIN] Identified Scope:", scopeJson);

    let ranges = [];
    let symbols = [];
    try {
      const parsed = JSON.parse(scopeJson.match(/\{.*\}/s)[0]);
      ranges = parsed.ranges || [];
      symbols = parsed.symbols || [];
    } catch (e) {
      console.warn("[MAIN] Failed to parse scope JSON.");
    }

    if (ranges.length === 0) {
      ranges = [{ start: 1, end: fileContent.split('\n').length }];
    }

    const { start: startLine, end: endLine } = ranges[0];
    const originalLines = fileContent.split('\n');
    const windowSnippet = originalLines.slice(Math.max(0, startLine - 1), endLine).join('\n');

    // STAGE 2: CONTEXT-AWARE ARCHITECT
    ik.hooks?.onStatus?.("🎨 Faza 2: Arhitekta dizajnira rešenje uz vizuelni kontekst...");
    const visualInfo = visualContext ? `VISUAL_CONTEXT (Element Clicked):\n- Component: ${visualContext.component || 'Unknown'}\n- Tag: ${visualContext.tag}\n- Classes: ${visualContext.classes}\n- Text: ${visualContext.text}\n` : '';
    
    const solutionPrompt = `${visualInfo}
RELEVANT SYMBOLS: ${symbols.join(', ')}

ORIGINAL CODE:
${windowSnippet}

TASK: ${optimizedPrompt}

Generate the exact logical changes needed. Output ONLY the new code. No markdown.`;

    const solutionResponse = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: store.get('selected_llm_model', 'qwen2.5-coder:1.5b'),
        messages: [{ role: 'user', content: solutionPrompt }],
        stream: false
      })
    });
    const solutionData = await solutionResponse.json();
    const proposedSolution = solutionData.message?.content || "";
    console.log("[MAIN] Proposed Solution:", proposedSolution.substring(0, 100) + "...");

    // STAGE 3: PRECISION INTEGRATION (Integrator)
    ik.hooks?.onStatus?.("🚀 Faza 3: Vršim preciznu integraciju u originalni kod...");
    const integratorSystemPrompt = metrics.agentDirective || "You are a code integrator. Return ONLY the final integrated code snippet.";
    
    const integratorUserMessage = `ORIGINAL SNIPPET:
${windowSnippet}

PROPOSED SOLUTION:
${proposedSolution}

Integrate the PROPOSED SOLUTION into the ORIGINAL SNIPPET perfectly. 
Keep all surrounding logic, imports, and structure. 
Output ONLY the final integrated code for this specific block (lines ${startLine}-${endLine}).`;

    // 5. Šaljemo direktivu Frontend-u
    console.log("[MAIN] Sending ai-directive to renderer...");
    try {
      event.sender.send('editor:ai-directive', { 
        directive: metrics.agentDirective || "You are a code editor. Output ONLY code.",
        optimizedPrompt: optimizedPrompt,
        scope: scope
      });
    } catch (err) {
      console.error("[MAIN] Error sending directive:", err);
    }

    ik.hooks?.onStatus?.("🚀 Izvršavam Code Edit...");
    
    const response = await fetch('http://127.0.0.1:11434/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: store.get('selected_llm_model', 'qwen2.5-coder:1.5b'),
        messages: [
          { role: 'system', content: integratorSystemPrompt },
          { role: 'user', content: integratorUserMessage }
        ],
        stream: true,
        options: { temperature: 0.1, num_predict: 2048 }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.status}`);
    }

    // Čitamo stream (postojeća logika za streaming tokena)
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullRawContent = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; 
      
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.message?.content) {
            fullRawContent += data.message.content;
            try {
              event.sender.send('editor:ai-chunk', { token: data.message.content });
            } catch (e) {
              // Ignore send error
            }
          }
        } catch (e) {
          // Ignore parse error
        }
      }
    }

    let newContent = fullRawContent;

    // --- STAGE 3: APPLY (Programmatic Window Injection) ---
    if (rangeMatch && fullRawContent.length > 0) {
      console.log(`[MAIN] Injecting modified snippet back into lines ${startLine}-${endLine}`);
      const lines = fileContent.split('\n');
      
      // Clean the LLM output (remove markdown fences if any)
      let cleanedSnippet = fullRawContent.replace(/^```[\w]*\n/m, '').replace(/\n```$/m, '').trim();
      
      const before = lines.slice(0, startLine - 1);
      const after = lines.slice(endLine);
      
      newContent = [...before, cleanedSnippet, ...after].join('\n');
    } else {
      // Fallback: cleaning
      newContent = newContent.replace(/^[\s\S]*?```[\w]*\n?/m, '').replace(/\n?```[\s\S]*?$/m, '').trim();
    }

    console.log(`[MAIN] Final processed content length: ${newContent.length}`);
    ik.hooks?.onStatus?.("✅ Kod uspešno izmenjen!");
    return { success: true, newContent: newContent || fullRawContent };

    console.log(`[MAIN] Final processed content length: ${newContent.length}`);
    ik.hooks?.onStatus?.("✅ Kod uspešno izmenjen!");
    return { success: true, newContent: newContent || fullRawContent };
  } catch (error) {
    console.error('[Editor] AI edit error:', error);
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
    fsSync.appendFileSync(logPath, `\n[${timestamp}] --- NEW TASK RECEIVED ---\n`);
    fsSync.appendFileSync(logPath, `[${timestamp}] ManifestId: ${manifestId} | ProjectId: ${projectId}\n`);
    
    // Start generation asynchronously
    // Ensure we are using the currently selected model from user configuration
    taskOrchestrator.ollama.model = store.get('selected_llm_model', 'qwen2.5-coder:1.5b');
    
    taskOrchestrator.startGeneration(manifestId, projectId, token, (update) => {
      fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] PROGRESS ${update.progress}%: ${update.phase} - ${update.message}\n`);
      
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
    fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] ERROR: ${error.message}\nSTACK: ${error.stack}\n`);
    }).catch(error => {
      fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] ERROR: ${error.message}\nSTACK: ${error.stack}\n`);
    });
    
    return { success: true, message: 'Generation task dispatched' };
  } catch (error) {
    fsSync.appendFileSync(logPath, `[${new Date().toISOString()}] CRITICAL SETUP ERROR: ${error.message}\n`);
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
        entries = fsSync.readdirSync(dir, { withFileTypes: true });
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
    
    const content = fsSync.readFileSync(fullPath, 'utf-8');
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
    // Get the full project details to pass its metadata to the orchestrator
    const projects = store.get('projects', []);
    const idx = projects.findIndex(p => p.id === projectId);
    
    let projectMetadata = {};
    if (idx >= 0) {
      projectMetadata = projects[idx].metadata || {};
      projects[idx].status = 'deploying';
      projects[idx].metadata = {
        ...projects[idx].metadata,
        githubUrl: null,
        deployUrl: null
      };
      store.set('projects', projects);
    }

    const result = await taskOrchestrator.startDeployment(projectId, projectMetadata, (update) => {
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

ipcMain.handle('ollama:unload-model', async (event, { model }) => {
  try {
    return await taskOrchestrator.ollama.unloadModel(model);
  } catch (error) {
    console.error('[Ollama] Unload model error:', error);
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

// ==================== LOCAL SERVER CONTROL ====================

ipcMain.handle('server:start', async (event, { projectId, platform, techStack }) => {
  try {
    const projectsDir = path.join(os.homedir(), 'AxiomProjects');
    const projectPath = path.join(projectsDir, projectId);
    
    const cdpPort = await devServerManager.start(projectId, projectPath, platform, techStack);
    return { success: true, cdpPort };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('server:stop', async () => {
  try {
    devServerManager.stop();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('server:get-cdp-ws-url', async (event, { port }) => {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json`);
    const data = await res.json();
    // Usually the first target is the main window we want to inspect
    const target = data.find(t => t.type === 'page' && t.webSocketDebuggerUrl);
    if (target) {
      return { success: true, url: target.webSocketDebuggerUrl };
    }
    return { success: false, error: 'No page target found' };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('server:status', async (event, projectId) => {
  return { isRunning: devServerManager.isRunning(projectId) };
});

// Handle certificate errors
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  // Reject all certificate errors for security
  event.preventDefault();
  callback(false);
});

console.log('[Main] Axiom Forge main process initialized');
