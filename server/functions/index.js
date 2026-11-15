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

  const { word, tr, en, wav } = req.body || {};
  const w = clean(word, 40), t = clean(tr, 40), e = clean(en, 40);
  if (!w || typeof wav !== 'string' || wav.length < 200 || wav.length > MAX_WAV_BYTES * 1.4) return res.status(400).json({ error: 'bad request' });
  if (Buffer.from(wav.slice(0, 8), 'base64').slice(0, 4).toString() !== 'RIFF') return res.status(400).json({ error: 'bad audio' });

  const ip = (req.get('x-forwarded-for') || req.ip || 'x').split(',')[0].trim();
  try { if (!(await underCap(ip))) return res.status(429).json({ error: 'limit', message: 'Enough practice for today. Come back tomorrow!' }); }
  catch (err) { console.error('cap check failed'); return res.status(500).json({ error: 'server' }); }

  const prompt = `You are a kind Ukrainian pronunciation coach for an adult beginner. They were asked to say the Ukrainian word "${w}" (sounds like ${t}, meaning "${e}"). Listen to the recording and judge it.
Reply as JSON with: heard (the Ukrainian word you actually heard, in Cyrillic, or "" if there was no speech), score (integer 0-100), tip (one short, warm English sentence of at most 14 words; if the score is under 80 give one concrete tip about the sound that was off).
Be generous: 85-100 means it is clearly the right word even with a foreign accent; 60-84 means recognisable but one sound is off; 30-59 means partly right; 0-29 means a different word, silence or only noise. Do not mark down an accent, speed, or soft versus hard consonants that a beginner cannot hear yet.`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'audio/wav', data: wav } }] }],
    generationConfig: {
      temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json',
      responseSchema: { type: 'OBJECT', properties: { heard: { type: 'STRING' }, score: { type: 'INTEGER' }, tip: { type: 'STRING' } }, required: ['heard', 'score', 'tip'] },
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
    const score = Math.max(0, Math.min(100, Math.round(Number(out.score) || 0)));
    return res.json({ heard: clean(out.heard, 40), score, tip: clean(out.tip, 120) });
  } catch (err) {
    console.error('score failed', String(err && err.message).slice(0, 120));
    return res.status(500).json({ error: 'server' });
  }
});
