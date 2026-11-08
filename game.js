// Le jeu démarre quand chargeur.js a lu les données JSON et les modules.
(window.COG_READY || Promise.resolve()).then(() => {
'use strict';
const DATA = window.COG_DATA || {};

// ============================================================
//  Platform layer: CrazyGames SDK v3 / Poki SDK v2 (falls back to a mock outside both)
// ============================================================
let adPlaying = false;
const DEV = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === 'file:';
// The platform is picked by which SDK script index.html loaded.
const PLATFORM = window.PokiSDK ? 'poki' : 'crazygames';
// CrazyGames « Basic Launch » : les pubs y sont désactivées, et un bouton de pub récompensée sans effet
// fait refuser le jeu. On n'appelle donc aucune pub CrazyGames tant que le jeu n'est pas en Full Launch.
// Passer à true quand CrazyGames sélectionne le jeu pour le Full Launch.
let CG_ADS = false;
const SDK = {
  cg: null, poki: null, gameplay: false, adsOff: false, interacted: false, pendingStart: false, lastMidgame: 0,
  async init() {
    if (PLATFORM === 'poki') {
      try { await Promise.race([window.PokiSDK.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('Poki init timeout')), 10000))]); this.poki = window.PokiSDK; }
      catch (e) { this.poki = window.PokiSDK; this.adsOff = true; }   // init failed (e.g. adblock): load anyway, no reward offers
      return;
    }
    try {
      const cg = window.CrazyGames && window.CrazyGames.SDK;
      if (!cg) return;
      await Promise.race([cg.init(), new Promise((_, rej) => setTimeout(() => rej(new Error('SDK init timeout')), 10000))]);
      if (cg.environment !== 'disabled') {
        this.cg = cg;
        // the platform can mute games (required for full launch): follow it live
        try { applyPlatformSettings(cg.game.settings); cg.game.addSettingsChangeListener(applyPlatformSettings); } catch (e) {}
      }
    } catch (e) { console.warn('CrazyGames SDK unavailable.', e); }
  },
  safe(fn) { if (!this.cg) return; try { fn(this.cg); } catch (e) { console.warn(e); } },
  psafe(fn) { if (!this.poki) return; try { fn(this.poki); } catch (e) { console.warn(e); } },
  loadingStart() { this.safe(c => c.game.loadingStart()); },
  loadingStop() { this.safe(c => c.game.loadingStop()); this.psafe(p => p.gameLoadingFinished()); },
  gameplayStart() {
    if (this.gameplay) return;
    // Poki: gameplayStart must follow the player's first input, never page load
    if (PLATFORM === 'poki' && !this.interacted) { this.pendingStart = true; return; }
    this.gameplay = true; this.pendingStart = false;
    this.safe(c => c.game.gameplayStart()); this.psafe(p => p.gameplayStart());
  },
  gameplayStop() {
    this.pendingStart = false;
    if (!this.gameplay) return;
    this.gameplay = false;
    this.safe(c => c.game.gameplayStop()); this.psafe(p => p.gameplayStop());
  },
  onFirstInput() { if (this.interacted) return; this.interacted = true; if (this.pendingStart && state === 'play') this.gameplayStart(); },
  happytime() { this.safe(c => c.game.happytime()); },
  // type: 'midgame' (CrazyGames midgame / Poki commercialBreak) or 'rewarded'. Resolves true only if the ad was watched.
  ad(type) {
    if (this.cg && !this.poki && !CG_ADS) return Promise.resolve(false);   // Basic Launch : aucune pub, le jeu continue tout de suite
    // safety delay: never two midgames within a minute (Poki also throttles on its side)
    if (type === 'midgame' && PLATFORM !== 'poki' && performance.now() - this.lastMidgame < 60000 && this.lastMidgame) return Promise.resolve(false);
    if (type === 'midgame') this.lastMidgame = performance.now();
    return new Promise(resolve => {
      let finished = false, to = null;
      const done = ok => { if (finished) return; finished = true; clearTimeout(to); onAdEnd(); resolve(ok); };
      onAdStart();   // pauses the game and blocks input; audio is muted as soon as the ad actually starts
      to = setTimeout(() => done(false), 15000);   // a silent SDK must never lock the game (cleared once the ad starts)
      // once an ad really starts, allow it up to 90s; past that, never leave the player stuck
      const started = () => { clearTimeout(to); to = setTimeout(() => done(false), 90000); audioDuck(true); };
      if (this.poki) {
        try {
          const call = type === 'rewarded' ? this.poki.rewardedBreak(started) : this.poki.commercialBreak(started);
          Promise.resolve(call).then(r => done(type === 'rewarded' ? !!r : true), () => done(false));
        } catch (e) { done(false); }
        return;
      }
      if (!this.cg) { if (DEV) { audioDuck(true); return mockAd(type, done); } return done(false); }
      try {
        this.cg.ad.requestAd(type, {
          adStarted: started,
          adFinished: () => done(true),
          adError: err => { if (err && (err.code === 'adsDisabled' || err.code === 'adblock')) this.adsOff = true; done(false); },
        });
      } catch (e) { done(false); }
    });
  },
  // CrazyGames: cloud-synced Data module; Poki (and fallback): localStorage, always guarded (incognito / blocked storage)
  getItem(k) { try { return this.cg && this.cg.data ? this.cg.data.getItem(k) : localStorage.getItem(k); } catch { return null; } },
  setItem(k, v) { try { if (this.cg && this.cg.data) this.cg.data.setItem(k, v); else localStorage.setItem(k, v); } catch {} },
};
let mockMidgameCount = 0;
function mockAd(type, done) {
  if (type === 'midgame' && (++mockMidgameCount % 3 !== 0)) return done(true);
  const el = document.getElementById('adMock'), cnt = document.getElementById('adCount');
  if (!el || !cnt) return done(type === 'midgame');
  let n = 2; cnt.textContent = n; el.classList.remove('hidden');
  const iv = setInterval(() => { n--; cnt.textContent = n; if (n <= 0) { clearInterval(iv); el.classList.add('hidden'); done(true); } }, 1000);
}
let platformMuted = false, ducked = false;
const silent = () => muted || platformMuted;
function applyPlatformSettings(st) { platformMuted = !!(st && st.muteAudio); refreshAudio(); }
function audioDuck(on) { ducked = on; refreshAudio(); }
function refreshAudio() { if (!actx) return; if (silent() || ducked || adPlaying) actx.suspend().catch(() => {}); else actx.resume().catch(() => {}); }
function onAdStart() { adPlaying = true; keys.clear(); joy = null; }
function onAdEnd() { adPlaying = false; ducked = false; refreshAudio(); lastFrame = performance.now(); }
// rewarded offers are only shown when an ad can actually play (hidden with adblock / ads disabled)
const rewardedOK = () => (SDK.poki ? !SDK.adsOff : SDK.cg ? CG_ADS && !SDK.adsOff : DEV);

// ============================================================
//  Helpers
// ============================================================
const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);   // frame-rate independent smoothing factor
const easeOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const easeOut = x => 1 - Math.pow(1 - x, 3);
function prng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }
const hash2 = (x, y) => { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return (h ^ (h >>> 16)) >>> 0; };
const own = (o, k) => o && typeof o === 'object' && Object.prototype.hasOwnProperty.call(o, k);
// Événements partagés avec les modules (modules/*.js) : on(nom, fn) pour écouter, emit pour prévenir,
// ask pour demander si un module prend en charge (ex. une touche) : le premier qui répond true gagne.
const hooks = {};
const on = (ev, fn) => { (hooks[ev] = hooks[ev] || []).push(fn); };
const emit = (ev, ...a) => { const h = hooks[ev]; if (h) for (const f of h) f(...a); };
const ask = (ev, ...a) => { const h = hooks[ev]; if (h) for (const f of h) if (f(...a)) return true; return false; };
const MOD = {};   // modules chargés, par nom (MOD.sac, MOD.balises...)
// triches du mode debug (toujours false dans les versions publiées : le module debug n'y est pas)
const cheat = { god: false, fuel: false };
// bonus des équipements portés (voir modules/sac.js) : somme des « valeur » des objets équipés ayant cet effet
const bonus = effet => (MOD.sac ? MOD.sac.bonus(effet) : 0);
const fmt = n => { n = Math.floor(n); return n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 10000 ? Math.floor(n / 1000) + 'K' : String(n); };

// ============================================================
//  Art: build sprites from the pixel data in sprites.js
// ============================================================
const ART = window.COG_ART;
const OUTLINE = '#1a1622';
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function build(rows, { map = null, outline = OUTLINE } = {}) {
  const h = rows.length, w = rows[0].length, pad = outline ? 1 : 0, W2 = w + pad * 2, H2 = h + pad * 2;
  const c = document.createElement('canvas'); c.width = W2; c.height = H2;
  const x = c.getContext('2d'), img = x.createImageData(W2, H2), d = img.data, solid = new Uint8Array(W2 * H2);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const ch = rows[j][i]; if (ch === '.') continue;
    const col = (map && map[ch]) || ART.PAL[ch]; if (!col) continue;
    const [r, g, b] = hexRgb(col);
    const k = (j + pad) * W2 + i + pad; solid[k] = 1;
    d[k * 4] = r; d[k * 4 + 1] = g; d[k * 4 + 2] = b; d[k * 4 + 3] = 255;
  }
  if (outline) {
    const [r, g, b] = hexRgb(outline);
    for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) {
      const k = j * W2 + i; if (solid[k]) continue;
      if ((i > 0 && solid[k - 1]) || (i < W2 - 1 && solid[k + 1]) || (j > 0 && solid[k - W2]) || (j < H2 - 1 && solid[k + W2])) {
        d[k * 4] = r; d[k * 4 + 1] = g; d[k * 4 + 2] = b; d[k * 4 + 3] = 255;
      }
    }
  }
  x.putImageData(img, 0, 0);
  const wc = document.createElement('canvas'); wc.width = W2; wc.height = H2;
  const wx = wc.getContext('2d'); wx.drawImage(c, 0, 0); wx.globalCompositeOperation = 'source-in'; wx.fillStyle = '#fff'; wx.fillRect(0, 0, W2, H2);
  return { c, wc, w: W2, h: H2 };
}
const frames = (name, opts) => ART.SPR[name].map(f => build(f, opts));
function glowSprite(r, color) {
  const size = r * 2 + 1, c = document.createElement('canvas'); c.width = size; c.height = size;
  const x = c.getContext('2d'); const [cr, cg, cb] = hexRgb(color);
  for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
    const d = Math.hypot(i - r, j - r) / r; if (d > 1) continue;
    const a = Math.round(Math.pow(1 - d, 1.6) * 5) / 5 * 0.55;  // quantised falloff = pixel-art glow bands
    if (a <= 0) continue;
    x.fillStyle = `rgba(${cr},${cg},${cb},${a})`; x.fillRect(i, j, 1, 1);
  }
  return { c, w: size, h: size };
}
// drill cone, generated: stripes shift each frame so it reads as spinning
function drillSprite(frame, side) {
  const widths = [6, 6, 4, 4, 2, 2], c = document.createElement('canvas');
  const L = widths.length; c.width = side ? L + 2 : 8; c.height = side ? 8 : L + 2;
  const x = c.getContext('2d'), cols = ['#d4d6dc', '#8d8f99', '#5b5d68'];
  const put = (i, j, col) => { x.fillStyle = col; if (side) x.fillRect(j + 1, i + 1, 1, 1); else x.fillRect(i + 1, j + 1, 1, 1); };
  // outline first
  widths.forEach((w, j) => { const a = 3 - w / 2; for (let i = a - 1; i < a + w + 1; i++) for (const dj of [-1, 0, 1]) put(i, j + dj, OUTLINE); });
  widths.forEach((w, j) => { const a = 3 - w / 2; for (let i = a; i < a + w; i++) put(i, j, cols[(i + j + frame) % 3]); });
  return { c, w: c.width, h: c.height };
}

const SP = {};
function buildArt() {
  SP.body = frames('body'); SP.treads = frames('treads');
  SP.drillD = [0, 1, 2].map(f => drillSprite(f, false)); SP.drillS = [0, 1, 2].map(f => drillSprite(f, true));
  for (const n of ['grub', 'bat', 'cinder', 'moth', 'grubmother', 'crab', 'toad', 'prism', 'shard', 'rock', 'fireball', 'spark', 'boulder',
    'workshop', 'pump', 'cart', 'gear', 'pine', 'bush', 'flower', 'mira', 'oldbot']) SP[n] = frames(n);
  SP.crack = ART.SPR.crack.map(f => build(f, { outline: null, map: { k: '#1a1622' } }));
  SP.cache = build(ART.SPR.cache[0], { outline: null });
  SP.boulderT = build(ART.SPR.boulder[0], { outline: null });
  SP.icon = {};
  for (const n in ART.SPR) if (n.startsWith('i_') || n.startsWith('r_')) SP.icon[n.slice(2)] = build(ART.SPR[n][0]);
  for (const o of ORES) if (o) SP.icon['ore' + o.id] = oreIcon(o);
  SP.icon.gear = SP.gear[0];
  SP.glow = { y: glowSprite(10, '#fff3b0'), o: glowSprite(12, '#ffb03a'), c: glowSprite(9, '#9fe2ff'), m: glowSprite(8, '#c79be8'), big: glowSprite(20, '#fff3b0'), r: glowSprite(14, '#e2483d') };
}
function oreIcon(o) {
  const rows = o.gem ? ['...x...', '..xXD..', '.xXXXD.', 'xXXXXXD', '.XXXXD.', '..XXD..', '...D...'] : ['..xX...', '.xXXXD.', 'xXXXXXD', 'XXXXXXD', '.XXXXD.', '..DDD..', '.......'];
  return build(rows, { map: { X: o.c, x: o.hi, D: o.lo } });
}

// ============================================================
//  Game data (units: art pixels; one tile = 10 px)
// ============================================================
const TILE = 10, COLS = 36, ROWS = 240, SKY = 30, ZONE_H = 60;
const T = { AIR: 0, DIRT: 1, CLAY: 2, STONE: 3, GRANITE: 4, BASALT: 5, CRYST: 6, BEDROCK: 7, SEAL: 8, CONCRETE: 9, LAVA: 10, GAS: 11, BOULDER: 12, CACHE: 13, LIFT: 14 };
// hard: seconds to dig with the starting drill; req: drill level under which digging is 3x slower
const TD = [];
TD[T.AIR] = { solid: false };
TD[T.DIRT] = { solid: true, hard: 0.34, req: 0, pal: ['#8a5a3b', '#7f5236', '#94623f', '#704831'], speck: '#a8764c', dark: '#5e3b28' };
TD[T.CLAY] = { solid: true, hard: 0.5, req: 0, pal: ['#a0603a', '#955836', '#a8683f', '#874f30'], speck: '#c08050', dark: '#6e3e25' };
TD[T.STONE] = { solid: true, hard: 0.72, req: 1, pal: ['#76717f', '#6d6876', '#7e7988', '#625e6b'], speck: '#9a95a3', dark: '#4c4855' };
TD[T.GRANITE] = { solid: true, hard: 0.95, req: 2, pal: ['#5d5866', '#56515e', '#655f6e', '#4c4855'], speck: '#8a8494', dark: '#3a3642' };
TD[T.BASALT] = { solid: true, hard: 1.2, req: 3, pal: ['#3d3238', '#372c32', '#45383f', '#30262b'], speck: '#7a2f1f', dark: '#241c20' };
TD[T.CRYST] = { solid: true, hard: 1.45, req: 4, pal: ['#3b3560', '#363058', '#423b6a', '#2f2a50'], speck: '#8f84d8', dark: '#221e3c' };
TD[T.BEDROCK] = { solid: true, hard: Infinity, pal: ['#24202c', '#1f1c26', '#29242f', '#1b1822'], speck: '#322c3a', dark: '#141119' };
TD[T.SEAL] = { solid: true, hard: Infinity, pal: ['#4a3d5c', '#463a57', '#504262', '#3f3450'], speck: '#7b62a0', dark: '#2c2438' };
TD[T.CONCRETE] = { solid: true, hard: Infinity, pal: ['#9a9aa3', '#93939c', '#a2a2ab', '#8b8b94'], speck: '#b8b8c0', dark: '#6b6b75' };
TD[T.LAVA] = { solid: false, lava: true };
TD[T.GAS] = { solid: true, hard: 0.7, req: 1, gas: true, pal: TD[T.STONE].pal, speck: '#9fd36a', dark: '#4c4855' };
TD[T.BOULDER] = { solid: true, hard: 0.9, req: 1, boulder: true };
TD[T.CACHE] = { solid: true, hard: 1.0, req: 0, cache: true };
TD[T.LIFT] = { solid: true, hard: Infinity, lift: true };

// zones (niveaux), minerais, améliorations, créatures et gardiens : définis dans data/*.json
const ZONES = DATA.zones.liste;
const zoneOf = r => clamp(Math.floor(r / ZONE_H), 0, 3);
// ores: value per piece, depth band (rows), colours
const ORES = [null, ...DATA.minerais.liste];
// upgrades: 6 levels each; stat(level) gives the value
const UPGRADES = {};
for (const [id, u] of Object.entries(DATA.ameliorations.liste)) UPGRADES[id] = { ...u, stat: l => u.niveaux[l], show: u.affichage === 'x' ? v => 'X' + v.toFixed(1) : v => String(v) };
const UP_IDS = Object.keys(UPGRADES), UP_MAX = 6;
const UP_COST = DATA.ameliorations.prix;
const upCost = id => Math.round(UP_COST[save.up[id]] * UPGRADES[id].f / 5) * 5;
const RELICS = {
  grubheart: { name: 'GRUB HEART', desc: '+15% MAX HULL', zone: 0, boss: true },
  geode:     { name: 'GEODE EYE', desc: '+20% LIGHT', zone: 1, boss: true },
  cinder:    { name: 'CINDER CORE', desc: 'LAVA HURTS HALF', zone: 2, boss: true },
  prism:     { name: 'PRISM CROWN', desc: '+25% ORE VALUE', zone: 3, boss: true },
  moleclaw:  { name: 'MOLE CLAW', desc: '+10% DIG SPEED', zone: 0 },
  oil:       { name: 'OIL FLASK', desc: '-12% FUEL USE', zone: 0 },
  lucky:     { name: 'LUCKY COIN', desc: '+10% ORE VALUE', zone: 1 },
  feather:   { name: 'FEATHER BOLT', desc: 'NO FALL DAMAGE', zone: 1 },
  scale:     { name: 'SALAMANDER SCALE', desc: '+15% FUEL TANK', zone: 2 },
  magnet:    { name: 'DEEP MAGNET', desc: '+4 CARGO SLOTS', zone: 2 },
  blastcap:  { name: 'BLAST CAP', desc: 'BIGGER BOMBS', zone: 3 },
  gyro:      { name: 'QUARTZ GYRO', desc: '+15% ENGINE', zone: 3 },
};
const RELIC_IDS = Object.keys(RELICS);
const CACHE_RELICS = [['moleclaw', 'oil'], ['lucky', 'feather'], ['scale', 'magnet'], ['blastcap', 'gyro']];
const has = id => save.relics.includes(id);
// derived stats
const st = {
  dig: () => UPGRADES.drill.stat(save.up.drill) * (has('moleclaw') ? 1.1 : 1) * (1 + bonus('forage')),
  eng: () => UPGRADES.engine.stat(save.up.engine) * (has('gyro') ? 1.15 : 1),
  fuel: () => Math.round(UPGRADES.fuel.stat(save.up.fuel) * (has('scale') ? 1.15 : 1)),
  hull: () => Math.round(UPGRADES.hull.stat(save.up.hull) * (has('grubheart') ? 1.15 : 1)),
  cargo: () => UPGRADES.cargo.stat(save.up.cargo) + (has('magnet') ? 4 : 0),
  light: () => UPGRADES.light.stat(save.up.light) * (has('geode') ? 1.2 : 1) * (1 + bonus('lumiere')),
  value: () => (1 + 0.3 * save.stars) * (has('prism') ? 1.25 : 1) * (has('lucky') ? 1.1 : 1),
};
const oreValue = id => Math.round(ORES[id].v * st.value());

