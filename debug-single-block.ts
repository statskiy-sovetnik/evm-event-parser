import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { getRPCUrls, Network } from "./utils/networks";

dotenv.config();

/**
 * Simple debug script to test querying blocks
 * Usage: npx ts-node debug-single-block.ts <address> <event-name> <from-block> [to-block]
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.error("Usage: npx ts-node debug-single-block.ts <address> <event-name> <from-block> [to-block]");
    console.error("Example: npx ts-node debug-single-block.ts 0x1234... RoleGranted 20579150");
    console.error("If to-block is not provided, queries from-block + 99 (100 blocks total)");
    process.exit(1);
  }

  const [contractAddress, eventName, fromBlockStr, toBlockStr] = args;
  const fromBlock = parseInt(fromBlockStr);
  const toBlock = toBlockStr ? parseInt(toBlockStr) : fromBlock + 99;

  console.log("=== Debug Block Query ===");
  console.log(`Contract: ${contractAddress}`);
  console.log(`Event: ${eventName}`);
  console.log(`Block range: ${fromBlock} to ${toBlock} (${toBlock - fromBlock + 1} blocks)`);
  console.log("");

  // Get Alchemy API key
  const alchemyApiKey = process.env.ALCHEMY_API_KEY;
  if (!alchemyApiKey) {
    console.error("ERROR: ALCHEMY_API_KEY not found in .env");
    process.exit(1);
  }

  // Get RPC URLs for Ethereum mainnet
  const rpcUrls = getRPCUrls(Network.Ethereum, alchemyApiKey);
  console.log(`Primary RPC: ${rpcUrls[0].substring(0, 50)}...`);
  console.log(`Alternative RPC: ${rpcUrls[1] || "none"}`);
  console.log("");

  // Create provider
  console.log("Creating provider...");
  const provider = new ethers.JsonRpcProvider(rpcUrls[0]);

  // Test basic connectivity
  console.log("Testing connectivity...");
  try {
    const blockInfo = await provider.getBlock(fromBlock);
    console.log(`✓ Successfully fetched block info for block ${fromBlock}`);
    console.log(`  Block timestamp: ${new Date(blockInfo!.timestamp * 1000).toISOString()}`);
    console.log(`  Block hash: ${blockInfo!.hash}`);
  } catch (error: any) {
    console.error(`✗ Failed to fetch block info: ${error.message}`);
    process.exit(1);
  }
  console.log("");

  // Load ABI from ./abi.json
  console.log("Loading ABI from ./abi.json...");
  const abiPath = path.resolve("./abi.json");

  let abi: any;
  try {
    const abiJson = fs.readFileSync(abiPath, "utf8");
    abi = JSON.parse(abiJson);
    console.log(`✓ Successfully loaded ABI (${abi.length} entries)`);
  } catch (error: any) {
    console.error(`✗ Failed to load ABI from ./abi.json: ${error.message}`);
    process.exit(1);
  }

  // Check if event exists
  const eventAbi = abi.find((item: any) => item.type === "event" && item.name === eventName);
  if (!eventAbi) {
    console.error(`✗ Event "${eventName}" not found in ABI`);
    process.exit(1);
  }
  console.log(`✓ Found event "${eventName}" in ABI`);
  console.log("");

  // Create contract
  console.log("Creating contract instance...");
  const contract = new ethers.Contract(contractAddress, abi, provider);
  console.log(`✓ Contract instance created`);
  console.log("");

  // Try to query the block range
  console.log(`Querying event "${eventName}" for blocks ${fromBlock}-${toBlock}...`);
  console.log(`Query range: ${fromBlock} to ${toBlock} (${toBlock - fromBlock + 1} blocks)`);

  const startTime = Date.now();
  try {
    const filter = contract.filters[eventName]();
    console.log(`Filter created: ${JSON.stringify(filter)}`);

    console.log("Executing queryFilter...");
    const logs = await contract.queryFilter(filter, fromBlock, toBlock);
    const duration = Date.now() - startTime;

    console.log("");
    console.log("=== SUCCESS ===");
    console.log(`✓ Query completed in ${duration}ms`);
    console.log(`✓ Found ${logs.length} event(s)`);

    if (logs.length > 0) {
      console.log("");
      console.log("Event details:");
      logs.forEach((log, index) => {
        console.log(`\nEvent ${index + 1}:`);
        console.log(`  Transaction: ${log.transactionHash}`);
        console.log(`  Block: ${log.blockNumber}`);
        if (log instanceof ethers.EventLog) {
          console.log(`  Args:`, log.args.toObject());
        }
      });
    }
  } catch (error: any) {
    const duration = Date.now() - startTime;
    console.log("");
    console.log("=== FAILURE ===");
    console.log(`✗ Query failed after ${duration}ms`);
    console.log(`Error message: ${error.message}`);
    console.log(`Error code: ${error.code || "none"}`);
    console.log(`Error stack:\n${error.stack}`);
    process.exit(1);
  }
}

main();
