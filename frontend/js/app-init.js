localNetworkConfig = loadLocalNetworkConfig();
academyProgress = loadAcademyProgress();
currentTheme = getStoredTheme();
document.body.dataset.theme = currentTheme;

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

window.init = init;
window.appReadyPromise = (window.editorReadyPromise || Promise.resolve()).then(() => init());

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
