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
      if (cb) cb(e.data);
    };
    aiWorker.onerror = function () { aiWorker = null; };
  }

  App.aiMove = function (fen, rating, aggression, cb) {
    if (aiWorker) {
      var id = ++aiReqId;
      aiPending[id] = function (d) { cb(d.move); };
      aiWorker.postMessage({ id: id, fen: fen, rating: rating, aggression: aggression });
    } else {
      setTimeout(function () {
        var g = new Chess(fen);
        cb(CheeseAI.pickMove(g, { rating: rating, aggression: aggression }));
      }, 10);
    }
  };

  /* analyse un coup joué en variante : classe + meilleure réponse */
  App.exploreMove = function (fen, move, cb) {
    if (aiWorker) {
      var id = ++aiReqId;
      aiPending[id] = function (d) { cb(d.result); };
      aiWorker.postMessage({ id: id, type: 'explore', fen: fen, move: move, depth: 3 });
    } else {
      setTimeout(function () {
        cb(CheeseAI.analyzeMove(new Chess(fen), move, 3));
      }, 10);
    }
  };

  /* meilleur coup à une position (flèche verte en variante) */
  App.bestMoveAt = function (fen, cb) {
    if (aiWorker) {
      var id = ++aiReqId;
      aiPending[id] = function (d) { cb(d.result); };
      aiWorker.postMessage({ id: id, type: 'best', fen: fen, depth: 3 });
    } else {
      setTimeout(function () {
        cb(CheeseAI.bestMove(new Chess(fen), 3));
      }, 10);
    }
  };

  /* ============ jouer un coup ============ */
  App.tryMove = function (fromI, toI, promo) {
    if (S.review) return App.reviewMove(fromI, toI, promo);
    var legal = S.game.legalMoves(App.sqName(fromI));
    var isPromo = legal.some(function (m) { return m.to === toI && (m.flags & Chess.FLAGS.PROMO); });
    if (isPromo && !promo) {
      if (S.prefs.autoQueen) promo = 'q';
      else { App.openPromo(fromI, toI); return true; }
    }
    /* confirmation de coup (option) */
    if (S.prefs.confirmMove) {
      S.pendingConfirm = { from: fromI, to: toI, promotion: promo };
      App.showConfirm(toI);
      return 'pending';
    }
    return App.executeMove(fromI, toI, promo);
  };

  App.executeMove = function (fromI, toI, promo) {
    var mv = S.game.move({ from: App.sqName(fromI), to: App.sqName(toI), promotion: promo });
    if (!mv) return false;
    App.afterMove(mv, 'player');
    return true;
  };

  App.confirmPending = function () {
    var pc = S.pendingConfirm;
    App.hideConfirm();
    if (pc) App.executeMove(pc.from, pc.to, pc.promotion);
  };

  App.cancelConfirm = function () {
    var pc = S.pendingConfirm;
    App.hideConfirm();
    if (pc && S.pieceEls[pc.from]) {
      App.setPiecePos(S.pieceEls[pc.from], pc.from, false);
    }
    App.deselect();
  };

  /* exécute le prochain premove de la file si légal */
  App.runPremove = function () {
    var pm = S.premove.shift();
    if (!pm) return;
    var legal = S.game.legalMoves(pm.from);
    var ok = legal.some(function (m) {
      return m.to === pm.to && (!m.promotion || m.promotion === 'q');
    });
    if (ok) {
      var mv = S.game.move({ from: pm.from, to: pm.to, promotion: 'q' });
      if (mv) { App.afterMove(mv, 'player'); return; }
    }
    /* illégal : celui-ci est jeté, le reste de la file est conservé */
    Sound.illegal();
    App.renderHighlights();
  };

  /* ============ retour en arrière ============ */
  App.takeback = function () {
    if (!S.game || !S.game.history.length) { App.toast('Rien à annuler'); return; }
    if (S.inputLocked) { App.toast('Attends le coup du robot'); return; }
    var undone = 0;
    do {
      S.game.undo();
      undone++;
    } while (S.game.turn !== S.playerColor && S.game.history.length);

    var h = S.game.history;
    S.lastMove = h.length ? { from: h[h.length - 1].from, to: h[h.length - 1].to } : null;
    S.premove = [];
    S.viewGame = null; S.viewPly = null;
    S.varBase = null; S.varMoves = []; S.varPly = 0;
    App.hideConfirm();
    App.closePromo();
    App.deselect();
    App.renderPieces();
    App.renderMoves();
    App.renderCaptured();
    App.renderClocks();
    App.renderHighlights();
    App.updateEval();
    App.botSay(line('takeback'));
    if (S.active && S.game.turn !== S.playerColor) App.scheduleBotMove();
  };

  /* ============ navigation dans les coups ============ */
  /* reconstruit la position affichée : ligne principale + variante éventuelle */
  App.buildViewGame = function () {
    var g = new Chess(S.game._startFen || undefined);
    var n = S.viewPly == null ? S.game.history.length : S.viewPly;
    var hist = S.game.history;
    for (var i = 0; i < n && i < hist.length; i++) {
      var h = hist[i];
      g.move({ from: h.from, to: h.to, promotion: h.promotion });
    }
    if (S.varBase != null) {
      for (var j = 0; j < S.varPly; j++) {
        var v = S.varMoves[j];
        g.move({ from: v.from, to: v.to, promotion: v.promotion });
      }
    }
    return g;
  };

  App.viewPly = function (n) {
    if (!S.game) return;
    var len = S.game.history.length;
    /* quitter la variante : la navigation se fait sur la ligne principale */
    S.varBase = null; S.varMoves = []; S.varPly = 0; S.varReply = null;
    if (n == null || n >= len) {
      S.viewGame = null; S.viewPly = null;
    } else {
      if (n < 0) n = 0;
      S.viewPly = n;
      S.viewGame = App.buildViewGame();
    }
    S.premove = [];
    App.hideConfirm();
    App.closePromo();
    S.selected = -1; S.legalFrom = [];
    App.renderPieces();
    App.renderMoves();
    App.renderHighlights();
    App.updateEval();
  };

  /* avancer/reculer dans la variante en cours */
  App.varStep = function (d) {
    if (S.varBase == null) return;
    S.varPly = Math.max(0, Math.min(S.varMoves.length, S.varPly + d));
    S.viewGame = App.buildViewGame();
    App.hideConfirm();
    App.closePromo();
    S.selected = -1; S.legalFrom = [];
    App.renderPieces();
    App.renderMoves();
    App.renderHighlights();
    App.updateEval();
    if (App.requestVarHint) App.requestVarHint();
  };

  /* navigation unifiée : traverse la variante si active, sinon la ligne principale */
  App.stepBack = function () {
    if (S.varBase != null && S.varPly > 0) App.varStep(-1);
    else App.viewPly(S.viewPly == null ? S.game.history.length - 1 : S.viewPly - 1);
  };
  App.stepFwd = function () {
    if (S.varBase != null && S.varPly < S.varMoves.length) App.varStep(1);
    else if (S.viewPly != null) App.viewPly(S.viewPly + 1);
  };

  /* ============ barre d'évaluation ============ */
  App.updateEval = function () {
    var g = App.displayGame();
    if (!g) return;
    var wcp;
    if (S.review && S.review.evalsW && S.varBase == null) {
      var ply = S.viewPly == null ? S.game.history.length : S.viewPly;
      wcp = ply === 0 ? S.review.ev0W : S.review.evalsW[ply - 1];
    } else {
      var cp = CheeseAI.evaluate(g, 0);
      wcp = g.turn === 'w' ? cp : -cp;
    }
    var pct = 1 / (1 + Math.pow(10, -wcp / 400)) * 100;
    var label = (wcp >= 0 ? '+' : '') + (wcp / 100).toFixed(1);
    var hist = g.history;
    if (Math.abs(wcp) > CheeseAI.MATE - 2000 ||
        (hist.length && hist[hist.length - 1].san.slice(-1) === '#')) {
      pct = wcp >= 0 ? 100 : 0;
      label = '#';
    }
    App.$('#eval-bar').classList.toggle('flipped', S.flipped);
    App.$('#eval-fill').style.height = pct + '%';
    var num = App.$('#eval-num');
    num.textContent = label;
    /* le label est en bas de barre : sombre si la zone est blanche */
    num.style.color = pct > 62 ? '#2b2b2b' : '#e8e6e3';
  };

  App.afterMove = function (mv, who) {
    S.lastMove = { from: mv.from, to: mv.to };
    S.hintArrow = null;
    S.viewGame = null; S.viewPly = null;
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

    App.updateEval();
    App.checkGameEnd();
    if (S.active && S.game.turn !== S.playerColor) {
      App.scheduleBotMove();
    } else if (S.active && S.premove.length) {
      App.runPremove();
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
    S.premove = [];
    App.hideConfirm();
    App.stopClocks();
    App.botThink(false);
    App.renderClocks();

    var title;
    if (outcome === 'draw') title = 'Partie nulle';
    else {
      var wColor = result === '1-0' ? 'w' : 'b';
      var winnerName = wColor === S.playerColor ? App.USER.name : S.bot.name;
      title = winnerName + ' a gagné';
    }
    $('#overlay-result').textContent = result;
    $('#overlay-title').textContent = title;
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
    S.premove = [];
    S.pendingConfirm = null;
    S.viewGame = null; S.viewPly = null;
    S.varBase = null; S.varMoves = []; S.varPly = 0;
    S.review = null;
    App.hideConfirm();

    $('#board-overlay').classList.add('hidden');
    $('#panel-select').classList.add('hidden');
    $('#panel-analysis').classList.add('hidden');
    $('#panel-game').classList.remove('hidden');
    $('#chat-area').innerHTML = '';
    $('#game-vs').textContent = S.bot.name + ' (' + S.bot.rating + ') vs ' + App.USER.name;

    App.buildSquares();
    App.renderCards();
    App.renderMoves();
    App.renderCaptured();
    App.renderClocks();
    App.updateEval();
    App.startClocks();
    Sound.start();

    setTimeout(function () { App.botSay(line('start')); }, 700);

    if (S.game.turn !== S.playerColor) App.scheduleBotMove();
  };

  App.backToSelect = function () {
    S.active = false;
    App.stopClocks();
    App.botThink(false);
    S.premove = [];
    S.viewGame = null; S.viewPly = null;
    S.varBase = null; S.varMoves = []; S.varPly = 0;
    S.review = null;
    if (App.stopAnalysis) App.stopAnalysis();
    App.hideConfirm();
    $('#board-overlay').classList.add('hidden');
    $('#panel-game').classList.add('hidden');
    $('#panel-analysis').classList.add('hidden');
    $('#panel-select').classList.remove('hidden');
    App.closePromo();
    App.deselect();
  };

  /* ============ export PGN ============ */
  App.copyPGN = function () {
    var g = S.game;
    if (!g || !g.history.length) { App.toast('Aucun coup à copier'); return; }
    var res = S.active ? '*' : ($('#overlay-result').textContent || '*');
    var d = new Date();
    var pad = function (x) { return (x < 10 ? '0' : '') + x; };
    var date = d.getFullYear() + '.' + pad(d.getMonth() + 1) + '.' + pad(d.getDate());
    var wName = S.playerColor === 'w' ? App.USER.name : S.bot.name;
    var bName = S.playerColor === 'w' ? S.bot.name : App.USER.name;
    var pgn = '[Event "Partie amicale Cheese.com"]\n' +
      '[Site "Cheese.com"]\n[Date "' + date + '"]\n' +
      '[White "' + wName + '"]\n[Black "' + bName + '"]\n' +
      '[Result "' + res + '"]\n\n';
    for (var i = 0; i < g.history.length; i++) {
      if (i % 2 === 0) pgn += (i / 2 + 1) + '. ';
      pgn += g.history[i].san + ' ';
    }
    pgn += res;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(pgn).then(
        function () { App.toast('PGN copiée !'); },
        function () { App.fallbackCopy(pgn); });
    } else {
      App.fallbackCopy(pgn);
    }
  };

  App.fallbackCopy = function (text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    App.toast(ok ? 'PGN copiée !' : 'Copie impossible');
  };

  /* ============ actions joueur ============ */
  App.resign = function () {
    if (!S.active) return;
    $('#resign-modal').classList.remove('hidden');
  };

  App.confirmResign = function () {
    $('#resign-modal').classList.add('hidden');
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
