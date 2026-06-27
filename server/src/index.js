import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import crypto from 'crypto';
import reviewsRouter from './routes/reviews.js';
import webhooksRouter from './routes/webhook.js';
import './queue.js';

dotenv.config();

const app = express();
app.use(cors());

// MUST be before express.json() — captures raw body for webhook signature verification
app.use('/api/webhooks', express.raw({ type: 'application/json' }));

// JSON parsing for all other routes
app.use(express.json());

app.use(cors({
  origin: ['http://localhost:5173', 'http://172.20.0.7:5173', 'http://localhost:5000'],
  credentials: true
}));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/reviews', reviewsRouter);
app.use('/api/webhooks', webhooksRouter);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`PR Synthesizer server running on http://localhost:${PORT}`);
});