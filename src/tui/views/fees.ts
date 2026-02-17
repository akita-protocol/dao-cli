import type { AkitaDaoGlobalState } from "@akta/sdk/dao";
import type { KVGroup } from "../../output";
import theme from "../../theme";
import {
  formatMicroAlgo,
  formatBasisPoints,
  formatBigInt,
} from "../../formatting";
import { renderPanel, splitWidth } from "../panels";
import { padEndVisible, visibleLength } from "../../output";
import type { LoadResult, View, ViewContext } from "../types";

const PERCENTAGE_RE = /Percentage|Tax/i;
const FEE_RE = /Fee$/i;

function formatFeeValue(key: string, value: bigint): string {
  if (PERCENTAGE_RE.test(key)) return formatBasisPoints(value);
  if (FEE_RE.test(key)) return formatMicroAlgo(value);
  return formatBigInt(value);
}

function feeLabel(key: string): string {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase()).trim();
}

export const feesView: View = {
  async load(ctx: ViewContext): Promise<LoadResult> {
    const { dao, width } = ctx;
    const state = await dao.getGlobalState();

    const groups = collectFeeGroups(state);
    const rawGroups = collectRawFeeGroups(state);

    if (groups.length === 0) {
      return {
        lines: [
          "",
          ...renderPanel(["  No fee data available."], { title: "Fees", width }),
        ],
        data: {},
      };
    }

    let lines: string[];
    if (width < 80) {
      lines = renderSingleColumn(groups, width);
    } else {
      const cols = 2;
      const colGap = 2;
      const panelGap = 1;
      const [leftW, rightW] = splitWidth(width, cols, colGap);

      // Compute max key width per grid column
      const colKeyWidths: number[] = Array(cols).fill(0);
      for (let i = 0; i < groups.length; i++) {
        const col = i % cols;
        for (const [key] of groups[i].pairs) {
          colKeyWidths[col] = Math.max(colKeyWidths[col], key.length);
        }
      }

      // Split groups into independent columns
      const colWidths = [leftW, rightW];
      const columns: string[][] = [[], []];
      for (let i = 0; i < groups.length; i++) {
        const col = i % cols;
        if (columns[col].length > 0) {
          for (let g = 0; g < panelGap; g++) columns[col].push("");
        }
        const content = renderFeeKV(groups[i].pairs, colKeyWidths[col]);
        columns[col].push(...renderPanel(content, { title: groups[i].title, width: colWidths[col] }));
      }

      // Merge columns side-by-side
      const maxHeight = Math.max(columns[0].length, columns[1].length);
      const gapStr = " ".repeat(colGap);
      lines = [""];
      for (let i = 0; i < maxHeight; i++) {
        const left = i < columns[0].length ? padEndVisible(columns[0][i], leftW) : " ".repeat(leftW);
        const right = i < columns[1].length ? columns[1][i] : "";
        lines.push(left + gapStr + right);
      }
    }

    return { lines, data: rawGroups };
  },
};

function renderSingleColumn(groups: KVGroup[], width: number): string[] {
  const lines: string[] = [""];
  for (const group of groups) {
    if (lines.length > 1) lines.push("");
    const content = renderFeeKV(group.pairs);
    lines.push(...renderPanel(content, { title: group.title, width }));
  }
  return lines;
}

/** Render KV pairs aligned to a shared key width */
function renderFeeKV(pairs: [string, string][], keyWidth?: number): string[] {
  const w = keyWidth ?? Math.max(...pairs.map(([k]) => k.length));
  return pairs.map(([key, value]) => `  ${theme.label(key.padEnd(w))}  ${value}`);
}

function collectRawFeeGroups(state: Partial<AkitaDaoGlobalState>): Record<string, Record<string, bigint>> {
  const feeGroups: [string, Record<string, bigint> | undefined][] = [
    ["walletFees", state.walletFees as Record<string, bigint> | undefined],
    ["socialFees", state.socialFees as Record<string, bigint> | undefined],
    ["stakingFees", state.stakingFees as Record<string, bigint> | undefined],
    ["subscriptionFees", state.subscriptionFees as Record<string, bigint> | undefined],
    ["swapFees", state.swapFees as Record<string, bigint> | undefined],
    ["nftFees", state.nftFees as Record<string, bigint> | undefined],
  ];

  const result: Record<string, Record<string, bigint>> = {};
  for (const [name, fees] of feeGroups) {
    if (fees) result[name] = fees;
  }
  return result;
}

function collectFeeGroups(state: Partial<AkitaDaoGlobalState>): KVGroup[] {
  const feeGroups: [string, Record<string, bigint> | undefined][] = [
    ["Wallet Fees", state.walletFees as Record<string, bigint> | undefined],
    ["Social Fees", state.socialFees as Record<string, bigint> | undefined],
    ["Staking Fees", state.stakingFees as Record<string, bigint> | undefined],
    ["Sub Fees", state.subscriptionFees as Record<string, bigint> | undefined],
    ["Swap Fees", state.swapFees as Record<string, bigint> | undefined],
    ["NFT Fees", state.nftFees as Record<string, bigint> | undefined],
  ];

  const groups: KVGroup[] = [];
  for (const [name, fees] of feeGroups) {
    if (!fees) continue;
    groups.push({
      title: name,
      pairs: mergeRangePairs(fees),
    });
  }
  return groups;
}

/**
 * Merge Min/Max pairs into range display (e.g. "Impact Tax: 1% – 5%")
 * and pass through standalone fields normally.
 */
function mergeRangePairs(fees: Record<string, bigint>): [string, string][] {
  const entries = Object.entries(fees);
  const used = new Set<string>();
  const pairs: [string, string][] = [];

  for (const [key, value] of entries) {
    if (used.has(key)) continue;

    // Check for Min/Max pair
    const minMatch = key.match(/^(.+)Min$/);
    const maxMatch = key.match(/^(.+)Max$/);

    if (minMatch) {
      const base = minMatch[1];
      const maxKey = `${base}Max`;
      if (maxKey in fees) {
        used.add(key);
        used.add(maxKey);
        const label = feeLabel(base);
        const minVal = formatFeeValue(key, value);
        const maxVal = formatFeeValue(maxKey, fees[maxKey]);
        pairs.push([label, `${minVal} – ${maxVal}`]);
        continue;
      }
    }
    if (maxMatch) {
      const base = maxMatch[1];
      const minKey = `${base}Min`;
      if (minKey in fees) {
        // Already handled by Min pass above
        continue;
      }
    }

    used.add(key);
    pairs.push([feeLabel(key), formatFeeValue(key, value)]);
  }

  return pairs;
}
