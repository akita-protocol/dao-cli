import { visibleLength, padEndVisible, truncateAnsi } from "../output";
import theme from "../theme";

// ── Types ──────────────────────────────────────────────────────

export interface PanelOptions {
  title?: string;
  width: number;
  padding?: number;
}

// ── Panel rendering ────────────────────────────────────────────

/**
 * Wrap content lines in box-drawing borders.
 *
 *   ┌─ Title ─────┐
 *   │  content     │
 *   └─────────────┘
 */
export function renderPanel(content: string[], opts: PanelOptions): string[] {
  const { width, title, padding = 1 } = opts;
  if (width < 4) return content;

  const innerWidth = width - 2; // subtract left + right border chars
  const padStr = " ".repeat(padding);
  const contentWidth = innerWidth - padding * 2;

  // Top border
  let top: string;
  if (title) {
    const titleText = ` ${title} `;
    const ruleAfter = innerWidth - 1 - visibleLength(titleText); // 1 for the leading ─
    top =
      theme.border("┌─") +
      theme.panelTitle(titleText) +
      theme.border("─".repeat(Math.max(0, ruleAfter)) + "┐");
  } else {
    top = theme.border("┌" + "─".repeat(innerWidth) + "┐");
  }

  // Bottom border
  const bottom = theme.border("└" + "─".repeat(innerWidth) + "┘");

  // Content lines — truncate/pad to fit
  const border = theme.border("│");
  const lines: string[] = [top];

  for (const line of content) {
    const vLen = visibleLength(line);
    let fitted: string;
    if (vLen > contentWidth) {
      fitted = truncateAnsi(line, contentWidth);
    } else {
      fitted = padEndVisible(line, contentWidth);
    }
    lines.push(border + padStr + fitted + padStr + border);
  }

  lines.push(bottom);
  return lines;
}

/**
 * Place rendered panels side-by-side, padding shorter panels to match the tallest.
 */
export function renderPanelRow(panels: string[][], gap = 2): string[] {
  if (panels.length === 0) return [];
  if (panels.length === 1) return panels[0];

  const maxHeight = Math.max(...panels.map((p) => p.length));
  const gapStr = " ".repeat(gap);
  const lines: string[] = [];

  // Measure each panel's visible width from its first line
  const panelWidths = panels.map((p) => (p.length > 0 ? visibleLength(p[0]) : 0));

  for (let i = 0; i < maxHeight; i++) {
    const parts: string[] = [];
    for (let p = 0; p < panels.length; p++) {
      const line = panels[p][i];
      if (line !== undefined) {
        // Pad to panel width for alignment
        parts.push(padEndVisible(line, panelWidths[p]));
      } else {
        parts.push(" ".repeat(panelWidths[p]));
      }
    }
    lines.push(parts.join(gapStr));
  }

  return lines;
}

/**
 * Stack panel-rows vertically with optional gaps.
 */
export function renderPanelGrid(
  rows: string[][][],
  opts?: { rowGap?: number; colGap?: number },
): string[] {
  const { rowGap = 0, colGap = 2 } = opts ?? {};
  const lines: string[] = [];

  for (let r = 0; r < rows.length; r++) {
    if (r > 0 && rowGap > 0) {
      for (let g = 0; g < rowGap; g++) lines.push("");
    }
    lines.push(...renderPanelRow(rows[r], colGap));
  }

  return lines;
}

/**
 * Divide total width among N panels accounting for gaps between them.
 * Returns an array of widths. Any remainder pixels go to earlier panels.
 */
export function splitWidth(totalWidth: number, count: number, gap = 2): number[] {
  if (count <= 0) return [];
  if (count === 1) return [totalWidth];

  const totalGap = gap * (count - 1);
  const available = totalWidth - totalGap;
  const base = Math.floor(available / count);
  const remainder = available - base * count;

  const widths: number[] = [];
  for (let i = 0; i < count; i++) {
    widths.push(base + (i < remainder ? 1 : 0));
  }
  return widths;
}
