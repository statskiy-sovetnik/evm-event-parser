import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { Network, RPC } from "./utils/networks";
import "./tasks/find-events";
import "./tasks/find-roles";

const config: HardhatUserConfig = {
  solidity: "0.8.28",

  networks: {
    mainnet: getNetworksConfig(Network.Ethereum),
    arbitrum: getNetworksConfig(Network.Arbitrum),
    polygon: getNetworksConfig(Network.Polygon),
    flare: getNetworksConfig(Network.Flare),
    bnb: getNetworksConfig(Network.Bnb)
  }
};


function getNetworksConfig(chainId: number) {
  const rpcUrl = RPC[chainId as Network];
  if (!rpcUrl) {
    throw new Error("Unsupported network");
  }

  return {
    url: rpcUrl,
    chainId: chainId,
  };
}

export default config;
