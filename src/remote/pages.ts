/** Pages HTML du serveur distant : accueil (installation dans Claude) et connexion (saisie et test des identifiants). */
import type { Credentials } from "../config.js";
import type { Check } from "./check.js";

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const CSS = `
:root{--bg:#f6f7f9;--card:#fff;--text:#1b1f24;--muted:#5b6470;--line:#dde1e6;--accent:#1f4fa3;--accent-text:#fff;--ok:#1d7a3c;--ko:#b42318;--soft:#eef3fb}
@media (prefers-color-scheme:dark){:root{--bg:#111418;--card:#1a1e24;--text:#e7eaee;--muted:#9aa4b0;--line:#2c323a;--accent:#7aa5ff;--accent-text:#0d1117;--ok:#5cc58a;--ko:#ff8a80;--soft:#1d2633}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px 48px}h1{font-size:1.6rem;margin:0 0 4px}h2{font-size:1.1rem;margin:28px 0 8px}
.sub{color:var(--muted);margin:0 0 24px}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:20px;margin:16px 0}
label{display:block;font-weight:600;margin:14px 0 4px}input[type=text],input[type=password]{width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--text);font:inherit}
.hint{color:var(--muted);font-size:.9rem;margin:4px 0 0}.row{display:flex;gap:8px;align-items:center;margin-top:12px}.row label{margin:0;font-weight:400}
.actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:24px}button{font:inherit;padding:10px 18px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text);cursor:pointer}
button.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-text);font-weight:600}button.link{border:none;background:none;color:var(--muted);text-decoration:underline}
table{width:100%;border-collapse:collapse;font-size:.95rem}td,th{text-align:left;padding:8px 6px;border-bottom:1px solid var(--line);vertical-align:top}td:not(:last-child){white-space:nowrap}td:last-child{overflow-wrap:anywhere}
.ok{color:var(--ok);font-weight:600}.ko{color:var(--ko);font-weight:600}.err{border-color:var(--ko);color:var(--ko)}
code,.url{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.9rem;background:var(--soft);padding:2px 6px;border-radius:6px;word-break:break-all}
.url{display:block;padding:10px 12px;margin:8px 0}a{color:var(--accent)}ol{padding-left:20px}footer{color:var(--muted);font-size:.85rem;margin-top:32px}
`;

const layout = (title: string, body: string) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)}</title><style>${CSS}</style></head><body><main>${body}
<footer>Outil indépendant, non édité par les administrations concernées. Les identifiants saisis sont chiffrés dans vos jetons de connexion ; le serveur ne les conserve pas.</footer></main></body></html>`;

const MODULES = `<table><tr><th>Module</th><th>Accès</th></tr>
<tr><td>Annuaire des entreprises, BOFiP-Impôts, data.gouv.fr</td><td>sans identifiant</td></tr>
<tr><td>Sirene (INSEE)</td><td>clé API INSEE</td></tr>
<tr><td>Légifrance, Judilibre</td><td>application PISTE (Client ID + Secret)</td></tr></table>`;

export function homePage(mcpUrl: string) {
  return layout(
    "API publiques françaises",
    `<h1>API publiques françaises pour Claude</h1><p class="sub">Légifrance, Judilibre, BOFiP, Sirene, Annuaire des entreprises et data.gouv.fr, avec citation des sources officielles.</p>
<div class="card"><h2 style="margin-top:0">Ajouter le connecteur dans Claude</h2>
<ol><li>Claude (web ou Desktop) → <b>Paramètres → Connecteurs → Ajouter un connecteur personnalisé</b>.</li>
<li>Nom : <code>API publiques FR</code> ; URL du serveur :<span class="url">${esc(mcpUrl)}</span></li>
<li>Laisser l'option d'identification proposée par défaut, puis <b>Ajouter</b> et <b>Se connecter</b>.</li>
<li>La page de connexion de ce serveur s'ouvre : saisir les identifiants souhaités (facultatifs), <b>Tester</b>, puis <b>Autoriser</b>.</li></ol>
<p class="hint">Offres Team / Enterprise : l'ajout d'un connecteur personnalisé est réservé à un propriétaire de l'organisation ; chaque membre se connecte ensuite avec ses propres identifiants.</p></div>
<div class="card"><h2 style="margin-top:0">Modules</h2>${MODULES}
<p class="hint">Obtenir les identifiants : <a href="https://portail-api.insee.fr/" rel="noopener">portail-api.insee.fr</a> (application « simple », souscription API Sirene, plan Public) ; <a href="https://piste.gouv.fr/" rel="noopener">piste.gouv.fr</a> (application PRODUCTION, CGU Légifrance et JUDILIBRE acceptées avant la souscription).</p></div>`,
  );
}

export function authorizePage(o: { form: string; client: string; values?: Credentials; checks?: Check[]; error?: string }) {
  const v = o.values ?? {};
  const checks = o.checks?.length
    ? `<div class="card"><h2 style="margin-top:0">Résultat du test</h2><table>${o.checks
        .map((c) => `<tr><td>${esc(c.module)}</td><td class="${c.ok ? "ok" : "ko"}">${c.ok ? "OK" : "Échec"}</td><td>${esc(c.message)}</td></tr>`)
        .join("")}</table></div>`
    : o.values && !o.error
      ? `<div class="card"><p style="margin:0">Aucun identifiant saisi : seuls les modules sans identifiant seront disponibles.</p></div>`
      : "";
  return layout(
    "Connexion – API publiques françaises",
    `<h1>Connexion</h1><p class="sub">Demande d'accès de <b>${esc(o.client)}</b> au serveur « API publiques françaises ».</p>
${o.error ? `<div class="card err">${esc(o.error)}</div>` : ""}${checks}
<form method="post" action="/authorize" autocomplete="off"><input type="hidden" name="form" value="${esc(o.form)}">
<div class="card"><h2 style="margin-top:0">Sirene (INSEE) — facultatif</h2>
<label for="insee">Clé API</label><input id="insee" name="insee_api_key" type="password" value="${esc(v.inseeApiKey)}" spellcheck="false">
<p class="hint">portail-api.insee.fr → Applications → votre application → Souscriptions → API Sirene.</p></div>
<div class="card"><h2 style="margin-top:0">Légifrance et Judilibre (PISTE) — facultatif</h2>
<label for="pid">Client ID</label><input id="pid" name="piste_client_id" type="text" value="${esc(v.pisteClientId)}" spellcheck="false">
<label for="psec">Client Secret</label><input id="psec" name="piste_client_secret" type="password" value="${esc(v.pisteClientSecret)}" spellcheck="false">
<div class="row"><input id="psb" name="piste_sandbox" type="checkbox"${v.pisteSandbox ? " checked" : ""}><label for="psb">Identifiants de bac à sable (SANDBOX)</label></div>
<p class="hint">piste.gouv.fr → application PRODUCTION → Identifiants OAuth. Les CGU de Légifrance et JUDILIBRE doivent être acceptées avant la souscription.</p></div>
<div class="card"><p style="margin:0"><b>Toujours disponibles, sans identifiant :</b> Annuaire des entreprises, BOFiP-Impôts, data.gouv.fr.</p></div>
<div class="actions"><button class="primary" name="action" value="autoriser">Autoriser</button><button name="action" value="tester">Tester les identifiants</button><button class="link" name="action" value="refuser" formnovalidate>Refuser</button></div>
</form>`,
  );
}

export function errorPage(message: string) {
  return layout("Erreur – API publiques françaises", `<h1>Connexion impossible</h1><div class="card err">${esc(message)}</div>`);
}
