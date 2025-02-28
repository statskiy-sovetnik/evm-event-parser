export enum Network {
  // Mainnets
  Ethereum = 1,
  Bnb = 56,
  Arbitrum = 42161,
  Polygon = 137,
  Flare = 14,
  Blast = 999,
}

export const RPC: { [K in Network]: string } = {
  [Network.Ethereum]: "https://rpc.payload.de",
  [Network.Bnb]: "https://bscrpc.com",
  [Network.Arbitrum]: "https://arbitrum.llamarpc.com",
  [Network.Polygon]: "https://polygon.llamarpc.com",
  [Network.Flare]: "https://rpc.ankr.com/flare",
  [Network.Blast]: "https://rpc.blast.com",
}
