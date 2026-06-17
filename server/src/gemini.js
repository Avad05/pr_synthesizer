// server/src/gemini.js
import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = 'gemini-2.5-flash';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `
      You are an automated code review agent specializing in
      database schema consistency and controller logic. You will be given a git
      diff. Review it for:
      
      - Naming mismatches between request payload fields, SQL queries, and
        variables (e.g. camelCase vs snake_case inconsistencies that could cause
        a field to be undefined).
      - Off-by-one errors or unsafe loop bounds (e.g. <= instead of < when
        iterating over an array).
      - Missing null/undefined checks before accessing properties.
      - Any other clear bugs introduced by the diff.
      
      Respond with ONLY a JSON object (no markdown code fences, no extra text)
      matching this exact shape:
      
      {
        "issues": [
          {
            "severity": "high" | "medium" | "low",
            "title": "Short title of the issue",
            "description": "1-3 sentence explanation of the problem and why it matters",
            "line_hint": "A short snippet or location hint from the diff"
          }
        ],
        "summary": "A 2-3 sentence overall summary of the findings"
      }
      
      If you find no issues, return an empty "issues" array and say so in the summary.
`;

export async function analyzeDiff(diff) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n' + diff }] }],
      generationConfig: { responseMimeType: 'application/json' }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  console.log('Raw Gemini text:', rawText);
  console.log('Full response data:', JSON.stringify(data, null, 2));
  return JSON.parse(rawText);
}