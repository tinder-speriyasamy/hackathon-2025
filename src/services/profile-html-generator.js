/**
 * Profile HTML Generator
 * Generates interactive HTML profile pages with photo carousel
 * Extracted from profile-renderer.js for reuse
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
 * Generate interactive HTML for profile page with photo carousel
 * @param {Object} profileData - Profile schema data
 * @param {Array<string>} allPhotos - Array of all photo URLs (from session.data.photos)
 * @returns {string} Complete HTML document
 */
function generateInteractiveProfileHTML(profileData, allPhotos = []) {
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

  // Use all photos from session, with primary photo first
  // Build photos array: prioritize allPhotos parameter, fallback to photo field
  const photos = [...allPhotos];
  if (photos.length === 0 && photo) {
    photos.push(photo); // Fallback to single photo field if no photos array
  }

  // If still no photos, use placeholder
  const hasPhotos = photos.length > 0;
  const photoCount = photos.length;

  logger.debug('Generating interactive profile HTML', {
    name,
    photoCount,
    hasPhotos,
    photoUrls: photos
  });

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

  // Build info badges
  const infoBadges = [];
  if (height) infoBadges.push(`<div class="info-badge"><span class="badge-icon">📏</span>${escapeHtml(height)}</div>`);
  if (sexual_orientation) infoBadges.push(`<div class="info-badge"><span class="badge-icon">✨</span>${escapeHtml(sexual_orientation)}</div>`);
  if (relationship_intent) infoBadges.push(`<div class="info-badge"><span class="badge-icon">💫</span>${escapeHtml(relationship_intent)}</div>`);
  if (pets && pets.length > 0) infoBadges.push(`<div class="info-badge"><span class="badge-icon">🐾</span>${escapeHtml(pets.join(', '))}</div>`);

  const infoBadgesDisplay = infoBadges.join('');

  // Generate Open Graph meta tags
  const ogTitle = `${escapeHtml(name)}, ${escapeHtml(age)}`;
  const ogDescription = educationDisplay || `${escapeHtml(name)}'s profile on mchd`;
  const ogImage = hasPhotos ? photos[0] : '';

  // Generate photo carousel HTML
  const photoCarouselHTML = hasPhotos ? `
    <div class="photo-carousel">
      ${photos.map((photoUrl, index) => `
        <div class="photo-slide ${index === 0 ? 'active' : ''}" data-index="${index}">
          <img src="${photoUrl}" alt="${escapeHtml(name)}" class="photo"
               onerror="this.style.display='none';this.parentElement.querySelector('.placeholder-photo').style.display='flex';" />
          <div class="placeholder-photo" style="display:none;">📷</div>
        </div>
      `).join('')}

      <!-- Navigation tap zones -->
      <div class="nav-zone nav-prev" onclick="navigatePhotos(-1)"></div>
      <div class="nav-zone nav-next" onclick="navigatePhotos(1)"></div>

      <!-- Photo indicators (dots) -->
      ${photoCount > 1 ? `
      <div class="photo-indicators">
        ${photos.map((_, index) => `
          <div class="indicator ${index === 0 ? 'active' : ''}" data-index="${index}" onclick="goToPhoto(${index})"></div>
        `).join('')}
      </div>
      ` : ''}
    </div>
  ` : `
    <div class="photo-carousel">
      <div class="photo-slide active">
        <div class="placeholder-photo">📷</div>
      </div>
    </div>
  `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${ogTitle}</title>

  <!-- Open Graph Meta Tags for WhatsApp/Social Sharing -->
  <meta property="og:title" content="${ogTitle}" />
  <meta property="og:description" content="${ogDescription}" />
  ${ogImage ? `<meta property="og:image" content="${ogImage}" />` : ''}
  <meta property="og:type" content="profile" />
  <meta property="og:site_name" content="mchd" />

  <!-- Twitter Card Meta Tags -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${ogTitle}" />
  <meta name="twitter:description" content="${ogDescription}" />
  ${ogImage ? `<meta name="twitter:image" content="${ogImage}" />` : ''}

  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&display=swap" rel="stylesheet">

  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      height: 100%;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background: #000;
      -webkit-tap-highlight-color: transparent;
    }

    .profile-card {
      width: 100%;
      height: 100%;
      position: relative;
      overflow-x: hidden;
      overflow-y: auto;
      background: #000;
      -webkit-overflow-scrolling: touch;
    }

    .brand-header {
      position: fixed;
      top: 24px;
      left: 24px;
      z-index: 100;
      font-family: 'Space Grotesk', sans-serif;
      font-size: 32px;
      font-weight: 700;
      letter-spacing: -1px;
      background: linear-gradient(135deg, #FF6B9D 0%, #C06BFF 50%, #4ECDC4 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      padding: 12px 24px;
      border-radius: 24px;
      backdrop-filter: blur(10px);
      background-color: rgba(0, 0, 0, 0.3);
      border: 1px solid rgba(255, 255, 255, 0.15);
    }

    .photo-carousel {
      width: 100%;
      height: 100vh;
      position: relative;
      overflow: hidden;
    }

    .photo-slide {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      opacity: 0;
      transform: translateX(100%);
      transition: opacity 0.3s ease, transform 0.3s ease;
      pointer-events: none;
    }

    .photo-slide.active {
      opacity: 1;
      transform: translateX(0);
      pointer-events: auto;
    }

    .photo-slide.prev {
      transform: translateX(-100%);
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

    /* Navigation zones */
    .nav-zone {
      position: absolute;
      top: 0;
      bottom: 200px;
      width: 33%;
      z-index: 20;
      cursor: pointer;
    }

    .nav-prev {
      left: 0;
    }

    .nav-next {
      right: 0;
      width: 67%;
    }

    /* Photo indicators (dots) */
    .photo-indicators {
      position: absolute;
      top: 24px;
      right: 24px;
      display: flex;
      gap: 8px;
      z-index: 30;
      background: rgba(0, 0, 0, 0.3);
      padding: 8px 16px;
      border-radius: 20px;
      backdrop-filter: blur(10px);
    }

    .indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.4);
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .indicator.active {
      width: 24px;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.9);
    }

    .photo-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      height: 80%;
      background: linear-gradient(to top,
        rgba(0, 0, 0, 0.95) 0%,
        rgba(0, 0, 0, 0.9) 15%,
        rgba(0, 0, 0, 0.75) 30%,
        rgba(0, 0, 0, 0.5) 50%,
        rgba(0, 0, 0, 0.2) 70%,
        rgba(0, 0, 0, 0) 100%
      );
      pointer-events: none;
      z-index: 10;
    }

    .content-overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 20;
      padding: 20px 20px 30px 20px;
      color: white;
      pointer-events: none;
      max-height: 35vh;
      overflow: visible;
    }

    .content-overlay > * {
      pointer-events: auto;
    }

    .name-age {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 6px;
      text-shadow: 0 2px 15px rgba(0, 0, 0, 0.9);
      letter-spacing: -0.5px;
      line-height: 1.1;
    }

    .education-badge {
      display: inline-flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.15);
      backdrop-filter: blur(10px);
      padding: 6px 12px;
      border-radius: 16px;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid rgba(255, 255, 255, 0.2);
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
      margin-bottom: 10px;
    }

    ${bio ? `
    .bio-section {
      margin-top: 10px;
      margin-bottom: 10px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.1);
    }

    .bio-text {
      font-size: 13px;
      line-height: 1.4;
      color: rgba(255, 255, 255, 0.95);
      font-weight: 400;
    }` : ''}

    ${promptsDisplay ? `
    .prompts-section {
      margin-bottom: 12px;
    }

    .prompt-card {
      margin-bottom: 10px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.03);
      border-radius: 12px;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .prompt-question {
      font-size: 11px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 6px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .prompt-answer {
      font-size: 13px;
      line-height: 1.4;
      color: rgba(255, 255, 255, 0.95);
      font-weight: 400;
    }` : ''}

    ${infoBadgesDisplay ? `
    .info-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
      margin-bottom: 10px;
    }

    .info-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: rgba(255, 255, 255, 0.08);
      padding: 6px 10px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.95);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }

    .badge-icon {
      font-size: 14px;
    }` : ''}

    ${interestsDisplay ? `
    .interests-section {
      margin-top: 10px;
    }

    .section-title {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 8px;
    }

    .interests-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .interest-tag {
      background: rgba(255, 255, 255, 0.08);
      padding: 6px 10px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      color: rgba(255, 255, 255, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }` : ''}
  </style>
