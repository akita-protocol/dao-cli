import { AlgorandClient } from "@algorandfoundation/algokit-utils/types/algorand-client";
import { Address, makeEmptyTransactionSigner } from "algosdk";
import { setCurrentNetwork, type AkitaNetwork, AkitaDaoSDK } from "@akta/sdk";

const ALGOD_URLS: Record<AkitaNetwork, string> = {
  mainnet: "https://mainnet-api.algonode.cloud",
  testnet: "https://testnet-api.algonode.cloud",
  localnet: "http://localhost",
};

const ALGOD_PORTS: Record<AkitaNetwork, number> = {
  mainnet: 443,
  testnet: 443,
  localnet: 4001,
};

export function createDAO(network: AkitaNetwork): AkitaDaoSDK {
  setCurrentNetwork(network);

  const algorand = AlgorandClient.fromConfig({
    algodConfig: {
      server: ALGOD_URLS[network],
      port: ALGOD_PORTS[network],
      token: "",
    },
  });

  const READER = Address.fromString("Y76M3MSY6DKBRHBL7C3NNDXGS5IIMQVQVUAB6MP4XEMMGVF2QWNPL226CA");

  return new AkitaDaoSDK({
    algorand,
    factoryParams: {
      defaultSender: READER,
      defaultSigner: makeEmptyTransactionSigner(),
    },
  });
}
