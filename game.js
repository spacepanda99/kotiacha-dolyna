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
  coins: 10, hearts: 0, words: {}, bag: {}, seeds: { morkva: 3 }, home: {}, placed: {},
  plots: Array.from({ length: 6 }, () => ({ c: null, ready: 0, wet: false })),
  npc: {}, tut: 0, tutN: 0, cd: {}, x: 7.5, y: 12.5,
});
let S;
try { S = Object.assign(fresh(), JSON.parse(localStorage.getItem(SAVE) || '{}')); } catch (e) { S = fresh(); }
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
  if (k === 'v') return NPC[a] && NPC[a].lines[b] ? NPC[a].lines[b].uk : '';
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
  (async () => { for (const id of ids) { if (my !== sayToken) return; await playClip(id); } })();
}
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
    c.fillStyle = '#fffdf5'; rr(c, -40, -52, 80, 52, 4);
    c.fillStyle = '#4a90d9'; c.fillRect(-40, -8, 80, 8);
    c.fillStyle = '#d8a23a'; poly(c, [[-50, -48], [0, -98], [50, -48]]);
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
  tree(c) {
    c.fillStyle = '#8a5a2b'; rr(c, -7, -40, 14, 40, 4);
    c.fillStyle = '#3f9a4a'; circ(c, 0, -66, 32); circ(c, -22, -50, 20); circ(c, 22, -50, 20);
    c.fillStyle = '#55b35c'; circ(c, -8, -76, 15); circ(c, 14, -62, 10);
  },
  appletree(c, o) {
    c.fillStyle = '#8a5a2b'; rr(c, -7, -40, 14, 40, 4);
    c.fillStyle = '#4fae55'; circ(c, 0, -66, 34); circ(c, -24, -50, 20); circ(c, 24, -50, 20);
    c.fillStyle = '#6cc86e'; circ(c, -8, -78, 14);
    if (!o || o.fruit !== false) { c.fillStyle = '#e2392f'; for (const [x, y] of [[-20, -56], [-4, -70], [14, -80], [22, -54], [2, -48], [-16, -84]]) circ(c, x, y, 5); }
  },
  bush(c) {
    c.fillStyle = '#57b25d'; circ(c, -18, -18, 20); circ(c, 16, -20, 22); circ(c, 0, -34, 22);
    c.fillStyle = '#e2574c'; circ(c, -12, -26, 3); circ(c, 8, -38, 3); circ(c, 20, -18, 3);
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
  stall(c) {
    c.fillStyle = '#8a5a2b'; c.fillRect(-45, -86, 5, 54); c.fillRect(40, -86, 5, 54);
    c.fillStyle = '#c08a55'; rr(c, -48, -36, 96, 36, 4);
    c.fillStyle = '#a8713f'; c.fillRect(-48, -36, 96, 6);
    for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#fffdf5' : '#e2574c'; c.fillRect(-48 + i * 16, -98, 16, 18); circ(c, -40 + i * 16, -80, 8); }
    const g = ['#e2392f', '#f2c230', '#5fb760', '#f08a2b', '#b05cc9'];
    g.forEach((col, i) => { c.fillStyle = col; circ(c, -32 + i * 16, -42, 7); });
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
  rug(c) {
    c.fillStyle = '#c0392b'; rr(c, -48, -46, 96, 38, 4);
    c.strokeStyle = '#2d2d2d'; c.lineWidth = 2; c.strokeRect(-43, -41, 86, 28);
    for (let i = -2; i <= 2; i++) { c.fillStyle = i % 2 ? '#fffdf5' : '#f2c230'; poly(c, [[i * 16, -37], [i * 16 + 7, -27], [i * 16, -17], [i * 16 - 7, -27]]); }
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
const iconCache = {};
function iconURL(id) {
  if (iconCache[id]) return iconCache[id];
  const k = document.createElement('canvas'); k.width = k.height = 128;
  drawIcon(k.getContext('2d'), W[id].ic, 64, 120, 112);
  return (iconCache[id] = k.toDataURL());
}

// A little villager in an embroidered shirt. (x, y) is between the feet.
function person(c, x, y, L, t, moving, sc) {
  const k = (L.small ? 0.78 : 1) * (sc || 1);
  c.save(); c.translate(x, y); c.scale(k, k);
  const bob = moving ? Math.sin(t * 12) * 2 : Math.sin(t * 2) * 0.8;
  const sw = moving ? Math.sin(t * 12) * 4 : 0;
  c.fillStyle = 'rgba(0,0,0,.16)'; ell(c, 0, 0, 17, 6);
  c.fillStyle = '#5b4636'; c.fillRect(-9 + sw, -11, 7, 11); c.fillRect(2 - sw, -11, 7, 11);
  c.fillStyle = L.skirt; rr(c, -14, -31 + bob, 28, 22, 6);
  c.fillStyle = L.shirt; rr(c, -19, -48 + bob, 7, 18, 3); rr(c, 12, -48 + bob, 7, 18, 3); rr(c, -14, -51 + bob, 28, 26, 8);
  c.fillStyle = L.trim; c.fillRect(-2, -49 + bob, 4, 18); c.fillRect(-14, -30 + bob, 28, 3);
  c.fillRect(-19, -34 + bob, 7, 2.5); c.fillRect(12, -34 + bob, 7, 2.5);
  for (let i = 0; i < 3; i++) { c.fillRect(-6, -46 + i * 6 + bob, 2, 2); c.fillRect(4, -46 + i * 6 + bob, 2, 2); }
  c.fillStyle = L.skin; circ(c, -15.5, -28 + bob, 3.5); circ(c, 15.5, -28 + bob, 3.5); circ(c, 0, -63 + bob, 14);
  c.fillStyle = L.hair; c.beginPath(); c.arc(0, -65 + bob, 14.6, Math.PI, 0); c.fill();
  c.fillStyle = '#3b2f2a'; circ(c, -5, -62 + bob, 1.8); circ(c, 5, -62 + bob, 1.8);
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
const ME = { skin: '#f5cfae', shirt: '#ffffff', trim: '#d43a3a', skirt: '#2c5fa8', hair: '#7a4a25', hat: 'none' };
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
const inPond = (x, y, g = 0) => ((x - POND.x) / (POND.rx + g)) ** 2 + ((y - POND.y) / (POND.ry + g)) ** 2 < 1;
const isRoad = (x, y) => (y === 14 && x >= 1 && x <= 34) || (x === 18 && y >= 6 && y <= 23) || (x === 7 && y >= 11 && y <= 13) || (x === 25 && y >= 11 && y <= 13) || (x >= 16 && x <= 21 && y >= 15 && y <= 19);

const ents = [];
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
  for (let i = 0; i < 6; i++) add({ w: 'horod', k: 'plot' + i, x: 10.5 + (i % 3), y: 9.5 + Math.floor(i / 3), s: 1, kind: 'plot', i, flat: true });
  for (let i = 0; i < 4; i++) add({ w: 'parkan', x: 9.5 + i, y: 11.95, s: 1, solid: true });
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
  rect(18, 16, 20, 16); add({ w: 'rynok', x: 19.5, y: 17, s: 2.8, kind: 'shop' });
  add({ w: 'lavka', x: 16.5, y: 18.9, s: 1.3, solid: true });
  // Pond.
  add({ w: 'stavok', k: 'pond', x: POND.x, y: POND.y + 0.2, s: 1, kind: 'pond', flat: true });
  add({ w: 'choven', x: 30.6, y: 20.9, s: 1.5, flat: true });
  add({ w: 'ryba', x: 28.3, y: 21.6, s: 0.8, kind: 'animal', r: 0.8, water: true, give: 'ryba', cd: 60, hide: true });
  add({ w: 'kachka', x: 30.6, y: 19.4, kind: 'animal', r: 1.0, water: true });
  add({ w: 'kachka', x: 28.6, y: 19.9, kind: 'animal', r: 0.8, water: true });
  add({ w: 'zhaba', x: 26.3, y: 23.2, s: 0.7, kind: 'animal', r: 0.5 });
  // Pasture.
  add({ w: 'korova', x: 30.2, y: 12.4, s: 1.4, kind: 'animal', r: 1.2, give: 'moloko', cd: 120 });
  add({ w: 'kin', x: 32.3, y: 13.0, s: 1.5, kind: 'animal', r: 1.0 });
  add({ w: 'koza', x: 28.6, y: 13.4, s: 1.1, kind: 'animal', r: 0.9 });
  // Beehives and the sunflower field.
  for (let i = 0; i < 3; i++) add({ w: 'vulyk', x: 4.5 + i * 1.5, y: 19.9, s: 1.3, solid: true });
  for (let i = 0; i < 3; i++) add({ w: 'bdzhola', x: 5 + i * 1.3, y: 18.6, s: 0.5, kind: 'fly', cx: 5 + i * 1.3, cy: 18.6, ph: i * 2.1 });
  for (let y = 23; y <= 25; y++) for (let x = 3; x <= 9; x++) add({ w: 'soniashnyk', x: x + 0.5, y: y + 0.85, s: 1.25, give: 'soniashnyk', cd: 150, hide: true });
  // Trees, bushes, stones, flowers, mushrooms, butterflies.
  for (const [x, y] of [[2.5, 6.9], [14.5, 6.9], [20.5, 3.9], [25.5, 4.9], [33.5, 8.9], [2.5, 17.9], [12.5, 25.9], [22.5, 25.9], [33.5, 25.9], [15.5, 2.9], [7.5, 3.9], [27.5, 2.9], [34.5, 17.9], [1.5, 12.9]]) add({ w: 'derevo', ic: '@tree', x, y, s: 2.5, solid: true });
  for (const [x, y] of [[15.5, 9.9], [21.5, 11.9], [3.5, 13.5], [33.5, 15.9], [23.5, 23.9]]) add({ w: 'kushch', x, y, s: 1.1, solid: true });
  for (const [x, y] of [[16.5, 6.9], [32.5, 10.5], [10.5, 17.9]]) add({ w: 'kamin', x, y, s: 0.8, solid: true });
  for (const [x, y] of [[13.5, 7.6], [4.5, 6.5], [22.5, 4.5], [27.5, 6.6], [16.5, 11.6], [9.5, 16.6], [24.5, 16.5], [31.5, 16.4], [12.5, 21.5], [20.5, 22.5]]) add({ w: 'kvitka', x, y, s: 0.8, give: 'kvitka', cd: 90, hide: true });
  for (const [x, y] of [[3.4, 7.5], [15.3, 7.4], [26.4, 5.4], [13.3, 26.3], [32.8, 26.3]]) add({ w: 'hryb', x, y, s: 0.7, give: 'hryb', cd: 120, hide: true });
  for (const [x, y] of [[12, 8], [26, 15.5], [8, 16.5]]) add({ w: 'metelyk', x, y, s: 0.6, kind: 'fly', cx: x, cy: y, ph: x });
  // Villagers.
  add({ w: 'khata', k: 'n_olia', x: 24.5, y: 12.7, kind: 'npc', npc: 'olia', s: 1.3 });
  add({ w: 'khata', k: 'n_oksana', x: 21.6, y: 17.4, kind: 'npc', npc: 'oksana', s: 1.3 });
  add({ w: 'khata', k: 'n_taras', x: 25.2, y: 20.9, kind: 'npc', npc: 'taras', s: 1.3 });
  add({ w: 'khata', k: 'n_andriiko', x: 14.5, y: 20.7, kind: 'npc', npc: 'andriiko', s: 1.1 });
  add({ w: 'sobaka', x: 15.7, y: 21.3, kind: 'animal', r: 1.0 });
  add({ w: 'khata', k: 'n_bohdan', x: 6.2, y: 21.3, kind: 'npc', npc: 'bohdan', s: 1.3 });
  for (const e of ents) { e.hx = e.x; e.hy = e.y; e.tw = 0; }
})();

// The ground is painted once into its own canvas.
const ground = document.createElement('canvas');
(function paintGround() {
  ground.width = MW * T; ground.height = MH * T;
  const c = ground.getContext('2d');
  c.fillStyle = '#93d36c'; c.fillRect(0, 0, ground.width, ground.height);
  let seed = 7; const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.5 ? '#86c860' : '#a1dc7b'; ell(c, r() * ground.width, r() * ground.height, 6 + r() * 20, 4 + r() * 9); }
  c.fillStyle = '#b7e08a'; ell(c, 30.5 * T, 12.6 * T, 3.6 * T, 2.2 * T);
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (isRoad(x, y)) { c.fillStyle = '#ecd9a6'; rr(c, x * T - 5, y * T - 5, T + 10, T + 10, 16); }
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) if (isRoad(x, y)) { c.fillStyle = '#f5e6bd'; for (let i = 0; i < 3; i++) ell(c, x * T + r() * T, y * T + r() * T, 5, 3); }
  for (let i = 0; i < 260; i++) { const x = r() * ground.width, y = r() * ground.height; if (isRoad(Math.floor(x / T), Math.floor(y / T))) continue; c.fillStyle = pick(['#ffffff', '#ffe36e', '#ffb3c7']); circ(c, x, y, 2.4); }
  c.fillStyle = '#d9c489'; ell(c, POND.x * T, POND.y * T, (POND.rx + 0.35) * T, (POND.ry + 0.35) * T);
  c.fillStyle = '#6cc3e8'; ell(c, POND.x * T, POND.y * T, POND.rx * T, POND.ry * T);
  c.fillStyle = '#8fd4f0'; ell(c, (POND.x - 1) * T, (POND.y - 0.8) * T, 1.4 * T, 0.5 * T);
  c.fillStyle = '#5fb760'; for (const [x, y] of [[27.2, 21.9], [31.6, 19.2], [32.3, 21.3]]) ell(c, x * T, y * T, 14, 8);
})();

