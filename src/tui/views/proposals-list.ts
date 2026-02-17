import { renderColumns } from "../../output";
import theme from "../../theme";
import {
  truncateAddress,
  formatTimestamp,
  formatCID,
  proposalStatusLabel,
  proposalActionLabel,
  colorStatus,
} from "../../formatting";
import { renderPanel } from "../panels";
import { renderProposalDetail } from "./proposal-detail";
import type { ProposalData } from "./proposal-detail";
import type { LoadResult, View, ViewContext } from "../types";

// ── Cached data ────────────────────────────────────────────────

interface ListEntry {
  id: bigint;
  status: number;
  creator: string;
  votes: { approvals: bigint; rejections: bigint; abstains: bigint };
  actionCount: number;
  created: bigint;
}

const LIST_CACHE_TTL = 120_000; // 2 minutes
let _listCacheTs = 0;
let _cachedEntries: ListEntry[] = [];

const DETAIL_CACHE_TTL = 60_000;
const _detailCache = new Map<string, { ts: number; data: ProposalData }>();

export function invalidateProposalsCache(): void {
  _listCacheTs = 0;
  _detailCache.clear();
}

// ── Module-level cursor state ──────────────────────────────────

let _proposalIds: bigint[] = [];
let _cursor = 0;

export function getProposalIdAtCursor(cursor?: number): bigint | undefined {
  return _proposalIds[cursor ?? _cursor];
}

export function getProposalCount(): number {
  return _proposalIds.length;
}

export function cycleProposalCursor(dir: 1 | -1): void {
  if (_proposalIds.length <= 0) return;
  _cursor = (_cursor + dir + _proposalIds.length) % _proposalIds.length;
}

export function getProposalCursor(): number {
  return _cursor;
}

export function resetProposalCursor(): void {
  _cursor = 0;
}

// ── View ───────────────────────────────────────────────────────

export const proposalsListView: View = {
  selectable: true,

  selectableCount(lines: string[]): number {
    return _proposalIds.length;
  },

  async load(ctx: ViewContext): Promise<string[] | LoadResult> {
    const { dao, network, width } = ctx;

    // Fetch proposals list (cached)
    if (Date.now() - _listCacheTs > LIST_CACHE_TTL) {
      // Read proposals in small batches to avoid 429 rate limits
      // (getMap fires all box reads in parallel, overwhelming the API)
      const globalState = await dao.getGlobalState();
      const count = Number(globalState.proposalId ?? 0n);
      const BATCH = 5;
      const raw: [bigint, any][] = [];
      for (let i = 0; i < count; i += BATCH) {
        const batch = Array.from(
          { length: Math.min(BATCH, count - i) },
          (_, j) => BigInt(i + j),
        );
        const results = await Promise.all(
          batch.map(async (id) => {
            try {
              const p = await dao.client.state.box.proposals.value(id);
              return p ? ([id, p] as const) : null;
            } catch { return null; }
          }),
        );
        for (const r of results) if (r) raw.push([r[0], r[1]]);
      }
      raw.sort((a, b) => (b[0] > a[0] ? 1 : b[0] < a[0] ? -1 : 0));

      _cachedEntries = raw.map(([id, p]) => ({
        id,
        status: p.status,
        creator: p.creator,
        votes: p.votes,
        actionCount: p.actions.length,
        created: p.created,
      }));
      _listCacheTs = Date.now();
    }

    _proposalIds = _cachedEntries.map((e) => e.id);
    if (_cursor >= _proposalIds.length) _cursor = 0;

    if (_cachedEntries.length === 0) {
      return {
        lines: [
          "",
          ...renderPanel(["  No proposals found."], { title: "Proposals", width }),
        ],
        data: { proposals: [], selected: null },
      };
    }

    // Fetch selected proposal detail (cached)
    const selectedId = _proposalIds[_cursor];
    let detailData: ProposalData | null = null;

    if (selectedId !== undefined) {
      const cacheKey = selectedId.toString();
      const cached = _detailCache.get(cacheKey);
      if (cached && Date.now() - cached.ts < DETAIL_CACHE_TTL) {
        detailData = cached.data;
      } else {
        try {
          const data = await dao.getProposal(selectedId);
          detailData = data;
          _detailCache.set(cacheKey, { ts: Date.now(), data });
        } catch {
          // Detail fetch failed — show list only
        }
      }
    }

    // Build structured data for JSON mode
    const data = buildProposalsData(_cachedEntries, detailData, selectedId);

    // Narrow: single column (list, then detail below)
    if (width < 80) {
      return {
        lines: renderSingleColumn(_cachedEntries, detailData, selectedId, network, width),
        data,
      };
    }

    // Wide: two-panel layout (left scrolls, right fixed)
    const listW = Math.floor((width - 2) * 0.35);
    const detailW = width - listW - 2;

    const listPanel = renderListPanel(_cachedEntries, listW);

    let detailLines: string[];
    if (detailData && selectedId !== undefined) {
      detailLines = renderProposalDetail(detailData, selectedId, network, detailW);
    } else {
      detailLines = renderPanel(["  Select a proposal with [ ] keys."], { title: "Proposal Detail", width: detailW });
    }

    return {
      lines: ["", ...listPanel],
      fixedRight: ["", ...detailLines],
      data,
    };
  },
};

