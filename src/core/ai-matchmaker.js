/**
 * AI Matchmaker - OpenAI integration for dating profile creation
 *
 * This module handles:
 * - Conversation flow with users and their friends
 * - Profile creation questions
 * - Friend feedback collection
 * - AI-generated profile text
 *
 * @typedef {Object} ConversationState
 * @property {string} userId - User's phone number
 * @property {string[]} friends - Friends' phone numbers
 * @property {string} stage - Current conversation stage
 * @property {Object} data - Collected data (preferences, feedback, etc.)
 */

const OpenAI = require('openai');
const { Groq } = require('groq-sdk');
const logger = require('../utils/logger');
const redis = require('redis');
const conversationManager = require('../twilio/conversation-manager');
const {
  STAGES,
  ACTION_TYPES,
  executeAction,
  logAction,
  parseAIResponse
} = require('./actions');
const { getActionInstructions } = require('../prompts/action-instructions');
const { getBasePrompt } = require('../prompts/base-prompt');
const { initializeProfileSchema } = require('./profile-schema');

// LLM Provider Configuration
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';

// Initialize LLM clients
let openaiClient = null;
let groqClient = null;

try {
  if (LLM_PROVIDER === 'openai') {
    const apiBase = process.env.OPENAI_API_BASE || 'https://litellmtokengateway.ue1.d1.tstaging.tools';
    const apiKey = process.env.OPENAI_API_KEY || 'sk-pTWrsEjqMrWFmqt_Lts29A';
    openaiClient = new OpenAI({
      apiKey: apiKey,
      baseURL: apiBase,
    });
    logger.info('OpenAI client initialized', { baseURL: apiBase });
  } else if (LLM_PROVIDER === 'groq') {
    if (!process.env.GROQ_API_KEY) {
      throw new Error('GROQ_API_KEY not configured in environment');
    }
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY
    });
    logger.info('Groq client initialized');
  } else {
    throw new Error(`Unknown LLM provider: ${LLM_PROVIDER}`);
  }
} catch (error) {
  logger.error('Failed to initialize LLM client', { provider: LLM_PROVIDER, error: error.message });
  logger.warn('AI features disabled');
}

// Initialize Redis client
let redisClient = null;
(async () => {
  try {
    redisClient = redis.createClient({
      url: 'redis://localhost:6379'
    });

    redisClient.on('error', (err) => logger.error('Redis Client Error', err));
    redisClient.on('connect', () => logger.info('Redis client connected'));

    await redisClient.connect();
    logger.info('Redis client initialized');
  } catch (error) {
    logger.error('Failed to initialize Redis client', error);
    logger.warn('Session persistence disabled - using in-memory storage');
  }
})();

// Fallback in-memory storage (if Redis fails)
const sessions = new Map(); // sessionId -> session data
const phoneToSession = new Map(); // phoneNumber -> sessionId
const phoneNames = new Map(); // phoneNumber -> name (from WhatsApp profile)

// Note: STAGES imported from actions.js

// Get the base system prompt (now defined in separate file for easy iteration)
const MATCHMAKER_BASE_PROMPT = getBasePrompt();

/**
 * Redis helper functions with fallback to in-memory storage
 */

async function setSession(sessionId, sessionData) {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.set(`session:${sessionId}`, JSON.stringify(sessionData));
      logger.debug('Session saved to Redis', { sessionId });
    } else {
      sessions.set(sessionId, sessionData);
      logger.debug('Session saved to memory', { sessionId });
    }
  } catch (error) {
    logger.error('Failed to save session to Redis, using memory', { sessionId, error: error.message });
    sessions.set(sessionId, sessionData);
  }
}

async function getSessionData(sessionId) {
  try {
    if (redisClient && redisClient.isOpen) {
      const data = await redisClient.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } else {
      return sessions.get(sessionId) || null;
    }
  } catch (error) {
    logger.error('Failed to get session from Redis, using memory', { sessionId, error: error.message });
    return sessions.get(sessionId) || null;
  }
}

async function setPhoneMapping(phoneNumber, sessionId) {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.set(`phone:${phoneNumber}`, sessionId);
    } else {
      phoneToSession.set(phoneNumber, sessionId);
    }
  } catch (error) {
    logger.error('Failed to save phone mapping to Redis', { phoneNumber, error: error.message });
    phoneToSession.set(phoneNumber, sessionId);
  }
}

