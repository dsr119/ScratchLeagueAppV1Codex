import {test} from 'node:test';
import assert from 'node:assert/strict';
test('Cloud save verifies full workspace read-back, including JSON key reordering',async t=>{
 const oldFetch=globalThis.fetch,oldStorage=globalThis.sessionStorage;
 t.after(()=>{globalThis.fetch=oldFetch;if(oldStorage===undefined)delete globalThis.sessionStorage;else globalThis.sessionStorage=oldStorage;});
 globalThis.sessionStorage={getItem:()=>JSON.stringify({access_token:'mock-only',expires_at:Date.now()/1000+3600,user:{email:'test@example.invalid'}}),setItem(){},removeItem(){}};
 let saved=null,corrupt=false;
 globalThis.fetch=async(url,options)=>{
  if(url.includes('/rpc/')){saved=JSON.parse(options.body).p_state;return new Response('2');}
  if(url.includes('/app_admins'))return new Response('[{"user_id":"test"}]');
  if(url.includes('/league_workspaces')){const copy=JSON.parse(JSON.stringify(saved));if(corrupt)copy.results=[];return new Response(JSON.stringify([{revision:2,state:copy}]));}
  throw Error('Unexpected test request');
 };
 const {cloud,sameWorkspace}=await import('../dist/cloud.js?save-verification-test');
 assert.equal(sameWorkspace({a:1,b:{c:2,d:3}},{b:{d:3,c:2},a:1}),true);
 const state={teams:[{number:18,players:['regular']}],bowlers:[{id:'sub',name:'Brayden Herbst'}],results:[{week:3,matches:[{players:[{bowlerId:'sub',team:18,scores:[174,201,195]}]}]}]};
 assert.equal(await cloud.save(state,1),2);assert.equal(cloud.verification.verifiedSave,true);assert.equal(cloud.verification.week3.allBowlersPersisted,true);assert.equal(cloud.verification.week3.substitutes[0].bowlerId,'sub');
 corrupt=true;await assert.rejects(()=>cloud.save(state,1),/read-back did not match/);assert.notEqual(cloud.verification.verifiedSave,true);
});
