/**
 * Serveur d'autorisation OAuth 2.1 intégré (même origine que le serveur MCP), conforme aux exigences des
 * connecteurs personnalisés Claude (doc claude.com/docs/connectors/building/authentication) :
 * - enregistrement du client par CIMD (prioritaire pour Claude) ou DCR (repli) ;
 * - PKCE S256 obligatoire, client public (token_endpoint_auth_method = none) ;
 * - grant authorization_code + refresh_token avec rotation ;
 * - /token en application/x-www-form-urlencoded.
 * Sans état : client DCR, code, jetons d'accès et de rafraîchissement sont des blobs scellés (seal.ts).
 */
import { createHash, randomUUID } from "node:crypto";
import type { Request, Response } from "express";
import type { Credentials } from "../config.js";
import { checkCredentials, type Check } from "./check.js";
import { authorizePage, errorPage } from "./pages.js";
import { open, seal } from "./seal.js";

export const TTL = { form: 900, code: 300, access: 3600, refresh: 90 * 24 * 3600, client: 10 * 365 * 24 * 3600 };

export interface OAuthSettings {
  issuer: string; // ex. https://mcp.exemple.fr
  resource: string; // ex. https://mcp.exemple.fr/mcp
  cimdTrustedHosts: string[];
}

// ---------- Clients ----------

type Client = { id: string; label: string; redirectUris: string[] };
const cimdCache = new Map<string, { client: Client; until: number }>();

const isLoopback = (u: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
function redirectAllowed(client: Client, redirect: string): boolean {
  let r: URL;
  try {
    r = new URL(redirect);
  } catch {
    return false;
  }
  return client.redirectUris.some((allowed) => {
    if (allowed === redirect) return true;
    const a = new URL(allowed);
    // Boucle locale (Claude Code) : port ignoré.
    return isLoopback(a) && isLoopback(r) && a.protocol === r.protocol && a.hostname === r.hostname && a.pathname === r.pathname;
  });
}

async function resolveClient(clientId: string, s: OAuthSettings): Promise<Client> {
  if (/^https:\/\//.test(clientId)) {
    // Client ID Metadata Document : l'identifiant est l'URL d'un document JSON publié par le client.
    const url = new URL(clientId);
    if (!s.cimdTrustedHosts.includes(url.hostname)) {
      throw new Error(`Client « ${url.hostname} » non autorisé sur ce serveur (CIMD_TRUSTED_HOSTS).`);
    }
    const hit = cimdCache.get(clientId);
    if (hit && hit.until > Date.now()) return hit.client;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000), redirect: "error", headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`Document client inaccessible (HTTP ${res.status}).`);
    const text = await res.text();
    if (text.length > 20_000) throw new Error("Document client trop volumineux.");
    const doc = JSON.parse(text) as { client_id?: string; redirect_uris?: unknown; client_name?: string };
    if (doc.client_id !== clientId) throw new Error("Document client invalide : client_id différent de son URL.");
    if (!Array.isArray(doc.redirect_uris) || !doc.redirect_uris.every((u) => typeof u === "string")) {
      throw new Error("Document client invalide : redirect_uris manquant.");
    }
    // Affichage : l'hôte de l'URL (vérifiable), pas client_name (auto-déclaré).
    const client = { id: clientId, label: url.hostname, redirectUris: doc.redirect_uris as string[] };
    cimdCache.set(clientId, { client, until: Date.now() + 10 * 60_000 });
    return client;
  }
  const c = open<{ r: string[]; n?: string }>("client", clientId);
  if (!c) throw new Error("Client inconnu : reconnecter le connecteur.");
  return { id: clientId, label: c.n ? `${c.n} (enregistrement dynamique)` : "client enregistré dynamiquement", redirectUris: c.r };
}

