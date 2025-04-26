import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { Network, RPC } from "./utils/networks";
import "./tasks/find-events";
import "./tasks/find-roles";
import "./tasks/get-proxy-admin";
import "./tasks/read-slot";
import "./tasks/find-creation-block";

const config: HardhatUserConfig = {
  solidity: "0.8.28",

  networks: {
    mainnet: getNetworksConfig(Network.Ethereum),
    arbitrum: getNetworksConfig(Network.Arbitrum),
    polygon: getNetworksConfig(Network.Polygon),
    flare: getNetworksConfig(Network.Flare),
    bnb: getNetworksConfig(Network.Bnb),
    soneium: getNetworksConfig(Network.Soneium),
    linea: getNetworksConfig(Network.Linea),
    flow: getNetworksConfig(Network.Flow),
    sonic: getNetworksConfig(Network.Sonic),
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
