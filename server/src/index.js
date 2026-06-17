import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import reviewsRouter from './routes/reviews.js';
import webhooksRouter from './routes/webhook.js';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/reviews', reviewsRouter);
app.use('/api/webhooks', webhooksRouter);

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`PR Synthesizer server running on http://localhost:${PORT}`);
});
