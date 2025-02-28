import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import axios from "axios";
import { Contract, EventLog, Log } from "ethers";
import dotenv from "dotenv";
import { MAX_BLOCK_RANGE } from "../utils/constants";

dotenv.config();


interface FindEventsTaskArgs {
  address: string;
  event: string;
  abi?: string;
  fromBlock?: string; // Optional starting block number
  toBlock?: string;   // Optional ending block number
}

interface EventData {
  transactionHash: string;
  eventName: string;
  timestamp: string;
  sender: string;
  eventParameters: any; // Adjust this type if you have a more specific structure
}

async function loadAbiFromFile(abiPath: string): Promise<any> {
  const abiJson = fs.readFileSync(path.resolve(abiPath), "utf8");
  return JSON.parse(abiJson);
}

async function fetchAbiFromEtherscan(
  hre: HardhatRuntimeEnvironment,
  contractAddress: string
): Promise<any> {
  const network = hre.network.name;
  const apiKey = process.env.ETHERSCAN_API_KEY;
  if (!apiKey) {
    throw new Error("ETHERSCAN_API_KEY environment variable not set");
  }

  const apiUrl = `https://api${network !== "mainnet" ? `-${network}` : ""}.etherscan.io/api`;

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

async function getContractCreationBlock(
  hre: HardhatRuntimeEnvironment,
  contractAddress: string
): Promise<number> {
  try {
    const network = hre.network.name;
    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      throw new Error("ETHERSCAN_API_KEY environment variable not set");
    }

    const apiUrl = `https://api${network !== "mainnet" ? `-${network}` : ""}.etherscan.io/api`;

    const response = await axios.get(apiUrl, {
      params: {
        module: "contract",
        action: "getcontractcreation",
        contractaddresses: contractAddress,
        apikey: apiKey,
      },
    });

    if (response.data.status === "1" && response.data.result && response.data.result.length > 0) {
      const txHash = response.data.result[0].txHash;
      const tx = await hre.ethers.provider.getTransaction(txHash);
      if (tx && tx.blockNumber) {
        return tx.blockNumber;
      }
    }

    console.log("Could not determine contract creation block, using block 0 as default");
    return 0;
  } catch (error) {
    console.error("Error determining contract creation block:", error);
    return 0;
  }
}

function createContract(
  hre: HardhatRuntimeEnvironment,
  contractAddress: string,
  contractAbi: any
) {
  const provider = hre.ethers.provider;
  return new hre.ethers.Contract(contractAddress, contractAbi, provider);
}

async function getEventLogs(
  contract: Contract,
  eventName: string,
  fromBlock: number,
  toBlock: number
): Promise<(EventLog | Log)[]> {
  if (!contract.filters[eventName]) {
    throw new Error(`Event ${eventName} not found in contract ABI`);
  }

  const filter = contract.filters[eventName]();

  // If either block is non-numeric or the range is small enough, do a single query
  if (toBlock - fromBlock <= MAX_BLOCK_RANGE) {
    return contract.queryFilter(filter, fromBlock, toBlock);
  }

  // Otherwise, split into chunks and query in parallel
  console.log(`Block range too large (${fromBlock} to ${toBlock}), splitting into chunks...`);

  const chunks: Array<{ from: number, to: number }> = [];
  let current = fromBlock as number;

  while (current < (toBlock as number)) {
    // Calculate the end of this chunk (keeping within MAX_BLOCK_RANGE)
    const end = Math.min(current + MAX_BLOCK_RANGE - 1, toBlock as number);
    chunks.push({ from: current, to: end });
    current = end + 1;
  }

  console.log(`Querying ${chunks.length} chunks of blocks in parallel...`);

  const chunkResults = await Promise.all(
    chunks.map(chunk =>
      contract.queryFilter(filter, chunk.from, chunk.to)
        .catch(error => {
          console.error(`Error querying blocks ${chunk.from}-${chunk.to}: ${error.message}`);
          return [];
        })
    )
  );

  // Flatten results from all chunks
  const allLogs = chunkResults.flat();
  console.log(`Retrieved ${allLogs.length} total events across all chunks`);

  return allLogs;
}

async function processLog(
  log: EventLog | Log,
  provider: any,
  eventName: string
): Promise<EventData> {
  const tx = await provider.getTransaction(log.transactionHash);
  const block = await provider.getBlock(log.blockNumber);

  if (!tx || !block) {
    throw new Error(`Failed to fetch transaction or block data for tx ${log.transactionHash}`);
  }

  // Get the args object
  let decodedArgs: Record<string, any> = {}; // Use Record<string, any> to allow string indexing
  if (log instanceof EventLog) {
    try {
      // Try to use the toObject method first
      decodedArgs = log.args.toObject();
    } catch (e) {
      // Fallback to manual extraction
      Object.keys(log.args)
        .filter(key => isNaN(Number(key))) // Filter out numeric keys
        .forEach(key => {
          decodedArgs[key] = log.args[key];
        });
    }
  }

  // Convert any BigInt values to strings in the result object
  const processedArgs = Object.entries(decodedArgs).reduce<Record<string, any>>((result, [key, value]) => {
    result[key] = typeof value === 'bigint' ? value.toString() : value;
    return result;
  }, {});

  return {
    transactionHash: log.transactionHash,
    eventName,
    timestamp: new Date(block.timestamp * 1000).toISOString(),
    sender: tx.from,
    eventParameters: processedArgs,
  };
}

task("find-events", "Find events emitted by a smart contract")
  .addParam("address", "The smart contract address")
  .addParam("event", "The event name to filter")
  .addOptionalParam("abi", "Path to the ABI file (optional)")
  .addOptionalParam("fromBlock", "Starting block number for event search (optional)")
  .addOptionalParam("toBlock", "Ending block number for event search (optional)")
  .setAction(async (taskArgs: FindEventsTaskArgs, hre: HardhatRuntimeEnvironment) => {
    const { address: contractAddress, event: eventName, abi: abiPath, fromBlock: fromBlockArg, toBlock: toBlockArg } = taskArgs;
    console.log(`Searching for ${eventName} events from contract ${contractAddress}...`);

    const provider = hre.ethers.provider;
    let contractAbi: any;

    if (abiPath) {
      contractAbi = await loadAbiFromFile(abiPath);
    } else {
      console.log("No ABI provided, attempting to fetch from Etherscan...");
      try {
        contractAbi = await fetchAbiFromEtherscan(hre, contractAddress);
      } catch (error) {
        console.error("Failed to fetch ABI:", error);
        throw new Error("Please provide an ABI file with --abi option");
      }
    }

    // Parse block parameters
    let fromBlock: number | string;
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
      fromBlock = await getContractCreationBlock(hre, contractAddress);
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
        const finalizedBlock = await provider.getBlock('finalized')
          .catch(() => provider.getBlock('latest'));

        if (!finalizedBlock || typeof finalizedBlock.number !== 'number') {
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

    const contract = createContract(hre, contractAddress, contractAbi);
    const logs = await getEventLogs(contract, eventName, fromBlock, toBlock);

    const results: EventData[] = await Promise.all(
      logs.map((log) => processLog(log, provider, eventName))
    );

    const outputPath = path.join(
      process.cwd(),
      `events-${contractAddress.substring(0, 8)}-${eventName}.json`
    );
    fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
    console.log(`Found ${results.length} events. Results written to ${outputPath}`);
  });

export { };