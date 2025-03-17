import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import axios from "axios";
import { Contract, EventLog, Log } from "ethers";
import { BLOCKSCOUT_MAX_BLOCK_RANGE, MAX_BLOCK_RANGE } from "./constants";
import { ExplorerType, Explorers, Network } from "./networks";

export async function loadAbiFromFile(abiPath: string): Promise<any> {
  const abiJson = fs.readFileSync(path.resolve(abiPath), "utf8");
  return JSON.parse(abiJson);
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
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("ETHERSCAN_API_KEY environment variable not set");
  }

  // Use custom API URL if provided, otherwise construct it from the base URL
  const apiUrl =
    explorerConfig.apiUrl || `${explorerConfig.url.replace(/\/$/, "")}/api`;

  const response = await axios.get(apiUrl, {
    params: {
      module: "contract",
      action: "getabi",
      address: contractAddress,
      apikey: apiKey,
    },
  });

  if (response.data.status === "1") {
    return JSON.parse(response.data.result);
  }

  throw new Error(`Etherscan API error: ${response.data.message}`);
}

async function fetchAbiFromBlockscout(
  contractAddress: string,
  explorerConfig: { url: string; apiUrl?: string }
): Promise<any> {
  // Blockscout typically doesn't require an API key for basic contract queries

  // Use custom API URL if provided, otherwise construct it from the base URL
  const baseUrl = explorerConfig.url.replace(/\/$/, "");

  try {
    // Try the v2 API first (newer Blockscout versions)
    const v2Response = await axios.get(
      `${baseUrl}/api/v2/smart-contracts/${contractAddress}`
    );

    if (v2Response.data && v2Response.data.abi) {
      return v2Response.data.abi;
    }
  } catch (error) {
    console.log("V2 API not available, trying legacy API...");
    // Continue to legacy API approach
  }

  try {
    // Try legacy API format
    // Some Blockscout instances use apiKey, others don't
    const params: any = {
      module: "contract",
      action: "getabi",
      address: contractAddress,
    };

    // Add API key if available
    if (process.env.BLOCKSCOUT_API_KEY) {
      params.apikey = process.env.BLOCKSCOUT_API_KEY;
    }

    const response = await axios.get(`${baseUrl}/api`, { params });

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
      console.log(`Contract creation transaction hash: ${txHash}`);
      const tx = await hre.ethers.provider.getTransaction(txHash);
      if (tx && tx.blockNumber) {
        return { 
          blockNumber: tx.blockNumber,
          txHash 
        };
      }
    }

    console.log(
      "Could not determine contract creation block, using block 0 as default"
    );
    return { blockNumber: 0 };
  } catch (error) {
    console.error("Error determining contract creation block:", error);
    return { blockNumber: 0 };
  }
}

