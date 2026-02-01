import { moderateText } from './moderationService.js';
import { config } from './config.js';
import { generateAIResponse, generateGreeting, getAIAuthorName } from './aiService.js';

// Rate limiting: track messages per connection
const rateLimitMap = new Map();

// Conversation history: track messages per connection for AI context
const conversationHistoryMap = new Map();

// AI response rate limiting: prevent AI spam
const aiResponseRateLimitMap = new Map();

/**
 * Cleans up rate limit data for a socket connection
 */
function cleanupRateLimit(socketId) {
  rateLimitMap.delete(socketId);
  conversationHistoryMap.delete(socketId);
  aiResponseRateLimitMap.delete(socketId);
}

/**
 * Cleans up all rate limit data
 * Call this during graceful shutdown
 */
export function cleanupAllRateLimits() {
  rateLimitMap.clear();
  conversationHistoryMap.clear();
  aiResponseRateLimitMap.clear();
  console.log('Rate limit and conversation history maps cleared');
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
 * Checks if AI response should be rate limited (prevent AI spam)
 * @param {string} socketId - The socket connection ID
 * @returns {boolean} - True if AI response should be allowed
 */
function checkAIRateLimit(socketId) {
  const now = Date.now();
  const oneMinuteAgo = now - 60000;

  if (!aiResponseRateLimitMap.has(socketId)) {
    aiResponseRateLimitMap.set(socketId, []);
  }

  const aiResponses = aiResponseRateLimitMap.get(socketId);
  const recentResponses = aiResponses.filter(timestamp => timestamp > oneMinuteAgo);
  
  // Limit AI responses to 10 per minute per connection
  if (recentResponses.length >= 10) {
    return false;
  }

  recentResponses.push(now);
  aiResponseRateLimitMap.set(socketId, recentResponses);
  return true;
}

/**
 * Adds a message to conversation history
 * @param {string} socketId - The socket connection ID
 * @param {Object} messageData - The message data
 */
function addToConversationHistory(socketId, messageData) {
  if (!conversationHistoryMap.has(socketId)) {
    conversationHistoryMap.set(socketId, []);
  }

  const history = conversationHistoryMap.get(socketId);
  history.push({
    author: messageData.author || 'Anonymous',
    text: messageData.text,
    timestamp: messageData.timestamp,
  });

  // Keep only last N messages
  const maxHistory = config.ai.conversationHistorySize;
  if (history.length > maxHistory) {
    history.shift();
  }
}

/**
 * Generates and broadcasts an AI response
 * @param {Object} io - Socket.io server instance
 * @param {string} socketId - The socket connection ID
 * @param {string} userMessage - The user's message
 * @param {Object} moderationResult - The moderation result
 * @param {boolean} isBlocked - Whether the user message was blocked
 */
async function generateAndBroadcastAIResponse(io, socketId, userMessage, moderationResult, isBlocked = false) {
  // Check if AI is enabled
  if (!config.ai.enabled) {
    return;
  }

  // Check AI rate limit
  if (!checkAIRateLimit(socketId)) {
    console.log(`AI response rate limited for socket ${socketId}`);
    return;
  }

  try {
    // Get conversation history
    const conversationHistory = conversationHistoryMap.get(socketId) || [];

    // Generate AI response (pass isBlocked flag)
    const aiResponseText = await generateAIResponse(userMessage, moderationResult, conversationHistory, isBlocked);

    if (!aiResponseText || aiResponseText.trim().length === 0) {
      console.log('AI returned empty response, skipping');
      return;
    }

    // Moderate the AI response
    const aiModerationResult = await moderateText(aiResponseText);

    if (aiModerationResult.isBlocked) {
      console.log('AI response was blocked by moderation, skipping');
      // Optionally log this for analysis
      return;
    }

    // Create AI message data
    const aiMessageData = {
      id: `ai-${socketId}-${Date.now()}`,
      text: aiResponseText,
      author: getAIAuthorName(),
      timestamp: new Date().toISOString(),
      moderationStatus: aiModerationResult.reason,
      details: aiModerationResult.details,
      isAI: true, // Flag to identify AI messages
    };

    // Add AI message to conversation history
    addToConversationHistory(socketId, aiMessageData);

    // Broadcast AI message to all clients
    io.emit('message', aiMessageData);

    console.log(`AI response generated and broadcast for socket ${socketId}`);
  } catch (error) {
    // Log error but don't break the chat experience
    const errorMessage = error.message || error.toString();
    console.error(`Error generating AI response for socket ${socketId}:`, errorMessage);
    
    // Log specific error types for debugging
    if (errorMessage.includes('timeout')) {
      console.log('AI response timed out - this is normal if the model is loading');
    } else if (errorMessage.includes('rate limit')) {
      console.log('AI response rate limited - this is expected under high load');
    } else if (errorMessage.includes('disabled')) {
      console.log('AI agent is disabled');
    } else {
      // Only log unexpected errors
      console.error('Unexpected AI error:', error);
    }
    
    // Don't emit error to client - AI failures should be silent to maintain good UX
  }
}

/**
 * Sets up socket event handlers
 * @param {Socket} io - Socket.io server instance
 */
export function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Store username for this socket connection
    let socketUsername = null;

    // Handle username registration
    socket.on('register_username', async (data) => {
      if (!data || !data.username || typeof data.username !== 'string') {
        socket.emit('error', { message: 'Username is required' });
        return;
      }

      const username = data.username.trim();
      if (username.length === 0 || username.length > 20) {
        socket.emit('error', { message: 'Username must be between 1 and 20 characters' });
        return;
      }

      socketUsername = username;
      console.log(`User registered: ${socket.id} as "${username}"`);

      // Send greeting from AI
      if (config.ai.enabled) {
        try {
          const greeting = await generateGreeting(username);
          if (greeting) {
            // Moderate the greeting before sending
            const greetingModeration = await moderateText(greeting);
            if (!greetingModeration.isBlocked) {
              const greetingMessage = {
                id: `ai-greeting-${socket.id}-${Date.now()}`,
                text: greeting,
                author: getAIAuthorName(),
                timestamp: new Date().toISOString(),
                isAI: true,
              };

              // Add to conversation history
              addToConversationHistory(socket.id, greetingMessage);

              // Send greeting to this user only
              socket.emit('message', greetingMessage);
            }
          }
        } catch (error) {
          console.error('Error generating greeting:', error);
          // Don't fail connection if greeting fails
        }
      }
    });

    // Handle incoming messages
    socket.on('message', async (data) => {
      // Validate username is set
      if (!socketUsername) {
        socket.emit('error', { message: 'Please set your username first' });
        return;
      }
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
          const blockedMessageData = {
            id: `${socket.id}-${Date.now()}`,
            text: messageText,
            reason: moderationResult.reason,
            details: moderationResult.details,
            timestamp: new Date().toISOString(),
          };

          socket.emit('messageBlocked', blockedMessageData);

          // Trigger AI response to explain why the message was blocked
          // Use setImmediate to ensure blocked message is sent first
          setImmediate(() => {
            generateAndBroadcastAIResponse(io, socket.id, messageText, moderationResult, true)
              .catch(error => {
                // Errors are already logged in generateAndBroadcastAIResponse
                // This catch prevents unhandled promise rejection
              });
          });
        } else {
          // Message is safe, broadcast it to all clients
          const messageData = {
            id: `${socket.id}-${Date.now()}`,
            text: messageText,
            author: socketUsername || data.author || 'Anonymous',
            timestamp: new Date().toISOString(),
            moderationStatus: moderationResult.reason,
            details: moderationResult.details, // Include details for reporting false negatives
          };

          // Add user message to conversation history
          addToConversationHistory(socket.id, messageData);

          // Broadcast to all clients including sender
          io.emit('message', messageData);

          // Trigger AI response asynchronously (don't block user message)
          // Use setImmediate to ensure user message is sent first
          setImmediate(() => {
            generateAndBroadcastAIResponse(io, socket.id, messageText, moderationResult, false)
              .catch(error => {
                // Errors are already logged in generateAndBroadcastAIResponse
                // This catch prevents unhandled promise rejection
              });
          });
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
      console.log(`Client disconnected: ${socket.id}${socketUsername ? ` (${socketUsername})` : ''}`);
      cleanupRateLimit(socket.id);
      socketUsername = null;
    });

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`Socket error for ${socket.id}:`, error);
    });
  });
}
