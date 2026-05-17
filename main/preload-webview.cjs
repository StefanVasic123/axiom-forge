const { ipcRenderer } = require('electron');

let isInspectMode = true; // We can toggle this via IPC if needed
let highlightedElement = null;

const HIGHLIGHT_STYLE = `
  .axiom-inspect-highlight {
    outline: 2px solid #6366f1 !important;
    outline-offset: -2px !important;
    cursor: crosshair !important;
    background-color: rgba(99, 102, 241, 0.1) !important;
    transition: all 0.1s ease;
  }
`;

document.addEventListener('DOMContentLoaded', () => {
  console.log('[Axiom Webview] Preload script injected successfully.');
  
  // Inject highlight styles
  const styleEl = document.createElement('style');
  styleEl.textContent = HIGHLIGHT_STYLE;
  document.head.appendChild(styleEl);

  // Find nearest element with axiom data
  function findAxiomTarget(el) {
    while (el && el !== document.body) {
      if (el.dataset && (el.dataset.axiomFile || el.dataset.axiomComponent)) {
        return el;
      }
      el = el.parentElement;
    }
    return null;
  }

  document.addEventListener('mouseover', (e) => {
    if (!isInspectMode) return;
    
    const target = findAxiomTarget(e.target);
    
    if (highlightedElement && highlightedElement !== target) {
      highlightedElement.classList.remove('axiom-inspect-highlight');
    }
    
    if (target) {
      target.classList.add('axiom-inspect-highlight');
      highlightedElement = target;
    }
  }, true);

  document.addEventListener('mouseout', (e) => {
    if (!isInspectMode) return;
    if (highlightedElement) {
      highlightedElement.classList.remove('axiom-inspect-highlight');
      highlightedElement = null;
    }
  }, true);

  document.addEventListener('click', (e) => {
    if (!isInspectMode) return;
    
    const target = findAxiomTarget(e.target);
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      
      const payload = {
        file: target.dataset.axiomFile || null,
        component: target.dataset.axiomComponent || null,
        tagName: target.tagName.toLowerCase(),
        text: target.innerText?.substring(0, 50) || ''
      };
      
      console.log('[Axiom Webview] Element clicked:', payload);
      ipcRenderer.sendToHost('axiom-inspect-click', payload);
      
      // Optionally remove highlight after click
      if (highlightedElement) {
        highlightedElement.classList.remove('axiom-inspect-highlight');
        highlightedElement = null;
      }
    }
  }, true);
});

// Allow host to toggle inspect mode
ipcRenderer.on('toggle-inspect', (event, state) => {
  isInspectMode = state;
  if (!state && highlightedElement) {
    highlightedElement.classList.remove('axiom-inspect-highlight');
    highlightedElement = null;
  }
});
