import axios from 'axios';
import { Client } from '@gradio/client';
import { config } from './config.js';

// Cache the Gradio client connection
let gradioClient = null;
let clientConnectionPromise = null;

/**
 * Get or create the Gradio client connection
 * @returns {Promise<Client>}
 */
async function getGradioClient() {
  if (gradioClient) {
    return gradioClient;
  }
  
  if (clientConnectionPromise) {
    return clientConnectionPromise;
  }
  
  clientConnectionPromise = Client.connect("duchaba/Friendly_Text_Moderation")
    .then(client => {
      gradioClient = client;
      clientConnectionPromise = null;
      return client;
    })
    .catch(error => {
      clientConnectionPromise = null;
      throw error;
    });
  
  return clientConnectionPromise;
}

/**
 * Close the Gradio client connection
 * Call this during graceful shutdown
 */
export async function closeGradioClient() {
  if (gradioClient) {
    try {
      // Try to close/disconnect the client if methods exist
      // The @gradio/client may use WebSocket connections that need cleanup
      if (typeof gradioClient.close === 'function') {
        await gradioClient.close();
      } else if (typeof gradioClient.disconnect === 'function') {
        await gradioClient.disconnect();
      } else if (gradioClient.ws && typeof gradioClient.ws.close === 'function') {
        // Try to close underlying WebSocket if it exists
        gradioClient.ws.close();
      }
      console.log('Gradio client connection closed');
    } catch (error) {
      console.error('Error closing Gradio client:', error.message);
    } finally {
      // Always clear references to allow garbage collection
      gradioClient = null;
      clientConnectionPromise = null;
    }
  }
}

/**
 * Calls the Hugging Face API to moderate text content
 * @param {string} text - The text to moderate
 * @returns {Promise<Object>} - Moderation result with isBlocked flag and details
 */
