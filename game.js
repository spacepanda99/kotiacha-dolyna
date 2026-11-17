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
const T = 64, MW = 36, MH = 28;
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
  coins: 10, hearts: 0, words: {}, bag: { voda: 3 }, waterInit: 1, seeds: { morkva: 3 }, home: {}, placed: {},
  plots: Array.from({ length: 6 }, () => ({ c: null, ready: 0, wet: false })),
  npc: {}, cats: {}, decor: {}, gear: {}, farm: {}, recipe: { i: 0, have: {}, started: -1 }, tut: 0, tutN: 0, cd: {}, x: 7.5, y: 12.5,
});
let S;
try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(SAVE) || '{}')); } catch (e) { S = fresh(); }
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
if (!S.gear) S.gear = {};
let saveT = 0;
// Grandma cooks one dish after another and starts over from the first once she has made them all.
const curRecipe = () => D.recipes[S.recipe.i % D.recipes.length];
// She needs six of every ingredient, so you hear and say each word over and over.
const NEED = 6;
const recipeHave = id => Math.min(NEED, S.recipe.have[id] || 0);
const recipeTotal = R => R.needs.reduce((a, id) => a + recipeHave(id), 0);
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) {} }, 300); };

// How far along the learner is. English fades out as this rises.
const mastered = () => Object.values(S.words).filter(w => w.l >= 3).length;
const stage = () => { const m = mastered(); return m >= 40 ? 3 : m >= 12 ? 2 : 1; };
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
  if (k === 's') return D.story && D.story[+a] ? D.story[+a].uk : '';
  if (k === 'v') return NPC[a] && NPC[a].lines[b] ? NPC[a].lines[b].uk : '';
  if (k === 'qp') return W[b] ? D.payLine.uk.replace('%s', W[b].acc || W[b].uk) : '';
  if (k === 'q') return W[b] ? D.questLine.uk.replace('%s', W[b].acc || W[b].uk) : '';
  return '';
}
function enOf(id) {
  const [k, a, ...rest] = id.split('_');
  const b = rest.join('_');
  if (k === 'w') return W[id.slice(2)] ? W[id.slice(2)].en : '';
  if (k === 'p') return PH[id.slice(2)] ? PH[id.slice(2)].en : '';
  if (k === 'c') { const ct = (D.cats || []).find(x => x.id === id.slice(2)); return ct ? ct.lineEn : ''; }
  if (k === 's') return D.story && D.story[+a] ? D.story[+a].en : '';
  if (k === 'v') return NPC[a] && NPC[a].lines[b] ? NPC[a].lines[b].en : '';
  if (k === 'qp') return W[b] ? D.payLine.en.replace('%s', W[b].en) : '';
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
  return `<div class="subs"><div id="subline"${subsOn ? '' : ' style="display:none"'}></div><button class="subt" data-a="subs">💬 ${subsOn ? 'Сховати субтитри' : 'Показати субтитри'}<small>${subsOn ? 'Hide English subtitles' : 'Show English subtitles'}</small></button></div>`;
}
function subStart(id, a) {
  const uk = textOf(id); if (!uk) return;
  subNow = { uk, en: enOf(id), a, t0: performance.now() };
  subPaint();
}
function subPaint() {
  const el = document.getElementById('subline'); if (!el || !subNow) return;
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
function startMusic() { if (musicOn && music.paused && !document.hidden) music.play().catch(() => {}); }
document.addEventListener('pointerdown', startMusic, true);
document.addEventListener('keydown', startMusic, true);
addEventListener('load', () => { musicBtn(); startMusic(); });
function musicTick(dt) {
  const target = musicOn && !sp ? 0.55 * duck : 0;   // silent for the whole speaking round, so the mic only hears you
  musicVol += (target - musicVol) * Math.min(1, dt * 3);
  try { music.volume = Math.max(0, Math.min(1, musicVol)); } catch (e) {}
  if (!musicOn && musicVol < 0.01 && !music.paused) music.pause();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) music.pause(); else startMusic(); });
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
  koshyk(c) { c.scale(3.8, 3.8); marketBasket(c, 0, -11.5); },   // the same wicker basket as in Oksana's bubble
  khata(c) {
    c.fillStyle = '#b5553f'; c.fillRect(21, -86, 12, 30); c.fillStyle = '#8f3f2d'; c.fillRect(19, -89, 16, 5);   // chimney
    c.fillStyle = '#fffdf5'; rr(c, -40, -52, 80, 52, 4);
    c.fillStyle = 'rgba(120,96,60,.16)'; c.fillRect(-40, -50, 80, 7);   // shade under the eaves
    c.fillStyle = '#4a90d9'; c.fillRect(-40, -8, 80, 8); c.fillStyle = '#3d7cc2'; c.fillRect(-40, -2.5, 80, 2.5);
    c.fillStyle = '#d8a23a'; poly(c, [[-50, -48], [0, -98], [50, -48]]);
    c.fillStyle = '#e6b95a'; poly(c, [[-50, -48], [0, -98], [-8, -90], [-40, -48]]);
    c.fillStyle = '#b9842a'; poly(c, [[-50, -48], [50, -48], [47, -44], [-47, -44]]);
    c.strokeStyle = '#b9842a'; c.lineWidth = 2;
    for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(i * 6, -92 + Math.abs(i) * 6); c.lineTo(i * 14, -50); c.stroke(); }
    c.fillStyle = '#8a5a2b'; rr(c, -9, -36, 18, 36, 3);
    c.fillStyle = '#f2c230'; circ(c, 5, -18, 1.8);
    for (const x of [-33, 17]) {
      c.fillStyle = '#3d7cc2'; rr(c, x - 2, -42, 20, 20, 3);
      c.fillStyle = '#bfe6fb'; rr(c, x, -40, 16, 16, 2);
      c.fillStyle = '#3d7cc2'; c.fillRect(x + 7, -40, 2, 16); c.fillRect(x, -33, 16, 2);
      c.fillStyle = '#e2574c'; circ(c, x + 3, -21, 2.5); circ(c, x + 13, -21, 2.5);
      c.fillStyle = '#f2c230'; circ(c, x + 8, -21, 2.5);
    }
  },
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
    c.fillStyle = '#7a4e26'; poly(c, [[-10, 0], [-6, -46], [6, -46], [10, 0]]);
    c.fillStyle = '#93602f'; poly(c, [[-6, 0], [-3.5, -46], [2.5, -46], [1.5, 0]]);
    c.save(); c.translate(0, -40); c.rotate((o && o.sway) || 0); c.translate(0, 40);
    c.fillStyle = '#2f8440'; circ(c, 0, -62, 33); circ(c, -23, -47, 20); circ(c, 23, -47, 20);
    c.fillStyle = '#3f9a4a'; circ(c, 0, -67, 32); circ(c, -22, -52, 19); circ(c, 22, -52, 19);
    c.fillStyle = '#55b35c'; circ(c, -8, -77, 16); circ(c, 14, -63, 11); circ(c, -23, -57, 9);
    c.fillStyle = '#78ca76'; circ(c, -11, -82, 7); circ(c, 12, -67, 4.5);
    c.restore();
  },
  appletree(c, o) {
    c.fillStyle = '#7a4e26'; poly(c, [[-10, 0], [-6, -46], [6, -46], [10, 0]]);
    c.fillStyle = '#93602f'; poly(c, [[-6, 0], [-3.5, -46], [2.5, -46], [1.5, 0]]);
    c.save(); c.translate(0, -40); c.rotate((o && o.sway) || 0); c.translate(0, 40);
    c.fillStyle = '#3d9748'; circ(c, 0, -61, 35); circ(c, -25, -46, 21); circ(c, 25, -46, 21);
    c.fillStyle = '#4fae55'; circ(c, 0, -66, 34); circ(c, -24, -51, 20); circ(c, 24, -51, 20);
    c.fillStyle = '#6cc86e'; circ(c, -8, -78, 15); circ(c, 15, -62, 10);
    c.fillStyle = '#8ad888'; circ(c, -11, -83, 6.5);
    if (!o || o.fruit !== false) for (const [x, y] of [[-20, -56], [-4, -70], [14, -80], [22, -54], [2, -48], [-16, -84]]) { c.fillStyle = '#c92a22'; circ(c, x, y + 0.8, 5.2); c.fillStyle = '#e8463b'; circ(c, x, y, 4.8); c.fillStyle = 'rgba(255,255,255,.55)'; circ(c, x - 1.6, y - 1.8, 1.4); }
    c.restore();
  },
  bush(c, o) {
    c.save(); c.rotate(((o && o.sway) || 0) * 0.6);
    c.fillStyle = '#3f9a4a'; circ(c, -18, -16, 20); circ(c, 16, -18, 22); circ(c, 0, -31, 22);
    c.fillStyle = '#57b25d'; circ(c, -18, -19, 19); circ(c, 16, -21, 21); circ(c, 0, -35, 21);
    c.fillStyle = '#74c773'; circ(c, -6, -42, 10); circ(c, -22, -25, 8); circ(c, 19, -28, 8);
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
  bench(c) {
    c.fillStyle = '#8a5a2b'; c.fillRect(-34, -30, 7, 30); c.fillRect(27, -30, 7, 30);
    c.fillStyle = '#c08a55'; rr(c, -42, -36, 84, 10, 3); rr(c, -42, -58, 84, 9, 3);
  },
  stork(c) {
    c.fillStyle = '#8a5a2b'; c.fillRect(-3, -66, 6, 66);
    c.fillStyle = '#a67c42'; ell(c, 0, -68, 26, 8);
    c.strokeStyle = '#e2574c'; c.lineWidth = 2; c.beginPath(); c.moveTo(-3, -74); c.lineTo(-3, -84); c.moveTo(4, -74); c.lineTo(4, -84); c.stroke();
    c.fillStyle = '#2d2d2d'; poly(c, [[-16, -92], [-4, -96], [-4, -86]]);
    c.fillStyle = '#ffffff'; ell(c, 1, -90, 12, 7); c.fillRect(8, -104, 4, 14); circ(c, 11, -105, 5);
    c.fillStyle = '#e2574c'; poly(c, [[15, -107], [29, -103], [15, -102]]);
    c.fillStyle = '#2d2d2d'; circ(c, 12, -106, 1.2);
  },
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
    c.fillStyle = 'rgba(0,0,0,.12)'; ell(c, 0, -1, 9, 3);
    c.fillStyle = '#8a8f96'; rr(c, -1.8, -97, 3.6, 97, 1.8); c.fillStyle = '#ffd23f'; circ(c, 0, -97, 3.2);
    const wv = i => Math.sin(t * 3 - i * 0.75) * 2.4 * (i / 8);
    for (const [col, y0] of [['#2f6fb5', -93], ['#ffd23f', -79.5]]) {
      c.fillStyle = col; c.beginPath(); c.moveTo(1.8, y0);
      for (let i = 0; i <= 8; i++) c.lineTo(1.8 + i * 5.6, y0 + wv(i));
      for (let i = 8; i >= 0; i--) c.lineTo(1.8 + i * 5.6, y0 + 14 + wv(i));
      c.closePath(); c.fill();
    }
  },
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
  cattree(c) {
    const carpet = '#e3cfae', edge = '#c9b08a', sisal = '#cfae78', rope = '#a8864f';
    const post = (x, y0, y1) => { c.fillStyle = sisal; c.fillRect(x - 5, y1, 10, y0 - y1); c.strokeStyle = rope; c.lineWidth = 1; for (let y = y1 + 3; y < y0; y += 4) { c.beginPath(); c.moveTo(x - 5, y); c.lineTo(x + 5, y - 1.5); c.stroke(); } };
    const plat = (x0, x1, y) => { c.fillStyle = edge; rr(c, x0, y - 1, x1 - x0, 7, 3); c.fillStyle = carpet; rr(c, x0, y - 5, x1 - x0, 6, 3); };
    post(-16, -6, -50); post(-12, -50, -88); post(24, -6, -32);
    c.fillStyle = carpet; rr(c, 2, -32, 36, 27, 4);
    c.fillStyle = '#5a4630'; circ(c, 20, -17, 8);
    plat(-42, 44, -2); plat(0, 42, -32); plat(-40, 4, -50); plat(-32, 12, -88);
    c.strokeStyle = '#8a7566'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(8, -84); c.lineTo(8, -66); c.stroke();
    c.fillStyle = '#ff7aa8'; circ(c, 8, -63, 4.5);
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
      // bees busy around him
      for (let i = 0; i < 4; i++) {
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
      const r = (t * 0.6) % 1; c.strokeStyle = `rgba(255,255,255,${0.7 * (1 - r)})`; c.lineWidth = 1.4; c.beginPath(); c.ellipse(112, 2, 6 + r * 14, (6 + r * 14) * 0.35, 0, 0, 7); c.stroke();
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
      const fl = [[-86, '#e2574c'], [-76, '#ffd23f'], [-66, '#ff7aa8'], [-56, '#ffffff'], [-46, '#9b6bd6'], [-38, '#e2574c'], [-81, '#ff7aa8'], [-61, '#ffd23f'], [-50, '#5aa9e6']];
      fl.forEach(([fx, col], i) => {
        const fy = i > 5 ? 6 : -1, h = 16 + (i % 3) * 5, sway = Math.sin(t * 1.4 + i) * 1.5;
        c.strokeStyle = '#4f8f3a'; c.lineWidth = 2; c.beginPath(); c.moveTo(fx, fy); c.lineTo(fx + sway, fy - h); c.stroke();
        c.fillStyle = '#5fa046'; ell(c, fx + 3, fy - h * 0.45, 4, 1.8);
        c.fillStyle = col; for (let k = 0; k < 5; k++) { const a = k * 1.2566; circ(c, fx + sway + Math.cos(a) * 3.4, fy - h + Math.sin(a) * 3.4, 2.6); }
        c.fillStyle = '#f2b51d'; circ(c, fx + sway, fy - h, 2);
      });
    } else {
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
  c.fillStyle = '#5b4636'; rr(c, -9 + sw, -13 - la, 7, 13, 2.5); rr(c, 2 - sw, -13 - lb, 7, 13, 2.5);
  c.fillStyle = '#3f3027'; rr(c, -10 + sw, -3.5 - la, 9, 3.5, 1.7); rr(c, 1 - sw, -3.5 - lb, 9, 3.5, 1.7);
  c.rotate(m * Math.sin(w) * 0.025);
  c.fillStyle = L.skirt;
  if (L.dress) { poly(c, [[-13, -32 + bob], [13, -32 + bob], [19, -8 + bob], [-19, -8 + bob]]); c.fillStyle = L.trim; c.fillRect(-18, -12 + bob, 36, 2.5); }
  else rr(c, -14, -31 + bob, 28, 22, 6);
  if (!L.noArms) for (const sx of [-15.5, 15.5]) {   // arms swing from the shoulder
    c.save(); c.translate(sx, -47 + bob); c.rotate(sx > 0 && L.armR !== undefined ? L.armR : sx < 0 && L.armL !== undefined ? L.armL : arm);
    c.fillStyle = L.shirt; rr(c, -3.5, -1, 7, 18, 3); c.fillStyle = L.trim; c.fillRect(-3.5, 13, 7, 2.5);
    c.fillStyle = L.skin; circ(c, 0, 19, 3.5); c.restore();
  }
  c.fillStyle = L.shirt; rr(c, -14, -51 + bob, 28, 26, 8);
  c.fillStyle = L.trim; c.fillRect(-2 + fx * 0.5, -49 + bob, 4, 18); c.fillRect(-14, -30 + bob, 28, 3);
  for (let i = 0; i < 3; i++) { c.fillRect(-6 + fx * 0.5, -46 + i * 6 + bob, 2, 2); c.fillRect(4 + fx * 0.5, -46 + i * 6 + bob, 2, 2); }
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
    c.fillStyle = L.hair; circ(c, 0, -63.5 + bob, 14.8);
    if (L.long) rr(c, -15.5, -66 + bob, 31, 30, 10);
    c.globalAlpha = 1;
  }
  if (L.hat === 'scarf') {
    c.fillStyle = L.hatCol; c.beginPath(); c.arc(0, -64 + bob, 15.8, Math.PI * 0.98, Math.PI * 0.02); c.fill();
    poly(c, [[-14, -62 + bob], [-10, -50 + bob], [-16, -52 + bob]]); poly(c, [[14, -62 + bob], [10, -50 + bob], [16, -52 + bob]]);
    c.fillStyle = '#fffdf5'; for (let i = -2; i <= 2; i++) circ(c, i * 5, -75 + Math.abs(i) * 1.6 + bob, 1.3);
  } else if (L.hat === 'straw') {
    c.fillStyle = L.hatCol; ell(c, 0, -73 + bob, 22, 6); rr(c, -11, -86 + bob, 22, 14, 6);
    c.fillStyle = '#8a5a2b'; c.fillRect(-11, -76 + bob, 22, 2.5);
  } else if (L.hat === 'wreath') {
    const cols = [L.hatCol, '#f2c230', '#ffffff', '#e2574c', '#5aa9e6'];
    for (let i = 0; i < 7; i++) { const a = Math.PI * (1.08 + i * 0.14); c.fillStyle = cols[i % 5]; circ(c, Math.cos(a) * 14.5, -65 + Math.sin(a) * 14.5 + bob, 3.6); }
  }
  c.restore();
}
const ME = { skin: '#f7d6b8', shirt: '#ffffff', trim: '#d43a3a', skirt: '#c0392b', hair: '#f4d35e', hat: 'none', long: true, dress: true };
// The same villager seen from the side, facing right (mirror it for left): one eye, a little nose, hair
// down her back, legs striding one past the other, the far arm and leg a shade darker behind her.
function personSide(c, x, y, L, t, moving, sc, ph) {
  const k = (L.small ? 0.78 : 1) * (sc || 1), m = +moving || 0, w = ph === undefined ? t * 12 : ph;
  c.save(); c.translate(x, y); c.scale(k, k);
  const bob = -m * Math.abs(Math.sin(w)) * 2.6 + (1 - m) * Math.sin(t * 2) * 0.8;
  const st = m * Math.sin(w) * 6, la = m * Math.max(0, Math.cos(w)) * 3.5, lb = m * Math.max(0, -Math.cos(w)) * 3.5;
  const arm = m * Math.sin(w) * 0.55 + (1 - m) * Math.sin(t * 2) * 0.025;
  const blink = (t * 0.29 + (L.small ? 0.4 : 0)) % 1 > 0.966;
  c.fillStyle = 'rgba(0,0,0,.16)'; ell(c, 0, 0, 14 - m * 1.5, 5.5);
  const leg = (dx, lift, far) => {
    c.fillStyle = far ? '#4a392c' : '#5b4636'; rr(c, -3.5 + dx, -13 - lift, 7, 13, 2.5);
    c.fillStyle = far ? '#30251d' : '#3f3027'; rr(c, -4 + dx, -3.5 - lift, 11, 3.5, 1.7);
  };
  const limb = (sw, far) => {
    c.save(); c.translate(0, -47 + bob); c.rotate(sw);
    c.fillStyle = L.shirt; rr(c, -3.5, -1, 7, 18, 3); c.fillStyle = L.trim; c.fillRect(-3.5, 13, 7, 2.5);
    c.fillStyle = L.skin; circ(c, 0, 19, 3.5);
    if (far) { c.fillStyle = 'rgba(60,40,30,.22)'; rr(c, -3.5, -1, 7, 23.5, 3); }
    c.restore();
  };
  leg(-st, lb, true);
  if (!L.noArms) limb(-arm, true);
  if (L.long) { c.fillStyle = L.hair; rr(c, -16, -74 + bob, 19, 44, 10); }
  leg(st, la, false);
  c.fillStyle = L.skirt;
  if (L.dress) { poly(c, [[-10, -32 + bob], [10, -32 + bob], [14, -8 + bob], [-13, -8 + bob]]); c.fillStyle = L.trim; c.fillRect(-13, -12 + bob, 27, 2.5); }
  else rr(c, -10, -31 + bob, 20, 22, 6);
  // shirt from the side: embroidered collar and hem, no front placket (that faces away from us)
  c.fillStyle = L.shirt; rr(c, -9, -51 + bob, 18, 26, 7);
  c.fillStyle = L.trim; c.fillRect(-9, -30 + bob, 18, 3); c.fillRect(-2, -51 + bob, 9, 2.5);
  for (let i = 0; i < 3; i++) c.fillRect(-4 + i * 4, -27 + bob, 2, 1.5);
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
  } else if (L.hat === 'wreath') {
    const cols = [L.hatCol, '#f2c230', '#ffffff', '#e2574c', '#5aa9e6'];
    for (let i = 0; i < 6; i++) { const ang = Math.PI * (1.02 + i * 0.15); c.fillStyle = cols[i % 5]; circ(c, Math.cos(ang) * 14.5, hy - 2 + Math.sin(ang) * 14.5, 3.6); }
  }
  if (!L.noArms) limb(arm, false);
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
function pondPath(c, grow, stroke) {
  c.beginPath();
  for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, w = pondWob(a); const px = (POND.x + Math.cos(a) * (POND.rx * w + grow)) * T, py = (POND.y + Math.sin(a) * (POND.ry * w + grow)) * T; i ? c.lineTo(px, py) : c.moveTo(px, py); }
  c.closePath(); if (stroke) c.stroke(); else c.fill();
}
const isRoad = (x, y) => (y === 14 && x >= 1 && x <= 34) || (x === 18 && y >= 6 && y <= 23) || (x === 7 && y >= 11 && y <= 13) || (x === 25 && y >= 11 && y <= 13) || (x >= 16 && x <= 21 && y >= 15 && y <= 19);

