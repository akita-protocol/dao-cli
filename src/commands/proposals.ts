import type { AkitaDaoSDK } from "@akta/sdk";
import { printJson, printColumns, header, printKV } from "../output";
import {
  truncateAddress,
  formatTimestamp,
  formatCID,
  proposalStatusLabel,
  proposalActionLabel,
  formatMicroAlgo,
  formatBigInt,
  colorStatus,
} from "../formatting";

type StatusFilter = "all" | "active" | "past";

function isActive(status: number): boolean {
  return status === 0 || status === 20;
}

function isPast(status: number): boolean {
  return status >= 30;
}

export async function listProposals(
  dao: AkitaDaoSDK,
  json: boolean,
  statusFilter: StatusFilter = "all",
  limit: number = 20
): Promise<void> {
  const proposals = await dao.client.state.box.proposals.getMap();

  let entries = Array.from(proposals.entries());

  if (statusFilter === "active") {
    entries = entries.filter(([, p]) => isActive(p.status));
  } else if (statusFilter === "past") {
    entries = entries.filter(([, p]) => isPast(p.status));
  }

  // Sort by ID descending (newest first)
  entries.sort((a, b) => (b[0] > a[0] ? 1 : b[0] < a[0] ? -1 : 0));
  entries = entries.slice(0, limit);

  if (json) {
    return printJson(
      entries.map(([id, p]) => ({
        id,
        status: p.status,
        statusLabel: proposalStatusLabel(p.status),
        creator: p.creator,
        cid: p.cid,
        votes: p.votes,
        created: p.created,
        votingTs: p.votingTs,
        feesPaid: p.feesPaid,
        actionCount: p.actions.length,
      }))
    );
  }

  header(`Proposals (${statusFilter}, showing ${entries.length})`);

  if (entries.length === 0) {
    console.log("  No proposals found.");
    return;
  }

  const rows = entries.map(([id, p]) => [
    id.toString(),
    colorStatus(proposalStatusLabel(p.status)),
    truncateAddress(p.creator),
    `${p.votes.approvals}/${p.votes.rejections}/${p.votes.abstains}`,
    p.actions.length.toString(),
    formatTimestamp(p.created),
  ]);

  printColumns(["ID", "Status", "Creator", "Votes", "Actions", "Created"], rows);
}

export async function getProposal(dao: AkitaDaoSDK, id: bigint, json: boolean): Promise<void> {
  const proposal = await dao.getProposal(id);

  if (json) return printJson({ id, ...proposal });

  header(`Proposal #${id}`);
  printKV([
    ["Status", colorStatus(proposalStatusLabel(proposal.status))],
    ["Creator", proposal.creator],
    ["CID", formatCID(proposal.cid)],
    ["Created", formatTimestamp(proposal.created)],
    ["Voting Timestamp", formatTimestamp(proposal.votingTs)],
    ["Fees Paid", formatMicroAlgo(proposal.feesPaid)],
  ]);

  header("Votes");
  printKV([
    ["Approvals", formatBigInt(proposal.votes.approvals)],
    ["Rejections", formatBigInt(proposal.votes.rejections)],
    ["Abstains", formatBigInt(proposal.votes.abstains)],
  ]);

  if (proposal.actions.length > 0) {
    header("Actions");
    const rows = proposal.actions.map((action, i) => [
      (i + 1).toString(),
      proposalActionLabel(action.type),
      formatActionDetails(action),
    ]);
    printColumns(["#", "Type", "Details"], rows);
  }
}

function formatActionDetails(action: { type: number; [key: string]: unknown }): string {
  const { type, ...rest } = action;
  const parts: string[] = [];

  for (const [key, value] of Object.entries(rest)) {
    if (value instanceof Uint8Array) {
      const hex = Buffer.from(value).toString("hex");
      parts.push(`${key}: ${hex.length > 16 ? hex.slice(0, 16) + "..." : hex}`);
    } else if (typeof value === "bigint") {
      parts.push(`${key}: ${value.toString()}`);
    } else if (typeof value === "string") {
      parts.push(`${key}: ${value.length > 40 ? value.slice(0, 40) + "..." : value}`);
    } else if (Array.isArray(value)) {
      parts.push(`${key}: [${value.length} items]`);
    } else if (value !== undefined && value !== null) {
      parts.push(`${key}: ${String(value)}`);
    }
  }

  return parts.join(", ");
}
