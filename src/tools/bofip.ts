/**
 * BOFiP-Impôts — jeu de données « bofip-vigueur » (DGFiP) publié sur data.economie.gouv.fr (Opendatasoft, Explore API v2.1).
 * Champs : type, titre, debut_de_validite, serie, division, identifiant_juridique, permalien, contenu, contenu_html.
 * Accès libre, Licence Ouverte 2.0. Contient uniquement les publications EN VIGUEUR.
 */
import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { json, prune, readOnly, stripHtml, window } from "../format.js";
import { request } from "../http.js";

const BASE = "https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/bofip-vigueur/records";
const SERVICE = "BOFiP (data.economie.gouv.fr)";
const META = "type,titre,identifiant_juridique,debut_de_validite,serie,division,permalien";
/** Le champ « contenu » colle les n° de paragraphe au texte ; on part de contenu_html en marquant chaque paragraphe « § n ». */
function bofipText(html: string): string {
  const marked = html
    .replace(/<p[^>]*>\s*(?:<strong>)?\s*(\d+)\s*(?:<\/strong>)?\s*<\/p>/g, "\n§ $1\n")
    .replace(/<li[^>]*>/g, "\n- ");
  return stripHtml(marked);
}
const norm = (t: string) =>
  t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const quote = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export function registerBofip(server: McpServer) {
  server.registerTool(
    "bofip_rechercher",
    {
      title: "BOFiP : rechercher la doctrine fiscale",
      description:
        "Recherche plein texte dans les publications BOFiP-Impôts en vigueur (commentaires, rescrits, actualités). " +
        "Renvoie titre, identifiant (BOI-…), date de début de validité, série, division, permalien. Texte : bofip_document. " +
        "Ex. texte='crédit d'impôt recherche', serie='BIC'. Séries : IR, IS, BIC, BNC, BA, TVA, RFPI, RPPM, ENR, CF, IF, TCA, CVAE…",
      inputSchema: z.strictObject({
        texte: z.string().min(2),
        serie: z.string().optional(),
        division: z.string().optional().describe("Ex. RICI, CHG, BASE"),
        type: z.enum(["Contenu", "Actualité"]).optional(),
        limite: z.number().int().min(1).max(50).default(10),
        decalage: z.number().int().min(0).default(0),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const where = [`search(${quote(a.texte)})`];
      if (a.serie) where.push(`serie=${quote(a.serie)}`);
      if (a.division) where.push(`division=${quote(a.division)}`);
      if (a.type) where.push(`type=${quote(a.type)}`);
      // L'API renvoie les résultats sans tri par pertinence : on reclasse les 100 premiers selon la présence
      // des mots recherchés dans le titre (puis Contenu avant Actualité), et on pagine localement dans cette fenêtre.
      const fenetre = a.decalage < 100;
      const d = await request<{ total_count: number; results: Array<Record<string, string>> }>(BASE, {
        service: SERVICE,
        query: { select: META, where: where.join(" AND "), limit: fenetre ? 100 : a.limite, offset: fenetre ? 0 : a.decalage },
        signal: ctx.mcpReq.signal,
      });
      let results = d.results;
      if (fenetre) {
        const mots = norm(a.texte).split(" ").filter((m) => m.length > 2);
        const score = (r: Record<string, string>) =>
          mots.filter((m) => norm(r.titre ?? "").includes(m)).length * 2 + (r.type === "Contenu" ? 1 : 0);
        results = results
          .map((r, i) => ({ r, i, s: score(r) }))
          .sort((x, y) => y.s - x.s || x.i - y.i)
          .map((x) => x.r)
          .slice(a.decalage, a.decalage + a.limite);
      }
      const fin = a.decalage + results.length;
      return json(prune({ total: d.total_count, resultats: results, ...(fin < d.total_count ? { suite: `Rappeler avec decalage=${fin}` } : {}) }));
    },
  );

  server.registerTool(
    "bofip_document",
    {
      title: "BOFiP : texte d'une publication",
      description:
        "Texte d'une publication BOFiP en vigueur par identifiant juridique (ex. BOI-BIC-RICI-10-10). Renvoie métadonnées et contenu (paragraphes numérotés « § n ») par fenêtres de 20 000 caractères (debut). " +
        "Citer avec l'identifiant, la date de début de validité et le permalien.",
      inputSchema: z.strictObject({
        identifiant: z.string().min(4).describe("Identifiant juridique BOI-… ou ACTU-…"),
        debut: z.number().int().min(0).default(0),
      }),
      annotations: readOnly,
    },
    async (a, ctx) => {
      const d = await request<{ results: Array<Record<string, string>> }>(BASE, {
        service: SERVICE,
        query: { select: `${META},contenu_html`, where: `identifiant_juridique=${quote(a.identifiant)}`, limit: 5 },
        signal: ctx.mcpReq.signal,
      });
      if (!d.results.length) throw new Error(`Aucune publication en vigueur « ${a.identifiant} ». Vérifier l'identifiant avec bofip_rechercher.`);
      const { contenu_html = "", ...meta } = d.results[0];
      const w = window(bofipText(contenu_html), a.debut);
      return json(prune({ ...meta, contenu: w.extrait, suite: w.suite, autres_versions: d.results.length > 1 ? d.results.length - 1 : undefined }));
    },
  );
}
