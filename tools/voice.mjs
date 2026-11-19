// Makes every voice clip the game needs with Gemini text-to-speech, as small MP3s in audio/.
//   node tools/voice.mjs list           how many clips, how many already exist (free)
//   node tools/voice.mjs test           make ONE clip and print the response shape (a few cents at most)
//   node tools/voice.mjs make [limit]   make all missing clips (paid). Safe to re-run: skips what exists.
// The API key is read from disk and never printed. Spend is appended to tools/voice-usage.json.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = path.resolve(path.dirname(decodeURIComponent(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(root, 'audio');
const USAGE = path.join(root, 'tools', 'voice-usage.json');
const MODEL = process.env.VOICE_MODEL || 'gemini-3.8-flash-tts';
const TEACHER = { voice: 'kore', style: 'A warm, patient Ukrainian language teacher. Native Ukrainian pronunciation, slow and very clear.' };

const win = {};
new Function('window', fs.readFileSync(path.join(root, 'data.js'), 'utf8'))(win);
const D = win.DATA;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function clips() {
  const list = [];
  for (const w of D.words) list.push({ id: 'w_' + w.id, text: cap(w.uk) + '.', ...TEACHER });
  for (const p of D.phrases) list.push({ id: 'p_' + p.id, text: p.uk, ...TEACHER });
  for (const n of D.npcs) {
    for (const [k, l] of Object.entries(n.lines)) list.push({ id: `v_${n.id}_${k}`, text: l.uk, voice: n.voice, style: n.style });
    // in winter everyone who asks for things can ask for firewood too
    for (const item of n.wants.length ? [...n.wants, 'drova'] : []) {
      const w = D.words.find(x => x.id === item);
      if (n.id === 'olia') list.push({ id: `q_${n.id}_${item}`, text: D.questLine.uk.replace('%s', w.acc || w.uk), voice: n.voice, style: n.style });
      list.push({ id: `qp_${n.id}_${item}`, text: D.payLine.uk.replace('%s', w.acc || w.uk), voice: n.voice, style: n.style });
    }
  }
  for (const ct of D.cats || []) list.push({ id: 'c_' + ct.id, text: ct.line, ...TEACHER });
  const olia = D.npcs.find(n => n.id === 'olia');
  (D.story || []).forEach(st => list.push({ id: st.clip, text: st.uk, voice: olia.voice, style: olia.style }));   // pages keep their clip when their line is unchanged
  const ok = D.npcs.find(n => n.id === 'oksana');
  for (const [num, text] of Object.entries(D.prices)) list.push({ id: 'n_' + num, text, voice: ok.voice, style: ok.style });
  return list;
}

const key = () => fs.readFileSync('C:/Mikes Stuff/Gemini api2.txt', 'utf8').split(/\r?\n/).map(s => s.trim()).find(s => /^AQ\./.test(s));

function findAudio(o, depth = 0) {
  // The audio can sit in a few places depending on the API version: look for any base64 "data" beside a mime type.
  if (!o || typeof o !== 'object' || depth > 8) return null;
  if (typeof o.data === 'string' && o.data.length > 200) return { data: o.data, mime: o.mime_type || o.mimeType || '' };
  for (const v of Object.values(o)) { const r = findAudio(v, depth + 1); if (r) return r; }
  return null;
}

async function tts(c) {
  const body = {
    model: MODEL,
    input: [{ type: 'user_input', content: [{ type: 'text', text: c.text, annotations: [{ type: 'speech_metadata', style: c.style }] }] }],
    response_format: { type: 'audio' },
    generation_config: { speech_config: [{ voice: c.voice }] },
    store: false,
  };
  const k = key();
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST', headers: { 'x-goog-api-key': k, 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) { const e = new Error(`HTTP ${r.status}: ${txt.split(k).join('[key]').slice(0, 300)}`); e.status = r.status; throw e; }
  return JSON.parse(txt);
}

function save(c, audio) {
  const raw = Buffer.from(audio.data, 'base64');
  const isWav = raw.slice(0, 4).toString() === 'RIFF';
  const rate = (/rate=(\d+)/.exec(audio.mime) || [])[1] || '24000';
  const tmp = path.join(OUT, c.id + (isWav ? '.tmp.wav' : '.tmp.pcm'));
  fs.writeFileSync(tmp, raw);
  const inArgs = isWav ? ['-i', tmp] : ['-f', 's16le', '-ar', rate, '-ac', '1', '-i', tmp];
  // Trim leading/trailing silence, even out loudness, small mono MP3.
  const af = 'silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.05,areverse,silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.12,areverse,loudnorm=I=-17:TP=-1.5';
  const ff = spawnSync('ffmpeg', ['-v', 'error', '-y', ...inArgs, '-af', af, '-ar', '24000', '-ac', '1', '-b:a', '48k', path.join(OUT, c.id + '.mp3')]);
  fs.unlinkSync(tmp);
  if (ff.status !== 0) throw new Error('ffmpeg failed: ' + String(ff.stderr).slice(0, 200));
}

function logUsage(c, usage) {
  const all = fs.existsSync(USAGE) ? JSON.parse(fs.readFileSync(USAGE, 'utf8')) : [];
  all.push({ t: new Date().toISOString(), id: c.id, model: MODEL, usage });
  fs.writeFileSync(USAGE, JSON.stringify(all));
}

