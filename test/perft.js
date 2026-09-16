/* ============================================================
   Tests du moteur — node test/perft.js  (ou `npm test`)
   Vérifie perft sur positions de référence + SAN + états de fin.
   Valeurs de référence : chessprogramming.org Perft Results.
   ============================================================ */
'use strict';
const Chess = require('../js/engine.js');
const AI = require('../js/ai.js');

let pass = 0, fail = 0;
function eq(name, got, want) {
  if (got === want) { pass++; console.log('  ok  ' + name + ' = ' + got); }
  else { fail++; console.log('  FAIL ' + name + ' : got ' + got + ', want ' + want); }
}

console.log('== perft startpos ==');
let c = new Chess();
eq('depth 1', c.perft(1), 20);
eq('depth 2', c.perft(2), 400);
eq('depth 3', c.perft(3), 8902);
eq('depth 4', c.perft(4), 197281);

console.log('== perft kiwipete (roques, ep, clouages) ==');
c = new Chess('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
eq('depth 1', c.perft(1), 48);
eq('depth 2', c.perft(2), 2039);
eq('depth 3', c.perft(3), 97862);

console.log('== perft ep cloué ==');
c = new Chess('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
eq('depth 3', c.perft(3), 2812);

console.log('== perft promotions ==');
c = new Chess('n1n5/PPPk4/8/8/8/8/4Kppp/5N1N w - - 0 1');
eq('depth 3', c.perft(3), 9483);

console.log('== SAN / fins de partie ==');
c = new Chess();
c.move({ from: 'f2', to: 'f3' });
c.move({ from: 'e7', to: 'e5' });
c.move({ from: 'g2', to: 'g4' });
eq('fool mate san', c.move({ from: 'd8', to: 'h4' }).san, 'Qh4#');
eq('checkmate', c.isCheckmate(), true);
eq('gameover', c.isGameOver(), true);

c = new Chess('k7/8/1Q6/8/8/8/8/K7 b - - 0 1');
eq('stalemate', c.isStalemate(), true);

c = new Chess('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
eq('roque petit', c.move({ from: 'e1', to: 'g1' }).san, 'O-O');
eq('roque grand', c.move({ from: 'e8', to: 'c8' }).san, 'O-O-O');

c = new Chess();
c.move({ from: 'e2', to: 'e4' });
c.undo();
eq('undo fen', c.fen(), Chess.START_FEN);

c = new Chess('8/8/8/8/8/8/8/K6k w - - 0 1');
eq('matériel insuffisant', c.isInsufficientMaterial(), true);

console.log('== IA ==');
c = new Chess();
const mv = AI.pickMove(c, { rating: 1500 });
eq('coup IA retourné', !!(mv && mv.from && mv.to), true);
// mat en 1 trouvé par l'IA forte
c = new Chess('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
const mate = AI.pickMove(c, { rating: 2200 });
eq('IA trouve le mat (a1a8)', mate.from + mate.to, 'a1a8');

console.log('\n' + pass + ' passés, ' + fail + ' échoués');
process.exit(fail ? 1 : 0);
