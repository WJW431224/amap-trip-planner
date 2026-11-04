export type TravelMode = 'driving' | 'transit' | 'walking' | 'riding';

export interface LngLat {
  lng: number;
  lat: number;
}

export type PointSource = 'search' | 'map';

/** 同一天里的时段分组。 */
export type TimeSlot = 'am' | 'pm' | 'night';

export const TIME_SLOTS: TimeSlot[] = ['am', 'pm', 'night'];

export const SLOT_LABELS: Record<TimeSlot, string> = {
  am: '上午',
  pm: '下午',
  night: '晚上',
};

export function slotRank(slot: TimeSlot): number {
  const index = TIME_SLOTS.indexOf(slot);
  return index < 0 ? 0 : index;
}

export interface TripPoint {
  id: string;
  name: string;
  coord: LngLat;
  address?: string;
  source: PointSource;
  day: number;
  slot: TimeSlot;
}

export interface TransitSummary {
  segments: string[];
  transfers: number;
  walkingDistance?: number;
}

export type LegStatus = 'loading' | 'success' | 'error';

export interface Leg {
  id: string;
  fromId: string;
  toId: string;
  day: number;
  mode: TravelMode;
  actualMode?: TravelMode;
  status: LegStatus;
  distance?: number;
  duration?: number;
  path: LngLat[];
  transit?: TransitSummary;
  estimated?: boolean;
  straight?: boolean;
  note?: string;
  error?: string;
}

export const MAX_POINTS = 20;
export const MAX_DAYS = 14;

export const MODE_LABELS: Record<TravelMode, string> = {
  driving: '驾车',
  transit: '公交',
  walking: '步行',
  riding: '骑行',
};
