# WhatsApp Setup Guide for Hackathon

## What You Need to Know About WhatsApp + Twilio

**Good news:** WhatsApp is MUCH easier than SMS for hackathons!
- ✅ No phone number verification needed
- ✅ Works internationally without carrier restrictions
- ✅ Better for group messaging
- ✅ Rich media support (images, emojis, etc.)

**Important limitation:** **WhatsApp doesn't support traditional "group chats" via Twilio API**
- WhatsApp group chats must be created in the WhatsApp app itself
- Twilio can only send 1:1 messages to WhatsApp users
- For your hackathon: **You'll simulate group chat by sending the same message to multiple people**

## Quick Setup Steps

### Step 1: Get Your WhatsApp Sender Number

You mentioned you have WhatsApp for Business connected. Find your WhatsApp sender number:

1. Go to https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders
2. Look for your WhatsApp sender (format: `whatsapp:+14155238886` or similar)
3. Copy that number

**Or check via CLI:**
```bash
twilio api:messaging:v1:services:list
```

### Step 2: Add to .env File

Add your WhatsApp number to `.env`:

```bash
# Add this line
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

Replace `+14155238886` with your actual WhatsApp Business number.

### Step 3: Activate Sandbox (If Using Twilio Sandbox)

If you're using the Twilio WhatsApp Sandbox (most common for testing):

1. Go to https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. Send the join code from your phone to the sandbox number
3. Example: Send "join <code>" to the WhatsApp number shown
4. **Each team member must do this to receive messages!**

### Step 4: Configure Webhook

Set the webhook URL for incoming WhatsApp messages:

1. Go to https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders
2. Click on your WhatsApp sender
3. Set "When a message comes in" to: `https://your-ngrok-url.ngrok.io/webhooks/sms`
4. (Use ngrok to expose localhost - see below)

## Testing WhatsApp Messages

### Test 1: Send a WhatsApp Message

```bash
./test-api.sh whatsapp +19193087138 "Hello from the AI matchmaker!"
```

**Important:** The recipient must have:
1. Joined your WhatsApp sandbox (sent the join code), OR
2. Received a message from you in the last 24 hours

### Test 2: Simulate Group Chat

Send the same message to multiple people:

```bash
./test-api.sh whatsapp-group "+19193087138,+19199176791" "Hey friends! Ready to create your dating profile?"
```

This sends the same message to all recipients individually (simulating a group chat).

## How "Group Chat" Works with WhatsApp

Since WhatsApp API doesn't support group chats directly, here's the strategy:

### Approach 1: Broadcast Messages (Recommended for Hackathon)
- Send the same message to all participants
- Each person sees it as a 1:1 chat with the AI matchmaker
- Participants can reply, and you can forward replies to the group

**Pros:**
- ✅ Easy to implement
- ✅ Works immediately
- ✅ No WhatsApp restrictions

**Cons:**
- ❌ Not a true group chat
- ❌ Participants don't see each other's messages automatically

### Approach 2: Real WhatsApp Group (Manual Setup)
- Create a WhatsApp group manually in the WhatsApp app
- Add your team as participants
- Add your WhatsApp Business number to the group
- Messages sent to the group show up in your webhook

**Pros:**
- ✅ True group chat experience
- ✅ Everyone sees all messages

**Cons:**
- ❌ Manual setup required
- ❌ Harder to automate

**For the hackathon, I recommend Approach 1** - it's faster and demonstrates the concept well.

## Code Examples

### Send to One Person
```javascript
await twilioClient.messages.create({
  body: 'Hello from AI matchmaker!',
  from: 'whatsapp:+14155238886',
  to: 'whatsapp:+19193087138'
});
```

### Send to Multiple People (Group Simulation)
```javascript
const participants = ['+19193087138', '+19199176791', '+15551234567'];
const message = 'Hey everyone! Let's create a dating profile together!';

for (const phoneNumber of participants) {
  await twilioClient.messages.create({
    body: message,
    from: 'whatsapp:+14155238886',
    to: `whatsapp:${phoneNumber}`
  });
}
```

### Handle Incoming Messages
Webhook receives:
```json
{
  "From": "whatsapp:+19193087138",
  "To": "whatsapp:+14155238886",
  "Body": "I'm excited to start!",
  "ProfileName": "John Doe"
}
```

## Setting Up ngrok for Webhooks

WhatsApp webhooks need a public URL:

```bash
# Install ngrok
brew install ngrok  # or download from ngrok.com

# Start tunnel
ngrok http 3000

# Copy the HTTPS URL (e.g., https://abc123.ngrok.io)
# Configure in Twilio Console as: https://abc123.ngrok.io/webhooks/sms
```

## Quick Start Checklist

- [ ] Get WhatsApp sender number from Twilio Console
- [ ] Add `TWILIO_WHATSAPP_NUMBER` to `.env`
- [ ] Restart server: `npm start`
- [ ] Each team member joins WhatsApp sandbox (send join code)
- [ ] Set up ngrok tunnel for webhooks
- [ ] Configure webhook in Twilio Console
- [ ] Test: `./test-api.sh whatsapp <your-number> "Test"`
- [ ] Verify message received on WhatsApp

## WhatsApp vs SMS Conversations

| Feature | WhatsApp | SMS Conversations |
|---------|----------|-------------------|
| Group chat | Manual/Simulated | Native support |
| Setup time | 5 minutes | 30+ minutes (verification) |
| International | ✅ Free | ❌ Expensive |
| Rich media | ✅ Yes | Limited (MMS) |
| User verification | Just join sandbox | Must verify each number |
| Best for hackathon | ✅ YES | ❌ Too slow |

## Next Steps

1. **Tell me your WhatsApp sender number** (from Twilio Console)
2. I'll update your `.env` file
3. We'll test sending a WhatsApp message
4. Then set up the simulated group chat flow

**What's your WhatsApp sender number?** (Format: `whatsapp:+1XXXXXXXXXX`)
