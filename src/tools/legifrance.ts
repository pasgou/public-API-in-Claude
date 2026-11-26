/**
 * API Légifrance (DILA) via PISTE — https://api.piste.gouv.fr/dila/legifrance/lf-engine-app
 * Doc : swagger « DILA - Légifrance 1.6.2.5 » référencé par data.gouv.fr (catalogue api.gouv).
 * Écart constaté : le swagger annonce le chemin /dila/legifrance-beta/lf-engine-app, qui répond 404 ;
 * le chemin /dila/legifrance/lf-engine-app répond (400 sans jeton) — c'est lui qui est utilisé.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { type Credentials, config } from "../config.js";
import { deepStripHtml, json, prune, readOnly, window } from "../format.js";
import { pisteRequest } from "../piste.js";

const SERVICE = "Légifrance (PISTE)";


const today = () => new Date().toISOString().slice(0, 10);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Date de consultation (AAAA-MM-JJ) ; défaut : aujourd'hui");

/** Choisit le service de consultation selon le préfixe de l'identifiant Légifrance. */
function consultRoute(id: string, d: string): { path: string; body: Record<string, unknown> } {
  const p = id.slice(0, 8);
  if (id.startsWith("LEGIARTI")) return { path: "/consult/getArticle", body: { id } };
  if (p === "LEGITEXT") return { path: "/consult/legiPart", body: { textId: id, date: d } };
  if (p === "JORFTEXT") return { path: "/consult/jorf", body: { textCid: id } };
  if (p === "JURITEXT" || p === "CETATEXT" || p === "CONSTEXT") return { path: "/consult/juri", body: { textId: id } };
  if (p === "KALICONT") return { path: "/consult/kaliCont", body: { id } };
  if (p === "KALITEXT") return { path: "/consult/kaliText", body: { id } };
  if (p === "ACCOTEXT") return { path: "/consult/acco", body: { id } };
  if (p === "CNILTEXT") return { path: "/consult/cnil", body: { textId: id } };
  throw new Error(
    `Préfixe d'identifiant non pris en charge : ${id}. Attendus : LEGIARTI, LEGITEXT, JORFTEXT, JURITEXT, CETATEXT, CONSTEXT, KALICONT, KALITEXT, ACCOTEXT, CNILTEXT.`,
  );
}

const FONDS = ["ALL", "CODE_ETAT", "CODE_DATE", "LODA_ETAT", "LODA_DATE", "JORF", "JURI", "CETAT", "CONSTIT", "KALI", "CIRC", "ACCO", "CNIL"] as const;

