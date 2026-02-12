let editor;
let publicKey = null;
let keypair;
let rpc;
let horizon;
let rpcUrl;
let horizonUrl;
let networkPassphrase;
let network = 'TESTNET';
let walletKitAddress = null;
const contractSpecCache = new Map();
const friendbotUrls = {
  TESTNET: 'https://friendbot.stellar.org',
  FUTURENET: 'https://friendbot-futurenet.stellar.org',
};
const LOCAL_NETWORK_CONFIG_KEY = 'local-network-config';
const SELECTED_NETWORK_KEY = 'selected-network';
const LEGACY_EXPLORE_NETWORK_KEY = 'last-explore-network';
const SUPPORTED_NETWORKS = new Set(['TESTNET', 'LOCAL', 'FUTURENET', 'PUBLIC']);
const DEFAULT_LOCAL_NETWORK_CONFIG = Object.freeze({
  rpcUrl: 'http://localhost:8000/rpc',
  horizonUrl: 'http://localhost:8000',
  networkPassphrase: 'Standalone Network ; February 2017',
});
let localNetworkConfig = loadLocalNetworkConfig();
let fundingMessageTimeout = null;
let fundingMessageInterval = null;
let fundingMessageId = 0;
const PANEL_MIN_HEIGHT = 200;
let defaultPanelSplitRatio = null;
let lastPanelSplitRatio = null;
let isPanelCollapsed = false;

// Initialize Stellar Wallet Kit
const { StellarWalletsKit, KitEventType, SwkAppDarkTheme, defaultModules } = window.MyWalletKit;
StellarWalletsKit.init({
  theme: SwkAppDarkTheme,
  modules: defaultModules(),
});

// Multi-file editor state
let files = {};
let currentFile = null; // Start with null so first switchToFile always works
let isLoadingFile = false;

// Function to load default file templates
async function loadDefaultFiles() {
  const defaultFiles = {};
  const templateFiles = ['Cargo.toml', 'lib.rs', 'test.rs'];
  try {
    for (const fileName of templateFiles) {
      const response = await fetch(`./templates/${fileName}`);
      if (response.ok) {
        defaultFiles[fileName] = await response.text();
      } else {
        console.error(`Failed to load template ${fileName}: ${response.status}`);
        // Fallback to empty file if template fails to load
        defaultFiles[fileName] = '';
      }
    }
  } catch (error) {
    console.error('Error loading templates:', error);
  }
  return defaultFiles;
}

// File management functions
async function loadFiles() {
  const storedFiles = localStorage.getItem('soroban-files');
  if (storedFiles) {
    files = JSON.parse(storedFiles);
  } else {
    const defaultFiles = await loadDefaultFiles();
    files = { ...defaultFiles };
    saveFiles();
  }
}

function saveFiles() {
  localStorage.setItem('soroban-files', JSON.stringify(files));
}

function saveCurrentFile() {
  if (currentFile && editor && !isLoadingFile) {
    files[currentFile] = editor.getValue();
    saveFiles();
  }
}

function getWalletToolbars() {
  return document.querySelectorAll('.wallet-toolbar');
}

function setWalletKeysHtml(html) {
  getWalletToolbars().forEach(toolbar => {
    const keysEl = toolbar.querySelector('.wallet-keys');
    if (keysEl) {
      keysEl.innerHTML = html;
      keysEl.style.display = html ? 'block' : 'none';
    }
  });
}

function clearWalletKeys() {
  setWalletKeysHtml('');
}

function updateWalletUi() {
  const connected = !!publicKey;
  const hasSecret = !!localStorage.getItem('secretKey');
  const isBrowserWallet = !!walletKitAddress && !keypair;
  getWalletToolbars().forEach(toolbar => {
    const icon = toolbar.querySelector('.wallet-icon');
    if (icon) {
      if (connected) {
        icon.classList.add('connected');
        icon.classList.remove('disconnected');
      } else {
        icon.classList.add('disconnected');
        icon.classList.remove('connected');
      }
    }
    const statusText = toolbar.querySelector('.wallet-status-text');
    const addressText = toolbar.querySelector('.wallet-status-address');
    if (statusText) {
      if (connected) {
        statusText.textContent = '';
        statusText.style.display = 'none';
      } else {
        statusText.textContent = 'Generate a new wallet or connect a browser wallet.';
        statusText.style.display = 'block';
      }
    }
    if (addressText) {
      addressText.textContent = connected ? publicKey : '';
      addressText.style.display = connected ? 'block' : 'none';
    }
    const exportBtn = toolbar.querySelector('.wallet-export-keys');
    if (exportBtn) {
      const disabled = !hasSecret || isBrowserWallet;
      exportBtn.disabled = disabled;
      exportBtn.title = isBrowserWallet
        ? 'Not available for browser wallets.'
        : (hasSecret ? '' : 'No secret key loaded.');
    }
    const fundBtn = toolbar.querySelector('.wallet-fund');
    if (fundBtn) {
      fundBtn.disabled = !connected;
      fundBtn.title = connected ? '' : 'Connect a wallet first.';
    }
    const disconnectBtn = toolbar.querySelector('.wallet-disconnect');
    if (disconnectBtn) {
      disconnectBtn.disabled = !connected;
      disconnectBtn.title = connected ? '' : 'No wallet connected.';
    }
  });
  const deployButton = document.getElementById('deploy-button');
  if (deployButton) {
    deployButton.disabled = !connected;
  }
  if (!hasSecret || isBrowserWallet) {
    clearWalletKeys();
  }
}

function closeWalletMenus() {
  document.querySelectorAll('.wallet-menu.open').forEach(menu => {
    menu.classList.remove('open');
    const toggle = menu.querySelector('.wallet-menu-toggle');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
  });
}

