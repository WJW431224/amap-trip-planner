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

const ADMIN_PREFIX = /^[一-龥]{2,12}?(省|市|区|县|镇|乡|街道|自治区|特别行政区)/;

/**
 * 地图选点常常拿到一整串地址（浙江省杭州市西湖区蒋村花园），
 * 列表里放不下，这里去掉行政前缀，留能认出来的那截。
 * 完整名称仍然保留在原字段里，鼠标悬停能看到。
 */
export function shortName(raw: string, limit = 12): string {
  const full = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!full) return full;

  let name = full.replace(/^(中国|中华人民共和国)/, '');
  // 只有本来就偏长的名字才动，避免把「西湖区图书馆」这种短名削掉。
  if (name.length > limit) {
    for (let round = 0; round < 4; round += 1) {
      const next = name.replace(ADMIN_PREFIX, '');
      if (next === name || !next) break;
      name = next;
    }
  }

  name = name.trim();
  if (!name) return full;
  return name.length > limit ? `${name.slice(0, limit)}…` : name;
}
