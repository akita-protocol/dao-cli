import { getNetworkAppIds } from "@akta/sdk";
import type { AkitaNetwork } from "@akta/sdk";
import type { AkitaDaoGlobalState } from "@akta/sdk/dao";
import { renderKV, renderColumns, visibleLength } from "../../output";
import theme from "../../theme";
import {
  formatMicroAlgo,
  formatBasisPoints,
  formatDuration,
  formatBigInt,
  formatCompact,
  daoStateLabel,
  resolveAppName,
  getAppName,
  colorState,
} from "../../formatting";
import { renderPanel, renderPanelGrid, splitWidth } from "../panels";
import type { View, ViewContext } from "../types";

export const daoView: View = {
  async load(ctx: ViewContext): Promise<string[]> {
    const { dao, network, width } = ctx;
    const state = await dao.getGlobalState();
    const ids = getNetworkAppIds(network);

    // Fetch supply data for AKTA & BONES
    let aktaSupply: SupplyInfo | null = null;
    let bonesSupply: SupplyInfo | null = null;
    try {
      const [aktaInfo, bonesInfo] = await Promise.all([
        dao.algorand.asset.getById(ids.akta),
        dao.algorand.asset.getById(ids.bones),
      ]);
      const [aktaReserve, bonesReserve] = await Promise.all([
        aktaInfo.reserve
          ? dao.algorand.asset.getAccountInformation(aktaInfo.reserve, ids.akta)
          : null,
        bonesInfo.reserve
          ? dao.algorand.asset.getAccountInformation(bonesInfo.reserve, ids.bones)
          : null,
      ]);
      aktaSupply = {
        total: aktaInfo.total,
        circulating: aktaInfo.total - (aktaReserve?.balance ?? 0n),
        decimals: aktaInfo.decimals,
      };
      bonesSupply = {
        total: bonesInfo.total,
        circulating: bonesInfo.total - (bonesReserve?.balance ?? 0n),
        decimals: bonesInfo.decimals,
      };
    } catch {
      // Asset info fetch failed — skip supply charts
    }

    if (width < 80) {
      return renderSingleColumn(state, network, ids, width, aktaSupply, bonesSupply);
    }

    const gridRows: string[][][] = [];

    // Row 1: DAO info + Assets + Token Supply
    const hasSupply = aktaSupply || bonesSupply;
    const colCount = hasSupply ? 3 : 2;
    const colWidths = splitWidth(width, colCount);

    const infoContent = renderKV([
      ["Network", network],
      ["App ID", dao.appId.toString()],
      ["Version", state.version ?? "-"],
      ["State", state.state !== undefined ? colorState(daoStateLabel(state.state)) : "-"],
      ["Wallet", state.wallet ? resolveAppName(state.wallet, network) : "-"],
    ]);
    const infoPanel = renderPanel(infoContent, { title: "Akita DAO", width: colWidths[0] });

    const assetsContent = renderKV([
      ["AKTA", state.akitaAssets?.akta?.toString() ?? ids.akta.toString()],
      ["BONES", state.akitaAssets?.bones?.toString() ?? ids.bones.toString()],
      ["Next Proposal", state.proposalId?.toString() ?? "-"],
      ["Action Limit", state.proposalActionLimit?.toString() ?? "-"],
      ["Min Rewards", state.minRewardsImpact?.toString() ?? "-"],
    ]);
    const assetsPanel = renderPanel(assetsContent, { title: "Assets", width: colWidths[1] });

    if (hasSupply) {
      const supplyW = colWidths[2];
      const supplyContent = renderSupplyCharts(aktaSupply, bonesSupply, supplyW - 4);
      const supplyPanel = renderPanel(supplyContent, { title: "Token Supply", width: supplyW });
      gridRows.push([infoPanel, assetsPanel, supplyPanel]);
    } else {
      gridRows.push([infoPanel, assetsPanel]);
    }

    // Row 3: App IDs (40%) + Proposal Settings / Revenue Splits stacked (60%)
    const appLines = renderAppTable(state, network);
    const proposalLines = renderProposalSettings(state);

    if (appLines.length > 0 || proposalLines.length > 0) {
      // ~40/60 split
      const appW = Math.floor((width - 2) * 0.4);
      const rightPanelW = width - appW - 2;
      const revLines = renderRevenueSplits(state, network, rightPanelW - 4);

      const leftPanel = appLines.length > 0
        ? renderPanel(appLines, { title: "App IDs", width: appW })
        : renderPanel(["  No app ID data"], { title: "App IDs", width: appW });

      // Stack Proposal Settings + Revenue Splits into one right column
      const rightPanels: string[] = [];
      if (proposalLines.length > 0) {
        rightPanels.push(...renderPanel(proposalLines, { title: "Proposal Settings", width: rightPanelW }));
      }
      if (revLines.length > 0) {
        if (rightPanels.length > 0) rightPanels.push("");
        rightPanels.push(...renderPanel(revLines, { title: "Revenue Splits", width: rightPanelW }));
      }
      if (rightPanels.length === 0) {
        rightPanels.push(...renderPanel(["  No proposal settings"], { title: "Proposal Settings", width: rightPanelW }));
      }

      gridRows.push([leftPanel, rightPanels]);
    }

    return ["", ...renderPanelGrid(gridRows, { rowGap: 1 })];
  },
};

