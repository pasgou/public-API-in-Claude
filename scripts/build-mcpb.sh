#!/usr/bin/env bash
# Construit le bundle Claude Desktop : un seul fichier JS (esbuild, sans node_modules) + manifest + icône.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf mcpb/build && mkdir -p mcpb/build/server
npx esbuild src/index.ts --bundle --platform=node --target=node20 --format=esm \
  --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
  --outfile=mcpb/build/server/index.js --log-level=warning
cp mcpb/manifest.json mcpb/icon.png mcpb/build/
VERSION=$(node -p "require('./mcpb/manifest.json').version")
npx mcpb validate mcpb/build/manifest.json
npx mcpb pack mcpb/build "dist/api-publiques-fr-${VERSION}.mcpb"
echo "Bundle : dist/api-publiques-fr-${VERSION}.mcpb"
