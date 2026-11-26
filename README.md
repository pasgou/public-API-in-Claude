# API publiques françaises dans Claude

Serveur MCP qui donne à Claude un accès direct aux API des administrations françaises, avec citation des sources officielles.

| Module | Source | Accès | Outils |
|---|---|---|---|
| Recherche d'entreprises | DINUM – recherche-entreprises.api.gouv.fr | libre (7 req/s par IP) | `entreprises_rechercher`, `entreprises_autour_point` |
| BOFiP-Impôts (en vigueur) | DGFiP – jeu `bofip-vigueur`, data.economie.gouv.fr | libre | `bofip_rechercher`, `bofip_document` |
| data.gouv.fr | Catalogue v1 + API tabulaire | libre | `datagouv_rechercher`, `datagouv_jeu_de_donnees`, `datagouv_donnees_tabulaires` |
| Sirene 3.11 | INSEE – api.insee.fr | clé INSEE (30 req/min) | `sirene_unite_legale`, `sirene_etablissement`, `sirene_rechercher`, `sirene_successions` |
| Légifrance | DILA via PISTE | OAuth2 PISTE | `legifrance_rechercher`, `legifrance_article`, `legifrance_consulter`, `legifrance_table_matieres`, `legifrance_lister_codes`, `legifrance_convention_collective` |
| Judilibre | Cour de cassation via PISTE | OAuth2 PISTE | `judilibre_rechercher`, `judilibre_decision`, `judilibre_taxonomie` |

`apis_publiques_statut` indique à tout moment les modules actifs et la procédure pour activer les autres. Un module sans identifiants n'expose aucun outil (pas de bruit dans le contexte de Claude).

## Installation

### Claude Desktop (installation graphique)

1. Télécharger `api-publiques-fr-<version>.mcpb` depuis la [dernière release](../../releases/latest) (ou le construire : `npm run pack:mcpb`).
2. Double-cliquer sur le fichier, ou Claude Desktop → Paramètres → Extensions → glisser le fichier.
3. Le formulaire d'installation propose les champs facultatifs : clé Sirene, Client ID / Secret PISTE, case « bac à sable ». Laisser vide = module désactivé. Les champs marqués `sensitive` sont masqués et stockés de façon sécurisée par l'application (spécification MCPB).

