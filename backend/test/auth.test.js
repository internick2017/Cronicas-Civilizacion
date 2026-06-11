import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../src/services/AuthService.js';
import { ValidationError, AuthenticationError } from '../src/utils/errors.js';

describe('AuthService', () => {
  let authService;

  beforeEach(() => {
    // Set up test environment
    process.env.JWT_SECRET = 'test-secret-key-for-testing-purposes-only';
    authService = new AuthService();
  });

  afterEach(() => {
    // Clean up
    delete process.env.JWT_SECRET;
  });

  describe('register', () => {
    it('should register a new user with valid data', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
        civilizationName: 'Test Civilization'
      };

      const result = await authService.register(userData);
      
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(userData.email);
      expect(result.token).toBeDefined();
    });

    it('should reject registration with invalid email', async () => {
      const userData = {
        username: 'testuser',
        email: 'invalid-email',
        password: 'password123'
      };

      await expect(authService.register(userData)).rejects.toThrow();
    });

    it('should reject registration with short password', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: '123'
      };

      await expect(authService.register(userData)).rejects.toThrow('Password must be at least 6 characters long');
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      // First register a user
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };
      
      await authService.register(userData);
      
      // Then try to login
      const result = await authService.login('test@example.com', 'password123');
      
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.token).toBeDefined();
    });

    it('should reject login with invalid credentials', async () => {
      await expect(authService.login('nonexistent@example.com', 'wrongpassword'))
        .rejects.toThrow();
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', async () => {
      // Register and get a token
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123'
      };
      
      const registerResult = await authService.register(userData);
      const token = registerResult.token;
      
      // Verify the token
      const result = await authService.verifyToken(token);
      
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe(userData.email);
    });

    it('should reject an invalid token', async () => {
      const result = await authService.verifyToken('invalid-token');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('JWT Secret validation', () => {
    it('should throw error when JWT_SECRET is not set', () => {
      delete process.env.JWT_SECRET;
      
      expect(() => new AuthService().getJwtSecret()).toThrow('JWT_SECRET environment variable is required');
    });

    it('should validate JWT_SECRET length in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'short';
      
      expect(() => new AuthService().getJwtSecret()).toThrow('JWT_SECRET must be at least 32 characters in production');
      
      delete process.env.NODE_ENV;
    });

    it('should reject default development secrets in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'your-secret-key';
      
      expect(() => new AuthService().getJwtSecret()).toThrow('JWT_SECRET cannot use default development values in production');
      
      delete process.env.NODE_ENV;
    });
  });
});