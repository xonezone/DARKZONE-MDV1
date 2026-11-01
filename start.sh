#!/usr/bin/env bash
# Dark Zone MD - start the bot with your .env settings loaded.
# The bot does not read .env by itself, so this script does it.
set -e
cd "$(dirname "$0")"
if [ ! -f .env ]; then
  echo "No .env file found. Run: cp .env.example .env   then fill it in."
  exit 1
fi
set -a
. ./.env
set +a
exec pnpm --filter @workspace/api-server run start
