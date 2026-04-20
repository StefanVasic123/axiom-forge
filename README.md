# Axiom Forge

> Open-source local agent for the idea-to-app pipeline

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-26+-blue.svg)](https://electronjs.org/)
[![React](https://img.shields.io/badge/React-19+-61DAFB.svg)](https://reactjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC.svg)](https://tailwindcss.com/)

Axiom Forge is a production-ready, security-focused Electron application that serves as the 'Local Executor' for building projects using local AI (Ollama) and deploying them to your cloud accounts (GitHub + Vercel).

![Axiom Forge Screenshot](https://via.placeholder.com/800x450/0f172a/6366f1?text=Axiom+Forge)

## Features

- **Local AI Code Generation**: Uses Ollama with Llama 3.2 1B for privacy-first code generation
- **State Machine Flow**: Generation → Configuration → Deployment
- **Deep Link Protocol**: Register `axiom://` protocol to trigger builds from web
- **Secure Token Storage**: AES-256-GCM encryption for all API tokens
- **Always-on-top Progress**: Floating window during generation/deployment
- **One-click Deploy**: Push to GitHub and deploy to Vercel automatically

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Axiom Forge                             │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Generation  │→│ Configuration│→│  Deployment  │      │
│  │   (Ollama)   │  │   (ENV vars) │  │(GitHub+Vercel)│     │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
├─────────────────────────────────────────────────────────────┤
│  Security Layer (electron-store + AES-256-GCM)              │
└─────────────────────────────────────────────────────────────┘
```

## Installation

### Prerequisites

- Node.js 22+
- Ollama installed and running locally
- GitHub account with Personal Access Token
- Vercel account with API Token

### Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.com/install.sh | sh

# Pull the default model
ollama pull llama3.2:1b

# Start Ollama
ollama serve
```

### Install Axiom Forge

```bash
# Clone the repository
git clone https://github.com/axiom-forge/axiom-forge.git
cd axiom-forge

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Deep Link Protocol

Axiom Forge registers the `axiom://` protocol on your system:

```
axiom://build?id={manifestId}     - Trigger a new build
axiom://config?projectId={id}     - Open project configuration
axiom://deploy?projectId={id}     - Deploy a project
```

### Register Protocol Manually

**macOS:**
```bash
/Applications/Axiom\ Forge.app/Contents/MacOS/Axiom\ Forge --register-protocol
```

**Windows:**
The protocol is registered automatically during installation.

**Linux:**
```bash
xdg-mime default axiom-forge.desktop x-scheme-handler/axiom
```

## Security

### Token Encryption

All API tokens are encrypted at rest using:
- **Algorithm**: AES-256-GCM
- **Key Derivation**: PBKDF2 with 100,000 iterations
- **Storage**: electron-store with machine-specific encryption key

### Security Principles

1. All tokens are encrypted at rest
2. Encryption key is derived from machine-specific data + app secret
3. No tokens are ever logged or exposed in error messages
4. Memory is cleared after token operations
5. All token access is logged (operation type, timestamp, success/failure)

### Security Audit

The security layer is isolated in `src/lib/security.js` for easy auditing:

```javascript
// Token storage
await securityManager.storeToken('github-token', 'ghp_xxx');

// Token retrieval (decrypted)
const token = await securityManager.getToken('github-token');

// Audit log
const logs = securityManager.getAccessLog();
```

## Project Structure

```
axiom-forge/
├── main/                     # Electron main process
│   ├── main.js              # Entry point, protocol handling
│   └── preload.js           # Secure context bridge
├── src/
│   ├── lib/                 # Core libraries
│   │   ├── security.js      # Token encryption
│   │   ├── ollamaClient.js  # AI code generation
│   │   ├── taskOrchestrator.js  # State machine
│   │   └── deploymentService.js # GitHub + Vercel
│   ├── pages/               # React pages
│   │   ├── InstallationWizard.jsx
│   │   ├── Dashboard.jsx
│   │   ├── ProjectDetail.jsx
│   │   ├── ProjectConfig.jsx
│   │   └── Settings.jsx
│   ├── components/          # React components
│   │   ├── Layout.jsx
│   │   ├── FloatingProgress.jsx
│   │   └── ProjectRegistry.jsx
│   ├── hooks/               # Custom hooks
│   ├── contexts/            # React contexts
│   └── styles/              # CSS styles
├── package.json
├── vite.config.js
├── tailwind.config.js
└── README.md
```

## Configuration

### Environment Variables

Create a `.env` file for development:

```env
# Optional: Custom encryption key (default uses machine-specific data)
AXIOM_ENCRYPTION_KEY=your-custom-key

# Development
NODE_ENV=development
```

### Ollama Configuration

Default configuration:
- Host: `http://localhost:11434`
- Model: `llama3.2:1b`

Change in Settings or via API:

```javascript
ollamaClient.configure({
  host: 'http://localhost:11434',
  model: 'codellama:7b'
});
```

## API Reference

### Task Orchestrator

```javascript
// Start code generation
const { taskId, project } = await taskOrchestrator.startGeneration(
  manifestId,
  projectId,
  (progress) => console.log(progress)
);

// Configure project
await taskOrchestrator.configureProject(projectId, {
  'GOOGLE_CLIENT_ID': 'xxx',
  'GOOGLE_CLIENT_SECRET': 'xxx'
});

// Deploy project
await taskOrchestrator.startDeployment(projectId, (progress) => {
  console.log(progress);
});
```

### Ollama Client

```javascript
import { OllamaClient } from './src/lib/ollamaClient.js';

const ollama = new OllamaClient({
  host: 'http://localhost:11434',
  model: 'llama3.2:1b'
});

// Check health
const health = await ollama.healthCheck();

// Generate code
const result = await ollama.generateFile({
  path: 'src/components/Button.jsx',
  description: 'A reusable button component',
  language: 'jsx'
});

// Generate entire project
const project = await ollama.generateProject(manifest, onProgress);
```

## Development

### Scripts

```bash
# Development (Vite + Electron)
npm run dev

# Build Vite
npm run build:vite

# Build Electron
npm run build:electron

# Build both
npm run build

# Lint
npm run lint

# Test
npm run test
```

### Debugging

1. Run in development mode: `npm run dev`
2. Open DevTools: `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (macOS)
3. View logs in Console and main process terminal

## Building for Distribution

### macOS

```bash
npm run build
# Output: dist-electron/Axiom Forge-1.0.0.dmg
```

### Windows

```bash
npm run build
# Output: dist-electron/Axiom Forge Setup 1.0.0.exe
```

### Linux

```bash
npm run build
# Output: dist-electron/Axiom Forge-1.0.0.AppImage
```

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit changes: `git commit -am 'Add new feature'`
4. Push to branch: `git push origin feature/my-feature`
5. Submit a pull request

### Code Style

- ESLint for JavaScript/React
- Prettier for formatting
- Conventional Commits for commit messages

## Roadmap

- [ ] Support for more AI models (Claude, GPT-4)
- [ ] Additional deployment targets (AWS, GCP, Azure)
- [ ] Plugin system for custom generators
- [ ] Team collaboration features
- [ ] Web-based dashboard
- [ ] Mobile companion app

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Acknowledgments

- [Electron](https://electronjs.org/) - Cross-platform desktop apps
- [React](https://reactjs.org/) - UI library
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS
- [Ollama](https://ollama.com/) - Local AI models
- [Octokit](https://github.com/octokit/rest.js/) - GitHub API client

## Support

- 📖 [Documentation](https://docs.axiomforge.io)
- 💬 [Discord Community](https://discord.gg/axiomforge)
- 🐛 [Issue Tracker](https://github.com/axiom-forge/axiom-forge/issues)

---

<p align="center">
  Built with ❤️ by the Axiom Forge community
</p>
