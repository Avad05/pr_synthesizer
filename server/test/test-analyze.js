import fs from 'fs';

const diff = fs.readFileSync('../sample-diffs/small.diff', 'utf-8');

const res = await fetch('http://localhost:5000/api/reviews/2/analyze', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ diff })
});

const data = await res.json();
console.log(JSON.stringify(data, null, 2));