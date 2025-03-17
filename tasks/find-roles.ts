import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import {
  createContract,
  fetchContractAbi,
  getBlockParams,
  getEventLogs,
  loadAbiFromFile,
} from "../utils/contracts";
import { EventData, processLog } from "../utils/events";
import { Contract } from "ethers";

dotenv.config();

interface FindRolesTaskArgs {
  address: string;
  abi?: string;
  fromBlock?: string;
  toBlock?: string;
}

interface RoleHoldersResult {
  contractAddress: string;
  roles: { [roleNameOrId: string]: string[] };
}

// Common role IDs from OpenZeppelin's AccessControl
const KNOWN_ROLES: { [key: string]: string } = {
  "0x0000000000000000000000000000000000000000000000000000000000000000":
    "DEFAULT_ADMIN_ROLE",
  "0x65d7a28e3265b37a6474929f336521b332c1681b933f6cb9f3376673440d862a":
    "PAUSER_ROLE",
  "0x9f2df0fed2c77648de5860a4cc508cd0818c85b8b8a1ab4ceeef8d981c8956a6":
    "MINTER_ROLE",
  "0xd83740310a408b03a53117fdd07e226c91fa1daa4d57713b36cc45eccac04b43":
    "UPGRADER_ROLE",
};

function tryIdentifyRoleName(
  roleId: string,
  contract: Contract
): string | undefined {
  // Check if it's a known role
  if (KNOWN_ROLES[roleId]) {
    return KNOWN_ROLES[roleId];
  }

  // For AccessManager, try to identify standard roles
  try {
    // Add mappings for AccessManager's built-in roles if available
    // Note: These are non-async checks to keep function synchronous
    if (contract.ADMIN_ROLE && contract.ADMIN_ROLE.toString() === roleId) {
      return "ADMIN_ROLE";
    }

    if (contract.PUBLIC_ROLE && contract.PUBLIC_ROLE.toString() === roleId) {
      return "PUBLIC_ROLE";
    }
  } catch (error) {
    // Silently fail
  }

  return undefined;
}

task(
  "find-roles",
  "Find all roles and their holders for an AccessControl contract"
)
  .addParam("address", "The smart contract address")
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
    async (taskArgs: FindRolesTaskArgs, hre: HardhatRuntimeEnvironment) => {
      const {
        address: contractAddress,
        abi: abiPath,
        fromBlock: fromBlockArg,
        toBlock: toBlockArg,
      } = taskArgs;
      console.log(`Analyzing roles for contract ${contractAddress}...`);

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

      // Verify that this contract has the expected AccessControl events
      const hasRoleGrantedEvent = contractAbi.some(
        (item: any) => item.type === "event" && item.name === "RoleGranted"
      );

      const hasRoleRevokedEvent = contractAbi.some(
        (item: any) => item.type === "event" && item.name === "RoleRevoked"
      );

      if (!hasRoleGrantedEvent || !hasRoleRevokedEvent) {
        throw new Error(
          "Contract does not implement AccessControl interface. Missing RoleGranted/RoleRevoked events."
        );
      }

      // Retrieve both RoleGranted and RoleRevoked events
      console.log("Fetching RoleGranted events...");
      const grantedLogs = await getEventLogs(
        contract,
        "RoleGranted",
        fromBlock,
        toBlock,
        hre
      );

      console.log("Fetching RoleRevoked events...");
      const revokedLogs = await getEventLogs(
        contract,
        "RoleRevoked",
        fromBlock,
        toBlock,
        hre
      );

      // Process the events
      const grantedEvents: EventData[] = await Promise.all(
        grantedLogs.map((log) => processLog(log, provider, "RoleGranted"))
      );

      const revokedEvents: EventData[] = await Promise.all(
        revokedLogs.map((log) => processLog(log, provider, "RoleRevoked"))
      );

      console.log(
        `Found ${grantedEvents.length} RoleGranted events and ${revokedEvents.length} RoleRevoked events.`
      );

      // Create a map to track role assignments
      // Format: roleId -> { account -> boolean }
      const roleHolders: { [roleId: string]: { [account: string]: boolean } } =
        {};

      // Process granted roles
      for (const event of grantedEvents) {
        // Handle both AccessControl (role) and AccessManager (roleId) implementations
        const roleIdentifier =
          event.eventParameters.role || event.eventParameters.roleId;
        const account = event.eventParameters.account;

        if (!roleIdentifier || !account) {
          console.warn(
            `Missing role identifier or account in event: ${JSON.stringify(
              event
            )}`
          );
          continue;
        }

        if (!roleHolders[roleIdentifier]) {
          roleHolders[roleIdentifier] = {};
        }

        roleHolders[roleIdentifier][account] = true;
      }

      // Process revoked roles
      for (const event of revokedEvents) {
        // Handle both AccessControl (role) and AccessManager (roleId) implementations
        const roleIdentifier =
          event.eventParameters.role || event.eventParameters.roleId;
        const account = event.eventParameters.account;

        if (!roleIdentifier || !account) {
          console.warn(
            `Missing role identifier or account in event: ${JSON.stringify(
              event
            )}`
          );
          continue;
        }

        if (
          roleHolders[roleIdentifier] &&
          roleHolders[roleIdentifier][account]
        ) {
          roleHolders[roleIdentifier][account] = false;
        }
      }

      // New format: map role names/ids to holders
      const roleMap: { [roleNameOrId: string]: string[] } = {};

      for (const roleId in roleHolders) {
        // Attempt to identify the role name
        const roleName = tryIdentifyRoleName(roleId, contract);

        // Get active role holders
        const holders = Object.entries(roleHolders[roleId])
          .filter(([_, hasRole]) => hasRole)
          .map(([account]) => account);

        // Use roleName if available, otherwise use roleId
        const key = roleName || roleId;
        roleMap[key] = holders;
      }

      // Final result structure
      const result = {
        contractAddress,
        roles: roleMap,
      };

      const outputPath = path.join(
        process.cwd(),
        `roles-${contractAddress.substring(0, 8)}.json`
      );

      fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
      const roleCount = Object.keys(result.roles).length;
      console.log(
        `Analysis complete. Found ${roleCount} roles. Results written to ${outputPath}`
      );
    }
  );

export {};
