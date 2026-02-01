import { getModerationFeedbackLogs } from './loggingService.js';

/**
 * Analyzes feedback logs to provide insights for improving moderation
 */
export function analyzeFeedbackLogs(logs) {
  if (!logs || logs.length === 0) {
    return {
      total: 0,
      message: 'No feedback logs available for analysis',
    };
  }

  const total = logs.length;
  const falsePositives = logs.filter(log => log.isFalsePositive);
  const falseNegatives = logs.filter(log => log.isFalseNegative);
  
  const falsePositiveRate = (falsePositives.length / total) * 100;
  const falseNegativeRate = (falseNegatives.length / total) * 100;

  // Analyze problem categories
  const categoryAnalysis = analyzeCategories(logs);
  
  // Analyze threshold effectiveness
  const thresholdAnalysis = analyzeThresholds(logs);
  
  // Find common patterns in false positives
  const falsePositivePatterns = analyzeFalsePositivePatterns(falsePositives);
  
  // Find common patterns in false negatives
  const falseNegativePatterns = analyzeFalseNegativePatterns(falseNegatives);

  // Calculate recommended threshold adjustment
  const thresholdRecommendation = calculateThresholdRecommendation(
    falsePositiveRate,
    falseNegativeRate,
    logs[0]?.threshold || 0.5
  );

  return {
    summary: {
      total,
      falsePositives: falsePositives.length,
      falseNegatives: falseNegatives.length,
      falsePositiveRate: falsePositiveRate.toFixed(2) + '%',
      falseNegativeRate: falseNegativeRate.toFixed(2) + '%',
      accuracy: ((total - falsePositives.length - falseNegatives.length) / total * 100).toFixed(2) + '%',
    },
    categoryAnalysis,
    thresholdAnalysis,
    falsePositivePatterns,
    falseNegativePatterns,
    recommendations: {
      threshold: thresholdRecommendation,
      categories: getCategoryRecommendations(categoryAnalysis),
      actionItems: generateActionItems(falsePositiveRate, falseNegativeRate, categoryAnalysis),
    },
  };
}

/**
 * Analyzes which categories cause most problems
 */
function analyzeCategories(logs) {
  const categoryStats = {};
  
  logs.forEach(log => {
    const category = log.moderationResult?.maxCategory || 'unknown';
    if (!categoryStats[category]) {
      categoryStats[category] = {
        total: 0,
        falsePositives: 0,
        falseNegatives: 0,
        avgScore: 0,
        scores: [],
      };
    }
    
    categoryStats[category].total++;
    if (log.isFalsePositive) categoryStats[category].falsePositives++;
    if (log.isFalseNegative) categoryStats[category].falseNegatives++;
    
    const score = log.moderationResult?.maxScore || 0;
    categoryStats[category].scores.push(score);
    categoryStats[category].avgScore = 
      categoryStats[category].scores.reduce((a, b) => a + b, 0) / categoryStats[category].scores.length;
  });

  // Convert to array and sort by problem rate
  return Object.entries(categoryStats)
    .map(([category, stats]) => ({
      category,
      ...stats,
      falsePositiveRate: (stats.falsePositives / stats.total * 100).toFixed(2) + '%',
      falseNegativeRate: (stats.falseNegatives / stats.total * 100).toFixed(2) + '%',
      problemRate: ((stats.falsePositives + stats.falseNegatives) / stats.total * 100).toFixed(2) + '%',
    }))
    .sort((a, b) => {
      const aProblems = a.falsePositives + a.falseNegatives;
      const bProblems = b.falsePositives + b.falseNegatives;
      return bProblems - aProblems;
    });
}

/**
 * Analyzes threshold effectiveness
 */
function analyzeThresholds(logs) {
  const thresholds = {};
  
  logs.forEach(log => {
    const threshold = log.threshold || 'unknown';
    if (!thresholds[threshold]) {
      thresholds[threshold] = {
        threshold,
        total: 0,
        falsePositives: 0,
        falseNegatives: 0,
      };
    }
    
    thresholds[threshold].total++;
    if (log.isFalsePositive) thresholds[threshold].falsePositives++;
    if (log.isFalseNegative) thresholds[threshold].falseNegatives++;
  });

  return Object.values(thresholds).map(t => ({
    ...t,
    falsePositiveRate: (t.falsePositives / t.total * 100).toFixed(2) + '%',
    falseNegativeRate: (t.falseNegatives / t.total * 100).toFixed(2) + '%',
  }));
}

/**
 * Finds patterns in false positives
 */
