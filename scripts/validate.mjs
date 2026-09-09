import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=new URL('../',import.meta.url);
for(const file of ['app.js','model.js','imports.js','cloud.js','simulation-worker.js','debug.js']){
 execFileSync(process.execPath,['--check',new URL('dist/'+file,root).pathname]);
 const code=fs.readFileSync(new URL('dist/'+file,root),'utf8');
 for(const m of code.matchAll(/from ['"]\.\/([^'"]+)['"]/g))if(!fs.existsSync(new URL('dist/'+m[1],root)))throw Error('Missing module '+m[1]);
}
const html=fs.readFileSync(new URL('dist/index.html',root),'utf8');
for(const m of html.matchAll(/(?:href|src)="\.\/([^"]+)"/g))if(!fs.existsSync(new URL('dist/'+m[1],root)))throw Error('Missing asset '+m[1]);
for(const name of ['001_foundation.sql','002_seed_league.sql','003_app_access.sql'])if(fs.readFileSync(new URL('dist/setup/'+name,root),'utf8')!==fs.readFileSync(new URL('supabase/migrations/'+name,root),'utf8'))throw Error('Outdated setup SQL '+name);
const s=JSON.parse(fs.readFileSync(new URL('dist/seed.json',root),'utf8'));
if(s.teams.length!==18||s.teams.some(t=>t.players.length!==3)||s.schedule.length!==34)throw Error('Invalid seed');
console.log('All static assets, modules, setup scripts, and seed references verified.');
