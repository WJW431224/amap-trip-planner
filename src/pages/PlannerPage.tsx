import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
import type { AmapCredentials } from '../config/credentials';
import { clearStoredCredentials } from '../config/credentials';
import { explainAmapError, type AmapErrorInfo } from '../config/amap';
import { useCollab } from '../collab/useCollab';
import CollabModal from '../components/CollabModal';
import { MapCanvas, type MapCanvasHandle } from '../features/map/MapCanvas';
import SearchBox, { type PlaceResult } from '../features/search/SearchBox';
import PointPanel from '../features/points/PointPanel';
import RoutePanel from '../features/routes/RoutePanel';
import {
  planLeg,
  canUseScenicFallback,
  haversineMeters,
  straightLinePlan,
} from '../features/routes/planner';
import type { LegPlanResult } from '../features/routes/planner';
import { createTripState, tripReducer } from '../state/tripReducer';
import type { TripAction } from '../state/tripReducer';
import { saveTrip } from '../state/persistence';
import { buildShareUrl, clearShareHash, loadInitialTrip } from '../state/share';
import {
  MAX_DAYS,
  MAX_POINTS,
  type Leg,
  type LngLat,
  type TravelMode,
  type TripPoint,
} from '../types';
import { makeId, pointLetter } from '../lib/format';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Refresh,
  RouteMark,
  Settings,
  Share,
  Users,
} from '../components/Icons';

interface PlannerPageProps {
  credentials: AmapCredentials;
}

interface SheetHandleProps {
  collapsed: boolean;
  title: string;
  summary: string;
  onToggle: () => void;
}

function SheetHandle({
  collapsed,
  title,
  summary,
  onToggle,
}: SheetHandleProps) {
  return (
    <button
      type="button"
      className="sheet-handle"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? '展开底部面板' : '收起底部面板'}
    >
      <span className="sheet-grabber" aria-hidden="true" />
      <span className="sheet-handle-row">
        <strong>{title}</strong>
        <small>{summary}</small>
        <span className="sheet-toggle">
          {collapsed ? '展开' : '收起'}
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </span>
      </span>
    </button>
  );
}

interface PanelHandleProps {
  side: 'left' | 'right';
  label: string;
  onCollapse: () => void;
}

function PanelHandle({ side, label, onCollapse }: PanelHandleProps) {
  return (
    <div className={`panel-handle ${side}`}>
      <strong>{label}</strong>
      <button
        type="button"
        className="icon-button tiny"
        onClick={onCollapse}
        aria-label={`收起${label}面板`}
        title="收起面板"
      >
        {side === 'left' ? (
          <ChevronLeft size={15} />
        ) : (
          <ChevronRight size={15} />
        )}
      </button>
    </div>
  );
}

interface LegPair {
  id: string;
  day: number;
  from: { id: string; coord: LngLat };
  to: { id: string; coord: LngLat };
}

const URI_MODE: Record<TravelMode, string> = {
  driving: 'car',
  transit: 'bus',
  walking: 'walk',
  riding: 'ride',
};

function readRoomId(): string | null {
  const value = new URLSearchParams(window.location.search).get('room');
  return value && /^[A-Za-z0-9_-]{8,48}$/.test(value) ? value : null;
}

function makeRoomId(): string {
  return makeId().replace(/-/g, '').slice(0, 16);
}

function resolveAddress(
  amap: any,
  city: string,
  coord: LngLat,
): Promise<{ name?: string; address?: string }> {
  if (!amap) return Promise.resolve({});

  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: { name?: string; address?: string }) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish({}), 6000);

    try {
      const geocoder = new amap.Geocoder({ city, radius: 500 });
      geocoder.getAddress(
        [coord.lng, coord.lat],
        (status: string, result: any) => {
          if (status !== 'complete' || !result?.regeocode) {
            finish({});
            return;
          }

          const address = result.regeocode.formattedAddress ?? '';
          const poiName = result.regeocode.pois?.[0]?.name;
          finish({
            name: poiName || address || undefined,
            address: address || undefined,
          });
        },
      );
    } catch {
      finish({});
    }
  });
}

