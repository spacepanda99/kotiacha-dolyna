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
  npc: {}, cats: {}, decor: {}, gear: {}, recipe: { i: 0, got: [], started: -1 }, tut: 0, tutN: 0, cd: {}, x: 7.5, y: 12.5,
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
if (!S.recipe) S.recipe = { i: 0, got: [], started: -1 };
if (!S.gear) S.gear = {};
let saveT = 0;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(SAVE, JSON.stringify(S)); } catch (e) {} }, 300); };

// How far along the learner is. English fades out as this rises.
const mastered = () => Object.values(S.words).filter(w => w.l >= 3).length;
const stage = () => { const m = mastered(); return m >= 40 ? 3 : m >= 12 ? 2 : 1; };
const lab = k => { const u = D.ui[k]; return u[0] + (stage() < 3 ? `<small>${u[1]}</small>` : ''); };
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
    a.onerror = () => { speakFallback(textOf(id)).then(fin); };
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
  const target = musicOn ? 0.55 * duck : 0;
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
  church(c) {
    c.fillStyle = '#fffdf5'; rr(c, -30, -52, 60, 52, 3);
    c.fillStyle = '#3d7cc2'; poly(c, [[-36, -50], [0, -72], [36, -50]]);
    c.fillStyle = '#fffdf5'; rr(c, -9, -80, 18, 14, 2);
    c.fillStyle = '#f2c230'; circ(c, 0, -86, 10); poly(c, [[-5, -92], [0, -100], [5, -92]]);
    circ(c, -24, -56, 6); circ(c, 24, -56, 6);
    c.fillRect(-1.5, -110, 3, 13); c.fillRect(-5.5, -106, 11, 3);
    c.fillStyle = '#8a5a2b'; rr(c, -8, -26, 16, 26, 8);
    c.fillStyle = '#bfe6fb'; rr(c, -24, -36, 9, 14, 4); rr(c, 15, -36, 9, 14, 4);
  },
  mill(c, o) {
    c.fillStyle = '#b98452'; poly(c, [[-22, 0], [22, 0], [14, -62], [-14, -62]]);
    c.fillStyle = '#8a5a2b'; poly(c, [[-19, -60], [0, -80], [19, -60]]); rr(c, -6, -20, 12, 20, 5);
    c.save(); c.translate(0, -62); c.rotate(((o && o.t) || 0) * 0.5);
    c.fillStyle = '#f3ead7';
    for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); rr(c, -5, -46, 10, 40, 2); }
    c.fillStyle = '#6b4a2a'; circ(c, 0, 0, 5); c.restore();
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
  table(c) {
    c.fillStyle = '#8a5a2b'; c.fillRect(-38, -42, 8, 42); c.fillRect(30, -42, 8, 42);
    c.fillStyle = '#c08a55'; rr(c, -46, -54, 92, 13, 4);
    c.fillStyle = '#fffdf5'; rr(c, -16, -56, 32, 28, 2);
    c.fillStyle = '#e2574c'; c.fillRect(-16, -34, 32, 3); c.fillRect(-16, -40, 32, 2);
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
      // sweeping in front of her stall: a besom swishing side to side, little dust puffs
      const sw = Math.sin(t * 3.2), a = 0.25 + sw * 0.35;
      c.save(); c.translate(15, -27); c.rotate(a);
      c.strokeStyle = '#9b6b3c'; c.lineWidth = 3; c.beginPath(); c.moveTo(0, -10); c.lineTo(0, 22); c.stroke();
      c.fillStyle = '#d9b45a'; poly(c, [[-3, 20], [3, 20], [9, 34], [-9, 34]]);
      c.strokeStyle = '#b8913e'; c.lineWidth = 1; for (const dx of [-5, 0, 5]) { c.beginPath(); c.moveTo(dx * 0.4, 22); c.lineTo(dx, 34); c.stroke(); }
      c.fillStyle = '#c23b2f'; c.fillRect(-3, 18, 6, 2.5);
      c.restore();
      const bx = 15 - Math.sin(a) * 31;
      for (let i = 0; i < 3; i++) { const f = (t * 1.6 + i / 3) % 1; c.fillStyle = `rgba(214,190,140,${0.55 * (1 - f)})`; circ(c, bx - sw * f * 14 + (i - 1) * 4, 2 - f * 10, 2.5 + f * 4); }
    }
  } else if (id === 'olia') {
    if (layer === 0) {
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
function person(c, x, y, L, t, moving, sc, ph) {
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
  for (const sx of [-15.5, 15.5]) {   // arms swing from the shoulder
    c.save(); c.translate(sx, -47 + bob); c.rotate(arm);
    c.fillStyle = L.shirt; rr(c, -3.5, -1, 7, 18, 3); c.fillStyle = L.trim; c.fillRect(-3.5, 13, 7, 2.5);
    c.fillStyle = L.skin; circ(c, 0, 19, 3.5); c.restore();
  }
  c.fillStyle = L.shirt; rr(c, -14, -51 + bob, 28, 26, 8);
  c.fillStyle = L.trim; c.fillRect(-2, -49 + bob, 4, 18); c.fillRect(-14, -30 + bob, 28, 3);
  for (let i = 0; i < 3; i++) { c.fillRect(-6, -46 + i * 6 + bob, 2, 2); c.fillRect(4, -46 + i * 6 + bob, 2, 2); }
  c.fillStyle = L.skin; circ(c, 0, -63 + bob, 14);
  c.fillStyle = L.hair; c.beginPath(); c.arc(0, -65 + bob, 14.6, Math.PI, 0); c.fill();
  if (L.long) { rr(c, -15.5, -66 + bob, 5, 20, 2.5); rr(c, 10.5, -66 + bob, 5, 20, 2.5); c.fillStyle = L.band || '#d43a3a'; c.fillRect(-13.5, -73 + bob, 27, 3); c.fillStyle = '#ffd23f'; circ(c, -9, -74 + bob, 2.6); c.fillStyle = '#ff7aa8'; circ(c, -4, -76 + bob, 2.6); }
  c.fillStyle = '#3b2f2a'; if (blink) { c.fillRect(-7, -62.6 + bob, 4, 1.3); c.fillRect(3, -62.6 + bob, 4, 1.3); } else { circ(c, -5, -62 + bob, 1.8); circ(c, 5, -62 + bob, 1.8); c.fillStyle = 'rgba(255,255,255,.8)'; circ(c, -4.4, -62.7 + bob, 0.6); circ(c, 5.6, -62.7 + bob, 0.6); c.fillStyle = '#3b2f2a'; }
  c.strokeStyle = '#3b2f2a'; c.lineWidth = 1.6; c.beginPath(); c.arc(0, -58 + bob, 4.5, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  c.fillStyle = 'rgba(240,120,120,.45)'; circ(c, -9, -58 + bob, 2.8); circ(c, 9, -58 + bob, 2.8);
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
const ANIMAL_OF = { zhaba: 'frog', kurka: 'hen', piven: 'rooster', svynia: 'pig', kachka: 'duck', korova: 'cow', kin: 'horse', koza: 'goat', sobaka: 'dog' };
const ASIZE = { frog: 0.62, horse: 1.9, cow: 1.5, goat: 1.05, pig: 0.9, dog: 0.85, cat: 0.65, hen: 0.6, rooster: 0.72, duck: 0.55 };
const SPEED = { frog: 0.75, horse: 0.6, cow: 0.3, goat: 0.45, pig: 0.35, dog: 0.7, cat: 0.55, hen: 0.4, rooster: 0.45, duck: 0.3 };
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
  add({ w: 'kurka', x: 27.6, y: 11.8, kind: 'animal', r: 1.1, give: 'yaitse', cd: 90 });
  add({ w: 'kurka', x: 28.4, y: 12.6, kind: 'animal', r: 1.1, give: 'yaitse', cd: 90 });
  add({ w: 'piven', x: 27.2, y: 12.9, kind: 'animal', r: 1.2 });
  add({ w: 'kit', x: 22.4, y: 12.3, kind: 'animal', r: 0.8 });
  add({ w: 'kit', x: 12.4, y: 13.2, kind: 'animal', r: 1.2, s: 0.9 });
  add({ w: 'kit', x: 17.2, y: 20.6, kind: 'animal', r: 1.2, s: 0.85 });
  add({ w: 'kit', x: 8.6, y: 15.6, kind: 'animal', r: 1.0, s: 0.8 });
  add({ w: 'svynia', x: 29.4, y: 9.8, kind: 'animal', r: 1.0 });
  // Landmarks.
  rect(29, 3, 31, 5); add({ w: 'tserkva', x: 30.5, y: 6, s: 4.2 });
  add({ w: 'leleka', x: 21.5, y: 7, s: 2.6, solid: true });
  rect(10, 2, 12, 4); add({ w: 'mlyn', x: 11.5, y: 5, s: 3.8, spin: true });
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
  add({ w: 'korova', x: 30.2, y: 12.4, s: 1.4, kind: 'animal', r: 1.2, give: 'moloko', cd: 120 });
  add({ w: 'kin', x: 32.3, y: 13.0, s: 1.5, kind: 'animal', r: 1.0 });
  add({ w: 'koza', x: 28.6, y: 13.4, s: 1.1, kind: 'animal', r: 0.9 });
  // Ukrainian touches: hollyhocks by the cottages, kalyna bushes, a pysanka basket and a bandura at the market.
  for (const [x, y] of [[4.9, 10.4], [12.4, 10.5], [24.1, 10.1], [26.9, 10.2], [8.8, 19.2]]) add({ w: 'malva', x, y, s: 1.15 });
  for (const [x, y] of [[3.6, 15.4], [31.4, 17.4]]) add({ w: 'kalyna', x, y, s: 1.2, solid: true, give: 'kalyna', cd: 150, hide: true });
  add({ w: 'pysanka', x: 26.2, y: 12.5, s: 0.6 });
  add({ w: 'bandura', x: 15.5, y: 19.5, s: 0.95 });
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
  add({ w: 'khata', k: 'n_olia', x: 24.5, y: 12.7, kind: 'npc', npc: 'olia', s: 1.3 });
  add({ w: 'khata', k: 'n_oksana', x: 19.5, y: 18.1, kind: 'npc', npc: 'oksana', s: 1.3 });
  add({ w: 'khata', k: 'n_taras', x: 25.3, y: 21.2, kind: 'npc', npc: 'taras', s: 1.3 });
  add({ w: 'khata', k: 'n_andriiko', x: 14.5, y: 20.7, kind: 'npc', npc: 'andriiko', s: 1.1 });
  add({ w: 'sobaka', x: 15.7, y: 21.3, kind: 'animal', r: 1.0 });
  add({ w: 'khata', k: 'n_bohdan', x: 9.1, y: 20.4, kind: 'npc', npc: 'bohdan', s: 1.3 });
  for (let i = ents.length - 1; i >= 0; i--) if (ents[i].w === 'kit') ents.splice(i, 1);
  for (const ct of D.cats) add({ w: ct.word, k: 'cat_' + ct.id, kind: 'animal', an: 'cat', cat: ct.id, v: ct.v, x: ct.x, y: ct.y, r: 1.3 });
  let ducks = 0;
  for (const e of ents) {
    e.hx = e.x; e.hy = e.y; e.tw = 0;
    if (e.kind === 'animal' && ANIMAL_OF[e.w]) { e.an = ANIMAL_OF[e.w]; if (e.an === 'duck') e.v = ducks++; }
    if (e.an) e.s = ASIZE[e.an];
  }
})();

// The ground is painted once into its own canvas.
const ground = document.createElement('canvas');
const seeded = s => () => (s = (s * 16807) % 2147483647) / 2147483647;
(function paintGround() {
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
})();

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
  horse: { k: 1.3, L: 62, B: 26, G: 34, col: '#9a5b34', far: '#7a4526', dark: '#4a2a14', neck: [14, 28], head: [15, 7.5], hrot: 0.55, tail: 'hair', mane: true, hoof: '#3b2a1e', ear: 'up', graze: true, muzzle: '#c98f6a' },
  cow: { k: 1.2, L: 64, B: 32, G: 22, col: '#fffaf0', far: '#d8d0c0', dark: '#2d2a2a', neck: [9, 7], head: [14, 10], hrot: 0.3, tail: 'tuft', horns: 'cow', udder: true, hoof: '#3b2a1e', ear: 'side', graze: true, patches: [[-14, -6, 12], [10, 5, 9], [25, -8, 7]], muzzle: '#f4b6b0' },
  goat: { k: 1, L: 38, B: 20, G: 20, col: '#f3ead7', far: '#d1c5a8', dark: '#a8956e', neck: [8, 13], head: [10, 6.5], hrot: 0.35, tail: 'stub', horns: 'goat', beard: true, hoof: '#5b4636', ear: 'side', graze: true },
  pig: { k: 1, L: 44, B: 27, G: 11, col: '#f6b0b8', far: '#e39aa6', dark: '#d77f90', neck: [3, -2], head: [12, 11], hrot: 0.1, tail: 'curl', snout: true, ear: 'flop', hoof: '#b8697b' },
  dog: { k: 1, L: 36, B: 17, G: 16, col: '#c98a4a', far: '#a56c34', dark: '#7a4b22', neck: [6, 8], head: [9.5, 8], hrot: 0.1, tail: 'wag', ear: 'flop', patches: [[-8, -2, 7]], muzzle: '#fff3e0', nose: true },
};
// The six cats of the valley. Each also has a sitting portrait (see cat() by the title screen).
const VAR = {
  rudyi: { col: '#f0a24c', far: '#d98a36', dark: '#c26f22', eye: '#7bc47f', stripes: true },
  chornyi: { col: '#3d373c', far: '#2c272b', dark: '#1d191c', eye: '#f2c230' },
  bilyi: { col: '#fffdf8', far: '#e2dbcf', dark: '#cfc7b8', eye: '#5aa9e6' },
  siryi: { col: '#9a9aa2', far: '#80808a', dark: '#66666f', eye: '#e6b43a' },
  smuhastyi: { col: '#b89a74', far: '#9c805c', dark: '#5e4830', eye: '#7bc47f', stripes: true },
  trykolirna: { col: '#fffdf8', far: '#e2dbcf', dark: '#cfc7b8', eye: '#e6b43a', patches: [[-7, -3, 6, '#f0a24c'], [6, 2, 5, '#3d373c']], headPatch: '#f0a24c' },
};
const catQuad = v => Object.assign({ k: 1, L: 30, B: 13, G: 12, neck: [4, 6], head: [8, 7.5], hrot: 0, tail: 'cat', ear: 'point', nose: true, hoof: null }, VAR[v]);
function sitPal(v) {
  const V = VAR[v], tri = v === 'trykolirna';
  return {
    body: V.col, a: tri ? '#f0a24c' : V.dark, b: tri ? '#3d373c' : V.dark, eye: V.eye, chub: 1, fluffy: false, bib: false, tail: V.col, earR: tri ? 'b' : 'body',
    pb: tri ? [[-10, -36, 10, 'a'], [10, -22, 8, 'b']] : V.stripes ? [[-16, -40, 5, 'a'], [-4, -48, 5, 'a'], [10, -44, 5, 'a'], [18, -30, 5, 'a']] : [],
    ph: tri ? [[-10, -78, 8, 'a'], [10, -76, 7, 'b']] : V.stripes ? [[-6, -90, 3.5, 'a'], [0, -92, 3.5, 'a'], [6, -90, 3.5, 'a']] : [],
  };
}
for (const v in VAR) DRAW['cat_' + v] = c => cat(c, 0, -2, 94, sitPal(v), 0, 0, 1);

function quad(c, x, y, Q, t, e) {
  const walk = !!e.walk, ph = (e.step || 0) * 34 / Q.G;
  const sw = walk ? Math.sin(ph) : 0, bob = walk ? Math.abs(Math.cos(ph)) * 1.2 : Math.sin(t * 1.5 + e.hx) * 0.4;
  const dir = e.face === -1 ? 1 : -1;
  c.save(); c.translate(x, y); c.scale(Q.k * dir, Q.k); c.lineCap = 'round'; c.lineJoin = 'round';
  c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, 0, Q.L * 0.55, 5);
  const by = -Q.G - Q.B / 2 - bob, lw = Math.max(3.5, Q.B * 0.24), hipF = Q.L * 0.33, hipB = -Q.L * 0.33;
  const leg = (hx, a, col) => {
    c.save(); c.translate(hx, -Q.G - bob * 0.5 - 1); c.rotate(a);
    c.fillStyle = col; rr(c, -lw / 2, -2, lw, Q.G + 2, lw / 2);
    if (Q.hoof) { c.fillStyle = Q.hoof; rr(c, -lw / 2, Q.G - 5, lw, 5.5, 2); }
    c.restore();
  };
  // far-side legs first
  leg(hipF - 3, -sw * 0.5, Q.far); leg(hipB - 3, sw * 0.5, Q.far);
  // tail
  const tx = -Q.L / 2 + 2, ty = by - Q.B * 0.15;
  if (Q.tail === 'hair') { c.strokeStyle = Q.dark; c.lineWidth = 7; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx - 14 - sw * 3, ty + 8, tx - 10 + Math.sin(t * 2 + e.hx) * 3, ty + 34); c.stroke(); }
  else if (Q.tail === 'tuft') { c.strokeStyle = Q.dark; c.lineWidth = 2.2; c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx - 9, ty + 10, tx - 6 + Math.sin(t * 2.4 + e.hx) * 4, ty + 26); c.stroke(); c.fillStyle = Q.dark; circ(c, tx - 6 + Math.sin(t * 2.4 + e.hx) * 4, ty + 27, 3.2); }
  else if (Q.tail === 'stub') { c.fillStyle = Q.col; poly(c, [[tx + 3, ty + 2], [tx - 6, ty - 8], [tx + 5, ty - 4]]); }
  else if (Q.tail === 'curl') { c.strokeStyle = Q.dark; c.lineWidth = 2.6; c.beginPath(); c.arc(tx - 3, ty - 2, 4, 0.3, 5.2); c.stroke(); }
  else if (Q.tail === 'wag') { const a = -1.0 + Math.sin(t * 9 + e.hx) * 0.45; c.strokeStyle = Q.col; c.lineWidth = 4.5; c.beginPath(); c.moveTo(tx + 2, ty); c.lineTo(tx + 2 + Math.cos(a) * -14, ty + Math.sin(a) * 14); c.stroke(); }
  else if (Q.tail === 'cat') { const s2 = Math.sin(t * 2 + e.hx * 2) * 5; c.strokeStyle = Q.col; c.lineWidth = 4; c.beginPath(); c.moveTo(tx + 2, ty + 1); c.bezierCurveTo(tx - 12, ty + 2, tx - 16 + s2, ty - 12, tx - 9 + s2, ty - 21); c.stroke(); }
  // body
  c.fillStyle = Q.col; c.beginPath(); c.ellipse(0, by, Q.L / 2, Q.B / 2, 0, 0, 7); c.fill();
  if (Q.patches || Q.stripes) {
    c.save(); c.clip();
    for (const p of Q.patches || []) { c.fillStyle = p[3] || Q.dark; circ(c, p[0], by + p[1], p[2]); }
    if (Q.stripes) { c.strokeStyle = Q.dark; c.lineWidth = 2; for (let i = -1; i <= 2; i++) { c.beginPath(); c.moveTo(i * 6 - 2, by - Q.B / 2); c.lineTo(i * 6, by - 1); c.stroke(); } }
    c.restore();
  }
  if (Q.udder) { c.fillStyle = '#f4b6b0'; ell(c, -Q.L * 0.16, by + Q.B / 2 - 1, 8, 5); }
  // near-side legs
  leg(hipF + 2, sw * 0.5, Q.col); leg(hipB + 2, -sw * 0.5, Q.col);
  // neck and head; grazers lower their heads now and then when standing
  const dip = !walk && Q.graze ? Math.max(0, Math.sin(t * 0.45 + e.hx * 3)) : 0;
  const hx = Q.L / 2 + Q.neck[0] - dip * 2, hy = by - Q.neck[1] + dip * (Q.neck[1] + Q.G * 0.75);
  c.strokeStyle = Q.col; c.lineWidth = Q.B * 0.5; c.beginPath(); c.moveTo(Q.L / 2 - 7, by - Q.B * 0.1); c.lineTo(hx - 2, hy + 2); c.stroke();
  if (Q.mane) { c.strokeStyle = Q.dark; c.lineWidth = 5; c.beginPath(); c.moveTo(Q.L / 2 - 12, by - Q.B * 0.42); c.lineTo(hx - 6, hy - 5); c.stroke(); }
  c.save(); c.translate(hx, hy); c.rotate(Q.hrot + dip * 0.5);
  const a0 = Q.head[0], b0 = Q.head[1];
  if (Q.horns === 'cow') { c.strokeStyle = '#e9dcc0'; c.lineWidth = 3; c.beginPath(); c.arc(-a0 * 0.2, -b0 - 2, 5, Math.PI, 1.7 * Math.PI); c.stroke(); }
  if (Q.horns === 'goat') { c.strokeStyle = '#a8956e'; c.lineWidth = 2.6; c.beginPath(); c.arc(-a0 * 0.75, -b0 - 1, 8, 1.15 * Math.PI, 1.95 * Math.PI); c.stroke(); }
  if (Q.ear === 'up') { c.fillStyle = Q.col; poly(c, [[-a0 * 0.5, -b0 + 1], [-a0 * 0.35, -b0 - 9], [-a0 * 0.05, -b0 + 1]]); }
  if (Q.ear === 'point') { c.fillStyle = Q.col; poly(c, [[-a0 * 0.75, -b0 + 3], [-a0 * 0.5, -b0 - 7], [-a0 * 0.05, -b0 + 1]]); poly(c, [[a0 * 0.0, -b0 + 1], [a0 * 0.4, -b0 - 7], [a0 * 0.7, -b0 + 3]]); }
  c.fillStyle = Q.col; c.beginPath(); c.ellipse(a0 * 0.25, 0, a0, b0, 0, 0, 7); c.fill();
  if (Q.headPatch) { c.save(); c.clip(); c.fillStyle = Q.headPatch; circ(c, -a0 * 0.3, -b0 * 0.5, a0 * 0.6); c.restore(); }
  if (Q.muzzle) { c.fillStyle = Q.muzzle; ell(c, a0 * 0.85, b0 * 0.15, a0 * 0.42, b0 * 0.72); }
  if (Q.snout) { c.fillStyle = Q.dark; ell(c, a0 * 1.1, 1, 4.5, 5.5); c.fillStyle = '#8a4a5a'; circ(c, a0 * 1.12, -1, 0.9); circ(c, a0 * 1.12, 3, 0.9); }
  if (Q.nose) { c.fillStyle = Q.tail === 'cat' ? '#e8708a' : '#2a1a10'; circ(c, a0 * 1.2, 0.5, Q.tail === 'cat' ? 1.3 : 2); }
  if (Q.ear === 'side') { c.fillStyle = Q.far; ell(c, -a0 * 0.5, -b0 * 0.55, 5, 2.8); }
  if (Q.ear === 'flop') { c.fillStyle = Q.dark; c.beginPath(); c.ellipse(-a0 * 0.25, -b0 * 0.1, 4.2, 7, 0.3, 0, 7); c.fill(); }
  if (Q.beard) { c.fillStyle = Q.dark; poly(c, [[a0 * 0.5, b0 - 1], [a0 * 0.75, b0 + 8], [a0 * 0.9, b0 - 2]]); }
  c.fillStyle = Q.eye || '#2a1a10'; circ(c, a0 * 0.45, -b0 * 0.25, Q.eye ? 1.9 : 1.6);
  if (Q.eye) { c.fillStyle = '#1d191c'; ell(c, a0 * 0.45, -b0 * 0.25, 0.7, 1.7); }
  if (Q.tail === 'cat') { c.strokeStyle = 'rgba(255,255,255,.75)'; c.lineWidth = 0.7; for (const dy of [-1, 1.5]) { c.beginPath(); c.moveTo(a0 * 0.9, 1.5 + dy); c.lineTo(a0 * 1.7, 0.5 + dy * 2.2); c.stroke(); } }
  c.restore();
  c.restore();
}

