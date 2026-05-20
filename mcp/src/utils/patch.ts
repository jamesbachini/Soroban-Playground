interface Hunk {
  oldStart: number;
  lines: string[];
}

function parseHunks(patch: string): Hunk[] {
  const lines = patch.replace(/\r\n/g, "\n").split("\n");
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;

  for (const line of lines) {
    const header = /^@@ -(\d+)(?:,\d+)? \+\d+(?:,\d+)? @@/.exec(line);
    if (header) {
      current = { oldStart: Number(header[1]), lines: [] };
      hunks.push(current);
      continue;
    }

    if (!current) continue;
    if (line === "\\ No newline at end of file") continue;
    if (line === "") continue;
    if (line.startsWith(" ") || line.startsWith("-") || line.startsWith("+")) {
      current.lines.push(line);
    }
  }

  if (!hunks.length) {
    throw new Error("Patch contains no unified diff hunks.");
  }
  return hunks;
}

function splitPreservingTrailingNewline(content: string): { lines: string[]; trailingNewline: boolean } {
  const trailingNewline = content.endsWith("\n");
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  if (trailingNewline) lines.pop();
  return { lines, trailingNewline };
}

export function applyUnifiedPatch(content: string, patch: string): string {
  const hunks = parseHunks(patch);
  const { lines, trailingNewline } = splitPreservingTrailingNewline(content);
  const result: string[] = [];
  let cursor = 0;

  for (const hunk of hunks) {
    const targetIndex = Math.max(0, hunk.oldStart - 1);
    if (targetIndex < cursor) {
      throw new Error("Patch hunks overlap or are out of order.");
    }

    while (cursor < targetIndex && cursor < lines.length) {
      result.push(lines[cursor]);
      cursor += 1;
    }

    for (const rawLine of hunk.lines) {
      const marker = rawLine[0];
      const value = rawLine.slice(1);
      if (marker === " ") {
        if (lines[cursor] !== value) {
          throw new Error(`Patch context mismatch near line ${cursor + 1}.`);
        }
        result.push(value);
        cursor += 1;
      } else if (marker === "-") {
        if (lines[cursor] !== value) {
          throw new Error(`Patch deletion mismatch near line ${cursor + 1}.`);
        }
        cursor += 1;
      } else if (marker === "+") {
        result.push(value);
      } else {
        throw new Error(`Unsupported patch line: ${rawLine}`);
      }
    }
  }

  while (cursor < lines.length) {
    result.push(lines[cursor]);
    cursor += 1;
  }

  return result.join("\n") + (trailingNewline ? "\n" : "");
}
