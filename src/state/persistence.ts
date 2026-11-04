import type { TravelMode, TripPoint, TimeSlot } from '../types';
import { MAX_DAYS, MAX_POINTS } from '../types';
import type { TripSnapshot } from './tripReducer';

const STORAGE_KEY = 'amap-trip:trip:v1';
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

export function loadSavedTrip(): TripSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<SavedTrip>;
    if (parsed.version !== 1) return null;

    const points = sanitizePoints(parsed.points);
    if (!points) return null;

    return {
      points,
      mode: isMode(parsed.mode) ? parsed.mode : 'driving',
      city:
        typeof parsed.city === 'string' && parsed.city.trim()
          ? parsed.city.trim()
          : DEFAULT_CITY,
    };
  } catch {
    return null;
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

export { DEFAULT_CITY, MODES, sanitizePoints };
