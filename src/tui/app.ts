import type { AkitaNetwork } from "@akta/sdk";
import { createDAO } from "../sdk";
import { jsonReplacer } from "../output";
import { enterRawMode, exitRawMode, writeFrame, getTermSize, onResize } from "./terminal";
import { startKeyListener } from "./input";
import { renderFrame } from "./renderer";
import type { AppState, KeyAction, LoadResult, View, ViewContext, ViewId } from "./types";
import { TABS } from "./types";

// ── Views ───────────────────────────────────────────────────────

import { daoView } from "./views/dao";
import { feesView } from "./views/fees";
import { walletView, cycleWalletAccount, getSelectedAccountLine, invalidateWalletCache } from "./views/wallet";
import { proposalsListView, cycleProposalCursor, getProposalCursor, invalidateProposalsCache } from "./views/proposals-list";

// ── View cache ──────────────────────────────────────────────────

interface CacheEntry {
  lines: string[];
  fixedRight?: string[];
  ts: number;
}

const CACHE_TTL = 30_000; // 30 seconds

// ── Main TUI ────────────────────────────────────────────────────

export async function startTUI(network: AkitaNetwork): Promise<void> {
  const dao = createDAO(network);

  const state: AppState = {
    tab: "dao",
    walletAccountIdx: 0,
    scrollOffset: 0,
    cursor: 0,
    viewStack: [],
    jsonMode: false,
  };

  const cache = new Map<string, CacheEntry>();
  let currentLines: string[] = [];
  let currentFixedRight: string[] | undefined;
  let loading = false;
  let loadGeneration = 0; // guards against stale async renders
  let stopKeyListener: (() => void) | null = null;
  let removeResizeListener: (() => void) | null = null;
  let pendingScrollTo: (() => number) | null = null;

  // ── Helpers ─────────────────────────────────────────────────

  function viewKey(vid: ViewId): string {
    return vid.tab;
  }

  function currentViewId(): ViewId {
    if (state.viewStack.length > 0) {
      return state.viewStack[state.viewStack.length - 1];
    }
    return { tab: state.tab } as ViewId;
  }

  function getView(vid: ViewId): View {
    switch (vid.tab) {
      case "dao": return daoView;
      case "fees": return feesView;
      case "wallet": return walletView;
      case "proposals": return proposalsListView;
    }
  }

  function viewportHeight(): number {
    return getTermSize().rows - 3;
  }

  function clampScroll(): void {
    const totalLines = Math.max(currentLines.length, currentFixedRight?.length ?? 0);
    const maxScroll = Math.max(0, totalLines - viewportHeight());
    state.scrollOffset = Math.max(0, Math.min(state.scrollOffset, maxScroll));
  }

  /** Ensure the selected proposal row is visible in the viewport. */
  function scrollToProposalCursor(): void {
    // Left panel structure: "" + panel-border + header-row + data-rows + border
    // The cursor item is at line 3 + cursorIndex
    const line = 3 + getProposalCursor();
    ensureLineVisible(line);
  }

  function ensureLineVisible(line: number): void {
    const vh = viewportHeight();
    if (line < state.scrollOffset) {
      state.scrollOffset = line;
    } else if (line >= state.scrollOffset + vh) {
      state.scrollOffset = line - vh + 1;
    }
  }

  // ── Render cycle ────────────────────────────────────────────

  function render(): void {
    const { rows, cols } = getTermSize();
    const frame = renderFrame(state, currentLines, rows, cols, loading, currentFixedRight);
    writeFrame(frame);
  }

  async function loadAndRender(forceRefresh = false): Promise<void> {
    const vid = currentViewId();
    const key = viewKey(vid);
    const { cols } = getTermSize();

    // Check cache
    if (!forceRefresh && !state.jsonMode) {
      const cached = cache.get(key);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        currentLines = cached.lines;
        currentFixedRight = cached.fixedRight;
        clampScroll();
        render();
        return;
      }
    }

    // Show loading state
    const gen = ++loadGeneration;
    loading = true;
    render();

    try {
      const view = getView(vid);
      const ctx: ViewContext = {
        width: cols,
        height: viewportHeight(),
        network,
        dao,
        navigate: (target: ViewId) => {
          state.viewStack.push(target);
          state.scrollOffset = 0;
          state.cursor = 0;
          loadAndRender();
        },
        refresh: () => loadAndRender(true),
      };

      const result = await view.load(ctx);

      // Discard result if user navigated away during the async load
      if (gen !== loadGeneration) return;

      // Normalize result — views can return string[] or LoadResult
      let lines: string[];
      let fixedRight: string[] | undefined;
      if (Array.isArray(result)) {
        lines = result;
      } else {
        lines = result.lines;
        fixedRight = result.fixedRight;
      }

      // JSON mode: serialize structured data (or fall back to lines)
      if (state.jsonMode) {
        const jsonData = (result as LoadResult).data ?? lines;
        const jsonStr = JSON.stringify(jsonData, jsonReplacer, 2);
        lines = jsonStr.split("\n");
        fixedRight = undefined;
      }

      // Update cache (not for JSON mode)
      if (!state.jsonMode) {
        cache.set(key, { lines, fixedRight, ts: Date.now() });
      }

      currentLines = lines;
      currentFixedRight = fixedRight;
    } catch (err: any) {
      // Discard error if user navigated away
      if (gen !== loadGeneration) return;

      currentLines = [
        "",
        `  Error: ${err.message ?? err}`,
        "",
        "  Press 'r' to retry.",
      ];
      currentFixedRight = undefined;
    }

    loading = false;

    // Apply pending scroll-to (set before loadAndRender, resolved after load)
    if (pendingScrollTo) {
      ensureLineVisible(pendingScrollTo());
      pendingScrollTo = null;
    }

    clampScroll();
    render();
  }

  // ── Input handling ──────────────────────────────────────────

  function handleKey(action: KeyAction): void {
    switch (action.type) {
      case "quit":
        cleanup();
        process.exit(0);
        break;

      case "tab-next": {
        if (state.viewStack.length > 0) {
          state.viewStack = [];
        }
        const tabIdx = TABS.indexOf(state.tab);
        state.tab = TABS[(tabIdx + 1) % TABS.length];
        state.scrollOffset = 0;
        state.cursor = 0;
        loadAndRender();
        break;
      }

      case "tab-prev": {
        if (state.viewStack.length > 0) {
          state.viewStack = [];
        }
        const tabIdx = TABS.indexOf(state.tab);
        state.tab = TABS[(tabIdx - 1 + TABS.length) % TABS.length];
        state.scrollOffset = 0;
        state.cursor = 0;
        loadAndRender();
        break;
      }

      case "sub-next": {
        if (state.tab === "wallet") {
          cycleWalletAccount(1);
          cache.delete("wallet");
          pendingScrollTo = () => getSelectedAccountLine() + 1;
          loadAndRender();
        } else if (state.tab === "proposals" && state.viewStack.length === 0) {
          cycleProposalCursor(1);
          cache.delete("proposals");
          scrollToProposalCursor();
          loadAndRender();
        } else {
          handleKey({ type: "tab-next" });
        }
        break;
      }

      case "sub-prev": {
        if (state.tab === "wallet") {
          cycleWalletAccount(-1);
          cache.delete("wallet");
          pendingScrollTo = () => getSelectedAccountLine() + 1;
          loadAndRender();
        } else if (state.tab === "proposals" && state.viewStack.length === 0) {
          cycleProposalCursor(-1);
          cache.delete("proposals");
          scrollToProposalCursor();
          loadAndRender();
        } else {
          handleKey({ type: "tab-prev" });
        }
        break;
      }

      case "up":
        if (state.scrollOffset > 0) {
          state.scrollOffset--;
          render();
        }
        break;

      case "down": {
        const totalLines = Math.max(currentLines.length, currentFixedRight?.length ?? 0);
        const maxScroll = Math.max(0, totalLines - viewportHeight());
        if (state.scrollOffset < maxScroll) {
          state.scrollOffset++;
          render();
        }
        break;
      }

      case "page-up":
        state.scrollOffset = Math.max(0, state.scrollOffset - 10);
        render();
        break;

      case "page-down": {
        const totalLines = Math.max(currentLines.length, currentFixedRight?.length ?? 0);
        const maxScroll = Math.max(0, totalLines - viewportHeight());
        state.scrollOffset = Math.min(maxScroll, state.scrollOffset + 10);
        render();
        break;
      }

      case "top":
        state.scrollOffset = 0;
        render();
        break;

      case "bottom": {
        const totalLines = Math.max(currentLines.length, currentFixedRight?.length ?? 0);
        const maxScroll = Math.max(0, totalLines - viewportHeight());
        state.scrollOffset = maxScroll;
        render();
        break;
      }

      case "back":
        if (state.viewStack.length > 0) {
          state.viewStack.pop();
          state.scrollOffset = 0;
          state.cursor = 0;
          loadAndRender();
        }
        break;

      case "refresh":
        // Invalidate cache for current view
        cache.delete(viewKey(currentViewId()));
        if (state.tab === "wallet") {
          invalidateWalletCache();
        } else if (state.tab === "proposals") {
          invalidateProposalsCache();
        }
        loadAndRender(true);
        break;

      case "json":
        state.jsonMode = !state.jsonMode;
        state.scrollOffset = 0;
        loadAndRender();
        break;
    }
  }

  // ── Cleanup ─────────────────────────────────────────────────

  function cleanup(): void {
    if (stopKeyListener) stopKeyListener();
    if (removeResizeListener) removeResizeListener();
    exitRawMode();
  }

  // ── Startup ─────────────────────────────────────────────────

  // Graceful exit handlers
  process.on("SIGINT", () => { cleanup(); process.exit(0); });
  process.on("SIGTERM", () => { cleanup(); process.exit(0); });
  process.on("uncaughtException", (err) => {
    cleanup();
    console.error("Uncaught exception:", err);
    process.exit(1);
  });

  enterRawMode();
  stopKeyListener = startKeyListener(handleKey);
  removeResizeListener = onResize(() => {
    // Invalidate all cache (widths changed)
    cache.clear();
    loadAndRender();
  });

  // Initial load
  await loadAndRender();
}
