/* ============================================================
   cheesecom — point d'entrée : initialisation + bindings UI
   ============================================================ */
(function () {
  'use strict';

  var S = App.state;
  var Sound = App.Sound;
  var $ = App.$;

  function toggleSound() {
    Sound.on = !Sound.on;
    $('#btn-sound').classList.toggle('off', !Sound.on);
    $('#panel-sound').classList.toggle('off', !Sound.on);
    if (Sound.on) Sound.select();
  }

  function init() {
    $('#user-avatar').innerHTML = App.USER.avatar;

    /* échiquier initial (position de départ, bot affiché) */
    App.selectedBot = CheeseBots.GROUPS[0].bots[0];
    S.game = new Chess();
    S.bot = App.selectedBot;
    S.flipped = false;
    S.playerColor = 'w';
    App.buildSquares();
    App.renderCards();

    /* récompenses */
    $('#rw-count').textContent = S.rewards + '/125';
    $('#reward-fill').style.width = (S.rewards / 125 * 100) + '%';

    App.renderBotCard();
    App.renderBotsList();

    /* events board */
    var board = $('#board');
    board.addEventListener('pointerdown', App.onPointerDown);
    board.addEventListener('pointermove', App.onPointerMove);
    board.addEventListener('pointerup', App.onPointerUp);
    board.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    /* panneau sélection */
    $('#btn-play').onclick = function () { S.bot = App.selectedBot; App.startGame(); };
    $('#options-row').onclick = function () {
      $('#options-row').classList.toggle('open');
      $('#options-body').classList.toggle('hidden');
    };
    document.querySelectorAll('#seg-color .seg-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#seg-color .seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        S.colorChoice = b.dataset.color;
      };
    });
    document.querySelectorAll('#seg-time .seg-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#seg-time .seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        S.timeControl = b.dataset.tc;
      };
    });
    document.querySelectorAll('#seg-theme .seg-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#seg-theme .seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        S.prefs.theme = b.dataset.theme;
        App.applyPrefs();
      };
    });
    document.querySelectorAll('#seg-promo .seg-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#seg-promo .seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        S.prefs.autoQueen = b.dataset.promo === 'auto';
        App.applyPrefs();
      };
    });
    document.querySelectorAll('#seg-confirm .seg-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#seg-confirm .seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        S.prefs.confirmMove = b.dataset.confirm === 'on';
        App.applyPrefs();
      };
    });
    $('#tgl-eval').onchange = function () { S.prefs.evalBar = this.checked; App.applyPrefs(); };
    $('#tgl-legal').onchange = function () { S.prefs.showLegal = this.checked; App.applyPrefs(); };
    $('#tgl-coords').onchange = function () { S.prefs.showCoords = this.checked; App.applyPrefs(); };
    $('#tgl-anim').onchange = function () { S.prefs.anim = this.checked; App.applyPrefs(); };

    /* état initial des options depuis les prefs */
    document.querySelectorAll('#seg-theme .seg-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.theme === S.prefs.theme);
    });
    document.querySelectorAll('#seg-promo .seg-btn').forEach(function (b) {
      b.classList.toggle('active', (b.dataset.promo === 'auto') === S.prefs.autoQueen);
    });
    document.querySelectorAll('#seg-confirm .seg-btn').forEach(function (b) {
      b.classList.toggle('active', (b.dataset.confirm === 'on') === S.prefs.confirmMove);
    });
    $('#tgl-eval').checked = S.prefs.evalBar;
    $('#tgl-legal').checked = S.prefs.showLegal;
    $('#tgl-coords').checked = S.prefs.showCoords;
    $('#tgl-anim').checked = S.prefs.anim;
    App.applyPrefs();

    /* actions partie */
    $('#btn-resign').onclick = App.resign;
    $('#btn-resign').classList.add('danger');
    $('#btn-draw').onclick = App.offerDraw;
    $('#btn-takeback').onclick = App.takeback;
    $('#btn-hint2').onclick = App.hint;
    $('#btn-pgn').onclick = App.copyPGN;
    $('#btn-quit').onclick = App.backToSelect;
    $('#cfm-ok').onclick = function (e) { e.stopPropagation(); App.confirmPending(); };
    $('#cfm-no').onclick = function (e) { e.stopPropagation(); App.cancelConfirm(); };
    $('#btn-rematch').onclick = App.startGame;
    $('#btn-newbot').onclick = App.backToSelect;
    $('#overlay-close').onclick = function () { $('#board-overlay').classList.add('hidden'); };
    $('#resign-ok').onclick = App.confirmResign;
    $('#resign-cancel').onclick = function () { $('#resign-modal').classList.add('hidden'); };
    $('#btn-flip').onclick = function () {
      S.flipped = !S.flipped;
      App.buildSquares();
      App.renderCards();
      App.renderCaptured();
      App.updateEval();
      App.closePromo();
      App.deselect();
    };
    $('#btn-hint').onclick = App.hint;
    $('#btn-sound').onclick = toggleSound;
    $('#panel-sound').onclick = toggleSound;
    $('#panel-menu').onclick = App.backToSelect;
    App.initAnalysis();

    window.addEventListener('resize', App.renderHighlights);
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { App.deselect(); App.closePromo(); App.hideConfirm(); }
      else if (e.key === 'ArrowLeft' && S.game) {
        App.stepBack();
      } else if (e.key === 'ArrowRight' && S.game) {
        App.stepFwd();
      } else if (e.key === 'Home' && S.game) {
        App.viewPly(0);
      } else if (e.key === 'End' && S.game) {
        App.viewPly(null);
      } else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) {
        S.flipped = !S.flipped;
        App.buildSquares();
        App.renderCards();
        App.renderCaptured();
        App.updateEval();
        App.closePromo(); App.hideConfirm(); App.deselect();
      }
    });

    /* handle de debug : activé via ?debug ou localStorage.cheesecom_debug */
    if (/[?&]debug/.test(location.search) || localStorage.getItem('cheesecom_debug')) {
      window.__cheese = S;
      window.__api = {
        startGame: App.startGame, tryMove: App.tryMove, resign: App.resign,
        offerDraw: App.offerDraw,
        selectBot: function (id) {
          var b = CheeseBots.findBot(id);
          if (b) { App.selectedBot = b; App.renderBotCard(); }
        },
        setFen: function (fen) {
          S.game = new Chess(fen);
          App.renderPieces(); App.renderMoves(); App.renderCaptured(); App.renderHighlights();
        }
      };
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
