// shots.mjs — 按 shots.json 逐个场景截图（只截游戏自己渲染的真实画面）
// 用法：node scripts/shots.mjs [--base http://localhost:8080]
// 输出：screenshots/<name>.png，1280x720。
// 若本地 8080 没起服务，脚本自己起 `node serve.ts`，跑完再关掉。
// 退出码：0 全部截到；1 有失败；2 shots.json 不存在或为空。
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const SHOTS_FILE = new URL('../shots.json', import.meta.url);
const OUT_DIR = new URL('../screenshots/', import.meta.url).pathname;

function loadShots() {
  if (!existsSync(SHOTS_FILE)) return null;
  const raw = JSON.parse(readFileSync(SHOTS_FILE, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.shots ?? [];
  return list.map((s) => {
    if (typeof s === 'string') return { name: s, query: `?shot=${encodeURIComponent(s)}&seed=1` };
    // The starter format is {name, query}: query is the exact URL query (?shot=...&seed=...).
    if (s.query) return { name: s.name ?? s.shot, query: s.query };
    return { name: s.name ?? s.shot, query: `?shot=${encodeURIComponent(s.name ?? s.shot)}&seed=${s.seed ?? 1}` };
  }).filter((s) => s.name && s.query);
}

async function serverUp() {
  try {
    const r = await fetch(BASE + '/', { signal: AbortSignal.timeout(2000) });
    return r.status < 500;
  } catch { return false; }
}

async function startServer() {
  const proc = spawn('node', ['serve.ts'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 400));
    if (await serverUp()) return proc;
  }
  proc.kill();
  throw new Error('serve.ts 启动后 10 秒仍无响应');
}

const shots = loadShots();
if (!shots) {
  console.error('FAIL：shots.json 不存在，游戏场景还没定义，无法截图。');
  process.exit(2);
}
if (!shots.length) {
  console.error('FAIL：shots.json 为空，没有场景可截。');
  process.exit(2);
}

let serverProc = null;
if (!(await serverUp())) {
  console.log('本地服务未起，自己启动 node serve.ts …');
  serverProc = await startServer();
}

mkdirSync(OUT_DIR, { recursive: true });
const browser = await chromium.launch();
let failed = 0;
try {
  for (const { name, query } of shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
    page.on('pageerror', (e) => problems.push(e.message));
    try {
      await page.goto(`${BASE}/${query.startsWith('?') ? query : '?' + query}`, { waitUntil: 'load', timeout: 15000 });
      await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 15000 });
      await page.waitForTimeout(300); // 等一帧渲染落定
      const file = `${OUT_DIR}${name}`;
      const isJpeg = /\.jpe?g$/i.test(name);
      await page.screenshot({ path: file, type: isJpeg ? 'jpeg' : 'png', quality: isJpeg ? 88 : undefined });
      const size = (await import('node:fs')).statSync(file).size;
      console.log(`[OK] ${name} (${query}) -> screenshots/${name}，${Math.round(size / 1024)} KiB${problems.length ? '，注意：有控制台报错：' + problems[0] : ''}`);
    } catch (e) {
      failed++;
      console.log(`[FAIL] ${name} — ${e.message.split('\n')[0]}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
  if (serverProc) serverProc.kill();
}

console.log(failed ? `\n完成：${shots.length - failed}/${shots.length} 张成功，${failed} 张失败。` : `\n完成：${shots.length}/${shots.length} 张截图全部存到 screenshots/。`);
process.exit(failed ? 1 : 0);
