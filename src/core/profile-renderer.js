/**
 * Profile Renderer
 * Generates beautiful profile card images from profile schema data
 */

const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');
const { uploadToR2 } = require('../utils/r2-storage');

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
    interests = []
  } = profileData;

  // Use R2 photo URL directly
  const photoUrl = photo;

  const schoolsDisplay = schools.length > 0
    ? schools.join(', ')
    : 'Not specified';

  const interestsDisplay = interests.length > 0
    ? interests.map(interest => `<span class="interest-tag">${interest}</span>`).join('')
    : '<span class="interest-tag">No interests listed</span>';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
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
      height: 800px;
      overflow: hidden;
    }

    .profile-card {
      width: 600px;
      height: 800px;
      position: relative;
      overflow: hidden;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    }

    .photo-container {
      width: 100%;
      height: 100%;
      position: relative;
    }

    .photo {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
    }

    .overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      background: linear-gradient(to top,
        rgba(0, 0, 0, 0.95) 0%,
        rgba(0, 0, 0, 0.85) 30%,
        rgba(0, 0, 0, 0.4) 60%,
        rgba(0, 0, 0, 0) 100%
      );
      padding: 40px 30px 30px;
      color: white;
    }

    .name-age {
      font-size: 48px;
      font-weight: 700;
      margin-bottom: 8px;
      text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
      letter-spacing: -0.5px;
    }

    .info-row {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      font-size: 18px;
      color: rgba(255, 255, 255, 0.9);
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
    }

    .info-label {
      font-weight: 600;
      margin-right: 8px;
      color: rgba(255, 255, 255, 0.7);
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 1px;
    }

    .info-value {
      font-weight: 500;
    }

    .section {
      margin-bottom: 20px;
    }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 10px;
    }

    .interests-container {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .interest-tag {
      background: rgba(255, 255, 255, 0.2);
      backdrop-filter: blur(10px);
      padding: 8px 16px;
      border-radius: 20px;
      font-size: 14px;
      font-weight: 500;
      border: 1px solid rgba(255, 255, 255, 0.3);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    }

    .schools {
      font-size: 16px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.95);
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
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
  </style>
</head>
<body>
  <div class="profile-card">
    <div class="photo-container">
      ${photo ?
        `<img src="${photoUrl}" alt="${name}" class="photo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
         <div class="placeholder-photo" style="display:none;">📷</div>` :
        `<div class="placeholder-photo">📷</div>`
      }
    </div>

    <div class="overlay">
      <div class="name-age">${name}, ${age}</div>

      <div class="section">
        <div class="info-row">
          <span class="info-label">Gender</span>
          <span class="info-value">${gender}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Looking for</span>
          <span class="info-value">${interested_in}</span>
        </div>
      </div>

      <div class="section">
        <div class="section-title">Education</div>
        <div class="schools">${schoolsDisplay}</div>
      </div>

      <div class="section">
        <div class="section-title">Interests</div>
        <div class="interests-container">
          ${interestsDisplay}
        </div>
      </div>
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Render profile card to image
 * @param {Object} profileData - Profile schema data
 * @returns {Promise<string>} Path to generated image file
 */
async function renderProfileCard(profileData) {
  let browser = null;

  try {
    // Log photo field details
    const photoValue = profileData.photo || '';

    logger.info('Starting profile card rendering', {
      profileId: profileData.id || 'unknown',
      name: profileData.name,
      photoUrl: photoValue.substring(0, 100),
      hasPhoto: !!photoValue
    });

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `profile_card_${timestamp}.png`;

    // Generate HTML
    const html = generateProfileHTML(profileData);

    // Launch Puppeteer
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set viewport to match card size
    await page.setViewport({
      width: 600,
      height: 800,
      deviceScaleFactor: 2 // For retina quality
    });

    // Set content
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });

    // Take screenshot to buffer
    const screenshotBuffer = await page.screenshot({
      type: 'png',
      omitBackground: false
    });

    await browser.close();
    browser = null;

    logger.info('Profile card screenshot captured', {
      profileId: profileData.id || 'unknown',
      bufferSize: screenshotBuffer.length
    });

    // Upload to R2
    const sessionId = profileData.id || `profile_${timestamp}`;
    const r2Url = await uploadToR2(
      screenshotBuffer,
      filename,
      'image/png',
      sessionId
    );

    logger.info('Profile card uploaded to R2 successfully', {
      profileId: profileData.id || 'unknown',
      r2Url: r2Url,
      filesize: screenshotBuffer.length
    });

    // Return R2 URL
    return r2Url;

  } catch (error) {
    logger.error('Failed to render profile card', {
      error: error.message,
      stack: error.stack,
      profileData: JSON.stringify(profileData)
    });

    if (browser) {
      await browser.close();
    }

    throw new Error(`Profile card rendering failed: ${error.message}`);
  }
}

/**
 * Delete profile card image from R2
 * @param {string} imageUrl - R2 URL of the image
 * @returns {Promise<boolean>} True if deleted successfully
 */
async function deleteProfileCard(imageUrl) {
  try {
    const { deleteFromR2 } = require('../utils/r2-storage');

    // Check if it's an R2 URL
    if (imageUrl && imageUrl.startsWith('https://')) {
      const success = await deleteFromR2(imageUrl);
      if (success) {
        logger.info('Profile card deleted from R2', { imageUrl });
        return true;
      }
    }

    logger.warn('Profile card deletion skipped - not an R2 URL', { imageUrl });
    return false;
  } catch (error) {
    logger.error('Failed to delete profile card from R2', {
      imageUrl,
      error: error.message
    });
    return false;
  }
}

module.exports = {
  renderProfileCard,
  generateProfileHTML,
  deleteProfileCard
};
