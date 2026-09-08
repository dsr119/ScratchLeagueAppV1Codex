export const MODEL_VERSION='0.2.0-provisional';
export const sum=a=>a.reduce((s,x)=>s+x,0);
export const mean=a=>a.length?sum(a)/a.length:0;
export function matchPoints(a,b){
 if(a.length!==3||b.length!==3)throw Error('Regular matches require three team scores.');
 let pa=0,pb=0;
 for(let i=0;i<3;i++){pa+=a[i]>b[i]?2:a[i]===b[i]?1:0;pb+=b[i]>a[i]?2:a[i]===b[i]?1:0;}
 const sa=sum(a),sb=sum(b);pa+=sa>sb?3:sa===sb?1.5:0;pb+=sb>sa?3:sa===sb?1.5:0;
 return [pa,pb];
}
export function standings(state,third=0){
 const rows=state.teams.map(t=>({number:t.number,name:t.name,points:0,pins:0,games:0,weeks:0}));
 const map=Object.fromEntries(rows.map(r=>[r.number,r]));
 for(const result of state.results){
  const inPeriod=!third||(result.week>=(third-1)*11+1&&result.week<=third*11);
  for(const m of result.matches){
   const pts=matchPoints(m.a,m.b);
   [m.teamA,m.teamB].forEach((n,i)=>{const row=map[n];if(!row)return;
    // Team average uses season-to-date team pins / team games for position ties.
    row.pins+=sum(i?m.b:m.a);row.games+=3;
    if(inPeriod){row.points+=pts[i];row.weeks++;}
   });
  }
 }
 return rows.map(r=>({...r,average:r.games?r.pins/r.games:0})).sort((a,b)=>b.points-a.points||b.average-a.average||a.number-b.number);
}
export function currentWeek(state){let w=0;while(state.results.some(r=>r.week===w+1))w++;return w;}
export function positionPairs(rows){const p=[];for(let i=0;i<rows.length;i+=2)p.push([rows[i].number,rows[i+1].number]);return p;}
export function weekPairs(state,w){const row=state.schedule.find(x=>x.week===w);return row?.pairs.length?row.pairs:positionPairs(standings(state,w===34?0:Math.ceil(w/11)));}
export function profile(state,b){
 const prior=b.history.slice().sort((a,b)=>a.date.localeCompare(b.date)).flatMap(h=>h.scores);
 const recent=state.results.slice().sort((a,b)=>a.week-b.week).flatMap(r=>r.matches.flatMap(m=>(m.players||[]).filter(p=>p.bowlerId===b.id&&p.type!=='blind').flatMap(p=>p.scores)));
 const weighted=a=>{let total=0,weights=0;a.forEach((v,i)=>{const w=Math.pow(.992,a.length-1-i);total+=v*w;weights+=w;});return weights?total/weights:0;};
 const anchor=b.entering??200;
 const priorMean=prior.length?(weighted(prior)*prior.length+anchor*12)/(prior.length+12):anchor;
 const mu=recent.length?(weighted(recent)*recent.length+priorMean*30)/(recent.length+30):priorMean;
 const all=[...prior,...recent],avg=mean(all),variance=all.length>1?sum(all.map(x=>(x-avg)**2))/(all.length-1):900;
 const sd=Math.sqrt((Math.max(0,all.length-1)*variance+24*900)/(Math.max(0,all.length-1)+24));
 return {mean:mu,sd:Math.max(15,sd),priorGames:prior.length,currentGames:recent.length,observedMean:all.length?avg:null,provisional:!prior.length&&!recent.length};
}
export function projectedMean(p,adj,week){if(!adj)return p.mean;const fraction=adj.end===adj.start?(week>=adj.start?1:0):Math.max(0,Math.min(1,(week-adj.start)/(adj.end-adj.start)));return Math.max(0,Math.min(300,p.mean+adj.delta*fraction));}
export function random(seed){let a=seed>>>0;return()=>{a+=0x6D2B79F5;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
function normal(rng){return Math.sqrt(-2*Math.log(Math.max(1e-12,rng())))*Math.cos(2*Math.PI*rng());}
export function simulate(state,iterations=10000,seed=202627,onProgress=()=>{}){
 if(!Number.isInteger(iterations)||iterations<1||iterations>100000)throw Error('Choose 1–100,000 simulations.');
 const completed=currentWeek(state);if(state.results.length!==completed)throw Error('Import completed weeks in order before simulating.');
 const rng=random(seed),profiles=Object.fromEntries(state.bowlers.map(b=>[b.id,profile(state,b)]));
 const teams=state.teams;const nums=teams.map(t=>t.number);const teamMap=Object.fromEntries(teams.map(t=>[t.number,t]));
 for(const t of teams)if(t.players.length!==3||new Set(t.players).size!==3||t.players.some(id=>!profiles[id]))throw Error('Every team needs three distinct bowlers.');
 const lineup=teams.flatMap(t=>t.players);if(new Set(lineup).size!==lineup.length)throw Error('A bowler cannot start on two teams.');
 const score=(n,w,games,shared=0)=>{
  const totals=Array(games).fill(0);
  for(const id of teamMap[n].players){const p=profiles[id],mu=projectedMean(p,state.adjustments[id],w),night=normal(rng)*8;
   for(let g=0;g<games;g++)totals[g]+=Math.max(0,Math.min(300,Math.round(mu+shared+night+normal(rng)*Math.sqrt(Math.max(1,p.sd*p.sd-89)))));
  }return totals;
 };
 const duel=(a,b,w,games)=>{let x,y;do {const shared=normal(rng)*5;x=sum(score(a,w,games,shared));y=sum(score(b,w,games,shared));games=1;}while(x===y);return x>y?a:b;};
 // Simultaneous one-game ranking is a provisional multi-team roll-off format.
 const rolloff=ids=>{if(ids.length<2)return ids;const values=ids.map(n=>({n,s:sum(score(n,34,1))})).sort((a,b)=>b.s-a.s);const out=[];for(let i=0;i<values.length;){let j=i+1;while(j<values.length&&values[j].s===values[i].s)j++;out.push(...(j-i>1?rolloff(values.slice(i,j).map(v=>v.n)):[values[i].n]));i=j;}return out;};
 const pointRank=(ids,pts)=>{const ordered=ids.slice().sort((a,b)=>pts[b]-pts[a]),out=[];for(let i=0;i<ordered.length;){let j=i+1;while(j<ordered.length&&pts[ordered[j]]===pts[ordered[i]])j++;out.push(...rolloff(ordered.slice(i,j)));i=j;}return out;};
 const agg=Object.fromEntries(nums.map(n=>[n,{number:n,playoffs:0,champion:0,points:0,rank:0,thirds:[0,0,0],thirdPoints:[0,0,0],seeds:Array(7).fill(0)}]));
 const zero=()=>Object.fromEntries(nums.map(n=>[n,0]));
 for(let run=0;run<iterations;run++){
  const pts=zero(),thirdPts=zero(),pins=zero(),games=zero(),winners=[];
  const rank=(points)=>nums.slice().sort((a,b)=>points[b]-points[a]||(pins[b]/(games[b]||1)-pins[a]/(games[a]||1))||a-b);
  for(let w=1;w<=34;w++){
   const actual=state.results.find(r=>r.week===w);
   const schedule=state.schedule.find(s=>s.week===w);
   const pairs=actual?null:schedule.pairs.length?schedule.pairs:positionPairs(rank(w===34?pts:thirdPts).map(number=>({number})));
   const shared=normal(rng)*5;
   const matches=actual?actual.matches:pairs.map(([a,b])=>({teamA:a,teamB:b,a:score(a,w,3,shared),b:score(b,w,3,shared)}));
   for(const m of matches){const p=matchPoints(m.a,m.b);[m.teamA,m.teamB].forEach((n,i)=>{pts[n]+=p[i];thirdPts[n]+=p[i];pins[n]+=sum(i?m.b:m.a);games[n]+=3;});}
   if(w===11||w===22||w===33){const third=w/11,override=state.thirdWinners?.[third];let winner;
    if(w<=completed&&override){const max=Math.max(...Object.values(thirdPts));if(thirdPts[override]!==max)throw Error('Recorded third winner must be tied for the most third points.');winner=Number(override);}
    else winner=pointRank(nums,thirdPts)[0];
    for(const n of nums)agg[n].thirdPoints[third-1]+=thirdPts[n];
    winners.push(winner);agg[winner].thirds[third-1]++;for(const n of nums)thirdPts[n]=0;
   }
  }
  const ranked=rank(pts);ranked.forEach((n,i)=>{agg[n].points+=pts[n];agg[n].rank+=i+1;});
  const unique=[...new Set(winners)],multiple=unique.find(n=>winners.filter(x=>x===n).length>1);
  let seeds=pointRank(unique,pts);if(multiple)seeds=[multiple,...seeds.filter(n=>n!==multiple)];
  seeds.push(...pointRank(nums.filter(n=>!unique.includes(n)),pts).slice(0,7-seeds.length));
  seeds.forEach((n,i)=>{agg[n].playoffs++;agg[n].seeds[i]++;});
  const earlyA=duel(seeds[6],seeds[3],35,3),earlyB=duel(seeds[5],seeds[4],35,3);
  let champion=duel(earlyA,earlyB,35,3);champion=duel(champion,seeds[2],36,3);champion=duel(champion,seeds[1],36,3);champion=duel(champion,seeds[0],37,4);agg[champion].champion++;
  if(run%250===0)onProgress(run/iterations);
 }
 return {id:globalThis.crypto?.randomUUID?.()||String(Date.now()),createdAt:new Date().toISOString(),modelVersion:MODEL_VERSION,iterations,seed,completedWeeks:completed,adjustments:structuredClone(state.adjustments),provisional:true,teams:Object.values(agg).map(r=>({...r,playoffs:r.playoffs/iterations,champion:r.champion/iterations,points:r.points/iterations,rank:r.rank/iterations,thirds:r.thirds.map(n=>n/iterations),thirdPoints:r.thirdPoints.map(n=>n/iterations),seeds:r.seeds.map(n=>n/iterations)}))};
}
