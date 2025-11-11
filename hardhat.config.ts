import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { config as dotenvConfig } from "dotenv";
import { Network, getRPCConfig } from "./utils/networks";
import "./tasks/find-events";
import "./tasks/find-roles";
import "./tasks/get-proxy-admin";
import "./tasks/read-slot";
import "./tasks/find-creation-block";

// Load environment variables
dotenvConfig();

// Get Alchemy API key from environment
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;

// Get RPC configuration with Alchemy support
const rpcConfig = getRPCConfig(ALCHEMY_API_KEY);

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
    etherlink: getNetworksConfig(Network.Etherlink),
  }
};


function getNetworksConfig(chainId: number) {
  const networkRpcConfig = rpcConfig[chainId as Network];
  if (!networkRpcConfig) {
    throw new Error("Unsupported network");
  }

  return {
    url: networkRpcConfig.primary,
    chainId: chainId,
  };
}

export default config;
