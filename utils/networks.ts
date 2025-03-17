export enum Network {
  // Mainnets
  Ethereum = 1,
  Bnb = 56,
  Arbitrum = 42161,
  Polygon = 137,
  Flare = 14,
  Blast = 999,
  Soneium = 1868,
}

export enum ExplorerType {
  Etherscan = "etherscan",
  Blockscout = "blockscout",
}

export const RPC: { [K in Network]: string } = {
  [Network.Ethereum]: "https://rpc.payload.de",
  [Network.Bnb]: "https://bscrpc.com",
  [Network.Arbitrum]: "https://arbitrum.llamarpc.com",
  [Network.Polygon]: "https://polygon.llamarpc.com",
  [Network.Flare]: "https://rpc.ankr.com/flare",
  [Network.Blast]: "https://rpc.blast.com",
  [Network.Soneium]: "https://soneium.drpc.org",
};

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
};
