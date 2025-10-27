# Twilio Conversations API - Deep Dive & Refactor Plan

## Executive Summary

**Current State**: Using simple WhatsApp messaging (1-to-1) with manual session tracking via Redis

**Proposed State**: Use Twilio Conversations API for native group chat functionality

**Key Benefit**: Real group chats where all participants see each other's messages naturally, like a group text

---

## What is Twilio Conversations API?

### Core Concept
Conversations API provides **omni-channel group messaging** that abstracts away channel-specific complexities. One Conversation can have participants from:
- WhatsApp
- SMS
- Chat (web/mobile SDK)
- Other channels

### How It Works
```
Conversation (container)
  ├─ Participant 1 (WhatsApp: +15551234567)
  ├─ Participant 2 (WhatsApp: +15559876543)
  ├─ Participant 3 (WhatsApp: +15551112222)
  └─ Messages (visible to all participants)
```

When ANY participant sends a message, **Twilio automatically broadcasts it to ALL other participants**.

---

## Current Implementation vs. Conversations API

### Current Approach (Manual Broadcast)
```javascript
// We manually track sessions in Redis
session = {
  sessionId: "ABC123",
  participants: ["+1555...", "+1555...", "+1555..."],
  messages: [...]
}

// We manually broadcast AI responses
otherParticipants.forEach(async (phoneNumber) => {
  await twilioClient.messages.create({
    from: 'whatsapp:+14155238886',
    to: `whatsapp:${phoneNumber}`,
    body: aiResponse
  });
});
```

**Problems:**
1. ❌ Not a real group chat - each participant sees separate 1-to-1 conversation with bot
2. ❌ Participants can't see each other's messages
3. ❌ Bot appears as author of all messages (no attribution)
4. ❌ Manual tracking of who's in the conversation
5. ❌ Manual broadcast logic

### With Conversations API
```javascript
// Twilio creates a Conversation
conversation = await client.conversations.v1.conversations.create({
  friendlyName: 'Dating Profile - Session ABC123'
});

// Add participants
await conversation.participants().create({
  'messagingBinding.address': 'whatsapp:+15551234567',
  'messagingBinding.proxyAddress': 'whatsapp:+14155238886'
});

// Send message - Twilio auto-broadcasts to all
await conversation.messages().create({
  author: '+15551234567',  // Shows who sent it
  body: 'This is my message'
});
```

**Benefits:**
1. ✅ **Real group chat** - everyone sees all messages
2. ✅ **Author attribution** - messages show who sent them
3. ✅ **Native group experience** - feels like a WhatsApp group
4. ✅ **Automatic broadcast** - Twilio handles routing
5. ✅ **Twilio tracks participants** - built-in
6. ✅ **Webhooks** - automatic notifications for new messages

---

## Technical Deep Dive

### 1. Creating a Conversation
```javascript
const conversation = await twilioClient.conversations.v1.conversations.create({
  friendlyName: 'Dating Profile Creator - Session ABC123',
  uniqueName: 'session-ABC123', // For lookups
  attributes: JSON.stringify({
    sessionId: 'ABC123',
    purpose: 'dating-profile-creation',
    stage: 'introduction'
  })
});
```

**Returns:** `conversationSid` (e.g., `CH...`)

### 2. Adding WhatsApp Participants
```javascript
await twilioClient.conversations.v1
  .conversations(conversationSid)
  .participants()
  .create({
    'messagingBinding.address': 'whatsapp:+15551234567',
    'messagingBinding.proxyAddress': 'whatsapp:+14155238886'
  });
```

**Key Parameters:**
- `messagingBinding.address` - Participant's WhatsApp number (with `whatsapp:` prefix)
- `messagingBinding.proxyAddress` - Your Twilio WhatsApp number (with `whatsapp:` prefix)

**Important:** Participants must have messaged your WhatsApp Business number first (24-hour session window)

### 3. Sending Messages
```javascript
// From user perspective (through webhook)
await twilioClient.conversations.v1
  .conversations(conversationSid)
  .messages()
  .create({
    author: '+15551234567', // Who sent it
    body: 'Here is my message'
  });

// From bot/system
await twilioClient.conversations.v1
  .conversations(conversationSid)
  .messages()
  .create({
    author: 'system', // Or 'AI Matchmaker'
    body: 'AI response here'
  });
```

**Twilio automatically:**
- Broadcasts to all participants
- Preserves author information
- Handles delivery/retry logic

### 4. Webhook Configuration

