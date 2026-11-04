// 本地冒烟测试：连上 WebSocket，两个客户端进同一房间，验证状态同步。
// 用法：node scripts/ws-check.mjs ws://127.0.0.1:8000/ws
import WebSocket from 'ws';

const url = process.argv[2] ?? 'ws://127.0.0.1:8787/ws';
const roomId = `check-${Date.now().toString(36)}`;

function client(name) {
  const socket = new WebSocket(url);
  const inbox = [];
  const waiters = [];

  socket.on('message', (raw) => {
    const message = JSON.parse(String(raw));
    const index = waiters.findIndex((waiter) => waiter.test(message));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      waiter.resolve(message);
      return;
    }
    inbox.push(message);
  });

  const ready = new Promise((resolve, reject) => {
    socket.on('open', resolve);
    socket.on('error', reject);
  });

  function waitFor(test, timeoutMs = 5000) {
    const existing = inbox.findIndex(test);
    if (existing >= 0) {
      const [message] = inbox.splice(existing, 1);
      return Promise.resolve(message);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${name} 等待超时`)), timeoutMs);
      waiters.push({
        test,
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      });
    });
  }

  return {
    name,
    socket,
    ready,
    waitFor,
    send: (payload) => socket.send(JSON.stringify(payload)),
    close: () => socket.close(),
  };
}

const a = client('A');
const b = client('B');

await a.ready;
a.send({ t: 'join', roomId, clientId: 'client-a', name: '甲' });
const welcomeA = await a.waitFor((m) => m.t === 'welcome');
console.log('A 收到 welcome，成员数', welcomeA.members.length);

await b.ready;
b.send({ t: 'join', roomId, clientId: 'client-b', name: '乙' });
const welcomeB = await b.waitFor((m) => m.t === 'welcome');
console.log('B 收到 welcome，成员数', welcomeB.members.length);

await a.waitFor((m) => m.t === 'members' && m.members.length === 2);
console.log('A 收到成员更新：2 人');

a.send({
  t: 'act',
  action: {
    type: 'ADD_POINT',
    point: {
      id: 'p-test',
      name: '测试点',
      address: '测试地址',
      lng: 116.397,
      lat: 39.908,
      day: 1,
      kind: 'waypoint',
    },
  },
});

const applied = await b.waitFor((m) => m.t === 'act');
console.log('B 收到 A 的操作：', applied.action.type, 'revision', applied.revision);

a.send({ t: 'ping' });
await a.waitFor((m) => m.t === 'pong');
console.log('ping/pong 正常');

a.close();
b.close();
console.log('OK');
