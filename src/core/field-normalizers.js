const logger = require('../utils/logger');
const {
  INTEREST_CATEGORIES,
  GENDER_OPTIONS,
  ORIENTATION_OPTIONS,
  RELATIONSHIP_INTENT_OPTIONS,
  EDUCATION_LEVEL_OPTIONS
} = require('./profile-options');

const GENDER_SYNONYMS = {
  male: 'Male',
  man: 'Male',
  m: 'Male',
  guy: 'Male',
  boy: 'Male',
  female: 'Female',
  woman: 'Female',
  f: 'Female',
  girl: 'Female',
  gal: 'Female',
  nb: 'Non-binary',
  nonbinary: 'Non-binary',
  'non-binary': 'Non-binary',
  enby: 'Non-binary',
  other: 'Other'
};

const ORIENTATION_SYNONYMS = {
  straight: 'Straight',
  'hetero': 'Straight',
  'heterosexual': 'Straight',
  gay: 'Gay',
  lesbian: 'Lesbian',
  bi: 'Bisexual',
  bisexual: 'Bisexual',
  pan: 'Pansexual',
  pansexual: 'Pansexual',
  ace: 'Asexual',
  asexual: 'Asexual',
  queer: 'Queer',
  questioning: 'Questioning'
};

const INTERESTED_IN_SYNONYMS = {
  men: 'Male',
  guys: 'Male',
  dudes: 'Male',
  women: 'Female',
  girls: 'Female',
  ladies: 'Female',
  nb: 'Non-binary',
  everyone: 'Everyone',
  anyone: 'Everyone',
  people: 'Everyone',
  all: 'Everyone'
};

const RELATIONSHIP_SYNONYMS = {
  serious: 'Long-term only',
  commitment: 'Long-term only',
  committed: 'Long-term only',
  'long term': 'Long-term only',
  'long-term': 'Long-term only',
  'long term mostly': 'Long-term, open to short',
  'mostly long term': 'Long-term, open to short',
  'mostly serious': 'Long-term, open to short',
  casual: 'Short-term, open to long',
  flexible: 'Short-term, open to long',
  exploring: 'Still figuring it out',
  unsure: 'Still figuring it out',
  'figuring it out': 'Still figuring it out'
};

const EDUCATION_SYNONYMS = {
  'highschool': 'High School',
  'high school': 'High School',
  'hs': 'High School',
  'college': 'In College',
  'undergrad': 'In College',
  'associates': 'Associate Degree',
  "associate's": 'Associate Degree',
  "associate": 'Associate Degree',
  'bachelor': "Bachelor's Degree",
  "bachelors": "Bachelor's Degree",
  "ba": "Bachelor's Degree",
  "bs": "Bachelor's Degree",
  "masters": "Master's Degree",
  "ms": "Master's Degree",
  "ma": "Master's Degree",
  'graduate': "Master's Degree",
  'phd': 'PhD',
  'doctorate': 'PhD',
  'trade': 'Trade School',
  'trade school': 'Trade School',
  'bootcamp': 'Trade School'
};

const NUMBER_WORDS = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90
};

