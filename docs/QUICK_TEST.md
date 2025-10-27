# Quick Test Reference

## Immediate Testing Commands

### 1. Check Everything Is Working
```bash
./test-api.sh health && ./test-api.sh twilio
```

### 2. Send Test SMS (Replace with your number)
```bash
./test-api.sh send +15551234567 "Test from hackathon"
```

### 3. Create Group Chat (Replace with 2-3 of your numbers)
```bash
./test-api.sh create-conv "Hackathon Test" +15551111111 +15552222222
```
**Save the Conversation SID from the response!**

### 4. Send Message to Group
```bash
./test-api.sh send-conv CH1234567890abcdef "Hello from the AI matchmaker!"
```

### 5. List All Conversations
```bash
./test-api.sh conversations
```

## Fast Iteration Loop

1. **Make code change** → Save file
2. **Restart server** → `Ctrl+C` then `npm start`
3. **Test immediately** → Use `./test-api.sh` commands
4. **Check logs** → Watch colored output for errors
5. **Repeat**

## Phone Numbers You Can Use

**Twilio Number:** `+18883151986` (SMS, MMS enabled)

**Your Test Numbers:** _Add your phone numbers here for quick reference_
- Test 1: +1___________
- Test 2: +1___________
- Test 3: +1___________

## Common Issues & Fixes

| Issue | Solution |
|-------|----------|
| Server won't start | `lsof -i :3000` then kill process |
| SMS not sending | Check `./test-api.sh twilio` |
| Wrong number format | Must include `+1` country code |
| Conversation not found | Run `./test-api.sh conversations` to get SID |

## Next: Test Conversations!

**Give me 2-3 of your phone numbers and I'll create a test group chat for you.**

Example:
```bash
./test-api.sh create-conv "Test Group" +15551111111 +15552222222 +15553333333
```

Then you can test sending messages to the group and see if everyone receives them!
