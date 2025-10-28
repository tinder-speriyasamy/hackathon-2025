/**
 * Test script for profile renderer
 * Run with: node test-profile-renderer.js
 */

const { renderProfileCard } = require('./src/core/profile-renderer');

// Sample profile data matching the schema
const sampleProfile = {
  id: 'profile_test_12345',
  name: 'Siva',
  age: 42,
  gender: 'Male',
  photo: '', // No photo for initial test
  schools: ['Harvard University', 'MIT'],
  interested_in: 'Female',
  interests: ['Music', 'Travel & Adventure', 'Technology', 'Food & Dining']
};

async function testRenderer() {
  console.log('Testing profile renderer with sample data...\n');
  console.log('Profile data:', JSON.stringify(sampleProfile, null, 2));
  console.log('\nRendering profile card...');

  try {
    const imagePath = await renderProfileCard(sampleProfile);
    console.log('\n✅ SUCCESS!');
    console.log(`Profile card generated at: ${imagePath}`);
    console.log('\nYou can now view the image in the uploads folder.');
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testRenderer();
