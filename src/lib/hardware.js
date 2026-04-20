import os from 'os';

export class HardwareManager {
  /**
   * Retrieves the system's total RAM in GB.
   */
  static getTotalRamGB() {
    return os.totalmem() / (1024 ** 3);
  }

  /**
   * Recommends the optimal local AI model based on available RAM.
   * Assumes running via Ollama.
   */
  static getRecommendedModel() {
    const ramGB = this.getTotalRamGB();
    
    console.log(`[Hardware Benchmark] Total RAM: ${ramGB.toFixed(2)} GB`);

    if (ramGB < 12) {
      // Small machines (< 16GB, usually 8GB configs)
      return 'llama3.2:1b';
    } else if (ramGB < 24) {
      // Medium machines (16GB - 24GB configs)
      return 'gemma:2b'; 
    } else if (ramGB < 40) {
      // Large machines (32GB configs)
      return 'llama3:8b';
    } else {
      // Enthusiast machines (> 32GB)
      return 'gemma:27b';
    }
  }

  static getHardwareProfile() {
    return {
      platform: os.platform(),
      cpus: os.cpus().length,
      ramGB: this.getTotalRamGB(),
      recommendedModel: this.getRecommendedModel()
    };
  }
}
