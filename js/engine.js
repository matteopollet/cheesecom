/* ============================================================
   cheesecom — moteur d'échecs
   API inspirée de chess.js : move / moves / undo / fen / etc.
   Fonctionne dans le navigateur ET dans Node (pour les tests).
   ============================================================ */
(function (global) {
  'use strict';

  var WHITE = 'w';
  var BLACK = 'b';

  var PAWN = 'p', KNIGHT = 'n', BISHOP = 'b', ROOK = 'r', QUEEN = 'q', KING = 'k';

  var START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

  /* index 0 = a8 ... 63 = h1 */
  var FILES = 'abcdefgh';

  function fileOf(i) { return i & 7; }
  function rankOf(i) { return i >> 3; }            /* 0 = rank8, 7 = rank1 */
  function algebraic(i) { return FILES[fileOf(i)] + (8 - rankOf(i)); }
  function squareIndex(s) { return (8 - (s.charCodeAt(1) - 48)) * 8 + (s.charCodeAt(0) - 97); }
  function onBoard(f, r) { return f >= 0 && f < 8 && r >= 0 && r < 8; }

  var KNIGHT_OFFSETS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  var KING_OFFSETS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  var BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  var ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  var QUEEN_DIRS = BISHOP_DIRS.concat(ROOK_DIRS);

  /* flags */
  var F_NORMAL = 1, F_BIG_PAWN = 2, F_EP = 4, F_PROMO = 8, F_KSIDE = 16, F_QSIDE = 32, F_CAPTURE = 64;

  function Chess(fen) {
    this.board = new Array(64).fill(null);
    this.turn = WHITE;
    this.castling = { w: { k: false, q: false }, b: { k: false, q: false } };
    this.epSquare = -1;
    this.halfMoves = 0;
    this.moveNumber = 1;
    this.history = [];       /* coups joués (verbose) */
    this._undoStack = [];
    this._posCounts = {};
    this.load(fen || START_FEN);
  }

  Chess.prototype.load = function (fen) {
    var parts = fen.trim().split(/\s+/);
    var rows = parts[0].split('/');
    this.board = new Array(64).fill(null);
    for (var r = 0; r < 8; r++) {
      var f = 0;
      for (var c = 0; c < rows[r].length; c++) {
        var ch = rows[r][c];
        if (/\d/.test(ch)) { f += parseInt(ch, 10); }
        else {
          var color = (ch === ch.toLowerCase()) ? BLACK : WHITE;
          this.board[r * 8 + f] = { type: ch.toLowerCase(), color: color };
          f++;
        }
      }
    }
    this.turn = parts[1] === 'b' ? BLACK : WHITE;
    var cast = parts[2] || '-';
    this.castling = {
      w: { k: cast.indexOf('K') >= 0, q: cast.indexOf('Q') >= 0 },
      b: { k: cast.indexOf('k') >= 0, q: cast.indexOf('q') >= 0 }
    };
    this.epSquare = (parts[3] && parts[3] !== '-') ? squareIndex(parts[3]) : -1;
    this.halfMoves = parseInt(parts[4] || '0', 10);
    this.moveNumber = parseInt(parts[5] || '1', 10);
    this.history = [];
    this._undoStack = [];
    this._posCounts = {};
    this._recordPos();
  };

  Chess.prototype._posKey = function () {
    var s = '';
    for (var i = 0; i < 64; i++) {
      var p = this.board[i];
      s += p ? (p.color === WHITE ? p.type.toUpperCase() : p.type) : '.';
    }
    s += this.turn +
      (this.castling.w.k ? 'K' : '') + (this.castling.w.q ? 'Q' : '') +
      (this.castling.b.k ? 'k' : '') + (this.castling.b.q ? 'q' : '') +
      (this.epSquare >= 0 ? algebraic(this.epSquare) : '-');
    return s;
  };

  Chess.prototype._recordPos = function () {
    var k = this._posKey();
    this._posCounts[k] = (this._posCounts[k] || 0) + 1;
  };

  Chess.prototype._unrecordPos = function () {
    var k = this._posKey();
    if (this._posCounts[k]) this._posCounts[k]--;
  };

  Chess.prototype.fen = function () {
    var rows = [];
    for (var r = 0; r < 8; r++) {
      var row = '', empty = 0;
      for (var f = 0; f < 8; f++) {
        var p = this.board[r * 8 + f];
        if (!p) { empty++; }
        else {
          if (empty) { row += empty; empty = 0; }
          row += p.color === WHITE ? p.type.toUpperCase() : p.type;
        }
      }
      if (empty) row += empty;
      rows.push(row);
    }
    var cast = (this.castling.w.k ? 'K' : '') + (this.castling.w.q ? 'Q' : '') +
               (this.castling.b.k ? 'k' : '') + (this.castling.b.q ? 'q' : '');
    return rows.join('/') + ' ' + this.turn + ' ' + (cast || '-') + ' ' +
      (this.epSquare >= 0 ? algebraic(this.epSquare) : '-') + ' ' +
      this.halfMoves + ' ' + this.moveNumber;
  };

  Chess.prototype.get = function (sq) {
    return this.board[squareIndex(sq)];
  };

  Chess.prototype.kingSquare = function (color) {
    for (var i = 0; i < 64; i++) {
      var p = this.board[i];
      if (p && p.type === KING && p.color === color) return i;
    }
    return -1;
  };

  /* case `sq` attaquée par `color` ? */
  Chess.prototype.isAttacked = function (sq, color) {
    var f = fileOf(sq), r = rankOf(sq);
    var i, p, nf, nr, k;

    /* pions */
    var pr = (color === WHITE) ? r + 1 : r - 1;
    for (k = -1; k <= 1; k += 2) {
      nf = f + k;
      if (onBoard(nf, pr)) {
        p = this.board[pr * 8 + nf];
        if (p && p.color === color && p.type === PAWN) return true;
      }
    }
    /* cavaliers */
    for (k = 0; k < 8; k++) {
      nf = f + KNIGHT_OFFSETS[k][0]; nr = r + KNIGHT_OFFSETS[k][1];
      if (onBoard(nf, nr)) {
        p = this.board[nr * 8 + nf];
        if (p && p.color === color && p.type === KNIGHT) return true;
      }
    }
    /* roi */
    for (k = 0; k < 8; k++) {
      nf = f + KING_OFFSETS[k][0]; nr = r + KING_OFFSETS[k][1];
      if (onBoard(nf, nr)) {
        p = this.board[nr * 8 + nf];
        if (p && p.color === color && p.type === KING) return true;
      }
    }
    /* sliders diagonaux (fou/dame) */
    for (k = 0; k < 4; k++) {
      var d = BISHOP_DIRS[k];
      nf = f + d[0]; nr = r + d[1];
      while (onBoard(nf, nr)) {
        p = this.board[nr * 8 + nf];
        if (p) {
          if (p.color === color && (p.type === BISHOP || p.type === QUEEN)) return true;
          break;
        }
        nf += d[0]; nr += d[1];
      }
    }
    /* sliders orthogonaux (tour/dame) */
    for (k = 0; k < 4; k++) {
      var d2 = ROOK_DIRS[k];
      nf = f + d2[0]; nr = r + d2[1];
      while (onBoard(nf, nr)) {
        p = this.board[nr * 8 + nf];
        if (p) {
          if (p.color === color && (p.type === ROOK || p.type === QUEEN)) return true;
          break;
        }
        nf += d2[0]; nr += d2[1];
      }
    }
    return false;
  };

  Chess.prototype.inCheck = function (color) {
    color = color || this.turn;
    var k = this.kingSquare(color);
    return k >= 0 && this.isAttacked(k, color === WHITE ? BLACK : WHITE);
  };

  /* génération pseudo-légale */
  Chess.prototype._pseudoMoves = function (fromSq) {
    var moves = [];
    var self = this;
    var color = this.turn;
    var us = color === WHITE;

    function push(from, to, flags, promo) {
      var target = self.board[to];
      var m = {
        from: from, to: to,
        piece: self.board[from].type,
        color: color,
        captured: (flags & F_EP) ? PAWN : (target ? target.type : undefined),
        promotion: promo,
        flags: flags | (target ? F_CAPTURE : 0)
      };
      moves.push(m);
    }

    var start = (fromSq !== undefined) ? squareIndex(fromSq) : 0;
    var end = (fromSq !== undefined) ? start + 1 : 64;

    for (var i = start; i < end; i++) {
      var p = this.board[i];
      if (!p || p.color !== color) continue;
      var f = fileOf(i), r = rankOf(i);

      if (p.type === PAWN) {
        var dir = us ? -8 : 8;
        var startRank = us ? 6 : 1;
        var promoRank = us ? 0 : 7;
        var one = i + dir;
        if (one >= 0 && one < 64 && !this.board[one]) {
          if (rankOf(one) === promoRank) {
            push(i, one, F_PROMO, QUEEN); push(i, one, F_PROMO, ROOK);
            push(i, one, F_PROMO, BISHOP); push(i, one, F_PROMO, KNIGHT);
          } else {
            push(i, one, F_NORMAL);
            var two = i + dir * 2;
            if (r === startRank && !this.board[two]) push(i, two, F_BIG_PAWN);
          }
        }
        for (var k = -1; k <= 1; k += 2) {
          var nf = f + k;
          if (nf < 0 || nf > 7) continue;
          var to = i + dir + k;
          var t = this.board[to];
          if (t && t.color !== color) {
            if (rankOf(to) === promoRank) {
              push(i, to, F_PROMO, QUEEN); push(i, to, F_PROMO, ROOK);
              push(i, to, F_PROMO, BISHOP); push(i, to, F_PROMO, KNIGHT);
            } else push(i, to, F_NORMAL);
          } else if (to === this.epSquare) {
            push(i, to, F_EP | F_CAPTURE);
          }
        }
      } else if (p.type === KNIGHT || p.type === KING) {
        var offs = p.type === KNIGHT ? KNIGHT_OFFSETS : KING_OFFSETS;
        for (var k2 = 0; k2 < offs.length; k2++) {
          var f2 = f + offs[k2][0], r2 = r + offs[k2][1];
          if (!onBoard(f2, r2)) continue;
          var to2 = r2 * 8 + f2;
          var t2 = this.board[to2];
          if (!t2 || t2.color !== color) push(i, to2, F_NORMAL);
        }
        /* roque */
        if (p.type === KING) {
          var home = us ? 60 : 4;
          if (i === home && !this.inCheck(color)) {
            var enemy = us ? BLACK : WHITE;
            var cr = this.castling[color];
            if (cr.k &&
              !this.board[home + 1] && !this.board[home + 2] &&
              this.board[home + 3] && this.board[home + 3].type === ROOK &&
              this.board[home + 3].color === color &&
              !this.isAttacked(home + 1, enemy) && !this.isAttacked(home + 2, enemy)) {
              push(i, home + 2, F_KSIDE);
            }
            if (cr.q &&
              !this.board[home - 1] && !this.board[home - 2] && !this.board[home - 3] &&
              this.board[home - 4] && this.board[home - 4].type === ROOK &&
              this.board[home - 4].color === color &&
              !this.isAttacked(home - 1, enemy) && !this.isAttacked(home - 2, enemy)) {
              push(i, home - 2, F_QSIDE);
            }
          }
        }
      } else {
        var dirs = p.type === BISHOP ? BISHOP_DIRS : p.type === ROOK ? ROOK_DIRS : QUEEN_DIRS;
        for (var d3 = 0; d3 < dirs.length; d3++) {
          var f3 = f + dirs[d3][0], r3 = r + dirs[d3][1];
          while (onBoard(f3, r3)) {
            var to3 = r3 * 8 + f3;
            var t3 = this.board[to3];
            if (!t3) push(i, to3, F_NORMAL);
            else {
              if (t3.color !== color) push(i, to3, F_NORMAL);
              break;
            }
            f3 += dirs[d3][0]; r3 += dirs[d3][1];
          }
        }
      }
    }
    return moves;
  };

  /* applique un coup interne (sans SAN) */
  Chess.prototype._make = function (m) {
    var undo = {
      move: m,
      castling: { w: { k: this.castling.w.k, q: this.castling.w.q }, b: { k: this.castling.b.k, q: this.castling.b.q } },
      ep: this.epSquare,
      half: this.halfMoves,
      captured: null,
      capturedSq: -1
    };

    var us = m.color === WHITE;
    var piece = this.board[m.from];

    /* EP : retirer le pion capturé */
    if (m.flags & F_EP) {
      var capSq = m.to + (us ? 8 : -8);
      undo.captured = this.board[capSq];
      undo.capturedSq = capSq;
      this.board[capSq] = null;
    } else if (this.board[m.to]) {
      undo.captured = this.board[m.to];
      undo.capturedSq = m.to;
    }

    this.board[m.to] = (m.flags & F_PROMO) ? { type: m.promotion, color: m.color } : piece;
    this.board[m.from] = null;

    /* roque : déplacer la tour */
    if (m.flags & F_KSIDE) {
      var home = us ? 60 : 4;
      this.board[home + 1] = this.board[home + 3];
      this.board[home + 3] = null;
    } else if (m.flags & F_QSIDE) {
      var home2 = us ? 60 : 4;
      this.board[home2 - 1] = this.board[home2 - 4];
      this.board[home2 - 4] = null;
    }

    /* droits de roque */
    if (piece.type === KING) {
      this.castling[m.color].k = false;
      this.castling[m.color].q = false;
    }
    var rookSq = { 56: 'w-q', 63: 'w-k', 0: 'b-q', 7: 'b-k' };
    if (rookSq[m.from]) {
      var rs = rookSq[m.from].split('-');
      if (piece.type === ROOK && piece.color === rs[0]) this.castling[rs[0]][rs[1]] = false;
    }
    if (undo.capturedSq >= 0 && rookSq[undo.capturedSq]) {
      var cs = rookSq[undo.capturedSq].split('-');
      if (undo.captured && undo.captured.type === ROOK && undo.captured.color === cs[0]) {
        this.castling[cs[0]][cs[1]] = false;
      }
    }

    this.epSquare = (m.flags & F_BIG_PAWN) ? m.from + (us ? -8 : 8) : -1;
    this.halfMoves = (piece.type === PAWN || undo.captured) ? 0 : this.halfMoves + 1;
    if (m.color === BLACK) this.moveNumber++;
    this.turn = us ? BLACK : WHITE;

    this._undoStack.push(undo);
  };

  Chess.prototype._unmake = function () {
    var undo = this._undoStack.pop();
    if (!undo) return;
    var m = undo.move;
    var us = m.color === WHITE;

    this.turn = m.color;
    if (m.color === BLACK) this.moveNumber--;
    this.castling = undo.castling;
    this.epSquare = undo.ep;
    this.halfMoves = undo.half;

    /* roque : remettre la tour */
    if (m.flags & F_KSIDE) {
      var home = us ? 60 : 4;
      this.board[home + 3] = this.board[home + 1];
      this.board[home + 1] = null;
    } else if (m.flags & F_QSIDE) {
      var home2 = us ? 60 : 4;
      this.board[home2 - 4] = this.board[home2 - 1];
      this.board[home2 - 1] = null;
    }

    this.board[m.from] = { type: m.piece, color: m.color };
    this.board[m.to] = null;

    if (undo.captured) {
      this.board[undo.capturedSq] = undo.captured;
    }
  };

  /* coups légaux */
  Chess.prototype.legalMoves = function (fromSq) {
    var pseudo = this._pseudoMoves(fromSq);
    var legal = [];
    var color = this.turn;
    for (var i = 0; i < pseudo.length; i++) {
      var m = pseudo[i];
      this._make(m);
      if (!this.inCheck(color)) legal.push(m);
      this._unmake();
    }
    return legal;
  };

  Chess.prototype.moves = function (opts) {
    opts = opts || {};
    var legal = this.legalMoves(opts.square);
    if (opts.verbose) return legal;
    return legal.map(function (m) { return algebraic(m.from) + algebraic(m.to); });
  };

  /* ---------- SAN ---------- */
  Chess.prototype._san = function (m, allLegal) {
    if (m.flags & F_KSIDE) return 'O-O';
    if (m.flags & F_QSIDE) return 'O-O-O';
    var san = '';
    if (m.piece !== PAWN) {
      san += m.piece.toUpperCase();
      /* désambiguïsation */
      var sameFile = false, sameRank = false, ambiguous = false;
      for (var i = 0; i < allLegal.length; i++) {
        var o = allLegal[i];
        if (o === m || o.piece !== m.piece || o.to !== m.to || o.from === m.from) continue;
        ambiguous = true;
        if (fileOf(o.from) === fileOf(m.from)) sameFile = true;
        if (rankOf(o.from) === rankOf(m.from)) sameRank = true;
      }
      if (ambiguous) {
        if (!sameFile) san += FILES[fileOf(m.from)];
        else if (!sameRank) san += (8 - rankOf(m.from));
        else san += algebraic(m.from);
      }
    }
    if (m.captured) {
      if (m.piece === PAWN) san += FILES[fileOf(m.from)];
      san += 'x';
    }
    san += algebraic(m.to);
    if (m.promotion) san += '=' + m.promotion.toUpperCase();
    return san;
  };

  /* API publique : joue un coup {from:'e2',to:'e4',promotion:'q'} */
  Chess.prototype.move = function (arg) {
    var from = squareIndex(arg.from), to = squareIndex(arg.to);
    var promo = arg.promotion ? arg.promotion.toLowerCase() : undefined;
    var legal = this.legalMoves();
    var chosen = null;
    for (var i = 0; i < legal.length; i++) {
      var m = legal[i];
      if (m.from === from && m.to === to) {
        if ((m.flags & F_PROMO)) {
          if (m.promotion === (promo || QUEEN)) { chosen = m; break; }
        } else { chosen = m; break; }
      }
    }
    if (!chosen) return null;

    var san = this._san(chosen, legal);
    this._make(chosen);
    if (this.inCheck(this.turn)) {
      san += this.legalMoves().length === 0 ? '#' : '+';
    }
    var verbose = {
      from: algebraic(chosen.from), to: algebraic(chosen.to),
      piece: chosen.piece, color: chosen.color,
      captured: chosen.captured, promotion: chosen.promotion,
      flags: chosen.flags, san: san
    };
    this.history.push(verbose);
    this._recordPos();
    return verbose;
  };

  Chess.prototype.undo = function () {
    var h = this.history.pop();
    if (!h) return null;
    this._unrecordPos();
    this._unmake();
    return h;
  };

  /* ---------- état de la partie ---------- */
  Chess.prototype.isCheckmate = function () {
    return this.inCheck(this.turn) && this.legalMoves().length === 0;
  };
  Chess.prototype.isStalemate = function () {
    return !this.inCheck(this.turn) && this.legalMoves().length === 0;
  };
  Chess.prototype.isInsufficientMaterial = function () {
    var pieces = [];
    for (var i = 0; i < 64; i++) {
      var p = this.board[i];
      if (p && p.type !== KING) pieces.push({ p: p, sq: i });
    }
    if (pieces.length === 0) return true;
    if (pieces.length === 1 && (pieces[0].p.type === BISHOP || pieces[0].p.type === KNIGHT)) return true;
    /* F vs F sur cases de même couleur */
    if (pieces.length >= 1) {
      var allBishops = pieces.every(function (x) { return x.p.type === BISHOP; });
      if (allBishops) {
        var parity = (fileOf(pieces[0].sq) + rankOf(pieces[0].sq)) & 1;
        if (pieces.every(function (x) { return ((fileOf(x.sq) + rankOf(x.sq)) & 1) === parity; })) return true;
      }
    }
    return false;
  };
  Chess.prototype.isThreefoldRepetition = function () {
    return (this._posCounts[this._posKey()] || 0) >= 3;
  };
  Chess.prototype.isDraw = function () {
    return this.halfMoves >= 100 || this.isStalemate() ||
      this.isInsufficientMaterial() || this.isThreefoldRepetition();
  };
  Chess.prototype.isGameOver = function () {
    return this.isCheckmate() || this.isDraw();
  };

  Chess.prototype.boardState = function () {
    var out = [];
    for (var r = 0; r < 8; r++) {
      var row = [];
      for (var f = 0; f < 8; f++) row.push(this.board[r * 8 + f]);
      out.push(row);
    }
    return out;
  };

  /* ---------- perft (tests) ---------- */
  Chess.prototype.perft = function (depth) {
    if (depth === 0) return 1;
    var moves = this.legalMoves();
    if (depth === 1) return moves.length;
    var nodes = 0;
    for (var i = 0; i < moves.length; i++) {
      this._make(moves[i]);
      nodes += this.perft(depth - 1);
      this._unmake();
    }
    return nodes;
  };

  Chess.SQUARE_INDEX = squareIndex;
  Chess.algebraic = algebraic;
  Chess.START_FEN = START_FEN;
  Chess.FLAGS = { NORMAL: F_NORMAL, BIG_PAWN: F_BIG_PAWN, EP: F_EP, PROMO: F_PROMO, KSIDE: F_KSIDE, QSIDE: F_QSIDE, CAPTURE: F_CAPTURE };

  if (typeof module !== 'undefined' && module.exports) module.exports = Chess;
  else global.Chess = Chess;

})(typeof window !== 'undefined' ? window : globalThis);
