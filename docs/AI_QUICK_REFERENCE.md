# AI System Quick Reference

This is a quick reference guide for working with the AI prompting and action system. For detailed explanations, see [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md).

---

## Quick Links

- **Architecture Overview**: [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md)
- **Base Prompt**: `src/prompts/base-prompt.js`
- **Action Instructions**: `src/prompts/action-instructions.js`
- **Actions Implementation**: `src/core/actions.js`
- **AI Matchmaker**: `src/core/ai-matchmaker.js`
- **Profile Schema**: `src/core/profile-schema.js`
- **Constants**: `src/core/constants.js`

---

## How It Works (TL;DR)

```
User Message → AI (Base Prompt + Dynamic State) → JSON Response with Actions → Execute Actions → Update State → Send Response
```

**Key Concept**: The AI doesn't just chat—it issues **structured commands (actions)** that modify state and trigger workflows.

---

## Current Stages

```javascript
const STAGES = {
  INTRODUCTION: 'introduction',           // Welcome, share session code
  PROFILE_CREATION: 'profile_creation',   // Collect all fields
  PROFILE_CONFIRMATION: 'profile_confirmation', // Show summary, get approval
  PROFILE_GENERATION: 'profile_generation',     // Generate card & URL
  PROFILE_REVIEW: 'profile_review',             // Show profile, allow iteration
  PROFILE_COMMITTED: 'profile_committed',       // Finalized, do daily drop
  FETCHING_PROFILES: 'fetching_profiles'        // End state
};
```

**Flow**: `INTRODUCTION` → `PROFILE_CREATION` → `PROFILE_CONFIRMATION` → `PROFILE_GENERATION` → `PROFILE_REVIEW` → `PROFILE_COMMITTED` → `FETCHING_PROFILES`

---

## Current Actions

```javascript
const ACTION_TYPES = {
  SEND_MESSAGE: 'send_message',                     // Send message to user(s)
  SEND_TEMPLATE_MESSAGE: 'send_template_message',   // Send interactive template (buttons)
  UPDATE_STAGE: 'update_stage',                     // Transition to new stage
  UPDATE_PROFILE_SCHEMA: 'update_profile_schema',   // Update profile field
  GENERATE_PROFILE: 'generate_profile',             // Generate profile card/URL
  COMMIT_PROFILE: 'commit_profile',                 // Finalize profile
  DAILY_DROP: 'daily_drop'                          // Present 2 random profiles
};
```

---

## AI Response Format

The AI **always** responds in this JSON format:

```json
{
  "message": "Conversational text to send to user",
  "actions": [
    {"type": "action_type", "param1": "value1", "param2": "value2"}
  ],
  "reasoning": "Why I chose these actions"
}
```

**Example**:
```json
{
  "message": "Cool, you're 24! What school did you go to?",
  "actions": [
    {
      "type": "update_profile_schema",
      "field": "age",
      "value": 24
    }
  ],
  "reasoning": "User provided their age, storing it in profile schema"
}
```

---

## Session State Structure

```javascript
{
  sessionId: "ABC12",
  stage: "profile_creation",
  participants: [
    { phoneNumber: "+1234567890", name: "Sarah", role: "creator" },
    { phoneNumber: "+1987654321", name: "Mike", role: "friend" }
  ],
  profileSchema: {
    name: "Sarah",
    age: 24,
    gender: "Female",
    photo: "https://...",
    schools: ["UC Berkeley"],
    interested_in: "Male",
    interests: ["Hiking", "Photography"],
    sexual_orientation: "Straight",
    relationship_intent: "Long-term, open to short",
    height: "5'6\"",
    bio: "Adventure seeker...",
    prompts: [
      { question: "My weakness is...", answer: "Late night tacos" }
    ]
  },
  messages: [
    { role: "user", content: "I'm 24", sender: "Sarah", phoneNumber: "+1234567890" },
    { role: "assistant", content: "Cool! What school?" }
  ],
  actions: [
    {
      timestamp: "2025-10-30T12:00:00Z",
      type: "update_profile_schema",
      action: { type: "update_profile_schema", field: "age", value: 24 },
      result: { success: true }
    }
  ],
  generatedProfile: { /* after generate_profile */ },
  committedProfile: { /* after commit_profile */ }
}
```

---

## How to Modify the AI's Behavior

