// End-to-end proof, driven through the LOCALLY installed Chrome
// (puppeteer-core + channel:'chrome' — no browser download).
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4199);
const BASE = `http://127.0.0.1:${PORT}`;

// -- start the shell server ------------------------------------------------
const server = spawn(process.execPath, [join(here, '..', 'shell', 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((ok, ko) => {
  server.stdout.on('data', (d) => { if (String(d).includes('listening')) ok(); });
  server.on('exit', (c) => ko(new Error(`server died: ${c}`)));
  setTimeout(() => ko(new Error('server start timeout')), 5000);
});

const results = [];
const check = (name, cond, detail = '') => {
  results.push({ name, pass: !!cond, detail });
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

let browser;
try {
  browser = await puppeteer.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();

  const requests = [];            // every URL the page fetched
  const responses = new Map();    // url -> content-type
  const consoleErrors = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('response', (r) => responses.set(r.url(), r.headers()['content-type'] ?? ''));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0', timeout: 15000 });
  await page.waitForSelector('#hello-root', { timeout: 15000 });

  // A1 — the plugin view rendered
  const helloText = await page.$eval('#hello-root h2', (el) => el.textContent);
  check('A1 view renders', helloText === 'Hello from plugin', `h2="${helloText}"`);
  const mounted = await page.evaluate(() => window.__PLUGIN_MOUNTED === true && !window.__BOOT_ERROR);
  check('A1b shell reports mount, no boot error', mounted);

  // A2 — React is ONE instance shared shell/plugin
  const singleton = await page.evaluate(() => ({
    identity: window.__REACT_SHELL === window.__REACT_PLUGIN,
    evalCount: window.__REACT_EVAL_COUNT,
    shellVersion: window.__REACT_SHELL?.version,
    pluginVersion: window.__REACT_PLUGIN?.version,
  }));
  check('A2 shell React === plugin React (same module namespace)', singleton.identity,
    `versions ${singleton.shellVersion}/${singleton.pluginVersion}`);
  check('A2b react module body evaluated exactly once', singleton.evalCount === 1,
    `__REACT_EVAL_COUNT=${singleton.evalCount}`);
  const reactFetches = requests.filter((u) => u === `${BASE}/vendor/react.js`).length;
  check('A2c /vendor/react.js fetched exactly once', reactFetches === 1, `${reactFetches} fetch(es)`);

  // A3 — manifest-listed CSS injected by the shell and APPLIED
  const css = await page.evaluate(() => {
    const el = document.getElementById('hello-root');
    const s = getComputedStyle(el);
    return { color: s.color, borderColor: s.borderTopColor, link: !!document.querySelector('link[data-plugin="hello"]') };
  });
  check('A3 plugin CSS applied (color from style.css)',
    css.color === 'rgb(0, 128, 0)' && css.borderColor === 'rgb(255, 0, 128)',
    `color=${css.color} border=${css.borderColor}`);
  check('A3b <link data-plugin="hello"> present in <head>', css.link);

  // A4 — heavy chunk NOT loaded before user action
  const heavyBefore = requests.filter((u) => u.includes('heavy'));
  check('A4 heavy chunk NOT fetched before click', heavyBefore.length === 0,
    `heavy requests before click: ${heavyBefore.length}`);

  // A5 — click -> lazy import fires, sub-chunk + its relative import load
  await page.click('#load-heavy');
  await page.waitForSelector('#heavy-content', { timeout: 15000 });
  const heavyAfter = requests.filter((u) => u.includes('heavy'));
  const gotHeavyJs = heavyAfter.some((u) => u.endsWith('/plugins/hello/heavy.js'));
  const gotHeavyData = heavyAfter.some((u) => u.endsWith('/plugins/hello/heavy-data.js'));
  check('A5 heavy.js fetched only after click', gotHeavyJs, heavyAfter.join(', '));
  check('A5b relative static import heavy-data.js resolved from lazy chunk', gotHeavyData);
  const heavyMeta = await page.$eval('#heavy-meta', (el) => el.textContent);
  check('A5c heavy chunk rendered with its 450 kB payload', /payload: 450\d{3} bytes/.test(heavyMeta), heavyMeta);
  const heavyReact = await page.evaluate(() => window.__HEAVY_REACT === window.__REACT_SHELL);
  check('A5d bare "react" inside lazy sub-chunk -> SAME instance', heavyReact);

  // A6 — hooks worked across the boundary (state actually transitioned)
  const buttonGone = await page.$('#load-heavy') === null;
  check('A6 useState in plugin component re-rendered (button replaced)', buttonGone);

  // A7 — module MIME types were the strict-checking-compatible ones
  const viewCT = responses.get(`${BASE}/plugins/hello/view.js`) ?? '';
  const cssCT = responses.get(`${BASE}/plugins/hello/style.css`) ?? '';
  check('A7 view.js served as text/javascript', viewCT.startsWith('text/javascript'), viewCT);
  check('A7b style.css served as text/css', cssCT.startsWith('text/css'), cssCT);

  // A8 — no console/page errors at all
  check('A8 zero console errors / page errors', consoleErrors.length === 0, consoleErrors.join(' | '));

  const chromeVersion = await browser.version();
  console.log(`\nBrowser: ${chromeVersion}`);
} finally {
  await browser?.close();
  server.kill();
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} assertions passed`);
process.exit(failed.length ? 1 : 0);
