/* ============================================================
   cheesecom — état partagé + constantes
   Tous les modules enregistrent leurs fonctions sur window.App
   et s'appellent via App.* (résolution à l'exécution).
   ============================================================ */
(function () {
  'use strict';

  var App = {
    state: {
      game: null,
      bot: null,
      playerColor: 'w',
      colorChoice: 'w',
      timeControl: 'casual',
      flipped: false,
      active: false,        /* partie en cours */
      inputLocked: false,   /* pendant anim / tour du bot */
      selected: -1,
      legalFrom: [],
      drag: null,
      pieceEls: {},
      userMarks: {},
      userArrows: [],
      lastMove: null,
      promoPending: null,
      rightStart: null,
      hintArrow: null,
      clocks: { w: 0, b: 0 },
      clockTimer: null,
      rewards: parseInt(localStorage.getItem('cheesecom_rewards') || '0', 10),
      msgCount: 0,
      /* fonctions avancées */
      premove: null,          /* {from, to, promotion?} */
      pendingConfirm: null,   /* {from, to, promotion?} */
      viewGame: null,         /* partie reconstruite pour la navigation */
      viewPly: null,          /* nb de plies rejouées (null = position live) */
      prefs: null
    },
    selectedBot: null,      /* défini dans app.js au démarrage */
    openCats: {}
  };

  /* urls des pièces */
  App.PIECE_URL = {};
  ['w', 'b'].forEach(function (c) {
    ['P', 'N', 'B', 'R', 'Q', 'K'].forEach(function (t) {
      App.PIECE_URL[c + t] = 'assets/pieces/' + c + t + '.svg';
    });
  });
  App.pieceKey = function (p) { return p.color + p.type.toUpperCase(); };
  App.sqName = function (i) { return Chess.algebraic(i); };

  /* valeurs matérielles (pour l'affichage des pièces prises) */
  App.VALS = { p: 1, n: 3, b: 3, r: 5, q: 9 };

  App.escapeHtml = function (s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  };

  App.$ = function (s) { return document.querySelector(s); };

  /* préférences persistées */
  var DEFAULT_PREFS = {
    autoQueen: false,
    confirmMove: false,
    theme: 'ice',
    evalBar: true,
    showLegal: true,
    showCoords: true,
    anim: true
  };
  App.loadPrefs = function () {
    var p = {};
    try { p = JSON.parse(localStorage.getItem('cheesecom_prefs') || '{}'); } catch (e) { p = {}; }
    App.state.prefs = {};
    for (var k in DEFAULT_PREFS) {
      App.state.prefs[k] = (p[k] !== undefined) ? p[k] : DEFAULT_PREFS[k];
    }
  };
  App.savePrefs = function () {
    localStorage.setItem('cheesecom_prefs', JSON.stringify(App.state.prefs));
  };
  App.loadPrefs();

  /* partie affichée à l'écran (live ou navigation) */
  App.displayGame = function () {
    return App.state.viewGame || App.state.game;
  };

  /* toast */
  var toastTimer = null;
  App.toast = function (msg) {
    var t = App.$('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2200);
  };

  /* l'utilisateur local */
  App.USER = { id: 'metteoof', name: 'metteoof', flag: 'FR' };
  App.USER.avatar = CheeseBots.avatarSVG({ id: 'user-metteoof', robot: false }, 80);

  window.App = App;
})();
