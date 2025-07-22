import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import pool from '../config/database.js';
import redisClient from '../config/redis.js';

export class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'cronicas-civilizacion-secret';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    this.dbAvailable = false;
    this.initializeDatabase();
  }

  async initializeDatabase() {
    try {
      await pool.query('SELECT 1');
      this.dbAvailable = true;
    } catch (error) {
      console.warn('⚠️ AuthService: Database not available, using in-memory fallback');
      this.dbAvailable = false;
    }
  }

  /**
   * Register a new user
   * @param {Object} userData - User registration data
   * @returns {Promise<Object>} Registration result
   */
  async register(userData) {
    const { username, email, password, civilizationName } = userData;
    
    try {
      // Validate input
      if (!username || !email || !password) {
        throw new Error('Username, email, and password are required');
      }

      if (password.length < 6) {
        throw new Error('Password must be at least 6 characters long');
      }

      // Check if user already exists
      const existingUser = await this.getUserByEmail(email);
      if (existingUser) {
        throw new Error('User with this email already exists');
      }

      // Hash password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);

      // Create user
      const userId = randomUUID();
      const user = {
        id: userId,
        username,
        email,
        password: hashedPassword,
        civilizationName: civilizationName || `Civilization of ${username}`,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      if (this.dbAvailable) {
        // Save to database
        await pool.query(`
          INSERT INTO users (id, username, email, password, civilization_name, is_active)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [user.id, user.username, user.email, user.password, user.civilizationName, user.isActive]);
      }

      // Generate JWT token
      const token = this.generateToken(user);

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          civilizationName: user.civilizationName,
          isActive: user.isActive,
          createdAt: user.createdAt
        },
        token
      };
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  }

  /**
   * Login user
   * @param {Object} credentials - Login credentials
   * @returns {Promise<Object>} Login result
   */
  async login(credentials) {
    const { email, password } = credentials;
    
    try {
      // Validate input
      if (!email || !password) {
        throw new Error('Email and password are required');
      }

      // Get user by email
      const user = await this.getUserByEmail(email);
      if (!user) {
        throw new Error('Invalid email or password');
      }

      // Check if user is active
      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      // Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new Error('Invalid email or password');
      }

      // Update last login
      await this.updateLastLogin(user.id);

      // Generate JWT token
      const token = this.generateToken(user);

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          civilizationName: user.civilizationName,
          isActive: user.isActive,
          lastLogin: new Date()
        },
        token
      };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  /**
   * Logout user
   * @param {string} token - JWT token to invalidate
   * @returns {Promise<Object>} Logout result
   */
  async logout(token) {
    try {
      // Add token to blacklist in Redis
      if (redisClient.isOpen) {
        const decoded = jwt.decode(token);
        const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
        
        if (expiresIn > 0) {
          await redisClient.setEx(`blacklist:${token}`, expiresIn, 'true');
        }
      }

      return {
        success: true,
        message: 'Logged out successfully'
      };
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  }

  /**
   * Verify JWT token
   * @param {string} token - JWT token to verify
   * @returns {Promise<Object>} Verification result
   */
  async verifyToken(token) {
    try {
      // Check if token is blacklisted
      if (redisClient.isOpen) {
        const isBlacklisted = await redisClient.get(`blacklist:${token}`);
        if (isBlacklisted) {
          throw new Error('Token has been invalidated');
        }
      }

      // Verify JWT
      const decoded = jwt.verify(token, this.jwtSecret);
      
      // Get user from database
      const user = await this.getUserById(decoded.userId);
      if (!user) {
        throw new Error('User not found');
      }

      if (!user.isActive) {
        throw new Error('Account is deactivated');
      }

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          civilizationName: user.civilizationName,
          isActive: user.isActive
        }
      };
    } catch (error) {
      console.error('Token verification error:', error);
      throw error;
    }
  }

  /**
   * Generate JWT token
   * @param {Object} user - User object
   * @returns {string} JWT token
   */
  generateToken(user) {
    const payload = {
      userId: user.id,
      username: user.username,
      email: user.email,
      civilizationName: user.civilizationName
    };

    return jwt.sign(payload, this.jwtSecret, { expiresIn: this.jwtExpiresIn });
  }

  /**
   * Get user by email
   * @param {string} email - User email
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserByEmail(email) {
    if (!this.dbAvailable) {
      return null;
    }

    try {
      const result = await pool.query(`
        SELECT id, username, email, password, civilization_name, is_active, last_login, created_at, updated_at
        FROM users
        WHERE email = $1
      `, [email]);

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        password: user.password,
        civilizationName: user.civilization_name,
        isActive: user.is_active,
        lastLogin: user.last_login,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      };
    } catch (error) {
      console.error('Error getting user by email:', error);
      return null;
    }
  }

  /**
   * Get user by ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} User object or null
   */
  async getUserById(userId) {
    if (!this.dbAvailable) {
      return null;
    }

    try {
      const result = await pool.query(`
        SELECT id, username, email, civilization_name, is_active, last_login, created_at, updated_at
        FROM users
        WHERE id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      const user = result.rows[0];
      return {
        id: user.id,
        username: user.username,
        email: user.email,
        civilizationName: user.civilization_name,
        isActive: user.is_active,
        lastLogin: user.last_login,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      };
    } catch (error) {
      console.error('Error getting user by ID:', error);
      return null;
    }
  }

  /**
   * Update user's last login timestamp
   * @param {string} userId - User ID
   */
  async updateLastLogin(userId) {
    if (!this.dbAvailable) {
      return;
    }

    try {
      await pool.query(`
        UPDATE users 
        SET last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [userId]);
    } catch (error) {
      console.error('Error updating last login:', error);
    }
  }

  /**
   * Update user profile
   * @param {string} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Promise<Object>} Updated user data
   */
  async updateProfile(userId, updateData) {
    if (!this.dbAvailable) {
      throw new Error('Database not available');
    }

    try {
      const { username, civilizationName } = updateData;
      
      await pool.query(`
        UPDATE users 
        SET username = COALESCE($2, username),
            civilization_name = COALESCE($3, civilization_name),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [userId, username, civilizationName]);

      return await this.getUserById(userId);
    } catch (error) {
      console.error('Error updating profile:', error);
      throw error;
    }
  }

  /**
   * Change user password
   * @param {string} userId - User ID
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<Object>} Result
   */
  async changePassword(userId, currentPassword, newPassword) {
    if (!this.dbAvailable) {
      throw new Error('Database not available');
    }

    try {
      // Get user with password
      const result = await pool.query(`
        SELECT password FROM users WHERE id = $1
      `, [userId]);

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];

      // Verify current password
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Validate new password
      if (newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters long');
      }

      // Hash new password
      const saltRounds = 10;
      const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);

      // Update password
      await pool.query(`
        UPDATE users 
        SET password = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [userId, hashedNewPassword]);

      return {
        success: true,
        message: 'Password changed successfully'
      };
    } catch (error) {
      console.error('Error changing password:', error);
      throw error;
    }
  }

  /**
   * Get service status
   * @returns {Object} Service status
   */
  getStatus() {
    return {
      dbAvailable: this.dbAvailable,
      jwtConfigured: !!this.jwtSecret,
      redisAvailable: redisClient.isOpen
    };
  }
}

export default new AuthService(); 