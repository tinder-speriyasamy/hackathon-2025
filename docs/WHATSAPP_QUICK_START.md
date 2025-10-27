# WhatsApp Quick Start - 3 Steps to Get Running

## Step 1: Get Your WhatsApp Sender Number (1 minute)

Go to Twilio Console and get your WhatsApp sender:
https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders

Your WhatsApp number will look like:
- `whatsapp:+14155238886` (Sandbox - most common for testing)
- OR `whatsapp:+YOUR_BUSINESS_NUMBER` (Approved business number)

**Copy this number!**

## Step 2: Add to .env File (30 seconds)

Edit `.env` and add:

```bash
TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886
```

(Replace with your actual number from Step 1)

Then restart the server:
```bash
# Kill the current server (Ctrl+C in the terminal running npm start)
npm start
```

## Step 3: Join WhatsApp Sandbox (Each Team Member) (1 minute per person)

**If using Twilio Sandbox:**

1. Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn
2. You'll see something like: "Send 'join <code>' to +1415523..."
3. Open WhatsApp on your phone
4. Send that message to the sandbox number
5. You'll get a confirmation message

**Each person who wants to receive messages must do this!**

## Step 4: Set Up ngrok for Webhooks (2 minutes)

### 4a. Get ngrok Auth Token

1. Sign up at: https://dashboard.ngrok.com/signup
2. Copy your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken

### 4b. Configure ngrok

```bash
ngrok config add-authtoken YOUR_AUTH_TOKEN_HERE
```

### 4c. Start ngrok

```bash
ngrok http 3000
```

You'll see:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

**Copy the HTTPS URL!**

### 4d. Configure Webhook in Twilio

1. Go to your WhatsApp sender: https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders
2. Click on your WhatsApp sender
3. Set "When a message comes in" to: `https://abc123.ngrok-free.app/webhooks/sms`
4. Save

## Step 5: Test It! (30 seconds)

### Test Sending:

```bash
./test-api.sh whatsapp +19193087138 "Hello from the AI matchmaker!"
```

**Note:** The recipient must have joined the sandbox first (Step 3).

### Test Receiving:

Send a WhatsApp message from your phone to the Twilio number.
You should see it in your server logs!

## Quick Commands Reference

```bash
# Check server is running
./test-api.sh health

# Check Twilio + WhatsApp config
./test-api.sh twilio

# Send WhatsApp message
./test-api.sh whatsapp +19193087138 "Message"

# View server logs (in the npm start terminal)
# You'll see incoming WhatsApp messages in real-time
```

## What's Next?

Once WhatsApp is working, you can:

1. **Simulate group chats** - Send the same message to multiple people
2. **Build conversation flows** - Respond to incoming messages automatically
3. **Integrate OpenAI** - Make the AI matchmaker respond intelligently
4. **Test the full profile creation flow** - With your team!

---

## Summary Checklist

- [ ] Get WhatsApp sender number from Twilio Console
- [ ] Add `TWILIO_WHATSAPP_NUMBER` to `.env`
- [ ] Restart server (`npm start`)
- [ ] Each team member joins WhatsApp sandbox
- [ ] Sign up for ngrok and get authtoken
- [ ] Configure ngrok: `ngrok config add-authtoken YOUR_TOKEN`
- [ ] Start ngrok: `ngrok http 3000`
- [ ] Configure webhook in Twilio Console
- [ ] Test sending: `./test-api.sh whatsapp <phone> "Test"`
- [ ] Test receiving: Send WhatsApp message to Twilio number

**Estimated total time: 10-15 minutes for full setup**

---

## Need Help?

Check the detailed guides:
- `WHATSAPP_SETUP.md` - Complete WhatsApp guide
- `NGROK_SETUP.md` - ngrok troubleshooting
- `README.md` - Full project documentation

Or just ask! I'm here to help.
