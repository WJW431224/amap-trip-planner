import type { TripPoint } from '../../types';
import { pointLetter } from '../../lib/format';
import {
  ChevronDown,
  ChevronUp,
  Locate,
  MapPin,
  Trash,
} from '../../components/Icons';

interface PointPanelProps {
  points: TripPoint[];
  activeDay: number;
  days: number[];
  onDayChange: (day: number) => void;
  onAddDay: () => void;
  onPointDayChange: (id: string, day: number) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onLocate: (point: TripPoint) => void;
}

export default function PointPanel({
  points,
  activeDay,
  days,
  onDayChange,
  onAddDay,
  onPointDayChange,
  onMove,
  onRemove,
  onClear,
  onLocate,
}: PointPanelProps) {
  const activePoints = points.filter((point) => point.day === activeDay);

  return (
    <section className="points-block">
      <div className="block-head">
        <div>
          <span className="section-kicker">标点</span>
          <span className="count-badge">{activePoints.length}</span>
        </div>
        {points.length ? (
          <button
            type="button"
            className="text-button danger"
            onClick={() => {
              if (window.confirm('清空所有标点和每日行程？')) onClear();
            }}
          >
            清空
          </button>
        ) : null}
      </div>

      <div className="day-tabs" role="tablist" aria-label="行程天数">
        {days.map((day) => {
          const count = points.filter((point) => point.day === day).length;
          return (
            <button
              key={day}
              type="button"
              role="tab"
              aria-selected={activeDay === day}
              className={`day-tab ${activeDay === day ? 'active' : ''}`}
              onClick={() => onDayChange(day)}
            >
              第 {day} 天
              <span>{count}</span>
            </button>
          );
        })}
        <button type="button" className="day-add" onClick={onAddDay}>
          + 加一天
        </button>
      </div>

      {activePoints.length === 0 ? (
        <div className="points-empty">
          <span className="empty-pin">
            <MapPin size={21} />
          </span>
          <strong>第 {activeDay} 天还没有标点</strong>
          <p>
            搜索地点，或直接点地图空白处。当天第一个点是起点，最后一个是终点；
            不同天会分开规划。
          </p>
        </div>
      ) : (
        <>
          <ol className="point-list">
            {activePoints.map((point, index) => {
              const isFirst = index === 0;
              const isLast = index === activePoints.length - 1;
              const kind = isFirst ? 'start' : isLast ? 'end' : 'mid';
              const label = isFirst
                ? '起点'
                : isLast
                  ? '终点'
                  : `途经 ${index}`;

              return (
                <li className="point-item" key={point.id}>
                  <span className={`point-badge ${kind}`}>
                    {pointLetter(index)}
                  </span>

                  <div className="point-copy">
                    <div className="point-name-row">
                      <strong>{point.name}</strong>
                      <span className={`point-role ${kind}`}>{label}</span>
                    </div>
                    <div className="point-sub-row">
                      <small>
                        {point.address ||
                          `${point.coord.lng.toFixed(5)}, ${point.coord.lat.toFixed(5)}`}
                      </small>
                      <select
                        className="point-day-select"
                        value={point.day}
                        onChange={(event) =>
                          onPointDayChange(point.id, Number(event.target.value))
                        }
                        aria-label={`${point.name} 所属天数`}
                        title="调整所属天数"
                      >
                        {days.map((day) => (
                          <option value={day} key={day}>
                            D{day}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="point-actions">
                    <button
                      type="button"
                      className="icon-button tiny"
                      onClick={() => onLocate(point)}
                      aria-label={`定位到 ${point.name}`}
                      title="定位"
                    >
                      <Locate size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button tiny"
                      onClick={() => onMove(point.id, -1)}
                      disabled={index === 0}
                      aria-label="上移"
                      title="上移"
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button tiny"
                      onClick={() => onMove(point.id, 1)}
                      disabled={index === activePoints.length - 1}
                      aria-label="下移"
                      title="下移"
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="icon-button tiny danger"
                      onClick={() => onRemove(point.id)}
                      aria-label={`删除 ${point.name}`}
                      title="删除"
                    >
                      <Trash size={14} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="panel-hint">
            每天独立成一条路线；拖动地图上的字母图钉可以微调位置。
          </p>
        </>
      )}
    </section>
  );
}
