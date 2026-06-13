const STATUS_CONFIG = {
  pending: { label: 'Pending', className: 'status-pending' },
  working: { label: 'Working', className: 'status-working' },
  completed: { label: 'Completed', className: 'status-completed' },
  failed: { label: 'Failed', className: 'status-failed' },
};

export default function StatusBadge({ status }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  return <span className={`status-badge ${config.className}`}>{config.label}</span>;
}
