/**
 * Profile Schema Definition
 * Defines required fields and validation for dating profile creation
 */

const {
  INTEREST_CATEGORIES,
  GENDER_OPTIONS,
  ORIENTATION_OPTIONS,
  RELATIONSHIP_INTENT_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  PROFILE_PROMPTS,
  PET_TYPES
} = require('./profile-options');

const { normalizeFieldValue, mapInterestToCategory } = require('./field-normalizers');
const logger = require('../utils/logger');

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
  },
  sexual_orientation: {
    type: 'string',
    required: true,
    description: 'User\'s sexual orientation',
    options: ORIENTATION_OPTIONS,
    validate: (value) => {
      if (!value || typeof value !== 'string') return false;
      return value.trim().length > 0;
    }
  },
  relationship_intent: {
    type: 'string',
    required: true,
    description: 'What user is looking for in relationships',
    options: RELATIONSHIP_INTENT_OPTIONS,
    validate: (value) => {
      if (!value || typeof value !== 'string') return false;
      return RELATIONSHIP_INTENT_OPTIONS.some(opt =>
        opt.toLowerCase() === value.toLowerCase()
      );
    }
  },
  height: {
    type: 'string',
    required: true,
    description: 'User\'s height (e.g., "5\'6\"" or "170cm")',
    validate: (value) => {
      if (!value || typeof value !== 'string') return false;
      return value.trim().length > 0;
    }
  },
  bio: {
    type: 'string',
    required: true,
    description: 'User\'s profile bio/about section',
    validate: (value) => {
      if (!value || typeof value !== 'string') return false;
      return value.trim().length >= 10 && value.trim().length <= 500;
    }
  },
  prompts: {
    type: 'array',
    required: false,
    description: 'Profile prompt answers',
    promptQuestions: PROFILE_PROMPTS,
    validate: (value) => {
      if (!value) return true; // Optional field
      if (!Array.isArray(value)) return false;

      // Each prompt should have a question and answer
      return value.every(prompt =>
        prompt &&
        typeof prompt === 'object' &&
        typeof prompt.question === 'string' &&
        typeof prompt.answer === 'string' &&
        prompt.question.trim().length > 0 &&
        prompt.answer.trim().length > 0
      );
    }
  },
  education_level: {
    type: 'string',
    required: false,
    description: 'User\'s education level',
    options: EDUCATION_LEVEL_OPTIONS,
    validate: (value) => {
      if (!value) return true; // Optional field
      if (typeof value !== 'string') return false;
      return EDUCATION_LEVEL_OPTIONS.some(opt =>
        opt.toLowerCase() === value.toLowerCase()
      );
    }
  },
  major: {
    type: 'string',
    required: false,
    description: 'User\'s field of study or major',
    validate: (value) => {
      if (!value) return true; // Optional field
      if (typeof value !== 'string') return false;
      return value.trim().length > 0 && value.trim().length <= 100;
    }
  },
  pets: {
    type: 'array',
    required: false,
    description: 'Types of pets user has',
    petTypes: PET_TYPES,
    validate: (value) => {
      if (!value) return true; // Optional field
      if (!Array.isArray(value)) return false;
      return value.every(pet => typeof pet === 'string' && pet.trim().length > 0);
    }
  },
  height_preference: {
    type: 'object',
    required: false,
    description: 'User\'s height preference for matches',
    validate: (value) => {
      if (!value) return true; // Optional field
      if (typeof value !== 'object') return false;

      // Should have min and dealbreaker properties
      if (value.min && typeof value.min !== 'string') return false;
      if (value.dealbreaker !== undefined && typeof value.dealbreaker !== 'boolean') return false;

      return true;
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
    interests: [],
    sexual_orientation: null,
    relationship_intent: null,
    height: null,
    bio: null,
    prompts: [],
    education_level: null,
    major: null,
    pets: [],
    height_preference: null
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
 * Check if profile has minimum required fields for generation/rendering
 * This is a more lenient check used specifically for profile card generation.
 * Only requires: name, age, and photo (the bare minimum for a profile card)
 *
 * Note: AI should still try to collect all fields defined in PROFILE_SCHEMA,
 * but profile generation can proceed with just these three fields.
 *
 * @param {Object} profileSchema - Current profile schema data
 * @returns {boolean} True if minimum required fields (name, age, photo) are filled
 */
function isSchemaCompleteForGeneration(profileSchema) {
  if (!profileSchema) return false;

  // Only check the three essential fields for rendering
  const requiredForGeneration = ['name', 'age', 'photo'];

  for (const fieldName of requiredForGeneration) {
    if (!isFieldFilled(profileSchema, fieldName)) {
      return false;
    }
  }

  return true;
}

/**
 * Get missing fields required for profile generation
 * @param {Object} profileSchema - Current profile schema data
 * @returns {string[]} Array of missing field names needed for generation
 */
function getMissingFieldsForGeneration(profileSchema) {
  const requiredForGeneration = ['name', 'age', 'photo'];
  const missing = [];

  for (const fieldName of requiredForGeneration) {
    if (!isFieldFilled(profileSchema, fieldName)) {
      missing.push(fieldName);
    }
  }

  return missing;
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
    interests: 'interests',
    sexual_orientation: 'sexual orientation',
    relationship_intent: 'relationship intent',
    height: 'height',
    bio: 'bio',
    prompts: 'profile prompts',
    education_level: 'education level',
    major: 'major/field of study',
    pets: 'pets',
    height_preference: 'height preference'
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
  const { value: normalizedValue } = normalizeFieldValue(fieldName, value);

  // Special handling post-normalization for age to ensure numeric type
  if (fieldName === 'age' && typeof normalizedValue !== 'number') {
    return {
      success: false,
      error: `Invalid age value: "${value}" - must be a number`
    };
  }

  // Validate value
  if (!fieldDef.validate(normalizedValue)) {
    return {
      success: false,
      error: `Invalid value for ${getFieldDisplayName(fieldName)}`
    };
  }

  // Update value
  profileSchema[fieldName] = normalizedValue;

  if (value !== normalizedValue) {
    logger.debug('Stored normalized profile value', {
      field: fieldName,
      original: value,
      stored: normalizedValue
    });
  }

  return {
    success: true,
    message: `Updated ${getFieldDisplayName(fieldName)}`
  };
}

module.exports = {
  PROFILE_SCHEMA,
  INTEREST_CATEGORIES,
  GENDER_OPTIONS,
  ORIENTATION_OPTIONS,
  RELATIONSHIP_INTENT_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  PROFILE_PROMPTS,
  PET_TYPES,
  initializeProfileSchema,
  isFieldFilled,
  getMissingFields,
  isSchemaComplete,
  isSchemaCompleteForGeneration,
  getMissingFieldsForGeneration,
  getCompletionPercentage,
  getFieldDisplayName,
  updateField,
  mapInterestToCategory
};
