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

/**
 * Format real-time progress bar with ANSI color blocks: [██████████░░░░░░░░░░] 50%
 */
function formatTerminalProgress(category = 'PROGRESS', current = 0, total = 100, message = '', details = null) {
  const now = new Date();
  const time = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');

  const safeTotal = Math.max(1, Number(total) || 1);
  const safeCurrent = Math.min(safeTotal, Math.max(0, Number(current) || 0));
  const pct = Math.min(100, Math.max(0, Math.round((safeCurrent / safeTotal) * 100)));

  const barLength = 20;
  const filledLength = Math.round((pct / 100) * barLength);
  const emptyLength = Math.max(0, barLength - filledLength);
  const filledBar = '█'.repeat(filledLength);
  const emptyBar = '░'.repeat(emptyLength);

  let barColor = colors.yellow;
  let icon = '⏳';
  if (pct >= 100) {
    barColor = colors.green;
    icon = '✅';
  } else if (pct >= 50) {
    barColor = colors.cyan;
  }

  const categoryBadge = `${colors.yellow}${colors.bright}[${category}]${colors.reset}`;
  const timeBadge = `${colors.gray}[${time}]${colors.reset}`;
  const progressBar = `${barColor}[${filledBar}${colors.dim}${emptyBar}${colors.reset}${barColor}]${colors.reset}`;
  const pctStr = `${colors.bright}${String(pct).padStart(3, ' ')}%${colors.reset} (${safeCurrent}/${safeTotal})`;

  console.log(`${timeBadge} ${icon} ${categoryBadge} ${progressBar} ${pctStr} ${message}`);

  if (details && typeof details === 'object' && Object.keys(details).length > 0) {
    const detailStr = Object.entries(details)
      .map(([k, v]) => `${colors.cyan}${k}:${colors.reset} ${v}`)
      .join(' | ');
    console.log(`   ${colors.dim}↳ ${detailStr}${colors.reset}`);
  }
}

module.exports = {
  formatTerminalLog,
  formatTerminalProgress,
  colors
};
