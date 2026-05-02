import clsx from 'clsx';

const statusMap = {
  Submitted: 'badge-info',
  'For Screening': 'badge-warning',
  'For Interview': 'badge-info',
  Interviewed: 'badge-neutral',
  'Pending Requirements': 'badge-warning',
  Passed: 'badge-success',
  Failed: 'badge-danger',
  Completed: 'badge-success',
  'Now Serving': 'badge-info',
  open: 'badge-success',
  closed: 'badge-danger'
};

export function StatusBadge({ value }) {
  return <span className={clsx('badge', statusMap[value] || 'badge-neutral')}>{value}</span>;
}
