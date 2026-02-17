import type { AkitaDaoSDK } from "@akta/sdk";
import { getNetworkAppIds, type AkitaNetwork } from "@akta/sdk";
import algosdk from "algosdk";
import { printJson, printColumns, header, printKV, printPluginCard } from "../output";
import {
  truncateAddress,
  formatBigInt,
  formatTimestamp,
  isZeroAddress,
  camelToLabel,
  resolveAppName,
  getAppName,
  delegationTypeLabel,
  formatDuration,
  colorBool,
} from "../formatting";

// Fields to hide from wallet info display
const HIDDEN_WALLET_FIELDS = new Set([
  "spendingAddress",
  "currentPlugin",
  "rekeyIndex",
]);

async function getWallet(dao: AkitaDaoSDK) {
  return await dao.getWallet();
}

export async function walletInfo(dao: AkitaDaoSDK, network: AkitaNetwork, json: boolean): Promise<void> {
  const wallet = await getWallet(dao);
  const state = await wallet.getGlobalState();

  if (json) return printJson(state);

  header("Wallet Info");
  const pairs: [string, unknown][] = [];

  for (const [k, v] of Object.entries(state)) {
    if (HIDDEN_WALLET_FIELDS.has(k)) continue;

    // Hide referrer if zero address
    if (k === "referrer" && typeof v === "string" && isZeroAddress(v)) continue;

    const label = camelToLabel(k);

    if (v === undefined || v === null) {
      pairs.push([label, "not set"]);
    } else if (v instanceof Uint8Array) {
      const hex = Buffer.from(v).toString("hex");
      pairs.push([label, hex || "not set"]);
    } else if (typeof v === "bigint") {
      // Show app names for known app ID fields
      if (k === "akitaDao" || k === "escrowFactory" || k === "factoryApp" || k === "revocation") {
        pairs.push([label, v > 0n ? resolveAppName(v, network) : "not set"]);
      } else if (k === "lastUserInteraction" || k === "lastChange") {
        pairs.push([label, formatTimestamp(v)]);
      } else {
        pairs.push([label, v.toString()]);
      }
    } else if (typeof v === "string") {
      pairs.push([label, v || "not set"]);
    } else if (typeof v === "object" && v !== null) {
      // PluginKey or other structs - skip complex objects
      continue;
    } else {
      pairs.push([label, String(v)]);
    }
  }

  printKV(pairs);
}

export async function walletPlugins(dao: AkitaDaoSDK, network: AkitaNetwork, json: boolean): Promise<void> {
  const wallet = await getWallet(dao);
  const plugins = await wallet.getPlugins();

  const entries = Array.from(plugins.entries());

  if (json) {
    const arr = entries.map(([key, info]) => ({ key, ...info }));
    return printJson(arr);
  }

  header("Installed Plugins");

  if (entries.length === 0) {
    console.log("  No plugins installed.");
    return;
  }

  for (const [key, info] of entries) {
    const { pluginId, caller, escrow } = parsePluginKey(key);

    const pluginName = pluginId ? getAppName(pluginId, network) : undefined;
    const pluginLabel = pluginName
      ? `${pluginName} (${pluginId})`
      : pluginId?.toString() ?? key;

    const pairs: [string, string][] = [
      ["Caller", caller === "" ? "(global)" : truncateAddress(caller)],
    ];
    if (escrow) pairs.push(["Escrow", escrow]);
    pairs.push(
      ["Admin", colorBool(info.admin)],
      ["Delegation", delegationTypeLabel(info.delegationType)],
      ["Cover Fees", colorBool(info.coverFees)],
      ["Can Reclaim", colorBool(info.canReclaim)],
      ["Use Exec Key", colorBool(info.useExecutionKey)],
      ["Use Rounds", colorBool(info.useRounds)],
    );
    if (info.cooldown > 0n) {
      pairs.push(["Cooldown", formatDuration(info.cooldown)]);
    }
    if (info.lastCalled > 0n) {
      pairs.push(["Last Called", formatTimestamp(info.lastCalled)]);
    }
    if (info.start > 0n) {
      pairs.push(["Start", formatTimestamp(info.start)]);
    }
    if (info.lastValid < BigInt("18446744073709551615")) {
      pairs.push(["Last Valid", info.useRounds ? info.lastValid.toString() : formatTimestamp(info.lastValid)]);
    }

    // Method restrictions as hex selectors
    const methods = info.methods.length > 0
      ? info.methods.map((m) => Buffer.from(m.name).toString("hex"))
      : undefined;

    printPluginCard({ name: pluginLabel, pairs, methods });
  }
}

/** Parse the concatenated plugin key string back into its components */
function parsePluginKey(key: string): { pluginId: bigint | null; caller: string; escrow: string } {
  let digitEnd = 0;
  while (digitEnd < key.length && key[digitEnd] >= "0" && key[digitEnd] <= "9") {
    digitEnd++;
  }

  if (digitEnd === 0) {
    return { pluginId: null, caller: "", escrow: key };
  }

  const pluginId = BigInt(key.slice(0, digitEnd));
  const rest = key.slice(digitEnd);

  if (rest.length >= 58) {
    return {
      pluginId,
      caller: rest.slice(0, 58),
      escrow: rest.slice(58),
    };
  }

  return { pluginId, caller: rest, escrow: "" };
}