async function getPhoneMapping(phoneNumber) {
  try {
    if (redisClient && redisClient.isOpen) {
      return await redisClient.get(`phone:${phoneNumber}`);
    } else {
      return phoneToSession.get(phoneNumber);
    }
  } catch (error) {
    logger.error('Failed to get phone mapping from Redis', { phoneNumber, error: error.message });
    return phoneToSession.get(phoneNumber);
  }
}

async function deleteSession(sessionId) {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.del(`session:${sessionId}`);
    } else {
      sessions.delete(sessionId);
    }
  } catch (error) {
    logger.error('Failed to delete session from Redis', { sessionId, error: error.message });
    sessions.delete(sessionId);
  }
}

async function deletePhoneMapping(phoneNumber) {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.del(`phone:${phoneNumber}`);
    } else {
      phoneToSession.delete(phoneNumber);
    }
  } catch (error) {
    logger.error('Failed to delete phone mapping from Redis', { phoneNumber, error: error.message });
    phoneToSession.delete(phoneNumber);
  }
}

/**
 * Generate a unique session code
 * @returns {string} 6-character alphanumeric code
 */
function generateSessionCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars (0, O, 1, I)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  // Check if code already exists (very unlikely)
  if (sessions.has(code)) {
    return generateSessionCode(); // Recursive retry
  }
  return code;
}

/**
 * Create a new session
 * @param {string} creatorPhone - Phone number of session creator
 * @param {string} creatorName - Name of session creator
 * @returns {Promise<string>} Session ID
 */
async function createSession(creatorPhone, creatorName) {
  const sessionId = generateSessionCode();

  const sessionData = {
    sessionId: sessionId,
    createdAt: new Date().toISOString(),
    createdBy: creatorPhone,
    conversationSid: null, // Twilio Conversation SID
    participants: [
      { phoneNumber: creatorPhone, name: creatorName, joinedAt: new Date().toISOString(), role: 'creator' }
    ],
    primaryUser: null, // { phoneNumber, name, confirmedAt }
    stage: STAGES.INTRODUCTION,
    profileSchema: initializeProfileSchema(), // Schema-based profile data
    data: {
      photos: [],
      interests: [],
      preferences: {}
    },
    messages: [], // Conversation history for OpenAI
    actions: [], // History of actions taken by AI
    generatedProfile: null, // Profile after generation
    committedProfile: null // Profile after commit
  };

  // Note: Using manual message broadcasting instead of Conversations API
  // This gives us full control over message formatting with sender names

  await setSession(sessionId, sessionData);
  await setPhoneMapping(creatorPhone, sessionId);

  logger.info('Created new session', { sessionId, creatorPhone, creatorName });
  return sessionId;
}

/**
 * Join an existing session
 * @param {string} sessionId - Session to join
 * @param {string} phoneNumber - Phone number joining
 * @param {string} name - Name of person joining
 * @returns {Promise<boolean>} Success
 */
async function joinSession(sessionId, phoneNumber, name) {
  const session = await getSessionData(sessionId);
  if (!session) {
    logger.warn('Attempted to join non-existent session', { sessionId, phoneNumber });
    return false;
  }

  // Check if already in session
  const alreadyInSession = session.participants.some(p => p.phoneNumber === phoneNumber);
  if (alreadyInSession) {
    logger.info('User already in session', { sessionId, phoneNumber });
    return true;
  }

  session.participants.push({
    phoneNumber: phoneNumber,
    name: name,
    joinedAt: new Date().toISOString(),
    role: 'friend'
  });

  // Note: Using manual message broadcasting - no Conversations API participant management needed

  await setSession(sessionId, session);
  await setPhoneMapping(phoneNumber, sessionId);

  logger.info('User joined session', { sessionId, phoneNumber, name, participantCount: session.participants.length });
  return true;
}

/**
 * Get session for a phone number
 * @param {string} phoneNumber - User's phone number
 * @returns {Promise<Object|null>} Session data or null
 */
async function getSession(phoneNumber) {
  const sessionId = await getPhoneMapping(phoneNumber);
  if (!sessionId) {
    return null;
  }
  return await getSessionData(sessionId);
}

/**
 * Get session by ID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Object|null>} Session data or null
 */
async function getSessionById(sessionId) {
  return await getSessionData(sessionId);
}

/**
 * Call LLM with provider abstraction
 * @param {Array} messages - Array of message objects {role, content}
 * @param {Object} options - Optional settings (temperature, max_tokens, etc.)
 * @returns {Promise<{content: string, usage: Object}>} Response from LLM
 */
