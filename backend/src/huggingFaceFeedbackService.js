import axios from 'axios';
import { config } from './config.js';

/**
 * Submits feedback to Hugging Face Hub as a dataset entry
 * This creates/updates a dataset repository with feedback data
 * 
 * @param {Object} feedbackData - The feedback data to submit
 * @returns {Promise<Object>} - Result of the submission
 */
export async function submitFeedbackToHuggingFace(feedbackData) {
  try {
    const apiToken = config.huggingFace.apiToken;
    
    if (!apiToken) {
      return {
        success: false,
        error: 'HF_API_TOKEN not configured. Cannot submit feedback to Hugging Face.',
      };
    }

    // Option 1: Try to submit via Hugging Face Hub API (create/update dataset)
    // This requires write permissions on the token
    const datasetRepo = process.env.HF_FEEDBACK_DATASET_REPO || 'duchaba/moderation-feedback';
    
    try {
      // Create or update dataset entry via Hub API
      const hubApiUrl = `https://huggingface.co/api/datasets/${datasetRepo}`;
      
      // Prepare feedback data in a format suitable for dataset
      const datasetEntry = {
        text: feedbackData.messageText,
        was_blocked: feedbackData.wasBlocked,
        should_have_been_blocked: feedbackData.shouldHaveBeenBlocked,
        is_false_positive: feedbackData.isFalsePositive,
        is_false_negative: feedbackData.isFalseNegative,
        moderation_scores: feedbackData.moderationResult?.scores || {},
        max_score: feedbackData.moderationResult?.maxScore || 0,
        max_category: feedbackData.moderationResult?.maxCategory || null,
        threshold: feedbackData.threshold,
        reason: feedbackData.reason,
        timestamp: feedbackData.timestamp || new Date().toISOString(),
      };

      // Note: Hub API dataset upload is complex and typically requires
      // using the huggingface_hub Python library or manual upload
      // For now, we'll log locally and provide instructions for manual upload
      
      return {
        success: false,
        error: 'Direct Hub API submission requires Python huggingface_hub library',
        suggestion: 'Feedback has been logged locally. See instructions for manual upload.',
        datasetEntry, // Return the formatted entry for manual upload
      };
    } catch (error) {
      console.error('Error submitting to Hugging Face Hub:', error);
      return {
        success: false,
        error: error.message,
        suggestion: 'Feedback logged locally. Consider using Hugging Face Hub Python library for automated submission.',
      };
    }
  } catch (error) {
    console.error('Error in submitFeedbackToHuggingFace:', error);
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Formats feedback data for Hugging Face dataset upload
 * Returns data in a format ready for CSV/JSON dataset upload
 */
export function formatFeedbackForDataset(feedbackData) {
  return {
    text: feedbackData.messageText,
    label: feedbackData.shouldHaveBeenBlocked ? 'toxic' : 'safe',
    was_blocked: feedbackData.wasBlocked,
    should_have_been_blocked: feedbackData.shouldHaveBeenBlocked,
    is_false_positive: feedbackData.isFalsePositive,
    is_false_negative: feedbackData.isFalseNegative,
    moderation_scores: JSON.stringify(feedbackData.moderationResult?.scores || {}),
    max_score: feedbackData.moderationResult?.maxScore || 0,
    max_category: feedbackData.moderationResult?.maxCategory || null,
    threshold: feedbackData.threshold,
    reason: feedbackData.reason,
    timestamp: feedbackData.timestamp || new Date().toISOString(),
  };
}

/**
 * Exports feedback logs to CSV format for easy Hugging Face dataset upload
 */
export function exportFeedbackToCSV(logs) {
  if (!logs || logs.length === 0) {
    return '';
  }

  // CSV header
  const headers = [
    'text',
    'label',
    'was_blocked',
    'should_have_been_blocked',
    'is_false_positive',
    'is_false_negative',
    'max_score',
    'max_category',
    'threshold',
    'reason',
    'timestamp',
  ];

  // CSV rows
  const rows = logs.map(log => {
    const formatted = formatFeedbackForDataset(log);
    return [
      `"${formatted.text.replace(/"/g, '""')}"`, // Escape quotes
      formatted.label,
      formatted.was_blocked,
      formatted.should_have_been_blocked,
      formatted.is_false_positive,
      formatted.is_false_negative,
      formatted.max_score,
      formatted.max_category || '',
      formatted.threshold,
      `"${formatted.reason.replace(/"/g, '""')}"`,
      formatted.timestamp,
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}
