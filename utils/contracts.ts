import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import axios from "axios";
import { Contract, EventLog, Log } from "ethers";
import { BLOCKSCOUT_MAX_BLOCK_RANGE, MAX_BLOCK_RANGE, SONIC_MAX_BLOCK_RANGE, RPCProviderType, RPC_MAX_BLOCK_RANGE } from "./constants";
import { ExplorerType, Explorers, Network, getRPCUrls, getRPCProviderType } from "./networks";
import { logger } from "./logger";
import { withProviderRetry, withHttpRetry, createProviderOperation, isTimeoutError } from "./retry";

export async function loadAbiFromFile(abiPath: string): Promise<any> {
  const abiJson = fs.readFileSync(path.resolve(abiPath), "utf8");
  return JSON.parse(abiJson);
}

/**
 * Helper: Get the appropriate API key for a network
 * @param networkName - Name of the network
 * @returns API key for the network
 */
function getApiKeyForNetwork(networkName: string): string {
  let apiKey: string | undefined;

  if (networkName === "linea") {
    apiKey = process.env.LINEASCAN_API_KEY;
    if (!apiKey) {
      throw new Error("LINEASCAN_API_KEY environment variable not set");
    }
  } else if (networkName === "sonic") {
    apiKey = process.env.SONICSCAN_API_KEY;
    if (!apiKey) {
      throw new Error("SONICSCAN_API_KEY environment variable not set");
    }
  } else if (networkName === "bnb") {
    apiKey = process.env.BSCSCAN_API_KEY;
    if (!apiKey) {
      throw new Error("BSCSCAN_API_KEY environment variable not set");
    }
  } else {
    apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      throw new Error("ETHERSCAN_API_KEY environment variable not set");
    }
  }

  return apiKey;
}

/**
 * Helper: Get the API URL for an explorer
 * @param explorerConfig - Explorer configuration
 * @returns API URL
 */
function getExplorerApiUrl(explorerConfig: { url: string; apiUrl?: string }): string {
  return explorerConfig.apiUrl || `${explorerConfig.url.replace(/\/$/, "")}/api`;
}

/**
 * Helper: Validate Etherscan API response
 * @param response - Axios response from Etherscan API
 * @returns True if response is successful
 */
function isEtherscanResponseSuccess(response: any): boolean {
  return response.data.status === "1";
}

/**
 * Helper: Get alternative RPC URL for a network (for retry logic)
 * @param hre - Hardhat Runtime Environment
 * @returns Alternative RPC URL or undefined if not available
 */
export function getAlternativeRpcUrl(
  hre: HardhatRuntimeEnvironment
): string | undefined {
  const chainId = hre.network.config.chainId;
  if (!chainId) return undefined;

  const alchemyApiKey = process.env.ALCHEMY_API_KEY;
  const rpcUrls = getRPCUrls(chainId as Network, alchemyApiKey);

  // Return the second URL (alternative) if it exists
  return rpcUrls.length > 1 ? rpcUrls[1] : undefined;
}

export async function fetchContractAbi(
  hre: HardhatRuntimeEnvironment,
  contractAddress: string
): Promise<any> {
  const networkName = hre.network.name;
  const chainId = hre.network.config.chainId;

  if (!chainId) {
    throw new Error(`Chain ID not found for network ${networkName}`);
  }

  const explorerConfig = Explorers[chainId as Network];

  if (!explorerConfig) {
    throw new Error(
      `Explorer not configured for network ${networkName} (chainId: ${chainId})`
    );
  }

  if (explorerConfig.type === ExplorerType.Etherscan) {
    return fetchAbiFromEtherscan(networkName, contractAddress, explorerConfig);
  } else if (explorerConfig.type === ExplorerType.Blockscout) {
    return fetchAbiFromBlockscout(contractAddress, explorerConfig);
  } else {
    throw new Error(`Unsupported explorer type: ${explorerConfig.type}`);
  }
}

