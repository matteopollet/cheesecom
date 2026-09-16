/* ============================================================
   cheesecom — analyse de partie façon chess.com
   Import PGN (coller ou fichier), bilan récapitulatif puis
   bilan coup par coup avec coach, graphe d'éval et navigation.
   Tout tourne dans un Web Worker.
   ============================================================ */
(function () {
  'use strict';

  var S = App.state;
  var $ = App.$;
  var Sound = App.Sound;
  var escapeHtml = App.escapeHtml;

  /* classes de coups : libellé, symbole, couleur (style chess.com) */
  var CLASSES = {
    brillant:    { label: 'Brillant',    icon: '!!', color: '#1bada1' },
    bon:         { label: 'Excellent',   icon: '!',  color: '#5f97c4' },
    meilleur:    { label: 'Meilleur',    icon: '★',  color: '#96bc4b' },
    imprecision: { label: 'Imprécision', icon: '?!', color: '#f7c631' },
    erreur:      { label: 'Erreur',      icon: '?',  color: '#e6912c' },
    manque:      { label: 'Manqué',      icon: '✕',  color: '#d04a4a' },
    gaffe:       { label: 'Gaffe',       icon: '??', color: '#ca3431' },
    livre:       { label: 'Théorique',   icon: '📖', color: '#a5714a' }
  };
  var ORDER = ['brillant', 'bon', 'meilleur', 'imprecision', 'erreur', 'manque', 'gaffe', 'livre'];
  App.CLASSES = CLASSES;
  App.CLASS_ORDER = ORDER;

  /* phrases du coach par classe */
  var PHRASES = {
    livre:       ' est un coup théorique.',
    brillant:    ' est un coup brillant !!',
    meilleur:    ' est le meilleur coup.',
    bon:         ' est un excellent coup.',
    imprecision: ' est une imprécision.',
    erreur:      ' est une erreur.',
    manque:      ' est un coup manqué.',
    gaffe:       ' est une gaffe !'
  };

  /* ouvertures reconnues par leurs premiers coups (affichage) */
  var OPENINGS = [
    { seq: ['e4', 'c5'], name: 'Défense sicilienne' },
    { seq: ['e4', 'e6'], name: 'Défense française' },
    { seq: ['e4', 'c6'], name: 'Défense Caro-Kann' },
    { seq: ['e4', 'd5'], name: 'Défense scandinave' },
    { seq: ['e4', 'd6'], name: 'Défense Pirc' },
    { seq: ['e4', 'g6'], name: 'Défense moderne' },
    { seq: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'], name: 'Partie espagnole' },
    { seq: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'], name: 'Partie italienne' },
    { seq: ['e4', 'e5'], name: 'Partie du roi' },
    { seq: ['d4', 'd5', 'c4'], name: 'Gambit dame' },
    { seq: ['d4', 'Nf6', 'c4', 'e6'], name: 'Défense indienne' },
    { seq: ['d4', 'f5'], name: 'Défense hollandaise' },
    { seq: ['d4', 'd5'], name: 'Partie de dame' },
    { seq: ['c4'], name: 'Ouverture anglaise' },
    { seq: ['Nf3'], name: 'Ouverture Réti' },
    { seq: ['d4'], name: 'Ouverture du pion dame' },
    { seq: ['e4'], name: 'Ouverture du pion roi' }
  ];

  var COACH = { avatar: null };
  function coachAvatar() {
    if (!COACH.avatar) COACH.avatar = CheeseBots.avatarSVG({ id: 'coach', robot: true }, 80);
    return COACH.avatar;
  }

  var worker = null;
  var analyzing = false;
  var playTimer = null;
  var explainOpen = false;

  /* ---------- vues ---------- */
  function showView(v) {
    $('#an-input').classList.toggle('hidden', v !== 'input');
    $('#an-results').classList.toggle('hidden', v !== 'sum');
    $('#an-review').classList.toggle('hidden', v !== 'rev');
  }

  /* ---------- ouverture / fermeture ---------- */
  App.openAnalysis = function () {
    S.active = false;
    App.stopClocks();
    App.botThink(false);
    App.hideConfirm();
    App.closePromo();
    App.deselect();
    S.premove = [];
    $('#board-overlay').classList.add('hidden');
    $('#panel-select').classList.add('hidden');
    $('#panel-game').classList.add('hidden');
    $('#panel-analysis').classList.remove('hidden');
    showView(S.review ? 'sum' : 'input');
  };

  App.stopAnalysis = function () {
    analyzing = false;
    stopAutoplay();
    if (worker) { worker.terminate(); worker = null; }
  };

  App.closeAnalysis = function () {
    /* dans la review, le bouton retour ramène d'abord au bilan */
    if (!$('#an-review').classList.contains('hidden')) { showView('sum'); return; }
    S.review = null;
    S.viewGame = null; S.viewPly = null;
    App.stopAnalysis();
    App.backToSelect();
  };

  /* ---------- import ---------- */
  App.pickPgnFile = function () { $('#an-file').click(); };

  function readFile(file) {
    var rd = new FileReader();
    rd.onload = function () { $('#an-pgn').value = rd.result; };
    rd.readAsText(file);
  }

  /* PGN de la partie qui vient de se terminer */
  App.analyzeCurrentGame = function () {
    var g = S.game;
    if (!g || !g.history.length) { App.toast('Aucune partie à analyser'); return; }
    var wName = S.playerColor === 'w' ? App.USER.name : S.bot.name;
    var bName = S.playerColor === 'w' ? S.bot.name : App.USER.name;
    startAnalysis(g, null, {
      white: { name: wName, rating: S.playerColor === 'w' ? '' : S.bot.rating },
      black: { name: bName, rating: S.playerColor === 'w' ? S.bot.rating : '' },
      result: $('#overlay-result').textContent || '*'
    }, undefined);
  };

  App.runPgnAnalysis = function () {
    var text = $('#an-pgn').value.trim();
    if (!text) { App.toast('Colle un PGN ou choisis un fichier'); return; }
    var parsed = CheesePGN.parse(text);
    if (parsed.error) { App.toast(parsed.error); return; }
    var h = parsed.headers;
    startAnalysis(parsed.game, parsed.moves, {
      white: { name: h.White || 'Blancs', rating: h.WhiteElo || '' },
      black: { name: h.Black || 'Noirs', rating: h.BlackElo || '' },
      result: parsed.result,
      opening: openingName(h)
    }, parsed.startFen);
  };

  /* nom d'ouverture depuis les en-têtes PGN ou les premiers coups */
  function openingName(headers, game) {
    if (headers) {
      if (headers.Opening) return headers.Opening;
      if (headers.ECOUrl) {
        var seg = headers.ECOUrl.split('/').pop().replace(/-\d.*$/, '');
        return decodeURIComponent(seg).replace(/-/g, ' ');
      }
    }
    if (game) {
      var sans = game.history.map(function (h) { return h.san.replace(/[+#]$/, ''); });
      /* garde la plus longue correspondance */
      var bestLen = 0, bestName = '';
      OPENINGS.forEach(function (o) {
        var ok = o.seq.every(function (s, i) { return sans[i] === s; });
        if (ok && o.seq.length > bestLen) { bestLen = o.seq.length; bestName = o.name; }
      });
      return bestName;
    }
    return '';
  }

  /* ---------- cœur ---------- */
  function startAnalysis(game, moves, meta, startFen) {
    if (analyzing) { App.toast('Analyse déjà en cours…'); return; }

    /* positionne le plateau sur la partie importée */
    S.game = game;
    S.review = {
      white: mkPlayer(meta.white),
      black: mkPlayer(meta.black),
      result: meta.result,
      opening: meta.opening || openingName(null, game),
      plies: null, evalsW: null, ev0W: null, accuracy: null, material: null
    };
    S.playerColor = 'w';
    S.flipped = false;
    S.lastMove = null;
    S.viewGame = null; S.viewPly = null;
    S.userMarks = {}; S.userArrows = [];

    App.buildSquares();
    App.renderCards();
    App.renderPieces();
    App.renderMoves();
    App.renderCaptured();
    App.renderClocks();
    App.updateEval();

    $('#panel-select').classList.add('hidden');
    $('#panel-game').classList.add('hidden');
    $('#panel-analysis').classList.remove('hidden');
    $('#board-overlay').classList.add('hidden');
    showView('sum');
    $('#an-summary').innerHTML = '';
    showProgress(0, 1);

    var payload = moves || game.history.map(function (h) {
      return { from: h.from, to: h.to, promotion: h.promotion };
    });
    var fen = startFen || Chess.START_FEN;

    analyzing = true;

    try { worker = new Worker('js/analysis-worker.js'); }
    catch (e) { worker = null; }

    if (worker) {
      worker.onmessage = function (e) {
        var d = e.data;
        if (d.type === 'progress') showProgress(d.done, d.total);
        else if (d.type === 'done') finishAnalysis(d.results);
        else if (d.type === 'error') failAnalysis(d.error);
      };
      worker.onerror = function () { failAnalysis('Le worker a planté'); };
      worker.postMessage({ type: 'analyze', fen: fen, moves: payload, depth: 3 });
    } else {
      /* pas de worker : calcul synchrone (gèle l'UI mais fonctionne) */
      setTimeout(function () {
        try {
          var res = CheeseAI.analyzeGame(fen, payload, showProgress, 3);
          finishAnalysis(res);
        } catch (err) { failAnalysis(String(err)); }
      }, 50);
    }
  }

  function mkPlayer(p) {
    return {
      name: p.name, rating: p.rating || '', flag: '',
      avatar: CheeseBots.avatarSVG({ id: 'rev-' + p.name, robot: false }, 80)
    };
  }

  function showProgress(done, total) {
    var bar = $('#an-progress');
    bar.classList.remove('hidden');
    $('#an-progress-fill').style.width = Math.round(done / total * 100) + '%';
    $('#an-progress-txt').textContent = 'Analyse… ' + done + '/' + total;
  }

  function failAnalysis(msg) {
    analyzing = false;
    $('#an-progress-txt').textContent = 'Erreur : ' + msg;
  }

  /* matériel restant (hors rois) après chaque demi-coup, pour les phases */
  function materialPerPly() {
    var g = new Chess(S.game._startFen || undefined);
    var out = [sumMaterial(g)];
    S.game.history.forEach(function (h) {
      g.move({ from: h.from, to: h.to, promotion: h.promotion });
      out.push(sumMaterial(g));
    });
    return out;
  }

  function sumMaterial(g) {
    var t = 0;
    for (var i = 0; i < 64; i++) {
      var p = g.board[i];
      if (p && p.type !== 'k') t += CheeseAI.VALUES[p.type];
    }
    return t;
  }

  function finishAnalysis(res) {
    analyzing = false;
    if (worker) { worker.terminate(); worker = null; }
    $('#an-progress').classList.add('hidden');

    /* les coups d'ouverture corrects deviennent "Théorique" */
    res.plies.forEach(function (p, i) {
      if (i < 12 && (p.cls === 'meilleur' || p.cls === 'bon')) p.cls = 'livre';
    });

    S.review.plies = res.plies;
    S.review.accuracy = res.accuracy;
    S.review.material = materialPerPly();
    /* éval pion-cent par demi-coup, point de vue blancs */
    S.review.evalsW = res.plies.map(function (p) {
      return p.color === 'w' ? p.evalAfter : -p.evalAfter;
    });
    S.review.ev0W = res.plies.length
      ? (res.plies[0].color === 'w' ? res.plies[0].evalBefore : -res.plies[0].evalBefore)
      : 0;

    renderSummary();
    App.renderMoves();
    App.updateEval();
    App.toast('Analyse terminée !');
  }

  /* ---------- graphe d'éval (style chess.com) ---------- */
  function drawGraph(canvas) {
    var rev = S.review;
    if (!canvas || !rev || !rev.evalsW) return;
    var dpr = window.devicePixelRatio || 1;
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr; canvas.height = h * dpr;
    var ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    var n = rev.evalsW.length;
    var mid = h / 2;
    var pts = [rev.ev0W].concat(rev.evalsW);
    function yv(ev) {
      var t = Math.tanh(Math.max(-1200, Math.min(1200, ev)) / 400);
      return mid - t * (mid - 3);
    }
    function xv(i) { return n ? (i / n) * w : w / 2; }

    /* zone blanche (bas) puis zone noire (haut) */
    ctx.beginPath(); ctx.moveTo(0, h);
    for (var i = 0; i <= n; i++) ctx.lineTo(xv(i), yv(pts[i]));
    ctx.lineTo(w, h); ctx.closePath();
    ctx.fillStyle = '#f5f5f5'; ctx.fill();

    ctx.beginPath(); ctx.moveTo(0, 0);
    for (i = 0; i <= n; i++) ctx.lineTo(xv(i), yv(pts[i]));
    ctx.lineTo(w, 0); ctx.closePath();
    ctx.fillStyle = '#565350'; ctx.fill();

    /* ligne médiane */
    ctx.fillStyle = 'rgba(255,255,255,.15)';
    ctx.fillRect(0, mid - 0.5, w, 1);

    /* pastilles des coups notables */
    rev.plies.forEach(function (p, i) {
      if (['livre', 'meilleur', 'bon'].indexOf(p.cls) >= 0) return;
      ctx.beginPath();
      ctx.arc(xv(i + 1), yv(pts[i + 1]), 3.5, 0, 7);
      ctx.fillStyle = CLASSES[p.cls].color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.stroke();
    });

    /* curseur de position */
    var ply = S.viewPly == null ? n : S.viewPly;
    ctx.fillStyle = 'rgba(129,182,76,.4)';
    ctx.fillRect(xv(ply) - 1.5, 0, 3, h);
  }

  App.drawAnGraphs = function () {
    drawGraph($('#an-graph'));
    drawGraph($('#an-graph-sum'));
  };

  function graphClick(e) {
    var cv = e.currentTarget;
    var r = cv.getBoundingClientRect();
    var n = S.review && S.review.evalsW ? S.review.evalsW.length : 0;
    if (!n) return;
    App.viewPly(Math.round((e.clientX - r.left) / r.width * n));
  }

  /* ---------- bilan récapitulatif ---------- */
  function phaseAccs() {
    var rev = S.review;
    var ph = { w: { o: [], m: [], f: [] }, b: { o: [], m: [], f: [] } };
    var n = rev.plies.length;
    rev.plies.forEach(function (p, i) {
      var phase = i < 20 ? 'o' : (rev.material[i + 1] <= 2400 || i >= n - 8 ? 'f' : 'm');
      /* précision du coup = fonction de la perte win% */
      var wp = function (cp) {
        var c = Math.max(-1000, Math.min(1000, cp));
        return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * c)) - 1);
      };
      var loss = Math.max(0, wp(p.evalBefore) - wp(p.evalAfter));
      var acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
      ph[p.color][phase].push(acc);
    });
    return ph;
  }

  function phaseIcon(a) {
    if (!a.length) return '';
    var m = a.reduce(function (x, y) { return x + y; }, 0) / a.length;
    var ic = m >= 85 ? { i: '✓', c: '#96bc4b' } : m >= 65 ? { i: '!', c: '#5f97c4' } : { i: '?', c: '#e6912c' };
    return '<i class="cls-badge" style="background:' + ic.c + '">' + ic.i + '</i>';
  }

  function coachSummary(rev, counts) {
    var w = rev.white.name, b = rev.black.name;
    var aw = rev.accuracy.w, ab = rev.accuracy.b;
    var diff = aw - ab;
    var blunders = (counts.w.gaffe || 0) + (counts.b.gaffe || 0);
    if (Math.abs(diff) < 4) {
      return 'Partie très équilibrée entre ' + w + ' et ' + b +
        (blunders ? ', malgré ' + blunders + ' gaffe' + (blunders > 1 ? 's' : '') + '.' : '.');
    }
    var best = diff > 0 ? w : b;
    if (Math.abs(diff) < 12) {
      return best + ' a pris l\u2019avantage progressivement et a su le convertir.';
    }
    return best + ' a dominé la partie de bout en bout.';
  }

  function renderSummary() {
    var rev = S.review;
    var counts = { w: {}, b: {} };
    ORDER.forEach(function (c) { counts.w[c] = 0; counts.b[c] = 0; });
    rev.plies.forEach(function (p) { counts[p.color][p.cls]++; });

    var rating = function (a) { return Math.max(100, Math.round(a * 16 - 20)); };
    var ph = phaseAccs();
    var phases = [['o', 'Ouverture'], ['m', 'Milieu de jeu'], ['f', 'Finale']];

    var html =
      '<div class="an-coach">' +
        '<span class="an-coach-ava">' + coachAvatar() + '</span>' +
        '<div class="an-coach-bubble">' + escapeHtml(coachSummary(rev, counts)) + '</div>' +
      '</div>' +
      '<canvas id="an-graph-sum" class="an-graph"></canvas>' +
      '<div class="an-trow">' +
        '<span class="an-tlabel">Joueurs</span>' +
        '<span class="an-tp"><span class="an-tp-ava">' + rev.white.avatar + '</span>' + escapeHtml(rev.white.name) + '</span>' +
        '<span class="an-tp"><span class="an-tp-ava">' + rev.black.avatar + '</span>' + escapeHtml(rev.black.name) + '</span>' +
      '</div>' +
      '<div class="an-trow">' +
        '<span class="an-tlabel">Précision</span>' +
        '<b class="an-tval">' + rev.accuracy.w.toFixed(1) + '</b>' +
        '<b class="an-tval">' + rev.accuracy.b.toFixed(1) + '</b>' +
      '</div>' +
      '<div class="an-grid">';

    ORDER.forEach(function (c) {
      var cl = CLASSES[c];
      if (!counts.w[c] && !counts.b[c]) return;
      html +=
        '<span class="an-cls"><i class="cls-badge" style="background:' + cl.color + '">' + cl.icon + '</i>' + cl.label + '</span>' +
        '<span class="an-cnt">' + (counts.w[c] || '') + '</span>' +
        '<span class="an-cnt">' + (counts.b[c] || '') + '</span>';
    });

    html += '</div>' +
      '<div class="an-trow">' +
        '<span class="an-tlabel">Classement de la partie</span>' +
        '<b class="an-tval">' + rating(rev.accuracy.w) + '</b>' +
        '<b class="an-tval">' + rating(rev.accuracy.b) + '</b>' +
      '</div>' +
      '<div class="an-phases">';

    phases.forEach(function (ph2) {
      html +=
        '<span class="an-cls">' + ph2[1] + '</span>' +
        '<span class="an-cnt">' + phaseIcon(ph.w[ph2[0]]) + '</span>' +
        '<span class="an-cnt">' + phaseIcon(ph.b[ph2[0]]) + '</span>';
    });

    html += '</div>' +
      '<button class="btn ghost" id="an-new">Nouvelle partie</button>' +
      '<button class="btn green big" id="an-start-review">Démarrer le bilan</button>';

    var sum = $('#an-summary');
    sum.innerHTML = html;
    $('#an-new').onclick = App.backToSelect;
    $('#an-start-review').onclick = function () {
      showView('rev');
      $('#an-coach-ava2').innerHTML = coachAvatar();
      $('#an-opening').textContent = rev.opening || 'Coups';
      App.viewPly(0);
    };
    /* clic sur le graphe -> aller au demi-coup correspondant */
    $('#an-graph-sum').addEventListener('click', graphClick);
    App.drawAnGraphs();
  }

  /* ---------- bilan coup par coup ---------- */
  /* (null hors review ou pendant une variante) */
  App.reviewPlyIndex = function () {
    if (!S.review || !S.review.plies || !S.game || S.varBase != null) return null;
    var ply = S.viewPly == null ? S.game.history.length : S.viewPly;
    var idx = ply - 1;
    return (idx >= 0 && idx < S.review.plies.length) ? idx : null;
  };

  /* jouer un coup en mode bilan -> variante */
  App.reviewMove = function (fromI, toI, promo) {
    var g = App.buildViewGame();
    var legal = g.legalMoves(App.sqName(fromI));
    var isPromo = legal.some(function (m) {
      return m.to === toI && (m.flags & Chess.FLAGS.PROMO);
    });
    if (isPromo && !promo) {
      if (S.prefs.autoQueen) promo = 'q';
      else { App.openPromo(fromI, toI); return true; }
    }
    var fenBefore = g.fen();
    var mv = g.move({ from: App.sqName(fromI), to: App.sqName(toI), promotion: promo });
    if (!mv) { Sound.illegal(); return false; }

    if (S.varBase == null) {
      S.varBase = S.viewPly == null ? S.game.history.length : S.viewPly;
      S.varMoves = []; S.varPly = 0;
    } else {
      S.varMoves = S.varMoves.slice(0, S.varPly); /* tronque si milieu de variante */
    }
    S.varMoves.push(mv); S.varPly++;
    S.viewGame = g;
    S.varReply = null;

    App.deselect();
    App.applyMoveUI(mv);
    App.renderHighlights();
    App.renderMoves();
    App.updateEval();

    if (mv.flags & (Chess.FLAGS.CAPTURE | Chess.FLAGS.EP)) Sound.capture();
    else if (mv.flags & (Chess.FLAGS.KSIDE | Chess.FLAGS.QSIDE)) Sound.castle();
    else Sound.move();
    if (mv.san.indexOf('+') >= 0) setTimeout(function () { Sound.check(); }, 140);

    /* analyse du coup joué : classe + meilleure réponse adverse (async) */
    var target = mv;
    App.exploreMove(fenBefore,
      { from: mv.from, to: mv.to, promotion: mv.promotion },
      function (res) {
        if (!res) return;
        target.an = res;
        /* affiche seulement si la position n'a pas changé entre-temps */
        if (S.varBase == null) return;
        if (S.varPly > 0 && S.varMoves[S.varPly - 1] === target) {
          S.varReply = res.reply;
          App.renderMoves();
          App.renderHighlights();
        }
      });
    return true;
  };

  /* flèche verte du meilleur coup quand on navigue dans une variante */
  App.requestVarHint = function () {
    if (S.varBase == null) return;
    var last = S.varPly > 0 ? S.varMoves[S.varPly - 1] : null;
    if (last && last.an) {
      S.varReply = last.an.reply;
      App.renderHighlights();
      return;
    }
    var fen = App.displayGame().fen();
    App.bestMoveAt(fen, function (res) {
      if (S.varBase == null) return;
      var dg = App.displayGame();
      if (!dg || dg.fen() !== fen) return; /* la position a changé */
      S.varReply = res ? res.move : null;
      App.renderHighlights();
    });
  };

  /* appelé depuis renderMoves à chaque navigation */
  App.reviewInfo = function (plyIdx) {
    var rev = S.review;
    if (!rev || !rev.plies) return;
    var el = $('#an-rev-msg');
    if (!el) return;
    explainOpen = false;
    $('#an-explain-box').classList.add('hidden');

    /* variante en cours : la bulle affiche la ligne explorée + l'analyse du coup */
    if (S.varBase != null) {
      var vs = S.varMoves.slice(0, S.varPly).map(function (m) { return m.san; });
      var last = S.varPly > 0 ? S.varMoves[S.varPly - 1] : null;
      if (last && last.an) {
        var a = last.an, cl2 = CLASSES[a.cls];
        var t2 = a.san + PHRASES[a.cls];
        if (['imprecision', 'erreur', 'gaffe', 'manque'].indexOf(a.cls) >= 0 && a.bestSan !== a.san) {
          t2 += ' Le meilleur coup était ' + a.bestSan + '.';
        }
        if (a.replySan && S.varPly === S.varMoves.length) {
          t2 += ' Meilleure réponse : ' + a.replySan + '.';
        }
        el.innerHTML =
          '<i class="cls-badge" style="background:' + cl2.color + '">' + cl2.icon + '</i> ' +
          escapeHtml(t2);
      } else {
        el.innerHTML =
          '<i class="cls-badge" style="background:#5f97c4">↳</i> ' +
          'Variante : ' + escapeHtml(vs.join(' ') || '…') +
          '<span class="an-ev">clique sur un coup pour revenir</span>';
      }
      App.drawAnGraphs();
      return;
    }

    if (plyIdx == null || plyIdx < 0) {
      el.textContent = 'Position initiale.';
    } else if (plyIdx >= rev.plies.length) {
      el.textContent = 'Fin de la partie — ' + rev.result;
    } else {
      var p = rev.plies[plyIdx];
      var cl = CLASSES[p.cls];
      var txt = p.san + PHRASES[p.cls];
      if (['imprecision', 'erreur', 'gaffe', 'manque'].indexOf(p.cls) >= 0 && p.bestSan !== p.san) {
        txt += ' Le meilleur coup était ' + p.bestSan + '.';
      }
      var evW = function (s) { return p.color === 'w' ? s : -s; };
      var fmt = function (cp) {
        if (Math.abs(cp) > CheeseAI.MATE - 2000) return '#';
        return (cp >= 0 ? '+' : '') + (cp / 100).toFixed(2);
      };
      el.innerHTML =
        '<i class="cls-badge" style="background:' + cl.color + '">' + cl.icon + '</i> ' +
        escapeHtml(txt) +
        '<span class="an-ev">' + fmt(evW(p.evalAfter)) + '</span>';
    }
    App.drawAnGraphs();
  };

  /* détail affiché par le bouton « Expliquer » */
  function explain() {
    var idx = App.reviewPlyIndex();
    var box = $('#an-explain-box');
    if (idx == null) { box.classList.add('hidden'); return; }
    explainOpen = !explainOpen;
    if (!explainOpen) { box.classList.add('hidden'); return; }
    var p = S.review.plies[idx];
    var cl = CLASSES[p.cls];
    var fmt = function (cp) {
      var e = p.color === 'w' ? cp : -cp;
      if (Math.abs(e) > CheeseAI.MATE - 2000) return '#';
      return (e >= 0 ? '+' : '') + (e / 100).toFixed(1);
    };
    box.innerHTML =
      '<div class="an-xrow"><i class="cls-badge" style="background:' + cl.color + '">' + cl.icon + '</i> ' +
        '<b>' + escapeHtml(p.san) + '</b> — ' + cl.label + ' (' + fmt(p.evalAfter) + ')</div>' +
      '<div class="an-xrow"><i class="cls-badge" style="background:' + CLASSES.meilleur.color + '">★</i> ' +
        'Meilleur coup : <b>' + escapeHtml(p.bestSan) + '</b> (' + fmt(p.evalBefore) + ')</div>' +
      '<div class="an-xrow">Perte : ' + (p.loss / 100).toFixed(2) + ' pion' + (p.loss > 150 ? 's' : '') + '</div>';
    box.classList.remove('hidden');
  }

  /* « Suivant » : prochain coup notable, sinon demi-coup suivant */
  function nextNotable() {
    var rev = S.review;
    if (!rev || !rev.plies) return;
    var cur = S.viewPly == null ? S.game.history.length : S.viewPly;
    for (var i = cur + 1; i <= rev.plies.length; i++) {
      var p = rev.plies[i - 1];
      if (p && ['livre', 'meilleur', 'bon'].indexOf(p.cls) < 0) { App.viewPly(i); return; }
    }
    App.viewPly(Math.min(cur + 1, S.game.history.length));
  }

  function stopAutoplay() {
    if (playTimer) { clearInterval(playTimer); playTimer = null; }
    var b = $('#an-play');
    if (b) b.textContent = '▶';
  }

  function toggleAutoplay() {
    if (playTimer) { stopAutoplay(); return; }
    var b = $('#an-play');
    b.textContent = '⏸';
    playTimer = setInterval(function () {
      var cur = S.viewPly == null ? S.game.history.length : S.viewPly;
      if (cur >= S.game.history.length) { stopAutoplay(); return; }
      App.viewPly(cur + 1);
    }, 1300);
  }

  /* ---------- bindings ---------- */
  App.initAnalysis = function () {
    $('#oc-ava').innerHTML = coachAvatar();
    $('#an-file').addEventListener('change', function () {
      if (this.files && this.files[0]) readFile(this.files[0]);
      this.value = '';
    });
    $('#an-file-btn').onclick = App.pickPgnFile;
    $('#an-run').onclick = App.runPgnAnalysis;
    $('#an-back').onclick = App.closeAnalysis;
    $('#btn-analysis').onclick = App.openAnalysis;
    $('#btn-analyze').onclick = App.analyzeCurrentGame;

    /* navigation dans la partie analysée */
    var cur = function () {
      return S.viewPly == null ? (S.game ? S.game.history.length : 0) : S.viewPly;
    };
    $('#an-first').onclick = function () { stopAutoplay(); App.viewPly(0); };
    $('#an-prev').onclick = function () { stopAutoplay(); App.stepBack(); };
    $('#an-next').onclick = function () { stopAutoplay(); App.stepFwd(); };
    $('#an-last').onclick = function () { stopAutoplay(); App.viewPly(null); };
    $('#an-play').onclick = toggleAutoplay;
    $('#an-tosum').onclick = function () { stopAutoplay(); showView('sum'); };
    $('#an-next2').onclick = nextNotable;
    $('#an-explain').onclick = explain;

    /* clic sur le graphe -> aller au demi-coup correspondant */
    $('#an-graph').addEventListener('click', graphClick);

    window.addEventListener('resize', App.drawAnGraphs);
  };
})();
