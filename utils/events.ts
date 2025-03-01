import { EventLog, Log } from "ethers";

export interface EventData {
  transactionHash: string;
  eventName: string;
  timestamp: string;
  sender: string;
  eventParameters: any;
}

export async function processLog(
  log: EventLog | Log,
  provider: any,
  eventName: string
): Promise<EventData> {
  const tx = await provider.getTransaction(log.transactionHash);
  const block = await provider.getBlock(log.blockNumber);

  if (!tx || !block) {
    throw new Error(`Failed to fetch transaction or block data for tx ${log.transactionHash}`);
  }

  // Get the args object
  let decodedArgs: Record<string, any> = {};
  if (log instanceof EventLog) {
    try {
      // Try to use the toObject method first
      decodedArgs = log.args.toObject();
    } catch (e) {
      // Fallback to manual extraction
      Object.keys(log.args)
        .filter(key => isNaN(Number(key))) // Filter out numeric keys
        .forEach(key => {
          decodedArgs[key] = log.args[key];
        });
    }
  }

  // Convert any BigInt values to strings in the result object
  const processedArgs = Object.entries(decodedArgs).reduce<Record<string, any>>((result, [key, value]) => {
    result[key] = typeof value === 'bigint' ? value.toString() : value;
    return result;
  }, {});

  return {
    transactionHash: log.transactionHash,
    eventName,
    timestamp: new Date(block.timestamp * 1000).toISOString(),
    sender: tx.from,
    eventParameters: processedArgs,
  };
}