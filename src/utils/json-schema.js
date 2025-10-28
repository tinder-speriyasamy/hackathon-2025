/**
 * Minimal JSON Schema validator (supports subset used in prompts)
 * Supported keywords: type, required, properties, enum, const, maxItems, items, oneOf
 */

function isType(value, type) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

function validateAgainstSchema(schema, data, path = '') {
  const errors = [];

  if (schema.const !== undefined) {
    if (data !== schema.const) {
      errors.push(`${path || 'value'} must equal const ${JSON.stringify(schema.const)}`);
      return errors;
    }
  }

  if (schema.enum) {
    if (!schema.enum.includes(data)) {
      errors.push(`${path || 'value'} must be one of ${JSON.stringify(schema.enum)}`);
      return errors;
    }
  }

  if (schema.oneOf) {
    const subErrors = [];
    const valid = schema.oneOf.some((sub) => validateAgainstSchema(sub, data, path).length === 0);
    if (!valid) errors.push(`${path || 'value'} does not match any allowed schemas`);
    return errors.concat(subErrors);
  }

  if (schema.type) {
    if (!isType(data, schema.type)) {
      errors.push(`${path || 'value'} must be of type ${schema.type}`);
      return errors;
    }
  }

  if (schema.type === 'object' && schema.properties) {
    const props = schema.properties || {};
    const required = schema.required || [];
    for (const r of required) {
      if (data[r] === undefined) errors.push(`${path ? path + '.' : ''}${r} is required`);
    }
    for (const [key, subSchema] of Object.entries(props)) {
      if (data[key] !== undefined) {
        errors.push(...validateAgainstSchema(subSchema, data[key], path ? `${path}.${key}` : key));
      }
    }
  }

  if (schema.type === 'array') {
    if (schema.maxItems !== undefined && data.length > schema.maxItems) {
      errors.push(`${path || 'value'} must have at most ${schema.maxItems} items`);
    }
    if (schema.items) {
      for (let i = 0; i < data.length; i++) {
        errors.push(...validateAgainstSchema(schema.items, data[i], `${path}[${i}]`));
      }
    }
  }

  return errors;
}

function validateJson(rootSchema, data) {
  try {
    const schema = rootSchema.schema || rootSchema; // support wrapped { name, schema }
    const errors = validateAgainstSchema(schema, data, 'response');
    return {
      valid: errors.length === 0,
      errors
    };
  } catch (e) {
    return { valid: false, errors: ['Schema validation error: ' + e.message] };
  }
}

module.exports = { validateJson };