async function callLLM(messages, options = {}) {
  const {
    temperature = 1,
    max_tokens = 4000,
    response_format = { type: "json_object" }
  } = options;

  if (LLM_PROVIDER === 'openai') {
    if (!openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const model = process.env.OPENAI_MODEL || 'gpt-4.1';
    const completion = await openaiClient.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
      response_format
    });

    return {
      content: completion.choices[0].message.content,
      usage: completion.usage
    };

  } else if (LLM_PROVIDER === 'groq') {
    if (!groqClient) {
      throw new Error('Groq client not initialized');
    }

    const model = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';

    // Groq requires explicit JSON instructions in the system prompt when using json_object mode
    // Add JSON reminder to the last system message if response_format is json_object
    let modifiedMessages = [...messages];
    if (response_format?.type === 'json_object') {
      const lastSystemIdx = modifiedMessages.findIndex(m => m.role === 'system');
      if (lastSystemIdx !== -1) {
        modifiedMessages[lastSystemIdx] = {
          ...modifiedMessages[lastSystemIdx],
          content: modifiedMessages[lastSystemIdx].content + '\n\nREMEMBER: You MUST respond with valid JSON only. Do not include any text outside the JSON object.'
        };
      }
    }

    const completion = await groqClient.chat.completions.create({
      model,
      messages: modifiedMessages,
      temperature,
      max_completion_tokens: max_tokens,
      response_format
    });

    return {
      content: completion.choices[0].message.content,
      usage: completion.usage
    };

  } else {
    throw new Error(`Unknown LLM provider: ${LLM_PROVIDER}`);
  }
}

/**
 * Save a message to session history
 * @param {string} sessionId - Session ID
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message content
 * @param {string} phoneNumber - Optional phone number of sender (for user messages)
 */
async function saveMessage(sessionId, role, content, phoneNumber = null) {
  const session = await getSessionData(sessionId);
  if (!session) {
    logger.warn('Attempted to save message to non-existent session', { sessionId });
    return;
  }

  const message = { role, content };
  if (phoneNumber && role === 'user') {
    const participant = session.participants.find(p => p.phoneNumber === phoneNumber);
    if (participant) {
      message.sender = participant.name || phoneNumber;
      message.phoneNumber = phoneNumber;
    }
  }

  session.messages.push(message);
  await setSession(sessionId, session);

  // Log the actual message content
  const icon = role === 'user' ? '👤' : '🤖';
  const senderInfo = role === 'user' && message.sender ? ` (${message.sender})` : '';
  logger.info(`${icon} ${role.toUpperCase()} Message Saved${senderInfo}`, {
    sessionId,
    role,
    sender: message.sender || 'system',
    phoneNumber: message.phoneNumber,
    messageCount: session.messages.length,
    messageLength: content?.length || 0,
    messageContent: content
  });
}

/**
 * Generate AI response using OpenAI
 * @param {string} sessionId - Session ID
 * @param {string} userMessage - Message from user
 * @param {string} phoneNumber - Phone number of sender
 * @returns {Promise<string>} AI response
 */
