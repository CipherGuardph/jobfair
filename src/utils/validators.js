export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

export function isValidPhone(value) {
  const normalized = String(value || '').replace(/[^\d+]/g, '');
  return normalized.length >= 7 && normalized.length <= 20;
}

export function isAllowedResumeType(file) {
  if (!file) return false;
  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  return allowed.includes(file.type);
}

export function isAllowedResumeSize(file, maxMb = 5) {
  if (!file) return false;
  return file.size <= maxMb * 1024 * 1024;
}

export function formatDateTime(value) {
  if (!value) return '-';
  const date = value.toDate ? value.toDate() : new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

export function isBetweenDates(now, startAt, endAt) {
  const current = now instanceof Date ? now : new Date(now);
  const start = startAt?.toDate ? startAt.toDate() : new Date(startAt);
  const end = endAt?.toDate ? endAt.toDate() : new Date(endAt);
  return current >= start && current <= end;
}

export function buildPositionLabel(position) {
  if (!position) return '';
  return position.title || position.name || position.label || 'Position';
}

