import axios from 'axios';
import { config } from './config.js';

const AI_AUTHOR_NAME = 'AI Moderator';

/**
 * Generates a greeting message for a new user
 * @param {string} username - The user's name
 * @returns {Promise<string>} - The AI-generated greeting
 */
export async function generateGreeting(username) {
  if (!config.ai.enabled) {
    return null;
  }

  try {
    const messages = [
      {
        role: 'system',
        content: `You're a fun, chatty, and human-like AI friend. A new user named "${username}" just joined the chat. Greet them in a casual, friendly way - like you're excited to meet a new friend! Be warm, fun, and show personality. Use natural, conversational language. Keep it brief and under ${config.ai.maxResponseLength} characters.`,
      },
      {
        role: 'user',
        content: `Greet the new user "${username}" who just joined - be fun and chatty!`,
      },
    ];

    const response = await callOpenAIAPI(messages);
    const greeting = parseOpenAIResponse(response);
    return greeting.trim();
  } catch (error) {
    console.error('Error generating greeting:', error);
    // Return a simple fallback greeting
    return `Hey ${username}! 👋 Welcome to the chat! What's up?`;
  }
}

/**
 * Generates an AI response to a user message
 * @param {string} userMessage - The user's message
 * @param {Object} moderationResult - The moderation result for the user message
 * @param {Array} conversationHistory - Array of previous messages for context
 * @param {boolean} isBlocked - Whether the message was blocked
 * @returns {Promise<string>} - The AI-generated response text
 */
export async function generateAIResponse(userMessage, moderationResult, conversationHistory = [], isBlocked = false) {
  if (!config.ai.enabled) {
    throw new Error('AI agent is disabled');
  }

  try {
    const messages = buildMessages(userMessage, moderationResult, conversationHistory, isBlocked);
    const response = await callOpenAIAPI(messages);
    const aiText = parseOpenAIResponse(response);
    
    // Ensure response is within length limit
    const maxLength = config.ai.maxResponseLength;
    if (aiText.length > maxLength) {
      return aiText.substring(0, maxLength).trim() + '...';
    }
    
    return aiText.trim();
  } catch (error) {
    console.error('Error generating AI response:', error);
    throw error;
  }
}

/**
 * Builds the messages array for OpenAI Chat API
 * @param {string} userMessage - The user's message
 * @param {Object} moderationResult - The moderation result
 * @param {Array} conversationHistory - Previous messages
 * @param {boolean} isBlocked - Whether the message was blocked
 * @returns {Array} - Array of message objects with role and content
 */
function buildMessages(userMessage, moderationResult, conversationHistory, isBlocked = false) {
  const messages = [];

  // System prompt - fun, chatty, human-like AI personality
  let systemPrompt;
  if (isBlocked) {
    systemPrompt = `You're a fun, chatty, and human-like AI friend chatting with users. A user's message was just blocked by the moderation system. Your role is to:
- React naturally and conversationally, like a friend would
- Casually mention what happened without being preachy or formal
- Use natural, casual language with personality (like "oh", "hmm", "hey", etc.)
- Be empathetic and understanding, like you're chatting with a friend
- Keep it light and friendly - don't lecture
- Use emojis occasionally if it feels natural (but don't overdo it)
- Show personality and be relatable

Keep responses under ${config.ai.maxResponseLength} characters. Be fun, chatty, and human-like - like texting a friend!`;
  } else {
    systemPrompt = `You're a fun, chatty, and human-like AI friend chatting with users. Your personality is:
- Casual, friendly, and conversational - like texting a good friend
- Use natural, everyday language with personality
- Be genuinely interested in what they're saying
- React naturally to their messages (like "haha", "oh cool", "that's interesting", etc.)
- Use emojis occasionally when it feels natural (but don't overdo it)
- Show your personality - be funny, curious, supportive, or whatever fits the moment
- Don't be formal or robotic - be human!
- Keep it engaging and fun

Keep responses under ${config.ai.maxResponseLength} characters. Be fun, chatty, and human-like - like you're texting a friend!`;
  }

  messages.push({
    role: 'system',
    content: systemPrompt,
  });

  // Add conversation history (include both user and AI messages for natural conversation flow)
  if (conversationHistory.length > 0) {
    const recentHistory = conversationHistory.slice(-config.ai.conversationHistorySize);
    recentHistory.forEach(msg => {
      if (msg.author === AI_AUTHOR_NAME || msg.isAI) {
        // Add AI messages as assistant role
        messages.push({
          role: 'assistant',
          content: msg.text,
        });
      } else {
        // Add user messages
        messages.push({
          role: 'user',
          content: msg.text,
        });
      }
    });
  }

  // Build moderation context - keep it minimal and conversational
  let userMessageWithContext = userMessage;
  
  if (moderationResult && moderationResult.details) {
    const details = moderationResult.details;
    if (isBlocked) {
      // For blocked messages, provide context but keep it casual and friendly
      userMessageWithContext = `The user tried to send: "${userMessage}" but it got blocked (detected ${details.maxCategory || 'some issues'}). React naturally and chat about it - be friendly and understanding, like a friend would.`;
    } else {
      // For allowed messages, just use the message as-is for natural conversation
      userMessageWithContext = userMessage;
    }
  }

  messages.push({
    role: 'user',
    content: userMessageWithContext,
  });

  return messages;
}

