// Stockage d'Envelop : dans le navigateur de l'appareil, en clair (aucun chiffrement).
// L'accès à l'appli est protégé par un code à 6 chiffres (écran de verrouillage).
// Ce code protège contre quelqu'un qui ouvre l'appli, pas contre quelqu'un qui fouillerait
// le stockage du navigateur.
import { moisDe } from './calc.js';
import * as K from './crypto.js';
import * as BA from './bascule.js';
import * as C from './calc.js';

const CLE = 'envelop:v3';
const CLE_VERROU = 'envelop:v3:verrou';
const CLE_COPIES = 'envelop:v3:copies';
// Anciens formats, migrés au premier déverrouillage puis effacés.
const ANCIENNES = { clair: 'envelop:v1', chiffre: 'envelop:v2', copies: 'envelop:v2:copies', code: 'envelop:v2:code' };
const VERROU_ITERATIONS = 100000;
const ESSAIS_AVANT_PAUSE = 5;
const MAX_COPIES = 5;

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let etat = null; // données, en mémoire tant que l'appli est déverrouillée
let ouvert = false;
let minuterieDossier = null;

const REGLAGES = { rappelJours: 7, derniereSauvegarde: null, rappelApres: null };

function normaliser(e) {
  e.version = 3;
  e.bases = e.bases || [];
  e.reglages = { ...REGLAGES, ...(e.reglages || {}) };
  for (const b of e.bases) assurerSurplus(b);
  return e;
}

// Toute base a son enveloppe Surplus (ajoutée aux bases créées avant ce modèle).
function assurerSurplus(b) {
  if (b.enveloppes.some((x) => x.special === 'surplus')) return;
  b.enveloppes.push({ id: uid(), special: 'surplus', nom: 'Surplus', icone: '🫙', ordre: b.enveloppes.length, creeeLe: b.mois[0], noisetteDepart: 0, flechee: false });
}

const lire = (cle) => { try { return JSON.parse(localStorage.getItem(cle)); } catch { return null; } };

// 'ouvert' | 'verrouille' (code à taper) | 'migration' (ancien format chiffré à ouvrir une dernière fois)
// | 'nouveau' (aucun code : en créer un)
export function statut() {
  if (ouvert && etat) return 'ouvert';
  if (localStorage.getItem(ANCIENNES.chiffre)) return 'migration';
  if (localStorage.getItem(CLE_VERROU)) return 'verrouille';
  return 'nouveau';
}

function enregistrer() {
  localStorage.setItem(CLE, JSON.stringify(etat));
  programmerDossier();
}

export const attendreEcriture = () => Promise.resolve();

function chargerClair() {
  etat = normaliser(lire(CLE) || lire(ANCIENNES.clair) || { bases: [] });
  localStorage.removeItem(ANCIENNES.clair);
  enregistrer();
}

// --- Code de verrouillage -------------------------------------------------------------

async function empreinte(code, sel, iterations) {
  return K.versBase64(await K.deriverOctets(code, sel, iterations));
}

export const aCode = () => !!localStorage.getItem(CLE_VERROU);

// Premier lancement (ou changement de code) : enregistre le code et ouvre l'appli.
export async function definirCode(code) {
  const sel = K.nouveauSel();
  localStorage.setItem(CLE_VERROU, JSON.stringify({ sel, iterations: VERROU_ITERATIONS, empreinte: await empreinte(code, sel, VERROU_ITERATIONS), essais: 0, pauseJusqua: 0 }));
  if (!etat) chargerClair();
  ouvert = true;
}

// Renvoie { ok } ou { ok: false, restants, pause } (pause en secondes après trop d'erreurs).
export async function deverrouillerCode(code) {
  const v = lire(CLE_VERROU);
  if (!v) return { ok: false, restants: 0, pause: 0 };
  const attente = Math.ceil(((v.pauseJusqua || 0) - Date.now()) / 1000);
  if (attente > 0) return { ok: false, restants: 0, pause: attente };
  if ((await empreinte(code, v.sel, v.iterations)) !== v.empreinte) {
    v.essais = (v.essais || 0) + 1;
    let pause = 0;
    if (v.essais >= ESSAIS_AVANT_PAUSE) {
      pause = 30 * 2 ** (v.essais - ESSAIS_AVANT_PAUSE); // 30 s, 1 min, 2 min…
      v.pauseJusqua = Date.now() + pause * 1000;
    }
    localStorage.setItem(CLE_VERROU, JSON.stringify(v));
    return { ok: false, restants: Math.max(0, ESSAIS_AVANT_PAUSE - v.essais), pause };
  }
  v.essais = 0;
  v.pauseJusqua = 0;
  localStorage.setItem(CLE_VERROU, JSON.stringify(v));
  chargerClair();
  ouvert = true;
  return { ok: true };
}

