import { getNetworkAppIds } from "@akta/sdk";
import type { AkitaNetwork } from "@akta/sdk";
import algosdk from "algosdk";
import { renderKV, renderColumns, padEndVisible } from "../../output";
import theme from "../../theme";
import {
  truncateAddress,
  getAppName,
  resolveAppName,
  camelToLabel,
  isZeroAddress,
  delegationTypeLabel,
  formatDuration,
  formatTimestamp,
  formatBigInt,
  formatCompact,
  colorBool,
  parsePluginKey,
  resolveMethodSelector,
} from "../../formatting";
import { renderPanel, splitWidth } from "../panels";
import type { LoadResult, View, ViewContext } from "../types";

// ── Module-level account selection state ────────────────────────

let _accountIdx = 0;
let _accountCount = 1;
let _selectedLine = 0; // line of selected account in left panel content

export function cycleWalletAccount(dir: 1 | -1): void {
  if (_accountCount <= 1) return;
  _accountIdx = (_accountIdx + dir + _accountCount) % _accountCount;
}

export function resetWalletAccount(): void {
  _accountIdx = 0;
}

export function getWalletAccountCount(): number {
  return _accountCount;
}

export function getSelectedAccountLine(): number {
  return _selectedLine;
}

// ── Cached wallet data ──────────────────────────────────────────

interface WalletCache {
  ts: number;
  globalState: Record<string, unknown>;
  plugins: [string, PluginData][];
  namedPlugins: [string, { plugin: bigint; caller: string; escrow: string }][];
  escrows: [string, { id: bigint; locked: boolean }][];
  allowances: [string, AllowanceData][];
  executions: [string, { firstValid: bigint; lastValid: bigint }][];
  balances: Map<string, { algo: bigint; akta: bigint; bones: bigint; usdc: bigint }>;
  decimals: { akta: number; bones: number; usdc: number };
}

interface PluginData {
  admin: boolean;
  delegationType: number;
  coverFees: boolean;
  canReclaim: boolean;
  useExecutionKey: boolean;
  useRounds: boolean;
  cooldown: bigint;
  lastCalled: bigint;
  start: bigint;
  lastValid: bigint;
  methods: { name: Uint8Array; cooldown: bigint; lastCalled: bigint }[];
}

interface AllowanceData {
  type: string;
  amount?: bigint;
  spent?: bigint;
  rate?: bigint;
  max?: bigint;
  interval?: bigint;
}

const CACHE_TTL = 30_000;
let _cache: WalletCache | null = null;

function invalidateCache(): void {
  _cache = null;
}

export { invalidateCache as invalidateWalletCache };

// ── Hidden fields for wallet info ───────────────────────────────

const HIDDEN_WALLET_FIELDS = new Set([
  "spendingAddress",
  "currentPlugin",
  "rekeyIndex",
]);

// ── Main wallet view ────────────────────────────────────────────

