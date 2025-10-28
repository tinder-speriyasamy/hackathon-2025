/**
 * Actions System
 * Defines possible actions the AI can take and executes them
 */

const logger = require('../utils/logger');
const {
  INTEREST_CATEGORIES,
  GENDER_OPTIONS,
  getMissingFields,
  getFieldDisplayName,
  isSchemaComplete,
  isSchemaCompleteForGeneration,
  getMissingFieldsForGeneration,
  updateField,
  initializeProfileSchema
} = require('./profile-schema');
const { renderProfileCard } = require('./profile-renderer');

/**
 * Import constants from shared constants file
 * Re-exported for backward compatibility
 */
const { STAGES, ACTION_TYPES } = require('./constants');

/**
 * Get formatted action instructions for AI prompt
 *
 * NOTE: This function has been moved to src/prompts/action-instructions.js
 * to enable independent iteration by multiple agents.
 *
 * This re-export is maintained for backward compatibility.
 */
const { getActionInstructions } = require('../prompts/action-instructions');

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

    case ACTION_TYPES.UPDATE_PROFILE_SCHEMA:
      return await executeUpdateProfileSchema(action, session);

    case ACTION_TYPES.UPDATE_PROFILE_DATA:
      // Deprecated: Redirect to UPDATE_PROFILE_SCHEMA
      return await executeUpdateProfileData(action, session);

    case ACTION_TYPES.GENERATE_PROFILE:
      return await executeGenerateProfile(action, session);

    case ACTION_TYPES.COMMIT_PROFILE:
      return await executeCommitProfile(action, session);

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
  const { target, message, mediaUrl } = action;

  logger.debug('Executing send_message action', {
    sessionId: session.sessionId,
    target,
    hasMessage: !!message,
    hasMediaUrl: !!mediaUrl,
    messageLength: message?.length || 0
  });

  if (!message) {
    logger.error('❌ Message is required for send_message action', {
      sessionId: session.sessionId
    });
    return { success: false, error: 'Message is required' };
  }

  const recipients = [];

  if (target === 'all') {
    recipients.push(...session.participants.map(p => p.phoneNumber));
    logger.debug('Broadcasting to all participants', {
      sessionId: session.sessionId,
      participantCount: recipients.length
    });
  } else {
    // Find participant by phone number or name
    const participant = session.participants.find(
      p => p.phoneNumber === target || p.name === target
    );
    if (participant) {
      recipients.push(participant.phoneNumber);
      logger.debug('Sending to specific participant', {
        sessionId: session.sessionId,
        target,
        recipientName: participant.name
      });
    } else {
      logger.warn('Target participant not found', {
        sessionId: session.sessionId,
        target
      });
    }
  }

  logger.info('📤 Sending message to recipients', {
    recipients,
    recipientCount: recipients.length,
    sessionId: session.sessionId,
    hasMedia: !!mediaUrl,
    messagePreview: message.substring(0, 50) + (message.length > 50 ? '...' : '')
  });

  // If twilioSendMessage function is provided, use it
  if (twilioSendMessage) {
    for (const phoneNumber of recipients) {
      try {
        await twilioSendMessage(phoneNumber, message, mediaUrl);
        logger.debug('✅ Message sent successfully', {
          sessionId: session.sessionId,
          phoneNumber,
          hasMedia: !!mediaUrl
        });
      } catch (error) {
        logger.error('❌ Failed to send message', {
          sessionId: session.sessionId,
          phoneNumber,
          error: error.message
        });
      }
    }
  }

  return {
    success: true,
    action: 'message_sent',
    recipients,
    message,
    mediaUrl
  };
}

/**
 * Execute update_stage action
 */