const ents = [];
// Whether a spot is on the road or within m tiles of it (the road is drawn a little wider than its tiles).
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
  rect(23, 8, 26, 10);
  add({ w: 'khata', k: 'oliaHome', x: 25, y: 11, s: 3.7 });
  add({ w: 'kurka', x: 27.6, y: 11.8, kind: 'animal', r: 1.1, give: 'yaitse', cd: 90, olias: true });   // Grandma's hens
  add({ w: 'kurka', x: 28.4, y: 12.6, kind: 'animal', r: 1.1, give: 'yaitse', cd: 90, olias: true });
  add({ w: 'piven', x: 27.2, y: 12.9, kind: 'animal', r: 1.2 });
  add({ w: 'kit', x: 22.4, y: 12.3, kind: 'animal', r: 0.8 });
  add({ w: 'kit', x: 12.4, y: 13.2, kind: 'animal', r: 1.2, s: 0.9 });
  add({ w: 'kit', x: 17.2, y: 20.6, kind: 'animal', r: 1.2, s: 0.85 });
  add({ w: 'kit', x: 8.6, y: 15.6, kind: 'animal', r: 1.0, s: 0.8 });
  add({ w: 'svynia', x: 29.4, y: 9.8, kind: 'animal', r: 1.0 });
  // Landmarks.
  rect(29, 3, 31, 5); add({ w: 'tserkva', x: 30.5, y: 6, s: 5.4 });
  add({ w: 'leleka', x: 21.5, y: 7, s: 2.6, solid: true });
  rect(10, 2, 12, 4); add({ w: 'mlyn', x: 11.5, y: 5, s: 4.5, spin: true });
  // Market square.
  rect(17, 16, 21, 16); add({ w: 'rynok', x: 19.5, y: 17, s: 4.3, kind: 'shop' });
  add({ w: 'lavka', x: 16.5, y: 18.9, s: 1.3, solid: true });
  // Pond.
  add({ w: 'stavok', k: 'pond', x: POND.x, y: POND.y + 0.2, s: 1, kind: 'pond', flat: true });
  add({ w: 'choven', x: 32.2, y: 22.75, s: 1.4, flat: true });
  add({ w: 'ryba', x: 28.3, y: 21.6, s: 0.8, kind: 'animal', r: 0.8, water: true, give: 'ryba', cd: 60, hide: true });
  add({ w: 'kachka', x: 30.6, y: 19.4, kind: 'animal', r: 1.0, water: true });
  add({ w: 'kachka', x: 28.6, y: 19.9, kind: 'animal', r: 0.8, water: true });
  add({ w: 'zhaba', x: 26.3, y: 23.2, s: 0.7, kind: 'animal', r: 0.5 });
  // Pasture.
  add({ w: 'korova', x: 30.0, y: 12.2, s: 1.4, kind: 'animal', r: 1.3, give: 'moloko', cd: 120, olias: true });   // Grandma's cow
  add({ w: 'kin', x: 32.6, y: 13.0, s: 1.5, kind: 'animal', r: 1.3 });
  add({ w: 'koza', x: 28.6, y: 13.4, s: 1.1, kind: 'animal', r: 0.9 });
  // Ukrainian touches: hollyhocks by the cottages, kalyna bushes, a pysanka basket and a bandura at the market.
  for (const [x, y] of [[5.4, 11.15], [8.6, 11.15], [23.4, 11.15], [26.6, 11.15], [8.8, 19.2]]) add({ w: 'malva', x, y, s: 1.15 });
  for (const [x, y] of [[3.6, 15.4], [31.4, 17.4]]) add({ w: 'kalyna', x, y, s: 1.2, solid: true, give: 'kalyna', cd: 150, hide: true });
  add({ w: 'pysanka', x: 20.3, y: 17.14, s: 0.6 });   // a basket of pysanky on the ground in front of the stall, by the right-hand crate
  for (const [x, y] of [[10.6, 24.1], [11.4, 24.8], [10.9, 25.5], [12.1, 24.4], [11.7, 25.6], [12.5, 25.1]]) add({ w: 'mak', x, y, s: 0.8, give: 'mak', cd: 150, hide: true });           // poppies beside the sunflowers
  for (const [x, y] of [[34.3, 21.5], [34.3, 22.2], [34.3, 22.9], [34.3, 23.6], [34.3, 24.3], [33.2, 25.2]]) add({ w: 'pshenytsia', x, y, s: 1.0, give: 'pshenytsia', cd: 150, hide: true });   // a strip of wheat
  for (const [x, y] of [[4.5, 11.5], [22.6, 11.5], [27.2, 11.35], [17.3, 19.7]]) add({ w: 'chornobryvtsi', x, y, s: 0.8 });   // marigolds by the doors
  for (let i = 0; i < 2; i++) add({ w: 'tyn', x: 27.5 + i, y: 10.95, s: 1, solid: true, quiet: i !== 0, labelX: 28 });   // Grandma's wattle fence
  add({ w: 'prapor', x: 21.95, y: 15.95, s: 2.3, solid: true });
  add({ w: 'lastivka', x: 12.6, y: 6.9, s: 0.7, kind: 'fly', cx: 12.6, cy: 6.9, ph: 1.3, swoop: true });
  // The bandura and a wreath lean against the ends of Oksana's market stall.
  add({ w: 'bandura', x: 17.5, y: 17.06, s: 0.95, lean: 0.16 });
  add({ w: 'vinok', x: 21.55, y: 17.06, s: 0.62, lean: -0.12 });
  // Beehives and the sunflower field.
  for (let i = 0; i < 3; i++) add({ w: 'vulyk', x: 4.5 + i * 1.5, y: 19.9, s: 1.3, solid: true });
  for (let i = 0; i < 3; i++) add({ w: 'bdzhola', x: 5 + i * 1.3, y: 18.6, s: 0.5, kind: 'fly', cx: 5 + i * 1.3, cy: 18.6, ph: i * 2.1 });
  for (let y = 23; y <= 25; y++) for (let x = 3; x <= 9; x++) add({ w: 'soniashnyk', x: x + 0.5, y: y + 0.85, s: 1.25, give: 'soniashnyk', cd: 150, hide: true, owner: 'bohdan' });
  // Trees, bushes, stones, flowers, mushrooms, butterflies.
  for (const [x, y] of [[2.5, 6.9], [14.5, 6.9], [20.5, 3.9], [25.5, 4.9], [33.5, 8.9], [2.5, 17.9], [12.5, 25.9], [22.5, 25.9], [33.5, 25.9], [15.5, 2.9], [7.5, 3.9], [27.5, 2.9], [34.5, 17.9], [1.5, 12.9]]) add({ w: 'derevo', ic: '@tree', x, y, s: 2.5, solid: true });
  for (const [x, y] of [[15.5, 9.9], [21.5, 11.9], [3.5, 13.5], [33.5, 15.9], [23.5, 23.9]]) add({ w: 'kushch', x, y, s: 1.1, solid: true });
  for (const [x, y] of [[16.5, 6.9], [32.5, 10.5], [10.5, 17.9]]) add({ w: 'kamin', x, y, s: 0.8, solid: true });
  for (const [x, y] of [[16.3, 8.7], [4.5, 6.5], [22.5, 4.5], [27.5, 6.6], [16.5, 11.6], [9.5, 16.6], [24.5, 16.5], [31.5, 16.4], [12.5, 21.5], [20.5, 22.5]]) add({ w: 'kvitka', x, y, s: 0.8, give: 'kvitka', cd: 90, hide: true });
  for (const [x, y] of [[3.4, 7.5], [15.3, 7.4], [26.4, 5.4], [13.3, 26.3], [32.8, 26.3]]) add({ w: 'hryb', x, y, s: 0.7, give: 'hryb', cd: 120, hide: true });
  for (const [x, y] of [[12, 8], [26, 15.5], [8, 16.5]]) add({ w: 'metelyk', x, y, s: 0.6, kind: 'fly', cx: x, cy: y, ph: x });
  // Villagers.
  add({ w: 'khata', k: 'n_oksana', x: 19.5, y: 18.1, kind: 'npc', npc: 'oksana', s: 1.3 });
  add({ w: 'khata', k: 'n_taras', x: 25.3, y: 21.2, kind: 'npc', npc: 'taras', s: 1.3 });
  add({ w: 'khata', k: 'n_andriiko', x: 14.5, y: 20.7, kind: 'npc', npc: 'andriiko', s: 1.1 });
  add({ w: 'sobaka', x: 15.4, y: 20.78, kind: 'animal', r: 1.0, fetch: true });   // plays fetch with Andriiko
  add({ w: 'khata', k: 'n_bohdan', x: 9.1, y: 20.4, kind: 'npc', npc: 'bohdan', s: 1.3 });
  for (let i = ents.length - 1; i >= 0; i--) if (ents[i].w === 'kit') ents.splice(i, 1);
  for (const ct of D.cats) add({ w: ct.word, k: 'cat_' + ct.id, kind: 'animal', an: 'cat', cat: ct.id, v: ct.v, x: ct.x, y: ct.y, r: 1.3 });
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
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (isRoad(x, y)) {
    for (let i = 0; i < 2; i++) { c.fillStyle = 'rgba(250,240,208,.8)'; ell(c, x * T + r() * T, y * T + r() * T, 9 + r() * 9, 4 + r() * 3); }
    for (let i = 0; i < 3; i++) { c.fillStyle = r() < 0.5 ? '#d9c390' : '#cdb57e'; ell(c, x * T + r() * T, y * T + r() * T, 2 + r() * 2.5, 1.5 + r() * 1.5); }
  }
  // tufts of grass
  c.lineCap = 'round';
  for (let i = 0; i < 1700; i++) {
    const x = r() * GW, y = r() * GH, dk = r() < 0.55, h = 6 + r() * 6;
    if (onRoad(x, y) || inPond(x / T, y / T, 0.45)) continue;
    c.strokeStyle = dk ? '#6bb552' : '#b4e88a'; c.lineWidth = 2; c.beginPath();
    for (let j = -1; j <= 1; j++) { c.moveTo(x + j * 3, y); c.quadraticCurveTo(x + j * 4, y - h * 0.6, x + j * 6.5, y - h - (j ? 0 : 3)); }
    c.stroke();
  }
  // little meadow flowers with petals
  for (let i = 0; i < 300; i++) {
    const x = r() * GW, y = r() * GH, col = ['#ffffff', '#ffe36e', '#ffb3c7', '#d9c2ff'][Math.floor(r() * 4)], pr = 2 + r() * 1.2;
    if (onRoad(x, y) || inPond(x / T, y / T, 0.45)) continue;
    c.fillStyle = col; for (let k = 0; k < 5; k++) circ(c, x + Math.cos(k * 1.257) * pr, y + Math.sin(k * 1.257) * pr, pr * 0.85);
    c.fillStyle = col === '#ffe36e' ? '#f08a2c' : '#ffd23f'; circ(c, x, y, pr * 0.7);
  }
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
// Chimney smoke: soft puffs that rise, drift and fade.
function smoke(c, x, y, t, k) {
  for (let i = 0; i < 5; i++) { const f = (t * 0.15 + i / 5) % 1; c.fillStyle = `rgba(255,255,255,${0.55 * (1 - f) * Math.min(1, f * 6)})`; circ(c, x + (Math.sin(f * 5 + i) * 7 + f * 26) * k, y - f * 70 * k, (5 + f * 13) * k); }
}

