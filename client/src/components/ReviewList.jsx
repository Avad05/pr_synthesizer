import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getReviews } from '../api';
import StatusBadge from './StatusBadge';

export default function ReviewList() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    getReviews()
      .then(setReviews)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

      const eventSource = new EventSource("/api/reviews/stream");
      eventSource.onmessage = (event) => {
      const update = JSON.parse(event.data);
      console.log('SSE update received:', update);
      getReviews().then(setReviews);
      };

    eventSource.onerror = () => {
    console.warn('SSE connection lost');
    };

    return () => eventSource.close();
}, []);

  if (loading) return <p className="status-text">Loading reviews…</p>;

  if (error) {
    return (
      <div className="empty-state">
        <h2>Couldn't reach the server</h2>
        <p className="status-text">{error}</p>
        <p className="status-text">
          Make sure the Express server is running on port 5000 and your
          database connection is configured in <code>server/.env</code>.
        </p>
      </div>
    );
  }

  if (reviews.length === 0) {
    return (
      <div className="empty-state">
        <h2>No reviews yet</h2>
        <p className="status-text">
          Once your agents start reviewing pull requests, they'll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="review-list">
      <h1>Pull request reviews</h1>
      <table className="review-table">
        <thead>
          <tr>
            <th>Repository</th>
            <th>Pull request</th>
            <th>Status</th>
            <th>Opened</th>
          </tr>
        </thead>
        <tbody>
          {reviews.map((review) => (
            <tr key={review.id}>
              <td className="mono">{review.repo_name}</td>
              <td>
                <Link to={`/reviews/${review.id}`}>
                  #{review.pr_number} — {review.pr_title}
                </Link>
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
    </div>
  );
}
