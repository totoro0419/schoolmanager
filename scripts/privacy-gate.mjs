import {execFileSync} from 'node:child_process';
import {readdir} from 'node:fs/promises';
const tracked=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0');
const bad=tracked.filter(f=>/\.(pdf|zip)$/i.test(f)||/(^|\/)\.env(?!\.example$)/.test(f)||/^(data|fixtures)\//.test(f));
async function check(dir){for(const item of await readdir(dir,{withFileTypes:true})){const path=dir+'/'+item.name;if(item.isDirectory())await check(path);else if(/\.(pdf|zip)$/i.test(path))bad.push(path);}}
await check('dist');if(bad.length){console.error('Refusing to publish private-file paths:',bad);process.exit(1);}console.log('Privacy gate: source and public build contain no PDF, ZIP, data directory or .env files.');