**Option A: Service-Level (recommended)**
```javascript
// Set once for all conversations
await twilioClient.conversations.v1
  .configuration()
  .webhooks()
  .update({
    filters: ['onMessageAdded', 'onParticipantAdded'],
    url: 'https://your-ngrok-url.ngrok.io/webhooks/conversations',
    method: 'POST'
  });
```

**Option B: Conversation-Scoped**
```javascript
// Per conversation
await twilioClient.conversations.v1
  .conversations(conversationSid)
  .webhooks()
  .create({
    'configuration.filters': ['onMessageAdded'],
    'configuration.url': 'https://your-url.com/webhook',
    'configuration.method': 'POST',
    target: 'webhook'
  });
```

### 5. Webhook Payload
```json
{
  "EventType": "onMessageAdded",
  "ConversationSid": "CHxxxxxx",
  "MessageSid": "IMxxxxxx",
  "Body": "User's message text",
  "Author": "+15551234567",
  "ParticipantSid": "MBxxxxxx",
  "DateCreated": "2025-10-27T00:00:00Z",
  "Attributes": "{\"key\":\"value\"}"
}
```

---

## Architecture Comparison

### Current Architecture
```
User 1 → WhatsApp → Twilio → Our Webhook → AI → Manual Broadcast → User 1, User 2, User 3
                                                                        ↓      ↓      ↓
                                                                   (separate) (separate) (separate)
```

### With Conversations API
```
User 1 ────┐
           │
User 2 ────┼──→ Conversation (CHxxxx) ──→ Webhook ──→ AI ──→ Conversation.messages.create()
           │                                                         │
User 3 ────┘                                                         │
                                                                     ↓
                                                        Twilio auto-broadcasts to all
```

---

## Migration Strategy

### What Changes

**1. Session Management**
```javascript
// OLD: Custom session tracking
session = {
  sessionId: "ABC123",
  participants: [...],
  messages: [...]
}

// NEW: Map sessionId to conversationSid
session = {
  sessionId: "ABC123",
  conversationSid: "CHxxxxxx",  // NEW
  participants: [...],           // Keep for reference
  messages: [...]                // Twilio has these too
}
```

**2. Message Flow**
```javascript
// OLD: Receive on /webhooks/sms
app.post('/webhooks/sms', (req, res) => {
  const from = req.body.From; // whatsapp:+1555...
  const body = req.body.Body;
  // ... process & broadcast
});

// NEW: Receive on /webhooks/conversations
app.post('/webhooks/conversations', (req, res) => {
  const conversationSid = req.body.ConversationSid;
  const author = req.body.Author; // Phone number
  const body = req.body.Body;
  // ... process & let Twilio broadcast
});
```

**3. Sending Messages**
```javascript
// OLD: Manual broadcast
participants.forEach(p => {
  twilioClient.messages.create({
    from: 'whatsapp:+14155238886',
    to: `whatsapp:${p}`,
    body: aiResponse
  });
});

// NEW: Single message to conversation
await twilioClient.conversations.v1
  .conversations(conversationSid)
  .messages()
  .create({
    author: 'AI Matchmaker',
    body: aiResponse
  });
```

### What Stays the Same

- ✅ Redis for session persistence
- ✅ AI action system
- ✅ Stage management
- ✅ Profile data collection
- ✅ Admin dashboard
- ✅ "join SESSIONID" command (now creates Conversation + adds participant)

---

## Implementation Plan

### Phase 1: Setup & Configuration (30 mins)
1. ✅ Research Conversations API (DONE)
2. Configure Conversations webhook in Twilio Console
3. Test webhook endpoint receives events

### Phase 2: Core Conversation Manager (1 hour)
1. Create `conversation-manager.js`:
   - `createConversation(sessionId)` → returns conversationSid
   - `addParticipant(conversationSid, phoneNumber)`
   - `sendMessage(conversationSid, author, body)`
   - `getConversationMessages(conversationSid)`

2. Update session structure:
   - Add `conversationSid` field
   - Keep existing fields for compatibility

### Phase 3: Webhook Refactor (1 hour)
1. Create new endpoint: `POST /webhooks/conversations`
2. Parse Conversations webhook payload
3. Route to AI matchmaker
4. Send AI response back to Conversation

### Phase 4: Join Flow Refactor (30 mins)
1. When user types "join ABC123":
   - Get session's conversationSid
   - Add user as participant to Conversation
   - Twilio handles the rest

### Phase 5: Testing (30 mins)
1. Test conversation creation
2. Test multiple participants joining
3. Test message broadcast
4. Test AI integration

