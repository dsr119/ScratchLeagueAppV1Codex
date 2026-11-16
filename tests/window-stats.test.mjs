import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {calculateWindow,windowRange} from '../dist/window-stats.js';
import {windowView} from '../dist/window-ui.js';
import {standings} from '../dist/model.js';
import {weeklyPreview} from '../dist/imports.js';
import {assignEnteringCategories} from '../dist/stats.js';
const seed=()=>JSON.parse(fs.readFileSync(new URL('../dist/seed.json',import.meta.url)));
function week(s,w,score){
 const rows=[['Week','TeamNumber','Bowler','Gm1','Gm2','Gm3','ScoreType'],...s.teams.flatMap(t=>t.players.map((id,i)=>[w,t.number,s.bowlers.find(b=>b.id===id).name,...score(t.number,i,w),'actual']))];
 const p=weeklyPreview(rows,s);assert.deepEqual(p.errors,[]);s.results.push(p.result);
}
function season(weeks=5){const s=seed();for(let w=1;w<=weeks;w++)week(s,w,(n,i,wk)=>[150+n*3+i+wk,160+n*2+wk,170+(n*wk)%40]);return s;}

test('Window range clamps to recorded weeks and the chosen end week',()=>{
 const s=season(5);
 assert.deepEqual(windowRange(s,{weeks:3}),{start:3,end:5,weeks:3,last:5});
 assert.deepEqual(windowRange(s,{weeks:9}),{start:1,end:5,weeks:5,last:5});
 assert.deepEqual(windowRange(s,{weeks:2,through:3}),{start:2,end:3,weeks:2,last:5});
 assert.deepEqual(windowRange(seed(),{weeks:3}),{start:0,end:0,weeks:0,last:0});
});

test('A window covering the whole season matches official standings',()=>{
 const s=season(5),all=calculateWindow(s,{weeks:5}),official=standings(s);
 assert.deepEqual(all.teams.map(t=>[t.number,t.points]),official.map(t=>[t.number,t.points]));
 for(const t of all.teams)assert.equal(t.rankChange,0);
});

test('Window points, averages and bowler stats only count the chosen weeks',()=>{
 const s=season(5),w=calculateWindow(s,{weeks:2});
 assert.deepEqual(w.weeks.map(x=>x.week),[4,5]);
 const official=s.results.filter(r=>r.week>=4);
 for(const t of w.teams){
  assert.equal(t.weeksPlayed,2);
  const ms=official.flatMap(r=>r.matches.filter(m=>m.teamA===t.number||m.teamB===t.number));
  const pins=ms.reduce((n,m)=>n+(m.teamA===t.number?m.a:m.b).reduce((a,b)=>a+b,0),0);
  assert.equal(t.average,pins/6);
  assert.equal(t.points,Object.values(t.weekly).reduce((n,x)=>n+x.points,0));
  assert.ok(t.allPlayPct>=0&&t.allPlayPct<=1);
 }
 assert.equal(w.teams.reduce((n,t)=>n+t.points,0),9*9*2);
 const b=w.bowlers[0];assert.equal(b.games,6);assert.equal(b.weeks,2);
 const scores=s.results.filter(r=>r.week>=4).flatMap(r=>r.matches.flatMap(m=>m.players.filter(p=>p.bowlerId===b.id).flatMap(p=>p.scores)));
 assert.equal(b.average,scores.reduce((a,c)=>a+c,0)/6);
 const prior=s.results.filter(r=>r.week<4).flatMap(r=>r.matches.flatMap(m=>m.players.filter(p=>p.bowlerId===b.id).flatMap(p=>p.scores)));
 assert.equal(b.priorAverage,prior.reduce((a,c)=>a+c,0)/prior.length);
 assert.equal(w.bowlers.length,54);
});

test('Blinds count for team totals but not bowler stats',()=>{
 const s=season(3),r=s.results.at(-1),m=r.matches[0],p=m.players[0];p.type='blind';
 const w=calculateWindow(s,{weeks:1});
 assert.ok(!w.bowlers.some(b=>b.id===p.bowlerId));
 assert.equal(w.teams.find(t=>t.number===p.team).games,3);
});

test('Window page renders standings, points grid, averages and highlights',()=>{
 const s=season(5),html=windowView(s,{weeks:3,sorts:{}});
 for(const text of ['Last 3 weeks','Weeks 3–5','Points by week','Individual averages','Highlights','Team series by week','Individual series by week'])assert.ok(html.includes(text),text);
 assert.ok(windowView(seed(),{weeks:3}).includes('No weeks recorded yet'));
});

test('Summary shows Doug\'s items, with A/B/C best bowlers from league categories',()=>{
 const s=season(5);assignEnteringCategories(s);
 const html=windowView(s,{weeks:3,sorts:{}});
 for(const text of ['Most points','Best team game','Best team series','Best team average','Best A bowler','Best B bowler','Best C bowler','Best bowler (all)','Top 3 high games','Top 3 high series'])assert.ok(html.includes(text),text);
 const w=calculateWindow(s,{weeks:3});
 for(const c of ['A','B','C']){
  const rows=w.bowlers.filter(b=>b.category===c);assert.equal(rows.length,18);
  const top=Math.max(...rows.map(b=>b.average));
  assert.ok(html.includes(`Best ${c} bowler · average</div><div class="value">${Number(top).toLocaleString('en-US',{maximumFractionDigits:1})}<`),c);
 }
});