function setupWalletMenus() {
  document.querySelectorAll('.wallet-menu-toggle').forEach(toggle => {
    toggle.addEventListener('click', (event) => {
      event.stopPropagation();
      const menu = toggle.closest('.wallet-menu');
      const isOpen = menu.classList.toggle('open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });
  });
  document.addEventListener('click', (event) => {
    if (event.target.closest('.wallet-menu')) return;
    closeWalletMenus();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeWalletMenus();
  });
  document.querySelectorAll('.wallet-menu-item').forEach(item => {
    item.addEventListener('click', () => closeWalletMenus());
  });
}

function showFundingStatus(durationMs = 20000) {
  fundingMessageId += 1;
  const currentId = fundingMessageId;
  if (fundingMessageTimeout) clearTimeout(fundingMessageTimeout);
  if (fundingMessageInterval) clearInterval(fundingMessageInterval);
  const baseText = 'Wallet generated. Funding wallet, requesting testnet, futurenet & local XLM';
  let dotCount = 0;
  const update = () => {
    if (currentId !== fundingMessageId) return;
    const dots = '.'.repeat(dotCount);
    dotCount = (dotCount + 1) % 4;
    document.querySelectorAll('.wallet-funding-status').forEach(el => {
      el.textContent = `${baseText}${dots}`;
    });
  };
  update();
  fundingMessageInterval = setInterval(update, 700);
  fundingMessageTimeout = setTimeout(() => {
    if (currentId !== fundingMessageId) return;
    if (fundingMessageInterval) clearInterval(fundingMessageInterval);
    fundingMessageInterval = null;
    document.querySelectorAll('.wallet-funding-status').forEach(el => {
      el.textContent = '';
    });
  }, durationMs);
}

function switchToFile(fileName) {
  if (currentFile === fileName) return;

  // Save current file content
  saveCurrentFile();

  // Switch to new file
  currentFile = fileName;
  const fileContent = files[fileName] || '';

  // Set flag to prevent saving during load
  isLoadingFile = true;
  editor.setValue(fileContent);
  isLoadingFile = false;

  // Update language mode based on file extension
  const language = getLanguageFromFileName(fileName);
  monaco.editor.setModelLanguage(editor.getModel(), language);

  // Update tab UI
  updateActiveTab();

  // Check if menu should be hidden due to overflow
  setTimeout(() => checkMenuOverflow(), 10);
}

function getLanguageFromFileName(fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  switch (ext) {
    case 'rs': return 'rust';
    case 'toml': return 'toml';
    case 'js': return 'javascript';
    case 'ts': return 'typescript';
    case 'json': return 'json';
    case 'md': return 'markdown';
    case 'yml':
    case 'yaml': return 'yaml';
    default: return 'plaintext';
  }
}

function updateActiveTab() {
  document.querySelectorAll('.editor-tab').forEach(tab => {
    tab.classList.remove('active');
    if (tab.dataset.file === currentFile) {
      tab.classList.add('active');
    }
  });
}

function checkMenuOverflow() {
  const container = document.getElementById('editor-tabs-container');
  const tabs = document.getElementById('editor-tabs');
  const menu = document.getElementById('header-menu');

  if (!container || !tabs || !menu) return;

  // Get container width
  const containerWidth = container.offsetWidth;

  // Calculate actual content width of tabs by summing individual tab widths
  const tabElements = tabs.querySelectorAll('.editor-tab, .add-tab-button');
  let tabsContentWidth = 0;
  tabElements.forEach(tab => {
    tabsContentWidth += tab.offsetWidth;
  });

  // Measure menu width while hidden by temporarily making it visible but off-screen
  menu.style.position = 'absolute';
  menu.style.visibility = 'hidden';
  menu.classList.remove('hidden');
  const menuWidth = menu.offsetWidth;

  // Clean up menu styles
  menu.style.position = '';
  menu.style.visibility = '';
  menu.classList.add('hidden');

  const padding = 16; // Account for padding and margins

  // Now decide whether to show or hide based on accurate measurements
  if (tabsContentWidth + menuWidth + padding <= containerWidth) {
    menu.classList.remove('hidden');
  }
  // If there's not enough space, menu stays hidden
}

function getPanelLayoutElements() {
  const mainContent = document.getElementById('main-content');
  const topPanel = document.getElementById('editor-container');
  const bottomPanel = document.getElementById('panel-container');
  const resizer = document.getElementById('resizer');
  if (!mainContent || !topPanel || !bottomPanel || !resizer) return null;
  return { mainContent, topPanel, bottomPanel, resizer };
}

function captureDefaultSplitIfNeeded(layout) {
  if (defaultPanelSplitRatio !== null) return;
  const usableHeight = layout.mainContent.clientHeight - layout.resizer.offsetHeight;
  if (usableHeight <= 0) return;
  const topHeight = layout.topPanel.getBoundingClientRect().height;
  defaultPanelSplitRatio = topHeight / usableHeight;
}

function applyPanelSplit(topRatio, options = {}) {
  const layout = getPanelLayoutElements();
  if (!layout) return;
  const { captureDefault = true } = options;
  if (captureDefault) captureDefaultSplitIfNeeded(layout);
  const totalHeight = layout.mainContent.clientHeight;
  const resizerHeight = layout.resizer.offsetHeight;
  const usableHeight = totalHeight - resizerHeight;
  if (usableHeight <= 0) return;

  let newTopHeight = Math.round(usableHeight * topRatio);
  let newBottomHeight = usableHeight - newTopHeight;
  const minHeight = usableHeight >= PANEL_MIN_HEIGHT * 2 ? PANEL_MIN_HEIGHT : 0;

  if (newTopHeight < minHeight) newTopHeight = minHeight;
  if (newBottomHeight < minHeight) newBottomHeight = minHeight;

  if (newTopHeight + newBottomHeight > usableHeight) {
    const overflow = newTopHeight + newBottomHeight - usableHeight;
    if (newBottomHeight >= newTopHeight) {
      newBottomHeight = Math.max(minHeight, newBottomHeight - overflow);
    } else {
      newTopHeight = Math.max(minHeight, newTopHeight - overflow);
    }
  }

  layout.topPanel.style.height = `${newTopHeight}px`;
  layout.bottomPanel.style.height = `${newBottomHeight}px`;
  if (usableHeight > 0) {
    lastPanelSplitRatio = newTopHeight / usableHeight;
  }
  if (editor) {
    editor.layout();
  }
}

function resetPanelSplit() {
  const layout = getPanelLayoutElements();
  if (!layout) return;
  layout.topPanel.style.height = '';
  layout.bottomPanel.style.height = '';
  defaultPanelSplitRatio = null;
  lastPanelSplitRatio = null;
  requestAnimationFrame(() => {
    if (editor) {
      editor.layout();
    }
  });
}

function getCurrentSplitRatio(layout) {
  const usableHeight = layout.mainContent.clientHeight - layout.resizer.offsetHeight;
  if (usableHeight <= 0) return null;
  const topHeight = layout.topPanel.getBoundingClientRect().height;
  if (!topHeight) return null;
  return topHeight / usableHeight;
}

function clearPanelHeights(layout) {
  layout.topPanel.style.height = '';
  layout.bottomPanel.style.height = '';
}

function setPanelCollapsed(collapsed, options = {}) {
  const layout = getPanelLayoutElements();
  if (!layout) return;
  if (collapsed === isPanelCollapsed) return;
  const { restoreRatio = true } = options;

  if (collapsed) {
    const ratio = getCurrentSplitRatio(layout);
    if (ratio) lastPanelSplitRatio = ratio;
    clearPanelHeights(layout);
    layout.mainContent.classList.add('panel-collapsed');
    isPanelCollapsed = true;
    if (editor) {
      editor.layout();
    }
    return;
  }

  layout.mainContent.classList.remove('panel-collapsed');
  isPanelCollapsed = false;
  requestAnimationFrame(() => {
    captureDefaultSplitIfNeeded(layout);
    if (!restoreRatio) {
      if (editor) editor.layout();
      return;
    }
    const ratio = lastPanelSplitRatio ?? defaultPanelSplitRatio ?? 0.62;
    applyPanelSplit(ratio, { captureDefault: false });
  });
}

function createNewFile(fileName) {
  if (files.hasOwnProperty(fileName)) {
    alert('File already exists!');
    return;
  }

  files[fileName] = '';
  saveFiles();
  addTab(fileName);
  switchToFile(fileName);
}

function addTab(fileName) {
  const tabsContainer = document.getElementById('editor-tabs');
  const addButton = document.getElementById('add-tab');

  const tab = document.createElement('div');
  tab.className = 'editor-tab';
  tab.dataset.file = fileName;

  const tabName = document.createElement('span');
  tabName.className = 'tab-name';
  tabName.textContent = fileName;

  tab.appendChild(tabName);

  // Only add close button if it's not Cargo.toml
  if (fileName !== 'Cargo.toml') {
    const tabClose = document.createElement('span');
    tabClose.className = 'tab-close';
    tabClose.innerHTML = '×';
    tabClose.title = 'Close tab';

    tab.appendChild(tabClose);

    tabClose.addEventListener('click', (e) => {
      e.stopPropagation();
      closeFile(fileName);
    });

    // Tab click listener needs to check for close button
    tab.addEventListener('click', (e) => {
      if (e.target !== tabClose) {
        switchToFile(fileName);
      }
    });
  } else {
    // For Cargo.toml, just switch to file on click
    tab.addEventListener('click', () => {
      switchToFile(fileName);
    });
  }

  // Insert before the add button
  tabsContainer.insertBefore(tab, addButton);

  // Check overflow after adding tab
  setTimeout(() => checkMenuOverflow(), 10);
}

function closeFile(fileName) {
  // Prevent closing Cargo.toml
  if (fileName === 'Cargo.toml') {
    alert('Cannot close Cargo.toml - it is required for the project!');
    return;
  }

  if (Object.keys(files).length <= 1) {
    alert('Cannot close the last file!');
    return;
  }

  if (confirm(`Are you sure you want to delete: ${fileName}?`)) {
    // If we're deleting the current file, clear currentFile to prevent saveCurrentFile from restoring it
    if (currentFile === fileName) {
      currentFile = null;
    }

    delete files[fileName];
    saveFiles();

    // Remove tab
    const tab = document.querySelector(`[data-file="${fileName}"]`);
    if (tab) tab.remove();

    // Check overflow after removing tab
    setTimeout(() => checkMenuOverflow(), 10);

    // If we deleted the current file, switch to another
    if (currentFile === null) {
      const remainingFiles = Object.keys(files);
      if (remainingFiles.length > 0) {
        switchToFile(remainingFiles[0]);
      }
    }
  }
}

function initializeTabs() {
  // Clear existing tabs except add button
  const tabsContainer = document.getElementById('editor-tabs');
  const tabs = tabsContainer.querySelectorAll('.editor-tab');
  tabs.forEach(tab => tab.remove());

  // Add tabs for all files
  Object.keys(files).forEach(fileName => {
    addTab(fileName);
  });

  // Set up add button
  document.getElementById('add-tab').addEventListener('click', () => {
    const fileName = prompt('Enter file name (e.g., lib.rs, mod.rs, test.rs):');
    if (fileName && fileName.trim()) {
      createNewFile(fileName.trim());
    }
  });

  // Switch to current file
  if (files['lib.rs']) {
    switchToFile('lib.rs');
  } else if (files[currentFile]) {
    switchToFile(currentFile);
  } else {
    const firstFile = Object.keys(files)[0];
    if (firstFile) {
      switchToFile(firstFile);
    }
  }

  // Initial overflow check
  setTimeout(() => checkMenuOverflow(), 100);
}

require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
require(['vs/editor/editor.main'], async function () {
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: ``,
    language: 'rust',
    theme: 'vs-dark',
    automaticLayout: true,
    fontSize: 14,
    minimap: {
      enabled: true
    },
    autoIndent: 'full',
    contextmenu: true,
    fontFamily: 'monospace',
  });

  // Initialize file management
  await loadFiles();

  // Add content change listener to save current file
  editor.onDidChangeModelContent(() => {
    saveCurrentFile();
  });

  // Initialize tabs and then call init() to handle URL parameters
  initializeTabs();
  init();

  // Add window resize listener for menu overflow
  window.addEventListener('resize', () => {
    checkMenuOverflow();
  });
});

function extractContractName(code) {
  try {
    const codeWithoutComments = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); // Remove comments
    const regex = /#\[\s*contract\s*\]\s*pub\s+struct\s+([A-Za-z0-9_]+)\s*;/m;
    const match = codeWithoutComments.match(regex); 
    if (match && match[1]) return match[1];
  } catch (e) {
    console.error(e);
  }
  return "project";
}

const WASM_BASE64_START = '<<<SOROBAN_WASM_BASE64_START>>>';
const WASM_BASE64_END = '<<<SOROBAN_WASM_BASE64_END>>>';

function appendConsoleText(consoleEl, text) {
  if (!text) return;
  consoleEl.style.display = 'block';
  consoleEl.innerText += text;
  consoleEl.scrollTop = consoleEl.scrollHeight;
}

function scrollButtonToPanelTop(buttonEl) {
  const panelContainer = document.getElementById('panel-container');
  if (!panelContainer || !buttonEl) return;
  const containerRect = panelContainer.getBoundingClientRect();
  const buttonRect = buttonEl.getBoundingClientRect();
  const delta = buttonRect.top - containerRect.top;
  panelContainer.scrollTo({
    top: panelContainer.scrollTop + delta,
    behavior: 'smooth'
  });
}

function elapsedSeconds(startMs) {
  return Math.max(0, Math.round((performance.now() - startMs) / 1000));
}

