import chalk from 'chalk';

enum LogLevel {
  INFO = 'INFO',
  ERROR = 'ERROR',
  WARNING = 'WARNING',
  SUCCESS = 'SUCCESS',
  SECTION = 'SECTION'
}

const INDENT = '  ';
const LINE_SEPARATOR = '─'.repeat(50);

/**
 * Enhanced logging utility for EVM Event Parser
 */
export const logger = {
  /**
   * Log an informational message
   */
  info: (message: string, indent: number = 0): void => {
    console.log(`${INDENT.repeat(indent)}${message}`);
  },

  /**
   * Log an error message
   */
  error: (message: string, error?: any): void => {
    console.error(chalk.red(`❌ ERROR: ${message}`));
    if (error) {
      console.error(chalk.red(`${INDENT}${error}`));
    }
  },

  /**
   * Log a warning message
   */
  warn: (message: string): void => {
    console.warn(chalk.yellow(`⚠️  WARNING: ${message}`));
  },

  /**
   * Log a success message
   */
  success: (message: string): void => {
    console.log(chalk.green(`✅ ${message}`));
  },

  /**
   * Log a section header
   */
  section: (title: string): void => {
    console.log(`\n${chalk.bold.blue(title)}\n${chalk.blue(LINE_SEPARATOR)}`);
  },

  /**
   * Log progress information
   */
  progress: (message: string, current: number, total: number): void => {
    const percent = Math.round((current / total) * 100);
    console.log(`${INDENT}${message}: ${current}/${total} (${percent}%)`);
  }
};