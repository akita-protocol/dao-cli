import type { AkitaNetwork, NetworkAppIds } from "@akta/sdk";
import { getNetworkAppIds } from "@akta/sdk";
import { ABIMethod, ABIType } from "algosdk";
import theme from "./theme";

const EMPTY_CID_STR = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
const ZERO_ADDRESS = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAY5HFKQ";

export function truncateAddress(addr: string, chars: number = 6): string {
  if (addr.length <= chars * 2 + 3) return addr;
  return `${addr.slice(0, chars)}...${addr.slice(-chars)}`;
}

export function formatTimestamp(ts: bigint): string {
  if (ts === 0n) return "-";
  return new Date(Number(ts) * 1000).toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC");
}

export function formatCID(cid: Uint8Array | string): string {
  const str = typeof cid === "string" ? cid : Buffer.from(cid).toString();
  return str === EMPTY_CID_STR ? "(none)" : str;
}

export function proposalStatusLabel(status: number): string {
  switch (status) {
    case 0: return "Draft";
    case 10: return "Invalid";
    case 20: return "Voting";
    case 30: return "Rejected";
    case 40: return "Approved";
    case 50: return "Executed";
    default: return `Unknown(${status})`;
  }
}

export function formatMicroAlgo(microAlgos: bigint): string {
  const whole = microAlgos / 1_000_000n;
  const frac = microAlgos % 1_000_000n;
  if (frac === 0n) return `${whole} ALGO`;
  return `${whole}.${frac.toString().padStart(6, "0").replace(/0+$/, "")} ALGO`;
}

export function proposalActionLabel(type: number): string {
  switch (type) {
    case 10: return "Upgrade App";
    case 20: return "Add Plugin";
    case 21: return "Add Named Plugin";
    case 30: return "Execute Plugin";
    case 31: return "Remove Execute Plugin";
    case 40: return "Remove Plugin";
    case 41: return "Remove Named Plugin";
    case 50: return "Add Allowances";
    case 60: return "Remove Allowances";
    case 70: return "New Escrow";
    case 71: return "Toggle Escrow Lock";
    case 80: return "Update Fields";
    default: return `Unknown(${type})`;
  }
}

export function formatBigInt(val: bigint): string {
  return val.toLocaleString();
}

/** Compact number: 1K, 1.5M, 2.3B, etc. with colored suffixes.
 *  Pass `decimals` to convert from smallest unit (e.g. 6 for microAlgos). */
export function formatCompact(val: bigint, decimals = 0): string {
  const n = decimals > 0 ? Number(val) / 10 ** decimals : Number(val);

  if (n < 1_000) {
    if (Number.isInteger(n)) return n.toString();
    if (n < 1) return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    if (n < 10) return n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    if (n < 100) return n.toFixed(1).replace(/0+$/, "").replace(/\.$/, "");
    return Math.round(n).toString();
  }

  const tiers: [number, string, (s: string) => string][] = [
    [1e3, "K", theme.suffixK],
    [1e6, "M", theme.suffixM],
    [1e9, "B", theme.suffixB],
    [1e12, "T", theme.suffixT],
  ];

  // Walk up tiers; promote if rounding would produce "1000X"
  for (let i = 0; i < tiers.length; i++) {
    const scaled = n / tiers[i][0];
    if (scaled < 1000 || i === tiers.length - 1) {
      const rounded = roundForTier(scaled);
      if (rounded >= 1000 && i < tiers.length - 1) continue; // promote
      return trimSuffix(scaled, tiers[i][1], tiers[i][2]);
    }
  }
  return n.toString();
}

function roundForTier(n: number): number {
  if (n >= 100) return Math.round(n);
  if (n >= 10) return Math.round(n * 10) / 10;
  return Math.round(n * 100) / 100;
}

function trimSuffix(n: number, suffix: string, color: (s: string) => string): string {
  let numStr: string;
  if (n >= 100) numStr = `${Math.round(n)}`;
  else if (n >= 10) numStr = `${Math.round(n * 10) / 10}`.replace(/\.0$/, "");
  else numStr = `${Math.round(n * 100) / 100}`.replace(/\.00$/, "").replace(/(\.\d)0$/, "$1");
  return numStr + color(suffix);
}

/** Format basis points (1000 = 1%) as percentage string */
export function formatBasisPoints(bp: bigint): string {
  const pct = Number(bp) / 1000;
  if (pct === Math.floor(pct)) return `${pct}%`;
  return `${pct}%`;
}