export async function moderateText(text) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return {
      isBlocked: false,
      reason: 'Empty message',
      details: null,
    };
  }

  try {
    // Check if we're using a Space API (hf.space) or Model API (api-inference.huggingface.co)
    const isSpaceAPI = config.huggingFace.apiUrl.includes('.hf.space') || 
                       config.huggingFace.apiUrl.includes('duchaba/Friendly_Text_Moderation');
    
    let response;
    if (isSpaceAPI) {
      // Use Gradio Client library as per Space documentation
      // Option 1: Use SAFER_VALUE directly if set in .env (0.005-0.1) - takes precedence
      // Option 2: Map MODERATION_THRESHOLD (0.0-1.0) to safer range (0.005-0.1)
      let saferValue;
      let thresholdSource;
      
      if (config.moderation.saferValue !== null && config.moderation.saferValue !== undefined) {
        // Use direct safer value from .env (takes precedence)
        saferValue = Math.max(0.005, Math.min(0.1, config.moderation.saferValue));
        thresholdSource = `SAFER_VALUE=${config.moderation.saferValue}`;
      } else {
        // Map threshold to safer value
        // Higher threshold = stricter = lower safer value
        // Threshold 0.0 (very permissive) -> safer 0.1 (less safe, allows more)
        // Threshold 1.0 (very strict) -> safer 0.005 (very safe, blocks more)
        const threshold = config.moderation.threshold || 0.5;
        saferValue = Math.max(0.005, Math.min(0.1, 0.1 - (threshold * 0.095)));
        thresholdSource = `MODERATION_THRESHOLD=${threshold}`;
      }
      
      // Log which value is being used
      const thresholdLevel = saferValue > 0.08 ? 'PERMISSIVE' : saferValue < 0.02 ? 'STRICT' : 'MODERATE';
      console.log(`[Moderation] ${thresholdSource} → safer=${saferValue.toFixed(4)} (${thresholdLevel})`);
      
      // Get or create the Gradio client connection
      const client = await getGradioClient();
      
      // Call the API endpoint as shown in the Space documentation
      const result = await client.predict("/fetch_toxicity_level", {
        msg: text,
        safer: saferValue,
      });
      
      // Result is an array: [plot_output, json_string]
      // The json_string contains the moderation results
      return parseGradioClientResponse(result, text);
    } else {
      // Standard Inference API format
      response = await axios.post(
        config.huggingFace.apiUrl,
        { inputs: text },
        {
          headers: {
            'Authorization': `Bearer ${config.huggingFace.apiToken}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000, // 10 second timeout
        }
      );
      // Parse the response based on Hugging Face API format
      const moderationResult = parseModerationResponse(response.data, text);
      return moderationResult;
    }
  } catch (error) {
    console.error('Moderation API error:', error.message);
    
    // Graceful degradation: if API fails, we can either:
    // 1. Block all messages (safer)
    // 2. Allow all messages with warning (more permissive)
    // Using option 2 for better UX, but logging the error
    return {
      isBlocked: false,
      reason: 'API_ERROR',
      details: {
        error: error.message,
        fallback: 'Message allowed due to API error',
      },
    };
  }
}

/**
 * Parses Gradio Client response
 * Response format: { type: "data", time: "...", data: [plot_output, json_string] }
 * The json_string contains the actual moderation results
 */
function parseGradioClientResponse(clientResponse, originalText) {
  try {
    // Gradio client returns an object: { type: "data", data: [plot_data, json_string] }
    // Or sometimes just the array directly
    let dataArray;
    
    if (clientResponse && clientResponse.data && Array.isArray(clientResponse.data)) {
      // Response is wrapped in an object with data property
      dataArray = clientResponse.data;
    } else if (Array.isArray(clientResponse)) {
      // Response is directly an array
      dataArray = clientResponse;
    } else {
      console.error('Unexpected Gradio client response format:', JSON.stringify(clientResponse).substring(0, 200));
      return {
        isBlocked: false,
        reason: 'UNEXPECTED_RESPONSE',
        details: { response: clientResponse },
      };
    }

    if (!Array.isArray(dataArray) || dataArray.length < 2) {
      console.error('Unexpected data array format:', dataArray);
      return {
        isBlocked: false,
        reason: 'UNEXPECTED_RESPONSE',
        details: { response: clientResponse },
      };
    }

    // The second element is the JSON string output
    const jsonString = dataArray[1];
    
    if (!jsonString) {
      console.error('No JSON string found in response:', dataArray);
      return {
        isBlocked: false,
        reason: 'UNEXPECTED_RESPONSE',
        details: { response: clientResponse },
      };
    }
    
    // Parse the JSON string
    let moderationData;
    if (typeof jsonString === 'string') {
      try {
        moderationData = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('Failed to parse JSON string:', parseError);
        console.error('JSON string:', jsonString.substring(0, 200));
        return {
          isBlocked: false,
          reason: 'PARSE_ERROR',
          details: { 
            error: parseError.message,
            jsonString: jsonString.substring(0, 200),
          },
        };
      }
    } else {
      moderationData = jsonString;
    }

    // Parse the moderation data
    return parseModerationResponse(moderationData, originalText);
  } catch (error) {
    console.error('Error parsing Gradio client response:', error);
    return {
      isBlocked: false,
      reason: 'PARSE_ERROR',
      details: { 
        error: error.message,
        response: JSON.stringify(clientResponse).substring(0, 200),
      },
    };
  }
}

/**
 * Parses the Hugging Face API response and determines if message should be blocked
 * @param {any} apiResponse - The raw API response
 * @param {string} originalText - The original text that was moderated
 * @returns {Object} - Parsed moderation result
 */
function parseModerationResponse(apiResponse, originalText) {
  // Handle different response formats from Hugging Face API
  let scores = {};
  
  // The API might return an array or object
  if (Array.isArray(apiResponse)) {
    // Check if it's an array of arrays (Vrandan format: [[label, score], ...])
    if (apiResponse.length > 0 && Array.isArray(apiResponse[0])) {
      // Convert array format to object: [[label, score], ...] -> {label: score, ...}
      apiResponse.forEach(([label, score]) => {
        if (typeof label === 'string' && typeof score === 'number') {
          scores[label.toLowerCase()] = score;
        }
      });
    } else {
      // If array of objects, take the first element
      scores = apiResponse[0] || {};
    }
  } else if (typeof apiResponse === 'object') {
    scores = apiResponse;
  } else {
    // Unexpected format
    return {
      isBlocked: false,
      reason: 'UNEXPECTED_RESPONSE',
      details: { response: apiResponse },
    };
  }

  // Extract toxicity scores
  // Friendly Text Moderation API returns scores with underscores and boolean flags
  // Categories: harassment, harassment_threatening, hate, hate_threatening, 
  // illicit, illicit_violent, self_harm, self_harm_instructions, self_harm_intent,
  // sexual, sexual_minors, violence, violence_graphic
  // Also includes: is_flagged, is_safer_flagged (boolean flags)
  const toxicCategories = [
    // Underscore format (what the API actually returns)
    'violence_graphic',
    'violence',
    'sexual_minors',
    'sexual',
    'self_harm_intent',
    'self_harm_instructions',
    'self_harm',
    'hate_threatening',
    'hate',
    'harassment_threatening',
    'harassment',
    'illicit_violent',
    'illicit',
    // Slash format (also returned)
    'violence/graphic',
    'sexual/minors',
    'self-harm/intent',
    'self-harm/instructions',
    'self-harm',
    'hate/threatening',
    'harassment/threatening',
    'illicit/violent',
    // Space format (for compatibility)
    'violence graphic',
    'sexual minors',
    'self harm',
    'hate threatening',
    'harassment threatening',
  ];

  const categoryScores = {};
  let maxScore = 0;
  let maxCategory = null;

  // Check each category
  for (const category of toxicCategories) {
    // Try different possible key formats (case-insensitive)
    const categoryLower = category.toLowerCase();
    const score = scores[category] || 
                  scores[categoryLower] ||
                  scores[`${category}_score`] || 
                  scores[`${categoryLower}_score`] ||
                  scores[`${category}Score`] ||
                  scores[`${categoryLower}Score`] ||
                  0;
    
    if (typeof score === 'number') {
      // Skip "safe content" as it's the positive label
      if (categoryLower !== 'safe content') {
        categoryScores[category] = score;
        if (score > maxScore) {
          maxScore = score;
          maxCategory = category;
        }
      }
    }
  }

  // Check the API's built-in flags (most reliable)
  // The API returns is_flagged and is_safer_flagged as boolean values
  const isFlagged = scores['is_flagged'] === true;
  const isSaferFlagged = scores['is_safer_flagged'] === true;
  const hasFlags = 'is_flagged' in scores || 'is_safer_flagged' in scores;
  
  // Check if "safe" or "OK" score exists (non-offensive content)
  const okScore = scores['safe'] ||
                  scores['Safe'] ||
                  scores['OK'] || 
                  scores['ok'] || 
                  scores['non_toxic'] || 
                  scores['safe content'] ||
                  scores['Safe Content'] ||
                  0;

  // Determine if message should be blocked
  // The API's is_safer_flagged flag is based on the safer parameter we sent (derived from MODERATION_THRESHOLD)
  // So the threshold IS being used, but indirectly through the API's flag system
  let isBlocked;
  if (hasFlags) {
    // Use the API's built-in flags (most reliable)
    // is_flagged = flagged by the model itself (strict detection, independent of threshold)
    // is_safer_flagged = flagged based on the safer threshold we sent (this uses MODERATION_THRESHOLD!)
    // 
    // IMPORTANT: is_safer_flagged is calculated by the API based on the safer parameter,
    // which is derived from MODERATION_THRESHOLD. So changing MODERATION_THRESHOLD
    // DOES affect moderation by changing what the API considers "safer_flagged"
    isBlocked = isFlagged || isSaferFlagged;
    
    // Log the decision - is_safer_flagged is based on your MODERATION_THRESHOLD!
    console.log(`[Moderation] Decision: is_flagged=${isFlagged}, is_safer_flagged=${isSaferFlagged} (from threshold ${config.moderation.threshold}) → BLOCKED: ${isBlocked}`);
  } else {
    // Fallback: Use threshold comparison if flags not available
    // Block if any toxic category exceeds threshold OR if OK score is below threshold
    isBlocked = maxScore >= config.moderation.threshold || 
                (okScore > 0 && okScore < (1 - config.moderation.threshold));
    
    if (config.server.nodeEnv === 'development') {
      console.log(`[Moderation] Fallback threshold check - maxScore: ${maxScore}, threshold: ${config.moderation.threshold}, blocked: ${isBlocked}`);
    }
  }

  // Build reason message
  let reason;
  if (isBlocked) {
    if (hasFlags) {
      if (isFlagged && isSaferFlagged) {
        reason = `Blocked: Flagged by model and safer threshold`;
      } else if (isFlagged) {
        reason = `Blocked: Flagged by model`;
      } else {
        reason = `Blocked: Exceeds safer threshold (${maxCategory || 'toxicity'})`;
      }
    } else {
      reason = `Blocked due to ${maxCategory || 'toxicity'} (score: ${maxScore.toFixed(4)})`;
    }
  } else {
    reason = 'OK';
  }

  return {
    isBlocked,
    reason,
    details: {
      scores: categoryScores,
      maxScore,
      maxCategory,
      okScore,
      threshold: config.moderation.threshold,
      isFlagged: hasFlags ? isFlagged : undefined,
      isSaferFlagged: hasFlags ? isSaferFlagged : undefined,
      // Include raw scores for debugging (but limit size)
      rawScores: Object.keys(scores).length < 50 ? scores : undefined,
    },
  };
}
