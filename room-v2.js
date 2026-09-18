'use strict';
const crypto=require('crypto'),E=require('./dice-engine');
const token=()=>crypto.randomBytes(24).toString('hex');
class Rooms{
 constructor({ttl=120000,rng=Math.random}={}){this.ttl=ttl;this.rng=rng;this.rooms=new Map();}
 create(name,authId=null){let code;do code=Math.random().toString(36).slice(2,6).toUpperCase();while(this.rooms.has(code));const seat=this.member(name,0,authId);this.rooms.set(code,{code,seats:[seat],game:null,rematch:new Set(),expires:null,resultId:null});return{code,...seat};}
 join(code,name,authId=null){const r=this.get(code);if(r.game||r.seats.length>=4)throw Error('room unavailable');const seat=this.member(name,r.seats.length,authId);r.seats.push(seat);return{code,...seat};}
 member(name,seat,authId){return{name:String(name||'Player').slice(0,24),seat,authId,token:token(),online:true,muted:false,lastSeen:Date.now()};}
 get(code){const r=this.rooms.get(String(code).toUpperCase());if(!r)throw Error('room unavailable');return r;}
 resume(code,tok){const r=this.get(code),s=r.seats.find(x=>x.token===tok);if(!s)throw Error('invalid reconnect token');s.online=true;s.lastSeen=Date.now();r.expires=null;return{seat:s.seat,state:r.game};}
 leave(code,seat){const r=this.get(code),s=r.seats[seat];if(!s)return;s.online=false;s.lastSeen=Date.now();if(r.seats.every(x=>!x.online))r.expires=Date.now()+this.ttl;}
 reap(now=Date.now()){for(const [c,r] of this.rooms)if(r.expires&&r.expires<=now)this.rooms.delete(c);}
 start(code,seat){const r=this.get(code);if(seat!==0||r.game)throw Error('host only');r.game=E.create(r.seats.map(x=>x.name));r.rematch.clear();return r.game;}
 act(code,seat,a){const r=this.get(code);if(!r.game)throw Error('not started');const ev=a.kind==='roll'?E.roll(r.game,seat,this.rng):a.kind==='pick'?E.move(r.game,seat,a.idx):(()=>{throw Error('bad action')})();if(r.game.over&&!r.resultId)r.resultId=crypto.randomUUID();return{...ev,resultId:r.resultId};}
 react(code,seat,emoji){const r=this.get(code);if(!r.seats[seat])throw Error('seat');if(!['👏','😂','😮','🔥','🎉','👍'].includes(emoji))throw Error('reaction');return{seat,emoji};}
 mute(code,seat,v){const r=this.get(code);if(!r.seats[seat])throw Error('seat');r.seats[seat].muted=!!v;return r.seats[seat].muted;}
 rematch(code,seat){const r=this.get(code);if(!r.game?.over)throw Error('game active');r.rematch.add(seat);if(r.rematch.size!==r.seats.length)return{ready:false,votes:r.rematch.size};r.game=E.create(r.seats.map(x=>x.name));r.rematch.clear();r.resultId=null;return{ready:true,state:r.game};}
}
module.exports=Rooms;
