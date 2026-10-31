// Interface d'Envelop (étape 1) : bases, mois en cours, enveloppes, opérations,
// charges fixes, revenus, plafonds et synthèse.
import * as C from './calc.js';
import * as S from './store.js';
import * as BA from './bascule.js';
import * as IT from './importtodo.js';
import * as EX from './export.js';
import { vueStats, vueStatsEnveloppe } from './stats.js';

const app = document.getElementById('app');
const couche = document.getElementById('couche');

// --- Outils ----------------------------------------------------------------------

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = (c, opts) => C.formatMontant(c, opts);
const negClass = (c) => (c < 0 ? ' negatif' : '');
const enCorrection = (b, m) => { const c = S.correctionEnCours(); return !!c && c.baseId === b.id && c.mois === m; };
const estLecture = (b, m) => m !== S.moisCourant(b) && !enCorrection(b, m);
const enCentimesTexte = (c) => (c ? (c / 100).toFixed(2).replace('.', ',') : '');

function nomMois(m, { court = false } = {}) {
  const [a, n] = m.split('-').map(Number);
  const t = new Date(a, n - 1, 1).toLocaleDateString('fr-FR', { month: court ? 'short' : 'long', year: 'numeric' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function jourCourt(date) {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
}

const ICONES = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  retour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  points: '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>',
  mois: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  plafonds: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M4 12h16M4 17h7"/><circle cx="17" cy="7" r="2"/><circle cx="14" cy="17" r="2"/></svg>',
  fixes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="10" width="14" height="10" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
  reglages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  bases: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19z"/></svg>',
};

function fleche(t) {
  const d = { hausse: 'M4 16l6-6 4 4 6-7M14 7h6v6', baisse: 'M4 8l6 6 4-4 6 7M14 17h6v-6', stable: 'M4 12h15M15 8l4 4-4 4' }[t];
  const titre = { hausse: 'en hausse', baisse: 'en baisse', stable: 'stable' }[t];
  return `<svg class="fleche ${t}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${titre} par rapport au mois précédent"><path d="${d}"/></svg>`;
}

function alerteNegative(n) {
  if (n < 2) return '';
  return `<span class="alerte">négatif depuis ${n} mois</span>`;
}

// --- Navigation ------------------------------------------------------------------

function route() {
  if (S.statut() !== 'ouvert') return vueAcces();
  if (location.hash === '#/reglages') return vueReglages();
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'b' && parts[1]) {
    const b = S.base(parts[1]);
    if (!b) return vueAccueil();
    if (parts[2] === 'e' && parts[3]) return vueEnveloppe(b, parts[3]);
    if (parts[2] === 'm' && parts[3] && b.mois.includes(parts[3])) {
      if (parts[4] === 'e' && parts[5]) return vueEnveloppe(b, parts[5], parts[3]);
      if (parts[4] === 'fixes') return vueFixes(b, parts[3]);
      return vueMois(b, parts[3]);
    }
    if (parts[2] === 'historique') return vueHistorique(b);
    if (parts[2] === 'stats') return parts[3] ? vueStatsEnveloppe(app, b, parts[3], barre(b, 'stats')) : vueStats(app, b, barre(b, 'stats'));
    if (parts[2] === 'fixes') return vueFixes(b);
    if (parts[2] === 'plafonds') return vuePlafonds(b);
    return vueMois(b);
  }
  return vueAccueil();
}

const aller = (h) => { if (location.hash === h) route(); else location.hash = h; };
window.addEventListener('hashchange', () => { fermer(); route(); window.scrollTo(0, 0); });

function barre(b, actif) {
  const lien = (cle, h, libelle) => `<a href="${h}" class="${actif === cle ? 'actif' : ''}">${ICONES[cle]}<span>${libelle}</span></a>`;
  return `<nav class="barre" aria-label="Navigation">
    ${lien('mois', `#/b/${b.id}`, 'Mois')}
    ${lien('plafonds', `#/b/${b.id}/plafonds`, 'Plafonds')}
    <button class="plus" data-action="nouvelle-op" aria-label="Ajouter une opération">${ICONES.plus}</button>
    ${lien('fixes', `#/b/${b.id}/fixes`, 'Fixes')}
    ${lien('stats', `#/b/${b.id}/stats`, 'Stats')}
  </nav>`;
}

// --- Vue : accueil -------------------------------------------------------------

function vueAccueil() {
  const liste = S.bases();
  const lignes = liste.map((b) => {
    const m = S.moisCourant(b);
    const n = C.enveloppesDuMois(b, m).length;
    return `<a class="ligne" href="#/b/${b.id}">
      <span class="pastille">${esc(b.icone)}</span>
      <span class="ligne-corps"><div class="ligne-nom">${esc(b.nom)}</div>
      <div class="ligne-detail">${nomMois(m)} · ${n} enveloppe${n > 1 ? 's' : ''}</div></span>
      <span class="chevron">${ICONES.chevron}</span></a>`;
  }).join('');
  const aDemo = liste.some((b) => b.nom === 'Démo');
  app.innerHTML = `
    <header class="entete"><h1><span class="sur-titre">Envelop</span>Mes budgets</h1>
      <button class="btn-icone" data-action="reglages" aria-label="Réglages">${ICONES.reglages}</button></header>
    ${rappelSauvegarde()}
    <section class="carte">
      <div class="liste">${lignes || '<div class="vide">Aucune base pour l\'instant.<br>Crée ta première base de budget.</div>'}
      <button class="ajouter" data-action="nouvelle-base">${ICONES.plus} Nouvelle base</button></div>
    </section>
    <button class="btn btn-principal btn-large" data-action="import-todo" style="margin-bottom:10px">Importer un mois depuis To Do</button>
    ${aDemo ? '' : '<button class="btn btn-second btn-large" data-action="demo">Essayer avec une base de démo</button>'}
    <p class="aide sur-fond" style="margin-top:16px;text-align:center">Tes données restent sur cet appareil, chiffrées par ton mot de passe.</p>`;
}

// --- Vue : mois en cours --------------------------------------------------------

function vueMois(b, mois) {
  const courant = S.moisCourant(b);
  const m = mois || courant;
  const passe = m !== courant;
  const lecture = estLecture(b, m);
  const corr = enCorrection(b, m);
  const r = C.calculMois(b, m);
  const calendrier = C.moisDe(new Date());
  const lienEnv = (id) => (passe ? `#/b/${b.id}/m/${m}/e/${id}` : `#/b/${b.id}/e/${id}`);
  const lienFixes = passe ? (corr ? `#/b/${b.id}/m/${m}/fixes` : 'javascript:void 0') : `#/b/${b.id}/fixes`;

  const enveloppes = r.enveloppes.map((e) => `
    <a class="ligne" href="${lienEnv(e.env.id)}">
      <span class="pastille">${esc(e.env.icone)}</span>
      <span class="ligne-corps">
        <div class="ligne-nom">${esc(e.env.nom)}${e.env.flechee ? '<span class="point-fleche" title="Épargne fléchée"></span>' : ''}</div>
        <div class="ligne-detail">
          <span class="reste${negClass(e.reste)}">${euros(e.reste)}</span>
          <span class="noisette${negClass(e.direct)}">🌰 ${euros(e.direct, { euro: false })} ${fleche(e.tendance)}</span>
          ${alerteNegative(e.moisNegatifs)}
          ${passe ? `<span>plafond ${euros(e.plafond)}</span>` : ''}
        </div>
      </span>
      <span class="chevron">${ICONES.chevron}</span>
    </a>`).join('');

  let bandeau = rappelSauvegarde();
  if (corr) {
    bandeau += `<div class="bandeau bandeau-action bandeau-correction">Correction de ${nomMois(m)} en cours : les opérations de ce mois sont modifiables.
      <button class="btn btn-principal" data-action="fin-correction">Terminer la correction…</button></div>`;
  } else if (lecture) {
    bandeau += `<div class="bandeau bandeau-action">Mois terminé, en lecture seule. <a href="#/b/${b.id}">Revenir à ${nomMois(courant)}</a>
      <button class="btn btn-second" data-action="corriger" data-mois="${m}">Corriger ce mois…</button></div>`;
  } else if (calendrier > m) {
    bandeau += `<div class="bandeau bandeau-action">${nomMois(calendrier)} a commencé.
      <button class="btn btn-principal" data-action="bascule">Basculer vers ${nomMois(C.moisSuivant(m))}</button></div>`;
  }

  const ecart = r.depassement > 0;
  app.innerHTML = `
    <header class="entete">
      <a class="btn-icone" href="#/" aria-label="Mes budgets">${ICONES.bases}</a>
      <h1><span class="sur-titre">${esc(b.icone)} ${esc(b.nom)}${corr ? ' · correction' : lecture ? ' · lecture seule' : ''}</span>${nomMois(m)}</h1>
      <button class="btn-icone" data-action="menu-mois" aria-label="Options">${ICONES.points}</button>
    </header>
    ${bandeau}
    <section class="carte">
      <h2 class="carte-titre">Enveloppes</h2>
      <div class="liste">${enveloppes || '<div class="vide">Aucune enveloppe. Ajoute la première ci-dessous.</div>'}
      ${passe ? '' : `<button class="ajouter" data-action="nouvelle-enveloppe">${ICONES.plus} Ajouter une enveloppe</button>`}</div>
    </section>

    <section class="carte">
      <div class="liste">
        <a class="ligne" href="${lienFixes}"><span class="pastille">🔒</span>
          <span class="ligne-corps"><div class="ligne-nom">Incompressible</div><div class="ligne-detail">${r.chargesOps.length} charge${r.chargesOps.length > 1 ? 's' : ''} fixe${r.chargesOps.length > 1 ? 's' : ''}</div></span>
          <span class="ligne-montant">${euros(r.incompressible)}</span><span class="chevron">${ICONES.chevron}</span></a>
        <a class="ligne" href="${lienFixes}"><span class="pastille">💶</span>
          <span class="ligne-corps"><div class="ligne-nom">Revenus</div><div class="ligne-detail">${r.revenusOps.length} entrée${r.revenusOps.length > 1 ? 's' : ''}</div></span>
          <span class="ligne-montant">${euros(r.revenus)}</span><span class="chevron">${ICONES.chevron}</span></a>
      </div>
    </section>

    <section class="carte">
      <h2 class="carte-titre">Synthèse du mois</h2>
      <div class="synthese">
        <div class="marges">
          <div class="marge"><small>Marge prévue</small><strong class="${negClass(r.margePrevue)}">${euros(r.margePrevue)}</strong></div>
          <div class="marge ${ecart ? 'ecart' : 'reelle'}"><small>Marge réelle</small><strong class="${negClass(r.margeReelle)}">${euros(r.margeReelle)}</strong>${ecart ? `<em>dépassement ${euros(r.depassement)}</em>` : ''}</div>
        </div>
        <div class="synthese-ligne"><span>Revenus</span><span>${euros(r.revenus)}</span></div>
        <div class="synthese-ligne"><span>Plafonds des enveloppes</span><span>− ${euros(r.plafonds)}</span></div>
        <div class="synthese-ligne"><span>Incompressible</span><span>− ${euros(r.incompressible)}</span></div>
        <div class="synthese-ligne"><span>Dépensé dans les enveloppes</span><span>${euros(r.consomme)}</span></div>
        ${r.reserve ? `<div class="synthese-ligne"><span>Réserve</span><span class="noisette">${euros(r.reserve)} ${fleche(r.reserveTendance)}</span></div>` : ''}
        <div class="synthese-ligne forte"><span>🌰 Épargne globale</span><span class="noisette${negClass(r.epargneGlobale)}">${euros(r.epargneGlobale)} ${fleche(r.epargneTendance)}</span></div>
        <div class="synthese-ligne"><span>Fin du mois précédent</span><span>${euros(r.epargneAcquise)}</span></div>
      </div>
    </section>
    ${barre(b, passe ? '' : 'mois')}`;
}

// --- Vue : historique des mois ----------------------------------------------------

function vueHistorique(b) {
  const courant = S.moisCourant(b);
  const lignes = [...b.mois].reverse().map((m) => {
    const r = C.calculMois(b, m);
    const enCours = m === courant;
    return `<a class="ligne" href="${enCours ? `#/b/${b.id}` : `#/b/${b.id}/m/${m}`}">
      <span class="pastille" style="font-size:1rem">${enCours ? '●' : '○'}</span>
      <span class="ligne-corps"><div class="ligne-nom">${nomMois(m)} ${enCours ? '<span class="badge recurrente">En cours</span>' : '<span class="badge">Lecture seule</span>'}</div>
      <div class="ligne-detail">${r.enveloppes.length} enveloppes · marge réelle ${euros(r.margeReelle)} · 🌰 ${euros(r.epargneGlobale)}</div></span>
      <span class="chevron">${ICONES.chevron}</span></a>`;
  }).join('');
  app.innerHTML = `
    <header class="entete">
      <a class="btn-icone" href="#/b/${b.id}" aria-label="Retour au mois">${ICONES.retour}</a>
      <h1><span class="sur-titre">${esc(b.icone)} ${esc(b.nom)}</span>Historique</h1>
    </header>
    <button class="btn btn-principal btn-large" data-action="bascule" style="margin-bottom:10px">Basculer vers ${nomMois(C.moisSuivant(courant))}</button>
    <button class="btn btn-second btn-large" data-action="import-ancien" style="margin-bottom:14px">Ajouter ${nomMois(C.moisPrecedent(b.mois[0])).toLowerCase()} depuis To Do</button>
    <section class="carte"><div class="liste">${lignes}</div></section>
    ${barre(b, '')}`;
}

// --- Vue : détail d'une enveloppe -------------------------------------------------

function vueEnveloppe(b, envId, mois) {
  const m = mois || S.moisCourant(b);
  const passe = m !== S.moisCourant(b);
  const lecture = estLecture(b, m);
  const r = C.calculMois(b, m);
  const e = r.enveloppes.find((x) => x.env.id === envId);
  if (!e) return aller(passe ? `#/b/${b.id}/m/${m}` : `#/b/${b.id}`);
  const ops = [...e.ops].sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  const lignes = ops.map((o) => `
    <${lecture ? 'div' : 'button'} class="ligne${o.pause ? ' en-pause' : ''}" ${lecture ? '' : `data-action="modifier-op" data-id="${o.id}"`}>
      <span class="ligne-corps">
        <div class="ligne-nom">${esc(o.libelle || jourCourt(o.date))}</div>
        <div class="ligne-detail">${o.libelle ? `<span>${jourCourt(o.date)}</span>` : ''}
          ${o.pause ? '<span class="badge pause">En pause</span>' : ''}
          ${o.epargne ? '<span class="badge epargne">🌰 Épargne</span>' : ''}
          ${o.recurrente ? '<span class="badge recurrente">Récurrente</span>' : ''}</div>
      </span>
      <span class="ligne-montant" style="color:${o.montant > 0 ? 'var(--hausse)' : 'inherit'}">${euros(o.montant, { signe: true })}</span>
    </${lecture ? 'div' : 'button'}>`).join('');

  app.innerHTML = `
    <header class="entete">
      <a class="btn-icone" href="${passe ? `#/b/${b.id}/m/${m}` : `#/b/${b.id}`}" aria-label="Retour au mois">${ICONES.retour}</a>
      <h1><span class="sur-titre">${nomMois(m)}${lecture ? ' · lecture seule' : passe ? ' · correction' : ''}</span>&nbsp;</h1>
      ${passe ? '' : `<button class="btn-icone" data-action="modifier-enveloppe" data-id="${e.env.id}" aria-label="Modifier l'enveloppe">${ICONES.points}</button>`}
    </header>
    <section class="carte heros">
      <span class="pastille">${esc(e.env.icone)}</span>
      <h2>${esc(e.env.nom)}</h2>
      <div class="grand${negClass(e.reste)}">${euros(e.reste)}</div>
      <div class="sous">reste ${passe ? 'en fin de mois' : 'ce mois-ci'} sur ${euros(e.plafond)} de plafond</div>
      <div class="heros-chiffres">
        <div>🌰 fin du mois dernier<b>${euros(e.acquise)}</b></div>
        <div>🌰 ${passe ? 'fin de ce mois' : 'en direct'}<b class="noisette${negClass(e.direct)}">${euros(e.direct)} ${fleche(e.tendance)}</b></div>
      </div>
      ${e.moisNegatifs >= 2 ? `<div style="margin-top:10px">${alerteNegative(e.moisNegatifs)}</div>` : ''}
    </section>
    <section class="carte">
      <h2 class="carte-titre">Opérations</h2>
      <div class="liste">${lignes || '<div class="vide">Aucune opération ce mois-ci.</div>'}
      ${lecture ? '' : `<button class="ajouter" data-action="nouvelle-op" data-cible="${e.env.id}" data-mois="${m}">${ICONES.plus} Ajouter une opération</button>`}</div>
    </section>
    ${barre(b, '')}`;
}

// --- Vue : charges fixes et revenus ---------------------------------------------

function vueFixes(b, mois) {
  const m = mois || S.moisCourant(b);
  if (estLecture(b, m)) return aller(`#/b/${b.id}/m/${m}`);
  const passe = m !== S.moisCourant(b);
  const r = C.calculMois(b, m);
  const ligne = (o) => `
    <button class="ligne${o.pause ? ' en-pause' : ''}" data-action="modifier-op" data-id="${o.id}">
      <span class="ligne-corps"><div class="ligne-nom">${esc(o.libelle || 'Sans nom')}</div>
        <div class="ligne-detail">${o.pause ? '<span class="badge pause">En pause</span>' : ''}${o.recurrente ? '<span class="badge recurrente">Récurrente</span>' : '<span class="badge">Ce mois-ci</span>'}</div></span>
      <span class="ligne-montant">${euros(o.montant)}</span>
    </button>`;
  app.innerHTML = `
    <header class="entete">${passe ? `<a class="btn-icone" href="#/b/${b.id}/m/${m}" aria-label="Retour au mois">${ICONES.retour}</a>` : ''}<h1><span class="sur-titre">${nomMois(m)}${passe ? ' · correction' : ''}</span>Fixes</h1></header>
    <section class="carte">
      <h2 class="carte-titre">🔒 Incompressible · ${euros(r.incompressible)}</h2>
      <div class="liste">${r.chargesOps.map(ligne).join('') || '<div class="vide">Aucune charge fixe.</div>'}
      <button class="ajouter" data-action="nouvelle-op" data-cible="charge" data-mois="${m}">${ICONES.plus} Ajouter une charge fixe</button></div>
    </section>
    <section class="carte">
      <h2 class="carte-titre">💶 Revenus · ${euros(r.revenus)}</h2>
      <div class="liste">${r.revenusOps.map(ligne).join('') || '<div class="vide">Aucun revenu.</div>'}
      <button class="ajouter" data-action="nouvelle-op" data-cible="revenu" data-mois="${m}">${ICONES.plus} Ajouter un revenu</button></div>
    </section>
    <p class="aide sur-fond" style="text-align:center">Les opérations récurrentes seront reportées automatiquement au mois suivant. Une opération en pause reste visible mais ne compte pas.</p>
    ${barre(b, passe ? '' : 'fixes')}`;
}

// --- Vue : plafonds --------------------------------------------------------------

function vuePlafonds(b) {
  const m = S.moisCourant(b);
  const envs = C.enveloppesDuMois(b, m);
  const total = envs.reduce((t, e) => t + C.plafond(b, e.id, m), 0);
  const lignes = envs.map((e, i) => `
    <div class="plafond-ligne">
      <div class="ordre">
        <button data-action="monter" data-id="${e.id}" ${i === 0 ? 'disabled' : ''} aria-label="Monter">▲</button>
        <button data-action="descendre" data-id="${e.id}" ${i === envs.length - 1 ? 'disabled' : ''} aria-label="Descendre">▼</button>
      </div>
      <span class="pastille" style="width:36px;height:36px;font-size:1.1rem;border-radius:12px">${esc(e.icone)}</span>
      <span class="ligne-nom">${esc(e.nom)}</span>
      <input inputmode="decimal" data-plafond="${e.id}" value="${enCentimesTexte(C.plafond(b, e.id, m))}" placeholder="0,00" aria-label="Plafond de ${esc(e.nom)}">
    </div>`).join('');
  app.innerHTML = `
    <header class="entete"><h1><span class="sur-titre">${nomMois(m)}</span>Plafonds</h1></header>
    <section class="carte">
      ${lignes || '<div class="vide">Aucune enveloppe.</div>'}
      <div class="synthese"><div class="synthese-ligne forte"><span>Total des plafonds</span><span id="total-plafonds">${euros(total)}</span></div></div>
    </section>
    <p class="aide sur-fond" style="text-align:center">Un plafond modifié vaut pour ${nomMois(m)} et les mois suivants, jamais pour les mois passés.</p>
    ${envs.length ? '<button class="btn btn-principal btn-large" data-action="enregistrer-plafonds">Enregistrer les plafonds</button>' : ''}
    ${barre(b, 'plafonds')}`;
}

// --- Fenêtres ---------------------------------------------------------------------

// Zone visible réelle : suit le repli des barres du navigateur et l'ouverture du clavier.
function majZoneVisible() {
  const vv = window.visualViewport;
  const racine = document.documentElement.style;
  racine.setProperty('--vv-h', `${vv ? vv.height : window.innerHeight}px`);
  racine.setProperty('--vv-top', `${vv ? vv.offsetTop : 0}px`);
}
window.visualViewport?.addEventListener('resize', majZoneVisible);
window.visualViewport?.addEventListener('scroll', majZoneVisible);
window.addEventListener('resize', majZoneVisible);
majZoneVisible();

function ouvrir(html, initialiser) {
  majZoneVisible();
  couche.innerHTML = `<div class="fenetre" role="dialog" aria-modal="true"><div class="poignee"></div>${html}</div>`;
  couche.hidden = false;
  document.body.classList.add('fige');
  initialiser?.(couche.firstElementChild);
}

function fermer() {
  couche.hidden = true;
  couche.innerHTML = '';
  document.body.classList.remove('fige');
}

couche.addEventListener('click', (ev) => { if (ev.target === couche) fermer(); });

function confirmer({ titre, texte, bouton = 'Confirmer', danger = true }) {
  return new Promise((ok) => {
    ouvrir(`<h2>${titre}</h2><p>${texte}</p>
      <div class="actions"><button class="btn btn-second" data-r="0">Annuler</button>
      <button class="btn ${danger ? 'btn-danger' : 'btn-principal'}" data-r="1">${bouton}</button></div>`, (f) => {
      f.addEventListener('click', (ev) => {
        const r = ev.target.closest('[data-r]');
        if (!r) return;
        fermer();
        ok(r.dataset.r === '1');
      });
    });
  });
}

function puce(nom, libelle, on) {
  return `<button type="button" class="puce${on ? ' on' : ''}" data-puce="${nom}" aria-pressed="${on}">${libelle}</button>`;
}

function basculerPuces(f, etat, apres) {
  f.querySelectorAll('[data-puce]').forEach((p) => p.addEventListener('click', () => {
    const k = p.dataset.puce;
    etat[k] = !etat[k];
    p.classList.toggle('on', etat[k]);
    p.setAttribute('aria-pressed', etat[k]);
    apres?.(k);
  }));
}

// Opération : enveloppe (montant signé), charge fixe ou revenu (montant positif).
function fenetreOperation(b, { cible, op, mois }) {
  const m = op?.mois || mois || S.moisCourant(b);
  const envs = C.enveloppesDuMois(b, m);
  const existante = !!op;
  cible = op?.cible || cible || envs[0]?.id;
  if (!cible) return alerte('Ajoute d\'abord une enveloppe.');
  const estFixe = cible === 'charge' || cible === 'revenu';
  const aujourdHui = new Date().toISOString().slice(0, 10);
  const dateDefaut = aujourdHui.startsWith(m) ? aujourdHui : `${m}-01`;
  const etat = {
    positif: op ? op.montant > 0 && !estFixe : false,
    recurrente: op ? op.recurrente : estFixe,
    pause: op ? op.pause : false,
    epargne: op ? op.epargne : false,
  };
  const [an, mo] = m.split('-').map(Number);
  const dernier = new Date(an, mo, 0).getDate();
  const titre = existante ? 'Modifier' : cible === 'charge' ? 'Nouvelle charge fixe' : cible === 'revenu' ? 'Nouveau revenu' : 'Nouvelle opération';

  ouvrir(`
    <h2>${titre}</h2>
    ${!estFixe && !existante ? `<label class="champ"><span>Enveloppe</span><select name="cible">${envs.map((e) => `<option value="${e.id}" ${e.id === cible ? 'selected' : ''}>${esc(e.icone)} ${esc(e.nom)}</option>`).join('')}</select></label>` : ''}
    <label class="champ" data-champ="montant"><span>Montant</span>
      <div class="montant-ligne">
        ${estFixe ? '' : `<button type="button" class="signe${etat.positif ? ' positif' : ''}" data-signe aria-label="Changer le signe">${etat.positif ? '+' : '−'}</button>`}
        <input name="montant" inputmode="decimal" placeholder="0,00" value="${op ? enCentimesTexte(Math.abs(op.montant)) : ''}" autocomplete="off">
      </div></label>
    <label class="champ"><span>Libellé ${estFixe ? '' : '(facultatif)'}</span><input name="libelle" value="${esc(op?.libelle || '')}" placeholder="${estFixe ? (cible === 'charge' ? 'Loyer, assurance…' : 'Salaire…') : 'Carrefour, plein…'}" autocomplete="off"></label>
    ${estFixe ? '' : `<label class="champ"><span>Date</span><input name="date" type="date" min="${m}-01" max="${m}-${String(dernier).padStart(2, '0')}" value="${op?.date || dateDefaut}"></label>`}
    <div class="puces">
      ${estFixe ? '' : puce('positif', '+ Positif', etat.positif)}
      ${puce('recurrente', '↻ Récurrente', etat.recurrente)}
      ${puce('pause', 'Ⅱ En pause', etat.pause)}
      ${estFixe ? '' : puce('epargne', '🌰 Épargne', etat.epargne)}
    </div>
    <p class="aide" data-aide></p>
    <div class="actions">
      ${existante ? '<button class="btn btn-danger" data-action-f="supprimer">Supprimer</button>' : '<button class="btn btn-second" data-action-f="annuler">Annuler</button>'}
      <button class="btn btn-principal" data-action-f="enregistrer">Enregistrer</button>
    </div>`, (f) => {
    const signe = f.querySelector('[data-signe]');
    const aide = f.querySelector('[data-aide]');
    const majAide = () => {
      const t = [];
      if (etat.pause) t.push('En pause : visible, mais exclue des calculs.');
      if (etat.epargne) t.push('Épargne : va directement dans la 🌰, sans toucher au reste du mois.');
      if (etat.recurrente) t.push('Récurrente : reportée au mois suivant.');
      aide.textContent = t.join(' ');
    };
    const majSigne = () => {
      if (!signe) return;
      signe.textContent = etat.positif ? '+' : '−';
      signe.classList.toggle('positif', etat.positif);
      f.querySelector('[data-puce="positif"]').classList.toggle('on', etat.positif);
    };
    signe?.addEventListener('click', () => { etat.positif = !etat.positif; majSigne(); });
    basculerPuces(f, etat, (k) => { if (k === 'positif') majSigne(); majAide(); });
    majAide();
    if (!existante) setTimeout(() => f.querySelector('[name=montant]').focus(), 60);

    f.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-action-f]')?.dataset.actionF;
      if (a === 'annuler') return fermer();
      if (a === 'supprimer') {
        if (await confirmer({ titre: 'Supprimer cette opération ?', texte: 'Elle disparaîtra de ce mois et les calculs seront mis à jour.', bouton: 'Supprimer' })) {
          S.supprimerOperation(b, op.id);
          route();
        }
        return;
      }
      if (a !== 'enregistrer') return;
      const brut = C.lireMontant(f.querySelector('[name=montant]').value);
      const champ = f.querySelector('[data-champ=montant]');
      if (brut == null || brut === 0) { champ.classList.add('erreur'); return; }
      const libelle = f.querySelector('[name=libelle]').value.trim();
      const montant = estFixe ? Math.abs(brut) : (etat.positif ? 1 : -1) * Math.abs(brut);
      S.enregistrerOperation(b, {
        id: op?.id,
        mois: m,
        cible: f.querySelector('[name=cible]')?.value || cible,
        date: f.querySelector('[name=date]')?.value || op?.date || `${m}-01`,
        libelle,
        montant,
        recurrente: !!etat.recurrente,
        pause: !!etat.pause,
        epargne: !estFixe && !!etat.epargne,
      });
      fermer();
      route();
    });
  });
}

