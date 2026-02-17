import type { KeyAction } from "./types";

type KeyHandler = (action: KeyAction) => void;

/**
 * Start listening for keypresses on stdin (must be in raw mode).
 * Returns a cleanup function to stop listening.
 */
export function startKeyListener(handler: KeyHandler): () => void {
  let escTimer: ReturnType<typeof setTimeout> | null = null;

  function onData(buf: Buffer) {
    const seq = buf.toString("utf8");

    // Ctrl+C
    if (seq === "\x03") return handler({ type: "quit" });

    // Escape sequences (arrows, page up/down, etc.)
    if (seq.startsWith("\x1b")) {
      // Clear any pending standalone Esc
      if (escTimer) {
        clearTimeout(escTimer);
        escTimer = null;
      }

      // Known escape sequences
      const mapped = mapEscapeSequence(seq);
      if (mapped) return handler(mapped);

      // Could be standalone Esc — wait 50ms to distinguish
      if (seq === "\x1b") {
        escTimer = setTimeout(() => {
          escTimer = null;
          handler({ type: "back" });
        }, 50);
        return;
      }

      // Unknown escape sequence, ignore
      return;
    }

    // Single character keys
    const action = mapCharKey(seq);
    if (action) handler(action);
  }

  process.stdin.on("data", onData);

  return () => {
    process.stdin.off("data", onData);
    if (escTimer) {
      clearTimeout(escTimer);
      escTimer = null;
    }
  };
}

function mapEscapeSequence(seq: string): KeyAction | null {
  switch (seq) {
    case "\x1b[A": return { type: "up" };
    case "\x1b[B": return { type: "down" };
    case "\x1b[5~": return { type: "page-up" };
    case "\x1b[6~": return { type: "page-down" };
    case "\x1b[Z": return { type: "tab-prev" }; // Shift+Tab
    default: return null;
  }
}

function mapCharKey(seq: string): KeyAction | null {
  switch (seq) {
    case "q": return { type: "quit" };
    case "\t": return { type: "tab-next" };
    case "[": return { type: "sub-prev" };
    case "]": return { type: "sub-next" };
    case "k": return { type: "up" };
    case "j": return { type: "json" };
    case "g": return { type: "top" };
    case "G": return { type: "bottom" };
    case "\r": return { type: "enter" };
    case "\x7f": return { type: "back" }; // Backspace
    case "r": return { type: "refresh" };
    default: return null;
  }
}
