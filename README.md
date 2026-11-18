# Envelop

Web app personnelle de budget par enveloppes : on saisit les dépenses, l'appli fait les calculs.

**En ligne** : https://nnd202.github.io/envelop/ (installable sur téléphone depuis Chrome, fonctionne hors ligne).

## Principe

- Une **base** démarre avec un **stock** : tout l'argent disponible, tous comptes confondus.
- Chaque mois a ses **revenus**, ses **charges fixes** (incompressibles) et ses **enveloppes** (Courses, Voiture…), chacune avec un **plafond**.
- L'enveloppe automatique **Surplus** reçoit ce qui n'est pas réparti : son plafond = revenus − incompressibles − autres plafonds. Les plafonds ne peuvent pas dépasser les revenus.
- Chaque enveloppe garde sa **noisette** 🌰 (son argent mis de côté, positif ou négatif). **Stock = somme des 🌰 de toutes les enveloppes.**
- Opérations : **dépense** ou **entrée** (touchent le reste du mois), **virement** entre enveloppes (déplace de la 🌰, le stock ne change pas). Une enveloppe passée sous zéro dans le mois le signale.
- **Bascule de mois** : bilan, puis « combien as-tu réellement ? » ; l'écart éventuel avec le stock calculé est inscrit dans le Surplus et suivi dans les statistiques.

## Données

Aucune donnée n'est envoyée nulle part : tout reste dans le navigateur de l'appareil, chiffré avec le mot de passe de l'utilisateur (ou débloqué par un code à 6 chiffres). L'export, lui, est un fichier lisible et non chiffré : à ranger dans un stockage protégé (par exemple Proton Drive, chiffré de bout en bout). Le dépôt ne contient que le code et une base de démonstration inventée.

## Développement

JavaScript simple, sans framework ni compilation.

- `js/calc.js` : moteur de calcul (montants en centimes, tout est recalculé à partir des saisies).
- `js/store.js` : stockage local et modifications.
- `js/app.js` : interface ; `js/stats.js` : statistiques et graphiques.
- `js/bascule.js` : bascule de mois ; `js/crypto.js` : chiffrement.
- `node tools/check.mjs` : vérifie la liste des fichiers hors ligne (`sw.js`) et lance tous les tests.

## Avancement

1. ✅ Cœur : stock de départ, enveloppes et Surplus automatique, plafonds bloqués par les revenus, dépenses, entrées et virements, synthèse prévisionnel / réel / stock.
2. ✅ Bascule de mois : contrôle du stock réel, écart inscrit dans le Surplus, report des récurrentes, mois passés en lecture seule, historique, annulation de la dernière bascule.
3. ✅ Chiffrement par mot de passe (PBKDF2 + AES-GCM), verrouillage auto, code à 6 chiffres, rappel d'export, restauration, copies automatiques, mode correction des mois passés.
4. ✅ Statistiques par base et par enveloppe, graphiques.
5. ✅ Un seul export : toutes les données dans un fichier JSON lisible (`AAAAMMJJ - Export Envelop.txt`), proposé après chaque bascule de mois et disponible à tout moment.