// ============================================================
//  Save data
// ============================================================
let SAVE_KEY = 'cogmole_save_v1';   // changé par le module sauvegardes (un emplacement = une clé)
// champs de sauvegarde ajoutés par les modules : { nom: { def: () => valeur, charger: (brut, ancienne) => valeur nettoyée } }
const saveFields = {};
const defMods = () => { const m = {}; for (const k in saveFields) m[k] = saveFields[k].def(); return m; };
const defSave = () => ({
  cash: 0, stars: 0, seed: 0, dug: '', bossDown: 0, caches: 0, up: { drill: 0, engine: 0, fuel: 0, hull: 0, cargo: 0, light: 0 },
  relics: [], cargo: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hull: -1, fuel: -1,
  bestDepth: 0, earned: 0, dives: 0, mined: 0, gems: 0, kills: 0, bosses: 0, muted: false, tutorialDone: false, lang: '',
  quests: [], questTier: {}, daily: { last: '', streak: 0 }, wins: 0, mods: defMods(),
});
let save = defSave();
const num = (v, lo, hi, d = 0) => (Number.isFinite(+v) ? clamp(Math.floor(+v), lo, hi) : d);
function loadSave() {
  // tolerate corrupt / old / hand-edited saves instead of crashing on boot
  let d = {}; try { const raw = SDK.getItem(SAVE_KEY); if (raw && raw.length < 40000) d = JSON.parse(raw) || {}; } catch {}
  if (!d || typeof d !== 'object' || Array.isArray(d)) d = {};
  // copy known fields only: never Object.assign untrusted JSON (a "__proto__" key would swap the prototype)
  const s = defSave();
  for (const k of ['cash', 'earned']) if (own(d, k)) s[k] = num(d[k], 0, 1e12);
  for (const k of ['bestDepth', 'dives', 'mined', 'gems', 'kills', 'bosses', 'wins']) if (own(d, k)) s[k] = num(d[k], 0, 1e9);
  if (own(d, 'stars')) s.stars = num(d.stars, 0, 99);
  if (own(d, 'seed')) s.seed = num(d.seed, 0, 2147483647);
  if (own(d, 'bossDown')) s.bossDown = num(d.bossDown, 0, 15);
  if (own(d, 'caches')) s.caches = num(d.caches, 0, 255);
  if (own(d, 'dug') && typeof d.dug === 'string' && d.dug.length < 4000 && /^[A-Za-z0-9+/=]*$/.test(d.dug)) s.dug = d.dug;
  if (own(d, 'up') && d.up && typeof d.up === 'object') for (const id of UP_IDS) if (own(d.up, id)) s.up[id] = num(d.up[id], 0, UP_MAX);
  if (own(d, 'relics') && Array.isArray(d.relics)) s.relics = RELIC_IDS.filter(id => d.relics.includes(id));
  if (own(d, 'cargo') && Array.isArray(d.cargo)) s.cargo = s.cargo.map((_, i) => num(d.cargo[i], 0, 999));
  s.cargo[0] = 0;
  for (const k of ['hull', 'fuel']) if (own(d, k)) s[k] = Number.isFinite(+d[k]) ? clamp(+d[k], -1, 1000) : -1;
  s.muted = own(d, 'muted') && d.muted === true;
  s.tutorialDone = own(d, 'tutorialDone') && d.tutorialDone === true;
  if (own(d, 'lang') && LANGS.includes(d.lang)) s.lang = d.lang;
  const qs = own(d, 'quests') && Array.isArray(d.quests) ? d.quests : [];
  s.quests = qs.filter(q => q && typeof q === 'object' && typeof q.id === 'string' && own(QUESTS, q.id)).slice(0, 3)
    .map(q => ({ id: q.id, prog: num(q.prog, 0, 1e12) }));
  const qt = own(d, 'questTier') && d.questTier && typeof d.questTier === 'object' ? d.questTier : {};
  for (const id of Object.keys(QUESTS)) if (own(qt, id)) s.questTier[id] = num(qt[id], 0, 99);
  const dl = own(d, 'daily') && d.daily && typeof d.daily === 'object' ? d.daily : {};
  s.daily = { last: typeof dl.last === 'string' ? dl.last.slice(0, 12) : '', streak: num(dl.streak, 0, 9999) };
  // chaque module nettoie lui-même ses données (et peut reprendre une ancienne sauvegarde, ex. l'ancien champ items)
  const dm = own(d, 'mods') && d.mods && typeof d.mods === 'object' && !Array.isArray(d.mods) ? d.mods : {};
  for (const k in saveFields) { try { s.mods[k] = saveFields[k].charger(own(dm, k) ? dm[k] : undefined, d); } catch (e) { s.mods[k] = saveFields[k].def(); } }
  save = s;
  if (!save.seed) save.seed = 1 + Math.floor(Math.random() * 2147483000);
  ensureQuests();
}
let saveTimer = 0;
function writeSave() {
  saveTimer = 0;
  if (p) { save.hull = p.dead ? 0 : Math.round(p.hull * 10) / 10; save.fuel = p.dead ? 0 : Math.round(p.fuel * 10) / 10; }
  emit('save');
  try { save.dug = encodeDug(); SDK.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
}

// ============================================================
//  Contracts (3 active goals that carry across dives) & daily gift
// ============================================================
const QUESTS = {
  mine:  { text: 'MINE {n} ORES', stat: 'mined', goals: [12, 40, 100, 220, 450, 900] },
  deep:  { text: 'REACH {n}M DEEP', stat: 'depth', goals: [40, 120, 240, 360, 470], abs: true },
  earn:  { text: 'EARN {n} COINS', stat: 'earned', goals: [300, 1500, 6000, 20000, 60000, 150000] },
  gems:  { text: 'FIND {n} GEMS', stat: 'gems', goals: [3, 12, 30, 70, 150] },
  kills: { text: 'BREAK {n} CRITTERS', stat: 'kills', goals: [5, 15, 40, 90, 180] },
  boss:  { text: 'BEAT {n} GUARDIANS', stat: 'bosses', goals: [1, 2, 3, 4, 6, 8] },
};
function questInfo(q) {
  const Q = QUESTS[q.id], tier = save.questTier[q.id] || 0, goal = Q.goals[Math.min(tier, Q.goals.length - 1)] * (tier >= Q.goals.length ? tier - Q.goals.length + 2 : 1);
  return { goal, done: q.prog >= goal, reward: Math.round(60 * Math.pow(tier + 1, 1.9) * (1 + save.stars * 0.5) / 5) * 5, text: L(Q.text, { n: fmt(goal) }) };
}
function ensureQuests() {
  const ids = Object.keys(QUESTS);
  let guard = 0;
  while (save.quests.length < 3 && guard++ < 50) {
    const free = ids.filter(id => !save.quests.some(q => q.id === id));
    if (!free.length) break;
    const id = free[Math.floor(Math.random() * free.length)], Q = QUESTS[id];
    save.quests.push({ id, prog: Q.abs ? (id === 'deep' ? save.bestDepth : 0) : 0 });
  }
}
function questEvent(stat, amount = 1) {
  for (const q of save.quests) {
    const Q = QUESTS[q.id]; if (Q.stat !== stat) continue;
    const before = questInfo(q).done;
    if (Q.abs) q.prog = Math.max(q.prog, amount); else q.prog += amount;
    const inf = questInfo(q);
    if (!before && inf.done) { save.cash += inf.reward; toast(L('CONTRACT DONE! +{n}', { n: inf.reward })); sfx('relic'); retire.push(q); }
  }
  if (retire.length) { for (const q of retire) { save.questTier[q.id] = (save.questTier[q.id] || 0) + 1; save.quests.splice(save.quests.indexOf(q), 1); } retire.length = 0; ensureQuests(); }
}
const retire = [];
const dayKey = d => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
let pendingGift = null;
function checkDaily() {
  const today = new Date(), k = dayKey(today);
  if (save.daily.last === k) return;
  const y = new Date(today); y.setDate(y.getDate() - 1);
  const streak = save.daily.last === dayKey(y) ? save.daily.streak + 1 : 1;
  pendingGift = { streak, amount: Math.round((40 + 25 * Math.min(streak, 7)) * (1 + save.stars * 0.5) * (1 + save.bossDown.toString(2).replace(/0/g, '').length)) };
}
async function claimGift(double) {
  if (!pendingGift || busy) return;
  let n = pendingGift.amount;
  if (double) { busy = true; const ok = await SDK.ad('rewarded'); busy = false; if (!ok) { toast('AD NOT AVAILABLE'); return; } n *= 2; }
  if (!pendingGift) return;
  save.cash += n; save.daily = { last: dayKey(new Date()), streak: pendingGift.streak }; pendingGift = null; writeSave();
  toast(L('+{n} COINS', { n })); sfx('sell');
}

// ============================================================
//  Audio (all synthesised: no files to load)
// ============================================================
let actx = null, muted = false, noiseBuf = null, sfxOut = null;
// volumes réglés dans Options (0 à 1) ; la musique a toujours été mixée à 0,5
const vol = { music: 1, sfx: 1 };
function applyVolume() { if (sfxOut) sfxOut.gain.value = vol.sfx; if (Music.out) Music.out.gain.value = 0.5 * vol.music; }
function ensureAudio() {
  if (!actx) {
    try {
      actx = new (window.AudioContext || window.webkitAudioContext)();
      noiseBuf = actx.createBuffer(1, actx.sampleRate * 0.4, actx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      sfxOut = actx.createGain(); sfxOut.connect(actx.destination); applyVolume();
    } catch {}
  }
  if (actx && actx.state === 'suspended' && !adPlaying && !silent() && !ducked && !document.hidden) actx.resume().catch(() => {});
}
let pitchMul = 1;
function tone(f, d = 0.08, type = 'sine', v = 0.12, slide = 0, when = 0, dest = null) {
  if (!actx || silent() || adPlaying) return;
  f *= pitchMul; slide *= pitchMul;
  const t = when || actx.currentTime, o = actx.createOscillator(), g = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g).connect(dest || sfxOut || actx.destination); o.start(t); o.stop(t + d + 0.02);
}
function noise(d, v, freq, when = 0, dest = null, type = 'highpass') {
  if (!actx || !noiseBuf || silent() || adPlaying) return;
  const t = when || actx.currentTime, s = actx.createBufferSource(), f = actx.createBiquadFilter(), g = actx.createGain();
  s.buffer = noiseBuf; f.type = type; f.frequency.value = freq * pitchMul;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  s.connect(f).connect(g).connect(dest || sfxOut || actx.destination); s.start(t, Math.random() * 0.2); s.stop(t + d + 0.02);
}
let digPitch = 1, orePitch = 1;
const SFX = {
  dig:    { gap: 0.09, play: () => { noise(0.07, 0.07, 700 * digPitch, 0, null, 'bandpass'); tone(90 * digPitch, 0.05, 'square', 0.025, -30); } },
  crumble:{ gap: 0.05, play: () => { noise(0.16, 0.1, 500, 0, null, 'lowpass'); tone(140, 0.1, 'triangle', 0.05, -80); } },
  ore:    { gap: 0.05, play: () => { const f = 880 * orePitch; tone(f, 0.09, 'square', 0.03); tone(f * 1.5, 0.16, 'triangle', 0.05, 0, actx.currentTime + 0.05); } },
  thrust: { gap: 0.07, play: () => noise(0.09, 0.035, 1400, 0, null, 'bandpass') },
  land:   { gap: 0.15, play: () => { noise(0.08, 0.06, 300, 0, null, 'lowpass'); tone(110, 0.08, 'sine', 0.06, -50); } },
  hurt:   { gap: 0.2,  play: () => { tone(220, 0.18, 'square', 0.07, -140); noise(0.1, 0.06, 800, 0, null, 'lowpass'); } },
  sizzle: { gap: 0.25, play: () => noise(0.25, 0.05, 4000) },
  boom:   { gap: 0.1,  play: () => { noise(0.5, 0.2, 380, 0, null, 'lowpass'); tone(70, 0.45, 'sawtooth', 0.09, -40); } },
  coin:   { gap: 0.05, play: () => { tone(1320, 0.05, 'square', 0.025); tone(1980, 0.1, 'square', 0.025, 0, actx.currentTime + 0.05); } },
  sell:   { gap: 0.4,  play: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.16, 'square', 0.03, 0, actx.currentTime + i * 0.06)) },
  buy:    { gap: 0.2,  play: () => [392, 523, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, 0, actx.currentTime + i * 0.06)) },
  relic:  { gap: 0.6,  play: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.3, 'triangle', 0.08, 0, actx.currentTime + i * 0.08)) },
  low:    { gap: 1.2,  play: () => { tone(660, 0.1, 'square', 0.04); tone(520, 0.12, 'square', 0.04, 0, actx.currentTime + 0.14); } },
  boss:   { gap: 1,    play: () => { tone(65, 1.2, 'sawtooth', 0.14, -20); noise(1.0, 0.1, 200, 0, null, 'lowpass'); } },
  bosshit:{ gap: 0.12, play: () => { noise(0.06, 0.08, 2500, 0, null, 'bandpass'); tone(300, 0.08, 'square', 0.04, -120); } },
  kill:   { gap: 0.06, play: () => { tone(500, 0.08, 'square', 0.03, -350); noise(0.06, 0.05, 1500, 0, null, 'bandpass'); } },
  lift:   { gap: 0.6,  play: () => { tone(300, 0.6, 'sine', 0.08, 900); noise(0.5, 0.04, 2500); } },
  click:  { gap: 0.04, play: () => tone(900, 0.04, 'square', 0.03, -300) },
  hover:  { gap: 0.05, play: () => tone(1500, 0.025, 'triangle', 0.012) },
  fuse:   { gap: 0.18, play: () => tone(1800, 0.03, 'square', 0.02) },
  deny:   { gap: 0.2,  play: () => tone(160, 0.12, 'square', 0.05, -40) },
  warn:   { gap: 0.5,  play: () => { tone(740, 0.12, 'square', 0.05); tone(740, 0.12, 'square', 0.05, 0, actx.currentTime + 0.2); } },
};
const sfxLast = {};
function sfx(name) {
  if (!actx || silent() || adPlaying) return;
  const now = actx.currentTime, def = SFX[name];
  if (now - (sfxLast[name] || -9) < def.gap) return;
  sfxLast[name] = now;
  pitchMul = name === 'ore' || name === 'sell' || name === 'relic' ? 1 : rand(0.9, 1.1);   // small detune: repeated sounds never feel identical
  def.play(); pitchMul = 1;
}
// Music: a calm loop per zone (surface is bright, the deep gets darker and slower), plus a boss groove.
const CH = { C: [261.63, 329.63, 392], Am: [220, 261.63, 329.63], F: [174.61, 220, 261.63], G: [196, 246.94, 293.66],
  Em: [164.81, 196, 246.94], Dm: [146.83, 174.61, 220], E: [164.81, 207.65, 246.94], Bb: [233.08, 293.66, 349.23],
  Fm7: [174.61, 207.65, 261.63], Cm: [261.63 / 2 * 2, 311.13, 392], Ab: [207.65, 261.63, 311.13], Eb: [155.56, 196, 233.08] };
const SONGS = [
  { prog: [CH.C, CH.G, CH.Am, CH.F], bpm: 104, lead: [523.25, 587.33, 659.25, 783.99, 880], bass: 'sine' },        // surface
  { prog: [CH.Am, CH.F, CH.C, CH.G], bpm: 96, lead: [440, 523.25, 587.33, 659.25, 783.99], bass: 'triangle' },     // topsoil
  { prog: [CH.Dm, CH.Bb, CH.F, CH.Am], bpm: 90, lead: [293.66, 349.23, 440, 523.25, 587.33], bass: 'triangle' },   // deep rock
  { prog: [CH.Em, CH.C, CH.Am, CH.E], bpm: 86, lead: [329.63, 392, 440, 493.88, 659.25], bass: 'sawtooth' },       // magma
  { prog: [CH.Fm7, CH.Ab, CH.Eb, CH.Cm], bpm: 80, lead: [349.23, 415.3, 523.25, 622.25, 698.46], bass: 'sine' },   // crystal
];
const BOSS_SONG = { prog: [CH.Am, CH.E, CH.Am, CH.Dm], bpm: 132, lead: [440, 493.88, 523.25, 659.25, 783.99], bass: 'sawtooth' };
const Music = {
  on: false, next: 0, step: 0, timer: null, out: null, song: SONGS[0], want: SONGS[0], fade: 1,
  start() {
    if (!actx || this.on) return;
    if (!this.out) { this.out = actx.createGain(); this.out.gain.value = 0.5 * vol.music; this.out.connect(actx.destination); }
    this.on = true; this.next = actx.currentTime + 0.08;
    this.timer = setInterval(() => this.tick(), 40);
  },
  stop() { this.on = false; clearInterval(this.timer); },
  set(song) { this.want = song; },
  tick() {
    if (!actx || actx.state !== 'running') return;
    if (this.want !== this.song && this.step % 16 === 0) { this.song = this.want; this.step = 0; }   // switch songs on a bar line
    const eighth = 60 / this.song.bpm / 2;
    if (this.next < actx.currentTime) this.next = actx.currentTime + 0.02;
    while (this.next < actx.currentTime + 0.15) { this.play(this.step, this.next); this.next += eighth; this.step++; }
  },
  play(s, t) {
    if (silent()) return;
    const S = this.song, i = s % 8, bar = Math.floor(s / 8), o = this.out, chord = S.prog[bar % 4], boss = S === BOSS_SONG;
    if (i === 0) tone(chord[0] / 2, 0.9, S.bass, boss ? 0.07 : 0.1, 0, t, o);
    if (boss && i % 2 === 1) tone(chord[0] / 2, 0.12, 'square', 0.03, 0, t, o);
    if (i % 2 === 0 || boss) tone(chord[[0, 1, 2, 1][(i >> (boss ? 0 : 1)) % 4]] * (i >= 4 ? 2 : 1), 0.28, 'triangle', 0.03, 0, t, o);
    if (i === 3 && hash2(bar, 7) % 3 === 0) tone(S.lead[hash2(bar, s) % S.lead.length], 0.6, 'sine', 0.03, 0, t, o);
    if (boss && i % 4 === 0) tone(110, 0.12, 'sine', 0.15, -60, t, o);
    if (boss && i % 2 === 1) noise(0.03, 0.03, 6000, t, o);
    if (!boss && S !== SONGS[0] && i === 6 && bar % 2) noise(0.18, 0.015, 900, t, o, 'bandpass');   // distant drip / rumble
  },
};

// ============================================================
//  View
// ============================================================
const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
let W = 0, H = 0, dpr = 1, S = 3, UW = 0, UH = 0;
function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth || 800; H = innerHeight || 600;   // an iframe can report 0x0 before layout
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  S = clamp(Math.floor(Math.min(W, H) / 200), 2, 6);   // integer art-pixel size keeps sprites crisp
  UW = W / S; UH = H / S;
}
addEventListener('resize', resize);

// ============================================================
//  World: generated from a seed; only the dug cells are saved
// ============================================================
let world = null;
function vnoise(seed) {
  return (x, y, sc) => {
    x /= sc; y /= sc; const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const h = (a, b) => (hash2(a + seed * 31, b - seed * 17) & 0xffff) / 0xffff;
    const sx = xf * xf * (3 - 2 * xf), sy = yf * yf * (3 - 2 * yf);
    return lerp(lerp(h(xi, yi), h(xi + 1, yi), sx), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), sx), sy);
  };
}
const diggable = t => TD[t].solid && TD[t].hard < Infinity;
const isRock = t => t >= T.DIRT && t <= T.CRYST;
function genWorld(seed) {
  const rnd = prng(seed * 7 + 3), N = COLS * ROWS, t = new Uint8Array(N), ore = new Uint8Array(N);
  const n1 = vnoise(seed % 9973 + 1), n2 = vnoise(seed % 7919 + 5), n3 = vnoise(seed % 6007 + 9);
  const set = (c, r, v) => { if (c >= 0 && c < COLS && r >= 0 && r < ROWS) t[r * COLS + c] = v; };
  const get = (c, r) => (c >= 0 && c < COLS && r >= 0 && r < ROWS ? t[r * COLS + c] : T.BEDROCK);
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const z = zoneOf(r), local = r - z * ZONE_H, f = local / ZONE_H, a = n1(c, r, 5), b = n2(c, r, 3);
    let v;
    if (z === 0) v = b > 0.84 - f * 0.3 ? T.STONE : a > 0.56 - f * 0.2 ? T.CLAY : T.DIRT;
    else if (z === 1) v = a > 0.62 - f * 0.15 ? T.GRANITE : b > 0.8 ? T.CLAY : T.STONE;
    else if (z === 2) v = a > 0.42 - f * 0.1 ? T.BASALT : b > 0.7 ? T.STONE : T.GRANITE;
    else v = a > 0.36 ? T.CRYST : b > 0.72 ? T.BASALT : T.GRANITE;
    if (r > 4 && local > 3 && n3(c, r * 1.7, 6) > [0.79, 0.74, 0.73, 0.72][z]) v = T.AIR;   // caves, wider than tall
    if (v !== T.AIR && r > 6) {
      const q = rnd();
      if (z >= 1 && q < ZONES[z].gaz) v = T.GAS;
      else if (z >= 1 && q < ZONES[z].gaz + ZONES[z].rochers) v = T.BOULDER;
    }
    if (c === 0 || c === COLS - 1) v = T.BEDROCK;
    t[r * COLS + c] = v;
  }
  // lava settles on cave floors in the magma zone (a little in the crystals too)
  for (let r = 2 * ZONE_H; r < ROWS - 1; r++) for (let c = 1; c < COLS - 1; c++) {
    if (get(c, r) !== T.AIR || !TD[get(c, r + 1)].solid) continue;
    if (rnd() < (zoneOf(r) === 2 ? 0.55 : 0.12)) set(c, r, T.LAVA);
  }
  // ore veins: a short random walk from a seed cell, ore picked by depth band
  const pickOre = r => {
    let tot = 0; const w = [];
    for (let i = 1; i < ORES.length; i++) { const o = ORES[i]; const x = r < o.lo0 || r > o.hi0 ? 0 : Math.exp(-Math.pow((r - o.peak) / 32, 2)) * (o.rare ? 0.12 : 1); w[i] = x; tot += x; }
    let k = rnd() * tot; for (let i = 1; i < ORES.length; i++) { k -= w[i]; if (k <= 0) return i; } return 1;
  };
  for (let z = 0; z < 4; z++) for (let v = 0; v < 85; v++) {
    let r = z * ZONE_H + 2 + Math.floor(rnd() * 47), c = 1 + Math.floor(rnd() * (COLS - 2));
    const id = pickOre(r), size = ORES[id].gem ? 1 + Math.floor(rnd() * 3) : 2 + Math.floor(rnd() * 4);
    for (let k = 0; k < size; k++) {
      if (isRock(get(c, r))) ore[r * COLS + c] = id;
      if (rnd() < 0.5) c += rnd() < 0.5 ? -1 : 1; else r += rnd() < 0.7 ? 1 : -1;
    }
  }
  // ancient caches: 2 per zone, sealed in rock
  const caches = [];
  for (let z = 0; z < 4; z++) for (let k = 0; k < 2; k++) {
    const r = z * ZONE_H + 12 + Math.floor(rnd() * 32) + (k ? 0 : 0), c = k ? 19 + Math.floor(rnd() * 14) : 2 + Math.floor(rnd() * 14);
    set(c, r, T.CACHE); ore[r * COLS + c] = 0; caches.push({ c, r, z, k });
  }
  // guardian chambers (8 rows tall) above a sealed floor; lift rooms at the top of zones 2-4
  for (let z = 0; z < 4; z++) {
    const top = z * ZONE_H;
    for (let r = top + 49; r <= top + 56; r++) for (let c = 2; c <= COLS - 3; c++) {
      const corner = (r === top + 49 && (c < 4 || c > COLS - 5));
      set(c, r, corner ? T.BEDROCK : T.AIR); ore[r * COLS + c] = 0;
    }
    for (let r = top + 57; r < top + 60; r++) for (let c = 1; c < COLS - 1; c++) { set(c, r, z === 3 ? T.BEDROCK : T.SEAL); ore[r * COLS + c] = 0; }
    if (z === 2) for (const c of [3, 4, 5, COLS - 6, COLS - 5, COLS - 4]) set(c, top + 56, T.LAVA);
    if (z > 0) {
      for (let r = top; r < top + 3; r++) for (let c = 15; c <= 20; c++) { set(c, r, T.AIR); ore[r * COLS + c] = 0; }
      for (let c = 15; c <= 20; c++) { set(c, top + 3, c === 15 || c === 20 ? T.STONE : T.LIFT); ore[(top + 3) * COLS + c] = 0; }
    }
  }
  // a few easy copper nuggets right next to the base, so the very first dive pays
  for (const [c, r] of [[11, 3], [12, 3], [12, 4], [24, 4], [24, 5], [23, 5], [9, 7], [27, 8], [28, 8]]) if (isRock(get(c, r))) ore[r * COLS + c] = 1;
  // surface: base pad
  for (let r = 0; r < 2; r++) for (let c = 14; c <= 21; c++) { set(c, r, T.CONCRETE); ore[r * COLS + c] = 0; }
  for (let i = 0; i < N; i++) if (!isRock(t[i])) ore[i] = 0;
  const w = { t, ore, caches, dug: new Uint8Array(Math.ceil(N / 8)), crack: new Map(), seed };
  // les modules ajoutent leurs éléments (balises, personnages) avec leur propre tirage : le reste du monde ne change pas
  emit('genWorld', w, set, get, seed);
  for (let i = 0; i < N; i++) if (!isRock(t[i])) ore[i] = 0;
  return w;
}
function encodeDug() {
  if (!world) return save.dug;
  let s = ''; const d = world.dug;
  for (let i = 0; i < d.length; i++) s += String.fromCharCode(d[i]);
  return btoa(s);
}
function openSeal(z) {
  if (z >= 3) return;
  for (let r = z * ZONE_H + 57; r < z * ZONE_H + 60; r++) for (let c = 16; c <= 19; c++) world.t[r * COLS + c] = T.AIR;
}
function loadWorld() {
  world = genWorld(save.seed);
  try {
    const s = atob(save.dug || '');
    for (let i = 0; i < s.length && i < world.dug.length; i++) world.dug[i] = s.charCodeAt(i) & 255;
  } catch (e) { world.dug.fill(0); }
  for (let i = 0; i < COLS * ROWS; i++) if (world.dug[i >> 3] & (1 << (i & 7))) {
    if (diggable(world.t[i])) world.t[i] = T.AIR;
    world.ore[i] = 0;
  }
  for (let z = 0; z < 4; z++) if (save.bossDown & (1 << z)) openSeal(z);
}
const tileAt = (c, r) => (r < 0 ? T.AIR : c < 0 || c >= COLS || r >= ROWS ? T.BEDROCK : world.t[r * COLS + c]);
const solidAt = (c, r) => TD[tileAt(c, r)].solid;
const markDug = i => { world.dug[i >> 3] |= 1 << (i & 7); };

