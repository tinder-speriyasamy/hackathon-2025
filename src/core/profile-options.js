/**
 * Shared option lists for profile schema fields.
 * Kept separate so both schema validation and normalization logic can reuse them without circular deps.
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

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Other'];

const ORIENTATION_OPTIONS = [
  'Straight',
  'Gay',
  'Lesbian',
  'Bisexual',
  'Pansexual',
  'Asexual',
  'Queer',
  'Questioning'
];

const RELATIONSHIP_INTENT_OPTIONS = [
  'Long-term only',
  'Long-term, open to short',
  'Short-term, open to long',
  'Still figuring it out'
];

const EDUCATION_LEVEL_OPTIONS = [
  'High School',
  'In College',
  'Associate Degree',
  "Bachelor's Degree",
  "Master's Degree",
  'PhD',
  'Trade School',
  'Prefer not to say'
];

const PROFILE_PROMPTS = [
  'My weakness is...',
  'Perks of dating me...',
  'People would describe me as...'
];

const PET_TYPES = ['Dog', 'Cat', 'Bird', 'Fish', 'Reptile', 'Rabbit', 'Other'];

module.exports = {
  INTEREST_CATEGORIES,
  GENDER_OPTIONS,
  ORIENTATION_OPTIONS,
  RELATIONSHIP_INTENT_OPTIONS,
  EDUCATION_LEVEL_OPTIONS,
  PROFILE_PROMPTS,
  PET_TYPES
};

