import { useEffect, useRef, useState } from 'react';
import type { TimeSlot, TripPoint } from '../../types';
import { SLOT_LABELS, TIME_SLOTS } from '../../types';
import { pointLetter, shortName } from '../../lib/format';
import {
  ChevronDown,
  ChevronUp,
  Locate,
  MapPin,
  Pencil,
  Trash,
} from '../../components/Icons';

interface PointPanelProps {
  points: TripPoint[];
  activeDay: number;
  days: number[];
  onDayChange: (day: number) => void;
  onAddDay: () => void;
  onPointDayChange: (id: string, day: number) => void;
  onPointSlotChange: (id: string, slot: TimeSlot) => void;
  onReorderDays: (from: number, to: number) => void;
  onRename: (id: string, name: string) => void;
  city: string;
  onMove: (id: string, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
  onReorderPoint: (id: string, beforeId: string | null) => void;
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
  onPointSlotChange,
  onReorderDays,
  onRename,
  city,
  onMove,
  onRemove,
  onReorderPoint,
  onClear,
  onLocate,
}: PointPanelProps) {
  const activePoints = points.filter((point) => point.day === activeDay);
  const orderIndex = new Map(activePoints.map((point, index) => [point.id, index]));

  // 长按天数标签就能拖动排序（手机、电脑都能用）。
  const [dragDay, setDragDay] = useState<number | null>(null);
  const [overDay, setOverDay] = useState<number | null>(null);
  const pressTimer = useRef<number | null>(null);
  const draggedRef = useRef(false);

  useEffect(() => {
    if (dragDay === null) return;

    const handleMove = (event: PointerEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const target = element?.closest('[data-day]') as HTMLElement | null;
      const value = Number(target?.dataset.day);
      if (Number.isInteger(value) && value > 0) setOverDay(value);
    };

    const handleUp = () => {
      setOverDay((current) => {
        if (current !== null && current !== dragDay) {
          onReorderDays(dragDay, current);
        }
        return null;
      });
      setDragDay(null);
      draggedRef.current = true;
      window.setTimeout(() => {
        draggedRef.current = false;
      }, 0);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragDay, onReorderDays]);

  function startPress(day: number, event: React.PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      setDragDay(day);
      setOverDay(day);
    }, 260);
  }

  function cancelPress() {
    if (pressTimer.current) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  }

  // 点列表同样支持长按拖拽，只在同一天同一时段内排序。
  const [dragPoint, setDragPoint] = useState<string | null>(null);
  const [overPoint, setOverPoint] = useState<string | null>(null);
  const [overTail, setOverTail] = useState(false);
  const pointPressTimer = useRef<number | null>(null);
  const pointDraggedRef = useRef(false);

  useEffect(() => {
    if (dragPoint === null) return;

    const handleMove = (event: PointerEvent) => {
      const element = document.elementFromPoint(event.clientX, event.clientY);
      const target = element?.closest('[data-point-id]') as HTMLElement | null;
      const id = target?.dataset.pointId ?? null;
      setOverPoint(id);
      setOverTail(element?.closest('[data-slot-tail]') !== null);
    };

    const handleUp = () => {
      const dragged = dragPoint;
      const target = overPoint;
      const tail = overTail;
      setDragPoint(null);
      setOverPoint(null);
      setOverTail(false);
      pointDraggedRef.current = true;
      window.setTimeout(() => {
        pointDraggedRef.current = false;
      }, 0);
      if (!dragged) return;
      if (tail) {
        onReorderPoint(dragged, null);
      } else if (target && target !== dragged) {
        onReorderPoint(dragged, target);
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [dragPoint, overPoint, overTail, onReorderPoint]);

  function startPointPress(id: string, event: React.PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const element = event.target as HTMLElement;
    if (element.closest('button, select, input, a')) return;
    if (pointPressTimer.current) window.clearTimeout(pointPressTimer.current);
    pointPressTimer.current = window.setTimeout(() => {
      pointPressTimer.current = null;
      setDragPoint(id);
      setOverPoint(id);
      setOverTail(false);
    }, 260);
  }

  function cancelPointPress() {
    if (pointPressTimer.current) {
      window.clearTimeout(pointPressTimer.current);
      pointPressTimer.current = null;
    }
  }

  // 行内改名：替代原生 prompt，手机上输入体验更好。
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  function startEdit(point: TripPoint) {
    setEditingId(point.id);
    setDraftName(shortName(point.name, city));
  }

  function commitEdit(id: string) {
    const value = draftName.trim();
    if (value) onRename(id, value.slice(0, 24));
    setEditingId(null);
  }

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

      <div
        className={`day-tabs ${dragDay !== null ? 'dragging' : ''}`}
        role="tablist"
        aria-label="行程天数"
      >
        {days.map((day) => {
          const count = points.filter((point) => point.day === day).length;
          const isDragging = dragDay === day;
          const isOver = dragDay !== null && overDay === day && day !== dragDay;
          return (
            <button
              key={day}
              type="button"
              role="tab"
              data-day={day}
              aria-selected={activeDay === day}
              className={`day-tab ${activeDay === day ? 'active' : ''} ${
                isDragging ? 'dragging' : ''
              } ${isOver ? 'drop-target' : ''}`}
              onPointerDown={(event) => startPress(day, event)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onClick={() => {
                if (draggedRef.current) return;
                onDayChange(day);
              }}
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
            搜索地点，或点地图空白处确认后落点。当天第一个点是起点，最后一个是终点；
            不同天会分开规划。
          </p>
        </div>
      ) : (
        <>
          <div className={`slot-scroll ${dragPoint !== null ? 'dragging' : ''}`}>
            {TIME_SLOTS.map((slot) => {
            const slotPoints = activePoints.filter((point) => point.slot === slot);

            return (
              <div className="slot-block" key={slot}>
                <div className="slot-head">
                  <span className={`slot-dot ${slot}`} aria-hidden="true" />
                  <strong>{SLOT_LABELS[slot]}</strong>
                  <span className="slot-count">{slotPoints.length}</span>
                </div>

                {slotPoints.length === 0 ? (
                  <p className="slot-empty">还没有安排</p>
                ) : (
                  <>
                    <ol className="point-list">
                      {slotPoints.map((point) => {
                        const index = orderIndex.get(point.id) ?? 0;
                        const slotIndex = slotPoints.findIndex(
                          (item) => item.id === point.id,
                        );
                        const isFirst = slotIndex === 0;
                        const isLast = slotIndex === slotPoints.length - 1;
                        const kind = isFirst ? 'start' : isLast ? 'end' : 'mid';
                        const label = isFirst
                          ? '起点'
                          : isLast
                            ? '终点'
                            : `途经 ${slotIndex}`;
                        const isDragging = dragPoint === point.id;
                        const isOver =
                          dragPoint !== null &&
                          overPoint === point.id &&
                          point.id !== dragPoint;

                        return (
                          <li
                            className={`point-item ${isDragging ? 'dragging' : ''} ${
                              isOver ? 'drop-target' : ''
                            }`}
                            key={point.id}
                            data-point-id={point.id}
                            onPointerDown={(event) => startPointPress(point.id, event)}
                            onPointerUp={cancelPointPress}
                            onPointerLeave={cancelPointPress}
                          >
                            <span className={`point-badge ${kind}`}>
                              {pointLetter(index)}
                            </span>

                            <div className="point-copy">
                              <div className="point-name-row">
                                {editingId === point.id ? (
                                  <input
                                    className="name-input"
                                    value={draftName}
                                    autoFocus
                                    maxLength={24}
                                    aria-label={`重命名 ${point.name}`}
                                    onChange={(event) => setDraftName(event.target.value)}
                                    onFocus={(event) => event.currentTarget.select()}
                                    onBlur={() => commitEdit(point.id)}
                                    onKeyDown={(event) => {
                                      if (event.key === 'Enter') commitEdit(point.id);
                                      if (event.key === 'Escape') setEditingId(null);
                                    }}
                                  />
                                ) : (
                                  <strong title={point.name}>{shortName(point.name, city)}</strong>
                                )}
                                <button
                                  type="button"
                                  className="name-edit"
                                  onClick={() => startEdit(point)}
                                  aria-label={`重命名 ${point.name}`}
                                  title="改名字"
                                >
                                  <Pencil size={11} />
                                </button>
                                <span className={`point-role ${kind}`}>{label}</span>
                              </div>
                              <div className="point-sub-row">
                                <small>
                                  {point.address ||
                                    `${point.coord.lng.toFixed(5)}, ${point.coord.lat.toFixed(5)}`}
                                </small>
                                <div className="point-selects">
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
                                  <select
                                    className="point-day-select"
                                    value={point.slot}
                                    onChange={(event) =>
                                      onPointSlotChange(point.id, event.target.value as TimeSlot)
                                    }
                                    aria-label={`${point.name} 所属时段`}
                                    title="调整所属时段"
                                  >
                                    {TIME_SLOTS.map((item) => (
                                      <option value={item} key={item}>
                                        {SLOT_LABELS[item]}
                                      </option>
                                    ))}
                                  </select>
                                </div>
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
                                onClick={() => {
                                  if (pointDraggedRef.current) return;
                                  onRemove(point.id);
                                }}
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
                    {dragPoint !== null ? (
                      <div
                        className={`point-drop-tail ${overTail ? 'drop-target' : ''}`}
                        data-slot-tail={slot}
                      >
                        放到{SLOT_LABELS[slot]}末尾
                      </div>
                    ) : null}
                  </>
                )}
              </div>
              );
            })}
          </div>
          <p className="panel-hint">
            上午、下午、晚上各自成一条路线，各自有起点和终点，不会跨时段相连；
            长按天数标签或标点条目可以拖动排序。
            拖动地图上的字母图钉可以微调位置。
          </p>
        </>
      )}
    </section>
  );
}
