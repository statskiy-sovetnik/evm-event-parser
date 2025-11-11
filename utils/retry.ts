import { ethers } from "ethers";
import { AxiosResponse } from "axios";
import { logger } from "./logger";

/**
 * Retry configuration
 */
const RETRY_DELAY_MS = 1000; // 1 second delay before retry
const INCREASED_TIMEOUT_MS = 30000; // 30 seconds for timeout retry

/**
 * Check if an error is a timeout error
 */
export function isTimeoutError(error: any): boolean {
  if (!error) return false;
  const message = error.message?.toLowerCase() || "";
  const code = error.code?.toUpperCase() || "";
  return (
    code === "TIMEOUT" ||
    code === "ETIMEDOUT" ||
    code === "ECONNABORTED" ||
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("connect timeout")
  );
}

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
  // Extract the original provider from the operation if possible
  const originalProvider = (operation as any).provider;

  try {
    // Try with the current provider (primary RPC)
    const result = await operation(originalProvider);
    return result;
  } catch (primaryError: any) {
    // Check if this is a timeout error - if so, retry with increased timeout on same provider
    if (isTimeoutError(primaryError) && originalProvider) {
      logger.warn(`${operationName} failed with timeout: ${primaryError.message}`);
      logger.info(`Retrying ${operationName} with increased timeout (${INCREASED_TIMEOUT_MS}ms)...`);

      await delay(RETRY_DELAY_MS);

      try {
        // Create a new provider with the same RPC but increased timeout
        const providerUrl = originalProvider._getConnection?.().url || originalProvider.connection?.url;
        if (providerUrl) {
          const retryProvider = new ethers.JsonRpcProvider(providerUrl, undefined, {
            staticNetwork: true,
          });
          // Increase the timeout
          const connection = retryProvider._getConnection();
          if (connection) {
            connection.timeout = INCREASED_TIMEOUT_MS;
          }

          const result = await operation(retryProvider);
          logger.success(`${operationName} succeeded with increased timeout`);
          return result;
        }
      } catch (timeoutRetryError: any) {
        logger.warn(`${operationName} still failed with increased timeout: ${timeoutRetryError.message}`);
        // Continue to alternative RPC retry below
      }
    }

    // If no alternative RPC is available, throw the error
    if (!alternativeRpcUrl) {
      logger.error(`${operationName} failed (no alternative RPC available): ${primaryError.message}`);
      throw primaryError;
    }

    // Log the primary failure and retry attempt with alternative RPC
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
