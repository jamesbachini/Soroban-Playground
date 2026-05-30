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
const THEME_STORAGE_KEY = 'soropg-theme';
const ACADEMY_PROGRESS_KEY = 'soropg-academy-progress';
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
let academyProgress = loadAcademyProgress();
let academyYoutubeApiPromise = null;
let academyYoutubePlayer = null;
const PANEL_MIN_HEIGHT = 200;
let defaultPanelSplitRatio = null;
let lastPanelSplitRatio = null;
let isPanelCollapsed = false;
let currentTheme = getStoredTheme();

document.body.dataset.theme = currentTheme;

// Initialize Stellar Wallet Kit
const { StellarWalletsKit, KitEventType, SwkAppDarkTheme, defaultModules } = window.MyWalletKit;
StellarWalletsKit.init({
  theme: SwkAppDarkTheme,
  modules: defaultModules(),
});

const WORKSPACE_STORAGE_KEY = 'soropg-workspaces';
const LEGACY_FILES_STORAGE_KEY = 'soroban-files';
const WORKSPACE_SCHEMA_VERSION = 1;
const MCP_API_KEY_STORAGE_KEY = 'soropg-mcp-api-key';
const MCP_SESSION_STORAGE_KEY = 'soropg-mcp-session-id';
const MCP_HEARTBEAT_MS = 25_000;
const MCP_POLL_MS = 4_000;
const MCP_PUBLISH_DEBOUNCE_MS = 1_000;
const MAIN_SOURCE_CANDIDATES = ['src/lib.rs', 'lib.rs'];
const ACADEMY_TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org';
const ACADEMY_TESTNET_EXPERT_BASE = 'https://stellar.expert/explorer/testnet/contract';
const ACADEMY_LESSONS = Object.freeze({
  'foundations-hello-world': Object.freeze({
    id: 'foundations-hello-world',
    number: 1,
    title: 'Hello World: Build, Test, and Deploy',
    course: 'Foundations',
    format: 'Written + Practice',
    duration: '35m',
    level: 'Beginner',
    summary: 'Create a basic Soroban contract in SoroPG, understand the Rust contract structure, run your first unit test, build the WASM, deploy to testnet, and invoke the contract from the IDE.',
    githubUrl: 'https://github.com/stellar/soroban-examples/tree/main/hello_world',
    preferredFile: 'src/lib.rs',
    expectedMethods: Object.freeze(['hello']),
    primaryAction: 'import',
    completionMode: 'deploy',
    videoId: '',
    videoTitle: 'Hello World contract walkthrough',
    objectives: Object.freeze([
      'Identify the contract struct, impl block, exported function, and Soroban SDK types in a Rust contract.',
      'Run the included unit test before changing deployment state.',
      'Build a WASM artifact, deploy it to Stellar Testnet, and verify the exported hello function.',
      'Use the IDE contract explorer to invoke the deployed function with a symbol argument.',
    ]),
    sections: Object.freeze([
      Object.freeze({
        title: '1. Import the starter contract',
        body: 'Open the course material to load Stellar\'s hello world example into a fresh SoroPG workspace. Start in src/lib.rs and find the HelloContract type, the #[contractimpl] block, and the hello(env, to) function.',
        action: 'Open Course Material',
      }),
      Object.freeze({
        title: '2. Read the Rust contract shape',
        body: 'The contract is intentionally small: Env gives access to ledger APIs, Symbol represents a compact contract-friendly string, and Vec<Symbol> is the return value. Notice that public contract functions are ordinary Rust associated functions exposed through the macro.',
        action: 'Inspect src/lib.rs',
      }),
      Object.freeze({
        title: '3. Run the unit test',
        body: 'Switch to the Test panel and run the template test. The test registers the contract in a simulated environment and calls hello with a symbol. Treat this as the fast feedback loop before every build.',
        action: 'Run Unit Tests',
      }),
      Object.freeze({
        title: '4. Build, deploy, and invoke',
        body: 'Build the WASM, connect or create a testnet wallet, deploy the contract, then paste the contract id back into Academy. After verification, open Explore, load the contract id, and invoke hello from the generated interface.',
        action: 'Deploy Contract',
      }),
    ]),
    practice: Object.freeze([
      'Change the returned greeting symbol, rerun tests, and confirm the test catches any mismatch.',
      'Deploy only after tests and build both pass.',
      'Invoke hello with your own name-like symbol from the Explore panel.',
    ]),
  }),
  'ai-assisted-development': Object.freeze({
    id: 'ai-assisted-development',
    number: 2,
    title: 'AI-Assisted Contract Development',
    course: 'AI Workflow',
    format: 'Written + Practice',
    duration: '30m',
    level: 'Beginner',
    summary: 'Use the built-in AI assistant to add new functions, refactor contract code, explain compiler errors, generate tests, and speed up the edit-build-test loop without losing control of the code.',
    githubUrl: 'https://github.com/stellar/soroban-examples/tree/main/hello_world',
    preferredFile: 'src/lib.rs',
    expectedMethods: Object.freeze([]),
    primaryAction: 'ai-assistant',
    completionMode: 'manual',
    videoId: '',
    videoTitle: 'AI-assisted contract development workflow',
    objectives: Object.freeze([
      'Use the assistant as an editor and reviewer while keeping every code change visible in the workspace.',
      'Ask for small, testable contract changes instead of broad rewrites.',
      'Use compiler errors and failing tests as precise prompts for the next assistant turn.',
      'Generate or refine tests before accepting behavior changes.',
    ]),
    sections: Object.freeze([
      Object.freeze({
        title: '1. Start from working code',
        body: 'Use the hello world workspace from Lesson 1 or any current contract that already builds. Run tests once before asking for changes so you know the baseline is clean.',
        action: 'Use Current Workspace',
      }),
      Object.freeze({
        title: '2. Ask for one narrow edit',
        body: 'Open AI Assistant and ask for a concrete addition such as "add a goodbye function that returns [bye, name] and update the tests". Keep prompts scoped to one behavior so the diff is easy to review.',
        action: 'Open AI Assistant',
      }),
      Object.freeze({
        title: '3. Review before you run',
        body: 'Read the changed Rust code in the editor. Check exported method names, SDK types, and test expectations. If something looks unclear, ask the assistant to explain the exact line instead of accepting it blindly.',
        action: 'Review the diff',
      }),
      Object.freeze({
        title: '4. Close the loop with tests',
        body: 'Run tests, then use any compiler or assertion error as the next prompt. A useful pattern is: paste the error, say what you expected, and ask for the smallest fix.',
        action: 'Run Unit Tests',
      }),
    ]),
    practice: Object.freeze([
      'Ask the assistant to add one exported function and one unit test for it.',
      'Ask it to explain a compiler error in plain language, then make the smallest fix.',
      'Ask for a refactor that improves naming without changing public behavior.',
    ]),
  }),
  'agentic-ai-mcp': Object.freeze({
    id: 'agentic-ai-mcp',
    number: 3,
    title: 'SoroPG + Agentic AI = Magic: Claude Code or Codex via MCP',
    course: 'AI Workflow',
    format: 'Written + Setup',
    duration: '30m',
    level: 'Intermediate',
    summary: 'Install and connect an MCP server so external agentic coding tools can read, edit, and improve SoroPG projects, turning the browser IDE into an AI-native contract development workspace.',
    githubUrl: '',
    preferredFile: 'src/lib.rs',
    expectedMethods: Object.freeze([]),
    primaryAction: 'mcp-setup',
    completionMode: 'manual',
    videoId: '',
    videoTitle: 'Connecting SoroPG to agentic coding tools',
    objectives: Object.freeze([
      'Understand the browser tab as the bridge between SoroPG workspaces and an external MCP client.',
      'Generate a SoroPG browser key and add the npx MCP server to Claude Code, Codex, or another MCP client.',
      'Confirm the agent can list projects before allowing edits.',
      'Use agentic tools for multi-file improvements while keeping SoroPG as the live contract workspace.',
    ]),
    sections: Object.freeze([
      Object.freeze({
        title: '1. Open the MCP setup panel',
        body: 'The MCP setup screen shows the browser bridge status, the API URL, active workspace, last sync time, and the JSON config your local client needs.',
        action: 'Open MCP Setup',
      }),
      Object.freeze({
        title: '2. Generate a browser key',
        body: 'Generate a key in SoroPG. This authorizes your local MCP server to reach the workspaces in this open browser tab, so keep the tab open while the agent works.',
        action: 'Generate Key',
      }),
      Object.freeze({
        title: '3. Install the MCP server in your client',
        body: 'Use Node.js 20 or newer and configure your MCP client to run npx -y soropg-mcp. Use the setup docs for your client, reload the client, then ask it to run soropg_list_projects.',
        action: 'Open Setup Docs',
      }),
      Object.freeze({
        title: '4. Let the agent make a controlled edit',
        body: 'Ask Claude Code or Codex to inspect the active project, explain the contract, and make one small improvement. Return to SoroPG, review the changed files, then run tests and build.',
        action: 'Run Agent Task',
      }),
    ]),
    practice: Object.freeze([
      'Ask the external agent to list SoroPG projects and identify the active workspace.',
      'Ask it to add or improve one test, then verify the result in SoroPG.',
      'Ask it to summarize every file it changed before you deploy anything.',
    ]),
  }),
  'soroban-state-storage-types': Object.freeze({
    id: 'soroban-state-storage-types',
    number: 4,
    title: 'State, Storage, and Data Types in Soroban',
    course: 'Core Soroban',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Intermediate',
    summary: 'Learn how contracts store data using instance, persistent, and temporary storage; build a counter or profile contract; and understand DataKey, Address, Symbol, Vec, Map, and custom contract types.',
    comingSoon: true,
  }),
  'authorization-auth-systems': Object.freeze({
    id: 'authorization-auth-systems',
    number: 5,
    title: 'Authorization: Building authentication systems',
    course: 'Core Soroban',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Intermediate',
    summary: 'Add real access control with require_auth, admin-only functions, user-owned state, and safe initialization patterns so students understand who is allowed to do what on-chain.',
    comingSoon: true,
  }),
  'openzeppelin-token': Object.freeze({
    id: 'openzeppelin-token',
    number: 6,
    title: 'Building a Token with OpenZeppelin',
    course: 'Applied Contracts',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Intermediate',
    summary: 'Use the OpenZeppelin wizard to create a fungible stablecoin token that can be swapped 1:1 with USDC.',
    comingSoon: true,
  }),
  'events-errors-ux': Object.freeze({
    id: 'events-errors-ux',
    number: 7,
    title: 'Events, Errors, and Better Contract UX',
    course: 'Core Soroban',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Intermediate',
    summary: 'Add structured events for indexing and debugging, replace panics with custom errors, and design contract functions that are easier for frontends, explorers, and AI tools to understand.',
    comingSoon: true,
  }),
  'testing-soroban-contracts': Object.freeze({
    id: 'testing-soroban-contracts',
    number: 8,
    title: 'Testing Soroban Contracts',
    course: 'Quality',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Intermediate',
    summary: 'Write useful unit tests with soroban-sdk test utilities, mock authorization, test failures, inspect emitted events, simulate ledger time, and build confidence before deploying to testnet.',
    comingSoon: true,
  }),
  'stellar-contract-security': Object.freeze({
    id: 'stellar-contract-security',
    number: 9,
    title: 'Stellar Smart Contracts Security',
    course: 'Security',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Advanced',
    summary: 'Review the most common Soroban mistakes: missing auth, reinitialization, unchecked arithmetic, bad storage keys, unsafe cross-contract calls, TTL/archival issues, and poor input validation.',
    comingSoon: true,
  }),
  'playground-to-production': Object.freeze({
    id: 'playground-to-production',
    number: 10,
    title: 'From Playground to Production',
    course: 'Production',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Advanced',
    summary: 'Let\'s build something useful and look at an end-to-end workflow for preparing a contract for users: optimize WASM size, deploy to testnet, invoke functions, profile resource usage, handle common CLI/SDK issues, and create a final project that can extend into a real dApp.',
    comingSoon: true,
  }),
});
const ACADEMY_LESSON_ORDER = Object.freeze([
  'foundations-hello-world',
  'ai-assisted-development',
  'agentic-ai-mcp',
  'soroban-state-storage-types',
  'authorization-auth-systems',
  'openzeppelin-token',
  'events-errors-ux',
  'testing-soroban-contracts',
  'stellar-contract-security',
  'playground-to-production',
]);
const ACTIVE_ACADEMY_LESSON_ID = 'foundations-hello-world';
let activeAcademyLessonId = ACTIVE_ACADEMY_LESSON_ID;

let workspaces = [];
let activeWorkspaceId = null;
let files = {};
let currentFile = null;
let isLoadingFile = false;
let tabsInitialized = false;
let openTabs = new Set();
let isApplyingMcpUpdate = false;
let isPublishingMcpSnapshot = false;
let mcpPublishTimer = null;
let mcpHeartbeatTimer = null;
let mcpPollTimer = null;
let mcpLastSeq = 0;
let mcpLastSyncAt = null;

