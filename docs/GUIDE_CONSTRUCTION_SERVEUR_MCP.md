# Guide de construction d'un serveur MCP pour API publiques

Mis à jour le 27/11/2026 – état du dépôt : version 0.2.1

Projet développé par Khétys. Dépôt : https://github.com/pasgou/public-API-in-Claude

## Objet et usage

Ce guide décrit les décisions, gabarits et pièges du présent dépôt pour qu'ils soient réutilisés lors de la construction d'un autre serveur MCP du même type : connexion de Claude à une ou plusieurs API publiques, en local (stdio, bundle `.mcpb`) et à distance (connecteur personnalisé Claude, OAuth).

Il ne retrace pas l'historique du projet. Chaque section renvoie au fichier du dépôt qui fait foi ; en cas d'écart, le code l'emporte sur ce guide.

| Besoin | Section |
| --- | --- |
| Trouver et lire la documentation d'une API | 1 |
| Poser l'ossature du serveur | 2 |
| Écrire un outil | 3 |
| Livrer un bundle Claude Desktop | 4 |
| Exposer un connecteur distant (OAuth) | 5 |
| Déployer | 6 |
| Tester | 7 |
| Éviter les pièges connus | 8 |
| Démarrer un nouveau serveur | 9 (liste de contrôle) |
| Utiliser le skill mcp-builder | 10 |

---

## 1. Méthode documentaire

### 1.1 Règle

N'implémenter qu'à partir des documentations officielles : spécification OpenAPI publiée par l'administration ou référencée par elle, pages du portail développeur, guides PDF. Aucun code tiers repris, aucun paramètre deviné. Quand la documentation et le service divergent, le constat est consigné (1.4) et le contournement est surchargeable par variable d'environnement.

### 1.2 Trouver la spécification : catalogue data.gouv.fr

Le catalogue des API de l'État (objets `dataservices`) donne, pour chaque API, l'URL de base, l'URL de la spécification OpenAPI et les limites d'usage :

```
GET https://www.data.gouv.fr/api/1/dataservices/?q=<nom de l'API>
```

Champs utiles de la réponse : `base_api_url`, `machine_documentation_url` (spécification OpenAPI), `technical_documentation_url`, `rate_limiting`, `access_type`. Le serveur expose lui-même cette recherche (`datagouv_rechercher`, `type: "dataservices"`, `src/tools/datagouv.ts`), ce qui permet de l'utiliser depuis Claude pendant la conception.

