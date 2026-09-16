/**
 * Client-Side Terminal Logger Bridge for DAI Dubber Pro
 * Forwards frontend states and audio processes to the backend terminal in real-time.
 */

export function logToTerminal(category, message, details = null) {
  try {
    fetch('/api/terminal-log', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ category, message, details })
    }).catch(() => {
      // Ignore network errors on logging
    });
  } catch (_) {
    // Non-blocking
  }
}
