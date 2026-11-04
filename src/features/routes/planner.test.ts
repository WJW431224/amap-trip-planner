import { describe, expect, it } from 'vitest';
import {
  canUseScenicFallback,
  haversineMeters,
  straightLinePlan,
} from './planner';

describe('scenic fallback helpers', () => {
  it('estimates distance and walking time for a straight line', () => {
    const from = { lng: 120.155, lat: 30.274 };
    const to = { lng: 120.102, lat: 30.241 };

    expect(haversineMeters(from, to)).toBeGreaterThan(5000);
    expect(haversineMeters(from, to)).toBeLessThan(7000);

    const plan = straightLinePlan(from, to);
    expect(plan.path).toEqual([from, to]);
    expect(plan.duration).toBeGreaterThan(plan.distance / 2);
  });

  it('only falls back for data/no-route errors, not auth or quota errors', () => {
    expect(canUseScenicFallback(new Error('NO_DATA'))).toBe(true);
    expect(canUseScenicFallback(new Error('没有找到可用路线'))).toBe(true);
    expect(canUseScenicFallback(new Error('INVALID_USER_SCODE'))).toBe(false);
    expect(canUseScenicFallback(new Error('OVER_QUERY_LIMIT'))).toBe(false);
    expect(canUseScenicFallback(new Error('Failed to load'))).toBe(false);
  });
});
