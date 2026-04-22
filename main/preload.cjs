/**
 * Axiom Forge - Preload Script (CommonJS)
 * Secure ContextBridge for renderer process
 * NO direct Node.js access - all communication via IPC
 */

const { contextBridge, ipcRenderer } = require('electron');

// ==================== SECURITY LAYER API ====================
/**
 * Token management - All tokens are encrypted at rest
 */
const securityAPI = {
  storeToken: (key, value) => ipcRenderer.invoke('security:store-token', { key, value }),
  getToken: (key) => ipcRenderer.invoke('security:get-token', { key }),
  deleteToken: (key) => ipcRenderer.invoke('security:delete-token', { key }),
  hasToken: (key) => ipcRenderer.invoke('security:has-token', { key }),
  clearAllTokens: () => ipcRenderer.invoke('security:clear-all-tokens')
};

// ==================== PROJECT MANAGEMENT API ====================
const projectAPI = {
  getAll: () => ipcRenderer.invoke('project:get-all'),
  get: (id) => ipcRenderer.invoke('project:get', { id }),
  getFiles: (projectId) => ipcRenderer.invoke('project:get-files', { projectId }),
  readFile: (projectId, filePath) => ipcRenderer.invoke('project:read-file', { projectId, filePath }),
  save: (projectData) => ipcRenderer.invoke('project:save', projectData),
  delete: (id) => ipcRenderer.invoke('project:delete', { id }),
  updateStatus: (id, status, metadata = {}) => 
    ipcRenderer.invoke('project:update-status', { id, status, metadata })
};

// ==================== TASK ORCHESTRATOR API ====================
const taskAPI = {
  startGeneration: (manifestId, projectId, token) => 
    ipcRenderer.invoke('task:start-generation', { manifestId, projectId, token }),
  configureProject: (projectId, envVars) => 
    ipcRenderer.invoke('task:configure-project', { projectId, envVars }),
  startDeployment: (projectId) => 
    ipcRenderer.invoke('task:start-deployment', { projectId }),
  stop: (taskId) => ipcRenderer.invoke('task:stop', { taskId }),
  getStatus: (taskId) => ipcRenderer.invoke('task:get-status', { taskId }),
  getActiveTaskByProject: (projectId) => 
    ipcRenderer.invoke('task:get-active-by-project', { projectId }),
  onProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('task:progress', handler);
    return () => ipcRenderer.removeListener('task:progress', handler);
  }
};

// ==================== OLLAMA ENGINE API ====================
const ollamaAPI = {
  checkHealth: () => ipcRenderer.invoke('ollama:check-health'),
  checkInstalled: () => ipcRenderer.invoke('ollama:check-installed'),
  startServer: () => ipcRenderer.invoke('ollama:start-server'),
  pullModel: (model) => ipcRenderer.invoke('ollama:pull-model', { model }),
  onPullProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('ollama:pull-progress', handler);
    return () => ipcRenderer.removeListener('ollama:pull-progress', handler);
  }
};

// ==================== WINDOW MANAGEMENT API ====================
const windowAPI = {
  showFloating: (projectData) => ipcRenderer.invoke('window:show-floating', projectData),
  hideFloating: () => ipcRenderer.invoke('window:hide-floating'),
  updateFloatingProgress: (data) => ipcRenderer.invoke('window:update-floating-progress', data),
  onFloatingUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('floating:update', handler);
    return () => ipcRenderer.removeListener('floating:update', handler);
  }
};

// ==================== DEEP LINK API ====================
const deepLinkAPI = {
  onBuild: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('deep-link:build', handler);
    return () => ipcRenderer.removeListener('deep-link:build', handler);
  },
  onConfig: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('deep-link:config', handler);
    return () => ipcRenderer.removeListener('deep-link:config', handler);
  },
  onDeploy: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('deep-link:deploy', handler);
    return () => ipcRenderer.removeListener('deep-link:deploy', handler);
  }
};

// ==================== SHELL API ====================
const shellAPI = {
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url)
};

// ==================== DIALOG API ====================
const dialogAPI = {
  showOpen: (options) => ipcRenderer.invoke('dialog:show-open', options),
  showSave: (options) => ipcRenderer.invoke('dialog:show-save', options)
};

// ==================== APP INFO API ====================
const appAPI = {
  getVersion: () => ipcRenderer.invoke('app:get-version'),
  getPath: (name) => ipcRenderer.invoke('app:get-path', name)
};

// ==================== EXPOSE APIs TO RENDERER ====================
contextBridge.exposeInMainWorld('electronAPI', {
  security: securityAPI,
  project: projectAPI,
  task: taskAPI,
  ollama: ollamaAPI,
  window: windowAPI,
  deepLink: deepLinkAPI,
  shell: shellAPI,
  dialog: dialogAPI,
  app: appAPI
});

console.log('[Preload] Axiom Forge secure API initialized (.cjs)');