// ============================================================
//  Game state
// ============================================================
let state = 'menu';     // menu | play | base | shop | relics | pause | wreck | win
let time = 0, screenT = 0, busy = false, subReturn = 'menu', freeze = 0, shakeAmp = 0, fade = null;
let winPending = 0;
let p = null, boss = null, baseInfo = null, tut = null, enemyT = 4, lastZone = -1, confirmNew = 0, freeCoinsAt = 0, x2At = 0;
const E = { enemies: [], shots: [], boulders: [], falling: [], bombs: [], pickups: [], parts: [], texts: [], flyOres: [], lights: [], booms: [] };
const cam = { x: 180, y: 0 };
const keys = new Set();
let joy = null;
const banners = []; let toastMsg = null;
function setScreen(s) { state = s; screenT = 0; }
function banner(text, color = '#fff3d6', sub = '') { banners.length = 0; banners.push({ text, sub, color, t: 0 }); }
function toast(text) { toastMsg = { text, t: 0 }; }
function shake(a) { shakeAmp = Math.max(shakeAmp, a); }
const BASE_X = 180;

function newPlayer() {
  const hullMax = st.hull(), fuelMax = st.fuel();
  p = { x: BASE_X, y: 0, vx: 0, vy: 0, face: 1, grounded: true, hull: save.hull >= 0 ? Math.min(save.hull, hullMax) : hullMax,
    fuel: save.fuel >= 0 ? Math.min(save.fuel, fuelMax) : fuelMax, dig: null, inv: 0, sq: 0, sqv: 0, ant: 0, antv: 0, blink: 2,
    spin: 0, drilling: false, drillDir: 'side', thrusting: false, atBase: true, onLift: -1, dead: false, wreckT: 0, cause: '',
    hurtT: 0, happyT: 0, lowFuelT: 0, lavaT: 0, shield: 0, revived: false, stepT: 0, slowWarned: false, lastVx: 0, maxRow: 0 };
  if (p.hull <= 0) p.hull = Math.ceil(hullMax * 0.5);
  if (p.fuel <= 0) p.fuel = Math.ceil(fuelMax * 0.5);
  cam.x = p.x; cam.y = p.y - 20;
}
const cargoCount = () => save.cargo.reduce((a, b) => a + b, 0);
const cargoValue = () => save.cargo.reduce((a, n, i) => a + (i ? n * oreValue(i) : 0), 0);
function clearEntities() { for (const k in E) E[k].length = 0; boss = null; }

// ---------- input ----------
// Touches de chaque action. La première peut être changée dans Options > Contrôles (modules/options.js) ;
// les suivantes (flèches, Espace, Entrée) restent toujours actives.
const BINDS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp', 'Space'], down: ['KeyS', 'ArrowDown'],
  interact: ['KeyE', 'Enter'], pause: ['KeyP'], bag: ['KeyI', 'Tab'], map: ['KeyM'], journal: ['KeyJ'],
  hot1: ['Digit1', 'Numpad1'], hot2: ['Digit2', 'Numpad2'], hot3: ['Digit3', 'Numpad3'], hot4: ['Digit4', 'Numpad4'], hot5: ['Digit5', 'Numpad5'],
};
const DEFAULT_BINDS = JSON.parse(JSON.stringify(BINDS));
const held = a => BINDS[a].some(k => keys.has(k));
const isBind = (a, k) => BINDS[a].includes(k);
function readInput() {
  let ix = 0, iy = 0;
  if (held('left')) ix -= 1;
  if (held('right')) ix += 1;
  if (held('up')) iy -= 1;
  if (held('down')) iy += 1;
  if (joy) {
    const dx = (joy.x - joy.ox) / S, dy = (joy.y - joy.oy) / S, l = Math.hypot(dx, dy);
    if (l > 3) { ix = clamp(dx / 13, -1, 1); iy = clamp(dy / 13, -1, 1); }
  }
  return { ix, iy };
}

// ---------- collision (box: 8 wide, h tall, x = centre, y = feet) ----------
function collide(o, dt, hw = 4, h = 8) {
  const res = { hitL: false, hitR: false, land: 0, ceil: false };
  o.x += o.vx * dt;
  const r0 = Math.floor((o.y - h + 0.01) / TILE), r1 = Math.floor((o.y - 0.01) / TILE);
  if (o.vx > 0) { const c = Math.floor((o.x + hw - 0.001) / TILE); for (let r = r0; r <= r1; r++) if (solidAt(c, r)) { o.x = c * TILE - hw; o.vx = 0; res.hitR = true; break; } }
  else if (o.vx < 0) { const c = Math.floor((o.x - hw) / TILE); for (let r = r0; r <= r1; r++) if (solidAt(c, r)) { o.x = (c + 1) * TILE + hw; o.vx = 0; res.hitL = true; break; } }
  const vyBefore = o.vy;
  o.y += o.vy * dt;
  const c0 = Math.floor((o.x - hw + 0.01) / TILE), c1 = Math.floor((o.x + hw - 0.01) / TILE);
  if (o.vy > 0) { const r = Math.floor((o.y - 0.0001) / TILE); for (let c = c0; c <= c1; c++) if (solidAt(c, r)) { o.y = r * TILE; o.vy = 0; res.land = vyBefore; break; } }
  else if (o.vy < 0) { const r = Math.floor((o.y - h) / TILE); for (let c = c0; c <= c1; c++) if (solidAt(c, r)) { o.y = (r + 1) * TILE + h; o.vy = 0; res.ceil = true; break; } }
  if (o.y - h < -SKY * TILE) { o.y = -SKY * TILE + h; if (o.vy < 0) o.vy = 0; }
  o.grounded = false;
  { const r = Math.floor((o.y + 0.5) / TILE); for (let c = c0; c <= c1; c++) if (solidAt(c, r)) { o.grounded = true; break; } }
  return res;
}
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
const pBox = () => ({ x0: p.x - 4, x1: p.x + 4, y0: p.y - 8, y1: p.y });
function drillBox() {
  if (p.drillDir === 'down') return { x0: p.x - 3, x1: p.x + 3, y0: p.y - 1, y1: p.y + 6 };
  return p.face > 0 ? { x0: p.x + 3, x1: p.x + 10, y0: p.y - 7, y1: p.y - 1 } : { x0: p.x - 10, x1: p.x - 3, y0: p.y - 7, y1: p.y - 1 };
}
const drillDps = () => 30 * st.dig();

// ---------- particles & texts ----------
function part(x, y, c, vx, vy, life, size = 1, grav = 0, light = false) { if (E.parts.length < 600) E.parts.push({ x, y, c, vx, vy, life, max: life, size, grav, light }); }
function burst(x, y, c, n, sp = 1, size = 1, grav = 200) { for (let i = 0; i < n; i++) { const a = Math.random() * TAU, s = rand(20, 70) * sp; part(x, y, c, Math.cos(a) * s, Math.sin(a) * s - 20, rand(0.3, 0.7), size, grav); } }
function popText(x, y, v, c = '#fff3d6') { if (E.texts.length < 40) E.texts.push({ x, y, v: String(v), c, life: 0.9, vy: -26 }); }
function tilePal(t, r) { const d = TD[t]; return d && d.pal ? d.pal : TD[[T.DIRT, T.STONE, T.BASALT, T.CRYST][zoneOf(r)]].pal; }

// ---------- digging ----------
function digTime(c, r) {
  const t = tileAt(c, r), d = TD[t], o = world.ore[r * COLS + c];
  let tm = d.hard * (1 + (o ? o * 0.05 : 0)) / st.dig();
  if (save.up.drill < (d.req || 0)) tm *= 2;
  return tm;
}
function breakTile(c, r, cause) {
  if (c < 1 || c >= COLS - 1 || r < 0 || r >= ROWS) return;
  const i = r * COLS + c, t = world.t[i];
  if (!diggable(t)) return;
  const o = world.ore[i];
  world.t[i] = T.AIR; world.ore[i] = 0; markDug(i); world.crack.delete(i);
  const pal = TD[t].pal || TD[T.STONE].pal, cx = c * TILE + 5, cy = r * TILE + 5;
  for (let k = 0; k < 7; k++) part(cx + rand(-4, 4), cy + rand(-4, 4), pal[k % 4], rand(-50, 50), rand(-70, 10), rand(0.3, 0.6), k < 2 ? 2 : 1, 300);
  if (o) collectOre(o, cx, cy);
  if (TD[t].gas) { E.booms.push({ x: cx, y: cy, t: 0.12, R: 1.6, pd: 16, gas: true }); for (let k = 0; k < 10; k++) part(cx, cy, '#9fd36a', rand(-40, 40), rand(-40, 40), 0.5, 2); }
  if (TD[t].cache) openCache(c, r);
  checkBoulder(c, r - 1);
  emit('tile', t, c, r, cause);
  saveTimer = Math.max(saveTimer, 0.01);
}
function collectOre(id, x, y) {
  const o = ORES[id];
  if (cargoCount() >= st.cargo()) { toast('CARGO FULL! FLY HOME TO SELL'); sfx('deny'); burst(x, y, o.c, 5, 0.6); return; }
  save.cargo[id]++; save.mined++; if (o.gem) { save.gems++; questEvent('gems'); }
  emit('ore', id, x, y);
  questEvent('mine');
  E.flyOres.push({ x, y, sx: x, sy: y, t: 0, id });
  orePitch = Math.pow(2, (id - 1) / 6); sfx('ore');
  popText(x, y - 4, '+' + L(o.name), o.hi);
  if (tut && tut.step === 2) tutNext();
}
function checkBoulder(c, r) {
  if (tileAt(c, r) !== T.BOULDER || E.boulders.some(b => b.c === c && b.r === r)) return;
  E.boulders.push({ c, r, t: 0.5 });
}
function openCache(c, r) {
  const k = world.caches.findIndex(q => q.c === c && q.r === r); if (k < 0) return;
  const q = world.caches[k], relic = CACHE_RELICS[q.z][q.k], cx = c * TILE + 5, cy = r * TILE + 5;
  emit('cache', q);
  burst(cx, cy, '#f6d743', 24, 1.4, 1, 120); E.lights.push({ x: cx, y: cy, r: 50, t: 0.8, max: 0.8 });
  if (!has(relic)) {
    save.relics.push(relic); freeze = 0.15; sfx('relic');
    banner(L('RELIC FOUND: {name}', { name: L(RELICS[relic].name) }), '#f6d743', RELICS[relic].desc);
    writeSave();
  } else { spawnCoins(cx, cy, 120 * Math.pow(q.z + 1, 2) * (1 + save.stars * 0.5), 10); toast('ANCIENT TREASURE!'); sfx('sell'); }
}
function spawnCoins(x, y, total, n) {
  total = Math.round(total); n = Math.max(1, Math.min(n, 24, total));
  const each = Math.floor(total / n);
  for (let i = 0; i < n; i++) E.pickups.push({ x: x + rand(-3, 3), y: y + rand(-3, 3), vx: rand(-50, 50), vy: rand(-110, -40), v: i ? each : total - each * (n - 1), t: 0, grounded: false });
}
function explode(x, y, R, playerDmg, foeDmg, bossDmg) {
  const rr = Math.ceil(R), c0 = Math.floor(x / TILE), r0 = Math.floor(y / TILE);
  for (let r = r0 - rr; r <= r0 + rr; r++) for (let c = c0 - rr; c <= c0 + rr; c++) {
    if (Math.hypot(c * TILE + 5 - x, r * TILE + 5 - y) <= R * TILE + 1) breakTile(c, r, 'bomb');
  }
  const d = Math.hypot(p.x - x, p.y - 4 - y);
  if (d < R * TILE + 4 && playerDmg) hurtPlayer(playerDmg * (1 - d / (R * TILE + 8)), x, true);
  for (const e of E.enemies) if (Math.hypot(e.x - x, e.y - 3 - y) < R * TILE + 6) { e.hp -= foeDmg; e.flash = 0.15; if (e.hp <= 0) killEnemy(e); }
  if (boss && !boss.dying && Math.hypot(boss.x - x, boss.y - boss.h / 2 - y) < R * TILE + boss.w / 2 && bossDmg) damageBoss(bossDmg);
  for (let k = 0; k < 26; k++) { const a = Math.random() * TAU, s = rand(30, 120); part(x, y, k % 3 ? '#ffb03a' : '#fff3b0', Math.cos(a) * s, Math.sin(a) * s, rand(0.2, 0.5), 2, 0, true); }
  for (let k = 0; k < 10; k++) part(x + rand(-8, 8), y + rand(-8, 8), '#5b5d68', rand(-20, 20), rand(-40, -10), rand(0.6, 1.1), 3, -20);
  E.lights.push({ x, y, r: 70, t: 0.35, max: 0.35 }); shake(6); freeze = Math.max(freeze, 0.05); sfx('boom');
}

// ---------- player ----------
function hurtPlayer(dmg, fromX, ignoreInv = false) {
  if (!p || p.dead || (p.inv > 0 && !ignoreInv) || cheat.god || p.shield > 0) return;
  dmg = Math.max(1, Math.round(dmg));
  p.hull -= dmg; p.inv = 0.8; p.hurtT = 0.35;
  const dir = p.x < fromX ? -1 : 1; if (!p.dig) { p.vx = dir * 90; p.vy = Math.min(p.vy, -70); }
  p.dig = null;
  shake(4); freeze = Math.max(freeze, 0.06); sfx('hurt'); popText(p.x, p.y - 12, '-' + dmg, '#ff6b6b');
  for (let k = 0; k < 6; k++) part(p.x, p.y - 4, k % 2 ? '#f6d743' : '#d4d6dc', rand(-60, 60), rand(-80, -20), 0.4, 1, 300);
  if (p.hull <= 0) wreck('hull');
}
function wreck(cause) {
  if (p.dead) return;
  p.dead = true; p.cause = cause; p.wreckT = cause === 'hull' ? 1.1 : 1.3; p.dig = null; joy = null;
  emit('wreck', cause);
  if (cause === 'hull') { p.hull = 0; explodeFx(p.x, p.y - 4); }
  else { p.fuel = 0; sfx('low'); }
  if (boss && !boss.dying) boss = null;   // the guardian waits, healed, for the next attempt
  Music.set(SONGS[1 + zoneOf(Math.max(0, Math.floor(p.y / TILE)))]);
}
function explodeFx(x, y) {
  for (let k = 0; k < 30; k++) { const a = Math.random() * TAU, s = rand(30, 110); part(x, y, ['#f6d743', '#ffb03a', '#d4d6dc', '#5b5d68'][k % 4], Math.cos(a) * s, Math.sin(a) * s - 30, rand(0.4, 0.9), 2, 260); }
  E.lights.push({ x, y, r: 60, t: 0.4, max: 0.4 }); shake(7); sfx('boom');
}
function updatePlayer(dt) {
  if (p.dead) {
    p.wreckT -= dt; p.vx *= 0.9; p.vy += 330 * dt; collide(p, dt);
    if (p.cause === 'hull' && Math.random() < 0.3) part(p.x + rand(-3, 3), p.y - 6, '#5b5d68', rand(-8, 8), rand(-30, -15), 0.8, 2, -10);
    if (p.wreckT <= 0) { setScreen('wreck'); SDK.gameplayStop(); }
    return;
  }
  const { ix, iy } = readInput(), eng = st.eng();
  const prevVx = p.vx;
  p.inv = Math.max(0, p.inv - dt); p.shield = Math.max(0, (p.shield || 0) - dt); p.hurtT = Math.max(0, p.hurtT - dt); p.happyT = Math.max(0, p.happyT - dt);
  if (Math.abs(ix) > 0.3) p.face = ix > 0 ? 1 : -1;
  const wantDown = iy > 0.5 && Math.abs(ix) < 0.65;
  p.drillDir = wantDown ? 'down' : 'side';
  p.drilling = !!p.dig || Math.abs(ix) > 0.4 || wantDown;
  p.thrusting = iy < -0.35 && p.fuel > 0 && !p.dig;
  const row = Math.floor((p.y - 4) / TILE), zone = zoneOf(Math.max(0, row)), under = p.y > 2;
  let burn = under ? 0.035 : 0;

  if (p.dig) {
    const D = p.dig, t = tileAt(D.c, D.r);
    const still = diggable(t) && p.grounded && (D.dir === 0 ? wantDown : Math.sign(ix) === D.dir && Math.abs(ix) > 0.35 && !wantDown);
    if (!still) { if (diggable(t)) world.crack.set(D.r * COLS + D.c, D.prog); p.dig = null; }
    else {
      D.prog += dt / D.time; burn += 0.22;
      if (D.dir === 0) p.x += (D.c * TILE + 5 - p.x) * damp(18, dt);
      p.vx = 0;
      const tx = D.dir === 0 ? D.c * TILE + 5 + rand(-3, 3) : D.c * TILE + (D.dir > 0 ? 1 : 9), ty = D.dir === 0 ? D.r * TILE + 1 : D.r * TILE + rand(2, 8);
      if (Math.random() < 0.5) { const pal = tilePal(t, D.r); part(tx, ty, pal[Math.floor(Math.random() * 4)], rand(-40, 40) - D.dir * 30, rand(-60, -10), rand(0.2, 0.45), 1, 320); }
      digPitch = 1.4 - Math.min(0.8, TD[t].hard * 0.4); sfx('dig');
      if (D.prog >= 1) {
        breakTile(D.c, D.r, 'drill'); p.dig = null; sfx('crumble');
        if (tut) { if (D.dir === 0) tut.down = (tut.down || 0) + 1; else tut.side = (tut.side || 0) + 1; if ((tut.step === 0 && tut.down >= 3) || (tut.step === 1 && tut.side >= 1)) tutNext(); }
        if (D.dir !== 0) p.vx = D.dir * 30;
      }
    }
  }
  if (!p.dig) {
    const speed = 46 * eng;
    p.vx += (ix * speed - p.vx) * damp(p.grounded ? 14 : 6, dt);
    p.vy += 330 * dt;
    if (p.thrusting) {
      p.vy -= 640 * Math.min(1, -iy * 1.3) * Math.sqrt(eng) * dt; p.vy = Math.max(p.vy, -62 * eng);
      burn += 0.42; sfx('thrust');
      if (Math.random() < 0.8) part(p.x + rand(-2, 2), p.y + 1, Math.random() < 0.5 ? '#ffb03a' : '#fff3b0', rand(-15, 15) - p.vx * 0.2, rand(50, 90), rand(0.12, 0.25), 1, 0, true);
    }
    p.vy = Math.min(p.vy, 250);
    if (Math.abs(ix) > 0.2 && p.grounded) burn += 0.09 * Math.abs(ix);
    const res = collide(p, dt);
    if (res.land > 60) {
      p.sqv -= Math.min(6, res.land / 40); sfx('land');
      for (let k = 0; k < 4; k++) part(p.x + rand(-4, 4), p.y, tilePal(tileAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE) + 0), Math.floor(p.y / TILE))[k], rand(-30, 30), rand(-30, -5), 0.3, 1, 200);
      if (res.land > 232 && !has('feather')) hurtPlayer(((res.land - 232) * 0.3 + 3) * (1 - bonus('amortir')), p.x);
    }
    // start digging: down when standing still-ish, sideways when pushing into a wall
    if (p.grounded && !p.dead) {
      const c = Math.floor(p.x / TILE), rb = Math.floor((p.y + 0.5) / TILE);
      if (wantDown && diggable(tileAt(c, rb))) startDig(c, rb, 0);
      else if (Math.abs(ix) > 0.5 && !wantDown) {
        const dir = ix > 0 ? 1 : -1, cs = Math.floor((p.x + dir * 5) / TILE), rs = Math.floor((p.y - 4) / TILE);
        const edge = dir > 0 ? cs * TILE - (p.x + 4) : p.x - 4 - (cs + 1) * TILE;
        if (cs !== c && edge < 1.2 && diggable(tileAt(cs, rs))) startDig(cs, rs, dir);
      }
    }
  }
  // tread dust & squash/antenna springs
  if (p.grounded && Math.abs(p.vx) > 15) { p.stepT -= dt; if (p.stepT <= 0) { p.stepT = 0.12; part(p.x - p.face * 4, p.y, tilePal(T.DIRT, Math.max(0, Math.floor(p.y / TILE)))[2], -p.face * rand(5, 20), rand(-15, -5), 0.3, 1, 100); } }
  p.sqv += (-p.sq * 220 - p.sqv * 14) * dt; p.sq = clamp(p.sq + p.sqv * dt, -0.4, 0.4);
  p.antv += (-p.ant * 170 - p.antv * 7 - (p.vx - prevVx) / Math.max(dt, 0.001) * 0.03) * dt; p.ant = clamp(p.ant + p.antv * dt, -3, 3);
  p.spin += dt * (p.dig ? 30 : p.drilling ? 16 : 0);
  p.blink -= dt; if (p.blink < -0.12) p.blink = rand(1.8, 4.5);

  // hazards
  const inLava = [[-3, -1], [3, -1], [0, -6]].some(([dx, dy]) => TD[tileAt(Math.floor((p.x + dx) / TILE), Math.floor((p.y + dy) / TILE))].lava);
  if (inLava && p.inv < 1 && !cheat.god && !(p.shield > 0)) {
    p.hull -= 22 * (has('cinder') ? 0.5 : 1) * (1 - bonus('refroidir')) * dt; p.hurtT = 0.2; p.lavaT -= dt; sfx('sizzle');
    if (p.lavaT <= 0) { p.lavaT = 0.3; part(p.x + rand(-4, 4), p.y - 8, '#ffb03a', rand(-10, 10), rand(-50, -30), 0.4, 1, 0, true); }
    if (p.hull <= 0) wreck('hull');
  }
  if (zone === 2 && under) burn *= 1.3 * (1 - bonus('refroidir'));   // heat
  if (has('oil')) burn *= 0.88;
  if (cheat.fuel || cheat.god) burn = 0;
  p.fuel = Math.max(0, p.fuel - burn * dt);
  if (p.fuel < st.fuel() * 0.2 && under) { p.lowFuelT -= dt; if (p.lowFuelT <= 0) { p.lowFuelT = 2.5; sfx('low'); toast('LOW FUEL! FLY HOME'); } }
  if (p.fuel <= 0 && !p.dead) wreck('fuel');

  // places
  const cu = Math.floor(p.x / TILE), ru = Math.floor((p.y + 0.5) / TILE), tu = p.grounded ? tileAt(cu, ru) : -1;
  const onPad = tu === T.CONCRETE && ru === 0;
  if (onPad && !p.atBase) { p.atBase = true; if (needsBase()) openBase(); }
  else if (!onPad && p.atBase && (p.y < -8 || p.y > 4 || Math.abs(p.x - BASE_X) > 45)) p.atBase = false;
  p.onLift = tu === T.LIFT ? zoneOf(ru) : -1;
  // depth records, zone banners, guardians
  const r = Math.max(0, row);
  if (r > p.maxRow) p.maxRow = r;
  if (r * 2 > save.bestDepth) { save.bestDepth = r * 2; questEvent('depth', save.bestDepth); emit('depth', save.bestDepth); }
  if (under && zone !== lastZone) { lastZone = zone; banner(ZONES[zone].name, '#fff3d6', L('DEPTH {n}M', { n: zone * ZONE_H * 2 })); Music.set(SONGS[1 + zone]); }
  if (!under && lastZone !== -1) { lastZone = -1; Music.set(SONGS[0]); }
  const local = row - zone * ZONE_H;
  if (!boss && local >= 49 && local <= 56 && !(save.bossDown & (1 << zone))) spawnBoss(zone);
}
function startDig(c, r, dir) {
  const i = r * COLS + c;
  p.dig = { c, r, dir, prog: world.crack.get(i) || 0, time: digTime(c, r) };
  if (save.up.drill < (TD[tileAt(c, r)].req || 0) && !p.slowWarned) { p.slowWarned = true; toast('TOO HARD! UPGRADE YOUR DRILL'); }
}
function needsBase() { return cargoCount() > 0 || p.fuel < st.fuel() * 0.97 || p.hull < st.hull(); }

