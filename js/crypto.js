// Chiffrement des données d'Envelop (WebCrypto, aucun envoi réseau).
// Clé dérivée du mot de passe par PBKDF2-SHA-256, données chiffrées en AES-GCM 256 bits.
// Sans le mot de passe, les données et les sauvegardes sont illisibles : il n'existe aucune porte dérobée.

export const ITERATIONS = 310000;

const enc = new TextEncoder();
const dec = new TextDecoder();

export function versBase64(octets) {
  let s = '';
  const u = new Uint8Array(octets);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export function depuisBase64(texte) {
  return Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));
}

export function nouveauSel() {
  return versBase64(crypto.getRandomValues(new Uint8Array(16)));
}

export async function deriverCle(motDePasse, sel, iterations = ITERATIONS) {
  const base = await crypto.subtle.importKey('raw', enc.encode(motDePasse), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: depuisBase64(sel), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function chiffrer(cle, objet) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const donnees = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cle, enc.encode(JSON.stringify(objet)));
  return { iv: versBase64(iv), donnees: versBase64(donnees) };
}

// Lève une erreur si la clé est mauvaise (mot de passe incorrect) ou les données altérées.
export async function dechiffrer(cle, { iv, donnees }) {
  const clair = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: depuisBase64(iv) }, cle, depuisBase64(donnees));
  return JSON.parse(dec.decode(clair));
}