function analyzeFalsePositivePatterns(falsePositives) {
  if (falsePositives.length === 0) return { message: 'No false positives to analyze' };

  // Common words/phrases
  const wordFrequency = {};
  falsePositives.forEach(log => {
    const words = log.messageText.toLowerCase().split(/\s+/);
    words.forEach(word => {
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    });
  });

  const commonWords = Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  // Average scores for false positives
  const avgScores = {};
  falsePositives.forEach(log => {
    const scores = log.moderationResult?.scores || {};
    Object.entries(scores).forEach(([category, score]) => {
      if (!avgScores[category]) {
        avgScores[category] = { total: 0, sum: 0 };
      }
      avgScores[category].total++;
      avgScores[category].sum += score;
    });
  });

  const avgScoresFormatted = Object.entries(avgScores).map(([category, data]) => ({
    category,
    avgScore: (data.sum / data.total).toFixed(4),
  })).sort((a, b) => parseFloat(b.avgScore) - parseFloat(a.avgScore));

  return {
    total: falsePositives.length,
    commonWords,
    avgScores: avgScoresFormatted.slice(0, 5),
    insight: falsePositives.length > 5 
      ? 'Consider adjusting threshold or adding whitelist for common false positive words'
      : 'Not enough data for pattern detection',
  };
}

/**
 * Finds patterns in false negatives
 */
function analyzeFalseNegativePatterns(falseNegatives) {
  if (falseNegatives.length === 0) return { message: 'No false negatives to analyze' };

  // Common words/phrases that should have been blocked
  const wordFrequency = {};
  falseNegatives.forEach(log => {
    const words = log.messageText.toLowerCase().split(/\s+/);
    words.forEach(word => {
      wordFrequency[word] = (wordFrequency[word] || 0) + 1;
    });
  });

  const commonWords = Object.entries(wordFrequency)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([word, count]) => ({ word, count }));

  return {
    total: falseNegatives.length,
    commonWords,
    insight: falseNegatives.length > 5
      ? 'Consider lowering threshold or adding blacklist for common toxic words'
      : 'Not enough data for pattern detection',
  };
}

/**
 * Calculates recommended threshold adjustment
 */
function calculateThresholdRecommendation(falsePositiveRate, falseNegativeRate, currentThreshold) {
  let recommendation = currentThreshold;
  let reason = '';

  if (falsePositiveRate > 20) {
    // Too many false positives - increase threshold (make less strict)
    recommendation = Math.min(0.1, currentThreshold * 1.1);
    reason = `High false positive rate (${falsePositiveRate.toFixed(1)}%) suggests threshold is too strict`;
  } else if (falseNegativeRate > 10) {
    // Too many false negatives - decrease threshold (make more strict)
    recommendation = Math.max(0.005, currentThreshold * 0.9);
    reason = `High false negative rate (${falseNegativeRate.toFixed(1)}%) suggests threshold is too loose`;
  } else {
    reason = 'Threshold appears balanced';
  }

  return {
    current: currentThreshold,
    recommended: parseFloat(recommendation.toFixed(4)),
    change: ((recommendation - currentThreshold) / currentThreshold * 100).toFixed(1) + '%',
    reason,
  };
}

/**
 * Gets category-specific recommendations
 */
function getCategoryRecommendations(categoryAnalysis) {
  return categoryAnalysis
    .filter(cat => parseFloat(cat.problemRate) > 20)
    .map(cat => ({
      category: cat.category,
      issue: cat.falsePositives > cat.falseNegatives ? 'Too many false positives' : 'Too many false negatives',
      recommendation: cat.falsePositives > cat.falseNegatives
        ? 'Consider category-specific threshold adjustment or whitelist'
        : 'Consider category-specific threshold adjustment or blacklist',
      problemRate: cat.problemRate,
    }));
}

/**
 * Generates actionable recommendations
 */
function generateActionItems(falsePositiveRate, falseNegativeRate, categoryAnalysis) {
  const items = [];

  if (falsePositiveRate > 20) {
    items.push({
      priority: 'high',
      action: 'Increase moderation threshold (SAFER_VALUE)',
      reason: `False positive rate is ${falsePositiveRate.toFixed(1)}% - too many legitimate messages blocked`,
      impact: 'Will reduce false positives but may increase false negatives',
    });
  }

  if (falseNegativeRate > 10) {
    items.push({
      priority: 'high',
      action: 'Decrease moderation threshold (SAFER_VALUE)',
      reason: `False negative rate is ${falseNegativeRate.toFixed(1)}% - too many toxic messages allowed`,
      impact: 'Will reduce false negatives but may increase false positives',
    });
  }

  const problematicCategories = categoryAnalysis.filter(cat => parseFloat(cat.problemRate) > 30);
  if (problematicCategories.length > 0) {
    items.push({
      priority: 'medium',
      action: 'Review category-specific thresholds',
      reason: `Categories with high error rates: ${problematicCategories.map(c => c.category).join(', ')}`,
      impact: 'Can improve accuracy for specific content types',
    });
  }

  if (items.length === 0) {
    items.push({
      priority: 'low',
      action: 'Continue monitoring',
      reason: 'Current moderation appears balanced',
      impact: 'Maintain current settings',
    });
  }

  return items;
}

/**
 * Gets analytics for a specific date range
 */
export function getAnalytics(dateStr = null) {
  const logs = getModerationFeedbackLogs(dateStr);
  return analyzeFeedbackLogs(logs);
}
