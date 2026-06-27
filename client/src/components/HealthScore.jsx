export default function HealthScore({ score }) {
  if (score === null || score === undefined) {
    return <span className="health-na">—</span>;
  }

  const color = score > 75 ? 'health-good' : score > 50 ? 'health-warn' : 'health-bad';
  const label = score > 75 ? 'Healthy' : score > 50 ? 'At Risk' : 'Critical';

  return (
    <span className={`health-score ${color}`}>
      {score} <span className="health-label">{label}</span>
    </span>
  );
}