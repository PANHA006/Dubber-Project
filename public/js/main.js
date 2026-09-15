/**
 * Dubber Project - Client JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
  const connectionStatus = document.getElementById('connection-status');
  const btnHealth = document.getElementById('btn-health');
  const btnStatus = document.getElementById('btn-status');
  const apiOutput = document.getElementById('api-output');
  const responseTime = document.getElementById('response-time');

  // Check initial server health on page load
  checkHealth(false);

  // Health check button listener
  btnHealth?.addEventListener('click', () => {
    checkHealth(true);
  });

  // Status check button listener
  btnStatus?.addEventListener('click', async () => {
    await fetchEndpoint('/api/status', 'GET');
  });

  async function checkHealth(updateOutput = false) {
    try {
      const startTime = performance.now();
      const res = await fetch('/api/health');
      const data = await res.json();
      const duration = (performance.now() - startTime).toFixed(1);

      if (res.ok && data.success) {
        if (connectionStatus) {
          connectionStatus.innerHTML = `
            <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span class="text-emerald-400">Server Connected</span>
          `;
          connectionStatus.className = "flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400";
        }
      } else {
        throw new Error('Server returned unsuccessful status');
      }

      if (updateOutput && apiOutput) {
        responseTime.textContent = `${duration}ms`;
        apiOutput.textContent = JSON.stringify(data, null, 2);
      }
    } catch (err) {
      if (connectionStatus) {
        connectionStatus.innerHTML = `
          <span class="w-2 h-2 rounded-full bg-rose-500"></span>
          <span class="text-rose-400">Server Disconnected</span>
        `;
        connectionStatus.className = "flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full bg-rose-950/60 border border-rose-500/30 text-rose-400";
      }

      if (updateOutput && apiOutput) {
        responseTime.textContent = `Error`;
        apiOutput.textContent = `Error connecting to API: ${err.message}`;
      }
    }
  }

  async function fetchEndpoint(endpoint, method = 'GET') {
    if (!apiOutput) return;
    try {
      apiOutput.textContent = `កំពុងទាញយកទិន្នន័យពី ${endpoint}...`;
      const startTime = performance.now();
      const res = await fetch(endpoint, { method });
      const data = await res.json();
      const duration = (performance.now() - startTime).toFixed(1);

      responseTime.textContent = `${duration}ms`;
      apiOutput.textContent = JSON.stringify(data, null, 2);
    } catch (err) {
      responseTime.textContent = `Error`;
      apiOutput.textContent = `បរាជ័យក្នុងការទាញយកពី ${endpoint}: ${err.message}`;
    }
  }
});
