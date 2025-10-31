# Textual Healing Overview

## What Is This System?

An **AI agent system** where actions define capabilities, not just a chatbot with a database. Need a new feature? Write an action as code. The architecture handles the rest.

This is an **LLM powered conversational agent** that helps people **create dating profiles and get daily recs drops** through Whatsapp/SMS group chats. The system:
- Asks questions naturally (one at a time)
- Collects profile information
- Accepts input from friends (for fun/honest feedback)
- Generates a shareable profile card
- Presents potential matches as daily drops

---

## What Makes This Different

This isn't a chatbot that generates text. It's an **AI agent system** that orchestrates workflows, modifies application state, and generates artifacts (eg, dating profiles) - all through natural conversation.

**Traditional chatbot**: User asks → AI responds with text → End

**Our system**: User asks → AI analyzes state → AI performs structured actions → DB/State updates → AI responds

The difference: **Actions**. The AI doesn't just talk about doing things, it actually does them. **Anything you can do in code, you can make available to the LLM as an action. Actions are 2 line additions to the prompt**

Because LLM function calling runs commands that store changes in dbs, identifies missing fields and changes and maintains state of the user's flow reliably, **the whole experience is a lot more robust than relying on just prompt engineering**. 

---

## The Core Idea: Actions as Code

Every action the AI can perform is a discrete, validated function. **Adding a new capability (eg. create OkCupid profile) means adding a new action (2 line addition to the prompt)**. No fine tuning, no bloated prompts, just code.

### Current Actions (capabilities)
- `send_text_message` - Send whatsapp/text message
- `update_profile_schema` - Store structured data
- `generate_profile` - Create shareable profile card
- `commit_profile` - Finalize and persist
- `get_recommendations` - Call recommendation engine
- `daily_drop` - Present recommendations
- `send_template_message` - Send interactive UI elements

### What This Enables

**Because actions are just functions**, we can add new functionalities easily:
- `create_multi_accounts` - Create accounts in multiple apps
- `send_email` - Trigger email workflows
- `run_face_id` - Call third party API
- `upgrade_premium_sub` - Create a subscription for user, sends a link to subscribe

**Anything you can do in code, you can make available to the LLM as an action.**

The LLM learns what actions exist through the prompt. Adding a new action to the prompt automatically teaches the LLM when and how to use it.

---

## Three Technical Pillars

**Why this matters**:
1. **Dynamic Prompting (Context Efficiency)**: Only relevant state is injected
2.  **Structured Actions (Reliability)**: AI sees its own actions reflected in next turn
3.  **Persistent State Management (Consistency)**: AI knows exactly what's missing and what's available

### 1. Dynamic Prompting (Context Efficiency)

The AI doesn't receive a static prompt. It receives a **dynamically generated prompt** that includes the current state.

