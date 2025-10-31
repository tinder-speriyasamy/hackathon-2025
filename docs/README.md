# Hackathon: SMS Group Chat + Matchmaker

A dating app onboarding experience using SMS group chats with friends + AI matchmaker.

## 📚 Documentation

### **AI System Documentation** (NEW!)

**For Leadership (CTOs, VPs of Product):**
- **[Executive Summary](./AI_EXECUTIVE_SUMMARY.md)** - What makes this an AI agent, not a chatbot 🎯 **START HERE**

**For Technical Teams:**
- **[System Overview](./AI_SYSTEM_OVERVIEW.md)** - 5-minute technical introduction
- **[AI Architecture](./AI_ARCHITECTURE.md)** - Complete guide to prompts, actions, and state management
- **[Quick Reference](./AI_QUICK_REFERENCE.md)** - Fast lookup for common tasks and patterns
- **[Flow Diagrams](./AI_FLOW_DIAGRAMS.md)** - Visual representations of system flows

### Integration & Setup
- **[WhatsApp Setup](./WHATSAPP_SETUP.md)** - How to set up WhatsApp messaging
- **[Deployment](../DEPLOYMENT.md)** - Deployment instructions
- **[Quick Deploy](../QUICK_DEPLOY.md)** - Fast deployment guide

### Status & Testing
- **[Status](./STATUS.md)** - Current implementation status
- **[Team Testing Guide](../TEAM_TESTING_GUIDE.md)** - How to test the system

---

## Quick Start

```bash
# Install dependencies
npm install

# Start server
npm start

# Server runs on http://localhost:3000
```

## Project Structure

```
hackathon/
├── server.js           # Express server with Twilio webhooks
├── logger.js           # Debug logging utility (color-coded)
├── test-api.sh         # Quick testing script
├── .env                # Environment variables (not in git)
└── .env.example        # Template for environment variables
```

## Fast Iteration Workflow

### 1. Testing Connectivity (ALWAYS START HERE)

```bash
# Check if server is running
curl http://localhost:3000/

# Check Twilio configuration
curl http://localhost:3000/api/check-twilio

# Or use the test script
./test-api.sh health
./test-api.sh twilio
```

### 2. Testing SMS (Single Messages)

```bash
# Send a test SMS
./test-api.sh send +15551234567 "Test message"

# Or with curl
curl -X POST http://localhost:3000/api/send-sms \
  -H "Content-Type: application/json" \
  -d '{"to":"+15551234567","body":"Test message"}'
```

**Important:** Use your own phone numbers for testing!

### 3. Testing Group Chats (Twilio Conversations)

```bash
# List all conversations
./test-api.sh conversations

# Create a group conversation
./test-api.sh create-conv "Test Group" +15551111111 +15552222222

# Send message to conversation (use the SID from create response)
./test-api.sh send-conv CH1234567890abcdef "Hello group!"
```

### 4. Debugging Tips

**Check server logs:** The server outputs color-coded logs:
- 🟢 GREEN = INFO (successful operations)
- 🔵 CYAN = DEBUG (detailed request/response data)
- 🟡 YELLOW = WARN (potential issues)
- 🔴 RED = ERROR (failures)

**Common debugging patterns:**

```bash
# Watch server logs in real-time
tail -f <(npm start)

# Test SMS delivery
./test-api.sh send <your_phone> "Test $(date)"

# Check if message was received
# Look for webhook POST to /webhooks/sms in server logs
```

## API Endpoints

### Health & Configuration

- `GET /` - Health check
- `GET /api/check-twilio` - Verify Twilio configuration

### SMS Messaging

- `POST /api/send-sms` - Send SMS
  ```json
  {"to": "+15551234567", "body": "Message text"}
  ```
- `POST /webhooks/sms` - Twilio webhook for incoming SMS

### Conversations (Group Chat)

- `GET /api/conversations` - List all conversations
- `POST /api/conversations/create` - Create new group chat
  ```json
  {
    "friendlyName": "Group Name",
    "participants": ["+15551111111", "+15552222222"]
  }
  ```
