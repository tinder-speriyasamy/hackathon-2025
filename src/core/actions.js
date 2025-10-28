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
  updateField,
  initializeProfileSchema
} = require('./profile-schema');
const { renderProfileCard } = require('./profile-renderer');

/**
 * Conversation stages
 * @enum {string}
 */
const STAGES = {
  INTRODUCTION: 'introduction',
  PROFILE_CREATION: 'profile_creation',
  PROFILE_CONFIRMATION: 'profile_confirmation',
  PROFILE_GENERATION: 'profile_generation',
  PROFILE_REVIEW: 'profile_review',
  PROFILE_COMMITTED: 'profile_committed',
  FETCHING_PROFILES: 'fetching_profiles'
};

/**
 * Action types the AI can perform
 * @enum {string}
 */
const ACTION_TYPES = {
  SEND_MESSAGE: 'send_message',
  UPDATE_STAGE: 'update_stage',
  UPDATE_PROFILE_SCHEMA: 'update_profile_schema',
  UPDATE_PROFILE_DATA: 'update_profile_data', // Deprecated, use UPDATE_PROFILE_SCHEMA
  GENERATE_PROFILE: 'generate_profile',
  COMMIT_PROFILE: 'commit_profile',
  FETCH_PROFILES: 'fetch_profiles'
};

/**
 * Get formatted action instructions for AI prompt
 * @param {string} currentStage - Current conversation stage
 * @param {Array} participants - Session participants
 * @param {Object} profileSchema - Current profile schema data
 * @returns {string} Formatted action instructions
 */
function getActionInstructions(currentStage, participants, profileSchema = {}, sessionData = {}) {
  const participantNames = participants.map(p => p.name || p.phoneNumber);
  const missingFields = getMissingFields(profileSchema);
  const schemaComplete = isSchemaComplete(profileSchema);
  const uploadedPhotos = sessionData.photos || [];
  const lastPhoto = uploadedPhotos.length > 0 ? uploadedPhotos[uploadedPhotos.length - 1] : null;

  const toolManifest = getStageScopedToolManifest(currentStage, { lastPhoto });

  const stateDigest = {
    stage: currentStage,
    participants: participantNames,
    profileComplete: schemaComplete,
    missingFields,
    lastPhoto
  };

  return [
    'TOOLS:',
    JSON.stringify(toolManifest),
    'STATE:',
    JSON.stringify(stateDigest)
  ].join('\n');
}

// Action registry with compact toolcards (purpose, schema, constraints, allowed stages)
const ACTION_REGISTRY = [
  {
    type: 'send_message',
    when: 'Use to send a short reply; attach profile image when available.',
    schema: {
      type: 'object',
      required: ['type', 'target', 'message'],
      properties: {
        type: { const: 'send_message' },
        target: { type: 'string', enum: ['all'] },
        message: { type: 'string' },
        mediaUrl: { type: 'string' }
      }
    },
    constraints: ['message ≤ 2 sentences', 'ALWAYS set target="all" in group chat'],
    stages: ['*']
  },
  {
    type: 'update_stage',
    when: 'Advance to a valid next stage only when conditions are met.',
    schema: {
      type: 'object',
      required: ['type', 'stage'],
      properties: {
        type: { const: 'update_stage' },
        stage: { type: 'string', enum: Object.values(STAGES) }
      }
    },
    constraints: ['Do not go backwards from fetching_profiles'],
    stages: ['*']
  },
  {
    type: 'update_profile_schema',
    when: 'Store or change a single profile field.',
    schema: {
      type: 'object',
      required: ['type', 'field', 'value'],
      properties: {
        type: { const: 'update_profile_schema' },
        field: { type: 'string', enum: ['name','gender','photo','schools','interested_in','interests'] },
        value: {}
      }
    },
    constraints: ['Validate field; interests len ≥ 2; photo must be uploaded URL'],
    stages: [STAGES.PROFILE_CREATION, STAGES.PROFILE_CONFIRMATION]
  },
  {
    type: 'generate_profile',
    when: 'Generate finalized profile after confirmation.',
    schema: { type: 'object', required: ['type'], properties: { type: { const: 'generate_profile' } } },
    constraints: ['Only when schema complete and confirmed'],
    stages: [STAGES.PROFILE_CONFIRMATION, STAGES.PROFILE_GENERATION]
  },
  {
    type: 'commit_profile',
    when: 'Commit profile after review and approval.',
    schema: { type: 'object', required: ['type'], properties: { type: { const: 'commit_profile' } } },
    constraints: ['Only from review stage'],
    stages: [STAGES.PROFILE_REVIEW]
  },
  {
    type: 'fetch_profiles',
    when: 'Start fetching potential matches after commit.',
    schema: { type: 'object', required: ['type'], properties: { type: { const: 'fetch_profiles' } } },
    constraints: ['Only after profile confirmation/commit'],
    stages: [STAGES.PROFILE_CONFIRMATION, STAGES.FETCHING_PROFILES]
  }
];

function getStageScopedToolManifest(currentStage, context = {}) {
  const allowed = ACTION_REGISTRY.filter(a => a.stages.includes('*') || a.stages.includes(currentStage));
  return {
    actions: allowed.map(a => ({
      type: a.type,
      when_to_use: a.when,
      input_schema: a.schema,
      constraints: a.constraints
    })),
    limits: {
      max_actions_per_turn: 2,
      message_sentence_limit: 2
    },
    policy: {
      group_broadcast: 'All messages are posted to the group. Do not DM individuals.',
      addressing: 'Address the last speaker by name in the message text only. Do not list multiple names unless summarizing.'
    },
    hints: context.lastPhoto ? { photo_hint: `Use uploaded photo URL exactly: ${context.lastPhoto}` } : {}
  };
}

function getActionUnionSchema() {
  return {
    oneOf: ACTION_REGISTRY.map(a => a.schema)
  };
}

function getResponseJsonSchema() {
  return {
    name: 'MatchmakerResponse',
    schema: {
      type: 'object',
      required: ['message', 'actions'],
      properties: {
        message: { type: 'string' },
        actions: {
          type: 'array',
          maxItems: 2,
          items: getActionUnionSchema()
        },
        reasoning: { type: 'string' }
      }
    }
  };
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

  // Validate that we're in the right stage
  if (session.stage !== STAGES.PROFILE_CONFIRMATION &&
      session.stage !== STAGES.PROFILE_GENERATION) {
    logger.error('❌ Invalid stage for profile generation', {
      sessionId: session.sessionId,
      currentStage: session.stage,
      requiredStages: [STAGES.PROFILE_CONFIRMATION, STAGES.PROFILE_GENERATION]
    });
    return {
      success: false,
      error: 'Can only generate profile after confirmation'
    };
  }

  // Validate profile schema is complete
  if (!session.profileSchema || !isSchemaComplete(session.profileSchema)) {
    const missing = getMissingFields(session.profileSchema || {});
    logger.error('❌ Profile schema incomplete', {
      sessionId: session.sessionId,
      hasSchema: !!session.profileSchema,
      missingFields: missing,
      missingCount: missing.length
    });
    return {
      success: false,
      error: `Profile schema incomplete. Missing: ${missing.join(', ')}`
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
  getResponseJsonSchema,
  executeAction,
  logAction,
  parseAIResponse
};
