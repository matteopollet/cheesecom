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

    /* actions partie */
    $('#btn-resign').onclick = App.resign;
    $('#btn-resign').classList.add('danger');
    $('#btn-draw').onclick = App.offerDraw;
    $('#btn-hint2').onclick = App.hint;
    $('#btn-quit').onclick = App.backToSelect;
    $('#btn-rematch').onclick = App.startGame;
    $('#btn-newbot').onclick = App.backToSelect;
    $('#btn-flip').onclick = function () {
      S.flipped = !S.flipped;
      App.buildSquares();
      App.closePromo();
      App.deselect();
    };
    $('#btn-hint').onclick = App.hint;
    $('#btn-sound').onclick = toggleSound;
    $('#panel-sound').onclick = toggleSound;
    $('#panel-menu').onclick = App.backToSelect;

    window.addEventListener('resize', App.renderHighlights);
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { App.deselect(); App.closePromo(); }
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
