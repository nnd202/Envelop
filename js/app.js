// Interface d'Envelop (étape 1) : bases, mois en cours, enveloppes, opérations,
// charges fixes, revenus, plafonds et synthèse.
import * as C from './calc.js';
import * as S from './store.js';

const app = document.getElementById('app');
const couche = document.getElementById('couche');

// --- Outils ----------------------------------------------------------------------

const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euros = (c, opts) => C.formatMontant(c, opts);
const negClass = (c) => (c < 0 ? ' negatif' : '');
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
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'b' && parts[1]) {
    const b = S.base(parts[1]);
    if (!b) return vueAccueil();
    if (parts[2] === 'e' && parts[3]) return vueEnveloppe(b, parts[3]);
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
    ${lien('bases', '#/', 'Bases')}
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
    <header class="entete"><h1><span class="sur-titre">Envelop</span>Mes budgets</h1></header>
    <section class="carte">
      <div class="liste">${lignes || '<div class="vide">Aucune base pour l\'instant.<br>Crée ta première base de budget.</div>'}
      <button class="ajouter" data-action="nouvelle-base">${ICONES.plus} Nouvelle base</button></div>
    </section>
    ${aDemo ? '' : '<button class="btn btn-second btn-large" data-action="demo">Essayer avec une base de démo</button>'}
    <p class="aide" style="margin-top:16px;text-align:center">Tes données restent dans ce navigateur, sur cet appareil.</p>`;
}

// --- Vue : mois en cours --------------------------------------------------------

function vueMois(b) {
  const m = S.moisCourant(b);
  const r = C.calculMois(b, m);
  const calendrier = C.moisDe(new Date());

  const enveloppes = r.enveloppes.map((e) => `
    <a class="ligne" href="#/b/${b.id}/e/${e.env.id}">
      <span class="pastille">${esc(e.env.icone)}</span>
      <span class="ligne-corps">
        <div class="ligne-nom">${esc(e.env.nom)}${e.env.flechee ? '<span class="point-fleche" title="Épargne fléchée"></span>' : ''}</div>
        <div class="ligne-detail">
          <span class="reste${negClass(e.reste)}">${euros(e.reste)}</span>
          <span class="noisette${negClass(e.direct)}">🌰 ${euros(e.direct, { euro: false })} ${fleche(e.tendance)}</span>
          ${alerteNegative(e.moisNegatifs)}
        </div>
      </span>
      <span class="chevron">${ICONES.chevron}</span>
    </a>`).join('');

  const bandeau = calendrier > m
    ? `<div class="bandeau">${nomMois(calendrier)} a commencé. La bascule de mois arrive avec l'étape 2 d'Envelop.</div>` : '';

  const ecart = r.depassement > 0;
  app.innerHTML = `
    <header class="entete">
      <h1><span class="sur-titre">${esc(b.icone)} ${esc(b.nom)}</span>${nomMois(m)}</h1>
      <button class="btn-icone" data-action="menu-base" aria-label="Options de la base">${ICONES.points}</button>
    </header>
    ${bandeau}
    <section class="carte">
      <h2 class="carte-titre">Enveloppes</h2>
      <div class="liste">${enveloppes || '<div class="vide">Aucune enveloppe. Ajoute la première ci-dessous.</div>'}
      <button class="ajouter" data-action="nouvelle-enveloppe">${ICONES.plus} Ajouter une enveloppe</button></div>
    </section>

    <section class="carte">
      <div class="liste">
        <a class="ligne" href="#/b/${b.id}/fixes"><span class="pastille">🔒</span>
          <span class="ligne-corps"><div class="ligne-nom">Incompressible</div><div class="ligne-detail">${r.chargesOps.length} charge${r.chargesOps.length > 1 ? 's' : ''} fixe${r.chargesOps.length > 1 ? 's' : ''}</div></span>
          <span class="ligne-montant">${euros(r.incompressible)}</span><span class="chevron">${ICONES.chevron}</span></a>
        <a class="ligne" href="#/b/${b.id}/fixes"><span class="pastille">💶</span>
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
    ${barre(b, 'mois')}`;
}

// --- Vue : détail d'une enveloppe -------------------------------------------------

function vueEnveloppe(b, envId) {
  const m = S.moisCourant(b);
  const r = C.calculMois(b, m);
  const e = r.enveloppes.find((x) => x.env.id === envId);
  if (!e) return aller(`#/b/${b.id}`);
  const ops = [...e.ops].sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  const lignes = ops.map((o) => `
    <button class="ligne${o.pause ? ' en-pause' : ''}" data-action="modifier-op" data-id="${o.id}">
      <span class="ligne-corps">
        <div class="ligne-nom">${esc(o.libelle || jourCourt(o.date))}</div>
        <div class="ligne-detail">${o.libelle ? `<span>${jourCourt(o.date)}</span>` : ''}
          ${o.pause ? '<span class="badge pause">En pause</span>' : ''}
          ${o.epargne ? '<span class="badge epargne">🌰 Épargne</span>' : ''}
          ${o.recurrente ? '<span class="badge recurrente">Récurrente</span>' : ''}</div>
      </span>
      <span class="ligne-montant${o.montant > 0 ? '' : ''}" style="color:${o.montant > 0 ? 'var(--hausse)' : 'inherit'}">${euros(o.montant, { signe: true })}</span>
    </button>`).join('');

  app.innerHTML = `
    <header class="entete">
      <a class="btn-icone" href="#/b/${b.id}" aria-label="Retour au mois">${ICONES.retour}</a>
      <h1><span class="sur-titre">${nomMois(m)}</span>&nbsp;</h1>
      <button class="btn-icone" data-action="modifier-enveloppe" data-id="${e.env.id}" aria-label="Modifier l'enveloppe">${ICONES.points}</button>
    </header>
    <section class="carte heros">
      <span class="pastille">${esc(e.env.icone)}</span>
      <h2>${esc(e.env.nom)}</h2>
      <div class="grand${negClass(e.reste)}">${euros(e.reste)}</div>
      <div class="sous">reste ce mois-ci sur ${euros(e.plafond)} de plafond</div>
      <div class="heros-chiffres">
        <div>🌰 fin du mois dernier<b>${euros(e.acquise)}</b></div>
        <div>🌰 en direct<b class="noisette${negClass(e.direct)}">${euros(e.direct)} ${fleche(e.tendance)}</b></div>
      </div>
      ${e.moisNegatifs >= 2 ? `<div style="margin-top:10px">${alerteNegative(e.moisNegatifs)}</div>` : ''}
    </section>
    <section class="carte">
      <h2 class="carte-titre">Opérations</h2>
      <div class="liste">${lignes || '<div class="vide">Aucune opération ce mois-ci.</div>'}
      <button class="ajouter" data-action="nouvelle-op" data-cible="${e.env.id}">${ICONES.plus} Ajouter une opération</button></div>
    </section>
    ${barre(b, '')}`;
}

