/**
 * Configuration statique (commune à tous les utilisateurs) et identifiants par utilisateur.
 * En local (stdio), les identifiants viennent de l'environnement ; en distant (HTTP), du jeton OAuth de l'utilisateur.
 * Une valeur vide, ou un gabarit MCPB non substitué ("${user_config.x}"), vaut « non renseignée ».
 */
export function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v || v.startsWith("${")) return undefined;
  return v;
}

export const config = {
  userAgent: env("MCP_USER_AGENT") ?? "api-publiques-fr-mcp-server/0.2 (+https://github.com/pasgou/public-API-in-Claude)",
  // 3.11 = version de référence (maintenue jusqu'à mi-2028). La V4 (bêta depuis le 13/10/2026) a une syntaxe
  // multicritère différente (POST) : migration prévue quand elle deviendra officielle (mi-2027).
  inseeBase: "https://api.insee.fr/api-sirene/3.11",
  legifrancePath: env("LEGIFRANCE_BASE_PATH") ?? "/dila/legifrance/lf-engine-app",
  judilibrePath: env("JUDILIBRE_BASE_PATH") ?? "/cassation/judilibre/v1.0",
};

export interface Credentials {
  inseeApiKey?: string;
  pisteClientId?: string;
  pisteClientSecret?: string;
  pisteSandbox?: boolean;
}

export function credentialsFromEnv(): Credentials {
  return {
    inseeApiKey: env("INSEE_API_KEY"),
    pisteClientId: env("PISTE_CLIENT_ID"),
    pisteClientSecret: env("PISTE_CLIENT_SECRET"),
    pisteSandbox: ["sandbox", "true"].includes(env("PISTE_ENV") ?? ""),
  };
}

export const pisteUrls = (sandbox?: boolean) =>
  sandbox
    ? { api: "https://sandbox-api.piste.gouv.fr", oauth: "https://sandbox-oauth.piste.gouv.fr/api/oauth/token" }
    : { api: "https://api.piste.gouv.fr", oauth: "https://oauth.piste.gouv.fr/api/oauth/token" };

export const hasInsee = (c: Credentials) => Boolean(c.inseeApiKey);
export const hasPiste = (c: Credentials) => Boolean(c.pisteClientId && c.pisteClientSecret);
