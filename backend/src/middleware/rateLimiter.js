import rateLimit from 'express-rate-limit';
import { RateLimitError } from '../utils/errors.js';

/**
 * Create a rate limiter with custom error handling
 */
const createRateLimiter = (options) => {
  return rateLimit({
    ...options,
    handler: (req, res, next) => {
      const retryAfter = Math.round(options.windowMs / 1000);
      next(new RateLimitError(
        'Too many requests from this IP, please try again later.',
        retryAfter
      ));
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
};

/**
 * General rate limiter for all requests.
 * GETs are skipped: the narrative game polls every 3s per client, and all LAN
 * clients arrive as 127.0.0.1 through the Vite proxy — write-only counting
 * prevents the shared IP from burning through the window during a playtest.
 */
export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600, // write requests only (GETs skipped — see skip below)
  message: 'Too many requests from this IP',
  skipSuccessfulRequests: false,
  skip: (req) => req.method === 'GET',
});

/**
 * Strict rate limiter for authentication endpoints
 */
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: 'Too many authentication attempts',
  skipFailedRequests: true, // Don't count failed requests
});

/**
 * Rate limiter for game creation
 */
export const gameCreationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 game creations per hour
  message: 'Too many games created',
});

/**
 * Rate limiter for game actions
 */
export const gameActionLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Limit each IP to 30 actions per minute
  message: 'Too many game actions',
});

/**
 * Rate limiter for API endpoints.
 * GETs skipped for the same LAN-proxy reason as generalLimiter.
 */
export const apiLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // POST/PUT/DELETE only — generous for human interactions
  message: 'Too many API requests',
  skip: (req) => req.method === 'GET',
});

/**
 * Rate limiter for narrative endpoints.
 * GETs skipped: session/history polls run every 3s per client through a single
 * proxy IP — only AI-triggering writes count toward this limit.
 */
export const narrativeLimiter = createRateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 300, // POSTs/writes only (GETs skipped — see skip below)
  message: 'Too many narrative requests',
  skip: (req) => req.method === 'GET',
});

/**
 * Socket.io rate limiter middleware
 */
export const socketRateLimiter = (eventName, maxRequests = 10, windowMs = 60000) => {
  const requests = new Map();
  
  return (socket, next) => {
    const key = `${socket.id}:${eventName}`;
    const now = Date.now();
    
    // Clean up old entries
    const cutoff = now - windowMs;
    for (const [k, timestamps] of requests.entries()) {
      requests.set(k, timestamps.filter(t => t > cutoff));
      if (requests.get(k).length === 0) {
        requests.delete(k);
      }
    }
    
    // Check rate limit
    const timestamps = requests.get(key) || [];
    if (timestamps.length >= maxRequests) {
      const error = new Error('Rate limit exceeded');
      error.data = {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many ${eventName} requests`,
        retryAfter: Math.ceil(windowMs / 1000)
      };
      return next(error);
    }
    
    // Record request
    timestamps.push(now);
    requests.set(key, timestamps);
    
    next();
  };
};