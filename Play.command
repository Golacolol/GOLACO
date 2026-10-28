#!/bin/bash
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to start Argyle Football."
  echo "Install it from https://nodejs.org and try again."
  read -r -p "Press Enter to close."
  exit 1
fi
exec node scripts/play.mjs
