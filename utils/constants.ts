/**
 * RPC Provider Types
 */
export enum RPCProviderType {
  Alchemy = "alchemy",
  Blockscout = "blockscout",
  Sonic = "sonic",
  Default = "default",
}

/**
 * Maximum block range for eth_getLogs queries by RPC provider type
 */
export const RPC_MAX_BLOCK_RANGE: { [key in RPCProviderType]: number } = {
  [RPCProviderType.Alchemy]: 10, // Alchemy has a strict 10-block limit
  [RPCProviderType.Blockscout]: 9900, // Slightly under 10000 to be safe
  [RPCProviderType.Sonic]: 50000, // Sonic allows larger ranges
  [RPCProviderType.Default]: 1000, // Conservative default for public RPCs
};

// Legacy exports for backward compatibility
export const MAX_BLOCK_RANGE = RPC_MAX_BLOCK_RANGE[RPCProviderType.Default];
export const BLOCKSCOUT_MAX_BLOCK_RANGE = RPC_MAX_BLOCK_RANGE[RPCProviderType.Blockscout];
export const SONIC_MAX_BLOCK_RANGE = RPC_MAX_BLOCK_RANGE[RPCProviderType.Sonic];
export const ALCHEMY_MAX_BLOCK_RANGE = RPC_MAX_BLOCK_RANGE[RPCProviderType.Alchemy];