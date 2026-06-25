import { pool } from './db.js';
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;

async function embedQuery(text) {
  const response = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_QUERY'  
    })
  });

  if (!response.ok) {
    throw new Error(`Embedding error: ${response.status}`);
  }

  const data = await response.json();
  return data.embedding.values;
}

export async function retrieveRelevantChunks(repoName, diffText, topK = 5) {
  try {
    // Embed the diff
    const queryVector = await embedQuery(diffText);
    const vectorString = `[${queryVector.join(',')}]`;

    const result = await pool.query(
      `SELECT 
         file_path,
         chunk_text,
         1 - (embedding <=> $1::vector) AS similarity
       FROM code_chunks
       WHERE repo_name = $2
       ORDER BY embedding <=> $1::vector
       LIMIT $3`,
      [vectorString, repoName, topK]
    );

    return result.rows;
  } catch (err) {
    // RAG is best-effort — if it fails, agents still run without context
    console.error('Retriever error:', err.message);
    return [];
  }
}

export function formatContext(chunks) {
  if (chunks.length === 0) return '';

  const formatted = chunks
    .map((chunk, i) =>
      `// Relevant file ${i + 1}: ${chunk.file_path} (similarity: ${chunk.similarity.toFixed(2)})\n${chunk.chunk_text}`
    )
    .join('\n\n---\n\n');

  return `RELEVANT CODEBASE CONTEXT:\nThe following existing code from this repository is semantically similar to the diff being reviewed. Use it to give project-specific advice:\n\n${formatted}\n\n`;
}