function fenetreEnveloppe(b, envId) {
  const m = S.moisCourant(b);
  const env = envId ? b.enveloppes.find((e) => e.id === envId) : null;
  const etat = { flechee: env ? !!env.flechee : false };
  const nouvelle = !env;
  const departModifiable = nouvelle || env.creeeLe === b.mois[0];
  ouvrir(`
    <h2>${nouvelle ? 'Nouvelle enveloppe' : 'Modifier l\'enveloppe'}</h2>
    <div class="deux">
      <label class="champ"><span>Icône</span><input name="icone" value="${esc(env?.icone || '')}" placeholder="🛒" maxlength="4" style="text-align:center;font-size:1.4rem;padding:9px 6px"></label>
      <label class="champ" data-champ="nom"><span>Nom</span><input name="nom" value="${esc(env?.nom || '')}" placeholder="Courses" autocomplete="off"></label>
    </div>
    ${nouvelle ? '<label class="champ"><span>Plafond mensuel</span><input name="plafond" inputmode="decimal" placeholder="0,00"></label>' : ''}
    ${departModifiable ? `<label class="champ"><span>🌰 de départ (épargne déjà accumulée)</span><input name="depart" inputmode="decimal" placeholder="0,00" value="${env ? enCentimesTexte(env.noisetteDepart) : ''}"></label>
      <p class="aide">Mets un signe moins si l'enveloppe part en négatif.</p>` : ''}
    <div class="puces">${puce('flechee', '● Épargne fléchée', etat.flechee)}</div>
    <p class="aide">Repère visuel pour une épargne à ne pas toucher (réparations, projet…).</p>
    <div class="actions">
      ${nouvelle ? '<button class="btn btn-second" data-action-f="annuler">Annuler</button>' : '<button class="btn btn-danger" data-action-f="supprimer">Supprimer</button>'}
      <button class="btn btn-principal" data-action-f="enregistrer">Enregistrer</button>
    </div>`, (f) => {
    basculerPuces(f, etat);
    if (nouvelle) setTimeout(() => f.querySelector('[name=nom]').focus(), 60);
    f.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-action-f]')?.dataset.actionF;
      if (a === 'annuler') return fermer();
      if (a === 'supprimer') {
        const ok = await confirmer({
          titre: `Supprimer « ${esc(env.nom)} » ?`,
          texte: `Elle disparaîtra de ${nomMois(m)} et des mois suivants, avec ses opérations de ce mois-ci. Les mois passés la gardent.`,
          bouton: 'Supprimer',
        });
        if (ok) { S.supprimerEnveloppe(b, env.id); aller(`#/b/${b.id}`); }
        return;
      }
      if (a !== 'enregistrer') return;
      const nom = f.querySelector('[name=nom]').value.trim();
      if (!nom) { f.querySelector('[data-champ=nom]').classList.add('erreur'); return; }
      const icone = f.querySelector('[name=icone]').value.trim() || '✉️';
      const departTxt = f.querySelector('[name=depart]')?.value;
      const depart = departTxt ? C.lireMontant(departTxt) ?? 0 : 0;
      if (nouvelle) {
        const plafond = Math.abs(C.lireMontant(f.querySelector('[name=plafond]').value) ?? 0);
        S.creerEnveloppe(b, { nom, icone, plafond, noisetteDepart: depart, flechee: etat.flechee });
      } else {
        const champs = { nom, icone, flechee: etat.flechee };
        if (departModifiable) champs.noisetteDepart = depart;
        S.modifierEnveloppe(b, env.id, champs);
      }
      fermer();
      route();
    });
  });
}

