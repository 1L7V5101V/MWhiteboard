const fs=require('fs'),path=require('path');
const dir='_re/icons';
const out={};
for(const f of fs.readdirSync(dir)){
  if(!f.endsWith('.svg'))continue;
  const name=f.replace('.svg','');
  let s=fs.readFileSync(path.join(dir,f),'utf8');
  const inner=s.replace(/^[\s\S]*?<svg[^>]*>/,'').replace(/<\/svg>[\s\S]*$/,'').trim();
  const clean=inner.replace(/fill="#[0-9A-Fa-f]{3,8}"/g,'fill="currentColor"').replace(/\s+/g,' ');
  out[name]=clean;
}
fs.writeFileSync('_re/icons.js','var ICON='+JSON.stringify(out)+';\n');
console.log('icons',Object.keys(out).length,'bytes',fs.statSync('_re/icons.js').size);