const BIRD = {
  hen: { k: 1, body: '#fff8ec', wing: '#eadfc6', tail: '#eadfc6', comb: 3 },
  rooster: { k: 1.18, body: '#b5522a', wing: '#7a2f1a', tail: '#1f4d3a', comb: 5, big: true },
};
function bird(c, x, y, B, t, e) {
  const walk = !!e.walk, ph = (e.step || 0) * 34, sw = walk ? Math.sin(ph) : 0;
  const dir = e.face === -1 ? 1 : -1;
  const peck = !walk && Math.sin(t * 1.3 + e.hx * 5) > 0.55 ? 1 : 0;
  c.save(); c.translate(x, y); c.scale(B.k * dir, B.k); c.lineCap = 'round';
  c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, 0, 0, 13, 3.5);
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
  const dir = e.face === -1 ? 1 : -1, bob = Math.sin(t * 2 + e.hx * 4) * 1.2, drake = e.v === 0;
  c.save(); c.translate(x, y + bob); c.scale(dir, 1);
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
    const ph = e.walk ? ((e.step || 0) * 2.4) % 1 : 0, lift = e.walk ? Math.sin(Math.PI * ph) * 16 : 0, dir = e.face === -1 ? 1 : -1;
    c.fillStyle = 'rgba(0,0,0,.14)'; ell(c, x, y, 13 - lift * 0.3, 3.5);
    c.save(); c.translate(x, y - lift); c.scale(dir, 1);
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
    note: `<b>${ct.line}</b>${st < 2 ? `<br>${ct.lineEn}` : ''}${st < 3 && !has ? `<br><small>${sourceHint(ct.wants)}</small>` : ''}`,
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
function arrive() { const e = P.goal; P.goal = null; if (e && e.kind === 'npc') P.face = e.x >= P.x ? 1 : -1; if (e) interact(e); }

