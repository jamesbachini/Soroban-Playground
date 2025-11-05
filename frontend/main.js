let editor;
let publicKey = null;
let keypair;
let rpc;
let horizon;
let networkPassphrase;
let network = 'TESTNET';
let walletKitAddress = null;

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

async function compileCode() {
  document.getElementById('compile-code').disabled = true;

  // Save current file content and get all files
  saveCurrentFile();
  const allFiles = { ...files };

  const statusEl = document.getElementById('build-status');
  const consoleEl = document.getElementById('build-console');
  consoleEl.innerText = '';
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
    if (response.ok) {
      const contractName = extractContractName(allFiles['lib.rs'] || '');
      const buffer = await response.arrayBuffer();
      let view = new Uint8Array(buffer);
      let start = 0;
      while (view[start] === 0x20) start++; // Skip any 0x20 bytes heartbeat
      const clean = view.subarray(start);
      if (!(clean[0] === 0x00 && clean[1] === 0x61 && clean[2] === 0x73 && clean[3] === 0x6d)) {
        const textDecoder = new TextDecoder('utf-8');
        const resultText = textDecoder.decode(buffer);
        consoleEl.style.display = 'block';
        consoleEl.innerText = resultText;
        consoleEl.scrollTop = consoleEl.scrollHeight;
        return;
      }
      const blob = new Blob([clean], { type: 'application/wasm' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${contractName}.wasm`;
      a.click();
      statusEl.innerText = 'Compilation successful!';
    } else {
      const resultText = await response.text();
      consoleEl.style.display = 'block';
      consoleEl.innerText = resultText;
      consoleEl.scrollTop = consoleEl.scrollHeight;
    }
  } catch (err) {
    console.error(err);
    statusEl.innerText = 'Build error';
  } finally {
    clearInterval(interval);
    document.getElementById('compile-code').disabled = false;
  }
}

async function runTests() {
  document.getElementById('run-tests').disabled = true;

  // Save current file content and get all files
  saveCurrentFile();
  const allFiles = { ...files };

  const statusEl = document.getElementById('test-status');
  const consoleEl = document.getElementById('test-console');
  consoleEl.innerText = '';
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
    const resultText = await response.text();
    if (response.ok) {
      consoleEl.innerText = resultText;
      consoleEl.scrollTop = consoleEl.scrollHeight;
      statusEl.innerText = 'Tests completed';
    } else {
      consoleEl.innerText = resultText;
      consoleEl.scrollTop = consoleEl.scrollHeight;
      statusEl.innerText = 'Errors in tests';
    }
  } catch (err) {
    statusEl.innerText = `Network error: ${err.message}`;
    console.error(err);
  }
  document.getElementById('run-tests').disabled = false;
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
    const isRead = signature.includes('->');
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
    const left = document.createElement('div');
    left.classList.add('method-left');
    const title = document.createElement('h3');
    title.textContent = methodName;
    left.appendChild(title);
    args.forEach(arg => {
      const row = document.createElement('div');
      row.classList.add('arg-row');
      const label = document.createElement('label');
      label.textContent = `${arg.name}: ${arg.type}`;
      label.htmlFor = `${methodName}-${arg.name}`;
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `${methodName}-${arg.name}`;
      row.append(input, label);
      left.appendChild(row);
    });
    const button = document.createElement('button');
    button.textContent = methodName;
    left.appendChild(button);
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
        const sourceAccount = await horizon.loadAccount(publicKey);
        const op = contract.call(methodName, ...convertedArgs);
        const tx = new StellarSdk.TransactionBuilder(sourceAccount, {
          fee: StellarSdk.BASE_FEE,
          networkPassphrase,
        })
          .addOperation(op)
          .setTimeout(30)
          .build();
        if (isRead) {
          const simulationResult = await rpc.simulateTransaction(tx);
          const decoded = StellarSdk.scValToNative(simulationResult.result?.retval);
          const safeDecoded = JSON.parse(JSON.stringify(decoded, (key, value) =>
            typeof value === "bigint" ? value.toString() : value
          ));
          consoleDiv.innerHTML = `<pre>${JSON.stringify(safeDecoded, null, 2)}</pre>`;
        } else {
          const preparedTx = await rpc.prepareTransaction(tx);
          const signedTx = await signTransaction(preparedTx);
          let response = await rpc.sendTransaction(signedTx);
          const hash = response.hash;
          consoleDiv.innerHTML = `
            <p>Transaction Sent! Check block explorer:</p>
            <a href="https://stellar.expert/explorer/${network.toLowerCase()}/tx/${hash}" target="_blank">${hash}</a>
          `;
        }
      } catch (err) {
        consoleDiv.innerHTML = `<pre style="color:red;">${err.message || err}</pre>`;
        console.error(err);
      }
    });
    wrapper.appendChild(left);
    wrapper.appendChild(right);
    container.appendChild(wrapper);
  }
}


async function loadContract(contractId) {
  document.querySelectorAll('.sidebar-icon').forEach(i => i.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('explore-sidebar-icon').classList.add('active');
  document.getElementById('explore-panel').classList.add('active');
  document.getElementById('explore-contract-id').value = contractId;
  // Save to local storage
  localStorage.setItem('last-contract-id', contractId);
  localStorage.setItem('last-explore-network', network);
  try {
    const response = await fetch('/interface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contract: contractId, network: network.toLowerCase() })
    });
    const resultText = await response.text();
    renderContractForm(contractId, resultText);
  } catch (err) {
    exploreForm.innerText = `Failed to load contract: ${err.message}`;
    console.error(err);
  }
}

function updateNetwork(value) {
  network = value;
  let rpcURL;
  let horizonURL;
  if (network == 'TESTNET') {
    rpcURL = 'https://soroban-testnet.stellar.org';
    horizonURL = 'https://horizon-testnet.stellar.org'; 
    networkPassphrase = StellarSdk.Networks.TESTNET;
  } else {
    rpcURL = 'https://mainnet.sorobanrpc.com';
    horizonURL = 'https://horizon.stellar.org'; 
    networkPassphrase = StellarSdk.Networks.PUBLIC;
  }
  rpc = new StellarSdk.rpc.Server(rpcURL);
  horizon = new StellarSdk.Horizon.Server(horizonURL);
}

function fundAddress(pubKey) {
  const url = `https://friendbot.stellar.org/?addr=${pubKey}`;
  fetch(url).then(response => {
      if (!response.ok) {
        throw new Error('Failed to fund account, status ' + response.status);
      }
    })
    .catch(err => {
      throw new Error('Error funding address: ' + err);
    });
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

updateNetwork(document.getElementById('deploy-network').value);
document.getElementById('deploy-network').addEventListener('change', (e) => {
  updateNetwork(e.target.value);
  document.getElementById('deploy-console').innerHTML += `Network switched to ${network}<br />`;
});
document.getElementById('explore-network').addEventListener('change', (e) => {
  updateNetwork(e.target.value);
  localStorage.setItem('last-explore-network', network);
});

document.getElementById('share-link').onclick = () => {
  let url = prompt("Paste GitHub/Gist URL: ");
  if (!url) return;
  const shareUrl = `${window.location.origin}${window.location.pathname}?codeUrl=${encodeURIComponent(url)}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    alert("Shareable link copied to clipboard!");
  });
};

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
    document.querySelectorAll('.wallet-info').forEach(el => {
      el.innerHTML = `Connected: ${publicKey}`;
    });
    document.getElementById('deploy-button').disabled = false;
  } else {
    walletKitAddress = null;
    if (!keypair) {
      publicKey = null;
      document.querySelectorAll('.wallet-info').forEach(el => {
        el.innerHTML = '';
      });
      document.getElementById('deploy-button').disabled = true;
    }
  }
});

document.querySelectorAll('.connect-testnet').forEach(button => {
  button.addEventListener('click', async () => {  
    keypair = StellarSdk.Keypair.random();
    localStorage.setItem('secretKey', keypair.secret());
    publicKey = keypair.publicKey();
    await fundAddress(publicKey);
    document.querySelectorAll('.wallet-info').forEach(el => {
      el.innerHTML = `Connected: ${publicKey}`;
    });
    document.getElementById('deploy-button').disabled = false;
  });
});

document.querySelectorAll('.connect-secret').forEach(button => {
  button.addEventListener('click', async () => {  
    const secretKey = prompt('Enter a secret key (do not use in production): ');
    localStorage.setItem('secretKey', secretKey);
    keypair = StellarSdk.Keypair.fromSecret(secretKey);
    publicKey = keypair.publicKey();
    document.querySelectorAll('.wallet-info').forEach(el => {
      el.innerHTML = `Connected: ${publicKey}`;
    });
    document.getElementById('deploy-button').disabled = false;
  });
});

document.querySelectorAll('.export-keys').forEach(button => {
  button.addEventListener('click', async () => {
    const secretKey = localStorage.getItem('secretKey');
    if (!secretKey) return alert('No secret key found');
    keypair = StellarSdk.Keypair.fromSecret(secretKey);
    document.querySelectorAll('.wallet-info').forEach(el => {
      el.innerHTML = `Public Key: ${publicKey}<br /><br />Secret Key: ${secretKey}`;
    });
    document.getElementById('deploy-button').disabled = false;
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
      const sourceAccount = await horizon.loadAccount(publicKey);
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
        Block Explorer: <a href="https://stellar.expert/explorer/${network.toLowerCase()}/contract/${contractAddress}" target="_blank">Stellar.Expert</a><br />
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

  const keyStore = localStorage.getItem('secretKey');
  if (keyStore) {
    keypair = StellarSdk.Keypair.fromSecret(keyStore);
    publicKey = keypair.publicKey();
    document.querySelectorAll('.wallet-info').forEach(el => {
      el.innerHTML = `Connected: ${publicKey}`;
    });
    document.getElementById('deploy-button').disabled = false;
  }

  // Restore last contract ID and network settings
  const lastContractId = localStorage.getItem('last-contract-id');
  if (lastContractId) {
    document.getElementById('explore-contract-id').value = lastContractId;
  }
  const lastExploreNetwork = localStorage.getItem('last-explore-network');
  if (lastExploreNetwork) {
    document.getElementById('explore-network').value = lastExploreNetwork;
  }

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
  document.getElementById('reset-code').onclick = async () => { await resetCode() };
  document.getElementById('run-tests').onclick = () => runTests();
  document.getElementById('compile-code').onclick = () => compileCode();

  const resizer = document.getElementById("resizer");
  const topPanel = document.getElementById("editor-container");
  const bottomPanel = document.getElementById("panel-container");
  let isDragging = false;
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
    if (newTopHeight > 100 && newBottomHeight > 100) {
      topPanel.style.height = `${newTopHeight}px`;
      bottomPanel.style.height = `${newBottomHeight}px`;
    }
  });

  window.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.cursor = "default";
  });
}

document.querySelectorAll('.sidebar-icon').forEach(icon => {
  icon.addEventListener('click', function() {
    const panelId = this.getAttribute('data-panel') + '-panel';
    if (panelId == 'home-panel') window.location = "/";
    if (panelId == 'github-panel') window.open("https://github.com/jamesbachini/Soroban-Playground", "_blank");
    document.querySelectorAll('.sidebar-icon').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById(panelId).classList.add('active');
  });
});

window.addEventListener('resize', function() {
  if (editor) {
    editor.layout();
  }
});