export function registerLegifrance(server: McpServer, creds: Credentials) {
  const lf = <T = Record<string, unknown>>(path: string, body: unknown, signal: AbortSignal) =>
    pisteRequest<T>(creds, config.legifrancePath, path, { service: SERVICE, method: "POST", json: body, signal });
  server.registerTool(
    "legifrance_rechercher",
    {
      title: "Légifrance : recherche",
      description:
        "Recherche dans les fonds Légifrance : codes (CODE_ETAT = version en vigueur, CODE_DATE = à une date), lois et décrets (LODA_*), JORF, " +
        "jurisprudence judiciaire (JURI), administrative (CETAT : Conseil d'État ET cours administratives d'appel), constitutionnelle (CONSTIT), conventions collectives (KALI), circulaires (CIRC), accords d'entreprise (ACCO), CNIL. " +
        "Renvoie titres, identifiants (à passer à legifrance_consulter), dates, état juridique et extraits. " +
        "Ex. : texte='crédit d'impôt recherche', fonds='CODE_ETAT', champ='ARTICLE'. Pour un article de code dont on connaît le numéro, utiliser legifrance_article.",
      inputSchema: z.strictObject({
        texte: z.string().min(2).describe("Mots ou expression recherchés"),
        fonds: z.enum(FONDS).default("ALL"),
        champ: z
          .enum(["ALL", "TITLE", "TEXTE", "ARTICLE", "NUM_ARTICLE", "NOR", "NUM", "NUM_AFFAIRE", "ECLI", "IDCC", "RAISON_SOCIALE", "MOTS_CLES", "ABSTRATS", "RESUMES"])
          .default("ALL")
          .describe("Champ interrogé"),
        type_recherche: z
          .enum(["TOUS_LES_MOTS_DANS_UN_CHAMP", "UN_DES_MOTS", "EXACTE", "AUCUN_DES_MOTS"])
          .default("TOUS_LES_MOTS_DANS_UN_CHAMP"),
        filtres: z
          .array(
            z.object({
              facette: z.string().describe("Ex. NATURE, DATE_SIGNATURE, DATE_VERSION, JURIDICTION_NATURE, TEXT_LEGAL_STATUS"),
              valeurs: z.array(z.string()).optional(),
              dates: z.object({ start: z.string(), end: z.string() }).optional(),
              singleDate: z.string().optional(),
            }),
          )
          .optional()
          .describe("Filtres Légifrance (facettes dépendant du fonds). Ex. [{\"facette\":\"NATURE\",\"valeurs\":[\"LOI\",\"DECRET\"]}]"),
        tri: z.string().optional().describe("Ex. PERTINENCE, SIGNATURE_DATE_DESC, DATE_DESC (dépend du fonds)"),
        page: z.number().int().min(1).default(1),
        par_page: z.number().int().min(1).max(50).default(10),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const body = {
        fond: a.fonds,
        recherche: {
          champs: [{ typeChamp: a.champ, operateur: "ET", criteres: [{ typeRecherche: a.type_recherche, valeur: a.texte, operateur: "ET" }] }],
          filtres: a.filtres ?? [],
          operateur: "ET",
          pageNumber: a.page,
          pageSize: a.par_page,
          sort: a.tri ?? "PERTINENCE",
          typePagination: "DEFAUT",
        },
      };
      const d = await lf<{ totalResultNumber?: number; results?: unknown[] }>("/search", body, ctx.mcpReq.signal);
      const fin = (a.page - 1) * a.par_page + (d.results?.length ?? 0);
      return json(
        prune(
          deepStripHtml({
            total: d.totalResultNumber,
            page: a.page,
            resultats: d.results,
            ...(d.totalResultNumber && fin < d.totalResultNumber ? { suite: `Rappeler avec page=${a.page + 1}` } : {}),
          }),
          new Set(["idAttachment", "sizeAttachment", "dossiersLegislatifs"]),
        ),
      );
    },
  );

  server.registerTool(
    "legifrance_article",
    {
      title: "Légifrance : article",
      description:
        "Texte d'un article, par l'une des trois voies : (1) id LEGIARTI ; (2) code_id LEGITEXT + numero (ex. numero='244 quater B') ; (3) eli (URI ELI ou alias). " +
        "Renvoie le texte en clair, l'état juridique et les dates de vigueur. Les identifiants de codes s'obtiennent avec legifrance_lister_codes.",
      inputSchema: z.strictObject({
        id: z.string().startsWith("LEGIARTI").optional(),
        code_id: z.string().startsWith("LEGITEXT").optional(),
        numero: z.string().optional().describe("Numéro d'article, avec code_id"),
        eli: z.string().optional().describe("Ex. /eli/decret/2021/7/13/PRMD2117108D/jo/article_1"),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      let d: unknown;
      if (a.id) d = await lf("/consult/getArticle", { id: a.id }, ctx.mcpReq.signal);
      else if (a.code_id && a.numero) d = await lf("/consult/getArticleWithIdAndNum", { id: a.code_id, num: a.numero }, ctx.mcpReq.signal);
      else if (a.eli) d = await lf("/consult/getArticleWithIdEliOrAlias", { idEliOrAlias: a.eli }, ctx.mcpReq.signal);
      else throw new Error("Fournir id, ou code_id + numero, ou eli.");
      return json(prune(deepStripHtml(d)));
    },
  );

  server.registerTool(
    "legifrance_consulter",
    {
      title: "Légifrance : consulter un texte",
      description:
        "Contenu d'un document Légifrance à partir de son identifiant : LEGITEXT (texte consolidé, à une date), JORFTEXT (JO), JURITEXT/CETATEXT/CONSTEXT (décision), " +
        "KALICONT/KALITEXT (convention collective), ACCOTEXT (accord d'entreprise), CNILTEXT, LEGIARTI (article). " +
        "Les textes longs sont renvoyés par fenêtres de 20 000 caractères (paramètre debut). Pour un code entier, partir de legifrance_table_matieres.",
      inputSchema: z.strictObject({
        id: z.string().min(8),
        date,
        debut: z.number().int().min(0).default(0).describe("Position de départ dans le texte (pagination)"),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const r = consultRoute(a.id, a.date ?? today());
      const d = await lf(r.path, r.body, ctx.mcpReq.signal);
      const text = JSON.stringify(prune(deepStripHtml(d)));
      const w = window(text, a.debut);
      return { content: [{ type: "text", text: w.suite ? `${w.extrait}\n[${w.suite}]` : w.extrait }] };
    },
  );

  server.registerTool(
    "legifrance_table_matieres",
    {
      title: "Légifrance : table des matières d'un code",
      description:
        "Plan d'un code (parties, livres, titres, chapitres, sections avec identifiants LEGISCTA et articles LEGIARTI) à une date. Identifiant du code : voir legifrance_lister_codes.",
      inputSchema: z.strictObject({
        code_id: z.string().startsWith("LEGITEXT"),
        date,
        debut: z.number().int().min(0).default(0),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const d = await lf("/consult/code/tableMatieres", { textId: a.code_id, date: a.date ?? today() }, ctx.mcpReq.signal);
      const w = window(JSON.stringify(prune(deepStripHtml(d))), a.debut);
      return { content: [{ type: "text", text: w.suite ? `${w.extrait}\n[${w.suite}]` : w.extrait }] };
    },
  );

  server.registerTool(
    "legifrance_lister_codes",
    {
      title: "Légifrance : liste des codes",
      description: "Liste des codes et de leurs identifiants LEGITEXT, filtrable par titre (ex. 'impôts', 'travail', 'commerce').",
      inputSchema: z.strictObject({
        nom: z.string().optional().describe("Partie du titre du code"),
        etats: z.array(z.enum(["VIGUEUR", "ABROGE", "VIGUEUR_DIFF"])).default(["VIGUEUR"]),
        page: z.number().int().min(1).default(1),
        par_page: z.number().int().min(1).max(100).default(50),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const d = await lf("/list/code", { codeName: a.nom, states: a.etats, pageNumber: a.page, pageSize: a.par_page, sort: "TITLE_ASC" }, ctx.mcpReq.signal);
      return json(prune(d));
    },
  );

  server.registerTool(
    "legifrance_convention_collective",
    {
      title: "Légifrance : convention collective par IDCC",
      description:
        "Conteneur d'une convention collective à partir de son numéro IDCC : titre, textes de base, avenants, accords, avec identifiants KALITEXT. " +
        "L'IDCC d'une entreprise s'obtient via entreprises_rechercher (liste_idcc).",
      inputSchema: z.strictObject({
        idcc: z.string().regex(/^\d{1,4}$/),
        debut: z.number().int().min(0).default(0),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const d = await lf("/consult/kaliContIdcc", { id: a.idcc }, ctx.mcpReq.signal);
      const w = window(JSON.stringify(prune(deepStripHtml(d))), a.debut);
      return { content: [{ type: "text", text: w.suite ? `${w.extrait}\n[${w.suite}]` : w.extrait }] };
    },
  );
}
