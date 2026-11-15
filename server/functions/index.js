// Kotiacha Dolyna: scores how well a beginner said a Ukrainian word.
// The game sends a short WAV recording and the target word; Gemini listens and answers with a generous score.
// The Gemini key lives only here (secret KD_GEMINI_KEY), never in the game. Calls are capped per day.
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const crypto = require('crypto');

admin.initializeApp();
const KEY = defineSecret('KD_GEMINI_KEY');
const MODEL = 'gemini-3.5-flash-lite';
const DAILY_TOTAL = 400;   // all players together, per day
const DAILY_PER_IP = 80;   // one player, per day (a cooking round is about 6 attempts)
const MAX_WAV_BYTES = 400 * 1024;
const ORIGINS = ['https://spacepanda99.github.io'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const okOrigin = o => ORIGINS.includes(o) || LOCAL.test(o || '');
const clean = (s, n) => String(s || '').replace(/[^\p{L}\p{N} '’ʼ().,-]/gu, '').slice(0, n);

// Compare words the way a beginner should be judged: ignore apostrophes, the soft sign, and i/y mix-ups.
const norm = x => String(x || '').toLowerCase().replace(/[^\p{L}]/gu, '').replace(/ь/g, '').replace(/ґ/g, 'г').replace(/[иї]/g, 'і');
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

async function underCap(ip) {
  const day = new Date().toISOString().slice(0, 10);
  const db = admin.firestore();
  const totalRef = db.doc(`kdSpeechUsage/${day}`);
  const ipRef = db.doc(`kdSpeechUsage/${day}_${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}`);
  return db.runTransaction(async t => {
    const [a, b] = await Promise.all([t.get(totalRef), t.get(ipRef)]);
    const total = (a.exists && a.data().n) || 0, mine = (b.exists && b.data().n) || 0;
    if (total >= DAILY_TOTAL || mine >= DAILY_PER_IP) return false;
    t.set(totalRef, { n: total + 1, day }, { merge: true });
    t.set(ipRef, { n: mine + 1, day, kind: 'ip' }, { merge: true });
    return true;
  });
}

exports.kdScoreSpeech = onRequest({ region: 'us-central1', secrets: [KEY], invoker: 'public', memory: '256MiB', timeoutSeconds: 40, maxInstances: 3 }, async (req, res) => {
  const origin = req.get('origin');
  if (okOrigin(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Headers', 'content-type'); res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST' || !okOrigin(origin)) return res.status(403).json({ error: 'not allowed' });

  const { word, wav } = req.body || {};
  const w = clean(word, 40);
  if (!w || typeof wav !== 'string' || wav.length < 200 || wav.length > MAX_WAV_BYTES * 1.4) return res.status(400).json({ error: 'bad request' });
  if (Buffer.from(wav.slice(0, 8), 'base64').slice(0, 4).toString() !== 'RIFF') return res.status(400).json({ error: 'bad audio' });

  const ip = (req.get('x-forwarded-for') || req.ip || 'x').split(',')[0].trim();
  try { if (!(await underCap(ip))) return res.status(429).json({ error: 'limit', message: 'Enough practice for today. Come back tomorrow!' }); }
  catch (err) { console.error('cap check failed'); return res.status(500).json({ error: 'server' }); }

  // Gemini is NOT told the target word. It only writes down what it hears and how clearly it was spoken, so
  // mumbling cannot pass; the score is worked out here by comparing what it heard with the target.
  const prompt = `Listen to this short recording of a language learner saying one Ukrainian word. Do not guess what they meant to say.
Reply as JSON with: heard (exactly the Ukrainian word you can make out, in Cyrillic, or "" if you cannot make out a real word; if it is unclear, write the nearest sounds rather than a word you expect), clarity (integer 0-100: how clearly and distinctly it was spoken; whispering, mumbling, trailing off, heavy noise or cut-off sounds are under 50; a clear attempt with a foreign accent is 80 or more).`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'audio/wav', data: wav } }] }],
    generationConfig: {
      temperature: 0, maxOutputTokens: 120, responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { heard: { type: 'STRING' }, clarity: { type: 'INTEGER' } }, required: ['heard', 'clarity'] },
    },
  };
  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': KEY.value(), 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!r.ok) { console.error('gemini status', r.status); return res.status(502).json({ error: 'upstream' }); }
    const j = await r.json();
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    const txt = (parts.find(x => typeof x.text === 'string') || {}).text;
    const out = JSON.parse(txt);
    const heard = clean(out.heard, 40), clarity = Math.max(0, Math.min(100, Math.round(Number(out.clarity) || 0)));
    const a = norm(w), b = norm(heard);
    const sim = !b ? 0 : 1 - lev(a, b) / Math.max(a.length, b.length, 1);
    const factor = clarity >= 70 ? 1 : 0.4 + 0.6 * clarity / 70;
    const score = Math.round(Math.max(0, Math.min(100, sim * 100 * factor)));
    let tip;
    if (!heard) tip = 'I could not make out a word. Speak up and say it slowly.';
    else if (score >= 90) tip = 'Wonderful, that was clear!';
    else if (sim >= 0.9 && clarity < 70) tip = 'Right word! Speak up a little and say each sound clearly.';
    else if (score >= 70) tip = `Very close. I heard "${heard}". Say it once more, slowly.`;
    else tip = `I heard "${heard}". Tap the speaker, then copy the sounds slowly.`;
    return res.json({ heard, score, tip });
  } catch (err) {
    console.error('score failed', String(err && err.message).slice(0, 120));
    return res.status(500).json({ error: 'server' });
  }
});
