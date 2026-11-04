import type { Leg, LngLat, TravelMode, TripPoint, TimeSlot } from '../types';
import { MAX_POINTS, slotRank } from '../types';

/** 同一天内按「上午 → 下午 → 晚上」排序后，找到新点应插入的位置。 */
function insertIndexFor(
  points: TripPoint[],
  day: number,
  slot: TimeSlot,
): number {
  const target = day * 10 + slotRank(slot);
  const index = points.findIndex(
    (point) => point.day * 10 + slotRank(point.slot) > target,
  );
  return index < 0 ? points.length : index;
}

export interface TripSnapshot {
  points: TripPoint[];
  mode: TravelMode;
  city: string;
}

export interface TripState extends TripSnapshot {
  legs: Leg[];
  selectedLegId: string | null;
  planRunId: number;
}

export type TripAction =
  | { type: 'ADD_POINT'; point: TripPoint }
  | {
      type: 'UPDATE_POINT';
      id: string;
      patch: Partial<Omit<TripPoint, 'id'>>;
    }
  | { type: 'REMOVE_POINT'; id: string }
  | { type: 'MOVE_POINT'; id: string; direction: -1 | 1 }
  | { type: 'SET_POINT_DAY'; id: string; day: number }
  | { type: 'SET_POINT_SLOT'; id: string; slot: TimeSlot }
  | { type: 'CLEAR_POINTS' }
  | { type: 'SET_MODE'; mode: TravelMode }
  | { type: 'SET_CITY'; city: string }
  | { type: 'PLAN_START'; runId: number; legs: Leg[] }
  | {
      type: 'LEG_SUCCESS';
      runId: number;
      legId: string;
      distance: number;
      duration: number;
      path: LngLat[];
      transit?: Leg['transit'];
      actualMode?: Leg['actualMode'];
      estimated?: boolean;
      straight?: boolean;
      note?: string;
    }
  | { type: 'LEG_ERROR'; runId: number; legId: string; error: string }
  | { type: 'CLEAR_LEGS' }
  | { type: 'SELECT_LEG'; legId: string | null }
  | { type: 'HYDRATE'; snapshot: TripSnapshot };

const EMPTY_ROUTE = {
  legs: [] as Leg[],
  selectedLegId: null as string | null,
};

function sameCoord(a: LngLat, b: LngLat): boolean {
  return Math.abs(a.lng - b.lng) < 1e-7 && Math.abs(a.lat - b.lat) < 1e-7;
}

export function tripReducer(state: TripState, action: TripAction): TripState {
  switch (action.type) {
    case 'ADD_POINT': {
      if (state.points.length >= MAX_POINTS) return state;

      // 先按天分组，再按天内的时段分组，保证顺序和面板上看到的一致。
      const points = [...state.points];
      points.splice(
        insertIndexFor(points, action.point.day, action.point.slot),
        0,
        action.point,
      );

      return {
        ...state,
        points,
        ...EMPTY_ROUTE,
      };
    }

    case 'UPDATE_POINT': {
      const target = state.points.find((point) => point.id === action.id);
      if (!target) return state;

      const coordChanged =
        action.patch.coord !== undefined &&
        !sameCoord(target.coord, action.patch.coord);

      return {
        ...state,
        points: state.points.map((point) =>
          point.id === action.id ? { ...point, ...action.patch } : point,
        ),
        ...(coordChanged ? EMPTY_ROUTE : {}),
      };
    }

    case 'REMOVE_POINT':
      return {
        ...state,
        points: state.points.filter((point) => point.id !== action.id),
        ...EMPTY_ROUTE,
      };

    case 'MOVE_POINT': {
      const index = state.points.findIndex((point) => point.id === action.id);
      const nextIndex = index + action.direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= state.points.length) {
        return state;
      }

      // 只允许在同一天、同一时段内调整顺序；跨天走 SET_POINT_DAY，跨时段走 SET_POINT_SLOT。
      const current = state.points[index];
      const neighbor = state.points[nextIndex];
      if (neighbor.day !== current.day || neighbor.slot !== current.slot) {
        return state;
      }

      const points = [...state.points];
      [points[index], points[nextIndex]] = [points[nextIndex], points[index]];
      return { ...state, points, ...EMPTY_ROUTE };
    }

    case 'SET_POINT_DAY': {
      const point = state.points.find((item) => item.id === action.id);
      if (!point || point.day === action.day) return state;

      const rest = state.points.filter((item) => item.id !== action.id);
      const insertAt = insertIndexFor(rest, action.day, point.slot);

      const moved = { ...point, day: action.day };
      const points = [
        ...rest.slice(0, insertAt),
        moved,
        ...rest.slice(insertAt),
      ];

      return { ...state, points, ...EMPTY_ROUTE };
    }

    case 'SET_POINT_SLOT': {
      const point = state.points.find((item) => item.id === action.id);
      if (!point || point.slot === action.slot) return state;

      const rest = state.points.filter((item) => item.id !== action.id);
      const insertAt = insertIndexFor(rest, point.day, action.slot);

      const moved = { ...point, slot: action.slot };
      const points = [
        ...rest.slice(0, insertAt),
        moved,
        ...rest.slice(insertAt),
      ];

      return { ...state, points, ...EMPTY_ROUTE };
    }

    case 'CLEAR_POINTS':
      return { ...state, points: [], ...EMPTY_ROUTE };

    case 'SET_MODE':
      if (state.mode === action.mode) return state;
      return { ...state, mode: action.mode, ...EMPTY_ROUTE };

    case 'SET_CITY':
      if (state.city === action.city) return state;
      return { ...state, city: action.city, ...EMPTY_ROUTE };

    case 'PLAN_START': {
      if (action.runId < state.planRunId) return state;

      const selectedStillExists = action.legs.some(
        (leg) => leg.id === state.selectedLegId,
      );

      return {
        ...state,
        planRunId: action.runId,
        legs: action.legs,
        selectedLegId: selectedStillExists
          ? state.selectedLegId
          : (action.legs[0]?.id ?? null),
      };
    }

    case 'LEG_SUCCESS': {
      if (action.runId !== state.planRunId) return state;
      return {
        ...state,
        legs: state.legs.map((leg) =>
          leg.id === action.legId
            ? {
                ...leg,
                status: 'success',
                distance: action.distance,
                duration: action.duration,
                path: action.path,
                transit: action.transit,
                actualMode: action.actualMode,
                estimated: action.estimated,
                straight: action.straight,
                note: action.note,
                error: undefined,
              }
            : leg,
        ),
      };
    }

    case 'LEG_ERROR': {
      if (action.runId !== state.planRunId) return state;
      return {
        ...state,
        legs: state.legs.map((leg) =>
          leg.id === action.legId
            ? {
                ...leg,
                status: 'error',
                path: [],
                error: action.error,
              }
            : leg,
        ),
      };
    }

    case 'CLEAR_LEGS':
      return { ...state, ...EMPTY_ROUTE };

    case 'SELECT_LEG':
      return { ...state, selectedLegId: action.legId };

    case 'HYDRATE':
      return {
        ...state,
        ...action.snapshot,
        ...EMPTY_ROUTE,
        planRunId: state.planRunId + 1,
      };

    default:
      return state;
  }
}

export function createTripState(snapshot: TripSnapshot): TripState {
  return {
    ...snapshot,
    legs: [],
    selectedLegId: null,
    planRunId: 0,
  };
}
