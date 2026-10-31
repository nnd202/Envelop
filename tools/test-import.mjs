// Tests de l'import To Do : node tools/test-import.mjs (données inventées)
import assert from 'node:assert/strict';
import * as I from '../js/importtodo.js';
import * as C from '../js/calc.js';

const t = (title, etapes) => ({ title, checklistItems: etapes?.map((displayName) => ({ displayName })) });
const json = (moisNoisettes) => ({ value: [
  t('🛒 Alimentation▪️60,00 🌰 ' + moisNoisettes.a, ['Lundi 2▪️25,50€', 'Samedi 7▪️14, 50€']),
  t('🎁 Cadeaux x12▪️30 🌰 -45,10', []),
  t('🏠 Maison▪️-20,00 🌰 300,00', ['Mardi 10▪️120,00€']),
  t('🌠 Imprévus▪️-8,00', ['Jeudi 12▪️8,00€', 'Vendredi 13▪️99,00€ 🚫']),
  t('⬇️⬇️⬇️⬇️', null),
  t('🧮 Totaux (330) 🌰 999', ['Alimentation 💶 100', 'Cadeaux 💶 30', 'Travaux 💶 100']),
  t('🔒 Incompressible▪️500,50', ['Loyer 💶 450', 'Assurance 💶 50,5', 'Musique 💶 9,99 🚫']),
  t('💰 Marge 🌰 69,50€', ['➖️ le total : 330€', '1️⃣2️⃣0️⃣0️⃣', 'Reste : 69,50€']),
] });

assert.equal(I.moisDepuisNom('20261031 - Export To Do - Février 2026.json'), '2026-02');
assert.equal(I.moisDepuisNom('sans mois.json'), null);
assert.equal(I.montant('139, 56€'), 13956);
assert.equal(I.montant('-71,00'), -7100);

// février 2026 : le 2 est un lundi, le 7 un samedi, le 10 un mardi, le 12 un jeudi, le 13 un vendredi
const a = I.analyser(json({ a: '150,00' }), '2026-02');
assert.equal(a.enveloppes.length, 4);
const [alim, cad, maison, imp] = a.enveloppes;
assert.equal(alim.icone, '🛒');
assert.equal(alim.plafond, 10000); // 60 + 25,50 + 14,50
assert.equal(cad.nom, 'Cadeaux');
assert.equal(cad.noisetteLue, -4510);
assert.equal(maison.plafond, 10000); // -20 + 120 → « Travaux » dans Totaux
assert.equal(imp.noisetteLue, null);
assert.equal(imp.plafond, 0); // l'étape en pause ne compte pas
assert.equal(imp.ops[1].pause, true);
assert.equal(a.revenus, 120000);
assert.equal(a.charges.length, 3);
assert.equal(a.charges[2].pause, true);
assert.equal(a.ignores.length, 1);
assert.ok(a.avertissements.some((w) => w.includes('Travaux') && w.includes('Maison')));
assert.equal(a.avertissements.filter((w) => w.includes('ne tombe pas')).length, 0);

const b = I.construireBase(a, { nom: 'Test', icone: '🧪' });
const r = C.calculMois(b, '2026-02');
assert.equal(r.revenus, 120000);
assert.equal(r.incompressible, 50050);
assert.equal(r.plafonds, 23000);
assert.equal(r.margePrevue, 120000 - 23000 - 50050);
const ra = r.enveloppes.find((e) => e.env.nom === 'Alimentation');
assert.equal(ra.reste, 6000);
assert.equal(ra.acquise, 15000); // noisette lue = point de départ
assert.equal(r.enveloppes.find((e) => e.env.nom === 'Maison').reste, -2000);

// Mois plus ancien : historique seulement, février ne bouge pas.
const avant = JSON.stringify(C.calculMois(b, '2026-02').enveloppes.map((e) => [e.env.nom, e.acquise, e.direct]));
const ja = I.analyser({ value: [
  t('🛒 Alimentation▪️10,00 🌰 90,00', ['Jeudi 15▪️90,00€']),
  t('🚲 Vélo▪️5,00 🌰 12,00', []),
] }, '2026-01');
const corr = I.proposerCorrespondances(b, ja);
assert.equal(corr[1], 'nouvelle');
I.ajouterMoisAncien(b, ja, corr);
assert.deepEqual(b.mois, ['2026-01', '2026-02']);
assert.equal(JSON.stringify(C.calculMois(b, '2026-02').enveloppes.map((e) => [e.env.nom, e.acquise, e.direct])), avant);
const j = C.calculMois(b, '2026-01');
assert.deepEqual(j.enveloppes.map((e) => e.env.nom), ['Alimentation', 'Vélo']);
assert.equal(j.enveloppes[0].direct, 9000 + 1000);
assert.throws(() => I.ajouterMoisAncien(b, I.analyser({ value: [] }, '2025-06'), []));

// Jour qui ne colle pas
const w = I.analyser({ value: [t('🛒 X▪️0 🌰 0', ['Mardi 7▪️1,00€'])] }, '2026-10');
assert.ok(w.avertissements[0].includes('mercredi'));

console.log('Tous les tests d\'import passent.');