### Change Personality/Style
**File**: `src/prompts/base-prompt.js`

```javascript
function getBasePrompt() {
  return `You're a warm, friendly AI matchmaker...

PERSONALITY & STYLE:
• Supportive and encouraging
• Keep messages SHORT: 1-3 sentences max
• Use emojis judiciously (1-2 per message)
...`;
}
```

**What to change**:
- Tone (formal vs casual)
- Message length
- Emoji usage
- Conversation style

**Example**: Make it more formal
```javascript
return `You are a professional matchmaking assistant...

PERSONALITY & STYLE:
• Professional and courteous
• Keep messages concise but complete
• Avoid emojis
...`;
```

### Change Action Instructions
**File**: `src/prompts/action-instructions.js`

**When to modify**:
- Add new action
- Change stage flow rules
- Modify field requirements
- Update response format

### Change Available Fields
**File**: `src/core/profile-schema.js`

**To add a new field**:
```javascript
const PROFILE_SCHEMA = {
  // ... existing fields
  my_new_field: {
    type: 'string',
    required: false,
    description: 'Description of field',
    validate: (value) => {
      if (!value) return true; // Optional
      return typeof value === 'string' && value.length > 0;
    }
  }
};
```

Don't forget to update `initializeProfileSchema()`:
```javascript
function initializeProfileSchema() {
  return {
    // ... existing fields
    my_new_field: null
  };
}
```

---

## Common Tasks

### Task 1: Add a New Action

**Step 1**: Define constant (`src/core/constants.js`)
```javascript
const ACTION_TYPES = {
  // ... existing
  MY_NEW_ACTION: 'my_new_action'
};
```

**Step 2**: Document in prompt (`src/prompts/action-instructions.js`)
```javascript
7. **my_new_action**: {"type": "my_new_action", "param": "value"} - What it does
```

**Step 3**: Implement executor (`src/core/actions.js`)
```javascript
async function executeMyNewAction(action, session) {
  const { param } = action;
  
  // Validate
  if (!param) {
    return { success: false, error: 'param is required' };
  }
  
  // Execute
  session.myField = param;
  
  // Log
  logger.info('my_new_action executed', { sessionId: session.sessionId, param });
  
  return { success: true, action: 'my_new_action_completed' };
}
```

**Step 4**: Add to router (`src/core/actions.js`)
```javascript
async function executeAction(action, session, twilioSendMessage) {
  switch (action.type) {
    // ... existing cases
    case ACTION_TYPES.MY_NEW_ACTION:
      return await executeMyNewAction(action, session);
  }
}
```

### Task 2: Add a New Stage

**Step 1**: Define stage (`src/core/constants.js`)
```javascript
const STAGES = {
  // ... existing
  MY_NEW_STAGE: 'my_new_stage'
};
```

**Step 2**: Document flow (`src/prompts/action-instructions.js`)
```javascript
## STAGE FLOW
- profile_review → my_new_stage: When user wants to do X
- my_new_stage → profile_committed: After completing Y
```

**Step 3**: Implement stage-specific logic (if needed)
```javascript
// In action executors, add stage validation
if (session.stage !== STAGES.MY_NEW_STAGE) {
  return { success: false, error: 'Invalid stage for this action' };
}
```

### Task 3: Change Field Requirements

**File**: `src/core/profile-schema.js`

**Make a field optional**:
```javascript
const PROFILE_SCHEMA = {
  height: {
    type: 'string',
    required: false, // Changed from true
    description: 'User\'s height',
    validate: (value) => {
      if (!value) return true; // Allow null for optional fields
      return typeof value === 'string' && value.length > 0;
    }
  }
};
```

**Add minimum/maximum constraints**:
```javascript
bio: {
  type: 'string',
  required: true,
  description: 'User\'s bio',
  validate: (value) => {
    if (!value || typeof value !== 'string') return false;
    return value.trim().length >= 10 && value.trim().length <= 500;
  }
}
```

### Task 4: Add Stage-Specific AI Behavior

**File**: `src/prompts/action-instructions.js`

**In the STAGE FLOW section**, add detailed instructions:

```javascript
## STAGE FLOW
...

- **my_new_stage**: Special stage for XYZ
  IMPORTANT: In this stage, you should:
  • Ask for confirmation before proceeding
  • Validate all data is correct
  • Use send_template_message for user interaction
  • Only advance on explicit user approval
```

