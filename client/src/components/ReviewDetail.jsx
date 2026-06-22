import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getReview } from '../api';
import StatusBadge from './StatusBadge';

export default function ReviewDetail() {
  const { id } = useParams();
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    getReview(id)
      .then(setReview)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="status-text">Loading review…</p>;

  if (error) {
    return (
      <div className="empty-state">
        <h2>Couldn't load this review</h2>
        <p className="status-text">{error}</p>
        <Link to="/" className="back-link">← Back to all reviews</Link>
      </div>
    );
  }

  if (!review) return null;

  return (
    <div className="review-detail">
      <Link to="/" className="back-link">← Back to all reviews</Link>

      <div className="review-detail-header">
        <h1>
          <span className="mono">{review.repo_name}</span>{' '}
          <span className="mono pr-number">#{review.pr_number}</span>
        </h1>
        <StatusBadge status={review.status} />
      </div>

      <h2>{review.pr_title}</h2>

      {review.status === 'working' && (
        <div className="working-notice">
          ⏳ Agents are reviewing your code. Performance analysis uses a large OSS model — this may take a minute.
        </div>
      )}

      <h3>Synthesized review</h3>
      {review.summary ? (
        <pre className="summary-box">{review.summary}</pre>
      ) : (
        <p className="status-text">
          No findings yet — agents haven't reported in for this PR.
        </p>
      )}
    </div>
  );
}
