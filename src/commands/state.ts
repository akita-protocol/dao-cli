import type { AkitaDaoSDK } from "@akta/sdk";
import { type AkitaNetwork } from "@akta/sdk";
import type { AkitaDaoGlobalState } from "@akta/sdk/dao";
import { printJson, printKV, header, printColumns, printMultiColumnKV, type KVGroup } from "../output";
import {
  formatMicroAlgo,
  formatBasisPoints,
  formatDuration,
  formatBigInt,
  daoStateLabel,
  resolveAppName,
  getAppName,
  colorState,
} from "../formatting";

export async function stateCommand(dao: AkitaDaoSDK, network: AkitaNetwork, json: boolean): Promise<void> {
  const state = await dao.getGlobalState();

  if (json) {
    let pluginProposalSettings: { plugin: bigint; pluginName: string; account: string; fee: bigint; power: bigint; duration: bigint; participation: bigint; approval: bigint }[] = [];
    try {
      const pluginsMap = await dao.client.state.box.plugins.getMap();
      pluginProposalSettings = [...pluginsMap.entries()].map(([key, ps]) => ({
        plugin: key.plugin,
        pluginName: (getAppName(key.plugin, network) ?? key.plugin.toString()).replace(/ Plugin$/, ""),
        account: key.escrow || "Main",
        fee: ps.fee,
        power: ps.power,
        duration: ps.duration,
        participation: ps.participation,
        approval: ps.approval,
      }));
    } catch {
      // Box may be empty or inaccessible
    }
    return printJson({ ...state, pluginProposalSettings });
  }

  header("Core Settings");
  printKV([
    ["State", state.state !== undefined ? colorState(daoStateLabel(state.state)) : "-"],
    ["Version", state.version ?? "-"],
    ["Wallet", state.wallet ? resolveAppName(state.wallet, network) : "-"],
    ["Proposal Action Limit", state.proposalActionLimit?.toString() ?? "-"],
    ["Min Rewards Impact", state.minRewardsImpact?.toString() ?? "-"],
    ["Next Proposal ID", state.proposalId?.toString() ?? "-"],
  ]);

  if (state.akitaAssets) {
    header("Assets");
    printKV([
      ["AKTA", state.akitaAssets.akta.toString()],
      ["BONES", state.akitaAssets.bones.toString()],
    ]);
  }

  printAppLists(state, network);
  printFees(state);
  printProposalSettings(state);
  await printPluginProposalSettings(dao, network);
  printRevenueSplits(state, network);
}

function printAppLists(state: Partial<AkitaDaoGlobalState>, network: AkitaNetwork): void {
  header("App IDs");

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
      rows.push([category, resolveAppName(id, network), id.toString()]);
    }
  }

  printColumns(["Category", "Name", "App ID"], rows);
}

// Fields that represent basis point percentages
const PERCENTAGE_FIELDS = new Set([
  "referrerPercentage",
  "impactTaxMin", "impactTaxMax",
  "paymentPercentage", "triggerPercentage",
  "marketplaceSalePercentageMin", "marketplaceSalePercentageMax",
  "marketplaceComposablePercentage", "marketplaceRoyaltyDefaultPercentage",
  "shuffleSalePercentage",
  "auctionSaleImpactTaxMin", "auctionSaleImpactTaxMax",
  "auctionComposablePercentage", "auctionRafflePercentage",
  "raffleSaleImpactTaxMin", "raffleSaleImpactTaxMax",
  "raffleComposablePercentage",
]);

// Fields that represent microAlgo fees
const FEE_FIELDS = new Set([
  "createFee", "creationFee", "serviceCreationFee",
  "postFee", "reactFee",
  "omnigemSaleFee", "auctionCreationFee", "raffleCreationFee",
]);

function formatFeeValue(key: string, value: bigint): string {
  if (PERCENTAGE_FIELDS.has(key)) return formatBasisPoints(value);
  if (FEE_FIELDS.has(key)) return formatMicroAlgo(value);
  return formatBigInt(value);
}

function feeLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function printFees(state: Partial<AkitaDaoGlobalState>): void {
  const feeGroups: [string, Record<string, bigint> | undefined][] = [
    ["Wallet Fees", state.walletFees as Record<string, bigint> | undefined],
    ["Social Fees", state.socialFees as Record<string, bigint> | undefined],
    ["Staking Fees", state.stakingFees as Record<string, bigint> | undefined],
    ["Subscription Fees", state.subscriptionFees as Record<string, bigint> | undefined],
    ["NFT Fees", state.nftFees as Record<string, bigint> | undefined],
    ["Swap Fees", state.swapFees as Record<string, bigint> | undefined],
  ];

  const groups: KVGroup[] = [];
  for (const [name, fees] of feeGroups) {
    if (!fees) continue;
    groups.push({
      title: name,
      pairs: Object.entries(fees).map(([k, v]) => [feeLabel(k), formatFeeValue(k, v)]),
    });
  }

  if (groups.length === 0) return;

  header("Fees");
  printMultiColumnKV(groups);
}

function printProposalSettings(state: Partial<AkitaDaoGlobalState>): void {
  const settings: [string, { fee: bigint; power: bigint; duration: bigint; participation: bigint; approval: bigint } | undefined][] = [
    ["Upgrade App", state.upgradeAppProposalSettings],
    ["Add Plugin", state.addPluginProposalSettings],
    ["Remove Plugin", state.removePluginProposalSettings],
    ["Remove Execute Plugin", state.removeExecutePluginProposalSettings],
    ["Add Allowances", state.addAllowancesProposalSettings],
    ["Remove Allowances", state.removeAllowancesProposalSettings],
    ["New Escrow", state.newEscrowProposalSettings],
    ["Toggle Escrow Lock", state.toggleEscrowLockProposalSettings],
    ["Update Fields", state.updateFieldsProposalSettings],
  ];

  const hasAny = settings.some(([, v]) => v !== undefined);
  if (!hasAny) return;

  header("Proposal Settings");
  const rows = settings.map(([label, ps]) => {
    if (!ps) return [label, "-", "-", "-", "-", "-"];
    return [
      label,
      formatMicroAlgo(ps.fee),
      formatBigInt(ps.power),
      formatDuration(ps.duration),
      formatBasisPoints(ps.participation),
      formatBasisPoints(ps.approval),
    ];
  });
  printColumns(["Category", "Fee", "Power", "Duration", "Participation", "Approval"], rows);
}

async function printPluginProposalSettings(dao: AkitaDaoSDK, network: AkitaNetwork): Promise<void> {
  let pluginsMap: Map<{ plugin: bigint; escrow: string }, { fee: bigint; power: bigint; duration: bigint; participation: bigint; approval: bigint }>;
  try {
    pluginsMap = await dao.client.state.box.plugins.getMap();
  } catch {
    return;
  }
  if (pluginsMap.size === 0) return;

  header("Plugin Proposal Settings");
  const rows = [...pluginsMap.entries()].map(([key, ps]) => {
    const name = (getAppName(key.plugin, network) ?? key.plugin.toString()).replace(/ Plugin$/, "");
    return [
      name,
      key.escrow || "Main",
      formatMicroAlgo(ps.fee),
      formatBigInt(ps.power),
      formatDuration(ps.duration),
      formatBasisPoints(ps.participation),
      formatBasisPoints(ps.approval),
    ];
  });
  printColumns(["Plugin", "Account", "Fee", "Power", "Duration", "Participation", "Approval"], rows);
}

function printRevenueSplits(state: Partial<AkitaDaoGlobalState>, network: AkitaNetwork): void {
  if (!state.revenueSplits || state.revenueSplits.length === 0) return;

  header("Revenue Splits");
  const typeLabels: Record<number, string> = { 10: "Flat", 20: "Percentage", 30: "Remainder" };
  const rows = state.revenueSplits.map(([[wallet, escrow], type, value]) => [
    resolveAppName(wallet, network),
    escrow || "(default)",
    typeLabels[type] ?? `Unknown (${type})`,
    type === 20 ? formatBasisPoints(value) : formatBigInt(value),
  ]);
  printColumns(["Wallet", "Escrow", "Type", "Value"], rows);
}
