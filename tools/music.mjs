// Makes theme-music candidates with Gemini Lyria (paid). Saves MP3s in music/ and logs usage.
//   node tools/music.mjs "<name>" "<prompt>" [lyria-3.5|lyria-3-clip-preview]
import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')), '..');
const [name, prompt, model = 'lyria-3.5'] = process.argv.slice(2);
if (!name || !prompt) { console.log('usage: node tools/music.mjs <name> "<prompt>" [model]'); process.exit(1); }
const key = fs.readFileSync('C:/Mikes Stuff/Gemini api2.txt', 'utf8').split(/\r?\n/).map(s => s.trim()).find(s => /^AQ\./.test(s));
const find = (o, d = 0) => { if (!o || typeof o !== 'object' || d > 8) return null; if (typeof o.data === 'string' && o.data.length > 1000) return o; for (const v of Object.values(o)) { const r = find(v, d + 1); if (r) return r; } return null; };
const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
  method: 'POST', headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
  body: JSON.stringify({ model, input: prompt, response_format: { type: 'audio' }, store: false }),
});
const txt = await r.text();
if (!r.ok) { console.log('HTTP', r.status, txt.split(key).join('[key]').slice(0, 400)); process.exit(1); }
const j = JSON.parse(txt);
const a = find(j);
if (!a) { console.log('no audio; status', j.status, JSON.stringify(j).slice(0, 400)); process.exit(1); }
fs.mkdirSync(path.join(root, 'music'), { recursive: true });
const ext = /wav/i.test(a.mime_type || '') ? 'wav' : 'mp3';
const out = path.join(root, 'music', `${name}.${ext}`);
fs.writeFileSync(out, Buffer.from(a.data, 'base64'));
const texts = (j.steps || []).flatMap(s => (s.content || []).filter(c => c.type === 'text').map(c => c.text)).join('\n');
console.log('saved', out, 'mime', a.mime_type, 'bytes', fs.statSync(out).size);
console.log('usage', JSON.stringify(j.usage || null));
if (texts) console.log('notes:', texts.slice(0, 500));
const log = path.join(root, 'tools', 'voice-usage.json');
const all = fs.existsSync(log) ? JSON.parse(fs.readFileSync(log, 'utf8')) : [];
all.push({ t: new Date().toISOString(), id: 'music:' + name, model, usage: j.usage || null });
fs.writeFileSync(log, JSON.stringify(all));
