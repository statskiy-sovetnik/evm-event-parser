import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import dotenv from "dotenv";

dotenv.config();

interface ReadSlotTaskArgs {
  address: string;
  slot: string;
}

task("read-slot", "Read a storage slot from a contract")
  .addParam("address", "The contract address")
  .addParam("slot", "The storage slot to read (decimal or hex format)")
  .setAction(async (taskArgs: ReadSlotTaskArgs, hre: HardhatRuntimeEnvironment) => {
    const { address, slot } = taskArgs;
    
    // Convert the slot to hex format if it's not already
    let slotHex: string;
    if (slot.startsWith("0x")) {
      slotHex = slot;
    } else {
      // Assume it's a decimal number and convert to hex
      try {
        slotHex = "0x" + BigInt(slot).toString(16);
      } catch (error) {
        throw new Error(`Invalid slot format. Must be decimal or hex: ${error}`);
      }
    }
    
    console.log(`Reading storage slot ${slotHex} from contract ${address} on ${hre.network.name}...`);

    const provider = hre.ethers.provider;

    try {
      // Get the data from the specified storage slot
      const storageData = await provider.getStorage(address, slotHex);
      
      console.log(`\nRaw Storage Data: ${storageData}`);
      
      // Parse different interpretations of the data
      const asAddress = "0x" + storageData.slice(26);
      const asBigInt = BigInt(storageData);
      const asDecimal = asBigInt.toString();
      const asHex = storageData;
      
      // Output all interpretations
      console.log("\nData Interpretations:");
      console.log(`- As Address: ${asAddress}`);
      console.log(`- As Decimal: ${asDecimal}`);
      console.log(`- As Hex: ${asHex}`);
      
      // Try to detect if it looks like an address
      if (asAddress.length === 42 && asAddress !== "0x0000000000000000000000000000000000000000") {
        console.log("\nDetected value appears to be an address");
      }
      
      // Output in JSON format
      const result = {
        contractAddress: address,
        slot: slotHex,
        storageData,
        interpretations: {
          asAddress,
          asDecimal,
          asHex
        },
        network: hre.network.name
      };
      
      console.log("\nJSON Output:");
      console.log(JSON.stringify(result, null, 2));
      
      return result;
    } catch (error) {
      console.error("Error reading storage slot:", error);
      throw new Error(`Failed to read storage slot ${slotHex} from ${address}`);
    }
  });

export { };