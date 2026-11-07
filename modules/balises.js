// ============================================================
//  Module « balises » : raccourcis et points de contrôle
//  Deux balises de forage sont enfouies dans chaque zone (rangées données par data/zones.json).
//  Quand Cog en approche une pour la première fois, elle s'allume : son, lumière, message,
//  et la partie est sauvegardée (point de contrôle).
//  Une balise allumée sert ensuite de raccourci : depuis la base ou depuis n'importe quelle
//  balise allumée, la carte (module carte) permet de s'y téléporter.
// ============================================================
(window.COG_MODULES = window.COG_MODULES || []).push(function balises(G) {
  'use strict';
  const tr = (fr, en, es, pt) => ({ fr, en, es, pt });
  const TXT = {
    activee: tr('Balise {n} activée !', 'Beacon {n} online!', '¡Baliza {n} activada!', 'Baliza {n} ativada!'),
    sous: tr('Raccourci et point de sauvegarde', 'Shortcut and save point', 'Atajo y punto de guardado', 'Atalho e ponto de salvamento'),
    action: tr('Téléporter', 'Teleport', 'Teletransporte', 'Teleportar'),
    nom: tr('Balise {n}', 'Beacon {n}', 'Baliza {n}', 'Baliza {n}'),
  };

  // la case « balise » : un socle qu'on ne peut pas creuser, avec un mât et une lampe
  const T_BEACON = G.addTile('BEACON', {
    solid: true, hard: Infinity, beacon: true,
    draw(c, r, X, Y) {
      const b = trouver(c, r), on = b && actif(b.i), pulse = (Math.sin(G.time * 4 + c) + 1) / 2, rw = G.rectW;
      rw(X, Y, 10, 10, '#4a4458'); rw(X, Y, 10, 1, '#7d7590'); rw(X + 1, Y + 9, 8, 1, '#2a2233'); rw(X + 2, Y + 3, 6, 4, '#3a3445');
      rw(X + 3, Y + 4, 4, 2, on ? (pulse > 0.5 ? '#9fe2ff' : '#4aa3df') : '#5b5d68');
      // mât et lampe dans la case du dessus
      rw(X + 4, Y - 7, 2, 7, '#8d8f99'); rw(X + 4, Y - 7, 1, 7, '#d4d6dc');
      rw(X + 3, Y - 10, 4, 3, on ? (pulse > 0.3 ? '#e8f6ff' : '#9fe2ff') : '#4a4458');
      if (on && Math.random() < 0.02) G.part(X + 5, Y - 9, '#9fe2ff', G.rand(-8, 8), G.rand(-20, -8), 0.6, 1, 0, true);
    },
    glow(c, r) { const b = trouver(c, r); return b && actif(b.i) ? [c * G.TILE + 5, r * G.TILE - 8, 34 + Math.sin(G.time * 3) * 2, 0.85] : [c * G.TILE + 5, r * G.TILE - 8, 12, 0.35]; },
  });

  // ---------- sauvegarde : save.mods.balises = { on: masque des balises allumées, last: dernière allumée } ----------
  G.field('balises', () => ({ on: 0, last: -1 }), raw => ({
    on: raw && typeof raw === 'object' ? G.num(raw.on, 0, 0xffff) : 0,
    last: raw && typeof raw === 'object' ? G.num(raw.last, -1, 15, -1) : -1,
  }));
  const data = () => G.save.mods.balises;
  const actif = i => !!(data().on & (1 << i));
  const liste = () => (G.world && G.world.beacons) || [];
  const trouver = (c, r) => liste().find(b => b.c === c && b.r === r);

  // ---------- génération : chaque balise dans une petite poche, avec son propre tirage ----------
  G.on('genWorld', (w, set, get, seed) => {
    const rnd = G.prng(seed * 31 + 17), T = G.T, out = [];
    G.ZONES.forEach((Z, z) => (Z.balises || []).forEach(local => {
      const r = z * G.ZONE_H + local;
      let c = 0;
      for (let k = 0; k < 20; k++) {   // évite les caches anciennes et le puits central de la base
        c = 4 + Math.floor(rnd() * (G.COLS - 8));
        if (!w.caches.some(q => Math.abs(q.c - c) < 3 && Math.abs(q.r - r) < 4) && (c < 13 || c > 22 || z > 0)) break;
      }
      for (let dc = -1; dc <= 1; dc++) for (let dr = 1; dr <= 2; dr++) set(c + dc, r - dr, T.AIR);
      for (const dc of [-1, 1]) if (!G.TD[get(c + dc, r)].solid) set(c + dc, r, [T.DIRT, T.STONE, T.BASALT, T.CRYST][z]);
      set(c, r, T_BEACON);
      out.push({ c, r, z, i: out.length });
    }));
    w.beacons = out;
  });

  // ---------- allumage ----------
  function allumer(b) {
    const d = data(); d.on |= 1 << b.i; d.last = b.i;
    const x = b.c * G.TILE + 5, y = b.r * G.TILE - 8;
    G.banner(G.L(TXT.activee, { n: b.i + 1 }), '#9fe2ff', TXT.sous);
    G.burst(x, y, '#9fe2ff', 26, 1.3, 1, 60); G.burst(x, y, '#e8f6ff', 10, 0.6, 2, 0);
    G.addLight(x, y, 90, 1.2); G.shake(3);
    // petit carillon montant
    if (G.ensureAudio) { [659, 880, 1175, 1568].forEach((f, k) => setTimeout(() => G.tone(f, 0.35, 'triangle', 0.07), k * 90)); }
    G.emit('beacon', b.i);
    G.writeSave();   // point de contrôle
  }
  const pres = b => { const p = G.p; return p && Math.hypot(p.x - (b.c * G.TILE + 5), p.y - b.r * G.TILE) < 18; };
  G.on('update', () => {
    const p = G.p; if (!p || p.dead) return;
    for (const b of liste()) if (!actif(b.i) && pres(b)) allumer(b);
  });
  const balisePres = () => liste().find(b => actif(b.i) && pres(b) && G.p && !G.p.dead);
  G.on('ctx', () => (balisePres() && G.MOD.carte ? { label: TXT.action, icon: 'beacon' } : null));
  G.on('interact', () => { if (balisePres() && G.MOD.carte) { G.MOD.carte.ouvrir('balise'); return true; } return false; });
  G.on('expedition', () => { data().on = 0; data().last = -1; });

  return {
    nom: 'balises', T: T_BEACON, liste, actif, nomBalise: i => G.L(TXT.nom, { n: i + 1 }),
    // position où le robot apparaît sur la balise
    position: b => ({ x: b.c * G.TILE + 5, y: b.r * G.TILE }),
    sousBalise: () => !!balisePres(),
  };
});
