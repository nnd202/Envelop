// Lecture d'un mois de budget exporté de Microsoft To Do (réponse JSON de Graph Explorer :
// GET /me/todo/lists/{id}/tasks?$expand=checklistItems). Module pur, sans interface.
//
// Format attendu (celui de l'utilisateur) :
//   tâche « 🛒 Courses ▪️ 97,32 🌰 592,90 »   → enveloppe (reste du mois, noisette)
//   étape « Samedi 3 ▪️ 43,28€ »              → dépense ; « 🚫 » = en pause
//   tâche « Totaux » : étapes « Courses 💶 300 » → plafonds (contrôle)
//   tâche « Incompressible » : « Loyer 💶 650 🚫 » → charges fixes
//   tâche « Marge » : l'étape en chiffres emoji (2️⃣1️⃣4️⃣8️⃣) → revenus
import * as C from './calc.js';

const MOIS = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};
const JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const SEP = /\s*▪️?\s*/;

export const sansAccents = (t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Nom comparable : minuscules, sans accents, sans emoji ni « x20 ».
export function cleNom(t) {
  return sansAccents(String(t)).toLowerCase().replace(/\s+x\d+\s*$/, '').replace(/[^a-z0-9&]+/g, ' ').trim();
}

// « 20261031 - Export To Do - Octobre 2026.json » → « 2026-10 »
export function moisDepuisNom(nom) {
  const t = sansAccents(String(nom)).toLowerCase();
  for (const [mot, n] of Object.entries(MOIS)) {
    const m = t.match(new RegExp(`${mot}\\s*(\\d{4})`));
    if (m) return `${m[1]}-${String(n).padStart(2, '0')}`;
  }
  return null;
}

function chiffresEmoji(t) {
  return t.replace(/(\d)️?⃣/g, '$1');
}

// Montant tolérant : « 139, 56€ », « 59,8 », « -71,00 », « 1 234,5 » → centimes.
export function montant(t) {
  if (t == null) return null;
  const m = chiffresEmoji(String(t)).replace(/[  ]/g, ' ').match(/[-+−]?\s*\d[\d ]*(?:[.,]\s*\d{1,2})?/);
  if (!m) return null;
  const n = m[0].replace(/[\s]/g, '').replace('−', '-').replace(',', '.');
  const v = Math.round(parseFloat(n) * 100);
  return Number.isFinite(v) ? v : null;
}

function separerIcone(tete) {
  const t = tete.trim();
  const m = t.match(/^([^\p{L}\p{N}]+)\s*(.*)$/u);
  return m ? { icone: m[1].trim() || '✉️', nom: m[2].trim() } : { icone: '✉️', nom: t };
}

function joursDuMois(mois) {
  const [a, n] = mois.split('-').map(Number);
  return new Date(a, n, 0).getDate();
}

export function analyser(json, mois) {
  const taches = Array.isArray(json?.value) ? json.value : null;
  if (!taches) throw new Error('Ce fichier ne ressemble pas à une réponse Graph Explorer (champ « value » absent).');
  const res = { mois, enveloppes: [], plafondsTotaux: [], charges: [], revenus: null, ignores: [], avertissements: [] };
  const [an, mo] = mois.split('-').map(Number);
  const nbJours = joursDuMois(mois);

  for (const t of taches) {
    const titre = String(t.title || '').trim();
    const etapes = (t.checklistItems || []).map((c) => String(c.displayName || '').trim());
    const cle = cleNom(titre);
    if (!/\p{L}|\d/u.test(chiffresEmoji(titre)) || /^[⬇⬆➖—\-_=\s️]+$/u.test(titre)) { res.ignores.push(titre); continue; }

    if (cle.includes('totaux')) {
      for (const e of etapes) {
        const [n, v] = e.split('💶');
        if (v !== undefined) res.plafondsTotaux.push({ nom: n.trim(), montant: Math.abs(montant(v) ?? 0) });
      }
      continue;
    }
    if (cle.includes('incompressible')) {
      for (const e of etapes) {
        const [n, v] = e.split('💶');
        if (v === undefined) { res.avertissements.push(`Charge fixe illisible : « ${e} »`); continue; }
        res.charges.push({ libelle: n.trim(), montant: Math.abs(montant(v) ?? 0), pause: e.includes('🚫') });
      }
      continue;
    }
    if (cle.startsWith('marge')) {
      for (const e of etapes) {
        const c = chiffresEmoji(e).replace(/\s/g, '');
        if (/^\d+([.,]\d{1,2})?€?$/.test(c)) res.revenus = montant(c);
      }
      if (res.revenus == null) res.avertissements.push('Revenus introuvables dans « Marge » : à saisir dans l\'aperçu.');
      continue;
    }
    if (!SEP.test(titre)) { res.ignores.push(titre); continue; }

    const [tete, suite] = titre.split(SEP);
    const [resteTxt, noisetteTxt] = suite.split('🌰');
    const { icone, nom } = separerIcone(tete);
    const env = {
      icone,
      nom: nom.replace(/\s+x\d+\s*$/i, '').trim(),
      resteLu: montant(resteTxt) ?? 0,
      noisetteLue: noisetteTxt !== undefined ? (montant(noisetteTxt) ?? 0) : null,
      ops: [],
    };
    for (const e of etapes) {
      const parts = e.split(SEP);
      if (parts.length < 2) { res.avertissements.push(`${env.nom} : étape illisible « ${e} »`); continue; }
      const [gauche, droite] = parts;
      const jour = Number((gauche.match(/(\d{1,2})(?!.*\d)/) || [])[1]);
      const v = montant(droite);
      if (!jour || jour > nbJours || v == null) { res.avertissements.push(`${env.nom} : étape illisible « ${e} »`); continue; }
      const nomJour = sansAccents(gauche.trim().split(/\s+/)[0] || '').toLowerCase();
      const attendu = JOURS[new Date(an, mo - 1, jour).getDay()];
      if (JOURS.includes(nomJour) && nomJour !== attendu) {
        res.avertissements.push(`${env.nom} : « ${gauche.trim()} » ne tombe pas un ${nomJour} (le ${jour} est un ${attendu}).`);
      }
      const positif = /^\s*\+/.test(droite);
      env.ops.push({ texte: e, jour, montant: positif ? Math.abs(v) : -Math.abs(v), pause: e.includes('🚫') });
    }
    // Plafond déduit : reste lu + dépenses comptées (les étapes en pause sont déjà retirées à la main).
    const comptees = env.ops.filter((o) => !o.pause).reduce((s, o) => s + o.montant, 0);
    env.plafond = env.resteLu - comptees;
    res.enveloppes.push(env);
  }

  // Contrôle croisé avec « Totaux ».
  const parNom = new Map(res.enveloppes.map((e) => [cleNom(e.nom), e]));
  const libres = new Set(res.enveloppes);
  for (const p of res.plafondsTotaux) {
    const e = parNom.get(cleNom(p.nom));
    if (e) {
      libres.delete(e);
      if (e.plafond !== p.montant) res.avertissements.push(`${e.nom} : plafond ${C.formatMontant(p.montant)} dans Totaux, mais reste et dépenses donnent ${C.formatMontant(e.plafond)}.`);
    }
  }
  for (const p of res.plafondsTotaux) {
    if (parNom.has(cleNom(p.nom))) continue;
    const candidat = [...libres].find((e) => e.plafond === p.montant);
    if (candidat) {
      res.avertissements.push(`« ${p.nom} » (Totaux) correspond à l'enveloppe ${candidat.nom} : même plafond de ${C.formatMontant(p.montant)}.`);
      libres.delete(candidat);
    } else {
      res.avertissements.push(`« ${p.nom} » (Totaux, ${C.formatMontant(p.montant)}) ne correspond à aucune enveloppe.`);
    }
  }
  return res;
}

const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

function operationsDuMois(a, envId, envAnalyse, mois) {
  return envAnalyse.ops.map((o) => ({
    id: uid(), mois, cible: envId, date: `${mois}-${String(o.jour).padStart(2, '0')}`, libelle: '',
    montant: o.montant, pause: o.pause, epargne: false, recurrente: false, importe: true,
  }));
}

function fixesDuMois(a, mois) {
  const ops = a.charges.map((c) => ({
    id: uid(), mois, cible: 'charge', date: `${mois}-01`, libelle: c.libelle, montant: c.montant,
    pause: c.pause, epargne: false, recurrente: true, importe: true,
  }));
  if (a.revenus) {
    ops.push({ id: uid(), mois, cible: 'revenu', date: `${mois}-01`, libelle: 'Revenus', montant: a.revenus, pause: false, epargne: false, recurrente: true, importe: true });
  }
  return ops;
}

// Nouvelle base à partir du dernier mois : ses noisettes deviennent le point de départ (ancre).
export function construireBase(a, { nom, icone }) {
  const m = a.mois;
  const b = { id: uid(), nom, icone: icone || '💶', mois: [m], enveloppes: [], plafonds: [], operations: [], reserve: [], notes: [], ancres: { [m]: {} } };
  a.enveloppes.forEach((e, i) => {
    const id = uid();
    b.enveloppes.push({ id, nom: e.nom, icone: e.icone, ordre: i, creeeLe: m, noisetteDepart: e.noisetteLue ?? 0, flechee: false });
    b.plafonds.push({ enveloppeId: id, depuis: m, montant: Math.max(0, e.plafond) });
    b.ancres[m][id] = e.noisetteLue ?? 0;
    b.operations.push(...operationsDuMois(a, id, e, m));
  });
  b.operations.push(...fixesDuMois(a, m));
  return b;
}

// Propositions de correspondance pour un mois plus ancien : même nom → même enveloppe.
export function proposerCorrespondances(base, a) {
  const existantes = new Map(base.enveloppes.map((e) => [cleNom(e.nom), e.id]));
  return a.enveloppes.map((e) => existantes.get(cleNom(e.nom)) || 'nouvelle');
}

// Ajoute le mois juste avant le plus ancien de la base, pour l'historique.
// correspondances[i] = id d'une enveloppe existante ou 'nouvelle'.
export function ajouterMoisAncien(base, a, correspondances) {
  const m = a.mois;
  if (m !== C.moisPrecedent(base.mois[0])) throw new Error(`Seul le mois précédant ${base.mois[0]} peut être ajouté.`);
  base.ancres = base.ancres || {};
  base.ancres[m] = {};
  // Les mois déjà présents gardent leurs noisettes : on ancre le plus ancien s'il ne l'est pas.
  const ancien = base.mois[0];
  base.ancres[ancien] = base.ancres[ancien] || {};
  for (const env of C.enveloppesDuMois(base, ancien)) {
    if (base.ancres[ancien][env.id] === undefined) base.ancres[ancien][env.id] = C.noisetteAcquise(base, env, ancien);
  }
  a.enveloppes.forEach((e, i) => {
    let id = correspondances[i];
    if (!id || id === 'nouvelle') {
      id = uid();
      base.enveloppes.push({ id, nom: e.nom, icone: e.icone, ordre: base.enveloppes.length, creeeLe: m, supprimeeDepuis: ancien, noisetteDepart: e.noisetteLue ?? 0, flechee: false });
    } else {
      const env = base.enveloppes.find((x) => x.id === id);
      if (env.creeeLe > m) env.creeeLe = m;
    }
    base.plafonds.push({ enveloppeId: id, depuis: m, montant: Math.max(0, e.plafond) });
    base.ancres[m][id] = e.noisetteLue ?? 0;
    base.operations.push(...operationsDuMois(a, id, e, m));
  });
  base.operations.push(...fixesDuMois(a, m));
  base.mois.unshift(m);
}