async function generateAIResponse(sessionId, userMessage, phoneNumber) {
  if (!openaiClient && !groqClient) {
    return {
      message: "Sorry, AI features are not configured yet. Please check your LLM provider settings in the .env file!",
      actions: [],
      reasoning: "LLM client not configured"
    };
  }

  let session = await getSessionData(sessionId);
  if (!session) {
    logger.error('Session not found', { sessionId });
    return {
      message: "Hmm, I can't find your session. Try starting a new one!",
      actions: [],
      reasoning: "Session not found"
    };
  }

  // Save user message
  await saveMessage(sessionId, 'user', userMessage, phoneNumber);

  // Re-fetch session to get updated messages
  session = await getSessionData(sessionId);

  // Build system prompt with action instructions
  const actionInstructions = getActionInstructions(
    session.stage,
    session.participants,
    session.profileSchema || {},
    session.data || {}
  );
  const fullSystemPrompt = `${MATCHMAKER_BASE_PROMPT}\n\n${actionInstructions}`;

  logger.info('🤖 Starting AI generation', {
    sessionId,
    phoneNumber,
    stage: session.stage,
    messageCount: session.messages.length,
    participantCount: session.participants.length,
    systemPromptLength: fullSystemPrompt.length
  });

  try {
    // Format messages for AI with sender information
    const formattedMessages = session.messages.map(m => {
      if (m.role === 'user' && m.sender) {
        // Include sender name in user messages so AI knows who said what
        return { role: m.role, content: `${m.sender}: ${m.content}` };
      }
      return { role: m.role, content: m.content };
    });

    // Track LLM timing
    const llmStartTime = Date.now();

    const llmResult = await callLLM([
      { role: 'system', content: fullSystemPrompt },
      ...formattedMessages
    ], {
      max_tokens: 4000,
      response_format: { type: "json_object" }
    });

    const llmDuration = Date.now() - llmStartTime;
    const aiResponse = llmResult.content;

    logger.info('⚡ LLM Response', {
      duration: `${llmDuration}ms`,
      tokens: llmResult.usage.total_tokens,
      provider: LLM_PROVIDER,
      sessionId
    });

    // Check for empty response
    if (!aiResponse || aiResponse.trim() === '') {
      logger.error('AI returned empty response', {
        sessionId,
        tokensUsed: llmResult.usage.total_tokens,
        provider: LLM_PROVIDER
      });
      return {
        message: "Sorry, I lost my train of thought. Could you repeat that?",
        actions: [],
        reasoning: "Empty AI response"
      };
    }

    // Parse AI response
    const parsed = parseAIResponse(aiResponse);

    logger.info('AI response generated and parsed', {
      sessionId,
      hasMessage: !!parsed.message,
      actionCount: parsed.actions ? parsed.actions.length : 0,
      tokensUsed: llmResult.usage.total_tokens,
      provider: LLM_PROVIDER
    });

    // Save the conversational message to history
    if (parsed.message) {
      await saveMessage(sessionId, 'assistant', parsed.message);
    }

    return parsed;

  } catch (error) {
    logger.error('Failed to generate AI response', error);
    return {
      message: "Oops! I'm having trouble thinking right now. Can you try that again?",
      actions: [],
      reasoning: "Error: " + error.message
    };
  }
}

/**
 * Handle incoming message and generate response
 * @param {string} from - Sender's phone number (with whatsapp: prefix)
 * @param {string} message - Message text
 * @param {string} profileName - WhatsApp profile name
 * @param {string[]} mediaUrls - Array of media URLs if photos attached
 * @returns {Promise<{response: string, sessionId: string, participants: Array}>} Response and session info
 */
