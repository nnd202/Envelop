// Vérifications avant envoi : node tools/check.mjs
// - tous les fichiers de l'appli sont dans la liste CORE du service worker
// - les tests du moteur passent
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const racine = new URL('..', import.meta.url).pathname;
const sw = readFileSync(join(racine, 'sw.js'), 'utf8');
const core = [...sw.matchAll(/'([^']+)'/g)].map((m) => m[1]);
const fichiers = [];
for (const dossier of ['css', 'js', 'icons']) {
  for (const f of readdirSync(join(racine, dossier))) if (statSync(join(racine, dossier, f)).isFile()) fichiers.push(`${dossier}/${f}`);
}
fichiers.push('index.html', 'manifest.webmanifest', 'lecteur.html');
const manquants = fichiers.filter((f) => !core.includes(f));
if (manquants.length) {
  console.error('Absents de CORE dans sw.js :', manquants.join(', '));
  process.exit(1);
}
console.log(`CORE complet (${fichiers.length} fichiers).`);
await import('./test-calc.mjs');
const { execFileSync } = await import('node:child_process');
console.log(execFileSync('node', [join(racine, 'tools/build-lecteur.mjs'), '--verifier']).toString().trim());
await import('./test-import.mjs');