function createWorkspaceId() {
  return `workspace-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeWorkspaceName(name) {
  const trimmed = String(name || '').trim();
  return trimmed || 'Untitled Workspace';
}

function normalizeFilePath(filePath) {
  const normalized = String(filePath || '').trim().replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) {
    throw new Error('File path cannot be empty.');
  }

  const segments = normalized.split('/').filter(Boolean);
  if (!segments.length) {
    throw new Error('File path cannot be empty.');
  }

  segments.forEach((segment) => {
    if (segment === '.' || segment === '..') {
      throw new Error(`Invalid file path: ${filePath}`);
    }
    if (!/^[A-Za-z0-9._-]+$/.test(segment)) {
      throw new Error(`Unsupported characters in file path: ${filePath}`);
    }
  });

  return segments.join('/');
}

function normalizeWorkspaceFiles(inputFiles) {
  const normalizedFiles = {};
  if (!inputFiles || typeof inputFiles !== 'object') {
    return normalizedFiles;
  }

  Object.entries(inputFiles).forEach(([rawPath, rawContent]) => {
    const path = normalizeFilePath(rawPath);
    normalizedFiles[path] = typeof rawContent === 'string' ? rawContent : String(rawContent ?? '');
  });

  return normalizedFiles;
}

function sortFileRank(filePath) {
  if (filePath === 'Cargo.toml') return 0;
  if (filePath === 'src/lib.rs') return 1;
  if (filePath === 'src/test.rs') return 2;
  if (filePath === 'lib.rs') return 3;
  if (filePath === 'test.rs') return 4;
  return 10;
}

function sortFilePaths(filePaths) {
  return [...filePaths].sort((a, b) => {
    const rankDiff = sortFileRank(a) - sortFileRank(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b);
  });
}

function getPreferredFile(fileMap, preferredFile = null) {
  if (preferredFile && fileMap[preferredFile]) {
    return preferredFile;
  }

  // Prefer .rs files for editor focus: lib.rs first, then any .rs
  for (const candidate of ['src/lib.rs', 'lib.rs', 'src/test.rs', 'test.rs']) {
    if (fileMap[candidate]) {
      return candidate;
    }
  }

  // Fall back to any .rs file
  const rsFile = Object.keys(fileMap).find((p) => p.endsWith('.rs'));
  if (rsFile) return rsFile;

  // Last resort: Cargo.toml or first file
  if (fileMap['Cargo.toml']) return 'Cargo.toml';
  return sortFilePaths(Object.keys(fileMap))[0] || null;
}

function getInitialTabs(fileMap, maxTabs = 5) {
  const tabs = [];
  const allPaths = sortFilePaths(Object.keys(fileMap));

  // Cargo.toml always first if it exists
  if (fileMap['Cargo.toml']) tabs.push('Cargo.toml');

  // Then prioritized source files
  const priorities = ['src/lib.rs', 'lib.rs', 'src/test.rs', 'test.rs'];
  for (const candidate of priorities) {
    if (fileMap[candidate] && !tabs.includes(candidate) && tabs.length < maxTabs) {
      tabs.push(candidate);
    }
  }

  // Fill remaining slots with other files
  for (const fp of allPaths) {
    if (tabs.length >= maxTabs) break;
    if (!tabs.includes(fp)) tabs.push(fp);
  }

  return tabs;
}

function createWorkspaceRecord({
  id = createWorkspaceId(),
  name = 'Untitled Workspace',
  files: workspaceFiles = {},
  createdAt = Date.now(),
  updatedAt = Date.now(),
  lastOpenFile = null,
  source = null,
}) {
  const normalizedFiles = normalizeWorkspaceFiles(workspaceFiles);
  return {
    id,
    name: sanitizeWorkspaceName(name),
    files: normalizedFiles,
    createdAt,
    updatedAt,
    lastOpenFile: getPreferredFile(normalizedFiles, lastOpenFile),
    source,
  };
}

function getActiveWorkspace() {
  return workspaces.find((workspace) => workspace.id === activeWorkspaceId) || null;
}

function syncWorkspaceFiles() {
  const workspace = getActiveWorkspace();
  files = workspace ? workspace.files : {};
}

function persistWorkspaceState() {
  syncWorkspaceFiles();
  localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
    version: WORKSPACE_SCHEMA_VERSION,
    activeWorkspaceId,
    workspaces,
  }));
  scheduleMcpPublish();
}

function getMcpSessionId() {
  let sessionId = sessionStorage.getItem(MCP_SESSION_STORAGE_KEY);
  if (!sessionId) {
    sessionId = `mcp-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem(MCP_SESSION_STORAGE_KEY, sessionId);
  }
  return sessionId;
}

function getMcpApiKey() {
  return localStorage.getItem(MCP_API_KEY_STORAGE_KEY) || '';
}

function generateMcpApiKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function formatMcpTime(timestamp) {
  if (!timestamp) return 'Never';
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function setMcpStatus(message, isError = false) {
  const statusEl = document.getElementById('mcp-status');
  if (statusEl) {
    statusEl.textContent = message;
    statusEl.classList.toggle('error', isError);
    statusEl.classList.toggle('success', Boolean(message) && !isError && Boolean(getMcpApiKey()));
  }
  updateMcpConnectionUi(isError ? 'error' : null, message);
}

function updateMcpConnectionUi(stateOverride = null, detailOverride = '') {
  const key = getMcpApiKey();
  const state = document.getElementById('mcp-connection-state');
  const detail = document.getElementById('mcp-connection-detail');
  const dot = document.getElementById('mcp-connection-dot');
  const apiUrl = document.getElementById('mcp-api-url');
  const workspaceCount = document.getElementById('mcp-workspace-count');
  const activeWorkspace = document.getElementById('mcp-active-workspace');
  const lastSync = document.getElementById('mcp-last-sync');
  const workspace = getActiveWorkspace();
  const resolvedState = stateOverride || (key ? (mcpLastSyncAt ? 'connected' : 'configured') : 'idle');

  if (state) {
    state.textContent = resolvedState === 'connected'
      ? 'Browser bridge online'
      : resolvedState === 'error'
        ? 'Connection issue'
        : key
          ? 'Ready to connect'
          : 'Not configured';
  }
  if (detail) {
    detail.textContent = detailOverride || (key
      ? 'Add the npx MCP server to your client and keep this tab open.'
      : 'Generate a key to start the browser bridge.');
  }
  if (dot) {
    dot.classList.toggle('connected', resolvedState === 'connected');
    dot.classList.toggle('error', resolvedState === 'error');
  }
  if (apiUrl) apiUrl.textContent = window.location.origin;
  if (workspaceCount) workspaceCount.textContent = String(workspaces.length);
  if (activeWorkspace) activeWorkspace.textContent = workspace?.name || '-';
  if (lastSync) lastSync.textContent = formatMcpTime(mcpLastSyncAt);
}

function refreshMcpSettingsUi() {
  const keyInput = document.getElementById('mcp-api-key');
  const key = getMcpApiKey();
  if (keyInput) keyInput.value = key;
  updateMcpConnectionUi();
  if (!key) {
    setMcpStatus('Generate a key to expose this browser session to MCP clients.');
  }
}

function setupMcpSettings() {
  refreshMcpSettingsUi();

  const generateButton = document.getElementById('generate-mcp-key');
  if (generateButton) {
    generateButton.addEventListener('click', () => {
      const key = generateMcpApiKey();
      localStorage.setItem(MCP_API_KEY_STORAGE_KEY, key);
      mcpLastSeq = 0;
      refreshMcpSettingsUi();
      publishMcpWorkspaces();
      setMcpStatus('MCP key generated. Keep this browser tab open while agents work.');
    });
  }

  document.querySelectorAll('.ai-copy-button[data-copy-target]').forEach((button) => {
    button.addEventListener('click', async () => {
      const target = document.getElementById(button.dataset.copyTarget);
      const value = target?.value ?? target?.textContent ?? '';
      if (!value.trim()) return;
      try {
        await navigator.clipboard.writeText(value);
        setMcpStatus('Copied to clipboard.');
      } catch (error) {
        setMcpStatus('Could not copy automatically. Select the text instead.', true);
      }
    });
  });

}

let isAiAssistantRunning = false;

function activateAiTab(tabName) {
  document.querySelectorAll('.ai-tab').forEach((tab) => {
    const active = tab.dataset.aiTab === tabName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.ai-tab-view').forEach((view) => {
    view.classList.toggle('active', view.dataset.aiView === tabName);
  });
}

function scrollAiTerminalToBottom() {
  const output = document.getElementById('ai-terminal-output');
  if (!output) return;
  requestAnimationFrame(() => {
    output.scrollTop = output.scrollHeight;
  });
}

function appendAiTerminalLine(text, className = 'system') {
  const output = document.getElementById('ai-terminal-output');
  if (!output) return null;
  output.querySelectorAll('.ai-terminal-line.pending').forEach((line) => {
    line.classList.remove('pending');
  });
  const line = document.createElement('div');
  line.className = `ai-terminal-line ${className}`;
  line.textContent = text;
  output.appendChild(line);
  scrollAiTerminalToBottom();
  return line;
}

function getAiAssistantInputValue() {
  const input = document.getElementById('ai-assistant-input');
  return (input?.innerText || '').replace(/\u00a0/g, ' ').trim();
}

function clearAiAssistantInput() {
  const input = document.getElementById('ai-assistant-input');
  if (input) input.textContent = '';
}

function focusAiAssistantInput() {
  const input = document.getElementById('ai-assistant-input');
  if (!input || input.getAttribute('contenteditable') !== 'true') return;
  input.focus();
  scrollAiTerminalToBottom();
}

function setAiAssistantRunning(running) {
  isAiAssistantRunning = running;
  const input = document.getElementById('ai-assistant-input');
  const submit = document.getElementById('ai-assistant-submit');
  const state = document.getElementById('ai-assistant-state');
  if (input) {
    input.setAttribute('contenteditable', running ? 'false' : 'true');
    input.setAttribute('aria-disabled', running ? 'true' : 'false');
  }
  if (submit) submit.disabled = running;
  if (state) {
    state.textContent = running ? 'running' : 'idle';
    state.classList.toggle('running', running);
  }
}

function handleAiAssistantEvent(payload) {
  const event = payload?.event;
  const data = payload?.data || {};
  if (event === 'status') {
    appendAiTerminalLine(`> ${data.message || 'working'}`, 'system pending');
  } else if (event === 'tool_start') {
    appendAiTerminalLine(`tool: ${data.name}`, 'tool pending');
  } else if (event === 'tool_result') {
    const marker = data.ok ? 'ok' : 'error';
    const suffix = data.message ? ` - ${data.message}` : '';
    appendAiTerminalLine(`tool: ${data.name} ${marker}${suffix}`, data.ok ? 'tool' : 'error');
  } else if (event === 'assistant_message') {
    appendAiTerminalLine(data.message || '(no message)', 'assistant');
  } else if (event === 'complete') {
    appendAiTerminalLine(`> ${data.message || 'Done'}`, 'system');
  } else if (event === 'error') {
    appendAiTerminalLine(`error: ${data.message || 'Assistant request failed'}`, 'error');
  }
}

async function readAiAssistantStream(response) {
  const reader = response.body?.getReader();
  if (!reader) {
    appendAiTerminalLine(await response.text(), response.ok ? 'assistant' : 'error');
    return;
  }
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach((line) => {
      if (!line.trim()) return;
      try {
        handleAiAssistantEvent(JSON.parse(line));
      } catch (error) {
        appendAiTerminalLine(line, 'assistant');
      }
    });
  }
  if (buffer.trim()) {
    try {
      handleAiAssistantEvent(JSON.parse(buffer));
    } catch (error) {
      appendAiTerminalLine(buffer, 'assistant');
    }
  }
}

async function submitAiAssistantPrompt(message) {
  let apiKey = getMcpApiKey();
  if (!apiKey) {
    apiKey = generateMcpApiKey();
    localStorage.setItem(MCP_API_KEY_STORAGE_KEY, apiKey);
    refreshMcpSettingsUi();
    appendAiTerminalLine('> Generated a browser access key for this assistant session.', 'system');
  }
  if (!activeWorkspaceId) {
    appendAiTerminalLine('error: No active workspace is open.', 'error');
    return;
  }

  saveCurrentFile();
  await publishMcpWorkspaces();
  const response = await fetch('/api/ai/assistant', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      session_id: getMcpSessionId(),
      active_workspace_id: activeWorkspaceId,
      message,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    try {
      const payload = JSON.parse(text);
      appendAiTerminalLine(`error: ${payload.error || text}`, 'error');
    } catch (error) {
      appendAiTerminalLine(`error: ${text || response.statusText}`, 'error');
    }
    return;
  }

  await readAiAssistantStream(response);
  await pollMcpChanges();
}