const shape = (o, d = 0) => (o && typeof o === 'object')
  ? (Array.isArray(o) ? '[' + (o.length ? shape(o[0], d + 1) : '') + ']' : '{' + Object.entries(o).map(([k, v]) => k + ':' + (d > 4 ? '…' : shape(v, d + 1))).join(',') + '}')
  : (typeof o === 'string' ? (o.length > 40 ? `str(${o.length})` : JSON.stringify(o)) : String(o));

const cmd = process.argv[2];
const all = clips();
fs.mkdirSync(OUT, { recursive: true });
const missing = all.filter(c => !fs.existsSync(path.join(OUT, c.id + '.mp3')) && (!process.env.ONLY || c.id.startsWith(process.env.ONLY)));   // ONLY=st_ makes just those

if (cmd === 'list') {
  console.log(`${all.length} clips, ${missing.length} missing, ${all.reduce((s, c) => s + c.text.length, 0)} characters of Ukrainian in total`);
  for (const c of missing) console.log('  missing', c.id, c.text);
  if (process.env.IDS) fs.writeFileSync(process.env.IDS, JSON.stringify(all.map(c => c.id)));   // IDS=file: every clip id in use
} else if (cmd === 'test') {
  const c = all.find(x => x.id === (process.argv[3] || 'w_khlib'));
  const res = await tts(c);
  console.log('shape:', shape(res).slice(0, 900));
  const a = findAudio(res);
  if (!a) { console.log('NO AUDIO FOUND'); process.exit(1); }
  save(c, a); logUsage(c, res.usage || null);
  console.log('saved', c.id, 'mime', a.mime, 'usage', JSON.stringify(res.usage || null));
} else if (cmd === 'make') {
  const limit = Number(process.argv[3] || 9999);
  const todo = missing.slice(0, limit);
  let done = 0, failed = 0, i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const c = todo[i++];
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          const res = await tts(c);
          const a = findAudio(res);
          if (!a) throw new Error('no audio in response');
          save(c, a); logUsage(c, res.usage || null); done++;
          break;
        } catch (e) {
          if (attempt === 5) { failed++; console.log('FAILED', c.id, String(e.message).slice(0, 160)); }
          else await new Promise(r => setTimeout(r, (e.status === 429 ? 20000 : 3000) * attempt));
        }
      }
      if ((done + failed) % 20 === 0) console.log(`progress ${done + failed}/${todo.length}`);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  console.log(`made ${done}, failed ${failed}, still missing ${all.filter(c => !fs.existsSync(path.join(OUT, c.id + '.mp3'))).length}`);
} else if (cmd === 'audit') {
  // Listen back to every clip with Gemini and compare what it hears to what was meant.
  // Clips that don't match are deleted so the next "make" redoes them.
  const norm = t => t.toLowerCase().replace(/[^а-яіїєґ' ]/g, ' ').replace(/'/g, '').replace(/\s+/g, ' ').trim();
  const have = all.filter(c => fs.existsSync(path.join(OUT, c.id + '.mp3')));
  const only = process.argv[3] && !process.argv[3].startsWith('--') ? have.filter(c => c.id.startsWith(process.argv[3])) : have;
  const bad = [];
  for (let i = 0; i < only.length; i += 16) {
    const batch = only.slice(i, i + 16);
    const parts = [{ text: `There are ${batch.length} audio clips of Ukrainian speech. Transcribe each one EXACTLY as spoken, letter for letter, in Ukrainian Cyrillic. Do not correct, guess or normalise: if a clip has an extra syllable or a wrong word, write it as heard. Say nothing else. Reply with only a JSON array of ${batch.length} strings, in order.` }];
    for (const c of batch) parts.push({ inlineData: { mimeType: 'audio/mp3', data: fs.readFileSync(path.join(OUT, c.id + '.mp3')).toString('base64') } });
    const k = key();
    let heard = null;
    for (let attempt = 0; attempt < 3 && !heard; attempt++) {
      const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent', { method: 'POST', headers: { 'x-goog-api-key': k, 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ parts }], generationConfig: { responseMimeType: 'application/json' } }) });
      const j = await r.json();
      if (!r.ok) { console.log('audit HTTP', r.status, JSON.stringify(j).split(k).join('[key]').slice(0, 200)); continue; }
      logUsage({ id: 'audit' }, j.usageMetadata || null);
      try { const h = JSON.parse(j.candidates[0].content.parts.map(p => p.text || '').join('')); if (Array.isArray(h) && h.length === batch.length) heard = h; } catch (e) {}
    }
    if (!heard) { console.log('audit: gave up on batch', i); continue; }
    batch.forEach((c, n) => { if (norm(String(heard[n] || '')) !== norm(c.text)) bad.push({ id: c.id, want: c.text, heard: heard[n] }); });
  }
  console.log(`audited ${only.length}, mismatched ${bad.length}`);
  for (const b of bad) console.log(`  ${b.id}: wanted "${b.want}" heard "${b.heard}"`);
  if (process.argv.includes('--delete')) for (const b of bad) fs.unlinkSync(path.join(OUT, b.id + '.mp3'));
} else {
  console.log('usage: node tools/voice.mjs list | test [clipId] | make [limit] | audit [prefix] [--delete]');
}