/** Format duration in seconds to human-readable string */
export function formatDuration(seconds: bigint): string {
  const s = Number(seconds);
  if (s === 0) return "0s";

  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  if (secs > 0 && days === 0) parts.push(`${secs}s`);

  return parts.join(" ");
}

/** DAO state enum (0=Inactive, 1=Active, etc.) */
export function daoStateLabel(state: number): string {
  switch (state) {
    case 0: return `Inactive (${state})`;
    case 1: return `Active (${state})`;
    case 2: return `Paused (${state})`;
    default: return `Unknown (${state})`;
  }
}

/** Delegation type enum */
export function delegationTypeLabel(type: bigint | number): string {
  const n = Number(type);
  switch (n) {
    case 0: return `None (${n})`;
    case 1: return `Caller (${n})`;
    case 2: return `Anyone (${n})`;
    default: return `Unknown (${n})`;
  }
}

/** Check if address is the zero address */
export function isZeroAddress(addr: string): boolean {
  return addr === ZERO_ADDRESS;
}

/** Camel case key to readable label */
export function camelToLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// --- App ID reverse lookup ---

let _appNameCache: Map<string, Map<bigint, string>> | null = null;

function getAppNameMap(network: AkitaNetwork): Map<bigint, string> {
  if (!_appNameCache) _appNameCache = new Map();
  if (_appNameCache.has(network)) return _appNameCache.get(network)!;

  const ids = getNetworkAppIds(network);
  const map = new Map<bigint, string>();

  // Human-readable names for known app IDs
  const labels: Record<keyof NetworkAppIds, string> = {
    dao: "DAO",
    wallet: "Wallet",
    escrowFactory: "Escrow Factory",
    walletFactory: "Wallet Factory",
    subscriptions: "Subscriptions",
    stakingPoolFactory: "Staking Pool Factory",
    staking: "Staking",
    rewards: "Rewards",
    social: "Social",
    socialGraph: "Social Graph",
    socialImpact: "Social Impact",
    socialModeration: "Social Moderation",
    auctionFactory: "Auction Factory",
    marketplace: "Marketplace",
    raffleFactory: "Raffle Factory",
    pollFactory: "Poll Factory",
    prizeBoxFactory: "Prize Box Factory",
    revenueManagerPlugin: "Revenue Manager Plugin",
    updatePlugin: "Update Plugin",
    optinPlugin: "Opt-In Plugin",
    asaMintPlugin: "ASA Mint Plugin",
    payPlugin: "Pay Plugin",
    hyperSwapPlugin: "Hyper Swap Plugin",
    subscriptionsPlugin: "Subscriptions Plugin",
    auctionPlugin: "Auction Plugin",
    daoPlugin: "DAO Plugin",
    dualStakePlugin: "Dual Stake Plugin",
    gatePlugin: "Gate Plugin",
    marketplacePlugin: "Marketplace Plugin",
    nfdPlugin: "NFD Plugin",
    paySiloPlugin: "Pay Silo Plugin",
    paySiloFactoryPlugin: "Pay Silo Factory Plugin",
    pollPlugin: "Poll Plugin",
    rafflePlugin: "Raffle Plugin",
    rewardsPlugin: "Rewards Plugin",
    socialPlugin: "Social Plugin",
    stakingPlugin: "Staking Plugin",
    stakingPoolPlugin: "Staking Pool Plugin",
    gate: "Gate",
    hyperSwap: "Hyper Swap",
    metaMerkles: "Meta Merkles",
    akitaReferrerGate: "Akita Referrer Gate",
    assetGate: "Asset Gate",
    merkleAddressGate: "Merkle Address Gate",
    merkleAssetGate: "Merkle Asset Gate",
    nfdGate: "NFD Gate",
    nfdRootGate: "NFD Root Gate",
    pollGate: "Poll Gate",
    socialActivityGate: "Social Activity Gate",
    socialFollowerCountGate: "Social Follower Count Gate",
    socialFollowerIndexGate: "Social Follower Index Gate",
    socialImpactGate: "Social Impact Gate",
    socialModeratorGate: "Social Moderator Gate",
    stakingAmountGate: "Staking Amount Gate",
    stakingPowerGate: "Staking Power Gate",
    subscriptionGate: "Subscription Gate",
    subscriptionStreakGate: "Subscription Streak Gate",
    akta: "AKTA",
    bones: "BONES",
    usdc: "USDC",
    vrfBeacon: "VRF Beacon",
    nfdRegistry: "NFD Registry",
    assetInbox: "Asset Inbox",
    akitaNfd: "Akita NFD",
  };

  for (const [key, label] of Object.entries(labels)) {
    const id = ids[key as keyof NetworkAppIds];
    if (id > 0n) map.set(id, label);
  }

  _appNameCache.set(network, map);
  return map;
}

