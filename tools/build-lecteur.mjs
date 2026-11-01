// Génère lecteur.html : une page autonome (un seul fichier, hors ligne) qui ouvre une
// sauvegarde Envelop avec son mot de passe et en sort les données en clair (CSV, JSON).
// node tools/build-lecteur.mjs [--verifier]
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const racine = new URL('..', import.meta.url).pathname;
const lire = (f) => readFileSync(join(racine, f), 'utf8')
  .replace(/^import .*$/gm, '')
  .replace(/^export (async function|function|const|class)/gm, '$1');

const script = `
${lire('js/crypto.js')}
${lire('js/calc.js')}
const C = { calculMois, formatMontant };
${lire('js/export.js')}

const $ = (s) => document.querySelector(s);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let donnees = null;

function telecharger(nom, texte, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([texte], { type }));
  a.download = nom;
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}

$('#ouvrir').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const msg = $('#message');
  msg.textContent = 'Déchiffrement…';
  try {
    const f = $('#fichier').files[0];
    if (!f) throw new Error('Choisis un fichier de sauvegarde.');
    const obj = JSON.parse(await f.text());
    if (!obj.kdf || !obj.donnees) throw new Error('Ce fichier n\\'est pas une sauvegarde Envelop.');
    const cle = await deriverCle($('#mdp').value, obj.kdf.sel, obj.kdf.iterations);
    try { donnees = await dechiffrer(cle, obj); } catch { throw new Error('Mot de passe incorrect.'); }
    msg.textContent = '';
    afficher(obj.le);
  } catch (e) { msg.textContent = e.message; }
});

function afficher(le) {
  const bases = donnees.bases.map((b) => {
    const m = b.mois[b.mois.length - 1];
    const r = calculMois(b, m);
    const lignes = r.enveloppes.map((e) => \`<tr><td>\${esc(e.env.icone)} \${esc(e.env.nom)}</td><td>\${formatMontant(e.plafond)}</td><td>\${formatMontant(e.reste)}</td><td>\${formatMontant(e.direct)}</td></tr>\`).join('');
    return \`<section><h2>\${esc(b.icone)} \${esc(b.nom)}</h2><p>\${b.mois.length} mois, de \${b.mois[0]} à \${m}. Dernier mois :</p>
      <table><tr><th>Enveloppe</th><th>Plafond</th><th>Reste</th><th>Noisette</th></tr>\${lignes}</table>
      <p>Revenus \${formatMontant(r.revenus)} · Incompressibles \${formatMontant(r.incompressible)} · Dépenses \${formatMontant(r.depenses)} · Résultat \${formatMontant(r.resultat, { signe: true })} · Stock \${formatMontant(r.stock)}</p></section>\`;
  }).join('');
  $('#resultat').innerHTML = \`<p class="ok">Sauvegarde du \${le ? new Date(le).toLocaleString('fr-FR') : '?'} ouverte.</p>
    <div class="boutons"><button data-x="ops">Opérations (CSV)</button><button data-x="syn">Synthèse mensuelle (CSV)</button><button data-x="json">Toutes les données (JSON)</button></div>\${bases}\`;
}

$('#resultat').addEventListener('click', (ev) => {
  const x = ev.target.closest('[data-x]')?.dataset.x;
  if (x === 'ops') telecharger('envelop-operations.csv', csvOperations(donnees), 'text/csv');
  if (x === 'syn') telecharger('envelop-synthese.csv', csvSynthese(donnees), 'text/csv');
  if (x === 'json') telecharger('envelop-donnees.json', JSON.stringify(donnees, null, 2), 'application/json');
});
`;

const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Envelop — lecteur de sauvegarde</title>
<style>
body{margin:0;font-family:system-ui,sans-serif;background:linear-gradient(175deg,#1aa7a8,#0b5f70) fixed;color:#213A57;min-height:100vh}
main{max-width:760px;margin:0 auto;padding:20px 14px}
h1{color:#fff;margin:6px 0 4px}.intro{color:#d8f7f0;margin:0 0 16px;line-height:1.45}
form,section,#resultat>p,.boutons{background:#fff;border-radius:20px;padding:16px 18px;margin-bottom:14px}
label{display:block;font-size:.85rem;color:#5f7487;margin:0 0 12px}input{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:11px;border:1.5px solid #dbe6ec;border-radius:12px;font-size:1rem}
button{border:0;border-radius:14px;padding:12px 16px;font-weight:600;font-size:.95rem;background:#14919B;color:#fff;margin:4px 6px 4px 0;cursor:pointer}
#message{color:#d14b4b;margin:10px 0 0;min-height:1em}table{width:100%;border-collapse:collapse;font-size:.9rem}td,th{padding:6px 4px;border-top:1px solid #e6eef2;text-align:right}td:first-child,th:first-child{text-align:left}.ok{color:#137a57;font-weight:600}
</style></head><body><main>
<h1>Lecteur de sauvegarde Envelop</h1>
<p class="intro">Ouvre un fichier de sauvegarde avec son mot de passe, sans l'appli et sans connexion. Rien n'est envoyé nulle part : tout se passe dans ce navigateur. Les fichiers obtenus ne sont pas chiffrés.</p>
<form id="ouvrir"><label>Fichier de sauvegarde (.txt ou .json)<input id="fichier" type="file" accept=".txt,.json"></label>
<label>Mot de passe de la sauvegarde<input id="mdp" type="password" autocomplete="off"></label>
<button>Ouvrir</button><p id="message"></p></form>
<div id="resultat"></div>
</main><script>${script}</script></body></html>
`;

const cible = join(racine, 'lecteur.html');
if (process.argv.includes('--verifier')) {
  if (readFileSync(cible, 'utf8') !== html) { console.error('lecteur.html n\'est pas à jour : node tools/build-lecteur.mjs'); process.exit(1); }
  console.log('lecteur.html à jour.');
} else {
  writeFileSync(cible, html);
  console.log('lecteur.html généré.');
}
