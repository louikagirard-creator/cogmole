// ============================================================
//  Module « sac » : le sac à dos de Cog
//  - un nombre limité d'emplacements (8 au départ, agrandi par les sacs trouvés ou fabriqués)
//  - chaque emplacement contient un objet et sa quantité (jusqu'à « pile » par emplacement)
//  - 2 emplacements d'équipement (bonus permanents tant qu'ils sont portés)
//  - une barre rapide de 5 objets toujours visible (touches 1 à 5)
//  - les matériaux lâchés par les créatures et la roche, ramassés en passant dessus
//  Les objets eux-mêmes sont décrits dans data/objets.json.
// ============================================================
(window.COG_MODULES = window.COG_MODULES || []).push(function sac(G) {
  'use strict';
  const D = G.DATA.objets, DEF = D.liste, IDS = Object.keys(DEF);
  const NB_BARRE = 5, NB_EQUIP = D.emplacementsEquipement || 2, CAP_MAX = 24;
  const tr = (fr, en, es, pt) => ({ fr, en, es, pt });
  const TXT = {
    titre: tr('Sac à dos', 'Backpack', 'Mochila', 'Mochila'),
    fermer: tr('Fermer', 'Close', 'Cerrar', 'Fechar'),
    utiliser: tr('Utiliser', 'Use', 'Usar', 'Usar'),
    lire: tr('Lire', 'Read', 'Leer', 'Ler'),
    equiper: tr('Équiper', 'Equip', 'Equipar', 'Equipar'),
    retirer: tr('Retirer', 'Remove', 'Quitar', 'Tirar'),
    jeter: tr('Jeter', 'Drop', 'Tirar', 'Jogar fora'),
    sur: tr('Sûr ?', 'Sure?', '¿Seguro?', 'Certeza?'),
    equipe: tr('Équipé', 'Equipped', 'Equipado', 'Equipado'),
    barre: tr('Barre', 'Bar', 'Barra', 'Barra'),
    vide: tr('Emplacement vide', 'Empty slot', 'Hueco vacío', 'Espaço vazio'),
    videAide: tr('Les matériaux tombent des créatures et de la roche. Passe dessus pour les ramasser.', 'Materials drop from critters and rock. Drive over them to pick them up.', 'Los materiales caen de las criaturas y la roca. Pasa por encima para recogerlos.', 'Os materiais caem das criaturas e da rocha. Passe por cima para pegar.'),
    plein: tr('Sac plein !', 'Bag full!', '¡Mochila llena!', 'Mochila cheia!'),
    pasIci: tr('Pas ici : utilise-le en creusant', 'Not here: use it while digging', 'Aquí no: úsalo mientras cavas', 'Aqui não: use enquanto cava'),
    agrandi: tr('Sac agrandi : {n} emplacements !', 'Bag enlarged: {n} slots!', 'Mochila ampliada: {n} huecos!', 'Mochila ampliada: {n} espaços!'),
    dejaGrand: tr('Ton sac est déjà aussi grand', 'Your bag is already that big', 'Tu mochila ya es así de grande', 'Sua mochila já é desse tamanho'),
    equipePlein: tr('Retire d\'abord un équipement', 'Remove a gear first', 'Quita primero un equipo', 'Tire um equipamento antes'),
    bouclier: tr('Bouclier activé !', 'Shield on!', '¡Escudo activado!', 'Escudo ativado!'),
    fusee: tr('Fusée plantée', 'Flare planted', 'Bengala colocada', 'Sinalizador colocado'),
    aideTouches: tr('1-5 : barre rapide', '1-5: quick bar', '1-5: barra rápida', '1-5: barra rápida'),
    types: { conso: tr('Consommable', 'Consumable', 'Consumible', 'Consumível'), materiau: tr('Matériau', 'Material', 'Material', 'Material'),
      quete: tr('Objet de quête', 'Quest item', 'Objeto de misión', 'Item de missão'), equipement: tr('Équipement', 'Gear', 'Equipo', 'Equipamento'), sac: tr('Sac', 'Bag', 'Mochila', 'Mochila') },
  };

  // ---------- données sauvegardées : save.mods.sac ----------
  const vide = cap => ({ cap, slots: Array(cap).fill(null), hot: Array(NB_BARRE).fill(null), equip: Array(NB_EQUIP).fill(null) });
  function nouveau() {
    const b = vide(D.capaciteDepart);
    (D.barreDepart || []).slice(0, NB_BARRE).forEach((id, i) => { if (DEF[id]) b.hot[i] = id; });
    for (const [id, n] of D.depart || []) ajouterDans(b, id, n);
    return b;
  }
  // nettoie une sauvegarde (rien ne doit pouvoir casser le jeu, même un fichier modifié à la main)
  function charger(raw, ancienne) {
    if (!raw || typeof raw !== 'object') {
      const b = nouveau();
      // ancienne sauvegarde (avant le sac) : reprend les objets qu'elle comptait
      const it = ancienne && G.own(ancienne, 'items') && ancienne.items && typeof ancienne.items === 'object' ? ancienne.items : null;
      if (it) for (const id of ['bomb', 'can', 'kit', 'tele']) if (G.own(it, id)) { retirerDe(b, id, compterDans(b, id)); ajouterDans(b, id, G.num(it[id], 0, 9)); }
      return b;
    }
    const cap = G.num(raw.cap, D.capaciteDepart, CAP_MAX, D.capaciteDepart), b = vide(cap);
    const sl = Array.isArray(raw.slots) ? raw.slots : [];
    for (let i = 0; i < cap; i++) {
      const c = sl[i];
      if (c && typeof c === 'object' && typeof c.id === 'string' && G.own(DEF, c.id)) { const n = G.num(c.n, 0, DEF[c.id].pile); if (n > 0) b.slots[i] = { id: c.id, n }; }
    }
    const hot = Array.isArray(raw.hot) ? raw.hot : [];
    for (let i = 0; i < NB_BARRE; i++) if (typeof hot[i] === 'string' && G.own(DEF, hot[i])) b.hot[i] = hot[i];
    const eq = Array.isArray(raw.equip) ? raw.equip : [];
    for (let i = 0; i < NB_EQUIP; i++) if (typeof eq[i] === 'string' && G.own(DEF, eq[i]) && DEF[eq[i]].type === 'equipement' && !b.equip.includes(eq[i])) b.equip[i] = eq[i];
    return b;
  }
  G.field('sac', nouveau, charger);
  const bag = () => G.save.mods.sac;

  // ---------- opérations sur un sac ----------
  function compterDans(b, id) { let n = 0; for (const c of b.slots) if (c && c.id === id) n += c.n; return n; }
  function placeDans(b, id) {   // combien de cet objet peuvent encore entrer
    const pile = DEF[id].pile; let n = 0;
    for (const c of b.slots) { if (!c) n += pile; else if (c.id === id) n += pile - c.n; }
    return n;
  }
  function ajouterDans(b, id, n) {   // remplit d'abord les piles existantes ; renvoie combien sont entrés
    if (!DEF[id] || n <= 0) return 0;
    const pile = DEF[id].pile; let reste = n;
    for (const c of b.slots) if (reste > 0 && c && c.id === id && c.n < pile) { const k = Math.min(reste, pile - c.n); c.n += k; reste -= k; }
    for (let i = 0; i < b.slots.length && reste > 0; i++) if (!b.slots[i]) { const k = Math.min(reste, pile); b.slots[i] = { id, n: k }; reste -= k; }
    return n - reste;
  }
  function retirerDe(b, id, n) {   // prend d'abord dans les plus petites piles
    if (compterDans(b, id) < n) return false;
    let reste = n;
    const idx = b.slots.map((c, i) => i).filter(i => b.slots[i] && b.slots[i].id === id).sort((a, c) => b.slots[a].n - b.slots[c].n);
    for (const i of idx) { if (reste <= 0) break; const k = Math.min(reste, b.slots[i].n); b.slots[i].n -= k; reste -= k; if (!b.slots[i].n) b.slots[i] = null; }
    return true;
  }
  const count = id => compterDans(bag(), id);
  const canAdd = (id, n = 1) => !!DEF[id] && placeDans(bag(), id) >= n;
  const add = (id, n = 1) => { const k = ajouterDans(bag(), id, n); if (k) G.emit('item', id, k); return k; };
  const take = (id, n = 1) => retirerDe(bag(), id, n);
  const bonus = effet => { let v = 0; for (const id of bag().equip) if (id && DEF[id].effet === effet) v += DEF[id].valeur || 0; return v; };
  const nom = id => G.L(DEF[id].name);

  // ---------- effets des objets ----------
  const flares = [];   // fusées plantées : { x, y, vy, t, max, r }
  function use(id, depuisSac = false) {
    const I = DEF[id], p = G.p;
    if (!I || count(id) <= 0) return false;
    const enJeu = G.state === 'play' && p && !p.dead && !G.fade;
    const fx = I.effet;
    if (fx === 'sac') {
      if (I.valeur <= bag().cap) { G.toast(TXT.dejaGrand); G.sfx('deny'); return false; }
      take(id); const b = bag(); while (b.slots.length < Math.min(CAP_MAX, I.valeur)) b.slots.push(null); b.cap = b.slots.length;
      G.toast(G.L(TXT.agrandi, { n: b.cap })); G.sfx('relic'); G.writeSave(); return true;
    }
    if (fx === 'lire') { if (G.MOD.progression) G.MOD.progression.ouvrirCarnet(); return true; }
    if (I.type === 'equipement') return equiper(id);
    if (!['bombe', 'carburant', 'reparation', 'teleport', 'fusee', 'bouclier'].includes(fx)) return false;
    if (!enJeu) { if (depuisSac) { G.toast(TXT.pasIci); G.sfx('deny'); } return false; }
    if (fx === 'carburant' && p.fuel >= G.st.fuel() - 0.5) { G.toast('TANK IS FULL'); return false; }
    if (fx === 'reparation' && p.hull >= G.st.hull()) { G.toast('HULL IS FINE'); return false; }
    if (fx === 'teleport' && p.y < 4) return false;
    take(id);
    if (fx === 'bombe') { G.E.bombs.push({ x: p.x, y: p.y, vy: 0, t: 1.6 }); G.sfx('fuse'); G.toast('BOMB! GET AWAY'); }
    else if (fx === 'carburant') { p.fuel = Math.min(G.st.fuel(), p.fuel + G.st.fuel() * (I.valeur || 0.5)); G.sfx('buy'); G.burst(p.x, p.y - 6, '#ffb03a', 8, 0.5); }
    else if (fx === 'reparation') { p.hull = Math.min(G.st.hull(), p.hull + G.st.hull() * (I.valeur || 0.5)); G.sfx('buy'); G.burst(p.x, p.y - 6, '#d4d6dc', 8, 0.5); }
    else if (fx === 'teleport') G.warp(G.BASE_X, 0);
    else if (fx === 'fusee') { flares.push({ x: p.x + p.face * 6, y: p.y - 6, vy: -40, t: I.duree || 30, max: I.duree || 30, r: I.valeur || 110 }); G.sfx('fuse'); G.toast(TXT.fusee); }
    else if (fx === 'bouclier') { p.shield = I.duree || 8; G.sfx('relic'); G.toast(TXT.bouclier); }
    G.emit('used', id);
    return true;
  }
  function useHot(i) { const id = bag().hot[i]; if (id) use(id); }
  function equiper(id) {
    const b = bag();
    if (b.equip.includes(id)) return false;
    const libre = b.equip.indexOf(null);
    if (libre < 0) { G.toast(TXT.equipePlein); G.sfx('deny'); return false; }
    take(id); b.equip[libre] = id; G.sfx('buy'); G.emit('equip', id); G.writeSave(); return true;
  }
  function retirer(i) {
    const b = bag(), id = b.equip[i]; if (!id) return;
    if (!canAdd(id)) { G.toast(TXT.plein); G.sfx('deny'); return; }
    b.equip[i] = null; add(id); G.sfx('click'); G.writeSave();
  }
  function buy(id) {
    const I = DEF[id]; if (!I || !I.prix) return;
    if (!canAdd(id)) { G.toast('FULL'); G.sfx('deny'); return; }
    if (G.save.cash < I.prix) { G.toast('NOT ENOUGH COINS'); G.sfx('deny'); return; }
    G.save.cash -= I.prix; add(id); G.sfx('buy'); G.writeSave();
  }
  const shopIds = () => IDS.filter(id => DEF[id].prix > 0);

  // ---------- matériaux lâchés dans le monde ----------
  const drops = [];   // { x, y, vx, vy, id, n, t, grounded }
  function lacher(id, x, y, n = 1) { if (DEF[id] && drops.length < 40) drops.push({ x, y, vx: G.rand(-40, 40), vy: G.rand(-100, -50), id, n, t: 0, grounded: false }); }
  G.on('kill', e => { const d = G.EDEF[e.type]; if (d && d.drop && Math.random() < (d.dropChance || 0)) lacher(d.drop, e.x, e.y - 4); });
  G.on('tile', (t, c, r, cause) => {
    const T = G.T, x = c * G.TILE + 5, y = r * G.TILE + 5;
    if (t === T.BOULDER && Math.random() < 0.6) lacher('scrap', x, y);
    else if ((t === T.STONE || t === T.GRANITE) && Math.random() < 0.03) lacher('scrap', x, y);
    else if (t === T.CRYST && Math.random() < 0.06) lacher('crystal', x, y);
  });
  G.on('cache', () => { add('scrap', 3); });
  G.on('expedition', () => { drops.length = 0; flares.length = 0; add('bomb', 1); add('can', 1); });
  let pleinDit = 0;
  G.on('update', dt => {
    const p = G.p;
    for (const k of drops) {
      k.t += dt;
      const dx = p.x - k.x, dy = p.y - 4 - k.y, d = Math.hypot(dx, dy) || 1, aimant = 26 * Math.max(1, G.bonus('aimant'));
      const libre = canAdd(k.id, k.n);
      if (k.t > 0.5 && d < aimant && !p.dead && libre) { const s = Math.min(d, 150 * dt + d * 6 * dt); k.x += dx / d * s; k.y += dy / d * s; }
      else { k.vy += 300 * dt; k.vx *= 0.97; const o = { x: k.x, y: k.y, vx: k.vx, vy: k.vy }; G.collide(o, dt, 2, 4); k.x = o.x; k.y = o.y; k.vx = o.vx * (o.grounded ? 0.8 : 1); k.vy = o.vy; }
      if (d < 7 && k.t > 0.5 && !p.dead) {
        if (libre) { add(k.id, k.n); G.emit('pickup', k.id); k.dead = true; G.sfx('coin'); G.popText(p.x, p.y - 12, '+' + nom(k.id), '#c9d8f0'); }
        else if (G.time > pleinDit) { pleinDit = G.time + 4; G.toast(TXT.plein); }
      }
      if (k.t > 45) k.dead = true;
    }
    for (let i = drops.length - 1; i >= 0; i--) if (drops[i].dead) drops.splice(i, 1);
    for (const f of flares) {
      f.t -= dt;
      if (!G.solidAt(Math.floor(f.x / G.TILE), Math.floor((f.y + 2) / G.TILE))) { f.vy = Math.min(120, f.vy + 300 * dt); f.y += f.vy * dt; } else f.vy = 0;
      if (Math.random() < 0.3) G.part(f.x, f.y - 3, Math.random() < 0.5 ? '#ff6b6b' : '#fff3b0', G.rand(-10, 10), G.rand(-30, -10), 0.4, 1, 0, true);
    }
    for (let i = flares.length - 1; i >= 0; i--) if (flares[i].t <= 0) flares.splice(i, 1);
  });
  // vider les objets au sol quand le monde change (remorquage, téléportation, nouvelle partie)
  G.on('loaded', () => { drops.length = 0; flares.length = 0; });
  G.on('light', stamp => { for (const f of flares) stamp(f.x, f.y - 2, f.r * Math.min(1, f.t / 3), 0.95); });
  G.on('drawWorld', () => {
    for (const k of drops) G.drawSpr(G.SP.icon[DEF[k.id].icon], k.x, k.y + 3 + (k.t > 40 && Math.floor(G.time * 8) % 2 ? -1 : 0));
    for (const f of flares) { G.rectW(Math.round(f.x) - 1, Math.round(f.y) - 4, 2, 5, '#e2483d'); G.rectW(Math.round(f.x) - 1, Math.round(f.y) - 6, 2, 2, Math.floor(G.time * 12) % 2 ? '#fff3b0' : '#ffb03a'); }
  });
  G.on('drawWorldTop', () => {
    const p = G.p; if (!p || !(p.shield > 0) || p.dead) return;
    if (p.shield < 2 && Math.floor(G.time * 10) % 2) return;   // clignote avant de s'éteindre
    const ctx = G.ctx; ctx.globalAlpha = 0.55;
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2 + G.time; G.rectW(Math.round(p.x + Math.cos(a) * 9), Math.round(p.y - 5 + Math.sin(a) * 9), 1, 1, i % 3 ? '#9fe2ff' : '#e8f6ff'); }
    ctx.globalAlpha = 1;
  });

  // ---------- barre rapide (HUD) ----------
  // Dessine 5 cases + le bouton du sac en bas à droite ; renvoie le bord gauche (le HUD place l'action au-dessus si besoin).
  function drawHotbar() {
    const b = bag(), y = G.UH - 21, touch = G.isTouch();
    let x = G.UW - 3 - 19;
    G.button('bagbtn', x, y, 18, 18, '', () => ouvrir(), G.STYLES.wood); G.icon('bag', x + 9, y + 9);
    if (!touch) G.text(G.keyName(G.BINDS.bag[0]), x + 3, y + 2, 1, '#e8d2b0', 'left', null);
    for (let i = NB_BARRE - 1; i >= 0; i--) {
      x -= 19;
      const id = b.hot[i], n = id ? count(id) : 0;
      G.button('hot' + i, x, y, 18, 18, '', () => useHot(i), G.STYLES.dark, { disabled: !n });
      if (id) { if (!n) G.ctx.globalAlpha = 0.35; G.icon(DEF[id].icon, x + 9, y + 9); G.ctx.globalAlpha = 1; if (n) G.text(String(n), x + 16, y + 11, 1, '#fff3d6', 'right'); }
      if (!touch) G.text(G.keyName(G.BINDS['hot' + (i + 1)][0]), x + 3, y + 2, 1, '#8f8aa3', 'left', null);
    }
    return x;
  }

  // ---------- écran du sac ----------
  const ui = { sel: 0, confirm: -1, mode: 'slot' };   // sel : index de case (les équipements suivent les cases du sac)
  function ouvrir(from) {
    if (G.state !== 'play' && G.state !== 'base' && G.state !== 'shop') return;
    if (G.state === 'play' && (!G.p || G.p.dead || G.fade)) return;
    ui.confirm = -1; G.openScreen('bag', from || G.state); G.sfx('click');
  }
  const fermer = () => { G.closeScreen(); G.sfx('click'); };
  const objetSel = () => { const b = bag(); if (ui.sel < b.cap) { const c = b.slots[ui.sel]; return c ? c.id : null; } return b.equip[ui.sel - b.cap] || null; };

  function cellule(id, x, y, idx, n, s) {
    const b = bag(), sel = ui.sel === idx;
    G.button('slot' + idx, x, y, s, s, '', () => { if (ui.sel === idx && id) actionPrincipale(); ui.sel = idx; ui.confirm = -1; }, sel ? G.STYLES.gold : G.STYLES.dark);
    if (id) { G.icon(DEF[id].icon, x + s / 2, y + s / 2); if (n > 1) G.text(String(n), x + s - 2, y + s - 8, 1, '#fff3d6', 'right'); }
    const h = b.hot.indexOf(id); if (id && h >= 0 && idx < b.cap) G.text(String(h + 1), x + 2, y + 2, 1, '#9fe2ff', 'left', null);
  }
  function actionPrincipale() {
    const id = objetSel(); if (!id) return;
    const b = bag(), I = DEF[id];
    if (ui.sel >= b.cap) { retirer(ui.sel - b.cap); return; }
    if (I.type === 'equipement') { equiper(id); return; }
    const monde = ['bombe', 'carburant', 'reparation', 'teleport', 'fusee', 'bouclier'].includes(I.effet);
    if (monde && G.SCREENS.bag.from === 'play') { G.closeScreen(); use(id, true); }
    else use(id, true);
  }
  function jeter() {
    const b = bag(); if (ui.sel >= b.cap) return;
    const c = b.slots[ui.sel]; if (!c || DEF[c.id].type === 'quete') return;
    if (ui.confirm !== ui.sel) { ui.confirm = ui.sel; return; }
    b.slots[ui.sel] = null; ui.confirm = -1; G.sfx('crumble'); G.writeSave();
  }
  function versBarre(i) { const id = objetSel(); if (!id) return; const b = bag(); const j = b.hot.indexOf(id); if (j >= 0) b.hot[j] = null; b.hot[i] = id; G.sfx('click'); }

  function dessiner() {
    const { UW, UH } = G, b = bag(), S = G.STYLES;
    G.dim(0.78);
    const wide = UW >= 300 || UW > UH * 1.3, s = 19, gap = 1;
    const cols = Math.max(4, Math.min(wide ? 6 : 8, Math.floor(((wide ? UW * 0.5 : UW) - 10) / (s + gap)), b.cap));
    const rows = Math.ceil(b.cap / cols), gw = cols * (s + gap) - gap;
    let y = 4;
    G.textOutline(TXT.titre, UW / 2, y + 1, UW < 200 ? 1 : 2, '#f6d743');
    const used = b.slots.filter(Boolean).length;
    G.text(used + '/' + b.cap, UW - 22, y + 3, 1, used >= b.cap ? '#ff6b6b' : '#c9b78f', 'right');
    G.button('close', UW - 17, 3, 14, 13, 'X', fermer, S.wood);
    y += UW < 200 ? 14 : 22;
    const gx = wide ? Math.max(4, UW * 0.27 - gw / 2) : UW / 2 - gw / 2;
    for (let i = 0; i < b.cap; i++) { const c = b.slots[i]; cellule(c ? c.id : null, gx + (i % cols) * (s + gap), y + Math.floor(i / cols) * (s + gap), i, c ? c.n : 0, s); }
    let ey = y + rows * (s + gap) + 3;
    G.text(TXT.equipe, gx, ey + 6, 1, '#c9b78f');
    const ex = gx + G.textW(TXT.equipe) + 4;
    for (let i = 0; i < NB_EQUIP; i++) cellule(b.equip[i], ex + i * (s + gap), ey, b.cap + i, 1, s);
    ey += s + 4;
    // fiche de l'objet choisi
    const dx = wide ? gx + gw + 8 : 4, dw = wide ? UW - dx - 4 : UW - 8, dy = wide ? y : ey, dh = Math.min(UH - dy - 3, 120);
    G.panel(dx, dy, dw, dh, S.dark);
    const id = objetSel(); let yy = dy + 4;
    if (!id) {
      G.text(TXT.vide, dx + dw / 2, yy, 1, '#8f8aa3', 'center'); yy += 11;
      for (const l of G.wrap(TXT.videAide, dw - 8)) { if (yy > dy + dh - 10) break; G.text(l, dx + 4, yy, 1, '#8f8aa3'); yy += 9; }
      return;
    }
    const I = DEF[id];
    G.icon(I.icon, dx + 8, yy + 3);
    G.text(G.fitText(I.name, dw - 18), dx + 15, yy, 1, '#f6d743'); yy += 9;
    G.text(G.fitText(TXT.types[I.type] || '', dw - 18), dx + 15, yy, 1, '#8f8aa3'); yy += 11;
    const lignes = G.wrap(I.aide || I.desc, dw - 8), place = Math.max(1, Math.floor((dh - 50) / 9));
    for (const l of lignes.slice(0, place)) { G.text(l, dx + 4, yy, 1, '#fff3d6'); yy += 9; }
    // actions
    const by = dy + dh - 34, enEquip = ui.sel >= b.cap, bw = Math.min(64, (dw - 12) / 2);
    let lab = null;
    if (enEquip) lab = TXT.retirer;
    else if (I.type === 'equipement') lab = TXT.equiper;
    else if (I.effet === 'lire') lab = TXT.lire;
    else if (I.effet) lab = TXT.utiliser;
    if (lab) G.button('act', dx + 4, by, bw, 14, lab, actionPrincipale, S.green);
    if (!enEquip && I.type !== 'quete') G.button('drop', dx + dw - 4 - bw, by, bw, 14, ui.confirm === ui.sel ? TXT.sur : TXT.jeter, jeter, S.steel);
    if (!enEquip && I.type === 'conso') {
      const ty = by + 17; G.text(TXT.barre, dx + 4, ty + 3, 1, '#c9b78f');
      const tx0 = dx + 6 + G.textW(TXT.barre), tw = Math.min(14, (dx + dw - 4 - tx0) / NB_BARRE - 1);
      for (let i = 0; i < NB_BARRE; i++) G.button('tohot' + i, tx0 + i * (tw + 1), ty, tw, 13, String(i + 1), () => versBarre(i), b.hot[i] === id ? S.gold : S.dark);
    }
  }
  G.SCREENS.bag = { draw: dessiner };

  // ---------- clavier ----------
  G.on('key', k => {
    const st = G.state;
    if (st === 'bag') {
      const b = bag(), cols = Math.max(4, Math.min(G.UW >= 300 || G.UW > G.UH * 1.3 ? 6 : 8, b.cap));
      if (G.isBind('bag', k) || k === 'Escape' || k === 'Backspace') fermer();
      else if (k === 'ArrowRight' || k === 'KeyD') ui.sel = (ui.sel + 1) % (b.cap + NB_EQUIP);
      else if (k === 'ArrowLeft' || k === 'KeyA') ui.sel = (ui.sel + b.cap + NB_EQUIP - 1) % (b.cap + NB_EQUIP);
      else if (k === 'ArrowDown' || k === 'KeyS') ui.sel = Math.min(b.cap + NB_EQUIP - 1, ui.sel + cols);
      else if (k === 'ArrowUp' || k === 'KeyW') ui.sel = Math.max(0, ui.sel - cols);
      else if (k === 'Enter' || k === 'Space' || G.isBind('interact', k)) actionPrincipale();
      else if (k === 'Delete' || k === 'KeyX') jeter();
      else { for (let n = 1; n <= NB_BARRE; n++) if (G.isBind('hot' + n, k)) { const id = objetSel(); if (id && DEF[id].type === 'conso') versBarre(n - 1); } }
      ui.confirm = k === 'Delete' || k === 'KeyX' ? ui.confirm : -1;
      return true;
    }
    if ((st === 'play' || st === 'base') && G.isBind('bag', k)) { ouvrir(); return true; }
    return false;
  });

  return { nom: 'sac', DEF, IDS, def: id => DEF[id], count, canAdd, add, take, bonus, use, useHot, buy, shopIds, drawHotbar, ouvrir, lacher, equiper, nomObjet: nom };
});
