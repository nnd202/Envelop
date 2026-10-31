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

export function statsEnveloppe(b, env) {
  const mois = b.mois.filter((m) => C.enveloppeActive(env, m));
  const cache = new Map();
  const parMois = mois.map((m) => {
    const ops = C.operationsDe(b, m, env.id);
    const courantes = ops.filter((o) => !o.epargne);
    const versements = ops.filter((o) => o.epargne && !o.pause && (o.marge || /^Marge /.test(o.libelle || '')));
    const plafond = C.plafond(b, env.id, m);
    const consomme = -courantes.filter((o) => !o.pause).reduce((t, o) => t + o.montant, 0);
    return { m, plafond, consomme, nbOps: courantes.length, versements, noisette: C.noisette(b, env, m, cache) };
  });
  const depassements = parMois.filter((x) => x.consomme > x.plafond);
  const maxOps = parMois.reduce((best, x) => (x.nbOps > (best?.nbOps ?? -1) ? x : best), null);
  const versements = parMois.flatMap((x) => x.versements.map((o) => o.montant));
  const plafonds = [];
  for (const x of parMois) if (!plafonds.length || plafonds[plafonds.length - 1].montant !== x.plafond) plafonds.push({ m: x.m, montant: x.plafond });
  return {
    env,
    mois,
    parMois,
    depenseMoyenne: moyenne(parMois.map((x) => x.consomme)),
    nbDepassements: depassements.length,
    depassementMoyen: moyenne(depassements.map((x) => x.consomme - x.plafond)),
    opsMoyenne: parMois.length ? parMois.reduce((t, x) => t + x.nbOps, 0) / parMois.length : 0,
    maxOps,
    nbVersements: versements.length,
    versementMoyen: moyenne(versements),
    plafonds,
    moisNegatifs: mois.length ? C.moisNegatifs(b, env, mois[mois.length - 1], cache) : 0,
  };
}

// --- Graphiques ------------------------------------------------------------------------
// Une série par graphique, un seul axe, marques fines ; toucher une marque affiche sa valeur.

const L = 340;
const H = 150;
const M = { g: 8, d: 8, h: 14, b: 22 };

function echelle(valeurs) {
  let min = Math.min(0, ...valeurs);
  let max = Math.max(0, ...valeurs);
  if (min === max) max = min + 100;
  const pad = (max - min) * 0.08;
  if (min < 0) min -= pad;
  max += pad;
  return (v) => M.h + (H - M.h - M.b) * (1 - (v - min) / (max - min));
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
  const y = echelle(points.map((p) => p.v));
  const n = points.length;
  const x = (i) => (n === 1 ? L / 2 : M.g + 6 + (i * (L - M.g - M.d - 12)) / (n - 1));
  const chemin = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const zero = `<line x1="${M.g}" x2="${L - M.d}" y1="${y(0)}" y2="${y(0)}" class="zero"/>`;
  const pts = points.map((p, i) => `<g class="cible" data-tip="${esc(nomMois(p.m))} : ${esc(euros(p.v))}">
      <rect x="${x(i) - 14}" y="${M.h}" width="28" height="${H - M.h - M.b}" fill="transparent"/>
      <circle cx="${x(i)}" cy="${y(p.v)}" r="4" class="${p.v < 0 ? 'point neg' : 'point'}"/></g>`).join('');
  return cadre(`${zero}<path d="${chemin}" class="trait"/>${pts}${etiquettesX(points, x)}`, titre);
}

