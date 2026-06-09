let editor;
let publicKey = null;
let keypair;
let rpc;
let horizon;
let rpcUrl;
let horizonUrl;
let networkPassphrase;
let network = 'TESTNET';
let walletKitAddress = null;
const contractSpecCache = new Map();
const friendbotUrls = {
  TESTNET: 'https://friendbot.stellar.org',
  FUTURENET: 'https://friendbot-futurenet.stellar.org',
};
const LOCAL_NETWORK_CONFIG_KEY = 'local-network-config';
const SELECTED_NETWORK_KEY = 'selected-network';
const LEGACY_EXPLORE_NETWORK_KEY = 'last-explore-network';
const THEME_STORAGE_KEY = 'soropg-theme';
const ACADEMY_PROGRESS_KEY = 'soropg-academy-progress';
const SUPPORTED_NETWORKS = new Set(['TESTNET', 'LOCAL', 'FUTURENET', 'PUBLIC']);
const DEFAULT_LOCAL_NETWORK_CONFIG = Object.freeze({
  rpcUrl: 'http://localhost:8000/rpc',
  horizonUrl: 'http://localhost:8000',
  networkPassphrase: 'Standalone Network ; February 2017',
});
let localNetworkConfig = null;
let fundingMessageTimeout = null;
let fundingMessageInterval = null;
let fundingMessageId = 0;
let academyProgress = {};
let academyYoutubeApiPromise = null;
let academyYoutubePlayer = null;
const PANEL_MIN_HEIGHT = 200;
let defaultPanelSplitRatio = null;
let lastPanelSplitRatio = null;
let isPanelCollapsed = false;
let currentTheme = localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark';

document.body.dataset.theme = currentTheme;

// Initialize Stellar Wallet Kit
const { StellarWalletsKit, KitEventType, SwkAppDarkTheme, defaultModules } = window.MyWalletKit;
StellarWalletsKit.init({
  theme: SwkAppDarkTheme,
  modules: defaultModules(),
});