function setupAiAssistant() {
  document.querySelectorAll('.ai-tab').forEach((tab) => {
    tab.addEventListener('click', () => activateAiTab(tab.dataset.aiTab || 'assistant'));
  });
  activateAiTab('assistant');

  const shortcut = document.getElementById('editor-ai-shortcut');
  if (shortcut) {
    shortcut.addEventListener('click', () => {
      activateAiTab('assistant');
      activatePanel('ai-panel', { splitRatio: 0.36 });
    });
  }

  const form = document.getElementById('ai-assistant-form');
  const input = document.getElementById('ai-assistant-input');
  if (form && input) {
    form.addEventListener('click', (event) => {
      if (event.target.closest('button')) return;
      focusAiAssistantInput();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
      event.preventDefault();
      form.requestSubmit();
    });

    input.addEventListener('paste', (event) => {
      event.preventDefault();
      const text = event.clipboardData?.getData('text/plain') || '';
      document.execCommand('insertText', false, text);
    });

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = getAiAssistantInputValue();
      if (!message || isAiAssistantRunning) return;
      clearAiAssistantInput();
      appendAiTerminalLine(`$ ${message}`, 'user');
      setAiAssistantRunning(true);
      try {
        await submitAiAssistantPrompt(message);
      } catch (error) {
        appendAiTerminalLine(`error: ${error?.message || 'Assistant request failed'}`, 'error');
      } finally {
        setAiAssistantRunning(false);
        focusAiAssistantInput();
      }
    });
  }
}

function scheduleMcpPublish() {
  refreshMcpSettingsUi();
  if (isApplyingMcpUpdate || isPublishingMcpSnapshot || !getMcpApiKey()) return;
  clearTimeout(mcpPublishTimer);
  mcpPublishTimer = setTimeout(() => {
    publishMcpWorkspaces();
  }, MCP_PUBLISH_DEBOUNCE_MS);
}

function getMcpWorkspacePayload() {
  saveCurrentFile();
  return workspaces.map((workspace) => ({
    id: workspace.id,
    name: workspace.name,
    files: workspace.files,
    lastOpenFile: workspace.lastOpenFile,
    updatedAt: workspace.updatedAt,
  }));
}

async function publishMcpWorkspaces() {
  const apiKey = getMcpApiKey();
  if (!apiKey || isApplyingMcpUpdate) return;

  try {
    isPublishingMcpSnapshot = true;
    const workspacePayload = getMcpWorkspacePayload();
    isPublishingMcpSnapshot = false;

    const response = await fetch('/api/mcp/v1/browser/heartbeat', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: getMcpSessionId(),
        active_workspace_id: activeWorkspaceId,
        lastSeq: mcpLastSeq,
        workspaces: workspacePayload,
      }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `MCP publish failed (${response.status})`);
    }
    mcpLastSyncAt = Date.now();
    refreshMcpSettingsUi();
    setMcpStatus('MCP bridge connected. Keep this browser tab open while agents work.');
  } catch (error) {
    isPublishingMcpSnapshot = false;
    setMcpStatus(error?.message || 'MCP bridge publish failed.', true);
  }
}

async function pollMcpChanges() {
  const apiKey = getMcpApiKey();
  if (!apiKey || isApplyingMcpUpdate) return;

  try {
    const params = new URLSearchParams({
      session_id: getMcpSessionId(),
      since: String(mcpLastSeq),
    });
    const response = await fetch(`/api/mcp/v1/browser/changes?${params.toString()}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    if (!response.ok) return;
    const payload = await response.json();
    const nextSeq = typeof payload.seq === 'number' ? payload.seq : mcpLastSeq;
    if (Array.isArray(payload.projects) && payload.projects.length) {
      applyMcpProjectUpdates(payload.projects);
    }
    mcpLastSeq = nextSeq;
  } catch (error) {
    console.warn('MCP change polling failed:', error);
  }
}

function applyMcpProjectUpdates(projects) {
  isApplyingMcpUpdate = true;
  try {
    let activeChanged = false;
    projects.forEach((project) => {
      const index = workspaces.findIndex((workspace) => workspace.id === project.id);
      if (index === -1) return;
      const nextFiles = normalizeWorkspaceFiles(project.files || {});
      const nextWorkspace = {
        ...workspaces[index],
        name: sanitizeWorkspaceName(project.name || workspaces[index].name),
        files: nextFiles,
        lastOpenFile: getPreferredFile(nextFiles, project.lastOpenFile || workspaces[index].lastOpenFile),
        updatedAt: project.updatedAt || Date.now(),
      };
      workspaces[index] = nextWorkspace;
      if (project.id === activeWorkspaceId) {
        activeChanged = true;
      }
    });

    localStorage.setItem(WORKSPACE_STORAGE_KEY, JSON.stringify({
      version: WORKSPACE_SCHEMA_VERSION,
      activeWorkspaceId,
      workspaces,
    }));

    if (activeChanged) {
      syncWorkspaceFiles();
      if (currentFile && !files[currentFile]) {
        currentFile = getPreferredFile(files, null);
        openTabs = new Set();
      }
      refreshWorkspaceEditor({ preferredFile: currentFile || getActiveWorkspace()?.lastOpenFile });
    } else {
      renderWorkspaceManager();
    }
    setMcpStatus('Applied remote MCP workspace edits.');
  } finally {
    isApplyingMcpUpdate = false;
  }
}

function startMcpBridge() {
  setupMcpSettings();
  publishMcpWorkspaces();
  clearInterval(mcpHeartbeatTimer);
  clearInterval(mcpPollTimer);
  mcpHeartbeatTimer = setInterval(() => publishMcpWorkspaces(), MCP_HEARTBEAT_MS);
  mcpPollTimer = setInterval(() => pollMcpChanges(), MCP_POLL_MS);
}

async function loadDefaultFiles() {
  const defaultFiles = {};
  const templateFiles = ['Cargo.toml', 'lib.rs', 'test.rs'];
  try {
    for (const fileName of templateFiles) {
      const response = await fetch(`./templates/${fileName}`);
      if (response.ok) {
        const targetPath = fileName === 'Cargo.toml' ? 'Cargo.toml' : `src/${fileName}`;
        defaultFiles[targetPath] = await response.text();
      } else {
        console.error(`Failed to load template ${fileName}: ${response.status}`);
        const targetPath = fileName === 'Cargo.toml' ? 'Cargo.toml' : `src/${fileName}`;
        defaultFiles[targetPath] = '';
      }
    }
  } catch (error) {
    console.error('Error loading templates:', error);
  }
  return defaultFiles;
}

async function createDefaultWorkspace(name = 'Workspace 1') {
  return createWorkspaceRecord({
    name,
    files: await loadDefaultFiles(),
  });
}

function migrateLegacyFiles(legacyFiles) {
  const normalized = normalizeWorkspaceFiles(legacyFiles);
  const migrated = {};

  Object.entries(normalized).forEach(([path, content]) => {
    if (path === 'lib.rs' && !normalized['src/lib.rs']) {
      migrated['src/lib.rs'] = content;
      return;
    }
    if (path === 'test.rs' && !normalized['src/test.rs']) {
      migrated['src/test.rs'] = content;
      return;
    }
    migrated[path] = content;
  });

  return migrated;
}

function hydrateWorkspaceState(storedState) {
  const storedWorkspaces = Array.isArray(storedState?.workspaces) ? storedState.workspaces : [];
  const normalizedWorkspaces = storedWorkspaces
    .map((workspace) => {
      try {
        return createWorkspaceRecord(workspace);
      } catch (error) {
        console.error('Skipping invalid workspace:', error);
        return null;
      }
    })
    .filter((workspace) => workspace && Object.keys(workspace.files).length > 0);

  return {
    workspaces: normalizedWorkspaces,
    activeWorkspaceId: storedState?.activeWorkspaceId || null,
  };
}

async function loadWorkspaceState() {
  let hydrated = null;

  try {
    const stored = localStorage.getItem(WORKSPACE_STORAGE_KEY);
    if (stored) {
      hydrated = hydrateWorkspaceState(JSON.parse(stored));
    }
  } catch (error) {
    console.error('Failed to load workspace state:', error);
  }

  if (!hydrated || hydrated.workspaces.length === 0) {
    try {
      const legacyFiles = localStorage.getItem(LEGACY_FILES_STORAGE_KEY);
      if (legacyFiles) {
        hydrated = {
          workspaces: [
            createWorkspaceRecord({
              name: 'Imported Workspace',
              files: migrateLegacyFiles(JSON.parse(legacyFiles)),
            }),
          ],
          activeWorkspaceId: null,
        };
        localStorage.removeItem(LEGACY_FILES_STORAGE_KEY);
      }
    } catch (error) {
      console.error('Failed to migrate legacy workspace state:', error);
    }
  }

  if (!hydrated || hydrated.workspaces.length === 0) {
    const defaultWorkspace = await createDefaultWorkspace();
    hydrated = {
      workspaces: [defaultWorkspace],
      activeWorkspaceId: defaultWorkspace.id,
    };
  }

  workspaces = hydrated.workspaces;
  activeWorkspaceId = hydrated.activeWorkspaceId && workspaces.some((workspace) => workspace.id === hydrated.activeWorkspaceId)
    ? hydrated.activeWorkspaceId
    : workspaces[0].id;

  syncWorkspaceFiles();
  currentFile = getPreferredFile(files, getActiveWorkspace()?.lastOpenFile || null);
  persistWorkspaceState();
}

function saveCurrentFile() {
  if (!currentFile || !editor || isLoadingFile) {
    return;
  }

  const workspace = getActiveWorkspace();
  if (!workspace) {
    return;
  }

  const currentContent = editor.getValue();
  const didChange = files[currentFile] !== currentContent || workspace.lastOpenFile !== currentFile;
  if (!didChange) {
    return;
  }

  files[currentFile] = currentContent;
  workspace.files = files;
  workspace.lastOpenFile = currentFile;
  workspace.updatedAt = Date.now();
  persistWorkspaceState();
}

function getStoredTheme() {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return storedTheme === 'light' ? 'light' : 'dark';
}

function getMonacoTheme(theme) {
  return theme === 'light' ? 'vs' : 'vs-dark';
}

function updateThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  const isLight = currentTheme === 'light';
  const icon = toggle.querySelector('i');
  if (icon) {
    icon.classList.toggle('fa-sun', !isLight);
    icon.classList.toggle('fa-moon', isLight);
  }
  const nextMode = isLight ? 'dark' : 'light';
  const label = `Switch to ${nextMode} mode`;
  toggle.title = label;
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('aria-pressed', String(isLight));
}

function applyTheme(theme, options = {}) {
  const { persist = true } = options;
  currentTheme = theme === 'light' ? 'light' : 'dark';
  document.body.dataset.theme = currentTheme;
  updateThemeToggle();
  if (persist) {
    localStorage.setItem(THEME_STORAGE_KEY, currentTheme);
  }
  if (editor && window.monaco?.editor) {
    monaco.editor.setTheme(getMonacoTheme(currentTheme));
  }
}

function setupThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
  });
  updateThemeToggle();
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
  const workspace = getActiveWorkspace();
  if (!workspace || currentFile === fileName || !Object.prototype.hasOwnProperty.call(files, fileName)) return;

  saveCurrentFile();

  // Auto-open a tab if not already open
  if (!openTabs.has(fileName)) {
    openTabs.add(fileName);
    addTab(fileName);
  }

  currentFile = fileName;
  workspace.lastOpenFile = fileName;
  const fileContent = files[fileName] || '';

  isLoadingFile = true;
  editor.setValue(fileContent);
  isLoadingFile = false;

  const language = getLanguageFromFileName(fileName);
  monaco.editor.setModelLanguage(editor.getModel(), language);
  updateActiveTab();
  persistWorkspaceState();
  setTimeout(() => checkMenuOverflow(), 10);
  renderWorkspaceManager();
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

function formatWorkspaceTimestamp(timestamp) {
  if (!timestamp) return 'saved just now';
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  if (elapsedMs < 60_000) return 'saved just now';
  const minutes = Math.round(elapsedMs / 60_000);
  if (minutes < 60) return `saved ${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `saved ${hours}h ago`;
  const days = Math.round(hours / 24);
  return `saved ${days}d ago`;
}

function setWorkspaceStatus(message, isError = false) {
  const statusEl = document.getElementById('workspace-status');
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.classList.toggle('error', isError);
}

function getMainSourcePath(fileMap = files) {
  for (const candidate of MAIN_SOURCE_CANDIDATES) {
    if (fileMap[candidate]) {
      return candidate;
    }
  }

  const rustFile = sortFilePaths(Object.keys(fileMap).filter((path) => path.endsWith('.rs')))[0];
  if (rustFile) {
    return rustFile;
  }

  return sortFilePaths(Object.keys(fileMap))[0] || null;
}

function getMainSourceContent(fileMap = files) {
  const mainPath = getMainSourcePath(fileMap);
  return mainPath ? fileMap[mainPath] || '' : '';
}

function refreshWorkspaceEditor(options = {}) {
  const workspace = getActiveWorkspace();
  syncWorkspaceFiles();
  initializeTabs({ preferredFile: options.preferredFile || workspace?.lastOpenFile || null });
  renderWorkspaceManager();
}

function setActiveWorkspace(workspaceId, options = {}) {
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (!workspace) return;

  if (activeWorkspaceId === workspaceId && !options.force) {
    renderWorkspaceManager();
    return;
  }

  saveCurrentFile();
  activeWorkspaceId = workspaceId;
  currentFile = null;
  openTabs = new Set();
  persistWorkspaceState();
  refreshWorkspaceEditor({ preferredFile: options.preferredFile });
}

function createNewFile(fileName, content = '') {
  let normalizedPath;
  try {
    normalizedPath = normalizeFilePath(fileName);
  } catch (error) {
    alert(error.message || 'Invalid file path.');
    return;
  }

  if (files.hasOwnProperty(normalizedPath)) {
    alert('File already exists in this workspace.');
    return;
  }

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  files[normalizedPath] = content;
  openTabs.add(normalizedPath);
  workspace.files = files;
  workspace.lastOpenFile = normalizedPath;
  workspace.updatedAt = Date.now();
  persistWorkspaceState();
  refreshWorkspaceEditor({ preferredFile: normalizedPath });
}

function renameActiveWorkspace(name) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  workspace.name = sanitizeWorkspaceName(name);
  workspace.updatedAt = Date.now();
  persistWorkspaceState();
  renderWorkspaceList();
}

async function createWorkspace(name = null, workspaceFiles = null, source = null) {
  const workspace = workspaceFiles
    ? createWorkspaceRecord({
      name: name || `Workspace ${workspaces.length + 1}`,
      files: workspaceFiles,
      source,
    })
    : await createDefaultWorkspace(name || `Workspace ${workspaces.length + 1}`);

  workspace.source = source;
  workspaces = [workspace, ...workspaces];
  activeWorkspaceId = workspace.id;
  persistWorkspaceState();
  refreshWorkspaceEditor({ preferredFile: workspace.lastOpenFile });
  return workspace;
}

async function deleteWorkspace(workspaceId) {
  const workspace = workspaces.find((item) => item.id === workspaceId);
  if (!workspace) return;

  if (!confirm(`Delete workspace "${workspace.name}"? This cannot be undone.`)) {
    return;
  }

  if (workspaces.length === 1) {
    const replacement = await createDefaultWorkspace();
    workspaces = [replacement];
    activeWorkspaceId = replacement.id;
  } else {
    workspaces = workspaces.filter((item) => item.id !== workspaceId);
    if (activeWorkspaceId === workspaceId) {
      activeWorkspaceId = workspaces[0].id;
    }
  }

  openTabs = new Set();
  persistWorkspaceState();
  setWorkspaceStatus('Workspace deleted.');
  refreshWorkspaceEditor();
}

function mergeFilesIntoActiveWorkspace(importedFiles, options = {}) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  const normalizedFiles = normalizeWorkspaceFiles(importedFiles);
  const filePaths = sortFilePaths(Object.keys(normalizedFiles));
  if (!filePaths.length) {
    throw new Error('No files were found to import.');
  }

  filePaths.forEach((filePath) => {
    files[filePath] = normalizedFiles[filePath];
  });

  workspace.files = files;
  workspace.updatedAt = Date.now();
  workspace.lastOpenFile = options.preferredFile || filePaths[0];
  openTabs = new Set();
  persistWorkspaceState();
  refreshWorkspaceEditor({ preferredFile: workspace.lastOpenFile });
}

function replaceActiveWorkspaceFiles(nextFiles, options = {}) {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  files = normalizeWorkspaceFiles(nextFiles);
  openTabs = new Set();
  workspace.files = files;
  workspace.updatedAt = Date.now();
  workspace.lastOpenFile = getPreferredFile(files, options.preferredFile || null);
  if (options.name) {
    workspace.name = sanitizeWorkspaceName(options.name);
  }
  if (options.source !== undefined) {
    workspace.source = options.source;
  }
  persistWorkspaceState();
  refreshWorkspaceEditor({ preferredFile: workspace.lastOpenFile });
}

function addTab(fileName) {
  const tabsContainer = document.getElementById('editor-tabs');
  const addButton = document.getElementById('add-tab');
  if (!tabsContainer || !addButton) return;

  // Don't add duplicate tabs
  if (tabsContainer.querySelector(`.editor-tab[data-file="${CSS.escape(fileName)}"]`)) return;

  const tab = document.createElement('div');
  tab.className = 'editor-tab';
  tab.dataset.file = fileName;

  const tabName = document.createElement('span');
  tabName.className = 'tab-name';
  tabName.textContent = fileName;
  tab.appendChild(tabName);

  const tabClose = document.createElement('span');
  tabClose.className = 'tab-close';
  tabClose.innerHTML = '&times;';
  tabClose.title = 'Close tab';
  tab.appendChild(tabClose);

  tabClose.addEventListener('click', (event) => {
    event.stopPropagation();
    closeTab(fileName);
  });

  tab.addEventListener('click', () => {
    switchToFile(fileName);
  });

  tabsContainer.insertBefore(tab, addButton);
  setTimeout(() => checkMenuOverflow(), 10);
}

function closeTab(fileName) {
  openTabs.delete(fileName);

  // Remove the tab element
  const tab = document.querySelector(`.editor-tab[data-file="${CSS.escape(fileName)}"]`);
  if (tab) tab.remove();

  // If this was the active file, switch to another open tab
  if (currentFile === fileName) {
    currentFile = null;
    const remaining = [...openTabs];
    if (remaining.length > 0) {
      const next = getPreferredFile(
        Object.fromEntries(remaining.filter((f) => files[f]).map((f) => [f, files[f]])),
        null
      );
      if (next) {
        switchToFile(next);
        return;
      }
    }
    // No tabs left — clear editor
    if (editor) {
      isLoadingFile = true;
      editor.setValue('');
      isLoadingFile = false;
    }
  }

  setTimeout(() => checkMenuOverflow(), 10);
  renderWorkspaceManager();
}

function deleteFile(fileName) {
  if (fileName === 'Cargo.toml') {
    alert('Cannot delete Cargo.toml. The project manifest is required.');
    return;
  }

  if (Object.keys(files).length <= 1) {
    alert('Cannot delete the last file in the workspace.');
    return;
  }

  if (!confirm(`Delete "${fileName}" from this workspace?`)) {
    return;
  }

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  // Close the tab if open
  if (openTabs.has(fileName)) {
    closeTab(fileName);
  }

  if (currentFile === fileName) {
    currentFile = null;
  }

  delete files[fileName];
  workspace.files = files;
  workspace.updatedAt = Date.now();
  workspace.lastOpenFile = getPreferredFile(files, currentFile);
  persistWorkspaceState();
  refreshWorkspaceEditor({ preferredFile: workspace.lastOpenFile });
}

function renameFile(oldPath) {
  const newName = prompt('Rename file to:', oldPath);
  if (!newName || newName.trim() === oldPath) return;

  let normalizedPath;
  try {
    normalizedPath = normalizeFilePath(newName.trim());
  } catch (error) {
    alert(error.message || 'Invalid file path.');
    return;
  }

  if (normalizedPath === oldPath) return;

  if (files.hasOwnProperty(normalizedPath)) {
    alert('A file with that name already exists.');
    return;
  }

  const workspace = getActiveWorkspace();
  if (!workspace) return;

  const content = files[oldPath];
  delete files[oldPath];
  files[normalizedPath] = content;

  // Update open tabs
  if (openTabs.has(oldPath)) {
    openTabs.delete(oldPath);
    openTabs.add(normalizedPath);
  }

  if (currentFile === oldPath) {
    currentFile = normalizedPath;
  }

  workspace.files = files;
  workspace.lastOpenFile = currentFile || normalizedPath;
  workspace.updatedAt = Date.now();
  persistWorkspaceState();
  refreshWorkspaceEditor({ preferredFile: workspace.lastOpenFile });
}

function renderWorkspaceList() {
  const listEl = document.getElementById('workspace-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  workspaces.forEach((workspace) => {
    const isActive = workspace.id === activeWorkspaceId;

    const item = document.createElement('div');
    item.className = 'workspace-list-item';
    if (isActive) {
      item.classList.add('active');
    }

    const title = document.createElement('span');
    title.className = 'workspace-list-name';
    title.textContent = workspace.name;

    const meta = document.createElement('span');
    meta.className = 'workspace-list-meta';
    meta.textContent = `${Object.keys(workspace.files).length} files · ${formatWorkspaceTimestamp(workspace.updatedAt)}`;

    item.appendChild(title);
    item.appendChild(meta);

    if (isActive) {
      title.title = 'Click to rename';
      title.style.cursor = 'text';
      title.addEventListener('click', (event) => {
        event.stopPropagation();
        if (item.querySelector('.ws-rename-input')) return;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'ws-rename-input';
        input.value = workspace.name;
        const commitRename = () => {
          const newName = input.value.trim();
          if (newName && newName !== workspace.name) {
            renameActiveWorkspace(newName);
          }
          renderWorkspaceList();
        };
        input.addEventListener('blur', commitRename);
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
          if (e.key === 'Escape') { input.value = workspace.name; input.blur(); }
        });
        title.replaceWith(input);
        input.focus();
        input.select();
      });
    } else {
      item.style.cursor = 'pointer';
      item.addEventListener('click', () => {
        setActiveWorkspace(workspace.id);
      });
    }

    listEl.appendChild(item);
  });
}

