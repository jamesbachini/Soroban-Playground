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

function getAcademyLessonProgress(lessonId = ACTIVE_ACADEMY_LESSON_ID) {
  return academyProgress[lessonId] || {};
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
  renderAcademyProgress();
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

function setAcademyStepState(elementId, done, doneText, pendingText) {
  const element = document.getElementById(elementId);
  if (!element) return;
  element.textContent = done ? doneText : pendingText;
  element.classList.toggle('complete', Boolean(done));
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

function renderAcademyCurriculum() {
  const container = document.getElementById('academy-curriculum-list');
  if (!container) return;

  container.innerHTML = '';
  const lessons = getAcademyLessons();
  const columns = [lessons.slice(0, 5), lessons.slice(5)];

  columns.forEach((columnLessons) => {
    const list = createAcademyElement('div', 'academy-lesson-list');
    columnLessons.forEach((lesson) => {
      const progress = getAcademyLessonProgress(lesson.id);
      const completed = Boolean(progress.completedAt);
      const active = lesson.id === activeAcademyLessonId;
      const row = createAcademyElement('button', 'academy-course-row');
      row.type = 'button';
      row.dataset.lessonId = lesson.id;
      row.classList.toggle('active', active);
      row.classList.toggle('done', completed);
      row.classList.toggle('coming-soon', Boolean(lesson.comingSoon));
      row.setAttribute('aria-pressed', active ? 'true' : 'false');

      const iconClass = lesson.comingSoon ? 'fas fa-lock' : lesson.format?.includes('Video') ? 'fas fa-play' : 'fas fa-file-lines';
      const statusIcon = lesson.comingSoon ? 'far fa-clock' : completed ? 'fas fa-check-circle' : active ? 'fas fa-circle' : 'far fa-circle';
      row.innerHTML = `
        <span class="academy-lesson-number">${lesson.number}</span>
        <i class="${iconClass}" aria-hidden="true"></i>
        <strong></strong>
        <span></span>
        <span></span>
        <i class="${statusIcon}" aria-hidden="true"></i>
      `;
      row.querySelector('strong').textContent = lesson.title;
      const detailSpans = row.querySelectorAll('span:not(.academy-lesson-number)');
      detailSpans[0].textContent = lesson.comingSoon ? 'Soon' : lesson.format;
      detailSpans[1].textContent = lesson.duration;
      row.addEventListener('click', () => selectAcademyLesson(lesson.id));
      list.appendChild(row);
    });
    container.appendChild(list);
  });
}

function renderAcademyLessonGuide(lesson) {
  const guide = document.getElementById('academy-lesson-guide');
  if (!guide) return;

  guide.innerHTML = '';
  const heading = createAcademyElement('div', 'academy-guide-heading');
  const headingCopy = createAcademyElement('div');
  const eyebrow = createAcademyElement('span', 'academy-eyebrow', `Lesson ${lesson.number} - ${lesson.course}`);
  const title = createAcademyElement('h2', '', lesson.title);
  const summary = createAcademyElement('p', '', lesson.summary);
  headingCopy.append(eyebrow, title, summary);
  const state = createAcademyElement('span', 'academy-guide-state', lesson.comingSoon ? 'Coming soon' : getAcademyLessonCompletion(lesson) ? 'Completed' : 'Available');
  if (lesson.comingSoon) state.classList.add('coming-soon');
  if (getAcademyLessonCompletion(lesson)) state.classList.add('complete');
  heading.append(headingCopy, state);
  guide.appendChild(heading);

  if (lesson.comingSoon) {
    const soon = createAcademyElement('div', 'academy-coming-soon-note');
    soon.innerHTML = '<i class="far fa-clock" aria-hidden="true"></i><span>This lesson is planned and will be added to the Academy soon.</span>';
    guide.appendChild(soon);
    return;
  }

  const body = createAcademyElement('div', 'academy-guide-body');
  const outcomes = createAcademyElement('section', 'academy-guide-section');
  outcomes.appendChild(createAcademyElement('h3', '', 'Learning Goals'));
  const goalsList = createAcademyElement('ul');
  lesson.objectives.forEach((objective) => {
    goalsList.appendChild(createAcademyElement('li', '', objective));
  });
  outcomes.appendChild(goalsList);

  const steps = createAcademyElement('section', 'academy-guide-section academy-guide-steps');
  steps.appendChild(createAcademyElement('h3', '', 'Lesson Path'));
  lesson.sections.forEach((section) => {
    const article = createAcademyElement('article', 'academy-guide-step');
    article.appendChild(createAcademyElement('h4', '', section.title));
    article.appendChild(createAcademyElement('p', '', section.body));
    article.appendChild(createAcademyElement('span', 'academy-guide-action', section.action));
    steps.appendChild(article);
  });

  const practice = createAcademyElement('section', 'academy-guide-section');
  practice.appendChild(createAcademyElement('h3', '', 'Practice Checklist'));
  const practiceList = createAcademyElement('ul');
  lesson.practice.forEach((item) => {
    practiceList.appendChild(createAcademyElement('li', '', item));
  });
  practice.appendChild(practiceList);

  body.append(outcomes, steps, practice);
  guide.appendChild(body);
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

  if (primaryButton) {
    const primaryLabel = primaryButton.querySelector('strong');
    const primaryHelp = primaryButton.querySelector('small');
    if (lesson.primaryAction === 'ai-assistant') {
      if (primaryLabel) primaryLabel.textContent = 'Open AI Assistant';
      if (primaryHelp) primaryHelp.textContent = 'Prompt the workspace assistant';
    } else if (lesson.primaryAction === 'mcp-setup') {
      if (primaryLabel) primaryLabel.textContent = 'Open MCP Setup';
      if (primaryHelp) primaryHelp.textContent = 'Connect Claude Code or Codex';
    } else {
      if (primaryLabel) primaryLabel.textContent = 'Open Course Material';
      if (primaryHelp) primaryHelp.textContent = 'Load lesson files into the editor';
    }
    primaryButton.disabled = isComingSoon;
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
      ? 'This lesson is planned and will be added soon.'
      : needsDeployment
      ? 'Practice and test in a real Soroban environment.'
      : 'Mark this lesson complete after you finish the checklist.';
  }
}

function renderAcademyProgress() {
  const lesson = getAcademyLesson();
  const progress = getAcademyLessonProgress(lesson.id);
  const completed = Boolean(progress.completedAt);
  const videoStarted = Boolean(progress.videoStartedAt);
  const codeImported = Boolean(progress.codeImportedAt);
  const completedSteps = [videoStarted, codeImported, completed].filter(Boolean).length;
  const lessonPercent = lesson.comingSoon ? 0 : Math.round((completedSteps / 3) * 100);
  const coursePercent = getAcademyCourseProgressPercent();
  const availableLessons = getAcademyAvailableLessons();
  const completedCount = availableLessons.filter(getAcademyLessonCompletion).length;

  const percentEl = document.getElementById('academy-progress-percent');
  const bottomPercentEl = document.getElementById('academy-bottom-progress-percent');
  const completedCountEl = document.getElementById('academy-completed-count');
  const ringEl = document.querySelector('.academy-ring');
  const fillEl = document.getElementById('academy-progress-fill');
  const stateEl = document.getElementById('academy-lesson-state');
  const verifiedLink = document.getElementById('academy-verified-link');
  const contractInput = document.getElementById('academy-contract-id');

  setElementText('academy-featured-course', lesson.course);
  setElementText('academy-featured-title', lesson.title);
  setElementText('academy-featured-summary', lesson.summary);
  setElementText('academy-featured-level', lesson.level);
  setElementText('academy-featured-count', `${getAcademyLessons().length} lessons`);
  setElementText('academy-featured-time', 'First 3 available');
  setElementText('academy-featured-format', lesson.format);
  setElementText('academy-current-video-title', `Lesson ${lesson.number}: ${lesson.videoTitle || lesson.title}`);
  setElementText('academy-lesson-count', `${completedCount} / ${availableLessons.length}`);
  setElementText('academy-total-time', '95m');

  if (percentEl) percentEl.textContent = `${coursePercent}%`;
  if (bottomPercentEl) bottomPercentEl.textContent = `${coursePercent}%`;
  if (completedCountEl) completedCountEl.textContent = String(completedCount);
  if (ringEl) ringEl.style.background = `conic-gradient(var(--accent-color) ${coursePercent * 3.6}deg, rgba(255, 255, 255, 0.12) ${coursePercent * 3.6}deg)`;
  if (fillEl) fillEl.style.width = `${coursePercent}%`;
  if (stateEl) {
    stateEl.textContent = lesson.comingSoon ? 'Coming soon' : completed ? 'Completed' : lessonPercent > 0 ? 'In progress' : 'Not started';
    stateEl.classList.toggle('complete', completed);
  }

  setAcademyStepState('academy-video-progress', videoStarted, 'Started', 'Not started');
  setAcademyStepState('academy-import-progress', codeImported, 'Code imported', 'Code not imported');
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
  renderAcademyCurriculum();
  renderAcademyLessonGuide(lesson);
  renderAcademyTooling(lesson);
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
  if (!stage) return;

  if (academyYoutubePlayer && typeof academyYoutubePlayer.destroy === 'function') {
    academyYoutubePlayer.destroy();
    academyYoutubePlayer = null;
  }

  if (!lesson.videoId) {
    stage.innerHTML = `
      <div class="academy-video-placeholder">
        <i class="fab fa-youtube"></i>
        <span>${lesson.comingSoon ? 'This lesson is coming soon.' : 'Written lesson ready. Video will appear here when available.'}</span>
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
  setAcademyStatus('');
  renderAcademyProgress();
  initAcademyVideo();
}

function openAcademyPrimaryTool() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon) return;

  if (lesson.primaryAction === 'ai-assistant') {
    activateAiTab('assistant');
    activatePanel('ai-panel', { splitRatio: 0.36 });
    return;
  }

  if (lesson.primaryAction === 'mcp-setup') {
    activateAiTab('mcp');
    activatePanel('ai-panel', { splitRatio: 0.44 });
    return;
  }

  importAcademyLessonCode();
}

async function importAcademyLessonCode() {
  const lesson = getAcademyLesson();
  if (lesson.comingSoon) {
    setAcademyStatus('This lesson is coming soon.');
    return;
  }
  if (!lesson.githubUrl) {
    openAcademyPrimaryTool();
    return;
  }
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
  setAcademyStatus('Checking Testnet for the deployed hello world contract...');
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
    setAcademyStatus('Lesson complete. Testnet deployment verified.', 'success');
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
  setAcademyStatus('Lesson marked complete.', 'success');
}

function setupAcademy() {
  renderAcademyProgress();
  initAcademyVideo();

  const importButton = document.getElementById('academy-import-code');
  const continueButton = document.getElementById('academy-continue-course');
  const testButton = document.getElementById('academy-run-tests');
  const compileButton = document.getElementById('academy-compile-code');
  const deployButton = document.getElementById('academy-open-deploy');
  const verifyButton = document.getElementById('academy-verify-contract');
  const markButton = document.getElementById('academy-mark-complete');
  const contractInput = document.getElementById('academy-contract-id');

  if (importButton) importButton.addEventListener('click', openAcademyPrimaryTool);
  if (continueButton) continueButton.addEventListener('click', openAcademyPrimaryTool);
  if (testButton) testButton.addEventListener('click', runAcademyTests);
  if (compileButton) compileButton.addEventListener('click', compileAcademyCode);
  if (deployButton) deployButton.addEventListener('click', openAcademyDeploy);
  if (verifyButton) verifyButton.addEventListener('click', verifyAcademyContract);
  if (markButton) markButton.addEventListener('click', completeAcademyLesson);
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
