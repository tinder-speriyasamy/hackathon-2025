/**
 * Conversation Manager
 * Handles Twilio Conversations API for group chat functionality
 */

const logger = require('./logger');

// Twilio client will be injected
let twilioClient = null;
let whatsappNumber = null;
let serviceSid = null;

/**
 * Initialize conversation manager with Twilio client
 * @param {Object} client - Twilio client instance
 * @param {string} whatsappNum - WhatsApp number (e.g., whatsapp:+14155238886)
 * @param {string} conversationsServiceSid - Conversations Service SID (optional, for service-scoped conversations)
 */
function initialize(client, whatsappNum, conversationsServiceSid = null) {
  twilioClient = client;
  whatsappNumber = whatsappNum;
  serviceSid = conversationsServiceSid;
  logger.info('Conversation Manager initialized', {
    whatsappNumber: whatsappNum,
    serviceSid: conversationsServiceSid || 'default'
  });
}

/**
 * Create a new Twilio Conversation
 * @param {string} sessionId - Session ID for reference
 * @param {Object} attributes - Additional attributes to store
 * @returns {Promise<Object>} Conversation object with sid
 */
async function createConversation(sessionId, attributes = {}) {
  if (!twilioClient) {
    throw new Error('Conversation Manager not initialized');
  }

  try {
    logger.info('Creating Twilio Conversation', {
      sessionId,
      attributes,
      usingService: !!serviceSid
    });

    // Use service-scoped path if serviceSid is provided, otherwise use default
    const conversationsApi = serviceSid
      ? twilioClient.conversations.v1.services(serviceSid).conversations
      : twilioClient.conversations.v1.conversations;

    const conversation = await conversationsApi.create({
      friendlyName: `MeetCute Dating Profile - Session ${sessionId}`,
      uniqueName: `meetcute-session-${sessionId}`, // For lookups
      attributes: JSON.stringify({
        sessionId,
        purpose: 'dating-profile-creation',
        createdAt: new Date().toISOString(),
        ...attributes
      })
    });

    logger.info('Conversation created successfully', {
      sessionId,
      conversationSid: conversation.sid,
      friendlyName: conversation.friendlyName
    });

    return {
      sid: conversation.sid,
      friendlyName: conversation.friendlyName,
      uniqueName: conversation.uniqueName,
      dateCreated: conversation.dateCreated
    };
  } catch (error) {
    logger.error('Failed to create conversation', {
      sessionId,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

/**
 * Add a WhatsApp participant to a conversation
 * @param {string} conversationSid - Conversation SID
 * @param {string} phoneNumber - Phone number (without whatsapp: prefix)
 * @returns {Promise<Object>} Participant object
 *
 * NOTE: WhatsApp/SMS participants cannot have identities in Twilio Conversations.
 * Identities are only supported for chat SDK participants.
 */
async function addParticipant(conversationSid, phoneNumber) {
  if (!twilioClient) {
    throw new Error('Conversation Manager not initialized');
  }

  // Ensure phone number has whatsapp: prefix
  const whatsappAddress = phoneNumber.startsWith('whatsapp:')
    ? phoneNumber
    : `whatsapp:${phoneNumber}`;

  try {
    logger.info('Adding participant to conversation', {
      conversationSid,
      phoneNumber,
      whatsappAddress
    });

    const participantData = {
      'messagingBinding.address': whatsappAddress,
      'messagingBinding.proxyAddress': whatsappNumber
    };

    // NOTE: WhatsApp/SMS participants CANNOT have identities in Twilio Conversations
    // The identity field is only for chat SDK participants, not messaging channels
    // Twilio error code 50211: "Participants on SMS, WhatsApp or other non-chat channels cannot have Identities"

    // Use service-scoped path if serviceSid is provided, otherwise use default
    const conversationApi = serviceSid
      ? twilioClient.conversations.v1.services(serviceSid).conversations(conversationSid)
      : twilioClient.conversations.v1.conversations(conversationSid);

    const participant = await conversationApi
      .participants
      .create(participantData);

    logger.info('Participant added successfully', {
      conversationSid,
      participantSid: participant.sid,
      phoneNumber
    });

    return {
      sid: participant.sid,
      identity: participant.identity,
      messagingBinding: participant.messagingBinding,
      dateCreated: participant.dateCreated
    };
  } catch (error) {
    // Handle case where participant is already in another conversation (error 50416)
    // WhatsApp users can only be in one conversation at a time with a given number
    if (error.code === 50416) {
      logger.warn('Participant already in another conversation, attempting to find and remove', {
        conversationSid,
        phoneNumber,
        error: error.message
      });

      try {
        // Extract the existing conversation SID from error message
        // Error format: "A binding for this participant and proxy address already exists in Conversation CHXXXX"
        const match = error.message.match(/Conversation (CH[a-f0-9]+)/i);
        if (match && match[1]) {
          const existingConversationSid = match[1];

          logger.info('Found existing conversation, fetching participants', {
            existingConversationSid
          });

          // Get participants from the old conversation
          const participants = await listParticipants(existingConversationSid);

          // Find the participant matching this phone number
          const existingParticipant = participants.find(p =>
            p.messagingBinding?.address === whatsappAddress
          );

          if (existingParticipant) {
            logger.info('Removing participant from old conversation', {
              existingConversationSid,
              participantSid: existingParticipant.sid,
              phoneNumber
            });

            // Remove from old conversation
            await removeParticipant(existingConversationSid, existingParticipant.sid);

            // Retry adding to new conversation
            logger.info('Retrying add participant to new conversation', {
              conversationSid,
              phoneNumber
            });

            // Recreate conversationApi for the retry
            const retryConversationApi = serviceSid
              ? twilioClient.conversations.v1.services(serviceSid).conversations(conversationSid)
              : twilioClient.conversations.v1.conversations(conversationSid);

            const participant = await retryConversationApi
              .participants
              .create(participantData);

            logger.info('Participant added successfully after cleanup', {
              conversationSid,
              participantSid: participant.sid,
              phoneNumber
            });

            return {
              sid: participant.sid,
              identity: participant.identity,
              messagingBinding: participant.messagingBinding,
              dateCreated: participant.dateCreated
            };
          }
        }
      } catch (cleanupError) {
        logger.error('Failed to cleanup and retry participant addition', {
          conversationSid,
          phoneNumber,
          error: cleanupError.message
        });
      }
    }

    logger.error('Failed to add participant', {
      conversationSid,
      phoneNumber,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

/**
 * Remove a participant from a conversation
 * @param {string} conversationSid - Conversation SID
 * @param {string} participantSid - Participant SID
 * @returns {Promise<boolean>} Success status
 */
async function removeParticipant(conversationSid, participantSid) {
  if (!twilioClient) {
    throw new Error('Conversation Manager not initialized');
  }

  try {
    logger.info('Removing participant from conversation', {
      conversationSid,
      participantSid
    });

    // Use service-scoped path if serviceSid is provided, otherwise use default
    const conversationApi = serviceSid
      ? twilioClient.conversations.v1.services(serviceSid).conversations(conversationSid)
      : twilioClient.conversations.v1.conversations(conversationSid);

    await conversationApi
      .participants(participantSid)
      .remove();

    logger.info('Participant removed successfully', {
      conversationSid,
      participantSid
    });

    return true;
  } catch (error) {
    logger.error('Failed to remove participant', {
      conversationSid,
      participantSid,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

/**
 * Send a message to a conversation
 * Twilio will automatically broadcast to all participants
 * @param {string} conversationSid - Conversation SID
 * @param {string} author - Author of the message (e.g., "MeetCute", phone number)
 * @param {string} body - Message body
 * @param {Object} attributes - Optional message attributes
 * @returns {Promise<Object>} Message object
 */
async function sendMessage(conversationSid, author, body, attributes = {}) {
  if (!twilioClient) {
    throw new Error('Conversation Manager not initialized');
  }

  try {
    logger.info('Sending message to conversation', {
      conversationSid,
      author,
      bodyLength: body.length,
      hasAttributes: Object.keys(attributes).length > 0
    });

    const messageData = {
      author,
      body
    };

    // Add attributes if provided
    if (Object.keys(attributes).length > 0) {
      messageData.attributes = JSON.stringify(attributes);
    }

    // Use service-scoped path if serviceSid is provided, otherwise use default
    const conversationApi = serviceSid
      ? twilioClient.conversations.v1.services(serviceSid).conversations(conversationSid)
      : twilioClient.conversations.v1.conversations(conversationSid);

    const message = await conversationApi
      .messages
      .create(messageData);

    logger.info('Message sent successfully', {
      conversationSid,
      messageSid: message.sid,
      author,
      dateCreated: message.dateCreated
    });

    return {
      sid: message.sid,
      author: message.author,
      body: message.body,
      dateCreated: message.dateCreated
    };
  } catch (error) {
    logger.error('Failed to send message', {
      conversationSid,
      author,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

/**
 * Get conversation details
 * @param {string} conversationSid - Conversation SID
 * @returns {Promise<Object>} Conversation details
 */
async function getConversation(conversationSid) {
  if (!twilioClient) {
    throw new Error('Conversation Manager not initialized');
  }

  try {
    logger.debug('Fetching conversation details', { conversationSid });

    // Use service-scoped path if serviceSid is provided, otherwise use default
    const conversationApi = serviceSid
      ? twilioClient.conversations.v1.services(serviceSid).conversations(conversationSid)
      : twilioClient.conversations.v1.conversations(conversationSid);

    const conversation = await conversationApi.fetch();

    return {
      sid: conversation.sid,
      friendlyName: conversation.friendlyName,
      uniqueName: conversation.uniqueName,
      state: conversation.state,
      attributes: conversation.attributes ? JSON.parse(conversation.attributes) : {},
      dateCreated: conversation.dateCreated,
      dateUpdated: conversation.dateUpdated
    };
  } catch (error) {
    logger.error('Failed to fetch conversation', {
      conversationSid,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

/**
 * List all participants in a conversation
 * @param {string} conversationSid - Conversation SID
 * @returns {Promise<Array>} Array of participants
 */
async function listParticipants(conversationSid) {
  if (!twilioClient) {
    throw new Error('Conversation Manager not initialized');
  }

  try {
    logger.debug('Listing conversation participants', { conversationSid });

    // Use service-scoped path if serviceSid is provided, otherwise use default
    const conversationApi = serviceSid
      ? twilioClient.conversations.v1.services(serviceSid).conversations(conversationSid)
      : twilioClient.conversations.v1.conversations(conversationSid);

    const participants = await conversationApi
      .participants
      .list({ limit: 50 }); // WhatsApp group limit

    logger.debug('Participants listed', {
      conversationSid,
      count: participants.length
    });

    return participants.map(p => ({
      sid: p.sid,
      identity: p.identity,
      messagingBinding: p.messagingBinding,
      dateCreated: p.dateCreated
    }));
  } catch (error) {
    logger.error('Failed to list participants', {
      conversationSid,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

/**
 * Get conversation messages
 * @param {string} conversationSid - Conversation SID
 * @param {number} limit - Number of messages to fetch
 * @returns {Promise<Array>} Array of messages
 */
async function getMessages(conversationSid, limit = 50) {
  if (!twilioClient) {
    throw new Error('Conversation Manager not initialized');
  }

  try {
    logger.debug('Fetching conversation messages', {
      conversationSid,
      limit
    });

    // Use service-scoped path if serviceSid is provided, otherwise use default
    const conversationApi = serviceSid
      ? twilioClient.conversations.v1.services(serviceSid).conversations(conversationSid)
      : twilioClient.conversations.v1.conversations(conversationSid);

    const messages = await conversationApi
      .messages
      .list({ limit });

    logger.debug('Messages fetched', {
      conversationSid,
      count: messages.length
    });

    return messages.map(m => ({
      sid: m.sid,
      author: m.author,
      body: m.body,
      attributes: m.attributes ? JSON.parse(m.attributes) : {},
      dateCreated: m.dateCreated
    }));
  } catch (error) {
    logger.error('Failed to fetch messages', {
      conversationSid,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

/**
 * Delete a conversation
 * @param {string} conversationSid - Conversation SID
 * @returns {Promise<boolean>} Success status
 */
async function deleteConversation(conversationSid) {
  if (!twilioClient) {
    throw new Error('Conversation Manager not initialized');
  }

  try {
    logger.info('Deleting conversation', { conversationSid });

    // Use service-scoped path if serviceSid is provided, otherwise use default
    const conversationApi = serviceSid
      ? twilioClient.conversations.v1.services(serviceSid).conversations(conversationSid)
      : twilioClient.conversations.v1.conversations(conversationSid);

    await conversationApi.remove();

    logger.info('Conversation deleted successfully', { conversationSid });

    return true;
  } catch (error) {
    logger.error('Failed to delete conversation', {
      conversationSid,
      error: error.message,
      code: error.code
    });
    throw error;
  }
}

module.exports = {
  initialize,
  createConversation,
  addParticipant,
  removeParticipant,
  sendMessage,
  getConversation,
  listParticipants,
  getMessages,
  deleteConversation
};