const _expandedDirs = new Set();

function _buildFileTree(filePaths) {
  const tree = {};
  filePaths.forEach((fp) => {
    const parts = fp.split('/');
    let node = tree;
    parts.forEach((part, i) => {
      if (i === parts.length - 1) {
        node[part] = fp;
      } else {
        if (!node[part] || typeof node[part] === 'string') {
          node[part] = {};
        }
        node[part] = node[part];
        node = node[part];
      }
    });
  });
  return tree;
}

function _getFileIcon(fileName) {
  if (fileName.endsWith('.rs')) return 'fas fa-code';
  if (fileName.endsWith('.toml')) return 'fas fa-cog';
  if (fileName.endsWith('.json')) return 'fas fa-code';
  if (fileName.endsWith('.md')) return 'fas fa-file-alt';
  if (fileName.endsWith('.lock')) return 'fas fa-lock';
  return 'fas fa-file-code';
}

function _autoExpandForCurrentFile() {
  if (!currentFile || !currentFile.includes('/')) return;
  const parts = currentFile.split('/');
  let path = '';
  for (let i = 0; i < parts.length - 1; i++) {
    path = path ? path + '/' + parts[i] : parts[i];
    _expandedDirs.add(path);
  }
}

function _renderTreeNode(container, tree, depth, parentPath) {
  const dirs = [];
  const fileEntries = [];
  Object.keys(tree).forEach((key) => {
    if (typeof tree[key] === 'object') {
      dirs.push(key);
    } else {
      fileEntries.push({ name: key, fullPath: tree[key] });
    }
  });
  dirs.sort((a, b) => a.localeCompare(b));
  fileEntries.sort((a, b) => {
    const ra = sortFileRank(a.fullPath);
    const rb = sortFileRank(b.fullPath);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });

  dirs.forEach((dirName) => {
    const dirPath = parentPath ? parentPath + '/' + dirName : dirName;
    const isExpanded = _expandedDirs.has(dirPath);

    const dirRow = document.createElement('div');
    dirRow.className = 'ws-tree-dir';

    const dirButton = document.createElement('button');
    dirButton.type = 'button';
    dirButton.className = 'ws-tree-dir-btn';
    dirButton.style.paddingLeft = (8 + depth * 16) + 'px';
    dirButton.innerHTML =
      '<span class="ws-tree-chevron' + (isExpanded ? ' expanded' : '') + '"><i class="fas fa-chevron-right"></i></span>' +
      '<span class="ws-tree-dir-icon"><i class="fas fa-folder' + (isExpanded ? '-open' : '') + '"></i></span>' +
      '<span class="ws-tree-label">' + dirName + '</span>';
    dirButton.addEventListener('click', () => {
      if (_expandedDirs.has(dirPath)) {
        _expandedDirs.delete(dirPath);
      } else {
        _expandedDirs.add(dirPath);
      }
      renderWorkspaceFiles();
    });
    dirRow.appendChild(dirButton);
    container.appendChild(dirRow);

    if (isExpanded) {
      _renderTreeNode(container, tree[dirName], depth + 1, dirPath);
    }
  });

  fileEntries.forEach(({ name, fullPath }) => {
    const row = document.createElement('div');
    row.className = 'ws-tree-file' + (fullPath === currentFile ? ' active' : '');

    const openButton = document.createElement('button');
    openButton.type = 'button';
    openButton.className = 'ws-tree-file-btn';
    openButton.style.paddingLeft = (28 + depth * 16) + 'px';
    openButton.innerHTML =
      '<span class="ws-tree-file-icon"><i class="' + _getFileIcon(name) + '"></i></span>' +
      '<span class="ws-tree-label">' + name + '</span>';
    openButton.addEventListener('click', () => switchToFile(fullPath));
    row.appendChild(openButton);

    if (fullPath !== 'Cargo.toml') {
      const actions = document.createElement('div');
      actions.className = 'ws-tree-actions';

      const renameBtn = document.createElement('button');
      renameBtn.type = 'button';
      renameBtn.className = 'ws-tree-action-btn';
      renameBtn.innerHTML = '<i class="fas fa-pen"></i>';
      renameBtn.title = 'Rename / Move';
      renameBtn.addEventListener('click', (e) => { e.stopPropagation(); renameFile(fullPath); });
      actions.appendChild(renameBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'ws-tree-action-btn ws-tree-action-danger';
      deleteBtn.innerHTML = '<i class="fas fa-trash"></i>';
      deleteBtn.title = 'Delete';
      deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteFile(fullPath); });
      actions.appendChild(deleteBtn);

      row.appendChild(actions);
    }

    container.appendChild(row);
  });
}

