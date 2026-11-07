// ============================================================
//  Module « carte » : exploration, mini-carte et grande carte
//  - Le sous-sol se dévoile au fil de l'exploration (tout ce que la lampe a éclairé).
//  - Une mini-carte en haut à droite (touchée ou cliquée, elle ouvre la grande carte).
//  - La grande carte (touche M) montre la base, les balises, les ascenseurs, les caches vues,
//    les personnages rencontrés et le robot.
//  - Depuis la base ou une balise allumée, elle sert à se téléporter vers une balise allumée
//    ou un ascenseur ouvert (le raccourci pour revenir vite là où l'on était).
// ============================================================
(window.COG_MODULES = window.COG_MODULES || []).push(function carte(G) {
  'use strict';
  const tr = (fr, en, es, pt) => ({ fr, en, es, pt });
  const TXT = {
    titre: tr('Carte', 'Map', 'Mapa', 'Mapa'),
    base: tr('Base', 'Base', 'Base', 'Base'),
    asc: tr('Ascenseur {n}', 'Lift {n}', 'Ascensor {n}', 'Elevador {n}'),
    aller: tr('Aller', 'Go', 'Ir', 'Ir'),
    ici: tr('Tu es ici', 'You are here', 'Estás aquí', 'Você está aqui'),
    astuce: tr('Va à la base ou sur une balise allumée pour te téléporter.', 'Go to base or to a lit beacon to teleport.', 'Ve a la base o a una baliza encendida para teletransportarte.', 'Vá à base ou a uma baliza acesa para se teleportar.'),
    aucune: tr('Aucune balise allumée. Elles sont enfouies dans chaque zone : cherche leur lueur bleue.', 'No beacon lit yet. They are buried in every zone: look for their blue glow.', 'Ninguna baliza encendida. Están enterradas en cada zona: busca su brillo azul.', 'Nenhuma baliza acesa. Estão enterradas em cada zona: procure o brilho azul.'),
    destinations: tr('Destinations', 'Destinations', 'Destinos', 'Destinos'),
    explore: tr('Exploré {n}%', 'Explored {n}%', 'Explorado {n}%', 'Explorado {n}%'),
  };
  const N = G.COLS * G.ROWS;

  // ---------- exploration : bit à 1 = case déjà vue (sauvegardé en base64 comme les cases creusées) ----------
  let vu = new Uint8Array(Math.ceil(N / 8));
  const estVu = i => !!(vu[i >> 3] & (1 << (i & 7)));
  const encoder = () => { let s = ''; for (let i = 0; i < vu.length; i++) s += String.fromCharCode(vu[i]); return btoa(s); };
  G.field('carte', () => '', raw => (typeof raw === 'string' && raw.length < 2000 && /^[A-Za-z0-9+/=]*$/.test(raw) ? raw : ''));
  G.on('loaded', relire);
  function relire() {
    vu = new Uint8Array(Math.ceil(N / 8));
    try { const s = atob(G.save.mods.carte || ''); for (let i = 0; i < s.length && i < vu.length; i++) vu[i] = s.charCodeAt(i) & 255; } catch (e) { vu.fill(0); }
  }
  G.on('save', () => { G.save.mods.carte = encoder(); });
  G.on('expedition', () => { vu.fill(0); G.save.mods.carte = ''; });
  let scanT = 0;
  G.on('update', dt => {
    scanT -= dt; if (scanT > 0) return; scanT = 0.2;
    const p = G.p; if (!p) return;
    const R = Math.ceil(G.st.light() / G.TILE * 0.8) + 1, c0 = Math.floor(p.x / G.TILE), r0 = Math.floor((p.y - 5) / G.TILE);
    for (let r = Math.max(0, r0 - R); r <= Math.min(G.ROWS - 1, r0 + R); r++) for (let c = Math.max(0, c0 - R); c <= Math.min(G.COLS - 1, c0 + R); c++)
      if ((c - c0) * (c - c0) + (r - r0) * (r - r0) <= R * R) { const i = r * G.COLS + c; vu[i >> 3] |= 1 << (i & 7); }
  });
  function toutDevoiler() { vu.fill(255); }
  const pourcent = () => { let n = 0; for (let i = 0; i < N; i++) if (estVu(i)) n++; return Math.floor(n * 100 / N); };

  // ---------- couleur d'une case sur la carte ----------
  const ZC = ['#6e4a32', '#55515e', '#3a2d33', '#38325a'];
  function couleur(c, r) {
    const i = r * G.COLS + c;
    if (!estVu(i)) return null;
    const T = G.T, t = G.world.t[i];
    if (t === T.AIR || t === T.BOULDER) return '#1b1724';
    if (t === T.LAVA) return '#d8461c';
    if (t === T.LIFT) return '#4aa3df';
    if (t === T.CACHE) return '#f6d743';
    if (G.TD[t].beacon) return '#9fe2ff';
    if (t === T.BEDROCK || t === T.SEAL) return '#141119';
    const o = G.world.ore[i]; if (o) return G.ORES[o].c;
    return ZC[G.zoneOf(r)];
  }
  // la carte est dessinée une fois dans un canvas (1 pixel = 1 case), redessiné seulement si besoin
  let cv = null, cx = null, cvT = -1;
  function canvasCarte() {
    if (!cv) { cv = document.createElement('canvas'); cv.width = G.COLS; cv.height = G.ROWS; cx = cv.getContext('2d'); }
    if (G.time - cvT < 0.5 && cvT >= 0) return cv;
    cvT = G.time;
    const img = cx.createImageData(G.COLS, G.ROWS), d = img.data;
    for (let r = 0; r < G.ROWS; r++) for (let c = 0; c < G.COLS; c++) {
      const col = couleur(c, r), k = (r * G.COLS + c) * 4;
      if (!col) { d[k] = 12; d[k + 1] = 10; d[k + 2] = 18; d[k + 3] = 255; continue; }
      const n = parseInt(col.slice(1), 16); d[k] = n >> 16; d[k + 1] = (n >> 8) & 255; d[k + 2] = n & 255; d[k + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    return cv;
  }

  // ---------- mini-carte (HUD) ----------
  G.on('hud', () => {
    const p = G.p; if (!p || G.boss || G.UW < 220 || p.y < 2 || G.state !== 'play') return;
    const w = 36, h = 40, x = G.UW - w - 4, y = 30, c0 = Math.floor(p.x / G.TILE) - w / 2, r0 = Math.floor(p.y / G.TILE) - h / 2;
    G.button('minimap', x - 1, y - 1, w + 2, h + 2, '', () => ouvrir('vue'), G.STYLES.dark);
    G.ctx.save(); G.ctx.beginPath(); G.ctx.rect(x, y, w, h); G.ctx.clip();
    G.ctx.globalAlpha = 0.9; G.ctx.drawImage(canvasCarte(), -c0 + x, -r0 + y); G.ctx.globalAlpha = 1;
    G.ctx.restore();
    if (Math.floor(G.time * 3) % 2) G.rect(x + w / 2 - 1, y + h / 2 - 1, 2, 2, '#fff3b0');
  });

  // ---------- grande carte ----------
  const ui = { mode: 'vue', scroll: 0, drag: null };
  function peutTeleporter() {
    const p = G.p, from = G.SCREENS.map.from;
    if (from === 'base' || from === 'shop') return true;
    return from === 'play' && G.MOD.balises && G.MOD.balises.sousBalise();
  }
  function ouvrir(mode = 'vue') {
    if (!G.world || !['play', 'base', 'shop'].includes(G.state)) return;
    if (G.state === 'play' && (!G.p || G.p.dead || G.fade)) return;
    ui.mode = mode;
    const p = G.p; ui.scroll = G.state === 'play' && p ? Math.max(0, Math.floor(p.y / G.TILE)) : 0;
    G.openScreen('map'); G.sfx('click');
  }
  function destinations() {
    const out = [{ id: 'base', label: TXT.base, x: G.BASE_X, y: 0, r: 0 }];
    if (G.MOD.balises) for (const b of G.MOD.balises.liste()) if (G.MOD.balises.actif(b.i)) { const q = G.MOD.balises.position(b); out.push({ id: 'b' + b.i, label: G.MOD.balises.nomBalise(b.i), x: q.x, y: q.y, r: b.r }); }
    for (let z = 1; z < 4; z++) if (G.save.bossDown & (1 << (z - 1))) out.push({ id: 'l' + z, label: G.L(TXT.asc, { n: z + 1 }), x: G.BASE_X, y: (z * G.ZONE_H + 3) * G.TILE, r: z * G.ZONE_H + 3 });
    return out.sort((a, b) => a.r - b.r);
  }
  function aller(d) {
    const from = G.SCREENS.map.from;
    G.emit('travel', d.id);
    if (from === 'play') {
      G.closeScreen();
      if (d.id === 'base') { G.warp(G.BASE_X, 0); return; }
      G.warp(d.x, d.y);
    } else {
      if (d.id === 'base') { G.closeScreen(); return; }
      G.closeScreen(); G.travelTo(d.x, d.y);
    }
  }
  function dessiner() {
    const { UW, UH } = G, S = G.STYLES, p = G.p;
    G.dim(0.85);
    G.textOutline(TXT.titre, UW / 2, 4, UW < 200 ? 1 : 2, '#f6d743');
    G.button('close', UW - 17, 3, 14, 13, 'X', () => { G.closeScreen(); G.sfx('click'); }, S.wood);
    const top = UW < 200 ? 16 : 24, sc = UH > 330 ? 2 : 1, mh = UH - top - 4, vis = Math.floor(mh / sc);
    const wide = UW >= 230, mw = G.COLS * sc, mx = 6;
    ui.scroll = G.clamp(ui.scroll, Math.floor(vis / 2), Math.max(Math.floor(vis / 2), G.ROWS - Math.ceil(vis / 2)));
    const r0 = ui.scroll - Math.floor(vis / 2);
    // terrain
    G.panel(mx - 2, top - 2, mw + 4, mh + 4, S.dark);
    G.ctx.save(); G.ctx.beginPath(); G.ctx.rect(mx, top, mw, mh); G.ctx.clip();
    G.ctx.drawImage(canvasCarte(), 0, r0, G.COLS, vis, mx, top, mw, vis * sc);
    // repères des zones
    for (let z = 1; z < 4; z++) { const yy = top + (z * G.ZONE_H - r0) * sc; if (yy > top && yy < top + mh) G.rect(mx, yy, mw, 1, 'rgba(255,243,214,0.25)'); }
    if (r0 <= 0) G.rect(mx + (G.BASE_X / G.TILE - 4) * sc, top - r0 * sc, 8 * sc, sc, '#f6d743');
    if (p && Math.floor(G.time * 3) % 2) { const px = mx + Math.floor(p.x / G.TILE) * sc, py = top + (Math.max(0, Math.floor(p.y / G.TILE)) - r0) * sc; G.rect(px - 1, py - 1, sc + 2, sc + 2, '#fff3b0'); }
    if (G.MOD.pnj) for (const n of G.MOD.pnj.marqueurs()) { const yy = top + (n.r - r0) * sc; G.rect(mx + n.c * sc - 1, yy - 1, sc + 2, sc + 2, '#7fd05f'); }
    G.ctx.restore();
    // échelle de profondeur
    if (wide) for (let m = 0; m <= 480; m += 40) { const yy = top + (m / 2 - r0) * sc; if (yy >= top && yy < top + mh - 6) G.text(m + 'M', mx + mw + 4, yy - 3, 1, '#8f8aa3', 'left', null); }
    // panneau des destinations
    const px0 = mx + mw + (wide ? 30 : 8), pw = UW - px0 - 6;
    let y = top;
    G.text(G.L(TXT.explore, { n: pourcent() }), px0, y, 1, '#c9b78f'); y += 12;
    if (!peutTeleporter()) { for (const l of G.wrap(TXT.astuce, pw)) { G.text(l, px0, y, 1, '#8f8aa3'); y += 9; } y += 4; }
    const ds = destinations();
    G.text(TXT.destinations, px0, y, 1, '#f6d743'); y += 11;
    if (ds.length <= 1) { for (const l of G.wrap(TXT.aucune, pw)) { if (y > UH - 12) break; G.text(l, px0, y, 1, '#8f8aa3'); y += 9; } }
    const ok = peutTeleporter(), bh = 14, room = Math.max(1, Math.floor((UH - y - 4) / (bh + 2)));
    for (const d of ds.slice(0, room)) {
      const ici = p && G.state === 'map' && Math.abs(p.x - d.x) < 20 && Math.abs(p.y - d.y) < 20 && G.SCREENS.map.from === 'play';
      const lab = `${G.fitText(d.label, pw - 50)} ${Math.floor(d.y / G.TILE) * 2}M`;
      G.button('go_' + d.id, px0, y, pw, bh, lab, () => { ui.scroll = Math.max(0, Math.floor(d.y / G.TILE)); if (ok && !ici) aller(d); }, ici ? S.dark : ok ? S.steel : S.dark, { icon: d.id === 'base' ? 'gear' : d.id[0] === 'l' ? 'lift' : 'beacon' });
      y += bh + 2;
    }
  }
  G.SCREENS.map = { draw: dessiner };

  // ---------- commandes ----------
  G.on('key', k => {
    if (G.state === 'map') {
      if (G.isBind('map', k) || k === 'Escape' || k === 'Backspace') { G.closeScreen(); G.sfx('click'); }
      else if (k === 'ArrowUp' || G.isBind('up', k)) ui.scroll -= 10;
      else if (k === 'ArrowDown' || G.isBind('down', k)) ui.scroll += 10;
      else if (k === 'PageUp') ui.scroll -= 40;
      else if (k === 'PageDown') ui.scroll += 40;
      return true;
    }
    if ((G.state === 'play' || G.state === 'base') && G.isBind('map', k)) { ouvrir('vue'); return true; }
    return false;
  });
  // molette et glisser pour faire défiler la grande carte
  addEventListener('wheel', e => { if (G.state === 'map') ui.scroll += Math.sign(e.deltaY) * 8; }, { passive: true });
  addEventListener('pointerdown', e => { if (G.state === 'map') ui.drag = { y: e.clientY, s: ui.scroll }; });
  addEventListener('pointermove', e => { if (G.state === 'map' && ui.drag && e.buttons) ui.scroll = ui.drag.s - Math.round((e.clientY - ui.drag.y) / G.S / (G.UH > 330 ? 2 : 1)); });
  addEventListener('pointerup', () => { ui.drag = null; });

  return { nom: 'carte', ouvrir, toutDevoiler, pourcent, estVu: (c, r) => estVu(r * G.COLS + c) };
});
