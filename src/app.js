const express = require('express');
const path = require('path');
const cors = require('cors');
// Requiring the config first guarantees .env (dotenv) is loaded before any
// process.env value below is read.
const config = require('./config');
const apiRoutes = require('./routes/api.routes');
const { errorHandler, notFoundHandler } = require('./middlewares/errorHandler');

const app = express();

// Middlewares
app.use(cors());
// Bulk subtitle payloads (2-step translation, video generation and project
// autosave) can easily exceed Express' 100kb default and would fail with 413.
app.use(express.json({ limit: config.bodyLimit }));
app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

// Serve static frontend files from the 'public' directory
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve generated voices from 'storage/voices' directory
app.use('/storage/voices', express.static(path.join(__dirname, '..', 'storage', 'voices')));

// Serve persistent videos from 'storage/videos' directory
app.use('/storage/videos', express.static(path.join(__dirname, '..', 'storage', 'videos')));

// Serve exported videos from 'storage/exports' directory
app.use('/storage/exports', express.static(path.join(__dirname, '..', 'storage', 'exports')));

// API Routes
app.use('/api', apiRoutes);

// Catch-all 404 handler for undefined routes
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

module.exports = app;
