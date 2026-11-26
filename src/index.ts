#!/usr/bin/env node
/**
 * Serveur MCP « API publiques FR » : accès de Claude aux API des administrations françaises.
 * Modules sans clé toujours actifs ; Sirene et PISTE (Légifrance, Judilibre) actifs si les identifiants sont fournis.
 * Transport : stdio (Claude Desktop via bundle .mcpb, Claude Code via `claude mcp add`).
 */
import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { hasInsee, hasPiste } from "./config.js";
import { registerBofip } from "./tools/bofip.js";
import { registerDatagouv } from "./tools/datagouv.js";
import { registerEntreprises } from "./tools/entreprises.js";
import { registerJudilibre } from "./tools/judilibre.js";
import { registerLegifrance } from "./tools/legifrance.js";
import { registerSirene } from "./tools/sirene.js";
import { modules, registerStatut } from "./tools/statut.js";

export const VERSION = "0.1.0";

export function createServer(): McpServer {
  const server = new McpServer(
    { name: "api-publiques-fr", version: VERSION },
    {
      instructions:
        "Sources officielles françaises. Citer systématiquement la source renvoyée (identifiant BOI, LEGIARTI/LEGITEXT, ECLI ou n° de pourvoi, SIREN) avec sa date de version. " +
        "Ne jamais compléter une référence absente des résultats. Si un module attendu manque, appeler apis_publiques_statut.",
    },
  );
  registerStatut(server);
  registerEntreprises(server);
  registerBofip(server);
  registerDatagouv(server);
  if (hasInsee()) registerSirene(server);
  if (hasPiste()) {
    registerLegifrance(server);
    registerJudilibre(server);
  }
  return server;
}

serveStdio(createServer);
console.error(
  `api-publiques-fr ${VERSION} (stdio) — modules actifs : ${modules()
    .filter((m) => m.actif)
    .map((m) => m.module)
    .join(", ")}`,
);
