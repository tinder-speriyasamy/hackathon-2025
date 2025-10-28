/**
 * Profile Schema Definition
 * Defines required fields and validation for dating profile creation
 */

/**
 * Interest categories for profile
 */
const INTEREST_CATEGORIES = [
  'Sports & Athletics',
  'Music',
  'Pop Culture',
  'Outdoor & Nature',
  'Movies & TV',
  'Nightlife & Social',
  'Beauty & Fashion',
  'Hobbies & Crafts',
  'Arts & Creativity',
  'Performing Arts',
  'Gaming',
  'Technology',
  'Food & Dining',
  'Travel & Adventure',
  'Social Causes & Activism',
  'Fitness & Wellness',
  'Lifestyle',
  'Business & Career'
];

/**
 * Gender options
 */
const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Other'];

/**
 * Profile schema definition with required fields
 */
const PROFILE_SCHEMA = {
  name: {
    type: 'string',
    required: true,
    description: 'User\'s first name',
    validate: (value) => {
      if (!value || typeof value !== 'string') return false;
      return value.trim().length > 0 && value.trim().length <= 50;
    }
  },
  age: {
    type: 'number',
    required: true,
    description: 'User\'s age',
    validate: (value) => {
      if (typeof value !== 'number') return false;
      return value >= 18 && value <= 100;
    }
  },
  gender: {
    type: 'string',
    required: true,
    description: 'User\'s gender identity',
    options: GENDER_OPTIONS,
    validate: (value) => {
      if (!value || typeof value !== 'string') return false;
      return GENDER_OPTIONS.some(opt => opt.toLowerCase() === value.toLowerCase());
    }
  },
  photo: {
    type: 'string',
    required: true,
    description: 'Primary profile photo URL/path',
    validate: (value) => {
      if (!value || typeof value !== 'string') return false;
      return value.trim().length > 0;
    }
  },
  schools: {
    type: 'array',
    required: true,
    description: 'Educational institutions attended',
    validate: (value) => {
      if (!Array.isArray(value)) return false;
      return value.length > 0 && value.every(school =>
        typeof school === 'string' && school.trim().length > 0
      );
    }
  },
  interested_in: {
    type: 'string',
    required: true,
    description: 'Gender(s) user is interested in dating',
    options: [...GENDER_OPTIONS, 'Everyone'],
    validate: (value) => {
      if (!value || typeof value !== 'string') return false;
      const validOptions = [...GENDER_OPTIONS, 'Everyone'];
      return validOptions.some(opt => opt.toLowerCase() === value.toLowerCase());
    }
  },
  interests: {
    type: 'array',
    required: true,
    description: 'User\'s interests (minimum 2)',
    categories: INTEREST_CATEGORIES,
    minCategories: 2,
    validate: (value) => {
      // Simple validation: just check it's an array with at least 2 non-empty strings
      if (!Array.isArray(value)) return false;
      if (value.length < 2) return false;

      // Check that all items are non-empty strings
      return value.every(interest =>
        typeof interest === 'string' && interest.trim().length > 0
      );
    }
  }
};

/**
 * Initialize empty profile schema with default values
 * @returns {Object} Empty profile schema
 */
function initializeProfileSchema() {
  return {
    name: null,
    age: null,
    gender: null,
    photo: null,
    schools: [],
    interested_in: null,
    interests: []
  };
}

/**
 * Check if a specific field is filled
 * @param {Object} profileSchema - Current profile schema data
 * @param {string} fieldName - Field to check
 * @returns {boolean} True if field is filled and valid
 */
function isFieldFilled(profileSchema, fieldName) {
  if (!PROFILE_SCHEMA[fieldName]) return false;

  const fieldDef = PROFILE_SCHEMA[fieldName];
  const value = profileSchema[fieldName];

  // Check if field exists and is not null/undefined
  if (value === null || value === undefined) return false;

  // For arrays, check if not empty
  if (fieldDef.type === 'array' && Array.isArray(value) && value.length === 0) {
    return false;
  }

  // Validate using field's validation function
  return fieldDef.validate(value);
}

/**
 * Get list of missing required fields
 * @param {Object} profileSchema - Current profile schema data
 * @returns {string[]} Array of missing field names
 */
function getMissingFields(profileSchema) {
  const missing = [];

  for (const [fieldName, fieldDef] of Object.entries(PROFILE_SCHEMA)) {
    if (fieldDef.required && !isFieldFilled(profileSchema, fieldName)) {
      missing.push(fieldName);
    }
  }

  return missing;
}

/**
 * Check if profile schema is complete
 * @param {Object} profileSchema - Current profile schema data
 * @returns {boolean} True if all required fields are filled
 */
function isSchemaComplete(profileSchema) {
  return getMissingFields(profileSchema).length === 0;
}

/**
 * Get completion percentage
 * @param {Object} profileSchema - Current profile schema data
 * @returns {number} Percentage complete (0-100)
 */
function getCompletionPercentage(profileSchema) {
  const totalRequired = Object.values(PROFILE_SCHEMA).filter(f => f.required).length;
  const filled = totalRequired - getMissingFields(profileSchema).length;
  return Math.round((filled / totalRequired) * 100);
}

