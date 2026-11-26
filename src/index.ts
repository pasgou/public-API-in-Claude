#!/usr/bin/env node
/**
 * Entrée locale (stdio) : Claude Desktop via bundle .mcpb, Claude Code via `claude mcp add`.
 * Identifiants lus dans l'environnement. Version distante : src/remote/main.ts.
 */
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { credentialsFromEnv } from "./config.js";
import { createServer, VERSION } from "./server.js";
import { modules } from "./tools/statut.js";

const creds = credentialsFromEnv();
serveStdio(() => createServer(creds));
console.error(`api-publiques-fr ${VERSION} (stdio) — modules actifs : ${modules(creds).filter((m) => m.actif).map((m) => m.module).join(", ")}`);
