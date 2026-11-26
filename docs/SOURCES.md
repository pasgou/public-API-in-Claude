# Sources documentaires (consultées le 26/11/2026)

Règle du projet : implémentation à partir des seules documentations officielles (URL ou PDF des administrations, ou spécifications qu'elles référencent). Aucun code tiers repris.

## Point d'entrée commun

Catalogue des API de l'État (data.gouv.fr, objets `dataservices`) : `https://www.data.gouv.fr/api/1/dataservices/?q=<nom>` — fournit pour chaque API l'URL de base, l'URL de la spécification OpenAPI et les limites d'usage. Toutes les spécifications ci-dessous ont été localisées par ce moyen.

| API | Spécification utilisée | Version | Auth | Limite documentée |
|---|---|---|---|---|
| Recherche d'entreprises | https://recherche-entreprises.api.gouv.fr/openapi.json | 1.0.0 | aucune | 7 req/s par IP, 30 req/s par ASN, 429 + `Retry-After` |
| Sirene | Swagger 3.11 du portail INSEE (`api-apimanager.insee.fr/portal/environments/DEFAULT/apis/2ba0e549-…/pages/6548510e-…/content`) + pages « Comment interroger l'API Sirene », « Recherche multicritère » | 3.11 | en-tête `X-INSEE-Api-Key-Integration` | 30 req/min (open data) |
| Sirene V4 (non implémentée) | Swagger V4 (`…/apis/e4d83b91-…/pages/55b07575-…/content`) | 4.0.9.0 bêta | idem | idem |
| Légifrance | https://raw.githubusercontent.com/betagouv/api_gouv_swaggers/main/swaggers/api-legifrance-v2.json (référencée par data.gouv.fr) | 1.6.2.5 | OAuth2 PISTE | quotas PISTE |
| Judilibre | https://raw.githubusercontent.com/Cour-de-cassation/judilibre-search/dev/public/JUDILIBRE-public.json (dépôt de la Cour de cassation, référencé par data.gouv.fr) | 1.2.5 | OAuth2 PISTE (le swagger déclare aussi une clé `KeyId`) | quotas par jeton |
| PISTE (auth) | Guide utilisateur PDF : https://piste.gouv.fr/images/com_apiportal/documentation/UserGuide_navigation_FR.pdf (AIFE), § 7.5 et annexe 12.2 | — | `client_credentials`, `scope=openid` | codes 401/403/429 |
| BOFiP | Métadonnées Opendatasoft du jeu `bofip-vigueur` : https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/bofip-vigueur | Explore API v2.1 | aucune | — |
| data.gouv.fr | https://www.data.gouv.fr/api/1/swagger.json | v1 | aucune en lecture | — |
| API tabulaire | https://tabular-api.data.gouv.fr/api/doc/swagger.json + README officiel `datagouv/api-tabular` (syntaxe des filtres) | 0.4.2 | aucune | `page_size` ≤ 50 |
| Bundle Claude Desktop | Spécification MCPB `MANIFEST.md` (modelcontextprotocol/mcpb) | manifest 0.3 | — | — |

Points d'accès PISTE (annexe 12.2 du guide) : production `https://api.piste.gouv.fr` + `https://oauth.piste.gouv.fr/api/oauth/token` ; bac à sable `https://sandbox-api.piste.gouv.fr` + `https://sandbox-oauth.piste.gouv.fr/api/oauth/token`.

## Écarts constatés entre documentation et service réel

| # | API | Documentation | Constat | Contournement |
|---|---|---|---|---|
| 1 | Légifrance | Le swagger référencé par data.gouv.fr déclare `basePath: /dila/legifrance-beta/lf-engine-app` | Ce chemin répond **404** en production et en bac à sable ; `/dila/legifrance/lf-engine-app/consult/ping` répond 400 (jeton manquant), donc existe | Chemin par défaut `/dila/legifrance/lf-engine-app`, surchargeable par `LEGIFRANCE_BASE_PATH` |
| 2 | Recherche d'entreprises | Limite par ASN signalée comme « probable sur les clouds publics » | 429 observés depuis un conteneur cloud | 4 tentatives, respect de `Retry-After` (plafonné à 10 s) |
| 3 | BOFiP | Le champ `contenu` est présenté comme le texte | Les numéros de paragraphe y sont collés au texte (« 10À ce titre »), ce qui fausse les citations de § | Texte reconstruit depuis `contenu_html`, paragraphes marqués « § n » |
| 4 | Sirene | Page « Comment interroger » de l'API V4 | La V4 est en bêta depuis le 13/10/2026, officielle mi-2027 ; la 3.11 reste maintenue jusqu'à mi-2028 | 3.11 retenue |
| 5 | PISTE | Le guide utilisateur PISTE ne précise pas l'ordre CGU / souscription | Tant que les CGU d'une API ne sont pas acceptées, sa case reste grisée dans l'application et la souscription n'est pas enregistrée, sans message d'erreur ; l'appel renvoie alors 403 | Accepter les CGU (page de consentement) puis cocher les API dans « Modifier l'application » ; contrôler « API Souscrites » (constat utilisateur, 26/11/2026) |
| 6 | BOFiP | — | La recherche `search()` d'Opendatasoft ne trie pas par pertinence : la publication attendue peut être hors des premiers résultats | Reclassement local des 100 premiers résultats (mots du titre, Contenu avant Actualité) |

## Recette avec identifiants (26/11/2026)

Recette utilisateur concluante sur les six modules (requêtes de test : `GUIDE_UTILISATEUR.md`, section « Vérifier l'installation »).

Restent non couverts par cette recette :
- Légifrance : consultation des identifiants `CETATEXT` / `CONSTEXT` via `/consult/juri` (le swagger ne documente que `JURITEXT`).
- Légifrance : valeur de tri `PERTINENCE` sur les fonds autres que les codes.
