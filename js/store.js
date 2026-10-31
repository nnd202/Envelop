// Stockage d'Envelop : uniquement dans le navigateur de l'appareil.
// Étape 1 : stockage local en clair. Le chiffrement par mot de passe arrive à l'étape 3.
import { moisDe } from './calc.js';

const CLE = 'envelop:v1';

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let etat = charger();

function charger() {
  try {
    const brut = localStorage.getItem(CLE);
    if (brut) return JSON.parse(brut);
  } catch { /* stockage illisible : on repart à vide */ }
  return { version: 1, bases: [] };
}

function sauver() {
  localStorage.setItem(CLE, JSON.stringify(etat));
}

export const bases = () => etat.bases;
export const base = (id) => etat.bases.find((b) => b.id === id);
export const moisCourant = (b) => b.mois[b.mois.length - 1];

// Toute modification passe par ici, puis est enregistrée.
export function modifier(fn) {
  fn(etat);
  sauver();
}

// --- Bases ---------------------------------------------------------------------

export function creerBase({ nom, icone, mois }) {
  const b = { id: uid(), nom, icone: icone || '💶', mois: [mois || moisDe(new Date())], enveloppes: [], plafonds: [], operations: [], reserve: [], notes: [] };
  modifier((e) => e.bases.push(b));
  return b;
}

export function supprimerBase(id) {
  modifier((e) => { e.bases = e.bases.filter((b) => b.id !== id); });
}

// --- Enveloppes ----------------------------------------------------------------

export function creerEnveloppe(b, { nom, icone, plafond, noisetteDepart, flechee }) {
  const m = moisCourant(b);
  const env = { id: uid(), nom, icone: icone || '✉️', ordre: b.enveloppes.length, creeeLe: m, noisetteDepart: noisetteDepart || 0, flechee: !!flechee };
  modifier(() => {
    b.enveloppes.push(env);
    b.plafonds.push({ enveloppeId: env.id, depuis: m, montant: plafond || 0 });
  });
  return env;
}

export function modifierEnveloppe(b, envId, champs) {
  modifier(() => Object.assign(b.enveloppes.find((e) => e.id === envId), champs));
}

// Disparaît du mois en cours et des suivants ; les mois passés la gardent.
// Si elle n'a aucun passé (créée ce mois-ci), elle est effacée complètement.
export function supprimerEnveloppe(b, envId) {
  const m = moisCourant(b);
  modifier(() => {
    const env = b.enveloppes.find((e) => e.id === envId);
    b.operations = b.operations.filter((o) => !(o.cible === envId && o.mois >= m));
    if (env.creeeLe >= m) {
      b.enveloppes = b.enveloppes.filter((e) => e.id !== envId);
      b.plafonds = b.plafonds.filter((p) => p.enveloppeId !== envId);
    } else {
      env.supprimeeDepuis = m;
      b.plafonds = b.plafonds.filter((p) => !(p.enveloppeId === envId && p.depuis >= m));
    }
  });
}

export function deplacerEnveloppe(b, envId, sens) {
  const m = moisCourant(b);
  modifier(() => {
    const actives = b.enveloppes.filter((e) => !e.supprimeeDepuis || e.supprimeeDepuis > m).sort((x, y) => x.ordre - y.ordre);
    const i = actives.findIndex((e) => e.id === envId);
    const j = i + sens;
    if (j < 0 || j >= actives.length) return;
    [actives[i], actives[j]] = [actives[j], actives[i]];
    actives.forEach((e, k) => { e.ordre = k; });
  });
}

// Le nouveau plafond vaut pour le mois en cours et les suivants, jamais avant.
export function definirPlafond(b, envId, montant) {
  const m = moisCourant(b);
  modifier(() => {
    b.plafonds = b.plafonds.filter((p) => !(p.enveloppeId === envId && p.depuis >= m));
    b.plafonds.push({ enveloppeId: envId, depuis: m, montant });
  });
}

// --- Opérations ----------------------------------------------------------------
// cible : id d'enveloppe, 'revenu' ou 'charge'.

export function enregistrerOperation(b, op) {
  modifier(() => {
    const i = b.operations.findIndex((o) => o.id === op.id);
    if (i >= 0) b.operations[i] = op;
    else b.operations.push({ ...op, id: uid() });
  });
}

export function supprimerOperation(b, opId) {
  modifier(() => { b.operations = b.operations.filter((o) => o.id !== opId); });
}

// --- Démo ----------------------------------------------------------------------
// Données inventées, pour essayer l'appli sans rien saisir.

export function creerDemo() {
  const m = moisDe(new Date());
  const b = creerBase({ nom: 'Démo', icone: '🧪', mois: m });
  const jour = (j) => `${m}-${String(j).padStart(2, '0')}`;
  const envs = [
    ['🛒', 'Courses', 25000, 18040, [[3, -4210], [9, -5675], [17, -3890]]],
    ['⛽', 'Carburant', 8000, 9520, [[12, -6150]]],
    ['🎉', 'Loisirs', 12000, 31000, [[6, -2800], [14, -9450]]],
    ['🎁', 'Cadeaux', 4000, -6500, []],
    ['🔧', 'Entretien', 3000, 21000, [[21, -11000]]],
    ['🌠', 'Imprévus', 0, 0, [[18, -2350]]],
  ];
  for (const [icone, nom, pl, depart, ops] of envs) {
    const env = creerEnveloppe(b, { nom, icone, plafond: pl, noisetteDepart: depart, flechee: nom === 'Entretien' });
    for (const [j, montant] of ops) enregistrerOperation(b, { mois: m, cible: env.id, date: jour(j), libelle: '', montant, pause: false, epargne: false, recurrente: false });
  }
  const fixes = [
    ['charge', 'Loyer', 65000], ['charge', 'Électricité', 4500], ['charge', 'Box internet', 2999],
    ['charge', 'Téléphone', 1299], ['charge', 'Streaming', 1099, true], ['revenu', 'Salaire', 190000],
  ];
  for (const [cible, libelle, montant, pause] of fixes) {
    enregistrerOperation(b, { mois: m, cible, date: jour(1), libelle, montant, pause: !!pause, epargne: false, recurrente: true });
  }
  return b;
}

// --- Bascule de mois -----------------------------------------------------------

import * as BA from './bascule.js';

export function basculer(b, repartition) {
  let suivant;
  modifier(() => { suivant = BA.appliquer(b, repartition); });
  return suivant;
}

export function annulerBascule(b) {
  modifier(() => BA.annuler(b));
}