function normalizeWhitespace(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function matchOption(value, options, synonyms = {}) {
  if (!value || typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;

  const directOption = options.find(opt => opt.toLowerCase() === normalized);
  if (directOption) return directOption;

  if (synonyms[normalized]) {
    return synonyms[normalized];
  }

  // Try partial match (e.g., "long term" inside longer sentence)
  for (const [key, mapped] of Object.entries(synonyms)) {
    if (normalized.includes(key)) {
      return mapped;
    }
  }

  return null;
}

function parseNumberFromText(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;

  const digitsMatch = value.match(/\d{1,3}/);
  if (digitsMatch) {
    return parseInt(digitsMatch[0], 10);
  }

  const words = value.toLowerCase().split(/[-\s]+/).filter(Boolean);
  if (words.length === 0) return null;

  let total = 0;
  let current = 0;

  for (const word of words) {
    if (NUMBER_WORDS[word] !== undefined) {
      const num = NUMBER_WORDS[word];
      if (num >= 20) {
        current += num;
      } else {
        current += num;
      }
    } else if (word === 'hundred') {
      current *= 100;
    } else {
      return null;
    }
  }

  total += current;
  return total || null;
}

function formatImperialHeight(feet, inches) {
  const clampedInches = Math.max(0, Math.min(11, inches));
  return `${feet}'${clampedInches}"`;
}

function normalizeHeight(value) {
  if (!value) return value;

  if (typeof value === 'number') {
    // Assume inches, convert to feet'" format
    const feet = Math.floor(value / 12);
    const inches = Math.round(value % 12);
    return formatImperialHeight(feet, inches);
  }

  if (typeof value !== 'string') return value;

  const text = value.trim().toLowerCase();
  if (!text) return value;

  // Handle centimeters
  const cmMatch = text.match(/(\d{2,3})\s*cm/);
  if (cmMatch) {
    return `${cmMatch[1]}cm`;
  }

  // Handle feet and inches expressions
  const feetInchRegex = /(?:(\d+)\s*(?:ft|foot|feet|'))?\s*(?:(\d{1,2})\s*(?:in|inch|"))?/;
  const fiMatch = text.match(feetInchRegex);
  if (fiMatch && (fiMatch[1] || fiMatch[2])) {
    const feet = parseInt(fiMatch[1] || '0', 10);
    const inches = parseInt(fiMatch[2] || '0', 10);
    if (!isNaN(feet) || !isNaN(inches)) {
      return formatImperialHeight(feet || 0, inches || 0);
    }
  }

  // Handle decimal feet (e.g., 5.4, 5.08)
  const decimalMatch = text.match(/(\d)\s*\.\s*(\d{1,2})/);
  if (decimalMatch) {
    const feet = parseInt(decimalMatch[1], 10);
    const decimal = parseInt(decimalMatch[2], 10);
    if (!isNaN(feet) && !isNaN(decimal)) {
      const inches = decimal <= 11 ? decimal : Math.round((decimal / 100) * 12);
      return formatImperialHeight(feet, inches);
    }
  }

  // Standalone numbers like "64"
  const numeric = parseInt(text, 10);
  if (!isNaN(numeric)) {
    if (numeric > 100) {
      return `${numeric}cm`;
    }
    const feet = Math.floor(numeric / 12);
    const inches = numeric % 12;
    if (feet > 0) {
      return formatImperialHeight(feet, inches);
    }
  }

  return value.trim();
}

function normalizeSchools(value) {
  if (!value) return value;
  const toTitle = (text) => text.split(' ').map(part => part ? part[0].toUpperCase() + part.slice(1) : '').join(' ').trim();

  if (typeof value === 'string') {
    return [toTitle(value.trim())].filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value
      .map(item => typeof item === 'string' ? toTitle(item.trim()) : item)
      .filter(Boolean);
  }

  return value;
}

function normalizeInterests(value) {
  if (!value) return value;

  // TODO: Consider LLM-based interest mapping for better categorization
  // Option 1: Use LLM to map user interests to predefined INTEREST_CATEGORIES
  //   - Benefits: More accurate mapping, handles creative/unusual interests
  //   - Implementation: Call LLM API with user interest + category list
  // Option 2: Use LLM for real-time content moderation
  //   - Benefits: Filter inappropriate interests, suggest better phrasing
  //   - Implementation: LLM validates interest and suggests changes if needed
  // For now: Accept any interest text without strict category mapping

  if (typeof value === 'string') {
    // Pass through user input without strict category mapping
    return [value.trim()].filter(Boolean);
  }

  if (Array.isArray(value)) {
    // Pass through all interests, just trim whitespace
    return value
      .map(entry => typeof entry === 'string' ? entry.trim() : entry)
      .filter(Boolean);
  }

  return value;
}

function normalizePrompts(value) {
  if (!value) return value;

  if (Array.isArray(value)) {
    return value.map(prompt => {
      if (!prompt || typeof prompt !== 'object') return prompt;
      const question = typeof prompt.question === 'string' ? prompt.question.trim() : prompt.question;
      const answer = typeof prompt.answer === 'string' ? prompt.answer.trim() : prompt.answer;
      return { ...prompt, question, answer };
    });
  }

  return value;
}

function normalizeAge(value) {
  const parsed = parseNumberFromText(value);
  return parsed !== null ? parsed : value;
}

function normalizeEducationLevel(value) {
  return matchOption(value, EDUCATION_LEVEL_OPTIONS, EDUCATION_SYNONYMS) || normalizeWhitespace(value);
}

function normalizeGender(value) {
  return matchOption(value, GENDER_OPTIONS, GENDER_SYNONYMS) || normalizeWhitespace(value);
}

function normalizeOrientation(value) {
  return matchOption(value, ORIENTATION_OPTIONS, ORIENTATION_SYNONYMS) || normalizeWhitespace(value);
}

function normalizeInterestedIn(value) {
  return matchOption(value, [...GENDER_OPTIONS, 'Everyone'], { ...GENDER_SYNONYMS, ...INTERESTED_IN_SYNONYMS }) || normalizeWhitespace(value);
}

function normalizeRelationshipIntent(value) {
  return matchOption(value, RELATIONSHIP_INTENT_OPTIONS, RELATIONSHIP_SYNONYMS) || normalizeWhitespace(value);
}

function mapInterestToCategory(interestText) {
  if (!interestText || typeof interestText !== 'string') return null;

  const textLower = interestText.toLowerCase();

  for (const category of INTEREST_CATEGORIES) {
    if (textLower === category.toLowerCase()) {
      return category;
    }
  }

  const categoryKeywords = {
    'Sports & Athletics': ['sport', 'gym', 'fitness', 'running', 'basketball', 'football', 'soccer', 'tennis', 'swim'],
    'Music': ['music', 'concert', 'band', 'singing', 'instrument', 'piano', 'guitar'],
    'Pop Culture': ['pop culture', 'celeb', 'celebrity', 'trending'],
    'Outdoor & Nature': ['outdoor', 'nature', 'hiking', 'camping', 'beach', 'mountain'],
    'Movies & TV': ['movie', 'film', 'tv', 'television', 'netflix', 'cinema', 'show'],
    'Nightlife & Social': ['nightlife', 'bar', 'club', 'party', 'social', 'dancing'],
    'Beauty & Fashion': ['fashion', 'beauty', 'makeup', 'style', 'clothes'],
    'Hobbies & Crafts': ['hobby', 'craft', 'diy', 'knit', 'sew'],
    'Arts & Creativity': ['art', 'creative', 'painting', 'drawing', 'design', 'photo', 'photography'],
    'Performing Arts': ['theater', 'theatre', 'acting', 'drama', 'dance'],
    'Gaming': ['gaming', 'game', 'video game', 'esports', 'playstation', 'xbox', 'pc'],
    'Technology': ['tech', 'technology', 'coding', 'programming', 'computer', 'gadget'],
    'Food & Dining': ['food', 'cooking', 'dining', 'restaurant', 'cuisine', 'eating'],
    'Travel & Adventure': ['travel', 'adventure', 'exploring', 'trip', 'vacation', 'road trip', 'journey'],
    'Social Causes & Activism': ['activism', 'volunteer', 'charity', 'cause', 'social justice'],
    'Fitness & Wellness': ['wellness', 'yoga', 'meditation', 'health', 'workout'],
    'Lifestyle': ['lifestyle', 'routine', 'daily life'],
    'Business & Career': ['business', 'career', 'work', 'entrepreneur', 'startup']
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    if (keywords.some(keyword => textLower.includes(keyword))) {
      return category;
    }
  }

  return null;
}

function normalizeFieldValue(fieldName, rawValue) {
  let normalizedValue = rawValue;
  let changed = false;

  const apply = (value) => {
    if (value === undefined || value === null) {
      return value;
    }
    let nextValue = value;
    switch (fieldName) {
      case 'age':
        nextValue = normalizeAge(value);
        break;
      case 'height':
        nextValue = normalizeHeight(value);
        break;
      case 'gender':
        nextValue = normalizeGender(value);
        break;
      case 'sexual_orientation':
        nextValue = normalizeOrientation(value);
        break;
      case 'relationship_intent':
        nextValue = normalizeRelationshipIntent(value);
        break;
      case 'education_level':
        nextValue = normalizeEducationLevel(value);
        break;
      case 'interested_in':
        nextValue = normalizeInterestedIn(value);
        break;
      case 'schools':
        nextValue = normalizeSchools(value);
        break;
      case 'interests':
        nextValue = normalizeInterests(value);
        break;
      case 'prompts':
        nextValue = normalizePrompts(value);
        break;
      case 'bio':
      case 'name':
      case 'photo':
      case 'major':
        nextValue = normalizeWhitespace(value);
        break;
      default:
        break;
    }
    return nextValue;
  };

  const finalValue = apply(rawValue);
  if (finalValue !== rawValue) {
    changed = true;
    logger.debug('Normalized profile field value', {
      field: fieldName,
      original: rawValue,
      normalized: finalValue
    });
  }

  normalizedValue = finalValue;

  return {
    value: normalizedValue,
    changed
  };
}

module.exports = {
  normalizeFieldValue,
  mapInterestToCategory
};