**Every turn, the prompt contains**:
- Current stage (where are we in the workflow?)
- Missing fields (what do we still need?)
- Uploaded media (what has the user provided?)
- Available actions (what can the AI do?)
- Conversation history (what's been said?)

**Why this matters**:
- **No context bloat**: Only relevant state is injected
- **Self-correcting**: AI sees its own actions reflected in next turn
- **Precise**: AI knows exactly what's missing and what's available
- **Scalable**: Works for conversations of any length

**Example**: After AI collects a user's age, the prompt on the next turn shows `age: 24` in the state, and "age" disappears from the "missing fields" list. The AI automatically moves to the next field.

### 2. Structured Actions (Reliability)

The AI responds in **strict JSON format**:

```json
{
  "message": "Got it! What school did you go to?",
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

**Why this matters**:
- **Type safety**: Actions are validated before execution
- **Predictable**: Every action has a defined contract
- **Debuggable**: Full audit trail of what the AI did
- **Recoverable**: Failed actions don't break the conversation

**Validation happens at four layers**:
1. **Prompt**: AI learns valid actions
2. **Parser**: JSON structure validated
3. **Router**: Action type must exist
4. **Executor**: Parameters validated before execution

An invalid action fails gracefully. The error is logged, state remains unchanged, conversation continues.

### 3. Persistent State Management (Consistency)

All conversation state lives in a **session object** stored in Redis (can be any DB):

```javascript
{
  sessionId: "ABC12",
  stage: "profile_creation",
  participants: [
    { phoneNumber: "+1234567890", name: "Sarah", role: "creator" }
  ],
  profileSchema: {
    name: "Sarah",
    age: 24,
    photo: "https://...",
    // ... all collected data
  },
  messages: [/* conversation history */],
  actions: [/* action audit trail */],
  generatedProfile: {/* generated artifacts */}
}
```

**Why this matters**:
- **Survives restarts**: State persists in Redis
- **Multi-server**: Can scale horizontally (shared state)
- **Auditable**: Full history of every action taken
- **Recoverable**: Can replay conversation from any point

**State updates are atomic**: Action executes → validation passes → state updates → persists to Redis. If any step fails, state remains unchanged.

---

## How It Works: A Real Example

**User**: "I'm 24 and I love hiking"

### Behind the Scenes

**1. Load State**
```javascript
session = await getSessionFromRedis("ABC12");
// Current state: {stage: "profile_creation", profileSchema: {name: "Sarah", age: null, ...}}
```

**2. Build Dynamic Prompt**
```
You're an AI matchmaker.

## CURRENT STATE
Stage: profile_creation
Missing Fields:
- age          ← AI sees this
- interests    ← AI sees this
- photo

## ACTIONS AVAILABLE
- update_profile_schema: Store a field value
- update_stage: Transition to next stage
...
```

**3. AI Response (JSON)**
```json
{
  "message": "Noted! Added hiking as an interest. Want to add one more interest?",
  "actions": [
    { "type": "update_profile_schema", "field": "age", "value": 24 },
    { "type": "update_profile_schema", "field": "interests", "value": ["Hiking"] }
  ]
}
```

**4. Execute Actions**
```javascript
// Action 1: Update age
session.profileSchema.age = 24;
await saveToRedis(session);

// Action 2: Update interests
session.profileSchema.interests = ["Hiking"];
await saveToRedis(session);
```

**5. Next Turn**
```
## CURRENT STATE
Stage: profile_creation
Missing Fields:
- photo        ← age and interests now removed
- bio

profileSchema.age: 24          ← AI sees what it stored
profileSchema.interests: ["Hiking"]  ← AI sees what it stored
```

The AI automatically knows what it's already collected and what's still missing. **No manual tracking. No prompt engineering to "remember" things. The state is the memory.**

---

## Extensibility in Practice

### Scenario 1: Add Profile Sync across 1MG (Tinder, Hinge, The League, Archer)

**What you do**:
1. Write action executor:
   ```javascript
   async function executeSyncProfile(action, session) {
     const { platforms } = action;  // ["tinder", "hinge"]
     const results = await Promise.all(
       platforms.map(platform => 
         platformAPIs[platform].createProfile(session.committedProfile)
       )
     );
     session.syncedPlatforms = platforms;
     return { success: true, profiles: results };
   }
   ```

2. Add 2 lines to prompt:
   ```
   - sync_profile: {"type": "sync_profile", "platforms": ["tinder", "archer"]}
     Cross-post profile to other dating apps.
   ```

**Result**: The AI can now sync profiles across platforms. Users can say "also post this to Tinder and OkCupid", and the AI will:
- Format profile for each platform
- Call their respective APIs
- Handle auth/credentials
- Confirm success


### Scenario 2: Add "Upgrade to Premium" Feature

**What you do**:
1. Write action executor:
   ```javascript
   async function executePremiumSubscriptionFlow(action, session) {
     const { plan } = action;
     const payment = await stripe.charges.create({
       amount: PLAN_PRICES[plan],
       customer: session.stripeCustomerId
     });
     session.subscription = { plan, active: true };
     return { success: true, transactionId: payment.id };
   }
   ```

2. Add to prompt:
   ```
   - charge_subscription: {"type": "charge_subscription", "plan": "premium"}
     Execute premium subscription plan flow.
   ```

**Result**: The AI can now handle subscriptions. When users say "I want premium", the AI can:
- Explain premium features
- Call `charge_subscription` action
- Process payment via Stripe
- Update user's subscription status


---

## Business Implications

### Speed of Iteration

**Traditional approach**: Change behavior → Prompt/Fine tune/Test model → Wait hours/days → Test → Repeat

**Our approach**: Add action function → Update prompt → Deploy → Test immediately

Example: Adding "daily_drop" feature took **15 minutes** (write function, update prompt, test). No model retraining required.

### Error Recovery

**Problem**: AI makes mistake → State corrupted → Conversation breaks

**Our solution**: 
- Every action is validated before execution
- Failed actions don't modify state
- Conversation continues with unchanged state
- Full audit trail for debugging

**Example**: AI tries to set `age: "twenty-four"` (string instead of number) → Validation fails → Error logged → State unchanged → AI tries again with `age: 24` → Success

### Cost Efficiency

**Problem**: Long conversations → Large context windows → High LLM costs

**Our solution**: Dynamic prompting injects only relevant state. A 50-turn conversation doesn't need 50 turns of history in the prompt. The AI sees:
- Current state (compact: `{age: 24, interests: ["Hiking"]}`)
- Last few messages (recent context)
- Available actions (static)

**Result**: Context stays manageable regardless of conversation length.

### Scalability

**Horizontal scaling**: DB backed state means multiple servers can handle the same session

**Workflow orchestration**: Actions can trigger background jobs, call external APIs, generate artifacts - all without blocking the conversation

**Multi-turn workflows**: AI can execute multi-step workflows (collect data → validate → generate artifact → get approval → finalize → trigger downstream systems) reliably

---

## Technical Risk Mitigation

### Risk: "AI does something wrong"
**Mitigation**: Four layer validation (prompt, parser, router, executor). Failed actions don't modify state.

### Risk: "Context grows too large"
**Mitigation**: Dynamic prompting injects only relevant state. Historical messages summarized or truncated.

### Risk: "State gets corrupted"
**Mitigation**: Atomic updates (validate → execute → persist). Redis transactions ensure consistency.

### Risk: "Can't scale"
**Mitigation**: DB backed state enables horizontal scaling. Multiple servers share session data.

### Risk: "LLM Debugging is hard"
**Mitigation**: Full audit trail of every action. Comprehensive logging. Can replay any conversation.

### Risk: "AI costs explode"
**Mitigation**: Dynamic prompting keeps context small. Can switch LLM providers (OpenAI, Groq, Anthropic) without code changes.

---

## What This Enables


- **Multi platform sync**: "Post this profile to Tinder, OkCupid, and Hinge"
- **Background checks**: "Verify this person's identity"
- **Photo enhancement**: "Make my photos look better"
- **Payment processing**: "Upgrade me to premium"
- **Calendar integration**: "Schedule our first date for Friday at 7pm"

**The architecture supports all of this without fundamental changes.** Each new capability is just a new action.


## Key Takeaways

1. **Actions are the extensibility mechanism**: Any capability = one action function
2. **Fast iteration**: New features deploy in minutes (add action + update prompt)
3. **Dynamic prompting solves context bloat**: State is compact, injected per turn
4. **Validation prevents errors**: Four layer validation before state changes
5. **DBs enables scaling**: Horizontal scaling with shared state
6. **Audit trails enable debugging**: Every action logged with timestamp
7. **Scalable**: Architecture supports 1 user or 1M users

---

## Questions?

**Q: What happens if the AI tries to do something it shouldn't?**  
A: Every action is validated. Invalid actions fail gracefully without modifying state. The AI sees the failure and tries again.

**Q: How do we add a new capability?**  
A: Write a 20 line action function, add 2 lines to the prompt. Deploy. Done. No model retraining.

**Q: Can we switch LLM providers?**  
A: Yes. The system works with OpenAI, Anthropic, or any JSON-capable LLM. Provider is configurable.

**Q: How much does context window cost?**  
A: Minimal. Dynamic prompting keeps context small (~2-3K tokens) regardless of conversation length.

**Q: What's the most complex thing this can do?**  
A: Anything you can write in code. Multiday workflows, external API calls, payment processing, face id routing etc.

---

**Bottom Line**: This isn't a chatbot with a database. It's a **AI agent platform** where actions define capabilities. Want a new feature? Write an action. The architecture handles the rest.