async function fetchAbiFromEtherscan(
  networkName: string,
  contractAddress: string,
  explorerConfig: { url: string; apiUrl?: string }
): Promise<any> {
  const apiKey = getApiKeyForNetwork(networkName);
  const apiUrl = getExplorerApiUrl(explorerConfig);

  const response = await withHttpRetry(
    () =>
      axios.get(apiUrl, {
        params: {
          module: "contract",
          action: "getabi",
          address: contractAddress,
          apikey: apiKey,
        },
      }),
    `Fetch ABI from Etherscan (${networkName})`
  );

  if (isEtherscanResponseSuccess(response)) {
    return JSON.parse(response.data.result);
  }

  throw new Error(`Etherscan API error: ${response.data.message}`);
}

async function fetchAbiFromBlockscout(
  contractAddress: string,
  explorerConfig: { url: string; apiUrl?: string }
): Promise<any> {
  const baseUrl = explorerConfig.url.replace(/\/$/, "");

  try {
    // Try the v2 API first (newer Blockscout versions)
    const v2Response = await withHttpRetry(
      () => axios.get(`${baseUrl}/api/v2/smart-contracts/${contractAddress}`),
      "Fetch ABI from Blockscout v2 API"
    );

    if (v2Response.data && v2Response.data.abi) {
      return v2Response.data.abi;
    }
  } catch (error) {
    logger.info("V2 API not available, trying legacy API...", 1);
    // Continue to legacy API approach
  }

  try {
    // Try legacy API format
    const params: any = {
      module: "contract",
      action: "getabi",
      address: contractAddress,
    };

    // Add API key if available
    if (process.env.BLOCKSCOUT_API_KEY) {
      params.apikey = process.env.BLOCKSCOUT_API_KEY;
    }

    const response = await withHttpRetry(
      () => axios.get(`${baseUrl}/api`, { params }),
      "Fetch ABI from Blockscout legacy API"
    );

    if (response.data.status === "1" && response.data.result) {
      return JSON.parse(response.data.result);
    }

    throw new Error(
      `Blockscout API error: ${
        response.data.message || JSON.stringify(response.data)
      }`
    );
  } catch (error: any) {
    if (error.response && error.response.data) {
      throw new Error(
        `Blockscout API error: ${JSON.stringify(error.response.data)}`
      );
    }
    throw error;
  }
}

export interface ContractCreationInfo {
  blockNumber: number;
  txHash?: string;
}

export async function getContractCreationBlock(
  hre: HardhatRuntimeEnvironment,
  contractAddress: string
): Promise<ContractCreationInfo> {
  try {
    const networkName = hre.network.name;
    const chainId = hre.network.config.chainId;

    if (!chainId) {
      throw new Error(`Chain ID not found for network ${networkName}`);
    }

    const explorerConfig = Explorers[chainId as Network];

    if (!explorerConfig) {
      throw new Error(
        `Explorer not configured for network ${networkName} (chainId: ${chainId})`
      );
    }

    let txHash: string | undefined;

    if (explorerConfig.type === ExplorerType.Etherscan) {
      txHash = await getContractCreationTxFromEtherscan(
        networkName,
        contractAddress,
        explorerConfig
      );
    } else if (explorerConfig.type === ExplorerType.Blockscout) {
      txHash = await getContractCreationTxFromBlockscout(
        contractAddress,
        explorerConfig
      );
    } else {
      throw new Error(`Unsupported explorer type: ${explorerConfig.type}`);
    }

    if (txHash) {
      logger.info(`Contract creation transaction hash: ${txHash}`, 1);

      const alternativeRpc = getAlternativeRpcUrl(hre);
      const tx = await withProviderRetry(
        createProviderOperation(hre.ethers.provider, (provider) =>
          provider.getTransaction(txHash)
        ),
        alternativeRpc,
        "Get contract creation transaction"
      );

      if (tx && tx.blockNumber) {
        return {
          blockNumber: tx.blockNumber,
          txHash,
        };
      }
    }

    logger.warn(
      "Could not determine contract creation block, using block 0 as default"
    );
    return { blockNumber: 0 };
  } catch (error) {
    logger.error("Error determining contract creation block", error);
    return { blockNumber: 0 };
  }
}

