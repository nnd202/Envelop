// Export lisible (non chiffré) : deux fichiers CSV pour tableur.
// Point-virgule et virgule décimale (Excel en français), encodage UTF-8 avec BOM.
import * as C from './calc.js';

const BOM = '﻿';

function cellule(v) {
  if (v == null) return '';
  const t = String(v);
  return /[;"\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

const ligne = (vals) => vals.map(cellule).join(';');
const montant = (c) => (c / 100).toFixed(2).replace('.', ',');
const oui = (b) => (b ? 'oui' : '');

export function csvOperations(etat) {
  const lignes = [ligne(['Base', 'Mois', 'Type', 'Enveloppe', 'Autre enveloppe', 'Date', 'Libellé', 'Montant', 'En pause', 'Récurrente'])];
  for (const b of etat.bases) {
    const noms = new Map(b.enveloppes.map((e) => [e.id, `${e.icone} ${e.nom}`]));
    const ops = [...b.operations].sort((x, y) => (x.mois + (x.date || '')).localeCompare(y.mois + (y.date || '')));
    for (const o of ops) {
      let type = o.montant < 0 ? 'Dépense' : 'Entrée';
      if (o.cible === 'charge') type = 'Charge fixe';
      else if (o.cible === 'revenu') type = 'Revenu';
      else if (o.virement || o.epargne) type = 'Virement';
      else if (o.ecart) type = 'Écart constaté';
      else if (o.reprise) type = 'Reprise';
      const autre = o.virement ? noms.get(o.montant < 0 ? o.vers : o.depuis) || '' : '';
      lignes.push(ligne([b.nom, o.mois, type, noms.get(o.cible) || '', autre, o.date || '', o.libelle || '', montant(o.montant), oui(o.pause), oui(o.recurrente)]));
    }
  }
  return BOM + lignes.join('\r\n');
}

export function csvSynthese(etat) {
  const lignes = [ligne(['Base', 'Mois', 'Ligne', 'Plafond', 'Dépensé', 'Reste', 'Noisette début du mois', 'Noisette fin du mois', 'Passée sous zéro'])];
  for (const b of etat.bases) {
    for (const m of b.mois) {
      const r = C.calculMois(b, m);
      for (const e of r.enveloppes) {
        lignes.push(ligne([b.nom, m, `${e.env.icone} ${e.env.nom}`, montant(e.plafond), montant(e.consomme), montant(e.reste), montant(e.acquise), montant(e.direct), e.pointBas ? `${e.pointBas.date} (${montant(e.pointBas.valeur)})` : '']));
      }
      const l = (nom, v) => lignes.push(ligne([b.nom, m, nom, '', '', montant(v), '', '', '']));
      l('Revenus', r.revenus);
      l('Incompressibles', r.incompressible);
      l('Plafonds des enveloppes', r.plafondsEnveloppes);
      l('Surplus prévu', r.surplusPrevu);
      l('Dépenses', r.depenses);
      l('Résultat', r.resultat);
      l('Stock début du mois', r.stockDebut);
      l('Écart constaté', r.ecart);
      l('Stock fin du mois', r.stock);
      if (r.controle) l('Stock réel déclaré', r.controle.reel);
    }
  }
  return BOM + lignes.join('\r\n');
}
