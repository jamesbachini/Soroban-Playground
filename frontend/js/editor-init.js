window.editorReadyPromise = new Promise((resolve, reject) => {
  require(['vs/editor/editor.main'], async function () {
    try {
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

      window.addEventListener('resize', () => {
        checkMenuOverflow();
      });

      resolve(editor);
    } catch (error) {
      reject(error);
    }
  }, reject);
});
