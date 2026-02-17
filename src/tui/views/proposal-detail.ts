import type { AkitaNetwork } from "@akta/sdk";
import { ProposalActionEnum } from "@akta/sdk/dao";
import type { DecodedProposalAction } from "@akta/sdk/dao";
import { renderKV } from "../../output";
import theme from "../../theme";
import {
  truncateAddress,
  formatTimestamp,
  formatCID,
  proposalStatusLabel,
  proposalActionLabel,
  formatMicroAlgo,
  formatBasisPoints,
  formatDuration,
  formatBigInt,
  colorStatus,
  colorBool,
  delegationTypeLabel,
  isZeroAddress,
  resolveAppName,
  resolveMethodSelector,
  decodeFieldUpdate,
} from "../../formatting";
import { renderPanel, renderPanelRow, splitWidth } from "../panels";

// ── Allowance type mapping ─────────────────────────────────────

const ALLOWANCE_TYPES: Record<number, string> = { 1: "Flat", 2: "Window", 3: "Drip" };

// ── Proposal detail rendering ──────────────────────────────────

export interface ProposalData {
  status: number;
  cid: Uint8Array;
  votes: { approvals: bigint; rejections: bigint; abstains: bigint };
  creator: string;
  votingTs: bigint;
  created: bigint;
  feesPaid: bigint;
  actions: DecodedProposalAction[];
}

/**
 * Render all detail panels for a decoded proposal.
 * Returns an array of lines (stacked panels: meta, votes, actions).
 */
export function renderProposalDetail(
  proposal: ProposalData,
  proposalId: bigint,
  network: AkitaNetwork,
  width: number,
): string[] {
  const lines: string[] = [];

  // Meta + Votes side-by-side if wide enough, otherwise stacked
  const metaContent = renderKV([
    ["Status", colorStatus(proposalStatusLabel(proposal.status))],
    ["Creator", truncateAddress(proposal.creator)],
    ["CID", formatCID(proposal.cid)],
    ["Created", formatTimestamp(proposal.created)],
    ["Voting", formatTimestamp(proposal.votingTs)],
    ["Fees Paid", formatMicroAlgo(proposal.feesPaid)],
  ]);

  const votesContent = renderKV([
    ["Approvals", formatBigInt(proposal.votes.approvals)],
    ["Rejections", formatBigInt(proposal.votes.rejections)],
    ["Abstains", formatBigInt(proposal.votes.abstains)],
  ]);

  if (width >= 60) {
    const [leftW, rightW] = splitWidth(width, 2);
    const metaPanel = renderPanel(metaContent, { title: `Proposal #${proposalId}`, width: leftW });
    const votesPanel = renderPanel(votesContent, { title: "Votes", width: rightW });
    lines.push(...renderPanelRow([metaPanel, votesPanel]));
  } else {
    lines.push(...renderPanel(metaContent, { title: `Proposal #${proposalId}`, width }));
    lines.push("");
    lines.push(...renderPanel(votesContent, { title: "Votes", width }));
  }

  // Actions — one panel each
  for (let i = 0; i < proposal.actions.length; i++) {
    lines.push("");
    lines.push(...renderActionPanel(proposal.actions[i], i, network, width));
  }

  return lines;
}

// ── Action panel rendering ─────────────────────────────────────

function colorActionLabel(type: number): string {
  const label = proposalActionLabel(type);
  switch (type) {
    case ProposalActionEnum.AddPlugin:
    case ProposalActionEnum.AddNamedPlugin:
    case ProposalActionEnum.AddAllowances:
    case ProposalActionEnum.NewEscrow:
      return theme.actionAdd(label);
    case ProposalActionEnum.RemovePlugin:
    case ProposalActionEnum.RemoveNamedPlugin:
    case ProposalActionEnum.RemoveAllowances:
    case ProposalActionEnum.RemoveExecutePlugin:
      return theme.actionRemove(label);
    case ProposalActionEnum.UpgradeApp:
    case ProposalActionEnum.ExecutePlugin:
    case ProposalActionEnum.ToggleEscrowLock:
    case ProposalActionEnum.UpdateFields:
      return theme.actionModify(label);
    default:
      return label;
  }
}

