import theme from "./theme";

// ── Internal helpers ─────────────────────────────────────────────

/** Strip ANSI escape codes for accurate visible-length calculation */
export function visibleLength(str: string): number {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, "").length;
}

/** padEnd that accounts for invisible ANSI escape codes */
export function padEndVisible(str: string, len: number): string {
  const diff = len - visibleLength(str);
  return diff > 0 ? str + " ".repeat(diff) : str;
}

/** Truncate a string that may contain ANSI codes to a visible width */
export function truncateAnsi(str: string, maxWidth: number): string {
  let visible = 0;
  let i = 0;
  let result = "";

  while (i < str.length && visible < maxWidth) {
    // Check for ANSI escape sequence
    if (str[i] === "\x1b" && str[i + 1] === "[") {
      const end = str.indexOf("m", i);
      if (end !== -1) {
        result += str.slice(i, end + 1);
        i = end + 1;
        continue;
      }
    }
    result += str[i];
    visible++;
    i++;
  }

  // Reset ANSI at end
  return result + "\x1b[0m";
}

/** Terminal width with fallback for piped/non-TTY output */
function termWidth(): number {
  return process.stdout.columns || 120;
}

// ── JSON output (unchanged) ──────────────────────────────────────

export function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  return value;
}

export function printJson(data: unknown): void {
  console.log(JSON.stringify(data, jsonReplacer, 2));
}

// ── Section header ───────────────────────────────────────────────

export function renderHeader(text: string, width?: number): string[] {
  const w = width ?? termWidth();
  const prefix = "── ";
  const suffix = " ";
  const remaining = w - prefix.length - text.length - suffix.length;
  const rule = remaining > 0 ? "─".repeat(remaining) : "";
  return [
    "",
    `${theme.label(prefix)}${theme.sectionHeader(text)}${theme.label(suffix + rule)}`,
  ];
}

export function header(text: string): void {
  for (const line of renderHeader(text)) console.log(line);
}

// ── Key-Value pairs ──────────────────────────────────────────────

export function renderKV(pairs: [string, unknown][]): string[] {
  if (pairs.length === 0) return [];
  const maxKeyLen = Math.max(...pairs.map(([k]) => k.length));
  return pairs.map(([key, value]) => {
    const paddedKey = key.padEnd(maxKeyLen);
    return `  ${theme.label(paddedKey)}  ${String(value)}`;
  });
}

export function printKV(pairs: [string, unknown][]): void {
  for (const line of renderKV(pairs)) console.log(line);
}

// ── Data table (borderless aligned columns) ──────────────────────

export function renderColumns(headers: string[], rows: string[][]): string[] {
  if (rows.length === 0) return [];

  const colWidths = headers.map((h, i) => {
    const dataMax = rows.reduce((max, row) => Math.max(max, visibleLength(row[i] ?? "")), 0);
    return Math.max(h.length, dataMax);
  });

  const gap = 3;
  const lines: string[] = [];

  const headerLine = headers
    .map((h, i) => padEndVisible(theme.label(h.toUpperCase()), colWidths[i]))
    .join(" ".repeat(gap));
  lines.push(`  ${headerLine}`);

  for (const row of rows) {
    const line = row
      .map((cell, i) => {
        if (i === row.length - 1) return cell;
        return padEndVisible(cell, colWidths[i]);
      })
      .join(" ".repeat(gap));
    lines.push(`  ${line}`);
  }

  return lines;
}

export function printColumns(headers: string[], rows: string[][]): void {
  for (const line of renderColumns(headers, rows)) console.log(line);
}

// ── Multi-column KV (side-by-side fee groups) ────────────────────

export interface KVGroup {
  title: string;
  pairs: [string, string][];
}

export function renderMultiColumnKV(groups: KVGroup[], width?: number): string[] {
  if (groups.length === 0) return [];

  const w = width ?? termWidth();
  const groupGap = 4;
  const indent = 2;
  const lines: string[] = [];

  let cols: number;
  if (w >= 120) cols = Math.min(3, groups.length);
  else if (w >= 80) cols = Math.min(2, groups.length);
  else cols = 1;

  for (let i = 0; i < groups.length; i += cols) {
    const chunk = groups.slice(i, i + cols);

    const groupMetas = chunk.map((g) => {
      const maxKey = Math.max(g.title.length, ...g.pairs.map(([k]) => k.length));
      const maxVal = Math.max(...g.pairs.map(([, v]) => visibleLength(v)), 0);
      return { group: g, keyWidth: maxKey, valWidth: maxVal, totalWidth: maxKey + 2 + maxVal };
    });

    const titleLine = groupMetas
      .map((m, idx) => {
        const title = theme.label(m.group.title.toUpperCase());
        if (idx === groupMetas.length - 1) return title;
        return padEndVisible(title, m.totalWidth);
      })
      .join(" ".repeat(groupGap));
    lines.push(" ".repeat(indent) + titleLine);

    const maxRows = Math.max(...groupMetas.map((m) => m.group.pairs.length));
    for (let r = 0; r < maxRows; r++) {
      const parts = groupMetas.map((m, idx) => {
        const pair = m.group.pairs[r];
        if (!pair) {
          if (idx === groupMetas.length - 1) return "";
          return " ".repeat(m.totalWidth);
        }
        const [key, val] = pair;
        const paddedKey = theme.label(key.padEnd(m.keyWidth));
        const paddedVal = padEndVisible(val, m.valWidth);
        if (idx === groupMetas.length - 1) return `${paddedKey}  ${val}`;
        return `${paddedKey}  ${paddedVal}`;
      });
      const line = parts.join(" ".repeat(groupGap));
      lines.push(" ".repeat(indent) + line);
    }
  }

  return lines;
}

export function printMultiColumnKV(groups: KVGroup[]): void {
  for (const line of renderMultiColumnKV(groups)) console.log(line);
}

// ── Plugin card (compact inline) ─────────────────────────────────

export interface PluginCardOpts {
  name: string;
  pairs: [string, string][];
  methods?: string[];
}

export function renderPluginCard(opts: PluginCardOpts, width?: number): string[] {
  const w = width ?? termWidth();
  const indentStr = "    ";
  const maxLineWidth = w - indentStr.length;
  const sep = "  ";
  const lines: string[] = [];

  lines.push("");
  lines.push(`  ${theme.sectionHeader(opts.name)}`);

  const items = opts.pairs.map(([k, v]) => `${theme.label(k + ":")} ${v}`);
  let current = "";

  for (const item of items) {
    const candidateLen = current ? visibleLength(current) + sep.length + visibleLength(item) : visibleLength(item);
    if (current && candidateLen > maxLineWidth) {
      lines.push(indentStr + current);
      current = item;
    } else {
      current = current ? current + sep + item : item;
    }
  }
  if (current) lines.push(indentStr + current);

  if (opts.methods && opts.methods.length > 0) {
    lines.push(indentStr + theme.label("Methods:") + " " + opts.methods.join(", "));
  }

  return lines;
}

export function printPluginCard(opts: PluginCardOpts): void {
  for (const line of renderPluginCard(opts)) console.log(line);
}
