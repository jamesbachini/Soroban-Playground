let academyView = 'welcome';

function loadAcademyProgress() {
  try {
    const stored = localStorage.getItem(ACADEMY_PROGRESS_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    console.error('Failed to load academy progress:', error);
    return {};
  }
}

function saveAcademyProgress() {
  localStorage.setItem(ACADEMY_PROGRESS_KEY, JSON.stringify(academyProgress));
}

function getAcademyLessons() {
  return ACADEMY_LESSON_ORDER.map((lessonId) => ACADEMY_LESSONS[lessonId]).filter(Boolean);
}

function getAcademyLesson(lessonId = activeAcademyLessonId) {
  return ACADEMY_LESSONS[lessonId] || ACADEMY_LESSONS[ACTIVE_ACADEMY_LESSON_ID];
}

function getAcademyLessonProgress(lessonId = activeAcademyLessonId) {
  return academyProgress[lessonId] || {};
}

function getAcademyLessonCompletion(lesson) {
  return Boolean(getAcademyLessonProgress(lesson.id).completedAt);
}

function getAcademyAvailableLessons() {
  return getAcademyLessons().filter((lesson) => !lesson.comingSoon);
}

function getAcademyCourseProgressPercent() {
  const availableLessons = getAcademyAvailableLessons();
  if (!availableLessons.length) return 0;
  const completedCount = availableLessons.filter(getAcademyLessonCompletion).length;
  return Math.round((completedCount / availableLessons.length) * 100);
}

function getAcademyLessonStatus(lesson) {
  const progress = getAcademyLessonProgress(lesson.id);
  if (lesson.comingSoon) return 'coming-soon';
  if (progress.completedAt) return 'completed';
  if (progress.videoStartedAt || progress.codeImportedAt) return 'in-progress';
  return 'available';
}

function getAcademyDocsHref(lesson) {
  return lesson.docsSlug ? `/docs/${lesson.docsSlug}/` : '/docs/academy/';
}

function setAcademyLessonProgress(lessonId, patch) {
  academyProgress = {
    ...academyProgress,
    [lessonId]: {
      ...getAcademyLessonProgress(lessonId),
      ...patch,
      updatedAt: Date.now(),
    },
  };
  saveAcademyProgress();
  renderAcademy();
}

function setAcademyStatus(message, type = 'muted') {
  const statusEl = document.getElementById('academy-verification-status');
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.remove('error', 'success');
  if (type === 'error' || type === 'success') {
    statusEl.classList.add(type);
  }
}

function setElementText(elementId, value) {
  const element = document.getElementById(elementId);
  if (element) element.textContent = value;
}

function createAcademyElement(tagName, className = '', text = '') {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

function setAcademyStepState(elementId, done, doneText, pendingText) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = done ? doneText : pendingText;
  element.classList.toggle('complete', Boolean(done));
}

function renderAcademyViewState() {
  const welcomeView = document.getElementById('academy-welcome-view');
  const courseView = document.getElementById('academy-course-view');
  if (welcomeView) welcomeView.hidden = academyView !== 'welcome';
  if (courseView) courseView.hidden = academyView !== 'course';
}

function renderAcademyWelcome() {
  const lessons = getAcademyLessons();
  const availableLessons = getAcademyAvailableLessons();
  const completedCount = availableLessons.filter(getAcademyLessonCompletion).length;
  const percent = getAcademyCourseProgressPercent();
  const container = document.getElementById('academy-curriculum-list');
  const ringEl = document.querySelector('#academy-welcome-view .academy-ring');

  setElementText('academy-course-progress-percent', `${percent}%`);
  setElementText('academy-progress-count', `${completedCount} / ${availableLessons.length}`);
  if (ringEl) {
    ringEl.style.background = `conic-gradient(var(--accent-color) ${percent * 3.6}deg, rgba(255, 255, 255, 0.12) ${percent * 3.6}deg)`;
  }
  if (!container) return;

  container.innerHTML = '';
  lessons.forEach((lesson) => {
    const status = getAcademyLessonStatus(lesson);
    const card = createAcademyElement('button', `academy-course-card ${status}`);
    card.type = 'button';
    card.dataset.lessonId = lesson.id;
    card.setAttribute('aria-label', `${lesson.title}, ${getAcademyStatusLabel(status)}`);

    const statusIcon = {
      'completed': 'fas fa-check-circle',
      'in-progress': 'fas fa-circle',
      'available': 'far fa-circle',
      'coming-soon': 'fas fa-lock',
    }[status];

    card.innerHTML = `
      <span class="academy-course-number">${lesson.number}</span>
      <span class="academy-course-card-copy">
        <strong></strong>
        <small></small>
      </span>
      <span class="academy-card-meta"></span>
      <i class="${statusIcon}" aria-hidden="true"></i>
    `;
    card.querySelector('strong').textContent = lesson.title;
    card.querySelector('small').textContent = lesson.summary;
    card.querySelector('.academy-card-meta').textContent = lesson.comingSoon ? 'Coming soon' : `${lesson.duration} - ${lesson.level}`;
    card.addEventListener('click', () => selectAcademyLesson(lesson.id));
    container.appendChild(card);
  });
}

function getAcademyStatusLabel(status) {
  if (status === 'completed') return 'Completed';
  if (status === 'in-progress') return 'In progress';
  if (status === 'coming-soon') return 'Coming soon';
  return 'Available';
}

function renderAcademyList(listId, items = []) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = '';
  items.forEach((item) => {
    list.appendChild(createAcademyElement('li', '', item));
  });
}

