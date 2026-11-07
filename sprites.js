// Cogmole: hand-authored pixel art. Each sprite is a list of rows; one character = one pixel.
// '.' is transparent; every other character maps to a colour in PAL. A 1px dark outline is added at build time.
(function (root) {
'use strict';

const PAL = {
  k: '#1a1622', w: '#ffffff', e: '#2a2233',
  y: '#f6d743', Y: '#c99a2e', f: '#fff3b0',
  o: '#f08a3c', O: '#b5562a',
  r: '#e2483d', R: '#a32b2e', p: '#f7a8a0', P: '#c96a74',
  s: '#8d8f99', S: '#5b5d68', h: '#d4d6dc',
  c: '#9fe2ff', b: '#4aa3df', B: '#2c6fa8', d: '#e8f6ff',
  n: '#8a5a3b', N: '#5e3b28', t: '#c9a070',
  g: '#5fbf4a', G: '#3e8c3a', l: '#a7e06a',
  v: '#8e5cc8', V: '#5d3a8e', m: '#c79be8',
  q: '#5fe0c0', Q: '#2e9c84',
  a: '#ffb03a', A: '#d8461c', z: '#7a1f14',
  x: '#3a3445', X: '#4a4458',
};

// ---------- Cog, the robot (body 8x6 + treads 8x2; the drill and antenna are drawn by code) ----------
const SPR = {
  body: [
    ['.yyyyyy.', 'yfeeeeyY', 'yfceecyY', 'yfceecyY', 'yyeeeeyY', '.YYYYYY.'],   // 0 look ahead
    ['.yyyyyy.', 'yfeeeeyY', 'yfececyY', 'yfececyY', 'yyeeeeyY', '.YYYYYY.'],   // 1 look right
    ['.yyyyyy.', 'yfeeeeyY', 'yfceceyY', 'yfceceyY', 'yyeeeeyY', '.YYYYYY.'],   // 2 look left
    ['.yyyyyy.', 'yfeeeeyY', 'yfeeeeyY', 'yfceecyY', 'yyeeeeyY', '.YYYYYY.'],   // 3 blink
    ['.yyyyyy.', 'yfeeeeyY', 'yfceecyY', 'yfeccecY', 'yyeeeeyY', '.YYYYYY.'],   // 4 happy (^^)
    ['.yyyyyy.', 'yfeeeeyY', 'yfreeryY', 'yfereeyY', 'yyeeeeyY', '.YYYYYY.'],   // 5 hurt (x x)
  ],
  treads: [
    ['SsSsSsSs', '.hShShS.'],
    ['sSsSsSsS', '.ShShSh.'],
  ],

  // ---------- critters ----------
  grub: [
    ['...pppp.', '.ppPpPpp', 'pePpPpPp', 'pppppppp', '.P.P.P.P'],
    ['...pppp.', '.ppPpPpp', 'pePpPpPp', 'pppppppp', 'P.P.P.P.'],
  ],
  bat: [
    ['v.......v', 'vv.....vv', '.vVVVVVv.', '..VyVyV..', '...V.V...'],
    ['.........', '..VVVVV..', '.vVyVyVv.', 'vv.V.V.vv', 'v.......v'],
  ],
  cinder: [
    ['...aa...', '..aAaa..', '.aafaaa.', '.aeaaea.', 'aaaaaaaa', '.AAAAAA.'],
    ['........', '...aa...', '.aaAfaa.', 'aaeaaeaa', 'aaaaaaaa', 'AAAAAAAA'],
  ],
  moth: [
    ['m.......m', 'mm..v..mm', 'mmm.v.mmm', '.mmcvcmm.', '..mvvvm..', '...v.v...'],
    ['.........', '....v....', '.m..v..m.', 'mmmcvcmmm', 'mm.vvv.mm', '...v.v...'],
  ],

  // ---------- guardians ----------
  grubmother: [
    ['......ppp....ppp......',
     '....ppPPPpppPPPppp....',
     '..pppPpppPPPpppPpppp..',
     '.ppPpppppppppppppwwpp.',
     'pppPpppPpppPpppppwepNN',
     'pPppppPppppPpppppppppN',
     'ppppppppppppppppppppNt',
     '.PPPPPPPPPPPPPPPPPPPN.',
     '..P.P..P.P..P.P..P.P..'],
    ['......ppp....ppp......',
     '....ppPPPpppPPPppp....',
     '..pppPpppPPPpppPpppp..',
     '.ppPpppppppppppppwwpp.',
     'pppPpppPpppPpppppwepNN',
     'pPppppPppppPpppppppprN',
     'ppppppppppppppppppprNt',
     '.PPPPPPPPPPPPPPPPPPPN.',
     '.P.P..P.P..P.P..P.P...'],
  ],
  crab: [
    ['.......e......e.......',
     '.......S......S.......',
     '......sscmmsmmcss.....',
     '....sssSmvvSvvmSsss...',
     '...ssSSSSSSSSSSSSSss..',
     '.hh.sSSSSSSSSSSSSSs.hh',
     'hhh.ssSSSSSSSSSSss.hhh',
     'hSh..sssssssssssss.hSh',
     '.h...S.S.S..S.S.S...h.',
     '....S..S..S..S..S..S..'],
  ],
  toad: [
    ['...xxx........xxx...',
     '..xyexx......xxeyx..',
     '..xxxxxxxxxxxxxxxx..',
     '.xXxxxxXxxxxxXxxxXx.',
     '.xxxxxxxxxxxxxxxxxx.',
     'xxzAAAAAAAAAAAAAAzxx',
     'xxAaaaaaaaaaaaaaaAxx',
     'xXaafaaaaaaaaafaaaXx',
     'xxaaaaaaaaaaaaaaaaxx',
     '.xxAaaaaaaaaaaaaAxx.',
     'xxX.xxxxxxxxxxxx.Xxx',
     'xXx..............xXx'],
  ],
  prism: [
    ['.......d.......',
     '......dcd......',
     '.....dccbd.....',
     '....dcccbbd....',
     '...dccccbbbd...',
     '..dcccwwwbbbd..',
     '.dccwweeewbbbd.',
     'dcccweereewbbbd',
     '.dccwweeewbbbd.',
     '..dcccwwwbbbd..',
     '...dccccbbbd...',
     '....dcccbbd....',
     '.....dccbd.....',
     '......dcd......',
     '.......d.......'],
  ],
  shard: [['..d..', '.dcd.', '.dcb.', 'dccbd', '.dcb.', '.dbd.', '..d..']],
  rock: [['.ss.', 'shss', 'ssSS', '.SS.']],
  fireball: [['.aa.', 'afaa', 'aaaA', '.AA.']],
  spark: [['.c.', 'cdc', '.c.']],
  boulder: [['..........', '...ssss...', '..shhsss..', '.shhssssS.', '.shsssssS.', '.sssssSSS.', '.ssssSSSS.', '..sSSSSS..', '...SSSS...', '..........']],

  // ---------- surface ----------
  workshop: [[
    '.........rrrrrr.........',
    '.......rrRRRRRRrr.......',
    '.....rrRRRRRRRRRRrr.....',
    '...rrRRRRRRRRRRRRRRrr...',
    '.rrRRRRRRRRRRRRRRRRRRrr.',
    'rrrrrrrrrrrrrrrrrrrrrrrr',
    '.nttttttttttttttttttttn.',
    '.nthhhhhtNNNNNNthhhhhtn.',
    '.nthccchtNnnnnNthccchtn.',
    '.nthccchtNnnnnNthccchtn.',
    '.nthhhhhtNnnynNthhhhhtn.',
    '.ntttttttNnnnnNttttttn..',
    '.ntttttttNnnnnNttttttn..',
    '.ntttttttNnnnnNttttttn..',
    'SSSSSSSSSSSSSSSSSSSSSSSS',
  ]],
  pump: [['.rrrrr.', 'rRRRRRr', 'rcccccr', 'rcyyycr', 'rcccccr', 'rrrrrrr', 'rrrrrr.', 'rrrrrrh', 'rRrrrrh', 'rrrrr.h', 'rrrrr.h', 'rRrrr.h', 'rrrrr.h', 'SSSSSSS']],
  cart: [['...yo.cr..', '.nnnnnnnn.', 'nNnnnnnnNn', 'nnnnnnnnnn', '.nNNNNNNn.', '..S....S..']],
  gear: [['..h.h..', '.hhhhh.', 'hhh.hhh', '.h...h.', 'hhh.hhh', '.hhhhh.', '..h.h..']],
  pine: [['....G....', '...GgG...', '..GgggG..', '...GgG...', '..GgggG..', '.GgglggG.', '..GgggG..', '.GgggggG.', 'GggglgggG', '.GGGGGGG.', '....n....', '....n....']],
  bush: [['..GgG..', '.GgglG.', 'GgggggG', '.GGGGG.']],
  flower: [['.y.', 'yfy', '.G.', '.G.']],

  // ---------- tiles: overlays (the tile bodies themselves are generated from palettes) ----------
  cache: [[
    'SSSSSSSSSS', 'SsssssssxS', 'SsYyyyyYxS', 'SsyYffYyxS', 'SsyfYYfyxS',
    'SsyfYYfyxS', 'SsyYffYyxS', 'SsYyyyyYxS', 'SxxxxxxxxS', 'SSSSSSSSSS',
  ]],
  crack: [
    ['..........', '..........', '....k.....', '.....k....', '....kk....', '......k...', '..........', '..........', '..........', '..........'],
    ['..........', '...k......', '....k..k..', '.k...kk...', '..k.kk....', '...k..k...', '......k.k.', '..k...k...', '.k........', '..........'],
    ['.k......k.', '..k..k.k..', '...kk.kk..', '.k..kkk...', '..kkkk.kk.', '.k..kk..k.', '..k.k.kk..', '.kk...k.k.', 'k...k...k.', '....k.....'],
  ],

  // ---------- icons (7x7 unless noted) ----------
  i_fuel:    [['...a...', '..aaa..', '.aaaaa.', 'aafaaaa', 'aafaaaa', '.aaaaA.', '..AAA..']],
  i_hull:    [['hhhhhhh', 'hssSssh', 'hsSSSsh', 'hssSssh', '.hsssh.', '..hsh..', '...h...']],
  i_cargo:   [['nnnnnnn', 'nNtttNn', 'ntNtNtn', 'nttNttn', 'ntNtNtn', 'nNtttNn', 'nnnnnnn']],
  i_light:   [['..fff..', '.fyyyf.', '.fyyyf.', '.fyyyf.', '..fyf..', '..sss..', '..SSS..']],
  i_drill:   [['ss.....', 'sShh...', 'sSSShh.', 'sSSSSSh', 'sSSShh.', 'sShh...', 'ss.....']],
  i_engine:  [['...o...', '..oyo..', '..oyo..', '.oyfyo.', '.oyfyo.', '..oyo..', '...o...']],
  i_bomb:    [['....oy.', '...S...', '..sss..', '.shsss.', '.sssss.', '.ssssS.', '..SSS..']],
  i_kit:     [['.h...h.', '.hh.hh.', '..hhh..', '...h...', '...s...', '...s...', '..sss..']],
  i_can:     [['.rrr...', 'rr.rrr.', 'rrrrrrr', 'rfrrrrr', 'rfrrrrr', 'rrrrrrr', '.RRRRR.']],
  i_tele:    [['..ccc..', '.c...c.', 'c..m..c', 'c.mvm.c', 'c..m..c', '.c...c.', '..ccc..']],
  i_film:    [['wwwwwww', 'wewwwww', 'weewwww', 'weeewww', 'weewwww', 'wewwwww', 'wwwwwww']],
  i_coin:    [['.yyy.', 'yfyYy', 'yfyYy', 'yfyYy', '.yyy.']],
  i_speaker: [['...h...', '..hh.h.', 'hhhh..h', 'hhhh..h', 'hhhh..h', '..hh.h.', '...h...']],
  i_mute:    [['...h...', '..hh...', 'hhhhr.r', 'hhhh.r.', 'hhhhr.r', '..hh...', '...h...']],
  i_pause:   [['hh.hh', 'hh.hh', 'hh.hh', 'hh.hh', 'hh.hh']],
  i_star:    [['...y...', '..yyy..', 'yyyfyyy', '.yyyyy.', '..yyy..', '.yy.yy.', '.y...y.']],
  i_lock:    [['.sss.', 's...s', 's...s', 'yyyyy', 'yYeYy', 'yyyyy']],
  i_depth:   [['..h..', '..h..', '..h..', 'hhhhh', '.hhh.', '..h..']],
  i_lift:    [['hhhhhhh', 'h..c..h', 'h.ccc.h', 'hccccch', 'h..c..h', 'h..c..h', 'hhhhhhh']],
  i_gift:    [['..r.r..', '...r...', 'yyyryyy', 'yyyryyy', '.yyryy.', '.yyryy.', '.YYRYY.']],
  i_skull:   [['.hhhhh.', 'hhhhhhh', 'heehheh', 'heehheh', 'hhhehhh', '.hhhhh.', '.h.h.h.']],

  // ---------- relics ----------
  r_grubheart: [['.pp.pp.', 'ppppppp', 'pwppppp', 'ppppppp', '.ppppp.', '..ppp..', '...p...']],
  r_geode:     [['..sss..', '.svvvs.', 'svmcmvs', 'svcecvs', 'svmcmvs', '.svvvs.', '..sss..']],
  r_cinder:    [['...a...', '..aAa..', '.aAfAa.', 'aAfffAa', '.aAfAa.', '..aAa..', '...a...']],
  r_prism:     [['c..c..c', 'cc.c.cc', 'ccccccc', 'cdcdcdc', 'ccccccc', '.bbbbb.', '.......']],
  r_moleclaw:  [['h.h.h..', 'h.h.h..', 'hhhhh..', 'nnnnnn.', '.nnnnnn', '..nnnn.', '.......']],
  r_oil:       [['...s...', '..sss..', '..oso..', '.ooooo.', 'ooofooo', 'ooooooo', '.OOOOO.']],
  r_lucky:     [['..yyy..', '.yyyyy.', 'yygygyy', 'yyGgGyy', 'yygGgyy', '.yyyyy.', '..yyy..']],
  r_feather:   [['.....l.', '....ll.', '...lgl.', '..lgl..', '.lgl...', '.gl....', 'g......']],
  r_scale:     [['..qqq..', '.qQqQq.', 'qQqqqQq', 'qqQqQqq', '.qqQqq.', '..qqq..', '...q...']],
  r_magnet:    [['hh...hh', 'rr...rr', 'rr...rr', 'rrr.rrr', '.rrrrr.', '..rrr..', '.......']],
  r_blastcap:  [['...y...', '..y.y..', '.rrrrr.', 'rrwrrrr', 'rrrrrrr', 'rRrrrRr', '.RRRRR.']],
  r_gyro:      [['..mmm..', '.m.c.m.', 'm.ccc.m', 'mcccccm', 'm.ccc.m', '.m.c.m.', '..mmm..']],

  // ---------- sac à dos, matériaux, équipements, menus (ajoutés avec les modules) ----------
  i_flare:    [['...y...', '..yfy..', '...a...', '..rrr..', '..rfr..', '..rrr..', '..RRR..']],
  i_shield:   [['.bbbbb.', 'bcccccb', 'bcdcccb', 'bcccccb', '.bcccb.', '..bcb..', '...b...']],
  i_scrap:    [['.......', '.hh....', 'hssh.h.', '.sSs.hs', '..SssS.', '.hsS.S.', '..SS...']],
  i_chitin:   [['..ppp..', '.pPpPp.', 'ppPpPpp', 'pPpPpPp', '.pPpPp.', '..PPP..', '.......']],
  i_fang:     [['wwwhh..', '.wwhh..', '..whh..', '..whS..', '...hS..', '...hS..', '....S..']],
  i_ember:    [['...a...', '..aaa..', '.aAfaa.', '.afffa.', 'aAffAaA', '.AaaaA.', '..zzz..']],
  i_dust:     [['.m...m.', '...m...', '.m.v.m.', '..vmv..', 'm.vmv.m', '..vvv..', '.m...m.']],
  i_crystal:  [['...c...', '..cdc..', '..cdcb.', '.bcdcb.', '.bcccbB', '.Bbcbb.', '..BBB..']],
  i_logbook:  [['nnnnnn.', 'nttttnN', 'ntNNtnN', 'nttttnN', 'ntNNtnN', 'nttttnN', '.NNNNNN']],
  i_key:      [['.yyy...', 'y...y..', 'y...y..', '.yyy...', '..y....', '..yy...', '..yyy..']],
  i_coil:     [['.hhhhh.', 'hoOoOoh', 'hOoOoOh', 'hoOoOoh', 'hOoOoOh', 'hoOoOoh', '.hhhhh.']],
  i_beam:     [['f.....f', '..sss..', '.sffhs.', '.sfffs.', '..sss..', '...S...', '..SSS..']],
  i_cooler:   [['b.bbb.b', '.bcdcb.', 'bcdcdcb', 'bdcccdb', 'bcdcdcb', '.bcdcb.', 'b.bbb.b']],
  i_springs:  [['hhhhhhh', '.s.s.s.', 'h.h.h.h', '.s.s.s.', 'h.h.h.h', '.s.s.s.', 'SSSSSSS']],
  i_drillbit: [['sssssss', '.hshsh.', '.shshs.', '..hsh..', '..shs..', '...w...', '...w...']],
  i_bag:      [['..nnn..', '.n...n.', 'nnnnnnn', 'ntttttn', 'ntnNntn', 'nttttNn', '.NNNNN.']],
  i_bigbag:   [['..GGG..', '.G...G.', 'GgggggG', 'GglGlgG', 'GgggggG', 'GglllgG', '.GGGGG.']],
  i_map:      [['tttttt.', 'tNttrtN', 'ttNtttN', 'tttNttN', 'trttNtN', 'tttttNN', '.NNNNNN']],
  i_journal:  [['BBBBBB.', 'BddddBb', 'BdBBdBb', 'BddddBb', 'BdBBdBb', 'BddddBb', '.bbbbbb']],
  i_trophy:   [['yyyyyyy', 'yfyyyYy', '.yyyyY.', '..yyY..', '...Y...', '..yyy..', '.YYYYY.']],
  i_disk:     [['BBBBBB.', 'BhhhhBB', 'BhhhhBB', 'BBBBBBB', 'BdddddB', 'BdSSSdB', 'BBBBBBB']],
  i_talk:     [['.hhhhh.', 'hhhhhhh', 'hShShSh', 'hhhhhhh', '.hhhhh.', '.hh....', '.h.....']],
  i_hammer:   [['sssss..', 'shhss..', 'sssss..', '..n....', '..n....', '..n....', '..N....']],
  i_beacon:   [['...c...', '..cdc..', '...c...', '..hsh..', '..shs..', '.hssSh.', 'sssssSS']],
  i_cog:      [['..h.h..', '.hhhhh.', 'hhsSshh', '.hS.Sh.', 'hhsSshh', '.hhhhh.', '..h.h..']],

  // ---------- personnages ----------
  // Mira, la vieille mécanicienne de la base (2 images : l'œil cligne)
  mira: [
    ['...S......', '...S......', '..ooooo...', '.oOcccOo..', '.oOcdcOo..', '.ooooooo..', '..sssss.hh', '.ssssssshs', '.sStttSs.h', '.ssssssss.', '..SS..SS..', '.SSS..SSS.'],
    ['...S......', '...S......', '..ooooo...', '.oOOOOOo..', '.oOcccOo..', '.ooooooo..', '..sssss.hh', '.ssssssshs', '.sStttSs.h', '.ssssssss.', '..SS..SS..', '.SSS..SSS.'],
  ],
  // vieux robot-mineur abandonné, à moitié enfoui (2 images : la lampe clignote)
  oldbot: [
    ['...S.....', '...y.....', '..sss....', '.shcsS...', '.sssss.hh', 'sSnnsSshs', '.SSSSSS..', '.S.S.S...'],
    ['...S.....', '...Y.....', '..sss....', '.shbsS...', '.sssss.hh', 'sSnnsSshs', '.SSSSSS..', '.S.S.S...'],
  ],
};

// Ore overlays (10x10). X = ore colour, x = highlight, D = shade. Metals are nuggets, gems are crystals.
const ORE_MASKS = {
  metal: [
    ['..........', '.xX.......', '.XXD...xX.', '..D....XXD', '....xX..D.', '...XXXD...', '....DD....', '.xX....xX.', '.XXD...XD.', '..........'],
    ['..........', '....xX....', '...XXXD...', '.x..DD..x.', '.XD....XXD', '......x.D.', '..xX..XD..', '..XXD.....', '...D...xX.', '.......XD.'],
  ],
  gem: [
    ['..........', '...x......', '..xXD.....', '..XXD..x..', '...D..xXD.', '......XXD.', '.x.....D..', '.XD..x....', '.....XD...', '..........'],
    ['..........', '......x...', '.x...xXD..', 'xXD..XXD..', '.D....D...', '...x......', '..xXD...x.', '..XXD..xXD', '...D....D.', '..........'],
  ],
};

const FONT_SRC = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10001 10001 10001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11111 00010 00100 00010 00001 10001 01110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
  ' ': '00000 00000 00000 00000 00000 00000 00000', '.': '00000 00000 00000 00000 00000 01100 01100',
  ',': '00000 00000 00000 00000 01100 00100 01000', ':': '00000 01100 01100 00000 01100 01100 00000',
  '!': '00100 00100 00100 00100 00100 00000 00100', '?': '01110 10001 00001 00010 00100 00000 00100',
  '+': '00000 00100 00100 11111 00100 00100 00000', '-': '00000 00000 00000 11111 00000 00000 00000',
  '/': '00001 00010 00010 00100 01000 01000 10000', '%': '11001 11010 00010 00100 01000 01011 10011',
  "'": '00100 00100 01000 00000 00000 00000 00000', '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000', '>': '01000 00100 00010 00001 00010 00100 01000',
  '<': '00010 00100 01000 10000 01000 00100 00010', '*': '00000 10101 01110 11111 01110 10101 00000',
  '#': '01010 11111 01010 01010 01010 11111 01010',
  '=': '00000 00000 11111 00000 11111 00000 00000',
};

root.COG_ART = { PAL, SPR, ORE_MASKS, FONT_SRC };
})(typeof window !== 'undefined' ? window : globalThis);
