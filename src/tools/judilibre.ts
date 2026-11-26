/**
 * API Judilibre (Cour de cassation) via PISTE — https://api.piste.gouv.fr/cassation/judilibre/v1.0
 * Doc : JUDILIBRE-public.json 1.2.5 (dépôt Cour-de-cassation/judilibre-search, référencé par data.gouv.fr).
 * Auth : jeton OAuth PISTE (Bearer). Le swagger déclare aussi une clé « KeyId », non utilisée ici.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { config } from "../config.js";
import { json, prune, readOnly, window } from "../format.js";
import type { Query } from "../http.js";
import { pisteRequest } from "../piste.js";

const SERVICE = "Judilibre (PISTE)";
const jl = <T = Record<string, unknown>>(path: string, query: Query, signal: AbortSignal) =>
  pisteRequest<T>(config.piste.judilibrePath, path, { service: SERVICE, query, signal });

const list = z.array(z.string()).optional();

export function registerJudilibre(server: McpServer) {
  server.registerTool(
    "judilibre_rechercher",
    {
      title: "Judilibre : rechercher des décisions",
      description:
        "Recherche plein texte dans les décisions de justice en open data (Cour de cassation, cours d'appel, tribunaux judiciaires, tribunaux de commerce). " +
        "Renvoie identifiant, juridiction, chambre, numéro de pourvoi, date, solution, publication, sommaire et passages surlignés. " +
        "Valeurs des filtres (type, theme, chamber, jurisdiction, location, publication, solution) : voir judilibre_taxonomie. " +
        "Texte intégral : judilibre_decision.",
      inputSchema: z.strictObject({
        query: z.string().min(2).describe("Termes recherchés"),
        operator: z.enum(["or", "and", "exact"]).default("and"),
        field: list.describe("Zones ciblées : expose, moyens, motivations, dispositif, annexes, sommaire, titrage…"),
        jurisdiction: list.describe("cc (Cour de cassation), ca, tj, tcom…"),
        chamber: list,
        type: list.describe("arret, qpc, ordonnance, saisie…"),
        theme: list,
        location: list,
        publication: list.describe("b (Bulletin), r (Rapport), l (Lettre), c (communiqué)…"),
        solution: list.describe("cassation, rejet, annulation, irrecevabilite…"),
        date_start: z.string().optional().describe("AAAA-MM-JJ"),
        date_end: z.string().optional(),
        sort: z.enum(["score", "scorepub", "date"]).default("scorepub"),
        order: z.enum(["asc", "desc"]).default("desc"),
        particularInterest: z.boolean().optional().describe("Uniquement les décisions présentant un intérêt particulier"),
        page: z.number().int().min(0).default(0).describe("Première page = 0"),
        page_size: z.number().int().min(1).max(50).default(10),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const d = await jl<{ total?: number; results?: unknown[]; next_page?: string }>(
        "/search",
        { ...a, resolve_references: true },
        ctx.mcpReq.signal,
      );
      return json(prune({ total: d.total, page: a.page, resultats: d.results, ...(d.next_page ? { suite: `Rappeler avec page=${a.page + 1}` } : {}) }));
    },
  );

  server.registerTool(
    "judilibre_decision",
    {
      title: "Judilibre : texte d'une décision",
      description:
        "Texte intégral et métadonnées d'une décision (identifiant issu de judilibre_rechercher). Texte renvoyé par fenêtres de 20 000 caractères (paramètre debut). " +
        "query permet de surligner des termes (zones repérées dans highlights).",
      inputSchema: z.strictObject({
        id: z.string().min(5),
        query: z.string().optional(),
        debut: z.number().int().min(0).default(0),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const d = await jl<Record<string, unknown>>("/decision", { id: a.id, query: a.query, resolve_references: true }, ctx.mcpReq.signal);
      const { text = "", ...meta } = d as { text?: string; id?: string };
      const w = window(String(text), a.debut);
      return json(prune({ ...(a.debut === 0 ? meta : { id: meta.id }), texte: w.extrait, suite: w.suite }));
    },
  );

  server.registerTool(
    "judilibre_taxonomie",
    {
      title: "Judilibre : nomenclatures",
      description:
        "Listes de valeurs utilisables comme filtres (id = type, jurisdiction, chamber, formation, publication, theme, solution, location, field…), " +
        "ou intitulé d'une clé (id + key), ou clé d'un intitulé (id + value). Sans id : liste des nomenclatures disponibles.",
      inputSchema: z.strictObject({
        id: z.string().optional(),
        key: z.string().optional(),
        value: z.string().optional(),
        context_value: z.string().optional().describe("Contexte requis par certaines listes (ex. juridiction pour chamber)"),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => json(prune(await jl("/taxonomy", a, ctx.mcpReq.signal))),
  );
}