function renderAcademyTooling(lesson) {
  const isComingSoon = Boolean(lesson.comingSoon);
  const primaryButton = document.getElementById('academy-import-code');
  const testButton = document.getElementById('academy-run-tests');
  const compileButton = document.getElementById('academy-compile-code');
  const deployButton = document.getElementById('academy-open-deploy');
  const verifyRow = document.getElementById('academy-verify-row');
  const verifyButton = document.getElementById('academy-verify-contract');
  const markButton = document.getElementById('academy-mark-complete');
  const contractInput = document.getElementById('academy-contract-id');
  const envBox = document.getElementById('academy-env-box');
  const liveTitle = document.getElementById('academy-live-title');
  const liveDescription = document.getElementById('academy-live-description');
  const writtenDoc = document.getElementById('academy-written-doc');

  if (primaryButton) {
    const primaryLabel = primaryButton.querySelector('strong');
    const primaryHelp = primaryButton.querySelector('small');
    const primaryIcon = primaryButton.querySelector('i');
    if (lesson.primaryAction === 'ai-assistant') {
      if (primaryLabel) primaryLabel.textContent = 'Open AI Assistant';
      if (primaryHelp) primaryHelp.textContent = 'Prompt the workspace assistant';
      if (primaryIcon) primaryIcon.className = 'fas fa-wand-magic-sparkles';
    } else if (lesson.primaryAction === 'mcp-setup') {
      if (primaryLabel) primaryLabel.textContent = 'Open MCP Setup';
      if (primaryHelp) primaryHelp.textContent = 'Connect Claude Code or Codex';
      if (primaryIcon) primaryIcon.className = 'fas fa-plug';
    } else {
      if (primaryLabel) primaryLabel.textContent = 'Open Course Material';
      if (primaryHelp) primaryHelp.textContent = 'Load lesson files into the editor';
      if (primaryIcon) primaryIcon.className = 'far fa-folder-open';
    }
    primaryButton.disabled = isComingSoon;
  }

  if (writtenDoc) {
    writtenDoc.href = getAcademyDocsHref(lesson);
    writtenDoc.classList.toggle('disabled', isComingSoon || !lesson.docsSlug);
    writtenDoc.setAttribute('aria-disabled', String(isComingSoon || !lesson.docsSlug));
  }

  [testButton, compileButton, deployButton].forEach((button) => {
    if (button) button.disabled = isComingSoon;
  });

  if (deployButton) {
    const label = deployButton.querySelector('strong');
    const help = deployButton.querySelector('small');
    if (lesson.primaryAction === 'mcp-setup') {
      if (label) label.textContent = 'Review Workspace';
      if (help) help.textContent = 'Return to the file editor';
    } else {
      if (label) label.textContent = 'Deploy Contract';
      if (help) help.textContent = 'Open the Testnet deploy flow';
    }
  }

  const needsDeployment = lesson.completionMode === 'deploy';
  if (envBox) envBox.hidden = isComingSoon || !needsDeployment;
  if (verifyRow) verifyRow.hidden = isComingSoon || !needsDeployment;
  if (verifyButton) verifyButton.disabled = isComingSoon || !needsDeployment;
  if (contractInput && activeAcademyLessonId !== lesson.id) contractInput.value = '';
  if (markButton) {
    markButton.hidden = isComingSoon || needsDeployment;
    markButton.disabled = isComingSoon;
  }
  if (liveTitle) liveTitle.textContent = isComingSoon ? 'Coming Soon' : needsDeployment ? 'Live Environment' : 'Lesson Completion';
  if (liveDescription) {
    liveDescription.textContent = isComingSoon
      ? 'This course is planned and will be added to the Academy soon.'
      : needsDeployment
        ? 'Deploy to Testnet, then paste the contract ID here to verify completion.'
        : 'Mark this course complete after you finish the tutorial and checklist.';
  }
}

