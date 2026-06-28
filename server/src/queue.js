import {Queue, Worker} from 'bullmq';
import { retrieveRelevantChunks, formatContext } from './retriever.js';
import {broadcastReviewUpdate} from './routes/reviews.js';

const connection = { 
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379
 };

export const reviewQueue = new Queue('pr-reviews', {connection});

import {pool} from './db.js';
import { dispatchToAgent } from './a2a-client.js';
import { postPRComment, formatReviewComment} from './github.js';
const SECURITY_AGENT_URL = process.env.SECURITY_AGENT_URL || 'http://localhost:5001';
const DATABASE_AGENT_URL = process.env.DATABASE_AGENT_URL || 'http://localhost:5002';
const PERFORMANCE_AGENT_URL = process.env.PERFORMANCE_AGENT_URL || 'http://localhost:5003';

export const reviewWorker = new Worker('pr-reviews', async (job) =>{
    const {reviewId, diffUrl, repoName, prNumber} = job.data;
    
    await pool.query(
        `UPDATE pr_reviews SET status = 'working', current_step = 'fetching_diff' WHERE id = $1`,
        [reviewId]
    );
    broadcastReviewUpdate({ reviewId, status: 'working', step: 'fetching_diff' });
    // fetching diff
    const diffResponse = await fetch(diffUrl, {
        headers: {Accept: 'application/vnd.github.v3.diff'}
        });
        
    if(!diffResponse.ok){
        throw new Error(`Failed to fetch diff: ${diffResponse.status} ${diffResponse.statusText}`);
    }

    const diffText = await diffResponse.text();
    console.log(`Fetched diff, length: ${diffText.length} chars for review #${reviewId}`);

    await pool.query(
      `UPDATE pr_reviews SET current_step = 'retrieving_context' WHERE id = $1`,
      [reviewId]
    );
    broadcastReviewUpdate({ reviewId, status: 'working', step: 'retrieving_context' });
    

    const relevantChunks = await retrieveRelevantChunks(repoName, diffText, 5);
    const context = formatContext(relevantChunks);

    if (relevantChunks.length > 0) {
      console.log(`Retrieved ${relevantChunks.length} relevant chunks for context`);
    } else {
      console.log('No relevant chunks found — proceeding without RAG context');
    }

    const augmentedDiff = context + diffText;

      //Running it through Gemini.
    const { forSecurity, forDatabase, forPerformance} = splitDiff(augmentedDiff);

    await pool.query(
      `UPDATE pr_reviews SET current_step = 'agents_running' WHERE id = $1`,
      [reviewId]
    );
    broadcastReviewUpdate({ reviewId, status: 'working', step: 'agents_running' });
    

    const [securityResult, databaseResult, performanceResult] = await Promise.all([
      dispatchToAgent(SECURITY_AGENT_URL, forSecurity).catch(err => {
        console.error('Security agent failed:', err.message);
        return { issues: [], summary: 'Security agent unavailable.', model_used: 'unavailable' };
      }),
      dispatchToAgent(DATABASE_AGENT_URL, forDatabase).catch(err => {
        console.error('Database agent failed:', err.message);
        return { issues: [], summary: 'Database agent unavailable.', model_used: 'unavailable' };
      }),
      dispatchToAgent(PERFORMANCE_AGENT_URL, forPerformance).catch(err => {
        console.error('Performance agent failed:', err.message);
        return { issues: [], summary: 'Performance agent unavailable.', model_used: 'unavailable' };
      })
    ]);
    
    const allIssues = [
      ...(securityResult.issues || []),
      ...(databaseResult.issues || []),
      ...(performanceResult.issues || [])
    ];

    await pool.query(
      `UPDATE pr_reviews SET current_step = 'synthesizing' WHERE id = $1`,
      [reviewId]
    );
    broadcastReviewUpdate({ reviewId, status: 'working', step: 'synthesizing' });

    const highCount = allIssues.filter(i => i.severity === 'high').length;
    const mediumCount = allIssues.filter(i => i.severity === 'medium').length;
    const lowCount = allIssues.filter(i => i.severity === 'low').length;

    const healthScore = Math.max(
      0,
      100 - (highCount * 15) - (mediumCount * 7) - (lowCount * 2)
    );

    const structuredSummary = {
      agents: [
        {
          name: 'Security',
          model: 'gemini-3.1-flash-lite',
          summary: securityResult.summary,
          issues: (securityResult.issues || []).map(i => ({ ...i, agent: 'Security' }))
        },
        {
          name: 'Database',
          model: 'gemini-3.1-flash-lite',
          summary: databaseResult.summary,
          issues: (databaseResult.issues || []).map(i => ({ ...i, agent: 'Database' }))
        },
        {
          name: 'Performance',
          model: performanceResult.model_used || 'unknown',
          summary: performanceResult.summary,
          issues: (performanceResult.issues || []).map(i => ({ ...i, agent: 'Performance' }))
        }
      ]
    };

      // Store as JSON string
     const summaryText = JSON.stringify(structuredSummary);

      await pool.query(
        `UPDATE pr_reviews SET status = 'completed', current_step = 'completed', summary = $1, high_count = $2, medium_count = $3, low_count = $4, health_score = $5, updated_at = now() WHERE id = $6`,
      [summaryText, highCount, mediumCount, lowCount, healthScore, reviewId]
    );

    broadcastReviewUpdate({ 
      reviewId, status: 'completed', 
      highCount, mediumCount, lowCount, healthScore
    });

        // Post comment to GitHub PR
    const commentBody = formatReviewComment(securityResult, databaseResult, performanceResult);
    await postPRComment(repoName, prNumber, commentBody);
    console.log(`Posted review comment on ${repoName} PR #${prNumber}`);

    broadcastReviewUpdate({ reviewId, status: 'completed', step: 'completed', highCount, mediumCount, lowCount, healthScore });
    console.log(`Review #${reviewId} completed. `);

    return { reviewId, status: 'completed' };
}, {connection});

