# AI System Overview (5-Minute Read)

A concise explanation of how the AI prompting and action system works.

> **For Leadership**: See the [Executive Summary](./AI_EXECUTIVE_SUMMARY.md) for a high-level overview of capabilities and business implications.

---

## What Is This System?

This is an **AI-powered conversational agent** that helps people create dating profiles through WhatsApp group chats. The AI:
- Asks questions naturally (one at a time)
- Collects profile information
- Accepts input from friends (for honest feedback)
- Generates a shareable profile card
- Presents potential matches

**Key Innovation**: The AI doesn't just respond with text—it performs **structured actions** that modify application state, generate artifacts, and orchestrate workflows.

---

## Core Architecture

```
User Message
    ↓
Get Session State (Redis)
    ↓
Build Dynamic Prompt
    ├─ Base Prompt (personality)
    ├─ Action Instructions (what AI can do)
    ├─ Current State (stage, missing fields, etc.)
    └─ Conversation History
    ↓
Call LLM (OpenAI/Groq)
    ↓
Parse JSON Response
    ├─ message: "Conversational text"
    └─ actions: [{type, params}, ...]
    ↓
Execute Actions (modify state, trigger workflows)
    ↓
Save Updated State (Redis)
    ↓
Send Response to User
```

---

## Three Core Components

### 1. **Prompts** (What the AI Sees)

The AI receives a **dynamically-generated prompt** on every turn:

#### Base Prompt (`src/prompts/base-prompt.js`)
- Static personality and style
- "You're a warm, friendly AI matchmaker..."
- Conversational guidelines
- Tone and formatting rules

#### Action Instructions (`src/prompts/action-instructions.js`)
- **Dynamic** (changes based on current state)
- Shows available actions
- Shows missing fields
- Shows current stage
- Shows uploaded photos
- Provides stage transition rules

**Example Dynamic Prompt Section**:
```
## CURRENT STATE
Stage: profile_creation
Participants: Sarah (+1234567890), Mike (+1987654321)
Schema Complete: NO

Missing Fields:
- age
- photo
- bio

Uploaded Photos:
1. https://r2.example.com/photo1.jpg
```

### 2. **Actions** (What the AI Can Do)

Actions are **structured commands** the AI issues in JSON format:

```json
{
  "message": "Cool! What school did you go to?",
  "actions": [
    {
      "type": "update_profile_schema",
      "field": "age",
      "value": 24
    }
  ],
  "reasoning": "User provided their age"
}
```

**Available Actions**:
- `update_profile_schema` - Store profile field
- `update_stage` - Transition to new stage
- `generate_profile` - Create profile card/URL
- `commit_profile` - Finalize profile
- `daily_drop` - Present 2 random profiles for matching
- `send_message` - Send message to specific user(s)
- `send_template_message` - Send interactive buttons

### 3. **State** (What the AI Knows)

All conversation state lives in a **session object** stored in Redis:

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
    // ... all other profile fields
  },
  messages: [
    { role: "user", content: "I'm 24", sender: "Sarah" },
    { role: "assistant", content: "Cool! What school?" }
  ],
  actions: [
    { timestamp: "...", type: "update_profile_schema", ... }
  ],
  generatedProfile: { /* after generation */ },
  committedProfile: { /* after commit */ }
}
```

**State is updated by**:
- User messages (added to history)
- AI messages (added to history)
- Action execution (modifies fields in-place)

**State persists in**:
- Redis (primary)
- In-memory Map (fallback)

---

## How It Works: Example Flow

**User**: "I'm 24 years old"

### Step 1: Get State
```javascript
session = await getSession("+1234567890");
// Returns: {sessionId: "ABC12", stage: "profile_creation", profileSchema: {...}, ...}
```

### Step 2: Build Prompt
```javascript
const prompt = `
${BASE_PROMPT}  // Personality

## CURRENT STATE
Stage: profile_creation
Missing Fields:
- age  ← AI sees this!
- photo
- bio

## ACTIONS
1. update_profile_schema: Update a field
...
`;
```

### Step 3: Call LLM
```javascript
const response = await openai.chat.completions.create({
  model: "gpt-4",
  messages: [
    { role: "system", content: prompt },
    { role: "user", content: "Sarah: I'm 24 years old" }
  ],
  response_format: { type: "json_object" }
});
```

### Step 4: Parse Response
```json
{
  "message": "Cool! What school did you go to?",
  "actions": [
    { "type": "update_profile_schema", "field": "age", "value": 24 }
  ],
  "reasoning": "Extracted age from user message"
}
```

### Step 5: Execute Actions
```javascript
// Action: update_profile_schema
session.profileSchema.age = 24;  // Updates in-place
await setSession(sessionId, session);  // Saves to Redis
```

### Step 6: Send Response
```javascript
// Send to WhatsApp via Twilio
twilioClient.messages.create({
  from: "whatsapp:+14155238886",
  to: "whatsapp:+1234567890",
  body: "Cool! What school did you go to?"
});
```

**Next Turn**: AI will see `age: 24` in the state, and "age" will no longer be in the missing fields list.

---

## Stage-Based Flow

The core conversation progresses through **5 stages**, with an optional holding state when surfacing matches:

```
1. INTRODUCTION
   ├─ Welcome the group
   └─ Clarify who we're building the profile for and set expectations
        ↓