function renderAcademyCourse() {
  const lesson = getAcademyLesson();
  const progress = getAcademyLessonProgress(lesson.id);
  const completed = Boolean(progress.completedAt);
  const videoStarted = Boolean(progress.videoStartedAt);
  const codeImported = Boolean(progress.codeImportedAt);
  const status = getAcademyLessonStatus(lesson);
  const verifiedLink = document.getElementById('academy-verified-link');
  const contractInput = document.getElementById('academy-contract-id');

  setElementText('academy-course-eyebrow', `Lesson ${lesson.number} - ${lesson.course}`);
  setElementText('academy-course-title', lesson.title);
  setElementText('academy-course-summary', lesson.summary);
  setElementText('academy-course-level', lesson.level || 'Course');
  setElementText('academy-course-duration', lesson.duration || 'Coming soon');
  setElementText('academy-course-format', lesson.format || 'Coming soon');
  setElementText('academy-current-video-title', lesson.videoTitle || lesson.title);

  const stateEl = document.getElementById('academy-lesson-state');
  if (stateEl) {
    stateEl.textContent = getAcademyStatusLabel(status);
    stateEl.className = `academy-state-pill ${status}`;
  }

  renderAcademyList('academy-objectives-list', lesson.objectives || ['This course is planned and will be added soon.']);
  renderAcademyList('academy-practice-list', lesson.practice || ['Course material will be available when this chapter launches.']);
  setAcademyStepState('academy-video-progress', videoStarted, 'Started', 'Not started');
  setAcademyStepState('academy-import-progress', codeImported, getAcademyPrimaryProgressLabel(lesson), getAcademyPrimaryPendingLabel(lesson));
  setAcademyStepState(
    'academy-complete-progress',
    completed,
    lesson.completionMode === 'deploy' ? 'Deployment verified' : 'Lesson completed',
    lesson.completionMode === 'deploy' ? 'Deployment not verified' : 'Checklist not completed',
  );

  if (progress.contractId && contractInput && !contractInput.value) {
    contractInput.value = progress.contractId;
  }
  if (verifiedLink) {
    if (progress.contractId) {
      verifiedLink.href = `${ACADEMY_TESTNET_EXPERT_BASE}/${progress.contractId}`;
      verifiedLink.classList.add('visible');
    } else {
      verifiedLink.classList.remove('visible');
    }
  }

  renderAcademyTooling(lesson);
}

function getAcademyPrimaryProgressLabel(lesson) {
  if (lesson.primaryAction === 'ai-assistant') return 'Assistant opened';
  if (lesson.primaryAction === 'mcp-setup') return 'MCP setup opened';
  return 'Code imported';
}

function getAcademyPrimaryPendingLabel(lesson) {
  if (lesson.primaryAction === 'ai-assistant') return 'Assistant not opened';
  if (lesson.primaryAction === 'mcp-setup') return 'MCP setup not opened';
  return 'Code not imported';
}

