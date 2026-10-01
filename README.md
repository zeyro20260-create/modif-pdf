# ModifPDF

Application de bureau **gratuite**, pour usage personnel, d'édition de PDF et d'images — inspirée
d'Adobe Acrobat Pro. Tourne entièrement en local (aucune donnée envoyée à un serveur).

## Stack technique

- **Electron** — coquille desktop Windows, accès fichiers via IPC sécurisé (`contextIsolation`, pas de
  `nodeIntegration` côté renderer).
- **React + TypeScript + Vite** — interface.
- **pdf.js** (`pdfjs-dist`) — rendu/affichage des pages PDF dans un `<canvas>`.
- **pdf-lib** — toutes les opérations d'édition : fusion/scission, rotation, suppression/réordonnement
  de pages, ajout de texte/image, formulaires (AcroForm), aplatissement.
- **zustand** — état applicatif (document ouvert, outil actif, etc.).

## Pourquoi pdf.js + pdf-lib plutôt qu'un vrai moteur d'édition "in place" ?

Éditer directement le texte existant d'un PDF (comme le fait partiellement Acrobat Pro) nécessite de
reconstruire les polices et le layout du flux de contenu — complexe et peu fiable même dans les outils
commerciaux. La V1 adopte donc une approche **overlay** utilisée par la plupart des éditeurs PDF
gratuits : on superpose du texte/images/une signature par-dessus la page existante. C'est robuste,
suffisant pour l'immense majorité des usages personnels (annoter, compléter un formulaire, signer,
réorganiser), et ça n'empêche pas d'ajouter plus tard une édition "in place" expérimentale.

## Structure du projet

```
electron/                 Processus principal Electron (hors sandbox renderer)
  main.ts                 Fenêtre, menu, dialogues fichiers, lecture/écriture disque
  preload.ts               Pont IPC exposé au renderer via contextBridge (window.modifPdf)

src/                       Renderer (React)
  components/
    layout/                TopBar (outils, ouvrir/enregistrer, zoom), RightPanel (panneau contextuel)
    viewer/                PdfCanvas (rendu + interactions de pose d'overlay), PageThumbnails
    toolpanels/             SignaturePad, FormsPanel, OrganizePanel
  features/document/
    useDocumentStore.ts     État global : document chargé, page courante, outil actif, champs de formulaire
    documentTypes.ts         Types partagés (ToolId, OverlayObject, FormFieldState...)
  lib/
    pdfEngine.ts            Toute la logique pdf.js/pdf-lib (rendu, rotation, fusion, overlay, formulaires)
    imageFormat.ts           Détection PNG/JPEG par magic bytes
    dataUrl.ts                Conversion dataURL (signature dessinée) -> ArrayBuffer
  App.tsx / main.tsx

resources/                 Icônes pour electron-builder (à fournir avant packaging)
```

## Fonctionnalités V1 (déjà en place dans ce squelette)

- Ouvrir / créer / enregistrer un PDF (dialogues natifs Windows).
- Visualiser les pages (zoom, miniatures).
- **Organiser** : réordonner par glisser-déposer, pivoter, supprimer, fusionner un autre PDF, extraire une
  page, ajouter des pages depuis des images (JPEG/PNG).
- **Éditer (overlay)** : ajouter du texte et des images cliquables, positionnées librement sur la page.
- **Formulaires** : détection des champs AcroForm (texte, case à cocher, radio, liste déroulante),
  modification des valeurs, aplatissement final.
- **Signature** : pavé de dessin à la souris/tactile, tamponnage sur la page.

## Pistes d'évolution (non implémentées)

- Déplacer/redimensionner un overlay après l'avoir posé (actuellement : position fixe au clic).
- Undo/redo.
- Redaction réelle (suppression du contenu sous le cache, pas juste un rectangle par-dessus).
- OCR sur PDF scannés.
- Édition "in place" du texte natif du PDF (lecture du content stream, remplacement heuristique).
- Export d'images depuis les pages PDF, conversion PDF -> images.
- Icône et installeur (`resources/icon.ico` + `npm run dist`).

## Démarrer en développement

```bash
npm install
npm run electron:dev
```

Cela lance Vite (serveur de dev React sur `localhost:5173`) et Electron en parallèle, avec rechargement
à chaud du renderer.

## Build de production (installeur Windows)

```bash
npm run dist
```

Génère un installeur NSIS dans `release/`. Fournissez d'abord `resources/icon.ico`.

## Vérifications

```bash
npm run typecheck   # TypeScript, renderer + processus principal
npm run lint
```