function fenetreBase(b) {
  const nouvelle = !b;
  const m = C.moisDe(new Date());
  ouvrir(`
    <h2>${nouvelle ? 'Nouvelle base' : 'Modifier la base'}</h2>
    <div class="deux">
      <label class="champ"><span>Icône</span><input name="icone" value="${esc(b?.icone || '')}" placeholder="💶" maxlength="4" style="text-align:center;font-size:1.4rem;padding:9px 6px"></label>
      <label class="champ" data-champ="nom"><span>Nom</span><input name="nom" value="${esc(b?.nom || '')}" placeholder="Perso, Couple…" autocomplete="off"></label>
    </div>
    ${nouvelle ? `<label class="champ"><span>Premier mois</span><input name="mois" type="month" value="${m}"></label>` : ''}
    <div class="actions">
      ${nouvelle ? '<button class="btn btn-second" data-action-f="annuler">Annuler</button>' : '<button class="btn btn-danger" data-action-f="supprimer">Supprimer</button>'}
      <button class="btn btn-principal" data-action-f="enregistrer">Enregistrer</button>
    </div>`, (f) => {
    f.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-action-f]')?.dataset.actionF;
      if (a === 'annuler') return fermer();
      if (a === 'supprimer') {
        const ok = await confirmer({
          titre: `Supprimer la base « ${esc(b.nom)} » ?`,
          texte: 'Tous ses mois, enveloppes et opérations seront effacés de cet appareil. Cette action est définitive.',
          bouton: 'Supprimer définitivement',
        });
        if (ok) { await S.prendreCopie(`Avant suppression de la base ${b.nom}`); S.supprimerBase(b.id); aller('#/'); }
        return;
      }
      if (a !== 'enregistrer') return;
      const nom = f.querySelector('[name=nom]').value.trim();
      if (!nom) { f.querySelector('[data-champ=nom]').classList.add('erreur'); return; }
      const icone = f.querySelector('[name=icone]').value.trim() || '💶';
      if (nouvelle) {
        const nb = S.creerBase({ nom, icone, mois: f.querySelector('[name=mois]').value || m });
        fermer();
        aller(`#/b/${nb.id}`);
      } else {
        S.modifier(() => Object.assign(b, { nom, icone }));
        fermer();
        route();
      }
    });
  });
}

