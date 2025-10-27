# ngrok Setup for WhatsApp Webhooks

## Quick Setup (2 minutes)

### Step 1: Create ngrok Account (Free)

1. Go to: https://dashboard.ngrok.com/signup
2. Sign up (use GitHub/Google for fastest signup)
3. Copy your authtoken from: https://dashboard.ngrok.com/get-started/your-authtoken

### Step 2: Configure ngrok

```bash
ngrok config add-authtoken YOUR_AUTHTOKEN_HERE
```

### Step 3: Start ngrok Tunnel

```bash
ngrok http 3000
```

You'll see output like:
```
Forwarding  https://abc123.ngrok-free.app -> http://localhost:3000
```

**Copy the HTTPS URL** (e.g., `https://abc123.ngrok-free.app`)

### Step 4: Configure Twilio WhatsApp Webhook

1. Go to: https://console.twilio.com/us1/develop/sms/senders/whatsapp-senders
2. Click on your WhatsApp sender
3. Under "When a message comes in":
   - Set to: `https://abc123.ngrok-free.app/webhooks/sms`
   - Method: `POST`
4. Save

### Step 5: Test It!

Send a WhatsApp message to your Twilio WhatsApp number, and you'll see it in your server logs!

## Alternative: Use Twilio's Test Endpoint (For Quick Testing)

If you don't want to set up ngrok immediately, you can test WhatsApp sending first:

1. Make sure TWILIO_WHATSAPP_NUMBER is set in `.env`
2. Restart server: `npm start`
3. Test sending: `./test-api.sh whatsapp +19193087138 "Test message"`

Receiving messages requires ngrok or a public URL.

## Keeping ngrok Running

Option 1: Run ngrok in a separate terminal
```bash
ngrok http 3000
```

Option 2: Run ngrok in background (advanced)
```bash
ngrok http 3000 > /dev/null 2>&1 &
```

## Troubleshooting

**Problem: ngrok URL changes every restart**
- Free plan gives you a new URL each time
- Paid plan ($8/mo) gives you a static domain
- For hackathon, just update the webhook URL when it changes

**Problem: Webhook not receiving messages**
- Check ngrok is running: `curl http://localhost:4040/status`
- Check webhook is configured in Twilio Console
- Check server logs for incoming requests

**Problem: "ERR_NGROK_4018"**
- You need to authenticate ngrok (see Step 2 above)

## Quick Commands

```bash
# Start ngrok (after auth)
ngrok http 3000

# Check ngrok status
curl http://localhost:4040/api/tunnels

# View ngrok dashboard
# Open browser to: http://localhost:4040
```

---

**Next: Get your ngrok authtoken and run `ngrok config add-authtoken YOUR_TOKEN`**