- `POST /api/conversations/:sid/message` - Send message to group
  ```json
  {"body": "Message text"}
  ```
- `POST /webhooks/conversation` - Twilio webhook for conversation events

## Configuration

### Environment Variables (.env)

```bash
TWILIO_ACCOUNT_SID=ACxxxx...
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+18883151986
PORT=3000
```

### Your Twilio Phone Number

**Number:** `+18883151986`

**Capabilities:**
- ✅ SMS
- ✅ MMS
- ✅ Voice

## Setting Up Webhooks (For Development)

When testing with real SMS, Twilio needs a public URL. Options:

### Option 1: ngrok (Recommended for testing)

```bash
# Install ngrok
brew install ngrok  # or download from ngrok.com

# Start ngrok tunnel
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Configure in Twilio Console:
# Phone Numbers → Your Number → Messaging
# "A message comes in" → Webhook → https://abc123.ngrok.io/webhooks/sms
```

### Option 2: Twilio CLI (For quick tests)

```bash
# Use Twilio CLI to receive webhooks locally
twilio phone-numbers:update +18883151986 \
  --sms-url="http://localhost:3000/webhooks/sms"
```

## Testing Workflow (During Development)

### Phase 1: Basic SMS (DONE ✅)
1. Start server: `npm start`
2. Send test SMS: `./test-api.sh send <your_phone> "Test"`
3. Check logs for delivery status

### Phase 2: Group Conversations (CURRENT)
1. Create conversation: `./test-api.sh create-conv "Test" <phone1> <phone2>`
2. Send message: `./test-api.sh send-conv <sid> "Hello!"`
3. Verify all participants receive message
4. Test back-and-forth conversation flow

### Phase 3: AI Integration (NEXT)
1. Add OpenAI API integration
2. Mock the AI matchmaker persona
3. Test conversational flows
4. Iterate on prompts quickly

## Troubleshooting

### Server won't start
- Check if port 3000 is in use: `lsof -i :3000`
- Check .env file exists and has correct values

### SMS not sending
- Run `./test-api.sh twilio` to verify configuration
- Check phone number format: must include country code (e.g., +1)
- Check Twilio account balance

### Conversations not working
- Verify phone numbers are verified in Twilio Console
- Check conversation SID is correct
- View logs for detailed error messages

### Webhook not receiving messages
- Set up ngrok tunnel (see above)
- Configure webhook URL in Twilio Console
- Check server logs for incoming requests

## Debug Logging

The `logger.js` utility provides structured logging:

```javascript
const logger = require('./logger');

logger.info('User joined', { phone: '+15551234567' });
logger.debug('API request', { endpoint: '/api/send-sms', body: {...} });
logger.warn('Rate limit approaching', { remaining: 5 });
logger.error('Failed to send', error);
```

All logs include:
- Timestamp
- Log level
- Color coding
- Structured data (pretty-printed JSON)

## Next Steps

1. ✅ Set up Express + Twilio
2. ✅ Test basic connectivity
3. 🔄 Test group conversations with your phone numbers
4. ⏳ Integrate OpenAI for AI matchmaker
5. ⏳ Build profile creation flow
6. ⏳ Build match recommendation system
7. ⏳ Add friend voting mechanism

## Useful Commands

```bash
# Start server
npm start

# Test health
./test-api.sh health

# Send test SMS
./test-api.sh send <phone> "Message"

# Create group chat
./test-api.sh create-conv "Name" <phone1> <phone2>

# List conversations
./test-api.sh conversations

# Check Twilio phone numbers
twilio phone-numbers:list

# View Twilio account
twilio profiles:list
```

## Tips for Hackathon Speed

1. **Use the test script** - `./test-api.sh` is faster than writing curl commands
2. **Watch the logs** - Color-coded output makes debugging instant
3. **Mock data early** - Don't wait for real integrations to test flows
4. **Test with your phones** - Real SMS = immediate feedback
5. **Debug in layers** - Server logs → Twilio logs → Phone receives message

---

**Ready to test group conversations! Provide 2-3 phone numbers and we'll create a test group chat.**
