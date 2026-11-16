import {calculateWindow,windowRange} from './window-stats.js';
import {table,C,sortAnalytics} from './stats-ui.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=1)=>v==null?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:d});
const pct=v=>v==null?'—':num(v*100)+'%';
const signed=v=>v==null?'—':(v>0?'+':'')+num(v);
const record=r=>`${r.w}-${r.l}-${r.t}`;
const option=(v,label,current)=>`<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(label)}</option>`;
const panel=(title,body,note='')=>`<section class="panel analytics"><div class="panel-head"><h2>${esc(title)}</h2>${note?`<span class="fine muted">${note}</span>`:''}</div>${body}</section>`;
const player=b=>`<button class="text-button" data-stats-player="${esc(b.id)}">${esc(b.name)}</button>`;
const team=t=>`<button class="text-button" data-team-allplay="${t.number}">${t.number} · ${esc(t.name)}</button>`;
const move=v=>v==null||v===0?'<span class="muted">—</span>':v>0?`<span class="window-up">▲ ${v}</span>`:`<span class="window-down">▼ ${-v}</span>`;
const shortDate=d=>{if(!d)return '';const [y,m,day]=String(d).split('-').map(Number);return y&&m&&day?new Date(y,m-1,day).toLocaleDateString('en-US',{month:'short',day:'numeric'}):esc(d);};

export function defaultWindowMinimum(weeks){return 3*Math.max(1,Math.ceil(weeks/2));}

function cards(items){
 return `<div class="metrics window-metrics">${items.map(([label,value,foot])=>`<div class="metric"><div class="label">${esc(label)}</div><div class="value">${value}</div><div class="foot">${foot}</div></div>`).join('')}</div>`;
}
function leader(rows,key,lower=false){
 const valid=rows.filter(r=>r[key]!=null);if(!valid.length)return null;
 const best=sortAnalytics(valid,key,lower?'asc':'desc')[0];
 return {row:best,tied:valid.filter(r=>r[key]===best[key]).length};
}
function list(title,rows,format){
 return `<div class="window-list"><h3>${esc(title)}</h3>${rows.length?`<ol>${rows.map(r=>`<li>${format(r)}</li>`).join('')}</ol>`:'<p class="fine muted">Not enough games yet.</p>'}</div>`;
}

export function windowView(state,settings){
 try{return renderWindowView(state,settings);}catch(e){return panel('Results unavailable',`<div class="notice error" role="alert">${esc(e.message)}</div>`);}
}