/** Resolve an app ID to its human-readable name, or fall back to the raw ID */
export function resolveAppName(appId: bigint, network: AkitaNetwork): string {
  const map = getAppNameMap(network);
  const name = map.get(appId);
  return name ? `${name} (${appId})` : appId.toString();
}

/** Resolve an app ID to just its short name, or undefined */
export function getAppName(appId: bigint, network: AkitaNetwork): string | undefined {
  return getAppNameMap(network).get(appId);
}

// ── Color helpers ────────────────────────────────────────────────

/** Color-code proposal status */
export function colorStatus(status: string): string {
  switch (status) {
    case "Approved":
    case "Executed":
      return theme.statusApproved(status);
    case "Voting":
      return theme.statusVoting(status);
    case "Draft":
      return theme.statusDraft(status);
    case "Rejected":
    case "Invalid":
      return theme.statusRejected(status);
    default:
      return status;
  }
}

/** Color-code DAO state */
export function colorState(state: string): string {
  if (state.startsWith("Active")) return theme.stateActive(state);
  if (state.startsWith("Inactive")) return theme.stateInactive(state);
  if (state.startsWith("Paused")) return theme.statePaused(state);
  return state;
}

/** Color-code boolean values */
export function colorBool(val: boolean): string {
  return val ? theme.boolTrue(String(val)) : theme.boolFalse(String(val));
}

// ── Plugin key parsing ──────────────────────────────────────────

export function parsePluginKey(key: string): { pluginId: bigint | null; caller: string; escrow: string } {
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
    return { pluginId, caller: rest.slice(0, 58), escrow: rest.slice(58) };
  }

  return { pluginId, caller: rest, escrow: "" };
}

// ── Method selector decoding ────────────────────────────────────

