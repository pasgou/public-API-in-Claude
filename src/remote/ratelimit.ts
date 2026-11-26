/**
 * Limitation de débit en mémoire (fenêtre glissante d'une minute), sans dépendance.
 * - pages et points OAuth : par adresse IP (protège les tests de clés contre l'abus) ;
 * - /mcp : par jeton (le trafic de Claude provient de quelques IP partagées entre tous ses utilisateurs).
 */
import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function rateLimit(perMinute: number, keyOf: (req: Request) => string) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = keyOf(req);
    const recent = (hits.get(key) ?? []).filter((t) => now - t < 60_000);
    if (recent.length >= perMinute) {
      res.set("Retry-After", "60").status(429).json({ error: "rate_limited", error_description: "Trop de requêtes : réessayer dans une minute." });
      return;
    }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) for (const [k, v] of hits) if (now - v[v.length - 1] > 60_000) hits.delete(k);
    next();
  };
}

export const byIp = (req: Request) => req.ip ?? "inconnu";
export const byToken = (req: Request) =>
  createHash("sha256").update(req.headers.authorization ?? req.ip ?? "").digest("base64url").slice(0, 22);