// ------------------------------------------------------------------ learning
// First meeting teaches the word. After that it comes back "due" at growing intervals.
function learn(id) {
  if (S.words[id]) return false;
  S.words[id] = { l: 1, d: now() + IV[1] };
  tutEvent('word'); save(); return true;
}
function useWord(id, ok) {
  const w = S.words[id] || (S.words[id] = { l: 1, d: 0 });
  if (ok) { w.l = Math.min(5, w.l + 1); w.d = now() + IV[w.l]; }
  else { w.l = Math.max(1, w.l - 1); w.d = now() + IV[1]; }
  save();
}
const isFresh = id => { const w = S.words[id]; return !w || (w.l < 5 && now() >= w.d); };
const known = id => S.words[id] ? S.words[id].l : 0;

// ------------------------------------------------------------------ sheets (the pop-up panels)
const sheet = $('#sheet'), veil = $('#veil');
let onClose = null, acts = [], cur = {}, sheetAt = 0;
function openSheet(html, closer) {
  if (onClose) { const f = onClose; onClose = null; f(); }
  sheet.classList.remove('fixed'); clearTimeout(closeT); sheet.classList.remove('closing'); veil.classList.remove('closing');
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
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1900); }
const btn = (a, v, inner, cls = '') => `<button class="b ${cls}" data-a="${a}" data-v="${v}">${inner}</button>`;