async function getContractCreationTxFromEtherscan(
  networkName: string,
  contractAddress: string,
  explorerConfig: { url: string; apiUrl?: string }
): Promise<string | undefined> {
  const apiKey = getApiKeyForNetwork(networkName);
  const apiUrl = getExplorerApiUrl(explorerConfig);

  const response = await withHttpRetry(
    () =>
      axios.get(apiUrl, {
        params: {
          module: "contract",
          action: "getcontractcreation",
          contractaddresses: contractAddress,
          apikey: apiKey,
        },
      }),
    `Get contract creation tx from Etherscan (${networkName})`
  );

  if (
    isEtherscanResponseSuccess(response) &&
    response.data.result &&
    response.data.result.length > 0
  ) {
    return response.data.result[0].txHash;
  }

  return undefined;
}

async function getContractCreationTxFromBlockscout(
  contractAddress: string,
  explorerConfig: { url: string; apiUrl?: string }
): Promise<string | undefined> {
  const baseUrl = explorerConfig.url.replace(/\/$/, "");

  try {
    // According to Blockscout docs: /api?module=contract&action=getcontractcreation&contractaddresses={address}
    const params: any = {
      module: "contract",
      action: "getcontractcreation",
      contractaddresses: contractAddress,
    };

    // Add API key if available
    if (process.env.BLOCKSCOUT_API_KEY) {
      params.apikey = process.env.BLOCKSCOUT_API_KEY;
    }

    const response = await withHttpRetry(
      () => axios.get(`${baseUrl}/api`, { params }),
      "Get contract creation tx from Blockscout"
    );

    if (
      response.data.status === "1" &&
      response.data.result &&
      response.data.result.length > 0
    ) {
      return response.data.result[0].txHash;
    }
  } catch (error) {
    logger.info(
      "Failed to get contract creation tx via getcontractcreation endpoint",
      1
    );

    // Fallback methods if the primary method fails
    try {
      // Try the v2 API as a fallback
      const v2Response = await withHttpRetry(
        () => axios.get(`${baseUrl}/api/v2/smart-contracts/${contractAddress}`),
        "Get contract creation tx from Blockscout v2 API"
      );

      if (v2Response.data && v2Response.data.creation_tx_hash) {
        return v2Response.data.creation_tx_hash;
      }
    } catch (error) {
      logger.info("V2 API fallback failed", 1);
    }
  }

  // As a last resort, try to get the first transaction for the contract
  try {
    const txlistParams: any = {
      module: "account",
      action: "txlist",
      address: contractAddress,
      sort: "asc",
      page: 1,
      offset: 1,
    };

    // Add API key if available
    if (process.env.BLOCKSCOUT_API_KEY) {
      txlistParams.apikey = process.env.BLOCKSCOUT_API_KEY;
    }

    const txlistResponse = await withHttpRetry(
      () => axios.get(`${baseUrl}/api`, { params: txlistParams }),
      "Get transactions list from Blockscout"
    );

    if (
      txlistResponse.data.status === "1" &&
      txlistResponse.data.result &&
      txlistResponse.data.result.length > 0
    ) {
      return txlistResponse.data.result[0].hash;
    }
  } catch (error) {
    logger.info("Failed to retrieve transactions list for contract", 1);
  }

  return undefined;
}

export function createContract(
  hre: HardhatRuntimeEnvironment,
  contractAddress: string,
  contractAbi: any
) {
  const provider = hre.ethers.provider;
  return new hre.ethers.Contract(contractAddress, contractAbi, provider);
}

