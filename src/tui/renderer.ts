import type { AppState, TabId } from "./types";
import { TABS, TAB_LABELS } from "./types";
import { visibleLength, padEndVisible, truncateAnsi } from "../output";
import theme from "../theme";

// ── Tab bar ─────────────────────────────────────────────────────

function renderTabBar(activeTab: TabId, width: number): string {
  const prefix = theme.appName(" Akita DAO") + "   ";
  const tabs = TABS.map((t) => {
    const label = TAB_LABELS[t];
    return t === activeTab
      ? theme.activeTab(` ${label} `)
      : theme.inactiveTab(` ${label} `);
  }).join(theme.tabSeparator("│"));

  return padEndVisible(prefix + tabs, width);
}

// ── Separator line ──────────────────────────────────────────────

function renderSeparator(width: number): string {
  return theme.separator("─".repeat(width));
}

// ── Status bar ──────────────────────────────────────────────────

function renderStatusBar(
  state: AppState,
  totalLines: number,
  viewportHeight: number,
  width: number,
  loading: boolean,
): string {
  const hints: string[] = [
    "q:quit",
    "Tab:nav",
    "↑↓:scroll",
    "r:refresh",
    "j:json",
  ];

  if (state.tab === "wallet") {
    hints.splice(2, 0, "[]:acct");
  } else if (state.tab === "proposals") {
    hints.splice(2, 0, "[]:select");
  }

  const left = " " + hints.join("  ");

  let right: string;
  if (loading) {
    right = "loading... ";
  } else if (totalLines <= viewportHeight) {
    right = `${totalLines} ln `;
  } else {
    const pct = totalLines > 0
      ? Math.round(((state.scrollOffset + viewportHeight) / totalLines) * 100)
      : 100;
    right = `${Math.min(pct, 100)}% (${totalLines} ln) `;
  }

  const middle = width - visibleLength(left) - visibleLength(right);
  const pad = middle > 0 ? " ".repeat(middle) : " ";

  return theme.statusBar(left + pad + right);
}

// ── Full frame compositor ───────────────────────────────────────

export function renderFrame(
  state: AppState,
  contentLines: string[],
  termRows: number,
  termCols: number,
  loading: boolean,
  fixedRight?: string[],
): string[] {
  const lines: string[] = [];

  // Line 1: Tab bar
  lines.push(renderTabBar(state.tab, termCols));

  // Line 2: Separator
  lines.push(renderSeparator(termCols));

  // Lines 3..N-1: Scrollable viewport
  const viewportHeight = termRows - 3; // tab bar + separator + status bar
  const start = state.scrollOffset;

  if (fixedRight && fixedRight.length > 0) {
    // Two-panel mode: both panels scroll together
    const rightWidth = Math.max(...fixedRight.map((l) => visibleLength(l)));
    const leftWidth = termCols - rightWidth - 1;

    for (let i = 0; i < viewportHeight; i++) {
      const idx = start + i;
      const leftLine = idx < contentLines.length ? contentLines[idx] : "";
      const rightLine = idx < fixedRight.length ? fixedRight[idx] : "";

      const left = padEndVisible(truncateAnsi(leftLine, leftWidth), leftWidth);
      lines.push(left + " " + rightLine);
    }
  } else {
    // Normal mode: everything scrolls together
    const end = start + viewportHeight;
    for (let i = start; i < end; i++) {
      if (i < contentLines.length) {
        const line = contentLines[i];
        if (visibleLength(line) > termCols) {
          lines.push(truncateAnsi(line, termCols));
        } else {
          lines.push(line);
        }
      } else {
        lines.push("");
      }
    }
  }

  // Last line: Status bar
  const totalLineCount = fixedRight ? Math.max(contentLines.length, fixedRight.length) : contentLines.length;
  lines.push(renderStatusBar(state, totalLineCount, viewportHeight, termCols, loading));

  return lines;
}