async function handleMessage(from, message, profileName = null, mediaUrls = []) {
  // Remove whatsapp: prefix for internal tracking
  const phoneNumber = from.replace('whatsapp:', '');

  logger.info('Handling message from user', {
    phoneNumber,
    profileName,
    message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
    mediaCount: mediaUrls.length
  });

  // Special commands
  const lowerMessage = message.toLowerCase().trim();

  // Handle join command: "join ABC123" or "join ABC"
  const joinMatch = lowerMessage.match(/^join\s+([A-Z0-9]{3,6})$/i);
  if (joinMatch) {
    const sessionId = joinMatch[1].toUpperCase();
    const success = await joinSession(sessionId, phoneNumber, profileName);

    if (success) {
      const session = await getSessionById(sessionId);
      const response = `Welcome to the group, ${profileName || 'friend'}! 🎉

You've joined session ${sessionId}. There are now ${session.participants.length} people helping create this profile!`;

      // Send via Conversations API if available
      if (session.conversationSid) {
        try {
          const formattedResponse = `*MeetCute:* ${response}`;
          await conversationManager.sendMessage(
            session.conversationSid,
            'MeetCute',
            formattedResponse
          );
          return {
            response,
            sessionId,
            participants: session.participants.map(p => p.phoneNumber),
            sentViaConversations: true
          };
        } catch (error) {
          logger.error('Failed to send join message via Conversations', {
            sessionId,
            error: error.message
          });
        }
      }

      return {
        response,
        sessionId,
        participants: session.participants.map(p => p.phoneNumber),
        sentViaConversations: false
      };
    } else {
      return {
        response: `Hmm, I couldn't find session "${sessionId}". Double check the code and try again!`,
        sessionId: null,
        participants: [phoneNumber],
        sentViaConversations: false
      };
    }
  }

  // Check if user is already in a session
  let session = await getSession(phoneNumber);
  let sessionId;

  if (!session) {
    // Create new session for first-time user
    sessionId = await createSession(phoneNumber, profileName);
    session = await getSessionById(sessionId);

    const welcomeMessage = `Hey ${profileName || 'there'}! 👋

I'm your AI matchmaker! I've created a session for you.

Once your friends join, we'll create an amazing dating profile together!

Ready to start? Who are we creating this profile for today?`;

    // Get WhatsApp number from environment (remove 'whatsapp:' prefix for display)
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
    const displayNumber = whatsappNumber.replace('whatsapp:', '');

    // Create shareable invite message
    const shareableMessage = `📱 *Share this with your friends:*

━━━━━━━━━━━━━━━━
🎯 Help me create my dating profile!

Text this to: *${displayNumber}*

Message: *join ${sessionId}*
━━━━━━━━━━━━━━━━

(Just forward this whole message!)`;

    await saveMessage(sessionId, 'assistant', welcomeMessage);
    await saveMessage(sessionId, 'assistant', shareableMessage);

    // Send via Conversations API if available
    if (session.conversationSid) {
      try {
        const formattedWelcome = `*MeetCute:* ${welcomeMessage}`;
        const formattedShareable = `*MeetCute:* ${shareableMessage}`;

        await conversationManager.sendMessage(
          session.conversationSid,
          'MeetCute',
          formattedWelcome
        );

        // Send shareable message separately so it's easier to forward
        await conversationManager.sendMessage(
          session.conversationSid,
          'MeetCute',
          formattedShareable
        );

        return {
          response: welcomeMessage + '\n\n' + shareableMessage,
          sessionId,
          participants: session.participants.map(p => p.phoneNumber),
          sentViaConversations: true
        };
      } catch (error) {
        logger.error('Failed to send welcome message via Conversations', {
          sessionId,
          error: error.message
        });
      }
    }

    return {
      response: welcomeMessage + '\n\n' + shareableMessage,
      sessionId,
      participants: session.participants.map(p => p.phoneNumber),
      sentViaConversations: false
    };
  }

  sessionId = session.sessionId;

  // Store media URLs in session if present
  if (mediaUrls.length > 0) {
    if (!session.data.photos) {
      session.data.photos = [];
    }
    session.data.photos.push(...mediaUrls);
    await setSession(sessionId, session);
    logger.info('Stored photos in session', {
      sessionId,
      phoneNumber,
      photoCount: session.data.photos.length
    });
  }

  // Handle "help" command
  if (lowerMessage === 'help') {
    const helpMessage = `Here's how this works:

📱 Session Code: ${sessionId}
👥 ${session.participants.length} people in session
💬 Chat with me about what you're looking for
👥 Friends can join with: *join ${sessionId}*
✨ I'll help create an authentic profile

Type your answer to keep chatting!`;

    // Send via Conversations API if available
    if (session.conversationSid) {
      try {
        const formattedMessage = `*MeetCute:* ${helpMessage}`;
        await conversationManager.sendMessage(
          session.conversationSid,
          'MeetCute',
          formattedMessage
        );
        return {
          response: helpMessage,
          sessionId,
          participants: session.participants.map(p => p.phoneNumber),
          sentViaConversations: true
        };
      } catch (error) {
        logger.error('Failed to send help message via Conversations', {
          sessionId,
          error: error.message
        });
      }
    }

    return {
      response: helpMessage,
      sessionId,
      participants: session.participants.map(p => p.phoneNumber),
      sentViaConversations: false
    };
  }

  // Handle "start" or "restart" command
  if (lowerMessage === 'start' || lowerMessage === 'restart') {
    // Create new session
    const newSessionId = await createSession(phoneNumber, profileName);
    const newSession = await getSessionById(newSessionId);

    const welcomeMessage = `Starting fresh! 🎉

New session created! Who are we creating this profile for today?`;

    // Get WhatsApp number from environment (remove 'whatsapp:' prefix for display)
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+14155238886';
    const displayNumber = whatsappNumber.replace('whatsapp:', '');

    // Create shareable invite message
    const shareableMessage = `📱 *Share this with your friends:*

━━━━━━━━━━━━━━━━
🎯 Help me create my dating profile!

Text this to: *${displayNumber}*

Message: *join ${newSessionId}*
━━━━━━━━━━━━━━━━

(Just forward this whole message!)`;

    await saveMessage(newSessionId, 'assistant', welcomeMessage);
    await saveMessage(newSessionId, 'assistant', shareableMessage);

    // Send via Conversations API if available
    if (newSession.conversationSid) {
      try {
        const formattedWelcome = `*MeetCute:* ${welcomeMessage}`;
        const formattedShareable = `*MeetCute:* ${shareableMessage}`;

        await conversationManager.sendMessage(
          newSession.conversationSid,
          'MeetCute',
          formattedWelcome
        );

        // Send shareable message separately so it's easier to forward
        await conversationManager.sendMessage(
          newSession.conversationSid,
          'MeetCute',
          formattedShareable
        );

        return {
          response: welcomeMessage + '\n\n' + shareableMessage,
          sessionId: newSessionId,
          participants: newSession.participants.map(p => p.phoneNumber),
          sentViaConversations: true
        };
      } catch (error) {
        logger.error('Failed to send restart message via Conversations', {
          sessionId: newSessionId,
          error: error.message
        });
      }
    }

    return {
      response: welcomeMessage + '\n\n' + shareableMessage,
      sessionId: newSessionId,
      participants: newSession.participants.map(p => p.phoneNumber),
      sentViaConversations: false
    };
  }

  // NOTE: We DO NOT manually send user messages to the Conversation
  // The Conversations API automatically receives messages from participants
  // and broadcasts them to all other participants. Manually sending would
  // create duplicate messages.

  // User messages are already in the Conversation - we just need to log them
  // to our session history for the AI context
  if (session.conversationSid) {
    logger.debug('User message already in Conversation (sent automatically)', {
      sessionId,
      conversationSid: session.conversationSid,
      author: profileName || phoneNumber
    });
  }

  // Handle normal conversation flow with AI + Actions
  const aiResult = await generateAIResponse(sessionId, message, phoneNumber);

  // Log the AI response message content
  logger.info('💬 AI Response Generated', {
    sessionId,
    messageLength: aiResult.message?.length || 0,
    hasMessage: !!aiResult.message,
    isEmpty: !aiResult.message || aiResult.message.trim() === '',
    messagePreview: aiResult.message ? aiResult.message.substring(0, 150) + (aiResult.message.length > 150 ? '...' : '') : '[NO MESSAGE]',
    actionCount: aiResult.actions?.length || 0,
    hasReasoning: !!aiResult.reasoning
  });

  // Execute actions returned by AI
  let currentSession = await getSessionData(sessionId);
  let profileCardImage = null;
  if (aiResult.actions && aiResult.actions.length > 0) {
    const actionsStartTime = Date.now();
    logger.info('Executing AI actions', {
      sessionId,
      actionCount: aiResult.actions.length
    });

    for (const action of aiResult.actions) {
      const actionStartTime = Date.now();
      try {
        const result = await executeAction(action, currentSession);
        const actionDuration = Date.now() - actionStartTime;

        // Capture profile card image if generated
        if (result.profileCardImage) {
          profileCardImage = result.profileCardImage;
        }

        // Log action to session history
        logAction(currentSession, action, result);

        // If action modified session, update our reference
        if (result.success) {
          // Save updated session
          await setSession(sessionId, currentSession);
        }

        logger.info('⚙️  Action Complete', {
          action: action.type,
          duration: `${actionDuration}ms`,
          success: result.success,
          sessionId
        });
      } catch (error) {
        const actionDuration = Date.now() - actionStartTime;
        logger.error('❌ Action Failed', {
          action: action.type,
          duration: `${actionDuration}ms`,
          error: error.message,
          sessionId
        });
      }
    }

    const totalActionsDuration = Date.now() - actionsStartTime;
    logger.info('✅ All Actions Complete', {
      totalDuration: `${totalActionsDuration}ms`,
      actionCount: aiResult.actions.length,
      sessionId
    });
  }

  // Re-fetch session to get latest state
  const updatedSession = await getSessionData(sessionId);

  // Return for manual broadcast with formatted names
  return {
    response: aiResult.message,
    sessionId,
    participants: updatedSession ? updatedSession.participants.map(p => p.phoneNumber) : [],
    actions: aiResult.actions || [],
    reasoning: aiResult.reasoning,
    profileCardImage: profileCardImage, // Include profile card if generated
    sentViaConversations: false // Always use manual broadcast for proper name formatting
  };
}