**The AI will see this and follow the instructions automatically.**

### Task 5: Add Validation for Actions

**In action executor** (`src/core/actions.js`):

```javascript
async function executeUpdateProfileSchema(action, session) {
  const { field, value } = action;
  
  // Custom validation logic
  if (field === 'age' && (value < 18 || value > 100)) {
    return {
      success: false,
      error: 'Age must be between 18 and 100'
    };
  }
  
  if (field === 'photo' && !value.startsWith('https://')) {
    return {
      success: false,
      error: 'Photo must be a valid HTTPS URL'
    };
  }
  
  // ... rest of validation and execution
}
```

### Task 6: Debug State Issues

**Check session state**:
```javascript
// In server.js or any file with access to aiMatchmaker
const session = await aiMatchmaker.getSessionById('ABC12');
console.log(JSON.stringify(session, null, 2));
```

**Check Redis**:
```bash
# Connect to Redis
redis-cli

# List all sessions
KEYS session:*

# Get specific session
GET session:ABC12

# List all phone mappings
KEYS phone:*

# Get phone mapping
GET phone:+1234567890
```

**Check conversation history**:
```javascript
const session = await aiMatchmaker.getSessionById('ABC12');
console.log('Messages:', session.messages);
console.log('Actions:', session.actions);
```

---

## Debugging Tips

### AI Not Following Instructions?

**Check**:
1. Is the instruction in the prompt? (`src/prompts/action-instructions.js`)
2. Is the stage correct?
3. Are required fields missing?
4. Check logs for AI's reasoning

**Fix**:
- Make instructions more explicit
- Add examples in the prompt
- Add validation in action executors

### Action Not Executing?

**Check**:
1. Is action type defined in `ACTION_TYPES`?
2. Is there a case in `executeAction()` switch?
3. Check logs for validation errors
4. Check if stage allows this action

**Fix**:
- Add proper error logging
- Add validation checks
- Return descriptive error messages

### State Not Persisting?

**Check**:
1. Is Redis running? (`redis-cli ping`)
2. Check logs for Redis errors
3. Check if `setSession()` is called after action execution

**Fix**:
- Ensure Redis is running
- Check Redis connection in logs
- Verify `await setSession(sessionId, session)` is called

### AI Response Not Valid JSON?

**Check**:
1. LLM provider (OpenAI vs Groq)
2. Response format enforcement
3. Logs for parse errors

**Fix**:
- For Groq: ensure JSON reminder is added to system prompt
- Check `response_format: { type: "json_object" }` is set
- Add JSON format examples in prompt

---

## Testing Actions

### Manual Test (via WhatsApp)

1. Send message to Twilio number
2. Check server logs for action execution
3. Verify state changes in Redis

```bash
# Watch logs in real-time
tail -f server.log

# Or if using console
npm start
```

### Check Action Result

```javascript
// In logs, look for:
[INFO] Executing action { type: 'update_profile_schema', field: 'age', value: 24 }
[INFO] ✅ Profile schema field updated { field: 'age', value: 24 }
[INFO] ⚙️  Action Complete { action: 'update_profile_schema', duration: '5ms', success: true }
```

### Verify State Change

```bash
# Redis
redis-cli
GET session:ABC12

# Should show updated field:
# {"profileSchema":{"age":24,...},...}
```

---

## Common Patterns

### Pattern 1: Collect Field from Conversation

**User**: "I'm 24 and I love hiking"

**AI Strategy**:
1. Parse message → extract age and interest
2. Generate response → acknowledge
3. Generate actions → update both fields

```json
{
  "message": "Cool! 24 and love hiking, got it!",
  "actions": [
    { "type": "update_profile_schema", "field": "age", "value": 24 },
    { "type": "update_profile_schema", "field": "interests", "value": ["Hiking"] }
  ],
  "reasoning": "Extracted age and interest from user message"
}
```

### Pattern 2: Stage Transition When Complete

**Scenario**: All required fields collected

**AI Strategy**:
1. Check state → all fields present
2. Generate response → show summary
3. Generate actions → transition stage, send template

