let editor;
let publicKey = null;
let keypair;
let rpc;
let horizon;
let networkPassphrase;
let network = 'TESTNET';

require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
require(['vs/editor/editor.main'], function () { 
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
  init();
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
  const code = editor.getValue();
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
      body: JSON.stringify({ code }),
    });
    if (response.ok) {
      const contractName = extractContractName(code);
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
  const code = editor.getValue();
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
      body: JSON.stringify({ code })
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
  try {
    const response = await fetch('/interface', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contract: contractId, network: network.toLowerCase() })
    });
    const resultText = await response.text();
    console.log(resultText)
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

function resetCode() {
  editor.setValue(`#![no_std]

use soroban_sdk::{contract, contractimpl, Env};

#[contract]
pub struct ExampleContract;

#[contractimpl]
impl ExampleContract {
    pub fn add(_env: Env, a: i32, b: i32) -> i32 {
        a + b
    }
}

#[cfg(test)]

#[test]
fn example_unit_test() {
    let env = Env::default();
    let contract_id = env.register(ExampleContract, ());
    let client = ExampleContractClient::new(&env, &contract_id);
    let a = 5_i32;
    let b = 7_i32;
    let result = client.add(&a, &b);
    assert_eq!(result, 12);
}
`);
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
});

document.getElementById('share-link').onclick = () => {
  const url = prompt("Paste raw GitHub URL: (e.g. https://raw.githubusercontent.com/user/repo/branch/path/lib.rs):");
  if (!url) return;
  const shareUrl = `${window.location.origin}${window.location.pathname}?codeUrl=${encodeURIComponent(url)}`;
  navigator.clipboard.writeText(shareUrl).then(() => {
    alert("Shareable link copied to clipboard!");
  });
};

document.querySelectorAll('.connect-freighter').forEach(button => {
  button.addEventListener('click', async () => { 
    if (!window.freighterApi) {
      alert('Freighter extension is not installed.');
      return;
    }
    const retrievePublicKey = async () => {
        const accessObj = await window.freighterApi.requestAccess();
        if (accessObj.error) {
            throw new Error(accessObj.error.message);
        } else {
            return accessObj.address;
        }
    };
    keypair = null;
    publicKey = await retrievePublicKey();
    document.querySelectorAll('.wallet-info').forEach(el => {
      el.innerHTML = `Connected: ${publicKey}`;
    });
    document.getElementById('deploy-button').disabled = false;
  });
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
    console.log(secretKey)
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
    document.getElementById('deploy-console').innerHTML += 'Requesting signature from Freighter...<br />';
    const signedXDR = await window.freighterApi.signTransaction(xdr, {
      network,
      networkPassphrase,
      address: publicKey
    });
    const signedTx = StellarSdk.TransactionBuilder.fromXDR(
      signedXDR.signedTxXdr, 
      networkPassphrase,
    );
    return signedTx;
  }
}

document.getElementById('deploy-button').addEventListener('click', async () => {
  document.getElementById('deploy-button').disabled = true;
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
    if (!file) return;
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
      console.log('t1')
      while (true) {
        response = await rpc.getTransaction(hash);
        console.log(response)
        if (response.status !== 'NOT_FOUND') break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      if (response.status === 'SUCCESS') {
        console.log('t2')
        const wasmHash = response.returnValue.bytes();
        console.log('t3')
        const salt = response.returnValue.hash;
        console.log('t4')
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
        while (true) {
          response2 = await rpc.getTransaction(hash2);
          if (response2.status !== 'NOT_FOUND') break;
          await new Promise((resolve) => setTimeout(resolve, 1000));
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
  const keyStore = localStorage.getItem('secretKey');
  if (keyStore) {
    keypair = StellarSdk.Keypair.fromSecret(keyStore);
    publicKey = keypair.publicKey();
    document.querySelectorAll('.wallet-info').forEach(el => {
      el.innerHTML = `Connected: ${publicKey}`;
    });
    document.getElementById('deploy-button').disabled = false;
  }
  const urlParams = new URLSearchParams(window.location.search);
  const codeUrl = urlParams.get("codeUrl");
  if (codeUrl) {
    try {
      const resp = await fetch(codeUrl);
      if (resp.ok) {
        const code = await resp.text();
        editor.setValue(code);
        localStorage.setItem('contractCode', code); // optional: persist
      }
    } catch(e) {
      alert("Failed to fetch shared code:", e);
    }
  } else {
    const contractCode = localStorage.getItem('contractCode');
    if (!contractCode) {
      resetCode();
    } else {
      editor.setValue(contractCode);
    }
  }
  editor.onDidChangeModelContent(() => {
    const currentCode = editor.getValue();
    localStorage.setItem('contractCode', currentCode);
  });
  document.getElementById('reset-code').onclick = () => { resetCode() };
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