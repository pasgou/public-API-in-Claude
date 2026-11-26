import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { config, hasInsee, hasPiste } from "../config.js";
import { readOnly } from "../format.js";

export function modules() {
  return [
    { module: "Recherche d'entreprises", outils: "entreprises_*", actif: true, acces: "libre" },
    { module: "BOFiP-Impôts", outils: "bofip_*", actif: true, acces: "libre" },
    { module: "data.gouv.fr", outils: "datagouv_*", actif: true, acces: "libre" },
    {
      module: "Sirene (INSEE)",
      outils: "sirene_*",
      actif: hasInsee(),
      acces: "clé INSEE_API_KEY",
      activation: "portail-api.insee.fr → compte externe → application (mode « simple ») → souscrire à « API Sirene », plan Public → copier la clé.",
    },
    {
      module: "Légifrance",
      outils: "legifrance_*",
      actif: hasPiste(),
      acces: "PISTE_CLIENT_ID + PISTE_CLIENT_SECRET",
      activation: "piste.gouv.fr → compte → application → accès à l'API « Légifrance » (CGU à accepter) → identifiants OAuth de l'application.",
    },
    {
      module: "Judilibre",
      outils: "judilibre_*",
      actif: hasPiste(),
      acces: "PISTE_CLIENT_ID + PISTE_CLIENT_SECRET",
      activation: "Même application PISTE, avec accès à l'API « JUDILIBRE » (CGU à accepter).",
    },
  ];
}

export function registerStatut(server: McpServer) {
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
            environnement_piste: config.piste.sandbox ? "sandbox" : "production",
            modules: modules(),
          }),
        },
      ],
    }),
  );
}
