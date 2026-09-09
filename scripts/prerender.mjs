/**
 * Freeze the built vinext worker output into a fully static GitHub Pages site.
 *
 * Why: vinext (1.0.0-beta.5 ~ beta.9) supports either `basePath` or
 * `output: 'export'`, but not both at once (with a basePath the build-time
 * prerenderer requests basePath-less URLs and the RSC handler answers 404, so
 * `output: 'export'` fails the build). At runtime the worker handles basePath
 * fine, so instead of prerendering at build time we boot the built worker with
 * `wrangler dev`, fetch the SSR HTML for the routes, and write it into the
 * static asset directory. The result hydrates client-side exactly like a
 * prerendered page.
 *
 * 用法：npm run prerender（在 npm run build 之后）
 */
import { spawn } from 'node:child_process';
import { copyFile, cp, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const port = Number(process.env.PRERENDER_PORT ?? 8797);
const basePath = '/project-3d-anim-pixel';
const outDir = path.join(root, 'dist', 'client', basePath.replace(/^\//, ''));
const wranglerBin = path.join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

// public/ 里被页面引用的目录与文件（vinext 把它们拷到 dist/client/ 顶层、
// 不带 basePath，必须复制进 outDir 才能随 Pages artifact 上传）。
const PUBLIC_DIRS = ['presets'];
const PUBLIC_FILES = ['favicon.svg', 'reference.jpg'];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startWrangler() {
  const child = spawn(
    process.execPath,
    [
      wranglerBin,
      'dev',
      '--config',
      path.join('dist', 'server', 'wrangler.json'),
      '--port',
      String(port),
      '--ip',
      '127.0.0.1',
    ],
    {
      cwd: root,
      env: { ...process.env, CI: 'true', WRANGLER_SEND_METRICS: 'false' },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  child.stdout.on('data', (chunk) => process.stdout.write(`[wrangler] ${chunk}`));
  child.stderr.on('data', (chunk) => process.stderr.write(`[wrangler] ${chunk}`));
  return child;
}

function killWrangler(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === 'win32') {
    // workerd runs outside the direct child tree on Windows; kill the tree.
    spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    child.kill('SIGTERM');
  }
}

async function waitForServer(timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${basePath}/`, { method: 'GET' });
      if (res.status < 600) return;
    } catch {
      // server not accepting connections yet
    }
    await sleep(500);
  }
  throw new Error(`prerender: wrangler dev did not become ready on port ${port}`);
}

async function capture(urlPathname) {
  const res = await fetch(`http://127.0.0.1:${port}${basePath}${urlPathname}`);
  const html = await res.text();
  if (!html.includes(`${basePath}/_next/`)) {
    throw new Error(`prerender: ${urlPathname} does not look like an app HTML response`);
  }
  return { status: res.status, html };
}

const wrangler = startWrangler();
try {
  await waitForServer();
  await sleep(1_000); // let the worker warm up

  await mkdir(outDir, { recursive: true });

  const index = await capture('/');
  if (index.status !== 200) throw new Error(`prerender: / returned ${index.status}`);
  await writeFile(path.join(outDir, 'index.html'), index.html, 'utf-8');
  console.log(`prerender: wrote index.html (${index.html.length} bytes)`);

  const notFound = await capture('/__vinext_missing__');
  if (notFound.status !== 404) {
    console.warn(`prerender: expected 404 for missing route, got ${notFound.status}; skipping 404.html`);
  } else {
    await writeFile(path.join(outDir, '404.html'), notFound.html, 'utf-8');
    console.log(`prerender: wrote 404.html (${notFound.html.length} bytes)`);
  }

  // Copy public files so the Pages artifact is self-contained. vinext copies
  // `public/` to `dist/client/` (basePath-less on disk); the artifact root is
  // `dist/client/<repo>/`, which GitHub Pages maps to
  // https://iizzaya.github.io/<repo>/.
  for (const entry of PUBLIC_DIRS) {
    const src = path.join(root, 'dist', 'client', entry);
    if (existsSync(src)) {
      await cp(src, path.join(outDir, entry), { recursive: true });
      console.log(`prerender: copied ${entry}/`);
    }
  }
  for (const file of PUBLIC_FILES) {
    const src = path.join(root, 'dist', 'client', file);
    if (existsSync(src)) {
      await copyFile(src, path.join(outDir, file));
      console.log(`prerender: copied ${file}`);
    }
  }

  console.log('prerender: done');
} finally {
  killWrangler(wrangler);
  await sleep(2_000); // give workerd a moment to shut down before the script exits
}
