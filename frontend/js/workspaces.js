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

