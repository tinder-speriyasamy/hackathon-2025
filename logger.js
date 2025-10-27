/**
 * Debug logger utility for fast iteration and debugging
 *
 * Usage:
 *   const logger = require('./logger');
 *   logger.info('User message', { from: '+1234567890', body: 'Hello' });
 *   logger.error('Failed to send SMS', error);
 *
 * @typedef {Object} LogData
 * @property {string} level - Log level (INFO, ERROR, WARN, DEBUG)
 * @property {string} timestamp - ISO timestamp
 * @property {string} message - Log message
 * @property {*} [data] - Optional data to log
 */

const LOG_LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

/**
 * Format and output a log message with timestamp and colors
 * @param {string} level - Log level
 * @param {string} message - Message to log
 * @param {*} [data] - Optional data to log
 */
function log(level, message, data) {
  const timestamp = new Date().toISOString();

  // Color codes for different log levels
  const colors = {
    DEBUG: '\x1b[36m', // Cyan
    INFO: '\x1b[32m',  // Green
    WARN: '\x1b[33m',  // Yellow
    ERROR: '\x1b[31m'  // Red
  };
  const reset = '\x1b[0m';

  const color = colors[level] || '';
  const prefix = `${color}[${timestamp}] [${level}]${reset}`;

  console.log(`${prefix} ${message}`);

  if (data !== undefined) {
    if (data instanceof Error) {
      console.log(`${color}  Error:${reset}`, data.message);
      console.log(`${color}  Stack:${reset}`, data.stack);
    } else {
      console.log(`${color}  Data:${reset}`, JSON.stringify(data, null, 2));
    }
  }

  console.log(''); // Empty line for readability
}

module.exports = {
  /**
   * Log debug information
   * @param {string} message - Debug message
   * @param {*} [data] - Optional data
   */
  debug: (message, data) => log(LOG_LEVELS.DEBUG, message, data),

  /**
   * Log general information
   * @param {string} message - Info message
   * @param {*} [data] - Optional data
   */
  info: (message, data) => log(LOG_LEVELS.INFO, message, data),

  /**
   * Log warnings
   * @param {string} message - Warning message
   * @param {*} [data] - Optional data
   */
  warn: (message, data) => log(LOG_LEVELS.WARN, message, data),

  /**
   * Log errors
   * @param {string} message - Error message
   * @param {*} [data] - Optional data or Error object
   */
  error: (message, data) => log(LOG_LEVELS.ERROR, message, data)
};
