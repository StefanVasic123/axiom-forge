/**
 * Axiom Forge - Settings
 * Application settings and token management
 */

import React, { useState, useEffect } from 'react';
import { 
  Key, 
  Server, 
  Shield, 
  ExternalLink, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle,
  Save,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { useAppStore } from '../hooks/useAppStore';

// Token input component
function TokenInput({ 
  label, 
  tokenKey, 
  helpUrl, 
  description,
  onSave 
}) {
  const [value, setValue] = useState('');
  const [showValue, setShowValue] = useState(false);
  const [isSet, setIsSet] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    checkToken();
  }, []);

  const checkToken = async () => {
    setIsChecking(true);
    try {
      const result = await window.electronAPI.security.hasToken(tokenKey);
      setIsSet(result?.exists === true);
    } catch (e) {
      console.error(`[Settings] Could not check token ${tokenKey}:`, e);
      setIsSet(false);
    } finally {
      setIsChecking(false);
    }
  };

  const handleSave = async () => {
    if (!value.trim()) return;
    
    setIsSaving(true);
    setMessage(null);

    try {
      await onSave(tokenKey, value);
      setIsSet(true);
      setValue('');
      setMessage({ type: 'success', text: 'Token saved successfully' });
    } catch (error) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async () => {
    try {
      await window.electronAPI.security.deleteToken(tokenKey);
      setIsSet(false);
      setValue('');
      setMessage({ type: 'success', text: 'Token cleared' });
    } catch (e) {
      setMessage({ type: 'error', text: 'Could not clear token' });
    }
  };

  const handleReveal = async () => {
    if (showValue && value) {
      // Hide it again
      setValue('');
      setShowValue(false);
      return;
    }
    try {
      const result = await window.electronAPI.security.getToken(tokenKey);
      if (result.success && result.value) {
        setValue(result.value);
        setShowValue(true);
      } else {
        setMessage({ type: 'error', text: 'Could not retrieve token value' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to reveal token' });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="label flex items-center gap-2">
          <Key className="w-4 h-4 text-slate-500" />
          {label}
          {isChecking ? (
            <RefreshCw className="w-3 h-3 text-slate-500 animate-spin" />
          ) : isSet ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          ) : (
            <AlertCircle className="w-4 h-4 text-amber-400" />
          )}
        </label>
        
        {helpUrl && (
          <a
            href={helpUrl}
            onClick={(e) => {
              e.preventDefault();
              window.electronAPI.shell.openExternal(helpUrl);
            }}
            className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
          >
            <ExternalLink className="w-3 h-3" />
            Get Token
          </a>
        )}
      </div>
      
      {description && (
        <p className="text-xs text-slate-500">{description}</p>
      )}

      {isSet && !value && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-xs text-emerald-400">Token is configured. Enter a new value below to replace it.</span>
        </div>
      )}
      
      <div className="flex gap-2">
        <div className="relative flex-1">
          <input
            type={showValue ? 'text' : 'password'}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={isSet ? '••••••••••••••••' : `Enter ${label}`}
            className="input pr-10"
          />
          <button
            onClick={handleReveal}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            title={showValue && value ? 'Hide token' : 'Reveal stored token'}
          >
            {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        
        <button
          onClick={handleSave}
          disabled={isSaving || !value.trim()}
          className="btn-primary"
        >
          {isSaving ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save
        </button>
        
        {isSet && (
          <button
            onClick={handleClear}
            className="btn-danger"
            title="Clear token"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
      
      {message && (
        <p className={`text-xs ${message.type === 'success' ? 'text-emerald-400' : 'text-rose-400'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}

function Settings() {
  const { saveToken, checkTokens, tokensConfigured } = useAppStore();
  const [ollamaHost, setOllamaHost] = useState('http://127.0.0.1:11434');
  const [builderModel, setBuilderModel] = useState('');
  const [editorModel, setEditorModel] = useState('');
  const [activeRole, setActiveRole] = useState('builder'); // 'builder' or 'editor'
  const [hardwareProfile, setHardwareProfile] = useState(null);
  const [ollamaStatus, setOllamaStatus] = useState('unknown');
  const [isTestingOllama, setIsTestingOllama] = useState(false);

  useEffect(() => {
    checkTokens();
    testOllamaConnection();
    loadHardwareProfile();
  }, []);

  const loadHardwareProfile = async () => {
    const profile = await window.electronAPI.hardware.getProfile();
    setHardwareProfile(profile);
    
    const bModel = await window.electronAPI.hardware.getBuilderModel();
    const eModel = await window.electronAPI.hardware.getEditorModel();
    
    // Auto-resolve Builder Model
    if (bModel) {
      setBuilderModel(bModel);
    } else {
      // Find best builder model (SSM/SSA)
      const defaultBuilder = profile.models.find(m => m.tags?.includes('ssa') && m.isCompatible)?.id 
        || profile.recommendedModelId;
      setBuilderModel(defaultBuilder);
      await window.electronAPI.hardware.setBuilderModel(defaultBuilder);
    }

    // Auto-resolve Editor Model
    if (eModel) {
      setEditorModel(eModel);
    } else {
      // Find best editor model (Dense/Transformer)
      const defaultEditor = profile.models.find(m => !m.tags?.includes('ssa') && m.isCompatible && m.tags?.includes('code'))?.id
        || profile.recommendedModelId;
      setEditorModel(defaultEditor);
      await window.electronAPI.hardware.setEditorModel(defaultEditor);
    }
  };

  const handleModelChange = async (newModel) => {
    if (activeRole === 'builder') {
      setBuilderModel(newModel);
      await window.electronAPI.hardware.setBuilderModel(newModel);
    } else {
      setEditorModel(newModel);
      await window.electronAPI.hardware.setEditorModel(newModel);
    }
  };

  const testOllamaConnection = async () => {
    setIsTestingOllama(true);
    try {
      // Check health directly from main
      const health = await window.electronAPI.ollama.checkHealth();
      setOllamaStatus(health.available ? 'connected' : 'error');
    } catch (error) {
      setOllamaStatus('error');
    } finally {
      setIsTestingOllama(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400">Manage your API tokens and preferences</p>
      </div>

      {/* API Tokens Section */}
      <section className="card p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
            <Key className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">API Tokens</h2>
            <p className="text-sm text-slate-500">
              Your tokens are encrypted and stored locally
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <TokenInput
            label="GitHub Token"
            tokenKey="github-token"
            helpUrl="https://github.com/settings/tokens/new?scopes=repo,workflow&description=Axiom%20Forge"
            description="Required for pushing code to GitHub repositories"
            onSave={saveToken}
          />

          <hr className="border-slate-800" />

          <TokenInput
            label="Vercel Token"
            tokenKey="vercel-token"
            helpUrl="https://vercel.com/account/tokens"
            description="Required for deploying to Vercel"
            onSave={saveToken}
          />

          <hr className="border-slate-800" />

          <TokenInput
            label="Netlify Token"
            tokenKey="netlify-token"
            helpUrl="https://app.netlify.com/user/settings/applications#personal-access-tokens"
            description="Required for deploying to Netlify"
            onSave={saveToken}
          />

          <hr className="border-slate-800" />

          <TokenInput
            label="Render Token"
            tokenKey="render-token"
            helpUrl="https://dashboard.render.com/u/settings#api-keys"
            description="Required for deploying to Render"
            onSave={saveToken}
          />

          <hr className="border-slate-800" />

          <TokenInput
            label="Hostinger Token/SSH"
            tokenKey="hostinger-token"
            description="Required for custom deployments via SSH/FTP to Hostinger"
            onSave={saveToken}
          />
        </div>
      </section>

      {/* Ollama Settings */}
      <section className="card p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Server className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Ollama & AI Model</h2>
            <p className="text-sm text-slate-500">
              Configure your local AI engine and generation model
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Ollama Host</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={ollamaHost}
                onChange={(e) => setOllamaHost(e.target.value)}
                className="input flex-1"
                placeholder="http://127.0.0.1:11434"
              />
              <button
                onClick={testOllamaConnection}
                disabled={isTestingOllama}
                className="btn-secondary"
              >
                {isTestingOllama ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  'Test'
                )}
              </button>
            </div>
            
            {ollamaStatus === 'connected' && (
              <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" />
                Connected to Ollama
              </p>
            )}
            {ollamaStatus === 'error' && (
              <p className="text-xs text-rose-400 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Could not connect to Ollama
              </p>
            )}
          </div>

          {/* Hardware info bar */}
          {hardwareProfile && (
            <div className="flex flex-col gap-2 px-4 py-3 bg-slate-800/60 rounded-xl border border-slate-700/50 text-xs text-slate-400">
              <div className="flex items-center gap-4">
                <span>🖥️ <span className="text-slate-300">{hardwareProfile.ramGB?.toFixed(1)} GB RAM</span></span>
                <span>🔧 <span className="text-slate-300">{hardwareProfile.cpus} CPUs</span></span>
                <span className="text-slate-600">|</span>
                <span>Platform: <span className="text-slate-300 capitalize">{hardwareProfile.platform}</span></span>
              </div>
              <div className="h-px bg-slate-700/30 my-1" />
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                <span>🛠️ Builder Model: <span className="text-indigo-400 font-mono font-semibold">{builderModel || 'Not Selected'}</span></span>
                <span>✏️ Editor Model: <span className="text-violet-400 font-mono font-semibold">{editorModel || 'Not Selected'}</span></span>
              </div>
            </div>
          )}

          {/* Model Browser */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="label mb-0">AI Generation Model Suite</label>
              <span className="text-xs text-slate-500">Configure separate AI models for different roles</span>
            </div>

            {/* Sliding Role Toggles */}
            <div className="flex bg-slate-950 p-1.5 rounded-xl border border-slate-800/60 my-4">
              <button
                onClick={() => setActiveRole('builder')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeRole === 'builder'
                    ? 'bg-indigo-600/20 text-indigo-200 border border-indigo-500/30 shadow-md shadow-indigo-500/5'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                🛠️ Code Builder Role
              </button>
              <button
                onClick={() => setActiveRole('editor')}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                  activeRole === 'editor'
                    ? 'bg-violet-600/20 text-violet-200 border border-violet-500/30 shadow-md shadow-violet-500/5'
                    : 'text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                ✏️ Code Editor Role
              </button>
            </div>

            {/* Sub-label based on active role */}
            <div className="mb-4 p-3 bg-slate-900/40 border border-slate-800/60 rounded-xl">
              {activeRole === 'builder' ? (
                <p className="text-xs text-indigo-300/80 leading-relaxed">
                  💡 **Builder Role** handles full application scaffoldings and bulk file generation.
                  We highly recommend **SSA (Sparse Subquadratic Attention) or SSM (State Space Models)** like **Mamba Coder** or **Jamba** for blazing-fast speed and low RAM pressure.
                </p>
              ) : (
                <p className="text-xs text-violet-300/80 leading-relaxed">
                  💡 **Editor Role** performs local, precise code edits and answers questions.
                  We recommend dense **Transformer** models like **Qwen 2.5 Coder 7B** or **DeepSeek Coder** for maximum conceptual accuracy and rich reasoning.
                </p>
              )}
            </div>

            {hardwareProfile?.byTier ? (
              <div className="space-y-4">
                {Object.entries(hardwareProfile.byTier).map(([tier, tierModels]) => {
                  if (!tierModels || tierModels.length === 0) return null;

                  const tierMeta = {
                    nano:    { label: 'Nano',    emoji: '🌱', color: 'text-slate-400', border: 'border-slate-700' },
                    small:   { label: 'Small',   emoji: '⚡', color: 'text-sky-400',   border: 'border-sky-900/40' },
                    mid:     { label: 'Mid',     emoji: '🚀', color: 'text-indigo-400',border: 'border-indigo-900/40' },
                    power:   { label: 'Power',   emoji: '💪', color: 'text-violet-400',border: 'border-violet-900/40' },
                    expert:  { label: 'Expert',  emoji: '🧠', color: 'text-fuchsia-400',border: 'border-fuchsia-900/40' },
                    extreme: { label: 'Extreme', emoji: '🔥', color: 'text-rose-400',  border: 'border-rose-900/40' },
                  }[tier] || { label: tier, emoji: '📦', color: 'text-slate-400', border: 'border-slate-700' };

                  return (
                    <div key={tier}>
                      <div className={`flex items-center gap-2 mb-2 text-xs font-semibold uppercase tracking-wider ${tierMeta.color}`}>
                        <span>{tierMeta.emoji}</span>
                        <span>{tierMeta.label} Tier</span>
                        <div className={`flex-1 h-px border-t ${tierMeta.border} ml-2`} />
                      </div>
                      <div className="grid gap-2">
                        {tierModels.map(model => {
                          const currentActiveModel = activeRole === 'builder' ? builderModel : editorModel;
                          const isSelected = currentActiveModel === model.id;
                          const isIncompatible = !model.isCompatible && !model.isMarginal;
                          const isMarginal = model.isMarginal;
                          const isSsa = model.tags?.includes('ssa');

                          return (
                            <button
                              key={model.id}
                              onClick={() => handleModelChange(model.id)}
                              className={`w-full text-left p-3 rounded-xl border transition-all ${
                                isSelected
                                  ? activeRole === 'builder'
                                    ? 'bg-indigo-600/20 border-indigo-500/60 shadow-sm shadow-indigo-500/10'
                                    : 'bg-violet-600/20 border-violet-500/60 shadow-sm shadow-violet-500/10'
                                  : isIncompatible
                                  ? 'bg-slate-900/30 border-slate-800 opacity-60 hover:opacity-80'
                                  : isMarginal
                                  ? 'bg-amber-900/10 border-amber-900/30 hover:border-amber-700/40'
                                  : 'bg-slate-900/50 border-slate-800 hover:border-slate-600'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-white">{model.name}</span>
                                    {model.isRecommended && (
                                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                        ⭐ Recommended
                                      </span>
                                    )}
                                    {isSsa ? (
                                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 font-semibold">
                                        ⚡ {activeRole === 'builder' ? 'Fast SSA Builder' : 'Linear Attention SSM'}
                                      </span>
                                    ) : (
                                      activeRole === 'editor' && model.tags?.includes('code') && (
                                        <span className="text-xs px-1.5 py-0.5 rounded-md bg-violet-500/20 text-violet-400 border border-violet-500/30">
                                          🔮 Transformer Editor
                                        </span>
                                      )
                                    )}
                                    {isIncompatible && (
                                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-rose-500/10 text-rose-400 border border-rose-500/20">
                                        ⚠️ Needs {model.minRamGB}GB RAM
                                      </span>
                                    )}
                                    {isMarginal && (
                                      <span className="text-xs px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                        ⚠️ May be slow
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">{model.description}</p>
                                  {isSelected && model.strengths && (
                                    <div className="mt-2 flex gap-4 text-xs">
                                      <span className="text-emerald-400">✓ {model.strengths}</span>
                                    </div>
                                  )}
                                  {(isIncompatible || isMarginal) && isSelected && (
                                    <p className="mt-2 text-xs text-amber-400">
                                      ⚠️ You selected this model at your own risk. Your system has {hardwareProfile.ramGB?.toFixed(1)}GB RAM but this model requires {model.minRamGB}GB. Generation may be very slow or fail.
                                    </p>
                                  )}
                                </div>
                                <div className="text-right flex-shrink-0">
                                  <span className="text-xs text-slate-500 font-mono">{model.sizeGB}GB</span>
                                  {isSelected && (
                                    <div className={`w-2.5 h-2.5 rounded-full ml-auto mt-1 ${
                                      activeRole === 'builder' ? 'bg-indigo-500 shadow-md shadow-indigo-500/40' : 'bg-violet-500 shadow-md shadow-violet-500/40'
                                    }`} />
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Fallback for old profile structure */
              <select
                value={activeRole === 'builder' ? builderModel : editorModel}
                onChange={(e) => handleModelChange(e.target.value)}
                className="input"
              >
                {hardwareProfile?.models.map(model => (
                  <option key={model.id} value={model.id}>
                    {model.name} {model.isRecommended ? '(Recommended)' : ''} {!model.isCompatible ? `(Requires ${model.minRamGB}GB RAM)` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </section>


      {/* Security Section */}
      <section className="card p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Security</h2>
            <p className="text-sm text-slate-500">
              Manage your stored data
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-slate-800/50 rounded-lg">
            <h3 className="font-medium text-white mb-2">Clear All Tokens</h3>
            <p className="text-sm text-slate-400 mb-4">
              This will remove all stored API tokens. You'll need to reconfigure them.
            </p>
            <button
              onClick={async () => {
                if (confirm('Are you sure you want to clear all tokens?')) {
                  await window.electronAPI.security.clearAllTokens();
                  await checkTokens();
                  alert('All tokens cleared');
                }
              }}
              className="btn-danger"
            >
              <Trash2 className="w-4 h-4" />
              Clear All Tokens
            </button>
          </div>

          <div className="p-4 bg-slate-800/50 rounded-lg">
            <h3 className="font-medium text-white mb-2">Encryption Info</h3>
            <p className="text-sm text-slate-400">
              All tokens are encrypted using AES-256-GCM with a key derived from your 
              machine-specific data. Tokens can only be decrypted on this machine.
            </p>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">About Axiom Forge</h2>
            <p className="text-sm text-slate-500">
              Open-source local agent for the idea-to-app pipeline
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-slate-400 font-mono">Version 1.1.9</p>
            <a
              href="https://github.com/axiom-forge/axiom-forge"
              onClick={(e) => {
                e.preventDefault();
                window.electronAPI.shell.openExternal('https://github.com/axiom-forge/axiom-forge');
              }}
              className="text-xs text-indigo-400 hover:text-indigo-300"
            >
              View on GitHub
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}

export default Settings;