export const walletView: View = {
  async load(ctx: ViewContext): Promise<string[] | LoadResult> {
    const { dao, network, width } = ctx;
    const wallet = await dao.getWallet();
    const ids = getNetworkAppIds(network);

    // Fetch and cache data
    if (!_cache || Date.now() - _cache.ts > CACHE_TTL) {
      const [globalState, plugins, namedPlugins, escrows, allowances, executions] = await Promise.all([
        wallet.getGlobalState(),
        wallet.getPlugins(),
        wallet.getNamedPlugins(),
        wallet.getEscrows(),
        wallet.getAllowances(),
        wallet.getExecutions(),
      ]);

      const escrowEntries = Array.from(escrows.entries()).sort(([a], [b]) => a.localeCompare(b));

      // Fetch balances + asset decimals in parallel
      const mainAddr = algosdk.getApplicationAddress(wallet.appId).toString();
      const addresses = [mainAddr, ...escrowEntries.map(([, info]) =>
        algosdk.getApplicationAddress(info.id).toString()
      )];
      const balanceMap = new Map<string, { algo: bigint; akta: bigint; bones: bigint; usdc: bigint }>();

      const [balanceResults, assetDecimals] = await Promise.all([
        Promise.allSettled(
          addresses.map(async (addr) => {
            const accountInfo = await dao.algorand.account.getInformation(addr);
            const algo = BigInt((accountInfo as any).amount);
            const findAsset = (id: bigint) =>
              accountInfo.assets?.find((a: { assetId: bigint }) => a.assetId === id);
            return {
              addr,
              algo,
              akta: findAsset(ids.akta)?.amount ?? 0n,
              bones: findAsset(ids.bones)?.amount ?? 0n,
              usdc: findAsset(ids.usdc)?.amount ?? 0n,
            };
          })
        ),
        Promise.all([
          dao.algorand.asset.getById(ids.akta).then(a => a.decimals).catch(() => 0),
          dao.algorand.asset.getById(ids.bones).then(a => a.decimals).catch(() => 0),
          dao.algorand.asset.getById(ids.usdc).then(a => a.decimals).catch(() => 6),
        ]),
      ]);

      for (const result of balanceResults) {
        if (result.status === "fulfilled") {
          const { addr, algo, akta, bones, usdc } = result.value;
          balanceMap.set(addr, { algo, akta, bones, usdc });
        }
      }

      _cache = {
        ts: Date.now(),
        globalState: globalState as unknown as Record<string, unknown>,
        plugins: Array.from(plugins.entries()) as [string, PluginData][],
        namedPlugins: Array.from(namedPlugins.entries()) as [string, { plugin: bigint; caller: string; escrow: string }][],
        escrows: escrowEntries as [string, { id: bigint; locked: boolean }][],
        allowances: Array.from(allowances.entries()) as [string, AllowanceData][],
        executions: Array.from(executions.entries()).map(([key, info]) => [
          Buffer.from(key as Uint8Array).toString("hex"),
          info as { firstValid: bigint; lastValid: bigint },
        ]),
        balances: balanceMap,
        decimals: { akta: assetDecimals[0], bones: assetDecimals[1], usdc: assetDecimals[2] },
      };
    }

    const cache = _cache!;

    // Build account list: main wallet + escrows
    const mainAddr = algosdk.getApplicationAddress(wallet.appId).toString();
    const accounts: { name: string; address: string; escrowName: string }[] = [
      { name: "Main Wallet", address: mainAddr, escrowName: "" },
    ];
    for (const [escrowName, info] of cache.escrows) {
      accounts.push({
        name: escrowName,
        address: algosdk.getApplicationAddress(info.id).toString(),
        escrowName,
      });
    }

    _accountCount = accounts.length;
    if (_accountIdx >= _accountCount) _accountIdx = 0;

    const selectedAccount = accounts[_accountIdx];

    const selectedAppId = selectedAccount.escrowName === ""
      ? wallet.appId
      : cache.escrows.find(([n]) => n === selectedAccount.escrowName)?.[1].id ?? 0n;

    // Build structured data for JSON mode
    const data = buildWalletData(cache, network, accounts, selectedAccount, selectedAppId, wallet.appId);

    if (width < 80) {
      return {
        lines: renderSingleColumn(cache, network, accounts, selectedAccount, wallet.appId),
        data,
      };
    }

    // Two-panel layout
    const [leftW, rightW] = splitWidth(width, 2);

    const leftLines = renderLeftPanel(cache, network, accounts, leftW, wallet.appId);
    const rightLines = renderRightPanel(cache, network, selectedAccount, selectedAppId, rightW);

    return {
      lines: ["", ...leftLines],
      fixedRight: ["", ...rightLines],
      data,
    };
  },
};

// ── Structured data for JSON mode ────────────────────────────────

