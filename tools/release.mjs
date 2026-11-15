// Stamps a new version number everywhere it lives, so phones notice and update themselves.
//   node tools/release.mjs 0.8
// Updates: the label on the title screen, window.APP_VERSION, the ?v= on the scripts,
// version.json (what running copies check), the offline cache name in sw.js, and 404.html.
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')), '..');
const v = process.argv[2];
if (!/^\d+\.\d+(\.\d+)?$/.test(v || '')) { console.log('usage: node tools/release.mjs <version, e.g. 0.8>'); process.exit(1); }
const f = p => path.join(root, p);
let html = fs.readFileSync(f('index.html'), 'utf8');
html = html.replace(/<div class="ver">v[\d.]+<\/div>/, `<div class="ver">v${v}</div>`)
  .replace(/window\.APP_VERSION = '[\d.]+'/, `window.APP_VERSION = '${v}'`)
  .replace(/(src="(?:data|game)\.js)(?:\?v=[\d.]+)?"/g, `$1?v=${v}"`);
if (!html.includes(`window.APP_VERSION = '${v}'`) || !html.includes(`game.js?v=${v}`) || !html.includes(`>v${v}<`)) { console.log('index.html did not take the new version'); process.exit(1); }
fs.writeFileSync(f('index.html'), html);
fs.writeFileSync(f('404.html'), html);
fs.writeFileSync(f('version.json'), JSON.stringify({ v }) + '\n');
let sw = fs.readFileSync(f('sw.js'), 'utf8');
sw = sw.replace(/const CACHE = 'kotiacha-dolyna-[^']*';/, `const CACHE = 'kotiacha-dolyna-${v}';`);
fs.writeFileSync(f('sw.js'), sw);
console.log('stamped v' + v);
