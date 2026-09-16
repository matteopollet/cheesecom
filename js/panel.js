/* ============================================================
   cheesecom — panneaux : cartes joueurs, coups, horloges,
   chat, sélection des bots
   ============================================================ */
(function () {
  'use strict';

  var S = App.state;
  var Sound = App.Sound;
  var $ = App.$;
  var escapeHtml = App.escapeHtml;

  /* ============ cartes joueurs ============ */
  App.renderCards = function () {
    var top, botm;
    if (S.playerColor === 'w') { top = S.bot; botm = App.USER; }
    else { top = App.USER; botm = S.bot; }

    $('#top-avatar').innerHTML = top.avatar;
    $('#top-name').innerHTML = escapeHtml(top.name) + (top.rating ? ' <em class="p-rating">(' + top.rating + ')</em>' : '');
    $('#top-flag').innerHTML = CheeseBots.flagSVG(top.flag, 18);

    $('#bot-avatar').innerHTML = botm.avatar;
    $('#bot-name').innerHTML = escapeHtml(botm.name) + (botm.rating ? ' <em class="p-rating">(' + botm.rating + ')</em>' : '');
    $('#bot-flag').innerHTML = CheeseBots.flagSVG(botm.flag, 18);
  };

  /* pièces capturées + diff matérielle */
  App.renderCaptured = function () {
    var counts = { w: { p: 8, n: 2, b: 2, r: 2, q: 1 }, b: { p: 8, n: 2, b: 2, r: 2, q: 1 } };
    var lost = { w: 0, b: 0 };
    for (var i = 0; i < 64; i++) {
      var p = S.game.board[i];
      if (p && p.type !== 'k') { counts[p.color][p.type]--; }
    }
    ['q', 'r', 'b', 'n', 'p'].forEach(function (t) {
      lost.w += counts.w[t] * App.VALS[t];
      lost.b += counts.b[t] * App.VALS[t];
    });
    function capsHTML(color) {
      var html = '';
      ['q', 'r', 'b', 'n', 'p'].forEach(function (t) {
        for (var k = 0; k < counts[color][t]; k++) {
          html += '<img class="cap" src="' + App.PIECE_URL[color + t.toUpperCase()] + '" alt="">';
        }
      });
      return html;
    }
    var adv = lost.b - lost.w; /* >0 : les blancs ont pris plus */
    if (S.playerColor === 'w') {
      $('#top-captured').innerHTML = capsHTML('w');
      $('#bot-captured').innerHTML = capsHTML('b');
      $('#top-score').textContent = adv < 0 ? '+' + (-adv) : '';
      $('#bot-score').textContent = adv > 0 ? '+' + adv : '';
    } else {
      $('#top-captured').innerHTML = capsHTML('b');
      $('#bot-captured').innerHTML = capsHTML('w');
      $('#top-score').textContent = adv > 0 ? '+' + adv : '';
      $('#bot-score').textContent = adv < 0 ? '+' + (-adv) : '';
    }
  };

  /* ============ liste des coups ============ */
  App.renderMoves = function () {
    var list = $('#moves-list');
    list.innerHTML = '';
    var hist = S.game.history;
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
  };

  /* ============ horloges ============ */
  function fmtClock(ms) {
    if (ms < 0) ms = 0;
    var s = Math.ceil(ms / 1000);
    var m = Math.floor(s / 60), ss = s % 60;
    return m + ':' + (ss < 10 ? '0' : '') + ss;
  }

  App.renderClocks = function () {
    var topC = S.playerColor === 'w' ? 'b' : 'w';
    var botC = S.playerColor;
    $('#clock-top').textContent = S.timeControl === 'casual' ? '∞' : fmtClock(S.clocks[topC]);
    $('#clock-bot').textContent = S.timeControl === 'casual' ? '∞' : fmtClock(S.clocks[botC]);
    var active = S.game ? S.game.turn : null;
    $('#clock-top').classList.toggle('active', S.active && S.timeControl !== 'casual' && active === topC);
    $('#clock-bot').classList.toggle('active', S.active && S.timeControl !== 'casual' && active === botC);
  };

  App.startClocks = function () {
    App.stopClocks();
    if (S.timeControl === 'casual') { App.renderClocks(); return; }
    var mins = S.timeControl === 'blitz' ? 5 : 10;
    S.clocks = { w: mins * 60000, b: mins * 60000 };
    var last = Date.now();
    S.clockTimer = setInterval(function () {
      var now = Date.now(), dt = now - last; last = now;
      if (!S.active) return;
      S.clocks[S.game.turn] -= dt;
      App.renderClocks();
      if (S.clocks[S.game.turn] <= 0) {
        var loser = S.game.turn;
        App.endGame(loser === 'w' ? '0-1' : '1-0', 'au temps', loser !== S.playerColor ? 'win' : 'lose');
      }
    }, 200);
  };

  App.stopClocks = function () {
    if (S.clockTimer) { clearInterval(S.clockTimer); S.clockTimer = null; }
  };

  /* ============ chat ============ */
  App.botSay = function (text) {
    var area = $('#chat-area');
    var div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = '<span class="cm-ava">' + S.bot.avatar + '</span>' +
      '<span class="cm-bubble"><span class="cm-name">' + escapeHtml(S.bot.name) + '</span><br>' + escapeHtml(text) + '</span>';
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
    Sound.chat();
    S.msgCount++;
  };

  App.botThink = function (show) {
    var area = $('#chat-area');
    var old = $('#think-bubble');
    if (old) old.remove();
    if (!show) return;
    var div = document.createElement('div');
    div.className = 'chat-msg';
    div.id = 'think-bubble';
    div.innerHTML = '<span class="cm-ava">' + S.bot.avatar + '</span>' +
      '<span class="cm-bubble"><span class="thinking"><i></i><i></i><i></i></span></span>';
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
  };

  /* ============ récompenses ============ */
  App.addRewards = function (n) {
    S.rewards = Math.min(125, S.rewards + n);
    localStorage.setItem('cheesecom_rewards', String(S.rewards));
    $('#rw-count').textContent = S.rewards + '/125';
    $('#reward-fill').style.width = (S.rewards / 125 * 100) + '%';
  };

  /* ============ panneau de sélection ============ */
  App.renderBotCard = function () {
    var b = App.selectedBot;
    $('#bc-avatar').innerHTML = b.avatar;
    $('#bc-name').textContent = b.name;
    $('#bc-rating').textContent = b.rating;
    $('#bc-flag').innerHTML = CheeseBots.flagSVG(b.flag, 18);
    var group = null;
    CheeseBots.GROUPS.forEach(function (g) {
      if (g.bots.indexOf(b) >= 0) group = g;
    });
    $('#bc-group').textContent = group ? group.title : '';
    $('#bc-chip').textContent = Math.round(b.rating / 2) || 5;
    App.renderStrip();
    App.renderListSelection();
  };

  App.renderStrip = function () {
    var strip = $('#group-strip');
    strip.innerHTML = '';
    CheeseBots.GROUPS[0].bots.forEach(function (b) {
      var btn = document.createElement('button');
      btn.className = 'gs-bot' + (b === App.selectedBot ? ' selected' : '');
      btn.innerHTML = '<span class="gs-ava">' + b.avatar + '</span><span class="gs-rate">' + b.rating + '</span>';
      btn.onclick = function () { App.selectedBot = b; App.renderBotCard(); };
      strip.appendChild(btn);
    });
  };

  App.renderBotsList = function () {
    var list = $('#bots-list');
    list.innerHTML = '';
    CheeseBots.GROUPS.forEach(function (g) {
      if (g.featured) return;
      var row = document.createElement('button');
      row.className = 'cat-row' + (App.openCats[g.id] ? ' open' : '');
      row.innerHTML =
        '<span class="cat-ava">' + g.bots[0].avatar + '</span>' +
        '<span class="cat-name">' + escapeHtml(g.title) + '</span>' +
        '<span class="cat-count">' + g.bots.length + ' bots</span>' +
        '<svg class="cat-chev" viewBox="0 0 24 24"><path d="M7.4 8.6L12 13.2l4.6-4.6L18 10l-6 6-6-6z" fill="currentColor"/></svg>';
      var sub = document.createElement('div');
      sub.className = 'cat-bots' + (App.openCats[g.id] ? ' open' : '');
      g.bots.forEach(function (b) {
        var br = document.createElement('button');
        br.className = 'bot-row' + (b === App.selectedBot ? ' selected' : '');
        br.dataset.botid = b.id;
        br.innerHTML =
          '<span class="br-ava">' + b.avatar + '</span>' +
          '<span class="br-name">' + escapeHtml(b.name) + '</span>' +
          '<span class="br-rating">' + b.rating + '</span>' +
          '<span class="br-flag">' + CheeseBots.flagSVG(b.flag, 16) + '</span>';
        br.onclick = function () { App.selectedBot = b; App.renderBotCard(); };
        sub.appendChild(br);
      });
      row.onclick = function () {
        App.openCats[g.id] = !App.openCats[g.id];
        row.classList.toggle('open', App.openCats[g.id]);
        sub.classList.toggle('open', App.openCats[g.id]);
      };
      list.appendChild(row);
      list.appendChild(sub);
    });
  };

  App.renderListSelection = function () {
    document.querySelectorAll('.bot-row').forEach(function (el) {
      el.classList.toggle('selected', el.dataset.botid === App.selectedBot.id);
    });
  };
})();