2. PROFILE_CREATION
   ├─ Collect profile fields (name, age, gender, photo, bio, etc.)
   ├─ Ask ONE question at a time
   └─ Accept answers from ANY participant
        ↓
3. PROFILE_CONFIRMATION
   ├─ Show a quick summary of collected data
   └─ Offer the template confirmation or chance to tweak
        ↓
4. PROFILE_REVIEW
   ├─ Share the generated profile
   ├─ Allow iteration (change fields → regenerate)
   └─ Wait for explicit approval
        ↓
5. PROFILE_COMMITTED
   ├─ Finalize the profile
   ├─ Trigger daily drop to tee up matches
   └─ Present next steps and keep the energy up

Optional: FETCHING_PROFILES
   └─ Temporary state while presenting matches or daily drops
```

**Stage transitions are controlled by**:
- AI calling `update_stage` action
- Action side effects (e.g., `generate_profile` auto-transitions to `profile_review`)
- Stage constraints (can only commit from review stage)

---

## Key Concepts

### 1. Dynamic Prompting
The prompt **changes on every turn** based on current state. This creates a **closed feedback loop**:

```
State → Prompt (includes state) → AI Response → Actions → Update State → Next Prompt (new state)
```

### 2. Structured Tool Use
The AI uses **JSON actions** (similar to OpenAI function calling) to perform operations:

```json
// AI doesn't say "I'll update your age"
// AI actually updates it:
{
  "message": "Got it!",
  "actions": [
    { "type": "update_profile_schema", "field": "age", "value": 24 }
  ]
}
```

### 3. Validation at Multiple Layers
- **Prompt**: AI learns what actions are valid
- **Action Router**: Validates action type exists
- **Action Executor**: Validates parameters
- **Schema Validator**: Validates field values

### 4. Conversation History with Participants
Messages are tagged with sender names:

```javascript
{ role: "user", content: "I love hiking", sender: "Sarah" }
{ role: "user", content: "She's super outdoorsy", sender: "Mike" }
```

The AI sees: `"Sarah: I love hiking"` and `"Mike: She's super outdoorsy"` in the conversation.

### 5. Iteration Support
Users can change fields and regenerate profiles:

```
User: "Change my bio"
AI: update_profile_schema("bio", "new text")
AI: generate_profile()  // Regenerates with new data
→ New profile URL sent to user
```

---

## How to Modify Behavior

### Change AI Personality
**File**: `src/prompts/base-prompt.js`

```javascript
return `You're a warm, friendly AI matchmaker...

PERSONALITY & STYLE:
• Keep messages SHORT: 1-3 sentences max  ← Change this
• Use emojis judiciously (1-2 per message)  ← Change this
...`;
```

### Add New Action
**Steps**:
1. Define in `src/core/constants.js`
2. Document in `src/prompts/action-instructions.js`
3. Implement executor in `src/core/actions.js`
4. Add to action router

### Add New Profile Field
**File**: `src/core/profile-schema.js`

```javascript
const PROFILE_SCHEMA = {
  // ... existing fields
  my_new_field: {
    type: 'string',
    required: false,
    validate: (value) => /* validation logic */
  }
};
```

### Change Stage Flow
**File**: `src/prompts/action-instructions.js`

Update the **STAGE FLOW** section with new rules.

---

## File Structure (What to Look At)

```
src/
├── prompts/
│   ├── base-prompt.js           ← AI personality
│   └── action-instructions.js   ← Dynamic instructions
├── core/
│   ├── actions.js               ← Action executors
│   ├── ai-matchmaker.js         ← Main AI logic
│   ├── constants.js             ← Stages & action types
│   └── profile-schema.js        ← Field definitions
└── services/
    ├── profile-url-manager.js   ← Profile URL generation
    └── profile-html-generator.js ← Profile card HTML
