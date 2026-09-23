// BoardFusion: static site, legacy relay, and server-authoritative Dice Race v2.
const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
const DiceEngine=require('./dice-engine'),Rooms=require('./room-v2');
const PORT=process.env.PORT||8787;
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json','.png':'image/png','.md':'text/markdown; charset=utf-8','.opus':'audio/ogg'};
const SUPABASE_URL='https://shvwglpfpuogwadvspvz.supabase.co',SUPABASE_PUBLIC='sb_publishable_gNJCTsEc246ssSYoG5LqzQ_Hb5bnTnl';
const scoredEvents=new Map(),verifiedResults=new Map();
const matchQueue=[],queuedById=new Map(),MATCH_WAIT_MS=5*60*1000;
const json=(res,code,data)=>{res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
async function authUser(raw){if(!raw)return null;const r=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_PUBLIC,Authorization:'Bearer '+raw}});if(!r.ok)throw Error('invalid session');return (await r.json()).id;}
async function scoreResult(req,res){
 if(process.env.VERIFIED_SCORING!=='enabled')return json(res,503,{error:'verified scoring pending'});
 if(!process.env.SUPABASE_SECRET_KEY)return json(res,503,{error:'scoring unavailable'});
 let body='';for await(const chunk of req){body+=chunk;if(body.length>4096)return json(res,413,{error:'too large'});}let input;try{input=JSON.parse(body)}catch(_){return json(res,400,{error:'invalid json'});}
 if(!/^[0-9a-f-]{20,64}$/i.test(input.event_id||''))return json(res,400,{error:'invalid result'});
 if(scoredEvents.has(input.event_id))return json(res,200,scoredEvents.get(input.event_id));
 const auth=req.headers.authorization||'';if(!auth.startsWith('Bearer '))return json(res,401,{error:'sign in required'});
 let userId;try{userId=await authUser(auth.slice(7));}catch(_){return json(res,401,{error:'invalid session'});}
 const verified=verifiedResults.get(input.event_id);if(!verified||verified.userId!==userId||verified.scored)return json(res,403,{error:'result not verified'});
 const h={apikey:process.env.SUPABASE_SECRET_KEY,Authorization:'Bearer '+process.env.SUPABASE_SECRET_KEY,'Content-Type':'application/json'};
 let pr=await fetch(SUPABASE_URL+'/rest/v1/profiles?id=eq.'+encodeURIComponent(userId)+'&select=xp,wins,matches',{headers:h}),rows=await pr.json();if(!pr.ok||!rows[0])return json(res,409,{error:'profile missing'});
 const next={xp:rows[0].xp+100,wins:rows[0].wins+1,matches:rows[0].matches+1,updated_at:new Date().toISOString()};
 pr=await fetch(SUPABASE_URL+'/rest/v1/profiles?id=eq.'+encodeURIComponent(userId),{method:'PATCH',headers:{...h,Prefer:'return=minimal'},body:JSON.stringify(next)});if(!pr.ok)return json(res,502,{error:'score write failed'});
 verified.scored=true;const out={ok:true,xp:next.xp,wins:next.wins,matches:next.matches};scoredEvents.set(input.event_id,out);setTimeout(()=>{scoredEvents.delete(input.event_id);verifiedResults.delete(input.event_id)},86400000);return json(res,200,out);
}
const PUBLIC=new Set(['/','/verify-v2.html','/index.html','/marble.html','/net.js','/online-presentation.js','/gamify.js','/cloud.js','/analytics.js','/stats.html','/landing.html','/maintenance.html','/icon.png','/assets/happy-vibes.opus']);
const legacyRooms=new Map(),v2=new Rooms({ttl:120000});
const server=http.createServer((req,res)=>{const url=req.url.split('?')[0];if(url==='/api/result'&&req.method==='POST')return void scoreResult(req,res).catch(()=>json(res,500,{error:'score error'}));if(url==='/healthz')return json(res,200,{ok:true,rooms:legacyRooms.size+v2.rooms.size});const maintenance=process.env.MAINTENANCE_MODE==='on';if(maintenance&&['/','/index.html','/marble.html','/landing.html'].includes(url)){res.writeHead(503,{'Content-Type':'text/html; charset=utf-8','Retry-After':'900'});return fs.createReadStream(path.join(__dirname,'maintenance.html')).pipe(res);}const file=(url==='/'||url==='/verify-v2.html')?'/index.html':url;if(!PUBLIC.has(file)){res.writeHead(404);return res.end('not found');}fs.readFile(path.join(__dirname,file),(err,data)=>{if(err){res.writeHead(404);return res.end('not found');}res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});res.end(data);});});
const wss=new WebSocketServer({server,path:'/ws'}),code=()=>Math.random().toString(36).slice(2,6).toUpperCase();
const send=(ws,m)=>{if(ws.readyState===1)ws.send(JSON.stringify(m));};
const broadcastLegacy=(r,m,except)=>{for(const c of r.clients.keys())if(c!==except)send(c,m);};
const sockets=new Map(); // code -> Map<seat,ws>
const publicRoom=r=>({code:r.code,seats:r.seats.map(({name,seat,online,muted})=>({name,seat,online,muted})),state:r.game,rematchVotes:r.rematch.size,resultId:r.resultId});
const broadcastV2=(roomCode,m)=>{for(const ws of (sockets.get(roomCode)||new Map()).values())send(ws,m);};
const lobbyV2=roomCode=>broadcastV2(roomCode,{t:'v2-lobby',room:publicRoom(v2.get(roomCode))});
function queueId(ws,m,authId){const raw=authId||String(m.clientId||'').slice(0,80);if(!raw)throw Error('matchmaking identity missing');return(authId?'user:':'browser:')+raw;}
function removeFromQueue(ws,notice){const i=matchQueue.findIndex(x=>x.ws===ws);if(i<0)return false;const [entry]=matchQueue.splice(i,1);if(queuedById.get(entry.id)===entry)queuedById.delete(entry.id);clearTimeout(entry.timer);ws.matchQueueId=null;if(notice)send(ws,{t:'v2-match-cancelled',reason:notice});return true;}
function pairQueue(){while(matchQueue.length>=2){const a=matchQueue.shift(),b=matchQueue.shift();if(queuedById.get(a.id)!==a||queuedById.get(b.id)!==b)continue;if(a.ws.readyState!==1||b.ws.readyState!==1){for(const entry of [a,b]){if(entry.ws.readyState===1){matchQueue.unshift(entry);}else{queuedById.delete(entry.id);clearTimeout(entry.timer);entry.ws.matchQueueId=null;}}continue;}queuedById.delete(a.id);queuedById.delete(b.id);clearTimeout(a.timer);clearTimeout(b.timer);a.ws.matchQueueId=b.ws.matchQueueId=null;const host=v2.create(a.name,a.authId),guest=v2.join(host.code,b.name,b.authId);bind(a.ws,host.code,host.seat);bind(b.ws,guest.code,guest.seat);const room=v2.get(host.code);v2.start(host.code,0);send(a.ws,{t:'v2-match-found',code:host.code,seat:host.seat,token:host.token,room:publicRoom(room)});send(b.ws,{t:'v2-match-found',code:host.code,seat:guest.seat,token:guest.token,room:publicRoom(room)});broadcastV2(host.code,{t:'v2-state',room:publicRoom(room),event:'start'});}}
function enterQueue(ws,m,authId){if(ws.v2Code)throw Error('already in a room');const id=queueId(ws,m,authId),old=queuedById.get(id);if(old&&old.ws!==ws){removeFromQueue(old.ws,'Queue moved to another tab');send(old.ws,{t:'v2-displaced',reason:'Matchmaking continued in another tab.'});}else if(old)return send(ws,{t:'v2-match-queued',position:matchQueue.indexOf(old)+1,waitMs:MATCH_WAIT_MS});const entry={ws,id,name:String(m.name||'Player').slice(0,24),authId,at:Date.now()};entry.timer=setTimeout(()=>{if(removeFromQueue(ws))send(ws,{t:'v2-match-timeout',reason:'No player found yet. Try again when more players are online.'});},MATCH_WAIT_MS);matchQueue.push(entry);queuedById.set(id,entry);ws.matchQueueId=id;send(ws,{t:'v2-match-queued',position:matchQueue.length,waitMs:MATCH_WAIT_MS});pairQueue();}

