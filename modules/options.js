// ============================================================
//  Module « options » : volume, plein écran, langue et touches
//  Les réglages sont communs à tous les emplacements de sauvegarde (clé cogmole_options_v1).
//  Écrans : « options » (depuis le menu ou la pause) et « controls » (changer les touches).
// ============================================================
(window.COG_MODULES = window.COG_MODULES || []).push(function options(G) {
  'use strict';
  const KEY = 'cogmole_options_v1';
  const tr = (fr, en, es, pt) => ({ fr, en, es, pt });
  const TXT = {
    titre: tr('Options', 'Options', 'Opciones', 'Opções'),
    musique: tr('Musique', 'Music', 'Música', 'Música'),
    effets: tr('Effets', 'Sound FX', 'Efectos', 'Efeitos'),
    son: tr('Son', 'Sound', 'Sonido', 'Som'),
    actif: tr('Oui', 'On', 'Sí', 'Sim'),
    coupe: tr('Coupé', 'Off', 'No', 'Não'),
    non: tr('Non', 'Off', 'No', 'Não'),
    plein: tr('Plein écran', 'Fullscreen', 'Pantalla completa', 'Tela cheia'),
    langue: tr('Langue', 'Language', 'Idioma', 'Idioma'),
    touches: tr('Contrôles', 'Controls', 'Controles', 'Controles'),
    retour: tr('Retour', 'Back', 'Volver', 'Voltar'),
    defaut: tr('Par défaut', 'Defaults', 'Por defecto', 'Padrão'),
    appuie: tr('Appuie sur une touche... (Échap : annuler)', 'Press a key... (Esc: cancel)', 'Pulsa una tecla... (Esc: cancelar)', 'Aperte uma tecla... (Esc: cancelar)'),
    astuce: tr('Clique une action puis appuie sur la nouvelle touche. Les flèches restent toujours actives.', 'Click an action, then press the new key. Arrow keys always work too.', 'Haz clic en una acción y pulsa la nueva tecla. Las flechas siguen funcionando.', 'Clique numa ação e aperte a nova tecla. As setas continuam funcionando.'),
    tactile: tr('Sur écran tactile : glisse le doigt pour bouger, voler et creuser.', 'On touch screens: drag to move, fly and dig.', 'En pantalla táctil: desliza para moverte, volar y cavar.', 'Na tela de toque: arraste para mover, voar e cavar.'),
    options: tr('Options', 'Options', 'Opciones', 'Opções'),
    actions: {
      left: tr('Gauche', 'Left', 'Izquierda', 'Esquerda'), right: tr('Droite', 'Right', 'Derecha', 'Direita'),
      up: tr('Voler', 'Fly', 'Volar', 'Voar'), down: tr('Creuser', 'Dig down', 'Cavar', 'Cavar'),
      interact: tr('Action', 'Action', 'Acción', 'Ação'), pause: tr('Pause', 'Pause', 'Pausa', 'Pausa'),
      bag: tr('Sac', 'Bag', 'Mochila', 'Mochila'), map: tr('Carte', 'Map', 'Mapa', 'Mapa'), journal: tr('Journal', 'Journal', 'Diario', 'Diário'),
      hot1: tr('Objet 1', 'Item 1', 'Objeto 1', 'Item 1'), hot2: tr('Objet 2', 'Item 2', 'Objeto 2', 'Item 2'), hot3: tr('Objet 3', 'Item 3', 'Objeto 3', 'Item 3'),
      hot4: tr('Objet 4', 'Item 4', 'Objeto 4', 'Item 4'), hot5: tr('Objet 5', 'Item 5', 'Objeto 5', 'Item 5'),
    },
  };
  const ACTIONS = Object.keys(TXT.actions);
  const RESERVEES = ['Escape', 'F1', 'Backquote', 'IntlBackslash', 'Tab', 'Enter', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'MetaLeft', 'MetaRight'];

  // ---------- lecture / écriture des réglages ----------
  const reglages = { music: 1, sfx: 1, binds: {} };
  function lire() {
    let d = {}; try { const raw = G.sdk.getItem(KEY); if (raw && raw.length < 4000) d = JSON.parse(raw) || {}; } catch (e) {}
    if (!d || typeof d !== 'object') d = {};
    reglages.music = Number.isFinite(+d.music) ? G.clamp(+d.music, 0, 1) : 1;
    reglages.sfx = Number.isFinite(+d.sfx) ? G.clamp(+d.sfx, 0, 1) : 1;
    reglages.binds = {};
    const b = d.binds && typeof d.binds === 'object' ? d.binds : {};
    for (const a of ACTIONS) if (G.own(b, a) && typeof b[a] === 'string' && /^[A-Za-z0-9]{2,20}$/.test(b[a]) && !RESERVEES.includes(b[a])) reglages.binds[a] = b[a];
  }
  function ecrire() { try { G.sdk.setItem(KEY, JSON.stringify(reglages)); } catch (e) {} }
  function appliquer() {
    G.vol.music = reglages.music; G.vol.sfx = reglages.sfx; G.applyVolume();
    for (const a of ACTIONS) G.BINDS[a] = G.DEFAULT_BINDS[a].slice();
    for (const a in reglages.binds) G.BINDS[a][0] = reglages.binds[a];
  }
  G.on('boot', () => { lire(); appliquer(); });

  // ---------- plein écran (Poki fournit déjà le sien : pas de bouton là-bas) ----------
  const fsPossible = () => G.PLATFORM !== 'poki' && !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  const enPlein = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  function basculerPlein() {
    try {
      if (enPlein()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { const el = document.documentElement; const f = el.requestFullscreen || el.webkitRequestFullscreen; const r = f && f.call(el); if (r && r.catch) r.catch(() => {}); }
    } catch (e) {}
  }

  // ---------- écran Options ----------
  function regler(cle, d) { reglages[cle] = Math.round(G.clamp(reglages[cle] + d, 0, 1) * 10) / 10; appliquer(); ecrire(); G.sfx('click'); }
  function ligneVolume(id, lab, cle, x, y, w) {
    G.text(G.fitText(lab, w - 104), x, y + 4, 1, '#fff3d6');
    const bx = x + w - 100;
    G.button(id + '_m', bx, y, 16, 14, '-', () => regler(cle, -0.1), G.STYLES.dark);
    G.bar(bx + 19, y + 3, 62, 8, reglages[cle], '#7fd05f');
    G.button(id + '_p', bx + 84, y, 16, 14, '+', () => regler(cle, 0.1), G.STYLES.dark);
  }
  function dessinerOptions() {
    const { UW, UH } = G, S = G.STYLES, w = Math.min(UW - 12, 200), x = UW / 2 - w / 2;
    G.dim(0.82);
    const pas = UH < 200 ? 16 : 19;
    let y = Math.max(3, UH * (UH < 200 ? 0.02 : 0.08));
    G.textOutline(TXT.titre, UW / 2, y, UH < 200 ? 1 : 2, '#f6d743'); y += UH < 200 ? 12 : 24;
    ligneVolume('vm', TXT.musique, 'music', x, y, w); y += pas;
    ligneVolume('vs', TXT.effets, 'sfx', x, y, w); y += pas;
    G.text(TXT.son, x, y + 4, 1, '#fff3d6');
    G.button('opt_mute', x + w - 100, y, 100, 14, G.muted ? TXT.coupe : TXT.actif, G.toggleMute, G.muted ? S.grey : S.green, { icon: G.muted ? 'mute' : 'speaker' }); y += pas;
    G.text(TXT.langue, x, y + 4, 1, '#fff3d6');
    G.button('opt_lang', x + w - 100, y, 100, 14, G.lang.toUpperCase(), G.cycleLang, S.dark); y += pas;
    if (fsPossible()) { G.text(G.fitText(TXT.plein, w - 104), x, y + 4, 1, '#fff3d6'); G.button('opt_fs', x + w - 100, y, 100, 14, enPlein() ? TXT.actif : TXT.non, basculerPlein, enPlein() ? S.green : S.dark); y += pas; }
    y = Math.min(y + 4, UH - 19);
    // Contrôles et Retour côte à côte
    const bw = Math.min(100, (w - 4) / 2);
    G.button('opt_keys', UW / 2 - bw - 2, y, bw, 16, TXT.touches, () => { G.SCREENS.controls.from = 'options'; G.setScreen('controls'); ui.attente = null; }, S.steel);
    G.button('back', UW / 2 + 2, y, bw, 16, TXT.retour, () => { G.closeScreen(); G.sfx('click'); }, S.wood);
  }
  G.SCREENS.options = { draw: dessinerOptions };

  // ---------- écran Contrôles ----------
  const ui = { attente: null, page: 0 };
  function dessinerTouches() {
    const { UW, UH } = G, S = G.STYLES;
    G.dim(0.85);
    let y = 4;
    G.textOutline(TXT.touches, UW / 2, y, UW < 200 ? 1 : 2, '#f6d743'); y += UW < 200 ? 14 : 22;
    const cols = UW >= 330 ? 2 : 1, cw = Math.min(150, (UW - 12) / cols - 4), rh = 15;
    const parPage = Math.max(2, Math.floor((UH - y - 52) / rh) * cols), pages = Math.ceil(ACTIONS.length / parPage);
    ui.page = G.clamp(ui.page, 0, pages - 1);
    const liste = ACTIONS.slice(ui.page * parPage, (ui.page + 1) * parPage), x0 = UW / 2 - (cols * (cw + 4) - 4) / 2;
    liste.forEach((a, i) => {
      const col = Math.floor(i / Math.ceil(liste.length / cols)), row = i % Math.ceil(liste.length / cols), x = x0 + col * (cw + 4), yy = y + row * rh;
      G.text(G.fitText(TXT.actions[a], cw - 58), x, yy + 4, 1, '#fff3d6');
      const att = ui.attente === a;
      G.button('key_' + a, x + cw - 54, yy, 54, 13, att ? '...' : G.keyName(G.BINDS[a][0]), () => { ui.attente = a; }, att ? S.gold : S.dark);
    });
    y += Math.ceil(liste.length / cols) * rh + 4;
    if (pages > 1) {
      G.button('kp_prev', UW / 2 - 40, y, 18, 13, '<', () => { ui.page--; }, S.dark, { disabled: ui.page === 0 });
      G.text((ui.page + 1) + '/' + pages, UW / 2, y + 3, 1, '#c9b78f', 'center');
      G.button('kp_next', UW / 2 + 22, y, 18, 13, '>', () => { ui.page++; }, S.dark, { disabled: ui.page >= pages - 1 });
      y += 17;
    }
    const aide = ui.attente ? TXT.appuie : (G.isTouch() ? TXT.tactile : TXT.astuce);
    for (const l of G.wrap(aide, UW - 16).slice(0, 2)) { G.text(l, UW / 2, y, 1, ui.attente ? '#f6d743' : '#8f8aa3', 'center'); y += 9; }
    const by = UH - 20, bw = Math.min(80, (UW - 12) / 2);
    G.button('keys_reset', UW / 2 - bw - 2, by, bw, 16, TXT.defaut, () => { reglages.binds = {}; appliquer(); ecrire(); ui.attente = null; G.sfx('click'); }, S.steel);
    G.button('back', UW / 2 + 2, by, bw, 16, TXT.retour, () => { ui.attente = null; G.setScreen('options'); G.sfx('click'); }, S.wood);
  }
  G.SCREENS.controls = { draw: dessinerTouches };
  // capture de la nouvelle touche (avant tout le reste du jeu)
  G.on('keyFirst', k => {
    if (G.state !== 'controls' || !ui.attente) return false;
    if (k === 'Escape') { ui.attente = null; return true; }
    if (RESERVEES.includes(k)) { G.sfx('deny'); return true; }
    const a = ui.attente;
    // si la touche servait déjà à une autre action, les deux échangent leur touche
    for (const b of ACTIONS) if (b !== a && G.BINDS[b][0] === k) reglages.binds[b] = G.BINDS[a][0];
    reglages.binds[a] = k; appliquer(); ecrire(); ui.attente = null; G.sfx('buy');
    return true;
  });
  G.on('key', k => {
    if (G.state === 'options' && (k === 'Escape' || k === 'Backspace')) { G.closeScreen(); return true; }
    if (G.state === 'controls' && (k === 'Escape' || k === 'Backspace')) { G.setScreen('options'); return true; }
    return G.state === 'options' || G.state === 'controls';
  });

  // ---------- boutons dans les menus ----------
  const ouvrir = () => { G.openScreen('options'); G.sfx('click'); };
  G.on('buttons', (where, list) => { if (where === 'menu' || where === 'pause') list.push({ id: 'options', label: TXT.options, fn: ouvrir, icon: 'cog', st: G.STYLES.steel }); });

  return { nom: 'options', ouvrir, reglages };
});
