import express from 'express';
import NarrativeService from '../services/NarrativeService.js';

const router = express.Router();

/**
 * GET /api/narrative/sessions
 * Get all active story sessions
 */
router.get('/sessions', async (req, res) => {
  try {
    const sessions = await NarrativeService.getAllSessions();
    res.json({
      success: true,
      data: sessions,
      message: 'Active sessions retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sessions',
      message: error.message
    });
  }
});

/**
 * POST /api/narrative/sessions
 * Create a new story session
 */
router.post('/sessions', async (req, res) => {
  try {
    const { title, description, maxPlayers, settings } = req.body;
    
    // Validate input
    if (!title || title.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Title is required',
        message: 'Please provide a title for the story session'
      });
    }

    const sessionData = {
      title: title.trim(),
      description: description || 'Una aventura épica colaborativa',
      maxPlayers: maxPlayers || 6,
      settings: settings || {}
    };

    const session = await NarrativeService.createSession(sessionData);
    
    res.status(201).json({
      success: true,
      data: session.getSummary(),
      message: 'Story session created successfully'
    });
  } catch (error) {
    console.error('Error creating session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create session',
      message: error.message
    });
  }
});

/**
 * GET /api/narrative/sessions/code/:code
 * Get a specific story session by room code
 */
router.get('/sessions/code/:code', async (req, res) => {
  try {
    const session = await NarrativeService.getSessionByCode(req.params.code);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        message: 'Sala no encontrada'
      });
    }
    res.json({ success: true, data: session.toJSON(), message: 'OK' });
  } catch (error) {
    console.error('Error getting session by code:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session',
      message: error.message
    });
  }
});

/**
 * GET /api/narrative/sessions/:sessionId
 * Get a specific story session
 */
router.get('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await NarrativeService.getSession(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
        message: 'The requested story session does not exist'
      });
    }

    res.json({
      success: true,
      data: session.toJSON(),
      message: 'Session retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session',
      message: error.message
    });
  }
});

/**
 * POST /api/narrative/sessions/:sessionId/join
 * Join a story session
 */
router.post('/sessions/:sessionId/join', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { name, characterName, characterClass, countryName, countryType, worldRole, worldType } = req.body;
    
    // Validate input
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Name is required',
        message: 'Please provide your name to join the session'
      });
    }

    const playerData = {
      name: name.trim(),
      characterName: characterName || name.trim(),
      characterClass: characterClass || 'Aventurero',
      countryName: countryName || null,
      countryType: countryType || null,
      worldRole: worldRole || null,
      worldType: worldType || null
    };

    const result = await NarrativeService.joinSession(sessionId, playerData);
    
    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    console.error('Error joining session:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to join session',
      message: error.message
    });
  }
});

/**
 * POST /api/narrative/sessions/:sessionId/leave
 * Leave a story session
 */
router.post('/sessions/:sessionId/leave', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { playerId } = req.body;
    
    if (!playerId) {
      return res.status(400).json({
        success: false,
        error: 'Player ID is required',
        message: 'Please provide your player ID to leave the session'
      });
    }

    const result = await NarrativeService.leaveSession(sessionId, playerId);
    
    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    console.error('Error leaving session:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to leave session',
      message: error.message
    });
  }
});

/**
 * POST /api/narrative/sessions/:sessionId/action
 * Submit a player action and get AI narrative response
 */
router.post('/sessions/:sessionId/action', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { playerId, action } = req.body;
    
    // Validate input
    if (!playerId) {
      return res.status(400).json({
        success: false,
        error: 'Player ID is required',
        message: 'Please provide your player ID'
      });
    }

    if (!action || action.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Action is required',
        message: 'Please describe what you want to do'
      });
    }

    if (action.trim().length > 280) {
      return res.status(400).json({
        success: false,
        error: 'Action too long',
        message: 'Please keep your action description under 280 characters'
      });
    }

    const result = await NarrativeService.submitAction(sessionId, playerId, action.trim());

    res.json({
      success: true,
      data: result,
      message: result.roundComplete
        ? 'Round complete — narrative generated'
        : 'Action submitted successfully',
    });
  } catch (error) {
    console.error('Error submitting action:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to submit action',
      message: error.message
    });
  }
});

/**
 * GET /api/narrative/sessions/:sessionId/history
 * Get story history for a session
 */
router.get('/sessions/:sessionId/history', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { limit = 20 } = req.query;
    
    const history = await NarrativeService.getSessionHistory(sessionId, parseInt(limit));
    
    res.json({
      success: true,
      data: history,
      message: 'Story history retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve history',
      message: error.message
    });
  }
});

