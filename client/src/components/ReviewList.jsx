import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getReviews } from '../api';
import StatusBadge from './StatusBadge';

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

    // SSE for live updates
    const eventSource = new EventSource('/api/reviews/stream');
    eventSource.onmessage = () => {
      getReviews().then(setReviews);
    };
    eventSource.onerror = () => console.warn('SSE lost');
    return () => eventSource.close();
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
            </tr>
          </thead>
          <tbody>
            {filtered.map((review) => (
              <tr key={review.id}>
                <td className="mono">{review.repo_name}</td>
                <td>
                  <Link to={`/reviews/${review.id}`}>
                    #{review.pr_number} — {review.pr_title}
                  </Link>
                </td>
                <td>
                  <IssueCounts review={review} />
                </td>
                <td>
                  <StatusBadge status={review.status} />
                </td>
                <td className="mono">
                  {new Date(review.created_at).toLocaleString()}
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