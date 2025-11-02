# AI Architecture: Prompting, Actions, and State Management

> **Quick Links**: [Executive Summary](./AI_EXECUTIVE_SUMMARY.md) (for leadership) • [System Overview](./AI_SYSTEM_OVERVIEW.md) (5-min intro) • [Quick Reference](./AI_QUICK_REFERENCE.md) (developer guide)

## Table of Contents
1. [System Overview](#system-overview)
2. [Prompt System](#prompt-system)
3. [Action System](#action-system)
4. [State Management](#state-management)
5. [Tool Use (Function Calling)](#tool-use-function-calling)
6. [Stage-Based Flow](#stage-based-flow)
7. [Adding New Actions](#adding-new-actions)
8. [Examples](#examples)

---

## System Overview

This application uses an **AI-driven conversational system** with **structured tool use** (function calling) to build dating profiles through WhatsApp group chats. The architecture consists of three core components:

```
┌─────────────────────────────────────────────────────────────┐
│                     USER MESSAGES                            │
│                  (WhatsApp via Twilio)                       │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  AI MATCHMAKER ENGINE                        │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  1. BASE PROMPT (Personality & Style)                │   │
│  │     - Conversational tone                            │   │
│  │     - Behavior guidelines                            │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  2. ACTION INSTRUCTIONS (Dynamic, State-Aware)       │   │
│  │     - Available actions                              │   │
│  │     - Current stage & state                          │   │
│  │     - Missing fields                                 │   │
│  │     - Stage transition rules                         │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  3. CONVERSATION HISTORY                             │   │
│  │     - User messages (with sender names)              │   │
│  │     - AI responses                                   │   │
│  └─────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼ JSON Response
┌─────────────────────────────────────────────────────────────┐
│                    AI RESPONSE                               │
│  {                                                           │
│    "message": "conversational text",                         │
│    "actions": [                                              │
│      {"type": "update_profile_schema", "field": "...", ...}, │
│      {"type": "update_stage", "stage": "..."}                │
│    ],                                                        │
│    "reasoning": "why these actions"                          │
│  }                                                           │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                  ACTION EXECUTOR                             │
│  - Executes each action sequentially                         │
│  - Updates session state                                     │
│  - Triggers side effects (message sending, profile gen)      │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    STATE STORAGE                             │
│  Redis (primary) + In-Memory (fallback)                      │
│  - Session data                                              │
│  - Profile schema                                            │
│  - Conversation history                                      │
│  - Action history                                            │
└─────────────────────────────────────────────────────────────┘
```

**Key Principle**: The AI doesn't just respond with text—it responds with **structured actions** that modify application state, trigger workflows, and orchestrate the entire profile creation process.

---

## Prompt System

The prompt system consists of two modular components that are combined at runtime:

### 1. Base Prompt (`src/prompts/base-prompt.js`)

**Purpose**: Defines the AI's personality, conversational style, and general behavior.

**Key Characteristics**:
- **Personality**: Warm, friendly, Gen Z energy
- **Style Guidelines**: Short messages (1-3 sentences), judicious emoji use, natural conversation
- **Context**: Group chat with one primary user + friends
- **Formatting Rules**: Mobile-friendly, line breaks for readability
- **Conversational Playbook**: Natural flow patterns for profile creation

**Example**:
```javascript
function getBasePrompt() {
  return `You're a warm, friendly AI matchmaker helping people create dating profiles...

PERSONALITY & STYLE:
• Supportive and encouraging, like texting with a friend
• Keep messages SHORT: 1-3 sentences max
• Use emojis judiciously (1-2 per message)
...`;
}
```

**Why Separate?**: Agents can iterate on personality and tone independently without touching action logic.

### 2. Action Instructions (`src/prompts/action-instructions.js`)

**Purpose**: Provides **dynamic, state-aware instructions** about available actions, current state, and stage flow.

**Dynamic Components**:
```javascript
function getActionInstructions(currentStage, participants, profileSchema, sessionData) {
  // Builds prompt with:
  // 1. Available actions
  // 2. Current state (stage, participants, completion status)
  // 3. Missing fields
  // 4. Uploaded photos
  // 5. Stage transition rules
  // 6. Response format requirements
}
```

**Key Sections**:

#### Section 1: ACTIONS
Lists all available actions the AI can perform:
```
1. send_message: {"type": "send_message", "target": "phone_number/'all'", "message": "text", "mediaUrl": "optional"}
2. update_stage: {"type": "update_stage", "stage": "profile_creation"}
3. update_profile_schema: {"type": "update_profile_schema", "field": "name", "value": "John"}
4. generate_profile: {"type": "generate_profile"}
5. commit_profile: {"type": "commit_profile"}
...
```

#### Section 2: CURRENT STATE
Dynamic state information injected at runtime:
```
Stage: profile_creation | Participants: John (+1234567890), Sarah (+1987654321) | Schema Complete: NO

Missing Fields:
- age
- photo
- interests

Uploaded Photos:
1. https://r2.example.com/photo1.jpg
```

#### Section 3: PROFILE SCHEMA
Detailed field definitions with validation rules:
```
1. name: User's first name
2. age: User's age (number, 18-100)
3. photo: Use EXACT URL from uploaded photos above
4. schools: Array of schools (e.g., ["Harvard", "MIT"])
...
```

#### Section 4: STAGE FLOW
Stage transition rules and requirements:
```
- introduction → profile_creation: Greet warmly, transition when ready
- profile_creation: Collect ALL schema fields. ANY participant can answer.
- profile_creation → profile_confirmation: When schema 100% complete
- profile_confirmation → profile_generation: On user approval
...
```

#### Section 5: RESPONSE FORMAT
Enforces JSON structure:
```json
{
  "message": "Your conversational response",
  "actions": [action objects],
  "reasoning": "Why you chose these actions"
}
```

**Why Dynamic?**: The AI needs context-aware instructions. When a user uploads a photo, the prompt shows the URL. When fields are collected, they disappear from the "missing" list. This creates a **closed feedback loop** where the AI always sees the current state.

---

## Action System

Actions are **structured commands** the AI can issue to modify state, trigger workflows, and interact with users.

### Action Definition (`src/core/constants.js`)

```javascript
const ACTION_TYPES = {
  SEND_MESSAGE: 'send_message',
  SEND_TEMPLATE_MESSAGE: 'send_template_message',
  UPDATE_STAGE: 'update_stage',
  UPDATE_PROFILE_SCHEMA: 'update_profile_schema',
  GENERATE_PROFILE: 'generate_profile',
  COMMIT_PROFILE: 'commit_profile',
  FETCH_PROFILES: 'fetch_profiles',
  DAILY_DROP: 'daily_drop'
};
```

### Action Execution Flow (`src/core/actions.js`)

```javascript
async function executeAction(action, session, twilioSendMessage) {
  logger.info('Executing action', { type: action.type, sessionId: session.sessionId });

  switch (action.type) {
    case ACTION_TYPES.SEND_MESSAGE:
      return await executeSendMessage(action, session, twilioSendMessage);
    
    case ACTION_TYPES.UPDATE_STAGE:
      return await executeUpdateStage(action, session);
    
    case ACTION_TYPES.UPDATE_PROFILE_SCHEMA:
      return await executeUpdateProfileSchema(action, session);
    
    case ACTION_TYPES.GENERATE_PROFILE:
      return await executeGenerateProfile(action, session);
    
    // ... other actions
  }
}
```

### Key Actions Explained

#### 1. `update_profile_schema`
**Purpose**: Update a specific field in the profile schema.

**Parameters**:
- `field`: Field name (e.g., "name", "age", "interests")
- `value`: New value (validated against schema)

**Example**:
```json
{
  "type": "update_profile_schema",
  "field": "name",
  "value": "Sarah"
}
```

**Execution**:
```javascript
async function executeUpdateProfileSchema(action, session) {
  const { field, value } = action;
  
  // Initialize schema if needed
  if (!session.profileSchema) {
    session.profileSchema = initializeProfileSchema();
  }
  
  // Validate and update field
  const result = updateField(session.profileSchema, field, value);
  
  if (!result.success) {
    return { success: false, error: result.error };
  }
  
  // Log completion status
  const missingFields = getMissingFields(session.profileSchema);
  logger.debug('Profile schema updated', { field, missingFields });
  
  return { success: true, action: 'schema_field_updated', field };
}
```

#### 2. `update_stage`
**Purpose**: Transition to a new conversation stage.

**Parameters**:
- `stage`: New stage name (validated against STAGES enum)

**Example**:
```json
{
  "type": "update_stage",
  "stage": "profile_confirmation"
}
```

**Validation**:
```javascript
async function executeUpdateStage(action, session) {
  const { stage } = action;
  
  // Validate stage exists
  if (!Object.values(STAGES).includes(stage)) {
    return { success: false, error: 'Invalid stage' };
  }
  
  // Prevent backwards transitions from certain stages
  if (session.stage === STAGES.FETCHING_PROFILES) {
    return { success: false, error: 'Cannot go back from fetching_profiles' };
  }
  
  const oldStage = session.stage;
  session.stage = stage;
  
  logger.info('Stage updated', { oldStage, newStage: stage });
  return { success: true, action: 'stage_updated', oldStage, newStage: stage };
}
```

#### 3. `generate_profile`
**Purpose**: Generate the profile card image and shareable URL.

**Requirements**:
- Minimum fields: `name`, `age`, `photo`
- Can be called multiple times (for iteration)

**Example**:
```json
{
  "type": "generate_profile"
}
```

**Execution**:
```javascript
async function executeGenerateProfile(action, session) {
  // Validate minimum required fields
  if (!isSchemaCompleteForGeneration(session.profileSchema)) {
    const missing = getMissingFieldsForGeneration(session.profileSchema);
    return {
      success: false,
      error: `Missing required fields: ${missing.join(', ')}`
    };
  }
  
  // Generate profile object
  const generatedProfile = {
    id: `profile_${session.sessionId}_${Date.now()}`,
    ...session.profileSchema,
    photos: session.data?.photos || [],
    createdAt: new Date().toISOString(),
    status: 'pending_review'
  };
  
  // Create interactive profile URL
  const profileUrl = await profileUrlManager.createProfileUrl(
    session.sessionId,
    generatedProfile,
    process.env.PUBLIC_DOMAIN
  );
  
  generatedProfile.profileUrl = profileUrl;
  
  // Store in session
  session.generatedProfile = generatedProfile;
  session.stage = STAGES.PROFILE_REVIEW;
  
  return {
    success: true,
    action: 'profile_generated',
    profile: generatedProfile,
    profileUrl: profileUrl
  };
}
```

#### 4. `commit_profile`
**Purpose**: Finalize the profile (user approval).

**Requirements**:
- Must be in `profile_review` stage
- Generated profile must exist

**Example**:
```json
{
  "type": "commit_profile"
}
```

**Side Effects**:
- Updates profile status to 'committed'
- Transitions to `profile_committed` stage
- Unlocks `daily_drop` action

#### 5. `daily_drop`
**Purpose**: Select and present 2 random demo profiles for matching.

**Requirements**:
- Must be in `profile_committed` stage

**Example**:
```json
{
  "type": "daily_drop"
}
```

**Execution**:
```javascript
async function executeDailyDrop(action, session) {
  // Get all demo profiles
  const allProfiles = demoProfileData.profiles;
  
  // Select 2 random profiles
  const shuffled = [...allProfiles].sort(() => 0.5 - Math.random());
  const selectedProfiles = shuffled.slice(0, 2);
  
  // Generate catchy descriptions
  const profilesWithDescriptions = selectedProfiles.map(profile => ({
    name: profile.name,
    age: profile.age,
    profileUrl: fullProfile?.profileUrl || '',
    description: generateCatchyDescription(profile),
    sessionId: profile.sessionId
  }));
  
  // Store in session
  session.dailyDrops.push({
    timestamp: new Date().toISOString(),
    profiles: profilesWithDescriptions,
    userChoice: null
  });
  
  return {
    success: true,
    action: 'daily_drop',
    profiles: profilesWithDescriptions
  };
}
```

---

## State Management

State is managed through a **session-based architecture** with Redis persistence and in-memory fallback.

### Session Structure

```javascript
const sessionData = {
  sessionId: "ABC12",                    // 5-character session code
  createdAt: "2025-10-30T12:00:00Z",    // Timestamp
  createdBy: "+1234567890",              // Creator phone number
  conversationSid: "CH...",              // Twilio Conversation SID (if using Conversations API)
  
  // Participants
  participants: [
    {
      phoneNumber: "+1234567890",
      name: "Sarah",
      joinedAt: "2025-10-30T12:00:00Z",
      role: "creator"
    },
    {
      phoneNumber: "+1987654321",
      name: "Mike",
      joinedAt: "2025-10-30T12:05:00Z",
      role: "friend"
    }
  ],
  
  primaryUser: {
    phoneNumber: "+1234567890",
    name: "Sarah",
    confirmedAt: "2025-10-30T12:02:00Z"
  },
  
  // Current stage
  stage: "profile_creation",
  
  // Profile schema (structured profile data)
  profileSchema: {
    name: "Sarah",
    age: 24,
    gender: "Female",
    photo: "https://r2.example.com/photo.jpg",
    schools: ["UC Berkeley"],
    interested_in: "Male",
    interests: ["Hiking", "Photography"],
    sexual_orientation: "Straight",
    relationship_intent: "Long-term, open to short",
    height: "5'6\"",
    bio: "Adventure seeker and coffee enthusiast...",
    prompts: [
      { question: "My weakness is...", answer: "Late night tacos" },
      { question: "Perks of dating me...", answer: "I'll plan the best weekend trips" }
    ]
  },
  
  // Additional data
  data: {
    photos: ["https://r2.example.com/photo1.jpg", "https://r2.example.com/photo2.jpg"],
    interests: ["Hiking"],
    preferences: {}
  },
  
  // Conversation history for AI context
  messages: [
    { role: "user", content: "Hey!", sender: "Sarah", phoneNumber: "+1234567890" },
    { role: "assistant", content: "Hi Sarah! Let's create your profile!" }
  ],
  
  // Action history
  actions: [
    {
      timestamp: "2025-10-30T12:03:00Z",
      type: "update_profile_schema",
      action: { type: "update_profile_schema", field: "name", value: "Sarah" },
      result: { success: true },
      success: true
    }
  ],
  
  // Generated profile (after generate_profile action)
  generatedProfile: {
    id: "profile_ABC12_1730289600000",
    ...profileSchema,
    profileUrl: "https://example.com/p/token123",
    status: "pending_review",
    createdAt: "2025-10-30T12:10:00Z"
  },
  
  // Committed profile (after commit_profile action)
  committedProfile: {
    ...generatedProfile,
    status: "committed",
    committedAt: "2025-10-30T12:15:00Z"
  },
  
  // Daily drops (matching profiles)
  dailyDrops: [
    {
      timestamp: "2025-10-30T12:20:00Z",
      profiles: [
        { name: "Alex", age: 25, profileUrl: "...", description: "..." },
        { name: "Jamie", age: 26, profileUrl: "...", description: "..." }
      ],
      userChoice: null
    }
  ]
};
```

### Storage Layer (`src/core/ai-matchmaker.js`)

**Dual Storage Strategy**:
```javascript
// Redis (primary) - persists across restarts
const redisClient = redis.createClient({ url: 'redis://127.0.0.1:6379' });

// In-memory (fallback) - if Redis fails
const sessions = new Map();
const phoneToSession = new Map();
```

**Storage Functions**:

#### Save Session
```javascript
async function setSession(sessionId, sessionData) {
  try {
    if (redisClient && redisClient.isOpen) {
      await redisClient.set(`session:${sessionId}`, JSON.stringify(sessionData));
      logger.debug('Session saved to Redis', { sessionId });
    } else {
      sessions.set(sessionId, sessionData);
      logger.debug('Session saved to memory', { sessionId });
    }
  } catch (error) {
    logger.error('Failed to save to Redis, using memory', { sessionId, error });
    sessions.set(sessionId, sessionData);
  }
}
```

#### Get Session
```javascript
async function getSessionData(sessionId) {
  try {
    if (redisClient && redisClient.isOpen) {
      const data = await redisClient.get(`session:${sessionId}`);
      return data ? JSON.parse(data) : null;
    } else {
      return sessions.get(sessionId) || null;
    }
  } catch (error) {
    logger.error('Failed to get from Redis, using memory', { sessionId, error });
    return sessions.get(sessionId) || null;
  }
}
```

#### Phone-to-Session Mapping
```javascript
async function setPhoneMapping(phoneNumber, sessionId) {
  // Maps phone number to session ID for quick lookups
  if (redisClient && redisClient.isOpen) {
    await redisClient.set(`phone:${phoneNumber}`, sessionId);
  } else {
    phoneToSession.set(phoneNumber, sessionId);
  }
}

async function getPhoneMapping(phoneNumber) {
  if (redisClient && redisClient.isOpen) {
    return await redisClient.get(`phone:${phoneNumber}`);
  } else {
    return phoneToSession.get(phoneNumber);
  }
}
```

### How State is Updated

**1. User sends message** → `handleMessage()` in `ai-matchmaker.js`
```javascript
async function handleMessage(from, message, profileName, mediaUrls) {
  const phoneNumber = from.replace('whatsapp:', '');
  
  // Get or create session
  let session = await getSession(phoneNumber);
  if (!session) {
    sessionId = await createSession(phoneNumber, profileName);
    session = await getSessionById(sessionId);
  }
  
  // Store media URLs if present
  if (mediaUrls.length > 0) {
    session.data.photos.push(...mediaUrls);
    await setSession(session.sessionId, session);
  }
  
  // Generate AI response
  const aiResult = await generateAIResponse(session.sessionId, message, phoneNumber);
  
  // Execute actions (modifies session)
  for (const action of aiResult.actions) {
    const result = await executeAction(action, session);
    if (result.success) {
      await setSession(session.sessionId, session); // Save after each action
    }
  }
  
  return { response: aiResult.message, sessionId, participants };
}
```

**2. AI generates response** → `generateAIResponse()` in `ai-matchmaker.js`
```javascript
async function generateAIResponse(sessionId, userMessage, phoneNumber) {
  let session = await getSessionData(sessionId);
  
  // Save user message to history
  await saveMessage(sessionId, 'user', userMessage, phoneNumber);
  
  // Re-fetch session to get updated messages
  session = await getSessionData(sessionId);
  
  // Build dynamic prompt
  const actionInstructions = getActionInstructions(
    session.stage,
    session.participants,
    session.profileSchema,
    session.data
  );
  const fullSystemPrompt = `${MATCHMAKER_BASE_PROMPT}\n\n${actionInstructions}`;
  
  // Format messages with sender names
  const formattedMessages = session.messages.map(m => {
    if (m.role === 'user' && m.sender) {
      return { role: m.role, content: `${m.sender}: ${m.content}` };
    }
    return { role: m.role, content: m.content };
  });
  
  // Call LLM
  const llmResult = await callLLM([
    { role: 'system', content: fullSystemPrompt },
    ...formattedMessages
  ], {
    response_format: { type: "json_object" }
  });
  
  // Parse response
  const parsed = parseAIResponse(llmResult.content);
  
  // Save assistant message
  if (parsed.message) {
    await saveMessage(sessionId, 'assistant', parsed.message);
  }
  
  return parsed; // { message, actions, reasoning }
}
```

**3. Actions execute** → `executeAction()` in `actions.js`
```javascript
// Action execution modifies session IN PLACE
async function executeAction(action, session, twilioSendMessage) {
  switch (action.type) {
    case ACTION_TYPES.UPDATE_PROFILE_SCHEMA:
      // Modifies session.profileSchema
      session.profileSchema[field] = value;
      return { success: true };
    
    case ACTION_TYPES.UPDATE_STAGE:
      // Modifies session.stage
      session.stage = newStage;
      return { success: true };
    
    case ACTION_TYPES.GENERATE_PROFILE:
      // Creates session.generatedProfile
      session.generatedProfile = generatedProfile;
      session.stage = STAGES.PROFILE_REVIEW;
      return { success: true, profileUrl };
  }
}
```

**4. Session persists** → After each action
```javascript
for (const action of aiResult.actions) {
  const result = await executeAction(action, session);
  if (result.success) {
    await setSession(sessionId, session); // PERSIST TO REDIS
  }
}
```

---

## Tool Use (Function Calling)

The AI uses **structured output** (JSON) to perform actions. This is similar to OpenAI's function calling or tool use.

### Response Format

The AI **always** responds in this JSON format:
```json
{
  "message": "Hey Sarah! What's your age?",
  "actions": [
    {
      "type": "update_profile_schema",
      "field": "name",
      "value": "Sarah"
    },
    {
      "type": "update_stage",
      "stage": "profile_creation"
    }
  ],
  "reasoning": "Stored the user's name and transitioned to profile creation stage"
}
```

**Enforcement**:
```javascript
const llmResult = await callLLM([
  { role: 'system', content: fullSystemPrompt },
  ...formattedMessages
], {
  response_format: { type: "json_object" } // Forces JSON response
});
```

### Parsing AI Response

```javascript
function parseAIResponse(aiResponse) {
  try {
    const parsed = JSON.parse(aiResponse);
    
    // Accept response if it has message OR actions (or both)
    if (parsed.message || (parsed.actions && Array.isArray(parsed.actions))) {
      return {
        message: parsed.message || '',
        actions: parsed.actions || [],
        reasoning: parsed.reasoning || ''
      };
    }
    
    // Fallback: treat as plain text
    return {
      message: aiResponse,
      actions: [],
      reasoning: 'Plain text response'
    };
  } catch (error) {
    // Not valid JSON, treat as plain message
    return {
      message: aiResponse,
      actions: [],
      reasoning: 'Plain text response'
    };
  }
}
```

### Multi-Action Sequences

The AI can perform **multiple actions** in a single response:

**Example**: Collect name and transition stage
```json
{
  "message": "Got it, Sarah! Let's start building your profile.",
  "actions": [
    { "type": "update_profile_schema", "field": "name", "value": "Sarah" },
    { "type": "update_stage", "stage": "profile_creation" }
  ],
  "reasoning": "Stored name and transitioned to profile creation"
}
```

**Example**: Collect age and interests
```json
{
  "message": "Cool! So you're 24 and love hiking and photography. What school did you go to?",
  "actions": [
    { "type": "update_profile_schema", "field": "age", "value": 24 },
    { "type": "update_profile_schema", "field": "interests", "value": ["Hiking", "Photography"] }
  ],
  "reasoning": "Collected age and interests from conversation"
}
```

**Example**: Generate profile and send media
```json
{
  "message": "Here's your profile! What do you think?",
  "actions": [
    { "type": "generate_profile" },
    { 
      "type": "send_message", 
      "target": "all", 
      "message": "Check it out!",
      "mediaUrl": "https://r2.example.com/profile_card.png"
    }
  ],
  "reasoning": "Generated profile and sent the card image to all participants"
}
```

### Action Constraints

**Validation**: Each action is validated during execution:
```javascript
// Stage validation
if (!Object.values(STAGES).includes(stage)) {
  return { success: false, error: 'Invalid stage' };
}

// Field validation
if (!PROFILE_SCHEMA[fieldName]) {
  return { success: false, error: 'Unknown field' };
}

// Value validation
if (!fieldDef.validate(value)) {
  return { success: false, error: 'Invalid value' };
}
```

**Stage Constraints**: Some actions are only valid in certain stages:
```javascript
// commit_profile: only in profile_review stage
if (session.stage !== STAGES.PROFILE_REVIEW) {
  return { success: false, error: 'Can only commit from review stage' };
}

// daily_drop: only in profile_committed stage
if (session.stage !== STAGES.PROFILE_COMMITTED) {
  return { success: false, error: 'Can only do daily drop after commit' };
}
```

---

## Stage-Based Flow

The conversation progresses through **defined stages**, each with specific behaviors and valid transitions.

### Stage Definitions (`src/core/constants.js`)

```javascript
const STAGES = {
  INTRODUCTION: 'introduction',
  PROFILE_CREATION: 'profile_creation',
  PROFILE_CONFIRMATION: 'profile_confirmation',
  PROFILE_REVIEW: 'profile_review',
  PROFILE_COMMITTED: 'profile_committed',
  FETCHING_PROFILES: 'fetching_profiles'
};

const CORE_STAGE_FLOW = [
  STAGES.INTRODUCTION,
  STAGES.PROFILE_CREATION,
  STAGES.PROFILE_CONFIRMATION,
  STAGES.PROFILE_REVIEW,
  STAGES.PROFILE_COMMITTED
];
```

### Stage Flow Diagram

```
┌──────────────────┐
│  INTRODUCTION    │  - Greet user
│                  │  - Explain how it works
│                  │  - Share session code
└────────┬─────────┘
         │
         │ AI transitions when ready
         ▼
┌──────────────────┐
│ PROFILE_CREATION │  - Collect ALL profile fields
│                  │  - Any participant can answer
│                  │  - AI asks questions naturally
│                  │  - Stay here until complete
└────────┬─────────┘
         │
         │ When schema 100% complete
         ▼
┌──────────────────┐
│ PROFILE_         │  - Show profile summary
│ CONFIRMATION     │  - Ask for confirmation
│                  │  - Send template with buttons
└────────┬─────────┘
         │
         │ User approves
         ▼
┌──────────────────┐
│ PROFILE_REVIEW   │  - Show generated profile
│                  │  - User can iterate
│                  │  - Change fields → regenerate
│                  │  - Send template with buttons
└────────┬─────────┘
         │
         │ User explicitly approves
         ▼
┌──────────────────┐
│ PROFILE_         │  - Finalize profile
│ COMMITTED        │  - IMMEDIATELY call daily_drop
│                  │  - Present 2 random profiles
│                  │  - User votes
└────────┬─────────┘
         │
         │ After daily drop voting (if surfacing matches)
         ▼
┌──────────────────┐
│ FETCHING_PROFILES│  - Optional: temporary while matches surface
└──────────────────┘
```

### Stage-Specific Behaviors

#### INTRODUCTION
**Goal**: Welcome user, explain process, share session code

**AI Behavior**:
- Warm greeting
- Explain group chat concept
- Generate and share join code
- Ask who the profile is for

**Example Flow**:
```
AI: "Hey Sarah! 👋 I'm your AI matchmaker! I've created session ABC12 for you.
Once your friends join, we'll create an amazing dating profile together!
Ready to start?"

User: "Yes!"

AI: "Awesome! First, what's your age?"
[AI calls: update_stage("profile_creation")]
```

#### PROFILE_CREATION
**Goal**: Collect all required profile fields through natural conversation

**AI Behavior**:
- Ask ONE question at a time
- Accept answers from ANY participant
- Mirror language naturally
- Bring friends in for feedback
- Call `update_profile_schema` for each field
- Stay in this stage until ALL required fields are collected

**Example Flow**:
```
AI: "How old are you?"
Sarah: "I'm 24"
[AI calls: update_profile_schema("age", 24)]

AI: "Cool! And what school did you go to?"
Sarah: "UC Berkeley"
[AI calls: update_profile_schema("schools", ["UC Berkeley"])]

AI: "Nice! What are you interested in? Any hobbies?"
Mike (friend): "She's super into hiking and photography"
[AI calls: update_profile_schema("interests", ["Hiking", "Photography"])]

... continues until all fields collected ...
```

**Required Fields** (from `profile-schema.js`):
- name
- age
- gender
- photo
- schools
- interested_in
- interests (minimum 2)
- sexual_orientation
- relationship_intent
- height
- bio

**Dynamic Prompt Injection**:
The AI sees missing fields in real-time:
```
Missing Fields:
- age
- photo
- bio
```

As fields are collected, they disappear from this list.

#### PROFILE_CONFIRMATION
**Goal**: Show summary and get explicit approval before generation

**AI Behavior**:
- Show formatted summary of all collected data
- Use `send_template_message` with interactive buttons
- Wait for user approval

**Example Flow**:
```
AI: "Profile summary:

Name: Sarah
Age: 24
Gender: Female
School: UC Berkeley
Interested in: Men
Interests: Hiking, Photography

Ready to generate?"

[AI calls: send_template_message("profile_confirmation", {
  "1": "Name: Sarah\\nAge: 24\\nGender: Female\\n..."
})]

User clicks: "Yes, generate! ✨"

[AI transitions to profile_generation]
```

#### PROFILE_GENERATION
**Goal**: Generate profile card image and URL

**AI Behavior**:
- Call `generate_profile` action
- Automatically transition to `profile_review` (no user wait)

**Example Flow**:
```
[AI calls: generate_profile()]
[System executes: creates profile card, generates URL, stores in session]
[AI auto-transitions to: profile_review]
```

#### PROFILE_REVIEW
**Goal**: Present generated profile, allow iteration

**AI Behavior**:
- Show profile URL
- Use `send_template_message` with review buttons
- Allow user to change fields and regenerate
- Only advance on explicit approval

**Iteration Support**:
```
User: "Can you change my bio to something shorter?"
[AI calls: update_profile_schema("bio", "new bio text")]
[AI calls: generate_profile()] // Regenerates with new data

User: "Actually, can I use a different photo?"
[User uploads new photo]
[AI calls: update_profile_schema("photo", "new_photo_url")]
[AI calls: generate_profile()] // Regenerates again

User: "Perfect! I love it!"
[AI calls: commit_profile()]
[AI transitions to: profile_committed]
```

**Example Flow**:
```
AI: "Here's your profile! Check it out: https://example.com/p/token123"

[AI calls: send_template_message("profile_review", {})]
[Template shows buttons: "Perfect! ✅", "Change photo 📸", "Edit details ✏️"]

User clicks: "Perfect! ✅"

[AI calls: commit_profile()]
[AI transitions to: profile_committed]
```

#### PROFILE_COMMITTED
**Goal**: Finalize profile and start matching game

**AI Behavior**:
- Mark profile as committed
- **IMMEDIATELY** call `daily_drop` action
- Present 2 random demo profiles
- Ask user to vote

**Example Flow**:
```
[AI calls: commit_profile()]
[AI immediately calls: daily_drop()]

AI: "Alright, daily drop time. I have 2 profiles for you Sarah:

1. Alex, 25 - Loves hiking and has a dog, weakness: late night tacos
   https://example.com/p/alex

2. Jamie, 26 - Creative soul who loves photography, perks: plans the best trips
   https://example.com/p/jamie

What's the move? Pick one:
1. Alex
2. Jamie
3. Both
4. Neither"

User: "Both!"

AI: "Love the enthusiasm! 😄 Sending likes now."
[Conversation ends]
```

---

## Adding New Actions

To add a new action, follow these steps:

### Step 1: Define Action Type

Add to `src/core/constants.js`:
```javascript
const ACTION_TYPES = {
  // ... existing actions
  MY_NEW_ACTION: 'my_new_action'
};
```

### Step 2: Add Action Instructions

Update `src/prompts/action-instructions.js` to describe the new action:
```javascript
function getActionInstructions(currentStage, participants, profileSchema, sessionData) {
  return `
## ACTIONS
You can perform these actions:

...existing actions...

7. **my_new_action**: {"type": "my_new_action", "param1": "value1", "param2": "value2"} - Description of what this action does

...
`;
}
```

### Step 3: Implement Action Executor

Add to `src/core/actions.js`:

```javascript
/**
 * Execute my_new_action
 * @param {Object} action - Action with param1, param2
 * @param {Object} session - Current session
 * @returns {Promise<Object>} Result
 */
async function executeMyNewAction(action, session) {
  const { param1, param2 } = action;
  
  logger.info('Executing my_new_action', {
    sessionId: session.sessionId,
    param1,
    param2
  });
  
  // Validate parameters
  if (!param1 || !param2) {
    return { success: false, error: 'param1 and param2 are required' };
  }
  
  // Perform action logic
  try {
    // Modify session state
    session.myNewField = param1 + param2;
    
    // Trigger side effects (API calls, etc.)
    await someExternalService.doSomething(param1, param2);
    
    logger.info('my_new_action completed', {
      sessionId: session.sessionId,
      result: session.myNewField
    });
    
    return {
      success: true,
      action: 'my_new_action_completed',
      result: session.myNewField
    };
  } catch (error) {
    logger.error('my_new_action failed', {
      sessionId: session.sessionId,
      error: error.message
    });
    return {
      success: false,
      error: error.message
    };
  }
}
```

### Step 4: Add to Action Router

Update `executeAction()` in `src/core/actions.js`:
```javascript
async function executeAction(action, session, twilioSendMessage) {
  switch (action.type) {
    // ... existing cases
    
    case ACTION_TYPES.MY_NEW_ACTION:
      return await executeMyNewAction(action, session);
    
    default:
      logger.warn('Unknown action type', { type: action.type });
      return { success: false, error: 'Unknown action type' };
  }
}
```

### Step 5: Update Stage Flow (if needed)

If your action should trigger stage transitions or has stage constraints:

```javascript
async function executeMyNewAction(action, session) {
  // Stage validation
  if (session.stage !== STAGES.MY_REQUIRED_STAGE) {
    return {
      success: false,
      error: 'Can only perform this action in MY_REQUIRED_STAGE'
    };
  }
  
  // ... action logic ...
  
  // Stage transition
  session.stage = STAGES.NEXT_STAGE;
  
  return { success: true };
}
```

### Step 6: Test

Test with a real conversation:
```
User: "Do the thing"

AI Response:
{
  "message": "Sure, doing the thing!",
  "actions": [
    { "type": "my_new_action", "param1": "hello", "param2": "world" }
  ],
  "reasoning": "User requested the action"
}
```

Check logs:
```
[INFO] Executing my_new_action { sessionId: 'ABC12', param1: 'hello', param2: 'world' }
[INFO] my_new_action completed { sessionId: 'ABC12', result: 'helloworld' }
```

---

## Examples

### Example 1: Simple Field Collection

**User Message**: "I'm 24 years old"

**AI Thought Process**:
1. Parse user message → extract age
2. Check current state → stage is profile_creation, age field is missing
3. Generate response → acknowledge and ask next question
4. Generate actions → update_profile_schema for age

**AI Response**:
```json
{
  "message": "Cool! And what school did you go to?",
  "actions": [
    {
      "type": "update_profile_schema",
      "field": "age",
      "value": 24
    }
  ],
  "reasoning": "User provided their age, storing it in the profile schema and asking for school information"
}
```

**State Changes**:
- `session.profileSchema.age` → 24
- Missing fields list updated (age removed)
- Message added to conversation history

---

### Example 2: Multi-Field Collection from Friend

**Context**: 
- Primary user: Sarah
- Friend: Mike

**Mike's Message**: "She's 24 and went to Berkeley. She loves hiking and photography."

**AI Thought Process**:
1. Parse message → extract age, school, interests
2. Check speaker → Mike (friend), but data is about Sarah (primary user)
3. Generate response → acknowledge Mike, confirm with Sarah
4. Generate actions → multiple update_profile_schema calls

**AI Response**:
```json
{
  "message": "Thanks Mike! So Sarah, you're 24, went to Berkeley, and love hiking and photography? Got it right?",
  "actions": [
    {
      "type": "update_profile_schema",
      "field": "age",
      "value": 24
    },
    {
      "type": "update_profile_schema",
      "field": "schools",
      "value": ["UC Berkeley"]
    },
    {
      "type": "update_profile_schema",
      "field": "interests",
      "value": ["Hiking", "Photography"]
    }
  ],
  "reasoning": "Mike provided multiple details about Sarah. Storing age, school, and interests, then confirming with Sarah."
}
```

**State Changes**:
- `session.profileSchema.age` → 24
- `session.profileSchema.schools` → ["UC Berkeley"]
- `session.profileSchema.interests` → ["Hiking", "Photography"]
- Multiple fields removed from missing list

---

### Example 3: Stage Transition (Profile Complete)

**Context**: All required fields collected

**User Message**: "Yep, that's everything!"

**AI Thought Process**:
1. Check state → all required fields filled
2. Check current stage → profile_creation
3. Should transition → profile_confirmation
4. Generate response → show summary, ask for approval
5. Generate actions → update_stage, send_template_message

**AI Response**:
```json
{
  "message": "Perfect! Here's your profile summary:\n\nName: Sarah\nAge: 24\nGender: Female\nSchool: UC Berkeley\nInterested in: Men\nInterests: Hiking, Photography\nOrientation: Straight\nLooking for: Long-term, open to short\nHeight: 5'6\"\nBio: Adventure seeker...\n\nLooks good?",
  "actions": [
    {
      "type": "update_stage",
      "stage": "profile_confirmation"
    },
    {
      "type": "send_template_message",
      "templateType": "profile_confirmation",
      "variables": {
        "1": "Name: Sarah\\nAge: 24\\nGender: Female\\nSchool: UC Berkeley\\nInterested in: Men\\nInterests: Hiking, Photography"
      }
    }
  ],
  "reasoning": "All profile fields are now complete. Transitioning to confirmation stage and sending interactive template for user approval."
}
```

**State Changes**:
- `session.stage` → "profile_confirmation"
- Template message sent (with buttons) via Twilio

---

### Example 4: Profile Generation with Iteration

**Context**: User in profile_review stage, wants to change bio

**User Message**: "Can you make my bio shorter?"

**AI Thought Process**:
1. Check stage → profile_review
2. User wants change → update bio
3. Must regenerate → call generate_profile
4. Generate response → acknowledge change

**AI Response**:
```json
{
  "message": "Sure! How about: \"Adventure seeker and coffee enthusiast\"?",
  "actions": [
    {
      "type": "update_profile_schema",
      "field": "bio",
      "value": "Adventure seeker and coffee enthusiast"
    },
    {
      "type": "generate_profile"
    }
  ],
  "reasoning": "User wants a shorter bio. Creating condensed version, updating schema, and regenerating profile card."
}
```

**State Changes**:
- `session.profileSchema.bio` → "Adventure seeker and coffee enthusiast"
- Profile regenerated (new image created)
- `session.generatedProfile` updated with new data
- New profile URL created

**Follow-up**:
```
AI: "Here's the updated version: https://example.com/p/token456"
```

---

### Example 5: Daily Drop (Multi-Step Action)

**Context**: User just committed profile

**AI Thought Process**:
1. commit_profile succeeded
2. Must IMMEDIATELY call daily_drop
3. Present 2 profiles naturally
4. Ask for vote

**AI Response**:
```json
{
  "message": "alright, daily drop time. I have 2 profiles for you Sarah:\n\n1. Alex, 25 - Loves hiking and has a dog, weakness: late night tacos\nhttps://example.com/p/alex\n\n2. Jamie, 26 - Creative soul who loves photography, perks: plans the best trips\nhttps://example.com/p/jamie\n\nokay, what's the move? pick one:\n1. Alex\n2. Jamie\n3. Both\n4. Neither",
  "actions": [
    {
      "type": "daily_drop"
    }
  ],
  "reasoning": "Profile committed successfully. Executing daily drop to present 2 random demo profiles for user voting."
}
```

**State Changes**:
- `daily_drop` action executed
- 2 random profiles selected
- `session.dailyDrops` array updated with new entry

**User Follow-up**: "Both!"

**AI Response**:
```json
{
  "message": "Love the enthusiasm! 😄 Sending likes now.",
  "actions": [],
  "reasoning": "User chose both profiles. Acknowledging their choice and ending conversation."
}
```

---

## Key Takeaways

### 1. **Prompts are Modular**
- **Base Prompt**: Personality and style (iterate independently)
- **Action Instructions**: Dynamic, state-aware instructions (auto-generated at runtime)

### 2. **Actions are Structured Tools**
- AI doesn't just chat—it issues commands
- Actions modify state, trigger workflows
- Validated and executed by the system

### 3. **State is Persistent**
- Redis primary, in-memory fallback
- Session-based architecture
- Every action modifies and persists state

### 4. **Stages Control Flow**
- Linear progression through stages
- Stage constraints prevent invalid actions
- Stage-specific AI behaviors

### 5. **Conversation History is Key**
- AI sees full context (all messages with sender names)
- Messages saved after every interaction
- AI can reference previous conversation

### 6. **Multi-Participant Awareness**
- AI knows who said what (sender names in messages)
- Can address individuals or the group
- Friends can provide information about primary user

### 7. **Iteration is Built-In**
- Users can change fields and regenerate
- Profile review stage allows unlimited iteration
- Only commit_profile finalizes

### 8. **Extensibility by Design**
- Add new actions by implementing executor
- Update prompt instructions to expose to AI
- No changes to core flow required

---

## Architecture Diagram (Complete Flow)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER (WhatsApp)                             │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │ Message: "I'm 24"
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SERVER (server.js)                                │
│  - Receives webhook from Twilio                                          │
│  - Extracts message, sender, media                                       │
│  - Calls handleMessage()                                                 │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   AI MATCHMAKER (ai-matchmaker.js)                       │
│                                                                           │
│  1. Get/Create Session                                                   │
│     └─→ Redis: GET phone:+1234567890 → session:ABC12                    │
│     └─→ Redis: GET session:ABC12 → {sessionData}                        │
│                                                                           │
│  2. Save User Message                                                    │
│     └─→ session.messages.push({role: "user", content: "I'm 24", ...})   │
│     └─→ Redis: SET session:ABC12 {updatedSession}                       │
│                                                                           │
│  3. Build Dynamic Prompt                                                 │
│     ┌───────────────────────────────────────────────────────────┐       │
│     │ Base Prompt (personality, style)                          │       │
│     │ + Action Instructions (dynamic state info)                │       │
│     │   - Current stage: profile_creation                       │       │
│     │   - Missing fields: age, photo, bio                       │       │
│     │   - Participants: Sarah, Mike                             │       │
│     │   - Available actions: update_profile_schema, ...         │       │
│     └───────────────────────────────────────────────────────────┘       │
│                                                                           │
│  4. Call LLM                                                             │
│     └─→ OpenAI/Groq API                                                  │
│         - System: [full prompt]                                          │
│         - Messages: [conversation history with sender names]             │
│         - Response format: JSON                                          │
│                                                                           │
│  5. Parse AI Response                                                    │
│     {                                                                    │
│       "message": "Cool! What school?",                                   │
│       "actions": [                                                       │
│         {"type": "update_profile_schema", "field": "age", "value": 24}  │
│       ]                                                                  │
│     }                                                                    │
│                                                                           │
│  6. Save Assistant Message                                               │
│     └─→ session.messages.push({role: "assistant", content: "Cool!..."}) │
│     └─→ Redis: SET session:ABC12 {updatedSession}                       │
│                                                                           │
│  7. Execute Actions                                                      │
│     └─→ actions.js: executeAction()                                      │
│         - Validate action type                                           │
│         - Execute action logic                                           │
│         - Modify session state IN PLACE                                  │
│         - Return result                                                  │
│                                                                           │
│  8. Persist Session After Each Action                                    │
│     └─→ Redis: SET session:ABC12 {updatedSession}                       │
│                                                                           │
│  9. Return Response                                                      │
│     └─→ { response: "Cool! What school?", sessionId: "ABC12", ... }     │
│                                                                           │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        SERVER (server.js)                                │
│  - Receives response from handleMessage()                                │
│  - Broadcasts message to all participants                                │
│  - Sends via Twilio                                                      │
└────────────────────────────────┬────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              USER (WhatsApp)                             │
│  Receives: "Cool! What school did you go to?"                            │
└─────────────────────────────────────────────────────────────────────────┘

[LOOP CONTINUES...]
```

---

## Conclusion

This architecture demonstrates a **modern AI agent system** with:

1. **Structured Tool Use**: AI doesn't just generate text—it performs actions
2. **State Management**: Persistent session state with Redis
3. **Dynamic Prompting**: Context-aware instructions generated at runtime
4. **Modular Design**: Prompts, actions, and state are separated for independent iteration
5. **Multi-Stage Flow**: Linear progression with stage-specific behaviors
6. **Validation**: Actions are validated before execution
7. **Extensibility**: Easy to add new actions and behaviors

The system can handle complex multi-turn conversations, collect structured data, generate artifacts (profile cards), and orchestrate workflows—all through natural language and structured actions.

