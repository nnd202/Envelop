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
  const lignes = [ligne(['Base', 'Mois', 'Type', 'Enveloppe', 'Date', 'Libellé', 'Montant', 'En pause', 'Épargne', 'Récurrente'])];
  for (const b of etat.bases) {
    const noms = new Map(b.enveloppes.map((e) => [e.id, `${e.icone} ${e.nom}`]));
    const ops = [...b.operations].sort((x, y) => (x.mois + (x.date || '')).localeCompare(y.mois + (y.date || '')));
    for (const o of ops) {
      const type = o.cible === 'charge' ? 'Charge fixe' : o.cible === 'revenu' ? 'Revenu' : 'Enveloppe';
      lignes.push(ligne([b.nom, o.mois, type, noms.get(o.cible) || '', o.date || '', o.libelle || '', montant(o.montant), oui(o.pause), oui(o.epargne), oui(o.recurrente)]));
    }
    for (const r of b.reserve || []) {
      lignes.push(ligne([b.nom, r.mois, 'Réserve', '', `${r.mois}-01`, `Marge ${r.origine || ''}`.trim(), montant(r.montant), '', 'oui', '']));
    }
  }
  return BOM + lignes.join('\r\n');
}

export function csvSynthese(etat) {
  const lignes = [ligne(['Base', 'Mois', 'Enveloppe', 'Plafond', 'Dépensé', 'Reste', 'Noisette fin du mois précédent', 'Noisette fin du mois'])];
  for (const b of etat.bases) {
    for (const m of b.mois) {
      const r = C.calculMois(b, m);
      for (const e of r.enveloppes) {
        lignes.push(ligne([b.nom, m, `${e.env.icone} ${e.env.nom}`, montant(e.plafond), montant(e.consomme), montant(e.reste), montant(e.acquise), montant(e.direct)]));
      }
      lignes.push(ligne([b.nom, m, 'Revenus', '', '', montant(r.revenus), '', '']));
      lignes.push(ligne([b.nom, m, 'Incompressible', '', montant(r.incompressible), '', '', '']));
      lignes.push(ligne([b.nom, m, 'Marge prévue', '', '', montant(r.margePrevue), '', '']));
      lignes.push(ligne([b.nom, m, 'Marge réelle', '', '', montant(r.margeReelle), '', '']));
      lignes.push(ligne([b.nom, m, 'Réserve', '', '', '', '', montant(r.reserve)]));
      lignes.push(ligne([b.nom, m, 'Épargne globale', '', '', '', montant(r.epargneAcquise), montant(r.epargneGlobale)]));
    }
  }
  return BOM + lignes.join('\r\n');
}