export async function walletNamedPlugins(dao: AkitaDaoSDK, json: boolean): Promise<void> {
  const wallet = await getWallet(dao);
  const named = await wallet.getNamedPlugins();

  if (json) {
    const obj = Object.fromEntries(Array.from(named.entries()).map(([name, key]) => [name, key]));
    return printJson(obj);
  }

  header("Named Plugins");

  const entries = Array.from(named.entries());
  if (entries.length === 0) {
    console.log("  No named plugins.");
    return;
  }

  const rows = entries.map(([name, key]) => [
    name,
    key.plugin.toString(),
    truncateAddress(key.caller),
    key.escrow || "(default)",
  ]);
  printColumns(["Name", "Plugin App", "Caller", "Escrow"], rows);
}

export async function walletEscrows(dao: AkitaDaoSDK, json: boolean): Promise<void> {
  const wallet = await getWallet(dao);
  const escrows = await wallet.getEscrows();

  if (json) {
    const obj = Object.fromEntries(escrows.entries());
    return printJson(obj);
  }

  header("Escrows");

  const entries = Array.from(escrows.entries());
  if (entries.length === 0) {
    console.log("  No escrows.");
    return;
  }

  const rows = entries.map(([name, info]) => [
    name,
    info.id.toString(),
    String(info.locked),
  ]);
  printColumns(["Name", "App ID", "Locked"], rows);
}

export async function walletAllowances(dao: AkitaDaoSDK, json: boolean): Promise<void> {
  const wallet = await getWallet(dao);
  const allowances = await wallet.getAllowances();

  const entries = Array.from(allowances.entries());

  if (json) {
    const arr = entries.map(([key, info]) => ({ key, ...info }));
    return printJson(arr);
  }

  header("Allowances");

  if (entries.length === 0) {
    console.log("  No allowances.");
    return;
  }

  const rows = entries.map(([key, info]) => {
    let details: string;
    if (info.type === "flat") {
      details = `amount: ${formatBigInt(info.amount)}, spent: ${formatBigInt(info.spent)}`;
    } else if (info.type === "window") {
      details = `amount: ${formatBigInt(info.amount)}, spent: ${formatBigInt(info.spent)}, interval: ${formatDuration(info.interval)}`;
    } else {
      details = `rate: ${formatBigInt(info.rate)}, max: ${formatBigInt(info.max)}, interval: ${formatDuration(info.interval)}`;
    }
    return [key, info.type, details];
  });
  printColumns(["Key", "Type", "Details"], rows);
}

export async function walletExecutions(dao: AkitaDaoSDK, json: boolean): Promise<void> {
  const wallet = await getWallet(dao);
  const executions = await wallet.getExecutions();

  if (json) {
    const arr = Array.from(executions.entries()).map(([key, info]) => ({
      key: Buffer.from(key).toString("hex"),
      info,
    }));
    return printJson(arr);
  }

  header("Execution Keys");

  const entries = Array.from(executions.entries());
  if (entries.length === 0) {
    console.log("  No execution keys.");
    return;
  }

  const rows = entries.map(([key, info]) => [
    Buffer.from(key).toString("hex").slice(0, 16) + "...",
    info.firstValid.toString(),
    info.lastValid.toString(),
  ]);
  printColumns(["Lease (hex)", "First Valid", "Last Valid"], rows);
}

export async function walletBalance(
  dao: AkitaDaoSDK,
  network: AkitaNetwork,
  json: boolean,
  assetArgs: string[],
  escrowName?: string
): Promise<void> {
  const wallet = await getWallet(dao);
  const ids = getNetworkAppIds(network);

  // Determine which address to check
  let address: string;
  let label: string;

  if (escrowName) {
    const escrows = await wallet.getEscrows();
    const escrow = escrows.get(escrowName);
    if (!escrow) {
      console.error(`Escrow "${escrowName}" not found. Use 'akita wallet escrows' to see available escrows.`);
      return;
    }
    address = algosdk.getApplicationAddress(escrow.id).toString();
    label = `Escrow: ${escrowName}`;
  } else {
    address = algosdk.getApplicationAddress(wallet.appId).toString();
    label = "Wallet";
  }

  let assets: bigint[];
  if (assetArgs.length > 0) {
    assets = assetArgs.map((a) => BigInt(a));
  } else {
    // Default: ALGO (0), AKTA, BONES
    assets = [0n, ids.akta, ids.bones];
  }

  const assetLabels = assets.map((a) => {
    if (a === 0n) return "ALGO";
    if (a === ids.akta) return "AKTA";
    if (a === ids.bones) return "BONES";
    if (a === ids.usdc) return "USDC";
    return a.toString();
  });

  // Fetch balances via algod account info
  let balances: bigint[];
  try {
    const accountInfo = await dao.algorand.account.getInformation(address);
    balances = assets.map((assetId) => {
      if (assetId === 0n) {
        return BigInt(accountInfo.amount);
      }
      const holding = accountInfo.assets?.find(
        (a: { assetId: bigint }) => a.assetId === assetId
      );
      return holding ? holding.amount : 0n;
    });
  } catch (e: any) {
    console.error(`Failed to fetch balances: ${e.message ?? e}`);
    return;
  }

  if (json) {
    const data = assets.map((asset, i) => ({
      asset,
      label: assetLabels[i],
      balance: balances[i],
    }));
    return printJson(data);
  }

  header(`${label} Balances`);
  const rows = assets.map((asset, i) => {
    let formatted: string;
    if (asset === 0n) {
      // ALGO: 6 decimals
      const whole = balances[i] / 1_000_000n;
      const frac = balances[i] % 1_000_000n;
      formatted = frac === 0n
        ? whole.toLocaleString()
        : `${whole.toLocaleString()}.${frac.toString().padStart(6, "0").replace(/0+$/, "")}`;
    } else {
      formatted = formatBigInt(balances[i]);
    }
    return [assetLabels[i], asset.toString(), formatted];
  });
  printColumns(["Asset", "ID", "Balance"], rows);
}
