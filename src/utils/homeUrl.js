export function getHomeUrl() {
  if (typeof window === 'undefined') {
    return '../index.html';
  }

  const homePath = window.location.pathname.includes('/dist/')
    ? '../../index.html'
    : '../index.html';

  return new URL(homePath, window.location.href).href;
}
