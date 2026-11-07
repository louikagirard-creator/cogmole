// ============================================================
//  Module « pnj » : les personnages et leurs dialogues
//  - Mira attend à la surface, à côté de la pompe (aussi joignable depuis l'écran de la base).
//  - Trois vieux robots et Bolt sont enfouis dans des niches, un par zone (data/pnj.json).
//  - Un « ! » doré flotte au-dessus d'un personnage qui a quelque chose de nouveau à dire.
//  - Les dialogues des quêtes viennent du module progression (data/quetes.json).
// ============================================================
(window.COG_MODULES = window.COG_MODULES || []).push(function pnj(G) {
  'use strict';
  const DEF = G.DATA.pnj.liste, IDS = Object.keys(DEF);
  const tr = (fr, en, es, pt) => ({ fr, en, es, pt });
  const TXT = {
    parler: tr('Parler', 'Talk', 'Hablar', 'Falar'),
    suite: tr('Suite', 'Next', 'Seguir', 'Seguir'),
    mira: tr('Mira', 'Mira', 'Mira', 'Mira'),
  };

  // ---------- placement (avec un tirage à part : le reste du monde ne change pas) ----------
  G.on('genWorld', (w, set, get, seed) => {
    const rnd = G.prng(seed * 53 + 29), T = G.T, out = [];
    for (const id of IDS) {
      const d = DEF[id];
      if (d.zone === null || d.zone === undefined) { out.push({ id, x: d.x, y: 0, c: Math.floor(d.x / G.TILE), r: 0, surface: true }); continue; }
      const r = d.zone * G.ZONE_H + d.ligne;
      let c = 6;
      for (let k = 0; k < 30; k++) {
        c = 3 + Math.floor(rnd() * (G.COLS - 6));
        const loin = q => Math.abs(q.c - c) > 3 || Math.abs(q.r - r) > 4;
        if (w.caches.every(loin) && (w.beacons || []).every(loin)) break;
      }
      for (let dc = -1; dc <= 1; dc++) for (let dr = 1; dr <= 2; dr++) set(c + dc, r - dr, T.AIR);
      for (let dc = -1; dc <= 1; dc++) if (!G.TD[get(c + dc, r)].solid || G.TD[get(c + dc, r)].lava) set(c + dc, r, [T.DIRT, T.STONE, T.BASALT, T.CRYST][d.zone]);
      out.push({ id, x: c * G.TILE + 5, y: r * G.TILE, c, r });
    }
    w.pnj = out;
  });
  const liste = () => (G.world && G.world.pnj) || [];
  const proche = () => { const p = G.p; if (!p || p.dead) return null; return liste().find(n => Math.abs(p.x - n.x) < 15 && Math.abs(p.y - n.y) < 12) || null; };
  const nouveau = id => !!(G.MOD.progression && G.MOD.progression.aDuNouveau(id));

  // ---------- dessin ----------
  G.on('drawWorld', () => {
    const v = G.view;
    for (const n of liste()) {
      if (n.x < v.x0 - 20 || n.x > v.x1 + 20 || n.y < v.y0 - 20 || n.y > v.y1 + 30) continue;
      const d = DEF[n.id], fr = G.SP[d.sprite], cl = (G.time + n.c) % 3.2 < 0.15 ? 1 : 0;
      const p = G.p, face = p && p.x < n.x ? -1 : 1;
      G.drawSpr(fr[cl], n.x, n.y + 1, { flip: d.sprite === 'mira' ? face : 1 });
      if (nouveau(n.id)) {   // « ! » qui rebondit
        const by = n.y - fr[0].h - 6 + Math.round(Math.sin(G.time * 5) * 1.5);
        G.rectW(n.x - 1, by, 2, 4, '#f6d743'); G.rectW(n.x - 1, by + 5, 2, 2, '#f6d743');
      }
    }
  });
  G.on('light', stamp => { for (const n of liste()) if (!n.surface) stamp(n.x, n.y - 8, 26, 0.55); });

  // ---------- parler ----------
  G.on('ctx', () => (proche() ? { label: TXT.parler, icon: 'talk' } : null));
  G.on('interact', () => { const n = proche(); if (n) { parler(n.id); return true; } return false; });
  function parler(id) {
    const d = DEF[id], r = G.MOD.progression ? G.MOD.progression.parler(id) : null;
    const lignes = r && r.lignes.length ? r.lignes : [d.bavardage[Math.floor(Math.random() * d.bavardage.length)]];
    dlg.id = id; dlg.lignes = lignes; dlg.i = 0; dlg.fin = r ? r.fin : null; dlg.t = 0;
    G.openScreen('dialogue'); G.sfx('click');
  }
  G.on('buttons', (where, list) => { if (where === 'base') list.push({ id: 'talk_mira', label: TXT.mira, fn: () => parler('mira'), icon: 'talk', st: nouveau('mira') ? G.STYLES.gold : G.STYLES.steel }); });

  // ---------- écran de dialogue ----------
  const dlg = { id: null, lignes: [], i: 0, fin: null, t: 0 };
  function suivant() {
    if (dlg.t < 0.15) return;   // évite de sauter une réplique par un double appui
    dlg.i++; dlg.t = 0; G.sfx('click');
    if (dlg.i >= dlg.lignes.length) finir();
  }
  function finir() {
    const f = dlg.fin; dlg.fin = null;
    G.closeScreen();
    if (f) f();
  }
  function dessiner(dt) {
    dlg.t += dt;
    const { UW, UH } = G, d = DEF[dlg.id]; if (!d) return;
    G.dim(0.35);
    const w = Math.min(UW - 8, 300), h = Math.min(UH * 0.42, 74), x = UW / 2 - w / 2, y = UH - h - 4;
    G.panel(x, y, w, h, G.STYLES.dark);
    // portrait
    const spr = G.SP[d.sprite][dlg.t % 3 < 0.12 ? 1 : 0], sc = h > 60 ? 3 : 2, pw = spr.w * sc;
    G.panel(x + 4, y + 4, pw + 6, spr.h * sc + 6, G.STYLES.steel);
    G.ctx.drawImage(spr.c, Math.round(x + 7), Math.round(y + 7), spr.w * sc, spr.h * sc);
    const tx = x + pw + 14, tw = w - pw - 18;
    G.text(G.fitText(d.nom, tw), tx, y + 5, 1, d.couleur || '#f6d743');
    G.text(G.fitText(d.role, tw), tx, y + 14, 1, '#8f8aa3');
    // la réplique apparaît lettre par lettre
    const ligne = G.L(dlg.lignes[dlg.i] || ''), vis = Math.floor(dlg.t * 60), part = ligne.slice(0, vis);
    const lignes = G.wrap(part, tw), max = Math.max(1, Math.floor((h - 34) / 9));
    lignes.slice(0, max).forEach((l, i) => G.text(l, tx, y + 25 + i * 9, 1, '#fff3d6'));
    if (vis >= ligne.length && Math.floor(G.time * 3) % 2) G.text('>', x + w - 8, y + h - 10, 1, '#f6d743');
    G.text((dlg.i + 1) + '/' + dlg.lignes.length, x + w - 14, y + h - 10, 1, '#6b6875', 'right');
    // toucher ou cliquer n'importe où : afficher toute la réplique, puis passer à la suivante
    G.ui.buttons.push({ id: 'dlg_next', x: 0, y: 0, w: UW, h: UH, onClick: () => { if (vis < ligne.length) dlg.t = 99; else suivant(); } });
  }
  G.SCREENS.dialogue = { draw: dessiner };
  G.on('key', k => {
    if (G.state !== 'dialogue') return false;
    const ligne = G.L(dlg.lignes[dlg.i] || '');
    if (k === 'Escape') finir();
    else if (k === 'Enter' || k === 'Space' || G.isBind('interact', k) || G.isBind('down', k)) { if (Math.floor(dlg.t * 60) < ligne.length) dlg.t = 99; else suivant(); }
    return true;
  });

  return { nom: 'pnj', liste, parler, marqueurs: () => liste().filter(n => !n.surface && G.MOD.carte && G.MOD.carte.estVu(n.c, n.r - 1)) };
});
