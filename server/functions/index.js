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
const norm = x => String(x || '').toLowerCase().replace(/[^\p{L}]/gu, '').replace(/ь/g, '').replace(/ґ/g, 'г').replace(/ї/g, 'і');
// Edit distance where sounds a beginner mixes up cost less than a completely wrong sound.
const VOW = 'аеєиіїоуюя', PAIRS = ['шщ', 'сш', 'зж', 'цч', 'цс', 'чш', 'хг', 'ву', 'вф', 'бп', 'дт', 'гк', 'нм', 'иі', 'ие', 'ео', 'ую', 'яа', 'єе'];
const subCost = (x, y) => x === y ? 0 : PAIRS.some(p => (p[0] === x && p[1] === y) || (p[1] === x && p[0] === y)) ? 0.4 : (VOW.includes(x) && VOW.includes(y)) ? 0.6 : 1;
const indel = x => 'йв'.includes(x) ? 0.5 : VOW.includes(x) ? 0.8 : 1;
function wlev(a, b) {
  const d = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) d[i][0] = d[i - 1][0] + indel(a[i - 1]);
  for (let j = 1; j <= b.length; j++) d[0][j] = d[0][j - 1] + indel(b[j - 1]);
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + indel(a[i - 1]), d[i][j - 1] + indel(b[j - 1]), d[i - 1][j - 1] + subCost(a[i - 1], b[j - 1]));
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

  const { word, tr, wav } = req.body || {};
  const w = clean(word, 40), t = clean(tr, 40);
  if (!w || typeof wav !== 'string' || wav.length < 200 || wav.length > MAX_WAV_BYTES * 1.4) return res.status(400).json({ error: 'bad request' });
  if (Buffer.from(wav.slice(0, 8), 'base64').slice(0, 4).toString() !== 'RIFF') return res.status(400).json({ error: 'bad audio' });

  const ip = (req.get('x-forwarded-for') || req.ip || 'x').split(',')[0].trim();
  try { if (!(await underCap(ip))) return res.status(429).json({ error: 'limit', message: 'Enough practice for today. Come back tomorrow!' }); }
  catch (err) { console.error('cap check failed'); return res.status(500).json({ error: 'server' }); }

  // Two listeners, then a judge.
  //  A: hears the recording BLIND (not told the word) and writes down up to three things it could be. This is the
  //     evidence: mumbling cannot pass, because a mumble does not sound like the word to someone who doesn't know it.
  //  B: is told the word and asked, as a friendly teacher, whether a Ukrainian speaker would recognise it.
  //  The final score mostly trusts both, but B can never rescue a recording that A could not make anything of.
  const callGemini = async (prompt, schema) => {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'audio/wav', data: wav } }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json', responseSchema: schema },
    };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': KEY.value(), 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error('gemini ' + r.status);
    const j = await r.json();
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    return JSON.parse((parts.find(x => typeof x.text === 'string') || {}).text);
  };
  const promptA = `Listen to this short recording of a language learner saying one Ukrainian word. Do not guess what they meant to say.
Reply as JSON with:
heard: up to 3 different Ukrainian words (or the nearest sounds) it could be, most likely first, in Cyrillic. Use an empty list if you cannot make out anything word-like.
clarity: integer 0-100, how clearly it was spoken. Whispering, mumbling, trailing off, heavy noise or cut-off sounds are under 50. A clear attempt with a foreign accent is 80 or more.`;
  const promptB = `You are a warm, encouraging Ukrainian teacher listening to an adult beginner. They are trying to say the word "${w}"${t ? ` (said like "${t}")` : ''}.
Would a Ukrainian speaker recognise this word from the recording? Reply as JSON with:
score: integer 0-100. 90-100: clearly the right word, even with a foreign accent. 70-89: recognisable but one sound is clearly off. 40-69: only partly right. 0-39: a different word, silence, noise, or too unclear to tell what word it is.
tip: one short friendly English sentence (at most 14 words). If the score is under 90, name the one sound to fix.
Do NOT mark down: a rolled versus unrolled R, a different accent, speaking a little slowly or quickly, the stress being on a different syllable, or soft versus hard consonants. Beginners cannot hear those yet.`;
  try {
    const [A, B] = await Promise.all([
      callGemini(promptA, { type: 'OBJECT', properties: { heard: { type: 'ARRAY', items: { type: 'STRING' } }, clarity: { type: 'INTEGER' } }, required: ['heard', 'clarity'] }),
      callGemini(promptB, { type: 'OBJECT', properties: { score: { type: 'INTEGER' }, tip: { type: 'STRING' } }, required: ['score', 'tip'] }),
    ]);
    const alts = (Array.isArray(A.heard) ? A.heard : []).map(x => clean(x, 40)).filter(Boolean).slice(0, 3);
    const clarity = Math.max(0, Math.min(100, Math.round(Number(A.clarity) || 0)));
    const target = norm(w);
    let simA = 0;
    alts.forEach((h, k) => { const hn = norm(h); if (hn) simA = Math.max(simA, (1 - wlev(target, hn) / Math.max(target.length, hn.length, 1)) * [1, 0.92, 0.85][k]); });
    let a = simA * 100;
    if (clarity < 50) a *= 0.5 + clarity / 100;           // only truly unclear speech is marked down
    const b = Math.max(0, Math.min(100, Math.round(Number(B.score) || 0)));
    let score = 0.42 * a + 0.58 * b;                       // the friendly teacher counts a little more
    if (a < 30) score = Math.min(score, 45);               // B cannot rescue what A could not hear
    score = Math.round(Math.max(0, Math.min(100, score)));
    const heard = alts[0] || '';
    let tip = clean(B.tip, 120);
    if (!heard || a < 30) tip = !heard ? 'I could not make out a word. Speak up and say it slowly.' : `I heard "${heard}". Tap the speaker, then copy the sounds slowly.`;
    else if (score >= 90) tip = 'Wonderful, that was clear!';
    else if (!tip) tip = `I heard "${heard}". Say it once more, slowly.`;
    return res.json({ heard, score, tip });
  } catch (err) {
    console.error('score failed', String(err && err.message).slice(0, 120));
    return res.status(500).json({ error: 'server' });
  }
});