function bind(ws,roomCode,seat){if(ws.v2Code&&sockets.has(ws.v2Code))sockets.get(ws.v2Code).delete(ws.v2Seat);ws.v2Code=roomCode;ws.v2Seat=seat;if(!sockets.has(roomCode))sockets.set(roomCode,new Map());const old=sockets.get(roomCode).get(seat);if(old&&old!==ws){send(old,{t:'v2-displaced'});old.close(4001,'resumed elsewhere');}sockets.get(roomCode).set(seat,ws);}
function finishIfNeeded(room,event){if(event.resultId&&room.game?.over){const winner=room.seats[room.game.winner];verifiedResults.set(event.resultId,{userId:winner.authId||null,scored:false,at:Date.now()});}}
setInterval(()=>{v2.reap();for(const c of sockets.keys())if(!v2.rooms.has(c))sockets.delete(c);const cutoff=Date.now()-86400000;for(const [id,x]of verifiedResults)if(x.at<cutoff)verifiedResults.delete(id);},30000).unref();
wss.on('connection',ws=>{let roomCode=null;ws.on('message',async raw=>{let m;try{m=JSON.parse(raw)}catch(_){return;}try{
 // v2 is isolated from the stable legacy protocol.
 if(m.t==='v2-match'){const authId=await authUser(m.accessToken||'');enterQueue(ws,m,authId);return;}
 if(m.t==='v2-match-cancel'){removeFromQueue(ws,'You left matchmaking.');return;}
 if(m.t==='v2-create'){if(ws.v2Code)throw Error('already in a room');const authId=await authUser(m.accessToken||'');const x=v2.create(m.name,authId);bind(ws,x.code,x.seat);send(ws,{t:'v2-welcome',code:x.code,seat:x.seat,token:x.token,room:publicRoom(v2.get(x.code))});return lobbyV2(x.code);}
 if(m.t==='v2-join'){if(ws.v2Code)throw Error('already in a room');const authId=await authUser(m.accessToken||'');const x=v2.join(m.code,m.name,authId);bind(ws,x.code,x.seat);send(ws,{t:'v2-welcome',code:x.code,seat:x.seat,token:x.token,room:publicRoom(v2.get(x.code))});return lobbyV2(x.code);}
 if(m.t==='v2-resume'){const x=v2.resume(m.code,m.token);bind(ws,String(m.code).toUpperCase(),x.seat);send(ws,{t:'v2-resumed',code:ws.v2Code,seat:x.seat,room:publicRoom(v2.get(ws.v2Code))});return lobbyV2(ws.v2Code);}
 if(m.t.startsWith('v2-')){if(!ws.v2Code||!Number.isInteger(ws.v2Seat))throw Error('not seated');const r=v2.get(ws.v2Code);
  if(m.t==='v2-start'){v2.start(r.code,ws.v2Seat);broadcastV2(r.code,{t:'v2-state',room:publicRoom(r),event:'start'});}
  else if(m.t==='v2-action'){const ev=v2.act(r.code,ws.v2Seat,{kind:m.kind,idx:m.idx});finishIfNeeded(r,ev);broadcastV2(r.code,{t:'v2-state',room:publicRoom(r),event:ev.type,roll:Number.isInteger(ev.rolled)?{value:ev.rolled,seat:ev.actor}:null});}
  else if(m.t==='v2-reaction'){const reaction=v2.react(r.code,ws.v2Seat,m.emoji);broadcastV2(r.code,{t:'v2-reaction',...reaction});}
  else if(m.t==='v2-mute'){v2.mute(r.code,ws.v2Seat,m.value);send(ws,{t:'v2-muted',value:r.seats[ws.v2Seat].muted});lobbyV2(r.code);}
  else if(m.t==='v2-rematch'){const result=v2.rematch(r.code,ws.v2Seat);broadcastV2(r.code,{t:'v2-rematch',...result,room:publicRoom(r)});}
  return;
 }
 // Legacy relay retained until v2 has passed deployment validation.
 if(m.t==='create'){roomCode=code();legacyRooms.set(roomCode,{host:ws,clients:new Map([[ws,{name:m.name,seat:0}]]),started:false,authority:null});send(ws,{t:'created',code:roomCode});}
 else if(m.t==='join'){const r=legacyRooms.get(m.code);if(!r||r.started||r.clients.size>=4)return send(ws,{t:'error',reason:'room unavailable'});roomCode=m.code;r.clients.set(ws,{name:m.name,seat:r.clients.size});broadcastLegacy(r,{t:'lobby',players:[...r.clients.values()].map(c=>c.name)});send(ws,{t:'joined',code:roomCode});}
 else if(m.t==='auth-start'&&process.env.AUTHORITATIVE_DICE==='enabled'){const r=legacyRooms.get(roomCode);if(!r||ws!==r.host||r.started)return;r.started=true;r.authority=DiceEngine.create([...r.clients.values()].map(x=>x.name));broadcastLegacy(r,{t:'auth-state',state:r.authority});send(ws,{t:'auth-state',state:r.authority});}
 else if(m.t==='auth-move'&&process.env.AUTHORITATIVE_DICE==='enabled'){const r=legacyRooms.get(roomCode);if(!r||!r.authority)return;const member=r.clients.get(ws);if(!member)return;const ev=m.kind==='roll'?DiceEngine.roll(r.authority,member.seat):DiceEngine.move(r.authority,member.seat,m.idx);broadcastLegacy(r,{t:'auth-state',event:ev.type,state:r.authority});send(ws,{t:'auth-state',event:ev.type,state:r.authority});}
 else if(m.t==='start'||m.t==='state'||m.t==='move'){const r=legacyRooms.get(roomCode);if(!r)return;if(m.t==='start')r.started=true;if(ws===r.host)broadcastLegacy(r,m,ws);else send(r.host,m);}else if(m.t==='chat'){const r=legacyRooms.get(roomCode);if(r)broadcastLegacy(r,m,ws);}
 }catch(e){send(ws,{t:'error',reason:e.message||'request failed'});}});
 ws.on('close',()=>{removeFromQueue(ws);if(ws.v2Code){const map=sockets.get(ws.v2Code);if(map&&map.get(ws.v2Seat)===ws){map.delete(ws.v2Seat);try{v2.leave(ws.v2Code,ws.v2Seat);lobbyV2(ws.v2Code)}catch(_){}}return;}const r=legacyRooms.get(roomCode);if(!r)return;r.clients.delete(ws);if(ws===r.host||r.clients.size===0){broadcastLegacy(r,{t:'closed'});legacyRooms.delete(roomCode);}else broadcastLegacy(r,{t:'lobby',players:[...r.clients.values()].map(c=>c.name)});});});
server.listen(PORT,()=>console.log('BoardFusion live on :'+PORT+' (game at /, relay at /ws)'));
