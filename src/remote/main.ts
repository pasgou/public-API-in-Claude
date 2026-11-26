#!/usr/bin/env node
/**
 * Serveur distant (Streamable HTTP) pour les connecteurs personnalisés Claude : claude.ai, Desktop, mobile, Cowork.
 * Variables : PUBLIC_URL (https://hôte public, sans /mcp), SERVER_SECRET (≥ 32 octets base64url), PORT (8080),
 * CIMD_TRUSTED_HOSTS (hôtes autorisés à publier un document client CIMD ; défaut claude.ai,claude.com),
 * RATE_LIMIT_OAUTH (requêtes/min par IP sur les pages OAuth, défaut 30), RATE_LIMIT_MCP (requêtes/min par jeton, défaut 120).
 * Aucune donnée sensible n'est journalisée (ni en-tête Authorization, ni identifiant).
 */
import express from "express";
import { createMcpExpressApp, mcpAuthMetadataRouter, originValidation, requireBearerAuth } from "@modelcontextprotocol/express";
import { toNodeHandler } from "@modelcontextprotocol/node";
import {
  createMcpHandler,
  getOAuthProtectedResourceMetadataUrl,
  OAuthError,
  OAuthErrorCode,
  type AuthInfo,
  type OAuthMetadata,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { type Credentials, env } from "../config.js";
import { createServer, VERSION } from "../server.js";
import { authorizeGet, authorizePost, readAccessToken, register, token, type OAuthSettings } from "./oauth.js";
import { homePage } from "./pages.js";
import { byIp, byToken, rateLimit } from "./ratelimit.js";
import { initSecret } from "./seal.js";

const publicUrl = env("PUBLIC_URL")?.replace(/\/$/, "");
const secret = env("SERVER_SECRET");
if (!publicUrl || !secret) {
  console.error("PUBLIC_URL et SERVER_SECRET sont requis.");
  process.exit(1);
}
initSecret(secret);
const issuer = new URL(publicUrl);
const insecure = issuer.protocol !== "https:";
if (insecure && !["localhost", "127.0.0.1"].includes(issuer.hostname)) {
  console.error("PUBLIC_URL doit être en https (http accepté uniquement pour localhost).");
  process.exit(1);
}
const mcpUrl = new URL("/mcp", issuer);
const settings: OAuthSettings = {
  issuer: issuer.href.replace(/\/$/, ""),
  resource: mcpUrl.href,
  cimdTrustedHosts: (env("CIMD_TRUSTED_HOSTS") ?? "claude.ai,claude.com").split(",").map((h) => h.trim()),
};

const oauthMetadata = {
  issuer: settings.issuer,
  authorization_endpoint: `${settings.issuer}/authorize`,
  token_endpoint: `${settings.issuer}/token`,
  registration_endpoint: `${settings.issuer}/register`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code", "refresh_token"],
  code_challenge_methods_supported: ["S256"],
  token_endpoint_auth_methods_supported: ["none"],
  scopes_supported: ["offline_access"],
  client_id_metadata_document_supported: true,
  authorization_response_iss_parameter_supported: true,
} as OAuthMetadata;

const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(t): Promise<AuthInfo> {
    const g = readAccessToken(t);
    if (!g) throw new OAuthError(OAuthErrorCode.InvalidToken, "Jeton invalide ou expiré");
    return { token: t, clientId: g.cid, scopes: g.sc ? g.sc.split(" ") : [], expiresAt: g.exp, resource: new URL(g.rs), extra: { creds: g.c } };
  },
};

const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts: [issuer.hostname, "localhost", "127.0.0.1"] });
app.set("trust proxy", true);
app.use(express.urlencoded({ extended: false, limit: "32kb" }));
app.use(
  mcpAuthMetadataRouter({
    oauthMetadata,
    resourceServerUrl: mcpUrl,
    resourceName: "API publiques françaises",
    scopesSupported: ["offline_access"],
    ...(insecure ? { dangerouslyAllowInsecureIssuerUrl: true } : {}),
  }),
);

app.get("/", (_req, res) => void res.type("html").send(homePage(mcpUrl.href)));
app.get("/health", (_req, res) => void res.json({ ok: true, version: VERSION }));
const oauthLimit = rateLimit(Number(env("RATE_LIMIT_OAUTH") ?? 30), byIp);
// Formulaire de connexion : n'accepter que les envois depuis la page du serveur lui-même.
const sameOrigin = originValidation([issuer.hostname]);
app.post("/register", oauthLimit, register);
app.get("/authorize", oauthLimit, (req, res) => void authorizeGet(req, res, settings));
app.post("/authorize", oauthLimit, sameOrigin, (req, res) => void authorizePost(req, res, settings));
app.post("/token", oauthLimit, (req, res) => token(req, res, settings));

const handler = createMcpHandler(({ authInfo }) => createServer((authInfo?.extra?.creds as Credentials | undefined) ?? {}));
const nodeHandler = toNodeHandler(handler);
const requireAuth = requireBearerAuth({ verifier, expectedResource: mcpUrl, resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpUrl) });
app.all("/mcp", rateLimit(Number(env("RATE_LIMIT_MCP") ?? 120), byToken), requireAuth, (req, res) => void nodeHandler(req, res, req.body));

const port = Number(env("PORT") ?? 8080);
app.listen(port, "0.0.0.0", () => console.error(`api-publiques-fr ${VERSION} (HTTP) — ${mcpUrl.href} — écoute sur le port ${port}`));
