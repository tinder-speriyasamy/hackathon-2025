# Web Chat Interface - Testing Guide

## 🎉 Your Web Testing Interface is Ready!

Open http://localhost:3000 in your browser to access the chat interface.

## What You Built

A full-featured group chat testing interface that:
- ✅ Shows multiple participants (You + Friends + AI Matchmaker)
- ✅ Connects to same conversation state as WhatsApp
- ✅ Handles photo uploads just like WhatsApp
- ✅ Persists conversations across page refreshes
- ✅ Shows timestamps and metadata for testing
- ✅ Can switch between different conversations

## How to Use

### 1. Open the Interface

```bash
# Open in your browser:
http://localhost:3000
```

### 2. Connect to a Conversation

- Enter a phone number (e.g., `+19193087138`) in the header
- Click "Connect"
- This syncs with the same conversation state as WhatsApp!

### 3. Send Messages

- Type in the message box at the bottom
- Press Enter or click "Send"
- The AI Matchmaker will respond automatically

### 4. Upload Photos

- Click the "📷 Photo" button
- Select an image
- See a preview
- Send with your message
- Photos are handled exactly like WhatsApp (downloaded and stored locally)

### 5. View Conversation History

- Conversations persist in browser localStorage
- Refresh the page - your chats are still there!
- Sidebar shows all conversations
- Click any conversation to switch

## Features

### Group Chat View
- See all participants: You, Friend 1, Friend 2, AI Matchmaker
- Different colored message bubbles for each participant
- Timestamps on every message
- Metadata showing server info

### Photo Handling
Photos work exactly like WhatsApp:
- **From Web:** Upload → Saved to `/uploads` → URL stored
- **From WhatsApp:** Twilio sends MediaUrl → Downloaded → Saved to `/uploads`
- **In AI:** Photos stored in conversation state with message history

### Conversation Sync
The same conversation state is shared between:
- Web interface
- WhatsApp messages
- API testing tools

Enter `+19193087138` in both web and WhatsApp - they share the same conversation!

## Testing Workflow

### Test 1: Basic Conversation
1. Open http://localhost:3000
2. Enter phone number: `+19193087138`
3. Click "Connect"
4. Send: "Hi! I want to create a dating profile"
5. AI responds with welcome message
6. Continue the conversation

### Test 2: Photo Upload
1. Send a message: "Here's a photo of me hiking"
2. Click "📷 Photo"
3. Select an image
4. Click "Send"
5. Photo appears in your message
6. AI responds acknowledging the photo

### Test 3: Switch Conversations
1. Change phone number to: `+19199176791`
2. Click "Connect"
3. Start a different conversation
4. Switch back to `+19193087138` - original conversation is preserved

### Test 4: WhatsApp Sync
1. In web: Send a message as `+19193087138`
2. In WhatsApp: Send a message from +19193087138 to your Twilio number
3. Check web interface - should see the AI's response
4. (Requires ngrok webhook configured)

## Technical Details

### Photo Flow

**Web Upload:**
```
User selects photo → POST /api/upload-photo → Saved to /uploads/filename.jpg → Returns URL
User sends message → POST /api/send-message → AI receives message + photo URL
```

**WhatsApp Upload:**
```
User sends photo → Twilio webhook /webhooks/sms → NumMedia=1, MediaUrl0=twilio_url
Server downloads from Twilio → Saves to /uploads/filename.jpg
AI receives message + local photo URL
```

**Result:** Same format, same storage, same conversation state!

### Conversation State

Stored in two places:
1. **Server (in-memory):** Current conversation for AI responses
2. **Browser (localStorage):** Chat history for UI persistence

Phone number is the key - same number = same conversation across web & WhatsApp

### API Endpoints Used

- `POST /api/send-message` - Send message from web
- `POST /api/upload-photo` - Upload photo from web
- `GET /api/conversation/:phone` - Get conversation state
- `POST /webhooks/sms` - Receive messages from WhatsApp

## Debugging

### Check Server Logs
Server logs show everything happening:
- Message received
- Photo uploaded
- AI response generated
- Conversation state updated

### Check Browser Console
Open DevTools (F12) → Console
- See all API requests
- See localStorage data
- Debug any errors

### Check Uploads Folder
```bash
ls -la /Users/sivaperiyasamy/Repos/hackathon/uploads/
```
All photos saved here (from both web and WhatsApp)

## Tips

### Fast Iteration
- Keep server running in background
- Refresh browser to see updates
- Use multiple browser tabs for different "participants"
- Check server logs in real-time

### Testing Group Chats
- Open multiple browser tabs
- Use different phone numbers in each
- Simulate friends sending messages
- Test how AI responds to multiple people

### Photo Testing
- Try different image formats (jpg, png, etc.)
- Test large images
- Test multiple photos in sequence
- Check photos display correctly

## Next Steps

Now that you have the web interface working:

1. **Test the full conversation flow** - Profile creation with AI
2. **Simulate group chats** - Multiple participants
3. **Test photo uploads** - Make sure they work smoothly
4. **Integrate with WhatsApp** - Test webhook with ngrok
5. **Iterate on AI prompts** - Refine the matchmaker personality
6. **Build profile generation** - Collect data and create profiles

## Troubleshooting

**"Can't load page"**
→ Check server is running: `curl http://localhost:3000/health`

**"Photos not uploading"**
→ Check uploads folder exists: `ls uploads/`

**"AI not responding"**
→ Check OpenAI is configured and server logs for errors

**"Conversation not syncing"**
→ Make sure using exact same phone number format

---

**Ready to test! Open http://localhost:3000 and start chatting!** 🚀
