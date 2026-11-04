import { useEffect, useRef, useState } from 'react';
import type { TripAction, TripSnapshot } from '../state/tripReducer';
import { makeId } from '../lib/format';

export type CollabStatus = 'off' | 'connecting' | 'online' | 'error';

export interface CollabMember {
  id: string;
  name: string;
  color: string;
}

interface UseCollabOptions {
  roomId: string | null;
  snapshot: TripSnapshot;
  onHydrate: (snapshot: TripSnapshot) => void;
  onAction: (action: TripAction) => void;
  onError: (message: string) => void;
}

export interface CollabController {
  status: CollabStatus;
  members: CollabMember[];
  revision: number;
  name: string;
  clientId: string;
  sendAction: (action: TripAction) => boolean;
}

function getClientName(): string {
  try {
    const existing = localStorage.getItem('amap-trip:collab-name');
    if (existing?.trim()) return existing.trim().slice(0, 24);

    const name = `游客 ${Math.floor(1000 + Math.random() * 9000)}`;
    localStorage.setItem('amap-trip:collab-name', name);
    return name;
  } catch {
    return `游客 ${Math.floor(1000 + Math.random() * 9000)}`;
  }
}

function getClientId(): string {
  try {
    const existing = sessionStorage.getItem('amap-trip:collab-client');
    if (existing) return existing;

    const id = makeId();
    sessionStorage.setItem('amap-trip:collab-client', id);
    return id;
  } catch {
    return makeId();
  }
}

export function useCollab({
  roomId,
  snapshot,
  onHydrate,
  onAction,
  onError,
}: UseCollabOptions): CollabController {
  const [status, setStatus] = useState<CollabStatus>(roomId ? 'connecting' : 'off');
  const [members, setMembers] = useState<CollabMember[]>([]);
  const [revision, setRevision] = useState(0);
  const [name] = useState(getClientName);
  const [clientId] = useState(getClientId);

  const socketRef = useRef<WebSocket | null>(null);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const hydrateRef = useRef(onHydrate);
  const actionRef = useRef(onAction);
  const errorRef = useRef(onError);
  hydrateRef.current = onHydrate;
  actionRef.current = onAction;
  errorRef.current = onError;

  useEffect(() => {
    if (!roomId) {
      setStatus('off');
      setMembers([]);
      return;
    }

    let disposed = false;
    let reconnectTimer: number | null = null;

    const heartbeatTimer = window.setInterval(() => {
      const current = socketRef.current;
      if (current?.readyState === WebSocket.OPEN) {
        current.send(JSON.stringify({ t: 'ping' }));
      }
    }, 25000);

    const connect = () => {
      if (disposed) return;
      setStatus('connecting');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const current = new WebSocket(`${protocol}//${window.location.host}/ws`);
      socketRef.current = current;
      const isCurrent = () =>
        !disposed && socketRef.current === current;

      current.addEventListener('open', () => {
        if (!isCurrent()) return;
        current.send(
          JSON.stringify({
            t: 'join',
            roomId,
            clientId,
            name,
            state: snapshotRef.current,
          }),
        );
      });

      current.addEventListener('message', (event) => {
        if (!isCurrent()) return;

        let message: any;
        try {
          message = JSON.parse(String(event.data));
        } catch {
          return;
        }

        if (message?.t === 'welcome') {
          setStatus('online');
          setRevision(Number(message.revision) || 0);
          setMembers(Array.isArray(message.members) ? message.members : []);
          hydrateRef.current(message.state as TripSnapshot);
          return;
        }

        if (message?.t === 'act') {
          setRevision(Number(message.revision) || 0);
          if (message.action) actionRef.current(message.action as TripAction);
          return;
        }

        if (message?.t === 'members') {
          setMembers(Array.isArray(message.members) ? message.members : []);
          return;
        }

        if (message?.t === 'error') {
          setStatus('error');
          errorRef.current(message.message || '协作连接出错');
        }
      });

      current.addEventListener('close', () => {
        if (disposed || socketRef.current !== current) return;
        socketRef.current = null;
        setStatus('connecting');
        if (reconnectTimer) window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 1400);
      });

      current.addEventListener('error', () => {
        if (isCurrent()) setStatus('error');
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearInterval(heartbeatTimer);
      const current = socketRef.current;
      socketRef.current = null;
      current?.close();
    };
  }, [roomId, clientId, name]);

  function sendAction(action: TripAction): boolean {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify({ t: 'act', action }));
    return true;
  }

  return { status, members, revision, name, clientId, sendAction };
}
