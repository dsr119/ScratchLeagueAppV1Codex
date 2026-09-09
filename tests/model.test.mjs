import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {matchPoints,simulate,profile,projectedMean,standings} from '../dist/model.js';
import {parseCSV,historyPreview,mergeHistory,weeklyPreview,dateString} from '../dist/imports.js';
const seed=()=>JSON.parse(fs.readFileSync(new URL('../dist/seed.json',import.meta.url),'utf8'));
test('Nine-point scoring handles split games and series ties',()=>{
 assert.deepEqual(matchPoints([600,620,610],[600,620,610]),[4.5,4.5]);
 assert.deepEqual(matchPoints([600,610,620],[590,620,620]),[4.5,4.5]);
 assert.deepEqual(matchPoints([700,700,700],[600,600,600]),[9,0]);
});
test('Public seed has no individual scoring history',()=>{assert.ok(seed().bowlers.every(b=>b.history.length===0));});
test('Gradual adjustments respect start/end boundaries and do not mutate baseline',()=>{
 const p={mean:210},a={start:10,end:20,delta:10};
 assert.equal(projectedMean(p,a,5),210);assert.equal(projectedMean(p,a,15),215);assert.equal(projectedMean(p,a,30),220);
 assert.equal(projectedMean(p,{start:10,end:10,delta:-5},10),205);assert.equal(p.mean,210);
});
test('History ignores summary rows, supports four games, flags missing games',()=>{
 const r=parseCSV('Week,Date,Gm1,Gm2,Gm3,SS\r\n39,6/11/2026,201,202,203,810\r\n,,201,202,203,606');
 const p=historyPreview(r,'2025-2026','Bowler.csv');assert.equal(p.issues.length,1);assert.equal(p.skipped,1);
 const good=historyPreview([['Week','Date','Gm1','Gm2','Gm3','Gm4','SS'],[39,'6/11/26',201,202,203,204,810]],'2025-2026','Bowler.csv');
 assert.equal(good.issues.length,0);assert.equal(good.sessions[0].scores.length,4);
 assert.equal(mergeHistory(good.sessions,good.sessions).duplicates.length,1);
 assert.throws(()=>mergeHistory(good.sessions,[{...good.sessions[0],scores:[200,200,200]}]),/Conflicting/);
});
test('CSV parser preserves commas in bowler names and quoted newlines',()=>{
 assert.deepEqual(parseCSV('Name,Note\r\n"Smith, Doug","a\nb"'),[['Name','Note'],['Smith, Doug','a\nb']]);
 assert.throws(()=>parseCSV('"unfinished'),/unclosed/);
 assert.equal(dateString(45900),'2025-08-31');
});
function weekCSV(s,w){return [['Week','TeamNumber','Bowler','Gm1','Gm2','Gm3','ScoreType'],...s.teams.flatMap(t=>t.players.map(id=>[w,t.number,s.bowlers.find(b=>b.id===id).name,200,200,200,'actual']))];}
test('Weekly imports validate full roster and reject repeat weeks and players',()=>{
 const s=seed(),rows=weekCSV(s,1),p=weeklyPreview(rows,s);assert.deepEqual(p.errors,[]);assert.equal(p.result.matches.length,9);
 s.results.push(p.result);assert.equal(standings(s).reduce((a,t)=>a+t.points,0),81);
 assert.equal(weeklyPreview(rows,s).errors.length,1);
 assert.ok(weeklyPreview(weekCSV(seed(),1).slice(0,-1),seed()).errors.length);
 const dup=weekCSV(seed(),1);dup[2][2]=dup[1][2];assert.match(weeklyPreview(dup,seed()).errors[0].message,/more than once/);
});
test('Monte Carlo conserves qualification and championship counts and repeats by seed',()=>{
 const s=seed(),a=simulate(s,25,84),b=simulate(s,25,84);
 assert.deepEqual(a.teams,b.teams);
 assert.ok(Math.abs(a.teams.reduce((s,t)=>s+t.playoffs,0)-7)<1e-9);
 assert.ok(Math.abs(a.teams.reduce((s,t)=>s+t.champion,0)-1)<1e-9);
 assert.ok(Math.abs(a.teams.reduce((s,t)=>s+t.points,0)-34*81)<1e-9);
 for(let third=0;third<3;third++){
  assert.ok(Math.abs(a.teams.reduce((n,t)=>n+t.thirdPoints[third],0)-11*81)<1e-9);
  assert.ok(Math.abs(a.teams.reduce((n,t)=>n+t.thirds[third],0)-1)<1e-9);
 }
 assert.equal(s.results.length,0);
});
test('Finished regular season remains fixed and repeat third winner gets seed 1',()=>{
 const s=seed();for(let w=1;w<=34;w++){
  const pairs=Array.from({length:9},(_,i)=>[i*2+1,i*2+2]);
  s.results.push({week:w,matches:pairs.map(([a,b])=>({teamA:a,teamB:b,a:[900,900,900],b:[0,0,0],players:[]}))});
 }
 s.thirdWinners={1:1,2:1,3:1};const r=simulate(s,20,44);
 assert.equal(r.teams.find(t=>t.number===1).seeds[0],1);
 assert.equal(r.teams.find(t=>t.number===1).points,306);
 assert.deepEqual(r.teams.find(t=>t.number===1).thirdPoints,[99,99,99]);
 assert.deepEqual(r.teams.find(t=>t.number===1).thirds,[1,1,1]);
 assert.deepEqual(r.teams.find(t=>t.number===2).thirdPoints,[0,0,0]);
 assert.equal(r.teams.find(t=>t.number===2).points,0);
 assert.ok(Math.abs(r.teams.reduce((s,t)=>s+t.playoffs,0)-7)<1e-9);
});

