import { describe, expect, it } from 'vitest';
import type { Leg, TripPoint } from '../types';
import { createTripState, tripReducer } from './tripReducer';

const base = createTripState({
  points: [],
  mode: 'driving',
  city: '杭州市',
});

function point(
  id: string,
  name: string,
  lng: number,
  lat: number,
  day = 1,
): TripPoint {
  return {
    id,
    name,
    coord: { lng, lat },
    source: 'search',
    day,
  };
}

function stubLeg(id: string, fromId: string, toId: string): Leg {
  return {
    id,
    fromId,
    toId,
    day: 1,
    mode: 'driving',
    status: 'loading',
    path: [],
  };
}

describe('tripReducer', () => {
  it('adds points in order', () => {
    let state = tripReducer(base, {
      type: 'ADD_POINT',
      point: point('a', '西湖', 120.15, 30.27),
    });
    state = tripReducer(state, {
      type: 'ADD_POINT',
      point: point('b', '灵隐寺', 120.1, 30.24),
    });

    expect(state.points.map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('moves points up and down', () => {
    let state = tripReducer(base, {
      type: 'ADD_POINT',
      point: point('a', 'A', 120, 30),
    });
    state = tripReducer(state, {
      type: 'ADD_POINT',
      point: point('b', 'B', 121, 31),
    });

    const moved = tripReducer(state, {
      type: 'MOVE_POINT',
      id: 'a',
      direction: 1,
    });

    expect(moved.points.map((item) => item.id)).toEqual(['b', 'a']);
  });

  it('keeps points of the same day contiguous when adding to an earlier day', () => {
    let state = tripReducer(base, {
      type: 'ADD_POINT',
      point: point('a', 'A', 120, 30, 1),
    });
    state = tripReducer(state, {
      type: 'ADD_POINT',
      point: point('b', 'B', 121, 31, 2),
    });
    state = tripReducer(state, {
      type: 'ADD_POINT',
      point: point('c', 'C', 122, 32, 1),
    });

    expect(state.points.map((item) => item.id)).toEqual(['a', 'c', 'b']);

    const moved = tripReducer(state, {
      type: 'MOVE_POINT',
      id: 'c',
      direction: -1,
    });
    expect(moved.points.map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not move a point across day boundaries but can reassign its day', () => {
    let state = tripReducer(base, {
      type: 'ADD_POINT',
      point: point('a', 'A', 120, 30, 1),
    });
    state = tripReducer(state, {
      type: 'ADD_POINT',
      point: point('b', 'B', 121, 31, 2),
    });

    const blocked = tripReducer(state, {
      type: 'MOVE_POINT',
      id: 'a',
      direction: 1,
    });
    expect(blocked.points.map((item) => item.id)).toEqual(['a', 'b']);

    const reassigned = tripReducer(state, {
      type: 'SET_POINT_DAY',
      id: 'a',
      day: 2,
    });
    expect(reassigned.points.map((item) => item.day)).toEqual([2, 2]);
  });

  it('clears stale routes when coordinates change, but keeps them on name-only edits', () => {
    let state = tripReducer(base, {
      type: 'ADD_POINT',
      point: point('a', 'A', 120, 30),
    });
    state = tripReducer(state, {
      type: 'ADD_POINT',
      point: point('b', 'B', 121, 31),
    });
    state = tripReducer(state, {
      type: 'PLAN_START',
      runId: 1,
      legs: [stubLeg('a__b', 'a', 'b')],
    });
    state = tripReducer(state, {
      type: 'LEG_SUCCESS',
      runId: 1,
      legId: 'a__b',
      distance: 1000,
      duration: 600,
      path: [
        { lng: 120, lat: 30 },
        { lng: 121, lat: 31 },
      ],
    });

    expect(state.legs).toHaveLength(1);

    const renamed = tripReducer(state, {
      type: 'UPDATE_POINT',
      id: 'a',
      patch: { name: '新名字' },
    });
    expect(renamed.legs).toHaveLength(1);

    const moved = tripReducer(renamed, {
      type: 'UPDATE_POINT',
      id: 'a',
      patch: { coord: { lng: 120.01, lat: 30.01 } },
    });
    expect(moved.legs).toHaveLength(0);
    expect(moved.selectedLegId).toBeNull();
  });

  it('ignores stale route results', () => {
    let state = tripReducer(base, {
      type: 'ADD_POINT',
      point: point('a', 'A', 120, 30),
    });
    state = tripReducer(state, {
      type: 'ADD_POINT',
      point: point('b', 'B', 121, 31),
    });
    state = tripReducer(state, {
      type: 'PLAN_START',
      runId: 2,
      legs: [stubLeg('a__b', 'a', 'b')],
    });
    state = tripReducer(state, {
      type: 'LEG_SUCCESS',
      runId: 1,
      legId: 'a__b',
      distance: 999,
      duration: 999,
      path: [],
    });

    expect(state.legs[0].status).toBe('loading');
    expect(state.legs[0].distance).toBeUndefined();
  });

  it('selects the first leg on plan start and keeps a valid selection', () => {
    let state = tripReducer(base, {
      type: 'ADD_POINT',
      point: point('a', 'A', 120, 30),
    });
    state = tripReducer(state, {
      type: 'ADD_POINT',
      point: point('b', 'B', 121, 31),
    });
    state = tripReducer(state, {
      type: 'PLAN_START',
      runId: 1,
      legs: [stubLeg('a__b', 'a', 'b')],
    });

    expect(state.selectedLegId).toBe('a__b');

    const selected = tripReducer(state, {
      type: 'SELECT_LEG',
      legId: 'a__b',
    });
    expect(selected.selectedLegId).toBe('a__b');
  });
});