// ------------------------------------------------------------------ walking
const P = { x: S.x, y: S.y, path: [], moving: false, face: 1, goal: null };
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
function walkTo(wx, wy, ent) {
  const path = findPath(wx, wy, ent);
  // If we are tapping bare ground and the end tile is the tapped tile, finish on the exact spot.
  if (!ent && path.length && Math.hypot(path[path.length - 1].x - wx, path[path.length - 1].y - wy) < 0.75 && !solid[Math.floor(wy)][Math.floor(wx)]) path[path.length - 1] = { x: wx, y: wy };
  P.path = path; P.goal = ent || null;
  if (!path.length && ent) arrive();
}
function arrive() { const e = P.goal; P.goal = null; if (e) interact(e); }

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
let onClose = null, acts = [], cur = {};
function openSheet(html, closer) {
  if (onClose) { const f = onClose; onClose = null; f(); }
  sheet.innerHTML = html; sheet.classList.add('show'); veil.classList.add('show'); sheet.scrollTop = 0;
  onClose = closer || null;
}
function closeSheet() {
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
  say('w_' + id);
}

function give(id, n = 1) { S.bag[id] = (S.bag[id] || 0) + n; save(); }
function take(e) {
  S.cd[e.k] = now() + e.cd * 1000;
  give(e.give); blip(880);
  toast(`+1 ${W[e.give].ic[0] === '@' ? '' : W[e.give].ic} ${W[e.give].uk}`);
  if (e.give !== e.w) wordCard(e.give); else closeSheet();
}
const ready = e => !(S.cd[e.k] > now());