function renderWorkspaceFiles() {
  const workspace = getActiveWorkspace();
  const filesEl = document.getElementById('workspace-files');
  if (!filesEl || !workspace) return;
  filesEl.innerHTML = '';
  _autoExpandForCurrentFile();

  const filePaths = sortFilePaths(Object.keys(workspace.files));
  if (!filePaths.length) {
    const empty = document.createElement('div');
    empty.className = 'workspace-empty-state';
    empty.textContent = 'This workspace has no files yet.';
    filesEl.appendChild(empty);
    return;
  }

  const tree = _buildFileTree(filePaths);
  _renderTreeNode(filesEl, tree, 0, '');
}

function renderWorkspaceManager() {
  const workspace = getActiveWorkspace();
  if (!workspace) return;

  const deleteButton = document.getElementById('delete-workspace');
  if (deleteButton) {
    deleteButton.disabled = workspaces.length === 1;
  }

  renderWorkspaceList();
  renderWorkspaceFiles();
}

function initializeTabs(options = {}) {
  const tabsContainer = document.getElementById('editor-tabs');
  if (!tabsContainer) return;

  tabsContainer.querySelectorAll('.editor-tab').forEach((tab) => tab.remove());

  // If we have a specific preferred file from user action, ensure it's in the open tabs
  const preferred = options.preferredFile || null;

  // On workspace load (no preferredFile override), pick smart initial tabs
  if (!preferred && openTabs.size === 0) {
    const initial = getInitialTabs(files);
    initial.forEach((fp) => openTabs.add(fp));
  }

  // If preferred file is specified, make sure it's in open tabs
  if (preferred && files[preferred]) {
    openTabs.add(preferred);
  }

  // Remove any tabs for files that no longer exist
  for (const fp of openTabs) {
    if (!files[fp]) openTabs.delete(fp);
  }

  // Render tabs in sorted order
  sortFilePaths([...openTabs]).forEach((fileName) => {
    addTab(fileName);
  });

  if (!tabsInitialized) {
    const addButton = document.getElementById('add-tab');
    if (addButton) {
      addButton.addEventListener('click', () => {
        const fileName = prompt('Enter a file path (for example: src/lib.rs, src/utils.rs, shop/lib.rs):');
        if (fileName && fileName.trim()) {
          createNewFile(fileName.trim());
        }
      });
    }
    tabsInitialized = true;
  }

  const focusFile = getPreferredFile(files, preferred || currentFile);
  currentFile = null;
  if (focusFile) {
    // Ensure the focus file has a tab
    if (!openTabs.has(focusFile)) {
      openTabs.add(focusFile);
      addTab(focusFile);
    }
    switchToFile(focusFile);
  } else if (editor) {
    isLoadingFile = true;
    editor.setValue('');
    isLoadingFile = false;
  }

  setTimeout(() => checkMenuOverflow(), 100);
}

function loadAcademyProgress() {
  try {
    const stored = localStorage.getItem(ACADEMY_PROGRESS_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('Failed to load academy progress:', error);
    return {};
  }
}

function saveAcademyProgress() {
  localStorage.setItem(ACADEMY_PROGRESS_KEY, JSON.stringify(academyProgress));
}

function getAcademyLessons() {
  return ACADEMY_LESSON_ORDER.map((lessonId) => ACADEMY_LESSONS[lessonId]).filter(Boolean);
}

function getAcademyLesson(lessonId = activeAcademyLessonId) {
  return ACADEMY_LESSONS[lessonId] || ACADEMY_LESSONS[ACTIVE_ACADEMY_LESSON_ID];
}

function getAcademyLessonProgress(lessonId = ACTIVE_ACADEMY_LESSON_ID) {
  return academyProgress[lessonId] || {};
}

function setAcademyLessonProgress(lessonId, patch) {
  academyProgress = {
    ...academyProgress,
    [lessonId]: {
      ...getAcademyLessonProgress(lessonId),
      ...patch,
      updatedAt: Date.now(),
    },
  };
  saveAcademyProgress();
  renderAcademyProgress();
}

function setAcademyStatus(message, type = 'muted') {
  const statusEl = document.getElementById('academy-verification-status');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.remove('error', 'success');
  if (type === 'error' || type === 'success') {
    statusEl.classList.add(type);
  }
}

function setAcademyStepState(elementId, done, doneText, pendingText) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = done ? doneText : pendingText;
  element.classList.toggle('complete', Boolean(done));
}

function getAcademyLessonCompletion(lesson) {
  return Boolean(getAcademyLessonProgress(lesson.id).completedAt);
}

function getAcademyAvailableLessons() {
  return getAcademyLessons().filter((lesson) => !lesson.comingSoon);
}

function getAcademyCourseProgressPercent() {
  const availableLessons = getAcademyAvailableLessons();
  if (!availableLessons.length) return 0;
  const completedCount = availableLessons.filter(getAcademyLessonCompletion).length;
  return Math.round((completedCount / availableLessons.length) * 100);
}

function setElementText(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) element.textContent = value;
}

function createAcademyElement(tagName, className = '', text = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function renderAcademyCurriculum() {
  const container = document.getElementById('academy-curriculum-list');
  if (!container) return;

  container.innerHTML = '';
  const lessons = getAcademyLessons();
  const columns = [lessons.slice(0, 5), lessons.slice(5)];

  columns.forEach((columnLessons) => {
    const list = createAcademyElement('div', 'academy-lesson-list');
    columnLessons.forEach((lesson) => {
      const progress = getAcademyLessonProgress(lesson.id);
      const completed = Boolean(progress.completedAt);
      const active = lesson.id === activeAcademyLessonId;
      const row = createAcademyElement('button', 'academy-course-row');
      row.type = 'button';
      row.dataset.lessonId = lesson.id;
      row.classList.toggle('active', active);
      row.classList.toggle('done', completed);
      row.classList.toggle('coming-soon', Boolean(lesson.comingSoon));
      row.setAttribute('aria-pressed', active ? 'true' : 'false');

      const iconClass = lesson.comingSoon ? 'fas fa-lock' : lesson.format?.includes('Video') ? 'fas fa-play' : 'fas fa-file-lines';
      const statusIcon = lesson.comingSoon ? 'far fa-clock' : completed ? 'fas fa-check-circle' : active ? 'fas fa-circle' : 'far fa-circle';
      row.innerHTML = `
        <span class="academy-lesson-number">${lesson.number}</span>
        <i class="${iconClass}" aria-hidden="true"></i>
        <strong></strong>
        <span></span>
        <span></span>
        <i class="${statusIcon}" aria-hidden="true"></i>
      `;
      row.querySelector('strong').textContent = lesson.title;
      const detailSpans = row.querySelectorAll('span:not(.academy-lesson-number)');
      detailSpans[0].textContent = lesson.comingSoon ? 'Soon' : lesson.format;
      detailSpans[1].textContent = lesson.duration;
      row.addEventListener('click', () => selectAcademyLesson(lesson.id));
      list.appendChild(row);
    });
    container.appendChild(list);
  });
}

function renderAcademyLessonGuide(lesson) {
  const guide = document.getElementById('academy-lesson-guide');
  if (!guide) return;

  guide.innerHTML = '';
  const heading = createAcademyElement('div', 'academy-guide-heading');
  const headingCopy = createAcademyElement('div');
  const eyebrow = createAcademyElement('span', 'academy-eyebrow', `Lesson ${lesson.number} - ${lesson.course}`);
  const title = createAcademyElement('h2', '', lesson.title);
  const summary = createAcademyElement('p', '', lesson.summary);
  headingCopy.append(eyebrow, title, summary);
  const state = createAcademyElement('span', 'academy-guide-state', lesson.comingSoon ? 'Coming soon' : getAcademyLessonCompletion(lesson) ? 'Completed' : 'Available');
  if (lesson.comingSoon) state.classList.add('coming-soon');
  if (getAcademyLessonCompletion(lesson)) state.classList.add('complete');
  heading.append(headingCopy, state);
  guide.appendChild(heading);

  if (lesson.comingSoon) {
    const soon = createAcademyElement('div', 'academy-coming-soon-note');
    soon.innerHTML = '<i class="far fa-clock" aria-hidden="true"></i><span>This lesson is planned and will be added to the Academy soon.</span>';
    guide.appendChild(soon);
    return;
  }

  const body = createAcademyElement('div', 'academy-guide-body');
  const outcomes = createAcademyElement('section', 'academy-guide-section');
  outcomes.appendChild(createAcademyElement('h3', '', 'Learning Goals'));
  const goalsList = createAcademyElement('ul');
  lesson.objectives.forEach((objective) => {
    goalsList.appendChild(createAcademyElement('li', '', objective));
  });
  outcomes.appendChild(goalsList);

  const steps = createAcademyElement('section', 'academy-guide-section academy-guide-steps');
  steps.appendChild(createAcademyElement('h3', '', 'Lesson Path'));
  lesson.sections.forEach((section) => {
    const article = createAcademyElement('article', 'academy-guide-step');
    article.appendChild(createAcademyElement('h4', '', section.title));
    article.appendChild(createAcademyElement('p', '', section.body));
    article.appendChild(createAcademyElement('span', 'academy-guide-action', section.action));
    steps.appendChild(article);
  });

  const practice = createAcademyElement('section', 'academy-guide-section');
  practice.appendChild(createAcademyElement('h3', '', 'Practice Checklist'));
  const practiceList = createAcademyElement('ul');
  lesson.practice.forEach((item) => {
    practiceList.appendChild(createAcademyElement('li', '', item));
  });
  practice.appendChild(practiceList);

  body.append(outcomes, steps, practice);
  guide.appendChild(body);
}

function renderAcademyTooling(lesson) {
  const isComingSoon = Boolean(lesson.comingSoon);
  const primaryButton = document.getElementById('academy-import-code');
  const testButton = document.getElementById('academy-run-tests');
  const compileButton = document.getElementById('academy-compile-code');
  const deployButton = document.getElementById('academy-open-deploy');
  const verifyRow = document.getElementById('academy-verify-row');
  const verifyButton = document.getElementById('academy-verify-contract');
  const markButton = document.getElementById('academy-mark-complete');
  const contractInput = document.getElementById('academy-contract-id');
  const envBox = document.getElementById('academy-env-box');
  const liveTitle = document.getElementById('academy-live-title');
  const liveDescription = document.getElementById('academy-live-description');

  if (primaryButton) {
    const primaryLabel = primaryButton.querySelector('strong');
    const primaryHelp = primaryButton.querySelector('small');
    if (lesson.primaryAction === 'ai-assistant') {
      if (primaryLabel) primaryLabel.textContent = 'Open AI Assistant';
      if (primaryHelp) primaryHelp.textContent = 'Prompt the workspace assistant';
    } else if (lesson.primaryAction === 'mcp-setup') {
      if (primaryLabel) primaryLabel.textContent = 'Open MCP Setup';
      if (primaryHelp) primaryHelp.textContent = 'Connect Claude Code or Codex';
    } else {
      if (primaryLabel) primaryLabel.textContent = 'Open Course Material';
      if (primaryHelp) primaryHelp.textContent = 'Load lesson files into the editor';
    }
    primaryButton.disabled = isComingSoon;
  }

  [testButton, compileButton, deployButton].forEach((button) => {
    if (button) button.disabled = isComingSoon;
  });

  if (deployButton) {
    const label = deployButton.querySelector('strong');
    const help = deployButton.querySelector('small');
    if (lesson.primaryAction === 'mcp-setup') {
      if (label) label.textContent = 'Review Workspace';
      if (help) help.textContent = 'Return to the file editor';
    } else {
      if (label) label.textContent = 'Deploy Contract';
      if (help) help.textContent = 'Open the Testnet deploy flow';
    }
  }

  const needsDeployment = lesson.completionMode === 'deploy';
  if (envBox) envBox.hidden = isComingSoon || !needsDeployment;
  if (verifyRow) verifyRow.hidden = isComingSoon || !needsDeployment;
  if (verifyButton) verifyButton.disabled = isComingSoon || !needsDeployment;
  if (contractInput && activeAcademyLessonId !== lesson.id) contractInput.value = '';
  if (markButton) {
    markButton.hidden = isComingSoon || needsDeployment;
    markButton.disabled = isComingSoon;
  }
  if (liveTitle) liveTitle.textContent = isComingSoon ? 'Coming Soon' : needsDeployment ? 'Live Environment' : 'Lesson Completion';
  if (liveDescription) {
    liveDescription.textContent = isComingSoon
      ? 'This lesson is planned and will be added soon.'
      : needsDeployment
      ? 'Practice and test in a real Soroban environment.'
      : 'Mark this lesson complete after you finish the checklist.';
  }
}

function renderAcademyProgress() {
  const lesson = getAcademyLesson();
  const progress = getAcademyLessonProgress(lesson.id);
  const completed = Boolean(progress.completedAt);
  const videoStarted = Boolean(progress.videoStartedAt);
  const codeImported = Boolean(progress.codeImportedAt);
  const completedSteps = [videoStarted, codeImported, completed].filter(Boolean).length;
  const lessonPercent = lesson.comingSoon ? 0 : Math.round((completedSteps / 3) * 100);
  const coursePercent = getAcademyCourseProgressPercent();
  const availableLessons = getAcademyAvailableLessons();
  const completedCount = availableLessons.filter(getAcademyLessonCompletion).length;

  const percentEl = document.getElementById('academy-progress-percent');
  const bottomPercentEl = document.getElementById('academy-bottom-progress-percent');
  const completedCountEl = document.getElementById('academy-completed-count');
  const ringEl = document.querySelector('.academy-ring');
  const fillEl = document.getElementById('academy-progress-fill');
  const stateEl = document.getElementById('academy-lesson-state');
  const verifiedLink = document.getElementById('academy-verified-link');
  const contractInput = document.getElementById('academy-contract-id');

  setElementText('academy-featured-course', lesson.course);
  setElementText('academy-featured-title', lesson.title);
  setElementText('academy-featured-summary', lesson.summary);
  setElementText('academy-featured-level', lesson.level);
  setElementText('academy-featured-count', `${getAcademyLessons().length} lessons`);
  setElementText('academy-featured-time', 'First 3 available');
  setElementText('academy-featured-format', lesson.format);
  setElementText('academy-current-video-title', `Lesson ${lesson.number}: ${lesson.videoTitle || lesson.title}`);
  setElementText('academy-lesson-count', `${completedCount} / ${availableLessons.length}`);
  setElementText('academy-total-time', '95m');

  if (percentEl) percentEl.textContent = `${coursePercent}%`;
  if (bottomPercentEl) bottomPercentEl.textContent = `${coursePercent}%`;
  if (completedCountEl) completedCountEl.textContent = String(completedCount);
  if (ringEl) ringEl.style.background = `conic-gradient(var(--accent-color) ${coursePercent * 3.6}deg, rgba(255, 255, 255, 0.12) ${coursePercent * 3.6}deg)`;
  if (fillEl) fillEl.style.width = `${coursePercent}%`;
  if (stateEl) {
    stateEl.textContent = lesson.comingSoon ? 'Coming soon' : completed ? 'Completed' : lessonPercent > 0 ? 'In progress' : 'Not started';
    stateEl.classList.toggle('complete', completed);
  }

  setAcademyStepState('academy-video-progress', videoStarted, 'Started', 'Not started');
  setAcademyStepState('academy-import-progress', codeImported, 'Code imported', 'Code not imported');
  setAcademyStepState(
    'academy-complete-progress',
    completed,
    lesson.completionMode === 'deploy' ? 'Deployment verified' : 'Lesson completed',
    lesson.completionMode === 'deploy' ? 'Deployment not verified' : 'Checklist not completed',
  );

  if (progress.contractId && contractInput && !contractInput.value) {
    contractInput.value = progress.contractId;
  }
  if (verifiedLink) {
    if (progress.contractId) {
      verifiedLink.href = `${ACADEMY_TESTNET_EXPERT_BASE}/${progress.contractId}`;
      verifiedLink.classList.add('visible');
    } else {
      verifiedLink.classList.remove('visible');
    }
  }
  renderAcademyCurriculum();
  renderAcademyLessonGuide(lesson);
  renderAcademyTooling(lesson);
}

function loadYouTubeIframeApi() {
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (academyYoutubeApiPromise) {
    return academyYoutubeApiPromise;
  }
  academyYoutubeApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') previousReady();
      resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  });
  return academyYoutubeApiPromise;
}

