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
 * 地图选点常常拿到一整串地址（浙江省杭州市西湖区蒋村花园）。
 * 简称的做法是：先把省市区域这些前缀去掉，剩下的是有辨识度的地名；
 * 如果还是太长，就保留末尾那几个字（末尾通常才是真正的标志物）。
 * 完整名称仍然保留在原字段里，鼠标悬停能看到，也能用铅笔自己改。
 */
export function shortName(raw: string, city?: string, limit = 9): string {
  const full = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!full) return full;
  if (full.length <= limit) return full;

  let name = full.replace(/^(中国|中华人民共和国)/, '');

  // 当前城市名往往和「XX市」重复，先去掉。
  const cityName = (city ?? '').trim().replace(/(市|地区|自治州)$/, '');
  if (cityName.length >= 2) {
    const stripped = name.replace(new RegExp(`^${cityName}(市)?`), '');
    if (stripped && stripped !== name) name = stripped;
  }

  // 省 / 市 / 区 / 镇 这类行政前缀：能去掉就去掉，但至少留 4 个字，
  // 免得把「西湖区图书馆」削成「图书馆」。
  for (let round = 0; round < 4; round += 1) {
    const next = name.replace(ADMIN_PREFIX, '');
    if (next === name || next.length < 4) break;
    name = next;
  }

  if (name.length <= limit) return name;

  // 还是太长：留末尾 limit 个字，末尾一般是真正要去的地方。
  const tail = name.slice(-limit);
  const cutAt = tail.search(/[区县市镇乡街道]/);
  const base = cutAt > 0 ? tail.slice(cutAt + 1) : tail;
  // 截断处可能正好落在「-」「·」「、」上，去掉开头的符号和数字。
  const cleaned = base.replace(/^[^一-龥A-Za-z]+/, '');
  return (cleaned.length >= 2 ? cleaned : base).trim() || name;
}