/**
 * Handle conversation based on current stage
 * @param {string} sessionId - Session ID
 * @param {string} message - User's message
 * @param {string} phoneNumber - Phone number of sender
 * @param {string} profileName - User's WhatsApp name
 * @returns {Promise<string>} AI response
 */
async function handleConversationStage(sessionId, message, phoneNumber, profileName) {
  const session = await getSessionData(sessionId);
  if (!session) {
    logger.error('Session not found in handleConversationStage', { sessionId });
    return "Oops! I lost track of our conversation. Can you try starting again?";
  }

  // Stage: Identify Primary User
  if (session.stage === STAGES.IDENTIFY_PRIMARY) {
    return await handleIdentifyPrimary(sessionId, message, phoneNumber, profileName);
  }

  // Stage: Confirm Primary User
  if (session.stage === STAGES.CONFIRM_PRIMARY) {
    return await handleConfirmPrimary(sessionId, message, phoneNumber, profileName);
  }

  // Stage: Profile Creation (main conversation)
  if (session.stage === STAGES.PROFILE_CREATION) {
    return await generateAIResponse(sessionId, message, phoneNumber);
  }

  // Default: generate AI response
  return await generateAIResponse(sessionId, message, phoneNumber);
}

/**
 * Handle identifying the primary user
 * @param {string} sessionId - Session ID
 * @param {string} message - User's message
 * @param {string} phoneNumber - Phone number of sender
 * @param {string} profileName - WhatsApp name
 * @returns {Promise<string>} Response
 */
