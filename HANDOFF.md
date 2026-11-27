# 交接说明 · 行程标点（高德地图标点 + 行程规划）

> 给接手这个项目的 AI / 开发者。看完这一份就够接手了，细节都在代码里。

## 1. 这是什么

一个纯前端的高德地图行程规划网页：在地图上标点 → 按「天 + 上午/下午/晚上」自动规划路线 → 生成一条可分享的固定网址。
用户是中国境内使用者，朋友也会用手机打开看，所以**国内可访问性**是硬约束。

- 线上地址：https://wjw431224.github.io/amap-trip-planner/
- 仓库：https://github.com/WJW431224/amap-trip-planner （**公开**）
- 本地目录：`C:\Users\13270\Downloads\地图软件`（路径含中文，无空格）

## 2. 技术栈

- Vite 8 + React 19 + TypeScript，**没有后端**（生产环境是 GitHub Pages 静态托管）
- 高德 JS API 2.0，通过 `@amap/amap-jsapi-loader` 加载
- 状态管理：`useReducer` + 纯函数 reducer（`src/state/tripReducer.ts`），可单测
- 本地持久化：`localStorage`
- 部署：GitHub Actions 构建 → GitHub Pages

## 3. 目录结构（关键文件）

```
src/
  App.tsx                    读 Key + 读仓库里的 trip.json，再渲染主页面
  pages/PlannerPage.tsx      主页面：地图、面板、规划调度、分享/同步、拖拽排序（最核心也最长）
  features/map/MapCanvas.tsx 高德地图：图钉、拖动、折线、fitView
  features/points/PointPanel.tsx  左侧标点列表：天数标签、时段分组、改名、排序
  features/routes/RoutePanel.tsx  右侧路线面板：按天 → 按时段分组显示
  features/routes/planner.ts      调高德路径规划，含景区/无道路时的降级
  state/tripReducer.ts       所有数据变更的唯一入口（重要）
  state/persistence.ts       localStorage 读写 + 数据清洗
  state/share.ts             行程 ↔ URL 参数（?trip=…）编解码
  state/cloud.ts             读写 GitHub 仓库里的 public/trip.json
  components/SyncDialog.tsx  设置弹窗（GitHub 同步 + 重置 Key）
  components/ShareDialog.tsx 分享链接弹窗
server/collab-server.ts      WebSocket 多人协作服务（Node，本地开发用，线上未启用）
deno/                       Deno Deploy 版服务端（已写，但 Deno 国内打不开，未部署）
public/trip.json            当前对外展示的行程（网站首页默认读它）
```

## 4. 数据模型（改功能前必读）

```ts
type TimeSlot = 'am' | 'pm' | 'night';            // 上午/下午/晚上

interface TripPoint {
  id: string;
  name: string;            // 完整名字，界面上用 shortName() 缩写显示
  coord: { lng: number; lat: number };
  address?: string;
  source: 'search' | 'map';
  day: number;             // 1..14
  slot: TimeSlot;
}

interface Leg {            // 一段路线
  id: string; fromId: string; toId: string;
  day: number; slot: TimeSlot;
  mode: TravelMode;        // driving | transit | walking | riding
  actualMode?: TravelMode; status: 'loading' | 'success' | 'error';
  distance?: number; duration?: number; path: LngLat[];
  transit?; estimated?; straight?; note?; error?;
}
```

规则：
- 点数组的顺序 = 天 → 时段 → 组内顺序，`ADD_POINT` / `SET_POINT_DAY` / `SET_POINT_SLOT` / `REORDER_DAYS` 都靠 `insertIndexFor()` 维持这个不变量。
- **路线只连同一「天 + 时段」里的相邻点**，上午/下午/晚上各自有起点终点，不跨时段连接。
- 所有变更走 `tripReducer`，不要在外面直接改 state。

## 5. 关键行为

| 行为 | 位置 | 说明 |
|---|---|---|
| 简称显示 | `lib/format.ts` `shortName(name, city, limit=9)` | 去行政前缀 → 超长则保留**末尾**几个字；不改原始数据，悬停看全称 |
| 手动改名 | `PointPanel` 名字旁的铅笔 ✎ | `window.prompt` → `UPDATE_POINT` |
| 拖动排序天数 | `PointPanel` 长按 260ms 再拖 | pointer events，触屏和鼠标都支持；`REORDER_DAYS` 重排 day 编号 |
| 分享链接 | `state/share.ts` | `?trip=<base64url(JSON)>`，格式 `{v:1,p:[{n,a,x,y,s,d,t}],m,c}`；旧的 `#trip=` 仍兼容 |
| 地址栏自动同步 | `PlannerPage` 内的 effect | 有标点时把行程写进 `?trip=`，复制地址即可分享 |
| 仓库行程 | `state/cloud.ts` + `public/trip.json` | 首页若本机无数据、URL 无参数，就读 `./trip.json` |
| 写回仓库 | 设置弹窗 ⚙ | 用户填 fine-grained GitHub Token（Contents 读写），浏览器直连 GitHub API PUT contents |

