import type { AkitaDaoSDK } from "@akta/sdk";
import { getNetworkAppIds, type AkitaNetwork } from "@akta/sdk";
import { printJson, printKV, header } from "../output";

export async function infoCommand(dao: AkitaDaoSDK, network: AkitaNetwork, json: boolean): Promise<void> {
  const state = await dao.getGlobalState();
  const ids = getNetworkAppIds(network);

  const data = {
    network,
    daoAppId: dao.appId,
    version: state.version,
    walletAppId: state.wallet,
    akta: state.akitaAssets?.akta,
    bones: state.akitaAssets?.bones,
    proposalCount: state.proposalId,
    proposalActionLimit: state.proposalActionLimit,
  };

  if (json) return printJson(data);

  header("Akita DAO");
  printKV([
    ["Network", network],
    ["DAO App ID", dao.appId.toString()],
    ["Version", state.version ?? "-"],
    ["Wallet App ID", state.wallet?.toString() ?? "-"],
    ["AKTA Asset ID", state.akitaAssets?.akta?.toString() ?? ids.akta.toString()],
    ["BONES Asset ID", state.akitaAssets?.bones?.toString() ?? ids.bones.toString()],
    ["Next Proposal ID", state.proposalId?.toString() ?? "-"],
    ["Proposal Action Limit", state.proposalActionLimit?.toString() ?? "-"],
  ]);
}
