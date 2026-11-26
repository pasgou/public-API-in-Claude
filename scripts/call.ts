/** Appel unitaire d'un outil pour le débogage : npx tsx scripts/call.ts <outil> '<json>' (SERVER=chemin optionnel). */
import { Client } from "@modelcontextprotocol/client";
import { getDefaultEnvironment, StdioClientTransport } from "@modelcontextprotocol/client/stdio";
const [name, args] = process.argv.slice(2);
const c = new Client({ name: "x", version: "1" });
await c.connect(new StdioClientTransport({ command: "node", args: [process.env.SERVER ?? "dist/index.js"], env: { ...getDefaultEnvironment(), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => /PROXY|NODE_|INSEE|PISTE/.test(k))) as Record<string,string> } , stderr: "ignore"}));
const r = await c.callTool({ name, arguments: JSON.parse(args) });
console.log((r.isError ? "ERROR " : "") + (r.content as any[]).map((x) => x.text).join(""));
await c.close();
