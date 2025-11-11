import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import dotenv from "dotenv";
import { getAlternativeRpcUrl } from "../utils/contracts";
import { withProviderRetry, createProviderOperation } from "../utils/retry";

dotenv.config();

// The storage slot where the admin is stored for transparent proxy contracts
// keccak256("eip1967.proxy.admin") - 1
const ADMIN_SLOT = "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103";

// This is the implementation slot
// keccak256("eip1967.proxy.implementation") - 1
const IMPLEMENTATION_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

interface GetProxyAdminTaskArgs {
  address: string;
}

task("get-proxy-admin", "Read the admin address from a transparent proxy contract")
  .addParam("address", "The proxy contract address")
  .setAction(async (taskArgs: GetProxyAdminTaskArgs, hre: HardhatRuntimeEnvironment) => {
    const { address: proxyAddress } = taskArgs;
    console.log(`Reading proxy admin for contract ${proxyAddress} on ${hre.network.name}...`);

    const provider = hre.ethers.provider;
    const alternativeRpc = getAlternativeRpcUrl(hre);

    try {
      // Get the admin address from storage
      const adminStorageData = await withProviderRetry(
        createProviderOperation(provider, (p) =>
          p.getStorage(proxyAddress, ADMIN_SLOT)
        ),
        alternativeRpc,
        `Get storage at ${ADMIN_SLOT}`
      );
      const adminAddress = "0x" + adminStorageData.slice(26); // Convert to address format

      // Get the implementation address from storage
      const implementationStorageData = await withProviderRetry(
        createProviderOperation(provider, (p) =>
          p.getStorage(proxyAddress, IMPLEMENTATION_SLOT)
        ),
        alternativeRpc,
        `Get storage at ${IMPLEMENTATION_SLOT}`
      );
      const implementationAddress = "0x" + implementationStorageData.slice(26); // Convert to address format

      // Check if this looks like an address (correct length and non-zero)
      if (adminAddress.length === 42 && adminAddress !== "0x0000000000000000000000000000000000000000") {
        console.log(`\nProxy Admin Address: ${adminAddress}`);
        
        if (implementationAddress.length === 42 && implementationAddress !== "0x0000000000000000000000000000000000000000") {
          console.log(`Implementation Address: ${implementationAddress}`);
        } else {
          console.log(`Could not determine the implementation address (not a proxy or different proxy pattern)`);
        }

        // Output in JSON format
        const result = {
          proxyAddress,
          adminAddress,
          implementationAddress: implementationAddress.length === 42 && 
                                 implementationAddress !== "0x0000000000000000000000000000000000000000" 
                                 ? implementationAddress 
                                 : null,
          network: hre.network.name
        };
        
        console.log("\nJSON Output:");
        console.log(JSON.stringify(result, null, 2));
        
        return result;
      } else {
        console.log(`Contract at ${proxyAddress} does not appear to be a transparent proxy (no admin found).`);
      }
    } catch (error) {
      console.error("Error reading proxy admin:", error);
      throw new Error(`Failed to read proxy admin for ${proxyAddress}`);
    }
  });

export { };