/**
 * GET /api/narrative/sessions/:sessionId/stats
 * Get session statistics
 */
router.get('/sessions/:sessionId/stats', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const stats = await NarrativeService.getSessionStats(sessionId);
    
    res.json({
      success: true,
      data: stats,
      message: 'Session statistics retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
      message: error.message
    });
  }
});

/**
 * PUT /api/narrative/sessions/:sessionId/settings
 * Update session settings
 */
router.put('/sessions/:sessionId/settings', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { settings } = req.body;
    
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Settings object is required',
        message: 'Please provide valid settings'
      });
    }

    const updatedSettings = await NarrativeService.updateSessionSettings(sessionId, settings);
    
    res.json({
      success: true,
      data: updatedSettings,
      message: 'Session settings updated successfully'
    });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to update settings',
      message: error.message
    });
  }
});

/**
 * PUT /api/narrative/sessions/:sessionId/context
 * Update world context
 */
router.put('/sessions/:sessionId/context', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { context } = req.body;
    
    if (!context || typeof context !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Context object is required',
        message: 'Please provide valid world context'
      });
    }

    const updatedContext = await NarrativeService.updateWorldContext(sessionId, context);
    
    res.json({
      success: true,
      data: updatedContext,
      message: 'World context updated successfully'
    });
  } catch (error) {
    console.error('Error updating context:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to update context',
      message: error.message
    });
  }
});

/**
 * POST /api/narrative/sessions/:sessionId/retry-narrative
 * Retry AI narration for the current round (use when the AI call failed previously)
 */
router.post('/sessions/:sessionId/retry-narrative', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await NarrativeService.retryNarration(sessionId);
    res.json({
      success: true,
      data: result,
      message: 'Narración generada correctamente'
    });
  } catch (error) {
    console.error('Error retrying narration:', error);
    const status = error.message === 'Sesión no encontrada' ? 404
      : error.message === 'No hay ronda pendiente de narrar' ? 400
      : 500;
    res.status(status).json({
      success: false,
      error: 'Failed to retry narration',
      message: error.message
    });
  }
});

/**
 * POST /api/narrative/sessions/:sessionId/skip-turn
 * Skip the current player's turn
 */
router.post('/sessions/:sessionId/skip-turn', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await NarrativeService.skipTurn(sessionId);
    res.json({
      success: true,
      data: result,
      message: result.roundComplete ? 'Turno saltado — ronda completada' : 'Turno saltado'
    });
  } catch (error) {
    console.error('Error skipping turn:', error);
    const status = error.message === 'Sesión no activa' ? 400 : 500;
    res.status(status).json({
      success: false,
      error: 'Failed to skip turn',
      message: error.message
    });
  }
});

/**
 * POST /api/narrative/sessions/:sessionId/end
 * End a story session
 */
router.post('/sessions/:sessionId/end', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await NarrativeService.endSession(sessionId);
    
    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(400).json({
      success: false,
      error: 'Failed to end session',
      message: error.message
    });
  }
});

/**
 * GET /api/narrative/sessions/:sessionId/export
 * Export session data
 */
router.get('/sessions/:sessionId/export', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const exportData = await NarrativeService.exportSession(sessionId);
    
    res.json({
      success: true,
      data: exportData,
      message: 'Session exported successfully'
    });
  } catch (error) {
    console.error('Error exporting session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export session',
      message: error.message
    });
  }
});

/**
 * POST /api/narrative/clear-cache
 * Clear memory cache (for testing/debugging)
 */
router.post('/clear-cache', async (req, res) => {
  try {
    const clearedCount = NarrativeService.clearMemoryCache();
    
    res.json({
      success: true,
      data: { clearedSessions: clearedCount },
      message: `Cleared ${clearedCount} sessions from memory cache`
    });
  } catch (error) {
    console.error('Error clearing cache:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear cache',
      message: error.message
    });
  }
});

/**
 * GET /api/narrative/status
 * Get service status
 */
router.get('/status', async (req, res) => {
  try {
    const activeSessions = await NarrativeService.getAllSessions();
    const aiStatus = NarrativeService.aiService.getStatus();
    
    res.json({
      success: true,
      data: {
        activeSessions: activeSessions.length,
        aiEnabled: aiStatus.enabled,
        aiConfigured: aiStatus.configured,
        serviceStatus: 'operational'
      },
      message: 'Narrative service status retrieved successfully'
    });
  } catch (error) {
    console.error('Error getting status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get service status',
      message: error.message
    });
  }
});

export default router; 