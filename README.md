# Cheese.com

Clone local de l'interface chess.com — jouez aux échecs contre des robots de différents niveaux.

> Projet personnel à but pédagogique. Non affilié à, ni approuvé par, Chess.com.
> « Chess.com » et son interface appartiennent à leurs détenteurs respectifs.

## Lancer

```bash
npm start          # → http://localhost:8377
# ou
python3 -m http.server 8377
```

Puis ouvrez http://localhost:8377 dans le navigateur. Aucune dépendance, aucun build.

## Tests

```bash
npm test           # perft + SAN + fins de partie + IA (node test/perft.js)
```

## Structure

```
index.html        interface (sidebar, échiquier, panneaux)
css/style.css     thème sombre façon chess.com
js/engine.js      moteur d'échecs (coups légaux, FEN, SAN, fins de partie)
js/ai.js          IA : alpha-beta + quiescence + tables positionnelles
js/ai-worker.js   worker (recherche hors thread UI)
js/bots.js        roster de 60 bots + avatars SVG + drapeaux + répliques
js/app-state.js   état partagé (window.App) + constantes
js/sound.js       effets sonores WebAudio
js/board.js       échiquier : rendu, surbrillances, interactions
js/panel.js       cartes joueurs, coups, horloges, chat, sélection des bots
js/game.js        flux de partie : coups, tour du bot, fins de partie
js/app.js         initialisation + bindings
assets/pieces/    pièces SVG Cburnett (voir assets/pieces/README.md)
test/perft.js     tests du moteur
server.js         serveur statique minimal (npm start)
```

## Fonctionnalités

- **Moteur complet** : roque, en passant, promotion, échec/mat/pat, triple répétition, règle des 50 coups, matériel insuffisant. Validé par perft (197 281 nœuds à profondeur 4 depuis la position initiale, 97 862 sur Kiwipete).
- **60 bots** en 4 catégories (Néophyte 5–400 → Avancé 1600–2500) + groupe « école » mis en avant. Profondeur de recherche, bruit d'évaluation, taux d'erreur et variété calibrés par rating. Avatars SVG générés procéduralement, répliques contextuelles dans le chat.
- **Interactions** : glisser-déposer, clic-clic, surbrillance des coups légaux / dernier coup / échec, flèches et marques au clic droit, sélecteur de promotion, bouton indice (flèche verte), abandon, offre de nulle (le bot accepte ou refuse selon la position), revanche.
- **Fonctions avancées** :
  - **Premove** : jouez pendant le tour du bot — le coup s'exécute automatiquement s'il est légal (surbrillance orange).
  - **Retour en arrière** : annule votre dernier coup et la réponse du bot.
  - **Navigation** : cliquez un coup de la liste ou utilisez ← → Home End pour revoir la partie.
  - **Barre d'évaluation** : jauge blancs/noirs en temps réel (masquable).
  - **Export PGN** : copie la partie complète dans le presse-papiers.
  - **Confirmation de coup** (option), **promotion automatique en Dame** (option).
- **Personnalisation** : 4 thèmes d'échiquier, toggles coups légaux / coordonnées / animations — préférences persistées.
- **Options** : couleur (blancs / aléatoire / noirs — l'échiquier se retourne et le bot ouvre), cadence (amicale, 5 min, 10 min avec horloges réelles et défaite au temps).
- **Récompenses** persistantes (localStorage), mode debug via `?debug` dans l'URL.

## Licence

GPL-3.0 — voir [LICENSE](LICENSE).

Les pièces Cburnett (`assets/pieces/`) sont de Colin M.L. Burnett, sous
GPLv2+ / BSD / GFDL (via Wikimedia Commons / lichess). Voir
[assets/pieces/README.md](assets/pieces/README.md).
