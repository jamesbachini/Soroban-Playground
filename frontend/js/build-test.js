async function compileCode() {
  const compileButton = document.getElementById('compile-code');
  trackAnalyticsEvent('compile_to_wasm_click');
  compileButton.disabled = true;
  scrollButtonToPanelTop(compileButton);
  const startTime = performance.now();
  let buildStatus = 'failed';
  let buildFailureReason = '';

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
      buildFailureReason = 'http_error';
      return;
    }

    if (!response.body) {
      const resultText = await response.text();
      appendConsoleText(consoleEl, resultText);
      statusEl.innerText = `Compilation failed: ${elapsedSeconds(startTime)}s`;
      buildFailureReason = 'empty_response';
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
      buildStatus = 'success';
    } else {
      statusEl.innerText = `Compilation failed: ${elapsedSeconds(startTime)}s`;
      buildFailureReason = 'missing_wasm';
    }
  } catch (err) {
    console.error(err);
    statusEl.innerText = `Compilation failed: ${elapsedSeconds(startTime)}s`;
    buildFailureReason = 'network_error';
  } finally {
    clearInterval(interval);
    compileButton.disabled = false;
    trackAnalyticsEvent('build_completed', {
      status: buildStatus,
      duration_seconds: elapsedSeconds(startTime),
      failure_reason: buildFailureReason || undefined,
    });
  }
}

async function runTests() {
  await runTestPanelCommand({
    buttonId: 'run-tests',
    endpoint: '/test',
    analyticsEventName: 'unit_tests_completed',
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
  errorStatus,
  analyticsEventName
}) {
  const activeButton = document.getElementById(buttonId);
  setTestActionButtonsDisabled(true);
  scrollButtonToPanelTop(activeButton);
  const startTime = performance.now();
  let commandStatus = 'failed';
  let failureReason = '';

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
      failureReason = 'http_error';
      return;
    }

    if (!response.body) {
      const resultText = await response.text();
      appendConsoleText(consoleEl, resultText);
      statusEl.innerText = errorStatus;
      failureReason = 'empty_response';
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

    commandStatus = hasErrors ? 'failed' : 'success';
    if (hasErrors) failureReason = 'command_errors';
    statusEl.innerText = hasErrors ? errorStatus : successStatus;
  } catch (err) {
    statusEl.innerText = `Network error: ${err.message}`;
    console.error(err);
    failureReason = 'network_error';
  } finally {
    clearInterval(interval);
    setTestActionButtonsDisabled(false);
    if (analyticsEventName) {
      trackAnalyticsEvent(analyticsEventName, {
        status: commandStatus,
        duration_seconds: elapsedSeconds(startTime),
        failure_reason: failureReason || undefined,
      });
    }
  }
}
