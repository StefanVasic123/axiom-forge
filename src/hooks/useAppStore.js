/**
 * Axiom Forge - App Store Hook
 * Higher-level hook for common operations
 */

import { useCallback, useEffect } from 'react';
import { useAppContext } from '../contexts/AppContext';

export function useAppStore() {
  const { state, actions } = useAppContext();

  // ==================== FIRST RUN CHECK ====================
  const checkFirstRun = useCallback(async () => {
    console.log('[Setup] Starting first run check...');
    try {
      // Only check if Ollama is available — tokens are optional (configured in Settings)
      const ollamaHealth = await window.electronAPI.ollama.checkHealth();
      console.log('[Setup] Ollama check:', ollamaHealth);

      if (!ollamaHealth.available || !ollamaHealth.hasModel) {
        console.log('[Setup] Forcing Wizard: Ollama not ready.');
        actions.setFirstRun(true);
        return;
      }

      console.log('[Setup] All checks passed. Proceeding to Dashboard.');
      actions.setFirstRun(false);
    } catch (error) {
      console.error('[Setup] Error checking first run:', error);
      // On error, don't block the user — show the app
      actions.setFirstRun(false);
    }
  }, [actions]);

  // ==================== PROJECT OPERATIONS ====================
  const loadProjects = useCallback(async () => {
    actions.setLoading(true);
    try {
      const result = await window.electronAPI.project.getAll();
      if (result.success) {
        actions.setProjects(result.projects);
      }
    } catch (error) {
      actions.setError(error.message);
    } finally {
      actions.setLoading(false);
    }
  }, [actions]);

  const createProject = useCallback(async (projectData) => {
    try {
      const result = await window.electronAPI.project.save(projectData);
      if (result.success) {
        actions.addProject(result.project);
        return result.project;
      }
    } catch (error) {
      actions.setError(error.message);
      throw error;
    }
  }, [actions]);

  const saveProject = useCallback(async (projectData) => {
    try {
      const result = await window.electronAPI.project.save(projectData);
      if (result.success) {
        actions.updateProject(result.project);
        return result.project;
      }
    } catch (error) {
      actions.setError(error.message);
      throw error;
    }
  }, [actions]);

  const removeProject = useCallback(async (projectId) => {
    try {
      const result = await window.electronAPI.project.delete({ id: projectId });
      if (result.success) {
        actions.deleteProject(projectId);
      }
    } catch (error) {
      actions.setError(error.message);
      throw error;
    }
  }, [actions]);

  const updateProjectStatus = useCallback(async (projectId, status, metadata = {}) => {
    try {
      const result = await window.electronAPI.project.updateStatus(projectId, status, metadata);
      if (result.success) {
        actions.updateProject({ id: projectId, status, metadata });
      }
    } catch (error) {
      actions.setError(error.message);
    }
  }, [actions]);

  // ==================== TOKEN OPERATIONS ====================
  const checkTokens = useCallback(async () => {
    try {
      const [githubResult, vercelResult] = await Promise.all([
        window.electronAPI.security.hasToken('github-token'),
        window.electronAPI.security.hasToken('vercel-token')
      ]);

      actions.setTokensConfigured({
        github: githubResult.exists,
        vercel: vercelResult.exists
      });

      return {
        github: githubResult.exists,
        vercel: vercelResult.exists
      };
    } catch (error) {
      console.error('Error checking tokens:', error);
      return { github: false, vercel: false };
    }
  }, [actions]);

  const saveToken = useCallback(async (key, value) => {
    try {
      const result = await window.electronAPI.security.storeToken(key, value);
      if (result.success) {
        await checkTokens();
      }
      return result;
    } catch (error) {
      actions.setError(error.message);
      throw error;
    }
  }, [actions, checkTokens]);

  // ==================== TASK OPERATIONS ====================
  const startGeneration = useCallback(async (manifestId, projectId, token) => {
    try {
      // Show floating window
      await window.electronAPI.window.showFloating({ id: projectId });
      
      const result = await window.electronAPI.task.startGeneration(manifestId, projectId, token);
      return result;
    } catch (error) {
      actions.setError(error.message);
      throw error;
    }
  }, [actions]);

  const configureProject = useCallback(async (projectId, envVars) => {
    try {
      const result = await window.electronAPI.task.configureProject(projectId, envVars);
      return result;
    } catch (error) {
      actions.setError(error.message);
      throw error;
    }
  }, [actions]);

  const startDeployment = useCallback(async (projectId) => {
    try {
      const result = await window.electronAPI.task.startDeployment(projectId);
      return result;
    } catch (error) {
      actions.setError(error.message);
      throw error;
    }
  }, [actions]);

  const stopTask = useCallback(async (taskId) => {
    try {
      const result = await window.electronAPI.task.stop(taskId);
      return result;
    } catch (error) {
      actions.setError(error.message);
      throw error;
    }
  }, [actions]);

  // ==================== DEEP LINK HANDLERS ====================
  useEffect(() => {
    // Subscribe to deep link events
    const unsubscribeBuild = window.electronAPI.deepLink.onBuild(async (data) => {
      console.log('Deep link build received:', data);
      
      if (data.manifestId) {
        try {
          // Trigger the generation process with the security token
          await startGeneration(data.manifestId, data.projectId || data.manifestId, data.token);
        } catch (error) {
          console.error('Failed to auto-start generation:', error);
        }
      }
    });

    const unsubscribeConfig = window.electronAPI.deepLink.onConfig((data) => {
      console.log('Deep link config:', data);
      // Handle config deep link
    });

    const unsubscribeDeploy = window.electronAPI.deepLink.onDeploy((data) => {
      console.log('Deep link deploy:', data);
      // Handle deploy deep link
    });

    return () => {
      unsubscribeBuild();
      unsubscribeConfig();
      unsubscribeDeploy();
    };
  }, []);

  // ==================== TASK PROGRESS ====================
  useEffect(() => {
    const unsubscribe = window.electronAPI.task.onProgress((data) => {
      if (data.taskId) {
        actions.setTaskProgress(data.taskId, data);
      }
    });

    return () => unsubscribe();
  }, [actions]);

  return {
    // State
    isFirstRun: state.isFirstRun,
    isLoading: state.isLoading,
    error: state.error,
    projects: state.projects,
    currentProject: state.currentProject,
    taskProgress: state.taskProgress,
    settings: state.settings,
    tokensConfigured: state.tokensConfigured,

    // Actions
    checkFirstRun,
    loadProjects,
    createProject,
    saveProject,
    removeProject,
    updateProjectStatus,
    checkTokens,
    saveToken,
    startGeneration,
    configureProject,
    startDeployment,
    stopTask,
    setFirstRun: actions.setFirstRun
  };
}

export default useAppStore;
