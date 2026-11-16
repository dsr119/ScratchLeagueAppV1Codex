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

 // Summary: the items Doug asked for, for the chosen weeks.
 const tiedWith=(rows,key)=>{const valid=rows.filter(r=>r[key]!=null);if(!valid.length)return [];const best=sortAnalytics(valid,key,'desc')[0][key];return sortAnalytics(valid.filter(r=>r[key]===best),'name','asc');};
 const names=(rows,link)=>rows.slice(0,3).map(link).join(' & ')+(rows.length>3?` +${rows.length-3} more`:'')+(rows.length>1?' (tie)':'');
 const best=(label,rows,key,link,detail,empty)=>{const top=tiedWith(rows,key);return [label,top.length?num(top[0][key]):'—',top.length?names(top,link)+(detail&&top.length===1?' · '+detail(top[0]):''):empty];};
 const topScores=(rows,k)=>rows.slice(0,k);
 const bestOf=(rows)=>{const top=rows.filter(r=>r.score===rows[0]?.score);return top;};
 const teamGameTop=bestOf(data.leaders.teamGames),teamSeriesTop=bestOf(data.leaders.teamSeries);
 const listCard=(label,rows,line)=>[label,rows.length?`<ol class="window-top3">${rows.map(r=>`<li>${line(r)}</li>`).join('')}</ol>`:'—',''];
 const noQual=`No one with ${minimum}+ games`;
 const catRows=c=>qualified.filter(b=>b.category===c);
 const headline=`<div class="metrics window-metrics">${[
  best('Most points',data.teams,'points',team,t=>record(t),''),
  ['Best team game',teamGameTop.length?num(teamGameTop[0].score):'—',teamGameTop.length?names(teamGameTop,team)+(teamGameTop.length===1?` · Week ${teamGameTop[0].week}, game ${teamGameTop[0].game}`:''):''],
  ['Best team series',teamSeriesTop.length?num(teamSeriesTop[0].score):'—',teamSeriesTop.length?names(teamSeriesTop,team)+(teamSeriesTop.length===1?` · Week ${teamSeriesTop[0].week}`:''):''],
  best('Best team average',data.teams.filter(t=>t.games),'average',team,null,''),
  ...['A','B','C'].map(c=>best(`Best ${c} bowler · average`,catRows(c),'average',player,b=>`${b.games} games`,state.bowlers.some(b=>b.category===c)?noQual:`No ${c} bowlers assigned`)),
  best('Best bowler (all) · average',qualified,'average',player,b=>`${b.games} games${b.category?' · '+b.category:''}`,noQual),
  listCard('Top 3 high games',topScores(filteredGames,3),g=>`<strong>${g.score}</strong> ${player(g)} <span class="muted">Wk ${g.week}</span>`),
  listCard('Top 3 high series',topScores(series,3),s=>`<strong>${s.score}</strong> ${player(s)} <span class="muted">Wk ${s.week}</span>`)
 ].map(([label,value,foot])=>`<div class="metric"><div class="label">${esc(label)}</div><div class="value">${value}</div>${foot?`<div class="foot">${foot}</div>`:''}</div>`).join('')}</div><p class="fine muted window-note">Bowler averages count bowlers with at least ${minimum} games in these weeks (change it with "Min. games for leaders"). A/B/C use each bowler's league category. Team numbers include official blinds; bowler numbers don't.</p>`;

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
