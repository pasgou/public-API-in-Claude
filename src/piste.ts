/**
 * Authentification PISTE (AIFE) : OAuth2 « client credentials ».
 * Source : guide utilisateur PISTE, § 7.5 et annexe 12.2 (points d'accès).
 * POST https://oauth.piste.gouv.fr/api/oauth/token
 *   grant_type=client_credentials&client_id=…&client_secret=…&scope=openid
 */
import { config, hasPiste, pisteUrls } from "./config.js";
import { ApiError, request, type RequestOptions } from "./http.js";

let cached: { token: string; expiresAt: number } | undefined;

async function token(signal?: AbortSignal, force = false): Promise<string> {
  if (!hasPiste()) {
    throw new Error(
      "PISTE non configuré : renseigner PISTE_CLIENT_ID et PISTE_CLIENT_SECRET (application créée sur piste.gouv.fr, abonnée aux API Légifrance et/ou Judilibre, CGU acceptées).",
    );
  }
  if (!force && cached && cached.expiresAt > Date.now() + 30_000) return cached.token;
  const res = await request<{ access_token: string; expires_in?: number }>(pisteUrls().oauth, {
    service: "PISTE OAuth",
    method: "POST",
    form: {
      grant_type: "client_credentials",
      client_id: config.piste.clientId!,
      client_secret: config.piste.clientSecret!,
      scope: "openid",
    },
    signal,
  }).catch((e: unknown) => {
    if (e instanceof Error && e.message.includes("invalid_client")) {
      throw new Error(
        `PISTE : identifiants refusés (invalid_client). Vérifier PISTE_CLIENT_ID / PISTE_CLIENT_SECRET et l'environnement (${config.piste.sandbox ? "sandbox" : "production"}) : des identifiants SANDBOX ne fonctionnent pas en production, et inversement.`,
      );
    }
    throw e;
  });
  cached = { token: res.access_token, expiresAt: Date.now() + (res.expires_in ?? 3600) * 1000 };
  return cached.token;
}

/** Appel d'une API PISTE ; renouvelle le jeton une fois en cas de 401. */
export async function pisteRequest<T>(basePath: string, path: string, opts: Omit<RequestOptions, "headers">): Promise<T> {
  const url = `${pisteUrls().api}${basePath}${path}`;
  for (const force of [false, true]) {
    const t = await token(opts.signal, force);
    try {
      return await request<T>(url, { ...opts, headers: { Authorization: `Bearer ${t}` } });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 401) || force) throw e;
      cached = undefined;
    }
  }
  throw new Error("unreachable");
}
