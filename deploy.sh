#!/usr/bin/env bash
# Deploy kart to https://kart.akwiat.com (static site served by Caddy via radify).
set -euo pipefail
cd "$(dirname "$0")"
bun install --frozen-lockfile
bun run build                      # vite -> dist/
~/radify/bin/radify deploy kart dist
