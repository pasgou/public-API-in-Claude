/**
 * API Sirene 3.11 (INSEE) — https://api.insee.fr/api-sirene/3.11
 * Doc : portail-api.insee.fr (swagger + pages « Comment interroger l'API Sirene », « Recherche multicritère »).
 * Auth : en-tête X-INSEE-Api-Key-Integration. Quota open data : 30 requêtes/minute.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { config } from "../config.js";
import { json, prune, readOnly } from "../format.js";
import { request, type Query } from "../http.js";

const SERVICE = "API Sirene (INSEE)";
const NOTE_DIFFUSION =
  "Unités en diffusion partielle (statutDiffusion = P, art. R123-232-1 C. com.) : informations personnelles à ne pas rediffuser intégralement ni utiliser à des fins de prospection.";

async function sirene(path: string, query: Query, signal: AbortSignal) {
  return request<Record<string, unknown>>(`${config.insee.base}${path}`, {
    service: SERVICE,
    query: { ...query, masquerValeursNulles: true },
    headers: { "X-INSEE-Api-Key-Integration": config.insee.apiKey! },
    signal,
  });
}

/** Ne conserve que la période en cours sauf si l'historique est demandé. */
function trimPeriods(unit: unknown, historique: boolean): unknown {
  if (historique || !unit || typeof unit !== "object") return unit;
  const o = { ...(unit as Record<string, unknown>) };
  for (const key of ["periodesUniteLegale", "periodesEtablissement"]) {
    const p = o[key];
    if (Array.isArray(p) && p.length > 1) {
      o[key] = [p.find((x) => !(x as Record<string, unknown>).dateFin) ?? p[0]];
      o[`${key}_nombre`] = p.length;
    }
  }
  return o;
}

function hasPartial(data: unknown): boolean {
  return /"statutDiffusion(UniteLegale|Etablissement)":"P"/.test(JSON.stringify(data));
}

const out = (data: unknown) => json(prune(data), hasPartial(data) ? NOTE_DIFFUSION : undefined);

export function registerSirene(server: McpServer) {
  server.registerTool(
    "sirene_unite_legale",
    {
      title: "Sirene : unité légale (SIREN)",
      description:
        "Fiche INSEE d'une unité légale par SIREN (9 chiffres) : dénomination, catégorie juridique, APE, effectifs, état, ESS, etc. " +
        "Par défaut seule la période en cours est renvoyée ; historique=true pour toutes les périodes ; date=AAAA-MM-JJ pour l'état à une date.",
      inputSchema: z.strictObject({
        siren: z.string().regex(/^\d{9}$/, "SIREN = 9 chiffres"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("État à cette date (AAAA-MM-JJ)"),
        historique: z.boolean().default(false),
      }),
      annotations: readOnly,
    },
    async ({ siren, date, historique }, ctx) => {
      const d = await sirene(`/siren/${siren}`, { date }, ctx.mcpReq.signal);
      return out(trimPeriods(d.uniteLegale, historique));
    },
  );

  server.registerTool(
    "sirene_etablissement",
    {
      title: "Sirene : établissement (SIRET)",
      description:
        "Fiche INSEE d'un établissement par SIRET (14 chiffres) : adresse, APE, effectifs, siège ou non, état, données courantes de l'unité légale. " +
        "historique=true pour toutes les périodes ; date=AAAA-MM-JJ pour l'état à une date.",
      inputSchema: z.strictObject({
        siret: z.string().regex(/^\d{14}$/, "SIRET = 14 chiffres"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        historique: z.boolean().default(false),
      }),
      annotations: readOnly,
    },
    async ({ siret, date, historique }, ctx) => {
      const d = await sirene(`/siret/${siret}`, { date }, ctx.mcpReq.signal);
      return out(trimPeriods(d.etablissement, historique));
    },
  );

  server.registerTool(
    "sirene_rechercher",
    {
      title: "Sirene : recherche multicritère",
      description:
        "Recherche multicritère dans le répertoire Sirene (syntaxe INSEE). " +
        "Variables non historisées : `siren:3*`, `codeCommuneEtablissement:92046`, `codePostalEtablissement:75008`. " +
        "Variables historisées entourées de periode() : `periode(denominationUniteLegale:GAZ)`, `periode(activitePrincipaleUniteLegale:69.20Z AND etatAdministratifUniteLegale:A)`. " +
        "Opérateurs AND, OR, NOT ; joker * ; casse et accents ignorés. " +
        "Pour une recherche simple par nom, préférer entreprises_rechercher (sans quota).",
      inputSchema: z.strictObject({
        cible: z.enum(["unites_legales", "etablissements"]).describe("unites_legales (/siren) ou etablissements (/siret)"),
        q: z.string().min(2).describe("Requête multicritère INSEE"),
        champs: z.string().optional().describe("Champs à renvoyer, séparés par des virgules (réduit fortement la réponse)"),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        tri: z.string().optional().describe("Champs de tri, séparés par des virgules"),
        nombre: z.number().int().min(1).max(100).default(10),
        debut: z.number().int().min(0).default(0).describe("Rang du premier résultat (pagination)"),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const path = a.cible === "unites_legales" ? "/siren" : "/siret";
      const d = await sirene(path, { q: a.q, champs: a.champs, date: a.date, tri: a.tri, nombre: a.nombre, debut: a.debut }, ctx.mcpReq.signal);
      const list = (d.unitesLegales ?? d.etablissements ?? []) as unknown[];
      const header = d.header as { total?: number; debut?: number; nombre?: number } | undefined;
      const fin = (header?.debut ?? 0) + list.length;
      return out({
        total: header?.total,
        debut: header?.debut,
        resultats: list.map((u) => trimPeriods(u, false)),
        ...(header?.total && fin < header.total ? { suite: `Rappeler avec debut=${fin}` } : {}),
      });
    },
  );

  server.registerTool(
    "sirene_successions",
    {
      title: "Sirene : liens de succession",
      description:
        "Prédécesseurs et successeurs d'établissements (transferts, reprises). Ex. q=`siretEtablissementPredecesseur:<SIRET>` ou `siretEtablissementSuccesseur:<SIRET>`.",
      inputSchema: z.strictObject({
        q: z.string().min(2),
        nombre: z.number().int().min(1).max(100).default(20),
        debut: z.number().int().min(0).default(0),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const d = await sirene("/siret/liensSuccession", { q: a.q, nombre: a.nombre, debut: a.debut }, ctx.mcpReq.signal);
      return out({ total: (d.header as { total?: number })?.total, liens: d.liensSuccession });
    },
  );
}