async function compileCode() {
  const compileButton = document.getElementById('compile-code');
  compileButton.disabled = true;
  scrollButtonToPanelTop(compileButton);
  const startTime = performance.now();

  // Save current file content and get all files
  saveCurrentFile();
  const allFiles = { ...files };

  const statusEl = document.getElementById('build-status');
  const consoleEl = document.getElementById('build-console');
  consoleEl.innerText = '';
  consoleEl.style.display = 'block';
  statusEl.innerText = 'Compiling... (Estimated build time 30s)';
  const interval = setInterval(() => {
    const msg = funnyMessages[Math.floor(Math.random() * funnyMessages.length)];
    statusEl.innerText = 'Compiling... ' + msg;
  }, 3000);
  try {
    const response = await fetch('/compile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: allFiles }),
    });
    if (!response.ok) {
      const resultText = await response.text();
      appendConsoleText(consoleEl, resultText);
      statusEl.innerText = `Compilation failed: ${elapsedSeconds(startTime)}s`;
      return;
    }

    if (!response.body) {
      const resultText = await response.text();
      appendConsoleText(consoleEl, resultText);
      statusEl.innerText = `Compilation failed: ${elapsedSeconds(startTime)}s`;
      return;
    }

    const contractName = extractContractName(allFiles['lib.rs'] || '');
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let pending = '';
    let wasmBase64 = '';
    let inWasm = false;

    const startHold = Math.max(WASM_BASE64_START.length - 1, 0);
    const endHold = Math.max(WASM_BASE64_END.length - 1, 0);

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });

      while (true) {
        if (!inWasm) {
          const idx = pending.indexOf(WASM_BASE64_START);
          if (idx === -1) {
            if (pending.length > startHold) {
              appendConsoleText(consoleEl, pending.slice(0, -startHold));
              pending = pending.slice(-startHold);
            }
            break;
          }
          appendConsoleText(consoleEl, pending.slice(0, idx));
          pending = pending.slice(idx + WASM_BASE64_START.length);
          inWasm = true;
        } else {
          const idx = pending.indexOf(WASM_BASE64_END);
          if (idx === -1) {
            if (pending.length > endHold) {
              wasmBase64 += pending.slice(0, -endHold);
              pending = pending.slice(-endHold);
            }
            break;
          }
          wasmBase64 += pending.slice(0, idx);
          pending = pending.slice(idx + WASM_BASE64_END.length);
          inWasm = false;
        }
      }
    }

    pending += decoder.decode();
    if (pending) {
      if (inWasm) {
        wasmBase64 += pending;
      } else {
        appendConsoleText(consoleEl, pending);
      }
    }

    if (wasmBase64.trim()) {
      const cleaned = wasmBase64.replace(/\s+/g, '');
      const binary = atob(cleaned);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      const blob = new Blob([bytes], { type: 'application/wasm' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contractName}.wasm`;
      a.click();
      statusEl.innerText = `Compilation successful: ${elapsedSeconds(startTime)}s`;
    } else {
      statusEl.innerText = `Compilation failed: ${elapsedSeconds(startTime)}s`;
    }
  } catch (err) {
    console.error(err);
    statusEl.innerText = `Compilation failed: ${elapsedSeconds(startTime)}s`;
  } finally {
    clearInterval(interval);
    compileButton.disabled = false;
  }
}

async function runTests() {
  const testButton = document.getElementById('run-tests');
  testButton.disabled = true;
  scrollButtonToPanelTop(testButton);

  // Save current file content and get all files
  saveCurrentFile();
  const allFiles = { ...files };

  const statusEl = document.getElementById('test-status');
  const consoleEl = document.getElementById('test-console');
  consoleEl.innerText = '';
  consoleEl.style.display = 'block';
  statusEl.innerText = 'Running tests... (This may take a minute or two)';
  const interval = setInterval(() => {
    const msgIndex = Math.floor(Math.random() * funnyMessages.length);
    document.getElementById('test-status').innerText = 'Running tests... '+funnyMessages[msgIndex];
  }, 3000);
  try {
    const response = await fetch('/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: allFiles })
    });
    if (!response.ok) {
      const resultText = await response.text();
      appendConsoleText(consoleEl, resultText);
      statusEl.innerText = 'Errors in tests';
      return;
    }

    if (!response.body) {
      const resultText = await response.text();
      appendConsoleText(consoleEl, resultText);
      statusEl.innerText = 'Errors in tests';
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let hasErrors = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.includes('Test Errors:')) hasErrors = true;
      appendConsoleText(consoleEl, chunk);
    }
    const tail = decoder.decode();
    if (tail) {
      if (tail.includes('Test Errors:')) hasErrors = true;
      appendConsoleText(consoleEl, tail);
    }

    statusEl.innerText = hasErrors ? 'Errors in tests' : 'Tests completed';
  } catch (err) {
    statusEl.innerText = `Network error: ${err.message}`;
    console.error(err);
  }
  testButton.disabled = false;
  clearInterval(interval);
}

function renderContractForm(contractId, interfaceString, divId = 'explore-form') {
  const container = document.getElementById(divId);
  container.innerHTML = '';
  const methodRegex = /fn\s+(\w+)\s*\(\s*env:[^)]*?\)\s*(->\s*[^;{]+)?;?/g;
  const argsRegex = /(\w+)\s*:\s*([^,\)]+)/g;
  let match;
  while ((match = methodRegex.exec(interfaceString)) !== null) {
    const methodName = match[1];
    const signature = match[0];
    const args = [];
    const argsPart = signature.substring(signature.indexOf('(') + 1, signature.lastIndexOf(')'));
    let argMatch;
    while ((argMatch = argsRegex.exec(argsPart)) !== null) {
      const [_, argName, rawType] = argMatch;
      const type = rawType.trim().replace(/soroban_sdk::/g, '');
      if (argName.trim() !== 'env') {
        args.push({ name: argName.trim(), type });
      }
    }
    const wrapper = document.createElement('div');
    wrapper.classList.add('method-box');
    const isMultiArg = args.length > 1;
    if (args.length <= 1) {
      wrapper.classList.add('method-compact');
    }
    if (args.length === 0) {
      wrapper.classList.add('method-no-args');
    }
    if (isMultiArg) {
      wrapper.classList.add('method-multi');
    }
    const left = document.createElement('div');
    left.classList.add('method-left');
    const title = document.createElement('h3');
    title.textContent = methodName;
    const button = document.createElement('button');
    button.classList.add('method-call-button');
    button.innerHTML = '<i class="fas fa-paper-plane"></i>';
    button.setAttribute('aria-label', `Call ${methodName}`);
    button.setAttribute('title', `Call ${methodName}`);
    if (!isMultiArg) {
      left.appendChild(title);
    }
    args.forEach((arg, index) => {
      const row = document.createElement('div');
      row.classList.add('arg-row');
      const label = document.createElement('label');
      label.textContent = `${arg.name}:${arg.type}`;
      label.classList.add('arg-label');
      label.htmlFor = `${methodName}-${arg.name}`;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `${methodName}-${arg.name}`;
      input.placeholder = `${arg.name}:${arg.type}`;
      input.setAttribute('aria-label', `${arg.name}: ${arg.type}`);
      if (isMultiArg) {
        row.classList.add('arg-row-multi');
        const titleCell = document.createElement('div');
        titleCell.classList.add('method-title-cell');
        if (index === 0) {
          titleCell.appendChild(title);
        } else {
          const spacer = document.createElement('span');
          spacer.classList.add('method-title-spacer');
          titleCell.appendChild(spacer);
        }
        const fieldCell = document.createElement('div');
        fieldCell.classList.add('method-field-cell');
        fieldCell.append(input, label);
        if (index === args.length - 1) {
          fieldCell.appendChild(button);
        }
        row.append(titleCell, fieldCell);
      } else {
        if (args.length <= 1) {
          row.classList.add('arg-row-inline');
        }
        row.append(input, label);
      }
      left.appendChild(row);
    });
    if (!isMultiArg) {
      left.appendChild(button);
    }
    const right = document.createElement('div');
    right.classList.add('method-right');
    const consoleDiv = document.createElement('div');
    consoleDiv.classList.add('console');
    right.appendChild(consoleDiv);
    button.addEventListener('click', async () => {
      try {
        const contract = new StellarSdk.Contract(contractId);
        const convertedArgs = [];
        args.forEach(arg => {
          const value = document.getElementById(`${methodName}-${arg.name}`).value.trim();
          convertedArgs.push(toScVal(value, arg.type.toLowerCase()));
        });
        const sourceAccount = await loadSourceAccount(publicKey);
        const op = contract.call(methodName, ...convertedArgs);
        const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase,
        })
          .addOperation(op)
          .setTimeout(30)
          .build();
        const simulationResult = await rpc.simulateTransaction(tx);
        if (simulationResult.error) {
          throw new Error(simulationResult.error);
        }
        if (isReadOnlySimulation(simulationResult)) {
          const decoded = StellarSdk.scValToNative(simulationResult.result?.retval);
          const safeDecoded = JSON.parse(JSON.stringify(decoded, (key, value) =>
            typeof value === "bigint" ? value.toString() : value
          ));
          const output = typeof safeDecoded === 'string'
            ? safeDecoded
            : JSON.stringify(safeDecoded, null, 2);
          const pre = document.createElement('pre');
          pre.textContent = output;
          consoleDiv.innerHTML = '';
          consoleDiv.appendChild(pre);
        } else {
          const preparedTx = StellarSdk.rpc.assembleTransaction(tx, simulationResult).build();
          const signedTx = await signTransaction(preparedTx);
          if (!signedTx) {
            throw new Error('Transaction was not signed.');
          }
          const response = await rpc.sendTransaction(signedTx);
          const hash = response.hash;
          if (response.status === 'ERROR') {
            console.error('Transaction rejected', response);
            renderMethodConsoleError(consoleDiv, 'Transaction rejected by RPC. Check console for details.');
            return;
          }
          await pollTransactionResult(hash, methodName, consoleDiv, null);
        }
      } catch (err) {
        renderMethodConsoleError(consoleDiv, err?.message || err);
        console.error(err);
      }
    });
    wrapper.appendChild(left);
    wrapper.appendChild(right);
    container.appendChild(wrapper);
  }
}

function specTypeName(typeDef) {
  if (!typeDef || !typeDef.switch) return 'unknown';
  return typeDef.switch().name || 'unknown';
}

function isComplexSpecType(typeDef) {
  const name = specTypeName(typeDef);
  return [
    'scSpecTypeVal',
    'scSpecTypeOption',
    'scSpecTypeResult',
    'scSpecTypeVec',
    'scSpecTypeMap',
    'scSpecTypeTuple',
    'scSpecTypeBytes',
    'scSpecTypeBytesN',
    'scSpecTypeUdt',
    'scSpecTypeError',
  ].includes(name);
}

function specTypeToString(typeDef, spec, depth = 0) {
  if (!typeDef) return 'unknown';
  const name = specTypeName(typeDef);
  if (depth > 4) return '...';
  switch (name) {
    case 'scSpecTypeBool':
      return 'bool';
    case 'scSpecTypeVoid':
      return 'void';
    case 'scSpecTypeU32':
    case 'scSpecTypeI32':
    case 'scSpecTypeU64':
    case 'scSpecTypeI64':
    case 'scSpecTypeU128':
    case 'scSpecTypeI128':
    case 'scSpecTypeU256':
    case 'scSpecTypeI256':
      return name.replace('scSpecType', '').toLowerCase();
    case 'scSpecTypeString':
      return 'string';
    case 'scSpecTypeSymbol':
      return 'symbol';
    case 'scSpecTypeAddress':
      return 'address';
    case 'scSpecTypeMuxedAddress':
      return 'muxed_address';
    case 'scSpecTypeBytes':
      return 'bytes';
    case 'scSpecTypeBytesN':
      return `bytesN<${typeDef.bytesN().n()}>`;
    case 'scSpecTypeTimepoint':
      return 'timepoint';
    case 'scSpecTypeDuration':
      return 'duration';
    case 'scSpecTypeVal':
      return 'val';
    case 'scSpecTypeError':
      return 'error';
    case 'scSpecTypeOption':
      return `Option<${specTypeToString(typeDef.option().valueType(), spec, depth + 1)}>`;
    case 'scSpecTypeResult': {
      const result = typeDef.result();
      return `Result<${specTypeToString(result.okType(), spec, depth + 1)}, ${specTypeToString(result.errorType(), spec, depth + 1)}>`;
    }
    case 'scSpecTypeVec':
      return `Vec<${specTypeToString(typeDef.vec().elementType(), spec, depth + 1)}>`;
    case 'scSpecTypeMap':
      return `Map<${specTypeToString(typeDef.map().keyType(), spec, depth + 1)}, ${specTypeToString(typeDef.map().valueType(), spec, depth + 1)}>`;
    case 'scSpecTypeTuple': {
      const types = typeDef.tuple().valueTypes();
      return `(${types.map(t => specTypeToString(t, spec, depth + 1)).join(', ')})`;
    }
    case 'scSpecTypeUdt':
      return typeDef.udt().name().toString();
    default:
      return name.replace('scSpecType', '').toLowerCase();
  }
}

function specTypeHint(typeDef, spec, depth = 0) {
  if (!typeDef) return '';
  if (depth > 3) return '...';
  const name = specTypeName(typeDef);
  switch (name) {
    case 'scSpecTypeBool':
      return 'true';
    case 'scSpecTypeU32':
    case 'scSpecTypeI32':
      return '1';
    case 'scSpecTypeU64':
    case 'scSpecTypeI64':
    case 'scSpecTypeU128':
    case 'scSpecTypeI128':
    case 'scSpecTypeU256':
    case 'scSpecTypeI256':
      return '"123"';
    case 'scSpecTypeString':
      return '"hello"';
    case 'scSpecTypeSymbol':
      return '"symbol"';
    case 'scSpecTypeAddress':
      return '"G..."';
    case 'scSpecTypeMuxedAddress':
      return '"M..."';
    case 'scSpecTypeBytes':
      return '"ABC..123"';
    case 'scSpecTypeBytesN':
      return `"${'00'.repeat(typeDef.bytesN().n())}"`;
    case 'scSpecTypeTimepoint':
      return '"1700000000"';
    case 'scSpecTypeDuration':
      return '"3600"';
    case 'scSpecTypeVal':
      return '{"type":"string","value":"hello"} or xdr:...';
    case 'scSpecTypeError':
      return '{"type":"contract","code":1}';
    case 'scSpecTypeOption':
      return 'null';
    case 'scSpecTypeResult':
      return '{"ok": 1}';
    case 'scSpecTypeVec':
      return `[${specTypeHint(typeDef.vec().elementType(), spec, depth + 1)}]`;
    case 'scSpecTypeTuple':
      return `[${typeDef.tuple().valueTypes().map(t => specTypeHint(t, spec, depth + 1)).join(', ')}]`;
    case 'scSpecTypeMap':
      {
        const keyType = typeDef.map().keyType();
        const valueType = typeDef.map().valueType();
        const keyName = specTypeName(keyType);
        const valueHint = specTypeHint(valueType, spec, depth + 1);
        if ([
          'scSpecTypeString',
          'scSpecTypeSymbol',
          'scSpecTypeU32',
          'scSpecTypeI32',
          'scSpecTypeU64',
          'scSpecTypeI64',
          'scSpecTypeU128',
          'scSpecTypeI128',
          'scSpecTypeU256',
          'scSpecTypeI256',
          'scSpecTypeBool',
        ].includes(keyName)) {
          return `{ "key": ${valueHint} }`;
        }
        const keyHint = specTypeHint(keyType, spec, depth + 1);
        return `[[${keyHint}, ${valueHint}]]`;
      }
    case 'scSpecTypeUdt': {
      if (!spec || !spec.findEntry) return '{...}';
      const entry = spec.findEntry(typeDef.udt().name().toString());
      if (!entry) return '{...}';
      const kind = entry.switch().name;
      if (kind === 'scSpecEntryUdtStructV0') {
        const fields = entry.udtStructV0().fields();
        const sample = fields.map(field => {
          const fname = field.name().toString();
          const ftype = specTypeHint(field.type(), spec, depth + 1);
          return `"${fname}": ${ftype}`;
        });
        return `{ ${sample.join(', ')} }`;
      }
      if (kind === 'scSpecEntryUdtEnumV0') {
        const cases = entry.udtEnumV0().cases();
        const name = cases.length ? cases[0].name().toString() : 'Variant';
        return `"${name}"`;
      }
      if (kind === 'scSpecEntryUdtUnionV0') {
        const cases = entry.udtUnionV0().cases();
        const name = cases.length ? cases[0].value().name().toString() : 'Variant';
        return `{ "tag": "${name}", "values": [] }`;
      }
      return '{...}';
    }
    default:
      return '';
  }
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function hexToBytes(hex) {
  const clean = hex.replace(/^0x/i, '').trim();
  if (clean.length % 2 !== 0) {
    throw new Error('Hex string must have an even length.');
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    bytes[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return bytes;
}

function parseJsonValue(raw) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Expected JSON input. ${err.message}`);
  }
}

