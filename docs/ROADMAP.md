# Feuille de route

## Fait (0.1.0)

- Serveur MCP stdio, 21 outils, 6 API ; activation des modules selon identifiants.
- Bundle `.mcpb` avec formulaire de saisie des clés (Claude Desktop).
- Test de bout en bout sur les modules libres (`npm run smoke`).

## Fait (0.2.0)

- Serveur distant Streamable HTTP avec OAuth 2.1 intégré et page de connexion (saisie et test des identifiants par utilisateur), sans base de données ; image Docker ; test de bout en bout du parcours OAuth (`npm run e2e:remote`).

## À faire

1. **Recette résiduelle** : fonds CIRC, ACCO, CNIL, *_DATE et quatre outils non testés (voir `SOURCES.md`).
2. **Premier déploiement Scaleway** (workflow prêt, secrets à créer), puis recette dans claude.ai : parcours CIMD réel, URL de rappel `https://claude.ai/api/mcp/auth_callback`, paramètre `resource`.
3. **Spécification MCP** (modelcontextprotocol.io) à relire à la source : le serveur d'autorisation a été construit d'après la documentation des connecteurs Claude.
4. **Sirene V4** quand elle deviendra la version officielle (mi-2027 annoncé).
5. **API supplémentaires** à évaluer : API tabulaire de data.economie.gouv.fr (autres jeux DGFiP), BODACC, RNE (INPI), Base Adresse Nationale, API Entreprise (habilitation requise, réservée aux administrations).
6. **Application Mac** (vitrine, skill app-mac-simple) : en attente de la notarisation Apple.
