import express from 'express';
import { pool } from '../db.js';

const router = express.Router();

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
// Phase 2 will call this once it has a real diff to review.
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

export default router;
