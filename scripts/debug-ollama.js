/**
 * Axiom Forge - Standalone Logic Debugger
 * Run this script to test code generation without Electron or Deep Links.
 * Usage: node scripts/debug-ollama.js
 */

import TaskOrchestrator from '../src/lib/taskOrchestrator.js';
import SecurityManager from '../src/lib/security.js';

// 1. Mock the Data Store
const mockStore = {
  data: {},
  get(key) { return this.data[key]; },
  set(key, val) { this.data[key] = val; },
  has(key) { return !!this.data[key]; },
  delete(key) { delete this.data[key]; }
};

// 2. Mock Manifest (A realistic React project)
const mockManifest = {
  name: "Debug Project",
  description: "Testing generation lag and math bug",
  techStack: {
    framework: "react",
    bundler: "vite",
    styling: "tailwind"
  },
  files: [
    {
      path: "src/App.jsx",
      description: "Main application entry with a simple dashboard",
      language: "javascript"
    },
    {
      path: "src/components/Header.jsx",
      description: "Glassmorphism header component",
      language: "javascript"
    },
    {
      path: "src/styles/index.css",
      description: "Tailwind CSS imports",
      language: "css"
    }
  ]
};

async function runDebug() {
  console.log("--- starting axiom forge LABORATORY TEST ---");
  console.log(`Node Version: ${process.version}`);
  console.log(`Platform: ${process.platform}`);
  
  // Initialize Logic
  const security = new SecurityManager(mockStore);
  const orchestrator = new TaskOrchestrator(security);

  // Stub _fetchManifest to return our local mock
  orchestrator._fetchManifest = async () => {
    console.log("[DEBUG] Intercepted cloud manifest request. Returning local mock.");
    return mockManifest;
  };

  console.log("[DEBUG] Triggering generation pipeline...");

  try {
    const result = await orchestrator.startGeneration(
      "debug-manifest-id", 
      "debug-proj-id", 
      "dummy-token", 
      (progress) => {
        const time = new Date().toLocaleTimeString();
        const displayProgress = typeof progress.progress === 'number' ? progress.progress.toFixed(2) : '100.00';
        console.log(`[${time}] ${displayProgress}% | ${progress.phase} | ${progress.message}`);
        
        // Check for NaN
        if (progress.progress !== undefined && isNaN(progress.progress)) {
          console.error("!!! CRITICAL MATH ERROR: Progress is NaN !!!");
          process.exit(1);
        }
      }
    );

    console.log("\n--- SUCCESS! ---");
    console.log(`Generated Files: ${result.generationResult.files.length}`);
    if (result.generationResult.stats.failed > 0) {
      console.warn(`!!! WARNING: ${result.generationResult.stats.failed} files failed to generate !!!`);
    }
    const startTime = result.project.createdAt ? new Date(result.project.createdAt).getTime() : Date.now();
    console.log(`Total Time: ${(Date.now() - startTime) / 1000}s`);
    process.exit(0);

  } catch (error) {
    console.error("\n--- TEST FAILED ---");
    console.error(`Error Code: ${error.code}`);
    console.error(`Message: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

runDebug();