function buildWalletData(
  cache: WalletCache,
  network: AkitaNetwork,
  accounts: { name: string; address: string; escrowName: string }[],
  selectedAccount: { name: string; address: string; escrowName: string },
  selectedAppId: bigint,
  walletAppId: bigint,
) {
  const gs = cache.globalState;

  const info = {
    version: gs.version ?? null,
    admin: gs.admin ?? null,
    domain: typeof gs.domain === "string" && gs.domain ? gs.domain : null,
    nickname: typeof gs.nickname === "string" && gs.nickname ? gs.nickname : null,
    dao: gs.akitaDao ?? null,
    factory: typeof gs.factoryApp === "bigint" && (gs.factoryApp as bigint) > 0n ? gs.factoryApp : null,
    referrer: typeof gs.referrer === "string" && !isZeroAddress(gs.referrer) ? gs.referrer : null,
  };

  const mainAddr = accounts[0].address;
  const accountsData = accounts.map((acct) => {
    const bal = cache.balances.get(acct.address);
    return {
      name: acct.name,
      appId: acct.escrowName === ""
        ? walletAppId
        : cache.escrows.find(([n]) => n === acct.escrowName)?.[1].id ?? null,
      address: acct.address,
      balances: bal ?? null,
    };
  });

  const escrowsData = cache.escrows.map(([name, esc]) => ({
    name,
    appId: esc.id,
    locked: esc.locked,
  }));

  // Selected account details
  const escrowFilter = selectedAccount.escrowName;

  const filteredPlugins = cache.plugins.filter(([key]) => {
    const parsed = parsePluginKey(key);
    return escrowFilter === "" ? parsed.escrow === "" : parsed.escrow === escrowFilter;
  });

  const plugins = filteredPlugins.map(([key, p]) => {
    const { pluginId, caller } = parsePluginKey(key);
    return {
      key,
      pluginId: pluginId ?? null,
      pluginName: pluginId ? getAppName(pluginId, network) ?? null : null,
      caller: caller || null,
      admin: p.admin,
      delegationType: delegationTypeLabel(p.delegationType),
      coverFees: p.coverFees,
      canReclaim: p.canReclaim,
      useExecutionKey: p.useExecutionKey,
      useRounds: p.useRounds,
      cooldown: p.cooldown,
      lastCalled: p.lastCalled,
      start: p.start,
      lastValid: p.lastValid,
      methods: p.methods.map((m) => ({
        name: resolveMethodSelector(m.name),
        cooldown: m.cooldown,
        lastCalled: m.lastCalled,
      })),
    };
  });

  const namedPlugins = cache.namedPlugins.map(([name, np]) => ({
    name,
    plugin: np.plugin,
    caller: np.caller,
    escrow: np.escrow || null,
  }));

  const filteredAllowances = cache.allowances.filter(([key]) => {
    if (escrowFilter === "") return true;
    return key.includes(escrowFilter);
  });

  const allowances = filteredAllowances.map(([key, a]) => ({
    key,
    type: a.type,
    amount: a.amount ?? null,
    spent: a.spent ?? null,
    rate: a.rate ?? null,
    max: a.max ?? null,
    interval: a.interval ?? null,
  }));

  const executions = cache.executions.map(([key, e]) => ({
    lease: key,
    firstValid: e.firstValid,
    lastValid: e.lastValid,
  }));

  return {
    info,
    accounts: accountsData,
    escrows: escrowsData,
    selectedAccount: {
      name: selectedAccount.name,
      appId: selectedAppId,
      address: selectedAccount.address,
      plugins,
      namedPlugins,
      allowances,
      executions,
    },
  };
}

// ── Left panel: Wallet Info + Account List ─────────────────────

