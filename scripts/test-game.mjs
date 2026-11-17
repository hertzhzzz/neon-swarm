// test-game.mjs — neon-swarm 游戏浏览器测试（只读测试，不改游戏代码）
// 用法：node scripts/test-game.mjs [--base http://localhost:8080]
// 若本地 8080 没起服务，脚本自己起 `node serve.ts`，跑完再关掉。
// 检查：控制台报错 / 失败请求 / 未捕获异常；shots.json 每个场景渲染；
// 真实游玩 15 秒（画面是否在动、有无报错）。
// 退出码：0 全部通过；1 有 FAIL；2 游戏/shots.json 还没建好（SKIP）。
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:8080';
const SHOTS_FILE = new URL('../shots.json', import.meta.url);
const results = []; // {name, status: PASS|FAIL|SKIP, detail}

function report(name, status, detail = '') {
  results.push({ name, status, detail });
  console.log(`[${status}] ${name}${detail ? ' — ' + detail : ''}`);
}

function loadShots() {
  if (!existsSync(SHOTS_FILE)) return null;
  const raw = JSON.parse(readFileSync(SHOTS_FILE, 'utf8'));
  const list = Array.isArray(raw) ? raw : raw.shots ?? [];
  return list.map((s) => {
    if (typeof s === 'string') return { name: s, query: `?shot=${encodeURIComponent(s)}&seed=1` };
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

// 采集一页的报错：控制台 error、未捕获异常、失败请求
function attachCollectors(page) {
  const problems = [];
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('uncaught: ' + e.message));
  page.on('requestfailed', (r) => problems.push('request failed: ' + r.url() + ' ' + (r.failure()?.errorText ?? '')));
  page.on('response', (r) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()}: ${r.url()}`); });
  return problems;
}

async function canvasLooksRendered(page) {
  const info = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return { canvas: false };
    // 2D canvas：直接读像素，数不同颜色（纯色/空白只有 1 种颜色）
    const ctx2d = c.getContext('2d');
    if (ctx2d) {
      try {
        const step = 16;
        const data = ctx2d.getImageData(0, 0, c.width, c.height).data;
        const colors = new Set();
        for (let i = 0; i < data.length && colors.size < 8; i += 4 * step) {
          colors.add(`${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`);
        }
        return { canvas: true, w: c.width, h: c.height, colors: colors.size };
      } catch { return { canvas: true, w: c.width, h: c.height, colors: -1 }; }
    }
    return { canvas: true, w: c.width, h: c.height, colors: -2 }; // WebGL：读不到 2D 像素
  });
  if (!info.canvas) return { ok: false, detail: '页面没有 canvas' };
  if (!info.w || !info.h) return { ok: false, detail: 'canvas 宽高为 0' };
  if (info.colors >= 3) return { ok: true, detail: `canvas ${info.w}x${info.h}，像素采样到 ${info.colors}+ 种颜色` };
  if (info.colors === -2) {
    // WebGL canvas：退回截图大小判断（WebGL 画面很少是纯色大块）
    const shot = await page.screenshot({ type: 'png' });
    if (shot.length < 10000) return { ok: false, detail: `WebGL 画面截图只有 ${shot.length} 字节，可能是一片空白` };
    return { ok: true, detail: `canvas ${info.w}x${info.h}（WebGL），截图 ${Math.round(shot.length / 1024)} KiB` };
  }
  return { ok: false, detail: `canvas 像素只有 ${info.colors} 种颜色，可能是一片空白` };
}

const shots = loadShots();
const gameExists = existsSync(new URL('../game/index.html', import.meta.url));
if (!gameExists) {
  report('游戏文件 game/index.html', 'SKIP', '文件不存在，游戏还没建好');
  console.log('\n结论：测试工具已就绪，游戏未建好，等游戏建好再跑。');
  process.exit(2);
}

let serverProc = null;
if (!(await serverUp())) {
  console.log('本地服务未起，自己启动 node serve.ts …');
  serverProc = await startServer();
}

const browser = await chromium.launch();
try {
  // 1. 首页加载
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const problems = attachCollectors(page);
    const resp = await page.goto(BASE + '/', { waitUntil: 'load', timeout: 15000 });
    await page.waitForTimeout(2000);
    if (!resp || resp.status() !== 200) {
      report('首页加载', 'FAIL', `HTTP ${resp?.status() ?? '无响应'}`);
    } else if (problems.length) {
      report('首页加载', 'FAIL', problems.slice(0, 3).join(' | '));
    } else {
      report('首页加载', 'PASS', 'HTTP 200，无控制台报错、无失败请求、无未捕获异常');
    }
    await page.close();
  }

  // 2. 每个 shot 场景
  if (!shots) {
    report('shot 场景', 'SKIP', 'shots.json 不存在，游戏场景还没定义');
  } else if (!shots.length) {
    report('shot 场景', 'SKIP', 'shots.json 为空');
  } else {
    for (const { name, query } of shots) {
      const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
      const problems = attachCollectors(page);
      try {
        await page.goto(`${BASE}/${query.startsWith('?') ? query : '?' + query}`, { waitUntil: 'load', timeout: 15000 });
        await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 15000 });
        const render = await canvasLooksRendered(page);
        if (problems.length) report(`场景 ${name}`, 'FAIL', problems.slice(0, 3).join(' | '));
        else if (!render.ok) report(`场景 ${name}`, 'FAIL', render.detail);
        else report(`场景 ${name}`, 'PASS', `__shotReady=true，${render.detail}`);
      } catch (e) {
        report(`场景 ${name}`, 'FAIL', e.message.split('\n')[0]);
      }
      await page.close();
    }
  }

  // 3. 真实游玩 15 秒
  {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const problems = attachCollectors(page);
    try {
      await page.goto(BASE + '/', { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(1500);
      // 开始游戏：依次试 Enter、Space、点画面中央（只取第一个有效的）
      await page.keyboard.press('Enter');
      await page.waitForTimeout(500);
      await page.keyboard.press('Space');
      await page.waitForTimeout(500);
      await page.mouse.click(640, 360);
      const before = await page.screenshot({ type: 'png' });
      const textBefore = await page.evaluate(() => document.body.innerText);
      await page.keyboard.down('ArrowLeft');
      await page.waitForTimeout(3000);
      await page.keyboard.up('ArrowLeft');
      await page.keyboard.down('ArrowRight');
      await page.waitForTimeout(3000);
      await page.keyboard.up('ArrowRight');
      await page.keyboard.press('Space');
      await page.waitForTimeout(9000);
      const after = await page.screenshot({ type: 'png' });
      const textAfter = await page.evaluate(() => document.body.innerText);
      const moved = !before.equals(after);
      const textChanged = textBefore !== textAfter;
      if (problems.length) {
        report('真实游玩 15 秒', 'FAIL', problems.slice(0, 3).join(' | '));
      } else if (!moved && !textChanged) {
        report('真实游玩 15 秒', 'FAIL', '15 秒内画面和文字都没有变化，游戏可能没跑起来');
      } else {
        report('真实游玩 15 秒', 'PASS', `无报错，画面变化：${moved ? '是' : '否'}，文字变化：${textChanged ? '是' : '否'}`);
      }
    } catch (e) {
      report('真实游玩 15 秒', 'FAIL', e.message.split('\n')[0]);
    }
    await page.close();
  }
} finally {
  await browser.close();
  if (serverProc) serverProc.kill();
}

const fails = results.filter((r) => r.status === 'FAIL').length;
const skips = results.filter((r) => r.status === 'SKIP').length;
console.log(`\n合计：${results.length} 项，通过 ${results.length - fails - skips}，失败 ${fails}，跳过 ${skips}。`);
process.exit(fails ? 1 : 0);
