// BoardFusion server: serves the web game AND the online-room relay on one port.
// Run locally:  npm install && npm start          -> http://localhost:8787
// Deploy: set PORT (Render/Fly do this automatically); put it behind HTTPS so
// the client can use wss:// automatically.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8787;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8' };
const PUBLIC = new Set(['/', '/index.html', '/marble.html', '/net.js', '/landing.html', '/icon.png']);

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/healthz') { res.writeHead(200, {'Content-Type':'application/json'}); return res.end('{"ok":true,"rooms":' + rooms.size + '}'); }
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
      rooms.set(roomCode, { host: ws, clients: new Map([[ws, { name: m.name }]]), started: false });
      send(ws, { t: 'created', code: roomCode });
    } else if (m.t === 'join') {
      const room = rooms.get(m.code);
      if (!room || room.started || room.clients.size >= 4) return send(ws, { t: 'error', reason: 'room unavailable' });
      roomCode = m.code;
      room.clients.set(ws, { name: m.name });
      broadcast(room, { t: 'lobby', players: [...room.clients.values()].map(c => c.name) });
      send(ws, { t: 'joined', code: roomCode });
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
