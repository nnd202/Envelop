// Bascule de mois : bilan, contrôle avec le stock réel, report des récurrentes.
// L'écart entre stock calculé et stock réel est inscrit dans le Surplus (« Écart constaté »).
import * as C from './calc.js';

const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function memeJour(date, mois) {
  const jour = Number((date || '').slice(8, 10)) || 1;
  const [a, n] = mois.split('-').map(Number);
  const dernier = new Date(a, n, 0).getDate();
  return `${mois}-${String(Math.min(jour, dernier)).padStart(2, '0')}`;
}

function dernierJour(mois) {
  const [a, n] = mois.split('-').map(Number);
  return `${mois}-${String(new Date(a, n, 0).getDate()).padStart(2, '0')}`;
}

// Ce que la bascule va faire, pour l'afficher avant validation.
export function preparer(base) {
  const m = base.mois[base.mois.length - 1];
  const r = C.calculMois(base, m);
  const suivant = C.moisSuivant(m);
  const actives = new Set(C.enveloppesDuMois(base, suivant).map((e) => e.id));
  const recurrentes = base.operations.filter((o) => o.mois === m && o.recurrente && !C.estTransfert(o)
    && (o.cible === 'charge' || o.cible === 'revenu' || actives.has(o.cible)));
  return { mois: m, suivant, resultat: r.resultat, stockDebut: r.stockDebut, stockCalcule: r.stock, recurrentes };
}

// stockReel : ce qui est sur les comptes (centimes), ou null si l'utilisateur ne vérifie pas ce mois-ci.
// differe : débit différé déjà saisi dans le mois mais pas encore prélevé par la banque ;
// il est retiré du solde bancaire avant la comparaison, pour éviter un faux écart chaque mois.
export function appliquer(base, { stockReel = null, differe = 0 } = {}) {
  const p = preparer(base);
  const marque = { bascule: p.suivant };
  if (stockReel != null) {
    const ecart = stockReel - differe - p.stockCalcule;
    base.controles = base.controles || {};
    base.controles[p.mois] = { reel: stockReel, differe, calcule: p.stockCalcule, ecart };
    const surplus = C.surplusDe(base);
    if (ecart && surplus) {
      base.operations.push({
        id: uid(), mois: p.mois, cible: surplus.id, date: dernierJour(p.mois), libelle: 'Écart constaté',
        montant: ecart, ecart: true, pause: false, recurrente: false, ...marque,
      });
    }
  }
  base.mois.push(p.suivant);
  for (const o of p.recurrentes) {
    base.operations.push({ ...o, id: uid(), mois: p.suivant, date: memeJour(o.date, p.suivant), ...marque });
  }
  return p.suivant;
}

// Annulation possible tant que le nouveau mois ne contient que ce que la bascule y a mis.
export function annulable(base) {
  if (base.mois.length < 2) return false;
  const m = base.mois[base.mois.length - 1];
  return base.operations.filter((o) => o.mois === m).every((o) => o.bascule === m)
    && !base.enveloppes.some((e) => e.creeeLe === m || e.supprimeeDepuis === m)
    && !base.plafonds.some((p) => p.depuis === m);
}

export function annuler(base) {
  if (!annulable(base)) throw new Error('Bascule non annulable');
  const m = base.mois.pop();
  const prec = base.mois[base.mois.length - 1];
  base.operations = base.operations.filter((o) => o.mois !== m && o.bascule !== m);
  if (base.controles) delete base.controles[prec];
}