</head>
<body>
  <div class="profile-card">
    <!-- Photo Carousel -->
    ${photoCarouselHTML}

    <!-- Black to Transparent Gradient Overlay -->
    <div class="photo-overlay"></div>

    <!-- mchd Brand Header -->
    <div class="brand-header">mchd</div>

    <!-- Content Overlay (all content on photo) -->
    <div class="content-overlay">
      <div class="name-age">${escapeHtml(name)}, ${escapeHtml(age)}</div>
      ${educationDisplay ? `<div class="education-badge">${educationDisplay}</div>` : ''}

      ${bio ? `
      <div class="bio-section">
        <div class="bio-text">${escapeHtml(bio)}</div>
      </div>` : ''}

      ${infoBadgesDisplay ? `
      <div class="info-badges">
        ${infoBadgesDisplay}
      </div>` : ''}

      ${promptsDisplay ? `
      <div class="prompts-section">
        ${promptsDisplay}
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

  <script>
    let currentPhotoIndex = 0;
    const totalPhotos = ${photoCount};
    let touchStartX = 0;
    let touchEndX = 0;

    function navigatePhotos(direction) {
      if (totalPhotos <= 1) return;

      const slides = document.querySelectorAll('.photo-slide');
      const indicators = document.querySelectorAll('.indicator');

      // Remove active class from current
      slides[currentPhotoIndex].classList.remove('active');
      if (indicators.length > 0) {
        indicators[currentPhotoIndex].classList.remove('active');
      }

      // Calculate new index
      currentPhotoIndex += direction;
      if (currentPhotoIndex < 0) currentPhotoIndex = totalPhotos - 1;
      if (currentPhotoIndex >= totalPhotos) currentPhotoIndex = 0;

      // Add active class to new
      slides[currentPhotoIndex].classList.add('active');
      if (indicators.length > 0) {
        indicators[currentPhotoIndex].classList.add('active');
      }
    }

    function goToPhoto(index) {
      if (totalPhotos <= 1 || index === currentPhotoIndex) return;

      const slides = document.querySelectorAll('.photo-slide');
      const indicators = document.querySelectorAll('.indicator');

      // Remove active class from current
      slides[currentPhotoIndex].classList.remove('active');
      if (indicators.length > 0) {
        indicators[currentPhotoIndex].classList.remove('active');
      }

      // Set new index
      currentPhotoIndex = index;

      // Add active class to new
      slides[currentPhotoIndex].classList.add('active');
      if (indicators.length > 0) {
        indicators[currentPhotoIndex].classList.add('active');
      }
    }

    // Touch/swipe support
    const carousel = document.querySelector('.photo-carousel');
    if (carousel && totalPhotos > 1) {
      carousel.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
      }, { passive: true });

      carousel.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        handleSwipe();
      }, { passive: true });
    }

    function handleSwipe() {
      const swipeThreshold = 50;
      const diff = touchStartX - touchEndX;

      if (Math.abs(diff) > swipeThreshold) {
        if (diff > 0) {
          // Swiped left - next photo
          navigatePhotos(1);
        } else {
          // Swiped right - previous photo
          navigatePhotos(-1);
        }
      }
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') {
        navigatePhotos(-1);
      } else if (e.key === 'ArrowRight') {
        navigatePhotos(1);
      }
    });
  </script>
</body>
</html>
  `;
}

module.exports = {
  generateInteractiveProfileHTML,
  escapeHtml
};
