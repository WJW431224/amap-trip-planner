// 把 dist/ 里的前端产物打成一个 TS 模块，方便 esbuild 一起打包进 Deno Deploy 的入口文件。
import { readFile, writeFile, readdir, stat, mkdir } from 'node:fs/promises';
import path from 'node:path';

const DIST_DIR = path.resolve('dist');
const OUT_FILE = path.resolve('deno/assets.gen.ts');

const MIME = {
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

const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.map']);

async function walk(dir, base = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await walk(full, rel)));
    } else if (entry.isFile()) {
      files.push({ full, rel });
    }
  }
  return files;
}

async function main() {
  const info = await stat(DIST_DIR).catch(() => null);
  if (!info?.isDirectory()) {
    throw new Error('没有找到 dist/，请先运行 npm run build:web');
  }

  const files = await walk(DIST_DIR);
  const entries = [];

  for (const file of files) {
    const ext = path.extname(file.rel).toLowerCase();
    const type = MIME[ext] ?? 'application/octet-stream';
    const key = `/${file.rel.split(path.sep).join('/')}`;
    const buffer = await readFile(file.full);

    if (TEXT_EXT.has(ext)) {
      entries.push([key, { type, body: buffer.toString('utf8') }]);
    } else {
      entries.push([key, { type, body: buffer.toString('base64'), base64: true }]);
    }
  }

  const lines = [
    '// 由 scripts/build-deno-assets.mjs 生成，请勿手动修改。',
    'export interface Asset { type: string; body: string; base64?: boolean }',
    'export const ASSETS: Record<string, Asset> = {',
    ...entries.map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)},`),
    '};',
    '',
  ];

  await mkdir(path.dirname(OUT_FILE), { recursive: true });
  await writeFile(OUT_FILE, lines.join('\n'), 'utf8');
  console.log(`[deno] 打包了 ${entries.length} 个静态文件 → deno/assets.gen.ts`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
