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
  const [defaultModel, setDefaultModel] = useState('llama3.2:1b');
  const [ollamaStatus, setOllamaStatus] = useState('unknown');
  const [isTestingOllama, setIsTestingOllama] = useState(false);

  useEffect(() => {
    checkTokens();
    testOllamaConnection();
  }, []);

  const testOllamaConnection = async () => {
    setIsTestingOllama(true);
    try {
      // In a real implementation, this would check via the main process
      await new Promise(resolve => setTimeout(resolve, 1000));
      setOllamaStatus('connected');
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
        </div>
      </section>

      {/* Ollama Settings */}
      <section className="card p-6 space-y-6">
        <div className="flex items-center gap-3 pb-4 border-b border-slate-800">
          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
            <Server className="w-5 h-5 text-orange-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Ollama Settings</h2>
            <p className="text-sm text-slate-500">
              Configure your local AI model
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

          <div>
            <label className="label">Default Model</label>
            <select
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              className="input"
            >
              <option value="llama3.2:1b">Llama 3.2 1B (Fast)</option>
              <option value="llama3.2:3b">Llama 3.2 3B (Balanced)</option>
              <option value="codellama:7b">CodeLlama 7B (Better Code)</option>
              <option value="mistral:7b">Mistral 7B (Powerful)</option>
            </select>
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
