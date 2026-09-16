/* Worker IA : tourne la recherche hors du thread UI */
importScripts('engine.js', 'ai.js');

self.onmessage = function (e) {
  var d = e.data;
  try {
    var game = new Chess(d.fen);
    if (d.type === 'explore') {
      /* classe le coup joué + meilleure réponse (variante du bilan) */
      self.postMessage({ id: d.id, result: CheeseAI.analyzeMove(game, d.move, d.depth) });
      return;
    }
    if (d.type === 'best') {
      self.postMessage({ id: d.id, result: CheeseAI.bestMove(game, d.depth) });
      return;
    }
    var mv = CheeseAI.pickMove(game, { rating: d.rating, aggression: d.aggression });
    self.postMessage({ id: d.id, move: mv });
  } catch (err) {
    self.postMessage({ id: d.id, move: null, result: null, error: String(err) });
  }
};
