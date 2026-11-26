# Recette – Modules Légifrance et Judilibre

Date d'exécution : 26/11/2026
Environnement : application PISTE de production, souscrite à Légifrance et JUDILIBRE avec leurs CGU acceptées
Résultat global : **tous les points sont validés, rien n'est bloquant**

## Périmètre

Points restés ouverts après la recette initiale :

1. Résultats attendus du guide utilisateur pour Légifrance (article L611-2) et Judilibre (Cass. com., 14 févr. 2024, n° 22-13.899).
2. Lecture d'une décision du Conseil d'État (identifiant `CETATEXT`) et du Conseil constitutionnel (identifiant `CONSTEXT`).
3. Tri par pertinence sur les fonds autres que les codes.

## Résultats

| # | Point testé | Outil | Paramètres | Résultat | Statut |
| --- | --- | --- | --- | --- | --- |
| 1 | Article L611-2 du Code de commerce | `legifrance_article` | `id=LEGIARTI000044052535` | Texte complet, état VIGUEUR, version 5.0 en vigueur depuis le 01/10/2021, note sur l'ordonnance n° 2021-1193, historique des versions | OK |
| 2 | Décision Cass. com. n° 22-13.899 | `judilibre_decision` | `id=65cc65958bbd7c000881f5f5` | Décision du 14/02/2024, rejet, publiée au Bulletin, ECLI:FR:CCASS:2024:CO00094 ; texte intégral, zones, visa (art. 1231-1 C. civ.) et décision attaquée (CA Paris, 11/01/2022, n° 20/07581) | OK |
| 3 | Recherche sur la jurisprudence administrative | `legifrance_rechercher` | `fonds=CETAT`, `texte="expert-comptable responsabilité"`, `tri=PERTINENCE` | 2 427 résultats | OK |
| 4 | Lecture d'une décision du Conseil d'État | `legifrance_consulter` | `id=CETATEXT000025748521` | CE, 24/04/2012, n° 344936 (ECLI:FR:CESSR:2012:344936.20120424) ; texte et sommaires. Texte de 21 557 caractères découpé en deux fenêtres, avec l'indication de rappeler avec `debut=20000` | OK |
| 5 | Recherche sur le Conseil constitutionnel | `legifrance_rechercher` | `fonds=CONSTIT`, `texte="ordre des experts-comptables"`, `tri=PERTINENCE` | 1 175 résultats | OK |
| 6 | Lecture d'une décision du Conseil constitutionnel | `legifrance_consulter` | `id=CONSTEXT000046588234` | Décision n° 2022-1019 QPC du 27/10/2022, conformité ; texte intégral, référence et lien vers sa publication au Journal officiel (JORFTEXT000046497284) | OK |
| 7 | Tri par pertinence, lois et décrets en vigueur | `legifrance_rechercher` | `fonds=LODA_ETAT`, `texte="facturation électronique"`, `tri=PERTINENCE` | 356 résultats, dont le décret n° 2026-677 du 27/07/2026 | OK |
| 8 | Tri par pertinence, Journal officiel | `legifrance_rechercher` | `fonds=JORF`, `texte="facturation électronique"`, `tri=PERTINENCE` | 1 462 résultats | OK |
| 9 | Tri par pertinence, conventions collectives | `legifrance_rechercher` | `fonds=KALI`, `texte="experts-comptables"`, `tri=PERTINENCE` | 643 résultats, dont la convention collective des cabinets d'experts-comptables et de commissaires aux comptes | OK |
| 10 | Le tri est-il réellement appliqué ? | `legifrance_rechercher` | Recherche du test 3 avec `tri=DATE_DESC` | Ordre différent : les trois premiers résultats datent du 06/11/2026 au 24/11/2026 | OK |

## Constats

- **La jurisprudence administrative ne se limite pas au Conseil d'État.** Le fonds `CETAT` contient aussi les arrêts des cours administratives d'appel : dans le test 3, 2 des 3 premiers résultats en venaient. Pour ne garder que le Conseil d'État, il faut filtrer sur la juridiction. Le libellé « Conseil d'État » du guide utilisateur est trop restrictif et doit être corrigé.
- **Découpage des textes longs :** au-delà de 20 000 caractères, le texte est renvoyé par fenêtres, avec l'indication de la position suivante.
- **Les résultats attendus du guide utilisateur sont confirmés** pour Légifrance (L611-2) et Judilibre (n° 22-13.899).

## Limites de la recette

- La comparaison pertinence / date décroissante n'a été faite que sur le fonds `CETAT`. Sur `CONSTIT`, `LODA_ETAT`, `JORF` et `KALI`, seule l'absence d'erreur a été contrôlée, pas l'ordre des résultats.
- Le filtre par juridiction sur `CETAT` n'a pas été testé.
- Non testés : fonds `CIRC`, `ACCO`, `CNIL`, `CODE_DATE`, `LODA_DATE`, et les outils `legifrance_convention_collective`, `legifrance_lister_codes`, `legifrance_table_matieres`, `judilibre_taxonomie`.
