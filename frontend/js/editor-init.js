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

