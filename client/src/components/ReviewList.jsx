import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getReviews } from '../api';
import StatusBadge from './StatusBadge';
import HealthScore from './HealthScore';
import toast from 'react-hot-toast';
import AgentCharts from './AgentChart';

export default function ReviewList() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');

 useEffect(() => {
  getReviews()
    .then(setReviews)
    .catch((err) => setError(err.message))
    .finally(() => setLoading(false));

  let eventSource;

  function connectSSE() {
//    const SSE_URL = import.meta.env.VITE_API_URL
//      ? `${import.meta.env.VITE_API_URL}/api/reviews/stream`
//      : 'http://localhost:5000/api/reviews/stream';

    const eventSource = new EventSource('http://localhost:5000/api/reviews/stream');

    eventSource.onmessage = (event) => {
      const update = JSON.parse(event.data);
      getReviews().then(setReviews);

      if (update.status === 'completed') {
        const highCount = update.highCount || 0;
        const emoji = highCount > 0 ? '🔴' : '✅';
        toast(
          `${emoji} Review #${update.reviewId} completed` +
          (highCount > 0
            ? ` — ${highCount} HIGH issue${highCount > 1 ? 's' : ''} found`
            : ' — No critical issues'),
          { icon: null }
        );
      }

      if (update.status === 'failed') {
        toast.error(`Review #${update.reviewId} failed`);
      }
    };

    eventSource.onerror = () => {
      console.warn('SSE disconnected — reconnecting in 3s...');
      eventSource.close();
      setTimeout(connectSSE, 3000); // reconnect
    };
  }

  connectSSE();

  return () => {
    if (eventSource) eventSource.close();
  };
}, []);

  // Client-side filtering
  const filtered = reviews.filter(r => {
    if (filter === 'has_high') return r.high_count > 0;
    if (filter === 'pending') return r.status === 'pending';
    if (filter === 'working') return r.status === 'working';
    if (filter === 'completed') return r.status === 'completed';
    if (filter === 'failed') return r.status === 'failed';
    return true; // 'all'
  });

  if (loading) return <p className="status-text">Loading reviews…</p>;

  if (error) {
    return (
      <div className="empty-state">
        <h2>Couldn't reach the server</h2>
        <p className="status-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="review-list">
      <AgentCharts reviews={reviews} />
      <div className="list-header">
        <h1>Pull request reviews</h1>
        <select
          className="filter-select"
          value={filter}
          onChange={e => setFilter(e.target.value)}
        >
          <option value="all">All PRs</option>
          <option value="has_high">🔴 Has HIGH issues</option>
          <option value="pending">Pending</option>
          <option value="working">Working</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
        <button 
           className="refresh-btn"
           onClick={() => getReviews().then(setReviews)}
         >
           ↻ Refresh
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <h2>No reviews match this filter</h2>
        </div>
      ) : (
        <table className="review-table">
          <thead>
            <tr>
              <th>Repository</th>
              <th>Pull request</th>
              <th>Issues</th>
              <th>Status</th>
              <th>Opened</th>
              <th>Health (0-100)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((review) => (
              <tr key={review.id}>
                <td className="mono">{review.repo_name}</td>
                <td data-label="Pull request">
                  <Link to={`/reviews/${review.id}`}>
                    #{review.pr_number} — {review.pr_title}
                  </Link>
                </td>
                <td data-label="Issues">
                  <IssueCounts review={review} />
                </td>
                <td data-label="Status">
                  <StatusBadge status={review.status} />
                </td>
                <td className="mono" data-label="Opened">
                  {new Date(review.created_at).toLocaleString()}
                </td>
                <td data-label="Health">
                  <HealthScore score={review.health_score} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function IssueCounts({ review }) {
  if (review.status !== 'completed') {
    return <span className="status-text">—</span>;
  }

  const { high_count, medium_count, low_count } = review;
  const total = (high_count || 0) + (medium_count || 0) + (low_count || 0);

  if (total === 0) {
    return <span className="issues-clean">✅ Clean</span>;
  }

  return (
    <span className="issue-counts">
      {high_count > 0 && <span className="count-high">🔴 {high_count}</span>}
      {medium_count > 0 && <span className="count-medium">🟡 {medium_count}</span>}
      {low_count > 0 && <span className="count-low">🟢 {low_count}</span>}
    </span>
  );
}