function fenetreMenu(b) {
  const courant = S.moisCourant(b);
  const annulable = BA.annulable(b);
  ouvrir(`
    <h2>${esc(b.icone)} ${esc(b.nom)}</h2>
    <div class="liste menu">
      <button class="ligne" data-m="historique"><span class="ligne-corps"><div class="ligne-nom">Historique des mois</div><div class="ligne-detail">${b.mois.length} mois</div></span><span class="chevron">${ICONES.chevron}</span></button>
      <button class="ligne" data-m="bascule"><span class="ligne-corps"><div class="ligne-nom">Basculer vers ${nomMois(C.moisSuivant(courant))}</div><div class="ligne-detail">Clôture ${nomMois(courant)} et répartit sa marge</div></span><span class="chevron">${ICONES.chevron}</span></button>
      ${annulable ? `<button class="ligne" data-m="annuler"><span class="ligne-corps"><div class="ligne-nom">Annuler la bascule vers ${nomMois(courant)}</div><div class="ligne-detail">Possible tant que rien n'a été saisi dans ce mois</div></span></button>` : ''}
      <button class="ligne" data-m="base"><span class="ligne-corps"><div class="ligne-nom">Modifier ou supprimer la base</div></span><span class="chevron">${ICONES.chevron}</span></button>
    </div>`, (f) => {
    f.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-m]')?.dataset.m;
      if (a === 'historique') { fermer(); return aller(`#/b/${b.id}/historique`); }
      if (a === 'bascule') return fenetreBascule(b);
      if (a === 'base') return fenetreBase(b);
      if (a === 'annuler') {
        const ok = await confirmer({
          titre: `Annuler la bascule vers ${nomMois(courant)} ?`,
          texte: `${nomMois(courant)} sera retiré, avec les opérations reportées et la répartition de la marge. ${nomMois(C.moisPrecedent(courant))} redevient le mois en cours.`,
          bouton: 'Annuler la bascule',
        });
        if (ok) { S.annulerBascule(b); aller(`#/b/${b.id}`); route(); }
      }
    });
  });
}

