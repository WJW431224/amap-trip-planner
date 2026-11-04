import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import {
  createTripState,
  tripReducer,
  type TripAction,
  type TripSnapshot,
  type TripState,
} from '../src/state/tripReducer';
import { DEFAULT_CITY, MODES, sanitizePoints } from '../src/state/persistence';
import type { TravelMode } from '../src/types';

const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = process.cwd();
const DIST_DIR = path.join(ROOT, 'dist');
const DATA_DIR = path.join(ROOT, 'data');
const ROOMS_FILE = path.join(DATA_DIR, 'rooms.json');

const USER_ACTIONS = new Set<TripAction['type']>([
  'ADD_POINT',
  'UPDATE_POINT',
  'REMOVE_POINT',
  'MOVE_POINT',
  'SET_POINT_DAY',
  'SET_POINT_SLOT',
  'CLEAR_POINTS',
  'SET_MODE',
  'SET_CITY',
]);

const MEMBER_COLORS = ['#ff7a1a', '#1f8a5b', '#2f6db0', '#8b5cb8', '#c04b6b'];

interface Member {
  id: string;
  name: string;
  color: string;
}

interface Room {
  id: string;
  state: TripState;
  members: Map<WebSocket, Member>;
  revision: number;
  updatedAt: number;
}

const rooms = new Map<string, Room>();
let saveTimer: NodeJS.Timeout | null = null;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeRoomId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^[A-Za-z0-9_-]{8,48}$/.test(value) ? value : null;
}

function sanitizeName(value: unknown): string {
  if (typeof value !== 'string') return '游客';
  const name = value.replace(/\s+/g, ' ').trim().slice(0, 24);
  return name || '游客';
}

function colorFor(id: string): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0;
  }
  return MEMBER_COLORS[hash % MEMBER_COLORS.length];
}

function nextColor(room: Room, id: string): string {
  const used = new Set([...room.members.values()].map((item) => item.color));
  return MEMBER_COLORS.find((color) => !used.has(color)) ?? colorFor(id);
}

function snapshotFrom(value: unknown): TripSnapshot {
  const raw = isRecord(value) ? value : {};
  const points = sanitizePoints(raw.points) ?? [];
  const mode: TravelMode = MODES.includes(raw.mode as TravelMode)
    ? (raw.mode as TravelMode)
    : 'driving';
  const city =
    typeof raw.city === 'string' && raw.city.trim()
      ? raw.city.trim().slice(0, 40)
      : DEFAULT_CITY;

  return { points, mode, city };
}

function roomSnapshot(room: Room): TripSnapshot {
  return {
    points: room.state.points,
    mode: room.state.mode,
    city: room.state.city,
  };
}

function memberList(room: Room): Member[] {
  return [...room.members.values()];
}

function send(socket: WebSocket, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcast(room: Room, payload: unknown): void {
  const text = JSON.stringify(payload);
  for (const socket of room.members.keys()) {
    if (socket.readyState === WebSocket.OPEN) socket.send(text);
  }
}

function broadcastMembers(room: Room): void {
  broadcast(room, { t: 'members', members: memberList(room) });
}

function sendError(socket: WebSocket, code: string, message: string): void {
  send(socket, { t: 'error', code, message });
}

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveRooms();
  }, 500);
}

async function saveRooms(): Promise<void> {
  try {
    await mkdir(DATA_DIR, { recursive: true });
    const payload = {
      version: 1,
      savedAt: Date.now(),
      rooms: Object.fromEntries(
        [...rooms.entries()].map(([id, room]) => [
          id,
          {
            state: roomSnapshot(room),
            revision: room.revision,
            updatedAt: room.updatedAt,
          },
        ]),
      ),
    };
    await writeFile(ROOMS_FILE, JSON.stringify(payload), 'utf8');
  } catch (error) {
    console.error('[collab] failed to save rooms', error);
  }
}

async function loadRooms(): Promise<void> {
  try {
    const raw = JSON.parse(await readFile(ROOMS_FILE, 'utf8')) as {
      rooms?: Record<string, { state?: unknown; revision?: number }>;
    };

    for (const [id, value] of Object.entries(raw.rooms ?? {})) {
      const roomId = sanitizeRoomId(id);
      if (!roomId) continue;

      const snapshot = snapshotFrom(value?.state);
      rooms.set(roomId, {
        id: roomId,
        state: createTripState(snapshot),
        members: new Map(),
        revision: Number(value?.revision) || 0,
        updatedAt: Date.now(),
      });
    }
    console.log(`[collab] loaded ${rooms.size} room(s)`);
  } catch {
    // 首次启动没有数据文件是正常情况。
  }
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json; charset=utf-8',
};

