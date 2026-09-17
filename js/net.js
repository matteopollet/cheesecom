/* ============================================================
   cheesecom — jeu en ligne 1v1 : transport P2P (WebRTC)
   La signalisation passe par des relais Nostr publics via
   Trystero — aucun serveur à héberger, compatible GitHub Pages.
   ============================================================ */
import { joinRoom, selfId } from '../vendor/trystero.js';

(function () {
  'use strict';

  var room = null;
  var senders = {};
  /* types de messages : mv=coup, hi=pseudo, st=début, ct=contrôle */
  var TYPES = ['mv', 'hi', 'st', 'ct'];

  App.Net = {
    /* ouvre une room ; handlers = { join(peerId), leave(peerId), msg(type,data,peerId) } */
    open: function (code, handlers) {
      App.Net.leave();
      room = joinRoom({ appId: 'cheesecom-1v1-v1' }, code);
      TYPES.forEach(function (t) {
        var pair = room.makeAction(t);
        senders[t] = pair[0];
        pair[1](function (data, peerId) {
          if (handlers.msg) handlers.msg(t, data, peerId);
        });
      });
      room.onPeerJoin(function (p) { if (handlers.join) handlers.join(p); });
      room.onPeerLeave(function (p) { if (handlers.leave) handlers.leave(p); });
    },
    send: function (t, d) { if (senders[t]) senders[t](d); },
    leave: function () {
      if (room) { try { room.leave(); } catch (e) { /* noop */ } }
      room = null; senders = {};
    },
    selfId: function () { return selfId; }
  };
})();
