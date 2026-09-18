// BoardFusion server: serves the web game AND the online-room relay on one port.
// Run locally:  npm install && npm start          -> http://localhost:8787
// Deploy: set PORT (Render/Fly do this automatically); put it behind HTTPS so
// the client can use wss:// automatically.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const DiceEngine = require('./dice-engine');

const PORT = process.env.PORT || 8787;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };
const SUPABASE_URL='https://shvwglpfpuogwadvspvz.supabase.co';
const SUPABASE_PUBLIC='sb_publishable_gNJCTsEc246ssSYoG5LqzQ_Hb5bnTnl';
const scoredEvents=new Map();
const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
async function scoreResult(req,res){
  // Disabled until the room server validates full game state; never trust a client-declared win.
  if(process.env.VERIFIED_SCORING !== 'enabled') return json(res,503,{error:'verified scoring pending'});
  if(!process.env.SUPABASE_SECRET_KEY) return json(res,503,{error:'scoring unavailable'});
  let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return json(res,413,{error:'too large'});}
  let input;try{input=JSON.parse(body)}catch(_){return json(res,400,{error:'invalid json'});}
  if(!/^[0-9a-f-]{20,64}$/i.test(input.event_id||'')||!['Dice Race','Dice Race Online','Marble Loop'].includes(input.game)||input.winner!==true)return json(res,400,{error:'invalid result'});
  if(scoredEvents.has(input.event_id))return json(res,200,scoredEvents.get(input.event_id));
  const auth=req.headers.authorization||'';if(!auth.startsWith('Bearer '))return json(res,401,{error:'sign in required'});
  const ur=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_PUBLIC,Authorization:auth}});if(!ur.ok)return json(res,401,{error:'invalid session'});const user=await ur.json();
  const h={apikey:process.env.SUPABASE_SECRET_KEY,Authorization:'Bearer '+process.env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};
  let pr=await fetch(SUPABASE_URL+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id)+'&select=xp,wins,matches',{headers:h});let rows=await pr.json();if(!pr.ok||!rows[0])return json(res,409,{error:'profile missing'});
  const next={xp:rows[0].xp+100,wins:rows[0].wins+1,matches:rows[0].matches+1,updated_at:new Date().toISOString()};
  pr=await fetch(SUPABASE_URL+'/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id),{method:'PATCH',headers:{...h,Prefer:'return=minimal'},body:JSON.stringify(next)});if(!pr.ok)return json(res,502,{error:'score write failed'});
  const out={ok:true,xp:next.xp,wins:next.wins,matches:next.matches};scoredEvents.set(input.event_id,out);setTimeout(()=>scoredEvents.delete(input.event_id),86400000);return json(res,200,out);
}

const PUBLIC = new Set(['/', '/index.html', '/marble.html', '/net.js', '/gamify.js', '/cloud.js', '/landing.html', '/maintenance.html', '/icon.png']);

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/result' && req.method === 'POST') return void scoreResult(req,res).catch(()=>json(res,500,{error:'score error'}));
  if (url === '/healthz') { res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{"ok":true,"rooms":' + rooms.size + '}'); }
  const maintenance = process.env.MAINTENANCE_MODE === 'on';
  if (maintenance && ['/', '/index.html', '/marble.html', '/landing.html'].includes(url)) { res.writeHead(503, {'Content-Type':'text/html; charset=utf-8','Retry-After':'900'}); return fs.createReadStream(path.join(__dirname,'maintenance.html')).pipe(res); }
  const file = url === '/' ? '/index.html' : url;
  if (!PUBLIC.has(file)) { res.writeHead(404); return res.end('not found'); }
  fs.readFile(path.join(__dirname, file), (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, {'Content-Type': MIME[path.extname(file)] || 'application/octet-stream'});
    res.end(data);
  });
});

// ---------- Room relay ----------
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new Map(); // code -> { host, clients: Map<ws,{name}>, started }
const code = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const send = (ws, m) => { if (ws.readyState === 1) ws.send(JSON.stringify(m)); };
const broadcast = (room, m, except) => { for (const c of room.clients.keys()) if (c !== except) send(c, m); };

wss.on('connection', ws => {
  let roomCode = null;
  ws.on('message', raw => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'create') {
      roomCode = code();
      rooms.set(roomCode, { host: ws, clients: new Map([[ws, { name: m.name, seat:0 }]]), started: false, authority:null });
      send(ws, { t: 'created', code: roomCode });
    } else if (m.t === 'join') {
      const room = rooms.get(m.code);
      if (!room || room.started || room.clients.size >= 4) return send(ws, { t: 'error', reason: 'room unavailable' });
      roomCode = m.code;
      room.clients.set(ws, { name: m.name, seat:room.clients.size });
      broadcast(room, { t: 'lobby', players: [...room.clients.values()].map(c => c.name) });
      send(ws, { t: 'joined', code: roomCode });
    } else if (m.t === 'auth-start' && process.env.AUTHORITATIVE_DICE === 'enabled') {
      const room=rooms.get(roomCode);if(!room||ws!==room.host||room.started)return;room.started=true;room.authority=DiceEngine.create([...room.clients.values()].map(x=>x.name));broadcast(room,{t:'auth-state',state:room.authority});send(ws,{t:'auth-state',state:room.authority});
    } else if (m.t === 'auth-move' && process.env.AUTHORITATIVE_DICE === 'enabled') {
      const room=rooms.get(roomCode);if(!room||!room.authority)return;const member=room.clients.get(ws);if(!member)return;try{const ev=m.kind==='roll'?DiceEngine.roll(room.authority,member.seat):DiceEngine.move(room.authority,member.seat,m.idx);broadcast(room,{t:'auth-state',event:ev.type,state:room.authority});send(ws,{t:'auth-state',event:ev.type,state:room.authority});}catch(e){send(ws,{t:'error',reason:e.message});}
    } else if (m.t === 'start' || m.t === 'state' || m.t === 'move') {
      const room = rooms.get(roomCode); if (!room) return;
      if (m.t === 'start') room.started = true;
      if (ws === room.host) broadcast(room, m, ws); else send(room.host, m);
    } else if (m.t === 'chat') {
      const room = rooms.get(roomCode); if (room) broadcast(room, m, ws);
    }
  });
  ws.on('close', () => {
    const room = rooms.get(roomCode); if (!room) return;
    room.clients.delete(ws);
    if (ws === room.host || room.clients.size === 0) {
      broadcast(room, { t: 'closed' }); rooms.delete(roomCode);
    } else broadcast(room, { t: 'lobby', players: [...room.clients.values()].map(c => c.name) });
  });
});

server.listen(PORT, () => console.log('BoardFusion live on :' + PORT + ' (game at /, relay at /ws)'));
