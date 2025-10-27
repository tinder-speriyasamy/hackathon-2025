# Phone Number Verification - Quick Guide

## Why You Need This

Twilio trial accounts can only send SMS to **verified phone numbers**. For the hackathon, you need to verify 5-8 numbers.

## Current Status

You already have **1 verified number**:
- ✅ +17742769596

## How to Verify Your Hackathon Numbers (Super Fast)

### Step 1: Check Currently Verified Numbers

```bash
./test-api.sh verified
```

### Step 2: Verify Each Phone Number

**For each number you want to use (+19193087138, +19199176791, etc.):**

```bash
./test-api.sh verify +19193087138
```

This will:
1. **Immediately call that phone number**
2. Show you a **6-digit verification code** in the terminal
3. When you answer the call, **enter the code** using your phone keypad
4. The number is verified instantly!

### Step 3: Verify It Worked

```bash
./test-api.sh verified
```

You should see the new number in the list.

## Example: Verify All Your Numbers

```bash
# Verify first number
./test-api.sh verify +19193087138
# Answer the call, enter the code shown in terminal

# Verify second number
./test-api.sh verify +19199176791
# Answer the call, enter the code shown in terminal

# Check all verified numbers
./test-api.sh verified
```

## Alternative: Manual Verification (Slower)

If the programmatic way doesn't work, you can verify manually:

1. Go to https://console.twilio.com/
2. Click **Phone Numbers** → **Verified Caller IDs**
3. Click **+** button
4. Enter phone number
5. Choose "Call" or "Text" for verification
6. Enter the code you receive

## Troubleshooting

**Problem: "Twilio will call" but no call received**
- Check the phone number format: must be +1XXXXXXXXXX (with country code)
- Make sure your phone can receive calls
- Check server logs for errors

**Problem: Already verified but not showing up**
- Wait 30 seconds and check again with `./test-api.sh verified`
- The verification takes a few seconds to propagate

**Problem: Call comes from unknown number**
- Answer it anyway! It's Twilio's verification system
- The call will immediately ask for the code

## Fast Workflow for Hackathon

1. **Get your team's phone numbers** (5-8 total)
2. **Run verification for each one** (takes ~30 seconds per number)
3. **Verify all are added** with `./test-api.sh verified`
4. **Test group chat** with `./test-api.sh create-conv "Test" +1XXX +1XXX`
5. **Start building!**

---

**Ready to verify your numbers? Start with:**

```bash
./test-api.sh verify +19193087138
./test-api.sh verify +19199176791
```

Then add any other numbers your team will use!
