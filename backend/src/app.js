import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import healthRouter from './routes/health.js';
import incidentsRouter from './routes/incidents.js';
import authRouter from './routes/auth.js';
import dispatchersRouter from './routes/dispatchers.js';
import qrcodesRouter from './routes/qrcodes.js';
import auditLogRouter from './routes/auditLog.js';
import venuesRouter from './routes/venues.js';
import evidenceRouter from './routes/evidence.js';

const app = express();

app.use(express.json());

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Acum linia ta va funcționa corect:
const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

app.use('/health', healthRouter);
app.use('/incidents', incidentsRouter);
app.use('/auth', authRouter);
app.use('/dispatchers', dispatchersRouter);
app.use('/qrcodes', qrcodesRouter);
app.use('/audit-log', auditLogRouter);
app.use('/venues', venuesRouter);
app.use('/evidence', evidenceRouter);

app.use(notFoundHandler);   // orice rută nepotrivită
app.use(errorHandler); 

const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

process.on('SIGTERM', () => {
  console.log('Shutting down the server on SIGTERM');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('Shutting down the server on SIGINT');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}); 
