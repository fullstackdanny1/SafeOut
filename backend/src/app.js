import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

import healthRouter from './routes/health.js';
import incidentsRouter from './routes/incidents.js';
import authRouter from './routes/auth.js';
import dispatchersRouter from './routes/dispatchers.js';
import qrcodesRouter from './routes/qrcodes.js';
import auditLogRouter from './routes/auditLog.js';
import venuesRouter from './routes/venues.js';
import evidenceRouter from './routes/evidence.js';
import contactPingsRouter from './routes/contactPings.js';

const app = express();

app.use(express.json());

const publicApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minute
  max: 100, // Maxim 100 de cereri per IP per fereastră
  message: { error: 'Prea multe cereri de la această adresă IP. Încearcă mai târziu.' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15, // Maxim 15 încercări de autentificare
  message: { error: 'Prea multe încercări de autentificare. Reîncearcă în 15 minute.' }
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendPath = path.join(__dirname, '../../frontend');
app.use(express.static(frontendPath));

app.use('/auth/login', authLimiter);
app.use('/incidents', publicApiLimiter);
app.use('/evidence', publicApiLimiter);
app.use('/contact-pings', publicApiLimiter);

app.use('/health', healthRouter);
app.use('/incidents', incidentsRouter);
app.use('/auth', authRouter);
app.use('/dispatchers', dispatchersRouter);
app.use('/qrcodes', qrcodesRouter);
app.use('/audit-log', auditLogRouter);
app.use('/venues', venuesRouter);
app.use('/evidence', evidenceRouter);
app.use('/contact-pings', contactPingsRouter);

app.get('/pwa', (req, res) => res.sendFile(path.join(frontendPath, '/pwa', 'pwa.html')));
app.get('/dispatcher', (req, res) => res.sendFile(path.join(frontendPath, '/dispatcher', 'dispatcher.html')));
app.get('/poweradmin', (req, res) => res.sendFile(path.join(frontendPath, '/poweradmin', 'poweradmin.html')));
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendPath, 'index.html'));
});

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
