'use strict';
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.BFOnlinePresentation=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 function terminal(state,event,roll){
  if((event!=='no-move'&&event!=='forfeit')||!state||!roll||!Number.isInteger(roll.value)||roll.value<1||roll.value>6||!Number.isInteger(roll.seat))return null;
  const player=state.players&&state.players[roll.seat];if(!player)return null;
  return{value:roll.value,seat:roll.seat,player,message:event==='forfeit'?player.name+' rolled three 6s':player.name+' rolled '+roll.value+' - no moves'};
 }
 async function revealTerminal(o){
  const x=terminal(o.state,o.event,o.roll);if(!x)return false;
  o.setTransition(true);o.armRoll();o.finishDiceShake(x.value);
  await o.flashMessage('Rolled <b>'+x.value+'</b>','result',o.colors[x.player.color]);
  await o.wait(720);
  await o.flashMessage(o.escapeHtml(x.message),'result',o.colors[x.player.color]);
  return true;
 }
 return{terminal,revealTerminal};
});
