/**
 * Actions System
 * Defines possible actions the AI can take and executes them
 */

const logger = require('./logger');

/**
 * Conversation stages
 * @enum {string}
 */
const STAGES = {
  INTRODUCTION: 'introduction',
  PROFILE_CREATION: 'profile_creation',
  PROFILE_CONFIRMATION: 'profile_confirmation',
  FETCHING_PROFILES: 'fetching_profiles'
};

/**
 * Action types the AI can perform
 * @enum {string}
 */
const ACTION_TYPES = {
  SEND_MESSAGE: 'send_message',
  UPDATE_STAGE: 'update_stage',
  UPDATE_PROFILE_DATA: 'update_profile_data',
  FETCH_PROFILES: 'fetch_profiles'
};

/**
 * Get formatted action instructions for AI prompt
 * @param {string} currentStage - Current conversation stage
 * @param {Array} participants - Session participants
 * @returns {string} Formatted action instructions
 */
function getActionInstructions(currentStage, participants) {
  const participantList = participants.map(p => `${p.name} (${p.phoneNumber})`).join(', ');

  return `
## AVAILABLE ACTIONS

You can perform the following actions by returning them in your response:

### 1. send_message
Send a message to one or more participants.
{
  "type": "send_message",
  "target": "phone_number or 'all'",
  "message": "The message to send"
}

### 2. update_stage
Progress the conversation to a new stage (only when appropriate).
{
  "type": "update_stage",
  "stage": "${STAGES.INTRODUCTION}|${STAGES.PROFILE_CREATION}|${STAGES.PROFILE_CONFIRMATION}|${STAGES.FETCHING_PROFILES}"
}

### 3. update_profile_data
Store information about the user's profile.
{
  "type": "update_profile_data",
  "data": {
    "age": 25,
    "interests": ["hiking", "cooking"],
    "bio": "Love the outdoors..."
  }
}

### 4. fetch_profiles
Trigger profile matching and recommendations (ONLY after profile is confirmed).
{
  "type": "fetch_profiles"
}

## CURRENT STATE
- Stage: ${currentStage}
- Participants: ${participantList}

## STAGE FLOW RULES
1. **${STAGES.INTRODUCTION}** → ${STAGES.PROFILE_CREATION}
   - Move to profile_creation once user wants to start creating their profile

2. **${STAGES.PROFILE_CREATION}** → STAYS HERE
   - Keep asking questions to build the profile
   - Gather: age, interests, preferences, photos, bio, etc.
   - Use update_profile_data to store information
   - DO NOT progress until user explicitly confirms profile is complete

3. **${STAGES.PROFILE_CREATION}** → ${STAGES.PROFILE_CONFIRMATION}
   - Only when you have enough information
   - Present the complete profile summary
   - Ask: "Is this your final profile?" or similar

4. **${STAGES.PROFILE_CONFIRMATION}** → ${STAGES.FETCHING_PROFILES}
   - Only when user confirms: "yes", "looks good", "that's my final profile"
   - Use fetch_profiles action to get recommendations
   - This is ONE-WAY - cannot go back to profile creation

5. **${STAGES.FETCHING_PROFILES}** → TERMINAL
   - Display recommended profiles
   - No going back to profile creation

## RESPONSE FORMAT
You MUST return your response in this exact JSON format:

{
  "message": "Your conversational response to the user",
  "actions": [
    {action object 1},
    {action object 2}
  ],
  "reasoning": "Brief explanation of why you chose these actions"
}

IMPORTANT:
- ALWAYS include the "message" field with your conversational response
- Include "actions" array with any actions you want to perform
- Actions are executed in order
- Keep messages conversational and friendly
- Only progress stages when appropriate based on the rules above
`;
}

/**
 * Execute an action
 * @param {Object} action - Action to execute
 * @param {Object} session - Current session
 * @param {Function} twilioSendMessage - Function to send messages via Twilio
 * @returns {Promise<Object>} Updated session or action result
 */
async function executeAction(action, session, twilioSendMessage = null) {
  logger.info('Executing action', {
    type: action.type,
    sessionId: session.sessionId
  });

  switch (action.type) {
    case ACTION_TYPES.SEND_MESSAGE:
      return await executeSendMessage(action, session, twilioSendMessage);

    case ACTION_TYPES.UPDATE_STAGE:
      return await executeUpdateStage(action, session);

    case ACTION_TYPES.UPDATE_PROFILE_DATA:
      return await executeUpdateProfileData(action, session);

    case ACTION_TYPES.FETCH_PROFILES:
      return await executeFetchProfiles(action, session);

    default:
      logger.warn('Unknown action type', { type: action.type });
      return { success: false, error: 'Unknown action type' };
  }
}

/**
 * Execute send_message action
 *
 * NOTE: Now using manual broadcasting for full control over message formatting
 */