async function initAcademyVideo() {
  const lesson = getAcademyLesson();
  const stage = document.getElementById('academy-video-stage');
  if (!stage) return;

  if (academyYoutubePlayer && typeof academyYoutubePlayer.destroy === 'function') {
    academyYoutubePlayer.destroy();
    academyYoutubePlayer = null;
  }

  if (!lesson.videoId) {
    stage.innerHTML = `
      <div class="academy-video-placeholder">
        <i class="fab fa-youtube"></i>
        <span>${lesson.comingSoon ? 'This lesson is coming soon.' : 'Written lesson ready. Video will appear here when available.'}</span>
      </div>
    `;
    return;
  }

  stage.innerHTML = '<div id="academy-youtube-player"></div>';
  try {
    const yt = await loadYouTubeIframeApi();
    academyYoutubePlayer = new yt.Player('academy-youtube-player', {
      videoId: lesson.videoId,
      playerVars: {
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onStateChange: (event) => {
          if (event.data === yt.PlayerState.PLAYING) {
            setAcademyLessonProgress(lesson.id, { videoStartedAt: Date.now() });
          }
        },
      },
    });
  } catch (error) {
    console.error('Failed to initialize academy video:', error);
    stage.innerHTML = `
      <div class="academy-video-placeholder">
        <i class="fab fa-youtube"></i>
        <span>Video could not be loaded.</span>
      </div>
    `;
  }
}

function selectAcademyLesson(lessonId) {
  activeAcademyLessonId = ACADEMY_LESSONS[lessonId] ? lessonId : ACTIVE_ACADEMY_LESSON_ID;
  setAcademyStatus('');
  renderAcademyProgress();
  initAcademyVideo();
}

function openAcademyPrimaryTool() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon) return;

  if (lesson.primaryAction === 'ai-assistant') {
    activateAiTab('assistant');
    activatePanel('ai-panel', { splitRatio: 0.36 });
    return;
  }

  if (lesson.primaryAction === 'mcp-setup') {
    activateAiTab('mcp');
    activatePanel('ai-panel', { splitRatio: 0.44 });
    return;
  }

  importAcademyLessonCode();
}

async function importAcademyLessonCode() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon) {
    setAcademyStatus('This lesson is coming soon.');
    return;
  }
  if (!lesson.githubUrl) {
    openAcademyPrimaryTool();
    return;
  }
  const button = document.getElementById('academy-import-code');
  if (button) button.disabled = true;
  setAcademyStatus(`Importing ${lesson.title} from GitHub...`);
  try {
    await loadWorkspaceFromGithub(lesson.githubUrl, { createNew: true });
    setAcademyLessonProgress(lesson.id, { codeImportedAt: Date.now() });
    setWorkspaceStatus('Academy lesson code imported.');
    activatePanel('create-panel', { resetSplit: true });
    setAcademyStatus('Code imported. Run the tests next.', 'success');
  } catch (error) {
    setAcademyStatus(error?.message || 'Failed to import lesson code.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function runAcademyTests() {
  if (getAcademyLesson().comingSoon) return;
  activatePanel('test-panel', { splitRatio: 0.38 });
  await runTests();
}

async function compileAcademyCode() {
  if (getAcademyLesson().comingSoon) return;
  activatePanel('build-panel', { splitRatio: 0.38 });
  await compileCode();
}

function openAcademyDeploy() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon) return;
  if (lesson.primaryAction === 'mcp-setup') {
    activatePanel('create-panel', { resetSplit: true });
    return;
  }
  setActiveNetwork('TESTNET', { persist: true, logToDeployConsole: true });
  activatePanel('deploy-panel', { splitRatio: 0.38 });
}

function isValidContractId(contractId) {
  if (!contractId) return false;
  if (StellarSdk.StrKey?.isValidContract) {
    return StellarSdk.StrKey.isValidContract(contractId);
  }
  try {
    StellarSdk.StrKey.decodeContract(contractId);
    return true;
  } catch {
    return false;
  }
}

async function verifyAcademyContract() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon || lesson.completionMode !== 'deploy') return;
  const input = document.getElementById('academy-contract-id');
  const button = document.getElementById('academy-verify-contract');
  const contractId = input?.value.trim();

  if (!isValidContractId(contractId)) {
    setAcademyStatus('Enter a valid Stellar contract id that starts with C.', 'error');
    return;
  }

  if (button) button.disabled = true;
  setAcademyStatus('Checking Testnet for the deployed hello world contract...');
  try {
    const client = await StellarSdk.contract.Client.from({
      contractId,
      rpcUrl: ACADEMY_TESTNET_RPC_URL,
      networkPassphrase: StellarSdk.Networks.TESTNET,
    });
    const methodNames = client.spec.funcs().map((fn) => fn.name().toString());
    const missingMethods = (lesson.expectedMethods || []).filter((method) => !methodNames.includes(method));
    if (missingMethods.length) {
      throw new Error(`Contract found, but it is missing: ${missingMethods.join(', ')}.`);
    }
    setAcademyLessonProgress(lesson.id, {
      completedAt: Date.now(),
      contractId,
    });
    setAcademyStatus('Lesson complete. Testnet deployment verified.', 'success');
  } catch (error) {
    console.error(error);
    setAcademyStatus(error?.message || 'Could not verify this Testnet contract.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function completeAcademyLesson() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon || lesson.completionMode === 'deploy') return;
  setAcademyLessonProgress(lesson.id, {
    completedAt: Date.now(),
    videoStartedAt: getAcademyLessonProgress(lesson.id).videoStartedAt || Date.now(),
  });
  setAcademyStatus('Lesson marked complete.', 'success');
}

function setupAcademy() {
  renderAcademyProgress();
  initAcademyVideo();

  const importButton = document.getElementById('academy-import-code');
  const continueButton = document.getElementById('academy-continue-course');
  const testButton = document.getElementById('academy-run-tests');
  const compileButton = document.getElementById('academy-compile-code');
  const deployButton = document.getElementById('academy-open-deploy');
  const verifyButton = document.getElementById('academy-verify-contract');
  const markButton = document.getElementById('academy-mark-complete');
  const contractInput = document.getElementById('academy-contract-id');

  if (importButton) importButton.addEventListener('click', openAcademyPrimaryTool);
  if (continueButton) continueButton.addEventListener('click', openAcademyPrimaryTool);
  if (testButton) testButton.addEventListener('click', runAcademyTests);
  if (compileButton) compileButton.addEventListener('click', compileAcademyCode);
  if (deployButton) deployButton.addEventListener('click', openAcademyDeploy);
  if (verifyButton) verifyButton.addEventListener('click', verifyAcademyContract);
  if (markButton) markButton.addEventListener('click', completeAcademyLesson);
  if (contractInput) {
    contractInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        verifyAcademyContract();
      }
    });
    contractInput.addEventListener('input', () => setAcademyStatus(''));
  }
}

