import fs from 'fs';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import path from 'path';
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL});

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const REPO_PATH = process.env.REPO_PATH;
const REPO_NAME = process.env.REPO_NAME;
const EMBEDDING_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`;

// Rate Limiting for Gemini Embedding model
const sleep = (ms) => new Promise(r => setTimeout(r, ms));


//Getting all the js files.
function getJsFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    // Skip node_modules, .git, dist folders
    if (entry.isDirectory()) {
      if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) continue;
      getJsFiles(fullPath, files);
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

    // Chunking contents of the files.
function chunkFile(filePath, content) {
  const chunks = [];
  const lines = content.split('\n');
  const relativePath = path.relative(REPO_PATH, filePath);

  // Simple chunking strategy: split into ~40 line windows with 10 line overlap
  
  const CHUNK_SIZE = 40;
  const OVERLAP = 10;

  for (let i = 0; i < lines.length; i += CHUNK_SIZE - OVERLAP) {
    const chunkLines = lines.slice(i, i + CHUNK_SIZE);
    const chunkText = chunkLines.join('\n').trim();

    // Skip empty or very short chunks
    if (chunkText.length < 50) continue;

    chunks.push({
      filePath: relativePath,
      text: `// File: ${relativePath}\n\n${chunkText}`
    });
  }

  return chunks;
}

// Call gemini
async function generateEmbedding(text) {
  const response = await fetch(EMBEDDING_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] },
      taskType: 'RETRIEVAL_DOCUMENT'  // indexing mode
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Embedding API error (${response.status}): ${err}`);
  }

  const data = await response.json();
  return data.embedding.values; // array of 768 floats
}

async function storeChunk(filePath, chunkText, embedding) {
  // Convert JS array to pgvector format: [0.1, 0.2, ...]
  const vectorString = `[${embedding.join(',')}]`;

  await pool.query(
    `INSERT INTO code_chunks (repo_name, file_path, chunk_text, embedding)
     VALUES ($1, $2, $3, $4)`,
    [REPO_NAME, filePath, chunkText, vectorString]
  );
}

//main function

async function main() {
  console.log(`Indexing ${REPO_NAME} at ${REPO_PATH}...`);

  // Clear existing chunks for this repo (fresh index each run)
  await pool.query('DELETE FROM code_chunks WHERE repo_name = $1', [REPO_NAME]);
  console.log('Cleared existing chunks.');

  const files = getJsFiles(REPO_PATH);
  console.log(`Found ${files.length} JS files.`);

  let totalChunks = 0;
  let errors = 0;

  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const chunks = chunkFile(filePath, content);

    console.log(`Processing ${path.relative(REPO_PATH, filePath)} — ${chunks.length} chunks`);

    for (const chunk of chunks) {
      try {
        const embedding = await generateEmbedding(chunk.text);
        await storeChunk(chunk.filePath, chunk.text, embedding);
        totalChunks++;

        // Wait 500ms between embedding calls to avoid rate limits
        await sleep(500);
      } catch (err) {
        console.error(`  Error on chunk: ${err.message}`);
        errors++;

        // If rate limited, wait longer
        if (err.message.includes('429')) {
          console.log('  Rate limited — waiting 10 seconds...');
          await sleep(10000);
        }
      }
    }
  }

  console.log(`\nDone! ${totalChunks} chunks indexed, ${errors} errors.`);
  await pool.end();
}

main().catch(console.error);
