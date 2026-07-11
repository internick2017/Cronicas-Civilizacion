import { describe, it, expect, beforeEach, vi } from 'vitest';
import { authenticateToken, requireAdmin, optionalAuth } from '../../src/middleware/auth.js';

// Mock the auth service
vi.mock('../../src/services/AuthService.js', () => ({
  default: {
    verifyToken: vi.fn()
  }
}));

import authService from '../../src/services/AuthService.js';

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      headers: {},
      user: null,
      token: null
    };
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn()
    };
    next = vi.fn();
    vi.clearAllMocks();
  });

  describe('authenticateToken', () => {
    it('should authenticate with valid Bearer token', async () => {
      const mockUser = { id: 1, email: 'test@example.com', role: 'player' };
      const token = 'valid-token';
      
      req.headers.authorization = `Bearer ${token}`;
      authService.verifyToken.mockResolvedValue({
        success: true,
        user: mockUser
      });

      await authenticateToken(req, res, next);

      expect(authService.verifyToken).toHaveBeenCalledWith(token);
      expect(req.user).toEqual(mockUser);
      expect(req.token).toBe(token);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject request without token', async () => {
      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Access token is required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should reject request with invalid token', async () => {
      req.headers.authorization = 'Bearer invalid-token';
      authService.verifyToken.mockResolvedValue({
        success: false,
        error: 'Invalid token'
      });

      await authenticateToken(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid or expired token'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should allow access for admin user', async () => {
      req.user = { id: 1, email: 'admin@example.com', role: 'admin' };

      await requireAdmin(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should deny access for non-admin user', async () => {
      req.user = { id: 1, email: 'user@example.com', role: 'player' };

      await requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Admin privileges required'
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should deny access for unauthenticated user', async () => {
      req.user = null;

      await requireAdmin(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Authentication required'
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    it('should add user to request with valid token', async () => {
      const mockUser = { id: 1, email: 'test@example.com', role: 'player' };
      const token = 'valid-token';
      
      req.headers.authorization = `Bearer ${token}`;
      authService.verifyToken.mockResolvedValue({
        success: true,
        user: mockUser
      });

      await optionalAuth(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(req.token).toBe(token);
      expect(next).toHaveBeenCalled();
    });

    it('should continue without user when no token provided', async () => {
      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(req.token).toBeNull();
      expect(next).toHaveBeenCalled();
    });

    it('should continue without user when token is invalid', async () => {
      req.headers.authorization = 'Bearer invalid-token';
      authService.verifyToken.mockRejectedValue(new Error('Invalid token'));

      await optionalAuth(req, res, next);

      expect(req.user).toBeNull();
      expect(next).toHaveBeenCalled();
    });
  });
});