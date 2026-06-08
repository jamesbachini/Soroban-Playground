const PAGE_ORDER = [
  'create',
  'settings',
  'ai',
  'test',
  'build',
  'deploy',
  'explore',
  'academy',
];

const PANEL_CSS = {
  create: './style/workspace.css?v=0.8.0',
  settings: './style/settings.css?v=0.8.0',
  ai: './style/ai.css?v=0.8.0',
  deploy: './style/deploy.css?v=0.8.0',
  explore: './style/deploy.css?v=0.8.0',
  academy: './style/academy.css?v=0.8.0',
};

const LEGACY_SCRIPTS = [
  './js/state.js?v=0.8.0',
  './js/workspaces.js?v=0.8.0',
  './js/academy.js?v=0.8.0',
  './js/editor-init.js?v=0.8.0',
  './js/console-utils.js?v=0.8.0',
  './js/build-test.js?v=0.8.0',
  './js/explore.js?v=0.8.0',
  './js/network-settings.js?v=0.8.0',
  './js/wallet-deploy.js?v=0.8.0',
  './js/app-init.js?v=0.8.0',
];

const loadedCss = new Set();

function loadCssForPanel(panelName) {
  const href = PANEL_CSS[panelName];
  if (!href || loadedCss.has(href)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.panelCss = panelName;
  document.head.appendChild(link);
  loadedCss.add(href);
}

async function loadPage(name) {
  const response = await fetch(`./pages/${name}.html?v=0.8.0`);
  if (!response.ok) {
    throw new Error(`Failed to load ${name} panel (${response.status})`);
  }
  const template = document.createElement('template');
  template.innerHTML = await response.text();
  const fragment = template.content;

  const panelContainer = document.getElementById('panel-container');
  fragment.querySelectorAll('.panel').forEach((panel) => {
    panelContainer.appendChild(panel);
  });
}

async function loadPages() {
  const loading = document.getElementById('panel-loading');
  try {
    await Promise.all(PAGE_ORDER.map(loadPage));
  } finally {
    loading?.remove();
  }
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

async function loadLegacyScripts() {
  for (const src of LEGACY_SCRIPTS) {
    await loadScript(src);
  }
}

function wirePanelCssLoading() {
  loadCssForPanel('create');
  document.querySelectorAll('.sidebar-icon[data-panel]').forEach((icon) => {
    icon.addEventListener('click', () => loadCssForPanel(icon.dataset.panel));
  });

  const originalActivatePanel = window.activatePanel;
  if (typeof originalActivatePanel === 'function') {
    window.activatePanel = function activatePanelWithCss(panelId, options = {}) {
      const panelName = String(panelId || '').replace(/-panel$/, '');
      loadCssForPanel(panelName);
      return originalActivatePanel.call(this, panelId, options);
    };
  }
}

try {
  await loadPages();
  await loadLegacyScripts();
  wirePanelCssLoading();
} catch (error) {
  console.error(error);
  const panelContainer = document.getElementById('panel-container');
  if (panelContainer) {
    panelContainer.innerHTML = `<div class="panel active"><h1>Frontend failed to load</h1><pre>${error.message}</pre></div>`;
  }
}