test('Weekly projections conserve points and reflect fixed results and opponent uncertainty',()=>{
 const s=seed();const imported=weeklyPreview(weekCSV(s,1),s);s.results.push(imported.result);
 const run=simulate(s,30,42);
 assert.equal(run.weekly.length,34);
 for(const w of run.weekly){
  assert.equal(w.teams.length,18);
  assert.ok(Math.abs(w.teams.reduce((a,t)=>a+t.points,0)-81)<1e-8);
  for(const t of w.teams){
   assert.ok(Math.abs(t.opponents.reduce((a,o)=>a+o.probability,0)-1)<1e-8);
   assert.ok(Math.abs(t.opponents.reduce((a,o)=>a+o.points*o.probability,0)-t.points)<1e-8);
   assert.ok(Math.abs(t.opponents.reduce((a,o)=>a+o.win*o.probability,0)-t.win)<1e-8);
   for(const o of t.opponents){const reverse=w.teams.find(x=>x.number===o.number).opponents.find(x=>x.number===t.number);assert.equal(o.probability,reverse.probability);assert.ok(Math.abs(o.points+reverse.points-9)<1e-8);}
  }
 }
 for(const m of imported.result.matches){const pts=matchPoints(m.a,m.b);[m.teamA,m.teamB].forEach((n,i)=>{const t=run.weekly[0].teams.find(t=>t.number===n);assert.equal(t.points,pts[i]);assert.equal(t.win,pts[i]>4.5?1:0);assert.equal(t.tie,pts[i]===4.5?1:0);});}
 assert.equal(run.weekly[0].actual,true);
 assert.equal(run.weekly[1].actual,false);
 assert.ok(run.weekly[9].teams.some(t=>t.opponents.length>1));
 for(const t of run.teams)assert.ok(Math.abs(run.weekly.reduce((a,w)=>a+w.teams.find(x=>x.number===t.number).points,0)-t.points)<1e-8);
});

test('Debug report supports reproduction, flags corrupted totals, and excludes auth context',async()=>{
 const {createDebugReport,inputFingerprint}=await import('../dist/debug.js');
 const s=seed();s.results.push(weeklyPreview(weekCSV(s,1),s).result);
 const r=simulate(s,10,72);r.fingerprint=inputFingerprint(s);r.inputSnapshot=structuredClone(s);s.runs.push(r);
 const report=createDebugReport(s,r,{access_token:'secret-token',password:'secret-password',signedIn:true});
 assert.equal(report.summary.failedChecks,0);
 assert.deepEqual(simulate(report.selectedSimulation.inputSnapshot,r.iterations,r.seed).teams,r.teams);
 assert.ok(!JSON.stringify(report).includes('secret-token'));assert.ok(!JSON.stringify(report).includes('secret-password'));
 s.results[0].matches[0].a[0]++;
 const bad=createDebugReport(s,r);
 assert.equal(bad.checks.find(c=>c.name==='Week 1 team totals').status,'fail');
 assert.equal(bad.checks.find(c=>c.name==='Run matches current inputs').status,'fail');
 assert.equal(createDebugReport(seed(),null).summary.hasSimulation,false);
});
