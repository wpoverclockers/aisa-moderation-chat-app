import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { setupSocketHandlers, cleanupAllRateLimits } from './socketHandler.js';
import { closeGradioClient } from './moderationService.js';
import { logModerationFeedback, getModerationFeedbackLogs } from './loggingService.js';
import { submitFeedbackToHuggingFace, exportFeedbackToCSV, formatFeedbackForDataset } from './huggingFaceFeedbackService.js';
import { getAnalytics } from './feedbackAnalytics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to frontend dist folder
// Try multiple possible paths since Railway might run from different directories
let frontendDistPath = path.join(__dirname, '../../frontend/dist');
if (!fs.existsSync(frontendDistPath)) {
  // Try from project root (if running from root)
  frontendDistPath = path.join(process.cwd(), 'frontend/dist');
}
if (!fs.existsSync(frontendDistPath)) {
  // Try relative to current working directory
  frontendDistPath = path.join(process.cwd(), '../frontend/dist');
}

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

// All API routes MUST be defined BEFORE static file serving
// This ensures API endpoints work correctly and aren't intercepted by static middleware

// Debug endpoint to check frontend path (remove in production if desired)
app.get('/debug-frontend', (req, res) => {
  res.json({
    frontendDistPath,
    exists: fs.existsSync(frontendDistPath),
    __dirname,
    files: fs.existsSync(frontendDistPath) ? fs.readdirSync(frontendDistPath) : [],
    assetsExists: fs.existsSync(path.join(frontendDistPath, 'assets')),
    assetsFiles: fs.existsSync(path.join(frontendDistPath, 'assets')) 
      ? fs.readdirSync(path.join(frontendDistPath, 'assets'))
      : [],
  });
});

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

// AI status endpoint
app.get('/api/ai/status', (req, res) => {
  res.json({
    enabled: config.ai.enabled,
    provider: 'OpenAI',
    model: config.ai.model,
    maxResponseLength: config.ai.maxResponseLength,
    conversationHistorySize: config.ai.conversationHistorySize,
    apiKeyConfigured: !!config.ai.apiKey,
    note: config.ai.enabled 
      ? (config.ai.apiKey 
          ? 'AI agent is active and will respond to user messages'
          : 'AI agent is enabled but OPENAI_API_KEY is not set')
      : 'AI agent is disabled. Set AI_ENABLED=true to enable.',
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

// Get feedback analytics endpoint
app.get('/api/feedback/analytics', (req, res) => {
  try {
    const dateStr = req.query.date || null;
    const analytics = getAnalytics(dateStr);
    
    res.json({
      success: true,
      analytics,
      date: dateStr || 'all',
      note: 'Use ?date=YYYY-MM-DD to analyze specific date',
    });
  } catch (error) {
    console.error('Error generating analytics:', error);
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

// Serve static files from frontend dist (AFTER all API routes)
// This ensures assets (JS, CSS) are served correctly
if (fs.existsSync(frontendDistPath)) {
  // Serve static files with proper MIME types
  app.use(express.static(frontendDistPath, {
    maxAge: '1d', // Cache static assets
    etag: true,
  }));
  console.log('📁 Serving frontend from:', frontendDistPath);
  console.log('📁 Frontend dist exists:', fs.existsSync(frontendDistPath));
  
  // Log if assets folder exists
  const assetsPath = path.join(frontendDistPath, 'assets');
  if (fs.existsSync(assetsPath)) {
    const assets = fs.readdirSync(assetsPath);
    console.log('📦 Found', assets.length, 'asset files');
  } else {
    console.log('⚠️  Assets folder not found at:', assetsPath);
  }
  
  // Fallback to index.html for SPA routing (must be AFTER static middleware)
  // This catches all non-API routes and serves the React app
  app.get('*', (req, res, next) => {
    // Skip for API routes
    if (req.path.startsWith('/api')) {
      return next();
    }
    // Skip for socket.io
    if (req.path.startsWith('/socket.io')) {
      return next();
    }
    // Skip for debug/health endpoints
    if (req.path === '/health' || req.path === '/debug-frontend') {
      return next();
    }
    // Skip for asset files - they should be handled by static middleware above
    // If we reach here for assets, it means static middleware didn't find them
    if (req.path.startsWith('/assets/')) {
      console.log('⚠️  Asset not found via static middleware:', req.path);
      return res.status(404).json({ error: 'Asset not found', path: req.path });
    }
    
    // Serve index.html for all other routes (SPA routing)
    const indexPath = path.join(frontendDistPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      console.log('⚠️  index.html not found at:', indexPath);
      res.status(404).json({ error: 'Frontend not found' });
    }
  });
} else {
  console.log('⚠️  Frontend dist folder not found');
  console.log('⚠️  Tried paths:');
  console.log('   -', path.join(__dirname, '../../frontend/dist'));
  console.log('   -', path.join(process.cwd(), 'frontend/dist'));
  console.log('   -', path.join(process.cwd(), '../frontend/dist'));
  console.log('⚠️  Current __dirname:', __dirname);
  console.log('⚠️  Current process.cwd():', process.cwd());
  console.log('⚠️  API-only mode - frontend will not be served');
  
  // List what's actually in the directories
  try {
    console.log('📂 Contents of process.cwd():', fs.readdirSync(process.cwd()));
  } catch (e) {
    console.log('❌ Cannot read process.cwd():', e.message);
  }
  try {
    console.log('📂 Contents of __dirname:', fs.readdirSync(__dirname));
  } catch (e) {
    console.log('❌ Cannot read __dirname:', e.message);
  }
}

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
