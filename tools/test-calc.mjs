// Tests du moteur de calcul : node tools/test-calc.mjs
// Données inventées, sans rapport avec un budget réel.
import assert from 'node:assert/strict';
import * as C from '../js/calc.js';

const env = (id, nom, extra = {}) => ({ id, nom, icone: '•', ordre: 0, creeeLe: '2026-01', noisetteDepart: 0, ...extra });
const op = (mois, cible, montant, extra = {}) => ({ id: Math.random().toString(36).slice(2), mois, cible, montant, date: `${mois}-05`, libelle: '', pause: false, epargne: false, recurrente: false, ...extra });

const base = {
  mois: ['2026-01', '2026-02', '2026-03'],
  enveloppes: [
    env('a', 'Alimentation', { noisetteDepart: 10000 }),
    env('b', 'Loisirs', { ordre: 1 }),
    env('c', 'Imprévus', { ordre: 2, creeeLe: '2026-02' }),
    env('d', 'Ancienne', { ordre: 3, supprimeeDepuis: '2026-03' }),
  ],
  plafonds: [
    { enveloppeId: 'a', depuis: '2026-01', montant: 20000 },
    { enveloppeId: 'a', depuis: '2026-03', montant: 25000 },
    { enveloppeId: 'b', depuis: '2026-01', montant: 5000 },
    { enveloppeId: 'd', depuis: '2026-01', montant: 1000 },
  ],
  operations: [
    op('2026-01', 'a', -15000),
    op('2026-01', 'b', -8000), // dépassement de 30
    op('2026-02', 'a', -20000),
    op('2026-02', 'c', -4000),
    op('2026-03', 'a', -10000),
    op('2026-03', 'a', -9999, { pause: true }), // ignorée
    op('2026-03', 'b', 2000, { epargne: true }), // versement de marge
    op('2026-03', 'revenu', 100000),
    op('2026-03', 'revenu', 5000, { pause: true }),
    op('2026-03', 'charge', 60000),
    op('2026-03', 'charge', 1500, { pause: true }),
  ],
  reserve: [{ mois: '2026-02', montant: 3000 }],
};

// Plafonds datés, jamais rétroactifs
assert.equal(C.plafond(base, 'a', '2026-02'), 20000);
assert.equal(C.plafond(base, 'a', '2026-03'), 25000);
assert.equal(C.plafond(base, 'c', '2026-03'), 0);

// Enveloppes actives
assert.deepEqual(C.enveloppesDuMois(base, '2026-01').map((e) => e.id), ['a', 'b', 'd']);
assert.deepEqual(C.enveloppesDuMois(base, '2026-03').map((e) => e.id), ['a', 'b', 'c']);

const A = base.enveloppes[0];
const B = base.enveloppes[1];
const Cx = base.enveloppes[2];
// Noisettes : départ 100 ; janv +50 ; fév 0 ; mars +150
assert.equal(C.noisette(base, A, '2026-01'), 15000);
assert.equal(C.noisette(base, A, '2026-02'), 15000);
assert.equal(C.noisetteAcquise(base, A, '2026-03'), 15000);
assert.equal(C.noisette(base, A, '2026-03'), 30000);
// Loisirs : −30, +50, puis +50 et +20 d'épargne
assert.equal(C.noisette(base, B, '2026-01'), -3000);
assert.equal(C.noisette(base, B, '2026-02'), 2000);
assert.equal(C.noisette(base, B, '2026-03'), 9000);
assert.equal(C.moisNegatifs(base, B, '2026-01'), 1);
assert.equal(C.moisNegatifs(base, B, '2026-03'), 0);
// Imprévus : plafond 0, créée en février
assert.equal(C.noisette(base, Cx, '2026-02'), -4000);
assert.equal(C.noisette(base, Cx, '2026-03'), -4000);
assert.equal(C.moisNegatifs(base, Cx, '2026-03'), 2);

