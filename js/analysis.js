/* ============================================================
   cheesecom — analyse de partie façon chess.com
   Import PGN (coller ou fichier), classification des coups,
   bilan de précision. Tout tourne dans un Web Worker.
   ============================================================ */
(function () {
  'use strict';

  var S = App.state;
  var $ = App.$;
  var escapeHtml = App.escapeHtml;

  /* classes de coups : libellé, symbole, couleur (style chess.com) */
  var CLASSES = {
    brillant:    { label: 'Brillant',      icon: '!!', color: '#1bada1' },
    meilleur:    { label: 'Meilleur coup', icon: '★',  color: '#96bc4b' },
    bon:         { label: 'Bon coup',      icon: '✓',  color: '#a39e8f' },
    imprecision: { label: 'Imprécision',   icon: '?!', color: '#f7c631' },
    erreur:      { label: 'Erreur',        icon: '?',  color: '#e6912c' },
    gaffe:       { label: 'Gaffe',         icon: '??', color: '#ca3431' },
    manque:      { label: 'Coup manqué',   icon: '✕',  color: '#d06a9c' }
  };
  var ORDER = ['brillant', 'meilleur', 'bon', 'imprecision', 'erreur', 'gaffe', 'manque'];
  App.CLASSES = CLASSES;
  App.CLASS_ORDER = ORDER;

  var worker = null;
  var analyzing = false;

  /* ---------- ouverture / fermeture ---------- */
  App.openAnalysis = function () {
    S.active = false;
    App.stopClocks();
    App.botThink(false);
    App.hideConfirm();
    App.closePromo();
    App.deselect();
    S.premove = null;
    $('#board-overlay').classList.add('hidden');
    $('#panel-select').classList.add('hidden');
    $('#panel-game').classList.add('hidden');
    $('#panel-analysis').classList.remove('hidden');
    if (!S.review) {
      $('#an-input').classList.remove('hidden');
      $('#an-results').classList.add('hidden');
    }
  };

  App.stopAnalysis = function () {
    analyzing = false;
    if (worker) { worker.terminate(); worker = null; }
  };

  App.closeAnalysis = function () {
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
    var wElo = S.playerColor === 'w' ? '' : S.bot.rating;
    var bElo = S.playerColor === 'w' ? S.bot.rating : '';
    startAnalysis(g, null, {
      white: { name: wName, rating: wElo },
      black: { name: bName, rating: bElo },
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
      result: parsed.result
    }, parsed.startFen);
  };

  /* ---------- cœur ---------- */
  function startAnalysis(game, moves, meta, startFen) {
    if (analyzing) { App.toast('Analyse déjà en cours…'); return; }

    /* positionne le plateau sur la partie importée */
    S.game = game;
    S.review = {
      white: mkPlayer(meta.white),
      black: mkPlayer(meta.black),
      result: meta.result,
      plies: null, evalsW: null, ev0W: null, accuracy: null
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

    $('#an-input').classList.add('hidden');
    $('#an-results').classList.remove('hidden');
    $('#an-summary').innerHTML = '';
    $('#moves-list-an').innerHTML = '';
    showProgress(0, 1);

    var payload = moves || game.history.map(function (h) {
      return { from: h.from, to: h.to, promotion: h.promotion };
    });
    var fen = startFen || Chess.START_FEN;

    analyzing = true;
    $('#an-run').disabled = true;

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
    $('#an-run').disabled = false;
    $('#an-progress-txt').textContent = 'Erreur : ' + msg;
  }

  function finishAnalysis(res) {
    analyzing = false;
    $('#an-run').disabled = false;
    if (worker) { worker.terminate(); worker = null; }
    $('#an-progress').classList.add('hidden');

    S.review.plies = res.plies;
    S.review.accuracy = res.accuracy;
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

  /* ---------- bilan ---------- */
  function renderSummary() {
    var rev = S.review;
    var counts = { w: {}, b: {} };
    ORDER.forEach(function (c) { counts.w[c] = 0; counts.b[c] = 0; });
    rev.plies.forEach(function (p) { counts[p.color][p.cls]++; });

    var html =
      '<div class="an-players">' +
        '<span class="an-pl"><i class="an-dot w"></i>' + escapeHtml(rev.white.name) +
          (rev.white.rating ? ' <em>(' + escapeHtml(String(rev.white.rating)) + ')</em>' : '') + '</span>' +
        '<span class="an-res">' + escapeHtml(rev.result) + '</span>' +
        '<span class="an-pl"><i class="an-dot b"></i>' + escapeHtml(rev.black.name) +
          (rev.black.rating ? ' <em>(' + escapeHtml(String(rev.black.rating)) + ')</em>' : '') + '</span>' +
      '</div>' +
      '<div class="an-acc">' +
        '<span class="an-acc-n">' + rev.accuracy.w.toFixed(1) + '</span>' +
        '<span class="an-acc-l">Précision</span>' +
        '<span class="an-acc-n">' + rev.accuracy.b.toFixed(1) + '</span>' +
      '</div>' +
      '<div class="an-grid">';
    ORDER.forEach(function (c) {
      var cl = CLASSES[c];
      if (!counts.w[c] && !counts.b[c]) return;
      html +=
        '<span class="an-cnt">' + (counts.w[c] || '') + '</span>' +
        '<span class="an-cls"><i class="cls-badge" style="background:' + cl.color + '">' + cl.icon + '</i>' + cl.label + '</span>' +
        '<span class="an-cnt">' + (counts.b[c] || '') + '</span>';
    });
    html += '</div>';
    $('#an-summary').innerHTML = html;
  }

  /* infos du coup survolé/sélectionné (appelé depuis renderMoves) */
  App.reviewInfo = function (plyIdx) {
    var rev = S.review;
    var el = $('#an-info');
    if (!el || !rev || !rev.plies) return;
    if (plyIdx == null || plyIdx < 0 || plyIdx >= rev.plies.length) { el.textContent = ''; return; }
    var p = rev.plies[plyIdx];
    var cl = CLASSES[p.cls];
    var txt = cl.label + ' : ' + p.san;
    if (p.cls !== 'meilleur' && p.cls !== 'brillant' && p.bestSan !== p.san) {
      txt += ' — le meilleur coup était ' + p.bestSan;
    }
    el.innerHTML = '<i class="cls-badge" style="background:' + cl.color + '">' + cl.icon + '</i> ' + escapeHtml(txt);
  };

  /* ---------- bindings ---------- */
  App.initAnalysis = function () {
    $('#an-file').addEventListener('change', function () {
      if (this.files && this.files[0]) readFile(this.files[0]);
      this.value = '';
    });
    $('#an-file-btn').onclick = App.pickPgnFile;
    $('#an-run').onclick = App.runPgnAnalysis;
    $('#an-back').onclick = App.closeAnalysis;
    $('#an-new').onclick = function () {
      S.review = null; S.viewGame = null; S.viewPly = null;
      S.game = new Chess();
      App.renderPieces(); App.renderMoves(); App.renderCaptured(); App.updateEval();
      $('#an-results').classList.add('hidden');
      $('#an-input').classList.remove('hidden');
    };
    $('#btn-analysis').onclick = App.openAnalysis;
    $('#btn-analyze').onclick = App.analyzeCurrentGame;
  };
})();
