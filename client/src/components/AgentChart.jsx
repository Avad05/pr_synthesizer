import {
  PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer
} from 'recharts';

// Donut chart — severity distribution across all issues
function SeverityDonut({ reviews }) {
  const completed = reviews.filter(r => r.status === 'completed');

  const high = completed.reduce((sum, r) => sum + (r.high_count || 0), 0);
  const medium = completed.reduce((sum, r) => sum + (r.medium_count || 0), 0);
  const low = completed.reduce((sum, r) => sum + (r.low_count || 0), 0);

  const total = high + medium + low;
  if (total === 0) return null;

  const data = [
    { name: 'High', value: high, color: '#f2786b' },
    { name: 'Medium', value: medium, color: '#f2b84b' },
    { name: 'Low', value: low, color: '#5fcb8c' },
  ].filter(d => d.value > 0);

  return (
    <div className="chart-card">
      <h3>Issue severity breakdown</h3>
      <ResponsiveContainer width="100%" height={220}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={60}
            outerRadius={90}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: '#1d222e',
              border: '1px solid #2a3140',
              borderRadius: '6px',
              color: '#e6e9ef',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.8rem'
            }}
          />
          <Legend
            formatter={(value) => (
              <span style={{ color: '#8b95a7', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.8rem' }}>
                {value}
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
      <p className="chart-total">{total} total issues across {completed.length} reviews</p>
    </div>
  );
}

// Bar chart — average health score per repo
function RepoHealthBar({ reviews }) {
  const completed = reviews.filter(r => r.status === 'completed' && r.health_score !== null);

  if (completed.length === 0) return null;

  // Group by repo and average health score
  const repoMap = {};
  completed.forEach(r => {
    if (!repoMap[r.repo_name]) repoMap[r.repo_name] = [];
    repoMap[r.repo_name].push(r.health_score);
  });

  const data = Object.entries(repoMap).map(([repo, scores]) => ({
    repo: repo.split('/')[1], // just the repo name, not owner
    avgScore: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    reviews: scores.length
  }));

  return (
    <div className="chart-card">
      <h3>Average health score by repo</h3>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a3140" />
          <XAxis
            dataKey="repo"
            tick={{ fill: '#8b95a7', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: '#8b95a7', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}
          />
          <Tooltip
            contentStyle={{
              background: '#1d222e',
              border: '1px solid #2a3140',
              borderRadius: '6px',
              color: '#e6e9ef',
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: '0.8rem'
            }}
            formatter={(value) => [`${value}/100`, 'Avg Health Score']}
          />
          <Bar dataKey="avgScore" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.avgScore > 75 ? '#5fcb8c' : entry.avgScore > 50 ? '#f2b84b' : '#f2786b'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AgentCharts({ reviews }) {
  if (!reviews || reviews.length === 0) return null;

  return (
    <div className="charts-grid">
      <SeverityDonut reviews={reviews} />
      <RepoHealthBar reviews={reviews} />
    </div>
  );
}