/**
 * Axiom Forge - Task Orchestrator
 * 
 * Manages the state machine flow:
 * 1. GENERATION: Fetch manifest -> File-by-file codegen via Ollama
 * 2. CONFIGURATION: Collect ENV variables
 * 3. DEPLOYMENT: Push to GitHub -> Trigger Vercel Deploy
 */

import { EventEmitter } from 'events';
import { OllamaClient } from './ollamaClient.js';
import { DeploymentService } from './deploymentService.js';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';
import { APP_CONFIG } from './config.js';

// ==================== STATE DEFINITIONS ====================
export const TaskState = {
  IDLE: 'idle',
  GENERATING: 'generating',
  GENERATED: 'generated',
  AWAITING_KEYS: 'awaiting-keys',
  CONFIGURED: 'configured',
  DEPLOYING: 'deploying',
  DEPLOYED: 'deployed',
  LIVE: 'live',
  ERROR: 'error',
  STOPPED: 'stopped'
};

export const TaskPhase = {
  FETCH_MANIFEST: 'fetch-manifest',
  GENERATE_FILES: 'generate-files',
  SAVE_PROJECT: 'save-project',
  AWAIT_CONFIGURATION: 'await-configuration',
  PUSH_GITHUB: 'push-github',
  DEPLOY_VERCEL: 'deploy-vercel',
  VERIFY_DEPLOYMENT: 'verify-deployment'
};

// ==================== TASK ORCHESTRATOR CLASS ====================
export class TaskOrchestrator extends EventEmitter {
  constructor(securityManager) {
    super();
    this.securityManager = securityManager;
    this.ollama = new OllamaClient();
    this.deployment = new DeploymentService(securityManager);
    this.activeTasks = new Map();
    this.projectStoragePath = path.join(os.homedir(), '.axiom-forge', 'projects');
    
    // Ensure storage directory exists
    this._ensureStorage();
  }

  // ==================== PRIVATE METHODS ====================

  async _ensureStorage() {
    try {
      await fs.mkdir(this.projectStoragePath, { recursive: true });
    } catch (error) {
      console.error('[Orchestrator] Failed to create storage:', error);
    }
  }

