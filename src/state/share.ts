import type { TravelMode, TripPoint } from '../types';
import { MAX_DAYS, MAX_POINTS } from '../types';
import type { TripSnapshot } from './tripReducer';
import { loadSavedTrip, DEFAULT_CITY, MODES } from './persistence';

interface SharedPoint {
  n: string;
  a?: string;
  x: number;
  y: number;
  s?: 'search' | 'map';
  d?: number;
}

interface SharedTrip {
  v: 1;
  p: SharedPoint[];
  m: TravelMode;
  c: string;
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function isMode(value: unknown): value is TravelMode {
  return typeof value === 'string' && MODES.includes(value as TravelMode);
}

export function encodeTrip(snapshot: TripSnapshot): string {
  const payload: SharedTrip = {
    v: 1,
    p: snapshot.points.map((point) => ({
      n: point.name,
      ...(point.address ? { a: point.address } : {}),
      x: Number(point.coord.lng.toFixed(6)),
      y: Number(point.coord.lat.toFixed(6)),
      ...(point.source === 'search' ? { s: 'search' as const } : {}),
      ...(point.day > 1 ? { d: point.day } : {}),
    })),
    m: snapshot.mode,
    c: snapshot.city,
  };
  return toBase64Url(JSON.stringify(payload));
}

export function buildShareUrl(snapshot: TripSnapshot): string {
  return `${window.location.origin}${window.location.pathname}#trip=${encodeTrip(snapshot)}`;
}

function decodeSharedTrip(value: string): TripSnapshot | null {
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as Partial<SharedTrip>;
    if (parsed.v !== 1 || !Array.isArray(parsed.p)) return null;
    if (parsed.p.length > MAX_POINTS) return null;

    const points: TripPoint[] = [];
    for (const [index, raw] of parsed.p.entries()) {
      if (!raw || typeof raw !== 'object') return null;
      const lng = Number(raw.x);
      const lat = Number(raw.y);
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;

      const rawDay = Number(raw.d);
      const day = Number.isInteger(rawDay)
        ? Math.min(MAX_DAYS, Math.max(1, rawDay))
        : 1;

      points.push({
        id: `shared-${index}-${Date.now()}`,
        name:
          typeof raw.n === 'string' && raw.n.trim()
            ? raw.n.trim().slice(0, 120)
            : '地图选点',
        address:
          typeof raw.a === 'string' && raw.a.trim()
            ? raw.a.trim().slice(0, 200)
            : undefined,
        coord: { lng, lat },
        source: raw.s === 'search' ? 'search' : 'map',
        day,
      });
    }

    return {
      points,
      mode: isMode(parsed.m) ? parsed.m : 'driving',
      city:
        typeof parsed.c === 'string' && parsed.c.trim()
          ? parsed.c.trim()
          : DEFAULT_CITY,
    };
  } catch {
    return null;
  }
}

export function consumeShareFromUrl(): TripSnapshot | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#trip=')) return null;

  const encoded = hash.slice('#trip='.length);
  return decodeSharedTrip(encoded);
}

export function clearShareHash(): void {
  if (!window.location.hash.startsWith('#trip=')) return;
  window.history.replaceState(
    null,
    '',
    `${window.location.pathname}${window.location.search}`,
  );
}

export function loadInitialTrip(): TripSnapshot {
  const shared = consumeShareFromUrl();
  if (shared) return shared;

  const saved = loadSavedTrip();
  if (saved) return saved;

  return {
    points: [],
    mode: 'driving',
    city: DEFAULT_CITY,
  };
}
