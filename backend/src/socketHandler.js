import { moderateText } from './moderationService.js';
import { config } from './config.js';

// Rate limiting: track messages per connection
const rateLimitMap = new Map();

/**
 * Cleans up rate limit data for a socket connection
 */
function cleanupRateLimit(socketId) {
  rateLimitMap.delete(socketId);
}

/**
 * Cleans up all rate limit data
 * Call this during graceful shutdown
 */
export function cleanupAllRateLimits() {
  rateLimitMap.clear();
  console.log('Rate limit map cleared');
}

/**
 * Checks if a message should be rate limited
 * @param {string} socketId - The socket connection ID
 * @returns {boolean} - True if message should be allowed, false if rate limited
 */
function checkRateLimit(socketId) {
  const now = Date.now();
  const oneMinuteAgo = now - 60000; // 60 seconds

  if (!rateLimitMap.has(socketId)) {
    rateLimitMap.set(socketId, []);
  }

  const messages = rateLimitMap.get(socketId);
  
  // Remove messages older than 1 minute
  const recentMessages = messages.filter(timestamp => timestamp > oneMinuteAgo);
  
  // Check if limit exceeded
  if (recentMessages.length >= config.rateLimit.messagesPerMinute) {
    return false; // Rate limited
  }

  // Add current message timestamp
  recentMessages.push(now);
  rateLimitMap.set(socketId, recentMessages);
  
  return true; // Allowed
}

/**
 * Sets up socket event handlers
 * @param {Socket} io - Socket.io server instance
 */
export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Handle incoming messages
    socket.on('message', async (data) => {
      try {
        // Validate input
        if (!data || typeof data.text !== 'string') {
          socket.emit('error', { message: 'Invalid message format' });
          return;
        }

        // Sanitize and validate message text
        let messageText = data.text.trim();
        
        // Remove potential XSS attempts (basic sanitization)
        messageText = messageText
          .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
          .replace(/<[^>]+>/g, ''); // Remove HTML tags
        
        if (messageText.length === 0) {
          socket.emit('error', { message: 'Message cannot be empty' });
          return;
        }
        
        // Enforce maximum length
        if (messageText.length > 1000) {
          socket.emit('error', { message: 'Message too long (max 1000 characters)' });
          return;
        }

        // Check rate limit
        if (!checkRateLimit(socket.id)) {
          socket.emit('messageBlocked', {
            text: messageText,
            reason: 'Rate limit exceeded. Please slow down.',
            timestamp: new Date().toISOString(),
          });
          return;
        }

        // Moderate the message
        const moderationResult = await moderateText(messageText);

        if (moderationResult.isBlocked) {
          // Message is toxic, block it
          socket.emit('messageBlocked', {
            id: `${socket.id}-${Date.now()}`,
            text: messageText,
            reason: moderationResult.reason,
            details: moderationResult.details,
            timestamp: new Date().toISOString(),
          });
        } else {
          // Message is safe, broadcast it to all clients
          const messageData = {
            id: `${socket.id}-${Date.now()}`,
            text: messageText,
            author: data.author || 'Anonymous',
            timestamp: new Date().toISOString(),
            moderationStatus: moderationResult.reason,
            details: moderationResult.details, // Include details for reporting false negatives
          };

          // Broadcast to all clients including sender
          io.emit('message', messageData);
        }
      } catch (error) {
        console.error('Error handling message:', error);
        socket.emit('error', { 
          message: 'An error occurred while processing your message',
          error: error.message,
        });
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      cleanupRateLimit(socket.id);
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });
}
