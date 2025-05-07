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
    }
  });
  init();
});

async function compileCode() {
  const code = editor.getValue();
  document.getElementById('build-status').innerText = 'Compiling... (Estimated build time 30s)';
  const interval = setInterval(() => {
    const msgIndex = Math.floor(Math.random() * funnyMessages.length);
    document.getElementById('build-status').innerText = 'Compiling... '+funnyMessages[msgIndex];
  }, 3000);
  const response = await fetch('/compile', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code })
  });
  if (response.ok) {
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'project.wasm';
    a.click();
    document.getElementById('build-status').innerText = 'Compilation successful!';
  } else {
    const error = await response.text();
    document.getElementById('build-status').innerText = `Error: ${error}`;
  }
  clearInterval(interval);
}

async function runTests() {
  const code = editor.getValue();
  document.getElementById('test-status').innerText = 'Running tests... (This may take a minute or two)';
  const interval = setInterval(() => {
    const msgIndex = Math.floor(Math.random() * funnyMessages.length);
    document.getElementById('test-status').innerText = 'Running tests... '+funnyMessages[msgIndex];
  }, 3000);
  const consoleEl = document.getElementById('test-console');
  consoleEl.innerText = '';
  try {
    const response = await fetch('/test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
    });
    const result = await response.text();
    consoleEl.innerText = result;
    document.getElementById('test-status').innerText = response.ok ? 'Tests completed' : 'Errors in tests';
  } catch (err) {
    consoleEl.innerText = err.message;
    document.getElementById('test-status').innerText = 'Test runner error';
  }
  clearInterval(interval);
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
  '(did you write this code?!)',
  '(searching for a blockchain use case)',
  '(trying to merge master again)',
  '(asking ChatGPT to save me)',
  '(blaming it on the intern)',
  '(reading the Rust book again)',
  '(checking StackOverflow like its 1999)',
  '(reconsider your career choices)',
  '(pinging the dev in Discord)',
  '(waiting for cargo... still)',
  '(staring into the void())',
  '(you should not be allowed on mainnet)',
  '(praying to the compiler gods)',
  '(turning it off then on again)',
];

document.getElementById('add-arg-btn').addEventListener('click', () => {
  const argsContainer = document.getElementById('args-container');
  argsContainer.appendChild(createArgRow());
});

updateNetwork(document.getElementById('network').value);
document.getElementById('network').addEventListener('change', (e) => {
  updateNetwork(e.target.value);
  document.getElementById('deploy-console').innerHTML += `Network switched to ${network}<br />`;
});

document.getElementById('connect-freighter').addEventListener('click', async () => {
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
  document.getElementById('wallet-info').innerHTML = `Connected: ${publicKey}`;
  document.getElementById('deploy-button').disabled = false;
});

document.getElementById('connect-testnet').addEventListener('click', async () => {
  keypair = StellarSdk.Keypair.random();
  localStorage.setItem('secretKey', keypair.secret());
  publicKey = keypair.publicKey();
  document.getElementById('deploy-console').innerHTML += `New keypair generated. Public Key: ${publicKey}<br />`;
  await fundAddress(publicKey);
  document.getElementById('deploy-console').innerHTML += `Testnet XLM funds added :)<br />`;
  document.getElementById('wallet-info').innerHTML = `Connected: ${publicKey}`;
  document.getElementById('deploy-button').disabled = false;
});

