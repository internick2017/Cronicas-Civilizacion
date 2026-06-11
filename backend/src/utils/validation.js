import { ValidationError } from './errors.js';

/**
 * Validation helper functions
 */

export const validators = {
  /**
   * Validate required fields
   */
  required: (value, fieldName) => {
    if (value === undefined || value === null || value === '') {
      throw new ValidationError(`${fieldName} is required`);
    }
    return value;
  },

  /**
   * Validate string
   */
  string: (value, fieldName, options = {}) => {
    if (typeof value !== 'string') {
      throw new ValidationError(`${fieldName} must be a string`);
    }
    
    if (options.minLength && value.length < options.minLength) {
      throw new ValidationError(`${fieldName} must be at least ${options.minLength} characters long`);
    }
    
    if (options.maxLength && value.length > options.maxLength) {
      throw new ValidationError(`${fieldName} must be at most ${options.maxLength} characters long`);
    }
    
    if (options.pattern && !options.pattern.test(value)) {
      throw new ValidationError(`${fieldName} has invalid format`);
    }
    
    return value.trim();
  },

  /**
   * Validate email
   */
  email: (value, fieldName = 'Email') => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      throw new ValidationError(`${fieldName} is not a valid email address`);
    }
    return value.toLowerCase();
  },

  /**
   * Validate number
   */
  number: (value, fieldName, options = {}) => {
    const num = Number(value);
    if (isNaN(num)) {
      throw new ValidationError(`${fieldName} must be a number`);
    }
    
    if (options.min !== undefined && num < options.min) {
      throw new ValidationError(`${fieldName} must be at least ${options.min}`);
    }
    
    if (options.max !== undefined && num > options.max) {
      throw new ValidationError(`${fieldName} must be at most ${options.max}`);
    }
    
    if (options.integer && !Number.isInteger(num)) {
      throw new ValidationError(`${fieldName} must be an integer`);
    }
    
    return num;
  },

  /**
   * Validate array
   */
  array: (value, fieldName, options = {}) => {
    if (!Array.isArray(value)) {
      throw new ValidationError(`${fieldName} must be an array`);
    }
    
    if (options.minLength && value.length < options.minLength) {
      throw new ValidationError(`${fieldName} must contain at least ${options.minLength} items`);
    }
    
    if (options.maxLength && value.length > options.maxLength) {
      throw new ValidationError(`${fieldName} must contain at most ${options.maxLength} items`);
    }
    
    return value;
  },

  /**
   * Validate enum value
   */
  enum: (value, allowedValues, fieldName) => {
    if (!allowedValues.includes(value)) {
      throw new ValidationError(
        `${fieldName} must be one of: ${allowedValues.join(', ')}`
      );
    }
    return value;
  },

  /**
   * Validate UUID
   */
  uuid: (value, fieldName = 'ID') => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(value)) {
      throw new ValidationError(`${fieldName} is not a valid UUID`);
    }
    return value;
  },

  /**
   * Validate coordinates
   */
  coordinates: (x, y, mapSize) => {
    const validX = validators.number(x, 'X coordinate', { min: 0, max: mapSize - 1, integer: true });
    const validY = validators.number(y, 'Y coordinate', { min: 0, max: mapSize - 1, integer: true });
    return { x: validX, y: validY };
  },

  /**
   * Sanitize string input
   */
  sanitizeString: (value) => {
    if (typeof value !== 'string') return value;
    
    // Remove potentially dangerous characters
    return value
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/['"]/g, '') // Remove quotes
      .trim();
  }
};

/**
 * Validation schemas for different entities
 */
export const schemas = {
  /**
   * User registration schema
   */
  userRegistration: (data) => {
    const validated = {};
    
    validated.username = validators.required(data.username, 'Username');
    validated.username = validators.string(validated.username, 'Username', {
      minLength: 3,
      maxLength: 20,
      pattern: /^[a-zA-Z0-9_]+$/
    });
    
    validated.email = validators.required(data.email, 'Email');
    validated.email = validators.email(validated.email);
    
    validated.password = validators.required(data.password, 'Password');
    validated.password = validators.string(validated.password, 'Password', {
      minLength: 6,
      maxLength: 100
    });
    
    if (data.civilizationName) {
      validated.civilizationName = validators.string(data.civilizationName, 'Civilization name', {
        minLength: 3,
        maxLength: 50
      });
      validated.civilizationName = validators.sanitizeString(validated.civilizationName);
    }
    
    return validated;
  },

  /**
   * Game creation schema
   */
  gameCreation: (data) => {
    const validated = {};
    
    validated.name = validators.required(data.name, 'Game name');
    validated.name = validators.string(validated.name, 'Game name', {
      minLength: 3,
      maxLength: 50
    });
    validated.name = validators.sanitizeString(validated.name);
    
    if (data.maxPlayers !== undefined) {
      validated.maxPlayers = validators.number(data.maxPlayers, 'Max players', {
        min: 2,
        max: 8,
        integer: true
      });
    }
    
    if (data.mapSize !== undefined) {
      validated.mapSize = validators.number(data.mapSize, 'Map size', {
        min: 10,
        max: 50,
        integer: true
      });
    }
    
    if (data.gameMode) {
      validated.gameMode = validators.enum(
        data.gameMode,
        ['classic', 'fast', 'custom'],
        'Game mode'
      );
    }
    
    if (data.civilizationName) {
      validated.civilizationName = validators.string(data.civilizationName, 'Civilization name', {
        minLength: 3,
        maxLength: 50
      });
      validated.civilizationName = validators.sanitizeString(validated.civilizationName);
    }
    
    return validated;
  },

  /**
   * Game action schema
   */
  gameAction: (data, mapSize) => {
    const validated = {};
    
    validated.type = validators.required(data.type, 'Action type');
    validated.type = validators.enum(
      validated.type,
      ['found_city', 'collect_resource', 'move_army', 'build_infrastructure', 'diplomacy', 'free_action'],
      'Action type'
    );
    
    if (data.x !== undefined && data.y !== undefined) {
      const coords = validators.coordinates(data.x, data.y, mapSize);
      validated.x = coords.x;
      validated.y = coords.y;
    }
    
    if (data.from && data.to) {
      validated.from = validators.coordinates(data.from.x, data.from.y, mapSize);
      validated.to = validators.coordinates(data.to.x, data.to.y, mapSize);
    }
    
    if (data.building) {
      validated.building = validators.enum(
        data.building,
        ['market', 'temple', 'barracks', 'library', 'wall'],
        'Building type'
      );
    }
    
    if (data.targetPlayerId) {
      validated.targetPlayerId = validators.uuid(data.targetPlayerId, 'Target player ID');
    }
    
    if (data.description) {
      validated.description = validators.string(data.description, 'Description', {
        maxLength: 500
      });
      validated.description = validators.sanitizeString(validated.description);
    }
    
    return validated;
  }
};

/**
 * Validate request middleware
 */
export const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      req.body = schema(req.body, req.params);
      next();
    } catch (error) {
      next(error);
    }
  };
};