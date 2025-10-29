/**
 * Profile Renderer (DEPRECATED)
 *
 * ⚠️ DEPRECATED: This file contains legacy Puppeteer-based image generation code.
 *
 * The profile system has been migrated to URL-based interactive profiles:
 * - Profile URL Manager: /src/services/profile-url-manager.js
 * - Profile HTML Generator: /src/services/profile-html-generator.js
 * - Profile Route: GET /profile/:sessionId in server.js
 *
 * This file is kept for backward compatibility with test files only.
 * The escapeHtml and generateProfileHTML functions are preserved as utilities.
 * The renderProfileCard function (Puppeteer-based) has been removed.
 */

const logger = require('../utils/logger');

/**
 * Escape HTML special characters to prevent HTML injection
 * @param {string} text - Text to escape
 * @returns {string} Escaped text safe for HTML
 */
function escapeHtml(text) {
  if (!text || typeof text !== 'string') return text;

  const htmlEscapeMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };

  return text.replace(/[&<>"'/]/g, char => htmlEscapeMap[char]);
}

/**
 * Generate HTML template for profile card
 * @param {Object} profileData - Profile schema data
 * @returns {string} HTML string with inline CSS
 */
function generateProfileHTML(profileData) {
  const {
    name = 'Unknown',
    age = '?',
    gender = 'Not specified',
    photo = '',
    schools = [],
    interested_in = 'Not specified',
    interests = [],
    sexual_orientation = '',
    relationship_intent = '',
    height = '',
    bio = '',
    prompts = [],
    education_level = '',
    major = '',
    pets = []
  } = profileData;

  // Use R2 photo URL directly
  const photoUrl = photo;

  // Build education display
  let educationDisplay = '';
  if (schools.length > 0) {
    educationDisplay = escapeHtml(schools[0]);
    if (major) educationDisplay += ` · ${escapeHtml(major)}`;
  } else if (education_level) {
    educationDisplay = escapeHtml(education_level);
    if (major) educationDisplay += ` · ${escapeHtml(major)}`;
  }

  // Build interests display
  const interestsDisplay = interests.length > 0
    ? interests.slice(0, 8).map(interest => `<span class="interest-tag">${escapeHtml(interest)}</span>`).join('')
    : '';

  // Build prompts display
  const promptsDisplay = prompts && prompts.length > 0
    ? prompts.map(prompt => `
      <div class="prompt-card">
        <div class="prompt-question">${escapeHtml(prompt.question)}</div>
        <div class="prompt-answer">${escapeHtml(prompt.answer)}</div>
      </div>
    `).join('')
    : '';

  // Build info badges (height, orientation, relationship intent)
  const infoBadges = [];
  if (height) infoBadges.push(`<div class="info-badge"><span class="badge-icon">📏</span>${escapeHtml(height)}</div>`);
  if (sexual_orientation) infoBadges.push(`<div class="info-badge"><span class="badge-icon">✨</span>${escapeHtml(sexual_orientation)}</div>`);
  if (relationship_intent) infoBadges.push(`<div class="info-badge"><span class="badge-icon">💫</span>${escapeHtml(relationship_intent)}</div>`);
  if (pets && pets.length > 0) infoBadges.push(`<div class="info-badge"><span class="badge-icon">🐾</span>${escapeHtml(pets.join(', '))}</div>`);

  const infoBadgesDisplay = infoBadges.join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #000;
      width: 600px;
      height: 1100px;
      overflow: hidden;
    }

    .profile-card {
      width: 600px;
      height: 1100px;
      position: relative;
      overflow: hidden;
      background: #000;
    }

    .brand-header {
      position: absolute;
      top: 24px;
      left: 24px;
      z-index: 100;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 42px;
      font-weight: 700;
      letter-spacing: -1px;
      background: linear-gradient(135deg, #FF6B9D 0%, #C06BFF 50%, #4ECDC4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      padding: 14px 32px;
      border-radius: 30px;
      backdrop-filter: blur(10px);
      background-color: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }

    .photo-container {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      overflow: hidden;
    }

    .photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
    }

    .placeholder-photo {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-size: 120px;
      color: rgba(255, 255, 255, 0.3);
    }

    .photo-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 70%;
      background: linear-gradient(to top,
        rgba(0, 0, 0, 1) 0%,
        rgba(0, 0, 0, 0.95) 20%,
        rgba(0, 0, 0, 0.8) 40%,
        rgba(0, 0, 0, 0.4) 70%,
        rgba(0, 0, 0, 0) 100%
      );
      pointer-events: none;
      z-index: 10;
    }

    .content-wrapper {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 20;
      padding: 25px;
      color: white;
    }

    .name-age {
      font-size: 42px;
      font-weight: 700;
      margin-bottom: 12px;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
      letter-spacing: -0.5px;
    }

    .education-badge {
      display: inline-flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(10px);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 15px;
      font-weight: 500;
      border: 1px solid rgba(255, 255, 255, 0.2);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      margin-bottom: 16px;
    }

    .content-section {
      margin-top: 0;
    }

    ${bio ? `
    .bio-section {
      margin-bottom: 24px;
      padding: 20px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 16px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .bio-text {
      font-size: 16px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.9);
      font-weight: 400;
    }` : ''}

    ${promptsDisplay ? `
    .prompts-section {
      margin-bottom: 24px;
    }

    .prompt-card {
      margin-bottom: 16px;
      padding: 18px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 14px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .prompt-question {
      font-size: 13px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .prompt-answer {
      font-size: 16px;
      line-height: 1.5;
      color: rgba(255, 255, 255, 0.95);
      font-weight: 400;
    }` : ''}

    ${infoBadgesDisplay ? `
    .info-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 24px;
    }

    .info-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.06);
      padding: 10px 16px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .badge-icon {
      font-size: 16px;
    }` : ''}

    ${interestsDisplay ? `
    .interests-section {
      margin-top: 24px;
    }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1.2px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 12px;
    }

    .interests-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .interest-tag {
      background: rgba(255, 255, 255, 0.08);
      padding: 8px 14px;
      border-radius: 20px;
      font-size: 13px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }` : ''}
  </style>
