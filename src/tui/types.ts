import type { AkitaDaoSDK, AkitaNetwork } from "@akta/sdk";

// ── Tab & View identifiers ──────────────────────────────────────

export type TabId = "dao" | "fees" | "wallet" | "proposals";

export const TABS: TabId[] = ["dao", "fees", "wallet", "proposals"];

export const TAB_LABELS: Record<TabId, string> = {
  dao: "DAO",
  fees: "Fees",
  wallet: "Wallet",
  proposals: "Proposals",
};

// ── View identification ─────────────────────────────────────────

export type ViewId =
  | { tab: "dao" }
  | { tab: "fees" }
  | { tab: "wallet" }
  | { tab: "proposals" };

// ── Key actions ─────────────────────────────────────────────────

export type KeyAction =
  | { type: "quit" }
  | { type: "tab-next" }
  | { type: "tab-prev" }
  | { type: "sub-next" }
  | { type: "sub-prev" }
  | { type: "up" }
  | { type: "down" }
  | { type: "page-up" }
  | { type: "page-down" }
  | { type: "top" }
  | { type: "bottom" }
  | { type: "enter" }
  | { type: "back" }
  | { type: "refresh" }
  | { type: "json" };

// ── Application state ───────────────────────────────────────────

export interface AppState {
  tab: TabId;
  walletAccountIdx: number;
  scrollOffset: number;
  cursor: number;
  viewStack: ViewId[];
  jsonMode: boolean;
}

// ── View interface ──────────────────────────────────────────────

export interface ViewContext {
  width: number;
  height: number;
  network: AkitaNetwork;
  dao: AkitaDaoSDK;
  navigate: (view: ViewId) => void;
  refresh: () => void;
}

export interface LoadResult {
  lines: string[];
  fixedRight?: string[];
}

export interface View {
  load(ctx: ViewContext): Promise<string[] | LoadResult>;
  selectable?: boolean;
  selectableCount?: (lines: string[]) => number;
}
