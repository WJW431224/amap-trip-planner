import type { TripSnapshot } from './tripReducer';
import type { TravelMode, TimeSlot, TripPoint } from '../types';
import { DEFAULT_CITY, MODES, sanitizePoints } from './persistence';

/**
 * 把行程存到 GitHub 仓库里（public/trip.json），首页打开时读回来。
 * 这样换设备、发给别人，看到的都是同一份行程，不用带长链接。
 */

const STORAGE_KEY = 'amap-trip:cloud:v1';

export interface CloudConfig {
  owner: string;
  repo: string;
  branch: string;
  path: string;
  token: string;
}

const DEFAULT_CONFIG: CloudConfig = {
  owner: 'WJW431224',
  repo: 'amap-trip-planner',
  branch: 'main',
  path: 'public/trip.json',
  token: '',
};

export interface CloudTripFile {
  version: 1;
  savedAt: number;
  points: Array<{
    id?: string;
    name: string;
    coord: { lng: number; lat: number };
    address?: string;
    source?: 'search' | 'map';
    day: number;
    slot?: TimeSlot;
  }>;
  mode: TravelMode;
  city: string;
}

export function readCloudConfig(): CloudConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw) as Partial<CloudConfig>;
    return {
      owner: parsed.owner?.trim() || DEFAULT_CONFIG.owner,
      repo: parsed.repo?.trim() || DEFAULT_CONFIG.repo,
      branch: parsed.branch?.trim() || DEFAULT_CONFIG.branch,
      path: parsed.path?.trim() || DEFAULT_CONFIG.path,
      token: typeof parsed.token === 'string' ? parsed.token : '',
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveCloudConfig(config: CloudConfig): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // 存不进本地也不影响本次使用。
  }
}

function toSnapshot(file: Partial<CloudTripFile> | null | undefined): TripSnapshot | null {
  if (!file || !Array.isArray(file.points)) return null;

  // 仓库里的文件可能没写 id / source，这里补上，否则会被 sanitize 全部丢掉。
  const rawPoints = file.points.map((point, index) => ({
    ...point,
    id: point.id || `cloud-${index}`,
    source: 'search' as const,
  }));

  const points = sanitizePoints(rawPoints) ?? [];
  if (!points.length) return null;

  const mode: TravelMode = MODES.includes(file.mode as TravelMode)
    ? (file.mode as TravelMode)
    : 'driving';
  const city =
    typeof file.city === 'string' && file.city.trim()
      ? file.city.trim()
      : DEFAULT_CITY;

  return { points, mode, city };
}

/** 读站点自带的 trip.json（同源，不走外网）。 */
export async function fetchBundledTrip(): Promise<TripSnapshot | null> {
  try {
    const response = await fetch(new URL('trip.json', document.baseURI).toString(), {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    return toSnapshot((await response.json()) as CloudTripFile);
  } catch {
    return null;
  }
}

interface ContentsResponse {
  content?: string;
  sha?: string;
}

function decodeBase64(value: string): string {
  const clean = value.replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function apiUrl(config: CloudConfig): string {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.path}`;
}

/** 从仓库读行程（需要 token 才能读私有仓库；公开仓库不带 token 也能读）。 */
export async function fetchRemoteTrip(
  config: CloudConfig,
): Promise<TripSnapshot | null> {
  const response = await fetch(`${apiUrl(config)}?ref=${encodeURIComponent(config.branch)}`, {
    headers: config.token
      ? { authorization: `Bearer ${config.token}`, accept: 'application/vnd.github+json' }
      : { accept: 'application/vnd.github+json' },
    cache: 'no-store',
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`读取失败（HTTP ${response.status}）`);
  }

  const data = (await response.json()) as ContentsResponse;
  if (!data.content) return null;
  return toSnapshot(JSON.parse(decodeBase64(data.content)) as CloudTripFile);
}

/** 把当前行程写回仓库，触发一次 Pages 重新部署。 */
export async function pushTripToRepo(
  config: CloudConfig,
  snapshot: TripSnapshot,
): Promise<void> {
  if (!config.token) throw new Error('还没有填 GitHub Token');

  const file: CloudTripFile = {
    version: 1,
    savedAt: Date.now(),
    points: snapshot.points.map((point: TripPoint) => ({
      id: point.id,
      name: point.name,
      coord: point.coord,
      address: point.address,
      source: point.source,
      day: point.day,
      slot: point.slot,
    })),
    mode: snapshot.mode,
    city: snapshot.city,
  };

  // 先拿现有文件的 sha，更新时必须带上。
  let sha: string | undefined;
  const existing = await fetch(
    `${apiUrl(config)}?ref=${encodeURIComponent(config.branch)}`,
    {
      headers: { authorization: `Bearer ${config.token}`, accept: 'application/vnd.github+json' },
      cache: 'no-store',
    },
  );
  if (existing.ok) {
    sha = ((await existing.json()) as ContentsResponse).sha;
  }

  const response = await fetch(apiUrl(config), {
    method: 'PUT',
    headers: {
      authorization: `Bearer ${config.token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      message: `同步行程 ${new Date().toLocaleString('zh-CN')}`,
      content: encodeBase64(JSON.stringify(file, null, 2)),
      branch: config.branch,
      ...(sha ? { sha } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`写入失败（HTTP ${response.status}）${detail.slice(0, 120)}`);
  }
}
