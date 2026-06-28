const STEPS = [
  { key: 'fetching_diff',       label: 'Fetching diff from GitHub',          icon: '⬇️' },
  { key: 'retrieving_context',  label: 'Retrieving codebase context (RAG)',   icon: '🧠' },
  { key: 'agents_running',      label: 'Running agents in parallel',          icon: '🤖' },
  { key: 'synthesizing',        label: 'Synthesizing findings',               icon: '⚙️' },
  { key: 'completed',           label: 'Review complete',                     icon: '✅' },
];

function getStepIndex(step) {
  return STEPS.findIndex(s => s.key === step);
}

export default function ReviewTimeline({ review, liveStep }) {
  if (review.status !== 'working' && review.status !== 'completed') return null;

  const currentStep = liveStep || review.current_step || 'fetching_diff';
  const currentIndex = getStepIndex(currentStep);

  return (
    <div className="timeline">
      <h3>Review progress</h3>
      <div className="timeline-steps">
        {STEPS.map((step, i) => {
          const isDone = i < currentIndex || currentStep === 'completed';
          const isActive = i === currentIndex && currentStep !== 'completed';
          const isPending = i > currentIndex;

          return (
            <div
              key={step.key}
              className={`timeline-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''} ${isPending ? 'pending' : ''}`}
            >
              <div className="timeline-icon">
                {isDone ? '✓' : isActive ? step.icon : '○'}
              </div>
              <div className="timeline-content">
                <span className="timeline-label">{step.label}</span>
                {isActive && (
                  <span className="timeline-spinner">processing...</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}