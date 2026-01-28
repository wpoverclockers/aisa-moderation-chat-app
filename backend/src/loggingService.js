import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

/**
 * Logs a moderation feedback (incorrectly flagged message)
 * @param {Object} feedbackData - The feedback data to log
 */
export function logModerationFeedback(feedbackData) {
  try {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      ...feedbackData,
    };

    // Create log filename with date (one file per day)
    const dateStr = new Date().toISOString().split('T')[0];
    const logFile = path.join(logsDir, `moderation-feedback-${dateStr}.json`);

    // Read existing logs or create new array
    let logs = [];
    if (fs.existsSync(logFile)) {
      try {
        const fileContent = fs.readFileSync(logFile, 'utf8');
        logs = JSON.parse(fileContent);
      } catch (error) {
        console.error('Error reading log file:', error);
        logs = [];
      }
    }

    // Add new log entry
    logs.push(logEntry);

    // Write back to file
    fs.writeFileSync(logFile, JSON.stringify(logs, null, 2), 'utf8');

    console.log(`✅ Moderation feedback logged to ${logFile}`);
    return { success: true, logFile };
  } catch (error) {
    console.error('Error logging moderation feedback:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Gets all moderation feedback logs
 * @param {string} dateStr - Optional date string (YYYY-MM-DD) to filter logs
 * @returns {Array} Array of log entries
 */
export function getModerationFeedbackLogs(dateStr = null) {
  try {
    if (dateStr) {
      const logFile = path.join(logsDir, `moderation-feedback-${dateStr}.json`);
      if (fs.existsSync(logFile)) {
        const fileContent = fs.readFileSync(logFile, 'utf8');
        return JSON.parse(fileContent);
      }
      return [];
    }

    // Return all log files
    const files = fs.readdirSync(logsDir)
      .filter(file => file.startsWith('moderation-feedback-') && file.endsWith('.json'))
      .sort()
      .reverse(); // Most recent first

    const allLogs = [];
    for (const file of files) {
      const filePath = path.join(logsDir, file);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const logs = JSON.parse(fileContent);
      allLogs.push(...logs);
    }

    return allLogs;
  } catch (error) {
    console.error('Error reading moderation feedback logs:', error);
    return [];
  }
}
