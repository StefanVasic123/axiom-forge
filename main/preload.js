/**
 * Axiom Forge - Preload Script
 * Secure ContextBridge for renderer process
 * NO direct Node.js access - all communication via IPC
 */

import { contextBridge, ipcRenderer } from 'electron';

// ==================== SECURITY LAYER API ====================
/**
 * Token management - All tokens are encrypted at rest
 */
const securityAPI = {
  /**
   * Store an encrypted token
   * @param {string} key - Token identifier (e.g., 'github-token', 'vercel-token')
   * @param {string} value - The token value to encrypt and store
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  storeToken: (key, value) => ipcRenderer.invoke('security:store-token', { key, value }),

  /**
   * Retrieve and decrypt a token
   * @param {string} key - Token identifier
   * @returns {Promise<{success: boolean, value?: string, error?: string}>}
   */
  getToken: (key) => ipcRenderer.invoke('security:get-token', { key }),

  /**
   * Delete a stored token
   * @param {string} key - Token identifier
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  deleteToken: (key) => ipcRenderer.invoke('security:delete-token', { key }),

  /**
   * Check if a token exists
   * @param {string} key - Token identifier
   * @returns {Promise<{success: boolean, exists?: boolean, error?: string}>}
   */
  hasToken: (key) => ipcRenderer.invoke('security:has-token', { key }),

  /**
   * Clear all stored tokens (use with caution)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  clearAllTokens: () => ipcRenderer.invoke('security:clear-all-tokens')
};

// ==================== PROJECT MANAGEMENT API ====================
/**
 * Local project registry operations
 */
const projectAPI = {
  /**
   * Get all projects from local registry
   * @returns {Promise<{success: boolean, projects?: Array, error?: string}>}
   */
  getAll: () => ipcRenderer.invoke('project:get-all'),

  /**
   * Get a specific project by ID
   * @param {string} id - Project ID
   * @returns {Promise<{success: boolean, project?: object, error?: string}>}
   */
  get: (id) => ipcRenderer.invoke('project:get', { id }),

  /**
   * Save or update a project
   * @param {object} projectData - Project data to save
   * @returns {Promise<{success: boolean, project?: object, error?: string}>}
   */
  save: (projectData) => ipcRenderer.invoke('project:save', projectData),

  /**
   * Delete a project from registry
   * @param {string} id - Project ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  delete: (id) => ipcRenderer.invoke('project:delete', { id }),

  /**
   * Update project status
   * @param {string} id - Project ID
   * @param {string} status - New status ('generating', 'awaiting-keys', 'ready', 'deploying', 'live', 'error')
   * @param {object} metadata - Additional metadata
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  updateStatus: (id, status, metadata = {}) => 
    ipcRenderer.invoke('project:update-status', { id, status, metadata })
};

// ==================== TASK ORCHESTRATOR API ====================
/**
 * State machine task operations
 */
const taskAPI = {
  /**
   * Start the code generation phase
   * @param {string} manifestId - Remote manifest identifier
   * @param {string} projectId - Local project identifier
   * @returns {Promise<{success: boolean, result?: object, error?: string}>}
   */
  startGeneration: (manifestId, projectId) => 
    ipcRenderer.invoke('task:start-generation', { manifestId, projectId }),

  /**
   * Configure project with environment variables
   * @param {string} projectId - Project ID
   * @param {object} envVars - Environment variables object
   * @returns {Promise<{success: boolean, result?: object, error?: string}>}
   */
  configureProject: (projectId, envVars) => 
    ipcRenderer.invoke('task:configure-project', { projectId, envVars }),

  /**
   * Start deployment to GitHub + Vercel
   * @param {string} projectId - Project ID
   * @returns {Promise<{success: boolean, result?: object, error?: string}>}
   */
  startDeployment: (projectId) => 
    ipcRenderer.invoke('task:start-deployment', { projectId }),

  /**
   * Stop an active task
   * @param {string} taskId - Task identifier
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  stop: (taskId) => ipcRenderer.invoke('task:stop', { taskId }),

  /**
   * Get current task status
   * @param {string} taskId - Task identifier
   * @returns {Promise<{success: boolean, status?: object, error?: string}>}
   */
  getStatus: (taskId) => ipcRenderer.invoke('task:get-status', { taskId }),

  /**
   * Subscribe to task progress updates
   * @param {function} callback - Progress update handler
   * @returns {function} Unsubscribe function
   */
  onProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('task:progress', handler);
    return () => ipcRenderer.removeListener('task:progress', handler);
  }
};

// ==================== WINDOW MANAGEMENT API ====================
/**
 * Floating window controls
 */
const windowAPI = {
  /**
   * Show the floating progress window
   * @param {object} projectData - Project data to display
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  showFloating: (projectData) => ipcRenderer.invoke('window:show-floating', projectData),

  /**
   * Hide/close the floating progress window
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  hideFloating: () => ipcRenderer.invoke('window:hide-floating'),

  /**
   * Update floating window progress
   * @param {object} data - Progress data
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  updateFloatingProgress: (data) => ipcRenderer.invoke('window:update-floating-progress', data),

  /**
   * Subscribe to floating window updates
   * @param {function} callback - Update handler
   * @returns {function} Unsubscribe function
   */
  onFloatingUpdate: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('floating:update', handler);
    return () => ipcRenderer.removeListener('floating:update', handler);
  }
};

