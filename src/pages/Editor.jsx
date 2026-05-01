/**
 * Axiom Forge - AI Editor
 * Full-screen Monaco Editor + AI Chat Panel
 * Route: /projects/:projectId/editor
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import Editor, { DiffEditor, loader } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

// Monaco configuration: Disable workers to avoid "Node is not a constructor" issues in Electron sandbox
// Also ensure Node is a constructor if it exists but is shadowed/broken
if (typeof window !== 'undefined') {
  if (typeof window.Node === 'undefined') {
    window.Node = class Node {};
  }
}

window.MonacoEnvironment = {
  getWorkerUrl: function () {
    // Returning an empty string or a dummy script forces Monaco to run in the main thread
    return `data:text/javascript;charset=utf-8,${encodeURIComponent('self.onmessage=()=>{};')}`;
  }
};

loader.config({ monaco });
// ────────────────────────────────────────────────────────────────────────

import {
  ArrowLeft, Save, GitCommit, ChevronRight, ChevronDown,
  File, Folder, FolderOpen, Send, Loader2, Check, X,
  RotateCcw, Sparkles, Code2, AlertCircle, Eye, Monitor,
  FunctionSquare, Search, Info, Terminal
} from 'lucide-react';

// ==================== HELPERS ====================

function getLanguage(filePath) {
  const ext = filePath.split('.').pop()?.toLowerCase();
  const map = {
    js: 'javascript', jsx: 'javascript', mjs: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    html: 'html', htm: 'html',
    css: 'css', scss: 'scss', sass: 'sass', less: 'less',
    json: 'json', jsonc: 'json',
    md: 'markdown', mdx: 'markdown',
    php: 'php',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    cpp: 'cpp', cc: 'cpp', cxx: 'cpp',
    c: 'c', h: 'c',
    java: 'java',
    sh: 'shell', bash: 'shell',
    yaml: 'yaml', yml: 'yaml',
    toml: 'ini',
    xml: 'xml',
    svg: 'xml',
    sql: 'sql',
  };
  return map[ext] || 'plaintext';
}

function getFileIcon(filePath, isDir) {
  if (isDir) return null;
  const ext = filePath.split('.').pop()?.toLowerCase();
  const colors = {
    js: '#f7df1e', jsx: '#61dafb', ts: '#3178c6', tsx: '#61dafb',
    css: '#264de4', scss: '#cc6699', html: '#e34c26',
    json: '#cbcb41', md: '#519aba',
    py: '#3572A5', php: '#8892be', rs: '#dea584',
    go: '#00add8', java: '#b07219',
  };
  return colors[ext] || '#a0aec0';
}

// ==================== FILE TREE COMPONENT ====================

function FileTreeNode({ node, depth = 0, onSelect, selectedPath }) {
  const [open, setOpen] = useState(depth < 2);
  const isDir = node.type === 'directory';
  const isSelected = selectedPath === node.path;
  const color = getFileIcon(node.name, isDir);

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-[3px] cursor-pointer rounded text-sm transition-colors group
          ${isSelected ? 'bg-indigo-600/30 text-white' : 'text-slate-400 hover:bg-slate-700/50 hover:text-slate-200'}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        onClick={() => isDir ? setOpen(o => !o) : onSelect(node)}
      >
        {isDir ? (
          <>
            {open
              ? <ChevronDown className="w-3 h-3 shrink-0 text-slate-500" />
              : <ChevronRight className="w-3 h-3 shrink-0 text-slate-500" />}
            {open
              ? <FolderOpen className="w-3.5 h-3.5 shrink-0 text-yellow-400/80" />
              : <Folder className="w-3.5 h-3.5 shrink-0 text-yellow-400/60" />}
          </>
        ) : (
          <>
            <span className="w-3 h-3 shrink-0" />
            <File className="w-3.5 h-3.5 shrink-0" style={{ color: color || '#a0aec0' }} />
          </>
        )}
        <span className="truncate ml-0.5">{node.name}</span>
      </div>
      {isDir && open && node.children?.map(child => (
        <FileTreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
          selectedPath={selectedPath}
        />
      ))}
    </div>
  );
}

// Build tree from flat file list
function buildTree(files) {
  const root = { name: 'root', type: 'directory', children: [], path: '' };
  for (const f of files) {
    const parts = f.path.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      if (isLast) {
        node.children.push({ name: part, path: f.path, type: 'file', size: f.size });
      } else {
        let dir = node.children.find(c => c.name === part && c.type === 'directory');
        if (!dir) {
          dir = { name: part, path: parts.slice(0, i + 1).join('/'), type: 'directory', children: [] };
          node.children.push(dir);
        }
        node = dir;
      }
    }
  }
  // Sort: dirs first, then files, both alphabetically
  const sort = (n) => {
    if (n.children) {
      n.children.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      n.children.forEach(sort);
    }
  };
  sort(root);
  return root.children;
}

// ==================== AI PANEL COMPONENT ====================

function AIPanel({ activeFile, activeContent, projectId, onApply, pendingContent, setPendingContent, visualContext }) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Hello! I\'m connected to your local Ollama model. Open a file and tell me what you\'d like to change.' }
  ]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    // Slušamo direktivu
    console.log("[AIPanel] Registering onAiDirective listener");
    const unsubDirective = window.electronAPI.editor.onAiDirective(({ directive, optimizedPrompt, scope }) => {
      console.log("[AIPanel] Received directive:", directive, "Scope:", scope);
      setMessages(m => [...m, { 
        role: 'system', 
        content: `**IK Firewall Audit Završen**\n\n**Identifikovan Opseg (Scope):**\n\`${scope || 'ceo fajl'}\`\n\n**Optimizovan Prompt:**\n${optimizedPrompt}\n\n**Agent Directive:**\n${directive}` 
      }]);
    });

    // Slušamo strim
    console.log("[AIPanel] Registering onAiChunk listener");
    const unsubChunk = window.electronAPI.editor.onAiChunk(({ token }) => {
      setMessages(m => {
        const lastMsg = m[m.length - 1];
        if (lastMsg && lastMsg.role === 'assistant-stream') {
          return [...m.slice(0, -1), { ...lastMsg, content: lastMsg.content + token }];
        } else {
          return [...m, { role: 'assistant-stream', content: token }];
        }
      });
    });

    return () => {
      if (unsubDirective) unsubDirective();
      if (unsubChunk) unsubChunk();
    };
  }, []);

  const handleSend = async () => {
    if (!input.trim() || isThinking) return;
    if (!activeFile) {
      setMessages(m => [...m, { role: 'assistant', content: '⚠️ Please open a file first before asking me to make changes.' }]);
      return;
    }

    const userMsg = input.trim();
    setInput('');
    setMessages(m => [...m, { role: 'user', content: userMsg }]);
    setIsThinking(true);
    setPendingContent(null);

    try {
      const result = await window.electronAPI.editor.aiEdit(
        activeFile.path,
        activeContent,
        userMsg,
        null, // featureContext
        visualContext
      );

      if (result.success) {
        setPendingContent(result.newContent);
        setMessages(m => [...m, {
          role: 'assistant',
          content: `✅ I've prepared the changes for **${activeFile.name || activeFile.path}**. Review below and click **Apply** to save.`,
          hasDiff: true
        }]);
      } else {
        setMessages(m => [...m, { role: 'assistant', content: `❌ Error: ${result.error}` }]);
      }
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `❌ Connection error: ${err.message}` }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleApply = async () => {
    if (!pendingContent) return;
    await onApply(pendingContent, `AI: ${messages.filter(m => m.role === 'user').at(-1)?.content?.slice(0, 60)}`);
    setPendingContent(null);
    setMessages(m => [...m, { role: 'assistant', content: '✅ Changes applied and saved to disk.' }]);
  };

  const handleDiscard = () => {
    setPendingContent(null);
    setMessages(m => [...m, { role: 'assistant', content: 'Changes discarded.' }]);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 border-l border-slate-700/50">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700/50">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <span className="text-sm font-semibold text-white">AI Assistant</span>
        <span className="text-xs text-slate-500 ml-auto">ollama / llama3.2</span>
      </div>

      {/* Active file context indicator */}
      {activeFile && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 border-b border-slate-700/30">
          <Code2 className="w-3 h-3 text-indigo-400" />
          <span className="text-xs text-slate-400 truncate">{activeFile.path}</span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap
              ${msg.role === 'user'
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : msg.role === 'system'
                ? 'bg-slate-800/80 border border-indigo-500/30 text-indigo-200 text-xs rounded-bl-sm font-mono'
                : 'bg-slate-800 text-slate-300 rounded-bl-sm border border-slate-700/50'}`}>
              {msg.content}
            </div>
          </div>
        ))}

        {isThinking && (
          <div className="flex justify-start">
            <div className="bg-slate-800 border border-slate-700/50 rounded-lg rounded-bl-sm px-3 py-2">
              <div className="flex gap-1 items-center">
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending diff action buttons */}
      {pendingContent && (
        <div className="px-3 py-2 border-t border-slate-700/50 bg-slate-800/50">
          <p className="text-xs text-slate-400 mb-2">Ready to apply changes:</p>
          <div className="flex gap-2">
            <button
              onClick={handleApply}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium rounded-lg transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Apply
            </button>
            <button
              onClick={handleDiscard}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-medium rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Discard
            </button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-3 py-3 border-t border-slate-700/50">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={activeFile ? `Ask AI to modify ${activeFile.name || 'this file'}...` : 'Open a file first...'}
            rows={3}
            disabled={isThinking}
            className="flex-1 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-indigo-500 disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={isThinking || !input.trim()}
            className="self-end p-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            {isThinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-xs text-slate-600 mt-1">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}

// ==================== MAIN EDITOR PAGE ====================

export default function EditorPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [project, setProject] = useState(null);
  const [files, setFiles] = useState([]);
  const [treeNodes, setTreeNodes] = useState([]);
  const [openTabs, setOpenTabs] = useState([]);     // [{path, name, content, isDirty}]
  const [activeTabPath, setActiveTabPath] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [pendingContent, setPendingContent] = useState(null); // Lifted state for DiffEditor
  const [isThinking, setIsThinking] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [functions, setFunctions] = useState([]);
  const [previewUrl, setPreviewUrl] = useState('http://localhost:5173');
  
  // Dev Server State
  const [serverRunning, setServerRunning] = useState(false);
  const [serverLogs, setServerLogs] = useState([]);
  const [showTerminal, setShowTerminal] = useState(false);
  const terminalEndRef = useRef(null);
  
  const iframeRef = useRef(null);
  const editorRef = useRef(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (showTerminal) {
      terminalEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [serverLogs, showTerminal]);

  // Server IPC listeners
  useEffect(() => {
    if (!window.electronAPI.server) return;

    // Check initial status
    window.electronAPI.server.getStatus(projectId).then(res => {
      setServerRunning(res.isRunning);
    });

    const unsubStatus = window.electronAPI.server.onStatus(({ status }) => {
      setServerRunning(status === 'running');
    });

    const unsubLog = window.electronAPI.server.onLog(({ text, type }) => {
      setServerLogs(logs => {
        const newLogs = [...logs, { text, type, id: Date.now() + Math.random() }];
        return newLogs.slice(-200); // Keep last 200 logs
      });
    });

    return () => {
      unsubStatus();
      unsubLog();
    };
  }, [projectId]);

  const toggleServer = async () => {
    if (serverRunning) {
      await window.electronAPI.server.stop();
    } else {
      setServerLogs([{ text: '> Starting server...', type: 'info', id: Date.now() }]);
      setShowTerminal(true);
      await window.electronAPI.server.start({ 
        projectId, 
        platform: project?.manifest?.platform || 'web',
        techStack: project?.manifest?.techStack?.framework || 'nextjs'
      });
    }
  };

  // Parse functions from content
  useEffect(() => {
    if (!activeTab?.content) {
      setFunctions([]);
      return;
    }
    const content = activeTab.content;
    const found = [];
    const functionRegex = /(?:function\s+([a-zA-Z0-9_]+)|(?:const|let|var)\s+([a-zA-Z0-9_]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>)/g;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const name = match[1] || match[2];
      if (name) {
        const line = content.substring(0, match.index).split('\n').length;
        found.push({ name, line });
      }
    }
    setFunctions(found);
  }, [activeTab?.content]);

  const jumpToLine = (line) => {
    if (editorRef.current) {
      editorRef.current.revealLineInCenter(line);
      editorRef.current.setPosition({ lineNumber: line, column: 1 });
      editorRef.current.focus();
    }
  };

  const [selectedElement, setSelectedElement] = useState(null);

  // Inspector Listener
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data?.type === 'AXIOM_INSPECT') {
        const { filePath, line, tag, classes, text, component } = event.data;
        if (filePath) {
          console.log("[Inspector] Navigating to:", filePath, "line:", line, "component:", component);
          setSelectedElement({ tag, classes, text, component });
          // Try to find the file and open it
          const node = files.find(f => f.path.includes(filePath) || filePath.includes(f.path));
          if (node) {
            openFile(node).then(() => {
              if (line) setTimeout(() => jumpToLine(line), 100);
            });
          }
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [files, openFile]);

  // Inject inspector script into iframe
  useEffect(() => {
    if (showPreview && iframeRef.current) {
      const inject = () => {
        try {
          const doc = iframeRef.current.contentDocument || iframeRef.current.contentWindow.document;
          const script = doc.createElement('script');
          script.textContent = `
            (function() {
              console.log("[Axiom Inspector] Injected");
              document.addEventListener('click', (e) => {
                if (e.altKey || e.ctrlKey) { // Trigger with Alt+Click
                  e.preventDefault();
                  e.stopPropagation();
                  
                  // Try to find source info (React devtools often inject this)
                  let target = e.target;
                  let filePath = null;
                  let line = null;
                  let component = null;
                  
                  // Use Axiom injected metadata or fallback to standard source maps
                  while (target && target !== document.body) {
                    if (target.dataset?.axiomComponent && !component) {
                      component = target.dataset.axiomComponent;
                    }
                    if (target.dataset?.axiomFile && !filePath) {
                      filePath = target.dataset.axiomFile;
                    }
                    if (target.dataset?.source && !filePath) {
                      filePath = target.dataset.source;
                    }
                    if (filePath) break;
                    target = target.parentElement;
                  }
                  
                  window.parent.postMessage({ 
                    type: 'AXIOM_INSPECT', 
                    filePath: filePath || 'unknown',
                    line: line,
                    component: component || 'unknown',
                    tag: e.target.tagName.toLowerCase(),
                    classes: e.target.className,
                    text: e.target.innerText.substring(0, 50)
                  }, '*');
                }
              }, true);
            })();
          `;
          doc.head.appendChild(script);
        } catch (err) {
          console.warn("[Inspector] Injection failed (XSS/CORS?):", err);

        }
      };
      
      const timer = setTimeout(inject, 2000); // Wait for load
      return () => clearTimeout(timer);
    }
  }, [showPreview]);

  console.log("[EditorPage] Render. pendingContent exists?", !!pendingContent);
  if (pendingContent) {
    console.log("[EditorPage] pendingContent length:", pendingContent.length);
  }

  const activeTab = openTabs.find(t => t.path === activeTabPath) || null;

  // Load project + files
  useEffect(() => {
    const load = async () => {
      const res = await window.electronAPI.project.getAll();
      const proj = res.projects?.find(p => p.id === projectId);
      setProject(proj || null);

      const fileRes = await window.electronAPI.project.getFiles(projectId);
      if (fileRes.success) {
        setFiles(fileRes.files);
        setTreeNodes(buildTree(fileRes.files));
      }
    };
    load();
  }, [projectId]);

  // Open a file into tabs
  const openFile = useCallback(async (node) => {
    // If already open, just switch
    if (openTabs.find(t => t.path === node.path)) {
      setActiveTabPath(node.path);
      return;
    }
    const res = await window.electronAPI.project.readFile(projectId, node.path);
    const content = res.success ? res.content : `// Error loading file: ${res.error}`;
    const tab = { path: node.path, name: node.name, content, isDirty: false };
    setOpenTabs(tabs => [...tabs, tab]);
    setActiveTabPath(node.path);
  }, [openTabs, projectId]);

  // Close a tab
  const closeTab = (tabPath, e) => {
    e?.stopPropagation();
    const tab = openTabs.find(t => t.path === tabPath);
    if (tab?.isDirty && !confirm('Unsaved changes. Close anyway?')) return;
    const remaining = openTabs.filter(t => t.path !== tabPath);
    setOpenTabs(remaining);
    if (activeTabPath === tabPath) {
      setActiveTabPath(remaining.at(-1)?.path || null);
      setPendingContent(null);
    }
  };

  // Monaco editor change handler
  const handleEditorChange = (value) => {
    setOpenTabs(tabs => tabs.map(t =>
      t.path === activeTabPath ? { ...t, content: value, isDirty: true } : t
    ));
  };

  // Save active file (Ctrl+S)
  const saveActiveFile = useCallback(async () => {
    if (!activeTab) return;
    setIsSaving(true);
    const result = await window.electronAPI.editor.writeFile(projectId, activeTab.path, activeTab.content);
    if (result.success) {
      setOpenTabs(tabs => tabs.map(t => t.path === activeTabPath ? { ...t, isDirty: false } : t));
      setStatusMsg(`Saved: ${activeTab.name}`);
      setTimeout(() => setStatusMsg(''), 2000);
    } else {
      setStatusMsg(`Error saving: ${result.error}`);
    }
    setIsSaving(false);
  }, [activeTab, activeTabPath, projectId]);

  // Keyboard shortcut Ctrl+S
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        saveActiveFile();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveActiveFile]);

  // Apply AI changes to active tab
  const handleAIApply = async (newContent, commitMsg) => {
    if (!activeTab) return;

    // If editor is mounted, apply as an edit operation to preserve UNDO history
    if (editorRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        editorRef.current.pushUndoStop();
        editorRef.current.executeEdits('ai-editor', [
          {
            range: model.getFullModelRange(),
            text: newContent,
            forceMoveMarkers: true
          }
        ]);
        editorRef.current.pushUndoStop();
      }
    } else {
      // Fallback if editor is not mounted
      setOpenTabs(tabs => tabs.map(t =>
        t.path === activeTabPath ? { ...t, content: newContent, isDirty: true } : t
      ));
    }

    // Write to disk
    await window.electronAPI.editor.writeFile(projectId, activeTab.path, newContent);
    // Git commit
    await window.electronAPI.editor.gitCommit(projectId, commitMsg || `AI: edited ${activeTab.path}`);
    setPendingContent(null);
    setStatusMsg(`AI changes applied & committed`);
    setTimeout(() => setStatusMsg(''), 3000);
  };

  // Manual git commit + push
  const handleCommit = async () => {
    // Save all dirty tabs first
    for (const tab of openTabs.filter(t => t.isDirty)) {
      await window.electronAPI.editor.writeFile(projectId, tab.path, tab.content);
    }
    setOpenTabs(tabs => tabs.map(t => ({ ...t, isDirty: false })));

    setIsCommitting(true);
    const msg = `Axiom Editor — ${new Date().toLocaleString()}`;
    await window.electronAPI.editor.gitCommit(projectId, msg);
    const pushResult = await window.electronAPI.project.pushToGitHub(projectId);
    setIsCommitting(false);
    setStatusMsg(pushResult.success ? '✅ Committed & pushed to GitHub' : `Push failed: ${pushResult.error}`);
    setTimeout(() => setStatusMsg(''), 4000);
  };

  const dirtyCount = openTabs.filter(t => t.isDirty).length;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden">
      {/* ── TOP BAR ── */}
      <div className="flex items-center gap-3 px-4 py-2 bg-slate-900 border-b border-slate-700/50 shrink-0">
        <button
          onClick={() => navigate(`/projects/${projectId}`)}
          className="flex items-center gap-1.5 text-slate-400 hover:text-white transition-colors text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="w-px h-4 bg-slate-700" />

        <div className="flex items-center gap-2">
          <Code2 className="w-4 h-4 text-indigo-400" />
          <span className="text-sm font-semibold text-white">{project?.name || projectId}</span>
          {dirtyCount > 0 && (
            <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded">
              {dirtyCount} unsaved
            </span>
          )}
        </div>

        <div className="mx-6 h-8 w-px bg-slate-700/50" />

        {/* View Toggles */}
        <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-lg border border-slate-700/50">
          <button 
            onClick={() => setShowPreview(false)}
            className={`px-3 py-1.5 rounded-md text-[10px] uppercase font-bold flex items-center gap-2 transition-all ${!showPreview ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Code2 className="w-3.5 h-3.5" /> Code
          </button>
          <button 
            onClick={() => setShowPreview(true)}
            className={`px-3 py-1.5 rounded-md text-[10px] uppercase font-bold flex items-center gap-2 transition-all ${showPreview ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Monitor className="w-3.5 h-3.5" /> Preview
          </button>
        </div>

        <div className="mx-2 h-6 w-px bg-slate-700/50" />

        <button
          onClick={toggleServer}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors border ${
            serverRunning 
              ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20' 
              : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
          }`}
        >
          {serverRunning ? (
            <><div className="w-2 h-2 rounded-sm bg-red-400" /> Stop Server</>
          ) : (
            <><div className="w-0 h-0 border-t-[5px] border-t-transparent border-l-[8px] border-l-emerald-400 border-b-[5px] border-b-transparent ml-0.5" /> Start Server</>
          )}
        </button>
        
        <button
          onClick={() => setShowTerminal(t => !t)}
          className={`px-2 py-1.5 rounded-lg text-slate-400 hover:text-white transition-colors ${showTerminal ? 'bg-slate-700/50 text-white' : ''}`}
          title="Toggle Terminal"
        >
          <Terminal className="w-4 h-4" />
        </button>

        <div className="ml-auto flex items-center gap-2">
          {statusMsg && (
            <span className="text-xs text-slate-400 italic">{statusMsg}</span>
          )}

          <button
            onClick={saveActiveFile}
            disabled={isSaving || !activeTab?.isDirty}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-slate-200 rounded-lg transition-colors"
          >
            {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
            Save
          </button>

          <button
            onClick={handleCommit}
            disabled={isCommitting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-indigo-700 hover:bg-indigo-600 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            {isCommitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitCommit className="w-3.5 h-3.5" />}
            Commit & Push
          </button>
        </div>
      </div>

      {/* ── MAIN AREA ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* FILE TREE */}
        <div className="w-56 shrink-0 bg-slate-900 border-r border-slate-700/50 flex flex-col overflow-hidden h-[50%]">
          <div className="px-3 py-2 border-b border-slate-700/30 flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Explorer</span>
          </div>
          <div className="flex-1 overflow-y-auto py-1 custom-scrollbar">
            {treeNodes.length === 0 ? (
              <div className="px-3 py-4 text-xs text-slate-600 text-center">No files found</div>
            ) : treeNodes.map(node => (
              <FileTreeNode
                key={node.path || node.name}
                node={node}
                depth={0}
                onSelect={openFile}
                selectedPath={activeTabPath}
              />
            ))}
          </div>
        </div>

        {/* Symbols Panel */}
        <div className="w-56 shrink-0 bg-slate-900 border-r border-slate-700/50 flex flex-col overflow-hidden h-[50%] border-t border-slate-700/50">
          <div className="px-3 py-2 border-b border-slate-700/30 flex items-center gap-2">
            <FunctionSquare className="w-3.5 h-3.5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Symbols</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
            {functions.length > 0 ? functions.map((fn, idx) => (
              <button
                key={idx}
                onClick={() => jumpToLine(fn.line)}
                className="w-full text-left px-2 py-1.5 rounded text-xs text-slate-400 hover:bg-indigo-600/20 hover:text-indigo-300 transition-colors flex items-center gap-2 group"
              >
                <div className="w-1 h-1 rounded-full bg-slate-600 group-hover:bg-indigo-500" />
                <span className="truncate">{fn.name}</span>
                <span className="ml-auto text-[10px] opacity-30">L{fn.line}</span>
              </button>
            )) : (
              <div className="p-4 text-center text-[10px] text-slate-600 italic">No functions detected</div>
            )}
          </div>
        </div>

        {/* CENTER: TABS + MONACO */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex items-end bg-slate-900 border-b border-slate-700/50 overflow-x-auto shrink-0">
            {openTabs.length === 0 && (
              <div className="px-4 py-2 text-xs text-slate-600 italic">Open a file from the explorer</div>
            )}
            {openTabs.map(tab => (
              <div
                key={tab.path}
                onClick={() => {
                  setActiveTabPath(tab.path);
                  setPendingContent(null); // Clear pending content when switching tabs
                }}
                className={`flex items-center gap-2 px-3 py-2 text-xs border-r border-slate-700/30 cursor-pointer shrink-0 transition-colors
                  ${activeTabPath === tab.path
                    ? 'bg-slate-950 text-white border-t-2 border-t-indigo-500'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-850 hover:text-slate-300'}`}
              >
                <span className={tab.isDirty ? 'text-amber-400' : ''}>
                  {tab.isDirty ? '●' : ''} {tab.name}
                </span>
                <button
                  onClick={(e) => closeTab(tab.path, e)}
                  className="w-3.5 h-3.5 rounded hover:bg-slate-600 flex items-center justify-center opacity-60 hover:opacity-100"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Monaco Editor Wrapper */}
          <div className="flex-1 overflow-hidden relative flex flex-col">
            {activeTab ? (
              <>
                {showPreview ? (
                  <div className="flex-1 flex flex-col bg-white">
                    <div className="h-8 bg-slate-100 border-b border-slate-200 flex items-center px-4 gap-4 shrink-0">
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                      </div>
                      <div className="flex-1 bg-white border border-slate-300 rounded px-2 py-0.5 text-[10px] text-slate-500 flex items-center gap-2">
                        <Info className="w-3 h-3" /> {previewUrl}
                      </div>
                    </div>
                    <iframe
                      ref={iframeRef}
                      src={previewUrl}
                      className="flex-1 w-full border-none"
                      title="Project Preview"
                    />
                  </div>
                ) : (
                  <>
                    {/* Main Editor */}
                    <div className={`flex-1 ${pendingContent ? 'hidden' : 'block'}`}>
                      <Editor
                        key={activeTabPath}
                        height="100%"
                        language={getLanguage(activeTab.path)}
                        value={activeTab.content}
                        theme="vs-dark"
                        onChange={handleEditorChange}
                        onMount={(editor) => { editorRef.current = editor; }}
                        options={{
                          fontSize: 13,
                          fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
                          fontLigatures: true,
                          minimap: { enabled: true, scale: 1 },
                          lineNumbers: 'on',
                          wordWrap: 'on',
                          scrollBeyondLastLine: false,
                          smoothScrolling: true,
                          cursorBlinking: 'smooth',
                          cursorSmoothCaretAnimation: 'on',
                          renderLineHighlight: 'all',
                          bracketPairColorization: { enabled: true },
                          automaticLayout: true,
                          padding: { top: 12 },
                        }}
                      />
                    </div>

                    {/* Diff Review View */}
                    {pendingContent && (
                      <div className="h-full flex flex-col absolute inset-0 z-10 bg-slate-900">
                        <div className="bg-indigo-900/40 border-b border-indigo-500/30 px-4 py-2 flex justify-between items-center shrink-0">
                          <span className="text-sm text-indigo-300 font-semibold flex items-center gap-2">
                            <Sparkles className="w-4 h-4" /> Reviewing AI Changes
                          </span>
                          <span className="text-xs text-slate-400">
                            Original (Left) ➔ Modified (Right)
                          </span>
                        </div>
                        <div className="flex-1 overflow-hidden">
                          <DiffEditor
                            key={`diff-view-${activeTabPath}-${pendingContent ? 'active' : 'none'}`}
                            height="100%"
                            language={getLanguage(activeTab.path)}
                            original={activeTab.content}
                            modified={pendingContent}
                            theme="vs-dark"
                            options={{
                              fontSize: 13,
                              fontFamily: '"Fira Code", "Cascadia Code", Consolas, monospace',
                              minimap: { enabled: false },
                              renderSideBySide: true,
                              readOnly: true,
                              automaticLayout: true,
                              scrollBeyondLastLine: false,
                              originalEditable: false,
                              diffCodeLens: false
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 gap-3">
                <Code2 className="w-12 h-12 opacity-20" />
                <p className="text-sm">Select a file from the explorer to edit</p>
                <p className="text-xs opacity-60">Ctrl+S to save · AI panel on the right to modify with prompts</p>
              </div>
            )}
          </div>

          {/* Terminal Console */}
          {showTerminal && (
            <div className="h-48 shrink-0 bg-[#1e1e1e] border-t border-slate-700/50 flex flex-col z-20">
              <div className="px-3 py-1.5 bg-slate-800/80 border-b border-slate-700/50 flex justify-between items-center shrink-0">
                <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5" /> Dev Server Logs
                </span>
                <button onClick={() => setShowTerminal(false)} className="text-slate-400 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 font-mono text-[11px] text-slate-300 custom-scrollbar leading-relaxed">
                {serverLogs.length === 0 ? (
                  <div className="text-slate-600 italic">No logs yet...</div>
                ) : (
                  serverLogs.map((log) => (
                    <div key={log.id} className={`${log.type === 'error' ? 'text-red-400' : 'text-slate-300'} whitespace-pre-wrap font-mono`}>
                      {log.text}
                    </div>
                  ))
                )}
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}

          {/* Status Bar */}
          <div className="flex items-center gap-4 px-4 py-1 bg-indigo-700/20 border-t border-slate-700/30 text-xs text-slate-500 shrink-0">
            {activeTab && (
              <>
                <span>{getLanguage(activeTab.path)}</span>
                <span>·</span>
                <span>{activeTab.path}</span>
                {activeTab.isDirty && <span className="text-amber-400 ml-auto">● Unsaved changes</span>}
              </>
            )}
          </div>
        </div>

        {/* AI PANEL */}
        <div className="w-80 shrink-0">
          <AIPanel
            activeFile={activeTab}
            activeContent={activeTab?.content}
            projectId={projectId}
            pendingContent={pendingContent}
            setPendingContent={setPendingContent}
            visualContext={selectedElement}
            onApply={handleAIApply}
          />
        </div>
      </div>
    </div>
  );
}
