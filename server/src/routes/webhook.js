import express from 'express';
import {pool} from '../db.js';
import {dispatchToAgent} from '../a2a-client.js';

const router = express.Router();

function splitDiff(fullDiff) {
  const lines = fullDiff.split('\n');
  
  const dbKeywords = ['schema', 'migration', 'prisma', 'query', 'select', 
                      'insert', 'update', 'delete', 'from', 'where', 'table',
                      'index', 'sql'];
  
  const secKeywords = ['secret', 'key', 'token', 'password', 'auth', 
                       'jwt', 'bcrypt', 'hash', 'env', 'credential', 'log'];

  // A line is relevant if it's a diff header OR matches the keywords
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

    try{

        const insertResult = await pool.query(
            `INSERT INTO pr_reviews (repo_name, pr_number, pr_title, status) VALUES ($1, $2, $3, 'working') RETURNING *`,
            [repoName, prNumber, prTitle]
        );

        const reviewId = insertResult.rows[0].id;
         console.log(`Created review #${reviewId} for ${repoName} PR #${prNumber}`);

        const diffResponse = await fetch(diffUrl, {
            headers: { 'Accept': 'application/vnd.github.v3.diff' }
        });

        if(!diffResponse.ok){
            throw new Error(`Failed to fetch diff: ${diffResponse.status} ${diffResponse.statusText}`);
        }

        const diffText = await diffResponse.text();
        console.log(`Fetched diff, length:${diffText.length} chars`);

        //Running it through Gemini.
       const { forSecurity, forDatabase } = splitDiff(diffText);
       const [securityResult, databaseResult] = await Promise.all([
         dispatchToAgent('http://localhost:5001', forSecurity),
         dispatchToAgent('http://localhost:5002', forDatabase)
       ]);

        const allIssues = [
          ...(securityResult.issues || []),
          ...(databaseResult.issues || [])
        ];
         
        const summaryText = `SECURITY AGENT:\n${securityResult.summary}\n\nDATABASE AGENT:\n${databaseResult.summary}`
          + (allIssues.length > 0
           ? '\n\n' + allIssues
          .map(i => `[${i.severity.toUpperCase()}] ${i.title}\n${i.description}\n(${i.line_hint})`)
          .join('\n\n')
            : '');

       await pool.query(
      `UPDATE pr_reviews
       SET status = 'completed', summary = $1, updated_at = now()
       WHERE id = $2`,
      [summaryText, reviewId]
    );
    console.log(`Review #${reviewId} completed.`);
} catch (err) {
    console.error('Webhook processing error:', err.message);
}
});

export default router;