```

---

## Common Questions

### Q: How does the AI know what fields are missing?
**A**: The `getActionInstructions()` function dynamically generates a "Missing Fields" list based on the current `profileSchema` state. This list is injected into the prompt on every turn.

### Q: Can the AI perform multiple actions at once?
**A**: Yes! The AI can return an array of actions:
```json
{
  "actions": [
    { "type": "update_profile_schema", "field": "age", "value": 24 },
    { "type": "update_profile_schema", "field": "name", "value": "Sarah" },
    { "type": "update_stage", "stage": "profile_confirmation" }
  ]
}
```

### Q: What happens if an action fails?
**A**: The action executor returns `{success: false, error: "..."}`. The error is logged, but the conversation continues. The state is only saved if `success: true`.

### Q: How does the AI know about previous messages?
**A**: The entire conversation history is sent to the LLM on every turn:
```javascript
messages: [
  { role: "system", content: "...full prompt..." },
  { role: "user", content: "Sarah: Hi" },
  { role: "assistant", content: "Hey Sarah!" },
  { role: "user", content: "Sarah: I'm 24" },  ← Current turn
]
```

### Q: What's the difference between `generate_profile` and `commit_profile`?
- **`generate_profile`**: Creates preview, allows iteration, stays in `profile_review` stage
- **`commit_profile`**: Finalizes profile, marks as "committed", advances to `profile_committed` stage (no going back)

### Q: Why use Redis?
**A**: Redis provides:
- Persistence (state survives server restarts)
- Speed (fast key-value lookups)
- Scalability (multiple servers can share state)

---

## Next Steps

### To Learn More:
1. **[AI Architecture](./AI_ARCHITECTURE.md)** - Deep dive into system design
2. **[Quick Reference](./AI_QUICK_REFERENCE.md)** - How-to guides for common tasks
3. **[Flow Diagrams](./AI_FLOW_DIAGRAMS.md)** - Visual representations

### To Modify:
- **Change AI style**: Edit `src/prompts/base-prompt.js`
- **Add action**: Follow guide in [Quick Reference](./AI_QUICK_REFERENCE.md#task-1-add-a-new-action)
- **Add field**: Edit `src/core/profile-schema.js`
- **Change stage flow**: Edit `src/prompts/action-instructions.js`

### To Debug:
- **Check state**: `redis-cli GET session:ABC12`
- **View logs**: `tail -f server.log`
- **Test actions**: Send messages via WhatsApp and watch logs

---

## Summary

**The system works like this**:

1. User sends message
2. System loads session state from Redis
3. System builds dynamic prompt (personality + state + actions)
4. System calls LLM (OpenAI/Groq)
5. LLM returns JSON with message + actions
6. System executes actions (modifies state)
7. System saves updated state to Redis
8. System sends message to user

**The AI is powerful because**:
- It sees the **full current state** in every prompt
- It can perform **multiple actions** to modify state
- It progresses through **well-defined stages**
- It validates data at **multiple layers**
- It supports **iteration** (users can change and regenerate)

**You can extend it by**:
- Adding new actions
- Changing prompts
- Adding profile fields
- Modifying stage flow

The architecture is designed for **fast iteration** and **easy extensibility**.

