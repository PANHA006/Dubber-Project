/**
 * Time utility functions for parsing and formatting subtitle timestamps
 */

/**
 * Robustly parses various timecode formats into fractional seconds.
 * Supports:
 *   - Numbers (e.g. 12.345)
 *   - SRT/VTT format: "00:01:23,450" or "00:01:23.450"
 *   - Short timecode: "01:23,450" or "01:23.450"
 *   - HH:MM:SS format: "01:02:03"
 *   - MM:SS format: "05:41"
 *   - Plain numeric string: "12.345"
 *
 * @param {string|number|null|undefined} val
 * @returns {number} Time in seconds (>= 0)
 */
function parseTimeToSeconds(val) {
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : Math.max(0, val);
  }
  if (!val || typeof val !== 'string') {
    return 0;
  }

  const trimmed = val.trim();
  if (!trimmed) return 0;

  // 1. Standard HH:MM:SS,mmm or HH:MM:SS.mmm (e.g. 01:23:45,678)
  const hmsMatch = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (hmsMatch) {
    const h = parseInt(hmsMatch[1], 10);
    const m = parseInt(hmsMatch[2], 10);
    const s = parseInt(hmsMatch[3], 10);
    const ms = parseInt(hmsMatch[4].padEnd(3, '0').slice(0, 3), 10);
    return h * 3600 + m * 60 + s + ms / 1000;
  }

  // 2. Short MM:SS,mmm or MM:SS.mmm (e.g. 05:41,199)
  const msMatch = trimmed.match(/^(\d{1,2}):(\d{2})[,.](\d{1,3})$/);
  if (msMatch) {
    const m = parseInt(msMatch[1], 10);
    const s = parseInt(msMatch[2], 10);
    const ms = parseInt(msMatch[3].padEnd(3, '0').slice(0, 3), 10);
    return m * 60 + s + ms / 1000;
  }

  // 3. HH:MM:SS without ms
  const hmsNoMs = trimmed.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
  if (hmsNoMs) {
    return parseInt(hmsNoMs[1], 10) * 3600 + parseInt(hmsNoMs[2], 10) * 60 + parseInt(hmsNoMs[3], 10);
  }

  // 4. MM:SS without ms
  const mmssMatch = trimmed.match(/^(\d{1,2}):(\d{2})$/);
  if (mmssMatch) {
    return parseInt(mmssMatch[1], 10) * 60 + parseInt(mmssMatch[2], 10);
  }

  // 5. Plain seconds string (e.g. "12.34")
  const parsed = parseFloat(trimmed);
  return isNaN(parsed) ? 0 : Math.max(0, parsed);
}

module.exports = {
  parseTimeToSeconds
};
