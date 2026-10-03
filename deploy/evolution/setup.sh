#!/usr/bin/env bash
# Creates .env with fresh random secrets. Usage: ./setup.sh evolution.yourdomain.com
set -euo pipefail
cd "$(dirname "$0")"
DOMAIN="${1:-}"
[ -n "$DOMAIN" ] || { echo "Usage: ./setup.sh <domain>   (a DNS A record for it must point to this server)"; exit 1; }
[ ! -e .env ] || { echo ".env already exists: delete it first if you really want new secrets."; exit 1; }
umask 077
APIKEY="$(openssl rand -hex 32)"
cat > .env <<ENV
EVOLUTION_DOMAIN=$DOMAIN
AUTHENTICATION_API_KEY=$APIKEY
POSTGRES_DB=evolution
POSTGRES_USER=evolution
POSTGRES_PASSWORD=$(openssl rand -hex 24)
ENV
echo "Done. .env created (permissions 600)."
echo
echo "Server URL ........ https://$DOMAIN"
echo "Global API key .... $APIKEY"
echo
echo "Next: docker compose up -d   (first start takes a minute; HTTPS needs ports 80/443 open)"
echo "Keep the API key private: it can create and delete every WhatsApp instance on this server."
