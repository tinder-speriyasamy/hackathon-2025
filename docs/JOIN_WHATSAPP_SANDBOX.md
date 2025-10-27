# Join WhatsApp Sandbox - 2 Minutes

## What You Need to Do

**IMPORTANT:** Before you can send or receive WhatsApp messages, **each person must join the Twilio WhatsApp sandbox**.

## Step 1: Get Your Join Code

Go to: https://console.twilio.com/us1/develop/sms/try-it-out/whatsapp-learn

You'll see something like:

```
To connect your sandbox, send this message:
join <some-word>

To this number:
+1 415 523 8886
```

The join code is unique to your account.

## Step 2: Join from Your Phone

1. **Open WhatsApp** on your phone
2. **Start a new chat** with: `+1 415 523 8886`
3. **Send the message**: `join your-code-here`
4. **Wait for confirmation** (instant)

You'll get a message back saying:
```
✅ Joined sandbox! You can now test your notifications...
```

## Step 3: Have Your Team Join

**Each team member** needs to do Steps 1-2 from their phone.

Everyone who wants to:
- Receive WhatsApp messages from your app
- Send messages to your app

Must join the sandbox first!

## Quick Test After Joining

Once you've joined, test it immediately:

```bash
./test-api.sh whatsapp +19193087138 "Hello! Testing WhatsApp"
```

(Replace with your actual phone number)

You should receive the message on WhatsApp within seconds!

## Troubleshooting

**Problem: "join" message not working**
- Make sure you're sending to the exact number shown in the console
- Check for typos in the join code
- Try sending just "join" without a code - it might send you the correct code

**Problem: No confirmation message**
- Wait 30 seconds
- Try restarting WhatsApp
- Check you're in the right country (WhatsApp sandbox works worldwide)

**Problem: Can't send messages to this number**
- The recipient must join the sandbox first
- Check they sent the "join" message successfully

## Important Notes

- **Sandbox expires after 24 hours of inactivity** - you may need to rejoin
- **Free tier limitation** - Sandbox is free but has rate limits
- **For production** - You'd get an approved WhatsApp Business number (not needed for hackathon)

---

## Ready to Test?

Once you've joined:

```bash
# Test sending
./test-api.sh whatsapp +YOUR_PHONE "Hello from the AI matchmaker! 👋"

# If you get an error, check:
# 1. You joined the sandbox
# 2. Phone number format: +1XXXXXXXXXX (with country code)
# 3. Server is running: ./test-api.sh health
```

Let me know when you've joined and we'll test it!
