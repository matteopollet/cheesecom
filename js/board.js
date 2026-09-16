/* ============================================================
   cheesecom — échiquier : rendu, surbrillances, interactions
   ============================================================ */
(function () {
  'use strict';

  var S = App.state;
  var Sound = App.Sound;

  /* ============ utilitaires affichage ============ */
  App.displayXY = function (i) {
    var f = i & 7, r = i >> 3;
    return S.flipped ? { x: 7 - f, y: 7 - r } : { x: f, y: r };
  };

  App.squareFromEvent = function (e) {
    var rect = App.$('#board').getBoundingClientRect();
    var x = Math.floor((e.clientX - rect.left) / rect.width * 8);
    var y = Math.floor((e.clientY - rect.top) / rect.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return -1;
    return S.flipped ? (7 - y) * 8 + (7 - x) : y * 8 + x;
  };

  function pieceAt(i) { return S.game.board[i]; }

  /* ============ construction ============ */
  App.buildSquares = function () {
    var layer = App.$('#sq-layer');
    layer.innerHTML = '';
    for (var dy = 0; dy < 8; dy++) {
      for (var dx = 0; dx < 8; dx++) {
        var i = S.flipped ? (7 - dy) * 8 + (7 - dx) : dy * 8 + dx;
        var sq = document.createElement('div');
        sq.className = 'sq ' + (((i >> 3) + (i & 7)) % 2 === 0 ? 'light' : 'dark');
        if (dx === 0) {
          var rc = document.createElement('span');
          rc.className = 'coord rank';
          rc.textContent = 8 - (i >> 3);
          sq.appendChild(rc);
        }
        if (dy === 7) {
          var fc = document.createElement('span');
          fc.className = 'coord file';
          fc.textContent = 'abcdefgh'[i & 7];
          sq.appendChild(fc);
        }
        layer.appendChild(sq);
      }
    }
    App.renderPieces();
    App.renderHighlights();
  };

  App.setPiecePos = function (el, i, instant) {
    var p = App.displayXY(i);
    if (instant) el.style.transition = 'none';
    el.style.transform = 'translate(' + (p.x * 100) + '%,' + (p.y * 100) + '%)';
    if (instant) requestAnimationFrame(function () { el.style.transition = ''; });
  };

  function makePieceEl(p, i) {
    var el = document.createElement('div');
    el.className = 'piece';
    el.style.backgroundImage = 'url(' + App.PIECE_URL[App.pieceKey(p)] + ')';
    el.dataset.sq = i;
    App.setPiecePos(el, i, true);
    return el;
  }

  App.renderPieces = function () {
    var layer = App.$('#piece-layer');
    layer.innerHTML = '';
    S.pieceEls = {};
    for (var i = 0; i < 64; i++) {
      var p = S.game.board[i];
      if (!p) continue;
      var el = makePieceEl(p, i);
      S.pieceEls[i] = el;
      layer.appendChild(el);
    }
  };

  /* déplace visuellement les pièces après un coup moteur */
  App.applyMoveUI = function (mv) {
    var F = Chess.FLAGS;
    var fromI = Chess.SQUARE_INDEX(mv.from), toI = Chess.SQUARE_INDEX(mv.to);
    var el = S.pieceEls[fromI];
    var capSq = (mv.flags & F.EP) ? toI + (mv.color === 'w' ? 8 : -8) : toI;

    if (S.pieceEls[capSq] && capSq !== fromI) {
      var capEl = S.pieceEls[capSq];
      capEl.classList.add('fading');
      setTimeout(function () { capEl.remove(); }, 160);
      delete S.pieceEls[capSq];
    }

    if (el) {
      S.pieceEls[toI] = el;
      delete S.pieceEls[fromI];
      el.dataset.sq = toI;
      App.setPiecePos(el, toI, false);
      if (mv.promotion) {
        setTimeout(function () {
          el.style.backgroundImage = 'url(' + App.PIECE_URL[mv.color + mv.promotion.toUpperCase()] + ')';
        }, 120);
      }
    }

    /* roque : bouger la tour */
    if (mv.flags & F.KSIDE) {
      var h = mv.color === 'w' ? 60 : 4;
      var rook = S.pieceEls[h + 3];
      if (rook) { S.pieceEls[h + 1] = rook; delete S.pieceEls[h + 3]; rook.dataset.sq = h + 1; App.setPiecePos(rook, h + 1, false); }
    } else if (mv.flags & F.QSIDE) {
      var h2 = mv.color === 'w' ? 60 : 4;
      var rook2 = S.pieceEls[h2 - 4];
      if (rook2) { S.pieceEls[h2 - 1] = rook2; delete S.pieceEls[h2 - 4]; rook2.dataset.sq = h2 - 1; App.setPiecePos(rook2, h2 - 1, false); }
    }
  };

  /* ============ surbrillances ============ */
  App.clearMarks = function () {
    S.userMarks = {};
    S.userArrows = [];
    App.renderHighlights();
  };

  App.clearMarksSilent = function () {
    S.userMarks = {};
    S.userArrows = [];
  };

  App.renderHighlights = function () {
    var hl = App.$('#hl-layer');
    var hint = App.$('#hint-layer');
    var arrows = App.$('#arrow-layer');
    hl.innerHTML = ''; hint.innerHTML = ''; arrows.innerHTML = '';

    /* dernier coup */
    if (S.lastMove) {
      [S.lastMove.from, S.lastMove.to].forEach(function (sq) {
        var i = Chess.SQUARE_INDEX(sq);
        var p = App.displayXY(i);
        var d = document.createElement('div');
        d.className = 'hl last';
        d.style.left = p.x * 12.5 + '%';
        d.style.top = p.y * 12.5 + '%';
        hl.appendChild(d);
      });
    }

    /* case sélectionnée + destinations légales */
    if (S.selected >= 0) {
      var ps = App.displayXY(S.selected);
      var s = document.createElement('div');
      s.className = 'hl sel';
      s.style.left = ps.x * 12.5 + '%';
      s.style.top = ps.y * 12.5 + '%';
      hl.appendChild(s);

      S.legalFrom.forEach(function (m) {
        var pp = App.displayXY(m.to);
        var d = document.createElement('div');
        d.className = m.captured ? 'hint-ring' : 'hint-dot';
        d.style.left = pp.x * 12.5 + '%';
        d.style.top = pp.y * 12.5 + '%';
        hint.appendChild(d);
      });
    }

    /* roi en échec */
    if (S.game && S.game.inCheck(S.game.turn)) {
      var k = S.game.kingSquare(S.game.turn);
      var pk = App.displayXY(k);
      var c = document.createElement('div');
      c.className = 'hl check';
      c.style.left = pk.x * 12.5 + '%';
      c.style.top = pk.y * 12.5 + '%';
      hl.appendChild(c);
    }

    /* marques utilisateur (clic droit) */
    Object.keys(S.userMarks).forEach(function (k2) {
      var i2 = parseInt(k2, 10);
      var pm = App.displayXY(i2);
      var m = document.createElement('div');
      m.className = 'hl';
      m.style.left = pm.x * 12.5 + '%';
      m.style.top = pm.y * 12.5 + '%';
      m.style.background = 'radial-gradient(circle, rgba(235,60,60,.55) 0%, rgba(235,60,60,.35) 70%, transparent 72%)';
      hl.appendChild(m);
    });

    /* flèches utilisateur + flèche d'indice */
    var aw = App.$('#board').clientWidth;
    arrows.setAttribute('viewBox', '0 0 ' + aw + ' ' + aw);
    S.userArrows.forEach(function (a) {
      App.drawArrow(arrows, a.from, a.to, 'rgba(235,120,60,.8)');
    });
    if (S.hintArrow) {
      App.drawArrow(arrows, S.hintArrow.from, S.hintArrow.to, 'rgba(129,182,76,.9)');
    }
  };

  App.drawArrow = function (svg, fromI, toI, color) {
    var w = App.$('#board').clientWidth, cell = w / 8;
    var a = App.displayXY(fromI), b = App.displayXY(toI);
    var x1 = (a.x + .5) * cell, y1 = (a.y + .5) * cell;
    var x2 = (b.x + .5) * cell, y2 = (b.y + .5) * cell;
    var dx = x2 - x1, dy = y2 - y1;
    var len = Math.hypot(dx, dy);
    if (len < 1) return;
    var ux = dx / len, uy = dy / len;
    var sw = cell * 0.16, hw = cell * 0.42, hl2 = cell * 0.34;
    var sx = x1 + ux * cell * 0.12, sy = y1 + uy * cell * 0.12;
    var ex = x2 - ux * hl2, ey = y2 - uy * hl2;
    var px = -uy, py = ux;
    var pts = [
      [sx + px * sw / 2, sy + py * sw / 2],
      [ex + px * sw / 2, ey + py * sw / 2],
      [ex + px * hw / 2, ey + py * hw / 2],
      [x2 - ux * cell * 0.08, y2 - uy * cell * 0.08],
      [ex - px * hw / 2, ey - py * hw / 2],
      [ex - px * sw / 2, ey - py * sw / 2],
      [sx - px * sw / 2, sy - py * sw / 2]
    ].map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
    var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    poly.setAttribute('points', pts);
    poly.setAttribute('fill', color);
    svg.appendChild(poly);
  };

  /* ============ sélection ============ */
  App.deselect = function () {
    S.selected = -1;
    S.legalFrom = [];
    App.renderHighlights();
  };

  App.select = function (i) {
    S.selected = i;
    S.legalFrom = S.game.legalMoves(App.sqName(i));
    Sound.select();
    App.renderHighlights();
  };

  /* ---------- promotion ---------- */
  App.openPromo = function (fromI, toI) {
    S.promoPending = { from: fromI, to: toI };
    var picker = App.$('#promo-picker');
    var board = App.$('#board');
    var cell = board.clientWidth / 8;
    var p = App.displayXY(toI);
    var color = S.game.board[fromI].color;
    picker.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'promo-btn';
      b.style.width = cell + 'px';
      b.style.backgroundImage = 'url(' + App.PIECE_URL[color + t.toUpperCase()] + ')';
      b.onclick = function (ev) {
        ev.stopPropagation();
        App.closePromo();
        App.tryMove(fromI, toI, t);
      };
      picker.appendChild(b);
    });
    var h = cell * 4;
    var left = p.x * cell;
    var top = p.y * cell;
    if (top + h > board.clientHeight) top -= h - cell;
    picker.style.left = left + 'px';
    picker.style.top = top + 'px';
    picker.classList.add('open');
  };

  App.closePromo = function () {
    App.$('#promo-picker').classList.remove('open');
    S.promoPending = null;
  };

  /* ---------- interactions souris ---------- */
  App.isUserTurn = function () {
    return S.active && !S.inputLocked && S.game.turn === S.playerColor;
  };

  App.onPointerDown = function (e) {
    if (!S.game) return;
    if (e.target && e.target.closest && e.target.closest('.promo-picker')) return;
    if (e.button === 2) { /* clic droit : marques */
      var i0 = App.squareFromEvent(e);
      if (i0 >= 0) S.rightStart = i0;
      return;
    }
    if (e.button !== 0) return;
    App.closePromo();
    App.clearMarks();

    var i = App.squareFromEvent(e);
    if (i < 0) return;
    var p = pieceAt(i);

    /* destination d'un coup déjà sélectionné */
    if (S.selected >= 0 && S.legalFrom.some(function (m) { return m.to === i; })) {
      var ok = App.tryMove(S.selected, i);
      if (!ok) Sound.illegal();
      return;
    }

    if (App.isUserTurn() && p && p.color === S.playerColor) {
      App.select(i);
      var el = S.pieceEls[i];
      var rect = App.$('#board').getBoundingClientRect();
      S.drag = {
        el: el, from: i, moved: false,
        startX: e.clientX, startY: e.clientY,
        ox: e.clientX - rect.left, oy: e.clientY - rect.top
      };
      el.classList.add('dragging');
      App.$('#board').setPointerCapture(e.pointerId);
    } else if (S.selected >= 0) {
      App.deselect();
    }
  };

  App.onPointerMove = function (e) {
    if (!S.drag) return;
    var d = S.drag;
    var rect = App.$('#board').getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    var cell = rect.width / 8;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    d.el.style.transform = 'translate(' + (x - cell / 2) + 'px,' + (y - cell / 2) + 'px)';
  };

  App.onPointerUp = function (e) {
    if (e.button === 2) {
      var iEnd = App.squareFromEvent(e);
      var iStart = S.rightStart;
      S.rightStart = null;
      if (iStart == null || iStart < 0) return;
      if (iEnd === iStart) {
        if (S.userMarks[iEnd]) delete S.userMarks[iEnd];
        else S.userMarks[iEnd] = true;
      } else if (iEnd >= 0) {
        var exists = S.userArrows.some(function (a) { return a.from === iStart && a.to === iEnd; });
        if (exists) S.userArrows = S.userArrows.filter(function (a) { return !(a.from === iStart && a.to === iEnd); });
        else S.userArrows.push({ from: iStart, to: iEnd });
      }
      App.renderHighlights();
      return;
    }
    if (!S.drag) return;
    var d = S.drag;
    S.drag = null;
    d.el.classList.remove('dragging');

    var to = App.squareFromEvent(e);
    if (d.moved && to >= 0 && to !== d.from) {
      var legal = S.legalFrom.some(function (m) { return m.to === to; });
      if (legal) {
        App.tryMove(d.from, to);
        return;
      }
      Sound.illegal();
    }
    App.setPiecePos(d.el, parseInt(d.el.dataset.sq, 10), false);
  };
})();