const m = C.calculMois(base, '2026-03');
assert.equal(m.revenus, 100000);
assert.equal(m.incompressible, 60000);
assert.equal(m.plafonds, 30000);
assert.equal(m.margePrevue, 10000);
assert.equal(m.consomme, 10000);
assert.equal(m.depassement, 0);
assert.equal(m.margeReelle, 10000);
assert.equal(m.reserve, 3000);
assert.equal(m.epargneGlobale, 30000 + 9000 - 4000 + 3000);
assert.equal(m.epargneAcquise, 15000 + 2000 - 4000 + 3000);
assert.equal(m.epargneTendance, 'hausse');
const loisirs = m.enveloppes.find((e) => e.env.id === 'b');
assert.equal(loisirs.reste, 5000); // l'épargne ne gonfle pas le reste
assert.equal(loisirs.tendance, 'hausse');

const j = C.calculMois(base, '2026-01');
assert.equal(j.depassement, 0); // 230 consommés pour 260 de plafonds
const base2 = { ...base, operations: [...base.operations, op('2026-01', 'd', -5000)] };
const j2 = C.calculMois(base2, '2026-01');
assert.equal(j2.consomme, 28000);
assert.equal(j2.depassement, 2000);
assert.equal(j2.margeReelle, j2.margePrevue - 2000);

// Saisie des montants
assert.equal(C.lireMontant('139, 56€'), 13956);
assert.equal(C.lireMontant('59,8'), 5980);
assert.equal(C.lireMontant('1 234,5'), 123450);
assert.equal(C.lireMontant('-12.5'), -1250);
assert.equal(C.lireMontant('abc'), null);
assert.equal(C.lireMontant('1,234'), null);

// Mois
assert.equal(C.moisSuivant('2026-12'), '2027-01');
assert.equal(C.moisPrecedent('2026-01'), '2025-12');

console.log('Tous les tests du moteur passent.');

// --- Bascule ---------------------------------------------------------------
const BA = await import('../js/bascule.js');
const bb = JSON.parse(JSON.stringify(base));
bb.operations.push(op('2026-03', 'a', -1500, { recurrente: true, date: '2026-03-31', libelle: 'Abonnement' }));
bb.operations.find((o) => o.cible === 'charge' && !o.pause).recurrente = true;
bb.operations.find((o) => o.cible === 'charge' && o.pause).recurrente = true;
bb.operations.find((o) => o.cible === 'revenu' && !o.pause).recurrente = true;
const prep = BA.preparer(bb);
assert.equal(prep.suivant, '2026-04');
// marge réelle de mars = 100000 - 30000 - 60000 - dépassement(0) = 10000
assert.equal(prep.marge, 10000);
assert.throws(() => BA.appliquer(bb, { reserve: 5000 }));
const avant = C.calculMois(bb, '2026-03');
BA.appliquer(bb, { repartition: { b: 4000 }, reserve: 6000 });
assert.deepEqual(bb.mois.slice(-1), ['2026-04']);
// le mois passé ne bouge pas
assert.deepEqual(C.calculMois(bb, '2026-03').margePrevue, avant.margePrevue);
const avril = C.calculMois(bb, '2026-04');
assert.equal(avril.revenus, 100000);
assert.equal(avril.incompressible, 60000); // la charge en pause est reportée mais ne compte pas
assert.equal(avril.chargesOps.length, 2);
const abo = bb.operations.find((o) => o.mois === '2026-04' && o.libelle === 'Abonnement');
assert.equal(abo.date, '2026-04-30'); // 31 → 30 en avril
const lo = avril.enveloppes.find((e) => e.env.id === 'b');
assert.equal(lo.reste, 5000); // le versement ne gonfle pas le reste
assert.equal(lo.acquise, C.noisette(bb, bb.enveloppes[1], '2026-03'));
assert.equal(lo.direct, lo.acquise + 5000 + 4000);
assert.equal(avril.reserve, 3000 + 6000);
assert.equal(BA.annulable(bb), true);
BA.annuler(bb);
assert.deepEqual(bb.mois.slice(-1), ['2026-03']);
assert.equal(bb.operations.some((o) => o.mois === '2026-04'), false);
// une saisie dans le nouveau mois empêche l'annulation
BA.appliquer(bb, { reserve: 10000 });
bb.operations.push(op('2026-04', 'a', -100));
assert.equal(BA.annulable(bb), false);
console.log('Tous les tests de bascule passent.');
