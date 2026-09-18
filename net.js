// BoardFusion server-authoritative room client with seat-token resume.
window.NET=(function(){
 let ws=null,url=null,room=null,seat=null,name=null,muted=false,closing=false,retries=0;const handlers={};
 const on=(ev,fn)=>{handlers[ev]=fn},emit=(ev,d)=>{if(handlers[ev])handlers[ev](d)};
 const key=c=>'bf_room_v2_'+c;
 function send(m){if(ws&&ws.readyState===1)ws.send(JSON.stringify(m));else emit('error',{reason:'Not connected'});}
 function open(target){url=target;closing=false;return new Promise((resolve,reject)=>{const current=new WebSocket(url);ws=current;current.onopen=()=>{retries=0;resolve();};current.onerror=reject;current.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch(_){return;}if(m.t==='v2-welcome'){room=m.code;seat=m.seat;localStorage.setItem(key(room),JSON.stringify({code:room,token:m.token,name,url}));}if(m.t==='v2-resumed'){room=m.code;seat=m.seat;emit('resumed',m);}if(m.t==='v2-muted')muted=!!m.value;emit(m.t,m);};current.onclose=()=>{if(ws!==current)return;emit('closed',{});if(!closing&&room)setTimeout(reconnect,Math.min(8000,500*Math.pow(2,retries++)));};});}
 async function reconnect(){const saved=JSON.parse(localStorage.getItem(key(room))||'null');if(!saved)return;try{await open(saved.url||url);send({t:'v2-resume',code:saved.code,token:saved.token});}catch(_){if(!closing)setTimeout(reconnect,Math.min(8000,500*Math.pow(2,retries++)));}}
 const access=()=>window.BFCloud&&BFCloud.token||null;
 const create=n=>{name=n;send({t:'v2-create',name:n,accessToken:access()});};
 const join=(c,n)=>{name=n;send({t:'v2-join',code:c.toUpperCase(),name:n,accessToken:access()});};
 return{connect:open,create,join,on,start:()=>send({t:'v2-start'}),roll:()=>send({t:'v2-action',kind:'roll'}),pick:idx=>send({t:'v2-action',kind:'pick',idx}),react:emoji=>send({t:'v2-reaction',emoji}),mute:v=>{muted=!!v;send({t:'v2-mute',value:muted})},rematch:()=>send({t:'v2-rematch'}),get mode(){return room?'v2':'off'},get room(){return room},get seat(){return seat},get name(){return name},get muted(){return muted}};
})();
