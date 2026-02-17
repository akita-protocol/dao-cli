#!/usr/bin/env bun
import { Command } from "commander";
import type { AkitaNetwork } from "@akta/sdk";
import { createDAO } from "./sdk";
import { infoCommand } from "./commands/info";
import { stateCommand } from "./commands/state";
import { listProposals, getProposal } from "./commands/proposals";
import {
  walletInfo,
  walletPlugins,
  walletNamedPlugins,
  walletEscrows,
  walletAllowances,
  walletExecutions,
  walletBalance,
} from "./commands/wallet";
import { startTUI } from "./tui/app";

const program = new Command();

program
  .name("akita-dao")
  .description("Read-only CLI for querying Akita DAO state on Algorand")
  .version("0.1.0")
  .option("-n, --network <network>", "Network to connect to", "mainnet")
  .option("-j, --json", "Output as JSON", false);

function getOpts(): { network: AkitaNetwork; json: boolean } {
  const opts = program.opts();
  const network = opts.network as AkitaNetwork;
  if (!["mainnet", "testnet", "localnet"].includes(network)) {
    console.error(`Invalid network: ${network}. Use mainnet, testnet, or localnet.`);
    process.exit(1);
  }
  return { network, json: opts.json };
}

// tui
program
  .command("tui")
  .description("Launch interactive full-screen TUI")
  .action(async () => {
    const { network } = getOpts();
    await startTUI(network);
  });

// info
program
  .command("info")
  .description("Quick DAO dashboard (app IDs, assets, version)")
  .action(async () => {
    const { network, json } = getOpts();
    const dao = createDAO(network);
    await infoCommand(dao, network, json);
  });

// state
program
  .command("state")
  .description("Full decoded global state")
  .action(async () => {
    const { network, json } = getOpts();
    const dao = createDAO(network);
    await stateCommand(dao, network, json);
  });

// proposals
const proposals = program
  .command("proposals")
  .description("Proposal commands");

proposals
  .command("list")
  .description("List proposals")
  .option("-s, --status <status>", "Filter by status: all, active, past", "all")
  .option("-l, --limit <limit>", "Max proposals to show", "20")
  .action(async (opts) => {
    const { network, json } = getOpts();
    const dao = createDAO(network);
    await listProposals(dao, json, opts.status, parseInt(opts.limit, 10));
  });

proposals
  .command("get <id>")
  .description("Get detailed proposal view")
  .action(async (id: string) => {
    const { network, json } = getOpts();
    const dao = createDAO(network);
    await getProposal(dao, BigInt(id), json);
  });

// wallet
const walletCmd = program
  .command("wallet")
  .description("Wallet commands");

walletCmd
  .command("info")
  .description("Wallet global state")
  .action(async () => {
    const { network, json } = getOpts();
    const dao = createDAO(network);
    await walletInfo(dao, network, json);
  });

walletCmd
  .command("plugins")
  .description("All installed plugins")
  .action(async () => {
    const { network, json } = getOpts();
    const dao = createDAO(network);
    await walletPlugins(dao, network, json);
  });

walletCmd
  .command("named-plugins")
  .description("Named plugin aliases")
  .action(async () => {
    const { network, json } = getOpts();
    const dao = createDAO(network);
    await walletNamedPlugins(dao, json);
  });

walletCmd
  .command("escrows")
  .description("All escrows")
  .action(async () => {
    const { network, json } = getOpts();
    const dao = createDAO(network);
    await walletEscrows(dao, json);
  });

walletCmd
  .command("allowances")
  .description("All spending allowances")
  .action(async () => {
    const { network, json } = getOpts();
    const dao = createDAO(network);
    await walletAllowances(dao, json);
  });

walletCmd
  .command("executions")
  .description("All execution keys")
  .action(async () => {
    const { network, json } = getOpts();
    const dao = createDAO(network);
    await walletExecutions(dao, json);
  });

walletCmd
  .command("balance [assets...]")
  .description("Check balances (default: ALGO, AKTA, BONES)")
  .option("-e, --escrow <name>", "Check escrow balance instead of main wallet")
  .action(async (assets: string[], opts: { escrow?: string }) => {
    const { network, json } = getOpts();
    const dao = createDAO(network);
    await walletBalance(dao, network, json, assets, opts.escrow);
  });

// Hoist global flags (e.g. -n testnet) before the subcommand so Commander parses them
const GLOBAL_VALUE_FLAGS = new Set(["-n", "--network"]);
const GLOBAL_BOOL_FLAGS = new Set(["-j", "--json"]);

function hoistGlobalFlags(args: string[]): string[] {
  const flags: string[] = [];
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (GLOBAL_VALUE_FLAGS.has(args[i]) && i + 1 < args.length) {
      flags.push(args[i], args[i + 1]);
      i++;
    } else if (GLOBAL_BOOL_FLAGS.has(args[i])) {
      flags.push(args[i]);
    } else {
      rest.push(args[i]);
    }
  }
  return [...flags, ...rest];
}

const userArgs = hoistGlobalFlags(process.argv.slice(2));
const hasCommand = userArgs.some((arg) => !arg.startsWith("-"));

if (!hasCommand && process.stdout.isTTY) {
  program.parse([...process.argv.slice(0, 2), ...userArgs, "tui"]);
} else {
  program.parse([...process.argv.slice(0, 2), ...userArgs]);
}
