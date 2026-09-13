import 'dotenv/config';
import express from 'express';
import healthRouter from './routes/health.js';
import incidentsRouter from './routes/incidents.js';
import authRouter from './routes/auth.js';

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// routes here
app.use('/health', healthRouter);
app.use('/incidents', incidentsRouter);
app.use('/auth', authRouter);

// ...

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