async function executeUpdateStage(action, session) {
  const { stage } = action;

  logger.debug('Executing update_stage action', {
    sessionId: session.sessionId,
    currentStage: session.stage,
    requestedStage: stage
  });

  if (!Object.values(STAGES).includes(stage)) {
    logger.error('Invalid stage requested', {
      sessionId: session.sessionId,
      requestedStage: stage,
      validStages: Object.values(STAGES)
    });
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

  logger.info('✅ Stage updated successfully', {
    sessionId: session.sessionId,
    oldStage: currentStage,
    newStage: stage,
    stageTransition: `${currentStage} → ${stage}`
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
 * Execute update_profile_schema action
 */
async function executeUpdateProfileSchema(action, session) {
  const { field, value } = action;

  logger.debug('Executing update_profile_schema action', {
    sessionId: session.sessionId,
    field,
    valueType: typeof value,
    isArray: Array.isArray(value),
    valuePreview: Array.isArray(value) ? `[${value.length} items]` : String(value).substring(0, 50)
  });

  if (!field || value === undefined || value === null) {
    logger.error('Missing field or value in update_profile_schema', {
      sessionId: session.sessionId,
      hasField: !!field,
      hasValue: value !== undefined && value !== null
    });
    return { success: false, error: 'Field and value are required' };
  }

  // Initialize profileSchema if it doesn't exist
  if (!session.profileSchema) {
    logger.debug('Initializing profile schema for session', {
      sessionId: session.sessionId
    });
    session.profileSchema = initializeProfileSchema();
  }

  // Use the schema's updateField function for validation
  const result = updateField(session.profileSchema, field, value);

  if (!result.success) {
    logger.warn('❌ Failed to update profile schema field', {
      sessionId: session.sessionId,
      field,
      error: result.error,
      attemptedValue: value
    });
    return result;
  }

  logger.info('✅ Profile schema field updated', {
    sessionId: session.sessionId,
    field,
    fieldDisplayName: getFieldDisplayName(field),
    valueType: typeof value,
    newValue: Array.isArray(value) ? value : String(value).substring(0, 100)
  });

  // Log completion status after update
  const missingFields = getMissingFields(session.profileSchema);
  const isComplete = isSchemaComplete(session.profileSchema);

  logger.debug('Profile schema status after update', {
    sessionId: session.sessionId,
    isComplete,
    missingFieldsCount: missingFields.length,
    missingFields: missingFields.map(f => getFieldDisplayName(f))
  });

  return {
    success: true,
    action: 'schema_field_updated',
    field,
    message: result.message
  };
}

/**
 * Execute generate_profile action
 */
async function executeGenerateProfile(action, session) {
  logger.info('🎨 Starting profile generation', {
    sessionId: session.sessionId,
    currentStage: session.stage,
    hasProfileSchema: !!session.profileSchema
  });

  // Allow profile preview at any time as long as minimum fields are present
  // No stage restrictions - users can view and regenerate the profile card anytime
  logger.debug('Profile generation allowed at current stage', {
    sessionId: session.sessionId,
    currentStage: session.stage
  });

  // Validate profile has minimum required fields for rendering (name, age, photo)
  // Note: AI is encouraged to collect ALL fields, but generation only requires these 3
  if (!session.profileSchema || !isSchemaCompleteForGeneration(session.profileSchema)) {
    const missing = getMissingFieldsForGeneration(session.profileSchema || {});
    logger.error('❌ Profile missing required fields for generation', {
      sessionId: session.sessionId,
      hasSchema: !!session.profileSchema,
      missingFields: missing,
      missingCount: missing.length,
      note: 'Only name, age, and photo are required for generation'
    });
    return {
      success: false,
      error: `Cannot generate profile. Missing required fields: ${missing.join(', ')} (name, age, and photo are required)`
    };
  }

  // Log complete profile schema data
  const photoValue = session.profileSchema.photo || '';

  logger.info('✅ Profile schema validated', {
    sessionId: session.sessionId,
    profileData: {
      name: session.profileSchema.name,
      age: session.profileSchema.age,
      gender: session.profileSchema.gender,
      hasPhoto: !!session.profileSchema.photo,
      photoUrl: photoValue.substring(0, 100),
      schoolCount: session.profileSchema.schools?.length || 0,
      schools: session.profileSchema.schools,
      interestedIn: session.profileSchema.interested_in,
      interestCount: session.profileSchema.interests?.length || 0,
      interests: session.profileSchema.interests
    }
  });

  // Generate the profile object
  const profileId = `profile_${session.sessionId}_${Date.now()}`;
  const generatedProfile = {
    id: profileId,
    ...session.profileSchema,
    createdAt: new Date().toISOString(),
    status: 'pending_review'
  };

  logger.debug('Profile object created', {
    sessionId: session.sessionId,
    profileId,
    profileStatus: generatedProfile.status,
    photoUrl: generatedProfile.photo?.substring(0, 100) || 'none'
  });

  // Render profile card as image
  logger.info('📸 Starting profile card rendering', {
    sessionId: session.sessionId,
    profileId,
    profileName: generatedProfile.name
  });

  let profileCardImage = null;
  try {
    const renderStartTime = Date.now();
    profileCardImage = await renderProfileCard(generatedProfile);
    const renderDuration = Date.now() - renderStartTime;

    generatedProfile.profileCardImage = profileCardImage;

    logger.info('✅ Profile card rendered successfully', {
      sessionId: session.sessionId,
      profileId,
      imagePath: profileCardImage,
      renderDuration: `${renderDuration}ms`
    });
  } catch (error) {
    logger.error('❌ Failed to render profile card', {
      sessionId: session.sessionId,
      profileId,
      error: error.message,
      stack: error.stack
    });
    // Continue without the image - not a fatal error
  }

  // Store generated profile in session
  session.generatedProfile = generatedProfile;

  // Update stage to review
  const oldStage = session.stage;
  session.stage = STAGES.PROFILE_REVIEW;

  logger.info('✅ Profile generation complete', {
    sessionId: session.sessionId,
    profileId,
    stageTransition: `${oldStage} → ${STAGES.PROFILE_REVIEW}`,
    hasProfileCard: !!profileCardImage,
    profileStatus: generatedProfile.status
  });

  return {
    success: true,
    action: 'profile_generated',
    profile: generatedProfile,
    profileCardImage: profileCardImage,
    message: 'Profile successfully generated and ready for review'
  };
}

/**
 * Execute commit_profile action
 */
async function executeCommitProfile(action, session) {
  logger.info('💾 Starting profile commit', {
    sessionId: session.sessionId,
    currentStage: session.stage,
    hasGeneratedProfile: !!session.generatedProfile
  });

  // Validate that we're in the right stage
  if (session.stage !== STAGES.PROFILE_REVIEW) {
    logger.error('❌ Invalid stage for profile commit', {
      sessionId: session.sessionId,
      currentStage: session.stage,
      requiredStage: STAGES.PROFILE_REVIEW
    });
    return {
      success: false,
      error: 'Can only commit profile from review stage'
    };
  }

  // Validate generated profile exists
  if (!session.generatedProfile) {
    logger.error('❌ No generated profile to commit', {
      sessionId: session.sessionId,
      hasGeneratedProfile: false
    });
    return {
      success: false,
      error: 'No generated profile found to commit'
    };
  }

  const profileId = session.generatedProfile.id;
  const profileName = session.generatedProfile.name;

  // Update profile status
  session.generatedProfile.status = 'committed';
  session.generatedProfile.committedAt = new Date().toISOString();

  logger.debug('Profile status updated', {
    sessionId: session.sessionId,
    profileId,
    oldStatus: 'pending_review',
    newStatus: 'committed',
    committedAt: session.generatedProfile.committedAt
  });

  // Store committed profile
  session.committedProfile = session.generatedProfile;

  // Update stage
  const oldStage = session.stage;
  session.stage = STAGES.PROFILE_COMMITTED;

  logger.info('✅ Profile committed successfully', {
    sessionId: session.sessionId,
    profileId,
    profileName,
    stageTransition: `${oldStage} → ${STAGES.PROFILE_COMMITTED}`,
    committedAt: session.committedProfile.committedAt,
    hasProfileCard: !!session.committedProfile.profileCardImage
  });

  // TODO: Store profile in permanent storage (database)
  logger.debug('TODO: Persist profile to database', {
    sessionId: session.sessionId,
    profileId
  });

  return {
    success: true,
    action: 'profile_committed',
    profile: session.committedProfile,
    message: 'Profile successfully committed!'
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

    // Log raw response for debugging
    logger.debug('Parsed AI JSON response', {
      hasMessage: !!parsed.message,
      messageLength: parsed.message?.length || 0,
      hasActions: !!parsed.actions,
      actionCount: parsed.actions?.length || 0,
      hasReasoning: !!parsed.reasoning,
      keys: Object.keys(parsed)
    });

    // Accept response if it has either message OR actions (or both)
    if (parsed.message || (parsed.actions && Array.isArray(parsed.actions))) {
      return {
        message: parsed.message || '',
        actions: parsed.actions || [],
        reasoning: parsed.reasoning || ''
      };
    }

    // If structure is completely wrong, log full response and treat as plain message
    logger.warn('AI JSON response missing required fields', {
      parsedKeys: Object.keys(parsed),
      responsePreview: aiResponse.substring(0, 200)
    });

    return {
      message: aiResponse,
      actions: [],
      reasoning: 'Plain text response'
    };
  } catch (error) {
    // Not valid JSON, treat as plain message
    logger.debug('AI response not in JSON format, treating as plain text', {
      errorMessage: error.message,
      responsePreview: aiResponse.substring(0, 200)
    });
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
