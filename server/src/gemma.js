import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


dotenv.config({path: path.resolve(__dirname, '../.env')}); 
console.log("Loaded Key:", process.env.OPENROUTER_API_KEY ? "Found!" : "UNDEFINED / MISSING");
async function fetchChatCompletion() {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        // 👇 Changed to backticks (``) so string interpolation works
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b:free',
        messages: [
          {
            role: 'user',
            content: 'What is the meaning of life?',
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    console.log(data.choices[0].message.content);

  } catch (error) {
    console.error('Error fetching data:', error);
  }
}

fetchChatCompletion();