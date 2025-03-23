import { expect } from "chai";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import hre from "hardhat";

// Constants
const TEST_CONTRACT_ADDRESS = "0x7EA3097E2AF59eA705398544e0f58EdDb7bd1852"; // AccessManager from OpenZeppelin

describe("Find Creation Block Task", function() {
  this.timeout(60000); // Set a longer timeout for network operations

  let signer: HardhatEthersSigner;

  before(async function() {
    // Get a signer from hardhat
    [signer] = await ethers.getSigners();
  });

  it("should find the creation block and transaction hash for a contract", async function() {
    // Execute the task and observe console output
    // We're not capturing the output as the task logs directly, but we're checking it doesn't throw
    await hre.run("find-creation-block", {
      address: TEST_CONTRACT_ADDRESS
    });

    // Additional validation: manually call getContractCreationBlock and check it returns proper data
    const contracts = await import("../utils/contracts");
    const creationInfo = await contracts.getContractCreationBlock(hre, TEST_CONTRACT_ADDRESS);
    
    // Verify creation block is a positive number
    expect(creationInfo.blockNumber).to.be.a("number");
    expect(creationInfo.blockNumber).to.be.greaterThan(0);
    
    // Verify transaction hash if available
    if (creationInfo.txHash) {
      expect(creationInfo.txHash).to.be.a("string");
      expect(creationInfo.txHash).to.match(/^0x[a-fA-F0-9]{64}$/);
    }
  });
});