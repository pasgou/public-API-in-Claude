import { McpServer } from "@modelcontextprotocol/server";
import { type Credentials, hasInsee, hasPiste } from "./config.js";
import { registerBofip } from "./tools/bofip.js";
import { registerDatagouv } from "./tools/datagouv.js";
import { registerEntreprises } from "./tools/entreprises.js";
import { registerJudilibre } from "./tools/judilibre.js";
import { registerLegifrance } from "./tools/legifrance.js";
import { registerSirene } from "./tools/sirene.js";
import { registerStatut } from "./tools/statut.js";

export const VERSION = "0.2.0";

/** Une instance par connexion stdio ou par requête HTTP, avec les identifiants de l'utilisateur concerné. */
export function createServer(creds: Credentials): McpServer {
  const server = new McpServer(
    { name: "api-publiques-fr", version: VERSION },
    {
      instructions:
        "Sources officielles françaises. Citer systématiquement la source renvoyée (identifiant BOI, LEGIARTI/LEGITEXT, ECLI ou n° de pourvoi, SIREN) avec sa date de version. " +
        "Ne jamais compléter une référence absente des résultats. Si un module attendu manque, appeler apis_publiques_statut.",
    },
  );
  registerStatut(server, creds);
  registerEntreprises(server);
  registerBofip(server);
  registerDatagouv(server);
  if (hasInsee(creds)) registerSirene(server, creds);
  if (hasPiste(creds)) {
    registerLegifrance(server, creds);
    registerJudilibre(server, creds);
  }
  return server;
}
