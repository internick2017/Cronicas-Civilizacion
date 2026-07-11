import redisClient from '../config/redis.js';
import logger from './logger.js';

/**
 * Safely execute Redis operations with error handling
 * @param {Function} operation - The Redis operation to execute
 * @param {string} operationName - Name of the operation for logging
 * @returns {Promise<any>} - Result of the operation or null if failed
 */
export async function safeRedisOperation(operation, operationName = 'Redis operation') {
  try {
    return await operation();
  } catch (error) {
    logger.warn(`${operationName} failed:`, error.message);
    return null;
  }
}

/**
 * Safely delete a key from Redis cache
 * @param {string} key - The key to delete
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function safeRedisDel(key) {
  const result = await safeRedisOperation(
    () => redisClient.del(key),
    `Redis DEL ${key}`
  );
  return result !== null;
}

/**
 * Safely set a key in Redis cache
 * @param {string} key - The key to set
 * @param {any} value - The value to set
 * @param {Object} options - Redis options (e.g., EX for expiration)
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
export async function safeRedisSet(key, value, options = {}) {
  const result = await safeRedisOperation(
    () => redisClient.set(key, value, options),
    `Redis SET ${key}`
  );
  return result !== null;
}

/**
 * Safely get a key from Redis cache
 * @param {string} key - The key to get
 * @returns {Promise<any>} - The value or null if not found or error
 */
export async function safeRedisGet(key) {
  return await safeRedisOperation(
    () => redisClient.get(key),
    `Redis GET ${key}`
  );
}

/**
 * Check if Redis is connected and available
 * @returns {Promise<boolean>} - True if Redis is available
 */
export async function isRedisAvailable() {
  try {
    await redisClient.ping();
    return true;
  } catch (error) {
    return false;
  }
} 