require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
require(['vs/editor/editor.main'], async function () {
  editor = monaco.editor.create(document.getElementById('editor'), {
    value: ``,
    language: 'rust',
    theme: getMonacoTheme(currentTheme),
    automaticLayout: true,
    fontSize: 14,
    minimap: {
      enabled: true
    },
    autoIndent: 'full',
    contextmenu: true,
    fontFamily: 'monospace',
  });

  await loadWorkspaceState();

  editor.onDidChangeModelContent(() => {
    saveCurrentFile();
  });

  initializeTabs();
  renderWorkspaceManager();
  init();

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

const ANSI_BASE_COLORS = Object.freeze([
  '#000000', '#aa0000', '#00aa00', '#aa5500', '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa'
]);
const ANSI_BRIGHT_COLORS = Object.freeze([
  '#555555', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff'
]);
const ansiConsoleStates = new WeakMap();

function createDefaultAnsiStyle() {
  return {
    bold: false,
    faint: false,
    italic: false,
    underline: false,
    inverse: false,
    fg: null,
    bg: null
  };
}

function setAnsiColor(state, isFg, color) {
  if (isFg) {
    state.fg = color;
  } else {
    state.bg = color;
  }
}

function ansi256ColorToCss(index) {
  const value = Math.max(0, Math.min(255, index));
  if (value < 16) {
    return value < 8 ? ANSI_BASE_COLORS[value] : ANSI_BRIGHT_COLORS[value - 8];
  }
  if (value >= 232) {
    const shade = Math.round(((value - 232) / 23) * 255);
    const channel = shade.toString(16).padStart(2, '0');
    return `#${channel}${channel}${channel}`;
  }
  const adjusted = value - 16;
  const r = Math.floor(adjusted / 36);
  const g = Math.floor((adjusted % 36) / 6);
  const b = adjusted % 6;
  const levelToRgb = [0, 95, 135, 175, 215, 255];
  return `rgb(${levelToRgb[r]}, ${levelToRgb[g]}, ${levelToRgb[b]})`;
}

function applyAnsiSgr(style, rawParams) {
  const params = rawParams === '' ? [0] : rawParams.split(';').map((value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });

  for (let i = 0; i < params.length; i++) {
    const code = params[i];
    if (code === 0) {
      Object.assign(style, createDefaultAnsiStyle());
      continue;
    }
    if (code === 1) {
      style.bold = true;
      continue;
    }
    if (code === 2) {
      style.faint = true;
      continue;
    }
    if (code === 3) {
      style.italic = true;
      continue;
    }
    if (code === 4) {
      style.underline = true;
      continue;
    }
    if (code === 7) {
      style.inverse = true;
      continue;
    }
    if (code === 22) {
      style.bold = false;
      style.faint = false;
      continue;
    }
    if (code === 23) {
      style.italic = false;
      continue;
    }
    if (code === 24) {
      style.underline = false;
      continue;
    }
    if (code === 27) {
      style.inverse = false;
      continue;
    }
    if (code >= 30 && code <= 37) {
      style.fg = ANSI_BASE_COLORS[code - 30];
      continue;
    }
    if (code >= 40 && code <= 47) {
      style.bg = ANSI_BASE_COLORS[code - 40];
      continue;
    }
    if (code >= 90 && code <= 97) {
      style.fg = ANSI_BRIGHT_COLORS[code - 90];
      continue;
    }
    if (code >= 100 && code <= 107) {
      style.bg = ANSI_BRIGHT_COLORS[code - 100];
      continue;
    }
    if (code === 39) {
      style.fg = null;
      continue;
    }
    if (code === 49) {
      style.bg = null;
      continue;
    }
    if (code === 38 || code === 48) {
      const isFg = code === 38;
      const mode = params[i + 1];
      if (mode === 5) {
        const paletteIndex = params[i + 2];
        if (Number.isInteger(paletteIndex)) {
          setAnsiColor(style, isFg, ansi256ColorToCss(paletteIndex));
          i += 2;
        }
      } else if (mode === 2) {
        const red = params[i + 2];
        const green = params[i + 3];
        const blue = params[i + 4];
        if ([red, green, blue].every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)) {
          setAnsiColor(style, isFg, `rgb(${red}, ${green}, ${blue})`);
          i += 4;
        }
      }
    }
  }
}

function ansiStyleToCss(style) {
  let fg = style.fg;
  let bg = style.bg;
  if (style.inverse) {
    [fg, bg] = [bg, fg];
  }

  const css = [];
  if (fg) css.push(`color: ${fg}`);
  if (bg) css.push(`background-color: ${bg}`);
  if (style.bold) css.push('font-weight: 700');
  if (style.faint) css.push('opacity: 0.75');
  if (style.italic) css.push('font-style: italic');
  if (style.underline) css.push('text-decoration: underline');
  return css.join('; ');
}

function ensureAnsiConsoleState(consoleEl) {
  let state = ansiConsoleStates.get(consoleEl);
  if (state) return state;
  const pre = document.createElement('pre');
  pre.className = 'ansi-console-output';
  consoleEl.replaceChildren(pre);
  state = {
    pre,
    pendingEscape: '',
    style: createDefaultAnsiStyle(),
  };
  ansiConsoleStates.set(consoleEl, state);
  return state;
}

function resetConsoleText(consoleEl) {
  consoleEl.style.display = 'block';
  const pre = document.createElement('pre');
  pre.className = 'ansi-console-output';
  consoleEl.replaceChildren(pre);
  ansiConsoleStates.set(consoleEl, {
    pre,
    pendingEscape: '',
    style: createDefaultAnsiStyle(),
  });
}

function appendAnsiText(state, text) {
  if (!text) return;
  const styleCss = ansiStyleToCss(state.style);
  const last = state.pre.lastChild;

  if (!styleCss) {
    if (last && last.nodeType === Node.TEXT_NODE) {
      last.nodeValue += text;
    } else {
      state.pre.appendChild(document.createTextNode(text));
    }
    return;
  }

  if (last && last.nodeType === Node.ELEMENT_NODE && last.dataset.ansiCss === styleCss) {
    last.textContent += text;
    return;
  }

  const span = document.createElement('span');
  span.dataset.ansiCss = styleCss;
  span.style.cssText = styleCss;
  span.textContent = text;
  state.pre.appendChild(span);
}

function appendAnsiChunk(consoleEl, text) {
  const state = ensureAnsiConsoleState(consoleEl);
  const input = state.pendingEscape + text;
  state.pendingEscape = '';

  let index = 0;
  while (index < input.length) {
    const escIndex = input.indexOf('\u001b', index);
    if (escIndex === -1) {
      appendAnsiText(state, input.slice(index));
      break;
    }

    appendAnsiText(state, input.slice(index, escIndex));

    if (escIndex + 1 >= input.length) {
      state.pendingEscape = input.slice(escIndex);
      break;
    }

    if (input[escIndex + 1] === ']') {
      let oscEnd = input.indexOf('\u0007', escIndex + 2);
      if (oscEnd === -1) {
        const stIndex = input.indexOf('\u001b\\', escIndex + 2);
        if (stIndex === -1) {
          state.pendingEscape = input.slice(escIndex);
          break;
        }
        index = stIndex + 2;
      } else {
        index = oscEnd + 1;
      }
      continue;
    }

    if (input[escIndex + 1] !== '[') {
      index = escIndex + 2;
      continue;
    }

    let finalIndex = escIndex + 2;
    while (finalIndex < input.length) {
      const code = input.charCodeAt(finalIndex);
      if (code >= 0x40 && code <= 0x7E) break;
      finalIndex++;
    }

    if (finalIndex >= input.length) {
      state.pendingEscape = input.slice(escIndex);
      break;
    }

    const command = input[finalIndex];
    const params = input.slice(escIndex + 2, finalIndex);
    if (command === 'm') {
      applyAnsiSgr(state.style, params);
    }

    index = finalIndex + 1;
  }
}

function appendConsoleText(consoleEl, text) {
  if (!text) return;
  consoleEl.style.display = 'block';
  const stickToBottom = consoleEl.scrollTop + consoleEl.clientHeight >= consoleEl.scrollHeight - 4;
  appendAnsiChunk(consoleEl, text);
  if (stickToBottom) {
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
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

function trackAnalyticsEvent(eventName, params = {}) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, params);
}

function getAnalyticsNetworkName(networkName) {
  switch (normalizeNetworkSelection(networkName)) {
    case 'PUBLIC':
      return 'mainnet';
    case 'TESTNET':
      return 'testnet';
    case 'FUTURENET':
      return 'futurenet';
    case 'LOCAL':
      return 'local';
    default:
      return 'unknown';
  }
}

async function compileCode() {
  const compileButton = document.getElementById('compile-code');
  trackAnalyticsEvent('compile_to_wasm_click');
  compileButton.disabled = true;
  scrollButtonToPanelTop(compileButton);
  const startTime = performance.now();

  // Save current file content and get all files
  saveCurrentFile();
  const allFiles = { ...files };

  const statusEl = document.getElementById('build-status');
  const consoleEl = document.getElementById('build-console');
  resetConsoleText(consoleEl);
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

    const contractName = extractContractName(getMainSourceContent(allFiles));
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
  await runTestPanelCommand({
    buttonId: 'run-tests',
    endpoint: '/test',
    startStatus: 'Running tests... (This may take a minute or two)',
    runningPrefix: 'Running tests...',
    errorMarker: 'Test Errors:',
    successStatus: 'Tests completed',
    errorStatus: 'Errors in tests'
  });
}

async function runScoutAudit() {
  await runTestPanelCommand({
    buttonId: 'scout-audit',
    endpoint: '/scout-audit',
    startStatus: 'Running Scout audit... (This may take a minute or two)',
    runningPrefix: 'Running Scout audit...',
    errorMarker: 'Scout Audit Errors:',
    successStatus: 'Scout audit completed',
    errorStatus: 'Scout audit reported issues'
  });
}

function setTestActionButtonsDisabled(disabled) {
  ['run-tests', 'scout-audit'].forEach((id) => {
    const button = document.getElementById(id);
    if (button) {
      button.disabled = disabled;
    }
  });
}

async function runTestPanelCommand({
  buttonId,
  endpoint,
  startStatus,
  runningPrefix,
  errorMarker,
  successStatus,
  errorStatus
}) {
  const activeButton = document.getElementById(buttonId);
  setTestActionButtonsDisabled(true);
  scrollButtonToPanelTop(activeButton);

  saveCurrentFile();
  const allFiles = { ...files };

  const statusEl = document.getElementById('test-status');
  const consoleEl = document.getElementById('test-console');
  resetConsoleText(consoleEl);
  statusEl.innerText = startStatus;
  const interval = setInterval(() => {
    const msgIndex = Math.floor(Math.random() * funnyMessages.length);
    statusEl.innerText = `${runningPrefix} ${funnyMessages[msgIndex]}`;
  }, 3000);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: allFiles })
    });

    if (!response.ok) {
      const resultText = await response.text();
      appendConsoleText(consoleEl, resultText);
      statusEl.innerText = errorStatus;
      return;
    }

    if (!response.body) {
      const resultText = await response.text();
      appendConsoleText(consoleEl, resultText);
      statusEl.innerText = errorStatus;
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let hasErrors = false;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      if (chunk.includes(errorMarker)) hasErrors = true;
      appendConsoleText(consoleEl, chunk);
    }

    const tail = decoder.decode();
    if (tail) {
      if (tail.includes(errorMarker)) hasErrors = true;
      appendConsoleText(consoleEl, tail);
    }

    statusEl.innerText = hasErrors ? errorStatus : successStatus;
  } catch (err) {
    statusEl.innerText = `Network error: ${err.message}`;
    console.error(err);
  } finally {
    clearInterval(interval);
    setTestActionButtonsDisabled(false);
  }
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
  pre.style.color = 'var(--danger-color)';
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
      failed.style.color = 'var(--danger-color)';
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
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.classList.toggle('academy-mode', panelId === 'academy-panel');
  }
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

function deriveWorkspaceNameFromPath(path, fallback = 'Workspace') {
  const parts = String(path || '').split('/').filter(Boolean);
  return sanitizeWorkspaceName(parts[parts.length - 1] || fallback);
}

function fileEntriesToWorkspaceFiles(fileEntries) {
  const workspaceFiles = {};
  fileEntries.forEach(({ path, content }) => {
    if (!shouldImportWorkspaceFile(path)) return;
    workspaceFiles[path] = content;
  });
  return workspaceFiles;
}

function shouldImportWorkspaceFile(path) {
  const normalizedPath = normalizeFilePath(path);
  return normalizedPath !== 'Cargo.lock' && !normalizedPath.endsWith('/Cargo.lock');
}

function stripCommonLeadingDirectory(fileEntries) {
  if (fileEntries.length < 2) {
    return fileEntries;
  }

  const splitPaths = fileEntries.map((entry) => entry.path.split('/'));
  if (splitPaths.some((segments) => segments.length < 2)) {
    return fileEntries;
  }

  const rootSegment = splitPaths[0][0];
  if (!splitPaths.every((segments) => segments[0] === rootSegment)) {
    return fileEntries;
  }

  return fileEntries.map((entry) => ({
    ...entry,
    path: entry.path.split('/').slice(1).join('/'),
  }));
}

async function readFileSelection(fileList) {
  const entries = [];
  for (const file of Array.from(fileList || [])) {
    if (!file) continue;
    const filePath = normalizeFilePath(file.webkitRelativePath || file.name);
    entries.push({
      path: filePath,
      content: await file.text(),
    });
  }
  return stripCommonLeadingDirectory(entries);
}

function readEntryFile(entry) {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

function readAllDirectoryEntries(reader) {
  return new Promise((resolve, reject) => {
    const entries = [];
    const readBatch = () => {
      reader.readEntries((batch) => {
        if (!batch.length) {
          resolve(entries);
          return;
        }
        entries.push(...batch);
        readBatch();
      }, reject);
    };
    readBatch();
  });
}

async function readDroppedEntry(entry, prefix = '') {
  if (entry.isFile) {
    const file = await readEntryFile(entry);
    return [{
      path: normalizeFilePath(`${prefix}${entry.name}`),
      content: await file.text(),
    }];
  }

  if (entry.isDirectory) {
    const children = await readAllDirectoryEntries(entry.createReader());
    let collected = [];
    const nextPrefix = `${prefix}${entry.name}/`;
    for (const child of children) {
      collected = collected.concat(await readDroppedEntry(child, nextPrefix));
    }
    return collected;
  }

  return [];
}

async function collectDroppedWorkspaceFiles(dataTransfer) {
  const itemEntries = Array.from(dataTransfer?.items || [])
    .map((item) => item.webkitGetAsEntry?.())
    .filter(Boolean);

  if (itemEntries.length) {
    let collected = [];
    for (const entry of itemEntries) {
      collected = collected.concat(await readDroppedEntry(entry));
    }
    return stripCommonLeadingDirectory(collected);
  }

  return readFileSelection(dataTransfer?.files || []);
}

async function importFileEntriesIntoActiveWorkspace(fileEntries) {
  const workspaceFiles = fileEntriesToWorkspaceFiles(stripCommonLeadingDirectory(fileEntries));
  mergeFilesIntoActiveWorkspace(workspaceFiles);
  setWorkspaceStatus(`Imported ${Object.keys(workspaceFiles).length} file(s) into the active workspace.`);
}

function downloadBlob(blob, fileName) {
  const link = document.createElement('a');
  const url = window.URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => window.URL.revokeObjectURL(url), 0);
}

function slugifyWorkspaceName(name) {
  return sanitizeWorkspaceName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'workspace';
}

function downloadActiveWorkspaceZip() {
  const workspace = getActiveWorkspace();
  if (!workspace) return;
  if (!window.fflate) {
    throw new Error('ZIP export is not available right now.');
  }

  const zipEntries = {};
  Object.entries(workspace.files).forEach(([filePath, content]) => {
    zipEntries[filePath] = window.fflate.strToU8(content);
  });

  const archive = window.fflate.zipSync(zipEntries, { level: 6 });
  downloadBlob(new Blob([archive], { type: 'application/zip' }), `${slugifyWorkspaceName(workspace.name)}.zip`);
}

