// Actual season statistics have no dependency on profile(), prediction models or history.
const sum=a=>a.reduce((n,v)=>n+v,0),mean=a=>a.length?sum(a)/a.length:0;
const realResult=r=>r.actual!==false&&!r.simulated&&r.type!=='simulated';
export function getCurrentSeasonSessions(state,bowlerId){
 const sessions=[],seen=new Set();
 for(const r of (state.results||[]).slice().sort((a,b)=>a.week-b.week)){
  if(!Number.isInteger(r.week)||r.week<1||r.week>34||!realResult(r))continue;
  for(const m of r.matches||[])for(const p of m.players||[]){
   if(p.bowlerId!==bowlerId)continue;
   const key=r.week+'|'+bowlerId;
   if(seen.has(key))throw Error(`Duplicate player session for ${bowlerId} in Week ${r.week}. Correct the imported week.`);
   seen.add(key);
   if(p.type!=='actual'||p.actual===false||p.simulated)continue;
   if(p.week!=null&&p.week!==r.week)throw Error(`Player week differs from result week for ${bowlerId}.`);
   if(![m.teamA,m.teamB].includes(p.team))throw Error(`Weekly team does not belong to the matchup for ${bowlerId}.`);
   if(!Array.isArray(p.scores)||p.scores.length!==3||p.scores.some(g=>!Number.isInteger(g)||g<0||g>300))throw Error(`Invalid three-game actual session for ${bowlerId} in Week ${r.week}.`);
   sessions.push({bowlerId,week:r.week,team:p.team,date:r.date,season:state.season,scores:p.scores.slice(),series:sum(p.scores)});
  }
 }
 return sessions;
}
export function getCurrentSeasonStats(state,bowlerId){
 const bowler=state.bowlers.find(b=>b.id===bowlerId);
 if(!bowler)throw Error('Unknown bowler ID: '+bowlerId);
 const lastWeek=Math.max(0,...(state.results||[]).filter(r=>Number.isInteger(r.week)&&r.week>=1&&r.week<=34&&realResult(r)).map(r=>r.week));
 return summarizePlayerSessions(bowler,getCurrentSeasonSessions(state,bowlerId),lastWeek);
}
export function actualSeasonAudit(state){
 const checks=[],check=(name,passed,detail)=>checks.push({name,status:passed?'pass':'fail',detail});
 const ids=new Set(state.bowlers.map(b=>b.id)),expected=state.teams.reduce((n,t)=>n+t.players.length,0);
 const actualSeasonPlayerStats=state.bowlers.map(b=>{try{return {...getCurrentSeasonStats(state,b.id),category:b.category??null};}catch(e){return {bowlerId:b.id,id:b.id,name:b.name,category:b.category??null,games:null,totalPins:null,average:null,highGame:null,lowGame:null,highSeries:null,lowSeries:null,weeklySessions:[],error:e.message};}});
 check('Actual stats unique bowler IDs',ids.size===state.bowlers.length,'Statistical identity is bowlerId, never a display name.');
 for(const r of state.results){
  const players=(r.matches||[]).flatMap(m=>m.players||[]),keys=players.map(p=>r.week+'|'+p.bowlerId);
  check(`Actual Week ${r.week} player count`,players.length===expected,`${players.length} / ${expected} player rows; three per team in the current league.`);
  check(`Actual Week ${r.week} games occur once`,new Set(keys).size===keys.length&&state.results.filter(x=>x.week===r.week).length===1,'One bowler session per week; each game index occurs exactly once.');
  check(`Actual Week ${r.week} player identities`,players.every(p=>ids.has(p.bowlerId)&&(p.week==null||p.week===r.week)), 'Every player ID exists and player week matches its result.');
  check(`Actual Week ${r.week} team totals`,(r.matches||[]).every(m=>[m.teamA,m.teamB].every((team,i)=>{const p=(m.players||[]).filter(p=>p.team===team),totals=i?m.b:m.a;return p.length===3&&Array.isArray(totals)&&totals.length===3&&totals.every((v,g)=>v===p.reduce((n,x)=>n+(x.scores?.[g]??NaN),0));})), 'All three player scores, including official blinds, equal each team game total.');
 }
 check('Actual stats valid sessions',actualSeasonPlayerStats.every(b=>!b.error),actualSeasonPlayerStats.filter(b=>b.error).map(b=>b.error).join(' ')||'All actual sessions have three valid games and the correct weekly team.');
 check('Actual average and series arithmetic',actualSeasonPlayerStats.every(b=>!b.error&&b.totalPins===sum(b.weeklySessions.flatMap(s=>s.scores))&&b.games===b.weeklySessions.length*3&&b.average===(b.games?b.totalPins/b.games:null)&&b.highSeries===(b.weeklySessions.length?Math.max(...b.weeklySessions.map(s=>sum(s.scores))):null)), 'Average = actual totalPins / games; high series = maximum real weekly three-game total.');
 const altered={...state,bowlers:state.bowlers.map(b=>({...b,history:[{scores:[300,300,300],week:99}],entering:300}))};
 check('Actual stats isolated from history and model',actualSeasonPlayerStats.every(b=>{if(b.error)return false;const a=getCurrentSeasonStats(altered,b.bowlerId);return ['games','totalPins','average','highGame','lowGame','highSeries','lowSeries','sd','g300','s750'].every(k=>a[k]===b[k]);}), 'Replacing history/entering averages cannot change actual scoring metrics.');
 const withoutBlinds={...state,results:state.results.map(r=>({...r,matches:(r.matches||[]).map(m=>({...m,players:(m.players||[]).filter(p=>p.type==='actual')}))}))};
 check('Actual stats exclude blinds',actualSeasonPlayerStats.every(b=>!b.error&&JSON.stringify(getCurrentSeasonSessions(withoutBlinds,b.bowlerId))===JSON.stringify(b.weeklySessions)), 'Removing blind/absent rows cannot change individual actual sessions.');
 const week3=state.results.filter(r=>r.week===3),players=week3.flatMap(r=>(r.matches||[]).flatMap(m=>m.players||[]));
 const week3Audit={present:week3.length===1,playerRows:players.length,teamCount:new Set(players.map(p=>p.team)).size,bowlerIdsUnique:new Set(players.map(p=>p.bowlerId)).size===players.length,substitutes:players.filter(p=>!state.teams.find(t=>t.number===p.team)?.players.includes(p.bowlerId)).map(p=>({bowlerId:p.bowlerId,name:state.bowlers.find(b=>b.id===p.bowlerId)?.name??null,exists:ids.has(p.bowlerId),team:p.team,scores:p.scores,type:p.type}))};
 return {actualSeasonPlayerStats,checks,week3:week3Audit};
}
const variance=s=>s.length>1?sum(s.map(v=>(v-mean(s))**2))/(s.length-1):null;
const maxOrNull=a=>a.length?Math.max(...a):null;
export function summarizePlayerSessions(b,sessions,lastWeek){
 const games=sessions.flatMap(s=>s.scores),n=games.length,average=n?mean(games):null,sorted=games.slice().sort((a,b)=>a-b);
 const series=sessions.filter(s=>s.scores.length===3).map(s=>sum(s.scores));
 const recent=k=>sessions.filter(s=>Number.isInteger(s.week)&&s.week>lastWeek-k&&s.week<=lastWeek).flatMap(s=>s.scores);
 const recent3=recent(3),recent5=recent(5),last3=recent3.length?mean(recent3):null,last5=recent5.length?mean(recent5):null;
 let bestRolling3=null,streak=0,longest200=0;
 for(let i=0;i<n;i++){streak=games[i]>=200?streak+1:0;longest200=Math.max(longest200,streak);if(i>=2)bestRolling3=Math.max(bestRolling3??0,mean(games.slice(i-2,i+1)));}
 const weekly=new Map();for(const s of sessions){if(!Number.isInteger(s.week))continue;const a=weekly.get(s.week)||[];a.push(...s.scores);weekly.set(s.week,a);}
 const gains=[...weekly].filter(([w])=>weekly.has(w-1)).map(([w,g])=>mean(g)-mean(weekly.get(w-1)));
 const entering=Number.isFinite(b.entering)?b.entering:null,improvement=average!==null&&entering!==null?average-entering:null;
 const v=variance(games),above=n?games.filter(g=>g>average).length:0;
 return {bowlerId:b.id,id:b.id,totalPins:sum(games),name:b.name,category:['A','B','C'].includes(b.category)?b.category:'Unassigned',team:b.team,entering,games:n,average,improvement,improvementPct:improvement!==null&&entering>0?improvement/entering*100:null,
 highGame:maxOrNull(games),lowGame:n?Math.min(...games):null,highSeries:maxOrNull(series),lowSeries:series.length?Math.min(...series):null,averageSeries:series.length?mean(series):null,seriesCount:series.length,variance:v,sd:v===null?null:Math.sqrt(v),median:n?(sorted[Math.floor((n-1)/2)]+sorted[Math.floor(n/2)])/2:null,
 last3,last5,last3Games:recent3.length,last5Games:recent5.length,trend:last3===null?null:last3-average,biggestGain:maxOrNull(gains),bestRolling3,longest200,above,aboveRate:n?above/n:0,
 ...Object.fromEntries([200,225,250,275,300].map(t=>['g'+t,games.filter(g=>g>=t).length])),...Object.fromEntries([600,650,700,750].map(t=>['s'+t,series.filter(g=>g>=t).length])),weeklySessions:sessions,sessions};
}
