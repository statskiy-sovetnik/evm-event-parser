# EVM event parser

## Usage
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


