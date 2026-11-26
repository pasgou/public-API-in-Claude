/**
 * Auto-contrôle : démarre le serveur compilé en stdio, appelle les outils comme le ferait Claude, échoue au moindre écart.
 * Usage : npm run build && npm run smoke
 * Les modules à clé ne sont testés que si INSEE_API_KEY / PISTE_CLIENT_ID+SECRET sont présents dans l'environnement.
 */
import { strict as assert } from "node:assert";
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";

const pass = (k: string) => (process.env[k] ? { [k]: process.env[k]! } : {});
const env = {
  ...getDefaultEnvironment(),
  ...pass("INSEE_API_KEY"), ...pass("PISTE_CLIENT_ID"), ...pass("PISTE_CLIENT_SECRET"), ...pass("PISTE_ENV"),
  // Environnements derrière un proxy d'entreprise : Node ≥ 22.21 honore HTTPS_PROXY avec NODE_USE_ENV_PROXY=1.
  ...pass("HTTPS_PROXY"), ...pass("NODE_USE_ENV_PROXY"), ...pass("NODE_EXTRA_CA_CERTS"), ...pass("NO_PROXY"),
};

const client = new Client({ name: "smoke", version: "1.0.0" });
await client.connect(new StdioClientTransport({ command: "node", args: ["dist/index.js"], env }));

const { tools } = await client.listTools();
const names = tools.map((t) => t.name);
console.error("Outils :", names.join(", "));
for (const t of ["apis_publiques_statut", "entreprises_rechercher", "bofip_rechercher", "bofip_document", "datagouv_rechercher", "datagouv_donnees_tabulaires"]) {
  assert.ok(names.includes(t), `outil manquant : ${t}`);
}

let failures = 0;
async function call(name: string, args: Record<string, unknown>, check?: (text: string) => void) {
  if (!names.includes(name)) return console.error(`- ${name} : ignoré (module inactif)`);
  const r = await client.callTool({ name, arguments: args });
  const text = (r.content as Array<{ text?: string }>).map((c) => c.text ?? "").join("");
  try {
    assert.ok(!r.isError, text.slice(0, 300));
    check?.(text);
    console.error(`✓ ${name} (${text.length} car.)`);
  } catch (e) {
    failures++;
    console.error(`✗ ${name} : ${(e as Error).message}`);
  }
  return text;
}

await call("apis_publiques_statut", {});
await call("entreprises_rechercher", { q: "la poste", par_page: 2 }, (t) => assert.match(t, /"siren"/));
const bofip = await call("bofip_rechercher", { texte: "crédit d'impôt recherche", serie: "BIC", limite: 3 }, (t) => assert.match(t, /BOI-/));
const boi = bofip?.match(/"identifiant_juridique":"(BOI-[^"]+)"/)?.[1];
if (boi) await call("bofip_document", { identifiant: boi }, (t) => assert.match(t, /"contenu"/));
await call("datagouv_rechercher", { q: "base sirene", type: "dataservices", par_page: 3 }, (t) => assert.match(t, /url_base/));
const ds = await call("datagouv_rechercher", { q: "taux de chomage", par_page: 1 });
const dsId = ds?.match(/"id":"([0-9a-f]{24})"/)?.[1];
if (dsId) {
  const det = await call("datagouv_jeu_de_donnees", { id: dsId }, (t) => assert.match(t, /ressources/));
  const rid = det?.match(/"id":"([0-9a-f-]{36})"[^}]*"format":"csv"/)?.[1];
  if (rid) await call("datagouv_donnees_tabulaires", { ressource_id: rid, par_page: 2 }, (t) => assert.match(t, /lignes/));
}
await call("sirene_unite_legale", { siren: "309634954" }, (t) => assert.match(t, /"siren":"309634954"/));
await call("legifrance_lister_codes", { nom: "impôts" }, (t) => assert.match(t, /LEGITEXT/));
await call("judilibre_taxonomie", { id: "jurisdiction" });

// Une entrée invalide doit revenir en erreur lisible par le modèle.
const bad = await client.callTool({ name: "entreprises_rechercher", arguments: { par_page: 99 } });
assert.equal(bad.isError, true, "par_page=99 aurait dû être rejeté");

await client.close();
if (failures) {
  console.error(`${failures} échec(s)`);
  process.exit(1);
}
console.error("Smoke test OK");
