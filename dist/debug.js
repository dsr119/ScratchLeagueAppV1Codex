import {MODEL_VERSION,currentWeek,profile,standings,matchPoints} from './model.js';
export function inputFingerprint(state){return JSON.stringify({teams:state.teams.map(t=>({number:t.number,players:t.players})),bowlers:state.bowlers.map(b=>({id:b.id,entering:b.entering,history:b.history})),results:state.results,adjustments:state.adjustments,thirdWinners:state.thirdWinners,schedule:state.schedule});}
export function createDebugReport(state,run,context={}){
 const checks=[],check=(name,passed,detail)=>checks.push({name,status:passed?'pass':'fail',detail});
 const close=(a,b)=>Number.isFinite(a)&&Math.abs(a-b)<1e-7;
 const ids=new Set(state.bowlers.map(b=>b.id)),numbers=new Set(state.teams.map(t=>t.number));
 check('Team identities',numbers.size===18&&state.teams.length===18,'18 unique team numbers expected');
 const lineup=state.teams.flatMap(t=>t.players);
 check('Regular lineups',lineup.length===54&&new Set(lineup).size===54&&state.teams.every(t=>t.players.length===3)&&lineup.every(id=>ids.has(id)),'54 distinct regulars, three per team');
 check('Completed week sequence',currentWeek(state)===state.results.length&&new Set(state.results.map(r=>r.week)).size===state.results.length,`${state.results.length} recorded weeks`);
 const scoreOK=s=>Array.isArray(s)&&s.length>0&&s.every(x=>Number.isInteger(x)&&x>=0&&x<=300);
 check('Historical scores',state.bowlers.every(b=>(b.history||[]).every(h=>scoreOK(h.scores))), 'Individual scores must be whole numbers from 0 to 300');
 check('Duplicate history sessions',state.bowlers.every(b=>new Set((b.history||[]).map(h=>h.season+'|'+h.date)).size===(b.history||[]).length),'Unique season/date per bowler');
 for(const r of state.results){
  const participants=r.matches.flatMap(m=>[m.teamA,m.teamB]);
  check(`Week ${r.week} teams`,participants.length===18&&new Set(participants).size===18&&participants.every(n=>numbers.has(n)),'Nine matches; each team exactly once');
  const players=r.matches.flatMap(m=>m.players||[]);
  check(`Week ${r.week} players`,players.length===54&&new Set(players.map(p=>p.bowlerId)).size===54&&players.every(p=>ids.has(p.bowlerId)&&p.scores?.length===3&&scoreOK(p.scores)&&['actual','blind'].includes(p.type)),'54 unique bowlers with three actual or blind scores');
  check(`Week ${r.week} team totals`,r.matches.every(m=>[m.teamA,m.teamB].every((n,i)=>{const p=(m.players||[]).filter(p=>p.team===n),total=i?m.b:m.a;return p.length===3&&total?.length===3&&total.every((v,g)=>v===p.reduce((a,p)=>a+(p.scores?.[g]??NaN),0));})),'Team totals must equal the three bowler scores');
  check(`Week ${r.week} points`,r.matches.every(m=>{try{return close(matchPoints(m.a,m.b).reduce((a,b)=>a+b,0),9);}catch{return false;}}),'Nine points awarded per matchup');
 }
 if(run){
  check('Run matches current inputs',run.fingerprint===inputFingerprint(state),'A failing check means rerun the simulation after changes');
  check('Run model version',run.modelVersion===MODEL_VERSION,`${run.modelVersion} / current ${MODEL_VERSION}`);
  check('Playoff probability total',close(run.teams.reduce((a,t)=>a+t.playoffs,0),7),'Sum must equal seven playoff places');
  check('Championship probability total',close(run.teams.reduce((a,t)=>a+t.champion,0),1),'Sum must equal one champion');
  check('Season point total',close(run.teams.reduce((a,t)=>a+t.points,0),34*81),'34 weeks × 9 matches × 9 points');
  check('Probability bounds',run.teams.every(t=>[t.playoffs,t.champion,...t.thirds,...t.seeds].every(x=>Number.isFinite(x)&&x>=0&&x<=1)),'All probabilities from zero to one');
  for(let i=0;i<3;i++){
   check(`Third ${i+1} winner total`,close(run.teams.reduce((a,t)=>a+t.thirds[i],0),1),'One winner per third');
   check(`Third ${i+1} points`,close(run.teams.reduce((a,t)=>a+(t.thirdPoints?.[i]??NaN),0),891),'11 weeks × 81 points');
  }
  check('Weekly projection coverage',run.weekly?.length===34,'34 regular-season weeks expected');
  for(const w of run.weekly||[]){
   check(`Forecast week ${w.week} points`,close(w.teams.reduce((a,t)=>a+t.points,0),81),'81 total points');
   check(`Forecast week ${w.week} opponents`,w.teams.every(t=>close(t.opponents.reduce((a,o)=>a+o.probability,0),1)&&t.opponents.every(o=>o.number!==t.number&&numbers.has(o.number))),'Opponent probabilities sum to one for each team');
   check(`Forecast week ${w.week} outcomes`,w.teams.every(t=>t.win>=0&&t.tie>=0&&t.win+t.tie<=1+1e-9&&t.points>=0&&t.points<=9),'Valid week win/tie probabilities and expected points');
  }
 }
 const ratings=state.bowlers.map(b=>({id:b.id,name:b.name,team:b.team,...profile(state,b)}));
 // Only explicit operational fields: never serialize the cloud client, session storage,
 // cookies, credentials, or the Supabase auth response.
 const runtime={unsavedChanges:!!context.unsavedChanges,revision:context.revision??null,signedIn:!!context.signedIn,cloudReady:!!context.cloudReady,currentError:context.currentError||'',browser:context.browser||'',view:context.view||''};
 const workspace=structuredClone({version:state.version,season:state.season,teams:state.teams,bowlers:state.bowlers,schedule:state.schedule,results:state.results,adjustments:state.adjustments,thirdWinners:state.thirdWinners,imports:state.imports,dataReview:state.dataReview});
 return {reportVersion:1,generatedAt:new Date().toISOString(),modelVersion:MODEL_VERSION,runtime,summary:{completedWeeks:currentWeek(state),historicalGames:ratings.reduce((a,b)=>a+b.priorGames,0),currentActualGames:ratings.reduce((a,b)=>a+b.currentGames,0),failedChecks:checks.filter(c=>c.status==='fail').length,hasSimulation:!!run},checks,ratings,standings:standings(state),workspace,selectedSimulation:run?structuredClone(run):null,runHistory:state.runs.map(r=>({id:r.id,createdAt:r.createdAt,modelVersion:r.modelVersion,completedWeeks:r.completedWeeks,iterations:r.iterations,seed:r.seed,adjustments:r.adjustments,teams:r.teams})),limitations:['Checks identify structural and arithmetic problems; they do not prove forecast accuracy.','No live Supabase server inspection is performed by this download.','Weekly odds cover regular-season matchups. Historical odds are retained runs, not reconstructed forecasts.']};
}
