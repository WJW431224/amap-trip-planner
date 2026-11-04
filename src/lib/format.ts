export function formatDistance(meters?: number): string {
  if (meters === undefined || !Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${Math.max(1, Math.round(meters))} 米`;
  return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)} 公里`;
}

export function formatDuration(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '—';

  const totalMinutes = Math.max(1, Math.round(seconds / 60));
  if (totalMinutes < 60) return `${totalMinutes} 分钟`;

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes ? `${hours} 小时 ${minutes} 分` : `${hours} 小时`;
}

export function pointLetter(index: number): string {
  if (index < 26) return String.fromCharCode(65 + index);
  return String(index + 1);
}

const DAY_COLORS = ['#ff7a1a', '#1f8a5b', '#2f6db0', '#8b5cb8', '#b8860b'];

export function dayColor(day: number): string {
  const index = (Math.max(1, Math.floor(day)) - 1) % DAY_COLORS.length;
  return DAY_COLORS[index];
}

export function maskId(value: string): string {
  return value.slice(0, 8);
}

export function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `p-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}