function parseIntegerLike(value, label) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${label} must be a finite number.`);
    }
    return value;
  }
  const str = String(value).trim();
  if (!/^-?\\d+$/.test(str)) {
    throw new Error(`${label} must be an integer.`);
  }
  return BigInt(str);
}

function parseStringValue(raw) {
  const trimmed = raw.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      return JSON.parse(trimmed.replace(/'/g, '"'));
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseBytesValue(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('base64:')) {
    return base64ToBytes(trimmed.slice(7));
  }
  if (trimmed.startsWith('0x') || /^[0-9a-fA-F]+$/.test(trimmed)) {
    return hexToBytes(trimmed);
  }
  if (trimmed.startsWith('[')) {
    const arr = parseJsonValue(trimmed);
    if (!Array.isArray(arr)) {
      throw new Error('Bytes JSON must be an array of numbers.');
    }
    return Uint8Array.from(arr);
  }
  return new TextEncoder().encode(trimmed);
}

function normalizeUnionInput(value) {
  if (typeof value === 'string') {
    return { tag: value };
  }
  if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
    return { tag: value[0], values: value.slice(1) };
  }
  if (value && typeof value === 'object') {
    if (value.tag) {
      return value;
    }
    const keys = Object.keys(value);
    if (keys.length === 1) {
      const tag = keys[0];
      const inner = value[tag];
      return {
        tag,
        values: Array.isArray(inner) ? inner : (typeof inner === 'undefined' ? [] : [inner]),
      };
    }
  }
  throw new Error('Union input must be a tag string or JSON object with a tag/values.');
}

function buildResultScVal(value, resultTypeDef, spec) {
  const resultDef = resultTypeDef.result();
  const okType = resultDef.okType();
  const errType = resultDef.errorType();
  let tag;
  let inner;
  if (Array.isArray(value) && value.length >= 2 && typeof value[0] === 'string') {
    tag = value[0].toLowerCase();
    inner = value[1];
  } else if (value && typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'ok')) {
      tag = 'ok';
      inner = value.ok;
    } else if (Object.prototype.hasOwnProperty.call(value, 'err')) {
      tag = 'err';
      inner = value.err;
    } else if (value.tag) {
      tag = value.tag.toLowerCase();
      inner = value.value;
    }
  } else if (typeof value === 'string') {
    tag = value.toLowerCase();
  }
  if (tag !== 'ok' && tag !== 'err') {
    throw new Error('Result input must be JSON like {"ok": ...} or {"err": ...}.');
  }
  const symbol = StellarSdk.xdr.ScVal.scvSymbol(tag);
  if (typeof inner === 'undefined') {
    throw new Error(`Result ${tag} requires a value.`);
  }
  const normalized = normalizeSpecValue(inner, tag === 'ok' ? okType : errType, spec);
  const innerVal = spec.nativeToScVal(normalized, tag === 'ok' ? okType : errType);
  return StellarSdk.xdr.ScVal.scvVec([symbol, innerVal]);
}

function buildErrorScVal(value) {
  if (!value || typeof value !== 'object') {
    throw new Error('Error input must be a JSON object.');
  }
  const type = (value.type || 'contract').toString().toLowerCase();
  const code = value.code;
  if (type === 'contract') {
    const num = Number(code);
    if (!Number.isFinite(num)) {
      throw new Error('Contract error code must be a number.');
    }
    return StellarSdk.xdr.ScVal.scvError(StellarSdk.xdr.ScError.sceContract(num));
  }
  const toScErrorCode = (val) => {
    if (typeof val === 'number') {
      return StellarSdk.xdr.ScErrorCode._byValue[val];
    }
    if (typeof val === 'string') {
      if (/^\\d+$/.test(val)) {
        return StellarSdk.xdr.ScErrorCode._byValue[Number(val)];
      }
      const fn = StellarSdk.xdr.ScErrorCode[val];
      if (typeof fn === 'function') {
        return fn();
      }
    }
    return null;
  };
  const scCode = toScErrorCode(code);
  if (!scCode) {
    throw new Error('Invalid ScErrorCode. Use a numeric code or enum name like \"scecInvalidInput\".');
  }
  const typeMap = {
    wasmvm: 'sceWasmVm',
    context: 'sceContext',
    storage: 'sceStorage',
    object: 'sceObject',
    crypto: 'sceCrypto',
    events: 'sceEvents',
    budget: 'sceBudget',
    value: 'sceValue',
    auth: 'sceAuth',
  };
  const method = typeMap[type];
  if (!method || typeof StellarSdk.xdr.ScError[method] !== 'function') {
    throw new Error(`Unsupported error type: ${type}`);
  }
  return StellarSdk.xdr.ScVal.scvError(StellarSdk.xdr.ScError[method](scCode));
}

function normalizeSpecValue(value, typeDef, spec, depth = 0) {
  if (depth > 6) return value;
  if (value instanceof StellarSdk.xdr.ScVal) return value;
  if (typeof value === 'string' && value.trim().toLowerCase().startsWith('xdr:')) {
    return StellarSdk.xdr.ScVal.fromXDR(value.trim().slice(4), 'base64');
  }
  const name = specTypeName(typeDef);
  switch (name) {
    case 'scSpecTypeOption':
      if (value === null || typeof value === 'undefined') return undefined;
      return normalizeSpecValue(value, typeDef.option().valueType(), spec, depth + 1);
    case 'scSpecTypeBool':
      if (typeof value === 'string') {
        const lower = value.toLowerCase();
        if (lower === 'true') return true;
        if (lower === 'false') return false;
      }
      return value;
    case 'scSpecTypeU32':
    case 'scSpecTypeI32':
      if (typeof value === 'string' && /^-?\\d+$/.test(value)) {
        return Number(value);
      }
      return value;
    case 'scSpecTypeBytes':
    case 'scSpecTypeBytesN': {
      if (value instanceof Uint8Array) return value;
      if (Array.isArray(value)) return Uint8Array.from(value);
      if (typeof value === 'string') return parseBytesValue(value);
      return value;
    }
    case 'scSpecTypeTimepoint': {
      return StellarSdk.xdr.ScVal.scvTimepoint(parseIntegerLike(value, 'Timepoint'));
    }
    case 'scSpecTypeDuration': {
      return StellarSdk.xdr.ScVal.scvDuration(parseIntegerLike(value, 'Duration'));
    }
    case 'scSpecTypeMuxedAddress': {
      if (typeof value !== 'string') return value;
      const muxed = StellarSdk.decodeAddressToMuxedAccount(value);
      return StellarSdk.xdr.ScVal.scvAddress(
        StellarSdk.xdr.ScAddress.scAddressTypeMuxedAccount(muxed)
      );
    }
    case 'scSpecTypeVal': {
      if (value && typeof value === 'object' && value.type) {
        const type = String(value.type).toLowerCase();
        if (type === 'timepoint') {
          return StellarSdk.xdr.ScVal.scvTimepoint(parseIntegerLike(value.value, 'Timepoint'));
        }
        if (type === 'duration') {
          return StellarSdk.xdr.ScVal.scvDuration(parseIntegerLike(value.value, 'Duration'));
        }
        if (type === 'bytes') {
          const bytes = value.value instanceof Uint8Array
            ? value.value
            : Array.isArray(value.value)
              ? Uint8Array.from(value.value)
              : parseBytesValue(String(value.value));
          return StellarSdk.nativeToScVal(bytes, { type: 'bytes' });
        }
        return StellarSdk.nativeToScVal(value.value, { type: value.type });
      }
      return StellarSdk.nativeToScVal(value);
    }
    case 'scSpecTypeError':
      return buildErrorScVal(value);
    case 'scSpecTypeVec': {
      if (!Array.isArray(value)) {
        throw new Error('Vec input must be a JSON array.');
      }
      const elementType = typeDef.vec().elementType();
      return value.map(item => normalizeSpecValue(item, elementType, spec, depth + 1));
    }
    case 'scSpecTypeTuple': {
      if (!Array.isArray(value)) {
        throw new Error('Tuple input must be a JSON array.');
      }
      const types = typeDef.tuple().valueTypes();
      if (value.length !== types.length) {
        throw new Error(`Tuple expects ${types.length} values, but ${value.length} were provided.`);
      }
      return value.map((item, idx) => normalizeSpecValue(item, types[idx], spec, depth + 1));
    }
    case 'scSpecTypeMap': {
      const keyType = typeDef.map().keyType();
      const valueType = typeDef.map().valueType();
      let entries;
      if (Array.isArray(value)) {
        entries = value;
      } else if (value instanceof Map) {
        entries = Array.from(value.entries());
      } else if (value && typeof value === 'object') {
        entries = Object.entries(value);
      } else {
        throw new Error('Map input must be a JSON object or array of [key, value] pairs.');
      }
      return entries.map((entry) => {
        if (!Array.isArray(entry) || entry.length !== 2) {
          throw new Error('Map entries must be [key, value] pairs.');
        }
        const [k, v] = entry;
        return [
          normalizeSpecValue(k, keyType, spec, depth + 1),
          normalizeSpecValue(v, valueType, spec, depth + 1),
        ];
      });
    }
    case 'scSpecTypeUdt': {
      const entry = spec.findEntry(typeDef.udt().name().toString());
      if (!entry) return value;
      const kind = entry.switch().name;
      if (kind === 'scSpecEntryUdtEnumV0') {
        if (typeof value === 'number') return value;
        if (typeof value === 'string' && /^\\d+$/.test(value)) return Number(value);
        const cases = entry.udtEnumV0().cases();
        const match = cases.find(c => c.name().toString() === value || c.name().toString().toLowerCase() === String(value).toLowerCase());
        if (!match) {
          throw new Error(`Unknown enum case: ${value}`);
        }
        return match.value();
      }
      if (kind === 'scSpecEntryUdtStructV0') {
        const fields = entry.udtStructV0().fields();
        const fieldNames = fields.map(field => field.name().toString());
        const numericFields = fieldNames.every(name => /^\\d+$/.test(name));
        if (Array.isArray(value)) {
          if (!numericFields) {
            throw new Error('Struct input must be a JSON object with named fields.');
          }
          if (value.length !== fields.length) {
            throw new Error(`Struct expects ${fields.length} values, but ${value.length} were provided.`);
          }
          return value.map((item, idx) => normalizeSpecValue(item, fields[idx].type(), spec, depth + 1));
        }
        if (!value || typeof value !== 'object') {
          throw new Error('Struct input must be a JSON object with named fields.');
        }
        const normalized = {};
        fields.forEach(field => {
          const fname = field.name().toString();
          if (!Object.prototype.hasOwnProperty.call(value, fname)) return;
          normalized[fname] = normalizeSpecValue(value[fname], field.type(), spec, depth + 1);
        });
        return normalized;
      }
      if (kind === 'scSpecEntryUdtUnionV0') {
        const normalized = normalizeUnionInput(value);
        const cases = entry.udtUnionV0().cases();
        const unionCase = cases.find(c => c.value().name().toString() === normalized.tag);
        if (!unionCase) {
          throw new Error(`Unknown union case: ${normalized.tag}`);
        }
        if (unionCase.switch() === StellarSdk.xdr.ScSpecUdtUnionCaseV0Kind.scSpecUdtUnionCaseVoidV0()) {
          return { tag: normalized.tag };
        }
        const tupleTypes = unionCase.tupleCase().type();
        const values = Array.isArray(normalized.values) ? normalized.values : [];
        if (values.length !== tupleTypes.length) {
          throw new Error(`Union ${normalized.tag} expects ${tupleTypes.length} values, but ${values.length} were provided.`);
        }
        return {
          tag: normalized.tag,
          values: values.map((item, idx) => normalizeSpecValue(item, tupleTypes[idx], spec, depth + 1)),
        };
      }
      return value;
    }
    default:
      return value;
  }
}

function parseInputValue(raw, typeDef, spec) {
  const trimmed = raw.trim();
  const name = specTypeName(typeDef);
  if (trimmed === '') {
    if (name === 'scSpecTypeOption') {
      return undefined;
    }
    throw new Error('Argument value is required.');
  }
  if (trimmed.toLowerCase().startsWith('xdr:')) {
    return StellarSdk.xdr.ScVal.fromXDR(trimmed.slice(4).trim(), 'base64');
  }
  if (name === 'scSpecTypeBool') {
    const lower = trimmed.toLowerCase();
    if (lower === 'true' || lower === 'false') {
      return lower === 'true';
    }
    return parseJsonValue(trimmed);
  }
  if (name === 'scSpecTypeString' || name === 'scSpecTypeSymbol' || name === 'scSpecTypeAddress') {
    return parseStringValue(trimmed);
  }
  if (name === 'scSpecTypeMuxedAddress') {
    const addr = parseStringValue(trimmed);
    const muxed = StellarSdk.decodeAddressToMuxedAccount(addr);
    return StellarSdk.xdr.ScVal.scvAddress(
      StellarSdk.xdr.ScAddress.scAddressTypeMuxedAccount(muxed)
    );
  }
  if (name === 'scSpecTypeBytes' || name === 'scSpecTypeBytesN') {
    const bytes = parseBytesValue(trimmed);
    if (name === 'scSpecTypeBytesN') {
      const expected = typeDef.bytesN().n();
      if (bytes.length !== expected) {
        throw new Error(`Expected ${expected} bytes, got ${bytes.length}.`);
      }
    }
    return bytes;
  }
  if (name === 'scSpecTypeU32' || name === 'scSpecTypeI32') {
    const num = Number(trimmed);
    if (Number.isNaN(num)) {
      throw new Error('Expected a number.');
    }
    return num;
  }
  if ([
    'scSpecTypeU64',
    'scSpecTypeI64',
    'scSpecTypeU128',
    'scSpecTypeI128',
    'scSpecTypeU256',
    'scSpecTypeI256',
  ].includes(name)) {
    return trimmed;
  }
  if (name === 'scSpecTypeTimepoint') {
    const value = trimmed.startsWith('"') ? parseStringValue(trimmed) : trimmed;
    return StellarSdk.xdr.ScVal.scvTimepoint(parseIntegerLike(value, 'Timepoint'));
  }
  if (name === 'scSpecTypeDuration') {
    const value = trimmed.startsWith('"') ? parseStringValue(trimmed) : trimmed;
    return StellarSdk.xdr.ScVal.scvDuration(parseIntegerLike(value, 'Duration'));
  }
  if (name === 'scSpecTypeOption') {
    if (trimmed.toLowerCase() === 'null') return undefined;
    return parseInputValue(trimmed, typeDef.option().valueType(), spec);
  }
  if (name === 'scSpecTypeVal') {
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      parsed = parseStringValue(trimmed);
    }
    if (parsed && typeof parsed === 'object' && parsed.type) {
      const type = String(parsed.type).toLowerCase();
      if (type === 'timepoint') {
        return StellarSdk.xdr.ScVal.scvTimepoint(parseIntegerLike(parsed.value, 'Timepoint'));
      }
      if (type === 'duration') {
        return StellarSdk.xdr.ScVal.scvDuration(parseIntegerLike(parsed.value, 'Duration'));
      }
      if (type === 'bytes') {
        const bytes = parsed.value instanceof Uint8Array
          ? parsed.value
          : Array.isArray(parsed.value)
            ? Uint8Array.from(parsed.value)
            : parseBytesValue(String(parsed.value));
        return StellarSdk.nativeToScVal(bytes, { type: 'bytes' });
      }
      return StellarSdk.nativeToScVal(parsed.value, { type: parsed.type });
    }
    return StellarSdk.nativeToScVal(parsed);
  }
  if (name === 'scSpecTypeError') {
    const parsed = parseJsonValue(trimmed);
    return buildErrorScVal(parsed);
  }
  if (name === 'scSpecTypeResult') {
    const parsed = parseJsonValue(trimmed);
    return buildResultScVal(parsed, typeDef, spec);
  }
  if (name === 'scSpecTypeVec' || name === 'scSpecTypeTuple' || name === 'scSpecTypeMap') {
    const parsed = parseJsonValue(trimmed);
    return normalizeSpecValue(parsed, typeDef, spec);
  }
  if (name === 'scSpecTypeUdt') {
    const parsed = (trimmed.startsWith('{') || trimmed.startsWith('[')) ? parseJsonValue(trimmed) : parseStringValue(trimmed);
    return normalizeSpecValue(parsed, typeDef, spec);
  }
  if (name === 'scSpecTypeVoid') {
    return null;
  }
  return parseJsonValue(trimmed);
}

function safeSerialize(value) {
  const seen = new WeakSet();
  const json = JSON.stringify(value, (key, val) => {
    if (typeof val === "bigint") return val.toString();
    if (val && typeof val === "object") {
      if (seen.has(val)) return "[Circular]";
      seen.add(val);
    }
    if (val instanceof Uint8Array) return Array.from(val);
    if (val instanceof Map) return Object.fromEntries(val.entries());
    if (val instanceof StellarSdk.contract.Ok) {
      return { ok: val.value ?? val };
    }
    if (val instanceof StellarSdk.contract.Err) {
      return { err: val.error ?? val };
    }
    return val;
  });
  return JSON.parse(json);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isReadOnlySimulation(simulationResult) {
  const authCount = simulationResult?.result?.auth?.length ?? 0;
  const txData = simulationResult?.transactionData;
  let writeCount = 0;
  if (txData) {
    if (typeof txData.getReadWrite === 'function') {
      writeCount = txData.getReadWrite().length;
    } else if (typeof txData.getFootprint === 'function') {
      const fp = txData.getFootprint();
      if (typeof fp?.readWrite === 'function') {
        writeCount = fp.readWrite().length;
      }
    } else {
      const readWrite = txData
        ?.resources?.()
        ?.footprint?.()
        ?.readWrite?.();
      if (readWrite?.length != null) {
        writeCount = readWrite.length;
      }
    }
  }
  return authCount === 0 && writeCount === 0;
}

function formatReturnValues(methodName, returnValue, spec) {
  if (!returnValue) return null;
  const decoded = spec
    ? spec.funcResToNative(methodName, returnValue)
    : StellarSdk.scValToNative(returnValue);
  const safeDecoded = spec ? safeSerialize(decoded) : JSON.parse(
    JSON.stringify(decoded, (key, value) => typeof value === "bigint" ? value.toString() : value)
  );
  const normalizeValue = (value) => {
    if (typeof value === 'string') return value;
    return JSON.stringify(value, null, 2);
  };
  if (Array.isArray(safeDecoded)) {
    return safeDecoded.length ? safeDecoded.map(normalizeValue) : ['[]'];
  }
  return [normalizeValue(safeDecoded)];
}

function getExplorerBaseUrl() {
  if (network === 'LOCAL') {
    return null;
  }
  return `https://stellar.expert/explorer/${network.toLowerCase()}`;
}