document.getElementById('connect-secret').addEventListener('click', async () => {
  const secretKey = prompt('Enter a secret key (do not use in production): ');
  localStorage.setItem('secretKey', secretKey);
  keypair = StellarSdk.Keypair.fromSecret(secretKey);
  publicKey = keypair.publicKey();
  document.getElementById('deploy-console').innerHTML += `Keypair Loaded. Public Key: ${publicKey}<br />`;
  document.getElementById('wallet-info').innerHTML = `Connected: ${publicKey}`;
  document.getElementById('deploy-button').disabled = false;
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
      while (true) {
        response = await rpc.getTransaction(hash);
        if (response.status !== 'NOT_FOUND') break;
        await new Promise((resolve) => setTimeout(resolve, 1000));
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
        document.getElementById('deploy-console').innerHTML += `Contract Deployed! <a href="https://stellar.expert/explorer/${network.toLowerCase()}/contract/${contractAddress}" target="_blank">${contractAddress}</a><br />`;
        } else {
          document.getElementById('deploy-console').innerHTML += 'Transaction 2/2 failed.<br />';
        }
      } else {
        document.getElementById('deploy-console').innerHTML += 'Transaction 1/2 failed.<br />';
      }
    } catch (err) {
      console.error(err);
      document.getElementById('deploy-console').innerHTML += 'Error: ' + err.message;
    }
  };
});

document.getElementById('eval-button').addEventListener('click', async () => {
  const jsCode = document.getElementById('integrate-editor').value;
  eval(jsCode);
});

function resetCode() {
    console.log('Reset')
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
document.getElementById('integrate-editor').value = `const func = async () => {
  const contractId='CBNVO6SFH2BZVAJ6QYRMYJNVUO47PMAGGLTMGFYECN45B7YTEEIKU773';
  const functionName = 'add';
  const args = [toScVal(8,'i32'), toScVal(23,'i32')];
  let sourceAccount = await rpc.getAccount(publicKey);
  const contract = new StellarSdk.Contract(contractId);
  const tx = new StellarSdk.TransactionBuilder(sourceAccount, { fee: StellarSdk.BASE_FEE, networkPassphrase }).addOperation(contract.call(functionName, ...args)).setTimeout(30).build();
  const preparedTx = await rpc.prepareTransaction(tx);
  preparedTx.sign(keypair);
  //const txResult = await rpc.sendTransaction(preparedTx);
  const simulationResult = await rpc.simulateTransaction(preparedTx);
  alert(simulationResult.result.retval['_value']);
}
func();
`;
}

async function init() {
  const keyStore = localStorage.getItem('secretKey');
  if (keyStore) {
    keypair = StellarSdk.Keypair.fromSecret(keyStore);
    publicKey = keypair.publicKey();
    document.getElementById('deploy-console').innerHTML += `Keypair Loaded. Public Key: ${publicKey}<br />`;
    document.getElementById('wallet-info').innerHTML = `Connected: ${publicKey}`;
    document.getElementById('deploy-button').disabled = false;
  }
  const contractCode = localStorage.getItem('contractCode');
  if (!contractCode) {
    resetCode();
  } else {
    editor.setValue(contractCode);
    const integrateCode = localStorage.getItem('integrateCode');
    document.getElementById('integrate-editor').value = integrateCode;
  }
  editor.onDidChangeModelContent(() => {
    const currentCode = editor.getValue();
    localStorage.setItem('contractCode', currentCode);
  });
  document.getElementById('integrate-editor').addEventListener('input', () => {
    localStorage.setItem('integrateCode', document.getElementById('integrate-editor').value);
  });
  document.getElementById('reset-code').onclick = () => { resetCode() };
  document.getElementById('run-tests').onclick = () => runTests();
  document.getElementById('compile-code').onclick = () => compileCode();
}

document.querySelectorAll('.sidebar-icon').forEach(icon => {
  icon.addEventListener('click', function() {
    const panelId = this.getAttribute('data-panel') + '-panel';
    if (panelId == 'home-panel') window.location = "/";
    if (panelId == 'github-panel') window.location = "https://github.com/jamesbachini/Soroban-Playground";
    document.querySelectorAll('.sidebar-icon').forEach(i => i.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    this.classList.add('active');
    document.getElementById(panelId).classList.add('active');
    if (panelId == 'integrate-panel') {

    } else {

    }
  });
});

window.addEventListener('resize', function() {
  if (editor) {
    editor.layout();
  }
});