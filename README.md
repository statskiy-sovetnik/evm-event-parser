# EVM event parser

## Features
- Find events emitted by a smart contract
- Find role holders for contracts implementing OpenZeppelin's AccessControl
- Find creation block and transaction hash for any smart contract

## Usage - Find Events
You can run the find-events task from the command line using Hardhat like this:
``` shell
npx hardhat find-events --address 0xYourContractAddress --event YourEventName --abi ./path/to/your/abi.json --network arbitrum
```

For example, if you're looking for a "Transfer" event on a contract at address 0xABC123... and you have an ABI file at "./abi/MyContract.json":
``` shell
npx hardhat find-events --address 0xABC123456789012345678901234567890ABC1234 --event Transfer --abi ./abi/MyContract.json --network arbitrum
```

If you don't have an ABI file, simply omit the --abi parameter:
``` shell
npx hardhat find-events --address 0xABC123456789012345678901234567890ABC1234 --event Transfer
```

### Optional Block Range Parameters
You can specify a custom block range to search using the `--fromBlock` and `--toBlock` parameters:
``` shell
npx hardhat find-events --address 0xABC123456789012345678901234567890ABC1234 --event Transfer --fromBlock 15000000 --toBlock 16000000
```
Both parameters are optional:

If fromBlock is omitted, the search will start from the contract's creation block
If toBlock is omitted, the search will end at the latest finalized block

## Usage - Find Role Holders
For contracts that implement OpenZeppelin's AccessControl, you can find all roles and their current holders:

``` shell
npx hardhat find-roles --address 0xYourContractAddress --network arbitrum
```

This task:
1. Retrieves all RoleGranted and RoleRevoked events
2. Processes them to determine current role holders
3. Attempts to identify common role names (DEFAULT_ADMIN_ROLE, PAUSER_ROLE, etc.)
4. Outputs results to a JSON file with role IDs, names, and current holders

### Optional Parameters
The same optional parameters as find-events are supported:
- `--abi` - Path to the contract ABI file
- `--fromBlock` - Starting block for event search
- `--toBlock` - Ending block for event search

## Testing
The repository includes tests to verify the functionality of the tasks. The tests use Hardhat's testing framework and can be run with:

```shell
# Run all tests
npm test

# Run specific test for the find-roles task
npm run test:roles -- --network mainnet
```

The find-roles test verifies the task against a real OpenZeppelin AccessManager contract on Ethereum mainnet. It confirms that:
1. The task correctly identifies all roles in the contract
2. All reported role holders actually have their assigned roles (verified with `hasRole()` call)
3. No false positives are reported

## Usage - Find Creation Block
You can find the creation block and transaction hash for any smart contract:

``` shell
npx hardhat find-creation-block --address 0xYourContractAddress --network arbitrum
```

This task:
1. Searches for the transaction that created the contract
2. Returns the creation block number, transaction hash, and creator address
3. Works with contracts on all supported explorers (Etherscan, Blockscout)

This information is useful for:
- Setting an optimal starting block for event searches
- Analyzing contract deployment information
- Determining who originally deployed a contract

## Supported networks
- Ethereum mainnet
- Arbitrum one
- Polygon mainnet
- Flare
- BNB

## Adding a network
To add support for a new network:

1. Add RPC url to `network.ts`
2. Update hardhat.config


