/** Test réel des identifiants saisis sur la page de connexion : une requête par module. */
import { type Credentials, config, hasInsee, hasPiste, pisteUrls } from "../config.js";
import { request } from "../http.js";
import { pisteToken } from "../piste.js";

export type Check = { module: string; ok: boolean; message: string };

/** Message lisible : sans le détail brut renvoyé par l'API. */
const err = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/ Détail : .*$/s, "");

export async function checkCredentials(c: Credentials): Promise<Check[]> {
  const out: Check[] = [];
  const signal = AbortSignal.timeout(20_000);

  if (hasInsee(c)) {
    try {
      await request(`${config.inseeBase}/informations`, { service: "API Sirene (INSEE)", headers: { "X-INSEE-Api-Key-Integration": c.inseeApiKey! }, signal });
      out.push({ module: "Sirene", ok: true, message: "Clé acceptée." });
    } catch (e) {
      out.push({ module: "Sirene", ok: false, message: err(e) });
    }
  }

  if (hasPiste(c)) {
    let token: string | undefined;
    try {
      token = await pisteToken(c, signal, true);
    } catch (e) {
      out.push({ module: "PISTE", ok: false, message: err(e) });
    }
    if (token) {
      const api = pisteUrls(c.pisteSandbox).api;
      for (const [module, path] of [
        ["Légifrance", `${config.legifrancePath}/consult/ping`],
        ["Judilibre", `${config.judilibrePath}/healthcheck`],
      ] as const) {
        try {
          await request(`${api}${path}`, { service: module, headers: { Authorization: `Bearer ${token}` }, signal, raw: true });
          out.push({ module, ok: true, message: "Accès confirmé." });
        } catch (e) {
          const m = err(e);
          out.push({
            module,
            ok: false,
            message: m.includes("403")
              ? "Identifiants valides mais application non souscrite à cette API (ou CGU non acceptées). Voir le guide : accepter les CGU, puis cocher l'API dans « Modifier l'application »."
              : m,
          });
        }
      }
    }
  }
  return out;
}