```json
{
  "message": "Perfect! Here's your profile summary...",
  "actions": [
    { "type": "update_stage", "stage": "profile_confirmation" },
    {
      "type": "send_template_message",
      "templateType": "profile_confirmation",
      "variables": { "1": "Name: Sarah\\nAge: 24..." }
    }
  ],
  "reasoning": "All fields complete, moving to confirmation stage"
}
```

### Pattern 3: Iteration (Change and Regenerate)

**User**: "Can you change my bio?"

**AI Strategy**:
1. Update field
2. Regenerate profile

```json
{
  "message": "Sure! Updated your bio. Here's the new version:",
  "actions": [
    { "type": "update_profile_schema", "field": "bio", "value": "new bio text" },
    { "type": "generate_profile" }
  ],
  "reasoning": "User requested bio change, updating and regenerating profile"
}
```

### Pattern 4: Multi-Step Workflow

**Scenario**: Profile committed → immediately do daily drop

**AI Strategy**:
1. Commit profile
2. Immediately call daily drop
3. Present profiles

```json
{
  "message": "Awesome! Your profile is live. Now let's find some matches...",
  "actions": [
    { "type": "commit_profile" },
    { "type": "daily_drop" }
  ],
  "reasoning": "Profile approved, committing and immediately starting daily drop"
}
```

---

## Prompt Engineering Tips

### Tip 1: Be Explicit About Stage Behavior

**Bad**:
```
- profile_creation: Collect fields
```

**Good**:
```
- profile_creation: Collect ALL schema fields via update_profile_schema. ANY participant can answer. Stay here until complete. Ask ONE question at a time. Use natural conversation, not a form.
```

### Tip 2: Show Examples

**Bad**:
```
Update fields with update_profile_schema
```

**Good**:
```
Update fields with update_profile_schema:
Example: {"type": "update_profile_schema", "field": "age", "value": 24}
Example: {"type": "update_profile_schema", "field": "interests", "value": ["Hiking", "Photography"]}
```

### Tip 3: Use IMPORTANT/NOTE Markers

```
**IMPORTANT**: You MUST call daily_drop immediately after commit_profile succeeds.

**NOTE**: WhatsApp users can only see the last 100 messages.
```

These stand out to the AI.

### Tip 4: Specify Exact Format

**Bad**:
```
Show profile summary
```

**Good**:
```
Show profile summary in this EXACT format:

Name: [name]
Age: [age]
Gender: [gender]
...

Use line breaks between each field. Do NOT use semicolons or commas to separate fields.
```

### Tip 5: Give Conversational Examples

```
✓ GOOD: "love that. want to add one more?"
✗ BAD: "love that!! 😍✨🔥 want to add one more?? 🥺👉👈"
```

The AI learns from examples.

---

## File Structure Reference

```
hackathon/
├── src/
│   ├── prompts/
│   │   ├── base-prompt.js           ← AI personality & style
│   │   └── action-instructions.js   ← Dynamic action instructions
│   ├── core/
│   │   ├── actions.js               ← Action executors
│   │   ├── ai-matchmaker.js         ← Main AI logic & state management
│   │   ├── constants.js             ← Stages & action types
│   │   └── profile-schema.js        ← Field definitions & validation
│   ├── services/
│   │   ├── profile-url-manager.js   ← Profile URL generation
│   │   └── profile-html-generator.js ← HTML profile cards
│   ├── twilio/
│   │   └── conversation-manager.js  ← Twilio Conversations API
│   └── utils/
│       ├── logger.js                ← Logging
│       └── r2-storage.js            ← Cloudflare R2 storage
├── server.js                        ← Express server & webhook handler
└── docs/
    ├── AI_ARCHITECTURE.md           ← Detailed architecture documentation
    └── AI_QUICK_REFERENCE.md        ← This file
```

---

## Further Reading

- **Complete Architecture**: [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md)
- **WhatsApp Setup**: [WHATSAPP_SETUP.md](./WHATSAPP_SETUP.md)
- **Deployment**: [DEPLOYMENT.md](../DEPLOYMENT.md)

---

## Questions?

Check the detailed architecture doc: [AI_ARCHITECTURE.md](./AI_ARCHITECTURE.md)

For specific issues:
- **Prompt not working**: See "How to Modify AI's Behavior" above
- **Action failing**: See "Debugging Tips" above
- **State issues**: See "Task 6: Debug State Issues" above
- **New feature**: See "Common Tasks" above