function renderLeftPanel(
  cache: WalletCache,
  network: AkitaNetwork,
  accounts: { name: string; address: string; escrowName: string }[],
  width: number,
  walletAppId: bigint,
): string[] {
  const lines: string[] = [];

  // Wallet Info section
  const infoPairs: [string, string][] = [];
  const gs = cache.globalState;

  const fields: [string, string][] = [
    ["Version", gs.version as string ?? "-"],
    ["Admin", typeof gs.admin === "string" ? truncateAddress(gs.admin) : "-"],
    ["Domain", typeof gs.domain === "string" && gs.domain ? gs.domain : "-"],
    ["Nickname", typeof gs.nickname === "string" && gs.nickname ? gs.nickname : "-"],
    ["DAO", typeof gs.akitaDao === "bigint" ? resolveAppName(gs.akitaDao as bigint, network) : "-"],
    ["Factory", typeof gs.factoryApp === "bigint" && (gs.factoryApp as bigint) > 0n
      ? resolveAppName(gs.factoryApp as bigint, network)
      : "-"],
  ];

  if (typeof gs.referrer === "string" && !isZeroAddress(gs.referrer)) {
    fields.push(["Referrer", truncateAddress(gs.referrer)]);
  }

  for (const [label, value] of fields) {
    infoPairs.push([label, value]);
  }

  const infoContent = renderKV(infoPairs);
  lines.push(...renderPanel(infoContent, { title: "Wallet Info", width }));

  // Account list section
  lines.push("");
  const accountsStart = lines.length + 1; // +1 for panel top border
  const accountContent: string[] = [];

  // Main wallet (full width)
  {
    const acct = accounts[0];
    const selected = _accountIdx === 0;
    if (selected) _selectedLine = accountsStart + accountContent.length;
    const marker = selected ? theme.cursor("▸ ") : "  ";
    const bal = cache.balances.get(acct.address);
    const addr = truncateAddress(acct.address, 4);
    const pluginCount = cache.plugins.filter(([key]) => parsePluginKey(key).escrow === "").length;

    accountContent.push(`${marker}${selected ? theme.selected(acct.name) : acct.name}  ${theme.label(addr)}`);
    const details = [
      bal ? `${formatAlgoCompact(bal.algo)} · ${formatCompact(bal.akta, cache.decimals.akta)} AKTA` : null,
      `${pluginCount} plugin${pluginCount !== 1 ? "s" : ""}`,
    ].filter(Boolean).join(" · ");
    accountContent.push(`    ${theme.label(details)}`);
  }

  // Grouped escrows in 2 columns
  if (accounts.length > 1) {
    const groups = buildEscrowGroups(accounts, cache);
    const colWidth = Math.floor((width - 4) / 2);
    const leftGroups = groups.filter((_, i) => i % 2 === 0);
    const rightGroups = groups.filter((_, i) => i % 2 === 1);
    const { lines: leftCol, selectedLine: leftSel } = renderGroupColumn(leftGroups, cache.decimals);
    const { lines: rightCol, selectedLine: rightSel } = renderGroupColumn(rightGroups, cache.decimals);
    const maxLen = Math.max(leftCol.length, rightCol.length);

    accountContent.push("");
    const mergeStart = accountContent.length;
    for (let i = 0; i < maxLen; i++) {
      const left = leftCol[i] ?? "";
      const right = rightCol[i] ?? "";
      accountContent.push(padEndVisible(left, colWidth) + right);
    }

    // Track selected line from whichever column has it
    const selInCol = leftSel >= 0 ? leftSel : rightSel;
    if (selInCol >= 0) {
      _selectedLine = accountsStart + mergeStart + selInCol;
    }
  }

  lines.push(...renderPanel(accountContent, { title: `Accounts (${accounts.length})`, width }));

  return lines;
}

// ── Right panel: Plugins, Named Plugins, Allowances, Executions ─

