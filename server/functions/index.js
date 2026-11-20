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
// Spending caps, in US dollars per day (UTC). One try is two short Gemini calls, roughly $0.0005-0.001.
const DAILY_USD_PER_IP = 0.50;   // one player
const DAILY_USD_TOTAL = 3.00;    // all players together
const DAILY_PER_IP = 600;        // and a plain count per player as a second guard
const TRY_RESERVE_USD = 0.002;   // held when a try starts, then corrected to what it really cost
// Priced on the high side so the caps can't be overrun: audio/text in, and out (thinking counts as out).
const USD_PER_M_IN = 0.60, USD_PER_M_OUT = 2.50;
const usageCost = u => u ? ((u.promptTokenCount || 0) * USD_PER_M_IN + ((u.candidatesTokenCount || 0) + (u.thoughtsTokenCount || 0)) * USD_PER_M_OUT) / 1e6 : TRY_RESERVE_USD / 2;
const MAX_WAV_BYTES = 200 * 1024;   // the game sends at most 6 seconds of 16 kHz mono (192 KB)
const ORIGINS = ['https://spacepanda99.github.io'];
const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const okOrigin = o => ORIGINS.includes(o) || LOCAL.test(o || '');
const clean = (s, n) => String(s || '').replace(/[^\p{L}\p{N} '’ʼ().,-]/gu, '').slice(0, n);

// Compare words the way a beginner should be judged: ignore apostrophes, the soft sign, and i/y mix-ups.
// Russian-style spellings of the same sound (ы, э, ё) count as their Ukrainian letters.
const norm = x => String(x || '').toLowerCase().replace(/[^\p{L}]/gu, '').replace(/[ьъ]/g, '').replace(/ґ/g, 'г').replace(/ї/g, 'і').replace(/ы/g, 'и').replace(/э/g, 'е').replace(/ё/g, 'о');
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

function usageRefs(ip) {
  const day = new Date().toISOString().slice(0, 10), db = admin.firestore();
  return { day, totalRef: db.doc(`kdSpeechUsage/${day}`), ipRef: db.doc(`kdSpeechUsage/${day}_${crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)}`) };
}
// Before a try: refuse if this player (or everyone together) has reached today's cap; otherwise hold a little
// money for it, which is corrected to the real cost when the answer comes back.
async function underCap(refs) {
  const db = admin.firestore(), { day, totalRef, ipRef } = refs;
  return db.runTransaction(async t => {
    const [a, b] = await Promise.all([t.get(totalRef), t.get(ipRef)]);
    const A = (a.exists && a.data()) || {}, B = (b.exists && b.data()) || {};
    if ((A.usd || 0) + TRY_RESERVE_USD > DAILY_USD_TOTAL || (B.usd || 0) + TRY_RESERVE_USD > DAILY_USD_PER_IP || (B.n || 0) >= DAILY_PER_IP) return false;
    t.set(totalRef, { n: (A.n || 0) + 1, usd: (A.usd || 0) + TRY_RESERVE_USD, day }, { merge: true });
    t.set(ipRef, { n: (B.n || 0) + 1, usd: (B.usd || 0) + TRY_RESERVE_USD, day, kind: 'ip' }, { merge: true });
    return true;
  });
}
async function settle(refs, usd) {
  const d = usd - TRY_RESERVE_USD, inc = admin.firestore.FieldValue.increment(d);
  await Promise.all([refs.totalRef.set({ usd: inc }, { merge: true }), refs.ipRef.set({ usd: inc }, { merge: true })]);
}

exports.kdScoreSpeech = onRequest({ region: 'us-central1', secrets: [KEY], invoker: 'public', memory: '256MiB', timeoutSeconds: 40, maxInstances: 3 }, async (req, res) => {
  const origin = req.get('origin');
  if (okOrigin(origin)) { res.set('Access-Control-Allow-Origin', origin); res.set('Vary', 'Origin'); }
  res.set('Access-Control-Allow-Headers', 'content-type'); res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST' || !okOrigin(origin)) return res.status(403).json({ error: 'not allowed' });

  res.set('Cache-Control', 'no-store'); res.set('X-Content-Type-Options', 'nosniff');
  if (!req.is('application/json')) return res.status(400).json({ error: 'bad request' });

  // Everything from the caller is checked before it goes anywhere near the prompt or the model:
  // the word must be a short Ukrainian word, the "said like" hint plain Latin letters, the audio a small 16 kHz mono WAV.
  const { word, tr, wav } = req.body || {};
  const w = typeof word === 'string' && /^[Ѐ-ӿ'’ʼ -]{1,30}$/.test(word.trim()) ? word.trim() : '';
  const t = typeof tr === 'string' && /^[A-Za-z' -]{1,40}$/.test(tr.trim()) ? tr.trim() : '';
  if (!w || typeof wav !== 'string' || wav.length < 200 || wav.length > MAX_WAV_BYTES * 1.4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(wav)) return res.status(400).json({ error: 'bad request' });
  const head = Buffer.from(wav.slice(0, 64), 'base64');
  if (head.length < 44 || head.toString('latin1', 0, 4) !== 'RIFF' || head.toString('latin1', 8, 12) !== 'WAVE' || head.readUInt16LE(20) !== 1 || head.readUInt16LE(22) !== 1 || head.readUInt32LE(24) !== 16000 || head.readUInt16LE(34) !== 16) return res.status(400).json({ error: 'bad audio' });

  // The caller's address is the LAST entry Google's front end adds to X-Forwarded-For. Anything before it was
  // sent by the caller and can be faked, so it must not be used for the per-person limit.
  const ip = String(req.get('x-forwarded-for') || req.ip || 'x').split(',').pop().trim() || 'x';
  const refs = usageRefs(ip);
  try { if (!(await underCap(refs))) return res.status(429).json({ error: 'limit', message: 'Enough practice for today. Come back tomorrow!' }); }
  catch (err) { console.error('cap check failed'); return res.status(500).json({ error: 'server' }); }

  // Two listeners, then a judge.
  //  A: hears the recording BLIND (not told the word) and writes down up to three things it could be. This is the
  //     evidence: mumbling cannot pass, because a mumble does not sound like the word to someone who doesn't know it.
  //  B: is told the word and asked, as a friendly teacher, whether a Ukrainian speaker would recognise it.
  //  The final score mostly trusts both, but B can never rescue a recording that A could not make anything of.
  let spent = 0;   // what this try really cost, from Gemini's own token counts
  const callGemini = async (prompt, schema, again) => {
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }, { inline_data: { mime_type: 'audio/wav', data: wav } }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: 'application/json', responseSchema: schema },
    };
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: 'POST', headers: { 'x-goog-api-key': KEY.value(), 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) {
      if (!again && (r.status === 429 || r.status >= 500)) { await new Promise(z => setTimeout(z, 700)); return callGemini(prompt, schema, true); }   // one retry for a passing hiccup
      throw new Error('gemini ' + r.status);
    }
    const j = await r.json();
    spent += usageCost(j.usageMetadata);
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
    settle(refs, spent).catch(() => console.error('settle failed'));
    return res.json({ heard, score, tip });
  } catch (err) {
    console.error('score failed', String(err && err.message).slice(0, 120));
    settle(refs, Math.max(spent, TRY_RESERVE_USD)).catch(() => {});   // a failed try keeps its hold (it may still have cost something)
    return res.status(500).json({ error: 'server' });
  }
});