Prérequis : Node.js ≥ 20.3 disponible pour Claude Desktop (runtime intégré de l'application pour les extensions, ou Node installé sur le poste — à vérifier selon la version de Claude Desktop).

### Connecteur distant (claude.ai, Desktop, mobile, Cowork)

Une fois le serveur déployé (voir « Déploiement du serveur distant »), sa page d'accueil indique l'URL à saisir dans Claude : **Paramètres → Connecteurs → Ajouter un connecteur personnalisé**. À la connexion, Claude ouvre la page de connexion du serveur : chaque utilisateur y saisit ses propres identifiants INSEE / PISTE (facultatifs), les teste, puis autorise. Offres Team / Enterprise : l'ajout est réservé à un propriétaire de l'organisation.

### Claude Code

```bash
git clone <URL du dépôt> api-publiques-fr && cd api-publiques-fr && npm ci && npm run build
```

```bash
claude mcp add api-publiques-fr -s user -e INSEE_API_KEY=... -e PISTE_CLIENT_ID=... -e PISTE_CLIENT_SECRET=... -- node "$PWD/dist/index.js"
```

Omettre les `-e` des modules non souhaités.

## Obtenir les identifiants

**Sirene (INSEE)** — [portail-api.insee.fr](https://portail-api.insee.fr/) : « Connexion pour les externes » → créer un compte (éviter les accents) → créer une application en mode **simple** (pas « backend to backend ») → Catalogue → API Sirene → Souscrire, plan **Public** → la clé apparaît dans l'onglet Souscriptions de l'application. Pas d'expiration.

**PISTE (Légifrance, Judilibre)** — [piste.gouv.fr](https://piste.gouv.fr/) : créer une application en environnement **PRODUCTION**, accepter les CGU de Légifrance et JUDILIBRE **avant** de les sélectionner dans l'application (sinon la case reste grisée et la souscription n'est pas enregistrée, sans message d'erreur), puis vérifier la rubrique « API Souscrites ». Procédure détaillée : [docs/GUIDE_UTILISATEUR.md](docs/GUIDE_UTILISATEUR.md).

## Variables d'environnement

| Variable | Rôle | Défaut |
|---|---|---|
| `INSEE_API_KEY` | Active Sirene | — |
| `PISTE_CLIENT_ID`, `PISTE_CLIENT_SECRET` | Activent Légifrance et Judilibre | — |
| `PISTE_ENV` | `sandbox` (ou `true`) pour le bac à sable PISTE | production |
| `LEGIFRANCE_BASE_PATH` | Chemin de l'API Légifrance sur PISTE | `/dila/legifrance/lf-engine-app` |
| `JUDILIBRE_BASE_PATH` | Chemin de l'API Judilibre sur PISTE | `/cassation/judilibre/v1.0` |
| `MCP_USER_AGENT` | En-tête User-Agent (recommandé par l'API Recherche d'entreprises) | nom du projet |

Derrière un proxy d'entreprise : Node ≥ 22.21 honore `HTTPS_PROXY` avec `NODE_USE_ENV_PROXY=1`.

## Déploiement du serveur distant

Image Docker autonome (`Dockerfile`), sans base de données. Variables :

| Variable | Rôle |
|---|---|
| `PUBLIC_URL` | URL publique HTTPS du serveur, sans `/mcp` (ex. `https://mcp.exemple.fr`) |
| `SERVER_SECRET` | Clé de chiffrement des jetons, ≥ 32 octets aléatoires en base64url (`openssl rand -base64 48`). À conserver dans un coffre ; la changer déconnecte tous les utilisateurs |
| `PORT` | Port d'écoute (défaut 8080) |
| `CIMD_TRUSTED_HOSTS` | Hôtes autorisés à publier un document client CIMD (défaut `claude.ai,claude.com`) |
| `RATE_LIMIT_OAUTH` / `RATE_LIMIT_MCP` | Requêtes par minute : par IP sur les pages OAuth (30), par jeton sur `/mcp` (120) |

```bash
docker build -t api-publiques-fr .
```

```bash
docker run -d -p 8080:8080 -e PUBLIC_URL=https://mcp.exemple.fr -e SERVER_SECRET=... api-publiques-fr
```

Le serveur doit être joignable en HTTPS depuis Internet (terminaison TLS par l'hébergeur ou un reverse proxy). Fonctionnement :
- OAuth 2.1 intégré, conforme aux exigences des connecteurs Claude : métadonnées RFC 9728 / RFC 8414, client CIMD (prioritaire) ou enregistrement dynamique, PKCE S256, rafraîchissement avec rotation.
- Sans état : les identifiants de l'utilisateur sont chiffrés (AES-256-GCM) dans ses jetons ; le serveur ne stocke rien. Jeton d'accès 1 h, rafraîchissement 90 jours.
- Durcissement : limitation de débit (par jeton sur `/mcp`, le trafic de Claude provenant d'IP partagées), contrôle `Origin` du formulaire de connexion, aucune journalisation d'en-tête ni d'identifiant, image exécutée en utilisateur non-root et compatible avec un système de fichiers en lecture seule.
- Limites assumées : un jeton de rafraîchissement ne peut pas être révoqué individuellement avant expiration (révoquer la clé côté INSEE / PISTE, ou changer `SERVER_SECRET`) ; l'anti-rejeu des codes d'autorisation est en mémoire (une instance).

## Développement

```bash
npm run build && npm run smoke
```

```bash
npx tsx scripts/call.ts bofip_rechercher '{"texte":"crédit d impôt recherche","serie":"BIC"}'
```

```bash
npm run pack:mcpb
```

```bash
PUBLIC_URL=http://localhost:8080 SERVER_SECRET=$(openssl rand -base64 48) npm run start:remote
```

```bash
npm run e2e:remote
```

Choix techniques : TypeScript, SDK MCP v2 (`@modelcontextprotocol/server`), transports stdio (local) et Streamable HTTP (distant) ; réponses en JSON compact élagué (valeurs vides retirées, HTML converti en texte, textes longs par fenêtres de 20 000 caractères avec paramètre `debut`) ; 4 tentatives avec attente exponentielle sur erreurs réseau, 429 (`Retry-After` respecté) et 502–504.

Journal des versions : [docs/CHANGELOG.md](docs/CHANGELOG.md). Publication : workflow `Release` (tag `vX.Y.Z` ou lancement manuel). Guide utilisateur (configuration, tests de recette, dépannage) : [docs/GUIDE_UTILISATEUR.md](docs/GUIDE_UTILISATEUR.md). Sources documentaires et écarts constatés : [docs/SOURCES.md](docs/SOURCES.md). Feuille de route : [docs/ROADMAP.md](docs/ROADMAP.md).

## Avertissements

- Outil indépendant, non édité ni validé par la DINUM, l'INSEE, la DILA, la Cour de cassation ou la DGFiP.
- Sirene : les unités en **diffusion partielle** (art. R123-232-1 C. com.) ne doivent pas voir leurs informations personnelles rediffusées intégralement ni utilisées à des fins de prospection ; le serveur l'indique dans la réponse lorsqu'il en détecte.
- BOFiP : le jeu de données ne contient que les publications **en vigueur** ; pour une version antérieure, consulter l'onglet « Versions publiées » du permalien.
