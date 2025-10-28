/**
 * Action Instructions for AI Prompt
 *
 * This file contains the instructions for available actions the AI can take.
 * Agents can modify this file independently to iterate on action definitions,
 * stage flow rules, and response formats without affecting other parts of the codebase.
 */

const {
  INTEREST_CATEGORIES,
  GENDER_OPTIONS,
  getMissingFields,
  getFieldDisplayName,
  isSchemaComplete
} = require('../core/profile-schema');

const { STAGES } = require('../core/constants');

/**
 * Get formatted action instructions for AI prompt
 * @param {string} currentStage - Current conversation stage
 * @param {Array} participants - Session participants
 * @param {Object} profileSchema - Current profile schema data
 * @param {Object} sessionData - Session data including photos
 * @returns {string} Formatted action instructions
 */
function getActionInstructions(currentStage, participants, profileSchema = {}, sessionData = {}) {
  const participantList = participants.map(p => `${p.name} (${p.phoneNumber})`).join(', ');
  const missingFields = getMissingFields(profileSchema);
  const schemaComplete = isSchemaComplete(profileSchema);

  // Build missing fields display
  const missingFieldsDisplay = missingFields.length > 0
    ? missingFields.map(f => `- ${getFieldDisplayName(f)}`).join('\n')
    : 'All required fields complete!';

  // Build uploaded photos display
  const uploadedPhotos = sessionData.photos || [];
  const photosDisplay = uploadedPhotos.length > 0
    ? uploadedPhotos.map((url, index) => `${index + 1}. ${url}`).join('\n')
    : 'No photos uploaded yet';

  return `
## ACTIONS
You can perform these actions in your response:

1. **send_message**: {"type": "send_message", "target": "phone_number/'all'", "message": "text", "mediaUrl": "optional"}
2. **update_stage**: {"type": "update_stage", "stage": "introduction|profile_creation|profile_confirmation|profile_generation|profile_review|profile_committed"}
3. **update_profile_schema**: {"type": "update_profile_schema", "field": "name|gender|photo|schools|interested_in|interests", "value": "value"}
4. **generate_profile**: {"type": "generate_profile"} - Use ONLY when schema complete & confirmed
5. **commit_profile**: {"type": "commit_profile"} - Use ONLY after user approves

## CURRENT STATE
Stage: ${currentStage} | Participants: ${participantList} | Schema Complete: ${schemaComplete ? 'YES' : 'NO'}

${missingFields.length > 0 ? `Missing Fields:\n${missingFieldsDisplay}` : 'All required fields complete!'}

${uploadedPhotos.length > 0 ? `Uploaded Photos:\n${photosDisplay}` : 'No photos uploaded yet'}

## PROFILE SCHEMA
Required fields to collect:

1. **name**: User's first name
2. **gender**: ${GENDER_OPTIONS.join('/')}
3. **photo**: ${uploadedPhotos.length > 0
     ? `Use EXACT URL from above (starts with https://). Latest: ${uploadedPhotos[uploadedPhotos.length - 1]}`
     : 'Ask user to upload. URL will appear above when uploaded.'}
4. **schools**: Array of schools (e.g., ["Harvard", "MIT"])
5. **interested_in**: ${GENDER_OPTIONS.join('/')}/Everyone
6. **interests**: At least 2 from: ${INTEREST_CATEGORIES.slice(0, 6).join(', ')}, etc.
   Ask naturally in conversation, map responses to predefined categories.

## STAGE FLOW
- **introduction** → **profile_creation**: Greet warmly, transition when ready
- **profile_creation**: Collect ALL schema fields via update_profile_schema. ANY participant can answer. Stay here until complete.
- **profile_creation** → **profile_confirmation**: When schema 100% complete, show summary, ask for confirmation
- **profile_confirmation** → **profile_generation**: On user approval, call generate_profile
- **profile_generation** → **profile_review**: Auto-transition. Profile card image generated. Send it via send_message with mediaUrl from generate_profile result
- **profile_review** → **profile_committed**: On approval, call commit_profile. Celebrate!
- **profile_committed** → **fetching_profiles**: Offer to show matches

## RESPONSE FORMAT
You MUST respond in valid JSON format:
{
  "message": "Your conversational response",
  "actions": [action objects],
  "reasoning": "Why you chose these actions"
}

Keep messages conversational and friendly. Ask questions naturally. Accept input from any participant. Progress stages only when appropriate.
`;
}

module.exports = {
  getActionInstructions
};
