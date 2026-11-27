import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TripSnapshot } from './tripReducer';
import type { CloudTrip } from './cloud';
import { loadInitialTrip } from './share';
import { tripFingerprint } from './persistence';

const TRIP_KEY = 'amap-trip:trip:v1';
const SAVED_AT_KEY = 'amap-trip:trip-saved-at:v1';

// node 环境没有 DOM，用内存桩替代 localStorage 和 window。
const store = new Map<string, string>();
const locationStub = { search: '', hash: '' };
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, String(value));
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
});
vi.stubGlobal('window', {
  location: locationStub,
  history: { replaceState: () => {} },
});

function makeSnapshot(name: string): TripSnapshot {
  return {
    points: [
      {
        id: 'p1',
        name,
        coord: { lng: 120.15, lat: 30.27 },
        source: 'search',
        day: 1,
        slot: 'am',
      },
    ],
    mode: 'walking',
    city: '杭州市',
  };
}

function seedLocal(snapshot: TripSnapshot, savedAt: number) {
  store.set(
    TRIP_KEY,
    JSON.stringify({ version: 1, ...snapshot, savedAt }),
  );
}

function makeCloud(name: string, savedAt: number): CloudTrip {
  return { snapshot: makeSnapshot(name), savedAt };
}

beforeEach(() => {
  store.clear();
  locationStub.search = '';
  locationStub.hash = '';
});

describe('loadInitialTrip 双端同步选择', () => {
  it('本机比仓库新时用本机', () => {
    seedLocal(makeSnapshot('本机新'), 2000);
    const result = loadInitialTrip(makeCloud('仓库旧', 1000));
    expect(result.snapshot.points[0].name).toBe('本机新');
    expect(result.fromLocal).toBe(true);
  });

  it('仓库比本机新时用仓库（另一台设备保存过）', () => {
    seedLocal(makeSnapshot('本机旧'), 1000);
    const result = loadInitialTrip(makeCloud('仓库新', 2000));
    expect(result.snapshot.points[0].name).toBe('仓库新');
    expect(result.fromLocal).toBe(false);
    expect(result.savedAt).toBe(2000);
  });

  it('本机没数据时用仓库', () => {
    const result = loadInitialTrip(makeCloud('仓库', 1000));
    expect(result.snapshot.points[0].name).toBe('仓库');
  });

  it('仓库的已清空状态能覆盖本机旧行程', () => {
    seedLocal(makeSnapshot('本机旧'), 1000);
    const cleared: CloudTrip = {
      snapshot: { points: [], mode: 'walking', city: '杭州市' },
      savedAt: 2000,
    };
    const result = loadInitialTrip(cleared);
    expect(result.snapshot.points).toHaveLength(0);
  });

  it('本机的已清空状态不会被旧仓库行程复活', () => {
    seedLocal({ points: [], mode: 'walking', city: '杭州市' }, 2000);
    const result = loadInitialTrip(makeCloud('仓库旧', 1000));
    expect(result.snapshot.points).toHaveLength(0);
    expect(result.fromLocal).toBe(true);
  });

  it('?trip= 参数优先于本机和仓库', () => {
    seedLocal(makeSnapshot('本机'), 3000);
    const payload = {
      v: 1,
      p: [{ n: '链接点', x: 120.2, y: 30.3 }],
      m: 'walking',
      c: '杭州市',
    };
    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    let binary = '';
    bytes.forEach((byte) => {
      binary += String.fromCharCode(byte);
    });
    const encoded = btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
    locationStub.search = `?trip=${encoded}`;

    const result = loadInitialTrip(makeCloud('仓库', 9000));
    expect(result.snapshot.points[0].name).toBe('链接点');
    expect(result.fromUrl).toBe(true);
    expect(result.savedAt).toBeGreaterThan(0);
  });

  it('老数据只有整份行程里的 savedAt 时也能正确比较', () => {
    seedLocal(makeSnapshot('本机新'), 2000);
    store.delete(SAVED_AT_KEY);
    const result = loadInitialTrip(makeCloud('仓库旧', 1000));
    expect(result.snapshot.points[0].name).toBe('本机新');
    expect(store.get(SAVED_AT_KEY)).toBe('2000');
  });
});

describe('tripFingerprint', () => {
  it('忽略 id 差异，内容一致即相同', () => {
    const a = makeSnapshot('西湖');
    const b = makeSnapshot('西湖');
    b.points[0].id = 'another-id';
    expect(tripFingerprint(a)).toBe(tripFingerprint(b));
  });

  it('改名、挪天、换时段都会改变指纹', () => {
    const base = makeSnapshot('西湖');
    const renamed = makeSnapshot('西湖改名');
    const moved = makeSnapshot('西湖');
    moved.points[0].day = 2;
    const reslotted = makeSnapshot('西湖');
    reslotted.points[0].slot = 'pm';
    expect(tripFingerprint(base)).not.toBe(tripFingerprint(renamed));
    expect(tripFingerprint(base)).not.toBe(tripFingerprint(moved));
    expect(tripFingerprint(base)).not.toBe(tripFingerprint(reslotted));
  });
});
