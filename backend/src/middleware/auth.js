import authService from '../services/AuthService.js';

/**
 * Middleware to authenticate JWT tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function authenticateToken(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access token is required'
      });
    }

    // Verify token using AuthService
    const result = await authService.verifyToken(token);
    
    if (!result.success) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token'
      });
    }

    // Add user info to request object
    req.user = result.user;
    req.token = token;
    
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({
      success: false,
      error: 'Invalid or expired token'
    });
  }
}

/**
 * Optional authentication middleware (doesn't fail if no token)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (token) {
      try {
        const result = await authService.verifyToken(token);
        if (result.success) {
          req.user = result.user;
          req.token = token;
        }
      } catch (error) {
        // Token invalid but we don't fail the request
        console.warn('Invalid token in optional auth:', error.message);
      }
    }

    next();
  } catch (error) {
    console.error('Optional auth error:', error);
    next();
  }
}

/**
 * Middleware to check if user is admin (placeholder for future use)
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export async function requireAdmin(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required'
      });
    }

    // For now, all authenticated users are considered "admin"
    // In the future, you could check req.user.role === 'admin'
    next();
  } catch (error) {
    console.error('Admin check error:', error);
    return res.status(500).json({
      success: false,
      error: 'Server error'
    });
  }
}

/**
 * Middleware to extract user info from token for WebSocket connections
 * @param {Object} socket - Socket.io socket object
 * @param {Function} next - Socket.io next function
 */
export async function authenticateSocket(socket, next) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (!token) {
      return next(new Error('Authentication token required'));
    }

    const result = await authService.verifyToken(token);
    
    if (!result.success) {
      return next(new Error('Invalid or expired token'));
    }

    // Add user info to socket object
    socket.user = result.user;
    socket.token = token;
    
    next();
  } catch (error) {
    console.error('Socket authentication error:', error);
    next(new Error('Authentication failed'));
  }
}

/**
 * Optional socket authentication (doesn't fail if no token)
 * @param {Object} socket - Socket.io socket object
 * @param {Function} next - Socket.io next function
 */
export async function optionalSocketAuth(socket, next) {
  try {
    const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

    if (token) {
      try {
        const result = await authService.verifyToken(token);
        if (result.success) {
          socket.user = result.user;
          socket.token = token;
        }
      } catch (error) {
        console.warn('Invalid token in optional socket auth:', error.message);
      }
    }

    next();
  } catch (error) {
    console.error('Optional socket auth error:', error);
    next();
  }
} 