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
const TRAILING_DETAIL = /(\d+[号幢栋楼室层单元铺]?|\d+[-—]\d+号?|[一二三四五六七八九十]+[号幢栋楼室层单元]|[A-Za-z]?\d+[号幢栋楼室层单元])+$/;
const TYPE_SUFFIX =
  /(风景名胜区|名胜区|风景区|景区|开发区|高新区|工业园|科技园|产业园|创业园|家园|花园|小区|公寓|写字楼|大厦|广场|公园|国际机场|机场|航站楼|火车站|高铁站|汽车站|购物中心|商城|市场|中心|大学|学院|学校|中学|小学|校区|医院|酒店|宾馆|委员会|管委会|政府|园|馆|站)$/;

/**
 * 地图选点常常拿到一整串地址（浙江省杭州市西湖区蒋村花园），
 * 列表里放不下，这里压成 3～5 个字的简称。
 * 顺序：去掉省市区分公司 → 去掉「12号/3幢」→ 去掉「景区/科技园」这类尾巴 → 还长就截断。
 * 每步只在还超过 limit 时继续，避免把「蒋村花园」削成「蒋村」。
 * 完整名称保留在原字段里，鼠标悬停能看到。
 */
export function shortName(raw: string, city?: string, limit = 5): string {
  const full = (raw ?? '').replace(/\s+/g, ' ').trim();
  if (!full) return full;
  if (full.length <= limit) return full;

  let name = full.replace(/^(中国|中华人民共和国)/, '');

  // 1. 当前城市名往往和「XX市」重复，先去掉。
  const cityName = (city ?? '').trim().replace(/(市|地区|自治州)$/, '');
  if (cityName.length >= 2) {
    const stripped = name.replace(new RegExp(`^${cityName}(市)?`), '');
    if (stripped && stripped !== name) name = stripped;
  }

  // 2. 省 / 市 / 区 / 镇 这类行政前缀。
  for (let round = 0; round < 4 && name.length > limit; round += 1) {
    const next = name.replace(ADMIN_PREFIX, '');
    if (next === name || !next) break;
    name = next;
  }

  // 3. 门牌、幢号这类尾部细节。
  if (name.length > limit) {
    const next = name
      .replace(TRAILING_DETAIL, '')
      .replace(/[A-Za-z]+[\d.\-]*$/, '')
      .trim();
    if (next) name = next;
  }

  // 4. 景区、科技园、小区这类通名后缀；「北京首都国际机场T3航站楼」这种要削两层。
  for (let round = 0; round < 2 && name.length > limit; round += 1) {
    const next = name
      .replace(TYPE_SUFFIX, '')
      .replace(/[A-Za-z]*\d+$/, '')
      .trim();
    if (!next || next === name || next.length < 2) break;
    name = next;
  }

  // 5. 还是太长，只好截断。
  if (name.length > limit) name = name.slice(0, limit);
  return name || full;
}
