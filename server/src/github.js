import dotenv from 'dotenv';
dotenv.config();

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

export async function postPRComment(repoFullName, prNumber, body) {

  const url = `https://api.github.com/repos/${repoFullName}/issues/${prNumber}/comments`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ body })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GitHub API error (${response.status}): ${err}`);
  }

  return response.json();
}

// Formating the comment, so no raw data is sent.
export function formatReviewComment(securityResult, databaseResult, performanceResult) {
  const allIssues = [
    ...(securityResult.issues || []).map(i => ({ ...i, agent: 'Security' })),
    ...(databaseResult.issues || []).map(i => ({ ...i, agent: 'Database' })),
    ...(performanceResult.issues || []).map(i => ({ ...i, agent: 'Performance' }))

  ];

  const severityEmoji = { high: '🔴', medium: '🟡', low: '🟢' };

  let comment = `## 🤖 PR Synthesizer Review\n\n`;

  comment += `### Security Agent\n${securityResult.summary}\n\n`;
  comment += `### Database Agent\n${databaseResult.summary}\n\n`;
  comment += `### Performance Agent *(${performanceResult.model_used || 'unknown model'})*\n${performanceResult.summary}\n\n`;

  if (allIssues.length > 0) {
    comment += `### Issues Found\n\n`;
    allIssues.forEach(issue => {
      const emoji = severityEmoji[issue.severity] || '⚪';
      comment += `${emoji} **[${issue.severity.toUpperCase()}] ${issue.title}** *(${issue.agent} Agent)*\n`;
      comment += `${issue.description}\n`;
      if (issue.line_hint) comment += `\`${issue.line_hint}\`\n`;
      comment += '\n';
    });
  } else {
    comment += `### ✅ No issues found\n`;
  }

  comment += `---\n*Reviewed by PR Synthesizer — Security & Database powered by Gemini · Performance powered by GPT OSS 120B via OpenRouter*`;

  return comment;

}
