/**
 * Test script to reproduce profile rendering bug
 */

const { generateProfileHTML } = require('./src/core/profile-renderer');
const fs = require('fs');

// Test data that might reproduce the bug shown in screenshot
const testProfile = {
  name: 'Siva',
  age: '40',
  gender: 'Male',
  photo: 'https://pub-3c021e53644b43ec9100cf743969ea8d.r2.dev/878TD3/photo_1730136278925.jpg',
  schools: ['UCLA'],
  interested_in: 'Women',
  interests: ['Movies (especially Tarantino)', 'skiing', 'baking', 'grilling burgers'],
  sexual_orientation: 'Straight',
  relationship_intent: 'Still figuring it out',
  height: '5\'9"',
  bio: 'Great at dad jokes, super reliable, always there to help out, makes a great cheeseburger, team player, and ready to save the day with last-minute exam prep.',
  prompts: [
    {
      question: 'MY WEAKNESS IS...',
      answer: 'I drive fast'
    },
    {
      question: 'PERKS OF DATING ME...',
      answer: 'Great at problem solving (and I bake!)'
    },
    {
      question: 'PEOPLE WOULD DESCRIBE ME AS...',
      answer: 'Good at prompting LLMs'
    }
  ]
};

// Generate HTML
console.log('Generating profile HTML...');
const html = generateProfileHTML(testProfile);

// Save to file
const outputPath = '/tmp/test_profile_card.html';
fs.writeFileSync(outputPath, html);

console.log(`\nProfile HTML saved to: ${outputPath}`);
console.log('\nProfile data used:');
console.log(JSON.stringify(testProfile, null, 2));

// Log name and age specifically
console.log(`\nName: ${testProfile.name}`);
console.log(`Age: ${testProfile.age}`);
console.log(`\nSearching HTML for name occurrences...`);

// Count occurrences of name in HTML
const nameMatches = html.match(new RegExp(testProfile.name, 'g')) || [];
console.log(`Found "${testProfile.name}" ${nameMatches.length} times in HTML`);

// Count occurrences of "Siva, 40" or "Siva, 42"
const sivaAge40 = html.match(/Siva,\s*40/g) || [];
const sivaAge42 = html.match(/Siva,\s*42/g) || [];
console.log(`Found "Siva, 40" ${sivaAge40.length} times`);
console.log(`Found "Siva, 42" ${sivaAge42.length} times`);

// Check if age appears multiple times
const ageMatches = html.match(new RegExp(`\\b${testProfile.age}\\b`, 'g')) || [];
console.log(`Found age "${testProfile.age}" ${ageMatches.length} times in HTML`);

console.log('\nDone!');
