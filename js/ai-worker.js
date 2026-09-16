/* Worker IA : tourne la recherche hors du thread UI */
importScripts('engine.js', 'ai.js');

self.onmessage = function (e) {
  var d = e.data;
  try {
    var game = new Chess(d.fen);
    var mv = CheeseAI.pickMove(game, { rating: d.rating, aggression: d.aggression });
    self.postMessage({ id: d.id, move: mv });
  } catch (err) {
    self.postMessage({ id: d.id, move: null, error: String(err) });
  }
};