function renderActionPanel(
  action: DecodedProposalAction,
  idx: number,
  network: AkitaNetwork,
  width: number,
): string[] {
  const title = `Action ${idx + 1}: ${colorActionLabel(action.type)}`;
  const content = renderKV(getActionPairs(action, network));

  appendActionExtras(action, content, network);

  return renderPanel(content, { title, width });
}

function getActionPairs(
  action: DecodedProposalAction,
  network: AkitaNetwork,
): [string, string][] {
  switch (action.type) {
    case ProposalActionEnum.UpgradeApp:
      return [
        ["App", resolveAppName(action.app, network)],
        ["Exec Key", formatBytes(action.executionKey)],
        ["Groups", `${action.groups.length}`],
        ["First Valid", action.firstValid.toString()],
        ["Last Valid", action.lastValid.toString()],
      ];

    case ProposalActionEnum.AddPlugin:
      return addPluginPairs(action, network);

    case ProposalActionEnum.AddNamedPlugin:
      return [["Name", action.name], ...addPluginPairs(action, network)];

    case ProposalActionEnum.ExecutePlugin:
      return [
        ["Plugin", resolveAppName(action.plugin, network)],
        ["Escrow", action.escrow || "(default)"],
        ["Exec Key", formatBytes(action.executionKey)],
        ["Groups", `${action.groups.length}`],
        ["First Valid", action.firstValid.toString()],
        ["Last Valid", action.lastValid.toString()],
      ];

    case ProposalActionEnum.RemoveExecutePlugin:
      return [
        ["Exec Key", formatBytes(action.executionKey)],
      ];

    case ProposalActionEnum.RemovePlugin:
      return [
        ["Plugin", resolveAppName(action.plugin, network)],
        ["Caller", formatCaller(action.caller)],
        ["Escrow", action.escrow || "(default)"],
      ];

    case ProposalActionEnum.RemoveNamedPlugin:
      return [
        ["Name", action.name],
        ["Plugin", resolveAppName(action.plugin, network)],
        ["Caller", formatCaller(action.caller)],
        ["Escrow", action.escrow || "(default)"],
      ];

    case ProposalActionEnum.AddAllowances:
      return [
        ["Escrow", action.escrow || "(default)"],
        ["Count", `${action.allowances.length}`],
      ];

    case ProposalActionEnum.RemoveAllowances:
      return [
        ["Escrow", action.escrow || "(default)"],
        ["Assets", action.assets.map((a) => a.toString()).join(", ")],
      ];

    case ProposalActionEnum.NewEscrow:
      return [["Escrow", action.escrow]];

    case ProposalActionEnum.ToggleEscrowLock:
      return [["Escrow", action.escrow]];

    case ProposalActionEnum.UpdateFields: {
      const decoded = decodeFieldUpdate(action.field, action.value, network);
      return [
        ["Field", `${action.field} (${decoded.label})`],
        ...decoded.pairs,
      ];
    }

    default:
      return [["Type", String((action as any).type)]];
  }
}

// ── AddPlugin helper ───────────────────────────────────────────