/**
 * Get human-readable field name
 * @param {string} fieldName - Field name
 * @returns {string} Human-readable name
 */
function getFieldDisplayName(fieldName) {
  const names = {
    name: 'name',
    age: 'age',
    gender: 'gender',
    photo: 'profile photo',
    schools: 'school(s)',
    interested_in: 'who you\'re interested in',
    interests: 'interests'
  };
  return names[fieldName] || fieldName;
}

/**
 * Validate and update a field value
 * @param {Object} profileSchema - Current profile schema data
 * @param {string} fieldName - Field to update
 * @param {any} value - New value
 * @returns {Object} Result with success status and message
 */
function updateField(profileSchema, fieldName, value) {
  if (!PROFILE_SCHEMA[fieldName]) {
    return {
      success: false,
      error: `Unknown field: ${fieldName}`
    };
  }

  const fieldDef = PROFILE_SCHEMA[fieldName];
  let processedValue = value;

  // Special handling for age field - parse strings to numbers
  if (fieldName === 'age') {
    if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      if (isNaN(parsed)) {
        return {
          success: false,
          error: `Invalid age value: "${value}" - must be a number`
        };
      }
      processedValue = parsed;
    } else if (typeof value === 'number') {
      processedValue = value;
    } else {
      return {
        success: false,
        error: `Invalid age value type: expected number or string, got ${typeof value}`
      };
    }
  }

  // Validate value
  if (!fieldDef.validate(processedValue)) {
    return {
      success: false,
      error: `Invalid value for ${getFieldDisplayName(fieldName)}`
    };
  }

  // Update value
  profileSchema[fieldName] = processedValue;

  return {
    success: true,
    message: `Updated ${getFieldDisplayName(fieldName)}`
  };
}

/**
 * Map natural language interest to category
 * @param {string} interestText - Natural language interest description
 * @returns {string|null} Matched category or null
 */
function mapInterestToCategory(interestText) {
  if (!interestText || typeof interestText !== 'string') return null;

  const textLower = interestText.toLowerCase();

  // Direct match
  for (const category of INTEREST_CATEGORIES) {
    if (textLower.includes(category.toLowerCase())) {
      return category;
    }
  }

  // Keyword matching
  const categoryKeywords = {
    'Sports & Athletics': ['sports', 'athletic', 'gym', 'fitness', 'running', 'soccer', 'basketball', 'tennis', 'swimming'],
    'Music': ['music', 'concerts', 'bands', 'singing', 'instruments', 'piano', 'guitar'],
    'Pop Culture': ['movies', 'tv', 'celebrity', 'pop', 'culture', 'trending'],
    'Outdoor & Nature': ['outdoor', 'nature', 'hiking', 'camping', 'beach', 'mountains', 'outdoors'],
    'Movies & TV': ['movies', 'films', 'tv', 'television', 'shows', 'netflix', 'cinema', 'watching'],
    'Nightlife & Social': ['nightlife', 'bars', 'clubs', 'parties', 'social', 'dancing'],
    'Beauty & Fashion': ['fashion', 'beauty', 'makeup', 'style', 'clothes', 'shopping'],
    'Hobbies & Crafts': ['hobbies', 'crafts', 'diy', 'knitting', 'sewing', 'crafting'],
    'Arts & Creativity': ['art', 'creative', 'painting', 'drawing', 'design', 'photography'],
    'Performing Arts': ['theater', 'theatre', 'acting', 'drama', 'dance', 'performance'],
    'Gaming': ['gaming', 'games', 'video games', 'esports', 'playstation', 'xbox', 'pc'],
    'Technology': ['tech', 'technology', 'coding', 'programming', 'computers', 'gadgets'],
    'Food & Dining': ['food', 'cooking', 'dining', 'restaurants', 'cuisine', 'eating'],
    'Travel & Adventure': ['travel', 'adventure', 'exploring', 'trips', 'vacation', 'backpacking', 'driving', 'road trips', 'cars', 'motorcycles', 'biking'],
    'Social Causes & Activism': ['activism', 'volunteering', 'charity', 'causes', 'social justice'],
    'Fitness & Wellness': ['fitness', 'wellness', 'yoga', 'meditation', 'health', 'workout'],
    'Lifestyle': ['lifestyle', 'living', 'daily life', 'routine'],
    'Business & Career': ['business', 'career', 'work', 'entrepreneurship', 'professional']
  };

  for (const [category, keywords] of Object.entries(categoryKeywords)) {
    for (const keyword of keywords) {
      if (textLower.includes(keyword)) {
        return category;
      }
    }
  }

  return null;
}

module.exports = {
  PROFILE_SCHEMA,
  INTEREST_CATEGORIES,
  GENDER_OPTIONS,
  initializeProfileSchema,
  isFieldFilled,
  getMissingFields,
  isSchemaComplete,
  getCompletionPercentage,
  getFieldDisplayName,
  updateField,
  mapInterestToCategory
};
