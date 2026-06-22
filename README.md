# PR Synthesizer

An automated Pull Request review system powered by a multi-agent AI pipeline. When a developer opens a PR on GitHub, PR Synthesizer automatically analyzes the code diff using specialized AI agents and posts a structured review directly on the PR.

Built with the Agent-to-Agent (A2A) protocol — agents are independent microservices that communicate over JSON-RPC 2.0, making the system truly framework-agnostic.

---

## Architecture
GitHub PR Opened

↓

Webhook → Express Orchestrator (PERN)

↓

BullMQ Job Queue (Redis)

↓

┌─────────────────────────────────┐

│  Security Agent  │  Database    │  ← run in parallel via Promise.all

│  (Node.js)       │  Agent       │

│  port 5001       │  (Python)    │

│                  │  port 5002   │

└─────────────────────────────────┘

↓

Synthesized findings → GitHub PR Comment

↓

React Dashboard (live via SSE)

---

## What each agent does

**Security Agent (Node.js/Express)** — scans for hardcoded secrets, exposed API keys, weak authentication patterns, sensitive data leakage in logs and error responses.

**Database Agent (Python/FastAPI)** — scans for SQL injection via unsafe raw queries, dangerous migrations (DROP without backup), missing indexes, and N+1 query patterns.

Both agents implement the A2A protocol — they expose an `agent.json` card at `/.well-known/agent.json` and accept JSON-RPC 2.0 tasks at `/a2a`. The orchestrator dispatches tasks and polls for results asynchronously.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Orchestrator | Node.js, Express, PostgreSQL, Prisma |
| Job Queue | BullMQ + Redis |
| Security Agent | Node.js, Express |
| Database Agent | Python, FastAPI, httpx |
| Frontend | React, Vite, SSE |
| AI | Google Gemini 2.0 Flash / 2.5 Flash |
| Protocol | A2A (Agent-to-Agent) over JSON-RPC 2.0 |
| Infrastructure | Docker Compose |

---

## Running locally

### Prerequisites
- Docker and Docker Compose
- A GitHub repo you own (to register the webhook)
- Gemini API key (free at aistudio.google.com)
- GitHub Personal Access Token (repo scope)

### 1. Clone and configure

```bash
git clone https://github.com/Avad05/pr_synthesizer
cd pr_synthesizer
cp .env.example .env
```

Fill in `.env`:
```bash
GEMINI_API_KEY=your-gemini-key
GITHUB_TOKEN=your-github-pat
GITHUB_WEBHOOK_SECRET=your-webhook-secret
```

### 2. Start all services

```bash
docker compose up --build
```

This starts: PostgreSQL, Redis, the Express orchestrator, Security Agent, Database Agent, and the React dashboard — all networked together.

### 3. Set up the GitHub webhook tunnel

In a separate terminal:

```bash
npx smee-client -u https://smee.io/YOUR_CHANNEL -t http://localhost:5000/api/webhooks/github
```

Create a new smee channel at smee.io if you don't have one.

### 4. Register the webhook on GitHub

Go to your repo → Settings → Webhooks → Add webhook:
- Payload URL: your smee.io channel URL
- Content type: `application/json`
- Secret: same value as `GITHUB_WEBHOOK_SECRET` in `.env`
- Events: Pull requests

### 5. Open a PR

Open a Pull Request on your repo. PR Synthesizer will:
1. Receive the webhook
2. Fetch the diff
3. Dispatch to both agents in parallel
4. Post findings as a PR comment
5. Update the dashboard live

Open the dashboard at `http://localhost:5173`.

### Production deployment

In production, deploy the server to any cloud platform (Render, Railway, AWS) and point your GitHub webhook directly at the public URL — no smee tunnel needed.

---

## Dashboard

The React dashboard is a maintainer-focused view that GitHub doesn't provide:

- Cross-repo PR review history in one place
- Issue severity counts at a glance (🔴 HIGH 🟡 MEDIUM 🟢 LOW)
- Filter by severity, status, or repository
- Live updates via Server-Sent Events — no refresh needed

---

## Key engineering decisions

**Why A2A protocol?** Agents are fully decoupled microservices. The orchestrator communicates with them over a standard JSON-RPC contract — swapping the Node.js security agent for a Python one (or a LangGraph agent) requires zero changes to the orchestrator.

**Why BullMQ?** GitHub requires a webhook response within 10 seconds. By enqueuing the job immediately and processing asynchronously, the webhook handler responds in milliseconds regardless of how long agent analysis takes.

**Why two languages?** The Database Agent runs Python/FastAPI to demonstrate true framework-agnosticism — the A2A protocol doesn't care what language an agent is written in.

**Why separate agents instead of one big prompt?** Each agent has a narrowly scoped system prompt and receives only the diff lines relevant to its domain. This reduces hallucination, prevents overlapping findings, and lets each agent be tuned independently.

---

## Project structure

```bash
pr-synthesizer/

├── server/                  # A2A Orchestrator

│   └── src/

│       ├── routes/

│       │   ├── reviews.js   # CRUD + SSE endpoint

│       │   └── webhook.js   # GitHub webhook handler

│       ├── queue.js         # BullMQ worker

│       ├── a2a-client.js    # Agent dispatch + polling

│       ├── gemini.js        # Gemini API client

│       ├── github.js        # GitHub PR comment posting

│       └── db.js            # Postgres pool

├── agents/

│   ├── security/            # Node.js A2A agent (port 5001)

│   └── database/            # Python A2A agent (port 5002)

├── client/                  # React dashboard

└── docker-compose.yml
```
---

## What's next

- Performance Agent — detects N+1 patterns, unoptimized loops, sync operations that should be async
- Re-analysis on merge — when a PR merges, reset other open PR reviews for re-analysis against the updated main branch
- Model factory — swap LLM providers per agent via environment variable (Claude for database analysis, Gemini for security)
- RAG on codebase history — index past PR discussions into pgvector so agents give advice grounded in your team's actual decisions

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

- Fork the repository

- Create a feature branch (git checkout -b feature/AmazingFeature)

- Commit your changes (git commit -m 'Add some AmazingFeature')

- Push to the branch (git push origin feature/AmazingFeature)

- Open a Pull Request
