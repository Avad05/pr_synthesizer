# PR Synthesizer

> An automated Pull Request review system powered by a multi-agent AI pipeline.



https://github.com/user-attachments/assets/a6301d71-c7b4-4182-9987-87a00f7458d7





When a developer opens a PR on GitHub, PR Synthesizer automatically analyzes the code diff using **three specialized AI agents** and posts a structured review directly on the PR — while updating a live maintainer dashboard in real time.

Built with the **Agent-to-Agent (A2A) protocol** — agents are independent microservices communicating over JSON-RPC 2.0, making the system truly framework-agnostic.

---

## How it works
```
                  GitHub PR Opened
                          ↓
              Webhook → Express Orchestrator
                          ↓                   (signature verified, idempotency checked)
                BullMQ Job Queue (Redis)
                          ↓
      RAG: retrieve relevant codebase context (pgvector)
                          ↓
┌───────────────────────────────────────────────────────────────┐
│  Security Agent       │  Database Agent       │  Performance  │ ← These agents run in parallel
│  (Node.js)            │  (Python)             │  Agent        │
│  Gemini 3.1-Flash-lite│  Gemini 3.1-Flash-lite│  GPT OSS 120B │
│  port 5001            │  port 5002            │  port 5003    │
└───────────────────────────────────────────────────────────────┘
                          ↓
          Synthesized findings → GitHub PR Comment
                          ↓
    React Dashboard (live via SSE — no refresh needed)

```

---

## Agents

**🔒 Security Agent (Node.js/Express, port 5001)**
Scans for hardcoded secrets, exposed API keys, weak authentication patterns (bcrypt cost factor, JWT issues), and sensitive data leakage in logs and error responses.

**🗄️ Database Agent (Python/FastAPI, port 5002)**
Scans for SQL injection via unsafe raw queries (`$queryRawUnsafe`), dangerous migrations, missing indexes, N+1 query patterns, and schema/controller naming mismatches.

**⚡ Performance Agent (Node.js/Express, port 5003)**
Detects N+1 query patterns, O(n²) algorithmic complexity, synchronous operations that should be async, and memory leaks. Uses **GPT OSS 120B via OpenRouter** with automatic Gemini fallback if OpenRouter is unavailable or times out.

All three agents implement the A2A protocol — exposing an `agent.json` card at `/.well-known/agent.json` and accepting JSON-RPC 2.0 tasks at `/a2a`. The orchestrator dispatches tasks in parallel and polls for results asynchronously.

---

## RAG — Codebase-Aware Reviews

Agents don't just analyze the diff in isolation. Before dispatching, the orchestrator:

1. Generates an embedding of the diff using `gemini-embedding-001` (3072 dimensions)
2. Searches `pgvector` for the 5 most semantically similar chunks from the indexed codebase
3. Injects retrieved context into each agent's prompt

This means instead of generic advice, agents give project-specific findings:

> *"Your existing `authController.js` uses `bcrypt.hash(password, 10)` — this diff reduces it to cost factor 1, breaking your established security pattern."*

---

## Tech Stack

| Layer | Technology |
|---|---|
| Orchestrator | Node.js, Express, PostgreSQL |
| Job Queue | BullMQ + Redis |
| Security Agent | Node.js, Express, Gemini 2.0 Flash |
| Database Agent | Python, FastAPI, Gemini 2.5 Pro |
| Performance Agent | Node.js, Express, GPT OSS 120B (OpenRouter) + Gemini fallback |
| Vector Search | pgvector (HNSW cosine index, 3072 dimensions) |
| Embeddings | gemini-embedding-001 |
| Frontend | React, Vite, Recharts, SSE |
| Protocol | A2A (Agent-to-Agent) over JSON-RPC 2.0 |
| Infrastructure | Docker Compose (7 services) |

---

## Quick start — no GitHub setup needed

Want to see the agent pipeline work without setting up webhooks?

```bash
git clone https://github.com/Avad05/pr_synthesizer
cd pr_synthesizer
cp .env.example .env
# fill in GEMINI_API_KEY and OPENROUTER_API_KEY
docker compose up --build
```

Then trigger a review directly:

```bash
# Create a review record
curl -X POST http://localhost:5000/api/reviews \
  -H "Content-Type: application/json" \
  -d '{"repo_name":"demo/repo","pr_number":1,"pr_title":"Test review"}'

# Run agents on a sample diff
curl -X POST http://localhost:5000/api/reviews/1/analyze \
  -H "Content-Type: application/json" \
  -d '{"diff":"diff --git a/auth.js b/auth.js\n+const SECRET = \"hardcoded-key-123\";\n+const q = \"SELECT * FROM users WHERE id = \" + userId;"}'
```

Open `http://localhost:5173` — watch the timeline animate and findings appear live.

---

## Full GitHub integration

