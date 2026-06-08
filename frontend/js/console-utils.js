function extractContractName(code) {
  try {
    const codeWithoutComments = code.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); // Remove comments
    const regex = /#\[\s*contract\s*\]\s*pub\s+struct\s+([A-Za-z0-9_]+)\s*;/m;
    const match = codeWithoutComments.match(regex); 
    if (match && match[1]) return match[1];
  } catch (e) {
    console.error(e);
  }
  return "project";
}

const WASM_BASE64_START = '<<<SOROBAN_WASM_BASE64_START>>>';
const WASM_BASE64_END = '<<<SOROBAN_WASM_BASE64_END>>>';

const ANSI_BASE_COLORS = Object.freeze([
  '#000000', '#aa0000', '#00aa00', '#aa5500', '#0000aa', '#aa00aa', '#00aaaa', '#aaaaaa'
]);
const ANSI_BRIGHT_COLORS = Object.freeze([
  '#555555', '#ff5555', '#55ff55', '#ffff55', '#5555ff', '#ff55ff', '#55ffff', '#ffffff'
]);
const ansiConsoleStates = new WeakMap();

function createDefaultAnsiStyle() {
  return {
    bold: false,
    faint: false,
    italic: false,
    underline: false,
    inverse: false,
    fg: null,
    bg: null
  };
}

function setAnsiColor(state, isFg, color) {
  if (isFg) {
    state.fg = color;
  } else {
    state.bg = color;
  }
}

function ansi256ColorToCss(index) {
  const value = Math.max(0, Math.min(255, index));
  if (value < 16) {
    return value < 8 ? ANSI_BASE_COLORS[value] : ANSI_BRIGHT_COLORS[value - 8];
  }
  if (value >= 232) {
    const shade = Math.round(((value - 232) / 23) * 255);
    const channel = shade.toString(16).padStart(2, '0');
    return `#${channel}${channel}${channel}`;
  }
  const adjusted = value - 16;
  const r = Math.floor(adjusted / 36);
  const g = Math.floor((adjusted % 36) / 6);
  const b = adjusted % 6;
  const levelToRgb = [0, 95, 135, 175, 215, 255];
  return `rgb(${levelToRgb[r]}, ${levelToRgb[g]}, ${levelToRgb[b]})`;
}

function applyAnsiSgr(style, rawParams) {
  const params = rawParams === '' ? [0] : rawParams.split(';').map((value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });

  for (let i = 0; i < params.length; i++) {
    const code = params[i];
    if (code === 0) {
      Object.assign(style, createDefaultAnsiStyle());
      continue;
    }
    if (code === 1) {
      style.bold = true;
      continue;
    }
    if (code === 2) {
      style.faint = true;
      continue;
    }
    if (code === 3) {
      style.italic = true;
      continue;
    }
    if (code === 4) {
      style.underline = true;
      continue;
    }
    if (code === 7) {
      style.inverse = true;
      continue;
    }
    if (code === 22) {
      style.bold = false;
      style.faint = false;
      continue;
    }
    if (code === 23) {
      style.italic = false;
      continue;
    }
    if (code === 24) {
      style.underline = false;
      continue;
    }
    if (code === 27) {
      style.inverse = false;
      continue;
    }
    if (code >= 30 && code <= 37) {
      style.fg = ANSI_BASE_COLORS[code - 30];
      continue;
    }
    if (code >= 40 && code <= 47) {
      style.bg = ANSI_BASE_COLORS[code - 40];
      continue;
    }
    if (code >= 90 && code <= 97) {
      style.fg = ANSI_BRIGHT_COLORS[code - 90];
      continue;
    }
    if (code >= 100 && code <= 107) {
      style.bg = ANSI_BRIGHT_COLORS[code - 100];
      continue;
    }
    if (code === 39) {
      style.fg = null;
      continue;
    }
    if (code === 49) {
      style.bg = null;
      continue;
    }
    if (code === 38 || code === 48) {
      const isFg = code === 38;
      const mode = params[i + 1];
      if (mode === 5) {
        const paletteIndex = params[i + 2];
        if (Number.isInteger(paletteIndex)) {
          setAnsiColor(style, isFg, ansi256ColorToCss(paletteIndex));
          i += 2;
        }
      } else if (mode === 2) {
        const red = params[i + 2];
        const green = params[i + 3];
        const blue = params[i + 4];
        if ([red, green, blue].every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255)) {
          setAnsiColor(style, isFg, `rgb(${red}, ${green}, ${blue})`);
          i += 4;
        }
      }
    }
  }
}

function ansiStyleToCss(style) {
  let fg = style.fg;
  let bg = style.bg;
  if (style.inverse) {
    [fg, bg] = [bg, fg];
  }

  const css = [];
  if (fg) css.push(`color: ${fg}`);
  if (bg) css.push(`background-color: ${bg}`);
  if (style.bold) css.push('font-weight: 700');
  if (style.faint) css.push('opacity: 0.75');
  if (style.italic) css.push('font-style: italic');
  if (style.underline) css.push('text-decoration: underline');
  return css.join('; ');
}

