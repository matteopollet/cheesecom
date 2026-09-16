# Cheese.com

Clone local de l'interface chess.com — jouez aux échecs contre des robots de différents niveaux.

## Lancer

```bash
npm start          # → http://localhost:8377
# ou
python3 -m http.server 8377
```

Puis ouvrez http://localhost:8377 dans le navigateur.

## Contenu

- **Interface** fidèle à chess.com : sidebar, échiquier (thème icy sea), panneau de sélection des bots, chat, liste des coups, horloges.
- **Moteur d'échecs complet** (`js/engine.js`) : coups légaux, roque, en passant, promotion, échec/mat/pat, triple répétition, règle des 50 coups, matériel insuffisant. Validé par perft (197 281 nœuds à profondeur 4, Kiwipete 97 862).
- **IA** (`js/ai.js`) : alpha-beta + quiescence + tables positionnelles. 60 bots répartis en catégories (Néophyte → Avancé, ratings 5 → 2500) avec profondeur de recherche, bruit et taux d'erreur calibrés par niveau.
- **Interactions** : glisser-déposer, clic-clic, surbrillance des coups légaux, flèches et marques au clic droit, sélecteur de promotion, indice, abandon, offre de nulle (le bot accepte ou refuse selon la position), revanche.
- **Options** : couleur (blancs/aléatoire/noirs), cadence (amicale, 5 min, 10 min).
