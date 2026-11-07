// ============================================================
//  Module « progression » : quêtes, carnet de Bolt, succès et statistiques
//  - Quête principale (l'histoire de Bolt) et quêtes annexes données par les personnages : data/quetes.json
//  - Succès : data/succes.json
//  - Statistiques de partie : temps, épaves, objets fabriqués et trouvés, secrets...
//  - Écran « journal » (touche J) avec 4 onglets : Quêtes, Carnet, Succès, Stats.
// ============================================================
(window.COG_MODULES = window.COG_MODULES || []).push(function progression(G) {
  'use strict';
  const QD = G.DATA.quetes, MAIN = QD.principale, ANNEXES = QD.annexes, PAGES = QD.carnet, SUCCES = G.DATA.succes.liste;
  const tr = (fr, en, es, pt) => ({ fr, en, es, pt });
  const TXT = {
    journal: tr('Journal', 'Journal', 'Diario', 'Diário'),
    onglets: [tr('Quêtes', 'Quests', 'Misiones', 'Missões'), tr('Carnet', 'Logbook', 'Diario', 'Diário'), tr('Succès', 'Feats', 'Logros', 'Conquistas'), tr('Stats', 'Stats', 'Datos', 'Dados')],
    principale: tr('Histoire', 'Story', 'Historia', 'História'),
    annexes: tr('Quêtes annexes', 'Side quests', 'Misiones extra', 'Missões extras'),
    aucune: tr('Aucune pour l\'instant. Parle aux personnages que tu croises.', 'None for now. Talk to the characters you meet.', 'Ninguna por ahora. Habla con los personajes que encuentres.', 'Nenhuma por enquanto. Fale com os personagens que encontrar.'),
    finie: tr('Histoire terminée. Merci d\'avoir joué !', 'Story complete. Thanks for playing!', 'Historia terminada. ¡Gracias por jugar!', 'História concluída. Obrigado por jogar!'),
    terminee: tr('Quête terminée : {t}', 'Quest complete: {t}', 'Misión cumplida: {t}', 'Missão concluída: {t}'),
    nouvelle: tr('Nouvelle quête : {t}', 'New quest: {t}', 'Nueva misión: {t}', 'Nova missão: {t}'),
    page: tr('Page {n} du carnet retrouvée !', 'Logbook page {n} found!', '¡Página {n} del diario encontrada!', 'Página {n} do diário encontrada!'),
    pageManque: tr('Page {n} : manquante', 'Page {n}: missing', 'Página {n}: perdida', 'Página {n}: faltando'),
    succes: tr('Succès : {t}', 'Feat unlocked: {t}', 'Logro: {t}', 'Conquista: {t}'),
    obtenus: tr('{n} sur {m}', '{n} of {m}', '{n} de {m}', '{n} de {m}'),
    retour: tr('Retour', 'Back', 'Volver', 'Voltar'),
    stats: [
      ['temps', tr('Temps de jeu', 'Play time', 'Tiempo de juego', 'Tempo de jogo')],
      ['best', tr('Record de profondeur', 'Deepest dive', 'Récord de profundidad', 'Recorde de profundidade')],
      ['mined', tr('Minerais extraits', 'Ores mined', 'Minerales extraídos', 'Minérios extraídos')],
      ['gems', tr('Gemmes', 'Gems', 'Gemas', 'Gemas')],
      ['earned', tr('Pièces gagnées', 'Coins earned', 'Monedas ganadas', 'Moedas ganhas')],
      ['kills', tr('Bestioles vaincues', 'Critters beaten', 'Bichos vencidos', 'Bichos vencidos')],
      ['bosses', tr('Gardiens vaincus', 'Guardians beaten', 'Guardianes vencidos', 'Guardiões vencidos')],
      ['wrecks', tr('Épaves (morts)', 'Wrecks (deaths)', 'Naufragios (muertes)', 'Destroços (mortes)')],
      ['dives', tr('Plongées', 'Dives', 'Inmersiones', 'Mergulhos')],
      ['crafts', tr('Objets fabriqués', 'Items crafted', 'Objetos fabricados', 'Itens fabricados')],
      ['trouves', tr('Objets trouvés', 'Items found', 'Objetos encontrados', 'Itens encontrados')],
      ['secrets', tr('Secrets découverts', 'Secrets found', 'Secretos descubiertos', 'Segredos descobertos')],
      ['explore', tr('Carte explorée', 'Map explored', 'Mapa explorado', 'Mapa explorado')],
    ],
    voirStats: tr('Statistiques', 'Statistics', 'Estadísticas', 'Estatísticas'),
    objectif: tr('Objectif', 'Goal', 'Objetivo', 'Objetivo'),
  };

  // ---------- sauvegarde : save.mods.progression ----------
  const defStats = () => ({ temps: 0, wrecks: 0, crafts: 0, trouves: 0, secrets: 0, bossEver: 0 });
  const def = () => ({ q: 0, annexes: {}, pages: 0, succes: [], stats: defStats() });
  G.field('progression', def, raw => {
    const d = def(); if (!raw || typeof raw !== 'object') return d;
    d.q = G.num(raw.q, 0, MAIN.length);
    const an = raw.annexes && typeof raw.annexes === 'object' ? raw.annexes : {};
    for (const a of ANNEXES) if (G.own(an, a.id) && (an[a.id] === 'active' || an[a.id] === 'done')) d.annexes[a.id] = an[a.id];
    d.pages = G.num(raw.pages, 0, (1 << PAGES.length) - 1);
    if (Array.isArray(raw.succes)) d.succes = SUCCES.map(s => s.id).filter(id => raw.succes.includes(id));
    const s = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
    for (const k of Object.keys(d.stats)) if (G.own(s, k)) d.stats[k] = G.num(s[k], 0, 1e12);
    return d;
  });
  const P = () => G.save.mods.progression;
  const actuelle = () => MAIN[P().q] || null;
  const terminee = id => { const i = MAIN.findIndex(q => q.id === id); return i >= 0 ? P().q > i : P().annexes[id] === 'done'; };
  const nbPages = () => (P().pages.toString(2).match(/1/g) || []).length;
  const nbBalises = () => (G.MOD.balises ? G.MOD.balises.liste().filter(b => G.MOD.balises.actif(b.i)).length : 0);
  const bossMask = () => P().stats.bossEver | G.save.bossDown;

  // ---------- valeurs comptées (succès, statistiques) ----------
  function valeur(stat) {
    const s = G.save, st = P().stats;
    switch (stat) {
      case 'mined': case 'gems': case 'kills': case 'earned': case 'dives': case 'stars': return s[stat] || 0;
      case 'bosses': return s.bosses || 0;
      case 'bestDepth': case 'best': return s.bestDepth || 0;
      case 'relics': return s.relics.length;
      case 'balises': return nbBalises();
      case 'pages': return nbPages();
      case 'explore': return G.MOD.carte ? G.MOD.carte.pourcent() : 0;
      case 'quetes': return P().q + Object.values(P().annexes).filter(v => v === 'done').length;
      default: return st[stat] || 0;
    }
  }

  // ---------- quêtes ----------
  function objectifAtteint(o) {
    switch (o.type) {
      case 'balise': return nbBalises() >= (o.n || 1);
      case 'gardien': return !!(bossMask() & (1 << o.z));
      case 'fabriquer': return P().stats.crafts >= (o.n || 1);
      case 'profondeur': return G.save.bestDepth >= o.m;
      default: return false;   // parler / objet : se terminent en parlant au personnage
    }
  }
  function donner(rec) {
    if (!rec) return;
    if (rec.pieces) { G.save.cash += rec.pieces; G.popText && G.p && G.popText(G.p.x, G.p.y - 14, '+' + rec.pieces, '#f6d743'); }
    for (const [id, n] of rec.objets || []) {
      const S = G.MOD.sac; if (!S) continue;
      const k = S.add(id, n);
      for (let i = k; i < n; i++) if (G.p) S.lacher(id, G.p.x, G.p.y - 6);   // sac plein : posé au sol
    }
    if (rec.page) { P().pages |= 1 << (rec.page - 1); P().stats.secrets++; G.toast(G.L(TXT.page, { n: rec.page })); }
  }
  function terminer(q, estPrincipale) {
    donner(q.recompense);
    if (estPrincipale) P().q++; else P().annexes[q.id] = 'done';
    G.banner(G.L(TXT.terminee, { t: G.L(q.titre) }), '#7fd05f', q.recompense && q.recompense.pieces ? '+' + q.recompense.pieces : '');
    G.sfx('relic'); G.emit('quest', q.id);
    const n = estPrincipale ? actuelle() : null;
    if (n) setTimeout(() => G.toast(G.L(TXT.nouvelle, { t: G.L(n.titre) })), 1800);
    G.writeSave();
  }
  let verifT = 0;
  G.on('tick', dt => {
    if (!G.save || !G.save.mods.progression) return;
    if (G.state === 'play') P().stats.temps += dt;
    verifT -= dt; if (verifT > 0) return; verifT = 0.5;
    if (!['play', 'base', 'shop'].includes(G.state)) return;
    const q = actuelle(); if (q && objectifAtteint(q.objectif)) terminer(q, true);
    for (const a of ANNEXES) if (P().annexes[a.id] === 'active' && objectifAtteint(a.objectif)) terminer(a, false);
    verifierSucces();
  });

  // Ce que dit un personnage quand on lui parle : { lignes, fin } (fin est appelé une fois le dialogue lu)
  function parler(pnj) {
    const S = G.MOD.sac, q = actuelle(), o = q && q.objectif;
    if (o && o.type === 'parler' && o.pnj === pnj && (!o.objet || (S && S.count(o.objet) >= (o.n || 1))))
      return { lignes: q.dialogue || [], fin: () => { if (o.objet && S) S.take(o.objet, o.n || 1); terminer(q, true); } };
    for (const a of ANNEXES) {
      if (a.pnj !== pnj) continue;
      const etat = P().annexes[a.id], ao = a.objectif;
      if (etat === 'active' && ao.type === 'objet' && S && S.count(ao.id) >= ao.n)
        return { lignes: a.dialogue || [], fin: () => { S.take(ao.id, ao.n); terminer(a, false); } };
      if (!etat && (!a.apres || terminee(a.apres)))
        return { lignes: a.offre || [], fin: () => { P().annexes[a.id] = 'active'; G.toast(G.L(TXT.nouvelle, { t: G.L(a.titre) })); G.sfx('buy'); G.writeSave(); } };
      if (etat === 'active') return { lignes: [a.texte], fin: null };
    }
    return null;
  }
  // un personnage a-t-il quelque chose de nouveau à dire ? (pour le « ! » au-dessus de sa tête)
  function aDuNouveau(pnj) {
    const r = parler(pnj); if (!r || !r.fin) return false;
    return true;
  }

  // ---------- succès ----------
  function verifierSucces() {
    const fait = P().succes;
    for (const s of SUCCES) {
      if (fait.includes(s.id)) continue;
      const ok = s.stat === 'quete' ? terminee(s.id_quete) : valeur(s.stat) >= s.n;
      if (ok) { fait.push(s.id); G.toast(G.L(TXT.succes, { t: G.L(s.nom) })); [784, 988, 1319].forEach((f, k) => setTimeout(() => G.tone(f, 0.25, 'square', 0.04), k * 80)); G.emit('succes', s.id); }
    }
  }

  // ---------- statistiques ----------
  G.on('wreck', () => { P().stats.wrecks++; });
  G.on('craft', () => { P().stats.crafts++; });
  G.on('pickup', () => { P().stats.trouves++; });
  G.on('cache', () => { P().stats.secrets++; });
  G.on('boss', z => { P().stats.bossEver |= 1 << z; });
  const duree = s => { s = Math.floor(s); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h ? `${h} H ${String(m).padStart(2, '0')} MIN` : `${m} MIN ${String(s % 60).padStart(2, '0')} S`; };
  function texteStat(k) {
    if (k === 'temps') return duree(P().stats.temps);
    if (k === 'best') return valeur('best') + ' M';
    if (k === 'explore') return valeur('explore') + ' %';
    if (k === 'bosses') return String(valeur('bosses'));
    return G.fmt(valeur(k));
  }

  // ---------- suivi de quête dans le HUD ----------
  G.on('hud', () => {
    const q = actuelle(); if (!q || G.boss || G.tut || G.state !== 'play' || G.UW < 200) return;
    const w = Math.min(G.UW * 0.5, 150), lignes = G.wrap(q.texte, w).slice(0, 2);
    G.ctx.globalAlpha = 0.85;
    lignes.forEach((l, i) => G.text(l, 4, 37 + i * 8, 1, i ? '#c9b78f' : '#f6d743'));
    G.ctx.globalAlpha = 1;
  });

  // ---------- écran Journal ----------
  const ui = { onglet: 0, page: 0 };
  function ouvrir(onglet = 0) {
    if (!['play', 'base', 'shop', 'menu', 'pause', 'win'].includes(G.state)) return;
    if (G.state === 'play' && (!G.p || G.p.dead || G.fade)) return;
    ui.onglet = onglet; ui.page = 0; G.openScreen('journal'); G.sfx('click');
  }
  const ouvrirCarnet = () => ouvrir(1);
  function blocTexte(t, x, y, w, max, col = '#fff3d6') { let n = 0; for (const l of G.wrap(t, w)) { if (n >= max) break; G.text(l, x, y + n * 9, 1, col); n++; } return n * 9; }
  function dessiner() {
    const { UW, UH } = G, S = G.STYLES;
    G.dim(0.86);
    let y = 3;
    G.button('close', UW - 17, 3, 14, 13, 'X', () => { G.closeScreen(); G.sfx('click'); }, S.wood);
    const tw = Math.min(60, (UW - 26) / 4);
    TXT.onglets.forEach((t, i) => G.button('tab_' + i, 4 + i * (tw + 1), y, tw, 13, t, () => { ui.onglet = i; ui.page = 0; }, ui.onglet === i ? S.gold : S.dark));
    y += 19;
    const w = Math.min(UW - 12, 260), x = UW / 2 - w / 2, bas = UH - 4;
    if (ui.onglet === 0) {
      G.text(TXT.principale, x, y, 1, '#f6d743'); y += 10;
      const q = actuelle();
      if (q) { G.text(G.fitText(q.titre, w), x, y, 1, '#fff3d6'); y += 9; y += blocTexte(q.texte, x, y, w, 3, '#c9d8f0') + 4; }
      else { y += blocTexte(TXT.finie, x, y, w, 2, '#7fd05f') + 4; }
      G.text(TXT.annexes, x, y, 1, '#f6d743'); y += 10;
      const act = ANNEXES.filter(a => P().annexes[a.id] === 'active');
      if (!act.length) y += blocTexte(TXT.aucune, x, y, w, 2, '#8f8aa3');
      for (const a of act) { if (y > bas - 18) break; G.text(G.fitText(a.titre, w), x, y, 1, '#fff3d6'); y += 9; const o = a.objectif; let t = G.L(a.texte); if (o.type === 'objet' && G.MOD.sac) t += ` (${Math.min(G.MOD.sac.count(o.id), o.n)}/${o.n})`; y += blocTexte(t, x, y, w, 2, '#c9d8f0') + 3; }
      const done = ANNEXES.filter(a => P().annexes[a.id] === 'done').length + P().q;
      G.text(G.L(TXT.obtenus, { n: done, m: MAIN.length + ANNEXES.length }), UW - 6, bas - 8, 1, '#8f8aa3', 'right');
    } else if (ui.onglet === 1) {
      const n = PAGES.length; ui.page = G.clamp(ui.page, 0, n - 1);
      const eu = P().pages & (1 << ui.page);
      G.icon('logbook', x + 4, y + 3); G.text(G.L(TXT.onglets[1]) + ' - ' + (ui.page + 1) + '/' + n, x + 10, y, 1, '#f6d743'); y += 13;
      G.panel(x, y, w, Math.max(30, bas - y - 22), S.wood);
      if (eu) blocTexte(PAGES[ui.page], x + 5, y + 5, w - 10, Math.floor((bas - y - 30) / 9), '#fff3d6');
      else G.text(G.L(TXT.pageManque, { n: ui.page + 1 }), x + w / 2, y + 8, 1, '#e8d2b0', 'center');
      G.button('pg_prev', UW / 2 - 40, bas - 16, 30, 14, '<', () => { ui.page--; }, S.dark, { disabled: ui.page <= 0 });
      G.button('pg_next', UW / 2 + 10, bas - 16, 30, 14, '>', () => { ui.page++; }, S.dark, { disabled: ui.page >= n - 1 });
    } else if (ui.onglet === 2) {
      const fait = P().succes, cols = UW >= 330 ? 2 : 1, cw = Math.min(150, (UW - 12) / cols - 3), rh = 20;
      G.text(G.L(TXT.obtenus, { n: fait.length, m: SUCCES.length }), x, y, 1, '#c9b78f'); y += 11;
      const parPage = Math.max(cols, Math.floor((bas - y - 18) / rh) * cols), pages = Math.ceil(SUCCES.length / parPage);
      ui.page = G.clamp(ui.page, 0, pages - 1);
      const x0 = UW / 2 - (cols * (cw + 3) - 3) / 2;
      SUCCES.slice(ui.page * parPage, (ui.page + 1) * parPage).forEach((s, i) => {
        const ok = fait.includes(s.id), cx = x0 + (i % cols) * (cw + 3), cy = y + Math.floor(i / cols) * rh;
        G.panel(cx, cy, cw, rh - 2, ok ? S.steel : S.dark);
        if (ok) G.icon(s.icon, cx + 9, cy + 9); else G.icon('lock', cx + 9, cy + 9);
        G.text(G.fitText(s.nom, cw - 20), cx + 17, cy + 2, 1, ok ? '#f6d743' : '#8f8aa3');
        const prog = s.stat === 'quete' ? '' : ` ${G.fmt(Math.min(valeur(s.stat), s.n))}/${G.fmt(s.n)}`;
        G.text(G.fitText(G.L(s.desc) + (ok ? '' : prog), cw - 20), cx + 17, cy + 10, 1, ok ? '#c9d8f0' : '#6b6875');
      });
      if (pages > 1) {
        G.button('pg_prev', UW / 2 - 40, bas - 16, 30, 14, '<', () => { ui.page--; }, S.dark, { disabled: ui.page <= 0 });
        G.button('pg_next', UW / 2 + 10, bas - 16, 30, 14, '>', () => { ui.page++; }, S.dark, { disabled: ui.page >= pages - 1 });
      }
    } else {
      const rh = UH < 220 ? 9 : 11, cols = UH < 220 && UW >= 300 ? 2 : 1, cw = cols === 2 ? (w - 8) / 2 : w;
      TXT.stats.forEach(([k, lab], i) => {
        const cx = x + (cols === 2 ? (i % 2) * (cw + 8) : 0), cy = y + Math.floor(i / cols) * rh;
        if (cy > bas - 8) return;
        G.text(G.fitText(lab, cw - 60), cx, cy, 1, '#c9b78f'); G.text(texteStat(k), cx + cw, cy, 1, '#fff3d6', 'right');
      });
    }
  }
  G.SCREENS.journal = { draw: dessiner };
  G.on('key', k => {
    if (G.state === 'journal') {
      if (G.isBind('journal', k) || k === 'Escape' || k === 'Backspace') { G.closeScreen(); G.sfx('click'); }
      else if (k === 'Tab' || k === 'KeyQ' || k === 'KeyE') ui.onglet = (ui.onglet + (k === 'KeyQ' ? 3 : 1)) % 4, ui.page = 0;
      else if (k === 'ArrowRight' || k === 'KeyD') ui.page++;
      else if (k === 'ArrowLeft' || k === 'KeyA') ui.page = Math.max(0, ui.page - 1);
      return true;
    }
    if ((G.state === 'play' || G.state === 'base') && G.isBind('journal', k)) { ouvrir(0); return true; }
    return false;
  });
  G.on('buttons', (where, list) => {
    if (where === 'pause' || where === 'base') list.push({ id: 'journal', label: TXT.journal, fn: () => ouvrir(0), icon: 'journal', st: G.STYLES.steel });
    if (where === 'menu') list.push({ id: 'feats', label: TXT.onglets[2], fn: () => ouvrir(2), icon: 'trophy', st: G.STYLES.steel });
    if (where === 'win') list.push({ id: 'stats', label: TXT.voirStats, fn: () => ouvrir(3), icon: 'journal', st: G.STYLES.steel });
  });
  G.on('loaded', () => { verifT = 1; });

  return { nom: 'progression', parler, aDuNouveau, ouvrir, ouvrirCarnet, actuelle, valeur, terminee };
});
