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

