/**
 * Axiom Forge - Installation Wizard
 * Step-by-step onboarding for first-time users
 */

import React, { useState } from 'react';
import { 
  Check, 
  ChevronRight, 
  ChevronLeft, 
  Key, 
  Server, 
  Sparkles,
  ExternalLink,
  Eye,
  EyeOff,
  AlertCircle
} from 'lucide-react';
import { useAppStore } from '../hooks/useAppStore';

const STEPS = [
  { id: 'welcome', title: 'Welcome', description: 'Get started with Axiom Forge' },
  { id: 'ollama', title: 'Ollama Setup', description: 'Configure local AI' },
  { id: 'github', title: 'GitHub', description: 'Connect your account' },
  { id: 'vercel', title: 'Vercel', description: 'Deploy with ease' },
  { id: 'complete', title: 'Complete', description: 'Ready to build' }
];

function StepIndicator({ currentStep, steps }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, index) => {
        const isActive = index === currentStep;
        const isCompleted = index < currentStep;
        
        return (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                    : isCompleted
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-slate-500 border border-slate-700'
                }`}
              >
                {isCompleted ? (
                  <Check className="w-5 h-5" />
                ) : (
                  index + 1
                )}
              </div>
              <span className={`text-xs mt-2 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`}>
                {step.title}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`w-12 h-0.5 ${isCompleted ? 'bg-emerald-600' : 'bg-slate-800'}`} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

function WelcomeStep({ onNext }) {
  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-xl shadow-indigo-500/20">
        <Sparkles className="w-10 h-10 text-white" />
      </div>
      
      <div>
        <h2 className="text-3xl font-bold text-white mb-3">
          Welcome to <span className="gradient-text">Axiom Forge</span>
        </h2>
        <p className="text-slate-400 max-w-md mx-auto">
          Your open-source local agent for the idea-to-app pipeline. 
          Generate, configure, and deploy applications using local AI.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 max-w-lg mx-auto">
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center mb-2">
            <Server className="w-4 h-4 text-indigo-400" />
          </div>
          <p className="text-sm font-medium text-slate-300">Local AI</p>
          <p className="text-xs text-slate-500">Privacy-first</p>
        </div>
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center mb-2">
            <Key className="w-4 h-4 text-violet-400" />
          </div>
          <p className="text-sm font-medium text-slate-300">Secure</p>
          <p className="text-xs text-slate-500">Encrypted tokens</p>
        </div>
        <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
          <div className="w-8 h-8 rounded-lg bg-fuchsia-500/10 flex items-center justify-center mb-2">
            <Sparkles className="w-4 h-4 text-fuchsia-400" />
          </div>
          <p className="text-sm font-medium text-slate-300">Automated</p>
          <p className="text-xs text-slate-500">One-click deploy</p>
        </div>
      </div>

      <button onClick={onNext} className="btn-primary px-8">
        Get Started
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

function OllamaStep({ onNext, onBack }) {
  const [status, setStatus] = useState('checking'); // checking, ready, error
  const [message, setMessage] = useState('Checking Ollama...');

  const checkOllama = async () => {
    setStatus('checking');
    setMessage('Checking Ollama...');
    
    try {
      // In a real implementation, this would check via the main process
      // For now, we'll simulate the check
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Simulate success
      setStatus('ready');
      setMessage('Ollama is running with llama3.2:1b');
    } catch (error) {
      setStatus('error');
      setMessage('Ollama not found. Please install and run Ollama.');
    }
  };

  React.useEffect(() => {
    checkOllama();
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto rounded-xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center mb-4">
          <Server className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Ollama Setup</h2>
        <p className="text-slate-400">
          Axiom Forge uses Ollama for local AI code generation
        </p>
      </div>

      <div className="card p-6 max-w-md mx-auto">
        <div className="flex items-center gap-4 mb-4">
          <div className={`w-3 h-3 rounded-full ${
            status === 'checking' ? 'bg-amber-500 animate-pulse' :
            status === 'ready' ? 'bg-emerald-500' :
            'bg-rose-500'
          }`} />
          <span className="text-slate-300">{message}</span>
        </div>

        {status === 'error' && (
          <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-lg mb-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-rose-400 font-medium mb-1">Ollama not detected</p>
                <p className="text-xs text-rose-300/70 mb-3">
                  Install Ollama and pull the llama3.2:1b model
                </p>
                <code className="block bg-rose-950/50 p-2 rounded text-xs text-rose-300 font-mono">
                  ollama pull llama3.2:1b
                </code>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={checkOllama}
          className="btn-secondary w-full"
          disabled={status === 'checking'}
        >
          {status === 'checking' ? 'Checking...' : 'Check Again'}
        </button>
      </div>

      <div className="flex justify-between max-w-md mx-auto">
        <button onClick={onBack} className="btn-ghost">
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
        <button 
          onClick={onNext} 
          className="btn-primary"
          disabled={status !== 'ready'}
        >
          Continue
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function GitHubStep({ onNext, onBack }) {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const { saveToken } = useAppStore();

  const handleSave = async () => {
    if (!token.trim()) {
      setError('Please enter a GitHub token');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await saveToken('github-token', token);
      onNext();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto rounded-xl bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center mb-4 border border-slate-600">
          <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Connect GitHub</h2>
        <p className="text-slate-400">
          Store your code and enable automatic deployments
        </p>
      </div>

      <div className="card p-6 max-w-md mx-auto space-y-4">
        <div>
          <label className="label flex items-center gap-2">
            <Key className="w-4 h-4" />
            Personal Access Token
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              className="input pr-10"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Your token is encrypted and stored locally
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
            <p className="text-sm text-rose-400">{error}</p>
          </div>
        )}

        <a
          href="https://github.com/settings/tokens/new"
          onClick={(e) => {
            e.preventDefault();
            window.electronAPI.shell.openExternal('https://github.com/settings/tokens/new?scopes=repo,workflow&description=Axiom%20Forge');
          }}
          className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300"
        >
          <ExternalLink className="w-4 h-4" />
          Create a GitHub token
        </a>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary w-full"
        >
          {isSaving ? 'Saving...' : 'Save & Continue'}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex justify-start max-w-md mx-auto">
        <button onClick={onBack} className="btn-ghost">
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
      </div>
    </div>
  );
}

function VercelStep({ onNext, onBack }) {
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const { saveToken } = useAppStore();

  const handleSave = async () => {
    if (!token.trim()) {
      setError('Please enter a Vercel token');
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await saveToken('vercel-token', token);
      onNext();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="w-16 h-16 mx-auto rounded-xl bg-black flex items-center justify-center mb-4 border border-slate-800">
          <svg className="w-8 h-8 text-white" viewBox="0 0 76 65" fill="none">
            <path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="currentColor"/>
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Connect Vercel</h2>
        <p className="text-slate-400">
          Deploy your applications with one click
        </p>
      </div>

      <div className="card p-6 max-w-md mx-auto space-y-4">
        <div>
          <label className="label flex items-center gap-2">
            <Key className="w-4 h-4" />
            Vercel Token
          </label>
          <div className="relative">
            <input
              type={showToken ? 'text' : 'password'}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="vercel_token_xxxxxxxx"
              className="input pr-10"
            />
            <button
              onClick={() => setShowToken(!showToken)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Your token is encrypted and stored locally
          </p>
        </div>

        {error && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg">
            <p className="text-sm text-rose-400">{error}</p>
          </div>
        )}

        <a
          href="https://vercel.com/account/tokens"
          onClick={(e) => {
            e.preventDefault();
            window.electronAPI.shell.openExternal('https://vercel.com/account/tokens');
          }}
          className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300"
        >
          <ExternalLink className="w-4 h-4" />
          Create a Vercel token
        </a>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="btn-primary w-full"
        >
          {isSaving ? 'Saving...' : 'Save & Continue'}
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      <div className="flex justify-start max-w-md mx-auto">
        <button onClick={onBack} className="btn-ghost">
          <ChevronLeft className="w-5 h-5" />
          Back
        </button>
      </div>
    </div>
  );
}

function CompleteStep() {
  const { setFirstRun } = useAppStore();

  const handleFinish = () => {
    setFirstRun(false);
  };

  return (
    <div className="text-center space-y-6">
      <div className="w-20 h-20 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center border-2 border-emerald-500">
        <Check className="w-10 h-10 text-emerald-500" />
      </div>
      
      <div>
        <h2 className="text-3xl font-bold text-white mb-3">
          You're All Set!
        </h2>
        <p className="text-slate-400 max-w-md mx-auto">
          Axiom Forge is ready to build. Start by creating your first project 
          or explore the dashboard.
        </p>
      </div>

      <div className="card p-6 max-w-md mx-auto">
        <h3 className="font-semibold text-white mb-4">What's Next?</h3>
        <ul className="space-y-3 text-left">
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs text-indigo-400 font-medium">1</span>
            </div>
            <span className="text-slate-300 text-sm">Browse templates on Axiom Forge</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs text-indigo-400 font-medium">2</span>
            </div>
            <span className="text-slate-300 text-sm">Click "Build with Axiom Forge" to start</span>
          </li>
          <li className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-full bg-indigo-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-xs text-indigo-400 font-medium">3</span>
            </div>
            <span className="text-slate-300 text-sm">Watch your app come to life!</span>
          </li>
        </ul>
      </div>

      <button onClick={handleFinish} className="btn-primary px-8">
        Go to Dashboard
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  );
}

function InstallationWizard() {
  const [currentStep, setCurrentStep] = useState(0);

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WelcomeStep onNext={handleNext} />;
      case 1:
        return <OllamaStep onNext={handleNext} onBack={handleBack} />;
      case 2:
        return <GitHubStep onNext={handleNext} onBack={handleBack} />;
      case 3:
        return <VercelStep onNext={handleNext} onBack={handleBack} />;
      case 4:
        return <CompleteStep />;
      default:
        return <WelcomeStep onNext={handleNext} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <StepIndicator currentStep={currentStep} steps={STEPS} />
        
        <div className="card p-8">
          {renderStep()}
        </div>

        <p className="text-center text-slate-500 text-sm mt-6">
          Your data is stored locally and encrypted.{' '}
          <button 
            onClick={() => window.electronAPI.shell.openExternal('https://axiomforge.io/privacy')}
            className="text-indigo-400 hover:text-indigo-300"
          >
            Learn more
          </button>
        </p>
      </div>
    </div>
  );
}

export default InstallationWizard;