// ---------- critters ----------
const EDEF = DATA.ennemis.creatures;
function spawnEnemy(type, x, y) {
  const d = EDEF[type], m = 1 + save.stars * 0.25;
  E.enemies.push({ type, x, y, vx: 0, vy: 0, hp: d.hp * m, max: d.hp * m, dmg: d.dmg * m, face: Math.random() < 0.5 ? -1 : 1, t: Math.random() * 3, flash: 0, grounded: false, pop: 0, dash: 0 });
}
function trySpawnEnemy() {
  const row = Math.floor(p.y / TILE); if (row < 6) return;
  const zone = zoneOf(row), local = row - zone * ZONE_H;
  if (local > 46 || E.enemies.length >= ZONES[zone].maxCreatures) return;
  const pool = ZONES[zone].creatures;
  const type = pool[Math.floor(Math.random() * pool.length)];
  for (let k = 0; k < 24; k++) {
    const a = Math.random() * TAU, d = rand(70, 150), x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d * 0.7;
    const c = Math.floor(x / TILE), r = Math.floor(y / TILE);
    if (r < 4 || tileAt(c, r) !== T.AIR) continue;
    if ((r % ZONE_H) >= 47) continue;
    if (!EDEF[type].fly && !solidAt(c, r + 1)) continue;
    spawnEnemy(type, c * TILE + 5, EDEF[type].fly ? r * TILE + 8 : (r + 1) * TILE);
    return;
  }
}
function killEnemy(e) {
  if (e.dead) return; e.dead = true;
  const col = { grub: '#f7a8a0', bat: '#8e5cc8', cinder: '#ffb03a', moth: '#c79be8' }[e.type];
  burst(e.x, e.y - 3, col, 12, 1, 1); sfx('kill');
  spawnCoins(e.x, e.y - 3, EDEF[e.type].coins * (1 + save.stars * 0.5), 2 + Math.floor(Math.random() * 2));
  save.kills++; questEvent('kills');
  emit('kill', e);
}
function updateEnemies(dt) {
  const pb = pBox(), db = drillBox();
  for (const e of E.enemies) {
    const d = EDEF[e.type], dx = p.x - e.x, dy = p.y - 4 - (e.y - 3), dist = Math.hypot(dx, dy);
    e.t += dt; e.flash = Math.max(0, e.flash - dt); e.pop = Math.min(1, e.pop + dt * 4);
    if (dist > 290) { e.dead = true; continue; }
    if (e.type === 'grub') {
      e.vx = e.face * d.spd; e.vy += 330 * dt; const res = collide(e, dt, d.w, d.h);
      const ahead = Math.floor((e.x + e.face * 5) / TILE), below = Math.floor((e.y + 1) / TILE);
      if (res.hitL || res.hitR || (e.grounded && !solidAt(ahead, below))) e.face *= -1;
    } else if (e.type === 'bat') {
      if (dist < 120 && !p.dead) { e.vx += (dx / dist * d.spd - e.vx) * damp(2.5, dt); e.vy += (dy / dist * d.spd + Math.sin(e.t * 6) * 18 - e.vy) * damp(2.5, dt); }
      else { e.vx *= 0.97; e.vy = Math.sin(e.t * 3) * 10; }
      collide(e, dt, d.w, d.h); if (Math.abs(e.vx) > 2) e.face = e.vx > 0 ? 1 : -1;
    } else if (e.type === 'cinder') {
      e.vy += 330 * dt; const was = e.grounded; collide(e, dt, d.w, d.h);
      if (e.grounded) { e.vx *= 0.8; if (!was) burst(e.x, e.y, '#ffb03a', 3, 0.4); if (e.t > 1.4 && dist < 120 && !p.dead) { e.t = rand(0, 0.4); e.face = Math.sign(dx) || 1; e.vx = e.face * 45; e.vy = -120; } }
    } else if (e.type === 'moth') {
      if (e.dash > 0) { e.dash -= dt; } else {
        e.vx += (Math.sin(e.t * 1.3) * 14 + (dist < 140 ? dx / dist * 10 : 0) - e.vx) * damp(3, dt);
        e.vy += (Math.cos(e.t * 2.1) * 12 + (dist < 140 ? dy / dist * 8 : 0) - e.vy) * damp(3, dt);
        if (e.t > 2.8 && dist < 100 && !p.dead) { e.t = 0; e.dash = 0.4; e.vx = dx / dist * 115; e.vy = dy / dist * 115; sfx('hover'); }
      }
      collide(e, dt, d.w, d.h); if (Math.abs(e.vx) > 2) e.face = e.vx > 0 ? 1 : -1;
    }
    if (!d.lavaproof && TD[tileAt(Math.floor(e.x / TILE), Math.floor((e.y - 2) / TILE))].lava) { e.hp -= 40 * dt; if (e.hp <= 0) killEnemy(e); }
    if (p.dead || e.dead) continue;
    const eb = { x0: e.x - d.w - 1, x1: e.x + d.w + 1, y0: e.y - d.h - 1, y1: e.y };
    if (p.drilling && overlap(db, eb)) {
      e.hp -= drillDps() * dt; e.flash = 0.08; e.vx += p.face * 30 * dt * 10; sfx('bosshit');
      if (Math.random() < 0.4) part(e.x, e.y - 3, '#fff3b0', rand(-50, 50), rand(-60, 0), 0.2, 1, 200, true);
      if (e.hp <= 0) killEnemy(e);
    } else if (overlap(pb, eb)) hurtPlayer(e.dmg, e.x);
  }
  E.enemies = E.enemies.filter(e => !e.dead);
}

// ---------- guardians ----------
const BOSS = DATA.ennemis.gardiens;
function arena(z) { const top = z * ZONE_H; return { x0: 2 * TILE, x1: (COLS - 2) * TILE, y0: (top + 49) * TILE, y1: (top + 57) * TILE }; }
function spawnBoss(z) {
  const type = ZONES[z].boss, d = BOSS[type], A = arena(z), m = 1 + save.stars * 0.3;
  boss = { z, type, x: p.x < 180 ? A.x1 - 40 : A.x0 + 40, y: type === 'prism' ? A.y0 + 40 : A.y1, vx: 0, vy: 0, w: d.w, h: d.h, hp: d.hp * m, max: d.hp * m,
    dmg: d.dmg * m, st: 'intro', t: 0, face: p.x < 180 ? -1 : 1, flash: 0, vuln: false, hops: 0, orbit: 16, ang: 0, ringT: 1.5, openT: 6, dying: 0, grounded: true, hitT: 0 };
  banner(ZONES[z].bossName, '#ff6b6b', 'GUARDIAN'); sfx('boss'); shake(5); Music.set(BOSS_SONG);
}
function damageBoss(n) {
  boss.hp -= n; boss.flash = 0.1;
  if (boss.hp <= 0 && !boss.dying) { boss.dying = 1.6; boss.vuln = false; freeze = 0.25; shake(8); sfx('boss'); }
}
function bossSet(s) { boss.st = s; boss.t = 0; }
function updateBoss(dt) {
  const b = boss, A = arena(b.z), dx = p.x - b.x;
  b.t += dt; b.flash = Math.max(0, b.flash - dt);
  if (b.dying) {
    b.dying -= dt; if (Math.random() < 0.5) burst(b.x + rand(-b.w / 2, b.w / 2), b.y - rand(0, b.h), ['#fff3b0', '#ffb03a', '#e2483d'][Math.floor(Math.random() * 3)], 4, 1, 2);
    shake(2);
    if (b.dying <= 0) bossDefeated();
    return;
  }
  const gravity = () => { b.vy += 330 * dt; b.y += b.vy * dt; if (b.y >= A.y1) { const land = b.vy; b.y = A.y1; b.vy = 0; return land || 1; } return 0; };
  const walls = () => { if (b.x < A.x0 + b.w / 2) { b.x = A.x0 + b.w / 2; return -1; } if (b.x > A.x1 - b.w / 2) { b.x = A.x1 - b.w / 2; return 1; } return 0; };
  if (b.st === 'intro') { if (b.t > 1.2) bossSet(b.type === 'prism' ? 'float' : b.type === 'toad' ? 'sit' : 'walk'); }
  else if (b.type === 'grubmother') {
    if (b.st === 'walk') { b.face = Math.sign(dx) || b.face; b.x += b.face * 26 * dt; walls(); if (b.t > 3) { bossSet('rear'); sfx('warn'); } }
    else if (b.st === 'rear') { if (b.t > 0.8) bossSet('charge'); }
    else if (b.st === 'charge') { b.x += b.face * 155 * dt; if (Math.random() < 0.5) part(b.x - b.face * 10, b.y, '#8a5a3b', -b.face * 30, -30, 0.3, 1, 200); if (walls()) { shake(6); sfx('boom'); bossSet('stun'); b.vuln = true; } }
    else if (b.st === 'stun') { if (b.t > 2.6) { b.vuln = false; bossSet('walk'); for (let k = 0; k < 2; k++) if (E.enemies.length < 5) spawnEnemy('grub', b.x + rand(-10, 10), b.y); } }
  } else if (b.type === 'crab') {
    if (b.st === 'walk') { b.face = Math.sign(dx) || b.face; b.x += b.face * 20 * dt; walls(); if (b.t > 2.4) bossSet('crouch'); }
    else if (b.st === 'crouch') { if (b.t > 0.5) { bossSet('leap'); b.vy = -200; b.vx = clamp(dx / 0.95, -120, 120); } }
    else if (b.st === 'leap') { b.x += b.vx * dt; walls(); if (gravity() && b.t > 0.1) {
      shake(7); sfx('boom'); bossSet('stun'); b.vuln = true;
      for (let k = 0; k < 5 + b.z; k++) E.shots.push({ x: rand(A.x0 + 10, A.x1 - 10), y: A.y0 + 2, vx: 0, vy: rand(0, 30), g: 260, kind: 'rock', dmg: 10, life: 4, delay: k * 0.15 });
    } }
    else if (b.st === 'stun') { if (b.t > 2.2) { b.vuln = false; bossSet('walk'); } }
  } else if (b.type === 'toad') {
    if (b.st === 'sit') { if (b.t > 0.8) { if (b.hops >= 3) { b.hops = 0; bossSet('rest'); b.vuln = true; } else { bossSet('hop'); b.vy = -185; b.face = Math.sign(dx) || b.face; b.vx = b.face * 75; b.hops++; } } }
    else if (b.st === 'hop') { b.x += b.vx * dt; walls(); if (gravity() && b.t > 0.1) {
      shake(4); sfx('land'); bossSet('sit');
      for (let k = -1; k <= 1; k++) E.shots.push({ x: b.x + b.face * 8, y: b.y - 8, vx: clamp(dx * 1.1, -150, 150) + k * 30, vy: -150 + Math.abs(k) * 20, g: 300, kind: 'fireball', dmg: 12, life: 4 });
    } }
    else if (b.st === 'rest') { if (b.t > 2.6) { b.vuln = false; bossSet('sit'); } }
  } else if (b.type === 'prism') {
    const half = b.hp < b.max / 2;
    b.ang += dt * (half ? 2.6 : 1.8);
    b.x += clamp(dx, -30, 30) * dt * (half ? 1.4 : 1); b.y = A.y0 + 30 + Math.sin(time * 1.4) * 10; walls();
    if (b.st === 'float') {
      b.orbit += (17 - b.orbit) * damp(6, dt);
      b.ringT -= dt; if (b.ringT <= 0) { b.ringT = half ? 1.8 : 2.4; const n = half ? 12 : 8, off = Math.random() * TAU; for (let k = 0; k < n; k++) { const a = off + k / n * TAU; E.shots.push({ x: b.x, y: b.y - 7, vx: Math.cos(a) * 52, vy: Math.sin(a) * 52, g: 0, kind: 'spark', dmg: 9, life: 5 }); } sfx('hover'); }
      if (b.t > 7) { bossSet('open'); b.vuln = true; sfx('relic'); }
    } else if (b.st === 'open') { b.orbit += (0 - b.orbit) * damp(8, dt); if (b.t > 3.2) { b.vuln = false; bossSet('float'); } }
    // orbiting shards hurt on touch
    if (b.orbit > 6 && !p.dead) for (let k = 0; k < 4; k++) { const a = b.ang + k / 4 * TAU, sx = b.x + Math.cos(a) * b.orbit, sy = b.y - 7 + Math.sin(a) * b.orbit; if (Math.abs(sx - p.x) < 6 && Math.abs(sy - (p.y - 4)) < 7) hurtPlayer(b.dmg * 0.7, sx); }
  }
  // drill vs guardian
  if (p.dead) return;
  const bb = { x0: b.x - b.w / 2, x1: b.x + b.w / 2, y0: b.y - b.h - (b.type === 'prism' ? 0 : 0), y1: b.y };
  if (b.type === 'prism') { bb.y0 = b.y - b.h; bb.y1 = b.y; }
  if (b.st === 'intro') return;
  if (b.vuln) {
    if (p.drilling && overlap(drillBox(), bb)) { damageBoss(drillDps() * dt); b.hitT -= dt; if (b.hitT <= 0) { b.hitT = 0.1; sfx('bosshit'); part(clamp(p.x + p.face * 6, bb.x0, bb.x1), clamp(p.y - 4, bb.y0, bb.y1), '#fff3b0', rand(-60, 60), rand(-80, 0), 0.25, 1, 250, true); } }
  } else if (overlap(pBox(), bb)) { hurtPlayer(b.dmg, b.x); p.vx = (p.x < b.x ? -1 : 1) * 130; p.vy = -90; }
}
function bossDefeated() {
  const b = boss, z = b.z, A = arena(z), relic = ZONES[z].relic;
  boss = null;
  save.bossDown |= 1 << z; save.bosses++; questEvent('boss');
  burst(b.x, b.y - b.h / 2, '#fff3b0', 40, 2, 2, 100); E.lights.push({ x: b.x, y: b.y - 8, r: 90, t: 1, max: 1 });
  spawnCoins(b.x, b.y - b.h / 2, BOSS[b.type].cash * (1 + save.stars * 0.5), 24);
  if (!has(relic)) save.relics.push(relic);
  sfx('relic'); SDK.happytime(); Music.set(SONGS[1 + z]);
  banner(L('RELIC FOUND: {name}', { name: L(RELICS[relic].name) }), '#f6d743', z < 3 ? 'THE WAY DOWN IS OPEN' : RELICS[relic].desc);
  emit('boss', z);
  if (z < 3) { openSeal(z); for (let c = 16; c <= 19; c++) burst(c * TILE + 5, A.y1 + 5, '#7b62a0', 8, 1); shake(6); }
  else winPending = 2.6;
  writeSave();
}

// ---------- shots, boulders, bombs, coins, fx ----------
function updateShots(dt) {
  const pb = pBox();
  for (const s of E.shots) {
    if (s.delay > 0) { s.delay -= dt; continue; }
    s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt;
    if (s.kind === 'fireball' && Math.random() < 0.5) part(s.x, s.y, '#ffb03a', rand(-8, 8), rand(-8, 8), 0.25, 1, 0, true);
    if (s.life <= 0 || solidAt(Math.floor(s.x / TILE), Math.floor(s.y / TILE))) { s.dead = true; burst(s.x, s.y, s.kind === 'rock' ? '#8d8f99' : s.kind === 'spark' ? '#9fe2ff' : '#ffb03a', 5, 0.5); continue; }
    if (!p.dead && s.x > pb.x0 - 2 && s.x < pb.x1 + 2 && s.y > pb.y0 - 2 && s.y < pb.y1 + 1) { s.dead = true; hurtPlayer(s.dmg, s.x); }
  }
  E.shots = E.shots.filter(s => !s.dead);
}
function updateBoulders(dt) {
  for (const b of E.boulders) {
    b.t -= dt;
    if (b.t <= 0 && !b.done) {
      b.done = true; const i = b.r * COLS + b.c;
      if (world.t[i] !== T.BOULDER) continue;
      world.t[i] = T.AIR; markDug(i);
      E.falling.push({ x: b.c * TILE + 5, y: b.r * TILE, vy: 0 });
      checkBoulder(b.c, b.r - 1);
    }
  }
  E.boulders = E.boulders.filter(b => !b.done);
  for (const f of E.falling) {
    f.vy = Math.min(260, f.vy + 330 * dt); f.y += f.vy * dt;
    const r = Math.floor((f.y + 10) / TILE), c = Math.floor(f.x / TILE);
    const hitP = !p.dead && Math.abs(p.x - f.x) < 8 && f.y + 10 > p.y - 8 && f.y < p.y;
    if (hitP) hurtPlayer(18, f.x);
    if (hitP || solidAt(c, r) || TD[tileAt(c, r)].lava || f.y > ROWS * TILE) {
      f.dead = true; burst(f.x, f.y + 6, '#8d8f99', 12, 0.8, 2); sfx('crumble'); shake(3);
      for (const e of E.enemies) if (Math.abs(e.x - f.x) < 8 && Math.abs(e.y - f.y - 8) < 10) killEnemy(e);
    }
  }
  E.falling = E.falling.filter(f => !f.dead);
}
function updateBombs(dt) {
  for (const b of E.bombs) {
    b.t -= dt; b.vy += 330 * dt; const o = { x: b.x, y: b.y, vx: 0, vy: b.vy }; collide(o, dt, 3, 6); b.y = o.y; b.vy = o.vy;
    if (Math.random() < 0.6) part(b.x + 2, b.y - 7, Math.random() < 0.5 ? '#fff3b0' : '#ffb03a', rand(-20, 20), rand(-40, -10), 0.2, 1, 0, true);
    if (b.t % 0.3 < dt) sfx('fuse');
    if (b.t <= 0) { b.dead = true; const big = has('blastcap'); explode(b.x, b.y - 4, big ? 2.6 : 1.8, 10, 45, big ? 60 : 30); }
  }
  E.bombs = E.bombs.filter(b => !b.dead);
  for (const q of E.booms) { q.t -= dt; if (q.t <= 0) { q.dead = true; explode(q.x, q.y, q.R, q.pd, 30, 20); } }
  E.booms = E.booms.filter(q => !q.dead);
}
function updatePickups(dt) {
  for (const k of E.pickups) {
    k.t += dt;
    const dx = p.x - k.x, dy = p.y - 4 - k.y, d = Math.hypot(dx, dy);
    if (k.t > 0.4 && d < 26 * Math.max(1, bonus('aimant')) && !p.dead) { k.x += dx / d * Math.min(d, 160 * dt + d * 6 * dt); k.y += dy / d * Math.min(d, 160 * dt + d * 6 * dt); }
    else { k.vy += 300 * dt; k.vx *= 0.98; const o = { x: k.x, y: k.y, vx: k.vx, vy: k.vy }; const res = collide(o, dt, 2, 4); k.x = o.x; k.y = o.y; k.vx = o.vx * (o.grounded ? 0.8 : 1); k.vy = res.land > 50 ? -res.land * 0.35 : o.vy; }
    if (d < 6 && k.t > 0.4 && !p.dead) { k.dead = true; save.cash += k.v; save.earned += k.v; questEvent('earn', k.v); sfx('coin'); popText(p.x, p.y - 12, '+' + k.v, '#f6d743'); }
    if (k.t > 30) k.dead = true;
  }
  E.pickups = E.pickups.filter(k => !k.dead);
  for (const f of E.flyOres) { f.t += dt * 3.2; if (f.t >= 1) f.dead = true; else { const e = easeOut(f.t); f.x = lerp(f.sx, p.x, e); f.y = lerp(f.sy, p.y - 5, e) - Math.sin(f.t * Math.PI) * 10; } }
  E.flyOres = E.flyOres.filter(f => !f.dead);
}
function updateFx(dt) {
  for (const q of E.parts) {
    q.life -= dt; q.vy += q.grav * dt; q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.grav > 0 && solidAt(Math.floor(q.x / TILE), Math.floor(q.y / TILE))) { q.vy *= -0.3; q.vx *= 0.5; q.y -= 1; }
  }
  E.parts = E.parts.filter(q => q.life > 0);
  for (const t of E.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= 0.95; }
  E.texts = E.texts.filter(t => t.life > 0);
  for (const l of E.lights) l.t -= dt;
  E.lights = E.lights.filter(l => l.t > 0);
}