/** All known ABI method signatures across the 21 SDK wallet plugins */
const PLUGIN_SIGNATURES: string[] = [
  "accept(uint64,bool,uint64,address,byte[32][])void",
  "add(uint64,bool,uint64,uint64,byte[][])void",
  "addAction(uint64,bool,uint64,byte[36])void",
  "addModerator(uint64,bool,address)void",
  "addReward(uint64,bool,uint64,(uint64,uint8,uint64,uint64,uint64,uint64,uint64,uint64,uint64[],(uint64,uint64,uint64),uint64,uint8,uint64,uint64,uint64,uint64),uint64)void",
  "ban(uint64,bool,address,uint64)void",
  "bid(uint64,bool,uint64,uint64,byte[][],address)void",
  "block(uint64,bool,address)void",
  "cancel(uint64,bool,uint64)void",
  "cancelSale(uint64,bool,uint64)void",
  "changePrice(uint64,bool,uint64,uint64)void",
  "checkTipMbrRequirements(uint64,address,uint64)(uint8,uint64)",
  "claimPrize(uint64,bool,uint64)void",
  "claimRafflePrize(uint64,bool,uint64)void",
  "claimRewards(uint64,bool,(uint64,uint64)[])void",
  "cleanupFill(uint64,bool,uint64,address,address,uint64,uint64,uint64,uint64)void",
  "clearWeightsBoxes(uint64,bool,uint64,uint64)void",
  "closeOutAlgo(uint64,bool,address,uint64,address)void",
  "closeOutAsset(uint64,bool,uint64,address,address)void",
  "contractLock(uint64,bool,uint64,bool)void",
  "createApplication(string,uint64,uint64)void",
  "createAsaUserAllocations(uint64,bool,uint64,uint64,(address,uint64)[],uint64)void",
  "createDisbursement(uint64,bool,string,uint64,uint64,string)uint64",
  "createHeartbeat(uint64,bool,address,uint64)void",
  "createUserAllocations(uint64,bool,uint64,(address,uint64)[],uint64)void",
  "deleteApplication(uint64,bool,uint64)void",
  "deleteAuctionApp(uint64,bool,uint64)void",
  "deleteBoxedContract(uint64,bool)void",
  "deleteFields(uint64,bool,uint64,byte[][])void",
  "deletePool(uint64,bool,uint64)void",
  "deleteRaffleApplication(uint64,bool,uint64)void",
  "deleteReaction(uint64,bool,byte[32],uint64)void",
  "delist(uint64,bool,uint64)void",
  "disburse(uint64,bool,uint64,address,uint64,address,uint64,uint64,uint64,uint64)void",
  "editDisbursement(uint64,bool,uint64,string,uint64,uint64,string)void",
  "editPost(uint64,bool,byte[36],byte[32])void",
  "editProposal(uint64,bool,uint64,byte[36],(uint8,byte[])[])void",
  "editReply(uint64,bool,byte[36],byte[32])void",
  "editVote(uint64,bool,byte[32],bool)void",
  "enter(uint64,bool,uint64,(uint64,uint64,byte[32][])[],byte[][])void",
  "enter(uint64,bool,uint64,uint64,address,byte[][])void",
  "escrow(uint64,bool,uint64,address,address,uint64,uint64,uint64,uint64,byte[32][])void",
  "executeProposal(uint64,bool,uint64)void",
  "fill(uint64,bool,uint64,address,address,uint64,uint64,uint64,uint64,byte[32][])void",
  "finalizeDisbursement(uint64,bool,uint64)void",
  "finalizeEscrowDisbursement(uint64,bool,uint64[])void",
  "finalizePool(uint64,bool,uint64,uint64,uint64,uint64)void",
  "finalizeProposal(uint64,bool,uint64)void",
  "findWinner(uint64,bool,uint64,uint64)void",
  "flagPost(uint64,bool,byte[32])void",
  "follow(uint64,bool,address)void",
  "gatedEditReply(uint64,bool,byte[36],byte[32],byte[][])void",
  "gatedFill(uint64,bool,uint64,address,address,uint64,uint64,uint64,uint64,byte[32][],byte[][])void",
  "gatedFollow(uint64,bool,address,byte[][])void",
  "gatedReact(uint64,bool,byte[],uint8,uint64,byte[][])void",
  "gatedReply(uint64,bool,uint64,byte[24],byte[36],byte[],uint8,uint64,byte[][],bool,uint64)void",
  "initBoxedContract(uint64,string,uint64)void",
  "initDescription(uint64,uint64)void",
  "initMeta(uint64,bool,address,bool,uint64,uint64,uint64)uint64",
  "initPool(uint64,bool,uint64)void",
  "list(uint64,bool,uint64,uint64,uint64,uint64,uint64,address,uint64,address,string,byte[32][])uint64",
  "loadBoxedContract(uint64,uint64,byte[])void",
  "loadDescription(uint64,uint64,byte[])void",
  "mint(uint64,bool,(string,string,uint64,uint64,address,address,address,address,bool,string)[],pay)uint64[]",
  "mint(uint64,bool,address)uint64",
  "mint(uint64,bool,uint64,uint64)void",
  "new(uint64,bool,uint64,uint64,string,byte[32][],uint64,uint64,uint64,uint64,uint64,uint64,uint64,address,uint64)uint64",
  "newPool(uint64,bool,string,uint8,address,(address,string),uint64,bool,uint64,uint64)void",
  "newPrizeBoxRaffle(uint64,bool,uint64,uint64,uint64,uint64,uint64,uint64,uint64,address,uint64)uint64",
  "newProposal(uint64,bool,byte[36],(uint8,byte[])[])uint64",
  "newRaffle(uint64,bool,uint64,uint64,uint64,uint64,uint64,uint64,uint64,uint64,address,string,byte[32][],uint64)uint64",
  "newReceiveEscrow(uint64,bool,string,address,bool,bool,((uint64,string),uint8,uint64)[])void",
  "newReceiveEscrowWithRef(uint64,bool,string,address,bool,bool,(uint64,byte[]))void",
  "newService(uint64,bool,uint64,uint64,uint64,uint64,uint64,string,byte[36],uint8,byte[3])uint64",
  "offer(uint64,bool,byte[32],uint64,byte[32],uint64,uint64)void",
  "offerForSale(uint64,bool,uint64,uint64,address)void",
  "optIn(uint64,bool,uint64)void",
  "optIn(uint64,bool,uint64[],pay)void",
  "pauseService(uint64,bool,uint64)void",
  "pay(uint64,bool,(address,uint64,uint64)[])void",
  "pay(uint64,bool,(uint64,uint64)[])void",
  "post(uint64,bool,uint64,byte[24],byte[36],uint64,bool,uint64)void",
  "postOffer(uint64,bool,uint64,uint64,string)void",
  "processEscrowAllocation(uint64,bool,uint64[])void",
  "proxyPay(uint64,bool,uint64,address,uint64,uint64)void",
  "purchase(uint64,bool,uint64,address,byte[][])void",
  "purchase(uint64,bool,uint64)void",
  "raffle(uint64,bool,uint64)void",
  "react(uint64,bool,byte[],uint8,uint64)void",
  "reclaimRewards(uint64,bool,uint64,(address,uint64)[])void",
  "redeem(uint64,bool,uint64)void",
  "refundBid(uint64,bool,uint64,uint64)void",
  "register(uint64,bool,(uint64,uint64,uint8)[],byte[][])void",
  "removeAction(uint64,bool,uint64)void",
  "removeModerator(uint64,bool,address)void",
  "renew(uint64,bool,uint64,uint64)void",
  "reply(uint64,bool,uint64,byte[24],byte[36],byte[],uint8,uint64,bool,uint64)void",
  "segmentLock(uint64,bool,uint64,bool,uint64)void",
  "setClearProgram(uint64,bool,byte[])void",
  "setPasses(uint64,bool,uint64,address[])void",
  "setPrimaryAddress(uint64,bool,uint64,string,address)void",
  "setup(uint64,bool,string)void",
  "shutdownService(uint64,bool,uint64)void",
  "softCheck(uint64,bool,address,uint64)void",
  "stake(uint64,bool,uint64,uint8,uint64,uint64,bool)void",
  "startEscrowDisbursement(uint64,bool)void",
  "streakCheck(uint64,bool,(address,uint64))void",
  "submitProposal(uint64,bool,uint64)void",
  "subscribe(uint64,bool,uint64,address,uint64,uint64,uint64,byte[][])void",
  "triggerPayment(uint64,bool,address,uint64,byte[][])void",
  "unban(uint64,bool,address)void",
  "unblock(uint64,bool,address)void",
  "unflagPost(uint64,bool,byte[32])void",
  "unfollow(uint64,bool,address)void",
  "updateAkitaDAO(uint64)void",
  "updateAkitaDaoAppIDForApp(uint64,bool,uint64,uint64)void",
  "updateAkitaDaoEscrowForApp(uint64,bool,uint64,uint64)void",
  "updateApp(uint64,bool,uint64)void",
  "updateFactoryChildContract(uint64,bool,uint64)void",
  "updateFields(uint64,bool,uint64,byte[][])void",
  "updateHash(uint64,bool,uint64,byte[])void",
  "updateMeta(uint64,bool,uint64,uint64,uint64,uint64,uint64,uint64)void",
  "updateRevocation(uint64,bool,uint64)void",
  "vaultOptIn(uint64,bool,uint64,uint64[])void",
  "vaultOptInLock(uint64,bool,uint64,bool)void",
  "vaultSend(uint64,bool,uint64,uint64,address,string,uint64,uint64[])void",
  "vote(uint64,bool,byte[],uint8,bool)void",
  "voteProposal(uint64,bool,uint64,uint8)void",
  "withdraw(uint64,bool,uint64,address,address,uint64,uint64,uint64,uint64,byte[32][])void",
  "withdraw(uint64,bool,uint64,uint8)void",
];