function fenetreBascule(b) {
  const p = BA.preparer(b);
  const etat = { reserve: 0, rep: {} };
  const lignes = p.enveloppes.map((e) => `
    <div class="plafond-ligne">
      <span class="pastille" style="width:34px;height:34px;font-size:1rem;border-radius:11px">${esc(e.icone)}</span>
      <span class="ligne-nom">${esc(e.nom)}</span>
      <input inputmode="decimal" data-rep="${e.id}" placeholder="0,00" aria-label="Part pour ${esc(e.nom)}">
    </div>`).join('');
  const nbRec = p.recurrentes.length;
  ouvrir(`
    <h2>Basculer vers ${nomMois(p.suivant)}</h2>
    <p>${nomMois(p.mois)} passera en lecture seule. ${nbRec} opération${nbRec > 1 ? 's' : ''} récurrente${nbRec > 1 ? 's' : ''} ${nbRec > 1 ? 'seront reportées' : 'sera reportée'}, et les dépenses repartent de zéro.</p>
    ${p.marge > 0 ? `
      <div class="marge" style="margin-bottom:12px"><small>Marge réelle de ${nomMois(p.mois)} à répartir</small><strong>${euros(p.marge)}</strong></div>
      <p class="aide" style="margin:0 0 10px">Chaque part versée à une enveloppe est inscrite au 1er ${nomMois(p.suivant).toLowerCase()} comme une opération 🌰 Épargne : elle remonte sa 🌰 sans toucher au reste du mois. La Réserve compte dans l'épargne globale.</p>
      <div class="carte" style="box-shadow:none;border:1.5px solid var(--ligne)">
        <div class="plafond-ligne"><span class="pastille" style="width:34px;height:34px;font-size:1rem;border-radius:11px">🏦</span><span class="ligne-nom">Réserve</span><input inputmode="decimal" data-reserve placeholder="0,00" aria-label="Part pour la Réserve"></div>
        ${lignes}
      </div>
      <div class="synthese-ligne forte"><span>Reste à répartir</span><span data-reste>${euros(p.marge)}</span></div>
      <button class="btn btn-second btn-large" data-b="tout-reserve" style="margin-top:8px">Tout le reste en Réserve</button>`
    : `<div class="bandeau" style="border:1.5px solid var(--ligne)">Pas de marge à répartir : la marge réelle de ${nomMois(p.mois)} est de ${euros(p.margeReelle)}.</div>`}
    <div class="actions">
      <button class="btn btn-second" data-b="annuler">Annuler</button>
      <button class="btn btn-principal" data-b="valider" ${p.marge > 0 ? 'disabled' : ''}>Basculer</button>
    </div>`, (f) => {
    const valider = f.querySelector('[data-b=valider]');
    const lire = () => {
      let total = 0;
      let ok = true;
      etat.rep = {};
      f.querySelectorAll('[data-rep]').forEach((i) => {
        const v = i.value.trim() === '' ? 0 : C.lireMontant(i.value);
        if (v == null || v < 0) { ok = false; i.style.borderColor = 'var(--baisse)'; return; }
        i.style.borderColor = '';
        if (v) etat.rep[i.dataset.rep] = v;
        total += v;
      });
      const ri = f.querySelector('[data-reserve]');
      if (ri) {
        const v = ri.value.trim() === '' ? 0 : C.lireMontant(ri.value);
        if (v == null || v < 0) { ok = false; ri.style.borderColor = 'var(--baisse)'; } else { ri.style.borderColor = ''; etat.reserve = v; total += v; }
      }
      const reste = p.marge - total;
      const r = f.querySelector('[data-reste]');
      if (r) { r.textContent = euros(reste); r.classList.toggle('negatif', reste !== 0); }
      valider.disabled = !ok || reste !== 0;
      return reste;
    };
    f.addEventListener('input', lire);
    f.addEventListener('click', async (ev) => {
      const a = ev.target.closest('[data-b]')?.dataset.b;
      if (a === 'annuler') return fermer();
      if (a === 'tout-reserve') {
        const ri = f.querySelector('[data-reserve]');
        const reste = lire();
        const actuel = ri.value.trim() === '' ? 0 : (C.lireMontant(ri.value) ?? 0);
        ri.value = enCentimesTexte(Math.max(0, actuel + reste));
        lire();
        return;
      }
      if (a !== 'valider' || valider.disabled) return;
      if (p.marge > 0 && lire() !== 0) return;
      const suivant = S.basculer(b, { repartition: etat.rep, reserve: p.marge > 0 ? etat.reserve : 0 });
      fermer();
      aller(`#/b/${b.id}`);
      route();
      void suivant;
    });
  });
}

function alerte(texte) {
  ouvrir(`<h2>Envelop</h2><p>${texte}</p><div class="actions"><button class="btn btn-principal" data-r>OK</button></div>`, (f) => {
    f.querySelector('[data-r]').addEventListener('click', fermer);
  });
}

// --- Accès : création du mot de passe, déverrouillage ---------------------------

function vueAcces() {
  const st = S.statut();
  document.querySelector('.toast')?.remove();
  document.body.classList.remove('fige');
  couche.hidden = true;
  if (st === 'verrouille') {
    app.innerHTML = `
      <header class="entete"><h1><span class="sur-titre">Envelop</span>Déverrouiller</h1></header>
      <form class="carte acces" data-form="deverrouiller">
        <div class="cadenas">🔒</div>
        <label class="champ"><span>Mot de passe</span><input name="mdp" type="password" autocomplete="current-password" required></label>
        <p class="message-erreur" data-erreur hidden>Mot de passe incorrect.</p>
        <button class="btn btn-principal btn-large">Déverrouiller</button>
        <button type="button" class="lien" data-action-acces="oubli">Mot de passe oublié ?</button>
      </form>`;
    setTimeout(() => app.querySelector('[name=mdp]')?.focus(), 80);
    return;
  }
  const migration = st === 'clair';
  app.innerHTML = `
    <header class="entete"><h1><span class="sur-titre">Envelop</span>Protège tes données</h1></header>
    <form class="carte acces" data-form="creer">
      <p>${migration ? 'Tes données vont être chiffrées sur cet appareil.' : 'Tes données seront chiffrées sur cet appareil.'} Personne ne peut les lire sans ce mot de passe, pas même Envelop.</p>
      <label class="champ"><span>Mot de passe (8 caractères minimum)</span><input name="mdp" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="champ"><span>Confirmation</span><input name="mdp2" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="coche"><input type="checkbox" name="ok" required> J'ai rangé ce mot de passe dans mon gestionnaire. Sans lui, mes données et mes sauvegardes sont perdues.</label>
      <p class="message-erreur" data-erreur hidden></p>
      <button class="btn btn-principal btn-large">Créer et chiffrer</button>
    </form>`;
}

app.addEventListener('submit', async (ev) => {
  const form = ev.target.closest('[data-form]');
  if (!form) return;
  ev.preventDefault();
  const erreur = form.querySelector('[data-erreur]');
  const bouton = form.querySelector('.btn-principal');
  const mdp = form.querySelector('[name=mdp]').value;
  bouton.disabled = true;
  if (form.dataset.form === 'deverrouiller') {
    bouton.textContent = 'Vérification…';
    const ok = await S.deverrouiller(mdp);
    if (ok) return route();
    erreur.hidden = false;
    bouton.disabled = false;
    bouton.textContent = 'Déverrouiller';
    return;
  }
  if (form.dataset.form === 'creer') {
    const mdp2 = form.querySelector('[name=mdp2]').value;
    if (mdp !== mdp2) {
      erreur.textContent = 'Les deux mots de passe ne sont pas identiques.';
      erreur.hidden = false;
      bouton.disabled = false;
      return;
    }
    bouton.textContent = 'Chiffrement…';
    await S.creerMotDePasse(mdp);
    route();
  }
});

app.addEventListener('click', async (ev) => {
  if (ev.target.closest('[data-action-acces]')?.dataset.actionAcces !== 'oubli') return;
  ouvrir(`<h2>Mot de passe oublié</h2>
    <p>Il n'existe aucun moyen de retrouver tes données sans ton mot de passe : elles sont chiffrées, et rien n'est envoyé nulle part.</p>
    <p>Tu peux tout effacer sur cet appareil et repartir de zéro, puis restaurer une sauvegarde avec le mot de passe qui la protégeait.</p>
    <label class="champ"><span>Pour confirmer, tape EFFACER</span><input name="conf" autocomplete="off"></label>
    <div class="actions"><button class="btn btn-second" data-r="0">Annuler</button><button class="btn btn-danger" data-r="1">Tout effacer</button></div>`, (f) => {
    f.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (r === '0') return fermer();
      if (r === '1' && f.querySelector('[name=conf]').value.trim().toUpperCase() === 'EFFACER') {
        S.toutEffacer();
        fermer();
        route();
      }
    });
  });
});

