// Deno Deploy 版协作服务：静态站点 + WebSocket 房间 + 服务端下发的 Key 配置。
// 用 esbuild 打包成单文件后由 deployctl 上传，运行环境只需要 Deno 内置 API。
import {
  createTripState,
  tripReducer,
  type TripAction,
  type TripSnapshot,
  type TripState,
} from '../src/state/tripReducer';
import { DEFAULT_CITY, MODES, sanitizePoints } from '../src/state/persistence';
import type { TravelMode } from '../src/types';
import { ASSETS, type Asset } from './assets.gen';

declare const Deno: {
  serve: (
    options: { port: number },
    handler: (request: Request) => Response | Promise<Response>,
  ) => unknown;
  upgradeWebSocket: (request: Request) => { socket: ServerSocket; response: Response };
  openKv: () => Promise<unknown>;
  env: { get: (key: string) => string | undefined };
  stdout: { writeSync: (data: Uint8Array) => number };
};

interface ServerSocket {
  readyState: number;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: string, listener: (event: any) => void) => void;
}

const WS_OPEN = 1;

const USER_ACTIONS = new Set<TripAction['type']>([
  'ADD_POINT',
  'UPDATE_POINT',
  'REMOVE_POINT',
  'MOVE_POINT',
  'SET_POINT_DAY',
  'SET_POINT_SLOT',
  'REORDER_DAYS',
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
  members: Map<ServerSocket, Member>;
  revision: number;
  updatedAt: number;
}

interface StoredRoom {
  state: TripSnapshot;
  revision: number;
  updatedAt: number;
}

const rooms = new Map<string, Room>();
const saveTimers = new Map<string, number>();

interface KvLike {
  get: (key: unknown[]) => Promise<{ value: unknown } | null>;
  set: (key: unknown[], value: unknown) => Promise<unknown>;
}

let kv: KvLike | null = null;
let kvReady: Promise<void> | null = null;

function log(message: string): void {
  try {
    Deno.stdout.writeSync(new TextEncoder().encode(`[collab] ${message}\n`));
  } catch {
    // 某些运行环境没有 stdout，忽略即可。
  }
}

async function ensureKv(): Promise<void> {
  if (kvReady) return kvReady;
  kvReady = (async () => {
    try {
      kv = (await Deno.openKv()) as KvLike;
    } catch {
      kv = null;
    }
  })();
  return kvReady;
}

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
  return { points: room.state.points, mode: room.state.mode, city: room.state.city };
}

function memberList(room: Room): Member[] {
  return [...room.members.values()];
}

function send(socket: ServerSocket, payload: unknown): void {
  if (socket.readyState === WS_OPEN) socket.send(JSON.stringify(payload));
}

function broadcast(room: Room, payload: unknown): void {
  const text = JSON.stringify(payload);
  for (const socket of room.members.keys()) {
    if (socket.readyState === WS_OPEN) socket.send(text);
  }
}

function broadcastMembers(room: Room): void {
  broadcast(room, { t: 'members', members: memberList(room) });
}

function sendError(socket: ServerSocket, code: string, message: string): void {
  send(socket, { t: 'error', code, message });
}

function scheduleSave(room: Room): void {
  const existing = saveTimers.get(room.id);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    saveTimers.delete(room.id);
    void saveRoom(room);
  }, 500);
  saveTimers.set(room.id, timer as unknown as number);
}

async function saveRoom(room: Room): Promise<void> {
  if (!kv) return;
  try {
    const stored: StoredRoom = {
      state: roomSnapshot(room),
      revision: room.revision,
      updatedAt: room.updatedAt,
    };
    await kv.set(['room', room.id], stored);
  } catch (error) {
    console.error('[collab] save failed', error);
  }
}

async function loadRoom(roomId: string): Promise<Room | null> {
  if (!kv) return null;
  try {
    const entry = await kv.get(['room', roomId]);
    if (!entry?.value) return null;
    const stored = entry.value as Partial<StoredRoom>;
    return {
      id: roomId,
      state: createTripState(snapshotFrom(stored.state)),
      members: new Map(),
      revision: Number(stored.revision) || 0,
      updatedAt: Date.now(),
    };
  } catch (error) {
    console.error('[collab] load failed', error);
    return null;
  }
}

function decodeAsset(asset: Asset): Uint8Array | string {
  if (!asset.base64) return asset.body;
  const binary = atob(asset.body);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function serveAsset(pathname: string): Response | null {
  const asset = ASSETS[pathname];
  if (!asset) return null;
  const body = decodeAsset(asset);
  return new Response(body, {
    headers: {
      'content-type': asset.type,
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'cache-control': pathname.endsWith('.html')
        ? 'no-cache'
        : 'public, max-age=31536000, immutable',
    },
  });
}

function handleWebSocket(request: Request): Response {
  const { socket, response } = Deno.upgradeWebSocket(request);
  let room: Room | null = null;
  let member: Member | null = null;

  function leave(): void {
    if (!room || !member) return;
    room.members.delete(socket);
    broadcastMembers(room);
    room = null;
    member = null;
  }

  socket.addEventListener('message', (event: { data: unknown }) => {
    void handleMessage(String(event.data));
  });

  socket.addEventListener('close', () => leave());

  socket.addEventListener('error', () => leave());

  async function handleMessage(raw: string): Promise<void> {
    let message: any;
    try {
      message = JSON.parse(raw);
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
      await ensureKv();

      let target = rooms.get(roomId) ?? null;
      if (!target) target = await loadRoom(roomId);
      if (!target) {
        target = {
          id: roomId,
          state: createTripState(snapshotFrom(message.state)),
          members: new Map(),
          revision: 0,
          updatedAt: Date.now(),
        };
      }
      rooms.set(roomId, target);

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
      scheduleSave(target);
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
        scheduleSave(room);

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
  }

  return response;
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === '/ws') {
    return handleWebSocket(request);
  }

  if (url.pathname === '/health') {
    return new Response(JSON.stringify({ ok: true, rooms: rooms.size }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  if (url.pathname === '/api/config') {
    const key = (Deno.env.get('AMAP_KEY') ?? '').trim();
    const securityCode = (Deno.env.get('AMAP_SECURITY_CODE') ?? '').trim();
    return new Response(JSON.stringify({ key, securityCode }), {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const asset = serveAsset(pathname);
  if (asset) return asset;

  // SPA 回退：其余路径都返回首页。
  const fallback = serveAsset('/index.html');
  if (fallback) return fallback;

  return new Response('Not found', { status: 404 });
}

log('starting');
Deno.serve(
  { port: Number(Deno.env.get('PORT') ?? '') || 8000 },
  handle,
);
