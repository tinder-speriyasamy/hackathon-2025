/**
 * Create Demo Profiles Script
 * - Reads demo profiles from demo-profiles/demo-profile-data.js
 * - Uploads photos from demo-profiles/images/[name]/ to R2
 * - Creates profiles in Redis
 * - Generates demo-config.js with profile URLs
 */

// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs').promises;
const path = require('path');
const redis = require('redis');
const { uploadToR2 } = require('./src/utils/r2-storage');
const profileUrlManager = require('./src/services/profile-url-manager');

const DEMO_PROFILES_DIR = path.join(__dirname, 'demo-profiles');
const DEMO_IMAGES_DIR = path.join(DEMO_PROFILES_DIR, 'images');
const BASE_URL = process.env.BASE_URL || 'https://unterrified-bea-prolately.ngrok-free.dev';

/**
 * Upload all photos for a profile to R2
 * @param {string} profileName - Name of the profile (used for folder lookup)
 * @param {string} sessionId - Session ID for R2 organization
 * @returns {Promise<Array<string>>} Array of uploaded photo URLs
 */
async function uploadProfilePhotos(profileName, sessionId) {
  const folderName = profileName.toLowerCase();
  const imageDir = path.join(DEMO_IMAGES_DIR, folderName);

  try {
    // Check if images directory exists
    await fs.access(imageDir);
  } catch (error) {
    console.log(`⚠️  No images folder found for ${profileName} at ${imageDir}`);
    return [];
  }

  try {
    const files = await fs.readdir(imageDir);
    const imageFiles = files.filter(file =>
      /\.(jpg|jpeg|png|gif|webp)$/i.test(file) && !file.startsWith('.')
    );

    if (imageFiles.length === 0) {
      console.log(`⚠️  No image files found for ${profileName}`);
      return [];
    }

    console.log(`   Found ${imageFiles.length} photo(s) for ${profileName}`);

    const uploadedUrls = [];

    for (const imageFile of imageFiles) {
      const imagePath = path.join(imageDir, imageFile);
      const fileBuffer = await fs.readFile(imagePath);

      // Determine content type from extension
      const ext = path.extname(imageFile).toLowerCase();
      const contentTypeMap = {
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.webp': 'image/webp'
      };
      const contentType = contentTypeMap[ext] || 'image/jpeg';

      // Upload to R2
      const url = await uploadToR2(fileBuffer, imageFile, contentType, sessionId);
      uploadedUrls.push(url);
      console.log(`   ✅ Uploaded: ${imageFile} -> ${url}`);
    }

    return uploadedUrls;

  } catch (error) {
    console.error(`   ❌ Failed to upload photos for ${profileName}:`, error.message);
    return [];
  }
}

/**
 * Map demo profile data to our system's profile schema
 * @param {Object} demoProfile - Demo profile data
 * @param {Array<string>} photoUrls - Uploaded photo URLs
 * @returns {Object} Mapped profile data
 */
function mapProfileData(demoProfile, photoUrls) {
  return {
    name: demoProfile.name,
    age: demoProfile.age,
    gender: demoProfile.gender,
    photo: photoUrls[0] || '', // Primary photo
    photos: photoUrls, // All photos
    schools: demoProfile.schools || [],
    education_level: demoProfile.education_level || '',
    major: demoProfile.major || '',
    interested_in: demoProfile.interested_in || '',
    interests: demoProfile.interests || [],
    sexual_orientation: demoProfile.sexual_orientation || '',
    relationship_intent: demoProfile.relationship_intent || '',
    height: demoProfile.height || '',
    bio: demoProfile.bio || '',
    prompts: demoProfile.prompts || [],
    pets: demoProfile.pets || []
  };
}

/**
 * Main function to create demo profiles
 */
async function createDemoProfiles() {
  console.log('🚀 Starting demo profile creation...\n');

  // Initialize Redis client
  const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  try {
    await redisClient.connect();
    console.log('✅ Connected to Redis\n');

    // Initialize profile URL manager
    profileUrlManager.initialize(redisClient);
    console.log('✅ Profile URL Manager initialized\n');

    // Load demo profile data
    const { profiles } = require('./demo-profiles/demo-profile-data.js');
    console.log(`📝 Found ${profiles.length} demo profiles to create\n`);

    const demoConfig = [];

    // Process each profile
    for (const demoProfile of profiles) {
      console.log(`\n📸 Processing profile: ${demoProfile.name}`);
      console.log(`   Session ID: ${demoProfile.sessionId}`);

      // Upload photos
      const photoUrls = await uploadProfilePhotos(demoProfile.name, demoProfile.sessionId);

      if (photoUrls.length === 0) {
        console.log(`   ⚠️  Warning: No photos uploaded for ${demoProfile.name}`);
      }

      // Map profile data
      const profileData = mapProfileData(demoProfile, photoUrls);

      // Create profile URL
      console.log(`   💾 Creating profile in Redis...`);
      const profileUrl = await profileUrlManager.createProfileUrl(
        demoProfile.sessionId,
        profileData,
        BASE_URL
      );

      // Extract profile code from URL
      const profileCode = profileUrl.split('/').pop();

      console.log(`   ✅ Profile created successfully!`);
      console.log(`      URL: ${profileUrl}`);
      console.log(`      Code: ${profileCode}`);

      // Add to demo config
      demoConfig.push({
        name: demoProfile.name,
        sessionId: demoProfile.sessionId,
        profileCode: profileCode,
        profileUrl: profileUrl,
        photoCount: photoUrls.length
      });
    }

    // Generate demo-config.js
    console.log(`\n\n📄 Generating demo-config.js...`);
    const configContent = `/**
 * Demo Profiles Configuration
 * Auto-generated by create-demo-profiles.js
 * Generated on: ${new Date().toISOString()}
 */

module.exports = {
  baseUrl: '${BASE_URL}',
  profiles: ${JSON.stringify(demoConfig, null, 2)}
};
`;

    await fs.writeFile(path.join(__dirname, 'demo-config.js'), configContent);
    console.log(`✅ demo-config.js created successfully!\n`);

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('🎉 DEMO PROFILES CREATED SUCCESSFULLY!');
    console.log('='.repeat(60));
    console.log(`\nTotal profiles: ${demoConfig.length}\n`);

    demoConfig.forEach((profile, index) => {
      console.log(`${index + 1}. ${profile.name}`);
      console.log(`   URL: ${profile.profileUrl}`);
      console.log(`   Photos: ${profile.photoCount}`);
      console.log('');
    });

    console.log('Next steps:');
    console.log('1. Check demo-config.js for all profile URLs');
    console.log('2. Import demo-config.js in your conversation flow');
    console.log('3. Use the profile URLs to show recommendations\n');

  } catch (error) {
    console.error('\n❌ Error creating demo profiles:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await redisClient.quit();
    console.log('✅ Redis connection closed\n');
  }
}

// Run the script
createDemoProfiles().catch(console.error);
