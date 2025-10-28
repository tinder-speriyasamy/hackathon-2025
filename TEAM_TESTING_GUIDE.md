# Team Testing Guide - AI Matchmaker

Hey team! Here's how to test our WhatsApp AI matchmaker app. This should take ~5 minutes.

## What You're Testing
An AI matchmaker that helps you create a dating profile with input from your friends via WhatsApp. You message the bot directly, and it coordinates collaboration between you and your friends.

## Two Ways to Test

### Flow 1: Start a New Profile Session
1. Message the bot directly: **+14155238886**
2. Send "Hi" or any message to start
3. The bot gives you a session code to share with friends

### Flow 2: Join an Existing Session
1. Message the bot directly: **+14155238886**
2. Type: `join [CODE]` (e.g., "join ABC123")
3. You're now collaborating with your friends on their profile

**How it works:**
- Everyone messages the bot in their own direct chat
- The bot coordinates messages between all participants in the same session
- Everyone sees each other's messages and can help answer questions

### What Happens Next
The AI will guide you through collecting info, uploading photos, and creating a profile card. Answer naturally - anyone in the session can respond.

## Things to Test
- [ ] AI response speed
- [ ] Join code system (invite a friend)
- [ ] Multiple people collaborating
- [ ] Photo uploads
- [ ] Conversation flow
- [ ] Final profile card quality

**Report bugs or feedback in team chat!**
