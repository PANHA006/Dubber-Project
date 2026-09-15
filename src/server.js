const app = require('./app');
const config = require('./config');

const server = app.listen(config.port, () => {
  console.log(`=============================================`);
  console.log(`  Dubber Project Server is running!`);
  console.log(`  Environment : ${config.nodeEnv}`);
  console.log(`  Local URL   : http://localhost:${config.port}`);
  console.log(`  API Health  : http://localhost:${config.port}/api/health`);
  console.log(`=============================================`);
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