// ============================================================
//  Actions: base, workshop, items, lifts, ads
// ============================================================
let runsPlayed = 0;
function openBase() {
  if (state !== 'play' || !p || p.dead) return;
  const sold = []; let total = 0;
  for (let i = 1; i < ORES.length; i++) if (save.cargo[i]) { const v = save.cargo[i] * oreValue(i); total += v; sold.push([i, save.cargo[i], v]); save.cargo[i] = 0; }
  save.cash += total; save.earned += total; if (total) questEvent('earn', total);
  const fMax = st.fuel(), hMax = st.hull();
  const fCost = Math.ceil((fMax - p.fuel) * 1.0), fPay = Math.min(fCost, save.cash); save.cash -= fPay; p.fuel = Math.min(fMax, p.fuel + fPay / 1.0);
  const hCost = Math.ceil((hMax - p.hull) * 1.5), hPay = Math.min(hCost, save.cash); save.cash -= hPay; p.hull = Math.min(hMax, p.hull + hPay / 1.5);
  if (fPay >= fCost) p.fuel = fMax; if (hPay >= hCost) p.hull = hMax;
  const freeFuel = p.fuel < fMax * 0.5, freeHull = p.hull < hMax * 0.5;   // never stranded: a broke robot still gets half a tank
  if (freeFuel) p.fuel = fMax * 0.5; if (freeHull) p.hull = hMax * 0.5;
  baseInfo = { sold, total, fPay, hPay, freeFuel, freeHull, x2: false, depth: p.maxRow * 2 };
  p.revived = false; p.maxRow = 0; p.vx = 0; p.dig = null; p.atBase = true; save.dives++; joy = null;
  if (tut) { tut = null; save.tutorialDone = true; }
  banners.length = 0; setScreen('base'); SDK.gameplayStop(); sfx(total ? 'sell' : 'buy'); p.happyT = 2.5;
  emit('base', baseInfo);
  writeSave();
}
async function x2Sale() {
  if (busy || !baseInfo || baseInfo.x2 || baseInfo.total < 30 || !rewardedOK()) return;
  busy = true; const ok = await SDK.ad('rewarded'); busy = false;
  if (!ok) return toast('AD NOT AVAILABLE');
  baseInfo.x2 = true; save.cash += baseInfo.total; save.earned += baseInfo.total; questEvent('earn', baseInfo.total);
  toast(L('+{n} COINS', { n: baseInfo.total })); sfx('sell'); writeSave();
}
function resumePlay() {
  setScreen('play'); SDK.gameplayStart(); ensureAudio(); Music.start(); lastFrame = performance.now();
}
// Poki wants a commercialBreak before every return to gameplay (it decides itself whether an ad plays)
async function breakThen(fn, cgToo = false) {
  if (busy) return;
  if (PLATFORM === 'poki' || cgToo) { busy = true; await SDK.ad('midgame'); busy = false; }
  fn();
}
function backToDig() { breakThen(resumePlay); }
function openShop() { if (state !== 'shop' && state !== 'relics') subReturn = state; setScreen('shop'); confirmNew = 0; shopPage = 0; }
function openRelics() { if (state !== 'shop' && state !== 'relics') subReturn = state; setScreen('relics'); }
function closeSub() { setScreen(state === 'relics' && subReturn !== 'menu' ? 'shop' : subReturn); }
function buyUp(id) {
  const lvl = save.up[id]; if (lvl >= UP_MAX) return;
  const cost = upCost(id);
  if (save.cash < cost) { toast('NOT ENOUGH COINS'); sfx('deny'); return; }
  save.cash -= cost; save.up[id]++; sfx('buy');
  if (id === 'fuel') p.fuel = st.fuel(); if (id === 'hull') p.hull = st.hull();
  toast(L('{name} LEVEL {n}!', { name: L(UPGRADES[id].name), n: save.up[id] })); writeSave();
}
// achat et utilisation des objets : modules/sac.js (le sac à dos)
const buyItem = id => MOD.sac.buy(id);
const freeCoinAmount = () => { const c = UP_IDS.filter(id => save.up[id] < UP_MAX).map(upCost); return Math.max(60, Math.round((c.length ? Math.min(...c) : 5000) * 0.4 / 5) * 5); };
async function freeCoins() {
  if (busy || Date.now() < freeCoinsAt || !rewardedOK()) return;
  busy = true; const ok = await SDK.ad('rewarded'); busy = false;
  if (!ok) return toast('AD NOT AVAILABLE');
  const n = freeCoinAmount(); save.cash += n; writeSave(); toast(L('+{n} COINS', { n })); sfx('sell'); freeCoinsAt = Date.now() + 180000;
}
const useItem = id => MOD.sac.use(id);
function warp(x, y, after) {
  if (fade) return;
  sfx('lift'); p.dig = null;
  fade = { t: 0, fn: () => { p.x = x; p.y = y; p.vx = 0; p.vy = 0; p.atBase = false; cam.x = x; cam.y = y - 20; clearEntities(); if (after) after(); } };
}
function liftUp() { if (p && p.onLift > 0 && !fade) warp(BASE_X, 0); }
function liftTo(z) {
  if (!(save.bossDown & (1 << (z - 1)))) return;
  breakThen(() => { resumePlay(); p.atBase = true; warp(BASE_X, (z * ZONE_H + 3) * TILE); });
}
// voyage depuis la base (balise, ascenseur) : pause pub éventuelle (Poki), retour en jeu puis fondu jusqu'à la destination
function travelTo(x, y) { breakThen(() => { resumePlay(); p.atBase = true; warp(x, y); }); }
function interact() { if (state !== 'play' || !p || p.dead) return; if (ask('interact')) return; if (p.atBase && Math.abs(p.x - BASE_X) < 45 && p.y <= 0.5) { p.atBase = false; openBase(); } else if (p.onLift > 0) liftUp(); }
async function reviveHere() {
  if (busy || p.revived || !rewardedOK()) return;
  busy = true; const ok = await SDK.ad('rewarded'); busy = false;
  if (!ok) return toast('AD NOT AVAILABLE');
  p.dead = false; p.revived = true; p.inv = 2.5;
  p.hull = Math.max(p.hull, st.hull() * 0.6); p.fuel = Math.max(p.fuel, st.fuel() * 0.6);
  resumePlay();
}
function towHome() {
  breakThen(() => {
    for (let i = 0; i < save.cargo.length; i++) save.cargo[i] = 0;
    clearEntities(); fade = null;
    // towing is insured: the robot comes home repaired and refuelled for free, only the cargo is lost
    p.dead = false; p.x = BASE_X; p.y = 0; p.vx = 0; p.vy = 0; p.hull = st.hull(); p.fuel = st.fuel(); p.dig = null;
    cam.x = p.x; cam.y = -20; lastZone = -1; Music.set(SONGS[0]);
    setScreen('play'); p.atBase = true; openBase();
  }, true);
}
function newExpedition() {
  breakThen(() => {
    save.stars++; save.wins++;
    save.seed = 1 + Math.floor(Math.random() * 2147483000); save.dug = ''; save.bossDown = 0;
    for (const id of UP_IDS) save.up[id] = 0;
    save.cargo = save.cargo.map(() => 0);
    save.cash = 250 * save.stars; save.hull = -1; save.fuel = -1;
    loadWorld(); clearEntities(); newPlayer(); emit('expedition'); writeSave();
    resumePlay(); lastZone = -1; Music.set(SONGS[0]);
    banner(L('EXPEDITION {n}', { n: save.stars + 1 }), '#f6d743', L('ORES WORTH +{n}%', { n: save.stars * 30 }));
  }, true);
}
function pause(fromFocus = false) {
  if (state !== 'play') return;
  setScreen('pause');
  // CrazyGames handles focus loss itself; Poki wants gameplayStop on every interruption
  if (!fromFocus || PLATFORM === 'poki') SDK.gameplayStop();
  joy = null; keys.clear(); writeSave();
}
function resume() { if (state === 'pause') breakThen(() => { if (state === 'pause') resumePlay(); }); }
function toMenu() { SDK.gameplayStop(); writeSave(); setScreen('menu'); joy = null; }
function play() {
  if (busy) return;
  const go = () => { runsPlayed++; if (p.dead) { towHome(); return; } resumePlay(); Music.set(p.y > 2 ? SONGS[1 + zoneOf(Math.floor(p.y / TILE))] : SONGS[0]); };
  if (runsPlayed > 0) breakThen(go, true); else go();
}
function cycleLang() { lang = LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]; save.lang = lang; writeSave(); }
function toggleMute() { muted = !muted; save.muted = muted; writeSave(); refreshAudio(); }   // never un-mutes while the platform has muted the game
function tutNext() { if (!tut) return; tut.step++; tut.t = 0; sfx('click'); }

