'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm');
const html=fs.readFileSync('index.html','utf8'),body=/function completeTokenMove\(color, idx\)\{([\s\S]*?)\n\}\nfunction nextTurn/.exec(html);assert(body,'completeTokenMove found');
const code='function completeTokenMove(color,idx){'+body[1]+'\n}';let wins=0,rendered=0;
const ctx={tokens:{red:[56,56,56,55]},players:[{color:'red',name:'A',ai:false,done:false},{color:'yellow',name:'B',ai:false,done:false},{color:'green',name:'C',ai:false,done:false}],turn:0,dice:1,gameOver:false,transitionBusy:false,awaitingMove:true,nostalgia:{quickEntry:false,safeStars:true},SAFE:new Set(),BFGame:{home(){},capture(){},win(){wins++}},setTransition(){},updateDiceControl(){},log(){},showMoment(){},showMemoryCard(){},render(){rendered++},setTimeout(){},tokenSound(){},tname:x=>x,absIdx(){return 0},nextTurn(){}};
vm.createContext(ctx);vm.runInContext(code,ctx);ctx.completeTokenMove('red',3);assert.equal(ctx.gameOver,true);assert.equal(ctx.players[0].done,true);assert.equal(wins,1);assert.equal(rendered,1);console.log('LOCAL FIRST-HOME WIN TEST: ALL PASS');
