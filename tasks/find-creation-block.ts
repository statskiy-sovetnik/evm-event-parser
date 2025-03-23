import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import dotenv from "dotenv";
import { getContractCreationBlock } from "../utils/contracts";
import { logger } from "../utils/logger";

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
          
          // Fetch additional transaction details
          const tx = await hre.ethers.provider.getTransaction(creationInfo.txHash);
          if (tx) {
            logger.info(`Creator address: ${tx.from}`, 1);
            logger.info(`Creation time: ${new Date((await hre.ethers.provider.getBlock(tx.blockNumber!))!.timestamp * 1000).toISOString()}`, 1);
          }
        }
      } catch (error) {
        logger.error("Error determining contract creation information", error);
      }
    }
  );

export {};