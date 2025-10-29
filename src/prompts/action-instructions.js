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
  ORIENTATION_OPTIONS,
  RELATIONSHIP_INTENT_OPTIONS,
  PROFILE_PROMPTS,
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
2. **send_template_message**: {"type": "send_template_message", "templateType": "profile_confirmation|profile_review", "variables": {}} - Send interactive button template
3. **update_stage**: {"type": "update_stage", "stage": "introduction|profile_creation|profile_confirmation|profile_generation|profile_review|profile_committed"}
4. **update_profile_schema**: {"type": "update_profile_schema", "field": "name|age|gender|photo|schools|interested_in|interests|sexual_orientation|relationship_intent|height|bio|prompts", "value": "value"}
5. **generate_profile**: {"type": "generate_profile"} - Can be called when minimum fields (name, age, photo) are collected. Generates/regenerates the profile card image. Users can iterate: change fields → generate → review → repeat.
6. **commit_profile**: {"type": "commit_profile"} - Use ONLY after user explicitly approves final profile. This finalizes the profile and advances to fetching_profiles stage.

**IMPORTANT - Profile Generation Requirements:**
- MINIMUM required for generation: name, age, photo (only these 3 fields)
- You SHOULD try to collect ALL fields below for a complete profile
- BUT you CAN generate a profile preview once name/age/photo are collected
- Other fields enhance the profile but are NOT blockers for generation

## CURRENT STATE
Stage: ${currentStage} | Participants: ${participantList} | Schema Complete: ${schemaComplete ? 'YES' : 'NO'}

${missingFields.length > 0 ? `Missing Fields:\n${missingFieldsDisplay}` : 'All required fields complete!'}

${uploadedPhotos.length > 0 ? `Uploaded Photos:\n${photosDisplay}` : 'No photos uploaded yet'}

## PROFILE SCHEMA
**IMPORTANT:** Try to collect ALL fields below for the best profile. However, you can generate a profile preview once you have name, age, and photo. These are the ONLY required fields for generation.

Fields to collect (aim for all, minimum: name/age/photo):

1. **name**: User's first name
2. **age**: User's age (number, 18-100)
3. **gender**: ${GENDER_OPTIONS.join('/')}
4. **photo**: ${uploadedPhotos.length > 0
     ? `Use EXACT URL from above (starts with https://). Latest: ${uploadedPhotos[uploadedPhotos.length - 1]}`
     : 'Ask user to upload. URL will appear above when uploaded.'}
5. **schools**: Array of schools (e.g., ["Harvard", "MIT"])
6. **interested_in**: ${GENDER_OPTIONS.join('/')}/Everyone
7. **interests**: At least 2 interests. Ask naturally in conversation. Any non-empty strings work.
8. **sexual_orientation**: ${ORIENTATION_OPTIONS.join('/')} - Ask: "How do you usually label your orientation?"
9. **relationship_intent**: What they're looking for:
   - "${RELATIONSHIP_INTENT_OPTIONS[0]}" (serious commitment)
   - "${RELATIONSHIP_INTENT_OPTIONS[1]}" (primarily serious)
   - "${RELATIONSHIP_INTENT_OPTIONS[2]}" (open to possibilities)
   - "${RELATIONSHIP_INTENT_OPTIONS[3]}" (exploring)
   Ask casually: "What are you open to?" and map their response.
10. **height**: String format like "5'6\"" or "170cm". Ask naturally.
11. **bio**: 10-500 characters. Create from conversation or ask friends to describe them.
12. **prompts**: Array of 3 prompt answers. Use these EXACT questions:
    - "${PROFILE_PROMPTS[0]}"
    - "${PROFILE_PROMPTS[1]}"
    - "${PROFILE_PROMPTS[2]}"
    Each prompt should be: {"question": "prompt text", "answer": "their answer"}
    Weave questions naturally into conversation. Friends can help answer!

## STAGE FLOW
- **introduction** → **profile_creation**: Greet warmly, transition when ready
- **profile_creation**: Collect ALL schema fields via update_profile_schema. ANY participant can answer. Stay here until complete.
- **profile_creation** → **profile_confirmation**: When schema 100% complete, show summary, ask for confirmation
- **profile_confirmation**: IMPORTANT - Use send_template_message with templateType="profile_confirmation":
  - Build profile summary in variables: {"1": "Name: X\\nAge: Y\\nGender: Z\\n..."}
  - Template has buttons: "Yes, generate! ✨", "Make changes", "Start over"
  - This replaces your confirmation message - template will be sent instead
- **profile_confirmation** → **profile_generation**: On user approval, call generate_profile
- **profile_generation** → **profile_review**: Auto-transition. Profile card image generated.
- **profile_review**: IMPORTANT - Use send_template_message with templateType="profile_review":
  - No variables needed (template text is static)
  - Template has buttons: "Perfect! ✅", "Change photo 📸", "Edit details ✏️"
  - This replaces your review message - template will be sent instead
  - User can iterate freely: change fields → generate → review → repeat
- **profile_review** → **profile_committed**: ONLY on explicit approval, call commit_profile to finalize
- **profile_committed** → **fetching_profiles**: Offer to show matches

**IMPORTANT**:
- Templates replace regular messages at confirmation/review stages - don't send both!
- generate_profile can be called at ANY time once schema is complete, even during profile_review
- Only commit_profile finalizes the profile and advances to the next stage

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