Toutes les spécifications du projet ont été localisées par ce moyen (`docs/SOURCES.md`, « Point d'entrée commun »). La spécification référencée peut être hébergée hors du domaine de l'administration (dépôt GitHub de l'éditeur, dépôt collectif de swaggers) : la consigner telle quelle avec sa version.

### 1.3 Lire les PDF et les pages de portail

Certaines informations n'existent que dans des guides PDF ou des pages de portail : points d'accès OAuth (guide utilisateur PISTE, § 7.5 et annexe 12.2), syntaxe de recherche (pages « Comment interroger l'API Sirene » et « Recherche multicritère » du portail INSEE). Les lire en entier avant d'écrire les schémas d'entrée ; citer le paragraphe en commentaire d'en-tête du module :

```ts
/**
 * Authentification PISTE (AIFE) : OAuth2 « client credentials ».
 * Source : guide utilisateur PISTE, § 7.5 et annexe 12.2 (points d'accès).
 */
```
(`src/piste.ts`)

### 1.4 Registre des sources et des écarts

Tenir `docs/SOURCES.md` sur le modèle du dépôt, avec trois blocs :

1. **Sources** : un tableau API / spécification utilisée (URL) / version / authentification / limite documentée, daté (« consultées le JJ/MM/AAAA »).
2. **Écarts documentation / service réel** : numéro, API, ce que dit la documentation, ce qui est constaté, contournement retenu. Un écart sans contournement documenté n'est pas clos.
3. **Recettes** : date, périmètre validé, et surtout ce qui **reste non testé**.

Reporter chaque écart à deux autres endroits : en commentaire d'en-tête du module concerné (ex. `src/tools/legifrance.ts`) et, si l'utilisateur est concerné, dans le guide utilisateur (procédure, dépannage).

### 1.5 Descriptions d'outils : ne rien inventer

Les descriptions d'outils et les instructions du serveur sont lues par le modèle comme des faits. N'y mettre que :

- des exemples de syntaxe tirés de la documentation (ex. `periode(activitePrincipaleUniteLegale:69.20Z AND etatAdministratifUniteLegale:A)`, `src/tools/sirene.ts`) ;
- des valeurs d'énumération listées par la spécification ;
- des renvois vers d'autres outils du serveur.

Jamais d'identifiant de document, d'article, de décision ou d'entreprise présenté comme exemple réel s'il n'a pas été vérifié.

Les instructions du serveur rappellent la règle au modèle (`src/server.ts`) :

```ts
instructions:
  "Sources officielles françaises. Citer systématiquement la source renvoyée (...) avec sa date de version. " +
  "Ne jamais compléter une référence absente des résultats. Si un module attendu manque, appeler apis_publiques_statut.",
```

### 1.6 Anonymat des données d'exemple et de test

Le contributeur du projet est nommé (auteur du dépôt, du bundle, des guides : `package.json`, `mcpb/manifest.json`, section « Contributeur » du `README.md`). En revanche, les personnes et entreprises ayant servi aux essais n'apparaissent nulle part : aucune entreprise nommée, aucun SIREN ou SIRET réel, aucun nom de personne dans les exemples de recherche, les descriptions d'outils, les tests (`scripts/smoke.ts`), les recettes ni les messages de commit. Utiliser des recherches par critères (code NAF, département, label) ou des références juridiques publiques (article de code, identifiant BOI, numéro de pourvoi publié). Le contributeur lui-même ne sert pas d'exemple de connexion ou de recherche.

---

## 2. Architecture

### 2.1 Choix de base

| Choix | Retenu | Raison |
| --- | --- | --- |
| Langage | TypeScript strict, ESM, Node ≥ 20.3 | SDK de référence, compatible MCPB, typage des réponses |
| SDK | MCP v2 : `@modelcontextprotocol/server`, `/express`, `/node` ; client `@modelcontextprotocol/client` en développement | Version stable courante (la v1 `@modelcontextprotocol/sdk` ne reçoit plus que des correctifs) |
| Validation | zod v4 (`import * as z from "zod/v4"`), `z.strictObject` | Paramètres inconnus refusés, erreurs lisibles par le modèle |
| Transports | stdio (local) et Streamable HTTP sans état (distant) | Un seul code d'outils pour les deux |
| Serveur HTTP | Express 5 + intergiciels du SDK (`hostHeaderValidation`, `originValidation`, `requireBearerAuth`, `mcpAuthMetadataRouter`) | Contrôles fournis par le SDK, ordre des routes maîtrisé (sonde de santé avant le contrôle `Host`, section 8, piège 13) |
| Dépendances d'exécution | 5 (`package.json`) | Surface réduite, bundle léger |

Arborescence :

```
src/
  index.ts          entrée stdio
  server.ts         factory createServer(creds)
  config.ts         configuration statique + identifiants
  http.ts           client HTTP unique
  format.ts         élagage, HTML → texte, fenêtres, annotations
  piste.ts          OAuth client credentials (fournisseur d'API)
  tools/<module>.ts un fichier par API, une fonction registerX(server, creds)
  remote/           serveur distant : main, oauth, seal, check, pages, ratelimit
scripts/            smoke.ts, remote-e2e.ts, call.ts, build-mcpb.sh
mcpb/               manifest.json, icon.png
```

### 2.2 Factory partagée et modules conditionnels

Une seule fonction construit le serveur pour un jeu d'identifiants ; l'entrée locale et l'entrée distante l'appellent (`src/server.ts`) :

```ts
export function createServer(creds: Credentials): McpServer {
  const server = new McpServer({ name: "api-publiques-fr", version: VERSION }, { instructions: "..." });
  registerStatut(server, creds);
  registerEntreprises(server);          // modules libres : toujours
  if (hasInsee(creds)) registerSirene(server, creds);
  if (hasPiste(creds)) { registerLegifrance(server, creds); registerJudilibre(server, creds); }
  return server;
}
```

- **stdio** (`src/index.ts`) : `serveStdio(() => createServer(credentialsFromEnv()))`.
- **HTTP** (`src/remote/main.ts`) : `createMcpHandler(({ authInfo }) => createServer(authInfo?.extra?.creds ?? {}))` — une instance par requête, avec les identifiants de l'utilisateur extraits de son jeton.

Un module sans identifiants n'enregistre **aucun outil** : pas de bruit dans le contexte du modèle, pas d'appel voué au 401. Les identifiants sont passés en paramètre, jamais lus dans `process.env` depuis un outil : c'est ce qui rend le même code utilisable en multi-utilisateur.

### 2.3 Configuration

`src/config.ts` sépare :

- la **configuration statique** commune (`config` : User-Agent, URL de base, chemins surchargeables comme `LEGIFRANCE_BASE_PATH`) ;
- les **identifiants par utilisateur** (`Credentials`), lus de l'environnement en local, du jeton en distant.

Une seule fonction lit l'environnement et neutralise les valeurs vides et les gabarits MCPB non substitués :

```ts
export function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v || v.startsWith("${")) return undefined;
  return v;
}
```

### 2.4 Outil de statut

Toujours exposé (`src/tools/statut.ts`) : liste des modules, actifs ou non, mode d'accès et procédure d'obtention des identifiants. La description dit quand l'appeler (« si un outil attendu est absent »). Le statut « actif » signifie seulement « identifiants chargés » : le guide utilisateur le précise, et la page de connexion distante teste réellement les identifiants (5.6).

### 2.5 Client HTTP unique

Tous les appels passent par `request()` (`src/http.ts`) :

| Règle | Valeur |
| --- | --- |
| Délai par tentative | 30 s (`AbortSignal.timeout`), combiné au signal d'annulation MCP (`AbortSignal.any`) |
| Tentatives | 4, sur erreur réseau, 429, 502, 503, 504 |
| Attente | HTTP : `Retry-After` respecté, à défaut 1 s × n° de tentative, plafonné à 10 s ; erreur réseau : 1, 2, 4, 8 s |
| En-têtes | `User-Agent` configurable, `Accept: application/json` |
| Corps | `json` ou `form` (form-urlencoded) |
| Erreurs | `ApiError(service, status, détail)` avec message actionnable en français |

Messages par code (extrait) :

```ts
case 403:
  return `${service} : accès refusé (HTTP 403). L'application n'est probablement pas abonnée à cette API sur le portail, ou les CGU n'ont pas été acceptées.${d}`;
case 429:
  return `${service} : quota dépassé (HTTP 429). Attendre avant de relancer.${d}`;
```

Le message nomme le service, le code, la cause probable et l'action. Le détail brut de l'API est tronqué à 400 caractères ; il est retiré des messages affichés à l'utilisateur final sur la page de connexion (`src/remote/check.ts`).

Une erreur levée dans un outil est renvoyée par le SDK au modèle sous forme de résultat `isError` : inutile de l'attraper pour la reformater.

### 2.6 Réponses compactes

Décision : **JSON compact, sans indentation, élagué**, en un seul bloc texte (`src/format.ts`).

| Fonction | Rôle |
| --- | --- |
| `prune(value, drop?)` | Retire récursivement `null`, chaînes vides, tableaux et objets vides, et les clés listées dans `drop` (champs obsolètes, techniques, ou retirés par minimisation des données personnelles) |
| `stripHtml` / `deepStripHtml` | Convertit le HTML en texte en conservant les paragraphes ; `deepStripHtml` ne touche que les chaînes contenant des balises |
| `json(data, note?)` | Sérialise ; préfixe une note (avertissement juridique) ; tronque au-delà de 25 000 caractères avec un message qui invite à réduire la requête |
| `window(text, offset, 20_000)` | Découpe un texte long ; renvoie `suite` : « Texte de N caractères ; extrait a–b. Rappeler avec debut=b pour la suite. » |
| `readOnly` | Annotations communes (3.3) |

Réductions propres à une API : ne garder que la période Sirene en cours sauf `historique=true` (`trimPeriods`), ne garder que les compléments vrais ou renseignés de l'Annuaire des entreprises (`compact`), tronquer les descriptions de jeux de données (`trunc`).

### 2.7 Authentification OAuth client credentials avec cache

Gabarit pour un fournisseur d'API qui délivre des jetons machine (`src/piste.ts`) :

- jeton demandé en `POST` form-urlencoded (`grant_type=client_credentials`, `client_id`, `client_secret`, `scope`) ;
- **cache par jeu d'identifiants**, clé = SHA-256 de l'environnement, de l'identifiant et du secret (le secret n'est jamais une clé de `Map` en clair) ; renouvellement 30 s avant expiration ; cache borné à 1 000 entrées ;
- `pisteRequest()` renouvelle le jeton **une fois** sur 401, puis abandonne ;
- message dédié sur `invalid_client` (identifiants de bac à sable utilisés en production, ou l'inverse).

Le cache est partagé entre les requêtes HTTP du même utilisateur en distant, ce qui évite un aller-retour OAuth par appel d'outil.

---

## 3. Conception des outils

### 3.1 Nommage

`<module>_<verbe ou objet>`, en français, en snake_case : `bofip_rechercher`, `bofip_document`, `sirene_unite_legale`, `legifrance_table_matieres`. Le préfixe regroupe les outils d'une même API, évite les collisions avec d'autres serveurs connectés à Claude et sert dans l'outil de statut (`outils: "sirene_*"`). Le serveur de statut est préfixé par le nom du serveur (`apis_publiques_statut`).

### 3.2 Descriptions

Une description répond à quatre questions, dans cet ordre : ce que fait l'outil, ce qu'il renvoie, un exemple de paramètres, **quand utiliser un autre outil**. Exemple (`src/tools/sirene.ts`) :

```
"Recherche multicritère dans le répertoire Sirene (syntaxe INSEE). " +
"Variables non historisées : `siren:3*` (...). Variables historisées entourées de periode() : (...). " +
"Pour une recherche simple par nom, préférer entreprises_rechercher (sans quota)."
```

Autres règles appliquées :

- signaler le périmètre réel quand le nom est trompeur (« CETAT : Conseil d'État ET cours administratives d'appel », `src/tools/legifrance.ts`) ;
- indiquer l'outil qui fournit un identifiant attendu (« Les identifiants de codes s'obtiennent avec legifrance_lister_codes ») ;
- `.describe()` sur chaque paramètre non évident, avec format (`AAAA-MM-JJ`) et exemple ;
- contraintes dans le schéma plutôt que dans le texte : `regex(/^\d{9}$/)`, `min`, `max`, `enum`, `startsWith("LEGIARTI")` ;
- valeurs par défaut prudentes (`par_page` 5 à 10) pour limiter la taille des réponses.

Le champ `title` porte un libellé lisible (« Sirene : unité légale (SIREN) ») affiché par les clients.

### 3.3 Annotations

Toutes les API du dépôt sont en lecture seule ; un objet commun est passé à chaque outil :

```ts
export const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
```

Pour une API en écriture, définir les annotations outil par outil ; ne jamais réutiliser `readOnly` par commodité.

### 3.4 Pagination

Reprendre le paramètre de l'API (page, offset, `debut`, `decalage`) sous un nom français cohérent, et renvoyer systématiquement un champ `suite` qui dit comment obtenir la page suivante :

```ts
...(header?.total && fin < header.total ? { suite: `Rappeler avec debut=${fin}` } : {}),
```

Toujours renvoyer `total` quand l'API le fournit. Pour un texte unique trop long (décision, publication), utiliser `window()` et le paramètre `debut` (2.6). Pour les réponses de consultation au format variable (Légifrance), la fenêtre s'applique au JSON sérialisé.

Cas particulier : quand l'API ne trie pas par pertinence, reclasser localement une fenêtre de résultats et paginer dans cette fenêtre (BOFiP, 8.2).

### 3.5 Avertissements juridiques intégrés aux réponses

Quand une contrainte légale pèse sur la réutilisation des données, l'outil la signale **dans la réponse**, au moment où elle s'applique, plutôt que dans la seule description. Exemple Sirene (`src/tools/sirene.ts`) :

```ts
const NOTE_DIFFUSION =
  "Unités en diffusion partielle (statutDiffusion = P, art. R123-232-1 C. com.) : informations personnelles à ne pas rediffuser intégralement ni utiliser à des fins de prospection.";
const out = (data: unknown) => json(prune(data), hasPartial(data) ? NOTE_DIFFUSION : undefined);
```

Même logique de minimisation en amont : la date de naissance des dirigeants est retirée des réponses de l'Annuaire des entreprises (`DROP`, `src/tools/entreprises.ts`). La référence citée dans l'avertissement doit avoir été vérifiée à la source (1.5).

### 3.6 Gabarit d'outil

```ts
server.registerTool(
  "module_rechercher",
  {
    title: "Module : rechercher",
    description: "Ce que fait l'outil. Ce qu'il renvoie. Ex. q='…'. Détail : module_document.",
    inputSchema: z.strictObject({
      q: z.string().min(2).describe("Termes recherchés"),
      page: z.number().int().min(1).default(1),
      par_page: z.number().int().min(1).max(25).default(10),
    }),
    annotations: readOnly,
  },
  async (a, ctx) => {
    const d = await request<{ total: number; results: unknown[] }>(`${BASE}/search`, {
      service: SERVICE,
      query: { q: a.q, page: a.page, per_page: a.par_page },
      signal: ctx.mcpReq.signal,          // annulation propagée à l'API
    });
    const fin = (a.page - 1) * a.par_page + d.results.length;
    return json(prune({ total: d.total, resultats: d.results, ...(fin < d.total ? { suite: `Rappeler avec page=${a.page + 1}` } : {}) }));
  },
);
```

---

## 4. Distribution locale

### 4.1 Bundle `.mcpb` (Claude Desktop)

Source : spécification MCPB `MANIFEST.md` (dépôt modelcontextprotocol/mcpb), manifest 0.3. Fichier : `mcpb/manifest.json`.

Points de conception :

- `server.type: "node"`, `entry_point: "server/index.js"`, `mcp_config.args: ["${__dirname}/server/index.js"]` ;
- `user_config` : un champ par identifiant, tous `required: false` (module désactivé si vide) ; `sensitive: true` pour les secrets (champ masqué, stockage sécurisé par l'application), `false` pour un identifiant public (Client ID) ; un booléen pour le bac à sable ;
- `mcp_config.env` relie chaque variable à `${user_config.x}`. Un champ non rempli peut arriver **vide ou sous forme du gabarit non substitué** : `env()` traite les deux comme absents (2.3). Un booléen arrive en chaîne (`"true"` / `"false"`) ;
- `tools` : liste déclarative affichée à l'installation, à tenir synchronisée avec les outils réellement enregistrés ;
- `long_description` : modules libres, modules à clé, où obtenir les clés, mention d'indépendance vis-à-vis des administrations ;
- `compatibility.runtimes.node` aligné sur `engines` de `package.json`.

Construction (`scripts/build-mcpb.sh`, `npm run pack:mcpb`) :

```bash
npx esbuild src/index.ts --bundle --platform=node --target=node20 --format=esm \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
  --outfile=mcpb/build/server/index.js
npx mcpb validate mcpb/build/manifest.json
npx mcpb pack mcpb/build "dist/api-publiques-fr-${VERSION}.mcpb"
```

Un seul fichier JS, sans `node_modules` : bundle léger, pas d'installation de dépendances sur le poste. La bannière `createRequire` est nécessaire pour les dépendances CommonJS embarquées dans un bundle ESM. `mcpb validate` est exécuté avant `pack` et fait échouer la construction.

### 4.2 Claude Code

```bash
claude mcp add <nom> -s user -e CLE_API=... -- node "$PWD/dist/index.js"
```

Omettre les `-e` des modules non souhaités. Documenté dans le `README.md`.

### 4.3 Releases GitHub

Workflow `.github/workflows/release.yml` :

| Élément | Choix |
| --- | --- |
| Déclencheurs | tag `v*`, ou lancement manuel avec `version`, `target` (SHA complet), `latest`, `replace` |
| Garde-fou | la version demandée doit égaler celle de `mcpb/manifest.json` du commit construit, sinon échec |
| Construction | `npm ci`, `npm run build`, `npm run pack:mcpb` |
| Artefacts | `.mcpb` + empreinte `.sha256` |
| Notes | section `## <version>` extraite de `docs/CHANGELOG.md` du commit de lancement |
| Publication | `gh release create`, ou `upload --clobber` si la release existe ; `replace` supprime release et tag avant republication |
| Droits | `permissions: contents: write`, jeton `github.token` |
| Suite | sa réussite déclenche le déploiement (6.2) |
| Actions | `actions/checkout@v5`, `actions/setup-node@v5` (Node 22, cache npm) |

Le paramètre `target` exige un SHA complet : `actions/checkout` n'accepte pas un SHA abrégé.

Versions à synchroniser à chaque publication (aucune n'est dérivée des autres) : `package.json`, `mcpb/manifest.json`, `VERSION` dans `src/server.ts`, User-Agent par défaut dans `src/config.ts`, et une section dans `docs/CHANGELOG.md`.

---

## 5. Serveur distant pour les connecteurs personnalisés Claude

Le serveur distant permet l'usage depuis claude.ai, Claude Desktop, mobile et Cowork. Chaque utilisateur s'y connecte avec **ses propres** identifiants d'API. Code : `src/remote/`.

### 5.1 Exigences relevées dans la documentation des connecteurs Claude

Source : documentation Claude sur l'authentification des connecteurs (référencée en tête de `src/remote/oauth.ts`). La spécification MCP elle-même reste à relire à la source (`docs/ROADMAP.md`, point 3).

| Exigence | Mise en œuvre |
| --- | --- |
| Requête non authentifiée sur `/mcp` : 401 avec `WWW-Authenticate` contenant `resource_metadata` | `requireBearerAuth({ verifier, expectedResource, resourceMetadataUrl })` |
| Métadonnées de ressource protégée (RFC 9728) | `mcpAuthMetadataRouter` : `/.well-known/oauth-protected-resource…` |
| Métadonnées du serveur d'autorisation (RFC 8414) | même routeur : `/.well-known/oauth-authorization-server` |
| Enregistrement du client : CIMD prioritaire, DCR en repli | `client_id_metadata_document_supported: true` ; `POST /register` (RFC 7591) |
| PKCE S256 obligatoire | `code_challenge_methods_supported: ["S256"]`, refus de toute autre méthode |
| Client public | `token_endpoint_auth_methods_supported: ["none"]` |
| `authorization_code` + `refresh_token` avec rotation | nouveau jeton de rafraîchissement à chaque échange |
| `/token` en `application/x-www-form-urlencoded` | autre type de contenu : 415 |
| URL de rappel de Claude | `https://claude.ai/api/mcp/auth_callback` (déclarée par le client, vérifiée à l'autorisation) |
| Paramètre `resource` | comparé à l'URL `/mcp` sur `/authorize` et `/token` (`invalid_target`) |
| Paramètre `iss` dans la réponse d'autorisation | `authorization_response_iss_parameter_supported: true`, `iss` ajouté à toutes les redirections |

Métadonnées publiées (`src/remote/main.ts`) :

```ts
const oauthMetadata = {
  issuer, authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`,
  registration_endpoint: `${issuer}/register`,
  response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["offline_access"], client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
};
```

### 5.2 Résolution du client

`resolveClient()` (`src/remote/oauth.ts`) :

- **CIMD** : le `client_id` est une URL https. L'hôte doit figurer dans `CIMD_TRUSTED_HOSTS` (défaut `claude.ai,claude.com`) ; le document est récupéré sans suivre de redirection, en 5 s maximum, limité à 20 000 caractères, mis en cache 10 minutes ; son `client_id` doit égaler son URL ; `redirect_uris` obligatoire. Le libellé affiché à l'utilisateur est l'hôte (vérifiable), pas `client_name` (auto-déclaré).
- **DCR** : le `client_id` émis est lui-même un blob scellé contenant les `redirect_uris` (5.3) ; aucune base de clients.
- **Redirections** : correspondance exacte, sauf sur boucle locale (`localhost`, `127.0.0.1`, `[::1]`) où le port est ignoré (clients en ligne de commande).
- Client ou `redirect_uri` douteux : page d'erreur 400, **jamais de redirection** (RFC 6749, § 4.1.2.1). Les autres erreurs (`response_type`, PKCE, `resource`) sont renvoyées par redirection avec `state` et `iss`.

### 5.3 Conception sans état : jetons scellés

`src/remote/seal.ts`. Le serveur ne stocke rien : les identifiants INSEE / PISTE de l'utilisateur voyagent chiffrés dans ses propres jetons.

- Format : `base64url(IV 12 octets | tag GCM 16 octets | JSON chiffré)`, AES-256-GCM ; le JSON contient `exp`.
- Une clé par usage, dérivée de `SERVER_SECRET` par HKDF-SHA256 (`info = seal:<usage>`) : `client`, `form`, `code`, `access`, `refresh`. Un code d'autorisation ne peut pas être présenté comme jeton d'accès.
- `open()` renvoie `undefined` si le jeton est falsifié, d'un autre usage ou expiré ; aucune exception ne remonte.
- `SERVER_SECRET` : au moins 32 octets en base64url (`openssl rand -base64 48`), vérifié au démarrage.

Durées (`TTL`) : formulaire 15 min, code 5 min, accès 1 h, rafraîchissement 90 jours, client DCR 10 ans.

Chaîne complète : `/register` scelle le client → `GET /authorize` scelle l'état du formulaire (client, redirection, PKCE, `state`, ressource) dans un champ caché → `POST /authorize` scelle un code contenant les identifiants et un `jti` → `/token` vérifie client, redirection, PKCE et `jti`, puis émet accès et rafraîchissement scellés → `verifyAccessToken` ouvre le jeton et place les identifiants dans `authInfo.extra.creds` → `createServer(creds)`.

### 5.4 Limites assumées de la conception sans état

À exposer dans le README et à réexaminer avant tout usage à plus grande échelle :

| Limite | Conséquence | Parade disponible |
| --- | --- | --- |
| Pas de révocation individuelle | un jeton de rafraîchissement reste valable jusqu'à expiration | révoquer la clé côté fournisseur d'API, ou changer `SERVER_SECRET` (déconnecte tout le monde) |
| Rotation sans invalidation | l'ancien jeton de rafraîchissement reste utilisable après rotation (aucune liste noire) | idem ; une liste de jetons consommés imposerait un stockage partagé |
| Anti-rejeu des codes en mémoire | valable pour une seule instance ; perdu au redémarrage (fenêtre de 5 min) | une instance, ou stockage partagé |
| Limitation de débit en mémoire | compteurs par instance | une instance, ou stockage partagé |
| Taille des jetons | les identifiants chiffrés allongent les jetons | acceptable pour quelques champs |
| Changement de `SERVER_SECRET` | tous les utilisateurs doivent se reconnecter | conserver le secret dans un coffre |

### 5.5 Page de connexion

`src/remote/pages.ts`, servie par `GET /authorize` :

- un bloc par fournisseur d'identifiants, chaque champ facultatif, secrets en `type="password"`, `autocomplete="off"`, `spellcheck="false"` ;
- trois boutons : **Autoriser**, **Tester les identifiants**, **Refuser** (`access_denied`) ;
- rappel des modules disponibles sans identifiant ;
- échappement systématique de toute valeur réinjectée (`esc`) ;
- `noindex`, gabarit responsive, thème clair et sombre (`prefers-color-scheme`) ;
- page d'accueil `/` : URL `/mcp` à saisir dans Claude et procédure d'ajout du connecteur.

### 5.6 Test réel des identifiants

`src/remote/check.ts` : une requête réelle par module avant d'émettre le code (point de contrôle léger : `/informations` Sirene, `/consult/ping` Légifrance, `/healthcheck` Judilibre, jeton PISTE forcé). Si un test échoue, l'autorisation est refusée et la page réaffiche les champs avec le résultat par module. Le 403 est traduit en procédure (« application non souscrite ou CGU non acceptées »). C'est la seule façon de distinguer « identifiants chargés » et « accès effectif » (2.4).

### 5.7 Durcissement

| Mesure | Mise en œuvre | Raison |
| --- | --- | --- |
| Limitation de débit OAuth | 30 req/min **par IP** sur `/register`, `/authorize` et `/token` (`RATE_LIMIT_OAUTH`) | empêcher l'usage de la page comme banc d'essai de clés |
| Limitation de débit MCP | 120 req/min **par jeton** sur `/mcp` (`RATE_LIMIT_MCP`), clé = SHA-256 tronqué de l'en-tête `Authorization` | le trafic de Claude vient de quelques IP partagées entre tous ses utilisateurs : une limite par IP bloquerait tout le monde |
| Réponse de limitation | 429 + `Retry-After: 60` | comportement attendu par les clients |
| Contrôle `Origin` | `originValidation([hôte public])` sur `POST /authorize` | refuser un formulaire soumis depuis un autre site |
| DNS rebinding | `hostHeaderValidation([hôte public, localhost, 127.0.0.1])`, appliqué après la route `/health` | refuser un en-tête `Host` inattendu |
| HTTPS | `PUBLIC_URL` en https obligatoire, http toléré pour `localhost` seulement | jetons et secrets en transit |
| Taille des corps | `express.urlencoded({ limit: "32kb" })` (formulaires OAuth), `express.json({ limit: "4mb" })` (messages MCP) | |
| En-tête `X-Powered-By` | désactivé | ne pas exposer la pile |
| `Cache-Control: no-store` | sur les réponses de `/token` | |
| Journalisation | aucune donnée sensible : ni en-tête `Authorization`, ni identifiant | |
| Conteneur | utilisateur `node` (non-root), compatible système de fichiers en lecture seule | |

Point à vérifier lors du déploiement : `app.set("trust proxy", true)` fait confiance à tout `X-Forwarded-For` ; derrière un hébergeur, restreindre au nombre de mandataires connus, sinon la limite par IP des pages OAuth est contournable.

---

## 6. Déploiement

### 6.1 Image Docker

`Dockerfile`, deux étapes sur `node:22-alpine` :

1. construction : `npm ci`, `npx tsc` ;
2. exécution : `npm ci --omit=dev`, puis **suppression de npm et npx** de l'image finale (inutiles à l'exécution, source fréquente d'alertes de vulnérabilité), copie de `dist/`, `USER node`, `EXPOSE 8080`, `HEALTHCHECK` sur `/health`, `CMD ["node", "dist/remote/main.js"]`.

`.dockerignore` exclut `node_modules`, `dist`, `mcpb`, `.git`, `*.mcpb`.

Variables d'exécution :

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `PUBLIC_URL` | oui | URL publique HTTPS, sans `/mcp` |
| `SERVER_SECRET` | oui | clé de scellement (secret, à stocker dans un coffre) |
| `PORT` | non | 8080 |
| `CIMD_TRUSTED_HOSTS` | non | `claude.ai,claude.com` |
| `RATE_LIMIT_OAUTH`, `RATE_LIMIT_MCP` | non | 30 et 120 |
| `GIT_SHA` | non | commit déployé, renvoyé par `/health` (`commit`, défaut `local`) pour vérifier le déploiement |

La terminaison TLS est assurée par l'hébergeur ou un mandataire inverse. Contraintes héritées de 5.4 : **une seule instance** tant que l'anti-rejeu et la limitation de débit sont en mémoire.

`/health` renvoie `{ ok, version, commit }` et est déclarée **avant** le contrôle de l'en-tête `Host` : les sondes de l'hébergeur appellent l'adresse interne du conteneur, pas le nom public (`src/remote/main.ts`).

### 6.2 Déploiement automatisé vers Scaleway Serverless Containers

Workflow `.github/workflows/deploy-scaleway.yml` ; procédure de mise en place dans le `README.md` (« Déploiement automatique sur Scaleway »). Sources citées en tête du workflow : documentation de la CLI Scaleway (`container.md`, `registry.md`), action `scaleway/action-scw`, pages Scaleway sur la poussée d'images, les limites des conteneurs et les domaines personnalisés. Le site de documentation Scaleway refuse les lecteurs automatiques (403) : la documentation a été lue dans les dépôts officiels `scaleway/docs-content` (fichiers `.mdx`), `scaleway/scaleway-cli` (`docs/commands/container.md`, `registry.md`, `cookbook.md`) et `scaleway/action-scw`.

**Déclencheurs** : lancement manuel, ou fin **réussie** du workflow `Release` (`workflow_run`, condition `conclusion == 'success'`). Après une release, si les secrets Scaleway ne sont pas configurés, le workflow émet un avertissement et ignore toutes les étapes (sortie `ok=false`) au lieu d'échouer ; lancé à la main, il échoue. Le code extrait est celui de la release (`workflow_run.head_sha`). `concurrency` sans annulation : deux déploiements ne se chevauchent pas. Droits GitHub : `contents: read`.

**Configuration GitHub** (noms seulement) :

| Type | Nom | Rôle |
| --- | --- | --- |
| Secret | `SCW_ACCESS_KEY`, `SCW_SECRET_KEY` | clé d'API d'une application IAM dédiée, limitée à Container Registry et Serverless Containers sur le projet |
| Secret | `SCW_DEFAULT_PROJECT_ID`, `SCW_DEFAULT_ORGANIZATION_ID` | projet et organisation cibles |
| Variable | `PUBLIC_URL` (facultative) | domaine personnalisé ; à défaut, domaine fourni par Scaleway |

La première étape vérifie la présence des quatre secrets (échec explicite en lancement manuel, déploiement ignoré après une release, voir ci-dessus).

**Étapes** :

| # | Étape | Points notables |
| --- | --- | --- |
| 1 | CLI Scaleway | `scaleway/action-scw@v0`, configuration exportée pour les étapes suivantes |
| 2 | Registre privé | créé s'il n'existe pas (`is-public=false`), région `fr-par` ; image étiquetée par les 12 premiers caractères du commit |
| 3 | Construction | `docker build` |
| 4 | Contrôle de sécurité | Trivy sur l'image : vulnérabilités `HIGH` et `CRITICAL` **corrigeables** bloquantes (`--ignore-unfixed --exit-code 1`) |
| 5 | Poussée | `docker push` |
| 6 | Espace de conteneurs | créé s'il n'existe pas ; attente de l'état `ready` (5 min maximum) |
| 7 | Conteneur | à la création : `min-scale=1 max-scale=1` (une instance permanente, cf. 5.4), 256 Mo, 0,14 vCPU, port 8080, `https-connections-only`, sonde `/health`, et **`SERVER_SECRET` généré dans le workflow, masqué, transmis comme variable secrète Scaleway**, jamais stocké dans GitHub ; à chaque passage : mise à jour de l'image, de `PUBLIC_URL` et de `GIT_SHA` seulement (le secret existant est conservé) |
| 8 | Vérification | `/health` doit renvoyer le commit attendu (10 min maximum, redéploiement forcé une fois à 3 min) ; `POST /mcp` sans jeton doit répondre 401 ; `/.well-known/oauth-protected-resource/mcp` doit annoncer `resource = <URL>/mcp` ; résumé de l'exécution avec l'URL à saisir dans Claude |

Choix à retenir pour un autre serveur :

- **idempotence** : chaque ressource est recherchée par nom avant création ; le même workflow sert au premier déploiement et aux suivants ;
- **secret de scellement créé côté hébergeur** : aucun humain ni GitHub ne le détient ; le perdre ou le régénérer déconnecte tous les utilisateurs ;
- **vérification par commit** (`GIT_SHA` dans `/health`) plutôt que par simple disponibilité : détecte un conteneur resté sur l'ancienne image ;
- **contrôle de la découverte OAuth** après déploiement, puisque `PUBLIC_URL` conditionne `issuer` et `resource`.

Domaine personnalisé : enregistrement DNS CNAME vers le domaine Scaleway, ajout dans la console, attente de l'état `ready`, renseignement de la variable `PUBLIC_URL`, relance du workflow. Changer d'URL publique invalide les connexions existantes (la ressource est inscrite dans les jetons) : chaque utilisateur se reconnecte.

Points de vigilance : l'image Trivy (`aquasec/trivy:latest`) et l'action (`scaleway/action-scw@v0`) ne sont pas épinglées sur une version exacte ; les épingler (version ou SHA) pour un déploiement reproductible.

Restent hors workflow : retour arrière (relancer le workflow sur un commit antérieur par une release, ou mettre à jour l'image à la main), `npm run e2e:remote` contre l'URL publique, recette dans claude.ai (`docs/ROADMAP.md`, point 2).

---

## 7. Tests

### 7.1 Smoke test stdio

`scripts/smoke.ts`, `npm run build && npm run smoke` :

- démarre le serveur compilé en stdio avec le client MCP officiel, comme Claude ;
- vérifie la présence des outils attendus, puis appelle chaque outil avec une assertion sur le contenu (`/BOI-/`, `/"siren"/`…) ;
- enchaîne les appels comme le ferait le modèle (identifiant tiré d'une recherche, puis lecture du document) ;
- teste les modules à clé seulement si les variables sont présentes, sinon « ignoré » ;
- vérifie qu'une entrée invalide (`par_page: 99`) revient en `isError` ;
- code de sortie 1 au moindre échec.

Le transport stdio du client ne transmet pas tout l'environnement : passer explicitement les identifiants et les variables de mandataire (`HTTPS_PROXY`, `NODE_USE_ENV_PROXY`, `NODE_EXTRA_CA_CERTS`, `NO_PROXY`).

Appel unitaire pour le débogage : `npx tsx scripts/call.ts <outil> '<json>'`.

### 7.2 Test de bout en bout OAuth

`scripts/remote-e2e.ts`, `npm run e2e:remote` contre un serveur lancé avec `PUBLIC_URL=http://localhost:8080` :

1. découverte : 401 sur `/mcp`, lecture de `resource_metadata`, PRM, métadonnées AS (S256, CIMD annoncé) ;
2. DCR : 201 ;
3. autorisation avec un port de boucle locale différent de celui déclaré (accepté) ; clé invalide refusée sur la page ; code obtenu, `state` restitué ;
4. jeton : mauvais `code_verifier` refusé, échange valide, **rejeu du code refusé** ;
5. appel MCP authentifié : outils libres présents, outils à clé absents, appel réel réussi ;
6. rafraîchissement : nouveau jeton de rafraîchissement différent du précédent.

Ce script rejoue le parcours de Claude sans dépendre de claude.ai ; il ne remplace pas la recette réelle (parcours CIMD de Claude).

### 7.3 Recette avec identifiants réels

Modèle : `docs/RECETTE_LEGIFRANCE_JUDILIBRE.md`. Structure :

- en-tête : date, environnement (production / bac à sable, souscriptions), résultat global ;
- périmètre : points restés ouverts ;
- tableau : n°, point testé, outil, paramètres, résultat observé, statut ;
- constats (dont corrections de libellés à reporter) ;
- **limites de la recette** : ce qui n'a pas été testé.

Les résultats attendus du guide utilisateur (« Vérifier l'installation ») servent de tests de non-régression manuels. Vérifier qu'un paramètre est réellement appliqué, pas seulement accepté (ex. comparer l'ordre `PERTINENCE` et `DATE_DESC`). Reporter la synthèse dans `docs/SOURCES.md`.

Données vivantes : les totaux et premiers résultats changent ; consigner la date et ne pas en faire des assertions automatiques.

### 7.4 Contrôle visuel des pages

Les pages HTML du serveur distant (`/`, `/authorize`, page d'erreur) se contrôlent dans un navigateur sans interface (Playwright, préinstallé dans les environnements cloud) : thème clair et sombre (`colorScheme`), largeur mobile (390 px) et bureau, absence de défilement horizontal, contraste des boutons. Aucun script n'est versionné dans le dépôt ; gabarit :

```ts
import { chromium } from "playwright";
const b = await chromium.launch();
for (const colorScheme of ["light", "dark"] as const)
  for (const width of [390, 1280]) {
    const p = await b.newPage({ colorScheme, viewport: { width, height: 900 } });
    await p.goto("http://localhost:8080/");
    await p.screenshot({ path: `accueil-${colorScheme}-${width}.png`, fullPage: true });
  }
await b.close();
```

Pour `/authorize`, construire l'URL comme dans `scripts/remote-e2e.ts` (client DCR, PKCE).

---

## 8. Pièges rencontrés et contournements

| # | Piège | Constat | Contournement | Source dans le dépôt |
| --- | --- | --- | --- | --- |
| 1 | Chemin Légifrance du swagger | Le swagger référencé déclare `basePath: /dila/legifrance-beta/lf-engine-app`, qui répond 404 en production et en bac à sable ; `/dila/legifrance/lf-engine-app/consult/ping` répond 400 sans jeton, donc existe | Chemin par défaut corrigé, surchargeable (`LEGIFRANCE_BASE_PATH`) | `docs/SOURCES.md` écart 1 ; `src/tools/legifrance.ts` ; `src/config.ts` |
| 2 | BOFiP : champ `contenu` | Les numéros de paragraphe sont collés au texte (« 10À ce titre »), ce qui fausse les citations | Texte reconstruit depuis `contenu_html`, paragraphes marqués « § n » (`bofipText`) | écart 3 ; `src/tools/bofip.ts` |
| 3 | BOFiP : recherche Opendatasoft | `search()` ne trie pas par pertinence | Reclassement local des 100 premiers résultats (mots du titre ×2, Contenu avant Actualité), pagination dans cette fenêtre | écart 6 ; `src/tools/bofip.ts` |
| 4 | Souscription PISTE | Tant que les CGU d'une API ne sont pas acceptées, sa case reste grisée et la souscription n'est pas enregistrée, sans message ; l'appel renvoie 403 | Procédure : CGU d'abord, puis souscription, puis contrôle « API Souscrites » ; message 403 explicite ; test à la connexion | écart 5 ; `docs/GUIDE_UTILISATEUR.md` ; `src/http.ts` ; `src/remote/check.ts` |
| 5 | Fonds Légifrance `CETAT` | Contient aussi les cours administratives d'appel | Libellés corrigés dans la description d'outil et le guide | `docs/RECETTE_LEGIFRANCE_JUDILIBRE.md` ; `src/tools/legifrance.ts` |
| 6 | Recherche d'entreprises depuis un cloud | 429 observés (limite par ASN, 30 req/s, en plus de 7 req/s par IP) | 4 tentatives, `Retry-After` respecté (plafonné à 10 s) | écart 2 ; `src/http.ts` |
| 7 | Sirene 3.11 ou V4 | V4 en bêta depuis le 13/10/2026, officielle mi-2027 ; 3.11 maintenue jusqu'à mi-2028 ; syntaxe multicritère différente en V4 | 3.11 retenue, migration inscrite à la feuille de route | écart 4 ; `src/config.ts` ; `docs/ROADMAP.md` |
| 8 | Identifiants PISTE de bac à sable | Refusés en production et inversement (`invalid_client`) | Case bac à sable, message dédié | `src/piste.ts` |
| 9 | Gabarits MCPB | Champ non rempli transmis vide ou en `${user_config.x}` | `env()` les traite comme absents | `src/config.ts` |
| 10 | Mandataire réseau des sessions cloud | `fetch` de Node ignore `HTTPS_PROXY` par défaut | Node ≥ 22.21 avec `NODE_USE_ENV_PROXY=1` ; transmettre aussi `NODE_EXTRA_CA_CERTS` ; transmettre ces variables au serveur lancé par le client stdio | `README.md` ; `scripts/smoke.ts` ; `scripts/call.ts` |
| 11 | Coupures et hôtes bloqués en session cloud | Coupures intermittentes de connexion ; hôtes d'API refusés tant qu'ils ne sont pas autorisés dans la configuration réseau de l'environnement | Relancer avant de conclure à une panne de l'API ; ajouter les hôtes nécessaires (API, OAuth, spécifications) à l'environnement | constat de session, non consigné dans le dépôt |
| 12 | Clé Judilibre `KeyId` | Le swagger déclare aussi une clé `KeyId` | Non utilisée : le jeton OAuth PISTE suffit | `docs/SOURCES.md` ; `src/tools/judilibre.ts` |
| 13 | Sonde de santé et contrôle `Host` | Les sondes de l'hébergeur appellent l'adresse interne du conteneur : un contrôle `Host` global les rejette | Route `/health` déclarée avant `hostHeaderValidation` | `src/remote/main.ts` |
| 14 | Alertes de vulnérabilité de l'image | npm embarqué dans l'image de base Node déclenche des alertes sans servir à l'exécution | npm et npx supprimés de l'image finale ; Trivy bloquant sur les vulnérabilités corrigeables | `Dockerfile` ; `.github/workflows/deploy-scaleway.yml` |
| 15 | Déploiement « réussi » sur l'ancienne image | Un conteneur peut répondre sur `/health` sans avoir pris la nouvelle image | `GIT_SHA` exposé par `/health`, comparé au commit ; redéploiement forcé une fois | `.github/workflows/deploy-scaleway.yml` |
| 16 | CLI Scaleway : HTTPS seul | L'argument s'écrit `https-connections-only` à la création du conteneur mais `https-connection-only` à la mise à jour | Le workflow ne le passe qu'à la création ; vérifier l'orthographe à chaque nouvel usage | relevé lors de l'écriture du workflow (documentation de la CLI) ; non consigné dans `docs/SOURCES.md` |

---

## 9. Liste de contrôle « nouveau serveur MCP »

### Documentation

- [ ] API localisées dans le catalogue `data.gouv.fr/api/1/dataservices/?q=` ; spécification OpenAPI et version relevées.
- [ ] Guides PDF et pages de portail lus (authentification, syntaxe de recherche, quotas).
- [ ] `docs/SOURCES.md` créé : sources datées, limites documentées.
- [ ] Contributeur renseigné (`package.json`, manifest, README) ; exemples anonymes (1.6).
- [ ] Appels exploratoires réels sur chaque point d'accès ; écarts consignés avec contournement.
- [ ] Conditions de réutilisation des données identifiées (données personnelles, licence, CGU).

### Ossature

- [ ] Projet TypeScript strict, ESM, SDK MCP v2, zod v4 ; `engines.node` fixé.
- [ ] `config.ts` : `env()`, configuration statique, type `Credentials`, prédicats `hasX`.
- [ ] `http.ts` repris tel quel (délais, tentatives, messages) ; messages 401/403/429 adaptés aux portails de l'API.
- [ ] `format.ts` repris (prune, HTML → texte, fenêtres, `readOnly`).
- [ ] Authentification du fournisseur isolée (gabarit `piste.ts` si client credentials).
- [ ] `createServer(creds)` ; modules conditionnels ; outil de statut.
- [ ] Instructions du serveur : citation des sources, interdiction de compléter une référence.

### Outils

- [ ] Nommage `<module>_<action>` ; `title`, description en quatre points (3.2), `z.strictObject`, contraintes dans le schéma.
- [ ] Pagination avec `total` et `suite` ; fenêtres `debut` pour les textes longs.
- [ ] Champs inutiles retirés (`drop`), données personnelles minimisées, avertissements intégrés aux réponses.
- [ ] Signal d'annulation `ctx.mcpReq.signal` transmis à chaque appel.

### Local

- [ ] `npm run build && npm run smoke` vert, avec et sans identifiants ; jeux de test sans entreprise ni personne nommée (1.6).
- [ ] `mcpb/manifest.json` : `user_config` facultatifs, secrets `sensitive`, liste `tools` à jour ; `npm run pack:mcpb` valide.
- [ ] Bundle installé et testé dans Claude Desktop.
- [ ] `README.md` (installation, identifiants, variables), `docs/GUIDE_UTILISATEUR.md` (procédure d'obtention des clés, tests attendus, dépannage).

### Distant

- [ ] `src/remote/` repris ; libellés, champs de la page de connexion et `check.ts` adaptés aux identifiants de la nouvelle API.
- [ ] Contexte HKDF (`info`) et nom de ressource propres au nouveau serveur.
- [ ] `npm run e2e:remote` vert.
- [ ] Pages contrôlées visuellement (clair / sombre, mobile / bureau).
- [ ] `trust proxy` ajusté à l'hébergeur ; une seule instance ; `/health` avant le contrôle `Host`.

### Publication

- [ ] Versions synchronisées (`package.json`, manifest, `VERSION`, User-Agent) ; `docs/CHANGELOG.md` complété.
- [ ] Tag `vX.Y.Z` poussé ; release vérifiée (`.mcpb` + `.sha256`).
- [ ] Secrets et variable de déploiement créés (6.2) ; application IAM à droits limités.
- [ ] Workflow de déploiement vert (pas seulement « ignoré » faute de secrets) : commit vérifié sur `/health`, 401 sur `/mcp`, métadonnées OAuth cohérentes ; e2e contre l'URL publique.
- [ ] Recette dans claude.ai (ajout du connecteur, connexion, appel d'outil) consignée sur le modèle de 7.3.
- [ ] `docs/ROADMAP.md` : ce qui reste non testé.

---

## 10. Critique du skill mcp-builder et corrections proposées

Le skill `mcp-builder` a servi de point de départ (structure, SDK v2, annotations, `CHARACTER_LIMIT`). Trois de ses recommandations ont été écartées ou complétées.

### 10.1 Double format Markdown / JSON

**Recommandation du skill** : paramètre `response_format` (Markdown par défaut, JSON en option) sur chaque outil, avec `structuredContent` et `outputSchema`.

**Constat** : pour des API de référence (textes, décisions, fiches d'entreprise), le Markdown ajoute des titres, listes et libellés sans information supplémentaire, double la logique de chaque outil et ajoute un paramètre que le modèle doit renseigner. Le JSON compact élagué est aussi lisible par le modèle et plus court.

**Retenu** : JSON compact sans indentation, élagué, HTML converti en texte, un seul bloc texte ; pas de `response_format`. `structuredContent` et `outputSchema` ne sont pas utilisés : les réponses des API publiques sont trop variables pour un schéma de sortie utile.

**Correction proposée au skill** : présenter le JSON compact élagué comme option par défaut pour les API de données, le Markdown pour les contenus destinés à être recopiés tels quels ; supprimer l'obligation du double format.

Écart à noter : le skill recommande de rester sous `CHARACTER_LIMIT` en renvoyant moins d'éléments plutôt qu'en tronquant le texte. Le dépôt combine des tailles de page par défaut faibles, des fenêtres `debut` pour les textes longs, et une troncature de dernier recours dans `json()` avec un message explicite. La troncature de dernier recours peut couper un JSON au milieu d'un élément : à remplacer par une réduction du nombre d'éléments si un outil l'atteint en pratique.

### 10.2 Phase d'évaluation à 10 questions « stables »

**Recommandation du skill** : dix questions complexes dont la réponse ne change pas dans le temps, exécutées par un script d'évaluation.

**Constat** : les données des API publiques sont vivantes (nouvelles décisions, textes modifiés, entreprises créées ou cessées, doctrine mise à jour). Une question « stable » doit porter sur des données figées, ce qui ne teste ni la recherche, ni la pagination, ni la version en vigueur. L'évaluation est en outre coûteuse et ne couvre pas le parcours OAuth.

**Retenu** : trois niveaux complémentaires (section 7) : smoke test stdio automatisé à assertions de forme ; test de bout en bout OAuth automatisé ; recette manuelle datée avec identifiants réels, résultats observés et limites.

**Correction proposée au skill** : remplacer la phase 4 par « tests de forme automatisés + recette datée » pour les données vivantes ; conserver l'évaluation à dix questions pour les données figées uniquement ; ajouter un test de bout en bout du serveur d'autorisation pour tout serveur distant.

### 10.3 Absence de section MCPB

**Constat** : le skill cite MCPB comme argument en faveur de TypeScript mais ne décrit ni le manifest, ni `user_config`, ni la construction du bundle. Or c'est le mode d'installation le plus simple pour un utilisateur de Claude Desktop.

**Correction proposée au skill** : ajouter une section reprenant 4.1 : manifest 0.3, `user_config` facultatifs et `sensitive`, valeurs `${user_config.x}` vides ou non substituées à traiter comme absentes, bundle esbuild en un seul fichier avec bannière `createRequire`, `mcpb validate` avant `mcpb pack`, workflow de release.

### 10.4 Compléments utiles

À ajouter également au skill, d'après ce projet :

- modules conditionnels selon les identifiants et outil de statut (2.2, 2.4) ;
- factory `createServer(creds)` partagée stdio / HTTP, identifiants jamais lus depuis l'environnement dans un outil ;
- serveur d'autorisation conforme aux connecteurs Claude (section 5), y compris la limitation de débit par jeton (IP partagées) ;
- registre des sources et des écarts (1.4).
