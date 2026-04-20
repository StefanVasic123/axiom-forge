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
    try {
      // Check if settings exist
      const projects = await window.electronAPI.project.getAll();
      
      if (projects.success && projects.projects.length === 0) {
        // Check if any tokens are configured
        const githubResult = await window.electronAPI.security.hasToken('github-token');
        const vercelResult = await window.electronAPI.security.hasToken('vercel-token');
        
        const hasAnyToken = githubResult.exists || vercelResult.exists;
        
        if (!hasAnyToken) {
          actions.setFirstRun(true);
          return;
        }
      }
      
      actions.setFirstRun(false);
    } catch (error) {
      console.error('Error checking first run:', error);
      actions.setFirstRun(true);
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
  const startGeneration = useCallback(async (manifestId, projectId) => {
    try {
      // Show floating window
      await window.electronAPI.window.showFloating({ id: projectId });
      
      const result = await window.electronAPI.task.startGeneration(manifestId, projectId);
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
    const unsubscribeBuild = window.electronAPI.deepLink.onBuild((data) => {
      console.log('Deep link build:', data);
      // Handle build deep link
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
    stopTask
  };
}

export default useAppStore;
