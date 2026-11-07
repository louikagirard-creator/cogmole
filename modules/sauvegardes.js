// ============================================================
//  Module « sauvegardes » : 3 emplacements de sauvegarde
//  - Emplacement 1 = l'ancienne sauvegarde (cogmole_save_v1) : rien n'est perdu pour les joueurs existants.
//  - Emplacements 2 et 3 : cogmole_save_v1_s2 / _s3. L'emplacement actif est retenu dans cogmole_meta_v1.
//  - Sur CrazyGames, tout passe par le module Data du SDK (sauvegarde dans le cloud), sinon localStorage.
//  - Bouton « Sauvegarder » dans la pause ; la partie se sauvegarde aussi toute seule (base, balises, toutes les 12 s).
// ============================================================
(window.COG_MODULES = window.COG_MODULES || []).push(function sauvegardes(G) {
  'use strict';
  const META = 'cogmole_meta_v1', NB = 3;
  const cle = n => (n === 1 ? 'cogmole_save_v1' : 'cogmole_save_v1_s' + n);
  const tr = (fr, en, es, pt) => ({ fr, en, es, pt });
  const TXT = {
    titre: tr('Sauvegardes', 'Saves', 'Partidas', 'Jogos salvos'),
    emplacement: tr('Emplacement {n}', 'Slot {n}', 'Ranura {n}', 'Espaço {n}'),
    actif: tr('En cours', 'Current', 'Actual', 'Atual'),
    vide: tr('Vide : nouvelle partie', 'Empty: new game', 'Vacía: partida nueva', 'Vazio: novo jogo'),
    charger: tr('Charger', 'Load', 'Cargar', 'Carregar'),
    nouvelle: tr('Commencer', 'Start', 'Empezar', 'Começar'),
    effacer: tr('Effacer', 'Delete', 'Borrar', 'Apagar'),
    sur: tr('Sûr ?', 'Sure?', '¿Seguro?', 'Certeza?'),
    retour: tr('Retour', 'Back', 'Volver', 'Voltar'),
    sauver: tr('Sauvegarder', 'Save', 'Guardar', 'Salvar'),
    sauve: tr('Partie sauvegardée', 'Game saved', 'Partida guardada', 'Jogo salvo'),
    charge: tr('Emplacement {n} chargé', 'Slot {n} loaded', 'Ranura {n} cargada', 'Espaço {n} carregado'),
    efface: tr('Emplacement effacé', 'Slot deleted', 'Ranura borrada', 'Espaço apagado'),
    resume: tr('Exp. {e} - record {d} M - {c} pièces', 'Exp. {e} - best {d} M - {c} coins', 'Exp. {e} - récord {d} M - {c} monedas', 'Exp. {e} - recorde {d} M - {c} moedas'),
    temps: tr('{t} de jeu - {g}/4 gardiens', '{t} played - {g}/4 guardians', '{t} jugado - {g}/4 guardianes', '{t} jogado - {g}/4 guardiões'),
    menu: tr('Sauvegardes', 'Saves', 'Partidas', 'Salvos'),
  };
  let actif = 1;
  // date de la dernière sauvegarde, gardée dans la partie elle-même
  G.field('quand', () => 0, raw => G.num(raw, 0, 9e15));
  G.on('save', () => { G.save.mods.quand = Date.now(); });
  G.on('boot', () => {
    try { const m = JSON.parse(G.sdk.getItem(META) || '{}'); actif = G.num(m && m.slot, 1, NB, 1); } catch (e) { actif = 1; }
    G.saveKey = cle(actif);
  });

  // lecture d'un emplacement sans le charger (pour l'écran de choix)
  function apercu(n) {
    try {
      const raw = G.sdk.getItem(cle(n)); if (!raw || raw.length > 40000) return null;
      const d = JSON.parse(raw); if (!d || typeof d !== 'object') return null;
      const stats = d.mods && d.mods.progression && d.mods.progression.stats;
      return {
        stars: G.num(d.stars, 0, 99), best: G.num(d.bestDepth, 0, 9999), cash: G.num(d.cash, 0, 1e12),
        boss: (G.num(d.bossDown, 0, 15).toString(2).match(/1/g) || []).length,
        temps: stats ? G.num(stats.temps, 0, 1e9) : 0, quand: d.mods ? G.num(d.mods.quand, 0, 9e15) : 0,
      };
    } catch (e) { return null; }
  }
  const duree = s => { const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60; return h ? `${h} H ${String(m).padStart(2, '0')}` : `${m} MIN`; };
  const date = t => { if (!t) return ''; const d = new Date(t); return `${d.getDate()}/${d.getMonth() + 1} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`; };

  function sauver() { G.writeSave(); G.toast(TXT.sauve); G.sfx('buy'); }
  function changer(n) {
    if (n === actif) return;
    G.writeSave();   // garde l'emplacement quitté à jour
    actif = n; G.saveKey = cle(n);
    try { G.sdk.setItem(META, JSON.stringify({ slot: n })); } catch (e) {}
    recharger();
    G.toast(G.L(TXT.charge, { n })); G.sfx('relic');
  }
  function recharger() {
    G.loadSave(); G.loadWorld(); G.clearEntities(); G.newPlayer();
    G.tut = G.save.tutorialDone ? null : { step: 0, t: 0 };
    G.emit('loaded'); G.checkDaily();
  }
  function effacer(n) {
    try { G.sdk.setItem(cle(n), ''); } catch (e) {}
    if (n === actif) recharger();
    G.toast(TXT.efface); G.sfx('crumble');
  }

  // ---------- écran ----------
  const ui = { confirme: 0, cache: null, cacheT: -1 };
  function dessiner() {
    const { UW, UH } = G, S = G.STYLES;
    G.dim(0.85);
    let y = 4;
    G.textOutline(TXT.titre, UW / 2, y, UW < 200 ? 1 : 2, '#f6d743'); y += UW < 200 ? 15 : 24;
    if (G.time - ui.cacheT > 1 || !ui.cache) { ui.cache = [1, 2, 3].map(apercu); ui.cacheT = G.time; }
    const w = Math.min(UW - 10, 220), x = UW / 2 - w / 2, h = Math.min(52, Math.floor((UH - y - 26) / NB) - 3);
    for (let n = 1; n <= NB; n++) {
      const a = ui.cache[n - 1], cur = n === actif, yy = y + (n - 1) * (h + 3);
      G.panel(x, yy, w, h, cur ? S.steel : S.dark);
      G.text(G.L(TXT.emplacement, { n }) + (cur ? ' - ' + G.L(TXT.actif) : ''), x + 5, yy + 4, 1, cur ? '#f6d743' : '#fff3d6');
      if (a && h >= 34) {
        G.text(G.fitText(G.L(TXT.resume, { e: a.stars + 1, d: a.best, c: G.fmt(a.cash) }), w - 10), x + 5, yy + 13, 1, '#c9d8f0');
        G.text(G.fitText(G.L(TXT.temps, { t: duree(a.temps), g: a.boss }) + (a.quand ? ' - ' + date(a.quand) : ''), w - 10), x + 5, yy + 22, 1, '#8f8aa3');
      } else if (!a) G.text(TXT.vide, x + 5, yy + 13, 1, '#8f8aa3');
      const by = yy + h - 15, bw = Math.max(58, G.textW(a ? TXT.charger : TXT.nouvelle) + 10, G.textW(TXT.effacer) + 10);
      if (!cur) G.button('slot_load' + n, x + w - bw - 4, by, bw, 12, a ? TXT.charger : TXT.nouvelle, () => { ui.confirme = 0; changer(n); }, S.green);
      if (a) G.button('slot_del' + n, x + w - (cur ? 1 : 2) * (bw + 4), by, bw, 12, ui.confirme === n ? TXT.sur : TXT.effacer, () => { if (ui.confirme === n) { ui.confirme = 0; effacer(n); ui.cacheT = -9; } else ui.confirme = n; }, S.grey);
    }
    G.button('back', UW / 2 - 40, UH - 19, 80, 16, TXT.retour, () => { ui.confirme = 0; G.closeScreen(); G.sfx('click'); }, S.wood);
  }
  G.SCREENS.slots = { draw: dessiner };
  G.on('key', k => {
    if (G.state !== 'slots') return false;
    if (k === 'Escape' || k === 'Backspace') G.closeScreen();
    return true;
  });
  G.on('buttons', (where, list) => {
    if (where === 'menu') list.push({ id: 'slots', label: TXT.menu, fn: () => { ui.cacheT = -9; G.openScreen('slots'); G.sfx('click'); }, icon: 'disk', st: G.STYLES.steel });
    if (where === 'pause') list.push({ id: 'savenow', label: TXT.sauver, fn: sauver, icon: 'disk', st: G.STYLES.steel });
  });

  return { nom: 'sauvegardes', get actif() { return actif; }, sauver, changer, cle };
});
