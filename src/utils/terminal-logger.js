/**
 * Professional ANSI Colorized Terminal Logger for DAI Dubber Pro
 */

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
};

function formatTerminalLog(category = 'INFO', message = '', details = null) {
  const now = new Date();
  const time = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

  let color = colors.cyan;
  let icon = 'ℹ️ ';

  const catUpper = category.toUpperCase();
  if (catUpper.includes('CLIENT') || catUpper.includes('STATE')) {
    color = colors.blue;
    icon = '🎬';
  } else if (catUpper.includes('AUDIO') || catUpper.includes('CHUNK')) {
    color = colors.yellow;
    icon = '🎵';
  } else if (catUpper.includes('GEMINI') || catUpper.includes('AI')) {
    color = colors.green;
    icon = '🤖';
  } else if (catUpper.includes('TIMELINE') || catUpper.includes('SYNC')) {
    color = colors.magenta;
    icon = '⏱️ ';
  } else if (catUpper.includes('UPLOAD') || catUpper.includes('SERVER')) {
    color = colors.cyan;
    icon = '📥';
  } else if (catUpper.includes('TABLE') || catUpper.includes('UI')) {
    color = colors.white;
    icon = '📋';
  } else if (catUpper.includes('ERROR') || catUpper.includes('FAIL')) {
    color = colors.red;
    icon = '❌';
  }

  const categoryBadge = `${color}${colors.bright}[${category}]${colors.reset}`;
  const timeBadge = `${colors.gray}[${time}]${colors.reset}`;
  console.log(`${timeBadge} ${icon} ${categoryBadge} ${message}`);

  if (details && typeof details === 'object' && Object.keys(details).length > 0) {
    const detailStr = Object.entries(details)
      .map(([k, v]) => `${colors.cyan}${k}:${colors.reset} ${v}`)
      .join(' | ');
    console.log(`   ${colors.dim}↳ ${detailStr}${colors.reset}`);
  }
}

module.exports = {
  formatTerminalLog,
  colors
};