function createTxExplorerNode(hash, className = '') {
  const explorerBase = getExplorerBaseUrl();
  if (!explorerBase) {
    const code = document.createElement('code');
    code.textContent = hash;
    return code;
  }
  const link = document.createElement('a');
  if (className) link.className = className;
  link.href = `${explorerBase}/tx/${hash}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = hash;
  return link;
}

function renderMethodConsoleError(consoleDiv, error) {
  const pre = document.createElement('pre');
  pre.style.color = 'red';
  pre.textContent = String(error || 'Unknown error');
  consoleDiv.replaceChildren(pre);
}

function contractExplorerMarkup(contractAddress) {
  const explorerBase = getExplorerBaseUrl();
  if (!explorerBase) {
    return 'Block Explorer: Not available for local/custom network.<br />';
  }
  return `Block Explorer: <a href="${explorerBase}/contract/${contractAddress}" target="_blank">Stellar.Expert</a><br />`;
}

async function pollTransactionResult(hash, methodName, consoleDiv, spec) {
  const pending = document.createElement('div');
  pending.textContent = 'Transaction Submitted (PENDING). Waiting for confirmation...';
  consoleDiv.replaceChildren(pending, createTxExplorerNode(hash));
  while (true) {
    const tx = await rpc.getTransaction(hash);
    if (tx.status === 'NOT_FOUND') {
      await sleep(2000);
      continue;
    }
    if (tx.status === 'FAILED') {
      const failed = document.createElement('div');
      failed.style.color = 'red';
      failed.textContent = 'Transaction FAILED.';
      consoleDiv.replaceChildren(failed, createTxExplorerNode(hash));
      return;
    }
    if (tx.status === 'SUCCESS') {
      const outputs = formatReturnValues(methodName, tx.returnValue, spec);
      const success = document.createElement('div');
      success.textContent = 'Success TX: ';
      success.appendChild(createTxExplorerNode(hash, 'tx-hash-link'));
      if (outputs !== null) {
        const pre = document.createElement('pre');
        pre.textContent = outputs.join('\n');
        const label = document.createElement('div');
        label.className = 'tx-output-label';
        label.textContent = 'Output:';
        consoleDiv.replaceChildren(success, label, pre);
      } else {
        const label = document.createElement('div');
        label.className = 'tx-output-label';
        label.textContent = 'Output: No return value.';
        consoleDiv.replaceChildren(success, label);
      }
      return;
    }
    await sleep(2000);
  }
}

async function getContractSpec(contractId) {
  const cacheKey = `${network}:${contractId}`;
  if (contractSpecCache.has(cacheKey)) {
    return contractSpecCache.get(cacheKey);
  }
  const client = await StellarSdk.contract.Client.from({
    contractId,
    rpcUrl,
    networkPassphrase,
    allowHttp: shouldAllowHttp(rpcUrl),
  });
  const spec = client.spec;
  contractSpecCache.set(cacheKey, spec);
  return spec;
}

function renderContractFormFromSpec(contractId, spec, divId = 'explore-form') {
  const container = document.getElementById(divId);
  container.innerHTML = '';
  const funcs = spec.funcs();
  funcs.forEach(fn => {
    const methodName = fn.name().toString();
    const inputs = fn.inputs();
    const args = inputs.map(input => {
      return {
        name: input.name().toString(),
        typeDef: input.type(),
        doc: input.doc ? input.doc().toString() : '',
      };
    });
    const wrapper = document.createElement('div');
    wrapper.classList.add('method-box');
    const isMultiArg = args.length > 1;
    if (args.length <= 1) {
      wrapper.classList.add('method-compact');
    }
    if (args.length === 0) {
      wrapper.classList.add('method-no-args');
    }
    if (isMultiArg) {
      wrapper.classList.add('method-multi');
    }
    const left = document.createElement('div');
    left.classList.add('method-left');
    const title = document.createElement('h3');
    title.textContent = methodName;
    const button = document.createElement('button');
    button.classList.add('method-call-button');
    button.innerHTML = '<i class="fas fa-paper-plane"></i>';
    button.setAttribute('aria-label', `Call ${methodName}`);
    button.setAttribute('title', `Call ${methodName}`);
    if (!isMultiArg) {
      left.appendChild(title);
    }
    args.forEach((arg, index) => {
      const row = document.createElement('div');
      row.classList.add('arg-row');
      const label = document.createElement('label');
      const typeLabel = specTypeToString(arg.typeDef, spec);
      label.textContent = `${arg.name}:${typeLabel}`;
      label.classList.add('arg-label');
      label.htmlFor = `${methodName}-${arg.name}`;
      const isComplex = isComplexSpecType(arg.typeDef);
      const input = document.createElement(isComplex ? 'textarea' : 'input');
      if (!isComplex) {
        input.type = 'text';
      } else {
        input.rows = 2;
      }
      input.id = `${methodName}-${arg.name}`;
      const hint = specTypeHint(arg.typeDef, spec);
      input.placeholder = hint ? `${arg.name}:${typeLabel} e.g. ${hint}` : `${arg.name}:${typeLabel}`;
      const docHint = arg.doc ? ` ${arg.doc}` : '';
      input.setAttribute('title', `${typeLabel}${docHint} (JSON for complex types)`);
      input.setAttribute('aria-label', `${arg.name}: ${typeLabel}`);
      if (isMultiArg) {
        row.classList.add('arg-row-multi');
        const titleCell = document.createElement('div');
        titleCell.classList.add('method-title-cell');
        if (index === 0) {
          titleCell.appendChild(title);
        } else {
          const spacer = document.createElement('span');
          spacer.classList.add('method-title-spacer');
          titleCell.appendChild(spacer);
        }
        const fieldCell = document.createElement('div');
        fieldCell.classList.add('method-field-cell');
        fieldCell.append(input, label);
        if (index === args.length - 1) {
          fieldCell.appendChild(button);
        }
        row.append(titleCell, fieldCell);
      } else {
        if (args.length <= 1) {
          row.classList.add('arg-row-inline');
        }
        row.append(input, label);
      }
      left.appendChild(row);
    });
    if (!isMultiArg) {
      left.appendChild(button);
    }
    const right = document.createElement('div');
    right.classList.add('method-right');
    const consoleDiv = document.createElement('div');
    consoleDiv.classList.add('console');
    right.appendChild(consoleDiv);
    button.addEventListener('click', async () => {
      try {
        const contract = new StellarSdk.Contract(contractId);
        const argsObj = {};
        args.forEach(arg => {
          const inputEl = document.getElementById(`${methodName}-${arg.name}`);
          const value = parseInputValue(inputEl.value, arg.typeDef, spec);
          argsObj[arg.name] = value;
        });
        const convertedArgs = spec.funcArgsToScVals(methodName, argsObj);
        const sourceAccount = await loadSourceAccount(publicKey);
        const op = contract.call(methodName, ...convertedArgs);
        const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase,
        })
          .addOperation(op)
          .setTimeout(30)
          .build();
        const simulationResult = await rpc.simulateTransaction(tx);
        if (simulationResult.error) {
          throw new Error(simulationResult.error);
        }
        if (isReadOnlySimulation(simulationResult)) {
          const decoded = spec.funcResToNative(methodName, simulationResult.result?.retval);
          const safeDecoded = safeSerialize(decoded);
          const output = typeof safeDecoded === 'string'
            ? safeDecoded
            : JSON.stringify(safeDecoded, null, 2);
          const pre = document.createElement('pre');
          pre.textContent = output;
          consoleDiv.innerHTML = '';
          consoleDiv.appendChild(pre);
        } else {
          const preparedTx = StellarSdk.rpc.assembleTransaction(tx, simulationResult).build();
          const signedTx = await signTransaction(preparedTx);
          if (!signedTx) {
            throw new Error('Transaction was not signed.');
          }
          const response = await rpc.sendTransaction(signedTx);
          const hash = response.hash;
          if (response.status === 'ERROR') {
            console.error('Transaction rejected', response);
            renderMethodConsoleError(consoleDiv, 'Transaction rejected by RPC. Check console for details.');
            return;
          }
          await pollTransactionResult(hash, methodName, consoleDiv, spec);
        }
      } catch (err) {
        renderMethodConsoleError(consoleDiv, err?.message || err);
        console.error(err);
      }
    });
    wrapper.appendChild(left);
    wrapper.appendChild(right);
    container.appendChild(wrapper);
  });
}


function activatePanel(panelId, options = {}) {
  const { splitRatio = null, resetSplit = false, expandPanel = true } = options;
  const panelEl = document.getElementById(panelId);
  if (!panelEl) return;

  if (expandPanel) {
    const shouldRestore = splitRatio === null && !resetSplit;
    setPanelCollapsed(false, { restoreRatio: shouldRestore });
  }

  document.querySelectorAll('.sidebar-icon').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));

  panelEl.classList.add('active');
  const panelKey = panelId.replace('-panel', '');
  const sidebarIcon = document.querySelector(`.sidebar-icon[data-panel="${panelKey}"]`);
  if (sidebarIcon) sidebarIcon.classList.add('active');

  if (resetSplit) resetPanelSplit();
  if (splitRatio !== null) applyPanelSplit(splitRatio, { captureDefault: true });
}

async function loadContract(contractId) {
  activatePanel('explore-panel', { splitRatio: 0.25 });
  const exploreForm = document.getElementById('explore-form');
  document.getElementById('explore-contract-id').value = contractId;
  // Save to local storage
  localStorage.setItem('last-contract-id', contractId);
  persistNetworkSelection(network);
  try {
    exploreForm.innerText = 'Loading contract interface...';
    if (network === 'LOCAL') {
      const spec = await getContractSpec(contractId);
      renderContractFormFromSpec(contractId, spec);
      return;
    }
    const interfacePromise = fetch('/interface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contract: contractId, network: network.toLowerCase() })
    }).then(response => response.text());
    const specPromise = getContractSpec(contractId);
    const [specResult, interfaceResult] = await Promise.allSettled([specPromise, interfacePromise]);
    if (specResult.status === 'fulfilled') {
      renderContractFormFromSpec(contractId, specResult.value);
      return;
    }
    if (interfaceResult.status === 'fulfilled') {
      renderContractForm(contractId, interfaceResult.value);
      return;
    }
    throw specResult.reason || interfaceResult.reason;
  } catch (err) {
    exploreForm.innerText = `Failed to load contract: ${err.message}`;
    console.error(err);
  }
}

function normalizeLocalNetworkConfig(config) {
  const normalized = {
    rpcUrl: DEFAULT_LOCAL_NETWORK_CONFIG.rpcUrl,
    horizonUrl: DEFAULT_LOCAL_NETWORK_CONFIG.horizonUrl,
    networkPassphrase: DEFAULT_LOCAL_NETWORK_CONFIG.networkPassphrase,
  };
  if (!config || typeof config !== 'object') {
    return normalized;
  }
  if (typeof config.rpcUrl === 'string' && config.rpcUrl.trim()) {
    normalized.rpcUrl = config.rpcUrl.trim();
  }
  if (typeof config.horizonUrl === 'string' && config.horizonUrl.trim()) {
    normalized.horizonUrl = config.horizonUrl.trim();
  }
  if (typeof config.networkPassphrase === 'string' && config.networkPassphrase.trim()) {
    normalized.networkPassphrase = config.networkPassphrase.trim();
  }
  return normalized;
}

function loadLocalNetworkConfig() {
  try {
    const stored = localStorage.getItem(LOCAL_NETWORK_CONFIG_KEY);
    if (!stored) {
      return normalizeLocalNetworkConfig({});
    }
    const parsed = JSON.parse(stored);
    return normalizeLocalNetworkConfig(parsed);
  } catch (error) {
    console.error('Failed to load local network config:', error);
    return normalizeLocalNetworkConfig({});
  }
}

function saveLocalNetworkConfig(config) {
  localNetworkConfig = normalizeLocalNetworkConfig(config);
  localStorage.setItem(LOCAL_NETWORK_CONFIG_KEY, JSON.stringify(localNetworkConfig));
  return localNetworkConfig;
}

function shouldAllowHttp(url) {
  try {
    return new URL(url).protocol === 'http:';
  } catch {
    return typeof url === 'string' && url.trim().toLowerCase().startsWith('http://');
  }
}

function normalizeNetworkSelection(value) {
  return SUPPORTED_NETWORKS.has(value) ? value : 'TESTNET';
}

function getStoredNetworkSelection() {
  const stored = localStorage.getItem(SELECTED_NETWORK_KEY) || localStorage.getItem(LEGACY_EXPLORE_NETWORK_KEY);
  return normalizeNetworkSelection(stored);
}

function persistNetworkSelection(value) {
  const selected = normalizeNetworkSelection(value);
  localStorage.setItem(SELECTED_NETWORK_KEY, selected);
  // Keep writing the legacy key so existing behavior relying on it does not break.
  localStorage.setItem(LEGACY_EXPLORE_NETWORK_KEY, selected);
  return selected;
}

function syncNetworkSelectors(value) {
  const selected = normalizeNetworkSelection(value);
  const deploySelect = document.getElementById('deploy-network');
  const exploreSelect = document.getElementById('explore-network');
  if (deploySelect && deploySelect.value !== selected) {
    deploySelect.value = selected;
  }
  if (exploreSelect && exploreSelect.value !== selected) {
    exploreSelect.value = selected;
  }
}

function updateNetwork(value) {
  network = normalizeNetworkSelection(value);
  if (network === 'TESTNET') {
    rpcUrl = 'https://soroban-testnet.stellar.org';
    horizonUrl = 'https://horizon-testnet.stellar.org';
    networkPassphrase = StellarSdk.Networks.TESTNET;
  } else if (network === 'FUTURENET') {
    rpcUrl = 'https://rpc-futurenet.stellar.org';
    horizonUrl = 'https://horizon-futurenet.stellar.org';
    networkPassphrase = StellarSdk.Networks.FUTURENET || 'Test SDF Future Network ; October 2022';
  } else if (network === 'LOCAL') {
    const currentLocalConfig = normalizeLocalNetworkConfig(localNetworkConfig);
    rpcUrl = currentLocalConfig.rpcUrl;
    horizonUrl = currentLocalConfig.horizonUrl;
    networkPassphrase = currentLocalConfig.networkPassphrase;
  } else {
    rpcUrl = 'https://mainnet.sorobanrpc.com';
    horizonUrl = 'https://horizon.stellar.org';
    networkPassphrase = StellarSdk.Networks.PUBLIC;
  }
  rpc = new StellarSdk.rpc.Server(rpcUrl, { allowHttp: shouldAllowHttp(rpcUrl) });
  horizon = new StellarSdk.Horizon.Server(horizonUrl, { allowHttp: shouldAllowHttp(horizonUrl) });
}

function setActiveNetwork(value, options = {}) {
  const { persist = true, logToDeployConsole = false } = options;
  const selected = normalizeNetworkSelection(value);
  syncNetworkSelectors(selected);
  updateNetwork(selected);
  if (persist) {
    persistNetworkSelection(selected);
  }
  if (logToDeployConsole) {
    const deployConsole = document.getElementById('deploy-console');
    if (deployConsole) {
      deployConsole.innerHTML += `Network switched to ${network}<br />`;
    }
  }
}

async function loadSourceAccount(address) {
  try {
    return await rpc.getAccount(address);
  } catch (rpcError) {
    try {
      return await horizon.loadAccount(address);
    } catch (horizonError) {
      const rpcMessage = rpcError?.message || String(rpcError);
      const horizonMessage = horizonError?.message || String(horizonError);
      throw new Error(`Failed to load account ${address}. RPC: ${rpcMessage}. Horizon: ${horizonMessage}`);
    }
  }
}

function getLocalFriendbotUrlFromConfig() {
  const localConfig = normalizeLocalNetworkConfig(localNetworkConfig);
  const candidates = [localConfig.horizonUrl, localConfig.rpcUrl];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      parsed.pathname = '/friendbot';
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch {
      // Ignore invalid candidate URL and try next.
    }
  }
  return null;
}

async function fundAddressOnNetwork(pubKey, networkName) {
  let friendbotUrl = friendbotUrls[networkName];
  if (networkName === 'LOCAL') {
    friendbotUrl = getLocalFriendbotUrlFromConfig();
    if (!friendbotUrl) {
      throw new Error('Local friendbot URL is not configured. Check Local/Custom settings.');
    }
    const separator = friendbotUrl.includes('?') ? '&' : '?';
    const url = `${friendbotUrl}${separator}addr=${encodeURIComponent(pubKey)}`;
    const response = await fetch(url);
    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(`Failed to fund LOCAL account, status ${response.status}${details ? `: ${details}` : ''}`);
    }
    return;
  }
  if (!friendbotUrl) return;
  const separator = friendbotUrl.includes('?') ? '&' : '?';
  const url = `${friendbotUrl}${separator}addr=${encodeURIComponent(pubKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fund ${networkName} account, status ${response.status}`);
  }
}

async function resetCode() {
  if (confirm(`Are you sure you want reset the editor and lose all code changes and local wallets?`)) {
    localStorage.clear();
    window.location = "https://soropg.com";
  }
}

function toScVal(val, type) {
  switch(type) {
    case 'string':
      return StellarSdk.nativeToScVal(val, { type: "string" });
    case 'i32':
    case 'i64':
    case 'i128':
    case 'i256':
    case 'u32':
    case 'u64':
    case 'u128':
    case 'u256': {
      const num = Number(val);
      if (isNaN(num)) {
        throw new Error(`Value "${val}" is not a valid number for type ${type}.`);
      }
      return StellarSdk.nativeToScVal(num, { type });
    }
    case 'bool': {
      if (typeof val === "string") {
        const lower = val.toLowerCase();
        if (lower === "true") return StellarSdk.nativeToScVal(true, { type: "bool" });
        if (lower === "false") return StellarSdk.nativeToScVal(false, { type: "bool" });
        throw new Error(`Value "${val}" is not a valid boolean.`);
      }
      return StellarSdk.nativeToScVal(!!val, { type: "bool" });
    }
    case 'address':
      return StellarSdk.nativeToScVal(val, { type: "address" });
    default:
      throw new Error(`Unsupported type: ${type}`);
  }
}

function createArgRow() {
  const row = document.createElement('div');
  row.className = 'arg-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Argument value';
  const select = document.createElement('select');
  const argumentTypes = [
    { value: "string", label: "String" },
    { value: "bool", label: "Boolean" },
    { value: "address", label: "Address" },
    { value: "i32", label: "i32 (Integer)" },
    { value: "i64", label: "i64 (Integer)" },
    { value: "i128", label: "i128 (Integer)" },
    { value: "i256", label: "i256 (Integer)" },
    { value: "u32", label: "u32 (Unsigned)" },
    { value: "u64", label: "u64 (Unsigned)" },
    { value: "u128", label: "u128 (Unsigned)" },
    { value: "u256", label: "u256 (Unsigned)" },
  ];
  argumentTypes.forEach(type => {
    const option = document.createElement('option');
    option.value = type.value;
    option.textContent = type.label;
    select.appendChild(option);
  });
  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = 'Remove';
  removeBtn.className = 'remove-btn';
  removeBtn.addEventListener('click', () => {
    row.remove();
  });
  row.appendChild(input);
  row.appendChild(select);
  row.appendChild(removeBtn);
  return row;
}

const funnyMessages = [
  '(making a cup of tea)',
  '(arguing with the Rust compiler)',
  '(having an existential crisis)',
  '(who would write code like this?)',
  '(so many bugs, so little time)',
  '(searching for a blockchain use case)',
  '(not enough caffeine in the world)',
  '(trying to merge master again)',
  '(asking ChatGPT to save me)',
  '(blaming it on the intern)',
  '(reading the Rust book again)',
  '(checking StackOverflow like its 1999)',
  '(pinging the dev in Discord)',
  '(waiting for cargo... still)',
  '(staring into the void())',
  '(I hope this is just for testnet)',
  '(praying to the compiler gods)',
  '(turning it off then on again)',
  '(explaining web3 to my professor again)',
  '(desperately googling error codes)',
  '(wondering if the bug is a feature)',
  '(updating dependencies and hoping for the best)',
  '(consulting ancient Rust scrolls)',
  '(rewriting everything from scratch)',
  '(trying to convince CTO this was a good idea)',
  '(looking up what "Soroban" actually means)',
  '(wondering if web2 was that bad after all)',
  '(trying to remember what this code even does)',
  '(adding "blockchain expert" to LinkedIn)',
  '(practicing mindfulness while cargo builds)',
  '(wondering if anyone actually reads these)',
  '(learning Rust ownership for the 17th time)',
  '(checking if "blockchain" still impresses VCs)',
  '(downgrading from coffee to energy drinks)',
  '(sending thoughts and prayers to cargo)',
  '(secretly hoping for a power outage)',
];

document.getElementById('add-arg-btn').addEventListener('click', () => {
  const argsContainer = document.getElementById('args-container');
  argsContainer.appendChild(createArgRow());
});

setActiveNetwork(getStoredNetworkSelection(), { persist: true });
document.getElementById('deploy-network').addEventListener('change', (e) => {
  setActiveNetwork(e.target.value, { persist: true, logToDeployConsole: true });
});
document.getElementById('explore-network').addEventListener('change', (e) => {
  setActiveNetwork(e.target.value, { persist: true });
});

function setShareStatus(message, isError = false) {
  const statusEl = document.getElementById('share-link-status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function setLocalNetworkStatus(message, isError = false) {
  const statusEl = document.getElementById('local-network-status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function setLocalNetworkInputs(config) {
  const rpcInput = document.getElementById('local-network-rpc-url');
  const horizonInput = document.getElementById('local-network-horizon-url');
  const passphraseInput = document.getElementById('local-network-passphrase');
  if (rpcInput) rpcInput.value = config.rpcUrl;
  if (horizonInput) horizonInput.value = config.horizonUrl;
  if (passphraseInput) passphraseInput.value = config.networkPassphrase;
}

function validateNetworkUrl(url, fieldName) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${fieldName} must be a valid URL.`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${fieldName} must use http or https.`);
  }
}

function getLocalNetworkInputConfig() {
  const rpcInput = document.getElementById('local-network-rpc-url');
  const horizonInput = document.getElementById('local-network-horizon-url');
  const passphraseInput = document.getElementById('local-network-passphrase');
  if (!rpcInput || !horizonInput || !passphraseInput) return null;
  return {
    rpcUrl: rpcInput.value.trim(),
    horizonUrl: horizonInput.value.trim(),
    networkPassphrase: passphraseInput.value.trim(),
  };
}

function applyCurrentLocalNetworkConfig() {
  if (network === 'LOCAL') {
    updateNetwork('LOCAL');
  }
}

function handleSaveLocalNetworkConfig() {
  try {
    const inputConfig = getLocalNetworkInputConfig();
    if (!inputConfig) return;
    if (!inputConfig.rpcUrl || !inputConfig.horizonUrl || !inputConfig.networkPassphrase) {
      throw new Error('RPC URL, Horizon URL, and network passphrase are required.');
    }
    validateNetworkUrl(inputConfig.rpcUrl, 'RPC URL');
    validateNetworkUrl(inputConfig.horizonUrl, 'Horizon URL');
    saveLocalNetworkConfig(inputConfig);
    setLocalNetworkInputs(localNetworkConfig);
    applyCurrentLocalNetworkConfig();
    setLocalNetworkStatus('Local/custom network configuration saved.');
  } catch (error) {
    setLocalNetworkStatus(error.message || 'Failed to save local network configuration.', true);
  }
}

function handleResetLocalNetworkConfig() {
  saveLocalNetworkConfig(DEFAULT_LOCAL_NETWORK_CONFIG);
  setLocalNetworkInputs(localNetworkConfig);
  applyCurrentLocalNetworkConfig();
  setLocalNetworkStatus('Local/custom network configuration reset to defaults.');
}

function handleShareLink() {
  const input = document.getElementById('share-url-input');
  if (!input) return;
  const url = input.value.trim();
  if (!url) {
    setShareStatus('Paste a GitHub or Gist URL first.', true);
    return;
  }
  const shareUrl = `${window.location.origin}${window.location.pathname}?codeUrl=${encodeURIComponent(url)}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    setShareStatus('Shareable link copied to clipboard.');
  }).catch(() => {
    setShareStatus('Could not copy automatically. The link is ready to share.', true);
  });
}

