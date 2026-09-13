import {currentWeek,mean,sum,matchPoints,standings} from './model.js';
import {getCurrentSeasonStats,summarizePlayerSessions} from './actual-season.js';

export const STATS_VERSION='1.0.0';
export const RATING_WEIGHTS={average:.45,consistency:.20,highGame:.10,highSeries:.10,lowGame:.10,aboveRate:.05};
export const STATS_FORMULAS={
 rating:'Qualified-league midrank percentiles (ties share a percentile; one bowler = 50; unavailable series component = 50). Weighted score = 45% average + 20% consistency + 10% high game + 10% high three-game series + 10% low game + 5% fraction of games strictly above own selected-period average. Final rating = 50 + games/(games+18) × (weighted score − 50). Category filters do not change league percentiles. Rating is descriptive, not a forecast.',
 consistency:'Sample standard deviation; lower is better. For rating only, variance is stabilized: ((games−1) × player variance + 12 × pooled within-player variance)/(games−1+12). Pooled variance uses all qualified bowlers; fallback variance is 900. No standard deviation for fewer than two games.',
 improvement:'Selected-period average minus recorded entering average; percent = 100 × difference / entering average. Missing entering averages stay unavailable; no model-default baseline is invented. Historical improvement uses the currently recorded entering average, not a reconstructed historical baseline.',
 trends:'Last 3/5 weeks use the last 3/5 completed league weeks (including gaps from absences), not the last appearances. Hot/cold = last-3-week average minus selected-period average. Biggest weekly gain compares consecutive recorded week numbers in the same season. Rolling three-game average spans consecutive real games within one season. 200+ streaks count consecutive real games; missed weeks do not break them.',
 series:'Only sessions containing exactly three real games count toward series records and series milestones. Four-game historical sessions still count toward individual game stats. Partial/invalid/explicit blind or absent sessions are excluded in full.',
 allPlay:'Each complete recorded week compares each team to every other team once using 2+2+2+3 points. Game ties split 1–1; series ties split 1.5–1.5. Matchup W/L/T is determined by points above/below/equal to 4.5. Rank by all-play point percentage, then points; exact ties share rank.',
 luck:'Expected points = sum of each week’s all-play points divided by that week’s eligible opponent count. Schedule luck = actual points − expected points. Positive means favorable matchups; negative means unfavorable matchups. Standing difference = actual rank − all-play rank; positive means stronger all-play standing.',
 scheduleStrength:'Mean season all-play point percentage of actual opponents, counting each meeting. Higher means a harder schedule. This is descriptive and updates as opponents play more weeks; it is not adjusted for circularity.',
 eligibility:'Default minimum is 1 game through two completed weeks and 9 thereafter; historical default is 9. Only recorded regular-season results are used. Incomplete, duplicate, or invalid all-play weeks are excluded as a whole with a visible warning. No simulated results are read.'
};
const validScores=(scores,max=300)=>Array.isArray(scores)&&scores.length>0&&scores.every(x=>Number.isInteger(x)&&x>=0&&x<=max);
const isReal=h=>!['blind','absent','vacant','non-bowled','simulated'].includes(String(h.type??h.scoreType??h.scoretype??'actual').toLowerCase())&&h.actual!==false&&!h.simulated;
export function recordedWeeks(state){const through=currentWeek(state);return state.results.filter(r=>Number.isInteger(r.week)&&r.week>=1&&r.week<=Math.min(34,through)&&isReal(r)).slice().sort((a,b)=>a.week-b.week);}
export function defaultMinimum(state,source='current'){return source==='current'?(currentWeek(state)>=3?9:1):9;}
export function historySeasons(state){return [...new Set(state.bowlers.flatMap(b=>(b.history||[]).map(h=>h.season).filter(s=>s&&s!==state.season)))].sort().reverse();}
export function getHistoricalSessions(b,source){
 return (b.history||[]).filter(h=>h.season===source&&isReal(h)&&validScores(h.scores)&&(h.ss==null||Number(h.ss)===sum(h.scores))).map(h=>({...h,scores:h.scores.slice()})).sort((a,b)=>String(a.date).localeCompare(String(b.date)));
}
export function categoryReadiness(state){
 const regularIds=state.teams.flatMap(t=>t.players),missing=regularIds.filter(id=>!['A','B','C'].includes(state.bowlers.find(b=>b.id===id)?.category));
 return {ready:regularIds.length>0&&missing.length===0,regularCount:regularIds.length,missing};
}
export function percentile(values,value,lower=false){if(values.length<=1)return 50;const less=values.filter(x=>x<value).length,equal=values.filter(x=>x===value).length;const p=100*(less+(equal-1)/2)/(values.length-1);return lower?100-p:p;}
export function calculateStats(state,{source='current',minimum=defaultMinimum(state,source),category='all'}={}){
 minimum=Number.isFinite(Number(minimum))?Math.max(1,Math.floor(Number(minimum))):defaultMinimum(state,source);
 const sessions=source==='current'?[]:state.bowlers.map(b=>getHistoricalSessions(b,source));
 const lastWeek=source==='current'?currentWeek(state):Math.max(0,...sessions.flatMap(s=>s.map(h=>Number.isInteger(h.week)?h.week:0)));
 const bowlers=state.bowlers.map((b,i)=>source==='current'?getCurrentSeasonStats(state,b.id):summarizePlayerSessions(b,sessions[i],lastWeek));
 const qualified=bowlers.filter(b=>b.games>=minimum),degrees=sum(qualified.map(b=>Math.max(0,b.games-1)));
 const pooledVariance=degrees?sum(qualified.map(b=>(b.variance??0)*Math.max(0,b.games-1)))/degrees:900;
 for(const b of qualified)b.stabilizedSD=Math.sqrt(((b.games-1)*(b.variance??0)+12*pooledVariance)/(b.games-1+12));
 const raw=(b,k)=>k==='consistency'?b.stabilizedSD:b[k];
 for(const b of qualified){
  b.components=Object.fromEntries(Object.keys(RATING_WEIGHTS).map(k=>[k,raw(b,k)===null?50:percentile(qualified.map(x=>raw(x,k)).filter(x=>x!==null),raw(b,k),k==='consistency')]));
  b.weightedRating=sum(Object.entries(RATING_WEIGHTS).map(([k,w])=>b.components[k]*w));b.reliability=b.games/(b.games+18);b.rating=50+b.reliability*(b.weightedRating-50);
 }
 const categories=categoryReadiness(state);
 const leaders=!categories.ready&&['A','B','C'].includes(category)?[]:qualified.filter(b=>category==='all'||b.category===category);
 return {version:STATS_VERSION,source,minimum,category,categories,lastWeek,pooledVariance,bowlers,qualified:leaders,qualifiedLeagueCount:qualified.length,excluded:bowlers.filter(b=>b.games>0&&b.games<minimum).length};
}
const record=()=>({w:0,l:0,t:0});
const outcome=(r,a,b)=>r[a>b?'w':a<b?'l':'t']++;
const count=r=>r.w+r.l+r.t;
function rank(rows){const sorted=rows.slice().sort((a,b)=>b.pointPct-a.pointPct||b.points-a.points||a.number-b.number);for(let i=0;i<sorted.length;i++)sorted[i].rank=i&&sorted[i].pointPct===sorted[i-1].pointPct&&sorted[i].points===sorted[i-1].points?sorted[i-1].rank:i+1;return sorted;}
const teamRow=t=>({number:t.number,name:t.name,record:record(),gameRecords:[record(),record(),record()],seriesRecord:record(),points:0,maxPoints:0,pointPct:null,actualPoints:0,expectedPoints:0,scheduleLuck:0,weeks:0});
export function calculateAllPlay(state){
 const issues=[],weeks=[],eligible=[],known=new Set(state.teams.map(t=>t.number)),seen=new Set();
 const recorded=recordedWeeks(state),counts=new Map();for(const r of recorded)counts.set(r.week,(counts.get(r.week)||0)+1);
 for(const r of state.results)if(!recorded.includes(r))issues.push(`Week ${r.week}: not a completed recorded regular-season week; excluded.`);
 for(const r of recorded){
  if(seen.has(r.week))continue;seen.add(r.week);
  const matches=r.matches||[],participants=matches.flatMap(m=>[m.teamA,m.teamB]);
  if(counts.get(r.week)!==1||participants.length!==known.size||new Set(participants).size!==known.size||!participants.every(n=>known.has(n))||!matches.every(m=>m.a?.length===3&&m.b?.length===3&&validScores(m.a,900)&&validScores(m.b,900))){issues.push(`Week ${r.week}: incomplete, duplicate, or invalid team scores; entire week excluded.`);continue;}
  const rows=state.teams.map(teamRow),map=new Map(rows.map(t=>[t.number,t]));
  for(const m of matches){const pts=matchPoints(m.a,m.b);[m.teamA,m.teamB].forEach((n,i)=>Object.assign(map.get(n),{scores:(i?m.b:m.a).slice(),opponent:i?m.teamA:m.teamB,actualPoints:pts[i],opponentPoints:pts[1-i],weeks:1}));}
  const comparisons=[];
  for(let i=0;i<rows.length;i++)for(let j=i+1;j<rows.length;j++){
   const a=rows[i],b=rows[j],pts=matchPoints(a.scores,b.scores);comparisons.push({teamA:a.number,teamB:b.number,a:pts[0],b:pts[1]});
   [a,b].forEach((t,k)=>{const other=k?a:b;t.points+=pts[k];outcome(t.record,pts[k],4.5);for(let g=0;g<3;g++)outcome(t.gameRecords[g],t.scores[g],other.scores[g]);outcome(t.seriesRecord,sum(t.scores),sum(other.scores));});
  }
  for(const t of rows){t.opponents=rows.length-1;t.maxPoints=t.opponents*9;t.pointPct=t.maxPoints?t.points/t.maxPoints:null;t.expectedPoints=t.opponents?t.points/t.opponents:0;t.scheduleLuck=t.actualPoints-t.expectedPoints;}
  weeks.push({week:r.week,date:r.date,teams:rank(rows),comparisons});eligible.push(r);
 }
 const rows=state.teams.map(teamRow),map=new Map(rows.map(t=>[t.number,t]));
 for(const w of weeks)for(const t of w.teams){const row=map.get(t.number);for(const k of ['points','maxPoints','actualPoints','expectedPoints','weeks'])row[k]+=t[k];for(const k of ['w','l','t']){row.record[k]+=t.record[k];row.seriesRecord[k]+=t.seriesRecord[k];for(let g=0;g<3;g++)row.gameRecords[g][k]+=t.gameRecords[g][k];}}
 const actual=standings({...state,results:eligible});
 for(const t of rows){t.pointPct=t.maxPoints?t.points/t.maxPoints:null;t.actualRank=weeks.length?actual.findIndex(a=>a.number===t.number)+1:null;t.scheduleLuck=t.actualPoints-t.expectedPoints;}
 const ranked=rank(rows);
 for(const t of ranked){if(!weeks.length)t.rank=null;t.standingDifference=t.actualRank===null?null:t.actualRank-t.rank;const opponents=weeks.map(w=>map.get(w.teams.find(r=>r.number===t.number).opponent)?.pointPct).filter(p=>p!==null&&p!==undefined);t.scheduleStrength=opponents.length?mean(opponents):null;}
 return {version:STATS_VERSION,weeks,teams:ranked,issues,eligibleWeeks:weeks.map(w=>w.week)};
}
export function analyticsChecks(state,stats,allPlay){
 const checks=[],check=(name,passed,detail)=>checks.push({name,status:passed?'pass':'fail',detail}),close=(a,b)=>Math.abs(a-b)<1e-7;
 check('All-play eligible completed weeks',!allPlay.issues.length,allPlay.issues.join(' ')||'All recorded weeks are complete; no simulations are read.');
 for(const w of allPlay.weeks){
  const n=w.teams.length-1;
  check(`All-play Week ${w.week} opponent coverage`,w.teams.every(t=>count(t.record)===n&&t.gameRecords.every(r=>count(r)===n)&&count(t.seriesRecord)===n),'Each team compares with every other eligible team once.');
  check(`All-play Week ${w.week} reconciliation`,w.teams.every(t=>close(t.points,sum(t.gameRecords.map(r=>2*r.w+r.t))+3*t.seriesRecord.w+1.5*t.seriesRecord.t)&&close(t.maxPoints,n*9))&&close(sum(w.teams.map(t=>t.points)),w.teams.length*n*4.5)&&w.comparisons.every(c=>close(c.a+c.b,9)),'Game/series records reconcile to points; every pair awards nine.');
  check(`All-play Week ${w.week} luck balances`,close(sum(w.teams.map(t=>t.scheduleLuck)),0),'Actual minus expected points sums to zero.');
  check(`All-play Week ${w.week} tie awards`,w.comparisons.every(c=>{const a=w.teams.find(t=>t.number===c.teamA).scores,b=w.teams.find(t=>t.number===c.teamB).scores;const points=sum(a.map((v,g)=>v===b[g]?1:v>b[g]?2:0))+(sum(a)===sum(b)?1.5:sum(a)>sum(b)?3:0);return close(c.a,points)&&close(c.b,9-points);}), 'Independent comparison: game ties award 1 each; series ties award 1.5 each.');
 }
 const completed=recordedWeeks(state),ids=new Set(state.bowlers.map(b=>b.id));
 check('Stats weekly player attribution',completed.every(r=>{const players=(r.matches||[]).flatMap(m=>m.players||[]);return new Set(players.map(p=>p.bowlerId)).size===players.length&&(r.matches||[]).every(m=>(m.players||[]).every(p=>ids.has(p.bowlerId)&&[m.teamA,m.teamB].includes(p.team)));}),'Weekly player IDs and weekly teams are used, never the replaced regular.');
 check('Stats real-game totals',stats.source!=='current'||stats.bowlers.every(b=>b.games===completed.flatMap(r=>(r.matches||[]).flatMap(m=>(m.players||[]).filter(p=>p.bowlerId===b.id&&p.type==='actual'&&isReal(p)&&[m.teamA,m.teamB].includes(p.team)&&p.scores?.length===3&&validScores(p.scores)).flatMap(p=>p.scores))).length),'Only explicitly actual weekly player scores count.');
 check('Stats minimum games',stats.qualified.every(b=>b.games>=stats.minimum),'All displayed qualified bowlers meet the selected minimum.');
 check('Stats rating bounds',stats.qualified.every(b=>Number.isFinite(b.rating)&&b.rating>=0&&b.rating<=100&&Object.values(b.components).every(x=>Number.isFinite(x)&&x>=0&&x<=100)),'Rating and all percentile components lie in [0,100].');
 check('All-play recorded-only scope',allPlay.weeks.every(w=>completed.some(r=>r.week===w.week)),'Only completed state.results are used, never simulation runs.');
 check('All-play season rollup',allPlay.teams.every(t=>{const weekly=allPlay.weeks.map(w=>w.teams.find(r=>r.number===t.number));return close(t.points,sum(weekly.map(r=>r.points)))&&close(t.maxPoints,sum(weekly.map(r=>r.maxPoints)))&&close(t.expectedPoints,sum(weekly.map(r=>r.expectedPoints)))&&['w','l','t'].every(k=>t.record[k]===sum(weekly.map(r=>r.record[k])));}), 'Season points, possible points, expected points and matchup records equal weekly totals.');
 return checks;
}
