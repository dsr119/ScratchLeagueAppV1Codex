import {calculateStats,calculateAllPlay,defaultMinimum,historySeasons,STATS_FORMULAS} from './stats.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=(v,d=1)=>v==null?'—':Number(v).toLocaleString('en-US',{maximumFractionDigits:d});
const pct=v=>v==null?'—':num(v*100)+'%';
const signed=v=>v==null?'—':(v>0?'+':'')+num(v);
const record=r=>`${r.w}-${r.l}-${r.t}`;
const option=(v,label,current)=>`<option value="${esc(v)}" ${String(v)===String(current)?'selected':''}>${esc(label)}</option>`;
const panel=(title,body)=>`<section class="panel analytics"><div class="panel-head"><h2>${esc(title)}</h2></div>${body}</section>`;
const player=b=>`<button class="text-button" data-stats-player="${esc(b.id)}">${esc(b.name)}</button>`;
const team=t=>`<button class="text-button" data-team-allplay="${t.number}">${t.number} · ${esc(t.name)}</button>`;
const C=(key,label,format=v=>num(v))=>({key,label,format});
export function sortAnalytics(rows,key,dir='desc'){
 const value=v=>v&&typeof v==='object'&&'w' in v?v.w+.5*v.t:v;
 return rows.slice().sort((a,b)=>{const x=value(a[key]),y=value(b[key]);if(x==null)return y==null?0:1;if(y==null)return -1;const c=typeof x==='string'?x.localeCompare(y):x-y;return (dir==='asc'?c:-c)||(a.name||'').localeCompare(b.name||'');});
}
function table(id,columns,rows,settings,defaultKey,defaultDir='desc'){
 const sort=settings.sorts?.[id]||{key:defaultKey,dir:defaultDir};
 return `<div class="table-wrap" tabindex="0" role="region" aria-label="${esc(id.replaceAll('-',' '))}"><table><thead><tr>${columns.map(c=>`<th scope="col" ${sort.key===c.key?`aria-sort="${sort.dir==='asc'?'ascending':'descending'}"`:''}><button class="sort-button" data-analytics-table="${esc(id)}" data-analytics-sort="${c.key}" data-default-direction="${c.defaultDir||'desc'}">${esc(c.label)}${sort.key===c.key?(sort.dir==='asc'?' ↑':' ↓'):''}</button></th>`).join('')}</tr></thead><tbody>${sortAnalytics(rows,sort.key,sort.dir).map(row=>`<tr>${columns.map(c=>`<td>${c.format(row[c.key],row)}</td>`).join('')}</tr>`).join('')||`<tr><td colspan="${columns.length}" class="empty">No qualifying results for these filters.</td></tr>`}</tbody></table></div>`;
}
const base=[C('name','Bowler',(_,b)=>player(b)),C('category','Category',esc),C('games','Games')];
const performance=[C('ratingRank','Rank'),...base,C('average','Average'),C('highGame','High game'),C('highSeries','High series'),C('lowGame','Low game'),C('sd','Std. deviation'),C('rating','Best Bowler Rating')];
function withRanks(rows,key,lower=false){let last=null,rank=0;return sortAnalytics(rows,key,lower?'asc':'desc').map((b,i)=>{if(b[key]!==last)rank=i+1;last=b[key];return {...b,ratingRank:b[key]==null?null:rank};});}
function cards(rows,items){return `<div class="metrics">${items.map(([key,label,lower=false])=>{const leader=sortAnalytics(rows.filter(b=>b[key]!=null),key,lower?'asc':'desc')[0];const tied=leader?rows.filter(b=>b[key]===leader[key]).length:0;return `<div class="metric"><div class="label">${esc(label)}</div><div class="value">${leader?num(leader[key]):'—'}</div><div class="foot">${leader?player(leader)+(tied>1?` · ${tied}-way tie`:''):'No qualifying scores'}</div></div>`;}).join('')}</div>`;}
function formulas(){return `<details class="panel-body stats-formulas"><summary>Formulas and data rules</summary>${Object.entries(STATS_FORMULAS).filter(([k])=>!['allPlay','luck','scheduleStrength'].includes(k)).map(([k,v])=>`<p><strong>${esc(k)}:</strong> ${esc(v)}</p>`).join('')}</details>`;}
export function statsView(state,settings){
 try{return renderStatsView(state,settings);}catch(e){return panel('Actual stats unavailable',`<div class="notice error" role="alert">${esc(e.message)} Download the debug report to inspect the imported sessions.</div><button data-action="debug">Download debug report</button>`);}
}
function renderStatsView(state,settings){
 const source=settings.source||'current',category=settings.category||'all',minimum=settings.minimum??defaultMinimum(state,source),stats=calculateStats(state,{source,category,minimum}),rows=stats.qualified;
 const tab=settings.tab||'overview',tabs=['overview','leaders','consistency','milestones','trends'];
 let body='';
 if(tab==='overview'){
  body=cards(rows,[['rating','Best Bowler Rating'],['improvement','Most improved · pins'],['average','Highest average'],['highSeries','High three-game series']]);
  body+=panel('Best bowler · '+(category==='all'?'full league':category),table('best',performance,withRanks(rows,'rating'),settings,'rating'));
  body+=panel('Most improved',table('improved',[...base,C('entering','Entering average'),C('average','Average'),C('improvement','Improvement',signed),C('improvementPct','Improvement %',v=>v==null?'—':signed(v)+'%')],rows.filter(b=>b.improvement!==null),settings,'improvement'));
  if(category==='all'&&stats.categories.ready)for(const c of ['A','B','C'])body+=panel(`Best ${c} bowlers`,table('category-'+c,performance,withRanks(rows.filter(b=>b.category===c),'rating'),settings,'rating'));
 }else if(tab==='leaders'){
  body=cards(rows,[['highGame','High game'],['highSeries','High series'],['lowGame','Lowest qualified game',true],['bestRolling3','Best rolling three-game average']]);
  body+=panel('Scoring leaders',table('leaders',[...base,C('average','Average'),C('highGame','High game'),C('highSeries','High series'),C('lowGame','Low game'),C('bestRolling3','Best rolling 3'),C('biggestGain','Biggest weekly gain',signed),C('above','Games above own average')],rows,settings,'average'));
 }else if(tab==='consistency'){
  body=cards(rows,[['sd','Most consistent · standard deviation',true],['lowGame','Highest scoring floor'],['longest200','Longest 200+ streak'],['median','Highest median game']]);
  body+=panel('Consistency and scoring floor',table('consistency',[...base,C('average','Average'),C('sd','Std. deviation'),C('lowGame','Lowest game'),C('median','Median'),C('above','Games above average'),C('aboveRate','Above-average rate',pct),C('longest200','Longest 200+ streak')],rows,settings,'sd','asc'));
 }else if(tab==='milestones'){
  body=panel('Game milestones',table('game-milestones',[...base,...[200,225,250,275,300].map(t=>C('g'+t,t===300?'300 games':t+'+ games'))],rows,settings,'g200'));
  body+=panel('Three-game series milestones',table('series-milestones',[...base,C('seriesCount','3-game sessions'),...[600,650,700,750].map(t=>C('s'+t,t+'+ series'))],rows,settings,'s600'));
 }else{
  body=cards(rows,[['last3','Last 3 weeks · highest average'],['last5','Last 5 weeks · highest average'],['trend','Hottest · pins vs average'],['trend','Coldest · pins vs average',true]]);
  body+=panel('Recent performance',`<div class="panel-body">Windows end at Week ${stats.lastWeek}. Games show each bowler’s available sample. Missing appearances are not zero scores.</div>`+table('trends',[...base,C('average','Period average'),C('last3','Last 3 weeks'),C('last3Games','3-week games'),C('last5','Last 5 weeks'),C('last5Games','5-week games'),C('trend','Hot / cold',signed),C('biggestGain','Biggest weekly gain',signed),C('bestRolling3','Best rolling 3')],rows,settings,'trend'));
 }
 const unassigned=stats.categories.missing.length;
 return `<div class="page-head"><div><h1>Stats</h1><p>${source==='current'?'Current season':esc(source)+' historical scores'} · Real games only</p></div><button data-action="debug">Download debug report</button></div>`+
 panel('Filters',`<div class="panel-body controls"><label>Scores<select data-stats-setting="source">${option('current','Current season',source)}${historySeasons(state).map(s=>option(s,s+' history',source)).join('')}</select></label><label>Category<select data-stats-setting="category">${['all','A','B','C','Unassigned'].map(c=>option(c,c==='all'?'Full league':c,category).replace('<option ',!stats.categories.ready&&['A','B','C'].includes(c)?'<option disabled ':'<option ')).join('')}</select></label><label>Minimum games<input data-stats-setting="minimum" type="number" min="1" step="1" placeholder="Auto: ${defaultMinimum(state,source)}" value="${settings.minimum??''}"></label><span>${rows.length} qualified · ${stats.excluded} below minimum (${minimum})</span></div><div class="panel-body tab-pills">${tabs.map(t=>`<button data-stats-tab="${t}" class="${t===tab?'active':''}" aria-pressed="${t===tab}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>`)+
 (unassigned?`<div class="notice">${unassigned} regular bowler(s) have no verified A/B/C category. Best A/B/C rankings are disabled until every regular has a valid category from the actual draft. No categories are inferred from averages or roster order.</div>`:'')+
 (source!=='current'?'<div class="notice">Historical improvement uses the currently recorded entering average. Historical four-game sessions count as games, but not as three-game series.</div>':'')+body+formulas();
}
const apColumns=[C('rank','All-play rank'),C('name','Team',(_,t)=>team(t)),C('record','W-L-T',record),C('points','All-play points'),C('maxPoints','Max points'),C('pointPct','All-play %',pct),...[0,1,2].map(g=>C('game'+g,`Game ${g+1} W-L-T`,record)),C('seriesRecord','Series W-L-T',record),C('actualPoints','Actual points'),C('actualRank','Actual standing'),C('standingDifference','Standing difference',signed),C('expectedPoints','Expected points'),C('scheduleLuck','Schedule luck',signed),C('scheduleStrength','Schedule strength',pct)];
const flatten=t=>({...t,game0:t.gameRecords[0],game1:t.gameRecords[1],game2:t.gameRecords[2]});
function apFormulas(){return `<details class="panel-body stats-formulas"><summary>All-Play formulas</summary>${['allPlay','luck','scheduleStrength'].map(k=>`<p>${esc(STATS_FORMULAS[k])}</p>`).join('')}<p>Official standings are not changed. W-L-T columns sort by wins + half of ties. All-Play is descriptive, not a prediction. Recorded team totals include official blind scores, while individual Stats exclude them. Exact All-Play ties share rank; actual standing follows the app’s points/team-average/team-number ordering.</p></details>`;}
function warnings(ap){return ap.issues.length?`<div class="notice error">${ap.issues.map(esc).join('<br>')} All-Play and its actual-standings comparison use only complete eligible weeks.</div>`:'';}
function weekColumns(state){const name=n=>state.teams.find(t=>t.number===n)?.name||n;return [C('rank','Weekly rank'),C('name','Team',(_,t)=>team(t)),C('opponent','Actual opponent',v=>esc(name(v))),C('actualPoints','Actual points',(_,t)=>`${num(t.actualPoints)}–${num(t.opponentPoints)}`),C('record','All-play W-L-T',record),C('points','All-play points',(_,t)=>`${num(t.points)} / ${num(t.maxPoints)}`),C('pointPct','All-play %',pct),C('scheduleLuck','Schedule luck',signed)];}
export function allPlayView(state,settings){
 const ap=calculateAllPlay(state),w=ap.weeks.find(w=>w.week===Number(settings.week))||ap.weeks.at(-1);
 return `<div class="page-head"><div><h1>All-Play</h1><p>${ap.weeks.length} completed weeks · Nine points per virtual opponent</p></div><button data-action="debug">Download debug report</button></div>`+warnings(ap)+
 panel('Season standings',table('all-play',apColumns,ap.teams.map(flatten),settings,'pointPct'))+
 panel('Weekly results',`<div class="panel-body controls"><label>Week<select data-allplay-week>${ap.weeks.map(x=>option(x.week,`Week ${x.week} · ${x.date||''}`,w?.week)).join('')||'<option>No completed weeks</option>'}</select></label><span>${w?`${w.teams.length-1} virtual opponents per team`:'Import a full week to begin.'}</span></div>`+table('all-play-week',weekColumns(state),w?.teams||[],settings,'points'))+apFormulas();
}
export function teamAllPlayView(state,number,settings={}){
 const ap=calculateAllPlay(state),t=ap.teams.find(t=>t.number===number);if(!t)return '';
 const rows=ap.weeks.map(w=>({...w.teams.find(t=>t.number===number),week:w.week}));
 return panel('All-Play',warnings(ap)+`<div class="panel-body"><div class="controls"><span><strong>Season:</strong> ${record(t.record)}</span><span><strong>All-play:</strong> ${pct(t.pointPct)} · rank ${num(t.rank)}</span><span><strong>Actual standing:</strong> ${num(t.actualRank)}</span><span><strong>Standing difference:</strong> ${signed(t.standingDifference)}</span><span><strong>Schedule luck:</strong> ${signed(t.scheduleLuck)} points</span><span><strong>Schedule strength:</strong> ${pct(t.scheduleStrength)}</span></div></div>`+table('team-all-play',[C('week','Week'),...weekColumns(state).filter(c=>c.key!=='name')],rows,settings,'week','asc')+apFormulas());
}
function chart(b){
 const sessions=b.sessions.filter(s=>Number.isInteger(s.week));if(!sessions.length)return '';
 const byWeek=new Map();for(const s of sessions){const a=byWeek.get(s.week)||[];a.push(...s.scores);byWeek.set(s.week,a);}
 const values=[...byWeek].sort((a,b)=>a[0]-b[0]).map(([w,g])=>({week:w,average:g.reduce((a,b)=>a+b,0)/g.length}));
 const lo=Math.min(...values.map(v=>v.week)),hi=Math.max(...values.map(v=>v.week)),x=w=>45+(w-lo)/Math.max(1,hi-lo)*540,y=a=>160-a/300*140;
 return `<h3>Week-by-week average</h3><svg class="stats-chart" viewBox="0 0 620 190" role="img" aria-label="Weekly average for ${esc(b.name)}; exact scores in table below">${[0,100,200,300].map(a=>`<line x1="45" y1="${y(a)}" x2="585" y2="${y(a)}" stroke="#dce3e8"/><text x="4" y="${y(a)+4}">${a}</text>`).join('')}${values.slice(1).map((v,i)=>v.week===values[i].week+1?`<line x1="${x(values[i].week)}" y1="${y(values[i].average)}" x2="${x(v.week)}" y2="${y(v.average)}" stroke="#087c73" stroke-width="2"/>`:'').join('')}${values.map(v=>`<circle cx="${x(v.week)}" cy="${y(v.average)}" r="4" fill="#087c73"><title>Week ${v.week}: ${num(v.average)}</title></circle>`).join('')}<text x="45" y="184">Week ${lo}</text>${hi>lo?`<text x="530" y="184">Week ${hi}</text>`:''}</svg>`;
}
export function statsDetail(state,id,settings){
 const stats=calculateStats(state,{source:settings.source||'current',minimum:settings.minimum??defaultMinimum(state,settings.source||'current')}),b=stats.bowlers.find(b=>b.id===id);if(!b)return '';
 const current=calculateStats(state).bowlers.find(b=>b.id===id);
 const fields=[['Current-season average',current.average],['Selected-period average',b.average],['Entering average',b.entering],['Improvement',b.improvement],['Games',b.games],['Total pins',b.totalPins],['High game',b.highGame],['Low game',b.lowGame],['High 3-game series',b.highSeries],['Low 3-game series',b.lowSeries],['Average 3-game series',b.averageSeries],['Standard deviation',b.sd],['Median game',b.median],['Last 3-week average',b.last3],['Last 3-week games',b.last3Games],['Last 5-week average',b.last5],['Last 5-week games',b.last5Games],['Best Bowler Rating',b.rating??null]];
 return `<div class="panel-head"><h2>${esc(b.name)} · Stats</h2><button data-action="close-player">Close</button></div><div class="panel-body analytics stack"><p>${stats.source==='current'?'Current season':esc(stats.source)+' historical scores'} · ${b.games>=stats.minimum?'Qualified':'Below '+stats.minimum+'-game minimum'}</p><label>Category<select data-stats-category-player="${esc(id)}">${['Unassigned','A','B','C'].map(c=>option(c,c,b.category)).join('')}</select></label><p class="fine">Category changes are saved with Save league. Team rosters are unchanged.</p><dl class="stats-detail-grid">${fields.map(([k,v])=>`<div><dt>${k}</dt><dd>${num(v)}</dd></div>`).join('')}</dl><h3>Milestones</h3><p>${[200,225,250,275,300].map(t=>`${t}${t===300?'':'+'} games: <strong>${b['g'+t]}</strong>`).join(' · ')}</p><p>${[600,650,700,750].map(t=>`${t}+ series: <strong>${b['s'+t]}</strong>`).join(' · ')}</p><p>Above-average games: ${b.above} (${pct(b.aboveRate)}) · Longest 200+ streak: ${b.longest200}</p>${b.components?`<details><summary>Rating components</summary><p>${Object.entries(b.components).map(([k,v])=>`${esc(k)}: ${num(v)}`).join(' · ')}</p><p>Weighted percentile score: ${num(b.weightedRating)} · sample weight: ${pct(b.reliability)} · final: ${num(b.rating)}</p></details>`:''}${chart(b)}<div class="table-wrap"><table><thead><tr><th>Week / date</th><th>Weekly team</th><th>Real games</th><th>Total</th></tr></thead><tbody>${b.sessions.map(s=>`<tr><td>${s.week??'—'} / ${esc(s.date||'—')}</td><td>${s.team??'—'}</td><td>${s.scores.join(' / ')}</td><td>${s.scores.reduce((a,b)=>a+b,0)}</td></tr>`).join('')}</tbody></table></div>${formulas()}</div>`;
}
