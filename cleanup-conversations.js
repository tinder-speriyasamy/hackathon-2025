/**
 * Cleanup script to remove all participants from Twilio Conversations
 * This prevents old conversations from auto-broadcasting messages
 */

require('dotenv').config();
const twilio = require('twilio');

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const serviceSid = process.env.TWILIO_CONVERSATIONS_SID;

const client = twilio(accountSid, authToken);

async function cleanupConversations() {
  console.log('Starting cleanup...');
  console.log('Service SID:', serviceSid);

  try {
    // List all conversations in the service
    const conversations = await client.conversations.v1
      .services(serviceSid)
      .conversations
      .list();

    console.log(`Found ${conversations.length} conversations`);

    for (const conversation of conversations) {
      console.log(`\nProcessing conversation: ${conversation.sid} (${conversation.friendlyName})`);

      // List participants in this conversation
      const participants = await client.conversations.v1
        .services(serviceSid)
        .conversations(conversation.sid)
        .participants
        .list();

      console.log(`  Found ${participants.length} participants`);

      // Remove each participant
      for (const participant of participants) {
        try {
          await client.conversations.v1
            .services(serviceSid)
            .conversations(conversation.sid)
            .participants(participant.sid)
            .remove();

          console.log(`  ✓ Removed participant: ${participant.sid} (${participant.messagingBinding?.address || 'unknown'})`);
        } catch (error) {
          console.error(`  ✗ Failed to remove participant ${participant.sid}:`, error.message);
        }
      }

      // Optionally delete the conversation itself
      try {
        await client.conversations.v1
          .services(serviceSid)
          .conversations(conversation.sid)
          .remove();

        console.log(`  ✓ Deleted conversation: ${conversation.sid}`);
      } catch (error) {
        console.error(`  ✗ Failed to delete conversation:`, error.message);
      }
    }

    console.log('\n✅ Cleanup complete!');
  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    process.exit(1);
  }
}

cleanupConversations();
