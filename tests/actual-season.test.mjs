import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {getCurrentSeasonSessions,getCurrentSeasonStats,actualSeasonAudit} from '../dist/actual-season.js';
import {calculateStats} from '../dist/stats.js';
import {commitWeeklyImport} from '../dist/imports.js';
import {createDebugReport} from '../dist/debug.js';
const seed=()=>JSON.parse(fs.readFileSync(new URL('../dist/seed.json',import.meta.url)));
const doug='3af5c518-8a7a-5132-8689-3b1a8aea6032',robert='66e3ed83-e9b6-5362-bd10-3854326396d9';
const known={
 [doug]:{scores:[[210,211,257],[219,244,220],[246,221,237]],pins:2065,high:257,low:210,highSeries:704,lowSeries:678},
 [robert]:{scores:[[201,235,220],[246,243,226],[278,234,245]],pins:2128,high:278,low:201,highSeries:757,lowSeries:656}
};
function rows(s,w){return [['Week','TeamNumber','Bowler','Gm1','Gm2','Gm3','ScoreType'],...s.teams.flatMap(t=>t.players.map(id=>[w,t.number,s.bowlers.find(b=>b.id===id).name,...(known[id]?.scores[w-1]||[200,200,200]),'actual']))];}
function threeWeeks(){let s=seed();for(let w=1;w<=3;w++)s=commitWeeklyImport(s,rows(s,w));return s;}
test('REQUIRED Doug and Robert Week 1–3 actual totals, averages and weekly series',()=>{
 const s=threeWeeks();
 for(const [id,k] of Object.entries(known)){
  const b=getCurrentSeasonStats(s,id);assert.equal(b.games,9);assert.equal(b.totalPins,k.pins);assert.equal(b.average,k.pins/9);assert.equal(b.highGame,k.high);assert.equal(b.lowGame,k.low);assert.equal(b.highSeries,k.highSeries);assert.equal(b.lowSeries,k.lowSeries);assert.equal(b.averageSeries,k.pins/3);assert.deepEqual(b.weeklySessions.map(s=>s.scores),k.scores);
  assert.ok(b.weeklySessions.every(s=>s.series===s.scores.reduce((a,b)=>a+b,0)));
 }
});
test('Current-season scoring ignores arbitrary prior history, entering averages and simulation output',()=>{
 const s=threeWeeks(),a=getCurrentSeasonStats(s,doug),b=s.bowlers.find(b=>b.id===doug);
 b.history=[{season:'2025-2026',week:1,scores:[300,300,300]},{season:'2025-2026',week:2,scores:[0,0,0]}];b.entering=1;s.runs=[{weekly:[{week:4,scores:[300,300,300]}]}];
 const result=getCurrentSeasonStats(s,doug);
 for(const key of ['games','totalPins','average','highGame','lowGame','highSeries','lowSeries','averageSeries','median','sd','g200','g225','g250','g275','g300','s600','s650','s700','s750','last3','last5','above','longest200','bestRolling3'])assert.deepEqual(result[key],a[key],key);
});
test('Canonical IDs survive display-name changes and sessions sort by result week',()=>{
 const s=threeWeeks();s.bowlers.find(b=>b.id===doug).name='Doug Smith Jr.';s.bowlers.find(b=>b.id===robert).name='Doug Smith Jr.';s.results.reverse();
 assert.equal(getCurrentSeasonStats(s,doug).totalPins,2065);assert.equal(getCurrentSeasonStats(s,robert).totalPins,2128);assert.deepEqual(getCurrentSeasonSessions(s,doug).map(s=>s.week),[1,2,3]);
});
test('Sub creation and Week 3 commit are atomic; rejected rows leave original state untouched',()=>{
 let s=seed();for(let w=1;w<=2;w++)s=commitWeeklyImport(s,rows(s,w));const before=structuredClone(s),csv=rows(s,3);
 const row=csv.findIndex((r,i)=>i&&r[1]===18);csv[row][2]='Brayden Herbst';csv[row].splice(3,3,174,201,195);
 csv[2][3]=301;assert.throws(()=>commitWeeklyImport(s,csv,{[row+1]:'new'}),/300/);assert.deepEqual(s,before);
 csv[2][3]=200;const next=commitWeeklyImport(s,csv,{[row+1]:'new'}),sub=next.bowlers.find(b=>b.name==='Brayden Herbst');assert.ok(sub);assert.deepEqual(s,before);assert.deepEqual(next.teams,before.teams);
 const audit=actualSeasonAudit(next);assert.equal(audit.week3.playerRows,54);assert.equal(audit.week3.teamCount,18);assert.ok(audit.checks.every(c=>c.status==='pass'));
 const stats=getCurrentSeasonStats(next,sub.id);assert.equal(stats.totalPins,570);assert.equal(stats.games,3);assert.equal(stats.weeklySessions[0].team,18);
 const roundtrip=JSON.parse(JSON.stringify(next));assert.equal(getCurrentSeasonStats(roundtrip,sub.id).totalPins,570);assert.equal(roundtrip.results.length,3);
});
test('Blind sessions excluded, duplicate sessions block aggregation, audit identifies errors',()=>{
 const s=threeWeeks(),p=s.results[0].matches.flatMap(m=>m.players).find(p=>p.bowlerId===doug);p.type='blind';
 assert.equal(getCurrentSeasonStats(s,doug).totalPins,1387);assert.equal(getCurrentSeasonStats(s,doug).games,6);
 const m=s.results[1].matches.find(m=>m.players.some(p=>p.bowlerId===doug));m.players.push(structuredClone(m.players.find(p=>p.bowlerId===doug)));
 assert.throws(()=>getCurrentSeasonStats(s,doug),/Duplicate/);const audit=actualSeasonAudit(s);assert.ok(audit.checks.some(c=>c.status==='fail'));
 assert.match(createDebugReport(s,null).actualSeasonPlayerStats.find(b=>b.bowlerId===doug).error,/Duplicate/);
});
test('A/B/C rankings are disabled until every regular has a valid draft category',()=>{
 const s=threeWeeks();s.bowlers.find(b=>b.id===doug).category='A';
 assert.equal(calculateStats(s,{category:'A'}).qualified.length,0);assert.equal(calculateStats(s).categories.ready,false);
 for(const t of s.teams)for(let i=0;i<3;i++)s.bowlers.find(b=>b.id===t.players[i]).category=['A','B','C'][i];
 assert.equal(calculateStats(s).categories.ready,true);assert.equal(calculateStats(s,{category:'A'}).qualified.length,18);
});
test('Debug actualSeasonPlayerStats exposes real scores and declares absent server verification',()=>{
 const report=createDebugReport(threeWeeks(),null),b=report.actualSeasonPlayerStats.find(b=>b.bowlerId===doug);
 assert.equal(b.totalPins,2065);assert.equal(b.lowSeries,678);assert.equal(b.weeklySessions[2].series,704);assert.equal(report.week3Audit.playerRows,54);assert.match(report.workspacePersistence.source,/Not verified/);
 assert.ok(report.checks.every(c=>c.status==='pass'));
});