export default function PlannerPage({ credentials }: PlannerPageProps) {
  const [state, dispatch] = useReducer(
    tripReducer,
    null,
    () => createTripState(loadInitialTrip()),
  );
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<AmapErrorInfo | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<'points' | 'route'>('points');
  const [sheetCollapsed, setSheetCollapsed] = useState(
    () => window.innerWidth <= 900 && state.points.length > 0,
  );
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const [activeDay, setActiveDay] = useState(() =>
    Math.max(1, ...state.points.map((point) => point.day)),
  );
  const [roomId, setRoomId] = useState<string | null>(readRoomId);
  const [collabOpen, setCollabOpen] = useState(false);

  const collab = useCollab({
    roomId,
    snapshot: {
      points: state.points,
      mode: state.mode,
      city: state.city,
    },
    onHydrate: (snapshot) => {
      dispatch({ type: 'HYDRATE', snapshot });
      setActiveDay(Math.max(1, ...snapshot.points.map((point) => point.day)));
    },
    onAction: (action) => dispatch(action),
    onError: (message) => notify(message),
  });

  const mapCanvasRef = useRef<MapCanvasHandle>(null);
  const amapRef = useRef<any>(null);
  const planRunRef = useRef(0);
  const toastTimerRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const activeDayRef = useRef(activeDay);
  activeDayRef.current = activeDay;

  const maxDay = Math.max(
    activeDay,
    1,
    ...state.points.map((point) => point.day),
  );
  const days = Array.from({ length: maxDay }, (_, index) => index + 1);

  useEffect(() => {
    clearShareHash();
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  function notify(message: string) {
    setToast(message);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 2600);
  }

  function applyUserAction(action: TripAction): boolean {
    if (roomId) {
      if (collab.sendAction(action)) return true;
      notify('协作连接中，改动暂未同步，请稍后再试');
      return false;
    }

    dispatch(action);
    return true;
  }

  function createCollabRoom() {
    const id = makeRoomId();
    const url = new URL(window.location.href);
    url.searchParams.set('room', id);
    url.hash = '';
    window.history.replaceState(null, '', url);
    setRoomId(id);
    setCollabOpen(true);
    notify('协作房间已创建，复制邀请链接发给同行的人');
  }

  async function copyInvite() {
    if (!roomId) return;
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      notify('邀请链接已复制');
    } catch {
      window.prompt('复制邀请链接', inviteUrl);
    }
  }

  function leaveCollab() {
    const url = new URL(window.location.href);
    url.searchParams.delete('room');
    window.history.replaceState(null, '', url);
    setRoomId(null);
    setCollabOpen(false);
    notify('已退出协作，当前行程保留在本机');
  }

  function handleReady(amap: any) {
    amapRef.current = amap;
    setMapError(null);
    setMapReady(true);
  }

  function handleMapError(error: AmapErrorInfo) {
    setMapError(error);
    setMapReady(false);
  }

  async function addMapPoint(coord: LngLat) {
    if (stateRef.current.points.length >= MAX_POINTS) {
      notify(`最多只能放 ${MAX_POINTS} 个点`);
      return;
    }

    const id = makeId();
    const day = activeDayRef.current;
    const index = stateRef.current.points.filter(
      (point) => point.day === day,
    ).length;

    const added = applyUserAction({
      type: 'ADD_POINT',
      point: {
        id,
        name: '地图选点',
        coord,
        source: 'map',
        day,
      },
    });
    if (!added) return;

    notify(`第 ${day} 天 · 已添加 ${pointLetter(index)} 点，拖动图钉可微调`);

    const resolved = await resolveAddress(
      amapRef.current,
      stateRef.current.city,
      coord,
    );
    if (!resolved.name && !resolved.address) return;

    applyUserAction({
      type: 'UPDATE_POINT',
      id,
      patch: {
        name: resolved.name || '地图选点',
        address: resolved.address,
      },
    });
  }

  function handleMapClick(coord: LngLat) {
    void addMapPoint(coord);
  }

  async function handlePointMove(id: string, coord: LngLat) {
    const point = stateRef.current.points.find((item) => item.id === id);
    if (!point) return;

    const moved = applyUserAction({
      type: 'UPDATE_POINT',
      id,
      patch: { coord },
    });
    if (!moved) return;

    const shouldRename = point.source === 'map' && !point.address;
    const resolved = await resolveAddress(
      amapRef.current,
      stateRef.current.city,
      coord,
    );

    applyUserAction({
      type: 'UPDATE_POINT',
      id,
      patch: {
        ...(resolved.address ? { address: resolved.address } : {}),
        ...(shouldRename && resolved.name ? { name: resolved.name } : {}),
      },
    });
  }

  function handlePick(place: PlaceResult) {
    if (stateRef.current.points.length >= MAX_POINTS) {
      notify(`最多只能放 ${MAX_POINTS} 个点`);
      return;
    }

    const id = makeId();
    const day = activeDayRef.current;
    const index = stateRef.current.points.filter(
      (point) => point.day === day,
    ).length;

    const point: TripPoint = {
      id,
      name: place.name,
      address: place.address,
      coord: place.coord,
      source: 'search',
      day,
    };

    const added = applyUserAction({ type: 'ADD_POINT', point });
    if (!added) return;
    notify(`第 ${day} 天 · 已添加 ${pointLetter(index)} 点：${place.name}`);
  }

  function handleAddDay() {
    if (maxDay >= MAX_DAYS) {
      notify(`最多支持 ${MAX_DAYS} 天`);
      return;
    }
    setActiveDay(maxDay + 1);
    notify(`已新增第 ${maxDay + 1} 天`);
  }

  function handlePointDayChange(id: string, day: number) {
    if (!applyUserAction({ type: 'SET_POINT_DAY', id, day })) return;
    setActiveDay(day);
  }

  const pointsKey = state.points
    .map(
      (point) =>
        `${point.id}:${point.day}:${point.coord.lng.toFixed(6)},${point.coord.lat.toFixed(6)}`,
    )
    .join('|');

  const routePoints = useMemo(
    () =>
      state.points.map((point) => ({
        id: point.id,
        coord: point.coord,
        day: point.day,
      })),
    // pointsKey 已覆盖 id、天数和坐标变化，名称更新不应触发重新规划。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pointsKey],
  );

  const visiblePoints = useMemo(
    () => state.points.filter((point) => point.day === activeDay),
    [state.points, activeDay],
  );

  const visibleLegs = useMemo(
    () => state.legs.filter((leg) => leg.day === activeDay),
    [state.legs, activeDay],
  );

  useEffect(() => {
    if (!state.legs.length) return;

    const selected = state.legs.find(
      (leg) => leg.id === state.selectedLegId,
    );
    if (selected?.day === activeDay) return;

    const candidate = state.legs.find((leg) => leg.day === activeDay);
    dispatch({ type: 'SELECT_LEG', legId: candidate?.id ?? null });
  }, [state.legs, state.selectedLegId, activeDay]);

  useEffect(() => {
    if (!mapReady || !amapRef.current) return;

    if (routePoints.length < 2) {
      dispatch({ type: 'CLEAR_LEGS' });
      return;
    }

    const byDay = new Map<
      number,
      Array<{ id: string; coord: LngLat; day: number }>
    >();
    for (const point of routePoints) {
      const list = byDay.get(point.day) ?? [];
      list.push(point);
      byDay.set(point.day, list);
    }

    const pairs: LegPair[] = [];
    for (const [day, dayPoints] of [...byDay.entries()].sort(
      (a, b) => a[0] - b[0],
    )) {
      for (let index = 0; index < dayPoints.length - 1; index += 1) {
        const from = dayPoints[index];
        const to = dayPoints[index + 1];
        pairs.push({
          id: `${day}-${from.id}__${to.id}`,
          day,
          from,
          to,
        });
      }
    }

    if (!pairs.length) {
      dispatch({ type: 'CLEAR_LEGS' });
      return;
    }

    const runId = ++planRunRef.current;
    const stubs: Leg[] = pairs.map((pair) => ({
      id: pair.id,
      fromId: pair.from.id,
      toId: pair.to.id,
      day: pair.day,
      mode: state.mode,
      status: 'loading',
      path: [],
    }));

    dispatch({ type: 'PLAN_START', runId, legs: stubs });

    interface Outcome {
      result: LegPlanResult;
      actualMode: TravelMode;
      estimated?: boolean;
      straight?: boolean;
      note?: string;
    }

    async function planPair(pair: LegPair): Promise<Outcome> {
      try {
        const result = await planLeg(
          amapRef.current,
          pair.from.coord,
          pair.to.coord,
          state.mode,
          state.city,
        );

        // 景区内经常出现“能规划但绕一大圈”的驾车结果。直线距离很近、
        // 实际路线却远得离谱时，尝试步行；步行明显更短才替换。
        if (
          (state.mode === 'driving' || state.mode === 'riding') &&
          result.distance > 0
        ) {
          const straightDistance = haversineMeters(
            pair.from.coord,
            pair.to.coord,
          );
          const suspicious =
            straightDistance < 8000 &&
            result.distance > Math.max(straightDistance * 3, straightDistance + 3500);

          if (suspicious) {
            try {
              const walking = await planLeg(
                amapRef.current,
                pair.from.coord,
                pair.to.coord,
                'walking',
                state.city,
              );
              if (
                walking.distance > 0 &&
                walking.distance < result.distance * 0.7
              ) {
                return {
                  result: walking,
                  actualMode: 'walking',
                  estimated: true,
                  note: '驾车路线绕行较远，已改用步行路线',
                };
              }
            } catch {
              // 步行也不可用时保留原本可用的驾车结果。
            }
          }
        }

        return { result, actualMode: state.mode };
      } catch (error) {
        if (state.mode === 'transit' || !canUseScenicFallback(error)) {
          throw error;
        }

        if (state.mode !== 'walking') {
          try {
            const walking = await planLeg(
              amapRef.current,
              pair.from.coord,
              pair.to.coord,
              'walking',
              state.city,
            );
            return {
              result: walking,
              actualMode: 'walking',
              estimated: true,
              note: '景区内道路不可达，已改用步行路线',
            };
          } catch (walkingError) {
            if (!canUseScenicFallback(walkingError)) throw walkingError;
          }
        }

        const straight = straightLinePlan(pair.from.coord, pair.to.coord);
        if (straight.distance > 15000) throw error;

        return {
          result: straight,
          actualMode: 'walking',
          estimated: true,
          straight: true,
          note: '景区内无道路数据，按直线距离估算，非实际步行路线',
        };
      }
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      for (const pair of pairs) {
        if (cancelled) return;

        try {
          const outcome = await planPair(pair);
          if (cancelled) return;
          dispatch({
            type: 'LEG_SUCCESS',
            runId,
            legId: pair.id,
            distance: outcome.result.distance,
            duration: outcome.result.duration,
            path: outcome.result.path,
            transit: outcome.result.transit,
            actualMode: outcome.actualMode,
            estimated: outcome.estimated,
            straight: outcome.straight,
            note: outcome.note,
          });
        } catch (error) {
          if (cancelled) return;
          const info = explainAmapError(error);
          dispatch({
            type: 'LEG_ERROR',
            runId,
            legId: pair.id,
            error: `${info.title}：${info.detail}`,
          });
        }
      }

      if (!cancelled) {
        mapCanvasRef.current?.fitView();
      }
    }, 420);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mapReady, routePoints, state.mode, state.city, retryNonce]);

  useEffect(() => {
    if (!mapReady) return;
    const timer = window.setTimeout(() => {
      mapCanvasRef.current?.fitView();
    }, 120);
    return () => window.clearTimeout(timer);
  }, [
    mapReady,
    mobileTab,
    sheetCollapsed,
    leftCollapsed,
    rightCollapsed,
    activeDay,
  ]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      saveTrip({
        points: state.points,
        mode: state.mode,
        city: state.city,
      });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [state.points, state.mode, state.city]);

  function handleOpenAmap(legId: string) {
    const leg = state.legs.find((item) => item.id === legId);
    if (!leg) return;

    const from = state.points.find((point) => point.id === leg.fromId);
    const to = state.points.find((point) => point.id === leg.toId);
    if (!from || !to) return;

    const fromParam = `${from.coord.lng},${from.coord.lat},${encodeURIComponent(from.name)}`;
    const toParam = `${to.coord.lng},${to.coord.lat},${encodeURIComponent(to.name)}`;
    const url = `https://uri.amap.com/navigation?from=${fromParam}&to=${toParam}&mode=${URI_MODE[leg.actualMode ?? leg.mode]}&policy=1&src=amap-trip-planner&coordinate=gaode&callnative=0`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function handleShare() {
    if (!state.points.length) {
      notify('先标一个点再分享');
      return;
    }

    const url = buildShareUrl({
      points: state.points,
      mode: state.mode,
      city: state.city,
    });

    try {
      await navigator.clipboard.writeText(url);
      notify('分享链接已复制');
    } catch {
      window.prompt('复制这个分享链接', url);
    }
  }

  function handleResetKey() {
    if (credentials.source === 'env') {
      notify('当前 Key 来自 .env.local，请修改文件后重启开发服务器');
      return;
    }
    if (!window.confirm('清除本机保存的 Key 配置，回到配置页？')) return;
    clearStoredCredentials();
    window.location.reload();
  }

  function handleClear() {
    if (!applyUserAction({ type: 'CLEAR_POINTS' })) return;
    setActiveDay(1);
    notify('已清空所有标点和每日行程');
  }

  const collabLabel = !roomId
    ? '协作'
    : collab.status === 'online'
      ? `${collab.members.length} 人在线`
      : collab.status === 'connecting'
        ? '连接中'
        : '协作离线';
  const inviteUrl = roomId
    ? `${window.location.origin}${window.location.pathname}?room=${roomId}`
    : '';

  return (
    <div className="planner-shell">
      <header className="planner-topbar">
        <div className="planner-brand">
          <span className="brand-mark small">
            <RouteMark size={19} />
          </span>
          <div className="planner-brand-copy">
            <strong>行程标点</strong>
            <span>{state.city}</span>
          </div>
        </div>

        <div className="planner-actions">
          <button
            type="button"
            className={`topbar-button collab-button ${collab.status}`}
            onClick={() => setCollabOpen(true)}
            title={roomId ? '打开协作房间' : '创建实时协作房间'}
          >
            <Users size={15} />
            <span>{collabLabel}</span>
            {roomId ? (
              <i className={`collab-dot ${collab.status}`} aria-hidden="true" />
            ) : null}
          </button>
          <button
            type="button"
            className="topbar-button"
            onClick={handleShare}
            aria-label="分享行程快照"
            title="分享行程快照"
          >
            <Share size={15} />
            <span>分享</span>
          </button>
          <button
            type="button"
            className="icon-button"
            onClick={handleResetKey}
            aria-label="重新配置 Key"
            title="重新配置 Key"
          >
            <Settings size={17} />
          </button>
        </div>
      </header>

      <main className="planner-stage">
        <MapCanvas
          ref={mapCanvasRef}
          credentials={credentials}
          points={visiblePoints}
          legs={visibleLegs}
          selectedLegId={state.selectedLegId}
          onReady={handleReady}
          onMapClick={handleMapClick}
          onPointMove={(id, coord) => {
            void handlePointMove(id, coord);
          }}
          onLegSelect={(id) => {
            const leg = state.legs.find((item) => item.id === id);
            if (leg) setActiveDay(leg.day);
            dispatch({ type: 'SELECT_LEG', legId: id });
          }}
          onError={handleMapError}
        />

        <div className="map-day-badge">
          第 {activeDay} 天 · 仅显示当天标点与路线
        </div>

        {!mapReady && !mapError ? (
          <div className="map-loading">
            <span className="spinner" />
            正在加载高德地图…
          </div>
        ) : null}

        <aside
          className={`left-panel ${mobileTab === 'route' ? 'mobile-inactive' : ''} ${
            sheetCollapsed ? 'sheet-collapsed' : ''
          } ${leftCollapsed ? 'is-collapsed' : ''}`}
        >
          <SheetHandle
            collapsed={sheetCollapsed}
            title="标点"
            summary={`${state.points.length} 个点`}
            onToggle={() => setSheetCollapsed((value) => !value)}
          />
          <PanelHandle
            side="left"
            label="搜索与标点"
            onCollapse={() => setLeftCollapsed(true)}
          />
          <SearchBox
            amap={mapReady ? amapRef.current : null}
            city={state.city}
            onCityChange={(city) => {
              applyUserAction({
                type: 'SET_CITY',
                city: city || '杭州市',
              });
            }}
            onPick={handlePick}
          />
          <PointPanel
            points={state.points}
            activeDay={activeDay}
            days={days}
            onDayChange={setActiveDay}
            onAddDay={handleAddDay}
            onPointDayChange={handlePointDayChange}
            onMove={(id, direction) => {
              applyUserAction({ type: 'MOVE_POINT', id, direction });
            }}
            onRemove={(id) => {
              applyUserAction({ type: 'REMOVE_POINT', id });
            }}
            onClear={handleClear}
            onLocate={(point) =>
              mapCanvasRef.current?.focusPoint(point.coord)
            }
          />
        </aside>

        <aside
          className={`right-panel ${mobileTab === 'points' ? 'mobile-inactive' : ''} ${
            sheetCollapsed ? 'sheet-collapsed' : ''
          } ${rightCollapsed ? 'is-collapsed' : ''}`}
        >
          <SheetHandle
            collapsed={sheetCollapsed}
            title="路线"
            summary={`${state.legs.length} 段`}
            onToggle={() => setSheetCollapsed((value) => !value)}
          />
          <PanelHandle
            side="right"
            label="行程路线"
            onCollapse={() => setRightCollapsed(true)}
          />
          <RoutePanel
            points={state.points}
            mode={state.mode}
            legs={state.legs}
            selectedLegId={state.selectedLegId}
            onModeChange={(mode) => {
              applyUserAction({ type: 'SET_MODE', mode });
            }}
            onSelectLeg={(id) => {
              const leg = state.legs.find((item) => item.id === id);
              if (leg) setActiveDay(leg.day);
              dispatch({ type: 'SELECT_LEG', legId: id });
            }}
            onRetry={() => setRetryNonce((value) => value + 1)}
            onOpenAmap={handleOpenAmap}
          />
        </aside>

        {leftCollapsed ? (
          <button
            type="button"
            className="panel-reopen is-left"
            onClick={() => setLeftCollapsed(false)}
            aria-label="展开搜索与标点面板"
          >
            <span className="reopen-dot" aria-hidden="true" />
            标点
            <span className="reopen-count">{state.points.length}</span>
            <ChevronRight size={14} />
          </button>
        ) : null}

        {rightCollapsed ? (
          <button
            type="button"
            className="panel-reopen is-right"
            onClick={() => setRightCollapsed(false)}
            aria-label="展开行程路线面板"
          >
            <ChevronLeft size={14} />
            路线
            <span className="reopen-count">{state.legs.length}</span>
          </button>
        ) : null}

        <div className="mobile-tabs" role="tablist" aria-label="面板切换">
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'points'}
            className={mobileTab === 'points' ? 'active' : ''}
            onClick={() => {
              setMobileTab('points');
              setSheetCollapsed(false);
            }}
          >
            标点
            <span>{state.points.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'route'}
            className={mobileTab === 'route' ? 'active' : ''}
            onClick={() => {
              setMobileTab('route');
              setSheetCollapsed(false);
            }}
          >
            路线
            <span>{state.legs.length}</span>
          </button>
        </div>

        {toast ? (
          <div className="toast" role="status">
            {toast}
          </div>
        ) : null}

        {mapError ? (
          <div className="connection-error-overlay">
            <div className="connection-error-card">
              <p className="panel-eyebrow is-error">
                <span className="live-dot is-error" />
                MAP CONNECTION FAILED
              </p>
              <h2>地图没接上。</h2>
              <p>{mapError.detail}</p>
              <div className="error-box">
                <div className="error-code">
                  <span>错误码</span>
                  <code>{mapError.code}</code>
                </div>
                <details>
                  <summary>查看原始错误</summary>
                  <pre>{mapError.raw}</pre>
                </details>
              </div>
              <div className="connection-actions">
                <button
                  type="button"
                  className="primary-button compact"
                  onClick={() => window.location.reload()}
                >
                  <Refresh />
                  重试
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={handleResetKey}
                >
                  修改 Key
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>

      <CollabModal
        open={collabOpen}
        roomId={roomId}
        inviteUrl={inviteUrl}
        status={collab.status}
        members={collab.members}
        clientId={collab.clientId}
        name={collab.name}
        onClose={() => setCollabOpen(false)}
        onCreate={createCollabRoom}
        onCopy={() => {
          void copyInvite();
        }}
        onLeave={leaveCollab}
      />
    </div>
  );
}
