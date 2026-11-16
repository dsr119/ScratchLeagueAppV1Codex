// Results for a window of recorded weeks ("last X weeks"). Reads recorded results only:
// no simulations, no history, no model. Team numbers use official team totals (blinds included);
// individual numbers use actual games only, the same rules as the Stats page.
import {currentWeek,matchPoints,sum,mean} from './model.js';

const realResult=r=>Number.isInteger(r.week)&&r.week>=1&&r.week<=34&&r.actual!==false&&!r.simulated&&r.type!=='simulated';
const isActual=p=>p.type==='actual'&&p.actual!==false&&!p.simulated&&Array.isArray(p.scores)&&p.scores.length===3;
const maxOrNull=a=>a.length?Math.max(...a):null;

export function windowRange(state,{weeks=4,through=null}={}){
 const last=currentWeek(state);
 if(!last)return {start:0,end:0,weeks:0,last};
 const end=Math.max(1,Math.min(last,Number.isInteger(Number(through))&&Number(through)>0?Number(through):last));
 const size=Math.max(1,Math.min(end,Number.isInteger(Number(weeks))&&Number(weeks)>0?Number(weeks):end));
 return {start:end-size+1,end,weeks:size,last};
}

function rankRows(rows){
 // Same order as official standings: points, then team average, then team number.
 const sorted=rows.slice().sort((a,b)=>b.points-a.points||b.average-a.average||a.number-b.number);
 sorted.forEach((r,i)=>{r.rank=i+1;});
 return sorted;
}

