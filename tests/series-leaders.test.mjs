import {test} from 'node:test';
import assert from 'node:assert/strict';
import {calculateStats} from '../dist/stats.js';
import {statsView,statsDetail,sortAnalytics} from '../dist/stats-ui.js';

function fixture(){
 const bowlers=['a','b','c','d','e','f','sub'].map((id,i)=>({id,name:id,entering:200,category:i%3===0?'A':'B',history:[{season:'old',scores:[300,300,300]}]}));
 const players=['a','b','c','d','e','f'].map((bowlerId,i)=>({bowlerId,team:i<3?1:2,type:'actual',scores:Array(3).fill([220,200,190,230,210,180][i])}));
 return {season:'now',bowlers,teams:[{number:1,players:['a','b','c']},{number:2,players:['d','e','f']}],results:[{week:1,matches:[{teamA:1,teamB:2,players}]}]};
}
const stats=s=>calculateStats(s,{minimum:1}).bowlers;
const counts=s=>Object.fromEntries(stats(s).map(b=>[b.id,[b.teamSeriesLeads,b.pairSeriesLeads]]));
test('Series leaders compare full three-game totals and count repeated weeks and ties',()=>{
 const s=fixture();assert.deepEqual(counts(s).a,[1,0]);assert.deepEqual(counts(s).d,[1,1]);
 const next=structuredClone(s.results[0]);next.week=2;
 next.matches[0].players[0].scores=[300,200,190];
 next.matches[0].players[1].scores=[230,230,230];s.results.push(next);
 assert.deepEqual(counts(s).a,[2,1]);assert.deepEqual(counts(s).b,[1,1]);assert.deepEqual(counts(s).d,[2,2]);
});
test('Substitutes receive credit on their weekly team; blinds and simulations cannot win',()=>{
 const s=fixture(),p=s.results[0].matches[0].players;
 p[0].bowlerId='sub';p[0].scores=[250,250,250];p[3].type='blind';p[3].scores=[300,300,300];
 const simulated=structuredClone(s.results[0]);simulated.week=2;simulated.simulated=true;s.results.push(simulated);
 assert.deepEqual(counts(s).sub,[1,1]);assert.deepEqual(counts(s).a,[0,0]);assert.deepEqual(counts(s).d,[0,0]);assert.deepEqual(counts(s).e,[1,0]);
});
test('Incomplete opponents skip pair counts but keep complete team counts',()=>{
 const s=fixture();s.results[0].matches[0].players.pop();
 assert.deepEqual(counts(s).a,[1,0]);assert.deepEqual(counts(s).d,[0,0]);
});
test('Filters never remove opponents from comparisons; history is unavailable',()=>{
 const s=fixture();s.bowlers.find(b=>b.id==='d').category='B';
 const a=calculateStats(s,{minimum:1,category:'A'}).qualified.find(b=>b.id==='a');assert.equal(a.pairSeriesLeads,0);
 const next=structuredClone(s.results[0]);next.week=2;next.matches[0].players[3].type='absent';s.results.push(next);
 assert.equal(calculateStats(s,{minimum:6}).qualified.find(b=>b.id==='a').pairSeriesLeads,1);
 assert.ok(calculateStats(s,{source:'old',minimum:1}).bowlers.every(b=>b.teamSeriesLeads===null&&b.pairSeriesLeads===null));
});
test('Series leader counts render in sortable leaderboard and bowler details without mutating scores',()=>{
 const s=fixture(),before=structuredClone(s);
 assert.match(statsView(s,{tab:'leaders',minimum:1}),/data-analytics-sort="pairSeriesLeads"/);
 assert.match(statsDetail(s,'a',{minimum:1}),/Highest series on team · times/);
 assert.equal(sortAnalytics(stats(s),'pairSeriesLeads')[0].id,'d');
 assert.deepEqual(s,before);
});