function toRawUrl(url) {
  try {
    const u = new URL(url);
    if (u.hostname === "gist.github.com") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (parts.length >= 2) {
        return `https://gist.githubusercontent.com/${parts[0]}/${parts[1]}/raw`;
      }
    }
    if (u.hostname === "github.com") {
      const parts = u.pathname.split("/").filter(Boolean); 
      if (parts.length >= 5 && parts[2] === "blob") {
        const [owner, repo, , branch, ...pathParts] = parts;
        return `https://raw.githubusercontent.com/${owner}/${repo}/refs/heads/${branch}/${pathParts.join("/")}`;
      }
    }
    return url;
  } catch {
    return url;
  }
}

// Setup Wallet Kit event listener for state updates
StellarWalletsKit.on(KitEventType.STATE_UPDATED, event => {
  if (event.payload.address) {
    walletKitAddress = event.payload.address;
    keypair = null;
    publicKey = walletKitAddress;
    updateWalletUi();
  } else {
    walletKitAddress = null;
    if (!keypair) {
      publicKey = null;
      updateWalletUi();
    }
  }
});

document.querySelectorAll('.wallet-generate').forEach(button => {
  button.addEventListener('click', async () => {
    keypair = StellarSdk.Keypair.random();
    walletKitAddress = null;
    localStorage.setItem('secretKey', keypair.secret());
    publicKey = keypair.publicKey();
    updateWalletUi();
    showFundingStatus(20000);
    await Promise.allSettled([
      fundAddressOnNetwork(publicKey, 'TESTNET'),
      fundAddressOnNetwork(publicKey, 'FUTURENET'),
      fundAddressOnNetwork(publicKey, 'LOCAL'),
    ]);
  });
});

