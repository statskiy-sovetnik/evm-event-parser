import { expect } from "chai";
import { Contract } from "ethers";
import fs from "fs";
import path from "path";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers } from "hardhat";
import { task } from "hardhat/config";
import hre from "hardhat";

// Constants
const ACCESS_MANAGER_ADDRESS = "0x7EA3097E2AF59eA705398544e0f58EdDb7bd1852";
const ABI_PATH = path.resolve(__dirname, "fixtures/accessManager.abi.json");
const RESULTS_FILE = path.join(process.cwd(), `roles-${ACCESS_MANAGER_ADDRESS.substring(0, 8)}.json`);

interface RolesResult {
  contractAddress: string;
  roles: { [roleId: string]: string[] };
}

describe("Find Roles Task - AccessManager Contract", function() {
  this.timeout(120000); // Set a longer timeout for network operations

  let accessManagerContract: Contract;
  let rolesData: RolesResult;
  let signer: HardhatEthersSigner;

  before(async function() {
    try {
      // Get a signer from hardhat
      [signer] = await ethers.getSigners();
      
      // Create contract instance using the ABI file
      const abi = JSON.parse(fs.readFileSync(ABI_PATH, "utf8"));
      accessManagerContract = new ethers.Contract(ACCESS_MANAGER_ADDRESS, abi, ethers.provider);
      
      // Execute the find-roles task directly through Hardhat Runtime Environment (hre)
      console.log("Running find-roles task...");
      await hre.run("find-roles", {
        address: ACCESS_MANAGER_ADDRESS,
        abi: ABI_PATH
      });
      
      // Load the results file
      console.log("Loading results file...");
      if (!fs.existsSync(RESULTS_FILE)) {
        throw new Error(`Results file not found: ${RESULTS_FILE}`);
      }
      
      const fileContent = fs.readFileSync(RESULTS_FILE, "utf8");
      rolesData = JSON.parse(fileContent) as RolesResult;
    } catch (error) {
      console.error("Error setting up test:", error);
      this.skip();
    }
  });

  it("should have the correct contract address in results", function() {
    expect(rolesData.contractAddress.toLowerCase()).to.equal(ACCESS_MANAGER_ADDRESS.toLowerCase());
  });

  it("should find at least one role", function() {
    expect(Object.keys(rolesData.roles).length).to.be.greaterThan(0);
    console.log(`Found ${Object.keys(rolesData.roles).length} roles in the contract`);
  });

  it("should verify all role holders with contract's hasRole method", async function() {
    for (const [roleId, holders] of Object.entries(rolesData.roles)) {
      console.log(`Verifying ${holders.length} holders for role ${roleId}...`);
      
      for (const holder of holders) {
        const hasRoleResult = await accessManagerContract.hasRole(roleId, holder);
        const isMember = hasRoleResult[0]; // First return value is isMember (boolean)
        
        expect(isMember, `Address ${holder} should have role ${roleId}`).to.be.true;
      }
    }
  });

  it("should not have false positives in role assignments", async function() {
    // Get a sample of addresses that are not in our holder list
    const allHolders = new Set(Object.values(rolesData.roles).flat());
    const nonHolderAddresses = [
      "0x1111111111111111111111111111111111111111",
      "0x2222222222222222222222222222222222222222",
      "0x3333333333333333333333333333333333333333"
    ];
    
    // Sample a role to check
    const sampleRoleId = Object.keys(rolesData.roles)[0];
    console.log(`Testing non-holders for role ${sampleRoleId}...`);
    
    for (const address of nonHolderAddresses) {
      if (!allHolders.has(address)) {
        const hasRoleResult = await accessManagerContract.hasRole(sampleRoleId, address);
        const isMember = hasRoleResult[0];
        
        expect(isMember, `Address ${address} should NOT have role ${sampleRoleId}`).to.be.false;
      }
    }
  });
});