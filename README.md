# Budget — application personnelle de gestion financière (PWA)

Application installable sur l'écran d'accueil de l'iPhone. Aucune donnée n'est envoyée à un serveur :
tout est stocké dans l'iPhone (IndexedDB). Aucun compte, aucun secret, aucun coût d'exploitation.

## Lancer en local (Mac)
    npm test            # 31 tests du moteur financier
    npm run serve       # puis ouvrir http://localhost:8080

## Installer sur l'iPhone (une fois, ~5 min, gratuit)
Une PWA doit être servie en HTTPS pour fonctionner hors ligne. Le serveur ne sert que le code (public, sans données).
1. Publie le dossier `budget-app/` sur un hébergement statique gratuit, par exemple :
   - Cloudflare Pages ou Netlify : glisser-déposer le dossier (Netlify Drop : app.netlify.com/drop) ;
   - ou GitHub Pages.
2. Sur l'iPhone, ouvre l'adresse HTTPS **dans Safari**.
3. Bouton Partager → « Sur l'écran d'accueil » → Ajouter.
4. Ouvre l'app depuis l'icône (mode plein écran). Réglages ⚙️ → Sécurité → Activer le verrouillage (PIN, puis Face ID).
5. Fais ta première sauvegarde : Réglages → Données → Exporter une sauvegarde → enregistrer dans Fichiers/iCloud Drive.

## Mettre à jour
Remplace les fichiers sur l'hébergement et incrémente `VERSION` dans `sw.js`. Les données ne sont pas touchées.
