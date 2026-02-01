import dotenv from 'dotenv';

dotenv.config();

export const config = {
  huggingFace: {
    apiToken: process.env.HF_API_TOKEN || '',
    apiUrl: process.env.HF_API_URL || 'https://api-inference.huggingface.co/models/duchaba/Friendly_Text_Moderation',
  },
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  moderation: {
    threshold: parseFloat(process.env.MODERATION_THRESHOLD || '0.5'),
    // Direct safer value (0.005-0.1) - if set, this overrides threshold mapping
    saferValue: process.env.SAFER_VALUE && process.env.SAFER_VALUE.trim() !== '' 
      ? parseFloat(process.env.SAFER_VALUE) 
      : null,
  },
  rateLimit: {
    messagesPerMinute: parseInt(process.env.RATE_LIMIT_PER_MINUTE || '30', 10),
  },
  ai: {
    enabled: process.env.AI_ENABLED !== 'false', // Default to true unless explicitly disabled
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.AI_MODEL || 'gpt-3.5-turbo', // Default to GPT-3.5 Turbo
    maxResponseLength: parseInt(process.env.AI_MAX_RESPONSE_LENGTH || '200', 10),
    conversationHistorySize: parseInt(process.env.AI_CONVERSATION_HISTORY_SIZE || '5', 10),
  },
};

// Validate required configuration
if (!config.huggingFace.apiToken && config.server.nodeEnv === 'production') {
  console.warn('Warning: HF_API_TOKEN is not set. Moderation API calls will fail.');
}

if (config.ai.enabled && !config.ai.apiKey && config.server.nodeEnv === 'production') {
  console.warn('Warning: OPENAI_API_KEY is not set. AI agent responses will fail.');
}
