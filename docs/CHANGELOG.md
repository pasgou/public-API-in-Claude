# Journal des versions

## 0.2.1 – 27/11/2026

- Déploiement automatique sur Scaleway Serverless Containers (GitHub Action) ; sonde `/health` indiquant le commit déployé.
- Image Docker allégée (npm retiré) et contrôlée par Trivy à chaque déploiement.
- Khétys mentionné comme organisation contributrice ; jeux de test sans entreprise nommée.

## 0.2.0 – 26/11/2026

- **Connecteur distant** (claude.ai, Claude Desktop, mobile, Cowork) : serveur Streamable HTTP avec OAuth 2.1 intégré et page de connexion où chaque utilisateur saisit et teste ses propres identifiants INSEE / PISTE. Sans base de données. Image Docker. Non encore déployé.
- BOFiP : classement des résultats par pertinence du titre.
- Libellés : le fonds Légifrance `CETAT` couvre le Conseil d'État et les cours administratives d'appel.
- Sécurité : limitation de débit, contrôle `Origin` du formulaire de connexion.
- Documentation : guide utilisateur, recette Légifrance / Judilibre, procédure PISTE (CGU à accepter avant la souscription).

**Installation Claude Desktop** : télécharger `api-publiques-fr-0.2.0.mcpb` ci-dessous, double-cliquer, saisir les identifiants facultatifs dans le formulaire.

## 0.1.0 – 26/11/2026

- Première version locale (stdio) : 21 outils sur 6 API — Recherche d'entreprises, BOFiP-Impôts, data.gouv.fr (sans clé), Sirene 3.11 (clé INSEE), Légifrance et Judilibre (PISTE).
- Bundle `.mcpb` pour Claude Desktop avec formulaire de saisie des identifiants.
