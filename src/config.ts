/**
 * Configuration lue dans l'environnement.
 * Une valeur vide, ou un gabarit MCPB non substitué ("${user_config.x}"), vaut « non renseignée ».
 */
function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v || v.startsWith("${")) return undefined;
  return v;
}

export const config = {
  userAgent: env("MCP_USER_AGENT") ?? "api-publiques-fr-mcp-server/0.1",

  insee: {
    apiKey: env("INSEE_API_KEY"),
    // 3.11 = version de référence (maintenue jusqu'à mi-2028). La V4 (bêta depuis le 13/10/2026) a une syntaxe
    // multicritère différente (POST) : migration prévue quand elle deviendra officielle (mi-2027).
    base: "https://api.insee.fr/api-sirene/3.11",
  },

  piste: {
    clientId: env("PISTE_CLIENT_ID"),
    clientSecret: env("PISTE_CLIENT_SECRET"),
    sandbox: ["sandbox", "true"].includes(env("PISTE_ENV") ?? ""),
    legifrancePath: env("LEGIFRANCE_BASE_PATH") ?? "/dila/legifrance/lf-engine-app",
    judilibrePath: env("JUDILIBRE_BASE_PATH") ?? "/cassation/judilibre/v1.0",
  },
};

export const pisteUrls = () =>
  config.piste.sandbox
    ? { api: "https://sandbox-api.piste.gouv.fr", oauth: "https://sandbox-oauth.piste.gouv.fr/api/oauth/token" }
    : { api: "https://api.piste.gouv.fr", oauth: "https://oauth.piste.gouv.fr/api/oauth/token" };

export const hasInsee = () => Boolean(config.insee.apiKey);
export const hasPiste = () => Boolean(config.piste.clientId && config.piste.clientSecret);