async function getContractCreationTxFromEtherscan(
  networkName: string,
  contractAddress: string,
  explorerConfig: { url: string; apiUrl?: string }
): Promise<string | undefined> {
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("ETHERSCAN_API_KEY environment variable not set");
  }

  // Use custom API URL if provided, otherwise construct it from the base URL
  const apiUrl =
    explorerConfig.apiUrl || `${explorerConfig.url.replace(/\/$/, "")}/api`;

  const response = await axios.get(apiUrl, {
    params: {
      module: "contract",
      action: "getcontractcreation",
      contractaddresses: contractAddress,
      apikey: apiKey,
    },
  });

  if (
    response.data.status === "1" &&
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

    const response = await axios.get(`${baseUrl}/api`, { params });

    if (
      response.data.status === "1" &&
      response.data.result &&
      response.data.result.length > 0
    ) {
      // According to docs, the response format is:
      // { "status": "1", "message": "OK", "result": [ { "contractAddress": "0x...", "contractCreator": "0x...", "txHash": "0x..." } ] }
      return response.data.result[0].txHash;
    }
  } catch (error) {
    console.log(
      "Failed to get contract creation tx via getcontractcreation endpoint"
    );

    // Fallback methods if the primary method fails
    try {
      // Try the v2 API as a fallback
      const v2Response = await axios.get(
        `${baseUrl}/api/v2/smart-contracts/${contractAddress}`
      );

      if (v2Response.data && v2Response.data.creation_tx_hash) {
        return v2Response.data.creation_tx_hash;
      }
    } catch (error) {
      console.log("V2 API fallback failed");
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

    const txlistResponse = await axios.get(`${baseUrl}/api`, {
      params: txlistParams,
    });

    if (
      txlistResponse.data.status === "1" &&
      txlistResponse.data.result &&
      txlistResponse.data.result.length > 0
    ) {
      return txlistResponse.data.result[0].hash;
    }
  } catch (error) {
    console.log("Failed to retrieve transactions list for contract");
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
  
  // Determine the appropriate block range limit based on the network explorer
  let maxBlockRange = MAX_BLOCK_RANGE;
  
  if (hre) {
    try {
      const chainId = hre.network.config.chainId;
      if (chainId) {
        const explorerConfig = Explorers[chainId as Network];
        if (explorerConfig && explorerConfig.type === ExplorerType.Blockscout) {
          maxBlockRange = BLOCKSCOUT_MAX_BLOCK_RANGE;
          console.log(`Using Blockscout-specific block range limit of ${BLOCKSCOUT_MAX_BLOCK_RANGE}`);
        }
      }
    } catch (error) {
      // If there's any error determining the explorer type, fall back to default range
      console.log(`Could not determine explorer type, using default block range of ${MAX_BLOCK_RANGE}`);
    }
  }

  // If the range is small enough, do a single query
  if (toBlock - fromBlock <= maxBlockRange) {
    return contract.queryFilter(filter, fromBlock, toBlock);
  }

  // Otherwise, split into chunks and query in parallel
  console.log(
    `Block range too large (${fromBlock} to ${toBlock}), splitting into chunks...`
  );

  const chunks: Array<{ from: number; to: number }> = [];
  let current = fromBlock as number;

  while (current < (toBlock as number)) {
    // Calculate the end of this chunk (keeping within maxBlockRange)
    const end = Math.min(current + maxBlockRange - 1, toBlock as number);
    chunks.push({ from: current, to: end });
    current = end + 1;
  }

  console.log(`Querying ${chunks.length} chunks of blocks in parallel...`);

  const chunkResults = await Promise.all(
    chunks.map((chunk) =>
      contract.queryFilter(filter, chunk.from, chunk.to).catch((error) => {
        console.error(
          `Error querying blocks ${chunk.from}-${chunk.to}: ${error.message}`
        );
        return [];
      })
    )
  );

  // Flatten results from all chunks
  const allLogs = chunkResults.flat();
  console.log(`Retrieved ${allLogs.length} total events across all chunks`);

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

  if (fromBlockArg) {
    // Parse user-provided fromBlock
    fromBlock = fromBlockArg.startsWith("0x")
      ? parseInt(fromBlockArg, 16)
      : parseInt(fromBlockArg);
    console.log(`Using provided fromBlock: ${fromBlock}`);
  } else {
    // Default to contract creation block
    console.log("Determining contract creation block...");
    const creationInfo = await getContractCreationBlock(hre, contractAddress);
    fromBlock = creationInfo.blockNumber;
    console.log(`Using contract creation block: ${fromBlock}`);
  }

  if (toBlockArg) {
    // Parse user-provided toBlock
    toBlock = toBlockArg.startsWith("0x")
      ? parseInt(toBlockArg, 16)
      : parseInt(toBlockArg);
    console.log(`Using provided toBlock: ${toBlock}`);
  } else {
    // Fetch latest finalized block from the blockchain
    try {
      // First try to get the finalized block (for chains that support it)
      const finalizedBlock = await provider
        .getBlock("finalized")
        .catch(() => provider.getBlock("latest"));

      if (!finalizedBlock || typeof finalizedBlock.number !== "number") {
        throw new Error("Unable to retrieve finalized block");
      }

      toBlock = finalizedBlock.number;
      console.log(`Using latest finalized block: ${toBlock}`);
    } catch (error) {
      // Fallback to latest as string if we can't get the number
      const latestBlock = await provider.getBlockNumber();
      toBlock = latestBlock;
      console.log(`Using latest block number: ${toBlock}`);
    }
  }

  return { fromBlock, toBlock };
}
