/**
 * Admin Routes
 * Endpoints for managing and viewing Redis sessions
 */

const express = require('express');
const router = express.Router();
const aiMatchmaker = require('./ai-matchmaker');

/**
 * Get all sessions from Redis
 * GET /admin/api/sessions
 */
router.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await aiMatchmaker.getAllSessions();

    // Transform sessions into admin-friendly format
    const sessionList = sessions.map(session => ({
      sessionId: session.sessionId,
      createdAt: session.createdAt,
      createdBy: session.createdBy,
      participantCount: session.participants.length,
      participants: session.participants.map(p => ({
        phoneNumber: p.phoneNumber,
        name: p.name,
        role: p.role,
        joinedAt: p.joinedAt
      })),
      primaryUser: session.primaryUser,
      stage: session.stage,
      messageCount: session.messages.length,
      lastMessage: session.messages.length > 0
        ? session.messages[session.messages.length - 1]
        : null
    }));

    res.json({
      success: true,
      count: sessionList.length,
      sessions: sessionList
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch sessions',
      message: error.message
    });
  }
});

/**
 * Get detailed session data including full conversation
 * GET /admin/api/sessions/:sessionId
 */
router.get('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = await aiMatchmaker.getSessionById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session: session
    });
  } catch (error) {
    console.error('Error fetching session details:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch session details',
      message: error.message
    });
  }
});

/**
 * Delete a session
 * DELETE /admin/api/sessions/:sessionId
 */
router.delete('/api/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Get session first to find all participants
    const session = await aiMatchmaker.getSessionById(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Delete phone mappings for all participants
    for (const participant of session.participants) {
      await aiMatchmaker.deletePhoneMapping(participant.phoneNumber);
    }

    // Delete the session itself
    await aiMatchmaker.deleteSession(sessionId);

    res.json({
      success: true,
      message: `Session ${sessionId} deleted successfully`,
      deletedParticipants: session.participants.length
    });
  } catch (error) {
    console.error('Error deleting session:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete session',
      message: error.message
    });
  }
});

/**
 * Get Redis stats
 * GET /admin/api/stats
 */
router.get('/api/stats', async (req, res) => {
  try {
    const sessions = await aiMatchmaker.getAllSessions();

    const stats = {
      totalSessions: sessions.length,
      totalParticipants: sessions.reduce((sum, s) => sum + s.participants.length, 0),
      totalMessages: sessions.reduce((sum, s) => sum + s.messages.length, 0),
      sessionsByStage: {},
      averageParticipantsPerSession: 0,
      averageMessagesPerSession: 0
    };

    // Count sessions by stage
    sessions.forEach(session => {
      const stage = session.stage || 'unknown';
      stats.sessionsByStage[stage] = (stats.sessionsByStage[stage] || 0) + 1;
    });

    // Calculate averages
    if (sessions.length > 0) {
      stats.averageParticipantsPerSession = (stats.totalParticipants / sessions.length).toFixed(2);
      stats.averageMessagesPerSession = (stats.totalMessages / sessions.length).toFixed(2);
    }

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch stats',
      message: error.message
    });
  }
});

module.exports = router;
