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
      resolve({ ev, errors, close: () => ws.close() });
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
    // Local game vs computer / pass-and-play from the setup screen.
    if (await cdp.ev(visible('#startbtn'))) { log('start:', await cdp.ev(click('#startbtn'))); await sleep(2500); }
    shot('04-local-game');
    if (await cdp.ev('(()=>{const b=document.querySelector("#dicebtn");return !!b&&!b.disabled})()')) {
      log('roll:', await cdp.ev(click('#dicebtn'))); await sleep(4000);
    }
    log('status after roll:', await cdp.ev('(document.querySelector("#statusbar")||{}).innerText'));
    shot('05-after-roll');
    // Online matchmaking.
    log('online:', await cdp.ev(click('#onlinebtn'))); await sleep(1500);
    await cdp.ev('(()=>{const n=document.querySelector("#pname_in");if(n&&!n.value){n.value="CI Tester";n.dispatchEvent(new Event("input",{bubbles:true}))}})()');
    shot('06-online-dialog');
    log('find:', await cdp.ev(click('#findmatch')));
    const queued = await until(cdp, `(${visible('#queueview')})||/Looking for an online player/.test(document.body.innerText)`, 60000, 'matchmaking queue reached');
    check(queued, 'online matchmaking reaches "Looking for an online player"');
    const err = await cdp.ev('(document.querySelector("#onlineerr")||{}).innerText||""');
    check(!/not connected/i.test(err), `no "Not connected" error (onlineerr="${err}")`);
    shot('07-online-queue');
    log('cancel:', await cdp.ev(click('#cancelmatch'))); await sleep(1500);
    shot('08-online-cancelled');
    check(cdp.errors.length === 0, `no uncaught page errors (${cdp.errors.join(' | ').slice(0, 400)})`);
  }
  log(failures ? `${failures} FAILED` : 'ALL PASS');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(`[${phase}] ERROR`, e); process.exit(1); });
