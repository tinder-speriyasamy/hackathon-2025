/**
 * Profile URL Manager
 * Handles storing profile data and generating shareable URLs with unique codes
 */

const logger = require('../utils/logger');
const redis = require('redis');
const crypto = require('crypto');

// Redis client (will be initialized from ai-matchmaker's client)
let redisClient = null;

/**
 * Generate a unique profile code
 * @param {number} length - Length of the code (default: 8)
 * @returns {string} Random alphanumeric code
 */
function generateProfileCode(length = 8) {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing characters like 0,O,1,I
  let code = '';
  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    code += characters[randomBytes[i] % characters.length];
  }

  return code;
}

/**
 * Initialize with existing Redis client
 * @param {Object} client - Redis client instance
 */
function initialize(client) {
  redisClient = client;
  logger.info('Profile URL Manager initialized with Redis client');
}

/**
 * Store profile data in Redis and return shareable URL with unique code
 * @param {string} sessionId - Session identifier
 * @param {Object} profileData - Complete profile data
 * @param {string} baseUrl - Base URL for profile links (e.g., 'https://unterrified-bea-prolately.ngrok-free.dev')
 * @returns {Promise<string>} Shareable profile URL
 */
async function createProfileUrl(sessionId, profileData, baseUrl = 'https://unterrified-bea-prolately.ngrok-free.dev') {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis client not initialized or not connected');
  }

  if (!sessionId || !profileData) {
    throw new Error('Session ID and profile data are required');
  }

  const profileKey = `profile:${sessionId}`;

  try {
    // Store profile data in Redis (no expiry - profiles stay forever)
    await redisClient.set(profileKey, JSON.stringify(profileData));

    // Generate unique profile code (retry if collision occurs)
    let profileCode;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      profileCode = generateProfileCode();
      const codeKey = `profileCode:${profileCode}`;
      const exists = await redisClient.exists(codeKey);

      if (exists === 0) {
        // Code is unique, store the mapping
        await redisClient.set(codeKey, sessionId);
        break;
      }

      attempts++;
      if (attempts >= maxAttempts) {
        throw new Error('Failed to generate unique profile code after multiple attempts');
      }
    } while (attempts < maxAttempts);

    logger.info('Profile stored in Redis with unique code', {
      sessionId,
      profileCode,
      profileKey,
      profileName: profileData.name,
      profileAge: profileData.age,
      photoCount: profileData.photos?.length || 0
    });

    // Generate shareable URL with unique code
    const profileUrl = `${baseUrl}/profile/${profileCode}`;

    logger.info('Profile URL generated with unique code', {
      sessionId,
      profileCode,
      profileUrl
    });

    return profileUrl;

  } catch (error) {
    logger.error('Failed to create profile URL', {
      sessionId,
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Failed to create profile URL: ${error.message}`);
  }
}

/**
 * Retrieve profile data by session ID
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object|null>} Profile data or null if not found
 */
async function getProfileData(sessionId) {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis client not initialized or not connected');
  }

  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  const profileKey = `profile:${sessionId}`;

  try {
    const data = await redisClient.get(profileKey);

    if (!data) {
      logger.warn('Profile not found', { sessionId, profileKey });
      return null;
    }

    const profileData = JSON.parse(data);

    logger.debug('Profile retrieved from Redis', {
      sessionId,
      profileName: profileData.name,
      profileAge: profileData.age
    });

    return profileData;

  } catch (error) {
    logger.error('Failed to retrieve profile data', {
      sessionId,
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Failed to retrieve profile data: ${error.message}`);
  }
}

/**
 * Retrieve profile data by profile code
 * @param {string} profileCode - Unique profile code
 * @returns {Promise<Object|null>} Profile data or null if not found
 */
async function getProfileDataByCode(profileCode) {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis client not initialized or not connected');
  }

  if (!profileCode) {
    throw new Error('Profile code is required');
  }

  const codeKey = `profileCode:${profileCode}`;

  try {
    // Look up session ID from profile code
    const sessionId = await redisClient.get(codeKey);

    if (!sessionId) {
      logger.warn('Profile code not found', { profileCode, codeKey });
      return null;
    }

    // Retrieve profile data using session ID
    const profileData = await getProfileData(sessionId);

    logger.debug('Profile retrieved from Redis by code', {
      profileCode,
      sessionId,
      profileName: profileData?.name,
      profileAge: profileData?.age
    });

    return profileData;

  } catch (error) {
    logger.error('Failed to retrieve profile data by code', {
      profileCode,
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Failed to retrieve profile data by code: ${error.message}`);
  }
}

/**
 * Delete profile data (for cleanup or testing)
 * @param {string} sessionId - Session identifier
 * @returns {Promise<boolean>} True if deleted successfully
 */
async function deleteProfile(sessionId) {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis client not initialized or not connected');
  }

  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  const profileKey = `profile:${sessionId}`;

  try {
    const result = await redisClient.del(profileKey);

    if (result === 1) {
      logger.info('Profile deleted from Redis', { sessionId, profileKey });
      return true;
    } else {
      logger.warn('Profile not found for deletion', { sessionId, profileKey });
      return false;
    }

  } catch (error) {
    logger.error('Failed to delete profile', {
      sessionId,
      error: error.message,
      stack: error.stack
    });
    throw new Error(`Failed to delete profile: ${error.message}`);
  }
}

/**
 * Check if a profile exists
 * @param {string} sessionId - Session identifier
 * @returns {Promise<boolean>} True if profile exists
 */
async function profileExists(sessionId) {
  if (!redisClient || !redisClient.isOpen) {
    throw new Error('Redis client not initialized or not connected');
  }

  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  const profileKey = `profile:${sessionId}`;

  try {
    const exists = await redisClient.exists(profileKey);
    return exists === 1;
  } catch (error) {
    logger.error('Failed to check profile existence', {
      sessionId,
      error: error.message
    });
    return false;
  }
}

module.exports = {
  initialize,
  createProfileUrl,
  getProfileData,
  getProfileDataByCode,
  deleteProfile,
  profileExists
};
