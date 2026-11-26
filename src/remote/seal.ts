/**
 * Jetons scellés (AES-256-GCM) : le serveur ne stocke rien. Les identifiants INSEE/PISTE de l'utilisateur voyagent
 * chiffrés dans ses propres jetons OAuth, lisibles uniquement avec SERVER_SECRET.
 * Une clé dérivée par usage (HKDF) empêche qu'un code d'autorisation soit accepté comme jeton d'accès, etc.
 * Changer SERVER_SECRET invalide tous les jetons : les utilisateurs se reconnectent.
 */
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export type Purpose = "client" | "form" | "code" | "access" | "refresh";

let master: Buffer | undefined;
export function initSecret(secret: string) {
  const b = Buffer.from(secret, "base64url");
  if (b.length < 32) throw new Error("SERVER_SECRET doit contenir au moins 32 octets en base64url (ex. `openssl rand -base64 48`).");
  master = b;
}

const keys = new Map<Purpose, Buffer>();
function key(p: Purpose): Buffer {
  if (!master) throw new Error("SERVER_SECRET non initialisé");
  let k = keys.get(p);
  if (!k) keys.set(p, (k = Buffer.from(hkdfSync("sha256", master, "api-publiques-fr", `seal:${p}`, 32))));
  return k;
}

/** Scelle une charge utile avec une durée de vie en secondes. */
export function seal(p: Purpose, payload: object, ttlSeconds: number): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(p), iv);
  const body = Buffer.concat([c.update(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds })), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString("base64url");
}

/** Ouvre un jeton ; undefined s'il est falsifié, d'un autre usage ou expiré. */
export function open<T extends object>(p: Purpose, token: string): (T & { exp: number }) | undefined {
  try {
    const raw = Buffer.from(token, "base64url");
    if (raw.length < 29) return undefined;
    const d = createDecipheriv("aes-256-gcm", key(p), raw.subarray(0, 12));
    d.setAuthTag(raw.subarray(12, 28));
    const v = JSON.parse(Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString()) as T & { exp: number };
    return v.exp > Date.now() / 1000 ? v : undefined;
  } catch {
    return undefined;
  }
}
