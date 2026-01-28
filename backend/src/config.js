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
};

// Validate required configuration
if (!config.huggingFace.apiToken && config.server.nodeEnv === 'production') {
  console.warn('Warning: HF_API_TOKEN is not set. Moderation API calls will fail.');
}