</head>
<body>
  <div class="profile-card">
    <!-- Full Bleed Photo Background -->
    <div class="photo-container">
      ${photo ?
        `<img src="${photoUrl}" alt="${escapeHtml(name)}" class="photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
         <div class="placeholder-photo" style="display:none;">📷</div>` :
        `<div class="placeholder-photo">📷</div>`
      }
    </div>

    <!-- Black to Transparent Gradient Overlay -->
    <div class="photo-overlay"></div>

    <!-- mchd Brand Header -->
    <div class="brand-header">mchd</div>

    <!-- Content Overlay -->
    <div class="content-wrapper">
      <div class="name-age">${escapeHtml(name)}, ${escapeHtml(age)}</div>
      ${educationDisplay ? `<div class="education-badge">${educationDisplay}</div>` : ''}

      <div class="content-section">
        ${bio ? `
        <div class="bio-section">
          <div class="bio-text">${escapeHtml(bio)}</div>
        </div>` : ''}

        ${promptsDisplay ? `
        <div class="prompts-section">
          ${promptsDisplay}
        </div>` : ''}

        ${infoBadgesDisplay ? `
        <div class="info-badges">
          ${infoBadgesDisplay}
        </div>` : ''}

        ${interestsDisplay ? `
        <div class="interests-section">
          <div class="section-title">Interests</div>
          <div class="interests-container">
            ${interestsDisplay}
          </div>
        </div>` : ''}
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * @deprecated renderProfileCard has been removed
 * Use the new profile URL system instead:
 * - profileUrlManager.createProfileUrl() in /src/services/profile-url-manager.js
 */
async function renderProfileCard(profileData) {
  logger.error('renderProfileCard is deprecated - use profile URL system', {
    profileId: profileData?.id
  });
  throw new Error(
    'renderProfileCard is deprecated. Use profileUrlManager.createProfileUrl() instead. ' +
    'See /src/services/profile-url-manager.js'
  );
}

/**
 * @deprecated deleteProfileCard has been removed
 * Profile URLs don't need deletion - profiles are stored in Redis permanently
 */
async function deleteProfileCard(imageUrl) {
  logger.warn('deleteProfileCard is deprecated - profiles are now permanent URLs', {
    imageUrl
  });
  return false;
}

module.exports = {
  // Utility functions (kept for backward compatibility)
  escapeHtml,
  generateProfileHTML,

  // Deprecated functions (throw errors to guide migration)
  renderProfileCard,
  deleteProfileCard
};