// ── Single-column fallback for narrow terminals ────────────────

function renderSingleColumn(
  state: Partial<AkitaDaoGlobalState>,
  network: AkitaNetwork,
  ids: { akta: bigint; bones: bigint },
  width: number,
  aktaSupply: SupplyInfo | null,
  bonesSupply: SupplyInfo | null,
): string[] {
  const lines: string[] = [""];

  const infoContent = renderKV([
    ["Network", network],
    ["State", state.state !== undefined ? colorState(daoStateLabel(state.state)) : "-"],
    ["Version", state.version ?? "-"],
    ["Wallet", state.wallet ? resolveAppName(state.wallet, network) : "-"],
    ["AKTA", state.akitaAssets?.akta?.toString() ?? ids.akta.toString()],
    ["BONES", state.akitaAssets?.bones?.toString() ?? ids.bones.toString()],
    ["Next Proposal", state.proposalId?.toString() ?? "-"],
    ["Action Limit", state.proposalActionLimit?.toString() ?? "-"],
  ]);
  lines.push(...renderPanel(infoContent, { title: "Akita DAO", width }));

  if (aktaSupply || bonesSupply) {
    lines.push("");
    const supplyContent = renderSupplyCharts(aktaSupply, bonesSupply, width - 4);
    lines.push(...renderPanel(supplyContent, { title: "Token Supply", width }));
  }

  const appLines = renderAppTable(state, network);
  if (appLines.length > 0) {
    lines.push("");
    lines.push(...renderPanel(appLines, { title: "App IDs", width }));
  }

  const proposalLines = renderProposalSettings(state);
  if (proposalLines.length > 0) {
    lines.push("");
    lines.push(...renderPanel(proposalLines, { title: "Proposal Settings", width }));
  }

  const revLines = renderRevenueSplits(state, network, width - 4);
  if (revLines.length > 0) {
    lines.push("");
    lines.push(...renderPanel(revLines, { title: "Revenue Splits", width }));
  }

  return lines;
}

// ── Helpers ────────────────────────────────────────────────────

function renderAppTable(state: Partial<AkitaDaoGlobalState>, network: AkitaNetwork): string[] {
  const sections: [string, Record<string, bigint> | undefined][] = [
    ["Core", state.akitaAppList as Record<string, bigint> | undefined],
    ["Social", state.akitaSocialAppList as Record<string, bigint> | undefined],
    ["Plugins", state.pluginAppList as Record<string, bigint> | undefined],
    ["Other", state.otherAppList as Record<string, bigint> | undefined],
  ];

  const rows: string[][] = [];
  for (const [category, apps] of sections) {
    if (!apps) continue;
    for (const [, id] of Object.entries(apps)) {
      rows.push([category, getAppName(id, network) ?? id.toString(), id.toString()]);
    }
  }

  if (rows.length === 0) return [];
  return renderColumns(["Category", "Name", "App ID"], rows);
}

function renderProposalSettings(state: Partial<AkitaDaoGlobalState>): string[] {
  const settings: [string, { fee: bigint; power: bigint; duration: bigint; participation: bigint; approval: bigint } | undefined][] = [
    ["Upgrade App", state.upgradeAppProposalSettings],
    ["Add Plugin", state.addPluginProposalSettings],
    ["Remove Plugin", state.removePluginProposalSettings],
    ["Rm Exec Plugin", state.removeExecutePluginProposalSettings],
    ["Add Allowances", state.addAllowancesProposalSettings],
    ["Rm Allowances", state.removeAllowancesProposalSettings],
    ["New Escrow", state.newEscrowProposalSettings],
    ["Toggle Lock", state.toggleEscrowLockProposalSettings],
    ["Update Fields", state.updateFieldsProposalSettings],
  ];

  const hasAny = settings.some(([, v]) => v !== undefined);
  if (!hasAny) return [];

  const rows = settings.map(([label, ps]) => {
    if (!ps) return [label, "-", "-", "-", "-", "-"];
    return [
      label,
      formatMicroAlgo(ps.fee),
      formatBigInt(ps.power),
      formatDuration(ps.duration),
      inlineBar(ps.participation),
      inlineBar(ps.approval),
    ];
  });

  return renderColumns(["Cat", "Fee", "Pwr", "Dur", "Part", "Appr"], rows);
}

