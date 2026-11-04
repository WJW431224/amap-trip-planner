import type { Leg, LngLat, TravelMode, TripPoint } from '../types';
import { MAX_POINTS } from '../types';

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

      // 保持同一天的点连续，避免跨天插在中间导致排序/路线分段混乱。
      const points = [...state.points];
      let insertAt = points.findIndex((point) => point.day > action.point.day);
      if (insertAt < 0) insertAt = points.length;
      points.splice(insertAt, 0, action.point);

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

      // 只允许在同一天内调整顺序，跨天移动走 SET_POINT_DAY。
      if (state.points[nextIndex].day !== state.points[index].day) {
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
      let insertAt = rest.findIndex((item) => item.day > action.day);
      if (insertAt < 0) insertAt = rest.length;

      const moved = { ...point, day: action.day };
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
