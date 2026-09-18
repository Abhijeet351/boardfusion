// End-to-end browser sync test: two real Chrome instances over the relay.
const { spawn, execSync } = require('child_process');
const WebSocket = require('ws');
process.env.PORT = '8792';
require('./server.js');
const http = spawn('python3', ['-m', 'http.server', '8899'], { cwd: __dirname, stdio: 'ignore' });
const URL = 'http://127.0.0.1:8899/index.html';
const results = [];
const ok = (n, c) => { results.push([n, !!c]); console.log((c ? 'PASS' : 'FAIL') + ' - ' + n); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function launchChrome(port) {
  const c = spawn('google-chrome', ['--headless=new', '--disable-gpu', '--no-sandbox',
    '--remote-debugging-port=' + port, '--user-data-dir=/tmp/e2e-' + port, URL], { stdio: 'ignore' });
  for (let i = 0; i < 40; i++) {
    await sleep(500);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/list`);
      const tabs = await r.json();
      const page = tabs.find(t => t.url.includes('index.html'));
      if (page) return { proc: c, ws: new WebSocket(page.webSocketDebuggerUrl), msgId: 0, pending: {} };
    } catch (e) {}
  }
  throw new Error('chrome did not start on ' + port);
}
function evaluate(inst, expr) {
  return new Promise((res, rej) => {
    const id = ++inst.msgId;
    inst.pending[id] = { res, rej };
    inst.ws.send(JSON.stringify({ id, method: 'Runtime.evaluate',
      params: { expression: expr, awaitPromise: true, returnByValue: true } }));
  });
}
function bind(inst) {
  inst.ws.on('message', raw => {
    const m = JSON.parse(raw);
    if (m.id && inst.pending[m.id]) {
      const p = inst.pending[m.id]; delete inst.pending[m.id];
      if (m.result && m.result.exceptionDetails) p.rej(new Error(JSON.stringify(m.result.exceptionDetails)));
      else p.res(m.result && m.result.result ? m.result.result.value : undefined);
    }
  });
  return new Promise(r => inst.ws.on('open', r));
}
async function poll(inst, expr, timeout = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await evaluate(inst, expr);
    if (v) return v;
    await sleep(400);
  }
  return null;
}
(async () => {
  const A = await launchChrome(9333); await bind(A);
  const B = await launchChrome(9444); await bind(B);
  const ready = `document.readyState==='complete' && window.NET && document.getElementById('onlinebtn') ? true : false`;
  ok('browser A page ready', !!(await poll(A, ready)));
  ok('browser B page ready', !!(await poll(B, ready)));
  // host creates room
  await evaluate(A, `document.getElementById('onlinebtn').click();
    document.getElementById('wsurl').value='ws://127.0.0.1:8792/ws';
    document.getElementById('pname_in').value='Host';
    document.getElementById('createroom').click(); 'clicked'`);
  const code = await poll(A, `NET.room`);
  ok('host created room in browser A', code && code.length === 4);
  // guest joins
  await evaluate(B, `document.getElementById('onlinebtn').click();
    document.getElementById('wsurl').value='ws://127.0.0.1:8792/ws';
    document.getElementById('pname_in').value='Guest';
    document.getElementById('roomcode').value='${code}';
    document.getElementById('joinroom').click(); 'clicked'`);
  ok('guest joined room in browser B', !!(await poll(B, `NET.room==='${code}'`)));
  // host starts game
  await evaluate(A, `document.getElementById('startonline').click(); 'started'`);
  ok('browser B received game state (2 players, red+yellow)', !!(await poll(B, `players.length===2 && players[0].color==='red' && players[1].color==='yellow'`)));
  ok('browser B sees tokens initialized', !!(await poll(B, `tokens && tokens.red && tokens.red.length===4 && tokens.red.every(p=>p===-1)`)));
  // guest (yellow, seat 2) rolls out of turn while it is red's turn - host must reject
  await evaluate(B, `NET.intent({kind:'roll'}); 'sent'`);
  await sleep(1500);
  const turnStill = await evaluate(A, `turn`);
  const diceStill = await evaluate(A, `dice`);
  ok('out-of-turn intent rejected by host', turnStill === 0 && diceStill === null);
  // host rolls; B should mirror the dice + status
  await evaluate(A, `document.getElementById('dicebtn').click(); 'rolled'`);
  const diceA = await poll(A, `dice`);
  ok('host rolled dice in A', !!diceA);
  const diceB = await poll(B, `dice`);
  ok('browser B synced same dice value', !!diceB && diceA === diceB);
  const statusB = await evaluate(B, `document.getElementById('statusbar').textContent`);
  const statusA = await evaluate(A, `document.getElementById('statusbar').textContent`);
  ok('status text matches across browsers', statusA === statusB);
  const pass = results.every(r => r[1]);
  console.log(pass ? 'E2E SYNC: ALL PASS' : 'E2E SYNC: FAILURES');
  A.proc.kill(); B.proc.kill(); http.kill();
  try { execSync('pkill -f "user-data-dir=/tmp/e2e-"'); } catch(e) {}
  process.exit(pass ? 0 : 1);
})().catch(e => { console.error('E2E ERROR', e.message); process.exit(1); });
