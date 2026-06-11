import express from 'express';
import authService from '../services/AuthService.js';
import { authenticateToken } from '../middleware/auth.js';
import { asyncHandler } from '../utils/errors.js';
import { validateRequest, schemas } from '../utils/validation.js';
import { authLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();

// Register new user
router.post('/register', authLimiter, validateRequest(schemas.userRegistration), asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  res.status(201).json(result);
}));

// Login user
router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  res.json(result);
}));

// Logout user
router.post('/logout', authenticateToken, asyncHandler(async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  const result = await authService.logout(token);
  res.json(result);
}));

// Get current user profile
router.get('/profile', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user
  });
});

// Update user profile
router.put('/profile', authenticateToken, asyncHandler(async (req, res) => {
  const updatedUser = await authService.updateProfile(req.user.id, req.body);
  res.json({
    success: true,
    user: updatedUser
  });
}));

// Change password
router.put('/password', authenticateToken, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const result = await authService.changePassword(
    req.user.id,
    currentPassword,
    newPassword
  );
  res.json(result);
}));

// Verify token (for frontend to check if user is authenticated)
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    success: true,
    user: req.user,
    message: 'Token is valid'
  });
});

// Get auth service status
router.get('/status', asyncHandler(async (req, res) => {
  const status = authService.getStatus();
  res.json(status);
}));

export default router; 