/**
 * Calls the OpenAI Chat API
 * @param {Array} messages - Array of message objects with role and content
 * @returns {Promise<Object>} - The API response
 */
async function callOpenAIAPI(messages) {
  const apiKey = config.ai.apiKey;
  const modelName = config.ai.model;

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required for AI responses');
  }

  const apiUrl = 'https://api.openai.com/v1/chat/completions';

  try {
    const response = await axios.post(
      apiUrl,
      {
        model: modelName,
        messages: messages,
        max_tokens: Math.min(Math.ceil(config.ai.maxResponseLength / 4), 150), // Approximate tokens (1 token ≈ 4 chars)
        temperature: 0.9, // Higher temperature for more creative, human-like responses
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 second timeout for OpenAI
      }
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      // API returned an error
      const status = error.response.status;
      const errorData = error.response.data;
      
      if (status === 429) {
        // Rate limit exceeded
        const retryAfter = error.response.headers['retry-after'];
        throw new Error(`OpenAI API rate limit exceeded. ${retryAfter ? `Retry after ${retryAfter} seconds.` : 'Please try again later.'}`);
      } else if (status === 401 || status === 403) {
        // Authentication error
        throw new Error('OpenAI API authentication failed. Check your OPENAI_API_KEY.');
      } else if (status === 404) {
        // Model not found
        throw new Error(`OpenAI model "${modelName}" not found. Check your AI_MODEL configuration.`);
      } else if (status >= 500) {
        // Server error
        throw new Error('OpenAI service is experiencing issues. Please try again later.');
      } else {
        // Other client errors
        const errorMessage = errorData?.error?.message || errorData?.error || errorData?.message || 'Unknown error';
        throw new Error(`OpenAI API error: ${status} - ${errorMessage}`);
      }
    } else if (error.request) {
      // Request was made but no response (timeout or network error)
      if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
        throw new Error('OpenAI service request timed out. Please try again.');
      }
      throw new Error('OpenAI service is unavailable. Please check your connection and try again.');
    } else if (error.message) {
      // Error in request setup or other error
      throw error;
    } else {
      // Unknown error
      throw new Error(`OpenAI request error: ${error.toString()}`);
    }
  }
}

/**
 * Parses the AI response from OpenAI API
 * @param {Object} apiResponse - The API response object
 * @returns {string} - The extracted text
 */
function parseOpenAIResponse(apiResponse) {
  if (!apiResponse) {
    throw new Error('Empty response from OpenAI API');
  }

  // OpenAI Chat API response format: { choices: [{ message: { content: "..." } }] }
  if (apiResponse.choices && apiResponse.choices.length > 0) {
    const firstChoice = apiResponse.choices[0];
    if (firstChoice.message && firstChoice.message.content) {
      return firstChoice.message.content;
    }
  }

  // Fallback: try to find content in response
  if (apiResponse.content) {
    return apiResponse.content;
  }

  throw new Error('Unable to parse OpenAI response. Unexpected response format.');
}

/**
 * Gets the AI author name for messages
 * @returns {string}
 */
export function getAIAuthorName() {
  return AI_AUTHOR_NAME;
}