async function uploadWorkspaceZip(file) {
  if (!window.fflate) {
    throw new Error('ZIP import is not available right now.');
  }

  const buffer = await file.arrayBuffer();
  const unzipped = window.fflate.unzipSync(new Uint8Array(buffer));

  const importedFiles = {};
  Object.entries(unzipped).forEach(([path, data]) => {
    // Skip directories (empty entries ending with /) and hidden/system files
    if (path.endsWith('/') || path.startsWith('__MACOSX') || path.startsWith('.')) return;
    if (!shouldImportWorkspaceFile(path)) return;

    // Strip a single common root directory prefix if every entry shares one
    let cleanPath = path;
    const content = window.fflate.strFromU8(data);
    importedFiles[cleanPath] = content;
  });

  if (!Object.keys(importedFiles).length) {
    throw new Error('The ZIP file contained no usable files.');
  }

  // Strip common root folder prefix if all files share one
  const paths = Object.keys(importedFiles);
  const firstSegments = paths.map((p) => p.split('/')[0]);
  const commonRoot = firstSegments.every((s) => s === firstSegments[0]) && paths.every((p) => p.includes('/'))
    ? firstSegments[0] + '/'
    : null;

  const finalFiles = {};
  paths.forEach((p) => {
    const key = commonRoot ? p.slice(commonRoot.length) : p;
    if (key) finalFiles[key] = importedFiles[p];
  });

  const name = file.name.replace(/\.zip$/i, '') || 'Imported Workspace';
  await createWorkspace(name, finalFiles, { type: 'zip' });
  setWorkspaceStatus(`Imported "${name}" from ZIP (${Object.keys(finalFiles).length} files).`);
}

function encodeGithubContentPath(path) {
  return path.split('/').filter(Boolean).map((segment) => encodeURIComponent(segment)).join('/');
}

async function fetchGithubApiJson(url) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.message || `GitHub request failed (${response.status}).`);
  }
  return payload;
}

async function fetchGithubFileText(downloadUrl) {
  const response = await fetch(downloadUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch GitHub file (${response.status}).`);
  }
  return response.text();
}

function parseGithubWorkspaceUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'github.com') {
      return null;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    const [owner, repo, type, ref, ...rest] = parts;
    if (!type) {
      return { owner, repo, type: 'repo', ref: null, path: '' };
    }
    if (type === 'tree' || type === 'blob') {
      if (!ref) {
        return null;
      }
      return { owner, repo, type, ref, path: rest.join('/') };
    }

    return { owner, repo, type: 'repo', ref: null, path: '' };
  } catch {
    return null;
  }
}

async function fetchGithubWorkspaceFiles(owner, repo, ref, rootPath = '') {
  const workspaceFiles = {};

  async function walk(currentPath) {
    const suffix = currentPath ? `/${encodeGithubContentPath(currentPath)}` : '';
    const payload = await fetchGithubApiJson(`https://api.github.com/repos/${owner}/${repo}/contents${suffix}?ref=${encodeURIComponent(ref)}`);

    if (Array.isArray(payload)) {
      for (const item of payload) {
        if (item.type === 'dir') {
          await walk(item.path);
        } else if (item.type === 'file' && item.download_url) {
          const relativePath = rootPath ? item.path.slice(rootPath.length).replace(/^\/+/, '') : item.path;
          if (!shouldImportWorkspaceFile(relativePath || item.name)) continue;
          workspaceFiles[normalizeFilePath(relativePath || item.name)] = await fetchGithubFileText(item.download_url);
        }
      }
      return;
    }

    if (payload.type === 'file' && payload.download_url) {
      const relativePath = rootPath
        ? currentPath.slice(rootPath.length).replace(/^\/+/, '')
        : currentPath || payload.name;
      if (!shouldImportWorkspaceFile(relativePath || payload.name)) return;
      workspaceFiles[normalizeFilePath(relativePath || payload.name)] = await fetchGithubFileText(payload.download_url);
    }
  }

  await walk(rootPath);
  return workspaceFiles;
}

async function loadWorkspaceFromGithub(url, options = {}) {
  const parsed = parseGithubWorkspaceUrl(url);
  if (!parsed) {
    throw new Error('Paste a GitHub repository, tree, or file URL.');
  }

  const repoInfo = await fetchGithubApiJson(`https://api.github.com/repos/${parsed.owner}/${parsed.repo}`);
  const ref = parsed.ref || repoInfo.default_branch;
  const workspaceName = deriveWorkspaceNameFromPath(parsed.path || repoInfo.name, repoInfo.name);
  let importedFiles = await fetchGithubWorkspaceFiles(parsed.owner, parsed.repo, ref, parsed.path || '');
  const source = {
    type: 'github',
    url,
    owner: parsed.owner,
    repo: parsed.repo,
    ref,
    path: parsed.path || '',
  };

  if (!Object.keys(importedFiles).length) {
    throw new Error('No files were found in that GitHub location.');
  }

  if (!importedFiles['Cargo.toml']) {
    const fallbackWorkspace = await loadDefaultFiles();
    const importedMainPath = getMainSourcePath(importedFiles);
    const fallbackMainPath = getMainSourcePath(fallbackWorkspace) || 'src/lib.rs';
    if (importedMainPath) {
      fallbackWorkspace[fallbackMainPath] = importedFiles[importedMainPath];
    }
    importedFiles = {
      ...fallbackWorkspace,
      ...importedFiles,
    };
  }

  if (options.createNew === false) {
    replaceActiveWorkspaceFiles(importedFiles, {
      name: workspaceName,
      preferredFile: getMainSourcePath(importedFiles),
      source,
    });
  } else {
    await createWorkspace(workspaceName, importedFiles, source);
  }

  setWorkspaceStatus(`Imported ${Object.keys(importedFiles).length} file(s) from GitHub.`);
}

async function loadWorkspaceFromUrl(url, options = {}) {
  const parsedGithub = parseGithubWorkspaceUrl(url);
  if (parsedGithub) {
    await loadWorkspaceFromGithub(url, options);
    return;
  }

  const fixedCodeUrl = toRawUrl(url);
  const response = await fetch(fixedCodeUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch shared code (${response.status}).`);
  }

  const code = await response.text();
  const importedFiles = await loadDefaultFiles();
  const mainSourcePath = getMainSourcePath(importedFiles) || 'src/lib.rs';
  importedFiles[mainSourcePath] = code;

  if (options.createNew === false) {
    replaceActiveWorkspaceFiles(importedFiles, {
      name: deriveWorkspaceNameFromPath(fixedCodeUrl, 'Imported Workspace'),
      preferredFile: mainSourcePath,
      source: { type: 'url', url },
    });
  } else {
    await createWorkspace(
      deriveWorkspaceNameFromPath(fixedCodeUrl, 'Imported Workspace'),
      importedFiles,
      { type: 'url', url }
    );
  }

  setWorkspaceStatus('Imported shared code into a workspace.');
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
  trackAnalyticsEvent('deploy_click', {
    network: getAnalyticsNetworkName(network),
  });
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
  applyTheme(currentTheme, { persist: false });
  setupThemeToggle();

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
      await loadWorkspaceFromUrl(codeUrl, { createNew: false });
    } catch (error) {
      alert(error?.message || 'Failed to fetch shared code.');
    }
  }

  const newWorkspaceButton = document.getElementById('new-workspace');
  if (newWorkspaceButton) {
    newWorkspaceButton.addEventListener('click', async () => {
      const name = prompt('Name the new workspace:', `Workspace ${workspaces.length + 1}`);
      if (name === null) return;
      await createWorkspace(name.trim() || null);
      setWorkspaceStatus('Created a new workspace.');
    });
  }

  const deleteWorkspaceButton = document.getElementById('delete-workspace');
  if (deleteWorkspaceButton) {
    deleteWorkspaceButton.addEventListener('click', async () => {
      await deleteWorkspace(activeWorkspaceId);
    });
  }

  const downloadWorkspaceButton = document.getElementById('download-workspace');
  if (downloadWorkspaceButton) {
    downloadWorkspaceButton.addEventListener('click', () => {
      try {
        downloadActiveWorkspaceZip();
        setWorkspaceStatus('Workspace ZIP downloaded.');
      } catch (error) {
        setWorkspaceStatus(error?.message || 'Failed to download workspace ZIP.', true);
      }
    });
  }

  const zipInput = document.getElementById('workspace-zip-input');
  const uploadZipButton = document.getElementById('upload-workspace-zip');
  if (uploadZipButton && zipInput) {
    uploadZipButton.addEventListener('click', () => zipInput.click());
  }
  if (zipInput) {
    zipInput.addEventListener('change', async () => {
      const file = zipInput.files[0];
      if (!file) return;
      try {
        await uploadWorkspaceZip(file);
      } catch (error) {
        setWorkspaceStatus(error?.message || 'Failed to import ZIP.', true);
      } finally {
        zipInput.value = '';
      }
    });
  }

  const githubWorkspaceInput = document.getElementById('github-workspace-url');
  const importGithubButton = document.getElementById('import-github-workspace');
  const handleGithubImport = async () => {
    const url = githubWorkspaceInput?.value.trim();
    if (!url) {
      setWorkspaceStatus('Paste a GitHub URL first.', true);
      return;
    }

    try {
      await loadWorkspaceFromGithub(url);
      if (githubWorkspaceInput) {
        githubWorkspaceInput.value = '';
      }
    } catch (error) {
      setWorkspaceStatus(error?.message || 'Failed to import from GitHub.', true);
    }
  };
  if (importGithubButton) {
    importGithubButton.addEventListener('click', handleGithubImport);
  }
  if (githubWorkspaceInput) {
    githubWorkspaceInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        handleGithubImport();
      }
    });
    githubWorkspaceInput.addEventListener('input', () => {
      setWorkspaceStatus('');
    });
  }

  const importToggle = document.getElementById('ws-import-toggle');
  const importPopover = document.getElementById('ws-import-popover');
  if (importToggle && importPopover) {
    importToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      importPopover.classList.toggle('open');
      if (importPopover.classList.contains('open') && githubWorkspaceInput) {
        githubWorkspaceInput.focus();
      }
    });
    document.addEventListener('click', (event) => {
      if (!importPopover.contains(event.target) && event.target !== importToggle) {
        importPopover.classList.remove('open');
      }
    });
  }

  const fileInput = document.getElementById('workspace-file-input');
  const folderInput = document.getElementById('workspace-folder-input');
  const uploadFilesButton = document.getElementById('upload-workspace-files');
  const uploadFolderButton = document.getElementById('upload-workspace-folder');
  const addWorkspaceFileButton = document.getElementById('add-workspace-file');

  if (uploadFilesButton && fileInput) {
    uploadFilesButton.addEventListener('click', () => fileInput.click());
  }
  if (uploadFolderButton && folderInput) {
    uploadFolderButton.addEventListener('click', () => folderInput.click());
  }
  if (addWorkspaceFileButton) {
    addWorkspaceFileButton.addEventListener('click', () => {
      const fileName = prompt('Enter a file path (for example: src/lib.rs, src/utils.rs, shop/lib.rs):');
      if (fileName && fileName.trim()) {
        createNewFile(fileName.trim());
      }
    });
  }
  if (fileInput) {
    fileInput.addEventListener('change', async () => {
      try {
        const fileEntries = await readFileSelection(fileInput.files);
        await importFileEntriesIntoActiveWorkspace(fileEntries);
      } catch (error) {
        setWorkspaceStatus(error?.message || 'Failed to import files.', true);
      } finally {
        fileInput.value = '';
      }
    });
  }
  if (folderInput) {
    folderInput.addEventListener('change', async () => {
      try {
        const fileEntries = await readFileSelection(folderInput.files);
        await importFileEntriesIntoActiveWorkspace(fileEntries);
      } catch (error) {
        setWorkspaceStatus(error?.message || 'Failed to import folder.', true);
      } finally {
        folderInput.value = '';
      }
    });
  }

  const dropzone = document.getElementById('workspace-dropzone');
  if (dropzone) {
    ['dragenter', 'dragover'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.remove('dragover');
      });
    });
    dropzone.addEventListener('drop', async (event) => {
      try {
        const fileEntries = await collectDroppedWorkspaceFiles(event.dataTransfer);
        await importFileEntriesIntoActiveWorkspace(fileEntries);
      } catch (error) {
        setWorkspaceStatus(error?.message || 'Failed to import dropped files.', true);
      }
    });
  }

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
  startMcpBridge();
  setupAiAssistant();
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
  document.getElementById('scout-audit').onclick = () => runScoutAudit();
  document.getElementById('compile-code').onclick = () => compileCode();
  setupAcademy();

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
    if (panelId === 'docs-panel') {
      window.open("/docs/", "_blank");
      return;
    }
    if (panelId === 'github-panel') {
      window.open("https://github.com/jamesbachini/Soroban-Playground", "_blank");
      return;
    }
    const resetSplit = panelId === 'create-panel';
    if (panelId === 'ai-panel') {
      activateAiTab('assistant');
    }
    activatePanel(panelId, {
      resetSplit,
      splitRatio: panelId === 'ai-panel' ? 0.36 : null,
    });
  });
});

window.addEventListener('resize', function() {
  if (editor) {
    editor.layout();
  }
});
