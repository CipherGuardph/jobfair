import clsx from 'clsx';

export function MatchBadge({ score, parserStatus, needsReview = false }) {
  if (parserStatus === 'failed') {
    return <span className="badge badge-danger">Parse Failed</span>;
  }

  if (needsReview) {
    return <span className="badge badge-warning">Needs Review</span>;
  }

  if (score === null || score === undefined || score === '') {
    return <span className="badge badge-neutral">No score</span>;
  }

  const numericScore = Number(score);
  const tone =
    numericScore >= 80 ? 'badge-success'
      : numericScore >= 50 ? 'badge-warning'
      : 'badge-danger';
  const label =
    numericScore >= 80 ? 'High Match'
      : numericScore >= 50 ? 'Medium Match'
      : 'Low Match';

  return <span className={clsx('badge', tone)}>{label} {numericScore}</span>;
}
