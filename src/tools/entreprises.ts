/**
 * API Recherche d'entreprises (DINUM) — https://recherche-entreprises.api.gouv.fr
 * Doc : https://recherche-entreprises.api.gouv.fr/openapi.json — accès libre, 7 req/s par IP.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { json, prune, readOnly } from "../format.js";
import { request } from "../http.js";

const BASE = "https://recherche-entreprises.api.gouv.fr";
const SERVICE = "Recherche d'entreprises";
// Champs obsolètes (OpenAPI), techniques ou redondants ; date_de_naissance retirée par minimisation (l'année est conservée).
const DROP = new Set([
  "geo_adresse", "geo_id", "date_mise_a_jour_insee", "date_mise_a_jour_rne", "coordonnees", "latitude", "longitude",
  "epci", "region", "commune", "date_de_naissance", "annee_tranche_effectif_salarie", "annee_categorie_entreprise",
]);

function compact(data: { results?: unknown[]; total_results?: number; page?: number; per_page?: number; total_pages?: number }) {
  const results = (data.results ?? []).map((r) => {
    const o = r as Record<string, unknown>;
    // Ne garder que les compléments (labels, statuts) à vrai ou renseignés.
    if (o.complements && typeof o.complements === "object") {
      o.complements = Object.fromEntries(Object.entries(o.complements).filter(([, v]) => v !== false && v !== null));
    }
    return prune(o, DROP);
  });
  return { total: data.total_results, page: data.page, par_page: data.per_page, pages: data.total_pages, resultats: results };
}

const commun = {
  page: z.number().int().min(1).default(1).describe("Page (1 = première)"),
  par_page: z.number().int().min(1).max(25).default(5).describe("Résultats par page (max 25)"),
  minimal: z.boolean().default(false).describe("true = réponse réduite (sans établissements, dirigeants, finances…)"),
  etablissements: z.number().int().min(1).max(100).default(3).describe("Nombre d'établissements correspondants renvoyés par entreprise"),
};

export function registerEntreprises(server: McpServer) {
  server.registerTool(
    "entreprises_rechercher",
    {
      title: "Rechercher une entreprise (Annuaire des entreprises)",
      description:
        "Recherche plein texte dans l'Annuaire des entreprises (base Sirene + RNE + labels) : dénomination, adresse, dirigeant, SIREN ou SIRET, avec filtres. " +
        "Renvoie identité, siège, dirigeants, finances publiées, conventions collectives (IDCC), labels (Qualiopi, RGE, ESS…), n° TVA. " +
        "Sans clé. Exclut les entreprises non diffusibles. Pour l'historique ou les variables Sirene détaillées, utiliser sirene_* (clé INSEE).",
      inputSchema: z.strictObject({
        q: z.string().min(1).optional().describe("Texte libre : nom, adresse, dirigeant, SIREN ou SIRET"),
        code_postal: z.string().optional().describe("Code(s) postal(aux), séparés par des virgules"),
        departement: z.string().optional().describe("Code(s) département, ex. '75' ou '2A,2B'"),
        activite_principale: z.string().optional().describe("Code(s) NAF/APE, ex. '69.20Z' (expertise comptable)"),
        nature_juridique: z.string().optional().describe("Code(s) catégorie juridique INSEE, ex. '5710' (SAS)"),
        etat_administratif: z.enum(["A", "C"]).optional().describe("A = active, C = cessée"),
        nom_personne: z.string().optional().describe("Nom d'un dirigeant ou élu"),
        prenoms_personne: z.string().optional(),
        filtres: z
          .record(z.string(), z.union([z.string(), z.boolean(), z.number()]))
          .optional()
          .describe("Autres filtres de l'API, ex. {\"est_qualiopi\": true, \"tranche_effectif_salarie\": \"11,12\", \"ca_min\": 1000000}"),
        ...commun,
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      if (!a.q && !a.filtres && !a.code_postal && !a.departement && !a.activite_principale && !a.nom_personne) {
        throw new Error("Fournir au moins q ou un filtre.");
      }
      const data = await request<Parameters<typeof compact>[0]>(`${BASE}/search`, {
        service: SERVICE,
        query: {
          q: a.q,
          code_postal: a.code_postal,
          departement: a.departement,
          activite_principale: a.activite_principale,
          nature_juridique: a.nature_juridique,
          etat_administratif: a.etat_administratif,
          nom_personne: a.nom_personne,
          prenoms_personne: a.prenoms_personne,
          page: a.page,
          per_page: a.par_page,
          minimal: a.minimal || undefined,
          limite_matching_etablissements: a.etablissements,
          ...Object.fromEntries(Object.entries(a.filtres ?? {}).map(([k, v]) => [k, String(v)])),
        },
        signal: ctx.mcpReq.signal,
      });
      return json(compact(data));
    },
  );

  server.registerTool(
    "entreprises_autour_point",
    {
      title: "Établissements autour d'un point GPS",
      description: "Liste les entreprises ayant un établissement dans un rayon (≤ 50 km) autour de coordonnées GPS, filtrable par code NAF. Sans clé.",
      inputSchema: z.strictObject({
        lat: z.number().min(-90).max(90),
        long: z.number().min(-180).max(180),
        rayon_km: z.number().positive().max(50).default(5),
        activite_principale: z.string().optional().describe("Code(s) NAF, ex. '56.10A'"),
        ...commun,
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const data = await request<Parameters<typeof compact>[0]>(`${BASE}/near_point`, {
        service: SERVICE,
        query: { lat: a.lat, long: a.long, radius: a.rayon_km, activite_principale: a.activite_principale, page: a.page, per_page: a.par_page, minimal: a.minimal || undefined, limite_matching_etablissements: a.etablissements },
        signal: ctx.mcpReq.signal,
      });
      return json(compact(data));
    },
  );
}
