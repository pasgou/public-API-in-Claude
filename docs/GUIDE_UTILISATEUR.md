# MCP API publiques françaises – Guide utilisateur

Mis à jour le 26/11/2026

## Objet

Le serveur MCP « API publiques françaises » permet à Claude d'interroger directement six sources officielles : textes et codes (Légifrance), doctrine fiscale (BOFiP), jurisprudence (Judilibre), répertoire des entreprises (Sirene, Annuaire des entreprises) et données publiques (data.gouv.fr).

L'intérêt : chaque réponse s'appuie sur la source elle-même, avec son identifiant (article, BOI, numéro de pourvoi, SIREN) et sa version en vigueur, plutôt que sur une recherche web ou la mémoire du modèle.

## Modules disponibles

Trois modules fonctionnent sans clé ; Sirene, Légifrance et Judilibre exigent des identifiants (section suivante).

| Module | Contenu | Outils | Accès |
| --- | --- | --- | --- |
| Légifrance | Codes et textes en vigueur ou à une date, JORF, conventions collectives (IDCC), circulaires, jurisprudence administrative (Conseil d'État et cours administratives d'appel, fonds `CETAT`) et constitutionnelle | `legifrance_rechercher`, `legifrance_article`, `legifrance_consulter`, `legifrance_convention_collective`, `legifrance_lister_codes`, `legifrance_table_matieres` | Application PISTE |
| BOFiP-Impôts | Doctrine fiscale en vigueur : commentaires, rescrits, actualités | `bofip_rechercher`, `bofip_document` | Libre |
| Judilibre | Décisions de la Cour de cassation et des juridictions du fond (CA, TJ, tribunaux de commerce) | `judilibre_rechercher`, `judilibre_decision`, `judilibre_taxonomie` | Application PISTE |
| Sirene (INSEE) | Unités légales et établissements, historique, successions d'établissements | `sirene_rechercher`, `sirene_unite_legale`, `sirene_etablissement`, `sirene_successions` | Clé INSEE |
| Annuaire des entreprises | Recherche par nom, dirigeant, SIREN, NAF, département ; labels (Qualiopi, RGE, ESS), IDCC, n° TVA | `entreprises_rechercher`, `entreprises_autour_point` | Libre |
| data.gouv.fr | Catalogue des jeux de données et API publiques, lecture des fichiers tabulaires | `datagouv_rechercher`, `datagouv_jeu_de_donnees`, `datagouv_donnees_tabulaires` | Libre |

L'outil `apis_publiques_statut` indique à tout moment quels modules sont actifs.

## Configuration des accès

Les identifiants se renseignent dans la configuration du serveur MCP, puis le serveur est relancé : formulaire d'installation du bundle `.mcpb` sous Claude Desktop, options `-e` de `claude mcp add` sous Claude Code (voir README). Une application PISTE sert à la fois à Légifrance et à Judilibre.

| Variable | Module | Où l'obtenir |
| --- | --- | --- |
| `INSEE_API_KEY` | Sirene | portail-api.insee.fr |
| `PISTE_CLIENT_ID` | Légifrance, Judilibre | piste.gouv.fr, application → Identifiants OAuth |
| `PISTE_CLIENT_SECRET` | Légifrance, Judilibre | Idem, « Consulter le secret » |

### Clé INSEE (Sirene)

1. Créer un compte externe sur portail-api.insee.fr.
2. Créer une application en mode « simple ».
3. Souscrire à l'API Sirene, plan Public.
4. Copier la clé dans `INSEE_API_KEY`.

### Application PISTE (Légifrance et Judilibre)

L'ordre des étapes compte : tant que les CGU d'une API ne sont pas acceptées, sa case reste grisée dans l'application et la souscription n'est pas enregistrée, sans message d'erreur.