function renderAcademy() {
  renderAcademyViewState();
  renderAcademyWelcome();
  if (academyView === 'course') {
    renderAcademyCourse();
  }
}

function renderAcademyProgress() {
  renderAcademy();
}

function loadYouTubeIframeApi() {
  if (window.YT && window.YT.Player) {
    return Promise.resolve(window.YT);
  }
  if (academyYoutubeApiPromise) {
    return academyYoutubeApiPromise;
  }
  academyYoutubeApiPromise = new Promise((resolve) => {
    const previousReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof previousReady === 'function') previousReady();
      resolve(window.YT);
    };
    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  });
  return academyYoutubeApiPromise;
}

async function initAcademyVideo() {
  const lesson = getAcademyLesson();
  const stage = document.getElementById('academy-video-stage');
  if (!stage || academyView !== 'course') return;

  if (academyYoutubePlayer && typeof academyYoutubePlayer.destroy === 'function') {
    academyYoutubePlayer.destroy();
    academyYoutubePlayer = null;
  }

  if (!lesson.videoId) {
    stage.innerHTML = `
      <div class="academy-video-placeholder">
        <i class="fab fa-youtube"></i>
        <span>${lesson.comingSoon ? 'This course is coming soon.' : 'Video will appear here when available.'}</span>
      </div>
    `;
    return;
  }

  stage.innerHTML = '<div id="academy-youtube-player"></div>';
  try {
    const yt = await loadYouTubeIframeApi();
    academyYoutubePlayer = new yt.Player('academy-youtube-player', {
      videoId: lesson.videoId,
      playerVars: {
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onStateChange: (event) => {
          if (event.data === yt.PlayerState.PLAYING) {
            setAcademyLessonProgress(lesson.id, { videoStartedAt: Date.now() });
          }
        },
      },
    });
  } catch (error) {
    console.error('Failed to initialize academy video:', error);
    stage.innerHTML = `
      <div class="academy-video-placeholder">
        <i class="fab fa-youtube"></i>
        <span>Video could not be loaded.</span>
      </div>
    `;
  }
}

function selectAcademyLesson(lessonId) {
  activeAcademyLessonId = ACADEMY_LESSONS[lessonId] ? lessonId : ACTIVE_ACADEMY_LESSON_ID;
  academyView = 'course';
  setAcademyStatus('');
  renderAcademy();
  initAcademyVideo();
}

function showAcademyWelcome() {
  academyView = 'welcome';
  setAcademyStatus('');
  if (academyYoutubePlayer && typeof academyYoutubePlayer.destroy === 'function') {
    academyYoutubePlayer.destroy();
    academyYoutubePlayer = null;
  }
  renderAcademy();
}

function openAcademyPrimaryTool() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon) return;

  if (lesson.primaryAction === 'ai-assistant') {
    activateAiTab('assistant');
    activatePanel('ai-panel', { splitRatio: 0.36 });
    setAcademyLessonProgress(lesson.id, { codeImportedAt: Date.now() });
    return;
  }

  if (lesson.primaryAction === 'mcp-setup') {
    activateAiTab('mcp');
    activatePanel('ai-panel', { splitRatio: 0.44 });
    setAcademyLessonProgress(lesson.id, { codeImportedAt: Date.now() });
    return;
  }

  importAcademyLessonCode();
}

async function importAcademyLessonCode() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon) {
    setAcademyStatus('This course is coming soon.');
    return;
  }
  if (!lesson.githubUrl) return;

  const button = document.getElementById('academy-import-code');
  if (button) button.disabled = true;
  setAcademyStatus(`Importing ${lesson.title} from GitHub...`);
  try {
    await loadWorkspaceFromGithub(lesson.githubUrl, { createNew: true });
    setAcademyLessonProgress(lesson.id, { codeImportedAt: Date.now() });
    setWorkspaceStatus('Academy lesson code imported.');
    activatePanel('create-panel', { resetSplit: true });
    setAcademyStatus('Code imported. Run the tests next.', 'success');
  } catch (error) {
    setAcademyStatus(error?.message || 'Failed to import lesson code.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

async function runAcademyTests() {
  if (getAcademyLesson().comingSoon) return;
  activatePanel('test-panel', { splitRatio: 0.38 });
  await runTests();
}

async function compileAcademyCode() {
  if (getAcademyLesson().comingSoon) return;
  activatePanel('build-panel', { splitRatio: 0.38 });
  await compileCode();
}

function openAcademyDeploy() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon) return;
  if (lesson.primaryAction === 'mcp-setup') {
    activatePanel('create-panel', { resetSplit: true });
    return;
  }
  setActiveNetwork('TESTNET', { persist: true, logToDeployConsole: true });
  activatePanel('deploy-panel', { splitRatio: 0.38 });
}