document.querySelectorAll('.wallet-load-secret').forEach(button => {
  button.addEventListener('click', async () => {
    const secretKey = prompt('Enter a secret key (do not use in production): ');
    if (!secretKey) return;
    localStorage.setItem('secretKey', secretKey);
    keypair = StellarSdk.Keypair.fromSecret(secretKey);
    walletKitAddress = null;
    publicKey = keypair.publicKey();
    updateWalletUi();
  });
});

document.querySelectorAll('.wallet-export-keys').forEach(button => {
  button.addEventListener('click', async () => {
    const secretKey = localStorage.getItem('secretKey');
    if (!secretKey) return alert('No secret key found');
    if (walletKitAddress && !keypair) return;
    keypair = StellarSdk.Keypair.fromSecret(secretKey);
    publicKey = keypair.publicKey();
    updateWalletUi();
    setWalletKeysHtml(`Public Key: ${publicKey}<br />Secret Key: ${secretKey}`);
  });
});

document.querySelectorAll('.wallet-fund').forEach(button => {
  button.addEventListener('click', async () => {
    if (!publicKey) {
      alert('Connect a wallet first.');
      return;
    }
    showFundingStatus(20000);
    await Promise.allSettled([
      fundAddressOnNetwork(publicKey, 'TESTNET'),
      fundAddressOnNetwork(publicKey, 'FUTURENET'),
      fundAddressOnNetwork(publicKey, 'LOCAL'),
    ]);
  });
});