const WORKSPACE_STORAGE_KEY = 'soropg-workspaces';
const LEGACY_FILES_STORAGE_KEY = 'soroban-files';
const WORKSPACE_SCHEMA_VERSION = 1;
const MCP_API_KEY_STORAGE_KEY = 'soropg-mcp-api-key';
const MCP_SESSION_STORAGE_KEY = 'soropg-mcp-session-id';
const MCP_HEARTBEAT_MS = 25_000;
const MCP_POLL_MS = 4_000;
const MCP_PUBLISH_DEBOUNCE_MS = 1_000;
const MAIN_SOURCE_CANDIDATES = ['src/lib.rs', 'lib.rs'];
const ACADEMY_TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org';
const ACADEMY_TESTNET_EXPERT_BASE = 'https://stellar.expert/explorer/testnet/contract';
const ACADEMY_LESSONS = Object.freeze({
  'foundations-hello-world': Object.freeze({
    id: 'foundations-hello-world',
    number: 1,
    title: 'Hello World: Build, Test, and Deploy',
    course: 'Foundations',
    format: 'Written + Practice',
    duration: '35m',
    level: 'Beginner',
    summary: 'Create a basic Soroban contract in SoroPG, understand the Rust contract structure, run your first unit test, build the WASM, deploy to testnet, and invoke the contract from the IDE.',
    githubUrl: 'https://github.com/stellar/soroban-examples/tree/main/hello_world',
    docsSlug: 'academy/hello-world-build-test-deploy',
    preferredFile: 'src/lib.rs',
    expectedMethods: Object.freeze(['hello']),
    primaryAction: 'import',
    completionMode: 'deploy',
    videoId: '',
    videoTitle: 'Hello World contract walkthrough',
    objectives: Object.freeze([
      'Identify the contract struct, impl block, exported function, and Soroban SDK types in a Rust contract.',
      'Run the included unit test before changing deployment state.',
      'Build a WASM artifact, deploy it to Stellar Testnet, and verify the exported hello function.',
      'Use the IDE contract explorer to invoke the deployed function with a string argument.',
    ]),
    sections: Object.freeze([
      Object.freeze({
        title: '1. Import the starter contract',
        body: 'Open the course material to load Stellar\'s hello world example into a fresh SoroPG workspace. Start in src/lib.rs and find the HelloContract type, the #[contractimpl] block, and the hello(env, to) function.',
        action: 'Open Course Material',
      }),
      Object.freeze({
        title: '2. Read the Rust contract shape',
        body: 'The contract is intentionally small: Env gives access to ledger APIs, String represents text passed through the contract interface, and Vec<String> is the return value. Notice that public contract functions are ordinary Rust associated functions exposed through the macro.',
        action: 'Inspect src/lib.rs',
      }),
      Object.freeze({
        title: '3. Run the unit test',
        body: 'Switch to the Test panel and run the template test. The test registers the contract in a simulated environment and calls hello with a string. Treat this as the fast feedback loop before every build.',
        action: 'Run Unit Tests',
      }),
      Object.freeze({
        title: '4. Build, deploy, and invoke',
        body: 'Build the WASM, connect or create a testnet wallet, deploy the contract, then paste the contract id back into Academy. After verification, open Explore, load the contract id, and invoke hello from the generated interface.',
        action: 'Deploy Contract',
      }),
    ]),
    practice: Object.freeze([
      'Change the returned greeting string, rerun tests, and confirm the test catches any mismatch.',
      'Deploy only after tests and build both pass.',
      'Invoke hello with your own name-like string from the Explore panel.',
    ]),
  }),
  'ai-assisted-development': Object.freeze({
    id: 'ai-assisted-development',
    number: 2,
    title: 'AI-Assisted Contract Development',
    course: 'AI Workflow',
    format: 'Written + Practice',
    duration: '30m',
    level: 'Beginner',
    summary: 'Use the built-in AI assistant to add new functions, refactor contract code, explain compiler errors, generate tests, and speed up the edit-build-test loop without losing control of the code.',
    githubUrl: 'https://github.com/stellar/soroban-examples/tree/main/hello_world',
    docsSlug: 'academy/ai-assisted-contract-development',
    preferredFile: 'src/lib.rs',
    expectedMethods: Object.freeze([]),
    primaryAction: 'ai-assistant',
    completionMode: 'manual',
    videoId: '',
    videoTitle: 'AI-assisted contract development workflow',
    objectives: Object.freeze([
      'Use the assistant as an editor and reviewer while keeping every code change visible in the workspace.',
      'Ask for small, testable contract changes instead of broad rewrites.',
      'Use compiler errors and failing tests as precise prompts for the next assistant turn.',
      'Generate or refine tests before accepting behavior changes.',
    ]),
    sections: Object.freeze([
      Object.freeze({
        title: '1. Start from working code',
        body: 'Use the hello world workspace from Lesson 1 or any current contract that already builds. Run tests once before asking for changes so you know the baseline is clean.',
        action: 'Use Current Workspace',
      }),
      Object.freeze({
        title: '2. Ask for one narrow edit',
        body: 'Open AI Assistant and ask for a concrete addition such as "add a goodbye function that returns [bye, name] and update the tests". Keep prompts scoped to one behavior so the diff is easy to review.',
        action: 'Open AI Assistant',
      }),
      Object.freeze({
        title: '3. Review before you run',
        body: 'Read the changed Rust code in the editor. Check exported method names, SDK types, and test expectations. If something looks unclear, ask the assistant to explain the exact line instead of accepting it blindly.',
        action: 'Review the diff',
      }),
      Object.freeze({
        title: '4. Close the loop with tests',
        body: 'Run tests, then use any compiler or assertion error as the next prompt. A useful pattern is: paste the error, say what you expected, and ask for the smallest fix.',
        action: 'Run Unit Tests',
      }),
    ]),
    practice: Object.freeze([
      'Ask the assistant to add one exported function and one unit test for it.',
      'Ask it to explain a compiler error in plain language, then make the smallest fix.',
      'Ask for a refactor that improves naming without changing public behavior.',
    ]),
  }),
  'agentic-ai-mcp': Object.freeze({
    id: 'agentic-ai-mcp',
    number: 3,
    title: 'SoroPG + Agentic AI = Magic: Claude Code or Codex via MCP',
    course: 'AI Workflow',
    format: 'Written + Setup',
    duration: '30m',
    level: 'Intermediate',
    summary: 'Install and connect an MCP server so external agentic coding tools can read, edit, and improve SoroPG projects, turning the browser IDE into an AI-native contract development workspace.',
    githubUrl: '',
    docsSlug: 'academy/agentic-ai-mcp',
    preferredFile: 'src/lib.rs',
    expectedMethods: Object.freeze([]),
    primaryAction: 'mcp-setup',
    completionMode: 'manual',
    videoId: '',
    videoTitle: 'Connecting SoroPG to agentic coding tools',
    objectives: Object.freeze([
      'Understand the browser tab as the bridge between SoroPG workspaces and an external MCP client.',
      'Generate a SoroPG browser key and add the npx MCP server to Claude Code, Codex, or another MCP client.',
      'Confirm the agent can list projects before allowing edits.',
      'Use agentic tools for multi-file improvements while keeping SoroPG as the live contract workspace.',
    ]),
    sections: Object.freeze([
      Object.freeze({
        title: '1. Open the MCP setup panel',
        body: 'The MCP setup screen shows the browser bridge status, the API URL, active workspace, last sync time, and the JSON config your local client needs.',
        action: 'Open MCP Setup',
      }),
      Object.freeze({
        title: '2. Generate a browser key',
        body: 'Generate a key in SoroPG. This authorizes your local MCP server to reach the workspaces in this open browser tab, so keep the tab open while the agent works.',
        action: 'Generate Key',
      }),
      Object.freeze({
        title: '3. Install the MCP server in your client',
        body: 'Use Node.js 20 or newer and configure your MCP client to run npx -y soropg-mcp. Use the setup docs for your client, reload the client, then ask it to run soropg_list_projects.',
        action: 'Open Setup Docs',
      }),
      Object.freeze({
        title: '4. Let the agent make a controlled edit',
        body: 'Ask Claude Code or Codex to inspect the active project, explain the contract, and make one small improvement. Return to SoroPG, review the changed files, then run tests and build.',
        action: 'Run Agent Task',
      }),
    ]),
    practice: Object.freeze([
      'Ask the external agent to list SoroPG projects and identify the active workspace.',
      'Ask it to add or improve one test, then verify the result in SoroPG.',
      'Ask it to summarize every file it changed before you deploy anything.',
    ]),
  }),
  'soroban-state-storage-types': Object.freeze({
    id: 'soroban-state-storage-types',
    number: 4,
    title: 'State, Storage, and Data Types in Soroban',
    course: 'Core Soroban',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Intermediate',
    summary: 'Learn how contracts store data using instance, persistent, and temporary storage; build a counter or profile contract; and understand DataKey, Address, Symbol, Vec, Map, and custom contract types.',
    comingSoon: true,
  }),
  'authorization-auth-systems': Object.freeze({
    id: 'authorization-auth-systems',
    number: 5,
    title: 'Authorization: Building authentication systems',
    course: 'Core Soroban',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Intermediate',
    summary: 'Add real access control with require_auth, admin-only functions, user-owned state, and safe initialization patterns so students understand who is allowed to do what on-chain.',
    comingSoon: true,
  }),
  'openzeppelin-token': Object.freeze({
    id: 'openzeppelin-token',
    number: 6,
    title: 'Building a Token with OpenZeppelin',
    course: 'Applied Contracts',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Intermediate',
    summary: 'Use the OpenZeppelin wizard to create a fungible stablecoin token that can be swapped 1:1 with USDC.',
    comingSoon: true,
  }),
  'events-errors-ux': Object.freeze({
    id: 'events-errors-ux',
    number: 7,
    title: 'Events, Errors, and Better Contract UX',
    course: 'Core Soroban',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Intermediate',
    summary: 'Add structured events for indexing and debugging, replace panics with custom errors, and design contract functions that are easier for frontends, explorers, and AI tools to understand.',
    comingSoon: true,
  }),
  'testing-soroban-contracts': Object.freeze({
    id: 'testing-soroban-contracts',
    number: 8,
    title: 'Testing Soroban Contracts',
    course: 'Quality',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Intermediate',
    summary: 'Write useful unit tests with soroban-sdk test utilities, mock authorization, test failures, inspect emitted events, simulate ledger time, and build confidence before deploying to testnet.',
    comingSoon: true,
  }),
  'stellar-contract-security': Object.freeze({
    id: 'stellar-contract-security',
    number: 9,
    title: 'Stellar Smart Contracts Security',
    course: 'Security',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Advanced',
    summary: 'Review the most common Soroban mistakes: missing auth, reinitialization, unchecked arithmetic, bad storage keys, unsafe cross-contract calls, TTL/archival issues, and poor input validation.',
    comingSoon: true,
  }),
  'playground-to-production': Object.freeze({
    id: 'playground-to-production',
    number: 10,
    title: 'From Playground to Production',
    course: 'Production',
    format: 'Coming soon',
    duration: 'Coming soon',
    level: 'Advanced',
    summary: 'Let\'s build something useful and look at an end-to-end workflow for preparing a contract for users: optimize WASM size, deploy to testnet, invoke functions, profile resource usage, handle common CLI/SDK issues, and create a final project that can extend into a real dApp.',
    comingSoon: true,
  }),
});
const ACADEMY_LESSON_ORDER = Object.freeze([
  'foundations-hello-world',
  'ai-assisted-development',
  'agentic-ai-mcp',
  'soroban-state-storage-types',
  'authorization-auth-systems',
  'openzeppelin-token',
  'events-errors-ux',
  'testing-soroban-contracts',
  'stellar-contract-security',
  'playground-to-production',
]);
const ACTIVE_ACADEMY_LESSON_ID = 'foundations-hello-world';
let activeAcademyLessonId = ACTIVE_ACADEMY_LESSON_ID;

let workspaces = [];
let activeWorkspaceId = null;
let files = {};
let currentFile = null;
let isLoadingFile = false;
let tabsInitialized = false;
let openTabs = new Set();
let isApplyingMcpUpdate = false;
let isPublishingMcpSnapshot = false;
let mcpPublishTimer = null;
let mcpHeartbeatTimer = null;
let mcpPollTimer = null;
let mcpLastSeq = 0;
let mcpLastSyncAt = null;