// --- Vue : charges fixes et revenus ---------------------------------------------

function vueFixes(b) {
  const m = S.moisCourant(b);
  const r = C.calculMois(b, m);
  const ligne = (o) => `
    <button class="ligne${o.pause ? ' en-pause' : ''}" data-action="modifier-op" data-id="${o.id}">
      <span class="ligne-corps"><div class="ligne-nom">${esc(o.libelle || 'Sans nom')}</div>
        <div class="ligne-detail">${o.pause ? '<span class="badge pause">En pause</span>' : ''}${o.recurrente ? '<span class="badge recurrente">Récurrente</span>' : '<span class="badge">Ce mois-ci</span>'}</div></span>
      <span class="ligne-montant">${euros(o.montant)}</span>
    </button>`;
  app.innerHTML = `
    <header class="entete"><h1><span class="sur-titre">${nomMois(m)}</span>Fixes</h1></header>
    <section class="carte">
      <h2 class="carte-titre">🔒 Incompressible · ${euros(r.incompressible)}</h2>
      <div class="liste">${r.chargesOps.map(ligne).join('') || '<div class="vide">Aucune charge fixe.</div>'}
      <button class="ajouter" data-action="nouvelle-op" data-cible="charge">${ICONES.plus} Ajouter une charge fixe</button></div>
    </section>
    <section class="carte">
      <h2 class="carte-titre">💶 Revenus · ${euros(r.revenus)}</h2>
      <div class="liste">${r.revenusOps.map(ligne).join('') || '<div class="vide">Aucun revenu.</div>'}
      <button class="ajouter" data-action="nouvelle-op" data-cible="revenu">${ICONES.plus} Ajouter un revenu</button></div>
    </section>
    <p class="aide" style="text-align:center">Les opérations récurrentes seront reportées automatiquement au mois suivant. Une opération en pause reste visible mais ne compte pas.</p>
    ${barre(b, 'fixes')}`;
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
    <p class="aide" style="text-align:center">Un plafond modifié vaut pour ${nomMois(m)} et les mois suivants, jamais pour les mois passés.</p>
    ${envs.length ? '<button class="btn btn-principal btn-large" data-action="enregistrer-plafonds">Enregistrer les plafonds</button>' : ''}
    ${barre(b, 'plafonds')}`;
}

// --- Fenêtres ---------------------------------------------------------------------

function ouvrir(html, initialiser) {
  couche.innerHTML = `<div class="fenetre" role="dialog" aria-modal="true"><div class="poignee"></div>${html}</div>`;
  couche.hidden = false;
  initialiser?.(couche.firstElementChild);
}

function fermer() {
  couche.hidden = true;
  couche.innerHTML = '';
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
function fenetreOperation(b, { cible, op }) {
  const m = S.moisCourant(b);
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
        if (ok) { S.supprimerBase(b.id); aller('#/'); }
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

function alerte(texte) {
  ouvrir(`<h2>Envelop</h2><p>${texte}</p><div class="actions"><button class="btn btn-principal" data-r>OK</button></div>`, (f) => {
    f.querySelector('[data-r]').addEventListener('click', fermer);
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
    case 'demo': { const d = S.creerDemo(); return aller(`#/b/${d.id}`); }
    case 'menu-base': return fenetreBase(b);
    case 'nouvelle-enveloppe': return fenetreEnveloppe(b, null);
    case 'modifier-enveloppe': return fenetreEnveloppe(b, id);
    case 'nouvelle-op': return fenetreOperation(b, { cible });
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