export function verrouiller() {
  ouvert = false;
  etat = null;
  correction = null;
}

// --- Migration de l'ancien format chiffré (une seule fois) ------------------------------
// On l'ouvre avec l'ancien code ou l'ancien mot de passe, puis tout passe en clair.

export const migrationParCode = () => !!localStorage.getItem(ANCIENNES.code);

async function finirMigration(octets) {
  const stocke = lire(ANCIENNES.chiffre);
  const donnees = await K.dechiffrer(await K.importerCle(octets), stocke);
  localStorage.setItem(CLE, JSON.stringify(normaliser(donnees)));
  [ANCIENNES.chiffre, ANCIENNES.copies, ANCIENNES.code, ANCIENNES.clair].forEach((k) => localStorage.removeItem(k));
}

// Avec l'ancien code à 6 chiffres : il devient le code de verrouillage.
export async function migrerAvecCode(code) {
  const enreg = lire(ANCIENNES.code);
  try {
    const k = await K.deriverCle(code, enreg.sel, enreg.iterations);
    const octets = K.depuisBase64((await K.dechiffrer(k, enreg)).cle);
    await finirMigration(octets);
  } catch {
    return false;
  }
  await definirCode(code);
  return true;
}

// Avec l'ancien mot de passe : il faudra ensuite choisir un code.
export async function migrerAvecMotDePasse(motDePasse) {
  const stocke = lire(ANCIENNES.chiffre);
  try {
    await finirMigration(await K.deriverOctets(motDePasse, stocke.kdf.sel, stocke.kdf.iterations));
  } catch {
    return false;
  }
  chargerClair();
  ouvert = true;
  return true;
}

// Code oublié : efface tout sur cet appareil. Les exports restent utilisables.
export function toutEffacer() {
  [CLE, CLE_VERROU, CLE_COPIES, ...Object.values(ANCIENNES)].forEach((k) => localStorage.removeItem(k));
  verrouiller();
}

export const reglages = () => etat.reglages;
export const bases = () => etat.bases;
export const base = (id) => etat.bases.find((b) => b.id === id);
export const moisCourant = (b) => b.mois[b.mois.length - 1];

// Toute modification passe par ici, puis est enregistrée.
export function modifier(fn) {
  fn(etat);
  enregistrer();
}

// --- Copies automatiques (avant import, correction, restauration) --------------

const listeCopies = () => lire(CLE_COPIES) || [];

export const copies = () => listeCopies().map(({ le, raison }) => ({ le, raison }));

export async function prendreCopie(raison) {
  const liste = [{ le: new Date().toISOString(), raison, contenu: JSON.parse(JSON.stringify(etat)) }, ...listeCopies()].slice(0, MAX_COPIES);
  try {
    localStorage.setItem(CLE_COPIES, JSON.stringify(liste));
  } catch {
    localStorage.setItem(CLE_COPIES, JSON.stringify(liste.slice(0, 2))); // stockage plein : on garde les plus récentes
  }
}

export async function restaurerCopie(index) {
  const c = listeCopies()[index];
  await prendreCopie('Avant restauration d\'une copie');
  const reg = etat.reglages;
  etat = normaliser(JSON.parse(JSON.stringify(c.contenu)));
  etat.reglages = reg;
  correction = null;
  enregistrer();
}

// --- Export (un seul fichier, complet et lisible) --------------------------------------

