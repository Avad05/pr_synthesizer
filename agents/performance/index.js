import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(express.json());

const tasks = new Map();

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const PERFORMANCE_PROMPT = `You are a performance-focused code review agent.
Analyze this git diff ONLY for:
- N+1 query patterns (database queries inside loops)
- O(n²) or worse algorithmic complexity
- Missing database indexes on frequently queried columns
- Synchronous operations that should be async
- Unnecessary re-renders or expensive computations in React components
- Memory leaks (event listeners not cleaned up, large objects held in memory)
- Unoptimized loops (using forEach when a single query would do)

Do NOT flag security issues or schema problems — those are handled by other agents.

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
  "summary": "2-3 sentence overall performance assessment"
}`;

async function callOpenRouter(diff) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5003',
      'X-Title': 'PR Synthesizer Performance Agent'
    },
    body: JSON.stringify({
      model: 'openai/gpt-oss-120b:free',
      messages: [
        { role: 'user', content: PERFORMANCE_PROMPT + '\n\n' + diff }
      ],
      response_format: { type: 'json_object' }
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenRouter error (${response.status}): ${err}`);
  }

  const data = await response.json();
  const rawText = data.choices?.[0]?.message?.content;

  if (!rawText) throw new Error('Empty response from OpenRouter');

  return JSON.parse(rawText);
}

// Fallback Gemini 
async function callGemini(diff) {
  const response = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: PERFORMANCE_PROMPT + '\n\n' + diff }] }],
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

async function analyzePerformanceIssues(diff) {
  try {
    console.log('Trying OpenRouter (GPT OSS 120B)...');
    const result = await callOpenRouter(diff);
    console.log('OpenRouter succeeded.');
    return { ...result, model_used: 'openai/gpt-oss-120b' };
  } catch (err) {
    console.warn(`OpenRouter failed: ${err.message}`);
    console.log('Falling back to Gemini...');
    const result = await callGemini(diff);
    return { ...result, model_used: 'gemini-2.5-flash (fallback)' };
  }
}

async function processTask(taskId, diff) {
  tasks.get(taskId).status = 'working';
  try {
    const result = await analyzePerformanceIssues(diff);
    tasks.set(taskId, { id: taskId, status: 'completed', result });
  } catch (err) {
    tasks.set(taskId, { id: taskId, status: 'failed', error: err.message });
  }
}

app.get('/.well-known/agent.json', (req, res) => {
  res.json({
    name: 'PerformanceAgent',
    version: '1.0.0',
    description: 'Analyzes code diffs for performance issues, N+1 queries, and complexity problems.',
    service_endpoint_url: 'http://localhost:5003/a2a',
    capabilities: [
      {
        skill: 'performance_review',
        description: 'Detects N+1 patterns, algorithmic complexity issues, and memory leaks.'
      }
    ]
  });
});

app.post('/a2a', async (req, res) => {
  const { method, params, id } = req.body;

  if (method === 'tasks.create') {
    const taskId = `task_${Date.now()}`;
    tasks.set(taskId, { id: taskId, status: 'submitted', result: null });
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
    return res.json({ jsonrpc: '2.0', id, result: task });
  }

  res.status(400).json({ error: 'Unknown method' });
});

app.listen(process.env.PORT || 5003, () => {
  console.log('Performance Agent running on http://localhost:5003');
});