  _createTaskId() {
    return `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  _createProjectId() {
    return `proj-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  _updateTask(taskId, updates) {
    const task = this.activeTasks.get(taskId);
    if (task) {
      Object.assign(task, updates);
      this.emit('task:update', { taskId, task });
    }
  }

  async _fetchManifest(manifestId, token) {
    const apiUrl = APP_CONFIG.IDEA_ANALYZER_URL;
    try {
      const response = await fetch(`${apiUrl}/api/axiom/manifest/${manifestId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const jsonResponse = await response.json();
        if (jsonResponse.success) {
          return jsonResponse.data;
        }
      }
      const errTxt = await response.text();
      throw new Error(`Server response: ${response.status} - ${errTxt}`);
    } catch (error) {
      console.error('[Orchestrator] Manifest fetch failed:', error);
      throw new OrchestratorError(
        'MANIFEST_FETCH_ERROR',
        `Could not fetch manifest securely: ${error.message}`
      );
    }
  }

  async _saveProjectFiles(projectId, files) {
    const projectPath = path.join(this.projectStoragePath, projectId);
    await fs.mkdir(projectPath, { recursive: true });

    for (const file of files) {
      const filePath = path.join(projectPath, file.path);
      const dir = path.dirname(filePath);
      
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, file.content, 'utf-8');
    }

    return projectPath;
  }

  // ==================== PUBLIC API ====================

  /**
   * Start the code generation phase
   */
  async startGeneration(manifestId, existingProjectId = null, token, onProgress = () => {}) {
    const taskId = this._createTaskId();
    const projectId = existingProjectId || this._createProjectId();
    
    const task = {
      id: taskId,
      projectId,
      manifestId,
      state: TaskState.GENERATING,
      phase: TaskPhase.FETCH_MANIFEST,
      progress: 0,
      startTime: Date.now(),
      logs: [],
      result: null,
      error: null
    };

    this.activeTasks.set(taskId, task);
    this.emit('task:started', { taskId, type: 'generation' });

    try {
      // Phase 1: Fetch Manifest
      this._updateTask(taskId, { phase: TaskPhase.FETCH_MANIFEST });
      onProgress({ phase: 'fetch-manifest', message: 'Fetching project manifest securely...' });
      
      const manifest = await this._fetchManifest(manifestId, token);
      task.logs.push({ time: Date.now(), message: `Fetched manifest: ${manifest.metadata?.name || manifestId}` });

      // Phase 2: Generate Files
      this._updateTask(taskId, { phase: TaskPhase.GENERATE_FILES, progress: 10 });
      onProgress({ phase: 'generate-files', message: 'Generating code with Ollama...' });

      // Check Ollama health
      const health = await this.ollama.healthCheck();
      if (!health.available) {
        throw new OrchestratorError('OLLAMA_UNAVAILABLE', health.message);
      }

      if (!health.hasModel) {
        onProgress({ phase: 'pull-model', message: `Pulling model: ${health.message}` });
        await this.ollama.pullModel();
      }

      // Generate files
      const generationResult = await this.ollama.generateProject(manifest, (progress) => {
        const totalProgress = 10 + (progress.progress * 0.7);
        this._updateTask(taskId, { progress: totalProgress });
        onProgress({
          ...progress,
          message: `Generating ${progress.file}...`,
          progress: totalProgress
        });
      });

      task.logs.push({ 
        time: Date.now(), 
        message: `Generated ${generationResult.stats.successful}/${generationResult.stats.total} files` 
      });

      if (generationResult.stats.failed > 0) {
        task.logs.push({ 
          time: Date.now(), 
          message: `Warning: ${generationResult.stats.failed} files failed to generate`,
          level: 'warn'
        });
      }

      // Phase 3: Save Project
      this._updateTask(taskId, { phase: TaskPhase.SAVE_PROJECT, progress: 80 });
      onProgress({ phase: 'save-project', message: 'Saving project files...' });

      const projectPath = await this._saveProjectFiles(projectId, generationResult.files);
      
      // Create project metadata
      const project = {
        id: projectId,
        name: manifest.name,
        description: manifest.description,
        manifestId,
        path: projectPath,
        files: generationResult.files.map(f => ({ path: f.path, language: f.language })),
        status: TaskState.GENERATED,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        metadata: {
          techStack: manifest.techStack,
          generationStats: generationResult.stats,
          envTemplate: manifest.envVars || []
        }
      };

      task.logs.push({ time: Date.now(), message: `Project saved to: ${projectPath}` });

      // Update task
      this._updateTask(taskId, { 
        state: TaskState.GENERATED,
        phase: TaskPhase.AWAIT_CONFIGURATION,
        progress: 100,
        result: { project, generationResult }
      });

      this.emit('task:completed', { taskId, result: project });
      onProgress({ phase: 'complete', message: 'Generation complete!', project });

      return { taskId, project, generationResult };

    } catch (error) {
      this._updateTask(taskId, { 
        state: TaskState.ERROR,
        error: error.message,
        progress: 0
      });
      
      task.logs.push({ time: Date.now(), message: `Error: ${error.message}`, level: 'error' });
      
      this.emit('task:error', { taskId, error });
      throw error;
    }
  }

  /**
   * Configure project with environment variables
   */
  async configureProject(projectId, envVars) {
    const taskId = this._createTaskId();
    
    const task = {
      id: taskId,
      projectId,
      state: TaskState.CONFIGURED,
      phase: TaskPhase.AWAIT_CONFIGURATION,
      startTime: Date.now(),
      logs: []
    };

    this.activeTasks.set(taskId, task);

    try {
      // Store each env var securely
      const stored = [];
      for (const [key, value] of Object.entries(envVars)) {
        if (value && value.trim()) {
          await this.securityManager.storeToken(`env-${projectId}-${key}`, value);
          stored.push(key);
        }
      }

      // Create .env file in project directory
      const projectPath = path.join(this.projectStoragePath, projectId);
      const envContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');
      
      await fs.writeFile(path.join(projectPath, '.env.local'), envContent, 'utf-8');

      task.logs.push({ time: Date.now(), message: `Configured ${stored.length} environment variables` });

      this.emit('task:configured', { taskId, projectId, stored });

      return { taskId, stored, count: stored.length };

    } catch (error) {
      task.state = TaskState.ERROR;
      task.error = error.message;
      task.logs.push({ time: Date.now(), message: `Error: ${error.message}`, level: 'error' });
      
      this.emit('task:error', { taskId, error });
      throw error;
    }
  }

  /**
   * Start deployment to GitHub + Vercel
   */
  async startDeployment(projectId, onProgress = () => {}) {
    const taskId = this._createTaskId();
    
    const task = {
      id: taskId,
      projectId,
      state: TaskState.DEPLOYING,
      phase: TaskPhase.PUSH_GITHUB,
      progress: 0,
      startTime: Date.now(),
      logs: [],
      result: null,
      error: null
    };

    this.activeTasks.set(taskId, task);
    this.emit('task:started', { taskId, type: 'deployment' });

    try {
      // Get project info
      const projectPath = path.join(this.projectStoragePath, projectId);
      
      // Phase 1: Push to GitHub
      this._updateTask(taskId, { phase: TaskPhase.PUSH_GITHUB, progress: 10 });
      onProgress({ phase: 'push-github', message: 'Pushing to GitHub...' });

      const githubResult = await this.deployment.pushToGitHub(projectId, projectPath, (progress) => {
        this._updateTask(taskId, { progress: 10 + (progress * 0.4) });
        onProgress({ ...progress, progress: 10 + (progress * 0.4) });
      });

      task.logs.push({ time: Date.now(), message: `Pushed to GitHub: ${githubResult.repoUrl}` });

      // Phase 2: Deploy to Vercel
      this._updateTask(taskId, { phase: TaskPhase.DEPLOY_VERCEL, progress: 50 });
      onProgress({ phase: 'deploy-vercel', message: 'Deploying to Vercel...' });

      const vercelResult = await this.deployment.deployToVercel(
        projectId, 
        githubResult.repoName,
        (progress) => {
          this._updateTask(taskId, { progress: 50 + (progress * 0.4) });
          onProgress({ ...progress, progress: 50 + (progress * 0.4) });
        }
      );

      task.logs.push({ time: Date.now(), message: `Deployed to Vercel: ${vercelResult.url}` });

      // Phase 3: Verify Deployment
      this._updateTask(taskId, { phase: TaskPhase.VERIFY_DEPLOYMENT, progress: 90 });
      onProgress({ phase: 'verify-deployment', message: 'Verifying deployment...' });

      const verified = await this.deployment.verifyDeployment(vercelResult.url);

      if (verified) {
        task.logs.push({ time: Date.now(), message: 'Deployment verified successfully' });
      } else {
        task.logs.push({ time: Date.now(), message: 'Deployment verification pending', level: 'warn' });
      }

      // Update task
      this._updateTask(taskId, { 
        state: TaskState.LIVE,
        phase: 'complete',
        progress: 100,
        result: {
          github: githubResult,
          vercel: vercelResult,
          verified
        }
      });

      this.emit('task:deployed', { 
        taskId, 
        projectId,
        urls: {
          repo: githubResult.repoUrl,
          site: vercelResult.url
        }
      });

      onProgress({ 
        phase: 'complete', 
        message: 'Deployment complete!',
        urls: {
          repo: githubResult.repoUrl,
          site: vercelResult.url
        }
      });

      return {
        taskId,
        github: githubResult,
        vercel: vercelResult,
        verified
      };

    } catch (error) {
      this._updateTask(taskId, { 
        state: TaskState.ERROR,
        error: error.message,
        progress: 0
      });
      
      task.logs.push({ time: Date.now(), message: `Error: ${error.message}`, level: 'error' });
      
      this.emit('task:error', { taskId, error });
      throw error;
    }
  }

  /**
   * Stop an active task
   */
  async stopTask(taskId) {
    const task = this.activeTasks.get(taskId);
    
    if (!task) {
      throw new OrchestratorError('TASK_NOT_FOUND', `Task not found: ${taskId}`);
    }

    if (task.state === TaskState.GENERATING) {
      // Stop Ollama generation
      // Note: Ollama doesn't have a direct stop API, but we can mark task as stopped
    }

    task.state = TaskState.STOPPED;
    task.stoppedAt = Date.now();
    
    this.emit('task:stopped', { taskId });
    
    return { success: true };
  }

  /**
   * Get task status
   */
  async getTaskStatus(taskId) {
    const task = this.activeTasks.get(taskId);
    
    if (!task) {
      throw new OrchestratorError('TASK_NOT_FOUND', `Task not found: ${taskId}`);
    }

    return {
      id: task.id,
      state: task.state,
      phase: task.phase,
      progress: task.progress,
      startTime: task.startTime,
      logs: task.logs,
      error: task.error
    };
  }

  /**
   * Get all active tasks
   */
  getActiveTasks() {
    return Array.from(this.activeTasks.values()).map(task => ({
      id: task.id,
      projectId: task.projectId,
      state: task.state,
      phase: task.phase,
      progress: task.progress
    }));
  }

  /**
   * Clean up completed tasks
   */
  cleanupTasks(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const now = Date.now();
    
    for (const [taskId, task] of this.activeTasks) {
      const isComplete = [
        TaskState.LIVE,
        TaskState.ERROR,
        TaskState.STOPPED
      ].includes(task.state);
      
      const isOld = (now - task.startTime) > maxAge;
      
      if (isComplete && isOld) {
        this.activeTasks.delete(taskId);
      }
    }
  }
}

// ==================== CUSTOM ERROR CLASS ====================
export class OrchestratorError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'OrchestratorError';
    this.code = code;
  }
}

export default TaskOrchestrator;