// Function to split the diff into security, database, performance relevant parts
function splitDiff(fullDiff) {
  const lines = fullDiff.split('\n');

  const dbKeywords = ['schema', 'migration', 'prisma', 'query', 'select',
                      'insert', 'update', 'delete', 'from', 'where', 'table',
                      'index', 'sql'];

  const secKeywords = ['secret', 'key', 'token', 'password', 'auth',
                       'jwt', 'bcrypt', 'hash', 'env', 'credential', 'log'];

  const perfKeywords = ['for', 'while', 'foreach', 'loop', 'map', 'filter',
                      'reduce', 'async', 'await', 'settimeout', 'setinterval',
                      'addeventlistener', 'removeeventlistener', 'useeffect',
                      'usememo', 'usecallback', 'n+1', 'query'];                     

  const dbLines = lines.filter(l =>
    l.startsWith('diff') || l.startsWith('@@') || l.startsWith('---') || l.startsWith('+++') || l.startsWith('//') || l.startsWith('RELEVANT') ||
    dbKeywords.some(kw => l.toLowerCase().includes(kw))
  );

  const secLines = lines.filter(l =>
    l.startsWith('diff') || l.startsWith('@@') || l.startsWith('---') || l.startsWith('+++') || l.startsWith('//') || l.startsWith('RELEVANT') ||
    secKeywords.some(kw => l.toLowerCase().includes(kw))
  );

  const perflines = lines.filter(l =>
    l.startsWith('diff') || l.startsWith('@@') || l.startsWith('---') || l.startsWith('+++')|| l.startsWith('//') || l.startsWith('RELEVANT') ||
    perfKeywords.some(kw => l.toLowerCase().includes(kw))
  );

  return {
    forSecurity: secLines.join('\n') || fullDiff,
    forDatabase: dbLines.join('\n') || fullDiff,
    forPerformance: perflines.join('\n') || fullDiff
  };
}

// Event listeners for the worker
reviewWorker.on('completed', (job) => {
  console.log(`Job ${job.id} completed`);
});

reviewWorker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
  console.error('Full error:', err); // ← add this
  pool.query(`UPDATE pr_reviews SET status = 'failed' WHERE id = $1`, [job.data.reviewId]);
  broadcastReviewUpdate({ reviewId: job.data.reviewId, status: 'failed' });
});