function ensureAnsiConsoleState(consoleEl) {
  let state = ansiConsoleStates.get(consoleEl);
  if (state) return state;
  const pre = document.createElement('pre');
  pre.className = 'ansi-console-output';
  consoleEl.replaceChildren(pre);
  state = {
    pre,
    pendingEscape: '',
    style: createDefaultAnsiStyle(),
  };
  ansiConsoleStates.set(consoleEl, state);
  return state;
}

function resetConsoleText(consoleEl) {
  consoleEl.style.display = 'block';
  const pre = document.createElement('pre');
  pre.className = 'ansi-console-output';
  consoleEl.replaceChildren(pre);
  ansiConsoleStates.set(consoleEl, {
    pre,
    pendingEscape: '',
    style: createDefaultAnsiStyle(),
  });
}

function appendAnsiText(state, text) {
  if (!text) return;
  const styleCss = ansiStyleToCss(state.style);
  const last = state.pre.lastChild;

  if (!styleCss) {
    if (last && last.nodeType === Node.TEXT_NODE) {
      last.nodeValue += text;
    } else {
      state.pre.appendChild(document.createTextNode(text));
    }
    return;
  }

  if (last && last.nodeType === Node.ELEMENT_NODE && last.dataset.ansiCss === styleCss) {
    last.textContent += text;
    return;
  }

  const span = document.createElement('span');
  span.dataset.ansiCss = styleCss;
  span.style.cssText = styleCss;
  span.textContent = text;
  state.pre.appendChild(span);
}

function appendAnsiChunk(consoleEl, text) {
  const state = ensureAnsiConsoleState(consoleEl);
  const input = state.pendingEscape + text;
  state.pendingEscape = '';

  let index = 0;
  while (index < input.length) {
    const escIndex = input.indexOf('\u001b', index);
    if (escIndex === -1) {
      appendAnsiText(state, input.slice(index));
      break;
    }

    appendAnsiText(state, input.slice(index, escIndex));

    if (escIndex + 1 >= input.length) {
      state.pendingEscape = input.slice(escIndex);
      break;
    }

    if (input[escIndex + 1] === ']') {
      let oscEnd = input.indexOf('\u0007', escIndex + 2);
      if (oscEnd === -1) {
        const stIndex = input.indexOf('\u001b\\', escIndex + 2);
        if (stIndex === -1) {
          state.pendingEscape = input.slice(escIndex);
          break;
        }
        index = stIndex + 2;
      } else {
        index = oscEnd + 1;
      }
      continue;
    }

    if (input[escIndex + 1] !== '[') {
      index = escIndex + 2;
      continue;
    }

    let finalIndex = escIndex + 2;
    while (finalIndex < input.length) {
      const code = input.charCodeAt(finalIndex);
      if (code >= 0x40 && code <= 0x7E) break;
      finalIndex++;
    }

    if (finalIndex >= input.length) {
      state.pendingEscape = input.slice(escIndex);
      break;
    }

    const command = input[finalIndex];
    const params = input.slice(escIndex + 2, finalIndex);
    if (command === 'm') {
      applyAnsiSgr(state.style, params);
    }

    index = finalIndex + 1;
  }
}

function appendConsoleText(consoleEl, text) {
  if (!text) return;
  consoleEl.style.display = 'block';
  const stickToBottom = consoleEl.scrollTop + consoleEl.clientHeight >= consoleEl.scrollHeight - 4;
  appendAnsiChunk(consoleEl, text);
  if (stickToBottom) {
    consoleEl.scrollTop = consoleEl.scrollHeight;
  }
}

function scrollButtonToPanelTop(buttonEl) {
  const panelContainer = document.getElementById('panel-container');
  if (!panelContainer || !buttonEl) return;
  const containerRect = panelContainer.getBoundingClientRect();
  const buttonRect = buttonEl.getBoundingClientRect();
  const delta = buttonRect.top - containerRect.top;
  panelContainer.scrollTo({
    top: panelContainer.scrollTop + delta,
    behavior: 'smooth'
  });
}

function elapsedSeconds(startMs) {
  return Math.max(0, Math.round((performance.now() - startMs) / 1000));
}

function trackAnalyticsEvent(eventName, params = {}) {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, params);
}

function getAnalyticsNetworkName(networkName) {
  switch (normalizeNetworkSelection(networkName)) {
    case 'PUBLIC':
      return 'mainnet';
    case 'TESTNET':
      return 'testnet';
    case 'FUTURENET':
      return 'futurenet';
    case 'LOCAL':
      return 'local';
    default:
      return 'unknown';
  }
}