function interact(e) {
  if (e.kind === 'npc') return talk(NPC[e.npc]);
  if (e.kind === 'plot') return plotSheet(e.i);
  if (e.kind === 'shop') { if (learn('rynok')) say('w_rynok'); return shop(); }
  if (e.kind === 'home') return wordCard('khata', { acts: [{ k: 'enter', fn: enterHome }] });
  if (e.give) return wordCard(e.w, { acts: ready(e) ? [{ k: 'take', fn: () => take(e) }] : [] });
  wordCard(e.w);
}

// ------------------------------------------------------------------ garden
function plotSheet(i) {
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
    body = `<div class="card"><img class="big" src="${iconURL(p.c)}" alt=""><div class="word">${W[p.c].uk}</div><div class="en">💧 ${D.ui.thirsty[0]}${stage() < 3 ? ' · ' + D.ui.thirsty[1] : ''}</div><div class="row">${btn('water', '', '💧 ' + lab('water'), 'blue')}</div></div>`;
  } else if (now() < p.ready) {
    body = `<div class="card"><img class="big" src="${iconURL(p.c)}" alt=""><div class="word">${W[p.c].uk}</div><div class="en">🌱 ${D.ui.growing[0]}${stage() < 3 ? ' · ' + D.ui.growing[1] : ''} (${Math.ceil((p.ready - now()) / 1000)} s)</div></div>`;
  } else {
    body = `<div class="card"><img class="big" src="${iconURL(p.c)}" alt=""><div class="word">${W[p.c].uk}</div><div class="row">${btn('harvest', '', lab('harvest'))}</div></div>`;
  }
  openSheet(head + body);
  if (fresh1) say('w_horod');
}

