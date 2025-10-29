/**
 * Core Constants
 * Shared constants used across the application
 */

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
  SEND_TEMPLATE_MESSAGE: 'send_template_message',
  UPDATE_STAGE: 'update_stage',
  UPDATE_PROFILE_SCHEMA: 'update_profile_schema',
  UPDATE_PROFILE_DATA: 'update_profile_data', // Deprecated, use UPDATE_PROFILE_SCHEMA
  GENERATE_PROFILE: 'generate_profile',
  COMMIT_PROFILE: 'commit_profile',
  FETCH_PROFILES: 'fetch_profiles'
};

module.exports = {
  STAGES,
  ACTION_TYPES
};