function renderRightPanel(
  cache: WalletCache,
  network: AkitaNetwork,
  selectedAccount: { name: string; address: string; escrowName: string },
  appId: bigint,
  width: number,
): string[] {
  const lines: string[] = [];
  const escrowFilter = selectedAccount.escrowName;

  // Account info header
  const accountContent = renderKV([
    ["App ID", appId.toString()],
    ["Address", selectedAccount.address],
  ]);
  lines.push(...renderPanel(accountContent, { title: selectedAccount.name, width }));
  lines.push("");

  // Filter plugins by selected account
  const filteredPlugins = cache.plugins.filter(([key]) => {
    const parsed = parsePluginKey(key);
    return escrowFilter === "" ? parsed.escrow === "" : parsed.escrow === escrowFilter;
  });

  // Plugins section
  if (filteredPlugins.length > 0) {
    for (let i = 0; i < filteredPlugins.length; i++) {
      const [key, info] = filteredPlugins[i];
      const { pluginId, caller } = parsePluginKey(key);
      const pluginName = pluginId ? getAppName(pluginId, network) : undefined;
      const pluginLabel = pluginName
        ? `${pluginName} (${pluginId})`
        : pluginId?.toString() ?? key;

      const callerLabel = caller === "" || isZeroAddress(caller) ? theme.globalCaller("Global") : truncateAddress(caller);
      const pairs: [string, string][] = [
        ["Caller", callerLabel],
        ["Admin", colorBool(info.admin)],
        ["Delegation", delegationTypeLabel(info.delegationType)],
        ["Cover Fees", colorBool(info.coverFees)],
        ["Can Reclaim", colorBool(info.canReclaim)],
        ["Use Exec Key", colorBool(info.useExecutionKey)],
        ["Use Rounds", colorBool(info.useRounds)],
      ];
      if (info.cooldown > 0n) pairs.push(["Cooldown", formatDuration(info.cooldown)]);
      if (info.lastCalled > 0n) pairs.push(["Last Called", formatTimestamp(info.lastCalled)]);
      if (info.start > 0n) pairs.push(["Start", formatTimestamp(info.start)]);
      if (info.lastValid < BigInt("18446744073709551615")) {
        pairs.push(["Last Valid", info.useRounds ? info.lastValid.toString() : formatTimestamp(info.lastValid)]);
      }

      const content = renderKV(pairs);

      if (info.methods.length > 0) {
        const methods = info.methods.map((m) => resolveMethodSelector(m.name));
        content.push("  " + theme.label("Methods: ") + methods.join(", "));
      }

      if (i > 0) lines.push("");
      lines.push(...renderPanel(content, { title: pluginLabel, width }));
    }
  } else {
    lines.push(...renderPanel(["  No plugins for this account."], { title: "Plugins", width }));
  }

  // Named Plugins section (not filtered by escrow - show all)
  if (cache.namedPlugins.length > 0) {
    const namedRows = cache.namedPlugins.map(([name, key]) => [
      name,
      key.plugin.toString(),
      truncateAddress(key.caller),
      key.escrow || "(default)",
    ]);
    lines.push("");
    const namedContent = renderColumns(["Name", "Plugin App", "Caller", "Escrow"], namedRows);
    lines.push(...renderPanel(namedContent, { title: "Named Plugins", width }));
  }

  // Allowances filtered by escrow
  const filteredAllowances = cache.allowances.filter(([key]) => {
    // Allowance keys are stringified AllowanceKey {escrow, asset}
    // The key format from ValueMap is the stringified version
    // For main wallet, escrow is "" or the escrow name
    if (escrowFilter === "") return true; // Show all for main wallet
    return key.includes(escrowFilter);
  });

  if (filteredAllowances.length > 0) {
    const rows = filteredAllowances.map(([key, info]) => {
      let details: string;
      if (info.type === "flat") {
        details = `amount: ${formatBigInt(info.amount!)}, spent: ${formatBigInt(info.spent!)}`;
      } else if (info.type === "window") {
        details = `amount: ${formatBigInt(info.amount!)}, spent: ${formatBigInt(info.spent!)}, interval: ${formatDuration(info.interval!)}`;
      } else {
        details = `rate: ${formatBigInt(info.rate!)}, max: ${formatBigInt(info.max!)}, interval: ${formatDuration(info.interval!)}`;
      }
      return [key, info.type, details];
    });
    lines.push("");
    const allowContent = renderColumns(["Key", "Type", "Details"], rows);
    lines.push(...renderPanel(allowContent, { title: "Allowances", width }));
  }

  // Execution keys (show all)
  if (cache.executions.length > 0) {
    const rows = cache.executions.map(([key, info]) => [
      key.slice(0, 16) + "...",
      info.firstValid.toString(),
      info.lastValid.toString(),
    ]);
    lines.push("");
    const execContent = renderColumns(["Lease (hex)", "First Valid", "Last Valid"], rows);
    lines.push(...renderPanel(execContent, { title: "Execution Keys", width }));
  }

  return lines;
}

// ── Single-column fallback ──────────────────────────────────────

function renderSingleColumn(
  cache: WalletCache,
  network: AkitaNetwork,
  accounts: { name: string; address: string; escrowName: string }[],
  selectedAccount: { name: string; address: string; escrowName: string },
  walletAppId: bigint,
): string[] {
  const width = 78; // Narrow fallback width
  const allLines: string[] = [""];

  // Wallet Info
  const gs = cache.globalState;
  const infoPairs: [string, string][] = [
    ["Version", gs.version as string ?? "-"],
    ["Admin", typeof gs.admin === "string" ? truncateAddress(gs.admin) : "-"],
    ["DAO", typeof gs.akitaDao === "bigint" ? resolveAppName(gs.akitaDao as bigint, network) : "-"],
  ];
  allLines.push(...renderPanel(renderKV(infoPairs), { title: "Wallet Info", width }));

  // Account list with selection (grouped)
  allLines.push("");
  const accountLines: string[] = [];
  {
    const selected = _accountIdx === 0;
    const marker = selected ? theme.cursor("▸ ") : "  ";
    accountLines.push(`${marker}${selected ? theme.selected(accounts[0].name) : accounts[0].name}`);
  }
  if (accounts.length > 1) {
    const groups = buildEscrowGroups(accounts, cache);
    accountLines.push("");
    accountLines.push(...renderGroupColumn(groups, cache.decimals).lines);
  }
  allLines.push(...renderPanel(accountLines, { title: `Accounts (${accounts.length})`, width }));

  // Right-side content for selected account
  const selectedAppId = selectedAccount.escrowName === ""
    ? walletAppId
    : cache.escrows.find(([n]) => n === selectedAccount.escrowName)?.[1].id ?? 0n;
  const right = renderRightPanel(cache, network, selectedAccount, selectedAppId, width);
  allLines.push("");
  allLines.push(...right);

  return allLines;
}

