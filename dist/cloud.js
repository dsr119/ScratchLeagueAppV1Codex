const URL='https://dnyuphrlxkbjifqnnydg.supabase.co';
const KEY='sb_publishable_g76inuI-LNetYfFUdq998g_LHsdivs9';
let session=null;
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
 get email(){return session?.user?.email||null;},
 async login(email,password){const s=await request('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})});remember({...s,expires_at:Date.now()/1000+s.expires_in});},
 async logout(){try{await request('/auth/v1/logout',{method:'POST'});}finally{remember(null);}},
 async load(){await refresh();const allowed=await request('/rest/v1/app_admins?select=user_id');if(!allowed.length)throw Error('This account needs league administrator access. Follow Setup step 3.');const data=await request('/rest/v1/league_workspaces?id=eq.2026-2027&select=state,revision');return data[0]||null;},
 async save(state,revision){await refresh();return request('/rest/v1/rpc/save_league_workspace',{method:'POST',body:JSON.stringify({p_state:state,p_revision:revision})});}
};