document.querySelectorAll('.wallet-disconnect').forEach(button => {
  button.addEventListener('click', async () => {
    if (!publicKey) return;
    if (keypair || localStorage.getItem('secretKey')) {
      const ok = confirm('Disconnecting will remove the local wallet from this browser. If you have not exported the keys, they will be lost forever. Continue?');
      if (!ok) return;
      localStorage.removeItem('secretKey');
      keypair = null;
      walletKitAddress = null;
      publicKey = null;
      updateWalletUi();
      return;
    }
    if (walletKitAddress) {
      try {
        await StellarWalletsKit.disconnect();
      } catch (err) {
        console.error(err);
      }
      walletKitAddress = null;
      publicKey = null;
      updateWalletUi();
    }
  });
});

async function signTransaction(preparedTx) {
  if (!publicKey) {
    document.getElementById('deploy-console').innerHTML += `Please connect or create a wallet first<br />`;
    return;
  }
  if (keypair) {
    preparedTx.sign(keypair);
    return preparedTx;
  } else {
    const xdr = preparedTx.toXDR();
    document.getElementById('deploy-console').innerHTML += 'Requesting signature from wallet...<br />';
    const { signedTxXdr } = await StellarWalletsKit.signTransaction(xdr, {
      networkPassphrase,
      address: publicKey
    });
    const signedTx = StellarSdk.TransactionBuilder.fromXDR(
      signedTxXdr,
      networkPassphrase,
    );
    return signedTx;
  }
}

document.getElementById('deploy-button').addEventListener('click', async () => {
  document.getElementById('deploy-button').disabled = true;
  setTimeout(() => document.getElementById('deploy-button').disabled = false, 3000);
  document.getElementById('panel-container').scrollTo({
    top: document.getElementById('deploy-console').offsetTop,
    left: document.getElementById('panel-container').scrollLeft,
    behavior: 'smooth'
  });
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.wasm';
  input.click();
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) {
      document.getElementById('deploy-button').disabled = false;
      return;
    }
    const wasmBuffer = new Uint8Array(await file.arrayBuffer());
    try {
      const sourceAccount = await loadSourceAccount(publicKey);
      const op = StellarSdk.Operation.uploadContractWasm({ wasm: wasmBuffer });
      const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
        fee: StellarSdk.BASE_FEE,
        networkPassphrase,
      }).addOperation(op).setTimeout(30).build();
      const preparedTx = await rpc.prepareTransaction(tx);
      const signedTx = await signTransaction(preparedTx);
      document.getElementById('deploy-console').innerHTML += 'Submitting transaction 1/2...<br />';
      let response = await rpc.sendTransaction(signedTx);
      const hash = response.hash;
      document.getElementById('deploy-console').innerHTML += `Transaction 1/2 Submitted (hash: ${hash}). Waiting for confirmation...<br />`;
      await new Promise((resolve) => setTimeout(resolve, 2000));
      while (true) {
        response = await rpc.getTransaction(hash); // violating code
        if (response.status !== 'NOT_FOUND') break;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      if (response.status === 'SUCCESS') {
        const wasmHash = response.returnValue.bytes();
        const salt = response.returnValue.hash;
        document.getElementById('deploy-console').innerHTML += `Success! WASM hash: ${wasmHash.toString('hex')}<br />`;
        const argsContainer = document.getElementById('args-container');
        const argRows = argsContainer.getElementsByClassName('arg-row');      
        const convertedArgs = [];
        for (let row of argRows) {
          const valueInput = row.querySelector('input[type="text"]');
          const typeSelect = row.querySelector('select');
          const value = valueInput.value.trim();
          const type = typeSelect.value;
          if (value === "") {
            throw new Error("One of the argument values is empty.");
          }
          convertedArgs.push(toScVal(value, type));
        }
        let op2;
        if (convertedArgs.length === 0) {
          op2 = StellarSdk.Operation.createCustomContract({
            wasmHash,
            address: StellarSdk.Address.fromString(publicKey),
            salt,
          });
        } else {
          op2 = StellarSdk.Operation.createCustomContract({
            wasmHash,
            address: StellarSdk.Address.fromString(publicKey),
            salt,
            constructorArgs: convertedArgs,
          });
        }
        const tx2 = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase
        }).addOperation(op2).setTimeout(30).build();
        const preparedTx2 = await rpc.prepareTransaction(tx2);
        const signedTx2 = await signTransaction(preparedTx2);
        document.getElementById('deploy-console').innerHTML += 'Submitting transaction 2/2 ...<br />';
        let response2 = await rpc.sendTransaction(signedTx2);
        const hash2 = response2.hash;
        document.getElementById('deploy-console').innerHTML += `Transaction 2/2 Submitted (hash: ${hash2}). Waiting for confirmation...<br />`;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        while (true) {
          response2 = await rpc.getTransaction(hash2);
          if (response2.status !== 'NOT_FOUND') break;
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        if (response2.status === 'SUCCESS') {
          const contractAddress = StellarSdk.StrKey.encodeContract(
            StellarSdk.Address.fromScAddress(
              response2.returnValue.address(),
            ).toBuffer(),
          );
        document.getElementById('deploy-console').innerHTML += `Contract Deployed!<br />
        Contract ID: ${contractAddress}<br />
        ${contractExplorerMarkup(contractAddress)}
        SoroPG Explorer: <a href="#" onclick="loadContract('${contractAddress}'); return false;">Load Contract</a><br />`;
        } else {
          document.getElementById('deploy-console').innerHTML += 'Transaction 2/2 failed.<br />';
        }
      } else {
        document.getElementById('deploy-console').innerHTML += 'Transaction 1/2 failed.<br />';
      }
      document.getElementById('deploy-button').disabled = false;
    } catch (err) {
      console.error(err);
      document.getElementById('deploy-console').innerHTML += 'Error: ' + err.message;
      document.getElementById('deploy-button').disabled = false;
    }
  };
});

document.getElementById('load-contract-button').addEventListener('click', async () => {
  const contractId = document.getElementById('explore-contract-id').value;
  loadContract(contractId);
});

async function init() {
  // Create Wallet Kit buttons
  const deployButtonWrapper = document.getElementById('wallet-button-deploy');
  const exploreButtonWrapper = document.getElementById('wallet-button-explore');
  if (deployButtonWrapper) {
    StellarWalletsKit.createButton(deployButtonWrapper);
  }
  if (exploreButtonWrapper) {
    StellarWalletsKit.createButton(exploreButtonWrapper);
  }
  setupWalletMenus();

  const keyStore = localStorage.getItem('secretKey');
  if (keyStore) {
    keypair = StellarSdk.Keypair.fromSecret(keyStore);
    publicKey = keypair.publicKey();
  }
  updateWalletUi();

  // Restore last contract ID and network settings
  const lastContractId = localStorage.getItem('last-contract-id');
  if (lastContractId) {
    document.getElementById('explore-contract-id').value = lastContractId;
  }
  setActiveNetwork(getStoredNetworkSelection(), { persist: false });

  const urlParams = new URLSearchParams(window.location.search);
  const codeUrl = urlParams.get("codeUrl");
  if (codeUrl) {
    try {
      console.log(`Converting: ${codeUrl}`);
      const fixedCodeUrl = toRawUrl(codeUrl);
      console.log(`Fetching: ${fixedCodeUrl}`);
      const resp = await fetch(fixedCodeUrl);
      if (resp.ok) {
        const code = await resp.text();
        // Update the lib.rs file with the shared code
        files['lib.rs'] = code;
        saveFiles();
        switchToFile('lib.rs');
      }
    } catch(e) {
      alert("Failed to fetch shared code:", e);
    }
  }
  // Note: File loading and editor initialization is now handled in the Monaco editor callback
  const resetButton = document.getElementById('reset-code');
  if (resetButton) resetButton.onclick = async () => { await resetCode() };
  const shareButton = document.getElementById('share-link');
  if (shareButton) shareButton.onclick = () => handleShareLink();
  const shareInput = document.getElementById('share-url-input');
  if (shareInput) {
    shareInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') handleShareLink();
    });
    shareInput.addEventListener('input', () => {
      setShareStatus('');
    });
  }
  setLocalNetworkInputs(localNetworkConfig);
  const saveLocalNetworkConfigButton = document.getElementById('save-local-network-config');
  if (saveLocalNetworkConfigButton) {
    saveLocalNetworkConfigButton.addEventListener('click', () => handleSaveLocalNetworkConfig());
  }
  const resetLocalNetworkConfigButton = document.getElementById('reset-local-network-config');
  if (resetLocalNetworkConfigButton) {
    resetLocalNetworkConfigButton.addEventListener('click', () => handleResetLocalNetworkConfig());
  }
  ['local-network-rpc-url', 'local-network-horizon-url', 'local-network-passphrase'].forEach((id) => {
    const input = document.getElementById(id);
    if (input) {
      input.addEventListener('input', () => setLocalNetworkStatus(''));
    }
  });
  document.getElementById('run-tests').onclick = () => runTests();
  document.getElementById('compile-code').onclick = () => compileCode();

  const resizer = document.getElementById("resizer");
  const topPanel = document.getElementById("editor-container");
  const bottomPanel = document.getElementById("panel-container");
  let isDragging = false;
  const layout = getPanelLayoutElements();
  if (layout) captureDefaultSplitIfNeeded(layout);

  const collapseButton = document.getElementById('panel-collapse');
  if (collapseButton) {
    collapseButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      setPanelCollapsed(true);
    });
    collapseButton.addEventListener('mousedown', (event) => {
      event.stopPropagation();
    });
  }
  const expandButton = document.getElementById('panel-expand');
  if (expandButton) {
    expandButton.addEventListener('click', (event) => {
      event.preventDefault();
      setPanelCollapsed(false);
    });
  }

  resizer.addEventListener("mousedown", (e) => {
    isDragging = true;
    document.body.style.cursor = "row-resize";
    e.preventDefault();
  });

  window.addEventListener("mousemove", (e) => {
    if (!isDragging) return;
    const containerOffsetTop = document.getElementById("main-content").offsetTop;
    const totalHeight = document.getElementById("main-content").clientHeight;
    const newTopHeight = e.clientY - containerOffsetTop;
    const newBottomHeight = totalHeight - newTopHeight - resizer.offsetHeight;

    // Only update if both panels meet minimum height requirement
    if (newTopHeight >= PANEL_MIN_HEIGHT && newBottomHeight >= PANEL_MIN_HEIGHT) {
      topPanel.style.height = `${newTopHeight}px`;
      bottomPanel.style.height = `${newBottomHeight}px`;
    }
  });

  window.addEventListener("mouseup", () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = "default";
      const currentLayout = getPanelLayoutElements();
      if (currentLayout && !isPanelCollapsed) {
        const ratio = getCurrentSplitRatio(currentLayout);
        if (ratio) lastPanelSplitRatio = ratio;
      }
      return;
    }
    document.body.style.cursor = "default";
  });
}

document.querySelectorAll('.sidebar-icon').forEach(icon => {
  icon.addEventListener('click', function() {
    const panelId = this.getAttribute('data-panel') + '-panel';
    if (panelId === 'home-panel') {
      window.location = "/";
      return;
    }
    if (panelId === 'github-panel') {
      window.open("https://github.com/jamesbachini/Soroban-Playground", "_blank");
      return;
    }
    const resetSplit = panelId === 'create-panel';
    activatePanel(panelId, { resetSplit });
  });
});

window.addEventListener('resize', function() {
  if (editor) {
    editor.layout();
  }
});
