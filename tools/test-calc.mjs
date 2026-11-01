// Tests du moteur, de la bascule et du chiffrement : node tools/test-calc.mjs
// Données inventées, sans rapport avec un budget réel.
import assert from 'node:assert/strict';
import * as C from '../js/calc.js';
import * as BA from '../js/bascule.js';

let n = 0;
const op = (mois, cible, montant, extra = {}) => ({ id: `o${n++}`, mois, cible, montant, date: `${mois}-05`, libelle: '', pause: false, recurrente: false, ...extra });
const env = (id, extra = {}) => ({ id, nom: id, icone: '•', ordre: 0, creeeLe: '2026-01', noisetteDepart: 0, ...extra });

// Stock de départ 1 000 € : tout dans le Surplus ; 400 € virés à Voiture le 1er janvier.
const base = () => ({
  mois: ['2026-01'],
  enveloppes: [
    env('surplus', { special: 'surplus', nom: 'Surplus', ordre: 9, noisetteDepart: 100000 }),
    env('courses', { ordre: 0 }),
    env('voiture', { ordre: 1 }),
  ],
  plafonds: [
    { enveloppeId: 'courses', depuis: '2026-01', montant: 30000 },
    { enveloppeId: 'voiture', depuis: '2026-01', montant: 10000 },
  ],
  operations: [
    op('2026-01', 'revenu', 200000, { recurrente: true }),
    op('2026-01', 'charge', 150000, { recurrente: true }),
    op('2026-01', 'charge', 2000, { pause: true, recurrente: true }),
    op('2026-01', 'surplus', -40000, { virement: 'v1', vers: 'voiture', date: '2026-01-01' }),
    op('2026-01', 'voiture', 40000, { virement: 'v1', depuis: 'surplus', date: '2026-01-01' }),
    op('2026-01', 'courses', -25000, { date: '2026-01-10' }),
    op('2026-01', 'voiture', -50000, { date: '2026-01-12' }), // grosse dépense
    op('2026-01', 'surplus', -10000, { virement: 'v2', vers: 'voiture', date: '2026-01-20' }),
    op('2026-01', 'voiture', 10000, { virement: 'v2', depuis: 'surplus', date: '2026-01-20' }),
  ],
});

const b = base();
// Surplus prévu = 2 000 − 1 500 − (300 + 100) = 100
assert.equal(C.plafondSurplus(b, '2026-01'), 10000);
assert.equal(C.plafond(b, 'surplus', '2026-01'), 10000);
assert.equal(C.plafondMaximum(b, 'voiture', '2026-01'), 20000);

const r = C.calculMois(b, '2026-01');
assert.equal(r.revenus, 200000);
assert.equal(r.incompressible, 150000);
assert.equal(r.plafondsEnveloppes, 40000);
assert.equal(r.surplusPrevu, 10000);
assert.equal(r.depenses, 75000);
assert.equal(r.resultat, 200000 - 150000 - 75000); // −250
assert.equal(r.stockDebut, 100000);
assert.equal(r.stock, 100000 - 25000); // stock = départ + résultat
const v = r.enveloppes.find((e) => e.env.id === 'voiture');
assert.equal(v.reste, -40000); // dépassement : les virements ne l'effacent pas
assert.equal(v.direct, 10000); // plafond 100 − 500 de dépense + 400 + 100 de virements
// Point bas : 100 + 400 (le 1er) − 500 (le 12) = 0 : jamais sous zéro
assert.equal(v.pointBas, null);
const s = r.enveloppes.find((e) => e.env.id === 'surplus');
assert.equal(s.direct, 100000 + 10000 - 50000);
assert.equal(r.enveloppes.reduce((t, e) => t + e.direct, 0), r.stock);

// Passage sous zéro puis renfloué
const b2 = base();
b2.operations = b2.operations.filter((o) => o.virement !== 'v1');
const v2 = C.calculMois(b2, '2026-01').enveloppes.find((e) => e.env.id === 'voiture');
assert.deepEqual(v2.pointBas, { valeur: -40000, date: '2026-01-12' });
assert.equal(v2.direct, -30000); // −400 + 100 de virement

// Bascule avec contrôle : stock réel 700 € au lieu de 750 → écart −50 dans le Surplus
const prep = BA.preparer(b);
assert.equal(prep.stockCalcule, 75000);
BA.appliquer(b, { stockReel: 70000 });
assert.deepEqual(b.mois, ['2026-01', '2026-02']);
assert.deepEqual(b.controles['2026-01'], { reel: 70000, differe: 0, calcule: 75000, ecart: -5000 });
const jan = C.calculMois(b, '2026-01');
assert.equal(jan.stock, 70000);
assert.equal(jan.ecart, -5000);
assert.equal(jan.resultat, -25000); // l'écart n'est pas une dépense
const fev = C.calculMois(b, '2026-02');
assert.equal(fev.stockDebut, 70000);
assert.equal(fev.revenus, 200000);
assert.equal(fev.incompressible, 150000); // charge en pause reportée mais non comptée
assert.equal(fev.chargesOps.length, 2);
assert.equal(fev.enveloppes.find((e) => e.env.id === 'voiture').acquise, 10000);
assert.equal(BA.annulable(b), true);
BA.annuler(b);
assert.deepEqual(b.mois, ['2026-01']);
assert.equal(b.controles['2026-01'], undefined);
assert.equal(C.calculMois(b, '2026-01').stock, 75000);
// Débit différé : 750 € sur les comptes dont 50 € pas encore prélevés → 700 attendus, pas d'écart si calculé = 700
const bd = base();
const stockAttendu = BA.preparer(bd).stockCalcule;
BA.appliquer(bd, { stockReel: stockAttendu + 60000, differe: 60000 });
assert.equal(bd.controles['2026-01'].ecart, 0);
// Bascule sans vérification
BA.appliquer(b, { stockReel: null });
assert.equal(C.calculMois(b, '2026-02').stockDebut, 75000);
b.operations.push(op('2026-02', 'courses', -100));
assert.equal(BA.annulable(b), false);

// Plafonds datés, jamais rétroactifs
b.plafonds.push({ enveloppeId: 'courses', depuis: '2026-02', montant: 35000 });
assert.equal(C.plafond(b, 'courses', '2026-01'), 30000);
assert.equal(C.plafond(b, 'courses', '2026-02'), 35000);
assert.equal(C.plafondSurplus(b, '2026-02'), 5000);

// Saisie et affichage des montants
assert.equal(C.lireMontant('139, 56€'), 13956);
assert.equal(C.lireMontant('59,8'), 5980);
assert.equal(C.lireMontant('-12.5'), -1250);
assert.equal(C.lireMontant('1,234'), null);
assert.equal(C.formatMontant(-1250), '− 12,50 €');
assert.equal(C.formatMontant(1250, { signe: true }), '+ 12,50 €');
assert.equal(C.moisSuivant('2026-12'), '2027-01');
console.log('Tous les tests du moteur et de la bascule passent.');

// --- Chiffrement ---------------------------------------------------------------
const K = await import('../js/crypto.js');
const sel = K.nouveauSel();
const k1 = await K.deriverCle('un mot de passe', sel, 1000);
const k2 = await K.deriverCle('autre chose', sel, 1000);
const paquet = await K.chiffrer(k1, { bases: [{ nom: 'Test €🌰' }] });
assert.deepEqual(await K.dechiffrer(k1, paquet), { bases: [{ nom: 'Test €🌰' }] });
await assert.rejects(() => K.dechiffrer(k2, paquet));
console.log('Tous les tests de chiffrement passent.');