function addPluginPairs(
  action: {
    plugin: bigint;
    caller: string;
    escrow: string;
    delegationType: number;
    lastValid: bigint;
    cooldown: bigint;
    useRounds: boolean;
    useExecutionKey: boolean;
    coverFees: boolean;
    defaultToEscrow: boolean;
    fee: bigint;
    power: bigint;
    duration: bigint;
    participation: bigint;
    approval: bigint;
    sourceLink: string;
  },
  network: AkitaNetwork,
): [string, string][] {
  const pairs: [string, string][] = [
    ["Plugin", resolveAppName(action.plugin, network)],
    ["Caller", formatCaller(action.caller)],
    ["Escrow", action.escrow || "(default)"],
    ["Delegation", delegationTypeLabel(action.delegationType)],
    ["Cover Fees", colorBool(action.coverFees)],
    ["Default to Escrow", colorBool(action.defaultToEscrow)],
    ["Use Exec Key", colorBool(action.useExecutionKey)],
    ["Use Rounds", colorBool(action.useRounds)],
  ];

  if (action.cooldown > 0n) {
    pairs.push(["Cooldown", formatDuration(action.cooldown)]);
  }

  const MAX_UINT64 = BigInt("18446744073709551615");
  if (action.lastValid < MAX_UINT64) {
    pairs.push(["Last Valid", action.useRounds ? action.lastValid.toString() : formatTimestamp(action.lastValid)]);
  }

  if (action.sourceLink) {
    pairs.push(["Source", action.sourceLink]);
  }

  if (action.useExecutionKey) {
    pairs.push(
      ["Proposal Fee", formatMicroAlgo(action.fee)],
      ["Voting Power", formatBigInt(action.power)],
      ["Duration", formatDuration(action.duration)],
      ["Participation", formatBasisPoints(action.participation)],
      ["Approval", formatBasisPoints(action.approval)],
    );
  }

  return pairs;
}

// ── Extra content (methods, allowances) ────────────────────────

function appendActionExtras(
  action: DecodedProposalAction,
  content: string[],
  _network: AkitaNetwork,
): void {
  if (
    action.type === ProposalActionEnum.AddPlugin ||
    action.type === ProposalActionEnum.AddNamedPlugin
  ) {
    if (action.methods.length > 0) {
      const methods = action.methods.map(([selector, cooldown]) => {
        const name = resolveMethodSelector(selector);
        return cooldown > 0n ? `${name} (${formatDuration(cooldown)})` : name;
      });
      content.push("");
      content.push("  " + theme.label("Methods: ") + methods.join(", "));
    }

    if (action.allowances.length > 0) {
      content.push("");
      content.push("  " + theme.label("Allowances:"));
      for (const [asset, type, amount, max, interval, useRounds] of action.allowances) {
        const typeName = ALLOWANCE_TYPES[type] ?? `Type(${type})`;
        const parts = [`Asset ${asset}`, typeName];
        if (type === 1) parts.push(`amount: ${formatBigInt(amount)}`);
        else if (type === 2) parts.push(`amount: ${formatBigInt(amount)}`, `interval: ${formatDuration(interval)}`);
        else if (type === 3) parts.push(`rate: ${formatBigInt(amount)}`, `max: ${formatBigInt(max)}`, `interval: ${formatDuration(interval)}`);
        if (useRounds) parts.push("(rounds)");
        content.push("    " + theme.label(parts.join(" · ")));
      }
    }
  }

  if (action.type === ProposalActionEnum.AddAllowances && action.allowances.length > 0) {
    content.push("");
    for (const [asset, type, amount, max, interval, useRounds] of action.allowances) {
      const typeName = ALLOWANCE_TYPES[type] ?? `Type(${type})`;
      const parts = [`Asset ${asset}`, typeName];
      if (type === 1) parts.push(`amount: ${formatBigInt(amount)}`);
      else if (type === 2) parts.push(`amount: ${formatBigInt(amount)}`, `interval: ${formatDuration(interval)}`);
      else if (type === 3) parts.push(`rate: ${formatBigInt(amount)}`, `max: ${formatBigInt(max)}`, `interval: ${formatDuration(interval)}`);
      if (useRounds) parts.push("(rounds)");
      content.push("  " + theme.label(parts.join(" · ")));
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────

function formatCaller(caller: string): string {
  if (!caller || isZeroAddress(caller)) return theme.globalCaller("Global");
  return truncateAddress(caller);
}

function formatBytes(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString("hex");
  if (hex.length <= 16) return hex;
  return hex.slice(0, 16) + "...";
}
