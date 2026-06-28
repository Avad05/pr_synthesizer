import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getReview } from '../api';
import StatusBadge from './StatusBadge';
import HealthScore from './HealthScore';
import ReviewTimeline from './ReviewTimeline';

// ← outside ReviewDetail
function StructuredReview({ summary }) {
  let parsed = null;
  try {
    parsed = JSON.parse(summary);
  } catch {
    return <pre className="summary-box">{summary}</pre>;
  }

  if (!parsed?.agents) {
    return <pre className="summary-box">{summary}</pre>;
  }

  const severityColor = {
    high: 'issue-high',
    medium: 'issue-medium',
    low: 'issue-low'
  };

  const agentIcon = {
    Security: '🛡️',
    Database: '🛢️',
    Performance: '📈'
  };

  return (
    <div className="structured-review">
      {parsed.agents.map(agent => (
        <div key={agent.name} className="agent-section">
          <div className="agent-header">
            <span className="agent-icon">{agentIcon[agent.name]}</span>
            <span className="agent-name">{agent.name} Agent</span>
            <span className="agent-model">{agent.model}</span>
          </div>

          <p className="agent-summary">{agent.summary}</p>

          {agent.issues.length > 0 ? (
            <div className="agent-issues">
              {agent.issues.map((issue, i) => (
                <div key={i} className={`issue-card ${severityColor[issue.severity] || ''}`}>
                  <div className="issue-header">
                    <span className="issue-severity">{issue.severity.toUpperCase()}</span>
                    <span className="issue-title">{issue.title}</span>
                  </div>
                  <p className="issue-description">{issue.description}</p>
                  {issue.line_hint && (
                    <code className="issue-hint">{issue.line_hint}</code>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="no-issues">✅ No issues found by this agent</p>
          )}
        </div>
      ))}
    </div>
  );
}

export default function ReviewDetail() {
  const { id } = useParams();
  const [review, setReview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liveStep, setLiveStep] = useState(null);

  useEffect(() => {
    setLoading(true);
    getReview(id)
      .then(setReview)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));

    const eventSource = new EventSource('http://localhost:5000/api/reviews/stream');

    eventSource.onmessage = (event) => {
      const update = JSON.parse(event.data);
      if (String(update.reviewId) === String(id)) {
        setLiveStep(update.step);
        if (update.status === 'completed' || update.status === 'failed') {
          getReview(id).then(setReview);
        }
      }
    };

    return () => eventSource.close();
  }, [id]);

  if (loading) return <p className="status-text">Loading review…</p>;

  if (error) return (
    <div className="empty-state">
      <h2>Couldn't load this review</h2>
      <p className="status-text">{error}</p>
      <Link to="/" className="back-link">← Back</Link>
    </div>
  );

  if (!review) return null;

  return (
    <div className="review-detail">
      <Link to="/" className="back-link">← Back to all reviews</Link>

      <div className="review-detail-header">
        <h1>
          <span className="mono">{review.repo_name}</span>{' '}
          <span className="mono pr-number">#{review.pr_number}</span>
        </h1>
        <div className="header-badges">
          <HealthScore score={review.health_score} />
          <StatusBadge status={review.status} />
        </div>
      </div>

      <h2>{review.pr_title}</h2>

      <ReviewTimeline review={review} liveStep={liveStep} />

      <h3>Synthesized review</h3>
      {review.summary ? (
        <StructuredReview summary={review.summary} />  // ← now actually used
      ) : (
        <p className="status-text">
          {review.status === 'working'
            ? 'Agents are analyzing your code...'
            : 'No findings yet.'}
        </p>
      )}
    </div>
  );
}