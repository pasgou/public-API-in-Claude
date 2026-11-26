/**
 * Authentification PISTE (AIFE) : OAuth2 « client credentials ».
 * Source : guide utilisateur PISTE, § 7.5 et annexe 12.2 (points d'accès).
 * POST https://oauth.piste.gouv.fr/api/oauth/token
 *   grant_type=client_credentials&client_id=…&client_secret=…&scope=openid
 */
import { createHash } from "node:crypto";
import { type Credentials, hasPiste, pisteUrls } from "./config.js";
import { ApiError, request, type RequestOptions } from "./http.js";

/** Jetons PISTE en cache par jeu d'identifiants (partagé entre requêtes HTTP du même utilisateur). */
const cache = new Map<string, { token: string; expiresAt: number }>();
const cacheKey = (c: Credentials) =>
  createHash("sha256").update(`${c.pisteSandbox}\n${c.pisteClientId}\n${c.pisteClientSecret}`).digest("hex");

export async function pisteToken(c: Credentials, signal?: AbortSignal, force = false): Promise<string> {
  if (!hasPiste(c)) {
    throw new Error(
      "PISTE non configuré : renseigner le Client ID et le Client Secret d'une application piste.gouv.fr souscrite à Légifrance et/ou Judilibre (CGU acceptées).",
    );
  }
  const key = cacheKey(c);
  const hit = cache.get(key);
  if (!force && hit && hit.expiresAt > Date.now() + 30_000) return hit.token;
  const res = await request<{ access_token: string; expires_in?: number }>(pisteUrls(c.pisteSandbox).oauth, {
    service: "PISTE OAuth",
    method: "POST",
    form: { grant_type: "client_credentials", client_id: c.pisteClientId!, client_secret: c.pisteClientSecret!, scope: "openid" },
    signal,
  }).catch((e: unknown) => {
    if (e instanceof Error && e.message.includes("invalid_client")) {
      throw new Error(
        `PISTE : identifiants refusés (invalid_client). Vérifier le Client ID / Secret et l'environnement (${c.pisteSandbox ? "sandbox" : "production"}) : des identifiants SANDBOX ne fonctionnent pas en production, et inversement.`,
      );
    }
    throw e;
  });
  cache.set(key, { token: res.access_token, expiresAt: Date.now() + (res.expires_in ?? 3600) * 1000 });
  if (cache.size > 1000) cache.delete(cache.keys().next().value!);
  return res.access_token;
}

/** Appel d'une API PISTE ; renouvelle le jeton une fois en cas de 401. */
export async function pisteRequest<T>(c: Credentials, basePath: string, path: string, opts: Omit<RequestOptions, "headers">): Promise<T> {
  const url = `${pisteUrls(c.pisteSandbox).api}${basePath}${path}`;
  for (const force of [false, true]) {
    const t = await pisteToken(c, opts.signal, force);
    try {
      return await request<T>(url, { ...opts, headers: { Authorization: `Bearer ${t}` } });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401) || force) throw e;
    }
  }
  throw new Error("unreachable");
}
