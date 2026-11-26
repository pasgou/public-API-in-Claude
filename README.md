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

1. Télécharger `api-publiques-fr-<version>.mcpb` (onglet *Releases* du dépôt, ou `npm run pack:mcpb`).
2. Double-cliquer sur le fichier, ou Claude Desktop → Paramètres → Extensions → glisser le fichier.
3. Le formulaire d'installation propose les champs facultatifs : clé Sirene, Client ID / Secret PISTE, case « bac à sable ». Laisser vide = module désactivé. Les champs marqués `sensitive` sont masqués et stockés de façon sécurisée par l'application (spécification MCPB).

Prérequis : Node.js ≥ 20.3 disponible pour Claude Desktop (runtime intégré de l'application pour les extensions, ou Node installé sur le poste — à vérifier selon la version de Claude Desktop).

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

**PISTE (Légifrance, Judilibre)** — [piste.gouv.fr](https://piste.gouv.fr/) : créer un compte → une application SANDBOX est créée automatiquement ; pour la production, créer une application → demander l'accès aux API « Légifrance » et « JUDILIBRE » (acceptation des CGU de chaque API) → récupérer Client ID et Client Secret OAuth. Des identifiants SANDBOX ne fonctionnent qu'avec la case/variable bac à sable.

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

Choix techniques : TypeScript, SDK MCP v2 (`@modelcontextprotocol/server`), transport stdio ; réponses en JSON compact élagué (valeurs vides retirées, HTML converti en texte, textes longs par fenêtres de 20 000 caractères avec paramètre `debut`) ; 4 tentatives avec attente exponentielle sur erreurs réseau, 429 (`Retry-After` respecté) et 502–504.

Sources documentaires et écarts constatés : [docs/SOURCES.md](docs/SOURCES.md). Feuille de route : [docs/ROADMAP.md](docs/ROADMAP.md).

## Avertissements

- Outil indépendant, non édité ni validé par la DINUM, l'INSEE, la DILA, la Cour de cassation ou la DGFiP.
- Sirene : les unités en **diffusion partielle** (art. R123-232-1 C. com.) ne doivent pas voir leurs informations personnelles rediffusées intégralement ni utilisées à des fins de prospection ; le serveur l'indique dans la réponse lorsqu'il en détecte.
- BOFiP : le jeu de données ne contient que les publications **en vigueur** ; pour une version antérieure, consulter l'onglet « Versions publiées » du permalien.
