import type { Leg, TravelMode, TripPoint } from '../../types';
import { MODE_LABELS } from '../../types';
import {
  formatDistance,
  formatDuration,
  pointLetter,
  dayColor,
  shortName,
} from '../../lib/format';
import {
  ArrowUpRight,
  Bike,
  Bus,
  Car,
  Clock,
  Refresh,
  Walk,
} from '../../components/Icons';

interface RoutePanelProps {
  points: TripPoint[];
  mode: TravelMode;
  legs: Leg[];
  selectedLegId: string | null;
  onModeChange: (mode: TravelMode) => void;
  onSelectLeg: (id: string) => void;
  onRetry: () => void;
  onOpenAmap: (legId: string) => void;
}

const MODES: Array<{
  key: TravelMode;
  label: string;
  Icon: typeof Car;
}> = [
  { key: 'driving', label: '驾车', Icon: Car },
  { key: 'transit', label: '公交', Icon: Bus },
  { key: 'walking', label: '步行', Icon: Walk },
  { key: 'riding', label: '骑行', Icon: Bike },
];

export default function RoutePanel({
  points,
  mode,
  legs,
  selectedLegId,
  onModeChange,
  onSelectLeg,
  onRetry,
  onOpenAmap,
}: RoutePanelProps) {
  const selectedLeg =
    legs.find((leg) => leg.id === selectedLegId) ?? legs[0] ?? null;
  const successLegs = legs.filter((leg) => leg.status === 'success');
  const totalDistance = successLegs.reduce(
    (sum, leg) => sum + (leg.distance ?? 0),
    0,
  );
  const totalDuration = successLegs.reduce(
    (sum, leg) => sum + (leg.duration ?? 0),
    0,
  );
  const planning = legs.some((leg) => leg.status === 'loading');
  const hasError = legs.some((leg) => leg.status === 'error');
  const hasSuccess = successLegs.length > 0;
  const estimatedCount = successLegs.filter((leg) => leg.estimated).length;
  const straightCount = successLegs.filter((leg) => leg.straight).length;

  const dayNumbers = Array.from(
    new Set([...points.map((point) => point.day), ...legs.map((leg) => leg.day)]),
  ).sort((a, b) => a - b);

  function pointAt(id: string) {
    return points.find((point) => point.id === id);
  }

  function legLabel(leg: Leg) {
    const dayPoints = points.filter((point) => point.day === leg.day);
    const fromIndex = dayPoints.findIndex((point) => point.id === leg.fromId);
    const toIndex = dayPoints.findIndex((point) => point.id === leg.toId);
    return {
      from: pointLetter(Math.max(0, fromIndex)),
      to: pointLetter(Math.max(0, toIndex)),
      fromName: shortName(pointAt(leg.fromId)?.name ?? '起点'),
      toName: shortName(pointAt(leg.toId)?.name ?? '终点'),
    };
  }

  return (
    <section className="route-panel-body">
      <div className="block-head route-head">
        <div>
          <span className="section-kicker">路线</span>
          {legs.length ? (
            <span className="count-badge">{legs.length} 段</span>
          ) : null}
        </div>
        {hasError ? (
          <button type="button" className="text-button" onClick={onRetry}>
            <Refresh size={13} />
            重试
          </button>
        ) : null}
      </div>

      <div className="mode-tabs" role="tablist" aria-label="出行方式">
        {MODES.map(({ key, label, Icon }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={mode === key}
            className={`mode-tab ${mode === key ? 'active' : ''}`}
            onClick={() => onModeChange(key)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {points.length < 2 ? (
        <div className="route-empty">
          <span className="route-empty-mark">
            <RouteDoodle />
          </span>
          <strong>
            {points.length === 0 ? '先标一个起点' : '再标一个点，路线就出来了'}
          </strong>
          <p>
            {points.length === 0
              ? '搜索地点或点地图落点，至少两个点才能规划。'
              : '同一天至少两个点才会串成路线；不同天会分开规划。'}
          </p>
        </div>
      ) : (
        <>
          <div className="route-hero">
            <div className="route-hero-top">
              <span>
                总行程 · {dayNumbers.length} 天 · {points.length} 个点
              </span>
              {planning ? <span className="planning-label">计算中</span> : null}
            </div>
            <div className="route-hero-total">
              {planning && !hasSuccess
                ? '规划中…'
                : hasSuccess
                  ? formatDistance(totalDistance)
                  : '—'}
            </div>
            <div className="route-hero-meta">
              <Clock size={14} />
              {planning && !hasSuccess
                ? '正在逐段计算'
                : hasSuccess
                  ? `约 ${formatDuration(totalDuration)}`
                  : hasError
                    ? '没有算出路线，点右上角重试'
                    : '暂无路线'}
              <span className="dot-sep">·</span>
              {legs.length} 段
            </div>
          </div>

          {estimatedCount ? (
            <p className="route-estimate-note">
              有 {estimatedCount} 段为估算路线
              {straightCount
                ? `，其中 ${straightCount} 段为无道路数据的直线虚线`
                : '（已改用步行补全）'}
              ，详情见各段说明。
            </p>
          ) : null}

          {!legs.length && points.length >= 2 ? (
            <p className="route-day-hint">
              每天至少两个点才能串成路线。当前天数之间不会互相连接。
            </p>
          ) : null}

          <div className="day-groups">
            {dayNumbers.map((day) => {
              const dayPoints = points.filter((point) => point.day === day);
              const dayLegs = legs.filter((leg) => leg.day === day);
              const daySuccess = dayLegs.filter(
                (leg) => leg.status === 'success',
              );
              const dayDistance = daySuccess.reduce(
                (sum, leg) => sum + (leg.distance ?? 0),
                0,
              );
              const dayDuration = daySuccess.reduce(
                (sum, leg) => sum + (leg.duration ?? 0),
                0,
              );

              return (
                <section className="day-group" key={day}>
                  <div className="day-group-head">
                    <span className="day-group-title">
                      <i
                        className="day-dot"
                        style={{ background: dayColor(day) }}
                        aria-hidden="true"
                      />
                      <strong>第 {day} 天</strong>
                    </span>
                    <span>
                      {dayPoints.length} 个点 · {dayLegs.length} 段
                      {daySuccess.length
                        ? ` · ${formatDistance(dayDistance)} · ${formatDuration(dayDuration)}`
                        : ''}
                    </span>
                  </div>

                  {dayLegs.length === 0 ? (
                    <p className="day-group-empty">
                      当天只有一个点，再标一个就能规划。
                    </p>
                  ) : (
                    <ol className="leg-list">
                      {dayLegs.map((leg) => {
                        const { from, to, fromName, toName } = legLabel(leg);
                        const active = leg.id === selectedLeg?.id;
                        const actualMode = leg.actualMode ?? leg.mode;

                        return (
                          <li key={leg.id}>
                            <button
                              type="button"
                              className={`leg-item ${active ? 'active' : ''} ${leg.status}`}
                              onClick={() => onSelectLeg(leg.id)}
                            >
                              <span className="leg-index">
                                {from}
                                <span>→</span>
                                {to}
                              </span>
                              <span className="leg-main">
                                <strong>
                                  {fromName} → {toName}
                                </strong>
                                <small>
                                  {leg.status === 'loading'
                                    ? '正在规划…'
                                    : leg.status === 'error'
                                      ? leg.error || '这段没规划出来'
                                      : `${MODE_LABELS[actualMode]} · ${formatDistance(leg.distance)}${
                                          leg.estimated ? ' · 估算' : ''
                                        }`}
                                </small>
                              </span>
                              <span className="leg-metric">
                                {leg.status === 'success'
                                  ? formatDuration(leg.duration)
                                  : leg.status === 'loading'
                                    ? '···'
                                    : '!'}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ol>
                  )}
                </section>
              );
            })}
          </div>

          {selectedLeg ? (
            <div className={`leg-detail ${selectedLeg.status}`}>
              <div className="leg-detail-head">
                <span>
                  {MODE_LABELS[selectedLeg.actualMode ?? selectedLeg.mode]} ·{' '}
                  {legLabel(selectedLeg).from} → {legLabel(selectedLeg).to}
                  {selectedLeg.estimated ? (
                    <span className="estimate-tag">
                      {selectedLeg.straight ? '直线估算' : '估算'}
                    </span>
                  ) : null}
                </span>
                {selectedLeg.status === 'success' ? (
                  <button
                    type="button"
                    className="text-button accent"
                    onClick={() => onOpenAmap(selectedLeg.id)}
                  >
                    在高德打开
                    <ArrowUpRight size={13} />
                  </button>
                ) : null}
              </div>

              {selectedLeg.status === 'loading' ? (
                <div className="detail-state">
                  <span className="mini-spinner" />
                  正在计算这一段…
                </div>
              ) : null}

              {selectedLeg.status === 'error' ? (
                <div className="detail-state error">
                  <p>{selectedLeg.error || '这段路线没规划出来。'}</p>
                  <button type="button" className="text-button" onClick={onRetry}>
                    <Refresh size={13} />
                    重新规划
                  </button>
                </div>
              ) : null}

              {selectedLeg.status === 'success' ? (
                <>
                  <div className="detail-metrics">
                    <div>
                      <span>距离</span>
                      <strong>{formatDistance(selectedLeg.distance)}</strong>
                    </div>
                    <div>
                      <span>耗时</span>
                      <strong>{formatDuration(selectedLeg.duration)}</strong>
                    </div>
                    {selectedLeg.transit ? (
                      <div>
                        <span>换乘</span>
                        <strong>
                          {selectedLeg.transit.transfers
                            ? `${selectedLeg.transit.transfers} 次`
                            : '直达'}
                        </strong>
                      </div>
                    ) : null}
                  </div>

                  {selectedLeg.note ? (
                    <p className="leg-note">{selectedLeg.note}</p>
                  ) : null}

                  {selectedLeg.transit ? (
                    <ul className="transit-list">
                      {selectedLeg.transit.segments.map((segment, index) => (
                        <li key={`${segment}-${index}`}>
                          <span className="transit-step">{index + 1}</span>
                          <span>{segment}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function RouteDoodle() {
  return (
    <svg
      width="54"
      height="40"
      viewBox="0 0 54 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M6 32c9 0 8-19 18-19s7 16 16 16 8-13 8-13" strokeDasharray="3 5" />
      <circle cx="6" cy="32" r="3" fill="currentColor" stroke="none" />
      <circle cx="48" cy="16" r="3" fill="currentColor" stroke="none" />
    </svg>
  );
}
