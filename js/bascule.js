// Bascule de mois : création du mois suivant, report des récurrentes,
// répartition obligatoire de la marge du mois qui s'achève.
import * as C from './calc.js';

const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function memeJour(date, mois) {
  const jour = Number((date || '').slice(8, 10)) || 1;
  const [a, n] = mois.split('-').map(Number);
  const dernier = new Date(a, n, 0).getDate();
  return `${mois}-${String(Math.min(jour, dernier)).padStart(2, '0')}`;
}

function nomMois(m) {
  const [a, n] = m.split('-').map(Number);
  return new Date(a, n - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

// Ce que la bascule va faire, pour l'afficher avant validation.
export function preparer(base) {
  const m = base.mois[base.mois.length - 1];
  const r = C.calculMois(base, m);
  const suivant = C.moisSuivant(m);
  const actives = new Set(C.enveloppesDuMois(base, suivant).map((e) => e.id));
  const recurrentes = base.operations.filter((o) => o.mois === m && o.recurrente
    && (o.cible === 'charge' || o.cible === 'revenu' || actives.has(o.cible)));
  return { mois: m, suivant, marge: Math.max(0, r.margeReelle), margeReelle: r.margeReelle, recurrentes, enveloppes: r.enveloppes.map((e) => e.env) };
}

// repartition : { [enveloppeId]: centimes }, reserve : centimes.
// La somme doit être égale à la marge (positive) du mois qui s'achève.
export function appliquer(base, { repartition = {}, reserve = 0 }) {
  const p = preparer(base);
  const total = Object.values(repartition).reduce((t, v) => t + v, 0) + reserve;
  if (total !== p.marge) throw new Error(`Répartition incomplète : ${total} sur ${p.marge}`);
  if (Object.values(repartition).some((v) => v < 0) || reserve < 0) throw new Error('Montant négatif');

  const marque = { bascule: p.suivant };
  base.mois.push(p.suivant);
  for (const o of p.recurrentes) {
    base.operations.push({ ...o, id: uid(), mois: p.suivant, date: memeJour(o.date, p.suivant), ...marque });
  }
  const libelle = `Marge ${nomMois(p.mois)}`;
  for (const [envId, montant] of Object.entries(repartition)) {
    if (!montant) continue;
    base.operations.push({
      id: uid(), mois: p.suivant, cible: envId, date: `${p.suivant}-01`, libelle, montant,
      epargne: true, pause: false, recurrente: false, marge: p.mois, ...marque,
    });
  }
  if (reserve) {
    base.reserve = base.reserve || [];
    base.reserve.push({ mois: p.suivant, montant: reserve, origine: p.mois, ...marque });
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
  base.operations = base.operations.filter((o) => o.mois !== m);
  base.reserve = (base.reserve || []).filter((r) => r.mois !== m);
}