// ── Structured data for JSON mode ──────────────────────────────

function buildProposalsData(
  entries: ListEntry[],
  detailData: ProposalData | null,
  selectedId: bigint | undefined,
) {
  const proposals = entries.map((e) => ({
    id: e.id,
    status: proposalStatusLabel(e.status),
    creator: e.creator,
    votes: e.votes,
    actionCount: e.actionCount,
    created: e.created,
  }));

  let selected = null;
  if (detailData && selectedId !== undefined) {
    selected = {
      id: selectedId,
      status: proposalStatusLabel(detailData.status),
      creator: detailData.creator,
      cid: formatCID(detailData.cid),
      created: detailData.created,
      votingTs: detailData.votingTs,
      votes: detailData.votes,
      feesPaid: detailData.feesPaid,
      actions: detailData.actions.map((a) => ({
        ...a,
        type: proposalActionLabel(a.type),
      })),
    };
  }

  return { proposals, selected };
}

// ── Left panel: compact proposals list ─────────────────────────

function renderListPanel(entries: ListEntry[], width: number): string[] {
  const rows = entries.map((e, i) => {
    const marker = i === _cursor ? theme.cursor("▸ ") : "  ";
    return [
      marker + e.id.toString(),
      colorStatus(proposalStatusLabel(e.status)),
      truncateAddress(e.creator),
      e.actionCount.toString(),
    ];
  });

  const content = renderColumns(["  ID", "Status", "Proposer", "Actions"], rows);
  return renderPanel(content, { title: `Proposals (${entries.length})`, width });
}

// ── Single-column fallback ─────────────────────────────────────

function renderSingleColumn(
  entries: ListEntry[],
  detailData: ProposalData | null,
  selectedId: bigint | undefined,
  network: string,
  width: number,
): string[] {
  const lines: string[] = [""];

  // Compact list
  const rows = entries.map((e, i) => {
    const marker = i === _cursor ? theme.cursor("▸ ") : "  ";
    return [
      marker + e.id.toString(),
      colorStatus(proposalStatusLabel(e.status)),
      truncateAddress(e.creator),
      formatTimestamp(e.created),
    ];
  });
  const listContent = renderColumns(["  ID", "Status", "Creator", "Created"], rows);
  lines.push(...renderPanel(listContent, { title: `Proposals (${entries.length})`, width }));

  // Selected proposal detail below
  if (detailData && selectedId !== undefined) {
    lines.push("");
    lines.push(...renderProposalDetail(detailData, selectedId, network as any, width));
  }

  return lines;
}