// ==================== DEEP LINK API ====================
/**
 * Deep link protocol handlers
 */
const deepLinkAPI = {
  /**
   * Subscribe to build deep links
   * @param {function} callback - Handler for axiom://build?id={manifestId}
   * @returns {function} Unsubscribe function
   */
  onBuild: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('deep-link:build', handler);
    return () => ipcRenderer.removeListener('deep-link:build', handler);
  },

  /**
   * Subscribe to config deep links
   * @param {function} callback - Handler for axiom://config?projectId={id}
   * @returns {function} Unsubscribe function
   */
  onConfig: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('deep-link:config', handler);
    return () => ipcRenderer.removeListener('deep-link:config', handler);
  },

  /**
   * Subscribe to deploy deep links
   * @param {function} callback - Handler for axiom://deploy?projectId={id}
   * @returns {function} Unsubscribe function
   */
  onDeploy: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('deep-link:deploy', handler);
    return () => ipcRenderer.removeListener('deep-link:deploy', handler);
  }
};

// ==================== SHELL API ====================
/**
 * External system integration
 */
const shellAPI = {
  /**
   * Open URL in external browser
   * @param {string} url - URL to open (must be http/https)
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url)
};

// ==================== DIALOG API ====================
/**
 * Native dialog operations
 */
const dialogAPI = {
  /**
   * Show open file/folder dialog
   * @param {object} options - Electron dialog options
   * @returns {Promise<{success: boolean, result?: object, error?: string}>}
   */
  showOpen: (options) => ipcRenderer.invoke('dialog:show-open', options),

  /**
   * Show save file dialog
   * @param {object} options - Electron dialog options
   * @returns {Promise<{success: boolean, result?: object, error?: string}>}
   */
  showSave: (options) => ipcRenderer.invoke('dialog:show-save', options)
};

// ==================== APP INFO API ====================
/**
 * Application metadata
 */
const appAPI = {
  /**
   * Get application version
   * @returns {Promise<{success: boolean, version?: string, error?: string}>}
   */
  getVersion: () => ipcRenderer.invoke('app:get-version'),

  /**
   * Get special directory path
   * @param {string} name - Path name ('home', 'appData', 'userData', etc.)
   * @returns {Promise<{success: boolean, path?: string, error?: string}>}
   */
  getPath: (name) => ipcRenderer.invoke('app:get-path', name)
};

// ==================== EXPOSE APIs TO RENDERER ====================
contextBridge.exposeInMainWorld('electronAPI', {
  security: securityAPI,
  project: projectAPI,
  task: taskAPI,
  window: windowAPI,
  deepLink: deepLinkAPI,
  shell: shellAPI,
  dialog: dialogAPI,
  app: appAPI
});

// Log preload completion (visible in renderer console)
console.log('[Preload] Axiom Forge secure API initialized');
