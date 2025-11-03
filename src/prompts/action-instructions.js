/**
 * Action Instructions for AI Prompt
 *
 * This file contains the instructions for available actions the AI can take.
 * Agents can modify this file independently to iterate on action definitions,
 * stage flow rules, and response formats without affecting other parts of the codebase.
 */

const {
  GENDER_OPTIONS,
  ORIENTATION_OPTIONS,
  RELATIONSHIP_INTENT_OPTIONS,
  PROFILE_PROMPTS,
  getMissingFields,
  getFieldDisplayName,
  isSchemaComplete
} = require('../core/profile-schema');

const { STAGES, CORE_STAGE_FLOW, STAGE_SUMMARIES } = require('../core/constants');

function formatValue(value) {
  if (Array.isArray(value)) {
    return value.length ? value.join(', ') : null;
  }
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value);
  }
  return value;
}

function buildProfileSummary(profileSchema = {}) {
  const entries = [];
  const fields = [
    'name',
    'age',
    'gender',
    'sexual_orientation',
    'relationship_intent',
    'education_level',
    'schools',
    'interests',
    'interested_in',
    'height',
    'bio'
  ];

  for (const field of fields) {
    const value = profileSchema[field];
    if (value === null || value === undefined) continue;
    const formatted = formatValue(value);
    if (!formatted || (typeof formatted === 'string' && !formatted.trim())) continue;
    entries.push(`${getFieldDisplayName(field)}: ${formatted}`);
  }

  if (profileSchema.prompts && profileSchema.prompts.length) {
    profileSchema.prompts.forEach((prompt, index) => {
      if (prompt?.question && prompt?.answer) {
        entries.push(`Prompt ${index + 1} – ${prompt.question}: ${prompt.answer}`);
      }
    });
  }

  return entries.length ? entries.join('\n') : 'No profile data captured yet';
}

const STAGE_TIPS = {
  [STAGES.GREETING]: `• Welcome the group warmly and explain the profile building flow.
• Automatically infer names from messages, then confirm: "are we creating this for you, [name]?"
• If someone nominates a different person, confirm the switch.
• Once confirmed, transition with {"type":"update_stage","stage":"${STAGES.COLLECTING}"}.`,

  [STAGES.COLLECTING]: `• Ask ONE question at a time, pairing acknowledgment + next question in single send_message.
• Store each answer with update_profile_schema.
• As user is responding freeform from mobile, if they respond with shorthand answers/typos, like 170 for 170cm or 5.4 for 5'4", infer the answer and store the correct value. Do this for all fields
• When you have enough basic data (at minimum: name, age, photo), ASK if they're ready to respond to prompts (include friends in the invitation if there are multiple participants in the session).
• Ask follow questions to get more details if you can't infer the answer from the freeform response. Once confirmed, call update_profile_schema to store the answer.
• If they say YES to prompts: Ask the three prompts one at a time (use the prompts from the schema checklist below).
• If they say NO to prompts: Call the ATOMIC action {"type":"show_confirmation"} to proceed to confirmation.
• The show_confirmation action does everything: builds recap + sends template to confirm + transitions stage automatically.`,

  [STAGES.CONFIRMING]: `• You arrive here because show_confirmation was called - template already sent to user.
• WAIT for user button response. Do NOT resend template unless explicitly requested.
• User clicks button or types "Yes, generate! ✨" (or any variation like "yes generate", "generate", "yes!", "✨") → IMMEDIATELY call {"type":"generate_profile"} (this is atomic: generates + sends URL + transitions to ${STAGES.REVIEWING})
• IMPORTANT: Detect button clicks generously - any affirmative response about generating should trigger generate_profile
• User clicks "Make changes" or requests edits: Ask what to change, update with update_profile_schema, then call {"type":"show_confirmation"} again to refresh.`,

  [STAGES.REVIEWING]: `• You arrive here because generate_profile was called - profile URL already sent to user.
• User expresses approval in ANY form (be generous with detection): "perfect", "love it", "looks good", "looks great", "amazing", "awesome", "nice", "great", emojis like ✅/👍/🔥, "let's do it", "let's go", "ship it", "good to go", "ready", or similar positive sentiment → IMMEDIATELY call {"type":"finalize_profile"}
• finalize_profile is atomic: commits + triggers daily_drop + transitions to ${STAGES.FINALIZED} + returns matches
• User requests edits or changes: Update with update_profile_schema, then call {"type":"generate_profile"} again to regenerate.
• DON'T manually call commit_profile, daily_drop, or update_stage - finalize_profile does it all.`,

  [STAGES.FINALIZED]: `• You arrive here because finalize_profile was called - profile is committed and daily drop triggered.
• Check "Daily Drop:" section above - if matches exist, present them immediately with enthusiasm.
• Use the three-message pattern: hype intro → numbered list with URLs → choice prompt (1/2/both/neither).
• Keep tone celebratory and forward-looking.`,

  [STAGES.FETCHING_PROFILES]: `• Waiting on match results. Share whatever came back and keep conversation warm.`
};

function formatStageFlow() {
  const lines = CORE_STAGE_FLOW.map((stage, index) => `${index + 1}. ${stage} — ${STAGE_SUMMARIES[stage]}`);
  lines.push(`Optional: ${STAGES.FETCHING_PROFILES} — ${STAGE_SUMMARIES[STAGES.FETCHING_PROFILES]}`);
  return lines.join('\n');
}

function getStageTip(stage) {
  return STAGE_TIPS[stage] || 'Stay responsive and keep nudging the flow forward.';
}

