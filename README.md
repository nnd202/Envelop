# Envelop

Web app personnelle de budget par enveloppes : on saisit les dépenses, l'appli fait les calculs.

**En ligne** : https://nnd202.github.io/envelop/ (installable sur téléphone depuis Chrome, fonctionne hors ligne).

## Principe

- Une **base** contient des **mois** ; chaque mois a ses **enveloppes** (Courses, Carburant…), ses **charges fixes** et ses **revenus**.
- Chaque enveloppe a un **plafond** mensuel. Le **reste** du mois = plafond − dépenses. Ce qui n'est pas dépensé s'ajoute à la **noisette** 🌰 de l'enveloppe, son épargne cumulée (qui peut être négative).
- **Marge prévue** = revenus − plafonds − charges fixes. **Marge réelle** = marge prévue − dépassement global des enveloppes.
- Une opération peut être **récurrente**, **en pause** (visible mais hors calculs) ou **épargne** (va directement dans la 🌰).
- Un plafond modifié vaut pour le mois en cours et les suivants, jamais pour le passé.

## Données

Aucune donnée n'est envoyée nulle part : tout reste dans le navigateur de l'appareil, chiffré avec le mot de passe de l'utilisateur. Les fichiers de sauvegarde sont chiffrés de la même façon. Le dépôt ne contient que le code et une base de démonstration inventée.

## Développement

JavaScript simple, sans framework ni compilation.

- `js/calc.js` : moteur de calcul (montants en centimes, tout est recalculé à partir des saisies).
- `js/store.js` : stockage local et modifications.
- `js/app.js` : interface ; `js/stats.js` : statistiques et graphiques.
- `js/bascule.js` : bascule de mois ; `js/crypto.js` : chiffrement ; `js/export.js` : CSV.
- `lecteur.html` : généré par `node tools/build-lecteur.mjs`, ouvre une sauvegarde sans l'appli.
- `node tools/check.mjs` : vérifie la liste des fichiers hors ligne (`sw.js`), que `lecteur.html` est à jour, et lance tous les tests.

## Avancement

1. ✅ Cœur : bases, enveloppes, plafonds, opérations, charges fixes, revenus, synthèse.
2. ✅ Bascule de mois : report des récurrentes, répartition obligatoire de la marge (enveloppes et Réserve), mois passés en lecture seule, historique, annulation de la dernière bascule.
3. ✅ Chiffrement par mot de passe (PBKDF2 + AES-GCM), verrouillage auto, sauvegarde chiffrée (partage ou dossier sur PC), rappel, restauration, copies automatiques, mode correction des mois passés.
4. ✅ Statistiques par base et par enveloppe, graphiques ; export lisible CSV ; lecteur de sauvegarde autonome (`lecteur.html`).
