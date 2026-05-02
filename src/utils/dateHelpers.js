export function toDate(value) {
  if (!value) return null;
  return value.toDate ? value.toDate() : new Date(value);
}

export function nowLocalIso() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const local = new Date(now.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function dateToInputValue(value) {
  if (!value) return '';
  const date = toDate(value);
  if (!date) return '';
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

