'use strict';
const assert=require('assert'),P=require('./online-presentation');
const state={turn:1,players:[{name:'Alice',color:'red'},{name:'Bob',color:'yellow'}]};
async function check(event,value,message){
 const order=[];
 const ok=await P.revealTerminal({state,event,roll:{value,seat:0},setTransition:v=>order.push('lock:'+v),armRoll:()=>order.push('arm'),finishDiceShake:n=>order.push('die:'+n),flashMessage:async html=>order.push('flash:'+html),colors:{red:'#f00'},escapeHtml:String,wait:async ms=>order.push('wait:'+ms)});
 assert.equal(ok,true);assert.deepEqual(order.slice(0,5),['lock:true','arm','die:'+value,'flash:Rolled <b>'+value+'</b>','wait:720']);assert.equal(order[5],'flash:'+message);
}
(async()=>{await check('no-move',4,'Alice rolled 4 - no moves');await check('forfeit',6,'Alice rolled three 6s');assert.equal(P.terminal(state,'no-move',null),null);console.log('ONLINE PRESENTATION TESTS: ALL PASS')})().catch(e=>{console.error(e);process.exit(1)});
