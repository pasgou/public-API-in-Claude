import { config } from "./config.js";

export type Query = Record<string, string | number | boolean | string[] | undefined | null>;

export class ApiError extends Error {
  constructor(
    readonly service: string,
    readonly status: number,
    detail?: string,
  ) {
    super(httpErrorMessage(service, status, detail));
  }
}

function httpErrorMessage(service: string, status: number, detail?: string): string {
  const d = detail ? ` Détail : ${detail.slice(0, 400)}` : "";
  switch (status) {
    case 400:
      return `${service} : requête invalide (HTTP 400). Vérifier les paramètres.${d}`;
    case 401:
      return `${service} : authentification refusée (HTTP 401). Vérifier la clé ou les identifiants configurés.${d}`;
    case 403:
      return `${service} : accès refusé (HTTP 403). L'application n'est probablement pas abonnée à cette API sur le portail, ou les CGU n'ont pas été acceptées.${d}`;
    case 404:
      return `${service} : ressource introuvable (HTTP 404). Vérifier l'identifiant.${d}`;
    case 429:
      return `${service} : quota dépassé (HTTP 429). Attendre avant de relancer.${d}`;
    default:
      return `${service} : erreur HTTP ${status}.${d}`;
  }
}

function buildUrl(base: string, query?: Query): URL {
  const url = new URL(base);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined || v === null || v === "") continue;
    if (Array.isArray(v)) v.forEach((x) => url.searchParams.append(k, x));
    else url.searchParams.set(k, String(v));
  }
  return url;
}

const RETRYABLE = new Set([429, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), reject(signal.reason)), { once: true });
  });

export interface RequestOptions {
  service: string;
  method?: "GET" | "POST";
  query?: Query;
  headers?: Record<string, string>;
  json?: unknown;
  form?: Record<string, string>;
  signal?: AbortSignal;
  /** Renvoie le texte brut au lieu de parser du JSON. */
  raw?: boolean;
}

/** Requête HTTP avec délai de 30 s et 4 tentatives sur erreurs réseau, 429 (Retry-After ≤ 10 s) et 5xx de passerelle. */
export async function request<T = unknown>(url: string, opts: RequestOptions): Promise<T> {
  const target = buildUrl(url, opts.query);
  const headers: Record<string, string> = { "User-Agent": config.userAgent, Accept: "application/json", ...opts.headers };
  let body: string | undefined;
  if (opts.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(opts.form).toString();
  }

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const signals = [AbortSignal.timeout(30_000)];
    if (opts.signal) signals.push(opts.signal);
    let res: Response;
    try {
      res = await fetch(target, { method: opts.method ?? "GET", headers, body, signal: AbortSignal.any(signals) });
    } catch (e) {
      if (opts.signal?.aborted) throw e;
      lastError = e;
      if (e instanceof DOMException && e.name === "TimeoutError") {
        lastError = new Error(`${opts.service} : pas de réponse en 30 s. Réessayer ou restreindre la requête.`);
      }
      await sleep(1000 * 2 ** (attempt - 1), opts.signal);
      continue;
    }
    if (res.ok) {
      const text = await res.text();
      if (opts.raw) return text as T;
      try {
        return (text ? JSON.parse(text) : {}) as T;
      } catch {
        throw new Error(`${opts.service} : réponse non JSON reçue (${text.slice(0, 200)}).`);
      }
    }
    const detail = (await res.text().catch(() => "")).replace(/\s+/g, " ").trim();
    lastError = new ApiError(opts.service, res.status, detail);
    if (!RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS) break;
    const retryAfter = Number(res.headers.get("retry-after"));
    await sleep(Math.min(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * attempt, 10_000), opts.signal);
  }
  if (lastError instanceof Error && !(lastError instanceof ApiError) && !lastError.message.startsWith(opts.service)) {
    throw new Error(`${opts.service} : échec réseau (${lastError.message}). Réessayer dans quelques secondes.`);
  }
  throw lastError;
}
