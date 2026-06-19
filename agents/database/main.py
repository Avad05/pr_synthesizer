import asyncio
import os
import json
import time
import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

load_dotenv()
app = FastAPI()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
MODEL = "gemini-3.1-flash-lite"
API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent?key={GEMINI_API_KEY}"

tasks = {}

@app.get("/.well-known/agent.json")
def get_agent_card():
    return {
        "name": "Database Agent",
        "version": "1.0.0",
        "description": "Analyzes code diffs for database schema issues, unsafe migrations, and ORM mismatches.",
        "service_endpoint_url": "http://localhost:5002/a2a",
        "capabilities": [
            {
                "skill": "database_review",
                "description": "Checks for missing indexes, dangerous migrations, and schema/controller mismatches."
            }
        ]
    }

@app.post("/a2a")
async def a2a_handler(request: Request):
    body = await request.json()
    method = body.get("method")
    params = body.get("params", {})
    req_id = body.get("id")

    if method == "tasks.create":
        task_id = f"task_{int(time.time() * 1000)}"
        tasks[task_id] = {"id": task_id, "status": "submitted", "result": None}

        # Fire and forget — don't await
        asyncio.create_task(process_task(task_id, params.get("diff", "")))

        return JSONResponse({
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"task_id": task_id, "status": "submitted"}
        })

    if method == "tasks.get_status":
        task = tasks.get(params.get("task_id"))
        if not task:
            return JSONResponse({
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {"code": 404, "message": "Task not found"}
            })
        return JSONResponse({"jsonrpc": "2.0", "id": req_id, "result": task})

    return JSONResponse({"error": "Unknown method"}, status_code=400)


async def process_task(task_id: str, diff: str):
    tasks[task_id]["status"] = "working"
    try:
        result = await analyze_database_issues(diff)
        tasks[task_id] = {"id": task_id, "status": "completed", "result": result}
    except Exception as e:
        tasks[task_id] = {"id": task_id, "status": "failed", "error": str(e)}

async def analyze_database_issues(diff: str):
    prompt = """You are a database-focused code review agent.
Analyze this git diff for:
- Unsafe SQL queries (raw string concatenation, $queryRawUnsafe with template literals)
- Dangerous migrations (DROP TABLE/COLUMN without backup)
- Missing indexes on foreign keys or filtered columns
- N+1 query patterns (queries inside loops)
- Schema/controller naming mismatches

Do NOT flag authentication, secrets, or general security issues — those are handled by a separate agent.

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
  "summary": "2-3 sentence overall database assessment"
}"""

    async with httpx.AsyncClient() as client:
        response = await client.post(
            API_URL,
            json={
                "contents": [{"role": "user", "parts": [{"text": prompt + "\n\n" + diff}]}],
                "generationConfig": {"responseMimeType": "application/json"}
            },
            timeout=30.0
        )

    if response.status_code != 200:
        raise Exception(f"Gemini error: {response.status_code}")

    data = response.json()
    raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(raw_text)           

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5002)