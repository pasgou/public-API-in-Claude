import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { type Credentials, hasInsee, hasPiste } from "../config.js";
import { readOnly } from "../format.js";

export function modules(c: Credentials) {
  return [
    { module: "Recherche d'entreprises", outils: "entreprises_*", actif: true, acces: "libre" },
    { module: "BOFiP-Impôts", outils: "bofip_*", actif: true, acces: "libre" },
    { module: "data.gouv.fr", outils: "datagouv_*", actif: true, acces: "libre" },
    {
      module: "Sirene (INSEE)",
      outils: "sirene_*",
      actif: hasInsee(c),
      acces: "clé API INSEE",
      activation: "portail-api.insee.fr → compte externe → application (mode « simple ») → souscrire à « API Sirene », plan Public → copier la clé.",
    },
    {
      module: "Légifrance",
      outils: "legifrance_*",
      actif: hasPiste(c),
      acces: "Client ID + Secret PISTE",
      activation: "piste.gouv.fr → compte → application → accès à l'API « Légifrance » (CGU à accepter) → identifiants OAuth de l'application.",
    },
    {
      module: "Judilibre",
      outils: "judilibre_*",
      actif: hasPiste(c),
      acces: "Client ID + Secret PISTE",
      activation: "Même application PISTE, avec accès à l'API « JUDILIBRE » (CGU à accepter).",
    },
  ];
}

export function registerStatut(server: McpServer, c: Credentials) {
  server.registerTool(
    "apis_publiques_statut",
    {
      title: "État des connexions aux API publiques",
      description: "Indique quels modules sont actifs, lesquels nécessitent une clé, et comment l'obtenir. À appeler si un outil attendu est absent.",
      inputSchema: z.strictObject({}),
      annotations: readOnly,
    },
    async () => ({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            environnement_piste: c.pisteSandbox ? "sandbox" : "production",
            modules: modules(c),
          }),
        },
      ],
    }),
  );
}
