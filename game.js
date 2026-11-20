// Котяча Долина (Kotiacha Dolyna, "Cat Valley"): a cozy village for learning Ukrainian by wandering and tapping.
// Plain canvas + DOM, no libraries. Words, phrases and villagers live in data.js.
(() => {
'use strict';
const D = window.DATA;
const W = Object.fromEntries(D.words.map(w => [w.id, w]));
const NPC = Object.fromEntries(D.npcs.map(n => [n.id, n]));
const PH = Object.fromEntries(D.phrases.map(p => [p.id, p]));
const $ = s => document.querySelector(s);
const cv = $('#c'), ctx = cv.getContext('2d');
const T = 64, MW = 36, MH = 32;   // (28 rows until the neighbours' cottages along the bottom road were added)
// Spaced review: how long until a word at each level is "due" again.
const IV = [0, 60e3, 300e3, 1800e3, 4 * 3600e3, 86400e3];
const now = () => Date.now();
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

// ------------------------------------------------------------------ save
const SAVE = 'kotiacha-dolyna-v1';
const fresh = () => ({
  coins: 10, hearts: 0, words: {}, bag: { voda: 3 }, waterInit: 1, seeds: { morkva: 3 }, home: { vazon: 1 }, placed: {},   // a potted plant to start with: something to decorate with on day one
  plots: Array.from({ length: 6 }, () => ({ c: null, ready: 0, wet: false })),
  npc: {}, cats: {}, decor: {}, gear: {}, farm: {}, recipe: { i: 0, have: {}, started: -1 }, tut: 0, tutN: 0, cd: {}, x: 7.5, y: 12.5,
});
let S;
try { S = JSON.parse(localStorage.getItem(SAVE) || '{}'); } catch (e) { S = {}; }
// A save from a very old build (anything before the farm, 2026-11-17) starts the village fresh: the game
// has changed too much since, and an early install on a phone shouldn't drop someone into a half-made world.
if (S && Object.keys(S).length && !S.farm) { S = {}; try { localStorage.removeItem(SAVE); localStorage.removeItem('kd-subs'); } catch (e) {} }
S = Object.assign(fresh(), S);
if (S.placed && Object.keys(S.placed).length) {
  for (const id of Object.values(S.placed)) { if (!S.decor[id]) S.decor[id] = 1; else S.home[id] = (S.home[id] || 0) + 1; }
  S.placed = {};
}
for (const [id, price] of Object.entries(D.shop.furnished)) {
  const n = (S.home[id] || 0) + (S.decor[id] ? 1 : 0);
  if (n) { S.coins += n * price; S.refunded = (S.refunded || 0) + n * price; }
  delete S.home[id]; delete S.decor[id];
}
if (!S.waterInit) { S.waterInit = 1; S.bag.voda = Math.max(S.bag.voda || 0, 3); }
const WATER_MAX = 10, WELL_GIVES = 5;   // each trip to the well: +5 water, the can holds 10
if (!S.recipe) S.recipe = { i: 0, have: {}, started: -1 };
// Older saves counted each ingredient once; those that were already handed over count as complete.
if (!S.recipe.have) { S.recipe.have = {}; for (const id of S.recipe.got || []) S.recipe.have[id] = 6; delete S.recipe.got; }
if (!S.say) S.say = {};
// The village day: S.clock.t runs from morning (0.27) through evening (0.78) to night (0.86+), only while
// you're out and about with no card open. Night lasts until you go home and sleep. Each morning has its
// own weather (S.wx): sunny, cloudy or rain, and rain waters the garden for you.
if (!S.clock) S.clock = { day: 1, t: 0.3, ev: {} };
if (!S.wx) S.wx = 'sun';
if (!S.fest) S.fest = { i: 0, have: {} };
// Seasons: summer, autumn, winter, spring, SEASON_DAYS days each, counted from S.clock.day. Each has its
// festival. ?season=zyma (or lito, osin, vesna) in the address shows a season for testing, without saving it.
const SEASON_DAYS = 3, SEASONS = ['lito', 'osin', 'zyma', 'vesna'], SEASON_IC = { lito: '🌻', osin: '🍂', zyma: '⛄', vesna: '🌸' };
let seasonForce = null; try { const q = new URLSearchParams(location.search).get('season'); if (SEASONS.includes(q)) seasonForce = q; } catch (e) {}
const seasonIx = (day = S.clock.day) => seasonForce ? SEASONS.indexOf(seasonForce) : Math.floor(((day || 1) - 1) / SEASON_DAYS) % 4;
const season = () => SEASONS[seasonIx()];
const winter = () => season() === 'zyma';
const seasonDaysLeft = () => SEASON_DAYS - (((S.clock.day || 1) - 1) % SEASON_DAYS);   // which festival is next, and what's been brought for it
if (!S.gear) S.gear = {};
if (!S.wardrobe) S.wardrobe = { sorochka: 1 };   // the clothes she owns (her blouse and skirt to start with)
if (!S.outfit) S.outfit = 'sorochka';
let devOn = false;   // developer mode (see the developer section); declared early, as the coin counter reads it
let saveT = 0;
// Grandma cooks one dish after another and starts over from the first once she has made them all.
// In winter Grandma cooks warm winter dishes, and each needs firewood for her stove too.
const WINTER_DISHES = ['borshch', 'kutia', 'uzvar', 'varenyky'], winterR = {};
const curRecipe = () => {
  if (!winter()) return D.recipes[S.recipe.i % D.recipes.length];
  const R = D.recipes.filter(r => WINTER_DISHES.includes(r.id))[S.recipe.i % WINTER_DISHES.length];
  return winterR[R.id] || (winterR[R.id] = Object.assign({}, R, { needs: [...R.needs, 'drova'] }));
};
// She needs six of every ingredient, so you hear and say each word over and over.
const NEED = 6;
const recipeHave = id => Math.min(NEED, S.recipe.have[id] || 0);
const recipeTotal = R => R.needs.reduce((a, id) => a + recipeHave(id), 0);
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) {} }, 300); };

// How far along the learner is. English fades out as this rises.
const mastered = () => Object.values(S.words).filter(w => w.l >= 3).length;
// How much English the village gives you. Stage 2 (the villagers stop translating themselves) needs the first
// summer behind you (day 4, autumn) and 25 well-known words; stage 3, all Ukrainian, needs a whole year in the
// valley (day 13, the second summer) and 90 well-known words.
const STAGES = { 2: { words: 25, day: 4 }, 3: { words: 90, day: 13 } };
const stage = () => { const m = mastered(), d = (S.clock && S.clock.day) || 1; return m >= STAGES[3].words && d >= STAGES[3].day ? 3 : m >= STAGES[2].words && d >= STAGES[2].day ? 2 : 1; };
const lab = k => { const u = D.ui[k]; return u[0] + `<small${stage() < 3 ? '' : ' class="xl"'}>${u[1]}</small>`; };
// English that is shown while you're learning and, in the all-Ukrainian stage, kept hidden until you tap 👁.
const xl = h => stage() < 3 ? h : h ? `<span class="xl">${h}</span>` : '';
const TR = { а:'a',б:'b',в:'v',г:'h',ґ:'g',д:'d',е:'e',є:'ye',ж:'zh',з:'z',и:'y',і:'i',ї:'yi',й:'i',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'shch',ь:'',ю:'yu',я:'ya',"'":'','’':'' };
const translit = s => s.split('').map(ch => { const lo = ch.toLowerCase(); if (!(lo in TR)) return ch; const r = TR[lo]; return ch === lo ? r : cap(r); }).join('');

// ------------------------------------------------------------------ voice
const clipCache = {};
let sayToken = 0;
function textOf(id) {
  const [k, a, ...rest] = id.split('_');
  const b = rest.join('_');
  if (k === 'w') return W[id.slice(2)] ? W[id.slice(2)].uk : '';
  if (k === 'p') return PH[id.slice(2)] ? PH[id.slice(2)].uk : '';
  if (k === 'n') return D.prices[a] || '';
  if (k === 'c') { const ct = (D.cats || []).find(x => x.id === id.slice(2)); return ct ? ct.line : ''; }
  if (k === 's' || k === 'st') { const p = (D.story || []).find(q => q.clip === id); return p ? p.uk : ''; }
  if (k === 'v') return NPC[a] && NPC[a].lines[b] ? NPC[a].lines[b].uk : '';
  if (k === 'qp') return W[b] ? D.payLine.uk.replace('%s', W[b].acc || W[b].uk) : '';
  if (k === 'tq') return W[b] ? D.thankLine.uk.replace('%s', W[b].acc || W[b].uk) : '';
  if (k === 'q') return W[b] ? D.questLine.uk.replace('%s', W[b].acc || W[b].uk) : '';
  return '';
}
function enOf(id) {
  const [k, a, ...rest] = id.split('_');
  const b = rest.join('_');
  if (k === 'w') return W[id.slice(2)] ? W[id.slice(2)].en : '';
  if (k === 'p') return PH[id.slice(2)] ? PH[id.slice(2)].en : '';
  if (k === 'c') { const ct = (D.cats || []).find(x => x.id === id.slice(2)); return ct ? ct.lineEn : ''; }
  if (k === 's' || k === 'st') { const p = (D.story || []).find(q => q.clip === id); return p ? p.en : ''; }
  if (k === 'v') return NPC[a] && NPC[a].lines[b] ? NPC[a].lines[b].en : '';
  if (k === 'qp') return W[b] ? D.payLine.en.replace('%s', W[b].en) : '';
  if (k === 'tq') return W[b] ? D.thankLine.en.replace('%s', 'the ' + W[b].en) : '';
  if (k === 'q') return W[b] && D.questLine.en ? D.questLine.en.replace('%s', W[b].en) : '';
  return '';
}
// Live subtitles on the talking cards: always in English (that's what they're for), what is being said right
// now, the words lighting up as they're spoken, the last line staying up afterwards so you can read it. Shown or hidden with the button under the
// card; the choice is remembered on this device.
// On by default while learning; off by default once you reach stage 3 (the all-Ukrainian stage). A tap on 💬
// is remembered for the stage band it was made in, so reaching stage 3 turns them off once and a tap brings them back.
let subNow = null;
const subsBand = () => stage() >= 3 ? 'adv' : 'new';
function subsOnNow() {
  let v = null; try { v = localStorage.getItem('kd-subs'); } catch (e) {}
  const [c, band] = String(v || '').split('@');
  if ((c === 'on' || c === 'off') && (band || 'new') === subsBand()) return c === 'on';
  return subsBand() === 'new';
}
function subsHTML() {
  const subsOn = subsOnNow();
  return `<div class="subs"><div id="subline"${subsOn ? '' : ' style="display:none"'}></div><button class="subt" data-a="subs">💬 ${subsOn ? 'Hide English subtitles' : 'Show English subtitles'}</button></div>`;
}
// The action word in the subtitles, exactly as it's flashed on the pad, with its English.
// The action word in the subtitles: just its English, one word ("cut! chop!" → "Cut!").
const verbEn1 = v => { if (W[v] && !W[v].verb) { const e = W[v].en.replace(/\s*\(.*\)/, '').trim(); return e ? e[0].toUpperCase() + e.slice(1) + '!' : ''; }   // a thing, not an action: its whole name ("Wreath!")
  const m = (W[v].en.match(/[A-Za-z']+/) || [''])[0]; return m ? m[0].toUpperCase() + m.slice(1) + '!' : ''; };
function actSub(v, a) { subNow = { uk: verbEn1(v), en: '', a, t0: performance.now(), both: true }; subPaint(); }
function subStart(id, a) {
  const uk = textOf(id); if (!uk) return;
  subNow = { uk, en: enOf(id), a, t0: performance.now() };
  subPaint();
}
function subPaint() {
  const el = document.getElementById('subline'); if (!el || !subNow) return;
  if (subNow.both) { el.innerHTML = `<div class="su">${subNow.uk}</div>${subNow.en ? `<div class="se">${subNow.en}</div>` : ''}`; return; }   // an action word: the Ukrainian as flashed, its English under it
  const words = (subNow.en || subNow.uk).split(' '), a = subNow.a;
  let f = 1;
  if (a && !a.paused && !a.ended && a.duration > 0) f = Math.min(1, (a.currentTime + 0.15) / (a.duration * 0.92));
  else if (!a) f = Math.min(1, (performance.now() - subNow.t0) / (words.length * 420));
  const n = Math.ceil(f * words.length);
  el.innerHTML = `<div class="su">${words.map((w, i) => `<span${i < n ? '' : ' class="later"'}>${w}</span>`).join(' ')}</div>`;
  if (f < 1) requestAnimationFrame(subPaint);
}
function speakFallback(text) {
  return new Promise(res => {
    try {
      if (!text || !window.speechSynthesis) return res();
      const u = new SpeechSynthesisUtterance(text); u.lang = 'uk-UA'; u.rate = 0.9;
      u.onend = u.onerror = () => res(); speechSynthesis.speak(u); setTimeout(res, 6000);
    } catch (e) { res(); }
  });
}
function playClip(id) {
  return new Promise(res => {
    let a = clipCache[id];
    if (!a) { a = clipCache[id] = new Audio('audio/' + id + '.mp3'); a.preload = 'auto'; }
    let done = false;
    const fin = () => { if (done) return; done = true; a.onended = a.onerror = null; res(); };
    a.onended = fin;
    a.onerror = () => { subStart(id, null); speakFallback(textOf(id)).then(fin); };
    a.onplaying = () => subStart(id, a);
    try { a.currentTime = 0; } catch (e) {}
    const p = a.play();
    if (p && p.catch) p.catch(() => fin());
    setTimeout(fin, 12000);
  });
}
// Say one or more clips in order. A new call cuts off whatever was playing.
function say(...ids) {
  const my = ++sayToken;
  for (const k in clipCache) { try { clipCache[k].pause(); } catch (e) {} }
  duck = 0.3;
  (async () => { for (const id of ids) { if (my !== sayToken) return; await playClip(id); } if (my === sayToken) duck = 1; })();
}
// Theme music: starts on the first tap, softens while someone is speaking, remembers on/off.
const music = new Audio('music/theme.mp3');
music.loop = true; music.preload = 'auto';
let musicOn = true, duck = 1, musicVol = 0;
try { musicOn = localStorage.getItem('kd-music') !== 'off'; } catch (e) {}
function musicBtn() { for (const b of document.querySelectorAll('[data-a="music"]')) b.textContent = musicOn ? '🎵' : '🔇'; }
// The theme starts on the title screen. An installed app is allowed to play sound straight away;
// in a browser tab, Chrome waits for the first tap anywhere, so every tap tries again until it's playing.
function startMusic() { if (mode === 'fest') return; if (musicOn && music.paused && !document.hidden) music.play().catch(() => {}); }   // the festival plays its own song
document.addEventListener('pointerdown', startMusic, true);
document.addEventListener('keydown', startMusic, true);
addEventListener('load', () => { musicBtn(); startMusic(); });
// Each interior has its own theme (music/room-<mode>.mp3, made with tools/music.mjs). Going in or out fades the
// music down, swaps the track and fades back up; the village theme picks up where it left off. A room whose file
// is missing (not made yet) just keeps the village theme.
const ROOM_TUNES = { home: 'room-home2', olia: 'room-olia', mill: 'room-mill', church: 'room-church' };
const tuneBad = {};
let curTune = 'theme', themePos = 0, seekTo = 0;
// The market has its own tune while its card is open (it's a card over the village, not a room).
const shopOpen = () => mode === 'world' && sheetOpen() && !!sheet.querySelector('[data-shop]');
const wantTune = () => { const n = shopOpen() ? 'room-market' : ROOM_TUNES[mode]; return n && !tuneBad[n] ? n : 'theme'; };
music.addEventListener('error', () => { if (curTune !== 'theme') tuneBad[curTune] = true; });
music.addEventListener('loadedmetadata', () => { if (seekTo) { try { music.currentTime = seekTo; } catch (e) {} seekTo = 0; } });
function musicTick(dt) {
  const want = wantTune(), switching = want !== curTune;
  if (switching && (musicVol < 0.03 || music.paused)) {
    if (curTune === 'theme') themePos = music.currentTime || 0;
    curTune = want; seekTo = want === 'theme' ? themePos : 0;
    music.src = 'music/' + want + '.mp3'; if (musicOn && !document.hidden && mode !== 'fest') music.play().catch(() => {});
  }
  const wolves = mode === 'world' && S.clock && S.clock.t >= 0.86 && S.clock.ev && S.clock.ev.wolf1;   // once the wolves howl the music stops: just the night, the crickets and the wolves
  const target = musicOn && !sp && !switching && !wolves ? 0.55 * duck : 0;   // silent for the whole speaking round, so the mic only hears you
  musicVol += (target - musicVol) * Math.min(1, dt * 3);
  try { music.volume = Math.max(0, Math.min(1, musicVol)); } catch (e) {}
  if (!musicOn && musicVol < 0.01 && !music.paused) music.pause();
}
document.addEventListener('visibilitychange', () => { try { if (actx) { if (document.hidden) actx.suspend(); else actx.resume(); } } catch (e) {} if (document.hidden) { music.pause(); try { festMusic.pause(); } catch (e) {} } else if (mode === 'fest' && fest && fest.phase !== 'greet' && musicOn) festMusic.play().catch(() => {}); else startMusic(); });
let actx = null;
function blip(f = 660, d = 0.08) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.06;
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
    o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
  } catch (e) {}
}

// ------------------------------------------------------------------ drawing helpers
const ell = (c, x, y, rx, ry) => { c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.fill(); };
const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); };
const rr = (c, x, y, w, h, r) => { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); c.fill(); };
const poly = (c, pts) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); };

// Hand-drawn things. Each draws inside a 100-wide, 100-tall box whose bottom centre is (0, 0).
// Trees by season. In autumn each tree gets one of three mixes of red, orange and gold, with leaves heaped on
// the ground under it; in winter the branches are bare with snow along them; in spring the green is fresh and
// there's blossom. o.v (from where the tree stands) keeps each tree its own colours; the market icons (no o.v)
// stay summer green.
const treeSeason = o => (o && o.v != null && typeof season === 'function') ? season() : 'lito';
const AUTUMN_PALS = [['#a8381f', '#cf5a24', '#ec8a2e', '#ffc35a'], ['#c0721a', '#df9e26', '#f2c43c', '#ffe27a'], ['#8e2a2a', '#bf3e2d', '#e46d37', '#ff9f5a']];
const KHATA_LOOK = {
  mine:   { wall: '#fffdf5', band: '#4a90d9', band2: '#3d7cc2', roof: ['#d8a23a', '#e6b95a', '#b9842a'], thatch: 1, frame: '#3d7cc2', glass: '#bfe6fb', door: '#8a5a2b', box: ['#e2574c', '#f2c230', '#e2574c'] },
  olia:   { wall: '#fbf3e2', band: '#d43a3a', band2: '#a82c2c', roof: ['#b98a3a', '#cfa252', '#93692a'], thatch: 1, frame: '#2f7a4a', glass: '#cfeeda', door: '#5e8a3a', shutters: '#3f9a5a', painted: 1, box: ['#ff7aa8', '#ffffff', '#ff7aa8'] },
  bohdan: { wall: '#f6e3b4', band: '#8a5a2b', band2: '#6b4422', roof: ['#9a4a2e', '#b45c3a', '#7a3a22'], shingle: 1, frame: '#8a5a2b', glass: '#ffe9a8', door: '#6b4422', skep: 1, box: ['#f2c230', '#ffffff', '#f2c230'] },
  taras:  { wall: '#dcebf5', band: '#2f5f8a', band2: '#24496b', roof: ['#8e9aa0', '#a9b4b8', '#6f7a80'], thatch: 1, frame: '#ffffff', glass: '#bfe6fb', door: '#2f5f8a', net: 1, box: ['#5aa9e6', '#ffffff', '#5aa9e6'] },
};
function khataArt(c, P) {
  c.fillStyle = '#b5553f'; c.fillRect(21, -86, 12, 30); c.fillStyle = '#8f3f2d'; c.fillRect(19, -89, 16, 5);   // chimney
  c.fillStyle = P.wall; rr(c, -40, -52, 80, 52, 4);
  c.fillStyle = 'rgba(120,96,60,.16)'; c.fillRect(-40, -50, 80, 7);   // shade under the eaves
  c.fillStyle = P.band; c.fillRect(-40, -8, 80, 8); c.fillStyle = P.band2; c.fillRect(-40, -2.5, 80, 2.5);
  if (P.painted) {   // a painted garland of red flowers and green leaves along the wall (like her stove)
    for (let x = -34; x <= 34; x += 11) { c.fillStyle = '#4f8f3a'; ell(c, x - 3, -48, 3, 1.3); ell(c, x + 3, -48, 3, 1.3); c.fillStyle = (x / 11) % 2 ? '#d43a3a' : '#3d7cc2'; circ(c, x, -48.5, 2.2); }
  }
  c.fillStyle = P.roof[0]; poly(c, [[-50, -48], [0, -98], [50, -48]]);
  c.fillStyle = P.roof[1]; poly(c, [[-50, -48], [0, -98], [-8, -90], [-40, -48]]);
  c.fillStyle = P.roof[2]; poly(c, [[-50, -48], [50, -48], [47, -44], [-47, -44]]);
  c.strokeStyle = P.roof[2]; c.lineWidth = 2;
  if (P.shingle) { c.save(); c.beginPath(); c.moveTo(-50, -48); c.lineTo(0, -98); c.lineTo(50, -48); c.closePath(); c.clip(); for (let y = -92; y < -48; y += 7) { c.beginPath(); c.moveTo(-50, y); c.lineTo(50, y); c.stroke(); for (let x = -50 + ((y / 7) % 2 ? 4 : 0); x < 50; x += 9) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 7); c.stroke(); } } c.restore(); }   // wooden shingles
  else for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 6, -92 + Math.abs(i) * 6); c.lineTo(i * 14, -50); c.stroke(); }   // thatch
  c.fillStyle = P.door; rr(c, -9, -36, 18, 36, 3);
  c.fillStyle = '#f2c230'; circ(c, 5, -18, 1.8);
  for (const x of [-33, 17]) {
    if (P.shutters) { c.fillStyle = P.shutters; c.fillRect(x - 7, -42, 5, 20); c.fillRect(x + 18, -42, 5, 20); c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(x - 6, -40, 3, 1.5); c.fillRect(x + 19, -40, 3, 1.5); }
    c.fillStyle = P.frame; rr(c, x - 2, -42, 20, 20, 3);
    c.fillStyle = P.glass; rr(c, x, -40, 16, 16, 2);
    c.fillStyle = P.frame; c.fillRect(x + 7, -40, 2, 16); c.fillRect(x, -33, 16, 2);
    c.fillStyle = P.box[0]; circ(c, x + 3, -21, 2.5); circ(c, x + 13, -21, 2.5);
    c.fillStyle = P.box[1]; circ(c, x + 8, -21, 2.5);
  }
  if (P.skep) {   // a straw bee skep on a stand by the door, and a bee or two
    c.fillStyle = '#6b4422'; c.fillRect(-27, -8, 2, 8); c.fillRect(-17, -8, 2, 8);
    c.fillStyle = '#e0b04a'; c.beginPath(); c.ellipse(-21, -9, 9, 13, 0, Math.PI, 0); c.fill(); c.strokeStyle = '#b98a2a'; c.lineWidth = 1.2; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-30 + i * 0.8, -11 - i * 3); c.lineTo(-12 - i * 0.8, -11 - i * 3); c.stroke(); }
    c.fillStyle = '#4a2c1a'; ell(c, -21, -10, 2, 1.5);
    c.fillStyle = '#f2c230'; ell(c, -30, -26, 2, 1.4); ell(c, -14, -30, 2, 1.4);
  }
  if (P.net) {   // a fishing net hung to dry on the wall, with floats, and an oar leaning by the door
    c.strokeStyle = 'rgba(90,70,50,.6)'; c.lineWidth = 0.8; for (let i = 0; i <= 5; i++) { c.beginPath(); c.moveTo(-39 + i * 4, -45); c.lineTo(-39 + i * 4 + 6, -10); c.stroke(); c.beginPath(); c.moveTo(-39 + i * 4 + 6, -45); c.lineTo(-39 + i * 4, -10); c.stroke(); }
    c.fillStyle = '#e2574c'; for (let i = 0; i < 4; i++) circ(c, -38 + i * 7, -45, 1.8);
    c.strokeStyle = '#a06a35'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(12, 0); c.lineTo(16, -40); c.stroke(); c.fillStyle = '#a06a35'; ell(c, 12.5, -4, 3, 7);
  }
}
function treePal(sea, o) {
  if (sea === 'osin') return AUTUMN_PALS[Math.abs(Math.floor((o.v || 0) * 7.3)) % 3];
  if (sea === 'vesna') return ['#4f9e48', '#64b85a', '#84cf70', '#acdf92'];
  return ['#2f8440', '#3f9a4a', '#55b35c', '#78ca76'];
}
const leafCols = ['#c0461f', '#e07a24', '#f2b43a', '#a8381f', '#ffd36a', '#8e2a2a'];
function fallenLeaves(c, o, R) {   // a drift of fallen leaves around the roots, and a few more scattered further out
  const v = (o && o.v) || 0;
  for (let i = 0; i < 26; i++) { const a = i * 2.39 + v, r = R * (0.25 + ((i * 0.37 + v) % 1) * 0.85), x = Math.cos(a) * r, y = Math.sin(a) * r * 0.22 + 2; c.save(); c.translate(x, y); c.rotate(a * 3); c.fillStyle = leafCols[(i + Math.floor(v * 3)) % leafCols.length]; ell(c, 0, 0, 3.6, 1.8); c.restore(); }
}
function autumnSpeckle(c, o) {   // individual leaves catching the light, and one or two coming down
  const v = (o && o.v) || 0, t = (o && o.t) || 0;
  for (let i = 0; i < 12; i++) { c.fillStyle = leafCols[(i + 2) % leafCols.length]; ell(c, Math.cos(i * 2.1 + v) * 26, -62 + Math.sin(i * 1.7 + v) * 22, 3, 2); }
  for (let i = 0; i < 2; i++) { const q = ((t * 0.18 + i * 0.5 + v) % 1); c.save(); c.translate(Math.sin(q * 9 + i) * 18 + (i ? 14 : -16), -40 + q * 42); c.rotate(q * 12); c.fillStyle = leafCols[i * 2]; ell(c, 0, 0, 3.4, 1.7); c.restore(); }
}
function bareBranches(c, s) {   // winter: the bare crown, with snow lying along the boughs
  c.strokeStyle = '#6b4422'; c.lineCap = 'round';
  const B = [[0, -46, -26, -78, 4], [0, -46, 24, -80, 4], [0, -46, 2, -96, 4.5], [-14, -62, -36, -66, 2.5], [12, -64, 34, -62, 2.5], [-20, -72, -16, -92, 2], [18, -74, 14, -94, 2], [1, -76, -8, -100, 2]];
  for (const [x1, y1, x2, y2, lw] of B) { c.lineWidth = lw * s; c.beginPath(); c.moveTo(x1 * s, y1); c.lineTo(x2 * s, y2); c.stroke(); }
  c.strokeStyle = '#ffffff'; for (const [x1, y1, x2, y2, lw] of B) { c.lineWidth = lw * 0.7 * s; c.beginPath(); c.moveTo((x1 + (x2 - x1) * 0.35) * s, y1 + (y2 - y1) * 0.35 - lw); c.lineTo(x2 * s, y2 - lw * 0.8); c.stroke(); }
}
function blossom(c, o, s) {   // spring blossom, white and pink
  const v = (o && o.v) || 0;
  for (let i = 0; i < 22; i++) { const a = i * 2.4 + v, r = (8 + (i % 5) * 6) * s; c.fillStyle = i % 3 ? '#ffffff' : '#ffc2d6'; circ(c, Math.cos(a) * r * 1.2, -64 + Math.sin(a) * r * 0.9, 2.6 * s); }
}
const DRAW = {
  // A framed portrait of President Zelensky for the cottage wall: gilt frame, the flag's blue and yellow
  // behind him, short dark hair and beard, olive crew-neck top with a small gold trident.
  zelensky(c) {
    c.fillStyle = 'rgba(0,0,0,.18)'; rr(c, -44, -94, 92, 92, 5);
    c.fillStyle = '#b8892f'; rr(c, -46, -96, 92, 92, 5); c.fillStyle = '#e2bd5a'; rr(c, -43, -93, 86, 86, 4); c.fillStyle = '#a87a26'; rr(c, -39, -89, 78, 78, 2);
    c.save(); c.beginPath(); c.rect(-37, -87, 74, 74); c.clip();
    c.fillStyle = '#2f6fc0'; c.fillRect(-37, -87, 74, 40); c.fillStyle = '#f2c230'; c.fillRect(-37, -47, 74, 34);
    // shoulders and top
    c.fillStyle = '#55603a'; c.beginPath(); c.moveTo(-36, -13); c.quadraticCurveTo(-34, -34, -14, -37); c.lineTo(14, -37); c.quadraticCurveTo(34, -34, 36, -13); c.closePath(); c.fill();
    c.fillStyle = '#48522f'; c.beginPath(); c.moveTo(-9, -37); c.quadraticCurveTo(0, -29, 9, -37); c.closePath(); c.fill();
    c.fillStyle = '#e2b84a'; poly(c, [[17, -27], [19, -22], [21, -27], [21, -20], [17, -20]]);
    // neck, ears, face
    c.fillStyle = '#e3b896'; c.fillRect(-6, -44, 12, 9);
    c.fillStyle = '#e8bf9e'; ell(c, -14.5, -56, 3, 4.5); ell(c, 14.5, -56, 3, 4.5); ell(c, 0, -57, 14, 17);
    // short dark hair and a close beard
    c.fillStyle = '#3a2c22'; c.beginPath(); c.ellipse(0, -63, 14.6, 12, 0, Math.PI, 0); c.fill(); c.fillRect(-14.6, -63, 3, 6); c.fillRect(11.6, -63, 3, 6);
    c.fillStyle = 'rgba(58,44,34,.55)'; c.beginPath(); c.moveTo(-13.5, -55); c.quadraticCurveTo(-12, -40, 0, -40); c.quadraticCurveTo(12, -40, 13.5, -55); c.quadraticCurveTo(8, -46, 0, -46); c.quadraticCurveTo(-8, -46, -13.5, -55); c.fill();
    // brows, eyes, nose, a calm smile
    c.strokeStyle = '#3a2c22'; c.lineWidth = 1.8; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-9, -62); c.lineTo(-3.5, -61.5); c.moveTo(3.5, -61.5); c.lineTo(9, -62); c.stroke();
    c.fillStyle = '#3a2c22'; circ(c, -6, -58, 1.5); circ(c, 6, -58, 1.5);
    c.strokeStyle = '#c99476'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(0, -56); c.lineTo(-1.5, -51); c.lineTo(0.8, -50.5); c.stroke();
    c.strokeStyle = '#7a4a3a'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, -49, 4, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,.12)'; poly(c, [[-37, -87], [-10, -87], [-37, -55]]);
  },
  // A wooden butter churn: a tall tapered tub with iron hoops, a lid, and the dasher handle through the middle.
  maslobiika(c) {
    const bob = churnUntil > now() ? Math.abs(Math.sin(now() / 120)) * 12 : 0;
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -1, 26, 5);
    c.strokeStyle = '#6b4422'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -60 - bob); c.lineTo(0, -98 - bob); c.stroke();
    c.lineWidth = 3.5; c.beginPath(); c.moveTo(-9, -98 - bob); c.lineTo(9, -98 - bob); c.stroke();
    c.fillStyle = '#b5824e'; poly(c, [[-17, -66], [17, -66], [22, -3], [-22, -3]]);
    c.fillStyle = 'rgba(0,0,0,.08)'; for (const x of [-12, -4, 4, 12]) poly(c, [[x - 1, -66], [x + 1, -66], [x * 1.3 + 1, -3], [x * 1.3 - 1, -3]]);
    c.fillStyle = 'rgba(255,255,255,.18)'; poly(c, [[-14, -64], [-9, -64], [-12, -6], [-18, -6]]);
    c.fillStyle = '#4a4a50'; for (const [y, w] of [[-55, 18.2], [-30, 20], [-10, 21.4]]) { c.fillRect(-w, y, w * 2, 3.5); }
    c.fillStyle = '#8a5a2b'; ell(c, 0, -66, 18, 4.5); c.fillStyle = '#a06a35'; ell(c, 0, -67, 15, 3.4);
    c.fillStyle = '#fff6dc'; if (bob > 4) { circ(c, -6, -69, 2.2); circ(c, 7, -70, 1.8); }
  },
  // Жорна, the hand mill: two round millstones on a wooden trough, the top stone turned by an upright
  // wooden handle near its rim. While grinding, the handle goes round and flour dusts out into the trough.
  zhorna(c) {
    const going = grindUntil > now(), a = going ? now() / 160 : 0.9, sx = Math.cos(a) * 21, back = Math.sin(a) < 0;
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -1, 40, 6);
    // the trough the flour falls into
    c.fillStyle = '#8a5a2b'; rr(c, -38, -24, 76, 22, 4); c.fillStyle = '#a06a35'; rr(c, -38, -24, 76, 6, 3);
    c.fillStyle = 'rgba(0,0,0,.12)'; for (const x of [-26, 0, 26]) c.fillRect(x - 1, -18, 2, 15);
    c.fillStyle = '#fbf4e4'; ell(c, -20, -24, 12, 3.5); ell(c, 22, -24, 9, 3);   // flour in the trough
    const stone = (y, rx, h, top, side) => { c.fillStyle = side; c.fillRect(-rx, y, rx * 2, h); ell(c, 0, y + h, rx, rx * 0.26); c.fillStyle = top; ell(c, 0, y, rx, rx * 0.26); };
    const handle = () => { c.strokeStyle = '#6b4422'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(sx, -50 + Math.sin(a) * 5); c.lineTo(sx + 2, -84 + Math.sin(a) * 5); c.stroke(); };
    stone(-36, 30, 10, '#a8a8ac', '#8d8d93');    // the lower stone, fixed
    if (back) handle();
    stone(-52, 28, 12, '#bdbdc2', '#9a9aa0');    // the upper stone, turned by the handle
    c.fillStyle = '#5c5c62'; ell(c, 0, -52, 6, 2);   // the hole the grain goes in
    c.fillStyle = 'rgba(255,255,255,.18)'; ell(c, -10, -54, 9, 1.6);
    if (!back) handle();
    if (going) { c.fillStyle = 'rgba(255,250,235,.85)'; const p = (now() / 300) % 1; for (const [dx, k] of [[-31, 0], [31, 0.5]]) { const q = (p + k) % 1; circ(c, dx + Math.sign(dx) * q * 6, -32 + q * 8, 2.6 * (1 - q) + 0.6); } }
  },
  // Clothes icons: her, wearing the outfit.
  o_sorochka(c) { person(c, 0, -4, lookFor('sorochka'), 0, false, 1.08); },
  o_kersetka(c) { person(c, 0, -4, lookFor('kersetka'), 0, false, 1.08); },
  o_plakhta(c) { person(c, 0, -4, lookFor('plakhta'), 0, false, 1.08); },
  o_fartukh(c) { person(c, 0, -4, lookFor('fartukh'), 0, false, 1.08); },
  o_strichky(c) { person(c, 0, -4, lookFor('strichky'), 0, false, 1.08); },
  o_kozhushok(c) { person(c, 0, -4, lookFor('kozhushok'), 0, false, 1.08); },
  o_plashch(c) { person(c, 0, -4, lookFor('plashch'), 0, false, 1.08); },
  o_puhovyk(c) { person(c, 0, -4, lookFor('puhovyk'), 0, false, 1.08); },
  o_sarafan(c) { person(c, 0, -4, lookFor('sarafan'), 0, false, 1.08); },
  // A painted wooden wardrobe with two doors, flowers on the panels.
  shafa(c) {
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -1, 40, 6);
    c.fillStyle = '#8a5a2b'; rr(c, -34, -98, 68, 96, 6); c.fillStyle = '#a06a35'; rr(c, -30, -92, 29, 84, 4); rr(c, 1, -92, 29, 84, 4);
    c.fillStyle = '#6b4422'; c.fillRect(-36, -102, 72, 7); c.fillRect(-32, -4, 8, 4); c.fillRect(24, -4, 8, 4);
    for (const x of [-15.5, 15.5]) { c.fillStyle = '#d43a3a'; circ(c, x, -58, 6); c.fillStyle = '#ffd23f'; circ(c, x, -58, 2.4); c.fillStyle = '#3f8a3a'; ell(c, x - 7, -50, 4, 2); ell(c, x + 7, -50, 4, 2); }
    c.fillStyle = '#e8c35a'; circ(c, -4, -50, 2.4); circ(c, 4, -50, 2.4);
  },
  // An ice auger: a crank handle on top, the shaft, and the spiral bit with its cutting blades.
  lodobur(c) {
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -1, 18, 4);
    c.strokeStyle = '#8d939a'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -4); c.lineTo(0, -78); c.stroke();
    c.strokeStyle = '#5b6470'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, -78); c.lineTo(24, -78); c.lineTo(24, -68); c.stroke();
    c.fillStyle = '#d43a3a'; rr(c, 18, -70, 12, 22, 5); rr(c, -14, -84, 14, 12, 5);
    c.strokeStyle = '#c9ced4'; c.lineWidth = 4; c.beginPath(); for (let i = 0; i <= 16; i++) { const y = -40 + i * 2.4, x = Math.sin(i * 1.1) * 9; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
    c.fillStyle = '#e6e9ec'; poly(c, [[-9, -2], [9, -2], [0, 4]]);
  },
  // A village fountain: a round stone basin with a painted band, a column with a bowl, water arching down into
  // the pool with ripples and sparkle. In winter it's frozen, with icicles and snow on the rim.
  fontan(c, o) {
    const t = (o && o.t) || 0, cold = treeSeason(o) === 'zyma';
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, 2, 50, 10);
    c.fillStyle = '#cfc8b8'; c.beginPath(); c.ellipse(0, -10, 46, 15, 0, 0, Math.PI); c.lineTo(46, -22); c.ellipse(0, -22, 46, 15, 0, 0, Math.PI, true); c.closePath(); c.fill();
    c.fillStyle = '#3d7cc2'; c.fillRect(-46, -19, 92, 3); c.fillStyle = '#d43a3a'; for (let i = -4; i <= 4; i++) { c.save(); c.translate(i * 10, -16); c.rotate(Math.PI / 4); c.fillRect(-2, -2, 4, 4); c.restore(); }   // a painted band round the basin
    c.fillStyle = '#e4ded0'; ell(c, 0, -22, 46, 15); c.fillStyle = cold ? '#d6eaf8' : '#5fb1de'; ell(c, 0, -22, 40, 12);
    if (!cold) { c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1.2; for (let i = 0; i < 3; i++) { const r = ((t * 0.6 + i / 3) % 1); c.beginPath(); c.ellipse(0, -22, 6 + r * 30, (6 + r * 30) * 0.3, 0, 0, 7); c.stroke(); } c.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 5; i++) circ(c, Math.sin(t * 2 + i * 2) * 26, -22 + Math.cos(t * 1.7 + i) * 6, 1.2); }
    else { c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-20, -24); c.lineTo(-4, -20); c.lineTo(10, -25); c.stroke(); c.fillStyle = '#ffffff'; ell(c, -30, -33, 14, 4); ell(c, 26, -34, 16, 4); }
    c.fillStyle = '#cfc8b8'; c.fillRect(-5, -56, 10, 34); c.fillStyle = '#bcb4a2'; c.fillRect(-5, -56, 3, 34);
    c.fillStyle = '#d9d2c2'; ell(c, 0, -58, 18, 6); c.fillStyle = cold ? '#d6eaf8' : '#5fb1de'; ell(c, 0, -59, 14, 4);
    c.fillStyle = '#cfc8b8'; c.fillRect(-2.5, -70, 5, 12); c.fillStyle = '#e8c35a'; circ(c, 0, -72, 4);
    if (!cold) {   // water: a little spout on top, and streams arching from the bowl's lip into the pool
      c.strokeStyle = 'rgba(190,225,250,.85)'; c.lineWidth = 2.2; c.lineCap = 'round';
      for (const s of [-1, 1]) for (let j = 0; j < 2; j++) { c.beginPath(); c.moveTo(s * 13, -58); c.quadraticCurveTo(s * (20 + j * 6), -54, s * (24 + j * 8), -24); c.stroke(); }
      c.beginPath(); c.moveTo(0, -74); c.quadraticCurveTo(0, -84, 0, -80); c.stroke();
      c.fillStyle = 'rgba(220,240,255,.9)'; for (let i = 0; i < 10; i++) { const q = ((t * 1.3 + i / 10) % 1), s = i % 2 ? 1 : -1; circ(c, s * (13 + q * 14 + (i % 3) * 2), -58 + q * q * 36, 1.3); }
      for (let i = 0; i < 4; i++) { const q = ((t * 0.9 + i / 4) % 1), s = i % 2 ? 1 : -1; c.strokeStyle = `rgba(255,255,255,${0.6 * (1 - q)})`; c.lineWidth = 1; c.beginPath(); c.ellipse(s * 26, -23, 3 + q * 6, 1 + q * 2, 0, 0, 7); c.stroke(); }
    } else { c.fillStyle = '#e6f3fb'; for (const x of [-12, -6, 6, 12]) poly(c, [[x - 2, -57], [x + 2, -57], [x, -48 - Math.abs(x) * 0.3]]); c.fillStyle = '#ffffff'; ell(c, 0, -60, 14, 3.5); }
  },
  // A chopping block (a thick round of trunk) with the axe stuck in it and a little stack of split logs.
  koloda(c) {
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -1, 34, 6);
    c.fillStyle = '#8a5a2b'; c.fillRect(-22, -26, 44, 24); ell(c, 0, -2, 22, 6);
    c.fillStyle = '#d9b27a'; ell(c, 0, -26, 22, 7); c.strokeStyle = '#b08850'; c.lineWidth = 1.2; for (const r of [5, 10, 15]) { c.beginPath(); c.ellipse(0, -26, r, r * 0.32, 0, 0, 7); c.stroke(); }
    c.save(); c.translate(4, -30); c.rotate(-0.5); c.fillStyle = '#6b4422'; c.fillRect(-2.5, -34, 5, 34); c.fillStyle = '#9aa0a8'; poly(c, [[-3, -36], [12, -42], [14, -30], [-3, -28]]); c.restore();
    c.fillStyle = '#a06a35'; for (const [x, y] of [[30, -4], [40, -4], [35, -12]]) { c.fillRect(x - 5, y - 6, 10, 8); c.fillStyle = '#d9b27a'; ell(c, x + 5, y - 2, 2, 4); c.fillStyle = '#a06a35'; }
  },
  // The village notice board: a plank board on two posts under a little shingled roof, notes pinned to it.
  doshka(c) {
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -1, 40, 6);
    c.fillStyle = '#7a4a24'; c.fillRect(-33, -74, 7, 74); c.fillRect(26, -74, 7, 74);
    c.fillStyle = '#b5824e'; rr(c, -40, -86, 80, 54, 4);
    c.fillStyle = 'rgba(0,0,0,.08)'; for (const y of [-72, -58, -44]) c.fillRect(-40, y, 80, 2);
    c.fillStyle = '#8a3b2b'; poly(c, [[-48, -84], [0, -104], [48, -84], [44, -80], [0, -98], [-44, -80]]);
    const note = (x, y, w, h, r, col) => { c.save(); c.translate(x, y); c.rotate(r); c.fillStyle = col; c.fillRect(-w / 2, -h / 2, w, h); c.fillStyle = 'rgba(74,44,26,.45)'; for (let k = 0; k < 3; k++) c.fillRect(-w / 2 + 4, -h / 2 + 6 + k * 6, w - 8, 1.6); c.fillStyle = '#d43a3a'; circ(c, 0, -h / 2 + 2, 2.4); c.restore(); };
    note(-20, -62, 26, 30, -0.08, '#fffaf0'); note(10, -64, 24, 28, 0.06, '#ffe9a8'); note(-2, -46, 30, 16, -0.03, '#e8f4ff');
  },
  koshyk(c) { c.scale(3.8, 3.8); marketBasket(c, 0, -11.5); },   // the same wicker basket as in Oksana's bubble
  // The cottages. They share a shape (whitewashed walls, a thatched or shingled roof, two windows and a door)
  // but each one is its owner's: hers with blue trim and sunflowers, Grandma Olia's with painted flowers and green
  // shutters, Mr. Bohdan's with a shingle roof and a bee skep by the door, Taras's pale blue with a net drying on it.
  khata(c) { khataArt(c, KHATA_LOOK.mine); },
  khata_olia(c) { khataArt(c, KHATA_LOOK.olia); },
  khata_bohdan(c) { khataArt(c, KHATA_LOOK.bohdan); },
  khata_taras(c) { khataArt(c, KHATA_LOOK.taras); },
  parkan(c) {
    c.fillStyle = '#a8713f'; c.fillRect(-50, -44, 100, 6); c.fillRect(-50, -20, 100, 6);
    c.fillStyle = '#c08a55';
    for (let i = -2; i <= 2; i++) poly(c, [[i * 20 - 7, 0], [i * 20 - 7, -52], [i * 20, -62], [i * 20 + 7, -52], [i * 20 + 7, 0]]);
    for (const i of [-1, 2]) {   // clay jugs hung on the posts
      c.fillStyle = '#b8642e'; poly(c, [[i * 20 - 5, -62], [i * 20 + 5, -62], [i * 20 + 8, -78], [i * 20 - 8, -78]]); ell(c, i * 20, -79, 9, 3.4);
      c.fillStyle = '#d98446'; ell(c, i * 20 - 2, -72, 3, 7);
    }
  },
  well(c) {
    c.fillStyle = '#8a5a2b'; c.fillRect(-27, -82, 6, 48); c.fillRect(21, -82, 6, 48);
    c.fillStyle = '#c0503a'; poly(c, [[-38, -76], [0, -100], [38, -76]]);
    c.strokeStyle = '#6b4a2a'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -76); c.lineTo(0, -56); c.stroke();
    c.fillStyle = '#7a8a99'; rr(c, -7, -58, 14, 14, 2);
    c.fillStyle = '#b9b4ad'; rr(c, -30, -38, 60, 38, 6);
    c.fillStyle = '#9d9891'; for (let i = 0; i < 4; i++) { rr(c, -26 + i * 14, -32, 10, 7, 2); rr(c, -20 + i * 14, -20, 10, 7, 2); }
    c.fillStyle = '#4a90d9'; ell(c, 0, -38, 26, 5);
  },
  // Trees and bushes: a trunk, then a crown in three tones that leans a little in the wind (o.sway).
  tree(c, o) {
    const sea = treeSeason(o), P = treePal(sea, o);
    if (sea === 'osin') fallenLeaves(c, o, 46);
    c.fillStyle = '#7a4e26'; poly(c, [[-10, 0], [-6, -46], [6, -46], [10, 0]]);
    c.fillStyle = '#93602f'; poly(c, [[-6, 0], [-3.5, -46], [2.5, -46], [1.5, 0]]);
    c.save(); c.translate(0, -40); c.rotate((o && o.sway) || 0); c.translate(0, 40);
    if (sea === 'zyma') { bareBranches(c, 1); c.restore(); return; }
    c.fillStyle = P[0]; circ(c, 0, -62, 33); circ(c, -23, -47, 20); circ(c, 23, -47, 20);
    c.fillStyle = P[1]; circ(c, 0, -67, 32); circ(c, -22, -52, 19); circ(c, 22, -52, 19);
    c.fillStyle = P[2]; circ(c, -8, -77, 16); circ(c, 14, -63, 11); circ(c, -23, -57, 9);
    c.fillStyle = P[3]; circ(c, -11, -82, 7); circ(c, 12, -67, 4.5);
    if (sea === 'osin') autumnSpeckle(c, o); if (sea === 'vesna') blossom(c, o, 1);
    c.restore();
  },
  appletree(c, o) {
    const sea = treeSeason(o), P = sea === 'lito' ? ['#3d9748', '#4fae55', '#6cc86e', '#8ad888'] : treePal(sea, o);
    if (sea === 'osin') fallenLeaves(c, o, 48);
    c.fillStyle = '#7a4e26'; poly(c, [[-10, 0], [-6, -46], [6, -46], [10, 0]]);
    c.fillStyle = '#93602f'; poly(c, [[-6, 0], [-3.5, -46], [2.5, -46], [1.5, 0]]);
    c.save(); c.translate(0, -40); c.rotate((o && o.sway) || 0); c.translate(0, 40);
    if (sea === 'zyma') { bareBranches(c, 1.05); c.restore(); return; }
    c.fillStyle = P[0]; circ(c, 0, -61, 35); circ(c, -25, -46, 21); circ(c, 25, -46, 21);
    c.fillStyle = P[1]; circ(c, 0, -66, 34); circ(c, -24, -51, 20); circ(c, 24, -51, 20);
    c.fillStyle = P[2]; circ(c, -8, -78, 15); circ(c, 15, -62, 10);
    c.fillStyle = P[3]; circ(c, -11, -83, 6.5);
    if (sea === 'osin') autumnSpeckle(c, o); if (sea === 'vesna') { blossom(c, o, 1.1); c.restore(); return; }   // in spring it flowers instead of fruiting
    if (!o || o.fruit !== false) for (const [x, y] of [[-20, -56], [-4, -70], [14, -80], [22, -54], [2, -48], [-16, -84]]) { c.fillStyle = '#c92a22'; circ(c, x, y + 0.8, 5.2); c.fillStyle = '#e8463b'; circ(c, x, y, 4.8); c.fillStyle = 'rgba(255,255,255,.55)'; circ(c, x - 1.6, y - 1.8, 1.4); }
    c.restore();
  },
  bush(c, o) {
    const sea = treeSeason(o), P = sea === 'lito' ? ['#3f9a4a', '#57b25d', '#74c773'] : treePal(sea, o).slice(1);
    if (sea === 'osin') fallenLeaves(c, o, 30);
    c.save(); c.rotate(((o && o.sway) || 0) * 0.6);
    if (sea === 'zyma') { c.strokeStyle = '#6b4422'; c.lineWidth = 2.4; c.lineCap = 'round'; for (const [x2, y2] of [[-26, -30], [-12, -44], [4, -50], [18, -42], [28, -26], [-2, -36]]) { c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(x2 * 0.4, y2 * 0.5, x2, y2); c.stroke(); } c.fillStyle = '#ffffff'; for (const [x2, y2] of [[-26, -31], [-12, -45], [4, -51], [18, -43], [28, -27]]) ell(c, x2, y2, 5, 2.2); ell(c, 0, -2, 30, 5); c.restore(); return; }   // bare twigs with snow on them
    c.fillStyle = P[0]; circ(c, -18, -16, 20); circ(c, 16, -18, 22); circ(c, 0, -31, 22);
    c.fillStyle = P[1]; circ(c, -18, -19, 19); circ(c, 16, -21, 21); circ(c, 0, -35, 21);
    c.fillStyle = P[2]; circ(c, -6, -42, 10); circ(c, -22, -25, 8); circ(c, 19, -28, 8);
    c.fillStyle = '#e2574c'; circ(c, -12, -26, 3); circ(c, 8, -38, 3); circ(c, 20, -18, 3);
    c.fillStyle = 'rgba(255,255,255,.5)'; circ(c, -13, -27, 1); circ(c, 7, -39, 1); circ(c, 19, -19, 1);
    c.restore();
  },
  stone(c) { c.fillStyle = '#a9a6a0'; ell(c, 0, -22, 40, 23); c.fillStyle = '#c4c1bb'; ell(c, -8, -30, 20, 9); },
  pond(c) { c.fillStyle = '#6cc3e8'; ell(c, 0, -45, 48, 32); c.fillStyle = '#a5e0f5'; ell(c, -12, -52, 18, 7); },
  // A white village church: a tall middle with a golden onion dome on a drum, two lower wings with blue
  // domes, arched windows and a wooden door, gold crosses on top.
  church(c) {
    c.save(); c.scale(0.77, 0.77);   // drawn 130 tall, fitted into the 100-unit icon box
    const wall = '#fffaf0', shade = '#ebe2cf', trim = '#c9b98f';
    const arch = (x, y, w, h) => { c.beginPath(); c.moveTo(x - w / 2, y); c.lineTo(x - w / 2, y - h + w / 2); c.arc(x, y - h + w / 2, w / 2, Math.PI, 0); c.lineTo(x + w / 2, y); c.closePath(); c.fill(); };
    const onion = (x, yb, w, h, col, hi) => {
      c.fillStyle = col; c.beginPath(); c.moveTo(x - w * 0.42, yb);
      c.bezierCurveTo(x - w * 0.78, yb - h * 0.38, x - w * 0.5, yb - h * 0.72, x, yb - h);
      c.bezierCurveTo(x + w * 0.5, yb - h * 0.72, x + w * 0.78, yb - h * 0.38, x + w * 0.42, yb); c.closePath(); c.fill();
      c.fillStyle = hi; c.beginPath(); c.moveTo(x - w * 0.3, yb - h * 0.12);
      c.bezierCurveTo(x - w * 0.52, yb - h * 0.4, x - w * 0.3, yb - h * 0.66, x - w * 0.04, yb - h * 0.86);
      c.bezierCurveTo(x - w * 0.2, yb - h * 0.6, x - w * 0.28, yb - h * 0.36, x - w * 0.12, yb - h * 0.12); c.closePath(); c.fill();
    };
    const cross = (x, y, k) => {
      c.fillStyle = '#e8b628'; c.fillRect(x - 1.3 * k, y - 15 * k, 2.6 * k, 15 * k); c.fillRect(x - 5 * k, y - 11.5 * k, 10 * k, 2.2 * k);
      c.save(); c.translate(x, y - 4.5 * k); c.rotate(-0.35); c.fillRect(-4 * k, -1 * k, 8 * k, 2 * k); c.restore();
      c.fillStyle = '#f7d65a'; circ(c, x, y, 2 * k);
    };
    // side wings
    for (const sd of [-1, 1]) {
      const x = sd * 33;
      c.fillStyle = wall; c.fillRect(x - 13, -40, 26, 40);
      c.fillStyle = shade; c.fillRect(sd > 0 ? x + 6 : x - 13, -40, 7, 40);
      c.fillStyle = '#2f6fb8'; poly(c, [[x - 16, -39], [x + 16, -39], [x + 11, -47], [x - 11, -47]]);
      c.fillStyle = wall; c.fillRect(x - 5, -56, 10, 10); c.fillStyle = trim; c.fillRect(x - 6, -47, 12, 2);
      onion(x, -55, 14, 15, '#2f6fb8', '#6aa3e0'); cross(x, -70, 0.7);
      c.fillStyle = '#3a6fa8'; arch(x, -12, 9, 18); c.fillStyle = '#bfe3fa'; arch(x, -13.5, 6.5, 15);
      c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(x - 0.5, -26, 1, 12);
    }
    // the middle: nave, gable, drum, golden dome
    c.fillStyle = wall; c.fillRect(-21, -62, 42, 62);
    c.fillStyle = shade; c.fillRect(11, -62, 10, 62);
    c.fillStyle = '#2f6fb8'; poly(c, [[-25, -60], [25, -60], [0, -76]]);
    c.fillStyle = '#245a96'; poly(c, [[0, -76], [25, -60], [12, -60]]);
    c.fillStyle = wall; c.fillRect(-10, -88, 20, 20); c.fillStyle = shade; c.fillRect(4, -88, 6, 20);
    c.fillStyle = '#3a6fa8'; for (const x of [-5, 3]) arch(x, -73, 4, 10);
    c.fillStyle = trim; c.fillRect(-12, -89, 24, 2.5);
    onion(0, -88, 24, 26, '#e3a91f', '#fbe07a'); cross(0, -114, 1);
    // round window over the door, the door itself, the base
    c.fillStyle = '#3a6fa8'; circ(c, 0, -46, 5); c.fillStyle = '#bfe3fa'; circ(c, 0, -46, 3.6);
    c.fillStyle = '#c9a65a'; arch(0, 0, 18, 30);
    c.fillStyle = '#7a4a24'; arch(0, 0, 14.5, 27);
    c.fillStyle = '#5e3818'; c.fillRect(-0.6, -21, 1.2, 21);
    c.fillStyle = '#e8b628'; circ(c, -2.5, -11, 1.2); circ(c, 2.5, -11, 1.2);
    c.fillStyle = '#d6cdb6'; c.fillRect(-48, -5, 96, 5);
    c.fillStyle = '#c9a65a'; c.fillRect(-21, -63, 42, 2); for (const x of [-33, 33]) c.fillRect(x - 13, -41, 26, 2);
    c.restore();
  },
  // A wooden Ukrainian windmill: a tapering plank tower on a stone footing, a shingled cap, a little door
  // and window, and four lattice sails with canvas on them that turn in the wind.
  mill(c, o) {
    c.save(); c.scale(0.84, 0.84);   // the sails reach 116 up; fit them into the 100-unit icon box
    c.fillStyle = '#9d988f'; c.fillRect(-27, -8, 54, 8);
    c.fillStyle = '#b8b3a9'; for (const [x, w] of [[-26, 12], [-13, 14], [2, 11], [14, 12]]) rr(c, x, -8, w, 6, 2);
    c.fillStyle = '#b07a45'; poly(c, [[-24, -7], [24, -7], [15, -62], [-15, -62]]);
    c.strokeStyle = 'rgba(90,55,25,.35)'; c.lineWidth = 1.1;
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 6.6, -7); c.lineTo(i * 4.1, -62); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,.13)'; poly(c, [[9, -7], [24, -7], [15, -62], [6, -62]]);
    c.fillStyle = '#8a5a2b'; poly(c, [[-21, -33], [21, -33], [20.5, -30], [-20.5, -30]]); poly(c, [[-16, -60], [16, -60], [15.6, -57], [-15.6, -57]]);
    // door, steps, window
    c.fillStyle = '#7a4a24'; rr(c, -6.5, -24, 13, 17, [6.5, 6.5, 0, 0]); c.fillStyle = '#e8b628'; circ(c, 3.5, -15, 1.1);
    c.fillStyle = '#8a7f70'; c.fillRect(-9, -7, 18, 3); c.fillStyle = '#a89e8e'; c.fillRect(-7, -9, 14, 2.5);
    c.fillStyle = '#5e3818'; c.fillRect(-5.5, -50, 11, 11); c.fillStyle = '#ffe9a8'; c.fillRect(-4, -48.5, 8, 8);
    c.fillStyle = '#5e3818'; c.fillRect(-0.5, -48.5, 1, 8); c.fillRect(-4, -45, 8, 1);
    // shingled cap
    c.fillStyle = '#6b4224'; c.beginPath(); c.moveTo(-20, -60); c.quadraticCurveTo(-17, -80, 0, -88); c.quadraticCurveTo(17, -80, 20, -60); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(40,20,5,.35)'; c.lineWidth = 1;
    for (const [y, w] of [[-66, 18], [-72, 15], [-78, 11]]) { c.beginPath(); for (let x = -w; x < w; x += 4) { c.moveTo(x + 4, y); c.arc(x + 2, y, 2, 0, Math.PI); } c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.moveTo(-15, -62); c.quadraticCurveTo(-13, -78, -2, -85); c.quadraticCurveTo(-9, -76, -9, -62); c.closePath(); c.fill();
    c.fillStyle = '#4a2c14'; c.fillRect(-1, -94, 2, 7); circ(c, 0, -95, 2);
    // sails
    c.save(); c.translate(0, -66); c.rotate(((o && o.t) || 0) * 0.5);
    for (let i = 0; i < 4; i++) {
      c.rotate(Math.PI / 2);
      c.fillStyle = '#5e3818'; c.fillRect(-1.6, -50, 3.2, 50);
      c.fillStyle = 'rgba(246,238,220,.92)'; c.fillRect(2, -49, 11, 38);
      c.strokeStyle = '#7a4a24'; c.lineWidth = 1.2; c.strokeRect(2, -49, 11, 38);
      c.beginPath();
      for (let k = 1; k < 5; k++) { const y = -49 + k * 7.6; c.moveTo(1.6, y); c.lineTo(13, y); }
      c.moveTo(7.5, -49); c.lineTo(7.5, -11); c.stroke();
    }
    c.fillStyle = '#4a2c14'; circ(c, 0, 0, 5.5); c.fillStyle = '#8a5a2b'; circ(c, 0, 0, 3); c.restore();
    c.restore();
  },
  // A butterfly seen from above: orange forewings with dark edges and white spots, yellow hindwings.
  // The wings fold up and open (drawn narrower and wider), with an occasional glide.
  metelyk(c, o) {
    const t = (o && o.t) || 0, glide = Math.sin(t * 0.9) > 0.6;
    const f = glide ? 0.85 + 0.1 * Math.sin(t * 3) : 0.2 + 0.8 * Math.abs(Math.cos(t * 9));
    c.save(); c.translate(0, -50);
    for (const sd of [-1, 1]) {
      c.save(); c.scale(sd * f, 1);
      c.save(); c.translate(19, -12); c.rotate(-0.45);
      c.fillStyle = '#3a2416'; ell(c, 0, 0, 23, 17); c.fillStyle = '#f08a24'; ell(c, -1.5, 1, 19, 13.5);
      c.fillStyle = '#fbb24a'; ell(c, -6, 3, 9, 6); c.fillStyle = '#fff'; circ(c, 17, -4, 2.2); circ(c, 13, -9, 1.8); circ(c, 19, 2, 1.6);
      c.restore();
      c.save(); c.translate(14, 13); c.rotate(0.5);
      c.fillStyle = '#3a2416'; ell(c, 0, 0, 15, 13); c.fillStyle = '#f7c53a'; ell(c, -1, -0.5, 11.5, 9.5);
      c.fillStyle = '#fff'; circ(c, 11, 3, 1.5);
      c.restore();
      c.restore();
    }
    c.fillStyle = '#2b1a10'; ell(c, 0, 2, 3.6, 19); circ(c, 0, -19, 4.4);
    c.strokeStyle = '#2b1a10'; c.lineWidth = 1.6; c.lineCap = 'round';
    for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(sd * 1.5, -22); c.quadraticCurveTo(sd * 4, -34, sd * 10, -38); c.stroke(); circ(c, sd * 10, -38, 2); }
    c.restore();
  },
  // A bench seen from its end, so it faces right (into the square): legs, the seat, the backrest on the far side.
  benchside(c) {
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -1, 26, 6);
    c.fillStyle = '#7a4b22'; c.fillRect(-16, -22, 5, 22); c.fillRect(12, -22, 5, 22); c.fillRect(-20, -52, 5, 52);
    c.fillStyle = '#b07a44'; rr(c, -22, -28, 44, 8, 3); c.fillStyle = '#c99463'; rr(c, -22, -30, 44, 4, 2);
    c.fillStyle = '#b07a44'; rr(c, -24, -56, 9, 30, 3); c.fillStyle = '#c99463'; c.fillRect(-23, -54, 2, 26);
    c.fillStyle = '#d43a3a'; c.fillRect(-24, -46, 9, 3);
  },
  bench(c) {
    c.fillStyle = '#8a5a2b'; c.fillRect(-34, -30, 7, 30); c.fillRect(27, -30, 7, 30);
    c.fillStyle = '#c08a55'; rr(c, -42, -36, 84, 10, 3); rr(c, -42, -58, 84, 9, 3);
  },
  stork(c, o) {
    const sea = treeSeason(o);
    c.fillStyle = '#8a5a2b'; c.fillRect(-3, -66, 6, 66);
    c.fillStyle = '#a67c42'; ell(c, 0, -68, 26, 8); c.strokeStyle = '#7a5a2a'; c.lineWidth = 1.2; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(-24 + i * 8, -66); c.lineTo(-18 + i * 8, -72); c.stroke(); }
    if (sea === 'osin' || sea === 'zyma') { if (sea === 'zyma') { c.fillStyle = '#ffffff'; ell(c, 0, -72, 24, 5); } return; }   // the storks are away for the winter
    if (sea === 'lito') { c.fillStyle = '#ffffff'; for (const dx of [-12, -4]) { circ(c, dx, -76, 4); c.fillStyle = '#2d2d2d'; poly(c, [[dx + 3, -77], [dx + 8, -76], [dx + 3, -75]]); c.fillStyle = '#ffffff'; } }   // two chicks in the nest
    const clack = Math.sin(((o && o.t) || 0) * 14) > 0.6 ? 2 : 0;
    c.strokeStyle = '#e2574c'; c.lineWidth = 2; c.beginPath(); c.moveTo(-3, -74); c.lineTo(-3, -84); c.moveTo(4, -74); c.lineTo(4, -84); c.stroke();
    c.fillStyle = '#2d2d2d'; poly(c, [[-16, -92], [-4, -96], [-4, -86]]);
    c.fillStyle = '#ffffff'; ell(c, 1, -90, 12, 7); c.fillRect(8, -104, 4, 14); circ(c, 11, -105, 5);
    c.fillStyle = '#e2574c'; poly(c, [[15, -107], [29, -103 - clack], [15, -102]]); poly(c, [[15, -104], [29, -102 + clack], [15, -101]]);   // the bill clacks now and then
    c.fillStyle = '#2d2d2d'; circ(c, 12, -106, 1.2);
  },
  // A hedgehog: a round spiky back, a pointed face with a black nose, little feet.
  yizhak(c, o) {
    const t = (o && o.t) || 0, step = o && o.walk ? Math.sin(t * 10) * 2 : 0;
    c.fillStyle = 'rgba(0,0,0,.15)'; ell(c, 0, -1, 26, 5);
    c.fillStyle = '#5b4636'; for (const [x, s] of [[-12, step], [10, -step]]) rr(c, x - 3, -8 + s * 0.3, 6, 8, 2);
    c.fillStyle = '#6b4c32'; for (let i = 0; i < 16; i++) { const a = Math.PI * (1.02 + i / 15 * 0.98), r = 24; poly(c, [[Math.cos(a) * r * 0.75, -14 + Math.sin(a) * r * 0.6], [Math.cos(a) * (r + 7), -14 + Math.sin(a) * (r * 0.6 + 7)], [Math.cos(a + 0.12) * r * 0.75, -14 + Math.sin(a + 0.12) * r * 0.6]]); }
    c.fillStyle = '#8a6440'; ell(c, -2, -14, 22, 13);
    c.fillStyle = '#d9b48a'; poly(c, [[14, -18], [30, -8], [14, -4]]); ell(c, 16, -11, 7, 7);
    c.fillStyle = '#2a1d14'; circ(c, 30, -8, 2.4); circ(c, 18, -14, 1.6);
  },
  // The hedgehog's winter bed: a heap of brown leaves under snow, a sleepy nose poking out, and a z.
  kupka(c, o) {
    const t = (o && o.t) || 0;
    c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, 0, -1, 30, 6);
    for (let i = 0; i < 18; i++) { const a = i * 2.3; c.fillStyle = ['#8a5a2b', '#a8381f', '#c0721a', '#6b4422'][i % 4]; ell(c, Math.cos(a) * 18 * (0.4 + (i % 3) * 0.3), -10 + Math.sin(a) * 6 - (i % 4) * 2, 6, 3); }
    c.fillStyle = '#ffffff'; ell(c, -2, -18, 20, 6); ell(c, 8, -16, 10, 4);
    c.fillStyle = '#d9b48a'; ell(c, 20, -6, 5, 3.5); c.fillStyle = '#2a1d14'; circ(c, 24, -6, 1.6);
    c.fillStyle = 'rgba(74,44,26,.7)'; c.font = '700 10px system-ui'; c.textAlign = 'center'; c.fillText('z', 26 + Math.sin(t) * 2, -18 - ((t * 0.6) % 1) * 10);
  },
  // A nest of twigs.
  hnizdo(c) { c.fillStyle = '#a67c42'; ell(c, 0, -14, 34, 12); c.strokeStyle = '#7a5a2a'; c.lineWidth = 2; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(-32 + i * 8, -10); c.lineTo(-26 + i * 8, -20); c.stroke(); } c.fillStyle = '#5a3d20'; ell(c, 0, -20, 24, 5); },
  // A crane: tall and grey, a long neck, a black-and-white head with a red crown.
  zhuravel(c) {
    c.strokeStyle = '#5b5b62'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-4, -2); c.lineTo(-2, -36); c.moveTo(6, -2); c.lineTo(4, -36); c.stroke();
    c.fillStyle = '#9aa0a8'; ell(c, 0, -44, 22, 12); c.fillStyle = '#5b5b62'; poly(c, [[-18, -46], [-34, -36], [-20, -40]]);
    c.strokeStyle = '#9aa0a8'; c.lineWidth = 5; c.beginPath(); c.moveTo(14, -48); c.quadraticCurveTo(22, -70, 18, -90); c.stroke();
    c.fillStyle = '#2a2a2a'; circ(c, 19, -92, 6); c.fillStyle = '#ffffff'; c.fillRect(15, -88, 3, 14); c.fillStyle = '#d43a3a'; circ(c, 19, -97, 2.5);
    c.fillStyle = '#5b5b62'; poly(c, [[24, -93], [38, -90], [24, -89]]);
  },
  // A blue tit: yellow front, blue cap and wings, white cheeks with a black stripe.
  synytsia(c) {
    c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, 0, -1, 18, 4);
    c.fillStyle = '#5b8fc9'; ell(c, -6, -26, 16, 10); poly(c, [[-18, -24], [-32, -18], [-20, -18]]);
    c.fillStyle = '#ffd23f'; ell(c, 2, -22, 13, 12);
    c.fillStyle = '#ffffff'; circ(c, 10, -38, 9); c.fillStyle = '#3d6fb0'; c.beginPath(); c.arc(10, -40, 9, Math.PI, 0); c.fill(); c.fillStyle = '#1d1d24'; c.fillRect(2, -36, 16, 2.5); circ(c, 13, -38, 1.6);
    c.fillStyle = '#3a3a3a'; poly(c, [[18, -38], [24, -36], [18, -35]]); c.strokeStyle = '#5b5b62'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, -10); c.lineTo(0, -1); c.moveTo(6, -10); c.lineTo(6, -1); c.stroke();
  },
  // A bullfinch: a round red breast, a black cap, a grey back.
  snihur(c) {
    c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, 0, -1, 18, 4);
    c.fillStyle = '#7d8089'; ell(c, -6, -26, 16, 11); c.fillStyle = '#2a2a2a'; poly(c, [[-18, -24], [-32, -16], [-20, -18]]);
    c.fillStyle = '#e04a3a'; ell(c, 3, -22, 13, 13);
    c.fillStyle = '#7d8089'; circ(c, 10, -38, 9); c.fillStyle = '#1d1d24'; c.beginPath(); c.arc(10, -40, 9, Math.PI * 0.9, Math.PI * 0.1 + Math.PI * 2); c.fill(); circ(c, 14, -37, 1.6);
    c.fillStyle = '#2a2a2a'; poly(c, [[18, -37], [23, -35], [18, -33]]);
  },
  // The bird feeder: a little wooden house on a post with a roof of snow, and birds on it once you've fed them.
  hodivnychka(c, o) {
    const t = (o && o.t) || 0, fed = S.feedT > now();
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -1, 20, 5);
    c.fillStyle = '#7a4b22'; c.fillRect(-3, -58, 6, 58);
    c.fillStyle = '#a06a35'; c.fillRect(-20, -66, 40, 6); c.fillRect(-18, -82, 4, 16); c.fillRect(14, -82, 4, 16);
    c.fillStyle = '#8a3b2b'; poly(c, [[-26, -80], [0, -98], [26, -80]]); c.fillStyle = '#ffffff'; poly(c, [[-26, -81], [0, -99], [26, -81], [20, -78], [0, -93], [-20, -78]]);
    if (fed) { c.fillStyle = '#d9b27a'; for (let i = 0; i < 8; i++) ell(c, -14 + i * 4, -67, 1.6, 1); }
    if (fed) for (let i = 0; i < 4; i++) { const hop = Math.abs(Math.sin(t * 5 + i * 1.7)) * 4, bx = [-12, 6, -26, 22][i], by = [-66, -66, -4, -4][i] - hop; c.save(); c.translate(bx, by); c.scale(0.45 * (i % 2 ? -1 : 1), 0.45); DRAW[i % 2 ? 'snihur' : 'synytsia'](c); c.restore(); }
  },
  // A snowball.
  snizhka(c) { c.fillStyle = '#ffffff'; circ(c, 0, -26, 24); c.strokeStyle = '#c3d2e4'; c.lineWidth = 2; c.beginPath(); c.arc(0, -26, 24, 0.3, Math.PI - 0.3); c.stroke(); c.fillStyle = '#dbe5f2'; circ(c, 8, -32, 4); circ(c, -7, -20, 3); },
  hive(c) {
    c.fillStyle = '#8a5a2b'; c.fillRect(-20, -8, 6, 8); c.fillRect(14, -8, 6, 8);
    c.fillStyle = '#f2c230'; rr(c, -24, -54, 48, 48, 5);
    c.fillStyle = '#c98a1a'; c.fillRect(-24, -40, 48, 4); c.fillRect(-24, -26, 48, 4);
    c.fillStyle = '#8a5a2b'; poly(c, [[-30, -52], [0, -70], [30, -52]]);
    c.fillStyle = '#3b2f2a'; ell(c, 0, -14, 7, 4);
  },
  // The market stall: carved РИНОК sign with painted flowers, a scalloped striped awning, blue-and-yellow
  // bunting, a garlic braid and a string of red peppers, a counter with an embroidered trim piled with
  // produce, bread and honey, and crates on the ground in front.
  stall(c) {
    const wood = '#9a6634', dark = '#6b4422', red = '#d43a3a', cream = '#fffaf0';
    // posts
    c.fillStyle = dark; c.fillRect(-46, -84, 4, 84); c.fillRect(42, -84, 4, 84);
    // awning: striped, with a scalloped edge
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? cream : red; c.fillRect(-50 + i * 12.5, -90, 12.5, 12); }
    for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? cream : red; c.beginPath(); c.arc(-43.75 + i * 12.5, -78, 6.25, 0, Math.PI); c.fill(); }
    c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(-50, -79, 100, 1.5);
    // carved sign board above the awning
    c.fillStyle = dark; rr(c, -30, -104, 60, 15, 3);
    c.fillStyle = wood; rr(c, -28.5, -102.5, 57, 12, 2.5);
    c.beginPath(); c.moveTo(-12, -104); c.quadraticCurveTo(0, -112, 12, -104); c.closePath(); c.fill();
    c.fillStyle = cream; c.font = '900 9px "Cozy", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('РИНОК', 0, -96);
    const fl = (x, y) => { c.fillStyle = red; for (let k = 0; k < 5; k++) { const ang = k * 1.2566; circ(c, x + Math.cos(ang) * 1.6, y + Math.sin(ang) * 1.6, 1.1); } c.fillStyle = '#f2c230'; circ(c, x, y, 0.9); };
    fl(-23, -96); fl(23, -96); fl(0, -106.5);
    // bunting in blue and yellow
    c.strokeStyle = '#6b4422'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(-42, -70); c.quadraticCurveTo(0, -62, 42, -70); c.stroke();
    for (let i = 0; i < 9; i++) { const x = -38 + i * 9.5, y = -69 + Math.sin((i / 8) * Math.PI) * 3.8; c.fillStyle = i % 2 ? '#f2c230' : '#2c6ed5'; poly(c, [[x - 3, y], [x + 3, y], [x, y + 6]]); }
    // garlic braid (left) and red peppers (right)
    c.strokeStyle = '#c8b27a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-36, -76); c.lineTo(-36, -50); c.stroke();
    c.fillStyle = '#f3ece0'; for (let i = 0; i < 5; i++) circ(c, -36 + (i % 2 ? 2 : -2), -72 + i * 5, 2.6);
    c.strokeStyle = '#4f7a3a'; c.beginPath(); c.moveTo(36, -76); c.lineTo(36, -52); c.stroke();
    c.fillStyle = '#c8322b'; for (let i = 0; i < 6; i++) { c.save(); c.translate(36 + (i % 2 ? 2 : -2), -72 + i * 4); c.rotate(i % 2 ? 0.5 : -0.5); ell(c, 0, 0, 1.4, 3); c.restore(); }
    // counter with planks and an embroidered trim
    c.fillStyle = wood; c.fillRect(-46, -38, 92, 36);
    c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 0.7; for (let x = -38; x < 46; x += 9) { c.beginPath(); c.moveTo(x, -34); c.lineTo(x, -2); c.stroke(); }
    c.fillStyle = dark; c.fillRect(-48, -40, 96, 4);
    c.fillStyle = cream; c.fillRect(-46, -34, 92, 6);
    c.fillStyle = red; for (let x = -42; x < 44; x += 6) poly(c, [[x, -33.5], [x + 2, -31], [x, -28.5], [x - 2, -31]]);
    // produce on the counter
    c.fillStyle = '#a8713f'; rr(c, -44, -48, 18, 8, 2);
    c.fillStyle = '#e2392f'; for (const [x, y] of [[-40, -49], [-35, -50], [-30, -49], [-37.5, -53], [-32.5, -53]]) circ(c, x, y, 2.6);
    c.fillStyle = '#6fbf5a'; circ(c, -18, -45, 5); c.fillStyle = '#9ad683'; circ(c, -18, -45, 3); c.strokeStyle = '#4f8a3a'; c.lineWidth = 0.6; c.beginPath(); c.arc(-18, -45, 4, 0.6, 2.4); c.stroke();
    c.fillStyle = '#6fbf5a'; circ(c, -9, -44, 4.2); c.fillStyle = '#9ad683'; circ(c, -9, -44, 2.4);
    c.fillStyle = '#d9963a'; ell(c, 2, -44, 7, 4.5); c.fillStyle = '#efb758'; ell(c, 1, -45.5, 4, 2);
    c.fillStyle = '#ec8a24'; ell(c, 14, -45, 5.5, 4.5); c.fillStyle = '#d9741a'; ell(c, 14, -45, 2, 4.5); c.fillStyle = '#5b7a2a'; c.fillRect(13.5, -51, 1.4, 2.6);
    c.fillStyle = '#f08a2b'; for (let i = 0; i < 4; i++) { c.save(); c.translate(24 + i * 2, -43); c.rotate(-0.3 + i * 0.15); poly(c, [[-1.3, -6], [1.3, -6], [0, 4]]); c.restore(); }
    c.fillStyle = '#4fae55'; for (let i = 0; i < 4; i++) ell(c, 24 + i * 2, -50, 1, 2.2);
    for (const x of [35, 41]) { c.fillStyle = '#f2b31a'; rr(c, x - 2.6, -48, 5.2, 7, 1.5); c.fillStyle = '#fffaf0'; c.fillRect(x - 2.6, -48.5, 5.2, 1.6); c.fillStyle = '#d43a3a'; c.fillRect(x - 2.6, -48.8, 5.2, 0.8); }
    // crates on the ground in front
    const crate = (x, col) => { c.fillStyle = '#b5824e'; c.fillRect(x - 9, -9, 18, 9); c.strokeStyle = '#8a5a2b'; c.lineWidth = 0.8; c.strokeRect(x - 9, -9, 18, 9); c.beginPath(); c.moveTo(x - 9, -4.5); c.lineTo(x + 9, -4.5); c.stroke(); c.fillStyle = col; for (let i = 0; i < 4; i++) circ(c, x - 6 + i * 4, -10, 2.4); };
    crate(-33, '#c9a05a'); crate(33, '#e2392f');
    if (nightNow()) {   // closed: a sacking cloth over the produce and the crates, and a board hung up saying so
      c.fillStyle = '#b89a68'; c.beginPath(); c.moveTo(-49, -57); c.quadraticCurveTo(0, -61, 49, -57); c.lineTo(50, -30); c.quadraticCurveTo(25, -26, 0, -30); c.quadraticCurveTo(-25, -26, -50, -30); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(90,60,30,.35)'; c.lineWidth = 0.8; for (let x = -40; x < 48; x += 10) { c.beginPath(); c.moveTo(x, -58); c.quadraticCurveTo(x + 2, -44, x, -29); c.stroke(); }
      c.fillStyle = '#a5875a'; for (const x of [-33, 33]) rr(c, x - 10, -11, 20, 11, 2);
      c.strokeStyle = '#5a381b'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-14, -74); c.lineTo(-10, -66); c.moveTo(14, -74); c.lineTo(10, -66); c.stroke();
      c.fillStyle = '#6b4422'; rr(c, -18, -67, 36, 11, 2); c.fillStyle = '#fffaf0'; c.font = '700 6.5px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('ЗАЧИНЕНО', 0, -61.3);
    }
  },
  plot(c) {
    c.fillStyle = '#8a5a3c'; rr(c, -46, -72, 92, 64, 10);
    c.strokeStyle = '#6f452c'; c.lineWidth = 3;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(-36, -58 + i * 18); c.lineTo(36, -58 + i * 18); c.stroke(); }
  },
  table(c, o) {
    const sw = (o && o.swing) || 0, at = y => sw * (y + 54) / 26;   // the hanging end swings, the top stays put
    c.fillStyle = '#8a5a2b'; c.fillRect(-38, -42, 8, 42); c.fillRect(30, -42, 8, 42);
    c.fillStyle = '#c08a55'; rr(c, -46, -54, 92, 13, 4);
    c.fillStyle = '#fffdf5'; if (!sw) rr(c, -16, -56, 32, 28, 2); else { rr(c, -16, -56, 32, 4, 2); poly(c, [[-16, -54], [16, -54], [16 + sw, -28], [-16 + sw, -28]]); }
    c.fillStyle = '#e2574c';
    for (const [y, h] of [[-34, 3], [-40, 2]]) poly(c, [[-16 + at(y), y], [16 + at(y), y], [16 + at(y + h), y + h], [-16 + at(y + h), y + h]]);
  },
  // A traditional Ukrainian килим: black border with ochre diamonds, a deep burgundy field, a central
  // folk medallion with a red rose, stylised roses with leaves either side, cream stars, and fringed ends.
  rug(c) {
    const black = '#1f1a17', field = '#7a1f22', ochre = '#e0a63a', green = '#4f7a3a', red = '#c8322b', cream = '#f3e6c8';
    c.strokeStyle = cream; c.lineWidth = 0.8;
    for (let y = -45; y <= -9; y += 2.4) { c.beginPath(); c.moveTo(-48, y); c.lineTo(-52, y); c.moveTo(48, y); c.lineTo(52, y); c.stroke(); }
    c.fillStyle = black; c.fillRect(-48, -46, 96, 38);
    c.fillStyle = ochre; for (let x = -45; x <= 45; x += 6) { poly(c, [[x, -44.6], [x + 1.6, -43], [x, -41.4], [x - 1.6, -43]]); poly(c, [[x, -12.6], [x + 1.6, -11], [x, -9.4], [x - 1.6, -11]]); }
    c.fillStyle = red; for (let y = -38; y <= -16; y += 5.5) { poly(c, [[-45.5, y], [-44, y + 1.5], [-45.5, y + 3], [-47, y + 1.5]]); poly(c, [[45.5, y], [47, y + 1.5], [45.5, y + 3], [44, y + 1.5]]); }
    c.fillStyle = ochre; c.fillRect(-42, -40, 84, 26);
    c.fillStyle = field; c.fillRect(-41, -39, 82, 24);
    // central medallion
    c.fillStyle = ochre; poly(c, [[0, -38], [18, -27], [0, -16], [-18, -27]]);
    c.fillStyle = green; poly(c, [[0, -35], [13, -27], [0, -19], [-13, -27]]);
    c.fillStyle = black; poly(c, [[0, -32.5], [8.5, -27], [0, -21.5], [-8.5, -27]]);
    const rose = (x, y, r) => { c.fillStyle = red; circ(c, x, y, r); c.fillStyle = '#9e2620'; circ(c, x, y, r * 0.62); c.fillStyle = red; circ(c, x - r * 0.15, y - r * 0.15, r * 0.34); c.fillStyle = 'rgba(255,230,200,.5)'; circ(c, x - r * 0.4, y - r * 0.4, r * 0.18); };
    rose(0, -27, 4.2);
    // side roses with leaves
    for (const sx of [-27, 27]) {
      c.fillStyle = green; c.save(); c.translate(sx - 5, -24); c.rotate(-0.6); ell(c, 0, 0, 4.5, 1.8); c.restore(); c.save(); c.translate(sx + 5, -24); c.rotate(0.6); ell(c, 0, 0, 4.5, 1.8); c.restore();
      c.strokeStyle = green; c.lineWidth = 0.9; c.beginPath(); c.moveTo(sx, -22); c.lineTo(sx, -17); c.stroke();
      rose(sx, -29, 4);
      c.fillStyle = ochre; circ(c, sx - 8, -34, 1.1); circ(c, sx + 8, -34, 1.1); circ(c, sx - 8, -19, 1.1); circ(c, sx + 8, -19, 1.1);
    }
    // eight-pointed stars near the ends
    for (const sx of [-37, 37]) { c.fillStyle = cream; poly(c, [[sx, -32], [sx + 1.3, -28.3], [sx + 4, -27], [sx + 1.3, -25.7], [sx, -22], [sx - 1.3, -25.7], [sx - 4, -27], [sx - 1.3, -28.3]]); }
  },
  stove(c) {
    c.fillStyle = '#fffdf5'; rr(c, -12, -100, 24, 20, 3); rr(c, -38, -84, 76, 84, 6);
    c.fillStyle = '#e9dfc8'; c.fillRect(-42, -48, 84, 6);
    c.fillStyle = '#3b2f2a'; c.beginPath(); c.arc(0, -14, 18, Math.PI, 0); c.rect(-18, -14, 36, 14); c.fill();
    c.fillStyle = '#f08a2b'; circ(c, 0, -8, 8); c.fillStyle = '#f2c230'; circ(c, 0, -6, 4);
    for (const x of [-24, 0, 24]) { c.fillStyle = '#4a90d9'; circ(c, x, -66, 5); c.fillStyle = '#f2c230'; circ(c, x, -66, 2); }
  },
  rushnyk(c) {
    c.fillStyle = '#8a5a2b'; c.fillRect(-32, -94, 64, 4);
    c.fillStyle = '#fffdf5'; rr(c, -26, -92, 52, 12, 4); rr(c, -26, -90, 20, 82, 2); rr(c, 6, -90, 20, 82, 2);
    for (const x of [-26, 6]) {
      c.fillStyle = '#e2574c'; c.fillRect(x, -30, 20, 4); c.fillRect(x, -14, 20, 3);
      c.fillStyle = '#2d2d2d'; c.fillRect(x, -24, 20, 2);
      c.fillStyle = '#e2574c'; poly(c, [[x + 10, -50], [x + 16, -42], [x + 10, -34], [x + 4, -42]]);
    }
  },
  // A traditional Ukrainian bed: carved wooden frame (headboard on the right), a white bedspread with a red
  // embroidered border and lace edge, and the customary pyramid of pillows at the head.
  ukbed(c) {
    const wood = '#8a5a2b', dark = '#6b4422', linen = '#fffdf5', red = '#d43a3a';
    c.fillStyle = dark; c.fillRect(-47, -10, 5, 10); c.fillRect(40, -10, 5, 10);
    c.fillStyle = wood; rr(c, 39, -74, 10, 74, 3);
    c.beginPath(); c.arc(44, -74, 7, Math.PI, 0); c.fill();
    c.fillStyle = '#f2c230'; circ(c, 44, -76, 2.2);
    c.fillStyle = wood; rr(c, -50, -40, 7, 40, 3); c.beginPath(); c.arc(-46.5, -40, 4.5, Math.PI, 0); c.fill();
    c.fillStyle = wood; c.fillRect(-46, -16, 88, 6);
    // bedspread hanging over the side, embroidered band and lace
    c.fillStyle = linen; rr(c, -45, -38, 86, 26, 3);
    c.fillStyle = red; c.fillRect(-45, -20, 86, 4);
    c.fillStyle = '#2d2d2d'; for (let x = -41; x < 40; x += 8) c.fillRect(x, -16, 3, 1.2);
    c.fillStyle = red; for (let x = -39; x < 40; x += 10) poly(c, [[x, -27], [x + 3, -24], [x, -21], [x - 3, -24]]);
    c.fillStyle = linen; for (let x = -43; x < 41; x += 4) circ(c, x, -12, 2);
    // the pillow pyramid
    const pillow = (x0, x1, y0, y1) => {
      c.fillStyle = linen; rr(c, x0, y0, x1 - x0, y1 - y0, 3);
      c.fillStyle = 'rgba(212,58,58,.85)'; c.fillRect(x0 + 2, y1 - 3.5, x1 - x0 - 4, 1.6);
      c.strokeStyle = '#e8dcc6'; c.lineWidth = 0.8; c.strokeRect(x0 + 0.5, y0 + 0.5, x1 - x0 - 1, y1 - y0 - 1);
    };
    pillow(10, 38, -52, -37); pillow(14, 36, -63, -51); pillow(18, 34, -72, -62);
    c.fillStyle = linen; for (let x = 19; x < 34; x += 3) circ(c, x, -72.5, 1.4);
  },
  // A built-in wooden bookshelf: open cabinet with three shelves, a carved crest, and Petrykivka-style
  // painted flowers (the traditional Ukrainian decorative painting) on the crest and sides.
  shelf(c) {
    const wood = '#9a6634', dark = '#6b4422', inside = '#7a4e28';
    c.fillStyle = dark; c.fillRect(-30, -6, 60, 6);
    c.fillStyle = inside; c.fillRect(-26, -96, 52, 90);
    c.fillStyle = wood; c.fillRect(-30, -98, 5, 98); c.fillRect(25, -98, 5, 98);
    for (const y of [-6, -36, -66]) { c.fillStyle = wood; c.fillRect(-26, y - 3, 52, 4); c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(-26, y - 31, 52, 3); }
    c.fillStyle = wood; c.fillRect(-32, -100, 64, 5);
    c.beginPath(); c.moveTo(-28, -100); c.quadraticCurveTo(-14, -112, 0, -113); c.quadraticCurveTo(14, -112, 28, -100); c.closePath(); c.fill();
    const flower = (x, y, r) => { c.fillStyle = '#d43a3a'; for (let i = 0; i < 5; i++) { const a = i * 1.2566; ell(c, x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.7, r * 0.7); } c.fillStyle = '#f2c230'; circ(c, x, y, r * 0.55); };
    c.strokeStyle = '#4f8a2a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-14, -104); c.quadraticCurveTo(0, -101, 14, -104); c.stroke();
    flower(0, -105, 2.6); flower(-11, -103.5, 1.7); flower(11, -103.5, 1.7);
    for (const x of [-27.5, 27.5]) { flower(x, -82, 1.4); flower(x, -52, 1.4); flower(x, -22, 1.4); }
  },
  // Books standing upright, spines out, one leaning.
  books(c) {
    const cols = ['#c0392b', '#2c5fa8', '#3f8a3a', '#d98a1a', '#7a3b8a'];
    const hs = [46, 52, 42, 50, 44];
    let x = -30;
    hs.forEach((hgt, i) => { const wdt = i === 2 ? 13 : 10; c.fillStyle = cols[i]; c.fillRect(x, -hgt, wdt, hgt); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(x + 2, -hgt + 6, wdt - 4, 2); c.fillRect(x + 2, -10, wdt - 4, 2); c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(x + wdt - 2, -hgt, 2, hgt); x += wdt + 1; });
    c.save(); c.translate(x + 2, 0); c.rotate(0.32); c.fillStyle = '#b5522a'; c.fillRect(0, -46, 10, 46); c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(2, -40, 6, 2); c.restore();
  },
  // A beetroot: deep red root with leafy tops.
  beet(c) {
    c.strokeStyle = '#a3203e'; c.lineWidth = 2.4; c.lineCap = 'round';
    for (const [a, l] of [[-0.5, 30], [0, 36], [0.5, 30]]) { c.beginPath(); c.moveTo(0, -48); c.lineTo(Math.sin(a) * l, -48 - Math.cos(a) * l); c.stroke(); }
    c.fillStyle = '#4fae55'; for (const [a, l] of [[-0.5, 30], [0, 36], [0.5, 30]]) { c.save(); c.translate(Math.sin(a) * l, -48 - Math.cos(a) * l); c.rotate(a); ell(c, 0, -6, 7, 13); c.restore(); }
    c.fillStyle = '#8e1b3f'; c.beginPath(); c.moveTo(0, -4); c.bezierCurveTo(-28, -18, -26, -54, 0, -54); c.bezierCurveTo(26, -54, 28, -18, 0, -4); c.fill();
    c.strokeStyle = '#8e1b3f'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -5); c.quadraticCurveTo(3, 2, -2, 4); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.2)'; ell(c, -8, -38, 5, 9);
  },
  // A sack of flour, tied at the top, with a little spill.
  flour(c) {
    c.fillStyle = '#fffaf0'; ell(c, 24, -4, 14, 5);
    c.fillStyle = '#e9dcc0'; c.beginPath(); c.moveTo(-24, 0); c.quadraticCurveTo(-30, -40, -14, -58); c.lineTo(14, -58); c.quadraticCurveTo(30, -40, 24, 0); c.closePath(); c.fill();
    c.fillStyle = '#d8c7a2'; c.beginPath(); c.moveTo(-14, -58); c.lineTo(-18, -70); c.lineTo(-4, -62); c.lineTo(4, -72); c.lineTo(10, -62); c.lineTo(18, -70); c.lineTo(14, -58); c.closePath(); c.fill();
    c.fillStyle = '#8a5a2b'; c.fillRect(-15, -60, 30, 4);
    c.fillStyle = '#4a90d9'; c.fillRect(-25, -30, 50, 5); c.fillStyle = '#d43a3a'; c.fillRect(-25, -24, 50, 2);
  },
  // A bowl of борщ with sour cream and dill, and two пампушки (garlic buns) beside it.
  borshch(c) {
    c.fillStyle = '#ffffff'; ell(c, -8, -4, 44, 8);
    c.fillStyle = '#fffdf5'; c.beginPath(); c.moveTo(-44, -30); c.quadraticCurveTo(-40, 0, -8, -2); c.quadraticCurveTo(24, 0, 28, -30); c.closePath(); c.fill();
    c.fillStyle = '#2c5fa8'; c.beginPath(); c.moveTo(-42, -22); c.quadraticCurveTo(-8, -10, 26, -22); c.lineTo(25, -17); c.quadraticCurveTo(-8, -5, -41, -17); c.closePath(); c.fill();
    c.fillStyle = '#fffdf5'; for (let x = -34; x < 22; x += 9) poly(c, [[x, -19], [x + 2.5, -16.5], [x, -14], [x - 2.5, -16.5]]);
    c.fillStyle = '#a3222e'; ell(c, -8, -30, 36, 8);
    c.fillStyle = '#c2343f'; ell(c, -14, -31, 18, 4);
    c.fillStyle = '#fffaf0'; ell(c, -4, -32, 8, 4); c.fillStyle = '#ffffff'; circ(c, -6, -33, 2.5);
    c.strokeStyle = '#4f8a2a'; c.lineWidth = 1.4; for (const [x, y] of [[-20, -30], [8, -29], [-12, -27]]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 4, y - 3); c.moveTo(x + 2, y - 1.5); c.lineTo(x + 3, y + 1); c.stroke(); }
    for (const [x, y] of [[36, -10], [44, -20]]) { c.fillStyle = '#d9963a'; circ(c, x, y, 9); c.fillStyle = '#efb758'; circ(c, x - 2, y - 2, 5); c.fillStyle = '#5fae4a'; circ(c, x + 3, y - 4, 1.2); circ(c, x - 3, y - 6, 1); }
  },
  // A plate of вареники with a spoon of sour cream and fried onion.
  varenyky(c) {
    c.fillStyle = '#ffffff'; ell(c, 0, -14, 46, 14);
    c.strokeStyle = '#2c5fa8'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, -14, 42, 12, 0, 0, 7); c.stroke();
    const dumpling = (x, y, a) => {
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = '#f7e3b5'; c.beginPath(); c.arc(0, 0, 11, Math.PI, 0); c.closePath(); c.fill();
      c.strokeStyle = '#e2c78c'; c.lineWidth = 1.4; c.beginPath(); for (let i = 0; i <= 8; i++) { const t = Math.PI + i * Math.PI / 8; c.lineTo(Math.cos(t) * 11.5, Math.sin(t) * 11.5 + (i % 2 ? 1 : 0)); } c.stroke();
      c.restore();
    };
    dumpling(-20, -14, -0.2); dumpling(-2, -20, 0.1); dumpling(16, -13, 0.25); dumpling(-10, -6, 0); dumpling(10, -4, -0.1);
    c.fillStyle = '#fffaf0'; ell(c, 26, -20, 7, 4);
    c.fillStyle = '#b06a1e'; for (const [x, y] of [[-4, -12], [2, -10], [-14, -9], [6, -16], [-8, -18]]) circ(c, x, y, 1.6);
    c.strokeStyle = '#4f8a2a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(18, -8); c.lineTo(22, -11); c.stroke();
  },
  // A fishing rod: a bamboo pole with a reel, line and a red-and-white float.
  rod(c) {
    c.strokeStyle = '#c8a46a'; c.lineWidth = 3.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-34, -6); c.lineTo(30, -92); c.stroke();
    c.strokeStyle = '#a8864f'; c.lineWidth = 1; for (const f of [0.25, 0.5, 0.75]) { const x = -34 + 64 * f, y = -6 - 86 * f; c.beginPath(); c.moveTo(x - 2.5, y - 1); c.lineTo(x + 2.5, y + 1); c.stroke(); }
    c.fillStyle = '#5b6470'; circ(c, -24, -20, 5); c.fillStyle = '#9aa3ad'; circ(c, -24, -20, 2.5);
    c.strokeStyle = 'rgba(80,80,80,.8)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(30, -92); c.quadraticCurveTo(38, -50, 36, -24); c.stroke();
    c.fillStyle = '#e2392f'; circ(c, 36, -22, 4); c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(36, -22, 4, 0, Math.PI); c.fill();
  },
  // A whole frog, side-on and facing right: folded back legs, speckled back, pale belly, bulging eyes.
  // With o.hop the legs stretch out behind, mid-jump.
  frog(c, o) {
    const g = '#5fae4a', dark = '#3f8a3a', belly = '#cfe9a5', hop = o && o.hop;
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.save(); if (hop) { c.translate(0, -6); c.rotate(-0.28); }
    if (hop) {
      c.strokeStyle = dark; c.lineWidth = 7; c.beginPath(); c.moveTo(-12, -16); c.lineTo(-30, -10); c.lineTo(-46, -4); c.stroke();
      c.fillStyle = dark; ell(c, -48, -3, 6, 2.5);
    } else {
      c.fillStyle = dark; ell(c, -12, -12, 15, 10);
      c.fillStyle = g; ell(c, -13, -13, 12, 8);
      c.fillStyle = dark; c.beginPath(); c.moveTo(-22, -3); c.lineTo(2, -4); c.lineTo(4, 0); c.lineTo(-22, 0); c.closePath(); c.fill();
    }
    c.fillStyle = g; c.save(); c.translate(0, -20); c.rotate(-0.22); ell(c, 0, 0, 23, 14); c.restore();
    c.fillStyle = belly; c.save(); c.translate(7, -13); c.rotate(-0.22); ell(c, 0, 0, 14, 6.5); c.restore();
    c.fillStyle = dark; for (const [x, y, r] of [[-8, -28, 2.6], [-1, -31, 2], [-14, -22, 2.2], [3, -24, 1.6]]) circ(c, x, y, r);
    // front leg
    c.strokeStyle = g; c.lineWidth = 5; c.beginPath(); c.moveTo(13, -14); c.lineTo(17, hop ? -6 : -2); c.stroke();
    c.fillStyle = dark; ell(c, 19, hop ? -5 : -1, 4.5, 2);
    // head
    c.fillStyle = g; circ(c, 17, -28, 11);
    c.fillStyle = g; circ(c, 15, -38, 7); c.fillStyle = '#fffdf5'; circ(c, 15.5, -38.5, 5); c.fillStyle = '#1d191c'; circ(c, 17, -38.5, 2.6); c.fillStyle = '#ffffff'; circ(c, 17.8, -39.5, 0.9);
    c.strokeStyle = dark; c.lineWidth = 1.4; c.beginPath(); c.moveTo(14, -23); c.quadraticCurveTo(21, -20, 27, -25); c.stroke();
    c.fillStyle = 'rgba(240,120,120,.4)'; circ(c, 21, -27, 2.4);
    c.fillStyle = dark; circ(c, 26.5, -31, 0.9);
    c.restore();
  },
  // An Easter egg painted with wax and dye: bands, a star, zigzags. Two small ones in front.
  pysanka(c) {
    const egg = (x, y, rx, ry, base, band, acc) => {
      c.save(); c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, 7); c.clip();
      c.fillStyle = base; c.fillRect(x - rx, y - ry, rx * 2, ry * 2);
      c.fillStyle = band; c.fillRect(x - rx, y - ry * 0.18, rx * 2, ry * 0.36);
      c.fillStyle = '#2d2d2d'; for (let i = -3; i <= 3; i++) poly(c, [[x + i * rx * 0.3 - rx * 0.12, y - ry * 0.18], [x + i * rx * 0.3, y - ry * 0.04], [x + i * rx * 0.3 + rx * 0.12, y - ry * 0.18]]);
      c.fillStyle = acc; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; c.save(); c.translate(x, y - ry * 0.62); c.rotate(a); ell(c, 0, -ry * 0.2, rx * 0.1, ry * 0.2); c.restore(); }
      c.fillStyle = band; circ(c, x, y - ry * 0.62, rx * 0.12);
      for (let k = -2; k <= 2; k++) { c.fillStyle = acc; poly(c, [[x + k * rx * 0.36, y + ry * 0.9], [x + k * rx * 0.36 - rx * 0.15, y + ry * 0.5], [x + k * rx * 0.36 + rx * 0.15, y + ry * 0.5]]); }
      c.fillStyle = 'rgba(255,255,255,.35)'; ell(c, x - rx * 0.4, y - ry * 0.4, rx * 0.14, ry * 0.3);
      c.restore();
    };
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -2, 44, 6);
    egg(0, -42, 24, 32, '#c92a22', '#ffd23f', '#ffffff');
    egg(-30, -20, 14, 19, '#2f6fb5', '#ffffff', '#ffd23f');
    egg(30, -19, 14, 18, '#ffd23f', '#c92a22', '#2f6fb5');
  },
  // Kalyna: a bush hung with clusters of red berries.
  kalyna(c, o) {
    c.save(); c.rotate(((o && o.sway) || 0) * 0.6);
    c.fillStyle = '#2f8440'; circ(c, -20, -22, 22); circ(c, 20, -24, 24); circ(c, 0, -42, 26);
    c.fillStyle = '#4aa352'; circ(c, -20, -25, 20); circ(c, 20, -27, 22); circ(c, 0, -46, 24);
    c.fillStyle = '#6cc070'; circ(c, -6, -56, 10); circ(c, 24, -34, 8);
    for (const [x, y] of [[-24, -22], [-6, -34], [14, -22], [28, -36], [4, -56], [-14, -52]]) {
      c.strokeStyle = '#3d8a45'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x, y - 10); c.lineTo(x, y); c.stroke();
      for (const [dx, dy] of [[-4, 0], [4, 0], [0, 4], [-2, -4], [3, -4], [-5, 4], [5, 4]]) { c.fillStyle = '#c4202e'; circ(c, x + dx, y + dy, 3.6); c.fillStyle = '#ec4b58'; circ(c, x + dx - 0.8, y + dy - 0.9, 1.5); }
    }
    c.restore();
  },
  // A bandura: a round wooden body, a long neck, a fan of strings and a ribbon in blue and yellow.
  bandura(c) {
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -2, 38, 5);
    c.fillStyle = '#7a3f1d'; ell(c, 0, -30, 34, 28);
    c.fillStyle = '#a05a2b'; ell(c, -2, -33, 30, 24);
    c.fillStyle = '#c8803f'; ell(c, -8, -40, 14, 8);
    c.fillStyle = '#4a2410'; ell(c, 4, -28, 11, 9); c.fillStyle = '#2b1408'; ell(c, 4, -28, 8, 6);
    c.fillStyle = '#8a4b22'; poly(c, [[-8, -50], [6, -52], [36, -88], [24, -94]]);
    c.fillStyle = '#6a3518'; circ(c, 30, -92, 6);
    c.strokeStyle = '#f0e6c8'; c.lineWidth = 1.1;
    for (let i = 0; i < 7; i++) { c.beginPath(); c.moveTo(-14 + i * 4, -55 + i * 0.6); c.lineTo(4 + i * 4.6, -26 + i * 0.4); c.stroke(); }
    c.fillStyle = '#2f6fb5'; poly(c, [[26, -88], [32, -86], [36, -64], [30, -66]]);
    c.fillStyle = '#ffd23f'; poly(c, [[32, -86], [37, -84], [42, -62], [36, -64]]);
  },
  // Korovai: a round festive loaf with a plaited rim, dough flowers, and two little birds.
  korovai(c) {
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -2, 48, 6);
    c.fillStyle = '#fffdf5'; rr(c, -48, -10, 96, 9, 3); c.fillStyle = '#d43a3a'; c.fillRect(-48, -7, 96, 2.5);
    c.fillStyle = '#a8631f'; ell(c, 0, -26, 44, 21);
    c.fillStyle = '#d99a3a'; ell(c, 0, -30, 42, 18);
    c.fillStyle = '#e8b957'; ell(c, 0, -33, 34, 13);
    c.fillStyle = '#c47f2a'; for (let k = 0; k < 20; k++) { const a = k / 20 * 6.283; ell(c, Math.cos(a) * 41, -28 + Math.sin(a) * 17, 4, 3); }
    for (const [x, y] of [[-14, -36], [14, -36], [0, -28]]) { c.fillStyle = '#f2d98d'; for (let k = 0; k < 6; k++) circ(c, x + Math.cos(k * 1.05) * 5, y + Math.sin(k * 1.05) * 3, 2.8); c.fillStyle = '#b8701e'; circ(c, x, y, 2.4); }
    for (const sx of [-1, 1]) { c.fillStyle = '#f2d98d'; ell(c, sx * 27, -36, 6, 4); circ(c, sx * 32, -40, 3.2); poly(c, [[sx * 21, -37], [sx * 16, -43], [sx * 18, -35]]); c.fillStyle = '#2d2d2d'; circ(c, sx * 33, -40.5, 0.8); }
  },
  // A didukh: a sheaf of wheat tied with ribbons, ears at the top.
  didukh(c, o) {
    c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, 0, -2, 22, 5);
    const sw = ((o && o.sway) || 0) * 30;
    for (let i = -6; i <= 6; i++) {
      const x = i * 3.6, tx = i * 4.3 + sw * 0.4, h = 82 + (i % 3) * 5;
      c.strokeStyle = i % 2 ? '#d9a93f' : '#c8922b'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(x * 0.5, 0); c.quadraticCurveTo(x * 0.9, -h * 0.5, tx, -h); c.stroke();
      c.fillStyle = '#e6bc4e'; c.save(); c.translate(tx, -h - 1); c.rotate(tx * 0.015); ell(c, 0, -4, 3.4, 9); c.restore();
    }
    c.fillStyle = '#d43a3a'; poly(c, [[-18, -38], [18, -38], [20, -31], [-20, -31]]);
    c.fillStyle = '#2d2d2d'; c.fillRect(-18, -35.5, 36, 1.4);
    c.fillStyle = '#2f6fb5'; poly(c, [[-12, -14], [12, -14], [13, -9], [-13, -9]]);
    c.fillStyle = '#d43a3a'; poly(c, [[14, -34], [22, -18], [18, -17], [12, -31]]);
  },
  // Hollyhock: a tall stalk with big round blooms.
  malva(c, o) {
    c.save(); c.rotate(((o && o.sway) || 0) * 0.8);
    c.strokeStyle = '#4aa352'; c.lineWidth = 4.5; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-3, -50, 0, -94); c.stroke();
    c.fillStyle = '#3d8a45'; for (const [x, y, r] of [[-10, -12, 9], [10, -22, 9], [-9, -32, 7]]) ell(c, x, y, r, r * 0.6);
    const cols = ['#ff8fb3', '#e2574c', '#ffb3c7', '#ff6f91', '#ffc2d6'];
    for (let i = 0; i < 6; i++) {
      const y = -34 - i * 10, x = (i % 2 ? 7 : -7) * (1 - i / 9), r = 10 - i * 0.9;
      c.fillStyle = cols[i % 5]; for (let k = 0; k < 5; k++) circ(c, x + Math.cos(k * 1.257) * r * 0.55, y + Math.sin(k * 1.257) * r * 0.55, r * 0.5);
      c.fillStyle = '#ffd23f'; circ(c, x, y, r * 0.28);
    }
    c.fillStyle = cols[0]; circ(c, 0, -96, 4);
    c.restore();
  },
  // A vyshyvanka: a white shirt with red and black cross-stitch at the collar, chest, shoulders and cuffs.
  vyshyvanka(c) {
    c.fillStyle = '#fffdf5'; poly(c, [[-26, -90], [-62, -64], [-52, -36], [-30, -52], [-30, -8], [30, -8], [30, -52], [52, -36], [62, -64], [26, -90], [10, -90], [0, -78], [-10, -90]]);
    c.fillStyle = '#ece3cf'; poly(c, [[-10, -90], [0, -78], [10, -90], [6, -92], [-6, -92]]);
    c.fillStyle = '#d43a3a';
    poly(c, [[-26, -90], [-62, -64], [-58, -58], [-22, -82]]); poly(c, [[26, -90], [62, -64], [58, -58], [22, -82]]);   // shoulder panels
    poly(c, [[-62, -64], [-52, -36], [-46, -40], [-56, -66]]); poly(c, [[62, -64], [52, -36], [46, -40], [56, -66]]);  // cuffs
    c.fillRect(-30, -14, 60, 6);   // hem
    c.fillRect(-3, -78, 6, 46);    // placket
    c.fillStyle = '#2d2d2d'; for (let i = 0; i < 6; i++) poly(c, [[0, -76 + i * 8], [4, -72 + i * 8], [0, -68 + i * 8], [-4, -72 + i * 8]]);
    for (let i = 0; i < 7; i++) c.fillRect(-27 + i * 9, -12, 5, 2);
    c.fillStyle = '#ffffff'; for (let i = 0; i < 5; i++) c.fillRect(-52 + i * 5.2, -64 + i * 5.4, 2, 2);
  },
  // A wreath of flowers with ribbons trailing from it.
  vinok(c) {
    c.fillStyle = 'rgba(0,0,0,.1)'; ell(c, 0, -2, 30, 4);
    for (const [x, col] of [[-12, '#d43a3a'], [0, '#ffd23f'], [12, '#2f6fb5']]) { c.fillStyle = col; poly(c, [[x - 3, -22], [x + 3, -22], [x + 6 + x * 0.1, -2], [x + 1, -5], [x - 4, -2]]); }
    c.fillStyle = '#3d8a45'; for (let i = 0; i < 16; i++) { const a = i / 16 * 6.283; ell(c, Math.cos(a) * 33, -52 + Math.sin(a) * 31, 8, 4.5); }
    const cols = ['#ff8fb3', '#ffffff', '#ffd23f', '#e2574c', '#b98cf0', '#5aa9e6'];
    for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283 + 0.2, x = Math.cos(a) * 33, y = -52 + Math.sin(a) * 31; c.fillStyle = cols[i % 6]; for (let k = 0; k < 5; k++) circ(c, x + Math.cos(k * 1.257) * 4.2, y + Math.sin(k * 1.257) * 4.2, 3.4); c.fillStyle = '#ffd23f'; circ(c, x, y, 2.2); }
  },
  // Poppies on slim stalks.
  mak(c, o) {
    c.save(); c.rotate(((o && o.sway) || 0) * 1.2);
    for (const [x, h, r] of [[-18, 52, 12], [4, 78, 15], [24, 60, 12]]) {
      c.strokeStyle = '#4aa352'; c.lineWidth = 3; c.beginPath(); c.moveTo(x * 0.4, 0); c.quadraticCurveTo(x * 0.7, -h * 0.5, x, -h); c.stroke();
      c.fillStyle = '#e2392f'; for (let k = 0; k < 4; k++) { const a = k * 1.571 + 0.4; circ(c, x + Math.cos(a) * r * 0.5, -h + Math.sin(a) * r * 0.5, r * 0.6); }
      c.fillStyle = '#ff6a5c'; circ(c, x - 2, -h - 2, r * 0.35); c.fillStyle = '#2d2d2d'; circ(c, x, -h, r * 0.22);
    }
    c.fillStyle = '#3d8a45'; ell(c, -8, -14, 10, 4); ell(c, 12, -22, 10, 4);
    c.restore();
  },
  // A tuft of wheat: golden ears on bending stalks.
  pshenytsia(c, o) {
    const sw = ((o && o.sway) || 0) * 40;
    for (let i = -4; i <= 4; i++) {
      const x = i * 8, tx = x + sw * (0.6 + (i & 1) * 0.3) + i * 1.5, h = 70 + ((i * 7) % 4) * 6;
      c.strokeStyle = '#c9a23f'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, 0); c.quadraticCurveTo(x, -h * 0.55, tx, -h); c.stroke();
      c.save(); c.translate(tx, -h); c.rotate((tx - x) * 0.012);
      for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? '#e8bf4f' : '#d9a93f'; ell(c, (k % 2 ? 2.6 : -2.6), -k * 5.2 - 4, 2.8, 4.6); }
      c.restore();
    }
  },
  // A painted plate: Petrykivka-style red and pink flower, leaves and berries on white.
  tarilka(c) {
    c.fillStyle = '#2f6fb5'; circ(c, 0, -50, 44); c.fillStyle = '#fffdf5'; circ(c, 0, -50, 39);
    c.fillStyle = '#2f6fb5'; for (let i = 0; i < 24; i++) { const a = i / 24 * 6.283; circ(c, Math.cos(a) * 34, -50 + Math.sin(a) * 34, 1.8); }
    c.fillStyle = '#3d8a45'; for (const a of [0.3, 2.0, 3.6, 5.3]) { c.save(); c.translate(0, -50); c.rotate(a); ell(c, 21, 0, 13, 5); c.restore(); }
    c.fillStyle = '#d43a3a'; for (let k = 0; k < 6; k++) { const a = k * 1.047; circ(c, Math.cos(a) * 9, -50 + Math.sin(a) * 9, 8); }
    c.fillStyle = '#ff8fb3'; circ(c, 0, -50, 8); c.fillStyle = '#ffd23f'; circ(c, 0, -50, 3.6);
    c.fillStyle = '#2d2d2d'; for (const [x, y] of [[-24, -66], [22, -30], [-14, -26], [26, -64]]) circ(c, x, y, 2.6);
  },
  // Paska: a tall round Easter loaf with white icing and a dough cross.
  paska(c) {
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -2, 34, 5);
    c.fillStyle = '#b8701e'; rr(c, -27, -52, 54, 48, 6);
    c.fillStyle = '#d99a3a'; rr(c, -25, -52, 50, 46, 6);
    c.fillStyle = '#e8b957'; rr(c, -21, -50, 12, 42, 5);
    c.fillStyle = '#c47f2a'; c.fillRect(-25, -22, 50, 3); c.fillRect(-25, -34, 50, 2);
    c.fillStyle = '#d99a3a'; ell(c, 0, -54, 27, 14); c.fillStyle = '#fffdf5'; ell(c, 0, -57, 25, 11);
    c.fillStyle = '#fffdf5'; for (const x of [-18, -6, 8, 20]) rr(c, x - 3, -57, 6, 11 + (x % 7), 3);
    c.fillStyle = '#c47f2a'; c.fillRect(-1.5, -66, 3, 12); c.fillRect(-7, -61, 14, 3);
  },
  // A motanka: the faceless rag doll, a cross of thread on her face, a scarf, a red skirt and an apron.
  motanka(c) {
    c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, 0, -2, 22, 4);
    c.fillStyle = '#d43a3a'; poly(c, [[-14, -52], [14, -52], [24, -6], [-24, -6]]);
    c.fillStyle = '#fffdf5'; poly(c, [[-9, -50], [9, -50], [14, -10], [-14, -10]]);
    c.fillStyle = '#2f6fb5'; c.fillRect(-14, -34, 28, 3); c.fillStyle = '#d43a3a'; c.fillRect(-9, -22, 18, 2.5);
    c.fillStyle = '#f3e2c0'; rr(c, -30, -50, 16, 7, 3.5); rr(c, 14, -50, 16, 7, 3.5);
    c.fillStyle = '#f3e2c0'; circ(c, 0, -66, 13);
    c.fillStyle = '#2f6fb5'; c.beginPath(); c.arc(0, -68, 14.5, Math.PI, 0); c.fill(); poly(c, [[-14, -68], [-12, -54], [-7, -62]]); poly(c, [[14, -68], [12, -54], [7, -62]]);
    c.fillStyle = '#ffd23f'; for (let i = -2; i <= 2; i++) circ(c, i * 5, -80 + Math.abs(i) * 1.5, 1.3);
    c.strokeStyle = '#d43a3a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-4, -69); c.lineTo(4, -61); c.moveTo(4, -69); c.lineTo(-4, -61); c.stroke();
    c.fillStyle = '#d43a3a'; c.fillRect(-8, -53, 16, 3);
  },
  // Deruny: a plate with a stack of golden potato pancakes, a spoon of sour cream and dill.
  deruny(c) {
    c.fillStyle = '#ffffff'; ell(c, 0, -12, 46, 13); c.strokeStyle = '#2c5fa8'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, -12, 42, 11, 0, 0, 7); c.stroke();
    for (const [x, y, r] of [[-8, -12, 24], [10, -16, 23], [-2, -22, 22]]) {
      c.fillStyle = '#a86a1c'; ell(c, x, y + 2, r, r * 0.34); c.fillStyle = '#d9993a'; ell(c, x, y, r, r * 0.32); c.fillStyle = '#ecb85a'; ell(c, x - 2, y - 1.5, r * 0.8, r * 0.2);
    }
    c.fillStyle = '#7a4a14'; for (const [x, y] of [[-12, -23], [2, -26], [10, -20], [-4, -18]]) circ(c, x, y, 1.2);
    c.fillStyle = '#fffdf5'; ell(c, 0, -31, 9, 4.5); c.fillStyle = '#e9e2cf'; ell(c, 2, -30, 5, 2);
    c.strokeStyle = '#4f9a3a'; c.lineWidth = 1.4; for (const a of [-0.8, -0.2, 0.5]) { c.beginPath(); c.moveTo(0, -33); c.lineTo(Math.sin(a) * 9, -41); c.stroke(); }
  },
  // Holubtsi: three cabbage rolls in tomato sauce.
  holubtsi(c) {
    c.fillStyle = '#ffffff'; ell(c, 0, -12, 46, 13); c.strokeStyle = '#2c5fa8'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, -12, 42, 11, 0, 0, 7); c.stroke();
    c.fillStyle = '#c93a22'; ell(c, 0, -13, 34, 8);
    for (const [x, y, a] of [[-18, -14, -0.12], [2, -10, 0.05], [20, -15, 0.15]]) {
      c.save(); c.translate(x, y); c.rotate(a);
      c.fillStyle = '#6fa04a'; rr(c, -15, -13, 30, 19, 9); c.fillStyle = '#8cc060'; rr(c, -13, -12, 26, 9, 5);
      c.strokeStyle = '#4d7f31'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-10, -2); c.lineTo(10, -2); c.moveTo(-11, -7); c.lineTo(11, -7); c.stroke();
      c.fillStyle = '#e8d9a8'; ell(c, 15, -3, 3, 7); c.restore();
    }
    c.fillStyle = '#4f9a3a'; for (const x of [-4, 3, 9]) ell(c, x, -22, 3, 1.6);
  },
  // Syrnyky: little golden cheese pancakes with powdered sugar and a spoon of jam.
  syrnyky(c) {
    c.fillStyle = '#ffffff'; ell(c, 0, -12, 46, 13); c.strokeStyle = '#2c5fa8'; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, -12, 42, 11, 0, 0, 7); c.stroke();
    for (const [x, y] of [[-20, -12], [0, -9], [20, -13], [-8, -19], [10, -20]]) {
      c.fillStyle = '#b87a24'; ell(c, x, y + 2, 14, 6); c.fillStyle = '#e0a850'; ell(c, x, y, 14, 5.5);
      c.fillStyle = 'rgba(255,255,255,.75)'; ell(c, x - 1, y - 1, 9, 2.6);
    }
    c.fillStyle = '#9b1f3a'; ell(c, 0, -25, 8, 4); c.fillStyle = '#c93058'; ell(c, -1, -26, 5, 2.4);
    c.fillStyle = '#fffdf5'; for (const [x, y] of [[-22, -20], [24, -22], [-2, -29]]) circ(c, x, y, 0.9);
  },
  // Marigolds: a low green clump thick with orange and gold blooms.
  chornobryvtsi(c, o) {
    c.save(); c.rotate(((o && o.sway) || 0) * 0.8);
    c.fillStyle = 'rgba(0,0,0,.1)'; ell(c, 0, -2, 34, 4);
    c.fillStyle = '#3d8a45'; ell(c, 0, -16, 34, 16); c.fillStyle = '#4fa257'; ell(c, -6, -20, 24, 11);
    for (const [x, y, r] of [[-22, -30, 9], [-4, -40, 10.5], [16, -32, 9.5], [-12, -19, 8], [8, -17, 8.5], [28, -18, 7.5]]) {
      c.fillStyle = '#e8850f'; for (let k = 0; k < 8; k++) { const a = k * 0.785; circ(c, x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.46); }
      c.fillStyle = '#ffb81f'; circ(c, x, y, r * 0.66); c.fillStyle = '#a3360c'; circ(c, x, y, r * 0.3);
    }
    c.restore();
  },
  // A tyn: a fence woven from willow rods between stakes, with clay jugs drying upside down on top.
  tyn(c) {
    c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, 0, -1, 50, 4);
    c.fillStyle = '#7a4e26'; for (const x of [-42, -21, 0, 21, 42]) rr(c, x - 3, -64, 6, 64, 3);
    c.lineCap = 'round';
    for (let r = 0; r < 6; r++) {
      const y = -10 - r * 7.6; c.strokeStyle = r % 2 ? '#c99a5a' : '#b08040'; c.lineWidth = 5.6; c.beginPath(); c.moveTo(-49, y);
      for (let i = 0; i < 4; i++) { const x0 = -42 + i * 21; c.quadraticCurveTo(x0 + 10.5, y + ((i + r) % 2 ? 4.5 : -4.5), x0 + 21, y); }
      c.lineTo(49, y); c.stroke();
    }
    for (const [x, k] of [[-21, 1], [21, 0.82]]) {
      c.save(); c.translate(x, -62); c.scale(k, k);
      c.fillStyle = '#8f3f1c'; rr(c, -6.5, -4, 13, 4, 2); c.fillStyle = '#b5562b'; rr(c, -4.5, -10, 9, 8, 2); ell(c, 0, -19, 10.5, 11.5);
      c.fillStyle = '#f1dfa0'; c.fillRect(-9.6, -22, 19.2, 2.2); c.fillStyle = 'rgba(255,255,255,.25)'; ell(c, -4, -23, 2.6, 5);
      c.restore();
    }
  },
  // The blue and yellow flag on a pole, rippling.
  prapor(c, o) {
    const t = (o && o.t) || 0;
    if (!(o && o.noShadow)) { c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, 0, -1, 9, 3); }
    c.fillStyle = '#8a8f96'; rr(c, -1.8, -97, 3.6, 97, 1.8); c.fillStyle = '#ffd23f'; circ(c, 0, -97, 3.2);
    const wv = i => Math.sin(t * 3 - i * 0.75) * 2.4 * (i / 8);
    for (const [col, y0] of [['#2f6fb5', -93], ['#ffd23f', -79.5]]) {
      c.fillStyle = col; c.beginPath(); c.moveTo(1.8, y0);
      for (let i = 0; i <= 8; i++) c.lineTo(1.8 + i * 5.6, y0 + wv(i));
      for (let i = 8; i >= 0; i--) c.lineTo(1.8 + i * 5.6, y0 + 14 + wv(i));
      c.closePath(); c.fill();
    }
  },
  // The same flag on a short pole standing on top of the fountain's column (drawn at the fountain's spot; the
  // column's top is 97 units up at this scale).
  praportop(c, o) { c.save(); c.translate(0, -97); c.scale(0.8, 0.8); c.translate(0, 20); DRAW.prapor(c, Object.assign({}, o, { noShadow: true })); c.restore(); },
  // A burlap sack tied at the neck, and a wooden grain hopper.
  mishok(c) { sackArt(c, 0, -2, 70, 84, 0.8); },
  kivsh(c) { c.fillStyle = '#a06a35'; poly(c, [[-40, -86], [40, -86], [10, -30], [-10, -30]]); c.fillStyle = '#e0b84a'; poly(c, [[-34, -80], [34, -80], [14, -50], [-14, -50]]); c.fillStyle = '#f0cc66'; ell(c, 0, -80, 34, 5); c.strokeStyle = '#7a4e26'; c.lineWidth = 3; c.beginPath(); c.moveTo(-40, -86); c.lineTo(40, -86); c.lineTo(10, -30); c.lineTo(-10, -30); c.closePath(); c.stroke(); c.fillStyle = '#8a5a2b'; poly(c, [[-8, -30], [10, -30], [26, -4], [14, 0]]); },
  // A swallow on the wing: blue-black back, white belly, rusty throat, long forked tail.
  lastivka(c, o) {
    const f = Math.sin(((o && o.t) || 0) * 13);
    c.save(); c.translate(0, -50);
    c.fillStyle = '#1f2a44';
    poly(c, [[-16, -3], [-48, -11], [-30, 0], [-48, 11], [-16, 3]]);
    poly(c, [[-8, -3], [10, -5], [-6, -34 - f * 8], [-22, -26 - f * 8]]);
    ell(c, 2, 0, 22, 8.5); circ(c, 21, -3, 8);
    c.fillStyle = '#fffdf5'; ell(c, 3, 4, 15, 4.6);
    c.fillStyle = '#1f2a44'; poly(c, [[-10, 0], [8, 1], [-10, 26 + f * 8], [-24, 18 + f * 8]]);
    c.fillStyle = '#b5412b'; circ(c, 23, 1.5, 3.8);
    c.fillStyle = '#2a1a10'; poly(c, [[28, -4.5], [35, -2.5], [28, -1]]);
    c.fillStyle = '#fff'; circ(c, 23.5, -5, 1.3); c.fillStyle = '#111'; circ(c, 23.8, -5, 0.7);
    c.restore();
  },
  // A skrynia: a green painted dowry chest with flowers, brass bands and a domed lid.
  skrynia(c) {
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -2, 46, 5);
    c.fillStyle = '#5a3a1c'; rr(c, -40, -8, 9, 8, 2); rr(c, 31, -8, 9, 8, 2);
    c.fillStyle = '#2f7d5b'; rr(c, -42, -44, 84, 38, 4);
    c.fillStyle = '#256b4d'; rr(c, -44, -62, 88, 22, 9); c.fillStyle = '#39916b'; rr(c, -39, -59, 78, 6, 3);
    c.fillStyle = '#e8c66a'; c.fillRect(-42, -42, 84, 2.4); for (const x of [-31, 31]) c.fillRect(x - 2, -62, 4, 56);
    for (const x of [-15, 15]) {
      c.fillStyle = '#9fd18b'; ell(c, x - 9, -14, 5.5, 2.4); ell(c, x + 9, -14, 5.5, 2.4);
      c.fillStyle = '#d43a3a'; for (let k = 0; k < 5; k++) circ(c, x + Math.cos(k * 1.257 - 1.57) * 6, -25 + Math.sin(k * 1.257 - 1.57) * 6, 4.4);
      c.fillStyle = '#ffd23f'; circ(c, x, -25, 3);
    }
    c.fillStyle = '#fffdf5'; for (const [x, y] of [[0, -32], [0, -18], [-24, -34], [24, -34]]) circ(c, x, y, 1.5);
    c.fillStyle = '#3b2f2a'; rr(c, -3.5, -47, 7, 10, 2); c.fillStyle = '#e8c66a'; circ(c, 0, -41.5, 1.4);
  },
  // Kutia: a clay bowl heaped with wheat, speckled with poppy seeds and raisins, a thread of honey on top.
  kutia(c) {
    c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, 0, -3, 38, 5);
    c.fillStyle = '#8f3f1c'; ell(c, 0, -30, 39, 10);
    c.fillStyle = '#e9d9b0'; ell(c, 0, -34, 34, 13); c.fillStyle = '#f5ebca'; ell(c, -4, -38, 24, 8);
    c.fillStyle = '#2d2d2d'; for (const [x, y] of [[-22, -36], [-11, -42], [0, -37], [11, -43], [20, -36], [-5, -33], [9, -34], [-16, -33], [25, -33], [3, -44]]) circ(c, x, y, 1.15);
    c.fillStyle = '#6b2f4a'; for (const [x, y] of [[-9, -38], [15, -39], [3, -41]]) ell(c, x, y, 2.8, 2);
    c.strokeStyle = '#e0a020'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(-18, -42); c.quadraticCurveTo(-8, -47, 0, -41); c.quadraticCurveTo(8, -36, 18, -40); c.stroke();
    c.fillStyle = '#b5562b'; c.beginPath(); c.moveTo(-39, -30); c.quadraticCurveTo(-36, -2, 0, -2); c.quadraticCurveTo(36, -2, 39, -30); c.quadraticCurveTo(0, -17, -39, -30); c.fill();
    c.fillStyle = '#f1dfa0'; for (let i = -3; i <= 3; i++) circ(c, i * 8.5, -13 - (9 - i * i) * 0.25, 1.9);
    c.fillStyle = 'rgba(255,255,255,.18)'; ell(c, -20, -15, 5, 8);
  },
  // Uzvar: a glass jug of deep amber fruit drink with apple slices and berries, and a cup beside it.
  uzvar(c) {
    c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, 2, -2, 40, 5);
    c.strokeStyle = '#cfe6ee'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.arc(-34, -40, 12, 1.9, 4.4); c.stroke();
    c.fillStyle = 'rgba(214,236,244,.92)'; rr(c, -34, -76, 44, 74, 10);
    c.fillStyle = '#a84a26'; rr(c, -31, -60, 38, 55, 8); c.fillStyle = '#c4683a'; rr(c, -31, -60, 38, 6, 3);
    c.fillStyle = '#f2d9a0'; for (const [x, y] of [[-20, -44], [-6, -30], [-18, -20], [-2, -48]]) { c.beginPath(); c.arc(x, y, 6, 0.3, 3.44); c.fill(); }
    c.fillStyle = '#6e1f30'; for (const [x, y] of [[-8, -15], [-24, -32], [0, -38]]) circ(c, x, y, 3.2);
    c.fillStyle = 'rgba(255,255,255,.5)'; rr(c, -30, -71, 5, 52, 2.5);
    c.strokeStyle = '#fffdf5'; c.lineWidth = 3.6; c.beginPath(); c.arc(40, -13, 6, -1.3, 1.3); c.stroke();
    c.fillStyle = '#fffdf5'; rr(c, 17, -25, 23, 23, 5); c.fillStyle = '#d43a3a'; c.fillRect(17, -13, 23, 2.6);
    c.fillStyle = '#a84a26'; ell(c, 28.5, -23, 9.5, 3);
  },
  // A wooden rowing boat pulled up on the bank, with an oar resting in it.
  canoe(c) {
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, -2, 40, 6);
    c.fillStyle = '#8a5a32'; c.beginPath(); c.moveTo(-44, -22); c.quadraticCurveTo(-30, 0, 0, -1); c.quadraticCurveTo(30, 0, 44, -22); c.closePath(); c.fill();
    c.fillStyle = '#a8703f'; c.beginPath(); c.moveTo(-40, -21); c.quadraticCurveTo(-28, -5, 0, -6); c.quadraticCurveTo(28, -5, 40, -21); c.closePath(); c.fill();
    c.strokeStyle = '#7a4c28'; c.lineWidth = 1.2; for (const yy of [-10, -15]) { c.beginPath(); c.moveTo(-34, yy - 4); c.quadraticCurveTo(0, yy + 6, 34, yy - 4); c.stroke(); }
    c.fillStyle = '#5e3a1e'; ell(c, 0, -22, 42, 4.5); c.fillStyle = '#3f2a1a'; ell(c, 0, -21.5, 37, 2.8);
    c.fillStyle = '#c99760'; c.fillRect(-4, -25, 8, 4);
    c.strokeStyle = '#d9b07a'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-26, -34); c.lineTo(22, -18); c.stroke();
    c.fillStyle = '#d9b07a'; c.save(); c.translate(26, -17); c.rotate(0.32); ell(c, 0, 0, 8, 3.5); c.restore();
    c.fillStyle = '#d43a3a'; c.fillRect(-38, -24, 6, 2); c.fillRect(32, -24, 6, 2);
  },
  // A floor lamp: wooden base and pole, a cream fabric shade with an embroidered band, and a soft glow.
  floorlamp(c) {
    c.fillStyle = '#6b4a2a'; ell(c, 0, -3, 15, 4.5);
    c.fillStyle = '#8a6a44'; rr(c, -2.2, -78, 4.4, 76, 2);
    c.fillStyle = 'rgba(255,214,120,.35)'; ell(c, 0, -72, 26, 9);
    c.fillStyle = '#fff3d6'; poly(c, [[-14, -99], [14, -99], [23, -74], [-23, -74]]);
    c.fillStyle = '#d43a3a'; poly(c, [[-20.5, -81], [20.5, -81], [22, -77], [-22, -77]]);
    c.fillStyle = '#fff3d6'; for (let x = -16; x <= 16; x += 8) poly(c, [[x, -81], [x + 2, -79], [x, -77], [x - 2, -79]]);
    c.fillStyle = '#ffe9a8'; ell(c, 0, -74, 19, 3.5);
  },
  // A carpeted cat tree: sisal posts, three platforms, a little cube house and a dangling pompom.
  // The second cat tree (o.alt) is the mirror image, in sage green with a blue pompom.
  cattree(c, o) {
    const alt = o && o.alt;
    if (alt) c.scale(-1, 1);
    const carpet = alt ? '#b7d3a8' : '#e3cfae', edge = alt ? '#8db07e' : '#c9b08a', sisal = '#cfae78', rope = '#a8864f';
    const post = (x, y0, y1) => { c.fillStyle = sisal; c.fillRect(x - 5, y1, 10, y0 - y1); c.strokeStyle = rope; c.lineWidth = 1; for (let y = y1 + 3; y < y0; y += 4) { c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 5, y - 1.5); c.stroke(); } };
    const plat = (x0, x1, y) => { c.fillStyle = edge; rr(c, x0, y - 1, x1 - x0, 7, 3); c.fillStyle = carpet; rr(c, x0, y - 5, x1 - x0, 6, 3); };
    post(-16, -6, -50); post(-12, -50, -88); post(24, -6, -32);
    c.fillStyle = carpet; rr(c, 2, -32, 36, 27, 4);
    c.fillStyle = '#5a4630'; circ(c, 20, -17, 8);
    plat(-42, 44, -2); plat(0, 42, -32); plat(-40, 4, -50); plat(-32, 12, -88);
    c.strokeStyle = '#8a7566'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(8, -84); c.lineTo(8, -66); c.stroke();
    c.fillStyle = alt ? '#5aa9e6' : '#ff7aa8'; circ(c, 8, -63, 4.5);
  },
  // A round cushioned cat bed.
  catbed(c) {
    c.fillStyle = '#c4637f'; ell(c, 0, -14, 46, 17);
    c.fillStyle = '#fff1dc'; ell(c, 0, -17, 34, 10);
    c.fillStyle = '#ffe3c2'; ell(c, -6, -19, 18, 5);
    c.fillStyle = '#d77a96'; c.beginPath(); c.ellipse(0, -10, 46, 11, 0, 0, Math.PI); c.fill();
    c.fillStyle = 'rgba(255,255,255,.55)'; for (const [x, y] of [[-20, -5], [-14, -2], [-26, -2], [-20, 0]]) circ(c, x, y, x === -20 && y === 0 ? 3 : 1.8);
  },
  // A striped cat ball with a little bell.
  ball(c) {
    c.fillStyle = '#f25c7a'; circ(c, 0, -24, 22);
    c.strokeStyle = '#ffd23f'; c.lineWidth = 5;
    c.beginPath(); c.arc(0, -24, 22, -0.35 * Math.PI, 0.35 * Math.PI); c.stroke();
    c.beginPath(); c.arc(-6, -24, 15, 0.6 * Math.PI, 1.4 * Math.PI); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.45)'; ell(c, -8, -34, 6, 4);
    c.fillStyle = '#e8b830'; circ(c, 0, -2, 4.5);
  },
  // A grey felt toy mouse.
  toymouse(c) {
    c.strokeStyle = '#f08aa0'; c.lineWidth = 2.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-20, -11); c.bezierCurveTo(-34, -6, -38, -22, -48, -16); c.stroke();
    c.fillStyle = '#9b9ba3'; c.beginPath(); c.moveTo(-22, -12); c.quadraticCurveTo(-18, -30, 6, -26); c.quadraticCurveTo(24, -20, 26, -10); c.quadraticCurveTo(10, -2, -22, -4); c.closePath(); c.fill();
    c.fillStyle = '#b8b8c0'; circ(c, 6, -27, 8); c.fillStyle = '#f4a6b4'; circ(c, 6, -27, 4.5);
    c.fillStyle = '#2a1a10'; circ(c, 15, -17, 1.8); c.fillStyle = '#f08aa0'; circ(c, 26, -11, 2.4);
  },
  pumpkin(c) {
    c.strokeStyle = '#4f8a2a'; c.lineWidth = 2.5; c.lineCap = 'round';
    c.beginPath(); c.moveTo(4, -60); c.bezierCurveTo(16, -74, 26, -60, 20, -54); c.bezierCurveTo(15, -50, 13, -58, 18, -60); c.stroke();
    c.fillStyle = '#5fae4a'; c.save(); c.translate(-14, -62); c.rotate(-0.5); ell(c, 0, 0, 13, 7); c.restore();
    c.strokeStyle = '#3f8a3a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-24, -58); c.lineTo(-5, -66); c.stroke();
    const lobe = (x, rx, ry, col) => { c.fillStyle = col; c.beginPath(); c.ellipse(x, -31, rx, ry, 0, 0, 7); c.fill(); };
    lobe(-30, 17, 25, '#d9741a'); lobe(30, 17, 25, '#d9741a');
    lobe(-17, 21, 29, '#ec8a24'); lobe(17, 21, 29, '#ec8a24');
    lobe(0, 20, 31, '#f59a32');
    c.strokeStyle = 'rgba(160,80,10,.45)'; c.lineWidth = 1.6;
    for (const x of [-26, -10, 10, 26]) { c.beginPath(); c.moveTo(x * 0.55, -58); c.quadraticCurveTo(x, -31, x * 0.55, -3); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.28)'; ell(c, -7, -46, 5, 10);
    c.fillStyle = '#6b4a22'; c.beginPath(); c.moveTo(-4, -58); c.lineTo(-3, -72); c.quadraticCurveTo(1, -76, 5, -72); c.lineTo(4, -58); c.closePath(); c.fill();
  },
  can(c) {
    c.fillStyle = '#5aa9e6'; rr(c, -26, -46, 42, 42, 6); poly(c, [[14, -32], [42, -54], [47, -48], [14, -18]]);
    c.strokeStyle = '#3d86bf'; c.lineWidth = 5; c.beginPath(); c.arc(-26, -26, 14, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
    c.fillStyle = '#3d86bf'; circ(c, 46, -52, 6);
  },
};

// Draw an icon (emoji or "@drawn") with its bottom centre at (x, y), about s pixels tall.
function drawIcon(c, ic, x, y, s, o) {
  if (ic[0] === '@') {
    c.save(); c.translate(x, y); c.scale(s / 100, s / 100); DRAW[ic.slice(1)](c, o); c.restore();
  } else {
    c.font = `${Math.round(s * 0.86)}px ${EMOJI}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic';
    c.fillStyle = '#000'; c.fillText(ic, x, y - s * 0.1);
  }
}
// An emoji painted once into its own little canvas, so it can be turned and drawn every frame cheaply
// (turning text itself makes the phone redraw the glyph each time).
const emojiSpr = {};
function emojiSprite(c, ic, x, y, s, rot, scale) {
  const px = Math.ceil(s * scale / 8) * 8, key = ic + px;
  let sp = emojiSpr[key];
  if (!sp) { sp = emojiSpr[key] = document.createElement('canvas'); sp.width = sp.height = Math.ceil(px * 1.2); const k = sp.getContext('2d'); k.font = `${Math.round(px * 0.86)}px ${EMOJI}`; k.textAlign = 'center'; k.textBaseline = 'alphabetic'; k.fillText(ic, sp.width / 2, sp.height * 0.85); }
  const B = s * 1.2;
  c.save(); c.translate(x, y); c.rotate(rot); c.drawImage(sp, -B / 2, -s * 0.1 - B * 0.85, B, B); c.restore();
}
const iconCache = {};
// A large picture of something (the outfit cards in the market are big).
const bigIcons = {};
function bigIconURL(id) {
  if (bigIcons[id]) return bigIcons[id];
  const k = document.createElement('canvas'); k.width = k.height = 320;
  drawIcon(k.getContext('2d'), W[id].ic, 160, 304, 290);
  return (bigIcons[id] = k.toDataURL());
}
function iconURL(id) {
  if (iconCache[id]) return iconCache[id];
  const k = document.createElement('canvas'); k.width = k.height = 128;
  drawIcon(k.getContext('2d'), W[id].ic, 64, 120, 112);
  return (iconCache[id] = k.toDataURL());
}

// A little villager in an embroidered shirt. (x, y) is between the feet.
// What the villagers are busy with. layer 0 is drawn behind them, layer 1 in front.
// Bohdan puffs his smoker at the hives with bees about; Taras fishes; Grandma Olia waters her flower bed.
function chore(c, x, y, id, t, layer) {
  c.save(); c.translate(x, y); c.lineCap = 'round'; c.lineJoin = 'round';
  if (id === 'andriiko' && layer === 1 && FETCH.on === 'hand') { const h = boyHand(); ballArt(c, h.x, h.y - 1, 4.8); }
  if (id === 'bohdan') {
    if (layer === 1) {
      // a smoker in his left hand, puffing toward the hives
      const hx = -17, hy = -27;
      c.fillStyle = '#b9bec4'; rr(c, hx - 7, hy - 6, 12, 16, 3); c.fillStyle = '#8d939a'; c.fillRect(hx - 7, hy - 1, 12, 2);
      c.fillStyle = '#9aa0a7'; poly(c, [[hx - 6, hy - 6], [hx + 4, hy - 6], [hx - 3, hy - 14], [hx - 6, hy - 14]]);
      c.fillStyle = '#7a5532'; rr(c, hx + 4, hy - 2, 6, 9, 2);
      for (let i = 0; i < 4; i++) {
        const f = (t * 0.45 + i / 4) % 1;
        c.fillStyle = `rgba(235,235,235,${0.75 * (1 - f)})`; circ(c, hx - 5 - f * 34, hy - 16 - f * 26 + Math.sin(t * 2 + i) * 3, 4 + f * 9);
      }
      // bees busy around him (in winter they stay in the hive)
      if (!winter()) for (let i = 0; i < 4; i++) {
        const a = t * (1.6 + i * 0.3) + i * 1.7, bx = -10 + Math.cos(a) * (24 + i * 6), by = -62 + Math.sin(a * 1.3) * 16;
        c.fillStyle = 'rgba(255,255,255,.8)'; ell(c, bx - 1, by - 3, 2.6, 1.6);
        c.fillStyle = '#f2b51d'; ell(c, bx, by, 3.4, 2.4); c.fillStyle = '#3b2f2a'; c.fillRect(bx - 0.6, by - 2.2, 1.3, 4.4);
      }
    }
  } else if (id === 'taras') {
    if (layer === 1) {
      // rod over the water from his right hand, float bobbing out on the pond
      const hx = 16, hy = -27, tip = [74, -96], fl = [112, -2 + Math.sin(t * 2.2) * 1.5 + (Math.sin(t * 0.7) > 0.93 ? 4 : 0)];
      c.strokeStyle = '#c8a46a'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(hx - 4, hy + 6); c.lineTo(tip[0], tip[1]); c.stroke();
      c.fillStyle = '#5b6470'; circ(c, hx + 3, hy - 3, 3.5);
      c.strokeStyle = 'rgba(70,70,70,.8)'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(tip[0], tip[1]); c.quadraticCurveTo(tip[0] + 30, tip[1] + 40, fl[0], fl[1]); c.stroke();
      if (winter()) { c.fillStyle = '#2f6a99'; ell(c, 112, 2, 9, 3.4); c.strokeStyle = '#ffffff'; c.lineWidth = 1.4; c.beginPath(); c.ellipse(112, 2, 9, 3.4, 0, 0, 7); c.stroke(); }   // a hole in the ice
      else { const r = (t * 0.6) % 1; c.strokeStyle = `rgba(255,255,255,${0.7 * (1 - r)})`; c.lineWidth = 1.4; c.beginPath(); c.ellipse(112, 2, 6 + r * 14, (6 + r * 14) * 0.35, 0, 0, 7); c.stroke(); }
      c.fillStyle = '#e2392f'; circ(c, fl[0], fl[1], 4.5); c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(fl[0], fl[1], 4.5, 0, Math.PI); c.fill();
    } else {
      // a bucket for the catch
      c.fillStyle = '#8a9099'; poly(c, [[-38, -18], [-22, -18], [-24, 0], [-36, 0]]); c.fillStyle = '#6d737b'; ell(c, -30, -18, 8, 2.6);
      c.strokeStyle = '#6d737b'; c.lineWidth = 1.3; c.beginPath(); c.arc(-30, -18, 8, Math.PI, 0); c.stroke();
    }
  } else if (id === 'oksana') {
    if (layer === 1) {
      // the broom in both hands, bristles swishing over the ground ahead of her
      const p = oksPose(t), L = NPC.oksana.look;
      c.save(); c.scale(OKS.dir, 1);
      const bl = 15, hx = p.B[0] - p.ux * bl, hy = p.B[1] - p.uy * bl;   // where the bristles start
      c.strokeStyle = '#9b6b3c'; c.lineWidth = 3; c.beginPath(); c.moveTo(p.HL[0] - p.ux * 2.5, p.HL[1] - p.uy * 2.5); c.lineTo(hx, hy); c.stroke();
      c.save(); c.translate(hx, hy); c.rotate(Math.atan2(p.uy, p.ux) - Math.PI / 2 - p.sw * 0.12);
      c.fillStyle = '#d9b45a'; poly(c, [[-3, 0], [3, 0], [8, bl], [-8, bl]]);
      c.strokeStyle = '#b8913e'; c.lineWidth = 1; for (const dx of [-5, 0, 5]) { c.beginPath(); c.moveTo(dx * 0.4, 2); c.lineTo(dx, bl); c.stroke(); }
      c.fillStyle = '#c23b2f'; c.fillRect(-3, 0, 6, 2.5);
      c.restore();
      c.fillStyle = L.skin; circ(c, p.HL[0], p.HL[1], 3.6); circ(c, p.HR[0], p.HR[1], 3.6);
      c.restore();
      for (const q of OKS.dust) { const f = q.age / q.life; c.fillStyle = `rgba(196,168,118,${0.7 * (1 - f)})`; circ(c, q.x - x, q.y - y, q.r + f * 6); }
    }
  } else if (id === 'olia') {
    if (layer === 0) {
      // her cooking table, to her right: today's dish on it, steaming, with a spoon stirring
      const R = curRecipe(), tx = 66;
      c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, tx, 3, 30, 6);
      c.fillStyle = '#7a4e26'; c.fillRect(tx - 24, -26, 4, 28); c.fillRect(tx + 20, -26, 4, 28);
      c.fillStyle = '#b57a3e'; rr(c, tx - 30, -32, 60, 8, 3); c.fillStyle = '#d19a58'; rr(c, tx - 30, -33, 60, 4, 2);
      drawIcon(c, W[R.dish].ic, tx - 2, -30, 54);
      for (let i = 0; i < 3; i++) { const f = (t * 0.5 + i / 3) % 1; c.fillStyle = `rgba(255,255,255,${0.5 * (1 - f)})`; circ(c, tx + Math.sin(f * 6 + i * 2) * 5, -62 - f * 26, 4 + f * 6); }
      const st = Math.sin(t * 3.4) * 7;
      c.strokeStyle = '#9b6b3c'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(tx + 20 + st, -66); c.lineTo(tx - 2 + st * 0.3, -38); c.stroke();
      c.fillStyle = '#9b6b3c'; ell(c, tx + 21 + st, -67, 4, 2.6);
      // her flower bed, to her left
      c.fillStyle = '#8b6440'; ell(c, -62, 2, 34, 9); c.fillStyle = '#9c7350'; ell(c, -62, 0, 31, 7);
      if (winter()) { c.fillStyle = '#f6f9fd'; ell(c, -62, -1, 32, 7); }   // asleep under the snow
      const fl = [[-86, '#e2574c'], [-76, '#ffd23f'], [-66, '#ff7aa8'], [-56, '#ffffff'], [-46, '#9b6bd6'], [-38, '#e2574c'], [-81, '#ff7aa8'], [-61, '#ffd23f'], [-50, '#5aa9e6']];
      if (!winter()) fl.forEach(([fx, col], i) => {
        const fy = i > 5 ? 6 : -1, h = 16 + (i % 3) * 5, sway = Math.sin(t * 1.4 + i) * 1.5;
        c.strokeStyle = '#4f8f3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + sway, fy - h); c.stroke();
        c.fillStyle = '#5fa046'; ell(c, fx + 3, fy - h * 0.45, 4, 1.8);
        c.fillStyle = col; for (let k = 0; k < 5; k++) { const a = k * 1.2566; circ(c, fx + sway + Math.cos(a) * 3.4, fy - h + Math.sin(a) * 3.4, 2.6); }
        c.fillStyle = '#f2b51d'; circ(c, fx + sway, fy - h, 2);
      });
    } else if (!winter()) {
      // watering can tipped over the bed, with water drops falling
      const tilt = 0.35 + Math.sin(t * 1.1) * 0.08;
      c.save(); c.translate(-18, -26); c.rotate(-tilt);
      c.fillStyle = '#5aa0c8'; rr(c, -9, -7, 18, 15, 4); c.fillStyle = '#4a86a8'; c.fillRect(-9, -2, 18, 2);
      c.strokeStyle = '#5aa0c8'; c.lineWidth = 3; c.beginPath(); c.moveTo(-8, 0); c.lineTo(-22, -9); c.stroke();
      c.fillStyle = '#4a86a8'; ell(c, -23, -9, 3, 2);
      c.strokeStyle = '#4a86a8'; c.lineWidth = 2; c.beginPath(); c.arc(3, -7, 6, Math.PI, 0); c.stroke();
      c.restore();
      c.fillStyle = 'rgba(120,190,240,.85)';
      for (let i = 0; i < 6; i++) { const f = (t * 1.6 + i / 6) % 1; ell(c, -40 - i % 3 * 4 - f * 6, -34 + f * 32, 1.3, 2.4); }
    }
  }
  c.restore();
}
// moving: 0..1, how much of a walk this is (it blends in and out, so steps start and stop softly).
// ph: the walk phase; the player's comes from the distance walked, so the feet never slide.
function person(c, x, y, L, t, moving, sc, ph, view) {
  const side = view ? view.side || 0 : 0, back = view ? view.back || 0 : 0, fx = side * 4.5;
  const k = (L.small ? 0.78 : 1) * (sc || 1), m = +moving || 0, w = ph === undefined ? t * 12 : ph;
  c.save(); c.translate(x, y); c.scale(k, k);
  const bob = -m * Math.abs(Math.sin(w)) * 2.6 + (1 - m) * Math.sin(t * 2) * 0.8;
  const sw = m * Math.sin(w) * 4.5;
  const la = m * Math.max(0, Math.cos(w)) * 3.5, lb = m * Math.max(0, -Math.cos(w)) * 3.5;   // each foot lifts in turn
  const arm = m * Math.sin(w) * 0.42 + (1 - m) * Math.sin(t * 2) * 0.025;
  const blink = (t * 0.29 + (L.small ? 0.4 : 0)) % 1 > 0.966;
  c.fillStyle = 'rgba(0,0,0,.16)'; ell(c, 0, 0, 17 - m * 1.5, 6);
  if (L.long) { c.fillStyle = L.hair; rr(c, -17 - sw * 0.25, -76 + bob, 34, 44, 13); }
  c.fillStyle = L.boots || '#5b4636'; rr(c, -9 + sw, -13 - la, 7, 13, 2.5); rr(c, 2 - sw, -13 - lb, 7, 13, 2.5);
  c.fillStyle = L.boots ? 'rgba(0,0,0,.25)' : '#3f3027'; rr(c, -10 + sw, -3.5 - la, 9, 3.5, 1.7); rr(c, 1 - sw, -3.5 - lb, 9, 3.5, 1.7);
  if (L.boots) { c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(-9 + sw, -13 - la, 7, 1.6); c.fillRect(2 - sw, -13 - lb, 7, 1.6); }   // red boots, with a pale top band
  c.rotate(m * Math.sin(w) * 0.025);
  c.fillStyle = L.skirt;
  if (L.dress) { poly(c, [[-13, -32 + bob], [13, -32 + bob], [19, -8 + bob], [-19, -8 + bob]]);
    if (L.skirtPat === 'check') { c.save(); c.beginPath(); c.moveTo(-13, -32 + bob); c.lineTo(13, -32 + bob); c.lineTo(19, -8 + bob); c.lineTo(-19, -8 + bob); c.closePath(); c.clip(); c.fillStyle = L.skirt2; for (let i = -3; i <= 3; i++) c.fillRect(i * 6 - 1.5, -32 + bob, 3, 24); for (let j = 0; j < 4; j++) c.fillRect(-20, -28 + j * 6 + bob, 40, 2); c.fillStyle = 'rgba(255,230,140,.6)'; for (let i = -3; i <= 3; i++) for (let j = 0; j < 4; j++) c.fillRect(i * 6 - 0.5, -27 + j * 6 + bob, 1, 1); c.restore(); }   // a plakhta's woven check
    c.fillStyle = L.trim; c.fillRect(-18, -12 + bob, 36, 2.5);
    if (L.apron && back < 0.5) { c.fillStyle = L.apron; poly(c, [[-8, -31 + bob], [8, -31 + bob], [10, -10 + bob], [-10, -10 + bob]]); c.fillStyle = L.apronTrim; c.fillRect(-10, -14 + bob, 20, 2); for (let i = -2; i <= 2; i++) { c.fillRect(i * 4 - 1, -18 + bob, 2, 2); } }   // the apron, embroidered along its hem
  }
  else rr(c, -14, -31 + bob, 28, 22, 6);
  if (!L.noArms) for (const sx of [-15.5, 15.5]) {   // arms swing from the shoulder
    c.save(); c.translate(sx, -47 + bob); c.rotate(sx > 0 && L.armR !== undefined ? L.armR : sx < 0 && L.armL !== undefined ? L.armL : arm);
    c.fillStyle = L.sleeve || L.shirt; rr(c, -3.5, -1, 7, 18, 3); c.fillStyle = L.fur || L.trim; c.fillRect(-3.5, 13, 7, L.fur ? 4 : 2.5);
    c.fillStyle = L.skin; circ(c, 0, 19, 3.5); c.restore();
  }
  c.fillStyle = L.shirt; rr(c, -14, -51 + bob, 28, 26, 8);
  c.fillStyle = L.trim; c.fillRect(-2 + fx * 0.5, -49 + bob, 4, 18); c.fillRect(-14, -30 + bob, 28, 3);
  for (let i = 0; i < 3; i++) { c.fillRect(-6 + fx * 0.5, -46 + i * 6 + bob, 2, 2); c.fillRect(4 + fx * 0.5, -46 + i * 6 + bob, 2, 2); }
  dressTop(c, L, bob, fx, back);
  c.fillStyle = L.skin; circ(c, 0, -63 + bob, 14);
  c.fillStyle = L.hair; c.beginPath(); c.arc(0, -65 + bob, 14.6, Math.PI, 0); c.fill();
  if (L.long) { rr(c, -15.5, -66 + bob, 5, 20, 2.5); rr(c, 10.5, -66 + bob, 5, 20, 2.5); c.fillStyle = L.band || '#d43a3a'; c.fillRect(-13.5, -73 + bob, 27, 3); c.fillStyle = '#ffd23f'; circ(c, -9, -74 + bob, 2.6); c.fillStyle = '#ff7aa8'; circ(c, -4, -76 + bob, 2.6); }
  c.save(); c.translate(fx, 0);   // the face slides toward the way she is looking
  c.fillStyle = '#3b2f2a'; if (blink) { c.fillRect(-7, -62.6 + bob, 4, 1.3); c.fillRect(3, -62.6 + bob, 4, 1.3); } else { circ(c, -5, -62 + bob, 1.8); circ(c, 5, -62 + bob, 1.8); c.fillStyle = 'rgba(255,255,255,.8)'; circ(c, -4.4, -62.7 + bob, 0.6); circ(c, 5.6, -62.7 + bob, 0.6); c.fillStyle = '#3b2f2a'; }
  c.strokeStyle = '#3b2f2a'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, -58 + bob, 4.5, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  c.fillStyle = 'rgba(240,120,120,.45)'; circ(c, -9, -58 + bob, 2.8 * (1 - side * 0.6)); circ(c, 9, -58 + bob, 2.8);
  c.restore();
  if (side > 0.05) { c.fillStyle = L.hair; c.globalAlpha = Math.min(1, side * 1.2); c.beginPath(); c.arc(0, -63 + bob, 14.4, Math.PI * 0.55, Math.PI * 1.05); c.lineTo(-4, -70 + bob); c.closePath(); c.fill(); c.globalAlpha = 1; }   // hair over the far side of her head
  if (back > 0.01) {   // from behind: hair covers her head, and her shirt has no buttons
    c.globalAlpha = Math.min(1, back);
    c.fillStyle = L.shirt; rr(c, -14, -51 + bob, 28, 20, 8);
    if (L.vest) { c.fillStyle = L.vest; rr(c, -14, -51 + bob, 28, 22, 7); c.fillStyle = L.vestTrim; c.fillRect(-14, -31 + bob, 28, 2); }   // vest and coat under her hair
    if (L.coat) { c.fillStyle = L.coat; rr(c, -15, -52 + bob, 30, 40, 8); c.fillStyle = L.fur; c.fillRect(-15, -16 + bob, 30, 4); ell(c, 0, -51 + bob, 12, 3.5); }
    c.fillStyle = L.hair; circ(c, 0, -63.5 + bob, 14.8);
    if (L.long) { c.fillStyle = L.hair; rr(c, -15.5, -66 + bob, 31, 30, 10); }
    if (L.ribbons) L.ribbons.forEach((col, i) => { c.fillStyle = col; const sw2 = Math.sin(t * 3 + i) * 2; c.fillRect(-9 + i * 3.8 + sw2 * 0.3, -70 + bob, 3, 46 + (i % 2) * 6); });   // ribbons streaming from the crown
    c.globalAlpha = 1;
  }
  if (L.hat === 'scarf') {
    c.fillStyle = L.hatCol; c.beginPath(); c.arc(0, -64 + bob, 15.8, Math.PI * 0.98, Math.PI * 0.02); c.fill();
    poly(c, [[-14, -62 + bob], [-10, -50 + bob], [-16, -52 + bob]]); poly(c, [[14, -62 + bob], [10, -50 + bob], [16, -52 + bob]]);
    c.fillStyle = '#fffdf5'; for (let i = -2; i <= 2; i++) circ(c, i * 5, -75 + Math.abs(i) * 1.6 + bob, 1.3);
  } else if (L.hat === 'straw') {
    c.fillStyle = L.hatCol; ell(c, 0, -73 + bob, 22, 6); rr(c, -11, -86 + bob, 22, 14, 6);
    c.fillStyle = '#8a5a2b'; c.fillRect(-11, -76 + bob, 22, 2.5);
  } else if (L.hat === 'hood') {
    c.fillStyle = L.hatCol; c.beginPath(); c.ellipse(0, -62 + bob, 18.5, 19.5, 0, 0, Math.PI * 2);
    if (back < 0.5) { c.ellipse(0, -60 + bob, 12, 13.5, 0, 0, Math.PI * 2); c.fill('evenodd'); if (L.hoodFur) { c.strokeStyle = L.fur || '#fff'; c.lineWidth = 4; c.beginPath(); c.ellipse(0, -60 + bob, 13.5, 15, 0, 0, Math.PI * 2); c.stroke(); } }
    else c.fill();
    c.fillStyle = 'rgba(0,0,0,.1)'; c.fillRect(-1, -80 + bob, 2, 14);
  } else if (L.hat === 'wreath') {
    const cols = [L.hatCol, '#f2c230', '#ffffff', '#e2574c', '#5aa9e6'];
    for (let i = 0; i < 7; i++) { const a = Math.PI * (1.08 + i * 0.14); c.fillStyle = cols[i % 5]; circ(c, Math.cos(a) * 14.5, -65 + Math.sin(a) * 14.5 + bob, 3.6); }
  }
  c.restore();
}
const ME = { skin: '#f7d6b8', shirt: '#ffffff', trim: '#d43a3a', skirt: '#c0392b', hair: '#f4d35e', hat: 'none', long: true, dress: true };
// Her outfits. Each sets the whole look; the drawing (front, side, back, walking) comes from these fields:
// shirt/trim/skirt colours, sleeve (if not the shirt), a skirt pattern (check, with skirt2), belt, apron (+
// apronTrim), vest (+ vestTrim), coat (+ fur), boots, beads, a hat (scarf, wreath) and ribbons on the wreath.
const ME_BASE = Object.assign({}, ME);
const OUTFITS = {
  sorochka: {},
  kersetka: { trim: '#2b2b2b', skirt: '#1d2a4a', vest: '#2f6b3a', vestTrim: '#e8c35a', beads: true, band: '#2f6b3a' },
  plakhta: { trim: '#2f5f9e', skirt: '#b8322b', skirtPat: 'check', skirt2: '#2f6b3a', belt: '#e8c35a', band: '#2f5f9e' },
  fartukh: { shirt: '#fffaf0', trim: '#d43a3a', skirt: '#3d7cc2', apron: '#ffffff', apronTrim: '#d43a3a', hat: 'scarf', hatCol: '#d43a3a' },
  strichky: { trim: '#d43a3a', skirt: '#8a1f2b', hat: 'wreath', hatCol: '#ff7aa8', ribbons: ['#d43a3a', '#ffd23f', '#3d7cc2', '#2f9e5b', '#ff7aa8'], beads: true },
  kozhushok: { skirt: '#3a2a4a', coat: '#9a6a3a', fur: '#fbf6ea', sleeve: '#9a6a3a', boots: '#b8322b', hat: 'scarf', hatCol: '#7a2e4a' },
  plashch: { skirt: '#3d7cc2', coat: '#ffd23f', fur: '#e8a91a', sleeve: '#ffd23f', boots: '#3d7cc2', hat: 'hood', hatCol: '#ffd23f' },   // a yellow raincoat, hood up, and blue rubber boots
  puhovyk: { skirt: '#2b2b3a', coat: '#d43a3a', fur: '#f4efe2', sleeve: '#d43a3a', boots: '#5b4636', hat: 'hood', hatCol: '#d43a3a', hoodFur: true, quilt: true },   // a quilted red winter parka with a fur-trimmed hood
  sarafan: { trim: '#3d7cc2', skirt: '#f2b51d', vest: '#f2b51d', vestTrim: '#d43a3a', hat: 'wreath', hatCol: '#ffd23f', beads: true },   // a sunflower-yellow sarafan over the blouse
};
const OUTFIT_KEYS = ['hoodFur', 'quilt', 'sleeve', 'skirtPat', 'skirt2', 'belt', 'apron', 'apronTrim', 'vest', 'vestTrim', 'coat', 'fur', 'boots', 'beads', 'ribbons', 'hatCol', 'band'];
const lookFor = id => Object.assign({}, ME_BASE, OUTFITS[id] || {});
wearOutfit(S.outfit);   // dressed as she was last time
// Dress her in an outfit: ME is shared by every drawing of her, so it's changed in place.
function wearOutfit(id) {
  if (!OUTFITS[id]) id = 'sorochka';
  for (const k of OUTFIT_KEYS) delete ME[k];
  Object.assign(ME, ME_BASE, OUTFITS[id]);
}
// The same villager seen from the side, facing right (mirror it for left): one eye, a little nose, hair
// down her back, legs striding one past the other, the far arm and leg a shade darker behind her.
// Over the blouse, from the front: the vest's two panels, a sheepskin coat with its fur trim, the belt, the beads.
function dressTop(c, L, bob, fx, back) {
  if (L.vest) { c.fillStyle = L.vest; rr(c, -14, -51 + bob, 10, 24, 6); rr(c, 4, -51 + bob, 10, 24, 6); c.fillStyle = L.vestTrim; c.fillRect(-5, -50 + bob, 1.6, 22); c.fillRect(3.4, -50 + bob, 1.6, 22); c.fillRect(-14, -29 + bob, 28, 2); for (let i = 0; i < 3; i++) { circ(c, -9, -44 + i * 6 + bob, 1.1); circ(c, 9, -44 + i * 6 + bob, 1.1); } }
  if (L.coat) { c.fillStyle = L.coat; rr(c, -15, -52 + bob, 30, 40, 8); if (L.quilt) { c.strokeStyle = 'rgba(0,0,0,.15)'; c.lineWidth = 1.2; for (const yy of [-44, -36, -28, -20]) { c.beginPath(); c.moveTo(-14, yy + bob); c.quadraticCurveTo(0, yy + 2 + bob, 14, yy + bob); c.stroke(); } } c.fillStyle = L.fur; ell(c, 0, -50 + bob, 11, 4); c.fillRect(-1.8 + fx * 0.5, -50 + bob, 3.6, 36); c.fillRect(-15, -16 + bob, 30, 4); c.fillStyle = 'rgba(80,50,20,.35)'; for (const yy of [-44, -36, -28]) circ(c, 4 + fx * 0.5, yy + bob, 1.3); }
  if (L.belt) { c.fillStyle = L.belt; c.fillRect(-14, -31 + bob, 28, 4); c.fillRect(7, -29 + bob, 3, 9); c.fillRect(10, -29 + bob, 3, 7); }
  if (L.beads && back < 0.5) { const cols = ['#d43a3a', '#b8322b']; for (let r = 0; r < 3; r++) for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.15 + i / 8 * 0.7); c.fillStyle = cols[(i + r) % 2]; circ(c, Math.cos(a) * (8 + r * 2), -51 + Math.sin(a) * (4 + r * 2.5) + bob, 1.6); } }
  if (L.ribbons && back < 0.5) L.ribbons.slice(0, 2).forEach((col, i) => { c.fillStyle = col; c.fillRect(i ? 11 : -14, -60 + bob, 3, 22); });   // two ribbon ends over her shoulders
}
function personSide(c, x, y, L, t, moving, sc, ph) {
  const k = (L.small ? 0.78 : 1) * (sc || 1), m = +moving || 0, w = ph === undefined ? t * 12 : ph;
  c.save(); c.translate(x, y); c.scale(k, k);
  const bob = -m * Math.abs(Math.sin(w)) * 2.6 + (1 - m) * Math.sin(t * 2) * 0.8;
  const st = m * Math.sin(w) * 6, la = m * Math.max(0, Math.cos(w)) * 3.5, lb = m * Math.max(0, -Math.cos(w)) * 3.5;
  const arm = m * Math.sin(w) * 0.55 + (1 - m) * Math.sin(t * 2) * 0.025;
  const blink = (t * 0.29 + (L.small ? 0.4 : 0)) % 1 > 0.966;
  c.fillStyle = 'rgba(0,0,0,.16)'; ell(c, 0, 0, 14 - m * 1.5, 5.5);
  const leg = (dx, lift, far) => {
    c.fillStyle = L.boots || (far ? '#4a392c' : '#5b4636'); rr(c, -3.5 + dx, -13 - lift, 7, 13, 2.5);
    c.fillStyle = L.boots ? (far ? '#7a2420' : '#962a24') : far ? '#30251d' : '#3f3027'; rr(c, -4 + dx, -3.5 - lift, 11, 3.5, 1.7);
    if (far && L.boots) { c.fillStyle = 'rgba(0,0,0,.2)'; rr(c, -3.5 + dx, -13 - lift, 7, 13, 2.5); }
  };
  const limb = (sw, far) => {
    c.save(); c.translate(0, -47 + bob); c.rotate(sw);
    c.fillStyle = L.sleeve || L.shirt; rr(c, -3.5, -1, 7, 18, 3); c.fillStyle = L.fur || L.trim; c.fillRect(-3.5, 13, 7, L.fur ? 4 : 2.5);
    c.fillStyle = L.skin; circ(c, 0, 19, 3.5);
    if (far) { c.fillStyle = 'rgba(60,40,30,.22)'; rr(c, -3.5, -1, 7, 23.5, 3); }
    c.restore();
  };
  leg(-st, lb, true);
  if (!L.noArms) limb(L.armAng ? L.armAng[0] : -arm, true);
  if (L.long) { c.fillStyle = L.hair; rr(c, -16, -74 + bob, 19, 44, 10); }
  leg(st, la, false);
  c.fillStyle = L.skirt;
  if (L.dress) { poly(c, [[-10, -32 + bob], [10, -32 + bob], [14, -8 + bob], [-13, -8 + bob]]);
    if (L.skirtPat === 'check') { c.save(); c.beginPath(); c.moveTo(-10, -32 + bob); c.lineTo(10, -32 + bob); c.lineTo(14, -8 + bob); c.lineTo(-13, -8 + bob); c.closePath(); c.clip(); c.fillStyle = L.skirt2; for (let i = -2; i <= 2; i++) c.fillRect(i * 6 - 1.5, -32 + bob, 3, 24); for (let j = 0; j < 4; j++) c.fillRect(-14, -28 + j * 6 + bob, 28, 2); c.restore(); }
    c.fillStyle = L.trim; c.fillRect(-13, -12 + bob, 27, 2.5);
    if (L.apron) { c.fillStyle = L.apron; poly(c, [[3, -31 + bob], [10, -31 + bob], [13.5, -10 + bob], [6, -10 + bob]]); c.fillStyle = L.apronTrim; c.fillRect(6, -14 + bob, 7.5, 2); }
  }
  else rr(c, -10, -31 + bob, 20, 22, 6);
  // shirt from the side: embroidered collar and hem, no front placket (that faces away from us)
  c.fillStyle = L.shirt; rr(c, -9, -51 + bob, 18, 26, 7);
  c.fillStyle = L.trim; c.fillRect(-9, -30 + bob, 18, 3); c.fillRect(-2, -51 + bob, 9, 2.5);
  for (let i = 0; i < 3; i++) c.fillRect(-4 + i * 4, -27 + bob, 2, 1.5);
  if (L.vest) { c.fillStyle = L.vest; rr(c, -9, -51 + bob, 14, 24, 6); c.fillStyle = L.vestTrim; c.fillRect(4, -50 + bob, 1.6, 22); c.fillRect(-9, -29 + bob, 14, 2); }
  if (L.coat) { c.fillStyle = L.coat; rr(c, -10, -52 + bob, 21, 40, 8); c.fillStyle = L.fur; c.fillRect(8, -50 + bob, 3.5, 36); c.fillRect(-10, -16 + bob, 21, 4); ell(c, 2, -50 + bob, 8, 3.5); }
  if (L.belt) { c.fillStyle = L.belt; c.fillRect(-9, -31 + bob, 18, 4); c.fillRect(-11, -29 + bob, 3, 9); }
  if (L.beads) { for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#b8322b' : '#d43a3a'; circ(c, 3 + i * 1.4, -50 + i * 1.2 + bob, 1.5); } }
  // The head, storybook-style: a round head that is mostly hair, with the face as a soft oval on the front
  // third. Just an eye, a blush and a hint of a nose bump in the outline; no mouth.
  const hy = -63 + bob;
  c.fillStyle = L.skin; circ(c, 0, hy, 14);
  c.save(); c.beginPath(); c.arc(0, hy, 14, 0, 7); c.clip();
  c.fillStyle = L.hair; c.fillRect(-16, hy - 16, 32, 32);                    // hair everywhere...
  c.fillStyle = L.skin; ell(c, 8, hy + 3.5, 9.5, 11.5);                       // ...except the face
  c.fillStyle = L.hair; ell(c, 4, hy - 9.5, 12, 5.5);                          // fringe over the forehead
  c.restore();
  c.fillStyle = L.skin; circ(c, 13.6, hy + 1.2, 1.7);                          // nose, just breaking the outline
  if (L.long) { c.fillStyle = L.hair; rr(c, -15, hy - 2, 8, 24, 4); }         // the long hair falling behind
  if (L.long) { c.strokeStyle = L.band || '#d43a3a'; c.lineWidth = 3; c.lineCap = 'butt'; c.beginPath(); c.arc(0, hy, 14.2, Math.PI * 1.08, Math.PI * 1.72); c.stroke(); c.fillStyle = '#ffd23f'; circ(c, -10.5, hy - 9.5, 2.6); c.fillStyle = '#ff7aa8'; circ(c, -7, hy - 12.5, 2.6); }
  c.fillStyle = '#3b2f2a'; if (blink) c.fillRect(6.5, hy + 0.6, 4, 1.3); else { ell(c, 8.5, hy + 1, 1.7, 2.1); c.fillStyle = 'rgba(255,255,255,.85)'; circ(c, 9.1, hy + 0.2, 0.6); }
  c.fillStyle = 'rgba(240,120,120,.45)'; circ(c, 7, hy + 6, 2.6);
  if (L.hat === 'scarf') {   // over the top and back of the head, tied under the chin at the back
    c.fillStyle = L.hatCol; c.beginPath(); c.arc(0, hy - 0.5, 15.8, Math.PI * 0.55, Math.PI * 1.9); c.lineTo(5, hy - 6); c.quadraticCurveTo(1, hy + 6, 3, hy + 14); c.closePath(); c.fill();
    poly(c, [[-3, hy + 11], [-13, hy + 22], [-6, hy + 22]]);
    c.fillStyle = '#fffdf5'; for (let i = 0; i < 5; i++) { const ang = Math.PI * (1.15 + i * 0.16); circ(c, Math.cos(ang) * 12.5, hy + Math.sin(ang) * 12.5, 1.3); }
  } else if (L.hat === 'straw') {
    c.fillStyle = L.hatCol; ell(c, 2, hy - 10, 22, 5.5); rr(c, -9, hy - 23, 20, 14, 6);
    c.fillStyle = '#8a5a2b'; c.fillRect(-9, hy - 13, 20, 2.5);
  } else if (L.hat === 'hood') {
    c.fillStyle = L.hatCol; c.beginPath(); c.arc(0, hy, 17.5, 0, Math.PI * 2); c.ellipse(8.5, hy + 3.5, 8.5, 11, 0, 0, Math.PI * 2); c.fill('evenodd');
    if (L.hoodFur) { c.strokeStyle = L.fur || '#fff'; c.lineWidth = 4; c.beginPath(); c.ellipse(8.5, hy + 3.5, 9.5, 12, 0, -Math.PI * 0.6, Math.PI * 0.6); c.stroke(); }
  } else if (L.hat === 'wreath') {
    if (L.ribbons) L.ribbons.forEach((col, i) => { c.fillStyle = col; const sw2 = Math.sin(t * 3 + i) * 2 - (+moving || 0) * 3; c.save(); c.translate(-12, hy - 4); c.rotate(0.15 + i * 0.05 + sw2 * 0.03); c.fillRect(-1.5, 0, 3, 40 + (i % 2) * 6); c.restore(); });   // the ribbons stream out behind her
    const cols = [L.hatCol, '#f2c230', '#ffffff', '#e2574c', '#5aa9e6'];
    for (let i = 0; i < 6; i++) { const ang = Math.PI * (1.02 + i * 0.15); c.fillStyle = cols[i % 5]; circ(c, Math.cos(ang) * 14.5, hy - 2 + Math.sin(ang) * 14.5, 3.6); }
  }
  if (!L.noArms) limb(L.armAng ? L.armAng[1] : arm, false);
  c.restore();
}
function faceURL(L) {
  const k = document.createElement('canvas'); k.width = k.height = 128;
  const c = k.getContext('2d'); person(c, 64, 152, L, 0, false, L.small ? 2.1 : 1.7);
  return k.toDataURL();
}

// ------------------------------------------------------------------ the village
const solid = Array.from({ length: MH }, () => new Uint8Array(MW));
const block = (x, y) => { if (x >= 0 && y >= 0 && x < MW && y < MH) solid[y][x] = 1; };
const rect = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) block(x, y); };
const POND = { x: 29.5, y: 20.5, rx: 3.7, ry: 2.6 };
// The pond's edge wobbles with the angle, so it is not a perfect oval.
const pondWob = a => 1 + 0.11 * Math.sin(2 * a + 0.8) + 0.07 * Math.sin(3 * a + 2.4) + 0.04 * Math.sin(5 * a + 1.1);
const inPond = (x, y, g = 0) => { const dx = (x - POND.x) / POND.rx, dy = (y - POND.y) / POND.ry; return Math.hypot(dx, dy) < pondWob(Math.atan2(dy, dx)) * (1 + g / 3.1); };
// The stream: it comes in from the east edge of the valley, winds down under a little plank bridge and drops
// over a mossy rock ledge into the pond in a waterfall. Points are tiles; it widens a little toward the fall.
const STREAM = [[36.8, 15.7], [35.6, 16.1], [34.7, 17.0], [34.0, 17.75], [33.35, 18.25]];
const FALL = { x: 33.1, y: 18.5, bx: 32.75, by: 19.8 };   // the lip of the ledge, and where the water lands in the pond
const BRIDGE = { x: 34.6, y: 17.1, a: -0.85 };             // across the stream, for the way down to the wheat strip
function streamPath(c) { c.beginPath(); c.moveTo(STREAM[0][0] * T, STREAM[0][1] * T); for (let i = 1; i < STREAM.length - 1; i++) { const [x0, y0] = STREAM[i], [x1, y1] = STREAM[i + 1]; c.quadraticCurveTo(x0 * T, y0 * T, (x0 + x1) / 2 * T, (y0 + y1) / 2 * T); } const L = STREAM[STREAM.length - 1]; c.lineTo(L[0] * T, L[1] * T); }
function streamPts(step = 0.15) { const out = []; for (let i = 0; i < STREAM.length - 1; i++) { const [x0, y0] = STREAM[i], [x1, y1] = STREAM[i + 1], n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step); for (let j = 0; j < n; j++) out.push([x0 + (x1 - x0) * j / n, y0 + (y1 - y0) * j / n, Math.atan2(y1 - y0, x1 - x0), i]); } return out; }
function pondPath(c, grow, stroke) {
  c.beginPath();
  for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, w = pondWob(a); const px = (POND.x + Math.cos(a) * (POND.rx * w + grow)) * T, py = (POND.y + Math.sin(a) * (POND.ry * w + grow)) * T; i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.closePath(); if (stroke) c.stroke(); else c.fill();
}
const isRoad = (x, y) => (y === 14 && x >= 1 && x <= 34) || (y === 6 && x >= 11 && x <= 30) ||   // the back path: windmill, the top of the village road, church
   (x === 18 && y >= 6 && y <= 30) || (y === 30 && x >= 5 && x <= 31) ||   // the village road runs on down to the bottom road, past Mr. Bohdan's and Taras's cottages
    (x === 7 && y >= 11 && y <= 13) || (x === 28 && y >= 11 && y <= 13) || (x >= 16 && x <= 21 && y >= 15 && y <= 19);

const ents = [];
const STALL = { x: 21.6, y: 12.95 };   // where the market stall stands (its front edge)
// Whether a spot is on the road or within m tiles of it (the road is drawn a little wider than its tiles).
// On a road or path as it's drawn (a little wider than its tiles), or in the soft patch where a road ends.
const ROAD_ENDS = []; for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (isRoad(x, y) && [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([a, b]) => isRoad(x + a, y + b)).length === 1) ROAD_ENDS.push([x + 0.5, y + 0.5]);
const onRoadish = (x, y) => { if (Math.hypot(x - STALL.x, (y - STALL.y + 0.25) / 0.42) < 2.8) return true; for (const dx of [-0.35, 0, 0.35]) for (const dy of [-0.35, 0, 0.35]) if (isRoad(Math.floor(x + dx), Math.floor(y + dy))) return true; return ROAD_ENDS.some(([ex, ey]) => Math.hypot(x - ex, (y - ey) / 0.78) < 1.45); };
const GROWS = new Set(['kvitka', 'hryb', 'malva', 'chornobryvtsi', 'mak', 'soniashnyk', 'pshenytsia']);
const nearRoad = (x, y, m) => { for (const dx of [-m, 0, m]) for (const dy of [-m, 0, m]) if (isRoad(Math.floor(x + dx), Math.floor(y + dy))) return true; return false; };
const ANIMAL_OF = { zhaba: 'frog', kurka: 'hen', piven: 'rooster', svynia: 'pig', kachka: 'duck', korova: 'cow', kin: 'horse', koza: 'goat', sobaka: 'dog' };
const ASIZE = { frog: 0.62, horse: 1.9, cow: 1.5, goat: 1.05, pig: 0.9, dog: 0.85, cat: 0.65, hen: 0.6, rooster: 0.72, duck: 0.55 };
// how long each animal stands about between strolls, in seconds
const IDLE = { cow: [10, 24], horse: [8, 20], goat: [5, 13], pig: [7, 16], dog: [3, 9], cat: [5, 15], hen: [2, 6], rooster: [3, 8], duck: [3, 9], frog: [4, 10] };
const SPEED = { frog: 0.75, horse: 0.5, cow: 0.28, goat: 0.45, pig: 0.35, dog: 0.7, cat: 0.55, hen: 0.4, rooster: 0.45, duck: 0.3 };
function add(e) {
  e.k = e.k || (e.w + ents.length);
  e.s = e.s || 1; e.ic = e.ic || W[e.w].ic;
  ents.push(e);
  if (e.solid) block(Math.floor(e.x), Math.floor(e.y - 0.01));
  return e;
}
(function build() {
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (inPond(x + 0.5, y + 0.5)) block(x, y);
  // Your cottage, garden and fence.
  rect(5, 8, 8, 10);
  add({ w: 'khata', x: 7, y: 11, s: 3.7, kind: 'home' });
  for (let i = 0; i < 6; i++) add({ w: 'horod', k: 'plot' + i, x: 10.1 + (i % 3) * 1.6, y: 8.6 + Math.floor(i / 3) * 1.6, s: 1.5, kind: 'plot', i, flat: true });
  for (let i = 0; i < 4; i++) add({ w: 'parkan', x: 9.5 + i, y: 11.95, s: 1, solid: true, quiet: i !== 1, labelX: 11 });   // one label for the whole fence   // the gap at the end is the garden gate
  add({ w: 'yablunia', x: 3.5, y: 10.8, s: 2.3, solid: true, give: 'yabluko', cd: 60 });
  add({ w: 'krynytsia', x: 14.5, y: 12.9, s: 1.5, solid: true, give: 'voda', cd: 8 });
  // Grandma Olia's corner.
  rect(26, 8, 29, 10);   // (moved 3 tiles right, off the market stall)
  rect(3, 27, 6, 29); add({ w: 'khata', ic: '@khata_bohdan', k: 'bohdanHome', x: 5, y: 30, s: 3.7 });    // Mr. Bohdan's cottage, bottom left, by his bees
  rect(28, 26, 33, 29); add({ w: 'khata', ic: '@khata_taras', k: 'tarasHome', x: 30.8, y: 30, s: 4.5 });  // the family cottage, bottom right, below the pond: Taras, Oksana and Andriiko live here, so it's bigger
  add({ w: 'khata', ic: '@khata_olia', k: 'oliaHome', x: 28, y: 11, s: 3.7 });
  add({ w: 'kurka', x: 25.4, y: 11.9, kind: 'animal', r: 1.1, give: 'yaitse', cd: 90, olias: true });   // Grandma's hens
  add({ w: 'kurka', x: 26.2, y: 12.6, kind: 'animal', r: 1.1, give: 'yaitse', cd: 90, olias: true });
  add({ w: 'piven', x: 25.1, y: 12.95, kind: 'animal', r: 1.2 });
  add({ w: 'kit', x: 22.4, y: 12.3, kind: 'animal', r: 0.8 });
  add({ w: 'kit', x: 12.4, y: 13.2, kind: 'animal', r: 1.2, s: 0.9 });
  add({ w: 'kit', x: 17.2, y: 20.6, kind: 'animal', r: 1.2, s: 0.85 });
  add({ w: 'kit', x: 8.6, y: 15.6, kind: 'animal', r: 1.0, s: 0.8 });
  add({ w: 'svynia', x: 31.7, y: 10.3, kind: 'animal', r: 1.0 });
  // Landmarks.
  rect(29, 3, 31, 5); add({ w: 'tserkva', x: 30.5, y: 6, s: 5.4 });
  add({ w: 'leleka', k: 'nest', x: 21.5, y: 7, s: 2.6, solid: true, hitW: 0.2 });   // the stork's nest on its pole: storks in spring and summer, empty in autumn and winter
  add({ w: 'yizhak', k: 'yizhak', x: 16.5, y: 10.6, s: 0.7, kind: 'crawl', cx: 16.5, cy: 10.6, ph: 0.7, only: ['lito', 'osin', 'vesna'] });   // a hedgehog pottering about by the bushes
  add({ w: 'yizhak', k: 'yizhak_spyt', x: 15.2, y: 10.4, s: 0.9, only: ['zyma'], sleep: true });   // ...and asleep in his leaf pile all winter
  add({ w: 'hodivnychka', k: 'feeder', x: 6.0, y: 12.7, s: 1.6, solid: true, only: ['zyma'] });   // the bird feeder by the cottage in winter
  rect(10, 2, 12, 4); add({ w: 'mlyn', x: 11.5, y: 5, s: 4.5, spin: true });
  // Market square.
  rect(20, 12, 23, 12); add({ w: 'rynok', x: STALL.x, y: STALL.y, s: 4.3, kind: 'shop' });   // the market stall, just above the main road
  rect(18, 17, 19, 18); add({ w: 'fontan', x: 19.0, y: 18.15, s: 3.1 });   // the fountain, right in the middle of the square
  add({ w: 'lavka', ic: '@benchside', x: 16.45, y: 17.9, s: 1.25, solid: true });                 // a bench on the left, facing it
  add({ w: 'lavka', ic: '@benchside', x: 21.55, y: 17.9, s: 1.25, solid: true, flipX: true });   // and one on the right, facing it too
  // Pond.
  add({ w: 'stavok', k: 'pond', x: POND.x, y: POND.y + 0.2, s: 1, kind: 'pond', flat: true });
  for (const [x, y] of streamPts(0.1)) { const tx = Math.floor(x), ty = Math.floor(y); if (Math.hypot(x - BRIDGE.x, y - BRIDGE.y) > 0.75) block(tx, ty); }   // the stream: wade-proof, but the bridge is open
  block(Math.floor(FALL.x), Math.floor(FALL.y)); block(33, 18);   // the rocks of the ledge
  add({ w: 'choven', x: 32.2, y: 22.75, s: 1.4, flat: true });
  add({ w: 'ryba', x: 28.3, y: 21.6, s: 0.8, kind: 'animal', r: 0.8, water: true, give: 'ryba', cd: 60, hide: true });
  add({ w: 'kachka', x: 30.6, y: 19.4, kind: 'animal', r: 1.0, water: true });
  add({ w: 'kachka', x: 28.6, y: 19.9, kind: 'animal', r: 0.8, water: true });
  add({ w: 'zhaba', x: 26.3, y: 23.2, s: 0.7, kind: 'animal', r: 0.5 });
  // Pasture.
  add({ w: 'korova', x: 30.0, y: 12.2, s: 1.4, kind: 'animal', r: 1.3, give: 'moloko', cd: 120, olias: true });   // Grandma's cow
  add({ w: 'kin', x: 32.6, y: 13.0, s: 1.5, kind: 'animal', r: 1.3 });
  add({ w: 'koza', x: 31.0, y: 13.4, s: 1.1, kind: 'animal', r: 0.9 });
  // Ukrainian touches: hollyhocks by the cottages, kalyna bushes, a pysanka basket and a bandura at the market.
  for (const [x, y] of [[5.4, 11.15], [8.6, 11.15], [26.4, 11.15], [29.6, 11.15], [8.8, 19.2]]) add({ w: 'malva', x, y, s: 1.15 });
  for (const [x, y] of [[3.6, 15.4], [31.4, 17.4]]) add({ w: 'kalyna', x, y, s: 1.2, solid: true, give: 'kalyna', cd: 150, hide: true });
  add({ w: 'pysanka', x: STALL.x + 0.8, y: STALL.y + 0.1, s: 0.6 });   // a basket of pysanky on the ground in front of the stall, by the right-hand crate
  for (const [x, y] of [[10.6, 24.1], [11.4, 24.8], [10.9, 25.5], [12.1, 24.4], [11.7, 25.6], [12.5, 25.1]]) add({ w: 'mak', x, y, s: 0.8, give: 'mak', cd: 150, hide: true });           // poppies beside the sunflowers
  for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) add({ w: 'pshenytsia', x: 33.35 + k * 0.72, y: 21.7 + r * 0.75, s: 1.0, give: 'pshenytsia', cd: 150, hide: true, quiet: r + k > 0, labelX: 34.1 });   // a square little field of wheat by the pond
  for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) add({ w: 'pshenytsia', x: 32.6 + k * 0.72 + (r % 2) * 0.3, y: 2.9 + r * 0.75, s: 1.0, give: 'pshenytsia', cd: 150, hide: true, quiet: r + k > 0, labelX: 33.8 });   // and a wheat field beside the church
  for (const [x, y] of [[4.5, 11.5], [24.1, 11.7], [27.2, 11.35], [16.3, 19.7]]) add({ w: 'chornobryvtsi', x, y, s: 0.8 });   // marigolds by the doors
  for (let i = 0; i < 2; i++) add({ w: 'tyn', x: 27.5 + i, y: 10.95, s: 1, solid: true, quiet: i !== 0, labelX: 28, hitLow: 0.4 });   // Grandma's wattle fence
  add({ w: 'prapor', ic: '@praportop', x: 19.0, y: 18.17, s: 2.3, lift: 0.01 });   // the flag flies from the top of the fountain
  add({ w: 'koloda', k: 'koloda', x: 4.75, y: 12.75, s: 1.0, solid: true });   // the chopping block: split firewood
  add({ w: 'doshka', k: 'board', x: 23.6, y: 17.5, s: 1.35, solid: true });   // the notice board: what the next festival needs
  add({ w: 'lastivka', x: 12.6, y: 6.9, s: 0.7, kind: 'fly', cx: 12.6, cy: 6.9, ph: 1.3, swoop: true });
  // The bandura and a wreath lean against the ends of Oksana's market stall.
  add({ w: 'bandura', x: STALL.x - 2.0, y: STALL.y + 0.06, s: 0.95, lean: 0.16 });
  add({ w: 'vinok', x: STALL.x + 2.05, y: STALL.y + 0.06, s: 0.62, lean: -0.12 });
  // Beehives and the sunflower field.
  for (let i = 0; i < 3; i++) add({ w: 'vulyk', x: 4.5 + i * 1.5, y: 19.9, s: 1.3, solid: true });
  for (let i = 0; i < 3; i++) add({ w: 'bdzhola', x: 5 + i * 1.3, y: 18.6, s: 0.5, kind: 'fly', cx: 5 + i * 1.3, cy: 18.6, ph: i * 2.1 });
  for (let y = 23; y <= 25; y++) for (let x = 3; x <= 9; x++) add({ w: 'soniashnyk', x: x + 0.5, y: y + 0.85, s: 1.25, give: 'soniashnyk', cd: 150, hide: true, owner: 'bohdan' });
  // Trees, bushes, stones, flowers, mushrooms, butterflies.
  for (const [x, y] of [[2.5, 6.9], [14.5, 8.0], [23.8, 3.4], [25.5, 4.9], [33.5, 8.9], [2.5, 17.9], [12.5, 25.9], [22.5, 25.9], [33.5, 25.9], [15.5, 2.9], [7.5, 3.9], [27.5, 2.9], [35.7, 19.8], [1.5, 12.9]]) add({ w: 'derevo', ic: '@tree', x, y, s: 2.5, solid: true });
  for (const [x, y] of [[15.5, 9.9], [16.8, 8.7], [3.5, 13.5], [33.5, 15.9], [23.5, 23.9]]) add({ w: 'kushch', x, y, s: 1.1, solid: true });
  for (const [x, y] of [[16.5, 8.1], [32.5, 10.5], [10.5, 17.9]]) add({ w: 'kamin', x, y, s: 0.8, solid: true });
  for (const [x, y] of [[16.3, 8.7], [4.5, 6.5], [22.5, 4.5], [27.5, 6.6], [16.5, 11.6], [9.5, 16.6], [24.5, 16.5], [31.5, 16.4], [12.5, 21.5], [20.5, 22.5]]) add({ w: 'kvitka', x, y, s: 0.8, give: 'kvitka', cd: 90, hide: true });
  for (const [x, y] of [[3.4, 7.5], [15.3, 7.4], [26.4, 5.4], [13.3, 26.3], [32.8, 26.3]]) add({ w: 'hryb', x, y, s: 0.7, give: 'hryb', cd: 120, hide: true });
  for (const [x, y] of [[12, 8], [26, 15.5], [8, 16.5]]) add({ w: 'metelyk', x, y, s: 0.6, kind: 'fly', cx: x, cy: y, ph: x });
  // Nothing that grows stands on a road or path: any flower, mushroom or crop that would is moved onto the grass
  // beside it (checked at its foot and a little above, since it's drawn upward from there).
  for (const e of ents) if (GROWS.has(e.w)) { if (!onRoadish(e.x, e.y) && !onRoadish(e.x, e.y - 0.45)) continue;
    for (const [dx, dy] of [[0, 0.8], [0, -0.8], [0.8, 0], [-0.8, 0], [0, 1.3], [0, -1.3], [1.3, 0], [-1.3, 0], [0.9, 0.9], [-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0, 1.9], [0, -1.9]]) { const nx = e.x + dx, ny = e.y + dy; if (!onRoadish(nx, ny) && !onRoadish(nx, ny - 0.45) && !solid[Math.floor(ny)][Math.floor(nx)]) { e.x = nx; e.y = ny; break; } } }
  // Villagers.
  add({ w: 'khata', k: 'n_oksana', x: STALL.x, y: STALL.y + 0.62, kind: 'npc', npc: 'oksana', s: 1.3 });   // Oksana sweeps in front of her stall
  add({ w: 'khata', k: 'n_taras', x: 25.3, y: 21.2, kind: 'npc', npc: 'taras', s: 1.3 });
  add({ w: 'khata', k: 'n_andriiko', x: 14.5, y: 20.7, kind: 'npc', npc: 'andriiko', s: 1.1 });
  add({ w: 'sobaka', x: 15.4, y: 20.78, kind: 'animal', r: 1.0, fetch: true });   // plays fetch with Andriiko
  add({ w: 'khata', k: 'n_bohdan', x: 9.1, y: 20.4, kind: 'npc', npc: 'bohdan', s: 1.3 });
  for (let i = ents.length - 1; i >= 0; i--) if (ents[i].w === 'kit') ents.splice(i, 1);
  for (const ct of D.cats) if (S.cats[ct.id] !== 1) add({ w: ct.word, k: 'cat_' + ct.id, kind: 'animal', an: 'cat', cat: ct.id, v: ct.v, x: ct.x, y: ct.y, r: 1.3 });
  let ducks = 0;
  for (const e of ents) {
    e.hx = e.x; e.hy = e.y; e.tw = Math.random() * 6; e.st = 'idle'; e.act = 'look'; e.vel = 0; e.wk = 0; e.dip = 0; e.rest = 0; e.face = Math.random() < 0.5 ? -1 : 1; e.fs = e.face;
    if (e.kind === 'animal' && ANIMAL_OF[e.w]) { e.an = ANIMAL_OF[e.w]; if (e.an === 'duck') e.v = ducks++; }
    if (e.an) e.s = ASIZE[e.an];
  }
})();

// The ground is painted once into its own canvas.
const ground = document.createElement('canvas');
const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
function paintGround() {
  ground.width = MW * T; ground.height = MH * T;
  const c = ground.getContext('2d'), GW = ground.width, GH = ground.height, r = seeded(7);
  const onRoad = (x, y) => isRoad(Math.floor(x / T), Math.floor(y / T));
  c.fillStyle = '#8fd169'; c.fillRect(0, 0, GW, GH);
  // broad soft patches of lighter and deeper green, so the meadow is not one flat colour
  for (let i = 0; i < 50; i++) {
    const x = r() * GW, y = r() * GH, R = 130 + r() * 260, lt = r() < 0.5, col = lt ? '184,236,132' : '92,172,82';
    const g = c.createRadialGradient(x, y, 0, x, y, R); g.addColorStop(0, `rgba(${col},${lt ? 0.42 : 0.3})`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.fillRect(x - R, y - R, R * 2, R * 2);
  }
  { const x = 30.5 * T, y = 12.6 * T, R = 4 * T, g = c.createRadialGradient(x, y, T, x, y, R); g.addColorStop(0, 'rgba(196,236,148,.75)'); g.addColorStop(1, 'rgba(196,236,148,0)'); c.save(); c.translate(x, y); c.scale(1, 0.62); c.translate(-x, -y); c.fillStyle = g; c.fillRect(x - R, y - R, R * 2, R * 2); c.restore(); }   // the pasture
  for (let i = 0; i < 600; i++) { c.fillStyle = r() < 0.5 ? 'rgba(116,188,88,.3)' : 'rgba(172,228,130,.3)'; ell(c, r() * GW, r() * GH, 6 + r() * 18, 3 + r() * 7); }
  // Roads: one continuous ribbon with round corners (thick round lines joining the road tiles).
  const road = (w, col) => {
    c.strokeStyle = col; c.lineWidth = w; c.lineCap = c.lineJoin = 'round'; c.beginPath();
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (isRoad(x, y)) {
      const cx = (x + 0.5) * T, cy = (y + 0.5) * T;
      c.moveTo(cx, cy); c.lineTo(cx + 0.01, cy);
      if (isRoad(x + 1, y)) { c.moveTo(cx, cy); c.lineTo(cx + T, cy); }
      if (isRoad(x, y + 1)) { c.moveTo(cx, cy); c.lineTo(cx, cy + T); }
    }
    c.stroke();
  };
  road(T + 26, 'rgba(98,150,70,.15)');
  road(T + 12, '#d4bb82');
  road(T + 4, '#ecd9a6');
  { const sx = STALL.x * T, sy = (STALL.y - 0.25) * T, R = T * 3.1, gr = c.createRadialGradient(sx, sy, 0, sx, sy, R); gr.addColorStop(0, '#e6d29d'); gr.addColorStop(0.5, 'rgba(222,200,146,.85)'); gr.addColorStop(0.8, 'rgba(200,178,120,.3)'); gr.addColorStop(1, 'rgba(200,178,120,0)');
    c.save(); c.translate(sx, sy); c.scale(1, 0.42); c.translate(-sx, -sy); c.fillStyle = gr; c.fillRect(sx - R, sy - R, R * 2, R * 2); c.restore();   // the ground worn bare round the market stall
    for (let i = 0; i < 26; i++) { const a = r() * 7, dd = r() * R * 0.85; c.fillStyle = r() < 0.5 ? 'rgba(205,181,126,.85)' : 'rgba(250,240,208,.75)'; ell(c, sx + Math.cos(a) * dd, sy + Math.sin(a) * dd * 0.4, 2 + r() * 3, 1.4 + r() * 1.8); } }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (isRoad(x, y)) {   // each end of a road or path
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => isRoad(x + dx, y + dy)); if (nb.length !== 1) continue;
    const [dx, dy] = nb[0], cx = (x + 0.5 - dx * 0.35) * T, cy = (y + 0.5 - dy * 0.35) * T, R = T * 1.75;
    const gr = c.createRadialGradient(cx, cy, 0, cx, cy, R); gr.addColorStop(0, '#ecd9a6'); gr.addColorStop(0.38, '#e6d29d'); gr.addColorStop(0.62, 'rgba(212,187,130,.75)'); gr.addColorStop(0.85, 'rgba(190,170,110,.25)'); gr.addColorStop(1, 'rgba(190,170,110,0)');
    c.save(); c.translate(cx, cy); c.scale(1, 0.78); c.translate(-cx, -cy); c.fillStyle = gr; c.fillRect(cx - R, cy - R, R * 2, R * 2); c.restore();
    for (let i = 0; i < 6; i++) { const a = r() * 7, d = r() * R * 0.8; c.fillStyle = r() < 0.5 ? 'rgba(205,181,126,.8)' : 'rgba(250,240,208,.7)'; ell(c, cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.7, 2 + r() * 3, 1.5 + r() * 2); }
  }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (isRoad(x, y)) {
    for (let i = 0; i < 2; i++) { c.fillStyle = 'rgba(250,240,208,.8)'; ell(c, x * T + r() * T, y * T + r() * T, 9 + r() * 9, 4 + r() * 3); }
    for (let i = 0; i < 3; i++) { c.fillStyle = r() < 0.5 ? '#d9c390' : '#cdb57e'; ell(c, x * T + r() * T, y * T + r() * T, 2 + r() * 2.5, 1.5 + r() * 1.5); }
  }
  // tufts of grass
  c.lineCap = 'round';
  for (let i = 0; i < 1700; i++) {
    const x = r() * GW, y = r() * GH, dk = r() < 0.55, h = 6 + r() * 6;
    if (onRoadish(x / T, y / T) || inPond(x / T, y / T, 0.45)) continue;
    c.strokeStyle = dk ? '#6bb552' : '#b4e88a'; c.lineWidth = 2; c.beginPath();
    for (let j = -1; j <= 1; j++) { c.moveTo(x + j * 3, y); c.quadraticCurveTo(x + j * 4, y - h * 0.6, x + j * 6.5, y - h - (j ? 0 : 3)); }
    c.stroke();
  }
  // little meadow flowers with petals
  for (let i = 0; i < 300; i++) {
    const x = r() * GW, y = r() * GH, col = ['#ffffff', '#ffe36e', '#ffb3c7', '#d9c2ff'][Math.floor(r() * 4)], pr = 2 + r() * 1.2;
    if (onRoadish(x / T, y / T) || inPond(x / T, y / T, 0.45)) continue;
    c.fillStyle = col; for (let k = 0; k < 5; k++) circ(c, x + Math.cos(k * 1.257) * pr, y + Math.sin(k * 1.257) * pr, pr * 0.85);
    c.fillStyle = col === '#ffe36e' ? '#f08a2c' : '#ffd23f'; circ(c, x, y, pr * 0.7);
  }
  // The stream: damp grass, a pebbly bank, then running water, painted before the pond so they join.
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = 'rgba(88,156,76,.32)'; c.lineWidth = T * 1.5; streamPath(c); c.stroke();
  c.strokeStyle = '#d9c590'; c.lineWidth = T * 1.12; streamPath(c); c.stroke();
  c.strokeStyle = '#bba676'; c.lineWidth = T * 0.92; streamPath(c); c.stroke();
  c.strokeStyle = '#4fa8dc'; c.lineWidth = T * 0.72; streamPath(c); c.stroke();
  c.strokeStyle = '#7ccbef'; c.lineWidth = T * 0.36; streamPath(c); c.stroke();
  { const r = seeded(77); for (const [x, y, a] of streamPts(0.35)) for (const sd of [-1, 1]) { if (r() < 0.45) continue; const px = (x - Math.sin(a) * 0.5 * sd) * T, py = (y + Math.cos(a) * 0.5 * sd) * T, rr2 = 2.5 + r() * 3; c.fillStyle = ['#a7a29a', '#bdb8ae', '#8f8a82'][(r() * 3) | 0]; ell(c, px, py, rr2 * 1.3, rr2); } }   // pebbles along the banks
  // The pond: damp grass, a sandy bank, wet sand, then water that deepens toward the middle.
  c.fillStyle = 'rgba(88,156,76,.32)'; pondPath(c, 0.55);
  c.fillStyle = '#e6d39b'; pondPath(c, 0.36);
  c.fillStyle = '#cfb97f'; pondPath(c, 0.13);
  { const x = POND.x * T, y = POND.y * T, g = c.createRadialGradient(x, y, T * 0.4, x, y, POND.rx * T * 1.2); g.addColorStop(0, '#3f9cd4'); g.addColorStop(0.55, '#5fbbe6'); g.addColorStop(1, '#93dbf3'); c.fillStyle = g; pondPath(c, 0); }
  c.strokeStyle = 'rgba(255,255,255,.2)'; c.lineWidth = 12; pondPath(c, -0.16, true);
  c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 3; pondPath(c, -0.03, true);
  for (const [x, y, fl] of [[27.2, 21.9, 0], [31.6, 19.2, 1], [32.3, 21.3, 0]]) {   // lily pads
    c.save(); c.translate(x * T, y * T); c.scale(1, 0.58);
    c.fillStyle = '#3f9a52'; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 16, 0.4, 5.95); c.closePath(); c.fill();
    c.fillStyle = '#62c06a'; c.beginPath(); c.moveTo(0, 0); c.arc(-1, -1.5, 12, 0.5, 5.8); c.closePath(); c.fill();
    c.restore();
    if (fl) { c.fillStyle = '#ffb3d1'; for (let k = 0; k < 6; k++) ell(c, x * T + Math.cos(k * 1.047) * 5, y * T - 4 + Math.sin(k * 1.047) * 3, 4, 2.6); c.fillStyle = '#ffe36e'; circ(c, x * T, y * T - 4, 2.4); }
  }
}
paintGround();
// A phone can throw a big canvas's pixels away while the page is in the background or memory is tight; then the
// ground draws as nothing and the screen smears. Check on return, and paint it again if it went blank.
function groundOk() { try { const d = ground.getContext('2d').getImageData(ground.width >> 1, ground.height >> 1, 1, 1).data; return d[3] > 0; } catch (e) { return false; } }
const checkGround = () => { if (!groundOk()) paintGround(); };
document.addEventListener('visibilitychange', () => { if (!document.hidden) checkGround(); });
addEventListener('pageshow', checkGround); addEventListener('focus', checkGround);
ground.addEventListener('contextlost', e => e.preventDefault()); ground.addEventListener('contextrestored', paintGround);
cv.addEventListener('contextlost', e => e.preventDefault()); cv.addEventListener('contextrestored', () => { paintGround(); });

// A soft cloud shadow, painted once, that drifts across the village. (The sunlight itself is the #light
// layer in the page, which costs nothing per frame.)
const cloudSpr = document.createElement('canvas');
(function paintCloud() {
  cloudSpr.width = 256; cloudSpr.height = 128; const c = cloudSpr.getContext('2d'); let g;
  for (const [x, y, R] of [[80, 70, 56], [140, 56, 52], [186, 74, 46], [120, 84, 40]]) { g = c.createRadialGradient(x, y, R * 0.3, x, y, R); g.addColorStop(0, 'rgba(20,50,45,.5)'); g.addColorStop(1, 'rgba(20,50,45,0)'); c.fillStyle = g; c.fillRect(x - R, y - R, R * 2, R * 2); }
})();
// Glints on the water and reeds at its edge.
const GLINTS = (() => { const r = seeded(31), a = []; for (let i = 0; i < 80 && a.length < 13; i++) { const x = POND.x + (r() * 2 - 1) * POND.rx, y = POND.y + (r() * 2 - 1) * POND.ry; if (inPond(x, y, -0.7)) a.push([x, y]); } return a; })();
const REEDS = [3.55, 3.8, 4.75, 5.0, 5.85, 1.75, 2.05].map(a => { const w = pondWob(a) * 0.97; return [POND.x + Math.cos(a) * POND.rx * w, POND.y + Math.sin(a) * POND.ry * w, a]; });
// The same meadow under snow, or turned golden in autumn (made once, then reused).
let groundW = null, groundA = null;
function tintGround(op, col, over) { const g = document.createElement('canvas'); g.width = ground.width; g.height = ground.height; const c = g.getContext('2d'); c.drawImage(ground, 0, 0); c.globalCompositeOperation = op; c.fillStyle = col; c.fillRect(0, 0, g.width, g.height); c.globalCompositeOperation = 'source-over'; if (over) { c.fillStyle = over; c.fillRect(0, 0, g.width, g.height); } return g; }
function seasonGround() { const s = season(); if (s !== 'zyma') groundW = null; if (s !== 'osin') groundA = null;   // a phone shouldn't hold big ground copies it isn't using
  if (s === 'zyma') return groundW || (groundW = tintGround('screen', 'rgb(176,186,210)', 'rgba(248,251,255,.55)')); if (s === 'osin') return groundA || (groundA = tintGround('multiply', 'rgb(255,218,156)', null)); return ground; }
// Winter: the pond freezes over, and the flowers, wheat, butterflies, bees, frogs and ducks are gone (the
// stork and the swallows have flown south).
const WINTER_GONE = new Set(['kvitka', 'soniashnyk', 'mak', 'pshenytsia', 'hryb', 'malva', 'chornobryvtsi', 'metelyk', 'bdzhola', 'ryba', 'zhaba', 'kachka', 'lastivka']);
// Some things only appear in some seasons: e.only lists them (the hedgehog's winter leaf pile, the bird feeder).
const goneNow = e => e.asleep || (NIGHT_GONE.has(e.w) && nightNow()) || (e.only && !e.only.includes(season())) || (winter() && (WINTER_GONE.has(e.w) || e.water));
function drawIce(c, t) {
  const x = POND.x * T, y = POND.y * T, rx = POND.rx * T, ry = POND.ry * T;
  c.fillStyle = 'rgba(214,234,248,.92)'; ell(c, x, y, rx * 1.02, ry * 1.02);
  c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3; c.lineCap = 'round';
  for (let i = 0; i < 6; i++) { const a = i * 1.1, px = x + Math.cos(a) * rx * 0.5, py = y + Math.sin(a) * ry * 0.45; c.beginPath(); c.moveTo(px - 30, py - 6); c.lineTo(px + 34, py + 8); c.stroke(); }
  c.strokeStyle = 'rgba(150,180,205,.5)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x - rx * 0.4, y); c.lineTo(x - rx * 0.1, y + ry * 0.2); c.lineTo(x + rx * 0.2, y + ry * 0.05); c.stroke();
}
function drawWater(c, t) {
  c.lineCap = 'round'; c.lineWidth = 2.2;
  for (let i = 0; i < GLINTS.length; i++) {
    const a = 0.5 + 0.5 * Math.sin(t * 1.4 + i * 1.9); if (a < 0.15) continue;
    const x = GLINTS[i][0] * T + Math.sin(t * 0.5 + i) * 7, y = GLINTS[i][1] * T, w = 8 + 7 * a;
    c.strokeStyle = `rgba(255,255,255,${0.55 * a})`; c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(x, y - 2.5, x + w, y); c.stroke();
  }
  for (const [rx, ry, a] of REEDS) {
    const x = rx * T, y = ry * T;
    c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, y + 1, 13 + Math.sin(t * 1.6 + a) * 1.5, 3.5, 0, 0, 7); c.stroke();
    for (let j = -1; j <= 1; j++) {
      const h = 32 + ((j + 2) * 7 + a * 5) % 13, sw = Math.sin(t * 1.3 + a * 3 + j) * 4, bx = x + j * 7;
      c.strokeStyle = j ? '#4f9a4c' : '#6cb85f'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(bx, y); c.quadraticCurveTo(bx + sw * 0.3, y - h * 0.6, bx + sw, y - h); c.stroke();
      if (j) { c.fillStyle = '#7a4a26'; c.save(); c.translate(bx + sw, y - h); c.rotate(sw * 0.03); rr(c, -2.7, -11, 5.4, 12, 2.7); c.restore(); }
    }
  }
}
// The waterfall and the running stream, drawn every frame over the ground. In winter it all freezes: the
// stream turns to ice and the fall hangs in icicles.
const STREAM_PTS = streamPts(0.12);
const FALLFX = { drops: [], rings: [], lt: 0 };   // the splash at the foot of the waterfall
function drawFalls(c, t) {
  { const vw = cv.width / zoom, vh = cv.height / zoom; if (31.5 * T > camX + vw || 37.5 * T < camX || 14.8 * T > camY + vh || 21 * T < camY) { FALLFX.lt = t; return; } }   // off screen: nothing to draw
  const L = skyLight(S.clock.t), lx = FALL.x * T, ly = FALL.y * T, bx = FALL.bx * T, by = FALL.by * T, frozen = winter();
  // the stream: in summer, ripples sliding downhill; in winter, a pale sheet of ice
  if (frozen) { c.lineCap = 'round'; c.strokeStyle = 'rgba(225,238,250,.95)'; c.lineWidth = T * 0.74; streamPath(c); c.stroke(); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2; streamPath(c); c.stroke(); }
  else { c.lineCap = 'round'; for (let i = 0; i < STREAM_PTS.length; i += 2) { const [x, y, a] = STREAM_PTS[i], ph = (t * 1.6 - i * 0.12) % 1, al = Math.sin((ph < 0 ? ph + 1 : ph) * Math.PI) * 0.6, off = Math.sin(i * 2.3) * 0.18;
      c.strokeStyle = `rgba(255,255,255,${al})`; c.lineWidth = 1.6; const px = (x - Math.sin(a) * off) * T, py = (y + Math.cos(a) * off) * T; c.beginPath(); c.moveTo(px - Math.cos(a) * 5, py - Math.sin(a) * 5); c.lineTo(px + Math.cos(a) * 5, py + Math.sin(a) * 5); c.stroke(); } }
  // the little plank bridge, with a rail each side
  { c.save(); c.translate(BRIDGE.x * T, BRIDGE.y * T); c.rotate(BRIDGE.a);
    c.fillStyle = 'rgba(40,30,20,.25)'; c.fillRect(-T * 0.62, -T * 0.42, T * 1.24, T * 0.9);
    for (let i = 0; i < 7; i++) { c.fillStyle = i % 2 ? '#a8743f' : '#b9824a'; c.fillRect(-T * 0.6 + i * T * 0.172, -T * 0.4, T * 0.16, T * 0.8); c.fillStyle = 'rgba(60,35,15,.35)'; c.fillRect(-T * 0.6 + i * T * 0.172, -T * 0.4, T * 0.016, T * 0.8); }
    c.fillStyle = '#7a4e26'; c.fillRect(-T * 0.62, -T * 0.46, T * 1.24, T * 0.07); c.fillRect(-T * 0.62, T * 0.39, T * 1.24, T * 0.07);
    for (const xx of [-0.58, 0, 0.55]) { c.fillRect(xx * T - 2, -T * 0.5, 4, T * 0.12); c.fillRect(xx * T - 2, T * 0.36, 4, T * 0.12); }
    if (frozen) { c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(-T * 0.6, -T * 0.3, T * 1.2, T * 0.6); }   // snow on the planks, the edges showing
    c.restore(); }
  // the ledge: mossy grey rocks the water spills over
  const rock = (x, y, r, col) => { c.fillStyle = 'rgba(30,40,30,.25)'; ell(c, x + r * 0.2, y + r * 0.55, r * 1.05, r * 0.4); c.fillStyle = col; ell(c, x, y, r * 1.1, r * 0.8); c.fillStyle = 'rgba(255,255,255,.18)'; ell(c, x - r * 0.3, y - r * 0.3, r * 0.45, r * 0.25); if (!frozen) { c.fillStyle = 'rgba(80,140,60,.7)'; ell(c, x - r * 0.1, y - r * 0.6, r * 0.6, r * 0.22); } else { c.fillStyle = '#ffffff'; ell(c, x - r * 0.05, y - r * 0.62, r * 0.75, r * 0.26); } };
  rock(lx - T * 0.66, ly - T * 0.08, T * 0.36, '#8f8b84'); rock(lx + T * 0.58, ly - T * 0.18, T * 0.32, '#9a968e');   // the cliff each side of the fall, rocks stepping down
  rock(lx - T * 0.62, ly + T * 0.42, T * 0.32, '#86827b'); rock(lx + T * 0.52, ly + T * 0.38, T * 0.34, '#918d86'); rock(lx - T * 0.55, ly + T * 0.85, T * 0.24, '#7f7b74'); rock(lx + T * 0.42, ly + T * 0.82, T * 0.26, '#8a867f');
  // the water sheet falling from the lip down into the pond: bright at the top, streaked, foaming at the foot
  const top = ly - T * 0.12, bot = by, wTop = T * 0.72, wBot = T * 0.95;
  if (frozen) {
    c.fillStyle = 'rgba(220,236,250,.95)'; poly(c, [[lx - wTop / 2, top], [lx + wTop / 2, top], [bx + wBot / 2, bot - T * 0.1], [bx - wBot / 2, bot - T * 0.1]]);
    c.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i < 9; i++) { const q = (i + 0.5) / 9, x = lx - wTop / 2 + q * wTop + (bx - lx) * 0.6, y0 = top + (bot - top) * 0.5, ln = T * (0.25 + ((i * 37) % 5) * 0.08); poly(c, [[x - 3, y0], [x + 3, y0], [x, y0 + ln]]); }   // icicles
  } else {
    const g = c.createLinearGradient(0, top, 0, bot); g.addColorStop(0, 'rgba(235,250,255,.95)'); g.addColorStop(0.5, 'rgba(160,220,245,.85)'); g.addColorStop(1, 'rgba(240,252,255,.95)');
    c.fillStyle = g; c.beginPath(); c.moveTo(lx - wTop / 2, top); c.quadraticCurveTo(lx - wTop / 2 - T * 0.05, (top + bot) / 2, bx - wBot / 2, bot); c.lineTo(bx + wBot / 2, bot); c.quadraticCurveTo(lx + wTop / 2 + T * 0.05, (top + bot) / 2, lx + wTop / 2, top); c.closePath(); c.fill();
    c.save(); c.clip(); c.lineCap = 'round';
    for (let i = 0; i < 11; i++) { const q = (i + 0.5) / 11, sp = 0.9 + ((i * 7) % 5) * 0.12; for (let j = 0; j < 2; j++) { const ph = ((t * sp + i * 0.37 + j * 0.5) % 1), y = top + (bot - top) * ph, x = lx - wTop / 2 + q * wTop + (bx - lx) * ph + (wBot - wTop) * (q - 0.5) * ph;
      c.strokeStyle = `rgba(255,255,255,${0.75 * Math.sin(ph * Math.PI)})`; c.lineWidth = 1.8; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (bx - lx) * 0.08, y + T * 0.22); c.stroke(); } }
    c.restore();
    c.fillStyle = 'rgba(255,255,255,.9)'; ell(c, lx, top + 1, wTop * 0.55, T * 0.08);   // the bright lip where it spills
    // foam where it lands, rings spreading into the pond, mist drifting up, and the odd sparkle
    // the splash where it lands: churning white water, droplets jumping up at random and falling back, and small
    // uneven rings popping out here and there across the foot of the fall (no neat circles going round)
    const dtF = Math.min(0.05, Math.max(0, t - (FALLFX.lt || t))); FALLFX.lt = t;
    if (Math.random() < dtF * 26) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, sp = T * (0.9 + Math.random() * 1.6); FALLFX.drops.push({ x: bx + (Math.random() - 0.5) * wBot * 0.9, y: bot + T * 0.04, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 1.5 + Math.random() * 2.5, t0: t }); }
    if (Math.random() < dtF * 3.2) FALLFX.rings.push({ x: bx + (Math.random() - 0.5) * wBot * 1.3 - T * 0.15, y: bot + T * (0.08 + Math.random() * 0.25), s: 0.5 + Math.random() * 0.7, sq: 0.25 + Math.random() * 0.2, t0: t, life: 0.7 + Math.random() * 0.8 });
    FALLFX.rings = FALLFX.rings.filter(r => t - r.t0 < r.life).slice(-14);
    for (const r of FALLFX.rings) { const q = (t - r.t0) / r.life; c.strokeStyle = `rgba(255,255,255,${0.6 * (1 - q)})`; c.lineWidth = 1.5; c.beginPath(); c.ellipse(r.x, r.y, T * r.s * (0.15 + q * 0.6), T * r.s * (0.15 + q * 0.6) * r.sq, 0, 0, 7); c.stroke(); }
    for (let i = 0; i < 7; i++) { const jx = Math.sin(t * (5 + i) + i * 2.3) * wBot * 0.32 + Math.sin(t * 13 + i) * 2, jy = Math.abs(Math.sin(t * (7 + i * 1.3) + i)) * T * 0.07, r = 3.5 + 2.5 * Math.abs(Math.sin(t * 9 + i * 3)); c.fillStyle = 'rgba(255,255,255,.85)'; circ(c, bx + jx, bot - jy, r); }   // the churning foam, each bubble bobbing on its own
    FALLFX.drops = FALLFX.drops.filter(d => t - d.t0 < 0.7 && d.y < bot + T * 0.3).slice(-60);
    for (const d of FALLFX.drops) { d.vy += T * 5.5 * dtF; d.x += d.vx * dtF; d.y += d.vy * dtF; c.fillStyle = `rgba(255,255,255,${0.9 * (1 - (t - d.t0) / 0.7)})`; circ(c, d.x, d.y, d.r); }
    for (let i = 0; i < 6; i++) { const q = ((t * 0.3 + i / 6) % 1); c.fillStyle = `rgba(255,255,255,${0.28 * Math.sin(q * Math.PI)})`; circ(c, bx + Math.sin(i * 2.1 + t * 0.5) * T * 0.5, bot - q * T * 0.9, T * (0.12 + q * 0.25)); }
    if (L.dark < 0.4) for (let i = 0; i < 3; i++) { const q = ((t * 0.9 + i * 0.33) % 1), sx = bx + Math.sin(i * 4.1) * T * 0.4, sy = bot - T * 0.2 - Math.cos(i * 2.7) * T * 0.3; c.fillStyle = `rgba(255,255,255,${Math.sin(q * Math.PI)})`; star4(c, sx, sy, 3 + 4 * Math.sin(q * Math.PI)); }
    if (S.wx === 'sun' && L.dark < 0.3) { c.save(); c.globalAlpha = 0.22; c.lineWidth = 3; ['#e2574c', '#f2a23a', '#f2d23a', '#6cc04a', '#3d7cc2', '#7a52b3'].forEach((col, i) => { c.strokeStyle = col; c.beginPath(); c.arc(bx + T * 0.1, bot + T * 0.2, T * (0.55 + i * 0.07), Math.PI * 1.15, Math.PI * 1.75); c.stroke(); }); c.restore(); }   // a little rainbow in the spray
  }
  rock(lx - T * 0.25, top + T * 0.02, T * 0.2, '#a29e96');   // a stone in the lip that splits the flow
}
// Chimney smoke: soft puffs that rise, drift and fade.
function smoke(c, x, y, t, k) {
  for (let i = 0; i < 5; i++) { const f = (t * 0.15 + i / 5) % 1; c.fillStyle = `rgba(255,255,255,${0.55 * (1 - f) * Math.min(1, f * 6)})`; circ(c, x + (Math.sin(f * 5 + i) * 7 + f * 26) * k, y - f * 70 * k, (5 + f * 13) * k); }
}

// ------------------------------------------------------------------ little effects
// Dust at your feet, sparkles and the thing itself floating up when you pick something, hearts, tap rings.
// Positions are in tiles.
const fx = [];
// Optional finery. On a slow phone the game turns these off by itself to stay smooth (see frame()).
// A soft round shadow (drawn once, then stretched under everything that stands on the grass).
const SOFT_SHADOW = (() => { const k = document.createElement('canvas'); k.width = 128; k.height = 64; const c = k.getContext('2d'), g = c.createRadialGradient(64, 32, 0, 64, 32, 64); g.addColorStop(0, 'rgba(30,40,20,.9)'); g.addColorStop(0.55, 'rgba(30,40,20,.45)'); g.addColorStop(1, 'rgba(30,40,20,0)'); c.save(); c.scale(1, 0.5); c.fillStyle = g; c.fillRect(0, 0, 128, 128); c.restore(); return k; })();
const GFX = window.__gfx = { cloud: 1, water: 1, smoke: 1, motes: 1, sway: 1 };
function fxAdd(o) { if (fx.length < 160) fx.push(Object.assign({ a: 0, life: 0.6, vx: 0, vy: 0, g: 0, s: 6, d: 0 }, o)); }
function fxDust(x, y) { for (let i = 0; i < 2; i++) fxAdd({ k: 'dust', x: x + rnd(-0.1, 0.1), y: y - 0.02, vx: rnd(-0.25, 0.25), vy: rnd(-0.35, -0.1), life: rnd(0.35, 0.55), s: rnd(4, 7) }); }
function fxBurst(x, y, ic) {
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 + rnd(-0.2, 0.2), v = rnd(1.1, 2.3); fxAdd({ k: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.8, g: 3, life: rnd(0.45, 0.8), s: rnd(5, 9), col: pick(['#ffd23f', '#fff3b0', '#ff9f43', '#ffffff']) }); }
  if (ic) fxAdd({ k: 'icon', ic, x, y, vy: -1.2, life: 1.1, s: 36 });
}
function fxHearts(x, y) { for (let i = 0; i < 6; i++) fxAdd({ k: 'icon', ic: '❤️', x: x + rnd(-0.4, 0.4), y: y - rnd(0, 0.4), vx: rnd(-0.3, 0.3), vy: rnd(-1.4, -0.8), life: rnd(0.8, 1.3), s: rnd(15, 23), d: i * 0.07 }); }
function fxTap(x, y, hit, e) {
  if (hit && e) {
    const s0 = Math.max(0.7, Math.min(3, e.s || 1)), cy = e.flat ? e.y : e.y - s0 * 0.45, R = s0 * 0.62;
    fxAdd({ k: 'halo', x, y: cy, life: 0.5, s: R * T });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.random() * 0.6, r = R * (0.75 + Math.random() * 0.35); fxAdd({ k: 'spark', x: x + Math.cos(a) * r, y: cy + Math.sin(a) * r * 0.85, life: 0.42, s: 4 + Math.random() * 3, d: i * 0.03 }); }
    return;
  }
  fxAdd({ k: 'ring', x, y, life: 0.45, s: hit ? 34 : 24 });
  for (let i = 0; i < (hit ? 6 : 3); i++) { const a = i / (hit ? 6 : 3) * Math.PI * 2 + Math.random() * 0.5; fxAdd({ k: 'dust', x, y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 0.8 - 0.3, life: 0.45, s: 4 }); }   // a little puff
  if (hit) for (let i = 0; i < 3; i++) fxAdd({ k: 'star', x: x + (Math.random() - 0.5) * 0.8, y: y - 0.4 - Math.random() * 0.6, vy: -0.8, life: 0.55, s: 5, col: ['#ffd23f', '#ffffff', '#ffb6c8'][i] });
}
function fxUpdate(dt) {
  for (let i = fx.length - 1; i >= 0; i--) { const p = fx[i]; if (p.d > 0) { p.d -= dt; continue; } p.a += dt; if (p.a >= p.life) { fx.splice(i, 1); continue; } p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
}
const star4 = (c, x, y, R) => { c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, q = i % 2 ? R * 0.36 : R; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); c.fill(); };
function fxDraw(c) {
  for (const p of fx) {
    if (p.d > 0) continue;
    const f = p.a / p.life, x = p.x * T, y = p.y * T;
    if (p.k === 'dust') { c.fillStyle = `rgba(206,188,142,${0.55 * (1 - f)})`; circ(c, x, y, p.s * (0.6 + f)); }
    else if (p.k === 'star') { c.globalAlpha = 1 - f * f; c.fillStyle = p.col; star4(c, x, y, p.s * (1 - f * 0.5)); c.globalAlpha = 1; }
    else if (p.k === 'halo') { const a = Math.sin(Math.min(1, f * 1.6) * Math.PI) * 0.55, g = c.createRadialGradient(x, y, 0, x, y, p.s * (0.85 + f * 0.3));
      g.addColorStop(0, `rgba(255,250,225,${a})`); g.addColorStop(0.55, `rgba(255,232,150,${a * 0.45})`); g.addColorStop(1, 'rgba(255,232,150,0)');
      c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(x - p.s * 1.2, y - p.s * 1.2, p.s * 2.4, p.s * 2.4); c.restore(); }
    else if (p.k === 'spark') { const k = Math.sin(f * Math.PI); c.globalAlpha = k; c.fillStyle = '#fff6c8'; star4(c, x, y, p.s * (0.4 + k)); c.fillStyle = '#ffffff'; circ(c, x, y, p.s * 0.22 * k); c.globalAlpha = 1; }
    else if (p.k === 'ring') { c.strokeStyle = `rgba(255,255,255,${0.9 * (1 - f)})`; c.lineWidth = 3.5 * (1 - f) + 0.5; c.beginPath(); c.ellipse(x, y, p.s * (0.3 + f), p.s * (0.3 + f) * 0.55, 0, 0, 7); c.stroke(); }
    else if (p.k === 'icon') { const pop = Math.min(1, p.a / 0.15); c.globalAlpha = f > 0.6 ? 1 - (f - 0.6) / 0.4 : 1; drawIcon(c, p.ic, x, y, p.s * (0.5 + 0.5 * pop)); c.globalAlpha = 1; }
  }
}

// ------------------------------------------------------------------ animals, drawn and walking
// Side-view animals with real legs. Sizes are relative to the villagers (a horse stands taller than a
// person, a hen comes up to the knee). Legs swing with the distance walked, so nothing slides or hops.
// L body length, B body height, G leg length, neck [forward, up], head [long radius, short radius].
const QUAD = {
  horse: { k: 1.3, L: 62, B: 26, G: 34, col: '#9a5b34', far: '#7a4526', dark: '#4a2a14', neck: [14, 28], head: [15, 7.5], hrot: 0.6, tail: 'hair', mane: true, hoof: '#3b2a1e', ear: 'up', graze: true, muzzle: '#6e3f24', shape: 'horse', long: true, forelock: true, blaze: '#fff3e0', shade: 'rgba(0,0,0,.1)', amp: 0.42 },
  cow: { k: 1.2, L: 64, B: 32, G: 22, col: '#fffaf0', far: '#d8d0c0', dark: '#2d2a2a', neck: [9, 7], head: [14, 10], hrot: 0.3, tail: 'tuft', horns: 'cow', udder: true, hoof: '#3b2a1e', ear: 'side', graze: true, shape: 'cow', rest: true, chew: true, amp: 0.34, shade: 'rgba(0,0,0,.07)', patches: [[-14, -6, 12], [10, 5, 9], [25, -8, 7]], muzzle: '#f4b6b0' },
  goat: { k: 1, L: 38, B: 20, G: 20, col: '#f3ead7', far: '#d1c5a8', dark: '#a8956e', neck: [8, 13], head: [10, 6.5], hrot: 0.35, tail: 'stub', horns: 'goat', beard: true, hoof: '#5b4636', ear: 'side', graze: true, chew: true },
  pig: { k: 1, L: 44, B: 27, G: 11, col: '#f6b0b8', far: '#e39aa6', dark: '#d77f90', neck: [3, -2], head: [12, 11], hrot: 0.1, tail: 'curl', snout: true, ear: 'flop', hoof: '#b8697b', rest: true, doze: true, amp: 0.3 },
  dog: { k: 1, L: 36, B: 17, G: 16, col: '#c98a4a', far: '#a56c34', dark: '#7a4b22', neck: [6, 8], head: [9.5, 8], hrot: 0.1, tail: 'wag', ear: 'flop', patches: [[-8, -2, 7]], muzzle: '#fff3e0', nose: true, rest: true },
};
// The eight cats of the valley. Each also has a sitting portrait (see cat() by the title screen).
const VAR = {
  rudyi: { col: '#f0a24c', far: '#d98a36', dark: '#c26f22', eye: '#7bc47f', stripes: true },
  chornyi: { col: '#3d373c', far: '#2c272b', dark: '#1d191c', eye: '#f2c230' },
  bilyi: { col: '#fffdf8', far: '#e2dbcf', dark: '#cfc7b8', eye: '#5aa9e6' },
  siryi: { col: '#9a9aa2', far: '#80808a', dark: '#66666f', eye: '#e6b43a' },
  smuhastyi: { col: '#b89a74', far: '#9c805c', dark: '#5e4830', eye: '#7bc47f', stripes: true },
  rudobilyi: { col: '#fffdf8', far: '#e2dbcf', dark: '#cfc7b8', eye: '#7bc47f', patches: [[-7, -3, 7, '#f0a24c'], [8, 1, 5, '#f0a24c']], headPatch: '#f0a24c' },
  chornobila: { col: '#3d373c', far: '#2c272b', dark: '#1d191c', eye: '#7bc47f', patches: [[3, 5, 6, '#fffdf8']], muzzle: '#fffdf8' },
  trykolirna: { col: '#fffdf8', far: '#e2dbcf', dark: '#cfc7b8', eye: '#e6b43a', patches: [[-7, -3, 6, '#f0a24c'], [6, 2, 5, '#3d373c']], headPatch: '#f0a24c' },
};
const catQuad = v => Object.assign({ k: 1, L: 30, B: 13, G: 12, neck: [4, 6], head: [8, 7.5], hrot: 0, tail: 'cat', ear: 'point', nose: true, hoof: null, rest: true, doze: true }, VAR[v]);
// The same cat indoors as out in the village (catQuad): same coat, stripes, patches and eyes.
function sitPal(v) {
  const V = VAR[v], tri = v === 'trykolirna', rb = v === 'rudobilyi';
  if (rb) return { body: V.col, a: '#f0a24c', b: '#f0a24c', eye: V.eye, chub: 1, fluffy: false, bib: false, tail: V.col, earR: 'a', pb: [[-12, -38, 11, 'a'], [12, -24, 7, 'a']], ph: [[11, -82, 10, 'a']] };
  return {
    body: V.col, a: tri ? '#f0a24c' : V.dark, b: tri ? '#3d373c' : V.dark, eye: V.eye, chub: 1, fluffy: false, bib: v === 'chornobila', tail: V.col, earR: tri ? 'a' : 'body',
    stripes: V.stripes ? V.dark : null,
    pb: tri ? [[-10, -36, 10, 'a'], [10, -22, 8, 'b']] : [],
    ph: tri ? [[11, -82, 10, 'a']] : [],
  };
}
// Tabby stripes across a sitting cat's flanks (inside the body clip).
function sitStripes(c, C, ch) {
  c.strokeStyle = C.stripes; c.lineWidth = 4.5;
  for (const dir of [-1, 1]) for (let i = 0; i < 3; i++) { const y = -46 + i * 11; c.beginPath(); c.moveTo(dir * 29 * ch, y - 2); c.quadraticCurveTo(dir * 20 * ch, y, dir * 13 * ch, y + 4); c.stroke(); }
  c.strokeStyle = INK; c.lineWidth = 3.2;
}
for (const v in VAR) DRAW['cat_' + v] = c => cat(c, 0, -2, 94, sitPal(v), 0, 0, 1);

// Andriiko and his dog play fetch. He winds up and throws a blue-and-yellow ball; the dog runs after it,
// picks it up, trots back, drops it at his feet and waits; he scoops it up and throws again.
// Phases: hold > wind > throw > fly (ball in the air, dog already running) > roll > (dog arrives) pick > back > drop > wait > scoop > hold.
const FETCH = { ph: 'hold', t: 0, wait: 1.5, arm: 0.15, on: 'hand', bx: 0, by: 0, bz: 0, ax: 0, ay: 0, tx: 0, ty: 0, dur: 1, peak: 60, z0: 30, dip: false, boy: null };
// Oksana sweeps along the front of her stall: a few steps one way, a pause, then back. Both hands are on
// the broom (the upper one near her chest, the lower one at her hip), the bristles swish ahead of her
// and every stroke kicks up a little cloud of dust. She stands still while you are talking to her.
const OKS = { home: null, dir: 1, walk: 0, legs: 0, w: 0, pause: 1, dust: [], prev: 0 };
function oksPose(t) {   // arm angles, hand and bristle positions in her own (unmirrored) pixels
  const O = OKS, sw = Math.sin(O.w), sp = O.walk;
  const bob = -sp * Math.abs(Math.sin(O.legs)) * 2.6 + (1 - sp) * Math.sin((t + 19.5) * 2) * 0.8;
  const aL = -1.45 + 0.1 * sw, aR = 0.15 + 0.34 * sw;
  const HL = [-15.5 - 19 * Math.sin(aL), -47 + bob + 19 * Math.cos(aL)], HR = [15.5 - 19 * Math.sin(aR), -47 + bob + 19 * Math.cos(aR)];
  const dx = HR[0] - HL[0], dy = HR[1] - HL[1], d = Math.hypot(dx, dy), ux = dx / d, uy = dy / d;
  const k = (-3 - HL[1]) / uy, B = [HL[0] + ux * k, -3];
  return { aL, aR, HL, HR, B, ux, uy, sw };
}
function oksanaStep(e, dt, t) {
  const O = OKS; if (O.home === null) O.home = e.x;
  const ease = (v, goal, r) => v + (goal - v) * (1 - Math.exp(-dt * r));
  if (sheetOpen()) { O.walk = ease(O.walk, 0, 6); }
  else if (O.pause > 0) { O.pause -= dt; O.walk = ease(O.walk, 0, 5); }
  else {
    O.walk = ease(O.walk, 1, 3);
    e.x += O.dir * 0.3 * O.walk * dt;
    if (Math.abs(e.x - O.home) > 1.0) { e.x = O.home + Math.sign(e.x - O.home) * 1.0; O.dir = -O.dir; O.pause = rnd(1.4, 3); }
  }
  O.legs += O.walk * dt * 7;
  O.w += dt * (sheetOpen() ? 1.2 : 3.4);
  const p = oksPose(t), L = NPC.oksana && NPC.oksana.look;
  if (L) { L.armR = O.dir > 0 ? p.aR : -p.aL; L.armL = O.dir > 0 ? p.aL : -p.aR; }
  // a puff of dust each time the bristles sweep across the ground
  const sw = Math.sin(O.w);
  if (!sheetOpen() && Math.sign(sw) !== Math.sign(O.prev) && O.dust.length < 60) {
    const bx = e.x * T + O.dir * p.B[0], by = e.y * T - 1, push = O.dir * (Math.cos(O.w) > 0 ? 1 : -1);
    for (let i = 0; i < 6; i++) O.dust.push({ x: bx + rnd(-5, 5), y: by + rnd(-2, 2), vx: push * rnd(12, 32), vy: -rnd(8, 22), age: 0, life: rnd(0.8, 1.4), r: rnd(2.5, 4.5) });
  }
  O.prev = sw;
  for (const q of O.dust) { q.age += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= Math.exp(-dt * 2); q.vy *= Math.exp(-dt * 1.5); }
  O.dust = O.dust.filter(q => q.age < q.life);
}
const DOG_MOUTH = 0.55;   // how far ahead of the dog's middle its mouth is, in tiles
function ballArt(c, x, y, r) {
  c.fillStyle = '#f2c230'; circ(c, x, y, r);
  c.fillStyle = '#2c6ed5'; c.beginPath(); c.arc(x, y, r, Math.PI, 0); c.fill();
  c.fillStyle = 'rgba(255,255,255,.6)'; circ(c, x - r * 0.35, y - r * 0.4, r * 0.28);
}
function boyHand() {   // where Andriiko's right hand is, in pixels from his feet
  const k = 0.78, a = FETCH.arm;
  return { x: k * (15.5 - 19 * Math.sin(a)), y: k * (-47 + 19 * Math.cos(a)) };
}
function fetchStep(e, dt) {
  const F = FETCH, ease = u => u < 0 ? 0 : u > 1 ? 1 : u * u * (3 - 2 * u);
  if (!F.boy) { F.boy = ents.find(q => q.npc === 'andriiko'); if (!F.boy) return; }
  const B = F.boy, sitX = B.x + 0.35 + DOG_MOUTH, sitY = B.y + 0.08;
  F.t += dt;
  const goTo = (gx, gy, sp) => {
    const dx = gx - e.x, dy = gy - e.y, d = Math.hypot(dx, dy);
    if (d < 0.04) { e.vel += (0 - e.vel) * (1 - Math.exp(-dt * 9)); return true; }
    if (Math.abs(dx) > 0.06) e.face = dx > 0 ? -1 : 1;
    const turned = Math.abs((e.ang ?? 0) - (e.face === -1 ? Math.PI : 0)) < 0.7;
    const want = turned ? sp * Math.min(1, d / 0.35 + 0.15) : sp * 0.15;
    e.vel += (want - e.vel) * (1 - Math.exp(-dt * 6));
    const m = Math.min(d, e.vel * dt); e.x += dx / d * m; e.y += dy / d * m; e.step = (e.step || 0) + m;
    return false;
  };
  const toPh = ph => { F.ph = ph; F.t = 0; };
  const still = () => { e.vel += (0 - e.vel) * (1 - Math.exp(-dt * 9)); };
  e.st = 'idle'; e.act = 'look'; F.dip = false; e.carry = false;
  switch (F.ph) {
    case 'hold':   // ball in hand, dog sitting beside him, eager
      if (talkNpc === 'andriiko' && sheetOpen()) F.t = Math.min(F.t, F.wait - 0.2);   // not while he's talking to you
      F.arm += (0.15 - F.arm) * (1 - Math.exp(-dt * 8));
      if (goTo(sitX, sitY, 1.2)) e.face = 1;
      if (F.t > F.wait) {
        F.tx = B.x + 2.2; F.ty = B.y + 0.5;
        for (let i = 0; i < 12; i++) {
          const x = B.x + rnd(1.5, 3.0), y = B.y + rnd(-0.4, 1.4);
          if (x > 1 && y > 1 && x < MW - 1 && y < MH - 1 && !solid[Math.floor(y)][Math.floor(x)]) { F.tx = x; F.ty = y; break; }
        }
        toPh('wind');
      }
      break;
    case 'wind': F.arm = 0.15 + (-2.7 - 0.15) * ease(F.t / 0.5); still(); if (F.t > 0.55) toPh('throw'); break;
    case 'throw':
      F.arm = -2.7 + (-1.0 + 2.7) * ease(F.t / 0.13); still();
      if (F.t > 0.13) {
        const h = boyHand();
        F.ax = B.x + h.x / T; F.ay = B.y + 0.02; F.z0 = -h.y;
        const dist = Math.hypot(F.tx - F.ax, F.ty - F.ay);
        F.dur = 0.55 + dist * 0.14; F.peak = 40 + dist * 14;
        F.on = 'air'; F.bx = F.ax; F.by = F.ay; F.bz = F.z0; toPh('fly');
      }
      break;
    case 'fly': case 'roll': {
      if (F.ph === 'fly') {
        const u = Math.min(1, F.t / F.dur);
        F.bx = F.ax + (F.tx - F.ax) * u; F.by = F.ay + (F.ty - F.ay) * u; F.bz = F.z0 * (1 - u) + F.peak * 4 * u * (1 - u);
        if (u >= 1) { F.ax = F.bx; F.ay = F.by; toPh('roll'); }
      } else {   // one small bounce, rolling on a little and slowing down
        const u = Math.min(1, F.t / 0.5), dx = F.tx - F.ax + (F.tx - (F.boy.x + 0.3)), dy = F.ty - F.ay + (F.ty - F.boy.y), d = Math.hypot(dx, dy) || 1;
        const r = 0.35 * (1 - (1 - u) * (1 - u));
        F.bx = F.ax + dx / d * r; F.by = F.ay + dy / d * r * 0.6; F.bz = 12 * 4 * u * (1 - u);
        if (u >= 1) { F.bz = 0; F.on = 'ground'; }
      }
      F.arm += (0.15 - F.arm) * (1 - Math.exp(-dt * 4));
      if (F.ph === 'fly' && F.t < 0.15) { still(); break; }
      // run for the ball: aim so the mouth ends up on it
      const side = e.x < F.bx ? -1 : 1, gx = F.bx + side * DOG_MOUTH;
      if (goTo(gx, F.by, 2.4) && F.on === 'ground') { e.face = side === -1 ? -1 : 1; toPh('pick'); }
      break;
    }
    case 'pick':   // head down, mouth the ball
      still(); F.dip = F.t < 0.45; F.arm += (0.15 - F.arm) * (1 - Math.exp(-dt * 4));
      if (F.t > 0.3) { F.on = 'mouth'; e.carry = true; }
      if (F.t > 0.55) toPh('back');
      break;
    case 'back':   // trot back with it
      F.on = 'mouth'; e.carry = true;
      if (goTo(sitX, sitY, 1.7)) { e.face = 1; if (Math.abs((e.ang ?? 0)) < 0.25) toPh('drop'); }
      break;
    case 'drop':   // lower the head and let go at his feet
      still(); F.dip = F.t < 0.5;
      if (F.t < 0.3) { F.on = 'mouth'; e.carry = true; }
      else {
        if (F.on === 'mouth') { F.on = 'fall'; F.bx = e.x - DOG_MOUTH * 0.95; F.by = e.y + 0.02; }
        const u = Math.min(1, (F.t - 0.3) / 0.35);
        F.bz = u < 0.55 ? 14 * (1 - (u / 0.55) * (u / 0.55)) : 5 * Math.sin(Math.PI * (u - 0.55) / 0.45);
        if (u >= 1) { F.bz = 0; F.on = 'ground'; toPh('wait'); }
      }
      break;
    case 'wait': still(); e.face = 1; if (F.t > 0.8) { toPh('scoop'); F.ax = F.bx; F.ay = F.by; } break;
    case 'scoop': {   // he reaches down and takes it back into his hand
      still(); const u = ease(F.t / 0.45); F.arm = 0.15 + (-0.45 - 0.15) * Math.sin(Math.PI * Math.min(1, F.t / 0.45));
      const h = boyHand(); F.bx = F.ax + (B.x + h.x / T - F.ax) * u; F.by = F.ay + (B.y + 0.02 - F.ay) * u; F.bz = -h.y * u; F.on = 'air';
      if (F.t > 0.45) { F.on = 'hand'; F.wait = rnd(1.2, 2.6); toPh('hold'); }
      break;
    }
  }
  if (NPC.andriiko) NPC.andriiko.look.armR = F.arm;
}
function fetchDraw(c) {   // the ball whenever it's on its own (flying, rolling, lying, dropping)
  const F = FETCH;
  if (F.on === 'hand' || F.on === 'mouth' || !F.boy) return;
  const x = F.bx * T, y = F.by * T, r = 4.8;
  c.fillStyle = `rgba(0,0,0,${0.16 * Math.max(0.35, 1 - F.bz / 120)})`; ell(c, x, y, r * (1 - Math.min(0.4, F.bz / 200)), r * 0.38);
  ballArt(c, x, y - r - F.bz, r);
}
function quad(c, x, y, Q, t, e) {
  // wk: 0 standing .. 1 walking. rest: lying down. dip: head down to graze. All three glide, so nothing snaps.
  const wk = e.wk || 0, rest = Q.rest ? (e.rest || 0) : 0, dip = Q.graze || e.fetch ? (e.dip || 0) : 0;
  const G = Q.G * (1 - rest * 0.8), amp = Q.amp || 0.4;
  // one stride covers the ground the legs really reach, so the feet don't slide
  const cyc = (e.step || 0) * T / (1.6 * Q.G * Q.k * amp / 0.4);
  const breath = Math.sin(t * 1.5 + e.hx) * 0.4, bob = wk * (1 - Math.cos(cyc * 12.566)) * 0.5 * (Q.B * 0.035) + breath * (1 - wk);
  const dir = -turnX(e);
  c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, x, y, Q.L * Q.k * (0.55 + rest * 0.06), 5 * Q.k);   // the shadow doesn't turn
  c.save(); c.translate(x, y - (e.tl || 0) * 3); turnDepth(c, e); c.scale(Q.k * dir, Q.k); c.lineCap = 'round'; c.lineJoin = 'round';
  const by = -G - Q.B / 2 - bob, lw = Math.max(3.5, Q.B * 0.24), hipF = Q.L * 0.33, hipB = -Q.L * 0.33, hipY = -G - bob * 0.5 - 1;
  // A leg in two parts. It swings back while the foot is on the ground, then bends, lifts and reaches forward.
  // Lying down, the legs fold under: the knee comes forward along the ground and the shin tucks back,
  // so the animal settles onto them instead of sinking into the grass (and unfolds them to stand up).
  const leg = (hx, off, col) => {
    const p = ((cyc + off) % 1 + 1) % 1;
    const th = -amp * Math.cos(p * 6.283) * wk * (1 - rest) - 1.45 * rest;
    const kn = (p > 0.5 ? Math.sin((p - 0.5) * 6.283) : 0) * 0.95 * wk * (1 - rest) + 2.95 * rest;
    const U = Q.G * 0.52 * (1 - rest * 0.25), Lo = Q.G * 0.5 * (1 - rest * 0.25);
    const kx = hx - Math.sin(th) * U, ky = hipY + Math.cos(th) * U, fx = kx - Math.sin(th + kn) * Lo, fy = ky + Math.cos(th + kn) * Lo;
    c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(hx, hipY); c.lineTo(kx, ky); c.stroke();
    c.lineWidth = lw * 0.8; c.beginPath(); c.moveTo(kx, ky); c.lineTo(fx, fy); c.stroke();
    if (Q.hoof && rest < 0.5) { c.strokeStyle = Q.hoof; c.lineWidth = lw * 0.86; c.beginPath(); c.moveTo(fx - Math.sin(th + kn) * -2.5, fy - Math.cos(th + kn) * 2.5); c.lineTo(fx, fy); c.stroke(); }
  };
  // a four-beat walk: hind, then the fore on the same side, then the other side
  leg(hipF - 3, 0.75, Q.far); leg(hipB - 3, 0.5, Q.far);
  // tail, with a lazy sway and now and then a proper swish
  const tx = -Q.L / 2 + 2, ty = by - Q.B * 0.15;
  const swish = Math.sin(t * 2 + e.hx) * 0.5 + Math.max(0, Math.sin(t * 0.7 + e.hx * 5) - 0.8) * 5 * Math.sin(t * 9);
  if (Q.tail === 'hair') { c.strokeStyle = Q.dark; c.lineWidth = 7.5; c.beginPath(); c.moveTo(tx + 2, ty - 2); c.quadraticCurveTo(tx - 13 - wk * 3, ty + 4, tx - 9 + swish * 5, ty + 30 - rest * 14); c.stroke(); c.lineWidth = 4; c.beginPath(); c.moveTo(tx - 9 + swish * 5, ty + 26 - rest * 14); c.lineTo(tx - 8 + swish * 6.5, ty + 37 - rest * 16); c.stroke(); }
  else if (Q.tail === 'tuft') { const ex = tx - 6 + swish * 5, ey = ty + 26 - rest * 12; c.strokeStyle = Q.far; c.lineWidth = 2.4; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx - 9, ty + 10, ex, ey); c.stroke(); c.fillStyle = Q.dark; ell(c, ex, ey + 2, 2.8, 4.2); }
  else if (Q.tail === 'stub') { c.fillStyle = Q.col; const w = Math.sin(t * 11 + e.hx) * (swish > 1 ? 2 : 0.4); poly(c, [[tx + 3, ty + 2], [tx - 6 + w, ty - 8], [tx + 5, ty - 4]]); }
  else if (Q.tail === 'curl') { c.strokeStyle = Q.dark; c.lineWidth = 2.6; c.beginPath(); c.arc(tx - 3, ty - 2, 4, 0.3, 5.2); c.stroke(); }
  else if (Q.tail === 'wag') { const a = -1.0 + Math.sin(t * (rest > 0.5 ? 3 : 9) + e.hx) * (rest > 0.5 ? 0.2 : 0.45); c.strokeStyle = Q.col; c.lineWidth = 4.5; c.beginPath(); c.moveTo(tx + 2, ty); c.lineTo(tx + 2 + Math.cos(a) * -14, ty + Math.sin(a) * 14); c.stroke(); }
  else if (Q.tail === 'cat') { const s2 = Math.sin(t * 2 + e.hx * 2) * 5, up = 1 - rest; c.strokeStyle = Q.col; c.lineWidth = 4; c.beginPath(); c.moveTo(tx + 2, ty + 1); c.bezierCurveTo(tx - 12, ty + 2, tx - 16 + s2 * up, ty - 12 * up + 6 * rest, tx - 9 + s2 * up + 14 * rest, ty - 21 * up + 9 * rest); c.stroke(); }
  // body: a barrel, with a deep chest and round quarters for the horse and a squarer frame for the cow
  c.fillStyle = Q.col; c.beginPath();
  if (Q.shape === 'horse') { c.ellipse(0, by, Q.L / 2, Q.B * 0.46, 0, 0, 7); c.moveTo(Q.L * 0.3 + Q.B * 0.52, by + 0.5); c.arc(Q.L * 0.3, by + 0.5, Q.B * 0.52, 0, 7); c.moveTo(-Q.L * 0.29 + Q.B * 0.53, by); c.arc(-Q.L * 0.29, by, Q.B * 0.53, 0, 7); }
  else if (Q.shape === 'cow' && c.roundRect) { c.roundRect(-Q.L / 2, by - Q.B / 2, Q.L, Q.B, [Q.B * 0.42, Q.B * 0.5, Q.B * 0.45, Q.B * 0.4]); }
  else c.ellipse(0, by, Q.L / 2, Q.B / 2, 0, 0, 7);
  c.fill();
  if (Q.patches || Q.stripes || Q.shade) {
    c.save(); c.clip();
    if (Q.shade) { c.fillStyle = Q.shade; ell(c, -2, by + Q.B * 0.52, Q.L * 0.5, Q.B * 0.2); }
    for (const p of Q.patches || []) { c.fillStyle = p[3] || Q.dark; circ(c, p[0], by + p[1], p[2]); }
    if (Q.stripes) { c.strokeStyle = Q.dark; c.lineWidth = 2; for (let i = -1; i <= 2; i++) { c.beginPath(); c.moveTo(i * 6 - 2, by - Q.B / 2); c.lineTo(i * 6, by - 1); c.stroke(); } }
    c.restore();
  }
  if (Q.udder && rest < 0.5) { c.fillStyle = '#f4b6b0'; ell(c, -Q.L * 0.16, by + Q.B / 2 - 1, 8, 5); }
  // near-side legs
  leg(hipF + 2, 0.25, Q.col); leg(hipB + 2, 0, Q.col);
  // neck and head: down to graze, nodding a little with each step
  const nod = wk * Math.sin(cyc * 12.566 + 0.8) * (Q.graze ? 1.6 : 0.7);
  const munch = dip > 0.8 ? Math.sin(t * 7 + e.hx) * 0.8 : 0;
  const hx = Q.L / 2 + Q.neck[0] - dip * 2 + wk * 2, hy = by - Q.neck[1] * (1 - wk * 0.12) + dip * (Q.neck[1] + G * 0.75 + Q.B * 0.1) + nod + munch;
  if (Q.shape) {
    c.fillStyle = Q.col; c.beginPath(); c.moveTo(Q.L / 2 - Q.B * 0.62, by - Q.B * 0.4); c.quadraticCurveTo(Q.L / 2 - 2, (by + hy) / 2 - Q.B * 0.3, hx - Q.head[0] * 0.5, hy - Q.head[1] * 0.7);
    c.lineTo(hx + 1, hy + Q.head[1] * 0.8); c.quadraticCurveTo(Q.L / 2 + 5, (by + hy) / 2 + Q.B * 0.2, Q.L / 2 - 3, by + Q.B * 0.2); c.closePath(); c.fill();
  } else { c.strokeStyle = Q.col; c.lineWidth = Q.B * 0.5; c.beginPath(); c.moveTo(Q.L / 2 - 7, by - Q.B * 0.1); c.lineTo(hx - 2, hy + 2); c.stroke(); }
  if (Q.mane) { c.strokeStyle = Q.dark; c.lineWidth = 6; c.beginPath(); c.moveTo(Q.L / 2 - Q.B * 0.5, by - Q.B * 0.44); c.quadraticCurveTo(Q.L / 2 - 4, (by + hy) / 2 - Q.B * 0.42, hx - Q.head[0] * 0.5, hy - Q.head[1] * 0.9); c.stroke(); }
  c.save(); c.translate(hx, hy); c.rotate(Q.hrot + dip * 0.5 + nod * 0.02);
  const a0 = Q.head[0], b0 = Q.head[1];
  const flick = Math.max(0, Math.sin(t * 1.1 + e.hx * 7) - 0.9) * 10 * Math.sin(t * 16);   // an ear twitch now and then
  if (Q.horns === 'cow') { c.strokeStyle = '#e9dcc0'; c.lineWidth = 3; c.beginPath(); c.arc(-a0 * 0.2, -b0 - 2, 5, Math.PI, 1.7 * Math.PI); c.stroke(); }
  if (Q.horns === 'goat') { c.strokeStyle = '#a8956e'; c.lineWidth = 2.6; c.beginPath(); c.arc(-a0 * 0.75, -b0 - 1, 8, 1.15 * Math.PI, 1.95 * Math.PI); c.stroke(); }
  if (Q.ear === 'up') { c.fillStyle = Q.far; poly(c, [[-a0 * 0.3, -b0 + 1], [-a0 * 0.2 + flick, -b0 - 8], [a0 * 0.1, -b0 + 1]]); c.fillStyle = Q.col; poly(c, [[-a0 * 0.55, -b0 + 1], [-a0 * 0.42 - flick, -b0 - 10], [-a0 * 0.08, -b0 + 1]]); }
  if (Q.ear === 'point') { c.fillStyle = Q.col; poly(c, [[-a0 * 0.75, -b0 + 3], [-a0 * 0.5 - flick * 0.5, -b0 - 7], [-a0 * 0.05, -b0 + 1]]); poly(c, [[a0 * 0.0, -b0 + 1], [a0 * 0.4, -b0 - 7], [a0 * 0.7, -b0 + 3]]); }
  c.fillStyle = Q.col;
  if (Q.long) {   // a long face: broad cheek tapering to the nose
    c.beginPath(); c.moveTo(-a0 * 0.62, -b0 * 0.85); c.quadraticCurveTo(a0 * 0.3, -b0 * 1.25, a0 * 1.22, -b0 * 0.5); c.quadraticCurveTo(a0 * 1.5, b0 * 0.15, a0 * 1.2, b0 * 0.72);
    c.quadraticCurveTo(a0 * 0.5, b0 * 0.85, a0 * 0.1, b0 * 1.25); c.quadraticCurveTo(-a0 * 0.75, b0 * 1.3, -a0 * 0.62, -b0 * 0.85); c.fill();
  } else { c.beginPath(); c.ellipse(a0 * 0.25, 0, a0, b0, 0, 0, 7); c.fill(); }
  if (Q.headPatch) { c.save(); c.clip(); c.fillStyle = Q.headPatch; circ(c, -a0 * 0.3, -b0 * 0.5, a0 * 0.6); c.restore(); }
  if (Q.blaze) { c.save(); c.clip(); c.fillStyle = Q.blaze; c.beginPath(); c.ellipse(a0 * 0.55, -b0 * 0.75, a0 * 0.6, b0 * 0.3, 0.25, 0, 7); c.fill(); c.restore(); }
  const chew = (rest > 0.5 || (Q.chew && dip < 0.2 && wk < 0.2)) ? Math.sin(t * 5.5 + e.hx) * 0.7 : 0;
  if (Q.muzzle) { c.fillStyle = Q.muzzle; ell(c, a0 * (Q.long ? 1.08 : 0.85), b0 * 0.15 + chew, a0 * (Q.long ? 0.3 : 0.42), b0 * (Q.long ? 0.62 : 0.72)); c.fillStyle = 'rgba(60,30,20,.55)'; circ(c, a0 * (Q.long ? 1.2 : 1.02), -b0 * 0.05 + chew, 1.1); }
  if (Q.snout) { c.fillStyle = Q.dark; ell(c, a0 * 1.1, 1, 4.5, 5.5); c.fillStyle = '#8a4a5a'; circ(c, a0 * 1.12, -1, 0.9); circ(c, a0 * 1.12, 3, 0.9); }
  if (Q.nose) { c.fillStyle = Q.tail === 'cat' ? '#e8708a' : '#2a1a10'; circ(c, a0 * 1.2, 0.5, Q.tail === 'cat' ? 1.3 : 2); }
  if (e.carry) ballArt(c, a0 * 1.0, b0 * 0.95, 4.8);   // the fetch ball, held in its mouth
  if (Q.ear === 'side') { c.fillStyle = Q.far; c.beginPath(); c.ellipse(-a0 * 0.5, -b0 * 0.55, 5.5, 2.8, -0.3 + flick * 0.15, 0, 7); c.fill(); }
  if (Q.ear === 'flop') { c.fillStyle = Q.dark; c.beginPath(); c.ellipse(-a0 * 0.25, -b0 * 0.1, 4.2, 7, 0.3, 0, 7); c.fill(); }
  if (Q.forelock) { c.strokeStyle = Q.dark; c.lineWidth = 4; c.beginPath(); c.moveTo(-a0 * 0.3, -b0 * 1.0); c.quadraticCurveTo(a0 * 0.15, -b0 * 1.15, a0 * 0.3, -b0 * 0.45); c.stroke(); }
  if (Q.beard) { c.fillStyle = Q.dark; poly(c, [[a0 * 0.5, b0 - 1], [a0 * 0.75, b0 + 8], [a0 * 0.9, b0 - 2]]); }
  // eyes: a blink every few seconds, and nearly shut when dozing
  const ex = a0 * (Q.long ? 0.2 : 0.45), ey = -b0 * 0.25, shut = rest > 0.85 && Q.doze ? 1 : ((t * 0.27 + e.hx * 1.7) % 1) < 0.035 ? 1 : 0;
  if (shut) { c.strokeStyle = Q.eye ? '#1d191c' : '#2a1a10'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(ex - 2, ey); c.lineTo(ex + 2, ey + 0.4); c.stroke(); }
  else { c.fillStyle = Q.eye || '#2a1a10'; circ(c, ex, ey, Q.eye ? 1.9 : 1.7); if (Q.eye) { c.fillStyle = '#1d191c'; ell(c, ex, ey, 0.7, 1.7); } else { c.fillStyle = 'rgba(255,255,255,.8)'; circ(c, ex + 0.5, ey - 0.6, 0.5); } }
  if (Q.tail === 'cat') { c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 0.7; for (const dy of [-1, 1.5]) { c.beginPath(); c.moveTo(a0 * 0.9, 1.5 + dy); c.lineTo(a0 * 1.7, 0.5 + dy * 2.2); c.stroke(); } }
  c.restore();
  c.restore();
}

const BIRD = {
  hen: { k: 1, body: '#fff8ec', wing: '#eadfc6', tail: '#eadfc6', comb: 3 },
  rooster: { k: 1.18, body: '#b5522a', wing: '#7a2f1a', tail: '#1f4d3a', comb: 5, big: true },
};
function bird(c, x, y, B, t, e) {
  const walk = !!e.walk, ph = (e.step || 0) * 34, sw = Math.sin(ph) * (e.wk || 0);
  const dir = -turnX(e);
  const peck = !walk && e.act === 'graze' && Math.sin(t * 2.6 + e.hx * 5) > 0.2 ? 1 : 0;
  c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, x, y, 13 * B.k, 3.5 * B.k);
  c.save(); c.translate(x, y - (e.tl || 0) * 2.5); turnDepth(c, e); c.scale(B.k * dir, B.k); c.lineCap = 'round';
  c.strokeStyle = '#e09a2a'; c.lineWidth = 2;
  for (const [lx, s2] of [[-3, sw], [3, -sw]]) { c.beginPath(); c.moveTo(lx, -9); c.lineTo(lx + s2 * 4, -1); c.lineTo(lx + s2 * 4 + 4, -1); c.stroke(); }
  c.fillStyle = B.tail;
  if (B.big) { for (let i = 0; i < 3; i++) { c.save(); c.translate(-11, -20); c.rotate(-0.5 - i * 0.35); ell(c, -9, 0, 11, 3.6); c.restore(); } }
  else poly(c, [[-9, -22], [-21, -30], [-12, -14]]);
  c.fillStyle = B.body; ell(c, 0, -17, 13, 10.5);
  c.fillStyle = B.wing; ell(c, -2, -17, 8, 6);
  const hx = peck ? 15 : 10, hy = peck ? -10 : -30;
  c.strokeStyle = B.body; c.lineWidth = 7; c.beginPath(); c.moveTo(7, -21); c.lineTo(hx - 1, hy + 2); c.stroke();
  c.fillStyle = '#e2392f'; for (let i = 0; i < B.comb; i++) circ(c, hx - 3 + i * 2.2, hy - 6.5 - (i % 2), 2.4); ell(c, hx + 4, hy + 5, 1.8, 3);
  c.fillStyle = B.body; circ(c, hx, hy, 6);
  c.fillStyle = '#f2a13a'; poly(c, [[hx + 5, hy - 2], [hx + 11, hy + 0.5], [hx + 5, hy + 2.5]]);
  c.fillStyle = '#2a1a10'; circ(c, hx + 2, hy - 1.5, 1.2);
  c.restore();
}
function drawDuck(c, x, y, t, e) {
  const dir = -turnX(e), bob = Math.sin(t * 2 + e.hx * 4) * 1.2, drake = e.v === 0;
  c.save(); c.translate(x, y + bob); turnDepth(c, e); c.scale(dir, 1);
  c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 1.5;
  for (let i = 0; i < 2; i++) { c.beginPath(); c.ellipse(0, -1, 17 + i * 6 + (e.walk ? Math.sin(t * 5) * 2 : 0), 3.5 + i * 1.5, 0, 0.1, Math.PI - 0.1); c.stroke(); }
  c.fillStyle = drake ? '#cfc8bd' : '#a9794e'; ell(c, 0, -8, 15, 8);
  c.fillStyle = drake ? '#8a7f72' : '#8a5f3a'; ell(c, -3, -9, 8, 4.5); poly(c, [[-12, -10], [-21, -15], [-13, -4]]);
  c.fillStyle = drake ? '#2f8f5b' : '#a9794e'; circ(c, 11, -18, 6); c.fillRect(8, -16, 6, 8);
  if (drake) { c.fillStyle = '#fff'; c.fillRect(8, -11.5, 6.5, 1.8); }
  c.fillStyle = '#f2c230'; rr(c, 15, -19, 9, 3.6, 1.8);
  c.fillStyle = '#1d191c'; circ(c, 12.5, -19.5, 1.2);
  c.restore();
}
// ------------------------------------------------------------------ bedtime for the village
// When it's time for her to go to bed, the village goes too. Oksana covers her stall and walks home, and so do
// her husband Taras the fisherman and their boy Andriiko with Brovko the dog: the three of them live in the
// cottage at the bottom right. Mr. Bohdan goes home to his cottage at the bottom left. Butterflies and bees are
// gone, and the farm animals lie down (or stand dozing) where they are. In the morning everyone is back.
// The rainbow after the afternoon rain: it comes out as the rain stops (day time 0.62), shines a short while,
// and fades away from 0.69 to 0.75, before dusk sets in at 0.78. 0..1, for the sky and the window views alike.
function rainbowA() {
  const C = S.clock; if (S.rainbowDay !== C.day || wet(S.wx)) return 0;
  const k = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a))), sm = q => q * q * (3 - 2 * q);
  return sm(k(0.62, 0.645, C.t)) * (1 - sm(k(0.69, 0.75, C.t)));
}
function nightNow() { return !!(S.clock && S.clock.t >= 0.86); }
const NPC_HOME = { oksana: 'tarasHome', taras: 'tarasHome', andriiko: 'tarasHome', bohdan: 'bohdanHome' };
const HOME_DELAY = { oksana: 1.5, bohdan: 3, taras: 4.5, andriiko: 6 };
const NIGHT_GONE = new Set(['metelyk', 'bdzhola', 'lastivka']);
let villageNightT = 0;
function villageNight(dt) {
  if (!nightNow()) {
    if (villageNightT) { villageNightT = 0; for (const e of ents) if (e.x0 !== undefined) { e.x = e.x0; e.y = e.y0; e.asleep = false; e.route2 = null; e.x0 = undefined; } }
    return;
  }
  villageNightT += dt;
  for (const e of ents) {
    const who = e.kind === 'npc' ? e.npc : e.fetch ? 'andriiko' : null;
    if (!who || !NPC_HOME[who] || e.asleep) continue;
    if (!e.route2) {
      if (villageNightT < HOME_DELAY[who] + (e.fetch ? 0.7 : 0)) continue;
      const H = ents.find(q => q.k === NPC_HOME[who]); if (!H) continue;
      e.x0 = e.x; e.y0 = e.y; e.route2 = findPath(H.x, H.y + 0.5, null, e); e.homeGo = 0;
      if (!e.route2.length) { e.asleep = true; continue; }
    }
    const n = e.route2[0], dx = n.x - e.x, dy = n.y - e.y, d = Math.hypot(dx, dy), sp = (e.fetch ? 1.9 : 1.6) * dt;
    if (Math.abs(dx) > 0.02) { e.wface = dx > 0 ? 1 : -1; if (e.fetch) { e.face = e.fs = dx > 0 ? -1 : 1; } }
    if (e.fetch) { e.wk = 1; e.walk = true; e.step = (e.step || 0) + sp; e.vel = 1; }
    if (d <= sp) { e.x = n.x; e.y = n.y; e.route2.shift(); if (!e.route2.length) e.asleep = true; }
    else { e.x += dx / d * sp; e.y += dy / d * sp; }
    e.homeGo += sp;
  }
}
// a little "z z" over an animal asleep for the night
function sleepZ(c, x, y, t, k) { if (!nightNow()) return; c.save(); c.font = `700 ${Math.round(11 * k)}px system-ui, sans-serif`; c.textAlign = 'center'; for (let i = 0; i < 2; i++) { const q = (t * 0.35 + i * 0.5 + x * 0.01) % 1; c.globalAlpha = Math.sin(q * Math.PI) * 0.85; c.fillStyle = '#e8eefc'; c.fillText('z', x + 10 * k + q * 10 * k, y - 34 * k - q * 18 * k); } c.restore(); }
function drawAnimal(c, x, y, e, t) {
  if (nightNow() && e.an !== 'cat' && e.an !== 'frog' && !e.route2) { const k = e.an === 'cow' || e.an === 'horse' ? 1.3 : 0.9; if (BIRD[e.an]) { c.save(); c.beginPath(); c.rect(x - 60, y - 100, 120, 101); c.clip(); drawAnimal0(c, x, y + 7, e, t); c.restore(); } else drawAnimal0(c, x, y, e, t); return sleepZ(c, x, y - (e.an === 'hen' || e.an === 'rooster' ? -14 : 0), t, k); }
  return drawAnimal0(c, x, y, e, t);
}
function drawAnimal0(c, x, y, e, t) {
  if (e.an === 'frog') {
    // hops in little arcs while moving; sits with a slow throat-puff otherwise
    const ph = e.walk ? ((e.step || 0) * 2.4) % 1 : 0, lift = e.walk ? Math.sin(Math.PI * ph) * 16 : (e.tl || 0) * 4, dir = -turnX(e);
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, x, y, 13 - lift * 0.3, 3.5);
    c.save(); c.translate(x, y - lift); turnDepth(c, e); c.scale(dir, 1);
    const k = e.s * T / 100, puff = e.walk ? 1 : 1 + Math.max(0, Math.sin(t * 2.2 + e.hx)) * 0.04;
    c.scale(k, k * puff); DRAW.frog(c, { hop: e.walk && ph > 0.12 && ph < 0.88 }); c.restore();
    return;
  }
  if (e.an === 'duck') return drawDuck(c, x, y, t, e);
  if (BIRD[e.an]) return bird(c, x, y, BIRD[e.an], t, e);
  if (e.an === 'cat') return quad(c, x, y, e.q || (e.q = catQuad(e.v)), t, e);
  quad(c, x, y, QUAD[e.an], t, e);
}
// Befriending a cat: bring it the treat it wants.
function catSheet(e) {
  const ct = D.cats.find(x => x.id === e.cat);
  if (S.cats[ct.id]) return wordCard(ct.word, { note: `❤️ ${ct.name} · ${PH.mur.uk}`, clips: ['p_mur'] });
  const has = (S.bag[ct.wants] || 0) > 0, st = stage();
  wordCard(ct.word, {
    note: `<b>${ct.line}</b>${st < 3 ? `<br>${ct.lineEn}` : `<span class="xl"><br>${ct.lineEn}</span>`}<div style="display:flex;align-items:center;justify-content:center;gap:8px;margin:6px 0 2px"><img src="${iconURL(ct.wants)}" style="width:44px;height:44px" alt=""><span style="text-align:left"><b>${W[ct.wants].uk}</b>${st < 3 ? `<br><span style="font-size:14px;opacity:.8">${W[ct.wants].en}${has ? ' · you have some!' : ''}</span>` : ''}</span></div>${!has ? xl(`<small>${sourceHint(ct.wants)}</small>`) : ''}`,
    clips: ['c_' + ct.id],
    acts: has ? [{ k: 'give', fn: () => {
      S.bag[ct.wants]--; S.cats[ct.id] = 'f'; S.hearts += 2; { const ce = ents.find(q => q.cat === ct.id); if (ce) fxHearts(ce.x, ce.y - 0.6); } learn(ct.wants); useWord(ct.wants, true);
      hud(); save(); closeSheet(); toast(`❤️ ${ct.name}!  +2 ❤️${stage() < 3 ? ' · Take it home 🏠' : ''}`); say('p_mur'); blip(990, 0.15);
    } }] : [],
  });
}
const catFriends = () => D.cats.filter(ct => S.cats[ct.id]).length;

// ------------------------------------------------------------------ walking
// x, y: where you really are. rx, ry: where you are drawn, which glides after it so corners are round.
const P = { x: S.x, y: S.y, rx: S.x, ry: S.y, path: [], moving: false, face: 1, fs: 1, wk: 0, step: 0, sp: 0, dust: 0, goal: null };
// Cats roam the whole village: mostly off somewhere further away, sometimes just across the way. The route
// goes tile by tile round houses, fences and the pond (a breadth-first search over the walkable tiles).
function catRoute(sx, sy, tx, ty) {
  const s0 = sy * MW + sx, goal = ty * MW + tx, prev = new Int32Array(MW * MH).fill(-2), q = [s0]; prev[s0] = -1;
  for (let h = 0; h < q.length && prev[goal] === -2; h++) {
    const cur = q[h], cx = cur % MW, cy = (cur / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 1 || ny < 1 || nx >= MW - 1 || ny >= MH - 1 || solid[ny][nx] || inPond(nx + 0.5, ny + 0.5, -0.3)) continue;
      if (dx && dy && (solid[cy][nx] || solid[ny][cx])) continue;
      const ni = ny * MW + nx; if (prev[ni] !== -2) continue;
      prev[ni] = cur; q.push(ni);
    }
  }
  if (prev[goal] === -2) return null;
  const path = []; for (let i = goal; i !== s0 && i >= 0; i = prev[i]) path.unshift(i);
  // keep only the corners, so the walk is a few straight legs rather than a staircase of tiles
  const pts = path.map(i => ({ x: (i % MW) + 0.5, y: ((i / MW) | 0) + 0.5 }));
  return pts.filter((p, k) => k === pts.length - 1 || k === 0 || (pts[k + 1].x - p.x !== p.x - pts[k - 1].x || pts[k + 1].y - p.y !== p.y - pts[k - 1].y));
}
// A cat you've just befriended trots after you until you take it home (S.cats[id] = 'f'); once inside
// it's a house cat (S.cats[id] = 1) and no longer out in the village.
// With several following, each keeps its own place in the line (further back the later it joined), and
// they nudge apart so no two stand in the same spot.
function followStep(e, dt) {
  const line = ents.filter(q => q.cat && S.cats[q.cat] === 'f'), idx = Math.max(0, line.indexOf(e));
  const near = 0.8 + idx * 0.75;
  const dx = P.x - e.x, dy = P.y - e.y, d = Math.hypot(dx, dy);
  const free = (x, y) => !(solid[Math.floor(y)] || [])[Math.floor(x)];
  if (d > 7 + idx) { e.x = P.x + (P.x > e.x ? -1 : 1) * near; e.y = P.y + (idx % 2 ? 0.35 : 0.1); e.vel = 0; return; }   // left behind a building: catch up
  const want = d > near + 0.8 ? 3.8 : d > near + 0.2 ? 2 : 0;
  e.vel += (want - e.vel) * (1 - Math.exp(-dt * 4));
  if (e.vel > 0.02 && d > near) {
    const m = Math.min(d - near, e.vel * dt), nx = e.x + dx / d * m, ny = e.y + dy / d * m;
    if (free(nx, ny)) { e.x = nx; e.y = ny; } else if (free(nx, e.y)) e.x = nx; else if (free(e.x, ny)) e.y = ny;
    e.step = (e.step || 0) + m;
  }
  for (const o of line) {   // shuffle sideways away from a cat that's too close
    if (o === e) continue;
    const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy);
    if (od < 0.6) {
      const push = (0.6 - od) * Math.min(1, dt * 5), ux = od > 0.01 ? ox / od : idx % 2 ? 1 : -1, uy = od > 0.01 ? oy / od : 0.5;
      const nx = e.x + ux * push, ny = e.y + uy * push * 0.6;
      if (free(nx, ny)) { e.x = nx; e.y = ny; }
    }
  }
  if (Math.abs(dx) > 0.15) e.face = dx > 0 ? -1 : 1;
  e.st = 'idle'; e.act = 'look'; e.tw = 1;
}
function catRoam(e) {
  const sx = Math.floor(e.x), sy = Math.floor(e.y), far = Math.random() < 0.7, R = far ? 11 : 3;
  for (let i = 0; i < 12; i++) {
    const tx = Math.floor(e.x + rnd(-R, R)), ty = Math.floor(e.y + rnd(-R * 0.7, R * 0.7));
    if (tx < 1 || ty < 1 || tx >= MW - 1 || ty >= MH - 1 || solid[ty][tx] || inPond(tx + 0.5, ty + 0.5, -0.3)) continue;
    if (Math.abs(tx - sx) + Math.abs(ty - sy) < 2) continue;
    const r = catRoute(sx, sy, tx, ty); if (!r || !r.length || r.length > 40) continue;
    const last = r[r.length - 1]; last.x += rnd(-0.3, 0.3); last.y += rnd(-0.3, 0.3);
    e.route = r; const n = e.route.shift(); e.gx = n.x; e.gy = n.y; e.st = 'walk'; e.walkT = 0; e.act = 'look';
    if (Math.abs(n.x - e.x) > 0.05) e.face = n.x > e.x ? -1 : 1;
    return true;
  }
  return false;
}
function findPath(tx, ty, ent, from) {
  const sx = Math.floor(from ? from.x : P.x), sy = Math.floor(from ? from.y : P.y);
  const dist = new Int16Array(MW * MH).fill(-1), prev = new Int32Array(MW * MH).fill(-1);
  const q = [sy * MW + sx]; dist[q[0]] = 0;
  for (let h = 0; h < q.length; h++) {
    const cur = q[h], cx = cur % MW, cy = (cur / MW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH || solid[ny][nx]) continue;
      if (dx && dy && (solid[cy][nx] || solid[ny][cx])) continue;
      const ni = ny * MW + nx;
      if (dist[ni] >= 0) continue;
      dist[ni] = dist[cur] + 1; prev[ni] = cur; q.push(ni);
    }
  }
  // Nearest reachable tile to where we want to stand.
  let best = -1, bs = 1e9;
  const reach = ent ? Math.max(2.5, ent.s * 0.9) : 2.5;
  for (let y = Math.max(0, Math.floor(ty - 4)); y <= Math.min(MH - 1, Math.floor(ty + 4)); y++) {
    for (let x = Math.max(0, Math.floor(tx - 4)); x <= Math.min(MW - 1, Math.floor(tx + 4)); x++) {
      const i = y * MW + x; if (dist[i] < 0) continue;
      const d = Math.hypot(x + 0.5 - tx, y + 0.5 - ty);
      if (d > reach + 2) continue;
      const score = d * 10 + dist[i] * 0.3 + (ent && y + 0.5 < ty ? 4 : 0);
      if (score < bs) { bs = score; best = i; }
    }
  }
  if (best < 0) return [];
  const path = [];
  for (let i = best; i >= 0 && i !== q[0]; i = prev[i]) path.unshift({ x: (i % MW) + 0.5, y: ((i / MW) | 0) + 0.5 });
  return path;
}
// When you go to talk to someone, stand beside them (not on top of them), facing them.
// Some villagers have a side that is free of their work (Olia's flowers, Bohdan's hives).
const TALK_SIDE = { olia: 1, bohdan: 1, taras: -1 };
function talkSpot(e) {
  const free = (x, y) => x > 0.5 && x < MW - 0.5 && !solid[Math.floor(y)][Math.floor(x)];
  const pref = TALK_SIDE[e.npc] || (P.x <= e.x ? -1 : 1);
  for (const side of [pref, -pref]) { const x = e.x + side * 1.05; if (free(x, e.y)) return { x, y: e.y }; }
  return null;
}
function walkTo(wx, wy, ent) {
  if (ent && ent.kind === 'npc') {
    const sp = talkSpot(ent);
    if (sp) {
      const path = findPath(sp.x, sp.y, null);
      const end = path.length ? path[path.length - 1] : { x: P.x, y: P.y };
      if (Math.hypot(end.x - sp.x, end.y - sp.y) < 1.2) {
        if (path.length && Math.hypot(end.x - sp.x, end.y - sp.y) < 0.75) path[path.length - 1] = sp; else path.push(sp);
        P.path = path; P.goal = ent; return;
      }
    }
  }
  const path = findPath(wx, wy, ent);
  // If we are tapping bare ground and the end tile is the tapped tile, finish on the exact spot.
  if (!ent && path.length && Math.hypot(path[path.length - 1].x - wx, path[path.length - 1].y - wy) < 0.75 && !solid[Math.floor(wy)][Math.floor(wx)]) path[path.length - 1] = { x: wx, y: wy };
  P.path = path; P.goal = ent || null;
  if (!path.length && ent) arrive();
}
// When she gets to someone to talk to (or to the market, where Oksana is), she turns side-on to face them.
function arrive() {
  const e = P.goal; P.goal = null;
  const who = e && (e.kind === 'npc' ? e : e.kind === 'shop' ? ents.find(q => q.npc === 'oksana') : null);
  if (who) { P.face = who.x >= P.x ? 1 : -1; P.lookAt = P.face > 0 ? Math.PI / 2 : Math.PI * 1.5; }
  if (e) interact(e);
}

// ------------------------------------------------------------------ learning
// First meeting teaches the word. After that it comes back "due" at growing intervals.
function learn(id) {
  if (S.words[id]) return false;
  S.words[id] = { l: 1, d: now() + IV[1] };
  tutEvent('word'); save(); return true;
}
// You looked at something whose tap opens a different panel (the shop): count it as a review, so it stops sparkling.
function reviewed(id) {
  const w = S.words[id]; if (!w || w.l >= 5 || now() < w.d) return;
  w.l = Math.min(5, w.l + 1); w.d = now() + IV[w.l]; save();
}
function useWord(id, ok) {
  const w = S.words[id] || (S.words[id] = { l: 1, d: 0 });
  if (ok) { w.l = Math.min(5, w.l + 1); w.d = now() + IV[w.l]; }
  else { w.l = Math.max(1, w.l - 1); w.d = now() + IV[1]; }
  save();
}
const TURN_SLOW = { cow: 2.3, horse: 2.1 };   // the big animals take their time (about 0.9 s)
function turnTo(o, face, dt, slow = 1) {
  const goal = face === -1 ? Math.PI : 0;
  if (o.ang === undefined) { o.ang = goal; o.av = 0; }
  o.av += ((goal - o.ang) * 90 / (slow * slow) - o.av * 19 / slow) * dt;   // about 0.4 s for a full turn at slow = 1
  o.ang += o.av * dt;
  if (Math.abs(goal - o.ang) < 0.002 && Math.abs(o.av) < 0.01) { o.ang = goal; o.av = 0; }
  o.fs = Math.cos(o.ang); o.tl = Math.sin(Math.max(0, Math.min(Math.PI, o.ang)));
}
function turnDepth(c, e) {
  const tl = e.tl || 0;
  if (tl > 0.005) c.transform(1, tl * 0.24 * (e.av >= 0 ? 1 : -1), 0, 1 + tl * 0.07, 0, 0);
}
// Horizontal scale for drawing. Animals are drawn side-on, so half-way round they narrow a lot (you see
// them end-on); people face the camera, so they only narrow a little as they spin. Never fully flat.
const turnX = (o, min = 0.28) => { const v = o.fs === undefined ? (o.face === -1 ? -1 : 1) : o.fs, a = Math.abs(v), k = min + (1 - min) * a; return v < 0 ? -k : k; };
const isFresh = id => { const w = S.words[id]; return !w || (w.l < 5 && now() >= w.d); };
const known = id => S.words[id] ? S.words[id].l : 0;

// ------------------------------------------------------------------ sheets (the pop-up panels)
const sheet = $('#sheet'), veil = $('#veil');
let onClose = null, acts = [], cur = {}, sheetAt = 0;
function openSheet(html, closer) {
  if (onClose) { const f = onClose; onClose = null; f(); }
  sheet.classList.remove('fixed'); clearTimeout(closeT); sheet.classList.remove('closing'); veil.classList.remove('closing');
  if (html.includes('class="dlg"')) { html += subsHTML(); subNow = null; }
  sheet.innerHTML = html; sheet.classList.add('show'); veil.classList.add('show'); sheet.scrollTop = 0; sheetAt = Date.now();
  onClose = closer || null;
}
let closeT = 0;
function closeSheet() {
  if (sheet.classList.contains('show')) { sheet.classList.add('closing'); veil.classList.add('closing'); clearTimeout(closeT); closeT = setTimeout(() => { sheet.classList.remove('closing'); veil.classList.remove('closing'); }, 190); }
  sheet.classList.remove('show'); veil.classList.remove('show');
  if (onClose) { const f = onClose; onClose = null; f(); }
}
const sheetOpen = () => sheet.classList.contains('show');
// Swipe a card down to close it, the same as tapping above it. The drag only starts while the card is
// scrolled to its top, so scrolling a long card still works; a short drag springs back.
{
  let y0 = null, x0 = 0, dy = 0, t0 = 0, drag = false;
  const clear = () => { sheet.style.transition = ''; sheet.style.transform = ''; veil.style.transition = ''; veil.style.opacity = ''; };
  sheet.addEventListener('touchstart', ev => {
    y0 = null; if (ev.touches.length !== 1 || sheet.scrollTop > 0 || sp) return;
    y0 = ev.touches[0].clientY; x0 = ev.touches[0].clientX; dy = 0; t0 = Date.now(); drag = false;
  }, { passive: true });
  sheet.addEventListener('touchmove', ev => {
    if (y0 === null) return;
    const d = ev.touches[0].clientY - y0, dx = ev.touches[0].clientX - x0;
    if (!drag) {
      if (d > 8 && d > Math.abs(dx) * 1.2 && sheet.scrollTop <= 0) { drag = true; sheet.style.transition = 'none'; veil.style.transition = 'none'; }
      else { if (d < -4 || Math.abs(dx) > 12) y0 = null; return; }
    }
    ev.preventDefault();
    dy = Math.max(0, d); sheet.style.transform = `translate(-50%, ${dy}px)`; veil.style.opacity = String(Math.max(0.15, 1 - dy / 350));
  }, { passive: false });
  const end = () => {
    if (y0 === null) return; y0 = null; if (!drag) return; drag = false;
    const fast = dy / Math.max(1, Date.now() - t0) > 0.35;   // px per ms
    if (dy > 100 || (fast && dy > 35)) {
      sheet.style.transition = 'transform .17s ease-in'; veil.style.transition = 'opacity .17s ease-in';
      sheet.style.transform = `translate(-50%, ${sheet.offsetHeight + 20}px)`; veil.style.opacity = '0';
      setTimeout(() => { A.close(); sheet.classList.remove('closing'); veil.classList.remove('closing'); clear(); }, 170);
    } else {
      sheet.style.transition = 'transform .22s cubic-bezier(.2,1.3,.4,1)'; veil.style.transition = 'opacity .2s'; sheet.style.transform = 'translate(-50%, 0)'; veil.style.opacity = '';
      setTimeout(clear, 230);
    }
  };
  sheet.addEventListener('touchend', end); sheet.addEventListener('touchcancel', end);
}
let toastT = 0;
function toast(msg, ms = 1900) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms); }
const btn = (a, v, inner, cls = '') => `<button class="b ${cls}" data-a="${a}" data-v="${v}">${inner}</button>`;

function wordCard(id, o = {}) {
  const w = W[id], t = now();
  const isNew = learn(id);
  const st = S.words[id];
  let recall = false;
  if (!isNew && t >= st.d && st.l < 5) { if (st.l < 2) { st.l = 2; st.d = t + IV[2]; } else recall = true; }
  const hideEn = !isNew && st.l >= 2;
  cur = { id, peeked: false, hideEn };
  acts = o.acts || [];
  // The eye also shows when only the note has English tucked away (a cat's "wants fish" at stage 2),
  // even though the word itself is still shown in English.
  const peekBtn = `<button class="peek" data-a="peek">👁 ${D.ui.show[0]}${stage() < 3 ? ' · ' + D.ui.show[1] : ''}</button>`;
  const en = hideEn || stage() >= 3 ? peekBtn : `<div class="en">${w.en}</div>${/class="xl"/.test(o.note || '') ? peekBtn : ''}`;
  openSheet(`<div class="card">
    ${isNew ? `<div class="tag">✨ ${PH.nove_slovo.uk}${stage() >= 3 ? xl(' · ' + PH.nove_slovo.en) : ''}</div>` : ''}
    ${w.verb ? `<div class="tag" style="background:#ffd27a">🔶 дієслово${stage() < 3 ? ' · verb, an action word' : xl(' · verb')}</div>` : ''}
    <img class="big" src="${iconURL(id)}" alt="">
    <div class="word">${w.uk}</div>
    ${o.owner ? `<div class="owner" style="font-weight:800;font-size:1.2em;color:#4a2c1a;margin:-2px 0 4px">${o.owner}</div>` : ''}
    ${st.l < 4 ? `<div class="tr">${w.tr}</div>` : ''}
    <div id="en">${en}</div>
    ${o.note ? `<div class="hint">${o.note}</div>` : ''}
    ${w.fact ? `<div class="fact"><b>🌾 ${stage() < 3 ? 'Ukrainian culture' : 'Культура' + xl(' · Ukrainian culture')}</b><div class="fu">${w.fact.uk}</div><div class="fe${stage() < 3 ? '' : ' xl'}">${w.fact.en}</div></div>` : ''}
    <div class="row">
      ${btn('hear', 'w_' + id, '🔊', 'round blue')}
      ${acts.map((a, i) => btn('act', i, lab(a.k))).join('')}
      ${btn('close', '', lab('close'), 'ghost')}
    </div></div>`,
  () => {
    if (!recall) return;
    // Remembered it without peeking at the English: it moves up and comes back later.
    if (!cur.peeked) { st.l = Math.min(5, st.l + 1); st.d = now() + IV[st.l]; st.pk = 0; }
    else {
      // Peeked at the English (often just to read the culture note): it doesn't count as remembered, but it
      // mustn't trap the word sparkling every few minutes either. It waits at least half an hour, and every
      // second peek still moves it up a level, so things you've looked at often settle down.
      st.pk = (st.pk || 0) + 1;
      if (st.pk >= 2) { st.l = Math.min(5, st.l + 1); st.pk = 0; }
      st.d = now() + Math.max(IV[3], IV[st.l]);
    }
    save();
  });
  say('w_' + id, ...(o.clips || []));
}

// Picking someone else's flowers: the owner calls out, and you choose to leave them or take one anyway.
// Taking it anyway means the owner won't do business with you any more.
function caught(e) {
  const npc = NPC[e.owner], n = S.npc[npc.id] || (S.npc[npc.id] = { met: false, q: null, k: 0 });
  const ask = line(npc, 'mine');
  ask.choices = [
    { uk: PH.ne_budu.uk, en: PH.ne_budu.en, clip: 'p_ne_budu', then: [line(npc, 'ok')] },
    { uk: PH.vizmu.uk, en: PH.vizmu.en, clip: 'p_vizmu', fn: () => { n.mad = true; n.q = null; e.stealOk = true; take(e); setGuide(); save(); toast(`😠 ${npc.name}`); } },
  ];
  dialog(npc, [ask]);
}
function give(id, n = 1) { S.bag[id] = (S.bag[id] || 0) + n; hud(); save(); }
// Your own farm: hens (up to four) and a cow scratch and graze in the yard below your cottage, and a butter
// churn stands by your door once you've bought one. They're added to the world when bought and on loading.
const FARM_MAX = { kurka: 4, korova: 1 };
const HEN_SPOTS = [[2.2, 12.5], [3.2, 13.15], [1.5, 13.2], [5.8, 13.25]], COW_SPOT = [11.5, 12.75];   // the hens scratch about on the left of the path up to her door; the cow grazes on the right
const farmN = k => (S.farm && S.farm[k]) || 0;
let churnUntil = 0, grindUntil = 0;
function farmEnts() {
  const put = o => {
    if (ents.some(e => e.k === o.k)) return;
    const e = add(o);
    e.hx = e.x; e.hy = e.y; e.tw = Math.random() * 6; e.st = 'idle'; e.act = 'look'; e.vel = 0; e.wk = 0; e.dip = 0; e.rest = 0; e.face = Math.random() < 0.5 ? -1 : 1; e.fs = e.face;
    if (e.kind === 'animal' && ANIMAL_OF[e.w]) { e.an = ANIMAL_OF[e.w]; e.s = ASIZE[e.an]; }
  };
  for (let i = 0; i < Math.min(FARM_MAX.kurka, farmN('kurka')); i++) put({ w: 'kurka', k: 'my_kurka' + i, x: HEN_SPOTS[i][0], y: HEN_SPOTS[i][1], kind: 'animal', r: 0.8, give: 'yaitse', cd: 90 });
  if (farmN('korova') > 0) put({ w: 'korova', k: 'my_korova', x: COW_SPOT[0], y: COW_SPOT[1], s: 1.4, kind: 'animal', r: 0.6, give: 'moloko', cd: 120 });
  if (S.gear.maslobiika) put({ w: 'maslobiika', k: 'my_churn', x: 8.75, y: 12.45, s: 0.85 });
  if (S.gear.zhorna) put({ w: 'zhorna', k: 'my_mill', x: 9.55, y: 12.5, s: 0.85 });
}
// The hand mill: a sheaf of wheat in, a bag of flour out, with the top stone going round a moment.
function millCard() {
  const has = (S.bag.pshenytsia || 0) > 0;
  wordCard('zhorna', {
    note: `🌾 ${W.pshenytsia.uk}: ${S.bag.pshenytsia || 0}${xl((has ? ' · One wheat makes one flour.' : ' · You need wheat. It grows in the field beside the church, and in a strip by the pond.'))}`,
    acts: has ? [{ k: 'grind', fn: () => {
      S.bag.pshenytsia--; give('boroshno'); learn('boroshno'); useWord('pshenytsia', true); grindUntil = now() + 1800; blip(520, 0.12); setTimeout(() => blip(600, 0.12), 450);
      const me = ents.find(q => q.k === 'my_mill'); if (me) setTimeout(() => fxBurst(me.x, me.y - 1, W.boroshno.ic), 1000);
      toast(`−1 ${W.pshenytsia.uk}  +1 ${W.boroshno.uk}`); closeSheet(); setTimeout(() => say('w_boroshno'), 1000);
    } }] : [],
  });
}
// The butter churn: a cup of milk in, a pat of butter out, with the dasher going up and down a moment.
function churnCard() {
  const has = (S.bag.moloko || 0) > 0, st = stage();
  wordCard('maslobiika', {
    note: `🥛 ${W.moloko.uk}: ${S.bag.moloko || 0}${xl((has ? ' · One milk makes one butter.' : ' · You need milk. Milk a cow first.'))}`,
    acts: has ? [{ k: 'churn', fn: () => {
      S.bag.moloko--; give('maslo'); learn('maslo'); churnUntil = now() + 1600; blip(660, 0.12); setTimeout(() => blip(780, 0.12), 400);
      const ce = ents.find(q => q.k === 'my_churn'); if (ce) setTimeout(() => fxBurst(ce.x, ce.y - 1, W.maslo.ic), 900);
      toast(`−1 ${W.moloko.uk}  +1 ${W.maslo.uk}`); closeSheet(); setTimeout(() => say('w_maslo'), 900);
    } }] : [],
  });
}
function take(e) {
  if (e.owner && !e.stealOk) return caught(e);
  e.stealOk = false;
  S.cd[e.k] = now() + e.cd * 1000;
  give(e.give); blip(880); fxBurst(e.x, e.y - e.s * 0.45, W[e.give].ic);
  toast(`+1 ${W[e.give].ic[0] === '@' ? '' : W[e.give].ic} ${W[e.give].uk}`);
  // Grandma calls out from her cottage that you're welcome to her eggs and milk.
  if (e.give !== e.w) wordCard(e.give, e.olias ? { note: `👵 <b>«${NPC.olia.lines.share.uk}»</b>${xl(`<br>${NPC.olia.lines.share.en}`)}`, clips: ['v_olia_share'] } : {}); else closeSheet();
}
const ready = e => !(S.cd[e.k] > now());

function fishCard(e) {
  if (winter()) {   // a frozen pond: with an ice auger of your own you can bore a hole and fish through it
    if (S.gear.lodobur) return wordCard('lid', { note: `❄️ <b>${W.stavok.uk}: ${W.lid.uk}</b>${xl('<br>Bore a hole with your ice auger and fish through it.')}`, acts: [{ k: 'fish', fn: iceFishStart }] });
    return wordCard('lid', { note: `❄️ <b>${W.stavok.uk}: ${W.lid.uk}</b>${xl(`<br>The pond is frozen. Buy an ice auger («${W.lodobur.uk}») at the market («${D.ui.tools[0]}») to fish through the ice, or talk to Taras.`)}` });
  }
  const has = !!S.gear.vudka, st = stage();
  wordCard(e.w, has
    ? { acts: [{ k: 'fish', fn: startFishing }] }
    : { note: `🎣 <b>${PH.need_rod.uk}</b>${xl(`<br>${PH.need_rod.en} Buy one at the market («${D.ui.tools[0]}» tab).`)}`, clips: ['p_need_rod'] });
}
// The bird feeder: put sunflower seeds out and blue tits and bullfinches come to it for a couple of minutes.
function feederCard() {
  const seeds = (S.bag.soniashnyk || 0) + (S.bag.pshenytsia || 0), fed = S.feedT > now();
  learn('hodivnychka'); learn('synytsia'); learn('snihur');
  wordCard('hodivnychka', { note: fed ? `🐦 ${W.synytsia.uk}, ${W.snihur.uk}${xl(' · The birds are eating!')}` : `🌻 ${W.soniashnyk.uk}: ${S.bag.soniashnyk || 0}${xl(seeds ? ' · Put out some seeds for the birds.' : ' · You need sunflower seeds (or wheat) for the birds. The market sells sunflower heads in winter («Овочі»).')}`,
    acts: seeds && !fed ? [{ k: 'give', fn: () => { const it = (S.bag.soniashnyk || 0) > 0 ? 'soniashnyk' : 'pshenytsia'; S.bag[it]--; S.feedT = now() + 150e3; S.hearts += 1; hud(); save(); closeSheet(); blip(880, 0.08); toast(`🐦 ${W.synytsia.uk} · ${W.snihur.uk}  ❤️ +1`); say('w_synytsia', 'w_snihur'); } }] : [] });
}
// Fishing through the ice with your own auger (the same game as Taras's, with him beside you to help), once a minute.
function iceFishStart() {
  closeSheet();
  if (S.cd.icefish > now()) { toast(stage() < 3 ? '🐟 Риба ще не клює · Not biting yet. Try again soon.' : '🐟 Риба ще не клює.'); return; }
  S.cd.icefish = now() + 60e3; learn('lodobur'); save();
  setTimeout(() => mgStart('taras', 'taras_w'), 150);
}
// Fishing: cast the float onto the water, wait for a bite, then reel the fish out in an arc.
let fishFx = null;
function startFishing() {
  closeSheet();
  if (S.cd.fish > now()) { toast(stage() < 3 ? '🐟 Риба ще не клює · Not biting yet. Try again soon.' : '🐟 Риба ще не клює.'); return; }
  P.path = []; P.goal = null;
  const dx = POND.x - P.x, dy = POND.y - P.y, d = Math.hypot(dx, dy) || 1;
  let bx = P.x + dx / d * 1.6, by = P.y + dy / d * 1.6;
  if (!inPond(bx, by, -0.3)) { bx = P.x + dx / d * 2.4; by = P.y + dy / d * 2.4; }
  if (!inPond(bx, by, -0.3)) { bx = POND.x; by = POND.y; }
  P.face = bx >= P.x ? 1 : -1;
  fishFx = { t0: nowT, bx, by, done: false };
  learn('vudka'); blip(520, 0.08);
}
function drawFishing(c, t) {
  const a = t - fishFx.t0, px = P.x * T, py = P.y * T, dir = P.face;
  const hand = [px + dir * 13, py - 36];
  const reel = a > 2.5 ? Math.min(1, (a - 2.5) / 0.8) : 0;
  const tip = [px + dir * (52 - reel * 18), py - 92 - reel * 16];
  const b = [fishFx.bx * T, fishFx.by * T];
  // rod
  c.strokeStyle = '#c8a46a'; c.lineWidth = 4; c.lineCap = 'round'; c.beginPath(); c.moveTo(hand[0], hand[1]); c.lineTo(tip[0], tip[1]); c.stroke();
  c.fillStyle = '#5b6470'; circ(c, hand[0] + dir * 6, hand[1] - 7, 4);
  // where the float (or the fish) is
  let fx, fy, dip = 0;
  if (a < 0.5) { const f = a / 0.5; fx = tip[0] + (b[0] - tip[0]) * f; fy = tip[1] + (b[1] - tip[1]) * f - Math.sin(Math.PI * f) * 50; }
  else if (a < 2.5) { fx = b[0]; fy = b[1] + Math.sin(a * 4) * 2; if (a > 2.15) dip = 7; }
  else { fx = b[0] + (hand[0] - b[0]) * reel; fy = b[1] + (hand[1] - b[1]) * reel - Math.sin(Math.PI * reel) * 90; }
  // line with a little sag
  c.strokeStyle = 'rgba(70,70,70,.85)'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(tip[0], tip[1]); c.quadraticCurveTo((tip[0] + fx) / 2, Math.max(tip[1], fy) + (a < 2.5 ? 12 : 0), fx, fy + dip); c.stroke();
  if (a >= 0.5 && a < 2.6) {
    // ripples round the float
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) { const r = ((a * 0.8 + i * 0.5) % 1) * 18 + 6; c.globalAlpha = 1 - ((a * 0.8 + i * 0.5) % 1); c.beginPath(); c.ellipse(b[0], b[1] + 3, r, r * 0.35, 0, 0, 7); c.stroke(); }
    c.globalAlpha = 1;
    if (a > 2.15) { c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 2; c.beginPath(); c.ellipse(b[0], b[1] + 3, 22, 7, 0, 0, 7); c.stroke(); }
  }
  if (a < 2.5) { c.fillStyle = '#e2392f'; circ(c, fx, fy + dip, 6); c.fillStyle = '#fffaf0'; c.beginPath(); c.arc(fx, fy + dip, 6, 0, Math.PI); c.fill(); }
  else { c.save(); c.translate(fx, fy); c.rotate(reel * 6); drawIcon(c, '🐟', 0, 20, 44); c.restore(); }
  // a bite!
  if (a > 2.15 && a < 2.9) { c.fillStyle = 'rgba(255,248,234,.95)'; circ(c, px, py - 104, 15); c.fillStyle = '#d43a3a'; c.font = '900 22px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('!', px, py - 103); }
  if (a > 3.35 && !fishFx.done) {
    fishFx.done = true; fishFx = null;
    give('ryba'); learn('ryba'); S.cd.fish = now() + 15000; save();
    toast('+1 🐟 риба'); say('w_ryba'); blip(990, 0.15);
  }
}
function interact(e) {
  if (e.w === 'ryba' || e.kind === 'pond') return fishCard(e);
  if (e.cat) return catSheet(e);
  talkNpc = e.kind === 'npc' ? e.npc : e.kind === 'shop' ? 'oksana' : null;
  if (e.kind === 'npc' && e.route2) return toast('🌙 ' + PH.dobranich.uk + '!' + (stage() < 3 ? ' · Everyone is heading home for the night.' : ''), 2400);
  if (e.kind === 'npc') return talk(NPC[e.npc]);
  if (e.kind === 'plot') return plotSheet(e.i);
  if (e.kind === 'shop' && nightNow()) return toast('🌙 Зачинено' + (stage() < 3 ? ' · The market is closed for the night. Come back in the morning.' : ''), 3000);
  if (e.kind === 'shop') { if (learn('rynok')) say('w_rynok'); else reviewed('rynok'); return shop(); }
  if (e.k === 'oliaHome') return wordCard('khata', { owner: '🏠 Хата баби Олі', note: xl("Grandma Olia's cottage. She is inside, cooking."), acts: [{ k: 'enter', fn: enterOlia }] });
  if (e.w === 'tserkva') return wordCard('tserkva', { note: '⛪ ' + xl('The village church. Go in: it is quiet and beautiful inside.'), acts: [{ k: 'enter', fn: enterChurch }] });
  if (e.w === 'mlyn') return wordCard('mlyn', { note: '⚙️ ' + xl('A working windmill: go in and grind wheat into flour.'), acts: [{ k: 'enter', fn: enterMill }] });
  if (e.kind === 'home') return wordCard('khata', { owner: '🏠 ' + PH.moia_khata.uk, note: xl('This is your cottage.'), clips: ['p_moia_khata'], acts: [{ k: 'enter', fn: enterHome }] });
  if (e.w === 'krynytsia') {
    const have = S.bag.voda || 0;
    return wordCard('krynytsia', { note: `💧 ${have} / ${WATER_MAX}${xl((have < WATER_MAX ? ' · Fill your can here.' : ' · Your can is full.'))}`, acts: have < WATER_MAX ? [{ k: 'fill', fn: () => {
      const add = Math.min(WELL_GIVES, WATER_MAX - have); S.bag.voda = have + add; learn('voda'); hud(); bumpWater(); save(); closeSheet(); toast(`💧 +${add} ${W.voda.uk}  (${S.bag.voda} / ${WATER_MAX})`); say('w_voda'); blip(700, 0.12);
    } }] : [] });
  }
  if (e.k === 'my_churn') return churnCard();
  if (e.k === 'board') return boardCard();
  if (e.k === 'bohdanHome' || e.k === 'tarasHome') { const n = NPC[e.k === 'bohdanHome' ? 'bohdan' : 'taras']; return wordCard('khata', { owner: '🏠 ' + (e.k === 'bohdanHome' ? 'Хата пана Богдана' : 'Хата Тараса й Оксани'), note: xl(e.k === 'bohdanHome' ? `${n.nameEn}'s cottage` : 'Taras the fisherman and Oksana from the market live here with their son Andriiko (and Brovko the dog).') }); }
  if (e.k === 'feeder') return feederCard();
  if (e.k === 'yizhak_spyt') return wordCard('yizhak', { note: `💤 <b>${PH.yizhak_spyt.uk}</b>${xl('<br>' + PH.yizhak_spyt.en)}`, clips: ['p_yizhak_spyt'] });
  if (e.k === 'nest') { const sea = season(); if (sea === 'osin' || sea === 'zyma') { learn('hnizdo'); return wordCard('hnizdo', { note: `🪺 ${W.leleka.uk}${xl(" · The storks have flown south for the winter. They'll be back in spring.")}` }); } }
  if (e.k === 'koloda') return chopStart();
  if (winter() && e.give === 'yabluko') return wordCard(e.w, { note: `❄️ ${W.zyma.uk}${xl(' · No apples in winter. The market sells them.')}` });
  if (e.k === 'my_mill') return millCard();
  if (e.give) return wordCard(e.w, { acts: ready(e) ? [{ k: 'take', fn: () => take(e) }] : [] });
  wordCard(e.w);
}

// ------------------------------------------------------------------ garden
let noWater = false;
function plotSheet(i) {
  noWater = false;
  const p = S.plots[i];
  const fresh1 = learn('horod');
  cur = { plot: i };
  const head = `<h3><span><span class="uk">${W.horod.uk}</span> ${stage() < 2 ? `<small>${W.horod.en}</small>` : ''}</span>${btn('hear', 'w_horod', '🔊', 'round blue')}</h3>`;
  let body;
  if (!p.c && winter()) {
    body = `<div class="muted">❄️ <b>${W.zyma.uk}</b>${stage() < 3 ? '<br>Nothing grows in winter: the garden sleeps under the snow. Buy vegetables at the market («Овочі»).' : ''}</div>`;
  } else if (!p.c) {
    const seeds = Object.keys(S.seeds).filter(k => S.seeds[k] > 0);
    body = seeds.length
      ? `<div class="muted">${lab('plant')}</div><div class="grid">${seeds.map(k => `<button class="it" data-a="plant" data-v="${k}"><span class="q">${S.seeds[k]}</span><img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div>${known(k) < 2 ? `<div class="e">${W[k].en}</div>` : ''}</button>`).join('')}</div>`
      : `<div class="muted">🌱 ${D.ui.empty[0]}.<br>${stage() < 3 ? 'Buy seeds (насіння) at the market.' : 'Купи насіння на ринку.'}</div>`;
  } else if (!p.wet) {
    const have = S.bag.voda || 0;
    noWater = have === 0;
    body = `<div class="card"><img class="big" src="${iconURL(p.c)}" alt=""><div class="word">${W[p.c].uk}</div><div class="en">💧 ${D.ui.thirsty[0]}${stage() < 3 ? ' · ' + D.ui.thirsty[1] : ''}</div>` +
      (have ? `<div class="row">${btn('water', '', `💧 ${lab('water')}`, 'blue')}</div><div class="muted" style="padding:8px 0 0">💧 ${have} / ${WATER_MAX}</div>`
        : `<div class="hint"><b>${PH.no_water.uk}</b>${stage() < 3 ? `<br>${PH.no_water.en}` : ''}</div><div class="row">${btn('goWell', '', '🪣 ' + lab('towell'), 'blue')}</div>`) + `</div>`;
  } else if (now() < p.ready) {
    body = `<div class="card"><img class="big" src="${iconURL(p.c)}" alt=""><div class="word">${W[p.c].uk}</div><div class="en">🌱 ${D.ui.growing[0]}${stage() < 3 ? ' · ' + D.ui.growing[1] : ''} (${Math.ceil((p.ready - now()) / 1000)} s)</div></div>`;
  } else {
    body = `<div class="card"><img class="big" src="${iconURL(p.c)}" alt=""><div class="word">${W[p.c].uk}</div><div class="row">${btn('harvest', '', lab('harvest'))}</div></div>`;
  }
  openSheet(head + body);
  if (fresh1) say('w_horod'); else if (noWater) say('p_no_water');
}

// ------------------------------------------------------------------ market
let shopTab = 'food', shopSel = null;
// Cottage and cat things are one of a kind: owning one (placed or not) means the market won't sell another.
const catThings = k => (S.home[k] || 0) + nPlaced(k);
const owned = k => shopTab === 'clothes' ? !!(S.wardrobe && S.wardrobe[k]) : shopTab === 'farm' ? farmN(k) >= FARM_MAX[k] : shopTab === 'cats' && MULTI[k] ? catThings(k) >= MULTI[k] : (shopTab === 'home' || shopTab === 'cats' || shopTab === 'tools') && ((S.home[k] || 0) > 0 || !!S.decor[k] || !!S.gear[k]);
const sellPrice = id => { if (id === 'ryba') return winter() ? 8 : 4;   // a fish takes a rod and some patience (and in winter, a hole in the ice)
  if (id === 'kalyna' && winter()) return 4;   // the red berries are about the only thing to pick in winter
  for (const t of ['food', 'seeds']) if (D.shop[t][id]) return Math.max(1, Math.floor(D.shop.food[id] ? D.shop.food[id] / 2 : 3)); return 2; };   // things you simply pick (flowers, mushrooms, berries) sell for less
let shopShown = null;   // the tab the shop was last drawn on
// The shop's title and its row of tabs, shown above every tab (Oksana's helping game too, so you can always
// switch to another tab). Redrawing rebuilds the row, which would jump back to the first tab: shopTabsKeep()
// puts it back where it was and makes sure the chosen tab is fully in view.
function shopHead() {
  const tabs = ['food', winter() ? 'veg' : 'seeds', 'tools', 'farm', 'home', 'clothes', 'cats', 'sell'];   // (the 'help out' rounds were taken out at the user's request)
  const tabBtn = k => `<button class="tab ${shopTab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${D.ui[k][0]}${stage() < 3 ? `<small>${D.ui[k][1]}</small>` : ''}</button>`;
  return `<h3><span><span class="uk">${W.rynok.uk}</span> ${stage() < 2 ? `<small>${W.rynok.en}</small>` : ''}</span><span>💰 ${devOn ? '∞' : S.coins} ₴</span></h3><div class="tabs" data-shop="1">${tabs.map(tabBtn).join('')}</div>`;
}
const shopTabsX = () => { const r = sheetOpen() && sheet.querySelector('.tabs'); return r ? r.scrollLeft : null; };
function shopTabsKeep(keepX) {
  const row = sheet.querySelector('.tabs'), on = row && row.querySelector('.tab.on');
  if (!row) return;
  row.scrollLeft = keepX || 0;
  if (on) { const l = on.offsetLeft - row.offsetLeft, r = l + on.offsetWidth; if (l < row.scrollLeft) row.scrollLeft = l - 8; else if (r > row.scrollLeft + row.clientWidth) row.scrollLeft = r - row.clientWidth + 8; }
}
function shop() {
  let body = '';
  if (winter() && shopTab === 'seeds') shopTab = 'veg';   // in winter the seeds tab becomes vegetables
  if (!winter() && shopTab === 'veg') shopTab = 'seeds';
  if (shopTab === 'help') shopTab = 'food';
  if (shopTab === 'clothes') {
    const st = stage();
    body = `<div class="outfits">${Object.keys(D.shop.clothes).map(k => { const had = owned(k), price = D.shop.clothes[k]; return `<div class="ocard ${had ? 'owned' : ''}">
      <img src="${bigIconURL(k)}" alt="">
      <div class="n">${W[k].uk}</div>${known(k) < 2 || st < 3 ? `<div class="e">${W[k].en}</div>` : ''}
      ${had ? `<div class="have">✓ ${D.ui.have[0]}${st < 3 ? ' · in your wardrobe' : ''}</div>` : `<button class="b blue" data-a="buy" data-v="${k}">${lab('buy')} · ${price} ₴</button>`}
      ${btn('hearWord', k, '🔊', 'round ghost')}</div>`; }).join('')}</div><div class="muted" style="font-size:14px;padding:2px 0 0">⟷ ${st < 3 ? 'Swipe to see them all' : ''}</div>`;
    setTimeout(() => sheet.classList.add('fixed'), 0);
    const keepX = shopTabsX(), row0 = shopShown === 'clothes' && sheet.querySelector('.outfits'), keepO = row0 ? row0.scrollLeft : 0;   // buying redraws the tab: the row stays where it was
    shopShown = shopTab; openSheet(shopHead() + body); shopTabsKeep(keepX);
    const row = sheet.querySelector('.outfits'); if (row && keepO) { row.style.scrollSnapType = 'none'; row.scrollLeft = keepO; requestAnimationFrame(() => { row.style.scrollSnapType = ''; }); }
    return;
  }
  if (shopTab === 'sell') {
    const items = Object.keys(S.bag).filter(k => S.bag[k] > 0);
    body = items.length ? `<div class="grid">${items.map(k => `<button class="it" data-a="sell" data-v="${k}"><span class="q">${S.bag[k]}</span><img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div><div class="e">+${sellPrice(k)} ₴</div></button>`).join('')}</div>` : `<div class="muted">🧺 ${D.ui.empty[0]}${stage() < 3 ? ' · ' + D.ui.empty[1] : ''}</div>`;
  } else {
    const list = D.shop[shopTab];
    body = `<div class="grid">${Object.keys(list).map(k => { const had = owned(k); return `<button class="it ${shopSel === k ? 'sel' : ''} ${had ? 'owned' : ''}" data-a="pick" data-v="${k}">${shopTab === 'seeds' ? '<span class="q">🌱</span>' : shopTab === 'farm' ? `<span class="q">${farmN(k)}/${FARM_MAX[k]}</span>` : shopTab === 'cats' && MULTI[k] && catThings(k) ? `<span class="q">${catThings(k)}/${MULTI[k]}</span>` : ''}<img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div>${known(k) < 2 ? `<div class="e">${W[k].en}</div>` : ''}${shopTab === 'seeds' ? `<div class="e">🌱 ${W.nasinnia.uk}${stage() < 3 ? ' · seeds' : ''}</div>` : ''}<div class="e"><b>${had ? '✓ ' + D.ui.have[0] + (stage() < 3 ? ' · ' + D.ui.have[1] : '') : list[k] + ' ₴'}</b></div></button>`; }).join('')}</div>`;
    if (shopSel && list[shopSel] && !owned(shopSel)) body += `<div class="buyrow"><div class="what">${W[shopSel].uk} — ${list[shopSel]} ₴<br><small style="font-weight:600;color:var(--soft)">${D.prices[list[shopSel]]}</small></div>${btn('buy', shopSel, lab('buy'), 'blue')}</div>`;
  }
  setTimeout(() => sheet.classList.add('fixed'), 0);   // the market keeps one height, however few items a tab has
  const keepX = shopTabsX(), keepY = keepX !== null && shopShown === shopTab ? sheet.scrollTop : 0;   // picking an item on the same tab keeps the list where it was
  shopShown = shopTab;
  openSheet(shopHead() + body);
  sheet.scrollTop = keepY; shopTabsKeep(keepX);
}
// Helping at the stall: Oksana asks for something by name, you hand it over.
// This is where words that are due for review come back.
let help = null;
function helpRound(n) {
  setTimeout(() => sheet.classList.add('fixed'), 0);
  const pool = [...Object.keys(D.shop.food), ...Object.keys(D.shop.seeds)];
  const due = pool.filter(k => S.words[k] && isFresh(k));
  const target = due.length && Math.random() < 0.75 ? pick(due) : pick(pool);
  const opts = [target];
  while (opts.length < 4) { const k = pick(pool); if (!opts.includes(k)) opts.push(k); }
  opts.sort(() => Math.random() - 0.5);
  help = { n, target, tries: 0 };
  const w = W[target], hide = stage() >= 2 && known(target) >= 2, keepX = shopTabsX();
  shopShown = 'help';
  openSheet(shopHead() + `<div class="dlg"><img class="face" src="${faceURL(NPC.oksana.look)}" alt=""><div><div class="who">${NPC.oksana.name} · ${n + 1}/5</div>
    <div class="line">${hide ? '🔊 …' : '«' + cap(w.uk) + ', будь ласка!»'}</div>${stage() < 2 ? `<div class="en">"${cap(w.en)}, please!"</div>` : ''}</div></div>
    <div class="grid" style="margin-top:14px;grid-template-columns:repeat(4,1fr)">${opts.map(k => `<button class="it" data-a="hand" data-v="${k}" style="min-height:76px"><img src="${iconURL(k)}" alt="">${stage() < 2 ? `<div class="e">${W[k].uk}</div>` : ''}</button>`).join('')}</div>
    <div class="row">${btn('hear2', target, '🔊', 'round blue')}</div>`);
  shopTabsKeep(keepX);
  say('w_' + target, 'p_bud_laska');
}

// ------------------------------------------------------------------ villagers
function sourceHint(id) {
  if (stage() >= 3) return '';
  if (id === 'drova') return '🪓 Chop firewood at the block by your cottage.';
  if (winter() && D.shop.veg[id]) return '❄️ Nothing grows in winter: buy it at the market («Овочі»).';
  if (D.shop.seeds[id]) return '🌱 Grow it in your garden. Seeds are at the market.';
  if (D.shop.food[id]) return '🧺 Oksana sells it at the market.';
  if (id === 'kalyna') return '🌿 Kalyna bushes grow in the valley.';
  if (id === 'pshenytsia') return '🌾 Wheat grows in the field beside the church, and in a strip by the pond.';
  if (id === 'mak') return '🌺 Poppies grow beside the sunflower field.';
  if (D.shop.home[id]) return '🧺 Oksana sells it at the market, for your cottage.';
  return { yabluko: '🌳 Pick one from the apple tree by your cottage.', kvitka: '🌷 Pick a flower.', hryb: '🍄 Mushrooms grow near the trees.', voda: '💧 Draw some from the well.', ryba: winter() ? (S.gear && S.gear.lodobur ? '🧊 Fish through the ice on the pond with your ice auger.' : '🧊 Buy an ice auger (льодобур) at the market, then fish through the ice.') : S.gear && S.gear.vudka ? '🎣 Catch one in the pond.' : '🎣 Buy a fishing rod (вудка) at the market, then fish in the pond.' }[id] || '';
}
let dlg = null;
function dialog(npc, steps, i = 0) {
  const st = steps[i];
  if (!st) { dlg = null; return closeSheet(); }
  dlg = { npc, steps, i };
  const s = stage();
  const face = st.me ? faceURL(ME) : faceURL(npc.look);
  const who = st.me ? (s < 3 ? 'Ти · You' : 'Ти') : npc.name + (s < 2 ? ` · ${npc.nameEn}` : '');
  const en = s < 2 ? `<div class="en">${st.en}</div>` : `<button class="peek" data-a="peekLine">👁 ${D.ui.show[0]}${stage() < 3 ? " · " + D.ui.show[1] : ""}</button>`;
  const choices = st.choices ? `<div class="choices">${st.choices.map((c, k) => `<button class="b ghost" data-a="choose" data-v="${k}">${c.uk}<small class="cen"${s < 2 ? '' : ' style="display:none"'}>${c.en}</small></button>`).join('')}</div>` : '';
  openSheet(`<div class="dlg"><img class="face" src="${face}" alt=""><div style="flex:1"><div class="who">${who}</div>
    <div class="line">${st.uk}</div>${s < 2 ? `<div class="tr">${translit(st.uk)}</div>` : ''}<div id="en">${en}</div></div></div>
    ${st.hint ? `<div class="hint">${st.hint}</div>` : ''}${choices}
    <div class="row">${btn('hear', st.clip, '🔊', 'round blue')}${st.choices ? '' : btn('next', '', lab('next'))}</div>`);
  cur = { en: st.en };
  say(st.clip);
}
const line = (npc, key) => ({ uk: npc.lines[key].uk, en: npc.lines[key].en, clip: `v_${npc.id}_${key}` });
const mine = id => ({ uk: PH[id].uk, en: PH[id].en, clip: 'p_' + id, me: true });
// Grandma Olia is cooking. She asks for each ingredient in turn (taking all you have with you at once),
// and when she has everything she cooks the dish and you eat it together.
const MASS = ['drova', 'boroshno', 'syr', 'maslo', 'sil', 'kapusta', 'kartoplia', 'morkva', 'tsybulia', 'pshenytsia', 'med', 'rys'];
function recipeList(R) {
  return `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:6px">${R.needs.map(id => { const n = recipeHave(id), full = n >= NEED; return `<span style="position:relative;text-align:center;opacity:${n ? 1 : 0.45}"><img src="${iconURL(id)}" style="width:34px;height:34px;display:block;margin:0 auto" alt=""><span style="font-size:14px;font-weight:800;color:${full ? '#3f8a3a' : '#8a7566'}">${full ? '✓' : n + '/' + NEED}</span></span>`; }).join('')}</div>`;
}
function talkOlia(npc, n, steps) {
  const R = curRecipe(), st = stage();
  if (S.recipe.started !== S.recipe.i || (S.recipe.dish && S.recipe.dish !== R.id)) { steps.push(line(npc, 'recipe_' + R.id)); S.recipe.started = S.recipe.i; learn(R.dish); }
  S.recipe.dish = R.id;   // a new season can swap her dish: she says what she's making now
  const missing = () => R.needs.filter(x => recipeHave(x) < NEED);
  let handed = 0; const gave = [];
  for (const x of R.needs) {   // hand them over now, so closing the chat early never loses the delivery
    const give = Math.min(S.bag[x] || 0, NEED - recipeHave(x));
    if (give > 0) { S.bag[x] -= give; S.recipe.have[x] = recipeHave(x) + give; handed += give; useWord(x, true); gave.push(`−${give} ${W[x].uk}${S.bag[x] ? ` (${S.bag[x]} ${stage() < 3 ? 'left' : '🧺'})` : ''}`); }
  }
  // say what she took, and what's still in your basket: she only takes what the dish needs
  if (gave.length) toast(gave.join(' · '), 3200);
  if (handed) {
    hud(); save();   // no pay: Grandma's help is a favour, money comes only from selling
    const hand = mine('os');
    const thanks = line(npc, 'thanks');
    thanks.hint = recipeList(R);
    steps.push(hand, thanks);
  }
  const left = missing();
  if (!left.length) {
    n.q = null;
    steps[steps.length - 1].after = (f => () => { if (f) f(); setTimeout(() => speakRound(R), 250); })(steps[steps.length - 1].after);
  } else {
    const next = left[0];
    n.q = next;
    steps.push({
      uk: D.questLine.uk.replace('%s', W[next].acc || W[next].uk),
      en: D.questLine.en.replace('%s', (MASS.includes(next) ? 'some ' : /^[aeiou]/i.test(W[next].en) ? 'an ' : 'a ') + W[next].en),
      clip: `q_${npc.id}_${next}`,
      hint: `${st < 3 ? `<b>${W[R.dish].uk}</b>${st < 2 ? ' · ' + W[R.dish].en : ''}: ` : ''}${recipeTotal(R)}/${R.needs.length * NEED}${recipeList(R)}<div style="margin-top:6px">${!winter() && (S.seeds[next] || 0) > 0 ? `🌱 <b>${D.ui.plantit[0]}</b>${st < 3 ? `<br>${D.ui.plantit[1].replace('%s', W[next].en)}` : ''}` : sourceHint(next)}</div>`,
    });
  }
  save(); setGuide();
  dialog(npc, steps);
}
// The meal: Olia's dish on the table, she calls you to eat, you say it's delicious.
function mealScene(R) {
  const npc = NPC.olia, st = stage();
  cur = { meal: R.id, en: npc.lines['ready_' + R.id].en };
  openSheet(`<div class="card">
    <div class="tag">🍽️ Смачного!${st < 3 ? ' · Enjoy your meal!' : ''}</div>
    <div style="display:flex;align-items:flex-end;justify-content:center;gap:4px;margin:4px 0">
      <img src="${faceURL(npc.look)}" style="width:76px;height:76px;border-radius:18px;background:#e8f4d9" alt="">
      <img src="${iconURL(R.dish)}" style="width:150px;height:150px" alt="">
      <img src="${faceURL(ME)}" style="width:76px;height:76px;border-radius:18px;background:#e8f4d9" alt="">
    </div>
    <div class="word" style="font-size:30px">${npc.lines['ready_' + R.id].uk}</div>
    <div id="en">${st < 3 ? `<div class="en">${npc.lines['ready_' + R.id].en}</div>` : `<button class="peek" data-a="peekLine">👁 ${D.ui.show[0]}${stage() < 3 ? " · " + D.ui.show[1] : ""}</button>`}</div>
    <div class="row">${btn('hear', 'v_olia_ready_' + R.id, '🔊', 'round blue')}${btn('eatMeal', '', `${PH.duzhe_smachno.uk}<small class="cen"${st < 3 ? '' : ' style="display:none"'}>${PH.duzhe_smachno.en}</small>`)}</div></div>`);
  say('v_olia_ready_' + R.id);
}

// ------------------------------------------------------------------ cooking with Grandma
// Once she has every ingredient, you cook the dish together, one step at a time: each step is one of her
// commands with its action word (verb) highlighted.
// Each step is a little scene drawn on a canvas, with a real implement you take hold of and work:
//   chop   поріж     hold the knife and chop up and down, in one press, slices falling away
//   peel   почисть   stroke the knife down the vegetable, peel curling off
//   grate  натри     take the vegetable and rub it up and down the grater
//   knead  замісь    press the dough down with your hands, again and again
//   roll   розкачай  roll the pin back and forth until the dough is a thin round
//   shape  зліпи, загорни   press each piece to fold it
//   wash   помий     scrub the fruit round in the basin of water
//   pour   налий, насип     take the jug (or the flour bag) and tip it over the pot
//   heat   звари, посмаж    turn the stove knob up and keep it cooking
//   stir   помішай, змішай  the spoon points down into a bowl that stays put; steer it round
//   add    додай     carry each one over to the pot and let go
//   shake  посоли    shake the salt cellar over the pot
//   taste  спробуй   lift a spoonful up out of the pot
// Every action flashes the action word, and while you keep at it the word is said over and over (never cut
// off part-way); it stops when you stop.
const verbHL = uk => uk.replace(/^([^\s!,.]+)/, '<span class="verb">$1</span>');
const COOK_KIND = { porizh: 'chop', pochyst: 'peel', natry: 'grate', zamis: 'knead', rozkachai: 'roll', zlipy: 'shape', zahorny: 'shape', pomyi: 'wash', nalyi: 'pour', nasyp: 'pour', zvary: 'heat', posmazh: 'heat', pomishai: 'stir', zmishai: 'stir', dodai: 'add', posoly: 'shake', sprobui: 'taste' };
const COOK_HOW = {
  chop: ['Підніми ніж і ріж по лінії', 'Lift the knife and bring it down on the dashed line'], peel: ['Веди ножем униз по овочу', 'Stroke the knife down the vegetable'],
  grate: ['Три об тертку вгору-вниз', 'Rub it up and down the grater'], knead: ['Тисни на тісто руками', 'Press down on the dough'],
  roll: ['Качай качалкою вперед-назад', 'Roll the pin back and forth'], shape: ['Торкнися кожного шматочка', 'Press each piece to fold it'],
  wash: ['Три у воді по колу', 'Scrub it round in the water'], pour: ['Візьми й нахили над каструлею', 'Take it and tip it over the pot'],
  heat: ['Поверни ручку плити', 'Turn the stove knob up'], stir: ['Тримай ложку за кінець і веди по колу', 'Hold the spoon by its end and stir round the bowl'],
  add: ['Неси в каструлю й відпусти', 'Carry each one to the pot and let go'], shake: ['Потруси над каструлею', 'Shake it over the pot'],
  taste: ['Візьми ложку за кінець і підніми', 'Hold the spoon by its end and lift it out'],
  crack: ['Розбий яйце об край миски', 'Knock the egg on the edge of the bowl'],
};
let ck = null;
function cookScene(R, dev) {
  if (!R.steps || !R.steps.length) return mealScene(R);
  ck = { R, i: 0, prog: 0, done: false, dev };
  cookStep(['v_olia_cook']);
}
function cookStep(first = []) {
  const R = ck.R, st = R.steps[ck.i], npc = NPC.olia, L = npc.lines[st.line], stg = stage();
  let kind = COOK_KIND[st.v] || 'stir';
  if (st.v === 'dodai' && st.w === 'yaitse') kind = 'crack';   // an egg is cracked into the bowl, not dropped in whole
  if (st.v === 'dodai' && st.w === 'med') kind = 'pour';       // honey is poured from its jar
  ck.prog = 0; ck.done = false;
  learn(st.v); learn(st.w);
  const how = COOK_HOW[kind];
  openSheet(`<div class="card gamecard">
    <div class="tag">👩‍🍳 ${W[R.dish].uk} · ${ck.i + 1}/${R.steps.length}</div>
    <div class="cookline"><img src="${faceURL(npc.look)}" alt=""><div><div class="word" style="font-size:27px">${verbHL(L.uk)}</div>${stg < 3 ? `<div class="en">${L.en}</div>` : ''}</div></div>
    <div class="vchip"><span class="verb">${W[st.v].uk}</span> ${stg < 3 ? '= ' + W[st.v].en : xl('= ' + W[st.v].en)} <small>· дієслово${stg < 3 ? ' (verb, an action word)' : ''}</small></div>
    <canvas id="cookPad" class="cookpad" style="width:100%;display:block;height:250px"></canvas>
    <div class="cookbar"><i id="ckBar"></i></div>
    <div class="muted" style="min-height:2.6em">${how[0]}${stg < 3 ? ' · ' + how[1] : ''}</div>
    <div class="row">${btn('hear', 'v_olia_' + st.line, '🔊', 'round blue')}${btn('close', '', lab('close'), 'ghost')}</div></div>${subsHTML()}`); subNow = null;
  say(...first, 'v_olia_' + st.line);
  cookWire(kind, st);
}
// What a step needs: the implement (where it rests, how big a grab it takes) and its own state.
function cookSetup(kind, st) {
  const n = Math.max(1, st.n || { chop: 6, peel: 5, knead: 6, shape: 5, add: 2, shake: 3, taste: 1 }[kind] || 1);
  const S0 = { kind, st, n, ev: 0, tool: { x: 0.78, y: 0.3, hx: 0.78, hy: 0.3, held: false }, bits: [], fx: [], armed: true, acc: 0, lastY: null, lastX: null };
  if (kind === 'peel') S0.tool = { x: 0.74, y: 0.28, hx: 0.74, hy: 0.28 };
  if (kind === 'chop') S0.tool = { x: 0.8, y: 0.18, hx: 0.8, hy: 0.18 };
  if (kind === 'knead') S0.tool = { x: 0.5, y: 0.22, hx: 0.5, hy: 0.22 };
  if (kind === 'grate' || kind === 'wash') S0.tool = { x: 0.22, y: 0.4, hx: 0.22, hy: 0.4 };
  if (kind === 'roll') S0.tool = { x: 0.5, y: 0.86, hx: 0.5, hy: 0.86 };
  if (kind === 'pour' || kind === 'shake') S0.tool = { x: 0.2, y: 0.42, hx: 0.2, hy: 0.42 };
  if (kind === 'heat') { S0.tool = { x: 0.86, y: 0.84, hx: 0.86, hy: 0.84 }; S0.knob = 0; }
  if (kind === 'stir') { S0.tool = { x: 0.62, y: 0.62, hx: 0.62, hy: 0.62 }; S0.swirl = 0; S0.ang = null; }
  if (kind === 'taste') S0.tool = { x: 0.56, y: 0.66, hx: 0.56, hy: 0.66 };
  if (kind === 'crack') S0.tool = { x: 0.2, y: 0.56, hx: 0.2, hy: 0.56 };
  if (kind === 'add') { S0.items = Array.from({ length: n }, (_, i) => ({ x: 0.13 + (i % 3) * 0.08, y: 0.72 - Math.floor(i / 3) * 0.12, home: true, inPot: false })); S0.tool = null; }
  if (kind === 'shape') S0.items = Array.from({ length: n }, (_, i) => ({ x: 0.2 + (i % 5) * 0.15, y: 0.62 + (i % 2) * 0.12, f: 0, done: false }));
  if (kind === 'roll') S0.flat = 0;
  return S0;
}
function cookWire(kind, st) {
  const pad = $('#cookPad'), dpr = Math.min(2, window.devicePixelRatio || 1), me = ck;
  fitPad(pad, 250);
  pad.width = Math.round(pad.clientWidth * dpr); pad.height = Math.round(pad.clientHeight * dpr);
  ck.k = dpr; ck.s = cookSetup(kind, st);
  for (const ev of ['touchstart', 'touchmove', 'touchend']) pad.addEventListener(ev, e => e.stopPropagation(), { passive: true });   // keep the sheet's swipe-to-close off these
  const at = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };   // pad fractions
  pad.addEventListener('pointerdown', e => {
    e.preventDefault(); if (me !== ck || ck.done) return; try { pad.setPointerCapture(e.pointerId); } catch (er) {}
    const [x, y] = at(e), s = ck.s; s.down = { x, y }; s.lastX = x; s.lastY = y;
    if (s.kind === 'add') { const it = s.items.filter(i => i.home).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]; if (it && Math.hypot(it.x - x, (it.y - y) * 0.6) < 0.16) { s.held = it; it.home = false; it.ox = it.x - x; it.oy = it.y - y; blip(520, 0.03); } else s.miss = nowT; return; }
    if (s.kind === 'shape') { for (const it of s.items) if (!it.done && Math.hypot(it.x - x, (it.y - y) * 0.6) < 0.09) { it.done = true; it.t = nowT; cookAct(true); cookEv(); break; } return; }
    const T = s.tool;   // take hold of the implement (a generous grab, but it has to be on it)
    const G0 = T && ckGrip(s);
    if (T && Math.hypot(G0.x - x, (G0.y - y) * 0.6) < 0.2) { T.held = true; T.ox = G0.x - x; T.oy = G0.y - y; blip(520, 0.03); }
    else s.miss = nowT;   // flash the implement so it's clear what to take
  });
  pad.addEventListener('pointermove', e => {
    if (me !== ck || !ck.s || !ck.s.down) return; const [x, y] = at(e), s = ck.s; s.down.x = x; s.down.y = y;
    if (s.held) { s.held.x = x + s.held.ox; s.held.y = y + s.held.oy; }
    if (s.tool && s.tool.held) cookMove(x + s.tool.ox, y + s.tool.oy);
  });
  const up = () => {
    if (me !== ck || !ck.s) return; const s = ck.s; s.down = null;
    if (s.tool) s.tool.held = false;
    if (s.held) { const it = s.held; s.held = null; if (Math.abs(it.x - 0.62) < 0.16 && it.y > 0.38 && it.y < 0.82) { it.inPot = true; it.t = nowT; blip(420, 0.06); cookAct(true); cookEv(); } else it.home = true; }
  };
  for (const ev of ['pointerup', 'pointercancel']) pad.addEventListener(ev, up);
  const S1 = ck.s; requestAnimationFrame(() => cookFrame(S1));
}
// The implement moves with your finger; the moves that do the work are counted here.
// Where you hold an implement. A spoon is gripped at the top of its handle, its bowl down in the food: the
// handle runs up and to the right from the bowl (T) to the grip.
const SPOON_GRIP = { stir: [0.12, -0.42], taste: [0.14, -0.38] };
const ckGrip = s => { const T = s.tool, o = SPOON_GRIP[s.kind]; return o ? { x: T.x + o[0], y: T.y + o[1] } : T; };
function cookMove(x, y) {
  const s = ck.s, T = s.tool, k = s.kind;
  const py = T.y;
  if (k === 'chop') {
    // T is the handle; the blade lies flat to its left, edge down. Lift the edge above the dashed line, then
    // bring it down onto the line with the blade over the vegetable: one slice comes off the top.
    const pad0 = $("#cookPad"), edge = 0.024 * (pad0 ? pad0.width / pad0.height : 1.5), over = x => x - CK_BLADE + 0.04 < 0.5 && x - 0.04 > 0.5, gY = ckGuide();
    T.x = Math.max(0.32, Math.min(0.92, x));
    T.y = Math.max(0.06, Math.min(over(T.x) && !ck.done ? gY - edge + 0.004 : 0.72, y));   // over the vegetable the blade rests on the cut line
    if (T.y + edge < gY - 0.09) s.armed = true;
    if (s.armed && T.y + edge >= gY - 0.002) { s.armed = false;
      if (over(T.x)) { cookAct(true); const b0 = ckLeft(); cookEv(); s.bits.push({ a: ckLeft(), b: b0, t: nowT }); blip(300 + Math.random() * 120, 0.04); }
      else { blip(220, 0.03); s.missCut = nowT; }   // not over the vegetable: the knife only taps the board
    }
  } else if (k === 'peel') {
    T.x = Math.max(0.3, Math.min(0.92, x)); T.y = Math.max(0.12, Math.min(0.78, y));
    if (T.x - 0.1 > 0.36 && T.x - 0.1 < 0.64 && T.y > 0.35) {
      if (T.y > py) { s.acc += T.y - py; cookAct(false); } else if (T.y < py - 0.01) s.acc = 0;   // one stroke down the vegetable, one strip of peel
      if (s.acc > 0.2) { s.acc = -9; cookEv(); s.bits.push({ x: T.x - 0.1, t: nowT }); blip(500, 0.03); }
    }
  } else if (k === 'knead') {
    T.x = Math.max(0.3, Math.min(0.7, x)); T.y = Math.max(0.12, Math.min(0.5, y));
    if (T.y < 0.34) s.armed = true;
    if (s.armed && T.y >= 0.49) { s.armed = false; s.squash = nowT; cookAct(true); cookEv(); blip(240, 0.06); }
  } else if (k === 'grate' || k === 'wash' || k === 'shake') {
    T.x = Math.max(0.08, Math.min(0.92, x)); T.y = Math.max(0.12, Math.min(0.85, y));
    const d = Math.hypot(T.x - s.lastX0 || 0, T.y - (s.lastY0 || T.y)); s.lastX0 = T.x; s.lastY0 = T.y;
    if (k === 'grate' && Math.abs(T.x - 0.62) < 0.13 && T.y > 0.25 && T.y < 0.7) { s.acc += Math.abs(T.y - py); if (Math.abs(T.y - py) > 0.002) cookAct(false); if (s.acc > 0.5) { s.acc = 0; cookEv(); } if (Math.random() < Math.abs(T.y - py) * 8) s.bits.push({ x: 0.62 + (Math.random() - 0.5) * 0.1, t: nowT }); }
    if (k === 'wash' && Math.hypot((T.x - 0.55) / 0.3, (T.y - 0.66) / 0.2) < 1) { s.acc += d; if (d > 0.002) cookAct(false); if (Math.random() < d * 6) s.fx.push({ x: T.x + (Math.random() - 0.5) * 0.1, y: T.y, t: nowT }); if (s.acc > 0.6) { s.acc = 0; cookEv(); } }
    if (k === 'shake' && Math.abs(T.x - 0.62) < 0.18 && T.y < 0.55) {   // each change of direction, up or down, is a shake
      const dir = Math.sign(T.y - py); if (dir && s.dir && dir !== s.dir && Math.abs(T.y - s.turnY) > 0.05) { s.turnY = T.y; s.shakes = (s.shakes || 0) + 1; cookAct(true); for (let i = 0; i < 6; i++) s.bits.push({ x: T.x + (Math.random() - 0.5) * 0.05, y: T.y + 0.08, t: nowT }); blip(800, 0.02); if (s.shakes % 2 === 0) cookEv(); }
      if (dir) { if (dir !== s.dir) s.turnY = s.turnY ?? T.y; s.dir = dir; }
    }
  } else if (k === 'roll') {
    T.x = Math.max(0.25, Math.min(0.75, x)); T.y = Math.max(0.35, Math.min(0.9, y));
    if (T.y < 0.82 && T.y > 0.4) { const d = Math.abs(T.y - py); s.flat = Math.min(1, s.flat + d * 0.8); s.acc += d; if (d > 0.002) cookAct(false); if (s.acc > 0.3) { s.acc = 0; cookEv(); } }
  } else if (k === 'pour') {
    T.x = Math.max(0.08, Math.min(0.92, x)); T.y = Math.max(0.1, Math.min(0.85, y));
  } else if (k === 'taste') {   // you move the grip; the spoon's bowl comes up out of the pot with it
    const o = SPOON_GRIP.taste; T.x = Math.max(0.1, Math.min(0.8, x - o[0])); T.y = Math.max(0.4, Math.min(0.7, y - o[1]));
    if (T.y < 0.48 && !s.tasted) { s.tasted = nowT; cookAct(true); cookEv(); blip(990, 0.08); }
  } else if (k === 'crack') {
    T.x = Math.max(0.08, Math.min(0.92, x)); T.y = Math.max(0.12, Math.min(0.85, y));
    const overRim = Math.abs(T.x - 0.5) < 0.24;
    if (overRim && T.y > 0.6) T.y = 0.6;   // the egg stops on the rim of the bowl
    if (T.y < 0.53) s.armed = true;   // lifted a little off the rim: ready to knock again
    if (s.armed && overRim && T.y >= 0.6 && !s.open) { s.armed = false; s.knocks = (s.knocks || 0) + 1; s.knockT = nowT; cookAct(true); blip(700 - s.knocks * 120, 0.05);
      if (s.knocks >= 3) { s.open = nowT; T.held = false; blip(320, 0.08); setTimeout(() => { if (ck && ck.s === s) cookEv(); }, 550); } }
  } else if (k === 'heat') {
    const a = Math.atan2(y - 0.84, (x - 0.86) * 1.8);   // turn the knob: its angle follows the finger round its centre
    s.knob = Math.max(0, Math.min(1, (a + Math.PI * 0.75) / (Math.PI * 1.5)));
    if (Math.abs(s.knob - (s.lastKnob || 0)) > 0.01) blip(200 + s.knob * 300, 0.01); s.lastKnob = s.knob;
  } else if (k === 'stir') {
    // you move the grip at the top of the handle; the spoon's bowl, down in the food, stays inside the bowl
    x -= SPOON_GRIP.stir[0]; y -= SPOON_GRIP.stir[1];
    const cx = 0.5, cy = 0.62, rx = 0.25, ry = 0.13; let dx = (x - cx) / rx, dy = (y - cy) / ry; const r = Math.hypot(dx, dy); if (r > 0.92) { dx *= 0.92 / r; dy *= 0.92 / r; }
    T.x = cx + dx * rx; T.y = cy + dy * ry;
    const a = Math.atan2(dy, dx); if (s.ang != null && r > 0.2) { let da = a - s.ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2; s.swirl += da; s.acc += Math.abs(da); if (Math.abs(da) > 0.01) cookAct(false); if (s.acc > Math.PI / 2) { s.acc = 0; cookEv(); } }
    s.ang = a;
  }
}
// One unit of work done: the progress bar moves, the word flashes.
function cookEv() {
  const s = ck.s; s.ev++;
  const units = { stir: 12, roll: 6, grate: 6, wash: 5, shake: Math.ceil(s.n), pour: 1, heat: 1 }[s.kind] || s.n;
  cookProg(1 / units);
}
function cookProg(d) {
  if (ck.done) return; ck.prog = Math.min(1, ck.prog + d); const bar = $('#ckBar'); if (bar) bar.style.width = (ck.prog * 100) + '%';
  if (ck.prog >= 1) cookDone();
}
// Doing the action: flash the word (now and then for a smooth action like stirring), and keep the word
// being said while you keep at it.
function cookAct(beat) {
  const s = ck.s, t = nowT;
  if ((beat && (!s.flash || t - s.flash > 0.35)) || !s.flash || t - s.flash > 1.6) { s.flash = t; actSub(s.st.v, s.vo); }
  s.lastAct = performance.now();
  if (!s.vo) {
    s.vo = new Audio('audio/w_' + s.st.v + '.mp3'); const vo = s.vo, me = ck;
    vo.onended = () => { duck = 1; if (ck === me && ck.s && ck.s.vo === vo && !ck.done && performance.now() - ck.s.lastAct < 600) setTimeout(() => { if (ck === me && ck.s && ck.s.vo === vo && performance.now() - ck.s.lastAct < 700) { duck = 0.3; vo.play().catch(() => {}); actSub(ck.s.st.v, vo); ck.s.flash = nowT; } }, 90); };
  }
  if (s.vo.paused) { stopSay(); duck = 0.3; try { s.vo.currentTime = 0; } catch (e) {} s.vo.play().catch(() => {}); actSub(s.st.v, s.vo); s.flash = t; }
}
function cookStopVoice(s) { if (s && s.vo) { try { s.vo.pause(); } catch (e) {} s.vo.onended = null; duck = 1; } }
// Chopping: how much of the vegetable is still whole (a fraction of its width, from the left), and the colour
// of its inside where it's been cut.
const ckLeft = () => 1 - Math.min(1, ck.prog) * 0.82;
// The vegetable lies turned so the cuts run the same way as the knife blade (across), and slices come off the
// top first, working down. ckGuide() is the height of the next cut, as a fraction of the pad's height.
const CK_VEG = { y: 0.6, S: 0.42 };   // its centre height and size (of the pad height)
function ckGuide() { const s = ck.s, nextLeft = Math.max(0.05, ckLeft() - 0.82 / Math.max(1, s.n)), p = 1 - nextLeft;
  if (s.st.w === 'morkva') return 0.64 - 0.9 * CK_VEG.S * (-0.5 + 1.05 * nextLeft);   // the carrot stands tip up; coins come off the tip
  return CK_VEG.y - CK_VEG.S / 2 + CK_VEG.S * p; }
// The knife blade (flat, edge down) spans this much of the pad's width to the left of the handle.
const CK_BLADE = 0.27;
const CK_FLESH = { yabluko: '#fff4d6', tsybulia: '#f7f3e8', kapusta: '#e6f3c8', morkva: '#ff9a3a', kartoplia: '#f6e7a8', buriak: '#8a1f4a', pomidor: '#e8463c' };
const ckImgs = {};
function ckImg(id) { if (!ckImgs[id]) { const im = new Image(); im.src = iconURL(id); ckImgs[id] = im; } return ckImgs[id]; }
// A carrot lying along the board, leafy end on the left. Each chop takes a coin off the cut end (starting at
// the tip), and the coins roll a little and lie flat, orange with their pale core.
function ckCarrot(c, w, h, k, t, s) {
  const S = h * 0.42, x0 = w * 0.5 - S * 0.5, len = S * 1.05, y = h * 0.64, left = ckLeft();
  const rad = q => S * (0.17 - q * 0.14);   // the carrot's half-thickness along its length (q = 0 top, 1 tip)
  c.fillStyle = '#3f8a3a'; for (const a of [-0.5, -0.15, 0.2]) { c.save(); c.translate(x0, y); c.rotate(Math.PI + a); ell(c, S * 0.12, 0, S * 0.14, S * 0.03); c.restore(); }
  const end = left; c.fillStyle = '#ff8a1f'; c.beginPath(); c.moveTo(x0, y - rad(0));
  for (let i = 1; i <= 20; i++) { const q = i / 20 * end; c.lineTo(x0 + len * q, y - rad(q)); }
  for (let i = 20; i >= 0; i--) { const q = i / 20 * end; c.lineTo(x0 + len * q, y + rad(q)); } c.closePath(); c.fill();
  c.strokeStyle = 'rgba(180,80,10,.5)'; c.lineWidth = 1 * k; for (let i = 1; i < 6; i++) { const q = i / 7; if (q > end) break; const x = x0 + len * q; c.beginPath(); c.moveTo(x, y - rad(q) * 0.7); c.lineTo(x + 3 * k, y - rad(q) * 0.2); c.stroke(); }
  if (end < 0.999) { const ex = x0 + len * end, r = rad(end); c.fillStyle = '#ffa64a'; ell(c, ex, y, r * 0.35, r); c.fillStyle = '#ffd08a'; ell(c, ex, y, r * 0.16, r * 0.45); }
  else { c.fillStyle = '#ff8a1f'; circ(c, x0 + len, y, S * 0.02); }
  s.bits.forEach((b, i) => {   // the coins: each was the slice between two cuts
    // (in the carrot's own frame: its x runs up the screen, its y across, since it's drawn turned tip up)
    const q = Math.min(1, (t - b.t) / 0.4), mid = (b.a + b.b) / 2, r = rad(Math.min(1, mid)), side = i % 2 ? 1 : -1;
    const sx = x0 + len * mid, ex = w * 0.5 - S * 0.12 + (i >> 1) * 2 * k, ey = y + side * (S * 0.42 + (i >> 1) * 7 * k);
    const bx = sx + (ex - sx) * q + Math.sin(q * Math.PI) * 12 * k, by = y + (ey - y) * q, fl = 1 - q * 0.6;
    c.fillStyle = '#e8741a'; ell(c, bx - 1.5 * k, by, r * fl, r); c.fillStyle = '#ffa64a'; ell(c, bx, by, r * fl, r); c.fillStyle = '#ffd08a'; ell(c, bx, by, r * 0.45 * fl, r * 0.45);
  });
}
// Drawing helpers for the kitchen.
function ckBoard(c, w, h, k) { c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, w * 0.5, h * 0.86, w * 0.4, h * 0.05); c.fillStyle = '#c99463'; rr(c, w * 0.12, h * 0.52, w * 0.76, h * 0.32, 14 * k); c.fillStyle = '#ddb07a'; rr(c, w * 0.12, h * 0.52, w * 0.76, h * 0.27, 14 * k); c.strokeStyle = 'rgba(140,90,40,.25)'; c.lineWidth = 1.5 * k; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(w * 0.16, h * (0.57 + i * 0.045)); c.lineTo(w * 0.84, h * (0.57 + i * 0.045) + 2 * k); c.stroke(); } c.fillStyle = '#b07a44'; circ(c, w * 0.84, h * 0.58, 4 * k); }
function ckPot(c, x, y, s, k, t, fill) {   // an enamel pot with red flowers, seen a little from above
  c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, x, y + s * 0.02, s * 0.62, s * 0.1);
  c.fillStyle = '#f4f1ea'; c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.5); c.lineTo(x - s * 0.45, y - s * 0.03); c.quadraticCurveTo(x, y + s * 0.08, x + s * 0.45, y - s * 0.03); c.lineTo(x + s * 0.5, y - s * 0.5); c.closePath(); c.fill();
  c.fillStyle = '#d43a3a'; for (const dx of [-0.25, 0, 0.25]) { circ(c, x + dx * s, y - s * 0.26, s * 0.05); c.fillStyle = '#3f8a3a'; ell(c, x + dx * s + s * 0.06, y - s * 0.24, s * 0.04, s * 0.02); c.fillStyle = '#d43a3a'; }
  c.fillStyle = '#2f5f9e'; ell(c, x, y - s * 0.5, s * 0.52, s * 0.12); c.fillStyle = fill || '#5a3020'; ell(c, x, y - s * 0.5, s * 0.46, s * 0.09);
  c.strokeStyle = '#2f5f9e'; c.lineWidth = 3 * k; for (const sg of [-1, 1]) { c.beginPath(); c.arc(x + sg * s * 0.55, y - s * 0.4, s * 0.06, -Math.PI / 2, Math.PI / 2, sg < 0); c.stroke(); }
}
function ckKnife(c, x, y, s, k, rot) {   // handle at (x, y), the blade reaching left, edge down
  c.save(); c.translate(x, y); c.rotate(rot || 0);
  c.fillStyle = '#d9dde2'; c.beginPath(); c.moveTo(-s * 0.05, -s * 0.07); c.lineTo(-s * 0.9, -s * 0.05); c.quadraticCurveTo(-s * 1.02, s * 0.06, -s * 0.85, s * 0.08); c.lineTo(-s * 0.05, s * 0.08); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(-s * 0.85, -s * 0.03, s * 0.78, s * 0.025);
  c.fillStyle = '#7a4b22'; rr(c, -s * 0.06, -s * 0.07, s * 0.42, s * 0.14, s * 0.05); c.fillStyle = '#d9b27a'; for (const dx of [0.06, 0.2]) circ(c, dx * s, 0, s * 0.02);
  c.restore();
}
function ckFlash(c, w, h, k, t) {   // the action word, popping up big and fading fast
  const s = ck.s; if (!s.flash) return; const q = (t - s.flash) / 1.6; if (q > 1) return;
  const W0 = W[s.st.v].uk, txt = W0[0].toUpperCase() + W0.slice(1) + '!', a = flashA(q), sc = flashS(q);
  c.save(); c.globalAlpha = Math.max(0, a); c.translate(w * 0.5, h * 0.2); c.scale(sc, sc); c.font = `900 ${Math.round(30 * k)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 6 * k; c.strokeStyle = '#4a2c1a'; c.strokeText(txt, 0, 0); c.fillStyle = '#ffd27a'; c.fillText(txt, 0, 0); c.restore();
}
function cookFrame(me) {
  const pad = $('#cookPad'); if (!ck || ck.s !== me) return;   // a newer step has its own loop
  if (!pad || !sheetOpen()) { cookStopVoice(me); return; }
  const c = pad.getContext('2d'), w = pad.width, h = pad.height, k = ck.k, t = nowT, s = ck.s, T = s.tool, st = s.st, kind = s.kind;
  const dt = Math.min(0.05, Math.max(0, t - (s.lastT || t))); s.lastT = t;
  c.setTransform(1, 0, 0, 1, 0, 0);
  // the kitchen wall and table
  let g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#fbecd3'); g.addColorStop(0.45, '#f3dcb7'); g.addColorStop(0.46, '#a86f3e'); g.addColorStop(1, '#8a5a2b'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = 'rgba(212,58,58,.16)'; for (let i = 0; i < 9; i++) { c.save(); c.translate(w * (0.06 + i * 0.11), h * 0.1); c.rotate(Math.PI / 4); c.fillRect(-4 * k, -4 * k, 8 * k, 8 * k); c.restore(); }   // an embroidered border along the wall
  const food = (x, y, sz, sq) => { c.save(); c.translate(x, y); if (sq) c.scale(1 + sq * 0.25, 1 - sq * 0.3); drawIcon(c, W[st.w].ic, 0, sz * 0.5, sz); c.restore(); };
  const hint = s.miss && t - s.miss < 0.8 ? Math.sin((t - s.miss) * 20) * 0.5 + 0.5 : 0;   // you pressed beside it: the implement winks
  const ring = (x, y, r) => { if (!hint && !(T && !T.held && t - (s.t0 || (s.t0 = t)) < 2.5)) return; c.strokeStyle = `rgba(255,210,63,${hint ? 0.9 : 0.35 + 0.3 * Math.sin(t * 6)})`; c.lineWidth = 3 * k; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke(); };
  if (kind === 'chop' || kind === 'peel') {
    ckBoard(c, w, h, k);
    const im = kind === 'chop' ? ckImg(st.w) : null;
    if (kind === 'chop' && st.w === 'morkva') { c.save(); c.translate(w * 0.5, h * 0.64); c.rotate(-Math.PI / 2); c.scale(0.9, 0.9); c.translate(-w * 0.5, -h * 0.64); ckCarrot(c, w, h, k, t, s); c.restore(); }
    else if (im && im.complete && im.naturalWidth) {
      const S = h * CK_VEG.S, fx = w * 0.5, fy = h * CK_VEG.y, p = 1 - ckLeft(), FL = CK_FLESH[st.w] || '#fff4d6';
      // Drawn a quarter turn round (its picture's left edge at the top), so the slices are cut across. What's left
      // is the lower part, cut flat across where the knife has been.
      c.save(); c.translate(fx, fy); c.rotate(Math.PI / 2);
      c.drawImage(im, 128 * p, 0, 128 * (1 - p), 128, -S / 2 + S * p, -S / 2, S * (1 - p), S);
      if (p > 0.001) { c.fillStyle = FL; ell(c, -S / 2 + S * p, 0, 2.5 * k, S * 0.27); }
      c.restore();
      // the slices, each the band between two cuts, tipping off the top and fanning out to the sides, cut faces showing
      s.bits.forEach((b, i) => { const q = Math.min(1, (t - b.t) / 0.4), a0 = 1 - b.b, a1 = 1 - b.a, th = S * (a1 - a0), side = i % 2 ? 1 : -1;
        const y0 = fy - S / 2 + S * (a0 + a1) / 2, y1 = fy + S * 0.3 - (i >> 1) * 2 * k, cx = fx + side * (S * 0.66 + (i >> 1) * 7 * k) * q, cy = y0 + (y1 - y0) * q - Math.sin(q * Math.PI) * 12 * k;
        c.save(); c.translate(cx, cy); c.rotate(Math.PI / 2 + side * q * (0.08 + (i % 3) * 0.05));
        c.drawImage(im, 128 * a0, 0, 128 * (a1 - a0), 128, -th / 2, -S / 2, th, S); c.fillStyle = FL; ell(c, th / 2 - 1.2 * k, 0, 2.2 * k, S * 0.25);
        if (st.w === 'tsybulia' || st.w === 'yabluko') { c.strokeStyle = st.w === 'tsybulia' ? 'rgba(200,180,150,.6)' : 'rgba(150,90,40,.5)'; c.lineWidth = 1 * k; c.beginPath(); c.ellipse(th / 2 - 1.2 * k, 0, 1.4 * k, S * (st.w === 'tsybulia' ? 0.15 : 0.06), 0, 0, 7); c.stroke(); }   // onion rings, apple pips
        c.restore(); });
    } else food(w * 0.5, h * 0.6, h * 0.36, 0);
    for (const b of (kind === 'chop' ? [] : s.bits)) { const q = Math.min(1, (t - b.t) / 0.5); if (kind === 'chop') { c.fillStyle = '#fff'; drawIcon(c, W[st.w].ic, w * (b.x - 0.05 - q * 0.08), h * (0.66 + q * 0.06), h * 0.11); } else { c.strokeStyle = st.w === 'buriak' ? '#7a1f3d' : '#b5824e'; c.lineWidth = 3 * k; c.beginPath(); const x = w * b.x, y = h * (0.6 + q * 0.2); c.moveTo(x, y); c.quadraticCurveTo(x + 10 * k, y + 8 * k, x, y + 14 * k); c.stroke(); } }
    // the knife: handle in your hand (right), blade over the food, edge down
    const bx = T.x * w, by = T.y * h;
    if (kind === 'chop') {
      // the dashed line across the vegetable where the next slice is cut, and the knife lying flat, edge down
      if (!ck.done) { const gy = ckGuide() * h; c.save(); c.strokeStyle = `rgba(255,255,255,${0.55 + 0.3 * Math.sin(t * 6)})`; c.lineWidth = 2.5 * k; c.setLineDash([6 * k, 6 * k]); c.beginPath(); c.moveTo(w * 0.3, gy); c.lineTo(w * 0.7, gy); c.stroke(); c.restore(); }
      if (s.missCut && t - s.missCut < 0.6) { c.fillStyle = 'rgba(255,255,255,.9)'; c.font = `800 ${Math.round(14 * k)}px system-ui`; c.textAlign = 'center'; c.fillText('⟷', bx - w * 0.12, by - h * 0.08); }
      ckKnife(c, bx, by, w * 0.3, k, 0);
      ring(bx + w * 0.05, by, 24 * k);
    } else {
      ckKnife(c, bx, by, w * 0.22, k, -0.15);
      ring(bx + w * 0.06, by, 26 * k);
    }
  } else if (kind === 'knead') {
    ckBoard(c, w, h, k);
    const sq = s.squash ? Math.max(0, 1 - (t - s.squash) / 0.35) : 0, grow = 1 + ck.prog * 0.15;
    c.fillStyle = 'rgba(0,0,0,.1)'; ell(c, w * 0.5, h * 0.72, w * 0.18 * grow * (1 + sq * 0.2), h * 0.04);
    c.fillStyle = '#f3e1b8'; ell(c, w * 0.5, h * (0.66 + sq * 0.02), w * 0.16 * grow * (1 + sq * 0.25), h * 0.09 * (1 - sq * 0.35)); c.fillStyle = 'rgba(255,255,255,.4)'; ell(c, w * 0.46, h * 0.63, w * 0.05, h * 0.025);
    // two hands, palms down
    for (const sg of [-1, 1]) { const hx = T.x * w + sg * w * 0.07, hy = T.y * h + h * 0.08; c.fillStyle = '#f3cfb0'; ell(c, hx, hy, w * 0.06, h * 0.06); for (let f = 0; f < 4; f++) ell(c, hx - w * 0.04 + f * w * 0.027, hy + h * 0.065, w * 0.012, h * 0.03); c.strokeStyle = '#e0b48f'; c.lineWidth = 1 * k; c.beginPath(); c.ellipse(hx, hy, w * 0.06, h * 0.06, 0, 0, 7); c.stroke(); }
    ring(T.x * w, T.y * h + h * 0.08, 34 * k);
  } else if (kind === 'roll') {
    ckBoard(c, w, h, k);
    const f = s.flat; c.fillStyle = '#f3e1b8'; ell(c, w * 0.5, h * 0.66, w * (0.1 + f * 0.24), h * (0.07 + f * 0.06)); c.fillStyle = 'rgba(255,255,255,.35)'; ell(c, w * 0.46, h * 0.64, w * (0.03 + f * 0.08), h * 0.02);
    c.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 10; i++) circ(c, w * (0.3 + ((i * 0.37) % 0.4)), h * (0.58 + ((i * 0.53) % 0.16)), 1.2 * k);   // a dusting of flour
    const px = T.x * w, py = T.y * h;   // the rolling pin across the dough, handles at each end
    c.fillStyle = 'rgba(0,0,0,.15)'; ell(c, px, py + h * 0.05, w * 0.28, h * 0.02);
    c.fillStyle = '#d9a35e'; rr(c, px - w * 0.24, py - h * 0.04, w * 0.48, h * 0.08, h * 0.04); c.fillStyle = 'rgba(255,255,255,.3)'; rr(c, px - w * 0.22, py - h * 0.03, w * 0.44, h * 0.02, h * 0.01);
    c.fillStyle = '#9b6b3c'; for (const sg of [-1, 1]) rr(c, px + sg * w * 0.24 - (sg < 0 ? w * 0.08 : 0), py - h * 0.022, w * 0.08, h * 0.044, h * 0.02);
    ring(px, py, 30 * k);
  } else if (kind === 'grate') {
    ckBoard(c, w, h, k);
    // shreds piling up under the grater
    c.fillStyle = '#e8d48a'; const pile = Math.min(1, ck.prog); ell(c, w * 0.62, h * 0.76, w * (0.04 + pile * 0.1), h * (0.015 + pile * 0.03));
    for (const b of s.bits) { const q = (t - b.t) / 0.6; if (q > 1) continue; c.fillStyle = '#e8d48a'; c.fillRect(w * b.x, h * (0.62 + q * 0.14), 2 * k, 5 * k); }
    s.bits = s.bits.filter(b => t - b.t < 0.6);
    // the box grater, standing up: a handle on top and rows of little holes
    const gx = w * 0.62; c.fillStyle = '#b9bec4'; poly(c, [[gx - w * 0.08, h * 0.74], [gx + w * 0.08, h * 0.74], [gx + w * 0.06, h * 0.26], [gx - w * 0.06, h * 0.26]]);
    c.fillStyle = '#8d939a'; for (let r = 0; r < 8; r++) for (let q = 0; q < 4; q++) ell(c, gx - w * 0.045 + q * w * 0.03 + (r % 2) * w * 0.012, h * (0.32 + r * 0.05), 2.4 * k, 1.4 * k);
    c.strokeStyle = '#7a4b22'; c.lineWidth = 5 * k; c.beginPath(); c.arc(gx, h * 0.25, w * 0.04, Math.PI, 0); c.stroke();
    food(T.x * w, T.y * h - h * 0.04, h * 0.24 * (1 - ck.prog * 0.5));
    ring(T.x * w, T.y * h - h * 0.04, 30 * k);
  } else if (kind === 'wash') {
    // a basin of water; scrub the fruit round in it
    c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, w * 0.55, h * 0.84, w * 0.34, h * 0.05);
    c.fillStyle = '#c99463'; ell(c, w * 0.55, h * 0.7, w * 0.33, h * 0.17); c.fillStyle = '#7cc4ef'; ell(c, w * 0.55, h * 0.68, w * 0.29, h * 0.13);
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 1.5 * k; for (let i = 0; i < 3; i++) { const r = ((t * 0.5 + i / 3) % 1); c.beginPath(); c.ellipse(w * 0.55, h * 0.68, w * 0.29 * r, h * 0.13 * r, 0, 0, 7); c.stroke(); }
    s.fx = s.fx.filter(b => t - b.t < 1.2); for (const b of s.fx) { const q = (t - b.t) / 1.2; c.strokeStyle = `rgba(255,255,255,${0.9 - q * 0.8})`; c.lineWidth = 1.5 * k; c.beginPath(); c.arc(w * b.x, h * (b.y - q * 0.25), (3 + q * 4) * k, 0, 7); c.stroke(); }
    if (st.w === 'yabluko') { drawIcon(c, W.hrusha.ic, T.x * w + h * 0.13, T.y * h + h * 0.1, h * 0.2); drawIcon(c, W.yabluko.ic, T.x * w - h * 0.02, T.y * h + h * 0.12, h * 0.21); }   // an apple and a pear, washed together
    else food(T.x * w, T.y * h, h * 0.22);
    ring(T.x * w, T.y * h, 30 * k);
  } else if (kind === 'pour') {
    const potX = w * 0.62, potY = h * 0.9, pS = w * 0.38, over = Math.abs(T.x - 0.5) < 0.18 && T.y < 0.62;
    s.tilt = (s.tilt || 0) + (((T.held && over) ? 1 : 0) - (s.tilt || 0)) * Math.min(1, dt * 7);
    ckPot(c, potX, potY, pS, k, t, st.w === 'med' ? '#e8d4a8' : st.v === 'nasyp' ? '#f3ead8' : '#7cc4ef');
    if (s.tilt > 0.6) { cookAct(false); cookProg(dt / 2.4); }
    const jx = T.x * w, jy = T.y * h;
    // the stream from the spout into the pot
    if (s.tilt > 0.35) { const sx = jx + w * 0.1, sy = jy + h * 0.02; c.strokeStyle = st.w === 'med' ? 'rgba(232,160,28,.95)' : st.v === 'nasyp' ? 'rgba(250,246,236,.95)' : 'rgba(150,210,245,.9)'; c.lineWidth = (st.v === 'nasyp' ? 7 : 5) * k * s.tilt; c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx + w * 0.03, sy + h * 0.1, potX - w * 0.02, potY - pS * 0.5); c.stroke(); }
    c.save(); c.translate(jx, jy); c.rotate(s.tilt * 1.1);
    if (st.w === 'med') { c.fillStyle = 'rgba(255,255,255,.55)'; rr(c, -w * 0.06, -h * 0.13, w * 0.12, h * 0.2, 8 * k); c.fillStyle = '#e8a01c'; rr(c, -w * 0.055, -h * 0.07, w * 0.11, h * 0.13, 6 * k); c.fillStyle = '#d43a3a'; c.fillRect(-w * 0.065, -h * 0.15, w * 0.13, h * 0.03); }   // a jar of honey
    else if (st.v === 'nasyp') { c.fillStyle = '#efe3c8'; rr(c, -w * 0.08, -h * 0.16, w * 0.16, h * 0.24, 10 * k); c.fillStyle = '#d43a3a'; c.fillRect(-w * 0.08, -h * 0.03, w * 0.16, h * 0.02); c.fillStyle = '#c9b48a'; poly(c, [[-w * 0.08, -h * 0.16], [w * 0.1, -h * 0.2], [w * 0.08, -h * 0.12]]); }
    else { c.fillStyle = '#3d7cc2'; c.beginPath(); c.moveTo(-w * 0.06, h * 0.08); c.lineTo(-w * 0.07, -h * 0.1); c.lineTo(w * 0.1, -h * 0.1); c.lineTo(w * 0.06, h * 0.08); c.closePath(); c.fill(); c.fillStyle = '#fffdf5'; c.fillRect(-w * 0.065, -h * 0.03, w * 0.12, h * 0.02); c.strokeStyle = '#3d7cc2'; c.lineWidth = 5 * k; c.beginPath(); c.arc(-w * 0.07, -h * 0.01, h * 0.06, Math.PI * 0.5, Math.PI * 1.5); c.stroke(); }
    c.restore();
    ring(jx, jy, 34 * k);
  } else if (kind === 'heat') {
    // the stove top: the pot (or a pan) on the ring, flames as high as the knob is turned
    const fl = s.knob, cx = w * 0.45, cy = h * 0.82;
    c.fillStyle = '#3a3634'; rr(c, w * 0.05, h * 0.68, w * 0.9, h * 0.3, 12 * k); c.fillStyle = '#2a2624'; ell(c, cx, cy, w * 0.22, h * 0.06);
    if (fl > 0.05) for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, fx = cx + Math.cos(a) * w * 0.18, fy = cy + Math.sin(a) * h * 0.045, fh = h * 0.06 * fl * (0.8 + 0.4 * Math.sin(t * 20 + i)); c.fillStyle = `rgba(80,140,255,${0.8})`; ell(c, fx, fy - fh * 0.4, 3 * k, fh * 0.5); c.fillStyle = 'rgba(255,190,90,.8)'; ell(c, fx, fy - fh * 0.75, 1.8 * k, fh * 0.3); }
    if (st.v === 'posmazh') {
      c.fillStyle = '#2a2a2a'; ell(c, cx, cy - h * 0.06, w * 0.24, h * 0.08); c.fillStyle = '#444'; ell(c, cx, cy - h * 0.07, w * 0.21, h * 0.065); c.fillStyle = '#2a2a2a'; rr(c, cx + w * 0.23, cy - h * 0.08, w * 0.2, h * 0.03, 6 * k);
      for (let i = 0; i < 3; i++) food(cx + (i - 1) * w * 0.1, cy - h * 0.1, h * 0.12);
      if (fl > 0.3) { c.fillStyle = 'rgba(255,230,140,.9)'; for (let i = 0; i < 6; i++) { const q = (t * 3 + i / 6) % 1; circ(c, cx + Math.sin(i * 7.3) * w * 0.15, cy - h * 0.1 - q * h * 0.12, 1.6 * k); } }   // sizzle
    } else {
      ckPot(c, cx, cy - h * 0.02, w * 0.4, k, t, '#a33c2c');
      food(cx, cy - h * 0.28, h * 0.16);
      if (fl > 0.3) { c.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 5; i++) { const q = (t * 0.6 * (0.6 + fl) + i / 5) % 1; circ(c, cx + Math.sin(t * 2 + i * 2) * w * 0.07, cy - h * 0.34 - q * h * 0.28, (5 + q * 10) * k); } }   // steam
    }
    if (fl > 0.3) { cookAct(false); cookProg(dt * fl / 2.6); }
    // the knob: grab it and turn it right round
    const kx = w * 0.86, ky = h * 0.84, kr = 16 * k; c.fillStyle = '#e8e4dc'; circ(c, kx, ky, kr); c.strokeStyle = '#9a948c'; c.lineWidth = 2 * k; c.beginPath(); c.arc(kx, ky, kr, 0, 7); c.stroke();
    const ka = -Math.PI * 0.75 + fl * Math.PI * 1.5; c.strokeStyle = '#d43a3a'; c.lineWidth = 4 * k; c.beginPath(); c.moveTo(kx, ky); c.lineTo(kx + Math.cos(ka) * kr * 0.85, ky + Math.sin(ka) * kr * 0.85); c.stroke();
    c.fillStyle = '#fff8ea'; c.font = `700 ${Math.round(9 * k)}px system-ui`; c.textAlign = 'center'; c.fillText('🔥', kx + kr * 1.1, ky - kr * 1.1);
    ring(kx, ky, kr * 1.6);
  } else if (kind === 'stir') {
    // the bowl stays put; what's in it swirls round with the spoon
    const cx = w * 0.5, cy = h * 0.62, rx = w * 0.25, ry = h * 0.13;
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, cx, cy + h * 0.2, rx * 1.15, h * 0.05);
    c.fillStyle = '#f4f1ea'; c.beginPath(); c.ellipse(cx, cy, rx * 1.12, ry * 1.12, 0, 0, Math.PI); c.quadraticCurveTo(cx, cy + h * 0.32, cx + rx * 1.12, cy); c.fill();
    c.fillStyle = '#2f5f9e'; ell(c, cx, cy, rx * 1.12, ry * 1.12);
    const FILL = { borshch: '#a33c2c', kutia: '#9c7a4c', rys: '#f3ecd8', syr: '#fbf6ea' }[st.w] || '#c9a86a';
    c.fillStyle = FILL; ell(c, cx, cy, rx, ry);
    c.save(); c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, 7); c.clip();
    // the pieces in it sit still (a gentle drift where the spoon has been), with the swirl the spoon leaves
    const BITS = { borshch: ['#7a1f3d', '#ff8a1f', '#f3e0a0', '#9fd27a'], kutia: ['#d9b27a', '#2a2a2a', '#f2a81d'], rys: ['#fffdf5', '#ff8a1f'], syr: ['#fffdf5', '#f3e0a0', '#fff3c4'] }[st.w] || ['#d9b27a', '#f3e0a0'];
    for (let i = 0; i < 22; i++) { const a0 = i * 2.39, r = 0.18 + ((i * 0.37) % 0.72), dr = s.swirl * 0.03 * (1 - r * 0.5); c.fillStyle = BITS[i % BITS.length]; c.save(); c.translate(cx + Math.cos(a0 + dr) * rx * r, cy + Math.sin(a0 + dr) * ry * r); c.rotate(i + dr * 2); ell(c, 0, 0, (3 + i % 3) * k, (2 + i % 2) * k); c.restore(); }   // chopped bits: beetroot, carrot, potato, cabbage (or grains, rice, curd)
    s.wake = (s.wake || []).filter(p => t - p.t < 1.1); if (T.held && (!s.wakeT || t - s.wakeT > 0.05)) { s.wakeT = t; s.wake.push({ x: T.x, y: T.y, t }); }
    for (const p of s.wake) { const q = (t - p.t) / 1.1; c.strokeStyle = `rgba(255,255,255,${0.45 * (1 - q)})`; c.lineWidth = 2 * k; c.beginPath(); c.ellipse(p.x * w, p.y * h, (4 + q * 16) * k, (2 + q * 7) * k, 0, 0, 7); c.stroke(); }
    c.restore();
    // the wooden spoon: its bowl down in the food where your finger is, the long handle leaning up out of the pot
    const tx = T.x * w, ty = T.y * h, hx = tx + SPOON_GRIP.stir[0] * w, hy = ty + SPOON_GRIP.stir[1] * h;
    c.fillStyle = 'rgba(0,0,0,.18)'; ell(c, tx + 3 * k, ty + 3 * k, w * 0.04, h * 0.028);
    c.strokeStyle = '#8a5a2b'; c.lineWidth = 9 * k; c.lineCap = 'round'; c.beginPath(); c.moveTo(tx, ty - h * 0.015); c.lineTo(hx, hy); c.stroke();
    c.strokeStyle = '#c99463'; c.lineWidth = 3.5 * k; c.beginPath(); c.moveTo(tx + 1.5 * k, ty - h * 0.04); c.lineTo(hx + 1.5 * k, hy + 3 * k); c.stroke();
    c.fillStyle = '#9b6b3c'; ell(c, tx, ty, w * 0.04, h * 0.03); c.fillStyle = 'rgba(0,0,0,.25)'; ell(c, tx, ty + h * 0.006, w * 0.03, h * 0.016);
    c.fillStyle = '#7a4b22'; ell(c, hx, hy, 5 * k, 5 * k);   // the worn end of the handle, where you hold it
    ring(hx, hy, 30 * k);
  } else if (kind === 'add') {
    const potX = w * 0.62, potY = h * 0.92, pS = w * 0.42;
    c.fillStyle = '#fffdf5'; ell(c, w * 0.2, h * 0.76, w * 0.17, h * 0.07); c.strokeStyle = '#2f5f9e'; c.lineWidth = 2 * k; c.beginPath(); c.ellipse(w * 0.2, h * 0.76, w * 0.15, h * 0.055, 0, 0, 7); c.stroke();   // a plate
    ckPot(c, potX, potY, pS, k, t, '#c98a4a');
    for (const it of s.items) {
      if (it.inPot) { const q = Math.min(1, (t - it.t) / 0.35); if (q < 1) { drawIcon(c, W[st.w].ic, potX, potY - pS * 0.5 - (1 - q) * h * 0.1, h * 0.12 * (1 - q * 0.5)); c.strokeStyle = `rgba(255,255,255,${1 - q})`; c.lineWidth = 2 * k; c.beginPath(); c.ellipse(potX, potY - pS * 0.5, pS * 0.3 * q + 4 * k, pS * 0.06 * q + 2 * k, 0, 0, 7); c.stroke(); } continue; }
      drawIcon(c, W[st.w].ic, it.x * w, it.y * h + h * 0.06, h * (s.held === it ? 0.17 : 0.14));
    }
    const nxt = s.items.find(i => i.home); if (nxt && !s.held && (hint || t - (s.t0 || (s.t0 = t)) < 2.5)) { c.strokeStyle = `rgba(255,210,63,${0.5 + 0.4 * Math.sin(t * 6)})`; c.lineWidth = 3 * k; c.beginPath(); c.arc(nxt.x * w, nxt.y * h, 26 * k, 0, 7); c.stroke(); }
  } else if (kind === 'shake') {
    const potX = w * 0.62, potY = h * 0.92, pS = w * 0.42;
    ckPot(c, potX, potY, pS, k, t, '#a33c2c');
    s.bits = s.bits.filter(b => t - b.t < 0.5); c.fillStyle = '#ffffff'; for (const b of s.bits) { const q = (t - b.t) / 0.5; circ(c, w * b.x, h * (b.y + q * 0.35), 1.6 * k); }
    // the salt cellar, holes down, swinging a little as it shakes
    const sx = T.x * w, sy = T.y * h; c.save(); c.translate(sx, sy); c.rotate(Math.PI + Math.sin(t * 3) * 0.05);
    c.fillStyle = '#fffdf5'; rr(c, -w * 0.045, -h * 0.12, w * 0.09, h * 0.2, 8 * k); c.strokeStyle = '#c9c4ba'; c.lineWidth = 1.5 * k; c.strokeRect(-w * 0.045, -h * 0.12, w * 0.09, h * 0.2);
    c.fillStyle = '#9aa0a8'; rr(c, -w * 0.05, -h * 0.15, w * 0.1, h * 0.04, 4 * k); c.fillStyle = '#4a4a4a'; for (const dx of [-0.02, 0, 0.02]) circ(c, dx * w, -h * 0.13, 1.4 * k);
    c.fillStyle = '#3d7cc2'; c.fillRect(-w * 0.045, -h * 0.02, w * 0.09, h * 0.02);
    c.restore();
    ring(sx, sy, 30 * k);
  } else if (kind === 'taste') {
    const potX = w * 0.55, potY = h * 0.95, pS = w * 0.46;
    ckPot(c, potX, potY, pS, k, t, '#a33c2c'); food(potX, potY - pS * 0.62, h * 0.12);
    c.font = `${Math.round(30 * k)}px ${EMOJI}`; c.textAlign = 'center'; c.fillText(s.tasted ? '😋' : '😮', w * 0.5, h * 0.17);
    // the wooden spoon: its bowl in the borscht, the handle rising to the grip at its end
    const tx = T.x * w, ty = T.y * h, gx = tx + SPOON_GRIP.taste[0] * w, gy = ty + SPOON_GRIP.taste[1] * h;
    c.strokeStyle = '#8a5a2b'; c.lineWidth = 8 * k; c.lineCap = 'round'; c.beginPath(); c.moveTo(tx, ty); c.lineTo(gx, gy); c.stroke();
    c.strokeStyle = '#c99463'; c.lineWidth = 3 * k; c.beginPath(); c.moveTo(tx + 1.5 * k, ty - 2 * k); c.lineTo(gx + 1.5 * k, gy); c.stroke();
    c.fillStyle = '#9b6b3c'; ell(c, tx, ty, w * 0.04, h * 0.032); c.fillStyle = '#a33c2c'; ell(c, tx, ty - h * 0.004, w * 0.03, h * 0.02);
    if (s.tasted) { c.fillStyle = 'rgba(255,255,255,.6)'; for (let i = 0; i < 3; i++) { const q = ((t - s.tasted) * 0.8 + i / 3) % 1; circ(c, tx + Math.sin(i * 2 + t * 3) * 4 * k, ty - h * 0.05 - q * h * 0.12, (3 + q * 4) * k); } }   // steam off the spoonful
    c.fillStyle = '#7a4b22'; ell(c, gx, gy, 5 * k, 5 * k);
    ring(gx, gy, 30 * k);
  } else if (kind === 'crack') {
    // a mixing bowl (blue-striped, with the grated potato in it), and the egg you knock on its rim
    const bx = w * 0.5, by = h * 0.64, brx = w * 0.27, bry = h * 0.07;
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, bx, h * 0.93, brx * 1.05, h * 0.04);
    c.fillStyle = '#f4f1ea'; c.beginPath(); c.ellipse(bx, by, brx, bry, 0, 0, Math.PI); c.quadraticCurveTo(bx, h * 1.02, bx + brx, by); c.fill();
    c.strokeStyle = '#3d7cc2'; c.lineWidth = 3 * k; for (const yy of [0.74, 0.8]) { c.beginPath(); c.moveTo(bx - brx * (yy < 0.77 ? 0.92 : 0.78), h * yy); c.quadraticCurveTo(bx, h * (yy + 0.05), bx + brx * (yy < 0.77 ? 0.92 : 0.78), h * yy); c.stroke(); }
    c.fillStyle = '#e9edf2'; ell(c, bx, by, brx, bry); c.fillStyle = '#e8d48a'; ell(c, bx, by + 2 * k, brx * 0.88, bry * 0.72);
    c.fillStyle = 'rgba(200,170,90,.6)'; for (let i = 0; i < 16; i++) c.fillRect(bx + Math.cos(i * 2.4) * brx * 0.7 * ((i % 4) / 4 + 0.2), by + Math.sin(i * 2.4) * bry * 0.5, 4 * k, 1.5 * k);
    const ex = T.x * w, ey = T.y * h, ER = h * 0.13;
    if (!s.open) {
      const shake = s.knockT && t - s.knockT < 0.15 ? Math.sin((t - s.knockT) * 90) * 2 * k : 0;
      c.save(); c.translate(ex + shake, ey - ER * 0.6); c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, 3 * k, ER * 1.25, ER * 0.6, ER * 0.15);
      c.fillStyle = '#f2dcc0'; ell(c, 0, 0, ER * 0.78, ER); c.fillStyle = 'rgba(255,255,255,.45)'; ell(c, -ER * 0.25, -ER * 0.35, ER * 0.2, ER * 0.3);
      if (s.knocks) { c.strokeStyle = '#8a6a4a'; c.lineWidth = 1.4 * k; c.beginPath(); const n2 = 3 + s.knocks * 2; for (let i = 0; i <= n2; i++) { const xx = -ER * 0.7 + i / n2 * ER * 1.4, yy = ER * 0.45 + (i % 2 ? -1 : 1) * ER * 0.12; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke(); }
      c.restore();
      ring(ex, ey - ER * 0.6, 32 * k);
      if (!s.knocks && T.held) { c.strokeStyle = 'rgba(255,210,63,.6)'; c.lineWidth = 3 * k; c.setLineDash([5 * k, 5 * k]); c.beginPath(); c.ellipse(bx, by, brx, bry, 0, Math.PI, 0); c.stroke(); c.setLineDash([]); }
    } else {
      // split: the two half shells pull apart over the bowl, and the yolk and white drop in
      const q = Math.min(1, (t - s.open) / 0.5), ox = 0.5 * w, oy = by - h * 0.16;
      for (const sg of [-1, 1]) { c.save(); c.translate(ox + sg * (6 + q * 28) * k, oy - q * 6 * k); c.rotate(sg * (0.4 + q * 0.6)); c.fillStyle = '#f2dcc0'; c.beginPath(); c.ellipse(0, 0, ER * 0.7, ER * 0.9, 0, sg < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, sg < 0 ? Math.PI * 1.5 : Math.PI * 0.5); c.fill(); c.fillStyle = '#fff8ea'; ell(c, sg * -ER * 0.05, 0, ER * 0.15, ER * 0.7); c.restore(); }
      const fy = oy + q * (by - oy);
      c.fillStyle = 'rgba(255,255,255,.85)'; ell(c, ox, fy, ER * (0.5 + q * 0.6), ER * (0.6 - q * 0.3)); c.fillStyle = '#ffb81c'; circ(c, ox, fy - ER * 0.05, ER * 0.32);
      if (q >= 1) { c.fillStyle = 'rgba(255,255,255,.4)'; circ(c, ox - ER * 0.1, fy - ER * 0.15, ER * 0.08); }
    }
  } else if (kind === 'shape') {
    ckBoard(c, w, h, k);
    const leaf = st.v === 'zahorny';
    for (const it of s.items) {
      const x = it.x * w, y = it.y * h, q = it.done ? Math.min(1, (t - it.t) / 0.35) : 0;
      if (leaf) { c.fillStyle = '#9fd27a'; ell(c, x, y, w * 0.06 * (1 - q * 0.45), h * 0.07); c.strokeStyle = '#6fa84a'; c.lineWidth = 1.5 * k; c.beginPath(); c.moveTo(x, y - h * 0.06); c.lineTo(x, y + h * 0.06); c.stroke(); if (q) { c.fillStyle = '#c98a4a'; ell(c, x, y, w * 0.025, h * 0.035 * q); } }
      else { c.fillStyle = '#f3e1b8'; c.beginPath(); c.ellipse(x, y, w * 0.055, h * 0.07 * (1 - q * 0.5), 0, Math.PI * q, Math.PI * 2); c.fill(); c.strokeStyle = '#d9c28e'; c.lineWidth = 1.5 * k; c.beginPath(); c.ellipse(x, y, w * 0.055, h * 0.07 * (1 - q * 0.5), 0, Math.PI * q, Math.PI * 2); c.stroke(); if (q >= 1) { c.strokeStyle = '#c9a86a'; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(x - w * 0.045 + i * w * 0.022, y); c.lineTo(x - w * 0.04 + i * w * 0.022, y - 3 * k); c.stroke(); } } }   // a varenyk, crimped
      if (!it.done && (hint || t - (s.t0 || (s.t0 = t)) < 2.5)) { c.strokeStyle = `rgba(255,210,63,${0.4 + 0.3 * Math.sin(t * 6 + it.x * 9)})`; c.lineWidth = 2 * k; c.beginPath(); c.arc(x, y, 22 * k, 0, 7); c.stroke(); }
    }
  }
  if (ck.done) { c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(0, 0, w, h); }
  padFinish(c, w, h, k);
  ckFlash(c, w, h, k, t);
  requestAnimationFrame(() => cookFrame(me));
}
function cookDone() {
  const st = ck.R.steps[ck.i], me = ck; ck.done = true;
  useWord(st.v, true); save();
  setTimeout(() => { if (ck === me) cookStopVoice(ck.s); say('p_molodets'); }, 250); blip(990, 0.12);
  setTimeout(() => {
    if (me !== ck || !$('#cookPad')) return;   // the card was closed part-way: she'll cook again next time
    ck.i++;
    if (ck.i >= ck.R.steps.length) { const R = ck.R; devMeal = !!ck.dev; ck = null; mealScene(R); }
    else cookStep();
  }, 1300);
}

// ------------------------------------------------------------------ the neighbours' games
// After a chat, Mr. Bohdan, Andriiko and Taras each ask you to join in with what they're doing. Each game
// teaches two verbs and uses them every round, so you hear them again and again:
//   Bohdan's bees: дмухай (hold to puff smoke and calm the bees), збирай (tap the honeycomb) → honey
//   Andriiko's dog: кидай (flick the ball up), неси (tell Brovko to bring it back) → a heart
//   Taras's fishing: закидай (flick to cast), wait for the bite, тягни (tap!) → fish
const MG = { bohdan: { verbs: ['dmukhai', 'zbyrai'], rounds: 2 }, andriiko: { verbs: ['kydai', 'nesy'], rounds: 3 }, taras: { verbs: ['zakydai', 'tiahny'], rounds: 3 },
  // in winter they have different jobs (and two different verbs each)
  bohdan_w: { verbs: ['zmety', 'nakryi'], rounds: 2 }, andriiko_s: { verbs: ['kydai'], rounds: 1 }, andriiko_w: { verbs: ['kachai', 'postav'], rounds: 3 }, taras_w: { verbs: ['sverdly', 'tiahny'], rounds: 2 } };
const mgPre = () => winter() ? 'mgw_' : 'mg_';
let mg = null;
// Which game a neighbour asks you to: in winter Andriiko takes turns between the snowman and a snowball fight.
function mgKindFor(id) { if (!winter()) return id; if (id === 'andriiko') return S.andSnow ? 'andriiko_s' : 'andriiko_w'; return MG[id + '_w'] ? id + '_w' : id; }
const preOf = kind => kind === 'andriiko_s' ? 'mgws_' : kind.endsWith('_w') ? 'mgw_' : 'mg_';
function mgInvite(npc) {
  if (sheetOpen()) return;
  S.cd['mg_' + npc.id] = Math.max(S.cd['mg_' + npc.id] || 0, now() + 60e3);
  if (npc.id === 'andriiko' && winter()) S.andSnow = !S.andSnow;
  const pre = preOf(mgKindFor(npc.id)), L = npc.lines[pre + 'invite'], st = stage();
  openSheet(`<div class="card"><div class="cookline"><img src="${faceURL(npc.look)}" alt=""><div><div class="word" style="font-size:26px">${L.uk}</div>${st < 3 ? `<div class="en">${L.en}</div>` : ''}</div></div>
    <div class="row">${btn('hear', `v_${npc.id}_${pre}invite`, '🔊', 'round blue')}${btn('mgGo', npc.id, lab('mgyes'))}${btn('close', '', lab('mglater'), 'ghost')}</div></div>${subsHTML()}`); subNow = null;
  say(`v_${npc.id}_${pre}invite`);
}
function mgStart(id, force) {
  const npc = NPC[id], kind = force || mgKindFor(id), G = MG[kind];
  mg = { id: kind, npc, G, round: 1, phase: '', t0: nowT, lastT: nowT, puffs: [], down: null, score: 0 };
  for (const v of G.verbs) learn(v);
  openSheet(`<div class="card gamecard"><div class="tag" id="mgTag"></div>
    <div class="cookline"><img src="${faceURL(npc.look)}" alt=""><div><div class="word" id="mgLine" style="font-size:26px"></div><div class="en" id="mgEn"></div></div></div>
    <div class="vchip" id="mgChip"></div>
    <canvas id="mgPad" class="cookpad" style="width:100%;display:block;height:240px"></canvas>
    <div class="muted" id="mgHow" style="min-height:2.6em"></div>
    <div class="row" id="mgRow"></div></div>${subsHTML()}`);
  subNow = null;
  const pad = $('#mgPad'), dpr = Math.min(2, window.devicePixelRatio || 1);
  fitPad(pad, 240);
  pad.width = Math.round(pad.clientWidth * dpr); pad.height = Math.round(pad.clientHeight * dpr); mg.k = dpr;
  for (const ev of ['touchstart', 'touchmove', 'touchend']) pad.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  const at = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) * pad.width / r.width, (e.clientY - r.top) * pad.height / r.height]; };   // the card can change height after the pad is sized
  pad.addEventListener('pointerdown', e => { e.preventDefault(); try { pad.setPointerCapture(e.pointerId); } catch (er) {} const [x, y] = at(e); mg.down = { x, y, x0: x, y0: y, t: nowT }; mgPress(x, y); });
  pad.addEventListener('pointermove', e => { if (!mg || !mg.down) return; const [x, y] = at(e); mg.down.x = x; mg.down.y = y; if (GAMES[mg.id] && GAMES[mg.id].move) GAMES[mg.id].move(x / pad.width, y / pad.height); });
  const up = e => { if (!mg || !mg.down) return; const d = mg.down; mg.down = null; mgRelease(d); };
  for (const ev of ['pointerup', 'pointercancel']) pad.addEventListener(ev, up);
  mgBegin('a');
  requestAnimationFrame(mgFrame);
}
// Set the neighbour's current line (verb highlighted), the verb chip, the how-to, and say it.
function mgLine(key, verb, how, extra = '') {
  const L = mg.npc.lines[key], st = stage();
  $('#mgTag').textContent = `🎮 ${mg.npc.name} · ${Math.min(mg.round, mg.G.rounds)}/${mg.G.rounds}`;
  $('#mgLine').innerHTML = verb ? L.uk.replace(new RegExp('(' + W[verb].uk + ')', 'i'), '<span class="verb">$1</span>') : L.uk;
  $('#mgEn').textContent = st < 3 ? L.en : '';
  $('#mgChip').innerHTML = verb ? `<span class="verb">${W[verb].uk}</span> ${st < 3 ? '= ' + W[verb].en : xl('= ' + W[verb].en)} <small>· дієслово${st < 3 ? ' (verb)' : ''}</small>` : '';
  $('#mgHow').textContent = how ? how[0] + (st < 3 ? ' · ' + how[1] : '') : '';
  $('#mgRow').innerHTML = btn('hear', `v_${mg.npc.id}_${key}`, '🔊', 'round blue') + extra + btn('close', '', lab('close'), 'ghost');
  say(`v_${mg.npc.id}_${key}`);
}
// Each game's steps: 'a' is the first verb, 'b' the second.
function mgBegin(step) {
  const id = mg.id, W0 = (mg.k || 1);
  mg.phase = step; mg.pt = nowT;
  if (GAMES[id]) return GAMES[id].begin(step);
  if (id === 'taras_w') {
    if (step === 'a') { mg.drill = 0; mg.float = null; mg.fish = null; mgLine('mgw_sverdly', 'sverdly', ['Тримай пальцем на льоду', 'Press and hold on the ice']); }
    else mgLine('mg_tiahny', 'tiahny', ['Торкнися зараз!', 'Tap now!']);
    return;
  }
  if (id === 'andriiko_w') {
    if (step === 'a') { mg.balls = mg.balls || []; mg.cur = 0.2; mgLine('mgw_kachai', 'kachai', ['Води пальцем по снігу', 'Draw circles to roll it bigger']); }
    else mgLine('mgw_postav', 'postav', ['Торкнися', 'Tap to put it on']);
    return;
  }
  if (id === 'bohdan_w') {
    if (step === 'a') { mg.snow = 1; mg.covered = false; mgLine('mgw_zmety', 'zmety', ['Води пальцем по снігу', 'Rub the snow off with your finger']); }
    else mgLine('mgw_nakryi', 'nakryi', ['Торкнися вулика', 'Tap the hive']);
    return;
  }
  if (id === 'bohdan') {
    if (step === 'a') { mg.bees = Array.from({ length: 7 }, (_, i) => ({ ph: i * 0.9, calm: 0 })); mg.cells = []; mgLine('mg_dmukhai', 'dmukhai', ['Тримай пальцем на бджолах', 'Press and hold on the bees']); }
    else { mg.cells = Array.from({ length: 10 }, (_, i) => ({ i, full: 1 })); mgLine('mg_zbyrai', 'zbyrai', ['Торкайся сот', 'Tap each honeycomb cell']); }
  } else if (id === 'andriiko') fetchBegin(step);
  else fishBegin(step);
}
function mgPress(x, y) {
  if (!mg) return;   // a tap landing just as the game ends
  if (GAMES[mg.id]) { const p = $('#mgPad'); return GAMES[mg.id].press(x / p.width, y / p.height); }
  if (mg.id === 'andriiko') return fetchPress(x, y);
  if (mg.id === 'taras') return fishPress();
  const w = $('#mgPad').width, h = $('#mgPad').height;
  if (mg.id === 'bohdan' && mg.phase === 'b') {
    for (const c of mg.cells) { const [cx, cy, r] = cellPos(c.i, w, h); if (c.full && Math.hypot(x - cx, y - cy) < r * 1.1) { c.full = 0; blip(700 + c.i * 30, 0.05); useWord('med', false); break; } }
    if (mg.cells.every(c => !c.full)) mgRoundDone();
  }
  if (mg.id === 'andriiko_w' && mg.phase === 'b') { mg.balls.push([1, 0.74, 0.54][mg.balls.length] || 0.5); useWord('postav', true); blip(700, 0.06); mg.phase = 'pause'; setTimeout(() => { if (mg) mgRoundDone(); }, mg.balls.length >= 3 ? 1600 : 700); }
  if (mg.id === 'bohdan_w' && mg.phase === 'b') { mg.covered = true; useWord('nakryi', true); blip(760, 0.06); mg.phase = 'pause'; setTimeout(() => { if (mg) mgRoundDone(); }, 1100); }
  if ((mg.id === 'taras' || mg.id === 'taras_w') && mg.phase === 'wait') { if (mg.float && mg.float.bite) mgCatch(); else { mgLine('mg_wait', null, ['Чекай', 'Wait for the float to dip']); } }
  if ((mg.id === 'taras' || mg.id === 'taras_w') && mg.phase === 'b') mgCatch();
}
function mgRelease(d) {
  if (!mg) return;
  if (GAMES[mg.id]) return GAMES[mg.id].release(d);
  if (mg.id === 'andriiko') return fetchRelease(d);
  if (mg.id === 'taras') return fishRelease();
  const flick = d.y0 - d.y > 40 * (mg.k || 1) && nowT - d.t < 0.8;
  if (mg.id === 'andriiko' && mg.phase === 'a' && flick && mg.ball.st === 'hand') {
    const w = $('#mgPad').width; const tx = Math.max(0.15, Math.min(0.85, 0.5 + (d.x - d.x0) / w * 1.4));
    mg.ball = { st: 'fly', t0: nowT, tx, ty: 0.32 }; blip(620, 0.06); useWord('kydai', true);
  }
  if (mg.id === 'taras' && mg.phase === 'a' && flick && !mg.float) {
    const w = $('#mgPad').width; mg.float = { x: Math.max(0.2, Math.min(0.8, 0.45 + (d.x - d.x0) / w)), y: 0.4, t0: nowT, land: nowT + 0.7, bite: false, biteAt: nowT + 2 + Math.random() * 2.5 };
    blip(560, 0.06); useWord('zakydai', true); mg.phase = 'wait';
  }
}
function mgCatch() {
  if (!mg.float || !mg.float.bite) return;
  useWord('tiahny', true); blip(990, 0.1); say('p_molodets');
  mg.fish = { t0: nowT, x: mg.float.x, y: mg.float.y }; mg.float = null; mg.phase = 'catch';
  setTimeout(() => { if (mg && mg.phase === 'catch') mgRoundDone(); }, 1300);
}
function mgRoundDone() {
  mg.score++; mg.cheer = nowT; blip(990, 0.08); setTimeout(() => blip(1320, 0.08), 90);
  if (mg.round >= mg.G.rounds) return mgFinish();
  mg.round++; mg.phase = 'pause';
  setTimeout(() => { if (mg && $('#mgPad')) mgBegin('a'); }, 900);
}
function mgFinish() {
  const id = mg.npc.id, npc = mg.npc, st = stage(), done = preOf(mg.id) + 'done';
  const gift = id === 'bohdan' ? 'med' : id === 'taras' ? 'ryba' : null;
  if (gift) give(gift, id === 'taras' ? 2 : 1); S.hearts += 1; S.cd['mg_' + id] = now() + 120e3; (S.npc[id] || (S.npc[id] = { met: true, q: null, k: 0 })).last = { k: 'game', g: mg.id, day: S.clock.day }; hud(); save();
  const L = npc.lines[done]; mgStopVoice(); mg = null;
  openSheet(`<div class="card"><div class="cookline"><img src="${faceURL(npc.look)}" alt=""><div><div class="word" style="font-size:26px">${L.uk}</div>${st < 3 ? `<div class="en">${L.en}</div>` : ''}</div></div>
    ${gift ? `<img class="big" src="${iconURL(gift)}" alt=""><div class="hint">+${id === 'taras' ? 2 : 1} ${W[gift].uk} · ❤️ +1</div>` : `<div class="hint">❤️ +1</div>`}
    <div class="row">${btn('close', '', lab('close'))}</div></div>${subsHTML()}`); subNow = null;
  say(`v_${id}_${done}`);
}
// ------------------------------------------------------------------ Andriiko's fetch, with a slingshot
// Grab the ball, pull it back (an invisible slingshot: two faint elastic bands and a dotted aim line), let go
// and it flies the other way. A ring target pops up somewhere in the meadow each round; land in it for a
// «Чудово!». Brovko gallops after it, leaps to catch it if he gets there first, or picks it up where it
// stops, then waits with it in his mouth until you tell him «Неси!» and he trots it back and sits.
const FE = { ax: 0.3, ay: 0.74, hor: 0.4 };   // where the ball rests, and the horizon (pad fractions)
const feScale = y => 0.55 + Math.max(0, (y - FE.hor) / (1 - FE.hor)) * 0.6;   // things further up the meadow are smaller
function fetchBegin(step) {
  if (step === 'a') {
    const r = Math.random;
    mg.tg = { x: 0.56 + r() * 0.3, y: 0.5 + r() * 0.17, t0: nowT };   // this round's target
    mg.ball = { st: 'rest', x: FE.ax, y: FE.ay, z: 0 };
    if (!mg.dog) mg.dog = { x: 0.44, y: 0.88, face: 1, ph: 0, sp: 0, pose: 'sit', z: 0, ball: false };
    mg.grab = false;
    mgLine('mg_kydai', 'kydai', ['Потягни м’ячик назад і відпусти', 'Grab the ball, pull it back and let go']);
  } else mgLine('mg_nesy', 'nesy', ['Натисни «Неси!»', 'Press «Неси!»'], btn('mgNesy', '', lab('nesy'), 'blue'));
}
function fetchPress(x, y) {
  const w = $('#mgPad').width, h = $('#mgPad').height, b = mg.ball;
  if (mg.phase === 'a' && b.st === 'rest') { mg.grab = true; blip(520, 0.03); }   // press anywhere: the slingshot is invisible
}
// The pull: from the ball's rest spot to the finger, at most a fifth of the pad's width.
function fetchPull(w, h) {
  const d = mg.down; if (!d) return null;
  let px = d.x0 - d.x, py = d.y0 - d.y; const L = Math.hypot(px, py), M = Math.min(w * 0.2, h * 0.24);
  if (L > M) { px *= M / L; py *= M / L; }
  return { px, py, f: Math.min(1, L / M) };
}
// Where a pull sends the ball (in pad fractions): further for a longer pull, the opposite way to the pull.
function fetchLand(p, w, h) {
  return { x: Math.max(0.1, Math.min(0.95, FE.ax + p.px * 2.5 / w)), y: Math.max(FE.hor + 0.07, Math.min(0.95, FE.ay + p.py * 1.9 / h)) };
}
function fetchRelease(d) {
  if (mg.phase !== 'a' || !mg.grab) return;
  const pad = $('#mgPad'), w = pad.width, h = pad.height;
  mg.grab = false;
  const p = { px: d.x0 - d.x, py: d.y0 - d.y }, L = Math.hypot(p.px, p.py), M = Math.min(w * 0.2, h * 0.24);
  if (L > M) { p.px *= M / L; p.py *= M / L; }
  const f = Math.min(1, L / M);
  if (f < 0.18) { blip(300, 0.03); return; }   // not pulled far enough: it springs back
  const to = fetchLand(p, w, h), dist = Math.hypot((to.x - FE.ax) * w, (to.y - FE.ay) * h);
  mg.ball = { st: 'fly', t0: nowT, fx: FE.ax, fy: FE.ay, tx: to.x, ty: to.y, dur: 0.55 + f * 0.5, H: (0.18 + f * 0.32) * h, hit: null, dist };
  const T = mg.tg, R = 0.075 * feScale(T.y);   // in or out of the target ring (an ellipse on the ground)
  const dd = Math.hypot((to.x - T.x) / R, (to.y - T.y) / (R * 0.42 * w / h));
  mg.ball.hit = dd <= 0.4 ? 2 : dd <= 1 ? 1 : 0;
  blip(640, 0.06); useWord('kydai', true); mgAct('kydai', true);
}
function fetchFrame(c, w, h, t, k, dt) {
  // a summer meadow outside the village: a deep sky with the sun, layered hills with the village and its church
  // on the far one, a wattle fence with sunflowers looking over it, and the grass mown in soft stripes
  const H = h * FE.hor;
  let g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#7cc8f2'); g.addColorStop(0.7, '#cdeefa'); g.addColorStop(1, '#f2f9ef'); c.fillStyle = g; c.fillRect(0, 0, w, H + 2);
  g = c.createRadialGradient(w * 0.7, h * 0.11, 0, w * 0.7, h * 0.11, 60 * k); g.addColorStop(0, 'rgba(255,244,190,.9)'); g.addColorStop(1, 'rgba(255,244,190,0)'); c.fillStyle = g; c.fillRect(w * 0.7 - 60 * k, h * 0.11 - 60 * k, 120 * k, 120 * k);
  c.fillStyle = '#fff1a8'; circ(c, w * 0.7, h * 0.11, 13 * k);
  c.fillStyle = 'rgba(255,255,255,.95)'; for (const [cx, cy, sc] of [[0.15, 0.1, 1], [0.55, 0.06, 0.7], [0.95, 0.16, 0.85]]) { const x = ((cx * w + t * 5 * k) % (w * 1.3)) - w * 0.15, y = cy * h; ell(c, x, y, 30 * k * sc, 8 * k * sc); ell(c, x + 14 * k * sc, y - 6 * k * sc, 17 * k * sc, 8 * k * sc); ell(c, x - 12 * k * sc, y - 3 * k * sc, 12 * k * sc, 6 * k * sc); }
  c.fillStyle = '#b9dca0'; ell(c, w * 0.7, H + 4 * k, w * 0.6, h * 0.14);   // the far hill, hazy
  { const vx = w * 0.62, vy = H - h * 0.085;   // the village on it: white cottages with thatch, and the church with its domes
    for (const [dx, sc] of [[-0.12, 0.8], [-0.05, 1], [0.1, 0.9], [0.17, 0.75]]) { const x = vx + dx * w, y = vy + h * 0.02, cw = 12 * k * sc; c.fillStyle = '#f4efe3'; c.fillRect(x - cw / 2, y - cw * 0.6, cw, cw * 0.6); c.fillStyle = '#c9a25a'; poly(c, [[x - cw * 0.7, y - cw * 0.55], [x, y - cw * 1.15], [x + cw * 0.7, y - cw * 0.55]]); }
    const cx = vx + w * 0.03, cy = vy + h * 0.015; c.fillStyle = '#f7f3ea'; c.fillRect(cx - 8 * k, cy - 14 * k, 16 * k, 14 * k); c.fillRect(cx - 3.5 * k, cy - 22 * k, 7 * k, 8 * k);
    c.fillStyle = '#6a9ed8'; ell(c, cx, cy - 24 * k, 4.5 * k, 4.5 * k); ell(c, cx - 8 * k, cy - 16 * k, 3 * k, 3 * k); ell(c, cx + 8 * k, cy - 16 * k, 3 * k, 3 * k);
    c.fillStyle = '#f2c230'; c.fillRect(cx - 0.6 * k, cy - 33 * k, 1.2 * k, 6 * k); c.fillRect(cx - 2 * k, cy - 31 * k, 4 * k, 1.1 * k); }
  c.fillStyle = '#9fd27e'; ell(c, w * 0.2, H + 6 * k, w * 0.5, h * 0.11); c.fillStyle = '#93ca70'; ell(c, w * 0.95, H + 9 * k, w * 0.35, h * 0.09);   // the nearer hills
  for (const [tx, ts] of [[0.08, 1.1], [0.16, 0.85], [0.33, 0.95]]) { const x = w * tx, y = H + 2 * k, r = 12 * k * ts; c.fillStyle = '#6b4a2b'; c.fillRect(x - 1.5 * k, y - r * 0.5, 3 * k, r); c.fillStyle = '#4a9244'; circ(c, x, y - r, r); c.fillStyle = '#5ca852'; circ(c, x - r * 0.35, y - r * 1.2, r * 0.6); }
  g = c.createLinearGradient(0, H, 0, h); g.addColorStop(0, '#a5da7c'); g.addColorStop(1, '#5fa83f'); c.fillStyle = g; c.fillRect(0, H, w, h - H);
  c.fillStyle = 'rgba(255,255,255,.07)'; for (let i = 0; i < 6; i++) { const y0 = H + (h - H) * (i / 6) ** 1.4, y1 = H + (h - H) * ((i + 0.5) / 6) ** 1.4; c.fillRect(0, y0, w, y1 - y0); }   // mown stripes, wider nearer
  // a wattle fence along the far edge, sunflowers looking over it
  c.strokeStyle = '#8a5a2b'; c.lineWidth = 2 * k; for (let i = 0; i < 14; i++) { const x = w * (0.04 + i * 0.072); c.beginPath(); c.moveTo(x, h * (FE.hor + 0.02)); c.lineTo(x, h * (FE.hor - 0.07)); c.stroke(); }
  c.strokeStyle = '#a7743f'; c.lineWidth = 3 * k; for (const yy of [-0.05, -0.02]) { c.beginPath(); c.moveTo(0, h * (FE.hor + yy)); c.lineTo(w, h * (FE.hor + yy)); c.stroke(); }
  for (const fx of [0.44, 0.5, 0.9]) { const x = w * fx, base = H + 3 * k, top = H - h * 0.1 + Math.sin(fx * 9) * 3 * k, sw = Math.sin(t * 1.2 + fx * 7) * 1.5 * k;
    c.strokeStyle = '#3f8f3f'; c.lineWidth = 2 * k; c.beginPath(); c.moveTo(x, base); c.lineTo(x + sw, top); c.stroke(); c.fillStyle = '#4f9e48'; ell(c, x + 3 * k, (base + top) / 2, 4 * k, 2 * k);
    c.fillStyle = '#f2b51a'; for (let p = 0; p < 10; p++) { const an = p * 0.628; ell(c, x + sw + Math.cos(an) * 5 * k, top + Math.sin(an) * 5 * k, 2.6 * k, 2.6 * k); } c.fillStyle = '#6b4422'; circ(c, x + sw, top, 3.4 * k); }
  // tufts of grass and wildflowers, bigger nearer
  c.strokeStyle = '#5d9e3c'; c.lineWidth = 1.5 * k; for (let i = 0; i < 30; i++) { const x = ((i * 0.377 + 0.13) % 1) * w, y = h * (FE.hor + 0.08 + ((i * 0.618) % 1) * 0.5), s2 = feScale(y / h) * 5 * k; for (const an of [-0.4, 0, 0.4]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(an + Math.sin(t + i) * 0.1) * s2, y - s2 * 1.4); c.stroke(); } }
  for (let i = 0; i < 12; i++) { const x = w * ((i * 0.37 + 0.11) % 1), y = h * (0.5 + ((i * 0.53) % 1) * 0.42), r = 2.3 * k * feScale(y / h); c.fillStyle = ['#ffd23f', '#ffffff', '#ff7aa8', '#9b6bd6'][i % 4]; for (let p = 0; p < 5; p++) circ(c, x + Math.cos(p * 1.26) * r, y + Math.sin(p * 1.26) * r, r * 0.75); c.fillStyle = '#f2c230'; circ(c, x, y, r * 0.5); }
  // the target: a painted ring lying in the grass, with a little flag, popping up each round
  const T = mg.tg;
  if (T) {
    const pop = Math.min(1, (t - T.t0) / 0.35), sp = pop < 1 ? Math.sin(pop * Math.PI * 0.5) * (1 + 0.25 * Math.sin(pop * Math.PI)) : 1;
    const R = 0.075 * feScale(T.y) * w * sp, tx = T.x * w, ty = T.y * h;
    c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, tx, ty + 2 * k, R * 1.08, R * 0.46);
    for (const [f, col] of [[1, '#d43a3a'], [0.72, '#fffdf5'], [0.44, '#d43a3a'], [0.18, '#ffd23f']]) { c.fillStyle = col; ell(c, tx, ty, R * f, R * 0.42 * f); }
    c.strokeStyle = '#6b4422'; c.lineWidth = 2 * k; c.beginPath(); c.moveTo(tx + R * 0.9, ty); c.lineTo(tx + R * 0.9, ty - R * 1.1); c.stroke();
    c.fillStyle = '#3d7cc2'; poly(c, [[tx + R * 0.9, ty - R * 1.1], [tx + R * 0.9 + R * 0.55, ty - R * 0.95 + Math.sin(t * 5) * 2 * k], [tx + R * 0.9, ty - R * 0.8]]);
    c.fillStyle = '#ffd23f'; poly(c, [[tx + R * 0.9, ty - R * 0.8], [tx + R * 0.9 + R * 0.55, ty - R * 0.65 + Math.sin(t * 5 + 1) * 2 * k], [tx + R * 0.9, ty - R * 0.5]]);
    if (mg.hitFx && t - mg.hitFx.t < 0.9) { const q = (t - mg.hitFx.t) / 0.9; c.strokeStyle = `rgba(255,210,63,${1 - q})`; c.lineWidth = 4 * k; c.beginPath(); c.ellipse(tx, ty, R * (1 + q), R * 0.42 * (1 + q), 0, 0, 7); c.stroke(); }
  }
  // Andriiko, by the ball
  person(c, w * 0.12, h * 0.95, NPC.andriiko.look, t, false, 1.25 * k);
  // the ball, and the dog
  const b = mg.ball, d = mg.dog;
  if (b.st === 'fly') {
    const q = Math.min(1, (t - b.t0) / b.dur);
    b.x = b.fx + (b.tx - b.fx) * q; b.y = b.fy + (b.ty - b.fy) * q; b.z = 4 * b.H * q * (1 - q);
    if (d.pose === 'leap' && q > 0.6) { b.st = 'caught'; d.ball = true; blip(900, 0.05); feScore(b, t); }
    else if (q >= 1) {
      b.st = 'bounce'; b.t0 = t; b.bx = b.x; b.by = b.y; b.vx = (b.tx - b.fx) * 0.22; b.vy = (b.ty - b.fy) * 0.22; blip(330, 0.04);
      feScore(b, t);
    }
  } else if (b.st === 'bounce') {
    const q = Math.min(1, (t - b.t0) / 0.5); b.x = b.bx + b.vx * Math.sin(q * Math.PI / 2); b.y = b.by + b.vy * Math.sin(q * Math.PI / 2); b.z = Math.sin(q * Math.PI) * b.H * 0.18 * (1 - q * 0.5);
    if (q >= 1) { b.st = 'ground'; b.z = 0; }
  }
  // Brovko's plan: chase the ball (aiming where it will land), pick it up, wait, trot back.
  let gx = d.x, gy = d.y, run = 0;
  if (b.st === 'fly' && t - b.t0 > 0.2) { gx = b.tx; gy = b.ty + 0.02; run = 1; }
  else if (b.st === 'bounce' || b.st === 'ground') { gx = b.x; gy = b.y + 0.02; run = 1; }
  else if (mg.phase === 'home') { gx = 0.42; gy = 0.88; run = 0.55; }
  const dx = (gx - d.x) * w, dy = (gy - d.y) * h, dd = Math.hypot(dx, dy);
  if (d.pose === 'leap') {
    const q = Math.min(1, (t - d.lt) / 0.55); d.z = Math.sin(q * Math.PI) * h * 0.2; d.x += d.lvx * dt; d.y += d.lvy * dt;
    if (b.st === 'caught') { b.x = d.x + 0.06 * d.face * feScale(d.y); b.y = d.y; b.z = d.z + 24 * k * feScale(d.y); }
    if (q >= 1) { d.pose = 'stand'; d.z = 0; if (b.st === 'caught') { b.st = 'carried'; fetchGot(); } }
  } else if (run && dd > 4 * k) {
    const sp = (run > 0.9 ? 0.95 : 0.45) * w * feScale(d.y);
    d.sp += (run - d.sp) * Math.min(1, dt * 4);
    const m = Math.min(dd, sp * d.sp * dt); d.x += dx / dd * m / w; d.y += dy / dd * m / h; d.ph += m / (w * 0.05);
    if (Math.abs(dx) > 2 * k) d.face = dx > 0 ? 1 : -1;
    d.pose = 'stand';
    // nearly there as the ball comes down: leap for it
    if (b.st === 'fly' && dd < w * 0.09 && (t - b.t0) / b.dur > 0.45) { d.pose = 'leap'; d.lt = t; d.lvx = dx / dd * 0.25; d.lvy = dy / dd * 0.25 * w / h; blip(760, 0.05); }
  } else {
    d.sp += (0 - d.sp) * Math.min(1, dt * 6);
    if ((b.st === 'ground') && dd <= 4 * k * 3) { b.st = 'carried'; d.ball = true; blip(740, 0.05); fetchGot(); }
    if (mg.phase === 'home' && dd <= 4 * k * 2) { d.ball = false; d.pose = 'sit'; d.face = -1; mg.ball = { st: 'rest', x: FE.ax, y: FE.ay, z: 0 }; mg.phase = 'pause'; blip(880, 0.06); fxTick(); setTimeout(() => { if (mg && mg.id === 'andriiko') mgRoundDone(); }, 700); }
    if (d.pose !== 'sit' && mg.phase === 'a' && b.st === 'rest') { d.pose = 'sit'; d.face = 1; }
  }
  if (b.st === 'carried') { b.x = d.x; b.y = d.y; b.z = 0; }
  // the dotted aim and the elastic while you pull
  const P = mg.phase === 'a' && mg.grab ? fetchPull(w, h) : null;
  if (P) {
    const to = fetchLand(P, w, h), dur = 0.55 + P.f * 0.5, H = (0.18 + P.f * 0.32) * h;
    c.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 1; i < 12; i++) { const q = i / 12, x = (FE.ax + (to.x - FE.ax) * q) * w, y = (FE.ay + (to.y - FE.ay) * q) * h - 4 * H * q * (1 - q); circ(c, x, y, (2.4 - q) * k); }
    c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2 * k; c.beginPath(); c.ellipse(to.x * w, to.y * h, 8 * k, 3 * k, 0, 0, 7); c.stroke();
  }
  const ballXY = () => P ? [FE.ax * w - P.px, FE.ay * h - P.py] : [b.x * w, b.y * h - (b.z || 0)];
  const drawBall = () => { if (b.st === 'carried' || b.st === 'caught') return; const [bx, by] = ballXY(), s = feScale(P ? FE.ay : b.y), r = 8 * k * s;
    c.fillStyle = 'rgba(0,0,0,.16)'; ell(c, P ? bx : b.x * w, P ? by + r : b.y * h + r * 0.4, r * (1 - Math.min(0.5, (b.z || 0) / h)), r * 0.35);
    if (P) { c.strokeStyle = `rgba(120,70,30,${0.35 + P.f * 0.4})`; c.lineWidth = (3 - P.f * 1.6) * k; for (const s2 of [-1, 1]) { c.beginPath(); c.moveTo(FE.ax * w + s2 * 15 * k, FE.ay * h - 10 * k); c.lineTo(bx, by); c.stroke(); } }
    c.save(); c.translate(bx, by); c.rotate(b.st === 'fly' || b.st === 'bounce' ? t * 9 : 0); ballArt(c, 0, 0, r); c.restore(); };
  // draw back to front
  const items = [{ y: d.y, f: () => dogDraw(c, d.x * w, d.y * h - d.z, 1.15 * k * feScale(d.y), d, t, b.st === 'carried' || b.st === 'caught') }, { y: P ? FE.ay : b.y, f: drawBall }];
  items.sort((a, z) => a.y - z.y).forEach(o => o.f());
  if (P) { c.fillStyle = `rgba(255,255,255,${0.5 + P.f * 0.4})`; rr(c, w * 0.04, h * 0.06, w * 0.2, 7 * k, 4 * k); c.fillStyle = '#ffd23f'; rr(c, w * 0.04, h * 0.06, w * 0.2 * P.f, 7 * k, 4 * k); }
  if (mg.pop && t - mg.pop.t < 1.8) { const q = (t - mg.pop.t) / 1.8; c.save(); c.globalAlpha = Math.max(0, q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3); c.font = `900 ${Math.round(24 * k)}px system-ui`; c.textAlign = 'center'; c.lineWidth = 5 * k; c.strokeStyle = '#4a2c1a'; c.strokeText(mg.pop.txt, w * 0.6, h * 0.3 - q * 20 * k); c.fillStyle = '#ffd23f'; c.fillText(mg.pop.txt, w * 0.6, h * 0.3 - q * 20 * k); c.restore(); }
  padBadge(c, w, k, `🎯 ${mg.hits || 0}`);
}
const fxTick = () => blip(1040, 0.04);
function feScore(b, t) { if (!b.hit || b.scored) return; b.scored = 1; mg.hits = (mg.hits || 0) + 1; mg.hitFx = { t }; mg.pop = { t, txt: PH.chudovo.uk }; say('p_chudovo'); blip(990, 0.1); }
function fetchGot() { if (mg.phase === 'a') mgBegin('b'); }
// Brovko, drawn from the side: a brown dog with a pale muzzle and the tan "eyebrow" spots he's named for.
// o: { face, ph (gait phase), sp (0 still .. 1 gallop), pose: stand | sit | leap }. ball: carrying it.
function dogDraw(c, x, y, s, o, t, ball) {
  const sp = o.sp || 0, ph = o.ph || 0, pose = o.pose, wag = Math.sin(t * (ball ? 16 : 11)) * (pose === 'sit' ? 0.55 : 0.35);
  const COL = '#c98a4a', FAR = '#a56c34', DARK = '#7a4b22', PALE = '#fff3e0', BROW = '#e8b86a';
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,.16)'; ell(c, 0, o.z || 0, 20 * s * (o.z ? 0.7 : 1), 4 * s);
  c.scale((o.face || 1) * s, s); c.lineCap = 'round'; c.lineJoin = 'round';
  const bob = pose === 'stand' ? -Math.abs(Math.sin(ph)) * 3 * sp : 0;
  const leg = (hx, hy, a, len, col, bend) => { c.strokeStyle = col; c.lineWidth = 4.2; const kx = hx + Math.sin(a) * len * 0.5, ky = hy + Math.cos(a) * len * 0.5, fx = kx + Math.sin(a + bend) * len * 0.5, fy = ky + Math.cos(a + bend) * len * 0.5; c.beginPath(); c.moveTo(hx, hy); c.lineTo(kx, ky); c.lineTo(fx, fy); c.stroke(); c.fillStyle = col; ell(c, fx + 1.5, fy, 3, 1.8); };
  if (pose === 'sit') {
    // tail sweeping the grass, haunch down, front legs straight, head up
    c.strokeStyle = COL; c.lineWidth = 3.4; c.beginPath(); c.moveTo(-10, -6); c.quadraticCurveTo(-20, -4 + wag * 4, -24, -10 - wag * 8); c.stroke();
    leg(6, -20, 0.05, 20, FAR, 0); leg(10, -20, -0.05, 20, COL, 0);
    c.fillStyle = COL; c.save(); c.translate(0, -14); c.rotate(-0.75); ell(c, 0, 0, 13, 8); c.restore();
    c.fillStyle = FAR; ell(c, -7, -7, 8, 7); c.fillStyle = COL; ell(c, -5, -7, 7, 6.5); c.fillStyle = DARK; ell(c, 1, -2, 4, 1.8);
    c.fillStyle = PALE; ell(c, 8, -20, 5, 7);
    dogHead(c, 9, -33, 0.1, t, ball, sp, ph, COL, DARK, PALE, BROW);
  } else {
    const lp = pose === 'leap', run = Math.min(1, sp);
    const sw = lp ? 0 : Math.sin(ph) * 0.8 * run, sw2 = lp ? 0 : Math.sin(ph + Math.PI) * 0.8 * run;
    c.translate(0, bob);
    if (lp) c.rotate(-0.2 + Math.min(0.4, (t - (o.lt || t)) * 0.8));
    // tail up and wagging
    c.strokeStyle = COL; c.lineWidth = 3.4; c.beginPath(); c.moveTo(-13, -22); c.quadraticCurveTo(-20, -26 - run * 2, -23 - wag * 3, -33 + wag * 4 + run * 6); c.stroke();
    // far legs, body, near legs
    leg(-10, -16, lp ? 1.2 : sw2 + 0.25, 17, FAR, lp ? 0.2 : -0.5 * run); leg(10, -17, lp ? -1.1 : sw - 0.15, 17, FAR, lp ? -0.3 : 0.4 * run);
    c.fillStyle = COL; c.save(); c.translate(0, -20); c.rotate(lp ? 0 : Math.sin(ph * 2) * 0.05 * run); ell(c, 0, 0, 16, 8.5); c.fillStyle = FAR; ell(c, -5, -4, 7, 4); c.restore();
    c.fillStyle = PALE; ell(c, 10, -17, 6, 6);
    leg(-12, -16, lp ? 1.0 : sw + 0.25, 17, COL, lp ? 0.3 : -0.5 * run); leg(12, -17, lp ? -1.3 : sw2 - 0.15, 17, COL, lp ? -0.2 : 0.4 * run);
    dogHead(c, 18 + run * 2, -30 + run * 3, run * 0.25 + (lp ? -0.3 : 0), t, ball, sp, ph, COL, DARK, PALE, BROW);
  }
  c.restore();
}
function dogHead(c, hx, hy, tilt, t, ball, sp, ph, COL, DARK, PALE, BROW) {
  c.save(); c.translate(hx, hy); c.rotate(tilt);
  c.fillStyle = COL; ell(c, -3, 6, 5, 7);   // neck
  c.fillStyle = COL; circ(c, 0, 0, 8);
  c.fillStyle = PALE; ell(c, 7, 2.5, 6.5, 4.2);
  c.fillStyle = '#2a1d14'; ell(c, 12.5, 0.8, 2.2, 1.8);
  c.fillStyle = BROW; ell(c, 2.4, -4.6, 2.6, 1.4);   // Brovko's eyebrow
  c.fillStyle = '#2a1d14'; circ(c, 2.6, -2, 1.5); c.fillStyle = '#fff'; circ(c, 3.1, -2.5, 0.5);
  if (ball) { ballArt(c, 10, 6.5, 4.6); }
  else { const pant = Math.abs(Math.sin(t * 9)) * 1.2; c.fillStyle = '#ff7f8f'; ell(c, 8.5, 7 + pant, 2.2, 3 + pant); }
  const flap = Math.sin(ph) * 0.5 * sp + Math.sin(t * 2) * 0.05;
  c.save(); c.translate(-3, -5); c.rotate(0.35 + flap - sp * 0.4); c.fillStyle = DARK; ell(c, -2, 6, 3.4, 7.5); c.restore();
  c.restore();
}

// ------------------------------------------------------------------ Taras's fishing, with a rod you bend
// Press and pull back: the rod tilts back over your shoulder and its tip bends with the strain. Let go and it
// whips forward, the line flies out and the float lands further for a longer pull, with a hook and a
// wriggling worm hanging under it. A fish swims up, nibbles (the float twitches: wait!), then pulls the
// float under: tap now, «Тягни!», the rod bends hard and the fish leaps out into the bucket.
const FI = { bx: 0.15, by: 0.97, len: 0.54, rest: -0.95, wl: 0.5 };   // rod butt, rod length (of the width), resting angle, water line
function fishBegin(step) {
  if (step === 'a') {
    mg.rod = mg.rod || { a: FI.rest, v: 0, bend: 0, load: 0 };
    mg.cast = null; mg.fishy = null; mg.fish = null; mg.pull = 0;
    mgLine('mg_zakydai', 'zakydai', ['Потягни вудку назад і відпусти', 'Pull the rod back and let go']);
  } else mgLine('mg_tiahny', 'tiahny', ['Торкнися зараз!', 'Tap now!']);
}
// The rod as a bent line: angle a at the butt, curving by `bend` towards the tip. Returns its points.
function rodPts(w, h, R) {
  const n = 14, L = FI.len * w, pts = []; let x = mg.rodB ? mg.rodB[0] : FI.bx * w, y = mg.rodB ? mg.rodB[1] : FI.by * h, a = R.a;
  pts.push([x, y]);
  for (let i = 1; i <= n; i++) { const q = i / n; a = R.a + R.bend * q * q; x += Math.cos(a) * L / n; y += Math.sin(a) * L / n; pts.push([x, y]); }
  return pts;
}
function fishPress() {
  if (mg.phase === 'a' && !mg.cast) { mg.pulling = true; blip(480, 0.03); }
  else if (mg.phase === 'wait' && mg.cast && mg.cast.landed) {
    if (mg.fishy && mg.fishy.st === 'bite') fishCatch();
    else { mgLine('mg_wait', null, ['Чекай', 'Wait until the float goes under']); mg.rod.v -= 1.5; }   // too soon: a twitch of the rod, and Taras says wait
  }
}
function fishRelease() {
  if (mg.phase !== 'a' || !mg.pulling) return;
  mg.pulling = false;
  const f = mg.pull;
  if (f < 0.2) { mg.pull = 0; return; }   // just a wobble
  const pad = $('#mgPad'), w = pad.width, h = pad.height, tip = rodPts(w, h, mg.rod).pop();
  mg.rod.v += 9 + f * 7;   // the forward whip
  const tx = (0.42 + f * 0.48) * w, ty = (FI.wl + 0.04 + f * 0.04) * h;
  mg.cast = { t0: nowT, fx: tip[0], fy: tip[1], tx, ty, dur: 0.6 + f * 0.35, H: h * (0.25 + f * 0.25), landed: false };
  blip(560, 0.06); useWord('zakydai', true); mgAct('zakydai', true); mg.pull = 0; mg.phase = 'wait';
}
function fishCatch() {
  const F = mg.fishy; if (!F || F.st !== 'bite') return;
  useWord('tiahny', true); blip(990, 0.1); mgAct('tiahny', true);
  mg.rod.load = 1.4; mg.rod.v -= 5;
  mg.fish = { t0: nowT, x: mg.cast.tx, y: mg.cast.ty, size: 0.8 + Math.random() * 0.5 };
  mg.fishy = null; mg.cast = null; mg.phase = 'catch';
  setTimeout(() => { if (mg && mg.phase === 'catch') mgRoundDone(); }, 1500);
}
// A drawn fish: a silvery-green body, a tail, a fin, an eye. Faces right; a = body angle.
function fishArt(c, x, y, s, a, t, ghost, dir = 1) {
  c.save(); c.translate(x, y); c.rotate(a); c.scale(s * dir, s);
  const tw = Math.sin(t * 18) * 0.35;
  c.globalAlpha *= ghost ? 0.35 : 1;
  c.fillStyle = ghost ? '#1f3d52' : '#7fa86a'; c.save(); c.translate(-13, 0); c.rotate(tw); poly(c, [[0, 0], [-9, -7], [-6, 0], [-9, 7]]); c.restore();
  if (!ghost) { const g = c.createLinearGradient(0, -7, 0, 7); g.addColorStop(0, '#6f9a5c'); g.addColorStop(0.5, '#c9d8b8'); g.addColorStop(1, '#eef2e6'); c.fillStyle = g; } else c.fillStyle = '#1f3d52';
  ell(c, 0, 0, 15, 6.5);
  if (!ghost) { c.fillStyle = '#e0713a'; poly(c, [[-2, 4], [4, 4], [0, 9]]); c.fillStyle = '#5d8a4c'; poly(c, [[-6, -5], [3, -6], [-3, -11]]); c.fillStyle = '#fff'; circ(c, 9, -1.5, 2.2); c.fillStyle = '#1a1a1a'; circ(c, 9.5, -1.5, 1.2); c.strokeStyle = 'rgba(60,90,50,.5)'; c.lineWidth = 0.8; c.beginPath(); c.arc(6, 0, 4.5, -1.2, 1.2); c.stroke(); }
  c.restore();
}
function fishFrame(c, w, h, t, k, dt) {
  const R = mg.rod, wl = FI.wl * h;
  // sky, far bank, water, near bank
  let g = c.createLinearGradient(0, 0, 0, wl); g.addColorStop(0, '#9fdcfb'); g.addColorStop(1, '#e8f6fb'); c.fillStyle = g; c.fillRect(0, 0, w, wl);
  c.fillStyle = 'rgba(255,255,255,.9)'; { const x = ((w * 0.6 + t * 5 * k) % (w * 1.3)) - w * 0.15; ell(c, x, h * 0.12, 30 * k, 8 * k); ell(c, x + 14 * k, h * 0.09, 18 * k, 8 * k); }
  { const sg = c.createRadialGradient(w * 0.82, h * 0.12, 0, w * 0.82, h * 0.12, 50 * k); sg.addColorStop(0, 'rgba(255,244,190,.85)'); sg.addColorStop(1, 'rgba(255,244,190,0)'); c.fillStyle = sg; c.fillRect(w * 0.82 - 50 * k, h * 0.12 - 50 * k, 100 * k, 100 * k); c.fillStyle = '#fff1a8'; circ(c, w * 0.82, h * 0.12, 11 * k); }   // the sun
  c.fillStyle = '#b9dca0'; ell(c, w * 0.55, wl + 3 * k, w * 0.55, h * 0.1); padVillage(c, w * 0.5, wl - h * 0.035, k, w, t, false);   // the far hill and the village on it
  c.fillStyle = '#7fc25a'; ell(c, w * 0.75, wl + 2 * k, w * 0.5, h * 0.06); for (const [fx, sc] of [[0.38, 0.9], [0.62, 1.1], [0.7, 0.8], [0.9, 1.15], [0.97, 0.85]]) padTree(c, w * fx, wl + 2 * k, 11 * k * sc, k);
  for (let i = 0; i < 6; i++) { const a = 0.4 + 0.4 * Math.sin(t * 1.3 + i * 1.7); c.strokeStyle = `rgba(255,250,215,${0.5 * a})`; c.lineWidth = 1.6 * k; const x = w * (0.72 + (i % 3) * 0.07) + Math.sin(t * 0.6 + i) * 4 * k, y = wl + (8 + i * 6) * k; c.beginPath(); c.moveTo(x - 7 * k, y); c.lineTo(x + 7 * k, y); c.stroke(); }   // the sun glinting on the water
  g = c.createLinearGradient(0, wl, 0, h); g.addColorStop(0, '#5fb1de'); g.addColorStop(1, '#2c6f9e'); c.fillStyle = g; c.fillRect(0, wl, w, h - wl);
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.5 * k; for (let i = 0; i < 9; i++) { const yy = wl + (6 + i * 11) * k, xx = ((i * 97 + t * 14 * (1 + i % 3)) % (w + 60)) - 30; c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + 22 * k, yy); c.stroke(); }
  c.fillStyle = '#5e9f3f'; ell(c, w * 0.95, wl + h * 0.34, 14 * k, 5 * k); c.fillStyle = '#ff9fc0'; circ(c, w * 0.95 + 4 * k, wl + h * 0.34 - 3 * k, 3 * k);   // a water lily
  c.fillStyle = '#6fb04a'; poly(c, [[0, h * 0.72], [w * 0.2, h * 0.78], [w * 0.3, h], [0, h]]);
  c.strokeStyle = '#4f8f3a'; c.lineWidth = 2 * k; for (let i = 0; i < 6; i++) { const x = w * (0.2 + i * 0.018), sw = Math.sin(t * 1.3 + i) * 3 * k; c.beginPath(); c.moveTo(x, h * 0.86); c.quadraticCurveTo(x + sw, h * 0.7, x + sw * 1.5, h * (0.6 + (i % 3) * 0.03)); c.stroke(); c.fillStyle = '#7a4e26'; ell(c, x + sw * 1.5, h * (0.6 + (i % 3) * 0.03), 1.8 * k, 5 * k); }   // reeds
  // the bucket on the bank
  const bkx = w * 0.045, bky = h * 0.97;
  c.fillStyle = '#8a9099'; poly(c, [[bkx - 14 * k, bky - 18 * k], [bkx + 14 * k, bky - 18 * k], [bkx + 11 * k, bky], [bkx - 11 * k, bky]]); c.fillStyle = '#5b6470'; ell(c, bkx, bky - 18 * k, 14 * k, 4 * k);
  c.fillStyle = '#c9d8b8'; for (let i = 0; i < Math.min(5, mg.score); i++) ell(c, bkx - 6 * k + i * 3 * k, bky - 19 * k - (i % 2) * 2 * k, 5 * k, 2.2 * k);
  // the rod: a spring towards its goal angle, the tip lagging behind as it moves, and bending under load
  if (mg.pulling && mg.down) { const d = mg.down; mg.pull = Math.max(0, Math.min(1, (Math.hypot(d.x - d.x0, d.y - d.y0) / (w * 0.35)))); }
  const goal = mg.phase === 'catch' && mg.fish && t - mg.fish.t0 < 0.5 ? -1.55 : mg.pulling ? FI.rest - 0.6 * mg.pull : FI.rest;
  R.v += ((goal - R.a) * 90 - R.v * 13) * dt; R.a += R.v * dt;
  R.load *= Math.exp(-dt * 2.2);
  const nib = mg.fishy && mg.fishy.st === 'bite' ? 0.35 : mg.fishy && mg.fishy.st === 'nibble' ? 0.08 * Math.max(0, Math.sin(t * 22)) : 0;
  R.bend += ((-R.v * 0.05 + R.load * 0.7 + nib + (mg.pulling ? -mg.pull * 0.25 : 0)) - R.bend) * Math.min(1, dt * 18);
  R.bend = Math.max(-0.9, Math.min(1.2, R.bend));
  // Her, standing on the bank side-on to the water. Her near arm reaches forward and a little down to the rod's
  // butt, tilting as the rod is drawn back and whipped forward; the rod is anchored in that hand and pivots
  // there. Her far hand holds the cork grip a little further up, following the rod round.
  const hs = h * 0.0052, hxp = w * 0.13, hyp = h * 0.985, sh = [hxp, hyp - 47 * hs];   // her scale, her feet, her shoulder
  const nearA = -1.05 - (R.a - FI.rest) * 0.45;   // the near arm: forward and down, lifting as the rod comes back
  const handN = [sh[0] - Math.sin(nearA) * 19 * hs, sh[1] + Math.cos(nearA) * 19 * hs];
  mg.rodB = handN;
  const grip = [handN[0] + Math.cos(R.a) * 13 * hs, handN[1] + Math.sin(R.a) * 13 * hs];   // where the far hand holds
  const farA = Math.atan2(-(grip[0] - sh[0]), grip[1] - sh[1]);
  personSide(c, hxp, hyp, Object.assign({}, ME, { armAng: [farA, nearA] }), t, 0, hs);
  const pts = rodPts(w, h, R), tip = pts[pts.length - 1];
  // the line, the float, the hook and the worm
  const C = mg.cast;
  let fx = null, fy = null;
  if (C) {
    const q = Math.min(1, (t - C.t0) / C.dur);
    if (!C.landed) { fx = C.fx + (C.tx - C.fx) * q; fy = C.fy + (C.ty - C.fy) * q - 4 * C.H * q * (1 - q); if (q >= 1) { C.landed = t; blip(300, 0.05); mg.fishy = { st: 'swim', t0: t, x: C.tx + (Math.random() < 0.5 ? -1 : 1) * w * 0.25, biteAt: t + 2.2 + Math.random() * 2.5 }; } }
    else {
      const F = mg.fishy, sink = F && F.st === 'bite' ? 7 * k + Math.abs(Math.sin(t * 16)) * 5 * k : F && F.st === 'nibble' ? Math.max(0, Math.sin(t * 22)) * 3 * k : Math.sin(t * 2) * 1.2 * k;
      fx = C.tx; fy = C.ty + sink;
      const r = ((t - C.landed) * 0.7) % 1; c.strokeStyle = `rgba(255,255,255,${0.6 * (1 - r)})`; c.lineWidth = 1.3 * k; c.beginPath(); c.ellipse(C.tx, C.ty + 2 * k, (6 + r * 16) * k, (2 + r * 5) * k, 0, 0, 7); c.stroke();
    }
    // the hook hangs under the float on its own bit of line, with the worm wriggling on it
    const hx = fx + Math.sin(t * 1.7) * 2 * k, hy = (C.landed ? fy + 30 * k : fy + 14 * k);
    c.strokeStyle = C.landed ? 'rgba(230,240,250,.45)' : 'rgba(60,60,60,.7)'; c.lineWidth = 1 * k; c.beginPath(); c.moveTo(fx, fy); c.lineTo(hx, hy); c.stroke();
    c.strokeStyle = '#9aa3ad'; c.lineWidth = 1.6 * k; c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx, hy + 6 * k); c.arc(hx - 3 * k, hy + 6 * k, 3 * k, 0, Math.PI * 0.95); c.stroke();
    c.strokeStyle = '#e8828f'; c.lineWidth = 2.6 * k; c.beginPath(); for (let i = 0; i <= 8; i++) { const q = i / 8, wx = hx - 3 * k + Math.sin(t * 7 + q * 5) * 3 * k * q, wy = hy + 6 * k + q * 9 * k; i ? c.lineTo(wx, wy) : c.moveTo(wx, wy); } c.stroke();
    // the fish's shadow coming to the hook, nibbling, then biting
    const F = mg.fishy;
    if (F) {
      if (F.st === 'swim') { F.x += (C.tx - F.x) * Math.min(1, dt * 0.7); if (t > F.biteAt - 1.4) { F.st = 'nibble'; F.t0 = t; } }
      else if (F.st === 'nibble' && t > F.biteAt) { F.st = 'bite'; F.t0 = t; mgBegin('b'); mg.phase = 'wait'; blip(420, 0.08); }
      else if (F.st === 'bite' && t - F.t0 > 1.4) { F.st = 'swim'; F.x = C.tx + w * 0.2; F.biteAt = t + 2 + Math.random() * 2.5; mgLine('mg_wait', null, ['Чекай', 'Too late! Wait for the next one']); }
      const dir = C.tx >= F.x ? 1 : -1;
      fishArt(c, F.x - dir * 8 * k, hy + 12 * k, 1.1 * k, Math.sin(t * 3) * 0.08, t, true, dir);
      if (F.st === 'bite') { c.font = `900 ${Math.round(26 * k)}px system-ui`; c.fillStyle = '#ffd23f'; c.strokeStyle = '#4a2c1a'; c.lineWidth = 4 * k; c.textAlign = 'center'; c.strokeText('!', fx, fy - 16 * k); c.fillText('!', fx, fy - 16 * k); }
    }
    // the line from the rod tip, sagging a little once the float is out
    c.strokeStyle = 'rgba(70,70,70,.85)'; c.lineWidth = 1.1 * k; c.beginPath(); c.moveTo(tip[0], tip[1]);
    const sag = C.landed ? (mg.fishy && mg.fishy.st === 'bite' ? 0 : 26 * k) : 0;
    c.quadraticCurveTo((tip[0] + fx) / 2, Math.max(tip[1], fy) + sag, fx, fy); c.stroke();
    c.fillStyle = '#fff'; circ(c, fx, fy, 5.5 * k); c.fillStyle = '#e2392f'; c.beginPath(); c.arc(fx, fy, 5.5 * k, Math.PI, 0); c.fill(); c.fillStyle = '#333'; c.fillRect(fx - 0.8 * k, fy - 11 * k, 1.6 * k, 6 * k);
  } else if (!mg.fish) {
    // waiting to cast: the hook and worm dangle from the tip
    const sway = Math.sin(t * 2.4) * 4 * k + R.v * 2 * k, hx = tip[0] + sway, hy = tip[1] + 24 * k;
    c.strokeStyle = 'rgba(70,70,70,.85)'; c.lineWidth = 1.1 * k; c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(hx, hy); c.stroke();
    c.fillStyle = '#fff'; circ(c, tip[0] + sway * 0.6, tip[1] + 12 * k, 4 * k); c.fillStyle = '#e2392f'; c.beginPath(); c.arc(tip[0] + sway * 0.6, tip[1] + 12 * k, 4 * k, Math.PI, 0); c.fill();
    c.strokeStyle = '#9aa3ad'; c.lineWidth = 1.6 * k; c.beginPath(); c.moveTo(hx, hy); c.lineTo(hx, hy + 6 * k); c.arc(hx - 3 * k, hy + 6 * k, 3 * k, 0, Math.PI * 0.95); c.stroke();
    c.strokeStyle = '#e8828f'; c.lineWidth = 2.6 * k; c.beginPath(); for (let i = 0; i <= 8; i++) { const q = i / 8, wx = hx - 3 * k + Math.sin(t * 7 + q * 5) * 3 * k * q, wy = hy + 6 * k + q * 9 * k; i ? c.lineTo(wx, wy) : c.moveTo(wx, wy); } c.stroke();
  }
  // the caught fish, leaping out and into the bucket, with drops of water
  if (mg.fish) {
    const F = mg.fish, q = Math.min(1, (t - F.t0) / 1.1), x = F.x + (bkx - F.x) * q, y = F.y + (bky - 22 * k - F.y) * q - Math.sin(q * Math.PI) * h * 0.45;
    c.strokeStyle = 'rgba(70,70,70,.85)'; c.lineWidth = 1.1 * k; if (q < 0.9) { c.beginPath(); c.moveTo(tip[0], tip[1]); c.lineTo(x, y - 6 * k); c.stroke(); }
    if (q < 1) fishArt(c, x, y, 1.3 * k * F.size, Math.sin(t * 20) * 0.5 + 1.2 - q * 2.2, t, false, -1);   // facing the bucket as it flies
    c.fillStyle = 'rgba(200,230,250,.9)'; for (let i = 0; i < 8; i++) { const dq = (t - F.t0) * 1.4 - i * 0.04; if (dq < 0 || dq > 0.8) continue; circ(c, F.x + (i - 4) * 5 * k * dq * 3, F.y - Math.sin(dq * 3) * 30 * k + dq * dq * 40 * k, 2 * k); }
    if (q < 0.25) { c.strokeStyle = `rgba(255,255,255,${0.8 - q * 3})`; c.lineWidth = 2 * k; c.beginPath(); c.ellipse(F.x, F.y + 2 * k, (10 + q * 80) * k, (3 + q * 20) * k, 0, 0, 7); c.stroke(); }
  }
  // the rod itself, over everything: a cork handle and reel, tapering to the tip
  for (let i = 1; i < pts.length; i++) { c.strokeStyle = i < 4 ? '#c8a46a' : '#6b4422'; c.lineWidth = (i < 4 ? 7 : 5.5 - i * 0.32) * k; c.lineCap = 'round'; c.beginPath(); c.moveTo(pts[i - 1][0], pts[i - 1][1]); c.lineTo(pts[i][0], pts[i][1]); c.stroke(); }
  const rp = pts[3]; c.fillStyle = '#5b6470'; circ(c, rp[0] + 4 * k, rp[1] + 3 * k, 5 * k); c.fillStyle = '#9aa3ad'; circ(c, rp[0] + 4 * k, rp[1] + 3 * k, 2 * k);
  c.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 5; i < pts.length; i += 3) circ(c, pts[i][0], pts[i][1], 1.6 * k);   // line guides
  { const gp = [handN[0] + Math.cos(R.a) * 13 * hs, handN[1] + Math.sin(R.a) * 13 * hs]; c.fillStyle = ME.skin; circ(c, gp[0], gp[1], 3.6 * hs); circ(c, handN[0], handN[1], 3.8 * hs); c.fillStyle = 'rgba(0,0,0,.12)'; circ(c, handN[0] + 0.8 * hs, handN[1] + 1 * hs, 2.4 * hs); }   // her hands closed round the grip
  // the pull meter while you draw the rod back
  if (mg.pulling) { c.fillStyle = 'rgba(47,42,38,.45)'; rr(c, w * 0.3 - 2 * k, 10 * k, w * 0.4 + 4 * k, 12 * k, 6 * k); c.fillStyle = 'rgba(255,255,255,.75)'; rr(c, w * 0.3, 12 * k, w * 0.4, 8 * k, 4 * k); c.fillStyle = '#ffd23f'; rr(c, w * 0.3, 12 * k, w * 0.4 * mg.pull, 8 * k, 4 * k); }   // top middle, clear of the score
  padBadge(c, w, k, `🐟 ${mg.score}`);
}

const cellPos = (i, w, h) => { const r = Math.min(w, h) * 0.075, col = i % 5, row = Math.floor(i / 5); return [w * 0.5 + (col - 2) * r * 1.8 + (row % 2) * r * 0.9, h * 0.55 + (row - 0.5) * r * 1.6, r]; };
function bee(c, x, y, s, t) {
  c.fillStyle = 'rgba(255,255,255,.75)'; const fl = Math.sin(t * 40) * 0.3; ell(c, x - s * 0.2, y - s * 0.55, s * 0.4, s * (0.25 + fl * 0.1)); ell(c, x + s * 0.25, y - s * 0.55, s * 0.4, s * (0.25 - fl * 0.1));
  c.fillStyle = '#f5c518'; ell(c, x, y, s * 0.7, s * 0.48); c.fillStyle = '#3a2a1a'; for (const dx of [-0.2, 0.15]) c.fillRect(x + dx * s - s * 0.08, y - s * 0.45, s * 0.16, s * 0.9); circ(c, x + s * 0.62, y, s * 0.2);
}
function mgFrame() {
  if (!mg) return;
  const pad = $('#mgPad'); if (!pad || !sheetOpen()) { mgStopVoice(); mg = null; return; }   // the card was closed: the game stops (and stops talking)
  const c = pad.getContext('2d'), w = pad.width, h = pad.height, t = nowT, k = mg.k || 1;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  const dtF = Math.min(0.05, Math.max(0, t - mg.lastT));
  if (GAMES[mg.id]) { GAMES[mg.id].frame(c, w, h, t, k, dtF);  } else if (mg.id === 'andriiko') fetchFrame(c, w, h, t, k, Math.min(0.05, Math.max(0, t - mg.lastT)));
  else fishFrame(c, w, h, t, k, Math.min(0.05, Math.max(0, t - mg.lastT)));
  if (mg) padFinish(c, w, h, k);
  if (mg) padCheer(c, w, h, k, mg.cheer, t);
  if (mg) mgFlash(c, w, h, k, t);
  mg && (mg.lastT = t);
  requestAnimationFrame(mgFrame);
}

// Scenery shared by the game pads: a leafy tree, a snowy fir, and the village on a far hill with its church.
function padTree(c, x, y, r, k) { c.fillStyle = '#6b4a2b'; c.fillRect(x - 1.5 * k, y - r * 0.5, 3 * k, r * 0.9); c.fillStyle = '#4a9244'; circ(c, x, y - r, r); c.fillStyle = '#5ca852'; circ(c, x - r * 0.35, y - r * 1.2, r * 0.6); c.fillStyle = 'rgba(255,255,255,.12)'; circ(c, x - r * 0.4, y - r * 1.35, r * 0.3); }
function padFir(c, x, y, sc, k, snowy) { const r = 14 * k * sc; c.fillStyle = '#6b4a2b'; c.fillRect(x - 1.5 * k * sc, y - r * 0.4, 3 * k * sc, r * 0.5);
  for (let i = 0; i < 3; i++) { const yy = y - r * 0.35 - i * r * 0.55, ww = r * (0.95 - i * 0.22); c.fillStyle = '#3f6e52'; poly(c, [[x - ww, yy], [x, yy - r * 0.8], [x + ww, yy]]); if (snowy) { c.fillStyle = '#ffffff'; poly(c, [[x - ww * 0.95, yy], [x - ww * 0.3, yy - r * 0.18], [x, yy - r * 0.05], [x + ww * 0.35, yy - r * 0.2], [x + ww * 0.95, yy]]); poly(c, [[x - ww * 0.25, yy - r * 0.6], [x, yy - r * 0.8], [x + ww * 0.25, yy - r * 0.6]]); } } }
function padVillage(c, vx, vy, k, w, t, snowy) {
  for (const [dx, sc] of [[-0.12, 0.8], [-0.05, 1], [0.1, 0.9], [0.17, 0.75]]) { const x = vx + dx * w, y = vy, cw = 12 * k * sc; c.fillStyle = snowy ? '#efe6d6' : '#f4efe3'; c.fillRect(x - cw / 2, y - cw * 0.6, cw, cw * 0.6); c.fillStyle = snowy ? '#ffffff' : '#c9a25a'; poly(c, [[x - cw * 0.7, y - cw * 0.55], [x, y - cw * 1.15], [x + cw * 0.7, y - cw * 0.55]]);
    if (snowy) for (let i = 0; i < 3; i++) { const q = ((t * 0.12 + i * 0.33 + dx) % 1); c.fillStyle = `rgba(235,238,245,${0.6 * (1 - q)})`; circ(c, x + cw * 0.3, y - cw * 1.1 - q * 22 * k, (2 + q * 4) * k); } }
  const cx = vx + w * 0.03, cy = vy - 0.5 * k; c.fillStyle = '#f7f3ea'; c.fillRect(cx - 7 * k, cy - 13 * k, 14 * k, 13 * k); c.fillRect(cx - 3 * k, cy - 20 * k, 6 * k, 7 * k);
  c.fillStyle = '#6a9ed8'; ell(c, cx, cy - 22 * k, 4 * k, 4 * k); if (snowy) { c.fillStyle = '#fff'; ell(c, cx, cy - 24.5 * k, 3 * k, 1.5 * k); } c.fillStyle = '#f2c230'; c.fillRect(cx - 0.6 * k, cy - 31 * k, 1.2 * k, 6 * k); c.fillRect(cx - 2 * k, cy - 29 * k, 4 * k, 1.1 * k);
}
// The score, the same in every game: a little dark pill in the top right corner.
function padBadge(c, w, k, text) { c.save(); c.font = `800 ${Math.round(14 * k)}px system-ui, sans-serif`; const tw = c.measureText(text).width, bw = tw + 18 * k, bh = 24 * k, x = w - bw - 8 * k, y = 8 * k; c.fillStyle = "rgba(47,42,38,.72)"; rr(c, x, y, bw, bh, bh / 2); c.fillStyle = "#fff"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(text, x + bw / 2, y + bh / 2 + 1); c.restore(); }
// A neighbour in a winter coat (for the winter games), and their breath steaming in the cold now and then.
const winterLook = L => Object.assign({}, L, { coat: '#6b4a32', fur: '#f1ead8', boots: '#4a3020' });
function coldBreath(c, x, y, t, k, ph) { const q = ((t + ph) % 2.6) / 1.2; if (q > 1) return; c.fillStyle = `rgba(255,255,255,${0.55 * (1 - q)})`; circ(c, x + q * 14 * k, y - q * 10 * k, (2 + q * 6) * k); }
// A painted Ukrainian hive: boards, a shaded side, a yellow band, painted flowers, a pitched roof, the entrance
// and its landing board (the summer and the winter bee games share it).
function hiveBox(c, hx, hy, hw, hh, k) {
  c.fillStyle = 'rgba(40,60,20,.2)'; ell(c, hx, hy + 3 * k, hw * 0.62, 6 * k);
  c.fillStyle = '#7a4b22'; c.fillRect(hx - hw * 0.4, hy - 6 * k, 5 * k, 10 * k); c.fillRect(hx + hw * 0.4 - 5 * k, hy - 6 * k, 5 * k, 10 * k);
  c.fillStyle = '#5d9ad3'; rr(c, hx - hw / 2, hy - hh * 0.9, hw, hh * 0.84, 4 * k);
  c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(hx + hw * 0.32, hy - hh * 0.9, hw * 0.18, hh * 0.84);
  c.strokeStyle = 'rgba(30,50,90,.25)'; c.lineWidth = 1 * k; for (let i = 1; i < 5; i++) { const y = hy - hh * 0.9 + hh * 0.84 * i / 5; c.beginPath(); c.moveTo(hx - hw / 2, y); c.lineTo(hx + hw / 2, y); c.stroke(); }
  c.fillStyle = '#ffd23f'; c.fillRect(hx - hw / 2, hy - hh * 0.5, hw, 4 * k);
  for (const dx of [-0.27, 0.27]) { const fx = hx + dx * hw, fy = hy - hh * 0.72; c.fillStyle = '#d43a3a'; for (let p = 0; p < 5; p++) { const a = p * 1.2566 - 1.57; ell(c, fx + Math.cos(a) * 4.5 * k, fy + Math.sin(a) * 4.5 * k, 3 * k, 3 * k); } c.fillStyle = '#ffd23f'; circ(c, fx, fy, 2.4 * k); }
  c.fillStyle = '#8a3b2b'; poly(c, [[hx - hw * 0.64, hy - hh * 0.88], [hx, hy - hh * 1.18], [hx + hw * 0.64, hy - hh * 0.88]]); c.fillStyle = '#6e2d20'; poly(c, [[hx, hy - hh * 1.18], [hx + hw * 0.64, hy - hh * 0.88], [hx + hw * 0.56, hy - hh * 0.88]]);
  c.fillStyle = '#3a2a1a'; rr(c, hx - hw * 0.2, hy - hh * 0.18, hw * 0.4, 5 * k, 2 * k); c.fillStyle = '#a06a35'; c.fillRect(hx - hw * 0.26, hy - hh * 0.18 + 5 * k, hw * 0.52, 3 * k);
}
// A round won: a soft glow and a burst of sparkles from the middle of the pad.
function padCheer(c, w, h, k, t0, t) {
  const q = (t - t0) / 0.9; if (!t0 || q < 0 || q > 1) return;
  const g = c.createRadialGradient(w / 2, h * 0.45, 0, w / 2, h * 0.45, Math.max(w, h) * 0.5); g.addColorStop(0, `rgba(255,240,170,${0.35 * (1 - q)})`); g.addColorStop(1, 'rgba(255,240,170,0)'); c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + i * 0.3, r = (20 + q * Math.min(w, h) * 0.45) * (0.7 + (i % 3) * 0.15); c.globalAlpha = 1 - q; c.fillStyle = ['#ffd23f', '#ffffff', '#ff9fc0', '#9fe3ff'][i % 4]; star4(c, w / 2 + Math.cos(a) * r, h * 0.45 + Math.sin(a) * r * 0.8, (5 + (i % 3) * 2) * k * (1 - q * 0.5)); }
  c.globalAlpha = 1;
}
// The same finish over every game scene, so they read as one polished set: a soft light from above, the
// corners gently darkened, and a thin inner rim like a framed picture.
let padFinishSpr = null;
function padFinish(c, w, h, k) {
  if (!padFinishSpr || padFinishSpr.width !== w || padFinishSpr.height !== h) {
    const o = document.createElement('canvas'); o.width = w; o.height = h; const g2 = o.getContext('2d');
    let g = g2.createLinearGradient(0, 0, 0, h * 0.4); g.addColorStop(0, 'rgba(255,252,235,.16)'); g.addColorStop(1, 'rgba(255,252,235,0)'); g2.fillStyle = g; g2.fillRect(0, 0, w, h * 0.4);
    g = g2.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.hypot(w, h) * 0.62); g.addColorStop(0, 'rgba(40,25,10,0)'); g.addColorStop(1, 'rgba(40,25,10,.22)'); g2.fillStyle = g; g2.fillRect(0, 0, w, h);
    g2.strokeStyle = 'rgba(60,35,15,.16)'; g2.lineWidth = 3 * k; g2.strokeRect(1.5 * k, 1.5 * k, w - 3 * k, h - 3 * k);
    g2.strokeStyle = 'rgba(255,255,255,.25)'; g2.lineWidth = 1 * k; g2.strokeRect(4 * k, 4 * k, w - 8 * k, h - 8 * k);
    padFinishSpr = o;
  }
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.drawImage(padFinishSpr, 0, 0); c.restore();
}
// A game pad is as tall as it can be while the whole card still fits on the screen (no scrolling mid-game).
function fitPad(pad, base) {
  pad.style.height = base + 'px';
  const over = sheet.scrollHeight - sheet.clientHeight;
  if (over > 0) pad.style.height = Math.max(150, base - over - 2) + 'px';
}
// ------------------------------------------------------------------ the action word, flashed and said
// Every game action flashes its verb (it pops up, grows and fades fast), and while you keep at it the verb is
// said over and over, each time to the end of the word, stopping once you stop.
function mgAct(v, beat) {
  if (!mg) return; const t = nowT;
  if ((beat && (!mg.fl || t - mg.fl.t > 0.35)) || !mg.fl || mg.fl.v !== v || t - mg.fl.t > 1.6) { mg.fl = { v, t }; actSub(v, mg.vo && mg.vo.v === v ? mg.vo : null); }
  mg.lastAct = performance.now();
  if (!mg.vo || mg.vo.v !== v) {
    mgStopVoice(); const vo = new Audio('audio/w_' + v + '.mp3'), me = mg; vo.v = v; mg.vo = vo;
    vo.onended = () => { duck = 1; setTimeout(() => { if (mg === me && mg.vo === vo && performance.now() - mg.lastAct < 650) { duck = 0.3; vo.play().catch(() => {}); actSub(v, vo); if (mg.fl) mg.fl = { v, t: nowT }; } }, 90); };
  }
  if (mg.vo.paused) { stopSay(); duck = 0.3; try { mg.vo.currentTime = 0; } catch (e) {} mg.vo.play().catch(() => {}); actSub(v, mg.vo); mg.fl = { v, t }; }
}
// The flash's fade and size over its life q (0..1): in fast, held, then fading; it grows a little throughout.
const flashA = q => q < 0.1 ? q / 0.1 : q < 0.75 ? 1 : 1 - (q - 0.75) / 0.25;
const flashS = q => q < 0.1 ? 0.7 + q / 0.1 * 0.45 : 1.15 + (q - 0.1) * 0.12;
function mgStopVoice() { if (mg && mg.vo) { try { mg.vo.pause(); } catch (e) {} mg.vo.onended = null; mg.vo = null; duck = 1; } }
function mgFlash(c, w, h, k, t) {
  const f = mg && mg.fl; if (!f) return; const q = (t - f.t) / 1.6; if (q > 1 || q < 0) return;
  const W0 = W[f.v].uk, txt = W0[0].toUpperCase() + W0.slice(1) + '!', a = flashA(q), sc = flashS(q);
  c.save(); c.globalAlpha = Math.max(0, a); c.translate(w * 0.5, h * 0.17); c.scale(sc, sc); c.font = `900 ${Math.round(28 * k)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 6 * k; c.strokeStyle = '#4a2c1a'; c.strokeText(txt, 0, 0); c.fillStyle = '#ffd27a'; c.fillText(txt, 0, 0); c.restore();
}
// A ring round the thing to take hold of, pulsing for the first moments of a step, and winking if you press
// beside it.
function mgRing(c, x, y, r, k, t) {
  const m = mg; if (!m) return; const miss = m.miss && t - m.miss < 0.8, fresh = t - (m.pt || t) < 2.5;
  if (!miss && !fresh) return;
  c.strokeStyle = `rgba(255,210,63,${miss ? 0.5 + 0.5 * Math.sin((t - m.miss) * 20) : 0.35 + 0.3 * Math.sin(t * 6)})`; c.lineWidth = 3 * k; c.beginPath(); c.arc(x, y, r, 0, 7); c.stroke();
}
// Taking hold of a tool: within reach of it (pad fractions, with the pad's shape allowed for).
const mgNear = (T, fx, fy, r = 0.17) => T && Math.hypot(T.x + (T.gx || 0) - fx, (T.y + (T.gy || 0) - fy) * 0.66) < r;   // measured at the grip (T.gx, T.gy from the working end), where a tool is held

// ------------------------------------------------------------------ Mr. Bohdan's bees
// дмухай: take the smoker and puff smoke over the swarm; a bee in the smoke grows sleepy and goes home.
// збирай: he lifts out a frame of honeycomb; run the wooden honey dipper over the cells to collect the honey
// into the jar.
const BEE = {
  begin(step) {
    if (step === 'a') {
      mg.bees = Array.from({ length: 8 }, (_, i) => ({ x: 0.45 + Math.random() * 0.35, y: 0.25 + Math.random() * 0.3, ph: i * 1.7, calm: 0, home: 0 }));
      mg.smoke = []; mg.tool = { x: 0.84, y: 0.74 }; mg.puffT = 0; mg.beeStep = 'a';
      mgLine('mg_dmukhai', 'dmukhai', ['Візьми димар і дмухай на бджіл', 'Take the smoker and puff smoke over the bees']);
    } else {
      mg.cells = []; for (let r = 0; r < 4; r++) for (let q = 0; q < 7; q++) mg.cells.push({ r, q, full: 1, t: 0 });
      mg.jar = 0; mg.tool = { x: 0.8, y: 0.68, gx: 0.08, gy: 0.105 }; mg.drips = []; mg.beeStep = 'b';
      mgLine('mg_zbyrai', 'zbyrai', ['Веди ложкою по сотах', 'Run the honey dipper over the honeycomb']);
    }
  },
  press(x, y) { const T = mg.tool; if (mgNear(T, x, y)) { T.held = true; T.ox = T.x - x; T.oy = T.y - y; blip(520, 0.03); } else mg.miss = nowT; },
  move(x, y) { const T = mg.tool; if (!T || !T.held) return; T.x = Math.max(0.05, Math.min(0.95, x + T.ox)); T.y = Math.max(0.12, Math.min(0.92, y + T.oy)); },
  release() { if (mg.tool) mg.tool.held = false; },
  cell(cl, w, h) { const r = Math.min(w * 0.05, h * 0.075), x0 = w * 0.5 - r * 1.75 * 3 - r * 0.43, y0 = h * 0.42; return [x0 + cl.q * r * 1.75 + (cl.r % 2) * r * 0.87, y0 + cl.r * r * 1.5, r]; },
  frame(c, w, h, t, k, dt) {
    // a summer apiary: sky, a meadow, a painted hive on its stand
    let g = c.createLinearGradient(0, 0, 0, h * 0.56); g.addColorStop(0, '#8fd3f4'); g.addColorStop(1, '#e6f6fb'); c.fillStyle = g; c.fillRect(0, 0, w, h * 0.57);
    c.fillStyle = 'rgba(255,240,170,.45)'; circ(c, w * 0.86, h * 0.13, 26 * k); c.fillStyle = '#ffe680'; circ(c, w * 0.86, h * 0.13, 15 * k);   // the sun
    c.fillStyle = 'rgba(255,255,255,.92)'; for (const [cx, cy, sc] of [[0.18, 0.12, 1], [0.58, 0.07, 0.75]]) { const x = ((cx * w + t * 5 * k) % (w * 1.3)) - w * 0.15; ell(c, x, cy * h, 30 * k * sc, 8 * k * sc); ell(c, x + 14 * k * sc, cy * h - 6 * k * sc, 18 * k * sc, 8 * k * sc); }
    c.fillStyle = '#a9d98a'; ell(c, w * 0.2, h * 0.58, w * 0.42, h * 0.1); c.fillStyle = '#98cf76'; ell(c, w * 0.8, h * 0.59, w * 0.45, h * 0.11);   // far hills
    for (const [tx, ts] of [[0.62, 1], [0.7, 0.8], [0.93, 1.1]]) { const x = w * tx, y = h * 0.55, r = 13 * k * ts; c.fillStyle = '#6b4a2b'; c.fillRect(x - 1.5 * k, y - r * 0.4, 3 * k, r * 0.9); c.fillStyle = '#4f9a48'; circ(c, x, y - r * 0.8, r); c.fillStyle = '#62ad55'; circ(c, x - r * 0.3, y - r, r * 0.6); }   // trees
    g = c.createLinearGradient(0, h * 0.56, 0, h); g.addColorStop(0, '#a3d97b'); g.addColorStop(1, '#68ad47'); c.fillStyle = g; c.fillRect(0, h * 0.56, w, h * 0.44);
    c.strokeStyle = '#8a5a2b'; c.lineWidth = 2 * k; for (let i = 0; i < 16; i++) { const x = w * (0.02 + i * 0.065); c.beginPath(); c.moveTo(x, h * 0.6); c.lineTo(x, h * 0.53); c.stroke(); }   // a wattle fence behind the hives
    c.strokeStyle = '#a7743f'; c.lineWidth = 2.6 * k; for (const yy of [0.545, 0.575]) { c.beginPath(); c.moveTo(0, h * yy); c.lineTo(w, h * yy); c.stroke(); }
    for (let i = 0; i < 12; i++) { const x = w * ((i * 0.37 + 0.05) % 1), y = h * (0.62 + ((i * 0.61) % 1) * 0.32); c.fillStyle = ['#ffd23f', '#ffffff', '#ff7aa8', '#9b6bd6'][i % 4]; for (let p = 0; p < 5; p++) circ(c, x + Math.cos(p * 1.26) * 3 * k, y + Math.sin(p * 1.26) * 3 * k, 2 * k); c.fillStyle = '#f2b51d'; circ(c, x, y, 1.6 * k); }
    const T = mg.tool;
    { const bs = h * 0.0036; person(c, w * (mg.beeStep === 'a' ? 0.56 : 0.9), h * 0.98, NPC.bohdan.look, t, false, bs); }   // Mr. Bohdan, watching his bees
    if (mg.beeStep === 'a') {
      const hx = w * 0.26, hy = h * 0.86, hw = w * 0.24, hh = h * 0.36;
      c.fillStyle = '#7a4b22'; c.fillRect(hx - hw * 0.4, hy - 6 * k, 5 * k, 10 * k); c.fillRect(hx + hw * 0.4 - 5 * k, hy - 6 * k, 5 * k, 10 * k);
      c.fillStyle = 'rgba(40,60,20,.22)'; ell(c, hx, hy + 3 * k, hw * 0.62, 6 * k);   // its shadow on the grass
      c.fillStyle = '#5d9ad3'; rr(c, hx - hw / 2, hy - hh, hw, hh * 0.92, 4 * k);
      c.fillStyle = 'rgba(0,0,0,.12)'; c.fillRect(hx + hw * 0.32, hy - hh, hw * 0.18, hh * 0.92);   // the shaded side
      c.strokeStyle = 'rgba(30,50,90,.25)'; c.lineWidth = 1 * k; for (let i = 1; i < 5; i++) { const y = hy - hh + hh * 0.92 * i / 5; c.beginPath(); c.moveTo(hx - hw / 2, y); c.lineTo(hx + hw / 2, y); c.stroke(); }   // the boards
      c.fillStyle = '#ffd23f'; c.fillRect(hx - hw / 2, hy - hh * 0.52, hw, 4 * k);
      for (const dx of [-0.27, 0.27]) { const fx = hx + dx * hw, fy = hy - hh * 0.76; c.fillStyle = '#d43a3a'; for (let p = 0; p < 5; p++) { const a = p * 1.2566 - 1.57; ell(c, fx + Math.cos(a) * 4.5 * k, fy + Math.sin(a) * 4.5 * k, 3 * k, 3 * k); } c.fillStyle = '#ffd23f'; circ(c, fx, fy, 2.4 * k); c.strokeStyle = '#3d8a3a'; c.lineWidth = 1.4 * k; c.beginPath(); c.moveTo(fx, fy + 6 * k); c.quadraticCurveTo(fx + 4 * k, fy + 12 * k, fx, fy + 16 * k); c.stroke(); }   // painted flowers
      c.fillStyle = '#8a3b2b'; poly(c, [[hx - hw * 0.64, hy - hh * 0.9], [hx, hy - hh * 1.28], [hx + hw * 0.64, hy - hh * 0.9]]); c.fillStyle = '#6e2d20'; poly(c, [[hx, hy - hh * 1.28], [hx + hw * 0.64, hy - hh * 0.9], [hx + hw * 0.56, hy - hh * 0.9]]);   // a pitched roof
      c.fillStyle = '#3a2a1a'; rr(c, hx - hw * 0.2, hy - hh * 0.2, hw * 0.4, 5 * k, 2 * k);   // the entrance slit
      c.fillStyle = '#a06a35'; c.fillRect(hx - hw * 0.26, hy - hh * 0.2 + 5 * k, hw * 0.52, 3 * k);   // and its landing board
      // the smoker puffs while you hold it; smoke drifts out from the nozzle and spreads
      if (T.held && (mg.puffT += dt) > 0.16) { mg.puffT = 0; mg.smoke.push({ x: T.x - 0.03, y: T.y - 0.155, vx: -0.12 - Math.random() * 0.08, vy: -0.05 - Math.random() * 0.05, t0: t }); }
      mg.smoke = mg.smoke.filter(s => t - s.t0 < 1.8);
      for (const s of mg.smoke) { const q = (t - s.t0) / 1.8; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.985; s.r = 0.03 + q * 0.11; c.fillStyle = `rgba(214,214,222,${0.75 * (1 - q)})`; circ(c, s.x * w, s.y * h, s.r * w); }
      // the bees: buzzing about angrily until smoked, then sleepy, drifting home to the hive
      let smoking = false;
      for (const b of mg.bees) {
        if (b.home >= 1) continue;
        for (const s of mg.smoke) if (Math.hypot(s.x - b.x, (s.y - b.y) * h / w) < s.r) { b.calm = Math.min(1, b.calm + dt * 1.1); smoking = true; }
        if (b.calm >= 1) { b.x += (0.26 - b.x) * dt * 1.6; b.y += (0.79 - b.y) * dt * 1.6; if (Math.hypot(b.x - 0.26, b.y - 0.79) < 0.03) { b.home = 1; blip(880 + Math.random() * 200, 0.03); } }
        else { const sp = 1 - b.calm * 0.8; b.x += Math.cos(t * 3.1 * sp + b.ph) * dt * 0.25 * sp + (0.6 - b.x) * dt * 0.3; b.y += Math.sin(t * 2.3 * sp + b.ph * 2) * dt * 0.2 * sp + (0.38 - b.y) * dt * 0.3 + b.calm * dt * 0.05; }
        bee(c, b.x * w, b.y * h, 9 * k, t * (1 - b.calm * 0.7) + b.ph);
        if (b.calm < 0.3) { c.fillStyle = '#d43a3a'; c.font = `900 ${Math.round(9 * k)}px system-ui`; c.textAlign = 'center'; c.fillText('!', b.x * w + 7 * k, b.y * h - 7 * k); }
        else if (b.calm < 1) { c.fillStyle = 'rgba(74,44,26,.7)'; c.font = `700 ${Math.round(8 * k)}px system-ui`; c.textAlign = 'center'; c.fillText('z', b.x * w + 8 * k, b.y * h - 8 * k - Math.sin(t * 3) * 2 * k); }
      }
      if (smoking && T.held) mgAct('dmukhai');
      if (mg.phase === 'a' && mg.bees.every(b => b.home >= 1)) { useWord('dmukhai', true); blip(990, 0.1); mgBegin('b'); }
      // the smoker: a tin can with a nozzle on top and leather bellows that squeeze as it puffs
      const sx = T.x * w, sy = T.y * h, sq = T.held ? Math.abs(Math.sin(t * 9)) : 0;
      c.save(); c.translate(sx, sy); c.rotate(-0.25);
      c.fillStyle = '#8a5a2b'; poly(c, [[w * 0.035, -h * 0.02], [w * 0.035 + w * (0.05 - sq * 0.02), -h * 0.06], [w * 0.035 + w * (0.05 - sq * 0.02), h * 0.06], [w * 0.035, h * 0.02]]);
      c.strokeStyle = '#6b4422'; c.lineWidth = 1 * k; for (let i = 1; i < 4; i++) { const xx = w * 0.035 + i * w * (0.0125 - sq * 0.005); c.beginPath(); c.moveTo(xx, -h * 0.05); c.lineTo(xx, h * 0.05); c.stroke(); }
      c.fillStyle = '#b9bec4'; rr(c, -w * 0.035, -h * 0.09, w * 0.07, h * 0.17, 3 * k); c.fillStyle = '#8d939a'; c.fillRect(-w * 0.035, -h * 0.03, w * 0.07, 2 * k);
      c.fillStyle = '#9aa0a7'; poly(c, [[-w * 0.03, -h * 0.09], [w * 0.03, -h * 0.09], [w * 0.005, -h * 0.16], [-w * 0.01, -h * 0.16]]);
      c.restore();
      mgRing(c, sx, sy, 30 * k, k, t);
    } else {
      // the frame of honeycomb, held up out of the hive, and a jar filling below it
      const fx = w * 0.5, fy = h * 0.55;
      c.fillStyle = '#9b6b3c'; c.fillRect(fx - w * 0.36, h * 0.28, w * 0.72, 6 * k); c.fillRect(fx - w * 0.33, h * 0.3, 5 * k, h * 0.5); c.fillRect(fx + w * 0.33 - 5 * k, h * 0.3, 5 * k, h * 0.5); c.fillRect(fx - w * 0.33, h * 0.79, w * 0.66, 5 * k);
      c.fillStyle = '#f3dca0'; c.fillRect(fx - w * 0.32, h * 0.31, w * 0.64, h * 0.48);
      const D = T.held ? [T.x * w - 0.75 * 0.07 * h, T.y * h - 0.66 * 0.07 * h] : null;   // the dipper's grooved head
      let got = false;
      for (const cl of mg.cells) {
        const [x, y, r] = BEE.cell(cl, w, h);
        if (cl.full && D && Math.hypot(D[0] - x, D[1] - y) < r * 1.3) { cl.full = 0; cl.t = t; got = true; mg.drips.push({ x: x / w, y: y / h, t0: t }); blip(640 + cl.q * 40, 0.03); useWord('med', false); }
        const pts = []; for (let q = 0; q < 6; q++) { const a = q * Math.PI / 3 + Math.PI / 6; pts.push([x + Math.cos(a) * r * 0.95, y + Math.sin(a) * r * 0.95]); }
        c.fillStyle = cl.full ? '#f5c542' : '#fff3d6'; poly(c, pts);
        if (cl.full) { c.fillStyle = 'rgba(255,255,255,.45)'; circ(c, x - r * 0.3, y - r * 0.3, r * 0.22); } else { c.fillStyle = 'rgba(242,168,29,.4)'; circ(c, x, y + r * 0.2, r * 0.35); }
        c.strokeStyle = '#d6a23a'; c.lineWidth = 1 * k; c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.closePath(); c.stroke();
      }
      if (got) mgAct('zbyrai');
      // honey drips running down into the jar
      const jx = w * 0.1, jy = h * 0.92, n = mg.cells.length, have = mg.cells.filter(cl => !cl.full).length;
      mg.drips = mg.drips.filter(d => t - d.t0 < 0.8); c.fillStyle = '#f2a81d'; for (const d of mg.drips) { const q = (t - d.t0) / 0.8; ell(c, (d.x + (0.1 - d.x) * q) * w, (d.y + (0.8 - d.y) * q) * h, 2.5 * k, 4 * k); }
      c.fillStyle = 'rgba(255,255,255,.55)'; rr(c, jx - w * 0.06, jy - h * 0.26, w * 0.12, h * 0.26, 6 * k);
      c.fillStyle = '#f2a81d'; const lv = have / n; rr(c, jx - w * 0.055, jy - h * 0.25 * lv - 2 * k, w * 0.11, h * 0.25 * lv, 5 * k);
      c.fillStyle = '#d43a3a'; c.fillRect(jx - w * 0.065, jy - h * 0.3, w * 0.13, h * 0.05); c.fillStyle = '#fffdf5'; for (let i = 0; i < 4; i++) circ(c, jx - w * 0.045 + i * w * 0.03, jy - h * 0.275, 1.6 * k);
      // the wooden honey dipper: a handle and a grooved round head
      const tx = T.x * w, ty = T.y * h;
      c.save(); c.translate(tx, ty); c.rotate(-0.85);
      c.fillStyle = '#9b6b3c'; rr(c, -3 * k, -h * 0.02, 6 * k, h * 0.18, 3 * k);
      c.fillStyle = '#c99463'; ell(c, 0, -h * 0.07, 9 * k, 13 * k); c.strokeStyle = '#8a5a2b'; c.lineWidth = 1.5 * k; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(-9 * k, -h * 0.07 + i * 4 * k); c.lineTo(9 * k, -h * 0.07 + i * 4 * k); c.stroke(); }
      if (have) { c.fillStyle = 'rgba(242,168,29,.85)'; ell(c, 0, -h * 0.07 + 8 * k, 7 * k, 5 * k); }
      c.fillStyle = '#7a4b22'; circ(c, tx + T.gx * w, ty + T.gy * h, 4 * k);   // the end of the handle, where you hold it
      c.restore();
      mgRing(c, tx + T.gx * w, ty + T.gy * h, 26 * k, k, t);
      if (mg.phase === 'b' && have >= n) { useWord('zbyrai', true); mg.phase = 'pause'; blip(990, 0.1); say('p_molodets'); setTimeout(() => { if (mg && mg.id === 'bohdan') mgRoundDone(); }, 900); }
    }
  },
};

// ------------------------------------------------------------------ winter: covering Mr. Bohdan's hives
// почисть: sweep the snow off the hive with the broom.  накрий: carry the straw mat over and wrap the hive.
const HIVEW = {
  begin(step) {
    if (step === 'a') {
      mg.snowB = []; const rs = seeded(7 + mg.round);   // a lumpy cap of snow on the roof, drifts down the sides and on the ledge
      for (let i = 0; i < 30; i++) { const roof = i < 14, x = roof ? 0.33 + (i / 13) * 0.34 : (i % 2 ? 0.34 : 0.66) + (rs() - 0.5) * 0.04, y = roof ? 0.31 + Math.abs(i / 13 - 0.5) * 0.12 + (rs() - 0.5) * 0.03 : 0.42 + ((i - 14) >> 1) * 0.06; mg.snowB.push({ x: i >= 26 ? 0.4 + (i - 26) * 0.07 : x, y: i >= 26 ? 0.49 : y, rx: 0.035 + rs() * 0.025, ry: 0.04 + rs() * 0.03, on: 1 }); }
      mg.flakes = []; mg.covered = 0; mg.tool = { x: 0.76, y: 0.7, gx: 0.124, gy: -0.119 };
      mgLine('mgw_zmety', 'zmety', ['Візьми віник і змети сніг', 'Take the broom and sweep the snow off']);
    } else { mg.tool = { x: 0.84, y: 0.78, mat: true }; mgLine('mgw_nakryi', 'nakryi', ['Неси солому на вулик', 'Carry the straw mat onto the hive']); }
  },
  press(x, y) { const T = mg.tool; if (mgNear(T, x, y, 0.2)) { T.held = true; T.ox = T.x - x; T.oy = T.y - y; blip(520, 0.03); } else mg.miss = nowT; },
  move(x, y) { const T = mg.tool; if (!T || !T.held) return; const px = T.x, py = T.y; T.x = Math.max(0.05, Math.min(0.95, x + T.ox)); T.y = Math.max(0.15, Math.min(0.95, y + T.oy)); T.sp = Math.hypot(T.x - px, T.y - py); },
  release() {
    const T = mg.tool; if (!T) return; T.held = false;
    if (mg.phase === 'b' && T.mat && Math.abs(T.x - 0.5) < 0.2 && T.y < 0.75 && !mg.covered) { mg.covered = nowT; mgAct('nakryi', true); useWord('nakryi', true); blip(760, 0.06); mg.phase = 'pause'; setTimeout(() => { if (mg && mg.id === 'bohdan_w') mgRoundDone(); }, 1400); }
  },
  frame(c, w, h, t, k, dt) {
    snowScene(c, w, h, t, k);
    const hx = w * 0.5, hy = h * 0.86, hw = w * 0.3, hh = h * 0.44;
    { const bs = h * 0.0036, bx2 = w * 0.12, by2 = h * 0.97; person(c, bx2, by2, winterLook(NPC.bohdan.look), t, false, bs); coldBreath(c, bx2 + 8 * bs, by2 - 60 * bs, t, k, 0); }   // Mr. Bohdan, wrapped up warm
    hiveBox(c, hx, hy, hw, hh, k);
    if (mg.snowB && mg.snowB.every(b => !b.on)) for (let i = 0; i < 2; i++) { const px2 = hx + (i ? 6 : -6) * k + Math.sin(t * 3 + i) * 2 * k; bee(c, px2, hy - hh * 0.18 - 2 * k, 6 * k, t + i); }   // two bees peep out, glad of the air
    const T = mg.tool;
    // snow lumps on the hive; the broom sweeps away any it passes over quickly enough
    let swept = false;
    if (mg.snowB) for (const b of mg.snowB) {
      if (!b.on) continue;
      if (T.held && !T.mat && T.sp > 0.004 && Math.hypot(T.x - 0.045 - b.x, (T.y + 0.04 - b.y) * 0.66) < 0.09) { b.on = 0; swept = true; for (let i = 0; i < 4; i++) mg.flakes.push({ x: b.x, y: b.y, vx: (Math.random() - 0.3) * 0.5, vy: -Math.random() * 0.4, t0: t }); }
      c.fillStyle = 'rgba(190,206,228,.8)'; ell(c, b.x * w, b.y * h + h * 0.012, w * b.rx, h * b.ry * 0.8); c.fillStyle = '#ffffff'; ell(c, b.x * w, b.y * h, w * b.rx, h * b.ry); c.fillStyle = 'rgba(255,255,255,.8)'; ell(c, (b.x - b.rx * 0.3) * w, (b.y - b.ry * 0.3) * h, w * b.rx * 0.4, h * b.ry * 0.3);
    }
    if (swept) { mgAct('zmety'); blip(500 + Math.random() * 200, 0.02); }
    mg.flakes = (mg.flakes || []).filter(f => t - f.t0 < 0.8); c.fillStyle = 'rgba(255,255,255,.95)'; for (const f of mg.flakes) { f.vy += dt * 1.2; f.x += f.vx * dt; f.y += f.vy * dt; circ(c, f.x * w, f.y * h, 2.5 * k); }
    if (mg.phase === 'a' && mg.snowB && mg.snowB.every(b => !b.on)) { useWord('zmety', true); blip(990, 0.1); mgBegin('b'); }
    // the straw mat, wrapped round the hive once it's laid on, tied with a red cord
    if (mg.covered) {
      const q = Math.min(1, (t - mg.covered) / 0.6);
      c.fillStyle = '#e8c35a'; rr(c, hx - hw * 0.68, hy - hh * (0.2 + 1.0 * q), hw * 1.36, hh * (0.2 + 0.98 * q), 12 * k);
      c.strokeStyle = '#c99a3a'; c.lineWidth = 1.5 * k; for (let i = 0; i < 16; i++) { c.beginPath(); c.moveTo(hx - hw * 0.62 + i * hw * 0.082, hy - hh * (0.18 + 0.98 * q)); c.lineTo(hx - hw * 0.6 + i * hw * 0.082, hy - hh * 0.05); c.stroke(); }
      if (q >= 1) { c.strokeStyle = '#d43a3a'; c.lineWidth = 3 * k; c.beginPath(); c.moveTo(hx - hw * 0.68, hy - hh * 0.55); c.quadraticCurveTo(hx, hy - hh * 0.5, hx + hw * 0.68, hy - hh * 0.55); c.stroke(); c.fillStyle = '#d43a3a'; circ(c, hx + hw * 0.1, hy - hh * 0.52, 4 * k); }
    }
    if (T.mat && !mg.covered) {   // the mat waiting to be carried, rolled at the ends
      const mx = T.x * w, my = T.y * h; c.fillStyle = '#e8c35a'; rr(c, mx - w * 0.13, my - h * 0.07, w * 0.26, h * 0.14, 6 * k);
      c.strokeStyle = '#c99a3a'; c.lineWidth = 1.5 * k; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(mx - w * 0.12 + i * w * 0.03, my - h * 0.065); c.lineTo(mx - w * 0.12 + i * w * 0.03, my + h * 0.065); c.stroke(); }
      c.fillStyle = '#d9b04a'; for (const sg of [-1, 1]) ell(c, mx + sg * w * 0.13, my, w * 0.02, h * 0.07);
      if (T.held && Math.abs(T.x - 0.5) < 0.2 && T.y < 0.75) { c.strokeStyle = 'rgba(255,210,63,.8)'; c.lineWidth = 3 * k; c.setLineDash([6 * k, 5 * k]); c.strokeRect(hx - hw * 0.66, hy - hh * 1.18, hw * 1.32, hh * 1.12); c.setLineDash([]); }
      mgRing(c, mx, my, 34 * k, k, t);
    } else if (!T.mat) {
      // the besom: a long handle and a bunch of twigs, swishing as you sweep
      const bx = T.x * w, by = T.y * h, sw = T.held ? Math.sin(t * 14) * 0.12 : 0;
      c.save(); c.translate(bx, by); c.rotate(1.0 + sw);
      c.fillStyle = '#9b6b3c'; rr(c, -3 * k, -h * 0.22, 6 * k, h * 0.22, 3 * k);
      c.fillStyle = '#c99a3a'; poly(c, [[-5 * k, 0], [5 * k, 0], [15 * k, h * 0.14], [-15 * k, h * 0.14]]);
      c.strokeStyle = '#a87a2f'; c.lineWidth = 1 * k; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 1.2 * k, 0); c.lineTo(i * 4.5 * k, h * 0.14); c.stroke(); }
      c.fillStyle = '#d43a3a'; c.fillRect(-6 * k, h * 0.01, 12 * k, 4 * k);
      c.fillStyle = '#7a4b22'; circ(c, 0, -h * 0.22, 4 * k);   // the top of the handle, where you hold it
      c.restore();
      mgRing(c, bx + T.gx * w, by + T.gy * h, 28 * k, k, t);
    }
  },
};
// A snowy yard: pale sky, a line of white hills, snow falling.
function snowScene(c, w, h, t, k) {
  // a still winter day: a pale sky warming at the horizon, the village under snow on the far hill with smoke
  // rising from the chimneys, snowy firs in tiers, a half-buried wattle fence, and soft blue shadows in the snow
  const H = h * 0.46;
  let g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#a9c4e4'); g.addColorStop(0.75, '#e3ecf6'); g.addColorStop(1, '#f7efe6'); c.fillStyle = g; c.fillRect(0, 0, w, H + 2);
  g = c.createRadialGradient(w * 0.2, h * 0.12, 0, w * 0.2, h * 0.12, 50 * k); g.addColorStop(0, 'rgba(255,250,230,.85)'); g.addColorStop(1, 'rgba(255,250,230,0)'); c.fillStyle = g; c.fillRect(w * 0.2 - 50 * k, h * 0.12 - 50 * k, 100 * k, 100 * k);
  c.fillStyle = '#fffbea'; circ(c, w * 0.2, h * 0.12, 10 * k);   // a low winter sun
  c.fillStyle = '#dfe8f3'; ell(c, w * 0.66, H + 3 * k, w * 0.6, h * 0.13);   // the far hill
  { const vx = w * 0.6, vy = H - h * 0.07;   // the village under snow, smoke going straight up in the still air
    for (const [dx, sc] of [[-0.14, 0.8], [-0.06, 1], [0.08, 0.9], [0.16, 0.75]]) { const x = vx + dx * w, y = vy + h * 0.02, cw = 12 * k * sc;
      c.fillStyle = '#efe6d6'; c.fillRect(x - cw / 2, y - cw * 0.6, cw, cw * 0.6); c.fillStyle = '#ffd98a'; c.fillRect(x - cw * 0.15, y - cw * 0.42, cw * 0.3, cw * 0.25);
      c.fillStyle = '#ffffff'; poly(c, [[x - cw * 0.72, y - cw * 0.55], [x, y - cw * 1.1], [x + cw * 0.72, y - cw * 0.55]]);
      for (let i = 0; i < 4; i++) { const q = ((t * 0.12 + i * 0.25 + dx) % 1); c.fillStyle = `rgba(235,238,245,${0.6 * (1 - q)})`; circ(c, x + cw * 0.3 + Math.sin(q * 5 + dx * 9) * 2 * k, y - cw * 1.1 - q * 26 * k, (2 + q * 5) * k); } }
    const cx = vx + w * 0.02, cy = vy + h * 0.015; c.fillStyle = '#f4f1ea'; c.fillRect(cx - 7 * k, cy - 13 * k, 14 * k, 13 * k); c.fillRect(cx - 3 * k, cy - 20 * k, 6 * k, 7 * k);
    c.fillStyle = '#7fa8d8'; ell(c, cx, cy - 22 * k, 4 * k, 4 * k); c.fillStyle = '#ffffff'; ell(c, cx, cy - 24.5 * k, 3 * k, 1.5 * k); c.fillStyle = '#f2c230'; c.fillRect(cx - 0.6 * k, cy - 31 * k, 1.2 * k, 6 * k); c.fillRect(cx - 2 * k, cy - 29 * k, 4 * k, 1.1 * k); }
  c.fillStyle = '#eef3fa'; ell(c, w * 0.22, H + 6 * k, w * 0.5, h * 0.1); c.fillStyle = '#e8eff8'; ell(c, w * 0.92, H + 8 * k, w * 0.35, h * 0.085);   // the nearer hills
  const fir = (x, y, sc) => { const r = 14 * k * sc; c.fillStyle = '#6b4a2b'; c.fillRect(x - 1.5 * k * sc, y - r * 0.4, 3 * k * sc, r * 0.5);
    for (let i = 0; i < 3; i++) { const yy = y - r * 0.35 - i * r * 0.55, ww = r * (0.95 - i * 0.22); c.fillStyle = '#3f6e52'; poly(c, [[x - ww, yy], [x, yy - r * 0.8], [x + ww, yy]]); c.fillStyle = '#ffffff'; poly(c, [[x - ww * 0.95, yy], [x - ww * 0.3, yy - r * 0.18], [x, yy - r * 0.05], [x + ww * 0.35, yy - r * 0.2], [x + ww * 0.95, yy]]); c.fillStyle = '#ffffff'; poly(c, [[x - ww * 0.25, yy - r * 0.6], [x, yy - r * 0.8], [x + ww * 0.25, yy - r * 0.6]]); } };
  for (const [fx, sc] of [[0.05, 1], [0.13, 0.75], [0.36, 0.85], [0.86, 0.95], [0.96, 0.7]]) fir(w * fx, H + 4 * k, sc);
  g = c.createLinearGradient(0, H, 0, h); g.addColorStop(0, '#f6f9fd'); g.addColorStop(1, '#dae5f2'); c.fillStyle = g; c.fillRect(0, H, w, h - H);
  c.fillStyle = 'rgba(160,185,220,.18)'; for (let i = 0; i < 5; i++) { const x = w * ((i * 0.31 + 0.1) % 1), y = H + (h - H) * (0.25 + ((i * 0.53) % 1) * 0.6); ell(c, x, y, w * 0.18, h * 0.025); }   // soft blue dips in the snow
  c.strokeStyle = '#8a6a48'; c.lineWidth = 2 * k; for (let i = 0; i < 15; i++) { const x = w * (0.03 + i * 0.07); c.beginPath(); c.moveTo(x, H + h * 0.03); c.lineTo(x, H - h * 0.035); c.stroke(); }   // the fence, half-buried
  c.strokeStyle = '#9c7a52'; c.lineWidth = 2.4 * k; c.beginPath(); c.moveTo(0, H - h * 0.012); c.lineTo(w, H - h * 0.012); c.stroke();
  c.fillStyle = '#ffffff'; for (let i = 0; i < 15; i++) ell(c, w * (0.03 + i * 0.07), H - h * 0.035, 2.4 * k, 1.4 * k);   // snow caps on the posts
  c.fillStyle = '#f8fbff'; ell(c, w * 0.5, H + h * 0.035, w * 0.7, h * 0.03);   // a drift along the fence
  drawSnow(c, w, h, t, k, 0.6);
}

// ------------------------------------------------------------------ winter: Andriiko's snowman
// качай: take the snowball and roll it back and forth across the snow until it's big enough (it leaves a
// track). постав: lift it onto the snowman. Three balls, then the face, the carrot nose and the hat go on.
const SNOWMAN = {
  sizes: [1, 0.72, 0.5],
  begin(step) {
    mg.balls = mg.balls || [];
    if (step === 'a') { mg.cur = { x: 0.24, y: 0.88, r: 0.25, rot: 0 }; mg.tool = mg.cur; mg.track = []; mgLine('mgw_kachai', 'kachai', ['Візьми сніжку й качай по снігу', 'Take the snowball and roll it back and forth']); }
    else { mg.tool = mg.cur; mgLine('mgw_postav', 'postav', ['Підніми й постав на сніговика', 'Lift it up onto the snowman']); }
    if (!mg.dog) mg.dog = { x: 0.74, y: 0.92, face: -1, ph: 0, sp: 0, pose: 'sit', z: 0 };
  },
  R0: h => h * 0.16,
  press(x, y) { const T = mg.tool; if (T && Math.hypot(T.x - x, (T.y - y) * 0.66) < 0.2) { T.held = true; T.ox = T.x - x; T.oy = T.y - y; blip(520, 0.03); } else mg.miss = nowT; },
  move(x, y) {
    const T = mg.tool; if (!T || !T.held) return;
    if (mg.phase === 'a') {   // rolling: along the ground only; it grows with the distance rolled
      const nx = Math.max(0.08, Math.min(0.36, x + T.ox)), d = Math.abs(nx - T.x); T.x = nx; T.rot += d * 30;
      const goal = SNOWMAN.sizes[mg.balls.length]; T.r = Math.min(goal, T.r + d * 0.55);
      if (d > 0.002) { mgAct('kachai'); mg.track.push(T.x); (mg.spray = mg.spray || []).push({ x: T.x - Math.sign(nx - T.x || 1) * T.r * 0.12, y: 0.9, vx: -(nx - T.x) * 30 + (Math.random() - 0.5) * 0.2, vy: -0.25 - Math.random() * 0.3, t0: nowT }); if (mg.track.length > 80) mg.track.shift(); }
      if (T.r >= goal) { T.held = false; useWord('kachai', true); blip(880, 0.06); if (!mg.balls.length) mg.phase = 'roll'; else mgBegin('b'); }   // the bottom ball rolls on into place; the others are lifted up
    } else if (mg.phase === 'b') { T.x = Math.max(0.08, Math.min(0.92, x + T.ox)); T.y = Math.max(0.15, Math.min(0.9, y + T.oy)); }
  },
  release() {
    const T = mg.tool; if (!T) return; T.held = false;
    if (mg.phase !== 'b') return;
    const top = SNOWMAN.topY();
    if (Math.abs(T.x - 0.5) < 0.12 && Math.abs(T.y - top) < 0.15) SNOWMAN.place(T, 'postav');
    else { T.y = 0.88; blip(300, 0.03); }   // not on the snowman: it drops back down
  },
  place(T, v) {
    {
      mg.balls.push(T.r); mg.cur = null; mg.tool = null; mg.placeT = nowT; mgAct(v, true); useWord(v, true); blip(700, 0.06);
      mg.phase = 'pause'; if (mg.balls.length >= 3) { mg.doneT = nowT; say('p_chudovo'); }
      setTimeout(() => { if (mg && mg.id === 'andriiko_w') mgRoundDone(); }, mg.balls.length >= 3 ? 2200 : 700);
    }
  },
  topY() { let y = 0.92; for (const r of mg.balls) y -= r * 0.16 * 1.72; return y; },   // where the next ball sits (its bottom), in pad fractions
  frame(c, w, h, t, k, dt) {
    snowScene(c, w, h, t, k);
    const R0 = SNOWMAN.R0(h), sx = w * 0.5;
    if (mg.phase === 'roll' && mg.cur) { const T = mg.cur, dx = 0.5 - T.x, st = Math.sign(dx) * Math.min(Math.abs(dx), dt * 0.32); T.x += st; T.rot += Math.abs(st) * 30; if (Math.abs(st) > 0) { mg.track.push(T.x); if (mg.track.length > 80) mg.track.shift(); } if (Math.abs(dx) < 0.003) SNOWMAN.place(T, 'kachai'); }
    // the track the rolling ball has pressed into the snow
    mg.spray = (mg.spray || []).filter(p => t - p.t0 < 0.6).slice(-40); c.fillStyle = 'rgba(255,255,255,.95)'; for (const p of mg.spray) { p.vy += dt * 1.4; p.x += p.vx * dt; p.y += p.vy * dt; circ(c, p.x * w, p.y * h, 2.4 * k * (1 - (t - p.t0) / 0.6)); }   // snow kicked up by the rolling ball
    c.fillStyle = 'rgba(170,190,215,.35)'; for (const x of mg.track || []) ell(c, x * w, h * 0.92, 5 * k, 2.5 * k);
    person(c, w * 0.9, h * 0.97, NPC.andriiko.look, t, false, 1.2 * k);
    // the snowman so far
    let y = h * 0.92;
    mg.balls.forEach((r0, i) => { const r = R0 * r0, bounce = mg.placeT && i === mg.balls.length - 1 ? Math.max(0, 1 - (t - mg.placeT) / 0.4) * Math.sin((t - mg.placeT) * 25) * 4 * k : 0; c.fillStyle = 'rgba(0,0,0,.08)'; if (!i) ell(c, sx, y, r * 1.1, r * 0.2); c.fillStyle = '#ffffff'; circ(c, sx, y - r + bounce, r); c.strokeStyle = '#c3d2e4'; c.lineWidth = 2 * k; c.beginPath(); c.arc(sx, y - r + bounce, r, 0.2, Math.PI - 0.2); c.stroke(); c.fillStyle = '#e3ebf5'; circ(c, sx + r * 0.35, y - r * 1.35 + bounce, r * 0.18); y -= r * 1.72; });
    // where the next ball goes
    if (mg.cur && (mg.phase === 'a' || mg.phase === 'roll' || mg.phase === 'b')) { const r = R0 * (mg.phase === 'a' ? SNOWMAN.sizes[mg.balls.length] : mg.cur.r), on = mg.phase === 'b' && mg.tool && mg.tool.held; c.strokeStyle = `rgba(255,210,63,${on ? 0.85 : 0.45 + 0.2 * Math.sin(t * 4)})`; c.lineWidth = 3 * k; c.setLineDash([6 * k, 5 * k]); c.beginPath(); c.arc(sx, y - r, r, 0, 7); c.stroke(); c.setLineDash([]); }
    // the finished snowman: coal eyes and buttons, a carrot nose, twig arms, a bucket for a hat
    if (mg.balls.length >= 3 && mg.doneT) {
      const q = Math.min(1, (t - mg.doneT) / 0.8), r2 = R0 * mg.balls[2], hy = y + r2 * 0.72 + r2 * 0.0, hcy = h * 0.92 - R0 * (mg.balls[0] * 1.72 + mg.balls[1] * 1.72) - r2;
      c.globalAlpha = q;
      c.fillStyle = '#2a2a2a'; circ(c, sx - r2 * 0.35, hcy - r2 * 0.2, r2 * 0.1); circ(c, sx + r2 * 0.35, hcy - r2 * 0.2, r2 * 0.1);
      for (let i = 0; i < 3; i++) circ(c, sx, h * 0.92 - R0 * mg.balls[0] * 1.72 - R0 * mg.balls[1] * (0.4 + i * 0.4), R0 * 0.06);
      c.fillStyle = '#ff8a1f'; poly(c, [[sx, hcy], [sx + r2 * 0.75, hcy + r2 * 0.12], [sx, hcy + r2 * 0.22]]);
      c.strokeStyle = '#6b4422'; c.lineWidth = 3 * k; const my = h * 0.92 - R0 * mg.balls[0] * 1.72 - R0 * mg.balls[1] * 0.9;
      c.beginPath(); c.moveTo(sx - R0 * mg.balls[1] * 0.9, my); c.lineTo(sx - R0 * 1.4, my - R0 * 0.45); c.moveTo(sx - R0 * 1.2, my - R0 * 0.35); c.lineTo(sx - R0 * 1.35, my - R0 * 0.1); c.moveTo(sx + R0 * mg.balls[1] * 0.9, my); c.lineTo(sx + R0 * 1.4, my - R0 * 0.5 - Math.sin(t * 6) * R0 * 0.1); c.stroke();   // one arm waving
      c.fillStyle = '#5d9ad3'; poly(c, [[sx - r2 * 0.55, hcy - r2 * 0.75], [sx + r2 * 0.55, hcy - r2 * 0.75], [sx + r2 * 0.42, hcy - r2 * 1.45], [sx - r2 * 0.42, hcy - r2 * 1.45]]); c.fillStyle = '#4a86b8'; c.fillRect(sx - r2 * 0.58, hcy - r2 * 0.82, r2 * 1.16, r2 * 0.12);
      c.globalAlpha = 1;
      for (let i = 0; i < 8; i++) { const a = (t - mg.doneT) * 2 + i * 0.8, rr2 = R0 * (1.2 + (t - mg.doneT) * 0.8); drawIcon(c, '✨', sx + Math.cos(a) * rr2, h * 0.5 + Math.sin(a) * rr2 * 0.5, 14 * k * (1 - q * 0.3)); }
    }
    // the ball you're rolling or carrying
    const T = mg.cur;
    if (T) { const r = R0 * T.r, bx = T.x * w, by = T.y * h - r; c.fillStyle = 'rgba(0,0,0,.1)'; ell(c, bx, T.y * h, r * 1.05, r * 0.2); c.save(); c.translate(bx, by); c.rotate(T.rot); c.fillStyle = '#ffffff'; circ(c, 0, 0, r); c.strokeStyle = '#c3d2e4'; c.lineWidth = 2 * k; c.beginPath(); c.arc(0, 0, r, 0, 7); c.stroke(); c.fillStyle = '#dbe5f2'; circ(c, r * 0.4, -r * 0.2, r * 0.16); circ(c, -r * 0.3, r * 0.35, r * 0.12); circ(c, -r * 0.1, -r * 0.5, r * 0.08); c.restore(); mgRing(c, bx, by, r + 10 * k, k, t); }
    // Brovko bounding about in the snow, very pleased
    const d = mg.dog; d.ph += dt * 8; const happy = mg.doneT || (mg.cur && mg.cur.held);
    d.pose = happy ? 'stand' : 'sit'; d.sp = happy ? 0.6 : 0; d.z = happy ? Math.abs(Math.sin(t * 6)) * 10 * k : 0;
    dogDraw(c, d.x * w, d.y * h - d.z, 1.05 * k, d, t, false);
  },
};

// ------------------------------------------------------------------ winter: fishing through the ice with Taras
// свердли: take the crank of the ice auger and wind it round; it bores down through the ice, chips flying,
// until the hole opens. Then the line goes down with a worm on the hook. Wait while the float bobs and
// twitches; when it's pulled under, тягни: pull the line up and out comes a fish onto the ice.
const ICE = {
  // The pond seen in a cutaway: the snowy ice on top (SURF), the slab of ice, and the water underneath where
  // you can watch the lure and the fish.
  SURF: 0.38, BOT: 0.52, HX: 0.5, GX: 0.76, GY: 0.33,   // GX/GY: where her hands hold the rod's grip
  begin(step) {
    if (step === 'a') {
      mg.drill = 0; mg.ang = null; mg.chips = []; mg.hole = 0; mg.fishy = null; mg.fish = null; mg.jig = 0; mg.lure = 0.66;
      mg.tool = { x: ICE.HX + 0.13, y: 0.16 }; mg.rod = null;
      mgLine('mgw_sverdly', 'sverdly', ['Візьми ручку й крути по колу', 'Take the handle and wind it round']);
    } else mgLine('mg_tiahny', 'tiahny', ['Тягни вудку вгору!', 'Pull the rod up, now!']);
  },
  press(x, y) {
    if (mg.phase === 'a' && mgNear(mg.tool, x, y, 0.2)) { mg.tool.held = true; mg.ang = null; blip(520, 0.03); return; }
    const R = mg.rod;
    if (R && (mgNear({ x: ICE.GX, y: ICE.GY }, x, y, 0.3) || x > 0.55)) { R.held = true; R.ox = 0; R.oy = R.y - y; R.hist = [[performance.now(), R.y]]; blip(520, 0.03); return; }
    mg.miss = nowT;
  },
  move(x, y) {
    if (mg.phase === 'a' && mg.tool.held) {   // winding: the crank goes round the top of the auger with your finger
      const cx = ICE.HX, cy = 0.16, a = Math.atan2((y - cy) / 0.06, (x - cx) / 0.13);
      mg.tool.x = cx + Math.cos(a) * 0.13; mg.tool.y = cy + Math.sin(a) * 0.06;
      if (mg.ang != null) { let da = a - mg.ang; if (da > Math.PI) da -= Math.PI * 2; if (da < -Math.PI) da += Math.PI * 2;
        mg.drill = Math.min(1, mg.drill + Math.abs(da) / (Math.PI * 2 * 3));
        if (Math.abs(da) > 0.01) { mgAct('sverdly'); if (Math.random() < 0.6) mg.chips.push({ x: ICE.HX + (Math.random() - 0.5) * 0.05, y: ICE.SURF, vx: (Math.random() - 0.5) * 0.7, vy: -0.3 - Math.random() * 0.5, t0: nowT }); } }
      mg.ang = a;
      if (mg.drill >= 1) { mg.tool.held = false; mg.hole = 1; mg.holeT = nowT; useWord('sverdly', true); blip(880, 0.08); mg.phase = 'wait';
        mg.rod = { x: ICE.GX, y: 0.24 }; mg.fishy = { st: 'far', x: Math.random() < 0.5 ? 0.06 : 0.94, y: 0.78, t0: nowT, vx: 0 };
        setTimeout(() => { if (mg && mg.id === 'taras_w' && mg.phase === 'wait') mgLine('mg_wait', null, ['Візьми вудку й поводи вгору-вниз', 'Take the rod and jig it gently up and down']); }, 700); }
      return;
    }
    const R = mg.rod; if (!R || !R.held) return;
    const py = R.y; R.y = Math.max(0.1, Math.min(0.36, y + R.oy));
    mg.jig = Math.min(1.5, mg.jig + Math.abs(R.y - py) * 6);
    const tnow = performance.now(); R.hist.push([tnow, R.y]); while (R.hist.length && tnow - R.hist[0][0] > 350) R.hist.shift();
    const rise = R.hist.length ? R.hist[0][1] - R.y : 0;   // how far the rod came up in the last third of a second
    if (rise > 0.09) { const F = mg.fishy; R.hist = [[tnow, R.y]];
      if (F && F.st === 'bite') ICE.catch();
      else if (F && (F.st === 'nibble' || F.st === 'come')) { F.st = 'flee'; F.t0 = nowT; mgLine('mg_wait', null, ['Ще рано! Чекай', 'Too soon! Wait for the tip to bend']); blip(300, 0.05); }
    }
  },
  release() { if (mg.tool) mg.tool.held = false; if (mg.rod) mg.rod.held = false; },
  catch() {
    useWord('tiahny', true); mgAct('tiahny', true); blip(990, 0.1);
    mg.fish = { t0: nowT, x: ICE.HX, y: mg.lure }; mg.fishy = null; mg.phase = 'catch';
    setTimeout(() => { if (mg && mg.phase === 'catch') mgRoundDone(); }, 2000);
  },
  frame(c, w, h, t, k, dt) {
    const S0 = ICE.SURF * h, B0 = ICE.BOT * h, hx = ICE.HX * w;
    // sky and the far snowy bank
    let g = c.createLinearGradient(0, 0, 0, S0); g.addColorStop(0, '#cfdcee'); g.addColorStop(1, '#f2f6fb'); c.fillStyle = g; c.fillRect(0, 0, w, S0);
    c.fillStyle = '#e6edf7'; ell(c, w * 0.2, S0 - h * 0.04, w * 0.35, h * 0.06); ell(c, w * 0.85, S0 - h * 0.035, w * 0.3, h * 0.05);
    { const sg = c.createRadialGradient(w * 0.18, h * 0.1, 0, w * 0.18, h * 0.1, 44 * k); sg.addColorStop(0, 'rgba(255,250,230,.85)'); sg.addColorStop(1, 'rgba(255,250,230,0)'); c.fillStyle = sg; c.fillRect(w * 0.18 - 44 * k, h * 0.1 - 44 * k, 88 * k, 88 * k); c.fillStyle = '#fffbea'; circ(c, w * 0.18, h * 0.1, 9 * k); }
    padVillage(c, w * 0.6, S0 - h * 0.06, k, w, t, true);
    for (const [fx, sc] of [[0.05, 1], [0.13, 0.75], [0.34, 0.85], [0.86, 0.95], [0.95, 0.7]]) padFir(c, w * fx, S0 - h * 0.035, sc, k, true);
    // the water under the ice, darker deeper down, with light coming through the hole
    g = c.createLinearGradient(0, B0, 0, h); g.addColorStop(0, '#2f6a99'); g.addColorStop(1, '#173a5c'); c.fillStyle = g; c.fillRect(0, B0, w, h - B0);
    if (mg.hole) { const lg = c.createLinearGradient(0, B0, 0, h); lg.addColorStop(0, 'rgba(190,225,255,.35)'); lg.addColorStop(1, 'rgba(190,225,255,0)'); c.fillStyle = lg; poly(c, [[hx - w * 0.04, B0], [hx + w * 0.04, B0], [hx + w * 0.14, h], [hx - w * 0.14, h]]); }
    c.fillStyle = 'rgba(70,120,70,.6)'; for (let i = 0; i < 7; i++) { const x = w * (0.05 + i * 0.15), sw = Math.sin(t * 1.2 + i) * 4 * k; c.beginPath(); c.moveTo(x, h); c.quadraticCurveTo(x + sw, h * 0.9, x + sw * 1.6, h * (0.8 + (i % 3) * 0.04)); c.lineTo(x + 4 * k + sw * 1.6, h * (0.8 + (i % 3) * 0.04)); c.quadraticCurveTo(x + 4 * k + sw, h * 0.9, x + 6 * k, h); c.fill(); }   // waterweed
    c.fillStyle = 'rgba(255,255,255,.35)'; for (let i = 0; i < 8; i++) { const q = (t * 0.15 + i / 8) % 1; circ(c, w * ((i * 0.13 + 0.07) % 1), h - q * (h - B0), (1 + i % 2) * k); }
    // the slab of ice in section, with snow on top
    g = c.createLinearGradient(0, S0, 0, B0); g.addColorStop(0, '#e9f5fd'); g.addColorStop(1, '#a9d2ee'); c.fillStyle = g; c.fillRect(0, S0, w, B0 - S0);
    c.fillStyle = '#ffffff'; c.fillRect(0, S0 - 3 * k, w, 4 * k); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1 * k; for (let i = 0; i < 6; i++) { c.beginPath(); c.moveTo(w * (0.06 + i * 0.17), S0 + 4 * k); c.lineTo(w * (0.1 + i * 0.17), B0 - 3 * k); c.stroke(); }
    // the hole bored through the slab (part-way while drilling)
    const cut = mg.hole ? 1 : mg.drill;
    if (cut > 0) { c.fillStyle = mg.hole ? '#2f6a99' : '#7fb3d8'; c.fillRect(hx - w * 0.035, S0 - 2 * k, w * 0.07, (B0 - S0) * cut + 2 * k); c.fillStyle = '#ffffff'; ell(c, hx, S0, w * 0.06, h * 0.012); c.fillStyle = mg.hole ? '#1f4f78' : '#a9d2ee'; ell(c, hx, S0, w * 0.035, h * 0.008); }
    if (mg.hole && t - mg.holeT < 0.8) { const q = (t - mg.holeT) / 0.8; c.fillStyle = `rgba(255,255,255,${0.8 * (1 - q)})`; for (let i = 0; i < 8; i++) circ(c, hx + Math.sin(i * 2.3) * w * 0.03, B0 + h * 0.05 - q * h * 0.1 - i * 3 * k, (2 + i % 3) * k); }
    // Taras's box and the bucket on the ice
    c.fillStyle = '#8a5a2b'; rr(c, w * 0.05, S0 - h * 0.13, w * 0.13, h * 0.13, 4 * k); c.fillStyle = '#a06a35'; c.fillRect(w * 0.05, S0 - h * 0.13, w * 0.13, 4 * k);
    c.fillStyle = '#8a9099'; poly(c, [[w * 0.2, S0 - h * 0.11], [w * 0.31, S0 - h * 0.11], [w * 0.295, S0], [w * 0.215, S0]]); c.fillStyle = '#5b6470'; ell(c, w * 0.255, S0 - h * 0.11, w * 0.055, h * 0.015);
    c.fillStyle = '#c9d8b8'; for (let i = 0; i < Math.min(4, mg.score); i++) ell(c, w * (0.235 + i * 0.012), S0 - h * (0.115 + (i % 2) * 0.01), 6 * k, 2.5 * k);
    mg.chips = (mg.chips || []).filter(p => t - p.t0 < 0.7); c.fillStyle = '#ffffff'; for (const p of mg.chips) { p.vy += dt * 1.6; p.x += p.vx * dt * 0.4; p.y += p.vy * dt * 0.4; c.fillRect(p.x * w, p.y * h, 3 * k, 2 * k); }
    if (!mg.hole || t - mg.holeT < 0.7) {
      // the ice auger: the spiral bit boring down into the slab, the shaft, the crank on top
      const lift = mg.hole ? (t - mg.holeT) / 0.7 * h * 0.5 : 0, tip = S0 + (B0 - S0) * mg.drill - lift, top = h * 0.16 - lift;
      c.strokeStyle = '#8d939a'; c.lineWidth = 4 * k; c.beginPath(); c.moveTo(hx, top); c.lineTo(hx, tip - h * 0.08); c.stroke();
      c.strokeStyle = '#c9ced4'; c.lineWidth = 3 * k; c.beginPath(); for (let i = 0; i <= 18; i++) { const yy = tip - h * 0.1 + i * h * 0.0055, xx = hx + Math.sin(i * 1.0 + mg.drill * 50) * 6 * k; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke();
      const T = mg.tool, cx2 = T.x * w, cy2 = T.y * h - lift;
      c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1.5 * k; c.setLineDash([4 * k, 4 * k]); c.beginPath(); c.ellipse(hx, h * 0.16 - lift, w * 0.13, h * 0.06, 0, 0, 7); c.stroke(); c.setLineDash([]);
      c.strokeStyle = '#5b6470'; c.lineWidth = 4 * k; c.beginPath(); c.moveTo(hx, top); c.lineTo(cx2, cy2); c.stroke();
      c.fillStyle = '#d43a3a'; rr(c, cx2 - 6 * k, cy2 - 14 * k, 12 * k, 20 * k, 5 * k);
      if (!mg.hole) mgRing(c, cx2, cy2, 24 * k, k, t);
    }
    if (mg.hole && mg.rod) {
      const R = mg.rod; mg.jig *= Math.exp(-dt * 1.5);
      // the fish: far off, coming to a dancing lure, nibbling, biting, or darting off if you pull too soon
      const F = mg.fishy, lx = hx, ly = mg.lure * h;
      if (F) {
        if (F.st === 'far' && (mg.jig > 0.25 || t - F.t0 > 5)) { F.st = 'come'; F.t0 = t; }
        if (F.st === 'come') { const sp = 0.06 + Math.min(1, mg.jig) * 0.12, dx = ICE.HX - F.x, dy = mg.lure + 0.03 - F.y, d = Math.hypot(dx, dy); if (d < 0.04) { F.st = 'nibble'; F.t0 = t; F.biteAt = t + 1 + Math.random(); } else { F.x += dx / d * sp * dt; F.y += dy / d * sp * dt; } }
        else if (F.st === 'nibble') { F.x = ICE.HX + Math.sin(t * 9) * 0.01; F.y = mg.lure + 0.03; if (t > F.biteAt) { F.st = 'bite'; F.t0 = t; mgBegin('b'); mg.phase = 'wait'; blip(420, 0.08); } }
        else if (F.st === 'bite') { F.x = ICE.HX; F.y = mg.lure + 0.02; if (t - F.t0 > 1.7) { F.st = 'flee'; F.t0 = t; mgLine('mg_wait', null, ['Запізно! Чекай наступну', 'Too late! Wait for the next one']); } }
        else if (F.st === 'flee') { F.x += (F.x < 0.5 ? -1 : 1) * 0.35 * dt; F.y += 0.05 * dt; if (t - F.t0 > 1.6) { F.st = 'far'; F.t0 = t; F.x = Math.random() < 0.5 ? 0.04 : 0.96; F.y = 0.78; } }
        const dir = F.st === 'flee' ? (F.x < 0.5 ? -1 : 1) : (ICE.HX >= F.x ? 1 : -1);
        if (F.st !== 'far' || true) fishArt(c, F.x * w - dir * 10 * k, F.y * h, 1.15 * k, Math.sin(t * 3) * 0.08 + (F.st === 'bite' ? -0.5 * dir : 0), t * (F.st === 'flee' ? 2 : 1), false, dir);
      }
      // the rod: a short winter rod in your hand; the line from its tip down through the hole to the lure.
      // Moving the rod up and down makes the lure dance; the springy tip (the кивок) nods when a fish touches it.
      const bend = F && F.st === 'bite' ? 0.55 + Math.sin(t * 18) * 0.08 : F && F.st === 'nibble' ? Math.max(0, Math.sin(t * 20)) * 0.25 : mg.phase === 'catch' && mg.fish && t - mg.fish.t0 < 0.6 ? 0.6 : 0;
      // her lean and hop as she lands a fish carry her hands, and so the grip, with her
      const sc = h * 0.42 / 90, px = (ICE.GX + 0.1) * w, py = S0 + h * 0.012, since = mg.fish ? t - mg.fish.t0 : 99, pull = since < 0.7 ? 1 - since / 0.7 : 0, hopq = since > 0.7 && since < 1.7 ? Math.abs(Math.sin((since - 0.7) * Math.PI * 2)) * (1.7 - since) : 0;
      const lean = -pull * 0.12, cl = Math.cos(lean), sl = Math.sin(lean), hopY = hopq * 12 * k;
      const elev = -0.3 + (0.36 - R.y) / 0.26 * 0.95 + pull * 0.35, ce = Math.cos(elev), se = Math.sin(elev);   // the rod's tilt: tip down at the hole, or raised high
      const aL = 0.8 + elev * 0.35, hlx = (-15.5 - 19 * Math.sin(aL)) * sc, hly = (-47 + 19 * Math.cos(aL)) * sc;   // her arm lifts a little with the rod; the grip is in her hand, wherever it is
      const gx = px + hlx * cl - hly * sl, gy = py + hlx * sl + hly * cl - hopY, L = px - 30 * sc - hx + w * 0.01;
      const tx = gx - ce * L, ty = gy - se * L;
      mg.lure += ((0.58 + (R.y - 0.1) * 1.2) - mg.lure) * Math.min(1, dt * 6);
      const nx = tx - ce * w * 0.05, ny = ty - se * w * 0.05 + bend * h * 0.1;   // the nod's tip
      if (!mg.fish || t - mg.fish.t0 > 0.5) { c.strokeStyle = 'rgba(40,40,40,.75)'; c.lineWidth = 1 * k; c.beginPath(); c.moveTo(nx, ny); c.lineTo(hx, S0); c.lineTo(lx, ly); c.stroke(); }
      if (!mg.fish) {   // the lure: a little bead with the worm on its hook
        c.fillStyle = '#e8b33a'; circ(c, lx, ly, 3 * k); c.strokeStyle = '#e8828f'; c.lineWidth = 2.4 * k; c.beginPath(); for (let i = 0; i <= 6; i++) { const q = i / 6; c.lineTo(lx + Math.sin(t * 7 + q * 5) * 2.5 * k * q, ly + 3 * k + q * 8 * k); } c.stroke();
        if (F && F.st === 'bite') { c.font = `900 ${Math.round(22 * k)}px system-ui`; c.fillStyle = '#ffd23f'; c.strokeStyle = '#4a2c1a'; c.lineWidth = 4 * k; c.textAlign = 'center'; c.strokeText('!', nx - 8 * k, ny - 10 * k); c.fillText('!', nx - 8 * k, ny - 10 * k); }
      }
      { const tsx = w * 0.2, tsy = S0 + h * 0.012, ts = sc * 0.95; person(c, tsx, tsy, winterLook(NPC.taras.look), t, false, ts); coldBreath(c, tsx + 8 * ts, tsy - 60 * ts, t, k, 1.3); coldBreath(c, px + 8 * sc, py - 60 * sc, t, k, 0); }   // Taras beside her on the ice; both their breath steams
      // her, standing on the ice beside the hole with the rod in both hands; she leans back hard as she pulls a fish up, then gives a happy hop
      { c.save(); c.translate(px, py - hopY); c.rotate(lean); person(c, 0, 0, Object.assign({}, ME, { armL: aL, armR: hopq > 0.05 ? 2.6 : undefined }), t, false, sc); c.restore(); }   // and her other hand goes up in a cheer as she lands one
      c.strokeStyle = '#6b4422'; c.lineWidth = 5 * k; c.lineCap = 'round'; c.beginPath(); c.moveTo(gx, gy); c.lineTo(tx, ty); c.stroke();
      c.fillStyle = winter() ? '#d43a3a' : ME.skin; circ(c, gx, gy, 4.2 * sc);   // her hand (a mitten in winter) round the grip
      c.strokeStyle = '#c8a46a'; c.lineWidth = 8 * k; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx - (gx - tx) * 0.25, gy - (gy - ty) * 0.25); c.stroke();   // the cork grip
      c.fillStyle = '#5b6470'; circ(c, gx - (gx - tx) * 0.32, gy - (gy - ty) * 0.32 + 4 * k, 4 * k);   // the little reel
      c.strokeStyle = '#d43a3a'; c.lineWidth = 1.6 * k; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx - w * 0.03, ty, nx, ny); c.stroke(); c.fillStyle = '#d43a3a'; circ(c, nx, ny, 2 * k);
      if (!R.held && !mg.fish) mgRing(c, gx, gy, 26 * k, k, t);
      // the catch: drawn up the line through the hole, out onto the ice, a flop or two, then into the bucket
      if (mg.fish) {
        const q = Math.min(1, (t - mg.fish.t0) / 1.8);
        let x, y, a;
        if (q < 0.35) { const u2 = q / 0.35; x = hx; y = ly + (S0 - h * 0.06 - ly) * u2; a = -Math.PI / 2 + Math.sin(t * 24) * 0.3; }
        else if (q < 0.65) { const u2 = (q - 0.35) / 0.3; x = hx - u2 * w * 0.12; y = S0 - h * 0.06 - Math.abs(Math.sin(u2 * Math.PI * 2)) * h * 0.08; a = Math.sin(t * 20) * 0.6; }
        else { const u2 = (q - 0.65) / 0.35; x = hx - w * 0.12 + (w * 0.255 - (hx - w * 0.12)) * u2; y = S0 - h * 0.06 - Math.sin(u2 * Math.PI) * h * 0.12 - u2 * h * 0.05; a = u2 * 3; }
        if (q < 0.35) { c.strokeStyle = 'rgba(40,40,40,.75)'; c.lineWidth = 1 * k; c.beginPath(); c.moveTo(nx, ny); c.lineTo(hx, S0); c.lineTo(x, y + 8 * k); c.stroke(); }
        if (q < 1) fishArt(c, x, y, 1.25 * k, a, t, false, -1);
        if (q > 0.3 && q < 0.5) { c.fillStyle = 'rgba(200,230,250,.9)'; for (let i = 0; i < 7; i++) circ(c, hx + (i - 3) * 5 * k * (q - 0.3) * 8, S0 - Math.sin((q - 0.3) * 15) * 20 * k, 2 * k); }
      }
    }
  },
};

// ------------------------------------------------------------------ the chopping block: рубай!
// Take the axe by its handle, lift it high and bring it down hard onto the log: it splits, the halves fly
// apart and chips spray. Three logs; the split wood stacks up by the wall.
let chop = null;
function chopStart() {
  if (S.cd.chop > now()) return wordCard('koloda', { note: `🪓 ${W.drova.uk}: ${S.bag.drova || 0}${xl(' · Your arms need a rest. Come back in a minute.')}` });
  learn('koloda'); learn('drova'); learn('rubai');
  chop = { n: 0, logs: 3, axe: { x: 0.8, y: 0.62, held: false, vy: 0, ang: 0.9 }, armed: false, split: null, chips: [], logIn: nowT, fl: null };
  const st = stage();
  openSheet(`<div class="card gamecard"><div class="tag">🪓 ${W.koloda.uk}${st < 3 ? ' · ' + W.koloda.en : ''}</div>
    <div class="word" style="font-size:28px"><span class="verb">${PH.rubai_drova.uk.split(' ')[0]}</span> ${PH.rubai_drova.uk.split(' ').slice(1).join(' ')}</div>${st < 3 ? `<div class="en">${PH.rubai_drova.en}</div>` : ''}
    <div class="vchip"><span class="verb">${W.rubai.uk}</span> ${st < 3 ? '= ' + W.rubai.en : xl('= ' + W.rubai.en)} <small>· дієслово${st < 3 ? ' (verb)' : ''}</small></div>
    <canvas id="chopPad" class="cookpad" style="width:100%;display:block;height:250px"></canvas>
    <div class="muted" style="min-height:2.6em">${st < 3 ? 'Візьми сокиру, підніми високо й різко опусти · Take the axe, lift it high, then bring it down fast' : 'Візьми сокиру, підніми високо й різко опусти'}</div>
    <div class="row">${btn('hear', 'p_rubai_drova', '🔊', 'round blue')}${btn('close', '', lab('close'), 'ghost')}</div></div>${subsHTML()}`); subNow = null;
  say('p_rubai_drova');
  const pad = $('#chopPad'), dpr = Math.min(2, window.devicePixelRatio || 1), me = chop;
  fitPad(pad, 250);
  pad.width = Math.round(pad.clientWidth * dpr); pad.height = Math.round(pad.clientHeight * dpr); chop.k = dpr;
  for (const ev of ['touchstart', 'touchmove', 'touchend']) pad.addEventListener(ev, e => e.stopPropagation(), { passive: true });
  const at = e => { const r = pad.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
  pad.addEventListener('pointerdown', e => { e.preventDefault(); if (chop !== me) return; try { pad.setPointerCapture(e.pointerId); } catch (er) {} const [x, y] = at(e), A = chop.axe; if (Math.hypot(A.x - x, (A.y - y) * 0.66) < 0.22) { A.held = true; A.ox = A.x - x; A.oy = A.y - y; A.lt = performance.now(); blip(520, 0.03); } else chop.miss = nowT; });
  pad.addEventListener('pointermove', e => { if (chop !== me || !chop.axe.held) return; const [x, y] = at(e), A = chop.axe, now2 = performance.now(), dtm = Math.max(1, now2 - A.lt) / 1000; const ny = Math.max(0.33, Math.min(0.66, y + A.oy)); A.vy = (ny - A.y) / dtm; A.x = Math.max(0.45, Math.min(0.92, x + A.ox)); A.y = ny; A.lt = now2; if (A.vy > 0.45) A.fastT = nowT; });
  const up = () => { if (chop === me) chop.axe.held = false; };
  for (const ev of ['pointerup', 'pointercancel']) pad.addEventListener(ev, up);
  requestAnimationFrame(() => chopFrame(me));
}
// The axe head is above the grip; raise it high to get ready, then a fast stroke down splits the log.
// Where the axe head is (pad pixels), from the grip and the handle's angle: it's drawn rotated by -ang about
// the grip, the head at (-0.095 w, -0.31 h) along the handle.
function axeHead(A, w, h) { const th = -A.ang, lx = -w * 0.095, ly = -h * 0.31; return [A.x * w + lx * Math.cos(th) - ly * Math.sin(th), A.y * h + lx * Math.sin(th) + ly * Math.cos(th)]; }
// Lift the axe high (that readies the swing), then bring it down fast: the head swings forward and down, and
// if it meets the log while it's still moving fast the log splits; brought down slowly it only bonks.
function chopSwing(w, h) {
  const A = chop.axe, [hx, hy] = axeHead(A, w, h), logTop = h * 0.52, overLog = Math.abs(hx - w * 0.5) < w * 0.11;
  if (A.held && A.y < 0.4) chop.armed = true;
  if (!chop.armed || chop.split || chop.n >= chop.logs || nowT - chop.logIn < 0.4) return;
  if (overLog && hy >= logTop - h * 0.02) {
    if (A.fastT && nowT - A.fastT < 0.3) chopHit();
    else { chop.armed = false; blip(220, 0.04); chop.bonk = nowT; }   // too gentle: the axe just bonks the log
  }
}
function chopHit() {
  if (!chop || chop.split) return;
  chop.armed = false; chop.split = nowT; chop.shake = nowT; blip(160, 0.12); setTimeout(() => blip(520, 0.05), 60); useWord('rubai', true);
  chop.fl = nowT; chopVoice(); actSub('rubai', chop.vo);
  for (let i = 0; i < 12; i++) chop.chips.push({ x: 0.5, y: 0.6, vx: (Math.random() - 0.5) * 1.4, vy: -0.4 - Math.random() * 0.8, r: Math.random() * 6, t0: nowT });
  setTimeout(() => {
    if (!chop) return;
    chop.n++; give('drova'); chop.split = null; chop.logIn = nowT; chop.cheer = nowT;
    if (chop.n >= chop.logs) { S.cd.chop = now() + 60e3; save(); const n = chop.n, me = chop; setTimeout(() => { if (chop !== me) return; chopStopVoice(); chop = null; if ($('#chopPad')) { closeSheet(); toast(`+${n} 🪵 ${W.drova.uk} (${S.bag.drova})`); say('w_drova'); } }, 900); }
  }, 650);
}
function chopVoice() {
  chop.lastAct = performance.now();
  if (!chop.vo) { const vo = new Audio('audio/w_rubai.mp3'), me = chop; chop.vo = vo; vo.onended = () => { duck = 1; setTimeout(() => { if (chop === me && chop.vo === vo && performance.now() - chop.lastAct < 1600) { duck = 0.3; vo.play().catch(() => {}); } }, 90); }; }
  if (chop.vo.paused) { stopSay(); duck = 0.3; try { chop.vo.currentTime = 0; } catch (e) {} chop.vo.play().catch(() => {}); }
}
function chopStopVoice() { if (chop && chop.vo) { try { chop.vo.pause(); } catch (e) {} chop.vo.onended = null; chop.vo = null; duck = 1; } }
function chopFrame(me) {
  const pad = $('#chopPad'); if (chop !== me) return; if (!pad || !sheetOpen()) { chopStopVoice(); chop = null; return; }
  const c = pad.getContext('2d'), w = pad.width, h = pad.height, k = chop.k, t = nowT, A = chop.axe, wi = winter();
  const dt = Math.min(0.05, Math.max(0, t - (chop.lastT || t))); chop.lastT = t;
  c.setTransform(1, 0, 0, 1, 0, 0);
  const sh = chop.shake && t - chop.shake < 0.25 ? Math.sin((t - chop.shake) * 80) * 3 * k * (1 - (t - chop.shake) / 0.25) : 0;
  c.translate(sh, 0);
  // the cottage wall behind (whitewashed, with a timber sill), the yard in front
  c.fillStyle = '#f4efe2'; c.fillRect(-10, 0, w + 20, h * 0.6); c.fillStyle = 'rgba(180,160,120,.25)'; for (let i = 0; i < 6; i++) c.fillRect(w * (0.05 + i * 0.17), h * 0.08, w * 0.002 + 1, h * 0.5);
  c.fillStyle = '#8a5a2b'; c.fillRect(-10, h * 0.56, w + 20, h * 0.05);
  { const eh = h * 0.09; c.fillStyle = wi ? '#f6f8fc' : '#c9a25a'; c.fillRect(-10, 0, w + 20, eh); c.strokeStyle = wi ? 'rgba(170,190,215,.6)' : 'rgba(120,85,40,.45)'; c.lineWidth = 1.2 * k; for (let x = -6; x < w + 10; x += 5 * k) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 2 * k, eh + (x % 3) * k); c.stroke(); }   // the thatched eaves
    c.fillStyle = 'rgba(60,40,20,.18)'; c.fillRect(-10, eh, w + 20, 4 * k);
    if (wi) { c.fillStyle = 'rgba(230,242,252,.95)'; for (let i = 0; i < 16; i++) { const x = w * (0.03 + i * 0.065), ln = (6 + (i * 37) % 9) * k; poly(c, [[x - 2.5 * k, eh], [x + 2.5 * k, eh], [x, eh + ln]]); } }   // icicles
    const wx = w * 0.8, wy = h * 0.16, ww = w * 0.16, wh = h * 0.26;   // a window, with the real weather outside
    c.save(); c.beginPath(); c.rect(wx - ww / 2, wy, ww, wh); c.clip(); windowView(c, wx - ww / 2, wy, ww, wh, t, 2, 1); c.restore();
    c.strokeStyle = '#3d7cc2'; c.lineWidth = 3 * k; c.strokeRect(wx - ww / 2, wy, ww, wh); c.lineWidth = 1.6 * k; c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx, wy + wh); c.moveTo(wx - ww / 2, wy + wh / 2); c.lineTo(wx + ww / 2, wy + wh / 2); c.stroke();
    c.fillStyle = '#c08a55'; c.fillRect(wx - ww / 2 - 3 * k, wy + wh, ww + 6 * k, 4 * k);
    c.fillStyle = '#b5653a'; poly(c, [[wx - 5 * k, wy + wh - 8 * k], [wx + 5 * k, wy + wh - 8 * k], [wx + 4 * k, wy + wh], [wx - 4 * k, wy + wh]]); c.fillStyle = wi ? '#7a8a6a' : '#e2574c'; circ(c, wx - 2 * k, wy + wh - 11 * k, 2.6 * k); circ(c, wx + 2.5 * k, wy + wh - 12 * k, 2.4 * k); }   // a geranium on the sill
  const g = c.createLinearGradient(0, h * 0.6, 0, h); g.addColorStop(0, wi ? '#eef3fa' : '#a6d67c'); g.addColorStop(1, wi ? '#d6e2f0' : '#7fc25a'); c.fillStyle = g; c.fillRect(-10, h * 0.61, w + 20, h * 0.4);
  if (wi) drawSnow(c, w, h, t, k, 0.5);
  // the woodpile against the wall, growing as you split
  const pile = (S.bag.drova || 0) + 3;
  for (let i = 0; i < Math.min(18, pile); i++) { const col = i % 6, row = Math.floor(i / 6), x = w * (0.04 + col * 0.045 + (row % 2) * 0.022), y = h * (0.6 - row * 0.07); c.fillStyle = '#a06a35'; circ(c, x, y, h * 0.035); c.fillStyle = '#d9b27a'; circ(c, x, y, h * 0.026); c.strokeStyle = '#b08850'; c.lineWidth = 1 * k; c.beginPath(); c.arc(x, y, h * 0.013, 0, 7); c.stroke(); }
  // the block, and the log standing on it (dropped on fresh after each split)
  const bx = w * 0.5, by = h * 0.86, bw = w * 0.2;
  c.fillStyle = 'rgba(0,0,0,.15)'; ell(c, bx, by + 2 * k, bw * 0.75, h * 0.03);
  c.fillStyle = '#7a4b22'; c.fillRect(bx - bw / 2, by - h * 0.14, bw, h * 0.14); ell(c, bx, by, bw / 2, h * 0.03); c.fillStyle = '#d9b27a'; ell(c, bx, by - h * 0.14, bw / 2, h * 0.035);
  c.strokeStyle = '#b08850'; c.lineWidth = 1.2 * k; for (const r of [0.15, 0.3, 0.42]) { c.beginPath(); c.ellipse(bx, by - h * 0.14, bw * r, h * 0.035 * r * 2, 0, 0, 7); c.stroke(); }
  const top = by - h * 0.14, lw = w * 0.085, lh = h * 0.2;
  if (chop.n < chop.logs) {
    const drop = Math.max(0, 1 - (t - chop.logIn) / 0.25), sp = chop.split ? Math.min(1, (t - chop.split) / 0.5) : 0, bonk = chop.bonk && t - chop.bonk < 0.2 ? Math.sin((t - chop.bonk) * 60) * 2 * k : 0;
    for (const s of [-1, 1]) {
      c.save(); c.translate(bx + s * sp * w * 0.22 + bonk, top - drop * h * 0.4 - Math.sin(sp * Math.PI) * h * 0.15); c.rotate(s * sp * 1.4);
      c.fillStyle = '#a06a35'; c.fillRect(s < 0 ? -lw : 0, -lh, lw, lh); c.fillStyle = '#8a5a2b'; c.fillRect(s < 0 ? -lw : lw - 3 * k, -lh, 3 * k, lh);
      c.fillStyle = '#d9b27a'; c.beginPath(); c.ellipse(0, -lh, lw, h * 0.025, 0, s < 0 ? Math.PI / 2 : -Math.PI / 2, s < 0 ? Math.PI * 1.5 : Math.PI / 2); c.fill();
      if (sp) { c.fillStyle = '#e8c890'; c.fillRect(s < 0 ? -2 * k : 0, -lh, 2 * k, lh); }
      c.restore();
    }
  }
  chop.chips = chop.chips.filter(p => t - p.t0 < 0.8); for (const p of chop.chips) { p.vy += dt * 2.4; p.x += p.vx * dt * 0.5; p.y += p.vy * dt * 0.5; c.fillStyle = '#d9b27a'; c.save(); c.translate(p.x * w, p.y * h); c.rotate(p.r + t * 10); c.fillRect(-3 * k, -1.5 * k, 6 * k, 3 * k); c.restore(); }
  // the axe: a long handle you hold near its end, the head above; it tips forward as you bring it down
  if (!A.held) { A.y += (0.62 - A.y) * Math.min(1, dt * 4); A.vy = 0; }
  // the handle's angle: upright with the head high when you lift it, swinging forward and down on a fast
  // stroke (the head comes round onto the log), resting at a lean otherwise
  const fast = A.held && A.fastT && nowT - A.fastT < 0.25;
  const goalAng = !A.held ? 0.9 : fast ? 1.45 : A.y < 0.4 ? 0.2 : 0.2 + (A.y - 0.4) / 0.26 * 0.9;
  A.ang += (goalAng - A.ang) * Math.min(1, dt * (fast ? 26 : 12));
  if (A.held && !chop.split) chopSwing(w, h);
  // the head can't pass through the log: hold it on top
  { const [hx, hy] = axeHead(A, w, h); if (!chop.split && chop.n < chop.logs && Math.abs(hx - w * 0.5) < w * 0.11 && hy > h * 0.52) A.y -= (hy - h * 0.52) / h; }
  const gx = A.x * w, gy = A.y * h;
  c.save(); c.translate(gx, gy); c.rotate(-A.ang);
  c.fillStyle = '#9b6b3c'; rr(c, -4 * k, -h * 0.34, 8 * k, h * 0.38, 4 * k); c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(-2 * k, -h * 0.33, 2 * k, h * 0.36);
  c.fillStyle = '#7a8088'; poly(c, [[-5 * k, -h * 0.34], [-5 * k, -h * 0.26], [-w * 0.09, -h * 0.24], [-w * 0.1, -h * 0.37]]); c.fillStyle = '#c9ced4'; poly(c, [[-w * 0.085, -h * 0.245], [-w * 0.1, -h * 0.37], [-w * 0.105, -h * 0.365], [-w * 0.092, -h * 0.24]]);
  c.restore();
  if (!A.held && (chop.miss && t - chop.miss < 0.8 || t - (chop.logIn) < 2.5 && chop.n === 0)) { c.strokeStyle = 'rgba(255,210,63,.7)'; c.lineWidth = 3 * k; c.beginPath(); c.arc(gx, gy, 30 * k, 0, 7); c.stroke(); }
  if (A.held && chop.armed && !chop.split && A.y < 0.45) { c.fillStyle = 'rgba(255,255,255,.85)'; c.font = `800 ${Math.round(12 * k)}px system-ui`; c.textAlign = 'center'; c.fillText('⬇', bx, h * 0.45); }
  // the word, flashed on each split
  if (chop.fl) { const q = (t - chop.fl) / 1.6; if (q >= 0 && q <= 1) { const a = flashA(q), sc = flashS(q); c.save(); c.globalAlpha = Math.max(0, a); c.translate(w * 0.5, h * 0.17); c.scale(sc, sc); c.font = `900 ${Math.round(30 * k)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 6 * k; c.strokeStyle = '#4a2c1a'; c.strokeText('Рубай!', 0, 0); c.fillStyle = '#ffd27a'; c.fillText('Рубай!', 0, 0); c.restore(); } }
  c.setTransform(1, 0, 0, 1, 0, 0);
  padBadge(c, w, k, `🪵 ${chop.n}/${chop.logs}`);
  padFinish(c, w, h, k); padCheer(c, w, h, k, chop.cheer, t);
  requestAnimationFrame(() => chopFrame(me));
}
// The snowball fight: Andriiko pops up behind one of three snow forts; tap where to throw (кидай!) and the snowball
// arcs over. Hit him six times. Now and then he throws one back and it splats on the screen.
// The snowball fight: Andriiko pops up behind one of three snow forts. Tap where to throw (кидай!): her red
// mitten swings and the snowball arcs over, getting smaller as it flies off, its shadow running along the snow.
// A hit bursts in a puff and Andriiko yelps and ducks; a miss just lands with a soft plop, leaving a lump of
// snow where it came down. Now and then he throws one back: it comes at you, growing, and splats on the screen.
const SNOWBALL = {
  FORTS: [0.24, 0.5, 0.76],
  begin(step) { mg.hits = 0; mg.and = { fort: 1, up: false, nextT: nowT + 0.8, until: 0, threw: false }; mg.balls = []; mg.splats = []; mg.puffs = []; mg.marks = []; mg.inc = []; mg.aims = []; mgLine('mgws_kydai', 'kydai', ['Торкнися, куди кинути сніжку', 'Tap where to throw the snowball']); },
  press(x, y) { if (mg.phase !== 'a' || mg.balls.length > 1) return; mg.balls.push({ tx: x, ty: y, t0: nowT, spin: Math.random() * 6 }); mg.throwT = nowT; mg.aims.push({ x, y, t0: nowT }); mgAct('kydai', true); blip(520, 0.04); },
  move() {}, release() {},
  frame(c, w, h, t, k, dt) {
    snowScene(c, w, h, t, k);
    const A = mg.and, F = SNOWBALL.FORTS, fy = h * 0.66;
    if (t > A.nextT) { if (A.up) { A.up = false; A.nextT = t + 0.5 + Math.random() * 0.9; } else { A.fort = Math.floor(Math.random() * 3); A.up = true; A.upT = t; A.until = t + 1.3 + Math.random() * 0.8; A.nextT = A.until; A.threw = false; A.hitT = 0; } }
    if (A.up && !A.threw && !A.hitT && t - A.upT > 0.6 && Math.random() < 0.02) { A.threw = true; A.throwT = t; mg.inc.push({ t0: t + 0.25, x0: F[A.fort], tx: 0.3 + Math.random() * 0.4, ty: 0.4 + Math.random() * 0.25 }); }
    // the lumps of snow left by misses, fading into the snow
    mg.marks = mg.marks.filter(m => t - m.t0 < 4); for (const m of mg.marks) { c.globalAlpha = Math.min(1, (4 - (t - m.t0)) / 1.5); c.fillStyle = '#ffffff'; ell(c, m.x * w, m.y * h, 7 * k * m.s, 3.5 * k * m.s); c.fillStyle = 'rgba(180,198,222,.7)'; ell(c, m.x * w, m.y * h + 2 * k, 6 * k * m.s, 1.6 * k * m.s); c.globalAlpha = 1; }
    // Andriiko behind his fort: popping up, throwing, and flinching when hit
    const ax = F[A.fort] * w, pop = A.up ? Math.min(1, (t - A.upT) / 0.2) * Math.min(1, (A.until - t) / 0.2) : 0, hurt = A.hitT && t - A.hitT < 0.35 ? 1 - (t - A.hitT) / 0.35 : 0;
    if (pop > 0 || hurt > 0) { const lift = Math.max(pop, hurt * 0.7); c.save(); c.translate(ax, fy + h * 0.06 - lift * h * 0.2); c.rotate(hurt * Math.sin((t - A.hitT) * 40) * 0.15); person(c, 0, 0, Object.assign({}, NPC.andriiko.look, { armR: A.threw && t - A.throwT < 0.5 ? -2.7 + (t - A.throwT) * 4 : undefined }), t, false, 1.1 * k); c.restore(); }
    if (mg.hitT && t - mg.hitT < 0.6) { const q = (t - mg.hitT) / 0.6; c.save(); c.globalAlpha = 1 - q; c.font = `900 ${Math.round(20 * k)}px system-ui`; c.textAlign = 'center'; c.lineWidth = 4 * k; c.strokeStyle = '#4a2c1a'; c.strokeText('Ой!', mg.hitX, fy - h * 0.32 - q * 24 * k); c.fillStyle = '#fff8ea'; c.fillText('Ой!', mg.hitX, fy - h * 0.32 - q * 24 * k); c.restore(); }
    // the three snow forts: walls of packed snow blocks, a snowy top, blue shade on the side, a flag on the middle one
    for (const f2 of F) { const x = f2 * w, fw = w * 0.095, fh = h * 0.125, top = fy - fh;
      c.fillStyle = 'rgba(110,135,170,.16)'; ell(c, x + 4 * k, fy + 3 * k, fw * 1.1, h * 0.028);
      c.fillStyle = '#ffffff'; rr(c, x - fw, top, fw * 2, fh, 6 * k);
      c.strokeStyle = 'rgba(150,175,210,.55)'; c.lineWidth = 1.2 * k;
      for (let r = 0; r < 3; r++) { const y = top + fh * (r + 1) / 3.2; c.beginPath(); c.moveTo(x - fw + 2 * k, y); c.lineTo(x + fw - 2 * k, y); c.stroke();
        for (let q = 0; q < 4; q++) { const bx = x - fw + fw * 2 * (q + (r % 2 ? 0.5 : 0)) / 4; if (bx <= x - fw + 3 * k || bx >= x + fw - 3 * k) continue; c.beginPath(); c.moveTo(bx, y); c.lineTo(bx, y - fh / 3.2); c.stroke(); } }
      c.fillStyle = 'rgba(160,185,220,.35)'; rr(c, x + fw * 0.55, top + 3 * k, fw * 0.45, fh - 3 * k, 5 * k);   // the shaded side
      c.fillStyle = '#ffffff'; for (let q = 0; q < 5; q++) ell(c, x - fw + fw * 2 * (q + 0.5) / 5, top + 1 * k, fw * 0.24, 4 * k);   // lumpy snow along the top
      if (f2 === F[1]) { c.strokeStyle = '#6b4422'; c.lineWidth = 1.6 * k; c.beginPath(); c.moveTo(x + fw * 0.8, top); c.lineTo(x + fw * 0.8, top - 22 * k); c.stroke(); const wv = Math.sin(t * 4) * 1.5 * k; c.fillStyle = '#2c6ed5'; poly(c, [[x + fw * 0.8, top - 22 * k], [x + fw * 0.8 + 14 * k, top - 19 * k + wv], [x + fw * 0.8, top - 16 * k]]); c.fillStyle = '#f2c230'; poly(c, [[x + fw * 0.8, top - 16 * k], [x + fw * 0.8 + 14 * k, top - 13 * k + wv], [x + fw * 0.8, top - 10 * k]]); }
    }
    // where you tapped: a little ring
    mg.aims = mg.aims.filter(a => t - a.t0 < 0.35); for (const a of mg.aims) { const q = (t - a.t0) / 0.35; c.strokeStyle = `rgba(255,210,63,${1 - q})`; c.lineWidth = 2.5 * k; c.beginPath(); c.arc(a.x * w, a.y * h, (6 + q * 10) * k, 0, 7); c.stroke(); }
    // your snowballs: from your mitten, in an arc, shrinking with distance, spinning, a shadow running below
    mg.balls = mg.balls.filter(b => { const q = (t - b.t0) / 0.5;
      if (q >= 1) {
        const bodyY = fy + h * 0.06 - pop * h * 0.2 - h * 0.12, hit = A.up && !A.hitT && pop > 0.5 && Math.abs(b.tx - F[A.fort]) < 0.075 && Math.abs(b.ty * h - bodyY) < h * 0.15;
        if (hit) {
          for (let i = 0; i < 14; i++) { const an = i / 14 * Math.PI * 2; mg.puffs.push({ x: b.tx, y: b.ty, vx: Math.cos(an) * 0.35, vy: Math.sin(an) * 0.25 - 0.15, t0: t, s: 3 + Math.random() * 3 }); }
          mg.hits++; mg.hitT = t; A.hitT = t; mg.hitX = F[A.fort] * w; A.nextT = t + 0.35; A.until = t + 0.35; blip(880, 0.08); setTimeout(() => blip(660, 0.05), 70); useWord('snizhka', true); learn('snizhka');
          if (mg.hits >= 6) { mg.phase = 'pause'; say('p_chudovo'); setTimeout(() => { if (mg && mg.id === 'andriiko_s') mgRoundDone(); }, 1000); }
        } else { mg.marks.push({ x: b.tx, y: b.ty, t0: t, s: 0.8 + Math.random() * 0.4 }); blip(150, 0.04); }   // a miss: a soft plop and a lump of snow
        return false; }
      const sx = 0.5 + (b.tx - 0.5) * q, sy = 1.02 + (b.ty - 1.02) * q, x = sx * w, y = sy * h - Math.sin(q * Math.PI) * h * 0.22, r = (13 - q * 7) * k;
      c.fillStyle = 'rgba(120,140,170,.18)'; ell(c, x, sy * h + 4 * k, r * 0.9, r * 0.3);   // its shadow on the snow
      c.save(); c.translate(x, y); c.rotate(b.spin + q * 8); c.fillStyle = '#ffffff'; circ(c, 0, 0, r); c.fillStyle = '#dbe5f2'; circ(c, r * 0.35, r * 0.2, r * 0.3); c.strokeStyle = '#c3d2e4'; c.lineWidth = 1.2 * k; c.beginPath(); c.arc(0, 0, r, 0.3, 2.7); c.stroke(); c.restore();
      return true; });
    mg.puffs = mg.puffs.filter(p => t - p.t0 < 0.6); for (const p of mg.puffs) { const q = (t - p.t0) / 0.6; c.fillStyle = `rgba(255,255,255,${1 - q})`; circ(c, (p.x + p.vx * q) * w, (p.y + p.vy * q + q * q * 0.2) * h, (p.s || 4) * (1 - q * 0.6) * k); }
    // his snowballs coming at you: growing as they come, then splat on the screen
    mg.inc = mg.inc.filter(s => { const q = (t - s.t0) / 0.6; if (q < 0) return true; if (q >= 1) { mg.splats.push({ x: s.tx, y: s.ty, t0: t, r: 0.08 + Math.random() * 0.04 }); blip(240, 0.06); return false; }
      const x = (s.x0 + (s.tx - s.x0) * q) * w, y = (fy / h - 0.25 + (s.ty - fy / h + 0.25) * q) * h - Math.sin(q * Math.PI) * h * 0.08, r = (3 + q * q * 30) * k; c.fillStyle = '#ffffff'; circ(c, x, y, r); c.strokeStyle = '#c3d2e4'; c.lineWidth = 1.2 * k; c.beginPath(); c.arc(x, y, r, 0.3, 2.7); c.stroke(); return true; });
    mg.splats = mg.splats.filter(s => t - s.t0 < 1.4); for (const s of mg.splats) { const q = (t - s.t0) / 1.4; c.globalAlpha = q < 0.6 ? 0.95 : (1 - q) / 0.4 * 0.95; c.fillStyle = '#ffffff'; circ(c, s.x * w, s.y * h, s.r * w); for (let i = 0; i < 7; i++) { const an = i * 0.9; circ(c, s.x * w + Math.cos(an) * s.r * w * 1.1, s.y * h + Math.sin(an) * s.r * w * 1.1 + q * 12 * k, s.r * w * 0.3); } c.globalAlpha = 1; }
    // her red mitten at the bottom, swinging up as she throws
    { const q = mg.throwT ? Math.min(1, (t - mg.throwT) / 0.3) : 1, sw = Math.sin(q * Math.PI); c.save(); c.translate(w * 0.5, h * 1.02 - sw * h * 0.1); c.rotate(-0.4 + sw * 0.9); c.fillStyle = '#d43a3a'; rr(c, -12 * k, -22 * k, 24 * k, 26 * k, 10 * k); ell(c, -13 * k, -10 * k, 6 * k, 8 * k); c.fillStyle = '#ffffff'; c.fillRect(-12 * k, 0, 24 * k, 6 * k); c.restore(); }
    // hits so far: six snowballs that fill in
    for (let i = 0; i < 6; i++) { const x = w - (14 + (5 - i) * 15) * k, y = 18 * k; c.fillStyle = i < mg.hits ? '#ffffff' : 'rgba(255,255,255,.35)'; circ(c, x, y, 5.5 * k); c.strokeStyle = '#8aa3c2'; c.lineWidth = 1.2 * k; c.beginPath(); c.arc(x, y, 5.5 * k, 0, 7); c.stroke(); }
  },
};
const GAMES = { bohdan: BEE, bohdan_w: HIVEW, andriiko_w: SNOWMAN, andriiko_s: SNOWBALL, taras_w: ICE };

// ------------------------------------------------------------------ speaking
// Say a word, and Gemini (through a small server that holds the key) gives a generous score. Chrome on Android.
const SPEECH_URL = 'https://us-central1-skillsprouts-f2787.cloudfunctions.net/kdScoreSpeech';
const MIC = { supported: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder && (window.AudioContext || window.webkitAudioContext)), state: 'prompt' };
function micRefresh() {
  const b = $('#micBtn'); if (!b) return;
  let top, sub, off = false;
  if (!MIC.supported) { top = '🎤 Мікрофон недоступний'; sub = 'Microphone not available here'; off = true; }
  else if (MIC.state === 'granted') { top = '🎤 Мікрофон увімкнено ✓'; sub = 'Microphone is on'; }
  else if (MIC.state === 'denied') { top = '🎤 Мікрофон заблоковано'; sub = 'Blocked: tap for how to allow it'; }
  else { top = '🎤 Увімкнути мікрофон'; sub = 'Enable microphone'; }
  b.innerHTML = `${top}<small>${sub}</small>`; b.classList.toggle('off', off);
}
if (MIC.supported && navigator.permissions && navigator.permissions.query) {
  navigator.permissions.query({ name: 'microphone' }).then(p => { MIC.state = p.state; micRefresh(); p.onchange = () => { MIC.state = p.state; micRefresh(); }; }).catch(() => {});
}

// Why the microphone didn't turn on, and what to do. Chrome on Android refuses
// WITHOUT asking (and the site's settings then show no microphone at all) when
// Chrome itself isn't allowed the phone's microphone, or Chrome's own
// microphone setting is off. A refusal that comes back almost instantly means
// no question was shown, so that's the case we explain first.
function micReason(e, ms) {
  const n = e && e.name;
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'none';
  if (n === 'NotReadableError' || n === 'AbortError' || n === 'TrackStartError') return 'busy';
  if (n === 'SecurityError' || /; wv\)|FBAN|FBAV|Instagram|Line\//.test(navigator.userAgent)) return 'inapp';
  if (n === 'NotAllowedError') return ms < 700 ? 'chrome' : 'site';
  return 'other';
}
function micHelp(reason) {
  const host = location.hostname;
  const steps = {
    chrome: ['Chrome didn’t ask, so Chrome itself isn’t allowed to use the microphone. Fix it in two places:',
      ['Phone <b>Settings</b> → <b>Apps</b> → <b>Chrome</b> → <b>Permissions</b> → <b>Microphone</b> → <b>Allow only while using the app</b>.',
       'In Chrome: <b>⋮</b> (top right) → <b>Settings</b> → <b>Site settings</b> → <b>Microphone</b> → turn it <b>on</b> (“Sites can ask to use your microphone”). If <b>' + host + '</b> is under “Not allowed”, tap it and choose <b>Allow</b>.',
       'Come back here and tap <b>🎤 Enable microphone</b> again. Chrome will ask; tap <b>Allow</b>.']],
    site: ['The microphone was blocked for this game. To allow it:',
      ['Tap the small icon at the left of the address bar (🔒 or ☰), then <b>Permissions</b> → <b>Microphone</b> → <b>Allow</b>.',
       'Or: Chrome <b>⋮</b> → <b>Settings</b> → <b>Site settings</b> → <b>Microphone</b> → <b>' + host + '</b> → <b>Allow</b>.',
       'Then tap <b>🎤 Enable microphone</b> again.']],
    none: ['No microphone was found on this device.', ['If you use a headset, plug it in (or connect it) and try again.']],
    busy: ['Another app is using the microphone right now (a call, a voice recorder, an assistant).', ['Close that app or end the call, then tap <b>🎤 Enable microphone</b> again.']],
    inapp: ['This page is open inside another app, which can’t use the microphone.', ['Tap <b>⋮</b> and choose <b>Open in Chrome</b>, then tap <b>🎤 Enable microphone</b> there.']],
    other: ['The microphone didn’t start.', ['Restart Chrome and try again. If it still doesn’t work, check the phone’s Settings → Apps → Chrome → Permissions → Microphone.']]
  }[reason] || null;
  if (!steps) return;
  let box = document.getElementById('micHelp');
  if (!box) {
    box = document.createElement('div');
    box.id = 'micHelp';
    box.setAttribute('role', 'dialog');
    box.style.cssText = 'position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center;background:rgba(40,30,20,.45)';
    document.body.appendChild(box);
    box.addEventListener('click', ev => { if (ev.target === box || ev.target.closest('[data-mh="close"]')) box.remove(); else if (ev.target.closest('[data-mh="retry"]')) { box.remove(); A.mic(); } });
  }
  box.innerHTML = '<div style="width:min(100vw,560px);max-height:82vh;overflow:auto;background:var(--cream,#fff8ea);border-radius:26px 26px 0 0;padding:18px 18px calc(18px + env(safe-area-inset-bottom));box-shadow:0 -6px 24px rgba(40,30,20,.25);font-size:16px;line-height:1.45;color:#3b2a1d">'
    + '<div style="font-size:20px;font-weight:800;margin-bottom:6px">🎤 Мікрофон · Microphone</div>'
    + '<div style="margin-bottom:10px">' + steps[0] + '</div>'
    + '<ol style="margin:0 0 14px;padding-left:22px">' + steps[1].map(x => '<li style="margin-bottom:8px">' + x + '</li>').join('') + '</ol>'
    + '<div style="display:flex;gap:10px;flex-wrap:wrap"><button class="b" data-mh="retry">🎤 Спробувати знову<small>Try again</small></button><button class="b ghost" data-mh="close">Закрити<small>Close</small></button></div></div>';
}
micRefresh();
const micOk = () => MIC.supported && MIC.state !== 'denied';
function stopSay() { sayToken++; for (const k in clipCache) { try { clipCache[k].pause(); } catch (e) {} } try { speechSynthesis.cancel(); } catch (e) {} }

// Listens until the person has spoken and then gone quiet (or 4.5 s), and returns a 16 kHz WAV as base64.
async function recordOnce(ctl, onLevel) {
  musicVol = 0; try { music.volume = 0; } catch (e) {}
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const AC = window.AudioContext || window.webkitAudioContext, ac = new AC();
  try {
    const src = ac.createMediaStreamSource(stream), an = ac.createAnalyser(); an.fftSize = 1024; src.connect(an);
    const rec = new MediaRecorder(stream), chunks = [], stopped = new Promise(r => (rec.onstop = r));
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(100);
    const buf = new Float32Array(an.fftSize), t0 = performance.now();
    let floor = 0, voiced = false, lastVoice = 0;
    await new Promise(done => {
      const iv = setInterval(() => {
        an.getFloatTimeDomainData(buf); let sum = 0; for (const v of buf) sum += v * v;
        const rms = Math.sqrt(sum / buf.length), t = performance.now() - t0;
        if (t < 350) floor = Math.max(floor, rms);
        else if (rms > Math.max(0.02, floor * 2.5)) { voiced = true; lastVoice = t; }
        if (onLevel) onLevel(rms);
        if ((voiced && t - lastVoice > 800) || t > 4500 || ctl.stop) { clearInterval(iv); done(); }
      }, 50);
    });
    rec.stop(); await stopped;
    if (!voiced) return { quiet: true };
    const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
    const ab = await blob.arrayBuffer();
    const dec = await new Promise((res, rej) => ac.decodeAudioData(ab, res, rej));
    return { wav: await toWav16k(dec) };
  } finally { stream.getTracks().forEach(t => t.stop()); try { ac.close(); } catch (e) {} }
}

async function toWav16k(dec) {
  const len = Math.max(1, Math.min(Math.ceil(dec.duration * 16000), 16000 * 6));
  const oc = new OfflineAudioContext(1, len, 16000), s = oc.createBufferSource(); s.buffer = dec; s.connect(oc.destination); s.start();
  const pcm = (await oc.startRendering()).getChannelData(0);
  const out = new DataView(new ArrayBuffer(44 + pcm.length * 2)), w = (o, t) => { for (let i = 0; i < t.length; i++) out.setUint8(o + i, t.charCodeAt(i)); };
  w(0, 'RIFF'); out.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVEfmt '); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
  out.setUint32(24, 16000, true); out.setUint32(28, 32000, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) out.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true);
  const bytes = new Uint8Array(out.buffer); let bin = '';
  for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return btoa(bin);
}
async function scoreWord(id, wav) {
  const w = W[id];
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 25000);   // never leave the player on the spinner
  let r;
  try { r = await fetch(SPEECH_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ word: w.uk, tr: w.tr, wav }), signal: ctl.signal }); } finally { clearTimeout(timer); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) return { limit: true, message: j.message || 'Enough practice for today. Come back tomorrow!' };
  if (!r.ok) throw new Error('score ' + r.status);
  const esc = x => String(x || '').replace(/[<>&"]/g, '').slice(0, 140);   // shown as HTML, so nothing from the network goes in raw
  return { score: Math.max(0, Math.min(100, Math.round(Number(j.score) || 0))), heard: esc(j.heard), tip: esc(j.tip) };
}

// The round after a dish: each ingredient in turn. Say it, get a score, try again or move on. Always skippable.
let sp = null;
const starsFor = n => n >= 85 ? 3 : n >= 60 ? 2 : n >= 30 ? 1 : 0;
const starStr = n => '★'.repeat(n) + '☆'.repeat(3 - n);
function speakRound(R) { sp = { R, i: 0, view: 'ready', last: null, tries: 0, stop: false, run: 0, rendering: false, err: '' }; spRender(); }
function spRender() {
  const R = sp.R, id = R.needs[sp.i], w = W[id], st = stage();
  const dots = `<div class="sp-dots">${R.needs.map((_, k) => `<i class="${k < sp.i ? 'done' : k === sp.i ? 'on' : ''}"></i>`).join('')}</div>`;
  let html;
  if (sp.view === 'summary') {
    const rows = R.needs.map(x => { const b = sp.best && sp.best[x]; return `<div><img src="${iconURL(x)}" alt=""><b>${W[x].uk}</b><span>${b === undefined ? '–' : starStr(starsFor(b))}</span></div>`; }).join('');
    html = `<div class="card"><div class="sp-top">🎤 ${W[R.dish].uk}</div><div class="word" style="font-size:30px;margin-top:6px">${PH.molodets.uk}</div><div class="sp-sum">${rows}</div>
      <div class="row">${btn('spGo', '', `${PH.duzhe_smachno ? 'Смачного!' : 'OK'}<small>Dinner time</small>`)}</div></div>`;
  } else {
    const off = !micOk();
    // No hints to start with: the picture and the speaker button only. Two eyes reveal the written word and how to say it.
    const done = sp.view === 'result';
    const showUk = done || sp.showUk, showTr = done || sp.showTr;
    const hints = `${showUk ? `<div class="word">${w.uk}</div>` : ''}${showTr ? `<div class="tr">${w.tr}</div><div class="en">${w.en}</div>` : ''}
      ${showUk && showTr ? '' : `<div class="sp-eyes">${showUk ? '' : btn('spEyeUk', '', '👁 Абв', 'ghost')}${showTr ? '' : btn('spEyeTr', '', '👁 abc', 'ghost')}</div>`}`;
    let mid = '', row = '';
    const hear = btn('hear', 'w_' + id, '🔊', 'round blue'), skip = btn('spSkip', '', lab('skip'), 'ghost');
    if (sp.view === 'listening') {
      mid = `<div class="sp-mic">🎤<i id="splevel"></i></div><div class="muted" style="padding:0">Слухаю…${st < 3 ? ' · Listening…' : ''}</div>`;
      row = btn('spStop', '', '⏹', 'round');
    } else if (sp.view === 'checking') {
      mid = `<div class="sp-spin"></div><div class="muted" style="padding:0">Перевіряю…${st < 3 ? ' · Checking…' : ''}</div>`;
    } else if (sp.view === 'result' && sp.last) {
      const sc = sp.last.score, ns = starsFor(sc), col = ns === 3 ? '#3f8a3a' : ns === 2 ? '#c98a1a' : '#e2574c';
      mid = `<div class="sp-score" style="color:${col}">${sc}</div><div class="sp-stars" style="color:${col}">${starStr(ns)}</div>
        ${sp.last.heard ? `<div class="muted" style="padding:6px 0 0">${st < 3 ? 'I heard' : 'Чую'}: <b>${sp.last.heard}</b></div>` : ''}<div class="hint">${sp.last.tip || ''}</div>`;
      row = `${hear}${sp.tries < 6 ? btn('spSay', '', `🎤 ${lab('retry')}`, 'blue') : ''}${btn('spNext', '', lab(sp.i === R.needs.length - 1 ? 'finish' : 'next'))}`;
    } else if (sp.view === 'quiet' || sp.view === 'error' || sp.view === 'limit') {
      mid = `<div class="hint">${sp.view === 'quiet' ? 'I didn’t hear anything. Tap the microphone and say the word.' : sp.err}</div>`;
      row = `${hear}${sp.view !== 'limit' && micOk() ? btn('spSay', '', `🎤 ${lab('retry')}`, 'blue') : ''}${skip}`;
    } else {
      mid = off ? `<div class="hint">${MIC.supported ? 'The microphone is blocked. <button class="subt" data-a="micHow">How to fix it</button> Or skip.' : 'The microphone is not available here. You can skip.'}</div>` : '';
      row = `${hear}<button class="b${off ? ' off' : ''}" data-a="spSay">🎤 ${lab('say')}</button>${skip}`;
    }
    html = `<div class="card"><div class="sp-top">🎤 Скажи слово${st < 3 ? ' · Say the word' : ''}</div>${dots}
      <img class="big" src="${iconURL(id)}" alt="">${hints}
      ${mid}<div class="row">${row}</div></div>`;
  }
  sp.rendering = true;
  openSheet(html, () => { if (sp && !sp.rendering) { sp.stop = true; sp.run++; sp = null; } });
  sp.rendering = false;
}
async function spAttempt() {
  if (!sp || !micOk()) return;
  const my = sp, run = ++my.run, id = my.R.needs[my.i];
  stopSay(); my.stop = false; my.view = 'listening'; spRender();
  const alive = () => sp === my && my.run === run;
  let rec;
  try {
    rec = await recordOnce(my, rms => { const el = $('#splevel'); if (el && alive()) el.style.transform = `scale(${1 + Math.min(0.9, rms * 9)})`; });
  } catch (e) {
    if (!alive()) return;
    if (e && e.name === 'NotAllowedError') MIC.state = 'denied';
    micRefresh(); my.view = 'error'; MIC.lastReason = micReason(e, 0);
    my.err = (e && e.name === 'NotAllowedError' ? 'The microphone is blocked.' : e && e.name === 'NotReadableError' ? 'Another app is using the microphone.' : 'I couldn’t use the microphone.') + ' <button class="subt" data-a="micHow">How to fix it</button> Or skip.';
    return spRender();
  }
  if (!alive()) return;
  if (rec.quiet) { my.view = 'quiet'; return spRender(); }
  my.view = 'checking'; spRender(); my.tries++;
  let out;
  try { out = await scoreWord(id, rec.wav); } catch (e) { if (!alive()) return; my.view = 'error'; my.err = 'I couldn’t check that right now. Try again, or skip.'; return spRender(); }
  if (!alive()) return;
  if (out.limit) { my.view = 'limit'; my.err = out.message; return spRender(); }
  my.last = out; my.best = my.best || {}; my.best[id] = Math.max(my.best[id] || 0, out.score);
  S.say[id] = Math.max(S.say[id] || 0, out.score); save();
  if (out.score >= 85) { blip(990, 0.15); }
  my.view = 'result'; spRender();
}
function spAdvance() { if (!sp) return; sp.run++; sp.i++; sp.view = sp.i >= sp.R.needs.length ? 'summary' : 'ready'; sp.last = null; sp.tries = 0; sp.showUk = sp.showTr = false; spRender(); }

let talkNpc = null;   // the neighbour you're talking to (they turn to face you while a card is open)
function talk(npc) {
  const n = S.npc[npc.id] || (S.npc[npc.id] = { met: false, q: null, k: 0 });
  const steps = [line(npc, 'greet')];
  if (!n.met) { steps.push(line(npc, 'intro')); n.met = true; }
  if (n.mad) return dialog(npc, [line(npc, 'angry')]);
  if (npc.id !== 'olia') {
    // what you did together last time, remembered once: a thank-you for what you brought, or "again?" after a game
    const L = n.last; n.last = null;
    if (L && L.k === 'gift' && W[L.item]) steps.push({ uk: D.thankLine.uk.replace('%s', W[L.item].acc || W[L.item].uk), en: D.thankLine.en.replace('%s', 'the ' + W[L.item].en), clip: `tq_${npc.id}_${L.item}` });
    else if (L && L.k === 'game' && npc.lines['again_' + L.g]) steps.push(line(npc, 'again_' + L.g));
    // small talk about the day, the season, the weather or the family, never the same twice running
    else if (n.met && Math.random() < 0.7) {
      const pool = ['chat_1', 'chat_2', 'chat_3', 'chat_' + season(), wet(S.wx) ? 'chat_rain' : null].filter(key => key && npc.lines[key] && key !== n.chat);
      if (pool.length) { n.chat = pool[Math.floor(Math.random() * pool.length)]; steps.push(line(npc, n.chat)); }
    }
  }
  if (npc.id === 'olia') tutEvent('olia');
  if (npc.id === 'olia') return talkOlia(npc, n, steps);
  if (npc.id === 'oksana') { steps[steps.length - 1].after = () => setTimeout(shop, 50); save(); return dialog(npc, steps); }
  const quest = id => ({ uk: D.payLine.uk.replace('%s', W[id].acc || W[id].uk), en: D.payLine.en.replace('%s', (MASS.includes(id) ? 'some ' : 'a ') + W[id].en).replace('a a', 'an a').replace('a o', 'an o').replace('a e', 'an e'), clip: `qp_${npc.id}_${id}`, hint: (stage() < 2 ? `<img src="${iconURL(id)}" style="width:34px;height:34px;vertical-align:middle" alt=""> ` : '') + sourceHint(id) });
  questsFit();
  if (n.q) {
    if ((S.bag[n.q] || 0) > 0) {
      const item = n.q;
      const thanks = line(npc, 'thanks');
      thanks.after = () => { toast('+6 💰  +1 ❤️'); blip(990, 0.15); const ne = ents.find(q => q.npc === npc.id); if (ne) { fxHearts(ne.x, ne.y - 1.3); fxBurst(ne.x, ne.y - 1, '💰'); } };
      S.bag[item]--; S.coins += 6; S.hearts++; n.q = null; n.last = { k: 'gift', item, day: S.clock.day }; useWord(item, true); hud(); setGuide(); save();
      const hand = mine('os');
      steps.push(hand, thanks);
    } else steps.push(quest(n.q));
  } else {
    n.k++;
    if (n.k % 2 === 0) {
      const how = line(npc, 'how');
      how.choices = ['dobre_diakuiu', 'chudovo', 'nepohano'].map(id => ({ uk: PH[id].uk, en: PH[id].en, clip: 'p_' + id }));
      steps.push(how, line(npc, 'good'));
    }
    // Ask for something whose word is new or due for review.
    const wants = npc.wants.slice().sort(() => Math.random() - 0.5).sort((a, b) => (isFresh(b) ? 1 : 0) - (isFresh(a) ? 1 : 0));
    const item = winter() ? (Math.random() < 0.6 ? 'drova' : wants.find(id => D.shop.food[id] || D.shop.veg[id]) || 'drova') : wants[0];
    n.q = item; learn(item); setGuide();
    steps.push(quest(item));
  }
  save();
  if (MG[npc.id] && !(S.cd['mg_' + npc.id] > now())) { const last = steps[steps.length - 1], f = last.after; last.after = () => { if (f) f(); setTimeout(() => mgInvite(npc), 350); }; }
  dialog(npc, steps);
}

// ------------------------------------------------------------------ the guide (gentle tutorial, then your errands)
const TUT = [
  { p: 'i_explore', ev: 'word', need: 5, en: 'Tap things around you to learn their names.' },
  { p: 'i_talk', ev: 'olia', en: 'Follow the road east to the other cottage, tap it and go in.' },
  { p: 'i_plant', ev: 'plant', en: 'Tap a garden bed beside your cottage.' },
  { p: 'i_water', ev: 'water', en: 'Tap the bed again. Each watering uses one 💧; refill at the well.' },
  { p: 'i_harvest', ev: 'harvest', en: 'Give it a moment, then tap the bed.' },
  { p: 'i_market', ev: 'buy', en: 'Find the striped stall at the top of the village road and buy something.' },
  { p: 'i_decor', ev: 'place', en: 'Go into your cottage and tap 🪑 Прикрасити (Decorate).' },
  { p: 'i_free', en: '' },
];
function tutEvent(ev) {
  // Remember things done early, so a later step that asks for them is already ticked.
  S.did = S.did || {}; S.did[ev] = 1;
  const s = TUT[S.tut];
  if (!s || s.ev !== ev) return;
  S.tutN++;
  if (S.tutN >= (s.need || 1)) {
    S.tut++; S.tutN = 0;
    while (TUT[S.tut].ev && !TUT[S.tut].need && S.did[TUT[S.tut].ev]) S.tut++;
    if (TUT[S.tut].p === 'i_decor' && !S.gift) { S.gift = 1; S.home.vazon = (S.home.vazon || 0) + 1; }
    hud();
    const next = TUT[S.tut].p;
    setTimeout(() => { toast(PH.molodets.uk); setGuide(); if (!sheetOpen()) say('p_molodets', 'p_' + next); }, 1700);
  }
  setGuide(); save();
}
// When the season turns, a request that can't be met now changes: a neighbour wanting summer flowers or a
// garden crop in winter asks for firewood, and Grandma asks for the next thing her (new) dish needs. Run
// before the goal line is drawn, so it never shows a request from the last season.
function questsFit() {
  // the garden steps of the first lessons can't be done under snow: move on to the market
  while (winter() && TUT[S.tut] && ['plant', 'water', 'harvest'].includes(TUT[S.tut].ev)) { S.tut++; S.tutN = 0; }
  for (const npc of D.npcs) {
    const n = S.npc[npc.id]; if (!n || !n.q) continue;
    if (npc.id === 'olia') { const R = curRecipe(); if (!R.needs.includes(n.q)) { const left = R.needs.filter(x => recipeHave(x) < NEED); n.q = left[0] || null; } continue; }
    if (winter() && (WINTER_GONE.has(n.q) || (D.shop.seeds[n.q] && !D.shop.veg[n.q])) && !(S.bag[n.q] > 0)) { n.q = 'drova'; learn('drova'); }
  }
}
let guideClip = '', guideEnOn = false, guideKey = '';
function setGuide() {
  questsFit();
  const g = $('#guide'), s = TUT[S.tut], st = stage();
  let uk, en, full;
  const active = D.npcs.filter(n => S.npc[n.id] && S.npc[n.id].q && !S.npc[n.id].mad);
  if (nightNow()) {   // night: the only goal is home to bed (and later, just get indoors)
    const late = (S.clock.nightT || 0) > 25;
    uk = late ? 'Додому! 🏠🐺' : PH.chas_spaty.uk + ' 🏠'; full = late ? 'It is very late. Time to get indoors!' : 'Time for bed. Go home and go to sleep.'; en = st < 3 ? full : ''; guideClip = 'p_chas_spaty';
  } else if (s.ev) {
    uk = PH[s.p].uk + (s.need ? ` ${S.tutN}/${s.need}` : '');
    full = `${PH[s.p].en} ${s.en}`; en = st < 3 ? full : '';
    guideClip = 'p_' + s.p;
  } else if (active.length) {
    const n = active[0], q = S.npc[n.id].q;
    const R = n.id === 'olia' ? curRecipe() : null;
    uk = R ? `${W[R.dish].uk} ${recipeTotal(R)}/${R.needs.length * NEED}: ${W[q].acc || W[q].uk}` : `${n.name}: ${W[q].acc || W[q].uk}${st < 2 && W[q].ic[0] !== '@' ? ' ' + W[q].ic : ''}`;
    full = R ? `Grandma Olia is making ${W[R.dish].en}. She needs ${W[q].en}.` : `${n.nameEn} will pay 6 hryvnias for ${W[q].en}.`; en = st < 2 ? full : '';
    guideClip = R ? `q_${n.id}_${q}` : `qp_${n.id}_${q}`;
  } else {
    uk = PH.i_free.uk; full = PH.i_free.en; en = st < 3 ? full : ''; guideClip = 'p_i_free';
  }
  // The 👁 always shows the English for the current goal; a new goal starts hidden again.
  const key = guideClip + '|' + uk;
  if (key !== guideKey) { guideKey = key; guideEnOn = false; }
  g.querySelector('.uk').textContent = uk;
  g.querySelector('.en').textContent = guideEnOn ? full : en;
  g.querySelector('.eye').classList.toggle('on', guideEnOn);
}
function hud() {
  for (const [id, txt] of [['#coins', devOn ? '💰 ∞' : `💰 ${S.coins}`], ['#hearts', `❤️ ${S.hearts}`], ['#water', `💧 ${S.bag.voda || 0}`]]) {
    const el = $(id); if (el.textContent === txt) continue;
    const first = !el.dataset.set; el.dataset.set = 1; el.textContent = txt;
    if (!first) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }   // the counter hops when it changes
  }
}
function bumpWater() { const w = $('#water'); w.classList.remove('bump'); void w.offsetWidth; w.classList.add('bump'); }

// ------------------------------------------------------------------ bag and word book
function bagSheet() {
  const cell = (k, n, badge) => `<button class="it" data-a="hearItem" data-v="${k}"><span class="q">${badge || ''}${n}</span><img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div>${known(k) < 2 ? `<div class="e">${W[k].en}</div>` : ''}</button>`;
  const a = Object.keys(S.bag).filter(k => S.bag[k] > 0).map(k => cell(k, S.bag[k]));
  const b = Object.keys(S.seeds).filter(k => S.seeds[k] > 0).map(k => cell(k, S.seeds[k], '🌱'));
  const c = [...Object.keys(S.home).filter(k => S.home[k] > 0).map(k => cell(k, S.home[k], '🏠')), ...Object.keys(S.gear).filter(k => S.gear[k]).map(k => cell(k, '', '🎣'))];
  const all = [...a, ...b, ...c];
  // Seeds carry the vegetable's own picture, so they get their own labelled shelf: a carrot seed packet
  // isn't a carrot Grandma forgot to take.
  const st = stage(), head = (ic, uk, en) => `<div style="text-align:left;font-weight:800;margin:10px 0 6px">${ic} ${uk}${st < 3 ? ` <small style="font-weight:600;color:var(--soft)">· ${en}</small>` : ''}</div>`;
  const shelves = (b.length || c.length)
    ? (a.length ? head('🧺', W.koshyk.uk, 'what you carry') + `<div class="grid">${a.join('')}</div>` : '')
      + (b.length ? head('🌱', W.nasinnia.uk, 'seeds to plant in your garden, not food') + `<div class="grid">${b.join('')}</div>` : '')
      + (c.length ? head('🏠', D.ui.decor[0], 'things for your cottage') + `<div class="grid">${c.join('')}</div>` : '')
    : `<div class="grid">${a.join('')}</div>`;
  learn('koshyk');
  openSheet(`<h3><span><span class="uk">${W.koshyk.uk}</span> ${stage() < 2 ? `<small>${W.koshyk.en}</small>` : ''}</span><span>💰 ${S.coins} ₴</span></h3>${all.length ? shelves : `<div class="muted">${D.ui.empty[0]}${stage() < 3 ? ' · ' + D.ui.empty[1] : ''}</div>`}`);
}
function wordsSheet() {
  const ids = Object.keys(S.words).sort((a, b) => S.words[a].l - S.words[b].l);
  const m = mastered(), st = stage();
  const title = ['', 'Гість · Guest', 'Сусід · Neighbour', 'Свій · One of us'][st];
  const goal = STAGES[st + 1], next = goal ? goal.words : D.words.length, day = (S.clock && S.clock.day) || 1;
  openSheet(`<h3><span><span class="uk">${D.ui.words[0]}</span> ${st < 3 ? `<small>${D.ui.words[1]}</small>` : ''}</span><small>🐈 ${catFriends()}/${D.cats.length} · ${ids.length} / ${D.words.length}</small></h3>
    <div style="font-weight:800">${title}</div>
    <div class="bar"><i style="width:${Math.min(100, Math.round(m / next * 100))}%"></i></div>
    ${st < 3 ? `<div class="muted" style="padding:0 0 10px;text-align:left">${m} well-known words · day ${day} (${W[season()].en}). With ${next} words${goal && day < goal.day ? ` and from day ${goal.day} (${st === 1 ? 'autumn' : 'your second summer'})` : ''}, ${st === 1 ? 'the villagers stop translating themselves' : 'the village goes fully Ukrainian'}.</div>` : ''}
    ${ids.length ? `<div class="grid">${ids.map(k => `<button class="it${W[k].verb ? ' verbit' : ''}" data-a="hearWord" data-v="${k}"><img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div><div class="e">${S.words[k].l < 3 ? W[k].en : '···'}</div><div class="lv">${'●'.repeat(S.words[k].l)}${'○'.repeat(5 - S.words[k].l)}</div></button>`).join('')}</div>` : `<div class="muted">${D.ui.empty[0]}</div>`}`);
}

// ------------------------------------------------------------------ inside the cottage
// A drawn room, wider than a phone screen: swipe left and right to look around. Everything has its own
// natural spot (stove in the corner, bed along the wall, chair tucked under the table, cup on the
// windowsill), so decorating is just: open Прикрасити, tap an item.
let mode = 'world', roomX = 0, tour = null;
// x: across the room (0 = left end, 1 = right end); y: down the screen (the wall meets the floor at 0.56);
// s: size as a share of the room's height scale; z: drawing order among floor things.
const DECOR = {
  // against the back wall, left to right
  pich: { x: 0.072, y: 0.578, s: 0.6, z: 1, hw: 0.85 }, hlechyk: { x: 0.356, y: 0.586, s: 0.3, z: 1.1, hw: 0.6 },   // the clay jug stands against the wall under the window, beside the bookshelf
  polytsia: { x: 0.43, y: 0.582, s: 0.55, z: 1, hw: 0.68 },
  lampa: { x: 0.6, y: 0.582, s: 0.56, z: 1, hw: 0.48 },
  kihtetochka: { x: 0.725, y: 0.58, s: 0.52, z: 1, hw: 0.9 },
  lizhko: { x: 0.905, y: 0.585, s: 0.58, z: 1, hw: 1.0 },
  // on the bookshelf: books on the middle shelf, a small plant on the top shelf, the mantel clock on top
  knyha: { shelf: 0.36, dx: -0.03, s: 0.21, z: 3 }, vazon: { shelf: 0.66, dx: 0.04, s: 0.2, z: 3 }, hodynnyk: { shelf: 0.96, dx: 0, s: 0.13, z: 3 },
  // middle of the room: rug, table, and the chair tucked in behind it
  kylym: { x: 0.82, y: 0.625, s: 1.25, z: 0, hw: 0.98, flat: true },
  stilets: { x: 0.41, y: 0.775, s: 0.29, z: 1.5, hw: 0.7 }, stil: { x: 0.44, y: 0.81, s: 0.4, z: 2, hw: 1.0 },
  // cat bed and toys on the floor near the cat tree
  lezhanka: { win: 0, y: 0.61, s: 0.3, z: 1.2 }, miachyk: { x: 0.68, y: 0.9, s: 0.12, z: 4 }, myshka: { x: 0.3, y: 0.9, s: 0.15, z: 4 },
  // walls: mirror between stove and window, painting centred between shelf and lamp, the рушник dressing the window
  dzerkalo: { x: 0.2, y: 0.37, s: 0.15, z: 0, wall: true, hw: 0.7 }, kartyna: { x: 0.528, y: 0.42, s: 0.2, z: 0, wall: true, hw: 0.95 },
  rushnyk: { win: 0, y: 0.37, s: 0.24, z: 1, wall: true, fit: true },
  // Ukrainian things: the didukh by the stove, a vyshyvanka and a bandura on the wall, the pysanka on the sill
  didukh: { x: 0.515, y: 0.585, s: 0.36, z: 1, hw: 0.4 },
  vyshyvanka: { x: 0.69, y: 0.39, s: 0.2, z: 0, wall: true, hw: 0.8 }, bandura: { x: 0.855, y: 0.38, s: 0.2, z: 0, wall: true, hw: 0.7 },
  tarilka: { x: 0.43, y: 0.262, s: 0.105, z: 0, wall: true, hw: 0.7 }, vinok: { x: 0.79, y: 0.37, s: 0.13, z: 0, wall: true, hw: 0.6 },
  motanka: { x: 0.958, y: 0.42, s: 0.15, z: 0, wall: true, hw: 0.5 },   // the motanka doll hangs on the wall above the bed
  skrynia: { x: 0.6, y: 0.74, s: 0.3, z: 1.6, hw: 0.8 },   // the painted chest (this line had slipped into the comment above, so it could be bought but never placed)
  pysanka: { sill: 0.17, s: 0.1, z: 2, wall: true },
  // on the windowsill
  kvity: { sill: 0, s: 0.13, z: 2, wall: true }, chashka: { sill: -0.1, s: 0.09, z: 2, wall: true }, svichka: { sill: 0.1, s: 0.11, z: 2, wall: true },
};
const WIN_X = 0.3;                                    // the window, across the room
const roomU = () => Math.min(cv.width, cv.height * 0.72);
const roomW = () => Math.max(cv.width, roomU() * (mode === 'mill' ? 2.75 : mode === 'church' ? 3.0 : 3.4));   // the mill is a snug tower: just room for the machine // a phone in portrait sees under half the room at once
const panMax = () => Math.max(0, roomW() - cv.width);
// Your cottage and Grandma's have a strip of room left of x = 0, with the door out, so the view can pan to -roomPL().
const roomPL = () => mode === 'home' || mode === 'olia' ? roomU() * 0.5 : 0;
const clampPan = () => { roomX = Math.max(-roomPL(), Math.min(panMax(), roomX)); };
// The door out (like the mill's): open to the day, light falling in across the floor. Returns its tap box.
function roomDoor(c, t, base) {
  const u = roomU(), dx = -roomPL() + u * 0.24, dw = u * 0.22, top = base - u * 0.42, h = cv.height;
  c.fillStyle = '#5a381b'; rr(c, dx - dw / 2 - u * 0.025, top - u * 0.025, dw + u * 0.05, base - top + u * 0.025, u * 0.02);
  c.save(); c.beginPath(); c.rect(dx - dw / 2, top, dw, base - top); c.clip(); windowView(c, dx - dw / 2, top, dw, base - top, t, 2, 1, true); c.restore();
  c.fillStyle = '#7a4e26'; c.save(); c.beginPath(); c.moveTo(dx - dw / 2, top); c.lineTo(dx - dw / 2 - u * 0.07, top + u * 0.03); c.lineTo(dx - dw / 2 - u * 0.07, base + u * 0.02); c.lineTo(dx - dw / 2, base); c.closePath(); c.fill(); c.restore();   // the door itself, swung open
  c.fillStyle = '#e0a93b'; circ(c, dx - dw / 2 - u * 0.055, (top + base) / 2 + u * 0.02, u * 0.01);
  const L = skyLight(S.clock.t), wxL = S.wx === 'sun' ? 1 : S.wx === 'cloud' ? 0.6 : 0.35; c.fillStyle = `rgba(255,236,190,${0.16 * wxL * (1 - L.dark)})`; poly(c, [[dx - dw / 2, base], [dx + dw / 2, base], [dx + dw * 1.3, h], [dx - dw * 0.3, h]]);
  return { x: dx - dw / 2 - u * 0.07, y: top, w: dw + u * 0.07, h: base - top + u * 0.05, cx: dx };
}
// Cat things you can own more than one of: a cat bed for every cat, and a few of each toy.
const MULTI = { lezhanka: 1, miachyk: 3, myshka: 3, kihtetochka: 2 };   // one cat bed: the other cats sleep on the cat trees, the bed and the stove
// Where the second, third… of each stands (the first uses its DECOR spot): x across the room, y down the screen.
const MORE_AT = {
  kihtetochka: [[0.185, 0.585]],   // the second one: against the back wall beside the stove
  lezhanka: [[0.3, 0.87], [0.55, 0.69], [0.8, 0.87], [0.975, 0.76], [0.34, 0.7], [0.63, 0.86], [0.23, 0.69]],
  miachyk: [[0.9, 0.88], [0.16, 0.88]],
  myshka: [[0.5, 0.88], [0.76, 0.71]],
};
const nPlaced = id => +S.decor[id] || 0;
const BASICS = Object.keys(D.shop.furnished);          // always in the room
const inRoom = () => [...BASICS, ...Object.keys(S.decor).filter(id => DECOR[id] && !BASICS.includes(id))];
// Everything in the room, one entry per piece (two cat beds are two entries), in drawing order.
const itemZ = ({ id, k }) => (DECOR[id].wall ? 0 : 10) + (k && MORE_AT[id][k - 1][1] > 0.85 ? 4 : DECOR[id].z);
const roomItems = () => inRoom().flatMap(id => Array.from({ length: MULTI[id] ? nPlaced(id) : 1 }, (_, k) => ({ id, k }))).sort((a, b) => itemZ(a) - itemZ(b) || decorRect(a.id, a.k).by - decorRect(b.id, b.k).by);
// Where an item stands, in room pixels (bottom-centre) plus its tap box.
function decorRect(id, k = 0) {
  const m = k && MORE_AT[id] && MORE_AT[id][k - 1];
  const d = m ? { ...DECOR[id], win: undefined, x: m[0], y: m[1] } : DECOR[id], u = roomU(), RW = roomW(), sz = d.s * u;
  let x = (d.x ?? WIN_X) * RW, y = d.y * cv.height;
  if (d.win !== undefined) x = WIN_X * RW;
  if (d.fit) { const ww = u * 0.3, wt = cv.height * 0.27, wb = cv.height * 0.45; return { x: x - ww * 0.65, y: wt - u * 0.05, w: ww * 1.3, h: (wb - wt) * 0.85, cx: x, by: wb, sz: ww }; }
  if (d.sill !== undefined) { x = WIN_X * RW + d.sill * u; y = cv.height * 0.462; }
  // On the bookshelf: shelf boards stand at these fractions of its height.
  if (d.shelf !== undefined) { const b = DECOR.polytsia; x = b.x * RW + d.dx * b.s * u; y = b.y * cv.height - d.shelf * b.s * u; }
  if (d.on) { const b = DECOR[d.on]; x = b.x * RW + d.dx * b.s * u; y = b.y * cv.height - 0.54 * b.s * u + 1; }
  const hw = sz * (d.hw || 1.1), hh = d.hh || 1.05;
  if (d.flat) return { x: x - hw / 2, y: y - sz * 0.02, w: hw, h: sz * 0.3, cx: x, by: y, sz };   // the rug lies flat, below its line
  return { x: x - hw / 2, y: y - sz * hh, w: hw, h: sz * (hh + 0.05), cx: x, by: y, sz };
}
// Going in and out of the cottage fades through cream, so the scene never just snaps.
function fadeThen(fn) { const f = $('#fade'); f.classList.add('on'); setTimeout(() => { fn(); setTimeout(() => f.classList.remove('on'), 60); }, 210); }
function enterHome() { closeSheet(); fadeThen(enterHomeNow); }
function exitHome() { fadeThen(exitHomeNow); }
function enterHomeNow() {
  mode = 'home';
  let cameHome = false;
  for (const ct of D.cats) if (S.cats[ct.id] === 'f') { S.cats[ct.id] = 1; cameHome = true; const i = ents.findIndex(q => q.cat === ct.id); if (i >= 0) ents.splice(i, 1); save(); }
  if (cameHome && !S.catHomeTip) { S.catHomeTip = 1; save(); setTimeout(() => { if (mode === 'home') toast('🐈 Котики живуть у твоїй хаті!' + (stage() < 3 ? ' · Cats you befriend live in your cottage. Come home to see them!' : ''), 6500); }, 900); }   // the first cat brought home: a tip, not voiced
  pickHomeCats();
  $('#exit').innerHTML = lab('exit'); $('#decorBtn').innerHTML = '🪑 ' + lab('decor'); $('#decorBtn').style.display = ''; $('#wardBtn').innerHTML = '👗 ' + lab('wardrobe'); $('#wardBtn').style.display = ''; $('#homebar').style.display = 'flex';
  const mid = DECOR.stil.x * roomW() - cv.width / 2;
  roomX = mid; clampPan(); inStart(DECOR.stil.x + 0.06);
  // The first few times in, the view glides from one end of the room to the other and settles at the table,
  // so it's clear there's more to see. Touching the screen stops it.
  if (S.clock.t >= 0.8) { bed = { t0: null, done: {} }; $('#homebar').style.display = 'none'; }   // night: feed the cats and go to bed
  else if (panMax() > 10 && (S.tours || 0) < 3) { S.tours = (S.tours || 0) + 1; save(); roomX = -roomPL(); tour = { t0: nowT, mid }; }
  blip(520);
}
function exitHomeNow() { oliaTip = 0; tour = null; mode = 'world'; $('#homebar').style.display = 'none'; blip(440); }
let homeDoor = null;
function homeTap(sx, py) {
  if (bed) { bed.tap = true; return; }
  const px = sx + roomX, [ba] = inBand();
  if (homeDoor && px >= homeDoor.x && px <= homeDoor.x + homeDoor.w && py >= homeDoor.y && py <= homeDoor.y + homeDoor.h) { blip(700, 0.05); return inGo(homeDoor.cx, ba, exitHome); }
  const friends = homeCats().map(h => h.ct);
  for (let i = 0; i < friends.length; i++) { const p = catSpot(i); if (Math.abs(px - p.x) < p.s * 0.45 && py < p.y && py > p.y - p.s * 1.05) return inGo(p.x, p.y, () => wordCard(friends[i].word, { note: `❤️ ${friends[i].name}` })); }
  let best = null, bestR = null, bestScore = -1e9;
  for (const it of roomItems()) {
    const r = decorRect(it.id, it.k);
    if (!(px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)) continue;
    const score = itemZ(it) * 1e4 - Math.abs(px - r.cx);
    if (score > bestScore) { bestScore = score; best = it.id; bestR = r; }
  }
  if (best) { const id = best, D0 = DECOR[id]; return inGo(bestR.cx, D0.wall || D0.on || D0.shelf !== undefined ? ba : bestR.by, () => wordCard(id, BASICS.includes(id) ? {} : { acts: [{ k: 'putaway', fn: () => { A.decor(id); closeSheet(); } }] })); }
  if (py > cv.height * 0.58) inWalkTo(px, py);   // the floor: walk there
}
// Every cat you've brought home lives here, and they're busy. One bats the towel hanging off the table (or a
// toy, once you have one), one sleeps in the middle of your bed (or a cat bed), one washes itself on the
// windowsill (or up on the cat tree). The rest take the other cat beds and toys, curl up on the warm stove,
// and any left over sit about or nap on the floor.
const BED_CAT = [-0.06, 0.33];   // where on the bed the sleeper lies (the middle), as a share of the bed's size
const STOVE_CAT = [0.33, 0.825];  // the sleeper on top of the stove, as a share of the stove's size
// The toy a cat is batting gets knocked a little each swat.
const toyNudge = t => -Math.max(0, Math.sin(t * 4 - 0.5)) * roomU() * 0.02;
// The towel hanging off the table swings when the cat bats it (in the table drawing's own units).
const towelSwing = t => -Math.max(0, Math.sin(t * 4 - 0.4)) * 7 + Math.sin(t * 1.3) * 0.8;
let homeList = null;
const houseCats = () => D.cats.filter(ct => S.cats[ct.id] === 1);
function pickHomeCats() {
  const f = houseCats();
  for (let i = f.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [f[i], f[j]] = [f[j], f[i]]; }
  homeList = f.map(ct => ({ ct }));
}
function homeCats() {
  if (!homeList || homeList.length !== houseCats().length || homeList.some(h => S.cats[h.ct.id] !== 1)) pickHomeCats();
  return homeList;
}
// Free floor spots for any cats left over (x across the room, y down the screen); every other one naps.
const FLOOR_SPOTS = [[0.57, 0.87], [0.25, 0.86], [0.84, 0.88], [0.12, 0.8], [0.7, 0.8], [0.36, 0.86], [0.95, 0.88], [0.47, 0.67]];
function homeSpots() {
  const u = roomU(), h = cv.height, toys = [], beds = [];
  for (const id of ['miachyk', 'myshka']) for (let k = 0; k < nPlaced(id); k++) toys.push([id, k]);
  for (let k = 0; k < nPlaced('lezhanka'); k++) beds.push(k);
  const towel = () => { const r = decorRect('stil'); return { kind: 'towel', x: r.cx + u * 0.055, y: h * 0.885, s: u * 0.25, towel: true }; };
  const toy = ([id, k]) => { const r = decorRect(id, k); return { kind: 'play', x: r.cx + u * 0.12, y: r.by, s: u * 0.22, play: true, toy: id + k }; };
  const catBed = k => { const r = decorRect('lezhanka', k); return { kind: 'sleep', x: r.cx + r.sz * 0.05, y: r.by - r.sz * 0.08, s: u * 0.3, sleep: true }; };
  const bed = () => { const r = decorRect('lizhko'); return { kind: 'sleep', x: r.cx + r.sz * BED_CAT[0], y: r.by - r.sz * BED_CAT[1], s: u * 0.2, sleep: true }; };
  const tree = () => { const r = decorRect('kihtetochka'); return { kind: 'groom', x: r.cx - r.sz * 0.1, y: r.by - r.sz * 0.9, s: u * 0.16, groom: true }; };
  const sill = () => ({ kind: 'groom', x: WIN_X * roomW() - u * 0.06, y: h * 0.462, s: u * 0.15, groom: true });
  const stove = () => { const r = decorRect('pich'); return { kind: 'sleep', x: r.cx + r.sz * STOVE_CAT[0], y: r.by - r.sz * STOVE_CAT[1], s: u * 0.17, sleep: true }; };
  const hasTree = !!S.decor.kihtetochka, hadToy = toys.length > 0, hadBed = beds.length > 0;
  const out = [toys.length ? toy(toys.shift()) : towel(), beds.length ? catBed(beds.shift()) : bed(), hasTree ? tree() : sill()];
  if (hasTree) out.push(sill());
  if (nPlaced('kihtetochka') > 1) { const r = decorRect('kihtetochka', 1); out.push({ kind: 'groom', x: r.cx + r.sz * 0.1, y: r.by - r.sz * 0.9, s: u * 0.16, groom: true }); }
  // more sleeping spots for a big family: a second place on the bed, and the box top of each cat tree
  const bed2 = () => { const r = decorRect('lizhko'); return { kind: 'sleep', x: r.cx + r.sz * (BED_CAT[0] + 0.24), y: r.by - r.sz * BED_CAT[1], s: u * 0.19, sleep: true }; };
  const treeBox = k => { const r = decorRect('kihtetochka', k), sg = k ? -1 : 1; return { kind: 'sleep', x: r.cx + sg * r.sz * 0.21, y: r.by - r.sz * 0.33, s: u * 0.14, sleep: true }; };
  const sleepers = [...(hadBed ? [bed()] : []), bed2(), ...(hasTree ? [treeBox(0)] : []), ...(nPlaced('kihtetochka') > 1 ? [treeBox(1)] : []), ...beds.map(catBed), stove()], players = toys.map(toy);
  while (sleepers.length || players.length) { if (players.length) out.push(players.shift()); if (sleepers.length) out.push(sleepers.shift()); }
  if (hadToy) out.push(towel());
  FLOOR_SPOTS.forEach(([fx, fy], i) => out.push(i % 2 ? { kind: 'sleep', x: fx * roomW(), y: fy * h, s: u * 0.27, sleep: true } : { kind: 'sit', x: fx * roomW(), y: fy * h, s: u * 0.25 }));
  return out;
}
function catSpot(i) { const sp = homeSpots(); return sp[i] || sp[sp.length - 1]; }
function decorSheet() {
  const ids = Object.keys(DECOR).filter(id => !BASICS.includes(id) && S.home[id] > 0 && (MULTI[id] || !S.decor[id]));
  const placedAny = Object.keys(S.decor).some(id => DECOR[id] && !BASICS.includes(id));
  const st = stage();
  openSheet(`<h3><span><span class="uk">${D.ui.decor[0]}</span> ${st < 3 ? `<small>${D.ui.decor[1]}</small>` : ''}</span><span>💰 ${S.coins} ₴</span></h3>` +
    (ids.length
      ? `${st < 3 ? '<div class="muted" style="padding:0 0 10px">Tap something to put it in your cottage. To put something away, tap it in the room.</div>' : ''}<div class="grid">${ids.map(id => `<button class="it" data-a="place" data-v="${id}">${S.home[id] > 1 ? `<span class="q">${S.home[id]}</span>` : ''}<img src="${iconURL(id)}" alt=""><div class="n">${W[id].uk}</div>${known(id) < 2 ? `<div class="e">${W[id].en}</div>` : ''}</button>`).join('')}</div>`
      : placedAny
        ? `<div class="muted">✨ ${D.ui.allin[0]}${st < 3 ? `<br>${D.ui.allin[1]}` : ''}</div>`
        : `<div class="muted">🏠 ${D.ui.empty[0]}.<br>${st < 3 ? 'Buy lovely things at the market, in the «Для хати» (For the cottage) and «Для котів» (For the cats) tabs.' : 'Купи щось на ринку: «Для хати», «Для котів».'}</div>`) +
    `<div class="row">${btn('close', '', lab('close'), 'ghost')}</div>`);
}
// The embroidered рушник dressed over the window like a curtain: a rod a little wider than the window,
// a swag across the top, and an embroidered end hanging down each side to most of the window's height.
function windowRushnyk(c, wx, ww, wt, wb, u) {
  const H = wb - wt, half = ww * 0.62, end = ww * 0.16, rodY = wt - u * 0.03, red = '#d43a3a', linen = '#fffdf5';
  c.fillStyle = '#8a5a2b'; rr(c, wx - half - u * 0.02, rodY - u * 0.008, half * 2 + u * 0.04, u * 0.016, u * 0.008);
  c.fillStyle = '#6b4422'; circ(c, wx - half - u * 0.02, rodY, u * 0.012); circ(c, wx + half + u * 0.02, rodY, u * 0.012);
  // swag
  c.fillStyle = linen; c.beginPath(); c.moveTo(wx - half, rodY); c.lineTo(wx + half, rodY); c.lineTo(wx + half, wt + H * 0.12);
  c.quadraticCurveTo(wx, wt + H * 0.34, wx - half, wt + H * 0.12); c.closePath(); c.fill();
  c.strokeStyle = red; c.lineWidth = u * 0.012; c.beginPath(); c.moveTo(wx - half, wt + H * 0.07); c.quadraticCurveTo(wx, wt + H * 0.27, wx + half, wt + H * 0.07); c.stroke();
  c.strokeStyle = '#2d2d2d'; c.lineWidth = u * 0.004; c.setLineDash([u * 0.01, u * 0.012]); c.beginPath(); c.moveTo(wx - half, wt + H * 0.105); c.quadraticCurveTo(wx, wt + H * 0.305, wx + half, wt + H * 0.105); c.stroke(); c.setLineDash([]);
  // hanging ends
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? wx - half : wx + half - end, y1 = wt + H * 0.82;
    c.fillStyle = linen; c.fillRect(x0, rodY, end, y1 - rodY);
    c.fillStyle = red; c.fillRect(x0, y1 - H * 0.2, end, H * 0.045); c.fillRect(x0, y1 - H * 0.08, end, H * 0.03);
    c.fillStyle = '#2d2d2d'; c.fillRect(x0, y1 - H * 0.135, end, H * 0.012);
    c.fillStyle = red; const cx = x0 + end / 2, cy = y1 - H * 0.32, d = end * 0.32; poly(c, [[cx, cy - d], [cx + d, cy], [cx, cy + d], [cx - d, cy]]);
    c.strokeStyle = '#e8dcc6'; c.lineWidth = 1; for (let x = x0 + 2; x < x0 + end; x += 3) { c.beginPath(); c.moveTo(x, y1); c.lineTo(x, y1 + H * 0.05); c.stroke(); }
  }
}
// A cat curled up asleep: body in a loaf, tail wrapped round the front, head resting with eyes closed,
// slow breathing, and little z's drifting up.
function sleepingCat(c, x, y, s, C, t) {
  const k = s / 100, breathe = 1 + Math.sin(t * 1.6) * 0.035;
  c.save(); c.translate(x, y); c.scale(k, k);
  c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 3.2;
  c.save(); c.scale(1, breathe);
  c.fillStyle = C.body; c.beginPath(); c.ellipse(4, -20, 36, 20, 0, 0, 7); c.fill();
  c.save(); c.clip(); for (const [dx, dy, r, col] of C.pb) { c.fillStyle = C[col]; circ(c, dx * 1.1 + 6, dy * 0.5, r * 1.1); }
  if (C.stripes) { c.strokeStyle = C.stripes; c.lineWidth = 5; for (let i = 0; i < 4; i++) { const sx = -6 + i * 11; c.beginPath(); c.moveTo(sx, -42); c.quadraticCurveTo(sx + 5, -32, sx + 2, -24); c.stroke(); } c.strokeStyle = INK; c.lineWidth = 3.2; }
  if (C.bib) { c.fillStyle = '#ffffff'; ell(c, -8, -6, 15, 9); }
  c.restore();
  c.beginPath(); c.ellipse(4, -20, 36, 20, 0, 0, 7); c.stroke();
  c.restore();
  // tail around the front
  c.beginPath(); c.moveTo(38, -14); c.quadraticCurveTo(30, 4, -2, 0); c.quadraticCurveTo(-22, -2, -30, -8);
  c.lineWidth = 11; c.strokeStyle = INK; c.stroke(); c.lineWidth = 7; c.strokeStyle = C.tail; c.stroke();
  c.lineWidth = 3.2; c.strokeStyle = INK;
  // head resting at the front left
  for (const dir of [-1, 1]) {
    c.fillStyle = dir > 0 && C.earR !== 'body' ? C[C.earR] : C.body;
    c.beginPath(); c.moveTo(-24 + dir * 6, -36); c.lineTo(-24 + dir * 12, -51); c.lineTo(-24 + dir * 16, -32); c.closePath(); c.fill(); c.stroke();
  }
  c.fillStyle = C.body; c.beginPath(); c.ellipse(-24, -24, 17, 15, 0, 0, 7); c.fill();
  c.save(); c.clip(); for (const [dx, dy, r, col] of C.ph) { c.fillStyle = C[col]; circ(c, -24 + dx * 0.7, -24 + (dy + 70) * 0.7, r * 0.75); } if (C.bib) { c.fillStyle = '#ffffff'; ell(c, -24, -18, 9, 6.5); } c.restore();
  c.beginPath(); c.ellipse(-24, -24, 17, 15, 0, 0, 7); c.stroke();
  c.lineWidth = 2.2; for (const ex of [-30, -18]) { c.beginPath(); c.arc(ex, -26, 3.6, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); }
  c.fillStyle = '#e8708a'; poly(c, [[-26, -20], [-22, -20], [-24, -18]]);
  c.fillStyle = '#f08aa0'; circ(c, -35, -20, 2.4); circ(c, -13, -20, 2.4);
  // z z z
  c.fillStyle = INK; c.font = '900 14px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let i = 0; i < 3; i++) {
    const ph = ((t * 0.45) + i / 3) % 1;
    c.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
    c.font = `900 ${10 + ph * 10}px system-ui, sans-serif`;
    c.fillText('z', -8 + ph * 20 + Math.sin(ph * 6) * 3, -50 - ph * 40);
  }
  c.globalAlpha = 1;
  c.restore();
}
let bed = null;
// Bedtime, in four parts (about twelve seconds; tap to hurry the morning along):
//   1. indoors, the cats' supper (and in winter the stove, lit or cold),
//   2. the valley at night: the moon up, stars, the village windows going dark one by one, «Добраніч!»,
//   3. the night passing: the moon sets, the sky goes pink, the sun climbs over the hills,
//   4. morning: «Доброго ранку!», the day's weather on a little card (and a new season's banner), then
//      back into the cottage.
function bedText(c, uk, en, y, a) {
  if (!(a > 0)) return;   // canvas ignores a negative alpha, so a faded-out line would come back at full strength
  a = Math.min(1, a);
  const u = roomU(); let size = Math.round(u * 0.085);
  c.save(); c.globalAlpha = a; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.font = cozyFont(size); { const tw = c.measureText(uk).width; if (tw > cv.width * 0.9) { size = Math.floor(size * cv.width * 0.9 / tw); c.font = cozyFont(size); } }   // long lines shrink to fit the screen
  c.strokeStyle = INK; c.lineWidth = size * 0.2; c.strokeText(uk, cv.width / 2, y); c.fillStyle = '#fff8ea'; c.fillText(uk, cv.width / 2, y);
  if (en && stage() < 3) { c.font = `700 ${Math.round(size * 0.42)}px system-ui, sans-serif`; c.lineWidth = size * 0.1; c.strokeText(en, cv.width / 2, y + size * 0.75); c.fillText(en, cv.width / 2, y + size * 0.75); }
  c.restore();
}
// A soft card for the morning's weather: rounded, glassy, an icon, the word and its English.
function bedCard(c, x, y, ic, uk, en, a, u) {
  if (!(a > 0)) return; a = Math.min(1, a);
  const W0 = u * 0.62, H0 = u * 0.2, s = 0.9 + 0.1 * Math.min(1, a * 1.2);
  c.save(); c.globalAlpha = a; c.translate(x, y); c.scale(s, s);
  c.fillStyle = 'rgba(0,0,0,.18)'; rr(c, -W0 / 2 + 4, -H0 / 2 + 6, W0, H0, H0 * 0.3);
  c.fillStyle = 'rgba(255,250,238,.92)'; rr(c, -W0 / 2, -H0 / 2, W0, H0, H0 * 0.3);
  c.strokeStyle = 'rgba(212,58,58,.5)'; c.lineWidth = 2; c.setLineDash([6, 5]); c.beginPath(); c.roundRect ? c.roundRect(-W0 / 2 + 7, -H0 / 2 + 7, W0 - 14, H0 - 14, H0 * 0.24) : c.rect(-W0 / 2 + 7, -H0 / 2 + 7, W0 - 14, H0 - 14); c.stroke(); c.setLineDash([]);
  drawIcon(c, ic, -W0 * 0.3, H0 * 0.3, H0 * 0.62);
  c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillStyle = INK; c.font = cozyFont(Math.round(H0 * 0.34)); c.fillText(uk, -W0 * 0.12, en && stage() < 3 ? -H0 * 0.1 : 0);
  if (en && stage() < 3) { c.fillStyle = '#8a7566'; c.font = `700 ${Math.round(H0 * 0.18)}px system-ui, sans-serif`; c.fillText(en, -W0 * 0.12, H0 * 0.22); }
  c.restore();
}
// The valley from the cottage window, from night (p = 0) through dawn to morning (p = 1).
const BED_WIN = Array.from({ length: 9 }, (_, i) => ({ x: 0.08 + i * 0.105 + ((i * 37) % 7) * 0.006, off: 0.4 + ((i * 53) % 9) * 0.28 }));
function bedValley(c, w, h, p, t, nightA, wx) {
  const mix = (A, B, q) => { const a = parseInt(A.slice(1), 16), b = parseInt(B.slice(1), 16), r = (s) => Math.round(((a >> s) & 255) + ((((b >> s) & 255) - ((a >> s) & 255)) * q)); return `rgb(${r(16)},${r(8)},${r(0)})`; };
  const key = (stops) => { for (let i = 1; i < stops.length; i++) if (p <= stops[i][0]) { const [p0, A] = stops[i - 1], [p1, B] = stops[i]; return mix(A, B, (p - p0) / (p1 - p0)); } return stops[stops.length - 1][1]; };
  const top = key([[0, '#070b24'], [0.45, '#2a2d66'], [0.62, '#7a6aa8'], [0.8, '#8fc8ef'], [1, '#8fd3f4']]);
  const low = key([[0, '#1d2552'], [0.45, '#5a4a86'], [0.62, '#f29a7a'], [0.8, '#ffd9a0'], [1, '#fdf1d6']]);
  const sea = season(), dim = Math.max(0, 1 - p * 1.25);
  let g = c.createLinearGradient(0, 0, 0, h * 0.72); g.addColorStop(0, top); g.addColorStop(1, low); c.fillStyle = g; c.fillRect(0, 0, w, h);
  // stars, twinkling, gone by morning; now and then a shooting star
  if (dim > 0) { for (const [dx, dy, dr] of DOTS) { c.globalAlpha = dim * (0.35 + 0.65 * Math.abs(Math.sin(t * 1.2 + dx * 30))); c.fillStyle = '#fff'; circ(c, dx * w, dy * h * 0.55, 0.8 + dr * 1.8); } c.globalAlpha = 1;
    const sq = (t * 0.35) % 1; if (sq < 0.18 && p < 0.4) { const q = sq / 0.18, sx = w * (0.2 + q * 0.4), sy = h * (0.08 + q * 0.12); c.strokeStyle = `rgba(255,255,255,${1 - q})`; c.lineWidth = 2; c.beginPath(); c.moveTo(sx, sy); c.lineTo(sx - w * 0.08, sy - h * 0.04); c.stroke(); } }
  // the moon goes down the sky as the night passes; the sun comes up over the hills
  const mq = Math.min(1, p / 0.6), mx = w * (0.25 + mq * 0.55), my = h * (0.22 + Math.pow(mq, 1.6) * 0.42);
  if (p < 0.7) { const mg2 = c.createRadialGradient(mx, my, 0, mx, my, w * 0.2); mg2.addColorStop(0, `rgba(255,248,214,${0.35 * dim})`); mg2.addColorStop(1, 'rgba(255,248,214,0)'); c.fillStyle = mg2; c.fillRect(mx - w * 0.2, my - w * 0.2, w * 0.4, w * 0.4);
    c.fillStyle = '#fff6d8'; const mr = Math.min(w, h) * 0.07; circ(c, mx, my, mr); c.fillStyle = top; circ(c, mx + mr * 0.45, my - mr * 0.22, mr * 0.9); }   // a crescent
  const sq2 = Math.max(0, (p - 0.5) / 0.5), sx2 = w * 0.62, sy2 = h * (0.66 - sq2 * 0.42);
  if (sq2 > 0) { const sg = c.createRadialGradient(sx2, sy2, 0, sx2, sy2, w * 0.45); sg.addColorStop(0, 'rgba(255,214,120,.65)'); sg.addColorStop(1, 'rgba(255,214,120,0)'); c.fillStyle = sg; c.fillRect(0, 0, w, h);
    c.save(); c.translate(sx2, sy2); c.rotate(t * 0.15); c.fillStyle = 'rgba(255,230,150,.35)'; for (let i = 0; i < 12; i++) { c.rotate(Math.PI / 6); poly(c, [[w * 0.07, -w * 0.012], [w * 0.16, 0], [w * 0.07, w * 0.012]]); } c.restore();
    const sr = Math.min(w, h) * 0.09; c.fillStyle = '#ffd23f'; circ(c, sx2, sy2, sr); c.fillStyle = '#ffe98a'; circ(c, sx2 - sr * 0.2, sy2 - sr * 0.2, sr * 0.62); }
  // clouds for a cloudy or rainy morning
  if (p > 0.6 && (wx === 'cloud' || wet(wx) || wx === 'fog')) { c.globalAlpha = Math.min(1, (p - 0.6) * 3); c.fillStyle = wet(wx) ? '#9aa7b8' : '#ffffff'; for (const [cx, cy, s] of [[0.2, 0.15, 1], [0.6, 0.1, 1.3], [0.85, 0.2, 0.9]]) { const x = (cx * w + t * 12) % (w * 1.2) - w * 0.1; ell(c, x, cy * h, w * 0.12 * s, h * 0.035 * s); ell(c, x + w * 0.06 * s, cy * h - h * 0.025 * s, w * 0.08 * s, h * 0.035 * s); ell(c, x - w * 0.06 * s, cy * h - h * 0.012 * s, w * 0.06 * s, h * 0.03 * s); } c.globalAlpha = 1; }
  // three rolling hills, the far ones paler; the near meadow by the season
  const GRASS = { lito: ['#7fc25a', '#5a9c3d'], vesna: ['#8fd46a', '#63ad44'], osin: ['#d9a64a', '#a87a2f'], zyma: ['#eef3fa', '#cfdcee'] }[sea];
  const shade = (col, k2) => mix(col, '#0e1330', k2);
  const hill = (y0, amp, ph, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, h); for (let i = 0; i <= 24; i++) { const x = i / 24 * w; c.lineTo(x, h * y0 - Math.sin(i / 24 * Math.PI * 2 + ph) * h * amp - Math.sin(i / 24 * Math.PI * 5 + ph * 2) * h * amp * 0.3); } c.lineTo(w, h); c.fill(); };
  hill(0.62, 0.03, 1.2, shade(sea === 'zyma' ? '#dfe8f4' : '#9cc6a0', 0.75 * dim + 0.1));
  // the village on the middle hill: cottages and the church, windows lit until each one's bedtime
  hill(0.7, 0.025, 2.6, shade(sea === 'zyma' ? '#e6edf7' : GRASS[0], 0.7 * dim + 0.05));
  for (const [i, Wn] of BED_WIN.entries()) {
    const x = Wn.x * w, y = h * 0.69 - Math.sin(Wn.x * Math.PI * 2 + 2.6) * h * 0.025, s = Math.min(w, h) * (0.07 + (i % 3) * 0.012), wall = shade('#f4efe2', 0.65 * dim), roof = shade(sea === 'zyma' ? '#ffffff' : '#c9a86a', 0.65 * dim);
    if (i === 4) {   // the church, with its domes
      c.fillStyle = wall; c.fillRect(x - s * 0.5, y - s * 1.2, s, s * 1.2); c.fillStyle = shade('#3f8a3a', 0.6 * dim); ell(c, x, y - s * 1.35, s * 0.32, s * 0.32); poly(c, [[x - s * 0.18, y - s * 1.55], [x, y - s * 1.9], [x + s * 0.18, y - s * 1.55]]);
      c.strokeStyle = shade('#e8c35a', 0.5 * dim); c.lineWidth = 2; c.beginPath(); c.moveTo(x, y - s * 1.9); c.lineTo(x, y - s * 2.15); c.moveTo(x - s * 0.08, y - s * 2.06); c.lineTo(x + s * 0.08, y - s * 2.06); c.stroke();
    } else {
      c.fillStyle = wall; c.fillRect(x - s * 0.5, y - s * 0.6, s, s * 0.6); c.fillStyle = roof; poly(c, [[x - s * 0.62, y - s * 0.58], [x, y - s * 1.05], [x + s * 0.62, y - s * 0.58]]);
      if (p > 0.55 || i % 2) { c.fillStyle = `rgba(230,230,240,${0.35})`; for (let q = 0; q < 3; q++) { const f = (t * 0.25 + q / 3 + i * 0.1) % 1; circ(c, x + s * 0.3 + Math.sin(f * 5 + i) * 3, y - s * 1 - f * s * 1.2, s * (0.08 + f * 0.12)); } }   // chimney smoke
    }
    const lit = nightA < Wn.off && p < 0.5;   // windows go dark one by one as the village goes to bed
    c.fillStyle = lit ? '#ffd27a' : shade('#7a8aa0', 0.6 * dim); c.fillRect(x - s * 0.15, y - s * 0.42, s * 0.3, s * 0.24);
    if (lit) { const gl = c.createRadialGradient(x, y - s * 0.3, 0, x, y - s * 0.3, s * 0.8); gl.addColorStop(0, 'rgba(255,200,110,.35)'); gl.addColorStop(1, 'rgba(255,200,110,0)'); c.fillStyle = gl; c.fillRect(x - s, y - s * 1.1, s * 2, s * 1.6); }
  }
  hill(0.83, 0.02, 4.1, shade(GRASS[0], 0.72 * dim));
  g = c.createLinearGradient(0, h * 0.8, 0, h); g.addColorStop(0, shade(GRASS[0], 0.72 * dim)); g.addColorStop(1, shade(GRASS[1], 0.72 * dim)); c.fillStyle = g; c.fillRect(0, h * 0.86, w, h * 0.14);
  // sunflowers along the near fence in summer (heads up once the sun's out)
  if (sea === 'lito' || sea === 'osin') for (let i = 0; i < 7; i++) { const x = w * (0.06 + i * 0.14), y = h * 0.9, up = Math.min(1, Math.max(0, (p - 0.5) * 2)); c.strokeStyle = shade('#4f8f3a', 0.7 * dim); c.lineWidth = 3; c.beginPath(); c.moveTo(x, h); c.lineTo(x, y - h * 0.06); c.stroke(); c.save(); c.translate(x, y - h * 0.07); c.rotate(-0.6 * (1 - up)); c.fillStyle = shade('#ffcc1a', 0.7 * dim); for (let q = 0; q < 10; q++) { const a = q * 0.628; ell(c, Math.cos(a) * h * 0.018, Math.sin(a) * h * 0.018, h * 0.012, h * 0.006); } c.fillStyle = shade('#6b4422', 0.7 * dim); circ(c, 0, 0, h * 0.012); c.restore(); }
  // the wattle fence in front
  c.strokeStyle = shade('#8a5a2b', 0.7 * dim); c.lineWidth = 3; for (let i = 0; i < 16; i++) { const x = i / 15 * w; c.beginPath(); c.moveTo(x, h); c.lineTo(x, h * 0.9); c.stroke(); }
  for (const yy of [0.93, 0.96]) { c.lineWidth = 4; c.beginPath(); for (let i = 0; i <= 30; i++) { const x = i / 30 * w; c[i ? 'lineTo' : 'moveTo'](x, h * yy + Math.sin(i * 1.7) * 2); } c.stroke(); }
  // fireflies on a summer night; birds in the morning; snow or rain if that's the weather
  if (dim > 0.4 && sea === 'lito') for (let i = 0; i < 14; i++) { const on = Math.max(0, Math.sin(t * 1.8 + i * 2.1)); c.globalAlpha = on * dim; c.fillStyle = '#e6ff9a'; circ(c, (Math.sin(t * 0.2 + i * 7) * 0.5 + 0.5) * w, h * (0.7 + Math.sin(t * 0.3 + i) * 0.1), 2.5); c.globalAlpha = 1; }
  if (p > 0.75 && !wet(wx) && wx !== 'snow') { c.strokeStyle = 'rgba(60,50,60,.7)'; c.lineWidth = 2; for (let i = 0; i < 4; i++) { const bx = ((t * 40 + i * 70) % (w + 100)) - 50, by = h * (0.2 + i * 0.05) + Math.sin(t * 2 + i) * 6, fl = Math.sin(t * 9 + i) * 5; c.beginPath(); c.moveTo(bx - 8, by - fl); c.quadraticCurveTo(bx - 3, by - 5, bx, by); c.quadraticCurveTo(bx + 3, by - 5, bx + 8, by - fl); c.stroke(); } }
  if (wx === 'snow' || (sea === 'zyma' && p < 0.6)) drawSnow(c, w, h, t, w / 390, 0.8);
  if (wx === 'fog' && p > 0.6) { c.fillStyle = 'rgba(240,244,248,.45)'; for (let i = 0; i < 4; i++) { const x = ((i * 0.3 + t * 0.01) % 1.4 - 0.2) * w; ell(c, x, h * (0.62 + i * 0.07), w * 0.5, h * 0.05); } }
  if (wet(wx) && p > 0.6) { c.strokeStyle = 'rgba(210,225,255,.5)'; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i < 70; i++) { const x = ((i * 97.3 + t * 60) % (w + 60)) - 30, y = ((i * 211.7 + t * 800) % (h + 80)) - 40; c.moveTo(x, y); c.lineTo(x - w * 0.012, y + h * 0.03); } c.stroke(); }
}
function drawBed(t) {
  if (bed.t0 == null) { bed.t0 = t; document.body.classList.add('bedtime'); }   // start timing on the first frame drawn; the coin bar and goal line step aside
  const c = ctx, h = cv.height, w = cv.width, d = bed.done, once = (k, fn) => { if (!d[k]) { d[k] = 1; fn(); } }, u = roomU();
  let a = t - bed.t0;
  const lastT = bed.lt; bed.lt = t;
  const cats = homeCats(), fade = (x0, x1) => Math.max(0, Math.min(1, (a - x0) / (x1 - x0)));
  // --- 1. good night to the cats (skipped when there are none): the view glides from one cat to the next
  const CT = cats.length ? 0.4 + Math.max(3.2, cats.length * 1.7) : 3.6;   // when the cats' part ends
  if (cats.length && a > 0.4 && a < CT) {
    const k = Math.min(cats.length - 1, Math.floor((a - 0.4) / 1.7)), p = catSpot(k), want = Math.max(-roomPL(), Math.min(panMax(), p.x - w / 2));
    const dtb = Math.min(0.1, Math.max(0, t - (lastT || t))); roomX += (want - roomX) * Math.min(1, dtb * 4); clampPan();
  }
  if (winter() && a > 0.4 && a < CT) once('warm', () => { bed.warm = (S.bag.drova || 0) >= 2; if (bed.warm) S.bag.drova -= 2; hud(); save(); if (!cats.length) say(bed.warm ? 'p_zatopy_pich' : 'p_kholodno'); });
  if ((cats.length || winter()) && a > 0.4 && a < CT) {
    if (cats.length) once('feed', () => say(...(winter() ? [bed.warm ? 'p_zatopy_pich' : 'p_kholodno'] : []), 'p_dobranich_kotyky'));
    if (winter()) bedText(c, bed.warm ? '🔥 ' + PH.zatopy_pich.uk : '🥶 ' + PH.kholodno.uk, bed.warm ? PH.zatopy_pich.en + ' (−2 ' + W.drova.en + ')' : PH.kholodno.en + ' Chop wood at the block by your cottage.', h * 0.31, Math.min(1, (a - 0.4) * 3, (CT - a) * 3));
    cats.forEach((_, i) => { const p = catSpot(i);   // a sleepy "z z" drifting up over each cat
      c.save(); c.font = cozyFont(Math.round(p.s * 0.22)); c.fillStyle = '#fff8ea'; c.strokeStyle = 'rgba(74,44,26,.55)'; c.lineWidth = 3; c.textAlign = 'center';
      for (let j = 0; j < 2; j++) { const q = ((a - 0.4) * 0.45 + j * 0.5 + i * 0.17) % 1; c.globalAlpha = Math.sin(q * Math.PI); const zx = p.x - roomX + p.s * (0.15 + q * 0.2), zy = p.y - p.s * (0.42 + q * 0.4); c.strokeText('z', zx, zy); c.fillText('z', zx, zy); }
      c.restore(); });
    if (cats.length) bedText(c, '🌙 ' + PH.dobranich_kotyky.uk, PH.dobranich_kotyky.en, h * 0.2, Math.min(1, (a - 0.4) * 3, (CT - a) * 3));
  }
  const N = cats.length || winter() ? CT - 0.2 : 0.6;   // when the night outside begins
  const T1 = N + 4.2, T2 = T1 + 3, T3 = T2 + 4.2;    // night, the night passing, morning, then back indoors
  if (bed.tap) { bed.tap = false; if (a > T2 + 1 && a < T3 - 0.8) { bed.t0 -= T3 - 0.8 - a; a = T3 - 0.8; } }   // a tap in the morning: on with the day
  if (a > N) {
    // --- 2.–4. the valley, faded in over the room and out again at the end
    const inA = fade(N, N + 1.1), outA = 1 - fade(T3 - 0.8, T3);
    const p = a < T1 ? 0 : a < T2 ? (a - T1) / (T2 - T1) : 1;
    if (a > T1 + 0.6) once('morning', () => { if (bed.dev) { const r = Math.random(); S.wx = dayWeather(season(), r); S.clock.t = 0.27; S.clock.ev = {}; S.clock.nightT = 0; } else newDay(); });   // the new day (and its weather) begins as the sky turns
    const wx = d.morning ? S.wx : null;
    c.save(); c.globalAlpha = inA * outA; bedValley(c, w, h, p, t, a - N, wx); c.restore();
    // the window frame of the cottage around the view, as if you're looking out
    c.save(); c.globalAlpha = inA * outA; c.strokeStyle = '#6b4422'; c.lineWidth = u * 0.04; c.strokeRect(u * 0.02, u * 0.02, w - u * 0.04, h - u * 0.04); c.lineWidth = u * 0.016; c.strokeStyle = 'rgba(107,68,34,.5)'; c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h * 0.08); c.stroke(); c.restore();
    // good night
    if (a < T1 + 0.5) {
      once('night', () => say('p_dobranich'));
      const ta = Math.min(fade(N + 0.6, N + 1.4), 1 - fade(T1 - 0.4, T1 + 0.4));
      c.save(); c.globalAlpha = Math.max(0, ta); c.font = cozyFont(Math.round(u * 0.05)); c.fillStyle = '#fff8ea'; c.textAlign = 'center';
      for (let i = 0; i < 3; i++) { const q = ((a * 0.5) + i / 3) % 1; c.globalAlpha = Math.max(0, ta) * Math.sin(q * Math.PI); c.fillText('z', w * 0.72 + q * w * 0.1, h * 0.42 - q * h * 0.1); }
      c.restore();
      bedText(c, '🌙 ' + PH.dobranich.uk, PH.dobranich.en, h * 0.3, ta);
    }
    // good morning, the weather, a new season
    if (d.morning) {
      const firstSnow = S.firstSnow === S.clock.day, storks = bed.season === 'vesna';
      once('hello', () => say('p_dobroho_ranku', firstSnow ? 'p_pershyi_snih' : 'w_' + WX[S.wx].w, ...(bed.season ? ['w_' + bed.season] : []), ...(storks ? ['p_leleky_povernulysia'] : [])));
      if (storks) learn('leleka');
      const ma = Math.min(fade(T2 - 0.4, T2 + 0.4), outA), wxd = WX[S.wx];
      bedText(c, '☀️ ' + PH.dobroho_ranku.uk, PH.dobroho_ranku.en, h * 0.26, ma);
      if (firstSnow) bedCard(c, w / 2, h * 0.43, '❄️', PH.pershyi_snih.uk, PH.pershyi_snih.en, Math.min(fade(T2 + 0.3, T2 + 0.9), outA), u);
      else bedCard(c, w / 2, h * 0.43, wxd.ic, W[wxd.w].uk, W[wxd.w].en, Math.min(fade(T2 + 0.3, T2 + 0.9), outA), u);
      if (storks) bedCard(c, w / 2, h * 0.73, '@stork', PH.leleky_povernulysia.uk, PH.leleky_povernulysia.en, Math.min(fade(T2 + 1.5, T2 + 2.1), outA), u);
      if (bed.season) bedCard(c, w / 2, h * 0.58, SEASON_IC[bed.season], W[bed.season].uk, `${W[bed.season].en} is here!`, Math.min(fade(T2 + 0.9, T2 + 1.5), outA), u);
      if (a > T2 + 1.6 && a < T3 - 0.9 && stage() < 3) { c.save(); c.globalAlpha = 0.6 + 0.3 * Math.sin(t * 3); c.fillStyle = '#fff8ea'; c.font = `700 ${Math.round(u * 0.035)}px system-ui`; c.textAlign = 'center'; c.fillText('Tap to start the day', w / 2, h * 0.8); c.restore(); }
    }
  }
  if (a > T3) { bed = null; document.body.classList.remove('bedtime'); $('#homebar').style.display = 'flex'; }
  canvasSub(c, w, h);
}
function drawHome(t) {
  const w = cv.width, h = cv.height, c = ctx, u = roomU(), RW = roomW(), PL = roomPL(), wallB = h * 0.56;
  if (tour) {
    const a = t - tour.t0, ease = k => k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, max = panMax();
    const mn = -roomPL();
    if (a < 0.5) roomX = mn;
    else if (a < 2.6) roomX = mn + ease((a - 0.5) / 2.1) * (max - mn);
    else if (a < 3.0) roomX = max;
    else if (a < 4.2) roomX = max + ease((a - 3.0) / 1.2) * (tour.mid - max);
    else { roomX = tour.mid; tour = null; }
  }
  clampPan(); inStep(t);
  c.save(); c.translate(-roomX, 0);
  // back wall, beams, embroidered border
  c.fillStyle = '#fbf1dc'; c.fillRect(-PL, 0, RW + PL, wallB);
  c.fillStyle = 'rgba(160,110,60,.10)'; for (let x = -PL; x < RW; x += u * 0.11) c.fillRect(x, 0, u * 0.004 + 1, wallB);
  const k = Math.max(10, u / 36), y0 = h * 0.17;
  c.fillStyle = '#8a5a2b'; c.fillRect(-PL, y0 - k * 0.9, RW + PL, k * 0.5);
  for (let x = -Math.ceil(PL / (k * 2)) * k * 2; x < RW + k; x += k * 2) { c.fillStyle = '#d43a3a'; poly(c, [[x, y0], [x + k * 0.8, y0 + k * 0.8], [x, y0 + k * 1.6], [x - k * 0.8, y0 + k * 0.8]]); c.fillStyle = '#2d2d2d'; circ(c, x + k, y0 + k * 0.8, k * 0.22); }
  // the window onto the valley
  const wx = WIN_X * RW, ww = u * 0.3, wt = h * 0.27, wb = h * 0.45;
  c.save(); c.beginPath(); c.rect(wx - ww / 2, wt, ww, wb - wt); c.clip();
  let g;
  windowView(c, wx - ww / 2, wt, ww, wb - wt, t, 4, 0);   // the season, weather and time of day outside
  c.restore();
  c.strokeStyle = '#3d7cc2'; c.lineWidth = u * 0.022; c.strokeRect(wx - ww / 2, wt, ww, wb - wt);
  c.lineWidth = u * 0.012; c.beginPath(); c.moveTo(wx, wt); c.lineTo(wx, wb); c.moveTo(wx - ww / 2, (wt + wb) / 2); c.lineTo(wx + ww / 2, (wt + wb) / 2); c.stroke();
  c.fillStyle = '#c08a55'; rr(c, wx - ww / 2 - u * 0.03, wb, ww + u * 0.06, u * 0.025, 4);
  // floor, skirting, and the shadow where wall meets floor
  c.fillStyle = '#c99a63'; c.fillRect(-PL, wallB, RW + PL, h - wallB);
  c.strokeStyle = 'rgba(120,80,40,.28)'; c.lineWidth = Math.max(2, h * 0.003);
  for (let i = 1; i < 9; i++) { const y = wallB + (h - wallB) * (i / 9) ** 1.25; c.beginPath(); c.moveTo(-PL, y); c.lineTo(RW, y); c.stroke(); }
  c.fillStyle = '#4a90d9'; c.fillRect(-PL, wallB - h * 0.012, RW + PL, h * 0.014);
  g = c.createLinearGradient(0, wallB, 0, wallB + h * 0.05); g.addColorStop(0, 'rgba(90,60,30,.25)'); g.addColorStop(1, 'rgba(90,60,30,0)'); c.fillStyle = g; c.fillRect(-PL, wallB, RW + PL, h * 0.05);
  homeDoor = roomDoor(c, t, wallB);   // the door out, at the far left
  // a warm glow around the lamp or candle
  for (const id of ['lampa', 'svichka']) if (S.decor[id]) { const r = decorRect(id), gy = r.by - r.sz * (id === 'lampa' ? 0.82 : 0.6); g = c.createRadialGradient(r.cx, gy, 0, r.cx, gy, u * 0.7); g.addColorStop(0, 'rgba(255,214,120,.2)'); g.addColorStop(1, 'rgba(255,214,120,0)'); c.fillStyle = g; c.fillRect(-PL, 0, RW + PL, h); }
  // everything in the room: wall things first, then floor things back to front
  const items = roomItems(), cats = homeCats(), spots = cats.map((_, i) => catSpot(i));
  const batted = new Set(spots.filter(p => p.toy).map(p => p.toy)), towelCat = spots.some(p => p.towel);
  const drawIt = (id, k, r) => {
    if (DECOR[id].fit) return windowRushnyk(c, r.cx, u * 0.3, h * 0.27, h * 0.45, u);
    if (id === 'kylym') { c.save(); c.translate(r.cx, r.by); c.scale(1, 0.75); drawIcon(c, W[id].ic, 0, r.sz * 0.42, r.sz); c.restore(); }
    else drawIcon(c, W[id].ic, r.cx + (batted.has(id + k) ? toyNudge(t) : 0), r.by, r.sz, id === 'stil' && towelCat ? { swing: towelSwing(t) } : id === 'kihtetochka' && k ? { alt: true } : undefined);
  };
  for (const { id, k } of items) {
    const r = decorRect(id, k);
    if (!DECOR[id].wall && id !== 'kylym' && !DECOR[id].on && DECOR[id].shelf === undefined) { c.fillStyle = 'rgba(60,40,20,.16)'; ell(c, r.cx, r.by, r.sz * 0.36, r.sz * 0.06); }
    drawIt(id, k, r);
  }
  const catList = cats.map((h, i) => [h, spots[i], i]).sort((a, b) => a[1].y - b[1].y), drawCat = ([{ ct }, p, i]) => { if (p.sleep || bed) sleepingCat(c, p.x, p.y, p.s, sitPal(ct.v), t);   // at bedtime every cat is curled up asleep
    else cat(c, p.x, p.y, p.s, sitPal(ct.v), t, i * 1.3, p.play || p.towel ? 1 : i % 2 ? -1 : 1, p.groom ? 'groom' : p.play ? 'play' : p.towel ? 'swat' : null); };
  catList.forEach(drawCat);
  // her, walking about the room; then whatever stands nearer than her is drawn again, in front of her
  if (!bed) { inDraw(c, t);
    for (const { id, k } of items) { const D0 = DECOR[id], r = decorRect(id, k); if (D0.wall || D0.flat || D0.on || D0.shelf !== undefined || r.by <= IN.y) continue; drawIt(id, k, r); }
    catList.filter(([, p]) => p.y > IN.y).forEach(drawCat); }
  if (inRoom().length === BASICS.length && stage() < 3) {
    c.fillStyle = 'rgba(74,44,26,.55)'; c.font = `700 ${Math.round(u * 0.036)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('Make it yours: tap 🪑 Прикрасити below.', roomX + w / 2, h * 0.665);
  }
  c.restore();
  {   // evening and night indoors: the lamp, candle and stove glow
    const lights = [];
    for (const id of ['lampa', 'svichka']) if (S.decor[id]) { const r = decorRect(id); lights.push([r.cx - roomX, r.by - r.sz * (id === 'lampa' ? 0.82 : 0.6), u * 0.9]); }
    { const r = decorRect('pich'); lights.push([r.cx - roomX, r.by - r.sz * 0.25, u * 0.55]); }
    paintSky(c, w, h, t, lights, false);
  }
  if (bed) drawBed(t);
}

// ------------------------------------------------------------------ walking about indoors
// In every room (your cottage, Grandma's, the windmill) she is in there with you. Tap the floor and she walks
// there; tap something and she walks over to it first, then it opens. The view follows her as she goes, and
// you can still drag to look around. Further down the floor is nearer, so she's a little bigger there.
const IN = { x: 0, y: 0, tx: 0, ty: 0, wk: 0, step: 0, face: 1, dir: 'front', then: null, follow: false, lt: 0 };
const inBand = () => { const h = cv.height; return mode === 'olia' ? [h * 0.8, h * 0.925] : mode === 'mill' ? [h * 0.835, h * 0.925] : mode === 'church' ? [h * 0.72, h * 0.9] : [h * 0.645, h * 0.8]; };   // (your cottage: kept above the Decorate / Wardrobe buttons)
const inScale = y => { const [a, b] = inBand(); return roomU() * 0.0043 * (0.93 + 0.14 * (Math.max(a, Math.min(b, y)) - a) / Math.max(1, b - a)); };   // up a ladder she's as far back as the back wall
function inStart(fx) { const [a, b] = inBand(); IN.x = IN.tx = fx * roomW(); IN.y = IN.ty = b - (b - a) * 0.35; IN.wk = 0; IN.then = null; IN.face = 1; IN.dir = 'front'; IN.follow = false; IN.path = null; IN.climb = false; IN.wait = 0; IN.pose = null; }
// A scripted walk off the floor (up the mill's ladder and along the landing): points {x, y, climb, fn, wait, pose}
// are walked in turn, with no clamping to the floor; then done() runs.
function inPath(pts, done) { IN.path = pts.slice(); IN.pathDone = done || null; IN.then = null; IN.follow = true; IN.tx = IN.x; IN.ty = IN.y; }
function inWalkTo(x, y, then) {
  const [a, b] = inBand(), u = roomU();
  IN.tx = Math.max(-roomPL() + u * 0.1, Math.min(roomW() - u * 0.1, x)); IN.ty = Math.max(a, Math.min(b, y)); IN.then = then || null; IN.follow = true;
  if (Math.hypot(IN.tx - IN.x, IN.ty - IN.y) < u * 0.03) { IN.tx = IN.x; IN.ty = IN.y; }   // already there
}
// Walk over to a thing standing at room x (its foot at y), stopping just in front of it, then do fn.
function inGo(x, y, fn) { const [a] = inBand(), u = roomU(), near = Math.abs(IN.x - x) < u * 0.22 && IN.y >= a - 2; if (near) { IN.face = x >= IN.x ? 1 : -1; return fn(); } inWalkTo(x + (IN.x < x ? -1 : 1) * u * 0.12, Math.max(a, (y || a) + u * 0.03), () => { IN.face = x >= IN.x ? 1 : -1; fn(); }); }
function inStep(t) {
  const dt = Math.min(0.05, Math.max(0, t - IN.lt)); IN.lt = t;
  const u = roomU(), dx = IN.tx - IN.x, dy = IN.ty - IN.y, d = Math.hypot(dx, dy), sp = u * (IN.climb ? 0.45 : 1.05);
  if (d > 1.5) { const m = Math.min(d, sp * dt); IN.x += dx / d * m; IN.y += dy / d * m; IN.step += m / (u * 0.05); IN.wk = Math.min(1, IN.wk + dt * 6);
    if (IN.climb) IN.dir = 'back';
    else if (Math.abs(dx) > Math.abs(dy) * 0.5) { IN.face = dx > 0 ? 1 : -1; IN.dir = 'side'; } else IN.dir = dy > 0 ? 'front' : 'back'; }
  else if (IN.path) {
    IN.wk = Math.max(0, IN.wk - dt * 6);
    if (IN.wait > 0) IN.wait -= dt;
    else if (IN.path.length) { const p = IN.path.shift(); IN.tx = p.x; IN.ty = p.y; IN.climb = !!p.climb; IN.pose = p.pose || null; if (p.face) IN.face = p.face; if (p.dir) IN.dir = p.dir; if (p.fn) p.fn(); IN.wait = p.wait || 0; }
    else { IN.climb = false; IN.pose = null; const f = IN.pathDone; IN.path = null; IN.pathDone = null; if (f) f(); }
  }
  else { IN.wk = Math.max(0, IN.wk - dt * 6); if (IN.wk < 0.05) IN.dir = 'front'; if (IN.then) { const f = IN.then; IN.then = null; f(); } }
  if (IN.follow && !down) { const want = Math.max(-roomPL(), Math.min(panMax(), IN.x - cv.width / 2)); roomX += (want - roomX) * Math.min(1, dt * 3.5); clampPan(); if (d <= 1.5 && Math.abs(want - roomX) < 2) IN.follow = false; }
}
function inDraw(c, t) {
  const sc = inScale(IN.y), x = IN.x, y = IN.y;
  c.fillStyle = 'rgba(60,40,20,.2)'; ell(c, x, y, 17 * sc, 4.5 * sc);
  c.save(); c.translate(x, y);
  if (IN.dir === 'side') { c.scale(IN.face, 1); personSide(c, 0, 0, ME, t, IN.wk, sc, IN.step); }
  else person(c, 0, 0, ME, t, IN.wk, sc, IN.step, { back: IN.dir === 'back' ? 1 : 0 });
  c.restore();
}

// ------------------------------------------------------------------ inside the windmill (млин)
// A working mill, opened up so you can see how it goes. The sails outside turn the windshaft, which comes in
// through the wall at the hub of the big brake wheel. Pegs on the brake wheel's face turn the wallower, a
// lantern gear on top of the upright main shaft, and the shaft turns the upper millstone (the runner) on top
// of the fixed bed stone. Grain goes into the hopper, trickles down the shoe into the eye of the runner,
// is ground between the stones and comes out as flour down the spout into a sack.
// Milling is done right there on the screen, in the right order:
//   1. постав мішок: stand a sack under the spout          2. насип зерно: tip your wheat into the hopper
//   3. тягни: pull the brake rope, the sails start to turn  4. крути: hold the little hand wheel until the
//      gauge's needle is in the green (the gap between the stones: too tight and they rub and smoke, too wide
//      and the grain comes through whole)                   5. тягни again: brake, and the mill stops
//   6. take the sack of flour.
// Running with no grain makes the stones grind on each other and spark; grinding with no sack spills the flour
// on the floor. Doing it all without a slip makes you a real мірошник.
const MILL = { on: false, spd: 0, rot: 0, sack: false, grain: 0, flour: 0, gap: 0.12, gapPh: 0, hold: false, mist: 0, warn: '', warnT: -9, spill: 0, parts: [], flash: null, lt: 0 };
let millHits = [];
const MX = { door: 0.051, wheat: 0.135, mid: 0.451, win: 0.745, sacks: 0.836, table: 0.927 };
function enterMill() { closeSheet(); fadeThen(enterMillNow); }
function enterMillNow() {
  mode = 'mill'; learn('mlyn'); msfxStart();
  $('#exit').innerHTML = lab('exit'); $('#decorBtn').style.display = 'none'; $('#wardBtn').style.display = 'none'; $('#homebar').style.display = 'flex';
  roomX = MX.mid * roomW() - cv.width / 2; clampPan(); tour = null; blip(520);
  inStart(MX.mid - 0.04);
  MILL.stepK = '';
  if (!S.millSeen) { S.millSeen = 1; save(); setTimeout(() => { if (mode === 'mill') toast('⚙️ ' + W.mlyn.uk + xlT(' · A working windmill! Work out how to grind your wheat into flour.'), 5200); }, 600); }
}
const xlT = s => stage() < 3 ? s : '';
function millFlash(v) { MILL.flash = { v, t0: nowT }; if (W[v]) { useWord(v, true); say('w_' + v); subNow = { uk: verbEn1(v), en: '', a: null, t0: performance.now(), both: true }; } }
function millWarn(key, uk, en) { if (MILL.warn === key && nowT - MILL.warnT < 6) return; MILL.warn = key; MILL.warnT = nowT; toast(uk + xlT(' · ' + en), 3400); blip(260, 0.08); }
function millTap(sx, py) {
  const px = sx + roomX;
  if (IN.path) return;   // she's up the ladder: wait till she's back down
  for (let i = millHits.length - 1; i >= 0; i--) { const r = millHits[i]; if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) { blip(700, 0.05); return r.now ? r.fn() : inGo(r.gx, r.gy, r.fn); } }
  if (py > cv.height * 0.78) { blip(560, 0.05); inWalkTo(px, py); }
}
function millDown(ev) {
  if (sheetOpen()) return;
  const k = cv.width / innerWidth, px = ev.clientX * k + roomX, py = ev.clientY * k, H = millHits.find(r => r.wheel);
  if (H && px >= H.x && px <= H.x + H.w && py >= H.y && py <= H.y + H.h && Math.abs(IN.x - H.gx) < roomU() * 0.3 && !IN.then) { MILL.hold = true; MILL.gapPh = Math.acos(Math.max(-1, Math.min(1, 1 - 2 * MILL.gap))); millFlash('kruty'); }
}
function millUp() {
  MILL.hold = false; blip(620, 0.05);
  const g = MILL.gap;
  if (millSet()) toast('✅ ' + W.zhorna.uk + xlT(' · Just right: the stones are set.'), 2200);
  else if (g < GAP_LO) toast('↔️ ' + xlT('Too tight: the stones will rub. Hold the wheel again.'), 2600);
  else toast('↔️ ' + xlT('Too wide: the grain will come through whole. Hold the wheel again.'), 2600);
}
const GAP_LO = 0.41, GAP_HI = 0.65;   // the green on the gauge
const millSet = () => MILL.gap >= GAP_LO && MILL.gap <= GAP_HI;
function millRope() {
  // Starting is refused (with a nudge to the right step) until a sack is under the spout and wheat is in the hopper.
  if (!MILL.on && MILL.spd <= 0.08) {
    if (!MILL.grain) { blip(260, 0.08); return toast('🌾 Насип пшеницю в ківш!' + xlT(' · The hopper is empty. Put wheat in the hopper first.'), 3200); }
    if (!MILL.sack) { blip(260, 0.08); return toast('🛍️ ' + 'Постав мішок під жолоб!' + xlT(' · Stand a sack under the spout first, or the flour lands on the floor.'), 3200); }
  }
  MILL.on = !MILL.on; sfxThud(); sfxTone(MILL.on ? 700 : 500, MILL.on ? 980 : 320, 0.25, 0.04, 'triangle'); millFlash('tiahny'); blip(MILL.on ? 480 : 380, 0.1);
  if (MILL.on && !MILL.grain && !MILL.flour) MILL.mist++;   // let go of the brake with nothing to grind
}
function millHopper() {
  const have = S.bag.pshenytsia || 0;
  if (!have) { learn('pshenytsia'); return wordCard('kivsh', { note: `🌾 ${W.pshenytsia.uk} × 0${xl(' · You need wheat to grind. It grows in the field beside the church and in the strip by the pond, or buy seeds at the market.')}` }); }
  const n = Math.min(have, 6 - Math.ceil(MILL.grain));
  if (n <= 0) return toast('🌾 ' + xlT('The hopper is full.'), 1800);
  S.bag.pshenytsia -= n; MILL.grain += n; hud(); save(); learn('kivsh'); millFlash('nasyp');
  if (!MILL.sack) MILL.mist++;   // grain in before the sack is under the spout
}
function millSpout() {
  if (!MILL.sack) { MILL.sack = true; MILL.flour = 0; learn('mishok'); millFlash('postav'); sfxTone(110, 60, 0.2, 0.25); sfxHit(500, 0.12, 0.12, 'lowpass', 1); return; }
  if (MILL.spd > 0.08) return millWarn('stopfirst', '🛑 ' + W.tiahny.uk + '!', 'Stop the mill first: pull the red lever.');
  const n = Math.floor(MILL.flour + 0.01);
  if (n < 1) return wordCard('mishok', { note: xl('The sack is still empty. Grind some wheat first.') });
  give('boroshno', n); learn('boroshno'); millFlash('vizmy'); sfxThud(); MILL.sack = false; MILL.flour = 0; blip(900, 0.1);
  if (!MILL.mist) { learn('miroshnyk'); S.coins += 5; hud(); setTimeout(() => { toast(`🏅 ${W.miroshnyk.uk}! +5 💰` + xlT(` · ${n} flour, no slips: a real miller!`), 3600); say('w_miroshnyk'); }, 900); }
  else toast(`🥣 ${W.boroshno.uk} × ${n}` + xlT(' · Into your bag.'), 2600);
  MILL.mist = 0; save();
}
// The hopper is up by the landing: tap it and she walks to the ladder, climbs it, goes along the landing,
// tips her wheat in, and comes back down. No wheat (or a full hopper) says so straight away, without the climb.
const MILLG = {};   // where the ladder and the hopper are this frame, set in drawMill
function millHopperTap() {
  if (!(S.bag.pshenytsia || 0) || 6 - Math.ceil(MILL.grain) <= 0) return millHopper();
  const G = MILLG, [a] = inBand();
  inWalkTo(G.ladX, a, () => inPath([
    { x: G.ladX, y: G.fy },
    { x: G.ladTopX, y: G.landY, climb: true },
    { x: G.pourX, y: G.landY },
    { x: G.pourX, y: G.landY, face: 1, dir: 'side', pose: 'pour', wait: 1.4, fn: () => { sfxPour(1.3); setTimeout(() => { if (mode === 'mill') millHopper(); }, 600); } },
    { x: G.ladTopX, y: G.landY },
    { x: G.ladX, y: G.fy, climb: true },
    { x: G.ladX + roomU() * 0.1, y: a + roomU() * 0.03 },
  ], () => { IN.dir = 'front'; }));
}
// What to do next (no longer shown on screen; kept for tests and a possible hint button).
function millStep() {
  const M = MILL;
  if (IN.path) return 'climb';
  if (!M.on && M.spd <= 0.08 && M.grain <= 0 && M.flour < 1 && !(S.bag.pshenytsia || 0)) return 'nowheat';
  if (M.on && M.grain > 0) return M.spd > 0.3 && !millSet() ? 'wheel' : 'wait';
  if (M.on) return M.spd > 0.45 ? 'stop' : 'wait';
  if (M.spd > 0.08) return 'wait';
  if (!M.sack) return 'sack';
  if (M.grain > 0) return 'start';
  if (M.flour >= 1) return 'take';
  return (S.bag.pshenytsia || 0) ? 'hopper' : 'nowheat';
}
// The hint sits just under the row of HUD buttons, wherever that ends on this phone (re-measured each second).
let hudB = { t: -9, y: 0 };
function millBannerY() { if (nowT - hudB.t > 1) { const r = document.getElementById('hud')?.getBoundingClientRect(); hudB = { t: nowT, y: r && r.height ? (r.bottom + 8) * cv.width / innerWidth : cv.height * 0.1 }; } return hudB.y; }
const MILL_STEPS = {
  sack: ['🛍️', 'Постав мішок під жолоб', 'Tap the dotted box under the spout: stand a sack there.'],
  hopper: ['🌾', 'Насип пшеницю в ківш', 'Tap the hopper up by the ladder: she climbs up and tips your wheat in.'],
  climb: ['🪜', 'Насип пшеницю в ківш', 'Up the ladder with the wheat…'],
  nowheat: ['🌾', 'Немає пшениці', 'You have no wheat to grind. Pick some in the field beside the church or the strip by the pond, then come back.'],
  start: ['🔴', 'Тягни важіль: млин рушить', 'Pull the red lever: the sails turn and the stones start.'],
  wheel: ['🔄', 'Крути колесо: стрілка на зелене', 'Hold the little wheel. Let go when the needle is on green.'],
  wait: ['⏳', 'Мелемо…', 'Grinding: watch the flour pour into the sack.'],
  stop: ['🔴', 'Тягни важіль ще раз: стоп', 'All ground! Pull the red lever again to stop the mill.'],
  take: ['🥣', 'Візьми борошно', 'Tap the sack to take your flour.'],
};
// A sack of flour, tied at the neck.
function sackArt(c, x, y, w2, h2, full, col) {
  const bulge = 0.8 + full * 0.25;
  c.fillStyle = col || '#d9c08a'; c.beginPath(); c.moveTo(x - w2 * 0.3, y - h2); c.quadraticCurveTo(x - w2 * 0.62 * bulge, y - h2 * 0.55, x - w2 * 0.5 * bulge, y); c.lineTo(x + w2 * 0.5 * bulge, y); c.quadraticCurveTo(x + w2 * 0.62 * bulge, y - h2 * 0.55, x + w2 * 0.3, y - h2); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(120,90,40,.35)'; c.lineWidth = 1; for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(x - w2 * 0.45, y - h2 * i / 5); c.lineTo(x + w2 * 0.45, y - h2 * i / 5); c.stroke(); }
  c.fillStyle = '#8a5a2b'; c.fillRect(x - w2 * 0.32, y - h2 * 0.98, w2 * 0.64, h2 * 0.05);
}
// ---- the mill's sounds, all made on the spot with Web Audio (no files): the low rumble of the stones, the
// sails swishing past, the wallower's staves clacking on the cogs, grain trickling down the shoe and flour
// pouring into the sack, the ratchet of the hand wheel, the brake lever's thunk, and sparks crackling.
const MSFX = { on: false, lt: 0, stave: 0, rat: 0, creakT: 3 };
function sfxNoise() {
  if (MSFX.buf) return MSFX.buf;
  const n = actx.sampleRate * 2, b = actx.createBuffer(1, n, actx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return (MSFX.buf = b);
}
function sfxOut() { if (!MSFX.out) { MSFX.out = actx.createGain(); MSFX.out.gain.value = 0.9; MSFX.out.connect(actx.destination); } return MSFX.out; }
// A looping noise bed through a filter, with its own gain we can ride: [gain node, filter node].
function sfxBed(type, f, q) {
  const src = actx.createBufferSource(); src.buffer = sfxNoise(); src.loop = true; src.loopStart = Math.random();
  const fl = actx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
  const g = actx.createGain(); g.gain.value = 0; src.connect(fl); fl.connect(g); g.connect(sfxOut()); src.start();
  return { g, fl };
}
// A short burst: a click, a thud, a crackle.
function sfxHit(f, dur, vol, type = 'bandpass', q = 4) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime, src = actx.createBufferSource(); src.buffer = sfxNoise();
    const fl = actx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = actx.createGain(); g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(fl); fl.connect(g); g.connect(sfxOut()); src.start(t0, Math.random() * 1.5); src.stop(t0 + dur + 0.02);
  } catch (e) {}
}
function sfxTone(f0, f1, dur, vol, type = 'sine') {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(sfxOut()); o.start(t0); o.stop(t0 + dur + 0.02);
  } catch (e) {}
}
const sfxThud = () => { sfxTone(140, 55, 0.25, 0.35); sfxHit(900, 0.05, 0.25); };                  // a wooden thunk (lever, sack down)
const sfxPour = (dur = 1.2) => { for (let i = 0; i < 14; i++) setTimeout(() => sfxHit(2600 + Math.random() * 1500, 0.12, 0.05, 'bandpass', 1.5), i * dur * 1000 / 14); };   // grain tipping in
function msfxStart() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
    if (!MSFX.beds) MSFX.beds = { rumble: sfxBed('lowpass', 110, 0.8), grind: sfxBed('bandpass', 260, 1.2), wind: sfxBed('bandpass', 420, 0.6), trickle: sfxBed('bandpass', 3200, 1), flour: sfxBed('bandpass', 1400, 0.8) };
    MSFX.on = true;
  } catch (e) {}
}
function msfxStop() { if (!MSFX.beds) return; MSFX.on = false; const t0 = actx.currentTime; for (const b of Object.values(MSFX.beds)) { b.g.gain.cancelScheduledValues(t0); b.g.gain.setTargetAtTime(0, t0, 0.15); } }
function msfxTick(t, out) {
  if (!MSFX.on || !MSFX.beds || !actx) return;
  const M = MILL, B = MSFX.beds, t0 = actx.currentTime, ride = (b, v) => b.g.gain.setTargetAtTime(v, t0, 0.12), sp = Math.min(1.5, M.spd);
  const dt = Math.min(0.1, Math.max(0, t - MSFX.lt)); MSFX.lt = t;
  ride(B.rumble, 0.55 * Math.min(1, sp));                                                     // the runner stone turning
  ride(B.grind, M.grain > 0 && sp > 0.45 ? 0.12 * sp : (M.dry > 0.6 ? 0.2 : 0));               // grain being ground (and a rasp when it runs dry)
  ride(B.wind, 0.06 * sp * (0.55 + 0.45 * Math.abs(Math.sin(M.rot * 2))));                     // the sails sweeping past, four to a turn
  ride(B.trickle, M.grain > 0 && M.spd > 0.2 ? 0.045 : 0);                                     // grain trickling down the shoe
  ride(B.flour, out ? 0.06 : 0);                                                                // flour (or whole grain) pouring out of the spout
  B.grind.fl.frequency.setTargetAtTime(M.gap < GAP_LO ? 160 : 260 + M.gap * 200, t0, 0.2);     // tight stones growl lower
  // the staves of the wallower knocking on the brake wheel's cogs
  const st = Math.floor(M.rot * 3.2 / (Math.PI * 2 / 10));
  if (st !== MSFX.stave) { if (M.spd > 0.05 && st - MSFX.stave < 4) sfxHit(1700 + Math.random() * 300, 0.035, 0.08 * Math.min(1, sp + 0.3), 'bandpass', 6); MSFX.stave = st; }
  // the hand wheel's ratchet while you hold it
  const rt = Math.floor((M.gapPh || 0) * 6);
  if (rt !== MSFX.rat) { if (M.hold) sfxHit(3800, 0.02, 0.09, 'highpass', 1); MSFX.rat = rt; }
  // now and then the old wooden frame creaks while it's working
  if (sp > 0.3 && (MSFX.creakT -= dt) < 0) { MSFX.creakT = 2.5 + Math.random() * 4; sfxTone(180 + Math.random() * 80, 120 + Math.random() * 40, 0.45, 0.05, 'sawtooth'); }
  // sparks
  if (M.dry > 1.2 && Math.random() < 0.3) sfxHit(5000 + Math.random() * 3000, 0.015, 0.12, 'highpass', 1);
}
function drawMill(t) {
  const w = cv.width, h = cv.height, c = ctx, u = roomU(), RW = roomW(), M = MILL;
  const dt = Math.min(0.05, Math.max(0, t - M.lt)); M.lt = t;
  clampPan(); inStep(t);
  // ---- the machine: speed eases up when the brake is off, faster in a strong wind
  const wind = S.wx === 'storm' ? 1.5 : wet(S.wx) ? 1.15 : S.wx === 'fog' ? 0.75 : 1;
  M.spd += ((M.on ? wind : 0) - M.spd) * Math.min(1, dt * (M.on ? 0.7 : 1.6));
  M.rot += M.spd * dt * 1.1;
  if (M.hold) { M.gapPh += dt * 0.7; M.gap = 0.5 - 0.5 * Math.cos(M.gapPh); }
  const grinding = M.spd > 0.45;
  let out = null;   // what's coming down the spout: 'flour', 'whole' or nothing
  if (grinding && M.grain > 0) {
    const used = Math.min(M.grain, dt * 0.22 * M.spd); M.grain -= used;
    if (M.gap < GAP_LO) { millWarn('tight', '🔥 ' + W.zhorna.uk + '!', 'The stones are too tight: they rub and smoke. Hold the hand wheel to open them.'); M.grain += used * 0.85; if (Math.random() < 0.3) M.parts.push({ k: 'smoke', x: 0, y: 0, t0: t, vx: (Math.random() - 0.5) * 0.2 }); }
    else if (M.gap > GAP_HI) { out = 'whole'; millWarn('wide', '🌾 ' + W.zhorna.uk + '!', 'The gap is too wide: the grain comes out whole. Hold the hand wheel to close it.'); }
    else { out = 'flour'; if (M.sack) M.flour += used; else { M.spill += used; M.mist++; millWarn('spill', '🛍️ ' + W.mishok.uk + '!', 'No sack under the spout: the flour is going on the floor!'); } }
  }
  if (grinding && M.grain <= 0) M.dry = (M.dry || 0) + dt; else M.dry = Math.max(0, (M.dry || 0) - dt * 2);
  if (M.dry > 1.2) { millWarn('dry', '⚡ ' + W.zhorna.uk + '!', 'Nothing to grind: the stones grind each other and spark! Pull the red lever to stop.'); if (Math.random() < 0.6) M.parts.push({ k: 'spark', x: 0, y: 0, t0: t, vx: (Math.random() - 0.5) * 2, vy: -Math.random() }); if (!M.dryCounted) { M.mist++; M.dryCounted = true; } }
  if (!grinding) M.dryCounted = false;
  msfxTick(t, out);

  const cx = MX.mid * RW, fy = h * 0.8, platY = h * 0.63, bwY = h * 0.25, R = u * 0.2;
  millHits = [];
  const hit = (x, y, ww, hh, fn, gx, gy, extra) => millHits.push(Object.assign({ x, y, w: ww, h: hh, fn, gx: gx ?? x + ww / 2, gy: gy ?? fy }, extra || {}));
  const word = id => () => wordCard(id);
  c.save(); c.translate(-roomX, 0);
  // ---- inside the tower: plank walls, posts leaning in toward the cap, a ceiling of beams
  c.fillStyle = '#c89a62'; c.fillRect(0, 0, RW, fy);
  c.fillStyle = 'rgba(90,55,25,.13)'; for (let x = 0; x < RW; x += u * 0.07) c.fillRect(x, 0, Math.max(1, u * 0.004), fy);
  c.fillStyle = 'rgba(255,240,210,.07)'; for (let x = u * 0.035; x < RW; x += u * 0.14) c.fillRect(x, 0, u * 0.03, fy);
  c.fillStyle = '#6b4422'; c.fillRect(0, 0, RW, h * 0.085); c.fillStyle = '#5a381b'; for (let x = u * 0.1; x < RW; x += u * 0.45) c.fillRect(x, h * 0.085, u * 0.05, h * 0.02);
  c.fillStyle = '#7a4e26'; for (const [x0, x1] of [[0.012, 0.05], [0.988, 0.95]]) poly(c, [[x0 * RW - u * 0.03, fy], [x0 * RW + u * 0.03, fy], [x1 * RW + u * 0.025, 0], [x1 * RW - u * 0.025, 0]]);
  // the floor: worn boards, dusty with flour
  c.fillStyle = '#a8794a'; c.fillRect(0, fy, RW, h - fy);
  c.strokeStyle = 'rgba(80,50,20,.3)'; c.lineWidth = Math.max(1.5, h * 0.0025); for (let i = 1; i < 6; i++) { const y = fy + (h - fy) * (i / 6) ** 1.2; c.beginPath(); c.moveTo(0, y); c.lineTo(RW, y); c.stroke(); }
  c.fillStyle = 'rgba(255,250,235,.18)'; ell(c, cx - u * 0.25, fy + u * 0.03, u * 0.35, u * 0.03);
  c.fillStyle = 'rgba(60,35,15,.25)'; c.fillRect(0, fy - h * 0.006, RW, h * 0.008);
  // ---- the door, open to the day, light falling in across the floor
  { const dx = MX.door * RW, dw = u * 0.22, dt2 = fy - u * 0.42;
    c.fillStyle = '#5a381b'; rr(c, dx - dw / 2 - u * 0.02, dt2 - u * 0.02, dw + u * 0.04, fy - dt2 + u * 0.02, u * 0.02);
    c.save(); c.beginPath(); c.rect(dx - dw / 2, dt2, dw, fy - dt2); c.clip(); windowView(c, dx - dw / 2, dt2, dw, fy - dt2, t, 2, 1, true); c.restore();
    const L = skyLight(S.clock.t); c.fillStyle = `rgba(255,236,190,${0.18 * (1 - L.dark)})`; poly(c, [[dx - dw / 2, fy], [dx + dw / 2, fy], [dx + dw * 1.4, h], [dx - dw * 0.2, h]]);
    hit(dx - dw / 2, dt2, dw, fy - dt2, () => exitHome(), dx, fy); }
  // ---- sacks of wheat by the door
  { const sx = MX.wheat * RW; sackArt(c, sx - u * 0.06, fy, u * 0.13, u * 0.17, 0.8, '#d6b46a'); sackArt(c, sx + u * 0.07, fy, u * 0.12, u * 0.15, 0.6, '#cfae64'); sackArt(c, sx, fy - u * 0.13, u * 0.11, u * 0.12, 0.5, '#dcbb72');
    for (let i = 0; i < 5; i++) { c.save(); c.translate(sx + u * (0.0 + i * 0.012), fy - u * 0.25); c.rotate(-0.3 + i * 0.15); c.strokeStyle = '#b8902e'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -u * 0.07); c.stroke(); c.fillStyle = '#e0b84a'; ell(c, 0, -u * 0.08, u * 0.008, u * 0.02); c.restore(); }
    hit(sx - u * 0.13, fy - u * 0.33, u * 0.26, u * 0.33, word('pshenytsia'), sx, fy); }
  // ---- the sails, seen turning past a small window high up on the wall
  { const wx = MX.win * RW, wy = h * 0.2, ws = u * 0.18;
    c.fillStyle = '#5a381b'; rr(c, wx - ws / 2 - u * 0.015, wy - u * 0.015, ws + u * 0.03, ws + u * 0.03, u * 0.01);
    c.save(); c.beginPath(); c.rect(wx - ws / 2, wy, ws, ws); c.clip(); windowView(c, wx - ws / 2, wy, ws, ws, t, 1, 0);
    c.translate(wx - ws * 0.65, wy + ws * 0.15); c.rotate(-M.rot * 0.9);
    for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2); c.fillStyle = '#6b4422'; c.fillRect(-u * 0.008, 0, u * 0.016, u * 0.4); c.fillStyle = 'rgba(250,244,228,.92)'; c.fillRect(u * 0.008, u * 0.08, u * 0.07, u * 0.3); c.strokeStyle = '#6b4422'; c.lineWidth = 1.5; for (let j = 0; j < 5; j++) { c.beginPath(); c.moveTo(u * 0.008, u * (0.1 + j * 0.06)); c.lineTo(u * 0.078, u * (0.1 + j * 0.06)); c.stroke(); } c.restore(); }
    c.restore();
    c.strokeStyle = '#5a381b'; c.lineWidth = u * 0.01; c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx, wy + ws); c.moveTo(wx - ws / 2, wy + ws / 2); c.lineTo(wx + ws / 2, wy + ws / 2); c.stroke();
    hit(wx - ws / 2, wy, ws, ws, word('kryla'), wx, fy); }
  // ---- the landing under the cap, with a ladder up to it
  c.fillStyle = '#7a4e26'; c.fillRect(cx - u * 0.75, h * 0.45, u * 0.55, u * 0.04); c.fillRect(cx + u * 0.2, h * 0.45, u * 0.5, u * 0.04);
  c.fillStyle = '#5a381b'; c.fillRect(cx - u * 0.75, h * 0.45 + u * 0.04, u * 1.45, u * 0.008);
  { const lx = cx - u * 0.62; Object.assign(MILLG, { ladX: lx + u * 0.01, ladTopX: lx + u * 0.06, landY: h * 0.45, pourX: cx - u * 0.34, fy }); }
  { const lx = cx - u * 0.62; c.strokeStyle = '#6b4422'; c.lineWidth = u * 0.014; c.beginPath(); c.moveTo(lx - u * 0.05, fy); c.lineTo(lx, h * 0.45); c.moveTo(lx + u * 0.07, fy); c.lineTo(lx + u * 0.12, h * 0.45); c.stroke(); c.lineWidth = u * 0.01; for (let i = 1; i < 8; i++) { const q = i / 8, y = fy - (fy - h * 0.45) * q; c.beginPath(); c.moveTo(lx - u * 0.05 + u * 0.05 * q, y); c.lineTo(lx + u * 0.07 + u * 0.05 * q, y); c.stroke(); } }
  // ---- the brake wheel, face-on, its hub on the windshaft coming in from the sails; pegs round its face
  { c.save(); c.translate(cx, bwY);
    c.fillStyle = 'rgba(0,0,0,.12)'; circ(c, u * 0.01, u * 0.012, R * 1.04);
    c.strokeStyle = '#8a5a2b'; c.lineWidth = R * 0.16; c.beginPath(); c.arc(0, 0, R * 0.9, 0, 7); c.stroke();
    c.strokeStyle = '#a06a35'; c.lineWidth = R * 0.05; c.beginPath(); c.arc(0, 0, R * 0.96, 0, 7); c.stroke();
    c.save(); c.rotate(M.rot);
    c.fillStyle = '#7a4e26'; for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2); c.fillRect(-R * 0.06, -R * 0.86, R * 0.12, R * 1.72); c.restore(); }   // the arms
    for (let i = 0; i < 28; i++) { const a = i * Math.PI * 2 / 28; c.save(); c.rotate(a); c.fillStyle = '#e0c08a'; c.fillRect(-R * 0.035, -R * 0.94, R * 0.07, R * 0.1); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(-R * 0.035, -R * 0.85, R * 0.07, R * 0.012); c.restore(); }   // the cogs
    c.restore();
    c.fillStyle = '#4b4f55'; circ(c, 0, 0, R * 0.16); c.fillStyle = '#6d737b'; circ(c, 0, 0, R * 0.1); c.fillStyle = '#9aa1a8'; circ(c, -R * 0.03, -R * 0.03, R * 0.035);
    // the brake: a wooden band round the top of the rim, its arm off to the right; a rope runs down from the
    // end of the arm to the big red lever on the floor, so you can see the lever lifts the brake off
    const lev = M.on ? 0.22 : -0.05;
    c.strokeStyle = M.on ? '#6b4422' : '#5a381b'; c.lineWidth = R * 0.08; c.beginPath(); c.arc(0, 0, R * (M.on ? 1.08 : 1.03), Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.save(); c.translate(R * 0.95, -R * 0.1); c.rotate(lev); c.fillStyle = '#6b4422'; c.fillRect(-R * 0.1, -R * 0.05, R * 1.0, R * 0.1); c.restore();
    c.restore();
    hit(cx - R, bwY - R, R * 2, R * 2, word('shesternia'), cx, fy); }
  // ---- the start/stop lever (важіль): a tall pole on the floor with a red knob, over a red/green plate.
  // Back on the red STOP side the brake holds the wheel; pulled over to green, the brake lifts and it all turns.
  const lvX = cx + u * 0.78, lvP = fy - u * 0.04, lvL = u * 0.4, lvA = M.on ? 0.5 : -0.32;
  const knX = lvX + Math.sin(lvA) * lvL, knY = lvP - Math.cos(lvA) * lvL;
  { const armX = cx + R * 0.95 + Math.cos(M.on ? 0.22 : -0.05) * R * 0.9, armY = bwY - R * 0.1 + Math.sin(M.on ? 0.22 : -0.05) * R * 0.9;
    c.strokeStyle = '#c9a56a'; c.lineWidth = u * 0.007; c.beginPath(); c.moveTo(armX, armY); c.lineTo(knX - Math.sin(lvA) * lvL * 0.25, knY + Math.cos(lvA) * lvL * 0.25); c.stroke();
    const pr = u * 0.13;   // the plate: red half (stop) on the left, green half (go) on the right
    c.fillStyle = '#5a381b'; c.beginPath(); c.arc(lvX, lvP, pr + u * 0.012, Math.PI, 0); c.closePath(); c.fill();
    c.fillStyle = '#d9443a'; c.beginPath(); c.moveTo(lvX, lvP); c.arc(lvX, lvP, pr, Math.PI, Math.PI * 1.5); c.closePath(); c.fill();
    c.fillStyle = '#4fae4f'; c.beginPath(); c.moveTo(lvX, lvP); c.arc(lvX, lvP, pr, Math.PI * 1.5, 0); c.closePath(); c.fill();
    c.font = `800 ${Math.round(u * 0.04)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
    c.fillText('■', lvX - pr * 0.55, lvP - pr * 0.4); c.fillText('▶', lvX + pr * 0.55, lvP - pr * 0.4);
    c.fillStyle = '#4a2c1a'; c.fillRect(lvX - u * 0.1, fy - u * 0.04, u * 0.2, u * 0.04);   // its wooden foot
    c.strokeStyle = '#6b4422'; c.lineWidth = u * 0.026; c.lineCap = 'round'; c.beginPath(); c.moveTo(lvX, lvP); c.lineTo(knX, knY); c.stroke(); c.lineCap = 'butt';
    c.fillStyle = '#d43a3a'; circ(c, knX, knY, u * 0.036); c.fillStyle = 'rgba(255,255,255,.45)'; circ(c, knX - u * 0.011, knY - u * 0.012, u * 0.012);
    c.fillStyle = '#3a2412'; circ(c, lvX, lvP, u * 0.016);
    hit(lvX - u * 0.16, lvP - lvL - u * 0.08, u * 0.36, lvL + u * 0.12, millRope, lvX - u * 0.12, fy); }
  // ---- the wallower: a lantern gear (two discs and staves) on top of the main shaft, driven by the cogs above
  const wlY = bwY + R + u * 0.035, wlR = u * 0.075, wlH = u * 0.065;
  c.fillStyle = '#6b4422'; ell(c, cx, wlY - wlH / 2, wlR, wlR * 0.28);
  for (let i = 0; i < 10; i++) { const a = M.rot * 3.2 + i * Math.PI * 2 / 10, x = cx + Math.cos(a) * wlR * 0.85, front = Math.sin(a) > 0; c.fillStyle = front ? '#e0c08a' : '#8a6a3a'; c.fillRect(x - u * 0.006, wlY - wlH / 2, u * 0.012, wlH); }
  c.fillStyle = '#7a4e26'; ell(c, cx, wlY + wlH / 2, wlR, wlR * 0.28); c.fillStyle = '#8a5a2b'; ell(c, cx, wlY - wlH / 2 - 1, wlR * 0.98, wlR * 0.26);
  hit(cx - wlR, wlY - wlH, wlR * 2, wlH * 2, word('shesternia'), cx, fy);
  // ---- the main shaft, down from the wallower to the runner stone
  const bedH = u * 0.05, runH = u * 0.058, gapPx = u * (0.002 + M.gap * 0.014), sR = u * 0.22;
  const bedTop = platY - bedH, runBot = bedTop - gapPx, runTop = runBot - runH;
  c.fillStyle = '#8a5a2b'; c.fillRect(cx - u * 0.022, wlY + wlH / 2, u * 0.044, runTop - wlY - wlH / 2);
  c.fillStyle = 'rgba(255,230,190,.35)'; for (let i = 0; i < 3; i++) { const q = ((M.rot * 0.5 + i / 3) % 1); c.fillRect(cx - u * 0.022 + q * u * 0.044, wlY + wlH / 2, u * 0.006, runTop - wlY - wlH / 2); }
  // ---- the platform the stones stand on
  c.fillStyle = '#6b4422'; c.fillRect(cx - u * 0.34, platY, u * 0.68, u * 0.045); for (const lx of [-0.3, 0.3]) c.fillRect(cx + lx * u - u * 0.025, platY, u * 0.05, fy - platY);
  c.fillStyle = '#5a381b'; c.fillRect(cx - u * 0.3, platY + (fy - platY) * 0.55, u * 0.6, u * 0.025);
  // ---- the millstones: the bed stone fixed, the runner turning (its dressing marks sliding round)
  const stone = (y0, hh, spin) => {
    c.fillStyle = '#9a958c'; c.fillRect(cx - sR, y0, sR * 2, hh); c.fillStyle = '#b4afa6'; ell(c, cx, y0, sR, sR * 0.13); c.fillStyle = '#86817a'; ell(c, cx, y0 + hh, sR, sR * 0.13); c.fillRect(cx - sR, y0, sR * 2, hh * 0.98); c.fillStyle = '#a7a299'; ell(c, cx, y0, sR, sR * 0.13);
    if (spin !== undefined) { c.strokeStyle = 'rgba(60,55,50,.45)'; c.lineWidth = Math.max(1, u * 0.004); for (let i = 0; i < 9; i++) { const a = spin + i * Math.PI * 2 / 9; if (Math.sin(a) < 0) continue; const x = cx + Math.cos(a) * sR * 0.97; c.beginPath(); c.moveTo(x, y0 + hh * 0.15); c.lineTo(x, y0 + hh * 0.85); c.stroke(); } c.fillStyle = '#5b574f'; ell(c, cx, y0, sR * 0.12, sR * 0.03); }   // the eye in the middle
    c.strokeStyle = 'rgba(70,60,50,.4)'; c.lineWidth = Math.max(1, u * 0.004); c.beginPath(); c.moveTo(cx - sR, y0 + hh * 0.5); c.lineTo(cx + sR, y0 + hh * 0.5); c.stroke();   // an iron hoop round it
  };
  stone(bedTop, bedH);
  c.fillStyle = 'rgba(40,30,20,.55)'; c.fillRect(cx - sR * 0.98, runBot, sR * 1.96, gapPx);   // the gap between the stones
  stone(runTop, runH, M.rot);
  c.fillStyle = '#8a5a2b'; c.fillRect(cx - u * 0.022, runTop - u * 0.03, u * 0.044, u * 0.03);   // the shaft into the eye
  hit(cx - sR, runTop - u * 0.02, sR * 2, platY - runTop + u * 0.03, word('zhorna'), cx, fy);
  // smoke if they're set too tight, sparks if they run dry
  M.parts = M.parts.filter(p => t - p.t0 < (p.k === 'spark' ? 0.4 : 1.6));
  for (const p of M.parts) { const q = (t - p.t0); if (p.k === 'smoke') { c.fillStyle = `rgba(120,110,100,${0.35 * (1 - q / 1.6)})`; circ(c, cx + sR * (p.vx * 4) + q * u * 0.05, runBot - q * u * 0.25, u * (0.015 + q * 0.03)); } else { c.fillStyle = `rgba(255,${180 + Math.random() * 60 | 0},60,${1 - q / 0.4})`; circ(c, cx + (p.vx > 0 ? sR : -sR) + p.vx * q * u * 0.25, runBot + (p.vy * q + q * q * 2) * u * 0.2, u * 0.006); } }
  // ---- the hopper above the runner, and the shoe that shakes grain down into the eye
  const hx2 = cx - u * 0.15, hTop = runTop - u * 0.3, hBot = runTop - u * 0.16, shake = M.spd > 0.2 ? Math.sin(t * 30) * u * 0.004 * Math.min(1, M.spd) : 0;
  const hopper = () => poly(c, [[hx2 - u * 0.13, hTop], [hx2 + u * 0.13, hTop], [hx2 + u * 0.03, hBot], [hx2 - u * 0.03, hBot]]);
  c.fillStyle = '#a06a35'; hopper();
  if (M.grain > 0) { c.save(); hopper(); c.clip(); const lvl = hBot - (hBot - hTop) * Math.min(1, M.grain / 6) * 0.92; c.fillStyle = '#e0b84a'; c.fillRect(hx2 - u * 0.14, lvl, u * 0.28, hBot - lvl); c.fillStyle = '#f0cc66'; ell(c, hx2, lvl, u * 0.1 * (0.4 + 0.6 * (hBot - lvl) / (hBot - hTop)), u * 0.008); c.restore(); }
  c.strokeStyle = '#7a4e26'; c.lineWidth = u * 0.008; c.beginPath(); [[hx2 - u * 0.13, hTop], [hx2 + u * 0.13, hTop], [hx2 + u * 0.03, hBot], [hx2 - u * 0.03, hBot]].forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.stroke(); c.strokeStyle = 'rgba(0,0,0,.12)'; c.lineWidth = 1; for (let i = 1; i < 4; i++) { const y = hTop + (hBot - hTop) * i / 4; c.beginPath(); c.moveTo(hx2 - u * 0.13 + u * 0.1 * i / 4, y); c.lineTo(hx2 + u * 0.13 - u * 0.1 * i / 4, y); c.stroke(); }
  const shTipX = cx - u * 0.025 + shake, shTipY = runTop - u * 0.045;
  c.fillStyle = '#8a5a2b'; poly(c, [[hx2 - u * 0.03 + shake, hBot], [hx2 + u * 0.025 + shake, hBot], [shTipX + u * 0.02, shTipY], [shTipX - u * 0.01, shTipY + u * 0.012]]);   // the shoe
  if (M.grain > 0 && M.spd > 0.2) { c.fillStyle = '#e0b84a'; for (let i = 0; i < 6; i++) { const q = ((t * 3 + i / 6) % 1); circ(c, shTipX + u * 0.01 + Math.sin(i * 7) * u * 0.004, shTipY + q * (runTop - shTipY + u * 0.01), u * 0.004); } }
  hit(hx2 - u * 0.14, hTop - u * 0.04, u * 0.28, hBot - hTop + u * 0.06, millHopperTap, hx2, fy, { now: true });
  MILLG.hopX = hx2; MILLG.hopY = hTop;
  // ---- the spout from the stones, and the sack stood under it
  const spX = cx - sR - u * 0.01, spY = platY - u * 0.02, spEx = cx - u * 0.36, spEy = platY + u * 0.13;
  c.strokeStyle = '#7a4e26'; c.lineWidth = u * 0.04; c.lineCap = 'butt'; c.beginPath(); c.moveTo(spX + u * 0.02, spY); c.lineTo(spEx, spEy); c.stroke(); c.strokeStyle = '#5a381b'; c.lineWidth = u * 0.008; c.beginPath(); c.moveTo(spX + u * 0.02, spY - u * 0.02); c.lineTo(spEx, spEy - u * 0.02); c.stroke();
  const sackW = u * 0.17, full = Math.min(1, M.flour / 6);
  if (M.sack) sackArt(c, spEx, fy, sackW, fy - spEy, full);
  else { c.strokeStyle = 'rgba(255,255,255,.5)'; c.setLineDash([u * 0.012, u * 0.012]); c.lineWidth = 1.5; c.strokeRect(spEx - sackW / 2, spEy, sackW, fy - spEy); c.setLineDash([]); }   // where a sack goes
  if (M.spill > 0) { c.fillStyle = 'rgba(255,252,240,.95)'; ell(c, spEx, fy + u * 0.01, u * (0.04 + Math.min(0.12, M.spill * 0.05)), u * (0.012 + Math.min(0.03, M.spill * 0.012))); }   // flour spilt on the floor
  if (out) { c.fillStyle = out === 'flour' ? 'rgba(255,252,240,.9)' : '#e0b84a'; for (let i = 0; i < 10; i++) { const q = ((t * 2.5 + i / 10) % 1); circ(c, spEx + Math.sin(i * 3 + t) * u * 0.008, spEy + q * (M.sack ? u * 0.05 : fy - spEy), u * (out === 'flour' ? 0.007 : 0.005)); } }
  if (M.sack && M.flour >= 0.99) { const n = Math.floor(M.flour + 0.01); c.font = `800 ${Math.round(u * 0.032)}px system-ui`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#4a2c1a'; c.fillText(`${n}`, spEx, fy - (fy - spEy) * 0.4); }
  hit(spEx - sackW * 0.7, spEy - u * 0.04, sackW * 1.4, fy - spEy + u * 0.05, millSpout, spEx, fy);
  // ---- the hand wheel that sets the gap between the stones, and its gauge
  { const gx = cx + u * 0.42, gy = platY + u * 0.11, gr = u * 0.075, ga = (M.gapPh || 0) * 2;
    c.fillStyle = '#6b4422'; c.fillRect(gx - u * 0.01, gy, u * 0.02, fy - gy);
    c.strokeStyle = '#4b4f55'; c.lineWidth = u * 0.008; c.beginPath(); c.arc(gx, gy, gr, 0, 7); c.stroke(); for (let i = 0; i < 4; i++) { const a = ga + i * Math.PI / 2; c.beginPath(); c.moveTo(gx, gy); c.lineTo(gx + Math.cos(a) * gr, gy + Math.sin(a) * gr); c.stroke(); } c.fillStyle = '#d43a3a'; circ(c, gx + Math.cos(ga) * gr, gy + Math.sin(ga) * gr, u * 0.01);
    const dX = gx, dY = gy - u * 0.2, dr = u * 0.14;
    c.fillStyle = '#f6efe0'; c.beginPath(); c.arc(dX, dY, dr, Math.PI, 0); c.closePath(); c.fill();
    for (const [a0, a1, col] of [[0, GAP_LO, '#e2574c'], [GAP_LO, GAP_HI, '#5cb85c'], [GAP_HI, 1, '#f2a23a']]) { c.strokeStyle = col; c.lineWidth = dr * 0.18; c.beginPath(); c.arc(dX, dY, dr * 0.82, Math.PI + a0 * Math.PI, Math.PI + a1 * Math.PI); c.stroke(); }
    const na = Math.PI + M.gap * Math.PI; c.strokeStyle = '#2d2d2d'; c.lineWidth = u * 0.009; c.beginPath(); c.moveTo(dX, dY); c.lineTo(dX + Math.cos(na) * dr * 0.9, dY + Math.sin(na) * dr * 0.9); c.stroke(); c.fillStyle = '#2d2d2d'; circ(c, dX, dY, u * 0.009);
    c.strokeStyle = '#8a5a2b'; c.lineWidth = u * 0.008; c.beginPath(); c.arc(dX, dY, dr, Math.PI, 0); c.closePath(); c.stroke();
    MILLG.whX = gx; MILLG.whY = gy;
    hit(gx - gr * 2, dY - dr, gr * 4, gy - dY + dr + gr * 1.5, () => { if (!M.hold) toast('🔄 ' + W.kruty.uk + xlT(' · Hold the hand wheel and let go when the needle is on the green.'), 2600); }, gx, fy, { wheel: true }); }
  // ---- sacks of flour you've made, and the miller's table: bread, a mug, and a mouse after the crumbs
  { const sx = MX.sacks * RW, n = Math.min(4, S.bag.boroshno || 0);
    for (let i = 0; i < Math.max(1, n); i++) sackArt(c, sx + (i % 2 ? 1 : -1) * u * 0.07 * (i > 1 ? 0.5 : 1), fy - (i > 1 ? u * 0.13 : 0), u * 0.13, u * 0.15, 0.9, i < n ? '#f1ead8' : 'rgba(241,234,216,.35)');
    hit(sx - u * 0.15, fy - u * 0.3, u * 0.3, u * 0.3, word('boroshno'), sx, fy); }
  { const tx = MX.table * RW, ty = fy - u * 0.2;
    c.fillStyle = '#7a4e26'; c.fillRect(tx - u * 0.15, ty, u * 0.3, u * 0.03); c.fillRect(tx - u * 0.13, ty, u * 0.025, fy - ty); c.fillRect(tx + u * 0.105, ty, u * 0.025, fy - ty);
    drawIcon(c, W.khlib.ic, tx - u * 0.04, ty + 1, u * 0.12); drawIcon(c, W.chashka.ic, tx + u * 0.08, ty + 1, u * 0.07);
    hit(tx - u * 0.1, ty - u * 0.1, u * 0.12, u * 0.11, word('khlib'), tx, fy);
  }
  // ---- her; up on the landing she tips a sack of wheat into the hopper
  inDraw(c, t);
  if (IN.pose === 'pour') {
    const sc = inScale(IN.y), hx = IN.x + 16 * sc, hy = IN.y - 50 * sc;
    c.save(); c.translate(hx, hy); c.rotate(1.9); sackArt(c, 0, 0, 26 * sc, 30 * sc, 0.6, '#d6b46a'); c.restore();
    c.fillStyle = '#e0b84a'; for (let i = 0; i < 9; i++) { const q = ((t * 2.4 + i / 9) % 1), x0 = hx + 20 * sc, y0 = hy + 4 * sc; circ(c, x0 + (MILLG.hopX - u * 0.04 - x0) * q + Math.sin(i * 5) * u * 0.004, y0 + (MILLG.hopY + u * 0.02 - y0) * q * q, u * 0.005); }
  }
  // ---- the things you can work glow softly (the sack spot, the hopper, the lever, the hand wheel): no order given,
  // you find out by trying, and a wrong move says what's missing
  for (const [gx, gy] of [[spEx, (spEy + fy) / 2], [MILLG.hopX, MILLG.hopY + u * 0.07], [knX, knY], [MILLG.whX, MILLG.whY]]) {
    const a = 0.22 + 0.1 * Math.sin(t * 1.6 + gx * 0.01), gg = c.createRadialGradient(gx, gy, 0, gx, gy, u * 0.13);
    gg.addColorStop(0, `rgba(255,226,120,${a})`); gg.addColorStop(1, 'rgba(255,226,120,0)'); c.fillStyle = gg; c.fillRect(gx - u * 0.13, gy - u * 0.13, u * 0.26, u * 0.26);
  }
  c.restore();
  if (M.spd > 0.3) { c.fillStyle = 'rgba(255,250,235,.35)'; for (let i = 0; i < 18; i++) { const q = (t * 0.05 + i * 0.061) % 1; circ(c, ((i * 0.37 + Math.sin(t * 0.3 + i) * 0.02) % 1) * w, h * (0.9 - q * 0.7), 1.3); } }
  { const lights = [[MX.door * RW - roomX, fy - u * 0.2, u * 0.7], [MX.win * RW - roomX, h * 0.29, u * 0.5]]; paintSky(c, w, h, t, lights, false); }
  // the action word, big for a moment, and its English underneath
  if (M.flash && W[M.flash.v]) { const q = (nowT - M.flash.t0) / 1.6; if (q < 1) { const s = q < 0.2 ? 0.6 + q * 2 : 1, a = q < 0.7 ? 1 : (1 - q) / 0.3; c.save(); c.globalAlpha = a; c.font = `900 ${Math.round(u * 0.1 * s)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = u * 0.014; c.strokeStyle = '#4a2c1a'; c.strokeText(W[M.flash.v].uk + '!', w / 2, h * 0.27); c.fillStyle = '#ffd23f'; c.fillText(W[M.flash.v].uk + '!', w / 2, h * 0.27);
    if (subsOnNow()) { const en = verbEn1(M.flash.v); c.font = `700 ${Math.round(u * 0.045)}px system-ui, sans-serif`; const bw = c.measureText(en).width + u * 0.08; c.fillStyle = 'rgba(47,42,38,.85)'; rr(c, w / 2 - bw / 2, h * 0.315, bw, u * 0.075, u * 0.03); c.fillStyle = '#fff'; c.fillText(en, w / 2, h * 0.315 + u * 0.0375); }
    c.restore(); } }
}

// ------------------------------------------------------------------ inside the church (церква)
// Not a game, just a beautiful, quiet place. A painted vault of gold stars on deep blue, and under it the
// iconostasis: a gilded screen of icons in two tiers, a cross on top, the carved royal doors in the middle, two
// of the icons dressed with embroidered рушники as village churches do. Tall arched windows let in the day
// (the real season and weather outside), slanting light falls through drifting incense, a candle chandelier
// (панікадило) sways gently, and beeswax candles flicker on two stands. You can light a candle there, and pull
// the bell rope by the door to ring the bell up in the tower.
const CH = { cx: 0.52, door: 0.075, rope: 0.15, standL: 0.215, standR: 0.95, lect: 0.815, winL: 0.2, winR: 0.875 };
let churchHits = [];
const CHURCH = { lit: [0, 0], bell: -9 };
function enterChurch() { closeSheet(); fadeThen(enterChurchNow); }
function enterChurchNow() {
  mode = 'church'; learn('tserkva');
  $('#exit').innerHTML = lab('exit'); $('#decorBtn').style.display = 'none'; $('#wardBtn').style.display = 'none'; $('#homebar').style.display = 'flex';
  roomX = CH.cx * roomW() - cv.width / 2; clampPan(); tour = null; blip(520);
  inStart(CH.cx - 0.08);
  if (!S.churchDay || S.churchDay.d !== S.clock.day) S.churchDay = { d: S.clock.day, lit: [0, 0] };
  CHURCH.lit = S.churchDay.lit;
  if (!S.churchSeen) { S.churchSeen = 1; save(); setTimeout(() => { if (mode === 'church') toast('⛪ ' + W.tserkva.uk + xlT(' · Look around. Light a candle at a stand, give a few coins at the altar, or pull the bell rope by the door.'), 5200); }, 700); }
}
function churchTap(sx, py) {
  const px = sx + roomX;
  for (let i = churchHits.length - 1; i >= 0; i--) { const r = churchHits[i]; if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) { blip(700, 0.05); return inGo(r.gx, r.gy, r.fn); } }
  if (py > cv.height * 0.68) { blip(560, 0.05); inWalkTo(px, py); }
}
// A church bell, built the way a cast bronze bell actually sounds: the hum an octave below the strike note,
// the prime, the minor third that gives a bell its sombre colour, the fifth, the nominal an octave up, and the
// bright inharmonic partials above, each dying away at its own rate (the high ones fast, the hum for many
// seconds). Every partial is a pair of slightly detuned tones, so the note warbles slowly as real bells do,
// and the clapper's strike is a short metallic clang. It all rings into a long echo, like a tower over a valley.
let bellVerb = null, bellComp = null;
function bellBus() { if (bellComp) return bellComp; bellComp = actx.createDynamicsCompressor(); bellComp.threshold.value = -18; bellComp.knee.value = 8; bellComp.ratio.value = 4; bellComp.attack.value = 0.003; bellComp.release.value = 0.4; const mk = actx.createGain(); mk.gain.value = 2.6; bellComp.connect(mk); mk.connect(actx.destination); return bellComp; }
function bellReverb() {
  if (bellVerb) return bellVerb;
  const len = actx.sampleRate * 6, ir = actx.createBuffer(2, len, actx.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < actx.sampleRate * 0.02 ? i / (actx.sampleRate * 0.02) : 1); }
  const cv2 = actx.createConvolver(); cv2.buffer = ir; const wet2 = actx.createGain(); wet2.gain.value = 0.6; cv2.connect(wet2); wet2.connect(bellBus());
  return (bellVerb = cv2);
}
// The bell: one big low note (110 Hz) that is struck and rings on for a long while. What makes it a bell and not a
// plucked string is its overtones: a bell's don't sit on the string's neat harmonics but a little off them (the
// ring an octave up, a minor third above that, the fifth, the bright nominal two octaves up), and they die away
// well before the low hum does. Each sounds as a slightly detuned pair, so the note swells and shimmers slowly,
// and a soft metallic tap marks the strike. The overtones also let a phone's small speaker carry the note.
function churchBell(vol = 1, f0 = 110, len = 1) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
    const t0 = actx.currentTime + 0.01, out = actx.createGain(); out.gain.value = vol; out.connect(bellBus()); out.connect(bellReverb());
    //  ratio to the hum, loudness, how long it rings (s): the hum carries on longest; the overtones fade sooner
    for (const [r, amp, d0, det] of [[1, 0.85, 22, 0.25], [2.0, 0.42, 13, 0.6], [2.4, 0.3, 9, 0.7], [3.0, 0.14, 6, 0.8], [4.0, 0.26, 7, 1.0], [5.05, 0.09, 3, 1.2], [5.4, 0.07, 2.4, 1.3]]) for (const sd of [-1, 1]) {
      const o = actx.createOscillator(), g = actx.createGain(), d = d0 * len; o.type = 'sine'; o.frequency.value = f0 * r + sd * det * 0.5;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(amp * 0.5, t0 + 0.006); g.gain.exponentialRampToValueAtTime(amp * 0.3, t0 + Math.min(1.5, d * 0.1)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
      o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + d + 0.05);
    }
    // the strike: a short soft metallic tap
    const n = actx.sampleRate * 0.05, buf = actx.createBuffer(1, n, actx.sampleRate), dd = buf.getChannelData(0); for (let i = 0; i < n; i++) dd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 4);
    const src = actx.createBufferSource(), bp = actx.createBiquadFilter(), sg = actx.createGain(); src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 3; sg.gain.value = 0.18;
    src.connect(bp); bp.connect(sg); sg.connect(out); src.start(t0);
  } catch (e) {}
}
// Pulling the rope: the one bell, rung twice.
function churchPeal(vol = 1) { churchBell(vol); setTimeout(() => churchBell(vol), 3500); }
function churchRope() { if (nowT - CHURCH.bell < 3.8) return; CHURCH.bell = nowT; duck = 0.75; setTimeout(() => { duck = 1; }, 10000); churchPeal(); toast('🔔 Дзень-дзелень!' + xlT(' · The bell rings out over the valley.'), 2600); }
// The only thing to do at the altar: put a few coins in the box. It counts what you've given, and that's all.
function donateCard() {
  const st = stage(), have = S.coins || 0, given = S.churchGiven || 0;
  const b2 = n => btn('donate', n, `💰 ${n}`, have >= n ? '' : 'off');
  openSheet(`<div class="card">
    <div class="tag">⛪ Пожертва${st < 3 ? ' · A gift for the church' : ''}</div>
    <div class="word" style="font-size:24px">🙏 ${W.tserkva.uk}</div>
    ${st < 3 ? `<div class="en">Drop a few coins in the box for the church. You have ${have} 💰.${given ? ` You've given ${given} so far.` : ''}</div>` : `<div class="en">💰 ${have}${given ? ` · 🙏 ${given}` : ''}</div>`}
    <div class="row">${b2(1)}${b2(5)}${b2(10)}</div></div>`);
}
function churchCandle(i) {
  if (CHURCH.lit[i] >= 9) return toast('🕯️ ' + xlT('Every candle here is burning.'), 1800);
  CHURCH.lit[i]++; S.churchDay.lit = CHURCH.lit; save(); learn('svichka'); useWord('svichka', true); say('w_svichka'); blip(880, 0.06);
  toast('🕯️ ' + W.svichka.uk + xlT(' · You light a candle.'), 2000);
}
// A candle flame: a soft glow, a teardrop that flickers, a white-hot core.
function chFlame(c, x, y, s, t, ph) {
  const fl = 0.85 + 0.15 * Math.sin(t * 11 + ph * 3.1) + 0.06 * Math.sin(t * 23 + ph), sway = Math.sin(t * 3 + ph) * s * 0.12;
  const g = c.createRadialGradient(x, y - s * 0.4, 0, x, y - s * 0.4, s * 2.6); g.addColorStop(0, 'rgba(255,200,90,.35)'); g.addColorStop(1, 'rgba(255,200,90,0)'); c.fillStyle = g; c.fillRect(x - s * 2.6, y - s * 3, s * 5.2, s * 5.2);
  c.fillStyle = '#ff9a2e'; c.beginPath(); c.moveTo(x + sway, y - s * 1.25 * fl); c.quadraticCurveTo(x + s * 0.42, y - s * 0.3, x, y); c.quadraticCurveTo(x - s * 0.42, y - s * 0.3, x + sway, y - s * 1.25 * fl); c.fill();
  c.fillStyle = '#fff3c0'; c.beginPath(); c.moveTo(x + sway * 0.6, y - s * 0.8 * fl); c.quadraticCurveTo(x + s * 0.2, y - s * 0.2, x, y - s * 0.05); c.quadraticCurveTo(x - s * 0.2, y - s * 0.2, x + sway * 0.6, y - s * 0.8 * fl); c.fill();
}
// An icon on gold leaf under a rounded arch: a haloed figure in a deep robe and mantle, painted simply.
function chIcon(c, x, y, w, h, k) {
  const u = roomU(), P = [['#8e1f2a', '#1f3f7a'], ['#1f3f7a', '#8e1f2a'], ['#2f6b4a', '#8e1f2a'], ['#6a2a6e', '#1f3f7a']][k % 4];
  c.save(); c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w * 0.5); c.arc(x + w / 2, y + w * 0.5, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.closePath();
  c.fillStyle = '#7a5418'; c.fill(); c.clip();
  const g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, '#f3d27a'); g.addColorStop(0.5, '#d9a93e'); g.addColorStop(1, '#f0c862'); c.fillStyle = g; c.fillRect(x + w * 0.06, y + w * 0.06, w * 0.88, h - w * 0.08);
  const fx = x + w / 2, fyy = y + Math.min(h * 0.33, w * 0.62), fr = w * 0.13;
  c.fillStyle = '#ffe9a6'; circ(c, fx, fyy, fr * 2.05); c.strokeStyle = '#a8791f'; c.lineWidth = Math.max(1, w * 0.02); c.beginPath(); c.arc(fx, fyy, fr * 2.05, 0, 7); c.stroke();   // the halo
  c.fillStyle = P[0]; c.beginPath(); c.moveTo(fx - w * 0.3, y + h); c.quadraticCurveTo(fx - w * 0.3, fyy + fr * 1.4, fx, fyy + fr * 1.1); c.quadraticCurveTo(fx + w * 0.3, fyy + fr * 1.4, fx + w * 0.3, y + h); c.fill();   // the robe
  c.fillStyle = P[1]; c.beginPath(); c.moveTo(fx - w * 0.34, y + h); c.quadraticCurveTo(fx - w * 0.28, fyy + fr * 0.4, fx, fyy - fr * 1.15); c.quadraticCurveTo(fx + w * 0.28, fyy + fr * 0.4, fx + w * 0.34, y + h); c.lineTo(fx + w * 0.16, y + h); c.quadraticCurveTo(fx + w * 0.12, fyy + fr * 1.6, fx, fyy + fr * 1.2); c.quadraticCurveTo(fx - w * 0.12, fyy + fr * 1.6, fx - w * 0.16, y + h); c.closePath(); c.fill();   // the mantle over the head
  c.strokeStyle = '#e8b84a'; c.lineWidth = Math.max(1, w * 0.012); c.beginPath(); c.moveTo(fx - w * 0.2, y + h * 0.95); c.quadraticCurveTo(fx - w * 0.17, fyy + fr * 2, fx - w * 0.06, fyy + fr * 1.3); c.moveTo(fx + w * 0.2, y + h * 0.95); c.quadraticCurveTo(fx + w * 0.17, fyy + fr * 2, fx + w * 0.06, fyy + fr * 1.3); c.stroke();   // gold edging
  c.fillStyle = '#d9a982'; ell(c, fx, fyy, fr * 0.78, fr);   // the face
  c.fillStyle = '#5a3a24'; ell(c, fx - fr * 0.3, fyy - fr * 0.05, fr * 0.1, fr * 0.06); ell(c, fx + fr * 0.3, fyy - fr * 0.05, fr * 0.1, fr * 0.06);
  c.strokeStyle = 'rgba(90,58,36,.6)'; c.lineWidth = Math.max(1, w * 0.008); c.beginPath(); c.moveTo(fx, fyy); c.lineTo(fx, fyy + fr * 0.4); c.stroke();
  if (k === 0) { c.fillStyle = '#ffe9a6'; circ(c, fx + w * 0.12, fyy + fr * 2.1, fr * 0.9); c.fillStyle = '#d9a982'; circ(c, fx + w * 0.12, fyy + fr * 2.1, fr * 0.45); c.fillStyle = '#e8d6b0'; ell(c, fx + w * 0.12, fyy + fr * 3, fr * 0.5, fr * 0.7); }   // the Mother of God holds the Child
  if (k === 1) { c.fillStyle = '#f6efe0'; c.fillRect(fx - w * 0.1, fyy + fr * 2.2, w * 0.2, h * 0.2); c.strokeStyle = '#7a5418'; c.lineWidth = Math.max(1, w * 0.02); c.strokeRect(fx - w * 0.1, fyy + fr * 2.2, w * 0.2, h * 0.2); c.fillStyle = '#8e1f2a'; c.fillRect(fx - w * 0.015, fyy + fr * 2.4, w * 0.03, h * 0.14); c.fillRect(fx - w * 0.06, fyy + fr * 2.8, w * 0.12, w * 0.03); }   // Christ holds the Gospel
  c.restore();
  c.strokeStyle = '#b88a2a'; c.lineWidth = Math.max(1.5, u * 0.006); c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w * 0.5); c.arc(x + w / 2, y + w * 0.5, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.stroke();
}
// A рушник hung over the top of an icon, its two ends falling either side, red-and-black cross-stitch at the ends.
function chRushnyk(c, x, y, w, h, u) {
  c.fillStyle = '#f8f3e8'; c.beginPath(); c.moveTo(x - w * 0.06, y + w * 0.3); c.quadraticCurveTo(x + w * 0.5, y - w * 0.12, x + w * 1.06, y + w * 0.3); c.lineTo(x + w * 1.06, y + w * 0.42); c.quadraticCurveTo(x + w * 0.5, y + w * 0.02, x - w * 0.06, y + w * 0.42); c.closePath(); c.fill();
  for (const sx of [x - w * 0.12, x + w * 0.96]) { const L = h * 0.62, bw = w * 0.16; c.fillStyle = '#f8f3e8'; c.fillRect(sx, y + w * 0.32, bw, L);
    for (let i = 0; i < 3; i++) { const yy = y + w * 0.32 + L * (0.55 + i * 0.13); c.fillStyle = i === 1 ? '#2d2d2d' : '#c62828'; for (let j = 0; j < 3; j++) poly(c, [[sx + bw * (j + 0.5) / 3, yy - bw * 0.12], [sx + bw * (j + 0.85) / 3, yy], [sx + bw * (j + 0.5) / 3, yy + bw * 0.12], [sx + bw * (j + 0.15) / 3, yy]]); }
    c.fillStyle = '#c62828'; for (let j = 0; j < 4; j++) c.fillRect(sx + bw * j / 4 + 1, y + w * 0.32 + L, Math.max(1, bw / 10), u * 0.015); }
}
function drawChurch(t) {
  const w = cv.width, h = cv.height, c = ctx, u = roomU(), RW = roomW(), fy = h * 0.66, cx = CH.cx * RW, L = skyLight(S.clock.t), day = 1 - L.dark;
  const wxL = S.wx === 'sun' ? 1 : S.wx === 'cloud' ? 0.6 : 0.35;
  clampPan(); inStep(t);
  churchHits = [];
  const hit = (x, y, ww, hh, fn, gx) => churchHits.push({ x, y, w: ww, h: hh, fn, gx: gx ?? x + ww / 2, gy: fy });
  const word = id => () => wordCard(id);
  let g;
  c.save(); c.translate(-roomX, 0);
  // ---- the walls: warm plaster, painted with a vine border; the vault overhead: deep blue with gold stars
  g = c.createLinearGradient(0, 0, 0, fy); g.addColorStop(0, '#e9d9b8'); g.addColorStop(1, '#f6ead2'); c.fillStyle = g; c.fillRect(0, 0, RW, fy);
  const vB = h * 0.17, vault = q => vB * 0.75 + Math.sin(q * Math.PI * 5) ** 2 * vB * 0.3;
  c.fillStyle = '#1d2d5c'; c.beginPath(); c.moveTo(0, 0); c.lineTo(RW, 0); for (let i = 0; i <= 48; i++) { const q = i / 48; c.lineTo(RW - q * RW, vault(q)); } c.closePath(); c.fill();   // the vault, coming down in arches
  for (let i = 0; i < 70; i++) { const x = ((i * 0.618) % 1) * RW, y = ((i * 0.377) % 1) * vB * 0.8, s = u * (0.006 + (i % 3) * 0.003), tw = 0.6 + 0.4 * Math.sin(t * 1.5 + i); c.fillStyle = `rgba(242,200,90,${tw})`; c.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? s * 0.4 : s; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); }
  c.strokeStyle = '#c89a3a'; c.lineWidth = u * 0.008; c.beginPath(); for (let i = 0; i <= 48; i++) { const q = i / 48; if (i) c.lineTo(RW - q * RW, vault(q)); else c.moveTo(RW, vault(0)); } c.stroke();
  { const by = vB * 1.12, k = u * 0.022;   // a painted border along the wall: a red and green vine
    c.strokeStyle = '#4f8f3a'; c.lineWidth = k * 0.18; c.beginPath(); for (let x = 0; x <= RW; x += k) { const y = by + Math.sin(x / k * 0.5) * k * 0.5; if (x) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke();
    for (let x = k * 3; x < RW; x += k * 6.28) { const y = by + Math.sin(x / k * 0.5) * k * 0.5; c.fillStyle = '#b8322c'; for (let p = 0; p < 5; p++) { const a = p * 1.2566; circ(c, x + Math.cos(a) * k * 0.45, y + Math.sin(a) * k * 0.45, k * 0.32); } c.fillStyle = '#e8b84a'; circ(c, x, y, k * 0.25); } }
  c.fillStyle = 'rgba(120,80,40,.08)'; for (let x = u * 0.4; x < RW; x += u * 0.8) c.fillRect(x, vB * 1.25, u * 0.04, fy - vB * 1.25);   // pilasters
  // ---- tall arched windows with the real day outside, and light slanting in across the floor
  const arch = (x, y, ww, hh) => { c.beginPath(); c.moveTo(x - ww / 2, y + hh); c.lineTo(x - ww / 2, y + ww / 2); c.arc(x, y + ww / 2, ww / 2, Math.PI, 0); c.lineTo(x + ww / 2, y + hh); c.closePath(); };
  for (const [fx, sd] of [[CH.winL, 0], [CH.winR, 1]]) { const x = fx * RW, ww = u * 0.17, wt = h * 0.24, wh = u * 0.52;
    c.fillStyle = '#9a7a52'; arch(x, wt - u * 0.02, ww + u * 0.04, wh + u * 0.04); c.fill();
    c.save(); arch(x, wt, ww, wh); c.clip(); windowView(c, x - ww / 2, wt, ww, wh, t, 1, sd); c.restore();
    c.strokeStyle = '#6b4a2b'; c.lineWidth = u * 0.008; c.beginPath(); c.moveTo(x, wt + u * 0.02); c.lineTo(x, wt + wh); for (let i = 1; i < 4; i++) { c.moveTo(x - ww / 2, wt + ww / 2 + (wh - ww / 2) * i / 4); c.lineTo(x + ww / 2, wt + ww / 2 + (wh - ww / 2) * i / 4); } c.stroke();
    c.fillStyle = '#c9b28a'; c.fillRect(x - ww / 2 - u * 0.03, wt + wh, ww + u * 0.06, u * 0.02);
    hit(x - ww / 2, wt, ww, wh, word('sontse'), x);
    const a = 0.13 * wxL * day; if (a > 0.01) { const dir = sd ? -1 : 1; g = c.createLinearGradient(x, wt, x + dir * u * 0.6, h); g.addColorStop(0, `rgba(255,240,200,${a})`); g.addColorStop(1, 'rgba(255,240,200,0)'); c.fillStyle = g; poly(c, [[x - ww / 2, wt + ww * 0.3], [x + ww / 2, wt + ww * 0.3], [x + ww / 2 + dir * u * 0.55 + u * 0.1, h], [x - ww / 2 + dir * u * 0.55 - u * 0.1, h]]); } }
  // ---- the floor: stone tiles in two colours, and a red runner up to the royal doors
  c.fillStyle = '#cdbb9c'; c.fillRect(0, fy, RW, h - fy);
  for (let r = 0; r < 7; r++) { const y0 = fy + (h - fy) * (r / 7) ** 1.3, y1 = fy + (h - fy) * ((r + 1) / 7) ** 1.3, tw = u * (0.12 + r * 0.025);
    for (let x = -((r % 2) * tw / 2), j = 0; x < RW; x += tw / 2, j++) if (j % 2 === 0) { c.fillStyle = 'rgba(120,95,70,.25)'; c.fillRect(x, y0, tw / 2, y1 - y0); } }
  c.fillStyle = 'rgba(60,40,20,.25)'; c.fillRect(0, fy - h * 0.004, RW, h * 0.008);
  c.fillStyle = '#9e2a2a'; poly(c, [[cx - u * 0.14, fy], [cx + u * 0.14, fy], [cx + u * 0.3, h], [cx - u * 0.3, h]]);
  c.strokeStyle = '#e8b84a'; c.lineWidth = u * 0.006; c.beginPath(); c.moveTo(cx - u * 0.12, fy); c.lineTo(cx - u * 0.26, h); c.moveTo(cx + u * 0.12, fy); c.lineTo(cx + u * 0.26, h); c.stroke();
  // ---- the door in, at the far left, and the bell rope hanging by it
  { const dx = CH.door * RW, dw = u * 0.2, top = fy - u * 0.4;
    c.fillStyle = '#5a381b'; arch(dx, top - u * 0.025, dw + u * 0.05, fy - top + u * 0.025); c.fill();
    c.save(); arch(dx, top, dw, fy - top); c.clip(); windowView(c, dx - dw / 2, top, dw, fy - top, t, 2, 1, true); c.restore();
    c.fillStyle = `rgba(255,236,190,${0.14 * wxL * day})`; poly(c, [[dx - dw / 2, fy], [dx + dw / 2, fy], [dx + dw * 1.3, h], [dx - dw * 0.3, h]]);
    hit(dx - dw / 2, top, dw, fy - top, () => exitHome(), dx); }
  { const rx = CH.rope * RW, ago = nowT - CHURCH.bell, sw = ago < 3 ? Math.sin(ago * 6) * (1 - ago / 3) * u * 0.03 : 0, bot = fy - u * 0.06 + (ago < 0.4 ? u * 0.05 : 0);
    c.strokeStyle = '#c9a56a'; c.lineWidth = u * 0.009; c.beginPath(); c.moveTo(rx, 0); c.quadraticCurveTo(rx + sw, bot * 0.6, rx + sw * 1.4, bot); c.stroke();
    c.fillStyle = '#b8322c'; rr(c, rx + sw * 1.4 - u * 0.014, bot - u * 0.12, u * 0.028, u * 0.1, u * 0.01); c.fillStyle = '#e8b84a'; circ(c, rx + sw * 1.4, bot - u * 0.01, u * 0.016);
    hit(rx - u * 0.07, bot - u * 0.3, u * 0.14, u * 0.34, churchRope, rx + u * 0.05); }
  // ---- the iconostasis: gilded tiers of icons, the royal doors in the middle, a cross on top
  { const IW = u * 1.5, x0 = cx - IW / 2, t1 = fy - u * 0.52, t2 = t1 - u * 0.3, top = t2 - u * 0.1;
    g = c.createLinearGradient(0, top, 0, fy); g.addColorStop(0, '#a87a22'); g.addColorStop(1, '#7a5418'); c.fillStyle = g; c.fillRect(x0 - u * 0.03, t2 - u * 0.03, IW + u * 0.06, fy - t2 + u * 0.03);
    c.fillStyle = '#e0b44a'; c.fillRect(x0 - u * 0.03, t1 - u * 0.02, IW + u * 0.06, u * 0.02); c.fillRect(x0 - u * 0.03, t2 - u * 0.03, IW + u * 0.06, u * 0.018);
    // the pediment and the cross
    c.fillStyle = '#c99a32'; poly(c, [[cx - u * 0.36, t2 - u * 0.03], [cx + u * 0.36, t2 - u * 0.03], [cx, t2 - u * 0.22]]);
    const crX = cx, crY = t2 - u * 0.24, cs = u * 0.022;
    const gl = c.createRadialGradient(crX, crY - cs * 2, 0, crX, crY - cs * 2, u * 0.16); gl.addColorStop(0, `rgba(255,226,140,${0.3 + 0.1 * Math.sin(t)})`); gl.addColorStop(1, 'rgba(255,226,140,0)'); c.fillStyle = gl; c.fillRect(crX - u * 0.16, crY - cs * 2 - u * 0.16, u * 0.32, u * 0.32);
    c.fillStyle = '#f2cc66';
    c.fillRect(crX - cs * 0.35, crY - cs * 4.2, cs * 0.7, cs * 5); c.fillRect(crX - cs * 1.6, crY - cs * 3, cs * 3.2, cs * 0.6); c.fillRect(crX - cs * 0.9, crY - cs * 3.9, cs * 1.8, cs * 0.45);
    c.save(); c.translate(crX, crY - cs * 0.6); c.rotate(-0.35); c.fillRect(-cs * 1.1, -cs * 0.22, cs * 2.2, cs * 0.45); c.restore();   // the slanted footrest of the Orthodox cross
    // the upper tier: seven small icons
    for (let i = 0; i < 7; i++) { const iw = IW / 7, ix = x0 + i * iw + iw * 0.12; chIcon(c, ix, t2 + u * 0.02, iw * 0.76, u * 0.25, (i + 2) % 4); }
    hit(x0, t2, IW, t1 - t2, word('tserkva'), cx);
    // the lower tier: two large icons each side of the doors, the Mother of God on the left, Christ on the right
    const dW = u * 0.34, sideW = (IW - dW) / 2, lw = sideW / 2;
    [[x0, 2], [x0 + lw, 0], [cx + dW / 2, 1], [cx + dW / 2 + lw, 3]].forEach(([ix, k]) => chIcon(c, ix + lw * 0.1, t1 + u * 0.03, lw * 0.8, u * 0.44, k));
    chRushnyk(c, x0 + lw + lw * 0.1, t1 + u * 0.03, lw * 0.8, u * 0.44, u); chRushnyk(c, cx + dW / 2 + lw * 0.1, t1 + u * 0.03, lw * 0.8, u * 0.44, u);
    hit(x0, t1, sideW, fy - t1, word('rushnyk'), x0 + sideW / 2); hit(cx + dW / 2, t1, sideW, fy - t1, word('rushnyk'), cx + dW / 2 + sideW / 2);
    // the royal doors: two arched leaves of gilded openwork vine, a small round icon at the top of each
    const dT = t1 + u * 0.02;
    c.fillStyle = '#3a2412'; arch(cx, dT, dW, fy - dT); c.fill();
    for (const s of [-1, 1]) { const lx = cx + s * dW / 4, lw2 = dW / 2 - u * 0.008;
      c.save(); arch(cx, dT, dW, fy - dT); c.clip(); c.beginPath(); c.rect(s < 0 ? cx - dW / 2 : cx + u * 0.004, dT, lw2, fy - dT); c.clip();
      c.strokeStyle = '#e0b44a'; c.lineWidth = u * 0.008; c.strokeRect(lx - lw2 / 2 + u * 0.006, dT, lw2 - u * 0.012, fy - dT);
      for (let r = 0; r < 5; r++) { const yy = dT + u * 0.14 + r * u * 0.075; c.beginPath(); c.arc(lx, yy, u * 0.032, 0, 7); c.stroke(); c.beginPath(); c.moveTo(lx - lw2 * 0.4, yy + u * 0.035); c.quadraticCurveTo(lx, yy - u * 0.01, lx + lw2 * 0.4, yy + u * 0.035); c.stroke(); c.fillStyle = '#e0b44a'; circ(c, lx, yy, u * 0.01); }
      c.restore();
      c.fillStyle = '#f2cc66'; circ(c, lx, dT + u * 0.07, u * 0.045); c.fillStyle = '#1f3f7a'; circ(c, lx, dT + u * 0.075, u * 0.032); c.fillStyle = '#ffe9a6'; circ(c, lx, dT + u * 0.06, u * 0.015); }
    c.strokeStyle = '#e0b44a'; c.lineWidth = u * 0.01; arch(cx, dT, dW, fy - dT); c.stroke();
    hit(cx - dW / 2, dT, dW, fy - dT, word('tserkva'), cx); }
  // ---- the candle stands, each a brass bowl of sand on a tall foot, with the candles you've lit burning in it
  for (const [fx, i] of [[CH.standL, 0], [CH.standR, 1]]) { const x = fx * RW, top = fy - u * 0.2, n = 3 + CHURCH.lit[i];
    c.fillStyle = '#a87a22'; c.fillRect(x - u * 0.012, top, u * 0.024, fy - top); ell(c, x, fy, u * 0.07, u * 0.014); c.fillStyle = '#c99a32'; ell(c, x, top, u * 0.11, u * 0.025); c.fillStyle = '#e8c35e'; ell(c, x, top - u * 0.004, u * 0.1, u * 0.02);
    for (let k = 0; k < n; k++) { const q = (k + 0.5) / n, cxk = x - u * 0.085 + q * u * 0.17, ht = u * (0.05 + ((k * 37) % 5) * 0.01), by = top - u * 0.008 + Math.sin(q * Math.PI) * u * 0.006;
      c.fillStyle = '#f1d58a'; c.fillRect(cxk - u * 0.005, by - ht, u * 0.01, ht); chFlame(c, cxk, by - ht - u * 0.002, u * 0.016, t, k + i * 5); }
    hit(x - u * 0.13, top - u * 0.15, u * 0.26, fy - top + u * 0.15, () => churchCandle(i), x + u * 0.16); }
  // ---- the altar table: a white cloth with an embroidered hem, a gilded Gospel, a cross and two candles, and a
  // carved donation box (скринька) with a coin slot. Giving a few coins is all there is to do here.
  { const x = CH.lect * RW, tw = u * 0.34, top = fy - u * 0.2;
    c.fillStyle = 'rgba(60,40,20,.18)'; ell(c, x, fy, tw * 0.6, u * 0.02);
    c.fillStyle = '#6b4422'; c.fillRect(x - tw / 2, top, tw, fy - top);
    c.fillStyle = '#f8f3e8'; poly(c, [[x - tw / 2 - u * 0.015, top - u * 0.01], [x + tw / 2 + u * 0.015, top - u * 0.01], [x + tw / 2 + u * 0.02, fy - u * 0.03], [x - tw / 2 - u * 0.02, fy - u * 0.03]]);
    for (let j = 0; j < 9; j++) { const xx = x - tw / 2 + (j + 0.5) * tw / 9, yy = fy - u * 0.065; c.fillStyle = j % 2 ? '#2d2d2d' : '#c62828'; poly(c, [[xx, yy - u * 0.018], [xx + u * 0.014, yy], [xx, yy + u * 0.018], [xx - u * 0.014, yy]]); }
    c.fillStyle = '#c62828'; c.fillRect(x - tw / 2 - u * 0.02, fy - u * 0.04, tw + u * 0.04, u * 0.008); c.fillRect(x - tw / 2 - u * 0.015, top + u * 0.01, tw + u * 0.03, u * 0.006);
    // the Gospel lying open, the cross standing behind it, a candle each side
    c.fillStyle = '#e0b44a'; rr(c, x - u * 0.06, top - u * 0.035, u * 0.12, u * 0.03, u * 0.005); c.fillStyle = '#b8322c'; c.fillRect(x - u * 0.005, top - u * 0.033, u * 0.01, u * 0.026);
    c.fillStyle = '#f2cc66'; c.fillRect(x - u * 0.006, top - u * 0.15, u * 0.012, u * 0.115); c.fillRect(x - u * 0.035, top - u * 0.12, u * 0.07, u * 0.011); c.fillRect(x - u * 0.02, top - u * 0.142, u * 0.04, u * 0.008);
    c.save(); c.translate(x, top - u * 0.07); c.rotate(-0.35); c.fillRect(-u * 0.022, -u * 0.004, u * 0.044, u * 0.008); c.restore();
    for (const s2 of [-1, 1]) { const cx2 = x + s2 * tw * 0.38; c.fillStyle = '#c99a32'; ell(c, cx2, top - u * 0.008, u * 0.018, u * 0.006); c.fillStyle = '#f1d58a'; c.fillRect(cx2 - u * 0.005, top - u * 0.085, u * 0.01, u * 0.077); chFlame(c, cx2, top - u * 0.087, u * 0.016, t, s2 + 9); }
    // the donation box, on the floor in front of the table
    const bx = x + tw * 0.72, bw = u * 0.1, bh = u * 0.09, by = fy - u * 0.01;
    c.fillStyle = '#7a4e26'; c.fillRect(bx - u * 0.012, by - u * 0.1, u * 0.024, u * 0.1);
    c.fillStyle = '#8a5a2b'; rr(c, bx - bw / 2, by - u * 0.1 - bh, bw, bh, u * 0.01); c.fillStyle = '#a06a35'; c.fillRect(bx - bw / 2, by - u * 0.1 - bh, bw, u * 0.018);
    c.fillStyle = '#2d1a0c'; c.fillRect(bx - u * 0.025, by - u * 0.1 - bh + u * 0.004, u * 0.05, u * 0.008);   // the slot
    c.fillStyle = '#f2cc66'; c.fillRect(bx - u * 0.004, by - u * 0.1 - bh * 0.72, u * 0.008, bh * 0.5); c.fillRect(bx - u * 0.017, by - u * 0.1 - bh * 0.58, u * 0.034, u * 0.007);
    const ago = nowT - (CHURCH.coinT || -9); if (ago < 0.9) for (let i = 0; i < Math.min(5, CHURCH.coinN || 1); i++) { const q = Math.min(1, Math.max(0, ago * 1.6 - i * 0.12)); if (q <= 0 || q >= 1) continue; const yy = by - u * 0.1 - bh - u * 0.12 * (1 - q) * (1 - q) - u * 0.02 + q * u * 0.02; c.fillStyle = '#f2c230'; ell(c, bx, yy, u * 0.012 * (1 - q * 0.6), u * 0.012); c.fillStyle = '#ffe680'; ell(c, bx - u * 0.003, yy - u * 0.003, u * 0.004, u * 0.004); }
    hit(x - tw / 2 - u * 0.03, top - u * 0.16, tw + u * 0.06, fy - top + u * 0.16, donateCard, x - tw * 0.2);
    hit(bx - bw / 2 - u * 0.02, by - u * 0.1 - bh - u * 0.04, bw + u * 0.04, bh + u * 0.15, donateCard, bx + u * 0.08); }
  // ---- the chandelier: two tiers of candles on gilded rings, hanging from the vault on a chain and swaying slightly
  { const ax = cx, sw = Math.sin(t * 0.6) * 0.025, cy0 = h * 0.19;
    c.save(); c.translate(ax, 0); c.rotate(sw); c.strokeStyle = '#a87a22'; c.lineWidth = u * 0.006; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, cy0 - u * 0.1); c.stroke();
    for (let i = 0; i < 10; i++) { c.strokeStyle = '#c99a32'; c.beginPath(); c.ellipse(0, i * (cy0 - u * 0.1) / 10, u * 0.006, u * 0.012, 0, 0, 7); c.stroke(); }
    const ring = (y, R, n, ph) => {
      const pts = Array.from({ length: n }, (_, k) => { const a = k / n * Math.PI * 2 + t * 0.05 + ph; return { x: Math.cos(a) * R, z: Math.sin(a) }; });
      const cand = p => { const yy = y - u * 0.02 + p.z * R * 0.18; c.fillStyle = '#f1d58a'; c.fillRect(p.x - u * 0.004, yy - u * 0.035, u * 0.008, u * 0.035); chFlame(c, p.x, yy - u * 0.036, u * 0.012 * (0.85 + p.z * 0.15), t, p.x); };
      pts.filter(p => p.z < 0).forEach(cand);
      c.strokeStyle = '#d9a93e'; c.lineWidth = u * 0.012; c.beginPath(); c.ellipse(0, y, R, R * 0.18, 0, 0, 7); c.stroke();
      c.strokeStyle = '#a87a22'; c.lineWidth = u * 0.004; for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + 0.4; c.beginPath(); c.moveTo(0, cy0 - u * 0.08); c.lineTo(Math.cos(a) * R, y + Math.sin(a) * R * 0.18); c.stroke(); }
      pts.filter(p => p.z >= 0).forEach(cand);
    };
    ring(cy0 + u * 0.08, u * 0.19, 10, 0); ring(cy0 + u * 0.18, u * 0.11, 6, 0.3);
    c.fillStyle = '#e0b44a'; circ(c, 0, cy0 + u * 0.24, u * 0.026); c.fillStyle = '#f2cc66'; circ(c, -u * 0.007, cy0 + u * 0.233, u * 0.009); c.fillStyle = '#c99a32'; poly(c, [[-u * 0.013, cy0 + u * 0.262], [u * 0.013, cy0 + u * 0.262], [0, cy0 + u * 0.31]]);
    c.restore();
    hit(ax - u * 0.26, cy0 - u * 0.05, u * 0.52, u * 0.42, word('svichka'), ax); }
  // ---- her
  inDraw(c, t);
  // incense haze drifting up through the light
  for (let i = 0; i < 9; i++) { const q = (t * 0.02 + i / 9) % 1, x = CH.lect * RW + Math.sin(t * 0.3 + i * 2) * u * 0.3 - u * 0.4 + i * u * 0.1, y = fy - q * h * 0.5; c.fillStyle = `rgba(255,250,240,${0.06 * Math.sin(q * Math.PI)})`; ell(c, x, y, u * (0.12 + q * 0.2), u * (0.05 + q * 0.06)); }
  c.restore();
  // dust motes turning in the window light
  if (day > 0.3) { c.fillStyle = `rgba(255,248,225,${0.5 * wxL})`; for (let i = 0; i < 26; i++) { const q = (t * 0.015 + i * 0.037) % 1; circ(c, ((i * 0.37 + Math.sin(t * 0.2 + i) * 0.03) % 1) * w, h * (0.85 - q * 0.6), 1.2); } }
  { const lights = [[CH.standL * RW - roomX, fy - u * 0.26, u * 0.55], [CH.standR * RW - roomX, fy - u * 0.26, u * 0.55], [CH.cx * RW - roomX, h * 0.19 + u * 0.12, u * 0.8], [CH.lect * RW - roomX, fy - u * 0.32, u * 0.3]];
    paintSky(c, w, h, t, lights, false); }
}

// ------------------------------------------------------------------ inside Grandma Olia's cottage
// Grandma cooks indoors. Her room is drawn like yours (swipe to look around) but it is all hers: the піч
// with her cat asleep on top, a counter where the ingredients for today's dish line up with how many she
// has of each, and the table, which stays bare until everything is gathered and then holds the hot dish.
// She greets you as you come in; tap her to talk again, and tap anything else to hear its name.
const OX = { stove: 0.085, rack: 0.335, olia: 0.478, clock: 0.537, win: 0.618, table: 0.738, chest: 0.822, bed: 0.898 };
const OLIA_PETS = ['Мурчик', 'Пушок'];
// First visit: once her greeting closes, the view pans to one end of the room, across to the other and back,
// and the name of everything you can tap pops up as the view reaches it (a wave sweeping along with the pan),
// stays a moment and fades: just so you know it's all there to tap.
let oliaWave = null;
let oliaHits = [], oliaTip = 0;   // first visit: 1 = waiting for her greeting to open, 2 = waiting for it to close
const recipeReady = R => recipeTotal(R) >= R.needs.length * NEED;
function enterOlia() { closeSheet(); fadeThen(enterOliaNow); }
function enterOliaNow() {
  mode = 'olia'; if (!S.oliaVisited) { S.oliaVisited = 1; save(); }
  $('#exit').innerHTML = lab('exit'); $('#decorBtn').style.display = 'none'; $('#wardBtn').style.display = 'none'; $('#homebar').style.display = 'flex';
  // Open on the counter and Grandma; once the dish is ready, on the table.
  const mid = (recipeReady(curRecipe()) ? OX.table : 0.385) * roomW() - cv.width / 2;
  roomX = mid; clampPan(); inStart(0.4);
  tour = null; blip(520);
  setTimeout(() => { if (mode === 'olia' && !sheetOpen()) talk(NPC.olia); }, 500);
  oliaTip = S.oliaTip ? 0 : 1;
}
function oliaTap(sx, py) {
  const px = sx + roomX;
  const [ba] = inBand();
  for (let i = oliaHits.length - 1; i >= 0; i--) { const r = oliaHits[i]; if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) { blip(700, 0.05); return inGo(r.x + r.w / 2, ba, r.fn); } }
  blip(560, 0.05);
  if (py > cv.height * 0.6) inWalkTo(px, py);   // the floor: walk there
}
function drawOlia(t) {
  const h = cv.height, c = ctx, u = roomU(), RW = roomW(), PL = roomPL(), wallB = h * 0.56, R = curRecipe(), ready = recipeReady(R), st = stage();
  if (tour) {
    const a = t - tour.t0, ease = k => k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, max = panMax();
    const mn = -roomPL(), legs = [[tour.mid, mn, 1.8], [mn, mn, 0.4], [mn, max, 3.6], [max, max, 0.4], [max, tour.mid, 1.8]];
    let k = a, i = 0;
    while (i < legs.length && k > legs[i][2]) { k -= legs[i][2]; i++; }
    if (i >= legs.length) { roomX = tour.mid; tour = null; }
    else { const [p, q, d] = legs[i]; roomX = p + (q - p) * ease(Math.min(1, k / d)); if (oliaWave) oliaWave.pass = i < 2 ? 0 : i < 4 ? 1 : 2; }
  }
  clampPan(); inStep(t);
  if (oliaTip === 1 && sheetOpen()) oliaTip = 2;
  else if (oliaTip === 2 && !sheetOpen() && !sp) { oliaTip = 0; S.oliaTip = 1; save(); if (panMax() > 10) { tour = { t0: t, mid: roomX }; oliaWave = { seen: {}, pass: 0 }; } toast('👀 Роздивись бабину хату!' + (stage() < 3 ? ' · Explore Grandma’s room: tap things to hear their names.' : ''), 5000); }
  oliaHits = [];
  const hit = (x, y, ww, hh, fn) => oliaHits.push({ x, y, w: ww, h: hh, fn });
  const word = (id, o) => Object.assign(() => { if (W[id]) wordCard(id, o); }, { wid: id });   // wid: for the name labels
  const icon = (id, x, y, s, o) => { drawIcon(c, W[id].ic, x, y, s); hit(x - s * 0.45, y - s, s * 0.9, s * 1.03, word(id, o)); };
  const shadow = (x, y, rx) => { c.fillStyle = 'rgba(60,40,20,.16)'; ell(c, x, y, rx, rx * 0.17); };
  const flower = (x, y, r, col, mid) => { c.fillStyle = col; for (let k = 0; k < 5; k++) { const a = k * 1.2566 - 1.57; circ(c, x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.72); } c.fillStyle = mid || '#f2c230'; circ(c, x, y, r * 0.55); };
  const leaf = (x, y, r, rot) => { c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = '#5fa046'; ell(c, r, 0, r, r * 0.42); c.restore(); };
  c.save(); c.translate(-roomX, 0);

  // ---- whitewashed wall, the dark ceiling beam (сволок), and a painted Petrykivka garland under it
  const beamT = Math.max(h * 0.075, wallB - u * 0.88), beamB = beamT + u * 0.05;
  c.fillStyle = '#fdf5e4'; c.fillRect(-PL, 0, RW + PL, wallB);
  c.fillStyle = 'rgba(190,150,100,.05)'; for (let i = 0; i < 46; i++) ell(c, ((i * 0.618) % 1) * RW, beamB + ((i * 0.377) % 1) * (wallB - beamB), u * 0.2, u * 0.05);
  c.fillStyle = '#efe2c8'; c.fillRect(-PL, 0, RW + PL, beamT);
  c.fillStyle = 'rgba(120,80,40,.10)'; for (let x = -PL; x < RW; x += u * 0.16) c.fillRect(x, 0, u * 0.006 + 1, beamT);
  c.fillStyle = '#7a4e26'; c.fillRect(-PL, beamT, RW + PL, beamB - beamT);
  c.fillStyle = '#5e3a1b'; c.fillRect(-PL, beamB - u * 0.009, RW + PL, u * 0.009);
  c.fillStyle = 'rgba(255,230,190,.14)'; c.fillRect(-PL, beamT, RW + PL, u * 0.007);
  c.strokeStyle = 'rgba(60,35,15,.25)'; c.lineWidth = 1; for (let x = u * 0.1; x < RW; x += u * 0.37) { c.beginPath(); c.moveTo(x, beamT + u * 0.02); c.lineTo(x + u * 0.2, beamT + u * 0.024); c.stroke(); }
  const fk = u * 0.026, fy = beamB + fk * 2.1, vine = x => fy + Math.sin(x / fk * 0.5) * fk * 0.55;
  c.strokeStyle = '#4f8f3a'; c.lineWidth = fk * 0.2; c.beginPath(); for (let x = -PL; x <= RW; x += fk) { if (x > -PL) c.lineTo(x, vine(x)); else c.moveTo(x, vine(x)); } c.stroke();
  for (let i = 0, x = fk * 3 - Math.ceil(PL / (fk * 6.28)) * fk * 6.28; x < RW; x += fk * 6.28, i++) {
    const y = vine(x);
    leaf(x - fk * 0.7, y, fk * 0.8, Math.PI + 0.5); leaf(x + fk * 0.7, y, fk * 0.8, -0.5);
    if (i % 2) { c.fillStyle = '#3d7cc2'; circ(c, x - fk * 0.5, y - fk * 0.5, fk * 0.36); circ(c, x + fk * 0.4, y - fk * 0.7, fk * 0.36); circ(c, x, y - fk * 0.05, fk * 0.4); }
    else flower(x, y - fk * 0.25, fk * 0.58, '#d43a3a');
    c.fillStyle = '#e2a23a'; circ(c, x + fk * 3.14, vine(x + fk * 3.14) + fk * 0.5, fk * 0.26);
  }

  // ---- the window: lace along the top, the рушник draped over it, geraniums and a pysanka on the sill
  const wx = OX.win * RW, ww = u * 0.3, wb = wallB - u * 0.17, wt = wb - u * 0.27;
  c.save(); c.beginPath(); c.rect(wx - ww / 2, wt, ww, wb - wt); c.clip();
  let g;
  windowView(c, wx - ww / 2, wt, ww, wb - wt, t, 3, 1);   // the season, weather and time of day outside
  c.fillStyle = 'rgba(255,255,255,.9)'; for (let i = 0; i <= 8; i++) circ(c, wx - ww / 2 + i * ww / 8, wt, ww / 14);
  c.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 8; i++) circ(c, wx - ww / 2 + (i + 0.5) * ww / 8, wt + ww / 13, ww / 26);
  c.restore();
  c.strokeStyle = '#3d7cc2'; c.lineWidth = u * 0.022; c.strokeRect(wx - ww / 2, wt, ww, wb - wt);
  c.lineWidth = u * 0.012; c.beginPath(); c.moveTo(wx, wt); c.lineTo(wx, wb); c.moveTo(wx - ww / 2, (wt + wb) / 2); c.lineTo(wx + ww / 2, (wt + wb) / 2); c.stroke();
  c.fillStyle = '#c08a55'; rr(c, wx - ww / 2 - u * 0.03, wb, ww + u * 0.06, u * 0.025, 4);
  windowRushnyk(c, wx, ww, wt, wb, u);
  hit(wx - ww * 0.75, wt - u * 0.05, ww * 1.5, (wb - wt) * 0.7, word('rushnyk'));
  for (const [dx, col] of [[-0.085, '#e2574c'], [0.07, '#ff7aa8']]) {   // geraniums (калачики) in clay pots
    const px = wx + dx * u, pw = u * 0.028;
    c.fillStyle = '#b5653a'; poly(c, [[px - pw, wb - u * 0.045], [px + pw, wb - u * 0.045], [px + pw * 0.75, wb], [px - pw * 0.75, wb]]); c.fillStyle = '#9c5530'; c.fillRect(px - pw * 1.1, wb - u * 0.05, pw * 2.2, u * 0.012);
    for (const [lx, ly, rot] of [[-0.9, -0.058, 2.6], [0.9, -0.06, 0.5], [0, -0.075, -1.57]]) leaf(px + lx * pw * 0.3, wb + ly * u, u * 0.02, rot);
    for (const [fx, fyy] of [[-0.7, -0.092], [0.6, -0.1], [0, -0.115]]) flower(px + fx * pw, wb + fyy * u + Math.sin(t * 1.2 + fx) * 0.6, u * 0.011, col);
  }
  icon('pysanka', wx - u * 0.005, wb + 1, u * 0.06);

  // ---- the floor, and sunlight from the window lying across it
  c.fillStyle = '#c4935c'; c.fillRect(-PL, wallB, RW + PL, h - wallB);
  c.strokeStyle = 'rgba(120,80,40,.28)'; c.lineWidth = Math.max(2, h * 0.003);
  for (let i = 1; i < 9; i++) { const y = wallB + (h - wallB) * (i / 9) ** 1.25; c.beginPath(); c.moveTo(-PL, y); c.lineTo(RW, y); c.stroke(); }
  c.fillStyle = '#4a90d9'; c.fillRect(-PL, wallB - h * 0.012, RW + PL, h * 0.014);
  g = c.createLinearGradient(0, wallB, 0, wallB + h * 0.05); g.addColorStop(0, 'rgba(90,60,30,.25)'); g.addColorStop(1, 'rgba(90,60,30,0)'); c.fillStyle = g; c.fillRect(-PL, wallB, RW + PL, h * 0.05);
  { const d = roomDoor(c, t, wallB); hit(d.x, d.y, d.w, d.h, exitHome); }   // the door out, at the far left
  c.fillStyle = 'rgba(255,238,170,.17)'; poly(c, [[wx - ww * 0.45, wallB + h * 0.03], [wx + ww * 0.45, wallB + h * 0.03], [wx + ww * 0.1, wallB + h * 0.2], [wx - ww * 1.0, wallB + h * 0.2]]);
  // the woven runner (доріжка) along the floor
  const ry = h * 0.855, rh = Math.min(h * 0.075, u * 0.13), rx0 = RW * 0.19, rx1 = RW * 0.965, band = u * 0.021;
  const rc = ['#c23b2f', '#c23b2f', '#fffdf5', '#2d2d2d', '#fffdf5', '#c23b2f', '#c23b2f', '#e0a93b', '#3f8a3a', '#3f8a3a', '#e0a93b'];
  c.fillStyle = 'rgba(60,40,20,.14)'; c.fillRect(rx0, ry + rh, rx1 - rx0, h * 0.006);
  for (let x = rx0, i = 0; x < rx1; x += band, i++) { c.fillStyle = rc[i % rc.length]; c.fillRect(x, ry, Math.min(band + 1, rx1 - x), rh); }
  c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(rx0, ry, rx1 - rx0, rh * 0.18); c.fillStyle = 'rgba(60,30,10,.12)'; c.fillRect(rx0, ry + rh * 0.82, rx1 - rx0, rh * 0.18);
  c.strokeStyle = '#f3e6c8'; c.lineWidth = 1.5; for (let y = ry + 2; y < ry + rh; y += 4) { c.beginPath(); c.moveTo(rx0, y); c.lineTo(rx0 - u * 0.016, y); c.moveTo(rx1, y); c.lineTo(rx1 + u * 0.016, y); c.stroke(); }

  // ---- the піч, its fire glowing, firewood and a clay pot beside it, and Мурчик asleep on top
  const sx = OX.stove * RW, sby = h * 0.585, ss = u * 0.6;
  shadow(sx, sby, ss * 0.42);
  icon('pich', sx, sby, ss);
  const fl = 0.75 + Math.sin(t * 9) * 0.12 + Math.sin(t * 5.3) * 0.1;
  g = c.createRadialGradient(sx, sby - ss * 0.08, 0, sx, sby - ss * 0.08, ss * 0.55); g.addColorStop(0, `rgba(255,170,70,${0.3 * fl})`); g.addColorStop(1, 'rgba(255,170,70,0)'); c.fillStyle = g; c.fillRect(sx - ss, sby - ss * 0.7, ss * 2, ss * 1.1);
  for (const [dx, dy, col] of [[-0.27, -0.3, '#d43a3a'], [0.27, -0.3, '#d43a3a']]) { leaf(sx + dx * ss - ss * 0.03, sby + dy * ss + ss * 0.03, ss * 0.028, 2.4); leaf(sx + dx * ss + ss * 0.03, sby + dy * ss + ss * 0.03, ss * 0.028, 0.7); flower(sx + dx * ss, sby + dy * ss, ss * 0.022, col); }
  const mcx = sx + ss * 0.2, mcy = sby - ss * 0.835, mcs = u * 0.2;
  sleepingCat(c, mcx, mcy, mcs, CATS[1], t);
  hit(mcx - mcs * 0.45, mcy - mcs * 0.55, mcs * 0.9, mcs * 0.6, word('kit', { note: `❤️ <b>${OLIA_PETS[0]}</b>${xl(" · Grandma's cat. He sleeps on the warm stove.")}` }));
  // firewood
  const wxl = sx + ss * 0.56, wy = sby + u * 0.012;
  shadow(wxl, wy, u * 0.075);
  for (const [dx, dy] of [[-0.036, 0], [0, 0], [0.036, 0], [-0.018, -0.031], [0.018, -0.031], [0, -0.062]]) { c.fillStyle = '#8a5a2b'; circ(c, wxl + dx * u, wy - u * 0.018 + dy * u, u * 0.018); c.fillStyle = '#d9b07a'; circ(c, wxl + dx * u, wy - u * 0.018 + dy * u, u * 0.012); c.strokeStyle = '#b98a52'; c.lineWidth = 1; c.beginPath(); c.arc(wxl + dx * u, wy - u * 0.018 + dy * u, u * 0.006, 0, 7); c.stroke(); }
  // the oven fork (рогач) leaning on the wall
  c.strokeStyle = '#6b4422'; c.lineWidth = u * 0.008; c.lineCap = 'round'; c.beginPath(); c.moveTo(sx + ss * 0.47, sby); c.lineTo(sx + ss * 0.43, sby - u * 0.36); c.stroke();
  c.strokeStyle = '#3b3b40'; c.lineWidth = u * 0.007; c.beginPath(); c.arc(sx + ss * 0.43, sby - u * 0.385, u * 0.025, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  shadow(sx + ss * 0.78, sby + u * 0.03, u * 0.05);
  icon('hlechyk', sx + ss * 0.78, sby + u * 0.035, u * 0.14);

  // ---- hanging from the beam: garlic, onions, herbs, red peppers, and a string of dried mushrooms
  const hang = (x, len, fn) => { c.strokeStyle = '#a58a5e'; c.lineWidth = Math.max(1, u * 0.003); c.beginPath(); c.moveTo(x, beamB); c.lineTo(x, beamB + len * 0.25); c.stroke(); fn(x, beamB + len * 0.2, len * 0.8); };
  const hx0 = sx + ss * 0.52, hgap = u * 0.066;
  hang(hx0, u * 0.24, (x, y, L) => { for (let i = 0; i < 6; i++) { c.fillStyle = '#f6f0e2'; circ(c, x + (i % 2 ? 1 : -1) * u * 0.011, y + i * L / 6, u * 0.016); c.fillStyle = '#d9cdb4'; circ(c, x + (i % 2 ? 1 : -1) * u * 0.011, y + i * L / 6 + u * 0.006, u * 0.006); } });
  hit(hx0 - u * 0.03, beamB, u * 0.06, u * 0.24, word('chasnyk'));
  hang(hx0 + hgap, u * 0.27, (x, y, L) => { for (let i = 0; i < 5; i++) { c.fillStyle = '#d99a3a'; circ(c, x + (i % 2 ? 1 : -1) * u * 0.013, y + i * L / 5, u * 0.021); c.fillStyle = '#f0c36a'; circ(c, x + (i % 2 ? 1 : -1) * u * 0.013 - u * 0.006, y + i * L / 5 - u * 0.006, u * 0.007); } });
  hit(hx0 + hgap - u * 0.03, beamB, u * 0.06, u * 0.27, word('tsybulia'));
  hang(hx0 + hgap * 2, u * 0.2, (x, y, L) => { c.strokeStyle = '#6f9a4a'; c.lineWidth = u * 0.006; for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + i * u * 0.008, y + L); c.stroke(); } c.fillStyle = '#9b6bd6'; for (let i = -3; i <= 3; i++) circ(c, x + i * u * 0.008, y + L, u * 0.006); c.fillStyle = '#c23b2f'; c.fillRect(x - u * 0.008, y + L * 0.12, u * 0.016, u * 0.008); });
  hang(hx0 + hgap * 3, u * 0.22, (x, y, L) => { for (let i = 0; i < 6; i++) { c.save(); c.translate(x, y + i * L / 6.5); c.rotate((i % 2 ? 1 : -1) * 0.7); c.fillStyle = '#c8322b'; ell(c, 0, u * 0.014, u * 0.008, u * 0.02); c.fillStyle = '#4f8f3a'; circ(c, 0, -u * 0.003, u * 0.005); c.restore(); } });
  const mx0 = OX.rack * RW + u * 0.36, mx1 = OX.clock * RW - u * 0.2;
  c.strokeStyle = '#a58a5e'; c.lineWidth = Math.max(1, u * 0.003); c.beginPath(); c.moveTo(mx0, beamB); c.quadraticCurveTo((mx0 + mx1) / 2, beamB + u * 0.13, mx1, beamB); c.stroke();
  for (let i = 1; i < 8; i++) { const k = i / 8, x = mx0 + (mx1 - mx0) * k, y = beamB + u * 0.13 * 2 * k * (1 - k) + u * 0.004; c.fillStyle = '#e8dcc0'; c.fillRect(x - u * 0.004, y, u * 0.008, u * 0.016); c.fillStyle = i % 2 ? '#9a6a3c' : '#b98452'; c.beginPath(); c.arc(x, y + u * 0.004, u * 0.014, Math.PI, 0); c.fill(); }
  hit(mx0, beamB, mx1 - mx0, u * 0.1, word('hryb'));

  // ---- the counter under the plate rack: today's ingredients in a row, each with how many Grandma has
  const cx = OX.rack * RW, cw = u * 0.72, cby = h * 0.6, chh = u * 0.19, ctop = cby - chh, cl = cx - cw / 2;
  // the plate rack (мисник): painted plates on top, jugs and jars of jam and pickles below
  const b1 = ctop - u * 0.185, b2 = b1 - u * 0.14, rw = u * 0.6;
  c.fillStyle = '#8a5a2b'; c.fillRect(cx - rw / 2 - u * 0.012, b2 - u * 0.135, u * 0.014, b1 - b2 + u * 0.155); c.fillRect(cx + rw / 2 - u * 0.002, b2 - u * 0.135, u * 0.014, b1 - b2 + u * 0.155);
  c.fillStyle = 'rgba(138,90,43,.16)'; c.fillRect(cx - rw / 2, b2 - u * 0.13, rw, b1 - b2 + u * 0.13);
  for (let i = 0; i < 4; i++) icon('tarilka', cx - rw * 0.36 + i * rw * 0.24, b2, u * 0.115);
  const jar = (x, col, lid) => { c.fillStyle = 'rgba(255,255,255,.55)'; rr(c, x - u * 0.021, b1 - u * 0.062, u * 0.042, u * 0.062, u * 0.008); c.fillStyle = col; rr(c, x - u * 0.018, b1 - u * 0.048, u * 0.036, u * 0.045, u * 0.006); c.fillStyle = lid; rr(c, x - u * 0.02, b1 - u * 0.072, u * 0.04, u * 0.014, u * 0.004); c.fillStyle = '#fffdf5'; c.fillRect(x - u * 0.012, b1 - u * 0.036, u * 0.024, u * 0.014); };
  icon('hlechyk', cx - rw * 0.37, b1 + u * 0.004, u * 0.1);
  jar(cx - rw * 0.2, '#b3243a', '#d43a3a'); jar(cx - rw * 0.11, '#c0392b', '#fffdf5'); jar(cx - rw * 0.02, '#7fa83c', '#e0a93b'); jar(cx + rw * 0.07, '#e0a93b', '#fffdf5');
  hit(cx + rw * 0.03, b1 - u * 0.075, u * 0.08, u * 0.075, word('med'));
  icon('hlechyk', cx + rw * 0.2, b1 + u * 0.004, u * 0.085);
  c.fillStyle = '#fffdf5'; for (let i = 0; i < 3; i++) { rr(c, cx + rw * 0.3 + i * u * 0.004, b1 - u * 0.03 - i * u * 0.012, u * 0.07 - i * u * 0.008, u * 0.012, u * 0.004); } c.fillStyle = '#3d7cc2'; c.fillRect(cx + rw * 0.3, b1 - u * 0.024, u * 0.07, u * 0.003);
  for (const y of [b1, b2]) { c.fillStyle = '#a06a34'; rr(c, cx - rw / 2 - u * 0.02, y, rw + u * 0.04, u * 0.02, u * 0.005); c.fillStyle = '#fffdf5'; for (let x = cx - rw / 2; x < cx + rw / 2; x += u * 0.024) { poly(c, [[x, y + u * 0.02], [x + u * 0.024, y + u * 0.02], [x + u * 0.012, y + u * 0.038]]); } c.fillStyle = '#d43a3a'; for (let x = cx - rw / 2 + u * 0.012; x < cx + rw / 2; x += u * 0.024) circ(c, x, y + u * 0.027, u * 0.003); }
  // the counter itself: three painted doors under a thick wooden top
  shadow(cx, cby, cw * 0.55);
  c.fillStyle = '#9a6a3a'; rr(c, cl, ctop, cw, chh, u * 0.012);
  c.fillStyle = '#7d5429'; c.fillRect(cl, cby - u * 0.018, cw, u * 0.018);
  const dw = (cw - u * 0.08) / 3;
  for (let i = 0; i < 3; i++) {
    const dx = cl + u * 0.02 + i * (dw + u * 0.02), dy = ctop + u * 0.055, dh = chh - u * 0.085;
    c.fillStyle = '#b6824c'; rr(c, dx, dy, dw, dh, u * 0.008); c.strokeStyle = '#8a5a2b'; c.lineWidth = Math.max(1, u * 0.004); c.strokeRect(dx + u * 0.012, dy + u * 0.012, dw - u * 0.024, dh - u * 0.024);
    leaf(dx + dw / 2 - u * 0.012, dy + dh / 2 + u * 0.016, u * 0.016, 2.5); leaf(dx + dw / 2 + u * 0.012, dy + dh / 2 + u * 0.016, u * 0.016, 0.6); flower(dx + dw / 2, dy + dh / 2 - u * 0.004, u * 0.013, i % 2 ? '#3d7cc2' : '#d43a3a');
    c.fillStyle = '#5e3a1b'; circ(c, dx + dw - u * 0.022, dy + dh * 0.3, u * 0.006);
  }
  c.fillStyle = '#e0b272'; rr(c, cl - u * 0.016, ctop - u * 0.024, cw + u * 0.032, u * 0.034, u * 0.008);
  c.fillStyle = '#c4935c'; c.fillRect(cl - u * 0.016, ctop + u * 0.002, cw + u * 0.032, u * 0.008);
  const n = R.needs.length, gap = Math.min(u * 0.112, (cw - u * 0.04) / n), is = Math.min(u * 0.1, gap * 0.95), ix0 = cl + u * 0.02 + gap / 2, top = ctop - u * 0.022;
  R.needs.forEach((id, i) => {
    const have = recipeHave(id), full = have >= NEED, x = ix0 + i * gap;
    c.fillStyle = 'rgba(60,40,20,.14)'; ell(c, x, top, is * 0.36, is * 0.06);
    c.globalAlpha = have ? 1 : 0.34; drawIcon(c, W[id].ic, x, top + 1, is); c.globalAlpha = 1;
    const pw = Math.min(u * 0.074, gap * 0.86), ph = u * 0.04, py = ctop + u * 0.012;
    c.font = `800 ${Math.round(u * 0.03)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(60,40,20,.2)'; rr(c, x - pw / 2, py + 2, pw, ph, ph / 2);
    c.fillStyle = full ? '#3f8a3a' : '#fff8ea'; rr(c, x - pw / 2, py, pw, ph, ph / 2);
    c.fillStyle = full ? '#fff' : '#4a2c1a'; c.fillText(full ? '✓' : `${have}/${NEED}`, x, py + ph / 2 + 1);
    hit(x - gap / 2, top - is, gap, is + ph + u * 0.04, word(id, { note: `🥣 <b>${have} / ${NEED}</b>${full ? '' : `<br><small>${(S.seeds[id] || 0) > 0 ? '🌱 ' + D.ui.plantit[0] : sourceHint(id)}</small>`}` }));
  });

  // ---- the cuckoo clock (ходики) with its pine-cone weights, and a tear-off calendar
  const kx = OX.clock * RW, ky = wallB - u * 0.5, kr = u * 0.042, now2 = new Date(), swing = Math.sin(t * 3) * 0.3;
  c.strokeStyle = '#8a7a5a'; c.lineWidth = Math.max(1, u * 0.003);
  for (const [dx, len] of [[-0.022, 0.2], [0.022, 0.26]]) { c.beginPath(); c.moveTo(kx + dx * u, ky + kr); c.lineTo(kx + dx * u, ky + len * u); c.stroke(); c.fillStyle = '#7a4e26'; ell(c, kx + dx * u, ky + len * u + u * 0.018, u * 0.011, u * 0.02); }
  c.save(); c.translate(kx, ky + kr); c.rotate(swing); c.strokeStyle = '#8a5a2b'; c.lineWidth = u * 0.005; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, u * 0.12); c.stroke(); c.fillStyle = '#e0a93b'; circ(c, 0, u * 0.125, u * 0.016); c.restore();
  c.fillStyle = '#7a4e26'; poly(c, [[kx - kr * 1.55, ky - kr * 0.9], [kx, ky - kr * 2.2], [kx + kr * 1.55, ky - kr * 0.9]]);
  c.fillStyle = '#9a6a3a'; rr(c, kx - kr * 1.25, ky - kr * 1.05, kr * 2.5, kr * 2.3, u * 0.008);
  c.fillStyle = '#3b2f2a'; rr(c, kx - kr * 0.22, ky - kr * 1.72, kr * 0.44, kr * 0.5, kr * 0.2);
  c.fillStyle = '#fffdf5'; circ(c, kx, ky + kr * 0.1, kr * 0.92); c.strokeStyle = '#5e3a1b'; c.lineWidth = u * 0.004; c.beginPath(); c.arc(kx, ky + kr * 0.1, kr * 0.92, 0, 7); c.stroke();
  c.fillStyle = '#5e3a1b'; for (let i = 0; i < 12; i++) circ(c, kx + Math.sin(i * 0.5236) * kr * 0.74, ky + kr * 0.1 - Math.cos(i * 0.5236) * kr * 0.74, i % 3 ? u * 0.0025 : u * 0.0045);
  const hand = (a, len, lw) => { c.strokeStyle = '#3b2f2a'; c.lineWidth = lw; c.beginPath(); c.moveTo(kx, ky + kr * 0.1); c.lineTo(kx + Math.sin(a) * len, ky + kr * 0.1 - Math.cos(a) * len); c.stroke(); };
  hand((now2.getHours() % 12 + now2.getMinutes() / 60) * 0.5236, kr * 0.45, u * 0.007); hand(now2.getMinutes() * 0.10472, kr * 0.68, u * 0.005);
  hit(kx - kr * 1.6, ky - kr * 2.2, kr * 3.2, kr * 4.4, word('hodynnyk'));
  const qx = kx - u * 0.125, qy = ky - u * 0.02, qw = u * 0.07;
  c.fillStyle = 'rgba(60,40,20,.15)'; c.fillRect(qx - qw / 2 + 2, qy + 3, qw, qw * 1.25);
  c.fillStyle = '#d43a3a'; c.fillRect(qx - qw / 2, qy, qw, qw * 0.34); c.fillStyle = '#fffdf5'; c.fillRect(qx - qw / 2, qy + qw * 0.34, qw, qw * 0.9);
  c.fillStyle = '#d43a3a'; c.font = `900 ${Math.round(qw * 0.6)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(now2.getDate()), qx, qy + qw * 0.82);
  c.fillStyle = '#8a7a5a'; circ(c, qx, qy - u * 0.004, u * 0.005);

  // ---- old family photographs with a рушник draped over them
  const fx = OX.table * RW, fyy = wallB - u * 0.44;
  for (const [dx, tone] of [[-0.062, '#d8c3a0'], [0.062, '#cdb893']]) {
    const px = fx + dx * u;
    c.fillStyle = '#6b4422'; ell(c, px, fyy, u * 0.05, u * 0.064); c.fillStyle = '#e0a93b'; ell(c, px, fyy, u * 0.044, u * 0.058); c.fillStyle = tone; ell(c, px, fyy, u * 0.038, u * 0.052);
    c.save(); c.beginPath(); c.ellipse(px, fyy, u * 0.038, u * 0.052, 0, 0, 7); c.clip();
    c.fillStyle = '#8f7558'; circ(c, px, fyy - u * 0.012, u * 0.016); ell(c, px, fyy + u * 0.045, u * 0.03, u * 0.032);
    if (dx < 0) { c.fillStyle = '#6f5a44'; c.beginPath(); c.arc(px, fyy - u * 0.014, u * 0.018, Math.PI, 0); c.fill(); }   // her headscarf
    else { c.fillStyle = '#6f5a44'; c.fillRect(px - u * 0.012, fyy - u * 0.003, u * 0.024, u * 0.004); }                   // his moustache
    c.restore();
  }
  const dl = fx - u * 0.155, dr = fx + u * 0.155, dt = fyy - u * 0.105, linen = '#fffdf5', red = '#d43a3a';
  c.fillStyle = linen; c.beginPath(); c.moveTo(dl, dt); c.quadraticCurveTo(fx, dt + u * 0.045, dr, dt); c.lineTo(dr, dt + u * 0.03); c.quadraticCurveTo(fx, dt + u * 0.075, dl, dt + u * 0.03); c.closePath(); c.fill();
  c.strokeStyle = red; c.lineWidth = u * 0.006; c.beginPath(); c.moveTo(dl, dt + u * 0.02); c.quadraticCurveTo(fx, dt + u * 0.065, dr, dt + u * 0.02); c.stroke();
  for (const ex of [dl - u * 0.02, dr - u * 0.02]) {
    c.fillStyle = linen; c.fillRect(ex, dt - u * 0.004, u * 0.04, u * 0.2);
    c.fillStyle = red; c.fillRect(ex, dt + u * 0.13, u * 0.04, u * 0.012); c.fillRect(ex, dt + u * 0.168, u * 0.04, u * 0.008);
    c.fillStyle = '#2d2d2d'; c.fillRect(ex, dt + u * 0.15, u * 0.04, u * 0.004);
    c.fillStyle = red; poly(c, [[ex + u * 0.02, dt + u * 0.085], [ex + u * 0.032, dt + u * 0.1], [ex + u * 0.02, dt + u * 0.115], [ex + u * 0.008, dt + u * 0.1]]);
    c.strokeStyle = '#e8dcc6'; c.lineWidth = 1; for (let x = ex + 2; x < ex + u * 0.04; x += 3) { c.beginPath(); c.moveTo(x, dt + u * 0.196); c.lineTo(x, dt + u * 0.212); c.stroke(); }
  }
  c.fillStyle = '#8a5a2b'; circ(c, dl, dt, u * 0.006); circ(c, dr, dt, u * 0.006);
  hit(dl - u * 0.02, dt - u * 0.01, dr - dl + u * 0.04, u * 0.22, word('rushnyk'));

  // ---- a wreath, the wall carpet over the bed, the bed with its pillow pyramid, and slippers
  icon('vinok', (OX.chest - 0.012) * RW, wallB - u * 0.36, u * 0.13);
  const bedx = OX.bed * RW, bedy = h * 0.585;
  c.fillStyle = '#6b4422'; rr(c, bedx - u * 0.26, wallB - u * 0.615, u * 0.52, u * 0.014, u * 0.005);
  drawIcon(c, W.kylym.ic, bedx, wallB - u * 0.37, u * 0.5); hit(bedx - u * 0.26, wallB - u * 0.6, u * 0.52, u * 0.22, word('kylym'));
  shadow(bedx, bedy, u * 0.3);
  icon('lizhko', bedx, bedy, u * 0.58);
  for (const dx of [-0.03, 0.012]) { const lx = bedx - u * 0.12 + dx * u, ly = bedy + u * 0.05; c.fillStyle = 'rgba(60,40,20,.16)'; ell(c, lx, ly + u * 0.004, u * 0.022, u * 0.008); c.fillStyle = '#8f2f2a'; ell(c, lx, ly, u * 0.02, u * 0.01); c.fillStyle = '#c23b2f'; ell(c, lx + u * 0.006, ly - u * 0.004, u * 0.014, u * 0.009); c.fillStyle = '#fffdf5'; circ(c, lx + u * 0.012, ly - u * 0.008, u * 0.005); }

  // ---- the bench under the window with its woven cover, the didukh, the dowry chest and the doll on it
  const lx0 = wx - u * 0.18, lw = u * 0.36, lty = h * 0.585 - u * 0.12;
  shadow(wx, h * 0.585, lw * 0.5);
  c.fillStyle = '#7a4e26'; c.fillRect(lx0 + u * 0.02, lty, u * 0.022, u * 0.12); c.fillRect(lx0 + lw - u * 0.042, lty, u * 0.022, u * 0.12);
  c.fillStyle = '#a06a34'; rr(c, lx0, lty, lw, u * 0.026, u * 0.006);
  for (let x = lx0 + u * 0.03, i = 0; x < lx0 + lw - u * 0.03; x += u * 0.017, i++) { c.fillStyle = ['#c23b2f', '#fffdf5', '#2d2d2d', '#fffdf5', '#c23b2f', '#e0a93b'][i % 6]; c.fillRect(x, lty - u * 0.006, Math.min(u * 0.018, lx0 + lw - u * 0.03 - x), u * 0.05); }
  shadow(fx - u * 0.1, h * 0.585, u * 0.08);
  icon('didukh', fx - u * 0.1, h * 0.585, u * 0.34);
  const chx = OX.chest * RW, chy = h * 0.6;
  shadow(chx, chy, u * 0.14);
  icon('skrynia', chx, chy, u * 0.3);
  icon('motanka', chx + u * 0.03, chy - u * 0.2, u * 0.15);

  // ---- Grandma Olia at her counter, in her apron
  const ox = OX.olia * RW, oy = h * 0.6 + u * 0.055, sc = u * 0.0046, npcS = S.npc.olia;
  person(c, ox, oy, Object.assign({ noArms: true }, NPC.olia.look), t, false, sc);
  c.save(); c.translate(ox, oy); c.scale(sc, sc);
  c.fillStyle = '#fffdf5'; rr(c, -9.5, -31, 19, 22, 3); c.fillStyle = '#d43a3a'; c.fillRect(-9.5, -13, 19, 2); c.fillRect(-9.5, -31, 19, 1.6);
  flower(0, -19, 2.4, '#d43a3a'); c.fillStyle = '#4f8f3a'; ell(c, -4.2, -16.5, 2, 0.9); ell(c, 4.2, -16.5, 2, 0.9);
  {
    const L = NPC.olia.look, sa = t * 4.2, bx = -3, rim = -38, hx = bx + 3 + Math.cos(sa) * 6.5, hy = rim - 8.5 + Math.sin(sa) * 2, tipx = bx + Math.cos(sa) * 3.5, tipy = rim + 3;
    const limb = (x0, y0, ex, ey, x1, y1) => {   // sleeve, embroidered cuff, hand
      c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = L.shirt; c.lineWidth = 7; c.beginPath(); c.moveTo(x0, y0); c.lineTo(ex, ey); c.lineTo(x1, y1); c.stroke();
      const d = Math.hypot(x1 - ex, y1 - ey) || 1, ux = (x1 - ex) / d, uy = (y1 - ey) / d;
      c.strokeStyle = L.trim; c.lineWidth = 7; c.lineCap = 'butt'; c.beginPath(); c.moveTo(x1 - ux * 3.2, y1 - uy * 3.2); c.lineTo(x1 - ux * 0.8, y1 - uy * 0.8); c.stroke();
      c.fillStyle = L.skin; circ(c, x1 + ux * 1.5, y1 + uy * 1.5, 3.6);
    };
    // the bowl, tucked against her
    c.fillStyle = '#a8562f'; c.beginPath(); c.moveTo(bx - 14, rim); c.quadraticCurveTo(bx - 12, rim + 15, bx - 6, rim + 15); c.lineTo(bx + 6, rim + 15); c.quadraticCurveTo(bx + 12, rim + 15, bx + 14, rim); c.closePath(); c.fill();
    c.strokeStyle = '#f3e6c8'; c.lineWidth = 1; c.beginPath(); for (let i = 0; i <= 10; i++) { const x = bx - 10 + i * 2, y = rim + 7 + (i % 2 ? -1.2 : 1.2); if (i) c.lineTo(x, y); else c.moveTo(x, y); } c.stroke();
    c.fillStyle = '#c56a3c'; ell(c, bx, rim, 14, 3.2); c.fillStyle = '#f3e3c4'; ell(c, bx, rim + 0.3, 11.5, 2.1);
    c.strokeStyle = 'rgba(190,160,110,.7)'; c.lineWidth = 0.9; c.beginPath(); c.ellipse(bx, rim + 0.3, 6.5, 1.1, 0, sa, sa + 4.2); c.stroke();   // the batter turning
    // the spoon, then the arm that works it; the other arm holds the bowl
    c.strokeStyle = '#9b6b3c'; c.lineWidth = 2.4; c.lineCap = 'round'; c.beginPath(); c.moveTo(hx, hy); c.lineTo(tipx, tipy); c.stroke();
    limb(-15.5, -46, -19.5, -36, bx - 12.5, rim + 5);
    limb(15.5, -46, 21.5 + Math.cos(sa) * 1.2, -39 + Math.sin(sa) * 1, hx + 1.5, hy);
  }
  c.restore();
  const bob = Math.sin(t * 2.5) * u * 0.006, btop = oy - u * 0.465 + bob, bR = u * 0.05;
  // No speech bubble over her head in here: she greets you as you come in, and the counter shows what she needs.
  hit(ox - u * 0.11, btop - bR, u * 0.22, oy - btop + bR, () => talk(NPC.olia));

  // ---- the table with its embroidered cloth: bare until everything is gathered, then the dish, steaming
  const tx = fx, tby = h * 0.8, tw = u * 0.6, th = u * 0.25, ttop = tby - th;
  shadow(tx, tby, tw * 0.55);
  for (const side of [-1, 1]) {   // a stool at each end
    const qx2 = tx + side * (tw / 2 + u * 0.085), qy2 = tby - u * 0.012;
    shadow(qx2, qy2, u * 0.07);
    c.fillStyle = '#7a4e26'; c.fillRect(qx2 - u * 0.05, qy2 - u * 0.13, u * 0.016, u * 0.13); c.fillRect(qx2 + u * 0.034, qy2 - u * 0.13, u * 0.016, u * 0.13);
    c.fillStyle = '#b6824c'; rr(c, qx2 - u * 0.065, qy2 - u * 0.15, u * 0.13, u * 0.026, u * 0.008);
    c.fillStyle = '#c23b2f'; rr(c, qx2 - u * 0.055, qy2 - u * 0.163, u * 0.11, u * 0.018, u * 0.008);
  }
  c.fillStyle = '#7a4e26'; c.fillRect(tx - tw / 2 + u * 0.03, ttop, u * 0.03, th); c.fillRect(tx + tw / 2 - u * 0.06, ttop, u * 0.03, th);
  c.fillStyle = '#a06a34'; rr(c, tx - tw / 2, ttop, tw, u * 0.03, u * 0.008);
  const cl2 = tx - tw / 2 - u * 0.012, cw2 = tw + u * 0.024, drop = u * 0.105;
  c.fillStyle = '#fffdf5'; rr(c, cl2, ttop - u * 0.012, cw2, drop + u * 0.012, u * 0.006);
  c.fillStyle = '#f1e9d6'; c.fillRect(cl2, ttop + u * 0.012, cw2, u * 0.004);
  c.fillStyle = '#d43a3a'; c.fillRect(cl2, ttop + drop - u * 0.03, cw2, u * 0.008); c.fillStyle = '#2d2d2d'; c.fillRect(cl2, ttop + drop - u * 0.017, cw2, u * 0.003);
  for (let x = cl2 + u * 0.022, i = 0; x < cl2 + cw2 - u * 0.01; x += u * 0.044, i++) { c.fillStyle = i % 2 ? '#2d2d2d' : '#d43a3a'; poly(c, [[x, ttop + drop - u * 0.062], [x + u * 0.013, ttop + drop - u * 0.048], [x, ttop + drop - u * 0.034], [x - u * 0.013, ttop + drop - u * 0.048]]); }
  c.fillStyle = '#fffdf5'; for (let x = cl2 + u * 0.008; x < cl2 + cw2; x += u * 0.016) circ(c, x, ttop + drop, u * 0.008);
  if (ready) {
    const ds = u * 0.3, dy = ttop - u * 0.004;
    for (const side of [-1, 1]) { const px = tx + side * tw * 0.33; c.fillStyle = 'rgba(60,40,20,.12)'; ell(c, px, dy + u * 0.004, u * 0.06, u * 0.012); c.fillStyle = '#fffdf5'; ell(c, px, dy - u * 0.004, u * 0.058, u * 0.014); c.strokeStyle = '#3d7cc2'; c.lineWidth = u * 0.004; c.beginPath(); c.ellipse(px, dy - u * 0.004, u * 0.046, u * 0.01, 0, 0, 7); c.stroke(); c.strokeStyle = '#9b6b3c'; c.lineWidth = u * 0.007; c.lineCap = 'round'; c.beginPath(); c.moveTo(px + side * u * 0.07, dy - u * 0.004); c.lineTo(px + side * u * 0.105, dy - u * 0.012); c.stroke(); }
    c.fillStyle = 'rgba(60,40,20,.14)'; ell(c, tx, dy + u * 0.004, ds * 0.36, ds * 0.05);
    drawIcon(c, W[R.dish].ic, tx, dy + u * 0.006, ds);
    for (let i = 0; i < 5; i++) { const f = (t * 0.42 + i / 5) % 1; c.fillStyle = `rgba(255,255,255,${0.6 * (1 - f) * Math.min(1, f * 5)})`; circ(c, tx + Math.sin(f * 6 + i * 2.1) * u * 0.03 + (i - 2) * u * 0.018, dy - ds * 0.62 - f * u * 0.22, u * 0.018 + f * u * 0.03); }
    const mb = dy - ds - u * 0.13 + Math.sin(t * 2.5 + 1) * u * 0.006;
    bubble(c, tx, mb, bR); drawIcon(c, '🍽️', tx, mb + bR * 0.62, bR * 1.4);
  }
  hit(cl2, ttop - (ready ? u * 0.55 : u * 0.03), cw2, th + (ready ? u * 0.55 : u * 0.03), ready ? () => talk(NPC.olia) : word('stil'));

  // ---- her knitting basket, and the kitten Пушок with a ball of wool
  const yx = (OX.olia + 0.06) * RW, yy = h * 0.915;
  shadow(yx, yy, u * 0.09);
  for (const [dx, dy, col] of [[-0.03, -0.085, '#d43a3a'], [0.03, -0.09, '#3d7cc2'], [0, -0.105, '#e0a93b']]) { c.fillStyle = col; circ(c, yx + dx * u, yy + dy * u, u * 0.032); c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 1.2; for (let i = -1; i <= 1; i++) { c.beginPath(); c.arc(yx + dx * u, yy + dy * u + i * u * 0.02, u * 0.03, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); } }
  c.strokeStyle = '#d8d2c4'; c.lineWidth = u * 0.005; c.lineCap = 'round'; c.beginPath(); c.moveTo(yx - u * 0.05, yy - u * 0.15); c.lineTo(yx + u * 0.03, yy - u * 0.05); c.moveTo(yx + u * 0.06, yy - u * 0.15); c.lineTo(yx - u * 0.02, yy - u * 0.05); c.stroke();
  c.fillStyle = '#b98452'; c.beginPath(); c.moveTo(yx - u * 0.075, yy - u * 0.07); c.lineTo(yx + u * 0.075, yy - u * 0.07); c.quadraticCurveTo(yx + u * 0.065, yy, yx + u * 0.045, yy); c.lineTo(yx - u * 0.045, yy); c.quadraticCurveTo(yx - u * 0.065, yy, yx - u * 0.075, yy - u * 0.07); c.fill();
  c.strokeStyle = '#8a5a2b'; c.lineWidth = 1.2; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(yx - u * 0.07, yy - u * 0.07 + i * u * 0.017); c.lineTo(yx + u * 0.07, yy - u * 0.07 + i * u * 0.017); c.stroke(); }
  c.fillStyle = '#9a6a3a'; rr(c, yx - u * 0.08, yy - u * 0.08, u * 0.16, u * 0.016, u * 0.008);
  const px2 = yx + u * 0.21, bat = Math.sin(t * 2.2), ballx = yx + u * 0.115 + bat * u * 0.012;
  c.strokeStyle = '#d43a3a'; c.lineWidth = u * 0.004; c.beginPath(); c.moveTo(yx + u * 0.02, yy - u * 0.08); c.quadraticCurveTo(yx + u * 0.07, yy + u * 0.02, ballx, yy - u * 0.02); c.stroke();
  c.fillStyle = 'rgba(60,40,20,.14)'; ell(c, ballx, yy + u * 0.004, u * 0.026, u * 0.006);
  c.fillStyle = '#d43a3a'; circ(c, ballx, yy - u * 0.024, u * 0.025); c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1.2; c.beginPath(); c.arc(ballx, yy - u * 0.024, u * 0.016, bat, bat + 2.4); c.stroke();
  cat(c, px2, yy, u * 0.17, CATS[0], t, 0.7, -1);
  hit(px2 - u * 0.08, yy - u * 0.19, u * 0.16, u * 0.2, word('kit', { note: `❤️ <b>${OLIA_PETS[1]}</b>${xl(" · Grandma's kitten. He loves her wool.")}` }));

  inDraw(c, t);   // her, walking about Grandma's room

  // the wave of name labels during the first-visit pan
  if (oliaWave) {
    const W0 = cv.width, fs = Math.max(13, Math.round(u * 0.04));
    c.font = `800 ${fs}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    let live = false;
    oliaHits.forEach((r, i) => {
      const id = r.fn.wid; if (!id || !W[id]) return;
      const cx = r.x + r.w / 2, sx = cx - roomX, key = i + ':' + oliaWave.pass;
      if (tour && sx > W0 * 0.1 && sx < W0 * 0.9 && oliaWave.seen[key] === undefined) oliaWave.seen[key] = t;
      const t0 = oliaWave.seen[key]; if (t0 === undefined) return;
      const age = t - t0, al = age < 0.15 ? age / 0.15 : age < 1.1 ? 1 : Math.max(0, 1 - (age - 1.1) / 0.45);
      if (al <= 0) return; live = true;
      const pop = age < 0.2 ? 0.6 + age / 0.2 * 0.5 : age < 0.3 ? 1.1 - (age - 0.2) : 1, txt = W[id].uk, tw = c.measureText(txt).width + fs, y = Math.max(fs, r.y - fs * 0.4);
      c.save(); c.globalAlpha = al; c.translate(cx, y); c.scale(pop, pop);
      c.fillStyle = 'rgba(74,44,26,.25)'; rr(c, -tw / 2, -fs * 0.72 + 2, tw, fs * 1.44, fs * 0.72);
      c.fillStyle = '#fff8ea'; rr(c, -tw / 2, -fs * 0.72, tw, fs * 1.44, fs * 0.72);
      c.strokeStyle = '#4a2c1a'; c.lineWidth = 2; c.beginPath(); if (c.roundRect) c.roundRect(-tw / 2, -fs * 0.72, tw, fs * 1.44, fs * 0.72); c.stroke();
      c.fillStyle = '#4a2c1a'; c.fillText(txt, 0, 1);
      c.restore();
    });
    if (!tour && !live) oliaWave = null;
  }

  c.restore();
}

// ------------------------------------------------------------------ the world, drawn
let zoom = 1, camX = 0, camY = 0, camBX = 0, camBY = 0, peekX = 0, peekY = 0, peekVX = 0, peekVY = 0, peeking = false;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
  zoom = Math.max(Math.min(cv.width, cv.height) / (7.4 * T), Math.max(cv.width, cv.height) / (15 * T));
}
addEventListener('resize', resize); resize();

// dt: game time (0 while a card is open). rdt: real time, for the camera and the smoothing.
const WX = { snow: { w: 'snih', ic: '❄️' }, sun: { w: 'sontse', ic: '☀️' }, cloud: { w: 'khmara', ic: '☁️' }, rain: { w: 'doshch', ic: '🌧️' }, storm: { w: 'hroza', ic: '⛈️' }, fog: { w: 'tuman', ic: '🌫️' } };
const wet = wx => wx === 'rain' || wx === 'storm';   // rain or a thunderstorm: either waters the garden
const DAY_RATE = 0.6 / 600;   // morning to night in about ten minutes of play
let clockSave = 0;
// ------------------------------------------------------------------ night sounds
// Out of doors after dusk: crickets (цвіркуни) chirp on summer and autumn nights, frogs croak by the pond in spring
// and early summer, and winter nights are silent. Stay out far too late and it grows very dark, and wolves
// start to howl in the forest.
const NS = { next: 0, frog: 3 };
function nsVoice() { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (!NS.out) { NS.out = actx.createGain(); NS.out.gain.value = 1; NS.out.connect(actx.destination); } return NS.out; }
function cricket(f, pulses, vol) {
  try { const out = nsVoice(), t0 = actx.currentTime + 0.02;
    for (let i = 0; i < pulses; i++) { const o = actx.createOscillator(), g = actx.createGain(), st = t0 + i * 0.028; o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(vol, st + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.018); o.connect(g); g.connect(out); o.start(st); o.stop(st + 0.03); }
  } catch (e) {}
}
function frogCroak(vol) {
  try { const out = nsVoice(), t0 = actx.currentTime + 0.02;
    for (let i = 0; i < 2; i++) { const o = actx.createOscillator(), fl = actx.createBiquadFilter(), g = actx.createGain(), st = t0 + i * 0.16; o.type = 'sawtooth'; o.frequency.setValueAtTime(150, st); o.frequency.linearRampToValueAtTime(115, st + 0.12);
      fl.type = 'bandpass'; fl.frequency.value = 650; fl.Q.value = 3; g.gain.setValueAtTime(0.0001, st); g.gain.exponentialRampToValueAtTime(vol, st + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, st + 0.13);
      o.connect(fl); fl.connect(g); g.connect(out); o.start(st); o.stop(st + 0.15); }
  } catch (e) {}
}
// A wolf's howl: a rising, wavering note that slides down at the end, with a second wolf answering further off.
function wolfHowl(vol = 0.1) {
  try { const out = nsVoice();
    const voice = (delay, base, v) => { const t0 = actx.currentTime + delay, o = actx.createOscillator(), lfo = actx.createOscillator(), lg = actx.createGain(), fl = actx.createBiquadFilter(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.setValueAtTime(base * 0.7, t0); o.frequency.exponentialRampToValueAtTime(base * 1.25, t0 + 0.9); o.frequency.setValueAtTime(base * 1.25, t0 + 2.2); o.frequency.exponentialRampToValueAtTime(base * 0.75, t0 + 3.4);
      lfo.frequency.value = 5.5; lg.gain.value = base * 0.015; lfo.connect(lg); lg.connect(o.frequency);
      fl.type = 'lowpass'; fl.frequency.value = 1400; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t0 + 0.5); g.gain.setValueAtTime(v, t0 + 2.6); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 3.6);
      o.connect(fl); fl.connect(g); g.connect(out); o.start(t0); lfo.start(t0); o.stop(t0 + 3.7); lfo.stop(t0 + 3.7); };
    voice(0, 430, vol); voice(1.6, 390, vol * 0.45);
  } catch (e) {}
}
function nightSounds(dt) {
  const L = skyLight(S.clock.t), sea = season();
  if (mode !== 'world' || L.dark < 0.3 || wet(S.wx) || document.hidden || !running) return;
  if ((NS.next -= dt) <= 0) {
    if (sea === 'lito' || sea === 'osin') { const n = sea === 'lito' ? 3 : 1, k = Math.floor(Math.random() * n); cricket([4500, 4150, 4800][k], 3 + (k % 2), 0.022 * L.dark); NS.next = (sea === 'lito' ? 0.45 : 1.2) + Math.random() * 0.6; }
    else NS.next = 2;
  }
  if ((sea === 'vesna' || sea === 'lito') && (NS.frog -= dt) <= 0) { const d = Math.hypot(P.x - POND.x, P.y - POND.y); NS.frog = (sea === 'vesna' ? 1.6 : 3.5) + Math.random() * 3; if (d < 14) frogCroak(0.08 * (1 - d / 14) * L.dark); }
}
// The waterfall can be heard as you come near it (not in winter, when it is frozen).
function fallsSound() {
  if (!actx) return;   // no sound until the first tap has started audio
  try { if (!NS.falls) NS.falls = sfxBed("bandpass", 900, 0.5);
    const d = Math.hypot(P.x - FALL.bx, P.y - FALL.by), v = !winter() && d < 8 ? 0.07 * (1 - d / 8) : 0; NS.falls.g.gain.setTargetAtTime(v, actx.currentTime, 0.3); } catch (e) {}
}
function dayTick(dt) {
  nightSounds(dt); fallsSound();
  if (winter() && wet(S.wx)) S.wx = 'snow'; else if (!winter() && S.wx === 'snow') S.wx = 'cloud';
  { const Cl = S.clock; Cl.ev = Cl.ev || {};
    if (wet(S.wx) && Cl.t >= 0.62 && !Cl.ev.rainbow) { Cl.ev.rainbow = 1; S.wx = 'sun'; S.rainbowDay = Cl.day; learn('veselka'); say('w_veselka'); toast(`🌈 ${W.veselka.uk}${stage() < 3 ? ' · the rain has stopped: a rainbow!' : '!'}`, 3200); }
    if (S.wx === 'fog' && Cl.t >= 0.48) { S.wx = 'sun'; if (!Cl.ev.fogGone) { Cl.ev.fogGone = 1; toast(`☀️ ${W.tuman.uk}${stage() < 3 ? ' · the mist has lifted' : ''}`, 2400); } }
    if (S.wx === 'storm' && !Cl.ev.storm) { Cl.ev.storm = 1; learn('hroza'); toast(`⛈️ ${W.hroza.uk}!${stage() < 3 ? ' · a thunderstorm' : ''}`, 2600); }
    if (S.wx === 'fog' && !Cl.ev.fog) { Cl.ev.fog = 1; learn('tuman'); }
  }
  const C = S.clock, was = C.t;
  C.t = Math.min(0.97, C.t + dt * DAY_RATE);
  if ((clockSave += dt) > 5) { clockSave = 0; save(); }
  C.ev = C.ev || {};
  // Noon: the church bell rings out over the village three times, louder the nearer you are to the church.
  if (was < 0.5 && C.t >= 0.5 && !C.ev.noon) { C.ev.noon = 1;
    const d = Math.hypot(P.x - 30.5, P.y - 6), vol = 1;   // the noon bell rings out through the whole village, as loud as it goes
    duck = 0.75; setTimeout(() => { duck = 1; }, 14000);   // the music plays on, just a little softer for (let i = 0; i < 3; i++) setTimeout(() => churchBell(vol), 300 + i * 4000);   // three slow strokes of the big bell
    S.bellT = nowT; toast('🔔 ' + (stage() < 3 ? 'Noon: the church bell rings.' : 'Дзень-дзелень!'), 3000); }
  if (was < 0.78 && C.t >= 0.78 && !C.ev.eve) { C.ev.eve = 1; learn('vechir'); say('w_vechir'); toast(`🌇 ${W.vechir.uk}${stage() < 3 ? ' · evening' : ''}`, 2600); }
  if (was < 0.86 && C.t >= 0.86 && !C.ev.night) { C.ev.night = 1; setGuide(); learn('nich'); say('w_nich', 'p_chas_spaty'); toast(`🌙 ${PH.chas_spaty.uk}${stage() < 3 ? ' · Night: go home to sleep 🏠' : ' 🏠'}`, 3600); }
  // Out after dark: two reminders to go home to bed, then she walks home by herself.
  if (C.t >= 0.86) {
    C.nightT = (C.nightT || 0) + dt;
    if (C.nightT > 32 && !C.ev.wolf1) { C.ev.wolf1 = 1; duck = 0.4; setTimeout(() => { duck = 1; }, 5000); wolfHowl(0.09); toast('🐺 Ау-у-у…' + (stage() < 3 ? ' · Wolves are howling in the forest! Time to get indoors.' : ''), 3600); }
    if (C.nightT > 58 && !C.ev.wolf2) { C.ev.wolf2 = 1; duck = 0.4; setTimeout(() => { duck = 1; }, 5000); wolfHowl(0.13); }
    if (C.nightT > 25 && !C.ev.rem1) { C.ev.rem1 = 1; setTimeout(setGuide, 0); say('p_chas_spaty'); toast(`🌙 ${PH.chas_spaty.uk}${stage() < 3 ? ' · It’s late: go home to sleep 🏠' : ' 🏠'}`, 3600); }
    if (C.nightT > 50 && !C.ev.rem2) { C.ev.rem2 = 1; say('w_nich', 'p_chas_spaty'); toast(`😴 ${PH.chas_spaty.uk}${stage() < 3 ? ' · She’s very sleepy. Home to bed soon!' : ''}`, 3600); }
    if (C.nightT > 70 && !C.ev.home && !fishFx && mode === 'world') { C.ev.home = 1; toast(`🏠 ${PH.dobranich.uk}${stage() < 3 ? ' · Too sleepy: she heads home to bed.' : ''}`, 3000); P.path = []; setTimeout(() => { if (mode === 'world' && running) { const hm = ents.find(e => e.kind === 'home'); if (hm) { P.x = P.rx = hm.x; P.y = P.ry = hm.y + 1; S.x = P.x; S.y = P.y; } fadeThen(enterHomeNow); } }, 1400); }
  }
  if (wet(S.wx)) {   // the rain waters every bed that's planted
    let n = 0; for (const p of S.plots) if (p.c && !p.wet) { p.wet = true; p.ready = now() + 50e3; n++; }
    if (n && !C.ev.rained) { C.ev.rained = 1; learn('doshch'); toast(`🌧️ ${W.doshch.uk}${stage() < 3 ? ' · the rain watered your garden' : ''}`, 2600); save(); }
  }
}
// How the light looks at a time of day: dark (0 day .. 1 night), warm (golden evening), dawn (pink morning).
function skyLight(tt) {
  const k = (a, b, x) => Math.max(0, Math.min(1, (x - a) / (b - a)));
  const dawn = 1 - k(0.25, 0.33, tt), warm = k(0.7, 0.79, tt) * (1 - k(0.82, 0.88, tt)), dark = k(0.79, 0.88, tt);
  return { dark, warm, dawn };
}
// Night, dusk and weather painted over a finished scene, in screen pixels. lights: [[x, y, r], …] warm glows.
let vignetteSpr = null, vignetteKey = '';
function paintSky(c, w, h, t, lights, outdoors) {
  const L = skyLight(S.clock.t), wx = S.wx;
  if (outdoors) {
    if (wx === 'sun' && L.dark < 0.5) { c.save(); c.globalCompositeOperation = 'soft-light'; const sg = c.createLinearGradient(0, 0, w, h); sg.addColorStop(0, `rgba(255,236,186,${0.55 * (1 - L.dark * 2)})`); sg.addColorStop(0.6, 'rgba(255,236,186,0)'); c.fillStyle = sg; c.fillRect(0, 0, w, h); c.restore(); }   // warm light from the sun, top left
    if (vignetteKey !== w + 'x' + h) { vignetteKey = w + 'x' + h; vignetteSpr = document.createElement('canvas'); vignetteSpr.width = Math.max(1, w >> 2); vignetteSpr.height = Math.max(1, h >> 2); const vc = vignetteSpr.getContext('2d'), vw2 = vignetteSpr.width, vh2 = vignetteSpr.height, vg = vc.createRadialGradient(vw2 / 2, vh2 * 0.48, Math.min(vw2, vh2) * 0.42, vw2 / 2, vh2 * 0.48, Math.max(vw2, vh2) * 0.75); vg.addColorStop(0, 'rgba(40,30,20,0)'); vg.addColorStop(1, 'rgba(40,30,20,.32)'); vc.fillStyle = vg; vc.fillRect(0, 0, vw2, vh2); }
    c.drawImage(vignetteSpr, 0, 0, w, h);   // a gentle darkening at the edges draws the eye in
  }
  if (outdoors && wx !== 'sun' && wx !== 'fog') { c.fillStyle = wx === 'snow' ? 'rgba(200,210,228,.14)' : wx === 'storm' ? 'rgba(40,50,78,.4)' : wx === 'rain' ? 'rgba(70,86,112,.26)' : 'rgba(110,118,135,.16)'; c.fillRect(0, 0, w, h); }
  c.save();
  c.globalCompositeOperation = 'multiply';
  if (L.dawn > 0) { c.globalAlpha = L.dawn * 0.35; c.fillStyle = 'rgb(255,190,200)'; c.fillRect(0, 0, w, h); }
  if (L.warm > 0) { c.globalAlpha = L.warm * 0.55; c.fillStyle = 'rgb(255,186,120)'; c.fillRect(0, 0, w, h); }
  if (L.dark > 0) { c.globalAlpha = L.dark; c.fillStyle = outdoors ? 'rgb(64,74,140)' : 'rgb(96,90,150)'; c.fillRect(0, 0, w, h); }
  c.globalCompositeOperation = 'lighter';
  const glow = Math.max(L.dark, L.warm * 0.35);
  if (glow > 0.02) for (const [x, y, r] of lights) {
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,196,110,${0.55 * glow})`); g.addColorStop(1, 'rgba(255,196,110,0)');
    c.globalAlpha = 1; c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  if (outdoors && L.dark > 0.3 && (season() === 'lito' || season() === 'vesna')) for (let i = 0; i < 16; i++) {   // fireflies (not on autumn or winter nights)
    const fx = (Math.sin(t * 0.21 + i * 7.1) * 0.5 + 0.5) * w, fy = (Math.sin(t * 0.17 + i * 3.3) * 0.45 + 0.52) * h, on = Math.max(0, Math.sin(t * 1.9 + i * 2.3));
    c.globalAlpha = on * L.dark; c.fillStyle = 'rgba(222,255,140,1)'; circ(c, fx, fy, 2.4 + on * 1.4);
    c.globalAlpha = on * L.dark * 0.3; circ(c, fx, fy, 8);
  }
  c.restore();
  if (outdoors && wx === 'snow') drawSnow(c, w, h, t, w / 390, 1);
  if (outdoors && season() === 'osin' && !wet(wx)) for (let i = 0; i < 14; i++) { const x = ((i * 127.3 + t * 18 + Math.sin(t + i) * 30) % w + w) % w, y = (i * 211.9 + t * 30) % h; c.save(); c.translate(x, y); c.rotate(t * 2 + i); c.fillStyle = ['#e0712c', '#d9a330', '#b8432b'][i % 3]; ell(c, 0, 0, 5 * w / 390, 2.6 * w / 390); c.restore(); }
  if (outdoors && season() === 'vesna' && !wet(wx)) { c.fillStyle = 'rgba(255,196,214,.85)'; for (let i = 0; i < 16; i++) ell(c, ((i * 97.7 + t * 22) % w), (i * 191.3 + t * 26) % h, 3.6 * w / 390, 2.2 * w / 390); }
  if (outdoors) skyEvents(c, w, h, t, L);   // lightning, fog, the rainbow, the cranes going over
  if (outdoors && wet(wx)) drawRain(c, w, h, t, wx === 'storm');
}
// Each season's weather: summer has thunderstorms, autumn and spring misty mornings, winter snow.
function dayWeather(sea, r) {
  // mostly fine days; clouds, rain, storms and fog only now and then
  if (sea === 'zyma') return r < 0.5 ? 'sun' : r < 0.82 ? 'snow' : r < 0.93 ? 'cloud' : 'fog';
  if (sea === 'lito') return r < 0.7 ? 'sun' : r < 0.8 ? 'cloud' : r < 0.92 ? 'rain' : 'storm';
  return r < 0.62 ? 'sun' : r < 0.72 ? 'cloud' : r < 0.86 ? 'rain' : 'fog';
}
// Over the village: a storm's lightning (and its thunder a moment later), the morning fog that thins as it lifts,
// the rainbow after rain, and in autumn the cranes going over in a V on their way south.
let flash = null, nextFlash = 0;
function skyEvents(c, w, h, t, L) {
  const wx = S.wx, Cl = S.clock;
  if (wx === 'storm') {
    if (t > nextFlash) { nextFlash = t + 4 + Math.random() * 6; flash = { t0: t, x: w * (0.15 + Math.random() * 0.7), seed: Math.random() * 99 }; learn('blyskavka'); setTimeout(() => { for (let i = 0; i < 4; i++) setTimeout(() => blip(55 + Math.random() * 30, 0.25), i * 90); learn('hrim'); }, 500 + Math.random() * 600); }
    if (flash && t - flash.t0 < 0.35) { const q = (t - flash.t0) / 0.35; c.fillStyle = `rgba(255,255,255,${0.55 * (1 - q)})`; c.fillRect(0, 0, w, h);
      if (q < 0.6) { c.strokeStyle = `rgba(255,250,210,${1 - q})`; c.lineWidth = Math.max(2, w / 160); c.beginPath(); let x = flash.x, y = 0; c.moveTo(x, y); const r = seeded(Math.floor(flash.seed * 1000)); while (y < h * 0.55) { x += (r() - 0.5) * w * 0.08; y += h * (0.04 + r() * 0.05); c.lineTo(x, y); } c.stroke(); } }
  }
  if (wx === 'fog') { const lift = Math.max(0, Math.min(1, (Cl.t - 0.3) / 0.18)), a = 0.7 * (1 - lift);
    if (a > 0.01) { c.fillStyle = `rgba(236,240,244,${a * 0.55})`; c.fillRect(0, 0, w, h); c.fillStyle = `rgba(250,252,253,${a * 0.5})`; for (let i = 0; i < 6; i++) { const x = ((i * 0.27 + t * 0.008 * (1 + i % 3)) % 1.5 - 0.25) * w; ell(c, x, h * (0.15 + i * 0.15), w * 0.55, h * 0.06); } } }
  if (rainbowA() > 0) {
    const a = rainbowA() * (1 - L.dark), cx = w * 0.62, cy = h * 0.62, R0 = Math.max(w, h) * 0.62;
    if (a > 0) { c.save(); c.globalAlpha = a * 0.42; c.lineWidth = R0 * 0.028; ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#30b0ff', '#5856d6', '#af52de'].forEach((col, i) => { c.strokeStyle = col; c.beginPath(); c.arc(cx, cy, R0 - i * R0 * 0.027, Math.PI * 1.05, Math.PI * 1.95); c.stroke(); }); c.restore(); }
  }
  if (season() === 'osin' && L.dark < 0.5 && !wet(wx)) {
    const per = 38, q = (t % per) / 14;
    if (q < 1) { if (!Cl.ev.cranes) { Cl.ev.cranes = 1; learn('zhuravel'); say('p_zhuravli_letiat'); toast(`🕊️ ${PH.zhuravli_letiat.uk}${stage() < 3 ? ' · ' + PH.zhuravli_letiat.en : ''}`, 3400); }
      const lx = w * (1.15 - q * 1.35), ly = h * 0.16, sp = w * 0.045;
      for (let i = 0; i < 11; i++) { const row = i === 0 ? 0 : Math.ceil(i / 2), side = i === 0 ? 0 : i % 2 ? -1 : 1, x = lx + row * sp, y = ly + side * row * sp * 0.55, fl = Math.sin(t * 6 + i) * sp * 0.25;
        c.strokeStyle = 'rgba(60,60,70,.75)'; c.lineWidth = Math.max(1.5, w / 260); c.beginPath(); c.moveTo(x - sp * 0.35, y - fl); c.quadraticCurveTo(x - sp * 0.1, y - sp * 0.1, x, y); c.quadraticCurveTo(x + sp * 0.1, y - sp * 0.1, x + sp * 0.35, y - fl); c.moveTo(x, y); c.lineTo(x - sp * 0.3, y + sp * 0.02); c.stroke(); }
    }
  }
}
const RAIN = (() => { const r = seeded(77), a = []; for (let i = 0; i < 260; i++) { const layer = i < 120 ? 0 : i < 210 ? 1 : 2; a.push({ x: r(), y: r(), sp: [0.55, 0.85, 1.25][layer] * (0.8 + r() * 0.4), len: [0.022, 0.036, 0.06][layer] * (0.7 + r() * 0.6), a: [0.4, 0.55, 0.75][layer] * (0.65 + r() * 0.45), lw: [0.9, 1.3, 2][layer], layer, ph: r() * 9 }); } return a; })();
const SPLASH = (() => { const r = seeded(91), a = []; for (let i = 0; i < 40; i++) a.push({ x: r(), y: 0.15 + r() * 0.85, ph: r(), sp: 1.4 + r() * 1.2 }); return a; })();
function drawRain(c, w, h, t, storm) {
  const k = w / 390;
  // the wind: a steady lean with slow gusts on top (stronger in a storm)
  const gust = Math.sin(t * 0.37) * 0.5 + Math.sin(t * 1.13 + 2) * 0.3 + Math.sin(t * 2.9) * 0.12, lean = (storm ? 0.38 : 0.2) + gust * (storm ? 0.3 : 0.14);
  c.lineCap = 'round';
  for (let L = 0; L < 3; L++) {
    c.lineWidth = Math.max(0.8, k) * [0.9, 1.3, 2][L] * (storm ? 1.15 : 1);
    for (let i = 0; i < RAIN.length; i++) { const d = RAIN[i]; if (d.layer !== L || (!storm && i % 4 === 3)) continue;   // ordinary rain: three drops in four, at every depth
      const fall = h * (1 + d.len) * (storm ? 1.25 : 1) * d.sp, yy = ((d.y * (h + 200) + t * fall + d.ph * 50) % (h + 200)) - 100, wob = Math.sin(t * 3 + d.ph) * 0.04;
      const x = ((d.x * (w + 200) - yy * (lean + wob) + d.ph * 30) % (w + 200) + w + 200) % (w + 200) - 100, ln = d.len * h * (storm ? 1.3 : 1);
      c.strokeStyle = `rgba(210,226,255,${d.a * (0.75 + 0.25 * Math.sin(t * 7 + d.ph))})`;
      c.beginPath(); c.moveTo(x, yy); c.lineTo(x - ln * (lean + wob), yy + ln); c.stroke(); }
  }
  // where the drops land: a little crown of splash and a ring spreading on the ground, all at their own times
  for (const s of SPLASH) { const p = ((t * s.sp + s.ph * 7) % 1), x = s.x * w, y = s.y * h;
    if (p < 0.25) { const q = p / 0.25; c.fillStyle = `rgba(225,236,255,${0.55 * (1 - q)})`; for (let j = -1; j <= 1; j++) circ(c, x + j * (3 + q * 5) * k, y - Math.sin(q * Math.PI) * 5 * k, 1.2 * k); }
    const q2 = p; c.strokeStyle = `rgba(225,236,255,${0.3 * (1 - q2)})`; c.lineWidth = 1 * k; c.beginPath(); c.ellipse(x, y, (2 + q2 * 10) * k, (1 + q2 * 3.5) * k, 0, 0, 7); c.stroke(); }
  // in a storm, sheets of heavier rain sweep across now and then
  if (storm) { const sw = (t * 0.07) % 1; c.fillStyle = 'rgba(180,195,220,.08)'; c.fillRect((sw * 1.6 - 0.3) * w, 0, w * 0.35, h); }
}
// Snow that falls like snow: flakes at three depths (small, slow and faint far off; big, soft and quicker
// close by), each swaying on its own, blown by a slow changing breeze, some tumbling as they come down.
const SNOW = (() => { const r = seeded(53), a = []; for (let i = 0; i < 240; i++) { const L2 = i < 110 ? 0 : i < 195 ? 1 : 2; a.push({ x: r(), y: r(), L: L2, sp: [0.04, 0.065, 0.1][L2] * (0.75 + r() * 0.5), sz: [1.5, 2.6, 4][L2] * (0.7 + r() * 0.6), sw: 0.5 + r() * 1.4, swA: [2.5, 4.5, 7][L2] * (0.5 + r()), ph: r() * 9, a: [0.55, 0.8, 0.95][L2] }); } return a; })();
function drawSnow(c, w, h, t, k, amount) {
  const breeze = Math.sin(t * 0.13) * 0.025 + Math.sin(t * 0.31 + 1) * 0.01;   // the breeze nudges the whole fall a little one way, then the other (an offset, not a speed, so it never builds up)
  for (let i = 0; i < SNOW.length; i++) { const f = SNOW[i]; if ((i % 10) / 10 >= amount) continue;
    const y = ((f.y + t * f.sp) % 1.08 - 0.04) * h, x = ((f.x + breeze * (0.6 + f.L * 0.3) + Math.sin(t * f.sw * 0.6 + f.ph) * f.swA / Math.max(1, w) ) % 1 + 1) % 1 * w;
    const s = f.sz * k, tw = 0.75 + 0.25 * Math.sin(t * 2 + f.ph);
    c.fillStyle = `rgba(255,255,255,${f.a * tw})`;
    if (f.L === 2 && i % 3 === 0) { c.save(); c.translate(x, y); c.rotate(t * 0.8 + f.ph); c.strokeStyle = c.fillStyle; c.lineWidth = Math.max(0.8, s * 0.35); c.beginPath(); for (let j = 0; j < 3; j++) { const an = j * Math.PI / 3; c.moveTo(Math.cos(an) * s * 1.3, Math.sin(an) * s * 1.3); c.lineTo(-Math.cos(an) * s * 1.3, -Math.sin(an) * s * 1.3); } c.stroke(); c.restore(); }   // a few big flakes are proper six-armed snowflakes, turning
    else { circ(c, x, y, s); if (f.L === 2) { c.fillStyle = `rgba(255,255,255,${0.25 * tw})`; circ(c, x, y, s * 1.8); } }
  }
}
// Morning: a new day with new weather.
function newDay() {
  const r = Math.random();
  const was = seasonIx();
  S.clock = { day: (S.clock.day || 1) + 1, t: 0.27, ev: {} };
  S.wx = dayWeather(season(), r);
  if (S.wx === 'snow' || seasonIx() !== was) { prints.length = 0; printLast = null; for (const e of ents) e.pl = null; }   // fresh snow covers the tracks
  if (seasonIx() !== was && bed) bed.season = season();   // a new season starts this morning
  if (seasonIx() !== was && winter()) { S.wx = 'snow'; S.firstSnow = S.clock.day; }   // the first morning of winter: the first snow
  learn('ranok'); learn(WX[S.wx].w); learn(season()); homeList = null; setGuide(); save();
}
// Footprints in the snow. Hers (boots), the cats' and the dog's (paws), the cow's, horse's, goat's and pig's
// (cloven hooves), the hens' and ducks' (three toes), and the villagers' as they walk home. They stay all day:
// only a fresh fall of snow overnight covers them up (newDay). Kept to 1500, and only those on screen are drawn.
const prints = []; let printLast = null, printSide = 1;
const PRINT_OF = { cat: ['paw', 0.17, 0.8], dog: ['paw', 0.24, 1.15], cow: ['hoof', 0.34, 1.35], horse: ['hoof', 0.36, 1.4], goat: ['hoof', 0.24, 0.85], pig: ['hoof', 0.22, 0.85], hen: ['bird', 0.13, 0.8], rooster: ['bird', 0.15, 0.95], duck: ['bird', 0.16, 1] };
function addPrint(o, x, y, kind, gap, sc) {
  if (!o.pl) { o.pl = { x, y, side: 1 }; return; }
  const dx = x - o.pl.x, dy = y - o.pl.y, d = Math.hypot(dx, dy);
  if (d < gap) return;
  if (d > 2) { o.pl = { x, y, side: 1 }; return; }   // jumped (a new spot, or carried indoors and back): no long stride
  const ang = Math.atan2(dy, dx); o.pl.side = -o.pl.side;
  const off = kind === 'boot' ? 0.09 : 0.05 * sc;
  prints.push({ x: x - Math.sin(ang) * off * o.pl.side, y: y + Math.cos(ang) * off * o.pl.side, a: ang, k: kind, s: sc, t: nowT });
  if (prints.length > 1500) { const i = prints.findIndex(q => q.k !== 'boot'); prints.splice(i >= 0 ? i : 0, 1); }   // animals' tracks give way first; hers stay longest
  o.pl.x = x; o.pl.y = y;
}
function stepPrints() {
  if (!winter()) { prints.length = 0; printLast = null; return; }
  printLast = printLast || {}; addPrint(printLast, P.x, P.y, 'boot', 0.3, 1);
  for (const e of ents) {
    if (goneNow(e) || e.water) continue;
    if (e.kind === 'npc') { if (e.route2) addPrint(e, e.x, e.y, 'boot', 0.3, 1); continue; }
    const pk = e.kind === 'animal' && PRINT_OF[e.an]; if (!pk) continue;
    addPrint(e, e.x, e.y, pk[0], pk[1], pk[2]);
  }
}
function drawPrints(c, t) {
  const vw = cv.width / zoom, vh = cv.height / zoom, x0 = camX - 30, x1 = camX + vw + 30, y0 = camY - 30, y1 = camY + vh + 30;
  for (const p of prints) {
    const px = p.x * T, py = p.y * T; if (px < x0 || px > x1 || py < y0 || py > y1) continue;
    const al = Math.max(0.55, 1 - (t - p.t) / 90);   // fresh ones crisp, older ones settle a little, none vanish
    c.save(); c.translate(px, py); c.rotate(p.a); c.scale(p.s, p.s); c.fillStyle = `rgba(120,140,175,${0.38 * al})`; c.strokeStyle = c.fillStyle;
    if (p.k === 'boot') { ell(c, 0, 0, 5.5, 2.8); ell(c, 6.5, 0, 2.6, 2.3); }
    else if (p.k === 'paw') { ell(c, 0, 0, 2.3, 2); for (const yy of [-1.9, 0, 1.9]) circ(c, 2.9, yy * 0.8, 0.95); circ(c, 2.3, -2.4, 0.8); }
    else if (p.k === 'hoof') { ell(c, 0.6, -1.25, 2.6, 1.05); ell(c, 0.6, 1.25, 2.6, 1.05); }
    else { c.lineWidth = 0.9; c.lineCap = 'round'; c.beginPath(); c.moveTo(-1.6, 0); c.lineTo(2.4, 0); c.moveTo(0, 0); c.lineTo(2.2, -1.8); c.moveTo(0, 0); c.lineTo(2.2, 1.8); c.stroke(); }
    c.restore();
  }
}
function update(dt, t, rdt = dt) {
  if (dt > 0) dayTick(dt);
  stepPrints();
  // Walk along the path: ease up to full speed, and slow into the last step.
  let step = 0; P.moving = false;
  if (P.path.length && dt > 0) {
    P.sp = Math.min(3.4, Math.max(0.8, P.sp) + 14 * dt);
    let left = 0, px = P.x, py = P.y;
    for (const n of P.path) { left += Math.hypot(n.x - px, n.y - py); px = n.x; py = n.y; if (left > 1) break; }
    step = Math.min(P.sp, Math.max(1.3, left * 6.5)) * dt;
  } else if (!P.path.length) P.sp = 0;
  while (P.path.length && step > 0) {
    const n = P.path[0], dx = n.x - P.x, dy = n.y - P.y, d = Math.hypot(dx, dy);
    P.moving = true;
    if (Math.abs(dx) > 0.02) P.face = dx > 0 ? 1 : -1;
    if (d > 0.001) { P.mdx = dx / d; P.mdy = dy / d; }
    if (d <= step) { P.x = n.x; P.y = n.y; P.path.shift(); step -= d; P.step += d; if (!P.path.length) { S.x = P.x; S.y = P.y; save(); arrive(); } }
    else { P.x += dx / d * step; P.y += dy / d * step; P.step += step; step = 0; }
  }
  if (P.moving && P.step - P.dust > 0.55) { P.dust = P.step; fxDust(P.rx, P.ry); }
  { const far = Math.hypot(P.x - P.rx, P.y - P.ry) > 2.5, k = far ? 1 : 1 - Math.exp(-rdt * 20);
    P.rx += (P.x - P.rx) * k; P.ry += (P.y - P.ry) * k;
    // She turns through four views as an angle: 0 front, π/2 her right side, π her back, 3π/2 her left side.
    // Walking away shows her back, walking across her side, walking toward you her front; when she stops
    // she stays facing the way she was going. A half turn (back to front) always goes round through the side she last faced.
    const away = P.moving && P.mdy < 0 && -P.mdy > Math.abs(P.mdx) * 1.1, across = P.moving && !away && Math.abs(P.mdx) > 0.35;
    if (P.path.length) P.lookAt = null;   // a new walk forgets who she was facing
    const TAU = Math.PI * 2, cur = P.va || 0, base = !P.moving ? (P.lookAt != null ? P.lookAt : Math.round(cur / (Math.PI / 2)) * (Math.PI / 2)) : away ? Math.PI : across ? (P.mdx > 0 ? Math.PI / 2 : Math.PI * 1.5) : 0;
    let goal = base + TAU * Math.round((cur - base) / TAU);
    if (Math.abs(Math.abs(goal - cur) - Math.PI) < 0.6) {
      const side = P.face === -1 ? Math.PI * 1.5 : Math.PI / 2;
      for (const g of [goal - TAU, goal, goal + TAU]) {
        const lo = Math.min(cur, g), hi = Math.max(cur, g), n = Math.ceil((lo - side) / TAU);
        if (Math.abs(g - cur) < Math.PI * 1.2 && side + n * TAU <= hi) { goal = g; break; }
      }
    }
    P.vav = (P.vav || 0) + ((goal - cur) * 90 - (P.vav || 0) * 19) * rdt;
    P.va = cur + P.vav * rdt;
    if (Math.abs(P.vav) < 0.01 && Math.abs(goal - P.va) < 0.003) { P.va = ((goal % TAU) + TAU) % TAU; P.vav = 0; }
    P.wk += ((P.moving ? 1 : 0) - P.wk) * (1 - Math.exp(-rdt * 14)); }
  villageNight(dt);
  for (const e of ents) {
    if (e.face !== undefined && !e.route2) turnTo(e, e.face, dt, TURN_SLOW[e.an] || 1);
    if (e.route2 || e.asleep) continue;   // heading home for the night
    if (e.npc === 'oksana') oksanaStep(e, dt, t);
    if (e.kind === 'npc') {   // turn to face you (side-on, towards whichever side you're on) while you talk
      const goal = sheetOpen() && talkNpc === e.npc ? (P.x >= e.x ? 1 : -1) : 0;
      e.tv = (e.tv || 0) + (goal - (e.tv || 0)) * (1 - Math.exp(-rdt * 7));   // real time: game time stops while a card is open
      if (Math.abs(e.tv - goal) < 0.002) e.tv = goal;
    }
    if (e.kind === 'animal' && nightNow() && !e.cat && !e.fetch && !e.water) { e.st = 'idle'; e.act = (QUAD[e.an] || {}).rest ? 'rest' : 'look'; e.tw = 3; e.vel = 0; }   // night: lie down and sleep
    if (e.kind === 'animal') {
      // Stand a good while (grazing, looking about, lying down), then stroll somewhere else: turn first, set off
      // gently, slow down on arriving. A new spot is only chosen while standing, never part-way through a walk.
      if (e.cat && S.cats[e.cat] === 'f') followStep(e, dt); else if (e.fetch) fetchStep(e, dt); else {
      const sp = SPEED[e.an] || 0.5, idle = IDLE[e.an] || [3, 8];
      if (e.st === 'walk') {
        const dx = e.gx - e.x, dy = e.gy - e.y, d = Math.hypot(dx, dy);
        const turned = Math.abs(e.fs - e.face) < 0.4;
        const want = turned ? sp * (e.route && e.route.length ? 1 : Math.min(1, d / 0.3 + 0.12)) : 0;
        e.vel += (want - e.vel) * (1 - Math.exp(-dt * 3.5));
        if (d < 0.1 && e.route && e.route.length) { const n = e.route.shift(); e.gx = n.x; e.gy = n.y; e.walkT = 0; if (Math.abs(n.x - e.x) > 0.08) e.face = n.x > e.x ? -1 : 1; }   // next corner of a cat's route
        else if (d < 0.04 || (e.walkT += dt) > 30) { e.st = 'idle'; e.tw = rnd(idle[0], idle[1]); const k = Math.random(); e.act = (QUAD[e.an] || {}).rest || e.an === 'cat' ? (k < 0.35 && e.tw > 6 ? 'rest' : k < 0.75 ? 'graze' : 'look') : (k < 0.65 ? 'graze' : 'look'); }
        else { const m = Math.min(d, e.vel * dt); e.x += dx / d * m; e.y += dy / d * m; e.step = (e.step || 0) + m; }
      } else {
        e.vel += (0 - e.vel) * (1 - Math.exp(-dt * 6));
        e.tw -= dt;
        if (e.tw <= 0) {
          if (e.act === 'rest') { e.act = 'look'; e.tw = 1.6; }           // get up first
          else {
            e.tw = 1.5;
            if (!(e.an === 'cat' && catRoam(e))) for (let i = 0; i < 8; i++) {
              const nx = e.hx + rnd(-1, 1) * e.r, dx = nx - e.x;
              if (Math.abs(dx) < Math.min(0.5, e.r * 0.45)) continue;                       // a walk worth taking
              if (i < 5 && Math.random() < 0.7 && (dx > 0 ? -1 : 1) !== e.face) continue;   // mostly keep going the way it faces
              let ny = e.hy + rnd(-1, 1) * e.r * 0.5; ny = e.y + Math.max(-0.45 * Math.abs(dx), Math.min(0.45 * Math.abs(dx), ny - e.y));
              if (!(e.water ? inPond(nx, ny, -0.5) : !solid[Math.floor(ny)][Math.floor(nx)])) continue;
              if (!e.water && e.an !== 'cat' && e.an !== 'dog' && nearRoad(nx, ny, 0.55)) continue;   // farm animals keep to the grass
              e.gx = nx; e.gy = ny; e.st = 'walk'; e.walkT = 0; e.face = dx > 0 ? -1 : 1; e.act = 'look'; break;
            }
          }
        }
      }
      }
      e.wk = Math.max(0, Math.min(1, e.vel / ((SPEED[e.an] || 0.5) * 0.8))); e.walk = e.wk > 0.2;
      // heads go down to graze, with a look up now and then
      const grazing = e.fetch ? FETCH.dip : e.st === 'idle' && e.act === 'graze' && Math.sin(t * 0.23 + e.hx * 3) > -0.55;
      e.dip += ((grazing ? 1 : 0) - e.dip) * (1 - Math.exp(-dt * 2.2));
      e.rest += ((e.st === 'idle' && e.act === 'rest' ? 1 : 0) - e.rest) * (1 - Math.exp(-dt * 1.8));
    } else if (e.kind === 'crawl') {   // a little loop through the grass, nose first
      const px = e.x; e.x = e.cx + Math.sin(t * 0.22 + e.ph) * 1.4; e.y = e.cy + Math.sin(t * 0.44 + e.ph) * 0.35; if (Math.abs(e.x - px) > 1e-4) e.face = e.x > px ? 1 : -1;
    } else if (e.kind === 'fly') {
      if (e.swoop) { e.x = e.cx + Math.sin(t * 0.8 + e.ph) * 3.2; e.y = e.cy + Math.sin(t * 1.6 + e.ph) * 0.7; e.face = Math.cos(t * 0.8 + e.ph) >= 0 ? 1 : -1; continue; }
      e.x = e.cx + Math.sin(t * 0.7 + e.ph) * 1.4 + Math.sin(t * 2.3 + e.ph) * 0.2;
      e.y = e.cy + Math.cos(t * 0.5 + e.ph * 2) * 0.8;
    }
  }
  const vw = cv.width / zoom, vh = cv.height / zoom;
  // The camera follows the player smoothly; a drag adds a "peek" offset on top, which springs back
  // (with a little overshoot) once the finger lets go.
  { const k = 1 - Math.exp(-rdt * 5.5); camBX += (P.rx * T - vw / 2 - camBX) * k; camBY += (P.ry * T - vh * 0.52 - camBY) * k; }
  if (!peeking) {
    peekVX += (-110 * peekX - 13 * peekVX) * rdt; peekVY += (-110 * peekY - 13 * peekVY) * rdt;
    peekX += peekVX * rdt; peekY += peekVY * rdt;
    if (Math.abs(peekX) < 0.5 && Math.abs(peekVX) < 2) { peekX = 0; peekVX = 0; }
    if (Math.abs(peekY) < 0.5 && Math.abs(peekVY) < 2) { peekY = 0; peekVY = 0; }
  }
  camX = Math.max(0, Math.min(MW * T - vw, camBX + peekX)); camY = Math.max(0, Math.min(MH * T - vh, camBY + peekY));
}

// A round speech bubble with a soft shadow and a little tail.
// Oksana's bubble: a wicker basket with a loaf, two red apples and a leaf, an embroidered cloth over the front.
function marketBasket(c, x, y) {
  c.save(); c.translate(x, y); c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = '#8a5a2b'; c.lineWidth = 2.8; c.beginPath(); c.arc(0, 0, 11.5, Math.PI * 1.06, Math.PI * 1.94); c.stroke();
  c.strokeStyle = '#d29a5c'; c.lineWidth = 1.1; c.beginPath(); c.arc(0, 0, 11.5, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
  c.fillStyle = '#d9963a'; ell(c, -5, -2, 7.5, 4.4); c.fillStyle = '#efb758'; ell(c, -6, -3.4, 4.2, 1.8);
  c.strokeStyle = '#b8752a'; c.lineWidth = 0.9; for (const k of [-9, -5.5, -2]) { c.beginPath(); c.moveTo(k, -5); c.lineTo(k + 1.6, -1.5); c.stroke(); }
  c.fillStyle = '#e2392f'; circ(c, 4.5, -2.2, 3.8); circ(c, 9, -0.6, 3.3);
  c.fillStyle = 'rgba(255,255,255,.6)'; circ(c, 3.4, -3.5, 1.1); circ(c, 8, -1.8, 0.9);
  c.strokeStyle = '#6b4422'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(4.6, -5.8); c.lineTo(5.2, -7.2); c.stroke();
  c.fillStyle = '#4f9a3f'; c.save(); c.translate(6.6, -7.2); c.rotate(-0.5); ell(c, 0, 0, 2.6, 1.2); c.restore();
  c.fillStyle = '#b57a3e'; poly(c, [[-13.5, -0.5], [13.5, -0.5], [10.5, 11], [-10.5, 11]]);
  c.strokeStyle = 'rgba(110,70,30,.55)'; c.lineWidth = 0.9;
  for (const yy of [3.5, 7.5]) { const w = 13.5 - (yy + 0.5) * 0.27; c.beginPath(); c.moveTo(-w, yy); c.lineTo(w, yy); c.stroke(); }
  for (let i = -5; i <= 5; i++) { c.beginPath(); c.moveTo(i * 2.3, 0.5 + (i & 1) * 4); c.lineTo(i * 2.1, 3 + (i & 1) * 4); c.stroke(); }
  c.fillStyle = '#8a5a2b'; rr(c, -14.5, -2, 29, 3.4, 1.7);
  c.fillStyle = '#fffaf0'; poly(c, [[-7, 1.4], [7, 1.4], [4.5, 7.5], [0, 10], [-4.5, 7.5]]);
  c.fillStyle = '#d43a3a'; for (const [px, py] of [[-3.6, 3.6], [0, 3.6], [3.6, 3.6], [0, 7]]) poly(c, [[px, py - 1.4], [px + 1.4, py], [px, py + 1.4], [px - 1.4, py]]);
  c.restore();
}
function bubble(c, x, y, R) {
  c.fillStyle = 'rgba(60,40,20,.16)'; circ(c, x, y + 3, R);
  c.fillStyle = 'rgba(255,253,245,.97)'; circ(c, x, y, R); poly(c, [[x - 5, y + R - 3], [x + 5, y + R - 3], [x, y + R + 6]]);
}
function label(c, text, x, y) {
  c.font = '700 17px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(text).width + 16;
  c.fillStyle = 'rgba(255,248,234,.92)'; rr(c, x - w / 2, y - 12, w, 24, 12);
  c.fillStyle = '#3b2f2a'; c.fillText(text, x, y + 1);
}
// The watering can swings in over the bed, tips, pours a stream of drops, then lifts away (about 2 s).
function drawWatering(c, a) {
  if (a > 2.1) { waterFx = null; return; }
  const inn = Math.min(1, a / 0.3), out = a > 1.8 ? (a - 1.8) / 0.3 : 0;
  const tilt = Math.min(1, Math.max(0, (a - 0.25) / 0.3)) * (1 - out);
  const cx = T * 0.62, cy = -T * 0.5 - (1 - inn) * T * 0.3 - out * T * 0.3;
  c.save(); c.globalAlpha = Math.min(inn, 1 - out);
  c.translate(cx, cy); c.scale(-1, 1); c.rotate(-0.15 + tilt * 0.65);
  drawIcon(c, '@can', 0, T * 0.32, T * 0.82);
  c.restore();
  if (tilt > 0.6 && out === 0) {
    // spout tip in bed coordinates, then drops falling onto the soil with little splashes
    const sx = cx - T * 0.4, sy = cy - T * 0.02;
    for (let k = 0; k < 12; k++) {
      const ph = ((a * 1.8) + k / 12) % 1, x = sx - ph * T * 0.22 + Math.sin(k * 7.1) * T * 0.04, y = sy + ph * ph * T * 0.6;
      c.fillStyle = `rgba(90,169,230,${0.9 - ph * 0.3})`; ell(c, x, y, T * 0.022, T * 0.032);
      if (ph > 0.85) { c.strokeStyle = 'rgba(120,190,240,.7)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(x, sy + T * 0.6, T * 0.05 * (ph - 0.85) * 7, T * 0.015 * (ph - 0.85) * 7, 0, 0, 7); c.stroke(); }
    }
  }
}
// A small, quiet house badge over your cottage (the name shows as a label when you're close).
function homeSign(c, x, y, t) {
  c.save(); c.translate(x, y + Math.sin(t * 1.4) * 1.5); c.globalAlpha = 0.78;
  c.fillStyle = 'rgba(74,44,26,.18)'; c.beginPath(); c.arc(1, 2, 14, 0, 7); c.fill();
  c.fillStyle = '#fff8ea'; c.strokeStyle = '#7a5a44'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 13, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#c9553f'; c.beginPath(); c.moveTo(-7.5, -1); c.lineTo(0, -7.5); c.lineTo(7.5, -1); c.closePath(); c.fill();
  c.fillStyle = '#7a5a44'; c.fillRect(-5, -1, 10, 7.5);
  c.fillStyle = '#fff8ea'; c.fillRect(-1.6, 2, 3.2, 4.5);
  c.restore();
}
function drawWorld(t) {
  const c = ctx;
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#8fd169'; c.fillRect(0, 0, cv.width, cv.height);   // never leave an old frame showing
  c.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
  c.drawImage(seasonGround(), 0, 0);
  if (winter()) { drawIce(c, t); drawPrints(c, t); } else if (GFX.water) drawWater(c, t);
  drawFalls(c, t);
  const vw = cv.width / zoom, vh = cv.height / zoom;
  const list = ents.filter(e => !(e.hide && !ready(e)) && !goneNow(e) && e.x * T > camX - 200 && e.x * T < camX + vw + 200 && e.y * T > camY - 100 && e.y * T < camY + vh + 320);
  list.push({ me: true, y: P.ry, x: P.rx });
  list.sort((a, b) => (a.flat ? -1e3 : 0) + a.y - ((b.flat ? -1e3 : 0) + b.y));
  let bounced = false;
  const sunDx = (S.clock.t - 0.52) * 2, shA = 0.2 * (1 - skyLight(S.clock.t).dark * 0.85) * (S.wx === 'sun' ? 1 : 0.6);
  for (const e of list) {
    if (bounced) { c.restore(); bounced = false; }
    const x = e.x * T, y = e.y * T;
    // a soft shadow on the grass, thrown away from the sun: long in the morning and evening, short at noon
    if (!e.flat && !e.lift && e.kind !== 'pond' && e.kind !== 'fly' && e.kind !== 'plot' && shA > 0.02) { const s0 = (e.me ? 1 : e.s || 1) * T, rx = s0 * (0.34 + Math.abs(sunDx) * 0.3); c.globalAlpha = shA; c.drawImage(SOFT_SHADOW, x - rx + sunDx * s0 * 0.3, y - s0 * 0.1, rx * 2, s0 * 0.2); c.globalAlpha = 1; }
    // tapped things give a little squash-and-bounce
    if (e.me) {
      // Draw whichever of the four views she is closest to; between views she narrows and lifts a little,
      // so each change of view reads as a turn rather than a swap.
      const q = Math.round((P.va || 0) / (Math.PI / 2)), view = ((q % 4) + 4) % 4, off = (P.va || 0) - q * Math.PI / 2, mid = 1 - Math.abs(Math.cos(2 * off));
      c.save(); c.translate(x, y - mid * 4); c.scale((view === 3 ? -1 : 1) * (1 - mid * 0.4), 1);
      if (view === 1 || view === 3) personSide(c, 0, 0, ME, t, P.wk, 1, P.step * 3.7); else person(c, 0, 0, ME, t, P.wk, 1, P.step * 3.7, { back: view === 2 ? 1 : 0 });
      c.restore(); continue; }
    if (e.kind === 'npc' && e.route2) { const L = Object.assign({}, NPC[e.npc].look, { armR: undefined, armL: undefined }); c.save(); c.translate(x, y); c.scale(e.wface || 1, 1); personSide(c, 0, 0, L, t, 1, 1, e.homeGo * 3.7); c.restore(); continue; }
    if (e.kind === 'npc') {
      const ok = e.npc === 'oksana', a = Math.abs(e.tv || 0), L = NPC[e.npc].look, tt = ok ? t + 19.5 : t + e.x;
      chore(c, x, y, e.npc, t, 0);
      if (a < 0.02) { person(c, x, y, L, tt, ok ? OKS.walk : false, 1, ok ? OKS.legs : undefined); chore(c, x, y, e.npc, t, 1); continue; }
      // turning: things in their hands are put down while they talk
      const mid = a < 0.5 ? a * 2 : (1 - a) * 2;
      c.save(); c.translate(x, y - mid * 4); c.scale(Math.sign(e.tv) * (1 - mid * 0.4), 1);
      const Lt = Object.assign({}, L, { armR: undefined, armL: undefined });
      if (a >= 0.5) personSide(c, 0, 0, Lt, tt, false, 1); else person(c, 0, 0, Lt, tt, false, 1, undefined, { side: a * 2 });
      c.restore(); continue;
    }
    if (e.kind === 'pond') continue;
    if (e.kind === 'plot') {
      // Everything in a bed is drawn at bed scale, so bigger beds get bigger crops too.
      c.save(); c.translate(x, y); c.scale(e.s, e.s);
      drawIcon(c, '@plot', 0, T * 0.5, T);
      const p = S.plots[e.i];
      // damp, darker soil while a watered crop grows
      if (p.c && p.wet && now() < p.ready) { c.fillStyle = 'rgba(55,28,12,.32)'; rr(c, -T * 0.46, -T * 0.22, T * 0.92, T * 0.64, T * 0.1); }
      if (p.c) {
        if (!p.wet) { drawIcon(c, '🌱', 0, T * 0.2, T * 0.5); drawIcon(c, '💧', T * 0.28, -T * 0.15 + Math.sin(t * 4) * 3, T * 0.4); }
        else if (now() < p.ready) { const g = 1 - (p.ready - now()) / 50e3; drawIcon(c, '🌱', 0, T * 0.25, T * (0.45 + 0.4 * Math.max(0, g))); }
        else drawIcon(c, W[p.c].ic, 0, T * 0.3 + Math.sin(t * 3 + e.i) * 3, T * 0.85);
      }
      c.restore();
      continue;
    }
    if (e.w === 'ryba') {
      const dir = turnX(e), wig = Math.sin(t * (e.walk ? 9 : 3) + e.hx) * 0.35, k = e.s;
      c.save(); c.translate(x, y - 6); turnDepth(c, e); c.scale(dir * k, k);
      c.fillStyle = 'rgba(28,70,105,.42)'; ell(c, 0, 0, 20, 8);
      c.save(); c.translate(-17, 0); c.rotate(wig); c.beginPath(); c.moveTo(0, 0); c.lineTo(-13, -8); c.lineTo(-13, 8); c.closePath(); c.fill(); c.restore();
      c.restore();
      continue;
    }
    if (e.an) { drawAnimal(c, x, y, e, t); continue; }
    const s = e.s * T;
    if (e.flipX) { c.save(); c.translate(x, y); c.scale(-1, 1); drawIcon(c, e.ic, 0, 0, s, { t }); c.restore(); continue; }
    if (e.kind === 'crawl') { c.save(); c.translate(x, y); c.scale(e.face || 1, 1); drawIcon(c, e.ic, 0, 0, s, { t, walk: 1 }); c.restore(); continue; }
    if (e.sleep) { drawIcon(c, '@kupka', x, y, s * 1.2, { t }); continue; }
    if (e.lift) { drawIcon(c, e.ic, x, y - e.lift * T, s, { t }); continue; }   // resting on top of something, so no ground shadow
    if (!e.flat && e.kind !== 'fly') { c.fillStyle = 'rgba(0,0,0,.13)'; ell(c, x, y, s * (e.ic[0] === '@' ? 0.36 : 0.28), s * 0.09); }
    const hop = e.kind === 'animal' && e.walk ? Math.abs(Math.sin(t * 9 + e.x)) * 3 : e.kind === 'fly' ? Math.sin(t * 9 + e.ph) * 4 : 0;
    if (e.swoop) { c.save(); c.translate(x, y); turnDepth(c, e); c.scale(turnX(e), 1); c.rotate(Math.cos(t * 1.6 + e.ph) * 0.25); drawIcon(c, e.ic, 0, 0, s, { t }); c.restore(); }
    else if (e.w === 'metelyk') drawIcon(c, e.ic, x, y - hop, s, { t: t + e.ph });   // each butterfly flaps on its own beat
    else if (e.lean) { c.save(); c.translate(x, y); c.rotate(e.lean); drawIcon(c, e.ic, 0, 0, s, { t }); c.restore(); }   // propped against something
    else if (e.face === -1 && e.ic[0] !== '@') { c.save(); c.translate(x, 0); c.scale(-1, 1); drawIcon(c, e.ic, 0, y - hop, s); c.restore(); }
    else if ((e.w === 'kvitka' || e.w === 'soniashnyk') && e.ic[0] !== '@') emojiSprite(c, e.ic, x, y, s, GFX.sway ? Math.sin(t * 1.5 + e.x * 2.3 + e.y) * 0.06 : 0, zoom);   // flowers nod in the breeze
    else drawIcon(c, e.ic, x, y - hop, s, { t, v: e.x * 0.37 + e.y * 0.61, fruit: e.give === 'yabluko' ? ready(e) : true, sway: GFX.sway ? Math.sin(t * 1.1 + e.x * 1.7) * 0.028 + Math.sin(t * 2.6 + e.y) * 0.009 : 0 });
    if (e.w === 'khata' && GFX.smoke) smoke(c, x + s * 0.27, y - s * 0.9, t, s / 220);
  }
  // The watering can goes on top of everything, so the player never hides it.
  fetchDraw(c);
  fxDraw(c);
  if (fishFx) drawFishing(c, t);
  if (waterFx) { const pe = ents.find(x => x.k === 'plot' + waterFx.i); if (pe) { c.save(); c.translate(pe.x * T, pe.y * T); c.scale(pe.s, pe.s); drawWatering(c, t - waterFx.t0); c.restore(); } }
  // Name labels are rare: at most one at a time, for the thing you are standing right next to, and only
  // while it is still new to you (a word you have just learned, a villager or cat you have barely got to
  // know, Grandma's cottage before you have been in). Words due for review sparkle instead; tap to recall.
  let tag = null;
  const offer = (e, text, lx) => { const d = Math.hypot(e.x - P.x, e.y - P.y); if (d < 1.6 && (!tag || d < tag.d)) tag = { d, text, x: lx ?? e.x * T, y: e.y * T + 16 }; };
  for (const e of list) {
    if (e.me || e.kind === 'plot' || e.quiet) continue;
    const x = e.x * T, y = e.y * T;
    if (e.kind === 'npc' && e.route2) continue;   // no bubbles on the way home to bed
    if (e.kind === 'npc') {
      const n = S.npc[e.npc], top = y - T * 1.45;
      if (n && n.met && (n.k || 0) < 3 && e.npc !== 'oksana') offer(e, NPC[e.npc].name);   // Oksana's chats open the shop and never count up, so she'd be labelled for ever
      const bub = n && n.mad ? '😠' : e.npc === 'oksana' ? 'market' : n && n.q ? (stage() < 2 && W[n.q].ic[0] !== '@' ? W[n.q].ic : '❔') : '💬';
      bubble(c, x, top + Math.sin(t * 2.5 + e.x) * 3, 19);
      if (bub === 'market') marketBasket(c, x, top + 3 + Math.sin(t * 2.5 + e.x) * 3);
      else drawIcon(c, bub, x, top + 12 + Math.sin(t * 2.5 + e.x) * 3, 27);
      continue;
    }
    if (e.kind === 'fly') { if (isFresh(e.w)) drawIcon(c, '✨', x + 12, y - 14, 18); continue; }
    if (e.cat) {
      const ct = D.cats.find(k => k.id === e.cat), top = y - T * 0.85 + Math.sin(t * 2.5 + e.hx) * 2;
      if (S.cats[e.cat]) drawIcon(c, '❤️', x, top + 8, 18);
      else { bubble(c, x, top, 15); drawIcon(c, stage() < 3 ? W[ct.wants].ic : '❔', x, top + 9, 21); }
      if (S.words[e.w] && known(e.w) <= 1) offer(e, S.cats[e.cat] ? ct.name : W[e.w].uk);
      continue;
    }
    const wd = S.words[e.w];
    if (e.k === 'board' && festReady()) { const top = y - T * 1.6 + Math.sin(t * 2.5) * 3; bubble(c, x, top, 19); drawIcon(c, '🎉', x, top + 12, 27); }
    if (e.kind === 'home') homeSign(c, x, y - e.s * T * 0.5, t);
    else if (e.k === 'oliaHome') {
      if (!S.oliaVisited) offer(e, 'Хата баби Олі' + (stage() < 3 ? " · Grandma Olia's" : ''));
      const n = S.npc.olia, top = y - T * 1.55 + Math.sin(t * 2.5 + e.x) * 3;   // over her door
      const bub = n && n.mad ? '😠' : recipeReady(curRecipe()) ? '🍽️' : n && n.q && stage() < 2 ? W[n.q].ic : n && n.q ? '❔' : '💬';
      bubble(c, x, top, 19); drawIcon(c, bub, x, top + 12, 27);
    }
    else if (wd && known(e.w) <= 1 && (e.w !== 'soniashnyk' || Math.hypot(e.x - P.x, e.y - P.y) < 1)) offer(e, W[e.w].uk, e.labelX ? e.labelX * T : undefined);
    if (isFresh(e.w) && (e.w !== 'soniashnyk' || (Math.floor(e.x) + Math.floor(e.y)) % 5 === 0)) {
      const a = 0.55 + 0.45 * Math.sin(t * 4 + e.x * 3);
      c.globalAlpha = a; drawIcon(c, '✨', x + e.s * T * 0.3, y - e.s * T * (e.flat ? 0.2 : 0.75), 24); c.globalAlpha = 1;
    }
  }
  if (bounced) { c.restore(); bounced = false; }
  if (tag) label(c, tag.text, tag.x, tag.y);
  if (P.path.length) { const g = P.path[P.path.length - 1], pu = 0.5 + 0.5 * Math.sin(t * 7); c.strokeStyle = `rgba(255,255,255,${0.55 + 0.3 * pu})`; c.lineWidth = 3; c.beginPath(); c.ellipse(g.x * T, g.y * T, 13 + pu * 3, 7 + pu * 1.6, 0, 0, 7); c.stroke(); c.fillStyle = 'rgba(255,255,255,.4)'; ell(c, g.x * T, g.y * T, 5, 2.7); }
  // cloud shadows drifting over everything (heavier on a cloudy or rainy day)
  c.globalAlpha = S.wx === 'sun' ? 0.17 : 0.3;
  if (GFX.cloud) for (let i = 0; i < 3; i++) { const w = 900 + i * 220, x = ((t * 14 + i * 1150) % (MW * T + w * 2)) - w, y = (1 + i * 9.5) * T - 120; if (x + w > camX && x < camX + vw && y + w * 0.5 > camY && y < camY + vh) c.drawImage(cloudSpr, x, y, w, w * 0.5); }
  c.globalAlpha = 1;
  c.setTransform(1, 0, 0, 1, 0, 0);
  {   // evening, night and weather; windows glow once the light goes
    const lights = [], sx = x => (x * T - camX) * zoom, sy = y => (y * T - camY) * zoom;
    for (const e of list) if (e.kind === 'home' || e.k === 'oliaHome' || (e.w === 'khata' && e.kind !== 'npc')) lights.push([sx(e.x), sy(e.y - (e.s || 1) * 0.35), (e.s || 1) * T * zoom * 0.75]);
    lights.push([sx(P.rx), sy(P.ry - 0.4), T * zoom * 1.2]);   // her little lantern
    paintSky(c, cv.width, cv.height, t, lights, true);
    const nt = nightNow() ? (S.clock.nightT || 0) : 0;   // out far too late: it grows very dark, all but her lantern
    if (nt > 25) { const a = Math.min(0.5, (nt - 25) / 30 * 0.5), lx = sx(P.rx), ly = sy(P.ry - 0.4), R = T * zoom * 2.2, g = c.createRadialGradient(lx, ly, R * 0.15, lx, ly, R);
      g.addColorStop(0, 'rgba(4,6,18,0)'); g.addColorStop(1, `rgba(4,6,18,${a})`); c.fillStyle = g; c.fillRect(0, 0, cv.width, cv.height); }
  }
  // specks of pollen drifting on the air
  if (GFX.motes && !winter() && !wet(S.wx) && S.wx !== 'fog' && skyLight(S.clock.t).dark < 0.3) for (let i = 0; i < 14; i++) {
    const sp = 14 + (i % 5) * 6, mw = cv.width + 80, mh = cv.height + 80;
    let mx = (i * 173.3 + t * sp - camX * zoom * 0.5) % mw, my = (i * 311.7 + t * sp * 0.35 + Math.sin(t * 0.8 + i) * 20 - camY * zoom * 0.5) % mh;
    if (mx < 0) mx += mw; if (my < 0) my += mh;
    c.fillStyle = `rgba(255,${i % 3 ? 255 : 238},${i % 3 ? 244 : 170},${0.4 + 0.25 * Math.sin(t * 1.7 + i * 2)})`; circ(c, mx - 40, my - 40, (1.3 + (i % 3) * 0.55) * zoom);
  }
}

// ------------------------------------------------------------------ festivals
// The notice board in the square lists what the next festival needs. Hand things over as you find them;
// once it's all in, start the festival: the villagers greet you (you answer), everyone joins a хоровод
// (tap on the beat to dance), Kupala ends with jumping the bonfire and Christmas Eve with a carol, and
// you go home with a keepsake for your cottage.
// Each season has its festival: Kupala in summer, Obzhynky in autumn, Christmas Eve in winter, Easter in spring.
const FEST_OF = ['kupala', 'obzhynky', 'sviatvechir', 'velykden'];
const festKey = () => Math.floor(((S.clock.day || 1) - 1) / (SEASON_DAYS * 4)) * 4 + seasonIx();
// What's been brought for each season's festival, kept per season (S.fest.k[key] = { have, done }), so a
// season change or a ?season= preview never wipes what you've already handed over.
function festNow() {
  if (!S.fest.k) {   // an older save: its progress belongs to the real season (never a ?season= preview)
    const real = Math.floor(((S.clock.day || 1) - 1) / (SEASON_DAYS * 4)) * 4 + Math.floor(((S.clock.day || 1) - 1) / SEASON_DAYS) % 4;
    S.fest = { k: { [S.fest.key !== undefined ? S.fest.key : real]: { have: S.fest.have || {}, done: S.fest.done !== undefined && S.fest.done === S.fest.key } } };
    save();
  }
  const k = festKey();
  if (!S.fest.k[k]) { S.fest.k[k] = { have: {}, done: false }; for (const old of Object.keys(S.fest.k)) if (+old < k - 8) delete S.fest.k[old]; }
  return S.fest.k[k];
}
const festSync = () => festNow();
const curFest = () => { festSync(); return D.festivals.find(f => f.id === FEST_OF[seasonIx()]); };
const festDoneNow = () => festNow().done;
const festHave = id => Math.min(curFest().needs[id], festNow().have[id] || 0);
const festReady = () => !festDoneNow() && Object.keys(curFest().needs).every(id => festHave(id) >= curFest().needs[id]);
// A compact card (no scrolling on a phone): the festival's name, what's still needed, one line about it,
// and the buttons.
function boardCard() {
  if (festDoneNow()) {   // this season's festival has been: say when the next one is
    const nx = D.festivals.find(f => f.id === FEST_OF[(seasonIx() + 1) % 4]), st = stage(), days = seasonDaysLeft();
    openSheet(`<div class="card"><div class="word" style="font-size:26px">📋 ${W.doshka.uk}</div>
      <div class="hint">✓ ${W[curFest().id].uk}${st < 3 ? ' is over. Lovely festival!' : ''}<br>${SEASON_IC[SEASONS[(seasonIx() + 1) % 4]]} <b>${W[nx.id].uk}</b>${st < 3 ? ` · the next festival, in ${days} day${days > 1 ? 's' : ''}` : ` · ${days}`}</div>
      <div class="row">${btn('close', '', lab('close'))}</div></div>`);
    return;
  }
  const F = curFest(), st = stage(), first = learn(F.id); learn('doshka');
  const canGive = Object.keys(F.needs).some(id => festHave(id) < F.needs[id] && (S.bag[id] || 0) > 0), ready = festReady();
  const list = `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:8px">${Object.entries(F.needs).map(([id, n]) => { const h = festHave(id), full = h >= n; return `<span style="text-align:center;min-width:54px;opacity:${h ? 1 : 0.55}"><img src="${iconURL(id)}" style="width:34px;height:34px" alt=""><br><b style="font-size:14px">${full ? '✓' : h + '/' + n}</b><br><small style="font-size:14px">${W[id].uk}</small></span>`; }).join('')}</div>`;
  const fact = W[F.id].fact;
  openSheet(`<div class="card">
    <canvas id="flyer" style="width:100%;height:210px;display:block" aria-label="${W[F.id].uk}"></canvas>${st < 3 ? `<div class="en" style="font-size:14px;margin-top:2px">${W[F.id].en}</div>` : ''}
    <div class="hint" style="margin-top:6px;padding:6px 10px">📋 ${W.doshka.uk}${xl(' · notice board')} · ${ready ? `🎉 <b>${PH.zi_sviatom.uk}</b>${xl(' Everything is ready!')}` : xl('The village needs:')}${list}</div>
    ${fact ? `<div class="muted" style="font-size:14px;padding:6px 2px 0;line-height:1.35">🌾 ${fact.uk}${st < 3 ? `<br><span style="opacity:.8">${fact.en}</span>` : ''}</div>` : ''}
    <div class="row">${btn('hear', 'w_' + F.id, '🔊', 'round blue')}${ready ? btn('festGo', '', lab('festgo')) : canGive ? btn('boardGive', '', lab('handover')) : ''}${btn('close', '', lab('close'), 'ghost')}</div></div>`);
  drawFlyer($('#flyer'), F, ready);
  if (first) say('w_' + F.id);
}
// The festival flyer on the notice board: a sheet of paper pinned up a little crooked, with an embroidered
// border, the festival's name in big painted letters, its picture and the things that go with it, an
// invitation, and how many days are left. Each festival has its own colours.
const FLYER = {
  obzhynky: { bg: '#fff4d6', ink: '#8a4b12', accent: '#d9a13a', deco: ['@pshenytsia', '@vinok', '@pshenytsia'], sky: '#f6d58a' },
  kupala: { bg: '#e9f1ff', ink: '#1f3f7a', accent: '#e2574c', deco: ['@vinok', '🔥', '@vinok'], sky: '#2c4a8a' },
  sviatvechir: { bg: '#eef2fb', ink: '#23407a', accent: '#d4a533', deco: ['@zirka', '@didukh', '@zirka'], sky: '#1d2d5c' },
  velykden: { bg: '#f4fbe9', ink: '#3d6b2a', accent: '#d6476b', deco: ['@pysanka', '🌸', '@pysanka'], sky: '#bfe6a0' },
};
function drawFlyer(cv2, F, ready) {
  if (!cv2) return; const dpr = Math.min(2, window.devicePixelRatio || 1), W0 = cv2.clientWidth, H0 = cv2.clientHeight; cv2.width = W0 * dpr; cv2.height = H0 * dpr;
  const c = cv2.getContext('2d'); c.scale(dpr, dpr);
  const P = FLYER[F.id] || FLYER.obzhynky, st = stage(), days = seasonDaysLeft(), pw = Math.min(W0 * 0.9, 330), ph = H0 - 16, px = (W0 - pw) / 2, py = 10;
  const deco = id => id[0] === '@' ? (W[id.slice(1)] ? W[id.slice(1)].ic : '✨') : id;
  // the cork of the board behind it
  c.fillStyle = '#b5824e'; rr(c, 0, 0, W0, H0, 14); c.fillStyle = 'rgba(80,50,20,.18)'; for (let i = 0; i < 90; i++) { const x = (i * 97.3) % W0, y = (i * 53.7) % H0; circ(c, x, y, 1.4); }
  c.save(); c.translate(W0 / 2, H0 / 2); c.rotate(-0.025); c.translate(-W0 / 2, -H0 / 2);
  c.fillStyle = 'rgba(40,25,10,.3)'; rr(c, px + 4, py + 5, pw, ph, 6);   // its shadow on the cork
  c.fillStyle = P.bg; rr(c, px, py, pw, ph, 6);
  // a band of sky with the festival's colour at the top, under the title
  let g = c.createLinearGradient(0, py, 0, py + ph * 0.55); g.addColorStop(0, P.sky); g.addColorStop(1, P.bg); c.fillStyle = g; rr(c, px + 8, py + 16, pw - 16, ph * 0.5, 4);
  if (F.id === 'kupala' || F.id === 'sviatvechir') { c.fillStyle = 'rgba(255,250,220,.9)'; for (let i = 0; i < 16; i++) { const x = px + 14 + ((i * 0.618) % 1) * (pw - 28), y = py + 20 + ((i * 0.377) % 1) * ph * 0.3; star4(c, x, y, 1.5 + (i % 3)); } }   // stars on the night ones
  // the embroidered border: red and black cross-stitch diamonds, top and bottom
  const band = y => { for (let x = px + 10; x < px + pw - 10; x += 12) { c.fillStyle = (x / 12 | 0) % 2 ? '#2d2d2d' : '#c62828'; poly(c, [[x + 6, y - 4], [x + 10, y], [x + 6, y + 4], [x + 2, y]]); } c.fillStyle = '#c62828'; c.fillRect(px + 10, y + 6, pw - 20, 1.5); c.fillRect(px + 10, y - 7.5, pw - 20, 1.5); };
  band(py + 11); band(py + ph - 11);
  // the picture: the festival in the middle, its things either side
  drawIcon(c, W[F.id].ic, W0 / 2, py + ph * 0.6, Math.min(78, ph * 0.42));
  drawIcon(c, deco(P.deco[0]), px + pw * 0.17, py + ph * 0.56, 42); drawIcon(c, deco(P.deco[2]), px + pw * 0.83, py + ph * 0.56, 42);
  // the title, painted big, and the invitation
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const title = W[F.id].uk; let fs2 = 30; c.font = `900 ${fs2}px Georgia, "Times New Roman", serif`; while (c.measureText(title).width > pw - 40 && fs2 > 16) { fs2--; c.font = `900 ${fs2}px Georgia, "Times New Roman", serif`; }
  c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,.85)'; c.strokeText(title, W0 / 2, py + 34); c.fillStyle = P.ink; c.fillText(title, W0 / 2, py + 34);
  c.font = '800 15px system-ui, sans-serif'; c.fillStyle = P.accent; c.fillText(ready ? '🎉 ' + PH.zi_sviatom.uk : 'Запрошуємо всіх!', W0 / 2, py + ph * 0.72);
  c.font = '600 14px system-ui, sans-serif'; c.fillStyle = P.ink;
  c.fillText(st < 3 ? (ready ? 'Everything is ready: come and celebrate!' : `Everyone's invited! · ${days} day${days > 1 ? 's' : ''} left this season`) : `${SEASON_IC[season()]} ${days}`, W0 / 2, py + ph * 0.82);
  c.restore();
  // a red drawing pin at the top
  c.fillStyle = 'rgba(0,0,0,.25)'; circ(c, W0 / 2 + 2, py + 4, 6); c.fillStyle = '#d43a3a'; circ(c, W0 / 2, py + 2, 6); c.fillStyle = 'rgba(255,255,255,.6)'; circ(c, W0 / 2 - 2, py, 2);
}
function boardGive() {
  const F = curFest(); let n = 0;
  for (const id of Object.keys(F.needs)) { const g = Math.min(S.bag[id] || 0, F.needs[id] - festHave(id)); if (g > 0) { S.bag[id] -= g; festNow().have[id] = festHave(id) + g; n += g; useWord(id, true); } }
  hud(); save(); blip(880, 0.1); toast(`📋 −${n}  ${festReady() ? '🎉' : ''}`); boardCard();
}
let fest = null;
// Each festival's own dance song (F.tune), with its measured beat (F.beat) and first beat (F.first). The dance beats are timed by the
// tune itself, so the drum rings land on its beat; with the music off they keep the same time by the clock.
const festMusic = new Audio();
festMusic.loop = true; festMusic.preload = 'none';
const festClock = () => fest && fest.tune && !festMusic.paused ? festMusic.currentTime : fest ? nowT - fest.danceT : 0;
function startFest() {
  const F = curFest();
  fest = { F, phase: 'greet', ang: 0, boost: 0, lastT: nowT, beats: [], hits: 0, pop: null, t0: nowT, endT: 0, jumpT: 0, done: {} };
  mode = 'fest'; learn(F.id); learn('horovod'); document.body.classList.add('scene');   // the goal line steps aside for the festival
  const faces = ['olia', 'taras', 'oksana', 'andriiko', 'bohdan'].map(id => `<img src="${faceURL(NPC[id].look)}" style="width:54px;height:54px;border-radius:14px;background:#e8f4d9" alt="">`).join('');
  const me = fest;
  // drawFest opens it again if it's swiped away or tapped off, since only the answer starts the dance
  me.greetCard = () => {
    if (fest !== me) return;
    me.greetAt = nowT;
    openSheet(`<div class="card"><div class="tag">🎉 ${W[F.id].uk}${stage() < 3 ? ' · ' + W[F.id].en : ''}</div>
      <div style="display:flex;gap:6px;justify-content:center;margin:8px 0">${faces}</div>
      <div class="word" style="font-size:32px">«${PH[F.greet].uk}»</div>${stage() < 3 ? `<div class="en">${PH[F.greet].en}</div>` : ''}
      ${F.culture ? `<div class="festnote"><b>🇺🇦 ${W[F.id].en[0].toUpperCase() + W[F.id].en.slice(1)} in Ukraine</b>${F.culture}</div>` : ''}
      <div class="muted" style="padding:6px 0 0">${stage() < 3 ? 'Answer them:' : ''}</div>
      <div class="row">${btn('hear', 'p_' + F.greet, '🔊', 'round blue')}${btn('festReply', '', `${PH[F.reply].uk}<small class="cen"${stage() < 3 ? '' : ' style="display:none"'}>${PH[F.reply].en}</small>`)}</div></div>`);
    say('p_' + F.greet);
  };
  setTimeout(me.greetCard, 900);
}
function festReply() {
  if (!fest) return;
  say('p_' + fest.F.reply); closeSheet();
  festDance();
}
// The dance.
function festDance() {
  if (!fest) return;
  const F = fest.F; fest.beats = Array.from({ length: 28 }, (_, i) => ({ t: (F.first || 0) + (i + 3) * (F.beat || 0.8), hit: 0 }));   // three beats to get going
  fest.phase = 'dance'; fest.danceT = nowT; fest.tune = false;
  try { music.pause(); if (!festMusic.src.endsWith(F.tune + '.mp3')) festMusic.src = 'music/' + F.tune + '.mp3'; festMusic.currentTime = 0; festMusic.volume = 0.6; if (musicOn) festMusic.play().then(() => { if (fest) { fest.tune = true; fest.danceT = nowT - festMusic.currentTime; } }).catch(() => {}); } catch (e) {}
  setTimeout(() => { if (fest) say('w_tantsiui'); learn('tantsiui'); }, 1300);
}
function festTap(ev) {
  const f = fest; if (!f) return;
  if (f.phase === 'dance') {
    const ft = festClock(); let best = null; for (const b of f.beats) if (!b.hit && Math.abs(ft - b.t) < 0.3 && (!best || Math.abs(ft - b.t) < Math.abs(ft - best.t))) best = b;
    f.stepT = nowT; f.boost += best ? 0 : 1; festAct('tantsiui');   // every tap: the circle steps round, everyone hops, «Танцюй!»
    if (best) { best.hit = Math.abs(ft - best.t) < 0.12 ? 2 : 1; f.hits++; f.boost += 2.4; f.combo = (f.combo || 0) + 1; f.best = Math.max(f.best || 0, f.combo); f.hitT = nowT; f.sparks = (f.sparks || []).concat(Array.from({ length: best.hit === 2 ? 14 : 8 }, (_, i) => ({ a: i / (best.hit === 2 ? 14 : 8) * Math.PI * 2 + Math.random() * 0.3, t0: nowT }))); f.pop = { t: nowT, txt: best.hit === 2 ? PH.chudovo.uk : PH.molodets.uk }; blip(best.hit === 2 ? 990 : 820, 0.07); }
  } else if (f.phase === 'farewell' && nowT - f.fwT > 2) { festFinish();   // a tap once the goodbye is up: on to the village
  } else if (f.phase === 'finale' && !f.jumpT) {
    f.jumpT = nowT; useWord(f.F.finale, true); f.fl = { v: f.F.finale, t: nowT }; actSub(f.F.finale, null);
    if (f.F.finale === 'spivai') say('w_spivai', 'p_koliadka'); else { say('w_stryby'); blip(660, 0.1); }
  }
}
const FAREWELL = { kupala: 'zi_sviatom', obzhynky: 'zi_sviatom', sviatvechir: 'z_rizdvom', velykden: 'z_velykodnem' };
function festDone() {
  if (!fest || fest.phase === 'farewell') return;
  const F = fest.F, owned = (S.home[F.reward] || 0) + (S.decor[F.reward] ? 1 : 0) > 0, dev = fest.dev;
  if (!dev) { S.hearts += 5; if (owned) S.coins += 15; else S.home[F.reward] = (S.home[F.reward] || 0) + 1; festNow().done = true; }
  closeSheet(); hud(); save();
  fest.phase = 'farewell'; fest.fwT = nowT; fest.fwToast = { dev, owned }; fest.burst = [];
  say('p_' + (FAREWELL[F.id] || 'zi_sviatom'), 'p_do_zustrichi');
}
// The end of the farewell: back to the village with its theme.
function festFinish() {
  const f = fest; if (!f || f.finishing) return; f.finishing = true; const F = f.F, { dev, owned } = f.fwToast || {};
  fadeThen(() => { fest = null; mode = 'world'; document.body.classList.remove('scene'); hud(); save(); try { festMusic.pause(); } catch (e) {} startMusic(); });
  toast(dev ? '🛠️ ' + W[F.id].uk : `🎉 +5 ❤️ ${owned ? ' +15 ₴' : ' · ' + W[F.reward].uk + (stage() < 3 ? ' (in your basket: place it at home)' : '')}`, 3200);
}
// A crackling bonfire: logs, three tongues of flame and sparks.
function bonfire(c, x, y, s, t) {
  const g = c.createRadialGradient(x, y - s * 0.3, 0, x, y - s * 0.3, s * 1.6); g.addColorStop(0, 'rgba(255,170,60,.45)'); g.addColorStop(1, 'rgba(255,170,60,0)'); c.fillStyle = g; c.fillRect(x - s * 1.6, y - s * 1.9, s * 3.2, s * 3.2);
  c.save(); c.translate(x, y); c.lineCap = 'round';
  c.strokeStyle = '#6b4422'; c.lineWidth = s * 0.12; for (const r of [-0.35, 0.35, 0]) { c.save(); c.rotate(r); c.beginPath(); c.moveTo(-s * 0.45, 0); c.lineTo(s * 0.45, 0); c.stroke(); c.restore(); }
  for (const [col, k, ph] of [['#ff5a1f', 1, 0], ['#ff9f1c', 0.72, 1.3], ['#ffd23f', 0.45, 2.1]]) {
    const fl = (Math.sin(t * 9 + ph) * 0.08 + 1) * k * s, sw = Math.sin(t * 5 + ph) * s * 0.08;
    c.fillStyle = col; c.beginPath(); c.moveTo(-s * 0.36 * k, -s * 0.02); c.quadraticCurveTo(-s * 0.4 * k, -fl * 0.6, sw, -fl * 1.15); c.quadraticCurveTo(s * 0.4 * k, -fl * 0.6, s * 0.36 * k, -s * 0.02); c.closePath(); c.fill();
  }
  c.fillStyle = '#ffe9a8'; for (let i = 0; i < 9; i++) { const q = (t * 0.7 + i / 9) % 1; c.globalAlpha = 1 - q; circ(c, Math.sin(i * 2.3 + t) * s * 0.3, -s * (0.4 + q * 1.4), s * 0.03); }
  c.globalAlpha = 1; c.restore();
}
// The carollers' star on its pole, turning slowly.
function carolStar(c, x, y, s, t) {
  c.strokeStyle = '#6b4422'; c.lineWidth = s * 0.06; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - s * 1.1); c.stroke();
  c.save(); c.translate(x, y - s * 1.35); c.rotate(t * 0.6);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, s * 0.9); g.addColorStop(0, 'rgba(255,220,120,.5)'); g.addColorStop(1, 'rgba(255,220,120,0)'); c.fillStyle = g; circ(c, 0, 0, s * 0.9);
  const pts = []; for (let i = 0; i < 16; i++) { const r = i % 2 ? s * 0.18 : s * 0.42, a = i * Math.PI / 8; pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
  c.fillStyle = '#ffd23f'; poly(c, pts); c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); pts.forEach(([px, py], i) => i ? c.lineTo(px, py) : c.moveTo(px, py)); c.closePath(); c.stroke();
  c.fillStyle = '#d43a3a'; circ(c, 0, 0, s * 0.1); c.restore();
}
// The verb said and flashed on each press in the festival: «Танцюй!» while dancing, «Стрибай!» / «Співай!» at
// the finale. Like the games' action words, it's said over and over while you keep pressing, each time to the
// end of the word, and the subtitle shows its one English word.
function festAct(v) {
  const f = fest; if (!f) return; const t = nowT;
  if (!f.fl || f.fl.v !== v || t - f.fl.t > 0.35) f.fl = { v, t };
  f.lastAct = performance.now();
  if (!f.vo || f.vo.v !== v) {
    if (f.vo) { try { f.vo.pause(); } catch (e) {} f.vo.onended = null; }
    const vo = new Audio('audio/w_' + v + '.mp3'), me = f; vo.v = v; f.vo = vo; vo.volume = 1;
    vo.onended = () => { setTimeout(() => { if (fest === me && me.vo === vo && performance.now() - me.lastAct < 700) { vo.play().catch(() => {}); actSub(v, vo); } }, 60); };
  }
  if (f.vo.paused) { stopSay(); try { f.vo.currentTime = 0; } catch (e) {} f.vo.play().catch(() => {}); actSub(v, f.vo); }
}
function festFlash(c, w, h, u, t) {
  const fl = fest && fest.fl; if (!fl) return; const q = (t - fl.t) / 1.2; if (q < 0 || q > 1) return;
  const W0 = W[fl.v].uk, txt = W0[0].toUpperCase() + W0.slice(1) + '!';
  c.save(); c.globalAlpha = Math.max(0, flashA(q)); c.translate(w / 2, h * 0.36); const s = flashS(q); c.scale(s, s);
  c.font = cozyFont(Math.round(u * 0.1)); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.lineWidth = u * 0.022; c.strokeStyle = INK; c.strokeText(txt, 0, 0); c.fillStyle = '#ffd27a'; c.fillText(txt, 0, 0); c.restore();
}
// ------------------------------------------------------------------ what you'd see at each festival
// Kupala Night: a river with flower wreaths floating on it, each with a candle; the decorated Kupala tree; the
// magical fern flower glowing in the grass; fireflies. Obzhynky: the stubble field with stooks of sheaves, the
// harvest wreath of wheat on a pole, a cart of pumpkins, apples. Christmas Eve: the first star, a sleigh, the
// vertep (a two-storey nativity box) and carollers' «коза», straw «павук» ornaments hung on the bunting. Easter:
// blossoming cherry trees, the church bell swinging, a vase of pussy willow (верба), a tree hung with
// pysanky, and the first snowdrops.
function festScenery(c, w, h, u, t, F, layer, pulse) {
  const k = u / 390 * 1.55;
  if (F.id === 'kupala') {
    if (layer === 'back') {
      // the river across the meadow, wreaths with candles drifting downstream
      const ry = h * 0.755; const g = c.createLinearGradient(0, ry - h * 0.02, 0, ry + h * 0.04); g.addColorStop(0, '#1d2f66'); g.addColorStop(1, '#2c4a8a'); c.fillStyle = g; c.fillRect(0, ry - h * 0.018, w, h * 0.055);
      c.strokeStyle = 'rgba(255,220,140,.25)'; c.lineWidth = 2 * k; for (let i = 0; i < 6; i++) { const x = ((i * 0.19 + t * 0.02) % 1) * w; c.beginPath(); c.moveTo(x, ry + h * 0.01); c.lineTo(x + 18 * k, ry + h * 0.01); c.stroke(); }
      for (let i = 0; i < 4; i++) { const x = ((i * 0.27 + t * 0.012) % 1.1 - 0.05) * w, y = ry + h * 0.008 + Math.sin(t * 1.5 + i) * 1.5 * k;
        const gl = c.createRadialGradient(x, y - 6 * k, 0, x, y - 6 * k, 22 * k); gl.addColorStop(0, 'rgba(255,200,110,.6)'); gl.addColorStop(1, 'rgba(255,200,110,0)'); c.fillStyle = gl; c.fillRect(x - 22 * k, y - 28 * k, 44 * k, 44 * k);
        for (let q = 0; q < 8; q++) { const a = q / 8 * Math.PI * 2; c.fillStyle = ['#ff7aa8', '#ffd23f', '#ffffff', '#9b6bd6'][q % 4]; circ(c, x + Math.cos(a) * 8 * k, y + Math.sin(a) * 3 * k, 2.6 * k); }
        c.fillStyle = '#fff8ea'; c.fillRect(x - 1.2 * k, y - 8 * k, 2.4 * k, 7 * k); c.fillStyle = '#ffd27a'; ell(c, x, y - 10 * k, 1.8 * k, 3 * k * (0.9 + 0.2 * Math.sin(t * 12 + i))); }
      // the Kupala tree: a young birch hung with ribbons and flowers
      const tx = w * 0.08, ty = h * 0.6;
      c.fillStyle = '#e9e4d8'; c.fillRect(tx - 3 * k, ty - h * 0.16, 6 * k, h * 0.16); c.fillStyle = '#3a3a3a'; for (let i = 0; i < 5; i++) c.fillRect(tx - 3 * k, ty - h * (0.03 + i * 0.03), 3 * k, 1.5 * k);
      c.fillStyle = '#3f7a3a'; ell(c, tx, ty - h * 0.19, 20 * k, 26 * k);
      ['#d43a3a', '#ffd23f', '#3d7cc2', '#ff7aa8'].forEach((col, i) => { c.strokeStyle = col; c.lineWidth = 2.4 * k; c.beginPath(); c.moveTo(tx - 12 * k + i * 8 * k, ty - h * 0.16); c.quadraticCurveTo(tx - 14 * k + i * 8 * k + Math.sin(t * 2 + i) * 4 * k, ty - h * 0.1, tx - 12 * k + i * 8 * k + Math.sin(t * 2 + i) * 6 * k, ty - h * 0.05); c.stroke(); });
    } else {
      // the fern flower, said to bloom only on Kupala Night, glowing in the grass
      const fx = w * 0.9, fy = h * 0.8, gl = 0.6 + 0.4 * Math.sin(t * 3);
      const g2 = c.createRadialGradient(fx, fy, 0, fx, fy, 40 * k); g2.addColorStop(0, `rgba(255,120,60,${0.55 * gl})`); g2.addColorStop(1, 'rgba(255,120,60,0)'); c.fillStyle = g2; c.fillRect(fx - 40 * k, fy - 40 * k, 80 * k, 80 * k);
      c.strokeStyle = '#2f6a3a'; c.lineWidth = 2 * k; for (const a of [-0.9, -0.5, 0.5, 0.9]) { c.beginPath(); c.moveTo(fx, fy + 12 * k); c.quadraticCurveTo(fx + Math.sin(a) * 14 * k, fy, fx + Math.sin(a) * 22 * k, fy - 6 * k); c.stroke(); }
      c.save(); c.translate(fx, fy - 4 * k); c.rotate(t * 0.8); for (let i = 0; i < 6; i++) { c.rotate(Math.PI / 3); c.fillStyle = i % 2 ? '#ff5a1f' : '#ffd23f'; ell(c, 0, -6 * k, 3 * k, 6 * k); } c.fillStyle = '#fff2b0'; circ(c, 0, 0, 3 * k); c.restore();
      for (let i = 0; i < 18; i++) { const on = Math.max(0, Math.sin(t * 1.8 + i * 2.1)); c.globalAlpha = on; c.fillStyle = '#e6ff9a'; circ(c, (Math.sin(t * 0.2 + i * 7) * 0.5 + 0.5) * w, h * (0.55 + Math.sin(t * 0.3 + i) * 0.15), 2.4 * k); } c.globalAlpha = 1;
    }
  } else if (F.id === 'obzhynky') {
    if (layer === 'back') {
      // the reaped field: golden stubble rows and stooks of sheaves
      c.strokeStyle = 'rgba(200,150,60,.5)'; c.lineWidth = 1.2 * k; for (let r = 0; r < 6; r++) { const y = h * (0.5 + r * 0.025); c.beginPath(); c.moveTo(0, y); c.lineTo(w, y + 2 * k); c.stroke(); }
      for (const [x, y, s] of [[0.06, 0.58, 1], [0.2, 0.54, 0.8], [0.8, 0.54, 0.8], [0.94, 0.58, 1]]) { const X = x * w, Y = y * h, S = s * k;
        c.fillStyle = '#d9a64a'; for (const a of [-0.35, -0.12, 0.12, 0.35]) { c.save(); c.translate(X, Y); c.rotate(a); c.fillRect(-3 * S, -34 * S, 6 * S, 34 * S); c.fillStyle = '#e8c35a'; ell(c, 0, -36 * S, 5 * S, 8 * S); c.fillStyle = '#d9a64a'; c.restore(); }
        c.fillStyle = '#b8322b'; c.fillRect(X - 8 * S, Y - 20 * S, 16 * S, 3 * S); }
      // a cart piled with pumpkins
      const cx = w * 0.78, cy = h * 0.62; c.fillStyle = '#8a5a2b'; c.fillRect(cx - 26 * k, cy - 14 * k, 52 * k, 10 * k); c.strokeStyle = '#6b4422'; c.lineWidth = 3 * k; for (const sx of [-16, 16]) { c.beginPath(); c.arc(cx + sx * k, cy, 8 * k, 0, 7); c.stroke(); }
      c.beginPath(); c.moveTo(cx - 26 * k, cy - 9 * k); c.lineTo(cx - 44 * k, cy - 2 * k); c.stroke();
      for (const [dx, dy, r] of [[-14, -20, 8], [0, -24, 9], [14, -20, 8], [-6, -32, 7], [8, -32, 6]]) { c.fillStyle = '#ff8a1f'; ell(c, cx + dx * k, cy + dy * k, r * k, r * 0.8 * k); c.fillStyle = '#3f8a3a'; c.fillRect(cx + dx * k - 1 * k, cy + dy * k - r * 0.9 * k, 2 * k, 3 * k); }
    } else {
      // the harvest wreath of wheat ears and flowers, carried on a pole
      const px = w * 0.12, py = h * 0.62; c.strokeStyle = '#8a5a2b'; c.lineWidth = 3 * k; c.beginPath(); c.moveTo(px, py + h * 0.1); c.lineTo(px, py - h * 0.12); c.stroke();
      c.save(); c.translate(px, py - h * 0.12); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; c.save(); c.rotate(a); c.fillStyle = '#e8c35a'; ell(c, 0, -16 * k, 3 * k, 7 * k); c.restore(); } for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.fillStyle = ['#d43a3a', '#3d7cc2', '#ffffff'][i % 3]; circ(c, Math.cos(a) * 16 * k, Math.sin(a) * 16 * k, 3 * k); } c.restore();
      ['#d43a3a', '#ffd23f', '#3d7cc2'].forEach((col, i) => { c.strokeStyle = col; c.lineWidth = 2.4 * k; c.beginPath(); c.moveTo(px, py - h * 0.1); c.quadraticCurveTo(px + 10 * k + i * 4 * k, py - h * 0.05, px + 6 * k + i * 5 * k + Math.sin(t * 2 + i) * 4 * k, py); c.stroke(); });
      for (const [x, y] of [[0.86, 0.92], [0.9, 0.95], [0.83, 0.96]]) { c.fillStyle = '#d43a3a'; circ(c, x * w, y * h, 7 * k); c.fillStyle = '#3f8a3a'; ell(c, x * w + 3 * k, y * h - 7 * k, 3 * k, 1.5 * k); }   // apples
    }
  } else if (F.id === 'sviatvechir') {
    if (layer === 'back') {
      // the first star, which the family watches for before supper
      const sx = w * 0.2, sy = h * 0.1, tw = 0.75 + 0.25 * Math.sin(t * 4);
      const g3 = c.createRadialGradient(sx, sy, 0, sx, sy, 34 * k); g3.addColorStop(0, `rgba(255,248,214,${0.8 * tw})`); g3.addColorStop(1, 'rgba(255,248,214,0)'); c.fillStyle = g3; c.fillRect(sx - 34 * k, sy - 34 * k, 68 * k, 68 * k);
      c.fillStyle = '#fffbe6'; const pts = []; for (let i = 0; i < 8; i++) { const r = i % 2 ? 3 * k : 11 * k * tw, a = i * Math.PI / 4; pts.push([sx + Math.cos(a) * r, sy + Math.sin(a) * r]); } poly(c, pts);
      // a sleigh waiting by the cottage
      const lx = w * 0.84, ly = h * 0.58; c.fillStyle = '#b8322b'; poly(c, [[lx - 22 * k, ly - 16 * k], [lx + 18 * k, ly - 16 * k], [lx + 22 * k, ly - 4 * k], [lx - 18 * k, ly - 4 * k]]); c.fillStyle = '#ffd23f'; c.fillRect(lx - 18 * k, ly - 12 * k, 36 * k, 2 * k);
      c.strokeStyle = '#6b4422'; c.lineWidth = 2.5 * k; c.beginPath(); c.moveTo(lx - 26 * k, ly); c.lineTo(lx + 22 * k, ly); c.quadraticCurveTo(lx + 30 * k, ly, lx + 28 * k, ly - 8 * k); c.stroke();
    } else {
      // the vertep: a two-storey wooden box with a star on top, carried by the carollers
      const vx = w * 0.1, vy = h * 0.8; c.fillStyle = '#8a5a2b'; rr(c, vx - 20 * k, vy - 46 * k, 40 * k, 46 * k, 3 * k); c.fillStyle = '#1d2a4a'; c.fillRect(vx - 16 * k, vy - 42 * k, 32 * k, 17 * k); c.fillRect(vx - 16 * k, vy - 21 * k, 32 * k, 17 * k);
      c.fillStyle = '#ffd27a'; circ(c, vx, vy - 34 * k, 3 * k); c.fillStyle = '#e8c35a'; c.fillRect(vx - 6 * k, vy - 13 * k, 12 * k, 5 * k); c.fillStyle = '#8a3b2b'; poly(c, [[vx - 24 * k, vy - 46 * k], [vx, vy - 60 * k], [vx + 24 * k, vy - 46 * k]]);
      c.fillStyle = '#ffd23f'; const sp = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? 2.5 * k : 6 * k, a = i * Math.PI / 5 + t; sp.push([vx + Math.cos(a) * r, vy - 66 * k + Math.sin(a) * r]); } poly(c, sp);
      // «коза»: a caroller in the goat costume, hopping, with a bell
      const gx = w * 0.9, gy = h * 0.82 - Math.abs(Math.sin(t * 5)) * 6 * k; c.fillStyle = '#6b4422'; rr(c, gx - 12 * k, gy - 34 * k, 24 * k, 30 * k, 8 * k); c.fillStyle = '#f4efe2'; ell(c, gx, gy - 42 * k, 10 * k, 9 * k);
      c.strokeStyle = '#3a2a1a'; c.lineWidth = 2.5 * k; c.beginPath(); c.moveTo(gx - 5 * k, gy - 49 * k); c.quadraticCurveTo(gx - 12 * k, gy - 60 * k, gx - 4 * k, gy - 62 * k); c.moveTo(gx + 5 * k, gy - 49 * k); c.quadraticCurveTo(gx + 12 * k, gy - 60 * k, gx + 4 * k, gy - 62 * k); c.stroke();
      c.fillStyle = '#2a2a2a'; circ(c, gx - 3 * k, gy - 43 * k, 1.5 * k); circ(c, gx + 3 * k, gy - 43 * k, 1.5 * k); c.fillStyle = '#d43a3a'; for (let i = 0; i < 4; i++) c.fillRect(gx - 12 * k + i * 6 * k, gy - 20 * k, 4 * k, 3 * k); c.fillStyle = '#e8c35a'; circ(c, gx, gy - 32 * k, 3 * k);
      // straw «павуки» hanging from the bunting
      for (const x of [0.3, 0.7]) { const X = x * w, Y = h * 0.27 + Math.sin(t * 1.5 + x * 9) * 2 * k; c.strokeStyle = '#e8c35a'; c.lineWidth = 1.5 * k; c.beginPath(); c.moveTo(X, h * 0.23); c.lineTo(X, Y - 12 * k); c.stroke(); c.beginPath(); c.moveTo(X - 12 * k, Y); c.lineTo(X, Y - 12 * k); c.lineTo(X + 12 * k, Y); c.lineTo(X, Y + 12 * k); c.closePath(); c.moveTo(X - 12 * k, Y); c.lineTo(X + 12 * k, Y); c.moveTo(X, Y - 12 * k); c.lineTo(X, Y + 12 * k); c.stroke(); c.fillStyle = '#d43a3a'; circ(c, X, Y + 14 * k, 2 * k); }
    }
  } else if (F.id === 'velykden') {
    if (layer === 'back') {
      // cherry trees in blossom either side
      for (const x of [0.06, 0.94]) { const X = x * w, Y = h * 0.6; c.fillStyle = '#6b4422'; c.fillRect(X - 3 * k, Y - h * 0.13, 6 * k, h * 0.13); for (let i = 0; i < 26; i++) { const a = i * 2.4, r = (i % 5) * 4 * k + 6 * k; c.fillStyle = i % 3 ? '#ffe3ee' : '#ffffff'; circ(c, X + Math.cos(a) * r * 1.3, Y - h * 0.17 + Math.sin(a) * r, 4.5 * k); } }
      // the church bell swinging in its little tower
      const bx = w * 0.5, by = h * 0.36, sw = Math.sin(t * 3) * 0.5; c.fillStyle = '#f4efe2'; c.fillRect(bx - 12 * k, by - 4 * k, 24 * k, 26 * k); c.fillStyle = '#3f8a3a'; ell(c, bx, by - 8 * k, 10 * k, 10 * k);
      c.save(); c.translate(bx, by + 2 * k); c.rotate(sw); c.fillStyle = '#e8c35a'; poly(c, [[-6 * k, 0], [6 * k, 0], [8 * k, 12 * k], [-8 * k, 12 * k]]); c.restore();
      if (Math.abs(Math.sin(t * 3)) > 0.95) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.5 * k; for (const s of [-1, 1]) { c.beginPath(); c.arc(bx + s * 18 * k, by + 8 * k, 6 * k, -0.7, 0.7); c.stroke(); } }
    } else {
      // a vase of pussy willow
      const vx = w * 0.12, vy = h * 0.82; c.fillStyle = '#3d7cc2'; poly(c, [[vx - 9 * k, vy], [vx + 9 * k, vy], [vx + 11 * k, vy - 22 * k], [vx - 11 * k, vy - 22 * k]]); c.fillStyle = '#ffd23f'; c.fillRect(vx - 10 * k, vy - 14 * k, 20 * k, 2 * k);
      c.strokeStyle = '#6b4422'; c.lineWidth = 1.6 * k; for (const a of [-0.35, -0.15, 0.05, 0.25, 0.4]) { const ex = vx + Math.sin(a) * 40 * k, ey = vy - 22 * k - Math.cos(a) * 48 * k; c.beginPath(); c.moveTo(vx, vy - 22 * k); c.lineTo(ex, ey); c.stroke(); for (let i = 1; i < 6; i++) { c.fillStyle = '#e6e3dc'; ell(c, vx + (ex - vx) * i / 6 + 2 * k, vy - 22 * k + (ey - vy + 22 * k) * i / 6, 2.4 * k, 3.4 * k); } }
      // a little tree hung with pysanky
      const tx = w * 0.88, ty = h * 0.84; c.strokeStyle = '#6b4422'; c.lineWidth = 3 * k; c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx, ty - 50 * k); c.moveTo(tx, ty - 30 * k); c.lineTo(tx - 18 * k, ty - 46 * k); c.moveTo(tx, ty - 36 * k); c.lineTo(tx + 18 * k, ty - 52 * k); c.stroke();
      for (const [dx, dy, col] of [[-18, -44, '#d43a3a'], [18, -50, '#3d7cc2'], [-8, -52, '#ffd23f'], [9, -36, '#2f9e5b'], [-14, -32, '#9b6bd6']]) { const sw2 = Math.sin(t * 2 + dx) * 2 * k; c.fillStyle = col; ell(c, tx + dx * k + sw2, ty + dy * k + 8 * k, 4.5 * k, 6 * k); c.fillStyle = '#ffffff'; c.fillRect(tx + dx * k + sw2 - 4 * k, ty + dy * k + 7 * k, 8 * k, 1.5 * k); }
      // the first snowdrops along the front
      for (let i = 0; i < 9; i++) { const x = w * (0.3 + i * 0.05), y = h * 0.985; c.strokeStyle = '#3f8a3a'; c.lineWidth = 1.5 * k; c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + 2 * k, y - 10 * k, x + 5 * k, y - 12 * k); c.stroke(); c.fillStyle = '#ffffff'; ell(c, x + 5 * k, y - 9 * k, 2.5 * k, 4 * k); }
    }
  }
}

// Live subtitles drawn on the screen itself (the festival and bedtime have no card to put them in): what's
// being said right now, in English, on a dark strip near the bottom.
function canvasSub(c, w, h) {
  if (!subNow || !subsOnNow()) return;
  const a = subNow.a, playing = a && !a.paused && !a.ended, age = (performance.now() - subNow.t0) / 1000;
  if (!playing && age > 3.2) return;
  const u = roomU(), txt = subNow.both ? subNow.uk : (subNow.en || subNow.uk), fs2 = Math.round(u * 0.042);
  c.save(); c.font = `700 ${fs2}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  const words = txt.split(' '), lines = []; let cur = '';
  for (const wd of words) { const tryL = cur ? cur + ' ' + wd : wd; if (c.measureText(tryL).width > w * 0.84 && cur) { lines.push(cur); cur = wd; } else cur = tryL; }
  if (cur) lines.push(cur);
  const lh = fs2 * 1.3, bh = lines.length * lh + fs2 * 0.8, by = h * 0.965 - bh, bw = Math.min(w * 0.92, Math.max(...lines.map(l => c.measureText(l).width)) + fs2 * 1.6);
  c.globalAlpha = Math.min(1, playing ? 1 : (3.2 - age) * 2); c.fillStyle = 'rgba(47,42,38,.88)'; rr(c, (w - bw) / 2, by, bw, bh, fs2 * 0.6);
  c.fillStyle = '#ffffff'; lines.forEach((l, i) => c.fillText(l, w / 2, by + fs2 * 0.4 + lh * (i + 0.5)));
  c.restore();
}
function drawFest(t) {
  const f = fest, c = ctx, w = cv.width, h = cv.height, u = roomU(), F = f ? f.F : curFest();
  if (!f) { c.fillStyle = '#8fd169'; c.fillRect(0, 0, w, h); return; }
  const dt = Math.min(0.05, Math.max(0, t - f.lastT)); f.lastT = t;
  f.boost *= Math.exp(-dt * 2); f.ang += dt * (0.35 + f.boost);
  // --- sky and ground
  const SKY = { night: ['#141c45', '#3b3570'], snow: ['#1b2a4a', '#4a6a96'], gold: ['#ffc56b', '#ffe9b8'], spring: ['#8fd3f4', '#eaf8ff'] }[F.sky];
  let g = c.createLinearGradient(0, 0, 0, h * 0.55); g.addColorStop(0, SKY[0]); g.addColorStop(1, SKY[1]); c.fillStyle = g; c.fillRect(0, 0, w, h);
  const dark = F.sky === 'night' || F.sky === 'snow';
  if (dark) { for (const [dx, dy, dr] of DOTS) { c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 1.3 + dx * 20)); c.fillStyle = '#fff'; circ(c, dx * w, dy * h * 0.45, 0.8 + dr * 1.6); } c.globalAlpha = 1; c.fillStyle = '#fff6d8'; circ(c, w * 0.82, h * 0.13, u * 0.05); }
  else { c.fillStyle = 'rgba(255,255,255,.85)'; ell(c, w * 0.25 + Math.sin(t * 0.1) * 20, h * 0.14, u * 0.12, u * 0.035); ell(c, w * 0.72, h * 0.2, u * 0.09, u * 0.028); }
  {   // far hills, paler with distance, and a slow high cloud layer behind the nearer clouds
    const HZ = { night: ['#22305e', '#2c3c70', '#36497e'], snow: ['#3a5584', '#4d6b98', '#6584ad'], gold: ['#e8b26a', '#d9a05a', '#c98f4c'], spring: ['#b8dcef', '#9fd0b8', '#86c49a'] }[F.sky] || ['#b8dcef', '#9fd0b8', '#86c49a'];
    if (!dark) { c.fillStyle = 'rgba(255,255,255,.45)'; for (let i = 0; i < 3; i++) { const x = ((i * 0.41 + t * 0.004) % 1.3 - 0.15) * w; ell(c, x, h * (0.08 + i * 0.03), u * 0.22, u * 0.025); } }
    HZ.forEach((col, i) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, h * 0.5); for (let j = 0; j <= 16; j++) { const x = j / 16 * w; c.lineTo(x, h * (0.43 + i * 0.022) - Math.sin(j / 16 * Math.PI * (2 + i) + i * 1.7) * h * (0.025 - i * 0.005)); } c.lineTo(w, h * 0.5); c.fill(); });
  }
  for (const [px, sc] of [[0.14, 0.33], [0.88, 0.3], [0.5, 0.24]]) drawIcon(c, px === 0.5 ? W.tserkva.ic : W.khata.ic, w * px, h * 0.5, u * sc);
  const groundCol = F.sky === 'snow' ? ['#e8f0fb', '#cfdcee'] : dark ? ['#2f5a3a', '#244a30'] : ['#9bd673', '#7fc25a'];
  g = c.createLinearGradient(0, h * 0.47, 0, h); g.addColorStop(0, groundCol[0]); g.addColorStop(1, groundCol[1]); c.fillStyle = g; c.fillRect(0, h * 0.47, w, h * 0.53);
  festScenery(c, w, h, u, t, F, 'back', 0);
  // bunting
  c.strokeStyle = '#6b4422'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, h * 0.21); c.quadraticCurveTo(w / 2, h * 0.28, w, h * 0.21); c.stroke();
  const FL = ['#d43a3a', '#ffd23f', '#3d7cc2', '#fffdf5'];
  const pulse = f.pulse ? Math.max(0, 1 - (t - f.pulse) / 0.3) : 0;   // everything gives a little hop on each beat of the dance
  for (let i = 0; i < 12; i++) { const q = (i + 0.5) / 12, x = q * w, y = h * 0.21 + (1 - (2 * q - 1) ** 2) * h * 0.035 + Math.sin(t * 2 + i) * 1.5 - pulse * 2; c.fillStyle = FL[i % 4]; poly(c, [[x - w * 0.03, y], [x + w * 0.03, y], [x, y + h * 0.045]]); }
  if (dark) for (let i = 0; i < 13; i++) { const q = i / 12, x = q * w, y = h * 0.21 + (1 - (2 * q - 1) ** 2) * h * 0.035, on = 0.6 + 0.4 * Math.sin(t * 3 + i * 1.7) + pulse * 0.4; const gl = c.createRadialGradient(x, y, 0, x, y, u * 0.04); gl.addColorStop(0, `rgba(255,214,120,${0.5 * on})`); gl.addColorStop(1, 'rgba(255,214,120,0)'); c.fillStyle = gl; c.fillRect(x - u * 0.04, y - u * 0.04, u * 0.08, u * 0.08); c.fillStyle = `rgba(255,236,170,${Math.min(1, on)})`; circ(c, x, y, u * 0.008); }
  // a glow on the ground under the circle, brightest on the beat
  { const gx = w / 2, gy = h * 0.66; const gg = c.createRadialGradient(gx, gy, 0, gx, gy, w * 0.45); gg.addColorStop(0, `rgba(255,220,140,${0.12 + pulse * 0.25})`); gg.addColorStop(1, 'rgba(255,220,140,0)'); c.fillStyle = gg; c.save(); c.translate(gx, gy); c.scale(1, 0.3); c.translate(-gx, -gy); c.fillRect(0, gy - w * 0.45, w, w * 0.9); c.restore(); }
  // --- the round dance around the festival's centrepiece
  const cx = w / 2, cy = h * 0.63, rx = w * 0.37, ry = h * 0.075;
  const looks = ['olia', 'taras', 'oksana', 'andriiko', 'bohdan'].map(id => NPC[id].look); looks.splice(3, 0, ME);
  const jumping = F.finale === 'stryby' && f.jumpT;
  const dancers = looks.map((L, i) => { const a = f.ang + i * Math.PI * 2 / looks.length; return { L, i, a, x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, me: L === ME }; }).filter(d => !(jumping && d.me));
  const hop = f.stepT ? Math.max(0, 1 - (t - f.stepT) / 0.35) : 0;   // your tap: everyone hops
  for (const d of dancers) { d.sc = (u / 390) * 1.45 * (0.86 + 0.16 * Math.sin(d.a)); d.bob = (Math.abs(Math.sin(t * 6 + d.i)) * 4 + pulse * 5 + Math.sin(hop * Math.PI) * 12) * d.sc; }
  const WREATH = F.id === 'kupala' || F.id === 'velykden' || F.id === 'obzhynky';
  const drawD = d => { const sc = d.sc; person(c, d.x, d.y - d.bob, f.phase === 'farewell' ? Object.assign({}, d.L, { armR: -2.5 + Math.sin(t * 9 + d.i) * 0.45 }) : d.L, t, f.phase !== 'farewell', sc);
    if (WREATH) { const hy = d.y - d.bob - sc * 76; for (let q = 0; q < 9; q++) { const a = Math.PI + q / 8 * Math.PI; c.fillStyle = ['#d43a3a', '#ffd23f', '#3d7cc2', '#ff7aa8'][q % 4]; circ(c, d.x + Math.cos(a) * sc * 13, hy + Math.sin(a) * sc * 5, sc * 3.2); } c.fillStyle = '#3f8a3a'; for (const s of [-1, 1]) ell(c, d.x + s * sc * 15, hy + sc * 2, sc * 4, sc * 2); }
    if (d.me) drawIcon(c, '❤️', d.x, d.y - sc * 88 - d.bob, u * 0.045); };
  // joined hands: an arm from each dancer to the next one round the circle
  const ring = dancers.slice().sort((a, b) => a.i - b.i), arms = [];
  for (let i = 0; i < ring.length; i++) { const A = ring[i], B = ring[(i + 1) % ring.length]; if (Math.abs(A.i - B.i) > 1 && !(A.i === looks.length - 1 && B.i === 0)) continue; arms.push({ A, B, back: Math.sin(A.a) + Math.sin(B.a) < 0 }); }
  const drawArm = ({ A, B }) => { const ka = A.sc * (A.L.small ? 0.78 : 1), kb = B.sc * (B.L.small ? 0.78 : 1), ay = A.y - A.bob - ka * 40, by2 = B.y - B.bob - kb * 40, dir = B.x > A.x ? 1 : -1, x1 = A.x + dir * ka * 12, x2 = B.x - dir * kb * 12, wa = A.L.small && !B.L.small ? 0.3 : B.L.small && !A.L.small ? 0.7 : 0.5, hx = x1 + (x2 - x1) * wa, hy2 = ay + (by2 - ay) * wa + u * 0.012 + Math.sin(t * 6) * 2;   // the hands meet nearer the child, so the grown-up does the reaching
    c.strokeStyle = '#f3cfb0'; c.lineCap = 'round'; c.lineWidth = Math.max(2, ka * 5.2); c.beginPath(); c.moveTo(x1, ay); c.quadraticCurveTo((x1 + hx) / 2, (ay + hy2) / 2 + u * 0.006, hx, hy2); c.stroke(); c.lineWidth = Math.max(2, kb * 5.2); c.beginPath(); c.moveTo(x2, by2); c.quadraticCurveTo((x2 + hx) / 2, (by2 + hy2) / 2 + u * 0.006, hx, hy2); c.stroke();
    c.fillStyle = '#f3cfb0'; circ(c, hx, hy2 - u * 0.005, Math.max(2, (ka + kb) * 2.4)); };
  dancers.filter(d => Math.sin(d.a) < 0).sort((a, b) => a.y - b.y).forEach(drawD);
  const waving = f.phase === 'farewell';
  if (!waving) arms.filter(m => m.back).forEach(drawArm);
  const S0 = u * 0.3;
  if (F.center === 'fire') bonfire(c, cx, cy, S0 * 0.75, t);
  else if (F.center === 'star') { carolStar(c, cx + S0 * 0.55, cy, S0 * 0.8, t); c.fillStyle = '#fffdf5'; rr(c, cx - S0 * 0.7, cy - S0 * 0.28, S0 * 1.1, S0 * 0.28, 6); drawIcon(c, W.kutia.ic, cx - S0 * 0.38, cy - S0 * 0.24, S0 * 0.5); drawIcon(c, W.didukh.ic, cx - S0 * 0.95, cy, S0 * 0.75); drawIcon(c, W.svichka.ic, cx, cy - S0 * 0.24, S0 * 0.32); }
  else if (F.center === 'harvest') { c.fillStyle = '#fffdf5'; rr(c, cx - S0 * 0.75, cy - S0 * 0.3, S0 * 1.5, S0 * 0.3, 6); c.fillStyle = '#d43a3a'; c.fillRect(cx - S0 * 0.75, cy - S0 * 0.12, S0 * 1.5, S0 * 0.05); drawIcon(c, W.korovai.ic, cx + S0 * 0.2, cy - S0 * 0.26, S0 * 0.6); drawIcon(c, W.didukh.ic, cx - S0 * 0.45, cy - S0 * 0.2, S0 * 0.85); }
  else { c.fillStyle = '#c99463'; ell(c, cx, cy - S0 * 0.08, S0 * 0.6, S0 * 0.18); drawIcon(c, W.paska.ic, cx, cy - S0 * 0.12, S0 * 0.62); for (let i = 0; i < 5; i++) drawIcon(c, W.pysanka.ic, cx - S0 * 0.5 + i * S0 * 0.25, cy + S0 * 0.02, S0 * 0.22); }
  dancers.filter(d => Math.sin(d.a) >= 0).sort((a, b) => a.y - b.y).forEach(drawD);
  if (!waving) arms.filter(m => !m.back).forEach(drawArm);
  // your cats watch from the front
  houseCats().slice(0, 3).forEach((ct, i) => cat(c, [w * 0.12, w * 0.88, w * 0.27][i], h * [0.95, 0.95, 0.99][i], u * 0.15, sitPal(ct.v), t, i, i === 1 ? -1 : 1, null));
  festScenery(c, w, h, u, t, F, 'front', 0);
  // falling snow, drifting petals, or wheat in the air
  if (F.sky === 'snow') drawSnow(c, w, h, t, w / 390, 0.9);
  if (F.sky === 'spring') { c.fillStyle = 'rgba(255,190,210,.85)'; for (let i = 0; i < 24; i++) ell(c, ((i * 97.7 + t * 30) % w), (i * 191.3 + t * 40) % h, 4, 2.5); }
  if (F.sky === 'gold') { c.fillStyle = 'rgba(255,240,170,.85)'; for (let i = 0; i < 24; i++) ell(c, ((i * 97.7 + t * 25) % w), (i * 191.3 + t * 18) % h, 3.5, 1.6); }
  // --- the dance: tap when a ring closes onto the drum
  if (f.phase === 'dance') {
    const bx = cx, by = h * 0.86, R = u * 0.085;
    const ft = festClock();
    // the track the markers slide along, and the drum: it lights up when it's time to tap
    const near = f.beats.some(b => !b.hit && Math.abs(b.t - ft) < 0.18);
    c.fillStyle = 'rgba(255,255,255,.16)'; rr(c, w * 0.06, by - R * 0.32, w * 0.88, R * 0.64, R * 0.32);
    c.fillStyle = near ? 'rgba(255,214,90,.55)' : 'rgba(255,255,255,.25)'; circ(c, bx, by, R); c.strokeStyle = near ? '#ffd23f' : '#fff8ea'; c.lineWidth = near ? 6 : 4; c.beginPath(); c.arc(bx, by, R, 0, 7); c.stroke();
    drawIcon(c, '🥁', bx, by + R * 0.4, R * 1.1);
    // three, two, one: the count-in on the first three beats of the song
    for (let i = 0; i < 3; i++) { const tb = (F.first || 0) + i * (F.beat || 0.8); if (ft >= tb && ft < tb + (F.beat || 0.8)) { const q = (ft - tb) / (F.beat || 0.8); c.save(); c.globalAlpha = 1 - q * 0.7; c.font = cozyFont(Math.round(u * (0.12 - q * 0.03))); c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = u * 0.02; c.strokeStyle = INK; c.strokeText(String(3 - i), bx, by - R * 2.2); c.fillStyle = '#fff8ea'; c.fillText(String(3 - i), bx, by - R * 2.2); c.restore(); } }
    if (near && stage() < 3 && f.hits < 4) { c.font = `800 ${Math.round(u * 0.04)}px system-ui`; c.textAlign = 'center'; c.fillStyle = '#fff8ea'; c.strokeStyle = INK; c.lineWidth = 4; c.strokeText('Tap!', bx, by + R * 1.7); c.fillText('Tap!', bx, by + R * 1.7); }
    for (const b of f.beats) {
      if (!b.sounded && ft >= b.t) { b.sounded = 1; f.pulse = t; if (!f.tune) blip(196, 0.05); }   // the tune has its own drum
      const ahead = b.t - ft; if (!b.hit && !b.missed && ahead < -0.3) { b.missed = 1; f.combo = 0; f.missT = t; }
      if (b.hit || ahead < -0.3 || ahead > 2.4) continue;
      // two markers (embroidered diamonds) slide in from each side and meet at the drum on the beat
      const q = Math.max(0, ahead) / 2.4, off = q * w * 0.42, al = Math.min(1, (1 - q) * 3) * (ahead < 0 ? 1 + ahead * 3 : 1), sz = R * 0.42 * (1 + (ahead < 0.25 && ahead > -0.25 ? 0.25 : 0));
      for (const s of [-1, 1]) { c.save(); c.globalAlpha = Math.max(0, al); c.translate(bx + s * (R * 1.05 + off), by); c.rotate(Math.PI / 4); c.fillStyle = '#d43a3a'; c.fillRect(-sz / 2, -sz / 2, sz, sz); c.fillStyle = '#2b2b2b'; c.fillRect(-sz / 4, -sz / 4, sz / 2, sz / 2); c.strokeStyle = '#fff8ea'; c.lineWidth = 2; c.strokeRect(-sz / 2, -sz / 2, sz, sz); c.restore(); }
      if (ahead <= 1.2) { c.globalAlpha = Math.max(0, 1 - ahead / 1.2) * 0.8; c.strokeStyle = '#ffd23f'; c.lineWidth = 4; c.beginPath(); c.arc(bx, by, R * (1 + Math.max(0, ahead) * 1.2), 0, 7); c.stroke(); c.globalAlpha = 1; };
    }
    // sparks off the drum on a good beat, and how many in a row
    f.sparks = (f.sparks || []).filter(s => t - s.t0 < 0.7); for (const s of f.sparks) { const q = (t - s.t0) / 0.7; c.fillStyle = `rgba(255,${200 + (s.a * 40 % 55)},90,${1 - q})`; circ(c, bx + Math.cos(s.a) * R * (1 + q * 2.2), by + Math.sin(s.a) * R * (1 + q * 2.2) * 0.8 - q * R * 0.6, (3 - q * 2) * u / 390 * 2); }
    if (f.hitT && t - f.hitT < 0.25) { const q = (t - f.hitT) / 0.25; c.strokeStyle = `rgba(255,255,255,${1 - q})`; c.lineWidth = 6; c.beginPath(); c.arc(bx, by, R * (1 + q * 0.6), 0, 7); c.stroke(); }
    if (f.missT && t - f.missT < 0.3) { c.strokeStyle = `rgba(120,120,140,${0.8 - (t - f.missT) * 2.6})`; c.lineWidth = 4; c.beginPath(); c.arc(bx, by, R * 1.05, 0, 7); c.stroke(); }
    if ((f.combo || 0) >= 3) { c.save(); const pop = f.hitT ? Math.max(0, 1 - (t - f.hitT) / 0.2) : 0; c.translate(bx + R * 2.1, by - R * 0.2); c.scale(1 + pop * 0.3, 1 + pop * 0.3); c.font = cozyFont(Math.round(u * 0.05)); c.textAlign = 'center'; c.lineWidth = u * 0.012; c.strokeStyle = INK; c.strokeText('×' + f.combo, 0, 0); c.fillStyle = '#ffd23f'; c.fillText('×' + f.combo, 0, 0); c.restore(); }
    if (f.pop && t - f.pop.t < 0.7) bedText(c, f.pop.txt, '', by - R * 1.9 - (t - f.pop.t) * 30, 1 - (t - f.pop.t) / 0.7);
    const a0 = t - f.danceT;
    if (a0 < 3.6) bedText(c, W.tantsiui.uk[0].toUpperCase() + W.tantsiui.uk.slice(1) + '!', stage() < 3 ? 'Tap the drum when the patterns meet it' : '', h * 0.3, Math.min(1, a0 * 2, (3.6 - a0) * 2));
    if (ft > f.beats[f.beats.length - 1].t + 0.7) { f.phase = F.finale ? 'finale' : 'end'; f.endT = t; if (F.finale) { learn(F.finale); say('w_' + F.finale); } }
  }
  // --- finales: jump the Kupala fire, or sing the carol
  if (f.phase === 'finale') {
    const word = W[F.finale], en = F.finale === 'stryby' ? 'Jump over the fire! Tap!' : 'Sing a carol! Tap!';
    if (!f.jumpT) bedText(c, word.uk[0].toUpperCase() + word.uk.slice(1) + '!', stage() < 3 ? en : '', h * 0.33, Math.min(1, (t - f.endT) * 2));
    else {
      const q = Math.min(1, (t - f.jumpT) / 1.1);
      if (F.finale === 'stryby') { const sc = (u / 390) * 1.5, jx = cx, jy = cy + ry * 1.8 - q * ry * 3.4 - Math.sin(q * Math.PI) * u * 0.32; person(c, jx, jy, ME, t, true, sc); }
      else bedText(c, PH.koliadka.uk, stage() < 3 ? PH.koliadka.en : '', h * 0.33, Math.min(1, (t - f.jumpT) * 2));
      if (t - f.jumpT > (F.finale === 'spivai' ? 4.2 : 1.6)) { f.phase = 'end'; f.endT = t; }
    }
  }
  if (f.phase === 'end') {
    bedText(c, PH[F.greet].uk, stage() < 3 ? PH[F.greet].en : '', h * 0.33, Math.min(1, (t - f.endT) * 2));
    if (t - f.endT > 1.6 && !f.done.card) {
      f.done.card = 1; say('p_zi_sviatom');
      const owned = (S.home[F.reward] || 0) + (S.decor[F.reward] ? 1 : 0) > 0, beats = f.beats.length;
      openSheet(`<div class="card"><div class="tag">🎉 ${W[F.id].uk}</div>
        <div class="word" style="font-size:30px">${PH.zi_sviatom.uk}</div>${stage() < 3 ? `<div class="en">${PH.zi_sviatom.en}</div>` : ''}
        <div class="hint">💃 ${W.horovod.uk}: ${f.hits}/${beats}${stage() < 3 ? ' beats danced' : ''}${(f.best || 0) >= 3 ? ` · 🔥 ×${f.best}${stage() < 3 ? ' in a row' : ''}` : ''}</div>
        <img class="big" src="${iconURL(owned ? 'koshyk' : F.reward)}" alt="">
        <div class="hint">❤️ +5${owned ? ' · 💰 +15 ₴' : ` · ${W[F.reward].uk}${stage() < 3 ? ' for your cottage' : ''}`}</div>
        <div class="row">${btn('festDone', '', lab('backvillage'), 'blue')}</div></div>`);
    } else if (f.done.card && !sheetOpen() && f.phase === 'end') festDone();   // the reward card swiped away: still take it home
  }
  if (f.phase === 'greet' && f.greetAt && !sheetOpen() && nowT - f.greetAt > 0.6) f.greetCard();   // never left with no way to answer
  if (f.phase === 'farewell') {
    const q = t - f.fwT, k2 = u / 390;
    // the season's send-off: confetti and sparkles (Kupala sparks, Christmas snow and stars, Easter petals, harvest gold)
    const COLS = { kupala: ['#ffd23f', '#ff7a1f', '#ff3d3d', '#fff2b0'], obzhynky: ['#e8c35a', '#d43a3a', '#ffe07a', '#8a5a2b'], sviatvechir: ['#ffffff', '#ffd23f', '#d43a3a', '#bfe0ff'], velykden: ['#ffc2d6', '#ffffff', '#ffd23f', '#9b6bd6'] }[F.id] || ['#ffd23f', '#d43a3a', '#3d7cc2'];
    if (Math.random() < 0.5 && f.burst.length < 14) { const bx = w * (0.15 + Math.random() * 0.7), by = h * (0.12 + Math.random() * 0.3); f.burst.push({ x: bx, y: by, t0: t, col: COLS[f.burst.length % COLS.length] }); }
    f.burst = f.burst.filter(b => t - b.t0 < 1.4);
    for (const b of f.burst) { const p = (t - b.t0) / 1.4; for (let i = 0; i < 14; i++) { const an = i / 14 * Math.PI * 2, r = u * 0.12 * Math.sqrt(p); c.globalAlpha = Math.max(0, 1 - p); c.fillStyle = b.col; circ(c, b.x + Math.cos(an) * r, b.y + Math.sin(an) * r + p * p * u * 0.05, (2.4 - p * 1.4) * k2 * 1.6); } } c.globalAlpha = 1;
    for (let i = 0; i < 40; i++) { const x = ((i * 97.3 + Math.sin(t * 0.7 + i) * 30) % w + w) % w, y = (i * 63.7 + q * (60 + (i % 5) * 20) * k2 * 1.5) % h; c.save(); c.translate(x, y); c.rotate(t * 2 + i); c.fillStyle = COLS[i % COLS.length]; c.fillRect(-3 * k2 * 1.5, -1.5 * k2 * 1.5, 6 * k2 * 1.5, 3 * k2 * 1.5); c.restore(); }
    // the greeting and the goodbye
    const ga = Math.min(1, q * 1.5), gid = FAREWELL[F.id] || 'zi_sviatom';
    bedText(c, '🎉 ' + PH[gid].uk, PH[gid].en, h * 0.3, ga);
    bedText(c, PH.do_zustrichi.uk, PH.do_zustrichi.en, h * 0.44, Math.min(1, (q - 1.2) * 1.5));
    if (q > 2.2 && stage() < 3) { c.save(); c.globalAlpha = 0.55 + 0.3 * Math.sin(t * 3); c.font = `700 ${Math.round(u * 0.034)}px system-ui`; c.textAlign = 'center'; c.fillStyle = '#fff8ea'; c.fillText('Tap to go back to the village', w / 2, h * 0.56); c.restore(); }
    if (q > 7.5) festFinish();
  }
  festFlash(c, w, h, u, t);
  canvasSub(c, w, h);
}


// ------------------------------------------------------------------ the wardrobe
// In her cottage: a big picture of her in what she's wearing, turning slowly so you see the front, side and
// back; underneath, every outfit she owns. Tap one and she's wearing it, here and out in the village.
let ward = null;
function wardrobeSheet() {
  const st = stage(), own = Object.keys(OUTFITS).filter(id => S.wardrobe[id]), more = Object.keys(D.shop.clothes).filter(id => !S.wardrobe[id]).length;
  learn('shafa'); const first = !ward;
  ward = { t0: nowT, view: 0 };
  openSheet(`<div class="card"><h3><span><span class="uk">${W.shafa.uk}</span> ${st < 2 ? `<small>${W.shafa.en}</small>` : ''}</span>${btn('hear', 'p_shcho_vdiahnemo', '🔊', 'round blue')}</h3>
    <div style="display:flex;gap:10px;align-items:center">
      <canvas id="wardPad" style="width:42%;height:210px;border-radius:18px;background:radial-gradient(circle at 50% 60%, #fbecd3, #e3c395);flex:none" data-a="wardTurn"></canvas>
      <div style="text-align:left;flex:1"><div class="word" style="font-size:24px">${W[S.outfit].uk}</div>${st < 3 ? `<div class="en">${W[S.outfit].en}</div>` : ''}<div class="muted" style="padding:6px 0 0;font-size:14px">${PH.shcho_vdiahnemo.uk}${st < 3 ? ' · Tap the picture to turn her round' : ''}</div></div>
    </div>
    <div class="grid" style="margin-top:10px">${own.map(id => `<button class="it ${S.outfit === id ? 'sel' : ''}" data-a="wear" data-v="${id}"><img src="${iconURL(id)}" alt=""><div class="n">${W[id].uk}</div>${known(id) < 2 ? `<div class="e">${W[id].en}</div>` : ''}${S.outfit === id ? '<div class="e"><b>✓</b></div>' : ''}</button>`).join('')}</div>
    ${more ? `<div class="muted" style="font-size:14px">🧺 ${D.ui.clothes[0]}${st < 3 ? ': more clothes at the market' : ''} (${more})</div>` : ''}
    <div class="row">${btn('close', '', lab('close'))}</div></div>`);
  if (first) say('p_shcho_vdiahnemo');
  const pad = $('#wardPad'), dpr = Math.min(2, window.devicePixelRatio || 1); pad.width = Math.round(pad.clientWidth * dpr); pad.height = Math.round(pad.clientHeight * dpr);
  const me = ward; requestAnimationFrame(() => wardFrame(me));
}
function wardFrame(me) {
  const pad = $('#wardPad'); if (ward !== me || !pad || !sheetOpen()) return;
  const c = pad.getContext('2d'), w = pad.width, h = pad.height, t = nowT;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
  // a rug to stand on
  c.fillStyle = '#c0392b'; ell(c, w / 2, h * 0.9, w * 0.4, h * 0.06); c.fillStyle = '#ffd23f'; ell(c, w / 2, h * 0.9, w * 0.3, h * 0.04); c.fillStyle = '#c0392b'; ell(c, w / 2, h * 0.9, w * 0.2, h * 0.025);
  // she turns every two and a half seconds: front, her side, her back, her other side (or you tap to turn her)
  const auto = Math.floor((t - me.t0) / 2.5) % 4, v = (me.view + auto) % 4, sc = h / 120, pop = me.pop ? Math.max(0, 1 - (t - me.pop) / 0.35) : 0;
  c.save(); c.translate(w / 2, h * 0.9); c.scale(1 + pop * 0.08, 1 - pop * 0.04);
  if (v === 1 || v === 3) { c.scale(v === 3 ? -1 : 1, 1); personSide(c, 0, 0, ME, t, 0, sc, 0); }
  else person(c, 0, 0, ME, t, 0, sc, 0, { back: v === 2 ? 1 : 0 });
  c.restore();
  if (pop) { c.globalAlpha = pop; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; drawIcon(c, '✨', w / 2 + Math.cos(a) * w * 0.38 * (1.2 - pop), h * 0.5 + Math.sin(a) * h * 0.35 * (1.2 - pop), 16 * sc / 2); } c.globalAlpha = 1; }
  requestAnimationFrame(() => wardFrame(me));
}

// ------------------------------------------------------------------ developer mode
// The 🛠️ on the title screen asks for a code (7272) once; after that this device remembers it (kd-dev), the
// 🛠️ stays in the top bar and the title's 🛠️ goes straight to the menu, until it's turned off in the menu.
// Other phones never see it unless the code is entered there. The menu that jumps straight to any game, any of
// Grandma's dishes, any season or festival, or the night. Dev runs of cooking, festivals and bedtime leave the
// real progress alone: no recipe moves on, no festival is marked done, no day passes.
let devCode = '', devMeal = false;
try { devOn = localStorage.getItem('kd-dev') === '1'; } catch (e) {}
if (devOn) $('#devBtn').style.display = '';
function devPinDraw(bad) {
  const el = $('#devpin');
  el.innerHTML = `<div class="box"><div style="font-weight:900;font-size:20px;color:#4a2c1a">🛠️ Developer</div><div style="color:#8a7566;font-size:14px;margin-top:2px">Enter the code</div>
    <div class="dots">${[0, 1, 2, 3].map(i => `<i class="${i < devCode.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="keys">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-a="devKey" data-v="${n}">${n}</button>`).join('')}<button data-a="devPinX" aria-label="Cancel">✕</button><button data-a="devKey" data-v="0">0</button><button data-a="devKey" data-v="back" aria-label="Delete">⌫</button></div></div>`;
  el.classList.add('on'); el.classList.remove('bad'); if (bad) { void el.offsetWidth; el.classList.add('bad'); }
}
function devMenu() {
  const sec = (title, items) => `<div style="font-weight:900;margin:12px 0 6px;color:#4a2c1a">${title}</div><div style="display:flex;flex-wrap:wrap;gap:6px">${items.map(([a, v, l]) => `<button class="b ghost" style="padding:8px 11px;font-size:14px;margin:0" data-a="${a}" data-v="${v}">${l}</button>`).join('')}</div>`;
  const ic = id => (W[id].ic[0] === '@' ? '' : W[id].ic + ' ');
  openSheet(`<div class="card" style="text-align:left"><h3><span>🛠️ Developer</span><small>${SEASON_IC[season()]} ${W[season()].uk}${seasonForce ? ' (set here)' : ''} · ${['day', 'evening', 'night'][S.clock.t >= 0.86 ? 2 : S.clock.t >= 0.78 ? 1 : 0]}</small></h3>
    ${sec('Mini games', [['devGame', 'bohdan', '🐝 Bees'], ['devGame', 'andriiko', '🐕 Fetch'], ['devGame', 'taras', '🎣 Fishing'], ['devGame', 'bohdan_w', '❄️ Winter hive'], ['devGame', 'andriiko_w', '⛄ Snowman'], ['devGame', 'andriiko_s', '❄️ Snowball fight'], ['devGame', 'taras_w', '🧊 Ice fishing'], ['devGame', 'chop', '🪓 Chopping wood']])}
    ${sec("Grandma's cooking", D.recipes.map(r => ['devCook', r.id, ic(r.dish) + W[r.dish].uk]))}
    ${sec('Seasons', [...SEASONS.map(x => ['devSeason', x, SEASON_IC[x] + ' ' + W[x].uk + (season() === x ? ' ✓' : '')]), ['devSeason', 'real', '↩︎ Real season']])}
    ${sec('Festivals', D.festivals.map(f => ['devFest', f.id, SEASON_IC[SEASONS[FEST_OF.indexOf(f.id)]] + ' ' + W[f.id].uk]))}
    ${sec('Weather', [['devWx', 'sun', '☀️ ' + W.sontse.uk], ['devWx', 'cloud', '☁️ ' + W.khmara.uk], ['devWx', 'rain', '🌧️ ' + W.doshch.uk], ['devWx', 'storm', '⛈️ ' + W.hroza.uk], ['devWx', 'fog', '🌫️ ' + W.tuman.uk], ['devWx', 'rainbow', '🌈 ' + W.veselka.uk], ['devWx', 'snow', '❄️ ' + W.snih.uk]].map(([a2, v, l]) => [a2, v, l + (S.wx === v ? ' ✓' : '')]))}
    ${sec('Day and night', [['devTime', 'morning', '🌅 Morning'], ['devTime', 'evening', '🌇 Evening'], ['devTime', 'night', '🌙 Night'], ['devTime', 'bed', '🛏️ Bedtime scene']])}
    <div class="row" style="margin-top:14px">${btn('close', '', lab('close'), 'ghost')}</div>
    <div style="text-align:center;margin-top:6px"><button class="subt" data-a="devOff">🔒 Turn off developer mode</button></div></div>`);
}
// Leave the cottage or Grandma's for the village first, when a dev jump needs the world.
function devToWorld() { if (mode === 'home' || mode === 'olia' || mode === 'mill' || mode === 'church') { oliaTip = 0; tour = null; mode = 'world'; $('#homebar').style.display = 'none'; } }

// ------------------------------------------------------------------ the title screen, drawn
const tcv = $('#tc'), tctx = tcv.getContext('2d');
let fontReady = false;
try { document.fonts.load('900 40px Cozy', 'Котяча Долина Kotiacha Dolyna Cat Valley Vickies Valley Долина Вікі').then(() => { fontReady = true; }).catch(() => { fontReady = true; }); } catch (e) { fontReady = true; }
function sizeTitle() { const dpr = Math.min(2, window.devicePixelRatio || 1); tcv.width = Math.round(innerWidth * dpr); tcv.height = Math.round(innerHeight * dpr); }
addEventListener('resize', sizeTitle); sizeTitle();
let seedT = 11; const rT = () => (seedT = (seedT * 16807) % 2147483647) / 2147483647;
const DOTS = Array.from({ length: 70 }, () => [rT(), rT(), rT()]);
const INK = '#4a2c1a';
const cozyFont = sz => `900 ${sz}px ${fontReady ? '"Cozy", system-ui, sans-serif' : 'system-ui, sans-serif'}`;

// The view through a cottage window (already clipped to the glass by the caller), matching outside: the sky by
// time of day and weather, hills by season, a tree by season, the garden (sunflowers in summer, flowers in
// spring, blowing leaves in autumn, drifts in winter), and the rain, snow, fog, lightning or rainbow of the day.
function windowView(c, x0, y0, ww, wh, t, nFlowers, seed, open) {   // open: a doorway, so no frost on glass
  const sea = season(), wx = S.wx, L = skyLight(S.clock.t), day = 1 - L.dark, wb = y0 + wh, cx = x0 + ww / 2;
  const SK = { sun: ['#8fd3f4', '#e8f7ff'], cloud: ['#a9bccd', '#e1e7ec'], rain: ['#75859a', '#b2bdc9'], storm: ['#4a566b', '#8a96a6'], fog: ['#cfd6db', '#eceff1'], snow: ['#bccad8', '#eef2f6'] }[wx] || ['#8fd3f4', '#e8f7ff'];
  let gr = c.createLinearGradient(0, y0, 0, wb); gr.addColorStop(0, SK[0]); gr.addColorStop(1, SK[1]); c.fillStyle = gr; c.fillRect(x0, y0, ww, wh);
  if (L.warm > 0 || L.dawn > 0) { const a = Math.max(L.warm, L.dawn) * 0.6; gr = c.createLinearGradient(0, y0, 0, wb); gr.addColorStop(0, `rgba(240,130,90,${a * 0.5})`); gr.addColorStop(1, `rgba(255,196,120,${a})`); c.fillStyle = gr; c.fillRect(x0, y0, ww, wh); }   // sunrise and sunset
  if (L.dark > 0) { c.fillStyle = `rgba(14,22,52,${L.dark * 0.88})`; c.fillRect(x0, y0, ww, wh);
    if (L.dark > 0.4 && (wx === 'sun' || wx === 'cloud')) { c.fillStyle = `rgba(255,250,220,${(L.dark - 0.4) * 1.6})`; for (let i = 0; i < 14; i++) circ(c, x0 + ((i * 0.618 + seed * 0.37) % 1) * ww, y0 + ((i * 0.377) % 1) * wh * 0.5, (i % 3 ? 0.8 : 1.3) * (0.7 + 0.3 * Math.sin(t * 2 + i))); }   // stars on a clear night
    if (L.dark > 0.4 && wx !== 'rain' && wx !== 'storm' && wx !== 'fog') { c.fillStyle = `rgba(255,248,210,${(L.dark - 0.4) * 1.6})`; circ(c, x0 + ww * 0.72, y0 + wh * 0.2, wh * 0.07); } }   // and the moon
  else if (wx === 'sun') { c.fillStyle = 'rgba(255,240,170,.35)'; circ(c, x0 + ww * 0.76, y0 + wh * 0.2, wh * 0.13); c.fillStyle = '#ffe680'; circ(c, x0 + ww * 0.76, y0 + wh * 0.2, wh * 0.075); }   // the sun
  if (rainbowA() > 0 && day > 0.5) { const ra = rainbowA(); c.lineWidth = wh * 0.022; ['#e2574c', '#f2a23a', '#f2d23a', '#6cc04a', '#3d7cc2', '#7a52b3'].forEach((col, i) => { c.strokeStyle = col; c.globalAlpha = 0.5 * ra; c.beginPath(); c.arc(cx, wb, wh * (0.78 - i * 0.022), Math.PI, 0); c.stroke(); }); c.globalAlpha = 1; }
  // clouds: one drifting on a fine day, more and greyer as the weather turns
  const nc = { sun: 1, cloud: 3, rain: 3, storm: 4, fog: 0, snow: 3 }[wx] ?? 1, ccol = wx === 'storm' ? '#5d6878' : wx === 'rain' ? '#8995a5' : wx === 'snow' ? '#e4e9ef' : wx === 'cloud' ? '#eef1f4' : '#ffffff';
  for (let i = 0; i < nc; i++) { const px = x0 + (((i * 0.41 + seed * 0.3 + t * 0.006 * (1 + i * 0.3)) % 1.4) - 0.2) * ww, py = y0 + wh * (0.14 + (i % 3) * 0.1); c.fillStyle = ccol; c.globalAlpha = 1 - L.dark * 0.7; ell(c, px, py, ww * 0.16, wh * 0.055); ell(c, px + ww * 0.07, py - wh * 0.03, ww * 0.09, wh * 0.05); ell(c, px - ww * 0.07, py - wh * 0.01, ww * 0.08, wh * 0.04); c.globalAlpha = 1; }
  // hills, coloured by the season
  const H = { lito: ['#a6dc7c', '#8fcf6a'], vesna: ['#b8e58e', '#97d36c'], osin: ['#d8bb6c', '#c39648'], zyma: ['#f4f8fc', '#d6e2ee'] }[sea];
  c.fillStyle = H[0]; ell(c, cx - ww * 0.2, wb, ww * 0.55, wh * 0.32); c.fillStyle = H[1]; ell(c, cx + ww * 0.3, wb, ww * 0.5, wh * 0.25);
  // a tree on the far hill: green in summer, blossom in spring, orange and gold in autumn, bare with snow in winter
  { const tx = x0 + ww * (0.82 - (seed % 2) * 0.66), ty = wb - wh * 0.22, r = wh * 0.09;
    c.fillStyle = '#6b4a2b'; c.fillRect(tx - r * 0.12, ty - r * 0.5, r * 0.24, r * 1.2);
    if (sea === 'zyma') { c.strokeStyle = '#6b4a2b'; c.lineWidth = Math.max(1, r * 0.1); c.beginPath(); for (const a of [-0.7, -0.25, 0.3, 0.75]) { c.moveTo(tx, ty - r * 0.2); c.lineTo(tx + Math.sin(a) * r, ty - r * 0.2 - Math.cos(a) * r); } c.stroke(); c.fillStyle = '#ffffff'; for (const a of [-0.7, -0.25, 0.3, 0.75]) ell(c, tx + Math.sin(a) * r * 0.85, ty - r * 0.2 - Math.cos(a) * r * 0.9, r * 0.18, r * 0.07); }
    else { const P = sea === 'osin' ? ['#c0461f', '#e07a24', '#f2b43a'] : sea === 'vesna' ? ['#64b85a', '#f6c6d8', '#ffffff'] : ['#2f8440', '#3f9a4a', '#55b35c']; c.fillStyle = P[0]; circ(c, tx, ty - r * 0.9, r * 0.75); c.fillStyle = P[1]; circ(c, tx - r * 0.35, ty - r, r * 0.45); c.fillStyle = P[2]; circ(c, tx + r * 0.3, ty - r * 1.15, r * 0.35); } }
  // the garden in front
  if (sea === 'lito') for (let i = 0; i < nFlowers; i++) sunflower(c, x0 + ww * (0.14 + i * 0.72 / Math.max(1, nFlowers - 1)), wb + 2, wh * 0.36, t, i + seed);
  else if (sea === 'vesna') for (let i = 0; i < 7; i++) { const fx = x0 + ww * (0.08 + i * 0.14), fy = wb - wh * (0.05 + (i % 2) * 0.05); c.strokeStyle = '#4f9e48'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(fx, wb); c.lineTo(fx, fy); c.stroke(); c.fillStyle = ['#e2574c', '#ffd23f', '#ff7aa8', '#ffffff'][i % 4]; circ(c, fx, fy, wh * 0.03); c.fillStyle = '#f2c230'; circ(c, fx, fy, wh * 0.011); }
  else if (sea === 'osin') { c.fillStyle = '#e07a24'; ell(c, x0 + ww * 0.3, wb - wh * 0.04, wh * 0.06, wh * 0.045); c.fillStyle = '#4f7a2a'; c.fillRect(x0 + ww * 0.3 - 1, wb - wh * 0.1, 2, wh * 0.03);   // a pumpkin in the garden
    for (let i = 0; i < 5; i++) { const q = ((t * 0.12 + i / 5) % 1); c.save(); c.translate(x0 + ww * ((i * 0.29 + q * 0.8) % 1), y0 + wh * (0.25 + q * 0.7) + Math.sin(t * 2 + i) * 4); c.rotate(t * 2 + i); c.fillStyle = ['#c0461f', '#e07a24', '#f2b43a'][i % 3]; ell(c, 0, 0, 3, 1.6); c.restore(); } }   // leaves blowing past
  else { c.fillStyle = '#ffffff'; ell(c, x0 + ww * 0.25, wb, ww * 0.35, wh * 0.08); ell(c, x0 + ww * 0.8, wb, ww * 0.3, wh * 0.06); }   // snowdrifts
  // the weather itself, at window scale
  c.save(); c.translate(x0, y0);
  if (wx === 'rain' || wx === 'storm') drawRain(c, ww, wh, t, wx === 'storm');
  if (wx === 'snow') drawSnow(c, ww, wh, t, 0.5, 0.5);
  c.restore();
  if (wx === 'fog') { c.fillStyle = 'rgba(236,240,242,.55)'; c.fillRect(x0, y0, ww, wh); c.fillStyle = 'rgba(255,255,255,.35)'; ell(c, x0 + ((t * 0.02) % 1) * ww, wb - wh * 0.2, ww * 0.5, wh * 0.08); }
  if (wx === 'storm') { const f = (t * 0.23 + seed * 0.5) % 1; if (f < 0.025) { c.fillStyle = `rgba(255,255,255,${0.7 * (1 - f / 0.025)})`; c.fillRect(x0, y0, ww, wh); } }   // a flash of lightning now and then
  if (L.dark > 0) { c.fillStyle = `rgba(14,22,52,${L.dark * 0.45})`; c.fillRect(x0, y0 + wh * 0.5, ww, wh * 0.5); }   // the garden in the dark too
  if (sea === 'zyma' && !open) { c.fillStyle = 'rgba(255,255,255,.7)'; for (const [fx, fy] of [[0, 1], [1, 1], [0, 0], [1, 0]]) ell(c, x0 + fx * ww, y0 + fy * wh, ww * 0.12, wh * 0.1); }   // frost in the corners of the glass
}
function sunflower(c, x, y, h, t, ph) {
  const sway = Math.sin(t * 1.3 + ph) * h * 0.05, hx = x + sway, hy = y - h, r = h * 0.17;
  c.strokeStyle = '#3f8f3f'; c.lineWidth = h * 0.045; c.lineCap = 'round';
  c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + sway * 0.2, y - h * 0.5, hx, hy); c.stroke();
  c.fillStyle = '#4fae55';
  for (const [k, dir] of [[0.45, -1], [0.62, 1]]) { c.save(); c.translate(x + sway * k * 0.5, y - h * k); c.rotate(dir * 0.7); ell(c, dir * h * 0.09, 0, h * 0.11, h * 0.045); c.restore(); }
  c.save(); c.translate(hx, hy); c.rotate(Math.sin(t * 1.3 + ph) * 0.08);
  c.lineWidth = Math.max(1, h * 0.012); c.strokeStyle = '#c98a1a';
  for (let i = 0; i < 16; i++) { c.save(); c.rotate(i * Math.PI / 8); c.fillStyle = i % 2 ? '#ffd23f' : '#ffc21a'; c.beginPath(); c.ellipse(0, -r * 1.25, r * 0.36, r * 0.62, 0, 0, 7); c.fill(); c.stroke(); c.restore(); }
  c.fillStyle = '#6b3d1e'; circ(c, 0, 0, r * 0.82); c.fillStyle = '#4a2a14';
  for (let i = 0; i < 9; i++) { const a = i * 2.4, d = r * 0.45 * ((i % 3) / 3 + 0.3); circ(c, Math.cos(a) * d, Math.sin(a) * d, r * 0.09); }
  c.restore();
}

// A sitting cat, outlined like a storybook drawing. (x, y) is the bottom centre; s is its height.
// Coloured after the three real cats: Cleo, Cece and Baby.
const CATS = [
  { body: '#fdf8f0', a: '#f6c27a', b: '#f0b264', eye: '#8fc28c', chub: 1, fluffy: true, bib: true, tail: '#f6c27a', earR: 'body', pb: [[-6, -40, 12, 'a'], [10, -22, 9, 'a']], ph: [[-9, -78, 9, 'a'], [9, -78, 9, 'a']] },
  { body: '#8f8277', a: '#f0a24c', b: '#4d4440', eye: '#e6b43a', chub: 1.28, fluffy: true, bib: true, tail: '#8f8277', earR: 'b', pb: [[-14, -36, 11, 'a'], [12, -44, 8, 'b'], [-18, -18, 7, 'b']], ph: [[-11, -70, 8, 'a'], [10, -76, 8, 'b']] },
  { body: '#a9a6ab', a: '#f3c4a2', b: '#8e8a90', eye: '#c9c26a', chub: 0.92, fluffy: false, bib: false, tail: '#a9a6ab', earR: 'body', pb: [[-8, -34, 8, 'a'], [10, -26, 6, 'a']], ph: [[0, -80, 5, 'a'], [-12, -66, 6, 'a'], [12, -66, 6, 'a']] },
];
function cat(c, x, y, s, C, t, ph, face, act) {
  const k = s / 100, ch = C.chub, groom = act === 'groom', swat = act === 'swat', play = act === 'play' || swat, bat = Math.max(0, Math.sin(t * 4));
  const wash = groom ? (Math.sin(t * 0.5 + ph) > 0.3 ? 'ear' : 'lick') : null, lick = Math.sin(t * 7 + ph);
  const tilt = swat ? -0.3 - bat * 0.06 : play ? -0.2 - bat * 0.05 : !groom ? 0 : wash === 'ear' ? -0.32 + Math.sin(t * 3) * 0.06 : 0.14 + lick * 0.04;
  c.save(); c.translate(x, y); c.scale(k * (face || 1), k);
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.fillStyle = 'rgba(40,30,20,.16)'; ell(c, 0, 0, 34 * ch, 6);
  // tail, swishing
  const sw = Math.sin(t * 2.1 + ph) * 10;
  c.beginPath(); c.moveTo(18 * ch, -10); c.bezierCurveTo(48 * ch, -6, 52 * ch + sw * 0.4, -40, 34 * ch + sw, -58);
  c.lineWidth = C.fluffy ? 15 : 10; c.strokeStyle = INK; c.stroke();
  c.lineWidth = C.fluffy ? 10 : 5.5; c.strokeStyle = C.tail; c.stroke();
  c.lineWidth = 3.2; c.strokeStyle = INK;
  // body with its patches
  c.fillStyle = C.body; c.beginPath(); c.ellipse(0, -28, 27 * ch, 29, 0, 0, 7); c.fill();
  c.save(); c.clip(); for (const [dx, dy, r, col] of C.pb) { c.fillStyle = C[col]; circ(c, dx * ch, dy, r); } if (C.stripes) sitStripes(c, C, ch); c.restore();
  c.beginPath(); c.ellipse(0, -28, 27 * ch, 29, 0, 0, 7); c.stroke();
  if (C.bib) { c.fillStyle = '#ffffff'; ell(c, 0, -30, 13 * ch, 18); if (C.fluffy) for (let i = -2; i <= 2; i++) circ(c, i * 5 * ch, -14 - Math.abs(i) * 2, 6); }
  c.fillStyle = '#ffffff'; for (const px of groom || play ? [11] : [-11, 11]) { c.beginPath(); c.ellipse(px * ch, -4, 8, 6, 0, 0, 7); c.fill(); c.stroke(); }
  c.save(); if (tilt) { c.translate(0, -50); c.rotate(tilt); c.translate(0, 50); }
  // ears
  for (const dir of [-1, 1]) {
    c.fillStyle = dir > 0 && C.earR !== 'body' ? C[C.earR] : C.body;
    c.beginPath(); c.moveTo(dir * 8, -84); c.lineTo(dir * 21, -103); c.lineTo(dir * 25, -76); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#f4a6b4'; c.beginPath(); c.moveTo(dir * 12, -84); c.lineTo(dir * 20, -97); c.lineTo(dir * 22, -80); c.closePath(); c.fill();
  }
  // head
  c.fillStyle = C.body; c.beginPath(); c.arc(0, -70, 24, 0, 7); c.fill();
  c.save(); c.clip(); for (const [dx, dy, r, col] of C.ph) { c.fillStyle = C[col]; circ(c, dx, dy, r); } if (C.bib) { c.fillStyle = '#ffffff'; ell(c, 0, -58, 11, 9); } c.restore();
  c.beginPath(); c.arc(0, -70, 24, 0, 7); c.stroke();
  if (C.fluffy) { c.fillStyle = C.bib ? '#ffffff' : C.body; for (const dir of [-1, 1]) { c.beginPath(); c.moveTo(dir * 19, -64); c.lineTo(dir * 30, -58); c.lineTo(dir * 20, -54); c.closePath(); c.fill(); c.stroke(); } }
  // face: eyes blink now and then
  const blink = groom || Math.sin(t * 0.8 + ph * 3) > 0.985;
  // Where it looks: up at the towel it's batting, down at the toy, otherwise at you.
  const [gx, gy] = swat ? [-2.4, -1.4] : play ? [-2.4, 1] : [0, 0];
  for (const ex of [-9, 9]) {
    if (blink) { c.lineWidth = 2.6; c.beginPath(); c.arc(ex, -72, 4.5, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); c.lineWidth = 3.2; }
    else { c.fillStyle = C.eye; ell(c, ex, -72, 5.2, 6.4); c.fillStyle = '#2a1a10'; ell(c, ex + gx, -71.5 + gy, 2.6, 5.4); c.fillStyle = '#fff'; circ(c, ex + gx + 1.6, -74.5 + gy, 1.6); }
  }
  c.fillStyle = '#f08aa0'; circ(c, -14, -63, 3.4); circ(c, 14, -63, 3.4);
  c.fillStyle = '#e8708a'; poly(c, [[-3, -65], [3, -65], [0, -62]]);
  c.lineWidth = 2; c.beginPath(); c.arc(-2.5, -61.5, 2.5, 0, Math.PI); c.moveTo(5, -61.5); c.arc(2.5, -61.5, 2.5, 0, Math.PI); c.stroke();
  c.strokeStyle = 'rgba(74,44,26,.6)'; c.lineWidth = 1.2;
  for (const dir of [-1, 1]) for (const dy of [-1.5, 2]) { c.beginPath(); c.moveTo(dir * 13, -63 + dy); c.lineTo(dir * 32, -65 + dy * 2.5); c.stroke(); }
  if (groom && wash === 'lick' && lick > 0.2) { c.fillStyle = '#e8708a'; ell(c, -1, -57.5, 3, 3.6); }   // little pink tongue
  c.restore();
  if (play) {   // swatting the toy on the floor in front, or up at the towel above
    const px = swat ? -34 - bat * 4 : -32 - bat * 10, py = swat ? -98 - bat * 12 : -8 - bat * 12;
    c.strokeStyle = INK; c.lineWidth = 3.2;
    c.fillStyle = C.body; c.beginPath();
    if (swat) { c.moveTo(-26 * ch, -42); c.quadraticCurveTo(-36, -66, px - 5, py + 2); c.lineTo(px + 5, py + 4); c.quadraticCurveTo(-24, -62, -16 * ch, -40); }   // reaching up the outside of the head
    else { c.moveTo(-16 * ch, -30); c.quadraticCurveTo(-28, -28, px + 2, py - 5); c.lineTo(px + 3, py + 5); c.quadraticCurveTo(-20, -14, -8 * ch, -16); }
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(px, py, 7, 6, -0.3, 0, 7); c.fill(); c.stroke();
  }
  if (groom) {   // the lifted front paw: at the mouth for licking, or rubbing over the ear
    const [px, py] = wash === 'ear' ? [-20 + Math.sin(t * 3) * 4, -86 + Math.sin(t * 3) * 6] : [-4, -50 + lick * 3];
    c.strokeStyle = INK; c.lineWidth = 3.2;
    c.fillStyle = C.body; c.beginPath(); c.moveTo(-14 * ch, -22); c.quadraticCurveTo(-22, -40, px - 3, py + 4); c.lineTo(px + 5, py + 6); c.quadraticCurveTo(-8, -36, -4 * ch, -20); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(px, py, 7, 6, wash === 'ear' ? -0.6 : 0.3, 0, 7); c.fill(); c.stroke();
  }
  c.restore();
}

// Chunky, outlined, gently bouncing letters, one colour each, like a cozy game's logo.
const LOGO = ['#ffd23f', '#ff9f43', '#ff6b6b', '#7bd389', '#5aa9e6', '#b98cf0'];
function fancyText(c, text, cx, cy, maxW, size, t, o = {}) {
  const chars = [...text], gapK = o.gap ?? 0.02;
  const width = sz => { c.font = cozyFont(sz); return chars.reduce((a, ch) => a + c.measureText(ch).width + sz * gapK, -sz * gapK); };
  let w = width(size);
  if (w > maxW) { size *= maxW / w; w = width(size); }
  let x = cx - w / 2;
  c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
  chars.forEach((ch, i) => {
    const cw = c.measureText(ch).width;
    if (ch !== ' ') {
      const bob = Math.sin(t * 1.8 + i * 0.7) * size * (o.bob ?? 0.035);
      const rot = (i % 2 ? 1 : -1) * (o.tilt ?? 0.05) + Math.sin(t * 1.1 + i) * 0.015;
      c.save(); c.translate(x + cw / 2, cy + bob); c.rotate(rot);
      const col = o.fill || LOGO[(i + (o.shift || 0)) % LOGO.length];
      c.fillStyle = 'rgba(74,44,26,.35)'; c.fillText(ch, -cw / 2, size * 0.09);
      c.strokeStyle = INK; c.lineWidth = size * (o.thick ?? 0.2); c.strokeText(ch, -cw / 2, 0);
      const g = c.createLinearGradient(0, -size * 0.75, 0, size * 0.05);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.2, col); g.addColorStop(1, col);
      c.fillStyle = g; c.fillText(ch, -cw / 2, 0);
      c.restore();
    }
    x += cw + size * gapK;
  });
  return size;
}
function ribbon(c, text, cx, cy, size) {
  c.font = cozyFont(size);
  const tw = c.measureText(text).width, w = tw + size * 1.6, h = size * 1.5, x0 = cx - w / 2, y0 = cy - h / 2;
  c.lineJoin = 'round'; c.strokeStyle = INK; c.lineWidth = size * 0.12;
  c.fillStyle = '#a82a2a';
  for (const dir of [-1, 1]) {
    const ex = dir < 0 ? x0 - size * 0.9 : x0 + w + size * 0.9, bx = dir < 0 ? x0 + size * 0.4 : x0 + w - size * 0.4;
    c.beginPath(); c.moveTo(bx, y0 + h * 0.3); c.lineTo(ex, y0 + h * 0.3); c.lineTo(ex - dir * size * 0.45, y0 + h * 0.8); c.lineTo(ex, y0 + h * 1.3); c.lineTo(bx, y0 + h * 1.3); c.closePath(); c.fill(); c.stroke();
  }
  c.fillStyle = '#d43a3a'; c.beginPath(); if (c.roundRect) c.roundRect(x0, y0, w, h, size * 0.25); else c.rect(x0, y0, w, h); c.fill(); c.stroke();
  c.fillStyle = '#fff8ea'; const n = Math.floor((w - size * 0.5) / (size * 0.7));
  for (let i = 0; i < n; i++) { const px = x0 + size * 0.35 + i * size * 0.7; c.fillRect(px, y0 + size * 0.14, size * 0.18, size * 0.1); c.fillRect(px, y0 + h - size * 0.24, size * 0.18, size * 0.1); }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, cx, cy + size * 0.06);
}

function drawTitle(t) {
  const c = tctx, W = tcv.width, H = tcv.height, land = W > H * 1.15, S = Math.min(W, H);
  const gy = H * (land ? 0.68 : 0.6);
  // sky, sun, clouds
  let g = c.createLinearGradient(0, 0, 0, gy);
  g.addColorStop(0, '#8fd3f4'); g.addColorStop(0.75, '#cfeefc'); g.addColorStop(1, '#fff3cf');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const sx = W * (land ? 0.88 : 0.84), sy = gy - H * (land ? 0.3 : 0.2), sr = S * 0.07;
  c.save(); c.translate(sx, sy); c.rotate(t * 0.15); c.fillStyle = 'rgba(255,214,77,.45)';
  for (let i = 0; i < 12; i++) { c.rotate(Math.PI / 6); poly(c, [[-sr * 0.25, -sr * 1.15], [0, -sr * 1.75], [sr * 0.25, -sr * 1.15]]); }
  c.restore(); c.fillStyle = '#ffd34d'; circ(c, sx, sy, sr); c.fillStyle = '#ffe58a'; circ(c, sx - sr * 0.25, sy - sr * 0.25, sr * 0.45);
  for (let i = 0; i < 4; i++) {
    const cw = S * (0.16 + i * 0.03), cx = ((t * (12 + i * 5) * (W / 900) + i * W * 0.37) % (W + cw * 2)) - cw, cy = gy * (0.12 + (i % 3) * 0.17);
    c.fillStyle = 'rgba(255,255,255,.92)'; circ(c, cx, cy, cw * 0.28); circ(c, cx + cw * 0.3, cy + cw * 0.05, cw * 0.22); circ(c, cx - cw * 0.3, cy + cw * 0.06, cw * 0.2); ell(c, cx, cy + cw * 0.14, cw * 0.55, cw * 0.12);
  }
  // hills and meadow
  const hill = (col, base, amp, f, ph) => { c.fillStyle = col; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W + 1; x += W / 40) c.lineTo(x, base - Math.sin(x / W * f + ph) * amp - amp); c.lineTo(W, H); c.closePath(); c.fill(); };
  hill('#bfe59a', gy - S * 0.02, S * 0.05, 5, 0.6);
  hill('#a6dc7c', gy + S * 0.02, S * 0.035, 7, 2.1);
  g = c.createLinearGradient(0, gy, 0, H); g.addColorStop(0, '#9bd772'); g.addColorStop(1, '#6fb84f');
  c.fillStyle = g; c.fillRect(0, gy + S * 0.02, W, H);
  for (const [a, b, k] of DOTS) { c.fillStyle = k < 0.33 ? '#ffffff' : k < 0.66 ? '#ffe36e' : '#ffb3c7'; circ(c, a * W, gy + S * 0.05 + b * (H - gy), S * 0.006); }
  // cottage, path, fence, apple tree, stork
  const hs = Math.min(W * (land ? 0.3 : 0.6), H * (land ? 0.27 : 0.3)), hx = W / 2, hy = gy + S * 0.03;
  c.fillStyle = '#ecd9a6'; c.beginPath(); c.moveTo(hx - hs * 0.09, hy - hs * 0.02); c.lineTo(hx + hs * 0.09, hy - hs * 0.02); c.lineTo(hx + hs * 0.5, H); c.lineTo(hx - hs * 0.5, H); c.closePath(); c.fill();
  drawIcon(c, '@appletree', hx - hs * (land ? 1.6 : 0.62), hy - hs * 0.02, hs * 0.85, { fruit: true });
  drawIcon(c, '@stork', hx + hs * (land ? 1.7 : 0.66), hy - hs * 0.01, hs * 0.8);
  for (const dir of [-1, 1]) for (let i = 0; i < (land ? 12 : 6); i++) drawIcon(c, '@parkan', hx + dir * (hs * 0.62 + i * hs * 0.28), hy + hs * 0.02, hs * 0.3);
  drawIcon(c, '@khata', hx, hy, hs);
  for (let i = 0; i < (land ? 16 : 10); i++) { const side = i % 2 ? 1 : -1, n = Math.floor(i / 2); sunflower(c, hx + side * (hs * 0.62 + n * hs * 0.3), hy + hs * 0.01, hs * (0.42 + (n % 2) * 0.08), t, i); }
  // the cats: Cleo, Cece (biggest by far) and Baby (smallest), out towards the sides so the buttons
  // in the middle don't cover them
  const cs = hs * 0.33, cy = hy + hs * (land ? 0.18 : 0.2), edge = (x, m = 0.6) => Math.max(cs * m, Math.min(W - cs * m, x));
  const lx = land ? hx - hs * 1.05 : W * 0.2, rx = land ? hx + hs * 1.05 : W * 0.85;
  cat(c, edge(lx), cy, cs, CATS[0], t, 0, 1);
  cat(c, edge(rx), cy + hs * 0.02, cs * 1.3, CATS[1], t, 1.7, -1);
  cat(c, edge(land ? lx + hs * 0.36 : W * 0.07, 0.35), cy + hs * 0.09, cs * 0.7, CATS[2], t, 3.1, 1);
  // big sunflowers in the corners
  sunflower(c, W * 0.06, H, hs * (land ? 0.55 : 0.78), t, 9);
  sunflower(c, W * 0.17, H, hs * (land ? 0.42 : 0.6), t, 10);
  sunflower(c, W * 0.94, H, hs * (land ? 0.55 : 0.8), t, 11);
  sunflower(c, W * 0.83, H, hs * (land ? 0.4 : 0.58), t, 12);
  // butterflies
  for (let i = 0; i < 2; i++) { const bx = W * (0.3 + 0.4 * i) + Math.sin(t * 0.6 + i * 2) * W * 0.1, by = gy - S * 0.08 + Math.cos(t * 0.9 + i) * S * 0.04; c.save(); c.translate(bx, by); c.scale(1, Math.abs(Math.sin(t * 9 + i)) * 0.6 + 0.4); c.fillStyle = i ? '#ff8fb1' : '#ffd23f'; ell(c, -S * 0.012, 0, S * 0.012, S * 0.016); ell(c, S * 0.012, 0, S * 0.012, S * 0.016); c.restore(); }
  // the logo: Vickie's Valley in the big painted letters, and its Ukrainian name, «Долина Вікі», on the red sign
  const top = H * 0.05;
  if (land) {
    const s1 = fancyText(c, "Vickie's Valley", W / 2, top + H * 0.13, W * 0.66, H * 0.14, t);
    ribbon(c, 'Долина Вікі', W / 2, top + H * 0.13 + s1 * 0.95, s1 * 0.36);
  } else {
    const big = Math.min(W * 0.2, H * 0.1);
    const s1 = fancyText(c, "Vickie's", W / 2, top + big * 1.05, W * 0.84, big, t);
    fancyText(c, 'Valley', W / 2, top + big * 1.05 + s1 * 0.98, W * 0.84, s1, t, { shift: 3 });
    ribbon(c, 'Долина Вікі', W / 2, top + big * 1.05 + s1 * 1.72, s1 * 0.36);
  }
}

let last = 0, running = false;
let nowT = 0, waterFx = null, slowT = 0;
function frame(ms) {
  const raw = t0 => t0 - last || 0.016, t = ms / 1000, real = raw(t), dt = Math.min(0.05, real); last = t; nowT = t;
  // A phone that cannot keep up (under 25 frames a second for three seconds) drops the finery and stays smooth.
  if (running && !GFX.lock && GFX.cloud) { slowT = real > 0.04 && real < 0.5 ? slowT + real : Math.max(0, slowT - real * 2); if (slowT > 3) GFX.cloud = GFX.motes = GFX.smoke = GFX.sway = 0; }
  musicTick(dt);
  if (!running && $('#start').style.display !== 'none') { tctx.setTransform(1, 0, 0, 1, 0, 0); drawTitle(t); requestAnimationFrame(frame); return; }
  if ((mode === 'mill') !== document.body.classList.contains('inmill')) document.body.classList.toggle('inmill', mode === 'mill');   // the goal line steps aside for the mill's own hints
  if (mode !== 'mill' && MSFX.on) msfxStop();
  if (mode !== 'world' && NS.falls && actx) NS.falls.g.gain.setTargetAtTime(0, actx.currentTime, 0.2);   // indoors: the waterfall can't be heard
  if (mode === 'home') { ctx.setTransform(1, 0, 0, 1, 0, 0); drawHome(t); }
  else if (mode === 'olia') { ctx.setTransform(1, 0, 0, 1, 0, 0); drawOlia(t); }
  else if (mode === 'mill') { ctx.setTransform(1, 0, 0, 1, 0, 0); drawMill(t); }
  else if (mode === 'church') { ctx.setTransform(1, 0, 0, 1, 0, 0); drawChurch(t); }
  else if (mode === 'fest') { ctx.setTransform(1, 0, 0, 1, 0, 0); drawFest(t); }
  else { update(running && !sheetOpen() ? dt : 0, t, dt); fxUpdate(dt); drawWorld(t); }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ taps
function hitEnt(wx, wy) {
  let best = null, bd = 1e9;
  for (const e of ents) {
    if ((e.hide && !ready(e)) || goneNow(e)) continue;
    const s = Math.max(0.75, e.s), cx = e.x, cy = e.kind === 'pond' ? e.y - 0.2 : e.flat ? e.y : e.y - s * 0.45;
    let d;
    if (e.kind === 'pond') { if (!inPond(wx, wy)) continue; d = 5; }
    else { if (e.s > 3 && wy > e.y - 0.25) continue;
      if (e.hitLow && wy < e.y - e.hitLow) continue;   // a low thing in front of a house (Grandma's fence): only its own bottom strip, so the house above gets the tap   // big buildings: the ground just in front of one is for walking on
      const dx = Math.abs(wx - cx) / (s * (e.hitW || (e.s > 3 ? 0.4 : 0.5))),   // hitW: a narrower box for tall thin things (the stork pole)
        dy = Math.abs(wy - cy) / (s * 0.55); if (dx > 1 || dy > 1) continue; d = Math.hypot(dx, dy) + (e.s > 2 ? 1 : 0); }
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
let down = null;
cv.addEventListener('pointerdown', ev => { tour = null; peeking = false; down = { x: ev.clientX, y: ev.clientY, t: now(), rx: roomX, px: peekX, py: peekY }; });
// Inside the cottage, dragging pans the room.
cv.addEventListener('pointermove', ev => {
  if (!down || sheetOpen()) return;
  const k = cv.width / innerWidth;
  if (mode !== 'world') { if (MILL.hold && mode === 'mill') return; IN.follow = false; roomX = down.rx - (ev.clientX - down.x) * k; clampPan(); return; }
  // Outdoors: drag to look around.
  if (!running) return;
  if (!peeking && Math.hypot(ev.clientX - down.x, ev.clientY - down.y) > 12) peeking = true;
  if (peeking) {
    const lim = (Math.max(cv.width, cv.height) / zoom) * 0.9;
    peekX = Math.max(-lim, Math.min(lim, down.px - (ev.clientX - down.x) * k / zoom));
    peekY = Math.max(-lim, Math.min(lim, down.py - (ev.clientY - down.y) * k / zoom));
    peekVX = peekVY = 0;
  }
});
cv.addEventListener('pointercancel', () => { peeking = false; down = null; if (MILL.hold) millUp(); });
cv.addEventListener('pointerdown', ev => { if (mode === 'mill') millDown(ev); });   // holding the mill's hand wheel
cv.addEventListener('pointerdown', ev => { if (mode === 'fest' && !sheetOpen()) festTap(ev); });
cv.addEventListener('pointerup', ev => {
  peeking = false;
  if (mode === 'mill' && MILL.hold) { millUp(); down = null; return; }   // let go of the mill's hand wheel
  if (fishFx) { down = null; return; }   // no walking off mid-cast
  if (!down || !running || sheetOpen()) return;
  const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y); down = null;
  if (moved > 18) return;
  const k = cv.width / innerWidth, px = ev.clientX * k, py = ev.clientY * k;
  if (mode === 'home') return homeTap(px, py);
  if (mode === 'olia') return oliaTap(px, py);
  if (mode === 'mill') return millTap(px, py);
  if (mode === 'church') return churchTap(px, py);
  if (mode === 'fest') return;   // the festival takes its taps on pointerdown, for the beat
  const wx = (camX + px / zoom) / T, wy = (camY + py / zoom) / T;
  const e = hitEnt(wx, wy);
  blip(e ? 700 : 560, 0.05); fxTap(e && e.kind !== 'pond' ? e.x : wx, e && e.kind !== 'pond' ? e.y : wy, !!e, e && e.kind !== 'pond' ? e : null); if (e) e.tapT = nowT;
  if (e) walkTo(e.x, e.kind === 'pond' ? wy : e.y, e); else walkTo(wx, wy, null);
});

// ------------------------------------------------------------------ Grandma Olia's letter
let storyPage = 0;
function storyShow(i) {
  const pages = D.story, st = pages[i], box = $('#story');
  storyPage = i;
  const pic = p => p.startsWith('face:') ? `<img class="face" src="${faceURL(NPC[p.slice(5)].look)}" alt="">`
    : p.startsWith('w:') ? `<img src="${iconURL(p.slice(2))}" alt="">` : `<span class="em">${p}</span>`;
  const last = i === pages.length - 1;
  box.querySelector('.paper').innerHTML = `
    <button class="x" data-a="storyClose" aria-label="Закрити / Close">✕</button>
    <div class="pics">${st.pics.map(pic).join('')}</div>
    <div class="ukl">${st.uk}</div>
    <div class="tr">${translit(st.uk)}</div>
    <div class="enl">${st.en}</div>
    <div class="dots">${pages.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>
    <div class="nav">
      ${btn('storyGo', Math.max(0, i - 1), '←', 'ghost round' + (i > 0 ? '' : ' hide'))}
      ${btn('hear', st.clip, '🔊', 'round blue')}
      ${last ? btn('storyStart', '', 'Почати<small>Start</small>') : btn('storyGo', i + 1, 'Далі<small>Next</small>')}
    </div>`;
  box.classList.add('show');
  box.querySelector('.enl').scrollTop = 0;
  say(st.clip);
}
function storyClose() { $('#story').classList.remove('show'); sayToken++; for (const k in clipCache) { try { clipCache[k].pause(); } catch (e) {} } }

const A = {
  donate(v) {
    const n = +v || 1; if ((S.coins || 0) < n) return toast('💰 ' + (stage() < 3 ? 'Not enough coins.' : '✖'), 1600);
    S.coins -= n; S.churchGiven = (S.churchGiven || 0) + n; hud(); save(); closeSheet();
    CHURCH.coinT = nowT; CHURCH.coinN = Math.min(5, n); for (let i = 0; i < Math.min(5, n); i++) setTimeout(() => blip(1320 + i * 60, 0.05), 250 + i * 110);
    setTimeout(() => toast('🙏 Дякуємо!' + (stage() < 3 ? ' · Thank you!' : ''), 2200), 700);
  },
  update() { location.reload(); },
  eatMeal() {
    if (devMeal) { devMeal = false; say('p_duzhe_smachno'); blip(990, 0.2); return setTimeout(closeSheet, 1500); }   // a developer's practice meal
    const R = curRecipe(); if (!R) return closeSheet();
    say('p_duzhe_smachno'); learn(R.dish); give(R.dish); S.hearts += 3;   // a meal from Grandma earns love, not money
    S.recipe = { i: S.recipe.i + 1, have: {}, started: -1 };
    hud(); save(); setGuide(); blip(990, 0.2);
    setTimeout(() => { closeSheet(); toast(`❤️ +3  ${W[R.dish].uk}${stage() < 3 ? ' · ' + W[R.dish].en : ''}`); }, 1800);
  },
  story() { storyShow(0); },
  storyGo(v) { storyShow(+v); },
  storyClose,
  storyBg() {},
  storyStart() { storyClose(); A.start(); },
  start() {
    // Full screen right away. This runs inside the tap, which browsers require. The installed app is already full screen.
    try {
      const el = document.documentElement, req = el.requestFullscreen || el.webkitRequestFullscreen;
      const inApp = matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
      if (req && !inApp && !(document.fullscreenElement || document.webkitFullscreenElement)) { const p = req.call(el, { navigationUI: 'hide' }); if (p && p.catch) p.catch(() => {}); }
    } catch (e) {}
    $('#start').style.display = 'none'; running = true; hud(); setGuide(); musicBtn(); startMusic(); say('p_pryvit', guideClip);
    if (S.refunded && !S.refundTold) { S.refundTold = 1; save(); setTimeout(() => toast(`🛏️ Меблі вже в хаті! +${S.refunded} ₴`), 1500); } },
  music() {
    musicOn = !musicOn; try { localStorage.setItem('kd-music', musicOn ? 'on' : 'off'); } catch (e) {}
    musicBtn(); if (mode === 'fest') { if (musicOn && fest && fest.phase !== 'greet') festMusic.play().catch(() => {}); else festMusic.pause(); } else if (musicOn) { musicVol = 0; music.play().catch(() => {}); } toast(musicOn ? '🎵 Музика · Music on' : '🔇 Тиша · Music off');
  },
  // Exit: the installed app closes completely; in a browser tab it leaves full screen and goes back to the title.
  quit() {
    save(); closeSheet(); sayToken++; try { speechSynthesis.cancel(); } catch (e) {}
    // A browser tab in full screen also reports display-mode "fullscreen", so that alone does not mean an installed app.
    const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const inApp = matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches || navigator.standalone || (!inFs && matchMedia('(display-mode: fullscreen)').matches);
    const toTitle = () => { try { festMusic.pause(); } catch (e) {} fest = null; bed = null; document.body.classList.remove('bedtime', 'scene'); mg = null; chop = null; ck = null; running = false; mode = 'world'; $('#homebar').style.display = 'none'; try { music.pause(); } catch (e) {} $('#start').style.display = ''; try { sizeTitle(); } catch (e) {} };
    if (inApp) {
      toTitle();
      try { window.close(); } catch (e) {}
      setTimeout(() => { if (!document.hidden) toast('Swipe up to close the app'); }, 500);
      return;
    }
    try { const ex = document.exitFullscreen || document.webkitExitFullscreen; if ((document.fullscreenElement || document.webkitFullscreenElement) && ex) { const p = ex.call(document); if (p && p.catch) p.catch(() => {}); } } catch (e) {}
    toTitle();
  },
  async mic() {
    if (!MIC.supported) return toast('Microphone not available here');
    if (MIC.state === 'granted') return toast('🎤 Мікрофон увімкнено · Microphone is on');
    // Always ask (even if Chrome reports "denied"): after the person fixes the
    // setting, this is what makes Chrome show its question again.
    const t0 = performance.now();
    try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach(t => t.stop()); MIC.state = 'granted'; toast('🎤 Мікрофон увімкнено · Microphone is on'); micRefresh(); return; }
    catch (e) {
      if (e && e.name === 'NotAllowedError') MIC.state = 'denied';
      micRefresh();
      micHelp(micReason(e, performance.now() - t0));
    }
  },
  micHow() { micHelp(MIC.lastReason && MIC.lastReason !== 'site' ? MIC.lastReason : 'chrome'); },
  spSay() { spAttempt(); },
  spEyeUk() { if (sp) { sp.showUk = true; spRender(); } },
  spEyeTr() { if (sp) { sp.showTr = true; spRender(); } },
  spStop() { if (sp) sp.stop = true; },
  spNext() { spAdvance(); },
  spSkip() { spAdvance(); },
  festReply() { festReply(); },
  wardrobe() { wardrobeSheet(); },
  wardTurn() { if (ward) { ward.view = (ward.view + 1) % 4; ward.t0 = nowT; blip(600, 0.03); } },
  wear(v) { if (!S.wardrobe[v]) return; S.outfit = v; wearOutfit(v); useWord(v, true); save(); blip(880, 0.06); wardrobeSheet(); if (ward) { ward.view = 0; ward.t0 = nowT; ward.pop = nowT; } say('w_' + v, 'p_harno_vyhliadaiesh'); },
  devPin() { if (devOn) { A.start(); return setTimeout(devMenu, 700); } devCode = ''; devPinDraw(); },   // already unlocked on this device: straight in
  devOff() { devOn = false; setTimeout(hud, 50); try { localStorage.removeItem('kd-dev'); } catch (e) {} $('#devBtn').style.display = 'none'; seasonForce = null; homeList = null; closeSheet(); setGuide(); toast('🔒 Developer mode off'); },
  devPinX() { $('#devpin').classList.remove('on'); },
  devKey(v) {
    if (v === 'back') devCode = devCode.slice(0, -1); else if (devCode.length < 4) devCode += v;
    blip(600 + devCode.length * 80, 0.04);
    if (devCode.length < 4) return devPinDraw();
    if (devCode === '7272') { devOn = true; devCode = ''; setTimeout(hud, 50); try { localStorage.setItem('kd-dev', '1'); } catch (e) {} $('#devpin').classList.remove('on'); $('#devBtn').style.display = ''; A.start(); setTimeout(devMenu, 700); }
    else { devCode = ''; devPinDraw(true); blip(200, 0.15); }
  },
  devMenu() { if (devOn) devMenu(); },
  devGame(v) { closeSheet(); if (v === 'chop') return setTimeout(chopStart, 150); setTimeout(() => mgStart(v.replace(/_[ws]$/, ''), v), 150); },
  devCook(v) { const R = D.recipes.find(r => r.id === v); closeSheet(); setTimeout(() => cookScene(R, true), 150); },
  devSeason(v) { seasonForce = v === 'real' ? null : v; homeList = null; closeSheet(); setGuide(); toast(`${SEASON_IC[season()]} ${W[season()].uk}${v === 'real' ? ' · the real season' : ''}`); },
  devFest(v) { seasonForce = SEASONS[FEST_OF.indexOf(v)]; closeSheet(); devToWorld(); setTimeout(() => { startFest(); if (fest) fest.dev = true; }, 150); },
  devWx(v) {   // the weather now (rain turns to snow in winter, and snow to cloud outside it, as usual)
    closeSheet(); devToWorld(); S.clock.ev = S.clock.ev || {};
    if (v === 'rainbow') { S.wx = 'sun'; S.rainbowDay = S.clock.day; S.clock.t = Math.min(Math.max(S.clock.t, 0.63), 0.7); learn('veselka'); say('w_veselka'); save(); return toast('🌈 ' + W.veselka.uk); }
    S.wx = v; delete S.clock.ev.rained; delete S.clock.ev.rainbow; delete S.clock.ev.storm; if (v === 'fog') S.clock.t = Math.min(S.clock.t, 0.32); if (wet(v)) S.clock.t = Math.min(S.clock.t, 0.5); save(); learn(WX[v].w);
    toast(`${WX[v].ic} ${W[WX[v].w].uk}${(v === 'rain' && winter()) ? ' · in winter it falls as snow' : (v === 'snow' && !winter()) ? ' · snow only falls in winter' : ''}`, 2600);
  },
  devTime(v) {
    closeSheet();
    if (v === 'bed') { S.clock.t = 0.9; return fadeThen(() => { enterHomeNow(); if (bed) bed.dev = true; }); }
    devToWorld(); S.clock.t = { morning: 0.3, evening: 0.79, night: 0.88 }[v]; S.clock.ev = {}; S.clock.nightT = 0; save(); toast({ morning: '🌅 ' + W.ranok.uk, evening: '🌇 ' + W.vechir.uk, night: '🌙 ' + W.nich.uk }[v]);
  },
  boardGive() { boardGive(); },
  festGo() { closeSheet(); startFest(); },
  mgGo(v) { closeSheet(); setTimeout(() => mgStart(v), 120); },
  mgNesy() { if (!mg || mg.id !== 'andriiko' || mg.phase !== 'b') return; mgAct('nesy', true); useWord('nesy', true); mg.phase = 'home'; blip(880, 0.06); },
  festDone() { festDone(); },
  spGo() { const R = sp && sp.R; sp = null; if (R) cookScene(R); },
  reset() { if (confirm('Start the village over from the beginning?')) { try { localStorage.removeItem(SAVE); } catch (e) {} location.reload(); } },
  close() { if (sp) return; closeSheet(); },   // a stray tap outside must not throw away a speaking round
  words: wordsSheet, bag: bagSheet,
  guide() { say(guideClip); },
  guideEye() { guideEnOn = !guideEnOn; setGuide(); },
  exitHome,
  enterHome,
  hear(v) { say(v); },
  subs() {
    const on = !subsOnNow(); try { localStorage.setItem('kd-subs', (on ? 'on' : 'off') + '@' + subsBand()); } catch (e) {}
    const box = sheet.querySelector('.subs'); if (box) box.outerHTML = subsHTML();
    subPaint();
  },
  hear2(v) { say('w_' + v, 'p_bud_laska'); },
  hearItem(v) { learn(v); say('w_' + v); },
  hearWord(v) { say('w_' + v); toast(`${W[v].uk} — ${W[v].en}`); },
  peek() { if (cur.hideEn) cur.peeked = true; $('#en').innerHTML = `<div class="en">${W[cur.id].en}</div>`; for (const el of document.querySelectorAll('#sheet .xl')) el.classList.remove('xl'); },
  peekLine() { $('#en').innerHTML = `<div class="en">${cur.en}</div>`; for (const el of document.querySelectorAll('#sheet .cen')) el.style.display = ''; },
  act(v) { const a = acts[+v]; if (a) a.fn(); },
  next() { const d = dlg; if (!d) return closeSheet(); const st = d.steps[d.i]; dialog(d.npc, d.steps, d.i + 1); if (st.after) st.after(); },
  choose(v) { const d = dlg; if (!d) return; const c = d.steps[d.i].choices[+v]; say(c.clip); setTimeout(() => { if (dlg !== d) return; if (c.fn) { closeSheet(); c.fn(); } else if (c.then) dialog(d.npc, [...d.steps.slice(0, d.i + 1), ...c.then], d.i + 1); else dialog(d.npc, d.steps, d.i + 1); }, 1500); },
  plant(v) { const p = S.plots[cur.plot]; if (!(S.seeds[v] > 0)) return; S.seeds[v]--; p.c = v; p.wet = false; p.ready = 0; learn(v); learn('nasinnia'); closeSheet(); say('w_' + v); blip(600); tutEvent('plant'); save(); },
  water() { const p = S.plots[cur.plot]; if (!(S.bag.voda > 0)) return plotSheet(cur.plot); S.bag.voda--; hud(); bumpWater(); p.wet = true; p.ready = now() + 50e3; waterFx = { i: cur.plot, t0: nowT }; closeSheet(); learn('voda'); say('w_voda'); blip(760); tutEvent('water'); save(); },
  harvest() { const p = S.plots[cur.plot], c = p.c; p.c = null; give(c, 2); toast(`+2 ${W[c].ic} ${W[c].uk}`); tutEvent('harvest'); wordCard(c); save(); },
  tab(v) { shopTab = v; shopSel = null; shop(); },
  pick(v) { shopSel = owned(v) ? null : v; learn(v); shop(); say('w_' + v); if (owned(v)) toast(`✓ ${D.ui.have[0]}${stage() < 3 ? ' · ' + D.ui.have[1] : ''}`); },
  buy(v) {
    if (shopTab === 'clothes') shopSel = v;
    if (owned(v)) return;
    const price = D.shop[shopTab][v];
    if (!devOn && S.coins < price) { toast(`${D.ui.notenough[0]}${stage() < 3 ? ' · ' + D.ui.notenough[1] : ''}`); return; }
    if (!devOn) S.coins -= price;   // in developer mode everything is free (the real coins stay as they were)
    if (shopTab === 'seeds') { S.seeds[v] = (S.seeds[v] || 0) + 1; learn('nasinnia'); }
    else if (shopTab === 'veg') give(v);
    else if (shopTab === 'clothes') { S.wardrobe[v] = 1; setTimeout(() => toast(`👗 ${W[v].uk} → ${W.shafa.uk}${stage() < 3 ? ' · in your wardrobe at home' : ''}`, 2600), 300); }
    else if (shopTab === 'home' || shopTab === 'cats') S.home[v] = (S.home[v] || 0) + 1;
    else if (shopTab === 'tools') { S.gear[v] = 1; farmEnts(); }
    else if (shopTab === 'farm') { S.farm = S.farm || {}; S.farm[v] = farmN(v) + 1; farmEnts(); }
    else give(v);
    hud(); blip(880, 0.1); say('n_' + price, 'p_diakuiu');
    toast(shopTab === 'seeds' ? `−${price} ₴  🌱 ${W.nasinnia.uk}: ${W[v].uk}${stage() < 3 ? ' · seeds to plant in your garden' : ''}` : `−${price} ₴  ${W[v].uk}${stage() < 3 && (shopTab === 'farm' || v === 'maslobiika' || v === 'zhorna') ? ' · now by your cottage' : ''}`); tutEvent('buy'); save(); shop();
  },
  sell(v) { if (!(S.bag[v] > 0)) return; S.bag[v]--; S.coins += sellPrice(v); hud(); blip(820); say('w_' + v); save(); shop(); },
  hand(v) {
    const h = help; if (!h) return;
    if (v === h.target) {
      useWord(v, h.tries === 0); hud(); blip(990, 0.12); toast(PH.diakuiu.uk);
      if (h.n >= 4) { shopTab = 'food'; say('v_oksana_thanks'); setTimeout(shop, 1600); } else { say('p_diakuiu'); setTimeout(() => { if (help === h) helpRound(h.n + 1); }, 1100); }
    } else {
      // No scolding: she just says what that one is, and you try again.
      h.tries++; useWord(h.target, false); toast(`${PH.ni.uk} ${W[v].uk}.`); say('p_ni', 'w_' + v);
    }
  },
  decorate() { decorSheet(); },
  goWell() { const e = ents.find(x => x.w === 'krynytsia'); closeSheet(); walkTo(e.x, e.y, e); },
  decor(v) {   // tapped in the room: put one away
    if (BASICS.includes(v) || !S.decor[v]) return;
    const n = nPlaced(v) - 1; if (n > 0) S.decor[v] = n; else delete S.decor[v];
    S.home[v] = (S.home[v] || 0) + 1; blip(440); save();
  },
  place(v) {   // tapped in the Прикрасити sheet: put one in the room
    if (BASICS.includes(v) || !(S.home[v] > 0)) return;
    S.home[v]--; S.decor[v] = nPlaced(v) + 1; learn(v); say('w_' + v); blip(700); tutEvent('place');
    save(); decorSheet();
  },
};
document.addEventListener('click', ev => {
  if (ev.target.id === 'story') return storyClose();
  const el = ev.target.closest('[data-a]'); if (!el) return;
  // A phone sends a "click" just after the finger lifts. If that same tap has just opened a card, the click
  // lands on the card's backdrop (closing it) or on one of its buttons. Ignore clicks on a card for a moment.
  if (Date.now() - sheetAt < 400 && (el.id === 'veil' || sheet.contains(el))) return;
  const f = A[el.dataset.a]; if (f) f(el.dataset.v);
});
document.addEventListener('contextmenu', ev => ev.preventDefault());

farmEnts();   // your own hens, cow and churn
hud(); setGuide();
{ const b = document.querySelector('[data-a=bag]'); if (b) b.innerHTML = `<img src="${iconURL('koshyk')}" alt="" style="width:1.5em;height:1.5em;margin:-0.1em;display:block;pointer-events:none">`; }   // the drawn basket, not the emoji
requestAnimationFrame(frame);
// ------------------------------------------------------------------ staying up to date
// Every time the game opens or comes back to the front, it asks the server which version is current.
// On the title screen it reloads straight into the new one; mid-game it offers a button instead.
// Progress lives in localStorage, so a reload never loses anything.
const VERSION = window.APP_VERSION || '0';
function newerAvailable() {
  try { if (sessionStorage.getItem('kd-reloaded') === VERSION) { sessionStorage.removeItem('kd-reloaded'); } } catch (e) {}
  if (running) { $('#update').classList.add('show'); return; }
  let tried = '';
  try { tried = sessionStorage.getItem('kd-tried') || ''; sessionStorage.setItem('kd-tried', VERSION); } catch (e) {}
  if (tried === VERSION) { $('#update').classList.add('show'); return; }   // never loop
  location.reload();
}
function checkVersion() {
  fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(j => {
    if (j && j.v && j.v !== VERSION) newerAvailable();
    else { try { sessionStorage.removeItem('kd-tried'); } catch (e) {} }
  }).catch(() => {});
}
let swReg = null;
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(r => { swReg = r; r.update().catch(() => {}); }).catch(() => {}));
}
addEventListener('load', checkVersion);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkVersion(); if (swReg) swReg.update().catch(() => {}); } });
// For automated checks.
window.__game = { give: (k,n) => give(k,n), homeCats: () => homeCats().map((h, i) => h.ct.id + ":" + catSpot(i).kind), catSpot, FETCH, OKS, solid: () => solid, iconURL, enterOliaNow, oliaHits: () => oliaHits, pan: x => { roomX = x; tour = null; }, mode: () => mode, speakRound, groundOk, ground, S: () => S, P, ents, A, walkTo, interact, stage, clips: textOf, room: () => ({ roomX, RW: roomW(), w: cv.width, h: cv.height, bed: decorRect('lizhko') }), rect: id => decorRect(id), take: e => take(e), fishing: () => !!fishFx, cam: () => ({ camX: Math.round(camX), camY: Math.round(camY), peekX: Math.round(peekX), peekY: Math.round(peekY) }), homeTap, musicState: () => (music.paused ? 'paused' : 'PLAYING') + ' at ' + music.currentTime.toFixed(1) + 's' };
})();
