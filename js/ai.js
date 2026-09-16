/* ============================================================
   cheesecom — IA (alpha-beta + tables positionnelles)
   Niveaux calibrés par "rating" du bot : profondeur,
   bruit d'évaluation, taux d'erreur, variété de choix.
   ============================================================ */
(function (global) {
  'use strict';

  var Chess = (typeof module !== 'undefined' && module.exports)
    ? require('./engine.js')
    : global.Chess;

  var VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };

  /* tables positionnelles (du point de vue blanc, index 0 = a8) */
  var PST = {
    p: [
       0,  0,  0,  0,  0,  0,  0,  0,
      50, 50, 50, 50, 50, 50, 50, 50,
      10, 10, 20, 30, 30, 20, 10, 10,
       5,  5, 10, 25, 25, 10,  5,  5,
       0,  0,  0, 20, 20,  0,  0,  0,
       5, -5,-10,  0,  0,-10, -5,  5,
       5, 10, 10,-20,-20, 10, 10,  5,
       0,  0,  0,  0,  0,  0,  0,  0],
    n: [
     -50,-40,-30,-30,-30,-30,-40,-50,
     -40,-20,  0,  0,  0,  0,-20,-40,
     -30,  0, 10, 15, 15, 10,  0,-30,
     -30,  5, 15, 20, 20, 15,  5,-30,
     -30,  0, 15, 20, 20, 15,  0,-30,
     -30,  5, 10, 15, 15, 10,  5,-30,
     -40,-20,  0,  5,  5,  0,-20,-40,
     -50,-40,-30,-30,-30,-30,-40,-50],
    b: [
     -20,-10,-10,-10,-10,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5, 10, 10,  5,  0,-10,
     -10,  5,  5, 10, 10,  5,  5,-10,
     -10,  0, 10, 10, 10, 10,  0,-10,
     -10, 10, 10, 10, 10, 10, 10,-10,
     -10,  5,  0,  0,  0,  0,  5,-10,
     -20,-10,-10,-10,-10,-10,-10,-20],
    r: [
       0,  0,  0,  0,  0,  0,  0,  0,
       5, 10, 10, 10, 10, 10, 10,  5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
      -5,  0,  0,  0,  0,  0,  0, -5,
       0,  0,  0,  5,  5,  0,  0,  0],
    q: [
     -20,-10,-10, -5, -5,-10,-10,-20,
     -10,  0,  0,  0,  0,  0,  0,-10,
     -10,  0,  5,  5,  5,  5,  0,-10,
      -5,  0,  5,  5,  5,  5,  0, -5,
       0,  0,  5,  5,  5,  5,  0, -5,
     -10,  5,  5,  5,  5,  5,  0,-10,
     -10,  0,  5,  0,  0,  0,  0,-10,
     -20,-10,-10, -5, -5,-10,-10,-20],
    k: [
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -30,-40,-40,-50,-50,-40,-40,-30,
     -20,-30,-30,-40,-40,-30,-30,-20,
     -10,-20,-20,-20,-20,-20,-20,-10,
      20, 20,  0,  0,  0,  0, 20, 20,
      20, 30, 10,  0,  0, 10, 30, 20]
  };

  var MATE = 100000;
  var nodeCount = 0, nodeLimit = 300000;

  function mirror(i) { /* index blanc -> index noir (miroir vertical) */
    return (7 - (i >> 3)) * 8 + (i & 7);
  }

  function evaluate(game, aggression) {
    var score = 0;
    for (var i = 0; i < 64; i++) {
      var p = game.board[i];
      if (!p) continue;
      var v = VALUES[p.type] + PST[p.type][p.color === 'w' ? i : mirror(i)];
      score += (p.color === 'w') ? v : -v;
    }
    /* léger bonus d'attaque pour les bots agressifs */
    if (aggression) {
      var kingW = game.kingSquare('w'), kingB = game.kingSquare('b');
      if (kingW >= 0) {
        var att = countAttackersAround(game, kingW, 'b');
        score -= att * 12 * aggression;
      }
      if (kingB >= 0) {
        var att2 = countAttackersAround(game, kingB, 'w');
        score += att2 * 12 * aggression;
      }
    }
    return (game.turn === 'w') ? score : -score;
  }

  function countAttackersAround(game, kingSq, byColor) {
    var f = kingSq & 7, r = kingSq >> 3, n = 0;
    for (var dr = -1; dr <= 1; dr++) for (var df = -1; df <= 1; df++) {
      var nf = f + df, nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 0 && nr < 8 && game.isAttacked(nr * 8 + nf, byColor)) n++;
    }
    return n;
  }

  function orderMoves(game, moves) {
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i], s = 0;
      if (m.captured) s += 10 * VALUES[m.captured] - VALUES[m.piece];
      if (m.promotion) s += VALUES[m.promotion];
      if (m.flags & 32 || m.flags & 16) s += 30; /* roque */
      m._score = s;
    }
    moves.sort(function (a, b) { return b._score - a._score; });
    return moves;
  }

  function quiesce(game, alpha, beta, aggression, depth) {
    nodeCount++;
    if (nodeCount > nodeLimit) return evaluate(game, aggression);
    var stand = evaluate(game, aggression);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (depth <= 0) return alpha;
    var moves = orderMoves(game, game.legalMoves());
    for (var i = 0; i < moves.length; i++) {
      var m = moves[i];
      if (!m.captured && !m.promotion) continue; /* captures/promos seulement */
      game._make(m);
      var score = -quiesce(game, -beta, -alpha, aggression, depth - 1);
      game._unmake();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function search(game, depth, alpha, beta, aggression) {
    nodeCount++;
    if (nodeCount > nodeLimit) return evaluate(game, aggression);
    if (depth === 0) return quiesce(game, alpha, beta, aggression, 6);
    var moves = orderMoves(game, game.legalMoves());
    if (moves.length === 0) {
      return game.inCheck(game.turn) ? -MATE - depth : 0;
    }
    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      game._make(moves[i]);
      var score = -search(game, depth - 1, -beta, -alpha, aggression);
      game._unmake();
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  /* profondeur & style selon le rating du bot */
  function paramsFor(rating) {
    if (rating < 400)  return { depth: 1, jitter: 220, blunder: 0.35, topN: 10, limit: 20000 };
    if (rating < 650)  return { depth: 1, jitter: 140, blunder: 0.22, topN: 6,  limit: 40000 };
    if (rating < 900)  return { depth: 2, jitter: 100, blunder: 0.14, topN: 4,  limit: 80000 };
    if (rating < 1250) return { depth: 2, jitter: 60,  blunder: 0.07, topN: 3,  limit: 120000 };
    if (rating < 1600) return { depth: 3, jitter: 35,  blunder: 0.03, topN: 2,  limit: 200000 };
    if (rating < 2000) return { depth: 3, jitter: 15,  blunder: 0.01, topN: 1,  limit: 300000 };
    return               { depth: 4, jitter: 5,   blunder: 0,    topN: 1,  limit: 400000 };
  }

  /**
   * Choisit un coup. opts = { rating, aggression (0..2), seed }
   * Retourne {from:'e2', to:'e4', promotion?} ou null.
   */
  function pickMove(game, opts) {
    opts = opts || {};
    var rating = opts.rating != null ? opts.rating : 800;
    var aggression = opts.aggression || 0;
    var par = paramsFor(rating);

    var legal = game.legalMoves();
    if (legal.length === 0) return null;

    /* blunder volontaire : coup totalement aléatoire */
    if (Math.random() < par.blunder) {
      var rm = legal[Math.floor(Math.random() * legal.length)];
      return toAlg(rm);
    }

    nodeLimit = par.limit;
    nodeCount = 0;

    /* score de chaque coup à profondeur-1 (le coup est déjà compté) */
    var scored = [];
    var ordered = orderMoves(game, legal);
    for (var i = 0; i < ordered.length; i++) {
      var m = ordered[i];
      game._make(m);
      var s;
      if (game.legalMoves().length === 0) {
        s = game.inCheck(game.turn) ? MATE + 10 : 0;
      } else {
        s = -search(game, par.depth - 1, -Infinity, Infinity, aggression);
      }
      game._unmake();
      s += (Math.random() - 0.5) * par.jitter;
      scored.push({ m: m, s: s });
      if (nodeCount > nodeLimit) break;
    }
    scored.sort(function (a, b) { return b.s - a.s; });

    /* choisit parmi les topN meilleurs (variété) */
    var n = Math.min(par.topN, scored.length);
    var idx = Math.floor(Math.random() * n);
    return toAlg(scored[idx].m);
  }

  function toAlg(m) {
    var out = { from: Chess.algebraic(m.from), to: Chess.algebraic(m.to) };
    if (m.promotion) out.promotion = m.promotion;
    return out;
  }

  /**
   * Note tous les coups légaux à la profondeur donnée (sans bruit).
   * Retourne [{ m, s }] trié par score décroissant (point de vue du trait).
   */
  function scoreMoves(game, depth, limit) {
    nodeLimit = limit || 120000;
    nodeCount = 0;
    var scored = [];
    var ordered = orderMoves(game, game.legalMoves());
    for (var i = 0; i < ordered.length; i++) {
      var m = ordered[i];
      game._make(m);
      var s;
      if (game.legalMoves().length === 0) {
        s = game.inCheck(game.turn) ? MATE + 10 : 0;
      } else {
        s = -search(game, depth - 1, -Infinity, Infinity, 0);
      }
      game._unmake();
      scored.push({ m: m, s: s });
      if (nodeCount > nodeLimit) break;
    }
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored;
  }

  /* durée de "réflexion" simulée selon le niveau */
  function thinkTime(rating) {
    var base = rating < 600 ? 250 + Math.random() * 700
           : rating < 1200 ? 500 + Math.random() * 1200
           : 800 + Math.random() * 2200;
    return base;
  }

  /* ============ analyse de partie (style chess.com) ============ */

  /* SAN complet (+/# compris) d'un coup légal */
  function sanOf(game, m, legal) {
    var san = game._san(m, legal);
    game._make(m);
    if (game.inCheck(game.turn)) san += game.legalMoves().length === 0 ? '#' : '+';
    game._unmake();
    return san;
  }

  /* coup "évident" : recapture rentable ou roque -> jamais brillant */
  function isTrivial(m) {
    if (m.flags & (Chess.FLAGS.KSIDE | Chess.FLAGS.QSIDE)) return true;
    if (m.captured && VALUES[m.captured] >= VALUES[m.piece]) return true;
    return false;
  }

  /* le coup est-il "difficile à trouver" ? mat, ou pièce laissée en prise (sacrifice) */
  function isHardToFind(game, m, san) {
    if (san.slice(-1) === '#') return true;
    var enemy = m.color === 'w' ? 'b' : 'w';
    game._make(m);
    /* sacrifice : la pièce est attaquée et n'est pas défendue */
    var enPrise = game.isAttacked(m.to, enemy) && !game.isAttacked(m.to, m.color);
    game._unmake();
    return enPrise;
  }

  /**
   * Classe un coup joué.
   * best/played : {m, s} depuis scoreMoves (s = centipions, point de vue du trait)
   */
  function classifyMove(game, m, best, played, gap, san) {
    var playedIsBest = played && played.m === best.m;
    if (playedIsBest) {
      return (gap >= 200 && !isTrivial(m) && isHardToFind(game, m, san))
        ? 'brillant' : 'meilleur';
    }
    var bestS = best.s, playedS = played ? played.s : -MATE;
    var loss = bestS - playedS;
    /* coup manqué : le meilleur coup gagnait nettement (ou matait) et le coup joué laisse tout filer */
    if (bestS >= 300 && playedS <= 80) return 'manque';
    if (loss <= 60) return 'bon';
    if (loss <= 160) return 'imprecision';
    if (loss <= 350) return 'erreur';
    return 'gaffe';
  }

  /* probabilité de gain façon lichess (0..100), pour la précision */
  function winPercent(cp) {
    var c = Math.max(-1000, Math.min(1000, cp));
    return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
  }

  /**
   * Analyse une partie entière.
   * startFen : FEN initial, moves : [{from:'e2',to:'e4',promotion?}]
   * onProgress(done, total) appelé après chaque demi-coup.
   * Retourne { plies:[...], accuracy:{w,b} }
   */
  function analyzeGame(startFen, moves, onProgress, depth) {
    var game = new Chess(startFen || undefined);
    var plies = [];
    var acc = { w: [], b: [] };
    depth = depth || 3;

    for (var i = 0; i < moves.length; i++) {
      var scored = scoreMoves(game, depth, 150000);
      if (!scored.length) break;
      var best = scored[0];
      var second = scored[1] || null;
      var gap = second ? best.s - second.s : 0;

      var mv = moves[i];
      var fromI = Chess.SQUARE_INDEX(mv.from), toI = Chess.SQUARE_INDEX(mv.to);
      var played = null, legal = game.legalMoves();
      for (var j = 0; j < scored.length; j++) {
        var sm = scored[j].m;
        if (sm.from === fromI && sm.to === toI &&
            (sm.promotion || undefined) === (mv.promotion || undefined)) {
          played = scored[j]; break;
        }
      }

      var m = played ? played.m : null;
      for (var k = 0; k < legal.length; k++) {
        if (legal[k].from === fromI && legal[k].to === toI &&
            (legal[k].promotion || undefined) === (mv.promotion || undefined)) { m = legal[k]; break; }
      }
      if (!m) break; /* coup illégal : on arrête */

      /* le coup joué n'a pas été noté (budget nœuds épuisé) : le noter à part */
      if (!played) {
        game._make(m);
        var s = game.legalMoves().length === 0
          ? (game.inCheck(game.turn) ? MATE + 10 : 0)
          : -search(game, depth - 1, -Infinity, Infinity, 0);
        game._unmake();
        played = { m: m, s: s };
      }

      var bestSan = sanOf(game, best.m, legal);
      var san = sanOf(game, m, legal);
      var cls = classifyMove(game, m, best, played, gap, san);
      var playedS = played ? played.s : -MATE;

      /* précision du coup (formule win%, du point de vue du trait) */
      var wpLoss = Math.max(0, winPercent(best.s) - winPercent(playedS));
      var moveAcc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * wpLoss) - 3.1669));
      acc[game.turn].push(moveAcc);

      plies.push({
        san: san, cls: cls, color: game.turn,
        evalBefore: best.s, evalAfter: playedS,
        bestSan: bestSan, best: toAlg(best.m),
        loss: Math.max(0, best.s - playedS)
      });

      game._make(m);
      game.history.push({ from: mv.from, to: mv.to, piece: m.piece, color: m.color,
        captured: m.captured, promotion: m.promotion, flags: m.flags, san: san });
      game._recordPos();
      if (onProgress) onProgress(i + 1, moves.length);
    }

    var mean = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; };
    return {
      plies: plies,
      accuracy: { w: Math.round(mean(acc.w) * 10) / 10, b: Math.round(mean(acc.b) * 10) / 10 }
    };
  }

  var api = { pickMove: pickMove, evaluate: evaluate, thinkTime: thinkTime, paramsFor: paramsFor,
    scoreMoves: scoreMoves, analyzeGame: analyzeGame, MATE: MATE, VALUES: VALUES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CheeseAI = api;

})(typeof window !== 'undefined' ? window : globalThis);
