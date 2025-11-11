import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import dotenv from "dotenv";
import {
  getContractCreationBlock,
  getAlternativeRpcUrl,
} from "../utils/contracts";
import { logger } from "../utils/logger";
import { withProviderRetry, createProviderOperation } from "../utils/retry";

dotenv.config();

interface FindCreationBlockTaskArgs {
  address: string;
}

task(
  "find-creation-block",
  "Find the creation block and transaction hash for a smart contract"
)
  .addParam("address", "The smart contract address")
  .setAction(
    async (taskArgs: FindCreationBlockTaskArgs, hre: HardhatRuntimeEnvironment) => {
      const { address: contractAddress } = taskArgs;
      
      logger.section("Contract Creation Analysis");
      logger.info(`Searching for creation block of contract ${contractAddress}...`);

      try {
        const creationInfo = await getContractCreationBlock(hre, contractAddress);

        logger.section("Results");
        if (creationInfo.blockNumber === 0 && !creationInfo.txHash) {
          logger.warn("Contract creation information could not be determined");
          return;
        }

        logger.success(`Contract creation block: ${creationInfo.blockNumber}`);

        if (creationInfo.txHash) {
          logger.info(`Creation transaction hash: ${creationInfo.txHash}`, 1);

          // Get alternative RPC URL for retry logic
          const alternativeRpc = getAlternativeRpcUrl(hre);

          // Fetch additional transaction details
          const tx = await withProviderRetry(
            createProviderOperation(hre.ethers.provider, (p) =>
              p.getTransaction(creationInfo.txHash!)
            ),
            alternativeRpc,
            `Get transaction ${creationInfo.txHash}`
          );

          if (tx && tx.blockNumber) {
            logger.info(`Creator address: ${tx.from}`, 1);

            const block = await withProviderRetry(
              createProviderOperation(hre.ethers.provider, (p) =>
                p.getBlock(tx.blockNumber!)
              ),
              alternativeRpc,
              `Get block ${tx.blockNumber}`
            );

            if (block) {
              logger.info(
                `Creation time: ${new Date(block.timestamp * 1000).toISOString()}`,
                1
              );
            }
          }
        }
      } catch (error) {
        logger.error("Error determining contract creation information", error);
      }
    }
  );

export {};