export async function getEventLogs(
  contract: Contract,
  eventName: string,
  fromBlock: number,
  toBlock: number,
  hre?: HardhatRuntimeEnvironment
): Promise<(EventLog | Log)[]> {
  if (!contract.filters[eventName]) {
    throw new Error(`Event ${eventName} not found in contract ABI`);
  }

  const filter = contract.filters[eventName]();

  // Determine the appropriate block range limit based on the RPC provider
  let maxBlockRange = MAX_BLOCK_RANGE;
  let providerType: RPCProviderType = RPCProviderType.Default;

  if (hre) {
    try {
      // Get the RPC URL from the provider
      const provider = hre.ethers.provider;
      const providerUrl = (provider as any)._getConnection?.().url || (provider as any).connection?.url || (hre.network.config as any).url;

      if (providerUrl) {
        const detectedType = getRPCProviderType(providerUrl);
        providerType = detectedType as RPCProviderType;
        maxBlockRange = RPC_MAX_BLOCK_RANGE[providerType];
        logger.info(`Detected ${providerType} RPC provider, using block range limit of ${maxBlockRange}`, 1);
      } else {
        logger.info(`Could not determine RPC provider, using default block range of ${MAX_BLOCK_RANGE}`, 1);
      }
    } catch (error) {
      // If there's any error determining the RPC type, fall back to default range
      logger.info(`Error determining RPC provider type, using default block range of ${MAX_BLOCK_RANGE}`, 1);
    }
  }

  // Get alternative RPC URL for retry logic (if available)
  const alternativeRpc = hre ? getAlternativeRpcUrl(hre) : undefined;

  // If the range is small enough, do a single query
  if (toBlock - fromBlock <= maxBlockRange) {
    return withProviderRetry(
      createProviderOperation(contract.runner as any, async (provider) => {
        const contractWithProvider = new Contract(
          await contract.getAddress(),
          contract.interface,
          provider
        );
        return contractWithProvider.queryFilter(filter, fromBlock, toBlock);
      }),
      alternativeRpc,
      `Query events ${eventName} (blocks ${fromBlock}-${toBlock})`
    );
  }

  // Otherwise, split into chunks and query in parallel
  logger.info(
    `Block range too large (${fromBlock} to ${toBlock}), splitting into chunks...`, 1
  );

  const chunks: Array<{ from: number; to: number }> = [];
  let current = fromBlock as number;

  while (current < (toBlock as number)) {
    // Calculate the end of this chunk (keeping within maxBlockRange)
    const end = Math.min(current + maxBlockRange - 1, toBlock as number);
    chunks.push({ from: current, to: end });
    current = end + 1;
  }

  logger.info(`Querying ${chunks.length} chunks of blocks in parallel...`, 1);

  // Progress tracking
  const progressStats = {
    total: chunks.length,
    completed: 0,
    failed: 0,
    errors: new Map<string, number>(), // Error type -> count
  };

  /**
   * Update and display progress in real-time
   */
  const updateProgress = () => {
    const errorSummary = Array.from(progressStats.errors.entries())
      .map(([type, count]) => `${type}: ${count}`)
      .join(", ");

    const statusLine = `\rQuerying chunks: ${progressStats.completed}/${progressStats.total} completed, ${progressStats.failed} failed${
      errorSummary ? ` | Errors: [${errorSummary}]` : ""
    }`;

    process.stdout.write(statusLine);
  };

  /**
   * Categorize error type for tracking
   */
  const categorizeError = (error: any): string => {
    if (isTimeoutError(error)) return "timeout";
    const message = error.message?.toLowerCase() || "";
    if (message.includes("rate limit") || message.includes("429")) return "rate-limit";
    if (message.includes("too many requests")) return "rate-limit";
    return "other";
  };

  /**
   * Helper function to query a single chunk with automatic re-chunking on timeout
   */
  const queryChunkWithRetry = async (
    chunk: { from: number; to: number },
    currentMaxRange: number
  ): Promise<(EventLog | Log)[]> => {
    try {
      const result = await withProviderRetry(
        createProviderOperation(contract.runner as any, async (provider) => {
          const contractWithProvider = new Contract(
            await contract.getAddress(),
            contract.interface,
            provider
          );
          return contractWithProvider.queryFilter(filter, chunk.from, chunk.to);
        }),
        alternativeRpc,
        `Query events ${eventName} (blocks ${chunk.from}-${chunk.to})`
      );

      // Success - update progress
      progressStats.completed++;
      updateProgress();
      return result;
    } catch (error: any) {
      // If it's a timeout error and the chunk is large enough to split, retry with smaller chunks
      const chunkSize = chunk.to - chunk.from + 1;
      const reducedMaxRange = Math.floor(currentMaxRange / 10);

      if (isTimeoutError(error) && chunkSize > reducedMaxRange && reducedMaxRange >= 10) {
        // Split the failed chunk into smaller chunks
        const subChunks: Array<{ from: number; to: number }> = [];
        let current = chunk.from;
        while (current <= chunk.to) {
          const end = Math.min(current + reducedMaxRange - 1, chunk.to);
          subChunks.push({ from: current, to: end });
          current = end + 1;
        }

        // Update total count for sub-chunks
        progressStats.total += subChunks.length - 1;

        // Recursively query each sub-chunk
        const subResults = await Promise.all(
          subChunks.map((subChunk) => queryChunkWithRetry(subChunk, reducedMaxRange))
        );

        return subResults.flat();
      }

      // Failed - update progress
      const errorType = categorizeError(error);
      progressStats.failed++;
      progressStats.errors.set(errorType, (progressStats.errors.get(errorType) || 0) + 1);
      progressStats.completed++;
      updateProgress();

      return [] as (EventLog | Log)[];
    }
  };

  const chunkResults = await Promise.all(
    chunks.map((chunk) => queryChunkWithRetry(chunk, maxBlockRange))
  );

  // Clear progress line and show final summary
  process.stdout.write("\n");
  const allLogs = chunkResults.flat();

  // Final summary
  logger.success(
    `Retrieved ${allLogs.length} total events from ${progressStats.completed} chunks`
  );
  if (progressStats.failed > 0) {
    const errorDetails = Array.from(progressStats.errors.entries())
      .map(([type, count]) => `${type}: ${count}`)
      .join(", ");
    logger.warn(`${progressStats.failed} chunks failed: ${errorDetails}`);
  }

  return allLogs;
}