async function executeSendMessage(action, session, twilioSendMessage) {
  const { target, message } = action;

  if (!message) {
    return { success: false, error: 'Message is required' };
  }

  const recipients = [];

  if (target === 'all') {
    recipients.push(...session.participants.map(p => p.phoneNumber));
  } else {
    // Find participant by phone number or name
    const participant = session.participants.find(
      p => p.phoneNumber === target || p.name === target
    );
    if (participant) {
      recipients.push(participant.phoneNumber);
    }
  }

  logger.info('Sending message to recipients', {
    recipients,
    sessionId: session.sessionId
  });

  // If twilioSendMessage function is provided, use it
  if (twilioSendMessage) {
    for (const phoneNumber of recipients) {
      try {
        await twilioSendMessage(phoneNumber, message);
      } catch (error) {
        logger.error('Failed to send message', { phoneNumber, error: error.message });
      }
    }
  }

  return {
    success: true,
    action: 'message_sent',
    recipients,
    message
  };
}

/**
 * Execute update_stage action
 */
async function executeUpdateStage(action, session) {
  const { stage } = action;

  if (!Object.values(STAGES).includes(stage)) {
    return { success: false, error: 'Invalid stage' };
  }

  // Validate stage transitions
  const currentStage = session.stage;

  // Cannot go backwards from fetching_profiles
  if (currentStage === STAGES.FETCHING_PROFILES) {
    logger.warn('Cannot transition from fetching_profiles', {
      currentStage,
      requestedStage: stage
    });
    return {
      success: false,
      error: 'Cannot go back from fetching_profiles stage'
    };
  }

  session.stage = stage;

  logger.info('Stage updated', {
    sessionId: session.sessionId,
    oldStage: currentStage,
    newStage: stage
  });

  return {
    success: true,
    action: 'stage_updated',
    oldStage: currentStage,
    newStage: stage
  };
}

/**
 * Execute update_profile_data action
 */
async function executeUpdateProfileData(action, session) {
  const { data } = action;

  if (!data || typeof data !== 'object') {
    return { success: false, error: 'Data must be an object' };
  }

  // Merge new data with existing profile data
  session.data = {
    ...session.data,
    ...data,
    // Preserve photos array
    photos: session.data.photos || [],
    // Merge arrays properly
    interests: data.interests ?
      [...new Set([...(session.data.interests || []), ...data.interests])] :
      (session.data.interests || [])
  };

  logger.info('Profile data updated', {
    sessionId: session.sessionId,
    updatedFields: Object.keys(data)
  });

  return {
    success: true,
    action: 'profile_updated',
    updatedFields: Object.keys(data)
  };
}

/**
 * Execute fetch_profiles action
 */
async function executeFetchProfiles(action, session) {
  // Validate that we're in the right stage
  if (session.stage !== STAGES.PROFILE_CONFIRMATION &&
      session.stage !== STAGES.FETCHING_PROFILES) {
    return {
      success: false,
      error: 'Can only fetch profiles after profile confirmation'
    };
  }

  // TODO: Implement actual profile fetching logic
  // For now, just mark as fetching
  session.stage = STAGES.FETCHING_PROFILES;

  logger.info('Fetching profiles', {
    sessionId: session.sessionId,
    profileData: session.data
  });

  return {
    success: true,
    action: 'profiles_fetched',
    message: 'Profile matching initiated'
  };
}

/**
 * Log action to session history
 * @param {Object} session - Session object
 * @param {Object} action - Action that was executed
 * @param {Object} result - Result of action execution
 */
function logAction(session, action, result) {
  if (!session.actions) {
    session.actions = [];
  }

  session.actions.push({
    timestamp: new Date().toISOString(),
    type: action.type,
    action: action,
    result: result,
    success: result.success
  });

  logger.debug('Action logged to session', {
    sessionId: session.sessionId,
    actionType: action.type,
    totalActions: session.actions.length
  });
}

/**
 * Parse AI response and extract actions
 * @param {string} aiResponse - Raw AI response
 * @returns {Object} Parsed response with message and actions
 */
function parseAIResponse(aiResponse) {
  try {
    // Try to parse as JSON first
    const parsed = JSON.parse(aiResponse);

    if (parsed.message && Array.isArray(parsed.actions)) {
      return parsed;
    }

    // If structure is wrong, treat as plain message
    return {
      message: aiResponse,
      actions: [],
      reasoning: 'Plain text response'
    };
  } catch (error) {
    // Not valid JSON, treat as plain message
    logger.debug('AI response not in JSON format, treating as plain text');
    return {
      message: aiResponse,
      actions: [],
      reasoning: 'Plain text response'
    };
  }
}

module.exports = {
  STAGES,
  ACTION_TYPES,
  getActionInstructions,
  executeAction,
  logAction,
  parseAIResponse
};
