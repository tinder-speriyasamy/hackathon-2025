/**
 * Core Constants
 * Shared constants used across the application
 */

/**
 * Conversation stages
 * @enum {string}
 */
const STAGES = {
  GREETING: 'greeting',
  COLLECTING: 'collecting',
  CONFIRMING: 'confirming',
  REVIEWING: 'reviewing',
  FINALIZED: 'finalized',
  // Legacy stages - kept for backward compatibility, will be migrated
  INTRODUCTION: 'greeting', // Maps to GREETING
  PROFILE_CREATION: 'collecting', // Maps to COLLECTING
  PROFILE_CONFIRMATION: 'confirming', // Maps to CONFIRMING
  PROFILE_REVIEW: 'reviewing', // Maps to REVIEWING
  PROFILE_COMMITTED: 'finalized', // Maps to FINALIZED
  FETCHING_PROFILES: 'fetching_profiles'
};

/**
 * Canonical stage sequence for the core matchmaking flow.
 * Used by prompts to stay consistent about how the experience progresses.
 */
const CORE_STAGE_FLOW = [
  STAGES.GREETING,
  STAGES.COLLECTING,
  STAGES.CONFIRMING,
  STAGES.REVIEWING,
  STAGES.FINALIZED
];

/**
 * Short descriptions for each core stage to avoid duplicating intent across prompts.
 */
const STAGE_SUMMARIES = {
  [STAGES.GREETING]: 'Welcome the group, identify primary user, and set expectations for the profile building flow.',
  [STAGES.COLLECTING]: 'Gather profile data through natural one-question-at-a-time conversation.',
  [STAGES.CONFIRMING]: 'User reviews profile recap via interactive template and decides to generate or make changes.',
  [STAGES.REVIEWING]: 'User reviews generated profile URL and provides feedback for edits or final approval.',
  [STAGES.FINALIZED]: 'Profile is locked and committed. Present daily drop matches to user.',
  [STAGES.FETCHING_PROFILES]: 'Optional holding state while surfacing matches (used by daily drop flows).'
};

/**
 * Action types the AI can perform
 * @enum {string}
 */
const ACTION_TYPES = {
  SEND_MESSAGE: 'send_message',
  SEND_TEMPLATE_MESSAGE: 'send_template_message', // Legacy - should not be called by LLM directly
  UPDATE_STAGE: 'update_stage',
  UPDATE_PROFILE_SCHEMA: 'update_profile_schema',
  UPDATE_PROFILE_DATA: 'update_profile_data', // Deprecated, use UPDATE_PROFILE_SCHEMA
  GENERATE_PROFILE: 'generate_profile', // Atomic: generates + sends URL + transitions to REVIEWING
  COMMIT_PROFILE: 'commit_profile', // Legacy - use FINALIZE_PROFILE instead
  FETCH_PROFILES: 'fetch_profiles',
  DAILY_DROP: 'daily_drop',
  // New atomic actions
  SHOW_CONFIRMATION: 'show_confirmation', // Atomic: builds recap + sends template + transitions to CONFIRMING
  FINALIZE_PROFILE: 'finalize_profile' // Atomic: commits + daily_drop + transitions to FINALIZED + returns matches
};

module.exports = {
  STAGES,
  ACTION_TYPES,
  CORE_STAGE_FLOW,
  STAGE_SUMMARIES
};