export async function getBlockParams(
  hre: HardhatRuntimeEnvironment,
  contractAddress: string,
  fromBlockArg?: string,
  toBlockArg?: string
): Promise<{ fromBlock: number; toBlock: number }> {
  const provider = hre.ethers.provider;
  let fromBlock: number;
  let toBlock: number;

  logger.section("Block Range Configuration");

  if (fromBlockArg) {
    // Parse user-provided fromBlock
    fromBlock = fromBlockArg.startsWith("0x")
      ? parseInt(fromBlockArg, 16)
      : parseInt(fromBlockArg);
    logger.info(`Using provided fromBlock: ${fromBlock}`);
  } else {
    // Default to contract creation block
    logger.info("Determining contract creation block...");
    const creationInfo = await getContractCreationBlock(hre, contractAddress);
    fromBlock = creationInfo.blockNumber;
    logger.info(`Using contract creation block: ${fromBlock}`);
  }

  if (toBlockArg) {
    // Parse user-provided toBlock
    toBlock = toBlockArg.startsWith("0x")
      ? parseInt(toBlockArg, 16)
      : parseInt(toBlockArg);
    logger.info(`Using provided toBlock: ${toBlock}`);
  } else {
    // Fetch latest finalized block from the blockchain
    const alternativeRpc = getAlternativeRpcUrl(hre);

    try {
      // First try to get the finalized block (for chains that support it)
      const finalizedBlock = await withProviderRetry(
        createProviderOperation(provider, async (p) => {
          try {
            return await p.getBlock("finalized");
          } catch {
            return await p.getBlock("latest");
          }
        }),
        alternativeRpc,
        "Get finalized/latest block"
      );

      if (!finalizedBlock || typeof finalizedBlock.number !== "number") {
        throw new Error("Unable to retrieve finalized block");
      }

      toBlock = finalizedBlock.number;
      logger.info(`Using latest finalized block: ${toBlock}`);
    } catch (error) {
      // Fallback to latest block number if we can't get the block
      const latestBlock = await withProviderRetry(
        createProviderOperation(provider, (p) => p.getBlockNumber()),
        alternativeRpc,
        "Get latest block number"
      );
      toBlock = latestBlock;
      logger.info(`Using latest block number: ${toBlock}`);
    }
  }

  return { fromBlock, toBlock };
}