// Verrouillage automatique après 5 minutes en arrière-plan.
let cacheLe = 0;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cacheLe = Date.now(); return; }
  if (cacheLe && Date.now() - cacheLe > 5 * 60 * 1000 && S.statut() === 'ouvert' && !S.correctionEnCours()) {
    S.verrouiller();
    route();
  }
});

// --- Sauvegarde ------------------------------------------------------------------

function joursDepuis(iso) {
  return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 864e5) : null;
}

const ilYA = (j) => (j === 0 ? 'aujourd\'hui' : j === 1 ? 'hier' : `il y a ${j} jours`);

function rappelSauvegarde() {
  const r = S.reglages();
  if (!r.rappelJours || !S.bases().length) return '';
  if (r.rappelApres && new Date(r.rappelApres) > new Date()) return '';
  const j = joursDepuis(r.derniereSauvegarde);
  if (j !== null && j < r.rappelJours) return '';
  const texte = j === null ? 'Aucune sauvegarde pour l\'instant.' : `Dernière sauvegarde ${ilYA(j)}.`;
  return `<div class="bandeau bandeau-action">${texte}
    <div class="actions" style="margin:0"><button class="btn btn-second" data-action="plus-tard">Plus tard</button><button class="btn btn-principal" data-action="sauvegarder">Sauvegarder</button></div></div>`;
}

// Menu de partage du téléphone (Proton Drive, Drive…) ; téléchargement si refusé ou indisponible.
// Renvoie false si l'utilisateur a fermé le partage sans choisir.
async function partager(fichiers, titre) {
  const telecharger = () => fichiers.forEach((f, i) => setTimeout(() => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.append(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }, i * 400));
  if (navigator.canShare?.({ files: fichiers })) {
    try {
      await navigator.share({ files: fichiers, title: titre });
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
    }
  }
  telecharger();
  return true;
}

async function sauvegarder() {
  try {
    const fichier = new File([await S.texteSauvegarde()], S.nomSauvegarde(), { type: 'text/plain' });
    if (!(await partager([fichier], 'Sauvegarde Envelop'))) return;
    S.noterSauvegarde();
    toast('Sauvegarde créée. Elle est chiffrée avec ton mot de passe.');
    route();
  } catch (e) {
    alerte(`La sauvegarde n'a pas pu être faite : ${esc(e?.message || e)}`);
  }
}

function choisirFichier(accept = '.txt,.json,text/plain,application/json') {
  return new Promise((ok) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => ok(input.files[0] || null));
    input.click();
  });
}

function demanderMotDePasse(titre, texte) {
  return new Promise((ok) => {
    ouvrir(`<h2>${titre}</h2><p>${texte}</p>
      <label class="champ"><span>Mot de passe</span><input name="mdp" type="password" autocomplete="off"></label>
      <div class="actions"><button class="btn btn-second" data-r="0">Annuler</button><button class="btn btn-principal" data-r="1">Valider</button></div>`, (f) => {
      setTimeout(() => f.querySelector('[name=mdp]').focus(), 60);
      f.addEventListener('click', (e) => {
        const r = e.target.closest('[data-r]')?.dataset.r;
        if (!r) return;
        const v = f.querySelector('[name=mdp]').value;
        fermer();
        ok(r === '1' ? v : null);
      });
    });
  });
}

async function restaurerDepuisFichier() {
  const fichier = await choisirFichier();
  if (!fichier) return;
  const texte = await fichier.text();
  let lu;
  try {
    lu = await S.lireSauvegarde(texte);
  } catch (e) {
    if (!(e instanceof S.MotDePasseRequis)) return alerte(esc(e.message));
    const mdp = await demanderMotDePasse('Mot de passe du fichier', 'Cette sauvegarde a été faite avec un autre mot de passe. Saisis celui qui la protégeait.');
    if (mdp == null) return;
    try { lu = await S.lireSauvegarde(texte, mdp); } catch (e2) { return alerte(esc(e2.message)); }
  }
  const actuelles = new Set(S.bases().map((b) => b.id));
  const liste = lu.contenu.bases.map((b) => `<li>${esc(b.icone)} ${esc(b.nom)} · ${b.mois.length} mois${actuelles.has(b.id) ? ' <span class="badge">déjà sur l\'appareil</span>' : ''}</li>`).join('');
  const date = lu.le ? new Date(lu.le).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' }) : 'date inconnue';
  ouvrir(`<h2>Restaurer une sauvegarde</h2>
    <p>Sauvegarde du ${date}, ${lu.contenu.bases.length} base${lu.contenu.bases.length > 1 ? 's' : ''} :</p>
    <ul class="liste-simple">${liste || '<li>Aucune base</li>'}</ul>
    <p class="aide">Une copie de tes données actuelles est faite avant, pour pouvoir revenir en arrière.</p>
    <button class="btn btn-second btn-large" data-r="ajouter">Ajouter seulement les bases absentes</button>
    <button class="btn btn-danger btn-large" data-r="remplacer" style="margin-top:10px">Remplacer toutes mes données</button>
    <button class="btn btn-large lien" data-r="annuler" style="margin-top:6px">Annuler</button>`, (f) => {
    f.addEventListener('click', async (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (!r) return;
      if (r === 'annuler') return fermer();
      if (r === 'remplacer' && !(await confirmer({ titre: 'Remplacer toutes tes données ?', texte: 'Les bases actuelles seront remplacées par celles du fichier. Une copie est faite avant.', bouton: 'Remplacer' }))) return;
      const res = await S.restaurer(lu.contenu, r);
      fermer();
      aller('#/');
      route();
      toast(r === 'remplacer' ? 'Données remplacées par la sauvegarde.' : `${res.ajoutees.length} base(s) ajoutée(s), ${res.ignorees.length} déjà présente(s).`, () => S.restaurerCopie(0).then(route));
    });
  });
}

// --- Réglages ---------------------------------------------------------------------

