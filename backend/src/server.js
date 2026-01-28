import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { config } from './config.js';
import { setupSocketHandlers, cleanupAllRateLimits } from './socketHandler.js';
import { closeGradioClient } from './moderationService.js';
import { logModerationFeedback, getModerationFeedbackLogs } from './loggingService.js';
import { submitFeedbackToHuggingFace, exportFeedbackToCSV, formatFeedbackForDataset } from './huggingFaceFeedbackService.js';

const app = express();
const httpServer = createServer(app);

// Configure CORS for Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: config.server.nodeEnv === 'production' 
      ? process.env.FRONTEND_URL || 'http://localhost:5173'
      : '*', // Allow all origins in development
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware
app.use(cors({
  origin: config.server.nodeEnv === 'production'
    ? process.env.FRONTEND_URL || 'http://localhost:5173'
    : '*',
  credentials: true,
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'chat-moderation-backend',
  });
});

// API info endpoint
app.get('/api/info', (req, res) => {
  res.json({
    name: 'Chat Moderation API',
    version: '1.0.0',
    moderationThreshold: config.moderation.threshold,
    rateLimit: config.rateLimit.messagesPerMinute,
  });
});

// Log moderation feedback endpoint
app.post('/api/feedback', express.json(), async (req, res) => {
  try {
    const {
      messageId,
      messageText,
      wasBlocked,
      shouldHaveBeenBlocked,
      moderationResult,
      reason,
    } = req.body;

    // Validate required fields
    if (!messageText || typeof wasBlocked !== 'boolean' || typeof shouldHaveBeenBlocked !== 'boolean') {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: messageText, wasBlocked, shouldHaveBeenBlocked',
      });
    }

    // Prepare feedback data
    const feedbackData = {
      messageId: messageId || 'unknown',
      messageText,
      wasBlocked,
      shouldHaveBeenBlocked,
      isFalsePositive: wasBlocked && !shouldHaveBeenBlocked, // Blocked but shouldn't have been
      isFalseNegative: !wasBlocked && shouldHaveBeenBlocked, // Not blocked but should have been
      moderationResult: moderationResult || {},
      reason: reason || 'No reason provided',
      threshold: config.moderation.threshold,
      timestamp: new Date().toISOString(),
    };

    // Log the feedback locally
    const logResult = logModerationFeedback(feedbackData);

    // Attempt to submit to Hugging Face Hub (if configured)
    let hfResult = null;
    if (process.env.HF_SUBMIT_FEEDBACK === 'true') {
      hfResult = await submitFeedbackToHuggingFace(feedbackData);
    }

    if (logResult.success) {
      res.json({
        success: true,
        message: 'Feedback logged successfully',
        logFile: logResult.logFile,
        huggingFace: hfResult || {
          submitted: false,
          note: 'Set HF_SUBMIT_FEEDBACK=true in .env to enable Hugging Face submission',
        },
        datasetEntry: formatFeedbackForDataset(feedbackData), // For manual upload
      });
    } else {
      res.status(500).json({
        success: false,
        error: logResult.error || 'Failed to log feedback',
      });
    }
  } catch (error) {
    console.error('Error handling feedback:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get moderation feedback logs endpoint (for admin/debugging)
app.get('/api/feedback/logs', (req, res) => {
  try {
    const dateStr = req.query.date || null;
    const format = req.query.format || 'json'; // 'json' or 'csv'
    const logs = getModerationFeedbackLogs(dateStr);
    
    if (format === 'csv') {
      // Return CSV format for easy Hugging Face dataset upload
      const csv = exportFeedbackToCSV(logs);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="moderation-feedback-${dateStr || 'all'}.csv"`);
      res.send(csv);
    } else {
      res.json({
        success: true,
        count: logs.length,
        logs,
        export: {
          csv: `/api/feedback/logs?format=csv${dateStr ? `&date=${dateStr}` : ''}`,
          note: 'Add ?format=csv to export as CSV for Hugging Face dataset upload',
        },
      });
    }
  } catch (error) {
    console.error('Error fetching feedback logs:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Submit feedback to Hugging Face Hub endpoint
app.post('/api/feedback/submit-to-hf', express.json(), async (req, res) => {
  try {
    const { dateStr } = req.body;
    const logs = getModerationFeedbackLogs(dateStr);
    
    if (logs.length === 0) {
      return res.json({
        success: false,
        message: 'No feedback logs found to submit',
      });
    }

    // Attempt to submit each log entry to Hugging Face
    const results = [];
    for (const log of logs) {
      const result = await submitFeedbackToHuggingFace(log);
      results.push(result);
    }

    res.json({
      success: true,
      submitted: results.filter(r => r.success).length,
      total: results.length,
      results,
      note: 'Feedback has been logged locally. Use CSV export for manual Hugging Face dataset upload.',
    });
  } catch (error) {
    console.error('Error submitting feedback to Hugging Face:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Setup Socket.io handlers
setupSocketHandlers(io);

// Start server
const PORT = config.server.port;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 Socket.io server ready`);
  console.log(`🌍 Environment: ${config.server.nodeEnv}`);
  console.log(`🔒 Moderation threshold: ${config.moderation.threshold}`);
  
  if (!config.huggingFace.apiToken) {
    console.warn('⚠️  Warning: HF_API_TOKEN not set. Moderation may not work properly.');
  }
});

// Graceful shutdown handler
async function gracefulShutdown(signal) {
  console.log(`${signal} received, shutting down gracefully...`);
  
  // Set a timeout to force exit if shutdown takes too long
  const forceExitTimeout = setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000); // 10 second timeout
  
  try {
    // Clean up rate limit data
    console.log('Cleaning up rate limit data...');
    cleanupAllRateLimits();
    
    // Close Socket.io server and all connections
    console.log('Closing Socket.io connections...');
    io.disconnectSockets(true);
    io.close(() => {
      console.log('Socket.io server closed');
    });
    
    // Close Gradio client connection
    console.log('Closing Gradio client connection...');
    await closeGradioClient();
    
    // Close HTTP server
    console.log('Closing HTTP server...');
    httpServer.close(() => {
      console.log('HTTP server closed');
      clearTimeout(forceExitTimeout);
      process.exit(0);
    });
    
    // Force close if httpServer.close doesn't call back
    setTimeout(() => {
      console.log('Forcing exit...');
      clearTimeout(forceExitTimeout);
      process.exit(0);
    }, 5000);
    
  } catch (error) {
    console.error('Error during shutdown:', error);
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('unhandledRejection');
});
