import type { LngLat, TransitSummary, TravelMode } from '../../types';
import { formatDistance, formatDuration } from '../../lib/format';

export interface LegPlanResult {
  distance: number;
  duration: number;
  path: LngLat[];
  transit?: TransitSummary;
}

export function haversineMeters(from: LngLat, to: LngLat): number {
  const radius = 6371000;
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function canUseScenicFallback(error: unknown): boolean {
  const text =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : JSON.stringify(error) ?? '';

  // 鉴权、配额、网络问题不能拿直线糊弄，必须把真实错误暴露出来。
  return !/INVALID_USER|USERKEY|PLAT_NOMATCH|OVER_|QUOTA|INVALID_USER_SCODE|超时|Network|Failed to load/i.test(
    text,
  );
}

export function straightLinePlan(from: LngLat, to: LngLat): LegPlanResult {
  const distance = haversineMeters(from, to);
  return {
    distance,
    // 景区园路按 1.1m/s 估算，明确标记为估算值。
    duration: distance / 1.1,
    path: [from, to],
  };
}

function coordFrom(value: any): LngLat | null {
  if (!value) return null;

  if (Array.isArray(value) && value.length >= 2) {
    const lng = Number(value[0]);
    const lat = Number(value[1]);
    return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
  }

  if (typeof value.getLng === 'function' && typeof value.getLat === 'function') {
    return { lng: Number(value.getLng()), lat: Number(value.getLat()) };
  }

  const lng = Number(value.lng ?? value.getLng);
  const lat = Number(value.lat ?? value.getLat);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}

function dedupe(path: LngLat[]): LngLat[] {
  return path.filter((point, index) => {
    if (index === 0) return true;
    const previous = path[index - 1];
    return (
      Math.abs(previous.lng - point.lng) > 1e-7 ||
      Math.abs(previous.lat - point.lat) > 1e-7
    );
  });
}

function pathFromSteps(steps: any[] | undefined): LngLat[] {
  if (!Array.isArray(steps)) return [];

  const path: LngLat[] = [];
  for (const step of steps) {
    if (!Array.isArray(step?.path)) continue;
    for (const raw of step.path) {
      const point = coordFrom(raw);
      if (point) path.push(point);
    }
  }
  return dedupe(path);
}

function routePath(route: any): LngLat[] {
  if (Array.isArray(route?.path)) {
    return dedupe(
      route.path
        .map(coordFrom)
        .filter((point: LngLat | null): point is LngLat => point !== null),
    );
  }

  const direct = pathFromSteps(route?.steps);
  if (direct.length) return direct;

  const rides = Array.isArray(route?.rides) ? route.rides : [];
  for (const ride of rides) {
    if (Array.isArray(ride?.path)) {
      const directRidePath = dedupe(
        ride.path
          .map(coordFrom)
          .filter((point: LngLat | null): point is LngLat => point !== null),
      );
      if (directRidePath.length) return directRidePath;
    }

    const path = pathFromSteps(ride?.steps);
    if (path.length) return path;
  }

  return [];
}

function searchPlanner(
  planner: any,
  from: LngLat,
  to: LngLat,
  timeoutMs = 18000,
): Promise<any> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (handler: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      handler();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error('路线规划超时，请稍后重试')));
    }, timeoutMs);

    try {
      planner.search(
        [from.lng, from.lat],
        [to.lng, to.lat],
        (status: string, result: any) => {
          if (status === 'complete') {
            finish(() => resolve(result));
          } else {
            finish(() =>
              reject(
                new Error(
                  result?.info ??
                    result?.message ??
                    (status === 'no_data' ? '没有找到可用路线' : '路线规划失败'),
                ),
              ),
            );
          }
        },
      );
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

function normalizeRoute(
  result: any,
  mode: TravelMode,
  from: LngLat,
  to: LngLat,
): LegPlanResult {
  const route = result?.routes?.[0];
  if (!route) {
    throw new Error('没有找到可用路线');
  }

  const path = routePath(route);
  if (!path.length && mode !== 'transit') {
    throw new Error('路线结果里没有可绘制的路径');
  }

  return {
    distance: Number(route.distance ?? 0),
    duration: Number(route.time ?? 0),
    path: path.length ? path : [from, to],
  };
}

function transitSummary(result: any, from: LngLat, to: LngLat): LegPlanResult {
  const plan = result?.plans?.[0];
  if (!plan) {
    throw new Error('没有找到公交方案');
  }

  const path: LngLat[] = [];
  const segments: string[] = [];
  let walkingDistance = 0;

  for (const segment of plan.segments ?? []) {
    if (segment?.walking) {
      let walkPath = pathFromSteps(segment.walking.steps);
      if (!walkPath.length && Array.isArray(segment.walking.path)) {
        walkPath = dedupe(
          segment.walking.path
            .map(coordFrom)
            .filter((point: LngLat | null): point is LngLat => point !== null),
        );
      }
      path.push(...walkPath);

      const distance = Number(segment.walking.distance ?? 0);
      const duration = Number(segment.walking.time ?? 0);
      walkingDistance += distance;
      if (distance > 0) {
        segments.push(
          `步行 ${formatDistance(distance)}${duration > 0 ? ` · ${formatDuration(duration)}` : ''}`,
        );
      }
    }

    // JS API 2.0 的公交结果以 bus.buslines 为主；部分版本/场景给 transit 结构，做一层兼容。
    if (segment?.transit) {
      if (Array.isArray(segment.transit.path)) {
        path.push(
          ...segment.transit.path
            .map(coordFrom)
            .filter((point: LngLat | null): point is LngLat => point !== null),
        );
      }

      const name = segment.transit.name ?? '公共交通';
      const onStation = segment.transit.on_station?.name;
      const offStation = segment.transit.off_station?.name;
      segments.push(
        onStation && offStation
          ? `${name} · ${onStation} → ${offStation}`
          : `${name} → ${offStation ?? '终点'}`,
      );
    }

    if (segment?.bus) {
      for (const line of segment.bus.buslines ?? []) {
        const linePath = Array.isArray(line?.path)
          ? line.path
              .map(coordFrom)
              .filter((point: LngLat | null): point is LngLat => point !== null)
          : [];

        if (linePath.length) {
          path.push(...linePath);
        } else {
          const departure = coordFrom(line?.departure_stop?.location);
          const arrival = coordFrom(line?.arrival_stop?.location);
          if (departure) path.push(departure);
          if (arrival) path.push(arrival);
        }

        const stops = line?.via_num ?? line?.via_stops?.length;
        const lineName = line?.name ?? '公交';
        const arrivalName = line?.arrival_stop?.name ?? '终点';
        segments.push(
          `${lineName}${stops ? ` · ${stops} 站` : ''} → ${arrivalName}`,
        );
      }
    }

    if (segment?.railway) {
      const departure = coordFrom(segment.railway.departure_stop?.location);
      const arrival = coordFrom(segment.railway.arrival_stop?.location);
      if (departure) path.push(departure);
      if (arrival) path.push(arrival);

      const trainName = segment.railway.name ?? '铁路';
      const arrivalName = segment.railway.arrival_stop?.name ?? '终点';
      segments.push(`${trainName} → ${arrivalName}`);
    }

    if (segment?.taxi) {
      const departure = coordFrom(segment.taxi.origin);
      const arrival = coordFrom(segment.taxi.destination);
      if (departure) path.push(departure);
      if (arrival) path.push(arrival);
      segments.push('打车');
    }
  }

  const uniquePath = dedupe(path);
  if (!uniquePath.length) {
    uniquePath.push(from, to);
  }

  if (!segments.length) {
    segments.push('公交方案');
  }

  return {
    distance: Number(plan.distance ?? 0),
    duration: Number(plan.time ?? 0),
    path: uniquePath,
    transit: {
      segments,
      transfers: Number(plan.transfers ?? Math.max(0, segments.length - 1)),
      walkingDistance: walkingDistance || Number(plan.walking_distance ?? 0) || undefined,
    },
  };
}

function plannerOptions(amap: any, policy?: number): Record<string, unknown> {
  return {
    hideMarkers: true,
    ...(policy !== undefined ? { policy } : {}),
  };
}

export async function planLeg(
  amap: any,
  from: LngLat,
  to: LngLat,
  mode: TravelMode,
  city: string,
): Promise<LegPlanResult> {
  if (!amap) throw new Error('地图尚未初始化');

  switch (mode) {
    case 'driving': {
      const planner = new amap.Driving(
        plannerOptions(amap, amap.DrivingPolicy?.LEAST_TIME),
      );
      const result = await searchPlanner(planner, from, to);
      return normalizeRoute(result, mode, from, to);
    }

    case 'walking': {
      const planner = new amap.Walking(plannerOptions(amap));
      const result = await searchPlanner(planner, from, to);
      return normalizeRoute(result, mode, from, to);
    }

    case 'riding': {
      const planner = new amap.Riding(plannerOptions(amap));
      const result = await searchPlanner(planner, from, to);
      return normalizeRoute(result, mode, from, to);
    }

    case 'transit': {
      const planner = new amap.Transfer({
        ...plannerOptions(amap, amap.TransferPolicy?.LEAST_TIME),
        city,
        cityd: city,
      });
      const result = await searchPlanner(planner, from, to);
      return transitSummary(result, from, to);
    }

    default:
      throw new Error('不支持的出行方式');
  }
}
