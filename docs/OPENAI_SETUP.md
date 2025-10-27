# OpenAI Setup - 5 Minutes

## Step 1: Get Your OpenAI API Key (3 minutes)

1. **Go to OpenAI Platform:** https://platform.openai.com/api-keys
2. **Sign up or log in** (use Google/Microsoft for fastest signup)
3. **Create a new API key:**
   - Click "Create new secret key"
   - Name it "Hackathon" or similar
   - **Copy the key immediately** (you won't see it again!)

**Key format:** `sk-proj-...` (starts with sk-proj or sk-)

## Step 2: Add to .env File (30 seconds)

Edit your `.env` file and add:

```bash
OPENAI_API_KEY=sk-proj-YOUR_ACTUAL_KEY_HERE
```

## Step 3: Restart Server (10 seconds)

```bash
# Stop the current server (Ctrl+C)
npm start
```

You should see in the logs:
```
[INFO] OpenAI client initialized
```

## Step 4: Test the AI (1 minute)

### Test Without WhatsApp (Direct API Test):

```bash
curl -X POST http://localhost:3000/api/test-ai \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+19193087138","message":"Hi! I want to create a dating profile"}'
```

You should get a JSON response with the AI's reply!

### Test With WhatsApp (Requires ngrok webhook):

Just send a WhatsApp message to your Twilio number, and the AI will respond!

## Troubleshooting

**Problem: "OpenAI client not initialized" error**
- Check that OPENAI_API_KEY is in your .env file
- Make sure the key starts with `sk-proj` or `sk-`
- Restart the server

**Problem: "Incorrect API key" error**
- Double-check you copied the entire key
- Make sure there are no extra spaces
- Try creating a new key

**Problem: Rate limit errors**
- Free tier has limits - wait a minute and try again
- Consider adding $5-10 credit to your OpenAI account

**Problem: AI responses are slow**
- Normal! GPT-4o-mini takes 2-5 seconds
- This is fine for a hackathon demo
- Responses are worth the wait!

## Cost Estimate

**GPT-4o-mini pricing:**
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens

**For your hackathon:**
- ~100 messages = ~$0.05
- Testing for 2 days = ~$0.50 total
- Very affordable!

## What's Configured

**AI Matchmaker Features:**
- ✅ Natural conversation flow
- ✅ Remembers conversation history
- ✅ Friendly, supportive personality
- ✅ Short, mobile-friendly responses
- ✅ Emoji support
- ✅ Special commands (start, help, restart)

**System Prompt:**
The AI is configured as a warm, encouraging matchmaker that:
- Helps create authentic dating profiles
- Works with users AND their friends
- Asks thoughtful questions
- Keeps responses SHORT (1-3 sentences)
- Uses natural, conversational language

## Testing the AI Conversation

### Test Command Flow:

```bash
# Test 1: First contact
curl -X POST http://localhost:3000/api/test-ai \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+19193087138","message":"Hi!"}'

# Test 2: Continue conversation
curl -X POST http://localhost:3000/api/test-ai \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+19193087138","message":"Yes, I want to create a profile!"}'

# Test 3: Get conversation state
curl http://localhost:3000/api/conversation/+19193087138

# Test 4: Reset and start over
curl -X POST http://localhost:3000/api/conversation/+19193087138/reset
```

## Next Steps

Once OpenAI is working:

1. **Test the full WhatsApp flow** (requires ngrok webhook)
2. **Have 2-3 team members chat with the AI**
3. **Iterate on the AI personality** (edit ai-matchmaker.js)
4. **Build out the profile creation flow**
5. **Add friend feedback collection**

---

**Ready?** Get your API key and let's make this AI matchmaker come to life! 🚀
