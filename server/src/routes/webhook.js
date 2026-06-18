import express from 'express';
import {pool} from '../db.js';
import {dispatchToAgent} from '../a2a-client.js';
import { reviewQueue } from '../queue.js';

const router = express.Router();

router.post('/github', async (req, res) => {
    const event = req.headers['x-github-event'];

    if(event !== 'pull_request'){
        return res.status(200).send('Event ignored');
    }
         
    const { action, pull_request, repository } = req.body;

    if(action !== 'opened' && action !== 'synchronize'){
        return res.status(200).send('Action ignored');
    }

    const repoName = repository.full_name;
    const prNumber = pull_request.number;
    const prTitle = pull_request.title;
    const diffUrl = pull_request.diff_url;

    res.status(200).send('accepted');

    try {
  const insertResult = await pool.query(
    `INSERT INTO pr_reviews (repo_name, pr_number, pr_title, status)
     VALUES ($1, $2, $3, 'pending') RETURNING *`,
    [repoName, prNumber, prTitle]
  );
  const reviewId = insertResult.rows[0].id;

  // Just enqueue — worker handles the rest
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

export default router;
