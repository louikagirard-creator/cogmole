// ============================================================
//  Module « artisanat » : fabriquer des objets à l'atelier
//  Les recettes (data/recettes.json) combinent des matériaux du sac (et parfois des pièces).
//  Accessible depuis la base et l'atelier (bouton Fabriquer).
// ============================================================
(window.COG_MODULES = window.COG_MODULES || []).push(function artisanat(G) {
  'use strict';
  const RECETTES = G.DATA.recettes.liste;
  const tr = (fr, en, es, pt) => ({ fr, en, es, pt });
  const TXT = {
    titre: tr('Fabriquer', 'Craft', 'Fabricar', 'Fabricar'),
    fabriquer: tr('Fabriquer', 'Craft', 'Fabricar', 'Fabricar'),
    manque: tr('Il manque des matériaux', 'Missing materials', 'Faltan materiales', 'Faltam materiais'),
    deja: tr('Possédé', 'Owned', 'Ya lo tienes', 'Já tem'),
    plein: tr('Sac plein !', 'Bag full!', '¡Mochila llena!', 'Mochila cheia!'),
    fait: tr('Fabriqué : {t}', 'Crafted: {t}', 'Fabricado: {t}', 'Fabricado: {t}'),
    retour: tr('Retour', 'Back', 'Volver', 'Voltar'),
    astuce: tr('Les matériaux tombent des créatures, des rochers instables et du cristal.', 'Materials drop from critters, loose boulders and crystal.', 'Los materiales caen de criaturas, rocas sueltas y cristal.', 'Os materiais caem de criaturas, pedras soltas e cristal.'),
  };
  const S = () => G.MOD.sac;
  const visibles = () => RECETTES.filter(r => !r.apres || (G.MOD.progression && G.MOD.progression.terminee(r.apres)));
  const possede = id => S().count(id) > 0 || G.save.mods.sac.equip.includes(id);
  function etat(r) {
    const [id, n] = r.resultat, I = S().def(id);
    if (!I) return 'invalide';
    if (I.type === 'equipement' && possede(id)) return 'deja';
    if (r.ingredients.some(([m, k]) => S().count(m) < k) || G.save.cash < (r.pieces || 0)) return 'manque';
    // place dans le sac une fois les ingrédients retirés (approximation prudente : il faut la place sans eux)
    if (!S().canAdd(id, n)) return 'plein';
    return 'ok';
  }
  function fabriquer(r) {
    const e = etat(r);
    if (e !== 'ok') { G.toast(e === 'deja' ? TXT.deja : e === 'plein' ? TXT.plein : TXT.manque); G.sfx('deny'); return; }
    for (const [m, k] of r.ingredients) S().take(m, k);
    G.save.cash -= r.pieces || 0;
    const [id, n] = r.resultat; S().add(id, n);
    G.toast(G.L(TXT.fait, { t: S().nomObjet(id) })); G.sfx('buy');
    G.emit('craft', id); G.writeSave();
  }

  const ui = { page: 0, sel: 0 };
  function dessiner() {
    const { UW, UH } = G, St = G.STYLES;
    G.dim(0.82);
    G.textOutline(TXT.titre, UW / 2, 4, UW < 200 ? 1 : 2, '#f6d743');
    G.coinLabel(UW - 22, 6, G.save.cash);
    G.button('close', UW - 17, 3, 14, 13, 'X', () => { G.closeScreen(); G.sfx('click'); }, St.wood);
    let y = UW < 200 ? 17 : 26;
    const rs = visibles(), cols = UW >= 340 ? 2 : 1, cw = Math.min(170, (UW - 10) / cols - 3), rh = 31;
    const parPage = Math.max(cols, Math.floor((UH - y - 34) / rh) * cols), pages = Math.ceil(rs.length / parPage);
    ui.page = G.clamp(ui.page, 0, pages - 1);
    const x0 = UW / 2 - (cols * (cw + 3) - 3) / 2;
    rs.slice(ui.page * parPage, (ui.page + 1) * parPage).forEach((r, i) => {
      const [id, n] = r.resultat, I = S().def(id), e = etat(r), cx = x0 + (i % cols) * (cw + 3), cy = y + Math.floor(i / cols) * rh;
      G.panel(cx, cy, cw, rh - 3, e === 'ok' ? St.steel : St.dark);
      G.icon(I.icon, cx + 9, cy + 9);
      G.text(G.fitText(G.L(I.name) + (n > 1 ? ' X' + n : ''), cw - 78), cx + 17, cy + 3, 1, e === 'ok' ? '#f6d743' : '#c9c6d1');
      // ingrédients : icône + possédé/nécessaire
      let ix = cx + 17;
      for (const [m, k] of r.ingredients) {
        const ok = S().count(m) >= k, lab = `${Math.min(S().count(m), 99)}/${k}`;
        if (ix + 8 + G.textW(lab) > cx + cw - 64) break;
        G.icon(S().def(m).icon, ix + 3, cy + 16); G.text(lab, ix + 8, cy + 13, 1, ok ? '#7fd05f' : '#ff9a8a'); ix += 12 + G.textW(lab);
      }
      if (r.pieces) G.coinLabel(cx + cw - 62, cy + 13, r.pieces, 'right', 1, G.save.cash >= r.pieces ? '#f6d743' : '#ff9a8a');
      const lab = e === 'deja' ? TXT.deja : TXT.fabriquer;
      // bouton : icône marteau (ou cadenas) et libellé dessous
      G.button('craft_' + r.id, cx + cw - 58, cy + 2, 56, 24, '', () => fabriquer(r), e === 'ok' ? St.green : St.grey, { disabled: e === 'deja' || e === 'invalide' });
      G.icon(e === 'deja' ? 'lock' : 'hammer', cx + cw - 30, cy + 9); G.text(G.fitText(lab, 54), cx + cw - 30, cy + 15, 1, e === 'ok' ? '#fff3d6' : '#c9c6d1', 'center');
    });
    const by = UH - 18;
    if (pages > 1) {
      G.button('cp_prev', 6, by, 20, 14, '<', () => { ui.page--; }, St.dark, { disabled: ui.page <= 0 });
      G.text((ui.page + 1) + '/' + pages, 36, by + 3, 1, '#c9b78f', 'center');
      G.button('cp_next', 46, by, 20, 14, '>', () => { ui.page++; }, St.dark, { disabled: ui.page >= pages - 1 });
    }
    const hy = y + Math.min(parPage, rs.length - ui.page * parPage) / cols * rh + 2;
    if (hy < by - 10) G.text(G.fitText(TXT.astuce, UW - 10), UW / 2, hy, 1, '#8f8aa3', 'center');
    G.button('back', UW - 64, by, 60, 14, TXT.retour, () => { G.closeScreen(); G.sfx('click'); }, St.wood);
  }
  G.SCREENS.craft = { draw: dessiner };
  const ouvrir = () => { ui.page = 0; G.openScreen('craft'); G.sfx('click'); };
  G.on('key', k => {
    if (G.state !== 'craft') return false;
    if (k === 'Escape' || k === 'Backspace') G.closeScreen();
    else if (k === 'ArrowRight' || k === 'PageDown') ui.page++;
    else if (k === 'ArrowLeft' || k === 'PageUp') ui.page = Math.max(0, ui.page - 1);
    return true;
  });
  G.on('buttons', (where, list) => {
    if (where === 'base' || where === 'shop') list.push({ id: 'craft', label: TXT.titre, fn: ouvrir, icon: 'hammer', st: G.STYLES.steel });
    if (where === 'base') {
      list.push({ id: 'bag_b', label: G.L({ fr: 'Sac', en: 'Bag', es: 'Mochila', pt: 'Mochila' }), fn: () => S().ouvrir(), icon: 'bag', st: G.STYLES.steel });
      if (G.MOD.carte) list.push({ id: 'map_b', label: G.L({ fr: 'Carte', en: 'Map', es: 'Mapa', pt: 'Mapa' }), fn: () => G.MOD.carte.ouvrir('base'), icon: 'map', st: G.STYLES.steel });
    }
  });

  return { nom: 'artisanat', ouvrir, fabriquer, etat };
});
