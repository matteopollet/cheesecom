/* ============================================================
   cheesecom — application (UI échiquier + flux de partie)
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };

  /* ============ constantes ============ */
  var PIECE_URL = {};
  ['w', 'b'].forEach(function (c) {
    ['P', 'N', 'B', 'R', 'Q', 'K'].forEach(function (t) {
      PIECE_URL[c + t] = 'assets/pieces/' + c + t + '.svg';
    });
  });
  function pieceKey(p) { return p.color + p.type.toUpperCase(); }
  function sqName(i) { return Chess.algebraic(i); }

  /* ============ sons (WebAudio) ============ */
  var Sound = {
    ctx: null, on: true,
    _ac: function () {
      if (!this.ctx) {
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
      }
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    },
    _tone: function (freq, dur, type, vol, when) {
      var ac = this._ac(); if (!ac || !this.on) return;
      var t = ac.currentTime + (when || 0);
      var o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol || 0.15, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(t); o.stop(t + dur + 0.02);
    },
    _noise: function (dur, vol, freq) {
      var ac = this._ac(); if (!ac || !this.on) return;
      var t = ac.currentTime;
      var len = Math.floor(ac.sampleRate * dur);
      var buf = ac.createBuffer(1, len, ac.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      var src = ac.createBufferSource(); src.buffer = buf;
      var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq || 900;
      var g = ac.createGain(); g.gain.setValueAtTime(vol || 0.25, t);
      src.connect(f); f.connect(g); g.connect(ac.destination);
      src.start(t);
    },
    move: function () { this._noise(0.06, 0.3, 1200); this._tone(340, 0.07, 'triangle', 0.1); },
    capture: function () { this._noise(0.11, 0.4, 600); this._tone(190, 0.12, 'triangle', 0.16); },
    castle: function () { this._noise(0.05, 0.25, 1200); this._noise(0.06, 0.25, 900); },
    check: function () { this._tone(880, 0.14, 'sine', 0.16); this._tone(1174, 0.2, 'sine', 0.12, 0.1); },
    select: function () { this._tone(520, 0.05, 'sine', 0.07); },
    illegal: function () { this._tone(160, 0.12, 'sawtooth', 0.08); },
    start: function () { this._tone(523, 0.12, 'sine', 0.12); this._tone(784, 0.16, 'sine', 0.12, 0.1); },
    win: function () { var s = this; [523, 659, 784, 1046].forEach(function (f, i) { s._tone(f, 0.2, 'sine', 0.14, i * 0.12); }); },
    lose: function () { var s = this; [392, 330, 262].forEach(function (f, i) { s._tone(f, 0.25, 'sine', 0.13, i * 0.15); }); },
    draw: function () { this._tone(440, 0.18, 'sine', 0.12); this._tone(440, 0.18, 'sine', 0.12, 0.22); },
    chat: function () { this._tone(980, 0.06, 'sine', 0.06); }
  };

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
  function aiMove(fen, rating, aggression, cb) {
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
  }

  /* ============ phrases des bots ============ */
  var LINES = {
    start: ["Bonne chance !", "C'est parti !", "Prêt ? On y va.", "Montre-moi ce que tu sais faire.", "Amuse-toi bien !"],
    botCapture: ["Je prends ça !", "Miam.", "Merci !", "Une pièce de plus.", "Hop, à moi."],
    userCapture: ["Aïe !", "Bien joué...", "Je l'avais pas vu.", "Tu me la rends ?"],
    botCheck: ["Échec !", "Attention à ton roi !", "Échec, ça commence."],
    userCheck: ["Oups.", "Pas mal !", "Je m'en sors."],
    win: ["Belle partie ! GG.", "Victoire ! Rejouons ?", "Bien essayé !"],
    lose: ["Bravo, bien joué !", "Tu m'as eu. Revanche ?", "Impressionnant !"],
    drawOk: ["D'accord, nulle.", "Oui, partageons le point.", "Accepté, belle partie."],
    drawNo: ["Non merci, je continue !", "Pas encore, la position m'intéresse.", "Je préfère jouer."],
    resign: ["Merci pour la partie !", "À la prochaine !"],
    think: ["Hmm...", "Intéressant...", "Voyons voir...", "Pas évident..."],
    flag: ["Le temps, c'est de l'argent.", "Trop lent !"]
  };
  function line(k) { var a = LINES[k]; return a[Math.floor(Math.random() * a.length)]; }

  /* ============ état global ============ */
  var state = {
    game: null,
    bot: null,
    playerColor: 'w',
    colorChoice: 'w',
    timeControl: 'casual',
    flipped: false,
    active: false,        /* partie en cours */
    inputLocked: false,   /* pendant anim / tour du bot */
    selected: -1,
    legalFrom: [],
    drag: null,
    pieceEls: {},
    userMarks: {},
    userArrows: [],
    lastMove: null,
    promoPending: null,
    clocks: { w: 0, b: 0 },
    clockTimer: null,
    rewards: parseInt(localStorage.getItem('cheesecom_rewards') || '0', 10),
    msgCount: 0
  };

  var USER = { id: 'metteoof', name: 'metteoof', flag: 'FR' };
  USER.avatar = CheeseBots.avatarSVG({ id: 'user-metteoof', robot: false }, 80);

  /* ============ utilitaires affichage ============ */
  function displayXY(i) {
    var f = i & 7, r = i >> 3;
    return state.flipped ? { x: 7 - f, y: 7 - r } : { x: f, y: r };
  }
  function squareFromEvent(e) {
    var rect = $('#board').getBoundingClientRect();
    var x = Math.floor((e.clientX - rect.left) / rect.width * 8);
    var y = Math.floor((e.clientY - rect.top) / rect.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return -1;
    return state.flipped ? (7 - y) * 8 + (7 - x) : y * 8 + x;
  }
  function pieceAt(i) { return state.game.board[i]; }

  /* ============ construction de l'échiquier ============ */
  function buildSquares() {
    var layer = $('#sq-layer');
    layer.innerHTML = '';
    for (var dy = 0; dy < 8; dy++) {
      for (var dx = 0; dx < 8; dx++) {
        var i = state.flipped ? (7 - dy) * 8 + (7 - dx) : dy * 8 + dx;
        var sq = document.createElement('div');
        sq.className = 'sq ' + (((i >> 3) + (i & 7)) % 2 === 0 ? 'light' : 'dark');
        /* coordonnées : colonne a -> lettre, rang 8 -> chiffre */
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
    renderPieces();
    renderHighlights();
  }

  function setPiecePos(el, i, instant) {
    var p = displayXY(i);
    if (instant) el.style.transition = 'none';
    el.style.transform = 'translate(' + (p.x * 100) + '%,' + (p.y * 100) + '%)';
    if (instant) requestAnimationFrame(function () { el.style.transition = ''; });
  }

  function makePieceEl(p, i) {
    var el = document.createElement('div');
    el.className = 'piece';
    el.style.backgroundImage = 'url(' + PIECE_URL[pieceKey(p)] + ')';
    el.dataset.sq = i;
    setPiecePos(el, i, true);
    return el;
  }

  function renderPieces() {
    var layer = $('#piece-layer');
    layer.innerHTML = '';
    state.pieceEls = {};
    for (var i = 0; i < 64; i++) {
      var p = state.game.board[i];
      if (!p) continue;
      var el = makePieceEl(p, i);
      state.pieceEls[i] = el;
      layer.appendChild(el);
    }
  }

  /* déplace visuellement les pièces après un coup moteur */
  function applyMoveUI(mv) {
    var F = Chess.FLAGS;
    var fromI = Chess.SQUARE_INDEX(mv.from), toI = Chess.SQUARE_INDEX(mv.to);
    var el = state.pieceEls[fromI];
    var capSq = (mv.flags & F.EP) ? toI + (mv.color === 'w' ? 8 : -8) : toI;

    if (state.pieceEls[capSq] && capSq !== fromI) {
      var capEl = state.pieceEls[capSq];
      capEl.classList.add('fading');
      (function (ce, sq) {
        setTimeout(function () { ce.remove(); }, 160);
      })(capEl);
      delete state.pieceEls[capSq];
    }

    if (el) {
      state.pieceEls[toI] = el;
      delete state.pieceEls[fromI];
      el.dataset.sq = toI;
      setPiecePos(el, toI, false);
      if (mv.promotion) {
        (function (e2, col, promo) {
          setTimeout(function () {
            e2.style.backgroundImage = 'url(' + PIECE_URL[col + promo.toUpperCase()] + ')';
          }, 120);
        })(el, mv.color, mv.promotion);
      }
    }

    /* roque : bouger la tour */
    if (mv.flags & F.KSIDE) {
      var h = mv.color === 'w' ? 60 : 4;
      var rook = state.pieceEls[h + 3];
      if (rook) { state.pieceEls[h + 1] = rook; delete state.pieceEls[h + 3]; rook.dataset.sq = h + 1; setPiecePos(rook, h + 1, false); }
    } else if (mv.flags & F.QSIDE) {
      var h2 = mv.color === 'w' ? 60 : 4;
      var rook2 = state.pieceEls[h2 - 4];
      if (rook2) { state.pieceEls[h2 - 1] = rook2; delete state.pieceEls[h2 - 4]; rook2.dataset.sq = h2 - 1; setPiecePos(rook2, h2 - 1, false); }
    }
  }

  /* ============ surbrillances ============ */
  function clearMarks() {
    state.userMarks = {};
    state.userArrows = [];
    renderHighlights();
  }

  function renderHighlights() {
    var hl = $('#hl-layer');
    var hint = $('#hint-layer');
    var arrows = $('#arrow-layer');
    hl.innerHTML = ''; hint.innerHTML = ''; arrows.innerHTML = '';

    /* dernier coup */
    if (state.lastMove) {
      [state.lastMove.from, state.lastMove.to].forEach(function (sq) {
        var i = Chess.SQUARE_INDEX(sq);
        var p = displayXY(i);
        var d = document.createElement('div');
        d.className = 'hl last';
        d.style.left = p.x * 12.5 + '%';
        d.style.top = p.y * 12.5 + '%';
        hl.appendChild(d);
      });
    }

    /* case sélectionnée */
    if (state.selected >= 0) {
      var ps = displayXY(state.selected);
      var s = document.createElement('div');
      s.className = 'hl sel';
      s.style.left = ps.x * 12.5 + '%';
      s.style.top = ps.y * 12.5 + '%';
      hl.appendChild(s);

      /* destinations légales */
      state.legalFrom.forEach(function (m) {
        var pp = displayXY(m.to);
        var d = document.createElement('div');
        d.className = m.captured ? 'hint-ring' : 'hint-dot';
        d.style.left = pp.x * 12.5 + '%';
        d.style.top = pp.y * 12.5 + '%';
        hint.appendChild(d);
      });
    }

    /* roi en échec */
    if (state.game && state.game.inCheck(state.game.turn)) {
      var k = state.game.kingSquare(state.game.turn);
      var pk = displayXY(k);
      var c = document.createElement('div');
      c.className = 'hl check';
      c.style.left = pk.x * 12.5 + '%';
      c.style.top = pk.y * 12.5 + '%';
      hl.appendChild(c);
    }

    /* marques utilisateur (clic droit) */
    Object.keys(state.userMarks).forEach(function (k2) {
      var i2 = parseInt(k2, 10);
      var pm = displayXY(i2);
      var m = document.createElement('div');
      m.className = 'hl';
      m.style.left = pm.x * 12.5 + '%';
      m.style.top = pm.y * 12.5 + '%';
      m.style.background = 'radial-gradient(circle, rgba(235,60,60,.55) 0%, rgba(235,60,60,.35) 70%, transparent 72%)';
      hl.appendChild(m);
    });

    /* flèches utilisateur + flèche d'indice */
    var aw = $('#board').clientWidth;
    arrows.setAttribute('viewBox', '0 0 ' + aw + ' ' + aw);
    state.userArrows.forEach(function (a) {
      drawArrow(arrows, a.from, a.to, 'rgba(235,120,60,.8)');
    });
    if (state.hintArrow) {
      drawArrow(arrows, state.hintArrow.from, state.hintArrow.to, 'rgba(129,182,76,.9)');
    }
  }

  function drawArrow(svg, fromI, toI, color) {
    var w = $('#board').clientWidth, cell = w / 8;
    var a = displayXY(fromI), b = displayXY(toI);
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
  }

  /* ============ cartes joueurs ============ */
  function renderCards() {
    var top, botm;
    if (state.playerColor === 'w') { top = state.bot; botm = USER; }
    else { top = USER; botm = state.bot; }

    $('#top-avatar').innerHTML = top.avatar;
    $('#top-name').innerHTML = escapeHtml(top.name) + (top.rating ? ' <em class="p-rating">(' + top.rating + ')</em>' : '');
    $('#top-flag').innerHTML = CheeseBots.flagSVG(top.flag, 18);

    $('#bot-avatar').innerHTML = botm.avatar;
    $('#bot-name').innerHTML = escapeHtml(botm.name) + (botm.rating ? ' <em class="p-rating">(' + botm.rating + ')</em>' : '');
    $('#bot-flag').innerHTML = CheeseBots.flagSVG(botm.flag, 18);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* pièces capturées + diff matérielle */
  var VALS = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  function renderCaptured() {
    var counts = { w: { p: 8, n: 2, b: 2, r: 2, q: 1 }, b: { p: 8, n: 2, b: 2, r: 2, q: 1 } };
    var mat = { w: 39, b: 39 };
    for (var i = 0; i < 64; i++) {
      var p = state.game.board[i];
      if (p && p.type !== 'k') { counts[p.color][p.type]--; mat[p.color] -= VALS[p.type]; }
    }
    var order = ['q', 'r', 'b', 'n', 'p'];
    function capsHTML(color) {
      var html = '';
      order.forEach(function (t) {
        for (var k = 0; k < counts[color][t]; k++) {
          html += '<img class="cap" src="' + PIECE_URL[color + t.toUpperCase()] + '">';
        }
      });
      return html;
    }
    var diff = mat.w - mat.b; /* <0 => blancs en tête? non: on a soustrait -> mat = perdu */
    /* mat[c] = matériel PERDU par c ; avantage de w = mat.b - mat.w */
    var adv = mat.b - mat.w;
    if (state.playerColor === 'w') {
      $('#top-captured').innerHTML = capsHTML('w');   /* pièces blanches prises par le bot */
      $('#bot-captured').innerHTML = capsHTML('b');
      $('#top-score').textContent = adv < 0 ? '+' + (-adv) : '';
      $('#bot-score').textContent = adv > 0 ? '+' + adv : '';
    } else {
      $('#top-captured').innerHTML = capsHTML('b');
      $('#bot-captured').innerHTML = capsHTML('w');
      $('#top-score').textContent = adv > 0 ? '+' + adv : '';
      $('#bot-score').textContent = adv < 0 ? '+' + (-adv) : '';
    }
  }

  /* ============ liste des coups ============ */
  function renderMoves() {
    var list = $('#moves-list');
    list.innerHTML = '';
    var hist = state.game.history;
    for (var i = 0; i < hist.length; i += 2) {
      var row = document.createElement('div');
      row.className = 'mv-row';
      var num = document.createElement('span');
      num.className = 'mv-num';
      num.textContent = (i / 2 + 1) + '.';
      row.appendChild(num);
      [hist[i], hist[i + 1]].forEach(function (m, j) {
        var s = document.createElement('span');
        s.className = 'mv' + (m && m.captured ? ' cap' : '');
        if (i + j === hist.length - 1) s.classList.add('latest');
        s.textContent = m ? m.san : '';
        row.appendChild(s);
      });
      list.appendChild(row);
    }
    list.scrollTop = list.scrollHeight;
  }

  /* ============ horloges ============ */
  function fmtClock(ms) {
    if (ms < 0) ms = 0;
    var s = Math.ceil(ms / 1000);
    var m = Math.floor(s / 60), ss = s % 60;
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }
  function renderClocks() {
    var topC = state.playerColor === 'w' ? 'b' : 'w';
    var botC = state.playerColor;
    $('#clock-top').textContent = state.timeControl === 'casual' ? '∞' : fmtClock(state.clocks[topC]);
    $('#clock-bot').textContent = state.timeControl === 'casual' ? '∞' : fmtClock(state.clocks[botC]);
    var active = state.game ? state.game.turn : null;
    $('#clock-top').classList.toggle('active', state.active && state.timeControl !== 'casual' && active === topC);
    $('#clock-bot').classList.toggle('active', state.active && state.timeControl !== 'casual' && active === botC);
  }
  function startClocks() {
    stopClocks();
    if (state.timeControl === 'casual') { renderClocks(); return; }
    var mins = state.timeControl === 'blitz' ? 5 : 10;
    state.clocks = { w: mins * 60000, b: mins * 60000 };
    var last = Date.now();
    state.clockTimer = setInterval(function () {
      var now = Date.now(), dt = now - last; last = now;
      if (!state.active) return;
      state.clocks[state.game.turn] -= dt;
      renderClocks();
      if (state.clocks[state.game.turn] <= 0) {
        var loser = state.game.turn;
        endGame(loser === 'w' ? '0-1' : '1-0', 'au temps', loser !== state.playerColor ? 'win' : 'lose');
      }
    }, 200);
  }
  function stopClocks() {
    if (state.clockTimer) { clearInterval(state.clockTimer); state.clockTimer = null; }
  }

  /* ============ chat ============ */
  function botSay(text) {
    var area = $('#chat-area');
    var div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = '<span class="cm-ava">' + state.bot.avatar + '</span>' +
      '<span class="cm-bubble"><span class="cm-name">' + escapeHtml(state.bot.name) + '</span><br>' + escapeHtml(text) + '</span>';
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
    Sound.chat();
    state.msgCount++;
  }
  function botThink(show) {
    var area = $('#chat-area');
    var old = $('#think-bubble');
    if (old) old.remove();
    if (!show) return;
    var div = document.createElement('div');
    div.className = 'chat-msg';
    div.id = 'think-bubble';
    div.innerHTML = '<span class="cm-ava">' + state.bot.avatar + '</span>' +
      '<span class="cm-bubble"><span class="thinking"><i></i><i></i><i></i></span></span>';
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
  }

  /* ============ sélection / déplacement ============ */
  function deselect() {
    state.selected = -1;
    state.legalFrom = [];
    renderHighlights();
  }

  function select(i) {
    state.selected = i;
    state.legalFrom = state.game.legalMoves(sqName(i));
    Sound.select();
    renderHighlights();
  }

  function tryMove(fromI, toI, promo) {
    var legal = state.game.legalMoves(sqName(fromI));
    var isPromo = legal.some(function (m) { return m.to === toI && (m.flags & Chess.FLAGS.PROMO); });
    if (isPromo && !promo) {
      openPromo(fromI, toI);
      return true;
    }
    var mv = state.game.move({ from: sqName(fromI), to: sqName(toI), promotion: promo });
    if (!mv) return false;
    afterMove(mv, 'player');
    return true;
  }

  function afterMove(mv, who) {
    state.lastMove = { from: mv.from, to: mv.to };
    state.hintArrow = null;
    deselect();
    clearMarksSilent();
    applyMoveUI(mv);
    renderHighlights();
    renderMoves();
    renderCaptured();
    renderClocks();

    if (mv.flags & Chess.FLAGS.CAPTURE || mv.flags & Chess.FLAGS.EP) Sound.capture();
    else if (mv.flags & (Chess.FLAGS.KSIDE | Chess.FLAGS.QSIDE)) Sound.castle();
    else Sound.move();
    if (mv.san.indexOf('+') >= 0) setTimeout(function () { Sound.check(); }, 140);

    /* réactions du bot */
    if (who === 'player') {
      if (mv.captured && Math.random() < 0.5) botSay(line('userCapture'));
      else if (mv.san.indexOf('+') >= 0 && Math.random() < 0.6) botSay(line('userCheck'));
    } else {
      if (mv.captured && Math.random() < 0.4) botSay(line('botCapture'));
      else if (mv.san.indexOf('+') >= 0) botSay(line('botCheck'));
    }

    checkGameEnd();
    if (state.active && state.game.turn !== state.playerColor) {
      scheduleBotMove();
    }
  }

  function clearMarksSilent() {
    state.userMarks = {};
    state.userArrows = [];
  }

  /* ---------- promotion ---------- */
  function openPromo(fromI, toI) {
    state.promoPending = { from: fromI, to: toI };
    var picker = $('#promo-picker');
    var board = $('#board');
    var cell = board.clientWidth / 8;
    var p = displayXY(toI);
    var color = state.game.board[fromI].color;
    picker.innerHTML = '';
    ['q', 'r', 'b', 'n'].forEach(function (t, idx) {
      var b = document.createElement('button');
      b.className = 'promo-btn';
      b.style.width = cell + 'px';
      b.style.backgroundImage = 'url(' + PIECE_URL[color + t.toUpperCase()] + ')';
      b.onclick = function (ev) {
        ev.stopPropagation();
        closePromo();
        tryMove(fromI, toI, t);
      };
      picker.appendChild(b);
    });
    var h = cell * 4;
    var left = p.x * cell;
    var top = p.y * cell;
    if (top + h > board.clientHeight) top -= h - cell; /* colonne vers le haut */
    picker.style.left = left + 'px';
    picker.style.top = top + 'px';
    picker.classList.add('open');
  }
  function closePromo() {
    $('#promo-picker').classList.remove('open');
    state.promoPending = null;
  }

  /* ---------- interactions souris ---------- */
  function isUserTurn() {
    return state.active && !state.inputLocked && state.game.turn === state.playerColor;
  }

  function onPointerDown(e) {
    if (!state.game) return;
    if (e.target && e.target.closest && e.target.closest('.promo-picker')) return;
    if (e.button === 2) { /* clic droit : marques */
      var i0 = squareFromEvent(e);
      if (i0 >= 0) state.rightStart = i0;
      return;
    }
    if (e.button !== 0) return;
    closePromo();
    clearMarks();

    var i = squareFromEvent(e);
    if (i < 0) return;
    var p = pieceAt(i);

    /* destination d'un coup déjà sélectionné */
    if (state.selected >= 0 && state.legalFrom.some(function (m) { return m.to === i; })) {
      var ok = tryMove(state.selected, i);
      if (!ok) Sound.illegal();
      return;
    }

    if (isUserTurn() && p && p.color === state.playerColor) {
      select(i);
      /* démarrer le drag */
      var el = state.pieceEls[i];
      var rect = $('#board').getBoundingClientRect();
      state.drag = {
        el: el, from: i, moved: false,
        startX: e.clientX, startY: e.clientY,
        ox: e.clientX - rect.left, oy: e.clientY - rect.top
      };
      el.classList.add('dragging');
      $('#board').setPointerCapture(e.pointerId);
    } else if (state.selected >= 0) {
      deselect();
    }
  }

  function onPointerMove(e) {
    if (!state.drag) return;
    var d = state.drag;
    var rect = $('#board').getBoundingClientRect();
    var x = e.clientX - rect.left, y = e.clientY - rect.top;
    var cell = rect.width / 8;
    if (Math.abs(e.clientX - d.startX) + Math.abs(e.clientY - d.startY) > 4) d.moved = true;
    d.el.style.transform = 'translate(' + (x - cell / 2) + 'px,' + (y - cell / 2) + 'px)';
  }

  function onPointerUp(e) {
    if (e.button === 2) {
      var iEnd = squareFromEvent(e);
      var iStart = state.rightStart;
      state.rightStart = null;
      if (iStart == null || iStart < 0) return;
      if (iEnd === iStart) {
        if (state.userMarks[iEnd]) delete state.userMarks[iEnd];
        else state.userMarks[iEnd] = true;
      } else if (iEnd >= 0) {
        var exists = state.userArrows.some(function (a) { return a.from === iStart && a.to === iEnd; });
        if (exists) state.userArrows = state.userArrows.filter(function (a) { return !(a.from === iStart && a.to === iEnd); });
        else state.userArrows.push({ from: iStart, to: iEnd });
      }
      renderHighlights();
      return;
    }
    if (!state.drag) return;
    var d = state.drag;
    state.drag = null;
    d.el.classList.remove('dragging');

    var to = squareFromEvent(e);
    if (d.moved && to >= 0 && to !== d.from) {
      var legal = state.legalFrom.some(function (m) { return m.to === to; });
      if (legal) {
        tryMove(d.from, to);
        return;
      }
      Sound.illegal();
    }
    /* snap back */
    setPiecePos(d.el, parseInt(d.el.dataset.sq, 10), false);
    if (!d.moved) {
      /* simple clic : sélection/déselection déjà gérée au pointerdown */
    }
  }

  /* ============ tour du bot ============ */
  function scheduleBotMove() {
    state.inputLocked = true;
    botThink(true);
    var wait = CheeseAI.thinkTime(state.bot.rating);
    var fen = state.game.fen();
    var bot = state.bot;

    /* occasionnellement, un commentaire */
    if (Math.random() < 0.12 && state.msgCount > 0) {
      setTimeout(function () { if (state.inputLocked) botSay(line('think')); }, Math.min(600, wait / 2));
    }

    aiMove(fen, bot.rating, bot.aggression, function (mv) {
      var elapsed = wait;
      setTimeout(function () {
        botThink(false);
        state.inputLocked = false;
        if (!state.active || !mv) return;
        var done = state.game.move(mv);
        if (done) afterMove(done, 'bot');
      }, elapsed);
    });
  }

  /* ============ fin de partie ============ */
  function checkGameEnd() {
    var g = state.game;
    if (g.isCheckmate()) {
      var winner = g.turn === 'w' ? 'b' : 'w';
      endGame(winner === 'w' ? '1-0' : '0-1', 'par échec et mat', winner === state.playerColor ? 'win' : 'lose');
    } else if (g.isStalemate()) {
      endGame('½-½', 'par pat', 'draw');
    } else if (g.isInsufficientMaterial()) {
      endGame('½-½', 'matériel insuffisant', 'draw');
    } else if (g.isThreefoldRepetition()) {
      endGame('½-½', 'par triple répétition', 'draw');
    } else if (g.halfMoves >= 100) {
      endGame('½-½', 'règle des 50 coups', 'draw');
    }
  }

  function endGame(result, reason, outcome) {
    if (!state.active) return;
    state.active = false;
    state.inputLocked = true;
    stopClocks();
    botThink(false);
    renderClocks();

    var titles = { win: 'Victoire !', lose: 'Défaite', draw: 'Partie nulle' };
    $('#overlay-result').textContent = result;
    $('#overlay-result').style.color = outcome === 'win' ? 'var(--yellow)' : outcome === 'lose' ? '#e8e6e3' : 'var(--muted)';
    $('#overlay-title').textContent = titles[outcome];
    $('#overlay-sub').textContent = reason;
    $('#board-overlay').classList.remove('hidden');

    if (outcome === 'win') { Sound.win(); setTimeout(function () { botSay(line('lose')); }, 800); addRewards(50); }
    else if (outcome === 'lose') { Sound.lose(); setTimeout(function () { botSay(line('win')); }, 800); addRewards(15); }
    else { Sound.draw(); setTimeout(function () { botSay(line('drawOk')); }, 800); addRewards(25); }
  }

  function addRewards(n) {
    state.rewards = Math.min(125, state.rewards + n);
    localStorage.setItem('cheesecom_rewards', String(state.rewards));
    $('#rw-count').textContent = state.rewards + '/125';
    $('#reward-fill').style.width = (state.rewards / 125 * 100) + '%';
  }

  /* ============ démarrage ============ */
  function startGame() {
    closePromo();
    var color = state.colorChoice;
    if (color === 'random') color = Math.random() < 0.5 ? 'w' : 'b';
    state.playerColor = color;
    state.flipped = color === 'b';
    state.game = new Chess();
    state.active = true;
    state.inputLocked = false;
    state.selected = -1;
    state.legalFrom = [];
    state.lastMove = null;
    state.userMarks = {};
    state.userArrows = [];
    state.hintArrow = null;
    state.msgCount = 0;

    $('#board-overlay').classList.add('hidden');
    $('#panel-select').classList.add('hidden');
    $('#panel-game').classList.remove('hidden');
    $('#chat-area').innerHTML = '';
    $('#game-vs').textContent = state.bot.name + ' (' + state.bot.rating + ') vs ' + USER.name;

    buildSquares();
    renderCards();
    renderMoves();
    renderCaptured();
    renderClocks();
    startClocks();
    Sound.start();

    setTimeout(function () { botSay(line('start')); }, 700);

    if (state.game.turn !== state.playerColor) scheduleBotMove();
  }

  function backToSelect() {
    state.active = false;
    stopClocks();
    botThink(false);
    $('#board-overlay').classList.add('hidden');
    $('#panel-game').classList.add('hidden');
    $('#panel-select').classList.remove('hidden');
    closePromo();
    deselect();
  }

  /* ============ panneau de sélection ============ */
  var selectedBot = CheeseBots.GROUPS[0].bots[0];

  function renderBotCard() {
    $('#bc-avatar').innerHTML = selectedBot.avatar;
    $('#bc-name').textContent = selectedBot.name;
    $('#bc-rating').textContent = selectedBot.rating;
    $('#bc-flag').innerHTML = CheeseBots.flagSVG(selectedBot.flag, 18);
    var group = null;
    CheeseBots.GROUPS.forEach(function (g) {
      if (g.bots.indexOf(selectedBot) >= 0) group = g;
    });
    $('#bc-group').textContent = group ? group.title : '';
    $('#bc-chip').textContent = Math.round(selectedBot.rating / 2) || 5;
    renderStrip();
    renderListSelection();
  }

  function renderStrip() {
    var strip = $('#group-strip');
    strip.innerHTML = '';
    var grp = CheeseBots.GROUPS[0];
    grp.bots.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'gs-bot' + (b === selectedBot ? ' selected' : '');
      btn.innerHTML = '<span class="gs-ava">' + b.avatar + '</span><span class="gs-rate">' + b.rating + '</span>';
      btn.onclick = function () { selectedBot = b; renderBotCard(); };
      strip.appendChild(btn);
    });
  }

  var openCats = {};
  function renderBotsList() {
    var list = $('#bots-list');
    list.innerHTML = '';
    CheeseBots.GROUPS.forEach(function (g) {
      if (g.featured) return;
      var row = document.createElement('button');
      row.className = 'cat-row' + (openCats[g.id] ? ' open' : '');
      row.innerHTML =
        '<span class="cat-ava">' + g.bots[0].avatar + '</span>' +
        '<span class="cat-name">' + escapeHtml(g.title) + '</span>' +
        '<span class="cat-count">' + g.bots.length + ' bots</span>' +
        '<svg class="cat-chev" viewBox="0 0 24 24"><path d="M7.4 8.6L12 13.2l4.6-4.6L18 10l-6 6-6-6z" fill="currentColor"/></svg>';
      var sub = document.createElement('div');
      sub.className = 'cat-bots' + (openCats[g.id] ? ' open' : '');
      g.bots.forEach(function (b) {
        var br = document.createElement('button');
        br.className = 'bot-row' + (b === selectedBot ? ' selected' : '');
        br.dataset.botid = b.id;
        br.innerHTML =
          '<span class="br-ava">' + b.avatar + '</span>' +
          '<span class="br-name">' + escapeHtml(b.name) + '</span>' +
          '<span class="br-rating">' + b.rating + '</span>' +
          '<span class="br-flag">' + CheeseBots.flagSVG(b.flag, 16) + '</span>';
        br.onclick = function () { selectedBot = b; renderBotCard(); };
        sub.appendChild(br);
      });
      row.onclick = function () {
        openCats[g.id] = !openCats[g.id];
        row.classList.toggle('open', openCats[g.id]);
        sub.classList.toggle('open', openCats[g.id]);
      };
      list.appendChild(row);
      list.appendChild(sub);
    });
  }

  function renderListSelection() {
    document.querySelectorAll('.bot-row').forEach(function (el) {
      el.classList.toggle('selected', el.dataset.botid === selectedBot.id);
    });
  }

  /* ============ actions partie ============ */
  function resign() {
    if (!state.active) return;
    var res = state.playerColor === 'w' ? '0-1' : '1-0';
    botSay(line('resign'));
    endGame(res, 'par abandon', 'lose');
  }

  function offerDraw() {
    if (!state.active) return;
    /* le bot accepte s'il est mal */
    var g = state.game;
    var evalNow = CheeseAI.evaluate(g, state.bot.aggression); /* du point de vue du trait */
    var botToMove = g.turn !== state.playerColor;
    var botScore = botToMove ? evalNow : -evalNow;

    var pieces = 0;
    for (var i = 0; i < 64; i++) if (g.board[i] && g.board[i].type !== 'k') pieces++;

    botSay('...');
    setTimeout(function () {
      var msgs = document.querySelectorAll('#chat-area .chat-msg');
      if (msgs.length) msgs[msgs.length - 1].remove();
      if (botScore < -150 || (pieces <= 4 && Math.abs(botScore) < 80) || g.halfMoves > 80) {
        botSay(line('drawOk'));
        endGame('½-½', 'par accord mutuel', 'draw');
      } else {
        botSay(line('drawNo'));
      }
    }, 900 + Math.random() * 900);
  }

  function hint() {
    if (!state.active || state.game.turn !== state.playerColor) return;
    var fen = state.game.fen();
    botThink(false);
    aiMove(fen, 2100, 0, function (mv) {
      if (!mv) return;
      state.hintArrow = { from: Chess.SQUARE_INDEX(mv.from), to: Chess.SQUARE_INDEX(mv.to) };
      renderHighlights();
      setTimeout(function () { state.hintArrow = null; renderHighlights(); }, 2600);
    });
  }

  /* ============ liaisons UI ============ */
  function init() {
    $('#user-avatar').innerHTML = USER.avatar;

    /* échiquier initial (position de départ, bot affiché) */
    state.game = new Chess();
    state.bot = selectedBot;
    state.flipped = false;
    state.playerColor = 'w';
    buildSquares();
    renderCards();

    /* récompenses */
    $('#rw-count').textContent = state.rewards + '/125';
    $('#reward-fill').style.width = (state.rewards / 125 * 100) + '%';

    renderBotCard();
    renderBotsList();

    /* events board */
    var board = $('#board');
    board.addEventListener('pointerdown', onPointerDown);
    board.addEventListener('pointermove', onPointerMove);
    board.addEventListener('pointerup', onPointerUp);
    board.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    board.addEventListener('pointerleave', function (e) {
      if (state.drag && !state.drag.moved) { /* rien */ }
    });

    /* panneau */
    $('#btn-play').onclick = function () { state.bot = selectedBot; startGame(); };
    $('#options-row').onclick = function () {
      $('#options-row').classList.toggle('open');
      $('#options-body').classList.toggle('hidden');
    };
    document.querySelectorAll('#seg-color .seg-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#seg-color .seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        state.colorChoice = b.dataset.color;
      };
    });
    document.querySelectorAll('#seg-time .seg-btn').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#seg-time .seg-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        state.timeControl = b.dataset.tc;
      };
    });

    /* actions partie */
    $('#btn-resign').onclick = resign;
    $('#btn-resign').classList.add('danger');
    $('#btn-draw').onclick = offerDraw;
    $('#btn-hint2').onclick = hint;
    $('#btn-quit').onclick = backToSelect;
    $('#btn-rematch').onclick = function () { startGame(); };
    $('#btn-newbot').onclick = backToSelect;
    $('#btn-flip').onclick = function () {
      state.flipped = !state.flipped;
      buildSquares();
      closePromo();
      deselect();
    };
    $('#btn-hint').onclick = hint;
    $('#btn-sound').onclick = toggleSound;
    $('#panel-sound').onclick = toggleSound;
    $('#panel-menu').onclick = backToSelect;

    window.addEventListener('resize', renderHighlights);
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { deselect(); closePromo(); }
    });

    /* handle de debug/test */
    window.__cheese = state;
    window.__api = {
      startGame: startGame, tryMove: tryMove, resign: resign,
      offerDraw: offerDraw, selectBot: function (id) {
        var b = CheeseBots.findBot(id); if (b) { selectedBot = b; renderBotCard(); }
      },
      setFen: function (fen) { state.game = new Chess(fen); renderPieces(); renderMoves(); renderCaptured(); renderHighlights(); }
    };
  }

  function toggleSound() {
    Sound.on = !Sound.on;
    $('#btn-sound').classList.toggle('off', !Sound.on);
    $('#panel-sound').classList.toggle('off', !Sound.on);
    if (Sound.on) Sound.select();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
