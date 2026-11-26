import type { CallToolResult } from "@modelcontextprotocol/server";

export const CHARACTER_LIMIT = 25_000;

/** Supprime récursivement null, chaînes vides, tableaux et objets vides : réduit la réponse sans perdre d'information. */
export function prune(value: unknown, drop: ReadonlySet<string> = new Set()): unknown {
  if (Array.isArray(value)) {
    const arr = value.map((v) => prune(v, drop)).filter((v) => v !== undefined);
    return arr.length ? arr : undefined;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (drop.has(k)) continue;
      const p = prune(v, drop);
      if (p !== undefined) out[k] = p;
    }
    return Object.keys(out).length ? out : undefined;
  }
  if (value === null || value === undefined || value === "") return undefined;
  return value;
}

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", rsquo: "’", laquo: "«", raquo: "»", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç" };

/** Convertit un fragment HTML en texte lisible (paragraphes conservés). */
export function stripHtml(html: string): string {
  return html
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
}

/** Applique stripHtml à toutes les chaînes qui contiennent des balises. */
export function deepStripHtml(value: unknown): unknown {
  if (typeof value === "string") return /<[a-z/][^>]*>/i.test(value) ? stripHtml(value) : value;
  if (Array.isArray(value)) return value.map(deepStripHtml);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, deepStripHtml(v)]));
  }
  return value;
}

/** Résultat d'outil : JSON compact (lisible par le modèle, sans indentation coûteuse). */
export function json(data: unknown, note?: string): CallToolResult {
  const text = JSON.stringify(data ?? {});
  if (text.length <= CHARACTER_LIMIT) return { content: [{ type: "text", text: note ? `${note}\n${text}` : text }] };
  return {
    content: [
      {
        type: "text",
        text:
          `${note ? note + "\n" : ""}${text.slice(0, CHARACTER_LIMIT)}\n[…] Réponse tronquée à ${CHARACTER_LIMIT} caractères sur ${text.length}. ` +
          "Réduire le nombre de résultats ou cibler l'élément voulu.",
      },
    ],
  };
}

/** Découpe un long texte en fenêtres, avec indication de la suite. */
export function window(text: string, offset: number, length = 20_000): { extrait: string; suite?: string } {
  const extrait = text.slice(offset, offset + length);
  const end = offset + extrait.length;
  return end < text.length
    ? { extrait, suite: `Texte de ${text.length} caractères ; extrait ${offset}–${end}. Rappeler avec debut=${end} pour la suite.` }
    : { extrait };
}

export const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } as const;