export function calculateWindow(state,options={}){
 const range=windowRange(state,options);
 const results=(state.results||[]).filter(realResult).filter(r=>r.week<=range.end).slice().sort((a,b)=>a.week-b.week);
 const inWindow=r=>r.week>=range.start&&r.week<=range.end;
 const weeks=results.filter(inWindow).map(r=>({week:r.week,date:r.date||null}));
 const teamName=n=>state.teams.find(t=>t.number===n)?.name||'Team '+n;
 const regularTeam=new Map(state.teams.flatMap(t=>t.players.map(id=>[id,t.number])));
 const bowlerById=new Map(state.bowlers.map(b=>[b.id,b]));

 const blankTeam=n=>({number:n,name:teamName(n),points:0,weeksPlayed:0,w:0,l:0,t:0,gamesWon:0,seriesWon:0,pins:0,games:0,highGame:null,highSeries:null,
  allPlayPoints:0,allPlayMax:0,expectedPoints:0,weekly:{},bestWeek:null,worstWeek:null});
 const win=new Map(state.teams.map(t=>[t.number,blankTeam(t.number)]));
 const season=new Map(state.teams.map(t=>[t.number,blankTeam(t.number)]));
 const before=new Map(state.teams.map(t=>[t.number,{pins:0,games:0}]));
 const teamGames=[],teamSeries=[],bowlerGames=[],bowlerSeries=[];
 const sessions=new Map(); // bowlerId -> [{week,team,scores,series,teamPoints}]

 for(const r of results){
  const inside=inWindow(r),weekTeams=[];
  for(const m of r.matches||[]){
   if(!Array.isArray(m.a)||!Array.isArray(m.b)||m.a.length!==3||m.b.length!==3)continue;
   const pts=matchPoints(m.a,m.b);
   [[m.teamA,m.a,m.teamB,m.b,pts[0],pts[1]],[m.teamB,m.b,m.teamA,m.a,pts[1],pts[0]]].forEach(([n,mine,opp,theirs,p,op])=>{
    const s=season.get(n);if(!s)return;
    const series=sum(mine);
    s.points+=p;s.pins+=series;s.games+=3;
    if(!inside){const b=before.get(n);b.pins+=series;b.games+=3;return;}
    const t=win.get(n);
    t.points+=p;t.weeksPlayed++;t.pins+=series;t.games+=3;
    if(p>4.5)t.w++;else if(p<4.5)t.l++;else t.t++;
    for(let g=0;g<3;g++)t.gamesWon+=mine[g]>theirs[g]?1:mine[g]===theirs[g]?.5:0;
    t.seriesWon+=series>sum(theirs)?1:series===sum(theirs)?.5:0;
    t.highGame=Math.max(t.highGame??0,...mine);t.highSeries=Math.max(t.highSeries??0,series);
    t.weekly[r.week]={points:p,opponent:opp,opponentPoints:op,series,games:mine.slice()};
    if(!t.bestWeek||p>t.bestWeek.points||(p===t.bestWeek.points&&series>t.bestWeek.series))t.bestWeek={week:r.week,points:p,series};
    if(!t.worstWeek||p<t.worstWeek.points||(p===t.worstWeek.points&&series<t.worstWeek.series))t.worstWeek={week:r.week,points:p,series};
    mine.forEach((score,g)=>teamGames.push({number:n,name:teamName(n),week:r.week,game:g+1,score}));
    teamSeries.push({number:n,name:teamName(n),week:r.week,score:series});
    weekTeams.push({number:n,scores:mine});
   });
   if(!inside)continue;
   const pts2=Object.fromEntries([[m.teamA,pts[0]],[m.teamB,pts[1]]]);
   for(const p of m.players||[]){
    if(!isActual(p)||![m.teamA,m.teamB].includes(p.team))continue;
    const series=sum(p.scores),list=sessions.get(p.bowlerId)||[];
    list.push({week:r.week,team:p.team,scores:p.scores.slice(),series,teamPoints:pts2[p.team]});
    sessions.set(p.bowlerId,list);
    const name=bowlerById.get(p.bowlerId)?.name||'Unknown bowler';
    p.scores.forEach((score,g)=>bowlerGames.push({id:p.bowlerId,name,team:p.team,week:r.week,game:g+1,score}));
    bowlerSeries.push({id:p.bowlerId,name,team:p.team,week:r.week,score:series,scores:p.scores.slice()});
   }
  }
  // All-play: each team against every other team that bowled this week, 9 points per virtual match.
  if(inside&&weekTeams.length>1){
   for(const x of weekTeams){
    let total=0;
    for(const y of weekTeams)if(y!==x)total+=matchPoints(x.scores,y.scores)[0];
    const t=win.get(x.number);
    t.allPlayPoints+=total;t.allPlayMax+=9*(weekTeams.length-1);t.expectedPoints+=total/(weekTeams.length-1);
   }
  }
 }

 const seasonRanked=rankRows([...season.values()].map(t=>({...t,average:t.games?t.pins/t.games:0})));
 const seasonRank=new Map(seasonRanked.map(t=>[t.number,t.rank]));
 const teams=rankRows([...win.values()].map(t=>{
  const average=t.games?t.pins/t.games:0,b=before.get(t.number),beforeAverage=b.games?b.pins/b.games:null,s=season.get(t.number);
  return {...t,average,pointsPerWeek:t.weeksPlayed?t.points/t.weeksPlayed:null,pointPct:t.weeksPlayed?t.points/(9*t.weeksPlayed):null,
   allPlayPct:t.allPlayMax?t.allPlayPoints/t.allPlayMax:null,luck:t.weeksPlayed?t.points-t.expectedPoints:null,
   seasonPoints:s.points,seasonAverage:s.games?s.pins/s.games:null,beforeAverage,averageChange:beforeAverage==null||!t.games?null:average-beforeAverage,
   seasonRank:seasonRank.get(t.number)};
 }));
 teams.forEach(t=>{t.rankChange=t.seasonRank-t.rank;});

 // Season-to-date actual games through the window's last week, for comparison.
 const seasonGames=new Map(),beforeGames=new Map();
 for(const r of results)for(const m of r.matches||[])for(const p of m.players||[]){
  if(!isActual(p))continue;
  (seasonGames.get(p.bowlerId)||seasonGames.set(p.bowlerId,[]).get(p.bowlerId)).push(...p.scores);
  if(r.week<range.start)(beforeGames.get(p.bowlerId)||beforeGames.set(p.bowlerId,[]).get(p.bowlerId)).push(...p.scores);
 }
 const bowlers=[...sessions].map(([id,list])=>{
  const b=bowlerById.get(id),games=list.flatMap(s=>s.scores),series=list.map(s=>s.series),average=mean(games);
  const all=seasonGames.get(id)||[],prior=beforeGames.get(id)||[],priorAverage=prior.length?mean(prior):null;
  const entering=Number.isFinite(b?.entering)?b.entering:null,home=regularTeam.get(id)??null;
  const teamsBowled=[...new Set(list.map(s=>s.team))];
  const sd=games.length>1?Math.sqrt(sum(games.map(g=>(g-average)**2))/(games.length-1)):null;
  const firstHalf=list.slice(0,Math.floor(list.length/2)).flatMap(s=>s.scores),secondHalf=list.slice(Math.ceil(list.length/2)).flatMap(s=>s.scores);
  return {id,name:b?.name||'Unknown bowler',category:['A','B','C'].includes(b?.category)?b.category:null,regularTeam:home,substitute:home==null,teams:teamsBowled,teamLabel:teamsBowled.map(teamName).join(', '),
   weeks:list.length,games:games.length,pins:sum(games),average,seasonAverage:all.length?mean(all):null,seasonGames:all.length,
   priorAverage,change:priorAverage==null?null:average-priorAverage,entering,vsEntering:entering==null?null:average-entering,
   highGame:maxOrNull(games),lowGame:games.length?Math.min(...games):null,highSeries:maxOrNull(series),lowSeries:series.length?Math.min(...series):null,
   sd,g200:games.filter(g=>g>=200).length,g250:games.filter(g=>g>=250).length,s600:series.filter(s=>s>=600).length,s700:series.filter(s=>s>=700).length,
   teamPoints:sum(list.map(s=>s.teamPoints)),teamPointsPerWeek:list.length?sum(list.map(s=>s.teamPoints))/list.length:null,
   trend:firstHalf.length&&secondHalf.length?mean(secondHalf)-mean(firstHalf):null,
   weekly:Object.fromEntries(list.map(s=>[s.week,s]))};
 });

 const top=(rows,k=10)=>rows.slice().sort((a,b)=>b.score-a.score||a.week-b.week||String(a.name).localeCompare(String(b.name))).slice(0,k);
 const leagueGames=bowlerGames.map(g=>g.score),teamTotals=teams.filter(t=>t.games);
 return {range:{...range,weeks:weeks.length},weeks,teams,bowlers,
  leaders:{bowlerGames:top(bowlerGames,60),bowlerSeries:top(bowlerSeries,60),teamGames:top(teamGames,5),teamSeries:top(teamSeries,5)},
  league:{average:leagueGames.length?mean(leagueGames):null,games:leagueGames.length,g200:leagueGames.filter(g=>g>=200).length,
   g300:leagueGames.filter(g=>g===300).length,s700:bowlerSeries.filter(s=>s.score>=700).length,bowlers:bowlers.length,
   teamAverage:teamTotals.length?sum(teamTotals.map(t=>t.pins))/sum(teamTotals.map(t=>t.games)):null}};
}