const SPLIT_COLORS = theme.splitColors;

function renderRevenueSplits(state: Partial<AkitaDaoGlobalState>, network: AkitaNetwork, barWidth: number): string[] {
  if (!state.revenueSplits || state.revenueSplits.length === 0) return [];

  // Calculate remainder percentage (100% minus all explicit percentages)
  let pctSum = 0n;
  for (const [, type, value] of state.revenueSplits) {
    if (type === 20) pctSum += value; // Percentage type
  }

  // Resolve each split's percentage
  const splits: { name: string; pct: number }[] = state.revenueSplits.map(([[wallet, escrow], type, value]) => {
    let bp: bigint;
    if (type === 20) bp = value;
    else if (type === 30) bp = 100_000n - pctSum;
    else bp = 0n;

    const name = escrow || (getAppName(wallet, network) ?? wallet.toString());
    return { name, pct: Number(bp) / 1000 };
  });

  const barMax = Math.max(10, barWidth - 4);

  // Build stacked bar — one segment per split
  let bar = "  ";
  let usedChars = 0;
  for (let i = 0; i < splits.length; i++) {
    const color = SPLIT_COLORS[i % SPLIT_COLORS.length];
    const isLast = i === splits.length - 1;
    const chars = isLast ? barMax - usedChars : Math.round((splits[i].pct / 100) * barMax);
    bar += color("█".repeat(Math.max(0, chars)));
    usedChars += chars;
  }

  // Legend line — colored markers with labels
  const legend = splits.map((s, i) => {
    const color = SPLIT_COLORS[i % SPLIT_COLORS.length];
    return color("■") + ` ${s.name} ${theme.chartDim(`${s.pct}%`)}`;
  });

  // Wrap legend entries to fit width
  const lines: string[] = [];
  const maxLegendW = barWidth - 2;
  let current = "  ";
  for (const entry of legend) {
    const candidate = current === "  " ? "  " + entry : current + "   " + entry;
    if (visibleLength(candidate) > maxLegendW && current !== "  ") {
      lines.push(current);
      current = "  " + entry;
    } else {
      current = candidate;
    }
  }
  if (current !== "  ") lines.push(current);

  lines.push("");
  lines.push(bar);

  return lines;
}

// ── Inline bar for basis-point percentages ─────────────────────

const INLINE_BAR_WIDTH = 8;

function inlineBar(bp: bigint): string {
  const pct = Number(bp) / 1000;
  const filled = Math.round((pct / 100) * INLINE_BAR_WIDTH);
  const empty = INLINE_BAR_WIDTH - filled;
  return `${theme.barFilled("█".repeat(filled))}${theme.barEmpty("░".repeat(empty))} ${theme.chartDim(`${pct}%`)}`;
}

// ── Supply bar chart ────────────────────────────────────────────

interface SupplyInfo { total: bigint; circulating: bigint; decimals: number }

function renderSupplyCharts(
  akta: SupplyInfo | null,
  bones: SupplyInfo | null,
  barWidth: number,
): string[] {
  const lines: string[] = [];
  if (akta) lines.push(...renderSupplyBar("AKTA", akta, barWidth));
  if (akta && bones) lines.push("");
  if (bones) lines.push(...renderSupplyBar("BONES", bones, barWidth));
  return lines;
}

function renderSupplyBar(label: string, supply: SupplyInfo, maxWidth: number): string[] {
  const pct = supply.total > 0n
    ? Number((supply.circulating * 10000n) / supply.total) / 100
    : 0;

  // Label line:  AKTA  1.5B / 2.3B  (65.2%)
  const circStr = formatCompact(supply.circulating, supply.decimals);
  const totalStr = formatCompact(supply.total, supply.decimals);
  const header = `  ${theme.chartLabel(label)}  ${circStr} / ${totalStr}  ${theme.chartDim(`(${pct.toFixed(1)}%)`)}`;

  // Bar: ████████████░░░░░░░░
  const barMax = Math.max(10, maxWidth - 4); // 2 padding each side
  const filled = Math.round((pct / 100) * barMax);
  const empty = barMax - filled;
  const bar = `  ${theme.barFilled("█".repeat(filled))}${theme.barEmpty("░".repeat(empty))}`;

  return [header, bar];
}