let _selectorMap: Map<string, string> | null = null;

function getSelectorMap(): Map<string, string> {
  if (_selectorMap) return _selectorMap;
  _selectorMap = new Map();
  for (const sig of PLUGIN_SIGNATURES) {
    try {
      const method = ABIMethod.fromSignature(sig);
      const hex = Buffer.from(method.getSelector()).toString("hex");
      // First entry wins (preserves canonical name for duplicate selectors)
      if (!_selectorMap.has(hex)) {
        _selectorMap.set(hex, method.name);
      }
    } catch {
      // Skip invalid signatures
    }
  }
  return _selectorMap;
}

/** Resolve a 4-byte method selector to a human-readable name, or hex fallback */
export function resolveMethodSelector(selector: Uint8Array): string {
  const hex = Buffer.from(selector).toString("hex");
  const name = getSelectorMap().get(hex);
  return name ?? hex;
}

// ── UpdateFields decoding ────────────────────────────────────────

type FieldFmt = "raw" | "appId" | "microAlgo" | "basisPoints" | "duration";

interface FieldDef {
  name: string;
  fmt: FieldFmt;
}

const PS_FIELDS: FieldDef[] = [
  { name: "Fee", fmt: "microAlgo" },
  { name: "Power", fmt: "raw" },
  { name: "Duration", fmt: "duration" },
  { name: "Participation", fmt: "basisPoints" },
  { name: "Approval", fmt: "basisPoints" },
];

