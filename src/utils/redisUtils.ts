import { RedisService } from "ondc-automation-cache-lib";
import { logger } from "./logger";

// Function to save data under sessionId and transactionId
export const saveData = async (
  sessionId: string,
  transactionId: string,
  key: string,
  value: Record<string, any> // Accept JSON object
): Promise<void> => {
  try {
    // Create a unique key in the format sessionId:transactionId:key
    const redisKey = `${sessionId}:${transactionId}:${key}`;

    // Serialize the JSON object to a string
    const serializedValue = JSON.stringify(value);

    // Save the serialized value with optional TTL
    await RedisService.setKey(redisKey, serializedValue, 3600);
  } catch (error) {
    logger.error("Error saving data:", error);
  }
};

// Function to fetch data for a specific key under sessionId and transactionId
export const fetchData = async (
  sessionId: string,
  transactionId: string,
  key: string
): Promise<Record<string, any> | null> => {
  try {
    const redisKey = `${sessionId}:${transactionId}:${key}`;

    // Fetch the serialized value
    const serializedValue = await RedisService.getKey(redisKey);

    if (!serializedValue) {
      logger.error(`No data found for key: ${redisKey}`);
      return null;
    }

    // Deserialize the JSON object
    const value = JSON.parse(serializedValue);

    return value;
  } catch (error) {
    logger.error("Error fetching data:", error);
    return null;
  }
};

// Map to store session and transaction IDs with timestamps
const sessionTransactionMap = new Map<string, { transactionId: string, timestamp: number }[]>();

/**
 * Add a transaction ID to a session's set with timestamp.
 * @param {string} sessionId - The session ID.
 * @param {string} transactionId - The transaction ID to add.
 */
export const addTransactionId = async (
  sessionId: string,
  transactionId: string
) => {
  const timestamp = Date.now(); // Get the current timestamp

  // Check if the sessionId exists in the map
  if (!sessionTransactionMap.has(sessionId)) {
    sessionTransactionMap.set(sessionId, []);
  }

  // Add the transaction ID along with the timestamp to the session's list
  sessionTransactionMap.get(sessionId)?.push({ transactionId, timestamp });

  // Save this data to Redis, only saving the array of transactions
  await RedisService.setKey(
    `${sessionId}:transactionMap`,
    JSON.stringify(sessionTransactionMap.get(sessionId))
  );
};

/**
 * Get all sorted transaction IDs for a session based on timestamp.
 * @param {string} sessionId - The session ID.
 * @returns {string[]} - Array of sorted transaction IDs for the session.
 */
export const getTransactionIds = async (
  sessionId: string
): Promise<string[]> => {
  const sessionTransactionData = await RedisService.getKey(
    `${sessionId}:transactionMap`
  );

  if (!sessionTransactionData) {
    logger.error(`No transaction IDs found for session "${sessionId}".`);
    return [];
  }

  // Parse the data and ensure it's an array of objects with `transactionId` and `timestamp`
  const transactions = JSON.parse(sessionTransactionData);

  // Check if the data is in the expected array format
  if (!Array.isArray(transactions)) {
    logger.error(`Invalid data format for session "${sessionId}".`);
    return [];
  }

  // Sort the transactions by timestamp
  const sortedTransactions = transactions.sort(
    (a: { timestamp: number }, b: { timestamp: number }) => a.timestamp - b.timestamp
  );

  // Save the sorted data to Redis
  await RedisService.setKey(
    `${sessionId}:sortedTransactions`,
    JSON.stringify(sortedTransactions)
  );

  // Return the sorted transaction IDs
  return sortedTransactions.map(
    (transaction: { transactionId: string }) => transaction.transactionId
  );
};