数据优先级：`?trip=` 参数 > localStorage > `public/trip.json` > 空。

## 6. 构建 / 部署 / 验证

```bash
npm install
npm run dev            # 本地开发：Vite(5173) + 协作服务(8787)
npm run typecheck      # tsc --noEmit
npm run test           # vitest
npm run build:static   # 生成 GitHub Pages 用的静态产物（VITE_STATIC=1，base './'）
```

- 推送到 `main` 会触发 `.github/workflows/deploy-pages.yml` 自动构建部署（约 1 分钟）。
- 高德 Key / 安全密钥存在仓库 **Settings → Secrets and variables → Actions** 的变量里（`AMAP_KEY`、`AMAP_SECURITY_CODE`），工作流注入 `VITE_AMAP_KEY` 打进前端包。**Key 会出现在公开 JS 里，属正常**，靠高德控制台的域名白名单限制。
- 本地想跑地图：在 `.env.local` 写 `VITE_AMAP_KEY=…` / `VITE_AMAP_SECURITY_CODE=…`（已 gitignore）。
- 无头验证（改完 UI 建议这样自查）：
  ```bash
  npx vite preview --port 4188 --strictPort &
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new \
    --disable-gpu --hide-scrollbars --virtual-time-budget=14000 \
    --window-size=1280,800 --user-data-dir=C:/temp/e1 \
    --screenshot=C:/temp/shot.png http://127.0.0.1:4188/
  ```
  用 `?trip=` 造样例数据最快。

## 7. 环境约束（很重要，别再踩一遍）

1. **国内网络**：实测 `deno.dev`、`vercel.app`、`netlify.app`、`*.pages.dev`、`*.workers.dev`、`huggingface.co` 全部打不开；`github.io`、`onrender.com` 可以。所以选 GitHub Pages。
2. **Render 走不通**：需要 Visa/MasterCard 验证，用户的银联卡被拒。
3. **GitHub 推送**：22 端口会超时，`~/.ssh/config` 已配 `Host github.com → ssh.github.com:443`；推送偶发失败，重试几次即可。
4. **高德 Key 有域名白名单**，换域名要回控制台加。
5. 项目路径含中文，个别工具链要注意编码。

## 8. 现状与已知问题

- 已上线：多点标点、按天/时段规划、四种出行方式、景区降级、简称、改名、拖拽排序、分享链接、仓库行程同步。
- **多人实时协作未上线**：`server/collab-server.ts`（WebSocket 房间）和 `deno/server.ts` 都写好了，但静态托管没有后端，`VITE_STATIC=1` 时协作入口被隐藏（见 `src/config/build.ts` 的 `IS_STATIC_BUILD`）。要有真协作，需要一台能跑 Node 且国内可访问的服务器。
- `public/trip.json` 是**手动/令牌**推送的快照，和用户本机 localStorage 是两份，可能不同步；用户改完要点「保存到仓库」。
  用户已经在用这条路：仓库里会出现形如 `同步行程 2026/11/27 22:57:29` 的提交，每次都会触发一次 Pages 重新构建。
  当前线上行程：32 个点、第 1–5 天、步行。
- GitHub Token 存在用户浏览器 localStorage 里（明文），需提示定期更换。
- 名字缩写是启发式，遇到切得难看的情况，靠用户点铅笔改名兜底。
- `MAX_POINTS = 60`、`MAX_DAYS = 14`，改大要考虑高德配额和 URL 长度（分享链接会很长）。

## 9. 想接着做的话，优先级建议

1. 协作真正上线（需要国内可访问的后端；同一份 state 已在 `tripReducer` 里，服务端可复用）
2. `trip.json` 与本地数据自动合并 / 自动同步，减少「保存到仓库」的手动步骤
3. 分享链接压缩（现在 20+ 点时 URL 会很长，可考虑 deflate + base64url）
4. 移动端细节（底部抽屉、地图手势与拖拽排序互不干扰）
5. 导出（ICS 日历 / 图片长图）

## 10. 给接手者的一句话

改任何数据相关逻辑，先看 `src/state/tripReducer.ts` 和它旁边的三个测试文件；改 UI 后跑 `npm run typecheck && npm run test`，再推 `main` 等 1 分钟看线上。
