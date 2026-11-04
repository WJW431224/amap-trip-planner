import { describe, expect, it } from 'vitest';
import { sanitizePoints } from './persistence';

describe('sanitizePoints', () => {
  it('keeps valid points and defaults optional fields', () => {
    const points = sanitizePoints([
      {
        id: 'a',
        name: '西湖',
        coord: { lng: 120.15, lat: 30.27 },
        source: 'search',
      },
    ]);

    expect(points).toHaveLength(1);
    expect(points?.[0].address).toBeUndefined();
  });

  it('drops points outside the coordinate range', () => {
    expect(
      sanitizePoints([
        { id: 'bad', name: 'X', coord: { lng: 999, lat: 30 } },
      ]),
    ).toBeNull();
  });

  it('rejects a malformed payload', () => {
    expect(sanitizePoints('not-an-array')).toBeNull();
  });

  it('caps points at the maximum', () => {
    const points = Array.from({ length: 30 }, (_, index) => ({
      id: String(index),
      name: `P${index}`,
      coord: { lng: 120 + index * 0.001, lat: 30 + index * 0.001 },
    }));

    expect(sanitizePoints(points)).toHaveLength(20);
  });
});
