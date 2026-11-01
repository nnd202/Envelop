// Moteur de calcul d'Envelop.
// Règle d'or : seules les saisies sont stockées ; tout chiffre affiché est recalculé ici.
// Tous les montants sont en centimes (entiers) pour éviter les erreurs d'arrondi.
//
// Modèle (1er novembre 2026) :
// - Stock = somme des noisettes 🌰 de toutes les enveloppes, Surplus compris.
// - Le Surplus est une enveloppe automatique : son plafond = revenus − incompressibles − autres plafonds.
// - Dépenses et entrées touchent le reste du mois ; virements et écarts constatés touchent la 🌰.

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

const somme = (liste, f = (x) => x) => liste.reduce((t, x) => t + f(x), 0);

export const estSurplus = (env) => env?.special === 'surplus';
export const surplusDe = (base) => base.enveloppes.find(estSurplus);

// Opération qui déplace de la 🌰 (virement, écart constaté) plutôt qu'une dépense ou une entrée.
// « epargne » : ancien format, traité comme un virement.
export const estTransfert = (o) => !!(o.virement || o.ecart || o.reprise || o.epargne);

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

export function revenusDuMois(base, m) {
  return somme(operationsDe(base, m, 'revenu').filter((o) => !o.pause), (o) => o.montant);
}

export function incompressibleDuMois(base, m) {
  return somme(operationsDe(base, m, 'charge').filter((o) => !o.pause), (o) => o.montant);
}

// Plafond saisi d'une enveloppe ordinaire : la dernière valeur définie à partir d'un mois
// antérieur ou égal. Jamais rétroactif.
function plafondSaisi(base, envId, m) {
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

// Somme des plafonds des enveloppes ordinaires (hors Surplus), en option sans l'une d'elles.
export function plafondsOrdinaires(base, m, sauf = null) {
  return somme(enveloppesDuMois(base, m).filter((e) => !estSurplus(e) && e.id !== sauf), (e) => plafondSaisi(base, e.id, m));
}

// Plafond du Surplus : ce qui reste des revenus une fois les charges et les plafonds posés.
export function plafondSurplus(base, m) {
  return revenusDuMois(base, m) - incompressibleDuMois(base, m) - plafondsOrdinaires(base, m);
}

export function plafond(base, envId, m) {
  const env = base.enveloppes.find((e) => e.id === envId);
  return estSurplus(env) ? plafondSurplus(base, m) : plafondSaisi(base, envId, m);
}

// Plafond le plus haut possible pour une enveloppe sans faire passer le Surplus sous zéro.
export function plafondMaximum(base, envId, m) {
  return revenusDuMois(base, m) - incompressibleDuMois(base, m) - plafondsOrdinaires(base, m, envId);
}

// --- Calculs ------------------------------------------------------------------

function chiffresEnveloppe(base, env, m) {
  const ops = operationsDe(base, m, env.id);
  const comptees = ops.filter((o) => !o.pause);
  const mouvements = somme(comptees.filter((o) => !estTransfert(o)), (o) => o.montant); // négatif = dépense
  const transferts = somme(comptees.filter(estTransfert), (o) => o.montant);
  const pl = plafond(base, env.id, m);
  return { plafond: pl, consomme: -mouvements, reste: pl + mouvements, transferts, ops };
}

// Noisette en fin de mois m (en direct si m est le mois en cours).
export function noisette(base, env, m, cache = new Map()) {
  const cle = `${env.id}|${m}`;
  if (cache.has(cle)) return cache.get(cle);
  const c = chiffresEnveloppe(base, env, m);
  const val = noisetteAcquise(base, env, m, cache) + c.reste + c.transferts;
  cache.set(cle, val);
  return val;
}

// Noisette à la fin du mois précédent ; au premier mois de l'enveloppe, sa noisette de départ.
export function noisetteAcquise(base, env, m, cache = new Map()) {
  const prec = moisPrecedent(m);
  if (env.creeeLe > prec || !base.mois.includes(prec)) return env.noisetteDepart || 0;
  return noisette(base, env, prec, cache);
}

// Nombre de mois consécutifs, jusqu'au mois m inclus, où la noisette finit négative.
export function moisNegatifs(base, env, m, cache = new Map()) {
  let n = 0;
  let cur = m;
  while (base.mois.includes(cur) && env.creeeLe <= cur && noisette(base, env, cur, cache) < 0) {
    n += 1;
    cur = moisPrecedent(cur);
  }
  return n;
}

// Solde jour par jour : départ = 🌰 acquise + plafond, puis chaque opération à sa date.
// Renvoie le point le plus bas s'il est passé sous zéro, sinon null.
export function pointBas(acquise, plafondMois, ops, m) {
  let solde = acquise + plafondMois;
  let bas = solde < 0 ? { valeur: solde, date: `${m}-01` } : null;
  const tries = ops.filter((o) => !o.pause).map((o, i) => ({ o, i }))
    .sort((a, b) => (a.o.date || '').localeCompare(b.o.date || '') || a.i - b.i);
  for (const { o } of tries) {
    solde += o.montant;
    if (solde < 0 && (!bas || solde < bas.valeur)) bas = { valeur: solde, date: o.date };
  }
  return bas;
}

export function tendance(direct, acquise) {
  if (direct > acquise) return 'hausse';
  if (direct < acquise) return 'baisse';
  return 'stable';
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
      pointBas: pointBas(acquise, c.plafond, c.ops, m),
    };
  });

  const revenusOps = operationsDe(base, m, 'revenu');
  const chargesOps = operationsDe(base, m, 'charge');
  const revenus = revenusDuMois(base, m);
  const incompressible = incompressibleDuMois(base, m);
  const plafondsEnveloppes = plafondsOrdinaires(base, m);
  const surplusPrevu = revenus - incompressible - plafondsEnveloppes;
  const depenses = somme(enveloppes, (e) => e.consomme);
  const resultat = revenus - incompressible - depenses;
  const ecart = somme(base.operations.filter((o) => o.mois === m && o.ecart && !o.pause), (o) => o.montant);
  const stockDebut = somme(enveloppes, (e) => e.acquise);
  const stock = somme(enveloppes, (e) => e.direct);

  return {
    mois: m,
    enveloppes,
    revenusOps,
    chargesOps,
    revenus,
    incompressible,
    plafondsEnveloppes,
    surplusPrevu,
    depenses,
    resultat,
    ecart,
    stockDebut,
    stock,
    stockTendance: tendance(stock, stockDebut),
    controle: base.controles?.[m] || null,
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
  const s = fmt.format(Math.abs(centimes) / 100);
  const prefixe = centimes < 0 ? '− ' : signe && centimes > 0 ? '+ ' : '';
  return `${prefixe}${s}${euro ? ' €' : ''}`;
}
