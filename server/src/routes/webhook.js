import express from 'express';
import { pool } from '../db.js';
import { reviewQueue } from '../queue.js';
import crypto from 'crypto';

const router = express.Router();

router.post('/github', async (req, res) => {
  if (!verifyGitHubSignature(req)) {
    console.warn('Invalid webhook signature — request rejected');
    return res.status(401).send('Unauthorized');
  }

  const payload = JSON.parse(req.body);
  const event = req.headers['x-github-event'];

  if (event !== 'pull_request') return res.status(200).send('Event ignored');

  const { action, pull_request, repository } = payload;

  if (action !== 'opened' && action !== 'synchronize') {
    return res.status(200).send('Action ignored');
  }

  const repoName = repository.full_name;
  const prNumber = pull_request.number;
  const prTitle = pull_request.title;
  const diffUrl = pull_request.diff_url;
  const force = req.query.force === 'true'; // ← read force param here

  res.status(200).send('accepted');

  try {
    // Idempotency check — skipped if ?force=true
    if (!force) {
      const existing = await pool.query(
        'SELECT id FROM pr_reviews WHERE repo_name = $1 AND pr_number = $2',
        [repoName, prNumber]
      );
      if (existing.rows.length > 0) {
        console.log(`Review already exists for ${repoName} PR #${prNumber} — skipping (use ?force=true to override)`);
        return;
      }
    }

    const insertResult = await pool.query(
      `INSERT INTO pr_reviews (repo_name, pr_number, pr_title, status)
       VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [repoName, prNumber, prTitle]
    );

    const reviewId = insertResult.rows[0].id;

    await reviewQueue.add('analyze-pr', {
      reviewId,
      diffUrl,
      repoName,
      prNumber
    });

    console.log(`Enqueued job for review #${reviewId}`);
  } catch (err) {
    console.error('Webhook error:', err.message);
  }
});

function verifyGitHubSignature(req) {
  const signature = req.headers['x-hub-signature-256'];
  if (!signature) return false;

  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;

  const expected = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(req.body)
    .digest('hex')}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export default router;