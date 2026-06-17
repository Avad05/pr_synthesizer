const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export async function dispatchToAgent(agentBaseUrl, diff) {
  // Create task
  const createRes = await fetch(`${agentBaseUrl}/a2a`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      method: 'tasks.create',
      id: 1,
      params: { diff }
    })
  });

  const createData = await createRes.json();
  const taskId = createData.result.task_id;
  console.log(`Task created: ${taskId} at ${agentBaseUrl}`);

  // Poll until done
  let attempts = 0;
  const MAX_ATTEMPTS = 30;

  while (attempts < MAX_ATTEMPTS) {
    await sleep(1000);
    attempts++;

    const statusRes = await fetch(`${agentBaseUrl}/a2a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'tasks.get_status',
        id: 2,
        params: { task_id: taskId }
      })
    });

    const statusData = await statusRes.json();
    const task = statusData.result;

    console.log(`Poll ${attempts}: ${task.status}`);

    if (task.status === 'completed') {
      return task.result;
    }

    if (task.status === 'failed') {
      throw new Error(`Agent task failed: ${task.error}`);
    }
  }

  throw new Error(`Agent timed out after ${MAX_ATTEMPTS} seconds`);
}