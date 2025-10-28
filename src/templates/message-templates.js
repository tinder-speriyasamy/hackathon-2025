/**
 * Message Templates for Twilio
 *
 * This file provides a centralized interface for message formatting and sending.
 * Agents can work on this file independently to add template-based messaging,
 * localization, or other message enhancements without affecting core logic.
 *
 * Future enhancements:
 * - Add message templates for common scenarios
 * - Implement localization support
 * - Add rich media templates (buttons, carousels, etc.)
 * - Implement message scheduling
 * - Add A/B testing for messages
 */

const logger = require('../utils/logger');

/**
 * Message template types
 * These can be expanded to support template-based messaging in the future
 */
const TEMPLATE_TYPES = {
  PLAIN: 'plain',
  // Future: GREETING: 'greeting',
  // Future: PROFILE_SUMMARY: 'profile_summary',
  // Future: CONFIRMATION: 'confirmation',
};

/**
 * Format a message for sending
 * Currently a pass-through, but can be enhanced with templates in the future
 *
 * @param {string} message - The message text
 * @param {Object} options - Optional formatting options
 * @param {string} options.templateType - Type of template to use
 * @param {Object} options.templateData - Data to populate template
 * @returns {string} Formatted message
 */
function formatMessage(message, options = {}) {
  const { templateType = TEMPLATE_TYPES.PLAIN, templateData = {} } = options;

  // Currently just returns the message as-is
  // Future: Apply templates based on templateType
  return message;
}

/**
 * Prepare message for Twilio sending
 *
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message content
 * @param {string} mediaUrl - Optional media URL
 * @param {Object} options - Optional sending options
 * @returns {Object} Message payload ready for Twilio
 */
function prepareMessagePayload(phoneNumber, message, mediaUrl = null, options = {}) {
  const formattedMessage = formatMessage(message, options);

  const payload = {
    to: phoneNumber,
    body: formattedMessage
  };

  if (mediaUrl) {
    payload.mediaUrl = mediaUrl;
  }

  return payload;
}

/**
 * Send a message via Twilio
 * Wrapper function that can be enhanced with retry logic, rate limiting, etc.
 *
 * @param {Function} twilioSendFn - The Twilio send function
 * @param {string} phoneNumber - Recipient phone number
 * @param {string} message - Message content
 * @param {string} mediaUrl - Optional media URL
 * @param {Object} options - Optional sending options
 * @returns {Promise<Object>} Send result
 */
async function sendMessage(twilioSendFn, phoneNumber, message, mediaUrl = null, options = {}) {
  try {
    const payload = prepareMessagePayload(phoneNumber, message, mediaUrl, options);

    logger.debug('Sending message via template system', {
      phoneNumber,
      hasMedia: !!mediaUrl,
      messageLength: message.length
    });

    await twilioSendFn(phoneNumber, payload.body, payload.mediaUrl);

    return {
      success: true,
      phoneNumber,
      messageLength: message.length
    };
  } catch (error) {
    logger.error('Failed to send message via template system', {
      phoneNumber,
      error: error.message
    });

    return {
      success: false,
      phoneNumber,
      error: error.message
    };
  }
}

/**
 * Broadcast a message to multiple recipients
 * Can be enhanced with batching, rate limiting, etc.
 *
 * @param {Function} twilioSendFn - The Twilio send function
 * @param {Array<string>} phoneNumbers - Array of recipient phone numbers
 * @param {string} message - Message content
 * @param {string} mediaUrl - Optional media URL
 * @param {Object} options - Optional sending options
 * @returns {Promise<Array>} Array of send results
 */
async function broadcastMessage(twilioSendFn, phoneNumbers, message, mediaUrl = null, options = {}) {
  logger.info('Broadcasting message via template system', {
    recipientCount: phoneNumbers.length,
    hasMedia: !!mediaUrl
  });

  const results = [];

  for (const phoneNumber of phoneNumbers) {
    const result = await sendMessage(twilioSendFn, phoneNumber, message, mediaUrl, options);
    results.push(result);
  }

  const successCount = results.filter(r => r.success).length;
  logger.info('Broadcast complete', {
    total: phoneNumbers.length,
    success: successCount,
    failed: phoneNumbers.length - successCount
  });

  return results;
}

module.exports = {
  TEMPLATE_TYPES,
  formatMessage,
  prepareMessagePayload,
  sendMessage,
  broadcastMessage
};
