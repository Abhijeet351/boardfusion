// BoardFusion privacy-light usage analytics.
// Sends a few anonymous events straight to the existing Supabase project (insert-only table).
// No cookies, no names, no emails, no IP stored by us. A random device id lives in localStorage
// so "did anyone come back" can be answered. Opt out on a device: open /stats.html and tick
// "Don't count this device", or run localStorage.setItem('bf_no_track','1').
window.BFStats=(function(){
 const URL='https://shvwglpfpuogwadvspvz.supabase.co',KEY='sb_publishable_gNJCTsEc246ssSYoG5LqzQ_Hb5bnTnl';
 const EVENTS=new Set(['visit','game_start','game_end','queue_start','match_found','queue_end']);
 const GAMES=new Set(['dice','marble']),MODES=new Set(['local','computer','online_public','online_private']);
 const MAX_PER_PAGE=150;let sent=0,disabled=false,visitDone=false;
 const rid=n=>{let s='';const a='abcdefghijklmnopqrstuvwxyz0123456789';try{const b=crypto.getRandomValues(new Uint8Array(n));for(const x of b)s+=a[x%36]}catch(_){for(let i=0;i<n;i++)s+=a[Math.floor(Math.random()*36)]}return s};
 const store=(k,make,area)=>{try{const st=area||localStorage;let v=st.getItem(k);if(!v||!/^[a-z0-9]{8,40}$/.test(v)){v=make();st.setItem(k,v)}return v}catch(_){return make()}};
 function optedOut(){try{if(/[?&]notrack\b/.test(location.search))localStorage.setItem('bf_no_track','1');return localStorage.getItem('bf_no_track')==='1'}catch(_){return false}}
 function isBot(){try{return !!navigator.webdriver||/bot|crawl|spider|headless|preview|slurp|facebookexternalhit|whatsapp/i.test(navigator.userAgent||'')}catch(_){return false}}
 const offHost=()=>{const h=location.hostname;return !(location.protocol==='https:'||location.protocol==='http:')||h==='localhost'||h==='127.0.0.1'||h===''};
 let firstSeen=false;
 const visitor=(()=>{try{firstSeen=!localStorage.getItem('bf_vid')}catch(_){};return store('bf_vid',()=>rid(20))})();
 const session=store('bf_sid',()=>rid(16),(()=>{try{return sessionStorage}catch(_){return null}})());
 function device(){if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())return'app';return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent||'')||Math.min(screen.width||9999,innerWidth||9999)<700?'mobile':'desktop'}
 function page(){const p=location.pathname.replace(/\/+$/,'')||'/';return p==='/'||p==='/index.html'||p==='/verify-v2.html'?'dice':p==='/marble.html'?'marble':p==='/landing.html'?'landing':p.slice(0,40)}
 function refDomain(){try{const r=document.referrer?new window.URL(document.referrer).hostname:'';if(!r||r===location.hostname)return null;return r.replace(/^www\./,'').slice(0,100)}catch(_){return null}}
 function clean(props){const o={};for(const [k,v] of Object.entries(props||{})){if(typeof v==='number'&&isFinite(v))o[k.slice(0,24)]=Math.round(v);else if(typeof v==='boolean')o[k.slice(0,24)]=v;else if(typeof v==='string')o[k.slice(0,24)]=v.slice(0,40)}return o}
 function send(event,game,mode,props){
  try{
   if(disabled||/^\/stats/.test(location.pathname)||!EVENTS.has(event)||sent>=MAX_PER_PAGE||optedOut()||(isBot()&&!window.BF_STATS_ENDPOINT)||(offHost()&&!window.BF_STATS_ENDPOINT))return false;
   sent++;
   const body={visitor_id:visitor,session_id:session,event,game:GAMES.has(game)?game:null,mode:MODES.has(mode)?mode:null,page:page(),referrer:event==='visit'?refDomain():null,device:device(),props:clean(props)};
   const endpoint=(window.BF_STATS_ENDPOINT||URL)+'/rest/v1/bf_events';
   fetch(endpoint,{method:'POST',keepalive:true,headers:{apikey:KEY,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify(body)}).then(r=>{if(r.status===404||r.status===401||r.status===403)disabled=true}).catch(()=>{});
   return true;
  }catch(_){return false}
 }
 const games={};
 function start(game,mode,extra){const now=Date.now();games[game]={mode,at:now};return send('game_start',game,mode,extra)}
 function end(game,mode,extra){const g=games[game];delete games[game];const props=Object.assign({},extra||{});if(g&&g.mode===mode)props.seconds=Math.min(86400,(Date.now()-g.at)/1000);return send('game_end',game,mode,props)}
 function visit(){if(visitDone)return;visitDone=true;let utm=null;try{utm=new URLSearchParams(location.search).get('utm_source')}catch(_){}const p={first:firstSeen};if(utm)p.utm=utm;send('visit',null,null,p)}
 function localMode(players){const list=players||[];const humans=list.filter(p=>!p.ai).length;return list.some(p=>p.ai)?'computer':(humans>1?'local':'computer')}
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',visit);else visit();
 return{track:send,start,end,localMode,visitor:()=>visitor,optOut(v){try{v?localStorage.setItem('bf_no_track','1'):localStorage.removeItem('bf_no_track')}catch(_){}},get optedOut(){return optedOut()}};
})();
