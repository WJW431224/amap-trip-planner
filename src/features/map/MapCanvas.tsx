import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { AmapCredentials } from '../../config/credentials';
import { explainAmapError, loadAmap } from '../../config/amap';
import type { AmapErrorInfo } from '../../config/amap';
import type { Leg, LngLat, TripPoint } from '../../types';
import { pointLetter, dayColor } from '../../lib/format';

export interface MapCanvasHandle {
  fitView: () => void;
  focusPoint: (coord: LngLat) => void;
}

interface MapCanvasProps {
  credentials: AmapCredentials;
  points: TripPoint[];
  legs: Leg[];
  selectedLegId: string | null;
  onReady: (amap: any, map: any) => void;
  onMapClick: (coord: LngLat) => void;
  onPointMove: (id: string, coord: LngLat) => void;
  onLegSelect: (id: string) => void;
  onError: (error: AmapErrorInfo) => void;
}

interface MapHandlers {
  onReady: MapCanvasProps['onReady'];
  onMapClick: MapCanvasProps['onMapClick'];
  onPointMove: MapCanvasProps['onPointMove'];
  onLegSelect: MapCanvasProps['onLegSelect'];
  onError: MapCanvasProps['onError'];
}

export const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(
  function MapCanvas(
    {
      credentials,
      points,
      legs,
      selectedLegId,
      onReady,
      onMapClick,
      onPointMove,
      onLegSelect,
      onError,
    },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const mapRef = useRef<any>(null);
    const amapRef = useRef<any>(null);
    const markersRef = useRef<any[]>([]);
    const polylinesRef = useRef<any[]>([]);
    const suppressClickRef = useRef(0);
    const [ready, setReady] = useState(false);

    const handlersRef = useRef<MapHandlers>({
      onReady,
      onMapClick,
      onPointMove,
      onLegSelect,
      onError,
    });
    handlersRef.current = { onReady, onMapClick, onPointMove, onLegSelect, onError };

    useEffect(() => {
      let disposed = false;
      let map: any = null;

      async function boot() {
        try {
          const AMap = await loadAmap(credentials);
          if (disposed || !containerRef.current) return;

          amapRef.current = AMap;
          map = new AMap.Map(containerRef.current, {
            zoom: 12.2,
            center: [120.1551, 30.2741],
            viewMode: '2D',
            resizeEnable: true,
            mapStyle: 'amap://styles/normal',
          });
          mapRef.current = map;

          map.addControl(new AMap.Scale());

          map.on('click', (event: any) => {
            if (Date.now() < suppressClickRef.current) return;
            const lng = Number(event?.lnglat?.getLng?.());
            const lat = Number(event?.lnglat?.getLat?.());
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
            handlersRef.current.onMapClick({ lng, lat });
          });

          handlersRef.current.onReady(AMap, map);
          if (!disposed) setReady(true);
        } catch (error) {
          if (!disposed) handlersRef.current.onError(explainAmapError(error));
        }
      }

      void boot();

      return () => {
        disposed = true;
        markersRef.current = [];
        polylinesRef.current = [];
        map?.destroy?.();
        mapRef.current = null;
        amapRef.current = null;
        setReady(false);
      };
    }, [credentials]);

    useEffect(() => {
      const map = mapRef.current;
      const AMap = amapRef.current;
      if (!ready || !map || !AMap) return;

      if (markersRef.current.length) {
        map.remove(markersRef.current);
        markersRef.current = [];
      }

      const multiDay = new Set(points.map((point) => point.day)).size > 1;
      const overlapGroups: TripPoint[][] = [];
      for (const point of points) {
        const group = overlapGroups.find((items) =>
          items.some(
            (item) =>
              Math.abs(item.coord.lng - point.coord.lng) < 0.00002 &&
              Math.abs(item.coord.lat - point.coord.lat) < 0.00002,
          ),
        );
        if (group) group.push(point);
        else overlapGroups.push([point]);
      }

      const spreadByPoint = new Map<string, { x: number; y: number }>();
      for (const group of overlapGroups) {
        if (group.length < 2) continue;
        group.forEach((point, index) => {
          const angle = (Math.PI * 2 * index) / group.length - Math.PI / 2;
          const radius = group.length === 2 ? 13 : 17;
          spreadByPoint.set(point.id, {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius,
          });
        });
      }

      const markers = points.map((point) => {
        const dayPoints = points.filter((item) => item.day === point.day);
        const dayIndex = dayPoints.findIndex((item) => item.id === point.id);
        const kind =
          dayIndex === 0
            ? 'start'
            : dayIndex === dayPoints.length - 1
              ? 'end'
              : 'mid';
        const spread = spreadByPoint.get(point.id) ?? { x: 0, y: 0 };
        const pinLabel = multiDay
          ? `${point.day}${pointLetter(Math.max(0, dayIndex))}`
          : pointLetter(Math.max(0, dayIndex));
        const pinStyle =
          kind === 'mid' ? ` style="background:${dayColor(point.day)}"` : '';
        const marker = new AMap.Marker({
          position: [point.coord.lng, point.coord.lat],
          content: `<div class="map-pin map-pin--${kind}"${pinStyle}><span>${pinLabel}</span></div>`,
          offset: new AMap.Pixel(-17 + spread.x, -42 + spread.y),
          draggable: true,
          cursor: 'grab',
          title: `第 ${point.day} 天 · ${point.name}`,
          zIndex: 100 + Math.max(0, dayIndex),
          extData: { id: point.id },
        });

        marker.on('mousedown', () => {
          suppressClickRef.current = Date.now() + 800;
        });
        marker.on('touchstart', () => {
          suppressClickRef.current = Date.now() + 800;
        });
        marker.on('click', () => {
          suppressClickRef.current = Date.now() + 500;
        });
        marker.on('dragstart', () => {
          suppressClickRef.current = Date.now() + 800;
        });
        marker.on('dragend', () => {
          suppressClickRef.current = Date.now() + 400;
          const position = marker.getPosition();
          const lng = Number(position?.getLng?.());
          const lat = Number(position?.getLat?.());
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            handlersRef.current.onPointMove(point.id, { lng, lat });
          }
        });

        return marker;
      });

      if (markers.length) map.add(markers);
      markersRef.current = markers;
    }, [ready, points]);

    useEffect(() => {
      const map = mapRef.current;
      const AMap = amapRef.current;
      if (!ready || !map || !AMap) return;

      if (polylinesRef.current.length) {
        map.remove(polylinesRef.current);
        polylinesRef.current = [];
      }

      const created: any[] = [];
      for (const leg of legs) {
        if (leg.status !== 'success' || leg.path.length < 2) continue;

        const selected = leg.id === selectedLegId;
        const straight = Boolean(leg.straight);
        const path = leg.path.map((point) => [point.lng, point.lat]);

        if (!straight) {
          const casing = new AMap.Polyline({
            path,
            strokeColor: '#fffdf8',
            strokeWeight: selected ? 11 : 9,
            strokeOpacity: 0.9,
            lineJoin: 'round',
            lineCap: 'round',
            zIndex: selected ? 58 : 48,
          });
          created.push(casing);
        }

        const line = new AMap.Polyline({
          path,
          strokeColor: straight
            ? selected
              ? '#d97706'
              : '#e0a45a'
            : dayColor(leg.day),
          strokeWeight: straight ? (selected ? 4.5 : 3.5) : selected ? 6.5 : 4.5,
          strokeOpacity: selected ? 1 : 0.55,
          strokeStyle: straight ? 'dashed' : 'solid',
          strokeDasharray: straight ? [8, 7] : undefined,
          lineJoin: 'round',
          lineCap: 'round',
          showDir: !straight,
          zIndex: selected ? 60 : 50,
        });

        line.on('mousedown', () => {
          suppressClickRef.current = Date.now() + 500;
        });
        line.on('touchstart', () => {
          suppressClickRef.current = Date.now() + 500;
        });
        line.on('click', () => {
          suppressClickRef.current = Date.now() + 500;
          handlersRef.current.onLegSelect(leg.id);
        });

        created.push(line);
      }

      if (created.length) map.add(created);
      polylinesRef.current = created;
    }, [ready, legs, selectedLegId]);

    function fitView() {
      const map = mapRef.current;
      if (!map) return;

      const overlays = [...markersRef.current, ...polylinesRef.current];
      if (!overlays.length) return;

      if (markersRef.current.length === 1 && !polylinesRef.current.length) {
        const point = points[0];
        if (point) map.setZoomAndCenter(15, [point.coord.lng, point.coord.lat]);
        return;
      }

      const width = window.innerWidth;
      let leftInset = 50;
      let rightInset = 50;
      let bottomInset = 100;

      if (width > 900) {
        const leftPanel = document.querySelector<HTMLElement>(
          '.left-panel:not(.is-collapsed)',
        );
        const rightPanel = document.querySelector<HTMLElement>(
          '.right-panel:not(.is-collapsed)',
        );
        leftInset = leftPanel
          ? Math.round(leftPanel.getBoundingClientRect().width) + 32
          : 40;
        rightInset = rightPanel
          ? Math.round(rightPanel.getBoundingClientRect().width) + 32
          : 40;
      } else {
        const visiblePanel = document.querySelector<HTMLElement>(
          '.left-panel:not(.mobile-inactive), .right-panel:not(.mobile-inactive)',
        );
        bottomInset = visiblePanel
          ? Math.round(visiblePanel.getBoundingClientRect().height) + 20
          : 330;
      }

      const avoid: [number, number, number, number] = [
        90,
        rightInset,
        bottomInset,
        leftInset,
      ];
      map.setFitView(overlays, false, avoid, 16);
    }

    function focusPoint(coord: LngLat) {
      mapRef.current?.setZoomAndCenter(15, [coord.lng, coord.lat], false, 420);
    }

    useImperativeHandle(ref, () => ({ fitView, focusPoint }));

    const pointsKey = points
      .map(
        (point) =>
          `${point.id}:${point.coord.lng.toFixed(6)},${point.coord.lat.toFixed(6)}`,
      )
      .join('|');

    useEffect(() => {
      if (!ready) return;
      const timer = window.setTimeout(fitView, 120);
      return () => window.clearTimeout(timer);
      // fitView 只依赖 ref，不随函数身份变化。
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ready, pointsKey]);

    return <div className="map-root" ref={containerRef} aria-label="地图工作区" />;
  },
);