### Phase 6: Migration (30 mins)
1. Keep old `/webhooks/sms` as fallback
2. Route to Conversations for new sessions
3. Gradually migrate existing sessions

---

## Code Structure (Proposed)

```
/hackathon
  ├── conversation-manager.js  (NEW)
  │   ├── createConversation()
  │   ├── addParticipant()
  │   ├── removeParticipant()
  │   ├── sendMessage()
  │   └── listParticipants()
  │
  ├── webhooks/
  │   ├── conversations.js     (NEW - Conversations webhook)
  │   └── sms.js              (KEEP - Legacy/fallback)
  │
  ├── ai-matchmaker.js         (MINIMAL CHANGES)
  ├── actions.js               (NO CHANGES)
  ├── server.js                (ADD new route)
  └── ...existing files
```

---

## Key Considerations

### 1. **24-Hour Session Window**
- WhatsApp sessions expire after 24 hours
- Users must re-initiate to continue
- Consider: Send reminder before expiry?

### 2. **Participant Limits**
- WhatsApp groups via Conversations: **50 participants max**
- Perfect for our use case (1 primary + friends)

### 3. **Message Attribution**
- `author` field shows who sent message
- Can be phone number OR custom identity (e.g., "AI Matchmaker")
- Participants will see: "from +15551234567" or "from AI Matchmaker"

### 4. **Webhook Ordering**
- Messages may arrive out of order under load
- Use `DateCreated` or `MessageSid` to sort if needed

### 5. **Conversation Lifecycle**
```
Created → Active → [Inactive after 24h] → [Can reactivate] → [Eventually archived]
```

### 6. **Pricing**
- Conversations API has separate pricing from SMS/WhatsApp
- Check Twilio pricing for your use case
- Likely more cost-effective than manual broadcast

### 7. **Migration Path**
- Don't break existing sessions
- Use feature flag: `USE_CONVERSATIONS_API=true/false`
- Dual-mode during transition

---

## Advantages Over Current Approach

| Feature | Current (Manual) | Conversations API |
|---------|-----------------|-------------------|
| Real group chat | ❌ No | ✅ Yes |
| Message attribution | ❌ No | ✅ Yes |
| Automatic broadcast | ❌ Manual | ✅ Automatic |
| Participant management | ❌ Manual Redis | ✅ Twilio manages |
| Message history | ❌ Manual | ✅ Built-in |
| Webhooks | ⚠️ Basic | ✅ Rich events |
| Scalability | ⚠️ Manual work | ✅ Twilio handles |
| Cost | Higher (per message) | Lower (per conversation) |

---

## Risks & Mitigation

### Risk 1: Learning Curve
**Mitigation**: Incremental adoption, keep old system running

### Risk 2: Webhook Configuration
**Mitigation**: Test thoroughly with ngrok before production

### Risk 3: Migration Complexity
**Mitigation**: Feature flag + gradual rollout

### Risk 4: Different Mental Model
**Mitigation**: Clear documentation + team alignment

---

## Next Steps (Recommended Order)

1. **Immediate**: Set up Conversations webhook endpoint
2. **Next**: Create `conversation-manager.js` with basic CRUD
3. **Then**: Refactor session creation to use Conversations
4. **Then**: Update AI response to use Conversations
5. **Finally**: Test end-to-end with real WhatsApp numbers

---

## Questions to Answer Before Starting

1. ✅ Do we have WhatsApp Business API access? (Yes - already using it)
2. ❓ What's our Twilio Conversations Service SID?
3. ❓ Do we want service-level or conversation-scoped webhooks?
4. ❓ How do we handle conversation expiry (24h limit)?
5. ❓ Do we archive old conversations or keep them?
6. ❓ What author name should AI use? ("AI Matchmaker" vs "System" vs phone number)

---

## Conclusion

**Conversations API is the right choice** for our use case because:

1. ✅ Provides **real group chat experience** (main goal)
2. ✅ Simplifies our code (removes manual broadcast logic)
3. ✅ Better user experience (participants see each other)
4. ✅ More scalable (Twilio handles complexity)
5. ✅ Easier to maintain (less custom code)

**Recommendation**: Proceed with refactor in phases, starting with new sessions only.

---

## Resources

- [Twilio Conversations API Docs](https://www.twilio.com/docs/conversations/api)
- [WhatsApp Group Messaging Guide](https://github.com/TwilioDevEd/whatsapp-group-messaging)
- [Conversation Webhooks](https://www.twilio.com/docs/conversations/conversations-webhooks)
- [Group Texting in Conversations](https://www.twilio.com/docs/conversations/group-texting)
