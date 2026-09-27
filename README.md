# Force V4 — Carnet d'entraînement + Dashboard

App fitness perso, 100 % locale et offline : saisie des séances sur mobile (PWA),
analyse sur PC (dashboard). Zéro dépendance, vanilla HTML/CSS/JS.

## Contenu du repo

```
README.md
.gitignore
mobile/
  index.html        # Coquille SPA, tout est rendu en JS
  manifest.json     # PWA "Force", scope relatif (racine ou sous-chemin)
  sw.js             # Cache-first, CACHE_NAME = force-v4-v2
  css/style.css     # Thème "Steel & Chalk"
  js/data.js        # Modèle v3, localStorage (clé force_v4), quota 4,5 Mo
  js/export.js      # Code Base64, fusion, CSV
  js/log.js         # Draft séance, chrono + vibration
  js/app.js         # 5 écrans + navigation
  icons/            # icon-192.png, icon-512.png, icon.svg
desktop/
  dashboard.html    # Dashboard PC en un seul fichier (CSS+JS inline)
```

## Installation mobile (GitHub Pages)

1. Uploade ce dossier tel quel sur GitHub.
2. Settings → Pages → publie le dossier `mobile/` (ou la racine selon ton choix).
3. Ouvre l'URL sur mobile (Brave/Chrome) → « Ajouter à l'écran d'accueil ».
4. Fonctionne hors-ligne après la première visite (service worker).

## Installation desktop (PC)

1. Ouvre `desktop/dashboard.html` en `file://` dans Chromium/Chrome/Brave.
2. Au premier lancement : choisis un dossier de données (`force-v4.json`).
   Sans File System Access API : repli automatique sur le localStorage du navigateur
   (sauvegarde toutes les 30 s + à la fermeture).

## Usage

- **Mobile, écran Programme** : crée ton programme (séances + exercices,
  objectifs séries × reps @ charge, repos, planning rotation ou hebdo).
- **Mobile, écran Saisir** : séance pré-remplie depuis la dernière fois,
  RPE 1-10, chrono de repos auto + vibration, sauvegarde en cours de route
  (brouillon en `sessionStorage`, survit au changement d'app).
- **Transfert mobile ↔ PC** : Réglages → Exporter par code (Base64) →
  copier → Importer dans l'autre app. La fusion ajoute les séances inconnues
  (par `id`) et remplace le programme par celui importé (`programs[0]`).
- **Export CSV** : bouton 📊 dans Réglages (mobile) et Paramètres (desktop).

### Format CSV réel (1 ligne = 1 série)

```
Date,Session,Exercice,Serie,Reps,Charge,RPE,Notes
```

Séparateur virgule, UTF-8 sans BOM. (L'ancien format `;` 12 colonnes de la doc
historique n'est plus d'actualité.)

## Données (schéma v3)

`version: 3`, `programs[]` (+ `program` = `programs[0]` pour compat),
`scheduleGrid` (date → séance), `scheduleTemplate` (jour de semaine → séance),
`exerciseLibrary`, `workouts[]` (`exercises[].sets[{reps,weight}]`, `rpe/10`,
`restUsed`, `notes`). Migrations v1→v2→v3 automatiques au chargement.

Stockage mobile : `localStorage` (`force_v4`) + brouillon (`force_v4_draft`).
Au-delà de ~4,5 Mo : la sauvegarde est conservée et un avertissement s'affiche
(exporte puis réinitialise).

## Limites connues (non implémenté, assumé)

Pas de heatmap annuelle, pas de comparaison de périodes (seule la comparaison
A/B existe), pas de badges/gamification (streak numérique seul), pas de seed
auto du programme (démarre vide, saisie manuelle), pas de version Android
Capacitor, pas d'export PDF, pas de sync cloud.
