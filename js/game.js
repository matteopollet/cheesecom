/* ============================================================
   cheesecom — flux de partie : coups, tour du bot, fins de partie
   ============================================================ */
(function () {
  'use strict';

  var S = App.state;
  var Sound = App.Sound;
  var $ = App.$;
  var line = CheeseBots.line;

  /* ============ worker IA ============ */
  var aiWorker = null, aiReqId = 0, aiPending = {};
  try { aiWorker = new Worker('js/ai-worker.js'); } catch (e) { aiWorker = null; }
  if (aiWorker) {
    aiWorker.onmessage = function (e) {
      var cb = aiPending[e.data.id];
      delete aiPending[e.data.id];
      if (cb) cb(e.data.move);
    };
    aiWorker.onerror = function () { aiWorker = null; };
  }

  App.aiMove = function (fen, rating, aggression, cb) {
    if (aiWorker) {
      var id = ++aiReqId;
      aiPending[id] = cb;
      aiWorker.postMessage({ id: id, fen: fen, rating: rating, aggression: aggression });
    } else {
      setTimeout(function () {
        var g = new Chess(fen);
        cb(CheeseAI.pickMove(g, { rating: rating, aggression: aggression }));
      }, 10);
    }
  };

  /* ============ jouer un coup ============ */
  App.tryMove = function (fromI, toI, promo) {
    var legal = S.game.legalMoves(App.sqName(fromI));
    var isPromo = legal.some(function (m) { return m.to === toI && (m.flags & Chess.FLAGS.PROMO); });
    if (isPromo && !promo) {
      App.openPromo(fromI, toI);
      return true;
    }
    var mv = S.game.move({ from: App.sqName(fromI), to: App.sqName(toI), promotion: promo });
    if (!mv) return false;
    App.afterMove(mv, 'player');
    return true;
  };

  App.afterMove = function (mv, who) {
    S.lastMove = { from: mv.from, to: mv.to };
    S.hintArrow = null;
    App.deselect();
    App.clearMarksSilent();
    App.applyMoveUI(mv);
    App.renderHighlights();
    App.renderMoves();
    App.renderCaptured();
    App.renderClocks();

    if (mv.flags & Chess.FLAGS.CAPTURE || mv.flags & Chess.FLAGS.EP) Sound.capture();
    else if (mv.flags & (Chess.FLAGS.KSIDE | Chess.FLAGS.QSIDE)) Sound.castle();
    else Sound.move();
    if (mv.san.indexOf('+') >= 0) setTimeout(function () { Sound.check(); }, 140);

    /* réactions du bot */
    if (who === 'player') {
      if (mv.captured && Math.random() < 0.5) App.botSay(line('userCapture'));
      else if (mv.san.indexOf('+') >= 0 && Math.random() < 0.6) App.botSay(line('userCheck'));
    } else {
      if (mv.captured && Math.random() < 0.4) App.botSay(line('botCapture'));
      else if (mv.san.indexOf('+') >= 0) App.botSay(line('botCheck'));
    }

    App.checkGameEnd();
    if (S.active && S.game.turn !== S.playerColor) {
      App.scheduleBotMove();
    }
  };

  /* ============ tour du bot ============ */
  App.scheduleBotMove = function () {
    S.inputLocked = true;
    App.botThink(true);
    var wait = CheeseAI.thinkTime(S.bot.rating);
    var fen = S.game.fen();
    var bot = S.bot;

    /* occasionnellement, un commentaire */
    if (Math.random() < 0.12 && S.msgCount > 0) {
      setTimeout(function () { if (S.inputLocked) App.botSay(line('think')); }, Math.min(600, wait / 2));
    }

    App.aiMove(fen, bot.rating, bot.aggression, function (mv) {
      setTimeout(function () {
        App.botThink(false);
        S.inputLocked = false;
        if (!S.active || !mv) return;
        var done = S.game.move(mv);
        if (done) App.afterMove(done, 'bot');
      }, wait);
    });
  };

  /* ============ fin de partie ============ */
  App.checkGameEnd = function () {
    var g = S.game;
    if (g.isCheckmate()) {
      var winner = g.turn === 'w' ? 'b' : 'w';
      App.endGame(winner === 'w' ? '1-0' : '0-1', 'par échec et mat', winner === S.playerColor ? 'win' : 'lose');
    } else if (g.isStalemate()) {
      App.endGame('½-½', 'par pat', 'draw');
    } else if (g.isInsufficientMaterial()) {
      App.endGame('½-½', 'matériel insuffisant', 'draw');
    } else if (g.isThreefoldRepetition()) {
      App.endGame('½-½', 'par triple répétition', 'draw');
    } else if (g.halfMoves >= 100) {
      App.endGame('½-½', 'règle des 50 coups', 'draw');
    }
  };

  App.endGame = function (result, reason, outcome) {
    if (!S.active) return;
    S.active = false;
    S.inputLocked = true;
    App.stopClocks();
    App.botThink(false);
    App.renderClocks();

    var titles = { win: 'Victoire !', lose: 'Défaite', draw: 'Partie nulle' };
    $('#overlay-result').textContent = result;
    $('#overlay-result').style.color = outcome === 'win' ? 'var(--yellow)' : outcome === 'lose' ? '#e8e6e3' : 'var(--muted)';
    $('#overlay-title').textContent = titles[outcome];
    $('#overlay-sub').textContent = reason;
    $('#board-overlay').classList.remove('hidden');

    if (outcome === 'win') { Sound.win(); setTimeout(function () { App.botSay(line('lose')); }, 800); App.addRewards(50); }
    else if (outcome === 'lose') { Sound.lose(); setTimeout(function () { App.botSay(line('win')); }, 800); App.addRewards(15); }
    else { Sound.draw(); setTimeout(function () { App.botSay(line('drawOk')); }, 800); App.addRewards(25); }
  };

  /* ============ démarrage / retour ============ */
  App.startGame = function () {
    App.closePromo();
    var color = S.colorChoice;
    if (color === 'random') color = Math.random() < 0.5 ? 'w' : 'b';
    S.playerColor = color;
    S.flipped = color === 'b';
    S.game = new Chess();
    S.active = true;
    S.inputLocked = false;
    S.selected = -1;
    S.legalFrom = [];
    S.lastMove = null;
    S.userMarks = {};
    S.userArrows = [];
    S.hintArrow = null;
    S.msgCount = 0;

    $('#board-overlay').classList.add('hidden');
    $('#panel-select').classList.add('hidden');
    $('#panel-game').classList.remove('hidden');
    $('#chat-area').innerHTML = '';
    $('#game-vs').textContent = S.bot.name + ' (' + S.bot.rating + ') vs ' + App.USER.name;

    App.buildSquares();
    App.renderCards();
    App.renderMoves();
    App.renderCaptured();
    App.renderClocks();
    App.startClocks();
    Sound.start();

    setTimeout(function () { App.botSay(line('start')); }, 700);

    if (S.game.turn !== S.playerColor) App.scheduleBotMove();
  };

  App.backToSelect = function () {
    S.active = false;
    App.stopClocks();
    App.botThink(false);
    $('#board-overlay').classList.add('hidden');
    $('#panel-game').classList.add('hidden');
    $('#panel-select').classList.remove('hidden');
    App.closePromo();
    App.deselect();
  };

  /* ============ actions joueur ============ */
  App.resign = function () {
    if (!S.active) return;
    var res = S.playerColor === 'w' ? '0-1' : '1-0';
    App.botSay(line('resign'));
    App.endGame(res, 'par abandon', 'lose');
  };

  App.offerDraw = function () {
    if (!S.active) return;
    var g = S.game;
    var evalNow = CheeseAI.evaluate(g, S.bot.aggression); /* du point de vue du trait */
    var botToMove = g.turn !== S.playerColor;
    var botScore = botToMove ? evalNow : -evalNow;

    var pieces = 0;
    for (var i = 0; i < 64; i++) if (g.board[i] && g.board[i].type !== 'k') pieces++;

    App.botSay('...');
    setTimeout(function () {
      var msgs = document.querySelectorAll('#chat-area .chat-msg');
      if (msgs.length) msgs[msgs.length - 1].remove();
      if (botScore < -150 || (pieces <= 4 && Math.abs(botScore) < 80) || g.halfMoves > 80) {
        App.botSay(line('drawOk'));
        App.endGame('½-½', 'par accord mutuel', 'draw');
      } else {
        App.botSay(line('drawNo'));
      }
    }, 900 + Math.random() * 900);
  };

  App.hint = function () {
    if (!S.active || S.game.turn !== S.playerColor) return;
    var fen = S.game.fen();
    App.aiMove(fen, 2100, 0, function (mv) {
      if (!mv) return;
      S.hintArrow = { from: Chess.SQUARE_INDEX(mv.from), to: Chess.SQUARE_INDEX(mv.to) };
      App.renderHighlights();
      setTimeout(function () { S.hintArrow = null; App.renderHighlights(); }, 2600);
    });
  };
})();
