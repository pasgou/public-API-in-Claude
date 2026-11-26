# Feuille de route

## Fait (0.1.0)

- Serveur MCP stdio, 21 outils, 6 API ; activation des modules selon identifiants.
- Bundle `.mcpb` avec formulaire de saisie des clés (Claude Desktop).
- Test de bout en bout sur les modules libres (`npm run smoke`).

## À faire

1. **Recette avec identifiants réels** INSEE et PISTE : lever les points listés dans `SOURCES.md`, ajuster les projections de réponses.
2. **Version distante (Streamable HTTP)** pour Cowork / claude.ai (connecteur personnalisé) : hébergement, authentification OAuth du connecteur, identifiants PISTE/INSEE côté serveur ou par utilisateur.
3. **Interface graphique de connexion** pour la version distante (page de configuration des clés et test de connexion par module), sur le modèle des projets précédents.
4. **Sirene V4** quand elle deviendra la version officielle (mi-2027 annoncé).
5. **API supplémentaires** à évaluer : API tabulaire de data.economie.gouv.fr (autres jeux DGFiP), BODACC, RNE (INPI), Base Adresse Nationale, API Entreprise (habilitation requise, réservée aux administrations).
6. **Publication** : release GitHub avec le `.mcpb` attaché, CI de build.
