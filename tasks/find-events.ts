import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import { EventLog, Log } from "ethers";
import dotenv from "dotenv";
import {
  createContract,
  fetchContractAbi,
  getBlockParams,
  getEventLogs,
  loadAbiFromFile,
  getAlternativeRpcUrl,
} from "../utils/contracts";
import { EventData, processLog } from "../utils/events";

dotenv.config();

interface FindEventsTaskArgs {
  address: string;
  event: string;
  abi?: string;
  fromBlock?: string; // Optional starting block number
  toBlock?: string; // Optional ending block number
}

task("find-events", "Find events emitted by a smart contract")
  .addParam("address", "The smart contract address")
  .addParam("event", "The event name to filter")
  .addOptionalParam("abi", "Path to the ABI file (optional)")
  .addOptionalParam(
    "fromBlock",
    "Starting block number for event search (optional)"
  )
  .addOptionalParam(
    "toBlock",
    "Ending block number for event search (optional)"
  )
  .setAction(
    async (taskArgs: FindEventsTaskArgs, hre: HardhatRuntimeEnvironment) => {
      const {
        address: contractAddress,
        event: eventName,
        abi: abiPath,
        fromBlock: fromBlockArg,
        toBlock: toBlockArg,
      } = taskArgs;
      console.log(
        `Searching for ${eventName} events from contract ${contractAddress}...`
      );

      const provider = hre.ethers.provider;
      let contractAbi: any;

      if (abiPath) {
        contractAbi = await loadAbiFromFile(abiPath);
      } else {
        console.log(
          "No ABI provided, attempting to fetch from block explorer..."
        );
        try {
          contractAbi = await fetchContractAbi(hre, contractAddress);
        } catch (error) {
          console.error("Failed to fetch ABI:", error);
          throw new Error("Please provide an ABI file with --abi option");
        }
      }

      // Get block parameters
      const { fromBlock, toBlock } = await getBlockParams(
        hre,
        contractAddress,
        fromBlockArg,
        toBlockArg
      );

      const contract = createContract(hre, contractAddress, contractAbi);
      const logs = await getEventLogs(contract, eventName, fromBlock, toBlock, hre);

      // Get alternative RPC URL for retry logic
      const alternativeRpc = getAlternativeRpcUrl(hre);

      const results: EventData[] = await Promise.all(
        logs.map((log) => processLog(log, provider, eventName, alternativeRpc))
      );

      const outputPath = path.join(
        process.cwd(),
        `events-${contractAddress.substring(0, 8)}-${eventName}.json`
      );
      fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
      console.log(
        `Found ${results.length} events. Results written to ${outputPath}`
      );
    }
  );

export {};
