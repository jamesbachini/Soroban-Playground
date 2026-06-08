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

