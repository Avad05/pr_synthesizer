import {Queue, Worker} from 'bullmq';
const connection = { 
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379
 };

export const reviewQueue = new Queue('pr-reviews', {connection});
import { broadcastReviewUpdate } from './routes/reviews.js';
import {pool} from './db.js';
import { dispatchToAgent } from './a2a-client.js';
import { postPRComment, formatReviewComment} from './github.js';
const SECURITY_AGENT_URL = process.env.SECURITY_AGENT_URL || 'http://localhost:5001';
const DATABASE_AGENT_URL = process.env.DATABASE_AGENT_URL || 'http://localhost:5002';

export const reviewWorker = new Worker('pr-reviews', async (job) =>{
    const {reviewId, diffUrl, repoName, prNumber} = job.data;
    
    await pool.query(
        `UPDATE pr_reviews SET status = 'working' WHERE id = $1`,
        [reviewId]
    );
    // fetching diff
    const diffResponse = await fetch(diffUrl, {
        headers: {Accept: 'application/vnd.github.v3.diff'}
        });
        
    if(!diffResponse.ok){
        throw new Error(`Failed to fetch diff: ${diffResponse.status} ${diffResponse.statusText}`);
    }

    const diffText = await diffResponse.text();
    console.log(`Fetched diff, length: ${diffText.length} chars for review #${reviewId}`);

    //Running it through Gemini.
    const { forSecurity, forDatabase } = splitDiff(diffText);
    const [securityResult, databaseResult] = await Promise.all([
      dispatchToAgent(SECURITY_AGENT_URL, forSecurity),
      dispatchToAgent(DATABASE_AGENT_URL, forDatabase)
    ]);
    
    const allIssues = [
      ...(securityResult.issues || []),
      ...(databaseResult.issues || [])
    ];

    const highCount = allIssues.filter(i => i.severity === 'high').length;
    const mediumCount = allIssues.filter(i => i.severity === 'medium').length;
    const lowCount = allIssues.filter(i => i.severity === 'low').length;

    const summaryText = 
    `SECURITY AGENT:\n${securityResult.summary}\n\nDATABASE AGENT:\n${databaseResult.summary}` +
    (allIssues.length > 0
      ? '\n\n' + allIssues
          .map(i => `[${i.severity.toUpperCase()}] ${i.title}\n${i.description}\n(${i.line_hint})`)
          .join('\n\n')
      : '');
      

      await pool.query(
        `UPDATE pr_reviews SET status = 'completed', summary = $1, high_count = $2, medium_count = $3, low_count = $4, updated_at = now() WHERE id = $5`,
      [summaryText, highCount, mediumCount, lowCount, reviewId]
    );

        // Post comment to GitHub PR
    const commentBody = formatReviewComment(securityResult, databaseResult);
    await postPRComment(repoName, prNumber, commentBody);
    console.log(`Posted review comment on ${repoName} PR #${prNumber}`);

    broadcastReviewUpdate({ reviewId, status: 'completed' });
    console.log(`Review #${reviewId} completed. `);

    return { reviewId, status: 'completed' };
}, {connection});

// Function to split the diff into security and database relevant parts
function splitDiff(fullDiff) {
  const lines = fullDiff.split('\n');

  const dbKeywords = ['schema', 'migration', 'prisma', 'query', 'select',
                      'insert', 'update', 'delete', 'from', 'where', 'table',
                      'index', 'sql'];

  const secKeywords = ['secret', 'key', 'token', 'password', 'auth',
                       'jwt', 'bcrypt', 'hash', 'env', 'credential', 'log'];

  const dbLines = lines.filter(l =>
    l.startsWith('diff') || l.startsWith('@@') || l.startsWith('---') || l.startsWith('+++') ||
    dbKeywords.some(kw => l.toLowerCase().includes(kw))
  );

  const secLines = lines.filter(l =>
    l.startsWith('diff') || l.startsWith('@@') || l.startsWith('---') || l.startsWith('+++') ||
    secKeywords.some(kw => l.toLowerCase().includes(kw))
  );

  return {
    forSecurity: secLines.join('\n') || fullDiff,
    forDatabase: dbLines.join('\n') || fullDiff
  };
}

// Event listeners for the worker
reviewWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

reviewWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
  // Update DB to failed status
  pool.query(
    `UPDATE pr_reviews SET status = 'failed' WHERE id = $1`,
    [job.data.reviewId]
  );
  broadcastReviewUpdate({ reviewId: job.data.reviewId, status: 'failed' });
});