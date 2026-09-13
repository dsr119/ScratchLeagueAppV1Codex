import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {prepareWeeklyImport,weeklyPreview} from '../dist/imports.js';
import {profile,standings} from '../dist/model.js';
const seed=()=>JSON.parse(fs.readFileSync(new URL('../dist/seed.json',import.meta.url)));
const rows=s=>[['Week','TeamNumber','Bowler','Gm1','Gm2','Gm3','ScoreType'],...s.teams.flatMap(t=>t.players.map(id=>[1,t.number,s.bowlers.find(b=>b.id===id).name,200,210,220,'actual']))];
test('New substitute is staged, receives scores, and leaves regulars unchanged',()=>{
 const s=seed(),csv=rows(s),original=structuredClone(s),regular=s.bowlers.find(b=>b.name===csv[1][2]);
 csv[1][2]='New Substitute';const input=structuredClone(csv);
 assert.equal(prepareWeeklyImport(csv,s).unmatched.length,1);
 const p=prepareWeeklyImport(csv,s,{2:'new'});
 assert.deepEqual(p.errors,[]);assert.equal(p.newBowlers.length,1);
 assert.deepEqual(s,original);assert.deepEqual(csv,input);
 const sub=p.newBowlers[0];assert.equal(sub.team,null);assert.equal(sub.entering,null);
 s.bowlers.push(sub);s.results.push(p.result);
 assert.equal(profile(s,sub).currentGames,3);assert.equal(profile(s,regular).currentGames,0);
 assert.equal(standings(s).find(t=>t.number===1).pins,1890);
 assert.deepEqual(s.teams,original.teams);
 assert.equal(prepareWeeklyImport(csv,s).newBowlers.length,0);
});
test('Mapping a misspelled name uses an existing substitute without creating anyone',()=>{
 const s=seed(),csv=rows(s),sub=s.bowlers.find(b=>b.name==='Joe Falvo');csv[1][2]='Joe Falvo typo';
 const p=prepareWeeklyImport(csv,s,{2:sub.id});assert.deepEqual(p.errors,[]);
 assert.equal(p.newBowlers.length,0);
 assert.ok(p.result.matches.flatMap(m=>m.players).some(b=>b.bowlerId===sub.id));
 csv[2][2]='Joe Falvo';assert.match(prepareWeeklyImport(csv,s,{2:sub.id}).errors[0].message,/more than once/);
});
test('Invalid scores, missing rows, duplicate new names and blank names remain blocked',()=>{
 const s=seed(),csv=rows(s),original=structuredClone(s);csv[1][2]='New Substitute';csv[1][3]=301;
 assert.ok(prepareWeeklyImport(csv,s,{2:'new'}).errors.length);assert.deepEqual(s,original);
 csv[1][3]=200;assert.ok(prepareWeeklyImport(csv.slice(0,-1),s,{2:'new'}).errors.length);
 csv[2][2]='New Substitute';assert.ok(prepareWeeklyImport(csv,s,{2:'new',3:'new'}).errors.length);
 csv[1][2]='';assert.ok(prepareWeeklyImport(csv,s,{2:'new'}).errors.length);
});
test('Blind substitute scores count for the team but do not train the substitute',()=>{
 const s=seed(),csv=rows(s);csv[1][2]='New Substitute';csv[1][6]='blind';
 const p=prepareWeeklyImport(csv,s,{2:'new'});assert.deepEqual(p.errors,[]);
 s.bowlers.push(...p.newBowlers);s.results.push(p.result);
 assert.equal(profile(s,p.newBowlers[0]).currentGames,0);
 assert.equal(standings(s).find(t=>t.number===1).pins,1890);
 assert.ok(weeklyPreview(csv,s).errors.length); // Reimporting the same week is blocked.
});
