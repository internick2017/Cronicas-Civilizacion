// Custom error classes for better error handling
import logger from './logger.js';

/**
 * Base error class for application-specific errors
 */
export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Validation error for invalid input
 */
export class ValidationError extends AppError {
  constructor(message, details = null) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

/**
 * Authentication error
 */
export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, 401, 'AUTHENTICATION_ERROR');
  }
}

/**
 * Authorization error
 */
export class AuthorizationError extends AppError {
  constructor(message = 'Access denied') {
    super(message, 403, 'AUTHORIZATION_ERROR');
  }
}

/**
 * Not found error
 */
export class NotFoundError extends AppError {
  constructor(resource, identifier) {
    const message = identifier 
      ? `${resource} with identifier ${identifier} not found`
      : `${resource} not found`;
    super(message, 404, 'NOT_FOUND');
    this.resource = resource;
    this.identifier = identifier;
  }
}

/**
 * Conflict error for duplicate resources
 */
export class ConflictError extends AppError {
  constructor(message, resource = null) {
    super(message, 409, 'CONFLICT');
    this.resource = resource;
  }
}

/**
 * Rate limit error
 */
export class RateLimitError extends AppError {
  constructor(message = 'Too many requests', retryAfter = null) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

/**
 * Game-specific errors
 */
export class GameError extends AppError {
  constructor(message, code = 'GAME_ERROR') {
    super(message, 400, code);
  }
}

export class GameFullError extends GameError {
  constructor(gameId) {
    super('Game is full', 'GAME_FULL');
    this.gameId = gameId;
  }
}

export class GameStartedError extends GameError {
  constructor(gameId) {
    super('Game has already started', 'GAME_STARTED');
    this.gameId = gameId;
  }
}

export class NotYourTurnError extends GameError {
  constructor(playerId, currentPlayerId) {
    super('Not your turn', 'NOT_YOUR_TURN');
    this.playerId = playerId;
    this.currentPlayerId = currentPlayerId;
  }
}

export class InsufficientResourcesError extends GameError {
  constructor(required, available) {
    super('Insufficient resources', 'INSUFFICIENT_RESOURCES');
    this.required = required;
    this.available = available;
  }
}

/**
 * Error handler middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Default error values
  let error = err;
  
  // Handle non-operational errors
  if (!error.isOperational) {
    // Log unexpected errors
    logger.error('Unexpected error:', {
      error: err.message,
      stack: err.stack,
      url: req.url,
      method: req.method,
      ip: req.ip
    });
    
    // Don't leak error details in production
    if (process.env.NODE_ENV === 'production') {
      error = new AppError('An unexpected error occurred', 500);
    }
  }
  
  // Send error response
  res.status(error.statusCode || 500).json({
    success: false,
    error: {
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
      ...(error.details && { details: error.details }),
      ...(error.resource && { resource: error.resource }),
      ...(error.identifier && { identifier: error.identifier }),
      ...(error.retryAfter && { retryAfter: error.retryAfter }),
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    }
  });
};

/**
 * Async error wrapper for route handlers
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};