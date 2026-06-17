import express from 'express';
import dotenv from 'dotenv';
dotenv.config();
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-3.1-flash-lite';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const app = express();
app.use(express.json());

const tasks = new Map();

app.get('/.well-known/agent.json', (req, res) => {
  res.sendFile(new URL('./agent.json', import.meta.url).pathname);
});

app.post('/a2a', async (req, res) => {
  const { method, params, id } = req.body;

  if (method === 'tasks.create') {
    const taskId = `task_${Date.now()}`;
    tasks.set(taskId, { id: taskId, status: 'submitted', result: null });

    // Start async work — don't await it, return taskId immediately
    processTask(taskId, params.diff);

    return res.json({
      jsonrpc: '2.0',
      id,
      result: { task_id: taskId, status: 'submitted' }
    });
  }

  if (method === 'tasks.get_status') {
    const task = tasks.get(params.task_id);
    if (!task) {
      return res.json({
        jsonrpc: '2.0',
        id,
        error: { code: 404, message: 'Task not found' }
      });
    }
    return res.json({
      jsonrpc: '2.0',
      id,
      result: task
    });
  }

  res.status(400).json({ error: 'Unknown method' });
});


const SECURITY_PROMPT = `You are a security-focused code review agent. Analyze this git diff for:
- Hardcoded secrets, API keys, passwords, or tokens
- SQL injection vulnerabilities (string concatenation in queries)
- Use of eval(), dangerouslySetInnerHTML, or other dangerous functions
- Any other security risks introduced by the diff

Respond with ONLY a JSON object, no markdown, matching this exact shape:
{
  "issues": [
    {
      "severity": "high" | "medium" | "low",
      "title": "Short title",
      "description": "1-3 sentence explanation",
      "line_hint": "relevant snippet from the diff"
    }
  ],
  "summary": "2-3 sentence overall security assessment"
}`;


async function analyzeSecurityIssues(diff) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: SECURITY_PROMPT + '\n\n' + diff }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini error: ${response.status}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return JSON.parse(rawText);
}


// Gemini analysis function 
async function processTask(taskId, diff) {
  tasks.get(taskId).status = 'working';

  try {
    const result = await analyzeSecurityIssues(diff);
    tasks.set(taskId, {
      id: taskId,
      status: 'completed',
      result
    });
  } catch (err) {
    tasks.set(taskId, {
      id: taskId,
      status: 'failed',
      error: err.message
    });
  }
}

app.listen(5001, () => {
  console.log('Security Agent running on http://localhost:5001');
});