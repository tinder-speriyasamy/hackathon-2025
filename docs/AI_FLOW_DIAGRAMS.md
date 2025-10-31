# AI System Flow Diagrams

Visual representations of how the AI system works, from high-level architecture to detailed action flows.

---

## Table of Contents
1. [Complete System Flow](#complete-system-flow)
2. [Message Processing Flow](#message-processing-flow)
3. [Action Execution Flow](#action-execution-flow)
4. [Stage Transition Flow](#stage-transition-flow)
5. [State Management Flow](#state-management-flow)
6. [Specific Action Flows](#specific-action-flows)

---

## Complete System Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                             USER                                     │
│                     (WhatsApp Message)                               │
│                                                                       │
│   Message: "I'm 24 years old"                                        │
│   From: whatsapp:+1234567890                                         │
│   ProfileName: "Sarah"                                               │
└──────────────────────────────┬──────────────────────────────────────┘
                                │
                                │ Twilio Webhook
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SERVER.JS                                     │
│                    (Express Server)                                  │
│                                                                       │
│  POST /sms/receive                                                   │
│  ├─ Extract message, sender, media                                  │
│  ├─ Download media (if present) → upload to R2                      │
│  └─ Call aiMatchmaker.handleMessage()                               │
│                                                                       │
└──────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    AI MATCHMAKER                                     │
│                  (ai-matchmaker.js)                                  │
│                                                                       │
│  handleMessage(from, message, profileName, mediaUrls)               │
│  │                                                                    │
│  ├─ 1. Get/Create Session                                           │
│  │    ├─ getPhoneMapping(phoneNumber) → sessionId                   │
│  │    └─ getSessionData(sessionId) → session                        │
│  │                                                                    │
│  ├─ 2. Store Media URLs (if present)                                │
│  │    ├─ session.data.photos.push(...mediaUrls)                     │
│  │    └─ setSession(sessionId, session)                             │
│  │                                                                    │
│  ├─ 3. Generate AI Response                                         │
│  │    │                                                               │
│  │    generateAIResponse(sessionId, message, phoneNumber)           │
│  │    │                                                               │
│  │    ├─ A. Save User Message                                       │
│  │    │    └─ session.messages.push({role:"user", content, sender}) │
│  │    │                                                               │
│  │    ├─ B. Build Dynamic Prompt                                    │
│  │    │    ├─ Base Prompt (personality)                             │
│  │    │    ├─ Action Instructions (dynamic state)                   │
│  │    │    │    ├─ Current stage                                    │
│  │    │    │    ├─ Missing fields                                   │
│  │    │    │    ├─ Uploaded photos                                  │
│  │    │    │    └─ Stage flow rules                                 │
│  │    │    └─ Conversation History (with sender names)              │
│  │    │                                                               │
│  │    ├─ C. Call LLM                                                │
│  │    │    ├─ Provider: OpenAI or Groq                              │
│  │    │    ├─ Format: JSON object                                   │
│  │    │    └─ Returns: {message, actions, reasoning}                │
│  │    │                                                               │
│  │    └─ D. Save Assistant Message                                  │
│  │         └─ session.messages.push({role:"assistant", content})    │
│  │                                                                    │
│  ├─ 4. Execute Actions                                              │
│  │    │                                                               │
│  │    └─ For each action in aiResult.actions:                       │
│  │         ├─ executeAction(action, session)                        │
│  │         │    ├─ Validate action type                             │
│  │         │    ├─ Execute action logic                             │
│  │         │    ├─ Modify session state                             │
│  │         │    └─ Return result                                    │
│  │         │                                                          │
│  │         └─ setSession(sessionId, session)  // Save after each    │
│  │                                                                    │
│  └─ 5. Return Response                                              │
│       └─ {response, sessionId, participants, profileUrl}            │
│                                                                       │
└──────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        SERVER.JS                                     │
│                   (Broadcast to All)                                 │
│                                                                       │
│  ├─ Format message with sender name                                 │
│  ├─ Send to all participants (via Twilio)                           │
│  └─ Include media (if profileUrl present)                           │
│                                                                       │
└──────────────────────────────┬──────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────┐
│                             USERS                                    │
│                      (All Participants)                              │
│                                                                       │
│   Sarah receives: "Cool! What school did you go to?"                │
│   Mike receives: "Cool! What school did you go to?"                 │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Message Processing Flow

### From User Input to AI Response

```
┌────────────────────┐
│   User Types       │
│   "I'm 24"         │
└─────────┬──────────┘
          │
          ▼
┌──────────────────────────────────────────────────────────┐
│  1. SESSION LOOKUP                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │  getPhoneMapping("+1234567890")                    │ │
│  │    ↓                                                │ │
│  │  Redis: GET phone:+1234567890                      │ │
│  │    ↓                                                │ │
│  │  Returns: "ABC12"                                  │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  getSessionData("ABC12")                           │ │
│  │    ↓                                                │ │
│  │  Redis: GET session:ABC12                          │ │
│  │    ↓                                                │ │
│  │  Returns: {sessionId, stage, profileSchema, ...}   │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  2. MESSAGE HISTORY UPDATE                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │  session.messages.push({                           │ │
│  │    role: "user",                                   │ │
│  │    content: "I'm 24",                              │ │
│  │    sender: "Sarah",                                │ │
│  │    phoneNumber: "+1234567890"                      │ │
│  │  })                                                │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Redis: SET session:ABC12 {updatedSession}        │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  3. PROMPT CONSTRUCTION                                   │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Base Prompt (static)                              │ │
│  │  ─────────────────────────────────────             │ │
│  │  You're a warm, friendly AI matchmaker...         │ │
│  │  • Keep messages SHORT: 1-3 sentences              │ │
│  │  • Use emojis judiciously                          │ │
│  │  ...                                               │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Action Instructions (dynamic)                     │ │
│  │  ─────────────────────────────────────             │ │
│  │  ## CURRENT STATE                                  │ │
│  │  Stage: profile_creation                           │ │
│  │  Participants: Sarah, Mike                         │ │
│  │  Schema Complete: NO                               │ │
│  │                                                     │ │
│  │  Missing Fields:                                   │ │
│  │  - age                                             │ │
│  │  - photo                                           │ │
│  │  - bio                                             │ │
│  │                                                     │ │
│  │  ## ACTIONS                                        │ │
│  │  1. update_profile_schema                          │ │
│  │  2. update_stage                                   │ │
│  │  ...                                               │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Conversation History (formatted)                  │ │
│  │  ─────────────────────────────────────             │ │
│  │  [                                                 │ │
│  │    {role: "system", content: "...full prompt..."},│ │
│  │    {role: "user", content: "Sarah: I'm 24"}       │ │
│  │  ]                                                 │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  4. LLM CALL                                              │
│  ┌────────────────────────────────────────────────────┐ │
│  │  callLLM(messages, {                               │ │
│  │    response_format: { type: "json_object" }        │ │
│  │  })                                                │ │
│  │    ↓                                                │ │
│  │  OpenAI/Groq API                                   │ │
│  │    ↓                                                │ │
│  │  Returns: '{"message":"Cool! What school?", ...}'  │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  5. PARSE RESPONSE                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │  parseAIResponse(responseText)                     │ │
│  │    ↓                                                │ │
│  │  JSON.parse()                                      │ │
│  │    ↓                                                │ │
│  │  {                                                 │ │
│  │    message: "Cool! What school?",                  │ │
│  │    actions: [                                      │ │
│  │      {type:"update_profile_schema", field:"age",   │ │
│  │       value:24}                                    │ │
│  │    ],                                              │ │
│  │    reasoning: "Stored age from user message"      │ │
│  │  }                                                 │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  6. SAVE ASSISTANT MESSAGE                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │  session.messages.push({                           │ │
│  │    role: "assistant",                              │ │
│  │    content: "Cool! What school?"                   │ │
│  │  })                                                │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Redis: SET session:ABC12 {updatedSession}        │ │
│  └────────────────────────────────────────────────────┘ │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ▼
┌──────────────────────────────────────────────────────────┐
│  7. EXECUTE ACTIONS                                       │
│  (See "Action Execution Flow" below)                     │
└──────────────────────────────────────────────────────────┘
```

---

## Action Execution Flow

### How Actions Modify State

```
┌─────────────────────────────────────────────────────┐
│  AI Response Parsed                                  │
│  ────────────────────                                │
│  {                                                   │
│    message: "Cool! What school?",                    │
│    actions: [                                        │
│      {type: "update_profile_schema",                 │
│       field: "age", value: 24}                       │
│    ]                                                 │
│  }                                                   │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │  For each action:    │
          └──────────┬───────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  1. ACTION ROUTING                                   │
│  ┌───────────────────────────────────────────────┐ │
│  │  executeAction(action, session)               │ │
│  │    ↓                                           │ │
│  │  switch (action.type) {                       │ │
│  │    case "update_profile_schema":              │ │
│  │      → executeUpdateProfileSchema()           │ │
│  │    case "update_stage":                       │ │
│  │      → executeUpdateStage()                   │ │
│  │    case "generate_profile":                   │ │
│  │      → executeGenerateProfile()               │ │
│  │    ...                                        │ │
│  │  }                                            │ │
│  └───────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  2. VALIDATION                                       │
│  ┌───────────────────────────────────────────────┐ │
│  │  executeUpdateProfileSchema(action, session)  │ │
│  │    ↓                                           │ │
│  │  const { field, value } = action;             │ │
│  │    ↓                                           │ │
│  │  // Check field exists                        │ │
│  │  if (!PROFILE_SCHEMA[field]) {                │ │
│  │    return {success: false, error: "Unknown"}  │ │
│  │  }                                            │ │
│  │    ↓                                           │ │
│  │  // Validate value                            │ │
│  │  if (!fieldDef.validate(value)) {             │ │
│  │    return {success: false, error: "Invalid"}  │ │
│  │  }                                            │ │
│  └───────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │
                     │ ✅ Valid
                     ▼
┌─────────────────────────────────────────────────────┐
│  3. STATE MODIFICATION                               │
│  ┌───────────────────────────────────────────────┐ │
│  │  // Update session IN PLACE                   │ │
│  │  session.profileSchema[field] = value;        │ │
│  │                                               │ │
│  │  // Example:                                  │ │
│  │  session.profileSchema["age"] = 24;           │ │
│  │                                               │ │
│  │  // Session now has:                          │ │
│  │  {                                            │ │
│  │    sessionId: "ABC12",                        │ │
│  │    stage: "profile_creation",                 │ │
│  │    profileSchema: {                           │ │
│  │      name: "Sarah",                           │ │
│  │      age: 24,  ← UPDATED                      │ │
│  │      gender: null,                            │ │
│  │      ...                                      │ │
│  │    }                                          │ │
│  │  }                                            │ │
│  └───────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  4. LOGGING                                          │
│  ┌───────────────────────────────────────────────┐ │
│  │  logger.info('✅ Profile schema updated', {   │ │
│  │    sessionId: 'ABC12',                        │ │
│  │    field: 'age',                              │ │
│  │    value: 24                                  │ │
│  │  });                                          │ │
│  └───────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  5. ACTION HISTORY                                   │
│  ┌───────────────────────────────────────────────┐ │
│  │  logAction(session, action, result);          │ │
│  │    ↓                                           │ │
│  │  session.actions.push({                       │ │
│  │    timestamp: "2025-10-30T12:00:00Z",         │ │
│  │    type: "update_profile_schema",             │ │
│  │    action: {field: "age", value: 24},         │ │
│  │    result: {success: true},                   │ │
│  │    success: true                              │ │
│  │  });                                          │ │
│  └───────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  6. PERSIST TO STORAGE                               │
│  ┌───────────────────────────────────────────────┐ │
│  │  setSession(sessionId, session);              │ │
│  │    ↓                                           │ │
│  │  Redis: SET session:ABC12 {                   │ │
│  │    sessionId: "ABC12",                        │ │
│  │    profileSchema: {age: 24, ...},             │ │
│  │    messages: [...],                           │ │
│  │    actions: [...]                             │ │
│  │  }                                            │ │
│  └───────────────────────────────────────────────┘ │
└────────────────────┬────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────┐
│  7. RETURN RESULT                                    │
│  ┌───────────────────────────────────────────────┐ │
│  │  return {                                     │ │
│  │    success: true,                             │ │
│  │    action: 'schema_field_updated',            │ │
│  │    field: 'age'                               │ │
│  │  };                                           │ │
│  └───────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## Stage Transition Flow

### Complete Stage Progression

```
┌──────────────────────────────────────────────────────┐
│  INTRODUCTION                                         │
│  ────────────────────────────────────────            │
│  • Welcome user                                       │
│  • Create session                                     │
│  • Share join code                                    │
│  • Ask who profile is for                            │
│                                                       │
│  AI Behavior:                                        │
│  ├─ Generate session code (ABC12)                    │
│  ├─ Send welcome message                             │
│  └─ Transition when user ready                       │
└─────────────────────┬────────────────────────────────┘
                      │
                      │ update_stage("profile_creation")
                      ▼
┌──────────────────────────────────────────────────────┐
│  PROFILE_CREATION                                     │
│  ────────────────────────────────────────            │
│  • Collect ALL profile fields                        │
│  • Ask ONE question at a time                        │
│  • Accept answers from ANY participant               │
│  • Use update_profile_schema for each field          │
│  • Monitor missing fields                            │
│                                                       │
│  AI Behavior:                                        │
│  ├─ Ask: "How old are you?"                          │
│  │   → update_profile_schema("age", 24)              │
│  ├─ Ask: "What school?"                              │
│  │   → update_profile_schema("schools", ["Berkeley"])│
│  ├─ Ask: "What are your interests?"                  │
│  │   → update_profile_schema("interests", [...])     │
│  └─ Continue until all fields collected              │
│                                                       │
│  Exit Condition: ALL required fields filled          │
└─────────────────────┬────────────────────────────────┘
                      │
                      │ When schema 100% complete
                      │ update_stage("profile_confirmation")
                      ▼
┌──────────────────────────────────────────────────────┐
│  PROFILE_CONFIRMATION                                 │
│  ────────────────────────────────────────            │
│  • Show profile summary                              │
│  • Ask for explicit approval                         │
│  • Send interactive template with buttons            │
│                                                       │
│  AI Behavior:                                        │
│  ├─ Display formatted summary                        │
│  └─ send_template_message("profile_confirmation")    │
│       Template buttons:                              │
│       • "Yes, generate! ✨"                           │
│       • "Make changes"                               │
│       • "Start over"                                 │
│                                                       │
│  Exit Condition: User approves                       │
└─────────────────────┬────────────────────────────────┘
                      │
                      │ User clicks "Yes, generate! ✨"
                      │ update_stage("profile_generation")
                      ▼
┌──────────────────────────────────────────────────────┐
│  PROFILE_GENERATION                                   │
│  ────────────────────────────────────────            │
│  • Generate profile card image                       │
│  • Create shareable URL                              │
│  • Store in session.generatedProfile                 │
│  • AUTO-TRANSITION (no user wait)                    │
│                                                       │
│  AI Behavior:                                        │
│  └─ generate_profile()                               │
│       ├─ Validate min fields (name, age, photo)      │
│       ├─ Create profile object                       │
│       ├─ Generate profile URL                        │
│       └─ Auto-transition to profile_review           │
│                                                       │
│  Exit Condition: Automatic                           │
└─────────────────────┬────────────────────────────────┘
                      │
                      │ Automatic
                      │ session.stage = "profile_review"
                      ▼
┌──────────────────────────────────────────────────────┐
│  PROFILE_REVIEW                                       │
│  ────────────────────────────────────────            │
│  • Show generated profile URL                        │
│  • Allow iteration (change fields → regenerate)      │
│  • Send interactive template with buttons            │
│  • Only advance on explicit approval                 │
│                                                       │
│  AI Behavior:                                        │
│  ├─ Show profile URL                                 │
│  └─ send_template_message("profile_review")          │
│       Template buttons:                              │
│       • "Perfect! ✅"                                 │
│       • "Change photo 📸"                             │
│       • "Edit details ✏️"                             │
│                                                       │
│  Iteration Support:                                  │
│  ├─ User: "Change my bio"                            │
│  ├─ AI: update_profile_schema("bio", "new text")     │
│  └─ AI: generate_profile() → regenerate              │
│                                                       │
│  Exit Condition: User explicitly approves            │
└─────────────────────┬────────────────────────────────┘
                      │
                      │ User clicks "Perfect! ✅"
                      │ commit_profile()
                      │ update_stage("profile_committed")
                      ▼
┌──────────────────────────────────────────────────────┐
│  PROFILE_COMMITTED                                    │
│  ────────────────────────────────────────            │
│  • Finalize profile                                  │
│  • IMMEDIATELY execute daily_drop                    │
│  • Present 2 random demo profiles                    │
│  • Ask user to vote                                  │
│                                                       │
│  AI Behavior:                                        │
│  ├─ commit_profile()                                 │
│  │   ├─ Mark status as "committed"                   │
│  │   └─ Store timestamp                              │
│  │                                                    │
│  ├─ daily_drop() [IMMEDIATE]                         │
│  │   ├─ Select 2 random profiles                     │
│  │   ├─ Generate catchy descriptions                 │
│  │   └─ Return profile data                          │
│  │                                                    │
│  └─ Present profiles with voting options             │
│       "1. Alex, 25 - [description]"                  │
│       "2. Jamie, 26 - [description]"                 │
│       "Pick: 1, 2, Both, or Neither"                 │
│                                                       │
│  Exit Condition: User votes                          │
└─────────────────────┬────────────────────────────────┘
                      │
                      │ User picks profiles
                      │ update_stage("fetching_profiles")
                      ▼
┌──────────────────────────────────────────────────────┐
│  FETCHING_PROFILES                                    │
│  ────────────────────────────────────────            │
│  • End state                                         │
│  • Conversation complete                             │
│  • (Future: real matching logic)                     │
│                                                       │
│  AI Behavior:                                        │
│  └─ "Awesome choice! Sending likes now."             │
│                                                       │
│  Exit Condition: None (terminal state)               │
└──────────────────────────────────────────────────────┘
```

---

## State Management Flow

### How State Flows Through the System

```
┌─────────────────────────────────────────────────────────┐
│                    SESSION CREATION                      │
│                                                           │
│  User sends first message                                │
│    ↓                                                      │
│  createSession(phoneNumber, profileName)                 │
│    ├─ Generate sessionId: "ABC12"                        │
│    ├─ Create session object:                             │
│    │  {                                                  │
│    │    sessionId: "ABC12",                              │
│    │    stage: "introduction",                           │
│    │    participants: [{phoneNumber, name, role}],       │
│    │    profileSchema: initializeProfileSchema(),        │
│    │    messages: [],                                    │
│    │    actions: []                                      │
│    │  }                                                  │
│    ├─ Redis: SET session:ABC12 {sessionData}            │
│    └─ Redis: SET phone:+1234567890 "ABC12"              │
│                                                           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│               STATE ACCESS (Read)                        │
│                                                           │
│  getSession(phoneNumber)                                 │
│    ├─ Redis: GET phone:+1234567890 → "ABC12"            │
│    └─ Redis: GET session:ABC12 → {sessionData}          │
│         ↓                                                 │
│         Returns: {                                       │
│           sessionId: "ABC12",                            │
│           stage: "profile_creation",                     │
│           participants: [...],                           │
│           profileSchema: {...},                          │
│           messages: [...],                               │
│           actions: [...]                                 │
│         }                                                │
│                                                           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              STATE MODIFICATION                          │
│                                                           │
│  Actions modify session IN PLACE                         │
│    ├─ session.profileSchema.age = 24                    │
│    ├─ session.stage = "profile_confirmation"            │
│    ├─ session.generatedProfile = {...}                  │
│    └─ session.committedProfile = {...}                  │
│                                                           │
│  Messages added to history                               │
│    └─ session.messages.push({role, content, sender})    │
│                                                           │
│  Actions logged                                          │
│    └─ session.actions.push({timestamp, type, result})   │
│                                                           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│              STATE PERSISTENCE (Write)                   │
│                                                           │
│  setSession(sessionId, sessionData)                      │
│    ├─ Serialize: JSON.stringify(sessionData)            │
│    ├─ Redis: SET session:ABC12 {serialized}             │
│    └─ Fallback: sessions.set("ABC12", sessionData)      │
│                                                           │
│  Called after:                                           │
│    ├─ User message saved                                 │
│    ├─ AI message saved                                   │
│    └─ Each action execution                              │
│                                                           │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  STORAGE LAYER                           │
│                                                           │
│  PRIMARY: Redis                                          │
│  ┌──────────────────────────────────────────────────┐  │
│  │  Keys:                                            │  │
│  │  ├─ session:ABC12 → {full session object}        │  │
│  │  ├─ session:XYZ34 → {full session object}        │  │
│  │  ├─ phone:+1234567890 → "ABC12"                  │  │
│  │  └─ phone:+1987654321 → "XYZ34"                  │  │
│  │                                                    │  │
│  │  Benefits:                                        │  │
│  │  ├─ Persists across server restarts              │  │
│  │  ├─ Shared across multiple server instances      │  │
│  │  └─ Fast key-value lookups                       │  │
│  └──────────────────────────────────────────────────┘  │
│                                                           │
│  FALLBACK: In-Memory Maps                                │
│  ┌──────────────────────────────────────────────────┐  │
│  │  const sessions = new Map();                      │  │
│  │  const phoneToSession = new Map();                │  │
│  │                                                    │  │
│  │  Used when:                                       │  │
│  │  ├─ Redis connection fails                        │  │
│  │  ├─ Redis not available                           │  │
│  │  └─ Development without Redis                     │  │
│  │                                                    │  │
│  │  Limitation:                                      │  │
│  │  └─ Lost on server restart                        │  │
│  └──────────────────────────────────────────────────┘  │
│                                                           │
└─────────────────────────────────────────────────────────┘
```

---

## Specific Action Flows

### 1. update_profile_schema Flow

```
┌────────────────────────────────────────────────┐
│  AI decides to update age field                │
│                                                 │
│  {                                             │
│    "type": "update_profile_schema",            │
│    "field": "age",                             │
│    "value": 24                                 │
│  }                                             │
└───────────────────┬────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────┐
│  executeUpdateProfileSchema(action, session)   │
│                                                 │
│  1. Extract parameters                         │
│     field = "age"                              │
│     value = 24                                 │
│                                                 │
│  2. Validate field exists                      │
│     PROFILE_SCHEMA["age"] ✅ exists            │
│                                                 │
│  3. Validate value type & range                │
│     typeof 24 === "number" ✅                  │
│     24 >= 18 && 24 <= 100 ✅                   │
│                                                 │
│  4. Update session state                       │
│     session.profileSchema.age = 24             │
│                                                 │
│  5. Check completion status                    │
│     missingFields = getMissingFields(schema)   │
│     → ["photo", "bio", "interests", ...]       │
│                                                 │
│  6. Log update                                 │
│     logger.info('✅ Field updated', ...)       │
│                                                 │
│  7. Return success                             │
│     {success: true, field: "age"}              │
│                                                 │
└───────────────────┬────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────┐
│  Back in handleMessage()                       │
│                                                 │
│  setSession(sessionId, session)                │
│  ├─ Redis: SET session:ABC12 {updated}        │
│  └─ session.profileSchema.age is now 24       │
│                                                 │
└────────────────────────────────────────────────┘
```

### 2. generate_profile Flow

```
┌────────────────────────────────────────────────┐
│  AI decides to generate profile                │
│                                                 │
│  {                                             │
│    "type": "generate_profile"                  │
│  }                                             │
└───────────────────┬────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────┐
│  executeGenerateProfile(action, session)       │
│                                                 │
│  1. Validate minimum fields                    │
│     isSchemaCompleteForGeneration(schema)      │
│     ├─ Check "name" ✅                         │
│     ├─ Check "age" ✅                          │
│     └─ Check "photo" ✅                        │
│                                                 │
│  2. Create profile object                      │
│     generatedProfile = {                       │
│       id: "profile_ABC12_1730289600000",       │
│       ...session.profileSchema,                │
│       photos: session.data.photos,             │
│       status: "pending_review",                │
│       createdAt: "2025-10-30T12:00:00Z"        │
│     }                                          │
│                                                 │
│  3. Generate profile URL                       │
│     profileUrl =                               │
│       await profileUrlManager.createProfileUrl(│
│         sessionId,                             │
│         generatedProfile,                      │
│         PUBLIC_DOMAIN                          │
│       )                                        │
│     → "https://example.com/p/token123"         │
│                                                 │
│  4. Store profile URL                          │
│     generatedProfile.profileUrl = profileUrl   │
│                                                 │
│  5. Update session                             │
│     session.generatedProfile = generatedProfile│
│     session.stage = "profile_review"           │
│                                                 │
│  6. Return with URL                            │
│     {                                          │
│       success: true,                           │
│       action: "profile_generated",             │
│       profile: generatedProfile,               │
│       profileUrl: profileUrl                   │
│     }                                          │
│                                                 │
└───────────────────┬────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────┐
│  Back in handleMessage()                       │
│                                                 │
│  result.profileUrl captured                    │
│  ├─ Returned to server.js                      │
│  └─ Server sends profile URL to user           │
│                                                 │
│  setSession(sessionId, session)                │
│  ├─ Redis: SET session:ABC12 {updated}        │
│  └─ session.generatedProfile now exists       │
│  └─ session.stage = "profile_review"           │
│                                                 │
└────────────────────────────────────────────────┘
```

### 3. daily_drop Flow

```
┌────────────────────────────────────────────────┐
│  AI decides to do daily drop                   │
│  (MUST be immediately after commit_profile)    │
│                                                 │
│  {                                             │
│    "type": "daily_drop"                        │
│  }                                             │
└───────────────────┬────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────┐
│  executeDailyDrop(action, session)             │
│                                                 │
│  1. Validate stage                             │
│     session.stage === "profile_committed" ✅   │
│                                                 │
│  2. Get all demo profiles                      │
│     allProfiles = demoProfileData.profiles     │
│     → [{name:"Alex", age:25, ...}, ...]        │
│                                                 │
│  3. Select 2 random profiles                   │
│     shuffled = [...allProfiles].sort(random)   │
│     selectedProfiles = shuffled.slice(0, 2)    │
│     → [Alex profile, Jamie profile]            │
│                                                 │
│  4. Generate catchy descriptions               │
│     profilesWithDescriptions = selected.map(p =>│
│       {                                        │
│         name: p.name,                          │
│         age: p.age,                            │
│         profileUrl: getProfileUrl(p),          │
│         description:                           │
│           generateCatchyDescription(p)         │
│       }                                        │
│     )                                          │
│     → [                                        │
│         {name:"Alex", age:25,                  │
│          description:"Loves hiking and dogs",  │
│          url:"..."},                           │
│         {name:"Jamie", age:26,                 │
│          description:"Creative photographer",  │
│          url:"..."}                            │
│       ]                                        │
│                                                 │
│  5. Store in session                           │
│     session.dailyDrops.push({                  │
│       timestamp: "2025-10-30T12:20:00Z",       │
│       profiles: profilesWithDescriptions,      │
│       userChoice: null                         │
│     })                                         │
│                                                 │
│  6. Return profiles to AI                      │
│     {                                          │
│       success: true,                           │
│       action: "daily_drop",                    │
│       profiles: profilesWithDescriptions       │
│     }                                          │
│                                                 │
└───────────────────┬────────────────────────────┘
                    │
                    ▼
┌────────────────────────────────────────────────┐
│  AI receives profiles and presents them        │
│                                                 │
│  "alright, daily drop time.                    │
│   I have 2 profiles for you Sarah:             │
│                                                 │
│   1. Alex, 25 - Loves hiking and has a dog     │
│      https://example.com/p/alex                │
│                                                 │
│   2. Jamie, 26 - Creative photographer         │
│      https://example.com/p/jamie               │
│                                                 │
│   okay, what's the move? pick one:             │
│   1. Alex                                      │
│   2. Jamie                                     │
│   3. Both                                      │
│   4. Neither"                                  │
│                                                 │
└────────────────────────────────────────────────┘
```

---

## Key Insights from Diagrams

### 1. Closed Feedback Loop
```
State → Prompt → AI → Actions → Update State → Prompt (next turn)
```
The AI always sees the **current state** in its prompt, creating a closed feedback loop.

### 2. Session as Single Source of Truth
All state lives in the session object:
- Profile data
- Conversation history
- Action history
- Generated artifacts
- Current stage

### 3. Actions Modify State In-Place
Actions don't return new session objects—they modify the existing session **in place**, then the session is persisted to Redis.

### 4. Stage Progression is Linear
Stages progress forward through a defined flow. Some stages auto-transition (profile_generation), others wait for user approval.

### 5. Multi-Action Sequences
The AI can perform multiple actions in one response, and they execute **sequentially**.

### 6. Validation at Multiple Layers
1. **Prompt**: AI learns what's valid
2. **Action Router**: Checks action type exists
3. **Action Executor**: Validates parameters and state
4. **Schema Validator**: Validates field values

---

## Summary

These diagrams show how:
- **User messages** flow through the system
- **AI prompts** are dynamically constructed from state
- **Actions** modify state in structured ways
- **State** persists across turns
- **Stages** control the conversation flow
- **Multiple components** work together seamlessly

The system is designed for **extensibility**—adding new actions, stages, or fields follows clear patterns shown in these flows.

