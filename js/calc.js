// Moteur de calcul d'Envelop.
// Règle d'or : seules les saisies sont stockées ; tout chiffre affiché est recalculé ici.
// Tous les montants sont en centimes (entiers) pour éviter les erreurs d'arrondi.

// --- Mois au format "AAAA-MM" -------------------------------------------------

export function moisDe(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function moisSuivant(m) {
  let [a, n] = m.split('-').map(Number);
  n += 1;
  if (n > 12) { n = 1; a += 1; }
  return `${a}-${String(n).padStart(2, '0')}`;
}

export function moisPrecedent(m) {
  let [a, n] = m.split('-').map(Number);
  n -= 1;
  if (n < 1) { n = 12; a -= 1; }
  return `${a}-${String(n).padStart(2, '0')}`;
}

// --- Lecture des saisies ------------------------------------------------------

// Plafond en vigueur pour une enveloppe et un mois : la dernière valeur définie
// à partir d'un mois antérieur ou égal. Jamais rétroactif.
export function plafond(base, envId, m) {
  let val = 0;
  let depuis = '';
  for (const p of base.plafonds) {
    if (p.enveloppeId === envId && p.depuis <= m && p.depuis >= depuis) {
      val = p.montant;
      depuis = p.depuis;
    }
  }
  return val;
}

// Une enveloppe existe dans un mois si elle a été créée avant (ou ce mois-là)
// et n'a pas été supprimée avant (supprimeeDepuis = premier mois où elle disparaît).
export function enveloppeActive(env, m) {
  return env.creeeLe <= m && (!env.supprimeeDepuis || m < env.supprimeeDepuis);
}

export function enveloppesDuMois(base, m) {
  return base.enveloppes
    .filter((e) => enveloppeActive(e, m))
    .sort((a, b) => a.ordre - b.ordre);
}

export function operationsDe(base, m, cible) {
  return base.operations.filter((o) => o.mois === m && o.cible === cible);
}

const somme = (liste, f = (x) => x) => liste.reduce((t, x) => t + f(x), 0);

// --- Calculs ------------------------------------------------------------------

// Chiffres d'une enveloppe pour un mois donné, sans la noisette acquise.
function chiffresEnveloppe(base, env, m) {
  const ops = operationsDe(base, m, env.id);
  const comptees = ops.filter((o) => !o.pause);
  const courantes = comptees.filter((o) => !o.epargne);
  const epargne = comptees.filter((o) => o.epargne);
  const pl = plafond(base, env.id, m);
  const mouvements = somme(courantes, (o) => o.montant); // négatif = dépense
  return {
    plafond: pl,
    consomme: -mouvements,
    reste: pl + mouvements,
    epargne: somme(epargne, (o) => o.montant),
    ops,
  };
}

// Noisette en fin de mois m (en direct si m est le mois en cours).
// Récurrence sur les mois précédents de la base ; mise en cache par appel.
export function noisette(base, env, m, cache = new Map()) {
  const cle = `${env.id}|${m}`;
  if (cache.has(cle)) return cache.get(cle);
  const acquise = noisetteAcquise(base, env, m, cache);
  const c = chiffresEnveloppe(base, env, m);
  const val = acquise + c.reste + c.epargne;
  cache.set(cle, val);
  return val;
}

// Noisette à la fin du mois précédent ; au premier mois de l'enveloppe, sa noisette de départ.
export function noisetteAcquise(base, env, m, cache = new Map()) {
  const prec = moisPrecedent(m);
  if (env.creeeLe > prec || !base.mois.includes(prec)) return env.noisetteDepart || 0;
  return noisette(base, env, prec, cache);
}

// Nombre de mois consécutifs, jusqu'au mois m inclus, où la noisette est négative.
export function moisNegatifs(base, env, m, cache = new Map()) {
  let n = 0;
  let cur = m;
  while (base.mois.includes(cur) && env.creeeLe <= cur && noisette(base, env, cur, cache) < 0) {
    n += 1;
    cur = moisPrecedent(cur);
  }
  return n;
}

export function tendance(direct, acquise) {
  if (direct > acquise) return 'hausse';
  if (direct < acquise) return 'baisse';
  return 'stable';
}

// Réserve cumulée jusqu'au mois m inclus (versements de marge non affectés, étape 2).
export function reserve(base, m) {
  return somme((base.reserve || []).filter((r) => r.mois <= m), (r) => r.montant);
}

// Tout ce qu'affiche la vue d'un mois.
export function calculMois(base, m) {
  const cache = new Map();
  const enveloppes = enveloppesDuMois(base, m).map((env) => {
    const c = chiffresEnveloppe(base, env, m);
    const acquise = noisetteAcquise(base, env, m, cache);
    const direct = noisette(base, env, m, cache);
    return {
      env,
      ...c,
      acquise,
      direct,
      tendance: tendance(direct, acquise),
      moisNegatifs: moisNegatifs(base, env, m, cache),
    };
  });

  const revenusOps = operationsDe(base, m, 'revenu');
  const chargesOps = operationsDe(base, m, 'charge');
  const revenus = somme(revenusOps.filter((o) => !o.pause), (o) => o.montant);
  const incompressible = somme(chargesOps.filter((o) => !o.pause), (o) => o.montant);
  const plafonds = somme(enveloppes, (e) => e.plafond);
  const consomme = somme(enveloppes, (e) => e.consomme);
  const margePrevue = revenus - plafonds - incompressible;
  const depassement = Math.max(0, consomme - plafonds);
  const margeReelle = margePrevue - depassement;

  const res = reserve(base, m);
  const resAcquise = reserve(base, moisPrecedent(m));
  const epargneGlobale = somme(enveloppes, (e) => e.direct) + res;
  const epargneAcquise = somme(enveloppes, (e) => e.acquise) + resAcquise;

  return {
    mois: m,
    enveloppes,
    revenusOps,
    chargesOps,
    revenus,
    incompressible,
    plafonds,
    consomme,
    margePrevue,
    depassement,
    margeReelle,
    reserve: res,
    reserveTendance: tendance(res, resAcquise),
    epargneGlobale,
    epargneAcquise,
    epargneTendance: tendance(epargneGlobale, epargneAcquise),
  };
}

// --- Saisie des montants ------------------------------------------------------

// "1 234,56", "139, 56€", "59,8", "-12.5" → centimes. null si illisible.
export function lireMontant(texte) {
  if (texte == null) return null;
  const t = String(texte).replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
}

const fmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMontant(centimes, { signe = false, euro = true } = {}) {
  const s = fmt.format(centimes / 100);
  const avecSigne = signe && centimes > 0 ? `+${s}` : s;
  return euro ? `${avecSigne} €` : avecSigne;
}