// ------------------------------------------------------------------ market
let shopTab = 'food', shopSel = null;
const sellPrice = id => { for (const t of ['food', 'seeds']) if (D.shop[t][id]) return Math.max(1, Math.floor(D.shop.food[id] ? D.shop.food[id] / 2 : 3)); return 3; };
function shop() {
  const tabs = ['food', 'seeds', 'home', 'sell', 'help'];
  const tabBtn = k => `<button class="tab ${shopTab === k ? 'on' : ''}" data-a="tab" data-v="${k}">${D.ui[k][0]}${stage() < 3 ? `<small>${D.ui[k][1]}</small>` : ''}</button>`;
  let body = '';
  if (shopTab === 'help') return helpRound(0);
  if (shopTab === 'sell') {
    const items = Object.keys(S.bag).filter(k => S.bag[k] > 0);
    body = items.length ? `<div class="grid">${items.map(k => `<button class="it" data-a="sell" data-v="${k}"><span class="q">${S.bag[k]}</span><img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div><div class="e">+${sellPrice(k)} ₴</div></button>`).join('')}</div>` : `<div class="muted">🧺 ${D.ui.empty[0]}${stage() < 3 ? ' · ' + D.ui.empty[1] : ''}</div>`;
  } else {
    const list = D.shop[shopTab];
    body = `<div class="grid">${Object.keys(list).map(k => `<button class="it ${shopSel === k ? 'sel' : ''}" data-a="pick" data-v="${k}">${shopTab === 'seeds' ? '<span class="q">🌱</span>' : ''}<img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div>${known(k) < 2 ? `<div class="e">${W[k].en}</div>` : ''}<div class="e"><b>${list[k]} ₴</b></div></button>`).join('')}</div>`;
    if (shopSel && list[shopSel]) body += `<div class="buyrow"><div class="what">${W[shopSel].uk} — ${list[shopSel]} ₴<br><small style="font-weight:600;color:var(--soft)">${D.prices[list[shopSel]]}</small></div>${btn('buy', shopSel, lab('buy'), 'blue')}</div>`;
  }
  openSheet(`<h3><span><span class="uk">${W.rynok.uk}</span> ${stage() < 2 ? `<small>${W.rynok.en}</small>` : ''}</span><span>💰 ${S.coins} ₴</span></h3><div class="tabs">${tabs.map(tabBtn).join('')}</div>${body}`);
}
// Helping at the stall: Oksana asks for something by name, you hand it over.
// This is where words that are due for review come back.
let help = null;
function helpRound(n) {
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
  return { yabluko: '🌳 Pick one from the apple tree by your cottage.', kvitka: '🌷 Pick a flower.', hryb: '🍄 Mushrooms grow near the trees.', voda: '💧 Draw some from the well.' }[id] || '';
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
function talk(npc) {
  const n = S.npc[npc.id] || (S.npc[npc.id] = { met: false, q: null, k: 0 });
  const steps = [line(npc, 'greet')];
  if (!n.met) { steps.push(line(npc, 'intro')); n.met = true; }
  if (npc.id === 'olia') tutEvent('olia');
  if (npc.id === 'oksana') { steps[steps.length - 1].after = () => setTimeout(shop, 50); save(); return dialog(npc, steps); }
  const quest = id => ({ uk: D.questLine.uk.replace('%s', W[id].acc || W[id].uk), en: D.questLine.en.replace('%s', 'a ' + W[id].en).replace('a a', 'an a'), clip: `q_${npc.id}_${id}`, hint: (stage() < 2 ? `<img src="${iconURL(id)}" style="width:34px;height:34px;vertical-align:middle" alt=""> ` : '') + sourceHint(id) });
  if (n.q) {
    if ((S.bag[n.q] || 0) > 0) {
      const item = n.q;
      const thanks = line(npc, 'thanks');
      thanks.after = () => { toast('+6 💰  +1 ❤️'); blip(990, 0.15); };
      const hand = mine('os');
      hand.after = () => { S.bag[item]--; S.coins += 6; S.hearts++; n.q = null; useWord(item, true); hud(); setGuide(); save(); };
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
  { p: 'i_water', ev: 'water', en: 'Tap the bed again.' },
  { p: 'i_harvest', ev: 'harvest', en: 'Give it a moment, then tap the bed.' },
  { p: 'i_market', ev: 'buy', en: 'Find the striped stall on the square and buy something.' },
  { p: 'i_decor', ev: 'place', en: 'Go into your cottage and put something in it.' },
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
let guideClip = '';
function setGuide() {
  const g = $('#guide'), s = TUT[S.tut], st = stage();
  let uk, en;
  const active = D.npcs.filter(n => S.npc[n.id] && S.npc[n.id].q);
  if (s.ev) {
    uk = PH[s.p].uk + (s.need ? ` ${S.tutN}/${s.need}` : '');
    en = st < 3 ? `${PH[s.p].en} ${s.en}` : '';
    guideClip = 'p_' + s.p;
  } else if (active.length) {
    const n = active[0], q = S.npc[n.id].q;
    uk = `${n.name}: ${W[q].acc || W[q].uk}${st < 2 && W[q].ic[0] !== '@' ? ' ' + W[q].ic : ''}`;
    en = st < 2 ? `${n.nameEn} would like ${W[q].en}.` : '';
    guideClip = `q_${n.id}_${q}`;
  } else {
    uk = PH.i_free.uk; en = st < 3 ? PH.i_free.en : ''; guideClip = 'p_i_free';
  }
  g.querySelector('.uk').textContent = uk; g.querySelector('.en').textContent = en;
}
function hud() { $('#coins').textContent = `💰 ${S.coins}`; $('#hearts').textContent = `❤️ ${S.hearts}`; }

// ------------------------------------------------------------------ bag and word book
function bagSheet() {
  const cell = (k, n, badge) => `<button class="it" data-a="hearItem" data-v="${k}"><span class="q">${badge || ''}${n}</span><img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div>${known(k) < 2 ? `<div class="e">${W[k].en}</div>` : ''}</button>`;
  const a = Object.keys(S.bag).filter(k => S.bag[k] > 0).map(k => cell(k, S.bag[k]));
  const b = Object.keys(S.seeds).filter(k => S.seeds[k] > 0).map(k => cell(k, S.seeds[k], '🌱'));
  const c = Object.keys(S.home).filter(k => S.home[k] > 0).map(k => cell(k, S.home[k], '🏠'));
  const all = [...a, ...b, ...c];
  learn('koshyk');
  openSheet(`<h3><span><span class="uk">${W.koshyk.uk}</span> ${stage() < 2 ? `<small>${W.koshyk.en}</small>` : ''}</span><span>💰 ${S.coins} ₴</span></h3>${all.length ? `<div class="grid">${all.join('')}</div>` : `<div class="muted">${D.ui.empty[0]}${stage() < 3 ? ' · ' + D.ui.empty[1] : ''}</div>`}`);
}
function wordsSheet() {
  const ids = Object.keys(S.words).sort((a, b) => S.words[a].l - S.words[b].l);
  const m = mastered(), st = stage();
  const title = ['', 'Гість · Guest', 'Сусід · Neighbour', 'Свій · One of us'][st];
  const next = st === 1 ? 12 : st === 2 ? 40 : D.words.length;
  openSheet(`<h3><span><span class="uk">${D.ui.words[0]}</span> ${st < 3 ? `<small>${D.ui.words[1]}</small>` : ''}</span><small>${ids.length} / ${D.words.length}</small></h3>
    <div style="font-weight:800">${title}</div>
    <div class="bar"><i style="width:${Math.min(100, Math.round(m / next * 100))}%"></i></div>
    ${st < 3 ? `<div class="muted" style="padding:0 0 10px;text-align:left">${m} well-known words. At ${next}, ${st === 1 ? 'the villagers stop translating themselves' : 'the village goes fully Ukrainian'}.</div>` : ''}
    ${ids.length ? `<div class="grid">${ids.map(k => `<button class="it" data-a="hearWord" data-v="${k}"><img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div><div class="e">${S.words[k].l < 3 ? W[k].en : '···'}</div><div class="lv">${'●'.repeat(S.words[k].l)}${'○'.repeat(5 - S.words[k].l)}</div></button>`).join('')}</div>` : `<div class="muted">${D.ui.empty[0]}</div>`}`);
}

// ------------------------------------------------------------------ inside the cottage
let mode = 'world';
function homeSlots() {
  const w = cv.width, h = cv.height, out = [];
  for (let i = 0; i < 4; i++) out.push({ k: 'w' + i, x: w * (0.17 + i * 0.22), y: h * 0.33, r: Math.min(w * 0.1, h * 0.065), wall: true });
  for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) out.push({ k: 'f' + (r * 4 + c), x: w * (0.17 + c * 0.22), y: h * (0.57 + r * 0.105), r: Math.min(w * 0.1, h * 0.052), wall: false });
  return out;
}
function enterHome() { closeSheet(); mode = 'home'; const e = $('#exit'); e.innerHTML = lab('exit'); e.style.display = 'inline-flex'; blip(520); }
function exitHome() { mode = 'world'; $('#exit').style.display = 'none'; blip(440); }
function homeTap(px, py) {
  const w = cv.width, h = cv.height;
  if (Math.hypot(px - w * 0.14, py - h * 0.9) < h * 0.06) return wordCard('kit');
  let best = null, bd = 1e9;
  for (const s of homeSlots()) { const d = Math.hypot(px - s.x, py - (s.y - s.r * 0.6)); if (d < s.r * 1.25 && d < bd) { bd = d; best = s; } }
  if (!best) return;
  const id = S.placed[best.k];
  if (id) return wordCard(id, { acts: [{ k: 'putaway', fn: () => { delete S.placed[best.k]; S.home[id] = (S.home[id] || 0) + 1; save(); closeSheet(); } }] });
  const fits = Object.keys(S.home).filter(k => S.home[k] > 0 && D.wallItems.includes(k) === best.wall);
  cur = { slot: best.k };
  openSheet(`<h3><span class="uk">${D.ui.place[0]}${stage() < 3 ? ` <small>${D.ui.place[1]} ${best.wall ? 'on the wall' : 'on the floor'}</small>` : ''}</span></h3>` +
    (fits.length ? `<div class="grid">${fits.map(k => `<button class="it" data-a="place" data-v="${k}"><span class="q">${S.home[k]}</span><img src="${iconURL(k)}" alt=""><div class="n">${W[k].uk}</div>${known(k) < 2 ? `<div class="e">${W[k].en}</div>` : ''}</button>`).join('')}</div>`
      : `<div class="muted">${D.ui.empty[0]}.<br>${stage() < 3 ? `Oksana sells things for the ${best.wall ? 'wall' : 'floor'} at the market.` : 'Купи щось на ринку.'}</div>`));
}
function drawHome(t) {
  const w = cv.width, h = cv.height, c = ctx;
  c.fillStyle = '#fdf6e3'; c.fillRect(0, 0, w, h * 0.5);
  c.fillStyle = '#c99a63'; c.fillRect(0, h * 0.5, w, h * 0.5);
  c.strokeStyle = 'rgba(120,80,40,.25)'; c.lineWidth = Math.max(2, h * 0.003);
  for (let i = 1; i < 9; i++) { c.beginPath(); c.moveTo(0, h * (0.5 + i * 0.055)); c.lineTo(w, h * (0.5 + i * 0.055)); c.stroke(); }
  // Embroidery-style border along the top of the wall, and a blue skirting line.
  const u = Math.max(10, w / 36), y0 = h * 0.17;
  for (let x = 0; x < w + u; x += u * 2) { c.fillStyle = '#d43a3a'; poly(c, [[x, y0], [x + u * 0.8, y0 + u * 0.8], [x, y0 + u * 1.6], [x - u * 0.8, y0 + u * 0.8]]); c.fillStyle = '#2d2d2d'; circ(c, x + u, y0 + u * 0.8, u * 0.22); }
  c.fillStyle = '#4a90d9'; c.fillRect(0, h * 0.485, w, h * 0.015);
  const slots = homeSlots();
  for (const s of slots) {
    const id = S.placed[s.k];
    if (id) drawIcon(c, W[id].ic, s.x, s.y + (s.wall ? s.r * 0.3 : s.r * 0.5), s.r * 2.1);
    else {
      c.strokeStyle = 'rgba(90,60,30,.28)'; c.lineWidth = Math.max(2, h * 0.003); c.setLineDash([h * 0.012, h * 0.01]);
      c.beginPath(); c.arc(s.x, s.y - s.r * 0.6, s.r * 0.75, 0, 7); c.stroke(); c.setLineDash([]);
      c.fillStyle = 'rgba(90,60,30,.3)'; c.font = `${s.r}px sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('+', s.x, s.y - s.r * 0.6);
    }
  }
  drawIcon(c, '🐈', w * 0.14, h * 0.93 + Math.sin(t * 2) * h * 0.003, h * 0.09);
}

// ------------------------------------------------------------------ the world, drawn
let zoom = 1, camX = 0, camY = 0;
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.round(innerWidth * dpr); cv.height = Math.round(innerHeight * dpr);
  zoom = Math.max(Math.min(cv.width, cv.height) / (7.4 * T), Math.max(cv.width, cv.height) / (15 * T));
}
addEventListener('resize', resize); resize();

function update(dt, t) {
  // Walk along the path.
  let step = 3.4 * dt; P.moving = false;
  while (P.path.length && step > 0) {
    const n = P.path[0], dx = n.x - P.x, dy = n.y - P.y, d = Math.hypot(dx, dy);
    P.moving = true;
    if (Math.abs(dx) > 0.02) P.face = dx > 0 ? 1 : -1;
    if (d <= step) { P.x = n.x; P.y = n.y; P.path.shift(); step -= d; if (!P.path.length) { S.x = P.x; S.y = P.y; save(); arrive(); } }
    else { P.x += dx / d * step; P.y += dy / d * step; step = 0; }
  }
  for (const e of ents) {
    if (e.kind === 'animal') {
      e.tw -= dt;
      if (e.tw <= 0) { e.tw = rnd(2, 6); const a = rnd(0, 7), r = rnd(0, e.r); const nx = e.hx + Math.cos(a) * r, ny = e.hy + Math.sin(a) * r * 0.6; if (e.water ? inPond(nx, ny, -0.5) : !solid[Math.floor(ny)][Math.floor(nx)]) { e.gx = nx; e.gy = ny; } }
      if (e.gx !== undefined) { const dx = e.gx - e.x, dy = e.gy - e.y, d = Math.hypot(dx, dy); if (d > 0.03) { e.x += dx / d * 0.5 * dt; e.y += dy / d * 0.5 * dt; e.face = dx > 0 ? -1 : 1; e.walk = true; } else e.walk = false; }
    } else if (e.kind === 'fly') {
      e.x = e.cx + Math.sin(t * 0.7 + e.ph) * 1.4 + Math.sin(t * 2.3 + e.ph) * 0.2;
      e.y = e.cy + Math.cos(t * 0.5 + e.ph * 2) * 0.8;
    }
  }
  const vw = cv.width / zoom, vh = cv.height / zoom;
  const tx = Math.max(0, Math.min(MW * T - vw, P.x * T - vw / 2)), ty = Math.max(0, Math.min(MH * T - vh, P.y * T - vh * 0.52));
  camX += (tx - camX) * Math.min(1, dt * 6); camY += (ty - camY) * Math.min(1, dt * 6);
}

function label(c, text, x, y) {
  c.font = '700 17px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(text).width + 16;
  c.fillStyle = 'rgba(255,248,234,.92)'; rr(c, x - w / 2, y - 12, w, 24, 12);
  c.fillStyle = '#3b2f2a'; c.fillText(text, x, y + 1);
}
function drawWorld(t) {
  const c = ctx;
  c.setTransform(zoom, 0, 0, zoom, -camX * zoom, -camY * zoom);
  c.drawImage(ground, 0, 0);
  const vw = cv.width / zoom, vh = cv.height / zoom;
  const list = ents.filter(e => !(e.hide && !ready(e)) && e.x * T > camX - 200 && e.x * T < camX + vw + 200 && e.y * T > camY - 100 && e.y * T < camY + vh + 320);
  list.push({ me: true, y: P.y, x: P.x });
  list.sort((a, b) => (a.flat ? -1e3 : 0) + a.y - ((b.flat ? -1e3 : 0) + b.y));
  for (const e of list) {
    const x = e.x * T, y = e.y * T;
    if (e.me) { c.save(); c.translate(x, y); c.scale(P.face, 1); person(c, 0, 0, ME, t, P.moving, 1); c.restore(); continue; }
    if (e.kind === 'npc') { person(c, x, y, NPC[e.npc].look, t + e.x, false, 1); continue; }
    if (e.kind === 'pond') continue;
    if (e.kind === 'plot') {
      drawIcon(c, '@plot', x, y + T * 0.5, T);
      const p = S.plots[e.i];
      if (p.c) {
        if (!p.wet) { drawIcon(c, '🌱', x, y + T * 0.2, T * 0.5); drawIcon(c, '💧', x + T * 0.28, y - T * 0.15 + Math.sin(t * 4) * 3, T * 0.4); }
        else if (now() < p.ready) { const g = 1 - (p.ready - now()) / 50e3; drawIcon(c, '🌱', x, y + T * 0.25, T * (0.45 + 0.4 * Math.max(0, g))); }
        else drawIcon(c, W[p.c].ic, x, y + T * 0.3 + Math.sin(t * 3 + e.i) * 3, T * 0.85);
      }
      continue;
    }
    const s = e.s * T;
    if (!e.flat && e.kind !== 'fly') { c.fillStyle = 'rgba(0,0,0,.13)'; ell(c, x, y, s * (e.ic[0] === '@' ? 0.36 : 0.28), s * 0.09); }
    const hop = e.kind === 'animal' && e.walk ? Math.abs(Math.sin(t * 9 + e.x)) * 3 : e.kind === 'fly' ? Math.sin(t * 9 + e.ph) * 4 : 0;
    if (e.face === -1 && e.ic[0] !== '@') { c.save(); c.translate(x, 0); c.scale(-1, 1); drawIcon(c, e.ic, 0, y - hop, s); c.restore(); }
    else drawIcon(c, e.ic, x, y - hop, s, { t, fruit: e.give === 'yabluko' ? ready(e) : true });
  }
  // Names of things you have met, when you stand near them. New or due things sparkle.
  for (const e of list) {
    if (e.me || e.kind === 'plot') continue;
    const x = e.x * T, y = e.y * T, near = Math.hypot(e.x - P.x, e.y - P.y) < 3.2;
    if (e.kind === 'npc') {
      const n = S.npc[e.npc], top = y - T * 1.45;
      if (near && n && n.met) label(c, NPC[e.npc].name, x, y + 16);
      const bub = e.npc === 'oksana' ? '🧺' : n && n.q ? (stage() < 2 && W[n.q].ic[0] !== '@' ? W[n.q].ic : '❔') : '💬';
      c.fillStyle = 'rgba(255,248,234,.95)'; circ(c, x, top + Math.sin(t * 2.5 + e.x) * 3, 19);
      drawIcon(c, bub, x, top + 12 + Math.sin(t * 2.5 + e.x) * 3, 27);
      continue;
    }
    if (e.kind === 'fly') { if (isFresh(e.w)) drawIcon(c, '✨', x + 12, y - 14, 18); continue; }
    const wd = S.words[e.w];
    if (wd && near && e.w !== 'soniashnyk') label(c, W[e.w].uk, x, y + 16);
    else if (wd && near && e.w === 'soniashnyk' && Math.hypot(e.x - P.x, e.y - P.y) < 1) label(c, W[e.w].uk, x, y + 16);
    if (isFresh(e.w) && (e.w !== 'soniashnyk' || (Math.floor(e.x) + Math.floor(e.y)) % 5 === 0)) {
      const a = 0.55 + 0.45 * Math.sin(t * 4 + e.x * 3);
      c.globalAlpha = a; drawIcon(c, '✨', x + e.s * T * 0.3, y - e.s * T * (e.flat ? 0.2 : 0.75), 24); c.globalAlpha = 1;
    }
  }
  if (P.path.length) { const g = P.path[P.path.length - 1]; c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 3; c.beginPath(); c.arc(g.x * T, g.y * T, 10 + Math.sin(t * 8) * 3, 0, 7); c.stroke(); }
  c.setTransform(1, 0, 0, 1, 0, 0);
}

let last = 0, running = false;
function frame(ms) {
  const t = ms / 1000, dt = Math.min(0.05, t - last || 0.016); last = t;
  if (mode === 'home') { ctx.setTransform(1, 0, 0, 1, 0, 0); drawHome(t); }
  else { if (running && !sheetOpen()) update(dt, t); else update(0, t); drawWorld(t); }
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
cv.addEventListener('pointerdown', ev => { down = { x: ev.clientX, y: ev.clientY, t: now() }; });
cv.addEventListener('pointerup', ev => {
  if (!down || !running || sheetOpen()) return;
  const moved = Math.hypot(ev.clientX - down.x, ev.clientY - down.y); down = null;
  if (moved > 18) return;
  const k = cv.width / innerWidth, px = ev.clientX * k, py = ev.clientY * k;
  if (mode === 'home') return homeTap(px, py);
  const wx = (camX + px / zoom) / T, wy = (camY + py / zoom) / T;
  const e = hitEnt(wx, wy);
  blip(e ? 700 : 560, 0.05);
  if (e) walkTo(e.x, e.kind === 'pond' ? wy : e.y, e); else walkTo(wx, wy, null);
});

const A = {
  start() { $('#start').style.display = 'none'; running = true; hud(); setGuide(); say('p_pryvit', guideClip); },
  reset() { if (confirm('Start the village over from the beginning?')) { try { localStorage.removeItem(SAVE); } catch (e) {} location.reload(); } },
  close: closeSheet,
  words: wordsSheet, bag: bagSheet,
  guide() { say(guideClip); },
  exitHome,
  hear(v) { say(v); },
  hear2(v) { say('w_' + v, 'p_bud_laska'); },
  hearItem(v) { learn(v); say('w_' + v); },
  hearWord(v) { say('w_' + v); toast(`${W[v].uk} — ${W[v].en}`); },
  peek() { cur.peeked = true; $('#en').innerHTML = `<div class="en">${W[cur.id].en}</div>`; },
  peekLine() { $('#en').innerHTML = `<div class="en">${cur.en}</div>`; },
  act(v) { const a = acts[+v]; if (a) a.fn(); },
  next() { const d = dlg; if (!d) return closeSheet(); const st = d.steps[d.i]; dialog(d.npc, d.steps, d.i + 1); if (st.after) st.after(); },
  choose(v) { const d = dlg; if (!d) return; const c = d.steps[d.i].choices[+v]; say(c.clip); setTimeout(() => { if (dlg === d) dialog(d.npc, d.steps, d.i + 1); }, 1500); },
  plant(v) { const p = S.plots[cur.plot]; if (!(S.seeds[v] > 0)) return; S.seeds[v]--; p.c = v; p.wet = false; p.ready = 0; learn(v); learn('nasinnia'); closeSheet(); say('w_' + v); blip(600); tutEvent('plant'); save(); },
  water() { const p = S.plots[cur.plot]; p.wet = true; p.ready = now() + 50e3; closeSheet(); learn('voda'); say('w_voda'); blip(760); tutEvent('water'); save(); },
  harvest() { const p = S.plots[cur.plot], c = p.c; p.c = null; give(c, 2); toast(`+2 ${W[c].ic} ${W[c].uk}`); tutEvent('harvest'); wordCard(c); save(); },
  tab(v) { shopTab = v; shopSel = null; shop(); },
  pick(v) { shopSel = v; learn(v); shop(); say('w_' + v); },
  buy(v) {
    const price = D.shop[shopTab][v];
    if (S.coins < price) { toast(`${D.ui.notenough[0]}${stage() < 3 ? ' · ' + D.ui.notenough[1] : ''}`); return; }
    S.coins -= price;
    if (shopTab === 'seeds') { S.seeds[v] = (S.seeds[v] || 0) + 1; learn('nasinnia'); }
    else if (shopTab === 'home') S.home[v] = (S.home[v] || 0) + 1;
    else give(v);
    hud(); blip(880, 0.1); say('n_' + price, 'p_diakuiu'); toast(`−${price} ₴  ${W[v].uk}`); tutEvent('buy'); save(); shop();
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
  place(v) { if (!(S.home[v] > 0)) return; S.home[v]--; S.placed[cur.slot] = v; closeSheet(); learn(v); say('w_' + v); blip(700); tutEvent('place'); save(); },
};
document.addEventListener('click', ev => {
  const el = ev.target.closest('[data-a]'); if (!el) return;
  const f = A[el.dataset.a]; if (f) f(el.dataset.v);
});
document.addEventListener('contextmenu', ev => ev.preventDefault());

hud(); setGuide();
requestAnimationFrame(frame);
// For automated checks.
window.__game = { S: () => S, P, ents, A, walkTo, interact, stage, clips: textOf };
})();