// ============================================================
//  Rendering: world
// ============================================================
const TEX = {};
function makeTileTex(t, v, z) {
  const d = TD[t], c = document.createElement('canvas'); c.width = TILE; c.height = TILE;
  const x = c.getContext('2d'), rnd = prng(t * 97 + v * 13 + z * 7 + 1), pal = d.pal;
  for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) { const r = rnd(); x.fillStyle = pal[r < 0.5 ? 0 : r < 0.72 ? 1 : r < 0.9 ? 2 : 3]; x.fillRect(i, j, 1, 1); }
  const dot = (col, n, w = 1, h = 1) => { x.fillStyle = col; for (let k = 0; k < n; k++) x.fillRect(Math.floor(rnd() * (TILE - w + 1)), Math.floor(rnd() * (TILE - h + 1)), w, h); };
  if (t === T.DIRT || t === T.CLAY) { dot(d.speck, 4); dot(d.dark, 4); if (rnd() < 0.5) dot('#a8a08c', 1, 2, 1); }
  else if (t === T.STONE || t === T.GRANITE || t === T.GAS) {
    dot(d.speck, 3); dot(d.dark, 3);
    x.fillStyle = d.dark; let px = Math.floor(rnd() * 6) + 2, py = 1; for (let k = 0; k < 4; k++) { x.fillRect(px, py, 1, 1); px += rnd() < 0.5 ? 1 : -1; py += 1 + (rnd() < 0.4 ? 1 : 0); }
    if (t === T.GAS) { x.fillStyle = '#9fd36a'; for (const [a, b] of [[2, 3], [6, 6], [4, 8]]) if (rnd() < 0.8) x.fillRect(a + v % 2, b, 1, 1); x.fillStyle = '#5e8a3a'; x.fillRect(5, 2 + v % 3, 1, 1); }
  } else if (t === T.BASALT) { dot(d.speck, 3); x.fillStyle = '#5a2a20'; for (let k = 0, py = Math.floor(rnd() * 10); k < 6; k++) x.fillRect(k + 2, (py + Math.floor(k / 2)) % 10, 1, 1); dot('#4e3e46', 3); }
  else if (t === T.CRYST) { dot(d.speck, 2); x.fillStyle = '#6a5fb8'; const a = 2 + Math.floor(rnd() * 5); x.fillRect(a, 4, 1, 4); x.fillRect(a + 1, 5, 1, 3); x.fillStyle = '#c7bdf6'; x.fillRect(a, 4, 1, 1); dot('#262046', 3); }
  else if (t === T.BEDROCK) { dot(d.speck, 3, 2, 1); dot(d.dark, 3, 1, 2); }
  else if (t === T.SEAL) { x.fillStyle = d.dark; x.fillRect(0, 0, 10, 1); x.fillRect(0, 0, 1, 10); x.fillStyle = d.speck; const g = [[2, 3], [3, 3], [4, 3], [3, 4], [3, 5], [6, 5], [7, 5], [7, 6], [6, 7]]; for (const [a, b] of g) if (rnd() < 0.85) x.fillRect((a + v) % 9, b, 1, 1); }
  else if (t === T.CONCRETE) { x.fillStyle = d.dark; x.fillRect(0, 9, 10, 1); x.fillRect(9, 0, 1, 10); x.fillStyle = d.speck; x.fillRect(0, 0, 9, 1); dot('#7f7f88', 2); }
  return c;
}
function makeBack(z) {
  const base = TD[[T.DIRT, T.STONE, T.BASALT, T.CRYST][z]].pal, c = document.createElement('canvas'); c.width = TILE; c.height = TILE;
  const x = c.getContext('2d'), rnd = prng(z * 31 + 5);
  const dk = (h, k) => { const [r, g, b] = hexRgb(h); return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`; };
  for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) { const r = rnd(); x.fillStyle = dk(base[r < 0.6 ? 0 : r < 0.85 ? 1 : 3], 0.42); x.fillRect(i, j, 1, 1); }
  x.fillStyle = dk(base[3], 0.3); x.fillRect(Math.floor(rnd() * 8), Math.floor(rnd() * 8), 2, 1);
  return c;
}
function buildTiles() {
  for (const t of [T.DIRT, T.CLAY, T.STONE, T.GRANITE, T.BASALT, T.CRYST, T.BEDROCK, T.SEAL, T.CONCRETE, T.GAS]) TEX[t] = [0, 1, 2, 3].map(v => makeTileTex(t, v, 0));
  TEX.back = [0, 1, 2, 3].map(makeBack);
  TEX.ore = ORES.map(o => o && ART.ORE_MASKS[o.gem ? 'gem' : 'metal'].map(m => build(m, { map: { X: o.c, x: o.hi, D: o.lo } })));
}
function drawSpr(spr, x, y, { flip = 1, sx = 1, sy = 1, alpha = 1, white = false } = {}) {
  const img = white ? spr.wc : spr.c;
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (flip === 1 && sx === 1 && sy === 1) ctx.drawImage(img, Math.round(x - spr.w / 2), Math.round(y - spr.h));
  else { ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(flip * sx, sy); ctx.drawImage(img, -Math.round(spr.w / 2), -spr.h); ctx.restore(); }
  if (alpha !== 1) ctx.globalAlpha = 1;
}
function drawGlow(g, x, y, a = 1) { ctx.globalAlpha = clamp(a, 0, 1); ctx.drawImage(g.c, Math.round(x - g.w / 2), Math.round(y - g.h / 2)); ctx.globalAlpha = 1; }
function rectW(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
let view = { x0: 0, x1: 0, y0: 0, y1: 0 };

function drawSky() {
  const { x0, x1, y0 } = view; if (y0 > 0) return;
  const top = Math.min(y0, -SKY * TILE) - 10;
  const bands = ['#4a9fd8', '#5aaee0', '#6abbe6', '#7cc7ea', '#8fd2ee', '#a3dcf1', '#b8e6f4'];
  const bh = SKY * TILE / bands.length;
  rectW(x0, top, x1 - x0, -SKY * TILE - top + 1, bands[0]);
  bands.forEach((c, i) => rectW(x0, -SKY * TILE + i * bh, x1 - x0, bh + 1, c));
  const sx = Math.round(cam.x * 0.85 + 70), sy = -130;   // sun
  ctx.fillStyle = 'rgba(255,243,176,0.35)'; ctx.fillRect(sx - 12, sy - 12, 24, 24);
  ctx.fillStyle = '#fff3b0'; ctx.fillRect(sx - 8, sy - 6, 16, 12); ctx.fillRect(sx - 6, sy - 8, 12, 16);
  // far mountains and near hills (parallax), drawn in 2px columns for a chunky look
  for (let x = Math.floor(x0 / 2) * 2; x < x1; x += 2) {
    const m = x - cam.x * 0.55, n = Math.round(Math.sin(m * 0.018) * 18 + Math.sin(m * 0.047 + 1) * 8 + Math.sin(m * 0.11) * 3);
    rectW(x, -46 - n, 2, 46 + n, '#86aec4'); rectW(x, -46 - n, 2, 2, '#a9cbdc');
    const h = x - cam.x * 0.3, k = Math.round(Math.sin(h * 0.03 + 2) * 7 + Math.sin(h * 0.09) * 3);
    rectW(x, -20 - k, 2, 20 + k, '#5f9a52'); rectW(x, -20 - k, 2, 1, '#7fb86a');
  }
  for (let i = 0; i < 6; i++) {   // drifting clouds
    const span = 520, cx = Math.round(((i * 137 + time * (3 + i % 3)) % span) - span / 2 + cam.x * 0.8), cy = -150 + (i * 37) % 60;
    if (cx < x0 - 30 || cx > x1 + 30) continue;
    rectW(cx - 10, cy, 22, 4, '#ffffff'); rectW(cx - 6, cy - 3, 12, 3, '#ffffff'); rectW(cx - 1, cy - 5, 6, 2, '#ffffff'); rectW(cx - 10, cy + 4, 22, 1, '#dbeef7');
  }
}
function drawTiles() {
  const { x0, x1, y0, y1 } = view;
  const c0 = Math.floor(x0 / TILE) - 1, c1 = Math.floor(x1 / TILE) + 1, r0 = Math.max(0, Math.floor(y0 / TILE)), r1 = Math.min(ROWS + 4, Math.floor(y1 / TILE) + 1);
  for (let r = r0; r <= r1; r++) {
    const z = zoneOf(r);
    for (let c = c0; c <= c1; c++) {
      const X = c * TILE, Y = r * TILE, h = hash2(c, r), v = h & 3;
      const t = tileAt(c, r);
      if (c < 0 || c >= COLS || r >= ROWS) { ctx.drawImage(TEX[T.BEDROCK][v], X, Y); rectW(X, Y, TILE, TILE, 'rgba(10,8,16,0.35)'); continue; }
      if (t === T.AIR || t === T.LAVA || t === T.BOULDER) {
        ctx.drawImage(TEX.back[z], X, Y);
        if (solidAt(c, r - 1) && tileAt(c, r - 1) !== T.BOULDER) rectW(X, Y, TILE, 2, 'rgba(0,0,0,0.35)');
        if (solidAt(c - 1, r)) rectW(X, Y, 1, TILE, 'rgba(0,0,0,0.25)');
        if (solidAt(c + 1, r)) rectW(X + TILE - 1, Y, 1, TILE, 'rgba(0,0,0,0.25)');
        if (t === T.LAVA) drawLava(c, r, X, Y);
        if (t === T.BOULDER) { const b = E.boulders.find(q => q.c === c && q.r === r); ctx.drawImage(SP.boulderT.c, X + (b ? Math.round(Math.sin(time * 60)) : 0), Y); }
        continue;
      }
      if (t === T.CACHE) { ctx.drawImage(SP.cache.c, X, Y); if ((time * 2 + h % 7) % 3 < 0.25) rectW(X + 3 + (h % 4), Y + 3, 1, 1, '#ffffff'); continue; }
      if (t === T.LIFT) { drawLiftTile(c, r, X, Y, z); continue; }
      if (TD[t].draw) { TD[t].draw(c, r, X, Y, z); continue; }   // cases ajoutées par un module
      ctx.drawImage(TEX[t][v], X, Y);
      const o = world.ore[r * COLS + c];
      if (o) { const s = TEX.ore[o][(h >> 3) & 1]; ctx.drawImage(s.c, X - 1, Y - 1); if (ORES[o].gem && (time * 1.5 + (h % 11)) % 4 < 0.2) rectW(X + 2 + (h % 6), Y + 2 + ((h >> 4) % 6), 1, 1, '#ffffff'); }
      // edges where rock meets open air: lit top lip, dark underside
      const d = TD[t];
      if (!solidAt(c, r - 1)) { rectW(X, Y, TILE, 1, d.speck || '#ffffff'); if (r === 0 && (t === T.DIRT || t === T.CLAY)) drawGrass(X, Y, h); }
      if (!solidAt(c, r + 1)) rectW(X, Y + TILE - 1, TILE, 1, d.dark || '#000');
      if (!solidAt(c - 1, r)) rectW(X, Y, 1, TILE, d.dark || '#000');
      if (!solidAt(c + 1, r)) rectW(X + TILE - 1, Y, 1, TILE, d.dark || '#000');
      const dg = p && p.dig && p.dig.c === c && p.dig.r === r ? p.dig.prog : world.crack.get(r * COLS + c);
      if (dg) ctx.drawImage(SP.crack[clamp(Math.floor(dg * 3), 0, 2)].c, X, Y);
    }
  }
}
function drawGrass(X, Y, h) {
  rectW(X, Y - 1, TILE, 3, '#5fbf4a'); rectW(X, Y + 2, TILE, 1, '#3e8c3a');
  for (let i = 0; i < TILE; i += 2) if ((h >> i) & 1) rectW(X + i, Y - 2 - ((h >> (i + 3)) & 1), 1, 2, (h >> (i + 5)) & 1 ? '#a7e06a' : '#5fbf4a');
}
function drawLava(c, r, X, Y) {
  const top = tileAt(c, r - 1) !== T.LAVA;
  for (let j = top ? 2 : 0; j < TILE; j += 2) for (let i = 0; i < TILE; i += 2) {
    const w = Math.sin((X + i) * 0.35 + time * 2.2 + (Y + j) * 0.2) + Math.sin((X + i) * 0.13 - time * 1.4);
    rectW(X + i, Y + j, 2, 2, w > 1 ? '#ffb03a' : w > -0.2 ? '#d8461c' : '#9a2a14');
  }
  if (top) for (let i = 0; i < TILE; i++) { const k = Math.sin((X + i) * 0.5 + time * 3) > 0 ? 1 : 0; rectW(X + i, Y + 2 - k, 1, 1 + k, '#fff3b0'); rectW(X + i, Y + 3, 1, 1, '#ffb03a'); }
  if (top && Math.random() < 0.004) part(X + rand(1, 9), Y + 1, '#ffb03a', rand(-6, 6), rand(-40, -20), 0.6, 1, 60, true);
}
function drawLiftTile(c, r, X, Y, z) {
  ctx.drawImage(TEX[T.CONCRETE][0], X, Y);
  const on = !!(save.bossDown & (1 << (z - 1))), pulse = (Math.sin(time * 4 + c) + 1) / 2;
  rectW(X + 1, Y + 1, 8, 2, on ? (pulse > 0.5 ? '#9fe2ff' : '#4aa3df') : '#5b5d68');
  rectW(X + 4, Y + 4, 2, 4, '#5b5d68');
}
function drawSurface() {
  if (view.y0 > 20) return;
  // trees, bushes and flowers on untouched grass (never on the pad)
  for (let c = Math.max(1, Math.floor(view.x0 / TILE) - 1); c <= Math.min(COLS - 2, Math.floor(view.x1 / TILE) + 1); c++) {
    if (c >= 13 && c <= 25) continue;   // ni sur la plateforme, ni sur Mira
    const t = tileAt(c, 0); if (t !== T.DIRT && t !== T.CLAY) continue;
    const h = hash2(c, 99) % 10, X = c * TILE + 5;
    if (h < 2) drawSpr(SP.pine[0], X + (h ? 2 : -2), -1);
    else if (h < 4) drawSpr(SP.bush[0], X, 0);
    else if (h < 6) drawSpr(SP.flower[0], X - 3, -1);
  }
  drawSpr(SP.workshop[0], 154, 0);
  const g = SP.gear[0]; ctx.save(); ctx.translate(154, -20); ctx.rotate(Math.floor(time * 4) * Math.PI / 8); ctx.drawImage(g.c, -Math.round(g.w / 2), -Math.round(g.h / 2)); ctx.restore();
  drawSpr(SP.pump[0], 212, 0);
  drawSpr(SP.cart[0], 199, 0);
  if (Math.floor(time * 2) % 2) rectW(210, -12, 3, 1, '#fff3b0');   // pump screen blinks
}
function drawPlayer() {
  if (!p) return;
  const x = Math.round(p.x), y = Math.round(p.y), white = p.inv > 0 && !p.dead && Math.floor(time * 20) % 2 === 0;
  const sx = 1 + p.sq * 0.45, sy = 1 - p.sq * 0.6, bob = p.grounded && Math.abs(p.vx) > 10 ? Math.round(Math.sin(time * 22) * 0.6) : 0;
  const jit = p.dig ? Math.round(Math.sin(time * 70)) * 0.5 : 0;
  const fr = Math.floor(p.spin) % 3;
  ctx.save(); ctx.translate(x + jit, y); ctx.scale(sx, sy);
  if (p.drillDir === 'down' && p.drilling && !p.dead) { const ext = p.dig ? 3 + Math.round(Math.sin(time * 40)) : 1; ctx.drawImage(SP.drillD[fr].c, -4, -2 + ext); }
  else { const d = SP.drillS[p.dead ? 0 : fr], ext = p.dig ? 2 + Math.round(Math.sin(time * 40)) : p.drilling ? 1 : -1; ctx.save(); ctx.scale(p.face, 1); ctx.drawImage(d.c, 3 + ext, -9); ctx.restore(); }
  const tr = SP.treads[Math.floor(Math.abs(p.x) / 2) % 2];
  ctx.drawImage(white ? tr.wc : tr.c, -5, -3);
  let bi = 0;
  if (p.dead) bi = 3; else if (p.hurtT > 0) bi = 5; else if (p.happyT > 0) bi = 4; else if (p.blink < 0) bi = 3; else if (Math.abs(p.vx) > 6 || p.dig) bi = p.face > 0 ? 1 : 2;
  const b = SP.body[bi];
  ctx.drawImage(white ? b.wc : b.c, -5, -10 + bob);
  // antenna on a spring; it folds flat under a low ceiling
  const ay = -10 + bob, low = solidAt(Math.floor(p.x / TILE), Math.floor((p.y - 13) / TILE)) && !p.thrusting && p.grounded;
  const lampCol = p.dead && p.cause === 'fuel' ? '#5b5d68' : (p.fuel < st.fuel() * 0.2 && Math.floor(time * 4) % 2) ? '#e2483d' : '#fff3b0';
  if (low) { rectW(-1, ay - 1, 4, 1, '#5b5d68'); rectW(3, ay - 2, 2, 2, lampCol); }
  else { for (let k = 0; k < 3; k++) rectW(-1 + Math.round(p.ant * (k + 1) / 3), ay - 1 - k, 1, 1, '#5b5d68'); rectW(-1 + Math.round(p.ant) - (p.ant < 0 ? 1 : 0), ay - 5, 2, 2, lampCol); }
  if (p.thrusting && !p.dead) { const f = Math.floor(time * 30) % 2; rectW(-3, 0, 2, 2 + f, '#ffb03a'); rectW(1, 0, 2, 3 - f, '#ffb03a'); rectW(-2, 1, 1, 2 + f, '#fff3b0'); rectW(2, 1, 1, 2 - f, '#fff3b0'); }
  ctx.restore();
}
function drawEnemy(e) {
  const flying = e.type === 'bat' || e.type === 'moth', fr = Math.floor(e.t * (flying ? 8 : 5)) % 2, spr = SP[e.type][e.type === 'cinder' ? (e.grounded ? 0 : 1) : fr];
  const pop = easeOutBack(e.pop);
  drawSpr(spr, e.x, e.y + 1, { flip: e.type === 'grub' ? -e.face : e.face, sx: pop, sy: pop, white: e.flash > 0 });
}
function drawBoss() {
  const b = boss; if (!b) return;
  const white = b.flash > 0 && Math.floor(time * 30) % 2 === 0;
  let sx = 1, sy = 1, ox = 0;
  if (b.st === 'rear' || b.st === 'crouch') { ox = Math.round(Math.sin(time * 60)); sy = 0.9; sx = 1.08; }
  if (b.type === 'toad' && b.st === 'sit') { sy = 1 - Math.sin(clamp(b.t / 0.8, 0, 1) * Math.PI) * 0.12; sx = 2 - sy; }
  if (b.st === 'intro') { sy = sx = Math.max(0.05, easeOutBack(clamp(b.t / 0.8, 0, 1))); }
  if (b.dying) ox = Math.round(Math.sin(time * 80) * 2);
  if (b.type === 'prism') {
    if (b.vuln) drawGlow(SP.glow.c, b.x, b.y - 7, 0.6 + Math.sin(time * 10) * 0.2);
    drawSpr(SP.prism[0], b.x + ox, b.y + Math.round(Math.sin(time * 3)), { white, sx, sy });
    for (let k = 0; k < 4; k++) { const a = b.ang + k / 4 * TAU; if (b.orbit > 1) drawSpr(SP.shard[0], b.x + Math.cos(a) * b.orbit, b.y - 3 + Math.sin(a) * b.orbit); }
  } else {
    const spr = SP[b.type][b.type === 'grubmother' ? Math.floor(time * (b.st === 'charge' ? 14 : 5)) % 2 : 0];
    drawSpr(spr, b.x + ox, b.y + 1, { flip: b.type === 'grubmother' ? b.face : 1, sx, sy, white });
    if (b.type === 'toad' && b.vuln) drawGlow(SP.glow.o, b.x, b.y - 4, 0.5 + Math.sin(time * 8) * 0.2);
  }
  if (b.vuln && !b.dying) for (let k = 0; k < 3; k++) { const a = time * 5 + k / 3 * TAU; rectW(Math.round(b.x + Math.cos(a) * 7), Math.round(b.y - b.h - 4 + Math.sin(a) * 2), 1, 1, '#fff3b0'); }   // dizzy stars
}
function drawEntities() {
  for (const f of E.falling) ctx.drawImage(SP.boulderT.c, Math.round(f.x - 5), Math.round(f.y));
  for (const k of E.pickups) { const s = SP.icon.coin, w = Math.max(1, Math.round(Math.abs(Math.cos(time * 6 + k.x)) * s.w)); ctx.drawImage(s.c, Math.round(k.x - w / 2), Math.round(k.y - s.h), w, s.h); }
  for (const b of E.bombs) drawSpr(SP.icon.bomb, b.x, b.y, { white: b.t < 0.5 && Math.floor(time * 16) % 2 === 0 });
  for (const e of E.enemies) drawEnemy(e);
  drawBoss();
  drawPlayer();
  for (const s of E.shots) if (!(s.delay > 0)) { const spr = SP[s.kind][0]; drawSpr(spr, s.x, s.y + spr.h / 2); }
  for (const f of E.flyOres) drawSpr(SP.icon['ore' + f.id], f.x, f.y + 3);
  for (const q of E.parts) if (!q.light) { ctx.globalAlpha = clamp(q.life / q.max * 2, 0, 1); rectW(Math.round(q.x), Math.round(q.y), q.size, q.size, q.c); }
  ctx.globalAlpha = 1;
}
// ---------- darkness: a 2px-cell light map with ordered dithering ----------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => v / 16);
let darkC = null, darkX = null, darkImg = null, lightBuf = null;
function darkness(y) { if (y < 10) return 0; const z = zoneOf(Math.floor(y / TILE)); return clamp((y - 10) / 160, 0, 1) * [0.96, 0.97, 0.9, 0.93][z]; }
function drawDarkness() {
  const { x0, x1, y0, y1 } = view;
  if (darkness(y1) < 0.02) return;
  const ox = Math.floor(x0 / 2) * 2, oy = Math.floor(y0 / 2) * 2, bw = Math.ceil((x1 - ox) / 2) + 1, bh = Math.ceil((y1 - oy) / 2) + 1;
  if (!darkC || darkC.width !== bw || darkC.height !== bh) { darkC = document.createElement('canvas'); darkC.width = bw; darkC.height = bh; darkX = darkC.getContext('2d'); darkImg = darkX.createImageData(bw, bh); lightBuf = new Float32Array(bw * bh); }
  lightBuf.fill(0);
  const stamp = (x, y, R, I) => {
    const cx = (x - ox) / 2, cy = (y - oy) / 2, rr = R / 2;
    const i0 = Math.max(0, Math.floor(cx - rr)), i1 = Math.min(bw - 1, Math.ceil(cx + rr)), j0 = Math.max(0, Math.floor(cy - rr)), j1 = Math.min(bh - 1, Math.ceil(cy + rr));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dd = ((i - cx) * (i - cx) + (j - cy) * (j - cy)) / (rr * rr); if (dd >= 1) continue;
      const l = I * (1 - dd), k = j * bw + i; lightBuf[k] = 1 - (1 - lightBuf[k]) * (1 - l);
    }
  };
  if (p) { const R = p.dead && p.cause === 'fuel' ? 14 : st.light() * (0.97 + Math.sin(time * 9) * 0.015); stamp(p.x + p.face * 3, p.y - 7, R, 1); stamp(p.x, p.y - 4, 16, 0.6); }
  const c0 = Math.floor(x0 / TILE), c1 = Math.floor(x1 / TILE), r0 = Math.max(0, Math.floor(y0 / TILE)), r1 = Math.min(ROWS - 1, Math.floor(y1 / TILE));
  for (let r = r0 - 2; r <= r1 + 2; r++) for (let c = c0 - 2; c <= c1 + 2; c++) {
    if (c < 0 || c >= COLS || r < 0 || r >= ROWS) continue;
    const t = world.t[r * COLS + c], h = hash2(c, r);
    if (t === T.LAVA) { if (tileAt(c, r - 1) !== T.LAVA) stamp(c * TILE + 5, r * TILE + 3, 26 + Math.sin(time * 3 + c) * 2, 0.75); }
    else if (t === T.LIFT && (save.bossDown & (1 << (zoneOf(r) - 1)))) stamp(c * TILE + 5, r * TILE, 18, 0.6);
    else if (t === T.CACHE) stamp(c * TILE + 5, r * TILE + 5, 12, 0.35 + Math.sin(time * 2) * 0.1);
    else if (TD[t].glow) { const g = TD[t].glow(c, r); if (g) stamp(g[0], g[1], g[2], g[3]); }
    else if (t === T.CRYST && h % 9 === 0) stamp(c * TILE + 5, r * TILE + 5, 10, 0.22);
    else { const o = world.ore[r * COLS + c]; if (o && ORES[o].gem) stamp(c * TILE + 5, r * TILE + 5, 8, 0.28); }
  }
  for (const l of E.lights) stamp(l.x, l.y, l.r * (l.flat ? 1 : 0.4 + 0.6 * l.t / l.max), l.i || 1);
  if (hooks.light) for (const f of hooks.light) f(stamp);
  for (const s of E.shots) if (s.kind !== 'rock') stamp(s.x, s.y, 12, 0.7);
  for (const b of E.bombs) stamp(b.x, b.y - 6, 12, 0.6);
  for (const e of E.enemies) if (e.type === 'cinder' || e.type === 'moth') stamp(e.x, e.y - 3, 12, 0.5);
  if (boss) { const A = arena(boss.z); stamp((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2, 190, 0.5); stamp(boss.x, boss.y - boss.h / 2, boss.type === 'prism' ? 40 : 26, 0.55); }
  const d = darkImg.data;
  for (let j = 0; j < bh; j++) {
    const a0 = darkness(oy + j * 2);
    for (let i = 0; i < bw; i++) {
      const k = j * bw + i, a = a0 * (1 - lightBuf[k]);
      const q = clamp(Math.floor(a * 5 + BAYER[(j & 3) * 4 + (i & 3)]), 0, 5) / 5;
      d[k * 4] = 9; d[k * 4 + 1] = 7; d[k * 4 + 2] = 14; d[k * 4 + 3] = q * 255;
    }
  }
  darkX.putImageData(darkImg, 0, 0);
  ctx.drawImage(darkC, ox, oy, bw * 2, bh * 2);
}
function drawLitFx() {
  // things that glow on top of the darkness
  for (const q of E.parts) if (q.light) { ctx.globalAlpha = clamp(q.life / q.max * 2, 0, 1); rectW(Math.round(q.x), Math.round(q.y), q.size, q.size, q.c); }
  ctx.globalAlpha = 1;
  if (p && !p.dead && p.y > 10) drawGlow(SP.glow.y, p.x - 1 + Math.round(p.ant), p.y - 15, 0.45);
  for (const s of E.shots) if (s.kind === 'fireball' && !(s.delay > 0)) drawGlow(SP.glow.o, s.x, s.y, 0.6);
  for (const s of E.shots) if (s.kind === 'spark') drawGlow(SP.glow.c, s.x, s.y, 0.5);
}
function renderWorld() {
  drawSky();
  drawTiles();
  drawSurface();
  drawEntities();
  emit('drawWorld');
  drawDarkness();
  drawLitFx();
  emit('drawWorldTop');
}

// ============================================================
//  Rendering: UI (screen space, 1 unit = S screen px)
// ============================================================
const ui = { buttons: [], hover: null, down: null, mx: -1, my: -1 };
function uiT() { ctx.setTransform(dpr * S, 0, 0, dpr * S, 0, 0); ctx.imageSmoothingEnabled = false; }
function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); }
// ---------- translation & pixel font ----------
const LANGS = ['en', 'fr', 'es', 'pt'];
let lang = 'en';
function L(str, vars) {   // translate a UI string (English key) and fill {placeholders}
  // un texte des modules ou des fichiers JSON peut être un objet par langue : { fr, en, es, pt }
  if (str && typeof str === 'object') str = str[lang] ?? str.en ?? str.fr ?? '';
  let s = String(str ?? '');
  const tr = lang !== 'en' && window.COG_LANG && window.COG_LANG[lang];
  if (tr && Object.prototype.hasOwnProperty.call(tr, s)) s = tr[s];
  s = s.replace(/[¡¿]/g, '');   // la police pixel n'a pas ces signes espagnols
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m));
  return s;
}
function detectLang() {
  const cands = [];
  // CrazyGames impose la langue donnée par son SDK (systemInfo), sinon l'anglais
  let cgLocale = null;
  try { if (SDK.cg && SDK.cg.user && SDK.cg.user.systemInfo) cgLocale = SDK.cg.user.systemInfo.locale; } catch (e) {}
  if (cgLocale) cands.push(cgLocale);
  else try { cands.push(...(navigator.languages || []), navigator.language); } catch (e) {}
  for (const c of cands) { const k = String(c || '').slice(0, 2).toLowerCase(); if (LANGS.includes(k)) return k; }
  return 'en';
}
const ACCENTS = { acute: ['00010', '00100'], grave: ['01000', '00100'], circ: ['00100', '01010'], uml: ['00000', '01010'], tilde: ['01101', '10010'] };
const COMPOSE = {
  'À': ['A', 'grave'], 'Â': ['A', 'circ'], 'Ä': ['A', 'uml'], 'Á': ['A', 'acute'], 'Ã': ['A', 'tilde'],
  'É': ['E', 'acute'], 'È': ['E', 'grave'], 'Ê': ['E', 'circ'], 'Ë': ['E', 'uml'],
  'Î': ['I', 'circ'], 'Ï': ['I', 'uml'], 'Í': ['I', 'acute'],
  'Ô': ['O', 'circ'], 'Ö': ['O', 'uml'], 'Ó': ['O', 'acute'], 'Õ': ['O', 'tilde'],
  'Ù': ['U', 'grave'], 'Û': ['U', 'circ'], 'Ü': ['U', 'uml'], 'Ú': ['U', 'acute'],
  'Ñ': ['N', 'tilde'], 'Ç': ['C', 'cedil'],
};
const FONT_CHARS = Object.keys(ART.FONT_SRC).concat(Object.keys(COMPOSE));
const FONT_INDEX = {}; FONT_CHARS.forEach((ch, i) => (FONT_INDEX[ch] = i));
const fontAtlases = new Map();
function fontAtlas(color) {
  let a = fontAtlases.get(color); if (a) return a;
  a = document.createElement('canvas'); a.width = FONT_CHARS.length * 6; a.height = 10;
  const x = a.getContext('2d'); x.fillStyle = color;
  const plot = (i, rows, y0) => rows.forEach((row, j) => { for (let k = 0; k < 5; k++) if (row[k] === '1') x.fillRect(i * 6 + k, y0 + j, 1, 1); });
  FONT_CHARS.forEach((ch, i) => {
    const comp = COMPOSE[ch];
    plot(i, ART.FONT_SRC[comp ? comp[0] : ch].split(' '), 2);
    if (comp && comp[1] === 'cedil') plot(i, ['00110'], 9);
    else if (comp) plot(i, ACCENTS[comp[1]], 0);
  });
  fontAtlases.set(color, a); return a;
}
function textW(str, sc = 1) { return (L(str).toUpperCase().length * 6 - 1) * sc; }
function text(str, x, y, sc = 1, color = '#fff3d6', align = 'left', shadow = OUTLINE) {
  str = L(str).toUpperCase(); const w = (str.length * 6 - 1) * sc;
  let ox = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x; ox = Math.round(ox); y = Math.round(y);
  const draw = (atlas, dx, dy) => {
    for (let i = 0; i < str.length; i++) { const gi = FONT_INDEX[str[i]] ?? FONT_INDEX['?']; ctx.drawImage(atlas, gi * 6, 0, 5, 10, dx + i * 6 * sc, dy - 2 * sc, 5 * sc, 10 * sc); }
  };
  if (shadow) draw(fontAtlas(shadow), ox, y + sc);
  draw(fontAtlas(color), ox, y);
  return w;
}
function textOutline(str, x, y, sc, color, outline = OUTLINE, align = 'center') {
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [0, 2], [-1, 1], [1, 1]]) text(str, x + dx * sc, y + dy * sc, sc, outline, align, null);
  text(str, x, y, sc, color, align, null);
}
function wrap(str, maxW, sc = 1) {
  const words = L(str).toUpperCase().split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (textW(t, sc) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
function fitText(str, maxW, sc = 1) {   // translated, upper-cased, and shortened with a trailing '.' if it does not fit
  let s = L(str).toUpperCase();
  if (textW(s, sc) <= maxW) return s;
  while (s.length > 2 && textW(s + '.', sc) > maxW) s = s.slice(0, -1);
  return s.trimEnd() + '.';
}
function icon(name, x, y, sc = 1) { const s = SP.icon[name]; if (!s) return; ctx.drawImage(s.c, Math.round(x - s.w * sc / 2), Math.round(y - s.h * sc / 2), s.w * sc, s.h * sc); }
const STYLES = {
  wood:   { fill: '#8a5a3b', hi: '#b07a52', lo: '#5e3b28', text: '#fff3d6' },
  green:  { fill: '#4f9e3e', hi: '#7fd05f', lo: '#2f6b2a', text: '#fff3d6' },
  gold:   { fill: '#e0b33a', hi: '#ffe48a', lo: '#9c7420', text: '#3b2a1e' },
  ad:     { fill: '#7a4fc0', hi: '#a27be0', lo: '#4e2f86', text: '#fff3d6' },   // rewarded ads: never green, always with the video icon
  dark:   { fill: '#2b2838', hi: '#3d3950', lo: '#1f1d2a', text: '#fff3d6' },
  steel:  { fill: '#4a5262', hi: '#66708a', lo: '#30353f', text: '#fff3d6' },
  grey:   { fill: '#6b6875', hi: '#85828f', lo: '#4a4853', text: '#c9c6d1' },
};
function panel(x, y, w, h, st = STYLES.dark) {
  x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
  rect(x + 1, y, w - 2, h, OUTLINE); rect(x, y + 1, w, h - 2, OUTLINE);
  rect(x + 1, y + 1, w - 2, h - 2, st.fill);
  rect(x + 1, y + 1, w - 2, 1, st.hi); rect(x + 1, y + h - 2, w - 2, 1, st.lo);
}
function button(id, x, y, w, h, label, onClick, st = STYLES.wood, opt = {}) {
  x = Math.round(x); y = Math.round(y);
  const hov = ui.hover === id, down = ui.down === id && hov;
  ui.buttons.push({ id, x, y, w, h, onClick, disabled: opt.disabled });
  const s = opt.disabled ? STYLES.grey : st;
  const lift = down ? 1 : 0;
  rect(x + 1, y + h - 1, w - 2, 2, 'rgba(0,0,0,.35)');  // drop shadow
  panel(x, y + lift, w, h - (down ? 1 : 0), hov && !opt.disabled ? { ...s, fill: s.hi, hi: '#ffffff' } : s);
  const shadow = st === STYLES.gold ? null : OUTLINE, sc = opt.sc || 1;
  if (opt.icon) {
    const lab = fitText(label, w - 18, sc), tw = textW(lab, sc), total = tw + 10, ox = x + w / 2 - total / 2;
    icon(opt.icon, ox + 3, y + h / 2 + lift, 1); if (lab) text(lab, ox + 10, y + (h - 7 * sc) / 2 + lift, sc, s.text, 'left', shadow);
  } else text(fitText(label, w - 6, sc), x + w / 2, y + (h - 7 * sc) / 2 + lift, sc, s.text, 'center', shadow);
  if (opt.sub) text(fitText(opt.sub, Math.max(w, 120)), x + w / 2, y + h + 3, 1, '#c9b78f', 'center');
}
function hitButton(ux, uy) { for (let i = ui.buttons.length - 1; i >= 0; i--) { const b = ui.buttons[i]; if (ux >= b.x && ux < b.x + b.w && uy >= b.y && uy < b.y + b.h) return b; } return null; }
function dim(a = 0.6) { rect(0, 0, UW + 1, UH + 1, `rgba(12,10,20,${a})`); }
function coinLabel(x, y, n, align = 'right', sc = 1, col = '#f6d743') {
  const s = fmt(n), w = textW(s, sc) + 8;
  const ox = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x;
  icon('coin', ox + 2, y + 3.5 * sc, 1); text(s, ox + 8, y, sc, col, 'left');
}
function bar(x, y, w, h, f, col, bg = '#1f1d2a') { rect(x, y, w, h, OUTLINE); rect(x + 1, y + 1, w - 2, h - 2, bg); rect(x + 1, y + 1, Math.round((w - 2) * clamp(f, 0, 1)), h - 2, col); if (f > 0.02) rect(x + 1, y + 1, Math.round((w - 2) * clamp(f, 0, 1)), 1, 'rgba(255,255,255,0.35)'); }
const appear = (i = 0, d = 0.06) => easeOutBack(clamp((screenT - i * d) / 0.3, 0, 1));
const isTouch = () => lastPointer ? lastPointer === 'touch' : (window.matchMedia && matchMedia('(pointer: coarse)').matches);
let lastPointer = null;

function drawHud() {
  const fMax = st.fuel(), hMax = st.hull(), ff = p.fuel / fMax, hf = p.hull / hMax, low = ff < 0.2 && Math.floor(time * 4) % 2;
  panel(3, 3, 66, 31, STYLES.dark);
  icon('fuel', 10, 9.5); bar(16, 7, 49, 6, ff, low ? '#e2483d' : '#ffb03a');
  icon('hull', 10, 18.5); bar(16, 16, 49, 6, hf, hf < 0.3 ? '#e2483d' : '#4aa3df');
  const cc = cargoCount(), cap = st.cargo();
  icon('cargo', 10, 27.5); text(cc >= cap ? 'FULL' : `${cc}/${cap}`, 16, 24, 1, cc >= cap ? '#ff6b6b' : '#fff3d6');
  const cv = cargoValue(); if (cv) coinLabel(66, 24, cv, 'right', 1, '#c9b78f');
  button('pause', UW - 16, 3, 13, 13, '', () => pause(), STYLES.dark); icon('pause', UW - 9.5, 9.5);
  coinLabel(UW - 19, 5, save.cash);
  const depth = Math.max(0, Math.floor(p.y / TILE)) * 2;
  icon('depth', UW - 23 - textW(depth + 'M'), 21); text(depth + 'M', UW - 19, 18, 1, '#c9d8f0', 'right');
  // guardian health
  if (boss && boss.st !== 'intro') {
    const w = Math.min(150, UW - 24), x = UW / 2 - w / 2, y = UH < 220 ? 37 : 40;
    text(ZONES[boss.z].bossName, UW / 2, y, 1, boss.vuln ? '#fff3b0' : '#ff9a8a', 'center');
    bar(x, y + 9, w, 6, boss.hp / boss.max, boss.vuln ? '#f6d743' : '#e2483d');
  }
  // barre rapide (touches 1 à 5) : dessinée par modules/sac.js, qui renvoie son bord gauche
  const ix = MOD.sac ? MOD.sac.drawHotbar() : UW - 3;
  emit('hud');
  // context action
  const onPad = p.atBase && p.y <= 0.5 && Math.abs(p.x - BASE_X) < 45, cy = UW / 2 + 36 > ix - 2 ? UH - 42 : UH - 22;
  // action proposée par un module (balise, personnage...), sinon la base ou l'ascenseur
  let act = null; if (!p.dead && hooks.ctx) for (const f of hooks.ctx) { act = f(); if (act) break; }
  if (act) { const bw = Math.min(UW - 8, Math.max(60, textW(act.label) + 26)); button('ctx', UW / 2 - bw / 2, cy, bw, 16, act.label, interact, STYLES.gold, { icon: act.icon }); }
  else if (onPad && !p.dead) button('ctx', UW / 2 - 30, cy, 60, 16, 'BASE', interact, STYLES.gold, { icon: 'gear' });
  else if (p.onLift > 0 && !p.dead) button('ctx', UW / 2 - 34, cy, 68, 16, 'LIFT UP', interact, STYLES.gold, { icon: 'lift' });
  if (!isTouch() && (act || onPad || p.onLift > 0) && !p.dead) text(keyName(BINDS.interact[0]), UW / 2, cy - 9, 1, '#c9b78f', 'center');
}
function drawTutorial() {
  if (!tut || state !== 'play' || !p || p.dead) return;
  const touch = isTouch();
  // lettres réelles du clavier quand le navigateur donne la disposition (ZQSD en AZERTY)
  const fleches = layoutMap ? L('ARROWS OR WASD').replace(/WASD|ZQSD/, moveLetters()) : 'ARROWS OR WASD';
  const lines = [
    [touch ? 'DRAG DOWN TO DIG' : 'HOLD DOWN TO DIG', touch ? 'DRAG ANYWHERE ON THE SCREEN' : fleches],
    [touch ? 'DRAG LEFT OR RIGHT' : 'PUSH LEFT OR RIGHT', 'INTO A WALL TO DIG SIDEWAYS'],
    ['GRAB SHINY ORE!', 'WATCH YOUR FUEL GAUGE'],
    [touch ? 'DRAG UP TO FLY' : 'HOLD UP TO FLY', 'GO BACK TO BASE AND SELL'],
  ][Math.min(tut.step, 3)];
  const w = Math.min(UW - 12, Math.max(...lines.map(l => textW(l))) + 16), y = Math.min(UH * 0.7, UH - 58), bob = Math.round(Math.sin(time * 3));
  panel(UW / 2 - w / 2, y + bob, w, 25, STYLES.dark);
  text(fitText(lines[0], w - 8), UW / 2, y + bob + 5, 1, '#f6d743', 'center');
  text(fitText(lines[1], w - 8), UW / 2, y + bob + 14, 1, '#fff3d6', 'center');
}
function drawBanners(dt) {
  for (const b of banners) {
    b.t += dt;
    const a = b.t < 0.3 ? easeOutBack(b.t / 0.3) : b.t > 2.6 ? 1 - (b.t - 2.6) / 0.4 : 1;
    if (a <= 0) continue;
    const y = UH * 0.26, sc = textW(b.text, 2) > UW - 16 ? 1 : 2;
    ctx.globalAlpha = clamp(a, 0, 1);
    textOutline(fitText(b.text, UW - 10, sc), UW / 2, y - (1 - a) * 8, sc, b.color);
    if (b.sub) text(fitText(b.sub, UW - 10), UW / 2, y + 7 * sc + 6, 1, '#fff3d6', 'center');
    ctx.globalAlpha = 1;
  }
  if (banners.length && banners[0].t > 3) banners.length = 0;
  if (toastMsg) {
    toastMsg.t += dt;
    const t = toastMsg.t, a = t > 2 ? 1 - (t - 2) / 0.3 : 1;
    if (a <= 0) toastMsg = null;
    else {
      const s = fitText(toastMsg.text, UW - 20), w = textW(s) + 12, y = state === 'play' ? (boss ? 60 : 40) : UH - 30;
      ctx.globalAlpha = clamp(a, 0, 1); panel(UW / 2 - w / 2, y, w, 13, STYLES.dark); text(s, UW / 2, y + 3, 1, '#fff3d6', 'center'); ctx.globalAlpha = 1;
    }
  }
}
function drawMuteButton() {
  const top = ['menu', 'shop', 'relics', 'base', 'pause', 'win'].includes(state), y = top ? 3 : UH - 16;
  button('mute', 3, y, 13, 13, '', toggleMute, STYLES.dark); icon(silent() ? 'mute' : 'speaker', 9.5, y + 6.5);
  if (state === 'menu' || state === 'pause') button('lang', 18, y, 17, 13, lang.toUpperCase(), cycleLang, STYLES.dark);
}
function drawQuests(cx, y, w) {
  text('CONTRACTS', cx, y, 1, '#f6d743', 'center');
  save.quests.forEach((q, i) => {
    const inf = questInfo(q), yy = y + 10 + i * 15;
    text(fitText(inf.text, w - 40), cx - w / 2, yy, 1, '#fff3d6');
    coinLabel(cx + w / 2, yy, inf.reward, 'right', 1);
    bar(cx - w / 2, yy + 8, w, 4, Math.min(q.prog, inf.goal) / inf.goal, '#7fd05f');
  });
  return 10 + save.quests.length * 15;
}
function drawMenu() {
  const a = appear(0), ts = UW > 300 ? 5 : UW > 220 ? 4 : 3;
  let y = Math.max(8, UH * 0.07);
  textOutline('COGMOLE', UW / 2, y - (1 - a) * 20, ts, '#f6d743');
  y += 7 * ts + 8;
  for (const l of wrap('DIG DEEP. SELL ORE. FACE THE GUARDIANS.', UW - 20)) { text(l, UW / 2, y, 1, '#fff3d6', 'center'); y += 9; }
  if (save.stars) { const s = L('EXPEDITION {n}', { n: save.stars + 1 }); icon('star', UW / 2 - textW(s) / 2 - 6, y + 3); text(s, UW / 2 + 4, y, 1, '#f6d743', 'center'); y += 10; }
  y += 4;
  if (pendingGift && save.tutorialDone) {
    const w = Math.min(UW - 16, 150), x = UW / 2 - w / 2, ad = rewardedOK();
    panel(x, y, w, 36, STYLES.dark); icon('gift', x + 9, y + 9);
    text('DAILY GIFT', x + 17, y + 4, 1, '#f6d743'); coinLabel(x + w - 5, y + 4, pendingGift.amount);
    const bw = ad ? (w - 15) / 2 : w - 10;
    button('claim', x + 5, y + 16, bw, 15, 'CLAIM', () => claimGift(false), STYLES.wood);
    if (ad) button('claim2', x + 10 + bw, y + 16, bw, 15, 'X2', () => claimGift(true), STYLES.ad, { icon: 'film' });
    y += 42;
  }
  const by = Math.max(y + 4, Math.min(UH * 0.5, UH - 110));
  const s = appear(2);
  button('play', UW / 2 - 40 * s, by, 80 * s, 20, s > 0.9 ? 'PLAY' : '', play, STYLES.green, { sc: 1 });
  button('relics', UW / 2 - 48, by + 25, 96, 15, L('RELICS {n}/{m}', { n: save.relics.length, m: RELIC_IDS.length }), openRelics, STYLES.wood);
  let qy = buttonRow(extraButtons('menu'), by + 44) + 4;   // sauvegardes, succès, options
  if (save.bestDepth) { text(L('BEST DEPTH {n}M', { n: save.bestDepth }), UW / 2, qy, 1, '#c9d8f0', 'center'); qy += 12; }
  if (UH - qy > 55) { const w = Math.min(UW - 16, 170); panel(UW / 2 - w / 2 - 4, qy - 3, w + 8, 60, STYLES.dark); drawQuests(UW / 2, qy + 1, w); }
}
function drawBase() {
  dim(0.45);
  const B = baseInfo, w = Math.min(UW - 10, 210), x = UW / 2 - w / 2, a = appear(0);
  const extra = extraButtons('base'), compact = UH < 230;
  const lines = Math.max(1, B.sold.length), cols = lines > 3 && w > 180 ? 2 : 1, rows = Math.min(Math.ceil(lines / cols), UH < 170 && extra.length ? 2 : UH < 200 ? 3 : 9);
  const h = 60 + rows * 10 + (B.depth ? 10 : 0);
  const canX2 = !B.x2 && B.total >= 30 && rewardedOK();
  const oneRow = UW >= 250, bw = oneRow ? Math.min(78, (UW - 16) / 3) : Math.min(100, (w - 6) / 2);
  const btnH = canX2 && !oneRow ? 44 : 24, total = h + 4 + btnH + rowHeight(extra, 15, compact);
  let y = Math.max(3, (UH - total) / 2 - 4);
  const y0 = y;
  panel(x, y + (1 - a) * 10, w, h, STYLES.dark);
  textOutline('BASE', UW / 2, y + 5, 2, '#f6d743');
  coinLabel(x + w - 5, y + 6, save.cash);
  y += 24;
  if (!B.sold.length) text('NOTHING TO SELL', UW / 2, y, 1, '#8f8aa3', 'center');
  B.sold.slice(0, rows * cols).forEach(([id, n, v], i) => {
    const col = i % cols, row = Math.floor(i / cols), cw = (w - 10) / cols, xx = x + 5 + col * cw, yy = y + row * 10;
    icon('ore' + id, xx + 4, yy + 3); text(fitText(`${L(ORES[id].name)} X${n}`, cw - 40), xx + 10, yy, 1, ORES[id].hi);
    text('+' + fmt(v), xx + cw - 4, yy, 1, '#f6d743', 'right');
  });
  y += rows * 10 + 2;
  rect(x + 5, y, w - 10, 1, '#3d3950'); y += 4;
  text('SOLD', x + 6, y, 1, '#fff3d6'); text('+' + fmt(B.total) + (B.x2 ? ' X2' : ''), x + w - 6, y, 1, '#f6d743', 'right'); y += 10;
  text(fitText(B.freeFuel ? 'FREE EMERGENCY FUEL' : 'REFUEL', w - 40), x + 6, y, 1, B.freeFuel ? '#7fd05f' : '#c9c6d1');
  if (B.fPay) text('-' + B.fPay, x + w - 6, y, 1, '#ff9a8a', 'right');
  y += 10;
  text(fitText(B.freeHull ? 'FREE REPAIRS' : 'REPAIRS', w - 40), x + 6, y, 1, B.freeHull ? '#7fd05f' : '#c9c6d1');
  if (B.hPay) text('-' + B.hPay, x + w - 6, y, 1, '#ff9a8a', 'right');
  y += 11;
  if (B.depth) text(L('DIVE DEPTH {n}M', { n: B.depth }), UW / 2, y, 1, '#c9d8f0', 'center');
  y = y0 + h + 4;
  if (oneRow) {
    const x2w = canX2 ? Math.max(bw, textW(L('X2 SALE +{n}', { n: fmt(B.total) })) + 24) : 0, n = canX2 ? 3 : 2, tw = 2 * bw + x2w + (n - 1) * 4; let bx = Math.max(2, UW / 2 - tw / 2);
    button('dig', bx, y, bw, 20, 'DIG!', backToDig, STYLES.green); bx += bw + 4;
    button('shop', bx, y, bw, 20, 'WORKSHOP', openShop, STYLES.wood, { icon: 'gear' }); bx += bw + 4;
    if (canX2) { const lab = L('X2 SALE +{n}', { n: fmt(B.total) }); button('x2', bx, y, Math.min(UW - 4 - bx, Math.max(bw, textW(lab) + 24)), 20, lab, x2Sale, STYLES.ad, { icon: 'film' }); }
  } else {
    button('dig', UW / 2 - bw - 2, y, bw, 20, 'DIG!', backToDig, STYLES.green);
    button('shop', UW / 2 + 2, y, bw, 20, 'WORKSHOP', openShop, STYLES.wood, { icon: 'gear' });
    if (canX2) button('x2', UW / 2 - bw / 2 - 10, y + 24, bw + 20, 18, L('X2 SALE +{n}', { n: fmt(B.total) }), x2Sale, STYLES.ad, { icon: 'film' });
  }
  buttonRow(extra, y + btnH, 15, compact);   // sac, carte, journal, Mira...
}
let shopPage = 0;
function drawShop() {
  dim(0.75);
  const cw = Math.min(92, Math.floor((UW - 6) / Math.max(1, Math.min(6, Math.floor((UW - 6) / 76))))), cols = clamp(Math.floor((UW - 6) / cw), 1, 6), ch = 31, ox = UW / 2 - cols * cw / 2;
  const compact = cw < 92;
  // the extra row (lifts, free coins, relics, new expedition, back) flows over as many lines as needed
  const row = [];
  for (let z = 1; z < 4; z++) if (save.bossDown & (1 << (z - 1))) row.push({ id: 'lift' + z, label: L('LIFT {n}', { n: z + 1 }), fn: () => liftTo(z), st: STYLES.steel, icon: 'lift', w: 50 });
  if (rewardedOK()) { const wait = freeCoinsAt - Date.now(); row.push({ id: 'free', label: wait > 0 ? `${Math.floor(wait / 60000)}:${String(Math.floor(wait / 1000) % 60).padStart(2, '0')}` : '+' + fmt(freeCoinAmount()), fn: freeCoins, st: STYLES.ad, icon: 'film', w: 54, disabled: wait > 0 }); }
  row.push({ id: 'relics', label: L('RELICS {n}/{m}', { n: save.relics.length, m: RELIC_IDS.length }), fn: openRelics, st: STYLES.wood, w: 84 });
  for (const b of extraButtons('shop')) row.push({ ...b, st: b.st || STYLES.wood, w: b.w || Math.max(44, textW(b.label) + (b.icon ? 24 : 12)) });
  if (save.bossDown === 15) row.push({ id: 'newexp', label: confirmNew > time ? 'SURE?' : 'NEW EXPEDITION', fn: () => { if (confirmNew > time) newExpedition(); else confirmNew = time + 3; }, st: STYLES.gold, icon: 'star', w: 92 });
  row.push({ id: 'back', label: 'BACK', fn: closeSub, st: STYLES.wood, w: 46 });
  let lineW = 0, line = []; const lines = [];
  for (const b of row) { if (lineW + b.w + 4 > UW - 6 && line.length) { lines.push(line); line = []; lineW = 0; } line.push(b); lineW += b.w + 4; }
  lines.push(line);
  const nShop = MOD.sac.shopIds().length, shopRows = Math.ceil(nShop / Math.min(nShop, Math.max(1, Math.floor((UW - 8) / 38))));
  const upH = Math.ceil(UP_IDS.length / cols) * (ch + 3), itH = 11 + 33 * shopRows, exH = lines.length * 20;
  const paged = 30 + upH + itH + exH > UH - 2;
  if (!paged) shopPage = 0;
  let y = 4;
  textOutline('WORKSHOP', UW / 2, y + 2, paged && UW < 200 ? 1 : 2, '#f6d743'); coinLabel(UW - 5, y + (paged ? 2 : 20), save.cash); y += paged ? 14 : 30;
  if (paged) {
    const tw = Math.min(80, (UW - 12) / 2);
    button('tab0', UW / 2 - tw - 2, y, tw, 14, 'UPGRADES', () => { shopPage = 0; }, shopPage === 0 ? STYLES.gold : STYLES.dark);
    button('tab1', UW / 2 + 2, y, tw, 14, 'ITEMS', () => { shopPage = 1; }, shopPage === 1 ? STYLES.gold : STYLES.dark);
    y += 20;
  }
  if (shopPage === 0) {
    UP_IDS.forEach((id, i) => {
      const U = UPGRADES[id], lvl = save.up[id], cx = ox + (i % cols) * cw + 1, cy = y + Math.floor(i / cols) * (ch + 3), maxed = lvl >= UP_MAX, cost = maxed ? 0 : upCost(id);
      panel(cx, cy, cw - 2, ch, STYLES.steel); icon(U.icon, cx + 8, cy + 8);
      text(fitText(U.name, cw - 20), cx + 15, cy + 4, 1, '#fff3d6');
      for (let k = 0; k < UP_MAX; k++) rect(cx + 15 + k * 5, cy + 13, 4, 3, k < lvl ? '#f6d743' : '#30353f');
      if (!maxed) text(compact ? '>' + U.show(U.stat(lvl + 1)) : U.show(U.stat(lvl)) + '>' + U.show(U.stat(lvl + 1)), cx + 47, cy + 12, 1, '#c9d8f0');
      if (!maxed) button('up_' + id, cx + 3, cy + 19, cw - 8, 10, fmt(cost), () => buyUp(id), save.cash >= cost ? STYLES.gold : STYLES.grey, { icon: 'coin' });
      else text('MAX', cx + cw / 2, cy + 20, 1, '#f6d743', 'center');
    });
    y += upH + 3;
  }
  if (!paged || shopPage === 1) {
    // objets en vente : ceux d'objets.json qui ont un prix (sur 2 lignes si l'écran est étroit)
    const ids = MOD.sac.shopIds(), per = Math.min(ids.length, Math.max(1, Math.floor((UW - 8) / 38))), iw = Math.min(46, Math.floor((UW - 8) / per));
    ids.forEach((id, i) => {
      const I = MOD.sac.def(id), n = MOD.sac.count(id), row = Math.floor(i / per), inRow = Math.min(per, ids.length - row * per);
      const cx = UW / 2 - iw * inRow / 2 + (i % per) * iw + 1, cy = y + row * 33, full = !MOD.sac.canAdd(id);
      panel(cx, cy, iw - 2, 30, STYLES.steel); icon(I.icon, cx + 8, cy + 8); text(String(n), cx + iw - 5, cy + 5, 1, '#fff3d6', 'right');
      button('item_' + id, cx + 2, cy + 17, iw - 6, 11, full ? 'FULL' : fmt(I.prix), () => buyItem(id), !full && save.cash >= I.prix ? STYLES.gold : STYLES.grey, full ? {} : { icon: 'coin' });
    });
    y += 33 * Math.ceil(ids.length / per);
  }
  let tip = '';
  if (ui.hover && ui.hover.startsWith('item_')) { const I = MOD.sac.def(ui.hover.slice(5)); if (I) tip = L(I.name) + ': ' + L(I.desc); }
  else if (ui.hover && ui.hover.startsWith('up_')) tip = UPGRADES[ui.hover.slice(3)].desc;
  if (tip) text(fitText(tip, UW - 8), UW / 2, y, 1, '#c9b78f', 'center');
  y += 11;
  if (!paged || shopPage === 1) {
    if (paged) y = Math.min(y, UH - 2 - exH);
    for (const ln of lines) {
      let x = UW / 2 - (ln.reduce((a, b) => a + b.w + 4, 0) - 4) / 2;
      for (const b of ln) { button(b.id, x, y, b.w, 16, b.label, b.fn, b.st, { icon: b.icon, disabled: b.disabled }); x += b.w + 4; }
      y += 20;
    }
  } else button('back', UW - 50, UH - 19, 46, 16, 'BACK', closeSub, STYLES.wood);
}
function drawRelics() {
  dim(0.8);
  textOutline('RELICS', UW / 2, 6, 2, '#f6d743');
  text(L('{n} OF {m} FOUND', { n: save.relics.length, m: RELIC_IDS.length }), UW / 2, 24, 1, '#c9b78f', 'center');
  const cw = 92, cols = clamp(Math.floor((UW - 6) / cw), 1, 4), ch = 22, ox = UW / 2 - cols * cw / 2, rows = Math.ceil(RELIC_IDS.length / cols);
  const gap = clamp((UH - 60 - rows * ch) / rows, 1, 4);
  RELIC_IDS.forEach((id, i) => {
    const R = RELICS[id], got = has(id), x = ox + (i % cols) * cw + 1, y = 36 + Math.floor(i / cols) * (ch + gap);
    panel(x, y, cw - 2, ch, got ? STYLES.steel : STYLES.dark);
    if (got) icon(id, x + 9, y + 11); else text('?', x + 9, y + 8, 1, '#5b5d68', 'center');
    text(fitText(got ? R.name : '???', cw - 20), x + 17, y + 4, 1, got ? '#f6d743' : '#6b6875');
    text(fitText(got ? R.desc : L(R.boss ? 'GUARDIAN OF {z}' : 'HIDDEN IN {z}', { z: L(ZONES[R.zone].name) }), cw - 20), x + 17, y + 13, 1, got ? '#c9d8f0' : '#6b6875');
  });
  button('back', UW / 2 - 25, UH - 20, 50, 16, 'BACK', closeSub, STYLES.wood);
}
function drawWreck() {
  dim(0.6);
  const fuel = p.cause === 'fuel', a = appear(0);
  let y = UH * 0.2;
  textOutline(fuel ? 'OUT OF FUEL!' : 'ROBOT WRECKED!', UW / 2, y - (1 - a) * 10, textW(fuel ? 'OUT OF FUEL!' : 'ROBOT WRECKED!', 2) > UW - 10 ? 1 : 2, '#ff6b6b');
  y += 26;
  const cv = cargoValue();
  if (cv) { const s = L('CARGO: {n} ORES', { n: cargoCount() }); text(s, UW / 2 - 6, y, 1, '#fff3d6', 'center'); coinLabel(UW / 2 + textW(s) / 2 + 2, y, cv, 'left'); y += 14; }
  const bw = Math.min(130, UW - 20);
  if (!p.revived && rewardedOK()) { button('revive', UW / 2 - bw / 2, y, bw, 20, 'REPAIR HERE', reviveHere, STYLES.ad, { icon: 'film', sub: 'KEEP YOUR CARGO' }); y += 36; }
  button('tow', UW / 2 - bw / 2, y, bw, 20, 'TOW TO BASE', towHome, STYLES.wood, { sub: cv ? 'CARGO WILL BE LOST' : '' });
}
function drawWin() {
  dim(0.6);
  let y = UH * 0.12;
  const sc = textW('EXPEDITION COMPLETE!', 2) > UW - 10 ? 1 : 2;
  textOutline('EXPEDITION COMPLETE!', UW / 2, y, sc, '#f6d743'); y += 7 * sc + 12;
  for (let k = 0; k <= save.stars; k++) icon('star', UW / 2 + (k - save.stars / 2) * 10, y + 3, 1);
  y += 14;
  for (const l of wrap('ALL FOUR GUARDIANS ARE BEATEN. THE DEEP IS YOURS!', UW - 24)) { text(l, UW / 2, y, 1, '#fff3d6', 'center'); y += 9; }
  y += 8;
  const bw = Math.min(150, UW - 20);
  button('newexp', UW / 2 - bw / 2, y, bw, 20, 'NEW EXPEDITION', newExpedition, STYLES.gold, { icon: 'star', sub: L('NEW WORLD, ORES +{n}%. UPGRADES RESET, RELICS STAY', { n: (save.stars + 1) * 30 }) });
  y += 38;
  button('keep', UW / 2 - bw / 2, y, bw, 18, 'KEEP DIGGING', () => breakThen(resumePlay), STYLES.wood);
  const ex = extraButtons('win');   // statistiques de fin de partie
  if (y + 24 + rowHeight(ex) <= UH - 2) buttonRow(ex, y + 24); else buttonRow(ex, UH - 19, 15, true);
}
// Rangée de boutons ajoutés par les modules (emit('buttons', écran, liste)), centrée et repliée sur plusieurs lignes
function extraButtons(where) { const list = []; emit('buttons', where, list); return list; }
// compact : écrans très bas, boutons réduits à leur icône
function buttonRow(list, y, h = 15, compact = false) {
  const lines = []; let line = [], lw = 0;
  for (const b of list) { const w = compact && b.icon ? 22 : b.w || Math.min(UW - 8, Math.max(44, textW(b.label) + (b.icon ? 24 : 12))); b._w = w; if (lw + w + 4 > UW - 6 && line.length) { lines.push(line); line = []; lw = 0; } line.push(b); lw += w + 4; }
  if (line.length) lines.push(line);
  for (const ln of lines) {
    let x = UW / 2 - (ln.reduce((a, b) => a + b._w + 4, 0) - 4) / 2;
    for (const b of ln) { button(b.id, x, y, b._w, h, compact && b.icon ? '' : b.label, b.fn, b.st || STYLES.wood, { icon: b.icon, disabled: b.disabled }); if (compact && b.icon) icon(b.icon, x + b._w / 2, y + h / 2); x += b._w + 4; }
    y += h + 4;
  }
  return y;
}
const rowHeight = (list, h = 15, compact = false) => { let n = 0, lw = 0; for (const b of list) { const w = compact && b.icon ? 22 : b.w || Math.min(UW - 8, Math.max(44, textW(b.label) + (b.icon ? 24 : 12))); if (!n || lw + w + 4 > UW - 6) { n++; lw = 0; } lw += w + 4; } return n * (h + 4); };
function drawPause() {
  dim(0.6);
  let y = UH * 0.14;
  textOutline('PAUSED', UW / 2, y, 2, '#fff3d6'); y += 28;
  button('resume', UW / 2 - 45, y, 90, 20, 'RESUME', resume, STYLES.green); y += 25;
  y = buttonRow(extraButtons('pause'), y);   // options, sauvegarder, journal...
  if (p && p.y > 20 && !p.dead) { button('calltow', UW / 2 - 55, y, 110, 16, 'CALL A TOW', towHome, STYLES.steel, { sub: cargoCount() ? 'CARGO WILL BE LOST' : 'IF YOU ARE STUCK' }); y += 30; }
  button('menu', UW / 2 - 45, y, 90, 16, 'QUIT', toMenu, STYLES.wood); y += 22;
  y += 4;
  if (UH - y > 55) { const w = Math.min(UW - 16, 170); panel(UW / 2 - w / 2 - 4, y - 3, w + 8, 60, STYLES.dark); drawQuests(UW / 2, y + 1, w); }
}
function drawJoystick() {
  if (!joy || state !== 'play') return;
  const ox = joy.ox / S, oy = joy.oy / S, jx = (joy.x - joy.ox) / S, jy = (joy.y - joy.oy) / S, jl = Math.hypot(jx, jy), k = jl > 13 ? 13 / jl : 1;
  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 32; i++) { const a = i / 32 * TAU; rect(ox + Math.cos(a) * 15, oy + Math.sin(a) * 15, 1, 1, '#fff3d6'); }
  rect(ox + jx * k - 3, oy + jy * k - 3, 6, 6, '#fff3d6');
  ctx.globalAlpha = 1;
}

// ============================================================
//  Main render
// ============================================================
let shakeX = 0, shakeY = 0, vignette = null, hideUI = false;   // hideUI: dev-only, for store trailers
function render(dt) {
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#09070e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ui.buttons.length = 0;
  // smooth shake: layered sines instead of random jitter
  shakeX = (Math.sin(time * 53) + Math.sin(time * 31.3) * 0.6) * shakeAmp * 0.5;
  shakeY = (Math.sin(time * 47.1) + Math.sin(time * 27.7) * 0.6) * shakeAmp * 0.5;
  const cx = cam.x - shakeX, cy = cam.y - shakeY;
  view = { x0: cx - UW / 2, x1: cx + UW / 2, y0: cy - UH / 2, y1: cy + UH / 2 };
  const tx = Math.round(dpr * (W / 2 - cx * S)), ty = Math.round(dpr * (H / 2 - cy * S));
  ctx.setTransform(dpr * S, 0, 0, dpr * S, tx, ty); ctx.imageSmoothingEnabled = false;
  if (world) renderWorld();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (p && p.hurtT > 0 && state === 'play') { ctx.fillStyle = `rgba(226,72,61,${p.hurtT * 0.5})`; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  if (!vignette || vignette.w !== canvas.width || vignette.h !== canvas.height) {
    const g = ctx.createRadialGradient(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) * 0.4, canvas.width / 2, canvas.height / 2, Math.hypot(canvas.width, canvas.height) / 2);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,6,14,.45)');
    vignette = { g, w: canvas.width, h: canvas.height };
  }
  ctx.fillStyle = vignette.g; ctx.fillRect(0, 0, canvas.width, canvas.height);
  uiT();
  // pop-up texts (world -> screen)
  if (!hideUI) for (const t of E.texts) {
    ctx.globalAlpha = clamp(t.life * 3, 0, 1);
    text(t.v, t.x - cx + UW / 2, t.y - cy + UH / 2, 1, t.c, 'center');
  }
  ctx.globalAlpha = 1;
  if (fade) { const a = fade.t < 0.3 ? fade.t / 0.3 : 1 - (fade.t - 0.3) / 0.3; rect(0, 0, UW + 1, UH + 1, `rgba(9,7,14,${clamp(a, 0, 1)})`); }
  if (hideUI) return;
  if (p && ['play', 'pause', 'wreck'].includes(state)) drawHud();
  if (state === 'menu') drawMenu();
  else if (state === 'base') drawBase();
  else if (state === 'shop') drawShop();
  else if (state === 'relics') drawRelics();
  else if (state === 'pause') drawPause();
  else if (state === 'wreck') drawWreck();
  else if (state === 'win') drawWin();
  else if (SCREENS[state]) { if (SCREENS[state].hud && p) drawHud(); SCREENS[state].draw(dt); }
  if (state !== 'play' && state !== 'wreck' && !SCREENS[state]) drawMuteButton();
  if (state === 'play') { button('mute', 3, UH - 16, 13, 13, '', toggleMute, STYLES.dark); icon(silent() ? 'mute' : 'speaker', 9.5, UH - 9.5); }
  drawTutorial();
  drawJoystick();
  drawBanners(dt);
  emit('overlay', dt);
  if (screenT < 0.15 && state !== 'play') { ctx.fillStyle = `rgba(12,10,20,${0.5 * (1 - screenT / 0.15)})`; ctx.fillRect(0, 0, UW + 1, UH + 1); }
}

// ============================================================
//  Input
// ============================================================
addEventListener('keydown', e => {
  const k = e.code;
  SDK.onFirstInput();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'F1'].includes(k)) e.preventDefault();
  ensureAudio();
  if (ask('keyFirst', k, e)) return;   // le mode debug passe avant tout (F1), même pendant une pub simulée
  if (adPlaying || busy) return;
  keys.add(k);
  if (e.repeat) return;   // holding a key must not toggle pause or restart
  if (ask('key', k, e)) return;   // écrans des modules (sac, carte, options...) et touches qu'ils gèrent
  const pauseKey = isBind('pause', k) || (PLATFORM === 'poki' && k === 'Escape');
  if (state === 'play') {
    if (pauseKey) pause();
    else if (isBind('interact', k)) interact();
    else for (let n = 1; n <= 5; n++) if (isBind('hot' + n, k)) { MOD.sac.useHot(n - 1); break; }
  }
  else if (state === 'pause' && pauseKey) resume();
  else if (state === 'menu' && (k === 'Enter' || k === 'Space')) { if (pendingGift && save.tutorialDone) claimGift(false); else play(); }
  else if (state === 'base' && (k === 'Enter' || k === 'Space')) backToDig();
  else if (state === 'base' && k === 'KeyE') openShop();
  else if ((state === 'shop' || state === 'relics') && (k === 'Escape' || k === 'Backspace')) closeSub();
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('wheel', e => e.preventDefault(), { passive: false });
// Perte du focus : pause, mais seulement après la première action du joueur. Sinon, sur les portails,
// la page hôte qui reprend le focus au chargement ferait démarrer le jeu sur l'écran de pause.
addEventListener('blur', () => { keys.clear(); joy = null; if (SDK.interacted) pause(true); });
addEventListener('pointermove', e => {
  ui.mx = e.clientX / S; ui.my = e.clientY / S;
  const b = hitButton(ui.mx, ui.my), nh = b && !b.disabled ? b.id : null;
  if (nh && nh !== ui.hover && e.pointerType === 'mouse') sfx('hover');
  ui.hover = nh;
  canvas.style.cursor = ui.hover ? 'pointer' : 'default';
  if (joy && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; }
});
addEventListener('pointerdown', e => {
  lastPointer = e.pointerType; SDK.onFirstInput();
  ensureAudio();
  if (adPlaying) return;
  const ux = e.clientX / S, uy = e.clientY / S, b = hitButton(ux, uy);
  if (b && !b.disabled) { ui.down = b.id; ui.hover = b.id; e.preventDefault(); return; }
  if (state === 'play' && !joy) { joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY }; e.preventDefault(); }
}, { passive: false });
addEventListener('pointerup', e => {
  ensureAudio();
  if (joy && e.pointerId === joy.id) joy = null;
  if (ui.down) {
    const b = hitButton(e.clientX / S, e.clientY / S);
    if (b && b.id === ui.down && !adPlaying && !b.disabled) { sfx('click'); b.onClick(); }
    ui.down = null;
  }
  if (e.pointerType !== 'mouse') ui.hover = null;
});
addEventListener('pointercancel', e => { if (joy && e.pointerId === joy.id) joy = null; ui.down = null; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pause(true); if (actx) actx.suspend().catch(() => {}); }
  else if (!adPlaying) { ensureAudio(); refreshAudio(); }
});

// ============================================================
//  Main loop
// ============================================================
let lastFrame = performance.now(), autoSave = 0, speed = 1;
function frame(now) {
  const dt = clamp((now - lastFrame) / 1000, 0, 0.05); lastFrame = Math.max(lastFrame, now);
  // vitesse du jeu (mode debug) : au-dessus de 1, plusieurs pas normaux pour garder une physique stable
  if (!adPlaying) { if (speed >= 1) for (let k = 0; k < speed; k++) update(dt); else update(dt * speed); }
  render(adPlaying ? 0 : dt);
  requestAnimationFrame(frame);
}
let camFix = null;   // dev-only: covers and trailers frame the camera by hand
function updateCam(dt) {
  if (!p) return;
  if (camFix) { cam.x = camFix.x; cam.y = camFix.y; return; }
  let tx = p.x + p.vx * 0.2, ty = p.y - 8 + clamp(p.vy * 0.15, -20, 30) + (p.drillDir === 'down' && p.drilling ? 12 : 0);
  if (state === 'menu') { tx = BASE_X; ty = p.y - UH * 0.18; }
  cam.x += (tx - cam.x) * damp(5, dt); cam.y += (ty - cam.y) * damp(5, dt);
  const ww = COLS * TILE;
  cam.x = UW >= ww + 40 ? ww / 2 : clamp(cam.x, UW / 2 - 20, ww + 20 - UW / 2);
  cam.y = clamp(cam.y, -SKY * TILE + UH / 2, ROWS * TILE + 10 - UH / 2);
}
function update(dt) {
  time += dt; screenT += dt;
  shakeAmp = Math.max(0, shakeAmp - dt * 14);
  if (fade) { fade.t += dt; if (!fade.did && fade.t >= 0.3) { fade.did = true; fade.fn(); } if (fade.t >= 0.6) fade = null; }
  if (freeze > 0) { freeze -= dt; return; }   // hit-stop
  if (state === 'play' && p) {
    if (!fade || fade.did) updatePlayer(dt);
    const row = Math.floor(p.y / TILE);
    enemyT -= dt; if (enemyT <= 0) { enemyT = rand(4.5, 8) - zoneOf(Math.max(0, row)) * 0.5; trySpawnEnemy(); }
    updateEnemies(dt);
    if (boss) updateBoss(dt);
    updateShots(dt); updateBoulders(dt); updateBombs(dt); updatePickups(dt);
    emit('update', dt);
    if (tut && tut.step === 2) { tut.t += dt; if (tut.t > 10) tutNext(); }
    if (winPending > 0 && !p.dead && !fade) { winPending -= dt; if (winPending <= 0) { winPending = 0; setScreen('win'); SDK.gameplayStop(); sfx('relic'); writeSave(); } }
    autoSave += dt; if (autoSave > 12 || (saveTimer > 0 && autoSave > 5)) { autoSave = 0; writeSave(); }
  } else if (p) {
    p.sqv += (-p.sq * 220 - p.sqv * 14) * dt; p.sq = clamp(p.sq + p.sqv * dt, -0.4, 0.4);
    p.blink -= dt; if (p.blink < -0.12) p.blink = rand(1.8, 4.5); p.happyT = Math.max(0, p.happyT - dt);
    p.antv += (-p.ant * 170 - p.antv * 7) * dt; p.ant = clamp(p.ant + p.antv * dt, -3, 3);
    if (state === 'menu' && Math.random() < dt * 0.4) { p.antv += rand(-25, 25); }
    if (state === 'wreck' && p.cause === 'hull' && Math.random() < 0.3) part(p.x + rand(-3, 3), p.y - 6, '#5b5d68', rand(-8, 8), rand(-30, -15), 0.8, 2, -10);
  }
  emit('tick', dt);
  updateFx(dt);
  updateCam(dt);
}

// ============================================================
//  Modules : l'interface G que reçoivent modules/*.js
// ============================================================
// Écrans ajoutés par les modules : SCREENS[nom] = { draw(dt), hud: true pour garder le HUD derrière }.
// Un écran de module met le jeu en pause : le monde n'est mis à jour que dans l'état 'play'.
const SCREENS = {};
// Disposition du clavier du joueur (AZERTY : KeyW s'affiche Z), quand le navigateur la donne
let layoutMap = null;
try { if (navigator.keyboard && navigator.keyboard.getLayoutMap) navigator.keyboard.getLayoutMap().then(m => { layoutMap = m; }, () => {}); } catch (e) {}
// Lettres de déplacement réellement imprimées sur le clavier (WASD, ZQSD...)
const moveLetters = () => ['KeyW', 'KeyA', 'KeyS', 'KeyD'].map(keyName).join('');
// Nom affichable d'une touche (KeyE -> E, ArrowUp -> HAUT...)
function keyName(code) {
  if (!code) return '-';
  if (code.startsWith('Key')) return (layoutMap && layoutMap.get(code) || code.slice(3)).toUpperCase();
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return L('PAV') + code.slice(6);
  const named = { ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', Space: 'SPACE', Enter: 'ENTER', Tab: 'TAB', Escape: 'ESC',
    ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', ControlRight: 'CTRL', AltLeft: 'ALT', AltRight: 'ALT', Backspace: 'DEL' };
  return named[code] ? L(named[code]) : code.slice(0, 5).toUpperCase();
}
const G = {
  DATA, PLATFORM, DEV, T, TD, TILE, COLS, ROWS, SKY, ZONE_H, BASE_X, ZONES, ORES, UPGRADES, UP_IDS, RELICS, RELIC_IDS, EDEF, BOSS, QUESTS, STYLES, OUTLINE, BINDS, DEFAULT_BINDS, SCREENS, MOD, E, cam, keys, ui, cheat, vol, hooks, saveFields,
  // état du jeu (lecture)
  get state() { return state; }, get p() { return p; }, get save() { return save; }, get world() { return world; }, get boss() { return boss; }, set boss(v) { boss = v; },
  get time() { return time; }, get screenT() { return screenT; }, get UW() { return UW; }, get UH() { return UH; }, get S() { return S; }, get W() { return W; }, get H() { return H; }, get dpr() { return dpr; },
  get view() { return view; }, get busy() { return busy; }, set busy(v) { busy = v; }, get fade() { return fade; }, get tut() { return tut; }, get lang() { return lang; },
  set tut(v) { tut = v; }, get speed() { return speed; }, set speed(v) { speed = v; }, get muted() { return muted; }, get baseInfo() { return baseInfo; }, get SP() { return SP; }, get ctx() { return ctx; },
  get saveKey() { return SAVE_KEY; }, set saveKey(k) { SAVE_KEY = k; }, get subReturn() { return subReturn; }, set subReturn(v) { subReturn = v; },
  // événements
  on, emit, ask,
  // outils
  L, clamp, lerp, rand, damp, easeOut, easeOutBack, hash2, prng, own, num, fmt, keyName, held, isBind,
  // dessin (UI en unités écran, monde en pixels d'art)
  text, textW, textOutline, fitText, wrap, icon, panel, button, rect, rectW, bar, dim, coinLabel, drawSpr, drawGlow, appear, isTouch, uiT, build,
  // monde et jeu
  collide, overlap, pBox, drillBox, tileAt, solidAt, zoneOf, diggable, isRock, breakTile, markDug, st, bonus, oreValue, cargoCount, cargoValue, hurtPlayer, spawnBoss, damageBoss, arena, explode, spawnCoins, spawnEnemy, killEnemy,
  part, burst, popText, shake, banner, toast, sfx, tone, noise, ensureAudio, applyVolume, refreshAudio, Music, SONGS,
  warp, writeSave, loadSave, loadWorld, newPlayer, clearEntities, setScreen, resumePlay, breakThen, pause, resume, toMenu, openBase, openShop, closeSub, towHome, interact, liftTo, travelTo, questInfo, rewardedOK,
  get sdk() { return SDK; }, checkDaily, buttonRow, extraButtons, play, toggleMute, cycleLang, silent,
  // un emplacement libre pour une petite lumière qui dure (fusée, balise...)
  addLight(x, y, r, t, i = 1, flat = false) { E.lights.push({ x, y, r, t, max: t, i, flat }); },
  addTile(name, def) { const id = Math.max(...Object.values(T)) + 1; T[name] = id; TD[id] = def; return id; },
  field(nom, def, charger) { saveFields[nom] = { def, charger }; },
  // ouvrir un écran de module en se souvenant d'où l'on vient (Retour y ramène)
  openScreen(name, from = state) { if (state === 'play') { SDK.gameplayStop(); keys.clear(); joy = null; } SCREENS[name].from = from; setScreen(name); },
  closeScreen() { const sc = SCREENS[state], to = sc && sc.from ? sc.from : 'menu'; if (to === 'play') { setScreen('play'); SDK.gameplayStart(); lastFrame = performance.now(); } else setScreen(to); },
};
for (const f of window.COG_MODULES || []) {
  try { const m = f(G); if (m && m.nom) MOD[m.nom] = m; }
  catch (e) { console.error('Module en erreur :', e); }
}

// ============================================================
//  Boot
// ============================================================
(async function boot() {
  resize();
  await SDK.init();
  SDK.loadingStart();
  buildArt(); buildTiles();
  emit('boot');   // les modules lisent leurs réglages (emplacement de sauvegarde, volume, touches)
  loadSave();
  muted = !!save.muted;
  lang = save.lang || detectLang();
  loadWorld(); newPlayer();
  emit('loaded');
  checkDaily();
  SDK.loadingStop();
  if (SDK.poki) { try { SDK.poki.movePill(50, 0); } catch (e) {} }   // Poki mobile pill: out of the top-left HUD
  try { window.focus(); } catch (e) {}   // so keyboard input works without an extra click inside the iframe
  if (!save.tutorialDone) { tut = { step: 0, t: 0 }; play(); }   // first visit: straight into the ground, the tutorial teaches as you play
  requestAnimationFrame(frame);
})();

});