const FIELD_SCHEMAS: Record<string, { label: string; fields: FieldDef[] }> = {
  proposal_action_limit: { label: "Proposal Action Limit", fields: [{ name: "Limit", fmt: "raw" }] },
  min_rewards_impact: { label: "Min Rewards Impact", fields: [{ name: "Impact", fmt: "raw" }] },

  aal: { label: "Akita App List", fields: [
    { name: "Staking", fmt: "appId" }, { name: "Rewards", fmt: "appId" },
    { name: "Pool", fmt: "appId" }, { name: "Prize Box", fmt: "appId" },
    { name: "Subscriptions", fmt: "appId" }, { name: "Gate", fmt: "appId" },
    { name: "Auction", fmt: "appId" }, { name: "Hyper Swap", fmt: "appId" },
    { name: "Raffle", fmt: "appId" }, { name: "Meta Merkles", fmt: "appId" },
    { name: "Marketplace", fmt: "appId" }, { name: "Wallet", fmt: "appId" },
  ]},
  sal: { label: "Social App List", fields: [
    { name: "Social", fmt: "appId" }, { name: "Graph", fmt: "appId" },
    { name: "Impact", fmt: "appId" }, { name: "Moderation", fmt: "appId" },
  ]},
  pal: { label: "Plugin App List", fields: [
    { name: "Opt-In", fmt: "appId" }, { name: "Revenue Manager", fmt: "appId" },
    { name: "Update", fmt: "appId" },
  ]},
  oal: { label: "Other App List", fields: [
    { name: "VRF Beacon", fmt: "appId" }, { name: "NFD Registry", fmt: "appId" },
    { name: "Asset Inbox", fmt: "appId" }, { name: "Escrow", fmt: "appId" },
    { name: "Poll", fmt: "appId" }, { name: "Akita NFD", fmt: "appId" },
  ]},

  wallet_fees: { label: "Wallet Fees", fields: [
    { name: "Create Fee", fmt: "microAlgo" }, { name: "Referrer %", fmt: "basisPoints" },
  ]},
  social_fees: { label: "Social Fees", fields: [
    { name: "Post Fee", fmt: "microAlgo" }, { name: "React Fee", fmt: "microAlgo" },
    { name: "Impact Tax Min", fmt: "basisPoints" }, { name: "Impact Tax Max", fmt: "basisPoints" },
  ]},
  staking_fees: { label: "Staking Fees", fields: [
    { name: "Creation Fee", fmt: "microAlgo" },
    { name: "Impact Tax Min", fmt: "basisPoints" }, { name: "Impact Tax Max", fmt: "basisPoints" },
  ]},
  subscription_fees: { label: "Subscription Fees", fields: [
    { name: "Service Creation Fee", fmt: "microAlgo" },
    { name: "Payment %", fmt: "basisPoints" }, { name: "Trigger %", fmt: "basisPoints" },
  ]},
  nft_fees: { label: "NFT Fees", fields: [
    { name: "MP Sale % Min", fmt: "basisPoints" }, { name: "MP Sale % Max", fmt: "basisPoints" },
    { name: "MP Composable %", fmt: "basisPoints" }, { name: "MP Royalty Default %", fmt: "basisPoints" },
    { name: "Shuffle Sale %", fmt: "basisPoints" }, { name: "Omnigem Sale Fee", fmt: "microAlgo" },
    { name: "Auction Creation Fee", fmt: "microAlgo" },
    { name: "Auction Sale Tax Min", fmt: "basisPoints" }, { name: "Auction Sale Tax Max", fmt: "basisPoints" },
    { name: "Auction Composable %", fmt: "basisPoints" }, { name: "Auction Raffle %", fmt: "basisPoints" },
    { name: "Raffle Creation Fee", fmt: "microAlgo" },
    { name: "Raffle Sale Tax Min", fmt: "basisPoints" }, { name: "Raffle Sale Tax Max", fmt: "basisPoints" },
    { name: "Raffle Composable %", fmt: "basisPoints" },
  ]},
  swap_fees: { label: "Swap Fees", fields: [
    { name: "Impact Tax Min", fmt: "basisPoints" }, { name: "Impact Tax Max", fmt: "basisPoints" },
  ]},

  akita_assets: { label: "Akita Assets", fields: [
    { name: "AKTA", fmt: "raw" }, { name: "BONES", fmt: "raw" },
  ]},

  upgrade_app_ps: { label: "Upgrade App Proposal Settings", fields: PS_FIELDS },
  add_plugin_ps: { label: "Add Plugin Proposal Settings", fields: PS_FIELDS },
  remove_plugin_ps: { label: "Remove Plugin Proposal Settings", fields: PS_FIELDS },
  add_allowance_ps: { label: "Add Allowance Proposal Settings", fields: PS_FIELDS },
  remove_allowance_ps: { label: "Remove Allowance Proposal Settings", fields: PS_FIELDS },
  new_escrow_ps: { label: "New Escrow Proposal Settings", fields: PS_FIELDS },
  update_fields_ps: { label: "Update Fields Proposal Settings", fields: PS_FIELDS },
};

