/**
 * Test de bout en bout du serveur distant : simule le parcours de Claude (DCR → /authorize → page de connexion →
 * code → /token → appel MCP authentifié → refresh). Usage : PUBLIC_URL=http://localhost:8080 SERVER_SECRET=… node dist/remote/main.js &
 * puis BASE=http://localhost:8080 npx tsx scripts/remote-e2e.ts
 */
import { strict as assert } from "node:assert";
import { createHash, randomBytes } from "node:crypto";
import { Client } from "@modelcontextprotocol/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/client";

const BASE = process.env.BASE ?? "http://localhost:8080";
const REDIRECT = "http://localhost:3118/callback";
const ok = (m: string) => console.error(`✓ ${m}`);

// 1. Découverte
const noAuth = await fetch(`${BASE}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
assert.equal(noAuth.status, 401);
const www = noAuth.headers.get("www-authenticate") ?? "";
assert.match(www, /resource_metadata="([^"]+)"/);
const prm = await (await fetch(www.match(/resource_metadata="([^"]+)"/)![1])).json();
assert.equal(prm.resource, `${BASE}/mcp`);
const as = await (await fetch(`${prm.authorization_servers[0]}/.well-known/oauth-authorization-server`)).json();
assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
assert.equal(as.client_id_metadata_document_supported, true);
ok("découverte (401 + PRM + métadonnées AS)");

// 2. DCR
const reg = await fetch(as.registration_endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: [REDIRECT], client_name: "e2e" }) });
assert.equal(reg.status, 201);
const { client_id } = await reg.json();
ok("enregistrement dynamique");

// 3. Autorisation (port différent sur boucle locale : doit être accepté)
const verifier = randomBytes(32).toString("base64url");
const challenge = createHash("sha256").update(verifier).digest("base64url");
const redirectUsed = "http://localhost:4555/callback";
const authUrl = `${as.authorization_endpoint}?${new URLSearchParams({ response_type: "code", client_id, redirect_uri: redirectUsed, code_challenge: challenge, code_challenge_method: "S256", state: "xyz", resource: prm.resource, scope: "offline_access" })}`;
const page = await (await fetch(authUrl)).text();
const form = page.match(/name="form" value="([^"]+)"/)?.[1];
assert.ok(form, "page de connexion sans formulaire");
const post = (body: Record<string, string>) =>
  fetch(as.authorization_endpoint, { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
const bad = await post({ form, action: "autoriser", insee_api_key: "fausse-cle" });
assert.equal(bad.status, 200);
assert.match(await bad.text(), /Échec/);
ok("clé invalide refusée sur la page de connexion");
const auth = await post({ form, action: "autoriser" });
assert.equal(auth.status, 302);
const loc = new URL(auth.headers.get("location")!);
assert.equal(loc.searchParams.get("state"), "xyz");
const code = loc.searchParams.get("code")!;
ok("autorisation → code");

// 4. Jeton
const tok = (body: Record<string, string>) => fetch(as.token_endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
assert.equal((await tok({ grant_type: "authorization_code", code, client_id, redirect_uri: redirectUsed, code_verifier: "mauvais" })).status, 400);
const t1 = await (await tok({ grant_type: "authorization_code", code, client_id, redirect_uri: redirectUsed, code_verifier: verifier, resource: prm.resource })).json();
assert.ok(t1.access_token && t1.refresh_token, JSON.stringify(t1));
assert.equal((await tok({ grant_type: "authorization_code", code, client_id, redirect_uri: redirectUsed, code_verifier: verifier })).status, 400);
ok("échange du code (PKCE vérifié, rejeu refusé)");

// 5. Appel MCP authentifié
const client = new Client({ name: "e2e", version: "1" });
await client.connect(new StreamableHTTPClientTransport(new URL(prm.resource), { requestInit: { headers: { Authorization: `Bearer ${t1.access_token}` } } }));
const names = (await client.listTools()).tools.map((t) => t.name);
assert.ok(names.includes("bofip_rechercher") && !names.includes("sirene_rechercher"), names.join(","));
const r = await client.callTool({ name: "bofip_rechercher", arguments: { texte: "crédit d'impôt recherche", limite: 1 } });
assert.ok(!r.isError, JSON.stringify(r.content));
await client.close();
ok(`appel MCP authentifié (${names.length} outils)`);

// 6. Rafraîchissement
const t2 = await (await tok({ grant_type: "refresh_token", refresh_token: t1.refresh_token, client_id })).json();
assert.ok(t2.access_token && t2.refresh_token && t2.refresh_token !== t1.refresh_token);
ok("rafraîchissement avec rotation");
console.error("E2E distant OK");
