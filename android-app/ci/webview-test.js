// Drives the BoardFusion app's WebView over Chrome DevTools (debug APK only).
// Usage: node webview-test.js <phase>   phases: offline | online-recover | game
const { execSync } = require('child_process');
const fs = require('fs');
const phase = process.argv[2] || 'game';
const OUT = process.env.OUT || 'shots';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(`[${phase}]`, ...a);
let failures = 0;
const check = (ok, what) => { log(ok ? 'PASS' : 'FAIL', what); if (!ok) failures++; };
const shot = name => { try { execSync(`adb exec-out screencap -p > ${OUT}/${name}.png`); log('screenshot', name); } catch (e) { log('screenshot failed', name); } };

async function pages() {
  const pid = execSync('adb shell pidof com.boardfusion.app').toString().trim();
  execSync(`adb forward tcp:9222 localabstract:webview_devtools_remote_${pid}`);
  const res = await fetch('http://127.0.0.1:9222/json');
  return (await res.json()).filter(p => p.type === 'page');
}
async function connect() {
  for (let i = 0; i < 40; i++) {
    try { const p = await pages(); if (p.length) return open(p[0].webSocketDebuggerUrl); } catch (_) {}
    await sleep(1000);
  }
  throw new Error('no debuggable WebView page');
}
function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url); let id = 0; const wait = {}; const errors = [];
    ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && wait[m.id]) { wait[m.id](m); delete wait[m.id]; }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); };
    ws.onerror = reject;
    ws.onopen = async () => {
      const send = (method, params = {}) => new Promise(r => { const n = ++id; wait[n] = r; ws.send(JSON.stringify({ id: n, method, params })); });
      const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); return r.result?.result?.value; };
      await send('Runtime.enable');
      resolve({ ev, send, errors, close: () => ws.close() });
    };
  });
}
async function until(cdp, expr, ms, label) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    let v; try { v = await cdp.ev(expr); } catch (_) {}
    if (v) { log(`${label} after ${((Date.now() - t0) / 1000).toFixed(1)}s`); return true; }
    await sleep(1000);
  }
  log(`${label}: timed out after ${ms / 1000}s`); return false;
}
const visible = sel => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return false;const r=e.getBoundingClientRect();const s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none'})()`;
const click = sel => `(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'missing';e.click();return 'clicked'})()`;

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let cdp = await connect();
  if (phase === 'offline') {
    await sleep(6000);
    const st = await cdp.ev('window.BF_LAUNCHER && BF_LAUNCHER.state()');
    log('launcher state:', st, 'url:', await cdp.ev('location.href'));
    check(st === 'offline' || st === 'unreachable', 'offline launch shows the offline screen');
    shot('01-offline');
  } else if (phase === 'online-recover') {
    const ok = await until(cdp, "location.hostname==='boardfusion.onrender.com'&&document.readyState==='complete'", 150000, 'game page opened by itself after network returned');
    check(ok, 'launcher recovers automatically when back online');
    // Keep test runs out of the owner's usage stats (same switch as stats.html "Don't count this device").
    if (ok) await cdp.ev("localStorage.setItem('bf_no_track','1')");
    await sleep(2000); shot('02-recovered');
  } else {
    const t0 = Date.now();
    const probe = await cdp.ev('window.BF_LAUNCHER && BF_LAUNCHER.probe');
    log('launcher probe method:', probe);
    cdp.close();
    let loaded = false;
    for (let i = 0; i < 150 && !loaded; i++) {
      try { cdp = await connect(); loaded = await cdp.ev("location.hostname==='boardfusion.onrender.com'&&document.readyState==='complete'"); if (!loaded) cdp.close(); } catch (_) {}
      if (!loaded) await sleep(1000);
    }
    check(loaded, `live game loaded in app (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
    if (!loaded) { shot('03-not-loaded'); process.exit(1); }
    await sleep(2500);
    log('url:', await cdp.ev('location.href'), '| title:', await cdp.ev('document.title'));
    check(/BoardFusionApp/.test(await cdp.ev('navigator.userAgent')), 'app user agent tag present');
    check(!!(await cdp.ev('window.NET && window.BFCloud')), 'game scripts loaded (NET, BFCloud)');
    check(!!(await cdp.ev('window.BFAnalytics || document.querySelector("script[src*=analytics]")')), 'analytics script present');
    const box = await cdp.ev('(()=>{const b=document.body.getBoundingClientRect();return [innerWidth,innerHeight,Math.round(b.width)]})()');
    log('viewport', JSON.stringify(box));
    shot('03-home');
    // Real taps (trusted pointer events, hit-tested) so overlays block them like they would a finger.
    const tap = async (sel, label) => {
      const pt = await cdp.ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();if(!r.width)return null;const x=r.left+r.width/2,y=r.top+r.height/2;const hit=document.elementFromPoint(x,y);return {x,y,onTop:!!hit&&(hit===e||e.contains(hit))}})()`);
      if (!pt) { log(`tap ${label}: not visible`); return false; }
      await sleep(300);
      for (const type of ['mousePressed', 'mouseReleased']) await cdp.send('Input.dispatchMouseEvent', { type, x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
      log(`tap ${label} at ${Math.round(pt.x)},${Math.round(pt.y)} (on top: ${pt.onTop})`); return pt.onTop;
    };
    check(await tap('#startbtn', 'Start game'), 'Start game button reachable by touch');
    await sleep(2500); shot('04-local-game');
    if (await cdp.ev(visible('.pass-card button'))) { await tap('.pass-card button', 'Ready to roll'); await sleep(1500); }
    const before = await cdp.ev('(document.querySelector("#statusbar")||{}).innerText');
    check(await tap('#dicebtn', 'Dice'), 'dice button reachable by touch');
    await sleep(4500);
    const after = await cdp.ev('(document.querySelector("#statusbar")||{}).innerText');
    log('status before roll:', JSON.stringify(before), '| after:', JSON.stringify(after));
    check(before !== after, 'rolling changes the game status');
    shot('05-after-roll');
    // Turn passed to the next player: hand the phone over again.
    if (await cdp.ev(visible('.pass-card button'))) { await tap('.pass-card button', 'Ready to roll (next player)'); await sleep(1500); }
    // Marble Loop tab, then Android back returns to Dice Race.
    if (await tap('#tab-jackaroo', 'Marble Loop tab')) {
      await sleep(4000);
      log('after Marble tab:', await cdp.ev('location.pathname'));
      shot('06-marble');
      execSync('adb shell input keyevent KEYCODE_BACK'); await sleep(4000);
      const path = await cdp.ev('location.pathname');
      check(path === '/' || path === '/index.html', `Android back from Marble Loop returns to Dice Race (${path})`);
    }
    // Online matchmaking from a fresh page (the way the landing page's Play online link opens it).
    await cdp.ev("location.replace('https://boardfusion.onrender.com/?utm_source=android_app&fresh=' + Date.now() + '#online')");
    await sleep(3000);
    await until(cdp, "/fresh=/.test(location.search)&&document.readyState==='complete'&&!!document.querySelector('#online')", 90000, 'online page reloaded');
    await sleep(1500);
    if (!(await cdp.ev(visible('#findmatch')))) await tap('#onlinebtn', 'Online button');
    await sleep(1000);
    if (await tap('#pname_in', 'name box')) {
      await cdp.ev('document.querySelector("#pname_in").select()');
      await cdp.send('Input.insertText', { text: 'CI Tester' });
    }
    shot('07-online-dialog');
    check(await tap('#findmatch', 'Find online player'), 'Find online player reachable by touch');
    const queued = await until(cdp, `(()=>{const q=document.querySelector('#queueview');if(!q)return false;const r=q.getBoundingClientRect();if(!r.width)return false;const h=document.elementFromPoint(r.left+r.width/2,r.top+Math.min(r.height/2,20));return !!h&&q.contains(h)&&/Looking for an online player/.test(document.body.innerText)})()`, 60000, 'matchmaking queue visible');
    check(queued, 'online matchmaking shows "Looking for an online player" on screen');
    const err = await cdp.ev('(document.querySelector("#onlineerr")||{}).innerText||""');
    check(!/not connected/i.test(err), `no "Not connected" error (onlineerr="${err}")`);
    shot('08-online-queue');
    await tap('#cancelmatch', 'Cancel'); await sleep(1500);
    log('after cancel:', JSON.stringify(await cdp.ev('(document.querySelector("#onlineerr")||{}).innerText||document.querySelector("#queuenote")?.innerText||""')));
    shot('08b-online-cancelled');
    check(cdp.errors.length === 0, `no uncaught page errors (${cdp.errors.join(' | ').slice(0, 400)})`);
  }
  log(failures ? `${failures} FAILED` : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(`[${phase}] ERROR`, e); process.exit(1); });