// Barres de dépense, plafond en pointillés ; une barre au-dessus du plafond est marquée « dépassement ».
export function graphBarres(points, titre, { reference = false, signe = false } = {}) {
  if (!points.length) return '';
  const y = echelle(points.flatMap((p) => [p.v, p.ref ?? 0]));
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
  const legende = reference ? '<div class="legende"><span><i class="cle baton-cle"></i>Dépensé</span><span><i class="cle plafond-cle"></i>Plafond</span><span><i class="cle depasse-cle"></i>Dépassement</span></div>' : '';
  return cadre(`<line x1="${M.g}" x2="${L - M.d}" y1="${y0}" y2="${y0}" class="zero"/>${barres}${ref}${etiquettesX(points, x)}`, titre, legende);
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
  const parMois = b.mois.map((m) => ({ m, r: C.calculMois(b, m) }));
  const versementsMarge = b.operations.filter((o) => o.epargne && o.marge).reduce((t, o) => t + o.montant, 0)
    + (b.reserve || []).reduce((t, r) => t + r.montant, 0);
  const envs = [...b.enveloppes].sort((x, y) => x.ordre - y.ordre).map((e) => statsEnveloppe(b, e)).filter((s) => s.mois.length);
  const actives = envs.filter((s) => C.enveloppeActive(s.env, courant));
  const supprimees = envs.filter((s) => !C.enveloppeActive(s.env, courant));
  const ligneEnv = (s) => {
    const dernier = s.parMois[s.parMois.length - 1];
    return `<a class="ligne" href="#/b/${b.id}/stats/${s.env.id}">
      <span class="pastille">${esc(s.env.icone)}</span>
      <span class="ligne-corps"><div class="ligne-nom">${esc(s.env.nom)}</div>
      <div class="ligne-detail"><span>moy. ${euros(s.depenseMoyenne)}/mois</span>
        ${s.nbDepassements ? `<span class="alerte">${s.nbDepassements} dépassement${s.nbDepassements > 1 ? 's' : ''}</span>` : ''}
        <span class="noisette${dernier.noisette < 0 ? ' negatif' : ''}">🌰 ${euros(dernier.noisette)}</span></div></span>
      <span class="chevron">${CHEVRON}</span></a>`;
  };
  const r = parMois[parMois.length - 1].r;
  app.innerHTML = `
    <header class="entete"><a class="btn-icone" href="#/b/${b.id}" aria-label="Retour au mois">${RETOUR}</a>
      <h1><span class="sur-titre">${esc(b.icone)} ${esc(b.nom)}</span>Statistiques</h1></header>
    <section class="carte tuiles">
      ${tuile('Mois suivis', String(b.mois.length), `depuis ${nomMois(b.mois[0]).toLowerCase()}`)}
      ${tuile('🌰 Épargne globale', euros(r.epargneGlobale))}
      ${tuile('Marge réelle moyenne', euros(moyenne(parMois.map((x) => x.r.margeReelle))))}
      ${tuile('Marges réparties', euros(versementsMarge), 'enveloppes et Réserve')}
    </section>
    ${b.mois.length < 2 ? '<div class="bandeau">Les graphiques se remplissent au fil des mois.</div>' : ''}
    <section class="carte graphes">
      ${graphLigne(parMois.map((x) => ({ m: x.m, v: x.r.epargneGlobale })), '🌰 Épargne globale en fin de mois')}
      ${graphBarres(parMois.map((x) => ({ m: x.m, v: x.r.margeReelle })), 'Marge réelle par mois', { signe: true })}
      ${graphBarres(parMois.map((x) => ({ m: x.m, v: x.r.consomme, ref: x.r.plafonds })), 'Dépensé dans les enveloppes', { reference: true })}
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
      ${tuile('Marge reçue', `${s.nbVersements} fois`, s.nbVersements ? `${euros(s.versementMoyen)} en moyenne` : 'jamais')}
    </section>
    ${s.moisNegatifs >= 2 ? `<div class="bandeau">🌰 négative depuis ${s.moisNegatifs} mois : le plafond est peut-être trop bas.</div>` : ''}
    <section class="carte graphes">
      ${graphLigne(s.parMois.map((x) => ({ m: x.m, v: x.noisette })), '🌰 en fin de mois')}
      ${graphBarres(s.parMois.map((x) => ({ m: x.m, v: x.consomme, ref: x.plafond })), 'Dépense et plafond par mois', { reference: true })}
    </section>
    <section class="carte"><h2 class="carte-titre">Évolution du plafond</h2><ul class="liste-simple" style="padding:6px 18px 12px 36px">${plafonds}</ul></section>
    ${barre}`;
  brancherLecture(app);
}
