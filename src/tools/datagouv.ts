/**
 * data.gouv.fr — API catalogue v1 (https://www.data.gouv.fr/api/1, swagger.json) et API tabulaire
 * (https://tabular-api.data.gouv.fr, README datagouv/api-tabular). Accès libre en lecture.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { json, prune, readOnly } from "../format.js";
import { request } from "../http.js";

const API = "https://www.data.gouv.fr/api/1";
const TAB = "https://tabular-api.data.gouv.fr/api/resources";
const SERVICE = "data.gouv.fr";
const trunc = (s: unknown, n = 400) => (typeof s === "string" && s.length > n ? `${s.slice(0, n)}…` : s);

type Org = { name?: string; id?: string } | null;
type Resource = { id: string; title?: string; format?: string; url?: string; filesize?: number; last_modified?: string; type?: string };
type Dataset = {
  id: string; title: string; slug?: string; page?: string; description?: string; description_short?: string;
  organization?: Org; last_update?: string; frequency?: string; license?: string; tags?: string[]; resources?: Resource[];
};

const resume = (d: Dataset) => ({
  id: d.id, titre: d.title, organisation: d.organization?.name, mise_a_jour: d.last_update, frequence: d.frequency,
  licence: d.license, page: d.page, description: trunc(d.description_short || d.description, 300), nb_ressources: d.resources?.length,
});

export function registerDatagouv(server: McpServer) {
  server.registerTool(
    "datagouv_rechercher",
    {
      title: "data.gouv.fr : rechercher jeux de données ou API",
      description:
        "Recherche dans le catalogue national data.gouv.fr : jeux de données (datasets) ou API publiques référencées (dataservices, avec URL de base et documentation OpenAPI). " +
        "Détail d'un jeu et de ses fichiers : datagouv_jeu_de_donnees.",
      inputSchema: z.strictObject({
        q: z.string().min(2),
        type: z.enum(["datasets", "dataservices"]).default("datasets"),
        organisation: z.string().optional().describe("Identifiant d'organisation (filtre)"),
        page: z.number().int().min(1).default(1),
        par_page: z.number().int().min(1).max(50).default(10),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const d = await request<{ total: number; data: Array<Record<string, unknown>> }>(`${API}/${a.type}/`, {
        service: SERVICE,
        query: { q: a.q, organization: a.organisation, page: a.page, page_size: a.par_page },
        signal: ctx.mcpReq.signal,
      });
      const items =
        a.type === "datasets"
          ? d.data.map((x) => resume(x as unknown as Dataset))
          : d.data.map((x) => ({
              id: x.id, titre: x.title, organisation: (x.organization as Org)?.name, acces: x.access_type,
              url_base: x.base_api_url, doc_openapi: x.machine_documentation_url, doc: x.technical_documentation_url,
              limites: x.rate_limiting, description: trunc(x.description, 300),
            }));
      const fin = (a.page - 1) * a.par_page + items.length;
      return json(prune({ total: d.total, resultats: items, ...(fin < d.total ? { suite: `Rappeler avec page=${a.page + 1}` } : {}) }));
    },
  );

  server.registerTool(
    "datagouv_jeu_de_donnees",
    {
      title: "data.gouv.fr : détail d'un jeu de données",
      description:
        "Métadonnées d'un jeu de données (id ou slug) et liste de ses ressources (id, format, URL, taille, date). " +
        "Les ressources CSV/XLSX peuvent être interrogées avec datagouv_donnees_tabulaires (id de ressource).",
      inputSchema: z.strictObject({ id: z.string().min(3).describe("Identifiant ou slug du jeu de données") }),
      annotations: readOnly,
    },
    async ({ id }, ctx) => {
      const d = await request<Dataset>(`${API}/datasets/${encodeURIComponent(id)}/`, { service: SERVICE, signal: ctx.mcpReq.signal });
      return json(
        prune({
          ...resume(d),
          description: trunc(d.description, 2000),
          mots_cles: d.tags,
          ressources: d.resources?.map((r) => ({ id: r.id, titre: r.title, type: r.type, format: r.format, url: r.url, taille_octets: r.filesize, modifie: r.last_modified })),
        }),
      );
    },
  );

  server.registerTool(
    "datagouv_donnees_tabulaires",
    {
      title: "data.gouv.fr : interroger un fichier tabulaire",
      description:
        "Lit les lignes d'une ressource CSV/XLSX de data.gouv.fr via l'API tabulaire, avec filtres, tri, sélection de colonnes. " +
        "Filtres au format colonne__opérateur : exact, differs, contains, notcontains, in (valeurs séparées par des virgules), less, greater, strictly_less, strictly_greater, isnull, isnotnull ; tri : colonne__sort=asc|desc. " +
        "Ex. filtres={\"annee__exact\":\"2024\",\"montant__greater\":\"1000\"}. Sans filtre, page 1 pour découvrir les colonnes.",
      inputSchema: z.strictObject({
        ressource_id: z.string().uuid(),
        filtres: z.record(z.string(), z.string()).optional(),
        colonnes: z.string().optional().describe("Colonnes à renvoyer, séparées par des virgules"),
        page: z.number().int().min(1).default(1),
        par_page: z.number().int().min(1).max(50).default(20),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const d = await request<{ data: unknown[]; meta?: { total?: number }; links?: { next?: string | null } }>(`${TAB}/${a.ressource_id}/data/`, {
        service: "API tabulaire data.gouv.fr",
        query: { ...a.filtres, columns: a.colonnes, page: a.page, page_size: a.par_page },
        signal: ctx.mcpReq.signal,
      });
      return json({ total: d.meta?.total, page: a.page, lignes: d.data, ...(d.links?.next ? { suite: `Rappeler avec page=${a.page + 1}` } : {}) });
    },
  );
}
