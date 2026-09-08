import {currentWeek,weekPairs} from './model.js';
export function parseCSV(text){
 const rows=[];let row=[],cell='',quote=false;
 text=text.replace(/^\uFEFF/,'');
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else if(!quote&&cell==='')quote=true;else if(quote)quote=false;else cell+=c;}
 else if(c===','&&!quote){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=c;}
 if(quote)throw Error('CSV contains an unclosed quote.');row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
}
const norm=s=>String(s??'').toLowerCase().replace(/[^a-z0-9]/g,'');
function records(rows){const headers=rows[0]?.map(norm)||[];return rows.slice(1).map((row,i)=>({line:i+2,...Object.fromEntries(headers.map((h,j)=>[h,row[j]??'']))}));}
export function dateString(value){if(typeof value==='number')return new Date(Date.UTC(1899,11,30)+value*86400000).toISOString().slice(0,10);const s=String(value??'').trim();if(/^\d{4}-\d\d-\d\d/.test(s))return s.slice(0,10);const m=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);if(m){const y=+m[3]+(m[3].length===2?2000:0);return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;}return null;}
function games(r){const out=[];for(let g=1;g<=4;g++){const v=r['gm'+g]??r['game'+g]??'';if(v===''||v==null){if(g<=3)throw Error('Missing Game '+g);continue;}const n=Number(v);if(!Number.isInteger(n)||n<0||n>300)throw Error('Game '+g+' must be an integer from 0 to 300');out.push(n);}return out;}
export function historyPreview(rows,season,filename){
 const sessions=[],issues=[];let skipped=0;
 for(const r of records(rows)){
  if(!r.date&&!r.week){skipped++;continue;}
  try{const date=dateString(r.date);if(!date)throw Error('Missing or unrecognized date');if(!/^\d{4}-\d{4}$/.test(season))throw Error('Season must look like 2025-2026');
   const scores=games(r),total=scores.reduce((a,b)=>a+b,0),ss=r.ss??r.series;
   const type=norm(r.scoretype??r.type);if(type==='blind'||type==='absent'||type==='vacant'){skipped++;continue;}
   if(ss!==undefined&&ss!==''&&Number(ss)!==total)throw Error(`Series ${ss} differs from visible games (${total}). Add or correct the game score before importing.`);
   sessions.push({date,season,week:Number(r.week)||null,scores,source:filename});
  }catch(e){issues.push({line:r.line,message:e.message});}
 }
 if(!sessions.length&&!issues.length)issues.push({line:1,message:'No dated game rows found. Expected Date, Gm1, Gm2, Gm3 columns.'});
 return {sessions,issues,skipped};
}
export function mergeHistory(existing,sessions){const next=structuredClone(existing),duplicates=[];for(const s of sessions){const old=next.find(h=>h.season===s.season&&h.date===s.date);if(old){if(JSON.stringify(old.scores)!==JSON.stringify(s.scores))throw Error(`Conflicting scores on ${s.date}. Existing history was preserved.`);duplicates.push(s.date);}else next.push(s);}return{history:next.sort((a,b)=>a.date.localeCompare(b.date)),duplicates};}
export function findBowler(state,value){const n=norm(value),matches=state.bowlers.filter(b=>[b.name,b.sourceName,...(b.aliases||[])].some(x=>norm(x)===n));return matches.length===1?matches[0]:null;}
export function weeklyPreview(rows,state){
 const errors=[],entries=[];
 for(const r of records(rows)){try{
  const week=Number(r.week),team=Number(r.teamnumber??r.team??r.teamno),bowler=findBowler(state,r.bowler??r.name);
  if(!Number.isInteger(week)||week<1||week>34)throw Error('Week must be 1–34');
  if(!state.teams.some(t=>t.number===team))throw Error('Unknown team number');
  if(!bowler)throw Error('Bowler name was not matched uniquely: '+(r.bowler??r.name??''));
  const scores=games(r);if(scores.length!==3)throw Error('Regular-season results require three games');
  const type=norm(r.scoretype??'actual');if(!['actual','blind'].includes(type))throw Error('ScoreType must be actual or blind');
  entries.push({week,team,bowlerId:bowler.id,scores,type});
 }catch(e){errors.push({line:r.line,message:e.message});}}
 if(errors.length)return{errors};
 const weeks=[...new Set(entries.map(e=>e.week))];if(weeks.length!==1)return{errors:[{line:1,message:'Upload exactly one complete league week per CSV.'}]};
 const week=weeks[0];if(week!==currentWeek(state)+1)return{errors:[{line:1,message:`Next expected week is ${currentWeek(state)+1}. Already imported weeks cannot be added twice.`}]};
 if(new Set(entries.map(e=>e.bowlerId)).size!==entries.length)return{errors:[{line:1,message:'A bowler appears more than once in this week.'}]};
 for(const t of state.teams)if(entries.filter(e=>e.team===t.number).length!==3)errors.push({line:1,message:`Team ${t.number} needs exactly three bowler rows.`});
 if(errors.length)return{errors};
 const matches=weekPairs(state,week).map(([teamA,teamB])=>{const a=entries.filter(e=>e.team===teamA),b=entries.filter(e=>e.team===teamB);const total=p=>[0,1,2].map(i=>p.reduce((s,r)=>s+r.scores[i],0));return{teamA,teamB,a:total(a),b:total(b),players:[...a,...b]};});
 return{errors:[],result:{week,date:state.schedule.find(s=>s.week===week).date,matches},entries:entries.length};
}
// Read standard XLSX ZIP containers using the browser's native decompressor.
// No formulas are executed; only cached cell values are imported.
export async function readXlsx(buffer){
 const view=new DataView(buffer),bytes=new Uint8Array(buffer),files={};let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw Error('This is not a supported XLSX workbook. CSV files also work.');
 const count=view.getUint16(end+10,true);if(count>2000)throw Error('Workbook contains too many files.');let offset=view.getUint32(end+16,true),expanded=0;
 const decoder=new TextDecoder();
 for(let n=0;n<count;n++){
  if(view.getUint32(offset,true)!==0x02014b50)throw Error('Invalid workbook directory.');
  const method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true),rawSize=view.getUint32(offset+24,true),nl=view.getUint16(offset+28,true),ex=view.getUint16(offset+30,true),co=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
  const name=decoder.decode(bytes.slice(offset+46,offset+46+nl));offset+=46+nl+ex+co;
  if(!/^xl\/(worksheets\/sheet\d+\.xml|sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels)$/.test(name))continue;
  expanded+=rawSize;if(expanded>40*1024*1024)throw Error('Workbook is too large; split it into smaller files.');
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),data=bytes.slice(start,start+size);
  if(method===0)files[name]=decoder.decode(data);else if(method===8){const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));files[name]=await new Response(stream).text();}else throw Error('Unsupported workbook compression. Save as CSV.');
 }
 const xml=s=>{const d=new DOMParser().parseFromString(s,'application/xml');if(d.getElementsByTagName('parsererror').length)throw Error('Workbook XML could not be read.');return d;};
 const tags=(el,n)=>Array.from(el.getElementsByTagNameNS('*',n));
 const strings=files['xl/sharedStrings.xml']?tags(xml(files['xl/sharedStrings.xml']),'si').map(si=>tags(si,'t').map(t=>t.textContent).join('')):[];
 const wb=xml(files['xl/workbook.xml']),rels=xml(files['xl/_rels/workbook.xml.rels']);
 const targets=Object.fromEntries(tags(rels,'Relationship').map(r=>[r.getAttribute('Id'),r.getAttribute('Target')]));
 return tags(wb,'sheet').map(sheet=>{
  const target=targets[sheet.getAttribute('r:id')]||'',path=target.startsWith('/')?target.slice(1):'xl/'+target.replace(/^\.\//,'');if(!files[path])return null;
  const rows=tags(xml(files[path]),'row').map(row=>{const cells=[];for(const c of tags(row,'c')){const letters=(c.getAttribute('r')||'A').match(/^[A-Z]+/)[0];let col=0;for(const l of letters)col=col*26+l.charCodeAt(0)-64;const type=c.getAttribute('t'),v=tags(c,'v')[0]?.textContent??'';cells[col-1]=type==='s'?strings[Number(v)]:type==='inlineStr'?tags(c,'t').map(t=>t.textContent).join(''):v!==''&&Number.isFinite(Number(v))?Number(v):v;}return cells;});
  return{name:sheet.getAttribute('name'),rows};
 }).filter(Boolean);
}
