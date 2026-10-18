# Budget — application personnelle de gestion financière (PWA)

Installable sur l'écran d'accueil de l'iPhone. Aucune donnée n'est envoyée à un serveur : tout est stocké dans l'iPhone
(IndexedDB). Aucun compte, aucun secret, aucun coût d'exploitation. Les PDF sont lus **localement** (pdf.js) ; les PDF scannés
sont lus par OCR **local** (tesseract.js). Les bibliothèques sont embarquées dans `vendor/` (voir `vendor/NOTICE.txt`).

## Fonctions
Revenus, factures (récurrentes / exceptionnelles), **abonnements** (hebdo → annuel, échéances calculées, calendrier, rappels,
export .ics), dépenses, plafonds par catégorie, budget quotidien, épargne, statistiques interactives, archives, **import de
relevés PDF** (aperçu, validation, rapprochements, détection d'abonnements, rapport), PIN + Face ID, sauvegardes.

## Lancer en local (Mac)
    node --test tests/              # tests (moteur, abonnements, import, vrais PDF y compris protégés)
    python3 -m http.server 8791     # puis http://localhost:8791

## Installer sur l'iPhone
Servir le dossier en HTTPS (GitHub Pages, Netlify…), ouvrir dans Safari → Partager → « Sur l'écran d'accueil ».
À chaque mise à jour, incrémenter `VERSION` dans `sw.js`.