// ── Helpers ─────────────────────────────────────────────────────

function formatAlgoCompact(microAlgos: bigint): string {
  const whole = microAlgos / 1_000_000n;
  return `${formatCompact(whole)} ALGO`;
}

// ── Escrow grouping ─────────────────────────────────────────────

interface EscrowGroupItem {
  idx: number;
  acct: { name: string; address: string; escrowName: string };
  locked: boolean;
  pluginCount: number;
  balances?: { algo: bigint; akta: bigint; bones: bigint; usdc: bigint };
}

interface EscrowGroup {
  label: string;
  items: EscrowGroupItem[];
}

function escrowPrefix(name: string): string {
  const underscoreIdx = name.indexOf("_");
  if (underscoreIdx > 0) return name.slice(0, underscoreIdx);
  const match = name.match(/^[a-z]+/);
  return match ? match[0] : name;
}

function buildEscrowGroups(
  accounts: { name: string; address: string; escrowName: string }[],
  cache: WalletCache,
): EscrowGroup[] {
  const groupMap = new Map<string, EscrowGroup>();
  const groupOrder: string[] = [];

  for (let i = 1; i < accounts.length; i++) {
    const acct = accounts[i];
    const prefix = escrowPrefix(acct.escrowName);
    if (!groupMap.has(prefix)) {
      const label = prefix.charAt(0).toUpperCase() + prefix.slice(1);
      groupMap.set(prefix, { label, items: [] });
      groupOrder.push(prefix);
    }
    const escrowInfo = cache.escrows.find(([n]) => n === acct.escrowName)?.[1];
    const pluginCount = cache.plugins.filter(([key]) => {
      const parsed = parsePluginKey(key);
      return parsed.escrow === acct.escrowName;
    }).length;
    groupMap.get(prefix)!.items.push({
      idx: i,
      acct,
      locked: escrowInfo?.locked ?? false,
      pluginCount,
      balances: cache.balances.get(acct.address),
    });
  }

  return groupOrder.map((p) => groupMap.get(p)!);
}

function renderGroupColumn(groups: EscrowGroup[], decimals: { akta: number; bones: number; usdc: number }): { lines: string[]; selectedLine: number } {
  const lines: string[] = [];
  let selectedLine = -1;
  for (const g of groups) {
    if (lines.length > 0) lines.push("");
    lines.push(theme.label(g.label));
    for (const item of g.items) {
      const selected = item.idx === _accountIdx;
      if (selected) selectedLine = lines.length;
      const marker = selected ? theme.cursor("▸ ") : "  ";
      const name = selected ? theme.selected(item.acct.name) : item.acct.name;
      const lockStr = item.locked ? theme.locked(" locked") : theme.unlocked(" unlocked");
      lines.push(`${marker}${name}${lockStr}`);
      if (item.balances) {
        const parts: string[] = [];
        if (item.balances.algo > 0n) parts.push(`${formatAlgoCompact(item.balances.algo)}`);
        if (item.balances.usdc > 0n) parts.push(`${formatCompact(item.balances.usdc, decimals.usdc)} USDC`);
        if (item.balances.akta > 0n) parts.push(`${formatCompact(item.balances.akta, decimals.akta)} AKTA`);
        if (item.balances.bones > 0n) parts.push(`${formatCompact(item.balances.bones, decimals.bones)} BONES`);
        if (parts.length > 0) lines.push(`    ${theme.label(parts.join(" · "))}`);
      }
      lines.push(`    ${theme.label(`${item.pluginCount} plugin${item.pluginCount !== 1 ? "s" : ""}`)}`);
    }
  }
  return { lines, selectedLine };
}