1. Créer un compte sur piste.gouv.fr, puis une application en environnement **PRODUCTION**.
2. Accepter les CGU : dans l'application, « Modifier l'application » → lien « Cliquez ici pour accéder à la page de consentement ». Afficher 100 lignes, cocher **Légifrance** et **JUDILIBRE**, puis « Valider mes choix CGU ».
3. Revenir sur « Modifier l'application » (recharger la page), cocher Légifrance et JUDILIBRE dans « Sélectionner les API », puis « Appliquer les modifications ». Le message « Succès – Les modifications ont été enregistrées » confirme.
4. Contrôler sur la fiche de l'application que la rubrique « API Souscrites » liste bien les deux API.
5. Reporter le Client ID et le secret OAuth dans `PISTE_CLIENT_ID` et `PISTE_CLIENT_SECRET`.

Les identifiants OAuth existants restent valables après une souscription ajoutée : inutile de les régénérer.

## Vérifier l'installation

« Actif » dans `apis_publiques_statut` signifie seulement que les identifiants sont chargés, pas qu'ils donnent accès à l'API. Seule une vraie requête le confirme : demander à Claude de lancer les tests ci-dessous.

| Module | Requête de test | Résultat attendu |
| --- | --- | --- |
| Légifrance | « dépôt des comptes annuels » dans les codes en vigueur | Articles du Code de commerce, dont L611-2 |
| BOFiP | « crédit d'impôt formation des dirigeants » | BOI-BIC-RICI-10-50 |
| Judilibre | « expert-comptable devoir de conseil », Cour de cassation | Cass. com., 14 févr. 2024, n° 22-13.899 |
| Sirene | `periode(activitePrincipaleUniteLegale:69.20Z AND etatAdministratifUniteLegale:A)` | Liste d'entreprises d'expertise comptable actives |
| Annuaire des entreprises | NAF 85.59A, département 69, filtre Qualiopi | Liste d'organismes de formation |
| data.gouv.fr | « facturation électronique » | Jeux de données sur les plateformes agréées |

Tests réalisés avec succès sur les six modules le 26 novembre 2026.

## Dépannage

| Symptôme | Cause probable | Correction |
| --- | --- | --- |
| Légifrance ou Judilibre : « accès refusé (HTTP 403) » | Application PISTE non souscrite à l'API, ou CGU non acceptées | Refaire les étapes 2 à 4 de l'application PISTE ; vérifier « API Souscrites » |
| 403 alors que la souscription apparaît | Application en environnement sandbox, ou identifiants d'une autre application | Utiliser une application PRODUCTION et ses propres identifiants |
| Sirene : « requête invalide (HTTP 400) » | Syntaxe du paramètre `q` incorrecte | Variables historisées dans `periode(...)` ; pas de joker seul sur un champ |
| Module absent ou inactif dans le statut | Variable d'environnement manquante ou serveur non relancé | Renseigner la variable, relancer le serveur MCP |
| Sirene : refus après une série de requêtes | Quota du plan Public INSEE atteint | Espacer les appels ; pour une recherche simple par nom, utiliser l'Annuaire des entreprises |

## Bonnes pratiques et limites

- **Vérifier la version en vigueur** à la date utile : Légifrance indique l'état juridique (VIGUEUR, MODIFIE) et les dates de début et de fin de chaque article ; le BOFiP indique la date de début de validité.
- **Citer la référence** dans tout livrable : numéro d'article, identifiant BOI, numéro de pourvoi ou ECLI, SIREN.
- **Lire le texte intégral** avant de conclure : les résultats de recherche ne donnent que des extraits et des sommaires.
- **Sources non couvertes** : BOSS (doctrine sociale), avis et règlements de l'ANC, service-public.fr. Elles se consultent par recherche web, avec une fiabilité moindre.
- **Annuaire des entreprises** : les entreprises non diffusibles en sont exclues ; Sirene les renvoie avec la clé INSEE, mais en diffusion partielle (données personnelles masquées, pas de réutilisation à des fins de prospection – art. R123-232-1 C. com.).
- **Confidentialité** : les identifiants PISTE et INSEE sont personnels ; ne pas les écrire dans un document, un mail ou un dépôt de code.
