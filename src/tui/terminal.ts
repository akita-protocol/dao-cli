// ── ANSI escape sequences ───────────────────────────────────────

const ESC = "\x1b";

export const ansi = {
  clearScreen: `${ESC}[2J`,
  clearLine: `${ESC}[2K`,
  moveTo: (row: number, col: number) => `${ESC}[${row};${col}H`,
  hideCursor: `${ESC}[?25l`,
  showCursor: `${ESC}[?25h`,
  enterAlt: `${ESC}[?1049h`,
  leaveAlt: `${ESC}[?1049l`,
  reset: `${ESC}[0m`,
};

// ── Terminal size ───────────────────────────────────────────────

export function getTermSize(): { rows: number; cols: number } {
  return {
    rows: process.stdout.rows || 24,
    cols: process.stdout.columns || 120,
  };
}

// ── Raw mode management ────────────────────────────────────────

let isRawMode = false;

export function enterRawMode(): void {
  if (isRawMode) return;
  process.stdout.write(ansi.enterAlt + ansi.hideCursor);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }
  isRawMode = true;
}

export function exitRawMode(): void {
  if (!isRawMode) return;
  process.stdout.write(ansi.showCursor + ansi.leaveAlt);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }
  isRawMode = false;
}

// ── Frame writing (flicker-free) ────────────────────────────────

export function writeFrame(lines: string[]): void {
  // Build entire frame as a single string, then write once
  let frame = ansi.moveTo(1, 1);
  for (let i = 0; i < lines.length; i++) {
    frame += ansi.clearLine + lines[i];
    if (i < lines.length - 1) frame += "\n";
  }
  process.stdout.write(frame);
}

// ── Resize listener ────────────────────────────────────────────

export function onResize(cb: () => void): () => void {
  process.stdout.on("resize", cb);
  return () => process.stdout.off("resize", cb);
}
