import { ethers } from "ethers";
import { AxiosResponse } from "axios";
import { logger } from "./logger";

/**
 * Retry configuration
 */
const RETRY_DELAY_MS = 1000; // 1 second delay before retry

/**
 * Delay helper function
 * @param ms - Milliseconds to delay
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wraps an ethers provider operation with retry logic using alternative RPC
 * @param operation - Function that performs the provider operation
 * @param alternativeRpcUrl - Alternative RPC URL to use on retry (if available)
 * @param operationName - Name of the operation for logging purposes
 * @returns Result of the operation
 */
export async function withProviderRetry<T>(
  operation: (provider: ethers.Provider) => Promise<T>,
  alternativeRpcUrl: string | undefined,
  operationName: string
): Promise<T> {
  try {
    // Try with the current provider (primary RPC)
    const provider = operation.length > 0 ? (operation as any).provider : undefined;
    const result = await operation(provider);
    return result;
  } catch (primaryError: any) {
    // If no alternative RPC is available, throw the error
    if (!alternativeRpcUrl) {
      logger.error(`${operationName} failed (no alternative RPC available): ${primaryError.message}`);
      throw primaryError;
    }

    // Log the primary failure and retry attempt
    logger.warn(`${operationName} failed with primary RPC: ${primaryError.message}`);
    logger.info(`Retrying ${operationName} with alternative RPC after ${RETRY_DELAY_MS}ms...`);

    // Wait before retry
    await delay(RETRY_DELAY_MS);

    try {
      // Create a new provider with the alternative RPC
      const alternativeProvider = new ethers.JsonRpcProvider(alternativeRpcUrl);
      const result = await operation(alternativeProvider);
      logger.success(`${operationName} succeeded with alternative RPC`);
      return result;
    } catch (alternativeError: any) {
      logger.error(`${operationName} failed with alternative RPC: ${alternativeError.message}`);
      // Throw the alternative error as it's the final attempt
      throw alternativeError;
    }
  }
}

/**
 * Wraps an HTTP/Axios operation with retry logic
 * @param operation - Function that performs the HTTP operation
 * @param operationName - Name of the operation for logging purposes
 * @returns Result of the operation
 */
export async function withHttpRetry<T = any>(
  operation: () => Promise<AxiosResponse<T>>,
  operationName: string
): Promise<AxiosResponse<T>> {
  try {
    // Try the operation once
    const result = await operation();
    return result;
  } catch (primaryError: any) {
    // Log the primary failure and retry attempt
    const errorMessage = primaryError.response?.data?.message || primaryError.message || "Unknown error";
    logger.warn(`${operationName} failed: ${errorMessage}`);
    logger.info(`Retrying ${operationName} after ${RETRY_DELAY_MS}ms...`);

    // Wait before retry
    await delay(RETRY_DELAY_MS);

    try {
      // Retry the operation
      const result = await operation();
      logger.success(`${operationName} succeeded on retry`);
      return result;
    } catch (retryError: any) {
      const retryErrorMessage = retryError.response?.data?.message || retryError.message || "Unknown error";
      logger.error(`${operationName} failed on retry: ${retryErrorMessage}`);
      // Throw the retry error as it's the final attempt
      throw retryError;
    }
  }
}

/**
 * Creates a provider operation wrapper that includes the provider context
 * This helper is useful for operations that need access to a specific provider
 * @param provider - The ethers provider to use
 * @param operation - The operation to perform with the provider
 * @returns A function that can be passed to withProviderRetry
 */
export function createProviderOperation<T>(
  provider: ethers.Provider,
  operation: (p: ethers.Provider) => Promise<T>
): (p: ethers.Provider) => Promise<T> {
  return async (p: ethers.Provider) => {
    // Use the provided provider if one is passed (for retry), otherwise use the original
    return operation(p || provider);
  };
}
