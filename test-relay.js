// Automated relay smoke test: host + guest through server.js
process.env.PORT = '8791';
require('./server.js');
const WebSocket = require('ws');
const URL = 'ws://127.0.0.1:8791/ws';
const results = [];
const ok = (name, cond) => { results.push([name, !!cond]); };
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 8000);

const host = new WebSocket(URL);
let code = null, guest = null, phase = 0;
host.on('open', () => host.send(JSON.stringify({t:'create', name:'Host'})));
host.on('message', raw => {
  const m = JSON.parse(raw);
  if (m.t === 'created') {
    code = m.code; ok('room created with code', /^[A-Z0-9]{4}$/.test(code));
    guest = new WebSocket(URL);
    guest.on('open', () => guest.send(JSON.stringify({t:'join', code, name:'Guest'})));
    guest.on('message', graw => {
      const g = JSON.parse(graw);
      if (g.t === 'joined') { ok('guest joined', true); }
      if (g.t === 'state' && g.kind === 'sync' && g.turn === 1) {
        ok('guest received host state broadcast', true);
        finish();
      }
    });
  }
  if (m.t === 'lobby') {
    ok('lobby lists both players', m.players.length === 2 && m.players[0] === 'Host' && m.players[1] === 'Guest');
    // guest sends a move intent; host should receive it
    guest.send(JSON.stringify({t:'move', kind:'roll', from:'Guest'}));
  }
  if (m.t === 'move') {
    ok('host received guest intent with sender', m.kind === 'roll' && m.from === 'Guest');
    // host broadcasts authoritative state
    host.send(JSON.stringify({t:'state', kind:'sync', turn:1}));
  }
});
function finish(){
  let pass = true;
  for (const [n, c] of results) { console.log((c ? 'PASS' : 'FAIL') + ' - ' + n); if (!c) pass = false; }
  console.log(pass ? 'RELAY SMOKE TEST: ALL PASS' : 'RELAY SMOKE TEST: FAILURES');
  process.exit(pass ? 0 : 1);
}
