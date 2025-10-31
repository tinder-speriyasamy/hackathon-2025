# AI System Overview (5-Minute Read)

A concise explanation of how the AI prompting and action system works.

# AI System Overview (5-Minute Read)

A concise explanation of how the AI prompting and action system works.

---

## What Is This System?

This is an **AI-powered conversational agent** that helps people create dating profiles through WhatsApp group chats. The AI:
- Asks questions naturally (one at a time)
- Collects profile information
- Accepts input from friends (for honest feedback)
- Generates a shareable profile card
- Presents potential matches

**Key Insight**: To make it not just The AI doesn't just talk about doing things—it actually does them.
. This is called tool use or function calling (it is similar to how OpenAI ChatGPT can browse, run code etc in browser - it calls functions to do these actions)

Because LLM function calling runs commands that store changes in dbs, identifies missing fields and changes and maintains state of the user's flow reliably, **the whole experience is a lot more robust than relying on just prompt engineering**. 

---

## Core Architecture

```
User Message
    ↓
Get Session State (Redis)
    ↓
Build Dynamic Prompt (our app)
    ├─ Base Prompt (personality)
    ├─ Action Instructions (what AI can do)
    ├─ Current State (stage, missing fields, etc.)
    └─ Conversation History
    ↓
Call LLM (OpenAI)
    ↓
Parse JSON Response
    ├─ message: "Conversational text"
    └─ actions: [{type, params}, ...]
    ↓
Execute Actions (modify state, trigger workflows)
    ↓
Save Updated State (Redis)
    ↓
Send Response to User
```