// ------------------------------------------------------------------ little effects
// Dust at your feet, sparkles and the thing itself floating up when you pick something, hearts, tap rings.
// Positions are in tiles.
const fx = [];
// Optional finery. On a slow phone the game turns these off by itself to stay smooth (see frame()).
const GFX = window.__gfx = { cloud: 1, water: 1, smoke: 1, motes: 1, sway: 1 };
function fxAdd(o) { if (fx.length < 160) fx.push(Object.assign({ a: 0, life: 0.6, vx: 0, vy: 0, g: 0, s: 6, d: 0 }, o)); }
function fxDust(x, y) { for (let i = 0; i < 2; i++) fxAdd({ k: 'dust', x: x + rnd(-0.1, 0.1), y: y - 0.02, vx: rnd(-0.25, 0.25), vy: rnd(-0.35, -0.1), life: rnd(0.35, 0.55), s: rnd(4, 7) }); }
function fxBurst(x, y, ic) {
  for (let i = 0; i < 10; i++) { const a = i / 10 * 6.283 + rnd(-0.2, 0.2), v = rnd(1.1, 2.3); fxAdd({ k: 'star', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.8, g: 3, life: rnd(0.45, 0.8), s: rnd(5, 9), col: pick(['#ffd23f', '#fff3b0', '#ff9f43', '#ffffff']) }); }
  if (ic) fxAdd({ k: 'icon', ic, x, y, vy: -1.2, life: 1.1, s: 36 });
}
function fxHearts(x, y) { for (let i = 0; i < 6; i++) fxAdd({ k: 'icon', ic: '❤️', x: x + rnd(-0.4, 0.4), y: y - rnd(0, 0.4), vx: rnd(-0.3, 0.3), vy: rnd(-1.4, -0.8), life: rnd(0.8, 1.3), s: rnd(15, 23), d: i * 0.07 }); }
function fxTap(x, y, hit) { fxAdd({ k: 'ring', x, y, life: 0.45, s: hit ? 34 : 24 }); }
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
function sitPal(v) {
  const V = VAR[v], tri = v === 'trykolirna', rb = v === 'rudobilyi';
  if (rb) return { body: V.col, a: '#f0a24c', b: '#f0a24c', eye: V.eye, chub: 1, fluffy: false, bib: false, tail: '#f0a24c', earR: 'a', pb: [[-12, -38, 11, 'a'], [12, -24, 7, 'a']], ph: [[-9, -80, 10, 'a'], [11, -82, 6, 'a']] };
  return {
    body: V.col, a: tri ? '#f0a24c' : V.dark, b: tri ? '#3d373c' : V.dark, eye: V.eye, chub: 1, fluffy: false, bib: v === 'chornobila', tail: V.col, earR: tri ? 'b' : 'body',
    pb: tri ? [[-10, -36, 10, 'a'], [10, -22, 8, 'b']] : V.stripes ? [[-16, -40, 5, 'a'], [-4, -48, 5, 'a'], [10, -44, 5, 'a'], [18, -30, 5, 'a']] : [],
    ph: tri ? [[-10, -78, 8, 'a'], [10, -76, 7, 'b']] : V.stripes ? [[-6, -90, 3.5, 'a'], [0, -92, 3.5, 'a'], [6, -90, 3.5, 'a']] : [],
  };
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
  const leg = (hx, off, col) => {
    const p = ((cyc + off) % 1 + 1) % 1, th = -amp * Math.cos(p * 6.283) * wk;
    const kn = (p > 0.5 ? Math.sin((p - 0.5) * 6.283) : 0) * 0.95 * wk + rest * 0.5;
    const U = G * 0.52, Lo = G * 0.5;
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
function drawAnimal(c, x, y, e, t) {
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
    note: `<b>${ct.line}</b>${st < 2 ? `<br>${ct.lineEn}` : `<span class="xl"><br>${ct.lineEn}</span>`}${!has ? xl(`<br><small>${sourceHint(ct.wants)}</small>`) : ''}`,
    clips: ['c_' + ct.id],
    acts: has ? [{ k: 'give', fn: () => {
      S.bag[ct.wants]--; S.cats[ct.id] = 1; S.hearts += 2; { const ce = ents.find(q => q.cat === ct.id); if (ce) fxHearts(ce.x, ce.y - 0.6); } learn(ct.wants); useWord(ct.wants, true);
      hud(); save(); closeSheet(); toast(`❤️ ${ct.name}!  +2 ❤️`); say('p_mur'); blip(990, 0.15);
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
function findPath(tx, ty, ent) {
  const sx = Math.floor(P.x), sy = Math.floor(P.y);
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
  const en = hideEn || stage() >= 3 ? `<button class="peek" data-a="peek">👁 ${D.ui.show[0]}</button>` : `<div class="en">${w.en}</div>`;
  openSheet(`<div class="card">
    ${isNew ? `<div class="tag">✨ ${PH.nove_slovo.uk}${stage() >= 3 ? xl(' · ' + PH.nove_slovo.en) : ''}</div>` : ''}
    <img class="big" src="${iconURL(id)}" alt="">
    <div class="word">${w.uk}</div>
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
    if (!cur.peeked) { st.l = Math.min(5, st.l + 1); st.d = now() + IV[st.l]; } else st.d = now() + IV[2];   // peeked: try again in a few minutes
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
const HEN_SPOTS = [[9.7, 12.95], [10.3, 12.4], [12.7, 12.45], [13.2, 13.0]], COW_SPOT = [11.5, 12.75];   // in front of the cottage fence, between it and the road
const farmN = k => (S.farm && S.farm[k]) || 0;
let churnUntil = 0;
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
  const has = !!S.gear.vudka, st = stage();
  wordCard(e.w, has
    ? { acts: [{ k: 'fish', fn: startFishing }] }
    : { note: `🎣 <b>${PH.need_rod.uk}</b>${xl(`<br>${PH.need_rod.en} Buy one at the market («${D.ui.tools[0]}» tab).`)}`, clips: ['p_need_rod'] });
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
  if (e.kind === 'npc') return talk(NPC[e.npc]);
  if (e.kind === 'plot') return plotSheet(e.i);
  if (e.kind === 'shop') { if (learn('rynok')) say('w_rynok'); else reviewed('rynok'); return shop(); }
  if (e.k === 'oliaHome') return wordCard('khata', { note: `🏠 <b>Хата баби Олі</b>${xl(" · Grandma Olia's cottage. She is inside, cooking.")}`, acts: [{ k: 'enter', fn: enterOlia }] });
  if (e.kind === 'home') return wordCard('khata', { note: `🏠 <b>${PH.moia_khata.uk}</b>${xl(' · This is your cottage.')}`, clips: ['p_moia_khata'], acts: [{ k: 'enter', fn: enterHome }] });
  if (e.w === 'krynytsia') {
    const have = S.bag.voda || 0;
    return wordCard('krynytsia', { note: `💧 ${have} / ${WATER_MAX}${xl((have < WATER_MAX ? ' · Fill your can here.' : ' · Your can is full.'))}`, acts: have < WATER_MAX ? [{ k: 'fill', fn: () => {
      const add = Math.min(WELL_GIVES, WATER_MAX - have); S.bag.voda = have + add; learn('voda'); hud(); bumpWater(); save(); closeSheet(); toast(`💧 +${add} ${W.voda.uk}  (${S.bag.voda} / ${WATER_MAX})`); say('w_voda'); blip(700, 0.12);
    } }] : [] });
  }
  if (e.k === 'my_churn') return churnCard();
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
  if (!p.c) {
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
const owned = k => shopTab === 'farm' ? farmN(k) >= FARM_MAX[k] : (shopTab === 'home' || shopTab === 'cats' || shopTab === 'tools') && ((S.home[k] || 0) > 0 || !!S.decor[k] || !!S.gear[k]);
const sellPrice = id => { if (id === 'ryba') return 4;   // a fish takes a rod and some patience
  for (const t of ['food', 'seeds']) if (D.shop[t][id]) return Math.max(1, Math.floor(D.shop.food[id] ? D.shop.food[id] / 2 : 3)); return 2; };   // things you simply pick (flowers, mushrooms, berries) sell for less
let shopShown = null;   // the tab the shop was last drawn on
// The shop's title and its row of tabs, shown above every tab (Oksana's helping game too, so you can always
// switch to another tab). Redrawing rebuilds the row, which would jump back to the first tab: shopTabsKeep()
// puts it back where it was and makes sure the chosen tab is fully in view.
function shopHead() {
  const tabs = ['food', 'seeds', 'tools', 'farm', 'home', 'cats', 'sell', 'help'];
  const tabBtn = k => `<button class="tab ${shopTab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${D.ui[k][0]}${stage() < 3 ? `<small>${D.ui[k][1]}</small>` : ''}</button>`;
  return `<h3><span><span class="uk">${W.rynok.uk}</span> ${stage() < 2 ? `<small>${W.rynok.en}</small>` : ''}</span><span>💰 ${S.coins} ₴</span></h3><div class="tabs">${tabs.map(tabBtn).join('')}</div>`;
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
  if (shopTab === 'help') return helpRound(0);
  if (shopTab === 'sell') {
    const items = Object.keys(S.bag).filter(k => S.bag[k] > 0);
    body = items.length ? `<div class="grid">${items.map(k => `<button class="it" data-a="sell" data-v="${k}"><span class="q">${S.bag[k]}</span><img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div><div class="e">+${sellPrice(k)} ₴</div></button>`).join('')}</div>` : `<div class="muted">🧺 ${D.ui.empty[0]}${stage() < 3 ? ' · ' + D.ui.empty[1] : ''}</div>`;
  } else {
    const list = D.shop[shopTab];
    body = `<div class="grid">${Object.keys(list).map(k => { const had = owned(k); return `<button class="it ${shopSel === k ? 'sel' : ''} ${had ? 'owned' : ''}" data-a="pick" data-v="${k}">${shopTab === 'seeds' ? '<span class="q">🌱</span>' : shopTab === 'farm' ? `<span class="q">${farmN(k)}/${FARM_MAX[k]}</span>` : ''}<img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div>${known(k) < 2 ? `<div class="e">${W[k].en}</div>` : ''}${shopTab === 'seeds' ? `<div class="e">🌱 ${W.nasinnia.uk}${stage() < 3 ? ' · seeds' : ''}</div>` : ''}<div class="e"><b>${had ? '✓ ' + D.ui.have[0] + (stage() < 3 ? ' · ' + D.ui.have[1] : '') : list[k] + ' ₴'}</b></div></button>`; }).join('')}</div>`;
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
  if (D.shop.seeds[id]) return '🌱 Grow it in your garden. Seeds are at the market.';
  if (D.shop.food[id]) return '🧺 Oksana sells it at the market.';
  if (id === 'kalyna') return '🌿 Kalyna bushes grow in the valley.';
  if (id === 'pshenytsia') return '🌾 Wheat grows in a strip by the pond, on the east side.';
  if (id === 'mak') return '🌺 Poppies grow beside the sunflower field.';
  if (D.shop.home[id]) return '🧺 Oksana sells it at the market, for your cottage.';
  return { yabluko: '🌳 Pick one from the apple tree by your cottage.', kvitka: '🌷 Pick a flower.', hryb: '🍄 Mushrooms grow near the trees.', voda: '💧 Draw some from the well.', ryba: S.gear && S.gear.vudka ? '🎣 Catch one in the pond.' : '🎣 Buy a fishing rod (вудка) at the market, then fish in the pond.' }[id] || '';
}
let dlg = null;
function dialog(npc, steps, i = 0) {
  const st = steps[i];
  if (!st) { dlg = null; return closeSheet(); }
  dlg = { npc, steps, i };
  const s = stage();
  const face = st.me ? faceURL(ME) : faceURL(npc.look);
  const who = st.me ? (s < 3 ? 'Ти · You' : 'Ти') : npc.name + (s < 2 ? ` · ${npc.nameEn}` : '');
  const en = s < 2 ? `<div class="en">${st.en}</div>` : `<button class="peek" data-a="peekLine">👁 ${D.ui.show[0]}</button>`;
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
const MASS = ['boroshno', 'syr', 'maslo', 'sil', 'kapusta', 'kartoplia', 'morkva', 'tsybulia', 'pshenytsia', 'med', 'rys'];
function recipeList(R) {
  return `<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:6px">${R.needs.map(id => { const n = recipeHave(id), full = n >= NEED; return `<span style="position:relative;text-align:center;opacity:${n ? 1 : 0.45}"><img src="${iconURL(id)}" style="width:34px;height:34px;display:block;margin:0 auto" alt=""><span style="font-size:12px;font-weight:800;color:${full ? '#3f8a3a' : '#8a7566'}">${full ? '✓' : n + '/' + NEED}</span></span>`; }).join('')}</div>`;
}
function talkOlia(npc, n, steps) {
  const R = curRecipe(), st = stage();
  if (S.recipe.started !== S.recipe.i) { steps.push(line(npc, 'recipe_' + R.id)); S.recipe.started = S.recipe.i; learn(R.dish); }
  const missing = () => R.needs.filter(x => recipeHave(x) < NEED);
  let handed = 0;
  for (const x of R.needs) {   // hand them over now, so closing the chat early never loses the delivery
    const give = Math.min(S.bag[x] || 0, NEED - recipeHave(x));
    if (give > 0) { S.bag[x] -= give; S.recipe.have[x] = recipeHave(x) + give; handed += give; useWord(x, true); }
  }
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
      en: D.questLine.en.replace('%s', (MASS.includes(next) ? 'some ' : 'a ') + W[next].en),
      clip: `q_${npc.id}_${next}`,
      hint: `${st < 3 ? `<b>${W[R.dish].uk}</b>${st < 2 ? ' · ' + W[R.dish].en : ''}: ` : ''}${recipeTotal(R)}/${R.needs.length * NEED}${recipeList(R)}<div style="margin-top:6px">${(S.seeds[next] || 0) > 0 ? `🌱 <b>${D.ui.plantit[0]}</b>${st < 3 ? `<br>${D.ui.plantit[1].replace('%s', W[next].en)}` : ''}` : sourceHint(next)}</div>`,
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
    <div class="tag">🍽️ ${PH.smachnoho ? PH.smachnoho.uk : 'Смачного!'}</div>
    <div style="display:flex;align-items:flex-end;justify-content:center;gap:4px;margin:4px 0">
      <img src="${faceURL(npc.look)}" style="width:76px;height:76px;border-radius:18px;background:#e8f4d9" alt="">
      <img src="${iconURL(R.dish)}" style="width:150px;height:150px" alt="">
      <img src="${faceURL(ME)}" style="width:76px;height:76px;border-radius:18px;background:#e8f4d9" alt="">
    </div>
    <div class="word" style="font-size:30px">${npc.lines['ready_' + R.id].uk}</div>
    <div id="en">${st < 3 ? `<div class="en">${npc.lines['ready_' + R.id].en}</div>` : `<button class="peek" data-a="peekLine">👁 ${D.ui.show[0]}</button>`}</div>
    <div class="row">${btn('hear', 'v_olia_ready_' + R.id, '🔊', 'round blue')}${btn('eatMeal', '', `${PH.duzhe_smachno.uk}<small class="cen"${st < 3 ? '' : ' style="display:none"'}>${PH.duzhe_smachno.en}</small>`)}</div></div>`);
  say('v_olia_ready_' + R.id);
}

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
      mid = off ? `<div class="hint">${MIC.supported ? 'The microphone is blocked. Allow it in Chrome’s site settings, or skip.' : 'The microphone is not available here. You can skip.'}</div>` : '';
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
    micRefresh(); my.view = 'error'; my.err = e && e.name === 'NotAllowedError' ? 'The microphone is blocked. Allow it in Chrome’s site settings, or skip.' : 'I couldn’t use the microphone. Try again, or skip.'; return spRender();
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
  if (npc.id === 'olia') tutEvent('olia');
  if (npc.id === 'olia') return talkOlia(npc, n, steps);
  if (npc.id === 'oksana') { steps[steps.length - 1].after = () => setTimeout(shop, 50); save(); return dialog(npc, steps); }
  const quest = id => ({ uk: D.payLine.uk.replace('%s', W[id].acc || W[id].uk), en: D.payLine.en.replace('%s', (MASS.includes(id) ? 'some ' : 'a ') + W[id].en).replace('a a', 'an a').replace('a o', 'an o').replace('a e', 'an e'), clip: `qp_${npc.id}_${id}`, hint: (stage() < 2 ? `<img src="${iconURL(id)}" style="width:34px;height:34px;vertical-align:middle" alt=""> ` : '') + sourceHint(id) });
  if (n.q) {
    if ((S.bag[n.q] || 0) > 0) {
      const item = n.q;
      const thanks = line(npc, 'thanks');
      thanks.after = () => { toast('+6 💰  +1 ❤️'); blip(990, 0.15); const ne = ents.find(q => q.npc === npc.id); if (ne) { fxHearts(ne.x, ne.y - 1.3); fxBurst(ne.x, ne.y - 1, '💰'); } };
      S.bag[item]--; S.coins += 6; S.hearts++; n.q = null; useWord(item, true); hud(); setGuide(); save();
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
    const item = wants[0];
    n.q = item; learn(item); setGuide();
    steps.push(quest(item));
  }
  save();
  dialog(npc, steps);
}

// ------------------------------------------------------------------ the guide (gentle tutorial, then your errands)
const TUT = [
  { p: 'i_explore', ev: 'word', need: 5, en: 'Tap things around you to learn their names.' },
  { p: 'i_talk', ev: 'olia', en: 'Follow the road east to the other cottage, tap it and go in.' },
  { p: 'i_plant', ev: 'plant', en: 'Tap a garden bed beside your cottage.' },
  { p: 'i_water', ev: 'water', en: 'Tap the bed again. Each watering uses one 💧; refill at the well.' },
  { p: 'i_harvest', ev: 'harvest', en: 'Give it a moment, then tap the bed.' },
  { p: 'i_market', ev: 'buy', en: 'Find the striped stall on the square and buy something.' },
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
let guideClip = '', guideEnOn = false, guideKey = '';
function setGuide() {
  const g = $('#guide'), s = TUT[S.tut], st = stage();
  let uk, en, full;
  const active = D.npcs.filter(n => S.npc[n.id] && S.npc[n.id].q && !S.npc[n.id].mad);
  if (s.ev) {
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
  for (const [id, txt] of [['#coins', `💰 ${S.coins}`], ['#hearts', `❤️ ${S.hearts}`], ['#water', `💧 ${S.bag.voda || 0}`]]) {
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
  learn('koshyk');
  openSheet(`<h3><span><span class="uk">${W.koshyk.uk}</span> ${stage() < 2 ? `<small>${W.koshyk.en}</small>` : ''}</span><span>💰 ${S.coins} ₴</span></h3>${all.length ? `<div class="grid">${all.join('')}</div>` : `<div class="muted">${D.ui.empty[0]}${stage() < 3 ? ' · ' + D.ui.empty[1] : ''}</div>`}`);
}
function wordsSheet() {
  const ids = Object.keys(S.words).sort((a, b) => S.words[a].l - S.words[b].l);
  const m = mastered(), st = stage();
  const title = ['', 'Гість · Guest', 'Сусід · Neighbour', 'Свій · One of us'][st];
  const next = st === 1 ? 12 : st === 2 ? 40 : D.words.length;
  openSheet(`<h3><span><span class="uk">${D.ui.words[0]}</span> ${st < 3 ? `<small>${D.ui.words[1]}</small>` : ''}</span><small>🐈 ${catFriends()}/${D.cats.length} · ${ids.length} / ${D.words.length}</small></h3>
    <div style="font-weight:800">${title}</div>
    <div class="bar"><i style="width:${Math.min(100, Math.round(m / next * 100))}%"></i></div>
    ${st < 3 ? `<div class="muted" style="padding:0 0 10px;text-align:left">${m} well-known words. At ${next}, ${st === 1 ? 'the villagers stop translating themselves' : 'the village goes fully Ukrainian'}.</div>` : ''}
    ${ids.length ? `<div class="grid">${ids.map(k => `<button class="it" data-a="hearWord" data-v="${k}"><img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div><div class="e">${S.words[k].l < 3 ? W[k].en : '···'}</div><div class="lv">${'●'.repeat(S.words[k].l)}${'○'.repeat(5 - S.words[k].l)}</div></button>`).join('')}</div>` : `<div class="muted">${D.ui.empty[0]}</div>`}`);
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
  pich: { x: 0.072, y: 0.578, s: 0.6, z: 1, hw: 0.85 }, hlechyk: { x: 0.185, y: 0.585, s: 0.3, z: 1, hw: 0.6 },
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
  motanka: { x: 0.25, y: 0.8, s: 0.2, z: 4, hw: 0.4 }, skrynia: { x: 0.6, y: 0.74, s: 0.3, z: 1.6, hw: 0.8 },
  pysanka: { sill: 0.17, s: 0.1, z: 2, wall: true },
  // on the windowsill
  kvity: { sill: 0, s: 0.13, z: 2, wall: true }, chashka: { sill: -0.1, s: 0.09, z: 2, wall: true }, svichka: { sill: 0.1, s: 0.11, z: 2, wall: true },
};
const WIN_X = 0.3;                                    // the window, across the room
const roomU = () => Math.min(cv.width, cv.height * 0.72);
const roomW = () => Math.max(cv.width, roomU() * 3.4); // a phone in portrait sees under half the room at once
const panMax = () => Math.max(0, roomW() - cv.width);
const clampPan = () => { roomX = Math.max(0, Math.min(panMax(), roomX)); };
const BASICS = Object.keys(D.shop.furnished);          // always in the room
const inRoom = () => [...BASICS, ...Object.keys(S.decor).filter(id => DECOR[id] && !BASICS.includes(id))];
// Where an item stands, in room pixels (bottom-centre) plus its tap box.
function decorRect(id) {
  const d = DECOR[id], u = roomU(), RW = roomW(), sz = d.s * u;
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
  mode = 'home'; pickHomeCats();
  $('#exit').innerHTML = lab('exit'); $('#decorBtn').innerHTML = '🪑 ' + lab('decor'); $('#decorBtn').style.display = ''; $('#homebar').style.display = 'flex';
  const mid = DECOR.stil.x * roomW() - cv.width / 2;
  roomX = mid; clampPan();
  // The first few times in, the view glides from one end of the room to the other and settles at the table,
  // so it's clear there's more to see. Touching the screen stops it.
  if (panMax() > 10 && (S.tours || 0) < 3) { S.tours = (S.tours || 0) + 1; save(); roomX = 0; tour = { t0: nowT, mid }; }
  blip(520);
}
function exitHomeNow() { oliaTip = 0; tour = null; mode = 'world'; $('#homebar').style.display = 'none'; blip(440); }
function homeTap(sx, py) {
  const px = sx + roomX;
  const friends = homeCats().map(h => h.ct);
  for (let i = 0; i < friends.length; i++) { const p = catSpot(i); if (Math.abs(px - p.x) < p.s * 0.45 && py < p.y && py > p.y - p.s * 1.05) return wordCard(friends[i].word, { note: `❤️ ${friends[i].name}` }); }
  const ids = inRoom().sort((a, b) => (DECOR[b].wall ? 0 : 10) + DECOR[b].z - (DECOR[a].wall ? 0 : 10) - DECOR[a].z);
  let best = null, bestScore = -1e9;
  for (const id of ids) {
    const r = decorRect(id);
    if (!(px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)) continue;
    const score = ((DECOR[id].wall ? 0 : 10) + DECOR[id].z) * 1e4 - Math.abs(px - r.cx);
    if (score > bestScore) { bestScore = score; best = id; }
  }
  if (best) return wordCard(best, BASICS.includes(best) ? {} : { acts: [{ k: 'putaway', fn: () => { A.decor(best); closeSheet(); } }] });
}
// Three of your cats are at home at any time; the rest are out and about. Each visit picks which three,
// and they're busy: one looks up at you by the table, one is asleep on the bed, one washes itself in the window.
const BED_CAT = [-0.06, 0.42];   // where on the bed the sleeper lies (the middle), as a share of the bed's size
// With a ball or a toy mouse on the floor, a cat plays with it; the toy gets knocked a little each swat.
const playToy = () => S.decor.miachyk ? 'miachyk' : S.decor.myshka ? 'myshka' : null;
const toyNudge = t => -Math.max(0, Math.sin(t * 4 - 0.5)) * roomU() * 0.02;
// The towel hanging off the table swings when the cat bats it (in the table drawing's own units).
const towelSwing = t => -Math.max(0, Math.sin(t * 4 - 0.4)) * 7 + Math.sin(t * 1.3) * 0.8;
const HOME_POSES = ['look', 'sleep', 'groom'];
let homeTrio = null;
function pickHomeCats() {
  const f = D.cats.filter(ct => S.cats[ct.id]);
  for (let i = f.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [f[i], f[j]] = [f[j], f[i]]; }
  homeTrio = f.slice(0, 3).map((ct, i) => ({ ct, pose: HOME_POSES[i] }));
}
function homeCats() {
  if (!homeTrio || homeTrio.some(h => !S.cats[h.ct.id]) || (homeTrio.length < 3 && D.cats.some(ct => S.cats[ct.id] && !homeTrio.some(h => h.ct === ct)))) pickHomeCats();
  return homeTrio;
}
function catSpot(i) {
  // One plays by the table, where the view opens when you come in: batting the towel hanging off it, or the
  // ball or toy mouse once you've bought one. One sleeps in the middle of your bed (or in the cat bed, once
  // bought), and one washes itself on the windowsill (or up on the cat tree, once bought).
  const u = roomU(), mid = DECOR.stil.x * roomW(), v0 = Math.max(0, Math.min(panMax(), mid - cv.width / 2)), v1 = v0 + cv.width;
  const inView = x => x > v0 + u * 0.1 && x < v1 - u * 0.1;
  const pose = (homeCats()[i] || {}).pose;
  if (pose === 'sleep') {
    if (S.decor.lezhanka) { const r = decorRect('lezhanka'); return { x: r.cx + r.sz * 0.05, y: r.by - r.sz * 0.08, s: u * 0.3, sleep: true }; }
    const r = decorRect('lizhko'); return { x: r.cx + r.sz * BED_CAT[0], y: r.by - r.sz * BED_CAT[1], s: u * 0.2, sleep: true };
  }
  if (pose === 'look' && playToy()) { const r = decorRect(playToy()); return { x: r.cx + u * 0.12, y: r.by, s: u * 0.22, play: true }; }   // batting the toy about
  if (pose === 'look') { const r = decorRect('stil'); return { x: r.cx + u * 0.055, y: cv.height * 0.885, s: u * 0.25, towel: true }; }   // batting the towel on the table
  if (pose === 'groom' && S.decor.kihtetochka) { const r = decorRect('kihtetochka'); return { x: r.cx - r.sz * 0.1, y: r.by - r.sz * 0.9, s: u * 0.16 }; }
  if (pose === 'groom') return { x: WIN_X * roomW() - u * 0.06, y: cv.height * 0.462, s: u * 0.15 };
  const offs = [0, -0.3, 0.3, -0.6, 0.6, 0.15], x = Math.max(v0 + u * 0.13, Math.min(v1 - u * 0.13, mid + offs[i % 6] * u));
  return { x, y: cv.height * 0.885, s: pose === 'sleep' ? u * 0.27 : u * 0.25, sleep: pose === 'sleep' };
}
function decorSheet() {
  const ids = Object.keys(DECOR).filter(id => !BASICS.includes(id) && !S.decor[id] && S.home[id] > 0);
  const placedAny = Object.keys(S.decor).some(id => DECOR[id] && !BASICS.includes(id));
  const st = stage();
  openSheet(`<h3><span><span class="uk">${D.ui.decor[0]}</span> ${st < 3 ? `<small>${D.ui.decor[1]}</small>` : ''}</span><span>💰 ${S.coins} ₴</span></h3>` +
    (ids.length
      ? `${st < 3 ? '<div class="muted" style="padding:0 0 10px">Tap something to put it in your cottage. To put something away, tap it in the room.</div>' : ''}<div class="grid">${ids.map(id => `<button class="it" data-a="decor" data-v="${id}">${S.home[id] > 1 ? `<span class="q">${S.home[id]}</span>` : ''}<img src="${iconURL(id)}" alt=""><div class="n">${W[id].uk}</div>${known(id) < 2 ? `<div class="e">${W[id].en}</div>` : ''}</button>`).join('')}</div>`
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
  c.save(); c.clip(); for (const [dx, dy, r, col] of C.pb) { c.fillStyle = C[col]; circ(c, dx * 1.1 + 6, dy * 0.5, r * 1.1); } c.restore();
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
  c.save(); c.clip(); for (const [dx, dy, r, col] of C.ph) { c.fillStyle = C[col]; circ(c, -24 + dx * 0.7, -24 + (dy + 70) * 0.7, r * 0.75); } c.restore();
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
function drawHome(t) {
  const w = cv.width, h = cv.height, c = ctx, u = roomU(), RW = roomW(), wallB = h * 0.56;
  if (tour) {
    const a = t - tour.t0, ease = k => k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, max = panMax();
    if (a < 0.5) roomX = 0;
    else if (a < 2.6) roomX = ease((a - 0.5) / 2.1) * max;
    else if (a < 3.0) roomX = max;
    else if (a < 4.2) roomX = max + ease((a - 3.0) / 1.2) * (tour.mid - max);
    else { roomX = tour.mid; tour = null; }
  }
  clampPan();
  c.save(); c.translate(-roomX, 0);
  // back wall, beams, embroidered border
  c.fillStyle = '#fbf1dc'; c.fillRect(0, 0, RW, wallB);
  c.fillStyle = 'rgba(160,110,60,.10)'; for (let x = 0; x < RW; x += u * 0.11) c.fillRect(x, 0, u * 0.004 + 1, wallB);
  const k = Math.max(10, u / 36), y0 = h * 0.17;
  c.fillStyle = '#8a5a2b'; c.fillRect(0, y0 - k * 0.9, RW, k * 0.5);
  for (let x = 0; x < RW + k; x += k * 2) { c.fillStyle = '#d43a3a'; poly(c, [[x, y0], [x + k * 0.8, y0 + k * 0.8], [x, y0 + k * 1.6], [x - k * 0.8, y0 + k * 0.8]]); c.fillStyle = '#2d2d2d'; circ(c, x + k, y0 + k * 0.8, k * 0.22); }
  // the window onto the valley
  const wx = WIN_X * RW, ww = u * 0.3, wt = h * 0.27, wb = h * 0.45;
  c.save(); c.beginPath(); c.rect(wx - ww / 2, wt, ww, wb - wt); c.clip();
  let g = c.createLinearGradient(0, wt, 0, wb); g.addColorStop(0, '#8fd3f4'); g.addColorStop(1, '#e8f7ff'); c.fillStyle = g; c.fillRect(wx - ww / 2, wt, ww, wb - wt);
  c.fillStyle = '#a6dc7c'; ell(c, wx - ww * 0.2, wb, ww * 0.5, (wb - wt) * 0.32); c.fillStyle = '#8fcf6a'; ell(c, wx + ww * 0.3, wb, ww * 0.5, (wb - wt) * 0.26);
  c.fillStyle = '#fff'; ell(c, wx + ww * 0.15 + Math.sin(t * 0.2) * ww * 0.1, wt + (wb - wt) * 0.25, ww * 0.14, (wb - wt) * 0.07);
  for (let i = 0; i < 4; i++) sunflower(c, wx - ww * 0.36 + i * ww * 0.24, wb + 2, (wb - wt) * 0.38, t, i);
  c.restore();
  c.strokeStyle = '#3d7cc2'; c.lineWidth = u * 0.022; c.strokeRect(wx - ww / 2, wt, ww, wb - wt);
  c.lineWidth = u * 0.012; c.beginPath(); c.moveTo(wx, wt); c.lineTo(wx, wb); c.moveTo(wx - ww / 2, (wt + wb) / 2); c.lineTo(wx + ww / 2, (wt + wb) / 2); c.stroke();
  c.fillStyle = '#c08a55'; rr(c, wx - ww / 2 - u * 0.03, wb, ww + u * 0.06, u * 0.025, 4);
  // floor, skirting, and the shadow where wall meets floor
  c.fillStyle = '#c99a63'; c.fillRect(0, wallB, RW, h - wallB);
  c.strokeStyle = 'rgba(120,80,40,.28)'; c.lineWidth = Math.max(2, h * 0.003);
  for (let i = 1; i < 9; i++) { const y = wallB + (h - wallB) * (i / 9) ** 1.25; c.beginPath(); c.moveTo(0, y); c.lineTo(RW, y); c.stroke(); }
  c.fillStyle = '#4a90d9'; c.fillRect(0, wallB - h * 0.012, RW, h * 0.014);
  g = c.createLinearGradient(0, wallB, 0, wallB + h * 0.05); g.addColorStop(0, 'rgba(90,60,30,.25)'); g.addColorStop(1, 'rgba(90,60,30,0)'); c.fillStyle = g; c.fillRect(0, wallB, RW, h * 0.05);
  // a warm glow around the lamp or candle
  for (const id of ['lampa', 'svichka']) if (S.decor[id]) { const r = decorRect(id), gy = r.by - r.sz * (id === 'lampa' ? 0.82 : 0.6); g = c.createRadialGradient(r.cx, gy, 0, r.cx, gy, u * 0.7); g.addColorStop(0, 'rgba(255,214,120,.2)'); g.addColorStop(1, 'rgba(255,214,120,0)'); c.fillStyle = g; c.fillRect(0, 0, RW, h); }
  // everything in the room: wall things first, then floor things back to front
  const ids = inRoom().sort((a, b) => (DECOR[a].wall ? 0 : 10) + DECOR[a].z - (DECOR[b].wall ? 0 : 10) - DECOR[b].z);
  for (const id of ids) {
    const r = decorRect(id);
    if (!DECOR[id].wall && id !== 'kylym' && !DECOR[id].on && DECOR[id].shelf === undefined) { c.fillStyle = 'rgba(60,40,20,.16)'; ell(c, r.cx, r.by, r.sz * 0.36, r.sz * 0.06); }
    if (DECOR[id].fit) { windowRushnyk(c, r.cx, u * 0.3, h * 0.27, h * 0.45, u); continue; }
    if (id === 'kylym') { c.save(); c.translate(r.cx, r.by); c.scale(1, 0.75); drawIcon(c, W[id].ic, 0, r.sz * 0.42, r.sz); c.restore(); }
    else drawIcon(c, W[id].ic, r.cx + (id === playToy() && homeCats()[0] ? toyNudge(t) : 0), r.by, r.sz, id === 'stil' && !playToy() && homeCats()[0] ? { swing: towelSwing(t) } : undefined);
  }
  homeCats().forEach(({ ct, pose }, i) => { const p = catSpot(i); if (p.sleep) sleepingCat(c, p.x, p.y, p.s, sitPal(ct.v), t); else cat(c, p.x, p.y, p.s, sitPal(ct.v), t, i * 1.3, p.play || p.towel ? 1 : i % 2 ? -1 : 1, pose === 'groom' ? 'groom' : p.play ? 'play' : p.towel ? 'swat' : null); });
  if (ids.length === BASICS.length && stage() < 3) {
    c.fillStyle = 'rgba(74,44,26,.55)'; c.font = `700 ${Math.round(u * 0.036)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('Make it yours: tap 🪑 Прикрасити below.', roomX + w / 2, h * 0.665);
  }
  c.restore();
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
  $('#exit').innerHTML = lab('exit'); $('#decorBtn').style.display = 'none'; $('#homebar').style.display = 'flex';
  // Open on the counter and Grandma; once the dish is ready, on the table.
  const mid = (recipeReady(curRecipe()) ? OX.table : 0.385) * roomW() - cv.width / 2;
  roomX = mid; clampPan();
  tour = null; blip(520);
  setTimeout(() => { if (mode === 'olia' && !sheetOpen()) talk(NPC.olia); }, 500);
  oliaTip = S.oliaTip ? 0 : 1;
}
function oliaTap(sx, py) {
  const px = sx + roomX;
  for (let i = oliaHits.length - 1; i >= 0; i--) { const r = oliaHits[i]; if (px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h) { blip(700, 0.05); return r.fn(); } }
  blip(560, 0.05);
}
function drawOlia(t) {
  const h = cv.height, c = ctx, u = roomU(), RW = roomW(), wallB = h * 0.56, R = curRecipe(), ready = recipeReady(R), st = stage();
  if (tour) {
    const a = t - tour.t0, ease = k => k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, max = panMax();
    const legs = [[tour.mid, 0, 1.8], [0, 0, 0.4], [0, max, 3.6], [max, max, 0.4], [max, tour.mid, 1.8]];
    let k = a, i = 0;
    while (i < legs.length && k > legs[i][2]) { k -= legs[i][2]; i++; }
    if (i >= legs.length) { roomX = tour.mid; tour = null; }
    else { const [p, q, d] = legs[i]; roomX = p + (q - p) * ease(Math.min(1, k / d)); if (oliaWave) oliaWave.pass = i < 2 ? 0 : i < 4 ? 1 : 2; }
  }
  clampPan();
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
  c.fillStyle = '#fdf5e4'; c.fillRect(0, 0, RW, wallB);
  c.fillStyle = 'rgba(190,150,100,.05)'; for (let i = 0; i < 46; i++) ell(c, ((i * 0.618) % 1) * RW, beamB + ((i * 0.377) % 1) * (wallB - beamB), u * 0.2, u * 0.05);
  c.fillStyle = '#efe2c8'; c.fillRect(0, 0, RW, beamT);
  c.fillStyle = 'rgba(120,80,40,.10)'; for (let x = 0; x < RW; x += u * 0.16) c.fillRect(x, 0, u * 0.006 + 1, beamT);
  c.fillStyle = '#7a4e26'; c.fillRect(0, beamT, RW, beamB - beamT);
  c.fillStyle = '#5e3a1b'; c.fillRect(0, beamB - u * 0.009, RW, u * 0.009);
  c.fillStyle = 'rgba(255,230,190,.14)'; c.fillRect(0, beamT, RW, u * 0.007);
  c.strokeStyle = 'rgba(60,35,15,.25)'; c.lineWidth = 1; for (let x = u * 0.1; x < RW; x += u * 0.37) { c.beginPath(); c.moveTo(x, beamT + u * 0.02); c.lineTo(x + u * 0.2, beamT + u * 0.024); c.stroke(); }
  const fk = u * 0.026, fy = beamB + fk * 2.1, vine = x => fy + Math.sin(x / fk * 0.5) * fk * 0.55;
  c.strokeStyle = '#4f8f3a'; c.lineWidth = fk * 0.2; c.beginPath(); for (let x = 0; x <= RW; x += fk) { if (x) c.lineTo(x, vine(x)); else c.moveTo(x, vine(x)); } c.stroke();
  for (let i = 0, x = fk * 3; x < RW; x += fk * 6.28, i++) {
    const y = vine(x);
    leaf(x - fk * 0.7, y, fk * 0.8, Math.PI + 0.5); leaf(x + fk * 0.7, y, fk * 0.8, -0.5);
    if (i % 2) { c.fillStyle = '#3d7cc2'; circ(c, x - fk * 0.5, y - fk * 0.5, fk * 0.36); circ(c, x + fk * 0.4, y - fk * 0.7, fk * 0.36); circ(c, x, y - fk * 0.05, fk * 0.4); }
    else flower(x, y - fk * 0.25, fk * 0.58, '#d43a3a');
    c.fillStyle = '#e2a23a'; circ(c, x + fk * 3.14, vine(x + fk * 3.14) + fk * 0.5, fk * 0.26);
  }

  // ---- the window: lace along the top, the рушник draped over it, geraniums and a pysanka on the sill
  const wx = OX.win * RW, ww = u * 0.3, wb = wallB - u * 0.17, wt = wb - u * 0.27;
  c.save(); c.beginPath(); c.rect(wx - ww / 2, wt, ww, wb - wt); c.clip();
  let g = c.createLinearGradient(0, wt, 0, wb); g.addColorStop(0, '#8fd3f4'); g.addColorStop(1, '#e8f7ff'); c.fillStyle = g; c.fillRect(wx - ww / 2, wt, ww, wb - wt);
  c.fillStyle = '#a6dc7c'; ell(c, wx - ww * 0.2, wb, ww * 0.5, (wb - wt) * 0.3); c.fillStyle = '#8fcf6a'; ell(c, wx + ww * 0.3, wb, ww * 0.5, (wb - wt) * 0.24);
  c.fillStyle = '#fff'; ell(c, wx - ww * 0.1 + Math.sin(t * 0.2) * ww * 0.1, wt + (wb - wt) * 0.3, ww * 0.14, (wb - wt) * 0.07);
  for (let i = 0; i < 3; i++) sunflower(c, wx - ww * 0.3 + i * ww * 0.3, wb + 2, (wb - wt) * 0.34, t, i + 2);
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
  c.fillStyle = '#c4935c'; c.fillRect(0, wallB, RW, h - wallB);
  c.strokeStyle = 'rgba(120,80,40,.28)'; c.lineWidth = Math.max(2, h * 0.003);
  for (let i = 1; i < 9; i++) { const y = wallB + (h - wallB) * (i / 9) ** 1.25; c.beginPath(); c.moveTo(0, y); c.lineTo(RW, y); c.stroke(); }
  c.fillStyle = '#4a90d9'; c.fillRect(0, wallB - h * 0.012, RW, h * 0.014);
  g = c.createLinearGradient(0, wallB, 0, wallB + h * 0.05); g.addColorStop(0, 'rgba(90,60,30,.25)'); g.addColorStop(1, 'rgba(90,60,30,0)'); c.fillStyle = g; c.fillRect(0, wallB, RW, h * 0.05);
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
function update(dt, t, rdt = dt) {
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
  for (const e of ents) {
    if (e.face !== undefined) turnTo(e, e.face, dt, TURN_SLOW[e.an] || 1);
    if (e.npc === 'oksana') oksanaStep(e, dt, t);
    if (e.kind === 'npc') {   // turn to face you (side-on, towards whichever side you're on) while you talk
      const goal = sheetOpen() && talkNpc === e.npc ? (P.x >= e.x ? 1 : -1) : 0;
      e.tv = (e.tv || 0) + (goal - (e.tv || 0)) * (1 - Math.exp(-rdt * 7));   // real time: game time stops while a card is open
      if (Math.abs(e.tv - goal) < 0.002) e.tv = goal;
    }
    if (e.kind === 'animal') {
      // Stand a good while (grazing, looking about, lying down), then stroll somewhere else: turn first, set off
      // gently, slow down on arriving. A new spot is only chosen while standing, never part-way through a walk.
      if (e.fetch) fetchStep(e, dt); else {
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
  c.drawImage(ground, 0, 0);
  if (GFX.water) drawWater(c, t);
  const vw = cv.width / zoom, vh = cv.height / zoom;
  const list = ents.filter(e => !(e.hide && !ready(e)) && e.x * T > camX - 200 && e.x * T < camX + vw + 200 && e.y * T > camY - 100 && e.y * T < camY + vh + 320);
  list.push({ me: true, y: P.ry, x: P.rx });
  list.sort((a, b) => (a.flat ? -1e3 : 0) + a.y - ((b.flat ? -1e3 : 0) + b.y));
  for (const e of list) {
    const x = e.x * T, y = e.y * T;
    if (e.me) {
      // Draw whichever of the four views she is closest to; between views she narrows and lifts a little,
      // so each change of view reads as a turn rather than a swap.
      const q = Math.round((P.va || 0) / (Math.PI / 2)), view = ((q % 4) + 4) % 4, off = (P.va || 0) - q * Math.PI / 2, mid = 1 - Math.abs(Math.cos(2 * off));
      c.save(); c.translate(x, y - mid * 4); c.scale((view === 3 ? -1 : 1) * (1 - mid * 0.4), 1);
      if (view === 1 || view === 3) personSide(c, 0, 0, ME, t, P.wk, 1, P.step * 3.7); else person(c, 0, 0, ME, t, P.wk, 1, P.step * 3.7, { back: view === 2 ? 1 : 0 });
      c.restore(); continue; }
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
    if (e.lift) { drawIcon(c, e.ic, x, y - e.lift * T, s, { t }); continue; }   // resting on top of something, so no ground shadow
    if (!e.flat && e.kind !== 'fly') { c.fillStyle = 'rgba(0,0,0,.13)'; ell(c, x, y, s * (e.ic[0] === '@' ? 0.36 : 0.28), s * 0.09); }
    const hop = e.kind === 'animal' && e.walk ? Math.abs(Math.sin(t * 9 + e.x)) * 3 : e.kind === 'fly' ? Math.sin(t * 9 + e.ph) * 4 : 0;
    if (e.swoop) { c.save(); c.translate(x, y); turnDepth(c, e); c.scale(turnX(e), 1); c.rotate(Math.cos(t * 1.6 + e.ph) * 0.25); drawIcon(c, e.ic, 0, 0, s, { t }); c.restore(); }
    else if (e.w === 'metelyk') drawIcon(c, e.ic, x, y - hop, s, { t: t + e.ph });   // each butterfly flaps on its own beat
    else if (e.lean) { c.save(); c.translate(x, y); c.rotate(e.lean); drawIcon(c, e.ic, 0, 0, s, { t }); c.restore(); }   // propped against something
    else if (e.face === -1 && e.ic[0] !== '@') { c.save(); c.translate(x, 0); c.scale(-1, 1); drawIcon(c, e.ic, 0, y - hop, s); c.restore(); }
    else if ((e.w === 'kvitka' || e.w === 'soniashnyk') && e.ic[0] !== '@') emojiSprite(c, e.ic, x, y, s, GFX.sway ? Math.sin(t * 1.5 + e.x * 2.3 + e.y) * 0.06 : 0, zoom);   // flowers nod in the breeze
    else drawIcon(c, e.ic, x, y - hop, s, { t, fruit: e.give === 'yabluko' ? ready(e) : true, sway: GFX.sway ? Math.sin(t * 1.1 + e.x * 1.7) * 0.028 + Math.sin(t * 2.6 + e.y) * 0.009 : 0 });
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
      else { bubble(c, x, top, 15); drawIcon(c, stage() < 2 && W[ct.wants].ic[0] !== '@' ? W[ct.wants].ic : '❔', x, top + 9, 21); }
      if (S.words[e.w] && known(e.w) <= 1) offer(e, S.cats[e.cat] ? ct.name : W[e.w].uk);
      continue;
    }
    const wd = S.words[e.w];
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
  if (tag) label(c, tag.text, tag.x, tag.y);
  if (P.path.length) { const g = P.path[P.path.length - 1], pu = 0.5 + 0.5 * Math.sin(t * 7); c.strokeStyle = `rgba(255,255,255,${0.55 + 0.3 * pu})`; c.lineWidth = 3; c.beginPath(); c.ellipse(g.x * T, g.y * T, 13 + pu * 3, 7 + pu * 1.6, 0, 0, 7); c.stroke(); c.fillStyle = 'rgba(255,255,255,.4)'; ell(c, g.x * T, g.y * T, 5, 2.7); }
  // cloud shadows drifting over everything
  c.globalAlpha = 0.17;
  if (GFX.cloud) for (let i = 0; i < 3; i++) { const w = 900 + i * 220, x = ((t * 14 + i * 1150) % (MW * T + w * 2)) - w, y = (1 + i * 9.5) * T - 120; if (x + w > camX && x < camX + vw && y + w * 0.5 > camY && y < camY + vh) c.drawImage(cloudSpr, x, y, w, w * 0.5); }
  c.globalAlpha = 1;
  c.setTransform(1, 0, 0, 1, 0, 0);
  // specks of pollen drifting on the air
  if (GFX.motes) for (let i = 0; i < 14; i++) {
    const sp = 14 + (i % 5) * 6, mw = cv.width + 80, mh = cv.height + 80;
    let mx = (i * 173.3 + t * sp - camX * zoom * 0.5) % mw, my = (i * 311.7 + t * sp * 0.35 + Math.sin(t * 0.8 + i) * 20 - camY * zoom * 0.5) % mh;
    if (mx < 0) mx += mw; if (my < 0) my += mh;
    c.fillStyle = `rgba(255,${i % 3 ? 255 : 238},${i % 3 ? 244 : 170},${0.4 + 0.25 * Math.sin(t * 1.7 + i * 2)})`; circ(c, mx - 40, my - 40, (1.3 + (i % 3) * 0.55) * zoom);
  }
}

// ------------------------------------------------------------------ the title screen, drawn
const tcv = $('#tc'), tctx = tcv.getContext('2d');
let fontReady = false;
try { document.fonts.load('900 40px Cozy', 'Котяча Долина Kotiacha Dolyna Cat Valley').then(() => { fontReady = true; }).catch(() => { fontReady = true; }); } catch (e) { fontReady = true; }
function sizeTitle() { const dpr = Math.min(2, window.devicePixelRatio || 1); tcv.width = Math.round(innerWidth * dpr); tcv.height = Math.round(innerHeight * dpr); }
addEventListener('resize', sizeTitle); sizeTitle();
let seedT = 11; const rT = () => (seedT = (seedT * 16807) % 2147483647) / 2147483647;
const DOTS = Array.from({ length: 70 }, () => [rT(), rT(), rT()]);
const INK = '#4a2c1a';
const cozyFont = sz => `900 ${sz}px ${fontReady ? '"Cozy", system-ui, sans-serif' : 'system-ui, sans-serif'}`;

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
  c.save(); c.clip(); for (const [dx, dy, r, col] of C.pb) { c.fillStyle = C[col]; circ(c, dx * ch, dy, r); } c.restore();
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
  // the logo
  const top = H * 0.05;
  if (land) {
    const s1 = fancyText(c, 'Котяча Долина', W / 2, top + H * 0.13, W * 0.6, H * 0.135, t);
    fancyText(c, 'Kotiacha Dolyna', W / 2, top + H * 0.13 + s1 * 0.74, W * 0.36, s1 * 0.4, t, { fill: '#fff8ea', thick: 0.22, bob: 0.02, tilt: 0.02 });
    ribbon(c, 'Cat Valley', W / 2, top + H * 0.13 + s1 * 1.24, s1 * 0.24);
  } else {
    const big = Math.min(W * 0.2, H * 0.1);
    const s1 = fancyText(c, 'Котяча', W / 2, top + big * 1.05, W * 0.84, big, t);
    fancyText(c, 'Долина', W / 2, top + big * 1.05 + s1 * 0.98, W * 0.84, s1, t, { shift: 3 });
    const y3 = top + big * 1.05 + s1 * 1.66;
    fancyText(c, 'Kotiacha Dolyna', W / 2, y3, W * 0.72, s1 * 0.38, t, { fill: '#fff8ea', thick: 0.22, bob: 0.02, tilt: 0.02 });
    ribbon(c, 'Cat Valley', W / 2, y3 + s1 * 0.56, s1 * 0.25);
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
  if (mode === 'home') { ctx.setTransform(1, 0, 0, 1, 0, 0); drawHome(t); }
  else if (mode === 'olia') { ctx.setTransform(1, 0, 0, 1, 0, 0); drawOlia(t); }
  else { update(running && !sheetOpen() ? dt : 0, t, dt); fxUpdate(dt); drawWorld(t); }
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ taps
function hitEnt(wx, wy) {
  let best = null, bd = 1e9;
  for (const e of ents) {
    if (e.hide && !ready(e)) continue;
    const s = Math.max(0.75, e.s), cx = e.x, cy = e.kind === 'pond' ? e.y - 0.2 : e.flat ? e.y : e.y - s * 0.45;
    let d;
    if (e.kind === 'pond') { if (!inPond(wx, wy)) continue; d = 5; }
    else { const dx = Math.abs(wx - cx) / (s * 0.5), dy = Math.abs(wy - cy) / (s * 0.55); if (dx > 1 || dy > 1) continue; d = Math.hypot(dx, dy) + (e.s > 2 ? 1 : 0); }
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
  if (mode !== 'world') { roomX = down.rx - (ev.clientX - down.x) * k; clampPan(); return; }
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
cv.addEventListener('pointercancel', () => { peeking = false; down = null; });
cv.addEventListener('pointerup', ev => {
  peeking = false;
  if (fishFx) { down = null; return; }   // no walking off mid-cast
  if (!down || !running || sheetOpen()) return;
  const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y); down = null;
  if (moved > 18) return;
  const k = cv.width / innerWidth, px = ev.clientX * k, py = ev.clientY * k;
  if (mode === 'home') return homeTap(px, py);
  if (mode === 'olia') return oliaTap(px, py);
  const wx = (camX + px / zoom) / T, wy = (camY + py / zoom) / T;
  const e = hitEnt(wx, wy);
  blip(e ? 700 : 560, 0.05); fxTap(e && e.kind !== 'pond' ? e.x : wx, e && e.kind !== 'pond' ? e.y : wy, !!e);
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
      ${i > 0 ? btn('storyGo', i - 1, '←', 'ghost round') : ''}
      ${btn('hear', 's_' + i, '🔊', 'round blue')}
      ${last ? btn('storyStart', '', 'Почати<small>Start</small>') : btn('storyGo', i + 1, 'Далі<small>Next</small>')}
    </div>`;
  box.classList.add('show');
  box.querySelector('.paper').scrollTop = 0;
  say('s_' + i);
}
function storyClose() { $('#story').classList.remove('show'); sayToken++; for (const k in clipCache) { try { clipCache[k].pause(); } catch (e) {} } }

const A = {
  update() { location.reload(); },
  eatMeal() {
    const R = curRecipe(); if (!R) return closeSheet();
    say('p_duzhe_smachno'); learn(R.dish); give(R.dish); S.hearts += 3;   // a meal from Grandma earns love, not money
    S.recipe = { i: S.recipe.i + 1, have: {}, started: -1 };
    hud(); save(); setGuide(); blip(990, 0.2);
    setTimeout(() => { closeSheet(); toast(`❤️ +3  ${W[R.dish].uk}`); }, 1800);
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
    musicBtn(); if (musicOn) { musicVol = 0; music.play().catch(() => {}); } toast(musicOn ? '🎵 Музика · Music on' : '🔇 Тиша · Music off');
  },
  // Exit: the installed app closes completely; in a browser tab it leaves full screen and goes back to the title.
  quit() {
    save(); closeSheet(); sayToken++; try { speechSynthesis.cancel(); } catch (e) {}
    // A browser tab in full screen also reports display-mode "fullscreen", so that alone does not mean an installed app.
    const inFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const inApp = matchMedia('(display-mode: standalone), (display-mode: minimal-ui)').matches || navigator.standalone || (!inFs && matchMedia('(display-mode: fullscreen)').matches);
    const toTitle = () => { running = false; mode = 'world'; $('#homebar').style.display = 'none'; try { music.pause(); } catch (e) {} $('#start').style.display = ''; try { sizeTitle(); } catch (e) {} };
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
    if (MIC.state === 'denied') return toast('Chrome: tap the lock beside the address, then Permissions, then Microphone');
    try { const st = await navigator.mediaDevices.getUserMedia({ audio: true }); st.getTracks().forEach(t => t.stop()); MIC.state = 'granted'; toast('🎤 Мікрофон увімкнено · Microphone is on'); micRefresh(); return; }
    catch (e) { MIC.state = e && e.name === 'NotAllowedError' ? 'denied' : MIC.state; toast('🎤 Мікрофон не увімкнено · Not enabled'); }
    micRefresh();
  },
  spSay() { spAttempt(); },
  spEyeUk() { if (sp) { sp.showUk = true; spRender(); } },
  spEyeTr() { if (sp) { sp.showTr = true; spRender(); } },
  spStop() { if (sp) sp.stop = true; },
  spNext() { spAdvance(); },
  spSkip() { spAdvance(); },
  spGo() { const R = sp && sp.R; sp = null; if (R) mealScene(R); },
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
    if (owned(v)) return;
    const price = D.shop[shopTab][v];
    if (S.coins < price) { toast(`${D.ui.notenough[0]}${stage() < 3 ? ' · ' + D.ui.notenough[1] : ''}`); return; }
    S.coins -= price;
    if (shopTab === 'seeds') { S.seeds[v] = (S.seeds[v] || 0) + 1; learn('nasinnia'); }
    else if (shopTab === 'home' || shopTab === 'cats') S.home[v] = (S.home[v] || 0) + 1;
    else if (shopTab === 'tools') { S.gear[v] = 1; farmEnts(); }
    else if (shopTab === 'farm') { S.farm = S.farm || {}; S.farm[v] = farmN(v) + 1; farmEnts(); }
    else give(v);
    hud(); blip(880, 0.1); say('n_' + price, 'p_diakuiu');
    toast(shopTab === 'seeds' ? `−${price} ₴  🌱 ${W.nasinnia.uk}: ${W[v].uk}${stage() < 3 ? ' · seeds to plant in your garden' : ''}` : `−${price} ₴  ${W[v].uk}${stage() < 3 && (shopTab === 'farm' || v === 'maslobiika') ? ' · now by your cottage' : ''}`); tutEvent('buy'); save(); shop();
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
  decor(v) {
    if (BASICS.includes(v)) return;
    if (S.decor[v]) { delete S.decor[v]; S.home[v] = (S.home[v] || 0) + 1; blip(440); }
    else if (S.home[v] > 0) { S.home[v]--; S.decor[v] = 1; learn(v); say('w_' + v); blip(700); tutEvent('place'); }
    save(); if (sheetOpen() && sheet.querySelector('[data-a="decor"]')) decorSheet();
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
window.__game = { give: (k,n) => give(k,n), homeCats: () => homeCats().map(h => h.ct.id + ":" + h.pose), catSpot, FETCH, OKS, solid: () => solid, iconURL, enterOliaNow, oliaHits: () => oliaHits, pan: x => { roomX = x; tour = null; }, mode: () => mode, speakRound, groundOk, ground, S: () => S, P, ents, A, walkTo, interact, stage, clips: textOf, room: () => ({ roomX, RW: roomW(), w: cv.width, h: cv.height, bed: decorRect('lizhko') }), rect: id => decorRect(id), take: e => take(e), fishing: () => !!fishFx, cam: () => ({ camX: Math.round(camX), camY: Math.round(camY), peekX: Math.round(peekX), peekY: Math.round(peekY) }), homeTap, musicState: () => (music.paused ? 'paused' : 'PLAYING') + ' at ' + music.currentTime.toFixed(1) + 's' };
})();
