/**
 * Debug script to inspect session data
 * Usage: node debug-session.js [sessionId or phoneNumber]
 */

const Redis = require('ioredis');
const { getMissingFields, isSchemaComplete, isFieldFilled } = require('./src/core/profile-schema');

async function debugSession(identifier) {
  const redis = new Redis();

  try {
    let sessionKey;

    // Check if it's a phone number or session ID
    if (identifier.includes('+') || identifier.includes('whatsapp:')) {
      const normalized = identifier.includes('whatsapp:') ? identifier : `whatsapp:${identifier}`;
      sessionKey = await redis.get(`phone:${normalized}`);
      console.log(`\n📞 Phone: ${normalized}`);
      console.log(`🔑 Session Key: ${sessionKey || 'NOT FOUND'}\n`);
    } else {
      sessionKey = identifier;
    }

    if (!sessionKey) {
      console.log('❌ No session found for this identifier');
      redis.disconnect();
      return;
    }

    const sessionData = await redis.get(`session:${sessionKey}`);

    if (!sessionData) {
      console.log('❌ Session data not found');
      redis.disconnect();
      return;
    }

    const session = JSON.parse(sessionData);

    console.log('='.repeat(60));
    console.log('SESSION DEBUG INFO');
    console.log('='.repeat(60));

    console.log('\n📋 Basic Info:');
    console.log(`   Session ID: ${session.sessionId}`);
    console.log(`   Stage: ${session.stage}`);
    console.log(`   Created: ${new Date(session.createdAt).toLocaleString()}`);
    console.log(`   Participants: ${session.participants?.length || 0}`);

    if (session.participants) {
      session.participants.forEach(p => {
        console.log(`      - ${p.name} (${p.phoneNumber})`);
      });
    }

    console.log('\n🎯 Profile Schema:');
    if (!session.profileSchema) {
      console.log('   ❌ No profile schema');
    } else {
      const schema = session.profileSchema;
      console.log(`   Name: ${schema.name || '❌ missing'}`);
      console.log(`   Age: ${schema.age || '❌ missing'}`);
      console.log(`   Gender: ${schema.gender || '❌ missing'}`);
      console.log(`   Photo: ${schema.photo ? '✅ set' : '❌ missing'}`);
      console.log(`   Schools: ${Array.isArray(schema.schools) && schema.schools.length > 0 ? schema.schools.join(', ') : '❌ missing'}`);
      console.log(`   Interested In: ${schema.interested_in || '❌ missing'}`);
      console.log(`   Interests:`);

      if (Array.isArray(schema.interests)) {
        console.log(`      Type: array`);
        console.log(`      Length: ${schema.interests.length}`);
        if (schema.interests.length > 0) {
          schema.interests.forEach((interest, i) => {
            console.log(`      ${i + 1}. ${interest} (${typeof interest})`);
          });
        } else {
          console.log(`      ❌ Empty array`);
        }
      } else {
        console.log(`      ❌ Not an array: ${typeof schema.interests}`);
        console.log(`      Value: ${JSON.stringify(schema.interests)}`);
      }

      console.log('\n🔍 Field Validation:');
      const fields = ['name', 'age', 'gender', 'photo', 'schools', 'interested_in', 'interests'];
      fields.forEach(field => {
        const isFilled = isFieldFilled(schema, field);
        console.log(`   ${field}: ${isFilled ? '✅ valid' : '❌ invalid/missing'}`);
      });

      console.log('\n📊 Completion Status:');
      const missingFields = getMissingFields(schema);
      const isComplete = isSchemaComplete(schema);
      console.log(`   Complete: ${isComplete ? '✅ YES' : '❌ NO'}`);
      if (!isComplete) {
        console.log(`   Missing fields: ${missingFields.join(', ')}`);
      }
    }

    console.log('\n📸 Photos:');
    if (session.photos && session.photos.length > 0) {
      session.photos.forEach((url, i) => {
        console.log(`   ${i + 1}. ${url}`);
      });
    } else {
      console.log('   None');
    }

    console.log('\n' + '='.repeat(60));

    redis.disconnect();
  } catch (error) {
    console.error('Error:', error.message);
    redis.disconnect();
  }
}

const identifier = process.argv[2];
if (!identifier) {
  console.log('Usage: node debug-session.js [sessionId or phoneNumber]');
  console.log('Example: node debug-session.js +14155551234');
  console.log('Example: node debug-session.js whatsapp:+14155551234');
  process.exit(1);
}

debugSession(identifier);
