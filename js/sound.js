/* ============================================================
   cheesecom — effets sonores synthétisés (WebAudio)
   ============================================================ */
(function () {
  'use strict';

  App.Sound = {
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
})();
