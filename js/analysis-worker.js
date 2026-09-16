/* Worker d'analyse : rejoue la partie et classe chaque coup,
   envoie la progression au fil de l'eau. */
importScripts('engine.js', 'ai.js');

self.onmessage = function (e) {
  var d = e.data;
  if (d.type !== 'analyze') return;
  try {
    var res = CheeseAI.analyzeGame(d.fen, d.moves, function (done, total) {
      self.postMessage({ type: 'progress', done: done, total: total });
    }, d.depth);
    self.postMessage({ type: 'done', results: res });
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) });
  }
};