async function vueReglages() {
  const r = S.reglages();
  const j = joursDepuis(r.derniereSauvegarde);
  const dossier = await S.etatDossier().catch(() => ({ etat: 'impossible' }));
  const copies = S.copies();
  const ligneDossier = {
    impossible: '',
    aucun: `<button class="ligne" data-reg="dossier"><span class="ligne-corps"><div class="ligne-nom">Sauvegarde automatique dans un dossier</div><div class="ligne-detail">Sur PC : un dossier synchronisé par Proton Drive ou Drive</div></span><span class="chevron">${ICONES.chevron}</span></button>`,
    granted: `<button class="ligne" data-reg="oublier-dossier"><span class="ligne-corps"><div class="ligne-nom">Dossier : ${esc(dossier.nom || '')}</div><div class="ligne-detail">Sauvegarde automatique active · toucher pour l'arrêter</div></span></button>`,
    prompt: `<button class="ligne" data-reg="reautoriser"><span class="ligne-corps"><div class="ligne-nom">Dossier : ${esc(dossier.nom || '')}</div><div class="ligne-detail negatif">En pause · toucher pour réautoriser</div></span></button>`,
    denied: `<button class="ligne" data-reg="dossier"><span class="ligne-corps"><div class="ligne-nom">Dossier refusé</div><div class="ligne-detail">Toucher pour en choisir un autre</div></span></button>`,
  }[dossier.etat] || '';
  app.innerHTML = `
    <header class="entete"><a class="btn-icone" href="#/" aria-label="Retour">${ICONES.retour}</a><h1><span class="sur-titre">Envelop</span>Réglages</h1></header>
    <section class="carte"><h2 class="carte-titre">Sauvegarde</h2><div class="liste">
      <button class="ligne" data-action="sauvegarder"><span class="ligne-corps"><div class="ligne-nom">Sauvegarder maintenant</div><div class="ligne-detail">${j === null ? 'Jamais sauvegardé' : `Dernière : ${ilYA(j)}`} · fichier chiffré</div></span><span class="chevron">${ICONES.chevron}</span></button>
      <button class="ligne" data-reg="restaurer"><span class="ligne-corps"><div class="ligne-nom">Restaurer une sauvegarde</div><div class="ligne-detail">Ajouter des bases ou tout remplacer</div></span><span class="chevron">${ICONES.chevron}</span></button>
      ${ligneDossier}
      <button class="ligne" data-reg="lecteur"><span class="ligne-corps"><div class="ligne-nom">Lecteur de sauvegarde</div><div class="ligne-detail">Page autonome pour ouvrir tes sauvegardes sans l'appli · à garder avec elles</div></span><span class="chevron">${ICONES.chevron}</span></button>
      <button class="ligne" data-reg="csv"><span class="ligne-corps"><div class="ligne-nom">Export lisible (CSV)</div><div class="ligne-detail">Opérations et synthèse pour tableur · non chiffré</div></span><span class="chevron">${ICONES.chevron}</span></button>
      <label class="ligne"><span class="ligne-corps"><div class="ligne-nom">Rappel</div></span>
        <select data-reg-rappel class="select-court">${[0, 3, 7, 14, 30].map((n) => `<option value="${n}" ${n === r.rappelJours ? 'selected' : ''}>${n ? `tous les ${n} jours` : 'jamais'}</option>`).join('')}</select></label>
    </div></section>
    <section class="carte"><h2 class="carte-titre">Copies automatiques</h2><div class="liste">
      ${copies.map((c, i) => `<button class="ligne" data-reg="copie" data-i="${i}"><span class="ligne-corps"><div class="ligne-nom">${esc(c.raison)}</div><div class="ligne-detail">${new Date(c.le).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</div></span><span class="badge">Restaurer</span></button>`).join('') || '<div class="vide">Aucune copie. Une copie est faite avant chaque import, correction ou suppression de base.</div>'}
    </div></section>
    <section class="carte"><h2 class="carte-titre">Sécurité</h2><div class="liste">
      <button class="ligne" data-reg="mdp"><span class="ligne-corps"><div class="ligne-nom">Changer le mot de passe</div><div class="ligne-detail">Les anciennes sauvegardes gardent l'ancien mot de passe</div></span><span class="chevron">${ICONES.chevron}</span></button>
      <button class="ligne" data-reg="verrouiller"><span class="ligne-corps"><div class="ligne-nom">Verrouiller maintenant</div><div class="ligne-detail">Verrouillage automatique après 5 minutes en arrière-plan</div></span></button>
    </div></section>`;
}

app.addEventListener('change', (ev) => {
  if (!ev.target.matches('[data-reg-rappel]')) return;
  const n = Number(ev.target.value);
  S.modifier((e) => { e.reglages.rappelJours = n; });
});

app.addEventListener('click', async (ev) => {
  const el = ev.target.closest('[data-reg]');
  if (!el) return;
  const a = el.dataset.reg;
  try {
    if (a === 'restaurer') return restaurerDepuisFichier();
    if (a === 'dossier') { await S.choisirDossier(); toast('Sauvegarde automatique activée.'); return route(); }
    if (a === 'reautoriser') { await S.reautoriserDossier(); return route(); }
    if (a === 'oublier-dossier') {
      if (await confirmer({ titre: 'Arrêter la sauvegarde automatique ?', texte: 'Les fichiers déjà enregistrés dans le dossier restent en place.', bouton: 'Arrêter', danger: false })) { await S.oublierDossier(); route(); }
      return;
    }
    if (a === 'verrouiller') { S.verrouiller(); return route(); }
    if (a === 'copie') {
      const c = S.copies()[Number(el.dataset.i)];
      const ok = await confirmer({ titre: 'Restaurer cette copie ?', texte: `Tes données reviendront à leur état du ${new Date(c.le).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })} (${esc(c.raison.toLowerCase())}). Une copie de l'état actuel est faite avant.`, bouton: 'Restaurer', danger: false });
      if (ok) { await S.restaurerCopie(Number(el.dataset.i)); toast('Copie restaurée.'); route(); }
      return;
    }
    if (a === 'mdp') return fenetreMotDePasse();
    if (a === 'lecteur') {
      const html = await (await fetch('lecteur.html')).text();
      if (await partager([new File([html], 'envelop-lecteur.html', { type: 'text/html' })], 'Lecteur de sauvegarde Envelop')) toast('Lecteur enregistré. Range-le à côté de tes sauvegardes.');
      return;
    }
    if (a === 'csv') {
      const ok = await confirmer({ titre: 'Export lisible', texte: 'Deux fichiers CSV (opérations et synthèse mensuelle) que n\'importe quel tableur ouvre. Ils ne sont pas chiffrés : range-les dans un endroit protégé, comme ton Proton Drive.', bouton: 'Exporter', danger: false });
      if (!ok) return;
      const d = new Date();
      const h = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
      const etat = { bases: S.bases() };
      await partager([
        new File([EX.csvOperations(etat)], `envelop-operations-${h}.csv`, { type: 'text/csv' }),
        new File([EX.csvSynthese(etat)], `envelop-synthese-${h}.csv`, { type: 'text/csv' }),
      ], 'Export Envelop');
      return;
    }
  } catch (e) {
    if (e?.name !== 'AbortError') alerte(esc(e?.message || e));
  }
});

function fenetreMotDePasse() {
  ouvrir(`<h2>Changer le mot de passe</h2>
    <label class="champ"><span>Mot de passe actuel</span><input name="a" type="password" autocomplete="current-password"></label>
    <label class="champ"><span>Nouveau (8 caractères minimum)</span><input name="n" type="password" autocomplete="new-password"></label>
    <label class="champ"><span>Confirmation</span><input name="n2" type="password" autocomplete="new-password"></label>
    <p class="message-erreur" data-erreur hidden></p>
    <div class="actions"><button class="btn btn-second" data-r="0">Annuler</button><button class="btn btn-principal" data-r="1">Changer</button></div>`, (f) => {
    f.addEventListener('click', async (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (r === '0') return fermer();
      if (r !== '1') return;
      const err = f.querySelector('[data-erreur]');
      const v = (n) => f.querySelector(`[name=${n}]`).value;
      if (v('n').length < 8) { err.textContent = '8 caractères minimum.'; err.hidden = false; return; }
      if (v('n') !== v('n2')) { err.textContent = 'Les deux nouveaux mots de passe diffèrent.'; err.hidden = false; return; }
      if (!(await S.changerMotDePasse(v('a'), v('n')))) { err.textContent = 'Mot de passe actuel incorrect.'; err.hidden = false; return; }
      fermer();
      toast('Mot de passe changé. Pense à faire une nouvelle sauvegarde.');
    });
  });
}

// --- Message temporaire avec « Annuler » ----------------------------------------

let minuterieToast = null;
function toast(texte, annuler) {
  document.querySelector('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = `<span>${esc(texte)}</span>${annuler ? '<button>Annuler</button>' : ''}`;
  t.querySelector('button')?.addEventListener('click', async () => { t.remove(); await annuler(); });
  document.body.append(t);
  clearTimeout(minuterieToast);
  minuterieToast = setTimeout(() => t.remove(), annuler ? 9000 : 4000);
}

// --- Mode correction d'un mois passé ---------------------------------------------

async function demarrerCorrection(b, m) {
  const ok = await confirmer({
    titre: `Corriger ${nomMois(m)} ?`,
    texte: 'Les opérations de ce mois, ses charges fixes et ses revenus deviennent modifiables. Les saisies des mois suivants ne sont jamais touchées ; seules les 🌰 qui en découlent seront recalculées. Une copie est faite avant, et tu verras l\'effet avant de valider.',
    bouton: 'Commencer la correction',
    danger: false,
  });
  if (!ok) return;
  await S.commencerCorrection(b, m, `Avant correction de ${nomMois(m).toLowerCase()}`);
  route();
}

function fenetreFinCorrection(b) {
  const c = S.correctionEnCours();
  const courant = S.moisCourant(b);
  const avant = C.calculMois(c.avant, courant);
  const apres = C.calculMois(b, courant);
  const nbMois = b.mois.filter((x) => x > c.mois).length;
  const diffs = apres.enveloppes.map((e) => {
    const a = avant.enveloppes.find((x) => x.env.id === e.env.id);
    return { env: e.env, d: e.direct - (a ? a.direct : 0) };
  }).filter((x) => x.d !== 0);
  const margeAvant = C.calculMois(c.avant, c.mois).margeReelle;
  const margeApres = C.calculMois(b, c.mois).margeReelle;
  const lignes = diffs.map((x) => `<li>${esc(x.env.icone)} ${esc(x.env.nom)} : 🌰 <b class="${x.d < 0 ? 'negatif' : ''}">${euros(x.d, { signe: true })}</b>${nbMois ? ` sur ${nbMois + 1} mois` : ''}</li>`).join('');
  ouvrir(`<h2>Terminer la correction de ${nomMois(c.mois)}</h2>
    ${lignes ? `<p>Effet sur les 🌰, jusqu'à ${nomMois(courant)} :</p><ul class="liste-simple">${lignes}</ul>` : '<p>Aucun effet sur les 🌰.</p>'}
    ${margeAvant !== margeApres ? `<p>Marge réelle de ${nomMois(c.mois)} : ${euros(margeAvant)} → <b>${euros(margeApres)}</b>. Les versements de marge déjà faits ne sont pas modifiés.</p>` : ''}
    <div class="actions"><button class="btn btn-danger" data-r="annuler">Annuler mes modifications</button><button class="btn btn-principal" data-r="valider">Valider</button></div>
    <button class="btn btn-large lien" data-r="continuer" style="margin-top:6px">Continuer à corriger</button>`, (f) => {
    f.addEventListener('click', (e) => {
      const r = e.target.closest('[data-r]')?.dataset.r;
      if (!r) return;
      if (r === 'continuer') return fermer();
      S.terminerCorrection(r === 'valider');
      fermer();
      route();
      toast(r === 'valider' ? 'Correction validée.' : 'Modifications annulées.');
    });
  });
}

// --- Import To Do -------------------------------------------------------------------

async function importerToDo(b) {
  const fichier = await choisirFichier('.json,.txt,application/json,text/plain');
  if (!fichier) return;
  let json;
  try { json = JSON.parse(await fichier.text()); } catch { return alerte('Ce fichier n\'est pas un JSON lisible. Copie bien toute la réponse de Graph Explorer.'); }
  const attendu = b ? C.moisPrecedent(b.mois[0]) : null;
  const mois = attendu || IT.moisDepuisNom(fichier.name) || C.moisPrecedent(C.moisDe(new Date()));
  apercuImport(b, json, mois, fichier.name);
}

function apercuImport(b, json, mois, nomFichier) {
  let a;
  try { a = IT.analyser(json, mois); } catch (e) { return alerte(esc(e.message)); }
  const ancien = !!b;
  const corr = ancien ? IT.proposerCorrespondances(b, a) : [];
  const optionsEnv = (i) => `<select data-corr="${i}" class="select-court" style="max-width:130px">
      <option value="nouvelle">Nouvelle</option>
      ${b.enveloppes.map((e) => `<option value="${e.id}" ${corr[i] === e.id ? 'selected' : ''}>${esc(e.icone)} ${esc(e.nom)}</option>`).join('')}</select>`;
  const lignes = a.enveloppes.map((e, i) => `
    <div class="import-ligne">
      <div class="import-tete"><span class="pastille" style="width:34px;height:34px;font-size:1rem;border-radius:11px">${esc(e.icone)}</span>
        <span class="ligne-nom">${esc(e.nom)}</span><span class="badge">${e.ops.length} op.</span>${ancien ? optionsEnv(i) : ''}</div>
      <div class="import-champs">
        <label>Plafond<input inputmode="decimal" data-plafond-i="${i}" value="${enCentimesTexte(Math.max(0, e.plafond)) || '0,00'}"></label>
        <label>🌰 de départ<input inputmode="decimal" data-noisette-i="${i}" value="${enCentimesTexte(e.noisetteLue ?? 0) || '0,00'}"></label>
      </div>
    </div>`).join('');
  const avert = a.avertissements.length ? `<div class="bandeau" style="border:1.5px solid var(--ligne)"><b>À vérifier</b><ul class="liste-simple" style="margin:6px 0 0">${a.avertissements.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';
  ouvrir(`
    <h2>${ancien ? `Ajouter ${nomMois(mois)}` : `Importer ${nomMois(mois)}`}</h2>
    <p class="aide" style="margin:0 0 12px">Fichier : ${esc(nomFichier)}. Rien n'est enregistré tant que tu n'as pas validé.</p>
    ${ancien ? `<p>Ce mois s'ajoute avant ${nomMois(b.mois[0])}, pour l'historique et les statistiques. Il ne modifie aucune 🌰 des mois déjà présents.</p>`
    : `<label class="champ"><span>Mois de ce fichier</span><input name="mois" type="month" value="${mois}"></label>
      <div class="deux"><label class="champ"><span>Icône</span><input name="icone" placeholder="💶" maxlength="4" style="text-align:center;font-size:1.4rem;padding:9px 6px"></label>
      <label class="champ" data-champ="nom"><span>Nom de la base</span><input name="nom" placeholder="Perso" autocomplete="off"></label></div>`}
    ${avert}
    <h3 class="sous-titre">${a.enveloppes.length} enveloppes</h3>
    <p class="aide">Plafond déduit du reste et des dépenses ; 🌰 lue dans To Do (fin du mois précédent).</p>
    ${lignes}
    <div class="import-ligne"><div class="import-champs">
      <label>💶 Revenus<input inputmode="decimal" data-revenus value="${enCentimesTexte(a.revenus || 0) || '0,00'}"></label>
      <label>🔒 Charges fixes<input disabled value="${a.charges.length} (${C.formatMontant(a.charges.filter((c) => !c.pause).reduce((t, c) => t + c.montant, 0))})"></label>
    </div></div>
    ${a.ignores.length ? `<p class="aide">Ignorés : ${a.ignores.map(esc).join(' · ')}</p>` : ''}
    <div class="actions"><button class="btn btn-second" data-r="annuler">Annuler</button><button class="btn btn-principal" data-r="valider">${ancien ? 'Ajouter ce mois' : 'Créer la base'}</button></div>`, (f) => {
    f.querySelector('[name=mois]')?.addEventListener('change', (ev) => { if (ev.target.value) apercuImport(b, json, ev.target.value, nomFichier); });
    f.addEventListener('click', async (ev) => {
      const r = ev.target.closest('[data-r]')?.dataset.r;
      if (r === 'annuler') return fermer();
      if (r !== 'valider') return;
      let erreur = false;
      const lireChamp = (input) => {
        const v = input.value.trim() === '' ? 0 : C.lireMontant(input.value);
        input.style.borderColor = v == null ? 'var(--baisse)' : '';
        if (v == null) erreur = true;
        return v ?? 0;
      };
      a.enveloppes.forEach((e, i) => {
        e.plafond = Math.abs(lireChamp(f.querySelector(`[data-plafond-i="${i}"]`)));
        e.noisetteLue = lireChamp(f.querySelector(`[data-noisette-i="${i}"]`));
      });
      a.revenus = Math.abs(lireChamp(f.querySelector('[data-revenus]')));
      if (erreur) return;
      if (ancien) {
        const choix = a.enveloppes.map((_, i) => f.querySelector(`[data-corr="${i}"]`).value);
        await S.ajouterMoisAncien(b, a, choix);
        fermer();
        aller(`#/b/${b.id}/historique`);
        route();
        toast(`${nomMois(mois)} ajouté à l'historique.`, () => S.restaurerCopie(0).then(route));
      } else {
        const nom = f.querySelector('[name=nom]').value.trim();
        if (!nom) { f.querySelector('[data-champ=nom]').classList.add('erreur'); f.querySelector('[name=nom]').focus(); return; }
        const nb = S.ajouterBaseImportee(a, { nom, icone: f.querySelector('[name=icone]').value.trim() || '💶' });
        fermer();
        aller(`#/b/${nb.id}`);
        toast(`Base « ${nom} » créée depuis ${nomMois(mois).toLowerCase()}.`);
      }
    });
  });
}

// --- Actions -----------------------------------------------------------------------

function baseCourante() {
  const id = location.hash.split('/')[2];
  return id ? S.base(id) : null;
}

app.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const b = baseCourante();
  const { action, id, cible } = el.dataset;
  switch (action) {
    case 'nouvelle-base': return fenetreBase(null);
    case 'reglages': return aller('#/reglages');
    case 'import-todo': return importerToDo(null);
    case 'import-ancien': return importerToDo(b);
    case 'sauvegarder': return sauvegarder();
    case 'plus-tard': S.modifier((e) => { e.reglages.rappelApres = new Date(Date.now() + 864e5).toISOString(); }); return route();
    case 'corriger': return demarrerCorrection(b, el.dataset.mois);
    case 'fin-correction': return fenetreFinCorrection(b);
    case 'demo': { const d = S.creerDemo(); return aller(`#/b/${d.id}`); }
    case 'menu-base': return fenetreBase(b);
    case 'menu-mois': return fenetreMenu(b);
    case 'bascule': return fenetreBascule(b);
    case 'nouvelle-enveloppe': return fenetreEnveloppe(b, null);
    case 'modifier-enveloppe': return fenetreEnveloppe(b, id);
    case 'nouvelle-op': return fenetreOperation(b, { cible, mois: el.dataset.mois });
    case 'modifier-op': return fenetreOperation(b, { op: b.operations.find((o) => o.id === id) });
    case 'monter': S.deplacerEnveloppe(b, id, -1); return route();
    case 'descendre': S.deplacerEnveloppe(b, id, 1); return route();
    case 'enregistrer-plafonds': {
      let erreur = false;
      app.querySelectorAll('[data-plafond]').forEach((input) => {
        const v = input.value.trim() === '' ? 0 : C.lireMontant(input.value);
        input.style.borderColor = v == null ? 'var(--baisse)' : '';
        if (v == null) erreur = true;
      });
      if (erreur) return;
      app.querySelectorAll('[data-plafond]').forEach((input) => {
        const v = Math.abs(input.value.trim() === '' ? 0 : C.lireMontant(input.value));
        if (v !== C.plafond(b, input.dataset.plafond, S.moisCourant(b))) S.definirPlafond(b, input.dataset.plafond, v);
      });
      return aller(`#/b/${b.id}`);
    }
    default:
  }
});

app.addEventListener('input', (ev) => {
  if (!ev.target.matches('[data-plafond]')) return;
  let total = 0;
  app.querySelectorAll('[data-plafond]').forEach((i) => { total += Math.abs(C.lireMontant(i.value) ?? 0); });
  const t = document.getElementById('total-plafonds');
  if (t) t.textContent = euros(total);
});

// --- Démarrage ---------------------------------------------------------------------

route();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