/** POST /register — enregistrement dynamique (RFC 7591), client public. */
export function register(req: Request, res: Response) {
  const b = (req.body ?? {}) as { redirect_uris?: unknown; client_name?: unknown };
  const uris = Array.isArray(b.redirect_uris) ? b.redirect_uris.filter((u): u is string => typeof u === "string") : [];
  const valid = uris.length > 0 && uris.every((u) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" || (x.protocol === "http:" && isLoopback(x));
    } catch {
      return false;
    }
  });
  if (!valid) return res.status(400).json({ error: "invalid_redirect_uri", error_description: "redirect_uris : URL https (ou boucle locale http) requises." });
  const name = typeof b.client_name === "string" ? b.client_name.slice(0, 80) : undefined;
  const clientId = seal("client", { r: uris, n: name }, TTL.client);
  res.status(201).json({
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    redirect_uris: uris,
    client_name: name,
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}

// ---------- Autorisation ----------

type FormState = { cid: string; ru: string; cc: string; st?: string; sc: string; rs: string; lb: string };

const sameResource = (a: string, b: string) => a.replace(/\/$/, "") === b.replace(/\/$/, "");

function redirectWith(res: Response, redirectUri: string, params: Record<string, string | undefined>) {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  res.redirect(302, u.toString());
}

/** GET /authorize — vérifie la demande puis affiche la page de connexion. */
export async function authorizeGet(req: Request, res: Response, s: OAuthSettings) {
  const q = req.query as Record<string, string | undefined>;
  let client: Client;
  try {
    if (!q.client_id || !q.redirect_uri) throw new Error("Paramètres client_id et redirect_uri requis.");
    client = await resolveClient(q.client_id, s);
    if (!redirectAllowed(client, q.redirect_uri)) throw new Error("redirect_uri non déclarée pour ce client.");
  } catch (e) {
    // Client ou redirection douteux : ne jamais rediriger (RFC 6749 §4.1.2.1).
    return res.status(400).type("html").send(errorPage((e as Error).message));
  }
  const fail = (error: string, d: string) => redirectWith(res, q.redirect_uri!, { error, error_description: d, state: q.state, iss: s.issuer });
  if (q.response_type !== "code") return fail("unsupported_response_type", "response_type=code attendu");
  if (!q.code_challenge || q.code_challenge_method !== "S256") return fail("invalid_request", "PKCE S256 obligatoire");
  if (q.resource && !sameResource(q.resource, s.resource)) return fail("invalid_target", `resource attendu : ${s.resource}`);
  const form: FormState = { cid: client.id, ru: q.redirect_uri!, cc: q.code_challenge, st: q.state, sc: q.scope ?? "", rs: s.resource, lb: client.label };
  res.type("html").send(authorizePage({ form: seal("form", form, TTL.form), client: client.label }));
}

const used = new Map<string, number>(); // codes déjà échangés (anti-rejeu, instance unique)
function markUsed(jti: string, exp: number): boolean {
  const now = Date.now() / 1000;
  for (const [k, e] of used) if (e < now) used.delete(k);
  if (used.has(jti)) return false;
  used.set(jti, exp);
  return true;
}

const field = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

/** POST /authorize — boutons Tester / Autoriser / Refuser de la page de connexion. */
export async function authorizePost(req: Request, res: Response, s: OAuthSettings) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const f = open<FormState>("form", String(b.form ?? ""));
  if (!f) return res.status(400).type("html").send(errorPage("Demande expirée (15 min) ou invalide. Relancer la connexion depuis Claude."));

  if (b.action === "refuser") return redirectWith(res, f.ru, { error: "access_denied", state: f.st, iss: s.issuer });

  const creds: Credentials = {
    inseeApiKey: field(b.insee_api_key),
    pisteClientId: field(b.piste_client_id),
    pisteClientSecret: field(b.piste_client_secret),
    pisteSandbox: b.piste_sandbox === "on",
  };
  if (Boolean(creds.pisteClientId) !== Boolean(creds.pisteClientSecret)) {
    return res.type("html").send(authorizePage({ form: String(b.form), client: f.lb, values: creds, error: "PISTE : renseigner le Client ID et le Client Secret, ou aucun des deux." }));
  }
  const checks: Check[] = await checkCredentials(creds);
  const failed = checks.some((c) => !c.ok);
  if (b.action === "tester" || failed) {
    return res.type("html").send(
      authorizePage({
        form: String(b.form),
        client: f.lb,
        values: creds,
        checks,
        error: failed && b.action !== "tester" ? "Connexion non autorisée : corriger ou vider les champs en erreur." : undefined,
      }),
    );
  }
  const code = seal("code", { c: creds, cid: f.cid, ru: f.ru, cc: f.cc, rs: f.rs, sc: f.sc, jti: randomUUID() }, TTL.code);
  redirectWith(res, f.ru, { code, state: f.st, iss: s.issuer });
}

// ---------- Jetons ----------

type Grant = { c: Credentials; cid: string; rs: string; sc: string };

function issue(res: Response, g: Grant) {
  res.set("Cache-Control", "no-store").json({
    access_token: seal("access", g, TTL.access),
    token_type: "Bearer",
    expires_in: TTL.access,
    refresh_token: seal("refresh", g, TTL.refresh),
    scope: g.sc || undefined,
  });
}

const tokenError = (res: Response, error: string, d: string, status = 400) =>
  res.status(status).set("Cache-Control", "no-store").json({ error, error_description: d });

/** POST /token — authorization_code (PKCE) et refresh_token (rotation). */
export function token(req: Request, res: Response, s: OAuthSettings) {
  if (!req.is("application/x-www-form-urlencoded")) return tokenError(res, "invalid_request", "Content-Type application/x-www-form-urlencoded attendu", 415);
  const b = req.body as Record<string, string | undefined>;
  if (b.resource && !sameResource(b.resource, s.resource)) return tokenError(res, "invalid_target", `resource attendu : ${s.resource}`);

  if (b.grant_type === "authorization_code") {
    const c = open<Grant & { ru: string; cc: string; jti: string }>("code", b.code ?? "");
    if (!c) return tokenError(res, "invalid_grant", "Code invalide ou expiré");
    if (c.cid !== b.client_id) return tokenError(res, "invalid_grant", "Code émis pour un autre client");
    if (c.ru !== b.redirect_uri) return tokenError(res, "invalid_grant", "redirect_uri différente de celle de l'autorisation");
    const challenge = createHash("sha256").update(b.code_verifier ?? "").digest("base64url");
    if (!b.code_verifier || challenge !== c.cc) return tokenError(res, "invalid_grant", "code_verifier PKCE invalide");
    if (!markUsed(c.jti, c.exp)) return tokenError(res, "invalid_grant", "Code déjà utilisé");
    return issue(res, { c: c.c, cid: c.cid, rs: c.rs, sc: c.sc });
  }

  if (b.grant_type === "refresh_token") {
    const r = open<Grant>("refresh", b.refresh_token ?? "");
    if (!r) return tokenError(res, "invalid_grant", "Jeton de rafraîchissement invalide ou expiré");
    if (b.client_id && b.client_id !== r.cid) return tokenError(res, "invalid_grant", "Jeton émis pour un autre client");
    return issue(res, { c: r.c, cid: r.cid, rs: r.rs, sc: r.sc });
  }

  return tokenError(res, "unsupported_grant_type", "authorization_code ou refresh_token");
}

/** Lecture d'un jeton d'accès pour le serveur MCP. */
export function readAccessToken(t: string) {
  return open<Grant>("access", t);
}
