const URL='https://dnyuphrlxkbjifqnnydg.supabase.co';
const KEY='sb_publishable_g76inuI-LNetYfFUdq998g_LHsdivs9';
let session=null;
let lastRead=null;
export function sameWorkspace(a,b){
 const ordered=v=>Array.isArray(v)?v.map(ordered):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])])):v;
 return JSON.stringify(ordered(a))===JSON.stringify(ordered(b));
}
function recordRead(data){
 if(!data){lastRead={source:'Supabase read',readAt:new Date().toISOString(),workspacePresent:false};return;}
 const s=data.state,week3=(s.results||[]).filter(r=>r.week===3),players=week3.flatMap(r=>(r.matches||[]).flatMap(m=>m.players||[]));
 lastRead={source:'Supabase read',readAt:new Date().toISOString(),workspacePresent:true,revision:data.revision,weeks:(s.results||[]).map(r=>r.week),week3:{entries:week3.length,playerRows:players.length,teamCount:new Set(players.map(p=>p.team)).size,bowlerIdsUnique:new Set(players.map(p=>p.bowlerId)).size===players.length,allBowlersPersisted:players.every(p=>s.bowlers.some(b=>b.id===p.bowlerId)),substitutes:players.filter(p=>!s.teams.find(t=>t.number===p.team)?.players.includes(p.bowlerId)).map(p=>({bowlerId:p.bowlerId,name:s.bowlers.find(b=>b.id===p.bowlerId)?.name??null,team:p.team}))}};
}
try{session=JSON.parse(sessionStorage.getItem('scratch-auth')||'null');}catch{}
function remember(s){session=s;try{if(s)sessionStorage.setItem('scratch-auth',JSON.stringify(s));else sessionStorage.removeItem('scratch-auth');}catch{}}
async function request(path,options={}){
 const response=await fetch(URL+path,{...options,headers:{apikey:KEY,'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session.access_token}:{}),...options.headers}});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={message:text};}
 if(!response.ok){const msg=data.message||data.msg||data.error_description||'Could not reach the league database.';throw Error(msg.includes('schema cache')?'Database setup is not complete. Open Setup for the SQL scripts.':msg);}
 return data;
}
async function refresh(){if(!session)throw Error('Sign in to save the league.');if(Date.now()/1000>(session.expires_at||0)-60){const s=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session.refresh_token})});remember({...s,expires_at:Date.now()/1000+s.expires_in});}}
export const cloud={
 get verification(){return lastRead?structuredClone(lastRead):null;},
 get email(){return session?.user?.email||null;},
 async login(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});remember({...s,expires_at:Date.now()/1000+s.expires_in});},
 async logout(){try{await request('/auth/v1/logout',{method:'POST'});}finally{remember(null);lastRead=null;}},
 async load(){await refresh();const allowed=await request('/rest/v1/app_admins?select=user_id');if(!allowed.length)throw Error('This account needs league administrator access. Follow Setup step 3.');const data=await request('/rest/v1/league_workspaces?id=eq.2026-2027&select=state,revision');recordRead(data[0]);return data[0]||null;},
 async save(state,revision){await refresh();const next=await request('/rest/v1/rpc/save_league_workspace',{method:'POST',body:JSON.stringify({p_state:state,p_revision:revision})});
  const saved=await this.load();
  if(!saved||saved.revision!==next||!sameWorkspace(saved.state,state))throw Error('Save was sent, but read-back did not match. Reload the saved league before retrying.');
  lastRead.verifiedSave=true;return next;
 }
};
