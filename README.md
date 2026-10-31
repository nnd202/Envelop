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

Aucune donnée n'est envoyée nulle part : tout reste dans le navigateur de l'appareil. Le dépôt ne contient que le code et une base de démonstration inventée.

## Développement

JavaScript simple, sans framework ni compilation.

- `js/calc.js` : moteur de calcul (montants en centimes, tout est recalculé à partir des saisies).
- `js/store.js` : stockage local et modifications.
- `js/app.js` : interface.
- `node tools/check.mjs` : vérifie la liste des fichiers hors ligne (`sw.js`) et lance les tests du moteur.

## Avancement

1. ✅ Cœur : bases, enveloppes, plafonds, opérations, charges fixes, revenus, synthèse.
2. Bascule de mois et répartition de la marge.
3. Chiffrement par mot de passe, sauvegarde et import.
4. Reprise d'un historique Microsoft To Do.
5. Statistiques et graphiques.