function readUint64s(bytes: Uint8Array): bigint[] {
  const result: bigint[] = [];
  for (let i = 0; i + 8 <= bytes.length; i += 8) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + i, 8);
    result.push(view.getBigUint64(0));
  }
  return result;
}

function formatFieldValue(val: bigint, fmt: FieldFmt, network: AkitaNetwork): string {
  switch (fmt) {
    case "appId": return val === 0n ? "0" : resolveAppName(val, network);
    case "microAlgo": return formatMicroAlgo(val);
    case "basisPoints": return formatBasisPoints(val);
    case "duration": return formatDuration(val);
    default: return formatBigInt(val);
  }
}

/**
 * Decode an UpdateFields action value into KV pairs.
 * Returns the field label and decoded pairs, or a raw hex fallback.
 */
export function decodeFieldUpdate(
  field: string,
  value: Uint8Array,
  network: AkitaNetwork,
): { label: string; pairs: [string, string][] } {
  // Content policy is a raw CID
  if (field === "content_policy") {
    return { label: "Content Policy", pairs: [["CID", formatCID(value)]] };
  }

  // Revenue splits use ABI tuple encoding with variable-length strings
  if (field === "revenue_splits") {
    return decodeRevenueSplits(value, network);
  }

  const schema = FIELD_SCHEMAS[field];
  if (!schema) {
    const hex = Buffer.from(value).toString("hex");
    return { label: field, pairs: [["Value", hex.length <= 32 ? hex : hex.slice(0, 32) + "..."]] };
  }

  const values = readUint64s(value);
  const pairs: [string, string][] = [];

  for (let i = 0; i < schema.fields.length && i < values.length; i++) {
    const def = schema.fields[i];
    pairs.push([def.name, formatFieldValue(values[i], def.fmt, network)]);
  }

  return { label: schema.label, pairs };
}

function decodeRevenueSplits(
  value: Uint8Array,
  network: AkitaNetwork,
): { label: string; pairs: [string, string][] } {
  try {
    const abiType = ABIType.from("((uint64,string),uint8,uint64)[]");
    const decoded = abiType.decode(value) as [[bigint, string], number, bigint][];

    let pctSum = 0n;
    for (const [, type, val] of decoded) {
      if (type === 20) pctSum += val;
    }

    const pairs: [string, string][] = [];
    for (const [[wallet, escrow], type, val] of decoded) {
      const name = resolveAppName(wallet, network);
      const esc = escrow || "(default)";
      let share: string;
      if (type === 20) share = formatBasisPoints(val);
      else if (type === 30) share = formatBasisPoints(100_000n - pctSum);
      else share = formatBigInt(val);
      pairs.push([`${name} → ${esc}`, share]);
    }

    return { label: "Revenue Splits", pairs };
  } catch {
    const hex = Buffer.from(value).toString("hex");
    return { label: "Revenue Splits", pairs: [["Value", hex.slice(0, 32) + "..."]] };
  }
}