function horodatage(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// L'export contient tout : bases, mois, enveloppes, plafonds, opérations, virements,
// contrôles du stock, réglages. Extension .txt : Android refuse de partager du .json.
export const nomSauvegarde = () => `${horodatage()} - Export Envelop.txt`;

export function texteExport() {
  return JSON.stringify({
    format: 'envelop-export',
    version: 3,
    application: 'Envelop · https://nnd202.github.io/envelop/',
    le: new Date().toISOString(),
    bases: etat.bases,
    reglages: { rappelJours: etat.reglages.rappelJours },
  }, null, 2);
}

export function noterSauvegarde() {
  modifier((e) => { e.reglages.derniereSauvegarde = new Date().toISOString(); e.reglages.rappelApres = null; });
}

export class MotDePasseRequis extends Error {}

// Renvoie { contenu, le }. Accepte l'export lisible, et les anciennes sauvegardes chiffrées
// (lève MotDePasseRequis : leur mot de passe d'alors est demandé).
export async function lireSauvegarde(texte, motDePasse) {
  let obj;
  try { obj = JSON.parse(texte); } catch { throw new Error('Ce fichier n\'est pas un export Envelop.'); }
  if (obj?.format === 'envelop-export' && Array.isArray(obj.bases)) {
    return { contenu: normaliser({ bases: obj.bases }), le: obj.le };
  }
  if (!obj || !String(obj.format).startsWith('envelop') || !obj.kdf || !obj.donnees) throw new Error('Ce fichier n\'est pas un export Envelop.');
  if (!motDePasse) throw new MotDePasseRequis();
  try {
    const k = await K.deriverCle(motDePasse, obj.kdf.sel, obj.kdf.iterations);
    return { contenu: normaliser(await K.dechiffrer(k, obj)), le: obj.le };
  } catch {
    throw new Error('Mot de passe incorrect pour ce fichier.');
  }
}

// mode 'remplacer' : toutes les bases du fichier remplacent les bases actuelles.
// mode 'ajouter' : seules les bases absentes de l'appareil sont ajoutées, rien n'est écrasé.
export async function restaurer(contenu, mode) {
  await prendreCopie(mode === 'remplacer' ? 'Avant remplacement par un export' : 'Avant ajout depuis un export');
  const ids = new Set(etat.bases.map((b) => b.id));
  const ajoutees = contenu.bases.filter((b) => mode === 'remplacer' || !ids.has(b.id));
  const ignorees = mode === 'remplacer' ? [] : contenu.bases.filter((b) => ids.has(b.id));
  modifier((e) => { e.bases = mode === 'remplacer' ? contenu.bases : [...e.bases, ...ajoutees]; });
  correction = null;
  return { ajoutees, ignorees };
}

// --- Dossier de sauvegarde automatique (Chrome/Edge sur PC) ----------------------

// Réservé aux ordinateurs : sur téléphone, Android refuse l'écriture durable dans un dossier.
const mobile = typeof navigator !== 'undefined' && (navigator.userAgentData?.mobile || /Android|iPhone|iPad/i.test(navigator.userAgent));
export const dossierPossible = typeof window !== 'undefined' && 'showDirectoryPicker' in window && !mobile;

function idb() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open('envelop', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('kv');
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}
async function kv(mode, cleKv, valeur) {
  const db = await idb();
  return new Promise((ok, ko) => {
    const t = db.transaction('kv', mode === 'get' ? 'readonly' : 'readwrite');
    const st = t.objectStore('kv');
    const r = mode === 'get' ? st.get(cleKv) : mode === 'del' ? st.delete(cleKv) : st.put(valeur, cleKv);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

export async function etatDossier() {
  if (!dossierPossible) return { etat: 'impossible' };
  const h = await kv('get', 'dossier').catch(() => null);
  if (!h) return { etat: 'aucun' };
  return { etat: await h.queryPermission({ mode: 'readwrite' }), nom: h.name };
}

export async function choisirDossier() {
  const h = await window.showDirectoryPicker({ mode: 'readwrite', id: 'envelop' });
  await kv('put', 'dossier', h);
  await ecrireDossier();
}

export async function reautoriserDossier() {
  const h = await kv('get', 'dossier');
  if (h && (await h.requestPermission({ mode: 'readwrite' })) === 'granted') await ecrireDossier();
}

export async function oublierDossier() {
  await kv('del', 'dossier');
}

async function ecrireDossier() {
  if (!dossierPossible || !etat) return false;
  const h = await kv('get', 'dossier').catch(() => null);
  if (!h || (await h.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
  const fichier = await h.getFileHandle(nomSauvegarde(), { create: true });
  const w = await fichier.createWritable();
  await w.write(texteExport());
  await w.close();
  etat.reglages.derniereSauvegarde = new Date().toISOString();
  etat.reglages.rappelApres = null;
  enregistrerSansDossier();
  return true;
}

function enregistrerSansDossier() {
  localStorage.setItem(CLE, JSON.stringify(etat));
}

function programmerDossier() {
  if (!dossierPossible) return;
  clearTimeout(minuterieDossier);
  minuterieDossier = setTimeout(() => { ecrireDossier().catch(() => {}); }, 4000);
}

// --- Mode correction d'un mois passé ---------------------------------------------

let correction = null; // { baseId, mois, avant }

export const correctionEnCours = () => correction;

export async function commencerCorrection(b, mois, raison = `Avant correction (${mois})`) {
  await prendreCopie(raison);
  correction = { baseId: b.id, mois, avant: JSON.parse(JSON.stringify(b)) };
}

export function terminerCorrection(valider) {
  if (!correction) return;
  if (!valider) {
    const i = etat.bases.findIndex((b) => b.id === correction.baseId);
    modifier((e) => { e.bases[i] = correction.avant; });
  }
  correction = null;
}

// --- Bases ---------------------------------------------------------------------

// stock : tout l'argent disponible au départ, tous comptes confondus. Il commence dans le Surplus.
export function creerBase({ nom, icone, mois, stock = 0 }) {
  const m = mois || moisDe(new Date());
  const b = { id: uid(), nom, icone: icone || '💶', mois: [m], enveloppes: [], plafonds: [], operations: [], controles: {}, notes: [] };
  b.enveloppes.push({ id: uid(), special: 'surplus', nom: 'Surplus', icone: '🫙', ordre: 0, creeeLe: m, noisetteDepart: stock, flechee: false });
  modifier((e) => e.bases.push(b));
  return b;
}

export function supprimerBase(id) {
  modifier((e) => { e.bases = e.bases.filter((b) => b.id !== id); });
}

const dateDuJour = (m) => {
  const auj = new Date().toISOString().slice(0, 10);
  return auj.startsWith(m) ? auj : `${m}-01`;
};

// --- Enveloppes ----------------------------------------------------------------

// depart : 🌰 de départ, prise sur le Surplus par un virement (le stock ne change pas).
export function creerEnveloppe(b, { nom, icone, plafond, depart = 0, flechee }) {
  const m = moisCourant(b);
  const env = { id: uid(), nom, icone: icone || '✉️', ordre: b.enveloppes.length, creeeLe: m, noisetteDepart: 0, flechee: !!flechee };
  modifier(() => {
    // La nouvelle enveloppe se place juste avant le Surplus.
    const pos = C.surplusDe(b).ordre;
    b.enveloppes.forEach((e) => { if (e.ordre >= pos) e.ordre += 1; });
    env.ordre = pos;
    b.enveloppes.push(env);
    b.plafonds.push({ enveloppeId: env.id, depuis: m, montant: plafond || 0 });
    if (depart) ajouterVirement(b, { depuis: C.surplusDe(b).id, vers: env.id, montant: depart, date: dateDuJour(m), mois: m, libelle: '🌰 de départ' });
  });
  return env;
}

export function modifierEnveloppe(b, envId, champs) {
  modifier(() => Object.assign(b.enveloppes.find((e) => e.id === envId), champs));
}

// Disparaît du mois en cours et des suivants ; les mois passés la gardent.
// Sa 🌰 de fin du mois précédent revient au Surplus : le stock ne change pas.
export function supprimerEnveloppe(b, envId) {
  const m = moisCourant(b);
  modifier(() => {
    const env = b.enveloppes.find((e) => e.id === envId);
    const groupes = new Set(b.operations.filter((o) => o.cible === envId && o.mois >= m && o.virement).map((o) => o.virement));
    b.operations = b.operations.filter((o) => !(o.cible === envId && o.mois >= m) && !(o.virement && groupes.has(o.virement)));
    if (env.creeeLe >= m) {
      b.enveloppes = b.enveloppes.filter((e) => e.id !== envId);
      b.plafonds = b.plafonds.filter((p) => p.enveloppeId !== envId);
      return;
    }
    const reprise = C.noisetteAcquise(b, env, m);
    env.supprimeeDepuis = m;
    b.plafonds = b.plafonds.filter((p) => !(p.enveloppeId === envId && p.depuis >= m));
    if (reprise) {
      b.operations.push({ id: uid(), mois: m, cible: C.surplusDe(b).id, date: `${m}-01`, libelle: `Reprise de « ${env.nom} »`, montant: reprise, reprise: envId, pause: false, recurrente: false });
    }
  });
}

export function deplacerEnveloppe(b, envId, sens) {
  const m = moisCourant(b);
  modifier(() => {
    const actives = b.enveloppes.filter((e) => C.enveloppeActive(e, m)).sort((x, y) => x.ordre - y.ordre);
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

// Supprimer une moitié de virement supprime l'autre.
export function supprimerOperation(b, opId) {
  modifier(() => {
    const op = b.operations.find((o) => o.id === opId);
    b.operations = b.operations.filter((o) => o.id !== opId && !(op?.virement && o.virement === op.virement));
  });
}

// Virement : deux opérations liées, − dans l'enveloppe de départ, + dans celle d'arrivée.
function ajouterVirement(b, { groupe, depuis, vers, montant, date, mois, libelle = '' }) {
  const g = groupe || uid();
  b.operations = b.operations.filter((o) => o.virement !== g);
  const commun = { mois, date, libelle, virement: g, pause: false, recurrente: false };
  b.operations.push({ id: uid(), cible: depuis, montant: -Math.abs(montant), vers, ...commun });
  b.operations.push({ id: uid(), cible: vers, montant: Math.abs(montant), depuis, ...commun });
  return g;
}

export function enregistrerVirement(b, v) {
  modifier(() => ajouterVirement(b, v));
}

// --- Démo ----------------------------------------------------------------------
// Données inventées, pour essayer l'appli sans rien saisir.

export function creerDemo() {
  const m = moisDe(new Date());
  const b = creerBase({ nom: 'Démo', icone: '🧪', mois: m, stock: 320000 });
  const jour = (j) => `${m}-${String(j).padStart(2, '0')}`;
  const fixes = [
    ['revenu', 'Salaire', 190000], ['charge', 'Loyer', 65000], ['charge', 'Électricité', 4500],
    ['charge', 'Box internet', 2999], ['charge', 'Téléphone', 1299], ['charge', 'Streaming', 1099, true],
  ];
  for (const [cible, libelle, montant, pause] of fixes) {
    enregistrerOperation(b, { mois: m, cible, date: jour(1), libelle, montant, pause: !!pause, recurrente: true });
  }
  const envs = [
    ['🛒', 'Courses', 32000, 18000, [[3, -4210], [9, -5675], [17, -3890]]],
    ['⛽', 'Carburant', 9000, 9500, [[12, -6150]]],
    ['🎉', 'Sorties', 12000, 30000, [[6, -2800], [14, -9450]]],
    ['🎁', 'Cadeaux', 4000, 0, []],
    ['🚗', 'Voiture', 5000, 40000, [[11, -50000]]],
    ['👕', 'Vêtements', 5000, 6000, [[19, -2390]]],
  ];
  for (const [icone, nom, pl, depart, ops] of envs) {
    const env = creerEnveloppe(b, { nom, icone, plafond: pl, depart, flechee: nom === 'Voiture' });
    for (const [j, montant] of ops) enregistrerOperation(b, { mois: m, cible: env.id, date: jour(j), libelle: '', montant, pause: false, recurrente: false });
  }
  const voiture = b.enveloppes.find((e) => e.nom === 'Voiture');
  enregistrerVirement(b, { depuis: C.surplusDe(b).id, vers: voiture.id, montant: 5000, date: jour(20), mois: m, libelle: 'Renflouer la voiture' });
  return b;
}

// --- Bascule de mois -----------------------------------------------------------

export function basculer(b, { stockReel = null, differe = 0 } = {}) {
  let suivant;
  modifier(() => { suivant = BA.appliquer(b, { stockReel, differe }); });
  return suivant;
}

export function annulerBascule(b) {
  modifier(() => BA.annuler(b));
}

