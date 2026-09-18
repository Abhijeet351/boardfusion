'use strict';
const ORDER=['red','green','yellow','blue'];
const START={red:0,green:13,yellow:26,blue:39};
const SAFE=new Set([0,8,13,21,26,34,39,47]);
const seatColors=n=>n===2?['red','yellow']:n===3?['red','green','yellow']:ORDER.slice();
const abs=(c,p)=>(START[c]+p)%52;
function create(names){if(!Array.isArray(names)||names.length<2||names.length>4)throw Error('players');const colors=seatColors(names.length);return{players:names.map((name,i)=>({name:String(name).slice(0,24),color:colors[i],done:false})),tokens:Object.fromEntries(colors.map(c=>[c,[-1,-1,-1,-1]])),turn:0,dice:null,awaiting:false,sixes:0,over:false,winner:null,revision:0};}
function movable(g,c,d){const out=[];g.tokens[c].forEach((p,i)=>{if(p===-1?d===6:p<56&&p+d<=56)out.push(i)});return out;}
function roll(g,seat,rng=Math.random){guard(g,seat);if(g.dice!==null||g.awaiting)throw Error('already rolled');const d=1+Math.floor(rng()*6),c=g.players[g.turn].color;g.dice=d;g.sixes=d===6?g.sixes+1:0;if(g.sixes===3){g.sixes=0;advance(g);return event(g,'forfeit');}const mv=movable(g,c,d);if(!mv.length){advance(g);return event(g,'no-move');}g.awaiting=true;g.revision++;return event(g,'rolled',{dice:d,movable:mv});}
function move(g,seat,idx){guard(g,seat);if(!g.awaiting||g.dice===null)throw Error('roll first');const c=g.players[g.turn].color,d=g.dice,mv=movable(g,c,d);if(!Number.isInteger(idx)||!mv.includes(idx))throw Error('illegal move');let p=g.tokens[c][idx],capture=0,home=false;if(p===-1)g.tokens[c][idx]=0;else{p+=d;g.tokens[c][idx]=p;if(p===56)home=true;else if(p<=50&&!SAFE.has(abs(c,p)))for(const pl of g.players)if(pl.color!==c)g.tokens[pl.color].forEach((q,i)=>{if(q>=0&&q<=50&&abs(pl.color,q)===abs(c,p)){g.tokens[pl.color][i]=-1;capture++;}})}g.awaiting=false;g.dice=null;if(g.tokens[c].every(x=>x===56)){g.over=true;g.winner=seat;g.revision++;return event(g,'win',{capture,home});}if(d!==6&&!capture&&!home)advance(g);else{g.sixes=d===6?g.sixes:0;g.revision++;}return event(g,'moved',{capture,home});}
function advance(g){g.dice=null;g.awaiting=false;g.sixes=0;do g.turn=(g.turn+1)%g.players.length;while(g.players[g.turn].done);g.revision++;}
function guard(g,seat){if(g.over)throw Error('game over');if(!Number.isInteger(seat)||seat!==g.turn)throw Error('out of turn');}
function event(g,type,extra={}){return{type,...extra,state:JSON.parse(JSON.stringify(g))};}
module.exports={create,roll,move,movable,abs};