async function handleIdentifyPrimary(sessionId, message, phoneNumber, profileName) {
  const session = await getSessionData(sessionId);
  const lowerMessage = message.toLowerCase().trim();

  // Check if they're identifying themselves
  if (lowerMessage.includes('me') || lowerMessage.includes('my profile') || lowerMessage === 'i am') {
    // They are the primary user
    session.primaryUser = {
      phoneNumber: phoneNumber,
      name: profileName || 'you',
      confirmedAt: new Date().toISOString()
    };
    session.stage = STAGES.CONFIRM_PRIMARY;

    // Save session with updated primary user
    await setSession(sessionId, session);

    const confirmMessage = `Perfect! So we're creating YOUR profile${profileName ? ', ' + profileName : ''}!

Everyone else in the session can jump in with ideas and honest feedback. Sound good?`;

    await saveMessage(sessionId, 'user', message, phoneNumber);
    await saveMessage(sessionId, 'assistant', confirmMessage);

    logger.info('Primary user identified (self)', {
      sessionId,
      phoneNumber,
      name: profileName
    });

    return confirmMessage;
  }

  // Check if they're naming someone else
  // Extract potential name from message
  const words = message.split(' ');
  const potentialName = words.find(word =>
    word.length > 2 &&
    !['the', 'for', 'its', 'this', 'that', 'creating'].includes(word.toLowerCase())
  );

  if (potentialName) {
    // They're naming someone else
    session.primaryUser = {
      phoneNumber: null, // Will be identified later
      name: potentialName,
      confirmedAt: null
    };
    session.stage = STAGES.CONFIRM_PRIMARY;

    // Save session with updated primary user
    await setSession(sessionId, session);

    const confirmMessage = `Got it! We're creating a profile for ${potentialName}!

${potentialName} - are you here in the session?`;

    await saveMessage(sessionId, 'user', message, phoneNumber);
    await saveMessage(sessionId, 'assistant', confirmMessage);

    logger.info('Primary user named (by friend)', {
      sessionId,
      phoneNumber,
      primaryUserName: potentialName
    });

    return confirmMessage;
  }

  // Unclear response - ask again
  const clarifyMessage = `Hmm, I want to make sure I understand!

Are YOU the one creating a profile, or is it for someone else in the group?`;

  await saveMessage(sessionId, 'user', message, phoneNumber);
  await saveMessage(sessionId, 'assistant', clarifyMessage);

  return clarifyMessage;
}

/**
 * Handle confirming the primary user
 * @param {string} sessionId - Session ID
 * @param {string} message - User's message
 * @param {string} phoneNumber - Phone number of sender
 * @param {string} profileName - WhatsApp name
 * @returns {Promise<string>} Response
 */
