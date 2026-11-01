// Stockage d'Envelop : uniquement dans le navigateur de l'appareil, chiffré par mot de passe.
// Les données en clair n'existent qu'en mémoire, le temps que l'appli est déverrouillée.
import { moisDe } from './calc.js';
import * as K from './crypto.js';
import * as BA from './bascule.js';
import * as C from './calc.js';

const CLE_CLAIR = 'envelop:v1'; // ancien format en clair (étapes 1 et 2), migré puis effacé
const CLE = 'envelop:v2';
const CLE_COPIES = 'envelop:v2:copies';
const MAX_COPIES = 5;

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

let etat = null; // données déchiffrées
let cle = null; // CryptoKey, en mémoire seulement
let kdf = null; // { sel, iterations }
let ecriture = Promise.resolve();
let minuterieDossier = null;

const REGLAGES = { rappelJours: 7, derniereSauvegarde: null, rappelApres: null };

function normaliser(e) {
  e.version = 2;
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

// 'ouvert' | 'verrouille' | 'clair' (données à protéger) | 'nouveau'
export function statut() {
  if (etat) return 'ouvert';
  if (localStorage.getItem(CLE)) return 'verrouille';
  if (localStorage.getItem(CLE_CLAIR)) return 'clair';
  return 'nouveau';
}

function enregistrer() {
  const instantane = JSON.parse(JSON.stringify(etat));
  const k = cle;
  const params = kdf;
  ecriture = ecriture.then(async () => {
    const c = await K.chiffrer(k, instantane);
    localStorage.setItem(CLE, JSON.stringify({ format: 'envelop', version: 2, kdf: params, le: new Date().toISOString(), ...c }));
  });
  programmerDossier();
  return ecriture;
}

export const attendreEcriture = () => ecriture;

export async function creerMotDePasse(motDePasse) {
  kdf = { sel: K.nouveauSel(), iterations: K.ITERATIONS };
  cle = await K.deriverCle(motDePasse, kdf.sel, kdf.iterations);
  let depart = { bases: [] };
  try { depart = JSON.parse(localStorage.getItem(CLE_CLAIR)) || depart; } catch { /* rien à migrer */ }
  etat = normaliser(depart);
  await enregistrer();
  localStorage.removeItem(CLE_CLAIR);
}

export async function deverrouiller(motDePasse) {
  const stocke = JSON.parse(localStorage.getItem(CLE));
  const k = await K.deriverCle(motDePasse, stocke.kdf.sel, stocke.kdf.iterations);
  try {
    etat = normaliser(await K.dechiffrer(k, stocke));
  } catch {
    return false;
  }
  cle = k;
  kdf = stocke.kdf;
  return true;
}

export function verrouiller() {
  etat = null;
  cle = null;
  correction = null;
}

export async function changerMotDePasse(ancien, nouveau) {
  const stocke = JSON.parse(localStorage.getItem(CLE));
  const ancienneCle = await K.deriverCle(ancien, stocke.kdf.sel, stocke.kdf.iterations);
  try { await K.dechiffrer(ancienneCle, stocke); } catch { return false; }
  const copies = await Promise.all(listeCopies().map(async (c) => ({ ...c, contenu: await K.dechiffrer(ancienneCle, c) })));
  kdf = { sel: K.nouveauSel(), iterations: K.ITERATIONS };
  cle = await K.deriverCle(nouveau, kdf.sel, kdf.iterations);
  await enregistrer();
  const rechiffrees = await Promise.all(copies.map(async ({ le, raison, contenu }) => ({ le, raison, ...(await K.chiffrer(cle, contenu)) })));
  localStorage.setItem(CLE_COPIES, JSON.stringify(rechiffrees));
  return true;
}

// Efface tout sur cet appareil (mot de passe oublié). Les fichiers de sauvegarde restent utilisables.
export function toutEffacer() {
  [CLE, CLE_COPIES, CLE_CLAIR].forEach((k) => localStorage.removeItem(k));
  verrouiller();
}

export const reglages = () => etat.reglages;
export const bases = () => etat.bases;
export const base = (id) => etat.bases.find((b) => b.id === id);
export const moisCourant = (b) => b.mois[b.mois.length - 1];

// Toute modification passe par ici, puis est chiffrée et enregistrée.
export function modifier(fn) {
  fn(etat);
  enregistrer();
}

// --- Copies automatiques (avant import, correction, restauration) --------------

function listeCopies() {
  try { return JSON.parse(localStorage.getItem(CLE_COPIES)) || []; } catch { return []; }
}

export const copies = () => listeCopies().map(({ le, raison }) => ({ le, raison }));

export async function prendreCopie(raison) {
  const instantane = JSON.parse(JSON.stringify(etat));
  const c = await K.chiffrer(cle, instantane);
  const liste = [{ le: new Date().toISOString(), raison, ...c }, ...listeCopies()].slice(0, MAX_COPIES);
  localStorage.setItem(CLE_COPIES, JSON.stringify(liste));
}

export async function restaurerCopie(index) {
  const c = listeCopies()[index];
  const contenu = await K.dechiffrer(cle, c);
  await prendreCopie('Avant restauration d\'une copie');
  const reg = etat.reglages;
  etat = normaliser(contenu);
  etat.reglages = reg;
  correction = null;
  await enregistrer();
}

// --- Fichier de sauvegarde (chiffré avec le même mot de passe) ------------------

function horodatage(d = new Date()) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

// Extension .txt : Android n'accepte pas le partage de fichiers .json (« Permission denied »).
// Le contenu reste le même fichier chiffré ; l'import accepte .txt et .json.
export const nomSauvegarde = () => `${horodatage()} - Export Envelop.txt`;

export async function texteSauvegarde() {
  const c = await K.chiffrer(cle, etat);
  return JSON.stringify({ format: 'envelop-sauvegarde', version: 2, kdf, le: new Date().toISOString(), ...c });
}

export function noterSauvegarde() {
  modifier((e) => { e.reglages.derniereSauvegarde = new Date().toISOString(); e.reglages.rappelApres = null; });
}

export class MotDePasseRequis extends Error {}

// Renvoie { contenu, le } ; lève MotDePasseRequis si le fichier a un autre mot de passe.
export async function lireSauvegarde(texte, motDePasse) {
  let obj;
  try { obj = JSON.parse(texte); } catch { throw new Error('Ce fichier n\'est pas une sauvegarde Envelop.'); }
  if (!obj || !String(obj.format).startsWith('envelop') || !obj.kdf || !obj.donnees) throw new Error('Ce fichier n\'est pas une sauvegarde Envelop.');
  let k;
  if (obj.kdf.sel === kdf.sel) k = cle;
  else if (!motDePasse) throw new MotDePasseRequis();
  else k = await K.deriverCle(motDePasse, obj.kdf.sel, obj.kdf.iterations);
  try {
    return { contenu: normaliser(await K.dechiffrer(k, obj)), le: obj.le };
  } catch {
    if (k === cle) throw new MotDePasseRequis();
    throw new Error('Mot de passe incorrect pour ce fichier.');
  }
}

// mode 'remplacer' : toutes les bases du fichier remplacent les bases actuelles.
// mode 'ajouter' : seules les bases absentes de l'appareil sont ajoutées, rien n'est écrasé.
export async function restaurer(contenu, mode) {
  await prendreCopie(mode === 'remplacer' ? 'Avant remplacement par une sauvegarde' : 'Avant ajout depuis une sauvegarde');
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
  await w.write(await texteSauvegarde());
  await w.close();
  etat.reglages.derniereSauvegarde = new Date().toISOString();
  etat.reglages.rappelApres = null;
  await enregistrerSansDossier();
  return true;
}

function enregistrerSansDossier() {
  const instantane = JSON.parse(JSON.stringify(etat));
  ecriture = ecriture.then(async () => {
    const c = await K.chiffrer(cle, instantane);
    localStorage.setItem(CLE, JSON.stringify({ format: 'envelop', version: 2, kdf, le: new Date().toISOString(), ...c }));
  });
  return ecriture;
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

