const app = require('./app');
const config = require('./config');

const server = app.listen(config.port, () => {
  console.log(`=============================================`);
  console.log(`  Dubber Project Server is running!`);
  console.log(`  Environment : ${config.nodeEnv}`);
  console.log(`  Local URL   : http://localhost:${config.port}`);
  console.log(`  API Health  : http://localhost:${config.port}/api/health`);
  console.log(`=============================================`);

  const keyManager = require('./services/key-manager.service');
  keyManager.logPoolStatus();
});

// Configure 10-minute timeout for large audio uploads and AI processing
server.setTimeout(10 * 60 * 1000);
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ [SERVER:ERROR] Port ${config.port} is already in use!`);
  } else {
    console.error(`❌ [SERVER:ERROR] Server error:`, err.message);
  }
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
