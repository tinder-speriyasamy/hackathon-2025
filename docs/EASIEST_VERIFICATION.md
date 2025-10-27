# Easiest Way to Verify Numbers for Hackathon

## TL;DR - Fastest Method (Manual via Console)

For 5-8 numbers, **manual verification via Twilio Console is actually fastest**:

1. Go to: https://console.twilio.com/us1/develop/phone-numbers/manage/verified
2. Click **"Add new Caller ID"**
3. Enter phone number
4. Choose **"Text you instead"** (SMS option!)
5. Enter the code you receive via SMS
6. Repeat for each number (~1 minute per number)

**This is actually easier than the API because:**
- ✅ You can use SMS (not just voice calls)
- ✅ Web interface is fast for small batches
- ✅ No API complexity
- ✅ Works immediately

## Why the API Method Uses Voice Calls

Twilio's Outgoing Caller ID verification API (`validationRequests`) **only supports voice calls**, not SMS. This is a Twilio limitation, not ours.

However, the **web console** supports both SMS and voice calls!

## Option 1: Manual Console (RECOMMENDED for 5-8 numbers)

**Step-by-step:**

1. **Open** https://console.twilio.com/us1/develop/phone-numbers/manage/verified
2. **Click** "Add new Caller ID" button
3. **Choose** "Text you instead" for SMS verification
4. **Enter** your phone number
5. **Check your phone** for SMS with code
6. **Enter the code** on the website
7. **Done!** Repeat for next number

⏱️ **Time:** ~1 minute per number = 5-8 minutes total

## Option 2: Programmatic (Voice Calls Only)

If you prefer automation despite voice calls:

```bash
# This will CALL the number (not SMS)
./test-api.sh verify +19193087138

# Answer the call, enter the code shown in terminal
```

## Option 3: Batch Script with Manual Console

Create a list of your numbers, then verify them all in one session:

```bash
# Your hackathon numbers
+19193087138
+19199176791
+1XXXXXXXXXX
+1XXXXXXXXXX
+1XXXXXXXXXX
```

Then open the console and verify them one by one using SMS.

## After Verification

Check all verified numbers:

```bash
./test-api.sh verified
```

Then test group chat:

```bash
./test-api.sh create-conv "Team Chat" +19193087138 +19199176791
```

---

## Bottom Line

**For a hackathon with 5-8 numbers, use the Twilio Console with SMS verification. It's faster and easier than any API method.**

Direct link: https://console.twilio.com/us1/develop/phone-numbers/manage/verified
