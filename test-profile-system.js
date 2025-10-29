/**
 * Test script for profile system
 * Creates a test profile and attempts to access it
 */

const profileUrlManager = require('./src/services/profile-url-manager');
const redis = require('redis');

async function testProfileSystem() {
  // Initialize Redis client
  const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  try {
    await redisClient.connect();
    console.log('✅ Connected to Redis');

    // Initialize profile URL manager
    profileUrlManager.initialize(redisClient);
    console.log('✅ Profile URL Manager initialized');

    // Create test profile data with multiple photos
    const testSessionId = 'TEST123';
    const testProfileData = {
      id: 'profile-test-1',
      name: 'Alex Test',
      age: '28',
      gender: 'Male',
      photo: 'https://pub-3c021e53644b43ec9100cf743969ea8d.r2.dev/sessions/19193087138/1761685653763_photo.jpeg',
      photos: [
        'https://pub-3c021e53644b43ec9100cf743969ea8d.r2.dev/sessions/19193087138/1761685653763_photo.jpeg',
        'https://pub-3c021e53644b43ec9100cf743969ea8d.r2.dev/sessions/19193087138/1761685653763_photo.jpeg',
        'https://pub-3c021e53644b43ec9100cf743969ea8d.r2.dev/sessions/19193087138/1761685653763_photo.jpeg'
      ],
      school: ['MIT', 'Stanford'],
      interests: ['Hiking', 'Photography', 'Coffee'],
      bio: 'Love exploring new places and capturing moments. Always up for a good conversation over coffee.',
      height: '5\'11"',
      sexualOrientation: 'Straight',
      relationshipIntent: 'Long-term',
      interestedIn: 'Women',
      createdAt: new Date().toISOString(),
      status: 'active'
    };

    console.log('\n📝 Creating test profile...');
    const profileUrl = await profileUrlManager.createProfileUrl(
      testSessionId,
      testProfileData,
      'http://localhost:3000'  // Use localhost for testing
    );

    console.log('✅ Profile URL created:', profileUrl);

    // Verify profile can be retrieved
    console.log('\n🔍 Retrieving profile...');
    const retrievedProfile = await profileUrlManager.getProfileData(testSessionId);

    if (retrievedProfile) {
      console.log('✅ Profile retrieved successfully');
      console.log('   Name:', retrievedProfile.name);
      console.log('   Age:', retrievedProfile.age);
      console.log('   Photos:', retrievedProfile.photos?.length || 0);
    } else {
      console.log('❌ Failed to retrieve profile');
    }

    console.log('\n🌐 Test the profile at:');
    console.log('   Local:', profileUrl);
    console.log('   Public: https://unterrified-bea-prolately.ngrok-free.dev/profile/' + testSessionId);

    console.log('\n💡 Run this command to test:');
    console.log(`   curl http://localhost:3000/profile/${testSessionId}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await redisClient.quit();
    console.log('\n✅ Test complete');
  }
}

// Run the test
testProfileSystem().catch(console.error);