### Prerequisites
- Docker and Docker Compose
- A GitHub repo you own
- Gemini API key (free at [aistudio.google.com](https://aistudio.google.com))
- OpenRouter API key (free at [openrouter.ai](https://openrouter.ai))
- GitHub Personal Access Token (`repo` scope)

### 1. Configure

```bash
cp .env.example .env
```

```env
GEMINI_API_KEY=your-gemini-key
OPENROUTER_API_KEY=your-openrouter-key
GITHUB_TOKEN=your-github-pat
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

### 2. Index your codebase for RAG

```bash
cd scripts
cp .env.example .env
# set REPO_PATH to your local clone of the repo you want to review
npm install
node indexer.js
```

### 3. Start all services

```bash
docker compose up --build
```

Starts: PostgreSQL + pgvector, Redis, Express orchestrator, Security Agent, Database Agent, Performance Agent, React dashboard.

### 4. Set up the webhook tunnel

```bash
npx smee-client -u https://smee.io/YOUR_CHANNEL \
  -t 'http://localhost:5000/api/webhooks/github'
```

### 5. Register the webhook on GitHub

Repo → Settings → Webhooks → Add webhook:
- Payload URL: your smee.io URL
- Content type: `application/json`
- Secret: your `GITHUB_WEBHOOK_SECRET`
- Events: Pull requests

### 6. Open a PR: the rest is automatic

PR Synthesizer will receive the webhook, fetch the diff, retrieve relevant codebase context, dispatch to all three agents in parallel, post findings as a GitHub PR comment, and update the dashboard live.

### Production

Deploy the server to Render, Railway, or AWS and point your GitHub webhook at the public URL — no smee tunnel needed.

---

## Dashboard

A maintainer-focused command center — not just a log viewer.

- **Live timeline** — watch each step animate in real time (fetching diff → RAG retrieval → agents running → complete)
- **Health score** — composite 0-100 score per PR (`HIGH × -15`, `MEDIUM × -7`, `LOW × -2`)
- **Severity breakdown** — donut chart across all reviews
- **Repo health** — average health score per repository
- **Filter** — by severity, status, or "has HIGH issues"
- **Toast notifications** — instant alert when a review completes
- **Live updates** — via Server-Sent Events, no refresh needed

---

## Key engineering decisions

**Why A2A protocol?**
Agents are fully decoupled microservices behind a standard JSON-RPC contract. Swapping the Node.js security agent for a Python or LangGraph agent requires zero changes to the orchestrator — you just point the URL at a different service.

**Why BullMQ?**
GitHub requires a webhook response within 10 seconds or it retries the delivery. By enqueuing immediately and processing in a background worker, the webhook handler responds in milliseconds regardless of how long Gemini takes.

**Why three languages across agents?**
The Database Agent runs Python/FastAPI while the other two run Node.js. This proves the system is truly framework-agnostic — the A2A protocol doesn't care what language an agent is written in. Agents can be swapped independently.

**Why RAG instead of just a bigger prompt?**
Sending the entire codebase in every prompt is expensive, slow, and hits context limits. RAG retrieves only the most semantically relevant chunks — typically 3-5 files — giving agents targeted context without noise.

**Why separate agent prompts with domain boundaries?**
A single "review everything" prompt produces overlapping, duplicate findings. Domain-scoped prompts (Security only looks for secrets/auth issues, Database only looks for query patterns) produce cleaner, non-redundant output with clear ownership of each finding.

**Why GPT OSS 120B for the Performance Agent?**
Different models have different strengths. Using OpenRouter for the Performance Agent with an automatic Gemini fallback demonstrates a model-agnostic architecture — the system stays resilient if one provider is unavailable.

---

## Project structure
```
pr-synthesizer/
├── server/                   # A2A Orchestrator
│   └── src/
│       ├── routes/
│       │   ├── reviews.js    # CRUD + SSE endpoint
│       │   └── webhook.js    # GitHub webhook handler
│       ├── queue.js          # BullMQ worker
│       ├── a2a-client.js     # Agent dispatch + polling
│       ├── retriever.js      # RAG retrieval (pgvector)
│       ├── github.js         # GitHub PR comment posting
│       └── db.js             # Postgres pool
├── agents/
│   ├── security/             # Node.js A2A agent (port 5001)
│   ├── database/             # Python A2A agent (port 5002)
│   └── performance/          # Node.js A2A agent (port 5003)
├── scripts/
│   └── indexer.js            # RAG indexer — embed codebase into pgvector
├── client/                   # React dashboard
└── docker-compose.yml
```
---

## Roadmap

- **Synthesizer Agent** — a final "judge" agent that aggregates, deduplicates, and prioritizes findings from all agents
- **Re-analysis on merge** — when a PR merges, reset other open reviews for re-analysis against the updated main branch  
- **Model factory** — swap LLM providers per agent via environment variable, no code changes needed
- **GitHub Actions integration** — run PR Synthesizer as a CI check directly in your pipeline
- **RAG on PR history** — index past PR discussions so agents can reference how similar issues were resolved before

---

## Contributing

Contributions welcome.

```bash
git checkout -b feature/your-feature
git commit -m 'feat: your feature'
git push origin feature/your-feature
# open a PR — PR Synthesizer will review it automatically
```


  
