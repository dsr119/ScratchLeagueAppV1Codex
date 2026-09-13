import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateStats,calculateAllPlay,analyticsChecks,percentile,defaultMinimum,assignEnteringCategories} from '../dist/stats.js';
import {statsView,allPlayView,teamAllPlayView,statsDetail,sortAnalytics} from '../dist/stats-ui.js';
import {weeklyPreview,prepareWeeklyImport} from '../dist/imports.js';
import {createDebugReport} from '../dist/debug.js';
const seed=()=>JSON.parse(fs.readFileSync(new URL('../dist/seed.json',import.meta.url)));
function week(s,w,score=()=>[200,200,200]){
 const rows=[['Week','TeamNumber','Bowler','Gm1','Gm2','Gm3','ScoreType'],...s.teams.flatMap(t=>t.players.map((id,i)=>[w,t.number,s.bowlers.find(b=>b.id===id).name,...score(t.number,i),'actual']))];
 const p=weeklyPreview(rows,s);assert.deepEqual(p.errors,[]);s.results.push(p.result);return rows;
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('Entering-average categories split only regulars equally, persist and ignore weekly performance',()=>{
 const s=seed(),before=structuredClone(s);assert.equal(assignEnteringCategories(s),true);
 for(const c of ['A','B','C'])assert.equal(s.bowlers.filter(b=>b.category===c).length,18);
 assert.deepEqual(s.teams,before.teams);assert.deepEqual(s.results,before.results);
 assert.ok(s.bowlers.filter(b=>!b.team).every(b=>b.category===null));
 const averages=c=>s.bowlers.filter(b=>b.category===c).map(b=>b.entering);
 assert.ok(Math.min(...averages('A'))>=Math.max(...averages('B')));assert.ok(Math.min(...averages('B'))>=Math.max(...averages('C')));
 const copy=JSON.parse(JSON.stringify(s));assert.equal(assignEnteringCategories(copy),false);assert.deepEqual(copy,s);
 week(s,1,()=>[300,300,300]);assert.equal(assignEnteringCategories(s),false);
 const invalid=seed();invalid.bowlers.find(b=>b.id===invalid.teams[0].players[0]).entering=null;const unchanged=structuredClone(invalid);
 assert.throws(()=>assignEnteringCategories(invalid),/entering average/);assert.deepEqual(invalid,unchanged);
});
test('All-play all-tie week awards 76.5 / 153 points and 17 ties per team',()=>{
 const s=seed();week(s,1);const before=structuredClone(s),ap=calculateAllPlay(s);
 assert.equal(ap.weeks[0].comparisons.length,153);
 for(const t of ap.teams){assert.deepEqual(t.record,{w:0,l:0,t:17});assert.equal(t.points,76.5);assert.equal(t.maxPoints,153);assert.equal(t.pointPct,.5);assert.equal(t.rank,1);assert.equal(t.expectedPoints,4.5);assert.equal(t.scheduleLuck,0);assert.equal(t.scheduleStrength,.5);for(const r of [...t.gameRecords,t.seriesRecord])assert.deepEqual(r,{w:0,l:0,t:17});}
 assert.deepEqual(s,before);
 assert.ok(analyticsChecks(s,calculateStats(s),ap).every(c=>c.status==='pass'));
});
test('Known game and series ties split points exactly, independent of scheduled opponent',()=>{
 const s=seed();week(s,1,t=>t===1?[210,190,200]:[200,200,200]);
 const ap=calculateAllPlay(s),t=ap.teams.find(t=>t.number===1);
 assert.equal(t.points,76.5);assert.deepEqual(t.gameRecords,[{w:17,l:0,t:0},{w:0,l:17,t:0},{w:0,l:0,t:17}]);assert.equal(t.seriesRecord.t,17);assert.equal(t.record.t,17);
 const pair=ap.weeks[0].comparisons.find(p=>p.teamA===1);assert.equal(pair.a,4.5);assert.equal(pair.b,4.5);
});
test('Season totals, expected points, standing difference and repeated-opponent strength reconcile',()=>{
 const s=seed();week(s,1,t=>Array(3).fill(100+t*5));week(s,2,t=>Array(3).fill(t===1?300:100+t*5));
 const ap=calculateAllPlay(s);
 near(ap.teams.reduce((n,t)=>n+t.points,0),2*153*9);
 near(ap.teams.reduce((n,t)=>n+t.scheduleLuck,0),0);
 for(const t of ap.teams){const weekly=ap.weeks.map(w=>w.teams.find(a=>a.number===t.number));assert.equal(t.record.w+t.record.l+t.record.t,34);assert.equal(t.maxPoints,306);near(t.expectedPoints,t.points/17);near(t.scheduleLuck,t.actualPoints-t.points/17);assert.equal(t.standingDifference,t.actualRank-t.rank);near(t.scheduleStrength,weekly.reduce((n,a)=>n+ap.teams.find(o=>o.number===a.opponent).pointPct,0)/2);}
 const strongest=ap.weeks[0].teams.find(t=>t.number===18);assert.equal(strongest.points,153);assert.equal(strongest.record.w,17);assert.equal(strongest.rank,1);
});
test('Incomplete/duplicate weeks are excluded wholesale and simulation output cannot affect all-play',()=>{
 const s=seed();week(s,1);const expected=calculateAllPlay(s);s.runs.push({weekly:[{week:2,teams:[{number:1,points:999999}]}]});assert.deepEqual(calculateAllPlay(s),expected);
 week(s,2);s.results[1].matches.pop();let ap=calculateAllPlay(s);assert.deepEqual(ap.eligibleWeeks,[1]);assert.equal(ap.issues.length,1);assert.ok(ap.teams.every(t=>t.maxPoints===153));
 s.results.push(structuredClone(s.results[0]));ap=calculateAllPlay(s);assert.equal(ap.weeks.length,0);assert.ok(ap.issues.length);
 const future=seed();week(future,1);future.results.push({week:3,matches:[]});assert.deepEqual(calculateAllPlay(future).eligibleWeeks,[1]);
 future.results[0].simulated=true;assert.equal(calculateAllPlay(future).weeks.length,0);
});
test('Stats milestones, distribution, rolling average, improvement and bounded percentiles',()=>{
 const s=seed(),id=s.teams[0].players[0],b=s.bowlers.find(b=>b.id===id);b.entering=200;for(const player of s.bowlers)if(player.team)player.category='B';b.category='A';
 week(s,1,(t,i)=>t===1&&i===0?[200,225,250]:[180,190,200]);
 const stats=calculateStats(s),r=stats.bowlers.find(b=>b.id===id);
 assert.equal(r.games,3);assert.equal(r.average,225);assert.equal(r.median,225);assert.equal(r.sd,25);assert.equal(r.highSeries,675);assert.equal(r.averageSeries,675);assert.equal(r.improvement,25);assert.equal(r.improvementPct,12.5);assert.equal(r.g200,3);assert.equal(r.g225,2);assert.equal(r.g250,1);assert.equal(r.g275,0);assert.equal(r.s600,1);assert.equal(r.s650,1);assert.equal(r.s700,0);assert.equal(r.longest200,3);assert.equal(r.above,1);assert.equal(r.bestRolling3,225);
 const category=calculateStats(s,{category:'A'});assert.equal(category.qualified.length,1);assert.equal(category.qualified[0].rating,r.rating);
 assert.equal(percentile([1,2,3],1),0);assert.equal(percentile([1,2,3],3),100);assert.equal(percentile([1,2,3],1,true),100);assert.equal(percentile([2,2,2],2),50);assert.equal(percentile([1],1),50);
 assert.ok(stats.qualified.every(b=>b.rating>=0&&b.rating<=100&&Object.values(b.components).every(c=>c>=0&&c<=100)));
});
test('Qualification switches after Week 3 and subs receive only their actual games',()=>{
 const s=seed(),csv=week(s,1),regular=s.bowlers.find(b=>b.id===s.teams[0].players[0]);
 week(s,2);assert.equal(defaultMinimum(s),1);
 const next=csv.map(r=>r.slice());next.slice(1).forEach(r=>r[0]=3);next[1][2]='Sub Test';
 const p=prepareWeeklyImport(next,s,{2:'new'});assert.deepEqual(p.errors,[]);s.bowlers.push(...p.newBowlers);s.results.push(p.result);
 const stats=calculateStats(s),sub=stats.bowlers.find(b=>b.id===p.newBowlers[0].id);
 assert.equal(stats.minimum,9);assert.equal(sub.games,3);assert.equal(sub.entering,null);assert.equal(sub.improvement,null);assert.ok(!stats.qualified.some(b=>b.id===sub.id));assert.equal(stats.bowlers.find(b=>b.id===regular.id).games,6);
 assert.ok(calculateStats(s,{minimum:3}).qualified.some(b=>b.id===sub.id));assert.equal(s.teams[0].players[0],regular.id);
 const lower=calculateStats(s,{minimum:1}).bowlers.find(b=>b.id===sub.id);near(lower.reliability,3/21);
 assert.ok(analyticsChecks(s,stats,calculateAllPlay(s)).every(c=>c.status==='pass'));
});
test('Blind/absent/invalid sessions are excluded; official blind team totals remain',()=>{
 const s=seed();week(s,1);const m=s.results[0].matches[0],p=m.players[0];p.type='blind';
 const stats=calculateStats(s);assert.equal(stats.bowlers.find(b=>b.id===p.bowlerId).games,0);assert.equal(calculateAllPlay(s).weeks[0].teams.find(t=>t.number===p.team).points,76.5);
 p.type='absent';assert.equal(calculateStats(s).bowlers.find(b=>b.id===p.bowlerId).games,0);
 p.type='actual';p.scores[0]=301;assert.throws(()=>calculateStats(s),/Invalid three-game/);
});
test('Historical four-game sessions count as games, not 3-game series; sources stay separate',()=>{
 const s=seed(),b=s.bowlers[0];b.history=[{season:'2025-2026',date:'2026-01-01',week:1,scores:[200,200,200,200]},{season:'2025-2026',date:'2026-01-08',week:2,scores:[300,300,300]},{season:'2025-2026',date:'2026-01-15',week:3,scores:[190,190,190],type:'blind'},{season:'2025-2026',date:'2026-01-22',week:4,scores:[190,190,220],ss:220}];
 assert.equal(calculateStats(s).bowlers.find(r=>r.id===b.id).games,0);
 const h=calculateStats(s,{source:'2025-2026',minimum:1}).bowlers.find(r=>r.id===b.id);
 assert.equal(h.games,7);assert.equal(h.seriesCount,1);assert.equal(h.highSeries,900);assert.equal(h.g300,3);assert.equal(h.s750,1);assert.equal(h.longest200,7);
 assert.equal(calculateStats(s,{source:'2025-2026'}).qualified.length,0);
});
test('Last-week windows preserve absence gaps; weekly gains only use adjacent weeks',()=>{
 const s=seed(),id=s.teams[0].players[0];for(let w=1;w<=5;w++)week(s,w,()=>Array(3).fill(100+w*20));
 for(const r of s.results)for(const m of r.matches)for(const p of m.players)if(p.bowlerId===id&&[2,3,4].includes(r.week))p.type='blind';
 const b=calculateStats(s,{minimum:1}).bowlers.find(b=>b.id===id);assert.equal(b.last3,200);assert.equal(b.last3Games,3);assert.equal(b.last5,160);assert.equal(b.last5Games,6);assert.equal(b.biggestGain,null);assert.equal(b.trend,40);
});
test('Debug captures default/selected stats, bounds and attribution failures without mutating state',()=>{
 const s=seed();week(s,1);const before=structuredClone(s);
 const report=createDebugReport(s,null,{analyticsSettings:{minimum:9,category:'A'},password:'never-copy'});
 assert.equal(report.reportVersion,3);assert.equal(report.analytics.stats.minimum,1);assert.equal(report.analytics.selectedStats.minimum,9);assert.equal(report.analytics.selectedStats.qualified.length,0);assert.equal(report.summary.failedChecks,0);assert.ok(!JSON.stringify(report).includes('never-copy'));assert.deepEqual(s,before);
 s.results[0].matches[0].players[0].team=999;
 assert.equal(createDebugReport(s,null).checks.find(c=>c.name==='Stats weekly player attribution').status,'fail');
 const stats=calculateStats(before);stats.qualified[0].components.average=101;
 assert.equal(analyticsChecks(before,stats,calculateAllPlay(before)).find(c=>c.name==='Stats rating bounds').status,'fail');
});
test('Every UI section renders empty/populated data, escaping names and preserving sort nulls',()=>{
 const s=seed();for(const tab of ['overview','leaders','consistency','milestones','trends'])assert.match(statsView(s,{tab}),/Stats/);
 week(s,1);s.bowlers[0].name='<img src=x onerror=alert(1)>';
 for(const tab of ['overview','leaders','consistency','milestones','trends']){const html=statsView(s,{tab,minimum:1});assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('data-analytics-sort'))};
 assert.match(statsDetail(s,s.bowlers[0].id,{}),/Week-by-week average/);assert.match(allPlayView(s,{}),/Weekly results/);assert.match(teamAllPlayView(s,1),/Schedule luck/);
 assert.deepEqual(sortAnalytics([{name:'Empty',average:null},{name:'High',average:200},{name:'Low',average:100}],'average','asc').map(r=>r.name),['Low','High','Empty']);
});
