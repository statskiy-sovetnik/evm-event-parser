export enum Network {
  // Mainnets
  Ethereum = 1,
  Bnb = 56,
  Arbitrum = 42161,
  Polygon = 137,
  Flare = 14,
  Blast = 999,
  Soneium = 1868,
  Linea = 59144,
  Flow = 747,
  Sonic = 146,
  Etherlink = 42793,
}

export enum ExplorerType {
  Etherscan = "etherscan",
  Blockscout = "blockscout",
}

export interface RPCConfig {
  primary: string;
  alternatives?: string[];
}

// Public RPC endpoints (used as fallbacks or when Alchemy is not available)
const PUBLIC_RPCS: { [K in Network]: string } = {
  [Network.Ethereum]: "https://eth.rpc.blxrbdn.com",
  [Network.Bnb]: "https://bsc-mainnet.public.blastapi.io",
  [Network.Arbitrum]: "https://arbitrum.llamarpc.com",
  [Network.Polygon]: "https://polygon.llamarpc.com",
  [Network.Flare]: "https://rpc.ankr.com/flare",
  [Network.Blast]: "https://rpc.blast.com",
  [Network.Soneium]: "https://soneium.drpc.org",
  [Network.Linea]: "https://rpc.linea.build",
  [Network.Flow]: "https://mainnet.evm.nodes.onflow.org",
  [Network.Sonic]: "https://sonic-rpc.publicnode.com",
  [Network.Etherlink]: "https://node.mainnet.etherlink.com",
};

// Networks supported by Alchemy
const ALCHEMY_SUPPORTED_NETWORKS = [
  Network.Ethereum,
  Network.Bnb,
  Network.Arbitrum,
  Network.Polygon,
  Network.Blast,
  Network.Soneium,
  Network.Linea,
];

// Alchemy RPC URL patterns
const ALCHEMY_RPC_PATTERNS: { [K in Network]?: string } = {
  [Network.Ethereum]: "https://eth-mainnet.g.alchemy.com/v2/",
  [Network.Bnb]: "https://bnb-mainnet.g.alchemy.com/v2/",
  [Network.Arbitrum]: "https://arb-mainnet.g.alchemy.com/v2/",
  [Network.Polygon]: "https://polygon-mainnet.g.alchemy.com/v2/",
  [Network.Blast]: "https://blast-mainnet.g.alchemy.com/v2/",
  [Network.Soneium]: "https://soneium-mainnet.g.alchemy.com/v2/",
  [Network.Linea]: "https://linea-mainnet.g.alchemy.com/v2/",
};

/**
 * Get RPC configuration for all networks
 * @param alchemyApiKey - Optional Alchemy API key. If provided, Alchemy will be used as primary RPC for supported networks
 * @returns RPC configuration object with primary and alternative URLs
 */
export function getRPCConfig(alchemyApiKey?: string): { [K in Network]: RPCConfig } {
  const config: { [K in Network]: RPCConfig } = {} as any;

  for (const network of Object.values(Network)) {
    if (typeof network === "number") {
      const networkEnum = network as Network;
      const publicRpc = PUBLIC_RPCS[networkEnum];

      // Check if network is supported by Alchemy and API key is provided
      if (alchemyApiKey && ALCHEMY_SUPPORTED_NETWORKS.includes(networkEnum)) {
        const alchemyPattern = ALCHEMY_RPC_PATTERNS[networkEnum];
        if (alchemyPattern) {
          config[networkEnum] = {
            primary: `${alchemyPattern}${alchemyApiKey}`,
            alternatives: [publicRpc],
          };
        } else {
          config[networkEnum] = { primary: publicRpc };
        }
      } else {
        // No Alchemy support or no API key - use public RPC only
        config[networkEnum] = { primary: publicRpc };
      }
    }
  }

  return config;
}

/**
 * Get RPC URLs for a specific network
 * @param network - Network enum value
 * @param alchemyApiKey - Optional Alchemy API key
 * @returns Array of RPC URLs [primary, ...alternatives]
 */
export function getRPCUrls(network: Network, alchemyApiKey?: string): string[] {
  const config = getRPCConfig(alchemyApiKey);
  const networkConfig = config[network];
  return [networkConfig.primary, ...(networkConfig.alternatives || [])];
}

// Legacy export for backward compatibility (returns public RPCs)
export const RPC: { [K in Network]: string } = PUBLIC_RPCS;

export interface ExplorerConfig {
  type: ExplorerType;
  url: string;
  apiUrl?: string; // Optional custom API URL if different from the default pattern
}

export const Explorers: { [K in Network]: ExplorerConfig } = {
  [Network.Ethereum]: {
    type: ExplorerType.Etherscan,
    url: "https://etherscan.io",
  },
  [Network.Bnb]: {
    type: ExplorerType.Etherscan,
    url: "https://bscscan.com",
  },
  [Network.Arbitrum]: {
    type: ExplorerType.Etherscan,
    url: "https://arbiscan.io",
  },
  [Network.Polygon]: {
    type: ExplorerType.Etherscan,
    url: "https://polygonscan.com",
  },
  [Network.Flare]: {
    type: ExplorerType.Etherscan,
    url: "https://flare-explorer.flare.network",
  },
  [Network.Blast]: {
    type: ExplorerType.Etherscan,
    url: "https://blastscan.io",
  },
  [Network.Soneium]: {
    type: ExplorerType.Blockscout,
    url: "https://soneium.blockscout.com",
  },
  [Network.Linea]: {
    type: ExplorerType.Etherscan,
    apiUrl: "https://api.lineascan.build/api",
    url: "https://lineascan.build",
  },
  [Network.Flow]: {
    type: ExplorerType.Blockscout,
    url: "https://evm.flowscan.io/",
    //apiUrl: "https://evm.flowscan.io/api",
  },
  [Network.Sonic]: {
    type: ExplorerType.Etherscan,
    url: "https://sonicscan.org",
    apiUrl: "https://api.sonicscan.org/api"
  },
  [Network.Etherlink]: {
    type: ExplorerType.Blockscout,
    url: "https://explorer.etherlink.com",
  },
}
