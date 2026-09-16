/* ============================================================
   cheesecom — parseur PGN (format chess.com)
   Extrait les en-têtes et la liste des coups (verbose).
   ============================================================ */
(function (global) {
  'use strict';

  var Chess = (typeof module !== 'undefined' && module.exports)
    ? require('./engine.js')
    : global.Chess;

  /* résout un coup SAN en coup légal, puis le joue */
  function moveSAN(game, token) {
    var san = token.replace(/[+#?!]+$/, '').replace(/0/g, 'O');
    var legal = game.legalMoves();
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i];
      if (game._san(m, legal) === san) {
        return game.move({
          from: Chess.algebraic(m.from),
          to: Chess.algebraic(m.to),
          promotion: m.promotion
        });
      }
    }
    return null;
  }

  /**
   * parsePGN(text) -> {
   *   headers: {...}, moves: [{from,to,promotion,san,...}],
   *   startFen, result, error?
   * }
   */
  function parsePGN(text) {
    var headers = {};
    var m, lastEnd = 0;
    var re = /\[([A-Za-z0-9_]+)\s+"([^"]*)"\]/g;
    while ((m = re.exec(text))) { headers[m[1]] = m[2]; lastEnd = re.lastIndex; }

    var body = text.slice(lastEnd)
      .replace(/\{[^}]*\}/g, ' ')     /* commentaires {[%clk …]} etc. */
      .replace(/\([^()]*\)/g, ' ')    /* variantes */
      .replace(/\$\d+/g, ' ')         /* NAGs $1 … */
      .replace(/\d+\.{1,3}/g, ' ');   /* numéros de coups 12. ou 12… */

    var startFen = (headers.SetUp === '1' && headers.FEN) ? headers.FEN : undefined;
    var game = new Chess(startFen);
    var moves = [];
    var tokens = body.split(/\s+/);

    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i].trim();
      if (!tok || /^(1-0|0-1|1\/2-1\/2|\*)$/.test(tok)) continue;
      var mv = moveSAN(game, tok);
      if (!mv) {
        return { headers: headers, moves: moves, startFen: startFen,
                 error: 'Coup illisible : « ' + tok + ' »' };
      }
      moves.push(mv);
    }
    if (!moves.length) return { headers: headers, moves: [], error: 'Aucun coup trouvé' };
    game._startFen = startFen; /* pour rejouer depuis la bonne position */
    return { headers: headers, moves: moves, startFen: startFen,
             game: game, result: headers.Result || '*' };
  }

  var api = { parse: parsePGN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else global.CheesePGN = api;

})(typeof window !== 'undefined' ? window : globalThis);