function isValidContractId(contractId) {
  if (!contractId) return false;
  if (StellarSdk.StrKey?.isValidContract) {
    return StellarSdk.StrKey.isValidContract(contractId);
  }
  try {
    StellarSdk.StrKey.decodeContract(contractId);
    return true;
  } catch {
    return false;
  }
}

async function verifyAcademyContract() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon || lesson.completionMode !== 'deploy') return;
  const input = document.getElementById('academy-contract-id');
  const button = document.getElementById('academy-verify-contract');
  const contractId = input?.value.trim();

  if (!isValidContractId(contractId)) {
    setAcademyStatus('Enter a valid Stellar contract id that starts with C.', 'error');
    return;
  }

  if (button) button.disabled = true;
  setAcademyStatus('Checking Testnet for the deployed contract...');
  try {
    const client = await StellarSdk.contract.Client.from({
      contractId,
      rpcUrl: ACADEMY_TESTNET_RPC_URL,
      networkPassphrase: StellarSdk.Networks.TESTNET,
    });
    const methodNames = client.spec.funcs().map((fn) => fn.name().toString());
    const missingMethods = (lesson.expectedMethods || []).filter((method) => !methodNames.includes(method));
    if (missingMethods.length) {
      throw new Error(`Contract found, but it is missing: ${missingMethods.join(', ')}.`);
    }
    setAcademyLessonProgress(lesson.id, {
      completedAt: Date.now(),
      contractId,
    });
    setAcademyStatus('Course complete. Testnet deployment verified.', 'success');
  } catch (error) {
    console.error(error);
    setAcademyStatus(error?.message || 'Could not verify this Testnet contract.', 'error');
  } finally {
    if (button) button.disabled = false;
  }
}

function completeAcademyLesson() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon || lesson.completionMode === 'deploy') return;
  setAcademyLessonProgress(lesson.id, {
    completedAt: Date.now(),
    videoStartedAt: getAcademyLessonProgress(lesson.id).videoStartedAt || Date.now(),
  });
  setAcademyStatus('Course marked complete.', 'success');
}

function openAcademyWrittenDoc(event) {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon || !lesson.docsSlug) {
    event.preventDefault();
  }
}

function setupAcademy() {
  renderAcademy();

  const backButton = document.getElementById('academy-back-to-list');
  const importButton = document.getElementById('academy-import-code');
  const testButton = document.getElementById('academy-run-tests');
  const compileButton = document.getElementById('academy-compile-code');
  const deployButton = document.getElementById('academy-open-deploy');
  const verifyButton = document.getElementById('academy-verify-contract');
  const markButton = document.getElementById('academy-mark-complete');
  const contractInput = document.getElementById('academy-contract-id');
  const writtenDoc = document.getElementById('academy-written-doc');

  if (backButton) backButton.addEventListener('click', showAcademyWelcome);
  if (importButton) importButton.addEventListener('click', openAcademyPrimaryTool);
  if (testButton) testButton.addEventListener('click', runAcademyTests);
  if (compileButton) compileButton.addEventListener('click', compileAcademyCode);
  if (deployButton) deployButton.addEventListener('click', openAcademyDeploy);
  if (verifyButton) verifyButton.addEventListener('click', verifyAcademyContract);
  if (markButton) markButton.addEventListener('click', completeAcademyLesson);
  if (writtenDoc) writtenDoc.addEventListener('click', openAcademyWrittenDoc);
  if (contractInput) {
    contractInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        verifyAcademyContract();
      }
    });
    contractInput.addEventListener('input', () => setAcademyStatus(''));
  }
}

require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
