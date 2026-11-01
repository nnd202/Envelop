// Statistiques d'Envelop : par base et par enveloppe, avec petits graphiques SVG.
// Une enveloppe est suivie sur toute sa vie (renommée ou reliée = même enveloppe ;
// supprimée = mesurée jusqu'à sa suppression).
import * as C from './calc.js';

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = (c) => C.formatMontant(c);
const moyenne = (l) => (l.length ? Math.round(l.reduce((t, x) => t + x, 0) / l.length) : 0);

function nomMois(m, court = false) {
  const [a, n] = m.split('-').map(Number);
  const t = new Date(a, n - 1, 1).toLocaleDateString('fr-FR', court ? { month: 'short' } : { month: 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const RETOUR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
const CHEVRON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

// --- Calculs -------------------------------------------------------------------------

export function statsEnveloppe(b, env, calculs = new Map()) {
  const mois = b.mois.filter((m) => C.enveloppeActive(env, m));
  const parMois = mois.map((m) => {
    if (!calculs.has(m)) calculs.set(m, C.calculMois(b, m));
    const e = calculs.get(m).enveloppes.find((x) => x.env.id === env.id);
    const courantes = e.ops.filter((o) => !C.estTransfert(o));
    const recus = e.ops.filter((o) => o.virement && !o.pause && o.montant > 0);
    return { m, plafond: e.plafond, consomme: e.consomme, nbOps: courantes.length, recus, noisette: e.direct, pointBas: e.pointBas };
  });
  const depassements = parMois.filter((x) => x.consomme > x.plafond);
  const maxOps = parMois.reduce((best, x) => (x.nbOps > (best?.nbOps ?? -1) ? x : best), null);
  const recus = parMois.flatMap((x) => x.recus.map((o) => o.montant));
  const plafonds = [];
  for (const x of parMois) if (!plafonds.length || plafonds[plafonds.length - 1].montant !== x.plafond) plafonds.push({ m: x.m, montant: x.plafond });
  return {
    env,
    mois,
    parMois,
    depenseMoyenne: moyenne(parMois.map((x) => x.consomme)),
    nbDepassements: depassements.length,
    depassementMoyen: moyenne(depassements.map((x) => x.consomme - x.plafond)),
    nbSousZero: parMois.filter((x) => x.pointBas).length,
    opsMoyenne: parMois.length ? parMois.reduce((t, x) => t + x.nbOps, 0) / parMois.length : 0,
    maxOps,
    nbVirementsRecus: recus.length,
    virementMoyen: moyenne(recus),
    plafonds,
  };
}

// --- Graphiques ------------------------------------------------------------------------
// Une série par graphique, un seul axe, marques fines ; toucher une marque affiche sa valeur.

const L = 340;
const H = 160;
const M = { g: 46, d: 8, h: 12, b: 22 };

// Pas « ronds » (1, 2 ou 5 × 10ⁿ) pour 3 à 5 graduations : 3 400 € → 0, 1 000, 2 000, 3 000, 4 000.
export function graduations(min, max) {
  const brut = (max - min) / 4 || 1;
  const puissance = 10 ** Math.floor(Math.log10(brut));
  const pas = Math.max(100, [1, 2, 5, 10].map((k) => k * puissance).find((p) => p >= brut));
  const bas = Math.floor(min / pas) * pas;
  const haut = Math.ceil(max / pas) * pas;
  const ticks = [];
  for (let v = bas; v <= haut + pas / 2; v += pas) ticks.push(Math.round(v));
  return { bas, haut, ticks };
}

const etiquetteEuro = (c) => {
  const e = Math.round(c / 100);
  return `${e < 0 ? '−' : ''}${Math.abs(e).toLocaleString('fr-FR')}`;
};

function echelle(valeurs) {
  const { bas, haut, ticks } = graduations(Math.min(0, ...valeurs), Math.max(0, ...valeurs, Math.min(0, ...valeurs) < 0 ? 0 : 10000));
  const y = (v) => M.h + (H - M.h - M.b) * (1 - (v - bas) / (haut - bas));
  const grille = ticks.map((t) => `<line x1="${M.g}" x2="${L - M.d}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'zero' : 'grille'}"/>
    <text x="${M.g - 6}" y="${y(t) + 3.5}" text-anchor="end" class="axe">${etiquetteEuro(t)}</text>`).join('');
  return { y, grille };
}

function etiquettesX(points, x) {
  const n = points.length;
  const pas = Math.max(1, Math.ceil(n / 6));
  return points.map((p, i) => ((i % pas === 0 || i === n - 1)
    ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="axe">${esc(nomMois(p.m, true))}</text>` : '')).join('');
}

function cadre(contenu, titre, legende = '') {
  return `<figure class="graphe"><figcaption>${titre}</figcaption>${legende}
    <svg viewBox="0 0 ${L} ${H}" role="img" aria-label="${esc(titre)}">${contenu}</svg>
    <div class="lecture" aria-live="polite">Touche un point pour voir sa valeur.</div></figure>`;
}

export function graphLigne(points, titre) {
  if (!points.length) return '';
  const { y, grille } = echelle(points.map((p) => p.v));
  const n = points.length;
  const x = (i) => (n === 1 ? (M.g + L - M.d) / 2 : M.g + 10 + (i * (L - M.g - M.d - 20)) / (n - 1));
  const chemin = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const pts = points.map((p, i) => `<g class="cible" data-tip="${esc(nomMois(p.m))} : ${esc(euros(p.v))}">
      <rect x="${x(i) - 14}" y="${M.h}" width="28" height="${H - M.h - M.b}" fill="transparent"/>
      <circle cx="${x(i)}" cy="${y(p.v)}" r="4" class="${p.v < 0 ? 'point neg' : 'point'}"/></g>`).join('');
  return cadre(`${grille}<path d="${chemin}" class="trait"/>${pts}${etiquettesX(points, x)}`, titre);
}

// Barres de dépense, plafond en pointillés ; une barre au-dessus du plafond est marquée « dépassement ».
export function graphBarres(points, titre, { reference = false, signe = false } = {}) {
  if (!points.length) return '';
  const { y, grille } = echelle(points.flatMap((p) => [p.v, p.ref ?? 0]));
  const n = points.length;
  const pas = (L - M.g - M.d) / n;
  const larg = Math.min(26, pas * 0.62);
  const x = (i) => M.g + pas * i + pas / 2;
  const y0 = y(0);
  const barres = points.map((p, i) => {
    const haut = Math.min(y(p.v), y0);
    const h = Math.max(1, Math.abs(y(p.v) - y0));
    const depasse = reference && p.ref != null && p.v > p.ref;
    const classe = depasse ? 'baton depasse' : signe && p.v < 0 ? 'baton neg' : 'baton';
    const tip = `${nomMois(p.m)} : ${euros(p.v)}${p.ref != null ? ` · plafond ${euros(p.ref)}` : ''}${depasse ? ' · dépassement' : ''}`;
    const r = Math.min(4, larg / 2, h);
    const d = p.v >= 0
      ? `M${x(i) - larg / 2},${y0} V${haut + r} Q${x(i) - larg / 2},${haut} ${x(i) - larg / 2 + r},${haut} H${x(i) + larg / 2 - r} Q${x(i) + larg / 2},${haut} ${x(i) + larg / 2},${haut + r} V${y0} Z`
      : `M${x(i) - larg / 2},${y0} V${y0 + h - r} Q${x(i) - larg / 2},${y0 + h} ${x(i) - larg / 2 + r},${y0 + h} H${x(i) + larg / 2 - r} Q${x(i) + larg / 2},${y0 + h} ${x(i) + larg / 2},${y0 + h - r} V${y0} Z`;
    return `<g class="cible" data-tip="${esc(tip)}"><rect x="${x(i) - pas / 2}" y="${M.h}" width="${pas}" height="${H - M.h - M.b}" fill="transparent"/><path d="${d}" class="${classe}"/></g>`;
  }).join('');
  let ref = '';
  if (reference) {
    ref = points.map((p, i) => (p.ref == null ? '' : `<line x1="${x(i) - pas / 2 + 2}" x2="${x(i) + pas / 2 - 2}" y1="${y(p.ref)}" y2="${y(p.ref)}" class="plafond-trait"/>`)).join('');
  }
  const legende = reference ? `<div class="legende"><span><i class="cle baton-cle"></i>Dépensé</span><span><i class="cle plafond-cle"></i>${reference === true ? 'Plafond' : reference}</span><span><i class="cle depasse-cle"></i>Dépassement</span></div>` : '';
  return cadre(`${grille}${barres}${ref}${etiquettesX(points, x)}`, titre, legende);
}

// Toucher ou survoler une marque affiche sa valeur sous le graphique.
function brancherLecture(racine) {
  const montrer = (ev) => {
    const g = ev.target.closest?.('.cible');
    if (!g) return;
    const fig = g.closest('.graphe');
    fig.querySelectorAll('.cible.active').forEach((x) => x.classList.remove('active'));
    g.classList.add('active');
    fig.querySelector('.lecture').textContent = g.dataset.tip;
  };
  racine.querySelectorAll('.graphe svg').forEach((svg) => {
    svg.addEventListener('pointerdown', montrer);
    svg.addEventListener('pointermove', montrer);
  });
}

// --- Vues ------------------------------------------------------------------------------

function tuile(libelle, valeur, detail = '') {
  return `<div class="tuile"><small>${libelle}</small><strong>${valeur}</strong>${detail ? `<em>${detail}</em>` : ''}</div>`;
}

export function vueStats(app, b, barre) {
  const courant = b.mois[b.mois.length - 1];
  const calculs = new Map(b.mois.map((m) => [m, C.calculMois(b, m)]));
  const parMois = b.mois.map((m) => ({ m, r: calculs.get(m) }));
  const controles = b.mois.filter((m) => b.controles?.[m]).map((m) => ({ m, v: b.controles[m].ecart }));
  const envs = [...b.enveloppes].sort((x, y) => x.ordre - y.ordre).map((e) => statsEnveloppe(b, e, calculs)).filter((s) => s.mois.length);
  const actives = envs.filter((s) => C.enveloppeActive(s.env, courant));
  const supprimees = envs.filter((s) => !C.enveloppeActive(s.env, courant));
  const ligneEnv = (s) => {
    const dernier = s.parMois[s.parMois.length - 1];
    return `<a class="ligne" href="#/b/${b.id}/stats/${s.env.id}">
      <span class="pastille">${esc(s.env.icone)}</span>
      <span class="ligne-corps"><div class="ligne-nom">${esc(s.env.nom)}</div>
      <div class="ligne-detail"><span>moy. ${euros(s.depenseMoyenne)}/mois</span>
        ${s.nbDepassements ? `<span class="alerte">${s.nbDepassements} dépassement${s.nbDepassements > 1 ? 's' : ''}</span>` : ''}
        ${s.nbSousZero ? `<span class="badge sous-zero">${s.nbSousZero}× sous zéro</span>` : ''}
        <span class="noisette${dernier.noisette < 0 ? ' negatif' : ''}">🌰 ${euros(dernier.noisette)}</span></div></span>
      <span class="chevron">${CHEVRON}</span></a>`;
  };
  const r = calculs.get(courant);
  const ecartMoyen = moyenne(controles.map((c) => c.v));
  app.innerHTML = `
    <header class="entete"><a class="btn-icone" href="#/b/${b.id}" aria-label="Retour au mois">${RETOUR}</a>
      <h1><span class="sur-titre">${esc(b.icone)} ${esc(b.nom)}</span>Statistiques</h1></header>
    <section class="carte tuiles">
      ${tuile('Mois suivis', String(b.mois.length), `depuis ${nomMois(b.mois[0]).toLowerCase()}`)}
      ${tuile('🌰 Stock', euros(r.stock), 'en direct')}
      ${tuile('Résultat moyen', euros(moyenne(parMois.map((x) => x.r.resultat))), 'par mois')}
      ${tuile('Écart avec la banque', controles.length ? euros(ecartMoyen) : '—', controles.length ? `moyenne sur ${controles.length} contrôle${controles.length > 1 ? 's' : ''}` : 'aucun contrôle encore')}
    </section>
    ${b.mois.length < 2 ? '<div class="bandeau">Les graphiques se remplissent au fil des mois.</div>' : ''}
    <section class="carte graphes">
      ${graphLigne(parMois.map((x) => ({ m: x.m, v: x.r.stock })), '🌰 Stock en fin de mois')}
      ${graphBarres(parMois.map((x) => ({ m: x.m, v: x.r.resultat })), 'Résultat par mois', { signe: true })}
      ${controles.length ? graphBarres(controles, 'Écart constaté avec la banque', { signe: true }) : ''}
      ${graphBarres(parMois.map((x) => ({ m: x.m, v: x.r.depenses, ref: x.r.revenus - x.r.incompressible })), 'Dépenses des enveloppes', { reference: 'Revenus − incompressibles' })}
    </section>
    <section class="carte"><h2 class="carte-titre">Enveloppes</h2><div class="liste">${actives.map(ligneEnv).join('') || '<div class="vide">Aucune enveloppe.</div>'}</div></section>
    ${supprimees.length ? `<section class="carte"><h2 class="carte-titre">Enveloppes supprimées</h2><div class="liste">${supprimees.map(ligneEnv).join('')}</div></section>` : ''}
    ${barre}`;
  brancherLecture(app);
}

export function vueStatsEnveloppe(app, b, envId, barre) {
  const env = b.enveloppes.find((e) => e.id === envId);
  if (!env) { location.hash = `#/b/${b.id}/stats`; return; }
  const s = statsEnveloppe(b, env);
  const fin = env.supprimeeDepuis ? ` · supprimée en ${nomMois(env.supprimeeDepuis).toLowerCase()}` : '';
  const plafonds = s.plafonds.map((p) => `<li>Depuis ${nomMois(p.m).toLowerCase()} : <b>${euros(p.montant)}</b></li>`).join('');
  app.innerHTML = `
    <header class="entete"><a class="btn-icone" href="#/b/${b.id}/stats" aria-label="Retour aux statistiques">${RETOUR}</a>
      <h1><span class="sur-titre">Statistiques · ${s.mois.length} mois${fin}</span>${esc(env.icone)} ${esc(env.nom)}</h1></header>
    <section class="carte tuiles">
      ${tuile('Dépense moyenne', `${euros(s.depenseMoyenne)}`, 'par mois')}
      ${tuile('Plafond dépassé', `${s.nbDepassements} fois`, s.nbDepassements ? `de ${euros(s.depassementMoyen)} en moyenne` : 'jamais')}
      ${tuile('Opérations', `${s.opsMoyenne.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} / mois`, s.maxOps ? `max ${s.maxOps.nbOps} en ${nomMois(s.maxOps.m).toLowerCase()}` : '')}
      ${tuile('Passée sous zéro', `${s.nbSousZero} mois`, s.nbSousZero ? 'au moins un jour dans le mois' : 'jamais')}
      ${tuile('Virements reçus', `${s.nbVirementsRecus}`, s.nbVirementsRecus ? `${euros(s.virementMoyen)} en moyenne` : 'aucun')}
    </section>
    ${(() => { const n = s.mois.length ? C.moisNegatifs(b, env, s.mois[s.mois.length - 1]) : 0; return n >= 2 ? `<div class="bandeau">🌰 négative depuis ${n} mois : le plafond est peut-être trop bas.</div>` : ''; })()}
    <section class="carte graphes">
      ${graphLigne(s.parMois.map((x) => ({ m: x.m, v: x.noisette })), '🌰 en fin de mois')}
      ${graphBarres(s.parMois.map((x) => ({ m: x.m, v: x.consomme, ref: x.plafond })), 'Dépense et plafond par mois', { reference: true })}
    </section>
    <section class="carte"><h2 class="carte-titre">Évolution du plafond</h2><ul class="liste-simple" style="padding:6px 18px 12px 36px">${plafonds}</ul></section>
    ${barre}`;
  brancherLecture(app);
}
