import express from 'express';
import { pool } from '../db.js';
import { analyzeDiff } from '../gemini.js';
const router = express.Router();
const clients = new Set();

router.get('/stream', (req, res) => {
  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Register this client
  clients.add(res);
  console.log(`SSE client connected. Total: ${clients.size}`);

  // Remove client when they disconnect.
  req.on('close', () => {
    clients.delete(res);
    console.log(`SSE client disconnected. Total: ${clients.size}`);
  });
});

export function broadcastReviewUpdate(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => client.write(message));
}
// GET /api/reviews - list all PR reviews, most recent first
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM pr_reviews ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch reviews' });
  }
});

// GET /api/reviews/:id - single review detail
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM pr_reviews WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch review' });
  }
});

// POST /api/reviews - create a new review record

router.post('/', async (req, res) => {
  const { repo_name, pr_number, pr_title, status = 'pending', summary = null } = req.body;

  if (!repo_name || !pr_number || !pr_title) {
    return res.status(400).json({ error: 'repo_name, pr_number and pr_title are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO pr_reviews (repo_name, pr_number, pr_title, status, summary)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [repo_name, pr_number, pr_title, status, summary]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create review' });
  }
});

// PATCH /api/reviews/:id - update status/summary as agents report progress
// Phase 4 and 6 will use this to move status through working -> completed.
router.patch('/:id', async (req, res) => {
  const { status, summary } = req.body;

  try {
    const result = await pool.query(
      `UPDATE pr_reviews
       SET status = COALESCE($1, status),
           summary = COALESCE($2, summary),
           updated_at = now()
       WHERE id = $3
       RETURNING *`,
      [status, summary, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Review not found' });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update review' });
  }
});

router.post('/:id/analyze', async (req, res) => {
  const { diff } = req.body;

  if (!diff) {
    return res.status(400).json({ error: 'diff is required in request body' });
  }

  try {
    // Mark as working before calling Gemini (this matters more in Phase 6,
    // but it's good practice now)
    await pool.query(`UPDATE pr_reviews SET status = 'working' WHERE id = $1`, [req.params.id]);

    const { issues, summary } = await analyzeDiff(diff);
    console.log('Gemini result:', JSON.stringify({ issues, summary }, null, 2));

    // Turn the issues array into the same text format your seed data used
    const summaryText = issues.length === 0
      ? summary
      : `${summary}\n\n` + issues.map(i => `[${i.severity.toUpperCase()}] ${i.title}\n${i.description}\n(${i.line_hint})`).join('\n\n');

    const result = await pool.query(
      `UPDATE pr_reviews SET status = 'completed', summary = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [summaryText, req.params.id]
    );

    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    await pool.query(`UPDATE pr_reviews SET status = 'failed' WHERE id = $1`, [req.params.id]);
    res.status(500).json({ error: 'Analysis failed', details: err.message });
  }
});

export default router;