function wordCard(id, o = {}) {
  const w = W[id], t = now();
  const isNew = learn(id);
  const st = S.words[id];
  let recall = false;
  if (!isNew && t >= st.d && st.l < 5) { if (st.l < 2) { st.l = 2; st.d = t + IV[2]; } else recall = true; }
  const hideEn = !isNew && st.l >= 2;
  cur = { id, peeked: false };
  acts = o.acts || [];
  const en = hideEn ? `<button class="peek" data-a="peek">👁 ${D.ui.show[0]}</button>` : `<div class="en">${w.en}</div>`;
  openSheet(`<div class="card">
    ${isNew ? `<div class="tag">✨ ${PH.nove_slovo.uk}</div>` : ''}
    <img class="big" src="${iconURL(id)}" alt="">
    <div class="word">${w.uk}</div>
    ${st.l < 4 ? `<div class="tr">${w.tr}</div>` : ''}
    <div id="en">${en}</div>
    ${o.note ? `<div class="hint">${o.note}</div>` : ''}
    ${w.fact ? `<div class="fact"><b>🌾 ${stage() < 3 ? 'Ukrainian culture' : 'Культура'}</b><div class="fu">${w.fact.uk}</div>${stage() < 3 ? `<div class="fe">${w.fact.en}</div>` : ''}</div>` : ''}
    <div class="row">
      ${btn('hear', 'w_' + id, '🔊', 'round blue')}
      ${acts.map((a, i) => btn('act', i, lab(a.k))).join('')}
      ${btn('close', '', lab('close'), 'ghost')}
    </div></div>`,
  () => {
    if (!recall) return;
    // Remembered it without peeking at the English: it moves up and comes back later.
    if (!cur.peeked) { st.l = Math.min(5, st.l + 1); st.d = now() + IV[st.l]; } else st.d = now() + IV[1];
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
function take(e) {
  if (e.owner && !e.stealOk) return caught(e);
  e.stealOk = false;
  S.cd[e.k] = now() + e.cd * 1000;
  give(e.give); blip(880); fxBurst(e.x, e.y - e.s * 0.45, W[e.give].ic);
  toast(`+1 ${W[e.give].ic[0] === '@' ? '' : W[e.give].ic} ${W[e.give].uk}`);
  if (e.give !== e.w) wordCard(e.give); else closeSheet();
}
const ready = e => !(S.cd[e.k] > now());

function fishCard(e) {
  const has = !!S.gear.vudka, st = stage();
  wordCard(e.w, has
    ? { acts: [{ k: 'fish', fn: startFishing }] }
    : { note: `🎣 <b>${PH.need_rod.uk}</b>${st < 3 ? `<br>${PH.need_rod.en} Buy one at the market («${D.ui.tools[0]}» tab).` : ''}`, clips: ['p_need_rod'] });
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
  if (e.kind === 'npc') return talk(NPC[e.npc]);
  if (e.kind === 'plot') return plotSheet(e.i);
  if (e.kind === 'shop') { if (learn('rynok')) say('w_rynok'); return shop(); }
  if (e.kind === 'home') return wordCard('khata', { note: `🏠 <b>${PH.moia_khata.uk}</b>${stage() < 3 ? ' · This is your cottage.' : ''}`, clips: ['p_moia_khata'], acts: [{ k: 'enter', fn: enterHome }] });
  if (e.w === 'krynytsia') {
    const have = S.bag.voda || 0;
    return wordCard('krynytsia', { note: `💧 ${have} / ${WATER_MAX}${stage() < 3 ? (have < WATER_MAX ? ' · Fill your can here.' : ' · Your can is full.') : ''}`, acts: have < WATER_MAX ? [{ k: 'fill', fn: () => {
      const add = Math.min(WELL_GIVES, WATER_MAX - have); S.bag.voda = have + add; learn('voda'); hud(); bumpWater(); save(); closeSheet(); toast(`💧 +${add} ${W.voda.uk}  (${S.bag.voda} / ${WATER_MAX})`); say('w_voda'); blip(700, 0.12);
    } }] : [] });
  }
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
const owned = k => (shopTab === 'home' || shopTab === 'cats' || shopTab === 'tools') && ((S.home[k] || 0) > 0 || !!S.decor[k] || !!S.gear[k]);
const sellPrice = id => { for (const t of ['food', 'seeds']) if (D.shop[t][id]) return Math.max(1, Math.floor(D.shop.food[id] ? D.shop.food[id] / 2 : 3)); return 3; };
function shop() {
  const tabs = ['food', 'seeds', 'tools', 'home', 'cats', 'sell', 'help'];
  const tabBtn = k => `<button class="tab ${shopTab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${D.ui[k][0]}${stage() < 3 ? `<small>${D.ui[k][1]}</small>` : ''}</button>`;
  let body = '';
  if (shopTab === 'help') return helpRound(0);
  if (shopTab === 'sell') {
    const items = Object.keys(S.bag).filter(k => S.bag[k] > 0);
    body = items.length ? `<div class="grid">${items.map(k => `<button class="it" data-a="sell" data-v="${k}"><span class="q">${S.bag[k]}</span><img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div><div class="e">+${sellPrice(k)} ₴</div></button>`).join('')}</div>` : `<div class="muted">🧺 ${D.ui.empty[0]}${stage() < 3 ? ' · ' + D.ui.empty[1] : ''}</div>`;
  } else {
    const list = D.shop[shopTab];
    body = `<div class="grid">${Object.keys(list).map(k => { const had = owned(k); return `<button class="it ${shopSel === k ? 'sel' : ''} ${had ? 'owned' : ''}" data-a="pick" data-v="${k}">${shopTab === 'seeds' ? '<span class="q">🌱</span>' : ''}<img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div>${known(k) < 2 ? `<div class="e">${W[k].en}</div>` : ''}${shopTab === 'seeds' ? `<div class="e">🌱 ${W.nasinnia.uk}${stage() < 3 ? ' · seeds' : ''}</div>` : ''}<div class="e"><b>${had ? '✓ ' + D.ui.have[0] + (stage() < 3 ? ' · ' + D.ui.have[1] : '') : list[k] + ' ₴'}</b></div></button>`; }).join('')}</div>`;
    if (shopSel && list[shopSel] && !owned(shopSel)) body += `<div class="buyrow"><div class="what">${W[shopSel].uk} — ${list[shopSel]} ₴<br><small style="font-weight:600;color:var(--soft)">${D.prices[list[shopSel]]}</small></div>${btn('buy', shopSel, lab('buy'), 'blue')}</div>`;
  }
  setTimeout(() => sheet.classList.add('fixed'), 0);   // the market keeps one height, however few items a tab has
  openSheet(`<h3><span><span class="uk">${W.rynok.uk}</span> ${stage() < 2 ? `<small>${W.rynok.en}</small>` : ''}</span><span>💰 ${S.coins} ₴</span></h3><div class="tabs">${tabs.map(tabBtn).join('')}</div>${body}`);
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
  const w = W[target], hide = stage() >= 2 && known(target) >= 2;
  openSheet(`<div class="dlg"><img class="face" src="${faceURL(NPC.oksana.look)}" alt=""><div><div class="who">${NPC.oksana.name} · ${n + 1}/5</div>
    <div class="line">${hide ? '🔊 …' : '«' + cap(w.uk) + ', будь ласка!»'}</div>${stage() < 2 ? `<div class="en">"${cap(w.en)}, please!"</div>` : ''}</div></div>
    <div class="grid" style="margin-top:14px;grid-template-columns:repeat(4,1fr)">${opts.map(k => `<button class="it" data-a="hand" data-v="${k}" style="min-height:76px"><img src="${iconURL(k)}" alt="">${stage() < 2 ? `<div class="e">${W[k].uk}</div>` : ''}</button>`).join('')}</div>
    <div class="row">${btn('hear2', target, '🔊', 'round blue')}${btn('tab', 'food', lab('close'), 'ghost')}</div>`);
  say('w_' + target, 'p_bud_laska');
}

// ------------------------------------------------------------------ villagers
function sourceHint(id) {
  if (stage() >= 3) return '';
  if (D.shop.seeds[id]) return '🌱 Grow it in your garden. Seeds are at the market.';
  if (D.shop.food[id]) return '🧺 Oksana sells it at the market.';
  if (id === 'kalyna') return '🌿 Kalyna bushes grow in the valley.';
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
  const choices = st.choices ? `<div class="choices">${st.choices.map((c, k) => `<button class="b ghost" data-a="choose" data-v="${k}">${c.uk}${s < 2 ? `<small>${c.en}</small>` : ''}</button>`).join('')}</div>` : '';
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
const MASS = ['boroshno', 'syr', 'maslo', 'sil', 'kapusta', 'kartoplia', 'morkva', 'tsybulia'];
function recipeList(R) {
  return `<div style="display:flex;gap:6px;justify-content:center;flex-wrap:wrap;margin-top:6px">${R.needs.map(id => { const got = S.recipe.got.includes(id); return `<span style="position:relative;opacity:${got ? 1 : 0.4}"><img src="${iconURL(id)}" style="width:34px;height:34px" alt="">${got ? '<b style="position:absolute;right:-3px;bottom:-4px;color:#3f8a3a">✓</b>' : ''}</span>`; }).join('')}</div>`;
}
function talkOlia(npc, n, steps) {
  const R = D.recipes[S.recipe.i], st = stage();
  if (S.recipe.started !== S.recipe.i) { steps.push(line(npc, 'recipe_' + R.id)); S.recipe.started = S.recipe.i; learn(R.dish); }
  const missing = () => R.needs.filter(x => !S.recipe.got.includes(x));
  const carrying = missing().filter(x => (S.bag[x] || 0) > 0);
  if (carrying.length) {
    // Hand them over now, so closing the chat early never loses the delivery.
    for (const x of carrying) { S.bag[x]--; S.recipe.got.push(x); useWord(x, true); }
    S.coins += 2 * carrying.length; hud(); save();
    const hand = mine('os');
    const thanks = line(npc, 'thanks');
    thanks.hint = recipeList(R);
    steps.push(hand, thanks);
  }
  const left = missing().filter(x => !carrying.includes(x));
  if (!left.length) {
    n.q = null;
    steps[steps.length - 1].after = (f => () => { if (f) f(); setTimeout(() => mealScene(R), 250); })(steps[steps.length - 1].after);
  } else {
    const next = left[0];
    n.q = next;
    steps.push({
      uk: D.questLine.uk.replace('%s', W[next].acc || W[next].uk),
      en: D.questLine.en.replace('%s', (MASS.includes(next) ? 'some ' : 'a ') + W[next].en),
      clip: `q_${npc.id}_${next}`,
      hint: `${st < 3 ? `<b>${W[R.dish].uk}</b>${st < 2 ? ' · ' + W[R.dish].en : ''}: ` : ''}${S.recipe.got.length}/${R.needs.length}${recipeList(R)}<div style="margin-top:6px">${(S.seeds[next] || 0) > 0 ? `🌱 <b>${D.ui.plantit[0]}</b>${st < 3 ? `<br>${D.ui.plantit[1].replace('%s', W[next].en)}` : ''}` : sourceHint(next)}</div>`,
    });
  }
  save(); setGuide();
  dialog(npc, steps);
}
// The meal: Olia's dish on the table, she calls you to eat, you say it's delicious.
function mealScene(R) {
  const npc = NPC.olia, st = stage();
  cur = { meal: R.id };
  openSheet(`<div class="card">
    <div class="tag">🍽️ ${PH.smachnoho ? PH.smachnoho.uk : 'Смачного!'}</div>
    <div style="display:flex;align-items:flex-end;justify-content:center;gap:4px;margin:4px 0">
      <img src="${faceURL(npc.look)}" style="width:76px;height:76px;border-radius:18px;background:#e8f4d9" alt="">
      <img src="${iconURL(R.dish)}" style="width:150px;height:150px" alt="">
      <img src="${faceURL(ME)}" style="width:76px;height:76px;border-radius:18px;background:#e8f4d9" alt="">
    </div>
    <div class="word" style="font-size:30px">${npc.lines['ready_' + R.id].uk}</div>
    ${st < 3 ? `<div class="en">${npc.lines['ready_' + R.id].en}</div>` : ''}
    <div class="row">${btn('hear', 'v_olia_ready_' + R.id, '🔊', 'round blue')}${btn('eatMeal', '', `${PH.duzhe_smachno.uk}${st < 3 ? `<small>${PH.duzhe_smachno.en}</small>` : ''}`)}</div></div>`);
  say('v_olia_ready_' + R.id);
}
function talk(npc) {
  const n = S.npc[npc.id] || (S.npc[npc.id] = { met: false, q: null, k: 0 });
  const steps = [line(npc, 'greet')];
  if (!n.met) { steps.push(line(npc, 'intro')); n.met = true; }
  if (n.mad) return dialog(npc, [line(npc, 'angry')]);
  if (npc.id === 'olia') tutEvent('olia');
  if (npc.id === 'olia' && D.recipes[S.recipe.i]) return talkOlia(npc, n, steps);
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
    const q = quest(item);
    q.after = () => { n.q = item; learn(item); setGuide(); save(); };
    steps.push(q);
  }
  save();
  dialog(npc, steps);
}

// ------------------------------------------------------------------ the guide (gentle tutorial, then your errands)
const TUT = [
  { p: 'i_explore', ev: 'word', need: 5, en: 'Tap things around you to learn their names.' },
  { p: 'i_talk', ev: 'olia', en: 'Follow the road east to the other cottage.' },
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
    S.tut++; S.tutN = 0; S.coins += 3;
    while (TUT[S.tut].ev && !TUT[S.tut].need && S.did[TUT[S.tut].ev]) S.tut++;
    if (TUT[S.tut].p === 'i_decor' && !S.gift) { S.gift = 1; S.home.vazon = (S.home.vazon || 0) + 1; }
    hud();
    const next = TUT[S.tut].p;
    setTimeout(() => { toast(`${PH.molodets.uk} +3 💰`); setGuide(); if (!sheetOpen()) say('p_molodets', 'p_' + next); }, 1700);
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
    const R = n.id === 'olia' ? D.recipes[S.recipe.i] : null;
    uk = R ? `${W[R.dish].uk} ${S.recipe.got.length}/${R.needs.length}: ${W[q].acc || W[q].uk}` : `${n.name}: ${W[q].acc || W[q].uk}${st < 2 && W[q].ic[0] !== '@' ? ' ' + W[q].ic : ''}`;
    full = R ? `Grandma Olia is making ${W[R.dish].en}. She needs ${W[q].en}.` : `${n.nameEn} will pay 6 ₴ for ${W[q].en}.`; en = st < 2 ? full : '';
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
  mode = 'home';
  $('#exit').innerHTML = lab('exit'); $('#decorBtn').innerHTML = '🪑 ' + lab('decor'); $('#homebar').style.display = 'flex';
  const mid = DECOR.stil.x * roomW() - cv.width / 2;
  roomX = mid; clampPan();
  // The first few times in, the view glides from one end of the room to the other and settles at the table,
  // so it's clear there's more to see. Touching the screen stops it.
  if (panMax() > 10 && (S.tours || 0) < 3) { S.tours = (S.tours || 0) + 1; save(); roomX = 0; tour = { t0: nowT, mid }; }
  blip(520);
}
function exitHomeNow() { tour = null; mode = 'world'; $('#homebar').style.display = 'none'; blip(440); }
function homeTap(sx, py) {
  const px = sx + roomX;
  const friends = D.cats.filter(ct => S.cats[ct.id]);
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
function catSpot(i) {
  // The first friend curls up in the cat bed, the second sits on top of the cat tree, if they're in the room.
  if (i === 0 && S.decor.lezhanka) { const r = decorRect('lezhanka'); return { x: r.cx + r.sz * 0.05, y: r.by - r.sz * 0.08, s: roomU() * 0.3, sleep: true }; }
  if (i === 1 && S.decor.kihtetochka) { const r = decorRect('kihtetochka'); return { x: r.cx - r.sz * 0.1, y: r.by - r.sz * 0.9, s: roomU() * 0.16 }; }
  const xs = [0.55, 0.25, 0.66, 0.12, 0.84, 0.36]; return { x: xs[i % 6] * roomW(), y: cv.height * 0.885, s: roomU() * 0.25 };
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
    else drawIcon(c, W[id].ic, r.cx, r.by, r.sz);
  }
  D.cats.filter(ct => S.cats[ct.id]).forEach((ct, i) => { const p = catSpot(i); if (p.sleep) sleepingCat(c, p.x, p.y, p.s, sitPal(ct.v), t); else cat(c, p.x, p.y, p.s, sitPal(ct.v), t, i * 1.3, i % 2 ? -1 : 1); });
  if (ids.length === BASICS.length && stage() < 3) {
    c.fillStyle = 'rgba(74,44,26,.55)'; c.font = `700 ${Math.round(u * 0.036)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('Make it yours: tap 🪑 Прикрасити below.', roomX + w / 2, h * 0.665);
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
    if (d <= step) { P.x = n.x; P.y = n.y; P.path.shift(); step -= d; P.step += d; if (!P.path.length) { S.x = P.x; S.y = P.y; save(); arrive(); } }
    else { P.x += dx / d * step; P.y += dy / d * step; P.step += step; step = 0; }
  }
  if (P.moving && P.step - P.dust > 0.55) { P.dust = P.step; fxDust(P.rx, P.ry); }
  { const far = Math.hypot(P.x - P.rx, P.y - P.ry) > 2.5, k = far ? 1 : 1 - Math.exp(-rdt * 20);
    P.rx += (P.x - P.rx) * k; P.ry += (P.y - P.ry) * k;
    P.fs += (P.face - P.fs) * (1 - Math.exp(-rdt * 22));
    P.wk += ((P.moving ? 1 : 0) - P.wk) * (1 - Math.exp(-rdt * 14)); }
  for (const e of ents) {
    if (e.kind === 'animal') {
      e.tw -= dt;
      if (e.tw <= 0) { e.tw = rnd(2, 6); const a = rnd(0, 7), r = rnd(0, e.r); const nx = e.hx + Math.cos(a) * r, ny = e.hy + Math.sin(a) * r * 0.6; if (e.water ? inPond(nx, ny, -0.5) : !solid[Math.floor(ny)][Math.floor(nx)]) { e.gx = nx; e.gy = ny; } }
      if (e.gx !== undefined) { const dx = e.gx - e.x, dy = e.gy - e.y, d = Math.hypot(dx, dy); const sp = SPEED[e.an] || 0.5; if (d > 0.03) { e.x += dx / d * sp * dt; e.y += dy / d * sp * dt; if (Math.abs(dx) > 0.01) e.face = dx > 0 ? -1 : 1; e.walk = true; e.step = (e.step || 0) + sp * dt; } else e.walk = false; }
    } else if (e.kind === 'fly') {
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
// "My cottage" on a little red-and-cream banner above the roof, with a heart.
function homeSign(c, x, y, t) {
  const top = stage() < 3 ? 'Моя хата' : 'Моя хата', sub = stage() < 3 ? 'My cottage' : '';
  c.save(); c.translate(x, y + Math.sin(t * 1.6) * 2);
  c.font = '900 22px "Cozy", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = Math.max(c.measureText('❤ ' + top).width, sub ? 90 : 0) + 30, h = sub ? 50 : 34;
  c.fillStyle = 'rgba(74,44,26,.25)'; rr(c, -w / 2 + 2, -h / 2 + 4, w, h, 12);
  c.fillStyle = '#4a2c1a'; rr(c, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 14);
  c.fillStyle = '#fff8ea'; rr(c, -w / 2, -h / 2, w, h, 12);
  c.fillStyle = '#d43a3a'; c.fillRect(-w / 2 + 8, -h / 2 + 4, w - 16, 3); c.fillRect(-w / 2 + 8, h / 2 - 5, w - 16, 2.5);
  c.fillStyle = '#e2574c'; c.fillText('❤', -c.measureText(' ' + top).width / 2 - 2, sub ? -8 : 1);
  c.fillStyle = '#3b2f2a'; c.fillText(top, 12, sub ? -8 : 1);
  if (sub) { c.font = '700 13px system-ui, sans-serif'; c.fillStyle = '#8a7566'; c.fillText(sub, 0, 11); }
  c.restore();
}
function drawWorld(t) {
  const c = ctx;
  c.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
  c.drawImage(ground, 0, 0);
  if (GFX.water) drawWater(c, t);
  const vw = cv.width / zoom, vh = cv.height / zoom;
  const list = ents.filter(e => !(e.hide && !ready(e)) && e.x * T > camX - 200 && e.x * T < camX + vw + 200 && e.y * T > camY - 100 && e.y * T < camY + vh + 320);
  list.push({ me: true, y: P.ry, x: P.rx });
  list.sort((a, b) => (a.flat ? -1e3 : 0) + a.y - ((b.flat ? -1e3 : 0) + b.y));
  for (const e of list) {
    const x = e.x * T, y = e.y * T;
    if (e.me) { c.save(); c.translate(x, y); c.scale(P.fs >= 0 ? Math.max(0.2, P.fs) : Math.min(-0.2, P.fs), 1); person(c, 0, 0, ME, t, P.wk, 1, P.step * 3.7); c.restore(); continue; }
    if (e.kind === 'npc') { chore(c, x, y, e.npc, t, 0); person(c, x, y, NPC[e.npc].look, t + e.x, false, 1); chore(c, x, y, e.npc, t, 1); continue; }
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
      const dir = e.face === -1 ? -1 : 1, wig = Math.sin(t * (e.walk ? 9 : 3) + e.hx) * 0.35, k = e.s;
      c.save(); c.translate(x, y - 6); c.scale(dir * k, k);
      c.fillStyle = 'rgba(28,70,105,.42)'; ell(c, 0, 0, 20, 8);
      c.save(); c.translate(-17, 0); c.rotate(wig); c.beginPath(); c.moveTo(0, 0); c.lineTo(-13, -8); c.lineTo(-13, 8); c.closePath(); c.fill(); c.restore();
      c.restore();
      continue;
    }
    if (e.an) { drawAnimal(c, x, y, e, t); continue; }
    const s = e.s * T;
    if (!e.flat && e.kind !== 'fly') { c.fillStyle = 'rgba(0,0,0,.13)'; ell(c, x, y, s * (e.ic[0] === '@' ? 0.36 : 0.28), s * 0.09); }
    const hop = e.kind === 'animal' && e.walk ? Math.abs(Math.sin(t * 9 + e.x)) * 3 : e.kind === 'fly' ? Math.sin(t * 9 + e.ph) * 4 : 0;
    if (e.face === -1 && e.ic[0] !== '@') { c.save(); c.translate(x, 0); c.scale(-1, 1); drawIcon(c, e.ic, 0, y - hop, s); c.restore(); }
    else if ((e.w === 'kvitka' || e.w === 'soniashnyk') && e.ic[0] !== '@') emojiSprite(c, e.ic, x, y, s, GFX.sway ? Math.sin(t * 1.5 + e.x * 2.3 + e.y) * 0.06 : 0, zoom);   // flowers nod in the breeze
    else drawIcon(c, e.ic, x, y - hop, s, { t, fruit: e.give === 'yabluko' ? ready(e) : true, sway: GFX.sway ? Math.sin(t * 1.1 + e.x * 1.7) * 0.028 + Math.sin(t * 2.6 + e.y) * 0.009 : 0 });
    if (e.w === 'khata' && GFX.smoke) smoke(c, x + s * 0.27, y - s * 0.9, t, s / 220);
  }
  // The watering can goes on top of everything, so the player never hides it.
  fxDraw(c);
  if (fishFx) drawFishing(c, t);
  if (waterFx) { const pe = ents.find(x => x.k === 'plot' + waterFx.i); if (pe) { c.save(); c.translate(pe.x * T, pe.y * T); c.scale(pe.s, pe.s); drawWatering(c, t - waterFx.t0); c.restore(); } }
  // Names of things you have met, when you stand near them. New or due things sparkle.
  for (const e of list) {
    if (e.me || e.kind === 'plot' || e.quiet) continue;
    const x = e.x * T, y = e.y * T, near = Math.hypot(e.x - P.x, e.y - P.y) < 3.2;
    if (e.kind === 'npc') {
      const n = S.npc[e.npc], top = y - T * 1.45;
      if (near && n && n.met) label(c, NPC[e.npc].name, x, y + 16);
      const bub = n && n.mad ? '😠' : e.npc === 'oksana' ? '🧺' : n && n.q ? (stage() < 2 && W[n.q].ic[0] !== '@' ? W[n.q].ic : '❔') : '💬';
      bubble(c, x, top + Math.sin(t * 2.5 + e.x) * 3, 19);
      drawIcon(c, bub, x, top + 12 + Math.sin(t * 2.5 + e.x) * 3, 27);
      continue;
    }
    if (e.kind === 'fly') { if (isFresh(e.w)) drawIcon(c, '✨', x + 12, y - 14, 18); continue; }
    if (e.cat) {
      const ct = D.cats.find(k => k.id === e.cat), top = y - T * 0.85 + Math.sin(t * 2.5 + e.hx) * 2;
      if (S.cats[e.cat]) drawIcon(c, '❤️', x, top + 8, 18);
      else { bubble(c, x, top, 15); drawIcon(c, stage() < 2 && W[ct.wants].ic[0] !== '@' ? W[ct.wants].ic : '❔', x, top + 9, 21); }
      if (near && S.words[e.w]) label(c, S.cats[e.cat] ? ct.name : W[e.w].uk, x, y + 16);
      continue;
    }
    const wd = S.words[e.w];
    if (e.kind === 'home') { homeSign(c, x, y - e.s * T * 0.62, t); }
    else if (e.k === 'oliaHome') { if (near) label(c, 'Хата баби Олі' + (stage() < 3 ? " · Grandma Olia's" : ''), x, y + 16); }
    else if (wd && near && e.w !== 'soniashnyk') label(c, W[e.w].uk, e.labelX ? e.labelX * T : x, y + 16);
    else if (wd && near && e.w === 'soniashnyk' && Math.hypot(e.x - P.x, e.y - P.y) < 1) label(c, W[e.w].uk, x, y + 16);
    if (isFresh(e.w) && (e.w !== 'soniashnyk' || (Math.floor(e.x) + Math.floor(e.y)) % 5 === 0)) {
      const a = 0.55 + 0.45 * Math.sin(t * 4 + e.x * 3);
      c.globalAlpha = a; drawIcon(c, '✨', x + e.s * T * 0.3, y - e.s * T * (e.flat ? 0.2 : 0.75), 24); c.globalAlpha = 1;
    }
  }
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
function cat(c, x, y, s, C, t, ph, face) {
  const k = s / 100, ch = C.chub;
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
  c.fillStyle = '#ffffff'; for (const px of [-11, 11]) { c.beginPath(); c.ellipse(px * ch, -4, 8, 6, 0, 0, 7); c.fill(); c.stroke(); }
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
  const blink = Math.sin(t * 0.8 + ph * 3) > 0.985;
  for (const ex of [-9, 9]) {
    if (blink) { c.lineWidth = 2.6; c.beginPath(); c.arc(ex, -72, 4.5, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); c.lineWidth = 3.2; }
    else { c.fillStyle = C.eye; ell(c, ex, -72, 5.2, 6.4); c.fillStyle = '#2a1a10'; ell(c, ex, -71.5, 2.6, 5.4); c.fillStyle = '#fff'; circ(c, ex + 1.6, -74.5, 1.6); }
  }
  c.fillStyle = '#f08aa0'; circ(c, -14, -63, 3.4); circ(c, 14, -63, 3.4);
  c.fillStyle = '#e8708a'; poly(c, [[-3, -65], [3, -65], [0, -62]]);
  c.lineWidth = 2; c.beginPath(); c.arc(-2.5, -61.5, 2.5, 0, Math.PI); c.moveTo(5, -61.5); c.arc(2.5, -61.5, 2.5, 0, Math.PI); c.stroke();
  c.strokeStyle = 'rgba(74,44,26,.6)'; c.lineWidth = 1.2;
  for (const dir of [-1, 1]) for (const dy of [-1.5, 2]) { c.beginPath(); c.moveTo(dir * 13, -63 + dy); c.lineTo(dir * 32, -65 + dy * 2.5); c.stroke(); }
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
  // the cats: Cleo, Cece (biggest by far) and Baby (smallest)
  const cs = hs * 0.33, cy = hy + hs * (land ? 0.18 : 0.2);
  cat(c, hx - hs * 0.4, cy, cs, CATS[0], t, 0, 1);
  cat(c, hx + hs * 0.42, cy + hs * 0.02, cs * 1.3, CATS[1], t, 1.7, -1);
  cat(c, hx + hs * 0.02, cy + hs * 0.06, cs * 0.7, CATS[2], t, 3.1, 1);
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
  if (mode === 'home') { roomX = down.rx - (ev.clientX - down.x) * k; clampPan(); return; }
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
    const R = D.recipes[S.recipe.i]; if (!R) return closeSheet();
    say('p_duzhe_smachno'); learn(R.dish); give(R.dish); S.hearts += 3;   // a meal from Grandma earns love, not money
    S.recipe = { i: S.recipe.i + 1, got: [], started: -1 };
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
  reset() { if (confirm('Start the village over from the beginning?')) { try { localStorage.removeItem(SAVE); } catch (e) {} location.reload(); } },
  close: closeSheet,
  words: wordsSheet, bag: bagSheet,
  guide() { say(guideClip); },
  guideEye() { guideEnOn = !guideEnOn; setGuide(); },
  exitHome,
  enterHome,
  hear(v) { say(v); },
  hear2(v) { say('w_' + v, 'p_bud_laska'); },
  hearItem(v) { learn(v); say('w_' + v); },
  hearWord(v) { say('w_' + v); toast(`${W[v].uk} — ${W[v].en}`); },
  peek() { cur.peeked = true; $('#en').innerHTML = `<div class="en">${W[cur.id].en}</div>`; },
  peekLine() { $('#en').innerHTML = `<div class="en">${cur.en}</div>`; },
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
    else if (shopTab === 'tools') S.gear[v] = 1;
    else give(v);
    hud(); blip(880, 0.1); say('n_' + price, 'p_diakuiu');
    toast(shopTab === 'seeds' ? `−${price} ₴  🌱 ${W.nasinnia.uk}: ${W[v].uk}${stage() < 3 ? ' · seeds to plant in your garden' : ''}` : `−${price} ₴  ${W[v].uk}`); tutEvent('buy'); save(); shop();
  },
  sell(v) { if (!(S.bag[v] > 0)) return; S.bag[v]--; S.coins += sellPrice(v); hud(); blip(820); say('w_' + v); save(); shop(); },
  hand(v) {
    const h = help; if (!h) return;
    if (v === h.target) {
      useWord(v, h.tries === 0); S.coins += 2; hud(); blip(990, 0.12); toast(`${PH.diakuiu.uk} +2 💰`);
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

hud(); setGuide();
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
window.__game = { S: () => S, P, ents, A, walkTo, interact, stage, clips: textOf, room: () => ({ roomX, RW: roomW(), w: cv.width, h: cv.height, bed: decorRect('lizhko') }), rect: id => decorRect(id), take: e => take(e), fishing: () => !!fishFx, cam: () => ({ camX: Math.round(camX), camY: Math.round(camY), peekX: Math.round(peekX), peekY: Math.round(peekY) }), homeTap, musicState: () => (music.paused ? 'paused' : 'PLAYING') + ' at ' + music.currentTime.toFixed(1) + 's' };
})();