/**
 * Get formatted action instructions for AI prompt
 * @param {string} currentStage - Current conversation stage
 * @param {Array} participants - Session participants
 * @param {Object} profileSchema - Current profile schema data
 * @param {Object} sessionData - Session data including photos
 * @param {Object} session - Full session object (for generatedProfile, dailyDrops, etc.)
 * @returns {string} Formatted action instructions
 */
function getActionInstructions(currentStage, participants, profileSchema = {}, sessionData = {}, session = {}) {
  const participantList = participants.map(p => `${p.name} (${p.phoneNumber})`).join(', ');
  const missingFields = getMissingFields(profileSchema);
  const schemaComplete = isSchemaComplete(profileSchema);
  const primaryUserName = session.primaryUser?.name || 'Unknown';

  // Build missing fields display
  const missingFieldsDisplay = missingFields.length > 0
    ? missingFields.map(f => `- ${getFieldDisplayName(f)}`).join('\n')
    : 'All required fields complete!';

  // Build uploaded photos display
  const uploadedPhotos = sessionData.photos || [];
  const photosDisplay = uploadedPhotos.length > 0
    ? uploadedPhotos.map((url, index) => `${index + 1}. ${url}`).join('\n')
    : 'No photos uploaded yet';

  // Build generated profile display
  const generatedProfileDisplay = session.generatedProfile
    ? `Generated ✅ | Status: ${session.generatedProfile.status || 'unknown'} | URL: ${session.generatedProfile.profileUrl || 'N/A'}`
    : 'No profile generated yet';

  const dailyDropDisplay = (() => {
    if (!session.dailyDrops || session.dailyDrops.length === 0) {
      return 'No daily drop yet';
    }
    const latestDrop = session.dailyDrops[session.dailyDrops.length - 1];
    return `Latest (${latestDrop.timestamp}):
 ${latestDrop.profiles.map((p, i) => `${i + 1}. ${p.name}, ${p.age} — ${p.description}
    ${p.profileUrl}`).join('\n')}
 
 Present these immediately using the daily-drop message stack.`;
   })();

  const profileSummary = buildProfileSummary(session.profileSchema || {});

  return `
## HOW TO RESPOND
- Return JSON with an "actions" array (execution order) plus a short "reasoning" line.
- Keep send_message + update_profile_schema paired when capturing data.
- Combine acknowledgement + next question inside ONE send_message.
- Reasoning stays one sentence about intent (e.g., "Stored age, asked for school").

**CRITICAL - Atomic Actions Eliminate Coordination:**
- NEVER manually send templates with send_template_message - atomic actions handle this.
- Templates are sent automatically by atomic actions - you just call the action.
- After atomic action completes, WAIT for user response before proceeding.

**Handling Validation Failures:**
- If update_profile_schema fails for a non-essential field (like interests), continue the flow - don't get stuck.
- Essential fields are: name, age, photo. If these exist, you can proceed to generate.
- Photos in the "Photos:" section (above) satisfy the photo requirement - don't try to update a "profile photo" field.
- Unknown field errors mean the field doesn't exist in the schema - skip it and move on.

### Action Reference

**Simple Actions** (manual, you control when to call):
1. send_message — Conversational response. Usually target "all".
2. update_profile_schema — Store field values. Pair with send_message when capturing data.
3. update_stage — Only for GREETING → COLLECTING transition. Everything else uses atomic actions.

**Atomic Actions** (do everything automatically, just call once):
4. show_confirmation — (ATOMIC) Builds profile recap + sends template + transitions to CONFIRMING. Call when ready to show recap.
5. generate_profile — (ATOMIC) Generates profile + sends URL + transitions to REVIEWING. Needs name, age, photo.
6. finalize_profile — (ATOMIC) Commits + triggers daily_drop + transitions to FINALIZED + returns matches. Call on final approval.

### Stage Flow (in order)
${formatStageFlow()}

### Current Snapshot
Stage: ${currentStage}
Participants: ${participantList || 'N/A'}
Primary User: ${primaryUserName}
Schema Complete: ${schemaComplete ? 'YES ✅' : 'NO'}

Missing Fields:
${missingFields.length > 0 ? missingFieldsDisplay : 'All required fields complete! ✅'}

Photos:
${photosDisplay}

Generated Profile:
${generatedProfileDisplay}

Profile Recap Data:
${profileSummary}

Daily Drop:
${dailyDropDisplay}

### Current Stage Focus
${getStageTip(currentStage)}

### Schema Checklist
- Essential to generate: name, age, photo ${uploadedPhotos.length > 0 ? `(latest: ${uploadedPhotos[uploadedPhotos.length - 1]})` : '(ask them to upload a photo)' }
- Identity basics: gender (${GENDER_OPTIONS.join('/')}), interested_in (${GENDER_OPTIONS.join('/')}/Everyone), schools, height
- Orientation & intent: sexual_orientation (${ORIENTATION_OPTIONS.join('/')}), relationship_intent (${RELATIONSHIP_INTENT_OPTIONS.join('/')})
- Personality texture: interests (at least two), bio (10-500 chars), prompts using exactly "${PROFILE_PROMPTS[0]}", "${PROFILE_PROMPTS[1]}", "${PROFILE_PROMPTS[2]}"
- Friends can supply any answer — weave their takes naturally

### Daily Drop Delivery
When results exist, send three messages: hype intro, numbered list with URLs, then the choice prompt (1/2/both/neither). Never invent profiles.

### Response Format
{
  "actions": [
    {"type": "send_message", "target": "all", "message": "ack + next question"},
    {"type": "update_profile_schema", "field": "age", "value": "25"}
  ],
  "reasoning": "Stored age, asked for school"
}`;
}

module.exports = {
  getActionInstructions,
  buildProfileSummary
};