async function serveStatic(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }

  // 服务器端统一配置高德 Key：部署时设好环境变量，访客打开网页就能用。
  if (url.pathname === '/api/config') {
    const key = (process.env.AMAP_KEY ?? '').trim();
    const securityCode = (process.env.AMAP_SECURITY_CODE ?? '').trim();
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(JSON.stringify({ key, securityCode }));
    return;
  }

  const requested = decodeURIComponent(url.pathname);
  const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, '');
  let filePath = path.join(DIST_DIR, normalized);

  if (!filePath.startsWith(DIST_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, 'index.html');
    const data = await readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'content-type': MIME[extension] ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'cache-control':
        extension === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(data);
    return;
  } catch {
    // SPA 回退到 index.html。
  }

  try {
    const html = await readFile(path.join(DIST_DIR, 'index.html'));
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-cache',
    });
    res.end(html);
  } catch {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(
      'Collaboration server is running. Start Vite for development, or run npm run build first.\n',
    );
  }
}

const server = createServer((req, res) => {
  void serveStatic(req, res).catch((error) => {
    console.error('[collab] static error', error);
    res.writeHead(500);
    res.end('Internal server error');
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  let room: Room | null = null;
  let member: Member | null = null;

  function leave(): void {
    if (!room || !member) return;
    room.members.delete(socket);
    broadcastMembers(room);
    room = null;
    member = null;
  }

  socket.on('message', (raw) => {
    let message: any;
    try {
      message = JSON.parse(String(raw));
    } catch {
      sendError(socket, 'BAD_MESSAGE', '消息格式不正确');
      return;
    }

    if (message?.t === 'ping') {
      send(socket, { t: 'pong' });
      return;
    }

    if (message?.t === 'join') {
      const roomId = sanitizeRoomId(message.roomId);
      if (!roomId) {
        sendError(socket, 'BAD_ROOM', '房间号不合法');
        return;
      }

      leave();

      let target = rooms.get(roomId);
      if (!target) {
        target = {
          id: roomId,
          state: createTripState(snapshotFrom(message.state)),
          members: new Map(),
          revision: 0,
          updatedAt: Date.now(),
        };
        rooms.set(roomId, target);
        scheduleSave();
      }

      room = target;
      member = {
        id:
          typeof message.clientId === 'string'
            ? message.clientId.slice(0, 64)
            : `client-${Date.now()}`,
        name: sanitizeName(message.name),
        color: nextColor(target, String(message.clientId ?? roomId)),
      };
      target.members.set(socket, member);
      target.updatedAt = Date.now();

      send(socket, {
        t: 'welcome',
        roomId,
        state: roomSnapshot(target),
        members: memberList(target),
        revision: target.revision,
      });
      broadcastMembers(target);
      console.log(
        `[collab] ${member.name} joined ${roomId} (${target.members.size} online)`,
      );
      return;
    }

    if (message?.t === 'act') {
      if (!room || !member) {
        sendError(socket, 'NOT_JOINED', '请先加入房间');
        return;
      }

      const action = message.action as TripAction;
      if (!action || !USER_ACTIONS.has(action.type)) {
        sendError(socket, 'BAD_ACTION', '不支持的操作');
        return;
      }

      try {
        const next = tripReducer(room.state, action);
        const safePoints = sanitizePoints(next.points) ?? [];
        room.state = { ...next, points: safePoints };
        room.revision += 1;
        room.updatedAt = Date.now();
        scheduleSave();

        broadcast(room, {
          t: 'act',
          action,
          revision: room.revision,
          by: member.id,
        });
      } catch (error) {
        console.error('[collab] action failed', error);
        sendError(socket, 'ACTION_FAILED', '操作没有应用成功');
      }
      return;
    }

    sendError(socket, 'UNKNOWN_MESSAGE', '未知消息类型');
  });

  socket.on('close', () => {
    leave();
  });

  socket.on('error', (error) => {
    console.error('[collab] socket error', error);
  });
});

const heartbeat = setInterval(() => {
  for (const socket of wss.clients) {
    if (socket.readyState === WebSocket.OPEN) socket.ping();
  }
}, 30000);

server.on('close', () => {
  clearInterval(heartbeat);
});

process.on('SIGINT', () => {
  void saveRooms().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  void saveRooms().finally(() => process.exit(0));
});

await loadRooms();

server.listen(PORT, HOST, () => {
  console.log(`[collab] listening on http://${HOST}:${PORT}`);
  console.log(`[collab] websocket path ws://${HOST}:${PORT}/ws`);
});
