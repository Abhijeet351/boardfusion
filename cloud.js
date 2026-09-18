// BoardFusion cloud identity + real leaderboard via Supabase.
window.BFCloud=(function(){
 const URL='https://shvwglpfpuogwadvspvz.supabase.co', KEY='sb_publishable_gNJCTsEc246ssSYoG5LqzQ_Hb5bnTnl';let token=null,user=null;
 const req=async(path,opt={})=>{const h=Object.assign({'apikey':KEY,'Content-Type':'application/json'},opt.headers||{});if(token)h.Authorization='Bearer '+token;const r=await fetch(URL+path,Object.assign({},opt,{headers:h}));const text=await r.text();let data;try{data=JSON.parse(text)}catch(_){data=text}if(!r.ok)throw Error(data.msg||data.message||data.error_description||String(data));return data};
 const load=()=>{try{const x=JSON.parse(localStorage.getItem('bf_cloud_session')||'null');if(x&&x.expires_at>Date.now()/1000){token=x.access_token;user=x.user;}}catch(_){}};
 const save=x=>{token=x.access_token;user=x.user;localStorage.setItem('bf_cloud_session',JSON.stringify(x));};
 async function signIn(email,password){const x=await req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});save(x);return x;}
 async function signUp(email,password,name){const x=await req('/auth/v1/signup',{method:'POST',body:JSON.stringify({email,password,data:{display_name:name}})});if(x.access_token)save(x);return x;}
 async function signOut(){if(token)try{await req('/auth/v1/logout',{method:'POST'})}catch(_){}token=null;user=null;localStorage.removeItem('bf_cloud_session');}
 async function leaderboard(){return req('/rest/v1/rpc/get_leaderboard',{method:'POST',body:JSON.stringify({result_limit:50})});}
 async function recordWin(game){if(!token) return {skipped:true};const id=(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random());const r=await fetch('/api/result',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},body:JSON.stringify({event_id:id,game,winner:true})});const d=await r.json();if(!r.ok)throw Error(d.error||'Score update failed');return d;}
 async function rename(display_name){if(!user)throw Error('Sign in first');return req('/rest/v1/profiles?id=eq.'+encodeURIComponent(user.id),{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({display_name})});}
 load();return{signIn,signUp,signOut,leaderboard,rename,recordWin,get user(){return user}};
})();