function renderWindowView(state,settings){
 const range=windowRange(state,settings);
 if(!range.last)return `<div class="page-head"><div><h1>Last X weeks</h1><p>Results for a stretch of recent weeks.</p></div></div><div class="empty"><h3>No weeks recorded yet</h3><p>Import a week of scores to see results here.</p></div>`;
 const data=calculateWindow(state,settings),weeks=data.weeks,who=settings.who||'all';
 const minimum=Number.isInteger(settings.minimum)&&settings.minimum>0?settings.minimum:defaultWindowMinimum(range.weeks);
 const shown=data.bowlers.filter(b=>who==='all'||(who==='regulars'?!b.substitute:b.substitute));
 const qualified=shown.filter(b=>b.games>=minimum);
 const inShown=r=>who==='all'||shown.some(b=>b.id===r.id);
 const filteredGames=data.leaders.bowlerGames.filter(inShown),series=data.leaders.bowlerSeries.filter(inShown);
 const teamName=n=>state.teams.find(t=>t.number===n)?.name||'Team '+n;
 const label=range.weeks===1?`Week ${range.start}`:`Weeks ${range.start}–${range.end}`;
 const dates=weeks.length?`${shortDate(weeks[0].date)}${weeks.length>1?' – '+shortDate(weeks.at(-1).date):''}`:'';

 // Controls
 const presets=[...new Set([3,4,6,8,range.end])].filter(n=>n<=range.end).sort((a,b)=>a-b);
 const controls=panel('Choose the weeks',`<div class="panel-body tab-pills">${presets.map(n=>`<button data-window-weeks="${n}" class="${n===range.weeks?'active':''}" aria-pressed="${n===range.weeks}">${n===range.end&&range.end===range.last?'All '+n+' weeks':'Last '+n}</button>`).join('')}</div><div class="panel-body controls">
  <label>Show the last<select data-window-setting="weeks">${Array.from({length:range.end},(_,i)=>option(i+1,i+1===1?'1 week':(i+1)+' weeks',range.weeks)).join('')}</select></label>
  <label>Ending with<select data-window-setting="through">${Array.from({length:range.last},(_,i)=>{const w=range.last-i,d=state.results.find(r=>r.week===w)?.date;return option(w,`Week ${w}${d?' · '+shortDate(d):''}${w===range.last?' (latest)':''}`,range.end);}).join('')}</select></label>
  <label>Bowlers<select data-window-setting="who">${option('all','Everyone',who)}${option('regulars','Regulars only',who)}${option('subs','Substitutes only',who)}</select></label>
  <label>Min. games for leaders<input data-window-setting="minimum" type="number" min="1" step="1" placeholder="Auto: ${defaultWindowMinimum(range.weeks)}" value="${settings.minimum??''}"></label>
 </div>`);

 // Headline cards
 const topTeam=data.teams[0],bestAvg=leader(data.teams.filter(t=>t.games),'average'),topBowler=leader(qualified,'average');
 const hg=filteredGames[0],hs=series[0],improved=leader(qualified.filter(b=>b.change!=null),'change');
 const tieNote=(l)=>l&&l.tied>1?` · ${l.tied}-way tie`:'';
 const headline=cards([
  ['Most points',topTeam?num(topTeam.points):'—',topTeam?team(topTeam)+` · ${record(topTeam)}`:''],
  ['Best team average',bestAvg?num(bestAvg.row.average):'—',bestAvg?team(bestAvg.row)+tieNote(bestAvg):''],
  ['Highest bowler average',topBowler?num(topBowler.row.average):'—',topBowler?player(topBowler.row)+` · ${topBowler.row.games} games`+tieNote(topBowler):`No one with ${minimum}+ games`],
  ['High game',hg?num(hg.score):'—',hg?player(hg)+` · Week ${hg.week}`:''],
  ['High series',hs?num(hs.score):'—',hs?player(hs)+` · Week ${hs.week}`:''],
  ['Most improved',improved?signed(improved.row.change):'—',improved?player(improved.row)+' · vs earlier weeks':'Needs earlier weeks to compare'],
  ['League average',num(data.league.average),`${num(data.league.games,0)} games · team avg ${num(data.league.teamAverage)}`],
  ['Big nights',`${data.league.g200}`,`200+ games · ${data.league.s700} series of 700+${data.league.g300?` · ${data.league.g300} × 300`:''}`]
 ]);

 // Team standings for the window
 const teamRows=data.teams.map(t=>({...t,record:{w:t.w,l:t.l,t:t.t}}));
 const standingsCols=[C('rank','Rank'),C('name','Team',(_,t)=>team(t)),C('points','Points'),C('pointsPerWeek','Pts / week',v=>num(v,2)),C('record','W-L-T',record),C('gamesWon','Games won'),C('seriesWon','Series won'),
  C('average','Team avg'),C('averageChange','Avg vs earlier',signed),C('highGame','High game'),C('highSeries','High series'),C('allPlayPct','All-play %',pct),C('luck','Schedule luck',signed),C('seasonRank','Season rank'),C('rankChange','Window vs season',v=>move(v))];
 standingsCols[0].defaultDir='asc';standingsCols[13].defaultDir='asc';
 const standings=panel(`Standings · ${label}`,table('window-standings',standingsCols,teamRows,settings,'rank','asc')+
  `<p class="panel-body fine muted">Ranked by points for these weeks, then team average. "Avg vs earlier" compares to the team's average before this stretch. All-play % is how a team would have done bowling every other team each week; schedule luck is actual points minus that expectation. "Window vs season" shows how many spots better (▲) or worse (▼) the team ranks in this stretch than in the season standings through Week ${range.end}.</p>`);

 // Points by week grid
 const gridRows=teamRows.map(t=>({...t,...Object.fromEntries(weeks.map(w=>['w'+w.week,t.weekly[w.week]?.points??null]))}));
 const cell=w=>(v,t)=>{const x=t.weekly[w.week];return x?`<strong>${num(x.points)}</strong> <span class="fine muted" title="${esc(teamName(x.opponent))}: ${num(x.opponentPoints)} pts">vs ${x.opponent}</span>`:'—';};
 const pointsGrid=panel('Points by week',table('window-weekly-points',[C('name','Team',(_,t)=>team(t)),...weeks.map(w=>C('w'+w.week,`Wk ${w.week}`,cell(w))),C('points','Total'),C('seasonPoints',`Season (thru Wk ${range.end})`)],gridRows,settings,'points'));

 // Team scoring by week
 const avgGridRows=teamRows.map(t=>({...t,bestPts:t.bestWeek?.points??null,worstPts:t.worstWeek?.points??null,...Object.fromEntries(weeks.map(w=>['s'+w.week,t.weekly[w.week]?.series??null]))}));
 const seriesGrid=panel('Team series by week',table('window-weekly-team-series',[C('name','Team',(_,t)=>team(t)),...weeks.map(w=>C('s'+w.week,`Wk ${w.week}`,v=>num(v,0))),C('average','Avg game'),C('bestPts','Best night',(_,t)=>t.bestWeek?`Wk ${t.bestWeek.week}: ${num(t.bestWeek.points)} pts`:'—'),C('worstPts','Toughest night',(_,t)=>t.worstWeek?`Wk ${t.worstWeek.week}: ${num(t.worstWeek.points)} pts`:'—')],avgGridRows,settings,'average')+
  '<p class="panel-body fine muted">Team totals include official blind scores, the same as match points.</p>');

 // Individual averages
 const bowlerCols=[C('name','Bowler',(_,b)=>player(b)+(b.substitute?' <span class="badge grey">Sub</span>':'')),C('teamLabel','Bowled for',esc),C('weeks','Weeks'),C('games','Games'),C('average','Average'),
  C('priorAverage','Before window'),C('change','Change',signed),C('seasonAverage','Season avg'),C('entering','Entering'),C('vsEntering','vs entering',signed),C('highGame','High game'),C('highSeries','High series'),
  C('g200','200+ games'),C('s600','600+ series'),C('teamPoints','Team pts'),C('teamPointsPerWeek','Team pts / wk',v=>num(v,2))];
 const bowlerTable=panel('Individual averages',table('window-bowlers',bowlerCols,shown,settings,'average')+
  `<p class="panel-body fine muted">Actual games only; blinds don't count. "Before window" is the bowler's average earlier this season, and "Change" is how much better or worse they've bowled in these weeks. Points in this league are won by teams, so "Team pts" is the points their team won in the weeks they bowled.</p>`);

 // Individual series by week
 const bowlerGridRows=shown.map(b=>({...b,...Object.fromEntries(weeks.map(w=>['b'+w.week,b.weekly[w.week]?.series??null]))}));
 const bowlerGrid=panel('Individual series by week',table('window-bowler-weeks',[C('name','Bowler',(_,b)=>player(b)),...weeks.map(w=>C('b'+w.week,`Wk ${w.week}`,(v,b)=>{const s=b.weekly[w.week];return s?`<span title="${s.scores.join(' / ')} · ${esc(teamName(s.team))}">${num(v,0)}</span>`:'<span class="muted">—</span>';})),C('average','Average'),C('trend','Trend',signed)],bowlerGridRows,settings,'average')+
  '<p class="panel-body fine muted">Hover a series to see the three games. Trend compares the second half of this stretch to the first half.</p>');

 // Highlights
 const hot=sortAnalytics(qualified.filter(b=>b.change!=null),'change','desc').slice(0,5),cold=sortAnalytics(qualified.filter(b=>b.change!=null),'change','asc').slice(0,5);
 const steady=sortAnalytics(qualified.filter(b=>b.sd!=null&&b.games>=6),'sd','asc').slice(0,5);
 const clutch=sortAnalytics(qualified,'teamPointsPerWeek','desc').slice(0,5);
 const highlights=panel('Highlights',`<div class="panel-body window-lists">
  ${list('Top games',filteredGames.slice(0,10),g=>`<strong>${g.score}</strong> ${player(g)} <span class="fine muted">Wk ${g.week}, game ${g.game}</span>`)}
  ${list('Top series',series.slice(0,10),s=>`<strong>${s.score}</strong> ${player(s)} <span class="fine muted">Wk ${s.week} · ${s.scores.join('-')}</span>`)}
  ${list('Hottest vs earlier weeks',hot,b=>`<strong>${signed(b.change)}</strong> ${player(b)} <span class="fine muted">${num(b.average)} vs ${num(b.priorAverage)}</span>`)}
  ${list('Coldest vs earlier weeks',cold,b=>`<strong>${signed(b.change)}</strong> ${player(b)} <span class="fine muted">${num(b.average)} vs ${num(b.priorAverage)}</span>`)}
  ${list('Most consistent (lowest spread)',steady,b=>`<strong>±${num(b.sd)}</strong> ${player(b)} <span class="fine muted">${num(b.average)} avg</span>`)}
  ${list('Most team points per week bowled',clutch,b=>`<strong>${num(b.teamPointsPerWeek,2)}</strong> ${player(b)} <span class="fine muted">${b.weeks} wk · ${esc(b.teamLabel)}</span>`)}
  ${list('Top team games',data.leaders.teamGames,g=>`<strong>${g.score}</strong> ${team(g)} <span class="fine muted">Wk ${g.week}, game ${g.game}</span>`)}
  ${list('Top team series',data.leaders.teamSeries,s=>`<strong>${s.score}</strong> ${team(s)} <span class="fine muted">Wk ${s.week}</span>`)}
 </div><p class="panel-body fine muted">The hot, cold, consistency and team-points lists use bowlers with at least ${minimum} games in these weeks.</p>`);

 return `<div class="page-head"><div><div class="eyebrow">Recent results</div><h1>Last ${range.weeks} week${range.weeks===1?'':'s'}</h1><p>${label}${dates?' · '+dates:''} · ${data.league.bowlers} bowlers · recorded scores only</p></div></div>`+
  controls+headline+standings+pointsGrid+bowlerTable+highlights+seriesGrid+bowlerGrid;
}