async function handleConfirmPrimary(sessionId, message, phoneNumber, profileName) {
  const session = await getSessionData(sessionId);
  const lowerMessage = message.toLowerCase().trim();

  // Check if confirming
  if (lowerMessage.includes('yes') || lowerMessage.includes('yeah') ||
      lowerMessage.includes('yep') || lowerMessage.includes('sounds good')) {

    // If primary user already has phone number, we're done
    if (session.primaryUser && session.primaryUser.phoneNumber) {
      session.stage = STAGES.PROFILE_CREATION;
      await setSession(sessionId, session);

      const startMessage = `Awesome! Let's do this! 🎉

${session.primaryUser.name}, let's start with you. What are you looking for in a partner? (Serious relationship, casual dating, just seeing what's out there?)`;

      await saveMessage(sessionId, 'user', message, phoneNumber);
      await saveMessage(sessionId, 'assistant', startMessage);

      logger.info('Primary user confirmed, starting profile creation', {
        sessionId,
        primaryUser: session.primaryUser
      });

      return startMessage;
    }

    // Named user responded - confirm it's them
    if (session.primaryUser && session.primaryUser.name) {
      session.primaryUser.phoneNumber = phoneNumber;
      session.primaryUser.confirmedAt = new Date().toISOString();
      session.stage = STAGES.PROFILE_CREATION;
      await setSession(sessionId, session);

      const startMessage = `Perfect, ${session.primaryUser.name}! Everyone else - your honest input is gold! 💛

Alright ${session.primaryUser.name}, let's start! What are you looking for in a partner?`;

      await saveMessage(sessionId, 'user', message, phoneNumber);
      await saveMessage(sessionId, 'assistant', startMessage);

      logger.info('Named user confirmed identity', {
        sessionId,
        primaryUser: session.primaryUser
      });

      return startMessage;
    }
  }

  // If someone says "here" or "i'm here"
  if (lowerMessage.includes('here') || lowerMessage.includes("i'm")) {
    if (session.primaryUser && session.primaryUser.name && !session.primaryUser.phoneNumber) {
      session.primaryUser.phoneNumber = phoneNumber;
      session.primaryUser.confirmedAt = new Date().toISOString();
      session.stage = STAGES.PROFILE_CREATION;
      await setSession(sessionId, session);

      const startMessage = `Great, ${session.primaryUser.name}! Let's create something amazing together!

Everyone else can jump in anytime with feedback.

${session.primaryUser.name}, first question: What are you looking for in a partner?`;

      await saveMessage(sessionId, 'user', message, phoneNumber);
      await saveMessage(sessionId, 'assistant', startMessage);

      return startMessage;
    }
  }

  // Need clarification
  const clarifyMessage = `Just to confirm - is ${session.primaryUser && session.primaryUser.name ? session.primaryUser.name : 'the person we\'re helping'} you?

Reply "yes" if you're ${session.primaryUser && session.primaryUser.name ? session.primaryUser.name : 'the one'}, or tell me who we're creating this profile for!`;

  await saveMessage(sessionId, 'user', message, phoneNumber);
  await saveMessage(sessionId, 'assistant', clarifyMessage);

  return clarifyMessage;
}

/**
 * Get session for a phone number (for debugging/testing)
 * @param {string} phoneNumber - User's phone number
 * @returns {Object|null} Session state or null
 */
function getState(phoneNumber) {
  return getSession(phoneNumber);
}

/**
 * Get session by ID (for debugging/testing)
 * @param {string} sessionId - Session ID
 * @returns {Object|null} Session state or null
 */
function getStateBySession(sessionId) {
  return getSessionById(sessionId);
}

/**
 * Reset session for a phone number (for testing)
 * @param {string} phoneNumber - User's phone number
 */
async function resetConversation(phoneNumber) {
  const sessionId = await getPhoneMapping(phoneNumber);
  if (sessionId) {
    const session = await getSessionData(sessionId);
    await deleteSession(sessionId);
    // Remove all participants from phone mapping
    if (session) {
      for (const p of session.participants) {
        await deletePhoneMapping(p.phoneNumber);
      }
    }
  }
  await deletePhoneMapping(phoneNumber);
  logger.info('Reset session for phone number', { phoneNumber, sessionId });
}

/**
 * List all active sessions (for debugging)
 * @returns {Promise<Array>} Array of session objects
 */
async function getAllSessions() {
  if (redisClient && redisClient.isOpen) {
    try {
      const keys = await redisClient.keys('session:*');
      const sessionsData = [];
      for (const key of keys) {
        const data = await redisClient.get(key);
        if (data) {
          sessionsData.push(JSON.parse(data));
        }
      }
      return sessionsData;
    } catch (error) {
      logger.error('Failed to get all sessions from Redis', { error: error.message });
      return Array.from(sessions.values());
    }
  } else {
    return Array.from(sessions.values());
  }
}

module.exports = {
  handleMessage,
  getState,
  getStateBySession,
  resetConversation,
  generateAIResponse,
  getAllSessions,
  getSessionById,
  joinSession,
  createSession,
  deleteSession,
  deletePhoneMapping
};
