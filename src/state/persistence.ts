import type { TravelMode, TripPoint, TimeSlot } from '../types';
import { MAX_DAYS, MAX_POINTS } from '../types';
import type { TripSnapshot } from './tripReducer';

const STORAGE_KEY = 'amap-trip:trip:v1';
const SAVED_AT_KEY = 'amap-trip:trip-saved-at:v1';
const AUTO_SAVE_KEY = 'amap-trip:auto-save:v1';
const MODES: TravelMode[] = ['driving', 'transit', 'walking', 'riding'];
const DEFAULT_CITY = '杭州市';

interface SavedTrip {
  version: 1;
  points: TripPoint[];
  mode: TravelMode;
  city: string;
  savedAt: number;
}

function isMode(value: unknown): value is TravelMode {
  return typeof value === 'string' && MODES.includes(value as TravelMode);
}

function safeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizePoint(value: unknown): TripPoint | null {
  if (!value || typeof value !== 'object') return null;

  const raw = value as Record<string, unknown>;
  const coord = raw.coord as Record<string, unknown> | undefined;
  const lng = safeNumber(coord?.lng);
  const lat = safeNumber(coord?.lat);
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';

  if (!id || lng === null || lat === null) return null;
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;

  const name =
    typeof raw.name === 'string' && raw.name.trim()
      ? raw.name.trim().slice(0, 120)
      : '地图选点';
  const address =
    typeof raw.address === 'string' ? raw.address.trim().slice(0, 200) : undefined;
  const rawDay = Number(raw.day);
  const day = Number.isInteger(rawDay)
    ? Math.min(MAX_DAYS, Math.max(1, rawDay))
    : 1;
  const slot: TimeSlot =
    raw.slot === 'pm' || raw.slot === 'night' ? raw.slot : 'am';

  return {
    id,
    name,
    coord: { lng, lat },
    address: address || undefined,
    source: raw.source === 'search' ? 'search' : 'map',
    day,
    slot,
  };
}

function sanitizePoints(value: unknown): TripPoint[] | null {
  if (!Array.isArray(value)) return null;

  const points = value
    .slice(0, MAX_POINTS)
    .map(sanitizePoint)
    .filter((point): point is TripPoint => point !== null);

  if (value.length > 0 && points.length === 0) return null;
  return points;
}

export interface SavedTripResult {
  snapshot: TripSnapshot;
  savedAt: number;
}

export function loadSavedTrip(): SavedTripResult | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedTrip>;
    if (parsed.version !== 1) return null;

    const points = sanitizePoints(parsed.points);
    if (!points) return null;

    // 空数组是合法的「已清空」状态，不能被当成没数据。
    return {
      snapshot: {
        points,
        mode: isMode(parsed.mode) ? parsed.mode : 'driving',
        city:
          typeof parsed.city === 'string' && parsed.city.trim()
            ? parsed.city.trim()
            : DEFAULT_CITY,
      },
      savedAt:
        typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
          ? parsed.savedAt
          : 0,
    };
  } catch {
    return null;
  }
}

/** 本机行程最后一次变更的时间，独立小键，避免每次保存重写整份行程。 */
export function readLocalSavedAt(): number {
  try {
    const value = Number(localStorage.getItem(SAVED_AT_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

export function touchLocalSavedAt(): number {
  const now = Date.now();
  try {
    localStorage.setItem(SAVED_AT_KEY, String(now));
  } catch {
    // ignore
  }
  return now;
}

/** 覆盖本机时间戳（采用仓库版本时，以对方时间为准）。 */
export function setLocalSavedAt(value: number): void {
  try {
    localStorage.setItem(SAVED_AT_KEY, String(value));
  } catch {
    // ignore
  }
}

/**
 * 老版本只在整份行程里存 savedAt。升级后第一次打开时把它迁到小键上，
 * 否则旧设备的本地改动会被时间戳为 0 误判成「比仓库旧」。
 */
export function migrateLocalSavedAt(): void {
  try {
    if (localStorage.getItem(SAVED_AT_KEY)) return;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<SavedTrip>;
    if (typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)) {
      localStorage.setItem(SAVED_AT_KEY, String(parsed.savedAt));
    }
  } catch {
    // ignore
  }
}

export function saveTrip(snapshot: TripSnapshot): void {
  try {
    const payload: SavedTrip = {
      version: 1,
      points: snapshot.points,
      mode: snapshot.mode,
      city: snapshot.city,
      savedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // 存储不可用时保持内存状态，不打断主流程。
  }
}

export function clearSavedTrip(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** 自动保存到仓库的开关，默认开启（只在配了 Token 的设备上生效）。 */
export function readAutoSaveEnabled(): boolean {
  try {
    return localStorage.getItem(AUTO_SAVE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function writeAutoSaveEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(AUTO_SAVE_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

/** 行程内容指纹：用于判断两份行程是否一致，忽略 id 和时间戳。 */
export function tripFingerprint(snapshot: TripSnapshot): string {
  return JSON.stringify({
    m: snapshot.mode,
    c: snapshot.city,
    p: snapshot.points.map((point) => [
      point.name,
      point.address ?? '',
      Number(point.coord.lng.toFixed(6)),
      Number(point.coord.lat.toFixed(6)),
      point.day,
      point.slot,
    ]),
  });
}

export { DEFAULT_CITY, MODES, sanitizePoints };
